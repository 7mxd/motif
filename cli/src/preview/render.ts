import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, type Clip } from "../browser/cdp";

export interface RenderTarget {
  url: string;
  name: string;
}

const VIEWPORT = { width: 1600, height: 1200, scale: 2 };
const SCHEMES = ["light", "dark"] as const;

// Page-relative boxes of the visible frames (scroll offsets added, so frames below the fold are found too).
const FRAMES = `[...document.querySelectorAll(".mk-frame")]
  .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })
  .filter((r) => r.width > 0 && r.height > 0)`;
const WHOLE_PAGE = `({ x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })`;

export function pngName(name: string, index: number, scheme: "light" | "dark"): string {
  return `${name}${index > 0 ? `-${index + 1}` : ""}${scheme === "dark" ? ".dark" : ""}.png`;
}

/** Renders each target in light and dark, one PNG per frame. Starts the browser once. */
export async function renderPngs(opts: { browserPath: string; targets: RenderTarget[]; outDir: string; timeoutMs?: number }): Promise<string[]> {
  const browser = await launchBrowser(opts.browserPath, { timeoutMs: opts.timeoutMs });
  const written: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT.width, VIEWPORT.height, VIEWPORT.scale);
    mkdirSync(opts.outDir, { recursive: true });
    for (const target of opts.targets) {
      for (const scheme of SCHEMES) {
        await page.emulateMedia([
          { name: "prefers-color-scheme", value: scheme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ]);
        await page.goto(target.url, opts.timeoutMs);
        await page.evaluate("document.fonts.ready.then(() => true)");
        const frames = await page.evaluate<Clip[]>(FRAMES);
        const clips = frames.length > 0 ? frames : [await page.evaluate<Clip>(WHOLE_PAGE)];
        for (const [i, clip] of clips.entries()) {
          const file = join(opts.outDir, pngName(target.name, i, scheme));
          writeFileSync(file, await page.screenshot(clip));
          written.push(file);
        }
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}
