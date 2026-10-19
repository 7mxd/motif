import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { launchBrowser } from "../browser/cdp";
import { pngSize } from "../browser/png";
import { MAX_HEIGHT, screenOf, type Screen } from "./capture";

export interface ComparePair {
  before: string;
  after: string;
  /** Where the side-by-side image goes. */
  out: string;
  /** The design variant of the screenshot (none for the default). */
  variant?: string;
  /** Set when the variant had nothing of its own to compare with, so the default's was used. */
  fallback?: boolean;
}

export interface Comparison extends ComparePair {
  /** How much of the page looks different, in percent (before/after comparisons only). */
  changed?: number;
  /** How much taller the page is now, in CSS px (negative when shorter). */
  taller?: number;
  /** Where the first difference is, in CSS px from the top. */
  from?: number;
  /** Whether everything below the first difference is unchanged, only moved by `taller` (something was added or removed). */
  moved?: boolean;
}

/** The design variant a name carries before its size or .dark: index@sent+men.mobile.png, home+men.dark.png → "men". */
const VARIANT = /\+([a-z][a-z0-9-]*)(?=(\.[a-z0-9-]+)*\.png$)/;
const variantOf = (file: string): string | undefined => basename(file).match(VARIANT)?.[1];
/** The same name without its variant (index+men.mobile.png → index.mobile.png). */
const withoutVariant = (file: string) => file.replace(VARIANT, "");
/** The same name in a variant (home.dark.png → home+men.dark.png), after any state. */
const inVariant = (file: string, variant: string) => file.replace(/((?:\.[a-z0-9-]+)*\.png)$/, `+${variant}$1`);
/** A right-to-left screenshot: .rtl after its size, before any .dark (home@filled+men.mobile.rtl.dark.png). */
export const isRtlShot = (file: string): boolean => /\.[a-z0-9-]+\.rtl(\.dark)?\.png$/.test(basename(file));

/**
 * Pairs this run's screenshots with a saved set by file name; screenshots the set doesn't have are "added". A variant's
 * screenshot the set has none of is paired with the default's, marked as a fallback.
 */
export function pairWithSet(shots: string[], setDir: string, compareDir: string): { pairs: ComparePair[]; added: string[] } {
  const pairs: ComparePair[] = [];
  const added: string[] = [];
  for (const after of shots) {
    const before = join(setDir, basename(after));
    const variant = variantOf(after);
    const dflt = variant ? join(setDir, withoutVariant(basename(after))) : before;
    if (existsSync(before)) pairs.push({ before, after, out: join(compareDir, basename(after)), ...(variant ? { variant } : {}) });
    else if (variant && existsSync(dflt)) pairs.push({ before: dflt, after, out: join(compareDir, basename(after)), variant, fallback: true });
    else added.push(after);
  }
  return { pairs, added };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const filesIn = (dir: string) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/**
 * The PNGs `motif preview` made for a mockup: given home.html, its home.png, home-2.png, home@saved.png (a frame of the
 * "saved" state), home.dark.png, …, next to it or in the other folders given (preview writes them to design/previews/);
 * given one PNG, that PNG and its light or dark twin. PNGs of a neighbouring mockup with a numbered name (home-2.html)
 * are that mockup's, not this one's.
 */
export function mockupFrames(mockup: string, alsoIn: string[] = []): string[] {
  if (extname(mockup).toLowerCase() === ".png") {
    const twin = mockup.endsWith(".dark.png") ? mockup.replace(/\.dark\.png$/, ".png") : mockup.replace(/\.png$/i, ".dark.png");
    return [mockup, twin].filter((f) => existsSync(f)).sort();
  }
  const name = basename(mockup, extname(mockup));
  const others = new Set(filesIn(dirname(mockup)).filter((f) => f.endsWith(".html")).map((f) => basename(f, ".html")));
  others.delete(name);
  const frame = new RegExp(`^${escapeRegExp(name)}(-\\d+|@[A-Za-z0-9][A-Za-z0-9-]*)?(\\+[a-z][a-z0-9-]*)?(\\.dark)?\\.png$`);
  for (const dir of [dirname(mockup), ...alsoIn]) {
    const found = filesIn(dir).filter((f) => frame.test(f) && !others.has(f.replace(/(\+[a-z][a-z0-9-]*)?(\.dark)?\.png$/, "")));
    if (found.length > 0) return found.sort().map((f) => join(dir, f));
  }
  return [];
}

/** The state a mockup frame shows (home@saved.png → "saved"), or "" for the page as it opens. */
function frameState(frame: string): string {
  return basename(frame).match(/@([A-Za-z0-9][A-Za-z0-9-]*)(\+[a-z][a-z0-9-]*)?(\.dark)?\.png$/)?.[1] ?? "";
}

/** The screenshot that matches a frame: the same state (none for a plain frame), viewport, scheme and variant. */
function shotFor(frame: string, shots: string[], variant: string | undefined = variantOf(frame)): string | undefined {
  const dark = frame.endsWith(".dark.png");
  const viewport = pngSize(new Uint8Array(readFileSync(frame))).width <= 1000 ? "mobile" : "desktop";
  const state = frameState(frame);
  const ending = `.${viewport}${dark ? ".dark" : ""}.png`;
  return shots.find((s) => {
    const file = basename(s);
    if (!file.endsWith(ending) || variantOf(s) !== variant) return false;
    const slug = withoutVariant(file.slice(0, -ending.length) + ".png").slice(0, -".png".length);
    return state ? slug.endsWith(`@${state}`) : !slug.includes("@");
  });
}

/**
 * Pairs each mockup frame with this run's screenshot for the same viewport and scheme (phone frames ↔ mobile, wider
 * frames ↔ desktop), the same state (a frame of a state, home@saved.png, with that state's screenshot, a plain frame
 * with the page as it opens) and the same variant (home+men.png ↔ index+men.mobile.png). A variant's screenshot whose
 * frame the mockup lacks is paired with the default's frame, marked as a fallback.
 */
export function pairWithMockup(frames: string[], allShots: string[], compareDir: string): ComparePair[] {
  // A mockup is left to right: right-to-left screenshots are never put next to it.
  const shots = allShots.filter((s) => !isRtlShot(s));
  const pairs: ComparePair[] = [];
  const variants = [...new Set(shots.map(variantOf).filter((v): v is string => Boolean(v)))];
  for (const frame of frames) {
    const variant = variantOf(frame);
    const after = shotFor(frame, shots);
    if (after) pairs.push({ before: frame, after, out: join(compareDir, basename(frame)), ...(variant ? { variant } : {}) });
    if (variant) continue;
    for (const v of variants) {
      if (frames.includes(inVariant(frame, v))) continue;
      const own = shotFor(frame, shots, v);
      if (own) pairs.push({ before: frame, after: own, out: join(compareDir, basename(inVariant(frame, v))), variant: v, fallback: true });
    }
  }
  return pairs;
}

/** The states the mockup has frames of that this run didn't capture (no --state for them), each named once. */
export function missingStateFrames(frames: string[], allShots: string[]): string[] {
  const shots = allShots.filter((s) => !isRtlShot(s));
  // A frame in a variant this run didn't capture isn't missing a state: the whole variant wasn't asked for.
  const captured = new Set(shots.map(variantOf));
  return [...new Set(frames.filter((f) => frameState(f) && captured.has(variantOf(f)) && !shotFor(f, shots)).map(frameState))];
}

/**
 * The variants whose every screenshot in this run is byte-identical to the default's of the same screen, state, size,
 * scheme and direction: the app likely didn't switch to them. A variant screenshot with no default one to compare with
 * leaves its variant out.
 */
export function identicalVariants(shots: string[]): string[] {
  const taken = new Set(shots);
  const same = new Map<string, boolean>();
  for (const shot of shots) {
    const variant = variantOf(shot);
    if (!variant || same.get(variant) === false) continue;
    const dflt = join(dirname(shot), withoutVariant(basename(shot)));
    let equal = false;
    try {
      equal = taken.has(dflt) && readFileSync(shot).equals(readFileSync(dflt));
    } catch {
      // A screenshot that can't be read can't show the variant looks the same: no note for it.
    }
    same.set(variant, equal);
  }
  return [...same].filter(([, equal]) => equal).map(([variant]) => variant);
}

/**
 * Notes for variants that look exactly like the default. how says how Motif sets a variant on this stack, so the
 * developer can see why the app may not follow it (on the web: data-variant on <html>).
 */
export function identicalVariantNotes(shots: string[], how: string): string[] {
  return identicalVariants(shots).map(
    (id) => `The ${id} variant looks exactly like the default on every screen: the app may not switch variants the way Motif sets them (${how}).`,
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * The side-by-side page. It's the tool's own page (not the app), so it uses fixed neutral colours. A screenshot that
 * recorded what was on screen gets a dashed frame there, so "do these still fit on one screen?" can be seen at a glance.
 */
export function comparePage(labels: [string, string], column: number, n: number, screens: [Screen | null, Screen | null] = [null, null]): string {
  const frame = (s: Screen | null) => {
    if (!s) return "";
    const k = column / s.width;
    return `<div class="screen" style="top: ${Math.round(s.top * k)}px; height: ${Math.round(s.height * k)}px"><span>On screen</span></div>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; padding: 16px; background: #f4f4f5; color: #18181b; font: 600 14px/1.4 system-ui, sans-serif; }
.row { display: flex; gap: 16px; align-items: flex-start; }
figure { margin: 0; width: ${column}px; }
figcaption { margin: 0 0 8px; }
.shot { position: relative; overflow: hidden; }
img { display: block; width: 100%; border: 1px solid #d4d4d8; background: #ffffff; }
.screen { position: absolute; left: 0; right: 0; box-sizing: border-box; border: 2px dashed #7c3aed; pointer-events: none; }
.screen span { position: absolute; top: 0; right: 0; padding: 3px 6px; background: #7c3aed; color: #ffffff; font: 600 11px/1 system-ui, sans-serif; }
#note { margin: 12px 0 0; font-weight: 400; }
</style></head><body><div class="row"><figure><figcaption>${escapeHtml(labels[0])}</figcaption><div class="shot"><img id="a" src="/a.png?${n}">${frame(screens[0])}</div></figure><figure><figcaption>${escapeHtml(labels[1])}</figcaption><div class="shot"><img id="b" src="/b.png?${n}">${frame(screens[1])}</div></figure></div><p id="note"></p></body></html>`;
}

/**
 * In the page: the share of the two images that differs (scaled to 300 px wide), written under them and returned, with
 * where the first difference is, how much taller the page got, and whether what's below the first difference only
 * moved. cssWidth is the screenshots' width in CSS px, for turning rows into CSS px.
 */
const measure = (cssWidth: number) => `(async () => {
  const a = document.getElementById("a"), b = document.getElementById("b");
  await Promise.all([a.decode(), b.decode()]);
  // Narrowed to 300 px for speed, but every row kept: a row of one image is a row of the other, so content that only
  // moved lines up exactly.
  const w = 300;
  const ha = Math.max(1, a.naturalHeight);
  const hb = Math.max(1, b.naturalHeight);
  const h = Math.max(ha, hb);
  const pixels = (img, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, height);
    return g.getImageData(0, 0, w, h).data;
  };
  const pa = pixels(a, ha), pb = pixels(b, hb);
  let different = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 48) different++;
  }
  const changed = Math.round((different / (w * h)) * 1000) / 10;
  document.getElementById("note").textContent = changed < 0.1 ? "No visible change." : "About " + changed + "% of the page looks different.";
  // Rows: one differs when more than 1% of its pixels do (antialiasing aside).
  const rowDiffers = (ya, yb) => {
    let n = 0;
    for (let x = 0; x < w; x++) {
      const i = (ya * w + x) * 4, j = (yb * w + x) * 4;
      if (Math.abs(pa[i] - pb[j]) + Math.abs(pa[i + 1] - pb[j + 1]) + Math.abs(pa[i + 2] - pb[j + 2]) > 48) n++;
    }
    return n > w / 100;
  };
  let first = -1;
  for (let y = 0; y < h && first < 0; y++) if (rowDiffers(y, y)) first = y;
  // CSS px per row.
  const css = ${cssWidth} / a.naturalWidth;
  const shift = hb - ha;
  let moved = false;
  // Below the change, does the earlier page match the new one shifted by the difference? (For a removal, the rows
  // that were taken out are skipped.)
  const start = first + Math.max(0, -shift);
  if (first >= 0 && shift !== 0 && start < ha) {
    let same = 0, rows = 0;
    for (let y = start; y < ha; y++) {
      const yb = y + shift;
      if (yb < 0 || yb >= hb) continue;
      rows++;
      if (!rowDiffers(y, yb)) same++;
    }
    // A page's bottom margin alone isn't content that moved.
    moved = rows * css >= 24 && same / rows >= 0.9;
  }
  const taller = Math.round(shift * css);
  return { changed, taller, from: first < 0 ? undefined : Math.round(first * css), moved };
})()`;

/** Renders each pair side by side (labelled) into its out file; with measure, also says how much changed. */
export async function renderComparisons(opts: {
  browserPath: string;
  pairs: ComparePair[];
  labels: [string, string];
  measure: boolean;
}): Promise<Comparison[]> {
  if (opts.pairs.length === 0) return [];
  let current = opts.pairs[0]!;
  let html = "";
  const png = (file: string) => new Response(Bun.file(file), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (path === "/a.png") return png(current.before);
      if (path === "/b.png") return png(current.after);
      return new Response("Not found", { status: 404 });
    },
  });
  const results: Comparison[] = [];
  try {
    const browser = await launchBrowser(opts.browserPath);
    try {
      const page = await browser.newPage();
      for (const [n, pair] of opts.pairs.entries()) {
        current = pair;
        const before = new Uint8Array(readFileSync(pair.before));
        const after = new Uint8Array(readFileSync(pair.after));
        const width = pngSize(after).width;
        // Phone screenshots are 2× (780 px → 390 CSS px per side); wide ones are shown 720 CSS px wide.
        const column = width > 1000 ? 720 : Math.round(width / 2);
        const pageWidth = column * 2 + 48;
        html = comparePage(opts.labels, column, n, [screenOf(before) ?? null, screenOf(after) ?? null]);
        // A short viewport, so the image is as tall as the two screenshots, not at least a screen's height.
        await page.setViewport(pageWidth, 100, 2);
        await page.goto(`http://127.0.0.1:${server.port}/?${n}`);
        // The screenshots' width in CSS px: what they recorded, or 2× for phones and 1× for wide ones.
        const cssWidth = screenOf(after)?.width ?? (width > 1000 ? width : width / 2);
        const measured = opts.measure ? await page.evaluate<{ changed: number; taller: number; from?: number; moved: boolean }>(measure(cssWidth)) : undefined;
        const height = Math.min(await page.evaluate<number>("document.documentElement.scrollHeight"), MAX_HEIGHT);
        mkdirSync(dirname(pair.out), { recursive: true });
        writeFileSync(pair.out, await page.screenshot({ x: 0, y: 0, width: pageWidth, height }));
        results.push(
          measured === undefined
            ? { ...pair }
            : {
                ...pair,
                changed: measured.changed,
                ...(measured.changed >= 0.1 && measured.from !== undefined
                  ? { from: measured.from, ...(measured.taller !== 0 ? { taller: measured.taller, moved: measured.moved } : {}) }
                  : {}),
              },
        );
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.stop(true);
  }
  return results;
}
