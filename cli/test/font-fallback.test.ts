import { afterAll, describe, expect, test } from "bun:test";
import { findBrowser } from "../src/detect/browser";
import { buildTheme } from "../src/generate/theme";
import { renderPngs } from "../src/preview/render";
import { startPreviewServer } from "../src/preview/server";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const browser = findBrowser();
const MOCKUP = '<!doctype html><html><head><title>A</title></head><body><div class="mk-stage"><div class="mk-frame mk-phone mk-ios"><p class="mk-body">Hello</p></div></div></body></html>';

/** A theme whose fonts aren't bundled with Motif, so mockups fetch them. */
function googleFontTheme() {
  const tokens = validTokens();
  tokens.primitive.font.sans.$value = ["Plus Jakarta Sans", "system-ui", "sans-serif"];
  return tokens;
}

describe.skipIf(!browser)("theme fonts on a network that doesn't answer (needs Chrome, Edge or Chromium)", () => {
  test("a font server that never answers can't hold a mockup up: it renders with the fallback, and says so", async () => {
    const hang = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Promise<Response>(() => {}) });
    const tokens = googleFontTheme();
    const root = makeProject({ "design/tokens.json": JSON.stringify(tokens), "design/previews/home.html": MOCKUP });
    const server = startPreviewServer({ root, theme: buildTheme(docFrom(tokens)), fontCssUrl: () => `http://127.0.0.1:${hang.port}/css` });
    try {
      const started = Date.now();
      const result = await renderPngs({
        browserPath: browser!.path,
        outDir: tempDir("motif-fonts-"),
        targets: [{ name: "home", url: `${server.url}/design/previews/home.html`, fonts: ["Plus Jakarta Sans"] }],
      });
      expect(result.files).toHaveLength(2);
      expect(result.missingFonts).toEqual(["Plus Jakarta Sans"]);
      expect(Date.now() - started).toBeLessThan(20_000);
    } finally {
      server.stop();
      hang.stop(true);
    }
  }, 90_000);
});
