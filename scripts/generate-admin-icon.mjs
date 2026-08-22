import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const logoUrl = `data:image/png;base64,${readFileSync(resolve(root, "assets/fontana-logo-official.png")).toString("base64")}`;
const output = resolve(root, "assets/fontana-admin-icon.png");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });

await page.setContent(`<!doctype html>
<html><head><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1080px;overflow:hidden;background:#f8eff7}
.icon{position:relative;width:1080px;height:1080px;overflow:hidden;background:linear-gradient(145deg,#fff 0%,#f7e8f5 100%)}
.brand{position:absolute;inset:28px 120px 202px;width:840px;height:850px;object-fit:contain;object-position:center top}
.panel{position:absolute;left:105px;right:105px;bottom:78px;height:220px;border-radius:74px;background:#4b164d;border:10px solid #8da144;display:flex;align-items:center;justify-content:center;gap:48px;box-shadow:0 28px 50px rgba(75,22,77,.22)}
.controls{width:170px;height:120px;fill:none;stroke:#f8eff7;stroke-width:18;stroke-linecap:round}.controls circle{fill:#b7dc48;stroke:#4b164d;stroke-width:10}
.copy{display:flex;flex-direction:column;line-height:.9;color:#f8eff7;font-family:Arial,sans-serif;font-weight:900;letter-spacing:10px;font-size:100px}.copy small{margin-top:20px;color:#b7dc48;font-size:31px;letter-spacing:12px}
</style></head><body><div class="icon">
  <img class="brand" src="${logoUrl}" alt="">
  <div class="panel"><svg class="controls" viewBox="0 0 180 120" aria-hidden="true"><path d="M10 22h160M10 60h160M10 98h160"/><circle cx="56" cy="22" r="17"/><circle cx="124" cy="60" r="17"/><circle cx="76" cy="98" r="17"/></svg><span class="copy">PANEL<small>FONTANA</small></span></div>
</div></body></html>`);
await page.locator(".icon").screenshot({ path: output });
await browser.close();
