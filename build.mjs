import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import { builderProducts, categoryPages, dietaryFor, site, staticProducts } from "./seo-data.mjs";

import { responsiveImages, escapeHtml, absoluteUrl, productPath, categoryPage, productPage, informationPage, privacyPage, notFoundPage } from "./seo-render.mjs";

const outputDirectory = "dist";
const responsiveImageDirectory = `${outputDirectory}/assets/responsive`;
const responsiveImageRecipe = "fontana-webp-q95-smart-v1";

const catalogImagePaths = new Set();

function fingerprint(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

function compactInlineStyles(html) {
  return html.replace(/<style>([\s\S]*?)<\/style>/g, (_match, styles) => (
    `<style>${styles
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([{};])\s*/g, "$1")
      .replace(/\[([-\w]+)="([_a-zA-Z][-\w]*)"\]/g, "[$1=$2]")
      .replace(/;}/g, "}")
      .trim()}</style>`
  ));
}

function compactStructuredData(html) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (tag, json) => {
    try {
      return `<script type="application/ld+json">${JSON.stringify(JSON.parse(json))}</script>`;
    } catch {
      return tag;
    }
  });
}

function latestSignificantDate() {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cI", "--", "index.html", "config.js", "seo-data.mjs"], { encoding: "utf8" }).trim().slice(0, 10);
    return date || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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
      const assetHash = fingerprint(Buffer.concat([
        Buffer.from(`${responsiveImageRecipe}\0`),
        await readFile(input)
      ])).slice(0, 7);
      const sources = [];
      for (const width of widths) {
        const filename = `${basename}-${assetHash}-${width}.webp`;
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
    // The homepage only renders compact cards. Its original remains the `src`
    // fallback and is promoted after decode on expansion, so it does not need
    // to inflate every compact `srcset` as an eager high-DPR candidate.
    const sourceSet = responsive.sources
      .filter(source => source.path !== image)
      .map(source => `${source.path} ${source.width}w`)
      .join(",");
    const sizes = /(?:logo|seal|brand)/i.test(`${before} ${image} ${after}`)
      ? "(max-width: 640px) 180px, 260px"
      : catalogImagePaths.has(image)
        ? "(max-width:640px) calc(50vw - 18.5px),(max-width:959px) calc(50vw - 29px),380px"
        : "(max-width: 640px) 92vw, (max-width: 1100px) 50vw, 540px";
    const dimensions = `${/\bwidth=/.test(tag) ? "" : ` width="${responsive.width}"`}${/\bheight=/.test(tag) ? "" : ` height="${responsive.height}"`}`;
    const responsiveAttributes = sourceSet ? ` srcset="${sourceSet}" sizes="${sizes}"` : "";
    return `<img${before}src="${image}"${responsiveAttributes}${dimensions}${after}>`;
  });
}

function responsiveManifestScript() {
  const manifest = Object.fromEntries([...responsiveImages.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([image, responsive]) => [image, responsive]));
  return `window.FONTANA_RESPONSIVE_IMAGES=${JSON.stringify(manifest)};\n`;
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
const cartStyleContents = await readFile("cart.css", "utf8");
const sourceHtml = await readFile("index.html", "utf8");
const configContext = { window: {} };
vm.runInNewContext(configContents, configContext);
const configuredProducts = Array.isArray(configContext.window.FONTANA_CONFIG?.dynamicCatalog) ? configContext.window.FONTANA_CONFIG.dynamicCatalog : [];
const products = [...staticProducts, ...builderProducts, ...configuredProducts]
  .filter(product => product?.id && product.visible !== false && !product.deleted)
  .map(product => ({ ...product, image: String(product.image || site.defaultImage).replace(/^\//, "") }));
[...staticProducts, ...configuredProducts]
  .filter(product => product?.image)
  .forEach(product => catalogImagePaths.add(String(product.image).replace(/^\//, "")));
const homepageImages = [...sourceHtml.matchAll(/src="(assets\/[^"]+\.(?:jpe?g|png|webp))"/gi)].map(match => match[1]);
await prepareResponsiveImages([...products.map(product => product.image), ...homepageImages, site.logo, site.defaultImage]);
await sharp(String(site.defaultImage).replace(/^\//, ""))
  .resize(1200, 630, { fit: "cover", position: "attention" })
  .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
  .toFile(`${outputDirectory}${site.defaultSocialImage}`);
const configVersion = fingerprint(configContents);
const appVersion = fingerprint(appContents);
const responsiveManifestContents = responsiveManifestScript();
await writeFile(`${outputDirectory}/edge-images.mjs`, `export default ${JSON.stringify(Object.fromEntries(responsiveImages))};\n`);
const responsiveManifestVersion = fingerprint(responsiveManifestContents);
const adminScriptVersion = fingerprint(adminScriptContents);
const adminStyleVersion = fingerprint(adminStyleContents);
const seoStyleVersion = fingerprint(seoStyleContents);
const seoStyleFile = `seo.${seoStyleVersion}.css`;
const cartStyleVersion = fingerprint(cartStyleContents);
const cartStyleFile = `cart.${cartStyleVersion}.css`;

await writeFile(`${outputDirectory}/config.${configVersion}.js`, configContents);
await writeFile(`${outputDirectory}/images.${responsiveManifestVersion}.js`, responsiveManifestContents);
await writeFile(`${outputDirectory}/app.${appVersion}.js`, appContents);
await writeFile(`${outputDirectory}/admin/admin.${adminScriptVersion}.js`, adminScriptContents);
await writeFile(`${outputDirectory}/admin/admin.${adminStyleVersion}.css`, adminStyleContents);
await writeFile(`${outputDirectory}/${seoStyleFile}`, seoStyleContents);
await writeFile(`${outputDirectory}/seo.css`, seoStyleContents);
await writeFile(`${outputDirectory}/_routes.json`, JSON.stringify({version:1,include:["/productos/*","/sitemap.xml",...categoryPages.map(c=>`/${c.slug}*`)],exclude:[]}));
await writeFile(`${outputDirectory}/${cartStyleFile}`, cartStyleContents);

let html = sourceHtml
  .replace('href="cart.css"', `href="${cartStyleFile}"`)
  .replace('<script src="config.js"></script>', `<script src="config.${configVersion}.js"></script><script src="images.${responsiveManifestVersion}.js"></script>`)
  .replace('<script src="app.js"></script>', `<script src="app.${appVersion}.js"></script>`)
  .replaceAll("https://fontanasingluten.com/assets/pistachio-raspberry-fontana-v2.jpg", `${site.origin}${site.defaultSocialImage}`)
  .replace('<meta property="og:image:width" content="1448">', '<meta property="og:image:width" content="1200">')
  .replace('<meta property="og:image:height" content="1086">', '<meta property="og:image:height" content="630">');
html = compactStructuredData(compactInlineStyles(enhanceHomepageImages(html)));
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
