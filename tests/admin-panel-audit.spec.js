const {test, expect} = require('@playwright/test');

// Use the production code path with isolated API fixtures, never real records.
const origin = 'http://fontana.localhost:8767';
function rates(date, exact = true) {
  return {date, rates:Object.fromEntries([['USD',80],['EUR',92]].map(([currency,value]) => [currency, {
    id:`test-${currency}-${date}`,currency,rateScaled:value*100000000,rateScale:8,
    valueDate:date,sourceUrl:'https://www.bcv.org.ve/',status:'official',exact
  }]))};
}

async function panel(page, settings = {}) {
  const writes=[];
  await page.route('https://api.fontanasingluten.com/v1/**', async route => {
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true',
      'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS','access-control-allow-headers':'content-type'};
    const send=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(path==='/v1/auth/login')return send({ok:true,username:'audit',role:settings.role||'owner'});
    if(path==='/v1/auth/logout')return send({ok:true});
    if(path==='/v1/admin/exchange-rates') {
      const result=await (settings.rateResponse?.(url.searchParams.get('date')) ?? rates(url.searchParams.get('date'),settings.exact??true));
      return send(result);
    }
    if(request.method()!=='GET') {
      writes.push({path,body:request.postDataJSON()});
      await settings.onWrite?.(path,request.postDataJSON());
      return send(settings.writeError ? {error:settings.writeError} : {ok:true},settings.writeStatus||200);
    }
    if(path==='/v1/admin/catalog')return send({state:null,revision:0});
    if(path==='/v1/admin/operations')return send({electricityEnabled:true});
    if(path==='/v1/admin/accounting/summary')return send(await (settings.summaryResponse?.(url)??{paymentsByCurrency:[],paymentsByMethod:[]}));
    if(path==='/v1/admin/inventory')return send({items:settings.inventory||[],summary:{}});
    if(path==='/v1/admin/users')return send({items:[{username:'audit',displayName:'Auditoría',active:1,role:settings.role||'owner'}],currentUser:'audit',canManageUsers:settings.role!=='admin'});
    if(path==='/v1/admin/sales')return send({items:settings.sales||[],summary:{}});
    return send({items:[],summary:{}});
  });
  await page.goto(`${origin}/admin/`);
  await page.locator('#loginUsername').fill('audit');
  await page.locator('#loginPassword').fill('local-test-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  return writes;
}

async function sale(page) {
  await page.locator('[data-view="sales"]').click();
  await page.locator('#newSaleButton').click();
  await page.locator('#saleCatalogPicker [data-catalog-delta="1"]').first().click();
  const form=page.locator('#paymentForm');
  await form.locator('[name="customerName"]').fill('Prueba aislada');
  await form.locator('[name="customerPhone"]').fill('04120000000');
  return form;
}

async function visibleNotice(page, dialog, text) {
  const notice=page.locator(`${dialog} #adminToast`);
  await expect(notice).toContainText(text);
  await expect(notice).toBeFocused();
  expect(await notice.evaluate(element=>{
    const r=element.getBoundingClientRect();
    return r.top>=0&&r.bottom<=innerHeight&&element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  })).toBe(true);
}

async function finishDelayedResponse(page, path, release) {
  const response=page.waitForResponse(response=>response.url().includes(path));
  release();
  await (await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

for(const exact of [true,false])test(`BCV exact=${exact} es una fecha, no el valor: venta y gasto usan 80`,async({page})=>{
  const writes=await panel(page,{exact});
  const form=await sale(page);
  await expect(form.locator('[name="bcvRate"]')).toHaveValue('80');
  await form.locator('[name="paidAmount"]').fill('800');
  await page.locator('#savePaymentButton').click();
  await expect(page.locator('#paymentDialog')).not.toBeVisible();
  expect(writes[0].body.payments[0]).toMatchObject({amountMinor:80000,referenceAmountCents:1000,functionalAmountCents:1000});
  expect(writes[0].body.payments[0].exchangeRateId).toMatch(/^test-USD-/);
  await page.locator('[data-view="accounting"]').click();
  await page.locator('#newExpenseButton').click();
  const expense=page.locator('#expenseForm');
  await expect(expense.locator('[name="bcvRate"]')).toHaveValue('80');
  await expense.locator('[name="description"]').fill('Gasto de prueba aislado');
  await expense.locator('[name="amount"]').fill('800');
  await expense.locator('[type="submit"]').click();
  await expect(page.locator('#expenseDialog')).not.toBeVisible();
  expect(writes[1].body).toMatchObject({amountMinor:80000,referenceAmountCents:1000,functionalAmountCents:1000});
});

test('Tasa ausente y fallo de servidor se leen dentro del modal y conservan el reintento',async({page})=>{
  const settings={rateResponse:()=>({rates:{}}),writeError:'Servicio temporalmente no disponible',writeStatus:503};
  const writes=await panel(page,settings),form=await sale(page);
  await expect(form.locator('.rate-status')).toContainText('No hay una tasa oficial válida');
  await form.locator('[name="paidAmount"]').fill('800');
  const key=await form.locator('[name="idempotencyKey"]').inputValue();
  await page.locator('#savePaymentButton').click();
  await visibleNotice(page,'#paymentDialog','Falta una tasa BCV válida');
  expect(writes).toHaveLength(0);
  await form.locator('[name="paidCurrency"]').selectOption('USD');
  await page.locator('#savePaymentButton').click();
  await visibleNotice(page,'#paymentDialog','Servicio temporalmente no disponible');
  await expect(form.locator('[name="idempotencyKey"]')).toHaveValue(key);
  await expect(form.locator('[name="customerName"]')).toHaveValue('Prueba aislada');
  await expect(page.locator('#savePaymentButton')).toBeEnabled();
  settings.writeStatus=200;settings.writeError='';
  await page.locator('#savePaymentButton').click();
  await expect(page.locator('#paymentDialog')).not.toBeVisible();
  expect(writes[1].body.idempotencyKey).toBe(writes[0].body.idempotencyKey);
});

test('Las respuestas BCV tardías no sobrescriben otra fecha ni una tasa manual',async({page})=>{
  let release;
  const delayed=new Promise(resolve=>release=resolve);
  const settings={rateResponse:async date=>{
    if(date==='2026-08-01')await delayed;
    return rates(date);
  }};
  await panel(page,settings);
  const form=await sale(page),date=form.locator('[name="soldAt"]');
  await expect(form.locator('[name="bcvRate"]')).toHaveValue('80');
  await date.fill('2026-08-01');await date.dispatchEvent('change');
  await expect(form.locator('[name="bcvRate"]')).toHaveValue('');
  await form.locator('[name="paidAmount"]').fill('800');
  await page.locator('#savePaymentButton').click();
  await visibleNotice(page,'#paymentDialog','Espera a que termine');
  await date.fill('2026-08-02');await date.dispatchEvent('change');
  await expect(form.locator('[name="rateValueDate"]')).toHaveValue('2026-08-02');
  await finishDelayedResponse(page,'date=2026-08-01',release);
  await expect(form.locator('.rate-status')).toContainText('2026-08-02');
  await expect(form.locator('[name="rateValueDate"]')).toHaveValue('2026-08-02');
  await page.locator('#paymentDialog [data-close-dialog]').first().click();
  let releaseExpense;
  const expenseDelay=new Promise(resolve=>releaseExpense=resolve);
  settings.rateResponse=async date=>{await expenseDelay;return rates(date);};
  await page.locator('[data-view="accounting"]').click();await page.locator('#newExpenseButton').click();
  const expense=page.locator('#expenseForm');
  await expense.locator('[name="spentAt"]').fill('2026-08-03');await expense.locator('[name="spentAt"]').dispatchEvent('change');
  await expect(expense.locator('[name="bcvRate"]')).toHaveValue('');
  await expense.locator('[name="rateSourceType"]').selectOption('manual');
  await expense.locator('[name="bcvRate"]').fill('95');
  await finishDelayedResponse(page,'date=2026-08-03',releaseExpense);
  await expect(expense.locator('[name="bcvRate"]')).toHaveValue('95');
});

test('Cambiar base actualiza todos los cobros y un abono no cambia la moneda histórica',async({page})=>{
  const savedSale={id:'sale-audit',soldAt:'2026-09-01',status:'confirmed',paymentStatus:'partial',totalRefCents:1200,paidRefCents:500,balanceRefCents:700,referenceCurrency:'USD',customerName:'Prueba',customerPhone:'04120000000',lineItems:[{name:'Prueba',quantity:1,unitPriceCents:1200}]};
  await panel(page,{sales:[savedSale]});
  const form=await sale(page);
  await expect(form.locator('[name="bcvRate"]')).toHaveValue('80');
  await page.locator('[data-add-payment-line]').click();
  const lines=form.locator('.payment-line');
  await lines.nth(1).locator('[name="paidCurrency"]').selectOption('VES');
  await expect(lines.nth(1).locator('[name="bcvRate"]')).toHaveValue('80');
  await lines.first().locator('[name="rateBasis"]').selectOption('EUR');
  for(let i=0;i<2;i++){
    await expect(lines.nth(i).locator('[name="bcvRate"]')).toHaveValue('92');
    await expect(lines.nth(i)).toHaveAttribute('data-exchange-rate-id',/^test-EUR-/);
  }
  await page.locator('#paymentDialog [data-close-dialog]').first().click();
  await page.locator('[data-add-sale-payment]').first().click();
  await expect(form.locator('[name="referenceCurrency"]')).toBeDisabled();
  await form.locator('[name="paidCurrency"]').selectOption('EUR');
  await expect(form.locator('[name="referenceCurrency"]')).toHaveValue('USD');
});

test('Sesión vencida cierra el modal y muestra el acceso sin registrar la venta',async({page})=>{
  await panel(page,{writeStatus:401,writeError:'Tu sesión venció'});
  const form=await sale(page);
  await form.locator('[name="paidCurrency"]').selectOption('USD');
  await form.locator('[name="paidAmount"]').fill('10');
  await page.locator('#savePaymentButton').click();
  await expect(page.locator('#paymentDialog')).not.toBeVisible();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#loginStatus')).toContainText('sesión venció');
});

test('Panel completo: doce áreas y modales accesibles a 360, 390, 768 y 1366',async({page},testInfo)=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await panel(page);
  for(const width of [360,390,768,1366]){
    await page.setViewportSize({width,height:width===360?640:width===390?844:900});
    for(const area of ['dashboard','products','fonkies','fomb','inventory','orders','sales','customers','accounting']){
      await page.locator(`[data-view="${area}"]`).click();
      await expect(page.locator(`[data-panel="${area}"]`)).toBeVisible();
      const overflow=await page.evaluate(()=>[...document.querySelectorAll('.view.active *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,12));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${area} ${width}: ${JSON.stringify(overflow)}`).toBe(true);
    }
    for(const area of ['security','backup','activity-log']){
      await page.locator('#adminMenuButton').click();await page.locator(`[data-menu-view="${area}"]`).click();
      await expect(page.locator(`[data-panel="${area}"]`)).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await page.locator('[data-view="accounting"]').click();await page.locator('#newExpenseButton').click();
    const select=page.locator('#expenseForm [name="category"]');
    expect(await select.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.locator('#expenseForm [type="submit"]').click();
    await visibleNotice(page,'#expenseDialog','Indica fecha');
    await page.screenshot({path:testInfo.outputPath(`gasto-error-${width}.png`)});
    await page.keyboard.press('Escape');
    await expect(page.locator('#expenseDialog')).not.toBeVisible();
  }
  await page.locator('[data-view="products"]').click();await page.locator('[data-action="new-product"]').last().click();
  await page.locator('#productForm [name="id"]').fill('pistacho');await page.locator('#productForm [name="name"]').fill('Prueba duplicada');
  await page.locator('#productForm [type="submit"]').click();
  await visibleNotice(page,'#productDialog','Ya existe un producto');await page.keyboard.press('Escape');
  await page.locator('[data-view="fonkies"]').click();await page.locator('[data-add-flavor="fonkies"]').click();
  await page.locator('#flavorForm [name="name"]').fill('Chips de Chocolate Oscuro');await page.locator('#flavorForm [type="submit"]').click();
  await visibleNotice(page,'#flavorDialog','Ya existe un sabor');await page.keyboard.press('Escape');
  await page.locator('#adminMenuButton').click();await page.keyboard.press('Escape');
  await expect(page.locator('#adminMenu')).not.toBeVisible();await expect(page.locator('#adminMenuButton')).toBeFocused();
  expect(errors).toEqual([]);
});

test('Publicar no duplica la petición ni da por publicados cambios editados durante la espera',async({page})=>{
  let release;
  const pending=new Promise(resolve=>release=resolve);
  const writes=await panel(page,{onWrite:async path=>{if(path==='/v1/admin/catalog')await pending;}});
  await page.locator('#saveAll').click();
  await expect(page.locator('#saveAll')).toBeDisabled();
  await page.locator('[data-view="products"]').click();
  await page.locator('[data-edit="pistacho"]').click();
  await page.locator('#productForm [name="name"]').fill('Edición posterior aislada');
  await page.locator('#productForm [type="submit"]').click();
  release();
  await expect(page.locator('#saveAll')).toBeEnabled();
  await expect(page.locator('#saveStatus')).toHaveText('Cambios pendientes');
  expect(writes).toHaveLength(1);
  expect(writes[0].body.state.products.find(p=>p.id==='pistacho').name).not.toBe('Edición posterior aislada');
});

test('Anular exige motivo y confirmación dentro del diálogo, sin borrar historial',async({page})=>{
  const record={id:'sale-audit',soldAt:'2026-09-01',status:'confirmed',paymentStatus:'partial',totalRefCents:1200,referenceCurrency:'USD',customerName:'Prueba',lineItems:[]};
  const writes=await panel(page,{sales:[record]});
  await page.locator('[data-view="sales"]').click();await page.locator('[data-void-sale]').click();
  await page.locator('#voidForm [type="submit"]').click();
  await visibleNotice(page,'#voidDialog','Escribe un motivo');
  expect(writes).toHaveLength(0);
  await page.locator('#voidForm [name="reason"]').fill('Duplicado de prueba aislado');
  await page.locator('#voidForm [name="confirmImpact"]').check();
  await page.locator('#voidForm [type="submit"]').click();
  await expect(page.locator('#voidDialog')).not.toBeVisible();
  expect(writes[0].path).toBe('/v1/admin/sales/sale-audit/void');
});

test('El cierre contable mantiene el último período aunque el anterior responda después',async({page})=>{
  let release;
  const delayed=new Promise(resolve=>release=resolve);
  await panel(page,{summaryResponse:async url=>{
    const from=url.searchParams.get('from'),to=url.searchParams.get('to');
    if(from==='2026-04-01')await delayed;
    return {from,to,paymentsByCurrency:[],paymentsByMethod:[]};
  }});
  await page.locator('[data-view="accounting"]').click();
  const form=page.locator('#accountingRangeForm');
  for(const month of ['04','05']){
    await form.locator('[name="from"]').fill(`2026-${month}-01`);
    await form.locator('[name="to"]').fill(`2026-${month}-28`);
    await form.locator('[type="submit"]').click();
  }
  await expect(page.locator('#accountingPeriodLabel')).toContainText('2026-05-01');
  await finishDelayedResponse(page,'summary?from=2026-04-01',release);
  await expect(page.locator('#accountingPeriodLabel')).toContainText('2026-05-01');
  await expect(page.locator('#expenseList')).toContainText('2026-05-01');
});

test('Inventario bloquea ajustes simultáneos de la misma fila mientras guarda',async({page})=>{
  let release;
  const pending=new Promise(resolve=>release=resolve);
  const writes=await panel(page,{inventory:[{sku:'product:ballerine:base:base',kind:'product',label:'Prueba aislada',onHand:5,reserved:1,available:4,trackStock:true}],onWrite:async path=>{if(path.includes('/inventory/'))await pending;}});
  await page.locator('[data-view="inventory"]').click();
  const row=page.locator('.inventory-row').first();
  await row.locator('[data-stock-delta="1"]').click();
  await expect(row.locator('[data-save-stock]')).toBeDisabled();
  await expect(row.locator('[data-stock-value]')).toBeDisabled();
  await row.locator('[data-stock-delta="1"]').dispatchEvent('click');
  expect(writes).toHaveLength(1);expect(writes[0].body.onHand).toBe(6);
  release();
  await expect(page.locator('.inventory-row [data-save-stock]')).toBeEnabled();
});

test('Administrador sin rol propietario no puede cargar tasas ni administrar usuarios',async({page})=>{
  await panel(page,{role:'admin',rateResponse:()=>({rates:{}})});
  const form=await sale(page);
  await expect(form.locator('[name="rateSourceType"] option[value="manual"]')).toHaveJSProperty('disabled',true);
  await expect(form.locator('.rate-status')).toContainText('Solicita a la propietaria');
  await page.keyboard.press('Escape');
  await page.locator('#adminMenuButton').click();await page.locator('[data-menu-view="security"]').click();
  await expect(page.locator('#newUserForm')).toBeHidden();
});
