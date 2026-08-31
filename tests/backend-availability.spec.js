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

test("los productos publican solo si su stock real está controlado", async () => {
  const { applyPublicProductAvailability } = await import("../backend/src/public-availability.mjs");
  const tracked = {
    id: "bottega-con-stock",
    category: "bottega",
    status: "available",
    stockQuantity: 91,
    variants: [
      { name: "Clásico", status: "available", stockQuantity: 17 },
      { name: "Picante", status: "available", stockQuantity: 13 }
    ]
  };
  const untracked = {
    id: "bottega-sin-control",
    category: "bottega",
    status: "available",
    stockQuantity: 44
  };
  const trackedCandidates = [
    { sku: "product:bottega-con-stock:base:clasico", variantName: "Clásico" },
    { sku: "product:bottega-con-stock:base:picante", variantName: "Picante" }
  ];
  const untrackedCandidates = [
    { sku: "product:bottega-sin-control:base:base" }
  ];
  const inventory = new Map([
    ["product:bottega-con-stock:base:clasico", { trackStock: true, available: 3, onHand: 4, reserved: 1 }],
    ["product:bottega-con-stock:base:picante", { trackStock: true, available: 0, onHand: 2, reserved: 2 }],
    ["product:bottega-sin-control:base:base", { trackStock: false, available: 44, onHand: 44, reserved: 0 }]
  ]);

  applyPublicProductAvailability(tracked, trackedCandidates, inventory);
  applyPublicProductAvailability(untracked, untrackedCandidates, inventory);

  expect(tracked).toMatchObject({ status: "available", stockTracked: true });
  expect(tracked.variants).toEqual([
    expect.objectContaining({ name: "Clásico", status: "available", stockTracked: true }),
    expect.objectContaining({ name: "Picante", status: "sold-out", stockTracked: true })
  ]);
  expect(untracked).toMatchObject({ status: "available", stockTracked: false });

  const serialized = JSON.stringify({ tracked, untracked });
  expect(serialized).not.toContain("stockQuantity");
  expect(serialized).not.toContain("onHand");
  expect(serialized).not.toContain("reserved");
  expect(serialized).not.toContain('"available":');
  expect(serialized).not.toContain("trackStock");
});

test("un producto agotado por inventario conserva la política configurada de pre-order", async () => {
  const { applyPublicProductAvailability } = await import("../backend/src/public-availability.mjs");
  const soldOut = { id: "bottega-agotado", category: "bottega", status: "available", allowPreorder: false };
  const soldOutWithPreorder = { id: "bottega-agotado-con-preorder", category: "bottega", status: "available", allowPreorder: true };
  const inventory = new Map([
    ["product:bottega-agotado:base:base", { trackStock: true, available: 0 }],
    ["product:bottega-agotado-con-preorder:base:base", { trackStock: true, available: 0 }]
  ]);

  applyPublicProductAvailability(soldOut, [{ sku: "product:bottega-agotado:base:base" }], inventory);
  applyPublicProductAvailability(soldOutWithPreorder, [{ sku: "product:bottega-agotado-con-preorder:base:base" }], inventory);

  expect([soldOut, soldOutWithPreorder]).toEqual([
    expect.objectContaining({ id: "bottega-agotado", status: "sold-out", stockTracked: true, allowPreorder: false }),
    expect.objectContaining({ id: "bottega-agotado-con-preorder", status: "sold-out", stockTracked: true, allowPreorder: true })
  ]);
});

test("la selección manual de preordenar o agotado no es anulada por inventario con unidades", async () => {
  const { applyPublicProductAvailability } = await import("../backend/src/public-availability.mjs");
  const preorder = { id:"preorden", availabilityMode:"preorder", status:"sold-out", allowPreorder:true };
  const soldOut = { id:"agotado", availabilityMode:"sold-out", status:"sold-out", allowPreorder:false };
  const inventory = new Map([
    ["product:preorden:base:base", { trackStock:true, available:8 }],
    ["product:agotado:base:base", { trackStock:true, available:8 }]
  ]);

  applyPublicProductAvailability(preorder, [{ sku:"product:preorden:base:base" }], inventory);
  applyPublicProductAvailability(soldOut, [{ sku:"product:agotado:base:base" }], inventory);

  expect(preorder).toMatchObject({ availabilityMode:"preorder", status:"sold-out", allowPreorder:true, stockTracked:true });
  expect(soldOut).toMatchObject({ availabilityMode:"sold-out", status:"sold-out", allowPreorder:false, stockTracked:true });
});
