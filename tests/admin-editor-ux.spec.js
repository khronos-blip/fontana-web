const {test,expect}=require('@playwright/test');
const origin=process.env.FONTANA_ADMIN_TEST_ORIGIN || 'http://fontana.localhost:8767';

async function panel(page,settings={}){
  const writes=[];
  await page.route('https://api.fontanasingluten.com/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS','access-control-allow-headers':'content-type'};
    const send=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(path==='/v1/auth/login')return send({ok:true,username:'editor-test',role:'owner'});
    if(path==='/v1/auth/logout')return send({ok:true});
    if(req.method()!=='GET'){writes.push({path,body:req.postDataJSON()});return send(settings.fail?{error:'Publicación no realizada: fallo simulado'}:path==='/v1/admin/operations/electricity'?{electricityEnabled:req.postDataJSON().electricityEnabled}:{ok:true,revision:1},settings.fail?503:200);}
    if(path==='/v1/admin/catalog')return send({state:settings.catalog||null,revision:0});
    if(path==='/v1/admin/operations')return send({electricityEnabled:true});
    if(path==='/v1/admin/inventory')return send({items:settings.inventory||[],summary:{}});
    if(path==='/v1/admin/sales')return send({items:settings.sales||[],summary:{}});
    if(path==='/v1/admin/accounting/summary')return send({paymentsByCurrency:[],paymentsByMethod:[]});
    return send({items:[],summary:{}});
  });
  await page.goto(origin+'/admin/');
  await page.locator('#loginUsername').fill('editor-test');await page.locator('#loginPassword').fill('isolated-not-real');await page.locator('#loginButton').click();
  await expect(page.locator('#stockDayToggle')).toBeVisible();
  return writes;
}
async function edit(page,id='raviolis'){
  await page.locator('[data-view="products"]').click();await page.locator(`[data-edit="${id}"]`).click();
  return page.locator('#productForm');
}
async function publish(page,writes){
  const before=writes.length;await page.locator('#saveAll').click();await expect.poll(()=>writes.length).toBe(before+1);await expect(page.locator('#saveAll')).toBeEnabled();return writes.at(-1).body.state;
}
async function importCopy(page,catalog){
  await page.locator('#adminMenuButton').click();await page.locator('[data-menu-view="backup"]').click();
  await page.locator('#importInput').setInputFiles({name:'isolated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(catalog))});
  await expect(page.locator('#adminToast')).toContainText('Copia cargada');
}

test('Stock de hoy no anuncia éxito ni cambia el estado publicado después de un 503',async({page})=>{
  const writes=await panel(page,{fail:true});
  await page.locator('#stockDayToggle').click();await expect.poll(()=>writes.length).toBe(1);await expect(page.locator('#stockDayToggle')).toBeEnabled();
  await expect(page.locator('#stockDayToggle')).toContainText('Visible en la tienda');
  await expect(page.locator('#adminToast')).toContainText('Publicación no realizada');
  await expect(page.locator('#saveStatus')).toHaveText('Sin cambios pendientes');
});

test('Stock de hoy permite cancelar la publicación de borradores ajenos y confirma su alcance',async({page})=>{
  const writes=await panel(page);
  await page.locator('[data-view="fonkies"]').click();await page.locator('#fonkiesEditor summary').click();await page.locator('[data-builder-availability]').first().selectOption('sold-out');
  await page.locator('[data-view="dashboard"]').click();
  let message='';page.once('dialog',async d=>{message=d.message();await d.dismiss();});await page.locator('#stockDayToggle').click();
  expect(message).toContain('otros cambios pendientes');expect(writes).toHaveLength(0);await expect(page.locator('#stockDayToggle')).toContainText('Visible en la tienda');
  page.once('dialog',d=>d.accept());await page.locator('#stockDayToggle').click();await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].body.state.builders.fonkies.availabilityMode).toBe('sold-out');expect(writes[0].body.state.settings.stockTodayOpen).toBe(false);
});

test('Editar producto existente conserva cantidades históricas y dirige al inventario real',async({page})=>{
  const writes=await panel(page,{inventory:[{sku:'product:raviolis:base:base',productId:'raviolis',kind:'product',label:'Raviolis',onHand:5,reserved:2,available:3,trackStock:true}]});
  const form=await edit(page);await expect(form.locator('[name="stockQuantity"]')).toBeDisabled();await expect(form.locator('[name="stockQuantity"]')).toBeHidden();
  await expect(page.locator('#productStockSummary')).toContainText('3 disponibles · 2 reservadas');
  await form.locator('[name="description"]').fill('Descripción de prueba aislada');await form.locator('[type="submit"]').click();await expect(page.locator('#productDialog')).toBeHidden();
  expect(writes.at(-1).body.state.products.find(p=>p.id==='raviolis').stockQuantity).toBeNull();
  await edit(page);await page.locator('#productInventoryButton').click();await expect(page.locator('[data-panel="inventory"]')).toBeVisible();await expect(page.locator('#inventorySearch')).toHaveValue('Raviolis');
});

test('Alta de producto admite una cantidad inicial explícita y no inventa otras',async({page})=>{
  const writes=await panel(page);await page.locator('[data-panel="dashboard"] [data-action="new-product"]').click();
  const form=page.locator('#productForm');await expect(form.locator('[name="stockQuantity"]')).toBeEnabled();
  await form.locator('[name="name"]').fill('Alta aislada');await form.locator('[name="id"]').fill('alta-aislada');await form.locator('[name="price"]').fill('12');await form.locator('[name="stockQuantity"]').fill('7');
  await form.locator('[type="submit"]').click();await expect(page.locator('#productDialog')).toBeHidden();expect(writes.at(-1).body.state.products.find(p=>p.id==='alta-aislada').stockQuantity).toBe(7);
});

test('Editor visual conserva null y metadatos, acepta coma decimal y cambios de disponibilidad',async({page})=>{
  const writes=await panel(page),catalog=JSON.parse(JSON.stringify(await publish(page,writes)));
  const raviolis=catalog.products.find(p=>p.id==='raviolis');raviolis.sizes[0].price=null;raviolis.sizes[0].legacyMarker='preservar';raviolis.variants[0].stockQuantity=4;
  await importCopy(page,catalog);const form=await edit(page);
  await expect(form.locator('[data-option-rows="sizes"] [data-option-field="price"]').first()).toHaveValue('');
  await form.locator('[data-option-rows="sizes"] [data-option-field="price"]').nth(1).fill('21,50');
  await form.locator('[data-option-rows="variants"] [data-option-field="status"]').first().selectOption('sold-out');
  await form.locator('[type="submit"]').click();await expect(page.locator('#productDialog')).toBeHidden();
  const saved=writes.at(-1).body.state.products.find(p=>p.id==='raviolis');expect(saved.sizes[0]).toMatchObject({price:null,legacyMarker:'preservar'});expect(saved.sizes[1].price).toBe(21.5);expect(saved.variants[0]).toMatchObject({status:'sold-out',stockQuantity:4});
});

test('Cerrar o Escape pide descartar cambios; cancelar conserva el formulario',async({page})=>{
  await panel(page);const form=await edit(page);await form.locator('[name="name"]').fill('Nombre sin publicar');
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(page.locator('#productDialog')).toBeVisible();await expect(form.locator('[name="name"]')).toHaveValue('Nombre sin publicar');
  page.once('dialog',d=>d.accept());await page.locator('#productDialog [data-close-dialog]').last().click();await expect(page.locator('#productDialog')).toBeHidden();
  await edit(page);await expect(form.locator('[name="name"]')).toHaveValue('Raviolis');
});

test('Sabores, venta, gasto y anulación protegen el borrador y no cierran durante un guardado',async({page})=>{
  const writes=await panel(page,{sales:[{id:'aislada',soldAt:new Date().toISOString().slice(0,10),status:'confirmed',paymentStatus:'paid',totalCents:1200,paidRefCents:1200,customerName:'Caso aislado',itemsText:'1 × Prueba',payments:[]}]});
  const cases=[
    {dialog:'#flavorDialog',field:'name',open:async()=>{await page.locator('[data-view="fonkies"]').click();await page.locator('[data-edit-flavor]').first().click();}},
    {dialog:'#paymentDialog',field:'notes',open:async()=>{await page.locator('[data-view="sales"]').click();await page.locator('#newSaleButton').click();}},
    {dialog:'#expenseDialog',field:'description',open:async()=>{await page.locator('[data-view="accounting"]').click();await page.locator('#newExpenseButton').click();}},
    {dialog:'#voidDialog',field:'reason',open:async()=>{await page.locator('[data-view="sales"]').click();await page.locator('[data-void-sale="aislada"]').click();}}
  ];
  for(const entry of cases){
    await entry.open();const dialog=page.locator(entry.dialog),input=dialog.locator(`[name="${entry.field}"]`),submit=dialog.locator('button[type="submit"]');
    await input.fill('Cambio aislado sin guardar');let prompted=false;
    page.once('dialog',async d=>{prompted=true;await d.dismiss();});await dialog.locator('[data-close-dialog]').first().click();
    expect(prompted).toBe(true);await expect(dialog).toBeVisible();await expect(input).toHaveValue('Cambio aislado sin guardar');
    await submit.evaluate(button=>{button.disabled=true;});await dialog.locator('[data-close-dialog]').first().click();await expect(dialog).toBeVisible();
    await submit.evaluate(button=>{button.disabled=false;});page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  }
  expect(writes).toHaveLength(0);
});

test('Una opción renombrada no hereda stock ni metadatos de otra identidad',async({page})=>{
  const writes=await panel(page),catalog=JSON.parse(JSON.stringify(await publish(page,writes)));
  const raviolis=catalog.products.find(p=>p.id==='raviolis');raviolis.sizes[0].stockQuantity=7;raviolis.sizes[0].legacyMarker='solo-original';raviolis.sizes[1].stockQuantity=3;
  await importCopy(page,catalog);const form=await edit(page);
  await form.locator('[data-option-rows="sizes"] [data-option-field="name"]').first().fill('Presentación nueva');
  await form.locator('[type="submit"]').click();await expect(page.locator('#productDialog')).toBeHidden();
  const saved=writes.at(-1).body.state.products.find(p=>p.id==='raviolis');
  expect(saved.sizes[0].stockQuantity).toBeNull();expect(saved.sizes[0].legacyMarker).toBeUndefined();expect(saved.sizes[1].stockQuantity).toBe(3);
});

test('Productos muestra el agotado efectivo y precios de presentaciones sin alterar configuración',async({page})=>{
  await panel(page,{inventory:[{sku:'product:raviolis:base:base',productId:'raviolis',kind:'product',label:'Raviolis',onHand:0,reserved:0,available:0,trackStock:true}]});await page.locator('[data-view="products"]').click();
  const row=page.locator('[data-product-id="raviolis"]');await expect(row.locator('[data-store-mode]')).toContainText('Agotado · sin unidades libres');await expect(row).toContainText('Configuración: Disponible hoy');
  await expect(row.locator('.product-price-summary')).toContainText('180 g: REF');await expect(row.locator('.product-price-summary')).toContainText('300 g: REF');
  await page.locator('#statusFilter').selectOption('sold-out');await expect(row).toBeVisible();
});

test('En tienda no confunde productos locales pendientes ni precios de borrador con lo publicado',async({page})=>{
  const writes=await panel(page),catalog=JSON.parse(JSON.stringify(await publish(page,writes)));
  const draft=JSON.parse(JSON.stringify(catalog));draft.products.find(p=>p.id==='raviolis').sizes[0].price=999;
  await importCopy(page,draft);await page.locator('[data-view="products"]').click();
  const prices=page.locator('[data-product-id="raviolis"] .product-price-summary');
  await expect(prices).toContainText('Precios publicados');await expect(prices).not.toContainText('999');
  const reduced=JSON.parse(JSON.stringify(catalog));reduced.products=reduced.products.filter(p=>p.id!=='raviolis');
  await page.unroute('https://api.fontanasingluten.com/v1/**');
  await panel(page,{catalog:reduced});await page.locator('[data-view="products"]').click();
  await expect(page.locator('[data-product-id="raviolis"] [data-store-mode]')).toContainText('No publicado');
  await expect(page.locator('[data-product-id="raviolis"] .product-price-summary')).toContainText('Precios del borrador');
});

test('El estado efectivo de Productos se actualiza al pausar y restablecer la electricidad',async({page})=>{
  const writes=await panel(page),catalog=JSON.parse(JSON.stringify(await publish(page,writes)));
  catalog.products.find(p=>p.id==='raviolis').requiresElectricity=true;
  await importCopy(page,catalog);await publish(page,writes);await page.locator('[data-view="dashboard"]').click();
  page.once('dialog',d=>d.accept());await page.locator('#electricityToggle').click();await expect(page.locator('#electricityToggle')).toBeEnabled();
  await page.locator('[data-view="products"]').click();await expect(page.locator('[data-product-id="raviolis"] [data-store-mode]')).toContainText('Pausado por electricidad');
  await page.locator('[data-view="dashboard"]').click();await page.locator('#electricityToggle').click();await expect(page.locator('#electricityToggle')).toBeEnabled();
  await page.locator('[data-view="products"]').click();await expect(page.locator('[data-product-id="raviolis"] [data-store-mode]')).toContainText('Disponible hoy');
});

test('El editor visual mantiene controles legibles y sin desbordamientos en móvil y escritorio',async({page},testInfo)=>{
  await panel(page);
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:width===390?844:1000});const form=await edit(page);
    await form.locator('[data-options-editor="sizes"]').scrollIntoViewIfNeeded();
    const layout=await form.evaluate(form=>({pageOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),rows:[...form.querySelectorAll('.product-option-row')].map(row=>({overflow:Math.max(0,row.scrollWidth-row.clientWidth),buttonHeight:row.querySelector('button').getBoundingClientRect().height,labelSize:parseFloat(getComputedStyle(row.querySelector('label')).fontSize)}))}));
    expect(layout.pageOverflow).toBe(0);expect(layout.rows.every(row=>row.overflow===0&&row.buttonHeight>=44&&row.labelSize>=12)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`editor-opciones-${width}.png`)});await page.locator('#productDialog [data-close-dialog]').first().click();
  }
});
