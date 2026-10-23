import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { launchBrowser } from "../src/browser/cdp";
import { addPngText, pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { shotName } from "../src/shot/capture";
import { comparePage, darkLooksLikeLight, identicalVariantNotes, identicalVariants, isRtlShot, looksTheSame, missingStateFrames, mockupFrames, pairWithMockup, pairWithSet, renderComparisons } from "../src/shot/compare";
import { encodePng } from "./png-pixels";
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

describe("variants", () => {
  test("screenshot names add +<variant> after the state, before the size and .dark", () => {
    expect(shotName("index", "mobile", "light")).toBe("index.mobile.png");
    expect(shotName("index", "mobile", "light", "men")).toBe("index+men.mobile.png");
    expect(shotName("index@sent", "mobile", "dark", "men")).toBe("index@sent+men.mobile.dark.png");
    expect(shotName("index@sent", "mobile-430", "dark")).toBe("index@sent.mobile-430.dark.png");
  });

  test("a mockup's PNGs include its variants'", () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["home.png", "home.dark.png", "home+men.png", "home+men.dark.png", "home@saved+men.png", "other+men.png"]) writeFileSync(join(dir, f), "x");
    expect(mockupFrames(join(dir, "home.html")).map((f) => f.slice(dir.length + 1))).toEqual(["home+men.dark.png", "home+men.png", "home.dark.png", "home.png", "home@saved+men.png"]);
    expect(mockupFrames(join(dir, "home+men.png")).map((f) => f.slice(dir.length + 1))).toEqual(["home+men.dark.png", "home+men.png"]);
  });

  const setup = () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["home.png", "home.dark.png", "home+men.png", "home+men.dark.png"]) writeFileSync(join(dir, f), pngHeader(820, 1728));
    const shots = ["index.mobile.png", "index.mobile.dark.png", "index+men.mobile.png", "index+men.mobile.dark.png"].map((f) => join(dir, "shots", f));
    return { dir, shots, frames: mockupFrames(join(dir, "home.html")) };
  };
  const names = (dir: string, pairs: { before: string; after: string }[]) => pairs.map((p) => [p.before.slice(dir.length + 1), p.after.slice(dir.length + 1)]);

  test("a variant's shot pairs with the variant's mockup PNG, the default's with the default's", () => {
    const { dir, shots, frames } = setup();
    const pairs = pairWithMockup(frames, shots, join(dir, "compare"));
    expect(names(dir, pairs)).toEqual([
      ["home+men.dark.png", join("shots", "index+men.mobile.dark.png")],
      ["home+men.png", join("shots", "index+men.mobile.png")],
      ["home.dark.png", join("shots", "index.mobile.dark.png")],
      ["home.png", join("shots", "index.mobile.png")],
    ]);
    expect(pairs.some((p) => p.fallback)).toBe(false);
  });

  test("a variant with no mockup PNG falls back to the default's, marked", () => {
    const { dir, shots } = setup();
    const frames = [join(dir, "home.png"), join(dir, "home.dark.png")];
    const pairs = pairWithMockup(frames, shots, join(dir, "compare"));
    expect(names(dir, pairs)).toEqual([
      ["home.png", join("shots", "index.mobile.png")],
      ["home.png", join("shots", "index+men.mobile.png")],
      ["home.dark.png", join("shots", "index.mobile.dark.png")],
      ["home.dark.png", join("shots", "index+men.mobile.dark.png")],
    ]);
    expect(pairs.filter((p) => p.fallback).map((p) => p.variant)).toEqual(["men", "men"]);
    expect(pairs.map((p) => basename(p.out))).toEqual(["home.png", "home+men.png", "home.dark.png", "home+men.dark.png"]);
  });

  test("a state frame in a variant this run didn't capture isn't called missing", () => {
    const { dir, shots } = setup();
    const frames = [join(dir, "home@saved+men.png"), join(dir, "home@saved.png")];
    for (const f of frames) writeFileSync(f, pngHeader(820, 1728));
    const plain = shots.filter((s) => !s.includes("+"));
    expect(missingStateFrames(frames, plain)).toEqual(["saved"]);
    expect(missingStateFrames([frames[0]!], plain)).toEqual([]);
    expect(missingStateFrames([frames[0]!], shots)).toEqual(["saved"]);
  });

  test("a saved set: variant shots pair by name, else with the default's", () => {
    const dir = tempDir("motif-pairs-");
    mkdirSync(join(dir, "before"));
    for (const f of ["index.mobile.png", "settings+men.mobile.png"]) writeFileSync(join(dir, "before", f), "x");
    const shots = ["index.mobile.png", "index+men.mobile.png", "settings+men.mobile.png"].map((f) => join(dir, f));
    const { pairs, added } = pairWithSet(shots, join(dir, "before"), join(dir, "compare"));
    expect(names(dir, pairs)).toEqual([
      [join("before", "index.mobile.png"), "index.mobile.png"],
      [join("before", "index.mobile.png"), "index+men.mobile.png"],
      [join("before", "settings+men.mobile.png"), "settings+men.mobile.png"],
    ]);
    expect(pairs.map((p) => p.fallback ?? false)).toEqual([false, true, false]);
    expect(added).toEqual([]);
  });
});

describe("right to left", () => {
  const names = (dir: string, pairs: { before: string; after: string }[]) => pairs.map((p) => [p.before.slice(dir.length + 1), p.after.slice(dir.length + 1)]);

  test("names with .rtl are right-to-left shots; their state, variant and size read as before", () => {
    expect(isRtlShot("home@filled+men.mobile.rtl.dark.png")).toBe(true);
    expect(isRtlShot(join("shots", "index.mobile-360.rtl.png"))).toBe(true);
    expect(isRtlShot("index.mobile.dark.png")).toBe(false);
    expect(isRtlShot("rtl.mobile.png")).toBe(false);
  });

  test("a saved set: RTL shots pair by name (a variant's with the default's RTL shot), never with left-to-right ones", () => {
    const dir = tempDir("motif-pairs-");
    mkdirSync(join(dir, "before"));
    for (const f of ["index.mobile.png", "index.mobile.rtl.png", "index.mobile.rtl.dark.png"]) writeFileSync(join(dir, "before", f), "x");
    const shots = ["index.mobile.rtl.png", "index+men.mobile.rtl.dark.png", "about.mobile.rtl.png"].map((f) => join(dir, f));
    const { pairs, added } = pairWithSet(shots, join(dir, "before"), join(dir, "compare"));
    expect(names(dir, pairs)).toEqual([
      [join("before", "index.mobile.rtl.png"), "index.mobile.rtl.png"],
      [join("before", "index.mobile.rtl.dark.png"), "index+men.mobile.rtl.dark.png"],
    ]);
    expect(pairs.map((p) => [p.variant, p.fallback ?? false])).toEqual([[undefined, false], ["men", true]]);
    expect(added).toEqual([join(dir, "about.mobile.rtl.png")]);
  });

  test("a mockup's PNGs never pair with RTL shots, and a state captured only right to left isn't one the run has", () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["home.png", "home@saved.png"]) writeFileSync(join(dir, f), pngHeader(820, 1728));
    const shots = ["index.mobile.png", "index.mobile.rtl.png", "index@saved.mobile.rtl.png"].map((f) => join(dir, "shots", f));
    const frames = mockupFrames(join(dir, "home.html"));
    expect(names(dir, pairWithMockup(frames, shots, join(dir, "compare")))).toEqual([["home.png", join("shots", "index.mobile.png")]]);
    expect(missingStateFrames(frames, shots)).toEqual(["saved"]);
  });
});

describe("variants that look like the default", () => {
  const write = (dir: string, files: Record<string, string>) =>
    Object.entries(files).map(([name, content]) => {
      writeFileSync(join(dir, name), content);
      return join(dir, name);
    });

  test("a variant whose every screenshot is byte-identical to the default's of the same screen, size, scheme and direction", () => {
    const dir = tempDir("motif-same-");
    const shots = write(dir, {
      "index.mobile.png": "a", "index.mobile.dark.png": "b", "index.mobile.rtl.png": "c", "index@sent.mobile.png": "d",
      "index+men.mobile.png": "a", "index+men.mobile.dark.png": "b", "index+men.mobile.rtl.png": "c", "index@sent+men.mobile.png": "d",
      "index+kids.mobile.png": "a", "index+kids.mobile.dark.png": "B", "index+kids.mobile.rtl.png": "c",
    });
    expect(identicalVariants(shots)).toEqual(["men"]);
    expect(identicalVariantNotes(shots, "data-variant on <html>")).toEqual([
      "The men variant looks the same as the default on every screen: the app may not switch variants the way Motif sets them (data-variant on <html>).",
    ]);
  });

  test("nothing to say without variants, or when a variant's screenshot has no default to compare with", () => {
    const dir = tempDir("motif-same-");
    expect(identicalVariants(write(dir, { "index.mobile.png": "a", "index.mobile.dark.png": "a" }))).toEqual([]);
    expect(identicalVariants(write(dir, { "about+men.mobile.png": "a" }))).toEqual([]);
  });
});

describe("darkLooksLikeLight (Task 7)", () => {
  test("every dark screenshot byte-identical to its light twin, in any variant, state or direction", () => {
    const dir = tempDir("motif-dark-");
    const files: Record<string, string> = {
      "index.mobile.png": "a", "index.mobile.dark.png": "a", "index@open+men.mobile.rtl.png": "b", "index@open+men.mobile.rtl.dark.png": "b",
    };
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    const shots = Object.keys(files).map((f) => join(dir, f));
    expect(darkLooksLikeLight(shots)).toBe(true);
    writeFileSync(join(dir, "index@open+men.mobile.rtl.dark.png"), "c");
    expect(darkLooksLikeLight(shots)).toBe(false);
    // No dark screenshots, or one without its light twin: nothing to say.
    expect(darkLooksLikeLight([join(dir, "index.mobile.png")])).toBe(false);
    expect(darkLooksLikeLight([join(dir, "index.mobile.dark.png")])).toBe(false);
  });
});

describe("nearly the same pictures count as the same (v0.5.0 sweep, HiSalon problem 7)", () => {
  // A 200 × 200 screen: a white page with a dark header, as an app draws it light.
  const SIZE = 200;
  type Paint = (x: number, y: number) => [number, number, number] | undefined;
  const page = (...paints: Paint[]) => {
    const rgba = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [r, g, b] = paints.reduce<[number, number, number] | undefined>((c, p) => c ?? p(x, y), undefined) ?? (y < 40 ? [20, 30, 40] : [255, 255, 255]);
        rgba.set([r, g, b, 255], (y * SIZE + x) * 4);
      }
    }
    return encodePng(SIZE, SIZE, rgba);
  };
  const INK: [number, number, number] = [40, 40, 40];
  /**
   * A spinner's glyph of side n px at (100, 100), ink on the page, drawn at one of two angles: one half of its box at the
   * first, the other half at the second. Between the angles nearly n × n pixels differ, and both colours are in both.
   */
  const spinner = (n: number, angle: 0 | 1): Paint => (x, y) => {
    const [dx, dy] = [x - 100, y - 100];
    if (dx < 0 || dy < 0 || dx >= n || dy >= n || dx === dy) return undefined;
    return (dx < dy) === (angle === 0) ? INK : [255, 255, 255];
  };
  const light = page(spinner(12, 0));
  const dark = page((_x, y) => (y < 40 ? [20, 30, 40] : [18, 18, 18]));
  const write = (dir: string, files: Record<string, Uint8Array>) =>
    Object.entries(files).map(([name, bytes]) => {
      writeFileSync(join(dir, name), bytes);
      return join(dir, name);
    });

  test("a dark screenshot that differs from light only in a spinner's angle (0.33% of its pixels) looks like light", () => {
    const dir = tempDir("motif-near-");
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": light, "index.mobile.dark.png": page(spinner(12, 1)) }))).toBe(true);
  });

  test("a variant that differs from the default only in a spinner's angle looks like the default", () => {
    const dir = tempDir("motif-near-");
    const shots = write(dir, { "index.mobile.png": light, "index+men.mobile.png": page(spinner(12, 1)) });
    expect(identicalVariants(shots)).toEqual(["men"]);
  });

  test("a text field's caret, shown in one and blinked off in the other, is the same", () => {
    const dir = tempDir("motif-near-");
    const caret: Paint = (x, y) => (x >= 60 && x < 62 && y >= 150 && y < 170 ? INK : undefined);
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": page(caret), "index.mobile.dark.png": page() }))).toBe(true);
  });

  test("colours a few steps apart in every pixel (8 of 255 or fewer) are the same", () => {
    const dir = tempDir("motif-near-");
    const shifted = page((_x, y) => (y < 40 ? [28, 22, 48] : [247, 250, 255]));
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": page(), "index.mobile.dark.png": shifted }))).toBe(true);
  });

  test("a variant whose only change is a new colour in under 0.5% of the pixels isn't the same: an accent button, a run of links", () => {
    const dir = tempDir("motif-near-");
    const button = (c: [number, number, number]): Paint => (x, y) => (x >= 50 && x < 64 && y >= 100 && y < 114 ? c : undefined);
    expect(identicalVariants(write(dir, { "index.mobile.png": page(button([37, 99, 235])), "index+rose.mobile.png": page(button([225, 29, 72])) }))).toEqual([]);
    const links = (c: [number, number, number]): Paint => (x, y) => (x >= 20 && x < 100 && y >= 60 && y < 67 && (x + y) % 3 === 0 ? c : undefined);
    expect(identicalVariants(write(dir, { "home.mobile.png": page(links([37, 99, 235])), "home+rose.mobile.png": page(links([225, 29, 72])) }))).toEqual([]);
  });

  test("a real dark mode, a change in 1% of the pixels, a change of 9 steps, or another size isn't the same", () => {
    const dir = tempDir("motif-near-");
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": page(), "index.mobile.dark.png": dark }))).toBe(false);
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": page(spinner(22, 0)), "index.mobile.dark.png": page(spinner(22, 1)) }))).toBe(false);
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": page(), "index.mobile.dark.png": page((_x, y) => (y < 40 ? [20, 30, 40] : [246, 255, 255])) }))).toBe(false);
    const wide = encodePng(SIZE + 1, SIZE, new Uint8Array((SIZE + 1) * SIZE * 4).fill(255));
    expect(darkLooksLikeLight(write(dir, { "index.mobile.png": page(), "index.mobile.dark.png": wide }))).toBe(false);
    expect(identicalVariants(write(dir, { "index.mobile.png": page(), "index+men.mobile.png": dark }))).toEqual([]);
  });
});

// Fix round 2: the review's real-browser pictures (aa.ts, links.ts). Anti-aliasing spreads a recoloured link over many
// colours, so only its hue gives it away; text moved by a pixel, a spinner, a shimmer and a caret must stay the same.
describe.skipIf(!browser)("real pictures from a browser: what's the same and what isn't (needs Chrome, Edge or Chromium)", () => {
  const para = (dx: number, dy: number, color = "#111", extra = "") => `
<div style="padding:16px">
<h1 style="font-size:24px;margin:0 0 8px">Bookings</h1>
<p style="margin:0 0 12px">Your next appointment is on Thursday at 10:30 with Sara.</p>
<p style="margin:0 0 12px;position:relative;left:${dx}px;top:${dy}px;color:${color}">Tap to reschedule or cancel up to 24 hours before.</p>
<p style="margin:0 0 12px">Other text that stays put on this screen.</p>${extra}</div>`;
  const spinner = (deg: number) =>
    `<div style="position:absolute;left:150px;top:400px;width:90px;height:44px;background:#2563eb;border-radius:8px;display:flex;align-items:center;justify-content:center"><div style="width:20px;height:20px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;transform:rotate(${deg}deg)"></div></div>`;
  const shimmer = (pos: number) =>
    `<div style="margin:16px;width:120px;height:12px;border-radius:4px;background:linear-gradient(90deg,#e5e7eb 0%,#e5e7eb ${pos}%,#f3f4f6 ${pos + 15}%,#e5e7eb ${pos + 30}%,#e5e7eb 100%)"></div>`;
  const caret = (on: boolean) =>
    `<div style="margin:16px;border:1px solid #ccc;border-radius:6px;height:40px;position:relative"><span style="position:absolute;left:12px;top:10px">Search</span>${on ? '<span style="position:absolute;left:70px;top:9px;width:2px;height:22px;background:#2563eb"></span>' : ""}</div>`;
  const link = (color: string) => `<div style="padding:16px"><p style="margin:0 0 8px;color:${color}">Forgot your password? Reset it here</p></div>`;
  const cases: [string, string, string, boolean][] = [
    ["a line of link text recoloured from blue to rose", link("#2563eb"), link("#e11d48"), false],
    ["a paragraph of links recoloured", para(0, 0, "#2563eb"), para(0, 0, "#e11d48"), false],
    ["text moved 1px right", para(0, 0), para(1, 0), true],
    ["text moved half a pixel", para(0, 0), para(0.5, 0.5), true],
    ["a blue link moved 1px", para(0, 0, "#2563eb"), para(1, 0, "#2563eb"), true],
    ["a white spinner on a blue button, turned", para(0, 0, "#111", spinner(0)), para(0, 0, "#111", spinner(120)), true],
    ["a loading shimmer, moved on", para(0, 0, "#111", shimmer(10)), para(0, 0, "#111", shimmer(50)), true],
    ["a blue caret, blinked off", para(0, 0, "#111", caret(true)), para(0, 0, "#111", caret(false)), true],
  ];

  test("at 1x, 2x and 3x", async () => {
    const dir = tempDir("motif-real-");
    const b = await launchBrowser(browser!.path);
    const results: string[] = [];
    const expected: string[] = [];
    try {
      const page = await b.newPage();
      const shot = async (body: string, scale: number, name: string) => {
        await page.setViewport(390, 844, scale, true);
        await page.goto("data:text/html," + encodeURIComponent(`<html><body style="margin:0;background:#fff;font:16px/1.4 system-ui, sans-serif;color:#111">${body}</body></html>`));
        const path = join(dir, name);
        writeFileSync(path, await page.screenshot());
        return path;
      };
      for (const scale of [1, 2, 3]) {
        for (const [label, x, y, same] of cases) {
          const [pa, pb] = [await shot(x, scale, "a.png"), await shot(y, scale, "b.png")];
          results.push(`${scale}x ${label}: ${looksTheSame(pa, pb) ? "same" : "different"}`);
          expected.push(`${scale}x ${label}: ${same ? "same" : "different"}`);
        }
      }
    } finally {
      await b.close();
    }
    expect(results).toEqual(expected);
  }, 120_000);
});
