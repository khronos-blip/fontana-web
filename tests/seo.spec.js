const { test, expect } = require("@playwright/test");
const { readFile, readdir, stat } = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const productionPreview = "http://127.0.0.1:8768";
const bottegaAssets = [
  "de-cecco-tortiglioni-fontana.jpg",
  "de-cecco-penne-rigate-fontana.jpg",
  "de-cecco-linguine-fontana.jpg",
  "de-cecco-aceite-oliva-classico-fontana.jpg",
  "pecorino-romano-dop-fontana.jpg",
  "provolone-valpadana-piccante-fontana.jpg",
  "apetina-tomates-secos-fontana.jpg",
  "apetina-feta-aceitunas-negras-fontana.jpg",
  "arla-lactofree-queso-fresco-fontana.jpg",
  "cirio-passata-fontana.jpg",
  "barilla-pesto-sin-ajo-fontana.jpg"
];

test("el build publica JavaScript versionado sin inflar el HTML principal", async () => {
  const html = await readFile(path.join(process.cwd(), "dist/index.html"), "utf8");
  expect(html).toMatch(/<script src="config\.[a-f0-9]{12}\.js"><\/script>/);
  expect(html).toMatch(/<script src="app\.[a-f0-9]{12}\.js"><\/script>/);
  expect(html).not.toContain("data-store-app");
  expect(html).toContain("Precios expresados en REF.");
  expect(html).not.toMatch(/>\$\d/);
  expect(Buffer.byteLength(html)).toBeLessThan(150_000);
  const files = await readdir(path.join(process.cwd(), "dist"));
  const appFile = files.find(file => /^app\.[a-f0-9]{12}\.js$/.test(file));
  const configFile = files.find(file => /^config\.[a-f0-9]{12}\.js$/.test(file));
  expect(appFile).toBeTruthy();
  expect(configFile).toBeTruthy();
  expect((await stat(path.join(process.cwd(), "dist", appFile))).size).toBeGreaterThan(100_000);
});

test("el sitemap generado incluye categorías y fichas de producto", async () => {
  const sitemap = await readFile(path.join(process.cwd(), "dist/sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  expect(locations).toContain("https://fontanasingluten.com/");
  expect(locations).toContain("https://fontanasingluten.com/tortas-sin-gluten-carabobo/");
  expect(locations).toContain("https://fontanasingluten.com/fonkies-galletas-sin-gluten/");
  expect(locations).toContain("https://fontanasingluten.com/fomb-bombones-sin-azucar/");
  expect(locations).toContain("https://fontanasingluten.com/salados-sin-gluten-carabobo/");
  expect(locations).toContain("https://fontanasingluten.com/bottega/");
  expect(locations).toContain("https://fontanasingluten.com/productos/pistacho/");
  expect(locations).toContain("https://fontanasingluten.com/informacion-del-pedido/");
  expect(locations).toContain("https://fontanasingluten.com/privacidad/");
  expect(locations.length).toBeGreaterThanOrEqual(30);
  expect(new Set(locations).size).toBe(locations.length);
});

test("el build publica confianza, privacidad y una página 404 útil", async ({ page }) => {
  const information = await readFile(path.join(process.cwd(), "dist/informacion-del-pedido/index.html"), "utf8");
  const privacy = await readFile(path.join(process.cwd(), "dist/privacidad/index.html"), "utf8");
  const notFound = await readFile(path.join(process.cwd(), "dist/404.html"), "utf8");
  expect(information).toContain("Cambios o cancelaciones");
  expect(information).toContain("Alergias, intolerancias y condiciones");
  expect(privacy).toContain("Qué información se solicita");
  expect(privacy).toContain("Cloudflare");
  expect(notFound).toContain('content="noindex,follow"');
  expect(notFound).toContain("Volver al menú");

  await page.goto(`${productionPreview}/informacion-del-pedido/`);
  await expect(page.locator("h1")).toHaveText("Información del pedido");
  await expect(page.getByRole("link", { name: "Consultar por WhatsApp" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("las imágenes responsivas conservan el original de alta resolución", async () => {
  const homepage = await readFile(path.join(process.cwd(), "dist/index.html"), "utf8");
  const category = await readFile(path.join(process.cwd(), "dist/tortas-sin-gluten-carabobo/index.html"), "utf8");
  expect(homepage).toContain("assets/responsive/");
  expect(homepage).toContain("assets/pistachio-raspberry-fontana-v2.jpg 1448w");
  expect(category).toContain("/assets/responsive/");
  expect(category).toContain("/assets/pistachio-raspberry-fontana-v2.jpg 1448w");
  expect(homepage).toContain("https://fontanasingluten.com/assets/fontana-og-share.jpg");
  expect((await stat(path.join(process.cwd(), "dist/assets/fontana-og-share.jpg"))).size).toBeGreaterThan(100_000);
});

test("los 11 assets de Bottega son JPEG decodificables de 1200 por 1200", async () => {
  expect(bottegaAssets).toHaveLength(11);
  for (const filename of bottegaAssets) {
    for (const root of ["assets", path.join("dist", "assets")]) {
      const asset = path.join(process.cwd(), root, "bottega", filename);
      const metadata = await sharp(asset).metadata();
      expect(metadata.format, asset).toBe("jpeg");
      expect(metadata.width, asset).toBe(1200);
      expect(metadata.height, asset).toBe(1200);
    }
  }
});

test("las categorías SEO son rastreables, útiles y responsivas", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${productionPreview}/tortas-sin-gluten-carabobo/`);
    await expect(page).toHaveTitle("Tortas sin gluten en Carabobo | Fontana");
    await expect(page.locator("h1")).toHaveText("Tortas sin gluten en Carabobo");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://fontanasingluten.com/tortas-sin-gluten-carabobo/");
    await expect(page.locator(".product-card")).toHaveCount(14);
    await expect(page.getByRole("link", { name: "Ver producto y sus ingredientes" }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(consoleErrors).toEqual([]);
});

test("Bottega tiene una página SEO propia y enlaza sus productos", async ({ page }) => {
  const html = await readFile(path.join(process.cwd(), "dist/bottega/index.html"), "utf8");
  expect(html).toContain('href="https://fontanasingluten.com/bottega/"');
  expect(html).toContain("Bottega");

  for (const viewport of [{ width:390, height:844 }, { width:1366, height:900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${productionPreview}/bottega/`);
    await expect(page.locator("h1")).toContainText("Bottega");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://fontanasingluten.com/bottega/");
    await expect(page.locator(".product-card")).toHaveCount(11);
    await expect(page.locator(".product-card .price")).toHaveText(Array(11).fill("REF 10,00"));
    await expect(page.getByRole("link", { name: "Ver producto y sus ingredientes" }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("las fichas Bottega publican REF 10 sin afirmar stock no administrado", async ({ page }) => {
  await page.goto(`${productionPreview}/productos/bottega-de-cecco-tortiglioni/`);
  await expect(page.locator("h1")).toHaveText("De Cecco Tortiglioni Senza Glutine");
  const publishedPrice = page.locator(".detail-facts .fact").filter({ hasText:"Precio publicado" }).locator("strong");
  await expect(publishedPrice).toHaveText("REF 10,00");
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(jsonLd)["@graph"];
  const product = graph.find(item => item["@type"] === "Product");
  expect(product).toBeTruthy();
  expect(product.offers).toMatchObject({
    "@type":"Offer",
    price:10,
    priceCurrency:"USD"
  });
  expect(product.offers).not.toHaveProperty("availability");
  expect(product.brand).toEqual({ "@type":"Brand", name:"De Cecco" });
});

test("cada ficha publica Product, Offer y contenido visible equivalente", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${productionPreview}/productos/pistacho/`);
  await expect(page.locator("h1")).toHaveText("Torta de Pistacho y Frambuesa");
  await expect(page.getByRole("heading", { name: "Ingredientes publicados" })).toBeVisible();
  await expect(page.getByText("REF 60,00")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("USD");
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(jsonLd)["@graph"];
  const product = graph.find(item => item["@type"] === "Product");
  expect(product.name).toBe("Torta de Pistacho y Frambuesa");
  expect(product.offers.price).toBe(60);
  expect(product.offers.priceCurrency).toBe("USD");
  expect(product.offers.availability).toBe("https://schema.org/InStock");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la portada conserva el H1 accesible sin mostrar una frase bajo el logo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${productionPreview}/`);
  const heading = page.locator("h1.hero-seo-title");
  await expect(heading).toHaveText("Postres sin gluten y sin azúcar en Carabobo");
  const headingBox = await heading.boundingBox();
  expect(headingBox.width).toBeLessThanOrEqual(1);
  expect(headingBox.height).toBeLessThanOrEqual(1);
  await expect(page.locator(".product.product-flip-ready").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Tortas", exact: true })).toHaveAttribute("href", "/tortas-sin-gluten-carabobo/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
