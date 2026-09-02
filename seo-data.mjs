export const site = {
  origin: "https://fontanasingluten.com",
  name: "Fontana sin gluten",
  shortName: "Fontana",
  locale: "es-VE",
  currency: "USD",
  displayCurrency: "REF",
  telephone: "+58 424-4350800",
  whatsapp: "584244350800",
  instagram: "https://www.instagram.com/fontanasingluten/",
  logo: "/assets/fontana-seal-transparent.png",
  defaultImage: "/assets/pistachio-raspberry-fontana-v2.jpg",
  defaultSocialImage: "/assets/fontana-og-share.jpg"
};

export const categoryPages = [
  {
    id: "cakes",
    slug: "tortas-sin-gluten-carabobo",
    navName: "Tortas",
    title: "Tortas sin gluten en Carabobo",
    description: "Tortas sin gluten, sin azúcar refinada y sin lactosa de Fontana. Consulta sabores, tamaños y pedidos con pickup en Mañongo o delivery en Carabobo.",
    eyebrow: "Foncakes",
    intro: "Tortas completas, mini cakes y opciones personalizadas elaboradas por encargo. Revisa cada sabor, sus ingredientes y el tiempo de preparación antes de armar tu pedido.",
    detail: "Las tortas publicadas requieren anticipación y su disponibilidad final se confirma directamente con Fontana por WhatsApp."
  },
  {
    id: "fonkies",
    slug: "fonkies-galletas-sin-gluten",
    navName: "Fonkies",
    title: "Fonkies · Galletas sin gluten",
    description: "Arma una caja de Fonkies sin gluten, sin azúcar refinada y sin lactosa. Elige sabores y cantidades con pickup en Mañongo o delivery en Carabobo.",
    eyebrow: "Galletas Fontana",
    intro: "Las Fonkies se combinan por sabor desde un mínimo de cuatro unidades. Cuando un sabor no tiene stock, la tienda lo identifica como Pre-Order sujeto a confirmación.",
    detail: "La disponibilidad inmediata o el tiempo de preparación aparece en la tienda antes de enviar el pedido."
  },
  {
    id: "fomb",
    slug: "fomb-bombones-sin-azucar",
    navName: "Fomb",
    title: "Fomb · Bombones sin azúcar",
    description: "Bombones Fomb sin gluten, sin azúcar refinada, sin lactosa y sin huevo. Arma tu caja y combina sabores con entrega en Carabobo.",
    eyebrow: "Bombones Fontana",
    intro: "Elige el tamaño de la caja y combina los sabores disponibles. Si seleccionas más bombones que el tamaño base, la tienda calcula automáticamente cada unidad extra.",
    detail: "Los sabores sin stock se ofrecen como Pre-Order cuando la producción está disponible, siempre sujeto a confirmación por WhatsApp."
  },
  {
    id: "salado",
    slug: "salados-sin-gluten-carabobo",
    navName: "Salados",
    title: "Opciones saladas sin gluten en Carabobo",
    description: "Cachitos, panzerottis, tequeños, raviolis y nuggets sin gluten para preparar en casa. Pickup en Mañongo y delivery en Carabobo.",
    eyebrow: "Para preparar en casa",
    intro: "Opciones congeladas con presentaciones y rellenos que se eligen antes de agregar al pedido. Cada ficha indica ingredientes, cantidad y preparación confirmada.",
    detail: "El stock y los pedidos especiales se validan por WhatsApp antes de confirmar el pago."
  },
  {
    id: "beverages",
    slug: "bebidas",
    navName: "Bebidas",
    title: "Bebidas para acompañar tu pedido Fontana",
    description: "Bebidas refrigeradas disponibles para agregar a pedidos Fontana con pickup en Mañongo o delivery en Carabobo.",
    eyebrow: "Stock de hoy",
    intro: "Agrega una bebida refrigerada a tu pedido y consulta su disponibilidad para el mismo día.",
    detail: "Las existencias y la entrega final se confirman junto con el resto del pedido por WhatsApp."
  },
  {
    id: "bottega",
    slug: "bottega",
    navName: "Bottega",
    title: "Bottega · Selección para tu despensa",
    description: "Descubre la selección Bottega de Fontana y agrega productos para tu despensa al pedido, sujetos a disponibilidad.",
    eyebrow: "Selección Bottega",
    intro: "Una selección de productos para complementar tu pedido Fontana. Consulta cada ficha para conocer su presentación, ingredientes y características confirmadas.",
    detail: "Las existencias y la entrega final se confirman junto con el resto del pedido por WhatsApp."
  }
];

export const staticProducts = [
  {
    id: "pistacho",
    category: "cakes",
    name: "Torta de Pistacho y Frambuesa",
    price: 59,
    image: "assets/pistachio-raspberry-fontana-v2.jpg",
    description: "Torta de harina de almendra con frambuesa, pistacho y glaseado vegano.",
    ingredients: "Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho, frambuesa, semillas de amapola, alulosa y chocolate blanco vegano sin azúcar.",
    weight: "25 CM · 1 KG",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  },
  {
    id: "naranja",
    category: "cakes",
    name: "Torta de Manjar de Naranja",
    price: 47,
    image: "assets/manjar-naranja.jpg",
    description: "Torta de naranja con harina de almendra, semillas de amapola y alulosa.",
    ingredients: "Harina de almendra, harina de yuca (10 %), monkfruit, aceite de coco, huevo, naranja, semillas de amapola y alulosa.",
    weight: "APROX. 1 KG",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  },
  {
    id: "zanahoria",
    category: "cakes",
    name: "Torta de Zanahoria",
    price: 47,
    image: "assets/zanahoria-fontana-v2.jpg",
    description: "Torta de zanahoria con canela, jengibre, almendras y glaseado vegano.",
    ingredients: "Harina de almendra, harina de coco (10 %), monkfruit, aceite de coco, huevo, leche sin lactosa, zanahoria, canela, jengibre, glaseado vegano y almendras.",
    weight: "APROX. 1 KG",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  },
  {
    id: "pistacho-clasico",
    category: "cakes",
    name: "Torta de Pistacho",
    price: 55,
    image: "assets/pistacho-fontana-v4.webp",
    description: "Torta de pistacho con harina de almendra y glaseado vegano.",
    ingredients: "Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, pistacho y glaseado vegano.",
    weight: "APROX. 1 KG",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  },
  {
    id: "chocolate",
    category: "cakes",
    name: "Torta de Triple Chocolate",
    price: 45,
    image: "assets/chocolate-fontana-v2.jpg",
    description: "Torta con chocolate vegano 70 % cacao, harina de almendra y monkfruit.",
    ingredients: "Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, cacao, chocolate vegano endulzado con monkfruit y chispas de chocolate vegano.",
    weight: "25 CM · 1 KG",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  },
  {
    id: "vainilla",
    category: "cakes",
    name: "Torta de Vainilla con Chispas",
    price: 45,
    image: "assets/vanilla-chips-fontana-v2.jpg",
    description: "Torta de vainilla con harina de almendra y chispas de chocolate vegano.",
    ingredients: "Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa y chispas de chocolate vegano endulzadas con monkfruit.",
    weight: "BAJO ENCARGO",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  },
  {
    id: "lemon",
    category: "cakes",
    name: "Torta de Limón",
    price: 45,
    image: "assets/lemon-fontana-v2.jpg",
    description: "Torta de limón con harina de almendra, monkfruit y glaseado vegano blanco.",
    ingredients: "Harina de almendra, monkfruit, aceite de coco, huevo, leche sin lactosa, limón y chocolate blanco vegano.",
    weight: "25 CM · 1 KG",
    availabilityMode: "preorder",
    status: "sold-out",
    allowPreorder: true,
    minimumBusinessDays: 2
  }
];

export const builderProducts = [
  {
    id: "fonkie-box",
    category: "fonkies",
    name: "Caja de Fonkies",
    price: null,
    image: "assets/fonkie-dark-chocolate-chips-fontana-pro.jpg",
    description: "Caja combinable de Fonkies con un mínimo de cuatro unidades.",
    ingredients: "Los ingredientes cambian según el sabor elegido y se muestran en la tienda.",
    weight: "MÍNIMO 4 UNIDADES",
    status: "available",
    glutenFree: true,
    sugarFree: true,
    lactoseFree: true
  },
  {
    id: "fomb-box",
    category: "fomb",
    name: "Caja de Fomb",
    price: 15,
    image: "assets/fomb-pistachio-fontana-pro.jpg",
    description: "Caja combinable de bombones Fomb con unidades extra calculadas automáticamente.",
    ingredients: "Los ingredientes cambian según el sabor elegido y se muestran en la tienda.",
    weight: "DESDE 4 UNIDADES",
    status: "available",
    glutenFree: true,
    sugarFree: true,
    lactoseFree: true,
    eggFree: true
  }
];

const allThreeDietaryIds = new Set([
  "pistacho", "naranja", "zanahoria", "pistacho-clasico", "chocolate", "vainilla", "lemon",
  "ballerine", "tentacion-coco", "crumbl-blueberry", "brownie-fit", "mini-cake",
  "cachito-fit", "panzerottis", "raviolis", "nuggets-rora"
]);

export function dietaryFor(product) {
  const defaults = allThreeDietaryIds.has(product.id)
    ? { glutenFree: true, sugarFree: true, lactoseFree: true, eggFree: false }
    : product.id === "tequenos-fit"
      ? { glutenFree: true, sugarFree: true, lactoseFree: false, eggFree: false }
      : { glutenFree: false, sugarFree: false, lactoseFree: false, eggFree: false };
  return {
    glutenFree: Object.hasOwn(product, "glutenFree") ? Boolean(product.glutenFree) : defaults.glutenFree,
    sugarFree: Object.hasOwn(product, "sugarFree") ? Boolean(product.sugarFree) : defaults.sugarFree,
    lactoseFree: Object.hasOwn(product, "lactoseFree") ? Boolean(product.lactoseFree) : defaults.lactoseFree,
    eggFree: Object.hasOwn(product, "eggFree") ? Boolean(product.eggFree) : defaults.eggFree
  };
}
