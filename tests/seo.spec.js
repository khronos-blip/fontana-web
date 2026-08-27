const { test, expect } = require("@playwright/test");
const { readFile, readdir, stat } = require("node:fs/promises");
const path = require("node:path");

const productionPreview = "http://127.0.0.1:8768";

test("el build publica JavaScript versionado sin inflar el HTML principal", async () => {
  const html = await readFile(path.join(process.cwd(), "dist/index.html"), "utf8");
  expect(html).toMatch(/<script src="config\.[a-f0-9]{12}\.js"><\/script>/);
  expect(html).toMatch(/<script src="app\.[a-f0-9]{12}\.js"><\/script>/);
  expect(html).not.toContain("data-store-app");
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
  expect(locations).toContain("https://fontanasingluten.com/productos/pistacho/");
  expect(locations.length).toBeGreaterThanOrEqual(30);
  expect(new Set(locations).size).toBe(locations.length);
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

test("cada ficha publica Product, Offer y contenido visible equivalente", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${productionPreview}/productos/pistacho/`);
  await expect(page.locator("h1")).toHaveText("Torta de Pistacho y Frambuesa");
  await expect(page.getByRole("heading", { name: "Ingredientes publicados" })).toBeVisible();
  await expect(page.getByText("USD 60,00")).toBeVisible();
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(jsonLd)["@graph"];
  const product = graph.find(item => item["@type"] === "Product");
  expect(product.name).toBe("Torta de Pistacho y Frambuesa");
  expect(product.offers.price).toBe(60);
  expect(product.offers.priceCurrency).toBe("USD");
  expect(product.offers.availability).toBe("https://schema.org/InStock");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la portada de producción conserva el H1 visible y la tienda funcional", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${productionPreview}/`);
  const heading = page.locator("h1.hero-seo-title");
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText("Postres sin gluten y sin azúcar en Carabobo");
  await expect(page.locator(".product.product-flip-ready").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Tortas", exact: true })).toHaveAttribute("href", "/tortas-sin-gluten-carabobo/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
