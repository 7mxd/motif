import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../browser/cdp";
import { addPngText, readPngText } from "../browser/png";
import { auditPage, type AuditIssue } from "./audit";

export interface Viewport {
  /** How the audit treats it: "mobile" for touch screens (phones and tablets), "desktop" otherwise. */
  name: "mobile" | "desktop";
  /** The name in screenshot file names ("mobile-360"); the viewport's name when not set. */
  file?: string;
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
}

/**
 * Every page is captured at each size: a narrow, a usual and a wide phone, a tablet and a desktop. A layout that holds
 * on one phone can break on another (the xBloom review's regression showed at 430 px, not 390), so all are checked.
 * Phones are as tall as a phone browser shows once its toolbar shrinks while scrolling, not the whole screen: about
 * 855 px on a 430 px iPhone, where the xBloom card and its sliders stopped fitting at 863 px.
 */
export const VIEWPORTS: Viewport[] = [
  { name: "mobile", file: "mobile-360", width: 360, height: 740, scale: 2, mobile: true },
  { name: "mobile", width: 390, height: 767, scale: 2, mobile: true },
  { name: "mobile", file: "mobile-430", width: 430, height: 855, scale: 2, mobile: true },
  { name: "mobile", file: "tablet", width: 768, height: 1024, scale: 2, mobile: true },
  { name: "desktop", width: 1440, height: 900, scale: 1, mobile: false },
];
export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];
/** Taller pages are cropped: 8000 CSS px at 2× stays under Chrome's 16384 px screenshot limit. */
export const MAX_HEIGHT = 8000;

/** The part of the page that was on screen when a screenshot was taken, in CSS px: kept inside the PNG. */
export interface Screen {
  width: number;
  top: number;
  height: number;
}
const SCREEN_KEY = "motif:screen";

/** What was on screen in a screenshot Motif took; nothing for older screenshots, mockups or other images. */
export function screenOf(png: Uint8Array): Screen | undefined {
  try {
    const s = JSON.parse(readPngText(png, SCREEN_KEY) ?? "null");
    return s && [s.width, s.top, s.height].every((n) => typeof n === "number" && Number.isFinite(n)) ? { width: s.width, top: s.top, height: s.height } : undefined;
  } catch {
    return undefined;
  }
}

/** A script run in each page before it's captured again: its file name names the state ("editor" → index@editor.png). */
export interface StateScript {
  name: string;
  script: string;
}

/** The script as an async function in the page; one still running after timeoutMs is stopped and reported. */
export function stateExpression(script: string, timeoutMs = 15_000): string {
  return `Promise.race([(async () => {\n${script}\n})(), new Promise((_, reject) => setTimeout(() => reject(new Error("it was still running after ${timeoutMs / 1000} seconds")), ${timeoutMs}))]).then(() => true)`;
}

export interface RouteResult {
  route: string;
  url: string;
  /** HTTP status; 0 when the page couldn't be reached at all. */
  status: number;
  /** Where a redirect ended up. */
  finalUrl?: string;
  error?: string;
  /** Uncaught errors the page threw while loading (a crashed page can still answer HTTP 200). */
  pageErrors?: string[];
  cropped?: boolean;
  shots: string[];
  /** Set when the audit of this page couldn't finish. */
  auditError?: string;
}

export interface CaptureOptions {
  browserPath: string;
  baseUrl: string;
  routes: string[];
  outDir: string;
  settleMs?: number;
  timeoutMs?: number;
  audit?: boolean;
  motionSampleMs?: number;
  /** Also capture each page after each of these scripts runs in it. */
  states?: StateScript[];
  /** How long a state script may run (15 s). */
  stateTimeoutMs?: number;
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

export function shotName(slug: string, viewport: string, scheme: Scheme): string {
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

export async function captureScreens(opts: CaptureOptions): Promise<{ routes: RouteResult[]; issues: AuditIssue[] }> {
  const settleMs = opts.settleMs ?? 800;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const stateTimeoutMs = opts.stateTimeoutMs ?? 15_000;
  mkdirSync(opts.outDir, { recursive: true });
  const browser = await launchBrowser(opts.browserPath);
  const results: RouteResult[] = [];
  const issues: AuditIssue[] = [];
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

      const addErrors = (messages: string[]) => {
        if (messages.length > 0) result.pageErrors = [...new Set([...(result.pageErrors ?? []), ...messages])];
      };
      try {
        for (const viewport of VIEWPORTS) {
          for (const scheme of SCHEMES) {
            const media = [
              { name: "prefers-color-scheme", value: scheme },
              { name: "prefers-reduced-motion", value: "reduce" },
            ];
            for (const state of [undefined, ...(opts.states ?? [])]) {
              const tag = (message: string) => (state ? `State "${state.name}": ${message}` : message);
              // Each screenshot starts as a first visit, in a tab of its own: nothing an earlier page or state stored
              // (a theme choice, a dismissed banner, a cookie) changes it.
              const page = await browser.newPage({ isolated: true });
              try {
                await page.setViewport(viewport.width, viewport.height, viewport.scale, viewport.mobile);
                await page.emulateMedia(media);
                await page.goto(url, timeoutMs);
                await page.evaluate("document.fonts.ready.then(() => true)");
                if (state) {
                  try {
                    await page.evaluate(stateExpression(state.script, stateTimeoutMs), { timeoutMs: stateTimeoutMs });
                  } catch (e) {
                    addErrors([tag(e instanceof Error ? e.message : String(e))]);
                  }
                }
                await Bun.sleep(settleMs);
                const thrown = page.takeErrors();
                if (thrown.length > 0) {
                  addErrors(thrown.map(tag));
                } else {
                  // Hide the dev badge only when nothing went wrong: Next.js shows its error overlay in the same place.
                  await page.evaluate(HIDE_DEV_BADGES);
                }
                const fullHeight = await page.evaluate<number>(PAGE_HEIGHT);
                if (fullHeight > MAX_HEIGHT) result.cropped = true;
                // Where the page was scrolled to (a state can scroll something into view): comparisons frame that screen.
                const top = Math.round(await page.evaluate<number>("scrollY"));
                const file = join(opts.outDir, shotName(state ? `${slug}@${state.name}` : slug, viewport.file ?? viewport.name, scheme));
                const png = await page.screenshot({ x: 0, y: 0, width: viewport.width, height: Math.min(fullHeight, MAX_HEIGHT) });
                const screen: Screen = { width: viewport.width, top, height: viewport.height };
                writeFileSync(file, addPngText(png, SCREEN_KEY, JSON.stringify(screen)));
                result.shots.push(file);
                if (opts.audit) {
                  try {
                    const found = await auditPage(page, { viewport: viewport.name, scheme, motionSampleMs: opts.motionSampleMs });
                    for (const raw of found) issues.push({ ...raw, route, viewport: viewport.name, scheme, shot: file, ...(state ? { state: state.name } : {}) });
                  } catch (e) {
                    result.auditError = e instanceof Error ? e.message : String(e);
                  }
                }
              } catch (e) {
                // A plain page that fails stops its route, as before. A state that leaves the page unusable costs only
                // its own screenshot: the rest go on, each in its own tab anyway.
                if (!state) throw e;
                addErrors([...page.takeErrors().map(tag), tag(`Motif couldn't capture this state: ${e instanceof Error ? e.message : String(e)}`)]);
              } finally {
                await page.close().catch(() => undefined);
              }
            }
          }
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      }
    }
  } finally {
    await browser.close();
  }
  return { routes: results, issues };
}
