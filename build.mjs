import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const outputDirectory = "dist";

function fingerprint(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp("assets", `${outputDirectory}/assets`, { recursive: true });
await cp("_headers", `${outputDirectory}/_headers`);
await cp("robots.txt", `${outputDirectory}/robots.txt`);
await cp("sitemap.xml", `${outputDirectory}/sitemap.xml`);
await cp("manifest.webmanifest", `${outputDirectory}/manifest.webmanifest`);
await cp("admin", `${outputDirectory}/admin`, { recursive: true });
await cp("config.js", `${outputDirectory}/config.js`);

const configContents = await readFile("config.js", "utf8");
const appContents = await readFile("app.js", "utf8");
const adminScriptContents = await readFile("admin/admin.js", "utf8");
const adminStyleContents = await readFile("admin/admin.css", "utf8");
const configVersion = fingerprint(configContents);
const appVersion = fingerprint(appContents);
const adminScriptVersion = fingerprint(adminScriptContents);
const adminStyleVersion = fingerprint(adminStyleContents);

await writeFile(`${outputDirectory}/config.${configVersion}.js`, configContents);
await writeFile(`${outputDirectory}/admin/admin.${adminScriptVersion}.js`, adminScriptContents);
await writeFile(`${outputDirectory}/admin/admin.${adminStyleVersion}.css`, adminStyleContents);

function inlineScript(contents) {
  return contents.replace(/<\/script/gi, "<\\/script");
}

let html = await readFile("index.html", "utf8");
html = html
  .replace('<script src="config.js"></script>', () => `<script data-store-config="${configVersion}">\n${inlineScript(configContents)}\n</script>`)
  .replace('<script src="app.js"></script>', () => `<script data-store-app="${appVersion}">\n${inlineScript(appContents)}\n</script>`);

await writeFile(`${outputDirectory}/index.html`, html);

let adminHtml = await readFile("admin/index.html", "utf8");
adminHtml = adminHtml
  .replace(/href="admin\.css(?:\?v=[^"]*)?"/, `href="admin.${adminStyleVersion}.css"`)
  .replace(/src="\.\.\/config\.js(?:\?v=[^"]*)?"/, `src="../config.${configVersion}.js"`)
  .replace(/src="admin\.js(?:\?v=[^"]*)?"/, `src="admin.${adminScriptVersion}.js"`);
await writeFile(`${outputDirectory}/admin/index.html`, adminHtml);
