(async () => {
  "use strict";

  const config = window.FONTANA_CONFIG || {};
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const adminStorageKey = "fontana-admin-catalog-v1";
  const adminState = await readAdminState();
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

  async function readAdminState() {
    const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
    try {
      const stored = JSON.parse(localStorage.getItem(adminStorageKey) || "null");
      if (localMode) return stored && Array.isArray(stored.products) ? stored : null;
    } catch { if (localMode) return null; }
    const apiBase = String(config.adminApiBase || "").replace(/\/$/, "");
    if (!apiBase) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(config.catalogApiTimeoutMs || 5000));
    try {
      const response = await fetch(`${apiBase}/v1/catalog`, {signal:controller.signal,cache:"no-store"});
      if (!response.ok) return null;
      const payload = await response.json();
      return payload?.state && Array.isArray(payload.state.products) ? payload.state : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }

  function applyAdminCatalog() {
    if (!adminState || !Array.isArray(adminState.products)) return;
    $$("#products > .product").forEach(product => product.remove());
    config.dynamicCatalog = adminState.products.filter(product => !product.deleted && product.visible !== false);
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
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function money(value) {
    return new Intl.NumberFormat(config.locale || "es-VE", {
      style: "currency",
      currency: config.currency || "USD"
    }).format(value);
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
    if (allThreeDietaryProductIds.has(product.id)) return {glutenFree:true,sugarFree:true,lactoseFree:true};
    if (product.id === "tequenos-fit") return {glutenFree:true,sugarFree:true,lactoseFree:false};
    return {glutenFree:false,sugarFree:false,lactoseFree:false};
  }

  function resolvedDietary(product) {
    const defaults = dietaryDefaults(product);
    return {
      glutenFree: Object.prototype.hasOwnProperty.call(product, "glutenFree") ? Boolean(product.glutenFree) : defaults.glutenFree,
      sugarFree: Object.prototype.hasOwnProperty.call(product, "sugarFree") ? Boolean(product.sugarFree) : defaults.sugarFree,
      lactoseFree: Object.prototype.hasOwnProperty.call(product, "lactoseFree") ? Boolean(product.lactoseFree) : defaults.lactoseFree
    };
  }

  function dietarySealSvg(kind) {
    const symbols = {
      gluten: '<path d="M20 10v20M20 15c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 5c4 0 6-2 6-5-4 0-6 2-6 5Zm0 5c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 5c4 0 6-2 6-5-4 0-6 2-6 5Z"/>',
      sugar: '<path d="m14 15 6-3 6 3v9l-6 4-6-4Z"/><path d="m14 15 6 4 6-4M20 19v9"/>',
      lactose: '<path d="M16 11h8M17 11v4l-3 3v11h12V18l-3-3v-4M14 21h12"/>'
    };
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/><circle class="seal-ring-inner" cx="20" cy="20" r="14.2"/>${symbols[kind]}<path d="M8 8l24 24"/></svg>`;
  }

  function dietarySealsMarkup(flags, extraClass = "") {
    const seals = [
      [flags.glutenFree, "gluten", "Sin gluten"],
      [flags.sugarFree, "sugar", "Sin azúcar"],
      [flags.lactoseFree, "lactose", "Sin lactosa"]
    ].filter(([active]) => active);
    if (!seals.length) return "";
    return `<div class="product-dietary-seals${extraClass ? ` ${extraClass}` : ""}" aria-label="Características de este producto">${seals.map(([,kind,label]) => `<div class="product-dietary-seal">${dietarySealSvg(kind)}<span>${label}</span></div>`).join("")}</div>`;
  }

  function elementDietaryFlags(element, defaultAll = false) {
    const parse = (key, fallback) => element.dataset[key] === undefined ? fallback : element.dataset[key] === "true";
    if (element.dataset.glutenFree !== undefined || element.dataset.sugarFree !== undefined || element.dataset.lactoseFree !== undefined) {
      return {glutenFree:parse("glutenFree",false),sugarFree:parse("sugarFree",false),lactoseFree:parse("lactoseFree",false)};
    }
    const safety = String(element.dataset.safety || "").toLowerCase();
    if (safety) return {glutenFree:safety.includes("sin gluten"),sugarFree:safety.includes("sin azúcar"),lactoseFree:safety.includes("sin lactosa")};
    return {glutenFree:defaultAll,sugarFree:defaultAll,lactoseFree:defaultAll};
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
    const labels = [soldOut ? "AGOTADO" : "", soldOut && builder.allowPreorder ? "PRE-ORDER" : "", builder.isNew ? "NUEVO" : "", builder.promo ? "PROMOCIÓN DEL DÍA" : "", builder.immediate ? "ENTREGA INMEDIATA" : ""].filter(Boolean);
    if (!labels.length) return;
    const tags = document.createElement("div");
    tags.className = "builder-admin-tags";
    tags.innerHTML = labels.map(label => `<span>${escapeHtml(label)}</span>`).join("");
    element.prepend(tags);
  }

  function applyAdminBuilders() {
    if (!adminState?.builders) return;
    const fonkies = adminState.builders.fonkies;
    const fonkieBuilder = $(".fonkie-builder");
    if (fonkies && fonkieBuilder) {
      fonkieBuilder.dataset.promo = String(Boolean(fonkies.promo));
      fonkieBuilder.dataset.immediate = String(Boolean(fonkies.immediate));
      fonkieBuilder.dataset.new = String(Boolean(fonkies.isNew));
      fonkieBuilder.dataset.preorder = String(Boolean(fonkies.allowPreorder));
      fonkieBuilder.dataset.glutenFree = String(fonkies.glutenFree !== false);
      fonkieBuilder.dataset.sugarFree = String(fonkies.sugarFree !== false);
      fonkieBuilder.dataset.lactoseFree = String(fonkies.lactoseFree !== false);
      fonkieBuilder.dataset.soldOut = String(fonkies.status === "sold-out" || fonkies.stockQuantity === 0);
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
      fombBuilder.dataset.immediate = String(Boolean(fomb.immediate));
      fombBuilder.dataset.new = String(Boolean(fomb.isNew));
      fombBuilder.dataset.preorder = String(Boolean(fomb.allowPreorder));
      fombBuilder.dataset.glutenFree = String(fomb.glutenFree !== false);
      fombBuilder.dataset.sugarFree = String(fomb.sugarFree !== false);
      fombBuilder.dataset.lactoseFree = String(fomb.lactoseFree !== false);
      fombBuilder.dataset.soldOut = String(fomb.status === "sold-out" || fomb.stockQuantity === 0);
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
      const soldOut = product.status === "sold-out" || product.stockQuantity === 0 || (variants.length > 0 && availableVariants.length === 0) || (sizes.length > 0 && availableSizes.length === 0);
      const preorder = soldOut && Boolean(product.allowPreorder);
      const description = String(product.description || "Disponibilidad sujeta a confirmación por WhatsApp.");
      const ingredients = String(product.ingredients || "Ingredientes pendientes de confirmar con Fontana");
      const dietary = resolvedDietary(product);
      const badges = [];
      if (soldOut) badges.push("AGOTADO");
      if (preorder) badges.push("PRE-ORDER");
      if (product.isNew) badges.push("NUEVO");
      if (product.promo) badges.push("PROMOCIÓN DEL DÍA");
      if (product.immediate) badges.push("ENTREGA INMEDIATA");
      (Array.isArray(product.customLabels) ? product.customLabels : []).forEach(label => { if (label) badges.push(String(label).slice(0,40)); });
      if (!badges.length && category === "beverages") badges.push("BEBIDA");
      const image = product.image
        ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(name)}">`
        : `<div class="product-placeholder"><div><b>${escapeHtml(name)}</b><small>Foto por actualizar</small></div></div>`;
      const sizePrices = availableSizes.map(size => Number(size.price)).filter(value => Number.isFinite(value));
      const minimumSizePrice = sizePrices.length ? Math.min(...sizePrices) : null;
      const priceCopy = minimumSizePrice !== null ? `Desde ${money(minimumSizePrice)}` : hasPrice ? money(price) : "Por confirmar";
      const classes = ["product", soldOut && !preorder ? "product-sold-out" : "", preorder ? "product-preorder" : "", hasPrice ? "" : "product-unpriced"].filter(Boolean).join(" ");
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
      const badgeMarkup = badges.length ? `<div class="product-tags">${badges.map((badge,index) => `<span class="product-tag${index ? " secondary" : ""}">${escapeHtml(badge)}</span>`).join("")}</div>` : "";
      return `<article class="${classes}" data-category="${category}" data-id="${escapeHtml(id)}" data-product-id="${escapeHtml(productId)}" data-name="${escapeHtml(name)}" data-price="${hasPrice ? price : ""}" data-image="${escapeHtml(cartImage)}" data-ingredients="${escapeHtml(ingredients)}" data-gluten-free="${dietary.glutenFree}" data-sugar-free="${dietary.sugarFree}" data-lactose-free="${dietary.lactoseFree}" data-promo="${Boolean(product.promo)}" data-immediate="${Boolean(product.immediate)}" data-sold-out="${soldOut}" data-preorder="${preorder}"><div class="product-media">${image}${badgeMarkup}</div><div class="product-body"><div class="product-top"><h3>${escapeHtml(name)}</h3><span class="price">${priceCopy}</span></div><p>${escapeHtml(description)}</p>${sizeControl}${variantControl}<div class="product-footer"><span class="diet">${escapeHtml(String(product.weight || product.availabilityLabel || "DISPONIBLE"))}</span>${hasPrice && (!soldOut || preorder) ? `<button class="add" aria-label="${preorder ? "Solicitar pre-order de" : "Agregar"} ${escapeHtml(name)}">${preorder ? "PRE-ORDER" : "+"}</button>` : ""}</div></div></article>`;
    }).filter(Boolean).join("");
    emptyState.insertAdjacentHTML("beforebegin", cards);
  }

  function setupCatalogGroups() {
    const container = $("#products");
    if (!container || container.classList.contains("catalog-organized")) return;
    const categories = ["cakes", "fonkies", "fomb", "salado", "beverages", "snacks"];
    const catalogItems = $$(".product, .fonkie-builder, .builder-panel", container);
    categories.forEach(category => {
      const items = catalogItems.filter(item => item.dataset.category === category);
      if (!items.length) return;
      const group = document.createElement("section");
      group.className = "catalog-group";
      group.dataset.catalogGroup = category;
      const grid = document.createElement("div");
      grid.className = "catalog-group-grid";
      items.forEach(item => grid.appendChild(item));
      group.append(grid);
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

  function addProduct(card) {
    const selectedVariant = $(".product-variant", card)?.value || "";
    const sizeSelect = $(".product-size", card);
    const selectedSize = sizeSelect?.value || "";
    if ($(".product-variant", card) && !selectedVariant) {
      say("Este sabor está agotado");
      return;
    }
    const preorder = card.dataset.preorder === "true";
    const selectedChoices = [selectedSize, selectedVariant, preorder ? "PRE-ORDER · Sujeto a confirmación" : ""].filter(Boolean);
    const choiceSlug = selectedChoices.join("-").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const id = choiceSlug ? `${card.dataset.id}-${choiceSlug}` : card.dataset.id;
    const selectedPrice = sizeSelect ? Number(sizeSelect.selectedOptions[0]?.dataset.price) : Number(card.dataset.price);
    const found = cart.find(item => item.id === id);
    if (found) {
      found.qty += 1;
    } else {
      cart.push({
        id,
        productId: card.dataset.productId || id,
        name: card.dataset.name,
        price: selectedPrice,
        image: card.dataset.image,
        ingredients: productIngredients(card.dataset.id),
        choices: selectedChoices.join(" · ") || undefined,
        qty: 1
      });
    }
    save();
    say("Añadido a tu pedido 💜");
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
    const unavailable = builder.dataset.soldOut === "true" && !preorder;
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
      $("#fonkieCount").textContent = `Has seleccionado ${total} ${total === 1 ? "Fonkie" : "Fonkies"}`;
      $("#fonkieTotal").textContent = money(price);
      addButton.disabled = total < minimum || unavailable;
      if (unavailable) {
        $("#fonkiePriceRule").textContent = "Producto agotado temporalmente.";
        $("#fonkieValidation").textContent = "Consulta disponibilidad por WhatsApp.";
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

    $$(".fonkie-stepper button", builder).forEach(button => button.addEventListener("click", () => {
      const output = $("output", button.closest(".fonkie-flavor"));
      const next = Math.max(0, Number(output.value || output.textContent || 0) + Number(button.dataset.delta));
      output.value = String(next);
      output.textContent = String(next);
      updateBuilder();
    }));

    addButton.addEventListener("click", () => {
      const selected = selectedFlavors();
      const total = selected.reduce((sum, item) => sum + item.qty, 0);
      if (total < minimum) {
        say(`Mínimo ${minimum} galletas para armar tu caja`);
        return;
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
    const unavailable = builder.dataset.soldOut === "true" && !preorder;
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
      if (unavailable) $("#fombValidation").textContent = "Producto agotado temporalmente. Consulta por WhatsApp.";
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

    $$(".fomb-flavor .fonkie-stepper button", builder).forEach(button => button.addEventListener("click", () => {
      const current = selection();
      const output = $("output", button.closest(".fomb-flavor"));
      const delta = Number(button.dataset.delta);
      if (delta > 0 && current.selectedTotal >= current.total) return;
      const next = Math.max(0, Number(output.value || output.textContent || 0) + delta);
      output.value = String(next);
      output.textContent = String(next);
      updateBuilder();
    }));

    addButton.addEventListener("click", () => {
      const current = selection();
      if (current.selectedTotal !== current.total) {
        say(`Selecciona exactamente ${current.total} bombones para armar tu caja`);
        return;
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
          qty: 1
        });
      }
      save();
      say("Caja Fomb añadida a tu pedido 💜");
    });

    updateBuilder();
  }

  window.changeQty = (id, delta) => {
    const item = cart.find(entry => entry.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(entry => entry.id !== id);
    save();
  };

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    $("#cartCount").textContent = count;
    $("#cartTotal").textContent = money(total);
    cartItems.innerHTML = cart.length
      ? cart.map(item => `
        <div class="cart-item">
          <img src="${item.image}" alt="">
          <div>
            <h4>${escapeHtml(item.name)}</h4>
            <small>${money(item.price)}</small>
            ${item.choices ? `<small class="cart-choices">${escapeHtml(item.choices)}</small>` : ""}
            <div class="qty">
              <button type="button" onclick="changeQty('${item.id}',-1)" aria-label="Restar">−</button>
              <b>${item.qty}</b>
              <button type="button" onclick="changeQty('${item.id}',1)" aria-label="Sumar">+</button>
            </div>
          </div>
          <button type="button" class="remove" onclick="changeQty('${item.id}',-${item.qty})" aria-label="Eliminar">×</button>
        </div>`).join("")
      : `<div class="empty"><b>Tu pedido está vacío</b><span>Agrega una delicia del menú para comenzar.</span></div>`;
  }

  function showCheckoutStep() {
    if (!cart.length) {
      say("Primero agrega algo rico al pedido");
      return;
    }
    cartItems.hidden = true;
    cartFooter.hidden = true;
    checkoutForm.hidden = false;
    backToCart.hidden = false;
    drawerTitle.textContent = "Datos del pedido";
    renderAllergyItemNotes();
    setupRequestedDate();
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
    $("#fulfillment").innerHTML = `
      <option value="pickup">${config.pickupLabel || "Pickup"}</option>
      <option value="delivery">${config.deliveryLabel || "Delivery"}</option>`;
    $("#paymentMethod").innerHTML = (config.paymentMethods || [])
      .map(method => `<option value="${method}">${method}</option>`)
      .join("");
  }

  function toggleAddress() {
    const delivery = $("#fulfillment").value === "delivery";
    $("#addressGroup").hidden = !delivery;
    $("#customerAddress").required = delivery;
    $("#requestedDateLabel").textContent = delivery ? "Fecha deseada para delivery" : "Fecha deseada para pickup";
  }

  function localDateValue(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function addPreparationDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function setupRequestedDate() {
    const leadTimes = cart
      .map(item => config.leadTimesByProduct?.[item.productId || item.id])
      .filter(Boolean);
    const minimumBusinessDays = leadTimes.length
      ? Math.max(...leadTimes.map(item => Number(item.minimumBusinessDays) || 0))
      : 0;
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

  }

  function renderAllergyItemNotes() {
    $("#allergyItemNotes").innerHTML = cart.map(item => {
      const fieldId = `allergyNote-${item.id.replace(/[^a-z0-9_-]/gi, "-")}`;
      return `<div class="item-allergy-field">
        <label for="${fieldId}">${escapeHtml(item.name)}</label>
        <textarea id="${fieldId}" name="allergyNote:${escapeHtml(item.id)}" placeholder="Ingrediente que debe evitarse e instrucciones para este producto"></textarea>
        <small>Ingredientes declarados: ${escapeHtml(item.ingredients || productIngredients(item.id))}</small>
      </div>`;
    }).join("");
  }

  function createOrderId() {
    const now = new Date();
    const date = [now.getFullYear().toString().slice(-2), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${config.orderPrefix || "FNT"}-${date}-${suffix}`;
  }

  function buildMessage(form) {
    const data = new FormData(form);
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
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
    const fulfillment = data.get("fulfillment") === "delivery"
      ? (config.deliveryLabel || "Delivery")
      : (config.pickupLabel || "Pickup");
    const lines = cart.map(item => `• ${item.qty}× ${item.name} — ${money(item.price * item.qty)}${item.choices ? `\n  Sabores: ${item.choices}` : ""}`);
    const orderId = createOrderId();
    const message = [
      `Hola ${config.businessName || "Fontana"} 💜 Quiero hacer este pedido:`,
      "",
      `*Pedido ${orderId}*`,
      ...lines,
      `*Total estimado: ${money(total)}*`,
      "",
      `Nombre: ${data.get("name")}`,
      `Teléfono: ${data.get("phone")}`,
      `Modalidad: ${fulfillment}`,
      data.get("address") ? `Dirección: ${data.get("address")}` : "",
      `Fecha deseada para ${fulfillment}: ${data.get("requestedDate")}`,
      `Forma de pago: ${data.get("payment")}`,
      "Condición de pago: 100% por adelantado; los datos se envían por WhatsApp",
      `Condiciones, alergias o intolerancias: ${hasAllergies ? allergyList.join(", ") : "No indica"}`,
      hasAllergies ? "*⚠️ INSTRUCCIONES POR PRODUCTO*" : "",
      ...itemAllergyLines,
      hasAllergies ? "*Estado: PENDIENTE DE REVISIÓN POR FONTANA*" : "Estado: pendiente de confirmación",
      data.get("notes") ? `Observaciones: ${data.get("notes")}` : "",
      "",
      "Enviaré el comprobante por este chat. El pedido se confirma únicamente cuando Fontana valide disponibilidad, pago y, si aplica, las condiciones, alergias o intolerancias indicadas."
    ].filter(Boolean).join("\n");
    return { message, orderId };
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!checkoutForm.reportValidity()) return;
    const formData = new FormData(checkoutForm);
    if (formData.get("hasAllergies") === "yes" && !formData.getAll("allergens").length && !String(formData.get("otherAllergy") || "").trim()) {
      say("Indica al menos una condición, alergia o intolerancia");
      $("#otherAllergy").focus();
      return;
    }
    const { message, orderId } = buildMessage(checkoutForm);
    const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");

    if (config.previewMode || !whatsappNumber) {
      window.__copiedOrder = message;
      try {
        await navigator.clipboard.writeText(message);
        say(`Pedido ${orderId} preparado y copiado ✓`);
      } catch {
        say(`Pedido ${orderId} preparado. Falta configurar WhatsApp.`);
      }
      return;
    }

    window.location.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
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
  $$(".add").forEach(button => button.addEventListener("click", () => addProduct(button.closest(".product"))));
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

  function toggleAllergyDetails() {
    const hasAllergies = checkoutForm.elements.hasAllergies.value === "yes";
    $("#allergyDetails").hidden = !hasAllergies;
    $("#crossContamination").required = hasAllergies;
    $$('[name^="allergyNote:"]').forEach(field => { field.required = hasAllergies; });
  }

  $("#cartButton").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#continueCheckout").addEventListener("click", showCheckoutStep);
  backToCart.addEventListener("click", showCartStep);
  backdrop.addEventListener("click", closeCart);
  checkoutForm.addEventListener("submit", submitOrder);
  $("#fulfillment").addEventListener("change", () => {
    toggleAddress();
    setupRequestedDate();
  });
  $$('input[name="hasAllergies"]').forEach(input => input.addEventListener("change", toggleAllergyDetails));
  document.addEventListener("keydown", event => event.key === "Escape" && closeCart());

  enhanceDietarySeals();
  enhanceProductSafety();
  setupFonkieBuilder();
  setupFombBuilder();
  setupMenuIntro();
  populateOptions();
  toggleAddress();
  renderCart();
})();
