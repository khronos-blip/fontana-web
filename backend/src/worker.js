import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

import { fombPricingMatchesRequest, resolveFombPricing } from "./pricing.mjs";
import { applyPublicBuilderAvailability } from "./public-availability.mjs";

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
      else if (url.pathname.startsWith("/v1/admin/orders/") && request.method === "POST") response = await changeOrderStatus(request, env, url);
      else if (url.pathname === "/v1/admin/sales" && request.method === "GET") response = await listSales(request, env);
      else if (url.pathname === "/v1/admin/sales" && request.method === "POST") response = await createSale(request, env);
      else if (url.pathname.startsWith("/v1/admin/sales/") && request.method === "PUT") response = await updateSale(request, env, url);
      else if (url.pathname.startsWith("/v1/admin/sales/") && request.method === "DELETE") response = await deleteSale(request, env, url);
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
    ctx.waitUntil(expireReservations(env));
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

function automaticPreorderForProduct(product) {
  return product?.category === "salado";
}

function automaticPreorderForBuilder(kind) {
  return kind === "fonkies" || kind === "fomb";
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
  for (const kind of ["fonkies", "fomb"]) {
    const builder = state?.builders?.[kind];
    if (!builder || builder.visible === false) continue;
    for (const flavor of builder.flavors || []) {
      const sourceQuantity = flavor.stockQuantity === null || flavor.stockQuantity === undefined || flavor.stockQuantity === "" ? null : (Number.isFinite(Number(flavor.stockQuantity)) ? Math.max(0, Math.floor(Number(flavor.stockQuantity))) : null);
      definitions.push({
        sku: `builder:${kind}:${stockSlug(flavor.name)}`, productId: kind === "fonkies" ? "fonkie-box" : "fomb-box",
        kind, label: kind === "fonkies" ? "Fonkies" : "Fomb", optionSummary: flavor.name,
        flavorName: flavor.name, sourceQuantity
      });
    }
  }
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
  const resolved = candidates => {
    if (!candidates.length) return null;
    const rows = candidates.map(item => inventory.get(item.sku));
    if (rows.some(row => !row?.trackStock)) return null;
    return rows.some(row => row.available > 0);
  };
  for (const product of publicState.products || []) {
    if (automaticPreorderForProduct(product)) product.allowPreorder = true;
    product.requiresElectricity = product.requiresElectricity === true;
    product.temporarilyUnavailable = !operations.electricityEnabled && product.requiresElectricity;
    const candidates = byProduct.get(product.id) || [];
    const productAvailable = resolved(candidates);
    if (productAvailable !== null) product.status = productAvailable ? "available" : "sold-out";
    for (const variant of product.variants || []) {
      const available = resolved(candidates.filter(item => item.variantName === variant.name));
      if (available !== null) variant.status = available ? "available" : "sold-out";
      delete variant.stockQuantity;
    }
    for (const size of product.sizes || []) {
      const available = resolved(candidates.filter(item => item.sizeName === size.name));
      if (available !== null) size.status = available ? "available" : "sold-out";
      delete size.stockQuantity;
    }
    delete product.stockQuantity;
  }
  for (const kind of ["fonkies", "fomb"]) {
    const builder = publicState.builders?.[kind];
    if (!builder) continue;
    builder.allowPreorder = true;
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

function resolveReservationCart(state, requestedItems, operations) {
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
      const preorderAllowed = automaticPreorderForProduct(product) || product.allowPreorder === true;
      const preorder = Boolean(requested.preorder && unavailable && preorderAllowed);
      if (unavailable && !preorder) throw new Error("unavailable_product");
      const sku = ["product", product.id, size ? stockSlug(size.name) : "base", variant ? stockSlug(variant.name) : "base"].join(":");
      const definition = definitionMap.get(sku);
      if (!definition) throw new Error("invalid_product");
      const unitPriceCents = Math.round(Number(size?.price ?? product.price) * 100);
      const optionSummary = [size?.name, variant?.name, preorder ? "PRE-ORDER" : ""].filter(Boolean).join(" · ");
      snapshotItems.push({kind,productId:product.id,name:product.name,quantity,unitPriceCents,optionSummary,size:size?.name||"",variant:variant?.name||"",preorder});
      if (!preorder) addDemand(definition, quantity);
      continue;
    }

    if (kind !== "fonkies" && kind !== "fomb") throw new Error("invalid_product");
    const builder = state.builders?.[kind];
    if (!builder || builder.visible === false) throw new Error("invalid_product");
    const requiresElectricity = builder.requiresElectricity === true || (kind === "fonkies" && !Object.prototype.hasOwnProperty.call(builder, "requiresElectricity"));
    if (!operations.electricityEnabled && requiresElectricity) throw new Error("temporarily_unavailable");
    const requestedFlavors = Array.isArray(requested.flavors) ? requested.flavors : [];
    const flavors = requestedFlavors.map(item => ({name:String(item.name || ""),quantity:parsePositiveInteger(item.quantity)}));
    const uniqueFlavorNames = new Set(flavors.map(item => item.name));
    if (!flavors.length
      || flavors.length > (builder.flavors || []).length
      || uniqueFlavorNames.size !== flavors.length
      || flavors.some(item => !item.quantity || !(builder.flavors || []).some(flavor => flavor.name === item.name))) throw new Error("invalid_option");
    const preorderAllowed = automaticPreorderForBuilder(kind) || builder.allowPreorder === true;
    const resolvedFlavors = flavors.map(selected => {
      const flavor = builder.flavors.find(item => item.name === selected.name);
      const unavailable = builder.status === "sold-out" || flavor.status === "sold-out";
      const preorder = Boolean(requested.preorder && unavailable && preorderAllowed);
      if (unavailable && !preorder) throw new Error("unavailable_product");
      return {...selected, preorder};
    });
    const preorder = resolvedFlavors.some(item => item.preorder);
    const selectedTotal = flavors.reduce((sum,item) => sum + item.quantity, 0);
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
    snapshotItems.push({kind,productId,name,quantity,unitPriceCents,optionSummary,flavors:resolvedFlavors,boxSize,extraCount,preorder});
    for (const selected of resolvedFlavors.filter(item => !item.preorder)) {
      const definition = definitionMap.get(`builder:${kind}:${stockSlug(selected.name)}`);
      if (!definition) throw new Error("invalid_option");
      addDemand(definition, selected.quantity * quantity);
    }
  }
  const totalCents = snapshotItems.reduce((sum,item) => sum + item.unitPriceCents * item.quantity, 0);
  return {snapshotItems,demands:[...demands.values()],totalCents};
}

function resolveStockChecks(state, requestedChecks, operations) {
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
      const preorder = requested.preorder === true && unavailable && (automaticPreorderForProduct(product) || product.allowPreorder === true);
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
    const flavor = (builder.flavors || []).find(item => item.name === flavorName);
    if (!flavor) throw new Error("invalid_option");
    const unavailable = builder.status === "sold-out" || flavor.status === "sold-out";
    const preorder = requested.preorder === true && unavailable && (automaticPreorderForBuilder(kind) || builder.allowPreorder === true);
    if (unavailable && !preorder) throw new Error("unavailable_product");
    if (preorder) continue;
    const definition = definitionMap.get(`builder:${kind}:${stockSlug(flavorName)}`);
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
  const existing = await env.DB.prepare("SELECT id, order_code AS orderCode, status, expires_at AS expiresAt, total_cents AS totalCents FROM stock_orders WHERE client_key = ?").bind(clientKey).first();
  if (existing) return json({ok:true,...existing,reservedUntil:new Date(Number(existing.expiresAt)*1000).toISOString(),reused:true});
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
  if (!customerName || !customerPhone || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return json({error:"Completa nombre, teléfono y fecha del pedido."},400);
  const id = crypto.randomUUID();
  const orderCode = reservationOrderCode(body.orderPrefix);
  const now = new Date().toISOString();
  const expiresAt = Math.floor(Date.now()/1000)+RESERVATION_TTL_SECONDS;
  const snapshot = {items:cart.snapshotItems,customer:{name:customerName,phone:customerPhone,fulfillment:String(customer.fulfillment||"").slice(0,180),requestedDate,paymentMethod:String(customer.paymentMethod||"").slice(0,80),address:String(customer.address||"").slice(0,500),allergySummary:String(customer.allergySummary||"").slice(0,2000),birthdayCandle:String(customer.birthdayCandle||"").slice(0,20),notes:String(customer.notes||"").slice(0,2000)}};
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
    if (message.includes("UNIQUE")) return json({error:"Esta solicitud ya fue procesada. Revisa tus pedidos."},409);
    throw error;
  }
  return json({ok:true,id,orderCode,totalCents:cart.totalCents,reservedUntil:new Date(expiresAt*1000).toISOString(),expiresAt},201);
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
    const lines = await env.DB.prepare("SELECT sku, reserved_quantity AS reservedQuantity FROM stock_order_items WHERE order_id = ? AND sku IS NOT NULL AND reserved_quantity > 0").bind(order.id).all();
    const now = new Date().toISOString();
    const statements = [];
    for (const line of lines.results || []) {
      statements.push(env.DB.prepare("UPDATE inventory_items SET reserved = reserved - ?, updated_at = ?, updated_by = 'system' WHERE sku = ?").bind(Number(line.reservedQuantity),now,line.sku));
      statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku, order_id, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, ?, 'release', 0, ?, 'Reserva vencida', 'system', ?)").bind(line.sku,order.id,-Number(line.reservedQuantity),now));
    }
    statements.push(env.DB.prepare("UPDATE stock_orders SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'reserved'").bind(now,order.id));
    try { await env.DB.batch(statements); expired += 1; }
    catch (error) { if (!String(error?.message||error).includes("UNIQUE")) console.error("No se pudo vencer la reserva",order.id,error); }
  }
  return expired;
}

async function listOrders(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  await expireReservations(env);
  const result = await env.DB.prepare("SELECT id, order_code AS orderCode, status, expires_at AS expiresAt, total_cents AS totalCents, currency, customer_name AS customerName, customer_phone AS customerPhone, fulfillment, requested_date AS requestedDate, payment_method AS paymentMethod, snapshot_json AS snapshotJson, created_at AS createdAt, updated_at AS updatedAt, confirmed_by AS confirmedBy, cancelled_by AS cancelledBy FROM stock_orders ORDER BY created_at DESC LIMIT 500").all();
  const items = (result.results||[]).map(row=>{let snapshot={};try{snapshot=JSON.parse(row.snapshotJson||"{}");}catch{} const {snapshotJson,...order}=row;return {...order,expiresAt:Number(order.expiresAt),items:snapshot.items||[],customer:snapshot.customer||{}};});
  return json({items,summary:{reserved:items.filter(item=>item.status==="reserved").length,confirmed:items.filter(item=>item.status==="confirmed").length,expired:items.filter(item=>item.status==="expired").length}});
}

async function changeOrderStatus(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[3] || "";
  const action = parts[4] || "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !["confirm","cancel","extend"].includes(action)) return json({error:"Acción de pedido inválida"},400);
  const order = await env.DB.prepare("SELECT id, order_code AS orderCode, status, expires_at AS expiresAt, total_cents AS totalCents, customer_name AS customerName, payment_method AS paymentMethod, requested_date AS requestedDate, snapshot_json AS snapshotJson FROM stock_orders WHERE id = ?").bind(id).first();
  if (!order) return json({error:"Pedido no encontrado"},404);
  if (action === "extend") {
    if (order.status !== "reserved") return json({error:"Solo se pueden extender reservas activas"},409);
    const expiresAt = Math.floor(Date.now()/1000)+RESERVATION_TTL_SECONDS;
    await env.DB.prepare("UPDATE stock_orders SET expires_at = ?, updated_at = ? WHERE id = ? AND status = 'reserved'").bind(expiresAt,new Date().toISOString(),id).run();
    return json({ok:true,status:"reserved",expiresAt,reservedUntil:new Date(expiresAt*1000).toISOString()});
  }
  if (order.status !== "reserved") return json({error:`El pedido ya está ${order.status}.`},409);
  if (Number(order.expiresAt)<=Math.floor(Date.now()/1000)) { await expireReservations(env); return json({error:"La reserva venció y el stock fue liberado."},409); }
  const lines = await env.DB.prepare("SELECT sku, reserved_quantity AS reservedQuantity FROM stock_order_items WHERE order_id = ? AND sku IS NOT NULL AND reserved_quantity > 0").bind(id).all();
  const now = new Date().toISOString();
  const statements = [];
  for (const line of lines.results||[]) {
    const amount = Number(line.reservedQuantity);
    if (action === "confirm") {
      statements.push(env.DB.prepare("UPDATE inventory_items SET on_hand = on_hand - ?, reserved = reserved - ?, updated_at = ?, updated_by = ? WHERE sku = ?").bind(amount,amount,now,session.username,line.sku));
      statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku, order_id, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, ?, 'sale', ?, ?, 'Pedido confirmado', ?, ?)").bind(line.sku,id,-amount,-amount,session.username,now));
    } else {
      statements.push(env.DB.prepare("UPDATE inventory_items SET reserved = reserved - ?, updated_at = ?, updated_by = ? WHERE sku = ?").bind(amount,now,session.username,line.sku));
      statements.push(env.DB.prepare("INSERT INTO inventory_movements (sku, order_id, movement_type, delta_on_hand, delta_reserved, note, actor, created_at) VALUES (?, ?, 'release', 0, ?, 'Pedido cancelado', ?, ?)").bind(line.sku,id,-amount,session.username,now));
    }
  }
  if (action === "confirm") {
    let snapshot={};try{snapshot=JSON.parse(order.snapshotJson||"{}");}catch{}
    const itemsText=(snapshot.items||[]).map(item=>`${item.quantity}× ${item.name}${item.optionSummary?` · ${item.optionSummary}`:""}`).join("; ")||`Pedido ${order.orderCode}`;
    statements.push(env.DB.prepare("UPDATE stock_orders SET status = 'confirmed', confirmed_by = ?, updated_at = ? WHERE id = ? AND status = 'reserved'").bind(session.username,now,id));
    statements.push(env.DB.prepare("INSERT INTO sales (id, sold_at, total_cents, currency, status, channel, payment_method, customer_name, items_text, notes, created_by, created_at, updated_by, updated_at, order_id) VALUES (?, ?, ?, 'USD', 'confirmed', 'WhatsApp', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(),now.slice(0,10),Number(order.totalCents),order.paymentMethod,order.customerName,itemsText,`Pedido ${order.orderCode}`,session.username,now,session.username,now,id));
  } else statements.push(env.DB.prepare("UPDATE stock_orders SET status = 'cancelled', cancelled_by = ?, updated_at = ? WHERE id = ? AND status = 'reserved'").bind(session.username,now,id));
  statements.push(env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, ?, ?, ?)").bind(session.username,action==="confirm"?"order_confirm":"order_cancel",order.orderCode,now));
  try { await env.DB.batch(statements); }
  catch (error) { if (String(error?.message||error).includes("UNIQUE")) return json({error:"Este pedido ya fue procesado."},409); throw error; }
  return json({ok:true,status:action==="confirm"?"confirmed":"cancelled"});
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
  const existing = await env.DB.prepare("SELECT revision FROM catalog_state WHERE id = 'published'").first();
  const expectedRevision = Number(payload.expectedRevision);
  const currentRevision = Number(existing?.revision || 0);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) return json({ error: "El catálogo cambió en otro dispositivo", revision: currentRevision }, 409);
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

async function listSales(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const result = await env.DB.prepare("SELECT id, sold_at AS soldAt, total_cents AS totalCents, currency, status, channel, payment_method AS paymentMethod, customer_name AS customerName, items_text AS items, notes, created_by AS createdBy, created_at AS createdAt, updated_by AS updatedBy, updated_at AS updatedAt FROM sales ORDER BY sold_at DESC, created_at DESC LIMIT 1000").all();
  const items = result.results || [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const confirmed = items.filter(item => item.status === "confirmed");
  const sum = values => values.reduce((total, item) => total + Number(item.totalCents || 0), 0);
  return json({
    items,
    summary: {
      todayCents: sum(confirmed.filter(item => item.soldAt === today)),
      monthCents: sum(confirmed.filter(item => String(item.soldAt).startsWith(month))),
      yearCents: sum(confirmed.filter(item => String(item.soldAt).startsWith(year))),
      allCents: sum(confirmed),
      confirmedCount: confirmed.length,
      pendingCount: items.filter(item => item.status === "pending").length
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
  const sale = validatedSale(await request.json());
  if (!sale) return json({ error: "Indica fecha, monto válido y productos vendidos." }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sales (id, sold_at, total_cents, currency, status, channel, payment_method, customer_name, items_text, notes, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, sale.soldAt, sale.totalCents, sale.status, sale.channel, sale.paymentMethod, sale.customerName, sale.items, sale.notes, session.username, now, session.username, now),
    env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'sale_create', ?, ?)").bind(session.username, `${sale.soldAt} · USD ${(sale.totalCents / 100).toFixed(2)}`, now)
  ]);
  return json({ ok: true, id }, 201);
}

async function updateSale(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Venta inválida" }, 400);
  const sale = validatedSale(await request.json());
  if (!sale) return json({ error: "Indica fecha, monto válido y productos vendidos." }, 400);
  const now = new Date().toISOString();
  const saved = await env.DB.prepare("UPDATE sales SET sold_at = ?, total_cents = ?, status = ?, channel = ?, payment_method = ?, customer_name = ?, items_text = ?, notes = ?, updated_by = ?, updated_at = ? WHERE id = ?")
    .bind(sale.soldAt, sale.totalCents, sale.status, sale.channel, sale.paymentMethod, sale.customerName, sale.items, sale.notes, session.username, now, id).run();
  if (Number(saved?.meta?.changes || 0) !== 1) return json({ error: "Venta no encontrada" }, 404);
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'sale_update', ?, ?)").bind(session.username, id, now).run();
  return json({ ok: true, id });
}

async function deleteSale(request, env, url) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Venta inválida" }, 400);
  const deleted = await env.DB.prepare("DELETE FROM sales WHERE id = ?").bind(id).run();
  if (Number(deleted?.meta?.changes || 0) !== 1) return json({ error: "Venta no encontrada" }, 404);
  await env.DB.prepare("INSERT INTO audit_log (username, action, details, created_at) VALUES (?, 'sale_delete', ?, ?)").bind(session.username, id, new Date().toISOString()).run();
  return json({ ok: true });
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
    if (typeof product.image === "string" && product.image.startsWith("data:")) return "Guarda las imágenes con el botón de subida antes de publicar";
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
