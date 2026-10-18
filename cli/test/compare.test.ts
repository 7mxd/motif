import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../src/browser/cdp";
import { addPngText, pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { comparePage, missingStateFrames, mockupFrames, pairWithMockup, pairWithSet, renderComparisons } from "../src/shot/compare";
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

  test("a mockup's PNGs, found from its .html; a PNG brings its light or dark twin", () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["home.png", "home-2.png", "home.dark.png", "home-2.dark.png", "homepage.png", "other.png"]) writeFileSync(join(dir, f), "x");
    const expected = ["home-2.dark.png", "home-2.png", "home.dark.png", "home.png"].map((f) => join(dir, f));
    expect(mockupFrames(join(dir, "home.html"))).toEqual(expected);
    expect(mockupFrames(join(dir, "home.dark.png"))).toEqual([join(dir, "home.dark.png"), join(dir, "home.png")]);
    expect(mockupFrames(join(dir, "missing", "x.html"))).toEqual([]);
  });

  test("neighbouring mockups with numbered names keep their own PNGs", () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["step-1.html", "step-2.html", "step-3.html", "step-1.png", "step-2.png", "step-2-2.png", "step-2.dark.png", "step-3.png"]) writeFileSync(join(dir, f), "x");
    expect(mockupFrames(join(dir, "step-2.html"))).toEqual(["step-2-2.png", "step-2.dark.png", "step-2.png"].map((f) => join(dir, f)));
    expect(mockupFrames(join(dir, "step-1.html"))).toEqual([join(dir, "step-1.png")]);
    writeFileSync(join(dir, "home.html"), "x");
    writeFileSync(join(dir, "home-2.html"), "x");
    writeFileSync(join(dir, "home.png"), "x");
    writeFileSync(join(dir, "home-2.png"), "x");
    expect(mockupFrames(join(dir, "home.html"))).toEqual([join(dir, "home.png")]);
  });

  test("a mockup in a subfolder finds the PNGs motif preview wrote to design/previews", () => {
    const root = tempDir("motif-mockup-");
    mkdirSync(join(root, "design", "previews", "onboarding"), { recursive: true });
    writeFileSync(join(root, "design", "previews", "onboarding", "welcome.html"), "x");
    writeFileSync(join(root, "design", "previews", "welcome.png"), "x");
    expect(mockupFrames(join(root, "design", "previews", "onboarding", "welcome.html"), [join(root, "design", "previews")])).toEqual([
      join(root, "design", "previews", "welcome.png"),
    ]);
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

  test("a frame of a state pairs with that state's screenshot, and a plain frame with the plain page (hands-on test)", () => {
    // In the hands-on test the "five recent recipes" frame was put next to the empty first screen.
    const dir = tempDir("motif-mockup-");
    for (const f of ["recent.png", "recent.dark.png", "recent@list.png", "recent@list.dark.png", "recent@folded.png"]) writeFileSync(join(dir, f), pngHeader(820, 1728));
    const frames = mockupFrames(join(dir, "recent.html"));
    expect(frames.map((f) => f.slice(dir.length + 1))).toEqual(["recent.dark.png", "recent.png", "recent@folded.png", "recent@list.dark.png", "recent@list.png"]);
    // A state's screenshot can come before the plain one; each frame still finds its own.
    const shots = ["index@list.mobile.png", "index@list.mobile.dark.png", "index.mobile.png", "index.mobile.dark.png", "index@list.mobile-430.png"].map((f) => join(dir, "shots", f));
    const pairs = pairWithMockup(frames, shots, join(dir, "compare"));
    expect(pairs.map((p) => [p.before.slice(dir.length + 1), p.after.slice(dir.length + 1)])).toEqual([
      ["recent.dark.png", join("shots", "index.mobile.dark.png")],
      ["recent.png", join("shots", "index.mobile.png")],
      ["recent@list.dark.png", join("shots", "index@list.mobile.dark.png")],
      ["recent@list.png", join("shots", "index@list.mobile.png")],
    ]);
    // The folded state wasn't captured this run: it's named, not skipped silently.
    expect(missingStateFrames(frames, shots)).toEqual(["folded"]);
  });
});

describe("the frame around what was on screen (Plan 2C)", () => {
  test("is drawn where the screenshot recorded it, scaled to the column", () => {
    const html = comparePage(["Before", "Now"], 430, 0, [{ width: 430, top: 600, height: 855 }, null]);
    expect(html.match(/class="screen"/g)).toHaveLength(1);
    expect(html).toContain("top: 600px; height: 855px");
    expect(html).toContain("On screen");
    // A desktop screenshot (1440 CSS px) is shown 720 px wide: half the size.
    expect(comparePage(["Before", "Now"], 720, 0, [{ width: 1440, top: 0, height: 900 }, { width: 1440, top: 0, height: 900 }])).toContain("top: 0px; height: 450px");
    // Mockups and sets saved before this change have no record, and no frame.
    expect(comparePage(["Mockup", "The app now"], 390, 0, [null, null])).not.toContain('class="screen"');
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

  test("screenshots carrying what was on screen still open and measure as before", async () => {
    const dir = tempDir("motif-compare-");
    const shot = addPngText(await screenshotOf("<p>Same</p>"), "motif:screen", JSON.stringify({ width: 200, top: 0, height: 150 }));
    writeFileSync(join(dir, "a.png"), shot);
    writeFileSync(join(dir, "b.png"), shot);
    const [result] = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Before", "Now"],
      measure: true,
      pairs: [{ before: join(dir, "a.png"), after: join(dir, "b.png"), out: join(dir, "out.png") }],
    });
    expect(result!.changed).toBe(0);
  }, 60_000);

  test("says whether content moved down or the page grew, and the image is as tall as its content (backlog)", async () => {
    const dir = tempDir("motif-compare-");
    const block = (h: number, c: string) => `<div style="height: ${h}px; background: ${c}"></div>`;
    const full = async (body: string) => {
      const b = await launchBrowser(browser!.path);
      try {
        const page = await b.newPage();
        await page.setViewport(200, 100, 2);
        await page.goto("data:text/html," + encodeURIComponent(`<body style="margin: 0; background: #ffffff">${body}</body>`));
        const height = await page.evaluate<number>("document.documentElement.scrollHeight");
        return await page.screenshot({ x: 0, y: 0, width: 200, height });
      } finally {
        await b.close();
      }
    };
    writeFileSync(join(dir, "before.png"), await full(block(100, "#e11d48") + block(150, "#2563eb")));
    writeFileSync(join(dir, "added.png"), await full(block(100, "#e11d48") + block(50, "#16a34a") + block(150, "#2563eb")));
    writeFileSync(join(dir, "grown.png"), await full(block(100, "#e11d48") + block(200, "#2563eb")));
    const [added, grown] = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Before", "Now"],
      measure: true,
      pairs: [
        { before: join(dir, "before.png"), after: join(dir, "added.png"), out: join(dir, "out", "added.png") },
        { before: join(dir, "before.png"), after: join(dir, "grown.png"), out: join(dir, "out", "grown.png") },
      ],
    });
    expect(added).toMatchObject({ taller: 50, moved: true });
    expect(Math.abs(added!.from! - 100)).toBeLessThanOrEqual(2);
    expect(grown).toMatchObject({ taller: 50, moved: false });
    expect(Math.abs(grown!.from! - 250)).toBeLessThanOrEqual(2);
    // Short pages make short images: no 900 px floor.
    expect(pngSize(new Uint8Array(readFileSync(join(dir, "out", "added.png")))).height).toBeLessThan(900 * 2);
  }, 60_000);

  test("on real text pages, an insert or a removal reads as moved, from where it happened (review of batch B)", async () => {
    const dir = tempDir("motif-compare-");
    const text = (n: number) => Array.from({ length: n }, (_, i) => `<p style="margin: 0 0 8px; font: 16px/1.4 sans-serif">Line ${i + 1} of the page, with some words.</p>`).join("");
    const shot = async (body: string) => {
      const b = await launchBrowser(browser!.path);
      try {
        const page = await b.newPage();
        await page.setViewport(390, 100, 2);
        await page.goto("data:text/html," + encodeURIComponent(`<body style="margin: 0; padding: 16px; background: #ffffff">${body}</body>`));
        const height = await page.evaluate<number>("document.documentElement.scrollHeight");
        return await page.screenshot({ x: 0, y: 0, width: 390, height });
      } finally {
        await b.close();
      }
    };
    const banner = '<div style="height: 37px; background: #2563eb"></div>';
    writeFileSync(join(dir, "before.png"), await shot(text(10) + text(10)));
    writeFileSync(join(dir, "inserted.png"), await shot(text(10) + banner + text(10)));
    writeFileSync(join(dir, "removed.png"), await shot(text(10) + text(4)));
    const [inserted, removed, takenOut] = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Before", "Now"],
      measure: true,
      pairs: [
        { before: join(dir, "before.png"), after: join(dir, "inserted.png"), out: join(dir, "out", "inserted.png") },
        { before: join(dir, "before.png"), after: join(dir, "removed.png"), out: join(dir, "out", "removed.png") },
        { before: join(dir, "inserted.png"), after: join(dir, "before.png"), out: join(dir, "out", "taken-out.png") },
      ],
    });
    expect(inserted).toMatchObject({ taller: 37, moved: true });
    expect(takenOut).toMatchObject({ taller: -37, moved: true });
    expect(Math.abs(inserted!.from! - takenOut!.from!)).toBeLessThanOrEqual(2);
    expect(removed!.moved).toBe(false); // the end of the page was cut: nothing below the change is the same
    expect(removed!.taller).toBeLessThan(0);
  }, 60_000);

  test("nothing to compare is not an error", async () => {
    expect(await renderComparisons({ browserPath: browser!.path, labels: ["Before", "Now"], measure: true, pairs: [] })).toEqual([]);
  });
});
