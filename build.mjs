import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import { builderProducts, categoryPages, dietaryFor, site, staticProducts } from "./seo-data.mjs";

const outputDirectory = "dist";
const responsiveImageDirectory = `${outputDirectory}/assets/responsive`;
const responsiveImages = new Map();

function fingerprint(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function absoluteUrl(path = "/") {
  return new URL(path, `${site.origin}/`).href;
}

function productPath(product) {
  return `/productos/${encodeURIComponent(product.id)}/`;
}

function money(value) {
  if (!Number.isFinite(Number(value))) return "Precio por confirmar";
  return new Intl.NumberFormat(site.locale, { style: "currency", currency: site.currency }).format(Number(value));
}

function latestSignificantDate() {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cI", "--", "index.html", "config.js", "seo-data.mjs"], { encoding: "utf8" }).trim().slice(0, 10);
    return date || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function schemaScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

function dietaryTags(product) {
  const dietary = dietaryFor(product);
  return [
    dietary.glutenFree && "Sin gluten",
    dietary.sugarFree && "Sin azúcar",
    dietary.lactoseFree && "Sin lactosa",
    dietary.eggFree && "Sin huevo"
  ].filter(Boolean);
}

function commonHead({ title, description, canonical, image, schema, seoStyleFile, robots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" }) {
  const socialImage = absoluteUrl(image || site.defaultSocialImage || site.defaultImage);
  return `<!doctype html>
<html lang="${site.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="es-VE" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}">
  <link rel="icon" type="image/png" href="/assets/fontana-logo-official.png?v=20260822">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/fontana-logo-official.png?v=20260822">
  <meta name="theme-color" content="#6e236f">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${site.name}">
  <meta property="og:locale" content="es_VE">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta property="og:image:alt" content="${escapeHtml(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/${seoStyleFile}">
  <title>${escapeHtml(title)}</title>
  ${schemaScript(schema)}
</head>`;
}

function responsiveImage(image, { alt, className = "", loading = "lazy", fetchpriority = "", sizes = "(max-width: 640px) 92vw, (max-width: 1100px) 50vw, 540px" } = {}) {
  const cleanImage = String(image || site.defaultImage).replace(/^\//, "");
  const responsive = responsiveImages.get(cleanImage);
  const attributes = [
    `src="/${escapeHtml(cleanImage)}"`,
    responsive ? `srcset="${responsive.sources.map(source => `/${escapeHtml(source.path)} ${source.width}w`).join(", ")}"` : "",
    responsive ? `sizes="${escapeHtml(sizes)}"` : "",
    `width="${responsive?.width || 900}"`,
    `height="${responsive?.height || 900}"`,
    className ? `class="${escapeHtml(className)}"` : "",
    loading ? `loading="${escapeHtml(loading)}"` : "",
    `decoding="async"`,
    fetchpriority ? `fetchpriority="${escapeHtml(fetchpriority)}"` : "",
    `alt="${escapeHtml(alt || "")}"`
  ].filter(Boolean).join(" ");
  return `<img ${attributes}>`;
}

async function prepareResponsiveImages(images) {
  await mkdir(responsiveImageDirectory, { recursive: true });
  for (const image of new Set(images.map(value => String(value || "").replace(/^\//, "")).filter(Boolean))) {
    if (!/^assets\/.+\.(?:jpe?g|png|webp)$/i.test(image)) continue;
    try {
      const input = path.resolve(image);
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) continue;
      const widths = [360, 640, 960].filter(width => width < metadata.width);
      const basename = path.basename(image, path.extname(image)).replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
      const sources = [];
      for (const width of widths) {
        const filename = `${basename}-${width}.webp`;
        const destination = `${responsiveImageDirectory}/${filename}`;
        await sharp(input)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 95, smartSubsample: true, effort: 5 })
          .toFile(destination);
        sources.push({ path: `assets/responsive/${filename}`, width });
      }
      sources.push({ path: image, width: metadata.width });
      responsiveImages.set(image, { width: metadata.width, height: metadata.height, sources });
    } catch (error) {
      console.warn(`No se pudo preparar la variante responsiva de ${image}: ${error.message}`);
    }
  }
}

function enhanceHomepageImages(html) {
  return html.replace(/<img\b([^>]*?)src="(assets\/[^"]+)"([^>]*)>/g, (tag, before, image, after) => {
    if (/\bsrcset=/.test(tag)) return tag;
    const responsive = responsiveImages.get(image);
    if (!responsive) return tag;
    const sourceSet = responsive.sources.map(source => `${source.path} ${source.width}w`).join(", ");
    const sizes = /(?:logo|seal|brand)/i.test(`${before} ${image} ${after}`)
      ? "(max-width: 640px) 180px, 260px"
      : "(max-width: 640px) 92vw, (max-width: 1100px) 50vw, 540px";
    const dimensions = `${/\bwidth=/.test(tag) ? "" : ` width="${responsive.width}"`}${/\bheight=/.test(tag) ? "" : ` height="${responsive.height}"`}`;
    return `<img${before}src="${image}" srcset="${sourceSet}" sizes="${sizes}"${dimensions}${after}>`;
  });
}

function navigation() {
  return `<a class="skip-link" href="#contenido">Saltar al contenido</a>
  <nav class="site-nav" aria-label="Navegación principal"><div class="container nav-inner">
    <a class="brand" href="/" aria-label="Fontana, inicio">${responsiveImage("assets/fontana-seal-transparent.png", { alt: "Fontana", loading: "eager", sizes: "48px" })}<span>Fontana sin gluten</span></a>
    <div class="nav-links"><a href="/#menu">Menú</a><a href="/#historia">Nuestra esencia</a><a href="/#ubicacion">Ubicación</a></div>
    <a class="button" href="/#menu">Armar pedido</a>
  </div></nav>`;
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs container" aria-label="Migas de pan"><ol>${items.map((item, index) => `<li>${index === items.length - 1 ? escapeHtml(item.name) : `<a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>`}</li>`).join("")}</ol></nav>`;
}

function categoryNavigation(activeId = "") {
  return `<nav class="category-links" aria-label="Categorías del menú">${categoryPages.map(category => `<a href="/${category.slug}/"${category.id === activeId ? ' aria-current="page"' : ""}>${escapeHtml(category.navName)}</a>`).join("")}</nav>`;
}

function footer() {
  return `<footer><div class="container"><div class="footer-grid"><div><a class="brand" href="/">${responsiveImage("assets/fontana-logo-official-reverse.png", { alt: "Fontana", sizes: "48px" })}<span>Fontana sin gluten</span></a><p class="footer-copy">Cocina de autor sin gluten, sin azúcar refinada y con opciones sin lactosa. Pickup en Mañongo y delivery en Carabobo.</p></div><div><strong>Explora Fontana</strong><div class="footer-links">${categoryPages.map(category => `<a href="/${category.slug}/">${escapeHtml(category.navName)}</a>`).join("")}<a href="/informacion-del-pedido/">Información del pedido</a><a href="/privacidad/">Privacidad</a><a href="/#resenas">Reseñas reales</a></div></div></div><div class="footer-bottom">© ${new Date().getUTCFullYear()} Fontana. Pedidos sujetos a confirmación por WhatsApp.</div></div></footer>`;
}

function productCard(product) {
  const tags = dietaryTags(product);
  return `<article class="product-card">${responsiveImage(product.image, { alt: product.name, sizes: "(max-width: 520px) 94vw, (max-width: 800px) 46vw, 350px" })}<div class="product-card-body"><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.description)}</p><div class="product-meta">${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div><div class="price">${escapeHtml(money(product.price))}</div><a class="card-link" href="${productPath(product)}">Ver producto y sus ingredientes</a></div></article>`;
}

function categoryPage(category, products, seoStyleFile) {
  const canonical = `${site.origin}/${category.slug}/`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${canonical}#page`, url: canonical, name: category.title, description: category.description, inLanguage: site.locale, isPartOf: { "@id": `${site.origin}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${site.origin}/` },
        { "@type": "ListItem", position: 2, name: category.navName, item: canonical }
      ] },
      { "@type": "ItemList", name: category.title, itemListElement: products.map((product, index) => ({ "@type": "ListItem", position: index + 1, url: absoluteUrl(productPath(product)), name: product.name })) }
    ]
  };
  const heroImage = products[0]?.image || site.defaultImage;
  return `${commonHead({ title: `${category.title} | Fontana`, description: category.description, canonical, image: heroImage, schema, seoStyleFile })}
<body>${navigation()}${breadcrumbs([{ name: "Inicio", url: "/" }, { name: category.navName, url: `/${category.slug}/` }])}
<main id="contenido"><header class="hero"><div class="container hero-grid"><div><span class="eyebrow">${escapeHtml(category.eyebrow)}</span><h1>${escapeHtml(category.title)}</h1><p>${escapeHtml(category.intro)}</p><div class="hero-actions"><a class="button" href="/#menu">Armar mi pedido</a><a class="button secondary" href="https://wa.me/${site.whatsapp}" rel="noopener">Consultar por WhatsApp</a></div></div><div class="hero-media">${responsiveImage(heroImage, { alt: category.title, loading: "eager", fetchpriority: "high", sizes: "(max-width: 800px) 94vw, 470px" })}</div></div></header>
<section class="section"><div class="container"><div class="section-heading"><span class="eyebrow">Menú Fontana</span><h2>Conoce cada opción</h2><p>${escapeHtml(category.detail)}</p></div><div class="product-grid">${products.map(productCard).join("")}</div><p class="notice">La disponibilidad, el tiempo de preparación y el pago se confirman directamente con Fontana antes de aceptar el pedido.</p></div></section>
<section class="section alt"><div class="container"><div class="section-heading"><span class="eyebrow">Pedido informado</span><h2>Antes de confirmar</h2></div><div class="help-grid"><article class="help-card"><h3>Elige</h3><p>Revisa presentaciones, sabores, ingredientes y cantidades desde la tienda.</p></article><article class="help-card"><h3>Indica tus necesidades</h3><p>Si tienes una condición, alergia o intolerancia, descríbela en el pedido para que Fontana pueda revisar cada producto.</p></article><article class="help-card"><h3>Confirma</h3><p>El pedido, la disponibilidad y el pago quedan pendientes hasta recibir confirmación por WhatsApp.</p></article></div></div></section>
<section class="section"><div class="container"><div class="section-heading"><span class="eyebrow">También puedes explorar</span><h2>Todo el menú Fontana</h2></div>${categoryNavigation(category.id)}</div></section></main>${footer()}</body></html>`;
}

function productPage(product, category, seoStyleFile) {
  const canonical = absoluteUrl(productPath(product));
  const tags = dietaryTags(product);
  const offers = Number.isFinite(Number(product.price)) ? {
    "@type": "Offer", url: canonical, priceCurrency: site.currency, price: Number(product.price),
    availability: product.status === "sold-out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition", seller: { "@id": `${site.origin}/#business` }
  } : undefined;
  const schemaProduct = {
    "@type": "Product", "@id": `${canonical}#product`, name: product.name, image: [absoluteUrl(product.image)],
    description: product.description, sku: product.id, category: category.title, brand: { "@type": "Brand", name: site.shortName }, url: canonical,
    ...(offers ? { offers } : {}),
    ...(tags.length ? { additionalProperty: tags.map(tag => ({ "@type": "PropertyValue", name: tag, value: true })) } : {})
  };
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      schemaProduct,
      { "@type": "WebPage", "@id": `${canonical}#page`, url: canonical, name: `${product.name} | Fontana`, description: product.description, inLanguage: site.locale, mainEntity: { "@id": `${canonical}#product` }, isPartOf: { "@id": `${site.origin}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${site.origin}/` },
        { "@type": "ListItem", position: 2, name: category.navName, item: `${site.origin}/${category.slug}/` },
        { "@type": "ListItem", position: 3, name: product.name, item: canonical }
      ] }
    ]
  };
  return `${commonHead({ title: `${product.name} | Fontana`, description: `${product.description} Pickup en Mañongo o delivery en Carabobo.`, canonical, image: product.image, schema, seoStyleFile })}
<body>${navigation()}${breadcrumbs([{ name: "Inicio", url: "/" }, { name: category.navName, url: `/${category.slug}/` }, { name: product.name, url: productPath(product) }])}
<main id="contenido"><section class="section"><div class="container detail-grid"><div class="detail-photo">${responsiveImage(product.image, { alt: product.name, loading: "eager", fetchpriority: "high", sizes: "(max-width: 800px) 94vw, 510px" })}</div><div class="detail-copy"><span class="eyebrow">${escapeHtml(category.navName)} Fontana</span><h1>${escapeHtml(product.name)}</h1><p class="lede">${escapeHtml(product.description)}</p><div class="product-meta">${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div><div class="detail-facts"><div class="fact"><small>Precio publicado</small><strong>${escapeHtml(money(product.price))}</strong></div><div class="fact"><small>Presentación</small><strong>${escapeHtml(product.weight || product.availabilityLabel || "Sujeta a confirmación")}</strong></div></div><div class="ingredients"><h2>Ingredientes publicados</h2><p>${escapeHtml(product.ingredients || "Los ingredientes se confirman directamente con Fontana según la personalización elegida.")}</p></div><p class="notice">Si tienes una condición, alergia o intolerancia, indícala al armar el pedido. Fontana revisará los ingredientes y las instrucciones antes de aceptarlo.</p><div class="hero-actions"><a class="button" href="/#menu">Armar pedido en la tienda</a><a class="button secondary" href="/${category.slug}/">Ver más ${escapeHtml(category.navName.toLowerCase())}</a></div></div></div></section>
<section class="section alt"><div class="container"><div class="section-heading"><span class="eyebrow">Entrega y confirmación</span><h2>Cómo pedir</h2></div><div class="help-grid"><article class="help-card"><h3>Pickup</h3><p>Retiro en Mañongo; los detalles se coordinan por WhatsApp.</p></article><article class="help-card"><h3>Delivery</h3><p>Disponible en Carabobo; el costo se confirma por WhatsApp.</p></article><article class="help-card"><h3>Pago</h3><p>El pedido queda pendiente hasta que Fontana confirme disponibilidad y pago.</p></article></div></div></section>
<section class="section"><div class="container"><div class="section-heading"><span class="eyebrow">Explora Fontana</span><h2>Otras categorías</h2></div>${categoryNavigation(category.id)}</div></section></main>${footer()}</body></html>`;
}

function informationPage(seoStyleFile) {
  const canonical = `${site.origin}/informacion-del-pedido/`;
  const schema = { "@context": "https://schema.org", "@type": "WebPage", url: canonical, name: "Información del pedido | Fontana", inLanguage: site.locale };
  return `${commonHead({ title: "Información del pedido | Fontana", description: "Cómo se confirman los pedidos, pagos, entregas, cambios y necesidades alimentarias en Fontana.", canonical, schema, seoStyleFile })}
<body>${navigation()}${breadcrumbs([{ name: "Inicio", url: "/" }, { name: "Información del pedido", url: "/informacion-del-pedido/" }])}
<main id="contenido"><header class="hero compact-hero"><div class="container"><span class="eyebrow">Antes de pedir</span><h1>Información del pedido</h1><p>Queremos que sepas qué ocurre desde que armas tu carrito hasta que Fontana confirma la preparación.</p></div></header>
<section class="section"><div class="container policy-stack"><article><h2>Confirmación y pago</h2><p>El total que muestra la tienda es estimado hasta que Fontana confirme por WhatsApp la disponibilidad, la modalidad de entrega y el pago. En pedidos con inventario controlado, la tienda puede reservar las unidades durante 30 minutos mientras se completa la confirmación.</p></article><article><h2>Pickup y delivery</h2><p>El pickup se coordina en Mañongo y los detalles exactos se comparten por WhatsApp. El delivery está disponible en Carabobo; su costo y cobertura final se confirman antes de aceptar el pedido.</p></article><article><h2>Cambios o cancelaciones</h2><p>Solicita cualquier cambio o cancelación por WhatsApp. Fontana revisará cada solicitud según el estado del pedido, el pago y si la preparación ya comenzó. Antes de realizar un pago adicional, espera siempre la confirmación directa de Fontana.</p></article><article><h2>Alergias, intolerancias y condiciones</h2><p>Las fichas muestran los ingredientes publicados, pero algunas recetas incluyen huevo, leche, frutos secos u otros alérgenos. Si tienes enfermedad celíaca, una alergia, intolerancia o condición médica, indícala en el checkout. La etiqueta de la web no sustituye la revisión individual y el pedido permanece pendiente hasta que Fontana confirme si puede atenderlo de forma segura.</p></article><article><h2>Conservación e instrucciones</h2><p>Las instrucciones pueden cambiar según el producto y la modalidad de entrega. Solicítalas al confirmar el pedido y sigue la indicación específica que Fontana envíe por WhatsApp.</p></article><div class="notice">¿Tienes una duda antes de comprar? Escríbenos por WhatsApp y menciona el producto que deseas consultar.</div><a class="button" href="https://wa.me/${site.whatsapp}?text=${encodeURIComponent("Hola Fontana, quisiera aclarar una duda antes de hacer mi pedido.")}" rel="noopener">Consultar por WhatsApp</a></div></section></main>${footer()}</body></html>`;
}

function privacyPage(seoStyleFile) {
  const canonical = `${site.origin}/privacidad/`;
  const schema = { "@context": "https://schema.org", "@type": "WebPage", url: canonical, name: "Privacidad | Fontana", inLanguage: site.locale };
  return `${commonHead({ title: "Privacidad | Fontana", description: "Información sobre los datos utilizados para preparar, reservar y confirmar pedidos de Fontana.", canonical, schema, seoStyleFile })}
<body>${navigation()}${breadcrumbs([{ name: "Inicio", url: "/" }, { name: "Privacidad", url: "/privacidad/" }])}
<main id="contenido"><header class="hero compact-hero"><div class="container"><span class="eyebrow">Tus datos</span><h1>Privacidad</h1><p>Usamos únicamente la información necesaria para revisar, reservar y coordinar tu pedido.</p></div></header>
<section class="section"><div class="container policy-stack"><article><h2>Qué información se solicita</h2><p>El checkout puede solicitar nombre, teléfono, modalidad de entrega, dirección, fecha, forma de pago, observaciones y la información alimentaria que decidas comunicar.</p></article><article><h2>Para qué se utiliza</h2><p>Los datos se usan para validar el carrito, crear una reserva operativa cuando corresponde, coordinar el pedido por WhatsApp y mantener el historial necesario para gestionar pedidos y ventas.</p></article><article><h2>Dónde se procesa</h2><p>La reserva se procesa mediante la infraestructura privada de Fontana en Cloudflare y el resumen se abre en WhatsApp para que puedas enviarlo. Fontana no publica esos datos en la tienda ni los utiliza en esta web para publicidad comportamental.</p></article><article><h2>Quién puede acceder</h2><p>El acceso administrativo está restringido a cuentas autorizadas de Fontana. No incluyas contraseñas, datos bancarios completos ni información médica que no sea necesaria para revisar el pedido.</p></article><article><h2>Consultas sobre tus datos</h2><p>Puedes escribir a Fontana por WhatsApp para solicitar acceso, corrección o revisión de la eliminación de tus datos, cuando corresponda según el estado del pedido y los registros operativos aplicables.</p></article><a class="button" href="https://wa.me/${site.whatsapp}?text=${encodeURIComponent("Hola Fontana, tengo una consulta sobre los datos de mi pedido.")}" rel="noopener">Consultar por WhatsApp</a></div></section></main>${footer()}</body></html>`;
}

function notFoundPage(seoStyleFile) {
  const canonical = `${site.origin}/404.html`;
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: "Página no encontrada | Fontana", inLanguage: site.locale };
  return `${commonHead({ title: "Página no encontrada | Fontana", description: "La página que buscas no está disponible. Regresa al menú de Fontana.", canonical, schema, seoStyleFile, robots: "noindex,follow" })}
<body>${navigation()}<main id="contenido"><section class="not-found"><div class="container"><span class="eyebrow">Error 404</span><h1>Este antojo cambió de lugar</h1><p>La página que buscas no está disponible, pero todo el menú Fontana sigue aquí.</p><div class="hero-actions"><a class="button" href="/#menu">Volver al menú</a><a class="button secondary" href="/">Ir al inicio</a></div>${categoryNavigation()}</div></section></main>${footer()}</body></html>`;
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp("assets", `${outputDirectory}/assets`, { recursive: true });
await cp("_headers", `${outputDirectory}/_headers`);
await cp("robots.txt", `${outputDirectory}/robots.txt`);
await cp("manifest.webmanifest", `${outputDirectory}/manifest.webmanifest`);
await cp("admin", `${outputDirectory}/admin`, { recursive: true });
await cp("config.js", `${outputDirectory}/config.js`);

const configContents = await readFile("config.js", "utf8");
const appContents = await readFile("app.js", "utf8");
const adminScriptContents = await readFile("admin/admin.js", "utf8");
const adminStyleContents = await readFile("admin/admin.css", "utf8");
const seoStyleContents = await readFile("seo.css", "utf8");
const sourceHtml = await readFile("index.html", "utf8");
const configContext = { window: {} };
vm.runInNewContext(configContents, configContext);
const configuredProducts = Array.isArray(configContext.window.FONTANA_CONFIG?.dynamicCatalog) ? configContext.window.FONTANA_CONFIG.dynamicCatalog : [];
const products = [...staticProducts, ...builderProducts, ...configuredProducts]
  .filter(product => product?.id && product.visible !== false && !product.deleted)
  .map(product => ({ ...product, image: String(product.image || site.defaultImage).replace(/^\//, "") }));
const homepageImages = [...sourceHtml.matchAll(/src="(assets\/[^"]+\.(?:jpe?g|png|webp))"/gi)].map(match => match[1]);
await prepareResponsiveImages([...products.map(product => product.image), ...homepageImages, site.logo, site.defaultImage]);
await sharp(String(site.defaultImage).replace(/^\//, ""))
  .resize(1200, 630, { fit: "cover", position: "attention" })
  .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
  .toFile(`${outputDirectory}${site.defaultSocialImage}`);
const configVersion = fingerprint(configContents);
const appVersion = fingerprint(appContents);
const adminScriptVersion = fingerprint(adminScriptContents);
const adminStyleVersion = fingerprint(adminStyleContents);
const seoStyleVersion = fingerprint(seoStyleContents);
const seoStyleFile = `seo.${seoStyleVersion}.css`;

await writeFile(`${outputDirectory}/config.${configVersion}.js`, configContents);
await writeFile(`${outputDirectory}/app.${appVersion}.js`, appContents);
await writeFile(`${outputDirectory}/admin/admin.${adminScriptVersion}.js`, adminScriptContents);
await writeFile(`${outputDirectory}/admin/admin.${adminStyleVersion}.css`, adminStyleContents);
await writeFile(`${outputDirectory}/${seoStyleFile}`, seoStyleContents);

let html = sourceHtml
  .replace('<script src="config.js"></script>', `<script src="config.${configVersion}.js"></script>`)
  .replace('<script src="app.js"></script>', `<script src="app.${appVersion}.js"></script>`)
  .replaceAll("https://fontanasingluten.com/assets/pistachio-raspberry-fontana-v2.jpg", `${site.origin}${site.defaultSocialImage}`)
  .replace('<meta property="og:image:width" content="1448">', '<meta property="og:image:width" content="1200">')
  .replace('<meta property="og:image:height" content="1086">', '<meta property="og:image:height" content="630">');
html = enhanceHomepageImages(html);
await writeFile(`${outputDirectory}/index.html`, html);

let adminHtml = await readFile("admin/index.html", "utf8");
adminHtml = adminHtml
  .replace(/href="admin\.css(?:\?v=[^"]*)?"/, `href="admin.${adminStyleVersion}.css"`)
  .replace(/src="\.\.\/config\.js(?:\?v=[^"]*)?"/, `src="../config.${configVersion}.js"`)
  .replace(/src="admin\.js(?:\?v=[^"]*)?"/, `src="admin.${adminScriptVersion}.js"`);
await writeFile(`${outputDirectory}/admin/index.html`, adminHtml);

const categoriesById = new Map(categoryPages.map(category => [category.id, category]));

for (const category of categoryPages) {
  const categoryProducts = products.filter(product => product.category === category.id);
  const directory = `${outputDirectory}/${category.slug}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, categoryPage(category, categoryProducts, seoStyleFile));
}

for (const product of products) {
  const category = categoriesById.get(product.category);
  if (!category) continue;
  const directory = `${outputDirectory}${productPath(product)}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, productPage(product, category, seoStyleFile));
}

await mkdir(`${outputDirectory}/informacion-del-pedido`, { recursive: true });
await writeFile(`${outputDirectory}/informacion-del-pedido/index.html`, informationPage(seoStyleFile));
await mkdir(`${outputDirectory}/privacidad`, { recursive: true });
await writeFile(`${outputDirectory}/privacidad/index.html`, privacyPage(seoStyleFile));
await writeFile(`${outputDirectory}/404.html`, notFoundPage(seoStyleFile));

const lastmod = latestSignificantDate();
const sitemapEntries = [
  { path: "/", image: site.defaultImage },
  { path: "/informacion-del-pedido/" },
  { path: "/privacidad/" },
  ...categoryPages.map(category => ({ path: `/${category.slug}/`, image: products.find(product => product.category === category.id)?.image })),
  ...products.map(product => ({ path: productPath(product), image: product.image }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemapEntries.map(entry => `  <url><loc>${escapeHtml(absoluteUrl(entry.path))}</loc><lastmod>${lastmod}</lastmod>${entry.image ? `<image:image><image:loc>${escapeHtml(absoluteUrl(entry.image))}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>
`;
await writeFile(`${outputDirectory}/sitemap.xml`, sitemap);
