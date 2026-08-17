const { test, expect } = require("@playwright/test");

test("cliente prepara un pedido completo para WhatsApp", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await expect(page.locator("#cartTotal")).toContainText("34");
  await page.locator("#continueCheckout").click();

  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#fulfillment").selectOption("delivery");
  await expect(page.locator("#addressGroup")).toBeVisible();
  await page.locator("#customerAddress").fill("Mañongo, edificio Fontana");
  await page.locator("#requestedDate").fill("2026-08-20");
  await page.locator("#requestedTime").fill("Después de las 4 pm");
  await page.locator("#paymentMethod").selectOption({ label: "Pago Móvil" });
  await page.locator('input[name="hasAllergies"][value="no"]').check();
  await page.locator("#crossContamination").check();
  await page.locator("#customerNotes").fill("Entregar después de las 4 pm");
  await page.locator('#checkoutForm button[type="submit"]').click();

  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Pedido FNT-");
  expect(message).toContain("1× Foncake Pistacho & Frambuesa");
  expect(message).toContain("Andrea Pérez");
  expect(message).toContain("Pago Móvil");
  expect(message).toContain("Enviaré el comprobante");
});

test("la entrada es minimalista y el carrito usa una bolsa lineal", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero-logo")).toBeVisible();
  await expect(page.locator(".hero-copy .hero-lead")).toHaveCount(0);
  await expect(page.locator("#cartButton .bag-icon")).toBeVisible();
});

test("el menú permanece visible y la ubicación solo indica Mañongo", async ({ page }) => {
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
  await expect(page.getByText("TerraNostra")).toHaveCount(0);

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

test("un pedido con alergias queda marcado para revisión", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator('[data-id="pistacho"] .add').click();
  await page.locator("#cartButton").click();
  await page.locator("#continueCheckout").click();
  await page.locator("#customerName").fill("Andrea Pérez");
  await page.locator("#customerPhone").fill("0412 000 0000");
  await page.locator("#requestedDate").fill("2026-08-20");
  await page.locator("#requestedTime").fill("4:00 pm - 6:00 pm");
  await page.locator('input[name="hasAllergies"][value="yes"]').check();
  await page.locator('input[name="allergens"][value="Frutos secos"]').check();
  await page.locator("#crossContamination").check();
  await page.locator('#checkoutForm button[type="submit"]').click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("Frutos secos");
  expect(message).toContain("PENDIENTE DE REVISIÓN POR FONTANA");
});
