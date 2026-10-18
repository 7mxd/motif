import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, type Clip } from "../browser/cdp";

export interface RenderTarget {
  url: string;
  name: string;
  /** Where this target's PNGs go (default: the outDir option). */
  outDir?: string;
  /** Font families the page should have; any that can't load are reported. */
  fonts?: string[];
}

export interface RenderResult {
  files: string[];
  /** Families from the targets' `fonts` that had no loadable font face. */
  missingFonts: string[];
}

const VIEWPORT = { width: 1600, height: 1200, scale: 2 };
const SCHEMES = ["light", "dark"] as const;
const FONT_WAIT_MS = 5000;

// Page-relative boxes of the visible frames (scroll offsets added, so frames below the fold are found too), and the
// state each one shows when it says so (data-state="recent", the name of the state's script).
const FRAMES = `[...document.querySelectorAll(".mk-frame")]
  .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, state: e.dataset.state || "" }; })
  .filter((r) => r.width > 0 && r.height > 0)`;
/** A state's name, as in a state script's file name: letters, digits and dashes. */
const STATE_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const WHOLE_PAGE = `({ x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`;
/**
 * Waits for the page's fonts within one shared budget, then lists the families with no face that loaded.
 * It first waits for the theme font stylesheets the preview server loads after the page (window.__motifFonts),
 * then loads each family explicitly (so ones the page doesn't use yet count too). Offline, or with a font server
 * that never answers, the budget runs out, the fallback is shown and those families are reported.
 */
export function fontsScript(families: string[], budgetMs: number = FONT_WAIT_MS): string {
  return `(async () => {
    const families = ${JSON.stringify(families)};
    const deadline = Date.now() + ${budgetMs};
    const within = (p) => Promise.race([p, new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())))]);
    await within(window.__motifFonts || Promise.resolve());
    await within(Promise.allSettled(families.map((f) => document.fonts.load("16px " + JSON.stringify(f)))));
    await within(document.fonts.ready);
    const loaded = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/^["']|["']$/g, "")));
    // A font installed on this computer has no web font face, but text in it measures differently from the fallbacks.
    const ctx = document.createElement("canvas").getContext("2d");
    const width = (font) => { ctx.font = "72px " + font; return ctx.measureText("mmmmmmmmmmlli1WwQ@#").width; };
    const installed = (f) => ["monospace", "serif", "sans-serif"].some((g) => width(JSON.stringify(f) + ", " + g) !== width(g));
    return families.filter((f) => !loaded.has(f) && !installed(f));
  })()`;
}

/** A frame's PNG: numbered after the first (home-2.png), or named after the state it shows (home@recent.png). */
export function pngName(name: string, index: number, scheme: "light" | "dark", state?: string): string {
  const which = state ? `@${state}` : index > 0 ? `-${index + 1}` : "";
  return `${name}${which}${scheme === "dark" ? ".dark" : ""}.png`;
}

/**
 * Names each frame's PNG, so that a later frame or a dark PNG never takes the name of another mockup's own PNG in the
 * same folder (home.html's frame 2 and home-2.html; x.html in dark and x.dark.html): those use _ instead (home_2.png).
 */
export function pngNamer(targets: RenderTarget[], defaultOutDir: string): (name: string, outDir: string, index: number, scheme: "light" | "dark", state?: string) => string {
  const owner = new Map<string, string>();
  for (const t of targets) {
    const dir = t.outDir ?? defaultOutDir;
    for (const scheme of SCHEMES) owner.set(join(dir, pngName(t.name, 0, scheme)), t.name);
  }
  return (name, outDir, index, scheme, state) => {
    const file = join(outDir, pngName(name, index, scheme, state));
    const taken = owner.get(file);
    if (taken === undefined || taken === name) return file;
    const which = state ? `_${state}` : index > 0 ? `_${index + 1}` : "";
    return join(outDir, `${name}${which}${scheme === "dark" ? "_dark" : ""}.png`);
  };
}

/** Renders each target in light and dark, one PNG per frame. Starts the browser once. */
export async function renderPngs(opts: { browserPath: string; targets: RenderTarget[]; outDir: string; timeoutMs?: number }): Promise<RenderResult> {
  const browser = await launchBrowser(opts.browserPath, { timeoutMs: opts.timeoutMs });
  const written: string[] = [];
  const missing = new Set<string>();
  const fileFor = pngNamer(opts.targets, opts.outDir);
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT.width, VIEWPORT.height, VIEWPORT.scale);
    for (const target of opts.targets) {
      const outDir = target.outDir ?? opts.outDir;
      mkdirSync(outDir, { recursive: true });
      for (const scheme of SCHEMES) {
        await page.emulateMedia([
          { name: "prefers-color-scheme", value: scheme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ]);
        await page.goto(target.url, opts.timeoutMs);
        const notLoaded = await page.evaluate<string[]>(fontsScript(target.fonts ?? []));
        if (scheme === "light") for (const family of notLoaded) missing.add(family);
        const frames = await page.evaluate<(Clip & { state: string })[]>(FRAMES);
        const clips = frames.length > 0 ? frames : [{ ...(await page.evaluate<Clip>(WHOLE_PAGE)), state: "" }];
        // A state named twice, or not usable in a file name, keeps the frame's number instead.
        const named = new Set<string>();
        for (const [i, { state, ...clip }] of clips.entries()) {
          const usable = STATE_NAME.test(state) && !named.has(state);
          if (usable) named.add(state);
          const file = fileFor(target.name, outDir, i, scheme, usable ? state : undefined);
          writeFileSync(file, await page.screenshot(clip));
          written.push(file);
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { files: written, missingFonts: [...missing] };
}
