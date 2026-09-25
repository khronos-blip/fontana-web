const {test,expect}=require('@playwright/test');

async function fixture(page,testInfo,{withCart=false}={}){
  const port=new URL(testInfo.project.use.baseURL||'http://127.0.0.1:8767').port;
  const origin=`http://fontana.localhost:${port}`;
  const product={id:'pistacho',name:'Torta de prueba',category:'cakes',price:55,image:'assets/pistachio-raspberry-fontana-v2.jpg',ingredients:'Ingredientes de prueba',status:'sold-out',availabilityMode:'preorder',allowPreorder:true,minimumBusinessDays:2,visible:true};
  const raviolis={id:'raviolis',name:'Raviolis de prueba',brand:'Marca de prueba',category:'salado',price:20,image:'assets/ravioli-fontana-pro.jpg',status:'available',availabilityMode:'available',visible:true};
  const catalog={revision:1,state:{products:[product,raviolis],builders:{},operations:{verified:true,electricityEnabled:true}}};
  const reservations=[];
  await page.route('**/v1/**',route=>{
    const req=route.request(),pathname=new URL(req.url()).pathname;
    const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const send=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
    if(pathname==='/v1/catalog')return send(catalog);
    if(pathname==='/v1/orders/validate')return send({ok:true});
    if(pathname==='/v1/orders/reserve'){reservations.push(req.postDataJSON());return send({error:'Reserva de prueba bloqueada'},503);}
    return send({error:'Operación no autorizada en prueba'},403);
  });
  await page.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\//,r=>r.abort());
  if(withCart)await page.addInitScript(p=>localStorage.setItem('fontana-cart-v1',JSON.stringify([{id:'catalog-'+p.id,productId:p.id,category:p.category,name:p.name,price:p.price,image:p.image,qty:1,ingredients:p.ingredients,inventory:{kind:'product',productId:p.id,availability:'preorder',preorder:true,minimumBusinessDays:2}}])),product);
  return {origin,catalog,product,reservations};
}

async function checkout(page,origin){
  await page.goto(origin);
  await page.locator('#cartButton').click();
  await page.locator('#continueCheckout').click();
  await page.locator('#customerName').fill('Cliente ficticio');
  await page.locator('#customerPhone').fill('04120000000');
  await page.locator('#requestedDate').fill(await page.locator('#requestedDate').getAttribute('min'));
  await page.locator('[name="birthdayCandle"][value="no"]').check();
  await page.locator('[name="hasAllergies"][value="no"]').check();
}

test('checkout mantiene total y exige aceptar cada cambio antes de reservar',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:568});
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  await expect(page.locator('#checkoutTotal')).toHaveText(/55,00/);
  await expect(page.locator('#checkoutTotal')).toBeInViewport();
  f.product.price=70;
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#checkoutChanges')).toBeVisible();
  await expect(page.locator('#acceptCheckoutChanges')).toBeInViewport();
  await expect(page.locator('#checkoutChangesText')).toContainText('55,00');
  await expect(page.locator('#checkoutChangesText')).toContainText('70,00');
  expect(f.reservations).toHaveLength(0);
  await page.locator('#acceptCheckoutChanges').click();
  expect(f.reservations).toHaveLength(0);
  f.product.price=75;
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#checkoutChangesText')).toContainText('75,00');
  expect(f.reservations).toHaveLength(0);
  await page.locator('#acceptCheckoutChanges').click();
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#drawerStatus')).toContainText('Reserva de prueba bloqueada');
  expect(f.reservations).toHaveLength(1);
});

test('sin cambios comerciales se verifica una vez y no exige confirmación adicional',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  f.product.image='assets/manjar-naranja.jpg';
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#drawerStatus')).toContainText('Reserva de prueba bloqueada');
  await expect(page.locator('#checkoutChanges')).toBeHidden();
  expect(f.reservations).toHaveLength(1);
  await expect(page.locator('#fulfillment option:checked')).toHaveText('Pickup');
  await expect(page.locator('#fulfillmentHelp')).toContainText('Mañongo');
  await page.locator('#fulfillment').selectOption('delivery');
  await expect(page.locator('#fulfillmentHelp')).toContainText('costo confirmado por WhatsApp');
  await expect(page.locator('#customerAddress')).toBeVisible();
});

for(const action of ['edit-contact','back-to-cart'])test(`no reserva si el usuario cambia el pedido durante la validación: ${action}`,async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});
  Object.assign(f.product,{status:'available',availabilityMode:'available',allowPreorder:false,minimumBusinessDays:0,stockTracked:true});
  await checkout(page,f.origin);
  let release;const gate=new Promise(resolve=>{release=resolve;});let validating=false;
  await page.route('**/v1/orders/validate',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':f.origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type'}});
    validating=true;await gate;await route.fulfill({status:200,headers:{'access-control-allow-origin':f.origin},contentType:'application/json',body:'{"ok":true}'});
  });
  await page.locator('#checkoutForm [type="submit"]').click();await expect.poll(()=>validating).toBe(true);
  if(action==='edit-contact')await page.locator('#customerName').fill('');
  else await page.locator('#backToCart').click();
  release();
  await expect(page.locator('#checkoutForm [type="submit"]')).toBeEnabled();
  expect(f.reservations).toHaveLength(0);
  if(action==='edit-contact')await expect(page.locator('#drawerStatus')).toContainText('Los datos del pedido cambiaron');
});

test('búsqueda respeta categoría, marca y estados ARIA y permite recuperarse sin resultados',async({page},testInfo)=>{
  const f=await fixture(page,testInfo);await page.goto(f.origin);
  await page.locator('#catalogSearch').fill('marca de prueba');
  await expect(page.locator('[data-product-id="raviolis"]')).toBeVisible();
  await expect(page.locator('[data-product-id="pistacho"]')).toBeHidden();
  await page.locator('[data-filter="foncake"]').click();
  await expect(page.locator('[data-filter="foncake"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#emptyFilterTitle')).toHaveText('No encontramos ese producto');
  await page.locator('#catalogSearch').fill('');
  await expect(page.locator('[data-product-id="pistacho"]')).toBeVisible();
  await expect(page.locator('#emptyFilterState')).toBeHidden();
});

test('ficha enlazada abre producto sin añadirlo al carrito',async({page},testInfo)=>{
  const f=await fixture(page,testInfo);await page.goto(f.origin+'/?producto=raviolis#menu');
  await expect(page.locator('[data-product-id="raviolis"]')).toHaveClass(/product-expanded/);
  await expect(page.locator('[data-filter="salado"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#cartCount')).toHaveText('0');
  expect(f.reservations).toHaveLength(0);
});

test('imagen fallida termina carga con fallback visible y conserva el producto',async({page},testInfo)=>{
  const f=await fixture(page,testInfo);await page.route('**/*pistachio-raspberry*',r=>r.abort());
  await page.goto(f.origin+'/#menu');
  const card=page.locator('[data-product-id="pistacho"]');await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.product-front .catalog-image-fallback')).toContainText('Imagen no disponible');
  await expect(card.locator('.product-front .product-media')).not.toHaveClass(/catalog-image-loading/);
  await expect(card.locator('.product-front .catalog-image-error')).toHaveCount(1);
  await expect(card.locator('.product-front h3')).toContainText('Torta de prueba');
});

test('controles móviles de sabores y carrito son legibles y contextualizados',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await page.setViewportSize({width:320,height:844});await page.goto(f.origin);
  await page.locator('[data-filter="fonkies"]').click();
  const panel=page.locator('.fonkie-builder .choice-panel').filter({has:page.locator('.fonkie-flavors')});await panel.locator('summary').click();
  const sizes=await panel.locator('.fonkie-stepper button').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
  expect(sizes.length).toBeGreaterThan(0);expect(sizes.every(r=>r.w>=44&&r.h>=44)).toBeTruthy();
  await page.locator('#cartButton').click();
  await expect(page.locator('.cart-item button[aria-label="Sumar Torta de prueba"]')).toBeVisible();
  // Native scrollbars occupy layout width on Linux; compare the usable viewport.
  const viewport=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(viewport.client).toBeGreaterThan(0);
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.client+1);
});

test('reserva protegida: bloquea edición y navegación hasta responder y desbloquea al fallar',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  let release;const gate=new Promise(resolve=>{release=resolve;});let payload;
  await page.route('**/v1/orders/reserve',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    payload=route.request().postDataJSON();await gate;
    await route.fulfill({status:503,headers:{'access-control-allow-origin':f.origin},contentType:'application/json',body:'{"error":"Reserva ficticia rechazada"}'});
  });
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect.poll(()=>payload).toBeTruthy();
  await expect(page.locator('#checkoutForm')).toHaveAttribute('aria-busy','true');
  for(const selector of ['#customerName','#customerPhone','#fulfillment','#backToCart','#closeCart'])await expect(page.locator(selector)).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    document.querySelector('#backToCart').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.querySelector('#closeCart').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const [item]=JSON.parse(localStorage.getItem('fontana-cart-v1'));
    window.changeQty(item.id,1);
  });
  await expect(page.locator('#checkoutForm')).toBeVisible();
  await expect(page.locator('#checkoutTotal')).toHaveText(/55,00/);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fontana-cart-v1'))[0].qty)).toBe(1);
  expect(payload.customer.name).toBe('Cliente ficticio');
  expect(payload.expectedTotalCents).toBe(5500);
  release();
  await expect(page.locator('#drawerStatus')).toContainText('Reserva ficticia rechazada');
  await expect(page.locator('#checkoutForm')).not.toHaveAttribute('aria-busy');
  for(const selector of ['#customerName','#customerPhone','#fulfillment','#backToCart','#closeCart'])await expect(page.locator(selector)).toBeEnabled();
  expect(await page.evaluate(()=>window.__lastWhatsappUrl)).toBeUndefined();
  await page.locator('#backToCart').click();
  await expect(page.locator('#checkoutForm')).toBeHidden();
  await page.locator('#closeCart').click();
  await expect(page.locator('#cartButton')).toBeFocused();
});

test('reserva protegida: cambio de precio entre GET y POST exige aceptar y reenviar',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  const attempts=[];
  await page.route('**/v1/orders/reserve',route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    attempts.push(route.request().postDataJSON());
    if(attempts.length===1){
      f.product.price=70;f.catalog.revision=2;
      return route.fulfill({status:409,headers:{'access-control-allow-origin':f.origin},contentType:'application/json',body:'{"code":"pricing_changed","error":"El precio cambió antes de reservar"}'});
    }
    return route.fulfill({status:503,headers:{'access-control-allow-origin':f.origin},contentType:'application/json',body:'{"error":"Reserva ficticia rechazada"}'});
  });
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#checkoutChanges')).toBeVisible();
  await expect(page.locator('#checkoutChangesText')).toContainText('55,00');
  await expect(page.locator('#checkoutChangesText')).toContainText('70,00');
  await expect(page.locator('#checkoutTotal')).toHaveText(/70,00/);
  expect(attempts).toHaveLength(1);expect(attempts[0].expectedTotalCents).toBe(5500);
  expect(await page.evaluate(()=>window.__lastWhatsappUrl)).toBeUndefined();
  await page.locator('#acceptCheckoutChanges').click();
  expect(attempts).toHaveLength(1);
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#drawerStatus')).toContainText('Reserva ficticia rechazada');
  expect(attempts).toHaveLength(2);expect(attempts[1].expectedTotalCents).toBe(7000);
  expect(await page.evaluate(()=>window.__lastWhatsappUrl)).toBeUndefined();
});

test('reserva protegida: respuesta correcta conserva datos y total al preparar WhatsApp',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  let payload,redirected;
  await page.route('**/v1/orders/reserve',route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    payload=route.request().postDataJSON();
    return route.fulfill({status:200,headers:{'access-control-allow-origin':f.origin},contentType:'application/json',body:JSON.stringify({ok:true,orderCode:'FNT-PRUEBA',totalCents:5500,reservedUntil:new Date(Date.now()+600000).toISOString()})});
  });
  await page.route(/https:\/\/wa\.me\//,route=>{redirected=route.request().url();return route.abort();});
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect.poll(()=>Boolean(redirected)).toBe(true);
  const message=new URL(redirected).searchParams.get('text');
  expect(payload.expectedTotalCents).toBe(5500);
  expect(message).toContain('Pedido FNT-PRUEBA');
  expect(message).toContain('1× Torta de prueba');
  expect(message).toMatch(/Total estimado:.*55,00/);
  expect(message).toContain(`Nombre: ${payload.customer.name}`);
  expect(message).toContain(`Teléfono: ${payload.customer.phone}`);
  expect(message).toContain(payload.customer.requestedDate);
  expect(message).not.toContain('Nombre: null');
});

test('reserva protegida: timeout conserva pedido y clave para recuperar sin duplicar',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  await page.clock.install();
  await page.evaluate(()=>{
    const originalFetch=window.fetch;
    window.fetch=(input,init)=>{
      if(String(input).endsWith('/v1/orders/reserve')){
        window.fetch=originalFetch;
        window.__timedOutReservationPayload=JSON.parse(init.body);
        return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Respuesta ficticia demorada','AbortError')),{once:true}));
      }
      return originalFetch(input,init);
    };
  });
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__timedOutReservationPayload))).toBe(true);
  await expect(page.locator('#customerName')).toBeDisabled();
  await page.clock.fastForward(20_001);
  await expect(page.locator('#drawerStatus')).toContainText('recuperar su estado sin duplicarlo');
  await expect(page.locator('#customerName')).toBeEnabled();
  await expect(page.locator('#customerName')).toHaveValue('Cliente ficticio');
  await expect(page.locator('#checkoutTotal')).toHaveText(/55,00/);
  const timedOut=await page.evaluate(()=>window.__timedOutReservationPayload);
  expect(await page.locator('#checkoutForm').getAttribute('data-reservation-key')).toBe(timedOut.clientKey);
  expect(await page.evaluate(()=>window.__lastWhatsappUrl)).toBeUndefined();
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#drawerStatus')).toContainText('Reserva de prueba bloqueada');
  expect(f.reservations).toHaveLength(1);
  expect(f.reservations[0].clientKey).toBe(timedOut.clientKey);
  expect(f.reservations[0].items).toEqual(timedOut.items);
  expect(f.reservations[0].expectedTotalCents).toBe(timedOut.expectedTotalCents);
});

test('reserva protegida: conflicto con reserva activa conserva la clave y no crea otra',async({page},testInfo)=>{
  const f=await fixture(page,testInfo,{withCart:true});await checkout(page,f.origin);
  const attempts=[];
  await page.route('**/v1/orders/reserve',route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    attempts.push(route.request().postDataJSON());
    return route.fulfill({status:409,headers:{'access-control-allow-origin':f.origin},contentType:'application/json',body:'{"code":"idempotency_conflict","activeReservation":true,"error":"La reserva ficticia anterior sigue activa"}'});
  });
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect(page.locator('#drawerStatus')).toContainText('No creamos otra');
  expect(attempts).toHaveLength(1);
  const originalKey=attempts[0].clientKey;
  expect(await page.locator('#checkoutForm').getAttribute('data-reservation-key')).toBe(originalKey);
  await page.locator('#customerName').fill('Cliente ficticio corregido');
  await page.locator('#checkoutForm [type="submit"]').click();
  await expect.poll(()=>attempts.length).toBe(2);
  await expect(page.locator('#checkoutForm [type="submit"]')).toBeEnabled();
  expect(new Set(attempts.map(attempt=>attempt.clientKey)).size).toBe(1);
  expect(await page.locator('#checkoutForm').getAttribute('data-reservation-key')).toBe(originalKey);
  expect(await page.evaluate(()=>window.__lastWhatsappUrl)).toBeUndefined();
});

test('precio de presentación distingue pendiente de cero y permite solo importes confirmados',async({page},testInfo)=>{
  const f=await fixture(page,testInfo);
  Object.assign(f.catalog.state.products[1],{price:15,sizes:[
    {name:'Pendiente',price:null,status:'available'},
    {name:'Confirmado',price:20,status:'available'},
    {name:'Gratuita',price:0,status:'available'}
  ]});
  await page.goto(f.origin+'/?producto=raviolis#menu');
  const card=page.locator('[data-product-id="raviolis"]');
  await expect(card).toHaveClass(/product-expanded/);
  await expect(card.locator('.product-front .price')).toHaveText(/Desde.*0,00/);
  await expect(card.locator('.product-front .product-selection-summary strong')).toHaveText('Confirmado');
  const size=card.locator('.product-back .product-size');
  await expect(size.locator('option').filter({hasText:'Pendiente'})).toBeDisabled();
  await expect(size.locator('option').filter({hasText:'Pendiente'})).toContainText('Precio por confirmar');
  await expect(size.locator('option').filter({hasText:'Gratuita'})).toBeEnabled();
  await size.selectOption('Confirmado');
  await card.locator('.product-back .add').click();
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fontana-cart-v1')||'[]').length)).toBe(1);
  const item=await page.evaluate(()=>JSON.parse(localStorage.getItem('fontana-cart-v1'))[0]);
  expect(item.price).toBe(20);expect(item.inventory.size).toBe('Confirmado');
  await size.selectOption('Gratuita');
  await card.locator('.product-back .add').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fontana-cart-v1')||'[]').length)).toBe(2);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fontana-cart-v1')).find(item=>item.inventory.size==='Gratuita').price)).toBe(0);
  f.catalog.state.products[1].sizes=[{name:'Pendiente',price:null,status:'available'}];
  await page.reload();
  await expect(card.locator('.product-front .price')).toHaveText('Cotizar');
  await expect(card.locator('.add')).toHaveCount(0);
  await expect(card.locator('.product-back .product-quote')).toBeVisible();
  expect(f.reservations).toHaveLength(0);
});
