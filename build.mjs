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

const configContents = await readFile("config.js", "utf8");
const appContents = await readFile("app.js", "utf8");
const configFilename = `config.${fingerprint(configContents)}.js`;
const appFilename = `app.${fingerprint(appContents)}.js`;

let html = await readFile("index.html", "utf8");
html = html
  .replace('src="config.js"', `src="${configFilename}"`)
  .replace('src="app.js"', `src="${appFilename}"`);

await Promise.all([
  writeFile(`${outputDirectory}/index.html`, html),
  writeFile(`${outputDirectory}/${configFilename}`, configContents),
  writeFile(`${outputDirectory}/${appFilename}`, appContents)
]);
