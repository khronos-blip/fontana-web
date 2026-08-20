(async () => {
  "use strict";

  const STORAGE_KEY = "fontana-admin-catalog-v1";
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
    next.products = (next.products || clone(originalProducts)).map(product => ({
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
    return normalizeState({ version:2, updatedAt:null, products:clone(originalProducts), builders:clone(originalBuilders) });
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
    $("#loginView").hidden = true;
    $("#adminApp").hidden = false;
    renderAll();
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
      } else {
        const payload = await apiFetch("/v1/admin/catalog", {method:"PUT", body:JSON.stringify({state, expectedRevision:remoteRevision})});
        remoteRevision = Number(payload?.revision || remoteRevision + 1);
      }
      dirty = false;
      $("#saveStatus").textContent = localMode ? "Borrador local guardado" : "Publicado para todos";
      renderAll();
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
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function renderStats() {
    const products = state.products.filter(product => !product.deleted);
    const stats = [
      [products.length,"Productos"],
      [products.filter(product => product.status !== "sold-out").length,"Disponibles"],
      [products.filter(product => product.promo).length,"Promociones"],
      [products.filter(product => product.immediate).length,"Stock de hoy"]
    ];
    $("#stats").innerHTML = stats.map(([value,label]) => `<article class="stat"><b>${value}</b><span>${label}</span></article>`).join("");
    $("#activity").innerHTML = state.updatedAt ? `<div><b>${new Date(state.updatedAt).toLocaleString("es-VE")}</b><p>${localMode ? "El borrador local está actualizado." : "La tienda pública está actualizada."}</p></div>` : `<div><b>Catálogo inicial</b><p>Guarda el primer cambio para publicarlo.</p></div>`;
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
        await apiFetch("/v1/auth/login", {method:"POST",body:JSON.stringify({username,password})});
        await loadRemoteState();
      }
      await enterPanel();
    } catch (error) {
      $("#loginStatus").textContent = error.status === 401 ? "Usuario o contraseña incorrectos." : error.message === "API_NOT_CONFIGURED" ? "La API todavía no está configurada." : error.message;
    } finally { button.disabled = false; }
  });
  ["#loginUsername", "#loginPassword"].forEach(selector => $(selector).addEventListener("keydown", event => { if (event.key === "Enter") $("#loginButton").click(); }));
  $("#logoutButton").addEventListener("click", async () => {
    if (!localMode) await apiFetch("/v1/auth/logout", {method:"POST",body:"{}"}).catch(() => {});
    showLogin("Sesión cerrada.");
  });
  $$(".nav-item").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener("click", () => showView(button.dataset.viewLink)));
  $$('[data-action="new-product"]').forEach(button => button.addEventListener("click", () => openProduct()));
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
  $("#saveAll").addEventListener("click", () => saveState());
  ["#productSearch","#categoryFilter","#statusFilter"].forEach(selector => $(selector).addEventListener("input", renderProducts));

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
    showView("products");
    $("#statusFilter").value = button.dataset.quick;
    renderProducts();
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
      showLogin("Modo local de revisión: acceso abierto en este dispositivo.");
      return;
    }
    try {
      await loadRemoteState();
      await enterPanel();
    } catch (error) {
      showLogin(error.status === 401 ? "Inicia sesión para administrar Fontana." : "No se pudo conectar con la base de datos.");
    }
  }

  await bootstrap();
})();
