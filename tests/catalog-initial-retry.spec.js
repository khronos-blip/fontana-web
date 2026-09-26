const { test, expect } = require('@playwright/test');

const payload = { state: { products: [], builders: {}, settings: {}, operations: { verified: true, electricityEnabled: true } } };

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
