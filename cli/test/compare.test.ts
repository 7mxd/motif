import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../src/browser/cdp";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { mockupFrames, pairWithMockup, pairWithSet, renderComparisons } from "../src/shot/compare";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

/** Just enough of a PNG for pngSize: the signature and an IHDR chunk with this width and height. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("pairing", () => {
  test("with a saved set, by file name; screenshots the set doesn't have are new", () => {
    const dir = tempDir("motif-pairs-");
    mkdirSync(join(dir, "before"));
    writeFileSync(join(dir, "before", "index.mobile.png"), "x");
    const shots = [join(dir, "index.mobile.png"), join(dir, "settings.mobile.png")];
    const { pairs, added } = pairWithSet(shots, join(dir, "before"), join(dir, "compare", "before"));
    expect(pairs).toEqual([{ before: join(dir, "before", "index.mobile.png"), after: shots[0]!, out: join(dir, "compare", "before", "index.mobile.png") }]);
    expect(added).toEqual([shots[1]!]);
  });

  test("a mockup's PNGs, found from its .html or from any of its PNGs", () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["home.png", "home-2.png", "home.dark.png", "home-2.dark.png", "homepage.png", "other.png"]) writeFileSync(join(dir, f), "x");
    const expected = ["home-2.dark.png", "home-2.png", "home.dark.png", "home.png"].map((f) => join(dir, f));
    expect(mockupFrames(join(dir, "home.html"))).toEqual(expected);
    expect(mockupFrames(join(dir, "home.dark.png"))).toEqual(expected);
    expect(mockupFrames(join(dir, "missing", "x.html"))).toEqual([]);
  });

  test("phone frames pair with mobile screenshots, wider frames with desktop, dark with dark", () => {
    const dir = tempDir("motif-mockup-");
    writeFileSync(join(dir, "home.png"), pngHeader(820, 1728));
    writeFileSync(join(dir, "home.dark.png"), pngHeader(820, 1728));
    writeFileSync(join(dir, "home-2.png"), pngHeader(2880, 1800));
    const shots = ["index.mobile.png", "index.mobile.dark.png", "index.desktop.png", "index.desktop.dark.png"].map((f) => join(dir, "shots", f));
    const pairs = pairWithMockup(mockupFrames(join(dir, "home.html")), shots, join(dir, "compare"));
    expect(pairs.map((p) => [p.before.slice(dir.length + 1), p.after.slice(dir.length + 1), p.out.slice(dir.length + 1)])).toEqual([
      ["home-2.png", join("shots", "index.desktop.png"), join("compare", "home-2.png")],
      ["home.dark.png", join("shots", "index.mobile.dark.png"), join("compare", "home.dark.png")],
      ["home.png", join("shots", "index.mobile.png"), join("compare", "home.png")],
    ]);
  });
});

const browser = findBrowser();

/** A real 2× screenshot (400×600 px) of a 200×300 page. */
async function screenshotOf(body: string): Promise<Uint8Array> {
  const b = await launchBrowser(browser!.path);
  try {
    const page = await b.newPage();
    await page.setViewport(200, 300, 2);
    await page.goto("data:text/html," + encodeURIComponent(`<body style="margin: 0; background: #ffffff">${body}</body>`));
    return await page.screenshot();
  } finally {
    await b.close();
  }
}

describe.skipIf(!browser)("renderComparisons (needs Chrome, Edge or Chromium)", () => {
  test("side by side, with how much of the page changed", async () => {
    const dir = tempDir("motif-compare-");
    const box = (top: number) => `<div style="position: absolute; left: 20px; top: ${top}px; width: 100px; height: 100px; background: #e11d48"></div>`;
    writeFileSync(join(dir, "before.png"), await screenshotOf(box(20)));
    writeFileSync(join(dir, "after.png"), await screenshotOf(box(160)));
    writeFileSync(join(dir, "same.png"), await screenshotOf(box(20)));
    const results = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Before", "Now"],
      measure: true,
      pairs: [
        { before: join(dir, "before.png"), after: join(dir, "after.png"), out: join(dir, "out", "moved.png") },
        { before: join(dir, "before.png"), after: join(dir, "same.png"), out: join(dir, "out", "same.png") },
      ],
    });
    expect(results[0]!.changed).toBeGreaterThan(20); // two 100×100 boxes out of 200×300 ≈ 33 %
    expect(results[1]!.changed).toBe(0);
    // 400 px wide 2× screenshots are shown 200 CSS px wide per side, plus margins, captured at 2×.
    expect(pngSize(new Uint8Array(readFileSync(join(dir, "out", "moved.png")))).width).toBe((200 * 2 + 48) * 2);
  }, 60_000);

  test("mockup comparisons are side by side without a measure", async () => {
    const dir = tempDir("motif-compare-");
    writeFileSync(join(dir, "a.png"), await screenshotOf("<p>Mockup</p>"));
    writeFileSync(join(dir, "b.png"), await screenshotOf("<p>App</p>"));
    const [result] = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Mockup", "The app now"],
      measure: false,
      pairs: [{ before: join(dir, "a.png"), after: join(dir, "b.png"), out: join(dir, "out.png") }],
    });
    expect(result!.changed).toBeUndefined();
    expect(pngSize(new Uint8Array(readFileSync(join(dir, "out.png")))).width).toBe(896);
  }, 60_000);

  test("nothing to compare is not an error", async () => {
    expect(await renderComparisons({ browserPath: browser!.path, labels: ["Before", "Now"], measure: true, pairs: [] })).toEqual([]);
  });
});
