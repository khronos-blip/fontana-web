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
  adminApiBase: "https://api.fontanasingluten.com",
  catalogApiTimeoutMs: 5000,
  pickupLabel: "Pickup en Mañongo (detalles por WhatsApp)",
  deliveryLabel: "Delivery en todo Carabobo (costo confirmado por WhatsApp)",
  // Catálogo editable. Hasta aprobar un panel privado, este archivo es la
  // fuente segura para activar promociones, marcar entrega inmediata o agotado.
  // status: "available" | "sold-out". promo/immediate aceptan true/false.
  // variants permite controlar cada sabor por separado con el mismo status.
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
      price: 47,
      image: "assets/tentacion-coco-fontana-pro.jpg",
      description: "Torta de coco con crema de coco y glaseado vegano sin azúcar.",
      ingredients: "Harina de almendra, monkfruit, aceite de coco, huevo, crema de coco, coco rallado y glaseado vegano sin azúcar.",
      weight: "TORTA COMPLETA",
      availabilityLabel: "POR ENCARGO · 1–2 DÍAS",
      status: "available"
    },
    {
      id: "crumbl-blueberry",
      category: "cakes",
      name: "Torta de Crumbl de Blueberry",
      price: 47,
      image: "assets/blueberry-fontana-v2.jpg",
      description: "Torta de blueberry con glaseado vegano y crumbl.",
      ingredients: "Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, blueberry, alulosa y glaseado vegano.",
      weight: "TORTA COMPLETA",
      availabilityLabel: "POR ENCARGO · 1–2 DÍAS",
      status: "available"
    },
    {
      id: "brownie-fit",
      category: "cakes",
      name: "Torta de Brownie Fit",
      price: 38,
      image: "assets/brownie-fit-fontana-pro.jpg",
      description: "Torta completa de brownie Fontana.",
      ingredients: "Harina de almendra, cacao, aceite de coco, alulosa, monkfruit, chispas de chocolate vegano, huevo, sal Maldon y harina de yuca (5 %).",
      weight: "TORTA COMPLETA",
      availabilityLabel: "POR ENCARGO · 1–2 DÍAS",
      status: "available"
    },
    {
      id: "mini-cake",
      category: "cakes",
      name: "Mini Cake",
      price: 20,
      image: "assets/mini-cake-fontana-pro.jpg",
      description: "Mini cake de sabor a elección, sujeto a confirmación por WhatsApp.",
      ingredients: "Base vainilla: harina de almendra, monkfruit, huevo, leche sin lactosa y aceite de coco. Base chocolate: los mismos ingredientes más cacao.",
      weight: "MINI CAKE",
      availabilityLabel: "POR ENCARGO · 1–2 DÍAS",
      status: "available"
    },
    {
      id: "layer-cake",
      category: "cakes",
      name: "Layer Cake · Torta en capas",
      price: null,
      image: "assets/layer-cake-fontana-pro.webp",
      description: "Torta personalizada en capas. El sabor y el presupuesto se coordinan directamente por WhatsApp.",
      ingredients: "",
      weight: "PERSONALIZADA",
      availabilityLabel: "SABOR Y PRESUPUESTO POR WHATSAPP",
      status: "available"
    },
    {
      id: "torta-personalizada",
      category: "cakes",
      name: "Torta completa personalizada",
      price: null,
      image: "assets/torta-personalizada-fontana-pro-v2.jpg",
      description: "Torta completa personalizada. El sabor y el presupuesto se coordinan directamente por WhatsApp.",
      ingredients: "",
      weight: "PERSONALIZADA",
      availabilityLabel: "SABOR Y PRESUPUESTO POR WHATSAPP",
      status: "available"
    },
    {
      id: "cachito-fit",
      category: "salado",
      name: "Cachito Fit · Paquete de 3",
      price: 15,
      image: "assets/cachito-fit-fontana-pro.jpg",
      description: "Tres cachitos congelados, listos para preparar en air fryer u horno.",
      ingredients: "Harina de arroz, harina de yuca, ghee, huevo, leche sin lactosa, jamón sin gluten y psyllium.",
      weight: "3 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      allowPreorder: true,
      status: "available"
    },
    {
      id: "panzerottis",
      category: "salado",
      name: "Panzerottis · Paquete de 3",
      price: 12,
      image: "assets/panzerottis-fontana-pro.jpg",
      description: "Paquete de tres congelados, listos para preparar en air fryer u horno, con relleno a elección.",
      ingredients: "Harina de garbanzo, harina de papa, 20 % maicena, huevo y aceite de oliva. Rellenos: ricotta de cabra y espinaca; carne; mozzarella, salsa y pecorino.",
      weight: "3 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      allowPreorder: true,
      variantLabel: "Elige el relleno",
      variants: [
        { name: "Carne", status: "available" },
        { name: "Ricotta de cabra y espinaca", status: "available" },
        { name: "Mozzarella, salsa y pecorino", status: "available" }
      ],
      status: "available"
    },
    {
      id: "tequenos-fit",
      category: "salado",
      name: "Tequeños Fit",
      price: 12,
      image: "assets/tequenos-fit-fontana-pro.jpg",
      description: "Doce tequeños congelados, listos para preparar en air fryer u horno.",
      ingredients: "Harina de yuca, maicena, huevo, aceite de oliva, sal y queso de búfala.",
      weight: "12 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      allowPreorder: true,
      status: "available"
    },
    {
      id: "raviolis",
      category: "salado",
      name: "Raviolis",
      price: 15,
      image: "assets/ravioli-fontana-pro.jpg",
      description: "Raviolis congelados con relleno a elección. Cocinar durante 6 minutos en agua hirviendo.",
      ingredients: "Masa de harina de arroz, harina de yuca, maicena, huevo, aceite de oliva y sal. Relleno de ricotta de cabra y espinaca o carne.",
      weight: "180 G / 300 G",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      allowPreorder: true,
      sizeLabel: "Elige la presentación",
      sizes: [
        { name: "180 g", price: 15, status: "available" },
        { name: "300 g", price: 20, status: "available" }
      ],
      variantLabel: "Elige el relleno",
      variants: [
        { name: "Carne", status: "available" },
        { name: "Ricotta de cabra y espinaca", status: "available" }
      ],
      status: "available"
    },
    {
      id: "nuggets-rora",
      category: "salado",
      name: "Nuggets Rora",
      price: 13,
      image: "assets/nuggets-rora-fontana-pro.jpg",
      description: "Caja de veinte nuggets congelados, listos para preparar en air fryer u horno, marca Rora.",
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
      weight: "20 UNIDADES",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
      allowPreorder: true,
      status: "available"
    },
    {
      id: "agua-minalba-600",
      category: "beverages",
      name: "Agua mineral Minalba 355 ml",
      price: 2.5,
      image: "assets/beverage-minalba-600-fontana-pro.jpg",
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
      name: "Agua Gasificada Minalba Limón",
      price: 3,
      image: "assets/beverage-minalba-limon-fontana-pro.jpg",
      description: "Agua gasificada refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Minalba.",
      weight: "500 ML",
      immediate: true,
      status: "available"
    },
    {
      id: "tevia-durazno",
      category: "beverages",
      name: "Tevia de Durazno",
      price: 4,
      image: "assets/beverage-tevia-durazno-fontana-pro.jpg",
      description: "Bebida de durazno refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Tevia.",
      weight: "360 ML",
      immediate: true,
      status: "available"
    },
    {
      id: "san-pellegrino",
      category: "beverages",
      name: "Sanpellegrino Melograno & Arancia",
      price: 7,
      image: "assets/beverage-sanpellegrino-fontana-pro.jpg",
      description: "Bebida refrigerada para pickup o delivery.",
      ingredients: "Producto comercial San Pellegrino.",
      weight: "330 ML",
      immediate: true,
      status: "available"
    }
  ],
  leadTimesByProduct: {
    pistacho: { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    naranja: { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    zanahoria: { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    "pistacho-clasico": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    chocolate: { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    vainilla: { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    lemon: { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    ballerine: { minimumBusinessDays: 2, label: "Ballerine: mínimo 2 días de anticipación" },
    "tentacion-coco": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    "crumbl-blueberry": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    "brownie-fit": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    "mini-cake": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    "layer-cake": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    "torta-personalizada": { minimumBusinessDays: 2, label: "Tortas: mínimo 2 días de anticipación" },
    fonkie: { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "fonkie-mix": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "fonkie-box": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "fomb-box": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    bombones: { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "bombones-12": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "pasta-ricotta": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "pasta-carne": { minimumBusinessDays: 0, label: "Disponible por stock; pedidos especiales o personalizados: 2–3 días hábiles" },
    "cachito-fit": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    panzerottis: { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "tequenos-fit": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    raviolis: { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "nuggets-rora": { minimumBusinessDays: 0, label: "Stock activo: disponibilidad inmediata. Sin stock: Pre-Order de 2 días hábiles" },
    "agua-minalba-600": { minimumBusinessDays: 0, label: "Bebidas: disponibles para el mismo día según stock" },
    "agua-minalba-limon": { minimumBusinessDays: 0, label: "Bebidas: disponibles para el mismo día según stock" },
    "tevia-durazno": { minimumBusinessDays: 0, label: "Bebidas: disponibles para el mismo día según stock" },
    sanpellegrino: { minimumBusinessDays: 0, label: "Bebidas: disponibles para el mismo día según stock" }
  },
  paymentMethods: [
    "Pago Móvil",
    "Zelle",
    "Binance",
    "Efectivo en dólares"
  ]
};
