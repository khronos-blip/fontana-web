import { categoryPages, builderProducts, site } from "../seo-data.mjs";
import { categoryPage, productPage, productPath, notFoundPage, escapeHtml, absoluteUrl, responsiveImages } from "../seo-render.mjs";
import imageManifest from "../dist/edge-images.mjs";
for (const [path,image] of Object.entries(imageManifest)) responsiveImages.set(path,image);

// Public data only. Never forward visitor cookies or administrative credentials.
const catalogUrl = "https://api.fontanasingluten.com/v1/catalog";
export function publishedProducts(state) {
  const products = (state.products || []).filter(p => !p.deleted && p.visible !== false);
  const boxes = builderProducts.flatMap(template => {
    const kind = template.category;
    const builder = state.builders?.[kind];
    if (!builder || builder.visible === false) return [];
    const sizes = kind === "fomb" ? (builder.sizes || []).map(s => ({...s,name:`${s.quantity} unidades`})) : [];
    return [{...template,...builder,id:template.id,category:kind,
      name:template.name,price:kind === "fonkies" ? null : sizes[0]?.price ?? null,
      image:builder.image || builder.flavors?.[0]?.image || template.image,sizes,
      glutenFree:builder.glutenFree === true,sugarFree:builder.sugarFree === true,
      lactoseFree:builder.lactoseFree === true,eggFree:builder.eggFree === true}];
  });
  return [...products,...boxes];
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const category = categoryPages.find(c => url.pathname === `/${c.slug}/` || url.pathname === `/${c.slug}`);
  const match = url.pathname.match(/^\/productos\/([a-z0-9-]+)\/?$/);
  if (!category && !match && url.pathname !== "/sitemap.xml") return context.next();
  if (!["GET","HEAD"].includes(context.request.method)) return new Response(null,{status:405,headers:{Allow:"GET, HEAD"}});
  const headers = {"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  try {
    const response = await fetch(catalogUrl,{signal:AbortSignal.timeout(5000),cache:"no-store"});
    if (!response.ok) throw new Error("catalog_unavailable");
    const payload = await response.json();
    if (!Array.isArray(payload.state?.products) || payload.state.operations?.verified !== true) throw new Error("catalog_unverified");
    const products = publishedProducts(payload.state);
    headers["X-Fontana-Catalog-Revision"] = String(payload.revision);
    let html,status=200;
    if (url.pathname === "/sitemap.xml") {
      const paths = ["/","/informacion-del-pedido/","/privacidad/",...categoryPages.map(c=>`/${c.slug}/`),...products.map(productPath)];
      html = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        [...new Set(paths)].map(path=>`<url><loc>${escapeHtml(absoluteUrl(path))}</loc></url>`).join("") + "</urlset>";
      headers["Content-Type"] = "application/xml; charset=utf-8";
    } else if (category) {
      html = categoryPage(category,products.filter(p=>p.category===category.id),"seo.css");
    } else {
      const product = products.find(p=>p.id===match[1]);
      const group = product && categoryPages.find(c=>c.id===product.category);
      if (!product || !group) { html=notFoundPage("seo.css");status=404; }
      else html=productPage(product,group,"seo.css");
    }
    return new Response(context.request.method === "HEAD" ? null : html,{status,headers});
  } catch {
    // Never silently serve stale prices, dietary claims or removed products.
    headers["Retry-After"]="60";
    headers["X-Robots-Tag"]="noindex";
    return new Response(context.request.method === "HEAD" ? null : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catálogo temporalmente no disponible | Fontana</title><link rel="stylesheet" href="/seo.css"><main class="container section"><h1>Estamos verificando el catálogo</h1><p>No pudimos confirmar los precios y la disponibilidad. Intenta nuevamente en unos momentos.</p><a class="button" href="/#menu">Volver al menú</a></main></html>',{status:503,headers});
  }
}
