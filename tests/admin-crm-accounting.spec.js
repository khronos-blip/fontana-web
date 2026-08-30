const { test, expect } = require("@playwright/test");
const { execFileSync, spawn } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const accountingModule = () => import("../backend/src/accounting.mjs");

async function unusedLocalPort() {
  return new Promise((resolve,reject) => {
    const server=net.createServer();
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const {port}=server.address();
      server.close(error=>error?reject(error):resolve(port));
    });
  });
}

async function waitForWorker(url, child, output) {
  const deadline=Date.now()+30_000;
  while(Date.now()<deadline) {
    if(child.exitCode!==null) throw new Error(`Wrangler terminó antes de iniciar (${child.exitCode}).\n${output()}`);
    try {
      const response=await fetch(`${url}/v1/health`);
      if(response.ok)return;
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`Wrangler no inició a tiempo.\n${output()}`);
}

async function stopWorker(child) {
  if(child.exitCode!==null)return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve=>child.once("exit",resolve)),
    new Promise(resolve=>setTimeout(resolve,3_000))
  ]);
  if(child.exitCode===null)child.kill("SIGKILL");
}

async function withTemporaryWorker(callback) {
  const repository=path.resolve(__dirname,"..");
  const wrangler=path.join(repository,"node_modules/.bin/wrangler");
  const persistDirectory=mkdtempSync(path.join(os.tmpdir(),"fontana-crm-d1-"));
  const common=["--config","backend/wrangler.jsonc","--persist-to",persistDirectory];
  let child;
  let logs="";
  try {
    execFileSync(wrangler,["d1","migrations","apply","fontana-catalog","--local",...common],{cwd:repository,env:{...process.env,CI:"1"},stdio:"pipe"});
    const port=await unusedLocalPort();
    child=spawn(wrangler,["dev","--local",...common,"--port",String(port),"--var","SETUP_TOKEN:crm-integration-setup","--var","ALLOWED_ORIGINS:http://127.0.0.1:8767"],{
      cwd:repository,
      env:{...process.env,CI:"1",NO_COLOR:"1"},
      stdio:["ignore","pipe","pipe"]
    });
    child.stdout.on("data",chunk=>{logs+=chunk;});
    child.stderr.on("data",chunk=>{logs+=chunk;});
    const baseUrl=`http://127.0.0.1:${port}`;
    await waitForWorker(baseUrl,child,()=>logs);
    const query=sql=>{
      const raw=execFileSync(wrangler,["d1","execute","fontana-catalog","--local",...common,"--command",sql,"--json"],{cwd:repository,env:{...process.env,CI:"1"},encoding:"utf8"});
      return JSON.parse(raw)[0]?.results||[];
    };
    await callback({baseUrl,query,stop:()=>stopWorker(child)});
  } finally {
    if(child)await stopWorker(child);
    rmSync(persistDirectory,{recursive:true,force:true});
  }
}

async function apiJson(baseUrl, pathname, {cookie="",body,headers={},method=body===undefined?"GET":"POST"}={}) {
  const response=await fetch(`${baseUrl}${pathname}`,{
    method,
    headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(cookie?{Cookie:cookie}:{}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const payload=await response.json().catch(()=>null);
  return {response,payload};
}

function expectOneConcurrentWinner(results, allowedSuccessStatuses = [200, 201]) {
  const successes=results.filter(result=>allowedSuccessStatuses.includes(result.response.status));
  const stale=results.filter(result=>result.response.status===409);
  expect(successes,JSON.stringify(results.map(result=>({status:result.response.status,payload:result.payload})))).toHaveLength(1);
  expect(stale,JSON.stringify(results.map(result=>({status:result.response.status,payload:result.payload})))).toHaveLength(1);
  expect(stale[0].payload).toMatchObject({code:"stale_state"});
  return {winner:successes[0],stale:stale[0],winnerIndex:results.indexOf(successes[0])};
}

test("los importes multimoneda conservan escala, base y redondeo exactos", async () => {
  const {
    BCV_RATE_SCALE,
    SUPPORTED_PAYMENT_CURRENCIES,
    decimalToScaledInteger,
    paymentScale,
    referenceCentsForPayment,
    functionalUsdCentsForPayment,
    functionalUsdCentsForReference,
    derivePaymentStatus,
    deriveSettlementAllocation
  } = await accountingModule();

  expect([...SUPPORTED_PAYMENT_CURRENCIES].sort()).toEqual(["EUR", "USD", "VES"]);
  expect(paymentScale("VES", 2)).toBe(2);
  expect(paymentScale("USD", 2)).toBe(2);
  expect(paymentScale("EUR", 2)).toBe(2);
  expect(paymentScale("USDT", 6)).toBe(0);
  expect(decimalToScaledInteger("922,69121677", BCV_RATE_SCALE)).toBe(92_269_121_677);
  expect(decimalToScaledInteger("10.005", 2)).toBeNull();

  expect(referenceCentsForPayment({
    amountMinor: 1_000,
    amountScale: 2,
    currency: "USD",
    referenceCurrency: "USD"
  })).toBe(1_000);
  expect(referenceCentsForPayment({
    amountMinor: 1_000,
    amountScale: 2,
    currency: "EUR",
    referenceCurrency: "EUR"
  })).toBe(1_000);
  expect(referenceCentsForPayment({
    amountMinor: 1_000,
    amountScale: 2,
    currency: "EUR",
    referenceCurrency: "USD"
  })).toBeNull();

  const officialCrossRate = {
    usdRateScaled: 79_499_170_000,
    eurRateScaled: 92_269_121_677
  };
  expect(functionalUsdCentsForPayment({
    amountMinor: 1_000,
    amountScale: 2,
    currency: "EUR",
    ...officialCrossRate
  })).toBe(1_161);
  expect(functionalUsdCentsForReference({
    referenceAmountCents: 1_000,
    referenceCurrency: "EUR",
    ...officialCrossRate
  })).toBe(1_161);
  expect(functionalUsdCentsForReference({
    referenceAmountCents: 1_000,
    referenceCurrency: "EUR"
  })).toBeNull();
  expect(referenceCentsForPayment({
    amountMinor: 1_000,
    amountScale: 2,
    currency: "USD",
    referenceCurrency: "EUR"
  })).toBeNull();

  // 79.499,17 VES a 794,9917 VES/USD equivalen exactamente a USD 100,00.
  expect(referenceCentsForPayment({
    amountMinor: 7_949_917,
    amountScale: 2,
    currency: "VES",
    referenceCurrency: "USD",
    rateBasis: "USD",
    rateScaled: 79_499_170_000
  })).toBe(10_000);
  expect(referenceCentsForPayment({
    amountMinor: 7_949_917,
    amountScale: 2,
    currency: "VES",
    referenceCurrency: "EUR",
    rateBasis: "USD",
    rateScaled: 79_499_170_000
  })).toBeNull();

  // 0,01 VES / 2 VES/USD = USD 0,005: la división entera redondea medio hacia arriba.
  expect(referenceCentsForPayment({
    amountMinor: 1,
    amountScale: 2,
    currency: "VES",
    referenceCurrency: "USD",
    rateBasis: "USD",
    rateScaled: 200_000_000
  })).toBe(1);

  // Una conversión que desaparece al redondear no representa un cobro válido.
  // El Worker debe rechazar este cero antes de crear pago o asiento.
  expect(referenceCentsForPayment({
    amountMinor: 1,
    amountScale: 2,
    currency: "VES",
    referenceCurrency: "USD",
    rateBasis: "USD",
    rateScaled: 999_999_999_999_999
  })).toBe(0);

  expect(derivePaymentStatus(10_000, 4_000)).toEqual({
    status: "partial",
    balanceRefCents: 6_000,
    overpaymentRefCents: 0
  });
  expect(derivePaymentStatus(10_000, 10_000)).toEqual({
    status: "paid",
    balanceRefCents: 0,
    overpaymentRefCents: 0
  });
  expect(derivePaymentStatus(10_000, 10_001)).toEqual({
    status: "paid",
    balanceRefCents: 0,
    overpaymentRefCents: 1
  });

  // Venta EUR 100 a USD 125: un abono EUR 40 recibido después vale USD 48.
  // Se descargan USD 50 de CxC al snapshot de venta y USD 2 van a pérdida FX.
  expect(deriveSettlementAllocation({
    saleTotalReferenceCents:10_000,
    saleFunctionalTotalCents:12_500,
    paidBeforeReferenceCents:0,
    paymentReferenceCents:4_000,
    paymentFunctionalCents:4_800
  })).toEqual({
    referenceAppliedCents:4_000,
    overpaymentReferenceCents:0,
    carryingReceivableCreditCents:5_000,
    appliedPaymentFunctionalCents:4_800,
    customerCreditFunctionalCents:0,
    fxGainFunctionalCents:0,
    fxLossFunctionalCents:200
  });
  expect(deriveSettlementAllocation({
    saleTotalReferenceCents:10_000,
    saleFunctionalTotalCents:12_500,
    paidBeforeReferenceCents:4_000,
    paymentReferenceCents:6_000,
    paymentFunctionalCents:7_200
  })).toMatchObject({
    carryingReceivableCreditCents:7_500,
    customerCreditFunctionalCents:0,
    fxGainFunctionalCents:0,
    fxLossFunctionalCents:300
  });
  expect(deriveSettlementAllocation({
    saleTotalReferenceCents:10_000,
    saleFunctionalTotalCents:10_000,
    paidBeforeReferenceCents:4_000,
    paymentReferenceCents:6_100,
    paymentFunctionalCents:6_100
  })).toMatchObject({
    referenceAppliedCents:6_000,
    overpaymentReferenceCents:100,
    carryingReceivableCreditCents:6_000,
    customerCreditFunctionalCents:100,
    fxGainFunctionalCents:0,
    fxLossFunctionalCents:0
  });
});

test("BCV conserva fecha valor y los cierres usan America/Caracas", async () => {
  const { caracasDate, parseBcvHtml, rateValueDateAllowed } = await accountingModule();
  const parsed = parseBcvHtml(`
    <div id="euro"><strong class="strong-tb"> 922,69121677</strong></div>
    <div id="dolar"><strong class="strong-tb">794,99170000</strong></div>
    Fecha Valor: <span content="2026-08-31T00:00:00-04:00">Lunes</span>
  `);

  expect(parsed).toEqual({
    valueDate: "2026-08-31",
    rates: { USD: 79_499_170_000, EUR: 92_269_121_677 },
    rateScale: 8
  });
  expect(caracasDate(new Date("2026-08-31T02:30:00.000Z"))).toBe("2026-08-30");
  expect(caracasDate(new Date("2026-08-31T04:00:00.000Z"))).toBe("2026-08-31");

  // El BCV puede publicar el viernes la tasa que entra en vigor el lunes,
  // pero no aceptamos snapshots alejados de la fecha real del cobro.
  expect(rateValueDateAllowed("2026-08-30","2026-08-31")).toBe(true);
  expect(rateValueDateAllowed("2026-08-30","2026-08-20")).toBe(false);
  expect(rateValueDateAllowed("2026-08-30","2026-08-27",{maxPastDays:3,maxFutureDays:0})).toBe(true);
  expect(rateValueDateAllowed("2026-08-30","2026-08-26",{maxPastDays:3,maxFutureDays:0})).toBe(false);
});

test("teléfonos venezolanos se deduplican sin usar el nombre", async () => {
  const { normalizePhone } = await accountingModule();
  const variants = [
    "0412 123 4567",
    "412-123-4567",
    "+58 412 123 4567",
    "0058 412 123 4567"
  ];
  expect(new Set(variants.map(normalizePhone))).toEqual(new Set(["+584121234567"]));
  expect(normalizePhone("Andrea Pérez")).toBe("");
  expect(normalizePhone("123")).toBe("");
});

test("el esquema guarda snapshots y nunca persiste REF ni USDT como moneda", async () => {
  const migration = readFileSync("backend/migrations/0007_crm_payments_ledger.sql", "utf8");
  const adminScript = readFileSync("admin/admin.js", "utf8");

  for (const table of [
    "customers",
    "sale_items",
    "payments",
    "exchange_rates",
    "idempotency_keys",
    "entity_mutation_claims",
    "accounts",
    "journal_entries",
    "journal_lines",
    "expenses"
  ]) {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  }

  expect(migration).toContain("normalized_phone TEXT NOT NULL UNIQUE");
  expect(migration).toContain("image_url_snapshot TEXT NOT NULL");
  expect(migration).toContain("CREATE TABLE IF NOT EXISTS sale_item_inventory_units");
  expect(migration).toContain("exchange_rate_value_date TEXT");
  expect(migration).toContain("exchange_rate_scaled INTEGER");
  expect(migration).toContain("exchange_rate_source_url TEXT NOT NULL");
  expect(migration).toContain("payment_date TEXT NOT NULL");
  expect(migration).toContain("reference_currency TEXT NOT NULL");
  expect(migration).toContain("reference_exchange_rate_id TEXT");
  expect(migration).toContain("reference_exchange_rate_scaled INTEGER");
  expect(migration).toContain("reference_exchange_rate_value_date TEXT");
  expect(migration).toContain("functional_exchange_rate_id TEXT");
  expect(migration).toContain("functional_exchange_rate_scaled INTEGER");
  expect(migration).toContain("functional_exchange_rate_value_date TEXT");
  expect(migration).toContain("income-fx-gain-usd");
  expect(migration).toContain("expense-fx-loss-usd");
  expect(migration).not.toMatch(/SET\s+currency\s*=\s*['\"]REF['\"]/i);
  expect(migration).not.toMatch(/currency\s+IN\s*\([^)]*['\"]REF['\"]/i);
  expect(migration).not.toMatch(/currency\s+IN\s*\([^)]*['\"]USDT['\"]/i);
  expect(migration).not.toMatch(/,\s*['\"]REF['\"]\s*,\s*[01]\s*,\s*[01]\s*,/i);
  expect(migration).not.toMatch(/,\s*['\"]USDT['\"]\s*,\s*[01]\s*,\s*[01]\s*,/i);
  expect(adminScript).toContain("priceOverrideReason:item.priceOverrideReason||undefined");
  expect(adminScript).toContain("Precio automático del constructor Fonkies");
  expect(adminScript).toContain("Precio automático del constructor Fomb");
});

test("Inventario, Pedidos, Ventas y Clientes conservan imágenes a 390 y 1280 px", async ({ page }) => {
  const apiOrigin = "http://fontana.localhost:8767";
  const productImage = "assets/ballerine-fontana-pro.jpg";
  const sale = {
    id:"11111111-1111-4111-8111-111111111111",
    soldAt:"2026-08-30",
    totalCents:1200,
    totalRefCents:1200,
    functionalTotalCents:1200,
    referenceCurrency:"USD",
    status:"confirmed",
    paymentStatus:"partial",
    mutationVersion:4,
    balanceRefCents:700,
    functionalBalanceCents:700,
    channel:"WhatsApp",
    customerId:"cus-12345678901234567890",
    customerName:"Ana Recurrente",
    customerPhone:"+58 412 123 4567",
    lineItems:[{name:"Torta Ballerine",quantity:1,optionSummary:"180 g",imageUrl:productImage,unitPriceCents:1200}],
    payments:[{
      status:"confirmed",method:"Pago Móvil",currency:"VES",amountMinor:50000,amountScale:2,
      referenceAmountCents:500,functionalAmountCents:500,paymentDate:"2026-08-30",
      notes:"Abono validado por WhatsApp"
    }]
  };
  const customer = {
    id:"cus-12345678901234567890",
    name:"Ana Recurrente",
    phone:"+58 412 123 4567",
    normalizedPhone:"+584121234567",
    email:"ana@example.com",
    defaultAddress:"Av. Principal, Caracas",
    internalNotes:"Prefiere entrega en la tarde",
    confirmedSalesCount:2,
    recurrent:true,
    lifetimeFunctionalUsdCents:2400,
    averageTicketFunctionalUsdCents:1200,
    outstandingFunctionalUsdCents:700,
    sales:[sale]
  };
  const order = {
    id:"22222222-2222-4222-8222-222222222222",
    orderCode:"FNT-IMG01",
    status:"reserved",
    mutationVersion:3,
    expiresAt:Math.floor(Date.now()/1000)+1800,
    totalCents:1200,
    customerName:"Ana Recurrente",
    customerPhone:"+58 412 123 4567",
    fulfillment:"Pickup",
    requestedDate:"2026-08-31",
    items:[{name:"Torta Ballerine",quantity:1,optionSummary:"180 g",imageUrl:productImage}]
  };

  await page.route("https://api.fontanasingluten.com/v1/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const headers = {
      "access-control-allow-origin":apiOrigin,
      "access-control-allow-credentials":"true",
      "access-control-allow-methods":"GET, POST, PUT, OPTIONS",
      "access-control-allow-headers":"content-type"
    };
    if (request.method() === "OPTIONS") return route.fulfill({status:204,headers});
    let payload;
    if (pathname === "/v1/auth/login") payload={ok:true,username:"fontana-test",displayName:"Fontana",role:"owner"};
    else if (pathname === "/v1/admin/catalog") payload={state:null,revision:0};
    else if (pathname === "/v1/admin/operations") payload={electricityEnabled:true,updatedAt:null,updatedBy:"fontana-test",affectedCount:1};
    else if (pathname === "/v1/admin/inventory") payload={items:[{sku:"product:ballerine:base:base",productId:"ballerine",kind:"product",label:"Torta Ballerine",optionSummary:"180 g",imageUrl:productImage,onHand:5,reserved:1,available:4,trackStock:true}],summary:{tracked:1,available:4,reserved:1,soldOut:0}};
    else if (pathname === "/v1/admin/orders") payload={items:[order],summary:{reserved:1,confirmed:0,expired:0}};
    else if (pathname === "/v1/admin/sales") payload={items:[sale],summary:{todayFunctionalCents:1200,monthFunctionalCents:1200,yearFunctionalCents:1200,allFunctionalCents:1200,confirmedCount:1,pendingCount:1}};
    else if (pathname === "/v1/admin/customers") payload={items:[customer],summary:{total:1,recurrent:1,newCustomers:0,withBalance:1}};
    else if (pathname === `/v1/admin/customers/${customer.id}`) payload={customer,sales:[sale],functionalCurrency:"USD"};
    else if (pathname === "/v1/admin/accounting/summary") payload={incomeFunctionalCents:500,receivableFunctionalCents:700,expenseFunctionalCents:0,netFunctionalCents:500,paymentsByCurrency:[],paymentsByMethod:[]};
    else if (pathname === "/v1/admin/expenses") payload={items:[]};
    else if (pathname === "/v1/admin/activity") payload={items:[]};
    else return route.fulfill({status:404,contentType:"application/json",headers,body:JSON.stringify({error:"not_found"})});
    return route.fulfill({status:200,contentType:"application/json",headers,body:JSON.stringify(payload)});
  });

  await page.goto(`${apiOrigin}/admin/`);
  await page.locator("#loginUsername").fill("fontana-test");
  await page.locator("#loginPassword").fill("password-de-prueba");
  await page.getByRole("button", {name:"Entrar al panel"}).click();

  const areas = [
    {name:"Inventario", row:"#inventoryList .inventory-row", image:".product-thumb"},
    {name:"Pedidos", row:"#ordersList .order-row", image:".order-item .product-thumb"},
    {name:"Ventas", row:"#salesList .sale-row", image:".product-image-stack .product-thumb"},
    {name:"Clientes", row:"#customersList .customer-row", image:"summary .product-thumb"}
  ];
  for (const viewport of [{width:390,height:844},{width:1280,height:900}]) {
    await page.setViewportSize(viewport);
    for (const area of areas) {
      await page.getByRole("button", {name:area.name,exact:true}).click();
      const row = page.locator(area.row).first();
      const image = row.locator(area.image).first();
      await expect(row).toBeVisible();
      await expect(image).toHaveAttribute("src", new RegExp(productImage.replaceAll(".", "\\.")));
      await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
      const geometry = await row.evaluate(element => {
        const box=element.getBoundingClientRect();
        return {left:box.left,right:box.right,viewport:window.innerWidth,pageFits:document.documentElement.scrollWidth<=document.documentElement.clientWidth};
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewport+1);
      expect(geometry.pageFits).toBe(true);
    }
  }

  await page.getByRole("button", {name:"Clientes",exact:true}).click();
  const profile = page.locator("#customersList .customer-row").first();
  await profile.locator("summary").click();
  const purchaseImage = profile.locator(".customer-purchase .product-thumb").first();
  await expect(purchaseImage).toHaveAttribute("src", new RegExp(productImage.replaceAll(".", "\\.")));
  await expect(purchaseImage).toBeVisible();
  await expect(profile.locator(".customer-contact")).toContainText("ana@example.com");
  await expect(profile.locator(".customer-contact")).toContainText("Av. Principal, Caracas");
  await expect(profile.locator(".customer-contact")).toContainText("Prefiere entrega en la tarde");
  await expect(profile.locator(".customer-purchase").first()).toContainText("Pago Móvil · VES 500,00 · Cobro 2026-08-30 · Nota: Abono validado por WhatsApp");
});

test("Admin conserva reintentos, rango, identidad, notas y versiones de mutación", async ({page}) => {
  test.setTimeout(90_000);
  const apiOrigin="http://fontana.localhost:8767";
  const image="assets/ballerine-fontana-pro.jpg";
  const namedSale={
    id:"sale-admin-named",soldAt:"2026-08-10",totalCents:1_000,totalRefCents:1_000,
    referenceCurrency:"USD",status:"confirmed",paymentStatus:"partial",paidRefCents:300,
    balanceRefCents:700,functionalBalanceCents:700,mutationVersion:4,channel:"Presencial",
    customerName:"Ana Admin",customerPhone:"0412 111 2233",
    lineItems:[{name:"Torta Admin",quantity:1,imageUrl:image,unitPriceCents:1_000}],
    payments:[{status:"confirmed",currency:"USD",amountMinor:300,amountScale:2,referenceAmountCents:300,method:"Efectivo",paymentDate:"2026-08-10"}]
  };
  const anonymousSale={
    id:"sale-admin-anonymous",soldAt:"2026-08-11",totalCents:1_200,totalRefCents:1_200,
    referenceCurrency:"USD",status:"pending",paymentStatus:"unpaid",paidRefCents:0,
    balanceRefCents:1_200,functionalBalanceCents:1_200,mutationVersion:2,channel:"WhatsApp",
    customerName:"",customerPhone:"",lineItems:[{name:"Torta pendiente",quantity:1,imageUrl:image,unitPriceCents:1_200}],payments:[]
  };
  const order={
    id:"order-admin-versioned",orderCode:"FNT-CAS01",status:"reserved",mutationVersion:3,
    expiresAt:Math.floor(Date.now()/1000)+1800,totalCents:1_500,customerName:"Cliente pedido",
    customerPhone:"0412 999 8877",fulfillment:"Pickup",requestedDate:"2026-08-31",
    items:[{name:"Torta pedido",quantity:1,imageUrl:image}]
  };
  const existingExpense={
    id:"expense-admin-versioned",expenseDate:"2026-08-10",category:"Ingredientes e insumos",
    description:"Compra existente",currency:"USD",amountMinor:2_500,amountScale:2,
    functionalAmountCents:2_500,method:"Efectivo",status:"posted",mutationVersion:5
  };
  const accountingRequests=[];
  const expensePosts=[];
  const expenseVoidPosts=[];
  const paymentPosts=[];
  const manualSalePosts=[];
  const saleVoidPosts=[];
  const orderMutationPosts=[];

  await page.route("https://api.fontanasingluten.com/v1/**",async route=>{
    const request=route.request(),url=new URL(request.url()),pathname=url.pathname,method=request.method();
    const headers={
      "access-control-allow-origin":apiOrigin,
      "access-control-allow-credentials":"true",
      "access-control-allow-methods":"GET, POST, PUT, OPTIONS",
      "access-control-allow-headers":"content-type"
    };
    const fulfill=(payload,status=200)=>route.fulfill({status,headers,contentType:"application/json",body:JSON.stringify(payload)});
    if(method==="OPTIONS")return route.fulfill({status:204,headers});
    if(pathname==="/v1/auth/login")return fulfill({ok:true,username:"fontana-test",displayName:"Fontana",role:"owner"});
    if(pathname==="/v1/admin/catalog")return fulfill({state:null,revision:0});
    if(pathname==="/v1/admin/operations")return fulfill({electricityEnabled:true,updatedAt:null,updatedBy:"fontana-test",affectedCount:1});
    if(pathname==="/v1/admin/inventory")return fulfill({items:[],summary:{tracked:0,available:0,reserved:0,soldOut:0}});
    if(pathname==="/v1/admin/orders"&&method==="GET")return fulfill({items:[order],summary:{reserved:1,confirmed:0,expired:0}});
    if(pathname.startsWith(`/v1/admin/orders/${order.id}/`)&&method==="POST"){
      orderMutationPosts.push({pathname,body:request.postDataJSON()});
      return fulfill({ok:true,status:pathname.endsWith("/cancel")?"cancelled":"reserved"});
    }
    if(pathname==="/v1/admin/sales"&&method==="GET")return fulfill({
      items:[namedSale,anonymousSale],
      summary:{todayFunctionalCents:0,monthFunctionalCents:2_200,yearFunctionalCents:2_200,allFunctionalCents:2_200,confirmedCount:1,pendingCount:2}
    });
    if(pathname==="/v1/admin/sales"&&method==="POST"){
      manualSalePosts.push(request.postDataJSON());
      return fulfill({saleId:"sale-created-pending",status:"pending",paymentStatus:"unpaid"},201);
    }
    if(/^\/v1\/admin\/sales\/[^/]+\/payments$/.test(pathname)&&method==="POST"){
      paymentPosts.push({pathname,body:request.postDataJSON()});
      return fulfill({saleId:pathname.split("/")[4],status:"confirmed",paymentStatus:"paid",balanceCents:0},201);
    }
    if(/^\/v1\/admin\/sales\/[^/]+\/void$/.test(pathname)&&method==="POST"){
      saleVoidPosts.push({pathname,body:request.postDataJSON()});
      return fulfill({status:"cancelled",paymentStatus:"voided"});
    }
    if(pathname==="/v1/admin/customers")return fulfill({items:[],summary:{total:0,recurrent:0,newCustomers:0,withBalance:0}});
    if(pathname==="/v1/admin/accounting/summary"&&method==="GET"){
      accountingRequests.push({pathname,from:url.searchParams.get("from"),to:url.searchParams.get("to")});
      return fulfill({collectedFunctionalCents:300,receivableFunctionalCents:1_900,expenseFunctionalCents:2_500,netCashFunctionalCents:-2_200,paymentsByCurrency:[],paymentsByMethod:[]});
    }
    if(pathname==="/v1/admin/expenses"&&method==="GET"){
      accountingRequests.push({pathname,from:url.searchParams.get("from"),to:url.searchParams.get("to")});
      return fulfill({items:[existingExpense]});
    }
    if(pathname==="/v1/admin/expenses"&&method==="POST"){
      expensePosts.push(request.postDataJSON());
      if(expensePosts.length===1)return fulfill({error:"Respuesta perdida simulada"},503);
      return fulfill({expenseId:"expense-replayed",status:"posted",replayed:true},200);
    }
    if(pathname===`/v1/admin/expenses/${existingExpense.id}/void`&&method==="POST"){
      expenseVoidPosts.push(request.postDataJSON());
      return fulfill({status:"voided"});
    }
    if(pathname==="/v1/admin/exchange-rates")return fulfill({
      requestedDate:url.searchParams.get("date"),exact:true,
      rates:{USD:{id:"rate-usd-ui",currency:"USD",rateScaled:8_000_000_000,rateScale:8,valueDate:url.searchParams.get("date")}}
    });
    if(pathname==="/v1/admin/activity")return fulfill({items:[]});
    return fulfill({error:"not_found"},404);
  });

  await page.goto(`${apiOrigin}/admin/`);
  await page.locator("#loginUsername").fill("fontana-test");
  await page.locator("#loginPassword").fill("password-de-prueba");
  await page.getByRole("button",{name:"Entrar al panel"}).click();
  await expect(page.getByRole("button",{name:"Contabilidad",exact:true})).toBeVisible();

  await page.getByRole("button",{name:"Contabilidad",exact:true}).click();
  accountingRequests.length=0;
  const rangeForm=page.locator("#accountingRangeForm");
  await rangeForm.locator("[name=from]").fill("2026-08-01");
  await rangeForm.locator("[name=to]").fill("2026-08-15");
  await rangeForm.getByRole("button",{name:"Aplicar período"}).click();
  await expect.poll(()=>accountingRequests.filter(entry=>entry.from==="2026-08-01"&&entry.to==="2026-08-15").map(entry=>entry.pathname).sort()).toEqual([
    "/v1/admin/accounting/summary","/v1/admin/expenses"
  ]);
  await expect(page.locator("#accountingPeriodLabel")).toContainText("2026-08-01");
  await expect(page.locator("#accountingPeriodLabel")).toContainText("2026-08-15");

  await page.locator("#newExpenseButton").click();
  const expenseForm=page.locator("#expenseForm");
  const firstExpenseKey=await expenseForm.locator("[name=idempotencyKey]").inputValue();
  expect(firstExpenseKey.length).toBeGreaterThanOrEqual(16);
  await expenseForm.locator("[name=description]").fill("Compra con respuesta perdida");
  await expenseForm.locator("[name=amount]").fill("25");
  await expenseForm.locator("[name=currency]").selectOption("USD");
  await expenseForm.getByRole("button",{name:"Guardar gasto"}).click();
  await expect.poll(()=>expensePosts.length).toBe(1);
  await expect(expenseForm).toBeVisible();
  await expect(expenseForm.getByRole("button",{name:"Guardar gasto"})).toBeEnabled();
  expect(await expenseForm.locator("[name=idempotencyKey]").inputValue()).toBe(firstExpenseKey);
  await expenseForm.getByRole("button",{name:"Guardar gasto"}).click();
  await expect.poll(()=>expensePosts.length).toBe(2);
  await expect(expenseForm).not.toBeVisible();
  expect(expensePosts[0].idempotencyKey).toBe(firstExpenseKey);
  expect(expensePosts[1].idempotencyKey).toBe(firstExpenseKey);
  expect(expensePosts[1]).toEqual(expensePosts[0]);

  await page.locator("#newExpenseButton").click();
  const secondExpenseKey=await expenseForm.locator("[name=idempotencyKey]").inputValue();
  expect(secondExpenseKey).not.toBe(firstExpenseKey);
  await expenseForm.locator("[data-close-dialog]").first().click();

  const expenseRow=page.locator(`[data-expense-id="${existingExpense.id}"]`);
  await expenseRow.locator("[data-void-expense]").click();
  const voidForm=page.locator("#voidForm");
  await expect(voidForm.locator("[name=expectedVersion]")).toHaveValue("5");
  await voidForm.locator("[name=reason]").fill("Gasto duplicado en conciliación");
  await voidForm.locator("[name=confirmImpact]").check();
  await voidForm.getByRole("button",{name:"Anular y conservar historial"}).click();
  await expect.poll(()=>expenseVoidPosts.length).toBe(1);
  expect(expenseVoidPosts[0]).toMatchObject({reason:"Gasto duplicado en conciliación",expectedVersion:5});

  await page.getByRole("button",{name:"Ventas",exact:true}).click();
  const namedRow=page.locator(`[data-sale-id="${namedSale.id}"]`);
  await namedRow.locator("[data-add-sale-payment]").click();
  const paymentForm=page.locator("#paymentForm");
  await expect(paymentForm.locator("[name=expectedVersion]")).toHaveValue("4");
  await paymentForm.locator("[name=customerEmail]").fill("ana.admin@example.com");
  await paymentForm.locator("[name=customerAddress]").fill("Calle del primer abono");
  await paymentForm.locator("[name=customerNotes]").fill("Cliente recurrente del panel");
  let paymentLines=paymentForm.locator(".payment-line");
  await paymentLines.nth(0).locator("[name=paidAmount]").fill("3");
  await paymentLines.nth(0).locator("[name=paidCurrency]").selectOption("USD");
  await paymentLines.nth(0).locator("[name=paymentNotes]").fill("Primera parte del abono");
  await paymentForm.locator("[data-add-payment-line]").click();
  paymentLines=paymentForm.locator(".payment-line");
  await expect(paymentLines).toHaveCount(2);
  await paymentLines.nth(1).locator("[name=paidAmount]").fill("4");
  await paymentLines.nth(1).locator("[name=paidCurrency]").selectOption("USD");
  await paymentLines.nth(1).locator("[name=paymentNotes]").fill("Segunda parte del abono");
  await paymentForm.getByRole("button",{name:"Registrar abono"}).click();
  await expect.poll(()=>paymentPosts.length).toBe(1);
  expect(paymentPosts[0].pathname).toBe(`/v1/admin/sales/${namedSale.id}/payments`);
  expect(paymentPosts[0].body).toMatchObject({
    expectedVersion:4,
    customer:{
      name:"Ana Admin",phone:"0412 111 2233",email:"ana.admin@example.com",
      address:"Calle del primer abono",notes:"Cliente recurrente del panel"
    }
  });
  expect(paymentPosts[0].body.payments).toMatchObject([
    {currency:"USD",amountMinor:300,notes:"Primera parte del abono"},
    {currency:"USD",amountMinor:400,notes:"Segunda parte del abono"}
  ]);

  await page.locator("#newSaleButton").click();
  await expect(paymentForm).toBeVisible();
  const firstCatalogCard=paymentForm.locator("#saleCatalogPicker .catalog-item").first();
  await expect(firstCatalogCard).toBeVisible();
  await firstCatalogCard.locator('[data-catalog-delta="1"]').click();
  await paymentForm.locator("[name=status]").selectOption("pending");
  for(const name of ["customerName","customerPhone","customerEmail","customerAddress","customerNotes"]){
    await paymentForm.locator(`[name=${name}]`).fill("");
  }
  await paymentForm.getByRole("button",{name:/Confirmar pago y venta|Guardar venta/}).click();
  await expect.poll(()=>manualSalePosts.length).toBe(1);
  expect(manualSalePosts[0]).toMatchObject({status:"pending",payments:[]});
  expect(manualSalePosts[0].items.length).toBeGreaterThan(0);
  expect(Object.values(manualSalePosts[0].customer).every(value=>value==="")).toBe(true);

  const anonymousRow=page.locator(`[data-sale-id="${anonymousSale.id}"]`);
  await anonymousRow.locator("[data-add-sale-payment]").click();
  await expect(paymentForm.locator("[name=expectedVersion]")).toHaveValue("2");
  paymentLines=paymentForm.locator(".payment-line");
  await paymentLines.first().locator("[name=paidAmount]").fill("5");
  await paymentLines.first().locator("[name=paidCurrency]").selectOption("USD");
  await paymentLines.first().locator("[name=paymentNotes]").fill("Primer cobro del pendiente");
  await paymentForm.getByRole("button",{name:"Registrar abono"}).click();
  await expect(page.locator("#adminToast")).toContainText("confirma nombre y teléfono válido");
  expect(paymentPosts).toHaveLength(1);
  await paymentForm.locator("[name=customerName]").fill("Cliente Identificado");
  await paymentForm.getByRole("button",{name:"Registrar abono"}).click();
  await expect(page.locator("#adminToast")).toContainText("confirma nombre y teléfono válido");
  expect(paymentPosts).toHaveLength(1);
  await paymentForm.locator("[name=customerPhone]").fill("0412 555 6677");
  await paymentForm.locator("[name=customerEmail]").fill("identificado@example.com");
  await paymentForm.locator("[name=customerAddress]").fill("Dirección confirmada");
  await paymentForm.locator("[name=customerNotes]").fill("Alta desde el primer cobro");
  await paymentForm.getByRole("button",{name:"Registrar abono"}).click();
  await expect.poll(()=>paymentPosts.length).toBe(2);
  expect(paymentPosts[1]).toMatchObject({
    pathname:`/v1/admin/sales/${anonymousSale.id}/payments`,
    body:{
      expectedVersion:2,
      customer:{name:"Cliente Identificado",phone:"0412 555 6677",email:"identificado@example.com",address:"Dirección confirmada",notes:"Alta desde el primer cobro"},
      payments:[{currency:"USD",amountMinor:500,notes:"Primer cobro del pendiente"}]
    }
  });

  await page.getByRole("button",{name:"Pedidos",exact:true}).click();
  const orderRow=page.locator("#ordersList .order-row").first();
  await orderRow.locator('[data-order-action="extend"]').click();
  await expect.poll(()=>orderMutationPosts.length).toBe(1);
  expect(orderMutationPosts[0]).toEqual({pathname:`/v1/admin/orders/${order.id}/extend`,body:{expectedVersion:3}});
  await orderRow.locator('[data-order-action="confirm"]').click();
  await expect(paymentForm.locator("[name=expectedVersion]")).toHaveValue("3");
  await paymentForm.locator("[data-close-dialog]").first().click();

  await page.getByRole("button",{name:"Ventas",exact:true}).click();
  await namedRow.locator("[data-void-sale]").click();
  await expect(voidForm.locator("[name=expectedVersion]")).toHaveValue("4");
  await voidForm.locator("[name=reason]").fill("Venta duplicada detectada");
  await voidForm.locator("[name=confirmImpact]").check();
  await voidForm.getByRole("button",{name:"Anular y conservar historial"}).click();
  await expect.poll(()=>saleVoidPosts.length).toBe(1);
  expect(saleVoidPosts[0]).toMatchObject({pathname:`/v1/admin/sales/${namedSale.id}/void`,body:{reason:"Venta duplicada detectada",expectedVersion:4}});
});

test("Worker+D1 confirma abonos, stock, BCV, FX, idempotencia y auditoría sin fugas", async () => {
  test.setTimeout(120_000);
  await withTemporaryWorker(async ({baseUrl,query,stop}) => {
    let result=await apiJson(baseUrl,"/v1/setup",{
      headers:{Authorization:"Bearer crm-integration-setup"},
      body:{username:"owner-test",password:"password-test-12345",displayName:"Owner test"}
    });
    expect(result.response.status,result.payload?.error).toBe(201);
    result=await apiJson(baseUrl,"/v1/auth/login",{body:{username:"owner-test",password:"password-test-12345"}});
    expect(result.response.status,result.payload?.error).toBe(200);
    const cookie=String(result.response.headers.get("set-cookie")||"").split(";")[0];
    expect(cookie).toMatch(/^fontana_admin_session=/);

    // Clientes y tasas jamás se publican fuera del espacio administrativo.
    expect((await apiJson(baseUrl,"/v1/customers")).response.status).toBe(404);
    expect((await apiJson(baseUrl,"/v1/exchange-rates")).response.status).toBe(404);
    expect((await apiJson(baseUrl,"/v1/admin/customers")).response.status).toBe(401);
    expect((await apiJson(baseUrl,"/v1/admin/exchange-rates?date=2026-08-29")).response.status).toBe(401);

    const addRate=async (currency,rateScaled,valueDate) => {
      const rateResult=await apiJson(baseUrl,"/v1/admin/exchange-rates/manual",{cookie,body:{
        currency,rateScaled,valueDate,
        sourceUrl:"https://www.bcv.org.ve/",
        reason:`Respaldo BCV de integración para ${currency} ${valueDate}`
      }});
      expect(rateResult.response.status,rateResult.payload?.error).toBe(201);
      return rateResult.payload.rate;
    };
    const saleDate="2026-08-29";
    const paymentDate="2026-08-30";
    const usdSaleRate=await addRate("USD",8_000_000_000,saleDate);
    const eurSaleRate=await addRate("EUR",10_000_000_000,saleDate);
    const usdPaymentRate=await addRate("USD",9_000_000_000,paymentDate);
    const eurPaymentRate=await addRate("EUR",10_800_000_000,paymentDate);

    const product={
      id:"crm-cake",category:"cakes",name:"Torta CRM",price:100,
      image:"assets/ballerine-fontana-pro.jpg",description:"Prueba integral",ingredients:"",
      visible:true,status:"available",allowPreorder:false,requiresElectricity:false,sizes:[],variants:[]
    };
    const builders={
      fonkies:{visible:true,status:"available",minimumQuantity:4,singlePrice:15,mixedPrice:17,extraPrice:3.5,flavors:[{name:"Chocolate CRM",inventoryKey:"chocolate-crm",image:"assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",status:"available"}]},
      fomb:{visible:true,status:"available",sizes:[{quantity:4,price:15}],flavors:[{name:"Pistacho CRM",inventoryKey:"pistacho-crm",image:"assets/fomb-pistachio-fontana-pro.jpg",status:"available"}]}
    };
    result=await apiJson(baseUrl,"/v1/admin/catalog",{cookie,method:"PUT",body:{state:{version:2,settings:{stockTodayOpen:true,productionWithElectricity:true},products:[product],builders},expectedRevision:0}});
    expect(result.response.status,result.payload?.error).toBe(200);
    const sku="product:crm-cake:base:base";
    result=await apiJson(baseUrl,`/v1/admin/inventory/${encodeURIComponent(sku)}`,{cookie,method:"PUT",body:{onHand:10,trackStock:true,note:"Stock de integración"}});
    expect(result.response.status,result.payload?.error).toBe(200);

    const builderSalePayload={
      idempotencyKey:"sale-builders-pending-01",soldAt:saleDate,channel:"Presencial",
      customer:{name:"Cliente Builder",phone:"0414 123 4567"},referenceCurrency:"USD",payments:[],status:"pending",
      items:[
        {sku:"builder:fonkies:chocolate-crm",name:"Fonkies",optionSummary:"Caja de 4 · Chocolate CRM",quantity:1,unitPriceRefCents:1_500,inventoryUnits:[{sku:"builder:fonkies:chocolate-crm",quantity:4}],priceOverrideReason:"Precio automático del constructor Fonkies: caja de 4 unidades del sabor Chocolate CRM, REF 15,00 según la configuración vigente."},
        {sku:"builder:fomb:pistacho-crm",name:"Fomb",optionSummary:"Caja de 4 · Pistacho CRM",quantity:1,unitPriceRefCents:1_500,inventoryUnits:[{sku:"builder:fomb:pistacho-crm",quantity:4}],priceOverrideReason:"Precio automático del constructor Fomb: caja de 4 unidades del sabor Pistacho CRM, REF 15,00 según la configuración vigente."}
      ]
    };
    result=await apiJson(baseUrl,"/v1/admin/sales",{cookie,body:builderSalePayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"pending",paymentStatus:"unpaid",balanceCents:3_000,functionalTotalCents:3_000});
    const builderSaleId=result.payload.saleId;

    const structuredItem={
      productId:product.id,sku,quantity:1,unitPriceCents:10_000,
      inventoryUnits:[{sku,quantity:1}],imageUrl:product.image
    };
    const pendingPayload={
      idempotencyKey:"sale-eur-pending-0001",soldAt:saleDate,channel:"Presencial",
      customer:{name:"Ana Recurrente",phone:"0412 123 4567"},
      referenceCurrency:"EUR",items:[structuredItem],payments:[],status:"pending",notes:"Pendiente con snapshot"
    };
    result=await apiJson(baseUrl,"/v1/admin/sales",{cookie,body:pendingPayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"pending",paymentStatus:"unpaid",functionalTotalCents:12_500,customerId:null,balanceCents:10_000});
    const eurSaleId=result.payload.saleId;

    result=await apiJson(baseUrl,"/v1/admin/inventory",{cookie});
    expect(result.payload.items.find(item=>item.sku===sku)).toMatchObject({onHand:10,reserved:0,available:10});
    result=await apiJson(baseUrl,"/v1/admin/customers?limit=250",{cookie});
    expect(result.payload.items).toHaveLength(0);

    const partialEurPayload={
      idempotencyKey:"sale-eur-payment-0001",paymentDate,
      customer:{name:"Ana Recurrente",phone:"412-123-4567"},
      payments:[{currency:"EUR",amountMinor:4_000,amountScale:2,method:"Efectivo",exchangeRateId:eurPaymentRate.id,exchangeRateValueDate:paymentDate}]
    };
    result=await apiJson(baseUrl,`/v1/admin/sales/${eurSaleId}/payments`,{cookie,body:partialEurPayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"confirmed",paymentStatus:"partial",balanceCents:6_000,customerCreditFunctionalCents:0});
    const partialPaymentId=result.payload.paymentIds[0];

    const replay=await apiJson(baseUrl,`/v1/admin/sales/${eurSaleId}/payments`,{cookie,body:partialEurPayload});
    expect(replay.response.status,replay.payload?.error).toBe(200);
    expect(replay.payload).toMatchObject({replayed:true,saleId:eurSaleId,paymentIds:[partialPaymentId]});
    const conflict=await apiJson(baseUrl,`/v1/admin/sales/${eurSaleId}/payments`,{cookie,body:{...partialEurPayload,payments:[{...partialEurPayload.payments[0],amountMinor:4_100}]}});
    expect(conflict.response.status).toBe(409);
    expect(conflict.payload.code).toBe("idempotency_conflict");

    result=await apiJson(baseUrl,"/v1/admin/inventory",{cookie});
    expect(result.payload.items.find(item=>item.sku===sku)).toMatchObject({onHand:9,reserved:0,available:9});
    result=await apiJson(baseUrl,"/v1/admin/customers?limit=250",{cookie});
    expect(result.payload.items).toHaveLength(1);
    expect(result.payload.items[0]).toMatchObject({normalizedPhone:"+584121234567",confirmedSalesCount:1,recurrent:false});

    const finalEurPayload={
      idempotencyKey:"sale-eur-payment-0002",paymentDate,
      payments:[{currency:"EUR",amountMinor:6_000,amountScale:2,method:"Efectivo",exchangeRateId:eurPaymentRate.id,exchangeRateValueDate:paymentDate}]
    };
    result=await apiJson(baseUrl,`/v1/admin/sales/${eurSaleId}/payments`,{cookie,body:finalEurPayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({paymentStatus:"paid",balanceCents:0,overpaymentCents:0,customerCreditFunctionalCents:0});

    // Un pedido se confirma con abono dividido USD+VES: confirma la venta y
    // descuenta exactamente una vez aunque la respuesta se reintente.
    const reservePayload={
      clientKey:"crm-reservation-client-0001",
      items:[{kind:"product",productId:product.id,quantity:1,size:"",variant:"",preorder:false}],
      customer:{name:"Ana Recurrente",phone:"0058 412 123 4567",fulfillment:"Pickup",requestedDate:"2026-08-31",paymentMethod:"Pago dividido",address:"",allergySummary:"",birthdayCandle:"",notes:""}
    };
    result=await apiJson(baseUrl,"/v1/orders/reserve",{body:reservePayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    const orderId=result.payload.id;
    const orderPartialPayload={
      idempotencyKey:"order-partial-payment-0001",soldAt:paymentDate,paymentDate,referenceCurrency:"USD",
      customer:{name:"Ana Recurrente",phone:"+58 412 123 4567"},
      payments:[
        {currency:"USD",amountMinor:2_000,amountScale:2,method:"Efectivo"},
        {currency:"VES",amountMinor:180_000,amountScale:2,method:"Pago Móvil",rateBasis:"USD",exchangeRateId:usdPaymentRate.id,exchangeRateValueDate:paymentDate}
      ]
    };
    result=await apiJson(baseUrl,`/v1/admin/orders/${orderId}/confirm-payment`,{cookie,body:orderPartialPayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"confirmed",paymentStatus:"partial",balanceCents:6_000,customerCreditFunctionalCents:0});
    const orderSaleId=result.payload.saleId;
    const orderReplay=await apiJson(baseUrl,`/v1/admin/orders/${orderId}/confirm-payment`,{cookie,body:orderPartialPayload});
    expect(orderReplay.response.status,orderReplay.payload?.error).toBe(200);
    expect(orderReplay.payload).toMatchObject({replayed:true,saleId:orderSaleId});

    result=await apiJson(baseUrl,"/v1/admin/inventory",{cookie});
    expect(result.payload.items.find(item=>item.sku===sku)).toMatchObject({onHand:8,reserved:0,available:8});
    const orderOverpaymentPayload={
      idempotencyKey:"order-final-payment-0001",paymentDate,
      payments:[{currency:"USD",amountMinor:6_100,amountScale:2,method:"Efectivo"}]
    };
    result=await apiJson(baseUrl,`/v1/admin/orders/${orderId}/payments`,{cookie,body:orderOverpaymentPayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({paymentStatus:"paid",balanceCents:0,overpaymentCents:100,customerCreditFunctionalCents:100});

    result=await apiJson(baseUrl,"/v1/admin/customers?limit=250",{cookie});
    expect(result.payload.items).toHaveLength(1);
    expect(result.payload.items[0]).toMatchObject({normalizedPhone:"+584121234567",confirmedSalesCount:2,recurrent:true});

    // Moneda no soportada y conversiones que redondean a cero no escriben pagos.
    result=await apiJson(baseUrl,`/v1/admin/sales/${eurSaleId}/payments`,{cookie,body:{idempotencyKey:"reject-usdt-payment-0001",paymentDate,payments:[{currency:"USDT",amountMinor:100,amountScale:2,method:"Otro"}]}});
    expect(result.response.status).toBe(422);
    result=await apiJson(baseUrl,`/v1/admin/sales/${eurSaleId}/payments`,{cookie,body:{idempotencyKey:"reject-zero-rounding-01",paymentDate,payments:[{currency:"VES",amountMinor:1,amountScale:2,method:"Pago Móvil",rateBasis:"EUR",exchangeRateId:eurPaymentRate.id,exchangeRateValueDate:paymentDate}]}});
    expect(result.response.status).toBe(422);

    const expensePayload={
      idempotencyKey:"expense-ves-payment-0001",expenseDate:paymentDate,category:"Ingredientes e insumos",
      description:"Compra de integración",currency:"VES",amountMinor:900_000,amountScale:2,
      method:"Pago Móvil",referenceCurrency:"USD",rateBasis:"USD",exchangeRateId:usdPaymentRate.id,
      exchangeRateValueDate:paymentDate,reference:"EXP-CRM"
    };
    result=await apiJson(baseUrl,"/v1/admin/expenses",{cookie,body:expensePayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"posted",referenceAmountCents:10_000,functionalAmountCents:10_000,replayed:false});
    const expenseId=result.payload.expenseId;
    const expenseReplay=await apiJson(baseUrl,"/v1/admin/expenses",{cookie,body:expensePayload});
    expect(expenseReplay.response.status,expenseReplay.payload?.error).toBe(200);
    expect(expenseReplay.payload).toMatchObject({expenseId,replayed:true});
    result=await apiJson(baseUrl,`/v1/admin/expenses/${expenseId}`,{cookie,method:"DELETE"});
    expect(result.response.status).toBe(404);
    result=await apiJson(baseUrl,`/v1/admin/expenses/${expenseId}/void`,{cookie,body:{reason:"Pago revertido por proveedor"}});
    expect(result.response.status,result.payload?.error).toBe(200);
    expect(result.payload).toMatchObject({status:"voided",refundRecorded:false,reclassifiedAsRecoverableFunctionalCents:10_000});

    // La compatibilidad heredada conserva un pendiente incompleto; se anula,
    // nunca se borra físicamente.
    result=await apiJson(baseUrl,"/v1/admin/sales",{cookie,body:{soldAt:paymentDate,total:1,status:"pending",channel:"Otro",customerName:"Pendiente heredado",items:"Detalle heredado",notes:"Compatibilidad"}});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"pending",paymentStatus:"legacy",legacyIncomplete:true});
    const legacySaleId=result.payload.id;
    result=await apiJson(baseUrl,`/v1/admin/sales/${legacySaleId}`,{cookie,method:"DELETE"});
    expect(result.response.status).toBe(405);
    expect(result.payload.code).toBe("use_void");
    result=await apiJson(baseUrl,`/v1/admin/sales/${legacySaleId}/void`,{cookie,body:{reason:"Registro heredado duplicado"}});
    expect(result.response.status,result.payload?.error).toBe(200);
    result=await apiJson(baseUrl,"/v1/admin/sales",{cookie});
    expect(result.payload.items.find(sale=>sale.id===legacySaleId)).toMatchObject({status:"cancelled",paymentStatus:"voided"});

    const publicCatalog=await apiJson(baseUrl,"/v1/catalog");
    expect(publicCatalog.response.status).toBe(200);
    const publicText=JSON.stringify(publicCatalog.payload);
    expect(publicText).not.toMatch(/normalizedPhone|customerPhone|exchangeRate|rateScaled|onHand|\"reserved\"/);

    const accounting=await apiJson(baseUrl,`/v1/admin/accounting/summary?from=${saleDate}&to=${paymentDate}`,{cookie});
    expect(accounting.response.status,accounting.payload?.error).toBe(200);
    expect(accounting.payload).toMatchObject({functionalCurrency:"USD",journalBalanced:true,unbalancedJournalCount:0});
    const accounts=new Map(accounting.payload.accounts.map(account=>[account.id,account]));
    expect(accounts.get("asset-receivable-usd").balanceFunctionalCents).toBe(0);
    expect(accounts.get("expense-fx-loss-usd").balanceFunctionalCents).toBe(500);
    expect(accounts.get("liability-customer-credit-usd").balanceFunctionalCents).toBe(-100);

    await stop();

    expect(query(`SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='${sku}'`)).toEqual([{onHand:8,reserved:0}]);
    expect(query(`SELECT COUNT(*) AS total FROM inventory_movements WHERE sku='${sku}' AND movement_type='sale'`)).toEqual([{total:2}]);
    expect(query("SELECT COUNT(*) AS total FROM customers")).toEqual([{total:1}]);
    expect(query("SELECT COUNT(*) AS total FROM sales WHERE status='confirmed'")).toEqual([{total:2}]);
    expect(query(`SELECT status,payment_status AS paymentStatus FROM sales WHERE id='${legacySaleId}'`)).toEqual([{status:"cancelled",paymentStatus:"voided"}]);
    expect(query("SELECT COUNT(*) AS total FROM idempotency_keys")).toEqual([{total:7}]);
    expect(query("SELECT COUNT(*) AS total FROM payments")).toEqual([{total:5}]);
    expect(query(`SELECT status,amount_minor AS amountMinor,reference_amount_cents AS referenceAmountCents,functional_amount_cents AS functionalAmountCents,exchange_rate_value_date AS rateValueDate FROM expenses WHERE id='${expenseId}'`)).toEqual([{status:"voided",amountMinor:900_000,referenceAmountCents:10_000,functionalAmountCents:10_000,rateValueDate:paymentDate}]);
    expect(query("SELECT paid_currency AS currency,amount_minor AS amountMinor,reference_amount_cents AS referenceAmountCents,functional_amount_cents AS functionalAmountCents,payment_date AS paymentDate,exchange_rate_value_date AS rateValueDate FROM payments ORDER BY paid_currency,amount_minor")).toEqual([
      {currency:"EUR",amountMinor:4_000,referenceAmountCents:4_000,functionalAmountCents:4_800,paymentDate,rateValueDate:paymentDate},
      {currency:"EUR",amountMinor:6_000,referenceAmountCents:6_000,functionalAmountCents:7_200,paymentDate,rateValueDate:paymentDate},
      {currency:"USD",amountMinor:2_000,referenceAmountCents:2_000,functionalAmountCents:2_000,paymentDate,rateValueDate:null},
      {currency:"USD",amountMinor:6_100,referenceAmountCents:6_100,functionalAmountCents:6_100,paymentDate,rateValueDate:null},
      {currency:"VES",amountMinor:180_000,referenceAmountCents:2_000,functionalAmountCents:2_000,paymentDate,rateValueDate:paymentDate}
    ]);
    expect(query(`SELECT total_cents AS totalCents,functional_total_cents AS functionalTotalCents,reference_currency AS referenceCurrency,reference_exchange_rate_scaled AS referenceRateScaled,reference_exchange_rate_value_date AS referenceValueDate,functional_exchange_rate_scaled AS functionalRateScaled,functional_exchange_rate_value_date AS functionalValueDate FROM sales WHERE id='${eurSaleId}'`)).toEqual([{
      totalCents:10_000,functionalTotalCents:12_500,referenceCurrency:"EUR",referenceRateScaled:eurSaleRate.rateScaled,referenceValueDate:saleDate,functionalRateScaled:usdSaleRate.rateScaled,functionalValueDate:saleDate
    }]);
    expect(query("SELECT account_id AS accountId,SUM(debit_functional_cents) AS debit,SUM(credit_functional_cents) AS credit FROM journal_lines WHERE account_id IN ('asset-receivable-usd','liability-customer-credit-usd','expense-fx-loss-usd','income-fx-gain-usd') GROUP BY account_id ORDER BY account_id")).toEqual([
      {accountId:"asset-receivable-usd",debit:22_500,credit:22_500},
      {accountId:"expense-fx-loss-usd",debit:500,credit:0},
      {accountId:"liability-customer-credit-usd",debit:0,credit:100}
    ]);
    expect(query("SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id GROUP BY je.id HAVING SUM(jl.debit_functional_cents)<>SUM(jl.credit_functional_cents)")).toEqual([]);
    expect(query("SELECT currency FROM sales WHERE currency IN ('REF','USDT') UNION ALL SELECT paid_currency FROM payments WHERE paid_currency IN ('REF','USDT') UNION ALL SELECT currency FROM expenses WHERE currency IN ('REF','USDT') UNION ALL SELECT currency FROM exchange_rates WHERE currency IN ('REF','USDT')")).toEqual([]);
    expect(query(`SELECT COUNT(*) AS total FROM sale_items WHERE image_url_snapshot='${product.image}'`)).toEqual([{total:2}]);
    expect(query(`SELECT siu.sku,siu.quantity FROM sale_item_inventory_units siu JOIN sale_items si ON si.id=siu.sale_item_id WHERE si.sale_id='${builderSaleId}' ORDER BY siu.sku`)).toEqual([
      {sku:"builder:fomb:pistacho-crm",quantity:4},
      {sku:"builder:fonkies:chocolate-crm",quantity:4}
    ]);
    expect(query(`SELECT COUNT(*) AS total FROM audit_log WHERE action='sale_create' AND entity_id='${builderSaleId}' AND details_json LIKE '%Precio automático del constructor%'`)).toEqual([{total:1}]);
    expect(query("SELECT COUNT(*) AS total FROM audit_log WHERE action='exchange_rate_manual' AND details_json LIKE '%Respaldo BCV de integración%'")).toEqual([{total:4}]);
  });
});

test("Worker+D1 permite pendiente anónimo y exige identidad completa al primer cobro", async () => {
  test.setTimeout(120_000);
  await withTemporaryWorker(async ({baseUrl,query,stop}) => {
    let result=await apiJson(baseUrl,"/v1/setup",{
      headers:{Authorization:"Bearer crm-integration-setup"},
      body:{username:"owner-pending",password:"password-pending-12345",displayName:"Owner pending"}
    });
    expect(result.response.status,result.payload?.error).toBe(201);
    result=await apiJson(baseUrl,"/v1/auth/login",{body:{username:"owner-pending",password:"password-pending-12345"}});
    expect(result.response.status,result.payload?.error).toBe(200);
    const cookie=String(result.response.headers.get("set-cookie")||"").split(";")[0];
    const soldAt="2026-08-30";
    const product={
      id:"pending-anonymous",category:"cakes",name:"Torta pendiente anónima",price:25,
      image:"assets/ballerine-fontana-pro.jpg",description:"Prueba de identidad diferida",ingredients:"",
      visible:true,status:"available",allowPreorder:false,requiresElectricity:false,sizes:[],variants:[]
    };
    result=await apiJson(baseUrl,"/v1/admin/catalog",{cookie,method:"PUT",body:{
      state:{version:2,settings:{stockTodayOpen:true,productionWithElectricity:true},products:[product],builders:{}},
      expectedRevision:0
    }});
    expect(result.response.status,result.payload?.error).toBe(200);
    const sku="product:pending-anonymous:base:base";
    result=await apiJson(baseUrl,`/v1/admin/inventory/${encodeURIComponent(sku)}`,{
      cookie,method:"PUT",body:{onHand:3,trackStock:true,note:"Stock para pendiente anónimo"}
    });
    expect(result.response.status,result.payload?.error).toBe(200);

    const item={
      productId:product.id,sku,quantity:1,unitPriceCents:2_500,
      inventoryUnits:[{sku,quantity:1}],imageUrl:product.image
    };
    const saleBase={soldAt,channel:"Presencial",referenceCurrency:"USD",items:[item],payments:[],status:"pending"};

    result=await apiJson(baseUrl,"/v1/admin/sales",{cookie,body:{
      ...saleBase,idempotencyKey:"pending-anonymous-create-01"
    }});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({status:"pending",paymentStatus:"unpaid",customerId:null,balanceCents:2_500});
    const saleId=result.payload.saleId;

    for (const [idempotencyKey,customer] of [
      ["pending-name-only-01",{name:"Solo nombre"}],
      ["pending-phone-only-01",{phone:"0412 555 0101"}]
    ]) {
      const rejected=await apiJson(baseUrl,"/v1/admin/sales",{cookie,body:{...saleBase,idempotencyKey,customer}});
      expect(rejected.response.status,JSON.stringify(rejected.payload)).toBe(400);
    }

    result=await apiJson(baseUrl,"/v1/admin/inventory",{cookie});
    expect(result.payload.items.find(entry=>entry.sku===sku)).toMatchObject({onHand:3,reserved:0,available:3});
    result=await apiJson(baseUrl,"/v1/admin/customers?limit=250",{cookie});
    expect(result.payload.items).toHaveLength(0);
    expect(query("SELECT COUNT(*) AS total FROM sales")).toEqual([{total:1}]);
    expect(query(`SELECT customer_id AS customerId,customer_name AS customerName,customer_phone AS customerPhone,status,payment_status AS paymentStatus FROM sales WHERE id='${saleId}'`)).toEqual([{
      customerId:null,customerName:"",customerPhone:"",status:"pending",paymentStatus:"unpaid"
    }]);

    const salesList=await apiJson(baseUrl,"/v1/admin/sales",{cookie});
    expect(salesList.response.status,salesList.payload?.error).toBe(200);
    const mutationVersion=salesList.payload.items.find(sale=>sale.id===saleId)?.mutationVersion;
    expect(mutationVersion).toBe(0);

    const paymentBase={
      paymentDate:soldAt,expectedVersion:mutationVersion,
      payments:[{currency:"USD",amountMinor:1_000,amountScale:2,method:"Efectivo"}]
    };
    for (const [idempotencyKey,customer] of [
      ["pending-payment-no-customer-01",undefined],
      ["pending-payment-name-only-01",{name:"Cliente pendiente"}],
      ["pending-payment-phone-only-01",{phone:"0412 555 0101"}]
    ]) {
      const rejected=await apiJson(baseUrl,`/v1/admin/sales/${saleId}/payments`,{cookie,body:{
        ...paymentBase,idempotencyKey,...(customer?{customer}:{})
      }});
      expect(rejected.response.status,JSON.stringify(rejected.payload)).toBe(400);
    }

    const firstPayment={
      ...paymentBase,
      idempotencyKey:"pending-first-payment-valid-01",
      customer:{
        name:"Cliente Pendiente",phone:"0412 555 0101",email:"cliente@example.com",
        address:"Dirección de prueba",notes:"Cliente creado en el primer cobro"
      }
    };
    result=await apiJson(baseUrl,`/v1/admin/sales/${saleId}/payments`,{cookie,body:firstPayment});
    expect(result.response.status,result.payload?.error).toBe(201);
    expect(result.payload).toMatchObject({saleId,status:"confirmed",paymentStatus:"partial",balanceCents:1_500});
    expect(result.payload.customerId).toBeTruthy();
    const customerId=result.payload.customerId;

    const replay=await apiJson(baseUrl,`/v1/admin/sales/${saleId}/payments`,{cookie,body:firstPayment});
    expect(replay.response.status,replay.payload?.error).toBe(200);
    expect(replay.payload).toMatchObject({saleId,replayed:true});

    result=await apiJson(baseUrl,"/v1/admin/inventory",{cookie});
    expect(result.payload.items.find(entry=>entry.sku===sku)).toMatchObject({onHand:2,reserved:0,available:2});
    result=await apiJson(baseUrl,"/v1/admin/customers?limit=250",{cookie});
    expect(result.payload.items).toHaveLength(1);
    expect(result.payload.items[0]).toMatchObject({
      id:customerId,normalizedPhone:"+584125550101",confirmedSalesCount:1,recurrent:false,
      email:"cliente@example.com",defaultAddress:"Dirección de prueba"
    });
    const customerDetail=await apiJson(baseUrl,`/v1/admin/customers/${customerId}`,{cookie});
    expect(customerDetail.response.status,customerDetail.payload?.error).toBe(200);
    expect(customerDetail.payload.customer).toMatchObject({
      id:customerId,email:"cliente@example.com",defaultAddress:"Dirección de prueba",
      internalNotes:"Cliente creado en el primer cobro"
    });
    expect(customerDetail.payload.sales).toHaveLength(1);
    expect(customerDetail.payload.sales[0].payments).toHaveLength(1);
    expect(customerDetail.payload.sales[0].payments[0]).toMatchObject({
      currency:"USD",amountMinor:1_000,referenceAmountCents:1_000,paymentDate:soldAt
    });

    await stop();

    expect(query(`SELECT customer_id AS customerId,customer_name AS customerName,customer_phone AS customerPhone,status,payment_status AS paymentStatus FROM sales WHERE id='${saleId}'`)).toEqual([{
      customerId,customerName:"Cliente Pendiente",customerPhone:"0412 555 0101",status:"confirmed",paymentStatus:"partial"
    }]);
    expect(query(`SELECT COUNT(*) AS total FROM inventory_movements WHERE sale_id='${saleId}' AND movement_type='sale'`)).toEqual([{total:1}]);
    expect(query(`SELECT COUNT(*) AS total FROM payments WHERE sale_id='${saleId}' AND status='confirmed'`)).toEqual([{total:1}]);
    expect(query("SELECT COUNT(*) AS total FROM customers")).toEqual([{total:1}]);
    expect(query(`SELECT COUNT(*) AS total FROM audit_log WHERE entity_id='${saleId}' AND action='sale_payment'`)).toEqual([{total:1}]);
    expect(query(`SELECT COUNT(*) AS total,MAX(version) AS version FROM entity_mutation_claims WHERE entity_type='sale' AND entity_id='${saleId}'`)).toEqual([{total:1,version:1}]);
    expect(query("SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id GROUP BY je.id HAVING SUM(jl.debit_functional_cents)<>SUM(jl.credit_functional_cents)")).toEqual([]);
  });
});

test("Worker+D1 serializa abonos, anulaciones y decisiones concurrentes sin duplicar efectos", async () => {
  test.setTimeout(120_000);
  await withTemporaryWorker(async ({baseUrl,query,stop}) => {
    let result=await apiJson(baseUrl,"/v1/setup",{
      headers:{Authorization:"Bearer crm-integration-setup"},
      body:{username:"owner-races",password:"password-races-12345",displayName:"Owner races"}
    });
    expect(result.response.status,result.payload?.error).toBe(201);
    result=await apiJson(baseUrl,"/v1/auth/login",{body:{username:"owner-races",password:"password-races-12345"}});
    expect(result.response.status,result.payload?.error).toBe(200);
    const cookie=String(result.response.headers.get("set-cookie")||"").split(";")[0];
    const soldAt="2026-08-30";
    const image="assets/ballerine-fontana-pro.jpg";
    const scenarios=[
      "race-two-payments",
      "race-payment-void",
      "race-double-void",
      "race-confirm-cancel",
      "race-confirm-extend"
    ];
    const products=scenarios.map((id,index)=>({
      id,category:"cakes",name:`Torta carrera ${index+1}`,price:100,image,
      description:"Prueba de serialización",ingredients:"",visible:true,status:"available",
      allowPreorder:false,requiresElectricity:false,sizes:[],variants:[]
    }));
    result=await apiJson(baseUrl,"/v1/admin/catalog",{cookie,method:"PUT",body:{
      state:{version:2,settings:{stockTodayOpen:true,productionWithElectricity:true},products,builders:{}},
      expectedRevision:0
    }});
    expect(result.response.status,result.payload?.error).toBe(200);
    for (const product of products) {
      const sku=`product:${product.id}:base:base`;
      result=await apiJson(baseUrl,`/v1/admin/inventory/${encodeURIComponent(sku)}`,{
        cookie,method:"PUT",body:{onHand:5,trackStock:true,note:`Stock aislado ${product.id}`}
      });
      expect(result.response.status,result.payload?.error).toBe(200);
    }

    const structuredItem=productId=>({
      productId,
      sku:`product:${productId}:base:base`,
      quantity:1,
      unitPriceCents:10_000,
      inventoryUnits:[{sku:`product:${productId}:base:base`,quantity:1}],
      imageUrl:image
    });
    const createPartialSale=async ({productId,key,phone}) => {
      const created=await apiJson(baseUrl,"/v1/admin/sales",{cookie,body:{
        idempotencyKey:key,soldAt,channel:"Presencial",
        customer:{name:`Cliente ${productId}`,phone},referenceCurrency:"USD",
        items:[structuredItem(productId)],
        payments:[{currency:"USD",amountMinor:4_000,amountScale:2,method:"Efectivo",paymentDate:soldAt}],
        notes:"Venta parcial para carrera"
      }});
      expect(created.response.status,created.payload?.error).toBe(201);
      expect(created.payload).toMatchObject({status:"confirmed",paymentStatus:"partial",balanceCents:6_000});
      const listed=await apiJson(baseUrl,"/v1/admin/sales",{cookie});
      expect(listed.response.status,listed.payload?.error).toBe(200);
      const saved=listed.payload.items.find(sale=>sale.id===created.payload.saleId);
      expect(saved).toBeTruthy();
      expect(Number.isInteger(saved.mutationVersion)).toBe(true);
      return {saleId:created.payload.saleId,mutationVersion:saved.mutationVersion};
    };
    const racePayment=({saleId,key,expectedVersion})=>apiJson(baseUrl,`/v1/admin/sales/${saleId}/payments`,{cookie,body:{
      idempotencyKey:key,paymentDate:soldAt,expectedVersion,
      payments:[{currency:"USD",amountMinor:7_000,amountScale:2,method:"Efectivo"}]
    }});

    const twoPaymentSale=await createPartialSale({
      productId:"race-two-payments",key:"race-create-two-payments-01",phone:"0412 100 0001"
    });
    const twoPaymentSaleId=twoPaymentSale.saleId;
    const twoPaymentRace=await Promise.all([
      racePayment({saleId:twoPaymentSaleId,key:"race-second-payment-key-a",expectedVersion:twoPaymentSale.mutationVersion}),
      racePayment({saleId:twoPaymentSaleId,key:"race-second-payment-key-b",expectedVersion:twoPaymentSale.mutationVersion})
    ]);
    const twoPaymentOutcome=expectOneConcurrentWinner(twoPaymentRace,[201]);
    expect(twoPaymentOutcome.winner.payload).toMatchObject({
      saleId:twoPaymentSaleId,paymentStatus:"paid",balanceCents:0,
      overpaymentCents:1_000,customerCreditFunctionalCents:1_000
    });

    const paymentVoidSale=await createPartialSale({
      productId:"race-payment-void",key:"race-create-payment-void-01",phone:"0412 100 0002"
    });
    const paymentVoidSaleId=paymentVoidSale.saleId;
    const paymentVoidRace=await Promise.all([
      racePayment({saleId:paymentVoidSaleId,key:"race-payment-versus-void-01",expectedVersion:paymentVoidSale.mutationVersion}),
      apiJson(baseUrl,`/v1/admin/sales/${paymentVoidSaleId}/void`,{cookie,body:{
        reason:"Anulación concurrente contra un abono",restoreStock:true,expectedVersion:paymentVoidSale.mutationVersion
      }})
    ]);
    const paymentVoidOutcome=expectOneConcurrentWinner(paymentVoidRace,[200,201]);
    const paymentWon=paymentVoidOutcome.winnerIndex===0;
    if (paymentWon) {
      expect(paymentVoidOutcome.winner.payload).toMatchObject({
        paymentStatus:"paid",overpaymentCents:1_000,customerCreditFunctionalCents:1_000
      });
    } else {
      expect(paymentVoidOutcome.winner.payload).toMatchObject({
        status:"cancelled",restoredStock:true,customerCreditFunctionalCents:4_000
      });
    }

    const doubleVoidSale=await createPartialSale({
      productId:"race-double-void",key:"race-create-double-void-01",phone:"0412 100 0003"
    });
    const doubleVoidSaleId=doubleVoidSale.saleId;
    const doubleVoidRace=await Promise.all([
      apiJson(baseUrl,`/v1/admin/sales/${doubleVoidSaleId}/void`,{cookie,body:{reason:"Primera anulación simultánea válida",restoreStock:true,expectedVersion:doubleVoidSale.mutationVersion}}),
      apiJson(baseUrl,`/v1/admin/sales/${doubleVoidSaleId}/void`,{cookie,body:{reason:"Segunda anulación simultánea válida",restoreStock:true,expectedVersion:doubleVoidSale.mutationVersion}})
    ]);
    const doubleVoidOutcome=expectOneConcurrentWinner(doubleVoidRace,[200]);
    expect(doubleVoidOutcome.winner.payload).toMatchObject({
      status:"cancelled",restoredStock:true,customerCreditFunctionalCents:4_000
    });

    const expensePayload={
      idempotencyKey:"race-expense-create-0001",expenseDate:soldAt,category:"Ingredientes e insumos",
      description:"Gasto para doble anulación",currency:"USD",amountMinor:2_500,amountScale:2,
      method:"Efectivo",referenceCurrency:"USD",reference:"EXP-RACE"
    };
    result=await apiJson(baseUrl,"/v1/admin/expenses",{cookie,body:expensePayload});
    expect(result.response.status,result.payload?.error).toBe(201);
    const expenseId=result.payload.expenseId;
    const expenseList=await apiJson(baseUrl,"/v1/admin/expenses",{cookie});
    expect(expenseList.response.status,expenseList.payload?.error).toBe(200);
    const expenseVersion=expenseList.payload.items.find(expense=>expense.id===expenseId)?.mutationVersion;
    expect(Number.isInteger(expenseVersion)).toBe(true);
    const doubleExpenseVoidRace=await Promise.all([
      apiJson(baseUrl,`/v1/admin/expenses/${expenseId}/void`,{cookie,body:{reason:"Primera anulación de gasto simultánea",expectedVersion:expenseVersion}}),
      apiJson(baseUrl,`/v1/admin/expenses/${expenseId}/void`,{cookie,body:{reason:"Segunda anulación de gasto simultánea",expectedVersion:expenseVersion}})
    ]);
    const doubleExpenseOutcome=expectOneConcurrentWinner(doubleExpenseVoidRace,[200]);
    expect(doubleExpenseOutcome.winner.payload).toMatchObject({
      status:"voided",refundRecorded:false,reclassifiedAsRecoverableFunctionalCents:2_500
    });

    const reserveOrder=async ({productId,clientKey,phone}) => {
      const reserved=await apiJson(baseUrl,"/v1/orders/reserve",{body:{
        clientKey,items:[{kind:"product",productId,quantity:1,size:"",variant:"",preorder:false}],
        customer:{name:`Pedido ${productId}`,phone,fulfillment:"Pickup",requestedDate:"2026-08-31",paymentMethod:"Efectivo",address:"",allergySummary:"",birthdayCandle:"",notes:""}
      }});
      expect(reserved.response.status,reserved.payload?.error).toBe(201);
      return reserved.payload;
    };
    const orderVersion=async orderId=>{
      const listed=await apiJson(baseUrl,"/v1/admin/orders",{cookie});
      expect(listed.response.status,listed.payload?.error).toBe(200);
      const order=listed.payload.items.find(item=>item.id===orderId);
      expect(order).toBeTruthy();
      expect(Number.isInteger(order.mutationVersion)).toBe(true);
      return order.mutationVersion;
    };
    const confirmOrder=({orderId,key,phone,expectedVersion})=>apiJson(baseUrl,`/v1/admin/orders/${orderId}/confirm-payment`,{cookie,body:{
      idempotencyKey:key,soldAt,paymentDate:soldAt,referenceCurrency:"USD",expectedVersion,
      customer:{name:"Cliente pedido carrera",phone},
      payments:[{currency:"USD",amountMinor:10_000,amountScale:2,method:"Efectivo"}]
    }});

    const cancelOrder=await reserveOrder({
      productId:"race-confirm-cancel",clientKey:"race-confirm-cancel-client-01",phone:"0412 100 0004"
    });
    const cancelOrderVersion=await orderVersion(cancelOrder.id);
    const confirmCancelRace=await Promise.all([
      confirmOrder({orderId:cancelOrder.id,key:"race-confirm-cancel-payment-01",phone:"0412 100 0004",expectedVersion:cancelOrderVersion}),
      apiJson(baseUrl,`/v1/admin/orders/${cancelOrder.id}/cancel`,{cookie,body:{expectedVersion:cancelOrderVersion}})
    ]);
    const confirmCancelOutcome=expectOneConcurrentWinner(confirmCancelRace,[200,201]);
    const confirmBeatCancel=confirmCancelOutcome.winnerIndex===0;
    expect(confirmCancelOutcome.winner.payload.status).toBe(confirmBeatCancel?"confirmed":"cancelled");

    const extendOrder=await reserveOrder({
      productId:"race-confirm-extend",clientKey:"race-confirm-extend-client-01",phone:"0412 100 0005"
    });
    const extendOrderVersion=await orderVersion(extendOrder.id);
    const confirmExtendRace=await Promise.all([
      confirmOrder({orderId:extendOrder.id,key:"race-confirm-extend-payment-01",phone:"0412 100 0005",expectedVersion:extendOrderVersion}),
      apiJson(baseUrl,`/v1/admin/orders/${extendOrder.id}/extend`,{cookie,body:{expectedVersion:extendOrderVersion}})
    ]);
    const confirmExtendOutcome=expectOneConcurrentWinner(confirmExtendRace,[200,201]);
    const confirmBeatExtend=confirmExtendOutcome.winnerIndex===0;
    expect(confirmExtendOutcome.winner.payload.status).toBe(confirmBeatExtend?"confirmed":"reserved");

    await stop();

    const count=sql=>Number(query(sql)[0]?.total||0);
    const saleState=saleId=>query(`SELECT status,payment_status AS paymentStatus FROM sales WHERE id='${saleId}'`)[0];
    const paymentCount=saleId=>count(`SELECT COUNT(*) AS total FROM payments WHERE sale_id='${saleId}' AND status='confirmed'`);
    const paymentSum=saleId=>Number(query(`SELECT COALESCE(SUM(reference_amount_cents),0) AS total FROM payments WHERE sale_id='${saleId}' AND status='confirmed'`)[0]?.total||0);
    const movementCount=(saleId,type)=>count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE sale_id='${saleId}' AND movement_type='${type}'`);
    const auditCount=(action,entityId)=>count(`SELECT COUNT(*) AS total FROM audit_log WHERE action='${action}' AND entity_id='${entityId}'`);
    const journalCount=(sourceType,sourceId)=>count(`SELECT COUNT(*) AS total FROM journal_entries WHERE source_type='${sourceType}' AND source_id='${sourceId}'`);
    const customerCreditForSale=saleId=>Number(query(`SELECT COALESCE(SUM(jl.credit_functional_cents-jl.debit_functional_cents),0) AS total
      FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
      WHERE jl.account_id='liability-customer-credit-usd' AND (
        (je.source_type='adjustment' AND je.source_id='${saleId}') OR
        (je.source_type='payment' AND je.source_id IN (SELECT id FROM payments WHERE sale_id='${saleId}'))
      )`)[0]?.total||0);

    expect(saleState(twoPaymentSaleId)).toEqual({status:"confirmed",paymentStatus:"paid"});
    expect(paymentCount(twoPaymentSaleId)).toBe(2);
    expect(paymentSum(twoPaymentSaleId)).toBe(11_000);
    expect(movementCount(twoPaymentSaleId,"sale")).toBe(1);
    expect(movementCount(twoPaymentSaleId,"adjustment")).toBe(0);
    expect(query("SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='product:race-two-payments:base:base'")).toEqual([{onHand:4,reserved:0}]);
    expect(auditCount("sale_payment",twoPaymentSaleId)).toBe(1);
    expect(customerCreditForSale(twoPaymentSaleId)).toBe(1_000);
    expect(query(`SELECT SUM(debit_functional_cents) AS debit,SUM(credit_functional_cents) AS credit FROM journal_lines
      WHERE account_id='asset-receivable-usd' AND journal_entry_id IN (
        SELECT id FROM journal_entries WHERE (source_type='sale' AND source_id='${twoPaymentSaleId}')
          OR (source_type='payment' AND source_id IN (SELECT id FROM payments WHERE sale_id='${twoPaymentSaleId}'))
      )`)).toEqual([{debit:10_000,credit:10_000}]);

    if (paymentWon) {
      expect(saleState(paymentVoidSaleId)).toEqual({status:"confirmed",paymentStatus:"paid"});
      expect(paymentCount(paymentVoidSaleId)).toBe(2);
      expect(paymentSum(paymentVoidSaleId)).toBe(11_000);
      expect(movementCount(paymentVoidSaleId,"sale")).toBe(1);
      expect(movementCount(paymentVoidSaleId,"adjustment")).toBe(0);
      expect(query("SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='product:race-payment-void:base:base'")).toEqual([{onHand:4,reserved:0}]);
      expect(auditCount("sale_payment",paymentVoidSaleId)).toBe(1);
      expect(auditCount("sale_void",paymentVoidSaleId)).toBe(0);
      expect(journalCount("reversal",paymentVoidSaleId)).toBe(0);
      expect(customerCreditForSale(paymentVoidSaleId)).toBe(1_000);
    } else {
      expect(saleState(paymentVoidSaleId)).toEqual({status:"cancelled",paymentStatus:"voided"});
      expect(paymentCount(paymentVoidSaleId)).toBe(1);
      expect(paymentSum(paymentVoidSaleId)).toBe(4_000);
      expect(movementCount(paymentVoidSaleId,"sale")).toBe(1);
      expect(movementCount(paymentVoidSaleId,"adjustment")).toBe(1);
      expect(query("SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='product:race-payment-void:base:base'")).toEqual([{onHand:5,reserved:0}]);
      expect(auditCount("sale_payment",paymentVoidSaleId)).toBe(0);
      expect(auditCount("sale_void",paymentVoidSaleId)).toBe(1);
      expect(journalCount("reversal",paymentVoidSaleId)).toBe(1);
      expect(journalCount("adjustment",paymentVoidSaleId)).toBe(1);
      expect(customerCreditForSale(paymentVoidSaleId)).toBe(4_000);
    }

    expect(saleState(doubleVoidSaleId)).toEqual({status:"cancelled",paymentStatus:"voided"});
    expect(paymentCount(doubleVoidSaleId)).toBe(1);
    expect(movementCount(doubleVoidSaleId,"sale")).toBe(1);
    expect(movementCount(doubleVoidSaleId,"adjustment")).toBe(1);
    expect(auditCount("sale_void",doubleVoidSaleId)).toBe(1);
    expect(journalCount("reversal",doubleVoidSaleId)).toBe(1);
    expect(journalCount("adjustment",doubleVoidSaleId)).toBe(1);
    expect(customerCreditForSale(doubleVoidSaleId)).toBe(4_000);
    expect(query(`SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='product:race-double-void:base:base'`)).toEqual([{onHand:5,reserved:0}]);

    expect(query(`SELECT status FROM expenses WHERE id='${expenseId}'`)).toEqual([{status:"voided"}]);
    expect(auditCount("expense_void",expenseId)).toBe(1);
    expect(journalCount("expense",expenseId)).toBe(1);
    expect(journalCount("reversal",expenseId)).toBe(1);
    expect(Number(query(`SELECT COALESCE(SUM(debit_functional_cents-credit_functional_cents),0) AS total FROM journal_lines
      WHERE account_id='asset-recoverable-usd' AND journal_entry_id IN (SELECT id FROM journal_entries WHERE source_id='${expenseId}')`)[0]?.total||0)).toBe(2_500);

    const assertOrderOutcome=({orderId,productId,confirmed})=>{
      expect(query(`SELECT status FROM stock_orders WHERE id='${orderId}'`)).toEqual([{status:confirmed?"confirmed":"cancelled"}]);
      expect(count(`SELECT COUNT(*) AS total FROM sales WHERE order_id='${orderId}'`)).toBe(confirmed?1:0);
      expect(count(`SELECT COUNT(*) AS total FROM payments WHERE order_id='${orderId}'`)).toBe(confirmed?1:0);
      expect(count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE order_id='${orderId}' AND movement_type='reservation'`)).toBe(1);
      expect(count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE order_id='${orderId}' AND movement_type='sale'`)).toBe(confirmed?1:0);
      expect(count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE order_id='${orderId}' AND movement_type='release'`)).toBe(confirmed?0:1);
      expect(query(`SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='product:${productId}:base:base'`)).toEqual([{onHand:confirmed?4:5,reserved:0}]);
      expect(auditCount("order_confirm_payment",orderId)).toBe(confirmed?1:0);
      expect(auditCount("order_cancel",orderId)).toBe(confirmed?0:1);
    };
    assertOrderOutcome({orderId:cancelOrder.id,productId:"race-confirm-cancel",confirmed:confirmBeatCancel});

    const extendStatus=confirmBeatExtend?"confirmed":"reserved";
    expect(query(`SELECT status FROM stock_orders WHERE id='${extendOrder.id}'`)).toEqual([{status:extendStatus}]);
    expect(count(`SELECT COUNT(*) AS total FROM sales WHERE order_id='${extendOrder.id}'`)).toBe(confirmBeatExtend?1:0);
    expect(count(`SELECT COUNT(*) AS total FROM payments WHERE order_id='${extendOrder.id}'`)).toBe(confirmBeatExtend?1:0);
    expect(count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE order_id='${extendOrder.id}' AND movement_type='reservation'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE order_id='${extendOrder.id}' AND movement_type='sale'`)).toBe(confirmBeatExtend?1:0);
    expect(count(`SELECT COUNT(*) AS total FROM inventory_movements WHERE order_id='${extendOrder.id}' AND movement_type='release'`)).toBe(0);
    expect(query(`SELECT on_hand AS onHand,reserved FROM inventory_items WHERE sku='product:race-confirm-extend:base:base'`)).toEqual([{
      onHand:confirmBeatExtend?4:5,reserved:confirmBeatExtend?0:1
    }]);
    expect(auditCount("order_confirm_payment",extendOrder.id)).toBe(confirmBeatExtend?1:0);

    for (const [entityType,entityId] of [
      ["sale",twoPaymentSaleId],
      ["sale",paymentVoidSaleId],
      ["sale",doubleVoidSaleId],
      ["expense",expenseId],
      ["stock_order",cancelOrder.id],
      ["stock_order",extendOrder.id]
    ]) {
      expect(query(`SELECT COUNT(*) AS total,MAX(version) AS version FROM entity_mutation_claims WHERE entity_type='${entityType}' AND entity_id='${entityId}'`)).toEqual([{total:1,version:1}]);
    }

    expect(query("SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id GROUP BY je.id HAVING SUM(jl.debit_functional_cents)<>SUM(jl.credit_functional_cents)")).toEqual([]);
    expect(query("SELECT MIN(balance) AS minimum FROM (SELECT account_id,SUM(debit_functional_cents-credit_functional_cents) AS balance FROM journal_lines WHERE account_id='asset-receivable-usd' GROUP BY account_id)")).toEqual([{minimum:0}]);
  });
});
