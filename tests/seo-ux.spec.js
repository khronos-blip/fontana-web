const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');

let renderer;
let categories;
test.beforeAll(async () => {
  renderer = await import('../seo-render.mjs');
  categories = (await import('../seo-data.mjs')).categoryPages;
});

const product = overrides => ({
  id: 'producto-prueba', category: 'salado', name: 'Producto de prueba',
  description: 'Descripción publicada.', ingredients: 'Ingredientes publicados.',
  image: 'assets/ravioli-fontana-pro.jpg', price: 15, weight: '300 G',
  status: 'available', availabilityMode: 'available', minimumBusinessDays: 0,
  stockTracked: true, ...overrides
});
const render = item => renderer.productPage(item, categories.find(c => c.id === item.category), 'seo.css');
const schemaProduct = html => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'].find(item => item['@type'] === 'Product');
const availability = html => html.match(/<p class="product-availability"[^>]*>[\s\S]*?<\/p>/)[0];

for (const entry of [
  { name: 'disponible', fields: {}, text: 'Disponible', state: 'available', schema: 'InStock' },
  { name: 'agotado manual', fields: { availabilityMode: 'sold-out', status: 'sold-out' }, text: 'Agotado', state: 'sold-out', schema: 'OutOfStock' },
  { name: 'inventario agotado pese a modo disponible', fields: { status: 'sold-out' }, text: 'Agotado', state: 'sold-out', schema: 'OutOfStock' },
  { name: 'preorden con preparación publicada', fields: { status: 'sold-out', availabilityMode: 'preorder', minimumBusinessDays: 2 }, text: 'Preordenar · 2 días de preparación', state: 'preorder', schema: 'PreOrder' },
  { name: 'preorden sin inventar plazo ausente', fields: { status: 'sold-out', availabilityMode: 'preorder' }, text: 'Preordenar · plazo a confirmar', state: 'preorder', schema: 'PreOrder' },
  { name: 'pausa temporal prevalece sobre preorden', fields: { status: 'sold-out', availabilityMode: 'preorder', temporarilyUnavailable: true, minimumBusinessDays: 2 }, text: 'Temporalmente no disponible', state: 'paused', schema: 'OutOfStock' },
  { name: 'Bottega sin inventario verificado', fields: { category: 'bottega', stockTracked: false }, text: 'Disponibilidad por confirmar', state: 'pending', schema: null },
  { name: 'constructor sin caja inmediata verificada', fields: { category: 'fomb', immediateBoxAvailable: false }, text: 'Sabores sujetos a disponibilidad', state: 'pending', schema: null },
  { name: 'constructor con caja inmediata verificada', fields: { category: 'fomb', immediateBoxAvailable: true }, text: 'Disponible', state: 'available', schema: 'InStock' }
]) {
  test(`SEO UX: comunica ${entry.name} sin cambiar presentación ni precio`, () => {
    const html = render(product(entry.fields));
    expect(availability(html)).toContain(`data-availability="${entry.state}"`);
    expect(availability(html)).toContain(entry.text);
    expect(html).toContain('<small>Presentación</small><strong>300 G</strong>');
    expect(html).toContain('REF\u00a015,00');
    const offer = schemaProduct(html).offers;
    expect(offer.price).toBe(15);
    if (entry.schema) expect(offer.availability).toBe(`https://schema.org/${entry.schema}`);
    else expect(offer).not.toHaveProperty('availability');
  });
}

test('SEO UX: conserva precios y disponibilidad individual de las presentaciones', () => {
  const item = product({ sizes: [
    { name: '180 g', price: 15, status: 'sold-out' },
    { name: '300 g', price: 20, status: 'available' }
  ] });
  const html = render(item);
  expect(html).toContain('180 g · REF\u00a015,00 · Agotado');
  expect(html).toContain('300 g · REF\u00a020,00 · Disponible');
  expect(html).toContain('<small>Precio publicado</small><strong>REF\u00a020,00</strong>');
  expect(schemaProduct(html).offers.map(offer => ({ price: offer.price, availability: offer.availability }))).toEqual([
    { price: 15, availability: 'https://schema.org/OutOfStock' },
    { price: 20, availability: 'https://schema.org/InStock' }
  ]);
  const paused = render({ ...item, temporarilyUnavailable: true });
  expect(schemaProduct(paused).offers.every(offer => offer.availability.endsWith('/OutOfStock'))).toBe(true);
  expect(paused).not.toContain('300 g · REF\u00a020,00 · Disponible');
});

test('SEO UX: no inventa precio para Fonkies ni presentación cuando solo hay texto de disponibilidad', () => {
  const item = product({ id: 'fonkie-box', category: 'fonkies', price: null, weight: '', availabilityLabel: 'POR ENCARGO · 2 DÍAS' });
  const html = render(item);
  expect(schemaProduct(html)).not.toHaveProperty('offers');
  expect(html).toContain('Precio por confirmar');
  expect(html).toContain('<small>Presentación</small><strong>Presentación por confirmar</strong>');
  expect(html).not.toContain('<small>Presentación</small><strong>POR ENCARGO');
});

test('SEO UX: la preorden autorizada permite encargar presentaciones sin stock de hoy', () => {
  const html = render(product({
    availabilityMode: 'preorder', status: 'sold-out', allowPreorder: true, minimumBusinessDays: 2,
    sizes: [{ name: '300 g', price: 20, status: 'sold-out' }]
  }));
  expect(html).toContain('300 g · REF\u00a020,00 · Preordenar · 2 días de preparación');
  expect(schemaProduct(html).offers[0].availability).toBe('https://schema.org/PreOrder');
});

test('SEO UX: CTA conserva el identificador del producto y de ambos constructores', () => {
  for (const [id, category] of [['producto-prueba', 'salado'], ['fonkie-box', 'fonkies'], ['fomb-box', 'fomb']]) {
    const html = render(product({ id, category }));
    expect(html).toContain(`href="/?producto=${id}#menu"`);
    expect(html).toContain(`<link rel="canonical" href="https://fontanasingluten.com/productos/${id}/">`);
  }
  const unsafe = render(product({ id: 'nombre & "especial"' }));
  expect(unsafe).toContain('href="/?producto=nombre%20%26%20%22especial%22#menu"');
});

test('SEO UX: la categoría muestra disponibilidad y conserva enlaces e importes', () => {
  const items = [product(), product({ id: 'agotado', status: 'sold-out' }), product({ id: 'preorden', status: 'sold-out', availabilityMode: 'preorder', minimumBusinessDays: 3 })];
  const html = renderer.categoryPage(categories.find(c => c.id === 'salado'), items, 'seo.css');
  expect((html.match(/class="product-availability"/g) || []).length).toBe(3);
  expect(html).toContain('Preordenar · 3 días de preparación');
  expect(html).toContain('href="/productos/agotado/"');
  expect((html.match(/REF\u00a015,00/g) || []).length).toBe(3);
});

test('SEO UX: disponibilidad legible y contenida en móvil y escritorio', async ({ page }) => {
  await page.route('**/*', route => route.abort());
  const styles = await readFile(require.resolve('../seo.css'), 'utf8');
  const html = render(product({ status: 'sold-out', availabilityMode: 'preorder', minimumBusinessDays: 2 }));
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: styles });
    const state = page.locator('.detail-copy .product-availability');
    await expect(state).toBeVisible();
    await expect(state).toContainText('Preordenar · 2 días de preparación');
    const layout = await state.evaluate(el => ({
      viewport: document.documentElement.clientWidth,
      right: el.getBoundingClientRect().right,
      left: el.getBoundingClientRect().left,
      font: parseFloat(getComputedStyle(el.querySelector('strong')).fontSize),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    }));
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.font).toBeGreaterThanOrEqual(15);
  }
});
