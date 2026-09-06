const {test, expect} = require('@playwright/test');
const path = require('node:path');

// Exercise the real production UI against an isolated, mutable API. No request
// made by these tests can reach customer records or the public catalog.
const origin = 'http://fontana.localhost:8767';
const inventoryPath = '/v1/admin/inventory/';
const catalogPath = '/v1/admin/catalog';
const imagePath = '/v1/admin/images';
const imageFixture = path.resolve(__dirname, '../assets/manjar-naranja.jpg');
const skuA = 'product:pistacho:base:base';
const skuB = 'product:naranja:base:base';
const initialStockDate = '2026-09-06T12:00:00.000Z';
const externalStockDate = '2026-09-06T12:01:00.000Z';
const savedStockDate = '2026-09-06T12:02:00.000Z';
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

async function panel(page, settings = {}) {
  const writes = [];
  const items = [
    {sku:skuA, productId:'pistacho', kind:'product', label:'Pistacho de prueba', onHand:5, reserved:0, available:5, trackStock:true, updatedAt:initialStockDate},
    {sku:skuB, productId:'naranja', kind:'product', label:'Naranja de prueba', onHand:5, reserved:0, available:5, trackStock:true, updatedAt:initialStockDate}
  ];
  await page.route('https://api.fontanasingluten.com/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    const headers = {'access-control-allow-origin':origin, 'access-control-allow-credentials':'true',
      'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers':'content-type'};
    const send = (body, status = 200) => route.fulfill({status, headers, contentType:'application/json', body:JSON.stringify(body)});
    if (request.method() === 'OPTIONS') return route.fulfill({status:204, headers});
    if (pathname === '/v1/auth/login') return send({ok:true, username:'safety-test', role:'owner'});
    if (pathname === '/v1/auth/logout') { settings.onLogout?.(); return send({ok:true}); }
    if (request.method() !== 'GET') {
      const body = pathname === imagePath ? null : request.postDataJSON();
      writes.push({path:pathname, body:clone(body)});
      const imageNumber = writes.filter(write => write.path === imagePath).length;
      const result = await settings.onWrite?.(pathname, body);
      if (result?.status) return send(result.body, result.status);
      if (pathname.startsWith(inventoryPath)) {
        const item = items.find(entry => entry.sku === decodeURIComponent(pathname.slice(inventoryPath.length)));
        Object.assign(item, {onHand:body.onHand, available:body.onHand-item.reserved, trackStock:body.trackStock, updatedAt:savedStockDate});
        return send(clone(item));
      }
      if (pathname === imagePath) {
        const result = await settings.imageResponse?.(imageNumber);
        return send(result?.body || {url:'https://api.fontanasingluten.com/v1/images/late-test.jpg'}, result?.status || 200);
      }
      return send({ok:true, revision:1});
    }
    if (pathname === catalogPath) return send({state:null, revision:0});
    if (pathname === '/v1/admin/operations') return send({electricityEnabled:true});
    if (pathname === '/v1/admin/inventory') {
      const result = settings.onInventory?.(items);
      if (result?.status) return send(result.body, result.status);
      return send({items:clone(items), summary:{available:10, reserved:0, tracked:2, soldOut:0}});
    }
    if (pathname === '/v1/admin/users') return send({items:[], currentUser:'safety-test', canManageUsers:true});
    if (pathname === '/v1/admin/accounting/summary') return send({paymentsByCurrency:[], paymentsByMethod:[]});
    return send({items:[], summary:{}});
  });
  await page.goto(`${origin}/admin/`);
  await page.locator('#loginUsername').fill('safety-test');
  await page.locator('#loginPassword').fill('isolated-test-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  await expect(page.locator('#inventoryList [data-sku]')).toHaveCount(2);
  return writes;
}

function row(page, sku) { return page.locator(`#inventoryList [data-sku="${sku}"]`); }
async function inventory(page) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/admin/inventory' && response.request().method() === 'GET');
  await page.locator('[data-view="inventory"]').click();
  await (await response).finished();
  await expect(row(page, skuA)).toBeVisible();
}
async function product(page, id) {
  await page.locator('[data-view="products"]').click();
  await page.locator(`[data-edit="${id}"]`).click();
  await expect(page.locator('#productDialog')).toBeVisible();
  return page.locator('#productForm');
}
async function closeDialog(page, id) {
  await page.locator(`${id} [data-close-dialog]`).first().click();
  await expect(page.locator(id)).not.toBeVisible();
}
async function releaseResponse(page, pathname, pending) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() !== 'OPTIONS');
  pending.resolve();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function publish(page, writes) {
  const previous = writes.filter(write => write.path === catalogPath).length;
  await page.locator('#saveAll').click();
  await expect.poll(() => writes.filter(write => write.path === catalogPath).length).toBe(previous+1);
  await expect(page.locator('#saveAll')).toBeEnabled();
  return writes.filter(write => write.path === catalogPath).at(-1).body.state;
}
async function importCopy(page, catalog) {
  await page.locator('#adminMenuButton').click();
  await page.locator('[data-menu-view="backup"]').click();
  await page.locator('#importInput').setInputFiles({name:'copia-aislada.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(catalog))});
  await expect(page.locator('#adminToast')).toContainText('Copia cargada');
}

test('Inventario: una cantidad vacía no se convierte ni se guarda como cero', async ({page}) => {
  const writes = await panel(page);
  await inventory(page);
  const input = row(page, skuA).locator('[data-stock-value]');
  await input.fill('');
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect(page.locator('#adminToast')).toContainText(/cantidad|entero/i);
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(row(page, skuA).locator('[data-track-stock]')).toBeDisabled();
  await expect(row(page, skuA).locator('[data-stock-help]')).toContainText('cantidad válida');
  expect(writes).toEqual([]);
});

test('Inventario: guardar B y filtrar no descarta la cantidad pendiente de A', async ({page}) => {
  const writes = await panel(page);
  await inventory(page);
  await row(page, skuA).locator('[data-stock-value]').fill('7');
  await row(page, skuB).locator('[data-stock-delta="1"]').click();
  await expect(row(page, skuB).locator('[data-stock-value]')).toHaveValue('6');
  await expect(row(page, skuB).locator('[data-save-stock]')).toBeEnabled();
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
  await page.locator('#inventorySearch').fill('Naranja');
  await expect(row(page, skuA)).toHaveCount(0);
  await page.locator('#inventorySearch').fill('');
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes.map(write => write.body.onHand)).toEqual([6,7]);
});

test('Inventario: una fila pendiente sigue bloqueada después de guardar otra y recargar', async ({page}) => {
  const pending = deferred(), pathA = `${inventoryPath}${encodeURIComponent(skuA)}`;
  const writes = await panel(page, {onWrite:async pathname => { if (pathname === pathA) await pending.promise; }});
  await inventory(page);
  await row(page, skuA).locator('[data-stock-value]').fill('7');
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect.poll(() => writes.filter(write => write.path === pathA).length).toBe(1);
  await expect(row(page, skuA).locator('[data-stock-value]')).toBeDisabled();
  await row(page, skuB).locator('[data-stock-delta="1"]').click();
  await expect(row(page, skuB).locator('[data-save-stock]')).toBeEnabled();
  await inventory(page);
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
  for (const selector of ['[data-stock-value]', '[data-stock-delta="1"]', '[data-save-stock]']) {
    await expect(row(page, skuA).locator(selector)).toBeDisabled();
  }
  expect(writes.filter(write => write.path === pathA)).toHaveLength(1);
  await releaseResponse(page, pathA, pending);
  await expect(row(page, skuA).locator('[data-save-stock]')).toBeEnabled();
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
});

test('Inventario: el control con existencias positivas no ofrece una falsa desactivación', async ({page}) => {
  const writes = await panel(page);
  await inventory(page);
  const control = row(page, skuA).locator('[data-track-stock]');
  await expect(control).toBeChecked();
  await expect(control).toBeDisabled();
  expect(writes).toEqual([]);
  // Once the actual quantity reaches zero the existing business rule permits
  // choosing whether this reference should remain under stock control.
  await row(page, skuA).locator('[data-stock-value]').fill('0');
  await expect(control).toBeEnabled();
  await control.uncheck();
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({onHand:0, trackStock:false});
});

test('Inventario: conserva la versión de origen al refrescar y un conflicto 409 exige reintento explícito', async ({page}) => {
  let externalChange = false, attempts = 0;
  const pathA = `${inventoryPath}${encodeURIComponent(skuA)}`;
  const writes = await panel(page, {
    onInventory:items => {
      if (!externalChange) return;
      Object.assign(items.find(item => item.sku === skuA), {onHand:9, available:9, updatedAt:externalStockDate});
      externalChange = false;
    },
    onWrite:async pathname => {
      if (pathname === pathA && ++attempts === 1) return {status:409, body:{error:'El inventario cambió en otro dispositivo', code:'stale_state'}};
    }
  });
  await inventory(page);
  await row(page, skuA).locator('[data-stock-value]').fill('7');
  externalChange = true;
  await inventory(page);
  await expect(row(page, skuA)).toContainText('9 disponibles');
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
  expect(writes).toEqual([]);
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect(page.locator('#adminToast')).toContainText(/cambió.*otro dispositivo/i);
  await expect(row(page, skuA).locator('[data-save-stock]')).toBeEnabled();
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({onHand:7, expectedOnHand:5, expectedUpdatedAt:initialStockDate});
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toMatchObject({onHand:7, expectedOnHand:9, expectedUpdatedAt:externalStockDate});
  await expect(row(page, skuA).locator('[data-save-stock]')).toBeEnabled();
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
});

test('Inventario: un guardado confirmado sobrevive a un fallo posterior de lectura y al filtrado', async ({page}) => {
  let failReads = false;
  const writes = await panel(page, {
    onWrite:async pathname => { if (pathname.startsWith(inventoryPath)) failReads = true; },
    onInventory:() => failReads ? {status:500, body:{error:'Lectura temporalmente no disponible'}} : undefined
  });
  await inventory(page);
  await row(page, skuA).locator('[data-stock-value]').fill('7');
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect(page.locator('#adminToast')).toContainText('No se pudo cargar el inventario');
  await expect(row(page, skuA).locator('[data-save-stock]')).toBeEnabled();
  await expect(row(page, skuA)).toContainText('7 disponibles');
  await page.locator('#inventorySearch').fill('Naranja');
  await expect(row(page, skuA)).toHaveCount(0);
  await page.locator('#inventorySearch').fill('');
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('7');
  await row(page, skuA).locator('[data-stock-value]').fill('8');
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toMatchObject({onHand:8, expectedOnHand:7, expectedUpdatedAt:savedStockDate});
});

test('Cerrar sesión descarta solo el borrador confirmado y no lo restaura al volver a entrar', async ({page}) => {
  const writes = await panel(page);
  await inventory(page);
  await row(page, skuA).locator('[data-stock-value]').fill('7');
  await page.locator('#adminMenuButton').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#logoutButton').click();
  await expect(page.locator('#loginView')).toBeVisible();
  await page.locator('#loginPassword').fill('isolated-test-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  await inventory(page);
  await expect(row(page, skuA).locator('[data-stock-value]')).toHaveValue('5');
  expect(writes).toEqual([]);
});

test('Cerrar sesión durante un guardado pendiente se bloquea sin enviar otra petición de salida', async ({page}) => {
  const pending = deferred(), pathA = `${inventoryPath}${encodeURIComponent(skuA)}`;
  let logoutRequests = 0;
  await panel(page, {
    onLogout:() => { logoutRequests += 1; },
    onWrite:async pathname => { if (pathname === pathA) await pending.promise; }
  });
  const baselineLogouts = logoutRequests;
  await inventory(page);
  await row(page, skuA).locator('[data-stock-value]').fill('7');
  await row(page, skuA).locator('[data-save-stock]').click();
  await expect(row(page, skuA).locator('[data-save-stock]')).toBeDisabled();
  await page.locator('#adminMenuButton').click();
  await page.locator('#logoutButton').click();
  await expect(page.locator('#adminToast')).toContainText(/termine.*guardado/i);
  await expect(page.locator('#adminApp')).toBeVisible();
  expect(logoutRequests).toBe(baselineLogouts);
  await releaseResponse(page, pathA, pending);
  await expect(row(page, skuA).locator('[data-save-stock]')).toBeEnabled();
});

test('Inventario móvil y escritorio: error visible, controles útiles y sin desbordamiento ni errores de consola', async ({page, browserName}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await panel(page);
  for (const width of [390,1366]) {
    await page.setViewportSize({width, height:width === 390 ? 844 : 900});
    await inventory(page);
    await row(page, skuA).locator('[data-stock-value]').fill('');
    await row(page, skuA).locator('[data-save-stock]').click();
    const notice = page.locator('#adminToast');
    await expect(notice).toContainText('cantidad');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCSS('opacity', '1');
    // The nonmodal notice intentionally lets pointer events pass through;
    // elementFromPoint cannot determine its visual visibility.
    expect(await notice.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth && !document.querySelector('dialog[open]');
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const selector of ['[data-save-stock]', '[data-stock-delta="1"]', '[data-stock-delta="-1"]']) {
      const bounds = await row(page, skuA).locator(selector).boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({path:`/tmp/fontana-safety-inventory-${browserName}-${width}.png`});
    await row(page, skuA).locator('[data-stock-value]').fill('5');
  }
  expect(errors).toEqual([]);
});

for (const kind of ['fonkies', 'fomb']) test(`${kind}: precios negativos o vacíos no se publican desde ningún botón`, async ({page}) => {
  const writes = await panel(page);
  await page.locator(`[data-view="${kind}"]`).click();
  const editor = page.locator(`#${kind}Editor`);
  await editor.locator('.builder-settings summary').click();
  const prices = kind === 'fonkies'
    ? ['[data-builder-field="singlePrice"]','[data-builder-field="mixedPrice"]','[data-builder-field="extraPrice"]']
    : ['[data-builder-size="0"]','[data-builder-size="1"]','[data-builder-field="extraPrice"]'];
  for (const selector of prices) {
    const input = editor.locator(selector), previous = await input.inputValue();
    for (const invalid of ['-5', '']) {
      await input.fill(invalid);
      await editor.locator('[data-save-builder]').click();
      await expect(page.locator('#adminToast')).toContainText(/precio|válid|complet|número/i);
      expect(writes).toEqual([]);
      await page.locator('#saveAll').click();
      expect(writes).toEqual([]);
      await expect(input).toHaveValue(invalid);
    }
    await input.fill(previous);
  }
  const saved = await publish(page, writes);
  const builder = saved.builders[kind];
  expect(builder.extraPrice).toBeGreaterThanOrEqual(0);
  if (kind === 'fonkies') expect(builder.singlePrice).toBeGreaterThanOrEqual(0);
  else expect(builder.sizes.every(size => Number.isFinite(size.price) && size.price >= 0)).toBe(true);
});

for (const kind of ['producto', 'sabor']) test(`Imagen de ${kind}: la subida bloquea guardar y su respuesta no contamina otra ficha`, async ({page}) => {
  const pending = deferred();
  const writes = await panel(page, {onWrite:async pathname => { if (pathname === imagePath) await pending.promise; }});
  const isProduct = kind === 'producto', dialog = isProduct ? '#productDialog' : '#flavorDialog';
  const form = page.locator(isProduct ? '#productForm' : '#flavorForm');
  if (isProduct) await product(page, 'pistacho');
  else {
    await page.locator('[data-view="fonkies"]').click();
    await page.locator('[data-edit-flavor="fonkies:0"]').click();
  }
  await page.locator(isProduct ? '#productImageInput' : '#flavorImageInput').setInputFiles(imageFixture);
  await expect.poll(() => writes.filter(write => write.path === imagePath).length).toBe(1);
  await expect(form.locator('[type="submit"]')).toBeDisabled();
  await form.dispatchEvent('submit');
  await expect(page.locator(dialog)).toBeVisible();
  await expect(page.locator(`${dialog} #adminToast`)).toContainText(/imagen|subida/i);
  expect(writes.filter(write => write.path === catalogPath)).toHaveLength(0);
  await closeDialog(page, dialog);
  if (isProduct) await product(page, 'naranja');
  else await page.locator('[data-edit-flavor="fonkies:1"]').click();
  const originalImage = await form.locator('[name="image"]').inputValue();
  const originalName = await form.locator('[name="name"]').inputValue();
  await expect(form.locator('[type="submit"]')).toBeEnabled();
  await releaseResponse(page, imagePath, pending);
  await expect(form.locator('[name="image"]')).toHaveValue(originalImage);
  await expect(form.locator('[name="name"]')).toHaveValue(originalName);
  await form.locator('[type="submit"]').click();
  await expect(page.locator(dialog)).not.toBeVisible();
  const saved = await publish(page, writes);
  expect(isProduct ? saved.products.find(item => item.id === 'naranja').image : saved.builders.fonkies.flavors[1].image).toBe(originalImage);
});

test('Dos imágenes consecutivas: prevalece la última elegida aunque la primera termine después', async ({page}) => {
  const pending = deferred();
  const writes = await panel(page, {imageResponse:async number => {
    if (number === 1) await pending.promise;
    return {body:{url:`https://api.fontanasingluten.com/v1/images/selection-${number}.jpg`}};
  }});
  const form = await product(page, 'pistacho');
  await page.locator('#productImageInput').setInputFiles(imageFixture);
  await expect.poll(() => writes.filter(write => write.path === imagePath).length).toBe(1);
  await page.locator('#productImageInput').setInputFiles(path.resolve(__dirname, '../assets/lemon-fontana-v2.jpg'));
  await expect(form.locator('[name="image"]')).toHaveValue('https://api.fontanasingluten.com/v1/images/selection-2.jpg');
  await expect(form.locator('[type="submit"]')).toBeEnabled();
  await releaseResponse(page, imagePath, pending);
  await expect(form.locator('[name="image"]')).toHaveValue('https://api.fontanasingluten.com/v1/images/selection-2.jpg');
});

test('Una subida fallida conserva la imagen y permite repetir el mismo archivo', async ({page}) => {
  await panel(page, {imageResponse:async number => number === 1
    ? {status:503, body:{error:'Fallo aislado de subida'}}
    : {body:{url:'https://api.fontanasingluten.com/v1/images/retry.jpg'}}});
  await page.locator('[data-view="fonkies"]').click();
  await page.locator('[data-edit-flavor="fonkies:0"]').click();
  const form = page.locator('#flavorForm'), previous = await form.locator('[name="image"]').inputValue();
  await page.locator('#flavorImageInput').setInputFiles(imageFixture);
  await expect(page.locator('#flavorDialog #adminToast')).toContainText(/no.*subir|fallo|conexión/i);
  await expect(form.locator('[name="image"]')).toHaveValue(previous);
  await expect(form.locator('[type="submit"]')).toBeEnabled();
  await page.locator('#flavorImageInput').setInputFiles(imageFixture);
  await expect(form.locator('[name="image"]')).toHaveValue('https://api.fontanasingluten.com/v1/images/retry.jpg');
  await expect(form.locator('[type="submit"]')).toBeEnabled();
});

test('Copia inválida: JSON roto y constructor incompleto conservan todo el borrador', async ({page}) => {
  const writes = await panel(page);
  const form = await product(page, 'pistacho');
  await form.locator('[name="name"]').fill('Borrador aislado que debe conservarse');
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#productDialog')).not.toBeVisible();
  for (const content of ['{"products":', JSON.stringify({products:[], builders:{fomb:{}}})]) {
    await page.locator('#adminMenuButton').click();
    await page.locator('[data-menu-view="backup"]').click();
    await page.locator('#importInput').setInputFiles({name:'copia-invalida.json', mimeType:'application/json', buffer:Buffer.from(content)});
    await expect(page.locator('#adminToast')).toContainText(/no.*válid|inválid/i);
    await page.locator('[data-view="products"]').click();
    await expect(page.locator('[data-product-id="pistacho"]')).toContainText('Borrador aislado que debe conservarse');
    await expect(page.locator('#saveStatus')).toContainText('pendientes');
  }
  expect(writes).toEqual([]);
  const saved = await publish(page, writes);
  expect(saved.products.find(item => item.id === 'pistacho').name).toBe('Borrador aislado que debe conservarse');
  expect(saved.builders.fomb.sizes.length).toBeGreaterThan(0);
  expect(saved.builders.fonkies.flavors.length).toBeGreaterThan(0);
});

test('Copia válida Fomb: una única presentación se edita y publica sin inventar otra caja', async ({page}) => {
  const writes = await panel(page), catalog = clone(await publish(page, writes));
  catalog.builders.fomb.sizes = [{quantity:4, price:15}];
  await importCopy(page, catalog);
  await page.locator('[data-view="fomb"]').click();
  const editor = page.locator('#fombEditor');
  await editor.locator('.builder-settings summary').click();
  await expect(editor.locator('[data-builder-size]')).toHaveCount(1);
  await editor.locator('[data-builder-size="0"]').fill('16');
  const saved = await publish(page, writes);
  expect(saved.builders.fomb.sizes).toEqual([{quantity:4, price:16}]);
});

test('Presentación histórica sin precio: abrir y guardar conserva null, no lo convierte en cero', async ({page}) => {
  const writes = await panel(page), catalog = clone(await publish(page, writes));
  catalog.products.find(item => item.id === 'raviolis').sizes[0].price = null;
  await importCopy(page, catalog);
  const form = await product(page, 'raviolis');
  await expect(form.locator('[name="sizes"]')).toHaveValue(/\| null \|/);
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#productDialog')).not.toBeVisible();
  const saved = await publish(page, writes), item = saved.products.find(item => item.id === 'raviolis');
  expect(item.sizes).toHaveLength(2);
  expect(item.sizes[0].price).toBeNull();
  expect(item.variants).toHaveLength(2);
});

test('Presentaciones: coma decimal válida y errores explícitos sin perder tamaños ni variantes', async ({page}) => {
  const writes = await panel(page);
  const form = await product(page, 'raviolis');
  const variants = await form.locator('[name="variants"]').inputValue();
  await form.locator('[name="sizes"]').fill('400 g | 4,50 | available\n800 g | 8.50 | available');
  await form.locator('[type="submit"]').click();
  await expect(page.locator('#productDialog')).not.toBeVisible();
  await product(page, 'raviolis');
  const validSizes = await form.locator('[name="sizes"]').inputValue();
  await expect(form.locator('[name="variants"]')).toHaveValue(variants);
  for (const invalid of ['400 g | | available\n800 g | 8.50', '400 g | -5 | available\n800 g | 8.50']) {
    await form.locator('[name="sizes"]').fill(invalid);
    await form.locator('[type="submit"]').click();
    await expect(page.locator('#productDialog')).toBeVisible();
    await expect(page.locator('#productDialog #adminToast')).toContainText(/precio|presentaci|válid/i);
    await expect(form.locator('[name="sizes"]')).toHaveValue(invalid);
    await closeDialog(page, '#productDialog');
    await product(page, 'raviolis');
    await expect(form.locator('[name="sizes"]')).toHaveValue(validSizes);
    await expect(form.locator('[name="variants"]')).toHaveValue(variants);
  }
  await closeDialog(page, '#productDialog');
  const saved = await publish(page, writes), raviolis = saved.products.find(item => item.id === 'raviolis');
  expect(raviolis.sizes.map(({name, price}) => ({name, price}))).toEqual([{name:'400 g',price:4.5},{name:'800 g',price:8.5}]);
  expect(raviolis.variants).toHaveLength(2);
});
