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
  // Catálogo editable. Hasta aprobar un panel privado, este archivo es la
  // fuente segura para activar promociones, marcar entrega inmediata o agotado.
  // status: "available" | "sold-out". promo/immediate aceptan true/false.
  dynamicCatalog: [
    {
      id: "ballerine",
      category: "cakes",
      name: "Torta Ballerine",
      price: 12,
      image: "assets/ballerine-fontana-pro.jpg",
      description: "Individual para 1–2 personas (180 g aprox.). Base y topping a elección por WhatsApp.",
      ingredients: "Base vainilla: harina de almendra, monkfruit, huevo, leche sin lactosa y aceite de coco. Base chocolate: los mismos ingredientes más cacao.",
      weight: "180 G APROX.",
      availabilityLabel: "POR ENCARGO · 1–2 DÍAS",
      status: "available"
    },
    {
      id: "tentacion-coco",
      category: "cakes",
      name: "Torta de Tentación de Coco",
      price: null,
      image: "assets/tentacion-coco-fontana-pro.jpg",
      description: "Nueva creación Fontana. Precio y presentación pendientes de confirmación.",
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
      weight: "PRECIO POR CONFIRMAR",
      status: "available"
    },
    {
      id: "brownie-fit",
      category: "cakes",
      name: "Brownie Fit",
      price: null,
      image: "assets/brownie-fit-fontana-pro.jpg",
      description: "Brownie Fontana. Precio y presentación pendientes de confirmación.",
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
      weight: "PRECIO POR CONFIRMAR",
      status: "available"
    },
    {
      id: "mini-cake",
      category: "cakes",
      name: "Mini Cake",
      price: null,
      image: "assets/mini-cake-fontana-pro.jpg",
      description: "Sabor a elección. Precio y presentación pendientes de confirmación.",
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
      weight: "PRECIO POR CONFIRMAR",
      status: "available"
    },
    {
      id: "cachito-fit",
      category: "salado",
      name: "Cachito Fit · Paquete de 3",
      price: 15,
      image: "assets/cachito-fit-fontana-pro.jpg",
      description: "Tres cachitos sin gluten, congelados y disponibles por stock o encargo.",
      ingredients: "Harina de arroz, harina de yuca, ghee, huevo, leche sin lactosa, jamón sin gluten y psyllium.",
      weight: "3 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      status: "available"
    },
    {
      id: "panzerottis",
      category: "salado",
      name: "Panzerottis · Paquete de 3",
      price: 12,
      image: "assets/panzerottis-fontana-pro.jpg",
      description: "Relleno a elección por WhatsApp: ricotta y espinaca, carne o mozzarella con salsa y pecorino.",
      ingredients: "Harina de garbanzo, harina de papa, 20 % maicena, huevo y aceite de oliva. Rellenos: ricotta de cabra y espinaca; carne; mozzarella, salsa y pecorino.",
      weight: "3 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      status: "available"
    },
    {
      id: "tequenos-fit",
      category: "salado",
      name: "Tequeños Fit",
      price: 12,
      image: "assets/tequenos-fit-fontana-pro.jpg",
      description: "Doce tequeños de queso de búfala, congelados.",
      ingredients: "Harina de yuca, maicena, huevo, aceite de oliva, sal y queso de búfala.",
      weight: "12 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      status: "available"
    },
    {
      id: "raviolis",
      category: "salado",
      name: "Raviolis",
      price: 20,
      image: "assets/ravioli-fontana-pro.jpg",
      description: "Relleno a elección por WhatsApp: ricotta de cabra y espinaca o carne.",
      ingredients: "Masa de harina de arroz, harina de yuca, maicena, huevo, aceite de oliva y sal. Relleno de ricotta de cabra y espinaca o carne.",
      weight: "300 G",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      status: "available"
    },
    {
      id: "nuggets-rora",
      category: "salado",
      name: "Nuggets Rora",
      price: 13,
      image: null,
      description: "Caja de veinte nuggets congelados, marca Rora.",
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
      weight: "20 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      status: "available"
    },
    {
      id: "agua-minalba-355",
      category: "beverages",
      name: "Agua Minalba 355 ml",
      price: 2.5,
      image: null,
      description: "Agua refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Minalba.",
      weight: "355 ML",
      availabilityLabel: "REFRIGERADA",
      immediate: true,
      status: "available"
    },
    {
      id: "agua-gasificada-minalba",
      category: "beverages",
      name: "Agua Gasificada Minalba",
      price: 3,
      image: null,
      description: "Agua gasificada refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Minalba.",
      weight: "REFRIGERADA",
      immediate: true,
      status: "available"
    },
    {
      id: "tevia-durazno",
      category: "beverages",
      name: "Tevia de Durazno",
      price: 3,
      image: null,
      description: "Bebida de durazno refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Tevia.",
      weight: "REFRIGERADA",
      immediate: true,
      status: "available"
    },
    {
      id: "san-pellegrino",
      category: "beverages",
      name: "San Pellegrino",
      price: 5,
      image: null,
      description: "Bebida refrigerada para pickup o delivery.",
      ingredients: "Producto comercial San Pellegrino.",
      weight: "REFRIGERADA",
      immediate: true,
      status: "available"
    }
  ],
  leadTimesByProduct: {
    pistacho: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    naranja: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    zanahoria: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    "pistacho-clasico": { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    chocolate: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    vainilla: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    lemon: { minimumBusinessDays: 1, label: "Tortas: 1–2 días hábiles" },
    ballerine: { minimumBusinessDays: 1, label: "Ballerine: 1–2 días de anticipación" },
    fonkie: { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "fonkie-mix": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "fonkie-box": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "fomb-box": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    bombones: { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "bombones-12": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "pasta-ricotta": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "pasta-carne": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "cachito-fit": { minimumBusinessDays: 0, label: "Salados: disponibles por stock o encargo" },
    panzerottis: { minimumBusinessDays: 0, label: "Salados: disponibles por stock o encargo" },
    "tequenos-fit": { minimumBusinessDays: 0, label: "Salados: disponibles por stock o encargo" },
    raviolis: { minimumBusinessDays: 0, label: "Salados: disponibles por stock o encargo" },
    "nuggets-rora": { minimumBusinessDays: 0, label: "Salados: disponibles por stock o encargo" }
  },
  paymentMethods: [
    "Pago Móvil",
    "Zelle",
    "Binance",
    "Efectivo en dólares"
  ]
};
