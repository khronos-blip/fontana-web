(async () => {
  "use strict";

  const STORAGE_KEY = "fontana-admin-catalog-v1";
  const LAST_USERNAME_KEY = "fontana-admin-last-username";
  const SALES_STORAGE_KEY = "fontana-admin-sales-v1";
  const EXPENSES_STORAGE_KEY = "fontana-admin-expenses-v1";
  const FALLBACK_IMAGE = "../assets/fontana-seal-transparent.png";
  const config = window.FONTANA_CONFIG || {};
  const apiBase = String(config.adminApiBase || "").replace(/\/$/, "");
  const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const INVENTORY_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,69})$/;

  function inventoryKeySlug(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 70) || "sabor";
  }

  function availableInventoryKey(baseValue, usedKeys) {
    const requested = String(baseValue || "").trim();
    const base = INVENTORY_KEY_PATTERN.test(requested) ? requested : inventoryKeySlug(requested);
    let candidate = base;
    let suffix = 2;
    while (usedKeys.has(candidate)) {
      const ending = `-${suffix}`;
      candidate = `${base.slice(0, 70 - ending.length)}${ending}`;
      suffix += 1;
    }
    usedKeys.add(candidate);
    return candidate;
  }

  function freshInventoryKey(value, usedKeys) {
    const base = inventoryKeySlug(value);
    const randomSuffix = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
    return availableInventoryKey(`${base.slice(0, 57)}-${randomSuffix}`, usedKeys);
  }

  function normalizeBuilderFlavors(sourceFlavors) {
    const usedKeys = new Set();
    return (sourceFlavors || []).map(sourceFlavor => {
      const flavor = {...sourceFlavor};
      flavor.inventoryKey = availableInventoryKey(flavor.inventoryKey || flavor.name, usedKeys);
      flavor.status = flavor.status === "sold-out" ? "sold-out" : "available";
      if (localMode) {
        flavor.stockQuantity = flavor.stockQuantity === null || flavor.stockQuantity === "" || flavor.stockQuantity === undefined
          ? null
          : Math.max(0, Number(flavor.stockQuantity));
      } else {
        // En producción, D1 es la única fuente de cantidades. Este campo se
        // conserva solo en localhost para reproducir ese contrato sin Worker.
        delete flavor.stockQuantity;
      }
      return flavor;
    });
  }

  const originalProducts = [
    { id:"pistacho",category:"cakes",name:"Torta de Pistacho & Frambuesa",price:60,image:"assets/pistachio-raspberry-fontana-v2.jpg",description:"Harina de almendra, frambuesa, pistacho y glaseado vegano.",ingredients:"Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho, frambuesa, semillas de amapola, alulosa y chocolate blanco vegano sin azúcar",weight:"25 CM · 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"naranja",category:"cakes",name:"Torta de Manjar de Naranja",price:47,image:"assets/manjar-naranja.jpg",description:"Naranja, harina de almendra, semillas de amapola y alulosa.",ingredients:"Harina de almendra, harina de yuca (10 %), monkfruit, aceite de coco, huevo, naranja, semillas de amapola y alulosa",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"zanahoria",category:"cakes",name:"Torta de Zanahoria",price:47,image:"assets/zanahoria-fontana-v2.jpg",description:"Zanahoria, canela, jengibre, almendras y glaseado vegano.",ingredients:"Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, zanahoria, canela, jengibre, glaseado vegano y almendras",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"pistacho-clasico",category:"cakes",name:"Torta de Pistacho",price:55,image:"assets/pistacho-fontana-v4.webp",description:"Pistacho, harina de almendra y glaseado vegano.",ingredients:"Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho y glaseado vegano",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"chocolate",category:"cakes",name:"Torta de Triple Chocolate",price:47,image:"assets/chocolate-fontana-v2.jpg",description:"Chocolate vegano 70% cacao, harina de almendra y monk fruit.",ingredients:"Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, cacao, chocolate vegano endulzado con monkfruit y chispas de chocolate vegano endulzadas con monkfruit",weight:"25 CM · 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"vainilla",category:"cakes",name:"Torta de Vainilla con Chispas",price:47,image:"assets/vanilla-chips-fontana-v2.jpg",description:"Vainilla, harina de almendra y chispas de chocolate vegano.",ingredients:"Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa y chispas de chocolate vegano endulzadas con monkfruit",weight:"BAJO ENCARGO",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"lemon",category:"cakes",name:"Torta de Limón",price:47,image:"assets/lemon-fontana-v2.jpg",description:"Limón, harina de almendra, monk fruit y glaseado vegano blanco.",ingredients:"Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, limón y chocolate blanco vegano",weight:"25 CM · 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    ...clone(config.dynamicCatalog || []).map(product => ({ minimumBusinessDays: Number(config.leadTimesByProduct?.[product.id]?.minimumBusinessDays || 0), ...product }))
  ];

  const originalBuilders = {
    fonkies: {
      status:"available",promo:false,immediate:false,minimumQuantity:4,singlePrice:15,mixedPrice:17,extraPrice:3.5,image:"assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",
      flavors:[
        ["Chips de Chocolate Oscuro","assets/fonkie-dark-chocolate-chips-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, chocolate vegano oscuro y monkfruit"],
        ["Chispa de Chocolate Blanco","assets/fonkie-white-chocolate-chips-fontana-pro.jpg","Ingredientes pendientes de confirmar con Fontana"],
        ["Pistacho con Chocolate Blanco","assets/fonkie-pistachio-white-chocolate-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, chocolate vegano blanco, pistacho y monkfruit"],
        ["Triple Chocolate Fudge","assets/fonkie-triple-chocolate-fudge-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, chocolate vegano oscuro, cacao y monkfruit"],
        ["Nutella Fit","assets/fonkie-nutella-fit-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, nutella artesanal de cacao y avellana, aceite de oliva, alulosa y monkfruit"],
        ["Almond Caramel","assets/fonkie-almond-caramel-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, cacao, caramelo de almendra y monkfruit"],
        ["Cinnamon Roll","assets/fonkie-cinnamon-roll-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, chocolate vegano blanco, monkfruit y canela"],
        ["Kinder Bueno","assets/fonkie-kinder-bueno-fontana-pro.jpg","Harina de almendra, huevo, aceite de coco, chocolate vegano blanco, monkfruit, avellana y cacao"],
        ["Chips Ahoy Fit","assets/fonkie-chips-ahoy-fit-fontana-pro.jpg","Harina de arroz, harina de yuca, ghee, crema de dátiles, monkfruit, chispas de chocolate vegano y huevo"]
      ].map(([name,image,ingredients]) => ({name,image,ingredients,status:"available"}))
    },
    fomb: {
      status:"available",promo:false,immediate:false,extraPrice:3.5,image:"assets/fomb-dubai-fontana-pro.jpg",sizes:[{quantity:4,price:15},{quantity:12,price:30}],
      flavors:[
        ["Pistacho","assets/fomb-pistachio-fontana-pro.jpg","Almendra, chocolate blanco vegano, monkfruit, pistacho y blueberry"],
        ["Dubai","assets/fomb-dubai-fontana-pro.jpg","Almendra, chocolate blanco y oscuro vegano, monkfruit, pistacho y crunch de arroz"],
        ["Ferrero","assets/fomb-ferrero-fontana-pro.jpg","Almendra, chocolate oscuro vegano, monkfruit y avellana"],
        ["Raffaello","assets/fomb-raffaello-fontana-pro.jpg","Almendra, chocolate blanco vegano, monkfruit, coco y avellana"]
      ].map(([name,image,ingredients]) => ({name,image,ingredients,status:"available"}))
    }
  };

  const allThreeDietaryProductIds = new Set([
    "pistacho", "naranja", "zanahoria", "pistacho-clasico", "chocolate", "vainilla", "lemon",
    "ballerine", "tentacion-coco", "crumbl-blueberry", "brownie-fit", "mini-cake",
    "cachito-fit", "panzerottis", "raviolis", "nuggets-rora"
  ]);

  function dietaryDefaults(product) {
    if (allThreeDietaryProductIds.has(product.id)) return {glutenFree:true,sugarFree:true,lactoseFree:true,eggFree:false};
    if (product.id === "tequenos-fit") return {glutenFree:true,sugarFree:true,lactoseFree:false,eggFree:false};
    return {glutenFree:false,sugarFree:false,lactoseFree:false,eggFree:false};
  }

  function normalizedDietary(product) {
    const defaults = dietaryDefaults(product);
    return {
      glutenFree: Object.prototype.hasOwnProperty.call(product, "glutenFree") ? Boolean(product.glutenFree) : defaults.glutenFree,
      sugarFree: Object.prototype.hasOwnProperty.call(product, "sugarFree") ? Boolean(product.sugarFree) : defaults.sugarFree,
      lactoseFree: Object.prototype.hasOwnProperty.call(product, "lactoseFree") ? Boolean(product.lactoseFree) : defaults.lactoseFree,
      eggFree: Object.prototype.hasOwnProperty.call(product, "eggFree") ? Boolean(product.eggFree) : defaults.eggFree
    };
  }

  function normalizeState(source) {
    const next = source && Array.isArray(source.products) && source.builders ? clone(source) : {};
    next.version = 2;
    next.updatedAt ||= null;
    next.settings = {
      ...(next.settings || {}),
      stockTodayOpen: next.settings?.stockTodayOpen !== false,
      productionWithElectricity: next.settings?.productionWithElectricity !== false
    };
    const sourceProducts = next.products || clone(originalProducts);
    const sourceIds = new Set(sourceProducts.map(product => product.id));
    const productsWithNewDefaults = [
      ...sourceProducts,
      ...clone(originalProducts).filter(product => !sourceIds.has(product.id))
    ];
    next.products = productsWithNewDefaults.map(product => ({
      ...product, ...normalizedDietary(product),
      visible: product.visible !== false,
      status: product.status === "sold-out" ? "sold-out" : "available",
      stockQuantity: product.stockQuantity === null || product.stockQuantity === "" || product.stockQuantity === undefined ? null : Math.max(0, Number(product.stockQuantity)),
      isNew: Boolean(product.isNew), promo: Boolean(product.promo), immediate: Boolean(product.immediate),
      requiresElectricity: product.requiresElectricity === true,
      allowPreorder: product.category === "salado" || Boolean(product.allowPreorder), customLabels: Array.isArray(product.customLabels) ? product.customLabels : [],
      variants: (product.variants || []).map(option => ({...option, stockQuantity: option.stockQuantity === null || option.stockQuantity === "" || option.stockQuantity === undefined ? null : Math.max(0, Number(option.stockQuantity))})),
      sizes: (product.sizes || []).map(option => ({...option, stockQuantity: option.stockQuantity === null || option.stockQuantity === "" || option.stockQuantity === undefined ? null : Math.max(0, Number(option.stockQuantity))}))
    }));
    next.builders = next.builders || clone(originalBuilders);
    ["fonkies", "fomb"].forEach(kind => {
      const builder = next.builders[kind] || clone(originalBuilders[kind]);
      const normalizedBuilder = {
        ...builder,
        glutenFree: Object.prototype.hasOwnProperty.call(builder, "glutenFree") ? Boolean(builder.glutenFree) : true,
        sugarFree: Object.prototype.hasOwnProperty.call(builder, "sugarFree") ? Boolean(builder.sugarFree) : true,
        lactoseFree: Object.prototype.hasOwnProperty.call(builder, "lactoseFree") ? Boolean(builder.lactoseFree) : true,
        eggFree: Object.prototype.hasOwnProperty.call(builder, "eggFree") ? Boolean(builder.eggFree) : kind === "fomb",
        visible: builder.visible !== false, status: builder.status === "sold-out" ? "sold-out" : "available",
        isNew: Boolean(builder.isNew), promo: Boolean(builder.promo), immediate: Boolean(builder.immediate), allowPreorder: true,
        requiresElectricity: Object.prototype.hasOwnProperty.call(builder, "requiresElectricity") ? Boolean(builder.requiresElectricity) : kind === "fonkies",
        flavors: normalizeBuilderFlavors(builder.flavors)
      };
      delete normalizedBuilder.stockQuantity;
      next.builders[kind] = normalizedBuilder;
    });
    return next;
  }

  function defaultState() {
    return normalizeState({ version:2, updatedAt:null, settings:{stockTodayOpen:true}, products:clone(originalProducts), builders:clone(originalBuilders) });
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return parsed && Array.isArray(parsed.products) ? normalizeState(parsed) : defaultState();
    } catch {
      return defaultState();
    }
  }

  let state = defaultState();
  let remoteRevision = 0;
  let pendingConfiguredProductCount = 0;
  let dirty = false;
  let currentSession = null;
  let sales = [];
  let salesSummary = {todayCents:0,monthCents:0,yearCents:0,allCents:0,confirmedCount:0,pendingCount:0};
  let inventory = [];
  let inventoryLoaded = false;
  let inventorySummary = {tracked:0,available:0,reserved:0,soldOut:0};
  let orders = [];
  let orderSummary = {reserved:0,confirmed:0,expired:0};
  let customers = [];
  let customerSummary = {total:0,recurrent:0,newCustomers:0,withBalance:0};
  const customerDetails = new Map();
  let expenses = [];
  let accountingSummary = {collectedFunctionalCents:0,receivableFunctionalCents:0,cashInflowFunctionalCents:0,cashOutflowFunctionalCents:0,netCashFunctionalCents:0,expenseFunctionalCents:0,paymentsByCurrency:[],paymentsByMethod:[]};
  let accountingRange = {from:"",to:""};
  let paymentCatalogSelection = new Map();
  let paymentDialogMode = "manual";
  let activeOrderForPayment = null;
  const exchangeRateCache = new Map();
  let activityItems = [];
  let operations = { electricityEnabled: true, updatedAt: null, updatedBy: "system", affectedCount: 1 };

  async function apiFetch(path, options = {}) {
    if (!apiBase) throw new Error("API_NOT_CONFIGURED");
    const response = await fetch(`${apiBase}${path}`, {credentials:"include",cache:"no-store", ...options, headers:{...(options.body instanceof FormData ? {} : {"Content-Type":"application/json"}), ...(options.headers || {})}});
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error || `HTTP_${response.status}`);
      error.status = response.status;
      error.code = payload?.code || "";
      throw error;
    }
    return payload;
  }

  function showLogin(message = "") {
    $("#adminApp").hidden = true;
    $("#loginView").hidden = false;
    if (message) $("#loginStatus").textContent = message;
  }

  async function loadRemoteState() {
    const payload = await apiFetch("/v1/admin/catalog");
    const sourceState = payload?.state || defaultState();
    const publishedIds = new Set((sourceState.products || []).map(product => product.id));
    pendingConfiguredProductCount = originalProducts.filter(product => !publishedIds.has(product.id)).length;
    state = normalizeState(sourceState);
    remoteRevision = Number(payload?.revision || 0);
    if (pendingConfiguredProductCount) dirty = true;
  }

  async function loadOperations() {
    if (localMode) {
      operations = { electricityEnabled: state.settings?.productionWithElectricity !== false, updatedAt: state.updatedAt, updatedBy: currentSession?.username || "local", affectedCount: affectedElectricityCount() };
      renderElectricityControl();
      return;
    }
    operations = await apiFetch("/v1/admin/operations");
    renderElectricityControl();
  }

  async function enterPanel() {
    if (!currentSession?.ok && !localMode) throw new Error("La autenticación todavía no fue confirmada.");
    $("#loginView").hidden = true;
    $("#adminApp").hidden = false;
    await loadOperations();
    renderAll();
    if (pendingConfiguredProductCount) {
      $("#saveStatus").textContent = `${pendingConfiguredProductCount} productos nuevos pendientes de publicar`;
      toast("Revisa los productos nuevos y pulsa Guardar y publicar.");
    }
    await loadSales();
    await Promise.all([loadInventory(), loadOrders(), loadCustomers(), loadAccounting(), loadActivity()]);
  }

  function base64UrlToBytes(value) {
    const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  }

  function bytesToBase64Url(value) {
    const bytes = new Uint8Array(value || []);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function registrationOptionsForBrowser(options) {
    return {
      ...options,
      challenge: base64UrlToBytes(options.challenge),
      user: { ...options.user, id: base64UrlToBytes(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: base64UrlToBytes(item.id) }))
    };
  }

  function authenticationOptionsForBrowser(options) {
    return {
      ...options,
      challenge: base64UrlToBytes(options.challenge),
      allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: base64UrlToBytes(item.id) }))
    };
  }

  function publicKeyCredentialToJSON(credential) {
    const response = credential.response;
    const result = {
      id: credential.id,
      rawId: bytesToBase64Url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: { clientDataJSON: bytesToBase64Url(response.clientDataJSON) }
    };
    if (response.attestationObject) {
      result.response.attestationObject = bytesToBase64Url(response.attestationObject);
      result.response.transports = typeof response.getTransports === "function" ? response.getTransports() : [];
    } else {
      result.response.authenticatorData = bytesToBase64Url(response.authenticatorData);
      result.response.signature = bytesToBase64Url(response.signature);
      result.response.userHandle = response.userHandle ? bytesToBase64Url(response.userHandle) : undefined;
    }
    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]);
  }

  function absoluteImage(path) {
    if (!path) return FALLBACK_IMAGE;
    if (/^(data:|https?:)/.test(path)) return path;
    return `../${path.replace(/^\.\.\//, "")}`;
  }

  function productFromReference(item = {}) {
    const productId = String(item.productId || item.product_id || "");
    const sku = String(item.sku || "");
    const skuProductId = sku.startsWith("product:") ? sku.split(":")[1] : "";
    const direct = state.products.find(product => !product.deleted && product.id === (productId || skuProductId));
    if (direct) return {image:direct.image,name:direct.name};
    const kind = String(item.kind || (sku.startsWith("builder:") ? sku.split(":")[1] : "")).toLowerCase();
    if (kind === "fonkies" || kind === "fomb") {
      const option = String(item.optionSummary || item.option_summary || item.flavor || item.name || "").toLowerCase();
      const key = String(item.inventoryKey || (sku.startsWith("builder:") ? sku.split(":").pop() : ""));
      const flavor = state.builders?.[kind]?.flavors?.find(entry => entry.inventoryKey === key)
        || state.builders?.[kind]?.flavors?.find(entry => option.includes(String(entry.name || "").toLowerCase()));
      if (flavor) return {image:flavor.image,name:`${kind === "fonkies" ? "Fonkies" : "Fomb"} · ${flavor.name}`};
      return {image:state.builders?.[kind]?.image,name:kind === "fonkies" ? "Fonkies" : "Fomb"};
    }
    const text = `${item.name || ""} ${item.label || ""} ${item.optionSummary || ""}`.toLowerCase();
    if (!text.trim()) return null;
    const byName = state.products.find(product => !product.deleted && (text.includes(String(product.name || "").toLowerCase()) || String(product.name || "").toLowerCase().includes(text.trim())));
    return byName ? {image:byName.image,name:byName.name} : null;
  }

  function imageForItem(item = {}) {
    const direct = item.imageUrlSnapshot || item.image_url_snapshot || item.imageUrl || item.image_url || item.image;
    return absoluteImage(direct || productFromReference(item)?.image || "");
  }

  function productThumb(item, alt = "") {
    return `<img class="product-thumb" data-product-image src="${escapeHtml(imageForItem(item))}" data-fallback-src="${escapeHtml(FALLBACK_IMAGE)}" alt="${escapeHtml(alt || item?.name || item?.label || "Producto")}" loading="lazy">`;
  }

  function saleLineItems(sale = {}) {
    const candidates = sale.lineItems || sale.saleItems || sale.itemsStructured || (Array.isArray(sale.items) ? sale.items : []);
    if (Array.isArray(candidates) && candidates.length) return candidates.map(item => ({
      ...item,
      name:item.name || item.productName || "Producto",
      optionSummary:item.optionSummary || item.option_summary || "",
      quantity:Math.max(1,Number(item.quantity || 1)),
      unitPriceRefCents:Number(item.unitPriceRefCents ?? item.unit_price_ref_cents ?? item.unitPriceCents ?? 0)
    }));
    const legacy = String(sale.itemsText || sale.items || "").trim();
    if (!legacy) return [];
    return legacy.split(/;|\n/).map(part => part.trim()).filter(Boolean).map(part => {
      const match = part.match(/^(\d+)\s*[×x]\s*(.+)$/i);
      const name = match ? match[2].trim() : part;
      return {name,quantity:match ? Number(match[1]) : 1};
    });
  }

  function imageStack(items, label = "Productos") {
    const lines = (items || []).slice(0,3);
    if (!lines.length) return `<div class="product-image-stack">${productThumb({}, label)}</div>`;
    const more = Math.max(0,(items || []).length - lines.length);
    return `<div class="product-image-stack" aria-label="${escapeHtml(label)}">${lines.map(item => productThumb(item,item.name || label)).join("")}${more ? `<span class="image-more" aria-label="${more} productos adicionales">+${more}</span>` : ""}</div>`;
  }

  function normalizedPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("0")) return `58${digits.slice(1)}`;
    return digits;
  }

  function scaledRateToNumber(rate) {
    if (!rate) return 0;
    if (Number.isFinite(Number(rate.exact))) return Number(rate.exact);
    const scale = Number(rate.rateScale || 8);
    return Number(rate.rateScaled || 0) / (10 ** scale);
  }

  function paymentRateCopy(payment = {}) {
    const valueDate=payment.exchangeRateValueDate||payment.exchange_rate_value_date||payment.rateValueDate||"";
    const basis=payment.rateBasis||payment.rate_basis||"";
    const scaled=payment.exchangeRateScaled??payment.exchange_rate_scaled??payment.rateScaled;
    if(!valueDate&&!basis&&!scaled)return "";
    const rate=scaledRateToNumber({rateScaled:scaled,rateScale:payment.exchangeRateScale??payment.exchange_rate_scale??8});
    return ` · BCV ${basis||""}${rate?` ${new Intl.NumberFormat(config.locale||"es-VE",{maximumFractionDigits:8}).format(rate)}`:""}${valueDate?` · FV ${valueDate}`:""}`;
  }

  function paymentHistoryCopy(payment = {}) {
    const currency=String(payment.currency||payment.paidCurrency||"").toUpperCase();
    const amount=payment.amountMinor??payment.amount_minor;
    const amountCopy=amount===null||amount===undefined?currency:`${currency}\u00a0${formatMinorAmount(amount,payment.amountScale??payment.amount_scale??2)}`;
    const paymentDate=payment.paymentDate||payment.payment_date||"";
    const note=String(payment.notes||payment.note||"").trim();
    return `${payment.method||payment.paymentMethod||"Pago"}${amountCopy?` · ${amountCopy}`:""}${paymentDate?` · Cobro ${paymentDate}`:""}${paymentRateCopy(payment)}${note?` · Nota: ${note}`:""}`;
  }

  function money(value) {
    if (value === null || value === "" || !Number.isFinite(Number(value))) return "Por confirmar";
    const amount = new Intl.NumberFormat(config.locale || "es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value));
    return `${config.displayCurrency || "REF"}\u00a0${amount}`;
  }

  function caracasDate(value = new Date()) {
    return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Caracas",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
  }

  function defaultAccountingRange() {
    const to=caracasDate();
    return {from:`${to.slice(0,7)}-01`,to};
  }

  function dateInRange(value,range=accountingRange) {
    const date=String(value||"").slice(0,10);
    return Boolean(date)&&(!range.from||date>=range.from)&&(!range.to||date<=range.to);
  }

  function visibleActivityDetails(value) {
    const text=String(value || "Sin detalle");
    if(/funcional|functional|BCV|tasa|moneda|currency|pago|payment|cobro|gasto/i.test(text))return text;
    return text.replace(/\bUSD(?=[\s\u00a0]+\d)/g, config.displayCurrency || "REF");
  }

  function toast(message) {
    const element = $("#adminToast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
  }

  function markDirty() {
    dirty = true;
    $("#saveStatus").textContent = "Cambios pendientes";
  }

  async function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      if (localMode) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        activityItems.unshift({username:currentSession?.username || "revision-local",action:"catalog_save",details:"Catálogo actualizado",createdAt:state.updatedAt});
      } else {
        const payload = await apiFetch("/v1/admin/catalog", {method:"PUT", body:JSON.stringify({state, expectedRevision:remoteRevision})});
        remoteRevision = Number(payload?.revision || remoteRevision + 1);
      }
      dirty = false;
      pendingConfiguredProductCount = 0;
      $("#saveStatus").textContent = localMode ? "Borrador local guardado" : "Publicado para todos";
      renderAll();
      await loadInventory();
      if (!localMode) await loadActivity();
      toast(localMode ? "Cambios guardados en este navegador" : "Cambios publicados en la tienda");
    } catch (error) {
      if (error.status === 409) toast("El catálogo cambió en otro dispositivo. Recarga antes de guardar.");
      else if (error.status === 401) { showLogin("Tu sesión venció. Inicia sesión nuevamente."); }
      else toast("No se pudo guardar. Revisa la conexión e inténtalo de nuevo.");
    }
  }

  function showView(name) {
    $$(".view").forEach(view => view.classList.toggle("active", view.dataset.panel === name));
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    if (name === "security") loadSecurity();
    if (name === "sales") loadSales();
    if (name === "inventory") loadInventory();
    if (name === "orders") loadOrders();
    if (name === "customers") loadCustomers();
    if (name === "accounting") loadAccounting();
    if (name === "activity-log") loadActivity();
    closeAdminMenu();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function closeAdminMenu() {
    const menu = $("#adminMenu");
    const button = $("#adminMenuButton");
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function toggleAdminMenu() {
    const menu = $("#adminMenu");
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    $("#adminMenuButton").setAttribute("aria-expanded", String(willOpen));
  }

  function centsMoney(value) {
    return `${config.displayCurrency || "REF"}\u00a0${formatMinorAmount(value,2)}`;
  }

  function functionalMoney(value) {
    return `USD\u00a0${formatMinorAmount(value,2)}`;
  }

  function activityMeta(action) {
    const groups = {
      catalog_save:["Catálogo publicado","catalog"], image_upload:["Imagen subida","catalog"],
      inventory_adjust:["Inventario ajustado","inventory"], order_confirm:["Pedido confirmado","orders"], order_cancel:["Pedido cancelado","orders"],
      sale_create:["Venta registrada","sales"], sale_update:["Venta actualizada","sales"], sale_void:["Venta anulada","sales"], sale_delete:["Venta anulada","sales"],
      payment_confirm:["Pago confirmado","sales"], customer_upsert:["Cliente actualizado","sales"], expense_create:["Gasto registrado","sales"], expense_void:["Gasto anulado","sales"], exchange_rate_refresh:["Tasa BCV actualizada","sales"],
      login:["Inicio de sesión","security"], passkey_login:["Acceso con Face ID","security"], passkey_add:["Face ID activado","security"], passkey_delete:["Face ID eliminado","security"], user_create:["Usuario creado","security"], user_deactivate:["Usuario desactivado","security"], setup:["Panel configurado","security"], electricity_state:["Estado de electricidad","catalog"]
    };
    return groups[action] || [String(action || "Cambio").replaceAll("_"," "),"other"];
  }

  async function loadActivity() {
    try {
      if (localMode) {
        if (!activityItems.length && state.updatedAt) activityItems = [{username:currentSession?.username || "revision-local",action:"catalog_save",details:"Catálogo local actualizado",createdAt:state.updatedAt}];
      } else {
        const payload = await apiFetch("/v1/admin/activity");
        activityItems = payload.items || [];
      }
      renderActivity();
      renderRecentActivity();
    } catch (error) {
      if (error.status === 401) showLogin("Tu sesión venció.");
      else toast("No se pudo cargar el historial.");
    }
  }

  function filteredActivity() {
    const query = String($("#activitySearch")?.value || "").trim().toLowerCase();
    const type = $("#activityTypeFilter")?.value || "all";
    return activityItems.filter(item => {
      const [label,group] = activityMeta(item.action);
      const matchesSearch = !query || `${item.username} ${label} ${visibleActivityDetails(item.details)}`.toLowerCase().includes(query);
      return matchesSearch && (type === "all" || type === group);
    });
  }

  function activityRow(item, compact = false) {
    const [label,group] = activityMeta(item.action);
    const dateOptions = compact ? {timeStyle:"short"} : {dateStyle:"medium",timeStyle:"short"};
    const date = item.createdAt ? new Date(item.createdAt).toLocaleString("es-VE",dateOptions) : "Fecha no disponible";
    const product = productFromReference({...item,name:item.productName || item.details});
    const media = product ? productThumb(product,product.name || "Producto relacionado") : `<span class="activity-dot ${escapeHtml(group)}"></span>`;
    return `<article class="activity-row ${compact ? "compact-activity" : ""} ${product ? "has-product-image" : ""}">${media}<div><h3>${escapeHtml(label)}</h3><p>${escapeHtml(visibleActivityDetails(item.details))}</p><small>${escapeHtml(item.username || "sistema")} · ${escapeHtml(date)}</small></div></article>`;
  }

  function renderActivity() {
    if (!$("#activityList")) return;
    const items = filteredActivity();
    $("#activityList").innerHTML = items.length ? items.map(item => activityRow(item)).join("") : '<div class="empty-list">No hay cambios que coincidan con estos filtros.</div>';
  }

  function renderRecentActivity() {
    if (!$("#activity")) return;
    const items = activityItems.slice(0,3);
    $("#activity").innerHTML = items.length ? items.map(item => activityRow(item,true)).join("") : `<div><b>${state.updatedAt ? new Date(state.updatedAt).toLocaleString("es-VE") : "Catálogo inicial"}</b><p>Aún no hay cambios registrados.</p></div>`;
  }

  function renderDashboardOperations() {
    if (!$("#attentionGrid")) return;
    const lowStock = inventory.filter(item => item.trackStock && item.available > 0 && item.available <= 3).length;
    const soldOut = inventory.filter(item => item.trackStock && item.available === 0).length;
    const reserved = Number(orderSummary.reserved || 0);
    const pending = Number(salesSummary.pendingCount || 0);
    const cards = [
      [lowStock,"Stock bajo","Reponer ahora","low-stock"],
      [soldOut,"Agotados","Revisar inventario","sold-out"],
      [reserved,"Reservas activas","Gestionar pedidos","reservations"],
      [pending,"Pendientes de cobro","Revisar ventas","pending-sales"]
    ];
    $("#attentionGrid").innerHTML = cards.map(([value,label,copy,action]) => `<button type="button" class="attention-card ${Number(value)>0?"needs-attention":"is-clear"}" data-attention-action="${action}"><b>${Number(value)}</b><span>${label}</span><small>${Number(value)>0?copy:"Todo al día"} →</small></button>`).join("");
    const open = state.settings?.stockTodayOpen !== false;
    $("#stockDayToggle").className = `day-toggle ${open ? "is-open" : "is-closed"}`;
    $("#stockDayToggle").innerHTML = `<span>${open ? "● Visible en la tienda" : "● Pausado"}</span><b>${open ? "Pausar Stock de hoy" : "Mostrar Stock de hoy"}</b><small>${open ? "Solo afecta el escaparate del día" : "El inventario sigue guardado"}</small>`;
    const today = caracasDate();
    const todaySales = sales.filter(item => item.status === "confirmed" && item.soldAt === today);
    $("#todaySummary").innerHTML = `<div><span>Resumen de hoy</span><b>${escapeHtml(functionalMoney(salesSummary.todayCents))}</b><small>Valor vendido · USD funcional</small></div><div><b>${todaySales.length}</b><small>Ventas registradas</small></div><div><b>${reserved}</b><small>Pedidos por confirmar</small></div><button type="button" data-view-link="sales">Ver ventas →</button>`;
    $("#todaySummary [data-view-link]").addEventListener("click",()=>showView("sales"));
  }

  async function toggleStockDay() {
    const willOpen = state.settings?.stockTodayOpen === false;
    state.settings ||= {};
    state.settings.stockTodayOpen = willOpen;
    markDirty();
    renderDashboardOperations();
    await saveState();
    toast(willOpen ? "Stock de hoy vuelve a estar visible." : "Stock de hoy quedó pausado. Los productos y las cantidades siguen guardados.");
  }

  function affectedElectricityCount() {
    const products = state.products.filter(item => !item.deleted && item.visible !== false && item.requiresElectricity === true).length;
    const builders = ["fonkies", "fomb"].filter(kind => state.builders?.[kind]?.visible !== false && state.builders?.[kind]?.requiresElectricity === true).length;
    return products + builders;
  }

  function renderElectricityControl() {
    const enabled = operations.electricityEnabled !== false;
    const count = Number(operations.affectedCount ?? affectedElectricityCount());
    $("#electricityControl")?.classList.toggle("is-paused", !enabled);
    $("#electricityTitle").textContent = enabled ? "Electricidad activa" : "Sin electricidad";
    $("#electricityDescription").textContent = enabled ? "Los productos que requieren electricidad siguen su disponibilidad normal." : `${count} ${count === 1 ? "producto queda" : "productos quedan"} temporalmente no disponible. El resto del catálogo sigue activo.`;
    $("#electricityMeta").textContent = operations.updatedAt ? `Último cambio: ${new Date(operations.updatedAt).toLocaleString("es-VE")} · ${operations.updatedBy || "sistema"}` : "Estado central de producción";
    $("#electricityToggle").setAttribute("aria-checked", String(enabled));
    $("#electricityToggle").setAttribute("aria-label", enabled ? "Cambiar a producción sin electricidad" : "Restablecer producción con electricidad");
    $("#electricityToggle").innerHTML = `<span aria-hidden="true"></span>`;
  }

  async function toggleElectricity() {
    const nextEnabled = operations.electricityEnabled === false;
    const affectedCount = affectedElectricityCount();
    if (!nextEnabled && !confirm(`Se pausará temporalmente ${affectedCount} ${affectedCount === 1 ? "producto" : "productos"} que ${affectedCount === 1 ? "requiere" : "requieren"} electricidad. El stock y las reservas no cambiarán. ¿Continuar?`)) return;
    const button = $("#electricityToggle");
    button.disabled = true;
    try {
      if (localMode) {
        state.settings ||= {};
        state.settings.productionWithElectricity = nextEnabled;
        state.updatedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        operations = {electricityEnabled:nextEnabled,updatedAt:state.updatedAt,updatedBy:currentSession?.username || "local",affectedCount};
      } else {
        operations = await apiFetch("/v1/admin/operations/electricity", {method:"PUT",body:JSON.stringify({electricityEnabled:nextEnabled})});
        await loadActivity();
      }
      renderElectricityControl();
      toast(nextEnabled ? "Producción con electricidad activada." : "Producción sin electricidad activada. Fonkies quedó temporalmente pausado.");
    } catch (error) {
      if (error.status === 401) showLogin("Tu sesión venció.");
      else toast("No se pudo cambiar el estado. Inténtalo de nuevo.");
    } finally { button.disabled = false; }
  }

  function localInventoryItems() {
    const rows = state.products.filter(product => !product.deleted).map(product => ({sku:`product:${product.id}:base:base`,productId:product.id,image:product.image,kind:"product",label:product.name,optionSummary:"",onHand:Number(product.stockQuantity || 0),reserved:0,available:Number(product.stockQuantity || 0),trackStock:product.stockQuantity !== null}));
    ["fonkies","fomb"].forEach(kind => state.builders[kind].flavors.forEach(flavor => {
      const onHand = Number(flavor.stockQuantity || 0);
      rows.push({
        sku:`builder:${kind}:${flavor.inventoryKey || inventoryKeySlug(flavor.name)}`,
        inventoryKey:flavor.inventoryKey || inventoryKeySlug(flavor.name),
        kind,
        image:flavor.image,
        label:kind === "fonkies" ? "Fonkies" : "Fomb",
        optionSummary:flavor.name,
        onHand,
        reserved:0,
        available:onHand,
        trackStock:flavor.stockQuantity !== null && flavor.stockQuantity !== undefined
      });
    }));
    return rows;
  }

  function calculateInventorySummary(items = inventory) {
    const tracked = items.filter(item => item.trackStock);
    return {
      tracked:tracked.length,
      available:tracked.reduce((sum,item)=>sum+Number(item.available || 0),0),
      reserved:tracked.reduce((sum,item)=>sum+Number(item.reserved || 0),0),
      soldOut:tracked.filter(item=>Number(item.available || 0)===0).length
    };
  }

  async function loadInventory() {
    try {
      if (localMode) {
        inventory = localInventoryItems();
        inventorySummary = calculateInventorySummary();
      } else {
        const payload = await apiFetch("/v1/admin/inventory");
        inventory = payload.items || [];
        inventorySummary = payload.summary || inventorySummary;
      }
      inventoryLoaded = true;
      renderInventory();
      renderDashboardOperations();
      renderBuilder("fonkies");
      renderBuilder("fomb");
    } catch (error) { if (error.status === 401) showLogin("Tu sesión venció."); else toast("No se pudo cargar el inventario."); }
  }

  function renderInventory() {
    if (!$("#inventoryList")) return;
    const query = String($("#inventorySearch")?.value || "").toLowerCase();
    const kind = $("#inventoryKindFilter")?.value || "all";
    const level = $("#inventoryStateFilter")?.value || "all";
    const items = inventory.filter(item => {
      const levelMatch = level === "all" || (level === "low" && item.trackStock && item.available > 0 && item.available <= 3) || (level === "soldout" && item.trackStock && item.available === 0) || (level === "reserved" && item.reserved > 0);
      return (!query || `${item.label} ${item.optionSummary}`.toLowerCase().includes(query)) && (kind === "all" || item.kind === kind) && levelMatch;
    });
    $("#inventoryStats").innerHTML = [[inventorySummary.available,"Disponibles"],[inventorySummary.reserved,"Reservadas"],[inventorySummary.tracked,"Artículos controlados"],[inventorySummary.soldOut,"Agotados"]].map(([value,label])=>`<article class="stat"><b>${Number(value||0)}</b><span>${label}</span></article>`).join("");
    $("#inventoryList").innerHTML = items.length ? items.map(item => {
      const minimum = Number(item.reserved || 0);
      const value = Number(item.onHand || 0);
      const isBuilderFlavor = item.kind === "fonkies" || item.kind === "fomb";
      const displayName = isBuilderFlavor ? item.optionSummary : item.label;
      const context = item.kind === "fonkies"
        ? "Fonkies · galletas individuales"
        : item.kind === "fomb"
          ? "Fomb · bombones individuales"
          : item.optionSummary || item.kind;
      const quantityLabel = item.kind === "fonkies" ? "Galletas totales" : item.kind === "fomb" ? "Bombones totales" : "Cantidad total";
      const stockCopy = item.trackStock
        ? `${item.available} disponible${item.available===1?"":"s"} · ${item.reserved} reservada${item.reserved===1?"":"s"}`
        : "Control inactivo · disponibilidad por confirmar";
      return `<article class="inventory-row" data-sku="${escapeHtml(item.sku)}"><div class="inventory-copy product-context">${productThumb(item,displayName)}<div class="product-context-copy"><span class="eyebrow">${escapeHtml(context)}</span><h3>${escapeHtml(displayName)}</h3><p>${escapeHtml(stockCopy)}</p></div></div><label class="stock-quantity-label">${escapeHtml(quantityLabel)}<div class="stock-stepper"><button type="button" data-stock-delta="-1" aria-label="Restar una unidad" ${value<=minimum?"disabled":""}>−</button><input data-stock-value aria-label="${escapeHtml(quantityLabel)} de ${escapeHtml(displayName)}" type="number" inputmode="numeric" min="${minimum}" step="1" value="${value}"><button type="button" data-stock-delta="1" aria-label="Sumar una unidad">+</button></div></label><label class="switch"><input data-track-stock type="checkbox" ${item.trackStock?"checked":""}><span>Control activo</span></label><button class="primary compact" data-save-stock type="button">Guardar</button></article>`;
    }).join("") : '<div class="empty-list">No hay artículos que coincidan.</div>';
  }

  async function loadOrders() {
    try {
      if (localMode) { orders=[]; orderSummary={reserved:0,confirmed:0,expired:0}; }
      else { const payload=await apiFetch("/v1/admin/orders"); orders=payload.items||[]; orderSummary=payload.summary||orderSummary; }
      renderOrders();
      renderDashboardOperations();
    } catch (error) { if (error.status===401) showLogin("Tu sesión venció."); else toast("No se pudieron cargar los pedidos."); }
  }

  function renderOrders() {
    if (!$("#ordersList")) return;
    const query=String($("#orderSearch")?.value||"").toLowerCase();
    const status=$("#orderStatusFilter")?.value||"active";
    const now=Math.floor(Date.now()/1000);
    const items=orders.filter(order=>(status==="all"||(status==="active"?order.status==="reserved":order.status===status))&&(!query||`${order.orderCode} ${order.customerName} ${order.customerPhone}`.toLowerCase().includes(query)));
    $("#orderStats").innerHTML=[[orderSummary.reserved,"Reservas activas","active"],[orderSummary.confirmed,"Confirmados","confirmed"],[orderSummary.expired,"Vencidos","expired"],[orders.length,"Pedidos registrados","all"]].map(([value,label,filter])=>`<button type="button" class="stat stat-link" data-order-filter="${filter}" aria-label="Ver ${label.toLowerCase()}" aria-pressed="${status===filter}"><b>${Number(value||0)}</b><span>${label}</span></button>`).join("");
    const labels={reserved:"Reservado",confirmed:"Confirmado",cancelled:"Cancelado",expired:"Vencido"};
    $("#ordersList").innerHTML=items.length?items.map(order=>{
      const seconds=Math.max(0,Number(order.expiresAt||0)-now);
      const orderItems=Array.isArray(order.items)?order.items:[];
      const itemRows=orderItems.map(item=>`<div class="order-item">${productThumb(item,item.name)}<div><b>${escapeHtml(item.name||"Producto")}</b><small>${escapeHtml(item.optionSummary||"")}</small></div><span>${Math.max(1,Number(item.quantity||1))}×</span></div>`).join("");
      return `<article class="order-row"><div class="order-main"><div class="order-title"><h3>${escapeHtml(order.orderCode)}</h3><span class="badge ${order.status==="confirmed"?"green":order.status!=="reserved"?"red":""}">${labels[order.status]||order.status}</span></div><p><b>${escapeHtml(order.customerName||"Cliente")}</b> · ${escapeHtml(order.customerPhone||"")}</p><div class="order-items">${itemRows || `<div class="order-item">${productThumb({},"Producto")}<div><b>Detalle histórico</b><small>Sin imagen asociada</small></div></div>`}</div><small>${escapeHtml(order.fulfillment||"")} · ${escapeHtml(order.requestedDate||"")} · ${escapeHtml(centsMoney(order.totalCents))}${order.status==="reserved"?` · vence en ${Math.ceil(seconds/60)} min`:""}</small></div>${order.status==="reserved"?`<div class="order-actions"><button class="primary compact" data-order-action="confirm" data-order-id="${escapeHtml(order.id)}">Confirmar pago</button><button class="ghost compact" data-order-action="extend" data-order-id="${escapeHtml(order.id)}">+30 min</button><button class="danger compact" data-order-action="cancel" data-order-id="${escapeHtml(order.id)}">Cancelar</button></div>`:""}</article>`;
    }).join(""):'<div class="empty-list">No hay pedidos en este estado.</div>';
  }

  function openOrderFilter(status) {
    $("#orderSearch").value = "";
    $("#orderStatusFilter").value = status;
    renderOrders();
    $(".orders-toolbar")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function calculateSalesSummary(items) {
    const today = caracasDate();
    const confirmed = items.filter(isCommittedSale);
    const sum = matches => matches.reduce((total, item) => total + saleFunctionalCents(item), 0);
    return {
      todayCents: sum(confirmed.filter(item => item.soldAt === today)),
      monthCents: sum(confirmed.filter(item => String(item.soldAt).startsWith(today.slice(0, 7)))),
      yearCents: sum(confirmed.filter(item => String(item.soldAt).startsWith(today.slice(0, 4)))),
      allCents: sum(confirmed), confirmedCount: confirmed.length,
      pendingCount: items.filter(item => item.status === "pending" || ["partial","unpaid"].includes(item.paymentStatus)).length
    };
  }

  function isCommittedSale(sale) {
    if(["cancelled","void"].includes(sale?.status))return false;
    return sale?.status==="confirmed"||["paid","partial"].includes(sale?.paymentStatus)||(sale?.payments||[]).some(payment=>isActivePayment(payment)&&Number(payment.amountMinor??payment.amount_minor??0)>0);
  }

  function isActivePayment(payment) {
    return !["void","voided","refunded"].includes(String(payment?.status || "confirmed").toLowerCase());
  }

  function isVoidedStatus(status) {
    return ["void","voided","cancelled"].includes(String(status || "").toLowerCase());
  }

  function saleFunctionalCents(sale) {
    const explicit=sale?.functionalTotalCents??sale?.functional_total_cents;
    if(explicit!==null&&explicit!==undefined)return Number(explicit||0);
    return (sale?.referenceCurrency||sale?.currency||"USD")==="USD"?Number(sale?.totalRefCents??sale?.totalCents??0):0;
  }

  function saleFunctionalPaidCents(sale) {
    const payments=Array.isArray(sale?.payments)?sale.payments.filter(isActivePayment):[];
    if(payments.length)return payments.reduce((sum,payment)=>sum+Number(payment.functionalAmountCents??payment.functional_amount_cents??0),0);
    const legacyPaid=sale?.status==="confirmed"&&!["unpaid","partial"].includes(sale?.paymentStatus);
    return legacyPaid?saleFunctionalCents(sale):0;
  }

  function saleFunctionalBalanceCents(sale) {
    const explicit=sale?.outstandingFunctionalUsdCents??sale?.functionalBalanceCents??sale?.functional_balance_cents;
    if(explicit!==null&&explicit!==undefined)return Math.max(0,Number(explicit||0));
    return Math.max(0,saleFunctionalCents(sale)-saleFunctionalPaidCents(sale));
  }

  function readLocalSales() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SALES_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  async function loadSales() {
    try {
      if (localMode) {
        sales = readLocalSales();
        salesSummary = calculateSalesSummary(sales);
      } else {
        const payload = await apiFetch("/v1/admin/sales");
        sales = payload.items || [];
        const calculated=calculateSalesSummary(sales),summary=payload.summary||{};
        const backendBalances=summary.partialCount===undefined&&summary.pendingCount===undefined?calculated.pendingCount:Number(summary.partialCount||0)+Number(summary.pendingCount||0);
        salesSummary={todayCents:Number(summary.todayFunctionalUsdCents??summary.todayFunctionalCents??calculated.todayCents),monthCents:Number(summary.monthFunctionalUsdCents??summary.monthFunctionalCents??calculated.monthCents),yearCents:Number(summary.yearFunctionalUsdCents??summary.yearFunctionalCents??calculated.yearCents),allCents:Number(summary.allFunctionalUsdCents??summary.allFunctionalCents??calculated.allCents),confirmedCount:Number(summary.confirmedCount??calculated.confirmedCount),pendingCount:backendBalances};
      }
      renderSales();
      renderSalesSnapshot();
      renderDashboardOperations();
    } catch (error) {
      if (error.status === 401) showLogin("Tu sesión venció. Inicia sesión nuevamente.");
      else toast("No se pudo cargar el registro de ventas.");
    }
  }

  function renderSalesSnapshot() {
    $("#salesSnapshot").innerHTML = `<div><span>Valor vendido este mes · USD funcional</span><b>${escapeHtml(functionalMoney(salesSummary.monthCents))}</b></div><div><span>Ventas registradas</span><b>${Number(salesSummary.confirmedCount || 0)}</b></div><div><span>Con saldo por cobrar</span><b>${Number(salesSummary.pendingCount || 0)}</b></div><button type="button" data-view-link="sales">Ver ventas →</button>`;
    $("#salesSnapshot [data-view-link]").addEventListener("click", () => showView("sales"));
  }

  function filteredSales() {
    const query = String($("#saleSearch")?.value || "").trim().toLowerCase();
    const status = $("#saleStatusFilter")?.value || "all";
    const period = $("#salePeriodFilter")?.value || "all";
    const today = caracasDate();
    return sales.filter(sale => {
      const lines = saleLineItems(sale);
      const payments = Array.isArray(sale.payments) ? sale.payments : [];
      const haystack = `${sale.customerName || sale.customer?.name || ""} ${sale.customerPhone || sale.customer?.phone || ""} ${lines.map(item=>`${item.name} ${item.optionSummary}`).join(" ")} ${sale.itemsText || (typeof sale.items === "string" ? sale.items : "")} ${sale.notes || ""} ${sale.paymentMethod || ""} ${payments.map(item=>`${item.method} ${item.currency}`).join(" ")}`.toLowerCase();
      const periodMatch = period === "all" || (period === "today" && sale.soldAt === today) || (period === "month" && String(sale.soldAt).startsWith(today.slice(0, 7))) || (period === "year" && String(sale.soldAt).startsWith(today.slice(0, 4)));
      const effectiveStatus=["cancelled","void"].includes(sale.status)?"cancelled":["partial","unpaid"].includes(sale.paymentStatus)?"pending":sale.status;
      return (!query || haystack.includes(query)) && (status === "all" || effectiveStatus === status) && periodMatch;
    });
  }

  function renderSales() {
    if (!$("#salesStats")) return;
    const metrics = [[salesSummary.todayCents,"Valor vendido hoy"],[salesSummary.monthCents,"Vendido este mes"],[salesSummary.yearCents,"Vendido este año"],[salesSummary.allCents,"Ventas registradas"]];
    $("#salesStats").innerHTML = metrics.map(([value,label]) => `<article class="stat"><b>${escapeHtml(functionalMoney(value))}</b><span>${label} · USD funcional</span></article>`).join("");
    const statusLabels = {confirmed:"Confirmada",pending:"Pendiente",partial:"Pago parcial",cancelled:"Anulada",void:"Anulada"};
    const items = filteredSales();
    $("#salesList").innerHTML = items.length ? items.map(sale => {
      const lines = saleLineItems(sale);
      const payments = Array.isArray(sale.payments) ? sale.payments : [];
      const rawStatus = sale.status === "void" ? "cancelled" : sale.status;
      const status = rawStatus === "cancelled" ? "cancelled" : sale.paymentStatus === "partial" ? "partial" : sale.paymentStatus === "unpaid" ? "pending" : rawStatus;
      const paymentCopy = payments.length
        ? payments.map(payment => `<span class="payment-entry"><span class="badge">${escapeHtml(payment.method || "Pago")} · ${escapeHtml(payment.currency || "")} ${escapeHtml(formatMinorAmount(payment.amountMinor, payment.amountScale))}${escapeHtml(paymentRateCopy(payment))}</span>${payment.notes?`<small>${escapeHtml(payment.notes)}</small>`:""}</span>`).join("")
        : `<span class="badge">${escapeHtml(sale.paymentMethod || "Pago no detallado")}</span>`;
      const detail = lines.length ? lines.map(item=>`${item.quantity}× ${item.name}${item.optionSummary?` · ${item.optionSummary}`:""}`).join("; ") : String(sale.itemsText || sale.items || "Sin detalle de productos");
      const soldAt = sale.soldAt || sale.sold_at || caracasDate();
      const canAddPayment=status!=="cancelled"&&["partial","pending"].includes(status);
      return `<article class="sale-row ${status === "cancelled" ? "is-void" : ""}" data-sale-id="${escapeHtml(sale.id)}"><div class="sale-date"><b>${escapeHtml(new Date(`${soldAt}T12:00:00`).toLocaleDateString("es-VE",{day:"2-digit",month:"short"}))}</b><span>${escapeHtml(sale.channel || "")}</span></div>${imageStack(lines,"Productos de la venta")}<div class="sale-main"><h3>${escapeHtml(sale.customerName || sale.customer?.name || "Venta sin nombre")}</h3><p>${escapeHtml(detail)}</p><div class="sale-payment-summary">${paymentCopy}</div><small>${sale.notes ? escapeHtml(sale.notes) : "Movimiento con historial protegido"}</small></div><div class="sale-total"><b>${escapeHtml(centsMoney(sale.totalRefCents ?? sale.totalCents))}</b><small>Base ${escapeHtml(sale.referenceCurrency||sale.currency||"USD")}</small><span class="badge ${status === "confirmed" ? "green" : status === "cancelled" ? "red" : ""}">${statusLabels[status] || statusLabels[sale.paymentStatus] || "Pendiente"}</span></div><div class="row-actions">${canAddPayment?`<button type="button" data-add-sale-payment="${escapeHtml(sale.id)}" aria-label="Registrar abono">Abono</button>`:""}${status !== "cancelled" ? `<button type="button" data-void-sale="${escapeHtml(sale.id)}" aria-label="Anular venta">Anular</button>` : ""}</div></article>`;
    }).join("") : '<div class="empty-list">No hay ventas que coincidan con estos filtros.</div>';
  }

  function formatMinorAmount(value, scale = 2) {
    const digits = Math.max(0,Math.min(8,Number(scale || 2)));
    let minor;
    try { minor = BigInt(String(value || 0)); } catch { minor = 0n; }
    const negative = minor < 0n;
    if (negative) minor = -minor;
    const divisor = 10n ** BigInt(digits);
    const integer = minor / divisor;
    const fraction = String(minor % divisor).padStart(digits,"0").replace(/0+$/,"");
    const grouped = new Intl.NumberFormat(config.locale || "es-VE",{maximumFractionDigits:0}).format(integer);
    const separator = new Intl.NumberFormat(config.locale || "es-VE").format(1.1).replace(/1/g,"") || ",";
    return `${negative?"-":""}${grouped}${fraction ? `${separator}${fraction.padEnd(Math.min(2,digits),"0")}` : digits ? `${separator}00` : ""}`;
  }

  function decimalToMinor(value, scale = 2) {
    const normalized = String(value ?? "").trim().replace(",",".");
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
    const [whole,fraction=""] = normalized.split(".");
    const digits = Math.max(0,Math.min(8,Number(scale || 2)));
    if(fraction.length>digits)return null;
    const minor = (BigInt(whole) * (10n ** BigInt(digits))) + BigInt((fraction+"0".repeat(digits)).slice(0,digits) || "0");
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(minor);
  }

  function paymentCatalogItems() {
    const rows = [];
    state.products.filter(product => !product.deleted && product.visible !== false).forEach(product => {
      const sizes = (product.sizes || []).length ? product.sizes : [{name:"base",price:product.price}];
      const variants = (product.variants || []).length ? product.variants : [{name:"base"}];
      sizes.forEach(size => variants.forEach(variant => {
        const price = Number(size.price ?? product.price);
        if (!Number.isFinite(price)) return;
        const sizeSlug = size.name === "base" ? "base" : inventoryKeySlug(size.name);
        const variantSlug = variant.name === "base" ? "base" : inventoryKeySlug(variant.name);
        const detail = [size.name === "base" ? product.weight || "Presentación base" : size.name,variant.name === "base" ? "" : variant.name].filter(Boolean).join(" · ");
        rows.push({key:`product:${product.id}:${sizeSlug}:${variantSlug}`,productId:product.id,sku:`product:${product.id}:${sizeSlug}:${variantSlug}`,name:product.name,optionSummary:detail,image:product.image,unitPriceRefCents:Math.round(price*100),inventoryUnits:1});
      }));
    });
    const fonkies = state.builders?.fonkies;
    (fonkies?.visible === false ? [] : fonkies?.flavors || []).forEach(flavor => {
      const boxQuantity=Number(fonkies.minimumQuantity || 4);
      const unitPriceRefCents=Math.round(Number(fonkies.singlePrice || 0)*100);
      rows.push({key:`fonkies:${flavor.inventoryKey}:same`,sku:`builder:fonkies:${flavor.inventoryKey}`,name:"Fonkies",optionSummary:`Caja de ${boxQuantity} · ${flavor.name}`,image:flavor.image,unitPriceRefCents,inventoryUnits:boxQuantity,priceOverrideReason:`Precio automático del constructor Fonkies: caja de ${boxQuantity} unidades del sabor ${flavor.name}, REF ${formatMinorAmount(unitPriceRefCents,2)} según la configuración vigente.`});
    });
    const fomb = state.builders?.fomb;
    (fomb?.visible === false ? [] : fomb?.flavors || []).forEach(flavor => (fomb.sizes || []).forEach(size => {
      const boxQuantity=Number(size.quantity || 1);
      const unitPriceRefCents=Math.round(Number(size.price || 0)*100);
      rows.push({key:`fomb:${flavor.inventoryKey}:${boxQuantity}`,sku:`builder:fomb:${flavor.inventoryKey}`,name:"Fomb",optionSummary:`Caja de ${boxQuantity} · ${flavor.name}`,image:flavor.image,unitPriceRefCents,inventoryUnits:boxQuantity,priceOverrideReason:`Precio automático del constructor Fomb: caja de ${boxQuantity} unidades del sabor ${flavor.name}, REF ${formatMinorAmount(unitPriceRefCents,2)} según la configuración vigente.`});
    }));
    return rows;
  }

  function catalogItemByKey(key) {
    return paymentCatalogItems().find(item => item.key === key) || null;
  }

  function renderSaleCatalogPicker() {
    const container = $("#saleCatalogPicker");
    if (!container) return;
    const query = String($("#saleCatalogSearch")?.value || "").trim().toLowerCase();
    const rows = paymentCatalogItems().filter(item => !query || `${item.name} ${item.optionSummary}`.toLowerCase().includes(query));
    container.innerHTML = rows.length ? rows.map(item => {
      const quantity = Number(paymentCatalogSelection.get(item.key) || 0);
      return `<article class="catalog-item ${quantity ? "has-quantity" : ""}" data-catalog-key="${escapeHtml(item.key)}">${productThumb(item,item.name)}<div class="catalog-item-copy"><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.optionSummary || "")}</p><span class="catalog-item-price">${escapeHtml(centsMoney(item.unitPriceRefCents))}</span><div class="catalog-stepper"><button type="button" data-catalog-delta="-1" aria-label="Restar ${escapeHtml(item.name)}" ${quantity<1?"disabled":""}>−</button><output aria-label="${quantity} unidades seleccionadas">${quantity}</output><button type="button" data-catalog-delta="1" aria-label="Sumar ${escapeHtml(item.name)}">+</button></div></div></article>`;
    }).join("") : '<div class="empty-list">No hay productos que coincidan.</div>';
  }

  function selectedSaleItems() {
    return [...paymentCatalogSelection.entries()].filter(([,quantity]) => Number(quantity)>0).map(([key,quantity]) => {
      const item = catalogItemByKey(key);
      return item ? {...item,quantity:Number(quantity)} : null;
    }).filter(Boolean);
  }

  function computedSaleTotalCents() {
    return selectedSaleItems().reduce((sum,item)=>sum+(Number(item.unitPriceRefCents||0)*Number(item.quantity||0)),0);
  }

  function syncCatalogTotal() {
    if (paymentDialogMode !== "manual") return updatePaymentBalance();
    const total = computedSaleTotalCents();
    const input = $("#paymentForm").elements.total;
    if (total || !input.value) input.value = (total/100).toFixed(2);
    updatePaymentBalance();
  }

  function renderOrderPaymentItems(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    $("#orderPaymentItems").innerHTML = items.map(item=>`<div class="payment-summary-item">${productThumb(item,item.name)}<div><h4>${escapeHtml(item.name||"Producto")}</h4><small>${escapeHtml(item.optionSummary||"")}</small></div><b>${Math.max(1,Number(item.quantity||1))}×</b></div>`).join("") || `<div class="payment-summary-item">${productThumb({},"Producto")}<div><h4>Pedido ${escapeHtml(order?.orderCode||"")}</h4><small>Detalle histórico</small></div></div>`;
  }

  function paymentLineElements(line) {
    return {
      amount:$("[name='paidAmount']",line),currency:$("[name='paidCurrency']",line),method:$("[name='paymentMethod']",line),reference:$("[name='paymentReference']",line),notes:$("[name='paymentNotes']",line),
      basis:$("[name='rateBasis']",line),rate:$("[name='bcvRate']",line),valueDate:$("[name='rateValueDate']",line),sourceType:$("[name='rateSourceType']",line),reason:$("[name='manualRateReason']",line),status:$(".rate-status",line),bcvFields:$(".bcv-fields",line)
    };
  }

  function setPaymentLineCurrencyState(line) {
    const fields = paymentLineElements(line);
    const isVes = fields.currency.value === "VES";
    const isEur = fields.currency.value === "EUR";
    const needsRate = isVes || isEur;
    if(isEur)fields.basis.value="EUR";
    fields.bcvFields.hidden = !needsRate;
    [fields.rate,fields.valueDate,fields.sourceType].forEach(field => { field.required = needsRate;field.disabled=!needsRate; });
    fields.basis.required=needsRate;fields.basis.disabled=isEur||!needsRate;
    fields.reason.required = needsRate && fields.sourceType.value === "manual";
    fields.reason.closest("label").hidden = !needsRate || fields.sourceType.value !== "manual";
    fields.rate.readOnly = needsRate && fields.sourceType.value !== "manual";
    if (!needsRate) {
      delete line.dataset.exchangeRateId;
      delete line.dataset.exchangeRateSourceUrl;
    }
    updatePaymentBalance();
  }

  async function fetchExchangeRates(date, force = false) {
    if (!date) return null;
    if (!force && exchangeRateCache.has(date)) return exchangeRateCache.get(date);
    if (localMode) {
      const local = {date,rates:{USD:null,EUR:null}};
      exchangeRateCache.set(date,local);
      return local;
    }
    const payload = await apiFetch(`/v1/admin/exchange-rates?date=${encodeURIComponent(date)}`);
    exchangeRateCache.set(date,payload);
    return payload;
  }

  async function refreshPaymentLineRate(line, force = false) {
    const fields = paymentLineElements(line);
    if (fields.currency.value === "USD" || fields.sourceType.value === "manual") return;
    const date = $("#paymentForm").elements.soldAt.value;
    fields.status.classList.remove("is-error");
    fields.status.textContent = "Buscando la tasa oficial del BCV…";
    try {
      const payload = await fetchExchangeRates(date,force);
      const basis=fields.currency.value==="EUR"?"EUR":fields.basis.value;
      const rate = payload?.rates?.[basis] || null;
      if (!rate) throw new Error("No hay una tasa oficial disponible para esa fecha.");
      fields.rate.value = scaledRateToNumber(rate).toFixed(8).replace(/0+$/,"").replace(/\.$/,"");
      fields.valueDate.value = rate.valueDate || date;
      line.dataset.exchangeRateId = rate.id || "";
      line.dataset.exchangeRateSourceUrl = rate.sourceUrl || "https://www.bcv.org.ve/";
      fields.status.textContent = `BCV ${basis} · Fecha valor ${rate.valueDate || date}${fields.currency.value==="EUR"?" · el libro funcional usa también el USD de esa fecha":""}${rate.status && rate.status !== "official" ? ` · ${rate.status}` : ""}`;
      updatePaymentBalance();
    } catch (error) {
      fields.rate.value = "";
      fields.valueDate.value = date;
      delete line.dataset.exchangeRateId;
      fields.status.classList.add("is-error");
      fields.status.textContent = `${error.message || "No se pudo obtener la tasa."} Puedes cambiar Origen a carga manual; se exigirá un motivo.`;
      updatePaymentBalance();
    }
  }

  function addPaymentLine(seed = {}) {
    const fragment = $("#paymentLineTemplate").content.cloneNode(true);
    const line = fragment.querySelector(".payment-line");
    const fields = paymentLineElements(line);
    fields.amount.value = seed.amount ?? "";
    fields.currency.value = seed.currency || "VES";
    fields.method.value = seed.method || (fields.currency.value === "VES" ? "Pago Móvil" : "Efectivo");
    fields.reference.value = seed.reference || "";
    fields.notes.value = seed.notes || "";
    fields.basis.value = seed.rateBasis || "USD";
    fields.rate.value = seed.bcvRate || "";
    fields.valueDate.value = seed.rateValueDate || "";
    fields.sourceType.value = seed.rateSourceType || "BCV";
    const manualOption=fields.sourceType.querySelector('option[value="manual"]');
    if(manualOption)manualOption.disabled=currentSession?.role!=="owner";
    fields.reason.value = seed.manualRateReason || "";
    if (seed.exchangeRateId) line.dataset.exchangeRateId = seed.exchangeRateId;
    $("#paymentLines").append(line);
    setPaymentLineCurrencyState(line);
    if (fields.currency.value !== "USD" && !fields.rate.value) refreshPaymentLineRate(line);
    return line;
  }

  function paymentReferenceCents(line) {
    const fields = paymentLineElements(line);
    const amountMinor = decimalToMinor(fields.amount.value,2);
    if (!amountMinor) return 0;
    const referenceCurrency = $("#paymentForm").elements.referenceCurrency.value;
    if (fields.currency.value !== "VES") return fields.currency.value === referenceCurrency ? amountMinor : 0;
    if (fields.basis.value !== referenceCurrency) return 0;
    const rateScaled = decimalToMinor(fields.rate.value,8);
    if (!rateScaled) return 0;
    const reference = (BigInt(amountMinor) * 100000000n + (BigInt(rateScaled)/2n)) / BigInt(rateScaled);
    return reference > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(reference);
  }

  function updatePaymentBalance() {
    const form = $("#paymentForm");
    if (!form || !$("#paymentBalance")) return;
    const totalCents = Math.max(0,Math.round(Number(form.elements.total.value || 0)*100));
    const receivedCents = $$(".payment-line",form).reduce((sum,line)=>sum+paymentReferenceCents(line),0);
    const balanceCents = Math.max(0,totalCents-receivedCents);
    const overCents = Math.max(0,receivedCents-totalCents);
    const currencyMismatch = $$(".payment-line",form).some(line => { const fields=paymentLineElements(line); return fields.currency.value === "VES" ? fields.basis.value !== form.elements.referenceCurrency.value : fields.currency.value !== form.elements.referenceCurrency.value; });
    $("#paymentBalance").innerHTML = `<div><span>Total esperado</span><b>${escapeHtml(centsMoney(totalCents))}</b></div><div><span>Equivalente recibido</span><b>${escapeHtml(centsMoney(receivedCents))}</b></div><div class="${balanceCents?"has-balance":"is-complete"}"><span>${balanceCents?"Saldo pendiente":overCents?"Diferencia a revisar":"Pago completo"}</span><b>${escapeHtml(centsMoney(balanceCents || overCents))}</b></div><div class="payment-balance-note">${currencyMismatch ? "Corrige la moneda o la base BCV: todos los cobros deben coincidir con la moneda de referencia de esta venta." : "El equivalente usa la tasa congelada en cada cobro. No se recalculará con tasas futuras."}</div>`;
    const status = form.elements.status;
    if (status && paymentDialogMode === "order") status.value = "confirmed";
  }

  function resetPaymentDialog() {
    const form = $("#paymentForm");
    form.reset();
    form.elements.orderId.value = "";
    form.elements.saleId.value = "";
    form.elements.idempotencyKey.value = crypto.randomUUID();
    form.elements.expectedVersion.value = "";
    form.elements.soldAt.value = caracasDate();
    form.elements.referenceCurrency.value = "USD";
    form.elements.status.value = "confirmed";
    $("#soldAtLabelText").textContent = "Fecha de venta";
    $("#savePaymentButton").textContent = "Confirmar pago y venta";
    paymentCatalogSelection = new Map();
    activeOrderForPayment = null;
    $("#paymentLines").innerHTML = "";
    $("#orderPaymentItems").innerHTML = "";
  }

  function openPaymentDialog(order = null) {
    resetPaymentDialog();
    const form = $("#paymentForm");
    paymentDialogMode = order ? "order" : "manual";
    activeOrderForPayment = order;
    $("#paymentDialogTitle").textContent = order ? `Confirmar pago · ${order.orderCode}` : "Registrar venta";
    $("#paymentDialogDescription").textContent = order ? "Verifica el cliente, registra el dinero recibido y conserva la tasa usada antes de descontar el inventario." : "Selecciona los productos y guarda exactamente cómo pagó el cliente.";
    $("#soldAtLabelText").textContent = "Fecha de venta";
    $("#savePaymentButton").textContent = order ? "Confirmar pedido y cobro" : "Confirmar pago y venta";
    $("#orderPaymentItems").hidden = !order;
    $("#saleCatalogPicker").hidden = Boolean(order);
    $("#catalogSearchLabel").hidden = Boolean(order);
    $(".custom-sale-item").hidden = Boolean(order);
    form.elements.total.readOnly = Boolean(order);
    form.elements.status.disabled = Boolean(order);
    if (order) {
      form.elements.orderId.value = order.id;
      form.elements.expectedVersion.value = String(order.mutationVersion??0);
      form.elements.customerName.value = order.customerName || "";
      form.elements.customerPhone.value = order.customerPhone || "";
      form.elements.customerEmail.value = order.customerEmail || order.customer?.email || "";
      form.elements.customerAddress.value = order.customerAddress || order.customer?.address || order.customer?.defaultAddress || "";
      form.elements.customerNotes.value = order.customerNotes || order.customer?.internalNotes || "";
      form.elements.channel.value = order.channel || "WhatsApp";
      form.elements.orderReference.value = order.orderCode || "";
      form.elements.total.value = (Number(order.totalCents || 0)/100).toFixed(2);
      form.elements.notes.value = order.notes || "";
      renderOrderPaymentItems(order);
    } else {
      form.elements.total.value = "0.00";
      renderSaleCatalogPicker();
    }
    addPaymentLine();
    updatePaymentBalance();
    $("#paymentDialog").showModal();
  }

  function openSalePaymentDialog(sale) {
    resetPaymentDialog();
    const form=$("#paymentForm"),lines=saleLineItems(sale),total=Number(sale.totalRefCents??sale.totalCents??0),paid=Number(sale.paidRefCents??sale.paid_ref_cents??(sale.payments||[]).reduce((sum,payment)=>sum+Number(payment.referenceAmountCents??payment.reference_amount_cents??0),0)),balance=Math.max(0,Number(sale.balanceRefCents??sale.balance_ref_cents??(total-paid)));
    const linkedCustomer=customers.find(customer=>sale.customerId&&String(customer.id)===String(sale.customerId))||{};
    const customerProfile={...linkedCustomer,...(customerDetails.get(String(sale.customerId))?.customer||{}),...(sale.customer||{})};
    paymentDialogMode="sale-payment";form.elements.saleId.value=sale.id;form.elements.expectedVersion.value=String(sale.mutationVersion??0);form.elements.customerName.value=sale.customerName||customerProfile.name||"";form.elements.customerPhone.value=sale.customerPhone||customerProfile.phone||"";form.elements.customerEmail.value=sale.customerEmail||customerProfile.email||"";form.elements.customerAddress.value=sale.customerAddress||customerProfile.address||customerProfile.defaultAddress||"";form.elements.customerNotes.value=sale.customerNotes||customerProfile.notes||customerProfile.internalNotes||"";form.elements.channel.value=sale.channel||"WhatsApp";form.elements.orderReference.value=sale.orderCode||sale.orderReference||"";form.elements.referenceCurrency.value=sale.referenceCurrency||sale.currency||"USD";form.elements.total.value=(balance/100).toFixed(2);form.elements.total.readOnly=true;form.elements.status.value="confirmed";form.elements.status.disabled=true;
    $("#paymentDialogTitle").textContent="Registrar abono";$("#paymentDialogDescription").textContent=`Saldo por cobrar de la venta: ${centsMoney(balance)}. El nuevo cobro conservará su propia moneda y tasa.`;$("#soldAtLabelText").textContent="Fecha del cobro";$("#savePaymentButton").textContent="Registrar abono";$("#orderPaymentItems").hidden=false;$("#saleCatalogPicker").hidden=true;$("#catalogSearchLabel").hidden=true;$(".custom-sale-item").hidden=true;
    $("#orderPaymentItems").innerHTML=lines.map(item=>`<div class="payment-summary-item">${productThumb(item,item.name)}<div><h4>${escapeHtml(item.name)}</h4><small>${escapeHtml(item.optionSummary||"")}</small></div><b>${item.quantity}×</b></div>`).join("")||`<div class="payment-summary-item">${productThumb({},"Producto")}<div><h4>Venta registrada</h4><small>Detalle histórico</small></div></div>`;
    addPaymentLine({currency:form.elements.referenceCurrency.value,method:"Efectivo"});updatePaymentBalance();$("#paymentDialog").showModal();
  }

  function deriveLocalCustomers() {
    const groups = new Map();
    sales.filter(isCommittedSale).forEach(sale => {
      const phone = sale.customerPhone || sale.customer?.phone || "";
      const normalized = normalizedPhone(phone);
      const key = normalized || `sin-telefono:${sale.id}`;
      const current = groups.get(key) || {id:key,name:sale.customerName || sale.customer?.name || "Cliente sin nombre",phone,normalizedPhone:normalized,email:sale.customer?.email||"",defaultAddress:sale.customer?.address||sale.customer?.defaultAddress||"",internalNotes:sale.customer?.notes||sale.customer?.internalNotes||"",confirmedSalesCount:0,lifetimeFunctionalUsdCents:0,firstPurchaseAt:null,lastPurchaseAt:null,sales:[]};
      current.email=sale.customer?.email||current.email;
      current.defaultAddress=sale.customer?.address||sale.customer?.defaultAddress||current.defaultAddress;
      current.internalNotes=sale.customer?.notes||sale.customer?.internalNotes||current.internalNotes;
      current.confirmedSalesCount += 1;
      current.lifetimeFunctionalUsdCents += saleFunctionalCents(sale);
      current.firstPurchaseAt = !current.firstPurchaseAt || sale.soldAt < current.firstPurchaseAt ? sale.soldAt : current.firstPurchaseAt;
      current.lastPurchaseAt = !current.lastPurchaseAt || sale.soldAt > current.lastPurchaseAt ? sale.soldAt : current.lastPurchaseAt;
      current.sales.push(sale);
      groups.set(key,current);
    });
    return [...groups.values()].map(customer=>({...customer,averageTicketFunctionalUsdCents:customer.confirmedSalesCount?Math.round(customer.lifetimeFunctionalUsdCents/customer.confirmedSalesCount):0}));
  }

  function calculateCustomerSummary(items = customers) {
    return {
      total:items.length,
      recurrent:items.filter(item=>Number(item.confirmedSalesCount||0)>=2).length,
      newCustomers:items.filter(item=>Number(item.confirmedSalesCount||0)===1).length,
      withBalance:items.filter(item=>Number(item.outstandingFunctionalUsdCents||item.functionalBalanceCents||0)>0).length
    };
  }

  async function loadCustomers() {
    const openedIds=$$("#customersList .customer-row[open]").map(row=>row.dataset.customerId).filter(Boolean);
    customerDetails.clear();
    try {
      if (localMode) {
        customers = deriveLocalCustomers();
        customerSummary = calculateCustomerSummary();
      } else {
        const payload = await apiFetch("/v1/admin/customers?limit=250");
        customers = payload.items || [];
        customerSummary = {...calculateCustomerSummary(customers),...(payload.summary || {})};
      }
      renderCustomers();
      if(!localMode&&openedIds.length)await Promise.allSettled(openedIds.map(id=>loadCustomerDetail(id)));
    } catch (error) {
      if (error.status === 401) showLogin("Tu sesión venció.");
      else toast("No se pudieron cargar los clientes.");
    }
  }

  function customerSales(customer) {
    const detail = customerDetails.get(String(customer.id));
    if (detail?.sales) return detail.sales;
    if (Array.isArray(customer.sales)) return customer.sales;
    const phone = normalizedPhone(customer.phone || customer.normalizedPhone);
    return sales.filter(sale => (sale.customerId && String(sale.customerId) === String(customer.id)) || (phone && normalizedPhone(sale.customerPhone || sale.customer?.phone) === phone));
  }

  function filteredCustomers() {
    const query = String($("#customerSearch")?.value || "").trim().toLowerCase();
    const type = $("#customerTypeFilter")?.value || "all";
    return customers.filter(customer => {
      const count = Number(customer.confirmedSalesCount || 0);
      const balance = Number(customer.outstandingFunctionalUsdCents || customer.functionalBalanceCents || 0);
      const typeMatch = type === "all" || (type === "recurrent" && count >= 2) || (type === "new" && count === 1) || (type === "balance" && balance > 0);
      const detail=customerDetails.get(String(customer.id))?.customer||{};
      const searchable={...customer,...detail};
      return typeMatch && (!query || `${searchable.name||""} ${searchable.phone||""} ${searchable.normalizedPhone||""} ${searchable.email||""} ${searchable.defaultAddress||""} ${searchable.internalNotes||""}`.toLowerCase().includes(query));
    });
  }

  function renderCustomers() {
    if (!$("#customersList")) return;
    const opened = new Set($$("#customersList .customer-row[open]").map(row=>row.dataset.customerId));
    const summary = {...calculateCustomerSummary(customers),...customerSummary};
    $("#customerStats").innerHTML = [[summary.total||customers.length,"Clientes guardados"],[summary.recurrent||0,"Recurrentes"],[summary.newCustomers||0,"Con una compra"],[summary.withBalance||0,"Con saldo pendiente"]].map(([value,label])=>`<article class="stat"><b>${Number(value||0)}</b><span>${escapeHtml(label)}</span></article>`).join("");
    const items = filteredCustomers();
    $("#customersList").innerHTML = items.length ? items.map(customer => {
      const profile={...customer,...(customerDetails.get(String(customer.id))?.customer||{})};
      const history = customerSales(customer);
      const recentLines = history.flatMap(sale=>saleLineItems(sale)).slice(0,1);
      const count = Number(profile.confirmedSalesCount || history.filter(isCommittedSale).length || 0);
      const lifetime = Number(profile.lifetimeFunctionalUsdCents || history.filter(isCommittedSale).reduce((sum,sale)=>sum+saleFunctionalCents(sale),0));
      const average = Number(profile.averageTicketFunctionalUsdCents || (count ? Math.round(lifetime/count) : 0));
      const balance = Number(profile.outstandingFunctionalUsdCents??profile.functionalBalanceCents??history.filter(isCommittedSale).reduce((sum,sale)=>sum+saleFunctionalBalanceCents(sale),0));
      const collected = Number(profile.collectedFunctionalUsdCents??history.filter(isCommittedSale).reduce((sum,sale)=>sum+saleFunctionalPaidCents(sale),0));
      const purchaseRows = history.length ? history.slice(0,8).map(sale=>{
        const lines=saleLineItems(sale),first=lines[0]||{},soldAt=sale.soldAt||sale.sold_at||"";
        const paymentRows=(sale.payments||[]).filter(isActivePayment).map(payment=>escapeHtml(paymentHistoryCopy(payment))).join("<br>")||escapeHtml(sale.paymentMethod||"Pago no detallado");
        return `<div class="customer-purchase">${productThumb(first,first.name||"Producto comprado")}<div><h4>${escapeHtml(lines.map(item=>`${item.quantity}× ${item.name}`).join("; ")||"Venta registrada")}</h4><small>${escapeHtml(soldAt)}<br>${paymentRows}</small></div><b>${escapeHtml(centsMoney(sale.totalRefCents??sale.totalCents))} · ${escapeHtml(sale.referenceCurrency||sale.currency||"USD")}</b></div>`;
      }).join("") : '<div class="empty-list">Abre este perfil para consultar el historial completo.</div>';
      const contact=`<div class="customer-contact" aria-label="Datos guardados del cliente"><div class="customer-contact-item"><span>Email</span><b>${escapeHtml(profile.email||"No registrado")}</b></div><div class="customer-contact-item"><span>Dirección</span><b>${escapeHtml(profile.defaultAddress||profile.address||"No registrada")}</b></div><div class="customer-contact-item"><span>Notas internas</span><b>${escapeHtml(profile.internalNotes||profile.notes||"Sin notas")}</b></div></div>`;
      return `<details class="customer-row" data-customer-id="${escapeHtml(profile.id)}" ${opened.has(String(profile.id))?"open":""}><summary>${productThumb(recentLines[0]||{},profile.name||"Cliente")}<div class="customer-summary"><h3>${escapeHtml(profile.name||"Cliente sin nombre")}</h3><p>${escapeHtml(profile.phone||"Sin teléfono confirmado")}</p><div class="customer-kpis"><span class="badge ${count>=2?"green":""}">${count>=2?"Recurrente":`${count} compra${count===1?"":"s"}`}</span>${balance?'<span class="badge red">Saldo pendiente</span>':""}</div></div></summary><div class="customer-profile"><div class="customer-profile-grid"><div class="customer-kpi"><span>Compras confirmadas</span><b>${count}</b></div><div class="customer-kpi"><span>Valor vendido · USD</span><b>${escapeHtml(functionalMoney(lifetime))}</b></div><div class="customer-kpi"><span>Cobrado · USD</span><b>${escapeHtml(functionalMoney(collected))}</b></div><div class="customer-kpi"><span>Saldo pendiente · USD</span><b>${escapeHtml(functionalMoney(balance))}</b></div><div class="customer-kpi"><span>Ticket promedio · USD</span><b>${escapeHtml(functionalMoney(average))}</b></div><div class="customer-kpi"><span>Última compra</span><b>${escapeHtml(profile.lastPurchaseAt||"—")}</b></div></div>${contact}<div class="customer-history">${purchaseRows}</div></div></details>`;
    }).join("") : '<div class="empty-list">No hay clientes que coincidan. Se crean al confirmar ventas con teléfono.</div>';
  }

  async function loadCustomerDetail(id) {
    if (localMode || customerDetails.has(String(id))) return;
    try {
      const payload = await apiFetch(`/v1/admin/customers/${encodeURIComponent(id)}`);
      customerDetails.set(String(id),payload);
      const customer=customers.find(item=>String(item.id)===String(id));
      if(customer&&Array.isArray(payload.sales)){
        if(payload.customer)Object.assign(customer,payload.customer);
        const committed=payload.sales.filter(isCommittedSale);
        customer.collectedFunctionalUsdCents=committed.reduce((sum,sale)=>sum+saleFunctionalPaidCents(sale),0);
        customer.outstandingFunctionalUsdCents=committed.reduce((sum,sale)=>sum+saleFunctionalBalanceCents(sale),0);
        customerSummary=calculateCustomerSummary(customers);
      }
      renderCustomers();
      const row = $(`#customersList [data-customer-id="${CSS.escape(String(id))}"]`);
      if (row) row.open = true;
    } catch (error) { toast(error.message || "No se pudo cargar el historial del cliente."); }
  }

  function readLocalExpenses() {
    try { const parsed=JSON.parse(localStorage.getItem(EXPENSES_STORAGE_KEY)||"[]"); return Array.isArray(parsed)?parsed:[]; } catch { return []; }
  }

  function calculatedAccounting(range=accountingRange.from?accountingRange:defaultAccountingRange()) {
    const paymentFunctionalCents=payment=>Number(payment.functionalAmountCents??payment.functional_amount_cents??((payment.currency||"USD")==="USD"?(payment.amountMinor??payment.amount_minor??0):0));
    const expenseFunctionalAmount=expense=>Number(expense.functionalAmountCents??expense.functional_amount_cents??((expense.currency||"USD")==="USD"?(expense.amountMinor??expense.amount_minor??0):0));
    const voidDate=record=>String(record.voidDate||record.void_date||record.voidedAt||record.voided_at||"").slice(0,10);
    const voidedBy=(record,to)=>isVoidedStatus(record.status)&&(!voidDate(record)||!to||voidDate(record)<=to);
    const paymentDate=(payment,sale)=>payment.paymentDate||payment.payment_date||payment.confirmedAt||payment.confirmed_at||sale.soldAt||sale.sold_at;
    const paymentsForSale=sale=>Array.isArray(sale.payments)&&sale.payments.length?sale.payments:[{currency:sale.currency||"USD",method:sale.paymentMethod||"Sin detalle",amountMinor:sale.totalRefCents??sale.totalCents,amountScale:2,functionalAmountCents:saleFunctionalPaidCents(sale),paymentDate:sale.soldAt||sale.sold_at}];
    const ledgerSales=sales.filter(sale=>isCommittedSale(sale)||(isVoidedStatus(sale.status)&&paymentsForSale(sale).some(payment=>isActivePayment(payment)&&paymentFunctionalCents(payment)!==0)));
    const periodPayments=[];
    ledgerSales.forEach(sale=>paymentsForSale(sale).filter(isActivePayment).filter(payment=>dateInRange(paymentDate(payment,sale),range)).forEach(payment=>periodPayments.push(payment)));
    const collectedFunctionalCents = periodPayments.reduce((sum,payment)=>sum+paymentFunctionalCents(payment),0);
    const cashInflowFunctionalCents=collectedFunctionalCents;
    let incomeFunctionalCents=0,receivableFunctionalCents=0,customerCreditFunctionalCents=0;
    ledgerSales.forEach(sale=>{
      const soldAt=sale.soldAt||sale.sold_at;
      const saleTotal=saleFunctionalCents(sale);
      if(dateInRange(soldAt,range))incomeFunctionalCents+=saleTotal;
      if(isVoidedStatus(sale.status)&&dateInRange(voidDate(sale),range))incomeFunctionalCents-=saleTotal;
      if(!soldAt||range.to&&String(soldAt).slice(0,10)>range.to)return;
      const paidAsOf=paymentsForSale(sale).filter(isActivePayment).filter(payment=>!range.to||String(paymentDate(payment,sale)||"").slice(0,10)<=range.to).reduce((sum,payment)=>sum+paymentFunctionalCents(payment),0);
      if(voidedBy(sale,range.to)){customerCreditFunctionalCents+=paidAsOf;return;}
      const balance=saleTotal-paidAsOf;
      if(balance>=0)receivableFunctionalCents+=balance;else customerCreditFunctionalCents-=balance;
    });
    let expenseFunctionalCents=0;
    expenses.forEach(expense=>{
      const amount=expenseFunctionalAmount(expense),spentAt=expense.expenseDate||expense.expense_date||expense.spentAt;
      if(dateInRange(spentAt,range))expenseFunctionalCents+=amount;
      if(isVoidedStatus(expense.status)&&dateInRange(voidDate(expense),range))expenseFunctionalCents-=amount;
    });
    const cashOutflowFunctionalCents=expenses.filter(expense=>dateInRange(expense.expenseDate||expense.expense_date||expense.spentAt,range)).reduce((sum,expense)=>sum+expenseFunctionalAmount(expense),0);
    const cashPaymentsAsOf=ledgerSales.flatMap(sale=>paymentsForSale(sale).filter(isActivePayment).map(payment=>({payment,sale}))).filter(({payment,sale})=>!range.to||String(paymentDate(payment,sale)||"").slice(0,10)<=range.to).reduce((sum,{payment})=>sum+paymentFunctionalCents(payment),0);
    const cashExpensesAsOf=expenses.filter(expense=>!range.to||String(expense.expenseDate||expense.expense_date||expense.spentAt||"").slice(0,10)<=range.to).reduce((sum,expense)=>sum+expenseFunctionalAmount(expense),0);
    const recoverableFunctionalCents=expenses.filter(expense=>voidedBy(expense,range.to)).reduce((sum,expense)=>sum+expenseFunctionalAmount(expense),0);
    const byCurrency = new Map();
    const byMethod = new Map();
    periodPayments.forEach(payment=>{
      const currency=payment.currency||"USD",method=payment.method||payment.paymentMethod||"Sin detalle";
      const amountMinor=Number(payment.amountMinor??payment.amount_minor??0),amountScale=Number(payment.amountScale??payment.amount_scale??2);
      const current=byCurrency.get(currency)||{currency,amountMinor:0,amountScale};current.amountMinor+=amountMinor;byCurrency.set(currency,current);
      byMethod.set(method,(byMethod.get(method)||0)+paymentFunctionalCents(payment));
    });
    return {from:range.from,to:range.to,collectedFunctionalCents,cashInflowFunctionalCents,cashOutflowFunctionalCents,netCashFunctionalCents:cashInflowFunctionalCents-cashOutflowFunctionalCents,cashBalanceFunctionalCents:cashPaymentsAsOf-cashExpensesAsOf,receivableFunctionalCents,customerCreditFunctionalCents,recoverableFunctionalCents,incomeFunctionalCents,expenseFunctionalCents,netIncomeFunctionalCents:incomeFunctionalCents-expenseFunctionalCents,paymentsByCurrency:[...byCurrency.values()],paymentsByMethod:[...byMethod].map(([method,functionalAmountCents])=>({method,functionalAmountCents}))};
  }

  function normalizeAccountingSummary(payload) {
    const fallback=calculatedAccounting(),source=payload?.summary||payload||{},period=source.period||{},balancesAsOf=source.balancesAsOf||{};
    const numeric=(...values)=>{for(const value of values){if(value===null||value===undefined||value==="")continue;const parsed=Number(value);if(Number.isFinite(parsed))return parsed;}return 0;};
    const hasCollectionRows=Array.isArray(source.collectionsByCurrencyAndMethod),collectionRows=hasCollectionRows?source.collectionsByCurrencyAndMethod:[];
    const currencyMap=new Map(),methodMap=new Map();
    collectionRows.forEach(row=>{
      const currency=String(row.currency||"USD"),method=String(row.method||"Sin detalle"),amountMinor=Number(row.amountMinor??row.amount_minor??0),amountScale=Number(row.amountScale??row.amount_scale??2),functional=Number(row.functionalAmountCents??row.functional_amount_cents??0);
      const current=currencyMap.get(currency)||{currency,amountMinor:0,amountScale};current.amountMinor+=amountMinor;currencyMap.set(currency,current);
      methodMap.set(method,(methodMap.get(method)||0)+functional);
    });
    const collectedFunctionalCents=numeric(source.collectedFunctionalCents,period.collectedFunctionalCents,hasCollectionRows?collectionRows.reduce((sum,row)=>sum+Number(row.functionalAmountCents??row.functional_amount_cents??0),0):undefined,fallback.collectedFunctionalCents);
    const receivableAccount=(source.accounts||[]).find(account=>account.id==="asset-receivable-usd"||account.code==="1100");
    const receivableFunctionalCents=numeric(source.receivableFunctionalCents,balancesAsOf.receivableFunctionalCents,receivableAccount?.balanceFunctionalCents,fallback.receivableFunctionalCents);
    const cashInflowFunctionalCents=numeric(source.cashInflowFunctionalCents,period.cashInflowFunctionalCents,fallback.cashInflowFunctionalCents);
    const cashOutflowFunctionalCents=numeric(source.cashOutflowFunctionalCents,period.cashOutflowFunctionalCents,fallback.cashOutflowFunctionalCents);
    const netCashFunctionalCents=numeric(source.netCashFunctionalCents,period.netCashFunctionalCents,fallback.netCashFunctionalCents);
    const incomeFunctionalCents=numeric(source.incomeFunctionalCents,period.incomeFunctionalCents,fallback.incomeFunctionalCents);
    const expenseFunctionalCents=numeric(source.expenseFunctionalCents,period.expenseFunctionalCents,fallback.expenseFunctionalCents);
    const netIncomeFunctionalCents=numeric(source.netIncomeFunctionalCents,source.netFunctionalCents,period.netIncomeFunctionalCents,period.netFunctionalCents,fallback.netIncomeFunctionalCents);
    const cashBalanceFunctionalCents=numeric(source.cashBalanceFunctionalCents,balancesAsOf.cashBalanceFunctionalCents,fallback.cashBalanceFunctionalCents);
    const customerCreditFunctionalCents=numeric(source.customerCreditFunctionalCents,balancesAsOf.customerCreditFunctionalCents,fallback.customerCreditFunctionalCents);
    const recoverableFunctionalCents=numeric(source.recoverableFunctionalCents,balancesAsOf.recoverableFunctionalCents,fallback.recoverableFunctionalCents);
    const paymentsByCurrency=Array.isArray(source.paymentsByCurrency)?source.paymentsByCurrency:hasCollectionRows?[...currencyMap.values()]:fallback.paymentsByCurrency;
    const paymentsByMethod=Array.isArray(source.paymentsByMethod)?source.paymentsByMethod:hasCollectionRows?[...methodMap].map(([method,functionalAmountCents])=>({method,functionalAmountCents})):fallback.paymentsByMethod;
    return {...fallback,...source,from:source.from??period.from??fallback.from,to:source.to??period.to??fallback.to,collectedFunctionalCents,receivableFunctionalCents,cashInflowFunctionalCents,cashOutflowFunctionalCents,netCashFunctionalCents,cashBalanceFunctionalCents,customerCreditFunctionalCents,recoverableFunctionalCents,incomeFunctionalCents,expenseFunctionalCents,netIncomeFunctionalCents,paymentsByCurrency,paymentsByMethod};
  }

  async function loadAccounting() {
    const errorBox=$("#accountingError");
    if(errorBox){errorBox.hidden=true;errorBox.textContent="";}
    try {
      if(!accountingRange.from||!accountingRange.to)accountingRange=defaultAccountingRange();
      const rangeForm=$("#accountingRangeForm");
      if(rangeForm){rangeForm.elements.from.value=accountingRange.from;rangeForm.elements.to.value=accountingRange.to;}
      if (localMode) {
        expenses=readLocalExpenses();
        accountingSummary=calculatedAccounting();
      } else {
        const query=new URLSearchParams(accountingRange).toString();
        const [summaryPayload,expensePayload]=await Promise.all([apiFetch(`/v1/admin/accounting/summary?${query}`),apiFetch(`/v1/admin/expenses?${query}`)]);
        expenses=expensePayload.items||[];
        accountingSummary=normalizeAccountingSummary(summaryPayload);
      }
      renderAccounting();
    } catch (error) {
      const message=error.status===401?"Tu sesión venció.":`No se pudo cargar la contabilidad. ${error.message||"Intenta nuevamente."}`;
      if(errorBox){errorBox.textContent=message;errorBox.hidden=false;}
      if (error.status===401) showLogin(message); else toast(message);
    }
  }

  function renderAccounting() {
    if (!$("#accountingStats")) return;
    const summary={...calculatedAccounting(),...accountingSummary};
    const from=summary.from||accountingRange.from,to=summary.to||accountingRange.to;
    $("#accountingPeriodLabel").textContent=`Movimientos: ${from} al ${to} · Saldos acumulados al cierre: ${to}`;
    const cards=[
      {metric:"collections-period",scope:"period",value:Number(summary.collectedFunctionalCents??0),label:"Cobros de clientes · período · USD funcional"},
      {metric:"cash-outflow-period",scope:"period",value:Number(summary.cashOutflowFunctionalCents??0),label:"Salidas reales de caja · período · USD funcional"},
      {metric:"net-cash-period",scope:"period",value:Number(summary.netCashFunctionalCents??0),label:"Flujo neto de caja · período · USD funcional"},
      {metric:"receivable-as-of",scope:"as-of",value:Number(summary.receivableFunctionalCents??0),label:`Saldo por cobrar · al cierre ${to} · USD funcional`}
    ];
    $("#accountingStats").innerHTML=cards.map(card=>`<article class="stat accounting-stat" data-accounting-metric="${card.metric}" data-accounting-scope="${card.scope}"><b>${escapeHtml(functionalMoney(card.value))}</b><span>${escapeHtml(card.label)}</span></article>`).join("");
    const currencyRows=summary.paymentsByCurrency||summary.byCurrency||[];
    const methodRows=summary.paymentsByMethod||summary.byMethod||[];
    const breakdown=[...currencyRows.map(row=>({label:`Cobrado en ${row.currency}`,detail:"Monto nominal recibido",amount:`${row.currency}\u00a0${formatMinorAmount(row.amountMinor??row.amount_minor,row.amountScale??row.amount_scale??2)}`})),...methodRows.map(row=>({label:row.method||row.paymentMethod,detail:"Equivalente funcional guardado",amount:functionalMoney(row.functionalAmountCents??row.functional_amount_cents??0)}))];
    $("#paymentBreakdown").innerHTML=breakdown.length?breakdown.map(row=>`<div class="breakdown-row"><div><b>${escapeHtml(row.label)}</b><span>${escapeHtml(row.detail)}</span></div><strong>${escapeHtml(row.amount)}</strong></div>`).join(""):'<div class="empty-list">Aún no hay cobros confirmados.</div>';
    const visibleExpenses=expenses.filter(expense=>dateInRange(expense.expenseDate||expense.expense_date||expense.spentAt,{from,to}));
    $("#expenseList").innerHTML=visibleExpenses.length?visibleExpenses.map(expense=>{const status=expense.status||"confirmed",voided=isVoidedStatus(status);const amountMinor=expense.amountMinor??expense.amount_minor??0;const amountScale=expense.amountScale??expense.amount_scale??2;return `<article class="expense-row ${voided?"is-void":""}" data-expense-id="${escapeHtml(expense.id)}"><div><h3>${escapeHtml(expense.description||"Gasto")}</h3><p>${escapeHtml(expense.category||"Otro")} · ${escapeHtml(expense.method||"")}</p><small>${escapeHtml(expense.expenseDate||expense.expense_date||expense.spentAt||"")}${expense.reference?` · Ref. ${escapeHtml(expense.reference)}`:""}</small></div><div class="expense-amount"><b>${escapeHtml(expense.currency||"")}\u00a0${escapeHtml(formatMinorAmount(amountMinor,amountScale))}</b><span class="badge ${voided?"red":""}">${voided?"Anulado":"Registrado"}</span></div>${!voided?`<button type="button" data-void-expense="${escapeHtml(expense.id)}" aria-label="Anular gasto">×</button>`:""}</article>`;}).join(""):`<div class="empty-list">No hay gastos entre ${escapeHtml(from)} y ${escapeHtml(to)}.</div>`;
  }

  function setExpenseRateState() {
    const form=$("#expenseForm"),currency=form.elements.currency.value,needsRate=currency==="VES"||currency==="EUR",isManual=form.elements.rateSourceType.value==="manual";
    if(currency==="EUR")form.elements.rateBasis.value="EUR";
    [form.elements.bcvRate,form.elements.rateValueDate,form.elements.rateSourceType].forEach(field=>{field.disabled=!needsRate;field.required=needsRate;});
    form.elements.rateBasis.disabled=!needsRate||currency==="EUR";form.elements.rateBasis.required=needsRate;
    form.elements.bcvRate.readOnly=needsRate&&!isManual;
    $("#expenseManualRateReason").hidden=!needsRate||!isManual;
    form.elements.manualRateReason.required=needsRate&&isManual;
    if(!needsRate){delete form.dataset.exchangeRateId;$("#expenseRateStatus").textContent="Este movimiento ya está expresado en la moneda funcional USD.";}
  }

  async function refreshExpenseRate(force=false) {
    const form=$("#expenseForm");
    const currency=form.elements.currency.value;
    if(currency==="USD"||form.elements.rateSourceType.value==="manual")return;
    const status=$("#expenseRateStatus");status.classList.remove("is-error");status.textContent="Buscando la tasa oficial del BCV…";
    try{
      const basis=currency==="EUR"?"EUR":form.elements.rateBasis.value;
      const payload=await fetchExchangeRates(form.elements.spentAt.value,force),rate=payload?.rates?.[basis];
      if(!rate)throw new Error("No hay una tasa oficial disponible para esa fecha.");
      form.elements.bcvRate.value=scaledRateToNumber(rate).toFixed(8).replace(/0+$/,"").replace(/\.$/,"");form.elements.rateValueDate.value=rate.valueDate||form.elements.spentAt.value;form.dataset.exchangeRateId=rate.id||"";form.dataset.exchangeRateSourceUrl=rate.sourceUrl||"https://www.bcv.org.ve/";status.textContent=`BCV ${basis} · Fecha valor ${rate.valueDate||form.elements.spentAt.value}${currency==="EUR"?" · el libro usa también el USD de esa fecha":""}`;
    }catch(error){form.elements.bcvRate.value="";form.elements.rateValueDate.value=form.elements.spentAt.value;delete form.dataset.exchangeRateId;status.classList.add("is-error");status.textContent=`${error.message} La propietaria puede justificar una tasa manual.`;}
  }

  function openExpenseDialog() {
    const form=$("#expenseForm");form.reset();form.elements.idempotencyKey.value=crypto.randomUUID();form.elements.spentAt.value=caracasDate();form.elements.currency.value="VES";form.elements.rateBasis.value="USD";form.elements.rateSourceType.value="BCV";const manual=form.elements.rateSourceType.querySelector('option[value="manual"]');if(manual)manual.disabled=currentSession?.role!=="owner";delete form.dataset.exchangeRateId;setExpenseRateState();refreshExpenseRate();$("#expenseDialog").showModal();
  }

  function expensePayloadFromForm() {
    const form=$("#expenseForm"),amountMinor=decimalToMinor(form.elements.amount.value,2),currency=form.elements.currency.value,rateBasis=currency==="EUR"?"EUR":form.elements.rateBasis.value,referenceCurrency=currency==="VES"?rateBasis:(currency==="EUR"?"EUR":"USD");
    if(!form.elements.spentAt.value||!String(form.elements.description.value||"").trim()||!amountMinor)throw new Error("Indica fecha, descripción y un monto válido.");
    const idempotencyKey=String(form.elements.idempotencyKey.value||"").trim();
    if(idempotencyKey.length<16)throw new Error("Cierra y vuelve a abrir el formulario para generar una clave segura del gasto.");
    const payload={idempotencyKey,expenseDate:form.elements.spentAt.value,category:form.elements.category.value,description:String(form.elements.description.value).trim(),amountMinor,amountScale:2,currency,referenceCurrency,method:form.elements.method.value,reference:String(form.elements.reference.value||"").trim(),notes:String(form.elements.notes.value||"").trim()};
    if(currency==="USD"){payload.referenceAmountCents=amountMinor;payload.functionalAmountCents=amountMinor;}
    else{
      const rateScaled=decimalToMinor(form.elements.bcvRate.value,8);if(!rateScaled||!form.elements.rateValueDate.value)throw new Error(`Completa la tasa BCV y su fecha valor para este gasto en ${currency}.`);
      payload.rateBasis=rateBasis;payload.exchangeRateValueDate=form.elements.rateValueDate.value;
      if(currency==="EUR")payload.referenceAmountCents=amountMinor;
      else{const reference=(BigInt(amountMinor)*100000000n+(BigInt(rateScaled)/2n))/BigInt(rateScaled);if(reference>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("El monto es demasiado grande.");payload.referenceAmountCents=Number(reference);if(rateBasis==="USD")payload.functionalAmountCents=Number(reference);}
      if(form.elements.rateSourceType.value==="manual"){
        if(currentSession?.role!=="owner")throw new Error("Solo la propietaria puede cargar tasas manuales.");const reason=String(form.elements.manualRateReason.value||"").trim();if(reason.length<8)throw new Error("Explica con al menos 8 caracteres por qué se usó una tasa manual.");Object.assign(payload,{exchangeRateScaled:rateScaled,exchangeRateSourceUrl:form.dataset.exchangeRateSourceUrl||"https://www.bcv.org.ve/",manualRateReason:reason});
      }else{if(!form.dataset.exchangeRateId)throw new Error("No hay una tasa oficial identificada para este gasto.");payload.exchangeRateId=form.dataset.exchangeRateId;}
    }
    return payload;
  }

  function renderStats() {
    const products = state.products.filter(product => !product.deleted);
    const stats = [
      [products.length,"Productos","all"],
      [products.filter(product => product.status !== "sold-out").length,"Disponibles","available"],
      [products.filter(product => product.promo).length,"Promociones","promo"],
      [products.filter(product => product.immediate).length,"Stock de hoy","immediate"]
    ];
    $("#stats").innerHTML = stats.map(([value,label,filter]) => `<button type="button" class="stat stat-link" data-dashboard-filter="${filter}" aria-label="Ver ${label.toLowerCase()}"><b>${value}</b><span>${label}</span><i aria-hidden="true">Ver →</i></button>`).join("");
    renderRecentActivity();
    renderDashboardOperations();
  }

  function openProductFilter(status = "all") {
    $("#productSearch").value = "";
    $("#categoryFilter").value = "all";
    $("#statusFilter").value = status;
    showView("products");
    renderProducts();
  }

  function productBadges(product) {
    const badges = [];
    badges.push(`<span class="badge ${product.status === "sold-out" ? "red" : "green"}">${product.status === "sold-out" ? "Agotado" : "Disponible"}</span>`);
    if (product.visible === false) badges.push('<span class="badge red">Oculto</span>');
    if (product.allowPreorder) badges.push('<span class="badge">Pre-order</span>');
    if (product.isNew) badges.push('<span class="badge">Nuevo</span>');
    if (product.promo) badges.push('<span class="badge">Promo</span>');
    if (product.immediate) badges.push('<span class="badge">Stock de hoy</span>');
    if (product.glutenFree) badges.push('<span class="badge">Sin gluten</span>');
    if (product.sugarFree) badges.push('<span class="badge">Sin azúcar</span>');
    if (product.lactoseFree) badges.push('<span class="badge">Sin lactosa</span>');
    if (product.eggFree) badges.push('<span class="badge">Sin huevo</span>');
    return badges.join("");
  }

  function filteredProducts() {
    const query = $("#productSearch").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const status = $("#statusFilter").value;
    return state.products.filter(product => !product.deleted).filter(product => {
      const textMatches = !query || `${product.name} ${product.description} ${product.ingredients}`.toLowerCase().includes(query);
      const categoryMatches = category === "all" || product.category === category;
      const statusMatches = status === "all" || product.status === status || (status === "hidden" && product.visible === false) || (status === "preorder" && product.allowPreorder) || (status === "new" && product.isNew) || (status === "promo" && product.promo) || (status === "immediate" && product.immediate);
      return textMatches && categoryMatches && statusMatches;
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    const labels = {all:"Todos los productos",available:"Disponibles","sold-out":"Agotados",hidden:"Ocultos",preorder:"Pre-order",new:"Nuevos",promo:"Promociones",immediate:"Stock de hoy"};
    const activeStatus = $("#statusFilter").value;
    $("#productFilterSummary").innerHTML = `<div><strong>${escapeHtml(labels[activeStatus] || "Resultados")}</strong><span>${products.length} producto${products.length === 1 ? "" : "s"}</span></div>${activeStatus !== "all" ? '<button type="button" data-clear-product-filter>Ver todos</button>' : ""}`;
    $("#productList").innerHTML = products.length ? products.map(product => `<article class="product-row" data-product-id="${escapeHtml(product.id)}">${productThumb(product,product.name)}<div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || "Sin descripción")}</p></div><div class="badges">${productBadges(product)}<span class="badge">${escapeHtml(money(product.price))}</span></div><div class="row-actions"><button data-edit="${escapeHtml(product.id)}" aria-label="Editar ${escapeHtml(product.name)}">✎</button><button data-delete="${escapeHtml(product.id)}" aria-label="Eliminar ${escapeHtml(product.name)}">×</button></div></article>`).join("") : '<div class="empty-list">No hay productos que coincidan con estos filtros.</div>';
  }

  function parseVariants(value) {
    return value.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [name,status="available",quantity=""] = line.split("|").map(part => part.trim());
      return {name,status:status === "sold-out" ? "sold-out" : "available",stockQuantity:quantity === "" ? null : Math.max(0, Number(quantity))};
    });
  }

  function parseSizes(value) {
    return value.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [name,price,status="available",quantity=""] = line.split("|").map(part => part.trim());
      return {name,price:Number(price),status:status === "sold-out" ? "sold-out" : "available",stockQuantity:quantity === "" ? null : Math.max(0, Number(quantity))};
    }).filter(size => size.name && Number.isFinite(size.price));
  }

  const productWeightUnitLabels = {mg:"MG",g:"G",kg:"KG",ml:"ML",l:"L"};

  function parseProductWeight(value) {
    const text = String(value || "").trim();
    if (!text) return {enabled:false,value:"",unit:"g",custom:""};
    const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(mg|g|kg|ml|l|lt|litros?)$/i);
    if (!match) return {enabled:true,value:"",unit:"custom",custom:text};
    const unit = /^(?:l|lt|litros?)$/i.test(match[2]) ? "l" : match[2].toLowerCase();
    return {enabled:true,value:match[1].replace(",","."),unit,custom:""};
  }

  function productWeightFromForm(form) {
    if (!form.elements.weightEnabled.checked) return {value:""};
    const unit = String(form.elements.weightUnit.value || "g");
    if (unit === "custom") {
      const custom = String(form.elements.weightCustom.value || "").trim();
      return custom ? {value:custom} : {error:"Escribe la presentación especial que quieres mostrar."};
    }
    const rawValue = String(form.elements.weightValue.value || "").trim().replace(",",".");
    if (!/^\d+(?:\.\d{1,3})?$/.test(rawValue)) return {error:"Indica una cantidad válida con hasta tres decimales."};
    const amount = Number(rawValue);
    if (!Number.isFinite(amount) || amount <= 0) return {error:"La cantidad del producto debe ser mayor que cero."};
    const normalizedAmount = String(amount).replace(".",",");
    return {value:`${normalizedAmount} ${productWeightUnitLabels[unit] || unit.toUpperCase()}`};
  }

  function syncProductWeightForm(form) {
    const enabled = form.elements.weightEnabled.checked;
    const custom = form.elements.weightUnit.value === "custom";
    const fields = form.querySelector("[data-weight-fields]");
    const customField = form.querySelector("[data-weight-custom]");
    const preview = form.querySelector("[data-weight-preview]");
    const fieldset = form.querySelector(".weight-fieldset");
    fields.hidden = !enabled;
    customField.hidden = !enabled || !custom;
    form.elements.weightValue.disabled = !enabled || custom;
    form.elements.weightCustom.disabled = !enabled || !custom;
    fieldset.classList.toggle("is-disabled", !enabled);
    if (!enabled) preview.textContent = "No se mostrará peso ni volumen en la tienda.";
    else {
      const result = productWeightFromForm(form);
      preview.textContent = result.error ? "Completa la presentación para ver cómo aparecerá." : `Vista previa: ${result.value}`;
    }
  }

  function openProduct(id) {
    const product = id ? state.products.find(item => item.id === id) : {id:"",name:"",brand:"",category:"cakes",price:"",description:"",ingredients:"",weight:"",availabilityLabel:"",minimumBusinessDays:0,status:"available",stockQuantity:null,visible:true,isNew:false,promo:false,immediate:false,allowPreorder:false,requiresElectricity:false,glutenFree:false,sugarFree:false,lactoseFree:false,eggFree:false,customLabels:[],image:"",variants:[],sizes:[]};
    if (!product) return;
    const form = $("#productForm");
    $("#dialogTitle").textContent = id ? "Editar producto" : "Nuevo producto";
    form.elements.originalId.value = id || "";
    ["id","name","brand","category","description","ingredients","availabilityLabel","status","image"].forEach(field => { form.elements[field].value = product[field] ?? ""; });
    const weight = parseProductWeight(product.weight);
    form.elements.weightEnabled.checked = weight.enabled;
    form.elements.weightValue.value = weight.value;
    form.elements.weightUnit.value = weight.unit;
    form.elements.weightCustom.value = weight.custom;
    syncProductWeightForm(form);
    form.elements.price.value = product.price ?? "";
    form.elements.minimumBusinessDays.value = product.minimumBusinessDays ?? 0;
    form.elements.stockQuantity.value = product.stockQuantity ?? "";
    form.elements.visible.checked = product.visible !== false;
    form.elements.isNew.checked = Boolean(product.isNew);
    form.elements.promo.checked = Boolean(product.promo);
    form.elements.immediate.checked = Boolean(product.immediate);
    form.elements.allowPreorder.checked = Boolean(product.allowPreorder);
    form.elements.requiresElectricity.checked = Boolean(product.requiresElectricity);
    form.elements.glutenFree.checked = Boolean(product.glutenFree);
    form.elements.sugarFree.checked = Boolean(product.sugarFree);
    form.elements.lactoseFree.checked = Boolean(product.lactoseFree);
    form.elements.eggFree.checked = Boolean(product.eggFree);
    form.elements.customLabels.value = (product.customLabels || []).join("\n");
    form.elements.variants.value = (product.variants || []).map(item => `${item.name} | ${item.status || "available"}${item.stockQuantity === null || item.stockQuantity === undefined ? "" : ` | ${item.stockQuantity}`}`).join("\n");
    form.elements.sizes.value = (product.sizes || []).map(item => `${item.name} | ${item.price} | ${item.status || "available"}${item.stockQuantity === null || item.stockQuantity === undefined ? "" : ` | ${item.stockQuantity}`}`).join("\n");
    $("#productImagePreview").style.backgroundImage = `url("${absoluteImage(product.image)}")`;
    $("#productDialog").showModal();
  }

  async function optimizeImage(file) {
    if (!file) return "";
    const source = await createImageBitmap(file);
    const max = 1200;
    const scale = Math.min(1, max / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    canvas.getContext("2d").drawImage(source,0,0,canvas.width,canvas.height);
    source.close();
    return await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",.82));
  }

  async function uploadImage(file) {
    const blob = await optimizeImage(file);
    if (!blob) return "";
    if (localMode) return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    const body = new FormData();
    body.append("image", blob, "fontana-producto.jpg");
    const payload = await apiFetch("/v1/admin/images", {method:"POST",body});
    return /^https?:\/\//.test(payload.url || "") ? payload.url : `${apiBase}${payload.url}`;
  }

  function inventoryForBuilderFlavor(kind, flavor) {
    const key = flavor.inventoryKey || inventoryKeySlug(flavor.name);
    const sku = `builder:${kind}:${key}`;
    return inventory.find(item => item.sku === sku)
      || inventory.find(item => item.kind === kind && item.inventoryKey === key)
      || null;
  }

  function builderFlavorInventoryBadge(kind, flavor) {
    if (!inventoryLoaded) return '<span class="badge">Cargando inventario…</span>';
    const item = inventoryForBuilderFlavor(kind, flavor);
    if (!item) return '<span class="badge">Pendiente de publicar</span>';
    if (!item.trackStock) return '<span class="badge" title="No se limita ni se promete entrega inmediata">Control inactivo</span>';
    const available = Math.max(0, Number(item.available || 0));
    const reserved = Math.max(0, Number(item.reserved || 0));
    const cssClass = available > 0 ? "green" : "red";
    return `<span class="badge ${cssClass}" title="${available} disponibles y ${reserved} reservadas">${available} disp. · ${reserved} reserv.</span>`;
  }

  function openBuilderInventory(kind) {
    $("#inventorySearch").value = "";
    $("#inventoryKindFilter").value = kind;
    $("#inventoryStateFilter").value = "all";
    showView("inventory");
    renderInventory();
  }

  function renderBuilder(kind) {
    const builder = state.builders[kind];
    const title = kind === "fonkies" ? "Fonkies" : "Fomb";
    const pricing = kind === "fonkies"
      ? `<label>Precio REF · 4 iguales<input data-builder-field="singlePrice" type="number" min="0" step=".01" value="${builder.singlePrice}"></label><label>Precio REF · 4 mixtas<input data-builder-field="mixedPrice" type="number" min="0" step=".01" value="${builder.mixedPrice}"></label><label>Precio extra REF<input data-builder-field="extraPrice" type="number" min="0" step=".01" value="${builder.extraPrice}"></label><label>Mínimo<input data-builder-field="minimumQuantity" type="number" min="1" value="${builder.minimumQuantity}"></label>`
      : `<label>Precio REF · caja de 4<input data-builder-size="0" data-size-field="price" type="number" min="0" step=".01" value="${builder.sizes[0]?.price ?? 15}"></label><label>Precio REF · caja de 12<input data-builder-size="1" data-size-field="price" type="number" min="0" step=".01" value="${builder.sizes[1]?.price ?? 30}"></label><label>Precio extra REF<input data-builder-field="extraPrice" type="number" min="0" step=".01" value="${builder.extraPrice}"></label>`;
    const availability = builder.visible === false ? "Oculto" : builder.status === "sold-out" ? "Pre-Order manual" : "Inventario por sabor";
    const flavorRows = builder.flavors.map((flavor,index) => `<div class="flavor-row" data-inventory-key="${escapeHtml(flavor.inventoryKey)}">${productThumb(flavor,`${title} · ${flavor.name}`)}<div class="flavor-copy"><div class="flavor-title"><h3>${escapeHtml(flavor.name)}</h3>${builderFlavorInventoryBadge(kind, flavor)}</div><p>${escapeHtml(flavor.ingredients)}</p></div><div class="row-actions"><button data-edit-flavor="${kind}:${index}" aria-label="Editar sabor">✎</button><button data-delete-flavor="${kind}:${index}" aria-label="Eliminar sabor">×</button></div></div>`).join("");
    $(`#${kind}Editor`).innerHTML = `<article class="builder-card" data-builder="${kind}"><details class="builder-settings"><summary><span><b>Configuración general</b><small>Precios, sellos y pausa manual</small></span><span class="builder-state">${availability}</span></summary><div class="builder-form">${pricing}<label class="span-2">Disponibilidad manual<select data-builder-field="status"><option value="available" ${builder.status !== "sold-out" ? "selected" : ""}>Normal · manda el inventario por sabor</option><option value="sold-out" ${builder.status === "sold-out" ? "selected" : ""}>Pausar todo · ofrecer Pre-Order</option></select><small>La pausa manual afecta todos los sabores. Las cantidades reales se cambian únicamente en Inventario.</small></label><label class="switch"><input data-builder-field="visible" type="checkbox" ${builder.visible !== false ? "checked" : ""}><span>Visible en la tienda</span></label><label class="switch"><input data-builder-field="isNew" type="checkbox" ${builder.isNew ? "checked" : ""}><span>Etiqueta Nuevo</span></label><label class="switch"><input data-builder-field="promo" type="checkbox" ${builder.promo ? "checked" : ""}><span>Promoción del día</span></label><label class="switch"><input data-builder-field="glutenFree" type="checkbox" ${builder.glutenFree ? "checked" : ""}><span>Mostrar sello Sin gluten</span></label><label class="switch"><input data-builder-field="sugarFree" type="checkbox" ${builder.sugarFree ? "checked" : ""}><span>Mostrar sello Sin azúcar</span></label><label class="switch"><input data-builder-field="lactoseFree" type="checkbox" ${builder.lactoseFree ? "checked" : ""}><span>Mostrar sello Sin lactosa</span></label></div></details><div class="panel-head builder-flavor-head"><div><span class="eyebrow">${builder.flavors.length} sabores</span><h2>Sabores de ${title}</h2></div><div><button class="ghost" type="button" data-builder-inventory="${kind}">Ver inventario</button> <button class="ghost" type="button" data-add-flavor="${kind}">+ Agregar sabor</button></div></div><div class="flavor-admin-list">${flavorRows}</div><div class="builder-actions"><button class="primary" data-save-builder="${kind}" aria-label="Guardar ${title}">Guardar y publicar ${title}</button></div></article>`;
    $(".builder-form", $(`#${kind}Editor`)).insertAdjacentHTML("beforeend", `<label class="switch"><input data-builder-field="eggFree" type="checkbox" ${builder.eggFree ? "checked" : ""}><span>Mostrar sello Sin huevo</span></label><label class="switch"><input data-builder-field="requiresElectricity" type="checkbox" ${builder.requiresElectricity ? "checked" : ""}><span>Requiere electricidad para producirse</span></label>`);
  }

  function openFlavor(kind,index) {
    const flavor = Number.isInteger(index) ? state.builders[kind].flavors[index] : {name:"",ingredients:"",image:"",status:"available"};
    const form = $("#flavorForm");
    form.elements.builder.value = kind;
    form.elements.index.value = Number.isInteger(index) ? index : "";
    ["name","ingredients","image","status"].forEach(field => { form.elements[field].value = flavor[field] || ""; });
    $("#flavorDialogTitle").textContent = Number.isInteger(index) ? "Editar sabor" : "Nuevo sabor";
    $("#flavorImagePreview").style.backgroundImage = `url("${absoluteImage(flavor.image)}")`;
    $("#flavorDialog").showModal();
  }

  async function loadSecurity() {
    if (localMode) {
      $("#passkeyList").innerHTML = '<div class="security-empty">Face ID se configura únicamente en el panel publicado.</div>';
      $("#userList").innerHTML = '<div class="security-empty">Los usuarios reales se administran desde la base de datos publicada.</div>';
      $("#newUserForm").hidden = false;
      return;
    }
    try {
      const [passkeys, users] = await Promise.all([apiFetch("/v1/admin/passkeys"), apiFetch("/v1/admin/users")]);
      $("#passkeyList").innerHTML = passkeys.items.length ? passkeys.items.map(item => `<div class="credential-row"><div><h3>${escapeHtml(item.label)}</h3><p>Creado ${escapeHtml(new Date(item.createdAt).toLocaleDateString("es-VE"))}${item.lastUsedAt ? ` · Usado ${escapeHtml(new Date(item.lastUsedAt).toLocaleDateString("es-VE"))}` : ""}</p></div><button class="danger compact" type="button" data-delete-passkey="${escapeHtml(item.id)}">Eliminar</button></div>`).join("") : '<div class="security-empty">Todavía no agregaste un acceso con Face ID a tu cuenta.</div>';
      $("#userList").innerHTML = users.items.map(user => `<div class="user-row"><div><h3>${escapeHtml(user.displayName || user.username)} ${user.username === users.currentUser ? '<span class="badge green">Tú</span>' : ""}</h3><p>@${escapeHtml(user.username)} · ${user.role === "owner" ? "Propietario" : "Administrador"} · ${Number(user.passkeyCount || 0)} ${Number(user.passkeyCount || 0) === 1 ? "acceso" : "accesos"} con Face ID</p></div>${users.canManageUsers && user.username !== users.currentUser && user.role !== "owner" && Number(user.active) === 1 ? `<button class="danger compact" type="button" data-deactivate-user="${escapeHtml(user.username)}">Desactivar</button>` : `<span class="badge ${Number(user.active) === 1 ? "green" : "red"}">${Number(user.active) === 1 ? "Activo" : "Desactivado"}</span>`}</div>`).join("");
      $("#newUserForm").hidden = !users.canManageUsers;
      $("#usersPanel").classList.toggle("read-only", !users.canManageUsers);
    } catch (error) {
      if (error.status === 401) showLogin("Tu sesión venció. Inicia sesión nuevamente.");
      else toast("No se pudo cargar la seguridad del panel.");
    }
  }

  async function registerPasskey() {
    if (localMode) return toast("Abre el panel publicado para activar Face ID.");
    if (!window.PublicKeyCredential || !navigator.credentials) return toast("Este dispositivo no admite Face ID para sitios web.");
    const button = $("#registerPasskeyButton");
    button.disabled = true;
    try {
      const payload = await apiFetch("/v1/admin/passkeys/options", { method:"POST", body:"{}" });
      const credential = await navigator.credentials.create({ publicKey: registrationOptionsForBrowser(payload.publicKey) });
      if (!credential) throw new Error("No se completó Face ID.");
      await apiFetch("/v1/admin/passkeys/verify", { method:"POST", body:JSON.stringify({ challengeId:payload.challengeId, label:`Face ID · ${navigator.platform || "dispositivo"}`, response:publicKeyCredentialToJSON(credential) }) });
      toast("Face ID quedó activado para tu usuario.");
      await loadSecurity();
    } catch (error) {
      toast(error.name === "NotAllowedError" ? "Cancelaste Face ID o se agotó el tiempo." : error.message || "No se pudo activar Face ID.");
    } finally {
      button.disabled = false;
    }
  }

  async function loginWithPasskey() {
    if (localMode) {
      $("#loginStatus").textContent = "Face ID se prueba únicamente en el panel publicado.";
      return;
    }
    const username = $("#loginUsername").value.trim() || localStorage.getItem(LAST_USERNAME_KEY) || "";
    if (!window.PublicKeyCredential || !navigator.credentials) {
      $("#loginStatus").textContent = "Este navegador no admite Face ID para sitios web.";
      return;
    }
    const button = $("#passkeyLoginButton");
    button.disabled = true;
    try {
      const payload = await apiFetch("/v1/auth/passkey/options", { method:"POST", body:JSON.stringify({username}) });
      const credential = await navigator.credentials.get({ publicKey:authenticationOptionsForBrowser(payload.publicKey) });
      if (!credential) throw new Error("No se completó Face ID.");
      const verifiedSession = await apiFetch("/v1/auth/passkey/verify", { method:"POST", body:JSON.stringify({ username, challengeId:payload.challengeId, response:publicKeyCredentialToJSON(credential) }) });
      if (!verifiedSession?.ok || (username && verifiedSession.username !== username)) throw new Error("Face ID no pudo verificarse.");
      currentSession = verifiedSession;
      localStorage.setItem(LAST_USERNAME_KEY, verifiedSession.username);
      $("#loginUsername").value = verifiedSession.username;
      await loadRemoteState();
      await enterPanel();
      toast(`Bienvenido, ${currentSession.username}.`);
    } catch (error) {
      $("#loginStatus").textContent = error.name === "NotAllowedError" ? "Cancelaste Face ID o se agotó el tiempo." : error.message || "No se pudo iniciar con Face ID.";
    } finally {
      button.disabled = false;
    }
  }

  function renderAll() {
    renderElectricityControl();
    renderStats();
    renderProducts();
    renderBuilder("fonkies");
    renderBuilder("fomb");
  }

  $("#loginButton").addEventListener("click", async () => {
    const button = $("#loginButton");
    button.disabled = true;
    try {
      if (localMode) {
        state = readState();
      } else {
        const username = $("#loginUsername").value.trim();
        const password = $("#loginPassword").value;
        if (!username || !password) throw new Error("Escribe el usuario y la contraseña.");
        currentSession = await apiFetch("/v1/auth/login", {method:"POST",body:JSON.stringify({username,password})});
        localStorage.setItem(LAST_USERNAME_KEY, currentSession.username);
        await loadRemoteState();
      }
      await enterPanel();
    } catch (error) {
      $("#loginStatus").textContent = error.status === 401 ? "Usuario o contraseña incorrectos." : error.message === "API_NOT_CONFIGURED" ? "La API todavía no está configurada." : error.message;
    } finally { button.disabled = false; }
  });
  $("#passkeyLoginButton").addEventListener("click", loginWithPasskey);
  $("#registerPasskeyButton").addEventListener("click", registerPasskey);
  $("#adminMenuButton").addEventListener("click", event => { event.stopPropagation(); toggleAdminMenu(); });
  $("#adminMenu").addEventListener("click", event => {
    const button = event.target.closest("[data-menu-view]");
    if (button) showView(button.dataset.menuView);
  });
  document.addEventListener("click", event => { if (!event.target.closest("#adminMenu") && !event.target.closest("#adminMenuButton")) closeAdminMenu(); });
  ["#loginUsername", "#loginPassword"].forEach(selector => $(selector).addEventListener("keydown", event => { if (event.key === "Enter") $("#loginButton").click(); }));
  $("#logoutButton").addEventListener("click", async () => {
    if (!localMode) await apiFetch("/v1/auth/logout", {method:"POST",body:"{}"}).catch(() => {});
    showLogin("Sesión cerrada.");
  });
  $("#newUserForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (localMode) return toast("Crea usuarios desde el panel publicado.");
    const form = event.currentTarget;
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await apiFetch("/v1/admin/users", { method:"POST", body:JSON.stringify({ displayName:data.get("displayName"), username:data.get("username"), password:data.get("password") }) });
      form.reset();
      toast("Usuario creado. Ya puede iniciar sesión con su propia cuenta.");
      await loadSecurity();
    } catch (error) {
      toast(error.message || "No se pudo crear el usuario.");
    } finally { button.disabled = false; }
  });
  $("#passkeyList").addEventListener("click", async event => {
    const button = event.target.closest("[data-delete-passkey]");
    if (!button || !confirm("¿Eliminar este acceso con Face ID?")) return;
    try {
      await apiFetch(`/v1/admin/passkeys/${encodeURIComponent(button.dataset.deletePasskey)}`, { method:"DELETE" });
      toast("Acceso con Face ID eliminado.");
      await loadSecurity();
    } catch (error) { toast(error.message || "No se pudo eliminar."); }
  });
  $("#userList").addEventListener("click", async event => {
    const button = event.target.closest("[data-deactivate-user]");
    if (!button || !confirm(`¿Desactivar el acceso de ${button.dataset.deactivateUser}?`)) return;
    try {
      await apiFetch(`/v1/admin/users/${encodeURIComponent(button.dataset.deactivateUser)}`, { method:"DELETE" });
      toast("Usuario desactivado y sesiones cerradas.");
      await loadSecurity();
    } catch (error) { toast(error.message || "No se pudo desactivar."); }
  });
  $$(".nav-item").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener("click", () => showView(button.dataset.viewLink)));
  $("#stats").addEventListener("click", event => {
    const button = event.target.closest("[data-dashboard-filter]");
    if (button) openProductFilter(button.dataset.dashboardFilter);
  });
  $("#productFilterSummary").addEventListener("click", event => {
    if (event.target.closest("[data-clear-product-filter]")) openProductFilter("all");
  });
  $("#attentionGrid").addEventListener("click", event => {
    const button = event.target.closest("[data-attention-action]");
    if (!button) return;
    const action = button.dataset.attentionAction;
    if (action === "reservations") showView("orders");
    else if (action === "pending-sales") { $("#saleStatusFilter").value = "pending"; showView("sales"); }
    else {
      $("#inventorySearch").value = "";
      $("#inventoryKindFilter").value = "all";
      $("#inventoryStateFilter").value = action === "low-stock" ? "low" : "soldout";
      showView("inventory");
    }
  });
  $("#stockDayToggle").addEventListener("click", toggleStockDay);
  $("#electricityToggle").addEventListener("click", toggleElectricity);
  $$('[data-action="new-product"]').forEach(button => button.addEventListener("click", () => openProduct()));
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
  $("#saveAll").addEventListener("click", () => saveState());
  ["#productSearch","#categoryFilter","#statusFilter"].forEach(selector => $(selector).addEventListener("input", renderProducts));
  ["#saleSearch","#saleStatusFilter","#salePeriodFilter"].forEach(selector => $(selector).addEventListener("input", renderSales));
  ["#customerSearch","#customerTypeFilter"].forEach(selector => $(selector).addEventListener("input", renderCustomers));
  ["#inventorySearch","#inventoryKindFilter","#inventoryStateFilter"].forEach(selector => $(selector).addEventListener("input", renderInventory));
  ["#orderSearch","#orderStatusFilter"].forEach(selector => $(selector).addEventListener("input", renderOrders));
  $("#orderStats").addEventListener("click", event => {
    const button = event.target.closest("[data-order-filter]");
    if (button) openOrderFilter(button.dataset.orderFilter);
  });
  ["#activitySearch","#activityTypeFilter"].forEach(selector => $(selector).addEventListener("input", renderActivity));
  $("#refreshInventoryButton").addEventListener("click", loadInventory);
  $("#refreshOrdersButton").addEventListener("click", loadOrders);
  $("#refreshActivityButton").addEventListener("click", loadActivity);
  $("#refreshCustomersButton").addEventListener("click", loadCustomers);
  $("#refreshAccountingButton").addEventListener("click", loadAccounting);
  $("#accountingRangeForm").addEventListener("submit",event=>{
    event.preventDefault();
    const form=event.currentTarget,from=form.elements.from.value,to=form.elements.to.value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return toast("Selecciona un período contable válido.");
    accountingRange={from,to};
    loadAccounting();
  });
  document.addEventListener("error", event => {
    const image=event.target.closest?.("img[data-product-image]");
    if(!image || image.dataset.fallbackApplied==="true")return;
    image.dataset.fallbackApplied="true";image.classList.add("is-fallback");image.src=image.dataset.fallbackSrc||FALLBACK_IMAGE;
  },true);
  $("#customersList").addEventListener("toggle",event=>{const row=event.target.closest?.(".customer-row");if(row?.open)loadCustomerDetail(row.dataset.customerId);},true);
  $("#inventoryList").addEventListener("input", event => {
    const input=event.target.closest("[data-stock-value]");
    if(!input || input.value === "") return;
    const row=input.closest("[data-sku]");
    const control=$("[data-track-stock]",row);
    if(control) control.checked=true;
  });
  $("#inventoryList").addEventListener("click", async event => {
    const deltaButton=event.target.closest("[data-stock-delta]");
    const button=event.target.closest("[data-save-stock]") || deltaButton;
    if (!button) return;
    const row=button.closest("[data-sku]");
    const input=$("[data-stock-value]",row);
    const delta=Number(deltaButton?.dataset.stockDelta||0);
    if(deltaButton) input.value=String(Math.max(Number(input.min||0),Number(input.value||0)+delta));
    const onHand=Number(input.value);
    const minimum=Number(input.min||0);
    if(!Number.isInteger(onHand)||onHand<minimum){
      toast(minimum>0?`La cantidad debe ser un número entero igual o mayor que ${minimum}, porque hay unidades reservadas.`:"Escribe una cantidad entera igual o mayor que cero.");
      input.focus();
      return;
    }
    const payload={onHand,trackStock:onHand>0 || $("[data-track-stock]",row).checked};
    button.disabled=true;
    try {
      if (localMode) {
        const item=inventory.find(entry=>entry.sku===row.dataset.sku);
        if(item){
          item.onHand=payload.onHand;
          item.available=Math.max(0,payload.onHand-Number(item.reserved||0));
          item.trackStock=payload.trackStock;
          if(item.kind === "fonkies" || item.kind === "fomb"){
            const builder=state.builders?.[item.kind];
            const inventoryKey=String(item.inventoryKey || item.sku.split(":").pop() || "");
            const flavor=builder?.flavors?.find(entry=>entry.inventoryKey===inventoryKey)
              || builder?.flavors?.find(entry=>entry.name===item.optionSummary);
            if(flavor){
              flavor.stockQuantity=payload.trackStock ? payload.onHand : null;
            }
          }
          state.updatedAt=new Date().toISOString();
          localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
          inventorySummary=calculateInventorySummary();
        }
      } else await apiFetch(`/v1/admin/inventory/${encodeURIComponent(row.dataset.sku)}`,{method:"PUT",body:JSON.stringify({...payload,note:deltaButton?`Ajuste rápido ${delta>0?"+":""}${delta}`:"Cantidad escrita manualmente desde el panel"})});
      toast(deltaButton?(delta>0?"Se sumó una unidad.":"Se restó una unidad."):"Cantidad actualizada para todos los clientes.");
      if(localMode){renderInventory();renderDashboardOperations();renderBuilder("fonkies");renderBuilder("fomb");}else await Promise.all([loadInventory(),loadActivity()]);
    } catch(error){toast(error.message||"No se pudo actualizar la cantidad.");}
    finally{button.disabled=false;}
  });
  function paymentPayloadFromForm() {
    const form=$("#paymentForm");
    const totalRefCents=decimalToMinor(form.elements.total.value,2);
    if (totalRefCents===null || totalRefCents<0) throw new Error("Indica un monto total válido.");
    const customer={name:String(form.elements.customerName.value||"").trim(),phone:String(form.elements.customerPhone.value||"").trim(),email:String(form.elements.customerEmail.value||"").trim(),address:String(form.elements.customerAddress.value||"").trim(),notes:String(form.elements.customerNotes.value||"").trim()};
    if(customer.email&&!form.elements.customerEmail.validity.valid)throw new Error("Revisa el email del cliente.");
    const phoneKey=normalizedPhone(customer.phone);
    const referenceCurrency=form.elements.referenceCurrency.value;
    const payments=[];
    $$(".payment-line",form).forEach(line=>{
      const fields=paymentLineElements(line);
      if (!String(fields.amount.value||"").trim()) return;
      const amountMinor=decimalToMinor(fields.amount.value,2);
      if (!amountMinor) throw new Error("Cada cobro debe tener un monto mayor que cero.");
      if (!["VES","USD","EUR"].includes(fields.currency.value)) throw new Error("Selecciona una moneda válida.");
      if (fields.currency.value!=="VES" && fields.currency.value!==referenceCurrency) throw new Error(`Un pago en ${fields.currency.value} no puede conciliarse con una venta basada en ${referenceCurrency} sin una tasa cruzada. Usa la misma moneda de referencia.`);
      const referenceAmountCents=paymentReferenceCents(line);
      if(!referenceAmountCents)throw new Error("No se pudo convertir este cobro a la moneda de referencia. Revisa la moneda y la tasa.");
      const payment={amountMinor,amountScale:2,currency:fields.currency.value,method:fields.method.value,referenceAmountCents,reference:String(fields.reference.value||"").trim(),notes:String(fields.notes.value||"").trim()};
      if(referenceCurrency==="USD")payment.functionalAmountCents=referenceAmountCents;
      if (fields.currency.value==="VES"||fields.currency.value==="EUR") {
        const expectedBasis=fields.currency.value==="EUR"?"EUR":referenceCurrency;
        if (fields.basis.value!==expectedBasis) throw new Error(`La base BCV debe ser ${expectedBasis}, igual que la moneda de referencia de la venta.`);
        if (!fields.valueDate.value || !fields.rate.value) throw new Error(`Completa la tasa BCV y su fecha valor para el cobro en ${fields.currency.value}.`);
        payment.rateBasis=expectedBasis;
        payment.exchangeRateValueDate=fields.valueDate.value;
        if (fields.sourceType.value==="manual") {
          if (currentSession?.role!=="owner") throw new Error("Solo la propietaria puede confirmar una tasa manual.");
          const reason=String(fields.reason.value||"").trim();
          if (reason.length<8) throw new Error("Explica con al menos 8 caracteres por qué fue necesario introducir la tasa manual.");
          const exchangeRateScaled=decimalToMinor(fields.rate.value,8);
          if (!exchangeRateScaled) throw new Error("La tasa manual no es válida.");
          Object.assign(payment,{rateBasis:expectedBasis,exchangeRateScaled,exchangeRateValueDate:fields.valueDate.value,exchangeRateSourceUrl:line.dataset.exchangeRateSourceUrl||"https://www.bcv.org.ve/",manualRateReason:reason});
        } else {
          if (!line.dataset.exchangeRateId) throw new Error("No hay una tasa oficial identificada. Vuelve a buscarla o usa una carga manual autorizada.");
          payment.exchangeRateId=line.dataset.exchangeRateId;
        }
      }
      payments.push(payment);
    });
    const requiresCustomer=payments.length||form.elements.status.value==="confirmed";
    const hasCustomerData=Object.values(customer).some(Boolean);
    if(requiresCustomer&&(!customer.name||phoneKey.length<10||phoneKey.length>15))throw new Error("Para confirmar una venta o guardar un cobro, confirma nombre y teléfono válido del cliente.");
    if(!requiresCustomer&&hasCustomerData&&(!customer.name||phoneKey.length<10||phoneKey.length>15))throw new Error("Guarda nombre y teléfono juntos, o deja todos los datos del cliente vacíos mientras la venta siga pendiente.");
    if(form.elements.status.value==="confirmed"&&!payments.length)throw new Error("Una venta confirmada debe incluir al menos un cobro. Usa Pendiente de cobro si todavía no pagó.");
    const paidRefCents=payments.reduce((sum,payment)=>sum+Number(payment.referenceAmountCents||0),0);
    const custom=String(form.elements.customItems.value||"").trim();
    const items=selectedSaleItems().map(item=>({productId:item.productId||undefined,sku:item.sku||undefined,name:item.name,optionSummary:item.optionSummary,imageUrl:item.image||undefined,quantity:item.quantity,inventoryUnits:item.sku?[{sku:item.sku,quantity:Number(item.inventoryUnits||1)*Number(item.quantity||1)}]:[],unitPriceRefCents:item.unitPriceRefCents,priceOverrideReason:item.priceOverrideReason||undefined}));
    const selectedTotal=items.reduce((sum,item)=>sum+(item.unitPriceRefCents*item.quantity),0);
    if (paymentDialogMode==="manual" && !items.length && !custom) throw new Error("Selecciona al menos un producto del catálogo.");
    if (totalRefCents<selectedTotal) throw new Error("El total no puede ser menor que los productos seleccionados.");
    if (paymentDialogMode==="manual"&&(custom || totalRefCents>selectedTotal)) items.push({name:custom||"Ajuste de venta",optionSummary:"Detalle personalizado",imageUrl:"assets/fontana-seal-transparent.png",quantity:1,inventoryUnits:[],skipInventory:true,unitPriceRefCents:totalRefCents-selectedTotal});
    return {idempotencyKey:form.elements.idempotencyKey.value,soldAt:form.elements.soldAt.value,channel:form.elements.channel.value,customer,items,payments,notes:String(form.elements.notes.value||"").trim(),referenceCurrency,totalRefCents,paidRefCents,status:form.elements.status.value};
  }

  $("#ordersList").addEventListener("click", async event => {
    const button=event.target.closest("[data-order-action]");
    if(!button)return;
    const action=button.dataset.orderAction;
    const order=orders.find(item=>String(item.id)===String(button.dataset.orderId));
    if(action==="confirm") return openPaymentDialog(order);
    if(action==="cancel"&&!confirm("¿Cancelar el pedido y devolver el stock reservado? El historial del pedido se conservará."))return;
    button.disabled=true;
    try{await apiFetch(`/v1/admin/orders/${encodeURIComponent(button.dataset.orderId)}/${action}`,{method:"POST",body:JSON.stringify({expectedVersion:Number(order?.mutationVersion??0)})});toast(action==="cancel"?"Reserva cancelada y stock devuelto.":"Reserva extendida 30 minutos.");await Promise.all([loadOrders(),loadInventory(),loadActivity()]);}
    catch(error){if(error.code==="stale_state"){toast("Este pedido cambió en otro dispositivo. Ya mostramos su versión más reciente.");await loadOrders();}else toast(error.message||"No se pudo procesar el pedido.");}
    finally{button.disabled=false;}
  });
  $("#newSaleButton").addEventListener("click", () => openPaymentDialog());

  $("#saleCatalogSearch").addEventListener("input",renderSaleCatalogPicker);
  $("#saleCatalogPicker").addEventListener("click",event=>{
    const button=event.target.closest("[data-catalog-delta]");if(!button)return;
    const card=button.closest("[data-catalog-key]"),key=card.dataset.catalogKey,delta=Number(button.dataset.catalogDelta||0);
    paymentCatalogSelection.set(key,Math.max(0,Number(paymentCatalogSelection.get(key)||0)+delta));
    if(!paymentCatalogSelection.get(key))paymentCatalogSelection.delete(key);
    renderSaleCatalogPicker();syncCatalogTotal();
  });
  $("[data-add-payment-line]").addEventListener("click",()=>addPaymentLine({currency:$("#paymentForm").elements.referenceCurrency.value,method:"Efectivo"}));
  $("#paymentLines").addEventListener("click",event=>{
    const button=event.target.closest("[data-remove-payment-line]");if(!button)return;
    if($$(".payment-line",$("#paymentLines")).length<=1)return;
    button.closest(".payment-line").remove();updatePaymentBalance();
  });
  $("#paymentLines").addEventListener("input",event=>{
    const line=event.target.closest(".payment-line");if(!line)return;
    const fields=paymentLineElements(line);
    if(event.target===fields.currency){
      delete line.dataset.exchangeRateId;delete line.dataset.exchangeRateSourceUrl;
      if(fields.currency.value==="VES")fields.basis.value=$("#paymentForm").elements.referenceCurrency.value;
      if(fields.currency.value==="EUR"||fields.currency.value==="USD"){$("#paymentForm").elements.referenceCurrency.value=fields.currency.value;$$('.payment-line',$("#paymentLines")).forEach(other=>{const otherFields=paymentLineElements(other);if(otherFields.currency.value==="VES")otherFields.basis.value=fields.currency.value;});}
      setPaymentLineCurrencyState(line);
      if(fields.currency.value!=="USD")refreshPaymentLineRate(line);
    }else if(event.target===fields.basis){
      delete line.dataset.exchangeRateId;delete line.dataset.exchangeRateSourceUrl;
      $("#paymentForm").elements.referenceCurrency.value=fields.basis.value;
      $$(".payment-line",$("#paymentLines")).forEach(other=>{const otherFields=paymentLineElements(other);if(otherFields.currency.value==="VES")otherFields.basis.value=fields.basis.value;});
      refreshPaymentLineRate(line,true);
    }else if(event.target===fields.sourceType){
      if(fields.sourceType.value==="manual"&&currentSession?.role!=="owner"){fields.sourceType.value="BCV";toast("Solo la propietaria puede cargar tasas manuales.");}
      setPaymentLineCurrencyState(line);if(fields.sourceType.value==="BCV")refreshPaymentLineRate(line,true);
    }else updatePaymentBalance();
  });
  $("#paymentForm").elements.total.addEventListener("input",updatePaymentBalance);
  $("#paymentForm").elements.soldAt.addEventListener("change",()=>{$$(".payment-line",$("#paymentLines")).forEach(line=>refreshPaymentLineRate(line,true));});
  $("#paymentForm").elements.referenceCurrency.addEventListener("change",event=>{
    $$(".payment-line",$("#paymentLines")).forEach(line=>{const fields=paymentLineElements(line);if(fields.currency.value==="VES"){fields.basis.value=event.target.value;refreshPaymentLineRate(line,true);}});updatePaymentBalance();
  });

  $("#salesList").addEventListener("click", event => {
    const addPayment=event.target.closest("[data-add-sale-payment]");
    if(addPayment){const sale=sales.find(item=>String(item.id)===String(addPayment.dataset.addSalePayment));if(sale)openSalePaymentDialog(sale);return;}
    const button=event.target.closest("[data-void-sale]");
    if(!button)return;
    const sale=sales.find(item=>String(item.id)===String(button.dataset.voidSale));const form=$("#voidForm");form.reset();form.elements.recordType.value="sale";form.elements.recordId.value=button.dataset.voidSale;form.elements.expectedVersion.value=String(sale?.mutationVersion??0);$("#voidDialogTitle").textContent="Anular venta";$("#voidImpact").innerHTML="<b>Esto no registra un reembolso.</b> Si la venta estaba cobrada, el dinero se conservará como crédito a favor del cliente hasta registrar su devolución o aplicarlo a otra venta.";$("#voidImpactConfirmation").textContent="Entiendo que anular no devuelve dinero y que el cobro quedará como crédito del cliente.";$("#voidDialog").showModal();
  });

  $("#paymentForm").addEventListener("submit", async event=>{
    event.preventDefault();
    const form=event.currentTarget,submit=$("#savePaymentButton");
    let payload;
    try{payload=paymentPayloadFromForm();}catch(error){toast(error.message);return;}
    submit.disabled=true;form.setAttribute("aria-busy","true");
    try{
      if(localMode){
        const now=new Date().toISOString();
        if(paymentDialogMode==="sale-payment"){
          const sale=sales.find(item=>String(item.id)===String(form.elements.saleId.value));if(!sale)throw new Error("La venta ya no está disponible.");sale.payments=[...(sale.payments||[]),...payload.payments];sale.customer={...(sale.customer||{}),...payload.customer};sale.customerName=payload.customer.name;sale.customerPhone=payload.customer.phone;const paid=sale.payments.reduce((sum,payment)=>sum+Number(payment.referenceAmountCents||0),0),total=Number(sale.totalRefCents??sale.totalCents??0);sale.paidRefCents=paid;sale.balanceRefCents=Math.max(0,total-paid);sale.paymentStatus=paid>=total?"paid":"partial";sale.status="confirmed";sale.mutationVersion=Number(sale.mutationVersion||0)+1;sale.updatedAt=now;
        }else{
          const record={id:crypto.randomUUID(),soldAt:payload.soldAt,channel:payload.channel,customerName:payload.customer.name,customerPhone:payload.customer.phone,customer:{...payload.customer},items:payload.items,lineItems:payload.items,payments:payload.payments,totalCents:payload.totalRefCents,totalRefCents:payload.totalRefCents,functionalTotalCents:payload.referenceCurrency==="USD"?payload.totalRefCents:undefined,currency:payload.referenceCurrency,referenceCurrency:payload.referenceCurrency,status:payload.paidRefCents>0?"confirmed":"pending",paymentStatus:payload.paidRefCents>=payload.totalRefCents?"paid":payload.paidRefCents?"partial":"unpaid",paidRefCents:payload.paidRefCents,balanceRefCents:Math.max(0,payload.totalRefCents-payload.paidRefCents),functionalBalanceCents:payload.referenceCurrency==="USD"?Math.max(0,payload.totalRefCents-payload.paidRefCents):undefined,notes:payload.notes,mutationVersion:0,createdAt:now,updatedAt:now};sales.unshift(record);
        }
        localStorage.setItem(SALES_STORAGE_KEY,JSON.stringify(sales));
      }else if(paymentDialogMode==="order"){
        await apiFetch(`/v1/admin/orders/${encodeURIComponent(form.elements.orderId.value)}/confirm-payment`,{method:"POST",body:JSON.stringify({idempotencyKey:payload.idempotencyKey,expectedVersion:Number(form.elements.expectedVersion.value||0),customer:payload.customer,soldAt:payload.soldAt,channel:payload.channel,referenceCurrency:payload.referenceCurrency,notes:payload.notes,payments:payload.payments})});
      }else if(paymentDialogMode==="sale-payment"){
        await apiFetch(`/v1/admin/sales/${encodeURIComponent(form.elements.saleId.value)}/payments`,{method:"POST",body:JSON.stringify({idempotencyKey:payload.idempotencyKey,expectedVersion:Number(form.elements.expectedVersion.value||0),paymentDate:payload.soldAt,soldAt:payload.soldAt,customer:payload.customer,payments:payload.payments,notes:payload.notes})});
      }else{
        await apiFetch("/v1/admin/sales",{method:"POST",body:JSON.stringify({idempotencyKey:payload.idempotencyKey,soldAt:payload.soldAt,channel:payload.channel,customer:payload.customer,items:payload.items,payments:payload.payments,referenceCurrency:payload.referenceCurrency,totalRefCents:payload.totalRefCents,status:payload.status,notes:payload.notes})});
      }
      $("#paymentDialog").close();toast(paymentDialogMode==="order"?(payload.paidRefCents>=payload.totalRefCents?"Pago completo, venta guardada e inventario descontado.":"Abono guardado, pedido confirmado e inventario descontado. El saldo queda por cobrar."):paymentDialogMode==="sale-payment"?(payload.paidRefCents>=payload.totalRefCents?"Abono registrado; revisa el saldo actualizado.":"Abono registrado con su moneda y tasa."):payload.paidRefCents>=payload.totalRefCents?"Venta y cobro guardados.":"Venta guardada con saldo pendiente.");
      await Promise.all([loadSales(),loadOrders(),loadInventory(),loadCustomers(),loadAccounting(),loadActivity()]);
    }catch(error){if(error.code==="stale_state"){$("#paymentDialog").close();toast("Este registro cambió en otro dispositivo. Ya mostramos la versión más reciente.");await Promise.all([loadSales(),loadOrders()]);}else toast(error.message||"No se pudo guardar la venta y el cobro.");}
    finally{submit.disabled=false;form.removeAttribute("aria-busy");}
  });

  $("#newExpenseButton").addEventListener("click",openExpenseDialog);
  $("#expenseForm").elements.currency.addEventListener("change",()=>{const form=$("#expenseForm");delete form.dataset.exchangeRateId;delete form.dataset.exchangeRateSourceUrl;form.elements.bcvRate.value="";form.elements.rateValueDate.value="";setExpenseRateState();refreshExpenseRate();});
  $("#expenseForm").elements.spentAt.addEventListener("change",()=>refreshExpenseRate(true));
  $("#expenseForm").elements.rateBasis.addEventListener("change",()=>{const form=$("#expenseForm");delete form.dataset.exchangeRateId;delete form.dataset.exchangeRateSourceUrl;refreshExpenseRate(true);});
  $("#expenseForm").elements.rateSourceType.addEventListener("change",event=>{if(event.target.value==="manual"&&currentSession?.role!=="owner"){event.target.value="BCV";toast("Solo la propietaria puede cargar tasas manuales.");}setExpenseRateState();if(event.target.value==="BCV")refreshExpenseRate(true);});
  $("#expenseList").addEventListener("click",event=>{
    const button=event.target.closest("[data-void-expense]");if(!button)return;
    const expense=expenses.find(item=>String(item.id)===String(button.dataset.voidExpense));const form=$("#voidForm");form.reset();form.elements.recordType.value="expense";form.elements.recordId.value=button.dataset.voidExpense;form.elements.expectedVersion.value=String(expense?.mutationVersion??0);$("#voidDialogTitle").textContent="Anular gasto";$("#voidImpact").innerHTML="<b>Esto no registra una devolución de dinero.</b> El desembolso quedará reclasificado como monto por recuperar. Si el dinero ya volvió a Fontana, registra ese ingreso de caja por separado.";$("#voidImpactConfirmation").textContent="Entiendo que anular el gasto no registra automáticamente que el dinero regresó.";$("#voidDialog").showModal();
  });
  $("#expenseForm").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button[type="submit"]');let payload;try{payload=expensePayloadFromForm();}catch(error){toast(error.message);return;}submit.disabled=true;
    try{if(localMode){expenses.unshift({...payload,id:crypto.randomUUID(),status:"confirmed",mutationVersion:0,createdAt:new Date().toISOString()});localStorage.setItem(EXPENSES_STORAGE_KEY,JSON.stringify(expenses));}else await apiFetch("/v1/admin/expenses",{method:"POST",body:JSON.stringify(payload)});$("#expenseDialog").close();toast("Gasto registrado con su moneda y tasa histórica.");await Promise.all([loadAccounting(),loadActivity()]);}catch(error){toast(error.message||"No se pudo registrar el gasto.");}finally{submit.disabled=false;}
  });
  $("#voidForm").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,type=form.elements.recordType.value,id=form.elements.recordId.value,reason=String(form.elements.reason.value||"").trim(),submit=form.querySelector('button[type="submit"]');if(reason.length<8||!form.elements.confirmImpact.checked)return toast("Escribe un motivo de al menos 8 caracteres y confirma el efecto contable.");submit.disabled=true;
    try{
      if(localMode){const list=type==="sale"?sales:expenses,record=list.find(item=>String(item.id)===String(id));if(record){record.status="void";record.voidReason=reason;record.voidedAt=new Date().toISOString();record.mutationVersion=Number(record.mutationVersion||0)+1;}localStorage.setItem(type==="sale"?SALES_STORAGE_KEY:EXPENSES_STORAGE_KEY,JSON.stringify(list));}
      else await apiFetch(`/v1/admin/${type==="sale"?"sales":"expenses"}/${encodeURIComponent(id)}/void`,{method:"POST",body:JSON.stringify({reason,expectedVersion:Number(form.elements.expectedVersion.value||0)})});
      $("#voidDialog").close();toast(type==="sale"?"Venta anulada. Cualquier cobro quedó identificado como crédito del cliente; no se registró un reembolso.":"Gasto anulado y reclasificado como monto por recuperar; no se fingió una devolución.");await Promise.all([loadSales(),loadCustomers(),loadAccounting(),loadActivity()]);
    }catch(error){if(error.code==="stale_state"){$("#voidDialog").close();toast("Este movimiento cambió en otro dispositivo. Ya mostramos la versión más reciente.");await Promise.all([loadSales(),loadAccounting()]);}else toast(error.message||"No se pudo anular el movimiento.");}finally{submit.disabled=false;}
  });

  $("#productList").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openProduct(edit.dataset.edit);
    if (remove) {
      const product = state.products.find(item => item.id === remove.dataset.delete);
      if (product && confirm(`¿Eliminar ${product.name} del catálogo?`)) {
        product.deleted = true;
        markDirty();
        renderAll();
      }
    }
  });

  $("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const originalId = data.get("originalId");
    const id = String(data.get("id")).trim();
    const duplicate = state.products.some(product => product.id === id && product.id !== originalId && !product.deleted);
    if (duplicate) return toast("Ya existe un producto con ese identificador");
    const weight = productWeightFromForm(form);
    if (weight.error) return toast(weight.error);
    const product = {
      id,name:String(data.get("name")).trim(),brand:String(data.get("brand") || "").trim(),category:data.get("category"),price:data.get("price") === "" ? null : Number(data.get("price")),image:String(data.get("image")).trim(),description:String(data.get("description")).trim(),ingredients:String(data.get("ingredients")).trim(),weight:weight.value,availabilityLabel:String(data.get("availabilityLabel")).trim(),minimumBusinessDays:Number(data.get("minimumBusinessDays") || 0),status:data.get("status"),stockQuantity:data.get("stockQuantity") === "" ? null : Math.max(0,Number(data.get("stockQuantity"))),visible:data.get("visible") === "on",isNew:data.get("isNew") === "on",promo:data.get("promo") === "on",immediate:data.get("immediate") === "on",allowPreorder:data.get("allowPreorder") === "on",requiresElectricity:data.get("requiresElectricity") === "on",glutenFree:data.get("glutenFree") === "on",sugarFree:data.get("sugarFree") === "on",lactoseFree:data.get("lactoseFree") === "on",eggFree:data.get("eggFree") === "on",customLabels:String(data.get("customLabels") || "").split(/\n/).map(label => label.trim()).filter(Boolean),variants:parseVariants(String(data.get("variants") || "")),sizes:parseSizes(String(data.get("sizes") || ""))
    };
    const index = state.products.findIndex(item => item.id === originalId);
    if (index >= 0) state.products[index] = product; else state.products.push(product);
    markDirty();
    renderAll();
    $("#productDialog").close();
    toast("Producto listo para guardar");
  });

  ["input","change"].forEach(eventName => $("#productForm").addEventListener(eventName, event => {
    if (event.target.matches('[name="weightEnabled"],[name="weightValue"],[name="weightUnit"],[name="weightCustom"]')) {
      syncProductWeightForm(event.currentTarget);
    }
  }));

  $("#productImageInput").addEventListener("change", async event => {
    try {
      const imageUrl = await uploadImage(event.target.files[0]);
      if (!imageUrl) return;
      $("#productForm").elements.image.value = imageUrl;
      $("#productImagePreview").style.backgroundImage = `url("${imageUrl}")`;
      toast(localMode ? "Imagen optimizada" : "Imagen optimizada y subida");
    } catch { toast("No se pudo subir la imagen. Usa JPG, PNG o WebP de menos de 1,5 MB."); }
  });

  ["fonkiesEditor","fombEditor"].forEach(id => $(`#${id}`).addEventListener("click", event => {
    const openInventory = event.target.closest("[data-builder-inventory]");
    const add = event.target.closest("[data-add-flavor]");
    const edit = event.target.closest("[data-edit-flavor]");
    const remove = event.target.closest("[data-delete-flavor]");
    const save = event.target.closest("[data-save-builder]");
    if (openInventory) openBuilderInventory(openInventory.dataset.builderInventory);
    if (add) openFlavor(add.dataset.addFlavor);
    if (edit) { const [kind,index] = edit.dataset.editFlavor.split(":"); openFlavor(kind,Number(index)); }
    if (remove) {
      const [kind,index] = remove.dataset.deleteFlavor.split(":");
      if (confirm("¿Eliminar este sabor?")) { state.builders[kind].flavors.splice(Number(index),1); markDirty(); renderBuilder(kind); }
    }
    if (save) { markDirty(); saveState(); }
  }));

  ["fonkiesEditor","fombEditor"].forEach(id => $(`#${id}`).addEventListener("input", event => {
    const card = event.target.closest("[data-builder]");
    if (!card) return;
    const builder = state.builders[card.dataset.builder];
    if (event.target.dataset.builderField) {
      const field = event.target.dataset.builderField;
      builder[field] = event.target.type === "checkbox" ? event.target.checked : event.target.type === "number" ? Number(event.target.value) : event.target.value;
      markDirty();
    }
    if (event.target.dataset.builderSize) {
      builder.sizes[Number(event.target.dataset.builderSize)][event.target.dataset.sizeField] = Number(event.target.value);
      markDirty();
    }
  }));

  $("#flavorForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const kind = data.get("builder");
    const index = data.get("index") === "" ? -1 : Number(data.get("index"));
    const name = String(data.get("name")).trim();
    const normalizedName = inventoryKeySlug(name);
    const duplicateName = state.builders[kind].flavors.some((item,itemIndex) => itemIndex !== index && inventoryKeySlug(item.name) === normalizedName);
    if (duplicateName) return toast("Ya existe un sabor con ese nombre o uno equivalente.");
    const existing = index >= 0 ? state.builders[kind].flavors[index] : null;
    const usedKeys = new Set(state.builders[kind].flavors.filter((_item,itemIndex) => itemIndex !== index).map(item => item.inventoryKey || inventoryKeySlug(item.name)));
    // A newly created flavor must never reuse the SKU of a deleted flavor.
    // Existing flavors keep their immutable key across renames.
    const inventoryKey = existing?.inventoryKey || freshInventoryKey(name, usedKeys);
    const flavor = {...(existing || {}),name,ingredients:String(data.get("ingredients")).trim(),image:String(data.get("image")).trim(),status:data.get("status"),inventoryKey};
    if (!localMode) delete flavor.stockQuantity;
    if (index >= 0) state.builders[kind].flavors[index] = flavor; else state.builders[kind].flavors.push(flavor);
    markDirty();
    renderBuilder(kind);
    $("#flavorDialog").close();
  });

  $("#flavorImageInput").addEventListener("change", async event => {
    try {
      const imageUrl = await uploadImage(event.target.files[0]);
      if (!imageUrl) return;
      $("#flavorForm").elements.image.value = imageUrl;
      $("#flavorImagePreview").style.backgroundImage = `url("${imageUrl}")`;
    } catch { toast("No se pudo subir la imagen."); }
  });

  $$("[data-quick]").forEach(button => button.addEventListener("click", () => {
    openProductFilter(button.dataset.quick);
  }));

  $("#exportButton").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `fontana-catalogo-${caracasDate()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $("#importInput").addEventListener("change", async event => {
    try {
      const imported = JSON.parse(await event.target.files[0].text());
      if (!Array.isArray(imported?.products) || !imported.builders) throw new Error();
      state = normalizeState(imported);
      markDirty();
      renderAll();
      toast("Copia cargada. Revisa y guarda los cambios.");
    } catch {
      toast("Ese archivo no es una copia válida de Fontana");
    }
  });

  $("#resetButton").addEventListener("click", () => {
    if (!confirm("¿Cargar el catálogo inicial? Los cambios no se publicarán hasta que pulses Guardar.")) return;
    state = defaultState();
    dirty = true;
    renderAll();
    $("#saveStatus").textContent = "Catálogo inicial pendiente de publicar";
    toast("Catálogo inicial cargado. Revisa y guarda.");
  });

  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
  });

  async function bootstrap() {
    if (localMode) {
      state = readState();
      currentSession = { username:"revision-local", displayName:"Revisión local", role:"owner" };
      showLogin("Modo local de revisión: acceso abierto en este dispositivo.");
      return;
    }
    currentSession = null;
    $("#loginUsername").value = localStorage.getItem(LAST_USERNAME_KEY) || "";
    try {
      // Una cookie anterior nunca debe abrir el panel por sí sola. Al cargar la
      // página cerramos cualquier sesión previa y exigimos una autenticación
      // nueva mediante contraseña o una passkey confirmada por Face ID.
      await apiFetch("/v1/auth/logout", { method:"POST", body:"{}" });
      showLogin("Confirma tu acceso con Face ID o escribe tu contraseña.");
    } catch {
      showLogin("No se pudo conectar con la base de datos.");
    }
  }

  await bootstrap();
})();
