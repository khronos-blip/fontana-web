/*
 * Configuración operativa de Fontana.
 * Al cerrar el proyecto solo hay que sustituir estos valores y publicar.
 * whatsappNumber: código de país + número, únicamente dígitos. Ej: 584121234567.
 */
window.FONTANA_CONFIG = {
  businessName: "Fontana sin gluten",
  whatsappNumber: "584244350800",
  orderPrefix: "FNT",
  currency: "USD",
  locale: "es-VE",
  previewMode: false,
  pickupLabel: "Pickup en Mañongo (detalles por WhatsApp)",
  deliveryLabel: "Delivery en todo Carabobo (costo confirmado por WhatsApp)",
  leadTimesByProduct: {
    pistacho: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    chocolate: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    lemon: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    fonkie: { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    trufa: { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    tortellone: { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" }
  },
  paymentMethods: [
    "Pago Móvil",
    "Zelle",
    "Binance",
    "Efectivo en dólares"
  ]
};
