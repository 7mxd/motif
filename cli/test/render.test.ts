import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { pngName, renderPngs } from "../src/preview/render";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const browser = findBrowser();
const page = (body: string, css = "") =>
  "data:text/html," +
  encodeURIComponent(`<!doctype html><html><head><style>body { margin: 0 } .mk-frame { width: 200px; height: 100px; margin: 8px; background: #ccc } ${css}</style></head><body>${body}</body></html>`);
const size = (file: string) => pngSize(new Uint8Array(readFileSync(file)));

describe("pngName", () => {
  test("numbers extra frames and marks dark ones", () => {
    expect(pngName("home", 0, "light")).toBe("home.png");
    expect(pngName("home", 1, "light")).toBe("home-2.png");
    expect(pngName("home", 0, "dark")).toBe("home.dark.png");
    expect(pngName("home", 2, "dark")).toBe("home-3.dark.png");
    // A frame of a state is named after it, like the state's screenshots (index@recent.mobile.png).
    expect(pngName("home", 1, "light", "recent")).toBe("home@recent.png");
    expect(pngName("home", 1, "dark", "recent")).toBe("home@recent.dark.png");
  });
});

describe.skipIf(!browser)("renderPngs (needs Chrome, Edge or Chromium)", () => {
  test("one PNG per frame at 2×, light then dark, with reduced motion emulated", async () => {
    const out = tempDir("motif-render-");
    const { files } = await renderPngs({
      browserPath: browser!.path,
      outDir: join(out, "previews"),
      targets: [{
        name: "one",
        url: page(
          '<div class="mk-frame"></div>',
          "@media (prefers-color-scheme: dark) { .mk-frame { width: 300px } } @media (prefers-reduced-motion: reduce) { .mk-frame { height: 120px } }",
        ),
      }],
    });
    expect(files).toEqual([join(out, "previews", "one.png"), join(out, "previews", "one.dark.png")]);
    expect(size(files[0]!)).toEqual({ width: 400, height: 240 });
    expect(size(files[1]!)).toEqual({ width: 600, height: 240 });
  }, 60_000);

  test("several frames give numbered PNGs; hidden frames are skipped; a page without frames is captured whole", async () => {
    const out = tempDir("motif-render-");
    const { files } = await renderPngs({
      browserPath: browser!.path,
      outDir: out,
      targets: [
        { name: "two", url: page('<div class="mk-frame"></div><div class="mk-frame" style="height: 1500px"></div><div class="mk-frame" style="display: none"></div>') },
        { name: "plain", url: page('<div style="width: 300px; height: 2000px"></div>') },
      ],
    });
    expect(files.map((f) => f.slice(out.length + 1))).toEqual(["two.png", "two-2.png", "two.dark.png", "two-2.dark.png", "plain.png", "plain.dark.png"]);
    expect(size(join(out, "two.png"))).toEqual({ width: 400, height: 200 });
    expect(size(join(out, "two-2.png"))).toEqual({ width: 400, height: 3000 });
    expect(size(join(out, "plain.png"))).toEqual({ width: 3200, height: 4000 });
  }, 60_000);

  test("a frame marked with data-state is named after its state; a repeated or unusable name falls back to a number", async () => {
    const out = tempDir("motif-render-");
    const frames = ['<div class="mk-frame"></div>', '<div class="mk-frame" data-state="recent"></div>', '<div class="mk-frame" data-state="recent"></div>', '<div class="mk-frame" data-state="not ok!"></div>'];
    const { files } = await renderPngs({ browserPath: browser!.path, outDir: out, targets: [{ name: "home", url: page(frames.join("")) }] });
    expect(files.map((f) => f.slice(out.length + 1))).toEqual([
      "home.png", "home@recent.png", "home-3.png", "home-4.png", "home.dark.png", "home@recent.dark.png", "home-3.dark.png", "home-4.dark.png",
    ]);
  }, 60_000);

  test("a page that can't be opened is a plain error, and the browser is closed", async () => {
    const out = tempDir("motif-render-");
    await expect(renderPngs({ browserPath: browser!.path, outDir: out, targets: [{ name: "x", url: "http://127.0.0.1:1/" }], timeoutMs: 30_000 })).rejects.toThrow("Couldn't open");
  }, 60_000);

  test("names fonts that couldn't load, and still renders", async () => {
    const font = readFileSync(join(import.meta.dir, "../../skill/preview-kit/fonts/inter.woff2"));
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/good.woff2") return new Response(font, { headers: { "content-type": "font/woff2" } });
        if (path !== "/") return new Response("Not found", { status: 404 });
        const html = `<!doctype html><html><head><style>
          @font-face { font-family: "Good"; src: url("/good.woff2") format("woff2"); }
          @font-face { font-family: "Gone"; src: url("/gone.woff2") format("woff2"); }
          body { margin: 0 } .mk-frame { width: 200px; height: 100px; background: #eee }
        </style></head><body><div class="mk-frame"><p style="font-family: Good">A</p><p style="font-family: Gone">B</p></div></body></html>`;
        return new Response(html, { headers: { "content-type": "text/html" } });
      },
    });
    try {
      const out = tempDir("motif-render-");
      const started = Date.now();
      const result = await renderPngs({
        browserPath: browser!.path,
        outDir: out,
        targets: [{ name: "fonts", url: `http://127.0.0.1:${server.port}/`, fonts: ["Good", "Gone", "Never Declared"] }],
      });
      expect(result.files).toHaveLength(2);
      expect(result.missingFonts.sort()).toEqual(["Gone", "Never Declared"]);
      expect(Date.now() - started).toBeLessThan(30_000);
    } finally {
      server.stop(true);
    }
  }, 60_000);
});
