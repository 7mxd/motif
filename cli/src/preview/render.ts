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

// Page-relative boxes of the visible frames (scroll offsets added, so frames below the fold are found too).
const FRAMES = `[...document.querySelectorAll(".mk-frame")]
  .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })
  .filter((r) => r.width > 0 && r.height > 0)`;
const WHOLE_PAGE = `({ x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`;
// Fonts never hold a render up for long: offline, or with a slow font server, the fallback is shown.
const FONTS_READY = `Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${FONT_WAIT_MS}))]).then(() => true)`;

/** Loads each family explicitly (so ones the page doesn't use yet count too) and lists those with no face that loads. */
export function missingFontsScript(families: string[]): string {
  const list = JSON.stringify(families);
  return `Promise.race([
    Promise.all(${list}.map((f) => document.fonts.load("16px " + JSON.stringify(f)).then((faces) => (faces.length > 0 ? null : f), () => f))),
    new Promise((r) => setTimeout(() => r(${list}), ${FONT_WAIT_MS})),
  ]).then((found) => found.filter(Boolean))`;
}

export function pngName(name: string, index: number, scheme: "light" | "dark"): string {
  return `${name}${index > 0 ? `-${index + 1}` : ""}${scheme === "dark" ? ".dark" : ""}.png`;
}

/** Renders each target in light and dark, one PNG per frame. Starts the browser once. */
export async function renderPngs(opts: { browserPath: string; targets: RenderTarget[]; outDir: string; timeoutMs?: number }): Promise<RenderResult> {
  const browser = await launchBrowser(opts.browserPath, { timeoutMs: opts.timeoutMs });
  const written: string[] = [];
  const missing = new Set<string>();
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
        await page.evaluate(FONTS_READY);
        if (scheme === "light" && target.fonts?.length) {
          for (const family of await page.evaluate<string[]>(missingFontsScript(target.fonts))) missing.add(family);
        }
        const frames = await page.evaluate<Clip[]>(FRAMES);
        const clips = frames.length > 0 ? frames : [await page.evaluate<Clip>(WHOLE_PAGE)];
        for (const [i, clip] of clips.entries()) {
          const file = join(outDir, pngName(target.name, i, scheme));
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
