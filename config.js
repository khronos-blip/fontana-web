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
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
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
      ingredients: "Ingredientes pendientes de confirmar con Fontana.",
      weight: "MINI CAKE",
      availabilityLabel: "POR ENCARGO · 1–2 DÍAS",
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
      status: "available"
    },
    {
      id: "raviolis",
      category: "salado",
      name: "Raviolis",
      price: 15,
      image: "assets/ravioli-fontana-pro.jpg",
      description: "Raviolis congelados, listos para preparar en air fryer u horno, con relleno a elección.",
      ingredients: "Masa de harina de arroz, harina de yuca, maicena, huevo, aceite de oliva y sal. Relleno de ricotta de cabra y espinaca o carne.",
      weight: "180 G / 300 G",
      availabilityLabel: "CONGELADO · STOCK O ENCARGO",
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
      status: "available"
    },
    {
      id: "agua-minalba-600",
      category: "beverages",
      name: "Agua Minalba 600 ml",
      price: 2.5,
      image: "assets/beverage-minalba-600-fontana-pro.jpg",
      description: "Agua refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Minalba.",
      weight: "600 ML",
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
      price: 3,
      image: "assets/beverage-tevia-durazno-fontana-pro.jpg",
      description: "Bebida de durazno refrigerada para pickup o delivery.",
      ingredients: "Producto comercial Tevia.",
      weight: "1,5 L",
      immediate: true,
      status: "available"
    },
    {
      id: "san-pellegrino",
      category: "beverages",
      name: "Sanpellegrino Melograno & Arancia",
      price: 5,
      image: "assets/beverage-sanpellegrino-fontana-pro.jpg",
      description: "Bebida refrigerada para pickup o delivery.",
      ingredients: "Producto comercial San Pellegrino.",
      weight: "330 ML",
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
    "tentacion-coco": { minimumBusinessDays: 1, label: "Tortas: 1–2 días de anticipación" },
    "crumbl-blueberry": { minimumBusinessDays: 1, label: "Tortas: 1–2 días de anticipación" },
    "brownie-fit": { minimumBusinessDays: 1, label: "Tortas: 1–2 días de anticipación" },
    "mini-cake": { minimumBusinessDays: 1, label: "Tortas: 1–2 días de anticipación" },
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
