const INVENTORY_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,69})$/;

function stockSlug(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || "base";
}

export function builderFlavorInventoryKey(flavor) {
  const configured = String(flavor?.inventoryKey || "").trim();
  return configured || stockSlug(flavor?.name);
}

export function resolveBuilderFlavorSelection(builder, requested, legacyName = "") {
  const requestedKey = String(requested?.inventoryKey || "").trim();
  const flavors = Array.isArray(builder?.flavors) ? builder.flavors : [];
  const flavor = requestedKey
    ? flavors.find(item => builderFlavorInventoryKey(item) === requestedKey)
    : flavors.find(item => item.name === String(legacyName || ""));
  if (!flavor) return null;
  return {
    flavor,
    name: String(flavor.name || ""),
    inventoryKey: builderFlavorInventoryKey(flavor)
  };
}

export function deriveBuilderInventoryDefinitions(state, { includeHidden = false } = {}) {
  const definitions = [];
  for (const kind of ["fonkies", "fomb"]) {
    const builder = state?.builders?.[kind];
    if (!builder || (!includeHidden && builder.visible === false)) continue;
    for (const flavor of builder.flavors || []) {
      const inventoryKey = builderFlavorInventoryKey(flavor);
      definitions.push({
        sku: `builder:${kind}:${inventoryKey}`,
        productId: kind === "fonkies" ? "fonkie-box" : "fomb-box",
        kind,
        label: kind === "fonkies" ? "Fonkies" : "Fomb",
        optionSummary: flavor.name,
        flavorName: flavor.name,
        inventoryKey,
        // Builder quantities are managed exclusively by inventory_items.
        // Legacy catalog stockQuantity is never a live inventory writer.
        sourceQuantity: null
      });
    }
  }
  return definitions;
}

export function newlyIntroducedBuilderInventorySkus(previousState, nextState) {
  const previousSkus = new Set(
    deriveBuilderInventoryDefinitions(previousState, { includeHidden: true }).map(item => item.sku)
  );
  return deriveBuilderInventoryDefinitions(nextState, { includeHidden: true })
    .map(item => item.sku)
    .filter(sku => !previousSkus.has(sku));
}

export function validateBuilderInventoryIdentity(kind, builder) {
  const title = kind === "fonkies" ? "Fonkies" : "Fomb";
  if (!Array.isArray(builder?.flavors)) return `Falta la lista de sabores de ${title}`;
  const flavorNames = new Set();
  const inventoryKeys = new Set();
  for (const flavor of builder.flavors) {
    if (!flavor || typeof flavor !== "object") return `Hay un sabor inválido en ${title}`;
    const name = String(flavor.name || "").trim();
    if (!name) return `Todos los sabores de ${title} necesitan nombre`;
    const comparableName = name.normalize("NFC").toLocaleLowerCase("es-VE");
    if (flavorNames.has(comparableName)) return `El sabor ${name} está repetido en ${title}`;
    flavorNames.add(comparableName);
    const configuredKey = String(flavor.inventoryKey || "").trim();
    // Runtime keeps the slug fallback above so an already-published legacy
    // catalog remains readable. Every new save must persist an immutable key.
    if (!configuredKey) return `El sabor ${name} necesita una clave estable de inventario`;
    if (!INVENTORY_KEY_PATTERN.test(configuredKey)) return `La clave de inventario de ${name} no es válida`;
    if (inventoryKeys.has(configuredKey)) return `La clave de inventario ${configuredKey} está repetida en ${title}`;
    inventoryKeys.add(configuredKey);
  }
  return "";
}

function inventoryResult(candidates, inventory) {
  if (!candidates.length) return { tracked: false, available: null };
  const rows = candidates.map(item => inventory.get(item.sku));
  const tracked = rows.every(row => row?.trackStock === true);
  return {
    tracked,
    available: tracked ? rows.some(row => Number(row.available) > 0) : null
  };
}

export function applyPublicProductAvailability(product, candidates, inventory) {
  const productResult = inventoryResult(candidates, inventory);
  product.stockTracked = productResult.tracked;
  if (productResult.available !== null) {
    product.status = productResult.available ? "available" : "sold-out";
  }
  for (const variant of product.variants || []) {
    const variantResult = inventoryResult(
      candidates.filter(item => item.variantName === variant.name),
      inventory
    );
    variant.stockTracked = variantResult.tracked;
    if (variantResult.available !== null) {
      variant.status = variantResult.available ? "available" : "sold-out";
    }
    delete variant.stockQuantity;
  }
  for (const size of product.sizes || []) {
    const sizeResult = inventoryResult(
      candidates.filter(item => item.sizeName === size.name),
      inventory
    );
    size.stockTracked = sizeResult.tracked;
    if (sizeResult.available !== null) {
      size.status = sizeResult.available ? "available" : "sold-out";
    }
    delete size.stockQuantity;
  }
  delete product.stockQuantity;
  return product;
}

export function applyPublicBuilderAvailability(builder, candidates, inventory) {
  const manuallyPaused = builder.status === "sold-out";
  const builderResult = inventoryResult(candidates, inventory);
  builder.stockTracked = builderResult.tracked;
  const configuredMinimum = Number(builder.minimumQuantity);
  const sizeMinimums = (Array.isArray(builder.sizes) ? builder.sizes : [])
    .map(size => Number(size?.quantity))
    .filter(quantity => Number.isInteger(quantity) && quantity > 0);
  const minimumQuantity = Number.isInteger(configuredMinimum) && configuredMinimum > 0
    ? configuredMinimum
    : (sizeMinimums.length ? Math.min(...sizeMinimums) : 4);
  const trackedAvailableUnits = [...new Set(candidates.map(item => item.sku))]
    .map(sku => inventory.get(sku))
    .filter(row => row?.trackStock === true)
    .reduce((sum, row) => sum + Math.max(0, Number(row.available) || 0), 0);
  builder.immediateBoxAvailable = !manuallyPaused
    && builder.temporarilyUnavailable !== true
    && trackedAvailableUnits >= minimumQuantity;
  // A manual builder pause always wins. Otherwise the aggregate state is
  // derived only when every flavor has live inventory control. A partially
  // tracked builder keeps its manual "available" state while each flavor
  // publishes its own effective availability below.
  if (!manuallyPaused && builderResult.available !== null) {
    builder.status = builderResult.available ? "available" : "sold-out";
  }

  for (const flavor of builder.flavors || []) {
    const flavorCandidates = candidates.filter(item => item.flavorName === flavor.name);
    const flavorResult = inventoryResult(flavorCandidates, inventory);
    flavor.inventoryKey = builderFlavorInventoryKey(flavor);
    flavor.stockTracked = flavorResult.tracked;
    if (flavorResult.available !== null) {
      flavor.status = flavorResult.available ? "available" : "sold-out";
    }
    delete flavor.stockQuantity;
  }
  delete builder.stockQuantity;
  return builder;
}
