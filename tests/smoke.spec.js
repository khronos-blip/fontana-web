const { test, expect } = require("@playwright/test");

test("cliente prepara un pedido completo para WhatsApp", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await expect(page.locator("#cartTotal")).toContainText("34");
  await page.locator("#continueCheckout").click();

  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#fulfillment").selectOption("delivery");
  await expect(page.locator("#addressGroup")).toBeVisible();
  await page.locator("#customerAddress").fill("Mañongo, edificio Fontana");
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator("#customerNotes").fill("Entregar después de las 4 pm");
  await page.locator('#checkoutForm button[type="submit"]').click();

  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Pedido FNT-");
  expect(message).toContain("1× Foncake Pistacho & Frambuesa");
  expect(message).toContain("Andrea Pérez");
  expect(message).toContain("Pago Móvil");
  expect(message).toContain("Enviaré el comprobante");
});
