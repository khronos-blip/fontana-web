const { test, expect } = require("@playwright/test");

async function openPreview(page) {
  await page.route("**/config.js", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace("previewMode: false", "previewMode: true");
    await route.fulfill({ response, body });
  });
  await page.goto("/");
}

async function fillCheckout(page, { allergies = false } = {}) {
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  const minimumDate = await page.locator("#requestedDate").getAttribute("min");
  await page.locator("#requestedDate").fill(minimumDate);
  await page.locator("#requestedTime").fill("Después de las 4 pm");
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator(`input[name="hasAllergies"][value="${allergies ? "yes" : "no"}"]`).check();
  if (allergies) {
    await page.locator('input[name="allergens"][value="Frutos secos"]').check();
    await page.locator('[name^="allergyNote:"]').first().fill("Evitar frutos secos");
    await page.locator("#crossContamination").check();
  }
}

test("cliente prepara un pedido completo para WhatsApp", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await expect(page.locator("#cartCount")).toHaveText("1");
  await fillCheckout(page);
  await page.locator('#checkoutForm button[type="submit"]').click();

  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Pedido FNT-");
  expect(message).toContain("1× Torta de Pistacho y Frambuesa");
  expect(message).toContain("USD 60,00");
  expect(message).toContain("Andrea Pérez");
  expect(message).toContain("Enviaré el comprobante");
});

test("Fonkies calcula cajas iguales, mixtas y extras", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await expect(page.locator(".fonkie-builder .fonkie-flavors")).toBeVisible();
  await expect(page.locator(".fonkie-builder .choice-panel > summary")).toHaveCount(0);
  const firstPlus = page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"] [data-delta="1"]');
  for (let index = 0; index < 4; index += 1) await firstPlus.click();
  await expect(page.locator("#fonkieTotal")).toContainText("15,00");
  await firstPlus.click();
  await expect(page.locator("#fonkieTotal")).toContainText("18,50");
  await page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"] [data-delta="-1"]').click();
  await page.locator('.fonkie-flavor[data-flavor="Pistacho con Chocolate Blanco"] [data-delta="1"]').click();
  await expect(page.locator("#fonkieTotal")).toContainText("20,50");
  await page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"] [data-delta="-1"]').click();
  await expect(page.locator("#fonkieTotal")).toContainText("17,00");
  await expect(page.locator("#addFonkieBox")).toBeEnabled();
});

test("Fonkies bloquea cajas de menos de cuatro unidades", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator("#addFonkieBox")).toBeDisabled();
  await expect(page.locator("#fonkieValidation")).toHaveText("Mínimo 4 galletas para armar tu caja.");
  await expect(page.locator('.fonkie-flavor[data-flavor="Chispa de Chocolate Blanco"]')).toHaveCount(1);
  await expect(page.locator('img[src="assets/fonkie-white-chocolate-chips-fontana-pro.jpg"]')).toHaveCount(1);
  await expect(page.locator('.fonkie-flavor[data-flavor="Chips Ahoy Fit"]')).toHaveCount(1);
  await expect(page.locator('img[src="assets/fonkie-chips-ahoy-fit-fontana-pro.jpg"]')).toHaveCount(1);
  await expect(page.locator(".fonkie-gallery-card img").first()).toHaveCSS("object-position", "50% 50%");
});

test("Fomb usa una publicación con caja de 4, caja de 12 y extras", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator(".fomb-builder")).toHaveCount(1);
  await expect(page.locator('img[src="assets/fomb-raffaello-fontana-pro.jpg"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await page.locator(".fomb-builder .choice-panel > summary").click();
  await expect(page.locator("#fombTotal")).toContainText("15,00");
  await page.locator("#fombExtraPlus").click();
  await expect(page.locator("#fombTotal")).toContainText("18,50");
  await page.locator('input[name="fombSize"][value="12"]').check();
  await expect(page.locator("#fombTotal")).toContainText("33,50");
  await page.locator("#addFombBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item h4")).toContainText("Caja de 13 Fomb");
});

test("las galerías de Fonkies y Fomb están centradas y no recortan las fotos", async ({ page }, testInfo) => {
  await openPreview(page);
  const galleries = [
    { filter: "Fonkies · Galletas", selector: ".fonkie-gallery", track: ".fonkie-gallery-track", card: ".fonkie-gallery-card", screenshot: "galeria-fonkies-movil.png" },
    { filter: "Fomb · Bombones", selector: ".builder-gallery", track: ".builder-gallery-track", card: ".builder-gallery-card", screenshot: "galeria-fomb-movil.png" }
  ];
  for (const item of galleries) {
    await page.getByRole("button", { name: item.filter }).click();
    const selector = item.selector;
    const gallery = page.locator(selector);
    const track = gallery.locator(item.track);
    const card = track.locator(item.card).first();
    const image = card.locator("img");
    await expect(track).toBeVisible();
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(image).toHaveCSS("object-position", "50% 50%");
    const centered = await track.evaluate(element => {
      const parent = element.parentElement.getBoundingClientRect();
      const own = element.getBoundingClientRect();
      return Math.abs((own.left + own.width / 2) - (parent.left + parent.width / 2)) < 1;
    });
    expect(centered).toBe(true);
    await track.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(item.screenshot), fullPage: false });
  }
});

test("catálogo incluye productos confirmados y fotos profesionales", async ({ page }) => {
  await openPreview(page);
  await expect(page.getByRole("button", { name: "Foncake · Tortas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fonkies · Galletas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fomb · Bombones" })).toBeVisible();
  await expect(page.locator('[data-product-id="ballerine"]')).toContainText("12,00");
  await expect(page.locator('[data-product-id="crumbl-blueberry"]')).toContainText("47,00");
  await expect(page.locator('[data-product-id="brownie-fit"]')).toContainText("38,00");
  await page.getByRole("button", { name: "Bebidas" }).click();
  await expect(page.locator('[data-product-id="agua-minalba-600"]')).toBeVisible();
  await expect(page.locator('[data-product-id="san-pellegrino"]')).toContainText("5,00");
  await expect(page.locator('[data-product-id="san-pellegrino"] img')).toHaveAttribute("src", "assets/beverage-sanpellegrino-fontana-pro.jpg");
  await expect(page.locator('[data-product-id="agua-gasificada-minalba"] img')).toHaveAttribute("src", "assets/beverage-minalba-limon-fontana-pro.jpg");
  await page.getByRole("button", { name: "Entrega inmediata" }).click();
  await expect(page.locator('[data-product-id="agua-minalba-600"]')).toBeVisible();
  await page.getByRole("button", { name: "Salados" }).click();
  await expect(page.locator('[data-product-id="nuggets-rora"] img')).toHaveAttribute("src", "assets/nuggets-rora-fontana-pro.jpg");
});

test("los días de preparación incluyen los domingos", async ({ page }) => {
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  const expectedTomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 1);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  });
  await expect(page.locator("#requestedDate")).toHaveAttribute("min", expectedTomorrow);
});

test("los filtros muestran los productos sin barras desplegables", async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await openPreview(page);
  const cakes = page.locator('.catalog-group[data-catalog-group="cakes"]');
  const fonkies = page.locator('.catalog-group[data-catalog-group="fonkies"]');
  await expect(page.locator(".catalog-group > summary")).toHaveCount(0);
  await expect(cakes).toBeVisible();
  await expect(fonkies).toBeVisible();
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await expect(fonkies.locator(".fonkie-builder")).toBeVisible();
  await expect(cakes).toBeHidden();
  const standardFilterBorder = await page.getByRole("button", { name: "Salados" }).evaluate(button => getComputedStyle(button).borderTopColor);
  const dynamicFilterBorder = await page.getByRole("button", { name: "Promoción del día" }).evaluate(button => getComputedStyle(button).borderTopColor);
  expect(dynamicFilterBorder).toBe(standardFilterBorder);
  await page.getByRole("button", { name: "Salados" }).click();
  const salado = page.locator('.catalog-group[data-catalog-group="salado"]');
  await expect(salado).toBeVisible();
  await expect(cakes).toBeHidden();
  const fitsMobileViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsMobileViewport).toBe(true);
  await salado.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("catalogo-movil.png"), fullPage: false });
  expect(browserErrors).toEqual([]);
});

test("el bloque negro fue eliminado y el footer centra la marca", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator(".pillars")).toHaveCount(0);
  await expect(page.locator("footer .footer-brand")).toHaveCSS("text-align", "center");
  await expect(page.locator(".hero-logo")).toBeVisible();
  await expect(page.locator(".nav .brand-seal")).toHaveCount(1);
  await expect(page.locator(".nav .brand-symbol, .nav .brand-wordmark")).toHaveCount(0);
  await expect(page.locator("#cartButton .hamburger-icon")).toBeVisible();
  const brokenImages = await page.locator("img").evaluateAll(images => images.filter(image => !image.naturalWidth).map(image => image.getAttribute("src")));
  expect(brokenImages).toEqual([]);
});

test("el menú permanece visible y la ubicación solo indica Mañongo", async ({ page }, testInfo) => {
  await openPreview(page);
  const nav = page.locator("#nav");
  await expect(nav.getByRole("link", { name: "Menú", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Reseñas", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ubicación", exact: true })).toBeVisible();
  await expect(page.locator("#ubicacion h2")).toHaveText("Mañongo.");
  await expect(page.locator("#ubicacion .eyebrow")).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(page.locator("#ubicacion .location-copy p")).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(page.locator("#ubicacion .hours b").first()).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(page.locator("#ubicacion .hours span").first()).toHaveCSS("color", "rgb(79, 22, 81)");
  await nav.getByRole("link", { name: "Ubicación", exact: true }).click();
  await page.locator("#ubicacion h2").scrollIntoViewIfNeeded();
  await expect(page.locator("#ubicacion h2")).toBeInViewport();
  const clearsFixedNav = await page.evaluate(() => document.querySelector("#ubicacion h2").getBoundingClientRect().top >= document.querySelector("#nav").getBoundingClientRect().bottom);
  expect(clearsFixedNav).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ubicacion-movil.png"), fullPage: false });
});

test("un pedido con alergias queda marcado para revisión", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await fillCheckout(page, { allergies: true });
  await page.locator('#checkoutForm button[type="submit"]').click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Frutos secos");
  expect(message).toContain("Evitar frutos secos");
  expect(message).toContain("PENDIENTE DE REVISIÓN POR FONTANA");
});
