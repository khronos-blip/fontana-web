const { test, expect } = require('@playwright/test');

const payload = { state: { products: [], builders: {}, settings: {}, operations: { verified: true, electricityEnabled: true } } };

test('recupera catálogo por el mismo dominio sin aviso ni recarga', async ({ page }) => {
  await page.route('**/v1/catalog', route => route.abort());
  await page.route('**/api/catalog', route => route.fulfill({ json:payload }));
  await page.goto('http://fontana.localhost:8767/');
  await expect(page.locator('#catalogVerification')).toBeAttached();
  await expect(page.locator('#catalogVerification')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/catalog-unverified/);
});

test('checkout no considera verificada una actualización incompleta', async ({ page }) => {
  let verified = true;
  await page.route('https://api.fontanasingluten.com/v1/**', route => {
    if (!route.request().url().endsWith('/catalog')) return route.fulfill({ json:{ ok:true } });
    return route.fulfill({ json:{ state:{ ...payload.state,
      operations:{ verified, electricityEnabled:true },
      products:[{ id:'audit-cake', name:'Torta de prueba', category:'cakes', price:10,
        status:'available', availabilityMode:'available', image:'assets/manjar-naranja.jpg' }]
    } } });
  });
  await page.goto('http://fontana.localhost:8767/');
  await page.locator('[data-product-id="audit-cake"] .add').click();
  await page.locator('#cartButton').click();
  verified = false;
  await page.locator('#continueCheckout').click();
  await expect(page.locator('#catalogVerification')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/catalog-unverified/);
});

for (const operations of [{ verified:false }, undefined]) {
  test(`catálogo incompleto no oculta el aviso (${JSON.stringify(operations)})`, async ({ page }) => {
    let requests = 0;
    await page.route('**/v1/catalog', route => {
      requests++;
      return route.fulfill({ json:{ state:{ ...payload.state, operations } } });
    });
    await page.goto('http://fontana.localhost:8767/');
    await expect(page.locator('#catalogVerification')).toBeVisible();
    expect(requests).toBe(2);
  });
}

test('primera visita acepta un catálogo que tarda más de dos segundos', async ({ page }) => {
  let requests = 0;
  await page.route('**/v1/catalog', async route => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.fulfill({ json: payload });
  });
  await page.goto('http://fontana.localhost:8767/');
  await expect(page.locator('#catalogVerification')).toBeAttached();
  await expect(page.locator('#catalogVerification')).toBeHidden();
  expect(requests).toBe(1);
});

test('recupera un fallo transitorio sin recargar ni mostrar precios sin verificar', async ({ page }) => {
  let requests = 0;
  await page.route('**/v1/catalog', async route => {
    requests++;
    if (requests === 1) return route.abort();
    return route.fulfill({ json: payload });
  });
  await page.goto('http://fontana.localhost:8767/');
  await expect(page.locator('#catalogVerification')).toBeAttached();
  await expect(page.locator('#catalogVerification')).toBeHidden();
  expect(requests).toBe(2);
});

test('fallo persistente conserva el aviso y limita los reintentos', async ({ page }) => {
  let requests = 0;
  await page.route('**/v1/catalog', route => { requests++; return route.abort(); });
  await page.goto('http://fontana.localhost:8767/');
  await expect(page.locator('#catalogVerification')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/catalog-unverified/);
  expect(requests).toBe(2);
});

test('reintenta también cuando la primera conexión supera el límite', async ({ page }) => {
  let requests = 0;
  await page.route('**/v1/catalog', route => {
    requests++;
    if (requests === 1) return; // No response: the browser must abort it.
    return route.fulfill({ json: payload });
  });
  await page.goto('http://fontana.localhost:8767/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#catalogVerification')).toBeAttached({ timeout: 12000 });
  await expect(page.locator('#catalogVerification')).toBeHidden();
  expect(requests).toBe(2);
});
