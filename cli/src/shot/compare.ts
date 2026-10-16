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
}

export interface Comparison extends ComparePair {
  /** How much of the page looks different, in percent (before/after comparisons only). */
  changed?: number;
}

/** Pairs this run's screenshots with a saved set by file name; screenshots the set doesn't have are "added". */
export function pairWithSet(shots: string[], setDir: string, compareDir: string): { pairs: ComparePair[]; added: string[] } {
  const pairs: ComparePair[] = [];
  const added: string[] = [];
  for (const after of shots) {
    const before = join(setDir, basename(after));
    if (existsSync(before)) pairs.push({ before, after, out: join(compareDir, basename(after)) });
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
  const frame = new RegExp(`^${escapeRegExp(name)}(-\\d+|@[A-Za-z0-9][A-Za-z0-9-]*)?(\\.dark)?\\.png$`);
  for (const dir of [dirname(mockup), ...alsoIn]) {
    const found = filesIn(dir).filter((f) => frame.test(f) && !others.has(f.replace(/(\.dark)?\.png$/, "")));
    if (found.length > 0) return found.sort().map((f) => join(dir, f));
  }
  return [];
}

/** The state a mockup frame shows (home@saved.png → "saved"), or "" for the page as it opens. */
function frameState(frame: string): string {
  return basename(frame).match(/@([A-Za-z0-9][A-Za-z0-9-]*)(\.dark)?\.png$/)?.[1] ?? "";
}

/** The screenshot that matches a frame: the same state (none for a plain frame), viewport and scheme. */
function shotFor(frame: string, shots: string[]): string | undefined {
  const dark = frame.endsWith(".dark.png");
  const viewport = pngSize(new Uint8Array(readFileSync(frame))).width <= 1000 ? "mobile" : "desktop";
  const state = frameState(frame);
  const ending = `.${viewport}${dark ? ".dark" : ""}.png`;
  return shots.find((s) => {
    const file = basename(s);
    if (!file.endsWith(ending)) return false;
    const slug = file.slice(0, -ending.length);
    return state ? slug.endsWith(`@${state}`) : !slug.includes("@");
  });
}

/**
 * Pairs each mockup frame with this run's screenshot for the same viewport and scheme (phone frames ↔ mobile, wider
 * frames ↔ desktop) and the same state: a frame of a state (home@saved.png) with that state's screenshot, a plain
 * frame with the page as it opens.
 */
export function pairWithMockup(frames: string[], shots: string[], compareDir: string): ComparePair[] {
  const pairs: ComparePair[] = [];
  for (const frame of frames) {
    const after = shotFor(frame, shots);
    if (after) pairs.push({ before: frame, after, out: join(compareDir, basename(frame)) });
  }
  return pairs;
}

/** The states the mockup has frames of that this run didn't capture (no --state for them), each named once. */
export function missingStateFrames(frames: string[], shots: string[]): string[] {
  return [...new Set(frames.filter((f) => frameState(f) && !shotFor(f, shots)).map(frameState))];
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

/** In the page: the share of the two images that differs (scaled to 300 px wide), written under them and returned. */
const MEASURE = `(async () => {
  const a = document.getElementById("a"), b = document.getElementById("b");
  await Promise.all([a.decode(), b.decode()]);
  const w = 300;
  const ha = Math.max(1, Math.round((a.naturalHeight * w) / a.naturalWidth));
  const hb = Math.max(1, Math.round((b.naturalHeight * w) / b.naturalWidth));
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
  return changed;
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
        await page.setViewport(pageWidth, 900, 2);
        await page.goto(`http://127.0.0.1:${server.port}/?${n}`);
        const changed = opts.measure ? await page.evaluate<number>(MEASURE) : undefined;
        const height = Math.min(await page.evaluate<number>("document.documentElement.scrollHeight"), MAX_HEIGHT);
        mkdirSync(dirname(pair.out), { recursive: true });
        writeFileSync(pair.out, await page.screenshot({ x: 0, y: 0, width: pageWidth, height }));
        results.push(changed === undefined ? { ...pair } : { ...pair, changed });
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.stop(true);
  }
  return results;
}
