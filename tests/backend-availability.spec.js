const { test, expect } = require("@playwright/test");

test("el catálogo público anuncia control de stock sin publicar cantidades", async () => {
  const { applyPublicBuilderAvailability } = await import("../backend/src/public-availability.mjs");
  const builder = {
    status: "available",
    stockQuantity: 99,
    flavors: [
      { name: "Con stock", status: "available", stockQuantity: 18 },
      { name: "Agotado", status: "available", stockQuantity: 4 },
      { name: "Sin inventario", status: "available", stockQuantity: 12 }
    ]
  };
  const candidates = [
    { sku: "builder:test:in-stock", flavorName: "Con stock" },
    { sku: "builder:test:out-of-stock", flavorName: "Agotado" },
    { sku: "builder:test:untracked", flavorName: "Sin inventario" }
  ];
  const inventory = new Map([
    ["builder:test:in-stock", { trackStock: true, onHand: 8, reserved: 2, available: 6 }],
    ["builder:test:out-of-stock", { trackStock: true, onHand: 3, reserved: 3, available: 0 }],
    ["builder:test:untracked", { trackStock: false, onHand: 50, reserved: 0, available: 50 }]
  ]);

  applyPublicBuilderAvailability(builder, candidates, inventory);

  expect(builder.stockTracked).toBe(false);
  expect(builder.status).toBe("available");
  expect(builder.flavors.map(flavor => ({
    name: flavor.name,
    status: flavor.status,
    stockTracked: flavor.stockTracked
  }))).toEqual([
    { name: "Con stock", status: "available", stockTracked: true },
    { name: "Agotado", status: "sold-out", stockTracked: true },
    { name: "Sin inventario", status: "available", stockTracked: false }
  ]);

  const privateKeys = new Set(["stockQuantity", "onHand", "reserved", "available", "trackStock"]);
  const publishedPrivateKeys = [];
  const inspect = value => {
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([key, nested]) => {
      if (privateKeys.has(key)) publishedPrivateKeys.push(key);
      inspect(nested);
    });
  };
  inspect(builder);
  expect(publishedPrivateKeys).toEqual([]);
});
