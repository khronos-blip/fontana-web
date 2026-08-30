export const BCV_RATE_SCALE = 8;
export const SUPPORTED_PAYMENT_CURRENCIES = new Set(["VES", "USD", "EUR"]);
export const SUPPORTED_REFERENCE_CURRENCIES = new Set(["USD", "EUR"]);

export function isIsoDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function caracasDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const read = type => parts.find(part => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function rateValueDateAllowed(requestedDate,valueDate,{maxPastDays=3,maxFutureDays=3}={}) {
  if(!isIsoDate(requestedDate)||!isIsoDate(valueDate)||!Number.isInteger(maxPastDays)||!Number.isInteger(maxFutureDays)||maxPastDays<0||maxFutureDays<0)return false;
  const day=86_400_000;
  const requested=Date.parse(`${requestedDate}T00:00:00Z`);
  const value=Date.parse(`${valueDate}T00:00:00Z`);
  const delta=(value-requested)/day;
  return Number.isInteger(delta)&&delta>=-maxPastDays&&delta<=maxFutureDays;
}

export function normalizePhone(value) {
  let digits = String(value || "").trim().replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Formatos venezolanos habituales: 0412..., 412... y 58 412...
  if (/^0\d{10}$/.test(digits)) digits = `58${digits.slice(1)}`;
  else if (/^4\d{9}$/.test(digits)) digits = `58${digits}`;
  if (!/^\d{8,15}$/.test(digits)) return "";
  return `+${digits}`;
}

export function decimalToScaledInteger(value, scale, { allowZero = false } = {}) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) return null;
  let text = String(value ?? "").trim().replace(/\s+/g, "");
  if (!text || text.startsWith("-") || /[eE]/.test(text)) return null;
  if (text.includes(",") && text.includes(".")) {
    const decimalSeparator = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? /\./g : /,/g;
    text = text.replace(groupingSeparator, "").replace(decimalSeparator, ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > scale) return null;
  const scaledText = `${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "");
  const scaled = BigInt(scaledText || "0");
  if ((!allowZero && scaled <= 0n) || scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(scaled);
}

export function validScaledInteger(value, { allowZero = false } = {}) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) return null;
  if (allowZero ? number < 0 : number <= 0) return null;
  return number;
}

export function paymentScale(currency, requestedScale) {
  const normalized = String(currency || "").toUpperCase();
  if (!SUPPORTED_PAYMENT_CURRENCIES.has(normalized)) return 0;
  const expected = 2;
  return Number(requestedScale ?? expected) === expected ? expected : 0;
}

function roundedDivide(numerator, denominator) {
  if (denominator <= 0n) throw new Error("invalid_denominator");
  return (numerator + denominator / 2n) / denominator;
}

export function referenceCentsForPayment({
  amountMinor,
  amountScale,
  currency,
  referenceCurrency,
  rateBasis,
  rateScaled
}) {
  const amount = validScaledInteger(amountMinor);
  const scale = paymentScale(currency, amountScale);
  const paidCurrency = String(currency || "").toUpperCase();
  const reference = String(referenceCurrency || "").toUpperCase();
  if (!amount || !scale || !SUPPORTED_REFERENCE_CURRENCIES.has(reference)) return null;
  let result;
  if (paidCurrency === "VES") {
    const basis = String(rateBasis || "").toUpperCase();
    const rate = validScaledInteger(rateScaled);
    if (!rate || basis !== reference) return null;
    result = roundedDivide(
      BigInt(amount) * 100n * (10n ** BigInt(BCV_RATE_SCALE)),
      (10n ** BigInt(scale)) * BigInt(rate)
    );
  } else {
    const compatible = paidCurrency === reference;
    if (!compatible) return null;
    result = roundedDivide(BigInt(amount) * 100n, 10n ** BigInt(scale));
  }
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}

export function functionalUsdCentsForPayment({
  amountMinor,
  amountScale,
  currency,
  usdRateScaled,
  eurRateScaled
}) {
  const amount = validScaledInteger(amountMinor);
  const scale = paymentScale(currency, amountScale);
  const paidCurrency = String(currency || "").toUpperCase();
  if (!amount || !scale) return null;
  let result;
  if (paidCurrency === "USD") {
    result = roundedDivide(BigInt(amount) * 100n, 10n ** BigInt(scale));
  } else if (paidCurrency === "VES") {
    const usdRate = validScaledInteger(usdRateScaled);
    if (!usdRate) return null;
    result = roundedDivide(
      BigInt(amount) * 100n * (10n ** BigInt(BCV_RATE_SCALE)),
      (10n ** BigInt(scale)) * BigInt(usdRate)
    );
  } else if (paidCurrency === "EUR") {
    const usdRate = validScaledInteger(usdRateScaled);
    const eurRate = validScaledInteger(eurRateScaled);
    if (!usdRate || !eurRate) return null;
    result = roundedDivide(BigInt(amount) * BigInt(eurRate), BigInt(usdRate));
  } else return null;
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}

export function functionalUsdCentsForReference({ referenceAmountCents, referenceCurrency, usdRateScaled, eurRateScaled }) {
  const amount = validScaledInteger(referenceAmountCents, { allowZero: true });
  const currency = String(referenceCurrency || "").toUpperCase();
  if (amount === null || !SUPPORTED_REFERENCE_CURRENCIES.has(currency)) return null;
  if (currency === "USD") return amount;
  const usdRate = validScaledInteger(usdRateScaled);
  const eurRate = validScaledInteger(eurRateScaled);
  if (!usdRate || !eurRate) return null;
  const result = roundedDivide(BigInt(amount) * BigInt(eurRate), BigInt(usdRate));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}

export function derivePaymentStatus(totalRefCents, paidRefCents) {
  const total = validScaledInteger(totalRefCents, { allowZero: true });
  const paid = validScaledInteger(paidRefCents, { allowZero: true });
  if (total === null || paid === null) return null;
  if (paid === 0) return { status: "unpaid", balanceRefCents: total, overpaymentRefCents: 0 };
  if (paid < total) return { status: "partial", balanceRefCents: total - paid, overpaymentRefCents: 0 };
  return { status: "paid", balanceRefCents: 0, overpaymentRefCents: paid - total };
}

export function deriveSettlementAllocation({
  saleTotalReferenceCents,
  saleFunctionalTotalCents,
  paidBeforeReferenceCents,
  paymentReferenceCents,
  paymentFunctionalCents
}) {
  const totalRef=validScaledInteger(saleTotalReferenceCents);
  const totalFunctional=validScaledInteger(saleFunctionalTotalCents);
  const beforeRef=validScaledInteger(paidBeforeReferenceCents,{allowZero:true});
  const paymentRef=validScaledInteger(paymentReferenceCents);
  const paymentFunctional=validScaledInteger(paymentFunctionalCents);
  if(!totalRef||!totalFunctional||beforeRef===null||!paymentRef||!paymentFunctional)return null;
  const appliedBefore=Math.min(totalRef,beforeRef);
  const referenceApplied=Math.min(paymentRef,Math.max(0,totalRef-appliedBefore));
  const overpaymentReferenceCents=paymentRef-referenceApplied;
  const carryingBefore=Number(roundedDivide(BigInt(totalFunctional)*BigInt(appliedBefore),BigInt(totalRef)));
  const carryingAfter=Number(roundedDivide(BigInt(totalFunctional)*BigInt(appliedBefore+referenceApplied),BigInt(totalRef)));
  const carryingReceivableCreditCents=carryingAfter-carryingBefore;
  const appliedPaymentFunctionalCents=referenceApplied
    ? Number(roundedDivide(BigInt(paymentFunctional)*BigInt(referenceApplied),BigInt(paymentRef)))
    : 0;
  const customerCreditFunctionalCents=paymentFunctional-appliedPaymentFunctionalCents;
  const fxDifference=appliedPaymentFunctionalCents-carryingReceivableCreditCents;
  return {
    referenceAppliedCents:referenceApplied,
    overpaymentReferenceCents,
    carryingReceivableCreditCents,
    appliedPaymentFunctionalCents,
    customerCreditFunctionalCents,
    fxGainFunctionalCents:Math.max(0,fxDifference),
    fxLossFunctionalCents:Math.max(0,-fxDifference)
  };
}

function htmlSectionRate(html, id) {
  const section = String(html || "").match(new RegExp(`id=["']${id}["'][\\s\\S]{0,1400}?strong-tb["'][^>]*>\\s*([^<]+)`, "i"));
  return section ? decimalToScaledInteger(section[1], BCV_RATE_SCALE) : null;
}

export function parseBcvHtml(html) {
  const source = String(html || "");
  const dateMatch = source.match(/Fecha\s+Valor:[\s\S]{0,500}?content=["'](\d{4}-\d{2}-\d{2})T/i);
  const valueDate = dateMatch?.[1] || "";
  const USD = htmlSectionRate(source, "dolar");
  const EUR = htmlSectionRate(source, "euro");
  if (!isIsoDate(valueDate) || !USD || !EUR) return null;
  return { valueDate, rates: { USD, EUR }, rateScale: BCV_RATE_SCALE };
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
