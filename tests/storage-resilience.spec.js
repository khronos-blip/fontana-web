const { test, expect } = require('@playwright/test');

test('carrito sigue funcionando si guardar excede la cuota y avisa al cliente', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); };
  });
  await page.goto('/');
  await expect(page.locator('.product').first()).toHaveClass(/product-flip-ready/);
  await page.locator('.product .add:not(:disabled)').first().click();
  await page.locator('#cartButton').click();
  await expect(page.locator('#cartStorageNotice')).toBeVisible();
  await expect(page.locator('#cartItems')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('acceso administrativo funciona con almacenamiento denegado', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  await page.route('https://api.fontanasingluten.com/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json = { items: [], summary: {} };
    if (path.includes('/auth/')) json = { ok: true, username: 'audit', role: 'owner' };
    if (path === '/v1/admin/catalog') json = { state: null, revision: 0 };
    if (path === '/v1/admin/operations') json = { electricityEnabled: true };
    return route.fulfill({ json });
  });
  await page.goto('http://fontana.localhost:8767/admin/');
  await expect(page.locator('#loginStatus')).toContainText('Confirma tu acceso');
  await page.locator('#loginUsername').fill('audit');
  await page.locator('#loginPassword').fill('isolated-test-only');
  await page.locator('#loginButton').click();
  await expect(page.locator('#adminApp')).toBeVisible();
  expect(errors).toEqual([]);
});
