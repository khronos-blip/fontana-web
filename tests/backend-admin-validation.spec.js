const { test, expect } = require("@playwright/test");
const { execFileSync, spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function workerModuleCheck(script) {
  const workerUrl = pathToFileURL(path.resolve(__dirname, "../backend/src/worker.js")).href;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { validateCatalog, resolveReservationCart } from ${JSON.stringify(workerUrl)};
    ${validCatalog.toString()}
    ${invalidCatalogCases.toString()}
    ${script}
  `], { cwd: path.resolve(__dirname, ".."), encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } }));
}

function validCatalog() {
  return {
    version: 2, settings: { stockTodayOpen: true },
    products: [{ id: "guard-product", name: "Producto de prueba", price: 10, status: "available", sizes: [], variants: [] }],
    builders: {
      fonkies: { minimumQuantity: 4, singlePrice: 15, mixedPrice: 17, extraPrice: 3.5, flavors: [{ name: "Chocolate", inventoryKey: "chocolate", status: "available" }] },
      fomb: { extraPrice: 3.5, sizes: [{ quantity: 4, price: 15 }, { quantity: 12, price: 30 }], flavors: [{ name: "Pistacho", inventoryKey: "pistacho", status: "available" }] }
    }
  };
}

function invalidCatalogCases() {
  return [
    ...[-1, "", " ", true, "abc", Infinity, NaN].map(value => [`precio de producto ${String(value)}`, state => { state.products[0].price = value; }]),
    ...[-1, "", 1.5, true, 100001].map(value => [`stock de producto ${String(value)}`, state => { state.products[0].stockQuantity = value; }]),
    ["stock de variante", state => { state.products[0].variants = [{ name: "Pequeña", stockQuantity: -1 }]; }],
    ["stock de sabor", state => { state.builders.fonkies.flavors[0].stockQuantity = 0.5; }],
    ["builders array", state => { state.builders = []; }],
    ["builder nulo", state => { state.builders.fomb = null; }],
    ["builder primitivo", state => { state.builders.fonkies = true; }],
    ["sabores no array", state => { state.builders.fonkies.flavors = {}; }],
    ["sabor nulo", state => { state.builders.fonkies.flavors = [null]; }],
    ["precio builder negativo", state => { state.builders.fonkies.singlePrice = -1; }],
    ["extra vacío", state => { state.builders.fonkies.extraPrice = ""; }],
    ["extra nulo", state => { state.builders.fomb.extraPrice = null; }],
    ["mínimo vacío", state => { state.builders.fonkies.minimumQuantity = ""; }],
    ["mínimo fraccional", state => { state.builders.fonkies.minimumQuantity = 1.5; }],
    ["sizes no array", state => { state.products[0].sizes = {}; }],
    ["presentación incompleta", state => { state.products[0].sizes = [{ name: "Pequeña" }]; }],
    ["presentación negativa", state => { state.products[0].sizes = [{ name: "Pequeña", price: -2 }]; }],
    ["presentación vacía", state => { state.products[0].sizes = [{ name: "Pequeña", price: "" }]; }],
    ["presentaciones duplicadas", state => { state.products[0].sizes = [{ name: "Pequeña", price: 2 }, { name: "pequena", price: 3 }]; }],
    ["variante inválida", state => { state.products[0].variants = [null]; }],
    ["variantes duplicadas", state => { state.products[0].variants = [{ name: "Café" }, { name: "Cafe" }]; }],
    ["cajas duplicadas", state => { state.builders.fomb.sizes[1].quantity = 4; }],
    ["caja fraccional", state => { state.builders.fomb.sizes[0].quantity = 1.5; }],
    ["caja sin precio", state => { delete state.builders.fomb.sizes[0].price; }],
    ["caja precio negativo", state => { state.builders.fomb.sizes[0].price = -1; }],
    ["caja vacía", state => { state.builders.fomb.sizes = []; }]
  ];
}

test("catálogo rechaza importes y estructuras inválidos sin convertirlos ni descartar opciones", async () => {
  const result = workerModuleCheck(`
    const invalid = invalidCatalogCases().map(([description,mutate]) => {
      const state=validCatalog();mutate(state);return {description,error:validateCatalog(state)};
    });
    const quoted=validCatalog();quoted.products[0].price=null;
    quoted.products[0].sizes=[{name:"Por cotizar",price:null,status:"sold-out"}];
    const free=validCatalog();free.products[0].price=0;free.builders.fonkies.singlePrice=0;free.builders.fonkies.extraPrice=0;
    process.stdout.write(JSON.stringify({invalid,valid:validateCatalog(validCatalog()),quoted:validateCatalog(quoted),free:validateCatalog(free),legacy:validateCatalog({products:[],builders:{}})}));
  `);
  expect(result).toMatchObject({ valid: "", quoted: "", free: "", legacy: "" });
  for (const { description, error } of result.invalid) expect(error, description).not.toBe("");
});

test("reservas conservan precios cero explícitos y no sustituyen presentaciones por cotizar", async () => {
  const result = workerModuleCheck(`
    const state=validCatalog();state.builders.fonkies.singlePrice=0;state.builders.fonkies.extraPrice=0;
    const resolved=resolveReservationCart(state,[{kind:"fonkies",quantity:1,flavors:[{inventoryKey:"chocolate",name:"Chocolate",quantity:5}]}],{electricityEnabled:true});
    state.products[0].sizes=[{name:"Por cotizar",price:null,status:"available"}];
    let quoteError="";try{resolveReservationCart(state,[{kind:"product",productId:"guard-product",quantity:1,size:"Por cotizar"}],{electricityEnabled:true});}catch(error){quoteError=error.message;}
    process.stdout.write(JSON.stringify({totalCents:resolved.totalCents,quoteError}));
  `);
  expect(result).toEqual({ totalCents: 0, quoteError: "invalid_product" });
});

async function temporaryWorker(callback) {
  const repository = path.resolve(__dirname, "..");
  const wrangler = path.join(repository, "node_modules/.bin/wrangler");
  const persist = mkdtempSync(path.join(os.tmpdir(), "fontana-admin-guards-"));
  const common = ["--config", "backend/wrangler.jsonc", "--persist-to", persist];
  const environment = { ...process.env, CI: "1", NO_COLOR: "1" };
  let child;
  let logs = "";
  try {
    execFileSync(wrangler, ["d1", "migrations", "apply", "fontana-catalog", "--local", ...common], { cwd: repository, env: environment, stdio: "pipe" });
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(error => error ? reject(error) : resolve(port)); });
    });
    child = spawn(wrangler, ["dev", "--local", ...common, "--port", String(port), "--var", "SETUP_TOKEN:guard-integration-setup"], { cwd: repository, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => { logs += chunk; });
    child.stderr.on("data", chunk => { logs += chunk; });
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    for (;;) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Worker local no inició. ${logs}`);
      try { if ((await fetch(`${base}/v1/health`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const query = sql => JSON.parse(execFileSync(wrangler, ["d1", "execute", "fontana-catalog", "--local", ...common, "--command", sql, "--json"], { cwd: repository, env: environment, encoding: "utf8" }))[0]?.results || [];
    const api = async (pathname, { body, method = body === undefined ? "GET" : "POST", cookie = "", headers = {} } = {}) => {
      const response = await fetch(`${base}${pathname}`, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, headers: response.headers, payload: await response.json() };
    };
    await callback({ api, query });
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    rmSync(persist, { recursive: true, force: true });
  }
}

test("Worker+D1 protege catálogo, cantidades vacías, ajustes simultáneos y auditoría atómica", async () => {
  test.setTimeout(120_000);
  await temporaryWorker(async ({ api, query }) => {
    expect((await api("/v1/setup", { headers: { Authorization: "Bearer guard-integration-setup" }, body: { username: "owner-guards", password: "local-guards-only-12345", displayName: "Owner local" } })).status).toBe(201);
    const login = await api("/v1/auth/login", { body: { username: "owner-guards", password: "local-guards-only-12345" } });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const state = validCatalog();
    state.products.push({ id: "quoted-product", name: "Cotización de prueba", price: null, status: "available", sizes: [], variants: [] });
    expect((await api("/v1/admin/catalog", { cookie, method: "PUT", body: { state, expectedRevision: 0 } })).status).toBe(200);
    const before = (await api("/v1/admin/catalog", { cookie })).payload;
    for (const [description, mutate] of invalidCatalogCases().filter(([description]) => !/precio de producto (Infinity|NaN)/.test(description))) {
      const invalid = structuredClone(state);
      mutate(invalid);
      const rejected = await api("/v1/admin/catalog", { cookie, method: "PUT", body: { state: invalid, expectedRevision: 1 } });
      expect(rejected.status, `${description}: ${JSON.stringify(rejected.payload)}`).toBe(400);
    }
    expect((await api("/v1/admin/catalog", { cookie, method: "PUT", body: null })).status).toBe(400);
    expect((await api("/v1/admin/catalog", { cookie })).payload).toEqual(before);
    const sku = "product:guard-product:base:base";
    const endpoint = `/v1/admin/inventory/${encodeURIComponent(sku)}`;
    for (const onHand of ["", " ", null, true, false, -1, 2.5, 100001, "oops"]) {
      const result = await api(endpoint, { cookie, method: "PUT", body: { onHand, trackStock: true } });
      expect(result.status, JSON.stringify({ onHand, payload: result.payload })).toBe(400);
    }
    expect(query("SELECT COUNT(*) AS count FROM inventory_movements WHERE movement_type='adjustment'")).toEqual([{ count: 0 }]);
    const first = await api(endpoint, { cookie, method: "PUT", body: { onHand: "10", trackStock: false } });
    expect(first.status, first.payload.error).toBe(200);
    expect(first.payload).toMatchObject({ onHand: 10, trackStock: true });
    expect(first.payload.updatedAt).toBeTruthy();
    const guards = { expectedUpdatedAt: first.payload.updatedAt, expectedOnHand: 10, expectedTrackStock: true };
    const concurrent = await Promise.all([12, 15].map(onHand => api(endpoint, { cookie, method: "PUT", body: { onHand, trackStock: true, ...guards } })));
    expect(concurrent.map(result => result.status).sort()).toEqual([200, 409]);
    expect(concurrent.find(result => result.status === 409).payload.code).toBe("stale_state");
    const winner = concurrent.find(result => result.status === 200).payload;
    expect(winner.updatedAt).not.toBe(first.payload.updatedAt);
    expect(query("SELECT COUNT(*) AS count, SUM(delta_on_hand) AS total FROM inventory_movements WHERE movement_type='adjustment'")).toEqual([{ count: 2, total: winner.onHand }]);
    expect(query("SELECT COUNT(*) AS count FROM audit_log WHERE action='inventory_adjust'")).toEqual([{ count: 2 }]);
    for (const precondition of [
      { expectedOnHand: 0 }, { expectedTrackStock: false }, { expectedUpdatedAt: first.payload.updatedAt }
    ]) {
      const stale = await api(endpoint, { cookie, method: "PUT", body: { onHand: 3, trackStock: true, ...precondition } });
      expect(stale.status).toBe(409);
      expect(stale.payload.code).toBe("stale_state");
    }
    const inventoryBeforeReservation = (await api("/v1/admin/inventory", { cookie })).payload.items.find(item => item.sku === sku);
    const reservation = await api("/v1/orders/reserve", { body: {
      clientKey: "guard-local-reservation-01", items: [{ kind: "product", productId: "guard-product", quantity: 1 }],
      customer: { name: "Cliente de prueba", phone: "0412 555 0199", requestedDate: "2026-09-06", fulfillment: "Pickup" }
    } });
    expect(reservation.status, reservation.payload.error).toBe(201);
    const staleAfterReservation = await api(endpoint, { cookie, method: "PUT", body: { onHand: 3, trackStock: true, expectedUpdatedAt: inventoryBeforeReservation.updatedAt, expectedOnHand: inventoryBeforeReservation.onHand } });
    expect(staleAfterReservation.status).toBe(409);
    expect((await api(endpoint, { cookie, method: "PUT", body: { onHand: 0, trackStock: false } })).status).toBe(409);
    expect(query("SELECT COUNT(*) AS count FROM audit_log WHERE action='inventory_adjust'")).toEqual([{ count: 2 }]);
    const quote = await api("/v1/admin/sales", { cookie, body: {
      idempotencyKey: "guard-quoted-sale-00001", soldAt: "2026-09-06", channel: "Presencial", referenceCurrency: "USD", status: "pending", payments: [],
      items: [{ productId: "quoted-product", sku: "product:quoted-product:base:base", quantity: 1, unitPriceCents: 7500 }]
    } });
    expect(quote.status, quote.payload.error).toBe(201);
    expect(quote.payload.balanceCents).toBe(7500);
    expect(query("SELECT total_cents AS total FROM sales WHERE status='pending'")).toEqual([{ total: 7500 }]);
  });
});
