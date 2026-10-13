import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../browser/cdp";

export interface Viewport {
  name: "mobile" | "desktop";
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
}

export const VIEWPORTS: Viewport[] = [
  { name: "mobile", width: 390, height: 844, scale: 2, mobile: true },
  { name: "desktop", width: 1440, height: 900, scale: 1, mobile: false },
];
export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];
/** Taller pages are cropped: 8000 CSS px at 2× stays under Chrome's 16384 px screenshot limit. */
export const MAX_HEIGHT = 8000;

export interface RouteResult {
  route: string;
  url: string;
  /** HTTP status; 0 when the page couldn't be reached at all. */
  status: number;
  /** Where a redirect ended up. */
  finalUrl?: string;
  error?: string;
  cropped?: boolean;
  shots: string[];
}

export interface CaptureOptions {
  browserPath: string;
  baseUrl: string;
  routes: string[];
  outDir: string;
  settleMs?: number;
  timeoutMs?: number;
}

export function routeSlug(route: string): string {
  const slug = route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "index";
}

export function routeUrl(base: string, route: string): string {
  const url = new URL(base);
  const [path, query] = route.split("?", 2);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path!.replace(/^\/+/, "")}`;
  url.search = query ? `?${query}` : "";
  url.hash = "";
  return url.toString();
}

export function shotName(slug: string, viewport: Viewport["name"], scheme: Scheme): string {
  return `${slug}.${viewport}${scheme === "dark" ? ".dark" : ""}.png`;
}

// The Next.js dev badge isn't part of the app.
const HIDE_DEV_BADGES = `(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); return true; })()`;
const PAGE_HEIGHT = "document.documentElement.scrollHeight";

async function probe(url: string, timeoutMs: number): Promise<{ status: number; finalUrl: string; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status, finalUrl: res.url };
  } catch (e) {
    return { status: 0, finalUrl: url, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function captureScreens(opts: CaptureOptions): Promise<{ routes: RouteResult[] }> {
  const settleMs = opts.settleMs ?? 800;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  mkdirSync(opts.outDir, { recursive: true });
  const browser = await launchBrowser(opts.browserPath);
  const results: RouteResult[] = [];
  const usedSlugs = new Set<string>();
  try {
    for (const route of opts.routes) {
      const url = routeUrl(opts.baseUrl, route);
      let slug = routeSlug(route);
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${routeSlug(route)}-${n}`;
      usedSlugs.add(slug);

      const answer = await probe(url, timeoutMs);
      const result: RouteResult = { route, url, status: answer.status, shots: [] };
      if (answer.finalUrl !== url) result.finalUrl = answer.finalUrl;
      results.push(result);
      if (answer.status === 0) {
        result.error = `Couldn't reach it: ${answer.error}`;
        continue;
      }

      const page = await browser.newPage();
      try {
        for (const viewport of VIEWPORTS) {
          await page.setViewport(viewport.width, viewport.height, viewport.scale, viewport.mobile);
          for (const scheme of SCHEMES) {
            await page.emulateMedia([
              { name: "prefers-color-scheme", value: scheme },
              { name: "prefers-reduced-motion", value: "reduce" },
            ]);
            await page.goto(url, timeoutMs);
            await page.evaluate("document.fonts.ready.then(() => true)");
            await Bun.sleep(settleMs);
            await page.evaluate(HIDE_DEV_BADGES);
            const fullHeight = await page.evaluate<number>(PAGE_HEIGHT);
            if (fullHeight > MAX_HEIGHT) result.cropped = true;
            const file = join(opts.outDir, shotName(slug, viewport.name, scheme));
            writeFileSync(file, await page.screenshot({ x: 0, y: 0, width: viewport.width, height: Math.min(fullHeight, MAX_HEIGHT) }));
            result.shots.push(file);
          }
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }
  return { routes: results };
}
