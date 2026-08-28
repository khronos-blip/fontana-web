const { test, expect } = require("@playwright/test");
const { existsSync, readFileSync } = require("node:fs");

const previewPages = new WeakSet();

async function openPreview(page) {
  if (!previewPages.has(page)) {
    await page.route("**/config.js*", async route => {
      const response = await route.fetch({ maxRetries: 2 });
      const body = (await response.text()).replace("previewMode: false", "previewMode: true");
      await route.fulfill({ response, body });
    });
    previewPages.add(page);
  }
  await page.goto("/");
}

async function expectModalPageLocked(page, expectedScrollY) {
  await expect(page.locator("body")).toHaveClass(/product-modal-open/);
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  if (Number.isFinite(expectedScrollY)) {
    const currentScrollY = await page.evaluate(() => scrollY);
    expect(Math.abs(currentScrollY - expectedScrollY)).toBeLessThanOrEqual(1);
  }
}

async function expectModalPageUnlocked(page) {
  await expect(page.locator("body")).not.toHaveClass(/product-modal-open/);
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
}

async function openFlavorChoice(page, builderSelector) {
  const flavorSelector = builderSelector.includes("fomb") ? ".fomb-flavors" : ".fonkie-flavors";
  const panel = page.locator(`${builderSelector} .choice-panel`).filter({ has: page.locator(flavorSelector) });
  if (!(await panel.getAttribute("open"))) await panel.locator("summary").click();
  await expect(panel).toHaveAttribute("open", "");
}

async function openProductCard(page, selector) {
  const card = typeof selector === "string" ? page.locator(selector) : selector;
  const expanded = page.locator(".product-expanded");
  const alreadyExpanded = await card.evaluate(element => element.classList.contains("product-expanded"));
  if (!alreadyExpanded && await expanded.count()) {
    await expanded.locator(".product-expanded-media").click();
    await expect(expanded).toHaveCount(0, { timeout: 1500 });
  }
  await expect(card).toHaveClass(/product-flip-ready/, { timeout: 10_000 });
  if (!(await card.evaluate(element => element.classList.contains("product-flipped")))) {
    await card.locator(".product-media").first().click();
  }
  await expect(card).toHaveClass(/product-flipped/);
  return card;
}

async function closeProductCard(page) {
  const expanded = page.locator(".product-expanded");
  if (!await expanded.count()) return;
  await expanded.locator(".product-expanded-media").click();
  await expect(expanded).toHaveCount(0, { timeout: 1500 });
}

async function seekPhysicalCardTurn(locator, currentTime = 430) {
  await expect.poll(() => locator.evaluate(element => element.getAnimations()
    .filter(animation => animation.effect?.target === element)
    .length)).toBeGreaterThan(0);
  await locator.evaluate((element, time) => {
    const animation = element.getAnimations()
      .find(candidate => candidate.effect?.target === element);
    animation.pause();
    animation.currentTime = time;
  }, currentTime);
}

async function resumePhysicalCardTurn(locator) {
  await locator.evaluate(element => {
    const animation = element.getAnimations()
      .find(candidate => candidate.effect?.target === element);
    animation?.play();
  });
}

async function swipeExpandedFlavor(page, direction, targetSelector = ".builder-flavor-expanded-media") {
  const target = page.locator(targetSelector);
  await expect(target).toBeVisible();
  await target.evaluate((element, swipeDirection) => {
    const box = element.getBoundingClientRect();
    const y = box.top + (box.height * .48);
    const startX = swipeDirection === "left" ? box.left + (box.width * .78) : box.left + (box.width * .22);
    const endX = swipeDirection === "left" ? box.left + (box.width * .22) : box.left + (box.width * .78);
    const eventOptions = (type, x, buttons) => ({
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(new PointerEvent("pointerdown", eventOptions("pointerdown", startX, 1)));
    element.dispatchEvent(new PointerEvent("pointermove", eventOptions("pointermove", (startX + endX) / 2, 1)));
    element.dispatchEvent(new PointerEvent("pointerup", eventOptions("pointerup", endX, 0)));
  }, direction);
}

async function fillCheckout(page, { allergies = false, birthdayCandle = false } = {}) {
  const expanded = page.locator(".product-expanded");
  if (await expanded.count()) {
    const closing = await expanded.evaluate(element => element.classList.contains("product-expanded-closing"));
    if (!closing) await expanded.locator(".product-expanded-media").click();
    await expect(expanded).toHaveCount(0, { timeout: 1500 });
  }
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
    await page.locator(".item-allergy-field").first().locator("summary").click();
    await page.locator('[name^="allergyNote:"]').first().fill("Evitar frutos secos");
    await page.locator("#crossContamination").check();
  }
}

function createBuilderAvailabilityState() {
  return {
    version: 2,
    settings: { productionWithElectricity: true, stockTodayOpen: true },
    products: [],
    builders: {
      fonkies: {
        visible: true,
        status: "available",
        requiresElectricity: false,
        minimumQuantity: 4,
        singlePrice: 15,
        mixedPrice: 17,
        extraPrice: 3.5,
        image: "assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",
        flavors: [
          {
            name: "Fonkie con stock real",
            ingredients: "Harina de almendra y chocolate vegano oscuro",
            image: "assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",
            status: "available",
            stockTracked: true
          },
          {
            name: "Fonkie para encargo",
            ingredients: "Harina de almendra y pistacho",
            image: "assets/fonkie-pistachio-white-chocolate-fontana-pro.jpg",
            status: "sold-out",
            stockTracked: true
          },
          {
            name: "Fonkie sin inventario cargado",
            ingredients: "Harina de almendra y canela",
            image: "assets/fonkie-cinnamon-roll-fontana-pro.jpg",
            status: "available"
          }
        ]
      },
      fomb: {
        visible: true,
        status: "available",
        minimumQuantity: 4,
        sizes: [{ quantity: 4, price: 15 }, { quantity: 12, price: 30 }],
        extraPrice: 3.5,
        image: "assets/fomb-pistachio-fontana-pro.jpg",
        flavors: [
          {
            name: "Fomb con cantidad cargada",
            ingredients: "Pistacho y chocolate blanco vegano",
            image: "assets/fomb-pistachio-fontana-pro.jpg",
            status: "available",
            stockTracked: true
          },
          {
            name: "Fomb para encargo",
            ingredients: "Avellana y chocolate oscuro vegano",
            image: "assets/fomb-ferrero-fontana-pro.jpg",
            status: "sold-out",
            stockTracked: true
          },
          {
            name: "Fomb sin inventario cargado",
            ingredients: "Coco y chocolate blanco vegano",
            image: "assets/fomb-raffaello-fontana-pro.jpg",
            status: "available"
          }
        ]
      }
    }
  };
}

async function installBuilderAvailabilityCatalog(page) {
  await page.addInitScript(state => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify(state));
  }, createBuilderAvailabilityState());
}

test("cliente prepara un pedido completo para WhatsApp", async ({ page }) => {
  await openPreview(page);
  const cake = await openProductCard(page, '[data-id="pistacho"]');
  await cake.locator(".product-back .add").click();
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
  const cake = await openProductCard(page, '[data-id="pistacho"]');
  await cake.locator(".product-back .add").click();
  await fillCheckout(page, { birthdayCandle: true });
  await expect(page.locator("#birthdayCandlePanel")).toBeVisible();
  await expect(page.locator('input[name="birthdayCandle"]')).toHaveCount(2);
  await page.locator('#checkoutForm button[type="submit"]').click();
  expect(await page.evaluate(() => window.__copiedOrder)).toContain("• Vela de cumpleaños: Sí");

  await page.reload();
  await page.evaluate(() => localStorage.removeItem("fontana-cart-v1"));
  await page.reload();
  await page.getByRole("button", { name: "Bebida" }).click();
  const drink = await openProductCard(page, '[data-product-id="agua-minalba-600"]');
  await drink.locator(".product-back .add").click();
  await fillCheckout(page);
  await expect(page.locator("#birthdayCandlePanel")).toBeHidden();
  await page.locator('#checkoutForm button[type="submit"]').click();
  expect(await page.evaluate(() => window.__copiedOrder)).not.toContain("Vela de cumpleaños");
});

test("el menú acumula clics rápidos, respeta el stock y permite restar desde la tarjeta", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify({
      version: 2,
      settings: { productionWithElectricity: true, stockTodayOpen: true },
      products: [{
        id: "ballerine",
        category: "cakes",
        name: "Torta Ballerine",
        price: 12,
        image: "assets/ballerine-fontana-pro.jpg",
        description: "Individual para 1–2 personas.",
        ingredients: "Harina de almendra, monkfruit y huevo.",
        weight: "180 G APROX.",
        status: "available",
        stockQuantity: 3,
        visible: true
      }],
      builders: {}
    }));
  });
  await openPreview(page);
  const card = page.locator('[data-product-id="ballerine"]');
  const plus = card.locator(".product-front .add");
  const minus = card.locator(".product-front .product-minus");
  const quantity = card.locator(".product-front .product-menu-qty");

  await expect(minus).toBeHidden();
  await plus.evaluate(button => {
    for (let index = 0; index < 5; index += 1) button.click();
  });
  await expect(page.locator("#cartCount")).toHaveText("3");
  await expect(quantity).toHaveText("3");
  await expect(minus).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Llegaste al máximo disponible de Torta Ballerine");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("controles-rapidos-producto-movil.png"), fullPage: false });

  await minus.click();
  await expect(quantity).toHaveText("2");
  await minus.click();
  await minus.click();
  await expect(page.locator("#cartCount")).toHaveText("0");
  await expect(minus).toBeHidden();
  await expect(quantity).toBeHidden();

  await page.setViewportSize({ width: 1366, height: 900 });
  const desktopCard = page.locator('[data-product-id="ballerine"]');
  await desktopCard.locator(".product-front .add").evaluate(button => {
    button.click();
    button.click();
  });
  await expect(desktopCard.locator(".product-front .product-menu-qty")).toHaveText("2");
  await expect(desktopCard.locator(".product-front .product-minus")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await desktopCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("controles-rapidos-producto-escritorio.png"), fullPage: false });
});

test("las tarjetas conservan la compra al frente y giran físicamente al ampliarse", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.locator(".product.product-flip-ready").first().waitFor();
  const productCount = await page.locator(".product").count();
  await expect(page.locator(".product.product-flip-ready")).toHaveCount(productCount);
  const card = page.locator('[data-product-id="pistacho-clasico"]');
  const front = card.locator(".product-front");
  const back = card.locator(".product-back");

  await expect(front).toBeVisible();
  await expect(back).toHaveAttribute("aria-hidden", "true");
  await expect(front.locator(".product-safety")).toBeVisible();
  await expect(front.locator(".add")).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const compactBox = await card.boundingBox();
  const openingBox = await front.locator(".product-media").evaluate(element => {
    element.click();
    const cardElement = element.closest(".product");
    const box = cardElement.getBoundingClientRect();
    return { width: box.width, height: box.height, x: box.x, y: box.y };
  });
  expect(Math.abs(openingBox.width - compactBox.width)).toBeLessThanOrEqual(3);
  expect(Math.abs(openingBox.height - compactBox.height)).toBeLessThanOrEqual(3);
  expect(Math.abs(openingBox.x - compactBox.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(openingBox.y - compactBox.y)).toBeLessThanOrEqual(3);
  await expect(card).toHaveClass(/product-flipped/);
  await expect(back.locator(".product-expanded-media")).toHaveAttribute("aria-expanded", "true");
  await seekPhysicalCardTurn(card);
  const physicalTurn = await card.evaluate(element => ({
    outerTransform: getComputedStyle(element).transform,
    innerTransform: getComputedStyle(element.querySelector(".product-flip-inner")).transform,
    width: element.getBoundingClientRect().width
  }));
  expect(physicalTurn.outerTransform).not.toBe("none");
  expect(physicalTurn.innerTransform).toBe("none");
  expect(physicalTurn.width).toBeLessThan(compactBox.width * 0.45);
  await page.screenshot({ path: testInfo.outputPath("tarjeta-giro-fisico-mitad-movil.png"), fullPage: false });
  await resumePhysicalCardTurn(card);
  await page.waitForTimeout(520);
  await expect(back).toBeVisible();
  await expect(front).toBeHidden();
  await expect(back.locator(".product-expanded-media img")).toBeVisible();
  await expect(back.locator(".product-safety")).toBeVisible();
  await expect(back.locator(".add")).toBeVisible();
  const expandedBox = await card.boundingBox();
  expect(expandedBox.width).toBeGreaterThan(compactBox.width * 1.3);
  expect(expandedBox.height).toBeGreaterThan(compactBox.height * 1.25);
  expect(expandedBox.width).toBeLessThanOrEqual(334);
  expect(expandedBox.height).toBeLessThanOrEqual(740);
  expect(expandedBox.x).toBeGreaterThanOrEqual(27);
  expect(expandedBox.y).toBeGreaterThanOrEqual(51);

  const expandedPlus = back.locator(".add");
  const expandedMinus = back.locator(".product-minus");
  const expandedQuantity = back.locator(".product-menu-qty");
  await expandedPlus.click();
  await expect(expandedQuantity).toHaveText("1");
  await expect(expandedMinus).toBeVisible();
  await expect(card).toHaveClass(/product-expanded/);
  await expect(card).not.toHaveClass(/product-expanded-closing/);
  await expandedMinus.click();
  await expect(page.locator("#cartCount")).toHaveText("0");
  await expect(expandedMinus).toBeHidden();
  await expect(card).toHaveClass(/product-expanded/);
  await expect(card).not.toHaveClass(/product-expanded-closing/);

  await back.locator(".product-expanded-media").click();
  await expect(card).toHaveClass(/product-expanded-closing/);
  await seekPhysicalCardTurn(card);
  const physicalReturn = await card.evaluate(element => ({
    outerTransform: getComputedStyle(element).transform,
    innerTransform: getComputedStyle(element.querySelector(".product-flip-inner")).transform,
    width: element.getBoundingClientRect().width
  }));
  expect(physicalReturn.outerTransform).not.toBe("none");
  expect(physicalReturn.innerTransform).toBe("none");
  expect(physicalReturn.width).toBeLessThan(expandedBox.width * 0.45);
  await expect(card).toHaveClass(/product-expanded-closing/);
  await resumePhysicalCardTurn(card);
  await expect(card).not.toHaveClass(/product-expanded/, { timeout: 1200 });
  await expect(front.locator(".product-media")).toBeFocused();

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.reload();
  const desktopCard = page.locator('[data-product-id="pistacho-clasico"]');
  await expect(desktopCard).toHaveClass(/product-flip-ready/);
  const desktopCompactBox = await desktopCard.boundingBox();
  await desktopCard.locator(".product-front .product-media").click();
  await expect(desktopCard).toHaveClass(/product-flipped/);
  await seekPhysicalCardTurn(desktopCard);
  const desktopPhysicalTurn = await desktopCard.evaluate(element => ({
    outerTransform: getComputedStyle(element).transform,
    innerTransform: getComputedStyle(element.querySelector(".product-flip-inner")).transform,
    width: element.getBoundingClientRect().width
  }));
  expect(desktopPhysicalTurn.outerTransform).not.toBe("none");
  expect(desktopPhysicalTurn.innerTransform).toBe("none");
  expect(desktopPhysicalTurn.width).toBeLessThan(desktopCompactBox.width * 0.5);
  await page.screenshot({ path: testInfo.outputPath("tarjeta-giro-fisico-mitad-escritorio.png"), fullPage: false });
  await resumePhysicalCardTurn(desktopCard);
  await page.waitForTimeout(520);
  const desktopExpandedBox = await desktopCard.boundingBox();
  expect(desktopExpandedBox.width).toBeGreaterThan(desktopCompactBox.width * 2.2);
  expect(desktopExpandedBox.width).toBeLessThanOrEqual(1040);
  expect(desktopExpandedBox.height).toBeLessThanOrEqual(640);
  expect(desktopExpandedBox.width / desktopExpandedBox.height).toBeGreaterThan(1.5);
  expect(desktopExpandedBox.x).toBeGreaterThanOrEqual(79);
  expect(desktopExpandedBox.y).toBeGreaterThanOrEqual(59);
  const desktopBack = desktopCard.locator(".product-back");
  await desktopBack.locator(".add").click();
  await expect(desktopBack.locator(".product-menu-qty")).toHaveText("1");
  await expect(desktopCard).toHaveClass(/product-expanded/);
  await expect(desktopCard).not.toHaveClass(/product-expanded-closing/);
  await desktopBack.locator(".product-minus").click();
  await expect(page.locator("#cartCount")).toHaveText("0");
  await expect(desktopCard).toHaveClass(/product-expanded/);
  await expect(desktopCard).not.toHaveClass(/product-expanded-closing/);
  await page.locator(".product-flip-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(desktopCard).not.toHaveClass(/product-flipped/);
});

test("la vista ampliada de escritorio muestra mejor la foto y todos los ingredientes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const desktopCases = [
    { width: 1280, height: 800, selector: '[data-id="naranja"]' },
    { width: 1440, height: 900, selector: '[data-id="pistacho-clasico"]' },
    { width: 1024, height: 768, selector: '[data-product-id="raviolis"]' },
    { width: 960, height: 768, selector: '[data-product-id="raviolis"]' }
  ];

  for (const item of desktopCases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await openPreview(page);
    const card = page.locator(item.selector);
    const sourceIngredients = await card.getAttribute("data-ingredients");
    await expect(card.locator(".product-front .product-safety")).not.toHaveAttribute("open", "");
    await openProductCard(page, card);

    const back = card.locator(".product-back");
    const ingredients = back.locator(".product-expanded-ingredients");
    await expect(ingredients).toBeVisible();
    await expect(ingredients.locator("h4")).toHaveText("Ingredientes");
    await expect(ingredients.locator("div")).toBeVisible();
    await expect(ingredients).toContainText(sourceIngredients);
    await expect(back.locator(".product-safety")).toBeHidden();
    await expect(back).toBeFocused();

    const layout = await card.evaluate(element => {
      const cardBox = element.getBoundingClientRect();
      const back = element.querySelector(".product-back");
      const media = back.querySelector(".product-expanded-media").getBoundingClientRect();
      const bodyElement = back.querySelector(".product-expanded-body");
      const body = bodyElement.getBoundingClientRect();
      const ingredientsBox = back.querySelector(".product-expanded-ingredients").getBoundingClientRect();
      const ingredientsTextElement = back.querySelector(".product-expanded-ingredients div");
      const ingredientsText = ingredientsTextElement.getBoundingClientRect();
      const footer = back.querySelector(".product-footer").getBoundingClientRect();
      const image = back.querySelector(".product-expanded-media img");
      const imageBox = image.getBoundingClientRect();
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      const mediaRatio = media.width / media.height;
      return {
        card: { x: cardBox.x, y: cardBox.y, right: cardBox.right, bottom: cardBox.bottom, width: cardBox.width, height: cardBox.height },
        media: { x: media.x, y: media.y, right: media.right, width: media.width, height: media.height, ratio: mediaRatio },
        body: { x: body.x, y: body.y, width: body.width, height: body.height, clientHeight: bodyElement.clientHeight, scrollHeight: bodyElement.scrollHeight },
        ingredients: { top: ingredientsBox.top, bottom: ingredientsBox.bottom, height: ingredientsBox.height },
        ingredientsText: {
          top: ingredientsText.top,
          bottom: ingredientsText.bottom,
          clientHeight: ingredientsTextElement.clientHeight,
          scrollHeight: ingredientsTextElement.scrollHeight
        },
        footer: { top: footer.top, bottom: footer.bottom },
        image: {
          x: imageBox.x,
          y: imageBox.y,
          width: imageBox.width,
          height: imageBox.height,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          objectFit: getComputedStyle(image).objectFit,
          transform: getComputedStyle(image).transform,
          visibleFraction: Math.min(mediaRatio / sourceRatio, sourceRatio / mediaRatio)
        },
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });

    expect(layout.card.width).toBeGreaterThanOrEqual(Math.min(1000, item.width - 96));
    expect(layout.card.width / layout.card.height).toBeGreaterThan(1.3);
    expect(layout.card.x).toBeGreaterThanOrEqual(47);
    expect(layout.card.y).toBeGreaterThanOrEqual(47);
    expect(layout.card.right).toBeLessThanOrEqual(item.width - 47);
    expect(layout.card.bottom).toBeLessThanOrEqual(item.height - 47);
    expect(layout.media.width / layout.card.width).toBeGreaterThan(0.57);
    expect(layout.media.ratio).toBeGreaterThanOrEqual(item.width < 1100 ? 0.75 : 0.9);
    expect(Math.abs(layout.media.height - (layout.card.height - 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.media.right - layout.body.x)).toBeLessThanOrEqual(2);
    expect(layout.ingredients.height).toBeGreaterThan(130);
    expect(layout.ingredients.top).toBeGreaterThanOrEqual(layout.body.y);
    expect(layout.ingredients.bottom).toBeLessThanOrEqual(layout.footer.top);
    expect(layout.ingredientsText.top).toBeGreaterThanOrEqual(layout.ingredients.top);
    expect(layout.ingredientsText.bottom).toBeLessThanOrEqual(layout.ingredients.bottom);
    expect(layout.ingredientsText.scrollHeight).toBeLessThanOrEqual(layout.ingredientsText.clientHeight + 1);
    expect(layout.footer.top - layout.ingredients.bottom).toBeLessThanOrEqual(24);
    expect(layout.body.scrollHeight).toBeLessThanOrEqual(layout.body.clientHeight + 2);
    expect(layout.image.naturalWidth).toBeGreaterThanOrEqual(1200);
    expect(layout.image.naturalHeight).toBeGreaterThanOrEqual(1000);
    expect(layout.image.objectFit).toBe("cover");
    expect(layout.image.transform).toBe("none");
    expect(Math.abs(layout.image.x - layout.media.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.image.y - layout.card.y - 1)).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.image.width - layout.media.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.image.height - layout.media.height)).toBeLessThanOrEqual(1);
    expect(layout.image.visibleFraction).toBeGreaterThanOrEqual(item.width < 1100 ? 0.57 : 0.65);
    expect(layout.pageOverflow).toBeLessThanOrEqual(0);

    await closeProductCard(page);
    await expect(card.locator(".product-front .product-safety")).toBeVisible();
    await expect(card.locator(".product-front .product-safety")).not.toHaveAttribute("open", "");
    await expect(card.locator(".product-front .product-expanded-ingredients")).toBeHidden();
    await expect(card.locator(".product-front .product-media")).toBeFocused();
  }

  await page.setViewportSize({ width: 959, height: 768 });
  await openPreview(page);
  const tabletCard = page.locator('[data-id="naranja"]');
  await openProductCard(page, tabletCard);
  await expect(tabletCard.locator(".product-back .product-expanded-ingredients")).toBeHidden();
  await expect(tabletCard.locator(".product-back .product-safety")).toBeVisible();
  const tabletBox = await tabletCard.boundingBox();
  expect(tabletBox.width).toBeLessThanOrEqual(620);
  await closeProductCard(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const mobileCard = page.locator('[data-id="naranja"]');
  const compactBox = await mobileCard.boundingBox();
  await openProductCard(page, mobileCard);
  await expect(mobileCard.locator(".product-back .product-expanded-ingredients")).toBeHidden();
  await expect(mobileCard.locator(".product-back .product-safety")).toBeVisible();
  await expect(mobileCard.locator(".product-back .product-safety")).not.toHaveAttribute("open", "");
  const mobileLayout = await mobileCard.evaluate(element => {
    const card = element.getBoundingClientRect();
    const media = element.querySelector(".product-expanded-media").getBoundingClientRect();
    const body = element.querySelector(".product-expanded-body").getBoundingClientRect();
    return { card, media, body, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(mobileLayout.card.width).toBeLessThanOrEqual(334);
  expect(Math.abs(mobileLayout.media.width - (mobileLayout.card.width - 2))).toBeLessThanOrEqual(2);
  expect(mobileLayout.media.bottom).toBeLessThanOrEqual(mobileLayout.body.top + 2);
  expect(mobileLayout.overflow).toBeLessThanOrEqual(0);
  await closeProductCard(page);
  await expect.poll(async () => {
    const restoredBox = await mobileCard.boundingBox();
    return Math.max(
      Math.abs(restoredBox.width - compactBox.width),
      Math.abs(restoredBox.height - compactBox.height)
    );
  }).toBeLessThanOrEqual(1);
  await expect(mobileCard.locator(".product-front .product-safety")).not.toHaveAttribute("open", "");
});

test("Fonkies y Fomb giran como tarjetas completas sin perder selección ni scroll", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await expect(page.locator(".product-expand-hint")).toHaveCount(0);
  await expect(page.getByText("Toca la foto para cerrar", { exact: true })).toHaveCount(0);

  const cases = [
    {
      filter: "Fonkies · Galletas",
      card: ".fonkie-gallery-card",
      row: ".fonkie-flavor",
      screenshot: "fonkie-giro-fisico-mitad-movil.png"
    },
    {
      filter: "Fomb · Bombones",
      card: ".builder-gallery-card",
      row: ".fomb-flavor",
      screenshot: "fomb-giro-fisico-mitad-movil.png"
    }
  ];

  for (const item of cases) {
    await page.getByRole("button", { name: item.filter }).click();
    const source = page.locator(item.card).first();
    await source.scrollIntoViewIfNeeded();
    const baseline = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await source.click();
    await expect(source).toHaveAttribute("aria-expanded", "true");
    const overlay = page.locator(".builder-flavor-flip-card");
    await expect(overlay).toBeVisible();
    await overlay.evaluate(element => {
      element.getAnimations({ subtree: true }).forEach(animation => {
        animation.pause();
        animation.currentTime = 0;
      });
    });
    const compactImageBox = await source.locator("img").boundingBox();
    const openingImageBox = await overlay.locator(".builder-flavor-flip-front img").boundingBox();
    expect(Math.abs((openingImageBox.x + openingImageBox.width / 2) - (compactImageBox.x + compactImageBox.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs((openingImageBox.y + openingImageBox.height / 2) - (compactImageBox.y + compactImageBox.height / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(openingImageBox.width - compactImageBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(openingImageBox.height - compactImageBox.height)).toBeLessThanOrEqual(1);
    await overlay.evaluate(element => element.getAnimations({ subtree: true }).forEach(animation => animation.play()));
    await seekPhysicalCardTurn(overlay);
    const physicalTurn = await overlay.evaluate(element => ({
      outerTransform: getComputedStyle(element).transform,
      innerTransform: getComputedStyle(element.querySelector(".builder-flavor-flip-inner")).transform,
      opacity: Number.parseFloat(getComputedStyle(element).opacity)
    }));
    expect(physicalTurn.outerTransform).not.toBe("none");
    expect(physicalTurn.innerTransform).toBe("none");
    expect(physicalTurn.opacity).toBeLessThanOrEqual(.03);
    await page.screenshot({ path: testInfo.outputPath(item.screenshot), fullPage: false });
    await resumePhysicalCardTurn(overlay);
    await page.waitForTimeout(520);
    await expect(overlay.locator(".builder-flavor-expanded-media img")).toBeVisible();
    await expect(overlay.locator(".builder-flavor-expanded-media img")).toHaveCSS("object-fit", "contain");
    const expandedMediaRatio = await overlay.locator(".builder-flavor-expanded-media").evaluate(element => {
      return element.clientWidth / element.clientHeight;
    });
    expect(expandedMediaRatio).toBeGreaterThan(.98);
    expect(expandedMediaRatio).toBeLessThan(1.02);
    const expandedImageBox = await overlay.locator(".builder-flavor-expanded-media img").boundingBox();
    expect(expandedImageBox.width).toBeGreaterThan(compactImageBox.width);
    expect(expandedImageBox.height).toBeGreaterThan(compactImageBox.height);
    await expect(overlay.locator(".builder-flavor-expanded-details h3")).not.toBeEmpty();
    const expandedLayout = await overlay.evaluate(element => {
      const details = element.querySelector(".builder-flavor-expanded-details")?.getBoundingClientRect();
      const choose = element.querySelector(".builder-flavor-choose")?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return details && choose ? {
        detailsHeight: details.height,
        buttonInside: choose.bottom <= box.bottom + 1
      } : null;
    });
    expect(expandedLayout).not.toBeNull();
    expect(expandedLayout.detailsHeight).toBeGreaterThan(150);
    expect(expandedLayout.buttonInside).toBe(true);
    await expectModalPageLocked(page, baseline.y);

    await overlay.locator(".builder-flavor-expanded-media").click();
    await expect(overlay).toHaveClass(/builder-flavor-flip-closing/);
    await seekPhysicalCardTurn(overlay);
    const physicalReturn = await overlay.evaluate(element => ({
      outerTransform: getComputedStyle(element).transform,
      innerTransform: getComputedStyle(element.querySelector(".builder-flavor-flip-inner")).transform,
      opacity: Number.parseFloat(getComputedStyle(element).opacity),
      backdropOpacity: Number.parseFloat(getComputedStyle(document.querySelector(".builder-flavor-flip-backdrop")).opacity)
    }));
    expect(physicalReturn.outerTransform).not.toBe("none");
    expect(physicalReturn.innerTransform).toBe("none");
    expect(physicalReturn.opacity).toBeLessThanOrEqual(.03);
    expect(physicalReturn.backdropOpacity).toBeGreaterThan(0.7);
    await resumePhysicalCardTurn(overlay);
    await expect(overlay).toHaveCount(0, { timeout: 1300 });
    await expectModalPageUnlocked(page);
    await expect(source).toHaveAttribute("aria-expanded", "false");
    const restoredAfterPhotoClose = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    expect(Math.abs(restoredAfterPhotoClose.x - baseline.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(restoredAfterPhotoClose.y - baseline.y)).toBeLessThanOrEqual(1);

    await source.click();
    await expect(overlay).toBeVisible();
    await page.waitForTimeout(920);
    const output = page.locator(`${item.row} output`).first();
    const previous = Number(await output.textContent());
    await overlay.locator(".builder-flavor-choose").click();
    await expect(overlay).toHaveClass(/builder-flavor-flip-closing/);
    await expect(overlay).toHaveCount(0);
    await expect(output).toHaveText(String(previous + 1));
    await expect(source).toHaveAttribute("aria-expanded", "false");
    const restored = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    expect(Math.abs(restored.x - baseline.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(restored.y - baseline.y)).toBeLessThanOrEqual(1);
  }
});

test("el cierre retira el fondo sin repintar ni reposicionar el menú", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);

  for (const item of [
    { filter: "Fonkies · Galletas", card: ".fonkie-gallery-card", backdrop: ".builder-flavor-flip-backdrop" },
    { filter: "Fomb · Bombones", card: ".builder-gallery-card", backdrop: ".builder-flavor-flip-backdrop" }
  ]) {
    await page.getByRole("button", { name: item.filter }).click();
    const source = page.locator(item.card).first();
    await source.scrollIntoViewIfNeeded();
    const frameBefore = await page.evaluate(() => {
      const nav = document.querySelector("#nav").getBoundingClientRect();
      const filters = document.querySelector(".filters").getBoundingClientRect();
      return { scrollY, navTop: nav.top, navBottom: nav.bottom, filtersTop: filters.top, filtersBottom: filters.bottom };
    });
    await source.click();
    const overlay = page.locator(".builder-flavor-flip-card");
    await expect(overlay).toBeVisible();
    await expectModalPageLocked(page, frameBefore.scrollY);
    const frameWhileOpen = await page.evaluate(() => {
      const nav = document.querySelector("#nav").getBoundingClientRect();
      const filters = document.querySelector(".filters").getBoundingClientRect();
      return { scrollY, navTop: nav.top, navBottom: nav.bottom, filtersTop: filters.top, filtersBottom: filters.bottom };
    });
    expect(frameWhileOpen).toEqual(frameBefore);
    await page.waitForTimeout(920);
    await page.evaluate(backdropSelector => {
      const backdrop = document.querySelector(backdropSelector);
      const originalCancel = Animation.prototype.cancel;
      const originalScrollTo = window.scrollTo.bind(window);
      window.__fontanaBackdropCancelStates = [];
      window.__fontanaCloseScrollCalls = [];
      Animation.prototype.cancel = function patchedCancel() {
        if (this.effect?.target === backdrop) {
          window.__fontanaBackdropCancelStates.push({
            hidden: backdrop.hidden,
            inlineOpacity: backdrop.style.opacity,
            visibleClass: backdrop.classList.contains("visible")
          });
        }
        return originalCancel.call(this);
      };
      window.scrollTo = (...args) => {
        window.__fontanaCloseScrollCalls.push(args);
        return originalScrollTo(...args);
      };
      window.__restoreFontanaAnimationCancel = () => {
        Animation.prototype.cancel = originalCancel;
        window.scrollTo = originalScrollTo;
      };
    }, item.backdrop);
    await overlay.locator(".builder-flavor-expanded-media").click();
    await expect(overlay).toHaveCount(0, { timeout: 1300 });
    const closeLifecycle = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const states = window.__fontanaBackdropCancelStates;
      const scrollCalls = window.__fontanaCloseScrollCalls;
      window.__restoreFontanaAnimationCancel?.();
      delete window.__restoreFontanaAnimationCancel;
      delete window.__fontanaBackdropCancelStates;
      delete window.__fontanaCloseScrollCalls;
      return { states, scrollCalls };
    });
    expect(closeLifecycle.states).toHaveLength(1);
    expect(closeLifecycle.states[0]).toEqual({
      hidden: true,
      inlineOpacity: "0",
      visibleClass: false
    });
    expect(closeLifecycle.scrollCalls).toHaveLength(0);
    await expect(page.locator(item.backdrop)).toBeHidden();
    await expectModalPageUnlocked(page);
    await expect(page.locator("html")).toHaveClass(/modal-hover-guard/);
    const frameAfter = await page.evaluate(() => {
      const nav = document.querySelector("#nav").getBoundingClientRect();
      const filters = document.querySelector(".filters").getBoundingClientRect();
      return { scrollY, navTop: nav.top, navBottom: nav.bottom, filtersTop: filters.top, filtersBottom: filters.bottom };
    });
    expect(frameAfter).toEqual(frameBefore);
    await page.mouse.move(1, 1);
    await expect(page.locator("html")).not.toHaveClass(/modal-hover-guard/);
  }
});

test("el cierre no activa por accidente un filtro que queda debajo de la foto", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1366, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
    await page.locator(".filters").evaluate((filters, viewportHeight) => {
      const rect = filters.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - (viewportHeight * 0.28),
        behavior: "instant"
      });
    }, viewport.height);

    // Open without Playwright auto-scrolling the source. This deliberately
    // leaves the filter row behind the expanded photo, matching the real
    // pointer hit-test that used to paint a second filter as active on close.
    await page.locator(".fonkie-gallery-card").first().evaluate(element => element.click());
    const overlay = page.locator(".builder-flavor-flip-card");
    await expect(overlay).toBeVisible();
    await page.waitForTimeout(920);
    const hit = await page.evaluate(() => {
      const media = document.querySelector(".builder-flavor-expanded-media")?.getBoundingClientRect();
      const active = document.querySelector(".filter.active");
      if (!media || !active) return null;
      for (const filter of document.querySelectorAll(".filter:not(.active)")) {
        const rect = filter.getBoundingClientRect();
        const left = Math.max(media.left, rect.left, 0);
        const right = Math.min(media.right, rect.right, innerWidth);
        const top = Math.max(media.top, rect.top, 0);
        const bottom = Math.min(media.bottom, rect.bottom, innerHeight);
        if (right - left < 8 || bottom - top < 8) continue;
        return {
          x: (left + right) / 2,
          y: (top + bottom) / 2,
          filter: filter.dataset.filter,
          restingBackground: getComputedStyle(filter).backgroundColor,
          activeBackground: getComputedStyle(active).backgroundColor
        };
      }
      return null;
    });
    expect(hit).not.toBeNull();
    expect(hit.restingBackground).not.toBe(hit.activeBackground);

    await page.mouse.click(hit.x, hit.y);
    await expect(overlay).toHaveCount(0, { timeout: 1300 });
    await expect(page.locator("html")).toHaveClass(/modal-hover-guard/);
    const guarded = await page.evaluate(({ x, y, filter: filterName }) => {
      const filter = document.querySelector(`.filter[data-filter="${CSS.escape(filterName)}"]`);
      return {
        isPointerTarget: document.elementFromPoint(x, y)?.closest(".filter") === filter,
        isHovered: filter?.matches(":hover"),
        background: filter ? getComputedStyle(filter).backgroundColor : ""
      };
    }, hit);
    expect(guarded.isPointerTarget).toBe(true);
    expect(guarded.isHovered).toBe(true);
    expect(guarded.background).toBe(hit.restingBackground);

    await page.mouse.move(hit.x + 1, hit.y);
    await expect(page.locator("html")).not.toHaveClass(/modal-hover-guard/);
    await expect.poll(() => page.evaluate(filterName => {
      const filter = document.querySelector(`.filter[data-filter="${CSS.escape(filterName)}"]`);
      return filter ? getComputedStyle(filter).backgroundColor : "";
    }, hit.filter)).toBe(hit.activeBackground);
  }
});

test("las fotos ampliadas de Fonkies y Fomb también se muestran completas en escritorio", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openPreview(page);

  for (const item of [
    { filter: "Fonkies · Galletas", card: ".fonkie-gallery-card" },
    { filter: "Fomb · Bombones", card: ".builder-gallery-card" }
  ]) {
    await page.getByRole("button", { name: item.filter }).click();
    const source = page.locator(item.card).first();
    await expect(source).toBeVisible();
    await source.click();
    const overlay = page.locator(".builder-flavor-flip-card");
    await expect(overlay).toBeVisible();
    await page.waitForTimeout(920);
    await expect(overlay.locator(".builder-flavor-expanded-media img")).toHaveCSS("object-fit", "contain");
    const desktopMediaRatio = await overlay.locator(".builder-flavor-expanded-media").evaluate(element => {
      return element.clientWidth / element.clientHeight;
    });
    expect(desktopMediaRatio).toBeGreaterThan(.98);
    expect(desktopMediaRatio).toBeLessThan(1.02);
    await expect(overlay.locator(".builder-flavor-expanded-details h3")).not.toBeEmpty();
    await expect(overlay.locator(".builder-flavor-choose")).toBeVisible();
    await overlay.locator(".builder-flavor-expanded-media").click();
    await expect(overlay).toHaveCount(0, { timeout: 1300 });
  }
});

test("la vista ampliada navega sabores con swipe, flip, teclado e inventario correcto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);

  for (const item of [
    { filter: "Fonkies · Galletas", card: ".fonkie-gallery-card", row: ".fonkie-flavor" },
    { filter: "Fomb · Bombones", card: ".builder-gallery-card", row: ".fomb-flavor" }
  ]) {
    await page.getByRole("button", { name: item.filter }).click();
    const cards = page.locator(item.card);
    const names = await cards.evaluateAll(elements => elements.map(element => element.dataset.flavor
      || element.querySelector("span")?.textContent?.replace(/\s·\sPre-Order\s*$/i, "").trim()));
    expect(names.length).toBeGreaterThan(2);
    const source = cards.first();
    await source.scrollIntoViewIfNeeded();
    const baseline = await page.evaluate(() => ({ y: scrollY }));
    await source.click();
    const overlay = page.locator(".builder-flavor-flip-card");
    await expect(overlay).toBeVisible();

    const swipeCue = overlay.locator(".builder-flavor-swipe-cue");
    await expect(swipeCue).toBeVisible();
    await expect(overlay.locator(".builder-flavor-nav")).toHaveCount(0);
    await expect(swipeCue).toHaveAttribute("role", "slider");
    await expect(swipeCue).toHaveAttribute("aria-valuemin", "1");
    await expect(swipeCue).toHaveAttribute("aria-valuemax", String(names.length));
    await expect(swipeCue).toHaveAttribute("aria-valuenow", "1");
    await expect(swipeCue).not.toHaveClass(/builder-flavor-swipe-cue--used/);
    await expect(swipeCue.locator(".builder-flavor-swipe-word")).toHaveText("Desliza");
    await expect(overlay).toHaveAttribute("aria-describedby", "builder-flavor-swipe-instructions");
    await expect(overlay.locator("#builder-flavor-swipe-instructions")).toContainText("Desliza horizontalmente");
    const initialBox = await overlay.boundingBox();
    const cueLayout = await overlay.evaluate(element => {
      const media = element.querySelector(".builder-flavor-expanded-media").getBoundingClientRect();
      const details = element.querySelector(".builder-flavor-expanded-details").getBoundingClientRect();
      const cue = element.querySelector(".builder-flavor-swipe-cue");
      const hitbox = cue.getBoundingClientRect();
      const dock = cue.querySelector(".builder-flavor-swipe-dock").getBoundingClientRect();
      return {
        media,
        details,
        width: hitbox.width,
        height: hitbox.height,
        dockWidth: dock.width,
        dockHeight: dock.height,
        topOverlap: media.bottom - hitbox.top,
        bottomOverlap: hitbox.bottom - details.top,
        centered: Math.abs((hitbox.left + hitbox.width / 2) - (media.left + media.width / 2)),
        pointerEvents: getComputedStyle(cue).pointerEvents,
        background: getComputedStyle(cue.querySelector(".builder-flavor-swipe-dock")).backgroundColor,
        borderColor: getComputedStyle(cue.querySelector(".builder-flavor-swipe-dock")).borderColor,
        accentColor: getComputedStyle(cue.querySelector(".builder-flavor-swipe-glider")).backgroundColor
      };
    });
    expect(cueLayout.width).toBeGreaterThanOrEqual(157.5);
    expect(cueLayout.width).toBeLessThanOrEqual(158.5);
    expect(cueLayout.height).toBeGreaterThanOrEqual(43.5);
    expect(cueLayout.height).toBeLessThanOrEqual(44.5);
    expect(cueLayout.dockWidth).toBeGreaterThanOrEqual(157.5);
    expect(cueLayout.dockWidth).toBeLessThanOrEqual(158.5);
    expect(cueLayout.dockHeight).toBeGreaterThanOrEqual(33.5);
    expect(cueLayout.dockHeight).toBeLessThanOrEqual(34.5);
    expect(Math.abs(cueLayout.topOverlap - 22)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(cueLayout.bottomOverlap - 22)).toBeLessThanOrEqual(2.5);
    expect(cueLayout.centered).toBeLessThanOrEqual(.5);
    expect(cueLayout.pointerEvents).toBe("auto");
    expect(cueLayout.background).toBe("rgba(79, 22, 81, 0.94)");
    expect(cueLayout.borderColor).toBe("rgba(184, 205, 105, 0.72)");
    expect(cueLayout.accentColor).toBe("rgb(184, 205, 105)");

    await swipeExpandedFlavor(page, "left", ".builder-flavor-swipe-cue");
    await expect(swipeCue).toHaveAttribute("aria-busy", "true");
    const switchingFace = overlay.locator(".builder-flavor-flip-back");
    await expect.poll(() => switchingFace.evaluate(element => element.getAnimations()
      .filter(animation => animation.effect?.target === element)
      .some(animation => {
        const keyframes = animation.effect.getKeyframes();
        return keyframes.some(frame => Number.parseFloat(frame.opacity) === 0
          && /rotateY\([+-]?89\.8deg\)/.test(frame.transform || ""));
      }))).toBe(true);
    await expect(overlay.locator("h3")).toHaveText(names[1], { timeout: 900 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
    await expect(swipeCue).toHaveAttribute("aria-busy", "false");
    await expect(swipeCue).toHaveAttribute("aria-disabled", "false");
    await expect(swipeCue).toHaveClass(/builder-flavor-swipe-cue--used/);
    await expect(swipeCue.locator(".builder-flavor-swipe-counter")).toHaveText(`2 / ${names.length}`);
    await expect(swipeCue).toHaveAttribute("aria-valuenow", "2");
    await expect(swipeCue).toHaveAttribute("aria-valuetext", `${names[1]}, sabor 2 de ${names.length}`);
    await page.keyboard.press("ArrowLeft");
    await expect(overlay.locator("h3")).toHaveText(names[0], { timeout: 900 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
    await expect(swipeCue.locator(".builder-flavor-swipe-counter")).toHaveText(`1 / ${names.length}`);

    const cueHitbox = await swipeCue.boundingBox();
    await page.mouse.move(cueHitbox.x + (cueHitbox.width / 2), cueHitbox.y + (cueHitbox.height / 2));
    await page.mouse.down();
    await page.mouse.move(
      cueLayout.media.left + (cueLayout.media.width * .3),
      cueHitbox.y + (cueHitbox.height / 2),
      { steps: 6 }
    );
    await page.mouse.up();
    await expect.poll(() => overlay.locator(".builder-flavor-flip-back").evaluate(element => element.getAnimations()
      .filter(animation => animation.playState === "running" && animation.effect?.target === element)
      .length)).toBeGreaterThan(0);
    await expect(overlay.locator("h3")).toHaveText(names[1], { timeout: 900 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
    await expect(overlay).toHaveAttribute("data-flavor", names[1]);
    await expect(overlay).toHaveCount(1);
    await expectModalPageLocked(page, baseline.y);
    const nextBox = await overlay.boundingBox();
    expect(Math.abs(nextBox.x - initialBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextBox.y - initialBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextBox.width - initialBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextBox.height - initialBox.height)).toBeLessThanOrEqual(1);
    await expect(overlay.locator(".builder-flavor-expanded-media img")).toHaveCSS("object-fit", "contain");

    await swipeExpandedFlavor(page, "right");
    await expect(overlay.locator("h3")).toHaveText(names[0], { timeout: 900 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
    await swipeExpandedFlavor(page, "right");
    await expect(overlay.locator("h3")).toHaveText(names.at(-1), { timeout: 900 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });

    const firstOutput = page.locator(`${item.row} output`).first();
    const lastOutput = page.locator(`${item.row} output`).last();
    const firstBefore = await firstOutput.textContent();
    const lastBefore = Number(await lastOutput.textContent());
    await overlay.locator(".builder-flavor-choose").click();
    await expect(overlay).toHaveCount(0, { timeout: 1300 });
    await expect(firstOutput).toHaveText(firstBefore);
    await expect(lastOutput).toHaveText(String(lastBefore + 1));
    const restored = await page.evaluate(() => ({ y: scrollY }));
    expect(Math.abs(restored.y - baseline.y)).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const desktopSource = page.locator(".fonkie-gallery-card").first();
  await desktopSource.click();
  const desktopOverlay = page.locator(".builder-flavor-flip-card");
  await page.waitForTimeout(920);
  const desktopNames = await page.locator(".fonkie-gallery-track > .fonkie-gallery-card").evaluateAll(elements => elements.map(element => element.dataset.flavor
    || element.querySelector("span")?.textContent?.replace(/\s·\sPre-Order\s*$/i, "").trim()));
  const desktopMedia = desktopOverlay.locator(".builder-flavor-expanded-media");
  const desktopSwipeCue = desktopOverlay.locator(".builder-flavor-swipe-cue");
  await expect(desktopSwipeCue).toBeVisible();
  await expect(desktopOverlay.locator(".builder-flavor-nav")).toHaveCount(0);
  await expect(desktopOverlay).toHaveAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
  await expect(desktopSwipeCue).toHaveAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home End");
  const desktopCueLayout = await desktopSwipeCue.evaluate(element => {
    const hitbox = element.getBoundingClientRect();
    const dock = element.querySelector(".builder-flavor-swipe-dock").getBoundingClientRect();
    return { width: hitbox.width, height: hitbox.height, dockWidth: dock.width, dockHeight: dock.height };
  });
  expect(desktopCueLayout.width).toBeGreaterThanOrEqual(163.5);
  expect(desktopCueLayout.width).toBeLessThanOrEqual(164.5);
  expect(desktopCueLayout.height).toBeGreaterThanOrEqual(47.5);
  expect(desktopCueLayout.height).toBeLessThanOrEqual(48.5);
  expect(desktopCueLayout.dockWidth).toBeGreaterThanOrEqual(163.5);
  expect(desktopCueLayout.dockHeight).toBeGreaterThanOrEqual(33.5);
  expect(desktopCueLayout.dockHeight).toBeLessThanOrEqual(34.5);
  await page.keyboard.press("ArrowRight");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[1], { timeout: 900 });
  await desktopOverlay.locator(".builder-flavor-choose").focus();
  await page.keyboard.press("ArrowDown");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[1]);
  await page.keyboard.press("ArrowLeft");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[0], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await expect(desktopSwipeCue).toHaveClass(/builder-flavor-swipe-cue--used/);
  await expect(desktopSwipeCue.locator(".builder-flavor-swipe-counter")).toHaveText(`1 / ${desktopNames.length}`);
  await desktopSwipeCue.focus();
  await desktopSwipeCue.press("End");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[desktopNames.length - 1], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await desktopSwipeCue.press("Home");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[0], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await desktopSwipeCue.press("ArrowUp");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[1], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await desktopSwipeCue.press("ArrowDown");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[0], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await desktopSwipeCue.press("ArrowLeft");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[desktopNames.length - 1], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await expect(desktopSwipeCue).toBeFocused();
  await desktopSwipeCue.press("ArrowRight");
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[0], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await expect(desktopSwipeCue).toBeFocused();
  const mediaBox = await desktopMedia.boundingBox();
  await page.mouse.move(mediaBox.x + (mediaBox.width * .82), mediaBox.y + (mediaBox.height * .5));
  await page.mouse.down();
  await page.mouse.move(mediaBox.x + (mediaBox.width * .18), mediaBox.y + (mediaBox.height * .5), { steps: 6 });
  await page.mouse.up();
  await expect(desktopOverlay.locator("h3")).toHaveText(desktopNames[1], { timeout: 900 });
  await expect(desktopOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 900 });
  await expect(desktopOverlay).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(desktopOverlay).toHaveCount(0, { timeout: 1300 });
});

test("las Fonkies y Fomb ampliadas aceptan trackpad horizontal y Shift más rueda", async ({ page }) => {
  test.setTimeout(35_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPreview(page);

  const dispatchWheelBurst = async (overlay, samples, gap = 0) => overlay.evaluate(async (element, input) => {
    const results = [];
    for (const sample of input.samples) {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: sample.deltaX || 0,
        deltaY: sample.deltaY || 0,
        deltaMode: sample.deltaMode ?? WheelEvent.DOM_DELTA_PIXEL,
        shiftKey: Boolean(sample.shiftKey),
        ctrlKey: Boolean(sample.ctrlKey)
      });
      const dispatched = element.dispatchEvent(event);
      results.push({ defaultPrevented: event.defaultPrevented, dispatched });
      if (input.gap) await new Promise(resolve => setTimeout(resolve, input.gap));
    }
    return results;
  }, { samples, gap });

  for (const item of [
    { filter: "Fonkies · Galletas", card: ".fonkie-gallery-card" },
    { filter: "Fomb · Bombones", card: ".builder-gallery-card" }
  ]) {
    await page.getByRole("button", { name: item.filter }).click();
    const cards = page.locator(item.card);
    const names = await cards.evaluateAll(elements => elements.map(element => element.dataset.flavor
      || element.querySelector("span")?.textContent?.replace(/\s·\sPre-Order\s*$/i, "").trim()));
    const source = cards.first();
    await source.scrollIntoViewIfNeeded();
    await source.click();

    const overlay = page.locator(".builder-flavor-flip-card");
    const heading = overlay.locator("h3");
    const media = overlay.locator(".builder-flavor-expanded-media");
    await expect(overlay).toBeVisible();
    await expect(heading).toHaveText(names[0]);

    const mediaBox = await media.boundingBox();
    await page.mouse.move(mediaBox.x + (mediaBox.width / 2), mediaBox.y + (mediaBox.height / 2));
    await page.mouse.wheel(72, 0);
    await expect(heading).toHaveText(names[1], { timeout: 1000 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 1000 });
    await page.waitForTimeout(210);

    const inertialBurst = await dispatchWheelBurst(overlay, [
      { deltaX: -10 },
      { deltaX: -12 },
      { deltaX: -16 },
      { deltaX: -14 },
      { deltaX: -10 },
      { deltaX: -8 },
      { deltaX: -4 }
    ], 12);
    expect(inertialBurst.every(result => result.defaultPrevented && !result.dispatched)).toBe(true);
    await expect(heading).toHaveText(names[0], { timeout: 1000 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 1000 });
    await page.waitForTimeout(210);

    const belowThreshold = await dispatchWheelBurst(overlay, [
      { deltaX: 8 },
      { deltaX: 8 },
      { deltaX: 8 }
    ], 12);
    expect(belowThreshold.every(result => result.defaultPrevented && !result.dispatched)).toBe(true);
    await page.waitForTimeout(210);
    await expect(heading).toHaveText(names[0]);

    const vertical = await dispatchWheelBurst(overlay, [{ deltaY: 80 }]);
    expect(vertical).toEqual([{ defaultPrevented: false, dispatched: true }]);
    const verticalDiagonal = await dispatchWheelBurst(overlay, [{ deltaX: 20, deltaY: 60 }]);
    expect(verticalDiagonal).toEqual([{ defaultPrevented: false, dispatched: true }]);
    const pinch = await dispatchWheelBurst(overlay, [{ deltaX: 80, ctrlKey: true }]);
    expect(pinch).toEqual([{ defaultPrevented: false, dispatched: true }]);
    await page.waitForTimeout(210);
    await expect(heading).toHaveText(names[0]);

    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, 72);
    await page.keyboard.up("Shift");
    await expect(heading).toHaveText(names[1], { timeout: 1000 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 1000 });
    await page.waitForTimeout(210);

    const shiftedLineWheel = await dispatchWheelBurst(overlay, [{
      deltaY: -4,
      deltaMode: 1,
      shiftKey: true
    }]);
    expect(shiftedLineWheel).toEqual([{ defaultPrevented: true, dispatched: false }]);
    await expect(heading).toHaveText(names[0], { timeout: 1000 });
    await expect(overlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 1000 });
    await expect(overlay.locator(".builder-flavor-swipe-cue")).toHaveAttribute("aria-valuenow", "1");
    await expect(overlay).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0, { timeout: 1000 });
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const animatedSource = page.locator(".fonkie-gallery-card").first();
  await animatedSource.scrollIntoViewIfNeeded();
  const baselineY = await page.evaluate(() => scrollY);
  await animatedSource.click();
  const animatedOverlay = page.locator(".builder-flavor-flip-card");
  const animatedHeading = animatedOverlay.locator("h3");
  const animatedNames = await page.locator(".fonkie-gallery-card").evaluateAll(elements => elements.map(element => element.dataset.flavor
    || element.querySelector("span")?.textContent?.replace(/\s·\sPre-Order\s*$/i, "").trim()));
  await expect(animatedOverlay).toBeVisible();

  const openingWheel = await dispatchWheelBurst(animatedOverlay, [{ deltaX: 72 }]);
  expect(openingWheel).toEqual([{ defaultPrevented: true, dispatched: false }]);
  await expect(animatedOverlay.locator(".builder-flavor-swipe-cue")).toBeVisible({ timeout: 1200 });
  await expect(animatedHeading).toHaveText(animatedNames[0]);

  await dispatchWheelBurst(animatedOverlay, [{ deltaX: 72 }]);
  await page.waitForTimeout(210);
  await dispatchWheelBurst(animatedOverlay, [{ deltaX: 72 }]);
  await expect(animatedHeading).toHaveText(animatedNames[2], { timeout: 2000 });
  await expect(animatedOverlay).not.toHaveClass(/builder-flavor-switching/, { timeout: 2000 });
  await page.waitForTimeout(210);

  await animatedOverlay.evaluate(element => {
    element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: -72
    }));
    element.querySelector(".builder-flavor-expanded-media").click();
  });
  await expect(animatedOverlay).toHaveCount(0, { timeout: 2200 });
  await expect(animatedSource).toHaveAttribute("aria-expanded", "false");
  await expect(animatedSource).toBeFocused();
  await expectModalPageUnlocked(page);
  expect(Math.abs((await page.evaluate(() => scrollY)) - baselineY)).toBeLessThanOrEqual(1);
});

test("el cierre anticipado sigue el recorrido de la tarjeta sin dejar la página bloqueada", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);

  const product = page.locator('[data-product-id="pistacho-clasico"]');
  await expect(product).toHaveClass(/product-flip-ready/);
  await product.scrollIntoViewIfNeeded();
  const productBaseline = await page.evaluate(() => scrollY);
  await product.locator(".product-front .product-media").click();
  await expectModalPageLocked(page, productBaseline);
  await page.waitForTimeout(280);
  const productCloseStarted = Date.now();
  await page.keyboard.press("Escape");
  await expect(product).not.toHaveClass(/product-expanded/, { timeout: 700 });
  expect(Date.now() - productCloseStarted).toBeLessThan(700);
  await expectModalPageUnlocked(page);

  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const flavor = page.locator(".fonkie-gallery-card").first();
  await flavor.scrollIntoViewIfNeeded();
  const flavorBaseline = await page.evaluate(() => scrollY);
  await flavor.click();
  const overlay = page.locator(".builder-flavor-flip-card");
  await expect(overlay).toBeVisible();
  await expectModalPageLocked(page, flavorBaseline);
  await page.waitForTimeout(280);
  const flavorCloseStarted = Date.now();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0, { timeout: 700 });
  expect(Date.now() - flavorCloseStarted).toBeLessThan(700);
  await expectModalPageUnlocked(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await flavor.evaluate(element => {
    element.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator(".builder-flavor-flip-card")).toHaveCount(0);
  await expect(page.locator(".builder-flavor-flip-backdrop")).not.toHaveClass(/visible/);
  await expectModalPageUnlocked(page);
});

test("cerrar una tarjeta restaura el mismo punto exacto de la página", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    const card = page.locator('[data-product-id="pistacho-clasico"]');
    const media = card.locator(".product-front .product-media");
    await card.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const topBefore = await card.evaluate(element => element.getBoundingClientRect().top);
    await media.click();
    await expectModalPageLocked(page, before.y);
    await page.waitForTimeout(920);
    await card.locator(".product-back .product-expanded-media").click();
    await expect(card).not.toHaveClass(/product-expanded/, { timeout: 1300 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const topAfter = await card.evaluate(element => element.getBoundingClientRect().top);
    await page.waitForTimeout(360);
    const settledTop = await card.evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(2);
    expect(Math.abs(settledTop - topAfter)).toBeLessThanOrEqual(1);
    await expectModalPageUnlocked(page);
  }
});

test("cada producto móvil abre y cierra sin mover la página", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPreview(page);
  await expect(page.locator(".product.product-flip-ready").first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts?.ready);
  const ids = await page.locator(".product[data-product-id]").evaluateAll(cards => cards.map(card => card.dataset.productId));
  expect(ids.length).toBeGreaterThanOrEqual(17);

  for (const id of ids) {
    const card = page.locator(`.product[data-product-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.locator("img").first().evaluate(async image => {
      if (!image.complete) {
        await new Promise(resolve => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const topBefore = await card.evaluate(element => element.getBoundingClientRect().top);
    await card.locator(".product-front .product-media").evaluate(element => {
      element.focus({ preventScroll: true });
      element.click();
    });
    await expect(card).toHaveClass(/product-expanded/);
    await expectModalPageLocked(page, before.y);
    await card.locator(".product-back .product-expanded-media").evaluate(element => element.click());
    await expect(card).not.toHaveClass(/product-expanded/, { timeout: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    const topAfter = await card.evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(after.x - before.x), id).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y), id).toBeLessThanOrEqual(1);
    expect(Math.abs(topAfter - topBefore), id).toBeLessThanOrEqual(2);
    await expectModalPageUnlocked(page);
  }
});

test("el cierre conserva la proporción de la imagen hasta el último fotograma", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    const card = page.locator('[data-product-id="pistacho-clasico"]');
    const compactMedia = card.locator(".product-front .product-media");
    await expect(card).toHaveClass(/product-flip-ready/, { timeout: 10_000 });
    await card.scrollIntoViewIfNeeded();
    const compactBox = await compactMedia.boundingBox();

    await compactMedia.click();
    await expect(card).toHaveClass(/product-flipped/);
    await page.waitForTimeout(920);
    await card.locator(".product-back .product-expanded-media").click();
    await expect(card).toHaveClass(/product-expanded-closing/);
    await seekPhysicalCardTurn(card, 1);

    const snapshot = card.locator(".product-front-snapshot");
    await expect(snapshot).toHaveCSS("flex", "0 0 auto");
    const closingBox = await snapshot.locator(".product-media").boundingBox();
    const compactRatio = compactBox.width / compactBox.height;
    const closingRatio = closingBox.width / closingBox.height;
    expect(Math.abs(closingRatio - compactRatio)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(closingBox.width - compactBox.width)).toBeLessThanOrEqual(0.75);
    expect(Math.abs(closingBox.height - compactBox.height)).toBeLessThanOrEqual(0.75);

    await resumePhysicalCardTurn(card);
    await expect(card).not.toHaveClass(/product-expanded/, { timeout: 1200 });
    await expectModalPageUnlocked(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("los dos tipos de tarjeta ampliada no pueden anidarse", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const product = page.locator('[data-product-id="pistacho-clasico"]');
  const flavor = page.locator(".fonkie-gallery-card").first();

  await product.scrollIntoViewIfNeeded();
  await product.locator(".product-front .product-media").click();
  await expect(product).toHaveClass(/product-expanded/);
  await flavor.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true
  })));
  await expect(page.locator(".builder-flavor-flip-card")).toHaveCount(0);
  await page.waitForTimeout(900);
  await product.locator(".product-back .product-expanded-media").press("Enter");
  await expect(product).not.toHaveClass(/product-expanded/, { timeout: 1300 });

  await flavor.scrollIntoViewIfNeeded();
  await flavor.click();
  await expect(page.locator(".builder-flavor-flip-card")).toBeVisible();
  await product.locator(".product-front .product-media").evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true
  })));
  await expect(page.locator(".product-expanded")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".builder-flavor-flip-card")).toHaveCount(0, { timeout: 1300 });
  await expectModalPageUnlocked(page);
});

test("Fonkies y Fomb respetan movimiento reducido sin animaciones residuales", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPreview(page);

  for (const selector of [".fonkie-gallery-card", ".builder-gallery-card"]) {
    const cards = page.locator(selector);
    const names = await cards.evaluateAll(elements => elements.map(element => element.dataset.flavor
      || element.querySelector("span")?.textContent?.replace(/\s·\sPre-Order\s*$/i, "").trim()));
    const source = cards.first();
    await source.scrollIntoViewIfNeeded();
    await source.click();
    const overlay = page.locator(".builder-flavor-flip-card");
    await expect(overlay).toBeVisible();
    expect(await overlay.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(overlay.locator(".builder-flavor-flip-back")).toBeVisible();
    const swipeCue = overlay.locator(".builder-flavor-swipe-cue");
    await expect(swipeCue).toBeVisible();
    await swipeCue.focus();
    await swipeCue.press("ArrowRight");
    await expect(overlay.locator("h3")).toHaveText(names[1]);
    await expect(swipeCue).toBeFocused();
    await expect(swipeCue).toHaveClass(/builder-flavor-swipe-cue--used/);
    await expect(swipeCue.locator(".builder-flavor-swipe-counter")).toHaveText(`2 / ${names.length}`);
    expect(await overlay.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await swipeExpandedFlavor(page, "right");
    await expect(overlay.locator("h3")).toHaveText(names[0]);
    expect(await overlay.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(overlay).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
  }
});

test("las tarjetas conservan altura y pie simétricos dentro de cada fila visual", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    await expect(page.locator("#products")).toHaveClass(/catalog-organized/, { timeout: 15_000 });
    await expect(page.locator(".catalog-group-grid .product").first()).toHaveClass(/product-flip-ready/, { timeout: 15_000 });
    await expect.poll(() => page.locator(".catalog-group-grid").evaluateAll(grids => grids.filter(grid => (
      grid.querySelectorAll(".product:not(.hidden)").length > 1
    )).length), { timeout: 15_000 }).toBeGreaterThan(2);
    const geometries = await page.locator(".catalog-group-grid").evaluateAll(grids => grids.flatMap(grid => {
      const cards = [...grid.querySelectorAll(".product:not(.hidden)")];
      const rows = [];
      cards.forEach(card => {
        const top = Math.round(card.getBoundingClientRect().top);
        const row = rows.find(candidate => Math.abs(candidate.top - top) <= 2);
        if (row) row.cards.push(card);
        else rows.push({ top, cards: [card] });
      });
      return rows.filter(row => row.cards.length > 1).map(row => row.cards.map(card => {
        const box = card.getBoundingClientRect();
        const footer = card.querySelector(".product-front .product-footer")?.getBoundingClientRect();
        return {
          height: Math.round(box.height),
          footerBottom: footer ? Math.round(box.bottom - footer.bottom) : null
        };
      }));
    }));
    expect(geometries.length).toBeGreaterThan(2);
    for (const geometry of geometries) {
      expect(Math.max(...geometry.map(item => item.height)) - Math.min(...geometry.map(item => item.height))).toBeLessThanOrEqual(1);
      const footerOffsets = geometry.map(item => item.footerBottom).filter(value => value !== null);
      expect(Math.max(...footerOffsets) - Math.min(...footerOffsets)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("abrir varios ingredientes conserva la tarjeta tocada y no salta a Historia", async ({ page }) => {
  const settleCardHeights = () => page.evaluate(() => new Promise(resolve => {
    let frames = 5;
    const advance = () => {
      frames -= 1;
      if (frames <= 0) resolve();
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  }));

  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    await expect(page.locator(".product.product-flip-ready").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const summaries = [
      page.locator('[data-id="pistacho"] .product-front .product-safety summary'),
      page.locator('[data-id="naranja"] .product-front .product-safety summary'),
      page.locator('[data-id="zanahoria"] .product-front .product-safety summary'),
      page.locator('[data-product-id="raviolis"] .product-front .product-safety summary')
    ];

    for (const summary of summaries) {
      await summary.evaluate(element => {
        const rect = element.getBoundingClientRect();
        window.scrollTo({
          left: 0,
          top: window.scrollY + rect.top - 360,
          behavior: "instant"
        });
      });
      await expect.poll(() => summary.evaluate(element => (
        Math.round(element.getBoundingClientRect().top)
      ))).toBe(360);
      const before = await summary.evaluate(element => ({
        id: element.closest(".product").dataset.productId || element.closest(".product").dataset.id,
        scrollY: window.scrollY,
        cardTop: element.closest(".product").getBoundingClientRect().top
      }));

      await summary.click();
      await expect(summary.locator("..")).toHaveAttribute("open", "");
      await settleCardHeights();

      const after = await summary.evaluate(element => ({
        scrollY: window.scrollY,
        cardTop: element.closest(".product").getBoundingClientRect().top,
        storyTop: document.querySelector("#historia").getBoundingClientRect().top,
        hash: location.hash,
        modalOpen: document.body.classList.contains("product-modal-open")
      }));
      expect(Math.abs(after.scrollY - before.scrollY), `${before.id} cambió scrollY`).toBeLessThanOrEqual(2);
      expect(Math.abs(after.cardTop - before.cardTop), `${before.id} movió su fila`).toBeLessThanOrEqual(2);
      expect(after.storyTop).toBeGreaterThan(viewport.height);
      expect(after.hash).toBe("");
      expect(after.modalOpen).toBe(false);
    }

    const ravioliSummary = summaries.at(-1);
    const beforeClose = await ravioliSummary.evaluate(element => ({
      scrollY: window.scrollY,
      cardTop: element.closest(".product").getBoundingClientRect().top
    }));
    await ravioliSummary.click();
    await expect(ravioliSummary.locator("..")).not.toHaveAttribute("open", "");
    await settleCardHeights();
    const afterClose = await ravioliSummary.evaluate(element => ({
      scrollY: window.scrollY,
      cardTop: element.closest(".product").getBoundingClientRect().top,
      htmlOverflowAnchor: document.documentElement.style.overflowAnchor,
      bodyOverflowAnchor: document.body.style.overflowAnchor
    }));
    expect(Math.abs(afterClose.scrollY - beforeClose.scrollY)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterClose.cardTop - beforeClose.cardTop)).toBeLessThanOrEqual(2);
    expect(afterClose.htmlOverflowAnchor).toBe("");
    expect(afterClose.bodyOverflowAnchor).toBe("");
  }
});

test("Salados compacta el frente y conserva todas las opciones al ampliar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.getByRole("button", { name: "Salado" }).click();
  const raviolis = page.locator('[data-product-id="raviolis"]');
  const tequenos = page.locator('[data-product-id="tequenos-fit"]');
  const nuggets = page.locator('[data-product-id="nuggets-rora"]');
  await expect(raviolis.locator(".product-front .product-variants")).toHaveCount(2);
  await expect(raviolis.locator(".product-front .product-variants").first()).toBeHidden();
  await expect(raviolis.locator(".product-selection-summary")).toBeVisible();
  await expect(raviolis.locator(".product-selection-summary strong")).toHaveText("180 g · Carne");

  const tequenosBox = await tequenos.boundingBox();
  const raviolisBox = await raviolis.boundingBox();
  expect(tequenosBox.height).toBeGreaterThan(100);
  expect(raviolisBox.height).toBeGreaterThan(100);
  expect(Math.abs(tequenosBox.height - raviolisBox.height)).toBeLessThanOrEqual(1);
  await expect(tequenos).toHaveClass(/product-row-matched/);
  await expect(raviolis).toHaveClass(/product-row-matched/);

  await raviolis.locator(".product-selection-summary").click();
  await expect(raviolis).toHaveClass(/product-expanded/);
  await expect(raviolis.locator(".product-back .product-variants")).toHaveCount(2);
  await expect(raviolis.locator(".product-back .product-variants").first()).toBeVisible();
  await raviolis.locator(".product-back .product-size").selectOption("300 g");
  await raviolis.locator(".product-back .product-variant").selectOption("Carne");
  await raviolis.locator(".product-expanded-media").click();
  await expect(raviolis).not.toHaveClass(/product-expanded/, { timeout: 1500 });
  await expect(raviolis.locator(".product-selection-summary strong")).toHaveText("300 g · Carne");

  const nuggetsBox = await nuggets.boundingBox();
  expect(nuggetsBox.height).toBeLessThan(raviolisBox.height);
  await expect(nuggets).toHaveClass(/product-row-solo/);
  const nuggetsSpacing = await nuggets.evaluate(card => {
    const safety = card.querySelector(".product-front .product-safety")?.getBoundingClientRect();
    const footer = card.querySelector(".product-front .product-footer")?.getBoundingClientRect();
    return safety && footer ? Math.round(footer.top - safety.bottom) : null;
  });
  expect(nuggetsSpacing).not.toBeNull();
  expect(nuggetsSpacing).toBeLessThanOrEqual(16);
  expect(nuggetsBox.height).toBeLessThan(440);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
  for (let index = 0; index < 8; index += 1) await firstPlus.click();
  await expect(page.locator("#fonkieCount")).toContainText("12 Fonkies");
  await expect(page.locator("#fonkieTotal")).toContainText("45,00");
  await expect(page.locator("#fonkiePriceRule")).toContainText("8 extras");
});

test("Fonkies bloquea cajas de menos de cuatro unidades", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator("#addFonkieBox")).toBeDisabled();
  await expect(page.locator("#fonkieValidation")).toHaveText("Mínimo 4 galletas para armar tu caja.");
  await expect(page.locator('.fonkie-flavor[data-flavor="Chispa de Chocolate Blanco"]')).toHaveCount(1);
  await expect(page.locator('.fonkie-gallery-card img[src="assets/fonkie-white-chocolate-chips-fontana-pro.jpg"]')).toHaveCount(1);
  await expect(page.locator('.fonkie-flavor[data-flavor="Chips Ahoy Fit"]')).toHaveCount(1);
  await expect(page.locator('.fonkie-gallery-card img[src="assets/fonkie-chips-ahoy-fit-fontana-pro.jpg"]')).toHaveCount(1);
  const fonkieGalleryCard = page.locator(".fonkie-gallery-card").first();
  const fonkieGalleryImage = fonkieGalleryCard.locator("img");
  await expect(fonkieGalleryImage).toHaveCSS("object-position", "50% 50%");
  await expect(fonkieGalleryImage).toHaveCSS("object-fit", "contain");
  await expect(fonkieGalleryImage).toHaveCSS("position", "absolute");
  const [fonkieCardBox, fonkieImageBox] = await Promise.all([
    fonkieGalleryCard.boundingBox(),
    fonkieGalleryImage.boundingBox()
  ]);
  expect(fonkieCardBox).not.toBeNull();
  expect(fonkieImageBox).not.toBeNull();
  expect(Math.abs(fonkieImageBox.x - fonkieCardBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(fonkieImageBox.y - fonkieCardBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(fonkieImageBox.width - fonkieCardBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(fonkieImageBox.height - fonkieCardBox.height)).toBeLessThanOrEqual(1);

  const fombGalleryCard = page.locator(".builder-gallery-card").first();
  const fombGalleryImage = fombGalleryCard.locator("img");
  await expect(fombGalleryImage).toHaveCSS("object-position", "50% 50%");
  await expect(fombGalleryImage).toHaveCSS("object-fit", "contain");
  const [fombCardBox, fombImageBox] = await Promise.all([
    fombGalleryCard.boundingBox(),
    fombGalleryImage.boundingBox()
  ]);
  expect(fombCardBox).not.toBeNull();
  expect(fombImageBox).not.toBeNull();
  expect(Math.abs(fombImageBox.x - fombCardBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(fombImageBox.y - fombCardBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(fombImageBox.width - fombCardBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(fombImageBox.height - fombCardBox.height)).toBeLessThanOrEqual(1);
});

test("Fonkies nunca permite seleccionar ni pedir más unidades que el inventario", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify({
      version: 2,
      settings: { productionWithElectricity: true, stockTodayOpen: true },
      products: [],
      builders: {
        fonkies: {
          visible: true,
          status: "available",
          requiresElectricity: false,
          minimum: 4,
          singlePrice: 15,
          mixedPrice: 17,
          extraPrice: 3.5,
          flavors: [{
            name: "Chips de Chocolate Oscuro",
            ingredients: "Harina de almendra, chocolate vegano oscuro y monkfruit",
            image: "assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",
            status: "available",
            stockQuantity: 6
          }]
        }
      }
    }));
  });
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  const singleFlavorTrack = page.locator(".fonkie-gallery-track");
  const singleFlavorCard = singleFlavorTrack.locator(":scope > .fonkie-gallery-card");
  await expect(singleFlavorTrack).not.toHaveAttribute("data-gallery-loop", "true");
  await expect(singleFlavorCard).toHaveCount(1);
  await expect(singleFlavorCard).toHaveAttribute("tabindex", "0");
  await singleFlavorCard.focus();
  await expect(singleFlavorCard).toBeFocused();
  await openFlavorChoice(page, ".fonkie-builder");

  const flavor = page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"]');
  const plus = flavor.locator('[data-delta="1"]');
  for (let index = 0; index < 8; index += 1) await plus.click();
  await expect(flavor.locator("output")).toHaveText("6");
  await expect(page.locator("#toast")).toContainText("Llegaste al máximo disponible de Chips de Chocolate Oscuro");
  await page.screenshot({ path: testInfo.outputPath("fonkies-stock-6-bloquea-8-movil.png"), fullPage: false });

  await page.locator("#addFonkieBox").click();
  await expect(page.locator("#cartCount")).toHaveText("1");
  await page.locator("#cartButton").click();
  await page.locator('.cart-item .qty button[aria-label="Sumar"]').click();
  await expect(page.locator(".cart-item .qty b")).toHaveText("1");
  await expect(page.locator("#toast")).toContainText("Llegaste al máximo disponible de Caja de 6 Fonkies");
});

test("Fomb avisa al alcanzar el máximo disponible de un sabor", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify({
      version: 2,
      settings: { productionWithElectricity: true, stockTodayOpen: true },
      products: [],
      builders: {
        fomb: {
          visible: true,
          status: "available",
          minimumQuantity: 4,
          sizes: [{ quantity: 4, price: 15 }],
          flavors: [{
            name: "Pistacho",
            ingredients: "Pistacho y chocolate blanco vegano",
            image: "assets/fomb-pistachio-fontana-pro.jpg",
            status: "available",
            stockQuantity: 2
          }]
        }
      }
    }));
  });
  await openPreview(page);
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await openFlavorChoice(page, ".fomb-builder");
  const flavor = page.locator('.fomb-flavor[data-flavor="Pistacho"]');
  const plus = flavor.locator('[data-delta="1"]');
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(flavor.locator("output")).toHaveText("2");
  await expect(page.locator("#toast")).toContainText("Llegaste al máximo disponible de Pistacho");
});

test("Fonkies agotados pasan automáticamente a Pre-Order de dos días", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify({
      version: 2,
      settings: { productionWithElectricity: true, stockTodayOpen: true },
      products: [],
      builders: {
        fonkies: {
          visible: true,
          status: "sold-out",
          allowPreorder: false,
          requiresElectricity: false,
          minimumQuantity: 4,
          singlePrice: 15,
          mixedPrice: 17,
          extraPrice: 3.5,
          flavors: [{
            name: "Chips de Chocolate Oscuro",
            ingredients: "Harina de almendra y chocolate vegano oscuro",
            image: "assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",
            status: "available",
            stockTracked: true
          }]
        }
      }
    }));
  });
  await openPreview(page);
  await page.getByRole("button", { name: "Fonkies · Galletas" }).click();
  await openFlavorChoice(page, ".fonkie-builder");
  const flavor = page.locator('.fonkie-flavor[data-flavor="Chips de Chocolate Oscuro"]');
  await expect(flavor).toContainText("Pre-Order");
  for (let index = 0; index < 4; index += 1) await flavor.locator('[data-delta="1"]').click();
  await expect(page.locator("#fonkieValidation")).toContainText(/pre-order/i);
  await page.locator("#addFonkieBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-choices")).toContainText("PRE-ORDER · 2 días hábiles");
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#checkoutPreparationGuide")).toContainText("Mínimo 2 días de preparación");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Fonkies y Fomb anuncian el inventario real en galería, selector y vista ampliada", async ({ page }) => {
  test.setTimeout(60_000);
  await installBuilderAvailabilityCatalog(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const availabilityCases = [
    { state: "immediate", copy: "Entrega inmediata" },
    { state: "preorder", copy: "Pre-Order · 2 días hábiles" },
    { state: "pending", copy: "Disponibilidad por confirmar" }
  ];
  const builders = [
    {
      filter: "Fonkies · Galletas",
      builder: ".fonkie-builder",
      card: ".fonkie-gallery-card",
      row: ".fonkie-flavor",
      names: [
        "Fonkie con stock real",
        "Fonkie para encargo",
        "Fonkie sin inventario cargado"
      ]
    },
    {
      filter: "Fomb · Bombones",
      builder: ".fomb-builder",
      card: ".builder-gallery-card",
      row: ".fomb-flavor",
      names: [
        "Fomb con cantidad cargada",
        "Fomb para encargo",
        "Fomb sin inventario cargado"
      ]
    }
  ];

  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    for (const builderCase of builders) {
      await page.getByRole("button", { name: builderCase.filter }).click();
      const builder = page.locator(builderCase.builder);
      await expect(builder).toBeVisible();

      for (let index = 0; index < availabilityCases.length; index += 1) {
        const expected = availabilityCases[index];
        const flavorName = builderCase.names[index];
        const compactCard = builder.locator(`${builderCase.card}[data-flavor="${flavorName}"]`);
        await expect(compactCard).toHaveAttribute("data-stock-state", expected.state);
        await expect(compactCard.locator(".builder-flavor-availability")).toHaveText(expected.copy);
        if (expected.state === "pending") await expect(compactCard).not.toContainText("Entrega inmediata");
      }

      await openFlavorChoice(page, builderCase.builder);
      for (let index = 0; index < availabilityCases.length; index += 1) {
        const expected = availabilityCases[index];
        const flavorName = builderCase.names[index];
        const selectorRow = builder.locator(`${builderCase.row}[data-flavor="${flavorName}"]`);
        await expect(selectorRow).toHaveAttribute("data-stock-state", expected.state);
        await expect(selectorRow.locator(".builder-flavor-availability")).toHaveText(expected.copy);
        if (expected.state === "pending") await expect(selectorRow).not.toContainText("Entrega inmediata");
      }

      const firstCard = builder.locator(`${builderCase.card}[data-flavor="${builderCase.names[0]}"]`);
      const firstRow = builder.locator(`${builderCase.row}[data-flavor="${builderCase.names[0]}"]`);
      const visibleLabelsFit = await firstCard.evaluate((card, rowSelector) => {
        const cardLabel = card.querySelector(":scope > span");
        const cardAvailability = card.querySelector(".builder-flavor-availability");
        const row = card.closest("article").querySelector(rowSelector);
        const rowName = row?.querySelector(".fonkie-flavor-name");
        const rowAvailability = row?.querySelector(".builder-flavor-availability");
        const stepper = row?.querySelector(".fonkie-stepper");
        const cardBox = card.getBoundingClientRect();
        const cardLabelBox = cardLabel?.getBoundingClientRect();
        const cardAvailabilityBox = cardAvailability?.getBoundingClientRect();
        const rowBox = row?.getBoundingClientRect();
        const rowNameBox = rowName?.getBoundingClientRect();
        const rowAvailabilityBox = rowAvailability?.getBoundingClientRect();
        const stepperBox = stepper?.getBoundingClientRect();
        return {
          cardDisplay: cardAvailability ? getComputedStyle(cardAvailability).display : "",
          cardContained: Boolean(cardLabelBox && cardAvailabilityBox
            && cardAvailabilityBox.left >= cardLabelBox.left - 1
            && cardAvailabilityBox.right <= cardLabelBox.right + 1
            && cardAvailabilityBox.bottom <= cardBox.bottom + 1),
          rowDisplay: rowAvailability ? getComputedStyle(rowAvailability).display : "",
          rowContained: Boolean(rowBox && rowNameBox && rowAvailabilityBox && stepperBox
            && rowAvailabilityBox.left >= rowNameBox.left - 1
            && rowAvailabilityBox.right <= rowNameBox.right + 1
            && rowNameBox.right <= stepperBox.left + 1
            && rowAvailabilityBox.bottom <= rowBox.bottom + 1),
          rowFits: Boolean(row && row.scrollWidth <= row.clientWidth + 1)
        };
      }, `${builderCase.row}[data-flavor="${builderCase.names[0]}"]`);
      expect(visibleLabelsFit.cardDisplay).toBe("block");
      expect(visibleLabelsFit.cardContained).toBe(true);
      expect(visibleLabelsFit.rowDisplay).toBe("block");
      expect(visibleLabelsFit.rowContained).toBe(true);
      expect(visibleLabelsFit.rowFits).toBe(true);
      await firstCard.click();
      const overlay = page.locator(".builder-flavor-flip-card");
      await expect(overlay).toBeVisible();
      for (let index = 0; index < availabilityCases.length; index += 1) {
        const expected = availabilityCases[index];
        await expect(overlay.locator(".builder-flavor-expanded-details h3")).toHaveText(builderCase.names[index]);
        const expandedAvailability = overlay.locator(".builder-flavor-expanded-availability");
        await expect(expandedAvailability).toHaveAttribute("data-stock-state", expected.state);
        await expect(expandedAvailability).toHaveText(expected.copy);
        if (expected.state === "pending") await expect(overlay.locator(".builder-flavor-expanded-details")).not.toContainText("Entrega inmediata");
        if (index < availabilityCases.length - 1) await page.keyboard.press("ArrowRight");
      }

      const overlayFit = await overlay.evaluate(element => {
        const box = element.getBoundingClientRect();
        const availability = element.querySelector(".builder-flavor-expanded-availability");
        return {
          left: box.left,
          right: box.right,
          viewport: window.innerWidth,
          availabilityFits: !availability || availability.scrollWidth <= availability.clientWidth + 1,
          pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
        };
      });
      expect(overlayFit.left).toBeGreaterThanOrEqual(-1);
      expect(overlayFit.right).toBeLessThanOrEqual(overlayFit.viewport + 1);
      expect(overlayFit.availabilityFits).toBe(true);
      expect(overlayFit.pageFits).toBe(true);
      await overlay.locator(".builder-flavor-expanded-media").click();
      await expect(overlay).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
});

test("la disponibilidad seleccionada llega al resumen, carrito y tiempos del checkout", async ({ page }) => {
  test.setTimeout(60_000);
  await installBuilderAvailabilityCatalog(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const states = [
    {
      fonkiesName: "Fonkie con stock real",
      fombName: "Fomb con cantidad cargada",
      availability: "immediate",
      summary: "Hay stock real: entrega inmediata.",
      cart: /Entrega inmediata/i
    },
    {
      fonkiesName: "Fonkie para encargo",
      fombName: "Fomb para encargo",
      availability: "preorder",
      summary: "Pre-Order: tu caja estará lista en 2 días hábiles.",
      cart: /Pre-Order · 2 días hábiles/i
    },
    {
      fonkiesName: "Fonkie sin inventario cargado",
      fombName: "Fomb sin inventario cargado",
      availability: "pending",
      summary: "Disponibilidad por confirmar con Fontana.",
      cart: /Disponibilidad por confirmar/i
    }
  ];
  const builders = [
    {
      filter: "Fonkies · Galletas",
      builder: ".fonkie-builder",
      row: ".fonkie-flavor",
      nameKey: "fonkiesName",
      validation: "#fonkieValidation",
      add: "#addFonkieBox"
    },
    {
      filter: "Fomb · Bombones",
      builder: ".fomb-builder",
      row: ".fomb-flavor",
      nameKey: "fombName",
      validation: "#fombValidation",
      add: "#addFombBox"
    }
  ];

  for (const builderCase of builders) {
    await page.getByRole("button", { name: builderCase.filter }).click();
    await openFlavorChoice(page, builderCase.builder);
    for (const expected of states) {
      const flavorName = expected[builderCase.nameKey];
      const row = page.locator(`${builderCase.builder} ${builderCase.row}[data-flavor="${flavorName}"]`);
      const plus = row.locator('[data-delta="1"]');
      const minus = row.locator('[data-delta="-1"]');
      for (let quantity = 0; quantity < 4; quantity += 1) await plus.click();
      await expect(page.locator(`${builderCase.builder} ${builderCase.validation}`)).toHaveText(expected.summary);
      await expect(page.locator(`${builderCase.builder} ${builderCase.add}`)).toBeEnabled();
      await page.locator(`${builderCase.builder} ${builderCase.add}`).click();
      for (let quantity = 0; quantity < 4; quantity += 1) await minus.click();
    }
  }

  await expect(page.locator("#cartCount")).toHaveText("6");
  const storedAvailability = await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-cart-v1") || "[]")
    .map(item => item.inventory?.availability)
    .sort());
  expect(storedAvailability).toEqual([
    "immediate", "immediate", "pending", "pending", "preorder", "preorder"
  ]);

  await page.locator("#cartButton").click();
  for (const builderCase of builders) {
    for (const expected of states) {
      const flavorName = expected[builderCase.nameKey];
      const item = page.locator(".cart-item").filter({ hasText: flavorName });
      await expect(item).toHaveCount(1);
      await expect(item.locator(".cart-choices")).toContainText(expected.cart);
      if (expected.availability === "pending") await expect(item).not.toContainText("Entrega inmediata");
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.locator("#continueCheckout").click();
  const preparationGuide = page.locator("#checkoutPreparationGuide");
  await expect(preparationGuide.locator(".checkout-preparation-row.same-day strong")).toHaveText("Puede pedirse para el mismo día");
  await expect(preparationGuide.locator(".checkout-preparation-row.prepared strong")).toHaveText("Mínimo 2 días de preparación");
  await expect(preparationGuide.locator(".checkout-preparation-row.pending strong")).toHaveText("Tiempo por confirmar");
  for (const selector of [".same-day", ".prepared", ".pending"]) {
    const row = preparationGuide.locator(`.checkout-preparation-row${selector}`);
    await expect(row).toContainText("Caja de 4 Fonkies · Un sabor");
    await expect(row).toContainText("Caja de 4 Fomb · Un sabor");
  }
  await expect(page.locator("#deliveryPlanPanel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1366, height: 900 });
  const checkoutFit = await page.locator("#drawer").evaluate(drawer => ({
    viewport: window.innerWidth,
    width: drawer.getBoundingClientRect().width,
    scrollWidth: drawer.scrollWidth,
    pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
  }));
  expect(checkoutFit.width).toBeLessThanOrEqual(checkoutFit.viewport);
  expect(checkoutFit.scrollWidth).toBeLessThanOrEqual(checkoutFit.width + 1);
  expect(checkoutFit.pageFits).toBe(true);
  await expect(preparationGuide.locator(".checkout-preparation-row")).toHaveCount(3);
});

test("la tienda hidrata el control de stock desde el catálogo público real", async ({ page }) => {
  const state = {
    ...createBuilderAvailabilityState(),
    operations: { verified: true, electricityEnabled: true }
  };
  expect(JSON.stringify(state)).not.toContain("stockQuantity");
  await page.route("https://api.fontanasingluten.com/v1/catalog", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ state })
  }));

  await page.goto("http://fontana.localhost:8767/");
  await expect(page.locator('.fonkie-gallery-card[data-flavor="Fonkie con stock real"]')).toHaveAttribute("data-stock-state", "immediate");
  await expect(page.locator('.fonkie-gallery-card[data-flavor="Fonkie para encargo"]')).toHaveAttribute("data-stock-state", "preorder");
  await expect(page.locator('.fonkie-gallery-card[data-flavor="Fonkie sin inventario cargado"]')).toHaveAttribute("data-stock-state", "pending");
  await expect(page.locator('.builder-gallery-card[data-flavor="Fomb con cantidad cargada"]')).toContainText("Entrega inmediata");
  await expect(page.locator('.builder-gallery-card[data-flavor="Fomb sin inventario cargado"]')).not.toContainText("Entrega inmediata");
});

test("las cajas mixtas heredan el tiempo más conservador", async ({ page }) => {
  await installBuilderAvailabilityCatalog(page);
  await openPreview(page);
  const builders = [
    {
      filter: "Fonkies · Galletas",
      builder: ".fonkie-builder",
      row: ".fonkie-flavor",
      immediate: "Fonkie con stock real",
      preorder: "Fonkie para encargo",
      pending: "Fonkie sin inventario cargado",
      validation: "#fonkieValidation"
    },
    {
      filter: "Fomb · Bombones",
      builder: ".fomb-builder",
      row: ".fomb-flavor",
      immediate: "Fomb con cantidad cargada",
      preorder: "Fomb para encargo",
      pending: "Fomb sin inventario cargado",
      validation: "#fombValidation"
    }
  ];

  for (const entry of builders) {
    await page.getByRole("button", { name: entry.filter }).click();
    await openFlavorChoice(page, entry.builder);
    const change = async (name, delta, count) => {
      const button = page.locator(`${entry.builder} ${entry.row}[data-flavor="${name}"] [data-delta="${delta}"]`);
      for (let index = 0; index < count; index += 1) await button.click();
    };
    await change(entry.immediate, 1, 2);
    await change(entry.pending, 1, 2);
    await expect(page.locator(`${entry.builder} ${entry.validation}`)).toHaveText("Disponibilidad por confirmar con Fontana.");
    await change(entry.immediate, -1, 2);
    await change(entry.pending, -1, 2);
    await change(entry.immediate, 1, 2);
    await change(entry.preorder, 1, 2);
    await expect(page.locator(`${entry.builder} ${entry.validation}`)).toHaveText("Pre-Order: tu caja estará lista en 2 días hábiles.");
    await change(entry.immediate, -1, 2);
    await change(entry.preorder, -1, 2);
  }
});

test("un carrito guardado se reconcilia con el inventario vigente", async ({ page }) => {
  await installBuilderAvailabilityCatalog(page);
  await page.addInitScript(cart => {
    localStorage.setItem("fontana-cart-v1", JSON.stringify(cart));
  }, [
    {
      id: "fonkie-box-old-preorder",
      productId: "fonkie-box",
      name: "Caja vieja de Fonkies",
      price: 15,
      choices: "4 Fonkie para encargo · ENTREGA INMEDIATA",
      inventory: { kind: "fonkies", flavors: [{ name: "Fonkie para encargo", qty: 4, preorder: false, stockState: "immediate" }], preorder: false, availability: "immediate" },
      qty: 1
    },
    {
      id: "fomb-box-4-0-4-0-0",
      productId: "fomb-box",
      name: "Caja vieja de Fomb",
      price: 15,
      choices: "4 Fomb con cantidad cargada · DISPONIBILIDAD POR CONFIRMAR",
      inventory: { kind: "fomb", flavors: [{ name: "Fomb con cantidad cargada", qty: 4, preorder: false, stockState: "pending" }], boxSize: 4, extraCount: 0, preorder: false, availability: "pending" },
      qty: 1
    },
    {
      id: "fonkie-box-old-removed",
      productId: "fonkie-box",
      name: "Caja con sabor retirado",
      price: 15,
      choices: "4 Sabor retirado · ENTREGA INMEDIATA",
      inventory: { kind: "fonkies", flavors: [{ name: "Sabor retirado", qty: 4, preorder: false, stockState: "immediate" }], preorder: false, availability: "immediate" },
      qty: 1
    }
  ]);

  await openPreview(page);
  const reconciled = await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-cart-v1") || "[]")
    .map(item => ({ name: item.name, choices: item.choices, availability: item.inventory?.availability })));
  expect(reconciled).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Pre-order · Caja vieja de Fonkies", availability: "preorder" }),
    expect.objectContaining({ name: "Caja vieja de Fomb", availability: "immediate" }),
    expect.objectContaining({ name: "Caja con sabor retirado", availability: "pending" })
  ]));

  await page.locator("#cartButton").click();
  const removedFlavor = page.locator(".cart-item").filter({ hasText: "Sabor retirado" });
  await expect(removedFlavor.locator(".cart-choices")).toContainText("DISPONIBILIDAD POR CONFIRMAR");
  await removedFlavor.locator(".remove").click();
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#checkoutPreparationGuide .same-day")).toContainText("Caja vieja de Fomb");
  await expect(page.locator("#checkoutPreparationGuide .prepared")).toContainText("Caja vieja de Fonkies");
});

test("salados con stock cero pasan a Pre-Order y las tortas no cambian", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify({
      version: 2,
      settings: { productionWithElectricity: true, stockTodayOpen: true },
      products: [
        {id:"salado-cero",category:"salado",name:"Salado de prueba",price:12,image:"assets/tequenos-fit-fontana-pro.jpg",description:"Listo para preparar.",ingredients:"Harina y queso.",weight:"1 PAQUETE",status:"sold-out",stockQuantity:0,visible:true,allowPreorder:false,minimumBusinessDays:0},
        {id:"torta-cero",category:"cakes",name:"Torta de prueba",price:40,image:"assets/chocolate-fontana-v2.jpg",description:"Torta completa.",ingredients:"Harina de almendra.",weight:"1 KG",status:"sold-out",stockQuantity:0,visible:true,allowPreorder:false,minimumBusinessDays:2}
      ],
      builders: {}
    }));
  });
  await openPreview(page);
  const salado = page.locator('[data-product-id="salado-cero"]');
  await expect(salado.locator(".product-tags")).toContainText("PRE-ORDER");
  await expect(salado.locator(".product-front .add")).toHaveText("PRE-ORDER");
  await salado.locator(".product-media").first().click();
  await expect(salado).toHaveClass(/product-flipped/);
  await salado.locator(".product-back .add").click();
  await expect(page.locator("#cartCount")).toHaveText("1");
  await expect(page.locator('[data-product-id="torta-cero"] .add')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
  expect(fonkieBox.height).toBeLessThanOrEqual(205);
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
  await expect(image).toHaveAttribute("src", "assets/pistacho-fontana-v4.webp");
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

test("las pestañas superiores conservan contraste al seleccionarlas en móvil", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const menuLink = page.locator('.nav-links a[href="#menu"]');
  await menuLink.hover();
  await expect(menuLink).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(menuLink).toHaveCSS("background-color", "rgba(110, 35, 111, 0.09)");
  await page.screenshot({ path: testInfo.outputPath("navegacion-activa-contraste-movil.png"), fullPage: false });
});

test("el nombre entra en ola y las hojas aparecen detrás de la F sin fuente", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  const logo = page.locator(".hero-logo");
  const wordSlices = page.locator(".hero-logo-word-slice");
  const leafStage = page.locator(".hero-logo-leaves-stage");
  const leaves = page.locator(".hero-logo-leaf");
  await expect(wordSlices).toHaveCount(7);
  await expect(wordSlices.first()).toHaveCSS("animation-name", "wordmark-wave-in");
  await expect(wordSlices.first()).toHaveCSS("animation-duration", "1.15s");
  await expect(wordSlices.first()).toHaveCSS("animation-delay", "0.16s");
  await expect(wordSlices.last()).toHaveCSS("animation-delay", "0.67s");
  await expect(leafStage).toHaveCSS("animation-name", "leaf-sprout-in");
  await expect(leafStage).toHaveCSS("animation-delay", "0.58s");
  await expect(leafStage).toHaveCSS("animation-duration", "0.9s");
  await expect(leaves).toHaveCount(2);
  await expect(leaves.first()).toBeVisible();
  await expect(leaves.last()).toBeVisible();
  await expect(leaves.first()).toHaveCSS("animation-name", "leaf-upper-breeze");
  await expect(leaves.last()).toHaveCSS("animation-name", "leaf-lower-breeze");
  await expect(leaves.first()).toHaveCSS("animation-duration", "7.4s");
  await expect(leaves.last()).toHaveCSS("animation-duration", "8.2s");
  await expect(page.locator(".hero-logo-water, .hero-water-stage, .hero-water-stream")).toHaveCount(0);
  await expect(page.locator(".hero-logo-mark")).not.toHaveClass(/hero-water-trial/);
  const logoSize = await logo.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight }));
  const leafCanvasSize = await page.locator(".hero-logo-leaves").evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  expect(leafCanvasSize).toEqual(logoSize);
  await expect(page.locator("path.hero-logo-leaf-art")).toHaveCount(2);
  await expect(page.locator("image.hero-logo-leaf-art")).toHaveCount(0);
  await expect(page.locator("feDisplacementMap")).toHaveCount(0);
  await expect(page.locator('animate[attributeName="d"]')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("hojas-ocultas-al-cargar.png"), fullPage: false });
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
  await page.screenshot({ path: testInfo.outputPath("hojas-asomandose-detras-de-la-f.png"), fullPage: false });
  expect(secondTransform).not.toEqual(firstTransform);
  expect(secondTransform[0]).not.toBe(secondTransform[1]);
  expect(secondShapes).not.toEqual(firstShapes);
  await page.waitForTimeout(800);
  await expect(page.locator(".hero-logo-wordmark")).toHaveCSS("visibility", "hidden");
  await expect(logo).toHaveCSS("clip-path", /^inset\(0px(?: 0px 0%)?\)$/);
  await expect(leafStage).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("hojas-asomandose-movil.png"), fullPage: false });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("hojas-asomandose-escritorio.png"), fullPage: false });

  await page.evaluate(() => window.scrollTo(0, document.querySelector(".hero").offsetHeight + 120));
  await expect(leaves.first()).toHaveCSS("animation-play-state", "paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(leaves.first()).toHaveCSS("animation-play-state", "running");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(wordSlices.first()).toHaveCSS("animation-name", "none");
  await expect(wordSlices.first()).toHaveCSS("opacity", "0");
  await expect(wordSlices.first()).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".hero-logo-wordmark")).toHaveCSS("visibility", "hidden");
  await expect(logo).toHaveCSS("clip-path", "none");
  await expect(leafStage).toHaveCSS("animation-name", "none");
  await expect(leafStage).toHaveCSS("opacity", "1");
  await expect(leaves.first()).toHaveCSS("animation-name", "none");
  await expect(leaves.last()).toHaveCSS("animation-name", "none");
  await expect(leaves.first()).toHaveCSS("transform", "none");
  await expect(leaves.last()).toHaveCSS("transform", "none");
  const reducedShape = await page.locator("path.hero-logo-leaf-art").first().evaluate(element => {
    const box = element.getBBox();
    return { x:box.x, y:box.y, width:box.width, height:box.height };
  });
  await page.waitForTimeout(500);
  const reducedShapeAfterWait = await page.locator("path.hero-logo-leaf-art").first().evaluate(element => {
    const box = element.getBBox();
    return { x:box.x, y:box.y, width:box.width, height:box.height };
  });
  Object.keys(reducedShape).forEach(key => {
    expect(Math.abs(reducedShapeAfterWait[key] - reducedShape[key])).toBeLessThan(0.5);
  });
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

test("Fomb calcula automáticamente los bombones extra desde la selección", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator(".fomb-builder")).toHaveCount(1);
  await expect(page.locator('.builder-gallery-card img[src="assets/fomb-raffaello-fontana-pro.jpg"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await openFlavorChoice(page, ".fomb-builder");
  await expect(page.locator(".fomb-flavors")).toBeVisible();
  await expect(page.locator(".fomb-builder .builder-head p")).toContainText("se suma automáticamente como extra");
  await expect(page.getByRole("button", { name: "Sumar extra" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restar extra" })).toHaveCount(0);
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

  await pistachoPlus.click();
  await expect(page.locator("#fombCount")).toContainText("5 Fomb");
  await expect(page.locator("#fombRule")).toContainText("4 + 1 bombón extra");
  await expect(page.locator("#fombTotal")).toContainText("18,50");
  await expect(page.locator("#addFombBox")).toBeEnabled();
  await page.locator("#addFombBox").click();
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item h4")).toContainText(["Caja de 4 Fomb · Mixta", "Caja de 5 Fomb · Mixta"]);
  await expect(page.locator(".cart-item").last()).toContainText("USD 18,50");
  await page.locator("#closeCart").click();

  let selectedTotal = 5;
  const advanceTo = async target => {
    while (selectedTotal < target) {
      await pistachoPlus.click();
      selectedTotal += 1;
      await expect(pistachoCount).toHaveText(String(selectedTotal - 1));
    }
  };
  for (const tier of [
    { total:6, price:"22,00", extras:"4 + 2 bombones extra" },
    { total:8, price:"29,00", extras:"4 + 4 bombones extra" },
    { total:11, price:"39,50", extras:"4 + 7 bombones extra" }
  ]) {
    await advanceTo(tier.total);
    await expect(page.locator("#fombTotal")).toContainText(tier.price);
    await expect(page.locator("#fombRule")).toContainText(tier.extras);
    await expect(page.locator('input[name="fombSize"][value="4"]')).toBeChecked();
  }

  await advanceTo(12);
  await expect(page.locator("#fombTotal")).toContainText("30,00");
  await expect(page.locator('input[name="fombSize"][value="12"]')).toBeChecked();
  await expect(page.locator("#fombRule")).not.toContainText("extra");
  await expect(page.locator("#addFombBox")).toBeEnabled();
  await page.locator("#addFombBox").click();
  const twelveBox = await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-cart-v1") || "[]")
    .find(item => item.name.includes("Caja de 12 Fomb")));
  expect(twelveBox).toMatchObject({ price:30, inventory:{kind:"fomb",boxSize:12,extraCount:0} });

  await advanceTo(13);
  await expect(page.locator("#fombTotal")).toContainText("33,50");
  await expect(page.locator("#fombRule")).toContainText("12 + 1 bombón extra");
  await expect(page.locator('input[name="fombSize"][value="12"]')).toBeChecked();
  await page.locator("#addFombBox").click();
  const thirteenBox = await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-cart-v1") || "[]")
    .find(item => item.name.includes("Caja de 13 Fomb")));
  expect(thirteenBox).toMatchObject({ price:33.5, inventory:{kind:"fomb",boxSize:12,extraCount:1} });
  await page.locator("#cartButton").click();
  const thirteenCartItem = page.locator(".cart-item").filter({ hasText:"Caja de 13 Fomb" });
  await expect(thirteenCartItem).toContainText("USD 33,50");
  await expect(thirteenCartItem.locator(".cart-choices")).toContainText("12 Pistacho, 1 Dubai");
  await page.locator("#closeCart").click();

  const pistachoMinus = page.locator('.fomb-flavor[data-flavor="Pistacho"] [data-delta="-1"]');
  await pistachoMinus.click();
  await pistachoMinus.click();
  selectedTotal = 11;
  await expect(pistachoCount).toHaveText("10");
  await expect(page.locator("#fombTotal")).toContainText("39,50");
  await expect(page.locator("#fombRule")).toContainText("4 + 7 bombones extra");
  await expect(page.locator('input[name="fombSize"][value="4"]')).toBeChecked();

  const sizePanel = page.locator(".fomb-builder .choice-panel").filter({ has:page.locator('input[name="fombSize"]') });
  if (!(await sizePanel.getAttribute("open"))) await sizePanel.locator("summary").click();
  await page.locator('input[name="fombSize"][value="12"]').check();
  await expect(page.locator("#fombTotal")).toContainText("30,00");
  await expect(page.locator("#fombValidation")).toContainText("Falta 1 bombón");
  await expect(page.locator("#addFombBox")).toBeDisabled();
  await page.locator('input[name="fombSize"][value="4"]').check();
  await expect(page.locator("#fombTotal")).toContainText("39,50");
  await expect(page.locator("#addFombBox")).toBeEnabled();
});

test("Fomb corrige una caja de 12 guardada con el tramo anterior y conserva WhatsApp", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fontana-cart-v1", JSON.stringify([{
      id:"fomb-box-4-8-12-0-0-0",
      productId:"fomb-box",
      name:"Caja de 12 Fomb · Un sabor",
      price:43,
      image:"assets/fomb-pistachio-fontana-pro.jpg",
      ingredients:"Pistacho y chocolate blanco vegano",
      choices:"12 Pistacho",
      inventory:{kind:"fomb",flavors:[{name:"Pistacho",qty:12,preorder:false}],boxSize:4,extraCount:8,preorder:false},
      qty:1
    }]));
  });
  await openPreview(page);

  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-cart-v1") || "[]")[0]);
  expect(migrated).toMatchObject({
    id:"fomb-box-12-0-12-0-0-0",
    price:30,
    inventory:{kind:"fomb",boxSize:12,extraCount:0}
  });
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item")).toContainText("Caja de 12 Fomb · Un sabor");
  await expect(page.locator(".cart-item")).toContainText("USD 30,00");
  await page.locator("#closeCart").click();

  await fillCheckout(page);
  await page.locator('#checkoutForm button[type="submit"]').click();
  const message = await page.evaluate(() => window.__copiedOrder);
  expect(message).toContain("Caja de 12 Fomb · Un sabor");
  expect(message).toContain("USD 30,00");
  expect(message).toContain("*Total estimado: USD 30,00*");
});

test("el servidor aplica automáticamente el tramo Fomb alcanzado", async () => {
  const { fombPricingMatchesRequest, resolveFombPricing } = await import("../backend/src/pricing.mjs");
  const builder = {sizes:[{quantity:4,price:15},{quantity:12,price:30}],extraPrice:3.5};
  const expectations = [
    [4, {boxSize:4,extraCount:0,unitPriceCents:1500}],
    [6, {boxSize:4,extraCount:2,unitPriceCents:2200}],
    [8, {boxSize:4,extraCount:4,unitPriceCents:2900}],
    [11, {boxSize:4,extraCount:7,unitPriceCents:3950}],
    [12, {boxSize:12,extraCount:0,unitPriceCents:3000}],
    [13, {boxSize:12,extraCount:1,unitPriceCents:3350}],
    [20, {boxSize:12,extraCount:8,unitPriceCents:5800}]
  ];
  expectations.forEach(([total, expected]) => expect(resolveFombPricing(builder, total)).toEqual(expected));
  expect(resolveFombPricing(builder, 3)).toBeNull();
  const twelvePricing = resolveFombPricing(builder, 12);
  expect(fombPricingMatchesRequest(twelvePricing, {boxSize:12,extraCount:0})).toBe(true);
  expect(fombPricingMatchesRequest(twelvePricing, {boxSize:4,extraCount:8})).toBe(false);
  expect(fombPricingMatchesRequest(twelvePricing, {})).toBe(true);
  const workerSource = readFileSync("backend/src/worker.js", "utf8");
  expect(workerSource).toContain("fombPricingMatchesRequest(pricing, requested)");
  expect(workerSource).toContain('throw new Error("pricing_changed")');
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
    await expect(image).toHaveCSS("object-fit", "contain");
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

test("el carrusel compacto móvil responde a contacto táctil real en Fonkies y Fomb", async ({ browser }) => {
  test.slow();
  const context = await browser.newContext({
    baseURL: process.env.FONTANA_BASE_URL || "http://127.0.0.1:8767",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  try {
    await openPreview(page);
    const cdp = await context.newCDPSession(page);
    let nextTouchId = 700;

    const touchGesture = async (track, {
      startX = .78,
      endX = .22,
      startY = .5,
      endY = .5,
      steps = 8,
      finish = "touchEnd"
    } = {}) => {
      await track.scrollIntoViewIfNeeded();
      const box = await track.boundingBox();
      expect(box).toBeTruthy();
      const touchId = nextTouchId++;
      const point = progress => ({
        x: box.x + (box.width * (startX + ((endX - startX) * progress))),
        y: box.y + (box.height * (startY + ((endY - startY) * progress))),
        id: touchId,
        radiusX: 3,
        radiusY: 3,
        force: 1
      });

      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [point(0)]
      });
      for (let step = 1; step <= steps; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [point(step / steps)]
        });
        await page.waitForTimeout(18);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: finish,
        touchPoints: []
      });
    };

    const expectCenteredCurrentCard = async (track, cardSelector, expectedIndex) => {
      await expect(track).toHaveAttribute("data-gallery-state", "idle");
      await expect(track).toHaveAttribute("data-gallery-index", String(expectedIndex));
      const state = await track.evaluate((element, options) => {
        const cards = [...element.querySelectorAll(options.cardSelector)];
        const current = cards[options.expectedIndex];
        const trackBox = element.getBoundingClientRect();
        const cardBox = current?.getBoundingClientRect();
        return {
          currentCount: cards.filter(card => card.getAttribute("aria-current") === "true").length,
          currentIndex: cards.findIndex(card => card.getAttribute("aria-current") === "true"),
          centerDistance: cardBox
            ? Math.abs((cardBox.left + (cardBox.width / 2)) - (trackBox.left + (trackBox.width / 2)))
            : Number.POSITIVE_INFINITY
        };
      }, { cardSelector, expectedIndex });
      expect(state.currentCount).toBe(1);
      expect(state.currentIndex).toBe(expectedIndex);
      expect(state.centerDistance).toBeLessThanOrEqual(1);
    };

    const galleries = [
      { filter: "Fonkies · Galletas", track: ".fonkie-gallery-track", card: ".fonkie-gallery-card" },
      { filter: "Fomb · Bombones", track: ".builder-gallery-track", card: ".builder-gallery-card" }
    ];

    for (const item of galleries) {
      await page.getByRole("button", { name: item.filter }).click();
      const track = page.locator(item.track);
      const cards = track.locator(`:scope > ${item.card}`);
      const overlay = page.locator(".builder-flavor-flip-card");
      await expect(track).toBeVisible();
      await expectCenteredCurrentCard(track, item.card, 0);

      await track.evaluate(element => {
        element.__fontanaTrustedTouchAudit = [];
        ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]
          .forEach(type => element.addEventListener(type, event => {
            element.__fontanaTrustedTouchAudit.push({
              type: event.type,
              trusted: event.isTrusted,
              lostFromChild: event.type === "lostpointercapture" && event.target !== element
            });
          }, { capture: true }));
      });

      await touchGesture(track);
      await expectCenteredCurrentCard(track, item.card, 1);
      await expect(overlay).toHaveCount(0);

      const audit = await track.evaluate(element => element.__fontanaTrustedTouchAudit);
      for (const eventType of ["pointerdown", "pointermove", "pointerup"]) {
        expect(audit.some(event => event.type === eventType && event.trusted)).toBe(true);
      }
      expect(audit.some(event => event.type === "lostpointercapture"
        && event.trusted
        && event.lostFromChild)).toBe(true);

      const current = cards.nth(1);
      const expectedFlavor = (await current.getAttribute("data-flavor")
        || (await current.locator("span").textContent())?.replace(/\s·\sPre-Order\s*$/i, "").trim()
        || "");
      expect(expectedFlavor).toBeTruthy();
      const currentBox = await current.boundingBox();
      expect(currentBox).toBeTruthy();
      await page.touchscreen.tap(
        currentBox.x + (currentBox.width * .5),
        currentBox.y + (currentBox.height * .45)
      );
      await expect(overlay).toHaveAttribute("data-flavor", expectedFlavor);
      await expect(current).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(overlay).toHaveCount(0);
      await expect(current).toHaveAttribute("aria-expanded", "false");

      await touchGesture(track, { startX: .22, endX: .78 });
      await expectCenteredCurrentCard(track, item.card, 0);

      await track.scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => scrollY);
      await touchGesture(track, { startX: .5, endX: .5, startY: .7, endY: .25 });
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore + 30);
      await expectCenteredCurrentCard(track, item.card, 0);
      await expect(overlay).toHaveCount(0);

      await touchGesture(track, {
        startX: .78,
        endX: .44,
        steps: 4,
        finish: "touchCancel"
      });
      await expectCenteredCurrentCard(track, item.card, 0);
      await expect(overlay).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test("las galerías compactas de Fonkies y Fomb mantienen un anillo infinito sin frenos", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPreview(page);

  const modulo = (value, total) => ((value % total) + total) % total;
  let nextPointerId = 200;

  const dispatchGesture = (track, cardSelector, direction) => track.evaluate((element, options) => {
    const box = element.getBoundingClientRect();
    const vertical = options.direction === "vertical";
    const startX = vertical
      ? box.left + (box.width * .5)
      : box.left + (box.width * (options.direction === "forward" ? .78 : .22));
    const endX = vertical
      ? startX + 4
      : box.left + (box.width * (options.direction === "forward" ? .22 : .78));
    const startY = box.top + (box.height * (vertical ? .34 : .5));
    const endY = vertical ? box.top + (box.height * .72) : startY;
    const eventOptions = (x, y, buttons) => ({
      pointerId: options.pointerId,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
      bubbles: true,
      cancelable: true
    });
    const before = Number.parseInt(element.dataset.galleryIndex || "-1", 10);
    element.dispatchEvent(new PointerEvent("pointerdown", eventOptions(startX, startY, 1)));
    element.dispatchEvent(new PointerEvent(
      "pointermove",
      eventOptions((startX + endX) / 2, (startY + endY) / 2, 1)
    ));
    element.dispatchEvent(new PointerEvent("pointermove", eventOptions(endX, endY, 1)));
    element.dispatchEvent(new PointerEvent("pointerup", eventOptions(endX, endY, 0)));
    const cards = [...element.querySelectorAll(options.cardSelector)];
    return {
      before,
      after: Number.parseInt(element.dataset.galleryIndex || "-1", 10),
      state: element.dataset.galleryState,
      scrollLeft: element.scrollLeft,
      currentCount: cards.filter(card => card.getAttribute("aria-current") === "true").length
    };
  }, {
    direction,
    pointerId: nextPointerId++,
    cardSelector
  });

  const expectRestingIndex = async (track, cardSelector, expectedIndex) => {
    await expect(track).toHaveAttribute("data-gallery-state", "idle");
    await expect(track).toHaveAttribute("data-gallery-index", String(expectedIndex));
    const resting = await track.evaluate((element, options) => {
      const cards = [...element.querySelectorAll(options.cardSelector)];
      const current = cards[options.expectedIndex];
      const trackBox = element.getBoundingClientRect();
      const currentBox = current?.getBoundingClientRect();
      return {
        scrollLeft: element.scrollLeft,
        currentCount: cards.filter(card => card.getAttribute("aria-current") === "true").length,
        currentIndex: cards.findIndex(card => card.getAttribute("aria-current") === "true"),
        accessibleCount: cards.filter(card => card.getAttribute("aria-hidden") !== "true").length,
        hiddenCardsValid: cards.every((card, index) => index === options.expectedIndex
          ? card.getAttribute("aria-hidden") === null && card.getAttribute("tabindex") === "0"
          : card.getAttribute("aria-hidden") === "true" && card.getAttribute("tabindex") === "-1"),
        centerDistance: currentBox
          ? Math.abs((currentBox.left + (currentBox.width / 2)) - (trackBox.left + (trackBox.width / 2)))
          : Number.POSITIVE_INFINITY
      };
    }, { cardSelector, expectedIndex });
    expect(resting.scrollLeft).toBe(0);
    expect(resting.currentCount).toBe(1);
    expect(resting.currentIndex).toBe(expectedIndex);
    expect(resting.accessibleCount).toBe(1);
    expect(resting.hiddenCardsValid).toBe(true);
    expect(resting.centerDistance).toBeLessThanOrEqual(1);
  };

  const dispatchRapidBurst = async (track, cardSelector, direction, count) => {
    const signatures = [];
    const states = [];
    const scrollPositions = [];
    for (let turn = 0; turn < count; turn += 1) {
      const sample = await track.evaluate((element, options) => {
        const cards = [...element.querySelectorAll(options.cardSelector)];
        const box = element.getBoundingClientRect();
        const forward = options.direction === "forward";
        const startX = box.left + (box.width * (forward ? .78 : .22));
        const endX = box.left + (box.width * (forward ? .22 : .78));
        const y = box.top + (box.height * .5);
        const eventOptions = (x, buttons) => ({
          pointerId: options.pointerId,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(new PointerEvent("pointerdown", eventOptions(startX, 1)));
        element.dispatchEvent(new PointerEvent("pointermove", eventOptions((startX + endX) / 2, 1)));
        element.dispatchEvent(new PointerEvent("pointermove", eventOptions(endX, 1)));
        element.dispatchEvent(new PointerEvent("pointerup", eventOptions(endX, 0)));
        return {
          signature: cards.map(card => card.style.transform).join("|"),
          state: element.dataset.galleryState,
          scrollLeft: element.scrollLeft
        };
      }, { cardSelector, direction, pointerId: nextPointerId++ });
      signatures.push(sample.signature);
      states.push(sample.state);
      scrollPositions.push(sample.scrollLeft);
      // Leave enough real time for requestAnimationFrame to advance before the
      // next contact interrupts it. A synchronous loop cannot exercise that path.
      await page.waitForTimeout(55);
    }
    return { signatures, states, scrollPositions };
  };

  const dispatchWheelBurst = (track, direction, count = 1) => track.evaluate((element, options) => {
    const width = element.getBoundingClientRect().width;
    const results = [];
    for (let turn = 0; turn < options.count; turn += 1) {
      const wheel = new WheelEvent("wheel", {
        deltaX: width * .72 * options.direction,
        deltaY: 0,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true
      });
      results.push({ prevented: !element.dispatchEvent(wheel), scrollLeft: element.scrollLeft });
    }
    return { results, state: element.dataset.galleryState };
  }, { direction, count });

  const galleries = [
    { filter: "Fonkies · Galletas", track: ".fonkie-gallery-track", card: ".fonkie-gallery-card" },
    { filter: "Fomb · Bombones", track: ".builder-gallery-track", card: ".builder-gallery-card" }
  ];

  for (const item of galleries) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: item.filter }).click();
    const track = page.locator(item.track);
    const cards = track.locator(":scope > " + item.card);

    await expect(track).toBeVisible();
    await expect(track).toHaveAttribute("data-gallery-loop", "true");
    await expect(track).toHaveAttribute("data-gallery-state", "idle");
    await expect(track).toHaveAttribute("data-gallery-index", "0");
    await expect(track.locator(
      ':scope > [data-gallery-loop-copy], :scope > .flavor-gallery-loop-card'
    )).toHaveCount(0);

    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(1);
    await expect(track.locator(`${item.card}[role="button"][aria-label^="Ver detalles de"]`)).toHaveCount(cardCount);
    await expect(track.getByRole("button", { name: /Ver detalles de/ })).toHaveCount(1);
    await expectRestingIndex(track, item.card, 0);

    let expectedIndex = 0;
    for (const direction of ["forward", "reverse"]) {
      const delta = direction === "forward" ? 1 : -1;
      for (let turn = 0; turn < 67; turn += 1) {
        const before = expectedIndex;
        expectedIndex = modulo(expectedIndex + delta, cardCount);
        const result = await dispatchGesture(track, item.card, direction);
        expect(result.before).toBe(before);
        expect(result.after).toBe(expectedIndex);
        expect(result.after).not.toBe(before);
        expect(result.state).toBe("idle");
        expect(result.scrollLeft).toBe(0);
        expect(result.currentCount).toBe(1);
      }
    }
    expect(expectedIndex).toBe(0);
    await expectRestingIndex(track, item.card, expectedIndex);

    await cards.nth(expectedIndex).focus();
    await dispatchGesture(track, item.card, "forward");
    expectedIndex = modulo(expectedIndex + 1, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);
    await expect(cards.nth(expectedIndex)).toBeFocused();
    await dispatchGesture(track, item.card, "reverse");
    expectedIndex = modulo(expectedIndex - 1, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);
    await expect(cards.nth(expectedIndex)).toBeFocused();

    const vertical = await dispatchGesture(track, item.card, "vertical");
    expect(vertical.before).toBe(expectedIndex);
    expect(vertical.after).toBe(expectedIndex);
    expect(vertical.state).toBe("idle");
    expect(vertical.scrollLeft).toBe(0);
    await expectRestingIndex(track, item.card, expectedIndex);

    let current = cards.nth(expectedIndex);
    await current.focus();
    await current.press("ArrowRight");
    expectedIndex = modulo(expectedIndex + 1, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);

    current = cards.nth(expectedIndex);
    await current.press("ArrowLeft");
    expectedIndex = modulo(expectedIndex - 1, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);

    current = cards.nth(expectedIndex);
    await current.press("End");
    expectedIndex = cardCount - 1;
    await expectRestingIndex(track, item.card, expectedIndex);

    current = cards.nth(expectedIndex);
    await current.press("Home");
    expectedIndex = 0;
    await expectRestingIndex(track, item.card, expectedIndex);

    for (let turn = 0; turn < Math.min(3, cardCount - 1); turn += 1) {
      current = cards.nth(expectedIndex);
      await current.press("ArrowRight");
      expectedIndex = modulo(expectedIndex + 1, cardCount);
    }
    await expectRestingIndex(track, item.card, expectedIndex);

    await page.setViewportSize({ width: 430, height: 844 });
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await expectRestingIndex(track, item.card, expectedIndex);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await expectRestingIndex(track, item.card, expectedIndex);

    const wheelCount = 13;
    const wheelSteps = Math.round(wheelCount * .72);
    await cards.nth(expectedIndex).focus();
    const wheelBurst = await dispatchWheelBurst(track, 1, wheelCount);
    expect(wheelBurst.state).toBe("dragging");
    expect(wheelBurst.results.every(result => result.prevented && result.scrollLeft === 0)).toBe(true);
    expectedIndex = modulo(expectedIndex + wheelSteps, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);
    await expect(cards.nth(expectedIndex)).toBeFocused();

    const verticalWheel = await track.evaluate(element => {
      const before = element.dataset.galleryIndex;
      const event = new WheelEvent("wheel", {
        deltaX: 0,
        deltaY: 180,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        bubbles: true,
        cancelable: true
      });
      return {
        propagated: element.dispatchEvent(event),
        before,
        after: element.dataset.galleryIndex
      };
    });
    expect(verticalWheel.propagated).toBe(true);
    expect(verticalWheel.after).toBe(verticalWheel.before);

    // A keyboard command between two trackpad bursts must discard the first
    // wheel session instead of reusing its stale origin on the next gesture.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    current = cards.nth(expectedIndex);
    await current.focus();
    await dispatchWheelBurst(track, 1);
    await current.press("ArrowRight");
    await dispatchWheelBurst(track, 1);
    expectedIndex = modulo(expectedIndex + 2, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.waitForTimeout(520);
    current = cards.nth(expectedIndex);
    const expectedFlavor = (await current.getAttribute("data-flavor")
      || (await current.locator("span").textContent())?.replace(/\s·\sPre-Order\s*$/i, "").trim()
      || "");
    expect(expectedFlavor).toBeTruthy();
    const overlay = page.locator(".builder-flavor-flip-card");

    await current.click();
    await expect(overlay).toHaveAttribute("data-flavor", expectedFlavor);
    await expect(current).toHaveAttribute("aria-expanded", "true");
    await overlay.locator(".builder-flavor-expanded-media").click({ position: { x: 120, y: 120 } });
    await expect(overlay).toHaveCount(0);
    await expect(current).toHaveAttribute("aria-expanded", "false");

    await current.focus();
    await current.press("Enter");
    await expect(overlay).toHaveAttribute("data-flavor", expectedFlavor);
    await expect(current).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
    await expect(current).toHaveAttribute("aria-expanded", "false");
    await expectRestingIndex(track, item.card, expectedIndex);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const rapidStart = expectedIndex;
    const forwardBurst = await dispatchRapidBurst(track, item.card, "forward", 12);
    expect(forwardBurst.states.every(state => state === "settling")).toBe(true);
    expect(forwardBurst.scrollPositions.every(position => position === 0)).toBe(true);
    expect(new Set(forwardBurst.signatures).size).toBe(12);
    expectedIndex = modulo(rapidStart + 12, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);

    const reverseBurst = await dispatchRapidBurst(track, item.card, "reverse", 12);
    expect(reverseBurst.states.every(state => state === "settling")).toBe(true);
    expect(reverseBurst.scrollPositions.every(position => position === 0)).toBe(true);
    expect(new Set(reverseBurst.signatures).size).toBe(12);
    expectedIndex = modulo(expectedIndex - 12, cardCount);
    expect(expectedIndex).toBe(rapidStart);
    await expectRestingIndex(track, item.card, expectedIndex);

    const cancelledDrag = await track.evaluate((element, pointerId) => {
      const box = element.getBoundingClientRect();
      const y = box.top + (box.height * .5);
      const startX = box.left + (box.width * .72);
      const movedX = box.left + (box.width * .44);
      const options = (type, x, buttons) => ({
        pointerId,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(new PointerEvent("pointerdown", options("pointerdown", startX, 1)));
      element.dispatchEvent(new PointerEvent("pointermove", options("pointermove", movedX, 1)));
      element.dispatchEvent(new PointerEvent("pointercancel", options("pointercancel", movedX, 0)));
      return { state: element.dataset.galleryState, scrollLeft: element.scrollLeft };
    }, nextPointerId++);
    expect(cancelledDrag.state).toBe("settling");
    expect(cancelledDrag.scrollLeft).toBe(0);
    await expectRestingIndex(track, item.card, expectedIndex);

    const blurRecovery = await track.evaluate((element, pointerId) => {
      const box = element.getBoundingClientRect();
      const y = box.top + (box.height * .5);
      const startX = box.left + (box.width * .82);
      const movedX = box.left + (box.width * .18);
      const options = (x, buttons) => ({
        pointerId,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(new PointerEvent("pointerdown", options(startX, 1)));
      element.dispatchEvent(new PointerEvent("pointermove", options(movedX, 1)));
      window.dispatchEvent(new Event("blur"));
      return { state: element.dataset.galleryState, scrollLeft: element.scrollLeft };
    }, nextPointerId++);
    expect(blurRecovery.state).toBe("idle");
    expect(blurRecovery.scrollLeft).toBe(0);
    expectedIndex = modulo(expectedIndex + 1, cardCount);
    await expectRestingIndex(track, item.card, expectedIndex);

    const beforeReducedSwitch = await dispatchGesture(track, item.card, "forward");
    expect(beforeReducedSwitch.before).toBe(expectedIndex);
    expect(beforeReducedSwitch.state).toBe("settling");
    expectedIndex = modulo(expectedIndex + 1, cardCount);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectRestingIndex(track, item.card, expectedIndex);
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
  const invitation = page.locator(".review-invitation");
  await expect(carousel).toHaveAttribute("aria-roledescription", "carrusel");
  await expect(carousel).toHaveAttribute("aria-label", "Reseñas de clientes");
  await expect(track.locator(".quote")).toHaveCount(7);
  await expect(page.locator(".testimonial-dot")).toHaveCount(6);
  await expect(track.locator(".review-source")).toHaveCount(7);
  await expect(page.locator(".testimonials .demo-note")).toHaveCount(0);
  await expect(track.locator("blockquote").nth(1)).toContainText("¡Qué delicia todo!");
  await expect(track.locator("blockquote").nth(4)).toContainText("¡Estos panzerotti");
  await expect(track.locator("blockquote").nth(5)).toContainText("le encantaron");
  await expect(invitation).toHaveCSS("background-color", "rgb(234, 213, 237)");
  await expect(invitation.locator("p")).toHaveCSS("color", "rgb(79, 22, 81)");
  await expect(invitation.locator(".btn")).toHaveCSS("background-color", "rgb(110, 35, 111)");
  await expect(invitation.locator(".btn")).toHaveCSS("color", "rgb(255, 255, 255)");
  const initialTransform = await track.evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(4200);
  await expect.poll(() => track.evaluate(element => getComputedStyle(element).transform)).not.toBe(initialTransform);
  await expect(page.locator(".testimonial-dot").nth(1)).toHaveClass(/active/);
  await page.setViewportSize({ width: 390, height: 844 });
  const sectionGaps = await page.evaluate(() => {
    const locationCard = document.querySelector("#ubicacion .location-card").getBoundingClientRect();
    const reviewHeading = document.querySelector("#resenas .section-head").getBoundingClientRect();
    const reviewCarousel = document.querySelector("#resenas .testimonials-carousel").getBoundingClientRect();
    const reviewDots = document.querySelector("#resenas .testimonial-dots").getBoundingClientRect();
    const reviewInvitation = document.querySelector("#resenas .review-invitation").getBoundingClientRect();
    const finalContent = document.querySelector(".final-inner").getBoundingClientRect();
    const footerDivider = getComputedStyle(document.querySelector("main + footer"), "::before");
    return {
      locationToReviews: reviewHeading.top - locationCard.bottom,
      carouselBeforeInvitation: reviewCarousel.bottom <= reviewInvitation.top,
      dotsBeforeInvitation: reviewDots.bottom < reviewInvitation.top,
      reviewsToFinal: finalContent.top - reviewInvitation.bottom,
      footerDividerColor: footerDivider.backgroundColor,
      footerDividerHeight: footerDivider.height
    };
  });
  expect(sectionGaps.locationToReviews).toBeGreaterThanOrEqual(0);
  expect(sectionGaps.locationToReviews).toBeLessThan(70);
  expect(sectionGaps.carouselBeforeInvitation).toBe(true);
  expect(sectionGaps.dotsBeforeInvitation).toBe(true);
  expect(sectionGaps.reviewsToFinal).toBeGreaterThanOrEqual(0);
  expect(sectionGaps.reviewsToFinal).toBeLessThan(80);
  expect(sectionGaps.footerDividerColor).toBe("rgba(217, 174, 220, 0.22)");
  expect(sectionGaps.footerDividerHeight).toBe("1px");
  await expect(page.locator("main + footer")).toHaveCSS("position", "relative");

  for (const layoutCase of [
    { width: 640, height: 900, direction: "column" },
    { width: 641, height: 900, direction: "row" },
    { width: 1366, height: 900, direction: "row" }
  ]) {
    await page.setViewportSize({ width: layoutCase.width, height: layoutCase.height });
    const layout = await page.evaluate(() => {
      const carousel = document.querySelector("#resenas .testimonials-carousel").getBoundingClientRect();
      const dots = document.querySelector("#resenas .testimonial-dots").getBoundingClientRect();
      const invitation = document.querySelector("#resenas .review-invitation");
      const invitationRect = invitation.getBoundingClientRect();
      return {
        carouselBeforeInvitation: carousel.bottom <= invitationRect.top,
        dotsBeforeInvitation: dots.bottom < invitationRect.top,
        direction: getComputedStyle(invitation).flexDirection,
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
      };
    });
    expect(layout.carouselBeforeInvitation).toBe(true);
    expect(layout.dotsBeforeInvitation).toBe(true);
    expect(layout.direction).toBe(layoutCase.direction);
    expect(layout.noHorizontalOverflow).toBe(true);
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
  await openProductCard(page, panzerottis);
  await panzerottis.locator(".product-variant").selectOption({ label: "Mozzarella, salsa y pecorino" });
  await panzerottis.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item h4")).toContainText("Panzerottis");
  await expect(page.locator(".cart-choices")).toHaveText("Mozzarella, salsa y pecorino");
  await page.locator("#closeCart").click();
  await openProductCard(page, raviolis);
  await raviolis.locator(".product-size").selectOption({ label: "300 g · USD 20,00" });
  await raviolis.locator(".product-variant").selectOption({ label: "Carne" });
  await raviolis.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item").filter({ hasText: "Raviolis" })).toContainText("USD 20,00");
  await expect(page.locator(".cart-item").filter({ hasText: "Raviolis" }).locator(".cart-choices")).toHaveText("300 g · Carne");
});

test("un sabor salado agotado cambia automáticamente a Pre-Order", async ({ page }) => {
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
  await expect(carne).toHaveText("Carne · Pre-Order");
  await expect(carne).toBeEnabled();
  await expect(page.locator('[data-product-id="panzerottis"] .product-tag')).toBeHidden();
  await expect(page.locator('[data-product-id="panzerottis"] .add')).toBeEnabled();
});

test("las tortas bloquean hoy y mañana y exigen dos días de anticipación", async ({ page }) => {
  await openPreview(page);
  const cake = await openProductCard(page, '[data-id="pistacho"]');
  await cake.locator(".product-back .add").click();
  await closeProductCard(page);
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

test("el panel puede agotar un sabor Fomb y la tienda habilita su Pre-Order", async ({ page }) => {
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
  await expect(soldOut).toContainText("Pre-Order");
  await expect(soldOut.locator('[data-delta="1"]')).toBeEnabled();
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
  await openProductCard(page, ballerine);
  await ballerine.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-choices")).toContainText("PRE-ORDER · 2 días hábiles");
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
  await expect(page.getByText("No necesitas escribir la contraseña. Pulsa Face ID y confirma en tu iPhone.")).toBeVisible();
  await page.getByRole("button", { name: "Entrar con Face ID" }).click();
  await expect(page.locator("#loginStatus")).toHaveText("Face ID se prueba únicamente en el panel publicado.");
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
  const discoverableMigration = readFileSync("backend/migrations/0006_discoverable_passkey_login.sql", "utf8");
  const wrangler = readFileSync("backend/wrangler.jsonc", "utf8");
  expect(worker).toContain('/v1/auth/passkey/options');
  expect(worker).toContain('/v1/admin/users');
  expect(worker).toContain('verifyAuthenticationResponse');
  expect(worker).toContain('saveDiscoverablePasskeyChallenge');
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS passkey_credentials');
  expect(migration).toContain("role = 'owner'");
  expect(discoverableMigration).toContain('CREATE TABLE IF NOT EXISTS passkey_login_challenges');
  expect(wrangler).toContain('https://www.fontanasingluten.com');

  const adminScript = readFileSync("admin/admin.js", "utf8");
  expect(adminScript).toContain('await apiFetch("/v1/auth/logout", { method:"POST", body:"{}" })');
  expect(adminScript).not.toContain('currentSession = await apiFetch("/v1/auth/session")');
  expect(adminScript).toContain('(username && verifiedSession.username !== username)');
  expect(adminScript).toContain('fontana-admin-last-username');
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

test("el checkout móvil no desborda, evita zoom y pliega las personalizaciones", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.waitForLoadState("networkidle");
  const availableCake = page.locator('[data-category="cakes"]').filter({ has: page.locator(".add") }).first();
  await availableCake.evaluate(card => {
    const presentation = document.createElement("select");
    presentation.className = "product-size";
    const option = document.createElement("option");
    option.value = "25 CM";
    option.dataset.price = card.dataset.price;
    option.textContent = "25 CM";
    presentation.appendChild(option);
    card.appendChild(presentation);
  });
  await openProductCard(page, availableCake);
  await availableCake.locator(".product-back .add").click();
  const drink = await openProductCard(page, '[data-product-id="agua-minalba-600"]');
  await drink.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#customerName")).toHaveCSS("font-size", "16px");
  await expect(page.locator("#customerNotes")).toHaveCSS("font-size", "16px");
  const fit = await page.locator("#drawer").evaluate(drawer => {
    const form = drawer.querySelector("#checkoutForm");
    return {
      viewport: window.innerWidth,
      drawerWidth: drawer.getBoundingClientRect().width,
      drawerScrollWidth: drawer.scrollWidth,
      formWidth: form.getBoundingClientRect().width,
      formScrollWidth: form.scrollWidth
    };
  });
  expect(fit.drawerWidth).toBeLessThanOrEqual(fit.viewport);
  expect(fit.drawerScrollWidth).toBeLessThanOrEqual(fit.drawerWidth);
  expect(fit.formScrollWidth).toBeLessThanOrEqual(fit.formWidth);

  await page.locator('#checkoutForm button[type="submit"]').click();
  await expect(page.locator("#checkoutValidation")).toBeHidden();
  await expect(page.locator("#customerName")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#customerPhone")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#customerName")).toHaveCSS("border-top-color", "rgb(239, 100, 111)");
  await expect(page.locator("#checkoutPreparationGuide")).toContainText("Puede pedirse para el mismo día");
  await expect(page.locator("#checkoutPreparationGuide")).toContainText("Mínimo 2 días de preparación");
  await expect(page.locator("#checkoutPreparationNote")).toContainText("Puedes recibir primero lo disponible");

  await page.locator('input[name="hasAllergies"][value="yes"]').check();
  const customization = page.locator(".item-allergy-field");
  await expect(customization).toHaveCount(1);
  await expect(page.locator("#allergyItemNotes")).not.toContainText("Agua mineral Minalba");
  await expect(customization).not.toHaveAttribute("open", "");
  await expect(customization.locator("textarea")).toBeHidden();
  await expect(customization.locator("textarea")).not.toHaveAttribute("required", "");
  await customization.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: testInfo.outputPath("checkout-movil-compacto-sin-desborde.png"), fullPage: false });
  await customization.locator("summary").click();
  await expect(customization.locator("textarea")).toBeVisible();
});

test("un pedido mixto puede recibirse junto o dividirse en dos momentos", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreview(page);
  await page.waitForLoadState("networkidle");
  const availableCake = page.locator('[data-category="cakes"]').filter({ has: page.locator(".add") }).first();
  await openProductCard(page, availableCake);
  await availableCake.locator(".product-back .add").click();
  const drink = await openProductCard(page, '[data-product-id="agua-minalba-600"]');
  await drink.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();

  await expect(page.locator("#deliveryPlanPanel")).toBeVisible();
  await expect(page.locator('input[name="deliveryPlan"][value="together"]')).toBeChecked();
  await expect(page.locator("#singleFulfillmentGroup")).toBeVisible();
  await expect(page.locator("#splitDeliveryFields")).toBeHidden();

  await page.locator('input[name="deliveryPlan"][value="split"]').check();
  await expect(page.locator("#singleFulfillmentGroup")).toBeHidden();
  await expect(page.locator("#singleDateGroup")).toBeHidden();
  await expect(page.locator("#splitDeliveryFields")).toBeVisible();
  await expect(page.locator("#immediateItemSummary")).toContainText("Agua mineral Minalba");
  await expect(page.locator("#preparedItemSummary")).toContainText("Torta de");
  await expect(page.locator("#immediateRequestedDate")).toHaveAttribute("min", /\d{4}-\d{2}-\d{2}/);
  await expect(page.locator("#preparedRequestedDate")).toHaveAttribute("min", /\d{4}-\d{2}-\d{2}/);

  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#immediateFulfillment").selectOption("pickup");
  await page.locator("#preparedFulfillment").selectOption("delivery");
  await page.locator("#preparedAddress").fill("Dirección de prueba");
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator('input[name="birthdayCandle"][value="no"]').check();
  await page.locator('input[name="hasAllergies"][value="no"]').check();
  await page.locator('#checkoutForm button[type="submit"]').click();

  const message = await page.evaluate(() => window.__copiedOrder);
  expect(message).toContain("*Primera entrega · Productos disponibles primero*");
  expect(message).toContain("Agua mineral Minalba");
  expect(message).toContain("*Segunda entrega · Productos con preparación*");
  expect(message).toContain("• Modalidad: Delivery en todo Carabobo (costo confirmado por WhatsApp)");
  expect(message).toContain("• Dirección: Dirección de prueba");
  expect(message).not.toContain("Costo del segundo delivery");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator("#deliveryPlanPanel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("pedido-mixto-dividido-movil.png"), fullPage: false });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.locator("#splitDeliveryFields").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  await page.locator("#deliveryPlanPanel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("pedido-mixto-dividido-escritorio.png"), fullPage: false });
});

test("una personalización vacía no agrega instrucciones al pedido", async ({ page }) => {
  await openPreview(page);
  await page.waitForLoadState("networkidle");
  const availableCake = page.locator('[data-category="cakes"]').filter({ has: page.locator(".add") }).first();
  await openProductCard(page, availableCake);
  await availableCake.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#requestedDate").fill(await page.locator("#requestedDate").getAttribute("min"));
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator('input[name="birthdayCandle"][value="no"]').check();
  await page.locator('input[name="hasAllergies"][value="yes"]').check();
  await page.locator('input[name="allergens"][value="Celíaco"]').check();
  await page.locator("#crossContamination").check();
  await expect(page.locator(".item-allergy-field")).not.toHaveAttribute("open", "");
  await page.locator('#checkoutForm button[type="submit"]').click();
  const message = await page.evaluate(() => window.__copiedOrder);
  expect(message).toContain("Condiciones, alergias o intolerancias: Celíaco");
  expect(message).not.toContain("INSTRUCCIONES POR PRODUCTO");
});

test("el checkout de escritorio aprovecha el ancho sin desbordar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);
  await page.waitForLoadState("networkidle");
  const availableCake = page.locator('[data-category="cakes"]').filter({ has: page.locator(".add") }).first();
  await openProductCard(page, availableCake);
  await availableCake.locator(".product-back .add").click();
  const drink = await openProductCard(page, '[data-product-id="agua-minalba-600"]');
  await drink.locator(".product-back .add").click();
  await closeProductCard(page);
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#checkoutForm")).toBeVisible();
  await page.waitForTimeout(500);

  const layout = await page.locator("#drawer").evaluate(drawer => {
    const form = drawer.querySelector("#checkoutForm");
    const grid = drawer.querySelector(".form-grid");
    return {
      viewport: window.innerWidth,
      drawerWidth: drawer.getBoundingClientRect().width,
      drawerScrollWidth: drawer.scrollWidth,
      formWidth: form.getBoundingClientRect().width,
      formScrollWidth: form.scrollWidth,
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length
    };
  });
  expect(layout.drawerWidth).toBe(620);
  expect(layout.drawerWidth).toBeLessThan(layout.viewport);
  expect(layout.drawerScrollWidth).toBeLessThanOrEqual(layout.drawerWidth);
  expect(layout.formScrollWidth).toBeLessThanOrEqual(layout.formWidth);
  expect(layout.columns).toBe(2);

  await page.locator('#checkoutForm button[type="submit"]').click();
  await expect(page.locator("#checkoutValidation")).toBeHidden();
  await expect(page.locator("#customerName")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#customerPhone")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#checkoutPreparationGuide")).toContainText("Puede pedirse para el mismo día");
  await expect(page.locator("#checkoutPreparationGuide")).toContainText("Mínimo 2 días de preparación");
  await page.locator('input[name="hasAllergies"][value="yes"]').check();
  await expect(page.locator(".item-allergy-field")).toHaveCount(1);
  await expect(page.locator(".item-allergy-field")).not.toHaveAttribute("open", "");
  await expect(page.locator("#allergyItemNotes")).not.toContainText("Agua mineral Minalba");
  await page.screenshot({ path: testInfo.outputPath("checkout-escritorio-compacto.png"), fullPage: false });
});

test("el panel administra sabores especiales en tarjetas compactas y conserva el checkout", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Fonkies", exact: true }).click();
  await expect(page.locator("#fonkiesEditor .builder-settings")).not.toHaveAttribute("open", "");
  const compactLayout = await page.locator("#fonkiesEditor").evaluate(editor => {
    const cards = [...editor.querySelectorAll(".flavor-row")];
    const columns = getComputedStyle(editor.querySelector(".flavor-admin-list")).gridTemplateColumns.split(" ").length;
    return {
      columns,
      tallestCard: Math.max(...cards.map(card => card.getBoundingClientRect().height)),
      fitsViewport: document.documentElement.scrollWidth <= window.innerWidth
    };
  });
  expect(compactLayout.columns).toBe(2);
  expect(compactLayout.tallestCard).toBeLessThanOrEqual(78);
  expect(compactLayout.fitsViewport).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("fonkies-admin-compacto-movil.png"), fullPage: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.locator("#fonkiesEditor .flavor-admin-list").evaluate(list => getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(3);
  await page.screenshot({ path: testInfo.outputPath("fonkies-admin-compacto-escritorio.png"), fullPage: false });
  await page.locator("#fonkiesEditor .builder-settings summary").click();
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

test("Elige tu antojo se activa al entrar en pantalla, no antes", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    const intro = page.locator(".menu-intro");
    await expect(intro).not.toHaveClass(/menu-intro-visible/);
    const initial = await intro.evaluate(element => ({
      top: element.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY
    }));
    expect(initial.top).toBeGreaterThan(initial.viewportHeight);
    expect(initial.scrollY).toBe(0);

    await intro.scrollIntoViewIfNeeded();
    await expect(intro).toHaveClass(/menu-intro-visible/);
    await expect(page.locator(".menu-title-letter").first()).toHaveCSS("animation-name", "menu-letter-in");
    const activation = await intro.evaluate(element => ({
      top: element.getBoundingClientRect().top,
      viewportHeight: window.innerHeight
    }));
    expect(activation.top).toBeLessThanOrEqual(activation.viewportHeight * 0.88 + 2);
  }
});

test("el bloque negro fue eliminado y el footer centra la marca", async ({ page }) => {
  await openPreview(page);
  await expect(page.locator(".pillars")).toHaveCount(0);
  await expect(page.locator("footer .footer-brand")).toHaveCSS("text-align", "center");
  await expect(page.locator(".hero-logo")).toBeVisible();
  await expect(page.locator(".nav .brand-seal")).toHaveCount(1);
  await expect(page.locator(".nav .brand-symbol, .nav .brand-wordmark")).toHaveCount(0);
  await expect(page.locator("#cartButton .hamburger-icon")).toBeVisible();
  await page.locator("img").evaluateAll(images => images.forEach(image => {
    image.loading = "eager";
  }));
  await expect.poll(async () => page.locator("img").evaluateAll(images => images.filter(image => !image.complete).length)).toBe(0);
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
  await expect(layerCake.locator("img")).toHaveAttribute("src", "assets/layer-cake-fontana-pro.webp");
  await expect(layerCake.locator(".product-safety")).toHaveCount(0);
  await expect(layerCake.locator(".add")).toHaveCount(0);
  await openProductCard(page, layerCake);
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
  await openProductCard(page, customCake);
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
  const cake = await openProductCard(page, '[data-id="pistacho"]');
  await cake.locator(".product-back .add").click();
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
  await expect(page).toHaveTitle("Postres sin gluten y sin azúcar | Fontana");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index,follow/);
  await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute("content", "P8eJAN1O83e_F3FfoQuvlA60BWmrvrYRkxTK9jUVHJo");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /sin gluten en Carabobo/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://fontanasingluten.com/");
  await expect(page.locator('link[rel="alternate"][hreflang="es-VE"]')).toHaveAttribute("href", "https://fontanasingluten.com/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Postres sin gluten y sin azúcar | Fontana");
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", "Postres sin gluten y sin azúcar | Fontana");
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute("content", "image/jpeg");
  await expect(page.locator("h1")).toContainText("Postres sin gluten y sin azúcar en Carabobo");

  const structuredData = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(structuredData["@graph"].some(item => item["@type"] === "WebSite" && item.name === "Fontana sin gluten")).toBe(true);
  expect(structuredData["@graph"].some(item => item["@type"] === "WebPage" && item.name === "Postres sin gluten y sin azúcar | Fontana")).toBe(true);
  expect(structuredData["@graph"].some(item => item["@type"] === "WebPage" && item.primaryImageOfPage?.width === 1448)).toBe(true);
  expect(structuredData["@graph"].some(item => item["@type"] === "Bakery" && item.address.addressLocality === "Mañongo")).toBe(true);

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Sitemap: https://fontanasingluten.com/sitemap.xml");
  expect(robotsText).toContain("Disallow: /admin/");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("<loc>https://fontanasingluten.com/</loc>");
  expect(sitemapText).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
  expect(sitemapText).toContain("<image:loc>https://fontanasingluten.com/assets/pistacho-fontana-v4.webp</image:loc>");

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

test("las métricas de Pedidos abren la lista con el filtro correspondiente", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Pedidos", exact: true }).click();

  const cases = [
    ["Ver reservas activas", "active"],
    ["Ver confirmados", "confirmed"],
    ["Ver vencidos", "expired"],
    ["Ver pedidos registrados", "all"]
  ];
  for (const [name, value] of cases) {
    await page.locator("#orderSearch").fill("texto anterior");
    const card = page.getByRole("button", { name, exact: true });
    await card.click();
    await expect(page.locator("#orderStatusFilter")).toHaveValue(value);
    await expect(page.locator("#orderSearch")).toHaveValue("");
    await expect(page.locator(`#orderStats [data-order-filter="${value}"]`)).toHaveAttribute("aria-pressed", "true");
  }
  await page.screenshot({ path: testInfo.outputPath("pedidos-metricas-filtrables-movil.png"), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("el catálogo tardío conserva el contenido realmente visible sin saltar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const delayedProducts = [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `producto-tardio-${index}`,
      category: "cakes",
      name: `Producto tardío ${index + 1}`,
      price: 20 + index,
      image: "assets/chocolate-fontana-v2.jpg",
      description: "Producto de prueba para estabilizar el catálogo.",
      ingredients: "Harina de almendra.",
      weight: "TORTA COMPLETA",
      status: "available",
      visible: true
    })),
    {
      id: "pistacho",
      category: "cakes",
      name: "Pistachio Raspberry",
      price: 54,
      image: "assets/pistachio-raspberry-fontana-v2.jpg",
      description: "Pistacho, frambuesa y harina de almendra.",
      ingredients: "Harina de almendra, pistacho y frambuesa.",
      weight: "APROX. 1 KG",
      status: "available",
      visible: true
    },
    ...[
      "ballerine", "tentacion-coco", "crumbl-blueberry", "brownie-fit", "mini-cake", "layer-cake",
      "torta-personalizada", "cachito-fit", "panzerottis", "tequenos-fit", "raviolis", "nuggets-rora",
      "agua-minalba-600", "agua-gasificada-minalba", "tevia-durazno", "san-pellegrino"
    ].map((id, index) => ({
      id,
      category: "snacks",
      name: `Producto administrado ${index + 1}`,
      price: 10 + index,
      image: "assets/chocolate-fontana-v2.jpg",
      description: "Producto administrado de prueba.",
      ingredients: "Harina de almendra.",
      weight: "DISPONIBLE",
      status: "available",
      visible: true
    }))
  ];
  let releaseHydration;
  let hydrationGate = new Promise(resolve => { releaseHydration = resolve; });
  await page.route("https://api.fontanasingluten.com/v1/catalog", async route => {
    await hydrationGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ state: { products: delayedProducts, operations: { verified: true, electricityEnabled: true }, settings: { stockTodayOpen: true } } })
    });
  });

  await page.goto("http://fontana.localhost:8767/");
  const initialCard = page.locator('#products > .product[data-id="pistacho"]');
  await expect(initialCard).toBeVisible();
  await initialCard.evaluate(element => window.scrollTo({
    top: window.scrollY + element.getBoundingClientRect().top - 240,
    behavior: "instant"
  }));
  const before = await initialCard.evaluate(element => ({ top: element.getBoundingClientRect().top, scrollY }));
  releaseHydration();
  const hydratedCard = page.locator('#products [data-product-id="pistacho"]');
  await expect(hydratedCard).toBeVisible({ timeout: 4000 });
  await expect(hydratedCard).toHaveClass(/product-flip-ready/);
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
  const after = await hydratedCard.evaluate(element => ({ top: element.getBoundingClientRect().top, scrollY }));
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);
  expect(after.scrollY).toBeGreaterThan(before.scrollY);
  expect(await page.evaluate(() => document.documentElement.style.overflowAnchor)).toBe("");

  hydrationGate = new Promise(resolve => { releaseHydration = resolve; });
  await page.goto("http://fontana.localhost:8767/");
  await expect(page.locator('#products > .product[data-id="pistacho"]')).toBeVisible();
  const menuIntro = page.locator(".menu-intro");
  await menuIntro.evaluate(element => {
    const rect = element.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - 180, behavior: "instant" });
  });
  await expect(menuIntro).toHaveClass(/menu-intro-visible/);
  await expect(menuIntro.locator(".menu-title-letter")).toHaveCount(13);
  await expect(menuIntro.locator(".menu-title-letter").last()).toHaveCSS("opacity", "1", { timeout: 2500 });
  const menuBefore = await page.evaluate(() => {
    const intro = document.querySelector(".menu-intro").getBoundingClientRect();
    const filters = document.querySelector(".filters").getBoundingClientRect();
    return { scrollY, introTop: intro.top, filtersTop: filters.top };
  });
  releaseHydration();
  await expect(page.locator('[data-product-id="producto-tardio-0"]')).toHaveClass(/product-flip-ready/, { timeout: 4000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });
  const menuAfter = await page.evaluate(() => {
    const intro = document.querySelector(".menu-intro").getBoundingClientRect();
    const filters = document.querySelector(".filters").getBoundingClientRect();
    return {
      scrollY,
      introTop: intro.top,
      filtersTop: filters.top,
      overflowAnchor: document.documentElement.style.overflowAnchor,
      menuLetterCount: document.querySelectorAll(".menu-title-letter").length
    };
  });
  expect(Math.abs(menuAfter.scrollY - menuBefore.scrollY)).toBeLessThanOrEqual(1);
  expect(Math.abs(menuAfter.introTop - menuBefore.introTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(menuAfter.filtersTop - menuBefore.filtersTop)).toBeLessThanOrEqual(1);
  expect(menuAfter.overflowAnchor).toBe("");
  expect(menuAfter.menuLetterCount).toBe(13);

  hydrationGate = new Promise(resolve => { releaseHydration = resolve; });
  await page.goto("http://fontana.localhost:8767/");
  await expect(page.locator('#products > .product[data-id="pistacho"]')).toBeVisible();
  const storyHeading = page.locator("#historia h2");
  await storyHeading.evaluate(element => window.scrollTo({
    top: window.scrollY + element.getBoundingClientRect().top - 180,
    behavior: "instant"
  }));
  const storyBefore = await storyHeading.evaluate(element => ({ top: element.getBoundingClientRect().top, scrollY }));
  releaseHydration();
  await expect(page.locator('[data-product-id="producto-tardio-0"]')).toHaveClass(/product-flip-ready/, { timeout: 4000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
  const storyAfter = await storyHeading.evaluate(element => ({
    top: element.getBoundingClientRect().top,
    scrollY,
    overflowAnchor: document.documentElement.style.overflowAnchor
  }));
  expect(Math.abs(storyAfter.top - storyBefore.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(storyAfter.scrollY - storyBefore.scrollY)).toBeGreaterThan(100);
  expect(storyAfter.overflowAnchor).toBe("");
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
  expect(worker).toContain('/v1/orders/validate');
  expect(worker).toContain('resolveStockChecks');
  expect(worker).toContain('automaticPreorderForProduct');
  expect(worker).toContain('automaticPreorderForBuilder');
  expect(worker).toContain('resolveReservationCart(publicState');
  expect(worker).toContain('/v1/admin/inventory');
  expect(worker).toContain('/v1/admin/orders');
  expect(worker).toContain("await expireReservations(env)");
  expect(worker).toContain("'sale'");
  expect(wrangler).toContain('"* * * * *"');
  expect(checkout).toContain('textContent = "Reservando stock…"');
  expect(checkout).toContain('/v1/orders/reserve');
  expect(checkout).toContain('/v1/orders/validate');
  expect(checkout).toContain('flavor.quantity ?? flavor.qty');
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
  await expect(page.locator('.product[data-category="beverages"] .product-tag')).toHaveCount(0);
  await page.locator('.product[data-category="beverages"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("bebidas-sin-sticker-generico.png"), fullPage: false });

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

test("el panel controla la electricidad, persiste el estado y registra la dependencia por producto", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/");
  await page.getByRole("button", { name: "Entrar al panel" }).click();

  const control = page.locator("#electricityControl");
  const toggle = page.locator("#electricityToggle");
  await expect(control).toBeVisible();
  await expect(page.locator("#electricityTitle")).toHaveText("Electricidad activa");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(await control.evaluate(element => element.clientHeight)).toBeLessThanOrEqual(64);
  await page.locator('summary[aria-label="Ver detalles del estado de producción"]').click();
  await expect(page.locator("#electricityDescription")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("electricidad-compacta-movil.png"), fullPage: false });

  page.once("dialog", dialog => dialog.accept());
  await toggle.click();
  await expect(page.locator("#electricityTitle")).toHaveText("Sin electricidad");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fontana-admin-catalog-v1")).settings.productionWithElectricity)).toBe(false);

  await page.reload();
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page.locator("#electricityToggle")).toHaveAttribute("aria-checked", "false");
  await page.setViewportSize({ width: 1366, height: 900 });
  expect(await control.evaluate(element => element.clientHeight)).toBeLessThanOrEqual(72);
  await page.screenshot({ path: testInfo.outputPath("electricidad-compacta-escritorio.png"), fullPage: false });
  await page.getByRole("button", { name: "Fonkies", exact: true }).click();
  await expect(page.locator('[data-builder="fonkies"] [data-builder-field="requiresElectricity"]')).toBeChecked();
  await page.getByRole("button", { name: "Fomb", exact: true }).click();
  await expect(page.locator('[data-builder="fomb"] [data-builder-field="requiresElectricity"]')).not.toBeChecked();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.locator('[data-product-id="ballerine"] [data-edit="ballerine"]').click();
  await expect(page.locator('#productForm [name="requiresElectricity"]')).not.toBeChecked();
});

test("sin electricidad pausa Fonkies, muestra rojo y bloquea un carrito existente sin eliminarlo", async ({ page }, testInfo) => {
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
  await expect(page.locator(".fonkie-builder .builder-flavor-availability").first()).toHaveText("Temporalmente no disponible");
  await expect(page.locator(".fonkie-builder")).not.toContainText("Entrega inmediata");
  const unavailableTag = page.locator(".fonkie-builder .builder-admin-tags .status-unavailable").first();
  await expect(unavailableTag).toHaveCSS("background-color", "rgb(180, 56, 56)");
  await expect(unavailableTag).toHaveCSS("color", "rgb(255, 255, 255)");
  await unavailableTag.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("fonkies-temporalmente-no-disponible-rojo.png"), fullPage: false });
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

test("la pausa eléctrica respeta qué builder depende de electricidad", async ({ page }) => {
  const state = createBuilderAvailabilityState();
  state.settings.productionWithElectricity = false;
  state.builders.fonkies.requiresElectricity = false;
  state.builders.fomb.requiresElectricity = true;
  await page.addInitScript(({ catalog, cart }) => {
    localStorage.setItem("fontana-admin-catalog-v1", JSON.stringify(catalog));
    localStorage.setItem("fontana-cart-v1", JSON.stringify(cart));
  }, {
    catalog: state,
    cart: [{
      id: "fomb-box-4-0-4-0-0",
      productId: "fomb-box",
      name: "Caja de 4 Fomb · Un sabor",
      price: 15,
      image: "assets/fomb-pistachio-fontana-pro.jpg",
      choices: "4 Fomb con cantidad cargada · ENTREGA INMEDIATA",
      inventory: {
        kind: "fomb",
        flavors: [{ name: "Fomb con cantidad cargada", qty: 4, preorder: false, stockState: "immediate" }],
        boxSize: 4,
        extraCount: 0,
        preorder: false,
        availability: "immediate"
      },
      qty: 1
    }]
  });

  await openPreview(page);
  await expect(page.locator("#electricityNotice")).toHaveText("Producción de Fomb temporalmente pausada. El resto del catálogo sigue disponible.");
  await expect(page.locator('.fonkie-gallery-card[data-flavor="Fonkie con stock real"] .builder-flavor-availability')).toHaveText("Entrega inmediata");
  await expect(page.locator('.builder-gallery-card[data-flavor="Fomb con cantidad cargada"] .builder-flavor-availability')).toHaveText("Temporalmente no disponible");
  await page.getByRole("button", { name: "Fomb · Bombones" }).click();
  await expect(page.locator("#addFombBox")).toBeDisabled();

  await page.locator("#cartButton").click();
  await expect(page.locator(".cart-item")).toContainText("Temporalmente no disponible");
  await expect(page.locator("#continueCheckout")).toBeDisabled();
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
