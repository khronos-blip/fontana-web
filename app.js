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
        name: card.dataset.name,
        price: Number(card.dataset.price),
        image: card.dataset.image,
        qty: 1
      });
    }
    save();
    say("Añadido a tu pedido 💜");
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
            <h4>${item.name}</h4>
            <small>${money(item.price)}</small>
            <div class="qty">
              <button type="button" onclick="changeQty('${item.id}',-1)" aria-label="Restar">−</button>
              <b>${item.qty}</b>
              <button type="button" onclick="changeQty('${item.id}',1)" aria-label="Sumar">+</button>
            </div>
          </div>
          <button type="button" class="remove" onclick="changeQty('${item.id}',-${item.qty})" aria-label="Eliminar">×</button>
        </div>`).join("")
      : `<div class="empty"><div class="empty-icon">🧁</div><b>Tu pedido está vacío</b><span>Agrega una delicia del menú para comenzar.</span></div>`;
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
    const fulfillment = data.get("fulfillment") === "delivery"
      ? (config.deliveryLabel || "Delivery")
      : (config.pickupLabel || "Pickup");
    const lines = cart.map(item => `• ${item.qty}× ${item.name} — ${money(item.price * item.qty)}`);
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
      `Fecha solicitada: ${data.get("requestedDate")}`,
      `Franja horaria solicitada: ${data.get("requestedTime")}`,
      `Forma de pago: ${data.get("payment")}`,
      `Alergias o intolerancias: ${hasAllergies ? allergyList.join(", ") : "No indica"}`,
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

  $$(".add").forEach(button => button.addEventListener("click", () => addProduct(button.closest(".product"))));
  $$(".filter").forEach(button => button.addEventListener("click", () => {
    $$(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    $$(".product").forEach(product => {
      const filter = button.dataset.filter;
      const category = product.dataset.category;
      const matches = filter === "all" || category === filter || (filter === "dulce" && ["cakes", "snacks"].includes(category));
      product.classList.toggle("hidden", !matches);
    });
  }));

  function toggleAllergyDetails() {
    const hasAllergies = checkoutForm.elements.hasAllergies.value === "yes";
    $("#allergyDetails").hidden = !hasAllergies;
    $("#allergyStatus").hidden = !hasAllergies;
  }

  $("#cartButton").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#continueCheckout").addEventListener("click", showCheckoutStep);
  backToCart.addEventListener("click", showCartStep);
  backdrop.addEventListener("click", closeCart);
  checkoutForm.addEventListener("submit", submitOrder);
  $("#fulfillment").addEventListener("change", toggleAddress);
  $$('input[name="hasAllergies"]').forEach(input => input.addEventListener("change", toggleAllergyDetails));
  $("#menuButton").addEventListener("click", () => { window.location.hash = "menu"; });
  document.addEventListener("keydown", event => event.key === "Escape" && closeCart());
  populateOptions();
  toggleAddress();
  renderCart();
})();
