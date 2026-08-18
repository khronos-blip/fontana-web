const { test, expect } = require("@playwright/test");
const { readFile } = require("node:fs/promises");
const { Script } = require("node:vm");

async function submitToWhatsApp(page) {
  await page.route("https://wa.me/**", route => route.abort());
  const requestPromise = page.waitForRequest(request => request.url().startsWith("https://wa.me/584244350800?text="));
  await page.locator('#checkoutForm button[type="submit"]').click();
  const request = await requestPromise;
  return new URL(request.url()).searchParams.get("text");
}

test("el build integra la configuración para evitar datos obsoletos", async () => {
  const html = await readFile("dist/index.html", "utf8");

  expect(html).toMatch(/data-store-config="[a-f0-9]{12}"/);
  expect(html).toMatch(/data-store-app="[a-f0-9]{12}"/);
  expect(html).toContain('"Binance"');
  expect(html).not.toContain("Transferencia bancaria");
  expect(html).not.toContain('src="config.js"');
  const appCode = html.match(/<script data-store-app="[a-f0-9]{12}">([\s\S]*?)<\/script>/)?.[1];
  expect(appCode).toBeTruthy();
  expect(() => new Script(appCode)).not.toThrow();
  await expect(readFile("dist/_headers", "utf8")).resolves.toContain("max-age=0");
});

test("cliente prepara un pedido completo para WhatsApp", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-21T12:00:00"));
  await page.goto("/");

  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await expect(page.locator("#cartTotal")).toContainText("60");
  await page.locator("#continueCheckout").click();

  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#fulfillment").selectOption("delivery");
  await expect(page.locator("#addressGroup")).toBeVisible();
  await page.locator("#customerAddress").fill("Mañongo, edificio Fontana");
  await page.locator("#requestedDate").fill("2026-08-24");
  await page.locator("#requestedTime").fill("Después de las 4 pm");
  const paymentOptions = await page.locator("#paymentMethod option").allTextContents();
  expect(paymentOptions).toContain("Binance");
  expect(paymentOptions).toContain("Efectivo en dólares");
  expect(paymentOptions).not.toContain("Transferencia bancaria");
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator('input[name="hasAllergies"][value="no"]').check();
  await page.locator("#customerNotes").fill("Entregar después de las 4 pm");
  await expect(page.locator("#scheduleNotice")).toContainText("Tortas: 1–2 días hábiles");
  await expect(page.locator("#requestedDate")).toHaveAttribute("min", "2026-08-22");
  await expect(page.locator("#paymentNotice")).toContainText("100% del pago por adelantado");
  const message = await submitToWhatsApp(page);
  expect(message).toContain("Pedido FNT-");
  expect(message).toContain("1× Torta de Pistacho y Frambuesa");
  expect(message).toContain("Andrea Pérez");
  expect(message).toContain("Pago Móvil");
  expect(message).toContain("Fecha deseada para Delivery en todo Carabobo (costo confirmado por WhatsApp)");
  expect(message).toContain("Condición de pago: 100% por adelantado");
  expect(message).toContain("Enviaré el comprobante");
});

test("el catálogo usa el diseño solicitado y conserva el pedido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero-logo")).toBeVisible();
  await expect(page.locator(".hero-copy .hero-lead")).toHaveCount(0);
  await expect(page.locator("#cartButton .hamburger-icon")).toBeVisible();
  await expect(page.locator(".product-safety")).toHaveCount(11);
  await expect(page.locator('[data-id="pistacho"] .product-safety summary')).toHaveText("Ingredientes");
  await expect(page.locator('[data-id="pistacho"] .product-safety summary')).not.toContainText("alergias");
  await expect(page.locator('[data-id="pistacho"] .product-safety')).toContainText("semillas de amapola");
  await expect(page.locator('[data-id="naranja"] .product-safety')).toContainText("harina de yuca (10 %)");
  await expect(page.locator('[data-id="naranja"] .product-safety')).toContainText("semillas de amapola");
  await expect(page.locator('[data-id="chocolate"] .product-safety')).toContainText("chispas de chocolate vegano");
  await expect(page.locator('[data-id="vainilla"] .product-safety')).toContainText("chispas de chocolate vegano");
  await expect(page.locator('[data-id="lemon"] .product-safety')).toContainText("chocolate blanco vegano");
  await expect(page.locator('[data-id="bombones"] .product-safety')).toContainText("Bombones de autor");
  await expect(page.locator('[data-id="bombones"] .product-safety')).not.toContainText("trufa");
  await expect(page.locator('[data-id="fonkie-box"]')).toContainText("Chips Ahoy Fit");
  await expect(page.locator("#fonkieIngredients")).toContainText("crema de dátiles");
  await expect(page.locator('[data-id="pistacho"] .price')).toHaveText("$60");
  await expect(page.locator('[data-id="chocolate"] .price')).toHaveText("$47");
  await expect(page.locator('[data-id="vainilla"] .price')).toHaveText("$47");
  await expect(page.locator('[data-id="lemon"] .price')).toHaveText("$47");
  await expect(page.locator('[data-id="naranja"] .price')).toHaveText("$47");
  await expect(page.locator('[data-id="zanahoria"] .price')).toHaveText("$47");
  await expect(page.locator('[data-id="pistacho-clasico"] .price')).toHaveText("$55");
  await expect(page.locator('[data-id="zanahoria"] img')).toHaveAttribute("src", "assets/zanahoria-fontana-v2.jpg");
  await expect(page.locator('[data-id="pistacho-clasico"] img')).toHaveAttribute("src", "assets/pistacho-fontana-v3.jpg");
  await expect(page.locator('[data-id="pistacho"] img')).toHaveAttribute("src", "assets/pistachio-raspberry-fontana-v2.jpg");
  await expect(page.locator('[data-id="chocolate"] img')).toHaveAttribute("src", "assets/chocolate-fontana-v2.jpg");
  await expect(page.locator('[data-id="vainilla"] img')).toHaveAttribute("src", "assets/vanilla-chips-fontana-v2.jpg");
  await expect(page.locator('[data-id="fonkie-box"] img')).toHaveAttribute("src", "assets/fonkie-fontana-v2.jpg");
  await expect(page.locator('[data-id="lemon"] img')).toHaveAttribute("src", "assets/lemon-fontana-v2.jpg");
  await expect(page.locator('[data-id="bombones"] .price')).toHaveText("$15");
  await expect(page.locator('[data-id="bombones-12"] .price')).toHaveText("$30");
  await expect(page.locator('[data-id="fonkie"]')).toHaveCount(0);
  await expect(page.locator('[data-id="fonkie-mix"]')).toHaveCount(0);
  await expect(page.locator(".fonkie-flavor")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Promo del día" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bebidas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrega inmediata" })).toBeVisible();
  await expect(page.locator('[data-id="pasta-ricotta"] .price')).toHaveText("$20");
  await expect(page.locator('[data-id="pasta-carne"] .price')).toHaveText("$20");
  await expect(page.locator('[data-id="pasta-ricotta"] .product-safety')).toContainText("harina de maíz");
  await expect(page.locator('[data-id="pasta-carne"] .product-safety')).toContainText("carne sazonada");
  await expect(page.locator("#menu .demo-note")).not.toContainText("ilustrativos");
  await expect(page.locator("#menu .section-head p")).toHaveCount(0);
  await expect(page.locator(".product-tag:visible")).toHaveCount(0);
  await expect(page.locator(".pillar-icon")).toHaveCount(0);
  await expect(page.locator(".story-visual")).toHaveCount(0);
  await expect(page.locator(".footer-logo")).toHaveAttribute("src", "assets/fontana-logo-official-reverse.png");
  await expect(page.locator(".pillar").first()).toContainText("Cocina estrictamente libre de gluten");
  const cakeTitles = await page.locator('.product[data-category="cakes"] h3').allTextContents();
  expect(cakeTitles.every(title => title.startsWith("Torta de "))).toBe(true);
  const productColumns = await page.locator(".products").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(productColumns).toBe(2);
  await expect(page.locator('[data-id="pistacho"] .product-body')).toHaveCSS("background-color", "rgb(234, 213, 237)");
  const productNumbers = await page.locator(".product").evaluateAll(products => products.slice(0, 3).map(product => getComputedStyle(product, "::after").content));
  expect(productNumbers.every(content => content === "none" || content === "normal")).toBe(true);
  const runtimeConfig = await page.evaluate(() => window.FONTANA_CONFIG);
  expect(runtimeConfig.whatsappNumber).toBe("584244350800");
  expect(runtimeConfig.previewMode).toBe(false);
  expect(runtimeConfig.leadTimesByProduct.pistacho.minimumBusinessDays).toBe(1);
  expect(runtimeConfig.leadTimesByProduct["pistacho-clasico"].minimumBusinessDays).toBe(1);
  expect(runtimeConfig.dynamicCatalog).toEqual([]);
});

test("las nuevas secciones quedan listas sin inventar productos", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Promo del día" }).click();
  await expect(page.locator("#emptyFilterState")).toBeVisible();
  await expect(page.locator("#emptyFilterTitle")).toHaveText("Promo del día");
  await expect(page.locator("#emptyFilterMessage")).toContainText("promociones activas");
  await expect(page.locator(".product:visible, .fonkie-builder:visible")).toHaveCount(0);

  await page.getByRole("button", { name: "Bebidas" }).click();
  await expect(page.locator("#emptyFilterTitle")).toHaveText("Bebidas");
  await expect(page.locator("#emptyFilterMessage")).toContainText("bebidas confirmadas");

  await page.getByRole("button", { name: "Entrega inmediata" }).click();
  await expect(page.locator("#emptyFilterTitle")).toHaveText("Entrega inmediata");
  await expect(page.locator("#emptyFilterMessage")).toContainText("disponibles para entrega inmediata");

  await page.getByRole("button", { name: "Todos" }).click();
  await expect(page.locator("#emptyFilterState")).toBeHidden();
  await expect(page.locator('.product[data-id="pistacho"]')).toBeVisible();
  await expect(page.locator(".fonkie-builder")).toBeVisible();
});

test("el configurador de Fonkies calcula precios e incluye sabores en WhatsApp", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-21T12:00:00"));
  await page.goto("/");
  const chocoPlus = page.getByRole("button", { name: "Sumar Chips de Chocolate Oscuro" });
  const chocoMinus = page.getByRole("button", { name: "Restar Chips de Chocolate Oscuro" });
  const pistachoPlus = page.getByRole("button", { name: "Sumar Pistacho con Chocolate Blanco" });
  for (let index = 0; index < 4; index += 1) await chocoPlus.click();
  await expect(page.locator("#fonkieCount")).toHaveText("Has seleccionado 4 Fonkies");
  await expect(page.locator("#fonkieTotal")).toContainText("15,00");
  await expect(page.locator("#addFonkieBox")).toBeEnabled();

  await chocoPlus.click();
  await expect(page.locator("#fonkieTotal")).toContainText("18,50");
  await chocoMinus.click();
  await chocoMinus.click();
  await pistachoPlus.click();
  await expect(page.locator("#fonkieCount")).toHaveText("Has seleccionado 4 Fonkies");
  await expect(page.locator("#fonkieTotal")).toContainText("17,00");
  await pistachoPlus.click();
  await expect(page.locator("#fonkieTotal")).toContainText("20,50");
  await page.locator("#addFonkieBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator("#cartTotal")).toContainText("20,50");
  await expect(page.locator(".cart-choices")).toContainText("3 Chips de Chocolate Oscuro, 2 Pistacho con Chocolate Blanco");
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#productChoicesGroup")).toBeHidden();
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#requestedDate").fill("2026-08-21");
  await page.locator("#requestedTime").fill("4:00 pm - 6:00 pm");
  await page.locator('input[name="hasAllergies"][value="no"]').check();
  const message = await submitToWhatsApp(page);
  expect(message).toContain("1× Caja de 5 Fonkies · Mixta");
  expect(message).toContain("Sabores: 3 Chips de Chocolate Oscuro, 2 Pistacho con Chocolate Blanco");
  expect(message.replace(/\u00a0/g, " ")).toContain("USD 20,50");
});

test("el menú permanece visible y la ubicación conserva Mañongo", async ({ page }) => {
  await page.goto("/");

  const nav = page.locator("#nav");
  const brand = nav.locator(".brand");
  const wordmark = brand.locator(".brand-wordmark");
  await expect(nav).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(wordmark).toBeVisible();
  await expect(wordmark).toHaveAttribute("src", "assets/fontana-wordmark-official.png");
  await expect(nav.getByRole("link", { name: "Menú", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Reseñas", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ubicación", exact: true })).toBeVisible();
  await expect(nav.getByText("Más pedida")).toHaveCount(0);
  await expect(page.locator("#mas-pedida")).toHaveCount(0);
  await expect(page.locator("#ubicacion h2")).toHaveText("Mañongo.");
  await expect(page.locator("#ubicacion")).toContainText("delivery en todo Carabobo");
  await expect(page.locator("#ubicacion")).toContainText("se confirman por WhatsApp");
  await expect(page.locator("#ubicacion")).toContainText("9:30 am — 6:00 pm");
  await expect(page.getByText("TerraNostra")).toHaveCount(0);
  await expect(nav).toHaveCSS("background-color", "rgba(234, 213, 237, 0.96)");
  await expect(page.locator("#menu")).toHaveCSS("background-image", /linear-gradient/);

  const heroClearsFixedNav = await page.evaluate(() => {
    const navBottom = document.querySelector("#nav").getBoundingClientRect().bottom;
    const heroTop = document.querySelector("#inicio").getBoundingClientRect().top;
    const heroRect = document.querySelector("#inicio").getBoundingClientRect();
    const logoRect = document.querySelector(".hero-logo").getBoundingClientRect();
    return heroTop >= navBottom - 1
      && logoRect.top >= heroRect.top
      && logoRect.bottom <= heroRect.bottom;
  });
  expect(heroClearsFixedNav).toBe(true);

  await nav.getByRole("link", { name: "Ubicación", exact: true }).click();
  const clearsFixedNav = await page.evaluate(() => {
    const navBottom = document.querySelector("#nav").getBoundingClientRect().bottom;
    const headingTop = document.querySelector("#ubicacion h2").getBoundingClientRect().top;
    return headingTop >= navBottom;
  });
  expect(clearsFixedNav).toBe(true);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(nav).toBeVisible();
  await expect(brand).toBeVisible();
  await expect(nav.getByRole("link", { name: "Menú", exact: true })).toBeVisible();
  await expect(nav).toHaveCSS("position", "fixed");
});

test("un pedido con alergias queda marcado para revisión", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-21T12:00:00"));
  await page.goto("/");
  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#requestedDate").fill("2026-08-24");
  await page.locator("#requestedTime").fill("4:00 pm - 6:00 pm");
  await page.locator('input[name="hasAllergies"][value="yes"]').check();
  await page.locator('input[name="allergens"][value="Frutos secos"]').check();
  await expect(page.locator("#allergyNote-pistacho")).toBeVisible();
  await expect(page.locator("#allergyNote-pistacho").locator("xpath=following-sibling::small")).toContainText("semillas de amapola");
  await page.locator("#allergyNote-pistacho").fill("No agregar pistacho; confirmar si la receta puede adaptarse");
  await page.locator("#crossContamination").check();
  const message = await submitToWhatsApp(page);
  expect(message).toContain("Frutos secos");
  expect(message).toContain("Torta de Pistacho y Frambuesa: No agregar pistacho");
  expect(message).toContain("PENDIENTE DE REVISIÓN POR FONTANA");
});
