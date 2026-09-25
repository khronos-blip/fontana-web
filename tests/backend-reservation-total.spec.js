const {test,expect}=require('@playwright/test');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');

const workerPath=path.resolve(__dirname,'../backend/src/worker.js');
const source=readFileSync(workerPath,'utf8');
const reserveSource=source.slice(source.indexOf('async function reserveOrder('),source.indexOf('async function getImage('));
function workerCheck(script) {
  // A native module child avoids Playwright transforming the Worker imports.
  return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
    const worker=await import(${JSON.stringify(pathToFileURL(workerPath).href)});
    const reserveSource=${JSON.stringify(reserveSource)};
    ${requestBody.toString()}
    ${reservationHarness.toString()}
    ${script}
  `],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}}));
}

function requestBody(total={expectedTotalCents:1000}) {
  return {clientKey:'isolated-total-test-12345',items:[{kind:'product',productId:'torta-test',quantity:1}],customer:{name:'Prueba',phone:'04120000000',requestedDate:'2026-12-30'},...total};
}

function reservationHarness({existing=null,price=10,race=false}={}) {
  const writes=[], reads=[];
  let reservationLookups=0;
  const state={products:[{id:'torta-test',name:'Torta de prueba',price,status:'available'}],builders:{}};
  const dependencies={
    expireReservations:async()=>{},
    json:(payload,status=200)=>({payload,status}),
    reservationReplay:worker.reservationReplay,
    reservationPayloadIdentity:worker.reservationPayloadIdentity,
    publishedState:async()=>state,
    syncInventoryDefinitions:async()=>[],
    loadInventoryMap:async()=>new Map(),
    readOperationalState:async()=>({electricityEnabled:true}),
    applyPublicAvailability:value=>value,
    resolveReservationCart:worker.resolveReservationCart,
    sha256:async()=>'isolated-client-hash',
    isIsoDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value),
    preorderDateViolation:worker.preorderDateViolation,
    reservationOrderCode:()=>'FNT-PRUEBA',
    RESERVATION_TTL_SECONDS:1800
  };
  const reserve=new Function(...Object.keys(dependencies),`${reserveSource}\nreturn reserveOrder;`)(...Object.values(dependencies));
  const env={DB:{
    prepare(sql){
      const statement={sql,values:[],bind(...values){statement.values=values;return statement;},async first(){reads.push(sql);if(sql.includes('WHERE client_key')){reservationLookups++;return race&&reservationLookups===1?null:existing;}return {count:0};}};
      return statement;
    },
    async batch(statements){if(race)throw new Error('UNIQUE constraint failed: stock_orders.client_key');writes.push(...statements);return [];}
  }};
  return {writes,reads,send:body=>reserve(new Request('https://local.test/v1/orders/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env)};
}

test('Cambios de precio entre refrescar el catálogo y reservar requieren nueva aceptación sin reservar',async()=>{
  const results=workerCheck(`const results=[];for(const price of [9,11]){const harness=reservationHarness({price});results.push({response:await harness.send(requestBody()),writes:harness.writes});}process.stdout.write(JSON.stringify(results));`);
  for(const result of results) {
    expect(result.response).toEqual({status:409,payload:{code:'pricing_changed',error:'El precio cambió. Revisa el total actualizado antes de confirmar.'}});
    expect(result.writes).toEqual([]);
  }
});

test('Total esperado exige entero seguro no negativo; rechaza null, texto y fracciones antes de consultar reservas',async()=>{
  const results=workerCheck(`const results=[];for(const expectedTotalCents of [null,'1000',true,-1,1000.5,Number.MAX_SAFE_INTEGER+1]){const harness=reservationHarness();results.push({response:await harness.send(requestBody({expectedTotalCents})),reads:harness.reads,writes:harness.writes});}process.stdout.write(JSON.stringify(results));`);
  for(const result of results) {
    expect(result.response.status).toBe(400);
    expect(result.reads).toEqual([]);
    expect(result.writes).toEqual([]);
  }
});

test('Total aceptado, cero explícito y clientes antiguos sin campo conservan la reserva normal',async()=>{
  const results=workerCheck(`const results=[];for(const [price,total] of [[10,{expectedTotalCents:1000}],[0,{expectedTotalCents:0}],[10,{}]]){const harness=reservationHarness({price});results.push({price,response:await harness.send(requestBody(total)),writes:harness.writes});}process.stdout.write(JSON.stringify(results));`);
  for(const result of results) {
    expect(result.response.status).toBe(201);
    expect(result.response.payload.totalCents).toBe(Math.round(result.price*100));
    expect(result.writes).toHaveLength(1);
    expect(result.writes[0].sql).toContain('INSERT INTO stock_orders');
  }
});

test('Reintento idempotente conserva la reserva original y rechaza una aceptación de otro total',async()=>{
  const result=workerCheck(`
    const body=requestBody();
    const existing={id:'existing-test',orderCode:'FNT-ORIGINAL',status:'reserved',expiresAt:Math.floor(Date.now()/1000)+600,totalCents:1000,snapshotJson:JSON.stringify({items:body.items,customer:body.customer})};
    const before=JSON.stringify(existing),harness=reservationHarness({existing,price:11});
    const changed=await harness.send({...body,expectedTotalCents:1100});
    const accepted=await harness.send(body),legacy=await harness.send(requestBody({}));
    process.stdout.write(JSON.stringify({changed,accepted,legacy,writes:harness.writes,unchanged:JSON.stringify(existing)===before}));
  `);
  expect(result.changed.status).toBe(409);
  expect(result.changed.payload.code).toBe('idempotency_conflict');
  expect(result.changed.payload.activeReservation).toBe(true);
  expect(result.accepted.status).toBe(200);
  expect(result.accepted.payload).toMatchObject({id:'existing-test',totalCents:1000,reused:true});
  expect(result.accepted.payload).not.toHaveProperty('snapshotJson');
  expect(result.legacy.status).toBe(200);
  expect(result.writes).toEqual([]);
  expect(result.unchanged).toBe(true);
});

test('Colisión simultánea de la clave conserva el total de la reserva ganadora',async()=>{
  const results=workerCheck(`
    const body=requestBody(),results=[];
    const existing={id:'winning-reservation',orderCode:'FNT-ORIGINAL',status:'reserved',expiresAt:Math.floor(Date.now()/1000)+600,totalCents:1000,snapshotJson:JSON.stringify({items:body.items,customer:body.customer})};
    for(const price of [10,11]){const harness=reservationHarness({existing,price,race:true});results.push({response:await harness.send({...body,expectedTotalCents:price*100}),writes:harness.writes});}
    process.stdout.write(JSON.stringify(results));
  `);
  expect(results[0].response.status).toBe(200);
  expect(results[0].response.payload).toMatchObject({id:'winning-reservation',totalCents:1000,reused:true});
  expect(results[1].response.status).toBe(409);
  expect(results[1].response.payload.code).toBe('idempotency_conflict');
  expect(results.every(result=>result.writes.length===0)).toBe(true);
});
