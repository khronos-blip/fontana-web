import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

import { fombPricingMatchesRequest, resolveFombPricing } from "./pricing.mjs";
import {
  BCV_RATE_SCALE,
  SUPPORTED_PAYMENT_CURRENCIES,
  SUPPORTED_REFERENCE_CURRENCIES,
  canonicalJson,
  caracasDate,
  deriveAccountingAggregates,
  derivePaymentStatus,
  deriveSettlementAllocation,
  functionalUsdCentsForPayment,
  functionalUsdCentsForReference,
  isIsoDate,
  normalizePhone,
  parseBcvHtml,
  paymentScale,
  rateValueDateAllowed,
  referenceCentsForPayment,
  validScaledInteger
} from "./accounting.mjs";
import {
  applyPublicBuilderAvailability,
  applyPublicProductAvailability,
  builderFlavorPreorderAllowed,
  builderFlavorInventoryKey,
  deriveBuilderInventoryDefinitions,
  newlyIntroducedBuilderInventorySkus,
  resolveBuilderFlavorSelection,
  validateBuilderInventoryIdentity
} from "./public-availability.mjs";

const SESSION_COOKIE = "fontana_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60;
const PASSWORD_ITERATIONS = 100000;
const MAX_CATALOG_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RESERVATION_TTL_SECONDS = 30 * 60;
const MAX_ORDER_ITEMS = 40;
const MAX_ITEM_QUANTITY = 100;
const LIQUID_ACCOUNT_IDS = [
  "asset-cash-ves","asset-cash-usd","asset-cash-eur",
  "asset-bank-ves","asset-bank-usd","asset-bank-eur","asset-digital-usd"
];

const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin, allowedOrigins);
    }

    try {
      let response;
      if (url.pathname === "/v1/health" && request.method === "GET") response = json({ ok: true });
      else if (url.pathname === "/v1/catalog" && request.method === "GET") response = await getCatalog(request, env);
      else if (url.pathname.startsWith("/v1/images/") && request.method === "GET") response = await getImage(url, env);
      else if (url.pathname === "/v1/orders/validate" && request.method === "POST") response = await validateOrderStock(request, env);
      else if (url.pathname === "/v1/orders/reserve" && request.method === "POST") response = await reserveOrder(request, env);
      else if (url.pathname === "/v1/setup" && request.method === "POST") response = await setupAdmin(request, env);
      else if (url.pathname === "/v1/auth/login" && request.method === "POST") response = await login(request, env);
      else if (url.pathname === "/v1/auth/passkey/options" && request.method === "POST") response = await passkeyLoginOptions(request, env);
      else if (url.pathname === "/v1/auth/passkey/verify" && request.method === "POST") response = await verifyPasskeyLogin(request, env);
      else if (url.pathname === "/v1/auth/logout" && request.method === "POST") response = await logout(request, env);
      else if (url.pathname === "/v1/auth/session" && request.method === "GET") response = await sessionStatus(request, env);
      else if (url.pathname === "/v1/admin/passkeys/options" && request.method === "POST") response = await passkeyRegistrationOptions(request, env);
      else if (url.pathname === "/v1/admin/passkeys/verify" && request.method === "POST") response = await verifyPasskeyRegistration(request, env);
      else if (url.pathname === "/v1/admin/passkeys" && request.method === "GET") response = await listPasskeys(request, env);
      else if (url.pathname.startsWith("/v1/admin/passkeys/") && request.method === "DELETE") response = await deletePasskey(request, env, url);
      else if (url.pathname === "/v1/admin/users" && request.method === "GET") response = await listUsers(request, env);
      else if (url.pathname === "/v1/admin/users" && request.method === "POST") response = await createUser(request, env);
      else if (url.pathname.startsWith("/v1/admin/users/") && request.method === "DELETE") response = await deactivateUser(request, env, url);
      else if (url.pathname === "/v1/admin/catalog" && request.method === "GET") response = await getAdminCatalog(request, env);
      else if (url.pathname === "/v1/admin/catalog" && request.method === "PUT") response = await putCatalog(request, env);
      else if (url.pathname === "/v1/admin/operations" && request.method === "GET") response = await getAdminOperations(request, env);
      else if (url.pathname === "/v1/admin/operations/electricity" && request.method === "PUT") response = await putElectricityState(request, env);
      else if (url.pathname === "/v1/admin/inventory" && request.method === "GET") response = await getInventory(request, env);
      else if (url.pathname.startsWith("/v1/admin/inventory/") && request.method === "PUT") response = await updateInventory(request, env, url);
      else if (url.pathname === "/v1/admin/orders" && request.method === "GET") response = await listOrders(request, env);
      else if (/^\/v1\/admin\/orders\/[a-f0-9-]{36}\/confirm-payment$/.test(url.pathname) && request.method === "POST") response = await confirmOrderPayment(request, env, url);
      else if (/^\/v1\/admin\/orders\/[a-f0-9-]{36}\/payments$/.test(url.pathname) && request.method === "POST") response = await addOrderPayment(request, env, url);
      else if (url.pathname.startsWith("/v1/admin/orders/") && request.method === "POST") response = await changeOrderStatus(request, env, url);
      else if (url.pathname === "/v1/admin/customers" && request.method === "GET") response = await listCustomers(request, env, url);
      else if (url.pathname.startsWith("/v1/admin/customers/") && request.method === "GET") response = await getCustomer(request, env, url);
      else if (url.pathname === "/v1/admin/exchange-rates" && request.method === "GET") response = await listExchangeRates(request, env, url);
      else if (url.pathname === "/v1/admin/exchange-rates/refresh" && request.method === "POST") response = await forceRefreshExchangeRates(request, env);
      else if (url.pathname === "/v1/admin/exchange-rates/manual" && request.method === "POST") response = await createManualExchangeRate(request, env);
      else if (url.pathname === "/v1/admin/sales" && request.method === "GET") response = await listSales(request, env);
      else if (url.pathname === "/v1/admin/sales" && request.method === "POST") response = await createSale(request, env);
      else if (/^\/v1\/admin\/sales\/[a-f0-9-]{36}\/payments$/.test(url.pathname) && request.method === "POST") response = await addSalePayment(request, env, url);
      else if (/^\/v1\/admin\/sales\/[a-f0-9-]{36}\/void$/.test(url.pathname) && request.method === "POST") response = await voidSale(request, env, url);
      else if (url.pathname.startsWith("/v1/admin/sales/") && request.method === "PUT") response = await updateSale(request, env, url);
      else if (url.pathname.startsWith("/v1/admin/sales/") && request.method === "DELETE") response = await deleteSale(request, env, url);
      else if (url.pathname === "/v1/admin/expenses" && request.method === "GET") response = await listExpenses(request, env, url);
      else if (url.pathname === "/v1/admin/expenses" && request.method === "POST") response = await createExpense(request, env);
      else if (/^\/v1\/admin\/expenses\/[a-f0-9-]{36}\/void$/.test(url.pathname) && request.method === "POST") response = await voidExpense(request, env, url);
      else if (url.pathname === "/v1/admin/accounting/summary" && request.method === "GET") response = await getAccountingSummary(request, env, url);
      else if (url.pathname === "/v1/admin/images" && request.method === "POST") response = await uploadImage(request, env);
      else if (url.pathname === "/v1/admin/activity" && request.method === "GET") response = await getActivity(request, env);
      else response = json({ error: "Ruta no encontrada" }, 404);
      return withCors(response, origin, allowedOrigins);
    } catch (error) {
      console.error(error);
      return withCors(json({ error: "Error interno del servicio" }, 500), origin, allowedOrigins);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(Promise.allSettled([expireReservations(env), refreshBcvRatesIfDue(env)]));
  }
};

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function withCors(response, origin, allowedOrigins) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  if (!origin || !allowedOrigins.has(origin)) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function getCatalog(request, env) {
  const row = await env.DB.prepare("SELECT state_json, revision, updated_at FROM catalog_state WHERE id = 'published'").first();
  if (!row) return json({ configured: false, state: null, revision: 0 }, 200, { "Cache-Control": "no-store" });
  const state = JSON.parse(row.state_json);
  await syncInventoryDefinitions(env, state);
  const inventory = await loadInventoryMap(env);
  const operations = await readOperationalState(env);
  const publicState = applyPublicAvailability(state, inventory, operations);
  const inventoryVersion = [...inventory.values()].reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, "");
  const etag = `\"fontana-${row.revision}-${await shortHash(`${inventoryVersion}:${operations.updatedAt}:${operations.electricityEnabled}`)}\"`;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return json({ configured: true, state: publicState, revision: row.revision, updatedAt: row.updated_at }, 200, {
    "Cache-Control": "no-cache, must-revalidate",
    ETag: etag
  });
}

async function readOperationalState(env) {
  const row = await env.DB.prepare("SELECT electricity_enabled AS electricityEnabled, updated_by AS updatedBy, updated_at AS updatedAt FROM operational_state WHERE id = 'production'").first();
  if (!row) throw new Error("operational_state_missing");
  return { electricityEnabled: Boolean(row.electricityEnabled), updatedBy: row.updatedBy, updatedAt: row.updatedAt };
}

function electricityAffectedCount(state) {
  const products = (state?.products || []).filter(item => !item.deleted && item.visible !== false && item.requiresElectricity === true).length;
  const builders = ["fonkies", "fomb"].filter(kind => state?.builders?.[kind]?.visible !== false && state?.builders?.[kind]?.requiresElectricity === true).length;
  return products + builders;
}

async function getAdminOperations(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const state = await readOperationalState(env);
  const catalog = await publishedState(env);
  return json({ ok: true, ...state, affectedCount: electricityAffectedCount(catalog) }, 200, { "Cache-Control": "no-store" });
}

async function putElectricityState(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const body = await request.json().catch(() => ({}));
  if (typeof body.electricityEnabled !== "boolean") return json({ error: "Estado operativo inválido" }, 400);
  const previous = await readOperationalState(env);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE operational_state SET electricity_enabled = ?, updated_by = ?, updated_at = ? WHERE id = 'production'").bind(body.electricityEnabled ? 1 : 0, session.username, now),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'electricity_state', ?, ?)").bind(session.username, `Electricidad: ${previous.electricityEnabled ? "activa" : "inactiva"} -> ${body.electricityEnabled ? "activa" : "inactiva"}`, now)
  ]);
  const catalog = await publishedState(env);
  return json({ ok: true, electricityEnabled: body.electricityEnabled, updatedBy: session.username, updatedAt: now, affectedCount: electricityAffectedCount(catalog) });
}

function stockSlug(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70) || "base";
}

function deriveInventoryDefinitions(state) {
  const definitions = [];
  for (const product of state?.products || []) {
    if (!product?.id || product.deleted || product.visible === false) continue;
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : [null];
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [null];
    for (const size of sizes) for (const variant of variants) {
      const optionParts = [size?.name, variant?.name].filter(Boolean);
      const skuParts = ["product", product.id, size ? stockSlug(size.name) : "base", variant ? stockSlug(variant.name) : "base"];
      const sourceQuantity = variant?.stockQuantity ?? size?.stockQuantity ?? product.stockQuantity;
      definitions.push({
        sku: skuParts.join(":"), productId: product.id, kind: "product", label: product.name,
        optionSummary: optionParts.join(" · "), sizeName: size?.name || "", variantName: variant?.name || "",
        sourceQuantity: sourceQuantity === null || sourceQuantity === undefined || sourceQuantity === "" ? null : (Number.isFinite(Number(sourceQuantity)) ? Math.max(0, Math.floor(Number(sourceQuantity))) : null)
      });
    }
  }
  definitions.push(...deriveBuilderInventoryDefinitions(state));
  return definitions;
}

async function syncInventoryDefinitions(env, state, actor = "system") {
  const definitions = deriveInventoryDefinitions(state);
  if (!definitions.length) return definitions;
  const now = new Date().toISOString();
  const statements = definitions.flatMap(definition => [
    env.DB.prepare("INSERT OR IGNORE INTO inventory_items (sku, product_id, kind, label, option_summary, on_hand, reserved, track_stock, active, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)")
      .bind(definition.sku, definition.productId, definition.kind, definition.label, definition.optionSummary, definition.sourceQuantity ?? 0, definition.sourceQuantity === null ? 0 : 1, actor, now),
    env.DB.prepare("UPDATE inventory_items SET product_id = ?, kind = ?, label = ?, option_summary = ?, active = 1 WHERE sku = ?")
      .bind(definition.productId, definition.kind, definition.label, definition.optionSummary, definition.sku)
  ]);
  const activeSkus = new Set(definitions.map(item => item.sku));
  const existing = await env.DB.prepare("SELECT sku FROM inventory_items WHERE active = 1").all();
  for (const row of existing.results || []) if (!activeSkus.has(row.sku)) statements.push(env.DB.prepare("UPDATE inventory_items SET active = 0 WHERE sku = ? AND reserved = 0").bind(row.sku));
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
  return definitions;
}

async function loadInventoryMap(env) {
  const result = await env.DB.prepare("SELECT sku, product_id AS productId, kind, label, option_summary AS optionSummary, on_hand AS onHand, reserved, track_stock AS trackStock, active, updated_at AS updatedAt FROM inventory_items WHERE active = 1").all();
  return new Map((result.results || []).map(item => [item.sku, {...item, onHand:Number(item.onHand),reserved:Number(item.reserved),trackStock:Boolean(item.trackStock),available:Math.max(0,Number(item.onHand)-Number(item.reserved))}]));
}

function applyPublicAvailability(state, inventory, operations = { electricityEnabled: true, updatedAt: null }) {
  const publicState = JSON.parse(JSON.stringify(state));
  publicState.operations = { electricityEnabled: Boolean(operations.electricityEnabled), verified: true, updatedAt: operations.updatedAt };
  const definitions = deriveInventoryDefinitions(publicState);
  const byProduct = new Map();
  for (const definition of definitions) {
    if (!byProduct.has(definition.productId)) byProduct.set(definition.productId, []);
    byProduct.get(definition.productId).push(definition);
  }
  for (const product of publicState.products || []) {
    product.requiresElectricity = product.requiresElectricity === true;
    product.temporarilyUnavailable = !operations.electricityEnabled && product.requiresElectricity;
    const candidates = byProduct.get(product.id) || [];
    applyPublicProductAvailability(product, candidates, inventory);
  }
  for (const kind of ["fonkies", "fomb"]) {
    const builder = publicState.builders?.[kind];
    if (!builder) continue;
    builder.requiresElectricity = builder.requiresElectricity === true || (kind === "fonkies" && !Object.prototype.hasOwnProperty.call(builder, "requiresElectricity"));
    builder.temporarilyUnavailable = !operations.electricityEnabled && builder.requiresElectricity;
    const productId = kind === "fonkies" ? "fonkie-box" : "fomb-box";
    const candidates = byProduct.get(productId) || [];
    applyPublicBuilderAvailability(builder, candidates, inventory);
  }
  return publicState;
}

async function shortHash(value) {
  if (!value) return "0";
  return (await sha256(value)).slice(0, 10);
}

async function publishedState(env) {
  const row = await env.DB.prepare("SELECT state_json FROM catalog_state WHERE id = 'published'").first();
  return row ? JSON.parse(row.state_json) : null;
}

function reservationOrderCode(prefix = "FNT") {
  const now = new Date();
  const date = `${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth()+1).padStart(2,"0")}${String(now.getUTCDate()).padStart(2,"0")}`;
  return `${String(prefix || "FNT").replace(/[^A-Z0-9]/gi, "").slice(0, 8) || "FNT"}-${date}-${randomToken(4).slice(0, 5).toUpperCase()}`;
}

function parsePositiveInteger(value, maximum = MAX_ITEM_QUANTITY) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : 0;
}

function reservationIdentityItems(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const kind = String(item?.kind || "product");
    const quantity = Number(item?.quantity || 0);
    if (kind === "product") {
      return {
        kind,
        productId: String(item?.productId || ""),
        quantity,
        size: String(item?.size || ""),
        variant: String(item?.variant || ""),
        preorder: item?.preorder === true
      };
    }
    const flavors = (Array.isArray(item?.flavors) ? item.flavors : []).map(flavor => {
      const inventoryKey = String(flavor?.inventoryKey || "").trim();
      return {
        inventoryKey,
        // A stable inventory key is the identity. The catalog may rename a
        // flavor between the request and its canonical reservation snapshot.
        // Legacy entries without a key still fall back to their name.
        name: inventoryKey ? "" : String(flavor?.name || ""),
        quantity: Number(flavor?.quantity ?? flavor?.qty ?? 0),
        preorder: flavor?.preorder === true
      };
    }).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
    return {
      kind,
      quantity,
      flavors,
      boxSize: Number(item?.boxSize || 0),
      extraCount: Number(item?.extraCount || 0),
      preorder: item?.preorder === true
    };
  }).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

function reservationIdentityCustomer(customer = {}) {
  const text = (value, maximum) => String(value || "").trim().slice(0, maximum);
  return {
    name: text(customer.name, 100),
    phone: text(customer.phone, 40),
    fulfillment: text(customer.fulfillment, 180),
    requestedDate: text(customer.requestedDate, 10),
    paymentMethod: text(customer.paymentMethod, 80),
    address: text(customer.address, 500),
    allergySummary: text(customer.allergySummary, 2000),
    birthdayCandle: text(customer.birthdayCandle, 20),
    notes: text(customer.notes, 2000)
  };
}

export function reservationPayloadIdentity(items, customer = {}) {
  return canonicalJson({
    items: reservationIdentityItems(items),
    customer: reservationIdentityCustomer(customer)
  });
}

export function minimumPreorderDate(value = new Date()) {
  const start = Date.parse(`${caracasDate(value)}T00:00:00Z`);
  return new Date(start + (2 * 86_400_000)).toISOString().slice(0, 10);
}

export function preorderDateViolation(items, requestedDate, value = new Date()) {
  if (!(Array.isArray(items) ? items : []).some(item => item?.preorder === true)) return "";
  const minimumDate = minimumPreorderDate(value);
  return String(requestedDate || "") < minimumDate ? minimumDate : "";
}

export function reservationCanBeReused(existing, body, value = new Date()) {
  if (!existing || existing.status !== "reserved" || Number(existing.expiresAt) <= Math.floor(value.getTime() / 1000)) return false;
  let snapshot = null;
  try { snapshot = JSON.parse(existing.snapshotJson || "null"); } catch { return false; }
  const storedIdentity = typeof snapshot?.requestIdentity === "string"
    ? snapshot.requestIdentity
    : snapshot && reservationPayloadIdentity(snapshot.items, snapshot.customer);
  return Boolean(storedIdentity
    && reservationPayloadIdentity(body?.items, body?.customer) === storedIdentity);
}

export function reservationReplay(existing, body, value = new Date()) {
  if (!existing) return null;
  if (!reservationCanBeReused(existing, body, value)) {
    return {
      status: 409,
      payload: {
        error:"Esta solicitud ya fue utilizada o cambió. Vuelve al carrito e inténtalo de nuevo.",
        code:"idempotency_conflict"
      }
    };
  }
  const { snapshotJson: _snapshotJson, ...publicExisting } = existing;
  return {
    status: 200,
    payload: {
      ok:true,
      ...publicExisting,
      reservedUntil:new Date(Number(existing.expiresAt)*1000).toISOString(),
      reused:true
    }
  };
}

export function resolveReservationCart(state, requestedItems, operations) {
  if (!Array.isArray(requestedItems) || !requestedItems.length || requestedItems.length > MAX_ORDER_ITEMS) throw new Error("invalid_cart");
  const definitions = deriveInventoryDefinitions(state);
  const definitionMap = new Map(definitions.map(item => [item.sku, item]));
  const products = new Map((state.products || []).filter(item => !item.deleted && item.visible !== false).map(item => [item.id, item]));
  const snapshotItems = [];
  const demands = new Map();
  const addDemand = (definition, quantity) => {
    const existing = demands.get(definition.sku);
    if (existing) existing.quantity += quantity;
    else demands.set(definition.sku, {definition, quantity});
  };

  for (const requested of requestedItems) {
    const quantity = parsePositiveInteger(requested.quantity);
    if (!quantity) throw new Error("invalid_quantity");
    const kind = String(requested.kind || "product");
    if (kind === "product") {
      const product = products.get(String(requested.productId || ""));
      if (!product || product.price === null || product.price === undefined) throw new Error("invalid_product");
      if (!operations.electricityEnabled && product.requiresElectricity === true) throw new Error("temporarily_unavailable");
      const sizeName = String(requested.size || "");
      const variantName = String(requested.variant || "");
      const size = (product.sizes || []).find(option => option.name === sizeName) || null;
      const variant = (product.variants || []).find(option => option.name === variantName) || null;
      if ((product.sizes || []).length && !size) throw new Error("invalid_option");
      if ((product.variants || []).length && !variant) throw new Error("invalid_option");
      const unavailable = product.status === "sold-out" || size?.status === "sold-out" || variant?.status === "sold-out";
      const preorderAllowed = product.allowPreorder === true;
      const preorder = Boolean(requested.preorder && unavailable && preorderAllowed);
      if (unavailable && !preorder) throw new Error("unavailable_product");
      const sku = ["product", product.id, size ? stockSlug(size.name) : "base", variant ? stockSlug(variant.name) : "base"].join(":");
      const definition = definitionMap.get(sku);
      if (!definition) throw new Error("invalid_product");
      const unitPriceCents = Math.round(Number(size?.price ?? product.price) * 100);
      const optionSummary = [size?.name, variant?.name, preorder ? "PRE-ORDER" : ""].filter(Boolean).join(" · ");
      snapshotItems.push({kind,productId:product.id,name:product.name,quantity,unitPriceCents,optionSummary,imageUrl:snapshotImageUrl(product.image),size:size?.name||"",variant:variant?.name||"",preorder});
      if (!preorder) addDemand(definition, quantity);
      continue;
    }

    if (kind !== "fonkies" && kind !== "fomb") throw new Error("invalid_product");
    const builder = state.builders?.[kind];
    if (!builder || builder.visible === false) throw new Error("invalid_product");
    const requiresElectricity = builder.requiresElectricity === true || (kind === "fonkies" && !Object.prototype.hasOwnProperty.call(builder, "requiresElectricity"));
    if (!operations.electricityEnabled && requiresElectricity) throw new Error("temporarily_unavailable");
    const requestedFlavors = Array.isArray(requested.flavors) ? requested.flavors : [];
    const flavors = requestedFlavors.map(item => ({
      name: String(item.name || ""),
      inventoryKey: String(item.inventoryKey || "").trim(),
      quantity: parsePositiveInteger(item.quantity)
    }));
    if (!flavors.length
      || flavors.length > (builder.flavors || []).length
      || flavors.some(item => !item.quantity)) throw new Error("invalid_option");
    const resolvedSelections = flavors.map(selected => ({
      ...selected,
      resolved: resolveBuilderFlavorSelection(builder, selected, selected.name)
    }));
    if (resolvedSelections.some(item => !item.resolved)
      || new Set(resolvedSelections.map(item => item.resolved.inventoryKey)).size !== resolvedSelections.length) throw new Error("invalid_option");
    const resolvedFlavors = resolvedSelections.map(selected => {
      const { flavor, name, inventoryKey } = selected.resolved;
      const unavailable = builder.status === "sold-out" || flavor.status === "sold-out";
      const preorderAllowed = builderFlavorPreorderAllowed(builder, flavor);
      const preorder = Boolean(requested.preorder && unavailable && preorderAllowed);
      if (unavailable && !preorder) throw new Error("unavailable_product");
      return { name, inventoryKey, quantity: selected.quantity, imageUrl: snapshotImageUrl(flavor.image), preorder };
    });
    const preorder = resolvedFlavors.some(item => item.preorder);
    const selectedTotal = resolvedFlavors.reduce((sum,item) => sum + item.quantity, 0);
    let unitPriceCents;
    let boxSize = 0;
    let extraCount = 0;
    if (kind === "fonkies") {
      const minimum = Math.max(1, Number(builder.minimumQuantity || 4));
      if (selectedTotal < minimum) throw new Error("invalid_quantity");
      const base = resolvedFlavors.length === 1 ? Number(builder.singlePrice || 15) : Number(builder.mixedPrice || 17);
      unitPriceCents = Math.round((base + Math.max(0, selectedTotal - minimum) * Number(builder.extraPrice || 3.5)) * 100);
    } else {
      const pricing = resolveFombPricing(builder, selectedTotal);
      if (!pricing || pricing.extraCount > 100) throw new Error("invalid_quantity");
      boxSize = pricing.boxSize;
      extraCount = pricing.extraCount;
      unitPriceCents = pricing.unitPriceCents;
      if (!fombPricingMatchesRequest(pricing, requested)) throw new Error("pricing_changed");
    }
    const productId = kind === "fonkies" ? "fonkie-box" : "fomb-box";
    const name = `${kind === "fonkies" ? "Caja de Fonkies" : "Caja de Fomb"} · ${selectedTotal} unidades`;
    const optionSummary = resolvedFlavors.map(item => `${item.quantity} ${item.name}${item.preorder ? " (Pre-Order)" : ""}`).join(", ");
    snapshotItems.push({kind,productId,name,quantity,unitPriceCents,optionSummary,imageUrl:resolvedFlavors.find(item=>item.imageUrl)?.imageUrl||snapshotImageUrl(builder.image),flavors:resolvedFlavors,boxSize,extraCount,preorder});
    for (const selected of resolvedFlavors.filter(item => !item.preorder)) {
      const definition = definitionMap.get(`builder:${kind}:${selected.inventoryKey}`);
      if (!definition) throw new Error("invalid_option");
      addDemand(definition, selected.quantity * quantity);
    }
  }
  const totalCents = snapshotItems.reduce((sum,item) => sum + item.unitPriceCents * item.quantity, 0);
  return {snapshotItems,demands:[...demands.values()],totalCents};
}

export function resolveStockChecks(state, requestedChecks, operations) {
  if (!Array.isArray(requestedChecks) || requestedChecks.length > MAX_ORDER_ITEMS * 10) throw new Error("invalid_cart");
  const definitions = deriveInventoryDefinitions(state);
  const definitionMap = new Map(definitions.map(item => [item.sku, item]));
  const products = new Map((state.products || []).filter(item => !item.deleted && item.visible !== false).map(item => [item.id, item]));
  const demands = new Map();
  const addDemand = (definition, quantity) => {
    const current = demands.get(definition.sku);
    if (current) current.quantity += quantity;
    else demands.set(definition.sku, { definition, quantity });
  };

  for (const requested of requestedChecks) {
    const quantity = parsePositiveInteger(requested.quantity);
    if (!quantity) throw new Error("invalid_quantity");
    const kind = String(requested.kind || "product");
    if (kind === "product") {
      const product = products.get(String(requested.productId || ""));
      if (!product) throw new Error("invalid_product");
      if (!operations.electricityEnabled && product.requiresElectricity === true) throw new Error("temporarily_unavailable");
      const sizeName = String(requested.size || "");
      const variantName = String(requested.variant || "");
      const size = (product.sizes || []).find(option => option.name === sizeName) || null;
      const variant = (product.variants || []).find(option => option.name === variantName) || null;
      if ((product.sizes || []).length && !size) throw new Error("invalid_option");
      if ((product.variants || []).length && !variant) throw new Error("invalid_option");
      const unavailable = product.status === "sold-out" || size?.status === "sold-out" || variant?.status === "sold-out";
      const preorder = requested.preorder === true && unavailable && product.allowPreorder === true;
      if (unavailable && !preorder) throw new Error("unavailable_product");
      if (preorder) continue;
      const sku = ["product", product.id, size ? stockSlug(size.name) : "base", variant ? stockSlug(variant.name) : "base"].join(":");
      const definition = definitionMap.get(sku);
      if (!definition) throw new Error("invalid_product");
      addDemand(definition, quantity);
      continue;
    }
    if (kind !== "fonkies" && kind !== "fomb") throw new Error("invalid_product");
    const builder = state.builders?.[kind];
    if (!builder || builder.visible === false) throw new Error("invalid_product");
    const requiresElectricity = builder.requiresElectricity === true || (kind === "fonkies" && !Object.prototype.hasOwnProperty.call(builder, "requiresElectricity"));
    if (!operations.electricityEnabled && requiresElectricity) throw new Error("temporarily_unavailable");
    const flavorName = String(requested.flavor || "");
    const resolvedFlavor = resolveBuilderFlavorSelection(builder, requested, flavorName);
    if (!resolvedFlavor) throw new Error("invalid_option");
    const { flavor, inventoryKey } = resolvedFlavor;
    const unavailable = builder.status === "sold-out" || flavor.status === "sold-out";
    const preorderAllowed = builderFlavorPreorderAllowed(builder, flavor);
    const preorder = requested.preorder === true && unavailable && preorderAllowed;
    if (unavailable && !preorder) throw new Error("unavailable_product");
    if (preorder) continue;
    const definition = definitionMap.get(`builder:${kind}:${inventoryKey}`);
    if (!definition) throw new Error("invalid_option");
    addDemand(definition, quantity);
  }
  return [...demands.values()];
}

async function validateOrderStock(request, env) {
  await expireReservations(env);
  const body = await request.json().catch(() => ({}));
  const state = await publishedState(env);
  if (!state) return json({error:"El catálogo todavía no está preparado para comprobar stock."},503);
  await syncInventoryDefinitions(env, state);
  const inventory = await loadInventoryMap(env);
  const operations = await readOperationalState(env);
  let demands;
  const publicState = applyPublicAvailability(state, inventory, operations);
  try { demands = resolveStockChecks(publicState, body.checks, operations); }
  catch (error) {
    const temporary = error.message === "temporarily_unavailable";
    return json({error:temporary ? "La producción de este producto está temporalmente pausada." : "No pudimos comprobar esta selección.",code:error.message},409);
  }
  const conflict = demands.some(demand => {
    const row = inventory.get(demand.definition.sku);
    return row?.trackStock && demand.quantity > row.available;
  });
  if (conflict) return json({error:"No hay suficientes unidades disponibles para esa cantidad.",code:"stock_conflict"},409);
  return json({ok:true},200,{"Cache-Control":"no-store"});
}

async function reserveOrder(request, env) {
  await expireReservations(env);
  const body = await request.json();
  const clientKey = String(body.clientKey || "");
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(clientKey)) return json({error:"No se pudo identificar la solicitud. Inténtalo de nuevo."},400);
  const reservationLookup = () => env.DB.prepare("SELECT id, order_code AS orderCode, status, expires_at AS expiresAt, total_cents AS totalCents, snapshot_json AS snapshotJson FROM stock_orders WHERE client_key = ?").bind(clientKey).first();
  const existingReplay = reservationReplay(await reservationLookup(), body);
  if (existingReplay) return json(existingReplay.payload, existingReplay.status);
  const state = await publishedState(env);
  if (!state) return json({error:"El catálogo todavía no está preparado para reservar stock."},503);
  const definitions = await syncInventoryDefinitions(env,state);
  const inventory = await loadInventoryMap(env);
  const operations = await readOperationalState(env);
  let cart;
  const publicState = applyPublicAvailability(state, inventory, operations);
  try { cart = resolveReservationCart(publicState, body.items, operations); }
  catch (error) {
    const errorMessage = error.message === "temporarily_unavailable"
      ? "La producción de uno de los productos del carrito está temporalmente pausada. Retíralo para continuar; no lo eliminamos automáticamente."
      : error.message === "pricing_changed"
        ? "Actualizamos el precio de tu caja Fomb. Recarga la página para corregir el carrito antes de reservar."
        : "El carrito cambió o contiene una opción no disponible. Actualiza la página e inténtalo de nuevo.";
    return json({error:errorMessage,code:error.message},409);
  }
  const trackedDemands = cart.demands.filter(item => inventory.get(item.definition.sku)?.trackStock);
  const clientHash = await sha256(`${request.headers.get("CF-Connecting-IP") || "local"}:${request.headers.get("User-Agent") || ""}`);
  const active = await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_orders WHERE client_hash = ? AND status = 'reserved' AND expires_at > ?").bind(clientHash,Math.floor(Date.now()/1000)).first();
  if (Number(active?.count || 0) >= 10) return json({error:"Hay demasiadas reservas activas desde este dispositivo. Espera a que finalice alguna."},429);
  const customer = body.customer || {};
  const customerName = String(customer.name || "").trim().slice(0,100);
  const customerPhone = String(customer.phone || "").trim().slice(0,40);
  const requestedDate = String(customer.requestedDate || "").trim();
  if (!customerName || !customerPhone || !isIsoDate(requestedDate)) return json({error:"Completa nombre, teléfono y fecha del pedido."},400);
  const minimumDate = preorderDateViolation(cart.snapshotItems, requestedDate);
  if (minimumDate) {
    return json({
      error:`Los productos para preordenar necesitan una fecha a partir del ${minimumDate}.`,
      code:"requested_date_too_soon",
      minimumDate
    },409);
  }
  const id = crypto.randomUUID();
  const orderCode = reservationOrderCode(body.orderPrefix);
  const now = new Date().toISOString();
  const expiresAt = Math.floor(Date.now()/1000)+RESERVATION_TTL_SECONDS;
  const snapshot = {items:cart.snapshotItems,customer:{name:customerName,phone:customerPhone,fulfillment:String(customer.fulfillment||"").slice(0,180),requestedDate,paymentMethod:String(customer.paymentMethod||"").slice(0,80),address:String(customer.address||"").slice(0,500),allergySummary:String(customer.allergySummary||"").slice(0,2000),birthdayCandle:String(customer.birthdayCandle||"").slice(0,20),notes:String(customer.notes||"").slice(0,2000)},requestIdentity:reservationPayloadIdentity(body.items,customer)};
  const statements = [env.DB.prepare("INSERT INTO stock_orders (id, order_code, client_key, client_hash, status, expires_at, total_cents, currency, customer_name, customer_phone, fulfillment, requested_date, payment_method, address, allergy_summary, birthday_candle, notes, snapshot_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'reserved', ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id,orderCode,clientKey,clientHash,expiresAt,cart.totalCents,customerName,customerPhone,snapshot.customer.fulfillment,requestedDate,snapshot.customer.paymentMethod,snapshot.customer.address,snapshot.customer.allergySummary,snapshot.customer.birthdayCandle,snapshot.customer.notes,JSON.stringify(snapshot),now,now)];
  for (const demand of trackedDemands) {
    statements.push(env.DB.prepare("UPDATE inventory_items SET reserved = reserved + ?, updated_at = ?, updated_by = 'checkout' WHERE sku = ?").bind(demand.quantity,now,demand.definition.sku));
    statements.push(env.DB.prepare("INSERT INTO stock_order_items (order_id, sku, product_id, item_name, option_summary, quantity, reserved_quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, 1, ?, 0)").bind(id,demand.definition.sku,demand.definition.productId,demand.definition.label,demand.definition.optionSummary,demand.quantity));
    statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku, order_id, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, ?, 'reservation', 0, ?, 'Reserva por 30 minutos', 'checkout', ?)").bind(demand.definition.sku,id,demand.quantity,now));
  }
  try { await env.DB.batch(statements); }
  catch (error) {
    const message = String(error?.message || error);
    if (message.includes("inventory_unavailable")) return json({error:"Alguien acaba de reservar la última unidad de uno de estos productos. Actualiza el carrito.",code:"stock_conflict"},409);
    if (message.includes("UNIQUE")) {
      // A simultaneous retry can pass the first lookup before the winning
      // request commits. Re-read the row and replay the canonical response;
      // never misreport an identical idempotent retry as a stock failure.
      const racedReplay = reservationReplay(await reservationLookup(), body);
      if (racedReplay) return json(racedReplay.payload, racedReplay.status);
      return json({error:"No pudimos recuperar la reserva ya procesada. Vuelve al carrito e inténtalo de nuevo.",code:"idempotency_conflict"},409);
    }
    throw error;
  }
  return json({ok:true,id,orderCode,totalCents:cart.totalCents,reservedUntil:new Date(expiresAt*1000).toISOString(),expiresAt,mutationVersion:0},201);
}

async function getImage(url, env) {
  const id = url.pathname.split("/").pop();
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(id || "")) return json({ error: "Imagen inválida" }, 400);
  const row = await env.DB.prepare("SELECT mime_type, image_data FROM catalog_images WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Imagen no encontrada" }, 404);
  const body = row.image_data instanceof ArrayBuffer ? row.image_data : new Uint8Array(row.image_data || []);
  return new Response(body, {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function setupAdmin(request, env) {
  const expectedToken = String(env.SETUP_TOKEN || "");
  const suppliedToken = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expectedToken || !suppliedToken || !constantTimeEqual(expectedToken, suppliedToken)) return json({ error: "Configuración no autorizada" }, 401);
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_users").first();
  if (Number(existing?.count || 0) > 0) return json({ error: "El administrador ya fue configurado" }, 409);
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const displayName = String(body.displayName || username || "").trim().slice(0, 80);
  if (!username || password.length < 12) return json({ error: "Usa un usuario válido y una contraseña de al menos 12 caracteres" }, 400);
  const salt = randomToken(18);
  const passwordHash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_users (username, password_salt, password_hash, password_iterations, created_at, display_name, role, active) VALUES (?, ?, ?, ?, ?, ?, 'owner', 1)").bind(username, salt, passwordHash, PASSWORD_ITERATIONS, now, displayName),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'setup', 'Administrador inicial creado', ?)").bind(username, now)
  ]);
  return json({ ok: true, username }, 201);
}

async function login(request, env) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const clientAddress = request.headers.get("CF-Connecting-IP") || "unknown";
  const attemptId = await sha256(`${clientAddress}:${username || "invalid"}`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - 15 * 60;
  const attemptCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE identifier_hash = ? AND attempted_at >= ?").bind(attemptId, windowStart).first();
  if (Number(attemptCount?.count || 0) >= 8) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429, { "Retry-After": "900" });
  const user = username ? await env.DB.prepare("SELECT username, password_salt, password_hash, password_iterations, role FROM admin_users WHERE username = ? AND active = 1").bind(username).first() : null;
  const suppliedHash = user ? await derivePasswordHash(password, user.password_salt, user.password_iterations) : "";
  if (!user || !constantTimeEqual(user.password_hash, suppliedHash)) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO login_attempts (identifier_hash, attempted_at) VALUES (?, ?)").bind(attemptId, nowSeconds),
      env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(nowSeconds - 24 * 60 * 60)
    ]);
    return json({ error: "Usuario o contraseña incorrectos" }, 401);
  }

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE identifier_hash = ?").bind(attemptId),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)),
    env.DB.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(tokenHash, username, expiresAt, now),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'login', 'Inicio de sesión', ?)").bind(username, now)
  ]);
  return json({ ok: true, username, role: user.role || "admin" }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS) });
}

async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function sessionStatus(request, env) {
  const session = await requireSession(request, env, false);
  return session ? json({ authenticated: true, username: session.username, displayName: session.display_name || session.username, role: session.role || "admin" }) : json({ authenticated: false }, 401);
}

async function passkeyRegistrationOptions(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const origin = requireWebAuthnOrigin(request, env);
  if (!origin) return json({ error: "Origen no autorizado" }, 403);
  const rpID = webAuthnRpID(origin, env);
  const credentials = await env.DB.prepare("SELECT credential_id, transports FROM passkey_credentials WHERE username = ?").bind(session.username).all();
  const options = await generateRegistrationOptions({
    rpName: "Fontana sin gluten",
    rpID,
    userID: encoder.encode(session.username),
    userName: session.username,
    userDisplayName: session.display_name || session.username,
    attestationType: "none",
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: (credentials.results || []).map(row => ({ id: row.credential_id, transports: parseJsonArray(row.transports) }))
  });
  const challengeId = await savePasskeyChallenge(env, session.username, options.challenge, "registration");
  return json({ challengeId, publicKey: options });
}

async function verifyPasskeyRegistration(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const origin = requireWebAuthnOrigin(request, env);
  if (!origin) return json({ error: "Origen no autorizado" }, 403);
  const body = await request.json();
  const challenge = await consumePasskeyChallenge(env, body.challengeId, session.username, "registration");
  if (!challenge) return json({ error: "La solicitud de Face ID venció. Inténtalo de nuevo." }, 400);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: webAuthnRpID(origin, env),
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257]
    });
  } catch {
    return json({ error: "No se pudo verificar Face ID en este dispositivo." }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) return json({ error: "Face ID no pudo verificarse." }, 400);
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const label = String(body.label || "Face ID").trim().slice(0, 60) || "Face ID";
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO passkey_credentials (credential_id, username, public_key, counter, transports, device_type, backed_up, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(credential.id, session.username, exactArrayBuffer(credential.publicKey), credential.counter, JSON.stringify(credential.transports || body.response?.response?.transports || []), credentialDeviceType, credentialBackedUp ? 1 : 0, label, now),
      env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'passkey_add', ?, ?)").bind(session.username, label, now)
    ]);
  } catch {
    return json({ error: "Este Face ID ya está registrado." }, 409);
  }
  return json({ ok: true, id: credential.id, label }, 201);
}

async function passkeyLoginOptions(request, env) {
  const origin = requireWebAuthnOrigin(request, env);
  if (!origin) return json({ error: "Origen no autorizado" }, 403);
  const body = await request.json();
  const username = normalizeUsername(body.username);
  let allowCredentials;
  if (username) {
    const user = await env.DB.prepare("SELECT username FROM admin_users WHERE username = ? AND active = 1").bind(username).first();
    if (!user) return json({ error: "No existe una cuenta activa con ese usuario." }, 404);
    const credentials = await env.DB.prepare("SELECT credential_id, transports FROM passkey_credentials WHERE username = ?").bind(username).all();
    if (!(credentials.results || []).length) return json({ error: "Este usuario todavía no configuró Face ID." }, 404);
    allowCredentials = credentials.results.map(row => ({ id: row.credential_id, transports: parseJsonArray(row.transports) }));
  } else {
    const available = await env.DB.prepare("SELECT COUNT(*) AS total FROM passkey_credentials p JOIN admin_users u ON u.username = p.username WHERE u.active = 1").first();
    if (!Number(available?.total || 0)) return json({ error: "Todavía no hay accesos con Face ID configurados." }, 404);
  }
  const options = await generateAuthenticationOptions({
    rpID: webAuthnRpID(origin, env),
    userVerification: "required",
    ...(allowCredentials ? { allowCredentials } : {})
  });
  const challengeId = username
    ? await savePasskeyChallenge(env, username, options.challenge, "authentication")
    : await saveDiscoverablePasskeyChallenge(env, options.challenge);
  return json({ challengeId, publicKey: options });
}

async function verifyPasskeyLogin(request, env) {
  const origin = requireWebAuthnOrigin(request, env);
  if (!origin) return json({ error: "Origen no autorizado" }, 403);
  const body = await request.json();
  const requestedUsername = normalizeUsername(body.username);
  const row = requestedUsername
    ? await env.DB.prepare("SELECT credential_id, username, public_key, counter, transports, device_type, backed_up FROM passkey_credentials WHERE credential_id = ? AND username = ?").bind(body.response?.id || "", requestedUsername).first()
    : await env.DB.prepare("SELECT credential_id, username, public_key, counter, transports, device_type, backed_up FROM passkey_credentials WHERE credential_id = ?").bind(body.response?.id || "").first();
  const username = row?.username || requestedUsername;
  const challenge = requestedUsername
    ? await consumePasskeyChallenge(env, body.challengeId, requestedUsername, "authentication")
    : await consumeDiscoverablePasskeyChallenge(env, body.challengeId);
  if (!challenge) return json({ error: "La solicitud de Face ID venció. Inténtalo de nuevo." }, 400);
  if (!row) return json({ error: "Face ID no está registrado para este usuario." }, 401);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: webAuthnRpID(origin, env),
      requireUserVerification: true,
      credential: { id: row.credential_id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter || 0), transports: parseJsonArray(row.transports) }
    });
  } catch {
    return json({ error: "Face ID no pudo verificarse." }, 401);
  }
  if (!verification.verified) return json({ error: "Face ID no pudo verificarse." }, 401);
  const user = await env.DB.prepare("SELECT username, role FROM admin_users WHERE username = ? AND active = 1").bind(username).first();
  if (!user) return json({ error: "La cuenta está desactivada." }, 403);
  const now = new Date().toISOString();
  const sessionResult = await createSession(env, username, now);
  await env.DB.batch([
    env.DB.prepare("UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?").bind(verification.authenticationInfo.newCounter, now, row.credential_id),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'passkey_login', 'Inicio con Face ID', ?)").bind(username, now)
  ]);
  return json({ ok: true, username, role: user.role || "admin" }, 200, { "Set-Cookie": sessionCookie(sessionResult.token, SESSION_TTL_SECONDS) });
}

async function listPasskeys(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const result = await env.DB.prepare("SELECT credential_id AS id, label, created_at AS createdAt, last_used_at AS lastUsedAt FROM passkey_credentials WHERE username = ? ORDER BY created_at DESC").bind(session.username).all();
  return json({ items: result.results || [] });
}

async function deletePasskey(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  const result = await env.DB.prepare("DELETE FROM passkey_credentials WHERE credential_id = ? AND username = ?").bind(id, session.username).run();
  if (Number(result?.meta?.changes || 0) !== 1) return json({ error: "Acceso no encontrado" }, 404);
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'passkey_delete', 'Acceso Face ID eliminado', ?)").bind(session.username, new Date().toISOString()).run();
  return json({ ok: true });
}

async function listUsers(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const result = await env.DB.prepare("SELECT u.username, u.display_name AS displayName, u.role, u.active, u.created_at AS createdAt, COUNT(p.credential_id) AS passkeyCount FROM admin_users u LEFT JOIN passkey_credentials p ON p.username = u.username GROUP BY u.username ORDER BY u.created_at").all();
  return json({ currentUser: session.username, canManageUsers: session.role === "owner", items: result.results || [] });
}

async function createUser(request, env) {
  const session = await requireOwner(request, env);
  if (session instanceof Response) return session;
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const displayName = String(body.displayName || "").trim().slice(0, 80);
  const password = String(body.password || "");
  if (!username || !displayName || password.length < 12) return json({ error: "Indica nombre, usuario válido y una contraseña temporal de al menos 12 caracteres." }, 400);
  const salt = randomToken(18);
  const passwordHash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO admin_users (username, password_salt, password_hash, password_iterations, created_at, display_name, role, active) VALUES (?, ?, ?, ?, ?, ?, 'admin', 1)").bind(username, salt, passwordHash, PASSWORD_ITERATIONS, now, displayName),
      env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'user_create', ?, ?)").bind(session.username, username, now)
    ]);
  } catch {
    return json({ error: "Ese usuario ya existe." }, 409);
  }
  return json({ ok: true, username, displayName, role: "admin" }, 201);
}

async function deactivateUser(request, env, url) {
  const session = await requireOwner(request, env);
  if (session instanceof Response) return session;
  const username = normalizeUsername(decodeURIComponent(url.pathname.split("/").pop() || ""));
  if (!username || username === session.username) return json({ error: "No puedes desactivar tu propia cuenta." }, 400);
  const target = await env.DB.prepare("SELECT role FROM admin_users WHERE username = ?").bind(username).first();
  if (!target) return json({ error: "Usuario no encontrado" }, 404);
  if (target.role === "owner") return json({ error: "La cuenta propietaria no puede desactivarse." }, 400);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_users SET active = 0 WHERE username = ?").bind(username),
    env.DB.prepare("DELETE FROM admin_sessions WHERE username = ?").bind(username),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'user_deactivate', ?, ?)").bind(session.username, username, now)
  ]);
  return json({ ok: true });
}

async function getAdminCatalog(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const row = await env.DB.prepare("SELECT state_json, revision, updated_at FROM catalog_state WHERE id = 'published'").first();
  return json({ state: row ? JSON.parse(row.state_json) : null, revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null });
}

async function getInventory(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  await expireReservations(env);
  const state = await publishedState(env);
  if (!state) return json({items:[],summary:{tracked:0,available:0,reserved:0,soldOut:0}});
  const definitions = await syncInventoryDefinitions(env,state,session.username);
  const inventory = await loadInventoryMap(env);
  const items = definitions.map(definition => {
    const row = inventory.get(definition.sku);
    return {...definition,sourceQuantity:undefined,onHand:Number(row?.onHand||0),reserved:Number(row?.reserved||0),available:Math.max(0,Number(row?.onHand||0)-Number(row?.reserved||0)),trackStock:Boolean(row?.trackStock),updatedAt:row?.updatedAt||null};
  });
  const tracked = items.filter(item => item.trackStock);
  return json({items,summary:{tracked:tracked.length,available:tracked.reduce((sum,item)=>sum+item.available,0),reserved:tracked.reduce((sum,item)=>sum+item.reserved,0),soldOut:tracked.filter(item=>item.available===0).length}});
}

async function updateInventory(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const sku = decodeURIComponent(url.pathname.slice("/v1/admin/inventory/".length));
  if (!sku || sku.length > 240) return json({error:"Artículo de inventario inválido"},400);
  const body = await request.json();
  const onHand = Number(body.onHand);
  // Una cantidad positiva siempre representa inventario real. Evita que una
  // omisión accidental del switch deje existencias visibles pero sin límite.
  const trackStock = Boolean(body.trackStock) || onHand > 0;
  if (!Number.isInteger(onHand) || onHand < 0 || onHand > 100000) return json({error:"Indica una cantidad válida"},400);
  const current = await env.DB.prepare("SELECT on_hand AS onHand, reserved, track_stock AS trackStock, label, option_summary AS optionSummary FROM inventory_items WHERE sku = ? AND active = 1").bind(sku).first();
  if (!current) return json({error:"Artículo de inventario no encontrado"},404);
  if (onHand < Number(current.reserved||0)) return json({error:`No puedes bajar de ${current.reserved}: esas unidades están reservadas.`},409);
  if (!trackStock && Number(current.reserved||0)>0) return json({error:"Confirma o cancela las reservas antes de desactivar el control."},409);
  const now = new Date().toISOString();
  const note = String(body.note||"Ajuste manual desde el panel").trim().slice(0,300);
  const delta = onHand-Number(current.onHand||0);
  await env.DB.batch([
    env.DB.prepare("UPDATE inventory_items SET on_hand = ?, track_stock = ?, updated_by = ?, updated_at = ? WHERE sku = ?").bind(onHand,trackStock?1:0,session.username,now,sku),
    env.DB.prepare("INSERT INTO inventory_movements (sku, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, 'adjustment', ?, 0, ?, ?, ?)").bind(sku,delta,note,session.username,now),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'inventory_adjust', ?, ?)").bind(session.username,`${current.label}${current.optionSummary?` · ${current.optionSummary}`:""}: ${onHand}${trackStock?"":" (sin control)"}`,now)
  ]);
  return json({ok:true,sku,onHand,reserved:Number(current.reserved||0),available:onHand-Number(current.reserved||0),trackStock});
}

async function expireReservations(env) {
  const nowSeconds = Math.floor(Date.now()/1000);
  const result = await env.DB.prepare("SELECT id FROM stock_orders WHERE status = 'reserved' AND expires_at <= ? ORDER BY expires_at LIMIT 100").bind(nowSeconds).all();
  let expired = 0;
  for (const order of result.results || []) {
    const guard=await prepareMutationGuard(env,"stock_order",order.id);
    const fresh=await env.DB.prepare("SELECT status,expires_at AS expiresAt FROM stock_orders WHERE id=?").bind(order.id).first();
    if(!fresh||fresh.status!=="reserved"||Number(fresh.expiresAt)>nowSeconds)continue;
    const lines = await env.DB.prepare("SELECT sku, reserved_quantity AS reservedQuantity FROM stock_order_items WHERE order_id = ? AND sku IS NOT NULL AND reserved_quantity > 0").bind(order.id).all();
    const now = new Date().toISOString();
    const statements = [mutationClaimStatement(env,guard,"order_expire","","system",now)];
    for (const line of lines.results || []) {
      statements.push(env.DB.prepare("UPDATE inventory_items SET reserved = reserved - ?, updated_at = ?, updated_by = 'system' WHERE sku = ?").bind(Number(line.reservedQuantity),now,line.sku));
      statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku, order_id, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, ?, 'release', 0, ?, 'Reserva vencida', 'system', ?)").bind(line.sku,order.id,-Number(line.reservedQuantity),now));
    }
    statements.push(env.DB.prepare("UPDATE stock_orders SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'reserved'").bind(now,order.id));
    try { await env.DB.batch(statements); expired += 1; }
    catch (error) { if (!isMutationConflict(error)&&!String(error?.message||error).includes("UNIQUE")&&!String(error?.message||error).includes("inventory_unavailable")) console.error("No se pudo vencer la reserva",order.id,error); }
  }
  return expired;
}

async function listOrders(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  await expireReservations(env);
  const [result,paymentRows]=await Promise.all([
    env.DB.prepare("SELECT id, order_code AS orderCode, status, expires_at AS expiresAt, total_cents AS totalCents, currency, customer_id AS customerId, customer_name AS customerName, customer_phone AS customerPhone, fulfillment, requested_date AS requestedDate, payment_method AS paymentMethod, snapshot_json AS snapshotJson, created_at AS createdAt, updated_at AS updatedAt, confirmed_by AS confirmedBy, cancelled_by AS cancelledBy,voided_at AS voidedAt,void_reason AS voidReason,COALESCE((SELECT MAX(version) FROM entity_mutation_claims WHERE entity_type='stock_order' AND entity_id=stock_orders.id),0) AS mutationVersion FROM stock_orders ORDER BY created_at DESC LIMIT 500").all(),
    env.DB.prepare("SELECT p.order_id AS orderId,p.id,p.status,p.method,p.paid_currency AS currency,p.amount_minor AS amountMinor,p.amount_scale AS amountScale,p.reference_amount_cents AS referenceAmountCents,p.functional_amount_cents AS functionalAmountCents,p.payment_date AS paymentDate,p.transaction_reference AS reference,s.id AS saleId,s.payment_status AS paymentStatus FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.order_id IS NOT NULL ORDER BY p.confirmed_at").all()
  ]);
  const paymentsByOrder=new Map();for(const payment of paymentRows.results||[]){if(!paymentsByOrder.has(payment.orderId))paymentsByOrder.set(payment.orderId,[]);paymentsByOrder.get(payment.orderId).push(payment);}
  const items = (result.results||[]).map(row=>{let snapshot={};try{snapshot=JSON.parse(row.snapshotJson||"{}");}catch{} const {snapshotJson,...order}=row;const payments=paymentsByOrder.get(row.id)||[];return {...order,expiresAt:Number(order.expiresAt),items:snapshot.items||[],customer:snapshot.customer||{},payments,saleId:payments[0]?.saleId||null,paymentStatus:payments[0]?.paymentStatus||(order.status==="confirmed"?"legacy":"unpaid")};});
  return json({items,summary:{reserved:items.filter(item=>item.status==="reserved").length,confirmed:items.filter(item=>item.status==="confirmed").length,expired:items.filter(item=>item.status==="expired").length}});
}

async function changeOrderStatus(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[3] || "";
  const action = parts[4] || "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !["confirm","cancel","extend"].includes(action)) return json({error:"Acción de pedido inválida"},400);
  if (action === "confirm") return json({
    error:"Confirma el pago indicando monto, moneda, método y tasa cuando corresponda.",
    code:"payment_required",
    confirmPaymentUrl:`/v1/admin/orders/${id}/confirm-payment`
  },422);
  const body=await request.json().catch(()=>({}));
  const guard=await prepareMutationGuard(env,"stock_order",id,body.expectedVersion);
  if(guard.error)return guard.error;
  const order = await env.DB.prepare("SELECT id, order_code AS orderCode, status, expires_at AS expiresAt FROM stock_orders WHERE id = ?").bind(id).first();
  if (!order) return json({error:"Pedido no encontrado"},404);
  if (action === "extend") {
    if (order.status !== "reserved") return json({error:"Solo se pueden extender reservas activas"},409);
    const expiresAt = Math.floor(Date.now()/1000)+RESERVATION_TTL_SECONDS;
    const now=new Date().toISOString();
    try{await env.DB.batch([
      mutationClaimStatement(env,guard,"order_extend",body.idempotencyKey||"",session.username,now),
      env.DB.prepare("UPDATE stock_orders SET expires_at = ?, updated_at = ? WHERE id = ? AND status = 'reserved'").bind(expiresAt,now,id),
      structuredAuditStatement(env,session.username,"order_extend","stock_order",id,{orderCode:order.orderCode,expiresAt},now)
    ]);}catch(error){if(isMutationConflict(error))return staleStateResponse(guard.currentVersion+1);throw error;}
    return json({ok:true,status:"reserved",expiresAt,reservedUntil:new Date(expiresAt*1000).toISOString(),mutationVersion:guard.nextVersion});
  }
  if (order.status !== "reserved") return json({error:`El pedido ya está ${order.status}.`},409);
  if (Number(order.expiresAt)<=Math.floor(Date.now()/1000)) { await expireReservations(env); return json({error:"La reserva venció y el stock fue liberado."},409); }
  const lines = await env.DB.prepare("SELECT sku, reserved_quantity AS reservedQuantity FROM stock_order_items WHERE order_id = ? AND sku IS NOT NULL AND reserved_quantity > 0").bind(id).all();
  const now = new Date().toISOString();
  const statements = [mutationClaimStatement(env,guard,"order_cancel",body.idempotencyKey||"",session.username,now)];
  for (const line of lines.results||[]) {
    const amount = Number(line.reservedQuantity);
    statements.push(env.DB.prepare("UPDATE inventory_items SET reserved = reserved - ?, updated_at = ?, updated_by = ? WHERE sku = ?").bind(amount,now,session.username,line.sku));
    statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku, order_id, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, ?, 'release', 0, ?, 'Pedido cancelado', ?, ?)").bind(line.sku,id,-amount,session.username,now));
  }
  statements.push(env.DB.prepare("UPDATE stock_orders SET status = 'cancelled', cancelled_by = ?, updated_at = ? WHERE id = ? AND status = 'reserved'").bind(session.username,now,id));
  statements.push(structuredAuditStatement(env,session.username,"order_cancel","stock_order",id,{orderCode:order.orderCode},now));
  try { await env.DB.batch(statements); }
  catch (error) { if (isMutationConflict(error)) return staleStateResponse(guard.currentVersion+1); if (String(error?.message||error).includes("UNIQUE")||String(error?.message||error).includes("inventory_unavailable")) return staleStateResponse(guard.currentVersion+1); throw error; }
  return json({ok:true,status:"cancelled",mutationVersion:guard.nextVersion});
}

function functionalSaleTotal(totalCents,referenceCurrency,payments) {
  if (referenceCurrency==="USD") return Number(totalCents);
  const rated=payments.find(payment=>payment.rateBasis==="EUR"&&payment.rateScaled&&payment.functionalRateScaled&&payment.rateValueDate===payment.functionalRateValueDate);
  return rated?functionalUsdCentsForReference({referenceAmountCents:Number(totalCents),referenceCurrency:"EUR",usdRateScaled:rated.functionalRateScaled,eurRateScaled:rated.rateScaled}):null;
}

async function resolveSaleValuation(env,totalCents,referenceCurrency,soldAt) {
  if(referenceCurrency==="USD")return {functionalTotalCents:Number(totalCents),referenceRate:null,functionalRate:null};
  let referenceRate=await rateForDate(env,"EUR",soldAt,{allowPrior:true});
  if(!referenceRate){try{await refreshBcvRates(env);}catch{} referenceRate=await rateForDate(env,"EUR",soldAt,{allowPrior:true})||await latestObservedRate(env,"EUR",soldAt);}
  const functionalRate=referenceRate?await rateForDate(env,"USD",referenceRate.valueDate):null;
  const functionalTotalCents=referenceRate&&functionalRate?functionalUsdCentsForReference({referenceAmountCents:Number(totalCents),referenceCurrency,usdRateScaled:functionalRate.rateScaled,eurRateScaled:referenceRate.rateScaled}):null;
  return {functionalTotalCents,referenceRate,functionalRate};
}

async function confirmOrderPayment(request,env,url) {
  const session=await requireSession(request,env);
  if (session instanceof Response) return session;
  const id=url.pathname.split("/").filter(Boolean)[3]||"";
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({error:"Pedido inválido"},400);
  const body=await request.json().catch(()=>({}));
  const identity=await requestIdentity(env,body,`order_confirm_payment:${id}`);
  if (identity.error) return identity.error;
  if (identity.replay) return identity.replay;
  const guard=await prepareMutationGuard(env,"stock_order",id,body.expectedVersion);
  if(guard.error)return guard.error;
  const order=await env.DB.prepare(`SELECT id,order_code AS orderCode,status,expires_at AS expiresAt,total_cents AS totalCents,
    customer_name AS customerName,customer_phone AS customerPhone,fulfillment,requested_date AS requestedDate,payment_method AS paymentMethod,
    address,allergy_summary AS allergySummary,notes,snapshot_json AS snapshotJson FROM stock_orders WHERE id=?`).bind(id).first();
  if (!order) return json({error:"Pedido no encontrado"},404);
  if (order.status!=="reserved") return json({error:`El pedido ya está ${order.status}.`,code:"order_already_processed"},409);
  if (Number(order.expiresAt)<=Math.floor(Date.now()/1000)) {await expireReservations(env);return json({error:"La reserva venció y el stock fue liberado."},409);}
  const referenceCurrency=String(body.referenceCurrency||"USD").toUpperCase();
  if (!SUPPORTED_REFERENCE_CURRENCIES.has(referenceCurrency)) return json({error:"La base del pedido debe ser USD o EUR."},400);
  if (!Array.isArray(body.payments)||!body.payments.length) return json({error:"Registra al menos un pago o abono confirmado.",code:"payment_required"},422);
  const soldAt=cleanText(body.soldAt||caracasDate(),10);
  if (!isIsoDate(soldAt)) return json({error:"Fecha de venta inválida"},400);
  const paymentDate=cleanText(body.paymentDate||soldAt,10);
  if(!isIsoDate(paymentDate))return json({error:"Fecha del pago inválida"},400);
  const resolved=await resolvePaymentPayloads(env,body.payments.map(payment=>({...payment,paymentDate:payment.paymentDate||paymentDate})),referenceCurrency,session,paymentDate);
  if (resolved.error) return json({error:resolved.error,code:"invalid_payment"},422);
  const paymentState=derivePaymentStatus(Number(order.totalCents),resolved.payments.reduce((sum,payment)=>sum+payment.referenceAmountCents,0));
  const valuation=await resolveSaleValuation(env,Number(order.totalCents),referenceCurrency,soldAt);
  const functionalTotalCents=valuation.functionalTotalCents;
  if (!paymentState||!functionalTotalCents) return json({error:"No se pudo convertir la venta a la moneda funcional USD."},422);
  const customer=await normalizedCustomerRecord(env,body.customer,{name:order.customerName,phone:order.customerPhone},session,{required:true});
  if (customer.error) return json({error:customer.error},400);
  let snapshot={};try{snapshot=JSON.parse(order.snapshotJson||"{}");}catch{}
  const snapshotItems=Array.isArray(snapshot.items)?snapshot.items:[];
  if (!snapshotItems.length) return json({error:"El pedido no conserva sus productos; no puede confirmarse automáticamente."},409);
  const saleId=crypto.randomUUID();
  const now=new Date().toISOString();
  const itemsText=snapshotItems.map(item=>`${item.quantity}× ${item.name}${item.optionSummary?` · ${item.optionSummary}`:""}`).join("; ");
  const responsePayload={ok:true,status:"confirmed",paymentStatus:paymentState.status,saleId,customerId:customer.record.id,paymentIds:resolved.payments.map(payment=>payment.id),balanceCents:paymentState.balanceRefCents,overpaymentCents:paymentState.overpaymentRefCents,referenceCurrency,functionalCurrency:"USD",functionalTotalCents,mutationVersion:guard.nextVersion,replayed:false};
  const statements=[mutationClaimStatement(env,guard,"order_confirm_payment",identity.key,session.username,now)];
  for (const rate of resolved.newRates) statements.push(rateInsertStatement(env,rate,session.username,now));
  statements.push(...customer.statements);
  const stockStatements=[];
  const stockLines=await env.DB.prepare("SELECT sku,reserved_quantity AS reservedQuantity FROM stock_order_items WHERE order_id=? AND sku IS NOT NULL AND reserved_quantity>0").bind(id).all();
  for (const line of stockLines.results||[]) {
    const quantity=Number(line.reservedQuantity);
    stockStatements.push(env.DB.prepare("UPDATE inventory_items SET on_hand=on_hand-?,reserved=reserved-?,updated_at=?,updated_by=? WHERE sku=?").bind(quantity,quantity,now,session.username,line.sku));
    stockStatements.push(env.DB.prepare("INSERT INTO inventory_movements (sku,order_id,sale_id,movement_type,delta_on_hand,delta_reserved,note,actor,created_at) VALUES (?,?,?,'sale',?,?,'Pedido confirmado',?,?)").bind(line.sku,id,saleId,-quantity,-quantity,session.username,now));
  }
  statements.push(env.DB.prepare("UPDATE stock_orders SET status='confirmed',customer_id=?,confirmed_by=?,updated_at=? WHERE id=? AND status='reserved'").bind(customer.record.id,session.username,now,id));
  statements.push(env.DB.prepare(`INSERT INTO sales (id,sold_at,total_cents,currency,status,channel,payment_method,customer_name,customer_phone,items_text,notes,created_by,created_at,updated_by,updated_at,order_id,customer_id,reference_currency,functional_currency,functional_total_cents,payment_status,functional_exchange_rate_id,functional_exchange_rate_scaled,functional_exchange_rate_value_date,reference_exchange_rate_id,reference_exchange_rate_scaled,reference_exchange_rate_value_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(saleId,soldAt,Number(order.totalCents),referenceCurrency,"confirmed",cleanText(body.channel||"WhatsApp",60),resolved.payments.map(payment=>payment.method).join(" + ").slice(0,60),customer.record.name,customer.record.phone,itemsText,cleanText(body.notes||order.notes,2000),session.username,now,session.username,now,id,customer.record.id,referenceCurrency,"USD",functionalTotalCents,paymentState.status,
      valuation.functionalRate?.id||null,valuation.functionalRate?.rateScaled||null,valuation.functionalRate?.valueDate||null,
      valuation.referenceRate?.id||null,valuation.referenceRate?.rateScaled||null,valuation.referenceRate?.valueDate||null));
  statements.push(...stockStatements);
  for (const item of snapshotItems) {
    const quantity=Number(item.quantity||0);
    const unitPrice=Number(item.unitPriceCents||0);
    if (!Number.isSafeInteger(quantity)||quantity<=0||!Number.isSafeInteger(unitPrice)||unitPrice<0) throw new Error("invalid_order_snapshot");
    statements.push(env.DB.prepare(`INSERT INTO sale_items (id,sale_id,product_id,sku,item_name_snapshot,option_summary_snapshot,image_url_snapshot,quantity,price_currency,unit_price_cents,line_total_cents,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),saleId,cleanText(item.productId,100)||null,null,cleanText(item.name,200),cleanText(item.optionSummary,1000),snapshotImageUrl(item.imageUrl),quantity,referenceCurrency,unitPrice,unitPrice*quantity,now));
  }
  statements.push(...saleJournalStatements(env,{id:saleId,soldAt,totalCents:Number(order.totalCents),referenceCurrency,functionalTotalCents},session.username,now));
  let paidReference=0;
  let customerCreditFunctionalCents=0;
  for (const payment of resolved.payments) {
    statements.push(paymentInsertStatement(env,payment,saleId,id,session.username,now));
    const posting=paymentJournalStatements(env,payment,{id:saleId,soldAt,totalCents:Number(order.totalCents),functionalTotalCents,referenceCurrency},paidReference,session.username,now);
    statements.push(...posting.statements);
    customerCreditFunctionalCents+=posting.customerCredit;
    paidReference+=payment.referenceAmountCents;
  }
  responsePayload.customerCreditFunctionalCents=customerCreditFunctionalCents;
  statements.push(env.DB.prepare("INSERT INTO idempotency_keys (idempotency_key,operation,request_hash,target_id,response_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(identity.key,`order_confirm_payment:${id}`,identity.requestHash,saleId,JSON.stringify(responsePayload),session.username,now));
  statements.push(structuredAuditStatement(env,session.username,"order_confirm_payment","stock_order",id,{orderCode:order.orderCode,saleId,paymentStatus:paymentState.status,paymentIds:responsePayload.paymentIds,referenceCurrency,functionalTotalCents},now));
  try {await env.DB.batch(statements);} catch(error) {
    if(isMutationConflict(error)){
      const retry=await requestIdentity(env,body,`order_confirm_payment:${id}`);
      if(retry.replay)return retry.replay;
      return staleStateResponse(guard.currentVersion+1);
    }
    if (String(error?.message||error).includes("UNIQUE")) {
      const retry=await requestIdentity(env,body,`order_confirm_payment:${id}`);
      if (retry.replay) return retry.replay;
      return retry.error||json({error:"El pedido ya fue procesado."},409);
    }
    if (String(error?.message||error).includes("inventory_unavailable")) return json({error:"El inventario cambió y ya no alcanza para confirmar el pedido.",code:"stock_conflict"},409);
    throw error;
  }
  return json(responsePayload,201);
}

async function addOrderPayment(request,env,url) {
  const session=await requireSession(request,env);
  if(session instanceof Response)return session;
  const orderId=url.pathname.split("/").filter(Boolean)[3]||"";
  if(!/^[a-f0-9-]{36}$/.test(orderId))return json({error:"Pedido inválido"},400);
  const preview=await request.clone().json().catch(()=>({}));
  const key=cleanText(preview.idempotencyKey,100);
  if(key){
    const prior=await env.DB.prepare("SELECT operation FROM idempotency_keys WHERE idempotency_key=?").bind(key).first();
    if(prior?.operation===`order_confirm_payment:${orderId}`)return confirmOrderPayment(request,env,new URL(`${url.origin}/v1/admin/orders/${orderId}/confirm-payment`));
  }
  const order=await env.DB.prepare("SELECT status FROM stock_orders WHERE id=?").bind(orderId).first();
  if (!order) return json({error:"Pedido no encontrado"},404);
  if (order.status==="reserved") return confirmOrderPayment(request,env,new URL(`${url.origin}/v1/admin/orders/${orderId}/confirm-payment`));
  if (order.status!=="confirmed") return json({error:`El pedido está ${order.status}.`},409);
  const sale=await env.DB.prepare("SELECT id FROM sales WHERE order_id=?").bind(orderId).first();
  if (!sale) return json({error:"No encontramos la venta asociada."},409);
  return addSalePayment(request,env,new URL(`${url.origin}/v1/admin/sales/${sale.id}/payments`));
}

async function putCatalog(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > MAX_CATALOG_BYTES) return json({ error: "El catálogo supera el tamaño permitido" }, 413);
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Catálogo inválido" }, 400); }
  const validationError = validateCatalog(payload.state);
  if (validationError) return json({ error: validationError }, 400);
  const existing = await env.DB.prepare("SELECT state_json AS stateJson, revision FROM catalog_state WHERE id = 'published'").first();
  const expectedRevision = Number(payload.expectedRevision);
  const currentRevision = Number(existing?.revision || 0);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) return json({ error: "El catálogo cambió en otro dispositivo", revision: currentRevision }, 409);
  const previousState = existing?.stateJson ? JSON.parse(existing.stateJson) : null;
  const introducedBuilderSkus = newlyIntroducedBuilderInventorySkus(previousState, payload.state);
  for (let index = 0; index < introducedBuilderSkus.length; index += 80) {
    const chunk = introducedBuilderSkus.slice(index, index + 80);
    const placeholders = chunk.map(() => "?").join(",");
    const historical = await env.DB.prepare(`SELECT sku FROM inventory_items WHERE sku IN (${placeholders}) LIMIT 1`).bind(...chunk).first();
    if (historical) return json({
      error: "Una clave de inventario nueva ya pertenece a un sabor eliminado. Recarga el panel antes de publicar.",
      code: "inventory_key_reuse"
    }, 409);
  }
  const revision = currentRevision + 1;
  const now = new Date().toISOString();
  const stateJson = JSON.stringify({ ...payload.state, version: 2, updatedAt: now });
  let saved;
  if (existing) {
    saved = await env.DB.prepare("UPDATE catalog_state SET state_json = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = 'published' AND revision = ?").bind(stateJson, revision, now, session.username, expectedRevision).run();
  } else {
    try {
      saved = await env.DB.prepare("INSERT INTO catalog_state (id, state_json, revision, updated_at, updated_by) VALUES ('published', ?, ?, ?, ?)").bind(stateJson, revision, now, session.username).run();
    } catch {
      return json({ error: "El catálogo cambió en otro dispositivo" }, 409);
    }
  }
  if (Number(saved?.meta?.changes || 0) !== 1) return json({ error: "El catálogo cambió en otro dispositivo" }, 409);
  await syncInventoryDefinitions(env, JSON.parse(stateJson), session.username);
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'catalog_save', ?, ?)").bind(session.username, `Revisión ${revision}`, now).run();
  return json({ ok: true, revision, updatedAt: now, state: JSON.parse(stateJson) });
}

async function uploadImage(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const formData = await request.formData();
  const file = formData.get("image");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Selecciona una imagen" }, 400);
  if (!IMAGE_TYPES.has(file.type)) return json({ error: "Usa una imagen JPG, PNG o WebP" }, 415);
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return json({ error: "La imagen debe pesar menos de 1,5 MB" }, 413);
  const bytes = await file.arrayBuffer();
  const id = `${Date.now().toString(36)}-${randomToken(12)}`;
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO catalog_images (id, mime_type, image_data, size_bytes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, file.type, bytes, file.size, now, session.username).run();
  const imageUrl = `${new URL(request.url).origin}/v1/images/${id}`;
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'image_upload', ?, ?)").bind(session.username, id, now).run();
  return json({ ok: true, id, url: imageUrl, size: file.size }, 201);
}

function cleanText(value, maximum = 500) {
  return String(value || "").trim().slice(0, maximum);
}

function snapshotImageUrl(value) {
  const url = cleanText(value, 1000);
  if (!url || /^(?:data|javascript):/i.test(url)) return "";
  return url;
}

function structuredAuditStatement(env, username, action, entityType, entityId, details, now = new Date().toISOString()) {
  const detailsJson = JSON.stringify(details || {}).slice(0, 12000);
  const summary = cleanText(details?.summary || `${entityType}:${entityId}`, 1000);
  return env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(username, action, summary, now, entityType, entityId, detailsJson);
}

async function prepareMutationGuard(env,entityType,entityId,expectedVersion) {
  const row=await env.DB.prepare("SELECT COALESCE(MAX(version),0) AS version FROM entity_mutation_claims WHERE entity_type=? AND entity_id=?").bind(entityType,entityId).first();
  const currentVersion=Number(row?.version||0);
  if(!Number.isSafeInteger(currentVersion)||currentVersion<0)throw new Error("invalid_mutation_version");
  if(expectedVersion!==undefined&&expectedVersion!==null&&expectedVersion!==""){
    const supplied=Number(expectedVersion);
    if(!Number.isSafeInteger(supplied)||supplied<0)return {error:json({error:"La versión esperada no es válida.",code:"invalid_expected_version"},400)};
    if(supplied!==currentVersion)return {error:staleStateResponse(currentVersion)};
  }
  return {entityType,entityId,currentVersion,nextVersion:currentVersion+1};
}

function mutationClaimStatement(env,guard,operation,requestKey,username,now) {
  return env.DB.prepare("INSERT INTO entity_mutation_claims (entity_type,entity_id,version,operation,request_key,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(guard.entityType,guard.entityId,guard.nextVersion,operation,cleanText(requestKey,100),username,now);
}

function isMutationConflict(error) {
  return /entity_mutation_claims/i.test(String(error?.message||error))&&/UNIQUE|constraint/i.test(String(error?.message||error));
}

function staleStateResponse(currentVersion) {
  return json({error:"El registro cambió mientras se procesaba la solicitud. Recarga y vuelve a intentarlo.",code:"stale_state",currentVersion:Number.isSafeInteger(Number(currentVersion))?Number(currentVersion):undefined},409);
}

async function requestIdentity(env, body, operation) {
  const key = cleanText(body?.idempotencyKey, 100);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) return { error: json({error:"Incluye una clave de idempotencia válida.",code:"invalid_idempotency_key"},400) };
  const requestHash = await sha256(canonicalJson(body));
  const existing = await env.DB.prepare("SELECT operation, request_hash AS requestHash, response_json AS responseJson FROM idempotency_keys WHERE idempotency_key = ?").bind(key).first();
  if (existing) {
    if (existing.operation !== operation || existing.requestHash !== requestHash) return { error: json({error:"Esa clave de idempotencia ya se usó con otros datos.",code:"idempotency_conflict"},409) };
    let response={};try{response=JSON.parse(existing.responseJson||"{}");}catch{}
    return { replay: json({...response,replayed:true}) };
  }
  return { key, requestHash };
}

async function normalizedCustomerRecord(env, raw, fallback, session, { required = true } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const name = cleanText(source.name || fallback?.name, 100);
  const phone = cleanText(source.phone || fallback?.phone, 40);
  const normalizedPhone = normalizePhone(phone);
  if (required && (!name || !normalizedPhone)) return {error:"Indica nombre y teléfono válido del cliente."};
  if (!name && !normalizedPhone) return {record:null,statements:[]};
  if (!normalizedPhone) return {error:"El teléfono del cliente no es válido."};
  const existing = await env.DB.prepare("SELECT id, email, default_address AS defaultAddress, internal_notes AS internalNotes FROM customers WHERE normalized_phone = ?").bind(normalizedPhone).first();
  const id = existing?.id || `cus-${(await sha256(normalizedPhone)).slice(0,36)}`;
  const now = new Date().toISOString();
  const record = {
    id,
    normalizedPhone,
    phone,
    name,
    email:cleanText(source.email || existing?.email,160),
    defaultAddress:cleanText(source.address || source.defaultAddress || existing?.defaultAddress,500),
    internalNotes:cleanText(source.notes || source.internalNotes || existing?.internalNotes,2000)
  };
  const statement = env.DB.prepare(`INSERT INTO customers (id, normalized_phone, phone, name, email, default_address, internal_notes, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_phone) DO UPDATE SET phone=excluded.phone, name=excluded.name,
      email=CASE WHEN excluded.email <> '' THEN excluded.email ELSE customers.email END,
      default_address=CASE WHEN excluded.default_address <> '' THEN excluded.default_address ELSE customers.default_address END,
      internal_notes=CASE WHEN excluded.internal_notes <> '' THEN excluded.internal_notes ELSE customers.internal_notes END,
      updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
    .bind(id,normalizedPhone,phone,name,record.email,record.defaultAddress,record.internalNotes,now,session.username,now,session.username);
  return {record,statements:[statement]};
}

function publicRate(row, requestedDate = "") {
  if (!row) return null;
  return {
    id:row.id,
    currency:row.currency,
    rateScaled:Number(row.rateScaled),
    rateScale:Number(row.rateScale || BCV_RATE_SCALE),
    valueDate:row.valueDate,
    observedAt:row.observedAt,
    sourceUrl:row.sourceUrl,
    sourceKind:row.sourceKind,
    status:row.validationStatus,
    exact:Boolean(requestedDate && row.valueDate === requestedDate)
  };
}

async function rateById(env, id) {
  if (!id) return null;
  return env.DB.prepare(`SELECT id, currency, rate_scaled AS rateScaled, rate_scale AS rateScale,
    value_date AS valueDate, observed_at AS observedAt, source_url AS sourceUrl,
    source_kind AS sourceKind, validation_status AS validationStatus
    FROM exchange_rates WHERE id = ?`).bind(cleanText(id,120)).first();
}

async function rateForDate(env, currency, valueDate, { allowPrior = false } = {}) {
  const comparator = allowPrior ? "<=" : "=";
  const row=await env.DB.prepare(`SELECT id, currency, rate_scaled AS rateScaled, rate_scale AS rateScale,
    value_date AS valueDate, observed_at AS observedAt, source_url AS sourceUrl,
    source_kind AS sourceKind, validation_status AS validationStatus
    FROM exchange_rates WHERE currency = ? AND value_date ${comparator} ?
    ORDER BY value_date DESC, CASE validation_status WHEN 'official' THEN 0 ELSE 1 END, observed_at DESC LIMIT 1`)
    .bind(currency,valueDate).first();
  return row&&(!allowPrior||rateValueDateAllowed(valueDate,row.valueDate,{maxPastDays:3,maxFutureDays:0}))?row:null;
}

async function latestObservedRate(env,currency,requestedDate){
  const row=await env.DB.prepare(`SELECT id,currency,rate_scaled AS rateScaled,rate_scale AS rateScale,value_date AS valueDate,observed_at AS observedAt,source_url AS sourceUrl,source_kind AS sourceKind,validation_status AS validationStatus
    FROM exchange_rates WHERE currency=? ORDER BY observed_at DESC,value_date DESC LIMIT 1`).bind(currency).first();
  if(!row)return null;
  return rateValueDateAllowed(requestedDate,row.valueDate,{maxPastDays:3,maxFutureDays:3})?row:null;
}

function officialSourceUrl(value) {
  const source = cleanText(value || "https://www.bcv.org.ve/",500);
  try {
    const url = new URL(source);
    return url.protocol === "https:" && (url.hostname === "bcv.org.ve" || url.hostname.endsWith(".bcv.org.ve")) ? url.toString() : "";
  } catch { return ""; }
}

async function manualRateRecord(raw, currency, session, now) {
  if (session.role !== "owner") return {error:"Solo la cuenta propietaria puede confirmar una tasa manual."};
  const source = raw?.manualRate && typeof raw.manualRate === "object" ? raw.manualRate : raw || {};
  const rateScaled = validScaledInteger(source.rateScaled ?? raw?.exchangeRateScaled);
  const valueDate = cleanText(source.valueDate || raw?.exchangeRateValueDate,10);
  const reason = cleanText(source.reason || raw?.manualRateReason,500);
  const sourceUrl = officialSourceUrl(source.sourceUrl || raw?.exchangeRateSourceUrl);
  if (!rateScaled || !isIsoDate(valueDate) || reason.length < 8 || !sourceUrl) return {error:"La tasa manual necesita valor, Fecha Valor, enlace oficial del BCV y motivo."};
  const id = crypto.randomUUID();
  return {record:{id,currency,rateScaled,rateScale:BCV_RATE_SCALE,valueDate,observedAt:now,sourceUrl,sourceKind:"manual_official",validationStatus:"manual_confirmed",manualReason:reason}};
}

function rateInsertStatement(env, rate, username, now) {
  return env.DB.prepare(`INSERT INTO exchange_rates (id, provider, currency, rate_scaled, rate_scale, rate_side, value_date, observed_at, source_url, source_kind, source_hash, manual_reason, validation_status, created_by, created_at, updated_at)
    VALUES (?, 'BCV', ?, ?, 8, 'reference', ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`)
    .bind(rate.id,rate.currency,rate.rateScaled,rate.valueDate,rate.observedAt,rate.sourceUrl,rate.sourceKind,rate.manualReason||"",rate.validationStatus,username,now,now);
}

async function resolvePaymentPayloads(env, rawPayments, referenceCurrency, session, defaultValueDate) {
  if (!Array.isArray(rawPayments) || rawPayments.length > 10) return {error:"Los pagos deben ser una lista de hasta 10 movimientos."};
  const reference = String(referenceCurrency || "USD").toUpperCase();
  if (!SUPPORTED_REFERENCE_CURRENCIES.has(reference)) return {error:"La base de referencia debe ser USD o EUR."};
  const now = new Date().toISOString();
  const payments=[];
  const newRates=[];
  for (const raw of rawPayments) {
    const paymentDate=cleanText(raw?.paymentDate||raw?.soldAt||defaultValueDate,10);
    if(!isIsoDate(paymentDate))return {error:"La fecha del pago no es válida."};
    const currency = String(raw?.currency || "").toUpperCase();
    const amountScale = paymentScale(currency, raw?.amountScale);
    const amountMinor = validScaledInteger(raw?.amountMinor);
    const method = cleanText(raw?.method,80);
    if (!SUPPORTED_PAYMENT_CURRENCIES.has(currency) || !amountScale || !amountMinor || !method) return {error:"Cada pago necesita monto entero, moneda VES/USD/EUR y método."};
    if ((currency === "USD" || currency === "EUR") && currency !== reference) return {error:`Un pago ${currency} no puede aplicarse directamente a una venta con base ${reference}.`};

    let sourceRate=null;
    let usdRate=null;
    if (currency === "VES" || currency === "EUR") {
      const expectedBasis = currency === "EUR" ? "EUR" : String(raw.rateBasis || raw.manualRate?.basis || reference).toUpperCase();
      if (expectedBasis !== reference) return {error:`La base BCV del pago debe coincidir con ${reference}.`};
      sourceRate = await rateById(env, raw.exchangeRateId);
      if (sourceRate && sourceRate.currency !== expectedBasis) return {error:"La tasa seleccionada no coincide con la moneda base."};
      if (!sourceRate && currency === "EUR") {
        const lookupDate=cleanText(raw.exchangeRateValueDate||paymentDate,10);
        sourceRate=await rateForDate(env,"EUR",lookupDate,{allowPrior:true})||await latestObservedRate(env,"EUR",lookupDate);
      }
      if (!sourceRate) {
        const manual = await manualRateRecord(raw,expectedBasis,session,now);
        if (manual.error) return manual;
        sourceRate=manual.record;
        newRates.push(sourceRate);
      }
      if(!rateValueDateAllowed(paymentDate,sourceRate.valueDate,{maxPastDays:3,maxFutureDays:3}))return {error:"La Fecha Valor de la tasa está demasiado lejos de la fecha del pago."};
      if (sourceRate.currency === "USD") usdRate=sourceRate;
      else {
        usdRate=await rateForDate(env,"USD",sourceRate.valueDate);
        if (!usdRate) return {error:`Falta la tasa oficial USD con Fecha Valor ${sourceRate.valueDate}; actualízala antes de confirmar.`};
      }
      if (raw.exchangeRateValueDate && raw.exchangeRateValueDate !== sourceRate.valueDate) return {error:"La Fecha Valor no coincide con la tasa seleccionada."};
    }
    const referenceAmountCents = referenceCentsForPayment({amountMinor,amountScale,currency,referenceCurrency:reference,rateBasis:sourceRate?.currency,rateScaled:sourceRate?.rateScaled});
    const functionalAmountCents = functionalUsdCentsForPayment({amountMinor,amountScale,currency,usdRateScaled:usdRate?.rateScaled,eurRateScaled:sourceRate?.currency==="EUR"?sourceRate.rateScaled:null});
    if (!referenceAmountCents || !functionalAmountCents) return {error:"El pago es demasiado pequeño, no cuadra con la base elegida o no tiene tasas suficientes."};
    const suppliedReference = raw.referenceAmountCents === undefined ? null : validScaledInteger(raw.referenceAmountCents,{allowZero:true});
    if (suppliedReference !== null && Math.abs(suppliedReference-referenceAmountCents)>1) return {error:"El equivalente indicado no coincide con la conversión exacta del servidor."};
    payments.push({
      id:crypto.randomUUID(),currency,amountMinor,amountScale,method,referenceCurrency:reference,referenceAmountCents,functionalAmountCents,
      exchangeRateId:sourceRate?.id||null,rateBasis:sourceRate?.currency||null,rateScaled:sourceRate?.rateScaled||null,rateValueDate:sourceRate?.valueDate||null,
      rateSourceUrl:sourceRate?.sourceUrl||"",rateSourceKind:sourceRate?.sourceKind||"",
      functionalExchangeRateId:usdRate?.id||null,functionalRateScaled:usdRate?.rateScaled||null,functionalRateValueDate:usdRate?.valueDate||null,
      paymentDate,transactionReference:cleanText(raw.reference || raw.transactionReference,160),notes:cleanText(raw.notes,1000)
    });
  }
  return {payments,newRates:[...new Map(newRates.map(rate=>[rate.id,rate])).values()]};
}

function paymentAccountId(payment) {
  const method = `${payment.method} ${payment.transactionReference}`.toLowerCase();
  if (method.includes("efectivo") || method.includes("cash")) return `asset-cash-${payment.currency.toLowerCase()}`;
  if (method.includes("zelle")) return "asset-digital-usd";
  return `asset-bank-${payment.currency.toLowerCase()}`;
}

function balancedJournalStatements(env,{id=crypto.randomUUID(),entryDate,sourceType,sourceId,description,lines,username,now,reversalOfId=null}) {
  const debit=lines.reduce((sum,line)=>sum+Number(line.debit||0),0);
  const credit=lines.reduce((sum,line)=>sum+Number(line.credit||0),0);
  if (!debit || debit!==credit || lines.some(line=>(line.debit>0)===(line.credit>0))) throw new Error("unbalanced_journal");
  const statements=[env.DB.prepare("INSERT INTO journal_entries (id, entry_date, source_type, source_id, description, status, reversal_of_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?)")
    .bind(id,entryDate,sourceType,sourceId,description,reversalOfId,username,now)];
  for (const line of lines) statements.push(env.DB.prepare(`INSERT INTO journal_lines (id, journal_entry_id, account_id, functional_currency, debit_functional_cents, credit_functional_cents, original_currency, original_amount_minor, original_amount_scale, memo)
    VALUES (?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(),id,line.accountId,Number(line.debit||0),Number(line.credit||0),line.originalCurrency||"USD",Number(line.originalAmountMinor||0),Number(line.originalAmountScale||2),cleanText(line.memo,500)));
  return statements;
}

function saleJournalStatements(env,sale,username,now) {
  return balancedJournalStatements(env,{entryDate:sale.soldAt,sourceType:"sale",sourceId:sale.id,description:`Venta ${sale.id}`,username,now,lines:[
    {accountId:"asset-receivable-usd",debit:sale.functionalTotalCents,originalCurrency:sale.referenceCurrency,originalAmountMinor:sale.totalCents},
    {accountId:"income-sales-usd",credit:sale.functionalTotalCents,originalCurrency:sale.referenceCurrency,originalAmountMinor:sale.totalCents}
  ]});
}

function paymentJournalStatements(env,payment,sale,paidBeforeReferenceCents,username,now) {
  const allocation=deriveSettlementAllocation({saleTotalReferenceCents:sale.totalCents,saleFunctionalTotalCents:sale.functionalTotalCents,paidBeforeReferenceCents,paymentReferenceCents:payment.referenceAmountCents,paymentFunctionalCents:payment.functionalAmountCents});
  if(!allocation)throw new Error("invalid_settlement_allocation");
  const lines=[{accountId:paymentAccountId(payment),debit:payment.functionalAmountCents,originalCurrency:payment.currency,originalAmountMinor:payment.amountMinor,originalAmountScale:payment.amountScale}];
  if(allocation.fxLossFunctionalCents>0)lines.push({accountId:"expense-fx-loss-usd",debit:allocation.fxLossFunctionalCents,originalCurrency:"USD",originalAmountMinor:allocation.fxLossFunctionalCents});
  if(allocation.carryingReceivableCreditCents>0)lines.push({accountId:"asset-receivable-usd",credit:allocation.carryingReceivableCreditCents,originalCurrency:sale.referenceCurrency,originalAmountMinor:allocation.referenceAppliedCents});
  if(allocation.customerCreditFunctionalCents>0)lines.push({accountId:"liability-customer-credit-usd",credit:allocation.customerCreditFunctionalCents,originalCurrency:sale.referenceCurrency,originalAmountMinor:allocation.overpaymentReferenceCents});
  if(allocation.fxGainFunctionalCents>0)lines.push({accountId:"income-fx-gain-usd",credit:allocation.fxGainFunctionalCents,originalCurrency:"USD",originalAmountMinor:allocation.fxGainFunctionalCents});
  return {statements:balancedJournalStatements(env,{entryDate:payment.paymentDate,sourceType:"payment",sourceId:payment.id,description:`Cobro de venta ${sale.id}`,username,now,lines}),customerCredit:allocation.customerCreditFunctionalCents,allocation};
}

function paymentInsertStatement(env,payment,saleId,orderId,username,now) {
  return env.DB.prepare(`INSERT INTO payments (id, sale_id, order_id, status, method, paid_currency, amount_minor, amount_scale, reference_currency, reference_amount_cents,
    functional_currency, functional_amount_cents, exchange_rate_id, rate_basis, exchange_rate_scaled, exchange_rate_scale, exchange_rate_value_date,
    exchange_rate_source_url, exchange_rate_source_kind, functional_exchange_rate_id, functional_exchange_rate_scaled, functional_exchange_rate_value_date,
    transaction_reference, notes, payment_date, confirmed_by, confirmed_at)
    VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(payment.id,saleId,orderId||null,payment.method,payment.currency,payment.amountMinor,payment.amountScale,payment.referenceCurrency,payment.referenceAmountCents,payment.functionalAmountCents,
      payment.exchangeRateId,payment.rateBasis,payment.rateScaled,payment.rateScaled?BCV_RATE_SCALE:null,payment.rateValueDate,payment.rateSourceUrl,payment.rateSourceKind,
      payment.functionalExchangeRateId,payment.functionalRateScaled,payment.functionalRateValueDate,payment.transactionReference,payment.notes,payment.paymentDate,username,now);
}

async function refreshBcvRates(env) {
  const attemptedAt=new Date().toISOString();
  await env.DB.prepare("UPDATE exchange_rate_refresh_state SET last_attempt_at = ?, last_error = '' WHERE id = 'bcv-homepage'").bind(attemptedAt).run();
  try {
    const response=await fetch("https://www.bcv.org.ve/",{headers:{Accept:"text/html", "User-Agent":"FontanaInventory/1.0 (+https://fontanasingluten.com)"}});
    if (!response.ok) throw new Error(`bcv_http_${response.status}`);
    const html=await response.text();
    const parsed=parseBcvHtml(html);
    if (!parsed) throw new Error("bcv_parse_failed");
    const today=Date.parse(`${caracasDate()}T00:00:00Z`);
    const value=Date.parse(`${parsed.valueDate}T00:00:00Z`);
    if (!Number.isFinite(value) || Math.abs(value-today)>7*86400000) throw new Error("bcv_value_date_out_of_range");
    const sourceHash=await sha256(html);
    const now=new Date().toISOString();
    const statements=[];
    for (const currency of ["USD","EUR"]) {
      const id=`bcv-${currency.toLowerCase()}-${parsed.valueDate}-${sourceHash.slice(0,12)}`;
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO exchange_rates (id, provider, currency, rate_scaled, rate_scale, rate_side, value_date, observed_at, source_url, source_kind, source_hash, manual_reason, validation_status, created_by, created_at, updated_at)
        VALUES (?, 'BCV', ?, ?, 8, 'reference', ?, ?, 'https://www.bcv.org.ve/', 'official_html', ?, '', 'official', 'system', ?, ?)`)
        .bind(id,currency,parsed.rates[currency],parsed.valueDate,now,sourceHash,now,now));
    }
    statements.push(env.DB.prepare("UPDATE exchange_rate_refresh_state SET last_success_at = ?, last_value_date = ?, last_error = '' WHERE id = 'bcv-homepage'").bind(now,parsed.valueDate));
    await env.DB.batch(statements);
    return {ok:true,valueDate:parsed.valueDate,rates:parsed.rates};
  } catch (error) {
    const message=cleanText(error?.message||error,500);
    await env.DB.prepare("UPDATE exchange_rate_refresh_state SET last_error = ? WHERE id = 'bcv-homepage'").bind(message).run();
    throw error;
  }
}

async function refreshBcvRatesIfDue(env) {
  const state=await env.DB.prepare("SELECT last_attempt_at AS lastAttemptAt FROM exchange_rate_refresh_state WHERE id = 'bcv-homepage'").first();
  const last=Date.parse(state?.lastAttemptAt||"");
  if (Number.isFinite(last) && Date.now()-last<4*60*60*1000) return {ok:true,skipped:true};
  return refreshBcvRates(env);
}

async function listExchangeRates(request,env,url) {
  const session=await requireSession(request,env);
  if (session instanceof Response) return session;
  const date=cleanText(url.searchParams.get("date")||caracasDate(),10);
  if (!isIsoDate(date)) return json({error:"Fecha inválida"},400);
  let [USD,EUR,state]=await Promise.all([
    rateForDate(env,"USD",date,{allowPrior:true}),rateForDate(env,"EUR",date,{allowPrior:true}),
    env.DB.prepare("SELECT last_attempt_at AS lastAttemptAt, last_success_at AS lastSuccessAt, last_value_date AS lastValueDate, last_error AS lastError FROM exchange_rate_refresh_state WHERE id = 'bcv-homepage'").first()
  ]);
  if (!USD||!EUR) {
    try {await refreshBcvRates(env);} catch {}
    [USD,EUR,state]=await Promise.all([
      rateForDate(env,"USD",date,{allowPrior:true}),rateForDate(env,"EUR",date,{allowPrior:true}),
      env.DB.prepare("SELECT last_attempt_at AS lastAttemptAt, last_success_at AS lastSuccessAt, last_value_date AS lastValueDate, last_error AS lastError FROM exchange_rate_refresh_state WHERE id = 'bcv-homepage'").first()
    ]);
  }
  if(!USD)USD=await latestObservedRate(env,"USD",date);
  if(!EUR)EUR=await latestObservedRate(env,"EUR",date);
  return json({date,functionalCurrency:"USD",rates:{USD:publicRate(USD,date),EUR:publicRate(EUR,date)},refresh:state||{}},200,{"Cache-Control":"no-store"});
}

async function forceRefreshExchangeRates(request,env) {
  const session=await requireSession(request,env);
  if (session instanceof Response) return session;
  try {
    const refreshed=await refreshBcvRates(env);
    const now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at, entity_type, entity_id, details_json) VALUES (?, 'bcv_refresh', ?, ?, 'exchange_rate', ?, ?)")
      .bind(session.username,`BCV ${refreshed.valueDate}`,now,refreshed.valueDate,JSON.stringify(refreshed)).run();
    return json(refreshed);
  } catch { return json({error:"No se pudo actualizar la fuente oficial del BCV. Conservamos las tasas anteriores.",code:"bcv_unavailable"},503); }
}

async function createManualExchangeRate(request,env) {
  const session=await requireOwner(request,env);
  if (session instanceof Response) return session;
  const body=await request.json().catch(()=>({}));
  const currency=String(body.currency||"").toUpperCase();
  if (!SUPPORTED_REFERENCE_CURRENCIES.has(currency)) return json({error:"Moneda inválida"},400);
  const manual=await manualRateRecord({manualRate:{...body,basis:currency}},currency,session,new Date().toISOString());
  if (manual.error) return json({error:manual.error},400);
  const now=new Date().toISOString();
  await env.DB.batch([
    rateInsertStatement(env,manual.record,session.username,now),
    structuredAuditStatement(env,session.username,"exchange_rate_manual","exchange_rate",manual.record.id,{currency,valueDate:manual.record.valueDate,reason:manual.record.manualReason},now)
  ]);
  return json({ok:true,rate:publicRate(manual.record,manual.record.valueDate)},201);
}

async function listCustomers(request,env,url) {
  const session=await requireSession(request,env);
  if (session instanceof Response) return session;
  const search=cleanText(url.searchParams.get("search"),100);
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get("limit"))||200));
  const like=`%${search.replace(/[\\%_]/g,"\\$&")}%`;
  const result=await env.DB.prepare(`SELECT c.id, c.name, c.phone, c.normalized_phone AS normalizedPhone, c.email, c.default_address AS defaultAddress,
    MIN(CASE WHEN s.status='confirmed' THEN s.sold_at END) AS firstPurchaseAt,
    MAX(CASE WHEN s.status='confirmed' THEN s.sold_at END) AS lastPurchaseAt,
    COUNT(CASE WHEN s.status='confirmed' THEN 1 END) AS confirmedSalesCount,
    COALESCE(SUM(CASE WHEN s.status='confirmed' THEN s.functional_total_cents ELSE 0 END),0) AS lifetimeFunctionalUsdCents
    FROM customers c LEFT JOIN sales s ON s.customer_id=c.id
    WHERE c.archived_at IS NULL AND (?='' OR c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.normalized_phone LIKE ? ESCAPE '\\')
    GROUP BY c.id ORDER BY lastPurchaseAt DESC, c.updated_at DESC LIMIT ?`).bind(search,like,like,like,limit).all();
  const [paymentStats,balanceRows]=await Promise.all([
    env.DB.prepare("SELECT s.customer_id AS customerId,SUM(p.functional_amount_cents) AS collected FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.status='confirmed' AND s.customer_id IS NOT NULL GROUP BY s.customer_id").all(),
    env.DB.prepare("SELECT s.id,s.customer_id AS customerId,s.total_cents AS totalCents,s.functional_total_cents AS functionalTotalCents,COALESCE(SUM(CASE WHEN p.status='confirmed' THEN p.reference_amount_cents ELSE 0 END),0) AS paidReferenceCents FROM sales s LEFT JOIN payments p ON p.sale_id=s.id WHERE s.status='confirmed' AND s.customer_id IS NOT NULL GROUP BY s.id").all()
  ]);
  const collectedMap=new Map((paymentStats.results||[]).map(row=>[row.customerId,Number(row.collected||0)])),outstandingMap=new Map();
  for(const row of balanceRows.results||[]){const state=derivePaymentStatus(Number(row.totalCents),Number(row.paidReferenceCents));const carryingPaid=state?Number(row.functionalTotalCents||0)-Math.round(Number(row.functionalTotalCents||0)*state.balanceRefCents/Math.max(1,Number(row.totalCents))):0;const outstanding=Math.max(0,Number(row.functionalTotalCents||0)-carryingPaid);outstandingMap.set(row.customerId,(outstandingMap.get(row.customerId)||0)+outstanding);}
  const items=(result.results||[]).map(item=>({...item,confirmedSalesCount:Number(item.confirmedSalesCount||0),lifetimeFunctionalUsdCents:Number(item.lifetimeFunctionalUsdCents||0),collectedFunctionalUsdCents:collectedMap.get(item.id)||0,outstandingFunctionalUsdCents:outstandingMap.get(item.id)||0,averageTicketFunctionalUsdCents:Number(item.confirmedSalesCount||0)?Math.round(Number(item.lifetimeFunctionalUsdCents||0)/Number(item.confirmedSalesCount)):0,recurrent:Number(item.confirmedSalesCount||0)>=2}));
  return json({items,summary:{total:items.length,recurrent:items.filter(item=>item.recurrent).length,functionalCurrency:"USD"}});
}

async function getCustomer(request,env,url) {
  const session=await requireSession(request,env);
  if (session instanceof Response) return session;
  const id=decodeURIComponent(url.pathname.split("/").pop()||"");
  if (!/^cus-[a-zA-Z0-9_-]{20,50}$/.test(id)) return json({error:"Cliente inválido"},400);
  const customer=await env.DB.prepare("SELECT id,name,phone,normalized_phone AS normalizedPhone,email,default_address AS defaultAddress,internal_notes AS internalNotes,created_at AS createdAt,updated_at AS updatedAt FROM customers WHERE id=? AND archived_at IS NULL").bind(id).first();
  if (!customer) return json({error:"Cliente no encontrado"},404);
  const saleRows=await env.DB.prepare(`SELECT id,sold_at AS soldAt,total_cents AS totalCents,currency,reference_currency AS referenceCurrency,functional_total_cents AS functionalTotalCents,status,payment_status AS paymentStatus,channel,notes,
    COALESCE((SELECT MAX(version) FROM entity_mutation_claims WHERE entity_type='sale' AND entity_id=sales.id),0) AS mutationVersion
    FROM sales WHERE customer_id=? ORDER BY sold_at DESC,created_at DESC LIMIT 250`).bind(id).all();
  const sales=[];
  for (const sale of saleRows.results||[]) {
    const [itemRows,paymentRows]=await Promise.all([
      env.DB.prepare("SELECT product_id AS productId,sku,item_name_snapshot AS name,option_summary_snapshot AS optionSummary,image_url_snapshot AS imageUrl,quantity,unit_price_cents AS unitPriceCents,line_total_cents AS lineTotalCents,price_currency AS priceCurrency FROM sale_items WHERE sale_id=? ORDER BY rowid").bind(sale.id).all(),
      env.DB.prepare("SELECT id,status,method,paid_currency AS currency,amount_minor AS amountMinor,amount_scale AS amountScale,reference_currency AS referenceCurrency,reference_amount_cents AS referenceAmountCents,functional_amount_cents AS functionalAmountCents,rate_basis AS rateBasis,exchange_rate_id AS exchangeRateId,exchange_rate_scaled AS exchangeRateScaled,exchange_rate_value_date AS exchangeRateValueDate,functional_exchange_rate_id AS functionalExchangeRateId,functional_exchange_rate_scaled AS functionalExchangeRateScaled,functional_exchange_rate_value_date AS functionalExchangeRateValueDate,payment_date AS paymentDate,transaction_reference AS reference,notes,confirmed_at AS confirmedAt FROM payments WHERE sale_id=? ORDER BY confirmed_at").bind(sale.id).all()
    ]);
    sales.push({...sale,functionalTotalCents:Number(sale.functionalTotalCents||0),items:itemRows.results||[],payments:paymentRows.results||[]});
  }
  const confirmed=sales.filter(sale=>sale.status==="confirmed");
  return json({customer:{...customer,confirmedSalesCount:confirmed.length,recurrent:confirmed.length>=2,lifetimeFunctionalUsdCents:confirmed.reduce((sum,sale)=>sum+Number(sale.functionalTotalCents||0),0)},sales,functionalCurrency:"USD"});
}

function catalogProductPrice(product,definition) {
  const size=(product?.sizes||[]).find(option=>option.name===definition?.sizeName)||null;
  return Number(size?.price??product?.price);
}

function builderFlavorForDefinition(state,definition) {
  if (!definition||!/^builder:(fonkies|fomb):/.test(definition.sku)) return null;
  const kind=definition.kind;
  const key=definition.sku.split(":").slice(2).join(":");
  const builder=state?.builders?.[kind];
  const flavor=(builder?.flavors||[]).find(item=>String(item.inventoryKey||"")===key)||null;
  return flavor?{builder,flavor}:null;
}

async function normalizeManualSaleItems(env,rawItems,referenceCurrency,session) {
  if (!Array.isArray(rawItems)||!rawItems.length||rawItems.length>100) return {error:"Incluye entre 1 y 100 productos."};
  const state=await publishedState(env);
  if (!state) return {error:"El catálogo no está configurado."};
  const definitions=await syncInventoryDefinitions(env,state,session.username);
  const definitionMap=new Map(definitions.map(definition=>[definition.sku,definition]));
  const productMap=new Map((state.products||[]).filter(product=>!product.deleted).map(product=>[product.id,product]));
  const items=[];
  const demands=new Map();
  const skipped=[];
  const adjustments=[];
  for (const raw of rawItems) {
    const quantity=validScaledInteger(raw?.quantity);
    if (!quantity||quantity>1000) return {error:"Cantidad de producto inválida."};
    const requestedPrice=validScaledInteger(raw.unitPriceCents??raw.unitPriceRefCents,{allowZero:true});
    if (requestedPrice===null) return {error:"Cada producto necesita precio entero en centavos."};
    const inventoryUnits=Array.isArray(raw.inventoryUnits)&&raw.inventoryUnits.length?raw.inventoryUnits:(raw.sku?[{sku:raw.sku,quantity}]:[]);
    const skipInventory=raw.skipInventory===true||raw.custom===true;
    if (!inventoryUnits.length&&!skipInventory) return {error:"Cada producto de catálogo necesita SKU/inventoryUnits; marca skipInventory solo para una línea personalizada."};
    let definition=null;
    for (const unit of inventoryUnits) {
      const sku=cleanText(unit?.sku,240);
      const units=validScaledInteger(unit?.quantity);
      const found=definitionMap.get(sku);
      if (!found||!units) return {error:`SKU de inventario inválido: ${sku||"vacío"}.`};
      if(definition&&definition.productId!==found.productId)return {error:"Una línea no puede mezclar SKUs de productos distintos."};
      definition=definition||found;
      demands.set(sku,(demands.get(sku)||0)+units);
    }
    let name=cleanText(raw.name,200);
    let imageUrl=snapshotImageUrl(raw.imageUrl);
    let optionSummary=cleanText(raw.optionSummary,1000);
    let productId=cleanText(raw.productId||definition?.productId,100)||null;
    if(raw.productId&&definition&&raw.productId!==definition.productId)return {error:"El SKU no pertenece al producto seleccionado."};
    let canonicalPrice=null;
    const product=productMap.get(productId);
    if (product&&definition) {
      name=product.name;
      imageUrl=snapshotImageUrl(product.image);
      optionSummary=definition.optionSummary||optionSummary;
      const price=catalogProductPrice(product,definition);
      if (Number.isFinite(price)&&price>=0) canonicalPrice=Math.round(price*100);
    } else if (definition) {
      const builderFlavor=builderFlavorForDefinition(state,definition);
      name=builderFlavor?.flavor?.name||definition.label;
      imageUrl=snapshotImageUrl(builderFlavor?.flavor?.image||builderFlavor?.builder?.image);
      optionSummary=definition.optionSummary||optionSummary;
    }
    let unitPriceCents=canonicalPrice??requestedPrice;
    if (canonicalPrice!==null&&requestedPrice!==canonicalPrice) {
      const reason=cleanText(raw.priceOverrideReason,500);
      if (session.role!=="owner"||reason.length<8) return {error:`El precio de ${name} cambió; solo la propietaria puede sobrescribirlo indicando el motivo.`};
      unitPriceCents=requestedPrice;
      adjustments.push({name,reason,canonicalPriceCents:canonicalPrice,appliedPriceCents:requestedPrice});
    }
    if(definition&&!product&&canonicalPrice===null){const reason=cleanText(raw.priceOverrideReason,500);if(reason.length<8)return {error:`${name} necesita motivo de asignación manual porque su presentación no tiene precio unitario directo.`};adjustments.push({name,reason,canonicalPriceCents:null,appliedPriceCents:requestedPrice});}
    if (!name) return {error:"La línea personalizada necesita nombre."};
    if (skipInventory) skipped.push({name,reason:cleanText(raw.skipInventoryReason||"Línea personalizada",500)});
    items.push({id:crypto.randomUUID(),productId,sku:inventoryUnits.length===1?cleanText(inventoryUnits[0].sku,240):null,inventoryUnits:inventoryUnits.map(unit=>({sku:cleanText(unit.sku,240),quantity:Number(unit.quantity)})),name,optionSummary,imageUrl,quantity,unitPriceCents,lineTotalCents:unitPriceCents*quantity,priceCurrency:referenceCurrency});
  }
  const inventory=[];
  for (const [sku,quantity] of demands) {
    const row=await env.DB.prepare("SELECT sku,on_hand AS onHand,reserved,track_stock AS trackStock,active FROM inventory_items WHERE sku=?").bind(sku).first();
    if (!row||!row.active) return {error:`El SKU ${sku} ya no está activo.`};
    if (row.trackStock&&Number(row.onHand)-Number(row.reserved)<quantity) return {error:`No hay stock suficiente para ${sku}.`,code:"stock_conflict"};
    inventory.push({sku,quantity,trackStock:Boolean(row.trackStock)});
  }
  return {items,inventory,skipped,adjustments,totalCents:items.reduce((sum,item)=>sum+item.lineTotalCents,0)};
}

function manualInventoryStatements(env,inventory,saleId,session,now) {
  const statements=[];
  for (const item of inventory.filter(item=>item.trackStock)) {
    statements.push(env.DB.prepare("UPDATE inventory_items SET on_hand=CASE WHEN on_hand-reserved>=? THEN on_hand-? ELSE -1 END,updated_at=?,updated_by=? WHERE sku=? AND track_stock=1").bind(item.quantity,item.quantity,now,session.username,item.sku));
    statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku,sale_id,movement_type,delta_on_hand,delta_reserved,note,actor,created_at) VALUES (?,?,'sale',?,0,'Venta manual',?,?)").bind(item.sku,saleId,-item.quantity,session.username,now));
  }
  return statements;
}

async function listSales(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const [result,itemRows,paymentRows]=await Promise.all([
    env.DB.prepare(`SELECT id,sold_at AS soldAt,total_cents AS totalCents,currency,reference_currency AS referenceCurrency,functional_currency AS functionalCurrency,
      functional_total_cents AS functionalTotalCents,reference_exchange_rate_id AS referenceExchangeRateId,reference_exchange_rate_scaled AS referenceExchangeRateScaled,reference_exchange_rate_value_date AS referenceExchangeRateValueDate,
      functional_exchange_rate_id AS functionalExchangeRateId,functional_exchange_rate_scaled AS functionalExchangeRateScaled,functional_exchange_rate_value_date AS functionalExchangeRateValueDate,status,payment_status AS paymentStatus,channel,payment_method AS paymentMethod,customer_id AS customerId,
      customer_name AS customerName,customer_phone AS customerPhone,items_text AS itemsText,notes,order_id AS orderId,voided_at AS voidedAt,void_reason AS voidReason,
      created_by AS createdBy,created_at AS createdAt,updated_by AS updatedBy,updated_at AS updatedAt,
      COALESCE((SELECT MAX(version) FROM entity_mutation_claims WHERE entity_type='sale' AND entity_id=sales.id),0) AS mutationVersion
      FROM sales ORDER BY sold_at DESC,created_at DESC LIMIT 1000`).all(),
    env.DB.prepare("SELECT id,sale_id AS saleId,product_id AS productId,sku,item_name_snapshot AS name,option_summary_snapshot AS optionSummary,image_url_snapshot AS imageUrl,quantity,price_currency AS priceCurrency,unit_price_cents AS unitPriceCents,line_total_cents AS lineTotalCents FROM sale_items ORDER BY created_at,id").all(),
    env.DB.prepare("SELECT id,sale_id AS saleId,status,method,paid_currency AS currency,amount_minor AS amountMinor,amount_scale AS amountScale,reference_currency AS referenceCurrency,reference_amount_cents AS referenceAmountCents,functional_amount_cents AS functionalAmountCents,rate_basis AS rateBasis,exchange_rate_id AS exchangeRateId,exchange_rate_scaled AS exchangeRateScaled,exchange_rate_value_date AS exchangeRateValueDate,functional_exchange_rate_id AS functionalExchangeRateId,functional_exchange_rate_scaled AS functionalExchangeRateScaled,functional_exchange_rate_value_date AS functionalExchangeRateValueDate,payment_date AS paymentDate,transaction_reference AS reference,notes,confirmed_at AS confirmedAt FROM payments ORDER BY confirmed_at,id").all()
  ]);
  const bySale=(rows)=>{const map=new Map();for(const row of rows||[]){if(!map.has(row.saleId))map.set(row.saleId,[]);map.get(row.saleId).push(row);}return map;};
  const itemsBySale=bySale(itemRows.results),paymentsBySale=bySale(paymentRows.results);
  const items=(result.results||[]).map(sale=>({...sale,functionalTotalCents:Number(sale.functionalTotalCents||0),items:itemsBySale.get(sale.id)||[],payments:paymentsBySale.get(sale.id)||[]}));
  const today = caracasDate();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const confirmed = items.filter(item => item.status === "confirmed");
  const sumFunctional = values => values.reduce((total, item) => total + Number(item.functionalTotalCents || 0), 0);
  const totalsByCurrency={};
  for(const sale of confirmed) totalsByCurrency[sale.referenceCurrency]=(totalsByCurrency[sale.referenceCurrency]||0)+Number(sale.totalCents||0);
  return json({
    items,
    summary: {
      functionalCurrency:"USD",
      todayFunctionalUsdCents:sumFunctional(confirmed.filter(item => item.soldAt === today)),
      monthFunctionalUsdCents:sumFunctional(confirmed.filter(item => String(item.soldAt).startsWith(month))),
      yearFunctionalUsdCents:sumFunctional(confirmed.filter(item => String(item.soldAt).startsWith(year))),
      allFunctionalUsdCents:sumFunctional(confirmed),
      todayCents:sumFunctional(confirmed.filter(item => item.soldAt === today)),
      monthCents:sumFunctional(confirmed.filter(item => String(item.soldAt).startsWith(month))),
      yearCents:sumFunctional(confirmed.filter(item => String(item.soldAt).startsWith(year))),
      allCents:sumFunctional(confirmed),
      totalsByCurrency,
      confirmedCount: confirmed.length,
      pendingCount: items.filter(item => item.status === "pending").length,
      partialCount:items.filter(item=>item.paymentStatus==="partial").length
    }
  });
}

function validatedSale(body) {
  const soldAt = String(body.soldAt || "").trim();
  const total = Number(body.total);
  const status = ["confirmed", "pending", "cancelled"].includes(body.status) ? body.status : "confirmed";
  const items = String(body.items || "").trim().slice(0, 4000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldAt) || !Number.isFinite(total) || total < 0 || !items) return null;
  return {
    soldAt,
    totalCents: Math.round(total * 100),
    status,
    channel: String(body.channel || "WhatsApp").trim().slice(0, 60),
    paymentMethod: String(body.paymentMethod || "").trim().slice(0, 60),
    customerName: String(body.customerName || "").trim().slice(0, 100),
    items,
    notes: String(body.notes || "").trim().slice(0, 2000)
  };
}

async function createSale(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const body=await request.json().catch(()=>({}));
  if (!Array.isArray(body.items)) {
    const sale=validatedSale(body);
    if (!sale) return json({error:"Indica fecha, monto válido y productos vendidos."},400);
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO sales (id,sold_at,total_cents,currency,status,channel,payment_method,customer_name,customer_phone,items_text,notes,created_by,created_at,updated_by,updated_at,reference_currency,functional_currency,functional_total_cents,payment_status)
        VALUES (?,?,?,'USD','pending',?,?,?,?,?,?,?,?,?,?,?,'USD',?,'legacy')`)
        .bind(id,sale.soldAt,sale.totalCents,sale.channel,sale.paymentMethod,sale.customerName,cleanText(body.customerPhone,40),sale.items,sale.notes,session.username,now,session.username,now,"USD",sale.totalCents),
      structuredAuditStatement(env,session.username,"sale_create_legacy","sale",id,{summary:`Venta heredada pendiente ${sale.soldAt}`,reason:"Sin pago estructurado ni teléfono verificado"},now)
    ]);
    return json({ok:true,id,status:"pending",paymentStatus:"legacy",legacyIncomplete:true,mutationVersion:0},201);
  }
  const identity=await requestIdentity(env,body,"sale_create");
  if (identity.error) return identity.error;
  if (identity.replay) return identity.replay;
  const soldAt=cleanText(body.soldAt||caracasDate(),10);
  const referenceCurrency=String(body.referenceCurrency||"USD").toUpperCase();
  if (!isIsoDate(soldAt)||!SUPPORTED_REFERENCE_CURRENCIES.has(referenceCurrency)) return json({error:"Fecha o moneda base inválida."},400);
  const normalizedItems=await normalizeManualSaleItems(env,body.items,referenceCurrency,session);
  if (normalizedItems.error) return json({error:normalizedItems.error,code:normalizedItems.code||"invalid_sale_items"},normalizedItems.code==="stock_conflict"?409:400);
  const customerName=cleanText(body.customer?.name||body.customerName,100);
  const customerPhone=cleanText(body.customer?.phone||body.customerPhone,40);
  const resolved=await resolvePaymentPayloads(env,body.payments||[],referenceCurrency,session,soldAt);
  if (resolved.error) return json({error:resolved.error,code:"invalid_payment"},422);
  const paymentState=derivePaymentStatus(normalizedItems.totalCents,resolved.payments.reduce((sum,payment)=>sum+payment.referenceAmountCents,0));
  const valuation=await resolveSaleValuation(env,normalizedItems.totalCents,referenceCurrency,soldAt);
  const functionalTotalCents=valuation.functionalTotalCents;
  if (!paymentState||!functionalTotalCents) return json({error:"Faltan tasas BCV USD/EUR para fijar el valor funcional de la venta."},422);
  const hasPayment=resolved.payments.length>0;
  const hasAnyCustomerIdentity=Boolean(customerName||customerPhone);
  if((hasPayment||hasAnyCustomerIdentity)&&(!customerName||!normalizePhone(customerPhone)))return json({error:hasPayment?"El primer cobro necesita nombre y teléfono válido del cliente.":"Guarda nombre y teléfono juntos, o deja ambos vacíos mientras la venta siga pendiente."},400);
  const customer=hasPayment?await normalizedCustomerRecord(env,body.customer,{name:customerName,phone:customerPhone},session,{required:true}):{record:null,statements:[]};
  if (customer.error) return json({error:customer.error},400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status=hasPayment?"confirmed":"pending";
  const responsePayload={ok:true,id,saleId:id,status,paymentStatus:paymentState.status,balanceCents:paymentState.balanceRefCents,overpaymentCents:paymentState.overpaymentRefCents,referenceCurrency,functionalCurrency:"USD",functionalTotalCents,customerId:customer.record?.id||null,paymentIds:resolved.payments.map(payment=>payment.id),mutationVersion:0,replayed:false};
  const statements=[];
  for(const rate of resolved.newRates) statements.push(rateInsertStatement(env,rate,session.username,now));
  statements.push(...customer.statements);
  statements.push(env.DB.prepare(`INSERT INTO sales (id,sold_at,total_cents,currency,status,channel,payment_method,customer_name,customer_phone,items_text,notes,created_by,created_at,updated_by,updated_at,customer_id,reference_currency,functional_currency,functional_total_cents,payment_status,functional_exchange_rate_id,functional_exchange_rate_scaled,functional_exchange_rate_value_date,reference_exchange_rate_id,reference_exchange_rate_scaled,reference_exchange_rate_value_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,soldAt,normalizedItems.totalCents,referenceCurrency,status,cleanText(body.channel||"Venta directa",60),resolved.payments.map(payment=>payment.method).join(" + ").slice(0,60),customerName,customerPhone,
      normalizedItems.items.map(item=>`${item.quantity}× ${item.name}${item.optionSummary?` · ${item.optionSummary}`:""}`).join("; "),cleanText(body.notes,2000),session.username,now,session.username,now,customer.record?.id||null,referenceCurrency,"USD",functionalTotalCents,paymentState.status,
      valuation.functionalRate?.id||null,valuation.functionalRate?.rateScaled||null,valuation.functionalRate?.valueDate||null,
      valuation.referenceRate?.id||null,valuation.referenceRate?.rateScaled||null,valuation.referenceRate?.valueDate||null));
  if(hasPayment)statements.push(...manualInventoryStatements(env,normalizedItems.inventory,id,session,now));
  for(const item of normalizedItems.items){
    statements.push(env.DB.prepare(`INSERT INTO sale_items (id,sale_id,product_id,sku,item_name_snapshot,option_summary_snapshot,image_url_snapshot,quantity,price_currency,unit_price_cents,line_total_cents,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(item.id,id,item.productId,item.sku,item.name,item.optionSummary,item.imageUrl,item.quantity,item.priceCurrency,item.unitPriceCents,item.lineTotalCents,now));
    for(const unit of item.inventoryUnits)statements.push(env.DB.prepare("INSERT INTO sale_item_inventory_units (sale_item_id,sku,quantity) VALUES (?,?,?)").bind(item.id,unit.sku,unit.quantity));
  }
  if(hasPayment) {
    statements.push(...saleJournalStatements(env,{id,soldAt,totalCents:normalizedItems.totalCents,referenceCurrency,functionalTotalCents},session.username,now));
    let paidReference=0,customerCredit=0;
    for(const payment of resolved.payments){
      statements.push(paymentInsertStatement(env,payment,id,null,session.username,now));
      const posting=paymentJournalStatements(env,payment,{id,soldAt,totalCents:normalizedItems.totalCents,functionalTotalCents,referenceCurrency},paidReference,session.username,now);
      statements.push(...posting.statements);customerCredit+=posting.customerCredit;paidReference+=payment.referenceAmountCents;
    }
    responsePayload.customerCreditFunctionalCents=customerCredit;
  }
  statements.push(env.DB.prepare("INSERT INTO idempotency_keys (idempotency_key,operation,request_hash,target_id,response_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(identity.key,"sale_create",identity.requestHash,id,JSON.stringify(responsePayload),session.username,now));
  statements.push(structuredAuditStatement(env,session.username,"sale_create","sale",id,{status,paymentStatus:paymentState.status,referenceCurrency,functionalTotalCents,inventorySkipped:normalizedItems.skipped,priceAdjustments:normalizedItems.adjustments},now));
  try{await env.DB.batch(statements);}catch(error){
    if(String(error?.message||error).includes("UNIQUE")){const retry=await requestIdentity(env,body,"sale_create");if(retry.replay)return retry.replay;return retry.error||json({error:"La venta ya fue procesada."},409);}
    if(String(error?.message||error).includes("inventory_unavailable"))return json({error:"El inventario cambió y ya no alcanza.",code:"stock_conflict"},409);
    throw error;
  }
  return json(responsePayload,201);
}

async function updateSale(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Venta inválida" }, 400);
  const body=await request.json().catch(()=>({}));
  const guard=await prepareMutationGuard(env,"sale",id,body.expectedVersion);
  if(guard.error)return guard.error;
  const current=await env.DB.prepare("SELECT status,payment_status AS paymentStatus FROM sales WHERE id=?").bind(id).first();
  if (!current) return json({error:"Venta no encontrada"},404);
  if (current.status!=="pending"||current.paymentStatus!=="legacy") return json({error:"Esta venta conserva productos o pagos estructurados y no se puede editar como texto libre.",code:"immutable_sale"},409);
  const sale = validatedSale(body);
  if (!sale) return json({ error: "Indica fecha, monto válido y productos vendidos." }, 400);
  const now = new Date().toISOString();
  try{await env.DB.batch([
    mutationClaimStatement(env,guard,"sale_update_pending",body.idempotencyKey||"",session.username,now),
    env.DB.prepare("UPDATE sales SET sold_at=?,total_cents=?,status='pending',channel=?,payment_method=?,customer_name=?,items_text=?,notes=?,functional_total_cents=?,updated_by=?,updated_at=? WHERE id=? AND status='pending' AND payment_status='legacy'")
      .bind(sale.soldAt,sale.totalCents,sale.channel,sale.paymentMethod,sale.customerName,sale.items,sale.notes,sale.totalCents,session.username,now,id),
    structuredAuditStatement(env,session.username,"sale_update_pending","sale",id,{soldAt:sale.soldAt,totalCents:sale.totalCents},now)
  ]);}catch(error){if(isMutationConflict(error))return staleStateResponse(guard.currentVersion+1);throw error;}
  return json({ ok: true, id,mutationVersion:guard.nextVersion });
}

async function deleteSale(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Venta inválida" }, 400);
  return json({error:"Las ventas no se eliminan. Usa la anulación con motivo para conservar la auditoría.",code:"use_void",voidUrl:`/v1/admin/sales/${id}/void`},405);
}

async function addSalePayment(request,env,url) {
  const session=await requireSession(request,env);
  if(session instanceof Response)return session;
  const saleId=url.pathname.split("/").filter(Boolean)[3]||"";
  if(!/^[a-f0-9-]{36}$/.test(saleId))return json({error:"Venta inválida"},400);
  const body=await request.json().catch(()=>({}));
  const identity=await requestIdentity(env,body,`sale_payment:${saleId}`);
  if(identity.error)return identity.error;if(identity.replay)return identity.replay;
  const guard=await prepareMutationGuard(env,"sale",saleId,body.expectedVersion);
  if(guard.error)return guard.error;
  const sale=await env.DB.prepare(`SELECT id,sold_at AS soldAt,total_cents AS totalCents,currency,reference_currency AS referenceCurrency,functional_total_cents AS functionalTotalCents,
    status,payment_status AS paymentStatus,customer_id AS customerId,customer_name AS customerName,customer_phone AS customerPhone,order_id AS orderId FROM sales WHERE id=?`).bind(saleId).first();
  if(!sale)return json({error:"Venta no encontrada"},404);
  if(sale.status==="cancelled")return json({error:"No se pueden cobrar ventas anuladas."},409);
  const paymentDate=cleanText(body.paymentDate||body.soldAt||caracasDate(),10);
  if(!isIsoDate(paymentDate))return json({error:"Fecha de abono inválida"},400);
  const rawPayments=(Array.isArray(body.payments)?body.payments:(body.payment?[body.payment]:[])).map(payment=>({...payment,paymentDate:payment.paymentDate||payment.soldAt||paymentDate}));
  if(!rawPayments.length)return json({error:"Incluye al menos un pago."},400);
  const resolved=await resolvePaymentPayloads(env,rawPayments,sale.referenceCurrency||sale.currency||"USD",session,paymentDate);
  if(resolved.error)return json({error:resolved.error,code:"invalid_payment"},422);
  const previous=await env.DB.prepare("SELECT COALESCE(SUM(reference_amount_cents),0) AS referencePaid,COALESCE(SUM(functional_amount_cents),0) AS functionalPaid FROM payments WHERE sale_id=? AND status='confirmed'").bind(saleId).first();
  const referencePaid=Number(previous?.referencePaid||0),functionalPaid=Number(previous?.functionalPaid||0);
  const totalReferencePaid=referencePaid+resolved.payments.reduce((sum,payment)=>sum+payment.referenceAmountCents,0);
  const paymentState=derivePaymentStatus(Number(sale.totalCents),totalReferencePaid);
  let functionalTotalCents=Number(sale.functionalTotalCents||0)||functionalSaleTotal(Number(sale.totalCents),sale.referenceCurrency,resolved.payments);
  if(!paymentState||!functionalTotalCents)return json({error:"No se pudo fijar el equivalente funcional USD."},422);
  const customer=await normalizedCustomerRecord(env,body.customer,{name:sale.customerName,phone:sale.customerPhone},session,{required:true});
  if(customer.error)return json({error:customer.error},400);
  const now=new Date().toISOString();
  const responsePayload={ok:true,saleId,status:"confirmed",paymentStatus:paymentState.status,balanceCents:paymentState.balanceRefCents,overpaymentCents:paymentState.overpaymentRefCents,paymentIds:resolved.payments.map(payment=>payment.id),customerId:customer.record.id,functionalCurrency:"USD",functionalTotalCents,mutationVersion:guard.nextVersion,replayed:false};
  const statements=[mutationClaimStatement(env,guard,"sale_payment",identity.key,session.username,now)];for(const rate of resolved.newRates)statements.push(rateInsertStatement(env,rate,session.username,now));statements.push(...customer.statements);
  if(sale.status==="pending"){
    const unitRows=await env.DB.prepare(`SELECT siu.sku,SUM(siu.quantity) AS quantity FROM sale_item_inventory_units siu JOIN sale_items si ON si.id=siu.sale_item_id WHERE si.sale_id=? GROUP BY siu.sku`).bind(saleId).all();
    const inventory=[];
    for(const unit of unitRows.results||[]){const row=await env.DB.prepare("SELECT on_hand AS onHand,reserved,track_stock AS trackStock,active FROM inventory_items WHERE sku=?").bind(unit.sku).first();if(!row||!row.active)return json({error:`El SKU ${unit.sku} ya no está activo.`,code:"stock_conflict"},409);if(row.trackStock&&Number(row.onHand)-Number(row.reserved)<Number(unit.quantity))return json({error:`No hay stock suficiente para ${unit.sku}.`,code:"stock_conflict"},409);inventory.push({sku:unit.sku,quantity:Number(unit.quantity),trackStock:Boolean(row.trackStock)});}
    statements.push(...manualInventoryStatements(env,inventory,saleId,session,now));
  }
  const existingSaleJournal=await env.DB.prepare("SELECT id FROM journal_entries WHERE source_type='sale' AND source_id=? LIMIT 1").bind(saleId).first();
  if(!existingSaleJournal)statements.push(...saleJournalStatements(env,{id:saleId,soldAt:sale.soldAt,totalCents:Number(sale.totalCents),referenceCurrency:sale.referenceCurrency,functionalTotalCents},session.username,now));
  let paidReference=referencePaid,customerCredit=0;
  for(const payment of resolved.payments){
    statements.push(paymentInsertStatement(env,payment,saleId,sale.orderId,session.username,now));
    const posting=paymentJournalStatements(env,payment,{id:saleId,soldAt:sale.soldAt,totalCents:Number(sale.totalCents),functionalTotalCents,referenceCurrency:sale.referenceCurrency},paidReference,session.username,now);
    statements.push(...posting.statements);customerCredit+=posting.customerCredit;paidReference+=payment.referenceAmountCents;
  }
  responsePayload.customerCreditFunctionalCents=customerCredit;
  statements.push(env.DB.prepare("UPDATE sales SET status='confirmed',payment_status=?,customer_id=?,customer_name=CASE WHEN customer_name='' THEN ? ELSE customer_name END,customer_phone=CASE WHEN customer_phone='' THEN ? ELSE customer_phone END,functional_total_cents=?,payment_method=?,updated_by=?,updated_at=? WHERE id=? AND status<>'cancelled'")
    .bind(paymentState.status,customer.record.id,customer.record.name,customer.record.phone,functionalTotalCents,resolved.payments.map(payment=>payment.method).join(" + ").slice(0,60),session.username,now,saleId));
  statements.push(env.DB.prepare("INSERT INTO idempotency_keys (idempotency_key,operation,request_hash,target_id,response_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(identity.key,`sale_payment:${saleId}`,identity.requestHash,saleId,JSON.stringify(responsePayload),session.username,now));
  statements.push(structuredAuditStatement(env,session.username,"sale_payment","sale",saleId,{paymentIds:responsePayload.paymentIds,paymentStatus:paymentState.status,customerCreditFunctionalCents:customerCredit},now));
  try{await env.DB.batch(statements);}catch(error){if(isMutationConflict(error)){const retry=await requestIdentity(env,body,`sale_payment:${saleId}`);if(retry.replay)return retry.replay;return staleStateResponse(guard.currentVersion+1);}if(String(error?.message||error).includes("UNIQUE")){const retry=await requestIdentity(env,body,`sale_payment:${saleId}`);if(retry.replay)return retry.replay;return retry.error||json({error:"El pago ya fue procesado."},409);}if(String(error?.message||error).includes("inventory_unavailable"))return json({error:"El inventario cambió y ya no alcanza.",code:"stock_conflict"},409);throw error;}
  return json(responsePayload,201);
}

async function voidSale(request,env,url) {
  const session=await requireSession(request,env);
  if(session instanceof Response)return session;
  const saleId=url.pathname.split("/").filter(Boolean)[3]||"";
  const body=await request.json().catch(()=>({}));
  const reason=cleanText(body.reason,500);
  const voidDate=cleanText(body.voidDate||caracasDate(),10);
  if(!/^[a-f0-9-]{36}$/.test(saleId)||reason.length<8||!isIsoDate(voidDate))return json({error:"Venta, fecha o motivo de anulación inválido."},400);
  const guard=await prepareMutationGuard(env,"sale",saleId,body.expectedVersion);
  if(guard.error)return guard.error;
  const sale=await env.DB.prepare("SELECT id,status,sold_at AS soldAt,total_cents AS totalCents,functional_total_cents AS functionalTotalCents,order_id AS orderId FROM sales WHERE id=?").bind(saleId).first();
  if(!sale)return json({error:"Venta no encontrada"},404);
  if(sale.status==="cancelled")return json({error:"La venta ya está anulada."},409);
  if(voidDate<sale.soldAt)return json({error:"La fecha de anulación no puede ser anterior a la venta."},400);
  const now=new Date().toISOString(),statements=[mutationClaimStatement(env,guard,"sale_void",body.idempotencyKey||"",session.username,now)];
  const saleEntries=await env.DB.prepare("SELECT id FROM journal_entries WHERE source_type='sale' AND source_id=? AND status='posted'").bind(saleId).all();
  for(const entry of saleEntries.results||[]){
    const lines=await env.DB.prepare("SELECT account_id AS accountId,debit_functional_cents AS debit,credit_functional_cents AS credit,original_currency AS originalCurrency,original_amount_minor AS originalAmountMinor,original_amount_scale AS originalAmountScale,memo FROM journal_lines WHERE journal_entry_id=?").bind(entry.id).all();
    statements.push(...balancedJournalStatements(env,{entryDate:voidDate,sourceType:"reversal",sourceId:saleId,description:`Anulación de venta ${saleId}`,username:session.username,now,reversalOfId:entry.id,lines:(lines.results||[]).map(line=>({...line,debit:Number(line.credit),credit:Number(line.debit)}))}));
    statements.push(env.DB.prepare("UPDATE journal_entries SET status='reversed',reversed_by=?,reversed_at=?,reversal_reason=? WHERE id=?").bind(session.username,now,reason,entry.id));
  }
  const paidRows=await env.DB.prepare("SELECT reference_amount_cents AS referenceAmountCents,functional_amount_cents AS functionalAmountCents FROM payments WHERE sale_id=? AND status='confirmed' ORDER BY confirmed_at,id").bind(saleId).all();
  let paidFunctional=0,paidReference=0,appliedFunctional=0,carryingApplied=0,fxGain=0,fxLoss=0;
  for(const payment of paidRows.results||[]){const allocation=deriveSettlementAllocation({saleTotalReferenceCents:Number(sale.totalCents),saleFunctionalTotalCents:Number(sale.functionalTotalCents),paidBeforeReferenceCents:paidReference,paymentReferenceCents:Number(payment.referenceAmountCents),paymentFunctionalCents:Number(payment.functionalAmountCents)});if(allocation){appliedFunctional+=allocation.appliedPaymentFunctionalCents;carryingApplied+=allocation.carryingReceivableCreditCents;fxGain+=allocation.fxGainFunctionalCents;fxLoss+=allocation.fxLossFunctionalCents;}paidReference+=Number(payment.referenceAmountCents);paidFunctional+=Number(payment.functionalAmountCents);}
  if(appliedFunctional>0){const lines=[];if(carryingApplied>0)lines.push({accountId:"asset-receivable-usd",debit:carryingApplied,originalCurrency:"USD",originalAmountMinor:carryingApplied});if(fxGain>0)lines.push({accountId:"income-fx-gain-usd",debit:fxGain,originalCurrency:"USD",originalAmountMinor:fxGain});if(fxLoss>0)lines.push({accountId:"expense-fx-loss-usd",credit:fxLoss,originalCurrency:"USD",originalAmountMinor:fxLoss});lines.push({accountId:"liability-customer-credit-usd",credit:appliedFunctional,originalCurrency:"USD",originalAmountMinor:appliedFunctional});statements.push(...balancedJournalStatements(env,{entryDate:voidDate,sourceType:"adjustment",sourceId:saleId,description:`Crédito del cliente por venta anulada ${saleId}`,username:session.username,now,lines}));}
  let restoredStock=false;
  if(body.restoreStock===true){
    const movements=await env.DB.prepare("SELECT sku,-SUM(delta_on_hand) AS quantity FROM inventory_movements WHERE sale_id=? AND movement_type='sale' GROUP BY sku HAVING quantity>0").bind(saleId).all();
    for(const movement of movements.results||[]){const quantity=Number(movement.quantity);statements.push(env.DB.prepare("UPDATE inventory_items SET on_hand=on_hand+?,updated_at=?,updated_by=? WHERE sku=?").bind(quantity,now,session.username,movement.sku));statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku,order_id,sale_id,movement_type,delta_on_hand,delta_reserved,note,actor,created_at) VALUES (?,?,?,'adjustment',?,0,'Reposición por venta anulada',?,?)").bind(movement.sku,sale.orderId||null,saleId,quantity,session.username,now));restoredStock=true;}
  }
  statements.push(env.DB.prepare("UPDATE sales SET status='cancelled',payment_status='voided',voided_at=?,voided_by=?,void_reason=?,updated_by=?,updated_at=? WHERE id=? AND status<>'cancelled'").bind(now,session.username,reason,session.username,now,saleId));
  if(sale.orderId)statements.push(env.DB.prepare("UPDATE stock_orders SET status='cancelled',voided_at=?,voided_by=?,void_reason=?,updated_at=? WHERE id=? AND status='confirmed'").bind(now,session.username,reason,now,sale.orderId));
  statements.push(structuredAuditStatement(env,session.username,"sale_void","sale",saleId,{reason,voidDate,restoredStock,customerCreditFunctionalCents:paidFunctional},now));
  try{await env.DB.batch(statements);}catch(error){if(isMutationConflict(error))return staleStateResponse(guard.currentVersion+1);throw error;}
  return json({ok:true,saleId,status:"cancelled",voidDate,restoredStock,refundRecorded:false,customerCreditFunctionalCents:paidFunctional,mutationVersion:guard.nextVersion,message:paidFunctional?"El cobro quedó como crédito del cliente; no se registró un reembolso inexistente.":"Venta anulada sin cobros."});
}

async function listExpenses(request,env,url){
  const session=await requireSession(request,env);if(session instanceof Response)return session;
  const from=cleanText(url.searchParams.get("from"),10),to=cleanText(url.searchParams.get("to"),10);
  if((from&&!isIsoDate(from))||(to&&!isIsoDate(to)))return json({error:"Rango de fechas inválido"},400);
  const result=await env.DB.prepare(`SELECT id,expense_date AS expenseDate,category,description,status,amount_minor AS amountMinor,amount_scale AS amountScale,currency,payment_method AS method,
    reference_currency AS referenceCurrency,reference_amount_cents AS referenceAmountCents,functional_amount_cents AS functionalAmountCents,transaction_reference AS reference,notes,
    exchange_rate_value_date AS exchangeRateValueDate,created_by AS createdBy,created_at AS createdAt,voided_at AS voidedAt,void_reason AS voidReason,
    COALESCE((SELECT MAX(version) FROM entity_mutation_claims WHERE entity_type='expense' AND entity_id=expenses.id),0) AS mutationVersion
    FROM expenses WHERE (?='' OR expense_date>=?) AND (?='' OR expense_date<=?) ORDER BY expense_date DESC,created_at DESC LIMIT 1000`).bind(from,from,to,to).all();
  const items=result.results||[],posted=items.filter(item=>item.status==="posted"),byCurrency={};for(const item of posted)byCurrency[item.currency]=(byCurrency[item.currency]||0)+Number(item.amountMinor||0);
  return json({items,summary:{functionalCurrency:"USD",totalFunctionalUsdCents:posted.reduce((sum,item)=>sum+Number(item.functionalAmountCents||0),0),byCurrency,postedCount:posted.length,voidedCount:items.length-posted.length}});
}

async function createExpense(request,env){
  const session=await requireSession(request,env);if(session instanceof Response)return session;
  const body=await request.json().catch(()=>({}));const identity=await requestIdentity(env,body,"expense_create");if(identity.error)return identity.error;if(identity.replay)return identity.replay;
  const expenseDate=cleanText(body.expenseDate||caracasDate(),10),category=cleanText(body.category||"General",100),description=cleanText(body.description,500),method=cleanText(body.method||body.paymentMethod,80),referenceCurrency=String(body.referenceCurrency||"USD").toUpperCase();
  if(!isIsoDate(expenseDate)||!description||!method||!SUPPORTED_REFERENCE_CURRENCIES.has(referenceCurrency))return json({error:"Completa fecha, categoría, descripción, método y base USD/EUR."},400);
  const rawPayment={...body,method,currency:String(body.currency||"").toUpperCase()};
  const resolved=await resolvePaymentPayloads(env,[rawPayment],referenceCurrency,session,expenseDate);if(resolved.error)return json({error:resolved.error,code:"invalid_expense_payment"},422);
  const payment=resolved.payments[0],id=crypto.randomUUID(),now=new Date().toISOString();
  const responsePayload={ok:true,id,expenseId:id,status:"posted",referenceAmountCents:payment.referenceAmountCents,functionalAmountCents:payment.functionalAmountCents,functionalCurrency:"USD",mutationVersion:0,replayed:false};
  const statements=[];for(const rate of resolved.newRates)statements.push(rateInsertStatement(env,rate,session.username,now));
  statements.push(env.DB.prepare(`INSERT INTO expenses (id,expense_date,category,description,status,amount_minor,amount_scale,currency,payment_method,reference_currency,reference_amount_cents,functional_currency,functional_amount_cents,
    exchange_rate_id,rate_basis,exchange_rate_scaled,exchange_rate_scale,exchange_rate_value_date,exchange_rate_source_url,exchange_rate_source_kind,functional_exchange_rate_id,functional_exchange_rate_scaled,functional_exchange_rate_value_date,
    transaction_reference,notes,created_by,created_at) VALUES (?,?,?,?,'posted',?,?,?,?,?,?,'USD',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,expenseDate,category,description,payment.amountMinor,payment.amountScale,payment.currency,payment.method,referenceCurrency,payment.referenceAmountCents,payment.functionalAmountCents,payment.exchangeRateId,payment.rateBasis,payment.rateScaled,payment.rateScaled?BCV_RATE_SCALE:null,payment.rateValueDate,payment.rateSourceUrl,payment.rateSourceKind,payment.functionalExchangeRateId,payment.functionalRateScaled,payment.functionalRateValueDate,payment.transactionReference,payment.notes,session.username,now));
  statements.push(...balancedJournalStatements(env,{entryDate:expenseDate,sourceType:"expense",sourceId:id,description:`Gasto: ${description}`,username:session.username,now,lines:[
    {accountId:"expense-operating-usd",debit:payment.functionalAmountCents,originalCurrency:payment.currency,originalAmountMinor:payment.amountMinor,originalAmountScale:payment.amountScale},
    {accountId:paymentAccountId(payment),credit:payment.functionalAmountCents,originalCurrency:payment.currency,originalAmountMinor:payment.amountMinor,originalAmountScale:payment.amountScale}
  ]}));
  statements.push(env.DB.prepare("INSERT INTO idempotency_keys (idempotency_key,operation,request_hash,target_id,response_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(identity.key,"expense_create",identity.requestHash,id,JSON.stringify(responsePayload),session.username,now));
  statements.push(structuredAuditStatement(env,session.username,"expense_create","expense",id,{category,description,functionalAmountCents:payment.functionalAmountCents},now));
  try{await env.DB.batch(statements);}catch(error){if(String(error?.message||error).includes("UNIQUE")){const retry=await requestIdentity(env,body,"expense_create");if(retry.replay)return retry.replay;return retry.error||json({error:"El gasto ya fue procesado."},409);}throw error;}
  return json(responsePayload,201);
}

async function voidExpense(request,env,url){
  const session=await requireSession(request,env);if(session instanceof Response)return session;
  const id=url.pathname.split("/").filter(Boolean)[3]||"",body=await request.json().catch(()=>({})),reason=cleanText(body.reason,500),voidDate=cleanText(body.voidDate||caracasDate(),10);
  if(!/^[a-f0-9-]{36}$/.test(id)||reason.length<8||!isIsoDate(voidDate))return json({error:"Gasto, fecha o motivo inválido."},400);
  const guard=await prepareMutationGuard(env,"expense",id,body.expectedVersion);
  if(guard.error)return guard.error;
  const expense=await env.DB.prepare("SELECT id,status,expense_date AS expenseDate,functional_amount_cents AS functionalAmountCents,currency,amount_minor AS amountMinor FROM expenses WHERE id=?").bind(id).first();
  if(!expense)return json({error:"Gasto no encontrado"},404);if(expense.status==="voided")return json({error:"El gasto ya está anulado."},409);
  if(voidDate<expense.expenseDate)return json({error:"La fecha de anulación no puede ser anterior al gasto."},400);
  const now=new Date().toISOString(),amount=Number(expense.functionalAmountCents),statements=[mutationClaimStatement(env,guard,"expense_void",body.idempotencyKey||"",session.username,now),...balancedJournalStatements(env,{entryDate:voidDate,sourceType:"reversal",sourceId:id,description:`Reclasificación de gasto anulado ${id}`,username:session.username,now,lines:[
    {accountId:"asset-recoverable-usd",debit:amount,originalCurrency:expense.currency,originalAmountMinor:Number(expense.amountMinor)},
    {accountId:"expense-operating-usd",credit:amount,originalCurrency:expense.currency,originalAmountMinor:Number(expense.amountMinor)}
  ]})];
  statements.push(env.DB.prepare("UPDATE expenses SET status='voided',voided_by=?,voided_at=?,void_reason=? WHERE id=? AND status='posted'").bind(session.username,now,reason,id));
  statements.push(structuredAuditStatement(env,session.username,"expense_void","expense",id,{reason,voidDate,reclassifiedAsRecoverableFunctionalCents:amount},now));try{await env.DB.batch(statements);}catch(error){if(isMutationConflict(error))return staleStateResponse(guard.currentVersion+1);throw error;}
  return json({ok:true,id,status:"voided",voidDate,refundRecorded:false,reclassifiedAsRecoverableFunctionalCents:amount,mutationVersion:guard.nextVersion,message:"El desembolso no se fingió como devuelto; quedó como monto por recuperar."});
}

async function getAccountingSummary(request,env,url){
  const session=await requireSession(request,env);if(session instanceof Response)return session;
  const today=caracasDate(),from=cleanText(url.searchParams.get("from")||`${today.slice(0,7)}-01`,10),to=cleanText(url.searchParams.get("to")||today,10);
  if(!isIsoDate(from)||!isIsoDate(to)||from>to)return json({error:"Rango de fechas inválido"},400);
  const [closingAccounts,periodAccounts,payments,sales,expenses,periodUnbalanced,asOfUnbalanced]=await Promise.all([
    env.DB.prepare(`SELECT a.id,a.code,a.name,a.account_type AS accountType,a.currency,COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_functional_cents ELSE 0 END),0) AS debitFunctionalCents,COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_functional_cents ELSE 0 END),0) AS creditFunctionalCents
      FROM accounts a LEFT JOIN journal_lines jl ON jl.account_id=a.id LEFT JOIN journal_entries je ON je.id=jl.journal_entry_id AND je.entry_date<=?
      GROUP BY a.id ORDER BY a.code`).bind(to).all(),
    env.DB.prepare(`SELECT a.id,a.code,a.name,a.account_type AS accountType,a.currency,COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_functional_cents ELSE 0 END),0) AS debitFunctionalCents,COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_functional_cents ELSE 0 END),0) AS creditFunctionalCents
      FROM accounts a LEFT JOIN journal_lines jl ON jl.account_id=a.id LEFT JOIN journal_entries je ON je.id=jl.journal_entry_id AND je.entry_date>=? AND je.entry_date<=?
      GROUP BY a.id ORDER BY a.code`).bind(from,to).all(),
    env.DB.prepare(`SELECT paid_currency AS currency,method,SUM(amount_minor) AS amountMinor,SUM(functional_amount_cents) AS functionalAmountCents,COUNT(*) AS count FROM payments
      WHERE status='confirmed' AND payment_date>=? AND payment_date<=? GROUP BY paid_currency,method ORDER BY paid_currency,method`).bind(from,to).all(),
    env.DB.prepare("SELECT currency,SUM(total_cents) AS amountCents,SUM(functional_total_cents) AS functionalAmountCents,COUNT(*) AS count FROM sales WHERE status='confirmed' AND sold_at>=? AND sold_at<=? GROUP BY currency").bind(from,to).all(),
    env.DB.prepare("SELECT currency,SUM(amount_minor) AS amountMinor,SUM(functional_amount_cents) AS functionalAmountCents,COUNT(*) AS count FROM expenses WHERE status='posted' AND expense_date>=? AND expense_date<=? GROUP BY currency").bind(from,to).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id WHERE je.entry_date>=? AND je.entry_date<=? GROUP BY je.id HAVING SUM(jl.debit_functional_cents)<>SUM(jl.credit_functional_cents))`).bind(from,to).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id WHERE je.entry_date<=? GROUP BY je.id HAVING SUM(jl.debit_functional_cents)<>SUM(jl.credit_functional_cents))`).bind(to).first()
  ]);
  const normalizeAccounts=(rows,movement=false)=>(rows||[]).map(account=>{const debitFunctionalCents=Number(account.debitFunctionalCents||0),creditFunctionalCents=Number(account.creditFunctionalCents||0),net=debitFunctionalCents-creditFunctionalCents;return {...account,debitFunctionalCents,creditFunctionalCents,...(movement?{movementFunctionalCents:net}:{balanceFunctionalCents:net})};});
  const accountItems=normalizeAccounts(closingAccounts.results),accountMovements=normalizeAccounts(periodAccounts.results,true);
  const aggregates=deriveAccountingAggregates({closingAccounts:accountItems,periodAccounts:accountMovements,liquidAccountIds:LIQUID_ACCOUNT_IDS});
  const collections=payments.results||[],paymentsByCurrency={},paymentsByMethod={};let collectedFunctionalCents=0;
  for(const row of collections){const functional=Number(row.functionalAmountCents||0),nominal=Number(row.amountMinor||0);collectedFunctionalCents+=functional;paymentsByCurrency[row.currency]=(paymentsByCurrency[row.currency]||0)+nominal;paymentsByMethod[row.method]=(paymentsByMethod[row.method]||0)+functional;}
  const balancesAsOf={asOf:to,functionalCurrency:"USD",receivableFunctionalCents:aggregates.receivableFunctionalCents,cashBalanceFunctionalCents:aggregates.cashBalanceFunctionalCents,customerCreditFunctionalCents:aggregates.customerCreditFunctionalCents,recoverableFunctionalCents:aggregates.recoverableFunctionalCents};
  const period={from,to,functionalCurrency:"USD",incomeFunctionalCents:aggregates.incomeFunctionalCents,expenseFunctionalCents:aggregates.expenseFunctionalCents,netIncomeFunctionalCents:aggregates.netIncomeFunctionalCents,cashInflowFunctionalCents:aggregates.cashInflowFunctionalCents,cashOutflowFunctionalCents:aggregates.cashOutflowFunctionalCents,netCashFunctionalCents:aggregates.netCashFunctionalCents,receivableMovementFunctionalCents:aggregates.receivableMovementFunctionalCents,collectedFunctionalCents};
  const unbalancedJournalCount=Number(periodUnbalanced?.count||0),asOfUnbalancedJournalCount=Number(asOfUnbalanced?.count||0);
  return json({from,to,functionalCurrency:"USD",...balancesAsOf,...period,
    netFunctionalCents:aggregates.netIncomeFunctionalCents,
    incomeRefCents:aggregates.incomeFunctionalCents,expenseRefCents:aggregates.expenseFunctionalCents,netRefCents:aggregates.netIncomeFunctionalCents,receivableRefCents:aggregates.receivableFunctionalCents,netCashRefCents:aggregates.netCashFunctionalCents,
    balancesAsOf,period,accounts:accountItems,accountMovements,collectionsByCurrencyAndMethod:collections,paymentsByCurrency,paymentsByMethod,salesByCurrency:sales.results||[],expensesByCurrency:expenses.results||[],journalBalanced:unbalancedJournalCount===0,unbalancedJournalCount,asOfJournalBalanced:asOfUnbalancedJournalCount===0,asOfUnbalancedJournalCount});
}

async function getActivity(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const result = await env.DB.prepare("SELECT username, action, details, created_at FROM audit_log ORDER BY id DESC LIMIT 20").all();
  return json({ items: result.results || [] });
}

async function requireSession(request, env, reject = true) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return reject ? json({ error: "Sesión requerida" }, 401) : null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare("SELECT s.username, s.expires_at, u.display_name, u.role FROM admin_sessions s JOIN admin_users u ON u.username = s.username WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1").bind(tokenHash, now).first();
  if (!session) return reject ? json({ error: "Sesión vencida" }, 401, { "Set-Cookie": sessionCookie("", 0) }) : null;
  return session;
}

async function requireOwner(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  return session.role === "owner" ? session : json({ error: "Solo la cuenta propietaria puede administrar usuarios." }, 403);
}

async function createSession(env, username, now = new Date().toISOString()) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(Math.floor(Date.now() / 1000)),
    env.DB.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(tokenHash, username, expiresAt, now)
  ]);
  return { token, expiresAt };
}

function requireWebAuthnOrigin(request, env) {
  const origin = String(request.headers.get("Origin") || "");
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));
  return origin && allowed.has(origin) ? origin : "";
}

function webAuthnRpID(origin, env) {
  const hostname = new URL(origin).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return hostname;
  return String(env.WEBAUTHN_RP_ID || "").trim() || hostname;
}

async function savePasskeyChallenge(env, username, challenge, purpose) {
  const id = randomToken(18);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM passkey_challenges WHERE expires_at <= ? OR (username = ? AND purpose = ?)").bind(nowSeconds, username, purpose),
    env.DB.prepare("INSERT INTO passkey_challenges (id, username, challenge, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, username, challenge, purpose, nowSeconds + PASSKEY_CHALLENGE_TTL_SECONDS, new Date().toISOString())
  ]);
  return id;
}

async function consumePasskeyChallenge(env, id, username, purpose) {
  if (!/^[a-zA-Z0-9_-]{20,80}$/.test(String(id || "")) || !username) return "";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT challenge FROM passkey_challenges WHERE id = ? AND username = ? AND purpose = ? AND expires_at > ?").bind(id, username, purpose, nowSeconds).first();
  await env.DB.prepare("DELETE FROM passkey_challenges WHERE id = ?").bind(id).run();
  return row?.challenge || "";
}

async function saveDiscoverablePasskeyChallenge(env, challenge) {
  const id = randomToken(18);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM passkey_login_challenges WHERE expires_at <= ?").bind(nowSeconds),
    env.DB.prepare("INSERT INTO passkey_login_challenges (id, challenge, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(id, challenge, nowSeconds + PASSKEY_CHALLENGE_TTL_SECONDS, new Date().toISOString())
  ]);
  return id;
}

async function consumeDiscoverablePasskeyChallenge(env, id) {
  if (!/^[a-zA-Z0-9_-]{20,80}$/.test(String(id || ""))) return "";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT challenge FROM passkey_login_challenges WHERE id = ? AND expires_at > ?").bind(id, nowSeconds).first();
  await env.DB.prepare("DELETE FROM passkey_login_challenges WHERE id = ?").bind(id).run();
  return row?.challenge || "";
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function exactArrayBuffer(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function validateCatalog(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.products) || !state.builders) return "Falta la estructura del catálogo";
  if (state.products.length > 500) return "El catálogo supera 500 productos";
  const ids = new Set();
  for (const product of state.products) {
    if (!product || typeof product !== "object") return "Hay un producto inválido";
    if (!/^[a-z0-9-]{1,80}$/.test(String(product.id || ""))) return "Todos los productos necesitan un identificador válido";
    if (ids.has(product.id)) return `El identificador ${product.id} está repetido`;
    ids.add(product.id);
    if (!String(product.name || "").trim()) return `El producto ${product.id} no tiene nombre`;
    if (product.availabilityMode !== undefined && !["available", "preorder", "sold-out"].includes(product.availabilityMode)) return `La disponibilidad de ${product.id} no es válida`;
    if (product.availabilityMode === "available" && (product.status !== "available" || product.allowPreorder === true || product.immediate !== true)) return `La disponibilidad de ${product.id} no está sincronizada`;
    if (product.availabilityMode === "preorder" && (product.status !== "sold-out" || product.allowPreorder !== true || Number(product.minimumBusinessDays) !== 2)) return `La preventa de ${product.id} no está sincronizada`;
    if (product.availabilityMode === "sold-out" && (product.status !== "sold-out" || product.allowPreorder === true)) return `El estado agotado de ${product.id} no está sincronizado`;
    if (typeof product.image === "string" && product.image.startsWith("data:")) return "Guarda las imágenes con el botón de subida antes de publicar";
  }
  for (const kind of ["fonkies", "fomb"]) {
    const builder = state.builders[kind];
    if (!builder) continue;
    if (builder.availabilityMode !== undefined && !["available", "preorder", "sold-out"].includes(builder.availabilityMode)) return `La disponibilidad de ${kind} no es válida`;
    if (builder.availabilityMode === "available" && (builder.status !== "available" || builder.allowPreorder === true || builder.immediate !== true)) return `La disponibilidad de ${kind} no está sincronizada`;
    if (builder.availabilityMode === "preorder" && (builder.status !== "sold-out" || builder.allowPreorder !== true || Number(builder.minimumBusinessDays) !== 2)) return `La preventa de ${kind} no está sincronizada`;
    if (builder.availabilityMode === "sold-out" && (builder.status !== "sold-out" || builder.allowPreorder === true)) return `El estado agotado de ${kind} no está sincronizado`;
    for (const flavor of builder.flavors || []) {
      if (flavor.availabilityMode !== undefined && !["available", "preorder", "sold-out"].includes(flavor.availabilityMode)) return `La disponibilidad de ${flavor.name || "un sabor"} no es válida`;
      if (flavor.availabilityMode === "available" && (flavor.status !== "available" || flavor.allowPreorder === true || flavor.immediate !== true)) return `La disponibilidad de ${flavor.name || "un sabor"} no está sincronizada`;
      if (flavor.availabilityMode === "preorder" && (flavor.status !== "sold-out" || flavor.allowPreorder !== true || Number(flavor.minimumBusinessDays) !== 2)) return `La preventa de ${flavor.name || "un sabor"} no está sincronizada`;
      if (flavor.availabilityMode === "sold-out" && (flavor.status !== "sold-out" || flavor.allowPreorder === true)) return `El estado agotado de ${flavor.name || "un sabor"} no está sincronizado`;
    }
    const identityError = validateBuilderInventoryIdentity(kind, builder);
    if (identityError) return identityError;
  }
  return "";
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,50}$/.test(username) ? username : "";
}

function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function derivePasswordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: Number(iterations) }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a || ""));
  const right = encoder.encode(String(b || ""));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index % (left.length || 1)] || 0) ^ (right[index % (right.length || 1)] || 0);
  return difference === 0;
}
