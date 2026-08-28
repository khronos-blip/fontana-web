function inventoryResult(candidates, inventory) {
  if (!candidates.length) return { tracked: false, available: null };
  const rows = candidates.map(item => inventory.get(item.sku));
  const tracked = rows.every(row => row?.trackStock === true);
  return {
    tracked,
    available: tracked ? rows.some(row => Number(row.available) > 0) : null
  };
}

export function applyPublicBuilderAvailability(builder, candidates, inventory) {
  const builderResult = inventoryResult(candidates, inventory);
  builder.stockTracked = builderResult.tracked;
  if (builderResult.available !== null) {
    builder.status = builderResult.available ? "available" : "sold-out";
  }

  for (const flavor of builder.flavors || []) {
    const flavorCandidates = candidates.filter(item => item.flavorName === flavor.name);
    const flavorResult = inventoryResult(flavorCandidates, inventory);
    flavor.stockTracked = flavorResult.tracked;
    if (flavorResult.available !== null) {
      flavor.status = flavorResult.available ? "available" : "sold-out";
    }
    delete flavor.stockQuantity;
  }
  delete builder.stockQuantity;
  return builder;
}
