const { test, expect } = require("@playwright/test");

test.use({ reducedMotion: "reduce" });

async function openStore(page) {
  await page.route(/\/config(?:\.[a-f0-9]+)?\.js(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("previewMode: false", "previewMode: true") });
  });
  await page.goto("/");
  await expect(page.locator('[data-id="pistacho"]')).toHaveClass(/product-flip-ready/);
}

test("el carrito cerrado no recibe foco y al abrir contiene la navegación por teclado", async ({ page }) => {
  await openStore(page);
  const trigger = page.locator("#cartButton");
  const close = page.locator("#closeCart");
  const next = page.locator("#continueCheckout");
  await trigger.focus();
  await close.evaluate(element => element.focus());
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(page.locator('#drawer[role="dialog"][aria-modal="true"]')).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.locator("#drawer")).toHaveAttribute("inert", "");
  await trigger.press("Enter");
  await expect(close).toBeFocused();
  await close.press("Enter");
  await expect(trigger).toBeFocused();
});

test("la ficha ampliada contiene Tab y devuelve el foco al cerrarse", async ({ page }) => {
  await openStore(page);
  const product = page.locator('[data-id="pistacho"]');
  const media = product.locator(".product-front > .product-media, .product-back > .product-media");
  await media.focus();
  await media.press("Enter");
  const dialog = product.locator('.product-back[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeFocused();
  await expect(dialog).toHaveAttribute("aria-label", /Pistacho/);
  await page.keyboard.press("Tab");
  await expect(media).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(product.locator(".product-back .add")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(media).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(product).not.toHaveClass(/product-expanded/);
  await expect(media).toBeFocused();
});

test("volver desde los datos del pedido deja el foco en un control visible del carrito", async ({ page }) => {
  await openStore(page);
  const product = page.locator('[data-id="pistacho"]');
  await product.locator(".product-media").click();
  await product.locator(".product-back .add").click();
  await page.keyboard.press("Escape");
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await expect(page.locator("#customerName")).toBeFocused();
  await page.locator("#backToCart").click();
  await expect(page.locator("#continueCheckout")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#closeCart")).toBeFocused();
});

test("los desplegables del pedido conservan el tamaño táctil y la selección nativa", async ({ page }) => {
  await openStore(page);
  const product = page.locator('[data-id="pistacho"]');
  await product.locator(".product-media").click();
  await product.locator(".product-back .add").click();
  await page.keyboard.press("Escape");
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  for (const viewport of [{ width:390, height:844 }, { width:1366, height:900 }]) {
    await page.setViewportSize(viewport);
    for (const id of ["fulfillment", "paymentMethod"]) {
      const select = page.locator(`#${id}`);
      await expect(select).toHaveCSS("appearance", "none");
      expect((await select.boundingBox()).height).toBeGreaterThanOrEqual(44);
      expect(await select.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.locator("#fulfillment").selectOption("delivery");
    await expect(page.locator("#customerAddress")).toBeVisible();
    await page.locator("#fulfillment").selectOption("pickup");
    await expect(page.locator("#customerAddress")).toBeDisabled();
    await page.locator("#paymentMethod").selectOption({ label:"Pago Móvil" });
    await expect(page.locator("#paymentMethod")).toHaveValue("Pago Móvil");
    await expect(page.locator("#requestedDate")).toHaveCSS("appearance", "auto");
  }
});
