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
await cp("admin", `${outputDirectory}/admin`, { recursive: true });
await cp("config.js", `${outputDirectory}/config.js`);

const configContents = await readFile("config.js", "utf8");
const appContents = await readFile("app.js", "utf8");
const configVersion = fingerprint(configContents);
const appVersion = fingerprint(appContents);

function inlineScript(contents) {
  return contents.replace(/<\/script/gi, "<\\/script");
}

let html = await readFile("index.html", "utf8");
html = html
  .replace('<script src="config.js"></script>', () => `<script data-store-config="${configVersion}">\n${inlineScript(configContents)}\n</script>`)
  .replace('<script src="app.js"></script>', () => `<script data-store-app="${appVersion}">\n${inlineScript(appContents)}\n</script>`);

await writeFile(`${outputDirectory}/index.html`, html);
