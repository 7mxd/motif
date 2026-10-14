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
    return families.filter((f) => !loaded.has(f));
  })()`;
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
        const notLoaded = await page.evaluate<string[]>(fontsScript(target.fonts ?? []));
        if (scheme === "light") for (const family of notLoaded) missing.add(family);
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
