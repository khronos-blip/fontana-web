(async () => {
  "use strict";

  const STORAGE_KEY = "fontana-admin-catalog-v1";
  const SALES_STORAGE_KEY = "fontana-admin-sales-v1";
  const config = window.FONTANA_CONFIG || {};
  const apiBase = String(config.adminApiBase || "").replace(/\/$/, "");
  const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));

  const originalProducts = [
    { id:"pistacho",category:"cakes",name:"Torta de Pistacho & Frambuesa",price:60,image:"assets/pistachio-raspberry-fontana-v2.jpg",description:"Harina de almendra, frambuesa, pistacho y glaseado vegano.",ingredients:"Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho, frambuesa, semillas de amapola, alulosa y chocolate blanco vegano sin azúcar",weight:"25 CM · 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"naranja",category:"cakes",name:"Torta de Manjar de Naranja",price:47,image:"assets/manjar-naranja.jpg",description:"Naranja, harina de almendra, semillas de amapola y alulosa.",ingredients:"Harina de almendra, harina de yuca (10 %), monkfruit, aceite de coco, huevo, naranja, semillas de amapola y alulosa",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"zanahoria",category:"cakes",name:"Torta de Zanahoria",price:47,image:"assets/zanahoria-fontana-v2.jpg",description:"Zanahoria, canela, jengibre, almendras y glaseado vegano.",ingredients:"Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, zanahoria, canela, jengibre, glaseado vegano y almendras",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"pistacho-clasico",category:"cakes",name:"Torta de Pistacho",price:55,image:"assets/pistacho-fontana-v4.png",description:"Pistacho, harina de almendra y glaseado vegano.",ingredients:"Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho y glaseado vegano",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
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
      stockTodayOpen: next.settings?.stockTodayOpen !== false
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
      allowPreorder: Boolean(product.allowPreorder), customLabels: Array.isArray(product.customLabels) ? product.customLabels : [],
      variants: (product.variants || []).map(option => ({...option, stockQuantity: option.stockQuantity === null || option.stockQuantity === "" || option.stockQuantity === undefined ? null : Math.max(0, Number(option.stockQuantity))})),
      sizes: (product.sizes || []).map(option => ({...option, stockQuantity: option.stockQuantity === null || option.stockQuantity === "" || option.stockQuantity === undefined ? null : Math.max(0, Number(option.stockQuantity))}))
    }));
    next.builders = next.builders || clone(originalBuilders);
    ["fonkies", "fomb"].forEach(kind => {
      const builder = next.builders[kind] || clone(originalBuilders[kind]);
      next.builders[kind] = {
        ...builder,
        glutenFree: Object.prototype.hasOwnProperty.call(builder, "glutenFree") ? Boolean(builder.glutenFree) : true,
        sugarFree: Object.prototype.hasOwnProperty.call(builder, "sugarFree") ? Boolean(builder.sugarFree) : true,
        lactoseFree: Object.prototype.hasOwnProperty.call(builder, "lactoseFree") ? Boolean(builder.lactoseFree) : true,
        eggFree: Object.prototype.hasOwnProperty.call(builder, "eggFree") ? Boolean(builder.eggFree) : kind === "fomb",
        visible: builder.visible !== false, status: builder.status === "sold-out" ? "sold-out" : "available",
        stockQuantity: builder.stockQuantity === null || builder.stockQuantity === "" || builder.stockQuantity === undefined ? null : Math.max(0, Number(builder.stockQuantity)),
        isNew: Boolean(builder.isNew), promo: Boolean(builder.promo), immediate: Boolean(builder.immediate), allowPreorder: Boolean(builder.allowPreorder),
        flavors: (builder.flavors || []).map(flavor => ({...flavor, stockQuantity: flavor.stockQuantity === null || flavor.stockQuantity === "" || flavor.stockQuantity === undefined ? null : Math.max(0, Number(flavor.stockQuantity))}))
      };
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
  let dirty = false;
  let currentSession = null;
  let sales = [];
  let salesSummary = {todayCents:0,monthCents:0,yearCents:0,allCents:0,confirmedCount:0,pendingCount:0};
  let inventory = [];
  let inventorySummary = {tracked:0,available:0,reserved:0,soldOut:0};
  let orders = [];
  let orderSummary = {reserved:0,confirmed:0,expired:0};
  let activityItems = [];

  async function apiFetch(path, options = {}) {
    if (!apiBase) throw new Error("API_NOT_CONFIGURED");
    const response = await fetch(`${apiBase}${path}`, {credentials:"include",cache:"no-store", ...options, headers:{...(options.body instanceof FormData ? {} : {"Content-Type":"application/json"}), ...(options.headers || {})}});
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error || `HTTP_${response.status}`);
      error.status = response.status;
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
    state = normalizeState(payload?.state || defaultState());
    remoteRevision = Number(payload?.revision || 0);
  }

  async function enterPanel() {
    if (!currentSession?.ok && !localMode) throw new Error("La autenticación todavía no fue confirmada.");
    $("#loginView").hidden = true;
    $("#adminApp").hidden = false;
    renderAll();
    await Promise.all([loadSales(), loadInventory(), loadOrders(), loadActivity()]);
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
    if (!path) return "../assets/logo.png";
    if (/^(data:|https?:)/.test(path)) return path;
    return `../${path.replace(/^\.\.\//, "")}`;
  }

  function money(value) {
    if (value === null || value === "" || !Number.isFinite(Number(value))) return "Por confirmar";
    return new Intl.NumberFormat(config.locale || "es-VE", {style:"currency",currency:config.currency || "USD"}).format(Number(value));
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
      $("#saveStatus").textContent = localMode ? "Borrador local guardado" : "Publicado para todos";
      renderAll();
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
    return money(Number(value || 0) / 100);
  }

  function activityMeta(action) {
    const groups = {
      catalog_save:["Catálogo publicado","catalog"], image_upload:["Imagen subida","catalog"],
      inventory_adjust:["Inventario ajustado","inventory"], order_confirm:["Pedido confirmado","orders"], order_cancel:["Pedido cancelado","orders"],
      sale_create:["Venta registrada","sales"], sale_update:["Venta actualizada","sales"], sale_delete:["Venta eliminada","sales"],
      login:["Inicio de sesión","security"], passkey_login:["Acceso con Face ID","security"], passkey_add:["Face ID activado","security"], passkey_delete:["Face ID eliminado","security"], user_create:["Usuario creado","security"], user_deactivate:["Usuario desactivado","security"], setup:["Panel configurado","security"]
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
      const matchesSearch = !query || `${item.username} ${label} ${item.details}`.toLowerCase().includes(query);
      return matchesSearch && (type === "all" || type === group);
    });
  }

  function activityRow(item, compact = false) {
    const [label,group] = activityMeta(item.action);
    const dateOptions = compact ? {timeStyle:"short"} : {dateStyle:"medium",timeStyle:"short"};
    const date = item.createdAt ? new Date(item.createdAt).toLocaleString("es-VE",dateOptions) : "Fecha no disponible";
    return `<article class="activity-row ${compact ? "compact-activity" : ""}"><span class="activity-dot ${escapeHtml(group)}"></span><div><h3>${escapeHtml(label)}</h3><p>${escapeHtml(item.details || "Sin detalle")}</p><small>${escapeHtml(item.username || "sistema")} · ${escapeHtml(date)}</small></div></article>`;
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
    $("#stockDayToggle").innerHTML = `<span>${open ? "● Abierto" : "● Cerrado"}</span><b>${open ? "Cerrar Stock de hoy" : "Abrir Stock de hoy"}</b>`;
    const today = new Date().toISOString().slice(0,10);
    const todaySales = sales.filter(item => item.status === "confirmed" && item.soldAt === today);
    $("#todaySummary").innerHTML = `<div><span>Resumen de hoy</span><b>${escapeHtml(centsMoney(salesSummary.todayCents))}</b><small>Ingresos confirmados</small></div><div><b>${todaySales.length}</b><small>Ventas confirmadas</small></div><div><b>${reserved}</b><small>Pedidos por confirmar</small></div><button type="button" data-view-link="sales">Ver ventas →</button>`;
    $("#todaySummary [data-view-link]").addEventListener("click",()=>showView("sales"));
  }

  async function toggleStockDay() {
    const willOpen = state.settings?.stockTodayOpen === false;
    state.settings ||= {};
    state.settings.stockTodayOpen = willOpen;
    markDirty();
    renderDashboardOperations();
    await saveState();
    toast(willOpen ? "Stock de hoy abierto en la tienda." : "Stock de hoy cerrado hasta que vuelvas a abrirlo.");
  }

  function localInventoryItems() {
    const rows = state.products.filter(product => !product.deleted).map(product => ({sku:`product:${product.id}:base:base`,kind:"product",label:product.name,optionSummary:"",onHand:Number(product.stockQuantity || 0),reserved:0,available:Number(product.stockQuantity || 0),trackStock:product.stockQuantity !== null}));
    ["fonkies","fomb"].forEach(kind => state.builders[kind].flavors.forEach(flavor => rows.push({sku:`builder:${kind}:${flavor.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,kind,label:flavor.name,optionSummary:kind === "fonkies" ? "Fonkies" : "Fomb",onHand:Number(flavor.stockQuantity || 0),reserved:0,available:Number(flavor.stockQuantity || 0),trackStock:flavor.stockQuantity !== null})));
    return rows;
  }

  async function loadInventory() {
    try {
      if (localMode) {
        inventory = localInventoryItems();
        const tracked = inventory.filter(item => item.trackStock);
        inventorySummary = {tracked:tracked.length,available:tracked.reduce((sum,item)=>sum+item.available,0),reserved:0,soldOut:tracked.filter(item=>item.available===0).length};
      } else {
        const payload = await apiFetch("/v1/admin/inventory");
        inventory = payload.items || [];
        inventorySummary = payload.summary || inventorySummary;
      }
      renderInventory();
      renderDashboardOperations();
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
    $("#inventoryList").innerHTML = items.length ? items.map(item => `<article class="inventory-row" data-sku="${escapeHtml(item.sku)}"><div class="inventory-copy"><span class="eyebrow">${escapeHtml(item.optionSummary || item.kind)}</span><h3>${escapeHtml(item.label)}</h3><p>${item.trackStock ? `${item.available} disponible${item.available===1?"":"s"} · ${item.reserved} reservada${item.reserved===1?"":"s"}` : "Sin control numérico"}</p></div><label>Cantidad total<input data-stock-value type="number" min="${Number(item.reserved||0)}" step="1" value="${Number(item.onHand||0)}"></label><div class="restock-buttons" aria-label="Reposición rápida"><button type="button" data-stock-delta="1">+1</button><button type="button" data-stock-delta="5">+5</button></div><label class="switch"><input data-track-stock type="checkbox" ${item.trackStock?"checked":""}><span>Control activo</span></label><button class="primary compact" data-save-stock type="button">Guardar</button></article>`).join("") : '<div class="empty-list">No hay artículos que coincidan.</div>';
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
    $("#orderStats").innerHTML=[[orderSummary.reserved,"Reservas activas"],[orderSummary.confirmed,"Confirmados"],[orderSummary.expired,"Vencidos"],[orders.length,"Pedidos registrados"]].map(([value,label])=>`<article class="stat"><b>${Number(value||0)}</b><span>${label}</span></article>`).join("");
    const labels={reserved:"Reservado",confirmed:"Confirmado",cancelled:"Cancelado",expired:"Vencido"};
    $("#ordersList").innerHTML=items.length?items.map(order=>{const seconds=Math.max(0,Number(order.expiresAt||0)-now);const choices=(order.items||[]).map(item=>`${item.quantity}× ${item.name}${item.optionSummary?` · ${item.optionSummary}`:""}`).join("; ");return `<article class="order-row"><div class="order-main"><div class="order-title"><h3>${escapeHtml(order.orderCode)}</h3><span class="badge ${order.status==="confirmed"?"green":order.status!=="reserved"?"red":""}">${labels[order.status]||order.status}</span></div><p><b>${escapeHtml(order.customerName||"Cliente")}</b> · ${escapeHtml(order.customerPhone||"")}</p><p>${escapeHtml(choices)}</p><small>${escapeHtml(order.fulfillment||"")} · ${escapeHtml(order.requestedDate||"")} · ${escapeHtml(centsMoney(order.totalCents))}${order.status==="reserved"?` · vence en ${Math.ceil(seconds/60)} min`:""}</small></div>${order.status==="reserved"?`<div class="order-actions"><button class="primary compact" data-order-action="confirm" data-order-id="${order.id}">Confirmar y descontar</button><button class="ghost compact" data-order-action="extend" data-order-id="${order.id}">+30 min</button><button class="danger compact" data-order-action="cancel" data-order-id="${order.id}">Cancelar</button></div>`:""}</article>`;}).join(""):'<div class="empty-list">No hay pedidos en este estado.</div>';
  }

  function calculateSalesSummary(items) {
    const today = new Date().toISOString().slice(0, 10);
    const confirmed = items.filter(item => item.status === "confirmed");
    const sum = matches => matches.reduce((total, item) => total + Number(item.totalCents || 0), 0);
    return {
      todayCents: sum(confirmed.filter(item => item.soldAt === today)),
      monthCents: sum(confirmed.filter(item => String(item.soldAt).startsWith(today.slice(0, 7)))),
      yearCents: sum(confirmed.filter(item => String(item.soldAt).startsWith(today.slice(0, 4)))),
      allCents: sum(confirmed), confirmedCount: confirmed.length,
      pendingCount: items.filter(item => item.status === "pending").length
    };
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
        salesSummary = payload.summary || calculateSalesSummary(sales);
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
    $("#salesSnapshot").innerHTML = `<div><span>Ingresos confirmados este mes</span><b>${escapeHtml(centsMoney(salesSummary.monthCents))}</b></div><div><span>Ventas confirmadas</span><b>${Number(salesSummary.confirmedCount || 0)}</b></div><div><span>Pendientes de cobro</span><b>${Number(salesSummary.pendingCount || 0)}</b></div><button type="button" data-view-link="sales">Ver contabilidad →</button>`;
    $("#salesSnapshot [data-view-link]").addEventListener("click", () => showView("sales"));
  }

  function filteredSales() {
    const query = String($("#saleSearch")?.value || "").trim().toLowerCase();
    const status = $("#saleStatusFilter")?.value || "all";
    const period = $("#salePeriodFilter")?.value || "all";
    const today = new Date().toISOString().slice(0, 10);
    return sales.filter(sale => {
      const haystack = `${sale.customerName || ""} ${sale.items || ""} ${sale.notes || ""} ${sale.paymentMethod || ""}`.toLowerCase();
      const periodMatch = period === "all" || (period === "today" && sale.soldAt === today) || (period === "month" && String(sale.soldAt).startsWith(today.slice(0, 7))) || (period === "year" && String(sale.soldAt).startsWith(today.slice(0, 4)));
      return (!query || haystack.includes(query)) && (status === "all" || sale.status === status) && periodMatch;
    });
  }

  function renderSales() {
    if (!$("#salesStats")) return;
    const metrics = [[salesSummary.todayCents,"Ingresos de hoy"],[salesSummary.monthCents,"Este mes"],[salesSummary.yearCents,"Este año"],[salesSummary.allCents,"Total registrado"]];
    $("#salesStats").innerHTML = metrics.map(([value,label]) => `<article class="stat"><b>${escapeHtml(centsMoney(value))}</b><span>${label}</span></article>`).join("");
    const statusLabels = {confirmed:"Confirmada",pending:"Pendiente",cancelled:"Anulada"};
    const items = filteredSales();
    $("#salesList").innerHTML = items.length ? items.map(sale => `<article class="sale-row" data-sale-id="${escapeHtml(sale.id)}"><div class="sale-date"><b>${escapeHtml(new Date(`${sale.soldAt}T12:00:00`).toLocaleDateString("es-VE",{day:"2-digit",month:"short"}))}</b><span>${escapeHtml(sale.channel || "")}</span></div><div class="sale-main"><h3>${escapeHtml(sale.customerName || "Venta sin nombre")}</h3><p>${escapeHtml(sale.items)}</p><small>${escapeHtml(sale.paymentMethod || "Forma de pago no indicada")}${sale.notes ? ` · ${escapeHtml(sale.notes)}` : ""}</small></div><div class="sale-total"><b>${escapeHtml(centsMoney(sale.totalCents))}</b><span class="badge ${sale.status === "confirmed" ? "green" : sale.status === "cancelled" ? "red" : ""}">${statusLabels[sale.status] || "Pendiente"}</span></div><div class="row-actions"><button type="button" data-edit-sale="${escapeHtml(sale.id)}" aria-label="Editar venta">✎</button><button type="button" data-delete-sale="${escapeHtml(sale.id)}" aria-label="Eliminar venta">×</button></div></article>`).join("") : '<div class="empty-list">No hay ventas que coincidan con estos filtros.</div>';
  }

  function openSale(id = "") {
    const sale = id ? sales.find(item => item.id === id) : null;
    const form = $("#saleForm");
    $("#saleDialogTitle").textContent = sale ? "Editar venta" : "Registrar venta";
    form.elements.id.value = sale?.id || "";
    form.elements.soldAt.value = sale?.soldAt || new Date().toISOString().slice(0, 10);
    form.elements.total.value = sale ? (Number(sale.totalCents || 0) / 100).toFixed(2) : "";
    form.elements.status.value = sale?.status || "confirmed";
    form.elements.channel.value = sale?.channel || "WhatsApp";
    form.elements.paymentMethod.value = sale?.paymentMethod || "Pago Móvil";
    form.elements.customerName.value = sale?.customerName || "";
    form.elements.items.value = sale?.items || "";
    form.elements.notes.value = sale?.notes || "";
    $("#saleDialog").showModal();
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
    $("#productList").innerHTML = products.length ? products.map(product => `<article class="product-row" data-product-id="${escapeHtml(product.id)}"><img src="${escapeHtml(absoluteImage(product.image))}" alt=""><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || "Sin descripción")}</p></div><div class="badges">${productBadges(product)}<span class="badge">${escapeHtml(money(product.price))}</span></div><div class="row-actions"><button data-edit="${escapeHtml(product.id)}" aria-label="Editar ${escapeHtml(product.name)}">✎</button><button data-delete="${escapeHtml(product.id)}" aria-label="Eliminar ${escapeHtml(product.name)}">×</button></div></article>`).join("") : '<div class="empty-list">No hay productos que coincidan con estos filtros.</div>';
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

  function openProduct(id) {
    const product = id ? state.products.find(item => item.id === id) : {id:"",name:"",category:"cakes",price:"",description:"",ingredients:"",weight:"",availabilityLabel:"",minimumBusinessDays:0,status:"available",stockQuantity:null,visible:true,isNew:false,promo:false,immediate:false,allowPreorder:false,glutenFree:false,sugarFree:false,lactoseFree:false,eggFree:false,customLabels:[],image:"",variants:[],sizes:[]};
    if (!product) return;
    const form = $("#productForm");
    $("#dialogTitle").textContent = id ? "Editar producto" : "Nuevo producto";
    form.elements.originalId.value = id || "";
    ["id","name","category","description","ingredients","weight","availabilityLabel","status","image"].forEach(field => { form.elements[field].value = product[field] ?? ""; });
    form.elements.price.value = product.price ?? "";
    form.elements.minimumBusinessDays.value = product.minimumBusinessDays ?? 0;
    form.elements.stockQuantity.value = product.stockQuantity ?? "";
    form.elements.visible.checked = product.visible !== false;
    form.elements.isNew.checked = Boolean(product.isNew);
    form.elements.promo.checked = Boolean(product.promo);
    form.elements.immediate.checked = Boolean(product.immediate);
    form.elements.allowPreorder.checked = Boolean(product.allowPreorder);
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

  function renderBuilder(kind) {
    const builder = state.builders[kind];
    const title = kind === "fonkies" ? "Fonkies" : "Fomb";
    const pricing = kind === "fonkies"
      ? `<label>Precio 4 iguales<input data-builder-field="singlePrice" type="number" min="0" step=".01" value="${builder.singlePrice}"></label><label>Precio 4 mixtas<input data-builder-field="mixedPrice" type="number" min="0" step=".01" value="${builder.mixedPrice}"></label><label>Precio extra<input data-builder-field="extraPrice" type="number" min="0" step=".01" value="${builder.extraPrice}"></label><label>Mínimo<input data-builder-field="minimumQuantity" type="number" min="1" value="${builder.minimumQuantity}"></label>`
      : `<label>Precio caja de 4<input data-builder-size="0" data-size-field="price" type="number" min="0" step=".01" value="${builder.sizes[0]?.price ?? 15}"></label><label>Precio caja de 12<input data-builder-size="1" data-size-field="price" type="number" min="0" step=".01" value="${builder.sizes[1]?.price ?? 30}"></label><label>Precio extra<input data-builder-field="extraPrice" type="number" min="0" step=".01" value="${builder.extraPrice}"></label>`;
    $(`#${kind}Editor`).innerHTML = `<article class="builder-card" data-builder="${kind}"><div class="builder-form">${pricing}<label>Estado<select data-builder-field="status"><option value="available" ${builder.status !== "sold-out" ? "selected" : ""}>Disponible</option><option value="sold-out" ${builder.status === "sold-out" ? "selected" : ""}>Agotado</option></select></label><label>Cantidad administrada<input data-builder-field="stockQuantity" type="number" min="0" step="1" value="${builder.stockQuantity ?? ""}" placeholder="Sin control numérico"></label><label class="switch"><input data-builder-field="visible" type="checkbox" ${builder.visible !== false ? "checked" : ""}><span>Visible en la tienda</span></label><label class="switch"><input data-builder-field="isNew" type="checkbox" ${builder.isNew ? "checked" : ""}><span>Etiqueta Nuevo</span></label><label class="switch"><input data-builder-field="promo" type="checkbox" ${builder.promo ? "checked" : ""}><span>Promoción del día</span></label><label class="switch"><input data-builder-field="immediate" type="checkbox" ${builder.immediate ? "checked" : ""}><span>Stock de hoy</span></label><label class="switch"><input data-builder-field="allowPreorder" type="checkbox" ${builder.allowPreorder ? "checked" : ""}><span>Permitir pre-order agotado</span></label><label class="switch"><input data-builder-field="glutenFree" type="checkbox" ${builder.glutenFree ? "checked" : ""}><span>Mostrar sello Sin gluten</span></label><label class="switch"><input data-builder-field="sugarFree" type="checkbox" ${builder.sugarFree ? "checked" : ""}><span>Mostrar sello Sin azúcar</span></label><label class="switch"><input data-builder-field="lactoseFree" type="checkbox" ${builder.lactoseFree ? "checked" : ""}><span>Mostrar sello Sin lactosa</span></label></div><div class="panel-head"><div><span class="eyebrow">${builder.flavors.length} sabores</span><h2>Sabores de ${title}</h2></div><button class="ghost" data-add-flavor="${kind}">+ Agregar sabor</button></div><div class="flavor-admin-list">${builder.flavors.map((flavor,index) => `<div class="flavor-row"><img src="${escapeHtml(absoluteImage(flavor.image))}" alt=""><div><h3>${escapeHtml(flavor.name)}</h3><p>${escapeHtml(flavor.ingredients)}</p></div><span class="badge ${flavor.status === "sold-out" || flavor.stockQuantity === 0 ? "red" : "green"}">${flavor.status === "sold-out" || flavor.stockQuantity === 0 ? "Agotado" : "Disponible"}${flavor.stockQuantity === null || flavor.stockQuantity === undefined ? "" : ` · ${flavor.stockQuantity}`}</span><div class="row-actions"><button data-edit-flavor="${kind}:${index}" aria-label="Editar sabor">✎</button><button data-delete-flavor="${kind}:${index}" aria-label="Eliminar sabor">×</button></div></div>`).join("")}</div><div class="builder-actions"><button class="primary" data-save-builder="${kind}" aria-label="Guardar ${title}">Guardar y publicar ${title}</button></div></article>`;
    $(".builder-form", $(`#${kind}Editor`)).insertAdjacentHTML("beforeend", `<label class="switch"><input data-builder-field="eggFree" type="checkbox" ${builder.eggFree ? "checked" : ""}><span>Mostrar sello Sin huevo</span></label>`);
  }

  function openFlavor(kind,index) {
    const flavor = Number.isInteger(index) ? state.builders[kind].flavors[index] : {name:"",ingredients:"",image:"",status:"available",stockQuantity:null};
    const form = $("#flavorForm");
    form.elements.builder.value = kind;
    form.elements.index.value = Number.isInteger(index) ? index : "";
    ["name","ingredients","image","status"].forEach(field => { form.elements[field].value = flavor[field] || ""; });
    form.elements.stockQuantity.value = flavor.stockQuantity ?? "";
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
    const username = $("#loginUsername").value.trim();
    if (!username) {
      $("#loginStatus").textContent = "Escribe tu usuario y luego usa Face ID.";
      return;
    }
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
      if (!verifiedSession?.ok || verifiedSession.username !== username) throw new Error("Face ID no pudo verificarse.");
      currentSession = verifiedSession;
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
  $$('[data-action="new-product"]').forEach(button => button.addEventListener("click", () => openProduct()));
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
  $("#saveAll").addEventListener("click", () => saveState());
  ["#productSearch","#categoryFilter","#statusFilter"].forEach(selector => $(selector).addEventListener("input", renderProducts));
  ["#saleSearch","#saleStatusFilter","#salePeriodFilter"].forEach(selector => $(selector).addEventListener("input", renderSales));
  ["#inventorySearch","#inventoryKindFilter","#inventoryStateFilter"].forEach(selector => $(selector).addEventListener("input", renderInventory));
  ["#orderSearch","#orderStatusFilter"].forEach(selector => $(selector).addEventListener("input", renderOrders));
  ["#activitySearch","#activityTypeFilter"].forEach(selector => $(selector).addEventListener("input", renderActivity));
  $("#refreshInventoryButton").addEventListener("click", loadInventory);
  $("#refreshOrdersButton").addEventListener("click", loadOrders);
  $("#refreshActivityButton").addEventListener("click", loadActivity);
  $("#inventoryList").addEventListener("click", async event => {
    const deltaButton=event.target.closest("[data-stock-delta]");
    const button=event.target.closest("[data-save-stock]") || deltaButton;
    if (!button) return;
    const row=button.closest("[data-sku]");
    const input=$("[data-stock-value]",row);
    if(deltaButton) input.value=String(Math.max(Number(input.min||0),Number(input.value||0)+Number(deltaButton.dataset.stockDelta||0)));
    const payload={onHand:Number($("[data-stock-value]",row).value),trackStock:$("[data-track-stock]",row).checked};
    button.disabled=true;
    try {
      if (localMode) {
        const item=inventory.find(entry=>entry.sku===row.dataset.sku);
        if(item){item.onHand=payload.onHand;item.available=Math.max(0,payload.onHand-Number(item.reserved||0));item.trackStock=payload.trackStock;}
      } else await apiFetch(`/v1/admin/inventory/${encodeURIComponent(row.dataset.sku)}`,{method:"PUT",body:JSON.stringify({...payload,note:deltaButton?`Reposición rápida +${deltaButton.dataset.stockDelta}`:"Ajuste manual desde el panel"})});
      toast(deltaButton?`Se agregaron ${deltaButton.dataset.stockDelta} unidades.`:"Cantidad actualizada para todos los clientes.");
      if(localMode){renderInventory();renderDashboardOperations();}else await Promise.all([loadInventory(),loadActivity()]);
    } catch(error){toast(error.message||"No se pudo actualizar la cantidad.");}
    finally{button.disabled=false;}
  });
  $("#ordersList").addEventListener("click", async event => {
    const button=event.target.closest("[data-order-action]");
    if(!button)return;
    const action=button.dataset.orderAction;
    if(action!=="extend"&&!confirm(action==="confirm"?"¿Confirmar el pago y descontar definitivamente este stock?":"¿Cancelar el pedido y devolver el stock?"))return;
    button.disabled=true;
    try{await apiFetch(`/v1/admin/orders/${encodeURIComponent(button.dataset.orderId)}/${action}`,{method:"POST",body:"{}"});toast(action==="confirm"?"Pedido confirmado, stock descontado y venta registrada.":action==="cancel"?"Reserva cancelada y stock devuelto.":"Reserva extendida 30 minutos.");await Promise.all([loadOrders(),loadInventory(),loadSales(),loadActivity()]);}
    catch(error){toast(error.message||"No se pudo procesar el pedido.");}
    finally{button.disabled=false;}
  });
  $("#newSaleButton").addEventListener("click", () => openSale());

  $("#salesList").addEventListener("click", async event => {
    const edit = event.target.closest("[data-edit-sale]");
    const remove = event.target.closest("[data-delete-sale]");
    if (edit) openSale(edit.dataset.editSale);
    if (!remove || !confirm("¿Eliminar esta venta del registro?")) return;
    try {
      if (localMode) {
        sales = sales.filter(item => item.id !== remove.dataset.deleteSale);
        localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
      } else {
        await apiFetch(`/v1/admin/sales/${encodeURIComponent(remove.dataset.deleteSale)}`, {method:"DELETE",body:"{}"});
      }
      toast("Venta eliminada del registro.");
      await Promise.all([loadSales(),loadActivity()]);
    } catch (error) { toast(error.message || "No se pudo eliminar la venta."); }
  });

  $("#saleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {soldAt:data.get("soldAt"),total:Number(data.get("total")),status:data.get("status"),channel:data.get("channel"),paymentMethod:data.get("paymentMethod"),customerName:String(data.get("customerName") || "").trim(),items:String(data.get("items") || "").trim(),notes:String(data.get("notes") || "").trim()};
    if (!payload.soldAt || !Number.isFinite(payload.total) || payload.total < 0 || !payload.items) return toast("Indica fecha, monto y productos vendidos.");
    const id = String(data.get("id") || "");
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (localMode) {
        const now = new Date().toISOString();
        const record = {...payload,id:id || crypto.randomUUID(),totalCents:Math.round(payload.total * 100),currency:"USD",createdAt:sales.find(item => item.id === id)?.createdAt || now,updatedAt:now,createdBy:"revision-local",updatedBy:"revision-local"};
        const index = sales.findIndex(item => item.id === id);
        if (index >= 0) sales[index] = record; else sales.unshift(record);
        localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
      } else {
        await apiFetch(id ? `/v1/admin/sales/${encodeURIComponent(id)}` : "/v1/admin/sales", {method:id ? "PUT" : "POST",body:JSON.stringify(payload)});
      }
      $("#saleDialog").close();
      toast(id ? "Venta actualizada." : "Venta registrada.");
      await Promise.all([loadSales(),loadActivity()]);
    } catch (error) { toast(error.message || "No se pudo guardar la venta."); }
    finally { submit.disabled = false; }
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
    const product = {
      id,name:String(data.get("name")).trim(),category:data.get("category"),price:data.get("price") === "" ? null : Number(data.get("price")),image:String(data.get("image")).trim(),description:String(data.get("description")).trim(),ingredients:String(data.get("ingredients")).trim(),weight:String(data.get("weight")).trim(),availabilityLabel:String(data.get("availabilityLabel")).trim(),minimumBusinessDays:Number(data.get("minimumBusinessDays") || 0),status:data.get("status"),stockQuantity:data.get("stockQuantity") === "" ? null : Math.max(0,Number(data.get("stockQuantity"))),visible:data.get("visible") === "on",isNew:data.get("isNew") === "on",promo:data.get("promo") === "on",immediate:data.get("immediate") === "on",allowPreorder:data.get("allowPreorder") === "on",glutenFree:data.get("glutenFree") === "on",sugarFree:data.get("sugarFree") === "on",lactoseFree:data.get("lactoseFree") === "on",eggFree:data.get("eggFree") === "on",customLabels:String(data.get("customLabels") || "").split(/\n/).map(label => label.trim()).filter(Boolean),variants:parseVariants(String(data.get("variants") || "")),sizes:parseSizes(String(data.get("sizes") || ""))
    };
    const index = state.products.findIndex(item => item.id === originalId);
    if (index >= 0) state.products[index] = product; else state.products.push(product);
    markDirty();
    renderAll();
    $("#productDialog").close();
    toast("Producto listo para guardar");
  });

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
    const add = event.target.closest("[data-add-flavor]");
    const edit = event.target.closest("[data-edit-flavor]");
    const remove = event.target.closest("[data-delete-flavor]");
    const save = event.target.closest("[data-save-builder]");
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
    const flavor = {name:String(data.get("name")).trim(),ingredients:String(data.get("ingredients")).trim(),image:String(data.get("image")).trim(),status:data.get("status"),stockQuantity:data.get("stockQuantity") === "" ? null : Math.max(0,Number(data.get("stockQuantity")))};
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
    link.download = `fontana-catalogo-${new Date().toISOString().slice(0,10)}.json`;
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
