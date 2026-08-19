(() => {
  "use strict";

  const STORAGE_KEY = "fontana-admin-catalog-v1";
  const config = window.FONTANA_CONFIG || {};
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));

  const originalProducts = [
    { id:"pistacho",category:"cakes",name:"Torta de Pistacho & Frambuesa",price:60,image:"assets/pistachio-raspberry-fontana-v2.jpg",description:"Harina de almendra, frambuesa, pistacho y glaseado vegano.",ingredients:"Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho, frambuesa, semillas de amapola, alulosa y chocolate blanco vegano sin azúcar",weight:"25 CM · 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"naranja",category:"cakes",name:"Torta de Manjar de Naranja",price:47,image:"assets/manjar-naranja.jpg",description:"Naranja, harina de almendra, semillas de amapola y alulosa.",ingredients:"Harina de almendra, harina de yuca (10 %), monkfruit, aceite de coco, huevo, naranja, semillas de amapola y alulosa",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"zanahoria",category:"cakes",name:"Torta de Zanahoria",price:47,image:"assets/zanahoria-fontana-v2.jpg",description:"Zanahoria, canela, jengibre, almendras y glaseado vegano.",ingredients:"Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, zanahoria, canela, jengibre, glaseado vegano y almendras",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
    { id:"pistacho-clasico",category:"cakes",name:"Torta de Pistacho",price:55,image:"assets/pistacho-fontana-v3.jpg",description:"Pistacho, harina de almendra y glaseado vegano.",ingredients:"Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho y glaseado vegano",weight:"APROX. 1 KG",availabilityLabel:"POR ENCARGO · 2 DÍAS",minimumBusinessDays:2,status:"available" },
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

  function defaultState() {
    return { version:1, updatedAt:null, products:clone(originalProducts), builders:clone(originalBuilders) };
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return parsed?.version === 1 && Array.isArray(parsed.products) ? parsed : defaultState();
    } catch {
      return defaultState();
    }
  }

  let state = readState();
  let dirty = false;

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

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      dirty = false;
      $("#saveStatus").textContent = "Cambios guardados";
      renderAll();
      toast("Cambios guardados en este navegador");
    } catch {
      toast("No se pudo guardar. Reduce el tamaño o cantidad de imágenes.");
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
    $("#activity").innerHTML = state.updatedAt ? `<div><b>${new Date(state.updatedAt).toLocaleString("es-VE")}</b><p>La vista previa local está actualizada.</p></div>` : `<div><b>Catálogo original</b><p>Guarda el primer cambio para crear el borrador administrable.</p></div>`;
  }

  function productBadges(product) {
    const badges = [];
    badges.push(`<span class="badge ${product.status === "sold-out" ? "red" : "green"}">${product.status === "sold-out" ? "Agotado" : "Disponible"}</span>`);
    if (product.promo) badges.push('<span class="badge">Promo</span>');
    if (product.immediate) badges.push('<span class="badge">Stock de hoy</span>');
    return badges.join("");
  }

  function filteredProducts() {
    const query = $("#productSearch").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const status = $("#statusFilter").value;
    return state.products.filter(product => !product.deleted).filter(product => {
      const textMatches = !query || `${product.name} ${product.description} ${product.ingredients}`.toLowerCase().includes(query);
      const categoryMatches = category === "all" || product.category === category;
      const statusMatches = status === "all" || product.status === status || (status === "promo" && product.promo) || (status === "immediate" && product.immediate);
      return textMatches && categoryMatches && statusMatches;
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    $("#productList").innerHTML = products.length ? products.map(product => `<article class="product-row" data-product-id="${escapeHtml(product.id)}"><img src="${escapeHtml(absoluteImage(product.image))}" alt=""><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || "Sin descripción")}</p></div><div class="badges">${productBadges(product)}<span class="badge">${escapeHtml(money(product.price))}</span></div><div class="row-actions"><button data-edit="${escapeHtml(product.id)}" aria-label="Editar ${escapeHtml(product.name)}">✎</button><button data-delete="${escapeHtml(product.id)}" aria-label="Eliminar ${escapeHtml(product.name)}">×</button></div></article>`).join("") : '<div class="empty-list">No hay productos que coincidan con estos filtros.</div>';
  }

  function parseVariants(value) {
    return value.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [name,status="available"] = line.split("|").map(part => part.trim());
      return {name,status:status === "sold-out" ? "sold-out" : "available"};
    });
  }

  function parseSizes(value) {
    return value.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [name,price,status="available"] = line.split("|").map(part => part.trim());
      return {name,price:Number(price),status:status === "sold-out" ? "sold-out" : "available"};
    }).filter(size => size.name && Number.isFinite(size.price));
  }

  function openProduct(id) {
    const product = id ? state.products.find(item => item.id === id) : {id:"",name:"",category:"cakes",price:"",description:"",ingredients:"",weight:"",availabilityLabel:"",minimumBusinessDays:0,status:"available",promo:false,immediate:false,image:"",variants:[],sizes:[]};
    if (!product) return;
    const form = $("#productForm");
    $("#dialogTitle").textContent = id ? "Editar producto" : "Nuevo producto";
    form.elements.originalId.value = id || "";
    ["id","name","category","description","ingredients","weight","availabilityLabel","status","image"].forEach(field => { form.elements[field].value = product[field] ?? ""; });
    form.elements.price.value = product.price ?? "";
    form.elements.minimumBusinessDays.value = product.minimumBusinessDays ?? 0;
    form.elements.promo.checked = Boolean(product.promo);
    form.elements.immediate.checked = Boolean(product.immediate);
    form.elements.variants.value = (product.variants || []).map(item => `${item.name} | ${item.status || "available"}`).join("\n");
    form.elements.sizes.value = (product.sizes || []).map(item => `${item.name} | ${item.price} | ${item.status || "available"}`).join("\n");
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
    return canvas.toDataURL("image/jpeg",.82);
  }

  function renderBuilder(kind) {
    const builder = state.builders[kind];
    const title = kind === "fonkies" ? "Fonkies" : "Fomb";
    const pricing = kind === "fonkies"
      ? `<label>Precio 4 iguales<input data-builder-field="singlePrice" type="number" min="0" step=".01" value="${builder.singlePrice}"></label><label>Precio 4 mixtas<input data-builder-field="mixedPrice" type="number" min="0" step=".01" value="${builder.mixedPrice}"></label><label>Precio extra<input data-builder-field="extraPrice" type="number" min="0" step=".01" value="${builder.extraPrice}"></label><label>Mínimo<input data-builder-field="minimumQuantity" type="number" min="1" value="${builder.minimumQuantity}"></label>`
      : `<label>Precio caja de 4<input data-builder-size="0" data-size-field="price" type="number" min="0" step=".01" value="${builder.sizes[0]?.price ?? 15}"></label><label>Precio caja de 12<input data-builder-size="1" data-size-field="price" type="number" min="0" step=".01" value="${builder.sizes[1]?.price ?? 30}"></label><label>Precio extra<input data-builder-field="extraPrice" type="number" min="0" step=".01" value="${builder.extraPrice}"></label>`;
    $(`#${kind}Editor`).innerHTML = `<article class="builder-card" data-builder="${kind}"><div class="builder-form">${pricing}<label>Estado<select data-builder-field="status"><option value="available" ${builder.status !== "sold-out" ? "selected" : ""}>Disponible</option><option value="sold-out" ${builder.status === "sold-out" ? "selected" : ""}>Agotado</option></select></label><label class="switch"><input data-builder-field="promo" type="checkbox" ${builder.promo ? "checked" : ""}><span>Promoción del día</span></label><label class="switch"><input data-builder-field="immediate" type="checkbox" ${builder.immediate ? "checked" : ""}><span>Stock de hoy</span></label></div><div class="panel-head"><div><span class="eyebrow">${builder.flavors.length} sabores</span><h2>Sabores de ${title}</h2></div><button class="ghost" data-add-flavor="${kind}">+ Agregar sabor</button></div><div class="flavor-admin-list">${builder.flavors.map((flavor,index) => `<div class="flavor-row"><img src="${escapeHtml(absoluteImage(flavor.image))}" alt=""><div><h3>${escapeHtml(flavor.name)}</h3><p>${escapeHtml(flavor.ingredients)}</p></div><span class="badge ${flavor.status === "sold-out" ? "red" : "green"}">${flavor.status === "sold-out" ? "Agotado" : "Disponible"}</span><div class="row-actions"><button data-edit-flavor="${kind}:${index}" aria-label="Editar sabor">✎</button><button data-delete-flavor="${kind}:${index}" aria-label="Eliminar sabor">×</button></div></div>`).join("")}</div><div class="builder-actions"><button class="primary" data-save-builder="${kind}">Guardar ${title}</button></div></article>`;
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

  function renderAll() {
    renderStats();
    renderProducts();
    renderBuilder("fonkies");
    renderBuilder("fomb");
  }

  $("#loginButton").addEventListener("click", () => {
    $("#loginView").hidden = true;
    $("#adminApp").hidden = false;
    renderAll();
  });
  $$(".nav-item").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  $$('[data-view-link]').forEach(button => button.addEventListener("click", () => showView(button.dataset.viewLink)));
  $$('[data-action="new-product"]').forEach(button => button.addEventListener("click", () => openProduct()));
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
  $("#saveAll").addEventListener("click", saveState);
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
      id,name:String(data.get("name")).trim(),category:data.get("category"),price:data.get("price") === "" ? null : Number(data.get("price")),image:String(data.get("image")).trim(),description:String(data.get("description")).trim(),ingredients:String(data.get("ingredients")).trim(),weight:String(data.get("weight")).trim(),availabilityLabel:String(data.get("availabilityLabel")).trim(),minimumBusinessDays:Number(data.get("minimumBusinessDays") || 0),status:data.get("status"),promo:data.get("promo") === "on",immediate:data.get("immediate") === "on",variants:parseVariants(String(data.get("variants") || "")),sizes:parseSizes(String(data.get("sizes") || ""))
    };
    const index = state.products.findIndex(item => item.id === originalId);
    if (index >= 0) state.products[index] = product; else state.products.push(product);
    markDirty();
    renderAll();
    $("#productDialog").close();
    toast("Producto listo para guardar");
  });

  $("#productImageInput").addEventListener("change", async event => {
    const dataUrl = await optimizeImage(event.target.files[0]);
    if (!dataUrl) return;
    $("#productForm").elements.image.value = dataUrl;
    $("#productImagePreview").style.backgroundImage = `url("${dataUrl}")`;
    toast("Imagen optimizada");
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
    const flavor = {name:String(data.get("name")).trim(),ingredients:String(data.get("ingredients")).trim(),image:String(data.get("image")).trim(),status:data.get("status")};
    if (index >= 0) state.builders[kind].flavors[index] = flavor; else state.builders[kind].flavors.push(flavor);
    markDirty();
    renderBuilder(kind);
    $("#flavorDialog").close();
  });

  $("#flavorImageInput").addEventListener("change", async event => {
    const dataUrl = await optimizeImage(event.target.files[0]);
    if (!dataUrl) return;
    $("#flavorForm").elements.image.value = dataUrl;
    $("#flavorImagePreview").style.backgroundImage = `url("${dataUrl}")`;
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
      if (imported?.version !== 1 || !Array.isArray(imported.products) || !imported.builders) throw new Error();
      state = imported;
      markDirty();
      renderAll();
      toast("Copia cargada. Revisa y guarda los cambios.");
    } catch {
      toast("Ese archivo no es una copia válida de Fontana");
    }
  });

  $("#resetButton").addEventListener("click", () => {
    if (!confirm("¿Restablecer el catálogo original? Se perderá el borrador local.")) return;
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    dirty = false;
    renderAll();
    $("#saveStatus").textContent = "Catálogo original";
    toast("Catálogo original restablecido");
  });

  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
  });
})();
