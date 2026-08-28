export function resolveFombPricing(builder, selectedTotal) {
  if (!Number.isSafeInteger(selectedTotal) || selectedTotal <= 0) return null;
  const sizes = (Array.isArray(builder?.sizes) ? builder.sizes : [])
    .map(size => ({quantity:Number(size.quantity),price:Number(size.price)}))
    .filter(size => Number.isSafeInteger(size.quantity) && size.quantity > 0 && Number.isFinite(size.price) && size.price >= 0)
    .sort((left, right) => left.quantity - right.quantity);
  const eligible = sizes.filter(size => size.quantity <= selectedTotal);
  const size = eligible[eligible.length - 1];
  if (!size) return null;
  const extraCount = selectedTotal - size.quantity;
  const configuredExtraPrice = Number(builder.extraPrice ?? 3.5);
  const extraPrice = Number.isFinite(configuredExtraPrice) && configuredExtraPrice >= 0
    ? configuredExtraPrice
    : 3.5;
  const unitPriceCents = Math.round((size.price + extraCount * extraPrice) * 100);
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) return null;
  return {
    boxSize:size.quantity,
    extraCount,
    unitPriceCents
  };
}

export function fombPricingMatchesRequest(pricing, requested = {}) {
  const supplied = requested.boxSize !== undefined || requested.extraCount !== undefined;
  if (!supplied) return true;
  const boxSize = Number(requested.boxSize);
  const extraCount = Number(requested.extraCount);
  return Boolean(pricing)
    && Number.isSafeInteger(boxSize)
    && Number.isSafeInteger(extraCount)
    && boxSize === pricing.boxSize
    && extraCount === pricing.extraCount;
}
