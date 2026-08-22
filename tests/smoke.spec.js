const { test, expect } = require("@playwright/test");
const { existsSync, readFileSync } = require("node:fs");

async function openPreview(page) {
  await page.route("**/config.js*", async route => {
    const response = await route.fetch({ maxRetries: 2 });
    const body = (await response.text()).replace("previewMode: false", "previewMode: true");
    await route.fulfill({ response, body });
  });
  await page.goto("/");
}

async function openFlavorChoice(page, builderSelector) {
  const flavorSelector = builderSelector.includes("fomb") ? ".fomb-flavors" : ".fonkie-flavors";
  const panel = page.locator(`${builderSelector} .choice-panel`).filter({ has: page.locator(flavorSelector) });
  if (!(await panel.getAttribute("open"))) await panel.locator("summary").click();
  await expect(panel).toHaveAttribute("open", "");
}

async function fillCheckout(page, { allergies = false, birthdayCandle = false } = {}) {
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  const minimumDate = await page.locator("#requestedDate").getAttribute("min");
  await page.locator("#requestedDate").fill(minimumDate);
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  if (await page.locator("#birthdayCandlePanel").isVisible()) {
    await page.locator(`input[name="birthdayCandle"][value="${birthdayCandle ? "yes" : "no"}"]`).check();
  }
  await page.locator(`input[name="hasAllergies"][value="${allergies ? "yes" : "no"}"]`).check();
  if (allergies) {
    await page.locator('input[name="allergens"][value="Frutos secos"]').check();
    await page.locator('[name^="allergyNote:"]').first().fill("Evitar frutos secos");
    await page.locator("#crossContamination").check();
  }
}

test("cliente prepara un pedido completo para WhatsApp", async ({ page }) => {
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await expect(page.locator("#cartCount")).toHaveText("1");
  await fillCheckout(page);
  await page.locator('#checkoutForm button[type="submit"]').click();

  const message = await page.evaluate(() => window.__copiedOrder);
  expect(message).toMatch(/^Hola Fontana sin gluten 💜 Quiero hacer este pedido:\n\n\*Pedido FNT-[^\n]+\*\n\n• 1× Torta de Pistacho y Frambuesa/);
  expect(message).toContain("\n\n*Total estimado: USD 60,00*\n\n");
  expect(message).toContain("• Nombre: Andrea Pérez");
  expect(message).toContain("• Teléfono: 0412 000 0000");
  expect(message).toContain("• Modalidad: Pickup en Mañongo (detalles por WhatsApp)");
  expect(message).toContain("• Fecha deseada para Pickup en Mañongo (detalles por WhatsApp):");
  expect(message).toContain("• Forma de pago: Pago Móvil");
  expect(message).toContain("• Condición de pago: 100% por adelantado; los datos se envían por WhatsApp");
  expect(message).toContain("• Vela de cumpleaños: No");
  expect(message).toContain("• Condiciones, alergias o intolerancias: No indica");
  expect(message).toContain("• Estado: pendiente de confirmación\nEnviaré el comprobante por este chat.");
  expect(message).toMatch(/\*El pedido se confirma únicamente cuando Fontana valide disponibilidad, pago y, si aplica, las condiciones, alergias o intolerancias indicadas\.\*$/);
});

test("checkout ofrece vela de cumpleaños solo cuando el pedido incluye una torta", async ({ page }) => {
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await fillCheckout(page, { birthdayCandle: true });
  await expect(page.locator("#birthdayCandlePanel")).toBeVisible();
  await expect(page.locator('input[name="birthdayCandle"]')).toHaveCount(2);
  await page.locator('#checkoutForm button[type="submit"]').click();
  expect(await page.evaluate(() => window.__copiedOrder)).toContain("• Vela de cumpleaños: Sí");

  await page.reload();
  await page.evaluate(() => localStorage.removeItem("fontana-cart-v1"));
  await page.reload();
  await page.getByRole("button", { name: "Bebida" }).click();
  await page.locator('[data-product-id="agua-minalba-600"] .add').click();
  await fillCheckout(page);
  await expect(page.locator("#birthdayCandlePanel")).toBeHidden();
  await page.locator('#checkoutForm button[type="submit"]').click();
  expect(await page.evaluate(() => window.__copiedOrder)).not.toContain("Vela de cumpleaños");
});

test("Fonkies calcula cajas iguales, mixtas y extras", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await openFlavorChoice(page, ".fonkie-builder");
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

test("los selectores de Fonkies y Fomb son compactos en escritorio y pueden plegarse", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const panel = page.locator(".fonkie-builder .choice-panel");
  await expect(panel).not.toHaveAttribute("open", "");
  await expect(page.locator(".fonkie-flavors")).toBeHidden();
  const collapsedPanel = await panel.boundingBox();
  expect(collapsedPanel.height).toBeLessThanOrEqual(45);
  await panel.locator("summary").click();
  const columns = await page.locator(".fonkie-flavors").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(3);
  const fonkieBox = await page.locator(".fonkie-flavors").boundingBox();
  expect(fonkieBox.height).toBeLessThanOrEqual(190);
  await panel.locator("summary").click();
  await expect(page.locator(".fonkie-flavors")).toBeHidden();
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await expect(page.locator(".fomb-flavors")).toBeHidden();
  await openFlavorChoice(page, ".fomb-builder");
  const fombColumns = await page.locator(".fomb-flavors").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(fombColumns).toBe(4);
  const fombBox = await page.locator(".fomb-flavors").boundingBox();
  expect(fombBox.height).toBeLessThanOrEqual(70);
});

test("el selector móvil de Fonkies distribuye los sabores en dos columnas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await openFlavorChoice(page, ".fonkie-builder");
  const columns = await page.locator(".fonkie-flavors").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  const lastFlavor = page.locator(".fonkie-flavor").last();
  await expect(lastFlavor).toHaveCSS("grid-column-start", "1");
  await expect(lastFlavor).toHaveCSS("grid-column-end", "-1");
  const firstBox = await page.locator(".fonkie-flavor").first().boundingBox();
  const lastBox = await lastFlavor.boundingBox();
  expect(Math.abs(firstBox.width - lastBox.width)).toBeLessThanOrEqual(1);
  expect(firstBox.height).toBeLessThanOrEqual(58);
  const selectorBox = await page.locator(".fonkie-flavors").boundingBox();
  expect(selectorBox.height).toBeLessThanOrEqual(285);
  await expect(lastFlavor).toHaveCSS("justify-self", "center");
  await expect(page.locator('.fonkie-flavor[data-flavor="Chispa de Chocolate Blanco"] [data-delta="1"]')).toBeVisible();
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await openFlavorChoice(page, ".fomb-builder");
  const fombSelectorBox = await page.locator(".fomb-flavors").boundingBox();
  expect(fombSelectorBox.height).toBeLessThanOrEqual(115);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la torta de pistacho mantiene el producto centrado en su tarjeta", async ({ page }) => {
  await openPreview(page);
  const image = page.locator('[data-product-id="pistacho-clasico"] .product-media img');
  await expect(image).toHaveAttribute("src", "assets/pistacho-fontana-v4.png");
  await expect(image).toHaveCSS("object-position", "50% 50%");
  await expect(image).toHaveCSS("transform", "matrix(1.25, 0, 0, 1.25, 0, 0)");
});

test("los tres sellos alimentarios son compactos y simétricos", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const seals = page.locator(".dietary-seal");
  await expect(seals).toHaveCount(3);
  await expect(seals.nth(0)).toContainText("Sin gluten");
  await expect(seals.nth(1)).toContainText("Sin azúcar");
  await expect(seals.nth(2)).toContainText("Sin lactosa");
  await expect(page.locator(".dietary-seal-icon")).toHaveCount(3);
  await expect(page.locator(".dietary-seal-icon circle")).toHaveCount(6);
  const boxes = await seals.evaluateAll(elements => elements.map(element => element.getBoundingClientRect()).map(({ x, y, width, height }) => ({ x, y, width, height })));
  expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThanOrEqual(1);
  const sealGroupBox = await page.locator(".dietary-seals").boundingBox();
  const introBox = await page.locator(".menu-intro").boundingBox();
  expect(sealGroupBox.width).toBeLessThanOrEqual(210);
  expect(sealGroupBox.y).toBeGreaterThanOrEqual(introBox.y + introBox.height);
  expect(sealGroupBox.x).toBeLessThanOrEqual(introBox.x + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".menu-intro").scrollIntoViewIfNeeded();
  await expect(page.locator(".menu-title-letter").last()).toHaveCSS("opacity", "1");
  await page.locator("#menu .section-head").screenshot({ path: testInfo.outputPath("sellos-menu-movil.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopBoxes = await seals.evaluateAll(elements => elements.map(element => element.getBoundingClientRect()).map(({ y, width }) => ({ y, width })));
  expect(Math.max(...desktopBoxes.map(box => box.y)) - Math.min(...desktopBoxes.map(box => box.y))).toBeLessThanOrEqual(1);
  expect(Math.max(...desktopBoxes.map(box => box.width)) - Math.min(...desktopBoxes.map(box => box.width))).toBeLessThanOrEqual(1);
  await page.locator("#menu .section-head").screenshot({ path: testInfo.outputPath("sellos-menu-escritorio.png") });
});

test("la portada ocupa la primera vista antes de presentar el menú", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const heroBox = await page.locator(".hero").boundingBox();
  const menuBox = await page.locator("#menu").boundingBox();
  expect(heroBox.height).toBeGreaterThanOrEqual(730);
  expect(menuBox.y).toBeGreaterThanOrEqual(840);
  await expect(page.locator(".hero-logo")).toBeVisible();
  await expect(page.locator(".hero-scroll")).toBeVisible();
  await expect(page.locator(".hero-scroll")).toHaveAttribute("href", "#menu");
});

test("las hojas del logo se mueven suavemente sin alterar la marca", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const logo = page.locator(".hero-logo");
  const leaves = page.locator(".hero-logo-leaf");
  await expect(leaves).toHaveCount(2);
  await expect(leaves.first()).toBeVisible();
  await expect(leaves.last()).toBeVisible();
  await expect(leaves.first()).toHaveCSS("animation-name", "leaf-upper-breeze");
  await expect(leaves.last()).toHaveCSS("animation-name", "leaf-lower-breeze");
  await expect(leaves.first()).toHaveCSS("animation-duration", "7.4s");
  await expect(leaves.last()).toHaveCSS("animation-duration", "8.2s");
  const logoSize = await logo.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight }));
  const leafCanvasSize = await page.locator(".hero-logo-leaves").evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  expect(leafCanvasSize).toEqual(logoSize);
  await expect(page.locator("path.hero-logo-leaf-art")).toHaveCount(2);
  await expect(page.locator("image.hero-logo-leaf-art")).toHaveCount(0);
  await expect(page.locator("feDisplacementMap")).toHaveCount(0);
  await expect(page.locator('animate[attributeName="d"]')).toHaveCount(2);
  const keyframeRotations = await leaves.evaluateAll(elements => elements.map(element => element.getAnimations()[0].effect.getKeyframes().map(frame => {
    const match = String(frame.transform).match(/rotate\((-?[\d.]+)deg\)/);
    return match ? Number(match[1]) : 0;
  })));
  keyframeRotations.forEach(rotations => {
    const amplitude = Math.max(...rotations) - Math.min(...rotations);
    expect(amplitude).toBeGreaterThanOrEqual(12);
    expect(amplitude).toBeLessThanOrEqual(12.5);
  });
  const firstTransform = await leaves.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
  const firstShapes = await page.locator("path.hero-logo-leaf-art").evaluateAll(elements => elements.map(element => {
    const box = element.getBBox();
    return { x:box.x, y:box.y, width:box.width, height:box.height };
  }));
  await page.waitForTimeout(1200);
  const secondTransform = await leaves.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
  const secondShapes = await page.locator("path.hero-logo-leaf-art").evaluateAll(elements => elements.map(element => {
    const box = element.getBBox();
    return { x:box.x, y:box.y, width:box.width, height:box.height };
  }));
  expect(secondTransform).not.toEqual(firstTransform);
  expect(secondTransform[0]).not.toBe(secondTransform[1]);
  expect(secondShapes).not.toEqual(firstShapes);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(leaves.first()).toHaveCSS("animation-name", "none");
  await expect(leaves.last()).toHaveCSS("animation-name", "none");
  await expect(leaves.first()).toHaveCSS("transform", "none");
  await expect(leaves.last()).toHaveCSS("transform", "none");
  const reducedShape = await page.locator("path.hero-logo-leaf-art").first().evaluate(element => {
    const box = element.getBBox();
    return { x:box.x, y:box.y, width:box.width, height:box.height };
  });
  await page.waitForTimeout(500);
  expect(await page.locator("path.hero-logo-leaf-art").first().evaluate(element => {
    const box = element.getBBox();
    return { x:box.x, y:box.y, width:box.width, height:box.height };
  })).toEqual(reducedShape);
});

test("¿Es para ti? abre una vista propia con el mensaje, los sellos y el acceso al menú", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const section = page.locator("#para-ti");
  await expect(section).not.toBeVisible();
  await page.locator("#nav").getByRole("link", { name: "¿Es para ti?", exact: true }).click();
  await expect(section).toHaveAttribute("open", "");
  await expect(section.getByRole("heading", { name: "¿Fontana es para ti?" })).toBeVisible();
  await expect(section).toContainText("en Fontana creamos para ti");
  await expect(section).toContainText("¿Listo para probar la diferencia?");
  await expect(section.locator(".fit-benefit")).toHaveCount(3);
  await expect(section.locator(".fit-benefit")).toHaveText(["Sin gluten", "Sin azúcar", "Sin lactosa"]);
  const menuLink = section.getByRole("link", { name: "Explorar nuestro menú" });
  await expect(menuLink).toHaveAttribute("href", "#menu");
  await expect(menuLink).toHaveCSS("color", "rgb(247, 239, 248)");
  await expect(menuLink).toHaveCSS("background-color", "rgb(79, 22, 81)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: testInfo.outputPath("para-ti-movil.png") });
  await menuLink.click();
  await expect(section).not.toBeVisible();
  await expect(page).toHaveURL(/#menu$/);
  await expect(page.locator("#menu h2")).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#nav").getByRole("link", { name: "¿Es para ti?", exact: true }).click();
  await expect(section).toHaveAttribute("open", "");
  await section.screenshot({ path: testInfo.outputPath("para-ti-escritorio.png") });
  await section.getByRole("button", { name: "Cerrar ¿Es para ti?" }).click();
  await expect(section).not.toBeVisible();
});

test("cada producto muestra solo sus sellos alimentarios confirmados", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const ballerine = page.locator('[data-product-id="ballerine"]');
  await expect(ballerine.locator(".product-dietary-seal")).toHaveCount(3);
  await expect(ballerine.locator(".product-dietary-seal")).toHaveText(["Sin gluten", "Sin azúcar", "Sin lactosa"]);
  const tequenos = page.locator('[data-product-id="tequenos-fit"]');
  await expect(tequenos.locator(".product-dietary-seal")).toHaveCount(2);
  await expect(tequenos.locator(".product-dietary-seals")).not.toContainText("Sin lactosa");
  await expect(page.locator('[data-product-id="agua-minalba-600"] .product-dietary-seal')).toHaveCount(0);
  await expect(page.locator(".fonkie-builder .builder-dietary-seals .product-dietary-seal")).toHaveCount(3);
  const fombSeals = page.locator(".fomb-builder .builder-dietary-seals .product-dietary-seal");
  await expect(fombSeals).toHaveCount(4);
  await expect(fombSeals).toHaveText(["Sin gluten", "Sin azúcar", "Sin lactosa", "Sin huevo"]);
  await page.locator(".fomb-builder .builder-dietary-seals").screenshot({ path: testInfo.outputPath("sellos-fomb-movil.png") });
  await expect(ballerine.locator(".product-dietary-seal circle")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await ballerine.screenshot({ path: testInfo.outputPath("sellos-producto-movil.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ballerine.screenshot({ path: testInfo.outputPath("sellos-producto-escritorio.png") });
});

test("Fomb permite elegir una caja de un sabor o mixta y conserva tamaños y extras", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator(".fomb-builder")).toHaveCount(1);
  await expect(page.locator('img[src="assets/fomb-raffaello-fontana-pro.jpg"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await openFlavorChoice(page, ".fomb-builder");
  await expect(page.locator(".fomb-flavors")).toBeVisible();
  await expect(page.locator("#addFombBox")).toBeDisabled();
  await expect(page.locator("#fombTotal")).toContainText("15,00");
  const pistachoPlus = page.locator('.fomb-flavor[data-flavor="Pistacho"] [data-delta="1"]');
  const pistachoCount = page.locator('.fomb-flavor[data-flavor="Pistacho"] output');
  for (let index = 0; index < 4; index += 1) {
    await pistachoPlus.click();
    await expect(pistachoCount).toHaveText(String(index + 1));
  }
  await expect(page.locator("#fombRule")).toContainText("Caja de un solo sabor");
  await expect(page.locator("#addFombBox")).toBeEnabled();
  await page.locator('.fomb-flavor[data-flavor="Pistacho"] [data-delta="-1"]').click();
  await page.locator('.fomb-flavor[data-flavor="Dubai"] [data-delta="1"]').click();
  await expect(page.locator("#fombRule")).toContainText("Caja mixta");
  await page.locator("#addFombBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item h4")).toContainText("Caja de 4 Fomb · Mixta");
  await expect(page.locator(".cart-choices")).toContainText("3 Pistacho, 1 Dubai");
  await page.locator("#closeCart").click();

  await page.locator(".fomb-builder .choice-panel").first().locator("summary").click();
  await page.locator("#fombExtraPlus").click();
  await expect(page.locator("#fombTotal")).toContainText("18,50");
  await page.locator('input[name="fombSize"][value="12"]').check();
  await expect(page.locator("#fombTotal")).toContainText("33,50");
  await expect(page.locator("#fombValidation")).toContainText("Faltan 9 bombones");
  await expect(page.locator("#addFombBox")).toBeDisabled();
});

test("las galerías de Fonkies y Fomb ocupan todo el marco y mantienen el producto centrado", async ({ page }, testInfo) => {
  await openPreview(page);
  const galleries = [
    { filter: "Fonkies · Galletas", selector: ".fonkie-gallery", track: ".fonkie-gallery-track", card: ".fonkie-gallery-card", heading: "Galería de Fonkies", screenshot: "galeria-fonkies-movil.png" },
    { filter: "Fomb · Bombones", selector: ".builder-gallery", track: ".builder-gallery-track", card: ".builder-gallery-card", heading: "Galería Fomb", screenshot: "galeria-fomb-movil.png" }
  ];
  for (const item of galleries) {
    await page.getByRole("button", { name: item.filter }).click();
    const selector = item.selector;
    const gallery = page.locator(selector);
    const track = gallery.locator(item.track);
    const card = track.locator(item.card).first();
    const image = card.locator("img");
    await expect(gallery.locator("summary")).toContainText(item.heading);
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

test("el catálogo separa visualmente cada familia de productos", async ({ page }) => {
  await openPreview(page);
  const groups = page.locator(".catalog-group:not([hidden])");
  await expect(groups.locator(".catalog-group-heading h3")).toHaveText([
    "Tortas",
    "Fonkies",
    "Bombones",
    "Salados",
    "Bebidas"
  ]);
  await expect(groups.locator(".catalog-group-line")).toHaveCount(5);
  await expect(groups.first().locator(".catalog-group-heading")).toHaveCSS("color", "rgb(184, 205, 105)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("las reseñas reales avanzan automáticamente hacia la izquierda", async ({ page }) => {
  await openPreview(page);
  const carousel = page.locator(".testimonials-carousel");
  const track = page.locator(".testimonials-track");
  await expect(carousel).toHaveAttribute("aria-roledescription", "carrusel");
  await expect(carousel).toHaveAttribute("aria-label", "Reseñas de clientes");
  await expect(track.locator(".quote")).toHaveCount(7);
  await expect(page.locator(".testimonial-dot")).toHaveCount(6);
  await expect(track.locator(".review-source")).toHaveCount(7);
  await expect(page.locator(".testimonials .demo-note")).toHaveCount(0);
  await expect(track.locator("blockquote").nth(1)).toContainText("¡Qué delicia todo!");
  await expect(track.locator("blockquote").nth(4)).toContainText("¡Estos panzerotti");
  await expect(track.locator("blockquote").nth(5)).toContainText("le encantaron");
  const initialTransform = await track.evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(4200);
  await expect.poll(() => track.evaluate(element => getComputedStyle(element).transform)).not.toBe(initialTransform);
  await expect(page.locator(".testimonial-dot").nth(1)).toHaveClass(/active/);
  await page.setViewportSize({ width: 390, height: 844 });
  const sectionGaps = await page.evaluate(() => {
    const locationCard = document.querySelector("#ubicacion .location-card").getBoundingClientRect();
    const reviewHeading = document.querySelector("#resenas .section-head").getBoundingClientRect();
    const reviewDots = document.querySelector("#resenas .testimonial-dots").getBoundingClientRect();
    const finalContent = document.querySelector(".final-inner").getBoundingClientRect();
    const footerDivider = getComputedStyle(document.querySelector("main + footer"), "::before");
    return {
      locationToReviews: reviewHeading.top - locationCard.bottom,
      reviewsToFinal: finalContent.top - reviewDots.bottom,
      footerDividerColor: footerDivider.backgroundColor,
      footerDividerHeight: footerDivider.height
    };
  });
  expect(sectionGaps.locationToReviews).toBeLessThan(70);
  expect(sectionGaps.reviewsToFinal).toBeLessThan(80);
  expect(sectionGaps.footerDividerColor).toBe("rgba(217, 174, 220, 0.22)");
  expect(sectionGaps.footerDividerHeight).toBe("1px");
  await expect(page.locator("main + footer")).toHaveCSS("position", "relative");
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
  await openFlavorChoice(page, ".fonkie-builder");
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
  const message = await page.evaluate(() => window.__copiedOrder);
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
  await expect(page.locator('[data-product-id="brownie-fit"]')).toContainText("sal Maldon");
  await expect(page.locator('[data-product-id="brownie-fit"]')).toContainText("harina de yuca (5 %)");
  await expect(page.locator('[data-product-id="mini-cake"]')).toContainText("Base vainilla: harina de almendra");
  await expect(page.locator('[data-product-id="mini-cake"]')).toContainText("Base chocolate: los mismos ingredientes más cacao");
  await page.getByRole("button", { name: "Bebida" }).click();
  await expect(page.locator('[data-product-id="agua-minalba-600"]')).toContainText("355 ML");
  await expect(page.locator('[data-product-id="san-pellegrino"]')).toContainText("7,00");
  await expect(page.locator('[data-product-id="san-pellegrino"] img')).toHaveAttribute("src", "assets/beverage-sanpellegrino-fontana-pro.jpg");
  await expect(page.locator('[data-product-id="agua-gasificada-minalba"] img')).toHaveAttribute("src", "assets/beverage-minalba-limon-fontana-pro.jpg");
  await expect(page.locator('[data-product-id="tevia-durazno"]')).toContainText("USD 4,00");
  await expect(page.locator('[data-product-id="tevia-durazno"]')).toContainText("360 ML");
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
  await page.route("**/config.js*", async route => {
    const response = await route.fetch({ maxRetries: 2 });
    const body = (await response.text())
      .replace("previewMode: false", "previewMode: true")
      .replace(/(id: "panzerottis"[\s\S]*?variants: \[\s*\{ name: "Carne", status: ")available(" \})/, "$1sold-out$2");
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

test("los salados muestran sus instrucciones de preparación confirmadas", async ({ page }) => {
  await openPreview(page);
  await page.getByRole("button", { name: "Salado" }).click();
  for (const id of ["panzerottis", "tequenos-fit", "nuggets-rora", "cachito-fit"]) {
    await expect(page.locator(`[data-product-id="${id}"]`)).toContainText("air fryer u horno");
  }
  await expect(page.locator('[data-product-id="raviolis"]')).toContainText("6 minutos en agua hirviendo");
});

test("el panel puede agotar un sabor Fomb y la tienda bloquea su selector", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Fomb", exact: true }).click();
  await page.locator('#fombEditor [data-edit-flavor="fomb:0"]').click();
  await page.locator('#flavorForm [name="status"]').selectOption("sold-out");
  await page.getByRole("button", { name: "Guardar sabor" }).click();
  await page.getByRole("button", { name: "Guardar Fomb" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  const soldOut = page.locator('.fomb-flavor[data-flavor="Pistacho"]');
  await expect(soldOut).toContainText("Agotado");
  await expect(soldOut.locator('[data-delta="1"]')).toBeDisabled();
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

test("el panel controla los sellos visibles de cada producto", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Fomb", exact: true }).click();
  await expect(page.locator('[data-builder="fomb"] [data-builder-field="eggFree"]')).toBeChecked();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.locator('[data-product-id="ballerine"] [data-edit="ballerine"]').click();
  await expect(page.locator('#productForm [name="glutenFree"]')).toBeChecked();
  await expect(page.locator('#productForm [name="sugarFree"]')).toBeChecked();
  await expect(page.locator('#productForm [name="lactoseFree"]')).toBeChecked();
  await expect(page.locator('#productForm [name="eggFree"]')).not.toBeChecked();
  await page.locator(".dietary-fieldset").screenshot({ path: testInfo.outputPath("sellos-admin-movil.png") });
  await page.locator('#productForm [name="lactoseFree"]').uncheck();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await page.goto("/");
  const seals = page.locator('[data-product-id="ballerine"] .product-dietary-seal');
  await expect(seals).toHaveCount(2);
  await expect(seals).toHaveText(["Sin gluten", "Sin azúcar"]);
});

test("el panel publica stock, etiquetas y pre-order sin romper el carrito", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.locator('[data-product-id="ballerine"] [data-edit="ballerine"]').click();
  await page.locator('#productForm [name="stockQuantity"]').fill("0");
  await page.locator('#productForm [name="allowPreorder"]').check();
  await page.locator('#productForm [name="isNew"]').check();
  await page.locator('#productForm [name="customLabels"]').fill("EDICIÓN ESPECIAL");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await page.goto("/");
  const ballerine = page.locator('[data-product-id="ballerine"]');
  await expect(ballerine.locator(".product-tags")).toContainText("AGOTADO");
  await expect(ballerine.locator(".product-tags")).toContainText("PRE-ORDER");
  await expect(ballerine.locator(".product-tags")).toContainText("NUEVO");
  await expect(ballerine.locator(".product-tags")).toContainText("EDICIÓN ESPECIAL");
  await ballerine.locator(".add").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-choices")).toContainText("PRE-ORDER · Sujeto a confirmación");
});

test("el panel puede ocultar un producto de toda la tienda", async ({ page }) => {
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.locator('[data-product-id="san-pellegrino"] [data-edit="san-pellegrino"]').click();
  await page.locator('#productForm [name="visible"]').uncheck();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.goto("/");
  await expect(page.locator('[data-product-id="san-pellegrino"]')).toHaveCount(0);
});

test("el panel móvil cierra sus formularios y evita el zoom automático en campos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "+ Nuevo producto" }).first().click();
  const dialog = page.locator("#productDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[name="name"]')).toHaveCSS("font-size", "16px");
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole("button", { name: "+ Nuevo producto" }).first().click();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).not.toBeVisible();
});

test("el administrador ofrece Face ID y cuentas separadas sin romper la vista móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await expect(page.getByRole("button", { name: "Entrar con Face ID" })).toBeVisible();
  await page.getByRole("button", { name: "Entrar con Face ID" }).click();
  await expect(page.locator("#loginStatus")).toHaveText("Escribe tu usuario y luego usa Face ID.");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Abrir menú de configuración" }).click();
  await page.getByRole("button", { name: "Acceso, usuarios y Face ID" }).click();
  await expect(page.getByRole("heading", { name: "Acceso y Face ID" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Activar Face ID" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usuarios del panel" })).toBeVisible();
  await expect(page.locator('#newUserForm [name="displayName"]')).toHaveCSS("font-size", "16px");
  await expect(page.locator('#newUserForm [name="username"]')).toHaveAttribute("autocomplete", "off");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const worker = readFileSync("backend/src/worker.js", "utf8");
  const migration = readFileSync("backend/migrations/0002_multi_user_passkeys.sql", "utf8");
  expect(worker).toContain('/v1/auth/passkey/options');
  expect(worker).toContain('/v1/admin/users');
  expect(worker).toContain('verifyAuthenticationResponse');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS passkey_credentials');
  expect(migration).toContain("role = 'owner'");

  const adminScript = readFileSync("admin/admin.js", "utf8");
  expect(adminScript).toContain('await apiFetch("/v1/auth/logout", { method:"POST", body:"{}" })');
  expect(adminScript).not.toContain('currentSession = await apiFetch("/v1/auth/session")');
  expect(adminScript).toContain('if (!verifiedSession?.ok || verifiedSession.username !== username)');
});

test("el panel registra ventas manuales y separa la configuración del catálogo", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();

  await expect(page.getByRole("button", { name: "Acceso y Face ID" })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir menú de configuración" }).click();
  await expect(page.getByRole("button", { name: "Acceso, usuarios y Face ID" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copias y publicación" })).toBeVisible();
  await page.getByRole("button", { name: "Acceso, usuarios y Face ID" }).click();
  await expect(page.getByRole("heading", { name: "Acceso y Face ID" })).toBeVisible();

  await page.getByRole("button", { name: "Ventas", exact: true }).click();
  await page.getByRole("button", { name: "+ Registrar venta" }).click();
  await page.locator('#saleForm [name="total"]').fill("47");
  await page.locator('#saleForm [name="customerName"]').fill("Cliente de prueba");
  await page.locator('#saleForm [name="items"]').fill("1 Torta de manjar de naranja");
  await page.locator('#saleForm button[type="submit"]').click();
  await expect(page.locator("#salesList")).toContainText("Cliente de prueba");
  await expect(page.locator("#salesList")).toContainText("USD 47,00");
  await expect(page.locator("#salesStats")).toContainText("USD 47,00");
  await page.screenshot({ path: testInfo.outputPath("ventas-admin-movil.png"), fullPage: false });

  await page.reload();
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Ventas", exact: true }).click();
  await expect(page.locator("#salesList")).toContainText("Cliente de prueba");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath("ventas-admin-escritorio.png"), fullPage: false });

  const worker = readFileSync("backend/src/worker.js", "utf8");
  const migration = readFileSync("backend/migrations/0003_sales_accounting.sql", "utf8");
  expect(worker).toContain('/v1/admin/sales');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS sales');
});

test("el checkout móvil mantiene los campos a tamaño anti-zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#customerName")).toHaveCSS("font-size", "16px");
  await expect(page.locator("#customerNotes")).toHaveCSS("font-size", "16px");
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
  await openFlavorChoice(page, ".fonkie-builder");
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
    "Ver todo",
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
  await expect(page.getByRole("button", { name: "Ver todo" })).toHaveClass(/active/);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await expect(fonkies.locator(".fonkie-builder")).toBeVisible();
  await expect(cakes).toBeHidden();
  await page.getByRole("button", { name: "Ver todo" }).click();
  await expect(cakes).toBeVisible();
  await expect(fonkies).toBeVisible();
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

test("WhatsApp queda próximo y alineado con el menú en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const whatsapp = page.locator("#whatsappChatLink");
  const menu = page.locator("#cartButton");
  const [whatsappBox, menuBox] = await Promise.all([whatsapp.boundingBox(), menu.boundingBox()]);
  expect(whatsappBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox.x - (whatsappBox.x + whatsappBox.width)).toBeLessThanOrEqual(3);
  expect(Math.abs((whatsappBox.y + whatsappBox.height / 2) - (menuBox.y + menuBox.height / 2))).toBeLessThanOrEqual(1);
});

test("Layer Cake se consulta por WhatsApp sin precio inventado ni carrito", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.getByRole("button", { name: "Foncake · Tortas" }).click();
  const layerCake = page.locator('[data-product-id="layer-cake"]');
  await expect(layerCake).toBeVisible();
  await expect(layerCake.getByRole("heading")).toHaveText("Layer Cake · Torta en capas");
  await expect(layerCake.locator(".price")).toHaveText("Cotizar");
  await expect(layerCake.locator("img")).toHaveAttribute("src", "assets/layer-cake-fontana-pro.png");
  await expect(layerCake.locator(".product-safety")).toHaveCount(0);
  await expect(layerCake.locator(".add")).toHaveCount(0);
  const quote = layerCake.getByRole("link", { name: "Consultar Layer Cake · Torta en capas por WhatsApp" });
  await expect(quote).toHaveAttribute("href", /https:\/\/wa\.me\/584244350800\?text=/);
  await expect(quote).toHaveAttribute("target", "_blank");
  const quoteFitsCard = await layerCake.evaluate(card => {
    const cardBounds = card.getBoundingClientRect();
    const quoteBounds = card.querySelector(".product-quote").getBoundingClientRect();
    return quoteBounds.left >= cardBounds.left && quoteBounds.right <= cardBounds.right;
  });
  expect(quoteFitsCard).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la torta personalizada usa la foto original y la experiencia muestra la caja con bordes fundidos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.getByRole("button", { name: "Foncake · Tortas" }).click();
  const customCake = page.locator('[data-product-id="torta-personalizada"]');
  await expect(customCake).toBeVisible();
  await expect(customCake.getByRole("heading")).toHaveText("Torta completa personalizada");
  await expect(customCake.locator("img")).toHaveAttribute("src", "assets/torta-personalizada-fontana-pro-v2.jpg");
  await expect(customCake.locator(".price")).toHaveText("Cotizar");
  await expect(customCake.getByRole("link", { name: "Consultar Torta completa personalizada por WhatsApp" })).toBeVisible();

  const experience = page.locator(".experience-banner");
  await expect(experience.locator("img")).toHaveAttribute("src", "assets/caja-experiencia-fontana-original.jpg");
  await expect(experience).toContainText("Abre la caja, cierra los ojos y disfruta el verdadero sabor de Fontana");
  await expect(experience.locator("img")).toHaveCSS("mask-image", /linear-gradient\(to right/);
  await expect(experience.locator("img")).toHaveCSS("mask-composite", /intersect/);
  const experienceToStoryGap = await page.evaluate(() => {
    const experienceBounds = document.querySelector(".experience-banner").getBoundingClientRect();
    const storyBounds = document.querySelector(".story-copy").getBoundingClientRect();
    return storyBounds.top - experienceBounds.bottom;
  });
  expect(experienceToStoryGap).toBeLessThanOrEqual(120);
  expect(experienceToStoryGap).toBeGreaterThanOrEqual(80);

  const founder = page.locator(".founder-note");
  await expect(founder).toContainText("El rostro detrás de Fontana");
  await expect(founder.locator("img")).toHaveAttribute("src", "assets/fundadora-fontana-editorial-v2.jpg");
  await expect(founder.locator("img")).toHaveAttribute("alt", "Dueña y creadora de Fontana");
  expect((await founder.locator(".founder-portrait").boundingBox())?.width).toBeGreaterThanOrEqual(146);
  const locationDivider = await page.locator(".story + .location").evaluate(element => {
    const divider = getComputedStyle(element, "::before");
    return { color: divider.backgroundColor, height: divider.height };
  });
  expect(locationDivider).toEqual({ color: "rgba(217, 174, 220, 0.22)", height: "1px" });
});

test("el menú permanece visible y la ubicación solo indica Mañongo", async ({ page }, testInfo) => {
  await openPreview(page);
  const nav = page.locator("#nav");
  await expect(nav.getByRole("link", { name: "Menú", exact: true })).toBeVisible();
  const fitLink = nav.getByRole("link", { name: "¿Es para ti?", exact: true });
  await expect(fitLink).toBeVisible();
  await expect(nav.getByRole("link", { name: "Reseñas", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ubicación", exact: true })).toBeVisible();
  const whatsappLink = nav.getByRole("link", { name: "Hablar con Fontana por WhatsApp" });
  await expect(whatsappLink).toBeVisible();
  await expect(whatsappLink).toHaveAttribute("href", "https://wa.me/584244350800");
  await expect(whatsappLink).toHaveAttribute("target", "_blank");
  await expect(whatsappLink.locator(".whatsapp-icon")).toBeVisible();
  await expect(page.locator("#cartCount")).toHaveText("0");
  await expect(page.locator("#ubicacion h2")).toHaveText("Mañongo.");
  await expect(page.locator("#ubicacion .eyebrow")).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(page.locator("#ubicacion .location-copy p")).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(page.locator("#ubicacion .hours b").first()).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(page.locator("#ubicacion .hours span").first()).toHaveCSS("color", "rgb(79, 22, 81)");
  if (testInfo.project.name === "mobile") {
    const locationCard = page.locator("#ubicacion .location-card");
    await expect(locationCard).toHaveCSS("min-height", "0px");
    expect((await locationCard.boundingBox()).height).toBeLessThan(620);
  }
  await fitLink.click();
  await expect(page.locator("#para-ti")).toHaveAttribute("open", "");
  await expect(page.locator("#para-ti h2")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ¿Es para ti?" }).click();
  await nav.getByRole("link", { name: "Ubicación", exact: true }).click();
  await page.locator("#ubicacion h2").scrollIntoViewIfNeeded();
  await expect(page.locator("#ubicacion h2")).toBeInViewport();
  const clearsFixedNav = await page.evaluate(() => document.querySelector("#ubicacion h2").getBoundingClientRect().top >= document.querySelector("#nav").getBoundingClientRect().bottom);
  expect(clearsFixedNav).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ubicacion-movil.png"), fullPage: false });
});

test("un pedido con alergias queda marcado para revisión", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    window.__copiedOrder = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async message => { window.__copiedOrder = message; } }
    });
  });
  await openPreview(page);
  await page.locator('[data-id="pistacho"] .add').click();
  await fillCheckout(page, { allergies: true });
  for (const option of ["Diabético", "Celíaco", "Leche", "Lactosa"]) {
    await page.getByLabel(option, { exact: true }).check();
  }
  await page.locator('#checkoutForm button[type="submit"]').click();
  const message = await page.evaluate(() => window.__copiedOrder);
  expect(message).toContain("Condiciones, alergias o intolerancias:");
  expect(message).toContain("Diabético");
  expect(message).toContain("Celíaco");
  expect(message).toContain("Leche");
  expect(message).toContain("Lactosa");
  expect(message).toContain("Frutos secos");
  expect(message).toContain("Evitar frutos secos");
  expect(message).toContain("PENDIENTE DE REVISIÓN POR FONTANA");
});

test("SEO público es indexable y mantiene privado el panel", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Fontana sin gluten en Carabobo | Postres y comidas fit");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index,follow/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://fontanasingluten.com/");
  await expect(page.locator("h1")).toContainText("Fontana sin gluten");

  const structuredData = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(structuredData["@graph"].some(item => item["@type"] === "WebSite" && item.name === "Fontana sin gluten")).toBe(true);
  expect(structuredData["@graph"].some(item => item["@type"] === "FoodEstablishment" && item.address.addressLocality === "Mañongo")).toBe(true);

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap: https://fontanasingluten.com/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<loc>https://fontanasingluten.com/</loc>");

  await page.goto("/admin/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("los accesos de iPhone diferencian la tienda del panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /fontana-logo-official\.png/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Fontana");

  await page.goto("/admin/");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /fontana-admin-icon\.png/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Panel Fontana");
  expect(existsSync("assets/fontana-admin-icon.png")).toBe(true);
});

test("el panel centraliza cantidades privadas y pedidos reservados en móvil y escritorio", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Inventario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inventario", exact: true })).toBeVisible();
  expect(await page.locator("#inventoryList .inventory-row").count()).toBeGreaterThan(10);
  await expect(page.locator("#inventoryList")).toContainText("Control activo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("inventario-central-movil.png"), fullPage: false });

  await page.getByRole("button", { name: "Pedidos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pedidos", exact: true })).toBeVisible();
  await expect(page.locator("#ordersList")).toContainText("No hay pedidos en este estado");

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Inventario", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("inventario-central-escritorio.png"), fullPage: false });
});

test("las métricas del resumen abren productos con su filtro en móvil y escritorio", async ({ page }, testInfo) => {
  const consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.locator('#stats [data-dashboard-filter="immediate"]').click();
  await expect(page.getByRole("heading", { name: "Productos", exact: true })).toBeVisible();
  await expect(page.locator("#statusFilter")).toHaveValue("immediate");
  await expect(page.locator("#productFilterSummary")).toContainText("Stock de hoy");
  await expect(page.locator("#productFilterSummary")).toContainText(/\d+ productos?/);
  expect(await page.locator("#productList .product-row").count()).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("resumen-stock-filtrado-movil.png"), fullPage: false });

  await page.getByRole("button", { name: "Ver todos", exact: true }).click();
  await expect(page.locator("#statusFilter")).toHaveValue("all");
  await expect(page.locator("#productFilterSummary")).toContainText("Todos los productos");

  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator('#stats [data-dashboard-filter="promo"]').click();
  await expect(page.locator("#statusFilter")).toHaveValue("promo");
  await expect(page.locator("#productFilterSummary")).toContainText("Promociones");
  await page.screenshot({ path: testInfo.outputPath("resumen-promociones-filtrado-escritorio.png"), fullPage: false });

  expect(consoleErrors).toEqual([]);
});

test("el inventario usa reservas transaccionales, vencimiento y contabilidad automática", async () => {
  const worker = readFileSync("backend/src/worker.js", "utf8");
  const migration = readFileSync("backend/migrations/0004_central_inventory.sql", "utf8");
  const wrangler = readFileSync("backend/wrangler.jsonc", "utf8");
  const checkout = readFileSync("app.js", "utf8");

  expect(migration).toContain("CREATE TRIGGER IF NOT EXISTS inventory_balance_guard");
  expect(migration).toContain("NEW.reserved > NEW.on_hand");
  expect(migration).toContain("CREATE TABLE IF NOT EXISTS stock_orders");
  expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_id");
  expect(worker).toContain('/v1/orders/reserve');
  expect(worker).toContain('/v1/admin/inventory');
  expect(worker).toContain('/v1/admin/orders');
  expect(worker).toContain("await expireReservations(env)");
  expect(worker).toContain("'sale'");
  expect(wrangler).toContain('"* * * * *"');
  expect(checkout).toContain('textContent = "Reservando stock…"');
  expect(checkout).toContain('/v1/orders/reserve');
  expect(checkout).toContain('Stock reservado hasta:');
});

test("el centro de control abre y cierra Stock de hoy, repone rápido y conserva trazabilidad", async ({ page }, testInfo) => {
  const consoleErrors = [];
  page.on("pageerror", error => consoleErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();

  await expect(page.getByRole("heading", { name: "Lo que necesita una revisión" })).toBeVisible();
  await expect(page.locator("#attentionGrid .attention-card")).toHaveCount(4);
  await expect(page.locator("#todaySummary")).toContainText("Resumen de hoy");
  await expect(page.locator("#stockDayToggle")).toContainText("Pausar Stock de hoy");
  await page.locator("#stockDayToggle").click();
  await expect(page.locator("#stockDayToggle")).toContainText("Mostrar Stock de hoy");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-admin-catalog-v1")).settings.stockTodayOpen)).toBe(false);

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Stock de hoy" })).toBeHidden();
  await expect(page.locator('.product[data-category="beverages"]').first()).toBeVisible();

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Inventario", exact: true }).click();
  const firstRow = page.locator("#inventoryList .inventory-row").first();
  const before = Number(await firstRow.locator("[data-stock-value]").inputValue());
  await firstRow.getByRole("button", { name: "Sumar una unidad" }).click();
  await expect(firstRow.locator("[data-stock-value]")).toHaveValue(String(before + 1));
  await firstRow.getByRole("button", { name: "Restar una unidad" }).click();
  await expect(firstRow.locator("[data-stock-value]")).toHaveValue(String(before));
  await firstRow.locator("[data-stock-value]").fill(String(before + 3));
  await firstRow.getByRole("button", { name: "Guardar" }).click();
  await expect(firstRow.locator("[data-stock-value]")).toHaveValue(String(before + 3));

  await page.getByRole("button", { name: "Abrir menú de configuración" }).click();
  await page.getByRole("button", { name: "Historial de cambios" }).click();
  await expect(page.getByRole("heading", { name: "Historial de cambios" })).toBeVisible();
  await expect(page.locator("#activityList .activity-row")).not.toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("centro-control-operativo-movil.png"), fullPage: false });

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("centro-control-operativo-escritorio.png"), fullPage: false });
  expect(consoleErrors).toEqual([]);
});

test("el panel controla la electricidad, persiste el estado y registra la dependencia por producto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();

  const control = page.locator("#electricityControl");
  const toggle = page.locator("#electricityToggle");
  await expect(control).toBeVisible();
  await expect(page.locator("#electricityTitle")).toHaveText("Producción con electricidad");
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  page.once("dialog", dialog => dialog.accept());
  await toggle.click();
  await expect(page.locator("#electricityTitle")).toHaveText("Producción sin electricidad");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-admin-catalog-v1")).settings.productionWithElectricity)).toBe(false);

  await page.reload();
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page.locator("#electricityToggle")).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Fonkies", exact: true }).click();
  await expect(page.locator('[data-builder="fonkies"] [data-builder-field="requiresElectricity"]')).toBeChecked();
  await page.getByRole("button", { name: "Fomb", exact: true }).click();
  await expect(page.locator('[data-builder="fomb"] [data-builder-field="requiresElectricity"]')).not.toBeChecked();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.locator('[data-product-id="ballerine"] [data-edit="ballerine"]').click();
  await expect(page.locator('#productForm [name="requiresElectricity"]')).not.toBeChecked();
});

test("sin electricidad pausa Fonkies y bloquea un carrito existente sin eliminarlo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await openFlavorChoice(page, ".fonkie-builder");
  const firstPlus = page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"] [data-delta="1"]');
  for (let index = 0; index < 4; index += 1) await firstPlus.click();
  await page.locator("#addFonkieBox").click();
  await expect(page.locator("#cartCount")).toHaveText("1");

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#electricityToggle").click();

  await page.goto("/");
  await expect(page.locator("#electricityNotice")).toHaveText("Producción de Fonkies temporalmente pausada. El resto del catálogo sigue disponible.");
  await expect(page.locator(".fonkie-builder")).toContainText("Temporalmente no disponible");
  await expect(page.locator("#addFonkieBox")).toBeDisabled();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item")).toContainText("Temporalmente no disponible");
  await expect(page.locator("#continueCheckout")).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-cart-v1")).length)).toBe(1);
  await page.locator(".remove").click();
  await expect(page.locator("#cartCount")).toHaveText("0");

  await page.locator("#closeCart").click();
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await expect(page.locator(".fomb-builder")).not.toContainText("Temporalmente no disponible");
});

test("los formularios operativos conservan cabecera, contenido y acciones accesibles en móvil", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();

  async function expectUsableDialog(selector, actionName) {
    const dialog = page.locator(selector);
    await expect(dialog).toBeVisible();
    const geometry = await dialog.evaluate(element => {
      const box = element.getBoundingClientRect();
      const scroller = element.querySelector(".form-grid");
      const actions = element.querySelector(".dialog-actions").getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        viewportHeight: window.innerHeight,
        actionsTop: actions.top,
        actionsBottom: actions.bottom,
        canScroll: scroller.scrollHeight > scroller.clientHeight
      };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.actionsTop).toBeGreaterThanOrEqual(geometry.top);
    expect(geometry.actionsBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    await expect(dialog.getByRole("button", { name: actionName })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cerrar" })).toBeVisible();
    return geometry;
  }

  await page.getByRole("button", { name: "+ Nuevo producto" }).first().click();
  expect((await expectUsableDialog("#productDialog", "Guardar producto")).canScroll).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("producto-modal-movil.png") });
  await page.locator("#productDialog").getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "Fonkies", exact: true }).click();
  await page.locator('#fonkiesEditor [data-add-flavor="fonkies"]').click();
  await expectUsableDialog("#flavorDialog", "Guardar sabor");
  await page.locator("#flavorDialog").getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "Ventas", exact: true }).click();
  await page.getByRole("button", { name: "+ Registrar venta" }).click();
  expect((await expectUsableDialog("#saleDialog", "Guardar venta")).canScroll).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("venta-modal-movil-corregido.png") });
  await page.locator('#saleForm [name="total"]').fill("23.50");
  await page.locator('#saleForm [name="customerName"]').fill("Revisión móvil");
  await page.locator('#saleForm [name="items"]').fill("Venta de prueba funcional");
  await page.locator('#saleForm button[type="submit"]').click();
  await expect(page.locator("#salesList")).toContainText("Revisión móvil");

  await page.locator("#salesList [data-edit-sale]").first().click();
  await page.locator('#saleForm [name="status"]').selectOption("pending");
  await page.locator('#saleForm button[type="submit"]').click();
  await page.locator("#saleStatusFilter").selectOption("pending");
  await expect(page.locator("#salesList")).toContainText("Revisión móvil");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#salesList [data-delete-sale]").first().click();
  await expect(page.locator("#salesList")).not.toContainText("Revisión móvil");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("todas las áreas del panel navegan y responden sin errores", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();

  for (const item of ["Resumen", "Productos", "Fonkies", "Fomb", "Inventario", "Pedidos", "Ventas"]) {
    await page.getByRole("button", { name: item, exact: true }).click();
    await expect(page.locator('.view.active')).toBeVisible();
  }

  for (const item of [
    ["Acceso, usuarios y Face ID", "Acceso y Face ID"],
    ["Copias y publicación", "Copias y publicación"],
    ["Historial de cambios", "Historial de cambios"]
  ]) {
    await page.getByRole("button", { name: "Abrir menú de configuración" }).click();
    await page.getByRole("button", { name: item[0] }).click();
    await expect(page.getByRole("heading", { name: item[1], exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Abrir menú de configuración" }).click();
  await page.getByRole("button", { name: "Copias y publicación" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fontana-catalogo-\d{4}-\d{2}-\d{2}\.json$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
