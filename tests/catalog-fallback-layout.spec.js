const { test, expect } = require("@playwright/test");

test("los precios no verificados caben en las tarjetas móviles", async ({ page }) => {
  await page.setViewportSize({ width:375, height:844 });
  await page.route("https://api.fontanasingluten.com/v1/**", route => route.abort());
  await page.goto("http://fontana.localhost:8767/");
  await expect(page.locator("html")).toHaveClass(/catalog-unverified/);
  await expect(page.locator(".product-front .price").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  const issues = await page.locator(".product-front .price").evaluateAll(prices => prices.flatMap(price => {
    const box=price.getBoundingClientRect(), card=price.closest(".product").getBoundingClientRect();
    if(!box.width)return [];
    return box.left<card.left-1||box.right>card.right+1||price.scrollWidth>price.clientWidth+1
      ? [price.closest(".product").dataset.productId] : [];
  }));
  expect(issues).toEqual([]);
});
