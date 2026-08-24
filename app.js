(async () => {
  "use strict";

  const config = window.FONTANA_CONFIG || {};
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const adminStorageKey = "fontana-admin-catalog-v1";
  const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
  let adminStateVerified = false;
  const adminState = await readAdminState();
  const productionWithElectricity = localMode ? adminState?.settings?.productionWithElectricity !== false : adminStateVerified && adminState?.operations?.electricityEnabled !== false;
  const stockTodayOpen = adminState?.settings?.stockTodayOpen !== false;
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  const toast = $("#toast");
  const cartItems = $("#cartItems");
  const cartFooter = $("#cartFooter");
  const checkoutForm = $("#checkoutForm");
  const drawerTitle = $("#drawerTitle");
  const backToCart = $("#backToCart");
  const storageKey = "fontana-cart-v1";
  let cart = readCart();
  let stockValidationPending = false;
  const productAddQueues = new Map();

  async function readAdminState() {
    try {
      const stored = JSON.parse(localStorage.getItem(adminStorageKey) || "null");
      if (localMode) { adminStateVerified = true; return stored && Array.isArray(stored.products) ? stored : null; }
    } catch { if (localMode) return null; }
    const apiBase = String(config.adminApiBase || "").replace(/\/$/, "");
    if (!apiBase) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(config.catalogApiTimeoutMs || 5000));
    try {
      const response = await fetch(`${apiBase}/v1/catalog`, {signal:controller.signal,cache:"no-store"});
      if (!response.ok) return null;
      const payload = await response.json();
      if (payload?.state && Array.isArray(payload.state.products) && payload.state.operations?.verified === true) adminStateVerified = true;
      return payload?.state && Array.isArray(payload.state.products) ? payload.state : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }

  function applyAdminCatalog() {
    if (!adminState || !Array.isArray(adminState.products)) return;
    $$("#products > .product").forEach(product => product.remove());
    const configuredProducts = Array.isArray(config.dynamicCatalog) ? config.dynamicCatalog : [];
    const managedIds = new Set(adminState.products.map(product => product.id));
    const newlyConfiguredProducts = configuredProducts.filter(product => !managedIds.has(product.id));
    config.dynamicCatalog = [
      ...adminState.products.filter(product => !product.deleted && product.visible !== false),
      ...newlyConfiguredProducts
    ];
    config.dynamicCatalog.forEach(product => {
      if (!product.id || !Number.isFinite(Number(product.minimumBusinessDays))) return;
      config.leadTimesByProduct ||= {};
      config.leadTimesByProduct[product.id] = {
        minimumBusinessDays: Math.max(0, Number(product.minimumBusinessDays)),
        label: product.leadTimeLabel || `${product.name}: sujeto a confirmación por WhatsApp`
      };
    });
  }

  function readCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(stored)) return [];
      // Los carritos anteriores al inventario central no contienen SKU ni
      // opciones estructuradas. Empezar uno nuevo evita descontar una
      // presentación o un sabor equivocado.
      if (stored.length && !stored.every(item => item?.inventory?.kind)) {
        localStorage.removeItem(storageKey);
        return [];
      }
      return stored;
    } catch {
      return [];
    }
  }

  function stockChecks(items = cart, extraChecks = []) {
    const checks = [];
    for (const item of items) {
      const inventory = item.inventory || {};
      const itemQuantity = Math.max(0, Number(item.qty || 0));
      if (!itemQuantity || inventory.preorder) continue;
      if (inventory.kind === "product") {
        checks.push({kind:"product",productId:inventory.productId || item.productId,size:inventory.size || "",variant:inventory.variant || "",quantity:itemQuantity});
        continue;
      }
      if (inventory.kind !== "fonkies" && inventory.kind !== "fomb") continue;
      for (const flavor of inventory.flavors || []) {
        const perBox = Math.max(0, Number(flavor.quantity ?? flavor.qty ?? 0));
        if (perBox) checks.push({kind:inventory.kind,flavor:flavor.name,quantity:perBox * itemQuantity});
      }
    }
    return [...checks, ...extraChecks].filter(check => Number(check.quantity) > 0);
  }

  function locallyAvailable(checks) {
    if (!adminState) return true;
    const demands = new Map();
    for (const check of checks) {
      const key = check.kind === "product"
        ? `product:${check.productId}:${check.size || ""}:${check.variant || ""}`
        : `${check.kind}:${check.flavor}`;
      demands.set(key, {check,quantity:Number(check.quantity) + Number(demands.get(key)?.quantity || 0)});
    }
    for (const {check,quantity} of demands.values()) {
      let configuredQuantity = null;
      if (check.kind === "product") {
        const product = adminState.products?.find(item => item.id === check.productId);
        const size = product?.sizes?.find(item => item.name === check.size);
        const variant = product?.variants?.find(item => item.name === check.variant);
        configuredQuantity = variant?.stockQuantity ?? size?.stockQuantity ?? product?.stockQuantity ?? null;
      } else {
        const flavor = adminState.builders?.[check.kind]?.flavors?.find(item => item.name === check.flavor);
        configuredQuantity = flavor?.stockQuantity ?? null;
      }
      if (configuredQuantity !== null && configuredQuantity !== "" && quantity > Number(configuredQuantity)) return false;
    }
    return true;
  }

  async function validateStock(extraChecks = [], items = cart) {
    const checks = stockChecks(items, extraChecks);
    if (!checks.length) return {ok:true};
    if (localMode) return locallyAvailable(checks)
      ? {ok:true}
      : {ok:false,error:"No hay suficientes unidades disponibles para esa cantidad."};
    const apiBase = String(config.adminApiBase || "").replace(/\/$/, "");
    if (!apiBase) return {ok:false,error:"No pudimos comprobar el inventario en este momento."};
    try {
      const response = await fetch(`${apiBase}/v1/orders/validate`, {
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({checks})
      });
      const payload = await response.json().catch(() => ({}));
      return response.ok ? {ok:true} : {ok:false,error:payload.error || "No hay suficientes unidades disponibles para esa cantidad."};
    } catch {
      return {ok:false,error:"No pudimos comprobar el inventario. Inténtalo otra vez."};
    }
  }

  function reservationItems() {
    return cart.map(item => ({
      quantity:item.qty,
      kind:item.inventory?.kind || "product",
      productId:item.inventory?.productId || item.productId,
      size:item.inventory?.size || "",
      variant:item.inventory?.variant || "",
      flavors:(item.inventory?.flavors || []).map(flavor => ({name:flavor.name,quantity:Number(flavor.quantity ?? flavor.qty ?? 0)})),
      boxSize:item.inventory?.boxSize,
      extraCount:item.inventory?.extraCount,
      preorder:Boolean(item.inventory?.preorder)
    }));
  }

  function money(value) {
    return new Intl.NumberFormat(config.locale || "es-VE", {
      style: "currency",
      currency: config.currency || "USD"
    }).format(value);
  }

  function setupWhatsappChatLink() {
    const link = $("#whatsappChatLink");
    if (!link) return;
    const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");
    if (!whatsappNumber) {
      link.hidden = true;
      return;
    }
    link.href = `https://wa.me/${whatsappNumber}`;
  }

  function setupElectricityNotice() {
    const notice = $("#electricityNotice");
    if (!notice) return;
    notice.hidden = productionWithElectricity;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

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

  function resolvedDietary(product) {
    const defaults = dietaryDefaults(product);
    return {
      glutenFree: Object.prototype.hasOwnProperty.call(product, "glutenFree") ? Boolean(product.glutenFree) : defaults.glutenFree,
      sugarFree: Object.prototype.hasOwnProperty.call(product, "sugarFree") ? Boolean(product.sugarFree) : defaults.sugarFree,
      lactoseFree: Object.prototype.hasOwnProperty.call(product, "lactoseFree") ? Boolean(product.lactoseFree) : defaults.lactoseFree,
      eggFree: Object.prototype.hasOwnProperty.call(product, "eggFree") ? Boolean(product.eggFree) : defaults.eggFree
    };
  }

  function dietarySealSvg(kind) {
    const symbols = {
      gluten: '<path d="M20 10v20M20 15c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 5c4 0 6-2 6-5-4 0-6 2-6 5Zm0 5c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 5c4 0 6-2 6-5-4 0-6 2-6 5Z"/>',
      sugar: '<path d="m14 15 6-3 6 3v9l-6 4-6-4Z"/><path d="m14 15 6 4 6-4M20 19v9"/>',
      lactose: '<path d="M16 11h8M17 11v4l-3 3v11h12V18l-3-3v-4M14 21h12"/>',
      egg: '<path d="M20 10c-3.8 0-8 8-8 13.1a8 8 0 0 0 16 0C28 18 23.8 10 20 10Z"/>'
    };
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/><circle class="seal-ring-inner" cx="20" cy="20" r="14.2"/>${symbols[kind]}<path d="M8 8l24 24"/></svg>`;
  }

  function dietarySealsMarkup(flags, extraClass = "") {
    const seals = [
      [flags.glutenFree, "gluten", "Sin gluten"],
      [flags.sugarFree, "sugar", "Sin azúcar"],
      [flags.lactoseFree, "lactose", "Sin lactosa"],
      [flags.eggFree, "egg", "Sin huevo"]
    ].filter(([active]) => active);
    if (!seals.length) return "";
    return `<div class="product-dietary-seals${extraClass ? ` ${extraClass}` : ""}" aria-label="Características de este producto">${seals.map(([,kind,label]) => `<div class="product-dietary-seal">${dietarySealSvg(kind)}<span>${label}</span></div>`).join("")}</div>`;
  }

  function elementDietaryFlags(element, defaultAll = false) {
    const parse = (key, fallback) => element.dataset[key] === undefined ? fallback : element.dataset[key] === "true";
    if (element.dataset.glutenFree !== undefined || element.dataset.sugarFree !== undefined || element.dataset.lactoseFree !== undefined || element.dataset.eggFree !== undefined) {
      return {glutenFree:parse("glutenFree",false),sugarFree:parse("sugarFree",false),lactoseFree:parse("lactoseFree",false),eggFree:parse("eggFree",false)};
    }
    const safety = String(element.dataset.safety || "").toLowerCase();
    if (safety) return {glutenFree:safety.includes("sin gluten"),sugarFree:safety.includes("sin azúcar"),lactoseFree:safety.includes("sin lactosa"),eggFree:safety.includes("sin huevo")};
    return {glutenFree:defaultAll,sugarFree:defaultAll,lactoseFree:defaultAll,eggFree:false};
  }

  function enhanceDietarySeals() {
    $$(".product").forEach(product => {
      $(".product-dietary-seals", product)?.remove();
      const description = $(".product-body > p", product);
      const markup = dietarySealsMarkup(elementDietaryFlags(product));
      if (description && markup) description.insertAdjacentHTML("afterend", markup);
    });
    [[".fonkie-builder", ".fonkie-builder-head"], [".fomb-builder", ".builder-head"]].forEach(([builderSelector, headSelector]) => {
      const builder = $(builderSelector);
      if (!builder) return;
      $(".builder-dietary-seals", builder)?.remove();
      const head = $(headSelector, builder);
      const markup = dietarySealsMarkup(elementDietaryFlags(builder, true), "builder-dietary-seals");
      if (head && markup) head.insertAdjacentHTML("afterend", markup);
    });
  }

  function renderBuilderTags(element, builder) {
    $(".builder-admin-tags", element)?.remove();
    const soldOut = builder.status === "sold-out" || builder.stockQuantity === 0;
    const temporarilyUnavailable = Boolean(builder.temporarilyUnavailable || element.dataset.temporarilyUnavailable === "true");
    const labels = [temporarilyUnavailable ? "TEMPORALMENTE NO DISPONIBLE" : "", soldOut ? "AGOTADO" : "", soldOut && builder.allowPreorder ? "PRE-ORDER" : "", builder.isNew ? "NUEVO" : "", builder.promo ? "PROMOCIÓN DEL DÍA" : "", stockTodayOpen && builder.immediate ? "STOCK DE HOY" : ""].filter(Boolean);
    if (!labels.length) return;
    const tags = document.createElement("div");
    tags.className = "builder-admin-tags";
    tags.innerHTML = labels.map(label => {
      const statusClass = label === "TEMPORALMENTE NO DISPONIBLE" || label === "AGOTADO" ? " status-unavailable" : label === "PRE-ORDER" ? " status-preorder" : "";
      return `<span class="${statusClass.trim()}">${escapeHtml(label)}</span>`;
    }).join("");
    element.prepend(tags);
  }

  function applyAdminBuilders() {
    if (!adminState?.builders) {
      const fonkieBuilder = $(".fonkie-builder");
      if (fonkieBuilder && !productionWithElectricity) fonkieBuilder.dataset.temporarilyUnavailable = "true";
      return;
    }
    const fonkies = adminState.builders.fonkies;
    const fonkieBuilder = $(".fonkie-builder");
    if (fonkies && fonkieBuilder) {
      fonkieBuilder.dataset.promo = String(Boolean(fonkies.promo));
      fonkieBuilder.dataset.immediate = String(stockTodayOpen && Boolean(fonkies.immediate));
      fonkieBuilder.dataset.new = String(Boolean(fonkies.isNew));
      fonkieBuilder.dataset.preorder = String(Boolean(fonkies.allowPreorder));
      fonkieBuilder.dataset.glutenFree = String(fonkies.glutenFree !== false);
      fonkieBuilder.dataset.sugarFree = String(fonkies.sugarFree !== false);
      fonkieBuilder.dataset.lactoseFree = String(fonkies.lactoseFree !== false);
      fonkieBuilder.dataset.eggFree = String(Boolean(fonkies.eggFree));
      fonkieBuilder.dataset.soldOut = String(fonkies.status === "sold-out" || fonkies.stockQuantity === 0);
      fonkieBuilder.dataset.temporarilyUnavailable = String(Boolean(fonkies.temporarilyUnavailable || !productionWithElectricity));
      fonkieBuilder.hidden = fonkies.visible === false;
      renderBuilderTags(fonkieBuilder, fonkies);
      const flavors = Array.isArray(fonkies.flavors) ? fonkies.flavors : [];
      const gallery = $(".fonkie-gallery-track", fonkieBuilder);
      const chooser = $(".fonkie-flavors", fonkieBuilder);
      const count = $(".gallery-label-meta span", fonkieBuilder);
      if (count) count.textContent = `${flavors.length} sabores`;
      if (gallery) gallery.innerHTML = flavors.map(flavor => { const sold = flavor.status === "sold-out" || flavor.stockQuantity === 0; return `<figure class="fonkie-gallery-card${sold ? " builder-flavor-sold-out" : ""}"><img src="${escapeHtml(flavor.image || "assets/logo.png")}" alt="Fonkie ${escapeHtml(flavor.name)}"><span>${escapeHtml(flavor.name)}${sold ? " · Agotado" : ""}</span></figure>`; }).join("");
      if (chooser) chooser.innerHTML = flavors.map(flavor => { const sold = flavor.status === "sold-out" || flavor.stockQuantity === 0; return `<div class="fonkie-flavor" data-flavor="${escapeHtml(flavor.name)}" data-sold-out="${sold}"><span class="fonkie-flavor-name">${escapeHtml(flavor.name)}${sold ? " · Agotado" : ""}</span><div class="fonkie-stepper"><button type="button" data-delta="-1" aria-label="Restar ${escapeHtml(flavor.name)}" ${sold ? "disabled" : ""}>−</button><output>0</output><button type="button" data-delta="1" aria-label="Sumar ${escapeHtml(flavor.name)}" ${sold ? "disabled" : ""}>+</button></div></div>`; }).join("");
      const availableIngredients = flavors.map(flavor => `${flavor.name}: ${flavor.ingredients || "Ingredientes pendientes de confirmar con Fontana"}`).join(". ");
      fonkieBuilder.dataset.ingredients = availableIngredients;
      if (fonkies.image) fonkieBuilder.dataset.image = fonkies.image;
    }

    const fomb = adminState.builders.fomb;
    const fombBuilder = $(".fomb-builder");
    if (fomb && fombBuilder) {
      fombBuilder.dataset.promo = String(Boolean(fomb.promo));
      fombBuilder.dataset.immediate = String(stockTodayOpen && Boolean(fomb.immediate));
      fombBuilder.dataset.new = String(Boolean(fomb.isNew));
      fombBuilder.dataset.preorder = String(Boolean(fomb.allowPreorder));
      fombBuilder.dataset.glutenFree = String(fomb.glutenFree !== false);
      fombBuilder.dataset.sugarFree = String(fomb.sugarFree !== false);
      fombBuilder.dataset.lactoseFree = String(fomb.lactoseFree !== false);
      fombBuilder.dataset.eggFree = String(fomb.eggFree !== false);
      fombBuilder.dataset.soldOut = String(fomb.status === "sold-out" || fomb.stockQuantity === 0);
      fombBuilder.dataset.temporarilyUnavailable = String(Boolean(fomb.temporarilyUnavailable));
      fombBuilder.hidden = fomb.visible === false;
      renderBuilderTags(fombBuilder, fomb);
      const flavors = Array.isArray(fomb.flavors) ? fomb.flavors : [];
      const gallery = $(".builder-gallery-track", fombBuilder);
      const chooser = $(".fomb-flavors", fombBuilder);
      const count = $(".gallery-label-meta span", fombBuilder);
      if (count) count.textContent = `${flavors.length} sabores`;
      if (gallery) gallery.innerHTML = flavors.map(flavor => { const sold = flavor.status === "sold-out" || flavor.stockQuantity === 0; return `<figure class="builder-gallery-card${sold ? " builder-flavor-sold-out" : ""}"><img src="${escapeHtml(flavor.image || "assets/logo.png")}" alt="Fomb ${escapeHtml(flavor.name)}"><span>${escapeHtml(flavor.name)}${sold ? " · Agotado" : ""}</span></figure>`; }).join("");
      if (chooser) chooser.innerHTML = flavors.map(flavor => { const sold = flavor.status === "sold-out" || flavor.stockQuantity === 0; return `<div class="fomb-flavor" data-flavor="${escapeHtml(flavor.name)}" data-sold-out="${sold}"><span class="fonkie-flavor-name">${escapeHtml(flavor.name)}${sold ? " · Agotado" : ""}</span><div class="fonkie-stepper"><button type="button" data-delta="-1" aria-label="Restar ${escapeHtml(flavor.name)}" ${sold ? "disabled" : ""}>−</button><output>0</output><button type="button" data-delta="1" aria-label="Sumar ${escapeHtml(flavor.name)}" ${sold ? "disabled" : ""}>+</button></div></div>`; }).join("");
      const sizes = Array.isArray(fomb.sizes) && fomb.sizes.length ? fomb.sizes : [{ quantity: 4, price: 15 }, { quantity: 12, price: 30 }];
      const sizeOptions = $(".fomb-size-options", fombBuilder);
      if (sizeOptions) sizeOptions.innerHTML = sizes.map((size, index) => `<label class="fomb-size-option"><input type="radio" name="fombSize" value="${Number(size.quantity)}" data-price="${Number(size.price)}" ${index === 0 ? "checked" : ""}> Caja de ${Number(size.quantity)} · ${money(Number(size.price))}</label>`).join("");
      const extraLabel = $(".fomb-extras span", fombBuilder);
      if (extraLabel) extraLabel.textContent = `Bombones extra · ${money(Number(fomb.extraPrice ?? 3.5))} c/u`;
      fombBuilder.dataset.ingredients = flavors.map(flavor => `${flavor.name} Fomb: ${flavor.ingredients || "Ingredientes pendientes de confirmar con Fontana"}`).join(". ");
      if (fomb.image) fombBuilder.dataset.image = fomb.image;
    }
  }

  function productIngredients(id) {
    return $(`[data-id="${id}"]`)?.dataset.ingredients || "Ingredientes completos pendientes de confirmar con Fontana";
  }

  function enhanceProductSafety() {
    $$(".product").forEach(product => {
      if (!product.dataset.ingredients) return;
      const body = $(".product-body", product);
      const footer = $(".product-footer", product);
      const details = document.createElement("details");
      details.className = "product-safety";
      const summary = document.createElement("summary");
      summary.textContent = "Ingredientes";
      const note = document.createElement("div");
      const ingredients = productIngredients(product.dataset.id);
      const productType = product.dataset.productType ? `Categoría: ${product.dataset.productType}. ` : "";
      const leadTime = config.leadTimesByProduct?.[product.dataset.id]?.label;
      note.textContent = `${productType}Ingredientes: ${ingredients}.${leadTime ? ` Preparación: ${leadTime}.` : ""}`;
      details.append(summary, note);
      body.insertBefore(details, footer);
    });
  }

  function renderDynamicCatalog() {
    const products = Array.isArray(config.dynamicCatalog) ? config.dynamicCatalog : [];
    const container = $("#products");
    const emptyState = $("#emptyFilterState");
    if (!container || !emptyState || !products.length) return;
    const allowedCategories = new Set(["cakes", "snacks", "salado", "beverages"]);
    const cards = products.map((product, index) => {
      const category = allowedCategories.has(product.category) ? product.category : "snacks";
      const productId = String(product.id || index + 1).replace(/[^a-z0-9_-]/gi, "-");
      const id = `catalog-${productId}`;
      const name = String(product.name || "Producto Fontana");
      const price = Number(product.price);
      const hasPrice = product.price !== null && product.price !== "" && Number.isFinite(price) && price >= 0;
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const sizes = Array.isArray(product.sizes) ? product.sizes : [];
      const availableVariants = variants.filter(variant => variant.status !== "sold-out" && variant.stockQuantity !== 0);
      const availableSizes = sizes.filter(size => size.status !== "sold-out" && size.stockQuantity !== 0);
      const temporarilyUnavailable = Boolean(product.temporarilyUnavailable || (!productionWithElectricity && product.requiresElectricity));
      const soldOut = product.status === "sold-out" || product.stockQuantity === 0 || (variants.length > 0 && availableVariants.length === 0) || (sizes.length > 0 && availableSizes.length === 0);
      const preorder = soldOut && Boolean(product.allowPreorder);
      const description = String(product.description || "Disponibilidad sujeta a confirmación por WhatsApp.");
      const ingredients = String(product.ingredients || "");
      const dietary = resolvedDietary(product);
      const badges = [];
      if (soldOut) badges.push("AGOTADO");
      if (temporarilyUnavailable) badges.unshift("TEMPORALMENTE NO DISPONIBLE");
      if (preorder) badges.push("PRE-ORDER");
      if (product.isNew) badges.push("NUEVO");
      if (product.promo) badges.push("PROMOCIÓN DEL DÍA");
      if (stockTodayOpen && product.immediate) badges.push("STOCK DE HOY");
      (Array.isArray(product.customLabels) ? product.customLabels : []).forEach(label => { if (label) badges.push(String(label).slice(0,40)); });
      const image = product.image
        ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(name)}">`
        : `<div class="product-placeholder"><div><b>${escapeHtml(name)}</b><small>Foto por actualizar</small></div></div>`;
      const sizePrices = availableSizes.map(size => Number(size.price)).filter(value => Number.isFinite(value));
      const minimumSizePrice = sizePrices.length ? Math.min(...sizePrices) : null;
      const priceCopy = minimumSizePrice !== null ? `Desde ${money(minimumSizePrice)}` : hasPrice ? money(price) : "Cotizar";
      const classes = ["product", (soldOut && !preorder) || temporarilyUnavailable ? "product-sold-out" : "", temporarilyUnavailable ? "product-temporarily-unavailable" : "", preorder ? "product-preorder" : "", hasPrice ? "" : "product-unpriced"].filter(Boolean).join(" ");
      const cartImage = product.image || "assets/logo.png";
      const variantControl = variants.length ? `<div class="product-variants"><label for="variant-${escapeHtml(productId)}">${escapeHtml(product.variantLabel || "Elige el sabor")}</label><select class="product-variant" id="variant-${escapeHtml(productId)}" ${soldOut && !preorder ? "disabled" : ""}>${variants.map(variant => {
        const optionSold = variant.status === "sold-out" || variant.stockQuantity === 0;
        const unavailable = optionSold && !preorder;
        return `<option value="${unavailable ? "" : escapeHtml(variant.name)}" ${unavailable ? "disabled" : ""}>${escapeHtml(variant.name)}${optionSold ? preorder ? " · Pre-order" : " · Agotado" : ""}</option>`;
      }).join("")}</select></div>` : "";
      const sizeControl = sizes.length ? `<div class="product-variants"><label for="size-${escapeHtml(productId)}">${escapeHtml(product.sizeLabel || "Elige la presentación")}</label><select class="product-size" id="size-${escapeHtml(productId)}" ${soldOut && !preorder ? "disabled" : ""}>${sizes.map(size => {
        const optionSold = size.status === "sold-out" || size.stockQuantity === 0;
        const unavailable = optionSold && !preorder;
        return `<option value="${unavailable ? "" : escapeHtml(size.name)}" data-price="${Number(size.price)}" ${unavailable ? "disabled" : ""}>${escapeHtml(size.name)} · ${money(Number(size.price))}${optionSold ? preorder ? " · Pre-order" : " · Agotado" : ""}</option>`;
      }).join("")}</select></div>` : "";
      const badgeMarkup = badges.length ? `<div class="product-tags">${badges.map((badge,index) => { const statusClass = badge === "TEMPORALMENTE NO DISPONIBLE" || badge === "AGOTADO" ? " status-unavailable" : badge === "PRE-ORDER" ? " status-preorder" : ""; return `<span class="product-tag${index ? " secondary" : ""}${statusClass}">${escapeHtml(badge)}</span>`; }).join("")}</div>` : "";
      const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");
      const quoteText = `Hola Fontana sin gluten 💜 Quisiera consultar los sabores y el presupuesto para ${name}.`;
      const quoteButton = !hasPrice && whatsappNumber
        ? `<a class="product-quote" href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(quoteText)}" target="_blank" rel="noopener" aria-label="Consultar ${escapeHtml(name)} por WhatsApp">Consultar por WhatsApp</a>`
        : "";
      const footerCopy = product.weight || product.availabilityLabel;
      return `<article class="${classes}" data-category="${category}" data-id="${escapeHtml(id)}" data-product-id="${escapeHtml(productId)}" data-name="${escapeHtml(name)}" data-price="${hasPrice ? price : ""}" data-image="${escapeHtml(cartImage)}" data-ingredients="${escapeHtml(ingredients)}" data-gluten-free="${dietary.glutenFree}" data-sugar-free="${dietary.sugarFree}" data-lactose-free="${dietary.lactoseFree}" data-egg-free="${dietary.eggFree}" data-promo="${Boolean(product.promo)}" data-immediate="${stockTodayOpen && Boolean(product.immediate)}" data-sold-out="${soldOut}" data-temporarily-unavailable="${temporarilyUnavailable}" data-preorder="${preorder}"><div class="product-media">${image}${badgeMarkup}</div><div class="product-body"><div class="product-top"><h3>${escapeHtml(name)}</h3><span class="price">${priceCopy}</span></div><p>${escapeHtml(description)}</p>${sizeControl}${variantControl}<div class="product-footer"><span class="diet">${escapeHtml(String(temporarilyUnavailable ? "TEMPORALMENTE NO DISPONIBLE" : footerCopy || "DISPONIBLE"))}</span>${hasPrice && (!soldOut || preorder) && !temporarilyUnavailable ? `<button class="add" aria-label="${preorder ? "Solicitar pre-order de" : "Agregar"} ${escapeHtml(name)}">${preorder ? "PRE-ORDER" : "+"}</button>` : temporarilyUnavailable ? "" : quoteButton}</div></div></article>`;
    }).filter(Boolean).join("");
    emptyState.insertAdjacentHTML("beforebegin", cards);
  }

  function setupCatalogGroups() {
    const container = $("#products");
    if (!container || container.classList.contains("catalog-organized")) return;
    const categories = ["cakes", "fonkies", "fomb", "salado", "beverages", "snacks"];
    const categoryLabels = {
      cakes: "Tortas",
      fonkies: "Fonkies",
      fomb: "Bombones",
      salado: "Salados",
      beverages: "Bebidas",
      snacks: "Otros antojos"
    };
    const catalogItems = $$(".product, .fonkie-builder, .builder-panel", container);
    categories.forEach(category => {
      const items = catalogItems.filter(item => item.dataset.category === category);
      if (!items.length) return;
      const group = document.createElement("section");
      group.className = "catalog-group";
      group.dataset.catalogGroup = category;
      const heading = document.createElement("div");
      heading.className = "catalog-group-heading";
      const line = document.createElement("span");
      line.className = "catalog-group-line";
      line.setAttribute("aria-hidden", "true");
      const title = document.createElement("h3");
      title.id = `catalog-heading-${category}`;
      title.textContent = categoryLabels[category];
      heading.append(line, title);
      group.setAttribute("aria-labelledby", title.id);
      const grid = document.createElement("div");
      grid.className = "catalog-group-grid";
      items.forEach(item => grid.appendChild(item));
      group.append(heading, grid);
      container.insertBefore(group, $("#emptyFilterState"));
    });
    container.classList.add("catalog-organized");
  }

  function syncCatalogGroups() {
    $$(".catalog-group").forEach(group => {
      const items = [...group.querySelector(".catalog-group-grid").children];
      const visibleItems = items.filter(item => !item.classList.contains("hidden"));
      group.hidden = visibleItems.length === 0;
    });
  }

  function say(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(say.timer);
    say.timer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function stockLimitNotice(error, itemName = "este producto") {
    if (/No pudimos|momento|Inténtalo/i.test(error || "")) return error;
    if (!/suficientes|disponible|inventario|stock|cantidad/i.test(error || "")) return error;
    return `Llegaste al máximo disponible de ${itemName}. No puedes agregar más por ahora.`;
  }

  function openCart() {
    showCartStep();
    drawer.classList.add("open");
    backdrop.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("locked");
  }

  function closeCart() {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("locked");
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(cart));
    renderCart();
  }

  function productSelection(card) {
    const selectedVariant = $(".product-variant", card)?.value || "";
    const sizeSelect = $(".product-size", card);
    const selectedSize = sizeSelect?.value || "";
    if ($(".product-variant", card) && !selectedVariant) {
      return { error: "Este sabor está agotado" };
    }
    const preorder = card.dataset.preorder === "true";
    const selectedChoices = [selectedSize, selectedVariant, preorder ? "PRE-ORDER · Sujeto a confirmación" : ""].filter(Boolean);
    const choiceSlug = selectedChoices.join("-").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const id = choiceSlug ? `${card.dataset.id}-${choiceSlug}` : card.dataset.id;
    const selectedPrice = sizeSelect ? Number(sizeSelect.selectedOptions[0]?.dataset.price) : Number(card.dataset.price);
    return {
      id,
      preorder,
      item: {
        id,
        productId: card.dataset.productId || id,
        category: card.dataset.category || "",
        name: card.dataset.name,
        price: selectedPrice,
        image: card.dataset.image,
        ingredients: productIngredients(card.dataset.id),
        choices: selectedChoices.join(" · ") || undefined,
        inventory: { kind:"product", productId:card.dataset.productId || card.dataset.id, size:selectedSize, variant:selectedVariant, preorder },
        qty: 0
      }
    };
  }

  function addItemQuantity(item, quantity) {
    if (quantity <= 0) return;
    const found = cart.find(entry => entry.id === item.id);
    if (found) found.qty += quantity;
    else cart.push({...item, qty:quantity});
  }

  function proposedCart(item, quantity) {
    const proposal = cart.map(entry => ({...entry, inventory:{...entry.inventory}}));
    const found = proposal.find(entry => entry.id === item.id);
    if (found) found.qty += quantity;
    else proposal.push({...item, inventory:{...item.inventory}, qty:quantity});
    return proposal;
  }

  async function maximumValidAddition(item, requested) {
    const fullValidation = await validateStock([], proposedCart(item, requested));
    if (fullValidation.ok) return {quantity:requested};
    if (/No pudimos|momento|Inténtalo/i.test(fullValidation.error || "")) return {quantity:0,error:fullValidation.error};
    let low = 0;
    let high = requested - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const validation = await validateStock([], proposedCart(item, middle));
      if (validation.ok) low = middle;
      else high = middle - 1;
    }
    return {quantity:low,error:fullValidation.error};
  }

  function displayedProductQuantity(selection) {
    if (!selection || selection.error) return 0;
    const committed = Number(cart.find(item => item.id === selection.id)?.qty || 0);
    const queue = productAddQueues.get(selection.id);
    return committed + Number(queue?.pending || 0) + Math.max(0, Number(queue?.inFlight || 0) - Number(queue?.cancelInFlight || 0));
  }

  function syncProductQuantityControls() {
    $$(".product-quantity-control").forEach(control => {
      const card = control.closest(".product");
      const selection = productSelection(card);
      const quantity = displayedProductQuantity(selection);
      const minus = $(".product-minus", control);
      const output = $(".product-menu-qty", control);
      minus.hidden = quantity <= 0;
      output.hidden = quantity <= 0;
      output.textContent = quantity;
      output.setAttribute("aria-label", `${quantity} en el pedido`);
      control.classList.toggle("has-quantity", quantity > 0);
    });
  }

  function scheduleProductQueue(selection) {
    let queue = productAddQueues.get(selection.id);
    if (!queue) {
      queue = {item:selection.item,pending:0,inFlight:0,cancelInFlight:0,processing:false,timer:null};
      productAddQueues.set(selection.id, queue);
    }
    queue.item = selection.item;
    clearTimeout(queue.timer);
    queue.timer = setTimeout(() => processProductQueue(selection.id), 70);
    return queue;
  }

  async function processProductQueue(id) {
    const queue = productAddQueues.get(id);
    if (!queue || queue.processing) return;
    queue.processing = true;
    clearTimeout(queue.timer);
    while (queue.pending > 0) {
      const requested = queue.pending;
      queue.pending = 0;
      queue.inFlight = requested;
      queue.cancelInFlight = 0;
      syncProductQuantityControls();
      const result = await maximumValidAddition(queue.item, requested);
      const accepted = Math.max(0, Math.min(result.quantity, requested - queue.cancelInFlight));
      queue.inFlight = 0;
      queue.cancelInFlight = 0;
      if (accepted) {
        addItemQuantity(queue.item, accepted);
        save();
        say(accepted === 1 ? "Añadido a tu pedido 💜" : `${accepted} unidades añadidas a tu pedido 💜`);
      }
      if (accepted < requested && result.error) say(stockLimitNotice(result.error, queue.item.name));
    }
    queue.processing = false;
    if (!queue.pending && !queue.inFlight) productAddQueues.delete(id);
    syncProductQuantityControls();
  }

  function addProduct(card) {
    const selection = productSelection(card);
    if (selection.error) return say(selection.error);
    if (selection.preorder) {
      addItemQuantity(selection.item, 1);
      save();
      return say("Pre-order añadido a tu pedido 💜");
    }
    const queue = scheduleProductQueue(selection);
    queue.pending += 1;
    syncProductQuantityControls();
  }

  function subtractProduct(card) {
    const selection = productSelection(card);
    if (selection.error) return;
    const queue = productAddQueues.get(selection.id);
    if (queue?.pending > 0) {
      queue.pending -= 1;
      if (!queue.pending && !queue.processing) {
        clearTimeout(queue.timer);
        productAddQueues.delete(selection.id);
      }
      syncProductQuantityControls();
      return;
    }
    if (queue && queue.inFlight > queue.cancelInFlight) {
      queue.cancelInFlight += 1;
      syncProductQuantityControls();
      return;
    }
    const item = cart.find(entry => entry.id === selection.id);
    if (!item) return;
    item.qty -= 1;
    if (item.qty <= 0) cart = cart.filter(entry => entry.id !== selection.id);
    save();
  }

  function setupProductQuantityControls() {
    $$(".product .add").forEach(button => {
      const card = button.closest(".product");
      if (card.dataset.preorder === "true") {
        button.addEventListener("click", () => addProduct(card));
        return;
      }
      const control = document.createElement("div");
      control.className = "product-quantity-control";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "product-minus";
      minus.hidden = true;
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Restar ${card.dataset.name}`);
      const output = document.createElement("output");
      output.className = "product-menu-qty";
      output.hidden = true;
      output.textContent = "0";
      button.before(control);
      control.append(minus, output, button);
      button.addEventListener("click", () => addProduct(card));
      minus.addEventListener("click", () => subtractProduct(card));
      $$(".product-size,.product-variant", card).forEach(select => select.addEventListener("change", syncProductQuantityControls));
    });
    syncProductQuantityControls();
  }

  function fonkiePrice(total, flavorCount) {
    const pricing = adminState?.builders?.fonkies || {};
    const minimum = Math.max(1, Number(pricing.minimumQuantity || 4));
    if (total < minimum) return 0;
    const base = flavorCount === 1 ? Number(pricing.singlePrice ?? 15) : Number(pricing.mixedPrice ?? 17);
    return base + Math.max(0, total - minimum) * Number(pricing.extraPrice ?? 3.5);
  }

  function setupFonkieBuilder() {
    const builder = $(".fonkie-builder");
    if (!builder) return;
    const rows = $$(".fonkie-flavor", builder);
    const addButton = $("#addFonkieBox");
    const preorder = builder.dataset.preorder === "true" && builder.dataset.soldOut === "true";
    const temporaryUnavailable = builder.dataset.temporarilyUnavailable === "true";
    const unavailable = temporaryUnavailable || (builder.dataset.soldOut === "true" && !preorder);
    const minimum = Math.max(1, Number(adminState?.builders?.fonkies?.minimumQuantity || 4));
    $("#fonkieIngredients div").textContent = builder.dataset.ingredients;
    const builderIntro = $(".fonkie-builder-head p", builder);
    if (builderIntro) builderIntro.textContent = `Elige los sabores y las cantidades. Mínimo ${minimum} unidades.`;

    function selectedFlavors() {
      return rows.map(row => ({
        name: row.dataset.flavor,
        qty: Number($("output", row).value || $("output", row).textContent || 0)
      })).filter(item => item.qty > 0);
    }

    function updateBuilder() {
      const selected = selectedFlavors();
      const total = selected.reduce((sum, item) => sum + item.qty, 0);
      const price = fonkiePrice(total, selected.length);
      $("#fonkieChoiceCount").textContent = `${total} ${total === 1 ? "elegido" : "elegidos"}`;
      $("#fonkieCount").textContent = `Has seleccionado ${total} ${total === 1 ? "Fonkie" : "Fonkies"}`;
      $("#fonkieTotal").textContent = money(price);
      addButton.disabled = total < minimum || unavailable;
      if (unavailable) {
        $("#fonkiePriceRule").textContent = temporaryUnavailable ? "Producción temporalmente pausada." : "Producto agotado temporalmente.";
        $("#fonkieValidation").textContent = temporaryUnavailable ? "Temporalmente no disponible." : "Consulta disponibilidad por WhatsApp.";
      } else if (total < minimum) {
        $("#fonkiePriceRule").textContent = `Selecciona al menos ${minimum} para armar tu caja.`;
        $("#fonkieValidation").textContent = `Mínimo ${minimum} galletas para armar tu caja.`;
      } else {
        const type = selected.length === 1 ? "Caja de un solo sabor" : "Caja mixta";
        const extras = total - 4;
        $("#fonkiePriceRule").textContent = `${type}${extras ? ` + ${extras} extra${extras === 1 ? "" : "s"} a $3,50` : ""}.`;
        $("#fonkieValidation").textContent = preorder ? "Tu solicitud de pre-order está lista." : "Tu caja está lista para agregar al carrito.";
      }
    }

    $$(".fonkie-stepper button", builder).forEach(button => button.addEventListener("click", async () => {
      if (stockValidationPending) return;
      const output = $("output", button.closest(".fonkie-flavor"));
      const previous = Number(output.value || output.textContent || 0);
      const delta = Number(button.dataset.delta);
      const next = Math.max(0, previous + delta);
      if (delta > 0 && !preorder) {
        stockValidationPending = true;
        const draft = rows.map(row => ({
          kind:"fonkies",flavor:row.dataset.flavor,
          quantity:row === button.closest(".fonkie-flavor") ? next : Number($("output", row).value || $("output", row).textContent || 0)
        }));
        const validation = await validateStock(draft);
        stockValidationPending = false;
        if (!validation.ok) { say(stockLimitNotice(validation.error, button.closest(".fonkie-flavor").dataset.flavor)); return; }
      }
      output.value = String(next);
      output.textContent = String(next);
      updateBuilder();
    }));

    addButton.addEventListener("click", async () => {
      const selected = selectedFlavors();
      const total = selected.reduce((sum, item) => sum + item.qty, 0);
      if (total < minimum) {
        say(`Mínimo ${minimum} galletas para armar tu caja`);
        return;
      }
      if (!preorder) {
        const validation = await validateStock(selected.map(item => ({kind:"fonkies",flavor:item.name,quantity:item.qty})));
        if (!validation.ok) { say(stockLimitNotice(validation.error, "la caja de Fonkies")); return; }
      }
      const price = fonkiePrice(total, selected.length);
      const choices = [selected.map(item => `${item.qty} ${item.name}`).join(", "), preorder ? "PRE-ORDER · Sujeto a confirmación" : ""].filter(Boolean).join(" · ");
      const id = `fonkie-box-${rows.map(row => Number($("output", row).value || 0)).join("-")}`;
      const found = cart.find(item => item.id === id);
      if (found) {
        found.qty += 1;
      } else {
        cart.push({
          id,
          productId: "fonkie-box",
          name: `${preorder ? "Pre-order · " : ""}Caja de ${total} Fonkies · ${selected.length === 1 ? "Un sabor" : "Mixta"}`,
          price,
          image: builder.dataset.image,
          ingredients: productIngredients("fonkie-box"),
          choices,
          inventory: { kind:"fonkies", flavors:selected, preorder },
          qty: 1
        });
      }
      save();
      say("Caja de Fonkies añadida a tu pedido 💜");
    });

    updateBuilder();
  }

  function setupFombBuilder() {
    const builder = $(".fomb-builder");
    if (!builder) return;
    const sizeInputs = $$('input[name="fombSize"]', builder);
    const extrasOutput = $("#fombExtraCount");
    const addButton = $("#addFombBox");
    const preorder = builder.dataset.preorder === "true" && builder.dataset.soldOut === "true";
    const temporaryUnavailable = builder.dataset.temporarilyUnavailable === "true";
    const unavailable = temporaryUnavailable || (builder.dataset.soldOut === "true" && !preorder);
    const rows = $$(".fomb-flavor", builder);
    let extras = 0;
    $("#fombIngredients div").textContent = builder.dataset.ingredients;

    function selectedFlavors() {
      return rows.map(row => ({
        name: row.dataset.flavor,
        qty: Number($("output", row).value || $("output", row).textContent || 0)
      })).filter(item => item.qty > 0);
    }

    function selection() {
      const size = Number(sizeInputs.find(input => input.checked)?.value || 4);
      const selectedInput = sizeInputs.find(input => input.checked);
      const basePrice = Number(selectedInput?.dataset.price || (size === 12 ? 30 : 15));
      const extraPrice = Number(adminState?.builders?.fomb?.extraPrice ?? 3.5);
      const flavors = selectedFlavors();
      const selectedTotal = flavors.reduce((sum, item) => sum + item.qty, 0);
      return { size, total: size + extras, price: basePrice + extras * extraPrice, flavors, selectedTotal };
    }

    function updateBuilder() {
      const current = selection();
      extrasOutput.value = String(extras);
      extrasOutput.textContent = String(extras);
      $("#fombChoiceCount").textContent = `${current.selectedTotal} ${current.selectedTotal === 1 ? "elegido" : "elegidos"}`;
      $("#fombCount").textContent = `Has seleccionado ${current.selectedTotal} de ${current.total} Fomb`;
      const remaining = current.total - current.selectedTotal;
      if (remaining > 0) {
        $("#fombRule").textContent = `Selecciona los ${current.total} sabores de tu caja.`;
        $("#fombValidation").textContent = `Faltan ${remaining} ${remaining === 1 ? "bombón" : "bombones"} por elegir.`;
      } else if (remaining < 0) {
        $("#fombRule").textContent = "Reduce la selección para que coincida con el tamaño de la caja.";
        $("#fombValidation").textContent = `Hay ${Math.abs(remaining)} ${Math.abs(remaining) === 1 ? "bombón" : "bombones"} de más.`;
      } else {
        const type = current.flavors.length === 1 ? "Caja de un solo sabor" : "Caja mixta";
        $("#fombRule").textContent = `${type}${extras ? ` · ${current.size} + ${extras} extra${extras === 1 ? "" : "s"}` : ""}.`;
        $("#fombValidation").textContent = "Tu caja está lista para agregar al carrito.";
      }
      $("#fombTotal").textContent = money(current.price);
      addButton.disabled = remaining !== 0 || unavailable;
      if (unavailable) $("#fombValidation").textContent = temporaryUnavailable ? "Temporalmente no disponible." : "Producto agotado temporalmente. Consulta por WhatsApp.";
    }

    $("#fombExtraMinus").addEventListener("click", () => {
      extras = Math.max(0, extras - 1);
      updateBuilder();
    });
    $("#fombExtraPlus").addEventListener("click", () => {
      extras += 1;
      updateBuilder();
    });
    sizeInputs.forEach(input => input.addEventListener("change", updateBuilder));

    $$(".fomb-flavor .fonkie-stepper button", builder).forEach(button => button.addEventListener("click", async () => {
      if (stockValidationPending) return;
      const current = selection();
      const output = $("output", button.closest(".fomb-flavor"));
      const delta = Number(button.dataset.delta);
      if (delta > 0 && current.selectedTotal >= current.total) return;
      const previous = Number(output.value || output.textContent || 0);
      const next = Math.max(0, previous + delta);
      if (delta > 0 && !preorder) {
        stockValidationPending = true;
        const draft = rows.map(row => ({
          kind:"fomb",flavor:row.dataset.flavor,
          quantity:row === button.closest(".fomb-flavor") ? next : Number($("output", row).value || $("output", row).textContent || 0)
        }));
        const validation = await validateStock(draft);
        stockValidationPending = false;
        if (!validation.ok) { say(stockLimitNotice(validation.error, button.closest(".fomb-flavor").dataset.flavor)); return; }
      }
      output.value = String(next);
      output.textContent = String(next);
      updateBuilder();
    }));

    addButton.addEventListener("click", async () => {
      const current = selection();
      if (current.selectedTotal !== current.total) {
        say(`Selecciona exactamente ${current.total} bombones para armar tu caja`);
        return;
      }
      if (!preorder) {
        const validation = await validateStock(current.flavors.map(item => ({kind:"fomb",flavor:item.name,quantity:item.qty})));
        if (!validation.ok) { say(stockLimitNotice(validation.error, "la caja Fomb")); return; }
      }
      const choices = [current.flavors.map(item => `${item.qty} ${item.name}`).join(", "), preorder ? "PRE-ORDER · Sujeto a confirmación" : ""].filter(Boolean).join(" · ");
      const id = `fomb-box-${current.size}-${extras}-${rows.map(row => Number($("output", row).value || 0)).join("-")}`;
      const found = cart.find(item => item.id === id);
      if (found) {
        found.qty += 1;
      } else {
        cart.push({
          id,
          productId: "fomb-box",
          name: `${preorder ? "Pre-order · " : ""}Caja de ${current.total} Fomb · ${current.flavors.length === 1 ? "Un sabor" : "Mixta"}`,
          price: current.price,
          image: builder.dataset.image,
          ingredients: builder.dataset.ingredients,
          choices,
          inventory: { kind:"fomb", flavors:current.flavors, boxSize:current.size, extraCount:extras, preorder },
          qty: 1
        });
      }
      save();
      say("Caja Fomb añadida a tu pedido 💜");
    });

    updateBuilder();
  }

  window.changeQty = async (id, delta) => {
    if (stockValidationPending) return;
    const item = cart.find(entry => entry.id === id);
    if (!item) return;
    const previous = item.qty;
    item.qty += delta;
    if (delta > 0 && !item.inventory?.preorder) {
      stockValidationPending = true;
      const validation = await validateStock();
      stockValidationPending = false;
      if (!validation.ok) { item.qty = previous; say(stockLimitNotice(validation.error, item.name)); renderCart(); return; }
    }
    if (item.qty <= 0) cart = cart.filter(entry => entry.id !== id);
    save();
  };

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    $("#cartCount").textContent = count;
    $("#cartTotal").textContent = money(total);
    const blocked = cart.some(isElectricityBlockedCartItem);
    $("#continueCheckout").disabled = blocked;
    cartItems.innerHTML = cart.length
      ? cart.map(item => `
        <div class="cart-item${isElectricityBlockedCartItem(item) ? " cart-item-unavailable" : ""}">
          <img src="${item.image}" alt="">
          <div>
            <h4>${escapeHtml(item.name)}</h4>
            <small>${money(item.price)}</small>
            ${item.choices ? `<small class="cart-choices">${escapeHtml(item.choices)}</small>` : ""}
            ${isElectricityBlockedCartItem(item) ? `<small class="cart-unavailable-copy">Temporalmente no disponible. Elimínalo para continuar.</small>` : ""}
            <div class="qty">
              <button type="button" onclick="changeQty('${item.id}',-1)" aria-label="Restar">−</button>
              <b>${item.qty}</b>
              <button type="button" onclick="changeQty('${item.id}',1)" aria-label="Sumar">+</button>
            </div>
          </div>
          <button type="button" class="remove" onclick="changeQty('${item.id}',-${item.qty})" aria-label="Eliminar">×</button>
        </div>`).join("")
      : `<div class="empty"><b>Tu pedido está vacío</b><span>Agrega una delicia del menú para comenzar.</span></div>`;
    syncProductQuantityControls();
  }

  function isElectricityBlockedCartItem(item) {
    if (productionWithElectricity) return false;
    if (item.inventory?.kind === "fonkies") return true;
    if (item.inventory?.kind !== "product") return false;
    const product = adminState?.products?.find(entry => entry.id === item.inventory.productId);
    return product?.requiresElectricity === true;
  }

  async function showCheckoutStep() {
    if (!cart.length) {
      say("Primero agrega algo rico al pedido");
      return;
    }
    if (cart.some(isElectricityBlockedCartItem)) {
      say("Hay un producto temporalmente no disponible. No lo eliminamos: retíralo del carrito para continuar.");
      return;
    }
    const validation = await validateStock();
    if (!validation.ok) {
      say(`${validation.error} Reduce el pedido para continuar.`);
      return;
    }
    cartItems.hidden = true;
    cartFooter.hidden = true;
    checkoutForm.hidden = false;
    backToCart.hidden = false;
    drawerTitle.textContent = "Datos del pedido";
    renderAllergyItemNotes();
    setupRequestedDate();
    toggleBirthdayCandleOption();
    toggleAllergyDetails();
    $("#customerName").focus();
  }

  function showCartStep() {
    cartItems.hidden = false;
    cartFooter.hidden = false;
    checkoutForm.hidden = true;
    backToCart.hidden = true;
    drawerTitle.textContent = "Tu pedido";
  }

  function populateOptions() {
    const fulfillmentOptions = `
      <option value="pickup">${config.pickupLabel || "Pickup"}</option>
      <option value="delivery">${config.deliveryLabel || "Delivery"}</option>`;
    ["#fulfillment", "#immediateFulfillment", "#preparedFulfillment"].forEach(selector => {
      $(selector).innerHTML = fulfillmentOptions;
    });
    $("#paymentMethod").innerHTML = (config.paymentMethods || [])
      .map(method => `<option value="${method}">${method}</option>`)
      .join("");
  }

  function toggleAddressFor(select, group, address) {
    const delivery = select.value === "delivery";
    group.hidden = !delivery;
    address.required = delivery && !select.disabled;
  }

  function toggleAddress() {
    toggleAddressFor($("#fulfillment"), $("#addressGroup"), $("#customerAddress"));
    const delivery = $("#fulfillment").value === "delivery";
    $("#requestedDateLabel").textContent = delivery ? "Fecha deseada para delivery" : "Fecha deseada para pickup";
  }

  function itemLeadTime(item) {
    const leadTime = config.leadTimesByProduct?.[item.productId || item.id];
    const days = Number(leadTime?.minimumBusinessDays);
    return Number.isFinite(days) ? Math.max(0, days) : null;
  }

  function cartScheduleGroups() {
    const immediate = [];
    const prepared = [];
    const pending = [];
    cart.forEach(item => {
      const days = itemLeadTime(item);
      if (days === null) pending.push(item);
      else if (days === 0) immediate.push(item);
      else prepared.push({ item, days });
    });
    return {
      immediate,
      prepared,
      pending,
      mixed: immediate.length > 0 && (prepared.length > 0 || pending.length > 0),
      maximumDays: prepared.length ? Math.max(...prepared.map(entry => entry.days)) : 0
    };
  }

  function currentDeliveryPlan() {
    return cartScheduleGroups().mixed && checkoutForm.elements.deliveryPlan?.value === "split" ? "split" : "together";
  }

  function toggleSplitAddress(selectId, groupId, addressId) {
    toggleAddressFor($(selectId), $(groupId), $(addressId));
  }

  function localDateValue(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function addPreparationDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function renderCheckoutPreparationGuide() {
    const schedule = cartScheduleGroups();
    const groups = {
      sameDay: schedule.immediate.map(item => item.name),
      prepared: schedule.prepared.map(entry => ({ name:entry.item.name, days:entry.days })),
      pending: schedule.pending.map(item => item.name)
    };
    const unique = values => [...new Set(values)];
    const rows = [];
    const sameDayNames = unique(groups.sameDay);
    if (sameDayNames.length) rows.push(`<div class="checkout-preparation-row same-day"><strong>Puede pedirse para el mismo día</strong><span>${escapeHtml(sameDayNames.join(", "))}. Sujeto a stock y confirmación de Fontana.</span></div>`);
    const preparationDays = [...new Set(groups.prepared.map(item => item.days))].sort((a, b) => a - b);
    preparationDays.forEach(days => {
      const names = unique(groups.prepared.filter(item => item.days === days).map(item => item.name));
      rows.push(`<div class="checkout-preparation-row prepared"><strong>Mínimo ${days} ${days === 1 ? "día" : "días"} de preparación</strong><span>${escapeHtml(names.join(", "))}.</span></div>`);
    });
    const pendingNames = unique(groups.pending);
    if (pendingNames.length) rows.push(`<div class="checkout-preparation-row pending"><strong>Tiempo por confirmar</strong><span>${escapeHtml(pendingNames.join(", "))}.</span></div>`);
    $("#checkoutPreparationList").innerHTML = rows.join("");
    const note = $("#checkoutPreparationNote");
    note.textContent = schedule.mixed ? "Puedes recibir primero lo disponible y después lo que requiere preparación, o esperar para recibir todo junto." : "";
    note.hidden = !schedule.mixed;
  }

  function renderSplitItemSummaries(schedule) {
    const itemMarkup = item => `<li>${item.qty}× ${escapeHtml(item.name)}</li>`;
    $("#immediateItemSummary").innerHTML = schedule.immediate.map(itemMarkup).join("");
    $("#preparedItemSummary").innerHTML = [
      ...schedule.prepared.map(entry => entry.item),
      ...schedule.pending
    ].map(itemMarkup).join("");
  }

  function setFieldAvailability(field, enabled) {
    field.disabled = !enabled;
    field.required = enabled;
  }

  function toggleDeliveryPlan() {
    const schedule = cartScheduleGroups();
    const split = schedule.mixed && currentDeliveryPlan() === "split";
    $("#singleFulfillmentGroup").hidden = split;
    $("#singleDateGroup").hidden = split;
    $("#splitDeliveryFields").hidden = !split;
    setFieldAvailability($("#fulfillment"), !split);
    setFieldAvailability($("#requestedDate"), !split);
    ["#immediateFulfillment", "#immediateRequestedDate", "#preparedFulfillment", "#preparedRequestedDate"].forEach(selector => setFieldAvailability($(selector), split));
    $("#customerAddress").disabled = split;
    $("#customerAddress").required = !split && $("#fulfillment").value === "delivery";
    $("#immediateAddress").disabled = !split;
    $("#preparedAddress").disabled = !split;
    toggleAddress();
    toggleSplitAddress("#immediateFulfillment", "#immediateAddressGroup", "#immediateAddress");
    toggleSplitAddress("#preparedFulfillment", "#preparedAddressGroup", "#preparedAddress");
  }

  function setupRequestedDate() {
    renderCheckoutPreparationGuide();
    const schedule = cartScheduleGroups();
    const minimumBusinessDays = schedule.maximumDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minimumDate = addPreparationDays(today, minimumBusinessDays);
    const input = $("#requestedDate");
    input.min = localDateValue(minimumDate);
    $("#requestedDateNotice").textContent = minimumBusinessDays >= 2
      ? "Pedidos por encargo: mínimo 2 días de anticipación. Hoy y mañana no están disponibles."
      : "La fecha final queda sujeta a confirmación por WhatsApp.";
    if (minimumBusinessDays > 0 && (!input.value || input.value < input.min)) input.value = input.min;
    else if (input.value && input.value < input.min) input.value = "";
    const immediateDate = $("#immediateRequestedDate");
    immediateDate.min = localDateValue(today);
    if (!immediateDate.value || immediateDate.value < immediateDate.min) immediateDate.value = immediateDate.min;
    const preparedDate = $("#preparedRequestedDate");
    preparedDate.min = localDateValue(minimumDate);
    if (!preparedDate.value || preparedDate.value < preparedDate.min) preparedDate.value = preparedDate.min;
    $("#deliveryPlanPanel").hidden = !schedule.mixed;
    if (!schedule.mixed) checkoutForm.elements.deliveryPlan.value = "together";
    renderSplitItemSummaries(schedule);
    toggleDeliveryPlan();
  }

  function cartHasCake() {
    const cakeIds = new Set($$('[data-category="cakes"]').flatMap(card => [card.dataset.id, card.dataset.productId].filter(Boolean)));
    return cart.some(item => item.category === "cakes" || cakeIds.has(item.id) || cakeIds.has(item.productId));
  }

  function toggleBirthdayCandleOption() {
    const panel = $("#birthdayCandlePanel");
    const inputs = $$('input[name="birthdayCandle"]', panel);
    const hasCake = cartHasCake();
    panel.hidden = !hasCake;
    inputs.forEach(input => {
      input.required = hasCake;
      if (!hasCake) input.checked = false;
    });
  }

  function renderAllergyItemNotes() {
    const container = $("#allergyItemNotes");
    const customizableItems = cart.filter(item => {
      if (item.category === "beverages") return false;
      const productId = item.productId || item.inventory?.productId;
      const product = adminState?.products?.find(entry => entry.id === productId);
      return product?.category !== "beverages";
    });
    container.innerHTML = customizableItems.map(item => {
      const fieldId = `allergyNote-${item.id.replace(/[^a-z0-9_-]/gi, "-")}`;
      return `<details class="item-allergy-field">
        <summary><span>${escapeHtml(item.name)}</span><small>Personalización opcional</small></summary>
        <div class="item-allergy-content">
          <label for="${fieldId}">¿Qué ingrediente deseas retirar o evitar?</label>
          <textarea id="${fieldId}" name="allergyNote:${escapeHtml(item.id)}" placeholder="Escribe aquí solo si necesitas una adaptación"></textarea>
          <small>Ingredientes declarados: ${escapeHtml(item.ingredients || productIngredients(item.id))}</small>
        </div>
      </details>`;
    }).join("");
    container.hidden = customizableItems.length === 0;
  }

  function createOrderId() {
    const now = new Date();
    const date = [now.getFullYear().toString().slice(-2), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${config.orderPrefix || "FNT"}-${date}-${suffix}`;
  }

  function allergySummary(form) {
    const data = new FormData(form);
    if (data.get("hasAllergies") !== "yes") return "No indica";
    const list = data.getAll("allergens");
    const other = String(data.get("otherAllergy") || "").trim();
    if (other) list.push(other);
    return list.join(", ");
  }

  function fulfillmentLabel(value) {
    return value === "delivery" ? (config.deliveryLabel || "Delivery") : (config.pickupLabel || "Pickup");
  }

  function cartItemMessageLine(item) {
    return `• ${item.qty}× ${item.name} — ${money(item.price * item.qty)}${item.choices ? `\n  Sabores: ${item.choices}` : ""}`;
  }

  function splitDeliveryMessageLines(data) {
    const schedule = cartScheduleGroups();
    if (!schedule.mixed || currentDeliveryPlan() !== "split") return null;
    const immediateFulfillment = fulfillmentLabel(data.get("immediateFulfillment"));
    const preparedFulfillment = fulfillmentLabel(data.get("preparedFulfillment"));
    const preparedItems = [...schedule.prepared.map(entry => entry.item), ...schedule.pending];
    const twoDeliveries = data.get("immediateFulfillment") === "delivery" && data.get("preparedFulfillment") === "delivery";
    return [
      "*Primera entrega · Productos disponibles primero*",
      ...schedule.immediate.map(cartItemMessageLine),
      `• Modalidad: ${immediateFulfillment}`,
      data.get("immediateAddress") ? `• Dirección: ${data.get("immediateAddress")}` : null,
      `• Fecha solicitada: ${data.get("immediateRequestedDate")}`,
      "• Disponibilidad sujeta a confirmación de Fontana",
      "",
      "*Segunda entrega · Productos con preparación*",
      ...preparedItems.map(cartItemMessageLine),
      `• Modalidad: ${preparedFulfillment}`,
      data.get("preparedAddress") ? `• Dirección: ${data.get("preparedAddress")}` : null,
      `• Fecha solicitada: ${data.get("preparedRequestedDate")}`,
      twoDeliveries ? "• Costo del segundo delivery: sujeto a confirmación por WhatsApp" : null
    ].filter(line => line !== null);
  }

  function buildMessage(form, reservation = {}) {
    const data = new FormData(form);
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const hasCake = cartHasCake();
    const birthdayCandle = data.get("birthdayCandle");
    const hasAllergies = data.get("hasAllergies") === "yes";
    const allergyList = data.getAll("allergens");
    const otherAllergy = String(data.get("otherAllergy") || "").trim();
    if (otherAllergy) allergyList.push(otherAllergy);
    const itemAllergyLines = hasAllergies
      ? cart.map(item => {
        const note = String(data.get(`allergyNote:${item.id}`) || "").trim();
        return note ? `• ${item.name}: ${note}` : "";
      }).filter(Boolean)
      : [];
    const fulfillment = fulfillmentLabel(data.get("fulfillment"));
    const splitLines = splitDeliveryMessageLines(data);
    const lines = splitLines || cart.map(cartItemMessageLine);
    const orderId = reservation.orderCode || createOrderId();
    const message = [
      `Hola ${config.businessName || "Fontana"} 💜 Quiero hacer este pedido:`,
      "",
      `*Pedido ${orderId}*`,
      "",
      ...lines,
      "",
      `*Total estimado: ${money(total)}*`,
      reservation.reservedUntil ? `*Stock reservado hasta: ${new Date(reservation.reservedUntil).toLocaleTimeString("es-VE", {hour:"2-digit",minute:"2-digit"})}*` : null,
      "",
      `• Nombre: ${data.get("name")}`,
      `• Teléfono: ${data.get("phone")}`,
      splitLines ? null : `• Modalidad: ${fulfillment}`,
      !splitLines && data.get("address") ? `• Dirección: ${data.get("address")}` : null,
      splitLines ? null : `• Fecha deseada para ${fulfillment}: ${data.get("requestedDate")}`,
      `• Forma de pago: ${data.get("payment")}`,
      "• Condición de pago: 100% por adelantado; los datos se envían por WhatsApp",
      hasCake ? `• Vela de cumpleaños: ${birthdayCandle === "yes" ? "Sí" : "No"}` : null,
      `• Condiciones, alergias o intolerancias: ${hasAllergies ? allergyList.join(", ") : "No indica"}`,
      itemAllergyLines.length ? "*⚠️ INSTRUCCIONES POR PRODUCTO*" : null,
      ...itemAllergyLines,
      hasAllergies ? "*• Estado: PENDIENTE DE REVISIÓN POR FONTANA*" : "• Estado: pendiente de confirmación",
      data.get("notes") ? `• Observaciones: ${data.get("notes")}` : null,
      "Enviaré el comprobante por este chat.",
      "*El pedido se confirma únicamente cuando Fontana valide disponibilidad, pago y, si aplica, las condiciones, alergias o intolerancias indicadas.*"
    ].filter(line => line !== null).join("\n");
    return { message, orderId };
  }

  function invalidCheckoutContainer(field) {
    return field.closest(".checkout-option-panel,.allergy-panel");
  }

  function showCheckoutErrors(firstField) {
    const summary = $("#checkoutValidation");
    summary.textContent = "";
    summary.hidden = true;
    if (!firstField) return;
    firstField.setAttribute("aria-invalid", "true");
    invalidCheckoutContainer(firstField)?.classList.add("checkout-invalid");
    firstField.scrollIntoView({ behavior:"smooth", block:"center" });
    setTimeout(() => firstField.focus({ preventScroll:true }), 260);
  }

  function validateCheckoutFields() {
    $$("[aria-invalid='true']", checkoutForm).forEach(field => field.removeAttribute("aria-invalid"));
    $$(".checkout-invalid", checkoutForm).forEach(group => group.classList.remove("checkout-invalid"));
    const invalidFields = [...checkoutForm.elements].filter(field => field.willValidate && !field.checkValidity());
    if (!invalidFields.length) {
      $("#checkoutValidation").hidden = true;
      return true;
    }
    invalidFields.forEach(field => {
      field.setAttribute("aria-invalid", "true");
      invalidCheckoutContainer(field)?.classList.add("checkout-invalid");
    });
    showCheckoutErrors(invalidFields[0]);
    return false;
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!validateCheckoutFields()) return;
    const formData = new FormData(checkoutForm);
    if (formData.get("hasAllergies") === "yes" && !formData.getAll("allergens").length && !String(formData.get("otherAllergy") || "").trim()) {
      showCheckoutErrors($("#otherAllergy"));
      return;
    }
    const stockValidation = await validateStock();
    if (!stockValidation.ok) { say(`${stockValidation.error} Reduce el pedido para continuar.`); return; }
    const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");

    if (config.previewMode || !whatsappNumber) {
      const { message, orderId } = buildMessage(checkoutForm);
      window.__copiedOrder = message;
      try {
        await navigator.clipboard.writeText(message);
        say(`Pedido ${orderId} preparado y copiado ✓`);
      } catch {
        say(`Pedido ${orderId} preparado. Falta configurar WhatsApp.`);
      }
      return;
    }
    const submit = checkoutForm.querySelector('[type="submit"]');
    const previousLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Reservando stock…";
    try {
      const data = new FormData(checkoutForm);
      const clientKey = checkoutForm.dataset.reservationKey || crypto.randomUUID();
      checkoutForm.dataset.reservationKey = clientKey;
      const split = currentDeliveryPlan() === "split";
      const immediateFulfillment = fulfillmentLabel(data.get("immediateFulfillment"));
      const preparedFulfillment = fulfillmentLabel(data.get("preparedFulfillment"));
      const payload = {
        clientKey,
        items: reservationItems(),
        customer: {
          name:String(data.get("name") || ""), phone:String(data.get("phone") || ""),
          fulfillment:split ? `Pedido dividido: ${immediateFulfillment} + ${preparedFulfillment}` : fulfillmentLabel(data.get("fulfillment")),
          requestedDate:String(split ? data.get("preparedRequestedDate") : data.get("requestedDate") || ""), paymentMethod:String(data.get("payment") || ""),
          address:split
            ? [`Primera entrega: ${data.get("immediateAddress") || "pickup"}`, `Segunda entrega: ${data.get("preparedAddress") || "pickup"}`].join(" | ")
            : String(data.get("address") || ""),
          allergySummary:allergySummary(checkoutForm),
          birthdayCandle:String(data.get("birthdayCandle") || ""), notes:String(data.get("notes") || "")
        }
      };
      const response = await fetch(`${String(config.adminApiBase || "").replace(/\/$/, "")}/v1/orders/reserve`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
      });
      const reservation = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (reservation.code === "temporarily_unavailable") throw new Error("La producción de un producto del carrito está temporalmente pausada. Retíralo para continuar; tu carrito se conserva.");
        if (response.status === 409) throw new Error("Ese stock acaba de agotarse. Actualiza el menú para ver la disponibilidad.");
        throw new Error(reservation.error || "No pudimos reservar el stock. Inténtalo otra vez.");
      }
      const { message } = buildMessage(checkoutForm, reservation);
      window.__lastWhatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      window.location.href = window.__lastWhatsappUrl;
    } catch (error) {
      say(error.message || "No pudimos reservar el stock.");
    } finally {
      submit.disabled = false;
      submit.textContent = previousLabel;
    }
  }

  function filterProducts(filter) {
    const catalogItems = $$(".product, .fonkie-builder, .builder-panel");
    catalogItems.forEach(product => {
      const category = product.dataset.category;
      const matches = filter === "all"
        || (filter === "foncake" && category === "cakes")
        || (filter === "fonkies" && category === "fonkies")
        || (filter === "fomb" && category === "fomb")
        || (filter === "salado" && category === "salado")
        || (filter === "beverages" && category === "beverages")
        || (filter === "promo" && product.dataset.promo === "true")
        || (filter === "immediate" && product.dataset.immediate === "true");
      product.classList.toggle("hidden", !matches);
    });
    const visibleCount = catalogItems.filter(product => !product.classList.contains("hidden")).length;
    const emptyState = $("#emptyFilterState");
    const emptyCopy = {
      promo: ["Promo del día", "Las promociones activas aparecerán aquí cuando Fontana las publique."],
      beverages: ["Bebidas", "Las bebidas confirmadas aparecerán aquí cuando se incorporen al menú."],
      immediate: ["Stock de hoy", "Los productos disponibles para entrega inmediata aparecerán aquí cada día."]
    };
    emptyState.hidden = visibleCount > 0;
    if (!visibleCount && emptyCopy[filter]) {
      $("#emptyFilterTitle").textContent = emptyCopy[filter][0];
      $("#emptyFilterMessage").textContent = emptyCopy[filter][1];
    }
    syncCatalogGroups();
  }

  applyAdminCatalog();
  applyAdminBuilders();
  renderDynamicCatalog();
  setupCatalogGroups();
  const stockTodayFilter = $('.filter[data-filter="immediate"]');
  if (stockTodayFilter && !stockTodayOpen) stockTodayFilter.hidden = true;
  setupProductQuantityControls();
  $$(".filter").forEach(button => button.addEventListener("click", () => {
    $$(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    filterProducts(button.dataset.filter);
  }));

  function setupMenuIntro() {
    const intro = $(".menu-intro");
    const section = intro?.closest(".menu-section");
    if (!intro) return;
    const title = intro.querySelector("h2");
    if (title && !title.classList.contains("menu-title-ready")) {
      const words = title.textContent.trim().split(/\s+/);
      let letterIndex = 0;
      title.textContent = "";
      words.forEach((word, wordIndex) => {
        const wordElement = document.createElement("span");
        wordElement.className = "menu-title-word";
        [...word].forEach(letter => {
          const letterElement = document.createElement("span");
          letterElement.className = "menu-title-letter";
          letterElement.style.setProperty("--letter-index", letterIndex);
          letterElement.textContent = letter;
          wordElement.appendChild(letterElement);
          letterIndex += 1;
        });
        title.appendChild(wordElement);
        if (wordIndex < words.length - 1) title.appendChild(document.createTextNode(" "));
      });
      title.classList.add("menu-title-ready");
    }
    if (!("IntersectionObserver" in window)) {
      intro.classList.add("menu-intro-visible");
      section?.classList.add("menu-entry-visible");
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      intro.classList.add("menu-intro-visible");
      section?.classList.add("menu-entry-visible");
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(intro);
  }

  function setupHeroLeafMotion() {
    const leaves = $(".hero-logo-leaves");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!leaves || !reducedMotion || typeof leaves.pauseAnimations !== "function") return;
    const syncMotion = () => reducedMotion.matches ? leaves.pauseAnimations() : leaves.unpauseAnimations();
    syncMotion();
    reducedMotion.addEventListener?.("change", syncMotion);
  }

  function setupTestimonialsCarousel() {
    const carousel = $(".testimonials-carousel");
    const track = $(".testimonials-track", carousel);
    const dots = $(".testimonial-dots");
    const slides = track ? $$(".quote", track) : [];
    if (!carousel || !track || !dots || slides.length < 2) return;

    slides.forEach((slide, index) => {
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "diapositiva");
      slide.setAttribute("aria-label", `${index + 1} de ${slides.length}`);
    });

    const clone = slides[0].cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.removeAttribute("aria-label");
    track.appendChild(clone);

    let index = 0;
    let timer;
    let resetTimer;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const renderDots = () => {
      dots.innerHTML = slides.map((_, dotIndex) => `<button class="testimonial-dot${dotIndex === 0 ? " active" : ""}" type="button" aria-label="Ver reseña ${dotIndex + 1}" aria-current="${dotIndex === 0 ? "true" : "false"}"></button>`).join("");
    };
    const updateDots = () => $$(".testimonial-dot", dots).forEach((dot, dotIndex) => {
      const active = dotIndex === index % slides.length;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", String(active));
    });
    const goTo = (nextIndex, animate = true) => {
      clearTimeout(resetTimer);
      track.classList.toggle("no-transition", !animate);
      index = nextIndex;
      track.style.transform = `translate3d(-${index * 100}%,0,0)`;
      updateDots();
      if (index === slides.length) {
        resetTimer = setTimeout(() => {
          index = 0;
          track.classList.add("no-transition");
          track.style.transform = "translate3d(0,0,0)";
          updateDots();
          requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove("no-transition")));
        }, 760);
      }
    };
    const stop = () => clearInterval(timer);
    const start = () => {
      stop();
      if (reducedMotion?.matches || document.hidden) return;
      timer = setInterval(() => goTo(index + 1), 4000);
    };

    renderDots();
    $$(".testimonial-dot", dots).forEach((dot, dotIndex) => dot.addEventListener("click", () => {
      goTo(dotIndex);
      start();
    }));
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", start);
    document.addEventListener("visibilitychange", start);
    reducedMotion?.addEventListener?.("change", start);
    start();
  }

  function setupFitDialog() {
    const dialog = $("#para-ti");
    const closeButton = $("#closeFitDialog");
    const menuLink = dialog?.querySelector(".fit-menu-link");
    if (!dialog || !closeButton || typeof dialog.showModal !== "function") return;

    const openDialog = event => {
      event?.preventDefault();
      if (!dialog.open) dialog.showModal();
      document.body.classList.add("fit-dialog-open");
    };
    const closeDialog = () => {
      if (dialog.open) dialog.close();
      document.body.classList.remove("fit-dialog-open");
    };

    $$('.nav-links a[href="#para-ti"]').forEach(link => link.addEventListener("click", openDialog));
    closeButton.addEventListener("click", closeDialog);
    menuLink?.addEventListener("click", closeDialog);
    dialog.addEventListener("close", () => document.body.classList.remove("fit-dialog-open"));
    if (location.hash === "#para-ti") openDialog();
  }

  function toggleAllergyDetails() {
    const hasAllergies = checkoutForm.elements.hasAllergies.value === "yes";
    $("#allergyDetails").hidden = !hasAllergies;
    $("#crossContamination").required = hasAllergies;
    $$('[name^="allergyNote:"]').forEach(field => { field.required = false; });
  }

  $("#cartButton").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#continueCheckout").addEventListener("click", showCheckoutStep);
  backToCart.addEventListener("click", showCartStep);
  backdrop.addEventListener("click", closeCart);
  checkoutForm.addEventListener("submit", submitOrder);
  checkoutForm.addEventListener("input", event => {
    event.target.removeAttribute?.("aria-invalid");
    event.target.closest?.(".field,.checkout-option-panel,.allergy-panel")?.classList.remove("checkout-invalid");
  });
  checkoutForm.addEventListener("change", event => {
    event.target.removeAttribute?.("aria-invalid");
    event.target.closest?.(".field,.checkout-option-panel,.allergy-panel")?.classList.remove("checkout-invalid");
  });
  $("#fulfillment").addEventListener("change", () => {
    toggleAddress();
    setupRequestedDate();
  });
  ["#immediateFulfillment", "#preparedFulfillment"].forEach(selector => {
    $(selector).addEventListener("change", () => {
      toggleSplitAddress(
        selector,
        selector === "#immediateFulfillment" ? "#immediateAddressGroup" : "#preparedAddressGroup",
        selector === "#immediateFulfillment" ? "#immediateAddress" : "#preparedAddress"
      );
    });
  });
  $$('input[name="deliveryPlan"]').forEach(input => input.addEventListener("change", toggleDeliveryPlan));
  $$('input[name="hasAllergies"]').forEach(input => input.addEventListener("change", toggleAllergyDetails));
  document.addEventListener("keydown", event => event.key === "Escape" && closeCart());

  enhanceDietarySeals();
  setupElectricityNotice();
  setupWhatsappChatLink();
  enhanceProductSafety();
  setupFonkieBuilder();
  setupFombBuilder();
  setupFitDialog();
  setupHeroLeafMotion();
  setupTestimonialsCarousel();
  setupMenuIntro();
  populateOptions();
  toggleAddress();
  renderCart();
})();
