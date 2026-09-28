const { test, expect } = require('@playwright/test');

for (const width of [390, 1366]) {
  test(`Layer Cake gallery preserves consultation and selected photo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/\/config(?:\.[a-f0-9]+)?\.js(?:\?.*)?$/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('previewMode: false', 'previewMode: true') });
    });
    await page.goto('/');
    const card = page.locator('.product[data-product-id="layer-cake"]');
    await expect(card).toHaveAttribute('data-photo-index', '0');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'Foto siguiente' }).click();
    await expect(card).toHaveAttribute('data-photo-index', '1');
    await expect(card).not.toHaveClass(/product-expanded/);
    await page.waitForTimeout(250);
    await card.locator('.product-media img').click();
    await expect(card).toHaveClass(/product-flipped/);
    await expect(card).not.toHaveClass(/product-expanded-animating/);
    await expect(card.getByText('Cotizar', { exact: true }).last()).toBeVisible();
    await expect(card.getByRole('link', { name: /Consultar .* por WhatsApp/i })).toHaveAttribute('href', /wa\.me/);
    await card.getByRole('button', { name: 'Foto siguiente' }).click();
    await expect(card).toHaveAttribute('data-photo-index', '0');
    await page.waitForTimeout(250);
    await card.getByRole('button', { name: 'Foto anterior' }).click();
    await expect(card).toHaveAttribute('data-photo-index', '1');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/fontana-layer-gallery-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(card).not.toHaveClass(/product-expanded/);
    await expect(card).toHaveAttribute('data-photo-index', '1');
    await expect(card.locator('.product-media img')).toHaveAttribute('src', /layer-cake-crema-fontana/);
  });
}
