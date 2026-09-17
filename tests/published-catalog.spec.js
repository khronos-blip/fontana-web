const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const path=require('node:path');

test('API pagina historial, ventas, pedidos y gastos sin omitir el siguiente bloque',()=>{
  const moduleUrl=pathToFileURL(path.resolve('backend/src/worker.js')).href;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
    import worker from ${JSON.stringify(moduleUrl)};
    const reads=[];
    const DB={prepare(sql){let args=[];const q={bind(...values){args=values;return q},async first(){return {username:"audit",role:"owner",expires_at:9999999999}},async all(){
      reads.push({sql,args});
      if(sql.includes("FROM audit_log WHERE"))return {results:Array.from({length:120},(_,i)=>({id:120-i})).filter(x=>x.id<args[0]).slice(0,100)};
      if(sql.includes("FROM sales ORDER BY"))return {results:Array.from({length:1001},(_,i)=>({id:"s"+i,status:"pending"})).slice(args[0],args[0]+1000)};
      if(sql.includes("FROM stock_orders ORDER BY"))return {results:Array.from({length:501},(_,i)=>({id:"o"+i,status:"expired"})).slice(args[0],args[0]+500)};
      if(sql.includes("FROM expenses WHERE"))return {results:Array.from({length:1001},(_,i)=>({id:"e"+i,status:"void"})).slice(args.at(-1),args.at(-1)+1000)};
      return {results:[]};
    }};return q}};
    const get=async p=>{const r=await worker.fetch(new Request("https://api.fontanasingluten.com/v1/admin/"+p,{headers:{Cookie:"fontana_admin_session=isolated-test"}}),{DB});if(r.status!==200)throw Error(await r.text());return r.json()};
    const a=await get("activity"),b=await get("activity?cursor="+a.nextCursor);
    const results={activity:[a.items.length,b.items.length,b.nextCursor]};
    for(const path of ["sales","orders","expenses"]){const x=await get(path),y=await get(path+"?offset="+x.nextOffset);results[path]=[x.items.length,y.items.length,y.nextOffset];}
    console.log(JSON.stringify(results));
  `],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}}));
  expect(result.activity).toEqual([100,20,null]);
  expect(result.sales).toEqual([1000,1,null]);
  expect(result.orders).toEqual([500,1,null]);
  expect(result.expenses).toEqual([1000,1,null]);
});

test('Fichas y sitemap usan cada revisión publicada, eliminaciones e imágenes reales',()=>{
  const moduleUrl=pathToFileURL(path.resolve('functions/[[path]].js')).href;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
    import {onRequest} from ${JSON.stringify(moduleUrl)};
    let payload={revision:109,state:{operations:{verified:true},products:[{id:"nuevo-real",category:"cakes",name:"Producto real",price:55,image:"https://api.fontanasingluten.com/v1/images/real",ingredients:"Confirmados",status:"available",glutenFree:false,lactoseFree:false}],builders:{}}};
    globalThis.fetch=async()=>Response.json(payload);
    const get=path=>onRequest({request:new Request("https://fontanasingluten.com"+path),next:()=>new Response("asset")});
    const first=await get("/productos/nuevo-real/");const firstHtml=await first.text();
    payload.revision=110;payload.state.products[0].price=63;
    const second=await get("/productos/nuevo-real/");const secondHtml=await second.text();
    const sitemap=await (await get("/sitemap.xml")).text();
    payload.state.products[0].visible=false;
    const hidden=await get("/productos/nuevo-real/");
    globalThis.fetch=async()=>{throw Error("offline")};
    const offline=await get("/productos/nuevo-real/");
    console.log(JSON.stringify({firstStatus:first.status,firstHtml,revision:second.headers.get("x-fontana-catalog-revision"),secondHtml,sitemap,hidden:hidden.status,offline:offline.status,offlineHtml:await offline.text()}));
  `],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}}));
  expect(result.firstStatus).toBe(200);
  expect(result.firstHtml).toContain('"price":55');
  expect(result.firstHtml).toContain('src="https://api.fontanasingluten.com/v1/images/real"');
  expect(result.firstHtml).not.toContain('Sin lactosa');
  expect(result.revision).toBe('110');
  expect(result.secondHtml).toContain('"price":63');
  expect(result.sitemap).toContain('/productos/nuevo-real/');
  expect(result.hidden).toBe(404);
  expect(result.offline).toBe(503);
  expect(result.offlineHtml).not.toContain('"price":');
});
