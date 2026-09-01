(async () => {
  "use strict";

  const config = window.FONTANA_CONFIG || {};
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const soldOutStyle = document.createElement("style");
  soldOutStyle.textContent = ".builder-flavor-expanded-sold-out img,.product-expanded.product-sold-out:not(.product-temporarily-unavailable) .product-media img{filter:brightness(.5) saturate(.62)}";
  document.head.append(soldOutStyle);
  const adminStorageKey = "fontana-admin-catalog-v1";
  const localMode = ["localhost", "127.0.0.1"].includes(location.hostname);
  let storefrontReady = false;
  const pendingProductOpens = new Map();
  document.addEventListener("click", event => {
    if (storefrontReady) return;
    const media = event.target.closest?.(".product-media");
    const product = media?.closest?.(".product");
    if (!product) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = product.dataset.productId || product.dataset.id;
    if (id) pendingProductOpens.set(id, Boolean(product.dataset.productId));
  }, true);
  let adminStateVerified = false;
  // The catalogue request can be slow or offline; the visible menu heading
  // must not wait for it before running its existing entrance animation.
  setupMenuIntro();
  let adminState = await readAdminState();
  const catalogHydrationScrollAnchor = captureCatalogHydrationScrollAnchor();
  let productionWithElectricity = localMode ? adminState?.settings?.productionWithElectricity !== false : adminStateVerified && adminState?.operations?.electricityEnabled !== false;
  let stockTodayOpen = adminState?.settings?.stockTodayOpen !== false;
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
  const productAddQueues = new Map();
  const quantityQueueIdleResolvers = [];
  const quantityCommitTasks = new Set();
  let stockQuantityMutationTail = Promise.resolve();
  let quantityMutationVersion = 0;
  let storefrontCatalogRefresh = null;
  const optimizedAssetPaths = new Map([
    ["assets/pistacho-fontana-v4.png", "assets/pistacho-fontana-v4.webp"],
    ["assets/layer-cake-fontana-pro.png", "assets/layer-cake-fontana-pro.webp"]
  ]);

  function optimizedProductImage(image) {
    const path = String(image || "");
    return optimizedAssetPaths.get(path) || path;
  }

  const compactProductImageSizes = "(max-width:640px) calc(50vw - 18.5px),(max-width:959px) calc(50vw - 29px),380px";
  const compactGalleryImageSizes = "(max-width:640px) calc(100vw - 26px),(max-width:959px) calc(100vw - 40px),460px";
  const decodedImagePreloads = new Map();

  function localImageKey(source) {
    const value = String(source || "").trim();
    if (!value || /^(?:data|blob):/i.test(value)) return "";
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin) return "";
      const assetsIndex = url.pathname.indexOf("/assets/");
      return assetsIndex >= 0
        ? url.pathname.slice(assetsIndex + 1)
        : url.pathname.replace(/^\/+/, "");
    } catch (_error) {
      return value.replace(/^\/+/, "").split(/[?#]/, 1)[0];
    }
  }

  function responsiveImageDetails(source) {
    const key = localImageKey(source);
    return key ? window.FONTANA_RESPONSIVE_IMAGES?.[key] || null : null;
  }

  function responsiveImageMarkup(source, alt, { sizes = compactProductImageSizes, loading = "lazy" } = {}) {
    const image = optimizedProductImage(source || "assets/logo.png");
    const responsive = responsiveImageDetails(image);
    const fullImageKey = localImageKey(image);
    const compactSources = responsive?.sources
      ?.filter(candidate => localImageKey(candidate.path) !== fullImageKey) || [];
    const attributes = [
      `src="${escapeHtml(image)}"`,
      compactSources.length
        ? `srcset="${compactSources.map(candidate => `${escapeHtml(candidate.path)} ${Number(candidate.width)}w`).join(", ")}"`
        : "",
      compactSources.length ? `sizes="${escapeHtml(sizes)}"` : "",
      `data-full-src="${escapeHtml(image)}"`,
      responsive?.width ? `width="${Number(responsive.width)}"` : "",
      responsive?.height ? `height="${Number(responsive.height)}"` : "",
      loading ? `loading="${escapeHtml(loading)}"` : "",
      `decoding="async"`,
      `alt="${escapeHtml(alt || "")}"`
    ].filter(Boolean);
    return `<img ${attributes.join(" ")}>`;
  }

  function fullImageSource(image) {
    return image?.dataset.fullSrc || image?.getAttribute("src") || "";
  }

  function preloadDecodedImage(source) {
    const value = String(source || "").trim();
    if (!value) return Promise.resolve(false);
    if (decodedImagePreloads.has(value)) return decodedImagePreloads.get(value);
    const task = new Promise(resolve => {
      const preload = new Image();
      const finish = success => resolve(Boolean(success && preload.naturalWidth > 0));
      preload.decoding = "async";
      preload.addEventListener("load", async () => {
        try {
          if (typeof preload.decode === "function") await preload.decode();
          finish(true);
        } catch (_error) {
          finish(preload.complete);
        }
      }, { once:true });
      preload.addEventListener("error", () => finish(false), { once:true });
      preload.src = value;
    });
    decodedImagePreloads.set(value, task);
    task.then(success => {
      if (!success) decodedImagePreloads.delete(value);
    });
    return task;
  }

  function waitForDecodedImage(source, timeout = 5000) {
    return Promise.race([
      preloadDecodedImage(source),
      new Promise(resolve => window.setTimeout(() => resolve(false), timeout))
    ]);
  }

  function absoluteImageUrl(source) {
    try {
      return new URL(source, location.href).href;
    } catch (_error) {
      return "";
    }
  }

  function useDecodedImageSource(target, source, fullSource = source) {
    if (!target || !source) return false;
    target.removeAttribute("srcset");
    target.removeAttribute("sizes");
    target.dataset.fullSrc = fullSource || source;
    target.src = source;
    return true;
  }

  function useFullResolutionImage(target, sourceImage = target) {
    const source = fullImageSource(sourceImage);
    if (!target || !source) return false;
    return useDecodedImageSource(target, source, source);
  }

  function productHasLocalTrackedStock(product = {}) {
    return localMode
      && product.stockQuantity !== null
      && product.stockQuantity !== undefined
      && product.stockQuantity !== ""
      && Number.isFinite(Number(product.stockQuantity));
  }

  function productStockIsTracked(product = {}) {
    return product.stockTracked === true || productHasLocalTrackedStock(product);
  }

  function productAvailabilityMode(product = {}) {
    if (["available", "preorder", "sold-out"].includes(product.availabilityMode)) return product.availabilityMode;
    if (product.status === "sold-out") return product.allowPreorder === true ? "preorder" : "sold-out";
    // The catalogue lead-time table is a checkout scheduling fallback, not an
    // availability selection. Only a lead time stored on this legacy product
    // may migrate it to pre-order; otherwise "available" must still respect
    // live/local stock validation.
    const leadTime = Number(product.minimumBusinessDays);
    return leadTime >= 2 ? "preorder" : "available";
  }

  function resolvedBottegaAvailability({ stockTracked = false, soldOut = false, preorder = false, unavailable = false, availabilityMode = "" } = {}) {
    if (unavailable) return "unavailable";
    if (availabilityMode === "preorder") return "preorder";
    if (availabilityMode === "sold-out") return "unavailable";
    if (availabilityMode === "available") return soldOut ? "unavailable" : "immediate";
    if (!stockTracked) return "pending";
    if (!soldOut) return "immediate";
    return preorder ? "preorder" : "unavailable";
  }

  function bottegaAvailabilityCopy(availability) {
    if (availability === "immediate") return "ENTREGA INMEDIATA";
    if (availability === "preorder") return "PRE-ORDER";
    if (availability === "unavailable") return "AGOTADO";
    return "DISPONIBILIDAD POR CONFIRMAR";
  }

  function soldOutConsultHref(name) {
    const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");
    if (!whatsappNumber) return "";
    const message = `Hola Fontana sin gluten 💜 Quisiera saber para cuándo pueden tener disponible ${name}.`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function soldOutConsultMarkup(name) {
    const href = soldOutConsultHref(name);
    if (!href) return "Agotado temporalmente.";
    return `<a class="product-quote" href="${href}" target="_blank" rel="noopener">Preguntar cuándo estará disponible</a>`;
  }

  function builderFlavorConsultMarkup(details, name) {
    if (details.state !== "unavailable" || details.temporarilyUnavailable) return "";
    const href = soldOutConsultHref(name);
    if (!href) return "";
    return `<a class="builder-flavor-consult" href="${href}" target="_blank" rel="noopener">Preguntar disponibilidad</a>`;
  }

  function builderFlavorInventoryKey(flavor = {}) {
    return String(flavor.inventoryKey || "").trim();
  }

  function builderFlavorIdentity(flavor = {}) {
    const inventoryKey = builderFlavorInventoryKey(flavor);
    const name = String(flavor.name || "").trim();
    return inventoryKey ? `key:${inventoryKey}` : name ? `name:${name}` : "";
  }

  function normalizedBuilderFlavorEntries(flavors = []) {
    const quantities = new Map();
    for (const flavor of flavors || []) {
      const name = String(flavor?.name || "").trim();
      const inventoryKey = builderFlavorInventoryKey(flavor);
      const identity = builderFlavorIdentity({ name, inventoryKey });
      const rawQuantity = Number(flavor?.quantity ?? flavor?.qty ?? 0);
      if (!name || !identity || !Number.isFinite(rawQuantity)) continue;
      const quantity = Math.max(0, Math.floor(rawQuantity));
      if (!quantity) continue;
      const current = quantities.get(identity);
      quantities.set(identity, {
        identity,
        inventoryKey,
        name,
        quantity: Number(current?.quantity || 0) + quantity
      });
    }
    return [...quantities.values()]
      .sort((left, right) => left.identity === right.identity ? 0 : left.identity < right.identity ? -1 : 1);
  }

  function encodeBuilderCartIdentity(value) {
    return encodeURIComponent(String(value)).replace(/[!'()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }

  function builderFlavorSignature(flavors = []) {
    return normalizedBuilderFlavorEntries(flavors)
      .map(flavor => {
        const identity = flavor.inventoryKey ? `key:${flavor.inventoryKey}` : flavor.name;
        return `${encodeBuilderCartIdentity(identity)}:${flavor.quantity}`;
      })
      .join("|");
  }

  function builderCartId(kind, flavors, { boxSize = 0, extraCount = 0 } = {}) {
    const signature = builderFlavorSignature(flavors);
    if (!signature) return "";
    if (kind === "fonkies") return `fonkie-box-v2-${signature}`;
    if (kind !== "fomb") return "";
    const normalizedBoxSize = Math.max(0, Math.floor(Number(boxSize) || 0));
    const normalizedExtraCount = Math.max(0, Math.floor(Number(extraCount) || 0));
    if (!normalizedBoxSize) return "";
    return `fomb-box-v2-${normalizedBoxSize}-${normalizedExtraCount}-${signature}`;
  }

  function builderCartItemsCanMerge(left, right) {
    if (!left?.id || left.id !== right?.id) return false;
    const leftKind = left.inventory?.kind;
    const rightKind = right.inventory?.kind;
    const builderKinds = new Set(["fonkies", "fomb"]);
    if (!builderKinds.has(leftKind) && !builderKinds.has(rightKind)) return true;
    if (leftKind !== rightKind || !builderKinds.has(leftKind)) return false;
    const leftSignature = builderFlavorSignature(left.inventory?.flavors);
    const rightSignature = builderFlavorSignature(right.inventory?.flavors);
    if (!leftSignature || leftSignature !== rightSignature) return false;
    return leftKind !== "fomb"
      || (Number(left.inventory?.boxSize) === Number(right.inventory?.boxSize)
        && Number(left.inventory?.extraCount) === Number(right.inventory?.extraCount));
  }

  function captureCatalogHydrationScrollAnchor() {
    if (window.scrollY < 2) return null;
    const viewportLine = Math.min(window.innerHeight * 0.35, 280);
    const catalogItems = $$("#products > .product, #products > .fonkie-builder, #products > .builder-panel");
    const visibleItem = catalogItems.find(item => {
      const rect = item.getBoundingClientRect();
      return rect.top <= viewportLine && rect.bottom > viewportLine;
    });
    const stableSelectors = ["#historia", "#ubicacion", "#resenas", ".final", "footer"];
    const fallbackSelector = stableSelectors.find(selector => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && rect.top <= viewportLine && rect.bottom > viewportLine;
    });
    const fallback = fallbackSelector ? document.querySelector(fallbackSelector) : null;
    if (!visibleItem && !fallback) return null;
    const overflowAnchor = {
      html: document.documentElement.style.overflowAnchor,
      body: document.body.style.overflowAnchor
    };
    document.documentElement.style.overflowAnchor = "none";
    document.body.style.overflowAnchor = "none";
    return {
      x: window.scrollX,
      itemId: visibleItem?.dataset.productId || visibleItem?.dataset.id || "",
      itemCategory: visibleItem?.matches(".fonkie-builder, .builder-panel") ? visibleItem.dataset.category : "",
      itemTop: visibleItem?.getBoundingClientRect().top,
      fallbackSelector: fallbackSelector || "",
      fallbackTop: fallback?.getBoundingClientRect().top,
      overflowAnchor
    };
  }

  function restoreCatalogHydrationScrollAnchor(anchor) {
    if (!anchor) return;
    let element = null;
    let previousTop = null;
    if (anchor.itemId) {
      element = document.querySelector(`#products [data-product-id="${CSS.escape(anchor.itemId)}"], #products [data-id="${CSS.escape(anchor.itemId)}"]`);
      previousTop = anchor.itemTop;
    } else if (anchor.itemCategory) {
      element = document.querySelector(`#products [data-category="${CSS.escape(anchor.itemCategory)}"]`);
      previousTop = anchor.itemTop;
    }
    if (!element && anchor.fallbackSelector) {
      element = document.querySelector(anchor.fallbackSelector);
      previousTop = anchor.fallbackTop;
    }
    if (!element || !Number.isFinite(previousTop)) return;
    const delta = element.getBoundingClientRect().top - previousTop;
    if (Math.abs(delta) > 1) window.scrollTo({left:anchor.x,top:window.scrollY + delta,behavior:"instant"});
  }

  function releaseCatalogHydrationScrollAnchor(anchor) {
    const restoreInlineValue = (element, value) => {
      if (value) element.style.overflowAnchor = value;
      else element.style.removeProperty("overflow-anchor");
    };
    restoreInlineValue(document.documentElement, anchor.overflowAnchor.html);
    restoreInlineValue(document.body, anchor.overflowAnchor.body);
  }

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
    // Bottega must remain visible while the owner finishes publishing its
    // inventory definitions. In verified production these fallback cards are
    // consultation-only until the Worker catalogue contains their IDs, so a
    // visible product can never create an invalid reservation.
    const newlyConfiguredProducts = configuredProducts
      .filter(product => !managedIds.has(product.id)
        && (localMode || !adminStateVerified || product.category === "bottega"))
      .map(product => ({
        ...product,
        catalogManaged: localMode
      }));
    config.dynamicCatalog = [
      ...adminState.products
        .filter(product => !product.deleted && product.visible !== false)
        .map(product => ({...product, catalogManaged:true})),
      ...newlyConfiguredProducts
    ].map(product => ({...product, image:optimizedProductImage(product.image)}));
    config.dynamicCatalog.forEach(product => {
      if (!product.id || !Number.isFinite(Number(product.minimumBusinessDays))) return;
      config.leadTimesByProduct ||= {};
      config.leadTimesByProduct[product.id] = {
        minimumBusinessDays: Math.max(0, Number(product.minimumBusinessDays)),
        label: product.leadTimeLabel || `${product.name}: sujeto a confirmación por WhatsApp`
      };
    });
  }

  function reconcileCartEntries(stored) {
    let changed = false;
    const normalized = [];
    for (const storedItem of stored) {
      const item = {...storedItem, inventory:{...(storedItem.inventory || {})}};
      if (item.inventory.kind === "product") {
        if (refreshBottegaCartAvailability(item)) changed = true;
      }
      if (item.inventory.kind === "fonkies" || item.inventory.kind === "fomb") {
        if (refreshBuilderCartAvailability(item)) changed = true;
      }
      if (item.inventory.kind === "fomb") {
        const selectedTotal = (item.inventory.flavors || []).reduce(
          (sum, flavor) => sum + Math.max(0, Number(flavor.quantity ?? flavor.qty ?? 0)),
          0
        );
        const pricing = resolveFombPricing(selectedTotal);
        if (pricing && selectedTotal >= pricing.size) {
          if (Number(item.price) !== pricing.price
            || Number(item.inventory.boxSize) !== pricing.size
            || Number(item.inventory.extraCount) !== pricing.extras) changed = true;
          item.price = pricing.price;
          item.inventory.boxSize = pricing.size;
          item.inventory.extraCount = pricing.extras;
        }
      }
      if (item.inventory.kind === "fonkies" && adminState?.builders?.fonkies) {
        const selected = normalizedBuilderFlavorEntries(item.inventory.flavors);
        const selectedTotal = selected.reduce((sum, flavor) => sum + flavor.quantity, 0);
        const minimum = Math.max(1, Number(adminState.builders.fonkies.minimumQuantity || 4));
        if (selectedTotal >= minimum) {
          const currentPrice = fonkiePrice(selectedTotal, selected.length);
          if (Number.isFinite(currentPrice) && Number(item.price) !== currentPrice) {
            item.price = currentPrice;
            changed = true;
          }
        }
      }
      if (item.inventory.kind === "fonkies" || item.inventory.kind === "fomb") {
        const canonicalId = builderCartId(item.inventory.kind, item.inventory.flavors, {
          boxSize: item.inventory.boxSize,
          extraCount: item.inventory.extraCount
        });
        if (canonicalId && canonicalId !== item.id) {
          item.id = canonicalId;
          changed = true;
        }
      }
      const existing = item.id ? normalized.find(candidate => builderCartItemsCanMerge(candidate, item)) : null;
      if (existing) {
        existing.qty = Number(existing.qty || 0) + Number(item.qty || 0);
        changed = true;
      } else normalized.push(item);
    }
    return { cart:normalized, changed };
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
      const reconciled = reconcileCartEntries(stored);
      if (reconciled.changed) localStorage.setItem(storageKey, JSON.stringify(reconciled.cart));
      return reconciled.cart;
    } catch {
      return [];
    }
  }

  function stockChecks(items = cart, extraChecks = []) {
    const checks = [];
    for (const item of items) {
      const inventory = item.inventory || {};
      const itemQuantity = Math.max(0, Number(item.qty || 0));
      if (!itemQuantity) continue;
      if (inventory.kind === "product") {
        if (inventory.preorder) continue;
        checks.push({kind:"product",productId:inventory.productId || item.productId,size:inventory.size || "",variant:inventory.variant || "",quantity:itemQuantity});
        continue;
      }
      if (inventory.kind !== "fonkies" && inventory.kind !== "fomb") continue;
      for (const flavor of inventory.flavors || []) {
        if (flavor.preorder) continue;
        const perBox = Math.max(0, Number(flavor.quantity ?? flavor.qty ?? 0));
        if (perBox) checks.push({
          kind:inventory.kind,
          flavor:flavor.name,
          inventoryKey:builderFlavorInventoryKey(flavor),
          quantity:perBox * itemQuantity
        });
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
        : `${check.kind}:${check.inventoryKey ? `key:${check.inventoryKey}` : `name:${check.flavor}`}`;
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
        const configuredKey = String(check.inventoryKey || "").trim();
        const flavor = configuredKey
          ? adminState.builders?.[check.kind]?.flavors?.find(item => builderFlavorInventoryKey(item) === configuredKey)
          : adminState.builders?.[check.kind]?.flavors?.find(item => item.name === check.flavor);
        if (configuredKey && !flavor) return false;
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
    const configuredTimeout = Number(config.stockValidationTimeoutMs ?? config.catalogApiTimeoutMs ?? 6000);
    const timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.min(15000, Math.max(2500, configuredTimeout))
      : 6000;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBase}/v1/orders/validate`, {
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({checks}),signal:controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      return response.ok ? {ok:true} : {ok:false,error:payload.error || "No hay suficientes unidades disponibles para esa cantidad."};
    } catch {
      return {ok:false,error:"No pudimos comprobar el inventario. Inténtalo otra vez."};
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function reservationItems() {
    return cart.map(item => ({
      quantity:item.qty,
      kind:item.inventory?.kind || "product",
      productId:item.inventory?.productId || item.productId,
      size:item.inventory?.size || "",
      variant:item.inventory?.variant || "",
      flavors:(item.inventory?.flavors || []).map(flavor => ({
        name:flavor.name,
        inventoryKey:builderFlavorInventoryKey(flavor),
        quantity:Number(flavor.quantity ?? flavor.qty ?? 0),
        preorder:Boolean(flavor.preorder)
      })),
      boxSize:item.inventory?.boxSize,
      extraCount:item.inventory?.extraCount,
      preorder:Boolean(item.inventory?.preorder)
    }));
  }

  function money(value) {
    const amount = new Intl.NumberFormat(config.locale || "es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
    return `${config.displayCurrency || "REF"}\u00a0${amount}`;
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

  function builderRequiresElectricity(kind, builder = adminState?.builders?.[kind]) {
    const explicitlyConfigured = builder && Object.prototype.hasOwnProperty.call(builder, "requiresElectricity");
    return builder?.requiresElectricity === true
      || (kind === "fonkies" && !explicitlyConfigured);
  }

  function builderTemporarilyUnavailable(kind, builder = adminState?.builders?.[kind]) {
    return builder?.temporarilyUnavailable === true
      || (!productionWithElectricity && builderRequiresElectricity(kind, builder));
  }

  function setupElectricityNotice() {
    const notice = $("#electricityNotice");
    if (!notice) return;
    const paused = [
      builderTemporarilyUnavailable("fonkies") ? "Fonkies" : "",
      builderTemporarilyUnavailable("fomb") ? "Fomb" : ""
    ].filter(Boolean);
    notice.hidden = paused.length === 0;
    if (!paused.length) return;
    const names = paused.length === 2 ? `${paused[0]} y ${paused[1]}` : paused[0];
    notice.textContent = `Producción de ${names} temporalmente pausada. El resto del catálogo sigue disponible.`;
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
    const soldOut = builder.status === "sold-out";
    const temporarilyUnavailable = Boolean(builder.temporarilyUnavailable || element.dataset.temporarilyUnavailable === "true");
    const preorder = soldOut && builder.allowPreorder;
    const labels = [temporarilyUnavailable ? "TEMPORALMENTE NO DISPONIBLE" : "", soldOut && !preorder ? "AGOTADO" : "", preorder ? "PREORDENAR · 2 DÍAS" : "", builder.isNew ? "NUEVO" : "", builder.promo ? "PROMOCIÓN DEL DÍA" : "", element.dataset.immediate === "true" ? "DISPONIBLE HOY" : ""].filter(Boolean);
    if (!labels.length) return;
    const tags = document.createElement("div");
    tags.className = "builder-admin-tags";
    tags.innerHTML = labels.map(label => {
      const statusClass = label === "TEMPORALMENTE NO DISPONIBLE" || label === "AGOTADO" ? " status-unavailable" : label.startsWith("PREORDENAR") ? " status-preorder" : "";
      return `<span class="${statusClass.trim()}">${escapeHtml(label)}</span>`;
    }).join("");
    element.prepend(tags);
  }

  function builderFlavorStockDetails(flavor = {}, builder = {}) {
    // Only the central inventory flag may promise immediate fulfillment. The
    // legacy catalogue quantity is intentionally ignored here: it is not the
    // owner's live stock source and the public Worker removes it. Local preview
    // has no Worker transformation, so a configured local quantity represents
    // the equivalent tracked state there.
    const localQuantityConfigured = localMode
      && flavor.stockQuantity !== null
      && flavor.stockQuantity !== undefined
      && flavor.stockQuantity !== ""
      && Number.isFinite(Number(flavor.stockQuantity));
    const tracked = flavor.stockTracked === true || localQuantityConfigured;
    const temporarilyUnavailable = builder.temporarilyUnavailable === true;
    const builderSoldOut = builder.status === "sold-out";
    const flavorSoldOut = flavor.status === "sold-out"
      || (localQuantityConfigured && Number(flavor.stockQuantity) <= 0);
    const soldOut = builderSoldOut || flavorSoldOut;
    const preorderAllowed = builder.availabilityMode !== "sold-out"
      && flavor.availabilityMode !== "sold-out"
      && (builder.availabilityMode === "preorder"
        || flavor.availabilityMode === "preorder"
        || (builder.availabilityMode === undefined
          && flavor.availabilityMode === undefined
          && builder.allowPreorder === true));
    const state = temporarilyUnavailable
      ? "unavailable"
      : soldOut
        ? preorderAllowed ? "preorder" : "unavailable"
        : tracked
          ? "immediate"
          : "pending";
    const label = state === "unavailable"
      ? temporarilyUnavailable ? "Temporalmente no disponible" : "Agotado"
      : state === "immediate"
        ? "Entrega inmediata"
        : state === "preorder"
          ? "Preordenar · 2 días"
          : "Disponibilidad por confirmar";
    return { tracked, soldOut, state, label, preorderAllowed, temporarilyUnavailable };
  }

  function builderAvailabilityContext(builderElement, builderMeta = {}) {
    const preorder = builderElement?.dataset.preorder === "true";
    return {
      availabilityMode: builderMeta.availabilityMode || (preorder ? "preorder" : undefined),
      status: builderElement?.dataset.soldOut === "true" ? "sold-out" : builderMeta.status,
      allowPreorder: builderMeta.allowPreorder === true || preorder,
      temporarilyUnavailable: builderElement?.dataset.temporarilyUnavailable === "true"
        || builderMeta.temporarilyUnavailable === true
    };
  }

  function builderMinimumBoxQuantity(kind, builder = {}) {
    if (kind === "fonkies") {
      const minimum = Number(builder.minimumQuantity);
      return Number.isFinite(minimum) && minimum > 0 ? Math.floor(minimum) : 4;
    }
    const sizes = (Array.isArray(builder.sizes) ? builder.sizes : [])
      .map(size => Math.floor(Number(size?.quantity)))
      .filter(quantity => Number.isFinite(quantity) && quantity > 0);
    return sizes.length ? Math.min(...sizes) : 4;
  }

  function builderHasImmediateBox(kind, builder = {}, stockContext = {}) {
    if (stockContext.temporarilyUnavailable === true || builder.status === "sold-out") return false;
    const flavors = Array.isArray(builder.flavors) ? builder.flavors : [];
    const hasLocalQuantities = localMode && flavors.some(flavor =>
      flavor.stockQuantity !== null
      && flavor.stockQuantity !== undefined
      && flavor.stockQuantity !== ""
      && Number.isFinite(Number(flavor.stockQuantity))
    );
    // Production receives this privacy-preserving boolean from the Worker. It
    // indicates that the tracked units can fill at least the smallest box,
    // without publishing any inventory count in the catalogue response.
    if (!hasLocalQuantities) return builder.immediateBoxAvailable === true;
    const trackedUnits = flavors.reduce((sum, flavor) => {
      const quantity = Math.max(0, Math.floor(Number(flavor.stockQuantity) || 0));
      return builderFlavorStockDetails(flavor, stockContext).state === "immediate"
        ? sum + quantity
        : sum;
    }, 0);
    return trackedUnits >= builderMinimumBoxQuantity(kind, builder);
  }

  function builderFlavorAvailabilityMarkup(details) {
    return `<small class="builder-flavor-availability" data-stock-state="${details.state}">${details.label}</small>`;
  }

  function builderFlavorShowsSoldOut(details = {}) {
    return details.state === "unavailable" && details.temporarilyUnavailable !== true;
  }

  function decorateStaticBuilderAvailability(builder, cardSelector, rowSelector, details) {
    const decorate = (element, labelHost) => {
      const showsSoldOut = builderFlavorShowsSoldOut(details);
      element.dataset.stockState = details.state;
      element.dataset.soldOut = String(showsSoldOut);
      element.classList.toggle("builder-flavor-sold-out", showsSoldOut);
      const host = labelHost(element);
      if (!host) return;
      let label = $(".builder-flavor-availability", host);
      if (!element.dataset.flavor) {
        const name = [...host.childNodes]
          .filter(node => node !== label)
          .map(node => node.textContent || "")
          .join("")
          .trim();
        if (name) element.dataset.flavor = name;
      }
      if (!label) {
        label = document.createElement("small");
        label.className = "builder-flavor-availability";
        host.append(label);
      }
      label.dataset.stockState = details.state;
      label.textContent = details.label;
    };
    $$(cardSelector, builder).forEach(card => decorate(card, element => $(":scope > span", element)));
    $$(rowSelector, builder).forEach(row => decorate(row, element => $(".fonkie-flavor-name", element)));
  }

  function selectedBuilderAvailability(selected) {
    if (selected.some(item => item.stockState === "unavailable")) return "unavailable";
    if (selected.some(item => item.stockState === "preorder" || item.preorder)) return "preorder";
    if (selected.length && selected.every(item => item.stockState === "immediate")) return "immediate";
    return "pending";
  }

  function builderAvailabilityCopy(availability) {
    if (availability === "unavailable") return "TEMPORALMENTE NO DISPONIBLE";
    if (availability === "immediate") return "ENTREGA INMEDIATA";
    if (availability === "preorder") return "PRE-ORDER · 2 días";
    return "DISPONIBILIDAD POR CONFIRMAR";
  }

  function refreshBottegaCartAvailability(item) {
    const inventory = item.inventory || {};
    if (inventory.kind !== "product") return false;
    const catalogAvailable = Boolean(adminState && Array.isArray(adminState.products));
    const productId = inventory.productId || item.productId;
    const product = adminState?.products?.find(candidate => candidate.id === productId);
    if (item.category !== "bottega" && product?.category !== "bottega") return false;
    // Without a verified/current catalogue, preserve the last known state. A
    // refresh with a real catalogue is what authoritatively changes the cart.
    if (!catalogAvailable) return false;

    const missingOrHidden = !product || product.deleted === true || product.visible === false;
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
    const availableVariants = variants.filter(variant => variant.status !== "sold-out" && variant.stockQuantity !== 0);
    const availableSizes = sizes.filter(size => size.status !== "sold-out" && size.stockQuantity !== 0);
    const availabilityMode = productAvailabilityMode(product || {});
    const soldOut = availabilityMode === "preorder"
      || availabilityMode === "sold-out"
      || product?.status === "sold-out"
      || product?.stockQuantity === 0
      || (variants.length > 0 && availableVariants.length === 0)
      || (sizes.length > 0 && availableSizes.length === 0);
    const preorderAllowed = availabilityMode === "preorder";
    const preorder = soldOut && preorderAllowed;
    const temporarilyUnavailable = Boolean(product?.temporarilyUnavailable
      || (!productionWithElectricity && product?.requiresElectricity));
    const availability = resolvedBottegaAvailability({
      stockTracked: productStockIsTracked(product),
      soldOut,
      preorder,
      availabilityMode,
      unavailable: missingOrHidden || temporarilyUnavailable
    });
    const effectivePreorder = availability === "preorder";
    const choices = [
      inventory.size,
      inventory.variant,
      bottegaAvailabilityCopy(availability)
    ].filter(Boolean).join(" · ");
    const changed = inventory.availability !== availability
      || Boolean(inventory.preorder) !== effectivePreorder
      || item.choices !== choices;
    inventory.preorder = effectivePreorder;
    inventory.availability = availability;
    item.choices = choices;
    return changed;
  }

  function refreshBuilderCartAvailability(item) {
    const inventory = item.inventory || {};
    const kind = inventory.kind;
    if (kind !== "fonkies" && kind !== "fomb") return false;
    const catalogAvailable = Boolean(adminState && Array.isArray(adminState.products));
    const builder = adminState?.builders?.[kind];
    const builderMissingOrHidden = catalogAvailable && (!builder || builder.visible === false);
    const builderUnavailable = builderMissingOrHidden || builderTemporarilyUnavailable(kind, builder);
    const selected = (inventory.flavors || []).map(flavor => {
      const storedInventoryKey = builderFlavorInventoryKey(flavor);
      // A cart that already knows its immutable inventory key must never jump
      // to a newly-created flavor that happens to reuse the same visible name.
      // Name matching remains only as a one-time migration path for old carts.
      const meta = storedInventoryKey
        ? builder?.flavors?.find(candidate => builderFlavorInventoryKey(candidate) === storedInventoryKey)
        : builder?.flavors?.find(candidate => candidate.name === flavor.name);
      const inventoryKey = meta ? builderFlavorInventoryKey(meta) : storedInventoryKey;
      const name = meta ? String(meta.name || flavor.name) : flavor.name;
      const previousState = ["unavailable", "preorder", "immediate", "pending"].includes(flavor.stockState)
        ? flavor.stockState
        : flavor.preorder
          ? "preorder"
          : "pending";
      const stock = builderMissingOrHidden || (catalogAvailable && !meta)
        ? { state:"unavailable", soldOut:false }
        : meta
          ? builderFlavorStockDetails(meta, builder)
          : { state:previousState, soldOut:previousState === "preorder" };
      return {
        ...flavor,
        name,
        inventoryKey,
        qty: Number(flavor.quantity ?? flavor.qty ?? 0),
        preorder: !builderUnavailable && stock.state === "preorder",
        stockState: stock.state
      };
    });
    const flavorUnavailable = selected.some(flavor => flavor.stockState === "unavailable");
    const availability = builderUnavailable || flavorUnavailable
      ? "unavailable"
      : selected.some(flavor => flavor.preorder)
        ? "preorder"
        : selectedBuilderAvailability(selected);
    const preorder = availability === "preorder";
    const baseName = String(item.name || "").replace(/^Pre-order\s*·\s*/i, "");
    const name = preorder ? `Pre-order · ${baseName}` : baseName;
    const choices = [
      selected.map(flavor => `${flavor.qty} ${flavor.name}${flavor.preorder ? " (Pre-Order)" : ""}`).join(", "),
      builderAvailabilityCopy(availability)
    ].filter(Boolean).join(" · ");
    const changed = inventory.availability !== availability
      || Boolean(inventory.preorder) !== preorder
      || item.name !== name
      || item.choices !== choices
      || JSON.stringify(inventory.flavors || []) !== JSON.stringify(selected.map(flavor => ({
        name:flavor.name,
        inventoryKey:flavor.inventoryKey,
        qty:flavor.qty,
        preorder:flavor.preorder,
        stockState:flavor.stockState
      })));
    item.name = name;
    item.choices = choices;
    inventory.flavors = selected.map(flavor => ({
      name:flavor.name,
      inventoryKey:flavor.inventoryKey,
      qty:flavor.qty,
      preorder:flavor.preorder,
      stockState:flavor.stockState
    }));
    inventory.preorder = preorder;
    inventory.availability = availability;
    return changed;
  }

  function applyAdminBuilders() {
    if (!adminState?.builders) {
      const fonkieBuilder = $(".fonkie-builder");
      const fombBuilder = $(".fomb-builder");
      if (fonkieBuilder) {
        fonkieBuilder.dataset.preorder = "true";
        fonkieBuilder.dataset.immediate = "false";
        const temporarilyUnavailable = builderTemporarilyUnavailable("fonkies");
        fonkieBuilder.dataset.temporarilyUnavailable = String(temporarilyUnavailable);
        decorateStaticBuilderAvailability(
          fonkieBuilder,
          ".fonkie-gallery-card",
          ".fonkie-flavor",
          builderFlavorStockDetails({}, { temporarilyUnavailable })
        );
      }
      if (fombBuilder) {
        fombBuilder.dataset.preorder = "true";
        fombBuilder.dataset.immediate = "false";
        const temporarilyUnavailable = builderTemporarilyUnavailable("fomb");
        fombBuilder.dataset.temporarilyUnavailable = String(temporarilyUnavailable);
        decorateStaticBuilderAvailability(
          fombBuilder,
          ".builder-gallery-card",
          ".fomb-flavor",
          builderFlavorStockDetails({}, { temporarilyUnavailable })
        );
      }
      return;
    }
    const fonkies = adminState.builders.fonkies;
    const fonkieBuilder = $(".fonkie-builder");
    if (fonkies && fonkieBuilder) {
      const temporarilyUnavailable = builderTemporarilyUnavailable("fonkies", fonkies);
      const flavors = Array.isArray(fonkies.flavors) ? fonkies.flavors : [];
      const stockContext = {
        availabilityMode: fonkies.availabilityMode,
        status: fonkies.status,
        allowPreorder: Boolean(fonkies.allowPreorder),
        temporarilyUnavailable
      };
      const hasImmediateBox = builderHasImmediateBox("fonkies", fonkies, stockContext);
      fonkieBuilder.dataset.promo = String(Boolean(fonkies.promo));
      fonkieBuilder.dataset.immediate = String(stockTodayOpen && hasImmediateBox);
      fonkieBuilder.dataset.new = String(Boolean(fonkies.isNew));
      fonkieBuilder.dataset.preorder = String(Boolean(fonkies.allowPreorder));
      fonkieBuilder.dataset.glutenFree = String(fonkies.glutenFree !== false);
      fonkieBuilder.dataset.sugarFree = String(fonkies.sugarFree !== false);
      fonkieBuilder.dataset.lactoseFree = String(fonkies.lactoseFree !== false);
      fonkieBuilder.dataset.eggFree = String(Boolean(fonkies.eggFree));
      fonkieBuilder.dataset.soldOut = String(fonkies.status === "sold-out");
      fonkieBuilder.dataset.temporarilyUnavailable = String(temporarilyUnavailable);
      fonkieBuilder.hidden = fonkies.visible === false;
      renderBuilderTags(fonkieBuilder, fonkies);
      const gallery = $(".fonkie-gallery-track", fonkieBuilder);
      const chooser = $(".fonkie-flavors", fonkieBuilder);
      const count = $(".gallery-label-meta span", fonkieBuilder);
      if (count) count.textContent = `${flavors.length} sabores`;
      if (gallery) gallery.innerHTML = flavors.map(flavor => {
        const stock = builderFlavorStockDetails(flavor, stockContext);
        const showsSoldOut = builderFlavorShowsSoldOut(stock);
        return `<figure class="fonkie-gallery-card${showsSoldOut ? " builder-flavor-sold-out" : ""}" data-flavor="${escapeHtml(flavor.name)}" data-inventory-key="${escapeHtml(builderFlavorInventoryKey(flavor))}" data-sold-out="${showsSoldOut}" data-stock-state="${stock.state}">${responsiveImageMarkup(flavor.image || "assets/logo.png", `Fonkie ${flavor.name}`, { sizes:compactGalleryImageSizes })}<span>${escapeHtml(flavor.name)}${builderFlavorAvailabilityMarkup(stock)}</span></figure>`;
      }).join("");
      if (chooser) chooser.innerHTML = flavors.map(flavor => {
        const stock = builderFlavorStockDetails(flavor, stockContext);
        const showsSoldOut = builderFlavorShowsSoldOut(stock);
        const consult = builderFlavorConsultMarkup(stock, `${flavor.name} de Fonkies`);
        return `<div class="fonkie-flavor${showsSoldOut ? " builder-flavor-sold-out" : ""}" data-flavor="${escapeHtml(flavor.name)}" data-inventory-key="${escapeHtml(builderFlavorInventoryKey(flavor))}" data-sold-out="${showsSoldOut}" data-stock-state="${stock.state}"><span class="fonkie-flavor-name">${escapeHtml(flavor.name)}${builderFlavorAvailabilityMarkup(stock)}${consult}</span><div class="fonkie-stepper"><button type="button" data-delta="-1" aria-label="Restar ${escapeHtml(flavor.name)}">−</button><output>0</output><button type="button" data-delta="1" aria-label="Sumar ${escapeHtml(flavor.name)}" ${stock.state === "unavailable" ? "disabled" : ""}>+</button></div></div>`;
      }).join("");
      const availableIngredients = flavors.map(flavor => `${flavor.name}: ${flavor.ingredients || "Ingredientes pendientes de confirmar con Fontana"}`).join(". ");
      fonkieBuilder.dataset.ingredients = availableIngredients;
      if (fonkies.image) fonkieBuilder.dataset.image = fonkies.image;
    }

    const fomb = adminState.builders.fomb;
    const fombBuilder = $(".fomb-builder");
    if (fomb && fombBuilder) {
      const temporarilyUnavailable = builderTemporarilyUnavailable("fomb", fomb);
      const flavors = Array.isArray(fomb.flavors) ? fomb.flavors : [];
      const stockContext = {
        availabilityMode: fomb.availabilityMode,
        status: fomb.status,
        allowPreorder: Boolean(fomb.allowPreorder),
        temporarilyUnavailable
      };
      const hasImmediateBox = builderHasImmediateBox("fomb", fomb, stockContext);
      fombBuilder.dataset.promo = String(Boolean(fomb.promo));
      fombBuilder.dataset.immediate = String(stockTodayOpen && hasImmediateBox);
      fombBuilder.dataset.new = String(Boolean(fomb.isNew));
      fombBuilder.dataset.preorder = String(Boolean(fomb.allowPreorder));
      fombBuilder.dataset.glutenFree = String(fomb.glutenFree !== false);
      fombBuilder.dataset.sugarFree = String(fomb.sugarFree !== false);
      fombBuilder.dataset.lactoseFree = String(fomb.lactoseFree !== false);
      fombBuilder.dataset.eggFree = String(fomb.eggFree !== false);
      fombBuilder.dataset.soldOut = String(fomb.status === "sold-out");
      fombBuilder.dataset.temporarilyUnavailable = String(temporarilyUnavailable);
      fombBuilder.hidden = fomb.visible === false;
      renderBuilderTags(fombBuilder, fomb);
      const gallery = $(".builder-gallery-track", fombBuilder);
      const chooser = $(".fomb-flavors", fombBuilder);
      const count = $(".gallery-label-meta span", fombBuilder);
      if (count) count.textContent = `${flavors.length} sabores`;
      if (gallery) gallery.innerHTML = flavors.map(flavor => {
        const stock = builderFlavorStockDetails(flavor, stockContext);
        const showsSoldOut = builderFlavorShowsSoldOut(stock);
        return `<figure class="builder-gallery-card${showsSoldOut ? " builder-flavor-sold-out" : ""}" data-flavor="${escapeHtml(flavor.name)}" data-inventory-key="${escapeHtml(builderFlavorInventoryKey(flavor))}" data-sold-out="${showsSoldOut}" data-stock-state="${stock.state}">${responsiveImageMarkup(flavor.image || "assets/logo.png", `Fomb ${flavor.name}`, { sizes:compactGalleryImageSizes })}<span>${escapeHtml(flavor.name)}${builderFlavorAvailabilityMarkup(stock)}</span></figure>`;
      }).join("");
      if (chooser) chooser.innerHTML = flavors.map(flavor => {
        const stock = builderFlavorStockDetails(flavor, stockContext);
        const showsSoldOut = builderFlavorShowsSoldOut(stock);
        const consult = builderFlavorConsultMarkup(stock, `${flavor.name} de Fomb`);
        return `<div class="fomb-flavor${showsSoldOut ? " builder-flavor-sold-out" : ""}" data-flavor="${escapeHtml(flavor.name)}" data-inventory-key="${escapeHtml(builderFlavorInventoryKey(flavor))}" data-sold-out="${showsSoldOut}" data-stock-state="${stock.state}"><span class="fonkie-flavor-name">${escapeHtml(flavor.name)}${builderFlavorAvailabilityMarkup(stock)}${consult}</span><div class="fonkie-stepper"><button type="button" data-delta="-1" aria-label="Restar ${escapeHtml(flavor.name)}">−</button><output>0</output><button type="button" data-delta="1" aria-label="Sumar ${escapeHtml(flavor.name)}" ${stock.state === "unavailable" ? "disabled" : ""}>+</button></div></div>`;
      }).join("");
      const sizes = Array.isArray(fomb.sizes) && fomb.sizes.length ? fomb.sizes : [{ quantity: 4, price: 15 }, { quantity: 12, price: 30 }];
      const sizeOptions = $(".fomb-size-options", fombBuilder);
      if (sizeOptions) sizeOptions.innerHTML = sizes.map((size, index) => `<label class="fomb-size-option"><input type="radio" name="fombSize" value="${Number(size.quantity)}" data-price="${Number(size.price)}" ${index === 0 ? "checked" : ""}> Caja de ${Number(size.quantity)} · ${money(Number(size.price))}</label>`).join("");
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
      const ingredientSentence = /[.!?]$/.test(ingredients.trim()) ? ingredients.trim() : `${ingredients.trim()}.`;
      const expandedIngredients = document.createElement("section");
      expandedIngredients.className = "product-expanded-ingredients";
      const expandedHeading = document.createElement("h4");
      expandedHeading.textContent = "Ingredientes";
      const expandedNote = document.createElement("div");
      expandedNote.textContent = `${ingredientSentence}${leadTime ? ` Preparación: ${leadTime}.` : ""}`;
      expandedIngredients.append(expandedHeading, expandedNote);
      details.append(summary, note);
      body.insertBefore(details, footer);
      body.insertBefore(expandedIngredients, footer);
    });
  }

  let productCardHeightFrame = 0;
  let productCardHeightAnchor = null;
  let productCardHeightAnchorCycle = 0;
  let productCardHeightOverflowAnchorState = null;

  function restoreInlineOverflowAnchor(element, value) {
    if (value) element.style.overflowAnchor = value;
    else element.style.removeProperty("overflow-anchor");
  }

  function captureProductCardHeightAnchor(element) {
    if (!element?.isConnected) return;
    const html = document.documentElement;
    const body = document.body;
    if (!productCardHeightOverflowAnchorState) {
      productCardHeightOverflowAnchorState = {
        html: html.style.overflowAnchor,
        body: body.style.overflowAnchor
      };
    }
    html.style.overflowAnchor = "none";
    body.style.overflowAnchor = "none";
    productCardHeightAnchor = {
      element,
      top: element.getBoundingClientRect().top,
      x: window.scrollX,
      cycle: ++productCardHeightAnchorCycle
    };
  }

  function restoreProductCardHeightAnchor(anchor) {
    const html = document.documentElement;
    const correctPosition = () => {
      if (!anchor?.element?.isConnected || !Number.isFinite(anchor.top)) return;
      const delta = anchor.element.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) <= 1) return;
      const scrollBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      void html.offsetHeight;
      window.scrollTo(anchor.x, window.scrollY + delta);
      void html.offsetHeight;
      html.style.scrollBehavior = scrollBehavior;
    };
    correctPosition();
    if (!anchor) return;
    requestAnimationFrame(() => {
      if (productCardHeightAnchorCycle !== anchor.cycle) return;
      correctPosition();
      requestAnimationFrame(() => {
        if (productCardHeightAnchorCycle !== anchor.cycle) return;
        correctPosition();
        const state = productCardHeightOverflowAnchorState;
        productCardHeightOverflowAnchorState = null;
        if (!state) return;
        restoreInlineOverflowAnchor(html, state.html);
        restoreInlineOverflowAnchor(document.body, state.body);
        requestAnimationFrame(() => {
          if (productCardHeightAnchorCycle !== anchor.cycle) return;
          correctPosition();
        });
      });
    });
  }

  function syncProductCardHeights() {
    productCardHeightFrame = 0;
    const scrollAnchor = productCardHeightAnchor;
    productCardHeightAnchor = null;
    $$(".catalog-group-grid").forEach(grid => {
      const cards = $$(".product-flip-ready:not(.hidden):not(.product-expanded)", grid);
      if (!cards.length) return;
      const previousMinHeight = grid.style.minHeight;
      const stableGridHeight = Math.ceil(grid.getBoundingClientRect().height);
      if (stableGridHeight > 0) grid.style.minHeight = `${stableGridHeight}px`;
      grid.classList.add("product-height-syncing");

      // Measure every visual row from a clean layout first, then apply the
      // tallest natural height only to the cards that actually share that row.
      // Matching a whole category made a single detailed product (Raviolis,
      // for example) stretch unrelated cards and left oversized empty panels.
      cards.forEach(card => {
        card.classList.remove("product-row-matched", "product-row-solo");
        const inner = $(".product-flip-inner", card);
        const front = $(".product-front", card);
        if (!inner) return;
        inner.style.height = "";
        if (front) front.style.height = "auto";
      });

      const rows = [];
      cards.forEach(card => {
        const top = card.getBoundingClientRect().top;
        const naturalHeight = Math.ceil($(".product-front", card)?.scrollHeight || 0);
        const row = rows.find(candidate => Math.abs(candidate.top - top) <= 2);
        const measurement = { card, naturalHeight };
        if (row) row.cards.push(measurement);
        else rows.push({ top, cards: [measurement] });
      });

      rows.forEach(row => {
        const matched = row.cards.length > 1;
        const rowHeight = Math.max(...row.cards.map(({ naturalHeight }) => naturalHeight));
        row.cards.forEach(({ card, naturalHeight }) => {
          card.classList.add(matched ? "product-row-matched" : "product-row-solo");
          const inner = $(".product-flip-inner", card);
          const height = matched ? rowHeight : naturalHeight;
          if (inner && height > 0) inner.style.height = `${height}px`;
        });
      });

      cards.forEach(card => {
        const front = $(".product-front", card);
        if (front) front.style.height = "";
      });
      // Commit every measured height before transitions are enabled again.
      // Otherwise a late catalog/image update animates the whole grid height
      // and moves whatever section the customer is currently reading.
      void grid.offsetHeight;
      grid.classList.remove("product-height-syncing");
      if (previousMinHeight) grid.style.minHeight = previousMinHeight;
      else grid.style.removeProperty("min-height");
      void grid.offsetHeight;
    });
    // Opening several ingredient panels used to collapse every catalog row
    // during the shared measurement pass. The rows were restored before paint,
    // but Safari/Chrome had already clamped the document scroll and could leave
    // the customer thousands of pixels below the card they touched. Keep that
    // exact summary at the same viewport coordinate after the final heights
    // have been committed.
    restoreProductCardHeightAnchor(scrollAnchor);
  }

  function scheduleProductCardHeightSync(anchorElement = null) {
    if (
      anchorElement?.isConnected
      && productCardHeightAnchor?.element !== anchorElement
    ) captureProductCardHeightAnchor(anchorElement);
    if (productCardHeightFrame) cancelAnimationFrame(productCardHeightFrame);
    productCardHeightFrame = requestAnimationFrame(syncProductCardHeights);
  }

  window.addEventListener("resize", scheduleProductCardHeightSync);
  document.fonts?.ready?.then(scheduleProductCardHeightSync);
  // Capture before the native <details> default action changes the card's
  // internal layout. The later toggle event is already too late to know where
  // the customer actually touched the summary.
  document.addEventListener("click", event => {
    const summary = event.target.closest?.(".product-front .product-safety summary");
    if (summary) captureProductCardHeightAnchor(summary);
  }, true);
  document.addEventListener("toggle", event => {
    if (!event.target.closest?.(".product-front")) return;
    scheduleProductCardHeightSync($("summary", event.target) || event.target);
  }, true);

  let modalScrollCycle = 0;
  let modalHoverGuardCleanup = null;

  function guardModalHoverUntilInput() {
    modalHoverGuardCleanup?.();
    const html = document.documentElement;
    const controller = new AbortController();
    const release = () => {
      html.classList.remove("modal-hover-guard");
      controller.abort();
      if (modalHoverGuardCleanup === release) modalHoverGuardCleanup = null;
    };
    html.classList.add("modal-hover-guard");
    ["pointermove", "pointerdown", "keydown"].forEach(type => {
      window.addEventListener(type, release, { capture: true, once: true, signal: controller.signal });
    });
    modalHoverGuardCleanup = release;
  }

  function lockModalPageScroll() {
    modalScrollCycle += 1;
    const body = document.body;
    const html = document.documentElement;
    const x = window.scrollX;
    const y = window.scrollY;
    const clientWidthBeforeLock = html.clientWidth;
    const bodyPaddingBeforeLock = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    const state = {
      x,
      y,
      html: {
        overflow: html.style.overflow,
        overscrollBehavior: html.style.overscrollBehavior,
        scrollBehavior: html.style.scrollBehavior
      },
      body: {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight
      }
    };
    // Keep the document at its real scroll offset while the modal is open.
    // Moving the whole body to `position: fixed` resets window.scrollY to 0
    // and forces fixed/translucent UI (notably the nav and catalog filters) to
    // be recomposited on both open and close, which flashes on mobile Safari.
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    const releasedScrollbarWidth = Math.max(0, html.clientWidth - clientWidthBeforeLock);
    if (releasedScrollbarWidth) body.style.paddingRight = `${bodyPaddingBeforeLock + releasedScrollbarWidth}px`;
    body.classList.add("product-modal-open");
    return state;
  }

  function unlockModalPageScroll(state) {
    document.body.classList.remove("product-modal-open");
    if (!state) return;
    const html = document.documentElement;
    const cycle = ++modalScrollCycle;
    Object.assign(document.body.style, state.body);
    Object.assign(html.style, state.html);
    const restorePosition = () => {
      if (modalScrollCycle !== cycle) return;
      if (
        Math.abs(window.scrollX - state.x) <= 1
        && Math.abs(window.scrollY - state.y) <= 1
      ) return;
      const scrollBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(state.x, state.y);
      html.style.scrollBehavior = scrollBehavior;
    };
    restorePosition();
    requestAnimationFrame(() => {
      restorePosition();
      requestAnimationFrame(() => {
        restorePosition();
      });
    });
  }

  function animateModalBackdropClose(backdrop, duration) {
    const parsedOpacity = Number.parseFloat(getComputedStyle(backdrop).opacity);
    const opacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 1;
    return backdrop.animate([
      { opacity, offset: 0 },
      { opacity, offset: 0.51 },
      { opacity: 0, offset: 1 }
    ], {
      duration,
      easing: "linear",
      fill: "forwards"
    });
  }

  function hideModalBackdropWithoutFlash(backdrop, animation) {
    // A finished Web Animation with fill:forwards is still the layer that owns
    // opacity. Cancelling it first briefly exposes `.visible { opacity: 1 }`
    // and some mobile compositors paint that single dark frame. Freeze the
    // rendered opacity, remove the backdrop from painting, and only then retire
    // the animation and its temporary inline value.
    const opacity = getComputedStyle(backdrop).opacity;
    guardModalHoverUntilInput();
    backdrop.style.opacity = opacity;
    backdrop.hidden = true;
    backdrop.classList.remove("visible");
    animation?.cancel();
    backdrop.style.removeProperty("opacity");
  }

  function elapsedAnimationTime(animation, maximum) {
    const elapsed = Number(animation?.currentTime);
    if (!Number.isFinite(elapsed)) return 0;
    return Math.min(maximum, Math.max(0, elapsed));
  }

  function setupProductCardFlips() {
    let activeCard = null;
    let activePlaceholder = null;
    let restoreTarget = null;
    let activeCloser = null;
    let activeGeometryRefresh = null;
    let activeScrollState = null;
    const backdrop = document.createElement("div");
    backdrop.className = "product-flip-backdrop";
    backdrop.hidden = true;
    document.body.append(backdrop);
    backdrop.addEventListener("click", () => activeCloser?.());
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") activeCloser?.();
    });
    const refreshActiveGeometry = () => activeGeometryRefresh?.();
    window.addEventListener("resize", refreshActiveGeometry);
    window.visualViewport?.addEventListener("resize", refreshActiveGeometry);

    const isInteractiveTarget = target => Boolean(target.closest("button, a, input, select, textarea, label, summary, details"));

    const lockPageScroll = () => {
      activeScrollState = lockModalPageScroll();
    };

    const unlockPageScroll = () => {
      const state = activeScrollState;
      activeScrollState = null;
      unlockModalPageScroll(state);
    };

    $$(".product").forEach(card => {
      if (card.classList.contains("product-flip-ready")) return;
      const media = $(".product-media", card);
      const body = $(".product-body", card);
      const title = $(".product-top h3", body)?.textContent?.trim() || card.dataset.name || "Producto Fontana";
      const isBottega = card.dataset.category === "bottega";
      if (!media || !body) return;

      const inner = document.createElement("div");
      inner.className = "product-flip-inner";
      const front = document.createElement("div");
      front.className = "product-face product-front";
      media.tabIndex = 0;
      media.setAttribute("role", "button");
      media.setAttribute("aria-expanded", "false");
      media.setAttribute("aria-label", `Ampliar ${title}`);
      front.append(media, body);

      const back = document.createElement("div");
      back.className = "product-face product-back";
      back.setAttribute("aria-hidden", "true");
      back.tabIndex = -1;
      inner.append(front, back);
      card.append(inner);
      card.classList.add("product-flip-ready");
      let frontSnapshot = null;
      let cardMotion = null;
      let backdropMotion = null;
      let faceMotions = [];
      let motionKeyframes = null;
      let sourceCardRect = null;
      let geometryFrame = 0;
      let motionEpoch = 0;
      let compactImageState = null;
      const motionDuration = 860;
      const targetTransform = "perspective(1800px) translate3d(0, 0, 0) scale(1, 1) rotateX(0deg) rotateY(0deg) rotateZ(0deg)";

      const cancelFaceMotions = () => {
        faceMotions.forEach(animation => animation.cancel());
        faceMotions = [];
      };

      const animateFaceSwap = opening => {
        cancelFaceMotions();
        const frontFrames = opening
          ? [
              { visibility: "visible", offset: 0 },
              { visibility: "visible", offset: 0.499 },
              { visibility: "hidden", offset: 0.501 },
              { visibility: "hidden", offset: 1 }
            ]
          : [
              { visibility: "hidden", offset: 0 },
              { visibility: "hidden", offset: 0.499 },
              { visibility: "visible", offset: 0.501 },
              { visibility: "visible", offset: 1 }
            ];
        const backFrames = opening
          ? [
              { visibility: "hidden", offset: 0 },
              { visibility: "hidden", offset: 0.499 },
              { visibility: "visible", offset: 0.501 },
              { visibility: "visible", offset: 1 }
            ]
          : [
              { visibility: "visible", offset: 0 },
              { visibility: "visible", offset: 0.499 },
              { visibility: "hidden", offset: 0.501 },
              { visibility: "hidden", offset: 1 }
            ];
        const timing = { duration: motionDuration, easing: "linear", fill: "forwards" };
        faceMotions = [front.animate(frontFrames, timing), back.animate(backFrames, timing)];
      };

      const resize = () => {
        if (!card.classList.contains("product-expanded")) scheduleProductCardHeightSync();
      };

      const settleCatalogBeforeUnlock = () => {
        if (productCardHeightFrame) cancelAnimationFrame(productCardHeightFrame);
        productCardHeightFrame = 0;
        syncProductCardHeights();
      };

      const resolveExpandedGeometry = rect => {
        const viewport = window.visualViewport;
        const viewportWidth = viewport?.width || window.innerWidth;
        const viewportHeight = viewport?.height || window.innerHeight;
        const viewportLeft = viewport?.offsetLeft || 0;
        const viewportTop = viewport?.offsetTop || 0;
        const mobile = window.matchMedia("(max-width: 640px)").matches;
        const desktop = window.matchMedia("(min-width: 960px)").matches;
        if (isBottega) {
          const stack = mobile && viewportHeight > viewportWidth;
          const compact = (stack && viewportHeight <= 700) || (!stack && (!desktop || viewportHeight < 532));
          let width;
          let height;
          let mediaSize;
          let detailsWidth;
          let detailsHeight;
          if (stack) {
            const horizontalMargin = viewportHeight <= 600 ? 10 : 20;
            const desiredDetailsHeight = viewportHeight <= 600 ? 234 : 328;
            const maximumHeight = viewportHeight - 20;
            width = Math.min(viewportWidth - (horizontalMargin * 2), 350);
            mediaSize = width - 2;
            detailsHeight = Math.min(desiredDetailsHeight, maximumHeight - mediaSize - 2);
            if (detailsHeight < (compact ? 234 : 260)) {
              const minimumDetailsHeight = Math.min(compact ? 234 : 260, maximumHeight - 182);
              mediaSize = Math.max(180, maximumHeight - minimumDetailsHeight - 2);
              width = mediaSize + 2;
              detailsHeight = maximumHeight - mediaSize - 2;
            }
            detailsWidth = mediaSize;
            height = mediaSize + detailsHeight + 2;
          } else {
            const horizontalMargin = viewportWidth >= 900 && viewportWidth < 960 ? 32 : 16;
            width = Math.min(900, viewportWidth - (horizontalMargin * 2));
            const innerWidth = width - 2;
            if (desktop) {
              mediaSize = Math.min(498, viewportHeight - 34);
            } else {
              const roundedTarget = Math.floor(((innerWidth * (viewportHeight >= viewportWidth ? .49 : .5)) + 5) / 10) * 10;
              const desiredSize = Math.max(250, Math.min(440, roundedTarget));
              const heightCap = (viewportHeight - 32) - (viewportHeight <= 340 ? 38 : 16);
              mediaSize = Math.floor(Math.min(desiredSize, heightCap) / 10) * 10;
            }
            mediaSize = Math.max(180, Math.min(mediaSize, innerWidth - 180));
            detailsWidth = innerWidth - mediaSize;
            detailsHeight = mediaSize;
            height = mediaSize + 2;
          }
          return {
            width:Math.round(width),
            height:Math.round(height),
            left:viewportLeft + ((viewportWidth - width) / 2),
            top:viewportTop + ((viewportHeight - height) / 2),
            mediaSize:Math.round(mediaSize),
            detailsWidth:Math.round(detailsWidth),
            detailsHeight:Math.round(detailsHeight),
            layout:stack ? "stack" : "side",
            compact
          };
        }
        const horizontalMargin = mobile ? 28 : desktop ? 48 : 80;
        const verticalMargin = mobile ? 52 : desktop ? 48 : 60;
        const availableWidth = viewportWidth - (horizontalMargin * 2);
        const availableHeight = viewportHeight - (verticalMargin * 2);
        const width = Math.round(desktop
          ? Math.min(availableWidth, 1040)
          : Math.min(
              availableWidth,
              Math.max(mobile ? 280 : 520, rect.width * (mobile ? 1.55 : 1.42))
            ));
        const height = Math.round(desktop
          ? Math.min(availableHeight, 640)
          : Math.min(
              availableHeight,
              Math.max(mobile ? 560 : 600, rect.height * (mobile ? 1.34 : 1.12))
            ));
        return {
          width,
          height,
          left:viewportLeft + ((viewportWidth - width) / 2),
          top:viewportTop + ((viewportHeight - height) / 2)
        };
      };

      const applyExpandedGeometry = geometry => {
        card.style.setProperty("--product-expanded-width", `${geometry.width}px`);
        card.style.setProperty("--product-expanded-height", `${geometry.height}px`);
        card.style.setProperty("--product-expanded-left", `${geometry.left}px`);
        card.style.setProperty("--product-expanded-top", `${geometry.top}px`);
        if (isBottega) {
          card.style.setProperty("--bm", `${geometry.mediaSize}px`);
          card.style.setProperty("--bdw", `${geometry.detailsWidth}px`);
          card.style.setProperty("--bdh", `${geometry.detailsHeight}px`);
          card.classList.toggle("bottega-stack", geometry.layout === "stack");
          card.classList.toggle("bottega-side", geometry.layout === "side");
          back.classList.toggle("bottega-compact", Boolean(geometry.compact));
        }
      };

      const settleExpandedAfterViewportChange = () => {
        geometryFrame = 0;
        if (
          activeCard !== card
          || !card.classList.contains("product-expanded")
          || card.classList.contains("product-expanded-closing")
          || !sourceCardRect
        ) return;
        const focusWasInside = card.contains(document.activeElement);
        motionEpoch += 1;
        cardMotion?.cancel();
        cardMotion = null;
        cancelFaceMotions();
        motionKeyframes = null;
        applyExpandedGeometry(resolveExpandedGeometry(sourceCardRect));
        card.style.transform = targetTransform;
        card.classList.add("product-expanded-open", "product-flipped");
        card.classList.remove("product-expanded-animating");
        front.setAttribute("aria-hidden", "true");
        back.setAttribute("aria-hidden", "false");
        media.setAttribute("aria-expanded", "true");
        backdrop.classList.add("visible");
        if (!focusWasInside) back.focus({ preventScroll:true });
      };

      const scheduleExpandedGeometryRefresh = () => {
        if (geometryFrame) cancelAnimationFrame(geometryFrame);
        geometryFrame = requestAnimationFrame(settleExpandedAfterViewportChange);
      };

      const open = trigger => {
        if (
          activeCard
          || card.classList.contains("product-expanded")
          || document.body.classList.contains("product-modal-open")
          || document.querySelector(".builder-flavor-flip-card")
        ) return;
        restoreTarget = trigger || media;
        const liveImage = $("img", media);
        compactImageState = liveImage ? {
          image:liveImage,
          src:liveImage.getAttribute("src"),
          srcset:liveImage.getAttribute("srcset"),
          sizes:liveImage.getAttribute("sizes")
        } : null;
        const fullSource = fullImageSource(liveImage);
        const fullUrl = absoluteImageUrl(fullSource);
        if (liveImage && fullSource && (liveImage.hasAttribute("srcset") || !fullUrl || liveImage.currentSrc !== fullUrl)) {
          preloadDecodedImage(fullSource).then(ready => {
            if (!ready || activeCard !== card || !liveImage.isConnected) return;
            useFullResolutionImage(liveImage);
          });
        }
        const rect = card.getBoundingClientRect();
        sourceCardRect = { width:rect.width, height:rect.height };
        const geometry = resolveExpandedGeometry(sourceCardRect);
        const targetWidth = geometry.width;
        const targetHeight = geometry.height;
        const targetX = geometry.left;
        const targetY = geometry.top;
        const startX = rect.left + (rect.width / 2) - (targetX + (targetWidth / 2));
        const startY = rect.top + (rect.height / 2) - (targetY + (targetHeight / 2));
        const startScaleX = rect.width / targetWidth;
        const startScaleY = rect.height / targetHeight;
        const liftScaleX = startScaleX + ((1 - startScaleX) * 0.28);
        const liftScaleY = startScaleY + ((1 - startScaleY) * 0.28);
        const edgeScaleX = startScaleX + ((1 - startScaleX) * 0.66);
        const edgeScaleY = startScaleY + ((1 - startScaleY) * 0.66);
        const snapshotScaleX = targetWidth / rect.width;
        const snapshotScaleY = targetHeight / rect.height;
        const edgeScale = Math.min(edgeScaleX, edgeScaleY);
        const startTransform = `perspective(1800px) translate3d(${startX}px, ${startY}px, 0) scale(${startScaleX}, ${startScaleY}) rotateX(0deg) rotateY(0deg) rotateZ(0deg)`;
        const liftTransform = `perspective(1800px) translate3d(${startX * 0.84}px, ${startY * 0.84}px, 26px) scale(${liftScaleX}, ${liftScaleY}) rotateX(1.2deg) rotateY(-12deg) rotateZ(-0.4deg)`;
        const frontEdgeTransform = isBottega
          ? `perspective(1800px) translate3d(0, 0, 0) scale(${edgeScale}) rotateX(0deg) rotateY(89.8deg) rotateZ(0deg)`
          : `perspective(1800px) translate3d(${startX * 0.34}px, ${startY * 0.34}px, 86px) scale(${edgeScaleX}, ${edgeScaleY}) rotateX(2.8deg) rotateY(89.8deg) rotateZ(-1.1deg)`;
        const backEdgeTransform = isBottega
          ? `perspective(1800px) translate3d(0, 0, 0) scale(${edgeScale}) rotateX(0deg) rotateY(-89.8deg) rotateZ(0deg)`
          : `perspective(1800px) translate3d(${startX * 0.34}px, ${startY * 0.34}px, 86px) scale(${edgeScaleX}, ${edgeScaleY}) rotateX(2.8deg) rotateY(-89.8deg) rotateZ(-1.1deg)`;
        const settleTransform = isBottega
          ? "perspective(1800px) translate3d(0, 0, 0) scale(.97) rotateX(0deg) rotateY(7deg) rotateZ(0deg)"
          : `perspective(1800px) translate3d(${startX * 0.04}px, ${startY * 0.04}px, 14px) scale(.97, .97) rotateX(.35deg) rotateY(7deg) rotateZ(.18deg)`;
        applyExpandedGeometry(geometry);
        card.style.setProperty("--product-start-transform", startTransform);
        card.style.setProperty("--product-target-transform", targetTransform);
        motionKeyframes = [
          { transform: startTransform, offset: 0 },
          { transform: liftTransform, offset: 0.16 },
          { transform: frontEdgeTransform, easing: "steps(1,end)", offset: 0.499 },
          { transform: backEdgeTransform, offset: 0.501 },
          { transform: settleTransform, offset: 0.84 },
          { transform: targetTransform, offset: 1 }
        ];
        // Freeze the viewport before replacing anything in the catalog. On iOS,
        // scroll anchoring can otherwise move the page before its position is saved.
        lockPageScroll();
        activePlaceholder = document.createElement("div");
        activePlaceholder.className = "product-flip-placeholder";
        activePlaceholder.style.height = `${Math.ceil(rect.height)}px`;
        card.before(activePlaceholder);
        activeCard = card;
        activeCloser = close;
        activeGeometryRefresh = isBottega ? scheduleExpandedGeometryRefresh : null;
        const epoch = ++motionEpoch;
        frontSnapshot = document.createElement("div");
        frontSnapshot.className = "product-front-snapshot";
        // Match the card's inner box, not its outer border box. This prevents
        // the universal 1px-per-side flash when the snapshot is swapped back.
        frontSnapshot.style.width = `${card.clientWidth}px`;
        frontSnapshot.style.height = `${card.clientHeight}px`;
        frontSnapshot.style.flex = "0 0 auto";
        frontSnapshot.style.transformOrigin = "top left";
        frontSnapshot.style.transform = `scale(${snapshotScaleX}, ${snapshotScaleY})`;
        frontSnapshot.setAttribute("aria-expanded", "true");
        frontSnapshot.setAttribute("aria-hidden", "true");
        frontSnapshot.inert = true;
        const snapshotMedia = media.cloneNode(true);
        const sourceImage = $("img", media);
        const snapshotImage = $("img", snapshotMedia);
        if (sourceImage && snapshotImage) {
          snapshotImage.style.transition = "none";
          snapshotImage.style.transform = getComputedStyle(sourceImage).transform;
        }
        const snapshotBody = body.cloneNode(true);
        snapshotBody.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
        snapshotBody.querySelectorAll("label[for]").forEach(label => label.removeAttribute("for"));
        snapshotBody.querySelectorAll(".product-variant,.product-size").forEach(control => {
          control.classList.remove("product-variant", "product-size");
        });
        frontSnapshot.append(snapshotMedia, snapshotBody);
        front.replaceChildren(frontSnapshot);
        media.classList.add("product-expanded-media");
        media.setAttribute("aria-label", `Cerrar vista ampliada de ${title}`);
        body.classList.add("product-expanded-body");
        back.append(media, body);
        backdrop.hidden = false;
        card.classList.add("product-expanded");
        front.setAttribute("aria-hidden", "true");
        back.setAttribute("aria-hidden", "false");
        media.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => {
          if (epoch !== motionEpoch || activeCard !== card || card.classList.contains("product-expanded-closing")) return;
          card.classList.add("product-expanded-animating");
          requestAnimationFrame(() => {
            if (epoch !== motionEpoch || activeCard !== card || card.classList.contains("product-expanded-closing")) return;
            backdrop.classList.add("visible");
            card.classList.add("product-expanded-open", "product-flipped");
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              card.style.transform = targetTransform;
              card.classList.remove("product-expanded-animating");
              back.focus({ preventScroll: true });
              return;
            }
            cardMotion = card.animate(motionKeyframes, {
              duration: motionDuration,
              easing: "cubic-bezier(.36,.08,.64,.92)",
              fill: "forwards"
            });
            animateFaceSwap(true);
            cardMotion.finished.then(() => {
              if (epoch !== motionEpoch || activeCard !== card || card.classList.contains("product-expanded-closing")) return;
              card.classList.remove("product-expanded-animating");
              back.focus({ preventScroll: true });
            }).catch(() => {});
          });
        });
      };

      const close = (immediate = false) => {
        if (activeCard !== card || card.classList.contains("product-expanded-closing")) return;
        motionEpoch += 1;
        card.classList.add("product-expanded-closing", "product-expanded-animating");
        const restore = () => {
          if (geometryFrame) cancelAnimationFrame(geometryFrame);
          geometryFrame = 0;
          cardMotion?.cancel();
          cardMotion = null;
          const closingBackdropMotion = backdropMotion;
          backdropMotion = null;
          cancelFaceMotions();
          motionKeyframes = null;
          if (activePlaceholder?.isConnected) activePlaceholder.replaceWith(card);
          activePlaceholder = null;
          activeCard = null;
          activeCloser = null;
          activeGeometryRefresh = null;
          sourceCardRect = null;
          card.classList.add("product-flip-restoring");
          card.classList.remove("product-expanded", "product-expanded-open", "product-flipped", "product-expanded-closing", "product-expanded-animating");
          card.style.removeProperty("--product-expanded-width");
          card.style.removeProperty("--product-expanded-height");
          card.style.removeProperty("--product-expanded-left");
          card.style.removeProperty("--product-expanded-top");
          card.style.removeProperty("--bm");
          card.style.removeProperty("--bdw");
          card.style.removeProperty("--bdh");
          card.style.removeProperty("--product-start-transform");
          card.style.removeProperty("--product-target-transform");
          card.style.removeProperty("transform");
          card.classList.remove("bottega-stack", "bottega-side");
          back.classList.remove("bottega-compact");
          hideModalBackdropWithoutFlash(backdrop, closingBackdropMotion);
          media.classList.remove("product-expanded-media");
          media.setAttribute("aria-label", `Ampliar ${title}`);
          body.classList.remove("product-expanded-body");
          front.replaceChildren(media, body);
          frontSnapshot = null;
          front.setAttribute("aria-hidden", "false");
          back.setAttribute("aria-hidden", "true");
          media.setAttribute("aria-expanded", "false");
          if (compactImageState?.image?.isConnected) {
            const compactImage = compactImageState.image;
            compactImage.setAttribute("src", compactImageState.src || fullImageSource(compactImage));
            if (compactImageState.srcset) compactImage.setAttribute("srcset", compactImageState.srcset);
            else compactImage.removeAttribute("srcset");
            if (compactImageState.sizes) compactImage.setAttribute("sizes", compactImageState.sizes);
            else compactImage.removeAttribute("sizes");
          }
          compactImageState = null;
          // Finish any pending row-height work while the viewport is still
          // frozen. Otherwise a lazy image or the previous close can reflow the
          // next card between unlock and the final scroll restoration.
          settleCatalogBeforeUnlock();
          restoreTarget?.focus?.({ preventScroll: true });
          restoreTarget = null;
          unlockPageScroll();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => card.classList.remove("product-flip-restoring"));
          });
        };
        if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) restore();
        else {
          const reverseDuration = elapsedAnimationTime(cardMotion, motionDuration);
          if (!cardMotion || reverseDuration <= 16) {
            restore();
            return;
          }
          backdropMotion?.cancel();
          backdropMotion = animateModalBackdropClose(backdrop, reverseDuration);
          cardMotion.reverse();
          faceMotions.forEach(animation => animation.reverse());
          Promise.all([
            cardMotion.finished,
            ...faceMotions.map(animation => animation.finished),
            backdropMotion.finished
          ]).then(restore).catch(restore);
        }
      };

      media.addEventListener("click", event => {
        event.stopPropagation();
        if (card.classList.contains("product-expanded")) close();
        else open(media);
      });
      media.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (card.classList.contains("product-expanded")) close();
        else open(media);
      });
      front.addEventListener("click", event => {
        if (isInteractiveTarget(event.target) || event.target.closest(".product-media")) return;
        open(front);
      });
      $(".product-selection-summary", card)?.addEventListener("click", event => {
        event.stopPropagation();
        open(event.currentTarget);
      });
      card.addEventListener("change", event => {
        if (!event.target.matches(".product-size,.product-variant")) return;
        const selection = $$(".product-size,.product-variant", body)
          .map(control => control.value)
          .filter(Boolean)
          .join(" · ");
        $$(".product-selection-summary strong", card).forEach(summary => {
          summary.textContent = selection;
        });
      });
      media.querySelector("img")?.addEventListener("load", resize, { once: true });
      requestAnimationFrame(resize);
    });
    scheduleProductCardHeightSync();
  }

  function setupInfiniteFlavorGalleries() {
    const tracks = $$(".fonkie-gallery-track, .builder-gallery-track");

    tracks.forEach(track => {
      track._fontanaGalleryLoop?.destroy?.();
      $$(".flavor-gallery-loop-card", track).forEach(clone => clone.remove());

      const cards = $$(".fonkie-gallery-card, .builder-gallery-card", track);
      if (cards.length < 2) {
        track.removeAttribute("data-gallery-loop");
        return;
      }
      track.dataset.galleryLoop = "true";
      const controller = new AbortController();
      const { signal } = controller;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const modulo = value => ((value % cards.length) + cards.length) % cards.length;
      // A compact-gallery gesture always reveals the adjacent flavor. Distance
      // controls the drag preview, never how many cards the gesture can skip.
      const clampGestureOffset = value => Math.max(-1, Math.min(1, value));
      const circularOffset = (index, value) => {
        let offset = modulo(index - value);
        if (offset > cards.length / 2) offset -= cards.length;
        return offset;
      };

      let position = 0;
      let intendedTarget = 0;
      let logicalIndex = 0;
      let motion = null;
      let motionFrame = 0;
      let pointer = null;
      let wheel = null;
      let wheelTimer = 0;
      let suppressClickUntil = 0;
      let pendingFocusIndex = null;

      const setState = state => { track.dataset.galleryState = state; };
      const resetWheelGesture = () => {
        window.clearTimeout(wheelTimer);
        wheelTimer = 0;
        wheel = null;
      };
      const trackWidth = () => track.getBoundingClientRect().width || track.clientWidth || 1;
      const render = () => {
        cards.forEach((card, index) => {
          const offset = circularOffset(index, position);
          card.style.transform = `translate3d(${offset * 100}%, 0, 0)`;
        });
      };
      const syncCurrentCard = (index, focus = false) => {
        logicalIndex = modulo(index);
        track.dataset.galleryIndex = String(logicalIndex);
        const focusedCard = document.activeElement?.closest?.(
          ".fonkie-gallery-card, .builder-gallery-card"
        );
        const moveExistingFocus = focusedCard
          && track.contains(focusedCard)
          && focusedCard !== cards[logicalIndex];
        cards.forEach((card, cardIndex) => {
          const current = cardIndex === logicalIndex;
          if (current) {
            card.setAttribute("aria-current", "true");
            card.removeAttribute("aria-hidden");
          } else {
            card.removeAttribute("aria-current");
            card.setAttribute("aria-hidden", "true");
          }
          card.style.pointerEvents = current ? "auto" : "none";
          if (card.getAttribute("role") === "button") card.tabIndex = current ? 0 : -1;
        });
        if (focus || moveExistingFocus) cards[logicalIndex].focus({ preventScroll: true });
      };
      const finishAt = target => {
        const normalized = modulo(Math.round(target));
        position = normalized;
        intendedTarget = normalized;
        motion = null;
        motionFrame = 0;
        render();
        setState("idle");
        const shouldFocus = pendingFocusIndex !== null && modulo(pendingFocusIndex) === normalized;
        pendingFocusIndex = null;
        syncCurrentCard(normalized, shouldFocus);
      };
      const cancelMotion = () => {
        const target = motion?.target ?? intendedTarget;
        if (motion) {
          const elapsed = Math.max(0, performance.now() - motion.startedAt);
          const progress = Math.min(1, elapsed / motion.duration);
          const eased = 1 - ((1 - progress) ** 4);
          position = motion.from + ((motion.target - motion.from) * eased);
          render();
        }
        cancelAnimationFrame(motionFrame);
        motionFrame = 0;
        motion = null;
        pendingFocusIndex = null;
        return target;
      };
      const animateTo = (target, focusIndex = null, { preserveWheelGesture = false } = {}) => {
        if (!preserveWheelGesture) resetWheelGesture();
        cancelAnimationFrame(motionFrame);
        motionFrame = 0;
        motion = null;
        intendedTarget = target;
        pendingFocusIndex = focusIndex;
        const distance = Math.abs(target - position);
        if (prefersReducedMotion.matches || distance < .001) {
          finishAt(target);
          return;
        }
        const duration = Math.min(460, 225 + (distance * 55));
        motion = {
          from: position,
          target,
          startedAt: performance.now(),
          duration
        };
        setState("settling");
        const step = now => {
          if (!motion) return;
          const progress = Math.min(1, Math.max(0, (now - motion.startedAt) / motion.duration));
          const eased = 1 - ((1 - progress) ** 4);
          position = motion.from + ((motion.target - motion.from) * eased);
          render();
          if (progress >= 1) {
            const completedTarget = motion.target;
            finishAt(completedTarget);
            return;
          }
          motionFrame = requestAnimationFrame(step);
        };
        motionFrame = requestAnimationFrame(step);
      };

      const beginPointer = event => {
        if (event.button !== 0 || event.isPrimary === false || pointer) return;
        const width = trackWidth();
        if (width <= 2) return;
        // A new, intentional contact must never inherit the ghost-click guard
        // from the gesture that came before it.
        suppressClickUntil = 0;
        resetWheelGesture();
        pointer = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startPosition: position,
          baseTarget: motion?.target ?? intendedTarget,
          width,
          axis: null,
          startedDuringMotion: Boolean(motion)
        };
      };
      const movePointer = event => {
        if (!pointer || event.pointerId !== pointer.id || pointer.axis === "vertical") return;
        const dx = event.clientX - pointer.startX;
        const dy = event.clientY - pointer.startY;
        if (!pointer.axis) {
          if (Math.hypot(dx, dy) < 8) return;
          // Page scrolling wins when a touch is even moderately diagonal.
          // Only a clearly horizontal gesture should move the flavor ring.
          if (Math.abs(dy) >= Math.abs(dx) * .8) {
            pointer.axis = "vertical";
            return;
          }
          pointer.axis = "horizontal";
          pointer.baseTarget = cancelMotion();
          pointer.startPosition = position;
          suppressClickUntil = performance.now() + 500;
          setState("dragging");
          try { track.setPointerCapture(event.pointerId); } catch (_error) {}
        }
        event.preventDefault();
        position = pointer.startPosition + clampGestureOffset(-(dx / pointer.width));
        render();
      };
      const finishPointer = (event, cancelled = false) => {
        if (!pointer || event.pointerId !== pointer.id) return;
        const activePointer = pointer;
        pointer = null;
        try {
          if (track.hasPointerCapture?.(activePointer.id)) track.releasePointerCapture(activePointer.id);
        } catch (_error) {}
        if (activePointer.axis !== "horizontal") {
          if (activePointer.startedDuringMotion && activePointer.axis !== "vertical") {
            suppressClickUntil = performance.now() + 500;
          }
          if (!motion) setState("idle");
          return;
        }
        suppressClickUntil = performance.now() + 500;
        if (cancelled) {
          animateTo(activePointer.baseTarget);
          return;
        }
        const dx = event.clientX - activePointer.startX;
        const distance = Math.abs(position - activePointer.startPosition);
        if (Math.abs(dx) < 18 || distance < .08) {
          animateTo(activePointer.baseTarget);
          return;
        }
        const direction = dx < 0 ? 1 : -1;
        animateTo(activePointer.baseTarget + direction);
      };

      track.addEventListener("pointerdown", beginPointer, { signal });
      track.addEventListener("pointermove", movePointer, { passive: false, signal });
      document.addEventListener("pointerup", event => finishPointer(event), { capture: true, signal });
      document.addEventListener("pointercancel", event => finishPointer(event, true), { capture: true, signal });
      track.addEventListener("lostpointercapture", event => {
        // Touch browsers implicitly capture the pointer on the image/card that
        // received pointerdown. Moving that capture to the track emits a
        // bubbling lostpointercapture from the child; it is not a cancelled
        // swipe. Only settle when the track itself loses its own capture.
        if (event.target !== track) return;
        finishPointer(event, true);
      }, { signal });

      track.addEventListener("wheel", event => {
        // Trackpad pinch-to-zoom is exposed as a ctrl+wheel gesture in browsers.
        if (event.ctrlKey) return;
        const width = trackWidth();
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? width : 1;
        const rawX = event.shiftKey && Math.abs(event.deltaX) < Math.abs(event.deltaY)
          ? event.deltaY
          : event.deltaX;
        const dx = rawX * unit;
        const dy = event.deltaY * unit;
        if (
          Math.abs(dx) < 1
          || (!event.shiftKey && Math.abs(dx) <= Math.abs(dy) * 1.2)
        ) return;
        event.preventDefault();
        const now = performance.now();
        const magnitude = Math.abs(dx);
        const direction = Math.sign(dx);
        const currentGesture = wheel;
        const rested = !currentGesture || now - currentGesture.lastEventAt > 90;
        const reversed = currentGesture && direction !== currentGesture.direction;
        const renewedImpulse = currentGesture?.committed
          && currentGesture.decayed
          && now - currentGesture.committedAt >= 60
          && now - currentGesture.lastEventAt >= 40
          && magnitude >= 12
          && magnitude >= currentGesture.lastMagnitude * 1.35
          && magnitude >= currentGesture.postPeakMin * 1.6;
        if (rested || reversed || renewedImpulse) {
          resetWheelGesture();
          const interruptedTarget = cancelMotion();
          wheel = {
            startPosition: position,
            baseTarget: interruptedTarget,
            totalX: 0,
            committed: false,
            direction,
            lastEventAt: now,
            lastMagnitude: magnitude,
            committedAt: 0,
            peakMagnitude: magnitude,
            postPeakMin: Number.POSITIVE_INFINITY,
            decayed: false
          };
          setState("dragging");
        }

        const activeWheel = wheel;
        activeWheel.lastEventAt = now;
        if (!activeWheel.committed) {
          activeWheel.totalX += dx;
          activeWheel.lastMagnitude = magnitude;
          activeWheel.peakMagnitude = Math.max(activeWheel.peakMagnitude, magnitude);
          position = activeWheel.startPosition
            + clampGestureOffset(activeWheel.totalX / width);
          render();
          if (Math.abs(activeWheel.totalX) >= width * .04) {
            activeWheel.committed = true;
            activeWheel.committedAt = now;
            activeWheel.postPeakMin = Number.POSITIVE_INFINITY;
            activeWheel.decayed = false;
            animateTo(
              activeWheel.baseTarget + Math.sign(activeWheel.totalX),
              null,
              { preserveWheelGesture: true }
            );
          }
        } else {
          if (magnitude > activeWheel.peakMagnitude) {
            activeWheel.peakMagnitude = magnitude;
            activeWheel.postPeakMin = Number.POSITIVE_INFINITY;
            activeWheel.decayed = false;
          } else {
            activeWheel.postPeakMin = Math.min(activeWheel.postPeakMin, magnitude);
            activeWheel.decayed ||= magnitude <= activeWheel.peakMagnitude * .55;
          }
          activeWheel.lastMagnitude = magnitude;
        }
        suppressClickUntil = performance.now() + 350;
        window.clearTimeout(wheelTimer);
        wheelTimer = window.setTimeout(() => {
          if (wheel !== activeWheel) return;
          resetWheelGesture();
          if (!activeWheel.committed) animateTo(activeWheel.baseTarget);
        }, 90);
      }, { passive: false, signal });

      track.addEventListener("click", event => {
        if (performance.now() >= suppressClickUntil && track.dataset.galleryState === "idle") return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true, signal });
      track.addEventListener("dragstart", event => event.preventDefault(), { signal });
      track.addEventListener("keydown", event => {
        const card = event.target.closest(".fonkie-gallery-card, .builder-gallery-card");
        if (!card || !track.contains(card)) return;
        const baseTarget = motion?.target ?? intendedTarget;
        const baseIndex = modulo(Math.round(baseTarget));
        let target = null;
        if (event.key === "ArrowLeft") target = baseTarget - 1;
        else if (event.key === "ArrowRight") target = baseTarget + 1;
        else if (event.key === "Home") target = baseTarget - baseIndex;
        else if (event.key === "End") target = baseTarget + (cards.length - 1 - baseIndex);
        if (target === null) return;
        event.preventDefault();
        cancelMotion();
        animateTo(target, modulo(Math.round(target)));
      }, { signal });
      const settleAbandonedInteraction = () => {
        if (!pointer && !wheel && !motion) return;
        let target = motion?.target ?? intendedTarget;
        if (pointer) {
          const moved = position - pointer.startPosition;
          target = pointer.axis === "horizontal" && Math.abs(moved) >= .08
            ? pointer.baseTarget + Math.sign(moved)
            : pointer.baseTarget;
        } else if (wheel) {
          target = wheel.committed ? target : wheel.baseTarget;
        }
        const pointerId = pointer?.id;
        pointer = null;
        resetWheelGesture();
        if (pointerId !== undefined) {
          try {
            if (track.hasPointerCapture?.(pointerId)) track.releasePointerCapture(pointerId);
          } catch (_error) {}
        }
        cancelAnimationFrame(motionFrame);
        suppressClickUntil = 0;
        finishAt(target);
      };
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) return;
        settleAbandonedInteraction();
      }, { signal });
      window.addEventListener("blur", settleAbandonedInteraction, { signal });
      const finishMotionForReducedPreference = () => {
        if (!prefersReducedMotion.matches || !motion) return;
        const target = motion.target;
        cancelAnimationFrame(motionFrame);
        finishAt(target);
      };
      prefersReducedMotion.addEventListener?.("change", finishMotionForReducedPreference);

      track.scrollLeft = 0;
      setState("idle");
      render();
      syncCurrentCard(0);
      track._fontanaGalleryLoop = {
        destroy() {
          controller.abort();
          window.clearTimeout(wheelTimer);
          cancelAnimationFrame(motionFrame);
          cards.forEach(card => {
            card.style.removeProperty("transform");
            card.style.removeProperty("pointer-events");
            card.removeAttribute("aria-current");
            card.removeAttribute("aria-hidden");
            if (card.getAttribute("role") === "button") card.tabIndex = 0;
          });
          prefersReducedMotion.removeEventListener?.("change", finishMotionForReducedPreference);
          track.removeAttribute("data-gallery-loop");
          track.removeAttribute("data-gallery-index");
          track.removeAttribute("data-gallery-state");
          delete track._fontanaGalleryLoop;
        }
      };
    });
  }

  function setupBuilderFlavorCardFlips() {
    const tracks = $$(".fonkie-gallery-track, .builder-gallery-track");
    if (!tracks.length) return;

    const backdrop = document.createElement("div");
    backdrop.className = "builder-flavor-flip-backdrop";
    backdrop.hidden = true;
    document.body.append(backdrop);
    let active = null;
    const motionDuration = 860;
    const flavorSwitchDuration = 360;

    const flavorName = card => card.dataset.flavor
      || $("span", card)?.textContent?.replace(/\s·\sPre-Order\s*$/i, "").trim()
      || "Sabor Fontana";

    const flavorMeta = (kind, name) => {
      const flavors = adminState?.builders?.[kind]?.flavors;
      return Array.isArray(flavors) ? flavors.find(flavor => flavor.name === name) : null;
    };

    const matchingFlavorControls = (source, kind, name) => {
      const builder = source.closest(kind === "fonkies" ? ".fonkie-builder" : ".fomb-builder");
      const selector = kind === "fonkies" ? ".fonkie-flavor" : ".fomb-flavor";
      const row = $$(selector, builder).find(item => item.dataset.flavor === name);
      if (!row) return null;
      return {
        row,
        decrease: $('.fonkie-stepper button[data-delta="-1"]', row),
        output: $(".fonkie-stepper output", row),
        increase: $('.fonkie-stepper button[data-delta="1"]', row)
      };
    };

    const flavorPreviewSource = card => {
      const image = $("img", card);
      if (!image) return "";
      if (image.complete && image.naturalWidth > 0 && image.currentSrc) return image.currentSrc;
      const fullSource = fullImageSource(image);
      const fullSourceKey = localImageKey(fullSource);
      const responsive = responsiveImageDetails(fullSource);
      const compactSources = responsive?.sources
        ?.filter(candidate => localImageKey(candidate.path) !== fullSourceKey)
        .sort((left, right) => Number(left.width) - Number(right.width)) || [];
      return compactSources.at(-1)?.path || image.currentSrc || image.getAttribute("src") || "";
    };

    const preloadFlavorPreview = async (card, timeout = 180) => {
      const source = flavorPreviewSource(card);
      return {
        source,
        ready:source ? await waitForDecodedImage(source, timeout) : false
      };
    };

    const warmAdjacentFlavorImages = state => {
      if (state.cards.length < 2) return;
      [-1, 1].forEach(direction => {
        const index = (state.currentIndex + direction + state.cards.length) % state.cards.length;
        preloadDecodedImage(flavorPreviewSource(state.cards[index]));
      });
    };

    const clearFlavorImageLoading = state => {
      state.backImage.classList.remove("catalog-image-pending");
      state.media.classList.remove("catalog-image-loading");
    };

    const promoteFlavorOriginal = (state, card, { reveal = false } = {}) => {
      const image = $("img", card);
      const source = fullImageSource(image);
      if (!source) return;
      preloadDecodedImage(source).then(ready => {
        if (!ready || active !== state || state.closing || state.currentSource !== card) return;
        useFullResolutionImage(state.backImage, image);
        if (reveal) clearFlavorImageLoading(state);
      });
    };

    const renderFlavorImage = (state, card, { source, ready }) => {
      const image = $("img", card);
      const fullSource = fullImageSource(image);
      if (!source || !useDecodedImageSource(state.backImage, source, fullSource)) {
        promoteFlavorOriginal(state, card, { reveal:true });
        return;
      }
      state.backImage.classList.toggle("catalog-image-pending", !ready);
      state.media.classList.toggle("catalog-image-loading", !ready);
      if (ready) {
        clearFlavorImageLoading(state);
        promoteFlavorOriginal(state, card);
        return;
      }
      preloadDecodedImage(source).then(previewReady => {
        if (active !== state || state.closing || state.currentSource !== card) return;
        if (previewReady) {
          clearFlavorImageLoading(state);
          promoteFlavorOriginal(state, card);
        } else {
          promoteFlavorOriginal(state, card, { reveal:true });
        }
      });
    };

    const syncFlavorCue = state => {
      if (!state.swipeCue) return;
      const hasMultipleFlavors = state.cards.length > 1;
      const visible = state.ready && !state.closing && hasMultipleFlavors;
      state.swipeCue.hidden = !visible;
      state.swipeCue.tabIndex = visible ? 0 : -1;
      state.swipeCue.classList.toggle("builder-flavor-swipe-cue--ready", visible);
      state.swipeCue.classList.toggle("builder-flavor-swipe-cue--used", state.swipeCueUsed);
      state.swipeCue.classList.toggle("builder-flavor-swipe-cue--busy", state.switching || state.quantityBusy);
      state.swipeCue.setAttribute("aria-busy", String(state.switching || state.quantityBusy));
      state.swipeCue.setAttribute("aria-disabled", String(state.quantityBusy || state.closing));
      state.swipeCueCounter.textContent = `${state.currentIndex + 1} / ${state.cards.length}`;
      state.swipeCue.setAttribute("aria-valuemax", String(Math.max(1, state.cards.length)));
      state.swipeCue.setAttribute("aria-valuenow", String(state.currentIndex + 1));
      state.swipeCue.setAttribute("aria-valuetext", `${state.currentName}, sabor ${state.currentIndex + 1} de ${state.cards.length}`);
    };

    const syncExpandedFlavorQuantity = state => {
      const controls = matchingFlavorControls(state.source, state.kind, state.currentName);
      const quantity = Math.max(0, Number(controls?.output?.value || controls?.output?.textContent || 0));
      state.quantityControls = controls;
      state.quantityOutput.value = String(quantity);
      state.quantityOutput.textContent = String(quantity);
      state.quantityGroup.setAttribute("aria-label", `Cantidad de ${state.currentName} para tu caja`);
      state.quantityDecrease.setAttribute("aria-label", `Restar ${state.currentName}`);
      state.quantityIncrease.setAttribute("aria-label", `Sumar ${state.currentName}`);
      state.quantityOutput.setAttribute(
        "aria-label",
        `${quantity} ${state.currentName} ${quantity === 1 ? "seleccionado" : "seleccionados"} para tu caja`
      );
      state.quantityDecrease.disabled = !controls?.decrease || quantity <= 0;
      state.quantityIncrease.disabled = state.flavorUnavailable
        || !controls?.increase
        || controls.increase.disabled;
      state.quantityGroup.classList.toggle("builder-flavor-quantity--busy", state.quantityBusy);
      state.quantityActions.setAttribute("aria-busy", String(state.quantityBusy));
      state.done.disabled = state.quantityBusy;
    };

    const renderFlavor = (state, card, { preserveImage = false, imageSource = "", imageReady = false } = {}) => {
      const nextName = flavorName(card);
      const nextMeta = flavorMeta(state.kind, nextName);
      const builderElement = card.closest(".fonkie-builder, .fomb-builder");
      const builderMeta = adminState?.builders?.[state.kind] || {};
      const nextStock = builderFlavorStockDetails(
        nextMeta || {},
        builderAvailabilityContext(builderElement, builderMeta)
      );
      const nextImage = $("img", card);
      state.currentSource = card;
      state.currentIndex = state.cards.indexOf(card);
      state.currentName = nextName;
      if (!preserveImage) renderFlavorImage(state, card, { source:imageSource || flavorPreviewSource(card), ready:imageReady });
      state.backImage.alt = nextImage?.alt || `${state.kind === "fonkies" ? "Fonkie" : "Fomb"} ${nextName}`;
      state.heading.textContent = nextName;
      state.ingredients.textContent = nextMeta?.ingredients?.trim() || "Ingredientes pendientes de confirmar con Fontana.";
      state.availability.textContent = nextStock.label;
      state.availability.dataset.stockState = nextStock.state;
      const showsSoldOut = builderFlavorShowsSoldOut(nextStock);
      state.overlay.dataset.soldOut = String(showsSoldOut);
      state.overlay.classList.toggle("builder-flavor-expanded-sold-out", showsSoldOut);
      const consultHref = soldOutConsultHref(`${nextName} de ${state.kind === "fonkies" ? "Fonkies" : "Fomb"}`);
      state.consult.hidden = nextStock.state !== "unavailable" || nextStock.temporarilyUnavailable || !consultHref;
      if (consultHref) state.consult.href = consultHref;
      state.flavorUnavailable = nextStock.state === "unavailable";
      state.overlay.dataset.flavor = nextName;
      state.overlay.setAttribute("aria-label", `${state.kind === "fonkies" ? "Fonkie" : "Fomb"} ${nextName}. ${nextStock.label}`);
      state.media.setAttribute("aria-label", `Cerrar detalles de ${nextName}`);
      state.liveStatus.textContent = `${nextName}, ${nextStock.label}, sabor ${state.currentIndex + 1} de ${state.cards.length}`;
      syncExpandedFlavorQuantity(state);
      syncFlavorCue(state);
      warmAdjacentFlavorImages(state);
    };

    const cancelAnimations = state => {
      state.motion?.cancel();
      state.flavorMotion?.cancel();
      state.faceMotions.forEach(animation => animation.cancel());
      state.faceMotions = [];
    };

    const resetFlavorWheelGesture = state => {
      window.clearTimeout(state.flavorWheelTimer);
      state.flavorWheelTimer = 0;
      state.flavorWheelGesture = null;
    };

    const cleanup = state => {
      const closingBackdropMotion = state.backdropMotion;
      state.backdropMotion = null;
      state.layoutController?.abort();
      cancelAnimationFrame(state.layoutFrame || 0);
      resetFlavorWheelGesture(state);
      cancelAnimations(state);
      state.quantityBuilder?.removeEventListener("fontana:flavor-change", state.quantityChangeHandler);
      state.source.style.removeProperty("visibility");
      state.source.setAttribute("aria-expanded", "false");
      state.overlay.remove();
      hideModalBackdropWithoutFlash(backdrop, closingBackdropMotion);
      active = null;
      state.source.focus({ preventScroll: true });
      unlockModalPageScroll(state.scrollState);
    };

    const close = (immediate = false) => {
      const state = active;
      if (!state || state.closing) return;
      if (state.quantityBusy) {
        resetFlavorWheelGesture(state);
        state.pendingWheelOffset = 0;
        state.pendingClose = immediate ? "immediate" : "animated";
        return;
      }
      if (state.switching) {
        resetFlavorWheelGesture(state);
        state.pendingDirections = [];
        state.pendingWheelOffset = 0;
        state.pendingClose = immediate ? "immediate" : "animated";
        return;
      }
      state.closing = true;
      syncFlavorCue(state);
      state.overlay.classList.add("builder-flavor-flip-closing");
      if (
        immediate
        || !state.motion
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        cleanup(state);
        return;
      }
      const reverseDuration = elapsedAnimationTime(state.motion, motionDuration);
      if (reverseDuration <= 16) {
        cleanup(state);
        return;
      }
      state.backdropMotion?.cancel();
      state.backdropMotion = animateModalBackdropClose(backdrop, reverseDuration);
      state.motion.reverse();
      state.faceMotions.forEach(animation => animation.reverse());
      Promise.all([
        state.motion.finished,
        ...state.faceMotions.map(animation => animation.finished),
        state.backdropMotion.finished
      ]).then(() => cleanup(state)).catch(() => cleanup(state));
    };

    const switchFlavor = async (direction, { wheel = false } = {}) => {
      const state = active;
      if (!state || state.closing || !state.ready || state.quantityBusy || state.cards.length < 2) return;
      if (state.switching) {
        if (wheel) {
          // Keep the requested destination, not a long animation queue. Rapid
          // trackpad impulses therefore reach the right flavor without leaving
          // several ghost flips running after the fingers have stopped.
          state.pendingWheelOffset += direction;
        } else {
          state.pendingDirections.push(direction);
        }
        return;
      }
      if (!state.swipeCueUsed) state.swipeCueUsed = true;
      const switchEpoch = ++state.flavorSwitchEpoch;
      state.switching = true;
      state.overlay.classList.add("builder-flavor-switching");
      syncFlavorCue(state);
      const nextIndex = (state.currentIndex + direction + state.cards.length) % state.cards.length;
      const nextCard = state.cards[nextIndex];
      try {
        const preview = await preloadFlavorPreview(nextCard);
        if (active !== state || state.closing || switchEpoch !== state.flavorSwitchEpoch) return;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const exitAngle = direction > 0 ? -89.8 : 89.8;
        const entryAngle = -exitAngle;
        const exitFadeAngle = direction > 0 ? -81 : 81;
        const entryFadeAngle = -exitFadeAngle;
        if (reduceMotion) {
          renderFlavor(state, nextCard, { imageSource:preview.source, imageReady:preview.ready });
        } else {
          state.flavorMotion = state.back.animate([
            { transform: "perspective(1500px) rotateY(0deg) scale(1)", opacity: 1, offset: 0 },
            { transform: `perspective(1500px) rotateY(${exitFadeAngle}deg) scale(.987)`, opacity: 1, offset: .82 },
            { transform: `perspective(1500px) rotateY(${exitAngle}deg) scale(.985)`, opacity: 0, offset: 1 }
          ], {
            duration: flavorSwitchDuration * .46,
            easing: "cubic-bezier(.55,.05,.85,.45)",
            fill: "both"
          });
          await state.flavorMotion.finished;
          if (active !== state || state.closing || switchEpoch !== state.flavorSwitchEpoch) return;
          renderFlavor(state, nextCard, { imageSource:preview.source, imageReady:preview.ready });
          state.back.style.transform = `perspective(1500px) rotateY(${entryAngle}deg) scale(.985)`;
          state.back.style.opacity = "0";
          state.flavorMotion.cancel();
          state.flavorMotion = state.back.animate([
            { transform: `perspective(1500px) rotateY(${entryAngle}deg) scale(.985)`, opacity: 0, offset: 0 },
            { transform: `perspective(1500px) rotateY(${entryFadeAngle}deg) scale(.987)`, opacity: 1, offset: .18 },
            { transform: "perspective(1500px) rotateY(0deg) scale(1)", opacity: 1, offset: 1 }
          ], {
            duration: flavorSwitchDuration * .54,
            easing: "cubic-bezier(.15,.75,.25,1)",
            fill: "both"
          });
          await state.flavorMotion.finished;
          if (active !== state || state.closing || switchEpoch !== state.flavorSwitchEpoch) return;
          state.back.style.transform = "perspective(1500px) rotateY(0deg) scale(1)";
          state.back.style.opacity = "1";
          state.flavorMotion.cancel();
          state.flavorMotion = null;
          state.back.style.removeProperty("transform");
          state.back.style.removeProperty("opacity");
        }
      } catch (_error) {
        if (active !== state || switchEpoch !== state.flavorSwitchEpoch) return;
      } finally {
        if (active !== state || switchEpoch !== state.flavorSwitchEpoch) return;
        state.flavorMotion?.cancel();
        state.flavorMotion = null;
        state.back.style.removeProperty("transform");
        state.back.style.removeProperty("opacity");
        state.overlay.classList.remove("builder-flavor-switching");
        state.switching = false;
        if (state.pendingClose) {
          const immediate = state.pendingClose === "immediate";
          state.pendingClose = null;
          close(immediate);
          return;
        }
        syncFlavorCue(state);
        const pendingDirection = state.pendingDirections.shift();
        if (pendingDirection) {
          switchFlavor(pendingDirection);
          return;
        }
        const pendingWheelOffset = state.pendingWheelOffset % state.cards.length;
        state.pendingWheelOffset = 0;
        if (pendingWheelOffset) switchFlavor(pendingWheelOffset, { wheel: true });
      }
    };

    const expandedFlavorStockDetails = (kind, card) => {
      const builderElement = card.closest(".fonkie-builder, .fomb-builder");
      const builderMeta = adminState?.builders?.[kind] || {};
      const meta = flavorMeta(kind, flavorName(card)) || {};
      return builderFlavorStockDetails(meta, builderAvailabilityContext(builderElement, builderMeta));
    };

    const measureExpandedFlavorDetails = (kind, cards, width, layout) => {
      const probe = document.createElement("div");
      probe.className = `builder-flavor-flip-card builder-flavor-measure builder-flavor-layout-${layout}`;
      Object.assign(probe.style, {
        position: "fixed",
        left: "-10000px",
        top: "0",
        width: `${Math.max(1, width)}px`,
        height: "auto",
        visibility: "hidden",
        pointerEvents: "none",
        transform: "none"
      });
      const details = document.createElement("div");
      details.className = "builder-flavor-expanded-details";
      Object.assign(details.style, {
        width: "100%",
        height: "auto",
        minHeight: "0",
        overflow: "visible"
      });
      const eyebrow = document.createElement("span");
      eyebrow.textContent = kind === "fonkies" ? "Fonkie · Galleta" : "Fomb · Bombón";
      const heading = document.createElement("h3");
      const availability = document.createElement("span");
      availability.className = "builder-flavor-expanded-availability";
      const consult = document.createElement("a");
      consult.className = "builder-flavor-expanded-consult";
      consult.target = "_blank";
      consult.rel = "noopener";
      consult.textContent = "Preguntar cuándo estará disponible";
      const ingredients = document.createElement("p");
      const actions = document.createElement("div");
      actions.className = "builder-flavor-expanded-actions";
      actions.innerHTML = `
        <span class="builder-flavor-quantity-copy"><b>Cantidad</b><small>de este sabor</small></span>
        <span class="builder-flavor-quantity" aria-hidden="true"><i class="builder-flavor-quantity-button">−</i><output class="builder-flavor-quantity-output">0</output><i class="builder-flavor-quantity-button">+</i></span>
        <span class="builder-flavor-done">Listo</span>
      `;
      details.append(eyebrow, heading, availability, consult, ingredients, actions);
      probe.append(details);
      document.body.append(probe);

      let requiredHeight = 0;
      cards.forEach(card => {
        const name = flavorName(card);
        const meta = flavorMeta(kind, name);
        const stock = expandedFlavorStockDetails(kind, card);
        heading.textContent = name;
        ingredients.textContent = meta?.ingredients?.trim()
          || "Ingredientes pendientes de confirmar con Fontana.";
        availability.textContent = stock.label;
        availability.dataset.stockState = stock.state;
        const consultHref = soldOutConsultHref(`${name} de ${kind === "fonkies" ? "Fonkies" : "Fomb"}`);
        consult.hidden = stock.state !== "unavailable" || stock.temporarilyUnavailable || !consultHref;
        if (consultHref) consult.href = consultHref;
        requiredHeight = Math.max(requiredHeight, details.scrollHeight);
      });
      probe.remove();
      return Math.ceil(requiredHeight) + 2;
    };

    const resolveExpandedFlavorGeometry = (source, kind, cards) => {
      const sourceRect = source.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const mobile = viewportWidth <= 640;
      const measurementCache = new Map();
      const measureDetails = (width, layout) => {
        const roundedWidth = Math.floor(width * 2) / 2;
        const key = `${layout}:${roundedWidth}`;
        if (!measurementCache.has(key)) {
          measurementCache.set(
            key,
            measureExpandedFlavorDetails(kind, cards, roundedWidth, layout)
          );
        }
        return measurementCache.get(key);
      };
      const horizontalMargin = mobile ? 10 : 48;
      const verticalMargin = mobile ? 20 : 48;
      const availableWidth = Math.max(180, viewportWidth - (horizontalMargin * 2));
      const availableHeight = Math.max(180, viewportHeight - (verticalMargin * 2));
      const desiredMedia = Math.min(
        availableWidth,
        mobile
          ? Math.max(sourceRect.width * 1.04, 280)
          : Math.min(620, Math.max(sourceRect.width * 1.28, 420))
      );

      let stackMedia = Math.min(desiredMedia, availableWidth, availableHeight - 120);
      let stackDetails = 0;
      for (let pass = 0; pass < 6; pass += 1) {
        stackDetails = measureDetails(stackMedia, "stack");
        const nextMedia = Math.max(120, Math.min(
          desiredMedia,
          availableWidth,
          availableHeight - stackDetails
        ));
        if (Math.abs(nextMedia - stackMedia) < 1) break;
        stackMedia = nextMedia;
      }
      stackDetails = measureDetails(stackMedia, "stack");
      const stackFits = stackMedia + stackDetails <= availableHeight + 1;
      const stackKeepsUsefulImage = stackMedia >= Math.min(280, desiredMedia * .72);
      const preferSide = viewportWidth > viewportHeight
        && (viewportHeight < 700 || !stackKeepsUsefulImage);

      let geometry = null;
      if (stackFits && !preferSide) {
        geometry = {
          layout: "stack",
          mediaSize: stackMedia,
          detailsWidth: stackMedia,
          detailsHeight: stackDetails,
          width: stackMedia,
          height: stackMedia + stackDetails
        };
      } else {
        const largestMedia = Math.min(desiredMedia, availableHeight);
        const smallestMedia = Math.min(largestMedia, mobile ? 160 : 190);
        const baseDetailsWidth = mobile ? 240 : 280;
        for (let mediaSize = largestMedia; mediaSize >= smallestMedia && !geometry; mediaSize -= 8) {
          const maximumDetailsWidth = availableWidth - mediaSize;
          if (maximumDetailsWidth < 240) continue;
          const firstDetailsWidth = Math.min(baseDetailsWidth, maximumDetailsWidth);
          const detailsWidths = [];
          for (
            let detailsWidth = firstDetailsWidth;
            detailsWidth <= maximumDetailsWidth + 1;
            detailsWidth += 12
          ) detailsWidths.push(detailsWidth);
          if (Math.abs((detailsWidths[detailsWidths.length - 1] || 0) - maximumDetailsWidth) >= 1) {
            detailsWidths.push(maximumDetailsWidth);
          }
          for (const detailsWidth of detailsWidths) {
            const measuredHeight = measureDetails(detailsWidth, "side");
            const dialogHeight = Math.max(mediaSize, measuredHeight);
            if (dialogHeight > availableHeight + 1) continue;
            geometry = {
              layout: "side",
              mediaSize,
              detailsWidth,
              detailsHeight: dialogHeight,
              width: mediaSize + detailsWidth,
              height: dialogHeight
            };
            break;
          }
        }
      }

      if (!geometry) {
        const initialDetailsWidth = Math.max(210, Math.min(availableWidth * .55, availableWidth - 120));
        const mediaSize = Math.max(120, Math.min(availableHeight, availableWidth - initialDetailsWidth));
        const detailsWidth = availableWidth - mediaSize;
        const measuredHeight = measureDetails(detailsWidth, "side");
        const dialogHeight = Math.min(availableHeight, Math.max(mediaSize, measuredHeight));
        geometry = {
          layout: "side",
          mediaSize,
          detailsWidth,
          detailsHeight: dialogHeight,
          width: availableWidth,
          height: dialogHeight
        };
      }

      geometry.left = viewportLeft + ((viewportWidth - geometry.width) / 2);
      geometry.top = viewportTop + ((viewportHeight - geometry.height) / 2);
      return geometry;
    };

    const applyExpandedFlavorGeometry = (state, geometry) => {
      const layoutChanged = state.geometry && state.geometry.layout !== geometry.layout;
      state.geometry = geometry;
      state.overlay.classList.toggle("builder-flavor-layout-stack", geometry.layout === "stack");
      state.overlay.classList.toggle("builder-flavor-layout-side", geometry.layout === "side");
      state.overlay.classList.add("builder-flavor-fixed-details");
      Object.assign(state.overlay.style, {
        left: `${geometry.left}px`,
        top: `${geometry.top}px`,
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        transformOrigin: `${geometry.mediaSize / 2}px ${geometry.mediaSize / 2}px`
      });
      state.overlay.style.setProperty("--builder-media-size", `${geometry.mediaSize}px`);
      state.overlay.style.setProperty("--builder-details-width", `${geometry.detailsWidth}px`);
      state.overlay.style.setProperty("--builder-details-height", `${geometry.detailsHeight}px`);
      state.overlay.style.setProperty("--builder-dialog-height", `${geometry.height}px`);
      if (layoutChanged) state.details.scrollTo({ left: 0, top: 0, behavior: "instant" });
    };

    const sameExpandedFlavorGeometry = (first, second) => {
      if (!first || !second || first.layout !== second.layout) return false;
      return ["mediaSize", "detailsWidth", "detailsHeight", "width", "height", "left", "top"]
        .every(key => Math.abs(first[key] - second[key]) < 1);
    };

    const settleExpandedFlavorAfterLayoutChange = state => {
      const focusWasInside = state.overlay.contains(document.activeElement);
      state.flavorSwitchEpoch += 1;
      cancelAnimations(state);
      state.motion = null;
      state.faceMotions = [];
      state.flavorMotion = null;
      state.pendingDirections = [];
      state.pendingWheelOffset = 0;
      state.switching = false;
      state.overlay.classList.remove("builder-flavor-switching");
      state.overlay.style.transform = "perspective(1800px) translate3d(0, 0, 0) scale(1, 1) rotateX(0deg) rotateY(0deg) rotateZ(0deg)";
      state.overlay.style.opacity = "1";
      state.front.style.visibility = "hidden";
      state.back.style.visibility = "visible";
      state.back.style.removeProperty("transform");
      state.back.style.removeProperty("opacity");
      state.back.setAttribute("aria-hidden", "false");
      state.ready = true;
      state.details.scrollTo({ left: 0, top: 0, behavior: "instant" });
      syncFlavorCue(state);
      if (!focusWasInside) state.back.focus({ preventScroll: true });
      if (state.pendingClose && !state.quantityBusy) {
        const immediate = state.pendingClose === "immediate";
        state.pendingClose = null;
        close(immediate);
      }
    };

    const scheduleExpandedFlavorGeometryRefresh = state => {
      cancelAnimationFrame(state.layoutFrame || 0);
      state.layoutFrame = requestAnimationFrame(() => {
        state.layoutFrame = 0;
        if (active !== state || state.closing) return;
        const geometry = resolveExpandedFlavorGeometry(state.source, state.kind, state.cards);
        if (sameExpandedFlavorGeometry(state.geometry, geometry)) return;
        applyExpandedFlavorGeometry(state, geometry);
        settleExpandedFlavorAfterLayoutChange(state);
      });
    };

    const open = source => {
      if (
        active
        || document.body.classList.contains("product-modal-open")
        || document.querySelector(".product-expanded")
      ) return;
      const rect = source.getBoundingClientRect();
      const kind = source.matches(".fonkie-gallery-card") ? "fonkies" : "fomb";
      const name = flavorName(source);
      const meta = flavorMeta(kind, name);
      const image = $("img", source);
      if (!image) return;
      const track = source.closest(".fonkie-gallery-track, .builder-gallery-track");
      const flavorCards = track ? $$(".fonkie-gallery-card, .builder-gallery-card", track) : [source];
      const geometry = resolveExpandedFlavorGeometry(source, kind, flavorCards);
      const targetWidth = geometry.width;
      const targetHeight = geometry.height;
      const targetX = geometry.left;
      const targetY = geometry.top;
      const startX = rect.left + (rect.width / 2) - (targetX + (geometry.mediaSize / 2));
      const startY = rect.top + (rect.height / 2) - (targetY + (geometry.mediaSize / 2));
      const startScale = rect.width / geometry.mediaSize;
      const liftScale = startScale + ((1 - startScale) * 0.28);
      const edgeScale = startScale + ((1 - startScale) * 0.66);
      const startTransform = `perspective(1800px) translate3d(${startX}px, ${startY}px, 0) scale(${startScale}) rotateX(0deg) rotateY(0deg) rotateZ(0deg)`;
      const liftTransform = `perspective(1800px) translate3d(${startX * 0.84}px, ${startY * 0.84}px, 26px) scale(${liftScale}) rotateX(1.2deg) rotateY(-12deg) rotateZ(-0.4deg)`;
      const frontFadeTransform = `perspective(1800px) translate3d(${startX * 0.38}px, ${startY * 0.38}px, 82px) scale(${edgeScale}) rotateX(2.7deg) rotateY(81deg) rotateZ(-1deg)`;
      const frontEdgeTransform = `perspective(1800px) translate3d(${startX * 0.34}px, ${startY * 0.34}px, 86px) scale(${edgeScale}) rotateX(2.8deg) rotateY(89.8deg) rotateZ(-1.1deg)`;
      const backEdgeTransform = `perspective(1800px) translate3d(${startX * 0.34}px, ${startY * 0.34}px, 86px) scale(${edgeScale}) rotateX(2.8deg) rotateY(-89.8deg) rotateZ(-1.1deg)`;
      const backFadeTransform = `perspective(1800px) translate3d(${startX * 0.3}px, ${startY * 0.3}px, 78px) scale(${edgeScale}) rotateX(2.5deg) rotateY(-81deg) rotateZ(-.9deg)`;
      const settleTransform = `perspective(1800px) translate3d(${startX * 0.04}px, ${startY * 0.04}px, 14px) scale(.97, .97) rotateX(.35deg) rotateY(7deg) rotateZ(.18deg)`;
      const targetTransform = "perspective(1800px) translate3d(0, 0, 0) scale(1, 1) rotateX(0deg) rotateY(0deg) rotateZ(0deg)";
      const keyframes = [
        { transform: startTransform, opacity: 1, offset: 0 },
        { transform: liftTransform, opacity: 1, offset: 0.16 },
        { transform: frontFadeTransform, opacity: 1, offset: 0.455 },
        { transform: frontEdgeTransform, opacity: 0, offset: 0.495 },
        { transform: backEdgeTransform, opacity: 0, offset: 0.505 },
        { transform: backFadeTransform, opacity: 1, offset: 0.545 },
        { transform: settleTransform, opacity: 1, offset: 0.84 },
        { transform: targetTransform, opacity: 1, offset: 1 }
      ];

      const overlay = document.createElement("section");
      overlay.className = `builder-flavor-flip-card builder-flavor-fixed-details builder-flavor-layout-${geometry.layout}`;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", `${kind === "fonkies" ? "Fonkie" : "Fomb"} ${name}`);
      Object.assign(overlay.style, {
        left: `${targetX}px`,
        top: `${targetY}px`,
        width: `${targetWidth}px`,
        height: `${targetHeight}px`,
        transformOrigin: `${geometry.mediaSize / 2}px ${geometry.mediaSize / 2}px`,
        transform: startTransform
      });
      overlay.style.setProperty("--builder-media-size", `${geometry.mediaSize}px`);
      overlay.style.setProperty("--builder-details-width", `${geometry.detailsWidth}px`);
      overlay.style.setProperty("--builder-details-height", `${geometry.detailsHeight}px`);
      overlay.style.setProperty("--builder-dialog-height", `${geometry.height}px`);
      const inner = document.createElement("div");
      inner.className = "builder-flavor-flip-inner";
      const front = document.createElement("div");
      front.className = "builder-flavor-flip-face builder-flavor-flip-front";
      const frontCard = source.cloneNode(true);
      frontCard.removeAttribute("tabindex");
      frontCard.removeAttribute("role");
      frontCard.removeAttribute("aria-expanded");
      frontCard.removeAttribute("aria-current");
      frontCard.removeAttribute("aria-hidden");
      frontCard.style.removeProperty("transform");
      frontCard.style.removeProperty("pointer-events");
      frontCard.style.width = "100%";
      frontCard.style.height = "100%";
      frontCard.style.flex = "0 0 auto";
      front.append(frontCard);

      const back = document.createElement("div");
      back.className = "builder-flavor-flip-face builder-flavor-flip-back";
      back.setAttribute("aria-hidden", "true");
      back.tabIndex = -1;
      const media = document.createElement("button");
      media.type = "button";
      media.className = "builder-flavor-expanded-media";
      media.setAttribute("aria-label", `Cerrar detalles de ${name}`);
      const backImage = image.cloneNode(true);
      media.append(backImage);
      const swipeCue = document.createElement("div");
      swipeCue.className = "builder-flavor-swipe-cue";
      swipeCue.hidden = true;
      swipeCue.tabIndex = -1;
      swipeCue.setAttribute("role", "slider");
      swipeCue.setAttribute("aria-label", "Cambiar sabor");
      swipeCue.setAttribute("aria-orientation", "horizontal");
      swipeCue.setAttribute("aria-valuemin", "1");
      swipeCue.setAttribute("aria-valuemax", "1");
      swipeCue.setAttribute("aria-valuenow", "1");
      const swipeCueDock = document.createElement("span");
      swipeCueDock.className = "builder-flavor-swipe-dock";
      swipeCueDock.setAttribute("aria-hidden", "true");
      const swipeCueIntro = document.createElement("span");
      swipeCueIntro.className = "builder-flavor-swipe-intro";
      const swipeCueWord = document.createElement("span");
      swipeCueWord.className = "builder-flavor-swipe-word";
      swipeCueWord.textContent = "Desliza";
      const swipeCueTrack = document.createElement("span");
      swipeCueTrack.className = "builder-flavor-swipe-track";
      const swipeCueGlider = document.createElement("span");
      swipeCueGlider.className = "builder-flavor-swipe-glider";
      swipeCueTrack.append(swipeCueGlider);
      swipeCueIntro.append(swipeCueWord, swipeCueTrack);
      const swipeCueProgress = document.createElement("span");
      swipeCueProgress.className = "builder-flavor-swipe-progress";
      const swipeCueCounter = document.createElement("span");
      swipeCueCounter.className = "builder-flavor-swipe-counter";
      swipeCueCounter.textContent = "1 / 1";
      const swipeCueDots = document.createElement("span");
      swipeCueDots.className = "builder-flavor-swipe-dots";
      swipeCueDots.innerHTML = '<i></i><i class="active"></i><i></i>';
      swipeCueProgress.append(swipeCueCounter, swipeCueDots);
      swipeCueDock.append(swipeCueIntro, swipeCueProgress);
      swipeCue.append(swipeCueDock);
      const details = document.createElement("div");
      details.className = "builder-flavor-expanded-details";
      const eyebrow = document.createElement("span");
      eyebrow.textContent = kind === "fonkies" ? "Fonkie · Galleta" : "Fomb · Bombón";
      const heading = document.createElement("h3");
      heading.textContent = name;
      const availability = document.createElement("span");
      availability.className = "builder-flavor-expanded-availability";
      const consult = document.createElement("a");
      consult.className = "builder-flavor-expanded-consult";
      consult.target = "_blank";
      consult.rel = "noopener";
      consult.textContent = "Preguntar cuándo estará disponible";
      consult.hidden = true;
      const ingredients = document.createElement("p");
      ingredients.textContent = meta?.ingredients?.trim() || "Ingredientes pendientes de confirmar con Fontana.";
      const quantityActions = document.createElement("div");
      quantityActions.className = "builder-flavor-expanded-actions";
      const quantityCopy = document.createElement("span");
      quantityCopy.className = "builder-flavor-quantity-copy";
      const quantityTitle = document.createElement("b");
      quantityTitle.textContent = "Cantidad";
      const quantityHint = document.createElement("small");
      quantityHint.textContent = "de este sabor";
      quantityCopy.append(quantityTitle, quantityHint);
      const quantityGroup = document.createElement("div");
      quantityGroup.className = "builder-flavor-quantity";
      quantityGroup.setAttribute("role", "group");
      const quantityDecrease = document.createElement("button");
      quantityDecrease.type = "button";
      quantityDecrease.className = "builder-flavor-quantity-button";
      quantityDecrease.textContent = "−";
      const quantityOutput = document.createElement("output");
      quantityOutput.className = "builder-flavor-quantity-output";
      quantityOutput.setAttribute("aria-live", "polite");
      quantityOutput.setAttribute("aria-atomic", "true");
      quantityOutput.value = "0";
      quantityOutput.textContent = "0";
      const quantityIncrease = document.createElement("button");
      quantityIncrease.type = "button";
      quantityIncrease.className = "builder-flavor-quantity-button";
      quantityIncrease.textContent = "+";
      quantityGroup.append(quantityDecrease, quantityOutput, quantityIncrease);
      const done = document.createElement("button");
      done.type = "button";
      done.className = "builder-flavor-done";
      done.textContent = "Listo";
      done.setAttribute("aria-label", "Cerrar detalles y conservar cantidades");
      quantityActions.append(quantityCopy, quantityGroup, done);
      const liveStatus = document.createElement("span");
      liveStatus.className = "sr-only";
      liveStatus.setAttribute("aria-live", "polite");
      const swipeInstructions = document.createElement("span");
      swipeInstructions.id = "builder-flavor-swipe-instructions";
      swipeInstructions.className = "sr-only";
      swipeInstructions.textContent = "Desliza horizontalmente sobre la foto o usa las flechas izquierda y derecha para cambiar de sabor.";
      overlay.setAttribute("aria-describedby", swipeInstructions.id);
      details.append(eyebrow, heading, availability, consult, ingredients, quantityActions);
      back.append(media, swipeCue, details, swipeInstructions, liveStatus);
      inner.append(front, back);
      overlay.append(inner);
      document.body.append(overlay);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let motion = null;
      let faceMotions = [];
      if (reduceMotion) {
        overlay.style.transform = targetTransform;
        front.style.visibility = "hidden";
        back.style.visibility = "visible";
      } else {
        const faceTiming = { duration: motionDuration, easing: "linear", fill: "forwards" };
        const frontMotion = front.animate([
          { visibility: "visible", offset: 0 },
          { visibility: "visible", offset: 0.499 },
          { visibility: "hidden", offset: 0.501 },
          { visibility: "hidden", offset: 1 }
        ], faceTiming);
        const backMotion = back.animate([
          { visibility: "hidden", offset: 0 },
          { visibility: "hidden", offset: 0.499 },
          { visibility: "visible", offset: 0.501 },
          { visibility: "visible", offset: 1 }
        ], faceTiming);
        faceMotions = [frontMotion, backMotion];
        motion = overlay.animate(keyframes, {
          duration: motionDuration,
          easing: "cubic-bezier(.36,.08,.64,.92)",
          fill: "forwards"
        });
      }
      const layoutController = new AbortController();
      const state = {
        source,
        currentSource: source,
        currentName: name,
        currentIndex: 0,
        cards: flavorCards,
        kind,
        overlay,
        front,
        back,
        media,
        backImage,
        heading,
        availability,
        consult,
        ingredients,
        details,
        quantityActions,
        quantityGroup,
        quantityDecrease,
        quantityOutput,
        quantityIncrease,
        quantityControls: null,
        done,
        swipeCue,
        swipeCueCounter,
        liveStatus,
        motion,
        faceMotions,
        backdropMotion: null,
        flavorMotion: null,
        flavorSwitchEpoch: 0,
        geometry,
        layoutController,
        layoutFrame: 0,
        scrollState: lockModalPageScroll(),
        closing: false,
        switching: false,
        pendingClose: null,
        pendingDirections: [],
        pendingWheelOffset: 0,
        ready: reduceMotion,
        suppressMediaClickUntil: 0,
        swipeCueUsed: false,
        flavorWheelGesture: null,
        flavorWheelTimer: 0,
        flavorUnavailable: false,
        quantityBuilder: source.closest(".fonkie-builder, .fomb-builder"),
        quantityChangeHandler: null,
        quantityBusy: source.closest(".fonkie-builder, .fomb-builder")?.dataset.quantityPending === "true"
      };
      state.currentIndex = Math.max(0, state.cards.indexOf(source));
      state.quantityChangeHandler = event => {
        if (active !== state) return;
        const focusedControl = document.activeElement;
        state.quantityBusy = Boolean(event.detail?.pending);
        syncExpandedFlavorQuantity(state);
        syncFlavorCue(state);
        if (focusedControl === state.quantityDecrease && state.quantityDecrease.disabled) {
          state.quantityIncrease.focus({ preventScroll: true });
        } else if (focusedControl === state.quantityIncrease && state.quantityIncrease.disabled) {
          [state.quantityDecrease, state.done, state.swipeCue, state.media]
            .find(control => control?.isConnected && !control.disabled && !control.hidden)
            ?.focus({ preventScroll: true });
        }
        if (!state.quantityBusy && state.pendingClose) {
          const immediate = state.pendingClose === "immediate";
          state.pendingClose = null;
          close(immediate);
        }
      };
      state.quantityBuilder?.addEventListener("fontana:flavor-change", state.quantityChangeHandler);
      active = state;
      renderFlavor(state, source, { preserveImage:true });
      promoteFlavorOriginal(state, source);
      const refreshGeometry = () => scheduleExpandedFlavorGeometryRefresh(state);
      window.addEventListener("resize", refreshGeometry, { signal: layoutController.signal });
      window.addEventListener("orientationchange", refreshGeometry, { signal: layoutController.signal });
      window.visualViewport?.addEventListener("resize", refreshGeometry, { signal: layoutController.signal });
      window.visualViewport?.addEventListener("scroll", refreshGeometry, { signal: layoutController.signal });
      document.fonts?.addEventListener?.("loadingdone", refreshGeometry, { signal: layoutController.signal });
      document.fonts?.ready.then(() => {
        if (active === state && !state.closing) scheduleExpandedFlavorGeometryRefresh(state);
      }).catch(() => {});
      source.style.visibility = "hidden";
      source.setAttribute("aria-expanded", "true");
      backdrop.hidden = false;
      requestAnimationFrame(() => {
        if (active !== state || state.closing) return;
        backdrop.classList.add("visible");
      });
      media.addEventListener("click", event => {
        if (performance.now() < state.suppressMediaClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        close();
      });
      const changeExpandedFlavorQuantity = delta => {
        if (state.switching || state.closing) return;
        const controls = matchingFlavorControls(state.source, state.kind, state.currentName);
        const button = delta > 0 ? controls?.increase : controls?.decrease;
        if (!controls?.row || !button || button.disabled || (delta > 0 && state.flavorUnavailable)) return;
        button.click();
      };
      quantityDecrease.addEventListener("click", () => changeExpandedFlavorQuantity(-1));
      quantityIncrease.addEventListener("click", () => changeExpandedFlavorQuantity(1));
      done.addEventListener("click", () => close());

      let pointer = null;
      const finishPointer = event => {
        if (!pointer || event.pointerId !== pointer.id) return;
        const dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;
        const elapsed = Math.max(1, performance.now() - pointer.time);
        const horizontal = Math.abs(dx) >= 48
          && Math.abs(dx) > Math.abs(dy) * 1.2
          && elapsed <= 1000;
        try {
          if (pointer.target.hasPointerCapture?.(pointer.id)) pointer.target.releasePointerCapture(pointer.id);
        } catch (_error) {}
        pointer = null;
        if (!horizontal) return;
        event.preventDefault();
        state.suppressMediaClickUntil = performance.now() + 450;
        switchFlavor(dx < 0 ? 1 : -1);
      };
      const startPointer = event => {
        if (!state.ready || state.closing || event.button !== 0) return;
        pointer = {
          id: event.pointerId,
          target: event.currentTarget,
          x: event.clientX,
          y: event.clientY,
          time: performance.now()
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (_error) {}
      };
      [media, swipeCue].forEach(target => {
        target.addEventListener("pointerdown", startPointer);
        target.addEventListener("pointerup", finishPointer);
        target.addEventListener("pointercancel", () => { pointer = null; });
      });
      overlay.addEventListener("wheel", event => {
        if (active !== state || event.ctrlKey) return;

        const width = Math.max(1, state.media.clientWidth);
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? width
            : 1;
        const shiftWheel = event.shiftKey && Math.abs(event.deltaX) < Math.abs(event.deltaY);
        const horizontalDelta = (shiftWheel ? event.deltaY : event.deltaX) * unit;
        const verticalDelta = shiftWheel ? 0 : event.deltaY * unit;
        if (
          Math.abs(horizontalDelta) < 1
          || (!shiftWheel && Math.abs(horizontalDelta) <= Math.abs(verticalDelta) * 1.2)
        ) return;

        event.preventDefault();
        if (
          !state.ready
          || state.closing
          || state.pendingClose
          || state.cards.length < 2
          || state.quantityBusy
        ) return;
        const now = performance.now();
        const magnitude = Math.abs(horizontalDelta);
        const direction = Math.sign(horizontalDelta);
        const currentGesture = state.flavorWheelGesture;
        const rested = !currentGesture || now - currentGesture.lastEventAt > 90;
        const reversed = currentGesture && direction !== currentGesture.direction;
        const renewedImpulse = currentGesture?.committed
          && currentGesture.decayed
          && now - currentGesture.committedAt >= 60
          && magnitude >= 12
          && magnitude >= currentGesture.lastMagnitude * 1.35
          && magnitude >= currentGesture.postCommitMin * 1.6;
        if (rested || reversed || renewedImpulse) {
          resetFlavorWheelGesture(state);
          state.flavorWheelGesture = {
            totalX: 0,
            committed: false,
            direction,
            lastEventAt: now,
            lastMagnitude: magnitude,
            committedAt: 0,
            postCommitMin: Number.POSITIVE_INFINITY,
            decayed: false
          };
        }

        const gesture = state.flavorWheelGesture;
        gesture.lastEventAt = now;
        if (!gesture.committed) {
          const previousMagnitude = gesture.lastMagnitude;
          gesture.totalX += horizontalDelta;
          gesture.lastMagnitude = magnitude;
          const threshold = Math.min(56, Math.max(28, width * .08));
          if (Math.abs(gesture.totalX) >= threshold) {
            gesture.committed = true;
            gesture.committedAt = now;
            gesture.postCommitMin = magnitude;
            gesture.decayed = magnitude <= previousMagnitude * .9;
            switchFlavor(Math.sign(gesture.totalX), { wheel: true });
          }
        } else {
          gesture.decayed ||= magnitude <= gesture.lastMagnitude * .9;
          gesture.postCommitMin = Math.min(gesture.postCommitMin, magnitude);
          gesture.lastMagnitude = magnitude;
        }

        window.clearTimeout(state.flavorWheelTimer);
        state.flavorWheelTimer = window.setTimeout(() => {
          resetFlavorWheelGesture(state);
        }, 90);
      }, { passive: false });
      overlay.addEventListener("keydown", event => {
        const horizontalShortcut = event.key === "ArrowLeft" || event.key === "ArrowRight";
        const sliderOnlyShortcut = event.key === "ArrowUp"
          || event.key === "ArrowDown"
          || event.key === "Home"
          || event.key === "End";
        if (!horizontalShortcut && !(sliderOnlyShortcut && event.target === swipeCue)) return;
        const directions = {
          ArrowLeft: -1,
          ArrowDown: -1,
          ArrowRight: 1,
          ArrowUp: 1,
          Home: -state.currentIndex,
          End: state.cards.length - 1 - state.currentIndex
        };
        event.preventDefault();
        if (state.switching && (event.key === "Home" || event.key === "End")) return;
        const direction = directions[event.key];
        if (direction) switchFlavor(direction);
      });
      overlay.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
      swipeCue.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home End");
      if (reduceMotion) {
        back.setAttribute("aria-hidden", "false");
        syncFlavorCue(state);
        back.focus({ preventScroll: true });
      } else {
        motion.finished.then(() => {
          if (active !== state || state.closing) return;
          state.ready = true;
          back.setAttribute("aria-hidden", "false");
          syncFlavorCue(state);
          back.focus({ preventScroll: true });
        }).catch(() => {});
      }
    };

    tracks.forEach(track => {
      track.addEventListener("click", event => {
        const card = event.target.closest(".fonkie-gallery-card, .builder-gallery-card");
        if (card && track.contains(card)) open(card);
      });
      track.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const card = event.target.closest(".fonkie-gallery-card, .builder-gallery-card");
        if (!card || !track.contains(card)) return;
        event.preventDefault();
        open(card);
      });
      $$(".fonkie-gallery-card, .builder-gallery-card", track).forEach(card => {
        card.tabIndex = track.dataset.galleryLoop === "true"
          ? (card.getAttribute("aria-current") === "true" ? 0 : -1)
          : 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-expanded", "false");
        const availability = $(".builder-flavor-availability", card)?.textContent?.trim();
        card.setAttribute("aria-label", `Ver detalles de ${flavorName(card)}${availability ? `. ${availability}` : ""}`);
        card.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight Home End");
      });
    });
    backdrop.addEventListener("click", () => close());
    backdrop.addEventListener("touchmove", event => event.preventDefault(), { passive: false });
    backdrop.addEventListener("wheel", event => event.preventDefault(), { passive: false });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !active || active.closing) return;
      const focusable = [...active.overlay.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter(element => !element.hidden && element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        active.back.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;
      if (!active.overlay.contains(focused) || !focusable.includes(focused)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
  }

  function renderDynamicCatalog() {
    const products = Array.isArray(config.dynamicCatalog) ? config.dynamicCatalog : [];
    const container = $("#products");
    const emptyState = $("#emptyFilterState");
    if (!container || !emptyState || !products.length) return;
    const allowedCategories = new Set(["cakes", "snacks", "salado", "beverages", "bottega"]);
    const cards = products.map((product, index) => {
      const category = allowedCategories.has(product.category) ? product.category : "snacks";
      const catalogManaged = product.catalogManaged !== false;
      const pendingCatalogPublication = category === "bottega" && !catalogManaged;
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
      const availabilityMode = productAvailabilityMode(product);
      const soldOut = availabilityMode === "preorder" || availabilityMode === "sold-out" || product.status === "sold-out" || product.stockQuantity === 0 || (variants.length > 0 && availableVariants.length === 0) || (sizes.length > 0 && availableSizes.length === 0);
      const stockTracked = productStockIsTracked(product);
      const preorderAllowed = availabilityMode === "preorder";
      const preorder = soldOut && preorderAllowed;
      const bottegaAvailability = category !== "bottega"
        ? ""
        : resolvedBottegaAvailability({ stockTracked, soldOut, preorder, availabilityMode });
      const bottegaAvailabilityLabel = bottegaAvailabilityCopy(bottegaAvailability);
      const immediate = category === "bottega"
        ? stockTodayOpen && bottegaAvailability === "immediate"
        : stockTodayOpen && !soldOut && !temporarilyUnavailable && Boolean(product.immediate);
      const description = String(product.description || "Disponibilidad sujeta a confirmación por WhatsApp.");
      const ingredients = String(product.ingredients || "");
      const dietary = resolvedDietary(product);
      const badges = [];
      if (soldOut && !preorder) badges.push("AGOTADO");
      if (temporarilyUnavailable) badges.unshift("TEMPORALMENTE NO DISPONIBLE");
      if (preorder) badges.push("PREORDENAR · 2 DÍAS");
      if (product.isNew) badges.push("NUEVO");
      if (product.promo) badges.push("PROMOCIÓN DEL DÍA");
      if (immediate) badges.push("DISPONIBLE HOY");
      (Array.isArray(product.customLabels) ? product.customLabels : []).forEach(label => { if (label) badges.push(String(label).slice(0,40)); });
      const image = product.image
        ? responsiveImageMarkup(product.image, name)
        : `<div class="product-placeholder"><div><b>${escapeHtml(name)}</b><small>Foto por actualizar</small></div></div>`;
      const sizePrices = availableSizes.map(size => Number(size.price)).filter(value => Number.isFinite(value));
      const minimumSizePrice = sizePrices.length ? Math.min(...sizePrices) : null;
      const priceCopy = minimumSizePrice !== null ? `Desde ${money(minimumSizePrice)}` : hasPrice ? money(price) : "Cotizar";
      const classes = ["product", (soldOut && !preorder) || temporarilyUnavailable ? "product-sold-out" : "", temporarilyUnavailable ? "product-temporarily-unavailable" : "", preorder ? "product-preorder" : "", hasPrice ? "" : "product-unpriced"].filter(Boolean).join(" ");
      const cartImage = product.image || "assets/logo.png";
      const variantControl = variants.length ? `<div class="product-variants"><label for="variant-${escapeHtml(productId)}">${escapeHtml(product.variantLabel || "Elige el sabor")}</label><select class="product-variant" id="variant-${escapeHtml(productId)}" ${soldOut && !preorder ? "disabled" : ""}>${variants.map(variant => {
        const optionSold = variant.status === "sold-out" || variant.stockQuantity === 0;
        const optionPreorder = optionSold && preorderAllowed;
        const unavailable = optionSold && !optionPreorder;
        return `<option value="${unavailable ? "" : escapeHtml(variant.name)}" data-sold-out="${optionSold}" ${unavailable ? "disabled" : ""}>${escapeHtml(variant.name)}${optionSold ? optionPreorder ? " · Pre-Order" : " · Agotado" : ""}</option>`;
      }).join("")}</select></div>` : "";
      const sizeControl = sizes.length ? `<div class="product-variants"><label for="size-${escapeHtml(productId)}">${escapeHtml(product.sizeLabel || "Elige la presentación")}</label><select class="product-size" id="size-${escapeHtml(productId)}" ${soldOut && !preorder ? "disabled" : ""}>${sizes.map(size => {
        const optionSold = size.status === "sold-out" || size.stockQuantity === 0;
        const optionPreorder = optionSold && preorderAllowed;
        const unavailable = optionSold && !optionPreorder;
        return `<option value="${unavailable ? "" : escapeHtml(size.name)}" data-price="${Number(size.price)}" data-sold-out="${optionSold}" ${unavailable ? "disabled" : ""}>${escapeHtml(size.name)} · ${money(Number(size.price))}${optionSold ? optionPreorder ? " · Pre-Order" : " · Agotado" : ""}</option>`;
      }).join("")}</select></div>` : "";
      const compactSelection = category === "salado" && (sizes.length || variants.length)
        ? `<button type="button" class="product-selection-summary" aria-label="Elegir presentación y opciones de ${escapeHtml(name)}"><span>Tu selección</span><strong>${escapeHtml([
            sizes.find(size => size.status !== "sold-out" && size.stockQuantity !== 0)?.name || sizes[0]?.name,
            variants.find(variant => variant.status !== "sold-out" && variant.stockQuantity !== 0)?.name || variants[0]?.name
          ].filter(Boolean).join(" · "))}</strong><em>Ver opciones</em></button>`
        : "";
      const badgeMarkup = badges.length ? `<div class="product-tags">${badges.map((badge,index) => { const statusClass = badge === "TEMPORALMENTE NO DISPONIBLE" || badge === "AGOTADO" ? " status-unavailable" : badge.startsWith("PREORDENAR") ? " status-preorder" : ""; return `<span class="product-tag${index ? " secondary" : ""}${statusClass}">${escapeHtml(badge)}</span>`; }).join("")}</div>` : "";
      const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");
      const quoteText = soldOut && !preorder
        ? `Hola Fontana sin gluten 💜 Quisiera saber para cuándo pueden tener disponible ${name}.`
        : category === "bottega"
          ? `Hola Fontana sin gluten 💜 Quisiera consultar la disponibilidad de ${name}${hasPrice ? ` (${money(price)})` : ""}.`
          : `Hola Fontana sin gluten 💜 Quisiera consultar los sabores y el presupuesto para ${name}.`;
      const quoteButton = (!hasPrice || pendingCatalogPublication || (soldOut && !preorder)) && whatsappNumber
        ? `<a class="product-quote" href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(quoteText)}" target="_blank" rel="noopener" aria-label="Consultar ${escapeHtml(name)} por WhatsApp">${soldOut && !preorder ? "Preguntar disponibilidad" : pendingCatalogPublication ? "Consultar disponibilidad" : "Consultar por WhatsApp"}</a>`
        : "";
      const availabilityCopy = preorder ? "PREORDENAR · ENTREGA EN 2 DÍAS" : soldOut ? "AGOTADO" : immediate ? "DISPONIBLE HOY" : "";
      // Keep the product's presentation visible in the footer. Availability is
      // already communicated by the status badge above the image, so it must
      // not replace useful data such as 355 ML, 400 G or 1,5 L.
      const footerCopy = product.weight || product.availabilityLabel || availabilityCopy || (category === "bottega" ? bottegaAvailabilityLabel : "");
      return `<article class="${classes}" data-category="${category}" data-id="${escapeHtml(id)}" data-product-id="${escapeHtml(productId)}" data-name="${escapeHtml(name)}" data-price="${hasPrice ? price : ""}" data-image="${escapeHtml(cartImage)}" data-ingredients="${escapeHtml(ingredients)}" data-gluten-free="${dietary.glutenFree}" data-sugar-free="${dietary.sugarFree}" data-lactose-free="${dietary.lactoseFree}" data-egg-free="${dietary.eggFree}" data-promo="${Boolean(product.promo)}" data-immediate="${immediate}" data-stock-state="${bottegaAvailability || "pending"}" data-catalog-managed="${catalogManaged}" data-sold-out="${soldOut}" data-temporarily-unavailable="${temporarilyUnavailable}" data-preorder="${preorder}" data-preorder-allowed="${preorderAllowed}"><div class="product-media">${image}${badgeMarkup}</div><div class="product-body"><div class="product-top"><h3>${escapeHtml(name)}</h3><span class="price">${priceCopy}</span></div><p>${escapeHtml(description)}</p>${sizeControl}${variantControl}${compactSelection}<div class="product-footer"><span class="diet">${escapeHtml(String(temporarilyUnavailable ? "TEMPORALMENTE NO DISPONIBLE" : footerCopy || "DISPONIBLE"))}</span>${catalogManaged && hasPrice && (!soldOut || preorder) && !temporarilyUnavailable ? `<button class="add" aria-label="${preorder ? "Preordenar" : "Agregar"} ${escapeHtml(name)}">${preorder ? "PREORDENAR" : "+"}</button>` : temporarilyUnavailable ? "" : quoteButton}</div></div></article>`;
    }).filter(Boolean).join("");
    emptyState.insertAdjacentHTML("beforebegin", cards);
  }

  function setupCatalogGroups() {
    const container = $("#products");
    if (!container || container.classList.contains("catalog-organized")) return;
    const categories = ["cakes", "fonkies", "fomb", "salado", "beverages", "bottega", "snacks"];
    const categoryLabels = {
      cakes: "Tortas",
      fonkies: "Fonkies",
      fomb: "Bombones",
      salado: "Salados",
      beverages: "Bebidas",
      bottega: "Bottega",
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
    scheduleProductCardHeightSync();
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
    if (card.dataset.catalogManaged === "false") {
      return { error:"Disponibilidad por confirmar. Consulta este producto por WhatsApp." };
    }
    const selectedVariant = $(".product-variant", card)?.value || "";
    const sizeSelect = $(".product-size", card);
    const selectedSize = sizeSelect?.value || "";
    if ($(".product-variant", card) && !selectedVariant) {
      return { error: "Este sabor está agotado" };
    }
    const selectedVariantOption = $(".product-variant", card)?.selectedOptions?.[0];
    const selectedSizeOption = sizeSelect?.selectedOptions?.[0];
    const selectedOptionSoldOut = selectedVariantOption?.dataset.soldOut === "true" || selectedSizeOption?.dataset.soldOut === "true";
    const preorder = card.dataset.preorderAllowed === "true" && (card.dataset.soldOut === "true" || selectedOptionSoldOut);
    const stockState = card.dataset.stockState || "";
    const stockCopy = card.dataset.category === "bottega"
      ? stockState === "immediate"
        ? "ENTREGA INMEDIATA"
        : stockState === "preorder"
          ? "PRE-ORDER"
          : stockState === "pending"
            ? "DISPONIBILIDAD POR CONFIRMAR"
            : ""
      : preorder
        ? "PRE-ORDER · 2 días"
        : "";
    const identityChoices = [selectedSize, selectedVariant].filter(Boolean);
    const selectedChoices = [...identityChoices, stockCopy].filter(Boolean);
    const choiceSlug = identityChoices.join("-").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const id = choiceSlug ? `${card.dataset.id}-${choiceSlug}` : card.dataset.id;
    const selectedPrice = sizeSelect ? Number(sizeSelect.selectedOptions[0]?.dataset.price) : Number(card.dataset.price);
    return {
      id,
      preorder,
      item: {
        id,
        productId: card.dataset.productId || card.dataset.id,
        category: card.dataset.category || "",
        name: card.dataset.name,
        price: selectedPrice,
        image: card.dataset.image,
        ingredients: productIngredients(card.dataset.id),
        choices: selectedChoices.join(" · ") || undefined,
        inventory: { kind:"product", productId:card.dataset.productId || card.dataset.id, size:selectedSize, variant:selectedVariant, preorder, availability:stockState || undefined },
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

  function serializeStockQuantityMutation(task) {
    const execution = stockQuantityMutationTail.then(task, task);
    stockQuantityMutationTail = execution.catch(() => {});
    return execution;
  }

  function trackQuantityCommit(task) {
    const tracked = Promise.resolve(task);
    quantityCommitTasks.add(tracked);
    const cleanup = () => quantityCommitTasks.delete(tracked);
    tracked.then(cleanup, cleanup);
    return tracked;
  }

  function quantityQueuesBusy() {
    return [...productAddQueues.values()].some(queue => queue.pending > 0 || queue.inFlight > 0 || queue.processing);
  }

  function resolveQuantityQueuesIdle() {
    if (quantityQueuesBusy()) return;
    const resolvers = quantityQueueIdleResolvers.splice(0);
    resolvers.forEach(resolve => resolve());
  }

  async function flushQuantityQueues() {
    if (!quantityQueuesBusy()) return;
    const waiting = new Promise(resolve => quantityQueueIdleResolvers.push(resolve));
    for (const [id, queue] of productAddQueues) {
      if (!queue.pending || queue.processing) continue;
      window.clearTimeout(queue.timer);
      queue.timer = 0;
      processProductQueue(id);
    }
    await waiting;
  }

  async function flushQuantityWork() {
    while (true) {
      await flushQuantityQueues();
      const commits = [...quantityCommitTasks];
      if (commits.length) await Promise.allSettled(commits);
      const mutationTail = stockQuantityMutationTail;
      await mutationTail;
      if (!quantityQueuesBusy() && !quantityCommitTasks.size && mutationTail === stockQuantityMutationTail) return;
    }
  }

  function displayedProductQuantity(selection) {
    if (!selection || selection.error) return 0;
    const committed = Number(cart.find(item => item.id === selection.id)?.qty || 0);
    const queue = productAddQueues.get(selection.id);
    return committed
      + Number(queue?.pending || 0)
      + Math.max(0, Number(queue?.inFlight || 0) - Number(queue?.cancelInFlight || 0));
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
      renderCart();
      const outcome = await serializeStockQuantityMutation(async () => {
        const result = await maximumValidAddition(queue.item, requested);
        const accepted = Math.max(0, Math.min(result.quantity, requested - queue.cancelInFlight));
        queue.inFlight = 0;
        queue.cancelInFlight = 0;
        if (accepted) {
          addItemQuantity(queue.item, accepted);
          save();
        }
        return { accepted, result };
      });
      if (outcome.accepted) {
        say(outcome.accepted === 1 ? "Añadido a tu pedido 💜" : `${outcome.accepted} unidades añadidas a tu pedido 💜`);
      }
      if (outcome.accepted < requested && outcome.result.error) say(stockLimitNotice(outcome.result.error, queue.item.name));
    }
    queue.processing = false;
    if (!queue.pending && !queue.inFlight) productAddQueues.delete(id);
    syncProductQuantityControls();
    renderCart();
    resolveQuantityQueuesIdle();
  }

  function addProduct(card) {
    const selection = productSelection(card);
    if (selection.error) return say(selection.error);
    quantityMutationVersion += 1;
    if (selection.preorder) {
      addItemQuantity(selection.item, 1);
      save();
      return say("Pre-order añadido a tu pedido 💜");
    }
    const queue = scheduleProductQueue(selection);
    queue.pending += 1;
    syncProductQuantityControls();
    renderCart();
  }

  function subtractQueuedItem(id, requested = 1) {
    const queue = productAddQueues.get(id);
    const item = cart.find(entry => entry.id === id);
    let remaining = Math.max(0, Math.trunc(Number(requested) || 0));
    if (remaining > 0) quantityMutationVersion += 1;
    if (queue?.pending > 0 && remaining > 0) {
      const cancelled = Math.min(queue.pending, remaining);
      queue.pending -= cancelled;
      remaining -= cancelled;
    }
    if (queue && queue.inFlight > queue.cancelInFlight && remaining > 0) {
      const cancelled = Math.min(queue.inFlight - queue.cancelInFlight, remaining);
      queue.cancelInFlight += cancelled;
      remaining -= cancelled;
    }
    let committedChanged = false;
    if (item && remaining > 0) {
      item.qty = Math.max(0, Number(item.qty || 0) - remaining);
      committedChanged = true;
      if (item.qty <= 0) cart = cart.filter(entry => entry.id !== id);
    }
    if (queue && !queue.pending && !queue.inFlight && !queue.processing) {
      window.clearTimeout(queue.timer);
      productAddQueues.delete(id);
    }
    if (committedChanged) save();
    else {
      syncProductQuantityControls();
      renderCart();
    }
    resolveQuantityQueuesIdle();
  }

  function subtractProduct(card) {
    const selection = productSelection(card);
    if (selection.error) return;
    subtractQueuedItem(selection.id, 1);
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

  function resolveFombPricing(total, preferredSize = 0) {
    const configured = adminState?.builders?.fomb || {};
    const rawSizes = Array.isArray(configured.sizes) && configured.sizes.length
      ? configured.sizes
      : [{quantity:4,price:15},{quantity:12,price:30}];
    const sizeMap = new Map();
    rawSizes.forEach(size => {
      const quantity = Math.max(0, Math.floor(Number(size.quantity)));
      const price = Number(size.price);
      if (quantity > 0 && Number.isFinite(price) && price >= 0) sizeMap.set(quantity, {quantity,price});
    });
    const sizes = [...sizeMap.values()].sort((left, right) => left.quantity - right.quantity);
    if (!sizes.length) return null;
    const selectedTotal = Math.max(0, Math.floor(Number(total) || 0));
    const requested = sizes.find(size => size.quantity === Number(preferredSize));
    const eligible = sizes.filter(size => size.quantity <= selectedTotal);
    const size = requested && selectedTotal < requested.quantity
      ? requested
      : eligible[eligible.length - 1] || sizes[0];
    const extras = Math.max(0, selectedTotal - size.quantity);
    const configuredExtraPrice = Number(configured.extraPrice ?? 3.5);
    const extraPrice = Number.isFinite(configuredExtraPrice) && configuredExtraPrice >= 0
      ? configuredExtraPrice
      : 3.5;
    return {
      size:size.quantity,
      extras,
      extraPrice,
      price:size.price + extras * extraPrice
    };
  }

  function createBuilderQuantityController({ builder, rows, kind, preorderAllowed, updateBuilder }) {
    const state = {
      committed: new Map(rows.map(row => [
        row,
        Math.max(0, Number($("output", row)?.value || $("output", row)?.textContent || 0))
      ])),
      pending: [],
      inFlight: [],
      processing: false,
      timer: 0,
      idleResolvers: []
    };

    const isPreorder = row => row.dataset.stockState === "preorder";
    const isUnavailable = row => row.dataset.stockState === "unavailable";
    const activeOperations = operations => operations.filter(operation => !operation.cancelled);
    const quantityFor = row => Math.max(0,
      Number(state.committed.get(row) || 0)
      + activeOperations(state.inFlight).filter(operation => operation.row === row).length
      + activeOperations(state.pending).filter(operation => operation.row === row).length
    );
    const busy = () => state.processing || activeOperations(state.pending).length > 0 || activeOperations(state.inFlight).length > 0;

    const resolveIdle = () => {
      if (busy()) return;
      const resolvers = state.idleResolvers.splice(0);
      resolvers.forEach(resolve => resolve());
    };

    const render = ({ success = true, settled = false } = {}) => {
      rows.forEach(row => {
        const output = $("output", row);
        const quantity = quantityFor(row);
        if (output) {
          output.value = String(quantity);
          output.textContent = String(quantity);
        }
      });
      const pending = busy();
      builder.dataset.quantityPending = String(pending);
      updateBuilder();
      rows.forEach(row => row.dispatchEvent(new CustomEvent("fontana:flavor-change", {
        bubbles: true,
        detail: {
          kind,
          flavor: row.dataset.flavor,
          quantity: quantityFor(row),
          pending,
          settled,
          success
        }
      })));
      resolveIdle();
    };

    const validationChecks = operations => rows
      .filter(row => !isPreorder(row))
      .map(row => ({
        kind,
        flavor: row.dataset.flavor,
        inventoryKey: row.dataset.inventoryKey || "",
        quantity: Math.max(0,
          Number(state.committed.get(row) || 0)
          + operations.filter(operation => !operation.cancelled && operation.row === row).length
        )
      }))
      .filter(check => check.quantity > 0);

    const maximumValidOperations = async operations => {
      const candidates = activeOperations(operations);
      if (!candidates.length) return { quantity: 0 };
      const fullValidation = await validateStock(validationChecks(candidates));
      const remainingAfterFullValidation = activeOperations(candidates);
      if (fullValidation.ok) return { quantity: remainingAfterFullValidation.length };
      if (remainingAfterFullValidation.length !== candidates.length) {
        return maximumValidOperations(remainingAfterFullValidation);
      }
      if (/No pudimos|momento|Inténtalo/i.test(fullValidation.error || "")) {
        return { quantity: 0, error: fullValidation.error };
      }
      const remaining = remainingAfterFullValidation;
      let low = 0;
      let high = Math.max(0, remaining.length - 1);
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const validation = await validateStock(validationChecks(remaining.slice(0, middle)));
        const stillActive = activeOperations(remaining);
        if (stillActive.length !== remaining.length) return maximumValidOperations(stillActive);
        if (validation.ok) low = middle;
        else high = middle - 1;
      }
      return { quantity: low, error: fullValidation.error };
    };

    const process = async () => {
      if (state.processing) return;
      window.clearTimeout(state.timer);
      state.timer = 0;
      state.processing = true;
      render();
      try {
        while (activeOperations(state.pending).length) {
          const batch = state.pending.splice(0);
          state.inFlight = batch;
          render();
          const candidates = activeOperations(batch);
          const result = await serializeStockQuantityMutation(() => maximumValidOperations(candidates));
          const remaining = activeOperations(candidates);
          const accepted = remaining.slice(0, Math.min(result.quantity, remaining.length));
          accepted.forEach(operation => {
            state.committed.set(operation.row, Number(state.committed.get(operation.row) || 0) + 1);
          });
          const rejected = remaining.length - accepted.length;
          state.inFlight = [];
          render({ success: rejected === 0 });
          if (rejected > 0 && result.error) {
            const firstRejected = remaining[accepted.length]?.row;
            say(stockLimitNotice(result.error, firstRejected?.dataset.flavor || (kind === "fonkies" ? "las Fonkies" : "los Fomb")));
          }
        }
      } finally {
        state.inFlight = [];
        state.processing = false;
        render({ settled: true });
      }
    };

    const schedule = () => {
      if (state.processing) return;
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(process, 70);
    };

    const request = (row, delta) => {
      const change = Number(delta);
      if (!row || !Number.isFinite(change) || change === 0) return;
      quantityMutationVersion += 1;
      if (change > 0) {
        if (isUnavailable(row)) {
          say(`${row.dataset.flavor || "Este sabor"} está agotado. Puedes preguntar cuándo estará disponible.`);
          return;
        }
        if (isPreorder(row)) {
          state.committed.set(row, Number(state.committed.get(row) || 0) + change);
        } else {
          for (let index = 0; index < change; index += 1) state.pending.push({ row, cancelled: false });
          schedule();
        }
        render();
        return;
      }

      let remaining = Math.min(-change, quantityFor(row));
      while (remaining > 0) {
        let pendingIndex = -1;
        for (let index = state.pending.length - 1; index >= 0; index -= 1) {
          if (!state.pending[index].cancelled && state.pending[index].row === row) {
            pendingIndex = index;
            break;
          }
        }
        if (pendingIndex >= 0) {
          state.pending.splice(pendingIndex, 1);
          remaining -= 1;
          continue;
        }
        const inFlight = [...state.inFlight].reverse().find(operation => !operation.cancelled && operation.row === row);
        if (inFlight) {
          inFlight.cancelled = true;
          remaining -= 1;
          continue;
        }
        const committed = Number(state.committed.get(row) || 0);
        if (committed <= 0) break;
        state.committed.set(row, committed - 1);
        remaining -= 1;
      }
      if (!state.processing && !activeOperations(state.pending).length) {
        window.clearTimeout(state.timer);
        state.timer = 0;
      }
      render();
    };

    const whenIdle = () => {
      if (!busy()) return Promise.resolve();
      const waiting = new Promise(resolve => state.idleResolvers.push(resolve));
      if (!state.processing) process();
      return waiting;
    };

    const controller = { request, whenIdle, busy, sync: render };
    builder._fontanaQuantityController = controller;
    render({ settled: true });
    return controller;
  }

  function setupFonkieBuilder() {
    const builder = $(".fonkie-builder");
    if (!builder) return;
    const rows = $$(".fonkie-flavor", builder);
    const addButton = $("#addFonkieBox");
    const preorderAllowed = builder.dataset.preorder === "true";
    const temporaryUnavailable = builder.dataset.temporarilyUnavailable === "true";
    const unavailable = temporaryUnavailable || (builder.dataset.soldOut === "true" && !preorderAllowed);
    const minimum = Math.max(1, Number(adminState?.builders?.fonkies?.minimumQuantity || 4));
    const configuredExtraPrice = Number(adminState?.builders?.fonkies?.extraPrice ?? 3.5);
    const extraPrice = Number.isFinite(configuredExtraPrice) && configuredExtraPrice >= 0 ? configuredExtraPrice : 3.5;
    $("#fonkieIngredients div").textContent = builder.dataset.ingredients;
    const builderIntro = $(".fonkie-builder-head p", builder);
    if (builderIntro) builderIntro.textContent = `Elige sabores y cantidades. La disponibilidad se actualiza con el inventario real de Fontana. Mínimo ${minimum} unidades.`;

    function selectedFlavors() {
      return rows.map(row => ({
        name: row.dataset.flavor,
        inventoryKey: row.dataset.inventoryKey || "",
        qty: Number($("output", row).value || $("output", row).textContent || 0),
        preorder: row.dataset.stockState === "preorder",
        stockState: row.dataset.stockState || "pending"
      })).filter(item => item.qty > 0);
    }

    function updateBuilder() {
      const selected = selectedFlavors();
      const preorder = selected.some(item => item.preorder) || (builder.dataset.soldOut === "true" && preorderAllowed);
      const availability = preorder ? "preorder" : selectedBuilderAvailability(selected);
      const selectedUnavailable = selected.find(item => item.stockState === "unavailable");
      const total = selected.reduce((sum, item) => sum + item.qty, 0);
      const price = fonkiePrice(total, selected.length);
      $("#fonkieChoiceCount").textContent = `${total} ${total === 1 ? "elegido" : "elegidos"}`;
      $("#fonkieCount").textContent = `Has seleccionado ${total} ${total === 1 ? "Fonkie" : "Fonkies"}`;
      $("#fonkieTotal").textContent = money(price);
      addButton.disabled = total < minimum || unavailable || Boolean(selectedUnavailable);
      if (unavailable) {
        $("#fonkiePriceRule").textContent = temporaryUnavailable ? "Producción temporalmente pausada." : "Producto agotado temporalmente.";
        if (temporaryUnavailable) $("#fonkieValidation").textContent = "Temporalmente no disponible.";
        else $("#fonkieValidation").innerHTML = soldOutConsultMarkup("Fonkies");
      } else if (selectedUnavailable) {
        $("#fonkiePriceRule").textContent = `${selectedUnavailable.name} está agotado.`;
        $("#fonkieValidation").innerHTML = soldOutConsultMarkup(`${selectedUnavailable.name} de Fonkies`);
      } else if (total < minimum) {
        $("#fonkiePriceRule").textContent = `Selecciona al menos ${minimum} para armar tu caja.`;
        $("#fonkieValidation").textContent = `Mínimo ${minimum} galletas para armar tu caja.`;
      } else {
        const type = selected.length === 1 ? "Caja de un solo sabor" : "Caja mixta";
        const extras = total - minimum;
        $("#fonkiePriceRule").textContent = `${type}${extras ? ` + ${extras} extra${extras === 1 ? "" : "s"} a ${money(extraPrice)}` : ""}.`;
        $("#fonkieValidation").textContent = availability === "immediate"
          ? "Hay stock real: entrega inmediata."
          : availability === "preorder"
            ? "Pre-Order: tu caja estará lista en 2 días."
            : "Disponibilidad por confirmar con Fontana.";
      }
    }

    const quantityController = createBuilderQuantityController({
      builder,
      rows,
      kind: "fonkies",
      preorderAllowed,
      updateBuilder
    });
    $$(".fonkie-stepper button", builder).forEach(button => button.addEventListener("click", () => {
      quantityController.request(button.closest(".fonkie-flavor"), Number(button.dataset.delta));
    }));

    addButton.addEventListener("click", () => {
      quantityMutationVersion += 1;
      trackQuantityCommit((async () => {
        await quantityController.whenIdle();
        const selected = selectedFlavors();
        const total = selected.reduce((sum, item) => sum + item.qty, 0);
        if (total < minimum) {
          say(`Mínimo ${minimum} galletas para armar tu caja`);
          return;
        }
        const preorder = selected.some(item => item.preorder) || (builder.dataset.soldOut === "true" && preorderAllowed);
        const availability = preorder ? "preorder" : selectedBuilderAvailability(selected);
        const stocked = selected.filter(item => !item.preorder);
        const price = fonkiePrice(total, selected.length);
        const choices = [selected.map(item => `${item.qty} ${item.name}${item.preorder ? " (Pre-Order)" : ""}`).join(", "), builderAvailabilityCopy(availability)].filter(Boolean).join(" · ");
        const inventory = { kind:"fonkies", flavors:selected.map(item => ({name:item.name,inventoryKey:item.inventoryKey,qty:item.qty,preorder:item.preorder,stockState:item.stockState})), preorder, availability };
        const id = builderCartId("fonkies", inventory.flavors);
        await serializeStockQuantityMutation(async () => {
          if (stocked.length) {
            const validation = await validateStock(stocked.map(item => ({kind:"fonkies",flavor:item.name,inventoryKey:item.inventoryKey,quantity:item.qty})));
            if (!validation.ok) {
              say(stockLimitNotice(validation.error, "la caja de Fonkies"));
              return;
            }
          }
          const found = cart.find(item => builderCartItemsCanMerge(item, { id, inventory }));
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
              inventory,
              qty: 1
            });
          }
          save();
          say("Caja de Fonkies añadida a tu pedido 💜");
        });
      })());
    });

    updateBuilder();
  }

  function setupFombBuilder() {
    const builder = $(".fomb-builder");
    if (!builder) return;
    const sizeInputs = $$('input[name="fombSize"]', builder);
    const addButton = $("#addFombBox");
    const preorderAllowed = builder.dataset.preorder === "true";
    const temporaryUnavailable = builder.dataset.temporarilyUnavailable === "true";
    const unavailable = temporaryUnavailable || (builder.dataset.soldOut === "true" && !preorderAllowed);
    const rows = $$(".fomb-flavor", builder);
    let preferredSize = Number(sizeInputs.find(input => input.checked)?.value || 4);
    $("#fombIngredients div").textContent = builder.dataset.ingredients;
    const builderIntro = $(".builder-head p", builder);
    if (builderIntro) builderIntro.textContent = "Elige el tamaño, los sabores y las cantidades. Cada bombón que supere el tamaño elegido se suma automáticamente como extra. La disponibilidad se actualiza con el inventario real de Fontana.";

    function selectedFlavors() {
      return rows.map(row => ({
        name: row.dataset.flavor,
        inventoryKey: row.dataset.inventoryKey || "",
        qty: Number($("output", row).value || $("output", row).textContent || 0),
        preorder: row.dataset.stockState === "preorder",
        stockState: row.dataset.stockState || "pending"
      })).filter(item => item.qty > 0);
    }

    function selection() {
      const flavors = selectedFlavors();
      const selectedTotal = flavors.reduce((sum, item) => sum + item.qty, 0);
      const pricing = resolveFombPricing(selectedTotal, preferredSize);
      if (!pricing) return { size:4, extras:0, extraPrice:3.5, price:0, flavors, selectedTotal };
      sizeInputs.forEach(input => { input.checked = Number(input.value) === pricing.size; });
      return { ...pricing, flavors, selectedTotal, availability:selectedBuilderAvailability(flavors) };
    }

    function updateBuilder() {
      const current = selection();
      const preorder = current.flavors.some(item => item.preorder) || (builder.dataset.soldOut === "true" && preorderAllowed);
      const availability = preorder ? "preorder" : current.availability;
      const selectedUnavailable = current.flavors.find(item => item.stockState === "unavailable");
      $("#fombChoiceCount").textContent = `${current.selectedTotal} ${current.selectedTotal === 1 ? "elegido" : "elegidos"}`;
      $("#fombCount").textContent = `Has seleccionado ${current.selectedTotal} Fomb`;
      const remaining = current.size - current.selectedTotal;
      if (remaining > 0) {
        $("#fombRule").textContent = `Selecciona al menos ${current.size} bombones para tu caja.`;
        $("#fombValidation").textContent = `${remaining === 1 ? "Falta" : "Faltan"} ${remaining} ${remaining === 1 ? "bombón" : "bombones"} por elegir.`;
      } else {
        const type = current.flavors.length === 1 ? "Caja de un solo sabor" : "Caja mixta";
        const extraCopy = current.extras ? ` · ${current.size} + ${current.extras} ${current.extras === 1 ? "bombón extra" : "bombones extra"} a ${money(current.extraPrice)} c/u` : "";
        $("#fombRule").textContent = `${type}${extraCopy}.`;
        $("#fombValidation").textContent = availability === "immediate"
          ? "Hay stock real: entrega inmediata."
          : availability === "preorder"
            ? "Pre-Order: tu caja estará lista en 2 días."
            : "Disponibilidad por confirmar con Fontana.";
      }
      $("#fombTotal").textContent = money(current.price);
      addButton.disabled = remaining > 0 || unavailable || Boolean(selectedUnavailable);
      if (unavailable) {
        if (temporaryUnavailable) $("#fombValidation").textContent = "Temporalmente no disponible.";
        else $("#fombValidation").innerHTML = soldOutConsultMarkup("Fomb");
      } else if (selectedUnavailable) {
        $("#fombValidation").innerHTML = soldOutConsultMarkup(`${selectedUnavailable.name} de Fomb`);
      }
    }

    sizeInputs.forEach(input => input.addEventListener("change", () => {
      if (input.checked) preferredSize = Number(input.value);
      updateBuilder();
    }));

    const quantityController = createBuilderQuantityController({
      builder,
      rows,
      kind: "fomb",
      preorderAllowed,
      updateBuilder
    });
    $$(".fomb-flavor .fonkie-stepper button", builder).forEach(button => button.addEventListener("click", () => {
      quantityController.request(button.closest(".fomb-flavor"), Number(button.dataset.delta));
    }));

    addButton.addEventListener("click", () => {
      quantityMutationVersion += 1;
      trackQuantityCommit((async () => {
        await quantityController.whenIdle();
        const current = selection();
        if (current.selectedTotal < current.size) {
          say(`Selecciona al menos ${current.size} bombones para armar tu caja`);
          return;
        }
        const preorder = current.flavors.some(item => item.preorder) || (builder.dataset.soldOut === "true" && preorderAllowed);
        const availability = preorder ? "preorder" : current.availability;
        const stocked = current.flavors.filter(item => !item.preorder);
        const choices = [current.flavors.map(item => `${item.qty} ${item.name}${item.preorder ? " (Pre-Order)" : ""}`).join(", "), builderAvailabilityCopy(availability)].filter(Boolean).join(" · ");
        const inventory = { kind:"fomb", flavors:current.flavors.map(item => ({name:item.name,inventoryKey:item.inventoryKey,qty:item.qty,preorder:item.preorder,stockState:item.stockState})), boxSize:current.size, extraCount:current.extras, preorder, availability };
        const id = builderCartId("fomb", inventory.flavors, {
          boxSize: current.size,
          extraCount: current.extras
        });
        await serializeStockQuantityMutation(async () => {
          if (stocked.length) {
            const validation = await validateStock(stocked.map(item => ({kind:"fomb",flavor:item.name,inventoryKey:item.inventoryKey,quantity:item.qty})));
            if (!validation.ok) {
              say(stockLimitNotice(validation.error, "la caja Fomb"));
              return;
            }
          }
          const found = cart.find(item => builderCartItemsCanMerge(item, { id, inventory }));
          if (found) {
            found.qty += 1;
          } else {
            cart.push({
              id,
              productId: "fomb-box",
              name: `${preorder ? "Pre-order · " : ""}Caja de ${current.selectedTotal} Fomb · ${current.flavors.length === 1 ? "Un sabor" : "Mixta"}`,
              price: current.price,
              image: builder.dataset.image,
              ingredients: builder.dataset.ingredients,
              choices,
              inventory,
              qty: 1
            });
          }
          save();
          say("Caja Fomb añadida a tu pedido 💜");
        });
      })());
    });

    updateBuilder();
  }

  function displayedCartQuantity(item) {
    const queue = productAddQueues.get(item.id);
    return Math.max(0,
      Number(item.qty || 0)
      + Number(queue?.pending || 0)
      + Math.max(0, Number(queue?.inFlight || 0) - Number(queue?.cancelInFlight || 0))
    );
  }

  window.changeQty = (id, delta) => {
    const item = cart.find(entry => entry.id === id) || productAddQueues.get(id)?.item;
    if (!item) return;
    const change = Math.trunc(Number(delta));
    if (!Number.isFinite(change) || change === 0) return;
    if (change > 0) {
      quantityMutationVersion += 1;
      const consumesTrackedOrPendingStock = stockChecks([{...item, qty:1}]).length > 0;
      if (item.inventory?.preorder && !consumesTrackedOrPendingStock) {
        item.qty += change;
        save();
        return;
      }
      const queue = scheduleProductQueue({ id, item });
      queue.pending += change;
      syncProductQuantityControls();
      renderCart();
      return;
    }
    subtractQueuedItem(id, -change);
  };

  function renderCart() {
    const visibleCart = cart.map(item => ({ item, quantity: displayedCartQuantity(item) }));
    const visibleIds = new Set(visibleCart.map(entry => entry.item.id));
    for (const [id, queue] of productAddQueues) {
      if (visibleIds.has(id)) continue;
      const quantity = displayedCartQuantity(queue.item);
      if (quantity > 0) visibleCart.push({ item: queue.item, quantity });
    }
    const count = visibleCart.reduce((sum, entry) => sum + entry.quantity, 0);
    const total = visibleCart.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);
    $("#cartCount").textContent = count;
    $("#cartTotal").textContent = money(total);
    const blocked = visibleCart.some(entry => isElectricityBlockedCartItem(entry.item));
    $("#continueCheckout").disabled = blocked;
    cartItems.innerHTML = visibleCart.length
      ? visibleCart.map(({ item, quantity }) => `
        <div class="cart-item${isElectricityBlockedCartItem(item) ? " cart-item-unavailable" : ""}">
          <img src="${item.image}" alt="">
          <div>
            <h4>${escapeHtml(item.name)}</h4>
            <small>${money(item.price)}</small>
            ${item.choices ? `<small class="cart-choices">${escapeHtml(item.choices)}</small>` : ""}
            ${isElectricityBlockedCartItem(item) ? `<small class="cart-unavailable-copy">Temporalmente no disponible. Elimínalo para continuar.</small>` : ""}
            <div class="qty">
              <button type="button" onclick="changeQty('${item.id}',-1)" aria-label="Restar">−</button>
              <b>${quantity}</b>
              <button type="button" onclick="changeQty('${item.id}',1)" aria-label="Sumar">+</button>
            </div>
          </div>
          <button type="button" class="remove" onclick="changeQty('${item.id}',-${quantity})" aria-label="Eliminar">×</button>
        </div>`).join("")
      : `<div class="empty"><b>Tu pedido está vacío</b><span>Agrega una delicia del menú para comenzar.</span></div>`;
    syncProductQuantityControls();
  }

  function isElectricityBlockedCartItem(item) {
    if (item.inventory?.kind === "fonkies" || item.inventory?.kind === "fomb") {
      return item.inventory.availability === "unavailable";
    }
    if (item.category === "bottega" && item.inventory?.kind === "product") {
      return item.inventory.availability === "unavailable";
    }
    if (productionWithElectricity) return false;
    if (item.inventory?.kind !== "product") return false;
    const product = adminState?.products?.find(entry => entry.id === item.inventory.productId);
    return product?.requiresElectricity === true;
  }

  async function refreshAdminStateAndCart() {
    if (storefrontCatalogRefresh) return storefrontCatalogRefresh;
    storefrontCatalogRefresh = (async () => {
      const latestState = await readAdminState();
      if (!latestState || !Array.isArray(latestState.products)) return { refreshed:false, changed:false };

      // A customer may still tap a cart stepper while the catalogue request is
      // in flight. Settle that work before canonical IDs or prices are replaced.
      await flushQuantityWork();
      return serializeStockQuantityMutation(async () => {
        adminState = latestState;
        adminStateVerified = localMode || latestState.operations?.verified === true;
        productionWithElectricity = localMode
          ? latestState.settings?.productionWithElectricity !== false
          : adminStateVerified && latestState.operations?.electricityEnabled !== false;
        stockTodayOpen = latestState.settings?.stockTodayOpen !== false;

        const reconciled = reconcileCartEntries(cart);
        cart = reconciled.cart;
        if (reconciled.changed) {
          quantityMutationVersion += 1;
          localStorage.setItem(storageKey, JSON.stringify(cart));
        }
        renderCart();
        if (reconciled.changed && !checkoutForm.hidden) setupRequestedDate();
        return { refreshed:true, changed:reconciled.changed };
      });
    })();
    try {
      return await storefrontCatalogRefresh;
    } finally {
      storefrontCatalogRefresh = null;
    }
  }

  async function showCheckoutStep() {
    while (true) {
      await flushQuantityWork();
      await refreshAdminStateAndCart();
      await flushQuantityWork();
      if (!cart.length) {
        say("Primero agrega algo rico al pedido");
        return;
      }
      if (cart.some(isElectricityBlockedCartItem)) {
        say("Hay un producto temporalmente no disponible. No lo eliminamos: retíralo del carrito para continuar.");
        return;
      }
      const stableVersion = quantityMutationVersion;
      const validation = await validateStock();
      await flushQuantityWork();
      if (stableVersion !== quantityMutationVersion) continue;
      if (!validation.ok) {
        say(`${validation.error} Reduce el pedido para continuar.`);
        return;
      }
      break;
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
    if (item.category === "bottega") {
      if (item.inventory?.preorder) {
        const configured = Number(config.leadTimesByProduct?.[item.inventory?.productId || item.productId || item.id]?.minimumBusinessDays);
        return Number.isFinite(configured) && configured > 0 ? configured : null;
      }
      return item.inventory?.availability === "immediate" ? 0 : null;
    }
    if (item.inventory?.preorder) return 2;
    if (item.inventory?.kind === "fonkies" || item.inventory?.kind === "fomb") {
      return item.inventory.availability === "immediate" ? 0 : null;
    }
    const leadTime = config.leadTimesByProduct?.[item.inventory?.productId || item.productId || item.id];
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

  function checkoutScheduleItemLabel(item) {
    if (item?.inventory?.kind !== "fonkies" && item?.inventory?.kind !== "fomb") return item.name;
    const flavors = normalizedBuilderFlavorEntries(item.inventory.flavors);
    if (!flavors.length) return item.name;
    const flavorSummary = flavors.map(flavor => `${flavor.quantity} ${flavor.name}`).join(", ");
    return `${item.name} — ${flavorSummary}`;
  }

  function renderCheckoutPreparationGuide() {
    const schedule = cartScheduleGroups();
    const groups = {
      sameDay: schedule.immediate.map(checkoutScheduleItemLabel),
      prepared: schedule.prepared.map(entry => ({ name:checkoutScheduleItemLabel(entry.item), days:entry.days })),
      pending: schedule.pending.map(checkoutScheduleItemLabel)
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
    const itemMarkup = item => `<li>${item.qty}× ${escapeHtml(checkoutScheduleItemLabel(item))}</li>`;
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
      if (item.category === "beverages" || item.category === "bottega") return false;
      const productId = item.productId || item.inventory?.productId;
      const product = adminState?.products?.find(entry => entry.id === productId);
      return product?.category !== "beverages" && product?.category !== "bottega";
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
    await flushQuantityWork();
    await refreshAdminStateAndCart();
    if (cart.some(isElectricityBlockedCartItem)) {
      say("Hay un producto que ya no está disponible. Vuelve al carrito y retíralo para continuar.");
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
        if (reservation.code === "idempotency_conflict") {
          delete checkoutForm.dataset.reservationKey;
          throw new Error(reservation.error || "Actualiza los datos del pedido e inténtalo de nuevo.");
        }
        if (reservation.code === "requested_date_too_soon") throw new Error(reservation.error || "Actualiza la fecha del pedido e inténtalo de nuevo.");
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

  function catalogItemMatchesFilter(product, filter) {
    const category = product.dataset.category;
    return filter === "all"
      || (filter === "foncake" && category === "cakes")
      || (filter === "fonkies" && category === "fonkies")
      || (filter === "fomb" && category === "fomb")
      || (filter === "salado" && category === "salado")
      || (filter === "beverages" && category === "beverages")
      || (filter === "bottega" && category === "bottega")
      || (filter === "promo" && product.dataset.promo === "true")
      || (filter === "immediate" && product.dataset.immediate === "true");
  }

  function filterProducts(filter) {
    const catalogItems = $$(".product, .fonkie-builder, .builder-panel");
    catalogItems.forEach(product => {
      product.classList.toggle("hidden", !catalogItemMatchesFilter(product, filter));
    });
    const visibleCount = catalogItems.filter(product => !product.classList.contains("hidden")).length;
    const emptyState = $("#emptyFilterState");
    const emptyCopy = {
      promo: ["Promo del día", "Las promociones activas aparecerán aquí cuando Fontana las publique."],
      beverages: ["Bebidas", "Las bebidas confirmadas aparecerán aquí cuando se incorporen al menú."],
      bottega: ["Bottega", "Los productos de Bottega aparecerán aquí cuando se incorporen al catálogo."],
      immediate: ["Stock de hoy", "Los productos disponibles para entrega inmediata aparecerán aquí cada día."]
    };
    emptyState.hidden = visibleCount > 0;
    if (!visibleCount && emptyCopy[filter]) {
      $("#emptyFilterTitle").textContent = emptyCopy[filter][0];
      $("#emptyFilterMessage").textContent = emptyCopy[filter][1];
    }
    syncCatalogGroups();
  }

  const catalogImageSelector = ".product-media img, .fonkie-gallery-card img, .builder-gallery-card img";

  function waitForCatalogPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function stabilizeCatalogImage(image) {
    if (image.dataset.catalogImageStability === "true") return;
    image.dataset.catalogImageStability = "true";
    const frame = image.closest(".product-media, .fonkie-gallery-card, .builder-gallery-card");
    let revealEpoch = 0;
    const reveal = () => {
      if (!image.complete || image.naturalWidth <= 0) return;
      const epoch = ++revealEpoch;
      let decoded;
      try {
        decoded = typeof image.decode === "function" ? image.decode() : Promise.resolve();
      } catch (_error) {
        decoded = Promise.resolve();
      }
      Promise.resolve(decoded).catch(() => {}).then(() => {
        if (epoch !== revealEpoch || !image.isConnected || image.naturalWidth <= 0) return;
        // Safari can resolve decode() one paint before the texture reaches the compositor.
        requestAnimationFrame(() => {
          if (epoch !== revealEpoch || !image.isConnected) return;
          requestAnimationFrame(() => {
            if (epoch !== revealEpoch || !image.isConnected) return;
            image.classList.remove("catalog-image-pending");
            frame?.classList.remove("catalog-image-loading");
          });
        });
      });
    };
    if (!image.complete || image.naturalWidth <= 0) {
      image.classList.add("catalog-image-pending");
      frame?.classList.add("catalog-image-loading");
    }
    image.addEventListener("load", reveal);
    image.addEventListener("error", () => {
      image.classList.add("catalog-image-pending");
      frame?.classList.add("catalog-image-loading");
    });
    if (image.complete && image.naturalWidth > 0) reveal();
  }

  function setupCatalogImageStability() {
    $$(catalogImageSelector).forEach(stabilizeCatalogImage);
  }

  function waitForCatalogImage(image, timeout = 1600) {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      let timer;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve();
      };
      image.addEventListener("load", finish, { once:true });
      image.addEventListener("error", finish, { once:true });
      timer = setTimeout(finish, timeout);
    });
  }

  const catalogImageWarmPromises = new WeakMap();

  function warmCatalogImage(image) {
    if (!image?.isConnected) return Promise.resolve();
    const currentWarm = catalogImageWarmPromises.get(image);
    if (currentWarm) return currentWarm;

    const previousLoading = image.getAttribute("loading");
    const warming = (async () => {
      try {
        if (!image.complete || image.naturalWidth <= 0) image.loading = "eager";
        await waitForCatalogImage(image);
        if (!image.complete || image.naturalWidth <= 0) return;
        try {
          if (typeof image.decode === "function") await image.decode();
        } catch (_error) {}
        if (!image.isConnected || image.naturalWidth <= 0) return;
        await waitForCatalogPaint();
        if (!image.isConnected) return;
        image.classList.remove("catalog-image-pending");
        image.closest(".product-media, .fonkie-gallery-card, .builder-gallery-card")?.classList.remove("catalog-image-loading");
      } finally {
        if (previousLoading) image.setAttribute("loading", previousLoading);
        else image.removeAttribute("loading");
        catalogImageWarmPromises.delete(image);
      }
    })();
    catalogImageWarmPromises.set(image, warming);
    return warming;
  }

  async function warmCatalogFilter(filter) {
    // Prioritize only the first viewport for the selected category. This keeps
    // its placeholder stable without bringing back full-catalog eager loading.
    const compactImages = [];
    const selector = ".product-front .product-media img, .fonkie-gallery-track .fonkie-gallery-card img, .builder-gallery-track .builder-gallery-card img";
    $$(".product, .fonkie-builder, .builder-panel")
      .filter(item => catalogItemMatchesFilter(item, filter))
      .forEach(item => {
        $$(selector, item).forEach(image => {
          if (!compactImages.includes(image)) compactImages.push(image);
        });
      });
    const warmLimit = innerWidth <= 640 ? 2 : innerWidth <= 960 ? 3 : 4;
    await Promise.all(compactImages.slice(0, warmLimit).map(warmCatalogImage));
  }

  function centerCatalogFilter(button) {
    const rail = button.closest(".filters");
    if (!rail) return;
    const railRect = rail.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    rail.scrollBy({
      left:buttonRect.left - railRect.left - ((railRect.width - buttonRect.width) / 2),
      behavior:"smooth"
    });
  }

  applyAdminCatalog();
  applyAdminBuilders();
  renderDynamicCatalog();
  setupCatalogGroups();
  setupCatalogImageStability();
  const stockTodayFilter = $('.filter[data-filter="immediate"]');
  if (stockTodayFilter && !stockTodayOpen) stockTodayFilter.hidden = true;
  setupProductQuantityControls();
  let catalogFilterEpoch = 0;
  $$(".filter").forEach(button => {
    button.addEventListener("click", async () => {
      centerCatalogFilter(button);
      if (button.classList.contains("active")) {
        return;
      }
      const epoch = ++catalogFilterEpoch;
      $$(".filter").forEach(item => item.removeAttribute("aria-busy"));
      button.setAttribute("aria-busy", "true");
      const warming = warmCatalogFilter(button.dataset.filter);
      $$(".filter").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      filterProducts(button.dataset.filter);
      await warming;
      if (epoch !== catalogFilterEpoch) return;
      button.removeAttribute("aria-busy");
    });
  });

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
    let observer;
    const reveal = () => {
      if (intro.classList.contains("menu-intro-visible")) return;
      intro.classList.add("menu-intro-visible");
      section?.classList.add("menu-entry-visible");
      observer?.disconnect();
    };
    if (typeof window.IntersectionObserver !== "function") {
      reveal();
      return;
    }
    observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      reveal();
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
    observer.observe(intro);
  }

  function setupHeroLeafMotion() {
    const leaves = $(".hero-logo-leaves");
    const mark = leaves?.closest(".hero-logo-mark");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!leaves || !mark || !reducedMotion || typeof leaves.pauseAnimations !== "function") return;
    let intersectsViewport = true;
    const syncMotion = () => {
      const shouldPause = reducedMotion.matches || document.hidden || !intersectsViewport;
      mark.classList.toggle("hero-motion-paused", shouldPause);
      if (shouldPause) leaves.pauseAnimations();
      else leaves.unpauseAnimations();
    };
    syncMotion();
    reducedMotion.addEventListener?.("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    if (typeof window.IntersectionObserver === "function") {
      const observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        intersectsViewport = entry.isIntersecting;
        syncMotion();
      }, { threshold: 0 });
      observer.observe(mark);
    }
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
  setupProductCardFlips();
  storefrontReady = true;
  pendingProductOpens.forEach((usesProductId, id) => {
    const attribute = usesProductId ? "data-product-id" : "data-id";
    document.querySelector(`[${attribute}="${CSS.escape(id)}"] .product-media`)?.click();
  });
  pendingProductOpens.clear();
  setupFonkieBuilder();
  setupFombBuilder();
  setupInfiniteFlavorGalleries();
  setupBuilderFlavorCardFlips();
  setupFitDialog();
  setupHeroLeafMotion();
  setupTestimonialsCarousel();
  populateOptions();
  toggleAddress();
  renderCart();
  if (catalogHydrationScrollAnchor) {
    const hydrationInputController = new AbortController();
    let hydrationInterruptedByCustomer = false;
    const markHydrationInterrupted = () => { hydrationInterruptedByCustomer = true; };
    ["wheel", "touchmove", "pointerdown", "keydown"].forEach(type => {
      document.addEventListener(type, markHydrationInterrupted, {
        capture: true,
        passive: true,
        signal: hydrationInputController.signal
      });
    });
    syncProductCardHeights();
    restoreCatalogHydrationScrollAnchor(catalogHydrationScrollAnchor);
    Promise.resolve(document.fonts?.ready).catch(() => {}).then(() => {
      requestAnimationFrame(() => {
        try {
          // Font metrics can change several product rows after the API swap.
          // A synchronous height measurement can also make Chrome clamp the
          // scroll offset for one frame. Correct both cases unless real input
          // shows that the customer deliberately moved in the meantime.
          if (!hydrationInterruptedByCustomer) {
            syncProductCardHeights();
            restoreCatalogHydrationScrollAnchor(catalogHydrationScrollAnchor);
          }
        } finally {
          // Keep native anchoring disabled across at least one painted frame.
          // Restoring it in the mutation task makes the browser apply a second,
          // delayed correction on top of the explicit one above.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              hydrationInputController.abort();
              releaseCatalogHydrationScrollAnchor(catalogHydrationScrollAnchor);
            });
          });
        }
      });
    });
  }
})();
