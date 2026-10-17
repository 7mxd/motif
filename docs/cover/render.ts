// Renders docs/cover.png (2560×1280) from cover.html with Motif's own browser client: bun docs/cover/render.ts
// light.png and dark.png are motif shot screenshots of the sample site: `bun tests/fixtures/assemble.ts plain-contract-site <dir>`,
// then `motif shot --state design/states/sent.js` in <dir> (index.mobile.png and index@sent.mobile.dark.png).
import { existsSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { launchBrowser } from "../../cli/src/browser/cdp";
import { findBrowser } from "../../cli/src/detect/browser";

const repo = resolve(import.meta.dir, "../..");
const TYPES: Record<string, string> = { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2" };

const found = findBrowser();
if (!found) {
  console.error('No Chrome or Edge found. Install one, or run "motif browser install".');
  process.exit(1);
}
// The repo's files only, on this computer only: the page loads its fonts from skill/preview-kit/fonts.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req) {
    const file = resolve(join(repo, decodeURIComponent(new URL(req.url).pathname)));
    if (!file.startsWith(repo + sep) || !existsSync(file) || statSync(file).isDirectory()) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" } });
  },
});
const browser = await launchBrowser(found.path);
try {
  const page = await browser.newPage({ isolated: true });
  await page.setViewport(1280, 640, 2, false);
  await page.goto(`http://127.0.0.1:${server.port}/docs/cover/cover.html`);
  await page.evaluate("Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())])");
  const missing = await page.evaluate<string[]>("[...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family)");
  const errors = page.takeErrors();
  if (missing.length || errors.length) throw new Error(`The cover didn't render cleanly: ${[...missing.map((f) => `${f} not loaded`), ...errors].join("; ")}`);
  writeFileSync(join(repo, "docs", "cover.png"), await page.screenshot());
  console.log("Wrote docs/cover.png");
} finally {
  await browser.close();
  server.stop(true);
}
