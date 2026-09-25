const {test, expect} = require('@playwright/test');

const origin = process.env.FONTANA_ADMIN_TEST_ORIGIN || 'http://fontana.localhost:8767';
const sampleSale = index => ({
  id:`ux-sale-${index}`, soldAt:'2026-09-25', customerId:'ux-customer', customerName:'Cliente de prueba', customerPhone:'04120000000',
  status:'confirmed', paymentStatus:'paid', referenceCurrency:'USD', totalRefCents:2000, functionalTotalCents:2000,
  outstandingFunctionalUsdCents:0, channel:'Prueba aislada', notes:'Nota histórica completa <no es HTML>',
  lineItems:[{name:`Producto histórico ${index}`,quantity:2,optionSummary:'Presentación con un nombre largo que debe poder consultarse completo',unitPriceRefCents:1000}],
  payments:[{method:'Transferencia',currency:'USD',amountMinor:2000,amountScale:2,functionalAmountCents:2000,reference:`REF-PRUEBA-${index}`,notes:'Nota del cobro conservada'}]
});

async function login(page) {
  await page.locator('#loginUsername').fill('ux-audit');
  await page.locator('#loginPassword').fill('fixture-only');
  await page.locator('#loginButton').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  await expect(page).toHaveURL(/#(?:dashboard|sales|orders|products|customers|fonkies|fomb)$/);
}

async function panel(page, settings = {}) {
  const requests = {writes:[], orderReads:0};
  await page.route('https://api.fontanasingluten.com/v1/**', async route => {
    const request=route.request(), url=new URL(request.url()), path=url.pathname;
    const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS','access-control-allow-headers':'content-type'};
    const send=body=>route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
    if(path==='/v1/auth/login') return send({ok:true,username:'ux-audit',role:'owner'});
    if(path==='/v1/auth/logout') return send({ok:true});
    if(request.method()!=='GET') {requests.writes.push(path);return send({ok:true});}
    if(path==='/v1/admin/catalog') return send({state:null,revision:0});
    if(path==='/v1/admin/operations') return send({electricityEnabled:true});
    if(path==='/v1/admin/sales') return send({items:settings.sales||[sampleSale(1)],summary:{}});
    if(path==='/v1/admin/orders') {requests.orderReads++;return send({items:settings.orders?.(requests.orderReads)||[],summary:{}});}
    if(path==='/v1/admin/customers') return send({items:[{id:'ux-customer',name:'Cliente de prueba',phone:'04120000000',confirmedSalesCount:11}],summary:{}});
    if(path==='/v1/admin/customers/ux-customer') {
      const start=url.searchParams.has('cursor')?8:0,end=start?11:8;
      return send({customer:{id:'ux-customer',name:'Cliente de prueba',phone:'04120000000'},sales:Array.from({length:end-start},(_,i)=>sampleSale(i+start+1)),nextCursor:start?null:'older'});
    }
    if(path==='/v1/admin/exchange-rates') {
      const date=url.searchParams.get('date');
      return send({date,rates:{USD:{id:'fixture-rate',currency:'USD',rateScaled:8000000000,rateScale:8,valueDate:date,sourceUrl:'https://www.bcv.org.ve/',status:'official',exact:true}}});
    }
    return send({items:[],summary:{},paymentsByCurrency:[],paymentsByMethod:[]});
  });
  await page.goto(`${origin}/admin/${settings.hash||''}`);
  await login(page);
  return requests;
}

test('Navegación conserva sección, atrás/adelante y estado accesible sin saltarse login', async({page})=>{
  const requests=await panel(page);
  await page.locator('[data-view="products"]').click();
  await expect(page).toHaveURL(/#products$/);
  await expect(page.locator('[data-view="products"]')).toHaveAttribute('aria-current','page');
  await page.locator('[data-view="sales"]').click();
  await page.goBack();
  await expect(page.locator('.view.active')).toHaveAttribute('data-panel','products');
  await page.goForward();
  await expect(page.locator('.view.active')).toHaveAttribute('data-panel','sales');
  await page.reload();
  await expect(page.locator('#adminApp')).toBeHidden();
  await login(page);
  await expect(page.locator('.view.active')).toHaveAttribute('data-panel','sales');
  expect(requests.writes).toEqual([]);
});

test('Clientes muestran las once compras de todas las páginas sin truncar el historial', async({page})=>{
  const requests=await panel(page);
  await page.locator('[data-view="customers"]').click();
  await page.locator('.customer-row > summary').click();
  await expect(page.locator('.customer-purchase')).toHaveCount(11);
  await expect(page.locator('.customer-history-heading')).toContainText('11 registros');
  await expect(page.locator('.customer-history')).toContainText('Producto histórico 11');
  expect(requests.writes).toEqual([]);
});

test('Sección desconocida vuelve a Resumen y el menú secundario comunica su sección activa',async({page})=>{
  await panel(page,{hash:'#seccion-inexistente'});
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(page.locator('[data-view="dashboard"]')).toHaveAttribute('aria-current','page');
  await page.locator('#adminMenuButton').click();
  await page.locator('[data-menu-view="backup"]').click();
  await expect(page).toHaveURL(/#backup$/);
  await expect(page.locator('[data-menu-view="backup"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('.nav-item[aria-current]')).toHaveCount(0);
});

test('Ventas permiten consultar productos, notas y referencias completas de solo lectura', async({page})=>{
  const requests=await panel(page);
  await page.locator('[data-view="sales"]').click();
  await page.locator('.sale-details summary').click();
  const details=page.locator('.sale-detail-body');
  await expect(details).toBeVisible();
  await expect(details).toContainText('REF-PRUEBA-1');
  await expect(details).toContainText('Nota histórica completa <no es HTML>');
  await expect(details).toContainText('Presentación con un nombre largo que debe poder consultarse completo');
  await expect(details.locator('no')).toHaveCount(0);
  await page.locator('#saleSearch').fill('Cliente');
  await expect(page.locator('.sale-details')).toHaveAttribute('open','');
  expect(requests.writes).toEqual([]);
});

test('Detalle de venta anulada conserva el historial sin presentar una deuda ni simular un reembolso',async({page},testInfo)=>{
  await page.setViewportSize({width:1440,height:1000});
  const cancelled={...sampleSale(1),status:'cancelled',paymentStatus:'unpaid',outstandingFunctionalUsdCents:2000};
  await panel(page,{sales:[cancelled]});
  await page.locator('[data-view="sales"]').click();
  await page.locator('.sale-details summary').click();
  await expect(page.locator('.sale-detail-body')).toContainText('la anulación no acredita un reembolso');
  await expect(page.locator('.sale-detail-balance')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('venta-historica-escritorio.png'),animations:'disabled'});
});

test('Reservas actualizan el tiempo, consultan el vencimiento al servidor y refrescan al recuperar foco', async({page})=>{
  const clock=new Date('2026-09-25T15:00:00Z');
  await page.clock.install({time:clock});
  let expired=false;
  const order={id:'ux-order',orderCode:'FNT-PRUEBA',customerName:'Prueba',status:'reserved',expiresAt:Math.floor(clock.getTime()/1000)+120,items:[],totalCents:2000};
  const requests=await panel(page,{orders:read=>[{...order,orderCode:`FNT-PRUEBA-${read}`,status:expired?'expired':'reserved'}]});
  await page.locator('[data-view="orders"]').click();
  await expect(page.locator('.order-title')).toContainText('FNT-PRUEBA-2');
  await expect(page.locator('.order-expiry')).toContainText('Vence en 2 min');
  await expect(page.locator('.order-expiry')).toContainText('(Caracas)');
  await page.clock.fastForward(65000);
  await expect(page.locator('.order-expiry')).toContainText('Vence en 1 min');
  const beforeFocus=requests.orderReads;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>requests.orderReads).toBeGreaterThan(beforeFocus);
  expired=true;
  await page.clock.fastForward(65000);
  await expect(page.locator('#ordersList')).toContainText('No hay pedidos');
  await page.locator('#orderStatusFilter').selectOption('expired');
  await expect(page.locator('.order-title')).toContainText('Vencido');
  expect(requests.writes).toEqual([]);
});

for(const width of [320,390]) {
  test(`Móvil ${width}: sabores completos y controles de cobro legibles`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:844});
    await panel(page);
    await page.locator('[data-view="fonkies"]').click();
    const flavor=page.locator('.view.active .flavor-row').first();
    const metrics=await flavor.evaluate(row=>({
      titleSize:parseFloat(getComputedStyle(row.querySelector('h3')).fontSize),
      clamped:getComputedStyle(row.querySelector('h3')).webkitLineClamp,
      buttons:[...row.querySelectorAll('.row-actions button')].map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}))
    }));
    expect(metrics.titleSize).toBeGreaterThanOrEqual(14);
    expect(metrics.clamped).toBe('none');
    for(const button of metrics.buttons){expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);}
    await expect(page.locator('[data-view="fonkies"]')).toHaveAttribute('aria-current','page');
    await page.screenshot({path:testInfo.outputPath(`fonkies-${width}.png`),animations:'disabled'});
    await page.locator('[data-view="sales"]').click();
    await page.locator('#newSaleButton').click();
    const layout=await page.locator('#paymentForm').evaluate(form=>({
      grids:[...form.querySelectorAll('.compact-form-grid,.payment-line-grid,.bcv-grid')].map(grid=>getComputedStyle(grid).gridTemplateColumns.split(' ').length),
      overflow:form.scrollWidth>form.clientWidth+1,
      labels:[...form.querySelectorAll('.payment-line-grid label')].map(label=>parseFloat(getComputedStyle(label).fontSize))
    }));
    expect(layout.grids.every(columns=>columns===1)).toBe(true);
    expect(layout.overflow).toBe(false);
    expect(layout.labels.every(size=>size>=12)).toBe(true);
    await expect(page.locator('#paymentDialog')).toBeVisible();
    await page.locator('#paymentForm [name="paidAmount"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`cobro-${width}.png`),animations:'disabled'});
  });
}

for(const width of [320,390,1440]) {
  test(`Legibilidad ${width}: estados, ayudas y acciones administrativas conservan tamaños mínimos`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    await panel(page);
    const controls=async(selector)=>page.locator(selector).evaluateAll(elements=>elements.map(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height})));
    await page.locator('[data-view="products"]').click();
    expect(await page.locator('.product-row .badge').evaluateAll(elements=>elements.every(element=>parseFloat(getComputedStyle(element).fontSize)>=12))).toBe(true);
    for(const size of await controls('.product-row .row-actions button')) {expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44);}
    await page.locator('[data-edit]').first().click();
    expect(await page.locator('#productForm small').evaluateAll(elements=>elements.every(element=>parseFloat(getComputedStyle(element).fontSize)>=12))).toBe(true);
    await page.locator('#productDialog [data-close-dialog]').first().click();
    await page.locator('[data-view="fonkies"]').click();
    expect(await page.locator('#fonkiesEditor .flavor-title .badge').evaluateAll(elements=>elements.every(element=>parseFloat(getComputedStyle(element).fontSize)>=12))).toBe(true);
    await expect(page.locator('#fonkiesEditor .flavor-title .badge').first()).toContainText('Configuración:');
    for(const size of await controls('#fonkiesEditor .row-actions button')) {expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44);}
    await page.locator('[data-view="customers"]').click();
    await page.locator('.customer-row > summary').click();
    await expect(page.locator('.customer-purchase')).toHaveCount(11);
    expect(await page.locator('.customer-purchase small').evaluateAll(elements=>elements.every(element=>parseFloat(getComputedStyle(element).fontSize)>=12))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
