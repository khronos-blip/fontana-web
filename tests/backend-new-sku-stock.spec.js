const {test,expect}=require('@playwright/test');
const {DatabaseSync}=require('node:sqlite');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const repository=path.resolve(__dirname,'..');
const source=readFileSync(path.join(repository,'backend/src/worker.js'),'utf8');
const inventoryFunctions=source.slice(source.indexOf('function stockSlug('),source.indexOf('async function loadInventoryMap('));
let syncInventoryDefinitions;
test.beforeAll(async()=>{
  const {deriveBuilderInventoryDefinitions}=await import(pathToFileURL(path.join(repository,'backend/src/public-availability.mjs')).href);
  // Exercise the actual Worker functions and SQL against in-memory SQLite.
  // D1's binding/batch interface is adapted below; no network or real database.
  syncInventoryDefinitions=new Function('deriveBuilderInventoryDefinitions',`${inventoryFunctions}\nreturn syncInventoryDefinitions;`)(deriveBuilderInventoryDefinitions);
});

function database() {
  const db=new DatabaseSync(':memory:');
  const migration=readFileSync(path.join(repository,'backend/migrations/0004_central_inventory.sql'),'utf8');
  db.exec(migration.slice(0,migration.indexOf('CREATE TABLE IF NOT EXISTS stock_orders')));
  const adapter={
    prepare(sql){
      let values=[];
      const statement={
        bind(...args){values=args;return statement;},
        all(){return {results:db.prepare(sql).all(...values)};},
        run(){return db.prepare(sql).run(...values);}
      };
      return statement;
    },
    async batch(statements){
      db.exec('BEGIN');
      try{const results=statements.map(statement=>statement.run());db.exec('COMMIT');return results;}
      catch(error){db.exec('ROLLBACK');throw error;}
    }
  };
  return {db,env:{DB:adapter},rows:()=>db.prepare('SELECT * FROM inventory_items ORDER BY sku').all().map(row=>({...row}))};
}

const catalog=products=>({products,builders:{}});
const product=extra=>({id:'producto-prueba',name:'Producto de prueba',price:10,stockQuantity:7,...extra});

test('Opciones nuevas o renombradas de un producto existente no heredan cantidades históricas',async()=>{
  const fixture=database();
  try{
    await syncInventoryDefinitions(fixture.env,catalog([product()]),'alta');
    fixture.db.prepare('UPDATE inventory_items SET on_hand=5,reserved=2,updated_by=?').run('inventario-real');
    const next=catalog([product({stockQuantity:99,sizes:[{name:'Nueva presentación',stockQuantity:80}],variants:[{name:'Nuevo sabor',stockQuantity:60}]})]);
    await syncInventoryDefinitions(fixture.env,next,'editor');
    const rows=fixture.rows();
    expect(rows.find(row=>row.sku==='product:producto-prueba:base:base')).toMatchObject({on_hand:5,reserved:2,track_stock:1,updated_by:'inventario-real'});
    expect(rows.find(row=>row.sku==='product:producto-prueba:nueva-presentacion:nuevo-sabor')).toMatchObject({on_hand:0,reserved:0,track_stock:0,active:1});
    await syncInventoryDefinitions(fixture.env,catalog([product({variants:[{name:'Sabor renombrado',stockQuantity:100}]})]),'editor');
    expect(fixture.rows().find(row=>row.sku==='product:producto-prueba:base:sabor-renombrado')).toMatchObject({on_hand:0,track_stock:0});
  }finally{fixture.db.close();}
});

test('Productos nuevos conservan cantidades iniciales explícitas para cada combinación',async()=>{
  const fixture=database();
  try{
    await syncInventoryDefinitions(fixture.env,catalog([product({sizes:[{name:'Pequeña',stockQuantity:4},{name:'Grande',stockQuantity:5}],variants:[{name:'Vainilla'},{name:'Chocolate',stockQuantity:8}]})]));
    expect(fixture.rows().map(({sku,on_hand,track_stock})=>({sku,on_hand,track_stock}))).toEqual([
      {sku:'product:producto-prueba:grande:chocolate',on_hand:8,track_stock:1},
      {sku:'product:producto-prueba:grande:vainilla',on_hand:5,track_stock:1},
      {sku:'product:producto-prueba:pequena:chocolate',on_hand:8,track_stock:1},
      {sku:'product:producto-prueba:pequena:vainilla',on_hand:4,track_stock:1}
    ]);
  }finally{fixture.db.close();}
});

test('La identidad se captura antes de los lotes y no desactiva la cantidad inicial de SKU posteriores',async()=>{
  const fixture=database();
  try{
    await syncInventoryDefinitions(fixture.env,catalog([product({stockQuantity:3,sizes:Array.from({length:45},(_,i)=>({name:`Tamaño ${i+1}`}))})]));
    expect(fixture.rows()).toHaveLength(45);
    expect(fixture.rows().every(row=>row.on_hand===3&&row.track_stock===1)).toBe(true);
  }finally{fixture.db.close();}
});

test('SKU existentes mantienen cantidades, reservas y control; sincronizaciones concurrentes no reponen stock',async()=>{
  const fixture=database();
  try{
    const original=catalog([product({variants:[{name:'Original'}]})]);
    await syncInventoryDefinitions(fixture.env,original);
    fixture.db.prepare('UPDATE inventory_items SET on_hand=17,reserved=3,track_stock=1,updated_by=?,updated_at=?').run('operadora','2026-09-25T10:00:00Z');
    const next=catalog([product({name:'Nombre actualizado',stockQuantity:500,variants:[{name:'Original',stockQuantity:900},{name:'Añadido',stockQuantity:800}]})]);
    await Promise.all([syncInventoryDefinitions(fixture.env,next,'sesion-a'),syncInventoryDefinitions(fixture.env,next,'sesion-b')]);
    expect(fixture.rows()).toHaveLength(2);
    expect(fixture.rows().find(row=>row.sku.endsWith(':original'))).toMatchObject({label:'Nombre actualizado',on_hand:17,reserved:3,track_stock:1,updated_by:'operadora',updated_at:'2026-09-25T10:00:00Z'});
    expect(fixture.rows().find(row=>row.sku.endsWith(':anadido'))).toMatchObject({on_hand:0,reserved:0,track_stock:0});
  }finally{fixture.db.close();}
});

test('Una referencia inactiva sigue identificando un producto existente; cantidades no confirmadas no son stock',async()=>{
  const fixture=database();
  try{
    await syncInventoryDefinitions(fixture.env,catalog([product()]));
    fixture.db.exec('UPDATE inventory_items SET active=0');
    await syncInventoryDefinitions(fixture.env,catalog([product({variants:[{name:'Reapertura',stockQuantity:22}]}),product({id:'producto-nuevo',stockQuantity:null})]));
    expect(fixture.rows().find(row=>row.sku.endsWith(':reapertura'))).toMatchObject({on_hand:0,track_stock:0});
    expect(fixture.rows().find(row=>row.product_id==='producto-nuevo')).toMatchObject({on_hand:0,track_stock:0});
  }finally{fixture.db.close();}
});

test('Fonkies y Fomb continúan usando exclusivamente su inventario central',async()=>{
  const fixture=database();
  try{
    const state={products:[],builders:{fonkies:{flavors:[{name:'Chocolate',inventoryKey:'chocolate',stockQuantity:80}]},fomb:{flavors:[{name:'Ferrero',inventoryKey:'ferrero',stockQuantity:70}]}}};
    await syncInventoryDefinitions(fixture.env,state);
    expect(fixture.rows().every(row=>row.on_hand===0&&row.track_stock===0)).toBe(true);
    fixture.db.exec('UPDATE inventory_items SET on_hand=9,reserved=2,track_stock=1');
    state.builders.fonkies.flavors.push({name:'Nuevo',inventoryKey:'nuevo',stockQuantity:100});
    await syncInventoryDefinitions(fixture.env,state);
    expect(fixture.rows().filter(row=>!row.sku.endsWith(':nuevo')).every(row=>row.on_hand===9&&row.reserved===2&&row.track_stock===1)).toBe(true);
    expect(fixture.rows().find(row=>row.sku.endsWith(':nuevo'))).toMatchObject({on_hand:0,track_stock:0});
  }finally{fixture.db.close();}
});
