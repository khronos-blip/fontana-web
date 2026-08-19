(() => {
  "use strict";

  const config = window.FONTANA_CONFIG || {};
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
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
      const soldOut = product.status === "sold-out";
      const description = String(product.description || "Disponibilidad sujeta a confirmación por WhatsApp.");
      const ingredients = String(product.ingredients || "Ingredientes pendientes de confirmar con Fontana");
      const badge = soldOut ? "AGOTADO" : product.promo ? "PROMOCIÓN DEL DÍA" : product.immediate ? "ENTREGA INMEDIATA" : category === "beverages" ? "BEBIDA" : String(product.availabilityLabel || "DISPONIBLE");
      const image = product.image
        ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(name)}">`
        : `<div class="product-placeholder"><div><b>${escapeHtml(name)}</b><small>Foto por actualizar</small></div></div>`;
      const priceCopy = hasPrice ? money(price) : "Por confirmar";
      const classes = ["product", soldOut ? "product-sold-out" : "", hasPrice ? "" : "product-unpriced"].filter(Boolean).join(" ");
      const cartImage = product.image || "assets/logo.png";
      return `<article class="${classes}" data-category="${category}" data-id="${escapeHtml(id)}" data-product-id="${escapeHtml(productId)}" data-name="${escapeHtml(name)}" data-price="${hasPrice ? price : ""}" data-image="${escapeHtml(cartImage)}" data-ingredients="${escapeHtml(ingredients)}" data-promo="${Boolean(product.promo)}" data-immediate="${Boolean(product.immediate)}" data-sold-out="${soldOut}"><div class="product-media">${image}<span class="product-tag">${badge}</span></div><div class="product-body"><div class="product-top"><h3>${escapeHtml(name)}</h3><span class="price">${priceCopy}</span></div><p>${escapeHtml(description)}</p><div class="product-footer"><span class="diet">${escapeHtml(String(product.weight || badge))}</span>${hasPrice && !soldOut ? `<button class="add" aria-label="Agregar ${escapeHtml(name)}">+</button>` : ""}</div></div></article>`;
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
    const id = card.dataset.id;
    const found = cart.find(item => item.id === id);
    if (found) {
      found.qty += 1;
    } else {
      cart.push({
        id,
        productId: card.dataset.productId || id,
        name: card.dataset.name,
        price: Number(card.dataset.price),
        image: card.dataset.image,
        ingredients: productIngredients(id),
        qty: 1
      });
    }
    save();
    say("Añadido a tu pedido 💜");
  }

  function fonkiePrice(total, flavorCount) {
    if (total < 4) return 0;
    const base = flavorCount === 1 ? 15 : 17;
    return base + Math.max(0, total - 4) * 3.5;
  }

  function setupFonkieBuilder() {
    const builder = $(".fonkie-builder");
    if (!builder) return;
    const rows = $$(".fonkie-flavor", builder);
    const addButton = $("#addFonkieBox");
    $("#fonkieIngredients div").textContent = builder.dataset.ingredients;

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
      addButton.disabled = total < 4;
      if (total < 4) {
        $("#fonkiePriceRule").textContent = "Selecciona al menos 4 para armar tu caja.";
        $("#fonkieValidation").textContent = "Mínimo 4 galletas para armar tu caja.";
      } else {
        const type = selected.length === 1 ? "Caja de un solo sabor" : "Caja mixta";
        const extras = total - 4;
        $("#fonkiePriceRule").textContent = `${type}${extras ? ` + ${extras} extra${extras === 1 ? "" : "s"} a $3,50` : ""}.`;
        $("#fonkieValidation").textContent = "Tu caja está lista para agregar al carrito.";
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
      if (total < 4) {
        say("Mínimo 4 galletas para armar tu caja");
        return;
      }
      const price = fonkiePrice(total, selected.length);
      const choices = selected.map(item => `${item.qty} ${item.name}`).join(", ");
      const id = `fonkie-box-${rows.map(row => Number($("output", row).value || 0)).join("-")}`;
      const found = cart.find(item => item.id === id);
      if (found) {
        found.qty += 1;
      } else {
        cart.push({
          id,
          productId: "fonkie-box",
          name: `Caja de ${total} Fonkies · ${selected.length === 1 ? "Un sabor" : "Mixta"}`,
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
    let extras = 0;
    $("#fombIngredients div").textContent = builder.dataset.ingredients;

    function selection() {
      const size = Number(sizeInputs.find(input => input.checked)?.value || 4);
      const basePrice = size === 12 ? 30 : 15;
      return { size, total: size + extras, price: basePrice + extras * 3.5 };
    }

    function updateBuilder() {
      const current = selection();
      extrasOutput.value = String(extras);
      extrasOutput.textContent = String(extras);
      $("#fombCount").textContent = `Caja de ${current.total} Fomb`;
      $("#fombRule").textContent = extras
        ? `Caja de ${current.size} + ${extras} extra${extras === 1 ? "" : "s"}. Sabores por WhatsApp.`
        : "Sabores a elección por WhatsApp.";
      $("#fombTotal").textContent = money(current.price);
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

    addButton.addEventListener("click", () => {
      const current = selection();
      const id = `fomb-box-${current.size}-${extras}`;
      const found = cart.find(item => item.id === id);
      if (found) {
        found.qty += 1;
      } else {
        cart.push({
          id,
          productId: "fomb-box",
          name: `Caja de ${current.total} Fomb`,
          price: current.price,
          image: builder.dataset.image,
          ingredients: builder.dataset.ingredients,
          choices: `Caja base de ${current.size}${extras ? ` + ${extras} extra${extras === 1 ? "" : "s"}` : ""}; sabores por confirmar`,
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
    if (input.value && input.value < input.min) input.value = "";

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
      `Alergias o intolerancias: ${hasAllergies ? allergyList.join(", ") : "No indica"}`,
      hasAllergies ? "*⚠️ INSTRUCCIONES POR PRODUCTO*" : "",
      ...itemAllergyLines,
      hasAllergies ? "*Estado: PENDIENTE DE REVISIÓN POR FONTANA*" : "Estado: pendiente de confirmación",
      data.get("notes") ? `Observaciones: ${data.get("notes")}` : "",
      "",
      "Enviaré el comprobante por este chat. El pedido se confirma únicamente cuando Fontana valide disponibilidad, pago y, si aplica, la solicitud de alergias."
    ].filter(Boolean).join("\n");
    return { message, orderId };
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!checkoutForm.reportValidity()) return;
    const formData = new FormData(checkoutForm);
    if (formData.get("hasAllergies") === "yes" && !formData.getAll("allergens").length && !String(formData.get("otherAllergy") || "").trim()) {
      say("Indica al menos una alergia o intolerancia");
      $("#otherAllergy").focus();
      return;
    }
    const { message, orderId } = buildMessage(checkoutForm);
    const whatsappNumber = String(config.whatsappNumber || "").replace(/\D/g, "");

    if (config.previewMode || !whatsappNumber) {
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
      immediate: ["Entrega inmediata", "Los productos disponibles para entrega inmediata aparecerán aquí cada día."]
    };
    emptyState.hidden = visibleCount > 0;
    if (!visibleCount && emptyCopy[filter]) {
      $("#emptyFilterTitle").textContent = emptyCopy[filter][0];
      $("#emptyFilterMessage").textContent = emptyCopy[filter][1];
    }
    syncCatalogGroups();
  }

  renderDynamicCatalog();
  setupCatalogGroups();
  $$(".add").forEach(button => button.addEventListener("click", () => addProduct(button.closest(".product"))));
  $$(".filter").forEach(button => button.addEventListener("click", () => {
    $$(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    filterProducts(button.dataset.filter);
  }));

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

  enhanceProductSafety();
  setupFonkieBuilder();
  setupFombBuilder();
  populateOptions();
  toggleAddress();
  renderCart();
})();
