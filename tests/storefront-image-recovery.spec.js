const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');

test.beforeEach(async ({ page }) => {
  const source = await readFile(require.resolve('../app.js'), 'utf8');
  const extract = (start, end) => {
    const from = source.indexOf(`  function ${start}(`);
    const to = source.indexOf(`  function ${end}(`, from + 1);
    if (from < 0 || to < 0) throw new Error(`Missing image helper ${start}`);
    return source.slice(from, to);
  };
  await page.setContent('<style>.catalog-image-error,.catalog-image-pending{opacity:0}.product-media{position:relative;width:200px;height:200px}</style><article class="product"><div class="product-media"><img src="data:image/png;base64,aW52YWxpZA==" alt="Nombre anterior"><div class="product-tags">Disponible</div></div></article>');
  await page.addScriptTag({ content: [
    extract('syncElementAttributes', 'morphCatalogElement'),
    extract('morphCatalogElement', 'reconcileGalleryCards'),
    extract('stabilizeCatalogImage', 'setupCatalogImageStability')
  ].join('\n') });
  await page.waitForFunction(() => document.querySelector('img').complete);
  await page.evaluate(() => stabilizeCatalogImage(document.querySelector('img')));
  await expect(page.locator('.catalog-image-fallback')).toContainText('Nombre anterior · Imagen no disponible');
});

test('UX imagen: una imagen fallida conserva fallback tras hidratar el mismo src', async ({ page }) => {
  await page.evaluate(() => {
    const current = document.querySelector('.product');
    window.originalImage = current.querySelector('img');
    const next = document.createElement('article');
    next.className = 'product';
    next.innerHTML = '<div class="product-media"><img src="data:image/png;base64,aW52YWxpZA==" alt="Nombre publicado"><div class="product-tags">Preordenar</div></div>';
    morphCatalogElement(current, next);
    stabilizeCatalogImage(current.querySelector('img'));
  });
  expect(await page.evaluate(() => document.querySelector('img') === window.originalImage)).toBe(true);
  await expect(page.locator('.catalog-image-fallback')).toHaveCount(1);
  await expect(page.locator('.catalog-image-fallback')).toContainText('Nombre publicado · Imagen no disponible');
  await expect(page.locator('img')).toHaveClass(/catalog-image-error/);
  await expect(page.locator('.product-media')).not.toHaveClass(/catalog-image-loading/);
});

test('UX imagen: la recuperación elimina el fallback y puede volver a informar otro fallo', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('img').src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>');
  });
  await expect(page.locator('.catalog-image-fallback')).toHaveCount(0);
  await expect(page.locator('img')).not.toHaveClass(/catalog-image-error|catalog-image-pending/);
  await page.evaluate(() => { document.querySelector('img').src = 'data:image/png;base64,c2VndW5kbyBmYWxsbw=='; });
  await expect(page.locator('.catalog-image-fallback')).toHaveCount(1);
  await expect(page.locator('img')).toHaveClass(/catalog-image-error/);
  await expect(page.locator('.product-media')).not.toHaveClass(/catalog-image-loading/);
});

test('UX imagen: las copias de galería inicializan sus propios eventos de recuperación', async ({ page }) => {
  await page.evaluate(() => {
    const current = document.querySelector('.product');
    const clone = current.cloneNode(true);
    clone.querySelector('.catalog-image-fallback').remove();
    current.replaceWith(clone);
    stabilizeCatalogImage(clone.querySelector('img'));
    stabilizeCatalogImage(clone.querySelector('img'));
  });
  await expect(page.locator('.catalog-image-fallback')).toHaveCount(1);
  await page.evaluate(() => {
    document.querySelector('img').src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>');
  });
  await expect(page.locator('.catalog-image-fallback')).toHaveCount(0);
  await expect(page.locator('img')).not.toHaveClass(/catalog-image-error|catalog-image-pending/);
});
