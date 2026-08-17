/*
 * Configuración operativa de Fontana.
 * Al cerrar el proyecto solo hay que sustituir estos valores y publicar.
 * whatsappNumber: código de país + número, únicamente dígitos. Ej: 584121234567.
 */
window.FONTANA_CONFIG = {
  businessName: "Fontana",
  whatsappNumber: "",
  orderPrefix: "FNT",
  currency: "USD",
  locale: "es-VE",
  previewMode: true,
  pickupLabel: "Pickup en Mañongo",
  deliveryLabel: "Delivery en Valencia",
  // Días mínimos de anticipación por id de producto.
  // Se completan cuando Fontana confirme los tiempos reales de cada receta.
  leadDaysByProduct: {},
  paymentMethods: [
    "Pago Móvil",
    "Zelle",
    "Transferencia bancaria",
    "Efectivo al retirar"
  ]
};
