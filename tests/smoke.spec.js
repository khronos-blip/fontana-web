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
  await expect(page.locator(".fonkie-builder .choice-panel")).toHaveAttribute("open", "");
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
  await expect(page.locator(".fonkie-gallery-card img").first()).toHaveCSS("object-fit", "cover");
});

test("el selector de Fonkies es compacto en escritorio y puede plegarse", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const panel = page.locator(".fonkie-builder .choice-panel");
  const columns = await page.locator(".fonkie-flavors").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  await panel.locator("summary").click();
  await expect(page.locator(".fonkie-flavors")).toBeHidden();
  await panel.locator("summary").click();
  await expect(page.locator(".fonkie-flavors")).toBeVisible();
});

test("el selector móvil de Fonkies distribuye los sabores en dos columnas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const columns = await page.locator(".fonkie-flavors").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  const lastFlavor = page.locator(".fonkie-flavor").last();
  await expect(lastFlavor).toHaveCSS("grid-column-start", "1");
  await expect(lastFlavor).toHaveCSS("grid-column-end", "-1");
  await expect(lastFlavor).toHaveCSS("justify-content", "center");
  await expect(page.locator('.fonkie-flavor[data-flavor="Chispa de Chocolate Blanco"] [data-delta="1"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test("las galerías de Fonkies y Fomb ocupan todo el marco y mantienen el producto centrado", async ({ page }, testInfo) => {
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
    await expect(gallery.locator(".gallery-swipe-cue")).toContainText("Desliza para ver más");
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(image).toHaveCSS("object-position", "50% 50%");
    const fillsTrack = await card.evaluate(element => {
      const cardBox = element.getBoundingClientRect();
      const trackBox = element.parentElement.getBoundingClientRect();
      return Math.abs(cardBox.width - trackBox.width) < 1 && Math.abs(cardBox.left - trackBox.left) < 1;
    });
    expect(fillsTrack).toBe(true);
    const centered = await track.evaluate(element => {
      const parent = element.parentElement.getBoundingClientRect();
      const own = element.getBoundingClientRect();
      return Math.abs((own.left + own.width / 2) - (parent.left + parent.width / 2)) < 1;
    });
    expect(centered).toBe(true);
    await gallery.locator("summary").click();
    await expect(track).toBeHidden();
    await gallery.locator("summary").click();
    await expect(track).toBeVisible();
    await track.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(item.screenshot), fullPage: false });
  }
});

test("el carrito usa fondo lila y el checkout toma los sabores automáticamente", async ({ page }, testInfo) => {
  await openPreview(page);
  await page.locator("#cartButton").click();
  await expect(page.locator(".empty-icon")).toHaveCount(0);
  await expect(page.locator(".empty")).not.toContainText("🧁");
  const drawerBackground = await page.locator("#drawer").evaluate(element => getComputedStyle(element).backgroundImage);
  expect(drawerBackground).toContain("linear-gradient");
  await page.locator("#closeCart").click();
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const firstPlus = page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"] [data-delta="1"]');
  for (let index = 0; index < 4; index += 1) await firstPlus.click();
  await page.locator("#addFonkieBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-choices")).toContainText("4 Chips de Chocolate Oscuro");
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#requestedTime, #productChoicesGroup, #productChoices")).toHaveCount(0);
  await expect(page.locator(".allergy-panel")).not.toHaveCSS("background-color", "rgb(23, 18, 23)");
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  const minimumDate = await page.locator("#requestedDate").getAttribute("min");
  await page.locator("#requestedDate").fill(minimumDate);
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator('input[name="hasAllergies"][value="no"]').check();
  await page.screenshot({ path: testInfo.outputPath("checkout-lila-movil.png"), fullPage: false });
  await page.locator('#checkoutForm button[type="submit"]').click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Sabores: 4 Chips de Chocolate Oscuro");
  expect(message).not.toContain("Franja horaria solicitada");
  expect(message).not.toContain("Sabores elegidos:");
});

test("catálogo incluye productos confirmados y fotos profesionales", async ({ page }) => {
  await openPreview(page);
  await expect(page.getByRole("button", { name: "Foncake · Tortas completas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fonkies · Galletas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fomb · Bombones" })).toBeVisible();
  await expect(page.locator('[data-product-id="ballerine"]')).toContainText("12,00");
  await expect(page.locator('[data-product-id="crumbl-blueberry"]')).toContainText("47,00");
  await expect(page.locator('[data-product-id="brownie-fit"]')).toContainText("38,00");
  await page.getByRole("button", { name: "Bebida" }).click();
  await expect(page.locator('[data-product-id="agua-minalba-600"]')).toBeVisible();
  await expect(page.locator('[data-product-id="san-pellegrino"]')).toContainText("5,00");
  await expect(page.locator('[data-product-id="san-pellegrino"] img')).toHaveAttribute("src", "assets/beverage-sanpellegrino-fontana-pro.jpg");
  await expect(page.locator('[data-product-id="agua-gasificada-minalba"] img')).toHaveAttribute("src", "assets/beverage-minalba-limon-fontana-pro.jpg");
  await page.getByRole("button", { name: "Stock de hoy" }).click();
  await expect(page.locator('[data-product-id="agua-minalba-600"]')).toBeVisible();
  await page.getByRole("button", { name: "Salado" }).click();
  await expect(page.locator('[data-product-id="nuggets-rora"] img')).toHaveAttribute("src", "assets/nuggets-rora-fontana-pro.jpg");
});

test("Panzerottis y Raviolis envían el relleno elegido y admiten sabores agotados", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: "Salado" }).click();
  const panzerottis = page.locator('[data-product-id="panzerottis"]');
  const raviolis = page.locator('[data-product-id="raviolis"]');
  await expect(panzerottis.locator(".product-tag")).toBeHidden();
  await expect(panzerottis.locator(".product-variant option")).toHaveText([
    "Carne",
    "Ricotta de cabra y espinaca",
    "Mozzarella, salsa y pecorino"
  ]);
  await expect(raviolis.locator("h3")).toHaveText("Raviolis");
  await expect(raviolis.locator(".price")).toContainText("Desde USD 15,00");
  await expect(raviolis.locator(".product-size option")).toHaveText([
    "180 g · USD 15,00",
    "300 g · USD 20,00"
  ]);
  await expect(raviolis.locator(".product-variant option")).toHaveText([
    "Carne",
    "Ricotta de cabra y espinaca"
  ]);
  await panzerottis.locator(".product-variant").selectOption({ label: "Mozzarella, salsa y pecorino" });
  await panzerottis.locator(".add").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item h4")).toContainText("Panzerottis");
  await expect(page.locator(".cart-choices")).toHaveText("Mozzarella, salsa y pecorino");
  await page.locator("#closeCart").click();
  await raviolis.locator(".product-size").selectOption({ label: "300 g · USD 20,00" });
  await raviolis.locator(".product-variant").selectOption({ label: "Carne" });
  await raviolis.locator(".add").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item").filter({ hasText: "Raviolis" })).toContainText("USD 20,00");
  await expect(page.locator(".cart-item").filter({ hasText: "Raviolis" }).locator(".cart-choices")).toHaveText("300 g · Carne");
});

test("un sabor desactivado aparece agotado y no puede seleccionarse", async ({ page }) => {
  await page.route("**/config.js", async route => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace("previewMode: false", "previewMode: true")
      .replace('{ name: "Carne", status: "available" }', '{ name: "Carne", status: "sold-out" }');
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Salado" }).click();
  const carne = page.locator('[data-product-id="panzerottis"] .product-variant option').first();
  await expect(carne).toHaveText("Carne · Agotado");
  await expect(carne).toBeDisabled();
  await expect(page.locator('[data-product-id="panzerottis"] .product-tag')).toBeHidden();
});

test("las tortas bloquean hoy y mañana y exigen dos días de anticipación", async ({ page }) => {
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  const expectedMinimumDate = await page.evaluate(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 2);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  });
  await expect(page.locator("#requestedDate")).toHaveAttribute("min", expectedMinimumDate);
  await expect(page.locator("#requestedDate")).toHaveValue(expectedMinimumDate);
  await expect(page.locator("#requestedDateNotice")).toContainText("Hoy y mañana no están disponibles");
});

test("los salados indican que son congelados y se preparan en air fryer u horno", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: "Salado" }).click();
  for (const id of ["panzerottis", "raviolis", "tequenos-fit", "nuggets-rora", "cachito-fit"]) {
    await expect(page.locator(`[data-product-id="${id}"]`)).toContainText("air fryer u horno");
  }
});

test("el panel administrador permite entrar, editar y reflejar el catálogo en la tienda", async ({ page }) => {
  await page.goto("/admin/");
  await expect(page.getByRole("heading", { name: "Gestiona Fontana" })).toBeVisible();
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page.getByRole("heading", { name: /Buenos días, Fontana/i })).toBeVisible();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.locator('[data-product-id="ballerine"] [data-edit="ballerine"]').click();
  await page.locator('#productForm [name="description"]').fill("Disponible para celebrar hoy.");
  await page.locator('#productForm [name="promo"]').check();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Promo del día" }).click();
  const ballerine = page.locator('[data-product-id="ballerine"]');
  await expect(ballerine).toBeVisible();
  await expect(ballerine).toContainText("Disponible para celebrar hoy.");
  await expect(ballerine.locator(".product-tag")).toHaveText("PROMOCIÓN DEL DÍA");
});

test("el panel administra sabores especiales y conserva el checkout", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Fonkies", exact: true }).click();
  await page.locator('#fonkiesEditor [data-builder-field="singlePrice"]').fill("16");
  await page.locator('#fonkiesEditor [data-builder-field="promo"]').check();
  await page.getByRole("button", { name: "Guardar Fonkies" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const firstPlus = page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"] [data-delta="1"]');
  for (let index = 0; index < 4; index += 1) await firstPlus.click();
  await expect(page.locator("#fonkieTotal")).toContainText("16,00");
  await page.locator("#addFonkieBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item")).toContainText("Caja de 4 Fonkies");
});

test("los filtros muestran los productos sin barras desplegables", async ({ page }, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await openPreview(page);
  await expect(page.locator(".filters .filter")).toHaveText([
    "Promo del día",
    "Stock de hoy",
    "Fonkies · Galletas",
    "Fomb · Bombones",
    "Foncake · Tortas completas",
    "Salado",
    "Bebida"
  ]);
  const cakes = page.locator('.catalog-group[data-catalog-group="cakes"]');
  const fonkies = page.locator('.catalog-group[data-catalog-group="fonkies"]');
  await expect(page.locator(".catalog-group > summary")).toHaveCount(0);
  await expect(cakes).toBeVisible();
  await expect(fonkies).toBeVisible();
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await expect(fonkies.locator(".fonkie-builder")).toBeVisible();
  await expect(cakes).toBeHidden();
  const standardFilterBorder = await page.getByRole("button", { name: "Salado" }).evaluate(button => getComputedStyle(button).borderTopColor);
  const dynamicFilterBorder = await page.getByRole("button", { name: "Promo del día" }).evaluate(button => getComputedStyle(button).borderTopColor);
  expect(dynamicFilterBorder).toBe(standardFilterBorder);
  await page.getByRole("button", { name: "Salado" }).click();
  const salado = page.locator('.catalog-group[data-catalog-group="salado"]');
  await expect(salado).toBeVisible();
  await expect(cakes).toBeHidden();
  const fitsMobileViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsMobileViewport).toBe(true);
  await page.locator(".menu-intro").scrollIntoViewIfNeeded();
  await expect(page.locator(".menu-intro")).toHaveClass(/menu-intro-visible/);
  await expect(page.locator(".menu-section")).toHaveClass(/menu-entry-visible/);
  await expect(page.locator(".menu-title-letter")).toHaveCount(13);
  await expect(page.locator(".menu-title-letter").first()).toHaveCSS("animation-name", "menu-letter-in");
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
