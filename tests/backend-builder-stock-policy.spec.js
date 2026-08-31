const { test, expect } = require("@playwright/test");

test("la disponibilidad de builders aplica una precedencia determinista", async () => {
  const { applyPublicBuilderAvailability } = await import("../backend/src/public-availability.mjs");

  const manuallyPaused = {
    status: "sold-out",
    flavors: [{ name: "Con stock", status: "available" }]
  };
  applyPublicBuilderAvailability(
    manuallyPaused,
    [{ sku: "builder:fonkies:con-stock", flavorName: "Con stock" }],
    new Map([["builder:fonkies:con-stock", { trackStock: true, available: 8 }]])
  );
  expect(manuallyPaused).toMatchObject({
    status: "sold-out",
    stockTracked: true,
    immediateBoxAvailable: false,
    flavors: [{ name: "Con stock", status: "available", stockTracked: true }]
  });

  const partiallyTracked = {
    status: "available",
    flavors: [
      { name: "Agotado controlado", status: "available" },
      { name: "Disponible manual", status: "available" },
      { name: "Agotado manual", status: "sold-out" }
    ]
  };
  const candidates = [
    { sku: "builder:fomb:agotado-controlado", flavorName: "Agotado controlado" },
    { sku: "builder:fomb:disponible-manual", flavorName: "Disponible manual" },
    { sku: "builder:fomb:agotado-manual", flavorName: "Agotado manual" }
  ];
  applyPublicBuilderAvailability(partiallyTracked, candidates, new Map([
    ["builder:fomb:agotado-controlado", { trackStock: true, available: 0 }],
    ["builder:fomb:disponible-manual", { trackStock: false, available: 0 }],
    ["builder:fomb:agotado-manual", { trackStock: false, available: 20 }]
  ]));
  expect(partiallyTracked).toMatchObject({
    status: "available",
    stockTracked: false,
    flavors: [
      { name: "Agotado controlado", status: "sold-out", stockTracked: true },
      { name: "Disponible manual", status: "available", stockTracked: false },
      { name: "Agotado manual", status: "sold-out", stockTracked: false }
    ]
  });

  const partiallyAvailable = {
    status: "available",
    flavors: [{ name: "Sin unidades", status: "available" }, { name: "Con unidades", status: "available" }]
  };
  applyPublicBuilderAvailability(
    partiallyAvailable,
    [
      { sku: "builder:fonkies:sin-unidades", flavorName: "Sin unidades" },
      { sku: "builder:fonkies:con-unidades", flavorName: "Con unidades" }
    ],
    new Map([
      ["builder:fonkies:sin-unidades", { trackStock: true, available: 0 }],
      ["builder:fonkies:con-unidades", { trackStock: true, available: 3 }]
    ])
  );
  expect(partiallyAvailable.status).toBe("available");
  expect(partiallyAvailable.stockTracked).toBe(true);
  expect(partiallyAvailable.immediateBoxAvailable).toBe(false);
  expect(partiallyAvailable.flavors.map(flavor => flavor.status)).toEqual(["sold-out", "available"]);
  expect(partiallyAvailable.flavors.map(flavor => flavor.inventoryKey)).toEqual(["sin-unidades", "con-unidades"]);

  applyPublicBuilderAvailability(
    partiallyAvailable,
    [
      { sku: "builder:fonkies:sin-unidades", flavorName: "Sin unidades" },
      { sku: "builder:fonkies:con-unidades", flavorName: "Con unidades" }
    ],
    new Map([
      ["builder:fonkies:sin-unidades", { trackStock: true, available: 1 }],
      ["builder:fonkies:con-unidades", { trackStock: true, available: 3 }]
    ])
  );
  expect(partiallyAvailable.immediateBoxAvailable).toBe(true);

  const fombMinimum = {
    status: "available",
    sizes: [{ quantity: 12, price: 30 }, { quantity: 4, price: 15 }],
    flavors: [{ name: "A", status: "available" }, { name: "B", status: "available" }]
  };
  const fombCandidates = [
    { sku: "builder:fomb:a", flavorName: "A" },
    { sku: "builder:fomb:b", flavorName: "B" }
  ];
  const fombInventory = new Map([
    ["builder:fomb:a", { trackStock: true, available: 2 }],
    ["builder:fomb:b", { trackStock: true, available: 2 }]
  ]);
  applyPublicBuilderAvailability(fombMinimum, fombCandidates, fombInventory);
  expect(fombMinimum.immediateBoxAvailable).toBe(true);
  fombMinimum.temporarilyUnavailable = true;
  applyPublicBuilderAvailability(fombMinimum, fombCandidates, fombInventory);
  expect(fombMinimum.immediateBoxAvailable).toBe(false);

  const completelyDepleted = {
    status: "available",
    flavors: [{ name: "A", status: "available" }, { name: "B", status: "available" }]
  };
  applyPublicBuilderAvailability(
    completelyDepleted,
    [
      { sku: "builder:fonkies:a", flavorName: "A" },
      { sku: "builder:fonkies:b", flavorName: "B" }
    ],
    new Map([
      ["builder:fonkies:a", { trackStock: true, available: 0 }],
      ["builder:fonkies:b", { trackStock: true, available: 0 }]
    ])
  );
  expect(completelyDepleted.status).toBe("sold-out");
  expect(completelyDepleted.stockTracked).toBe(true);
  expect(completelyDepleted.immediateBoxAvailable).toBe(false);

  const excludedPolicies = {
    availabilityMode: "available",
    status: "available",
    allowPreorder: false,
    minimumQuantity: 4,
    flavors: [
      { name: "Agotado manual", inventoryKey: "agotado-manual", availabilityMode: "sold-out", status: "sold-out" },
      { name: "Disponible sin unidades", inventoryKey: "disponible-cero", availabilityMode: "available", status: "available" }
    ]
  };
  applyPublicBuilderAvailability(
    excludedPolicies,
    [
      { sku: "builder:fonkies:agotado-manual", flavorName: "Agotado manual", inventoryKey: "agotado-manual" },
      { sku: "builder:fonkies:disponible-cero", flavorName: "Disponible sin unidades", inventoryKey: "disponible-cero" }
    ],
    new Map([
      ["builder:fonkies:agotado-manual", { trackStock: true, available: 4 }],
      ["builder:fonkies:disponible-cero", { trackStock: true, available: 0 }]
    ])
  );
  expect(excludedPolicies).toMatchObject({
    status: "sold-out",
    immediate: false,
    immediateBoxAvailable: false,
    flavors: [
      { availabilityMode: "sold-out", status: "sold-out" },
      { availabilityMode: "available", status: "sold-out" }
    ]
  });
});

test("un sabor agotado prevalece sobre el preorden general", async () => {
  const { builderFlavorPreorderAllowed } = await import("../backend/src/public-availability.mjs");
  const builder = { availabilityMode:"preorder", status:"sold-out", allowPreorder:true };
  expect(builderFlavorPreorderAllowed(builder, { availabilityMode:"sold-out", status:"sold-out" })).toBe(false);
  expect(builderFlavorPreorderAllowed(builder, { availabilityMode:"available", status:"available" })).toBe(true);

  const { execFileSync } = require("node:child_process");
  const { resolve } = require("node:path");
  const { pathToFileURL } = require("node:url");
  const workerUrl = pathToFileURL(resolve(__dirname, "../backend/src/worker.js")).href;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { resolveReservationCart, resolveStockChecks } from ${JSON.stringify(workerUrl)};
    const state = {products:[],builders:{fonkies:{
      visible:true,availabilityMode:"preorder",status:"sold-out",allowPreorder:true,
      requiresElectricity:false,minimumQuantity:4,singlePrice:15,mixedPrice:17,extraPrice:3.5,
      flavors:[{name:"No vender",inventoryKey:"no-vender",availabilityMode:"sold-out",status:"sold-out",allowPreorder:false}]
    }}};
    const operations = {electricityEnabled:true};
    const requested = [{kind:"fonkies",quantity:1,preorder:true,flavors:[{name:"No vender",inventoryKey:"no-vender",quantity:4}]}];
    let reserveError = "";
    let validateError = "";
    try { resolveReservationCart(state, requested, operations); } catch (error) { reserveError = error.message; }
    try { resolveStockChecks(state, [{kind:"fonkies",flavor:"No vender",inventoryKey:"no-vender",quantity:4,preorder:true}], operations); } catch (error) { validateError = error.message; }
    process.stdout.write(JSON.stringify({reserveError,validateError}));
  `], {cwd:resolve(__dirname,".."),encoding:"utf8",env:{...process.env,NODE_NO_WARNINGS:"1"}}));
  expect(result).toEqual({reserveError:"unavailable_product",validateError:"unavailable_product"});
});

test("un sabor disponible explícito no hereda el preorden legacy al agotarse", async () => {
  const { applyPublicBuilderAvailability } = await import("../backend/src/public-availability.mjs");
  const builder = {
    status: "available",
    allowPreorder: true,
    minimumQuantity: 4,
    flavors: [{
      name: "Pistacho",
      inventoryKey: "pistacho",
      availabilityMode: "available",
      status: "available"
    }]
  };
  const candidates = [{
    sku: "builder:fomb:pistacho",
    flavorName: "Pistacho",
    inventoryKey: "pistacho"
  }];
  const inventory = new Map([["builder:fomb:pistacho", { trackStock: true, available: 0 }]]);

  applyPublicBuilderAvailability(builder, candidates, inventory);

  expect(builder.flavors[0]).toMatchObject({
    availabilityMode: "available",
    status: "sold-out",
    allowPreorder: false,
    immediate: false
  });
  expect(builder.immediateBoxAvailable).toBe(false);
});

test("un builder queda agotado cuando todos sus sabores se desactivan aunque el stock no esté controlado", async () => {
  const { applyPublicBuilderAvailability } = await import("../backend/src/public-availability.mjs");
  const builder = {
    availabilityMode:"available",
    status:"available",
    minimumQuantity:4,
    flavors:[
      {name:"Uno",inventoryKey:"uno",availabilityMode:"sold-out",status:"sold-out"},
      {name:"Dos",inventoryKey:"dos",availabilityMode:"sold-out",status:"sold-out"}
    ]
  };
  const candidates = [
    {sku:"builder:fonkies:uno",flavorName:"Uno",inventoryKey:"uno"},
    {sku:"builder:fonkies:dos",flavorName:"Dos",inventoryKey:"dos"}
  ];
  const inventory = new Map([
    ["builder:fonkies:uno",{trackStock:false,available:8}],
    ["builder:fonkies:dos",{trackStock:false,available:8}]
  ]);

  applyPublicBuilderAvailability(builder,candidates,inventory);

  expect(builder).toMatchObject({availabilityMode:"available",status:"sold-out",stockTracked:false,immediate:false,immediateBoxAvailable:false});

  const emptyBuilder = {availabilityMode:"available",status:"available",minimumQuantity:4,flavors:[]};
  applyPublicBuilderAvailability(emptyBuilder,[],new Map());
  expect(emptyBuilder).toMatchObject({availabilityMode:"available",status:"sold-out",immediate:false,immediateBoxAvailable:false});
});

test("la reserva exige dos días y solo reutiliza una solicitud idéntica y activa", async () => {
  const { execFileSync } = require("node:child_process");
  const { resolve } = require("node:path");
  const { pathToFileURL } = require("node:url");
  const workerUrl = pathToFileURL(resolve(__dirname, "../backend/src/worker.js")).href;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { minimumPreorderDate, preorderDateViolation, reservationCanBeReused, reservationPayloadIdentity, reservationReplay } from ${JSON.stringify(workerUrl)};
    const now = new Date("2026-09-01T12:00:00Z");
    const items = [{kind:"product",productId:"torta",quantity:1,size:"",variant:"",preorder:true}];
    const customer = {name:"Ana",phone:"04120000000",fulfillment:"Pickup",requestedDate:"2026-09-03",paymentMethod:"Pago móvil",address:"",allergySummary:"",birthdayCandle:"",notes:""};
    const snapshotJson = JSON.stringify({items,customer});
    const active = {status:"reserved",expiresAt:Math.floor(now.getTime()/1000)+60,snapshotJson};
    const expired = {...active,expiresAt:Math.floor(now.getTime()/1000)-1};
    const renamedRequest = [{kind:"fomb",quantity:1,boxSize:4,extraCount:0,preorder:false,flavors:[{inventoryKey:" pistacho ",name:"Nombre anterior",quantity:4,preorder:false}]}];
    const renamedSnapshot = [{kind:"fomb",quantity:1,boxSize:4,extraCount:0,preorder:false,flavors:[{inventoryKey:"pistacho",name:"Nombre nuevo",quantity:4,preorder:false}]}];
    const legacyRequest = [{kind:"fomb",quantity:1,preorder:true,flavors:[{inventoryKey:"",name:"Pistacho",quantity:4,preorder:true}]}];
    const canonicalLegacySnapshot = [{kind:"fomb",quantity:1,boxSize:4,extraCount:0,preorder:false,flavors:[{inventoryKey:"pistacho",name:"Pistacho",quantity:4,preorder:false}]}];
    const canonicalizedSnapshotJson = JSON.stringify({items:canonicalLegacySnapshot,customer,requestIdentity:reservationPayloadIdentity(legacyRequest,customer)});
    const overnightSnapshot = JSON.stringify({items,customer:{...customer,requestedDate:"2026-09-03"}});
    process.stdout.write(JSON.stringify({
      minimum:minimumPreorderDate(now),
      tomorrow:preorderDateViolation(items,"2026-09-02",now),
      valid:preorderDateViolation(items,"2026-09-03",now),
      sameIdentity:reservationPayloadIdentity(items,customer)===reservationPayloadIdentity([...items],{...customer}),
      activeSame:reservationCanBeReused(active,{items,customer},now),
      activeChanged:reservationCanBeReused(active,{items:[{...items[0],quantity:2}],customer},now),
      expiredSame:reservationCanBeReused(expired,{items,customer},now),
      confirmedSame:reservationCanBeReused({...active,status:"confirmed"},{items,customer},now),
      renamedStableKey:reservationPayloadIdentity(renamedRequest,customer)===reservationPayloadIdentity(renamedSnapshot,customer),
      rawRequestSurvivesCanonicalization:reservationCanBeReused({status:"reserved",expiresAt:Math.floor(now.getTime()/1000)+60,snapshotJson:canonicalizedSnapshotJson},{items:legacyRequest,customer},now),
      crossesMidnight:reservationCanBeReused({status:"reserved",expiresAt:Math.floor(Date.parse("2026-09-02T04:06:00Z")/1000),snapshotJson:overnightSnapshot},{items,customer:{...customer,requestedDate:"2026-09-03"}},new Date("2026-09-02T04:05:00Z")),
      raceReplay:reservationReplay({...active,id:"order-1",orderCode:"FNT-1",totalCents:1200},{items,customer},now)
    }));
  `], {cwd:resolve(__dirname,".."),encoding:"utf8",env:{...process.env,NODE_NO_WARNINGS:"1"}}));
  expect(result).toEqual({
    minimum:"2026-09-03",
    tomorrow:"2026-09-03",
    valid:"",
    sameIdentity:true,
    activeSame:true,
    activeChanged:false,
    expiredSame:false,
    confirmedSame:false,
    renamedStableKey:true,
    rawRequestSurvivesCanonicalization:true,
    crossesMidnight:true,
    raceReplay:{
      status:200,
      payload:expect.objectContaining({ok:true,id:"order-1",orderCode:"FNT-1",totalCents:1200,reused:true})
    }
  });
});

test("las claves estables conservan SKU y el catálogo rechaza colisiones", async () => {
  const {
    builderFlavorInventoryKey,
    deriveBuilderInventoryDefinitions,
    newlyIntroducedBuilderInventorySkus,
    validateBuilderInventoryIdentity
  } = await import("../backend/src/public-availability.mjs");

  const state = {
    products: [],
    builders: {
      fonkies: {
        status: "available",
        flavors: [
          { name: "Nombre nuevo", inventoryKey: "nombre-original", stockQuantity: 99, status: "available" },
          { name: "Café", inventoryKey: "cafe-estable", status: "available" }
        ]
      },
      fomb: { status: "available", flavors: [] }
    }
  };
  expect(validateBuilderInventoryIdentity("fonkies", state.builders.fonkies)).toBe("");
  expect(builderFlavorInventoryKey(state.builders.fonkies.flavors[0])).toBe("nombre-original");
  expect(builderFlavorInventoryKey(state.builders.fonkies.flavors[1])).toBe("cafe-estable");
  expect(deriveBuilderInventoryDefinitions(state).filter(item => item.kind === "fonkies")).toEqual([
    expect.objectContaining({
      sku: "builder:fonkies:nombre-original",
      inventoryKey: "nombre-original",
      sourceQuantity: null
    }),
    expect.objectContaining({
      sku: "builder:fonkies:cafe-estable",
      inventoryKey: "cafe-estable",
      sourceQuantity: null
    })
  ]);

  const renamed = structuredClone(state);
  renamed.builders.fonkies.flavors[0].name = "Otro nombre";
  expect(deriveBuilderInventoryDefinitions(renamed).find(item => item.flavorName === "Otro nombre").sku)
    .toBe("builder:fonkies:nombre-original");

  const duplicateName = structuredClone(state);
  duplicateName.builders.fonkies.flavors.push({ name: "nombre NUEVO", inventoryKey: "otra-clave" });
  expect(validateBuilderInventoryIdentity("fonkies", duplicateName.builders.fonkies)).toContain("está repetido");

  const legacyCatalog = structuredClone(state);
  delete legacyCatalog.builders.fonkies.flavors[1].inventoryKey;
  expect(builderFlavorInventoryKey(legacyCatalog.builders.fonkies.flavors[1])).toBe("cafe");
  expect(deriveBuilderInventoryDefinitions(legacyCatalog).find(item => item.flavorName === "Café").sku)
    .toBe("builder:fonkies:cafe");
  expect(validateBuilderInventoryIdentity("fonkies", legacyCatalog.builders.fonkies)).toContain("necesita una clave estable");

  const migratedLegacyCatalog = structuredClone(legacyCatalog);
  migratedLegacyCatalog.builders.fonkies.flavors[1].inventoryKey = "cafe";
  expect(newlyIntroducedBuilderInventorySkus(legacyCatalog, migratedLegacyCatalog)).toEqual([]);

  const hiddenCatalog = structuredClone(state);
  hiddenCatalog.builders.fonkies.visible = false;
  expect(newlyIntroducedBuilderInventorySkus(hiddenCatalog, state)).toEqual([]);

  const flavorRemoved = structuredClone(state);
  flavorRemoved.builders.fonkies.flavors = flavorRemoved.builders.fonkies.flavors.slice(0, 1);
  expect(newlyIntroducedBuilderInventorySkus(flavorRemoved, state)).toEqual([
    "builder:fonkies:cafe-estable"
  ]);

  const duplicateExplicitKey = structuredClone(state);
  duplicateExplicitKey.builders.fonkies.flavors.push({ name: "Distinto", inventoryKey: "nombre-original" });
  expect(validateBuilderInventoryIdentity("fonkies", duplicateExplicitKey.builders.fonkies)).toContain("clave de inventario nombre-original está repetida");

  const invalidKey = structuredClone(state);
  invalidKey.builders.fonkies.flavors[0].inventoryKey = "Clave con espacios";
  expect(validateBuilderInventoryIdentity("fonkies", invalidKey.builders.fonkies)).toContain("no es válida");
});

test("las solicitudes con inventoryKey resuelven estrictamente la identidad vigente", async () => {
  const { resolveBuilderFlavorSelection } = await import("../backend/src/public-availability.mjs");
  const builder = {
    flavors: [
      { name: "Nombre actual", inventoryKey: "sabor-estable", status: "available" },
      { name: "Nombre reciclado", inventoryKey: "sabor-nuevo", status: "available" },
      { name: "Legado", status: "available" }
    ]
  };

  expect(resolveBuilderFlavorSelection(
    builder,
    { name: "Nombre anterior", inventoryKey: "sabor-estable" },
    "Nombre anterior"
  )).toMatchObject({
    name: "Nombre actual",
    inventoryKey: "sabor-estable",
    flavor: { name: "Nombre actual", inventoryKey: "sabor-estable" }
  });

  expect(resolveBuilderFlavorSelection(
    builder,
    { name: "Nombre reciclado", inventoryKey: "sabor-eliminado" },
    "Nombre reciclado"
  )).toBeNull();

  expect(resolveBuilderFlavorSelection(builder, {}, "Nombre reciclado")).toMatchObject({
    name: "Nombre reciclado",
    inventoryKey: "sabor-nuevo"
  });
  expect(resolveBuilderFlavorSelection(builder, {}, "Legado")).toMatchObject({
    name: "Legado",
    inventoryKey: "legado"
  });
});

test("validate y reserve usan inventoryKey y guardan la identidad actual en el snapshot", async () => {
  const { execFileSync } = require("node:child_process");
  const { resolve } = require("node:path");
  const { pathToFileURL } = require("node:url");
  const workerUrl = pathToFileURL(resolve(__dirname, "../backend/src/worker.js")).href;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { resolveReservationCart, resolveStockChecks } from ${JSON.stringify(workerUrl)};
    const state = {
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
          flavors: [
            { name: "Nombre actual", inventoryKey: "sabor-estable", status: "available" },
            { name: "Nombre reciclado", inventoryKey: "sabor-nuevo", status: "available" }
          ]
        }
      }
    };
    const operations = { electricityEnabled: true };
    const checks = resolveStockChecks(state, [{
      kind: "fonkies", flavor: "Nombre anterior", inventoryKey: "sabor-estable", quantity: 2
    }], operations);
    const cart = resolveReservationCart(state, [{
      kind: "fonkies",
      quantity: 1,
      flavors: [{ name: "Nombre anterior", inventoryKey: "sabor-estable", quantity: 4 }]
    }], operations);
    let strictCheck = false;
    try {
      resolveStockChecks(state, [{
        kind: "fonkies", flavor: "Nombre reciclado", inventoryKey: "sabor-eliminado", quantity: 1
      }], operations);
    } catch (error) {
      strictCheck = error.message === "invalid_option";
    }
    let strictReserve = false;
    try {
      resolveReservationCart(state, [{
        kind: "fonkies",
        quantity: 1,
        flavors: [{ name: "Nombre reciclado", inventoryKey: "sabor-eliminado", quantity: 4 }]
      }], operations);
    } catch (error) {
      strictReserve = error.message === "invalid_option";
    }
    process.stdout.write(JSON.stringify({
      check: checks[0],
      snapshotFlavors: cart.snapshotItems[0].flavors,
      demand: cart.demands[0],
      strictCheck,
      strictReserve
    }));
  `], {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" }
  }));

  expect(result.check).toEqual(expect.objectContaining({
    quantity: 2,
    definition: expect.objectContaining({
      sku: "builder:fonkies:sabor-estable",
      flavorName: "Nombre actual",
      inventoryKey: "sabor-estable"
    })
  }));
  expect(result.snapshotFlavors).toEqual([{
    name: "Nombre actual",
    inventoryKey: "sabor-estable",
    quantity: 4,
    imageUrl: "",
    preorder: false
  }]);
  expect(result.demand).toEqual(expect.objectContaining({
    quantity: 4,
    definition: expect.objectContaining({ sku: "builder:fonkies:sabor-estable" })
  }));
  expect(result.strictCheck).toBe(true);
  expect(result.strictReserve).toBe(true);
});
