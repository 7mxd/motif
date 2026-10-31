import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, X509Certificate } from "node:crypto";
import { connect } from "node:tls";
import { launchBrowser, LoadTimeout } from "../browser/cdp";
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

/** A page people meet before signing in: /sign-in, /login, /auth/…, /welcome, /onboarding. */
export const SIGN_IN = /^\/(?:sign-?in|log-?in|auth|welcome|onboarding)(?:\/|$)/i;

/** Sign-in pages first, then /, then the rest, each in the order given. */
export function signInFirst(routes: string[]): string[] {
  const signIn = routes.filter((r) => SIGN_IN.test(r));
  const home = routes.filter((r) => r === "/");
  return [...signIn, ...home, ...routes.filter((r) => !signIn.includes(r) && r !== "/")];
}

/**
 * A native app's screens (decision 0007) are drawn at the whole screen of each device, not a browser's visible part:
 * 360×800, 390×844 and 430×932 phones and a 768×1024 tablet, all at twice the pixels. They are the default.
 */
export const NATIVE_VIEWPORTS: Viewport[] = [
  { name: "mobile", file: "mobile-360", width: 360, height: 800, scale: 2, mobile: true },
  { name: "mobile", width: 390, height: 844, scale: 2, mobile: true },
  { name: "mobile", file: "mobile-430", width: 430, height: 932, scale: 2, mobile: true },
  { name: "mobile", file: "tablet", width: 768, height: 1024, scale: 2, mobile: true },
];
/** A native app's desktop size, drawn only when --sizes asks for it. */
export const NATIVE_DESKTOP: Viewport = { name: "desktop", width: 1440, height: 900, scale: 1, mobile: false };

/**
 * A macOS app's sizes (decision 0010, §17): windows, not screens. The desktop's 1440×900 and a compact 900×700, both
 * at 2× (a Retina Mac's), whatever the Mac's own screen is. In file names: desktop and desktop-900.
 */
export const MAC_WINDOWS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900, scale: 2, mobile: false },
  { name: "desktop", file: "desktop-900", width: 900, height: 700, scale: 2, mobile: false },
];

/** The sizes --sizes accepts: each width, and names for groups of them. */
const SIZE_NAMES: Record<string, number[]> = { phones: [360, 390, 430], phone: [390], mobile: [390], tablet: [768], desktop: [1440] };

/** --sizes 390,1440 or --sizes phones,desktop: some of the sizes in the list (the web's five by default), for a quick run. */
export function parseSizes(value: string, list: Viewport[] = VIEWPORTS): Viewport[] | { error: string } {
  const widths = new Set<number>();
  for (const part of value.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean)) {
    const named = SIZE_NAMES[part] ?? list.filter((v) => String(v.width) === part || v.file === part).map((v) => v.width);
    if (named.length === 0) {
      return { error: `--sizes: "${part}" isn't one of the sizes. Use widths (${list.map((v) => v.width).join(", ")}) or names (phones, mobile, tablet, desktop), like --sizes 390,1440.` };
    }
    for (const w of named) widths.add(w);
  }
  if (widths.size === 0) return { error: "--sizes needs at least one size, like --sizes 390,1440." };
  return list.filter((v) => widths.has(v.width));
}

/** How a run's sizes read in a sentence: all five, the four native ones, or their widths. */
export function describeSizes(viewports: Viewport[] = VIEWPORTS): string {
  if (viewports.length === VIEWPORTS.length) return "three phone sizes, a tablet and a desktop";
  if (viewports.length === NATIVE_VIEWPORTS.length && viewports.every((v, i) => v === NATIVE_VIEWPORTS[i])) return "three phone sizes and a tablet";
  // A macOS app's windows: "a 1440×900 and a 900×700 window".
  if (viewports.length > 0 && viewports.every((v) => MAC_WINDOWS.includes(v))) {
    const each = viewports.map((v) => `a ${v.width}×${v.height}`);
    return `${each.length > 1 ? `${each.slice(0, -1).join(", ")} and ${each.at(-1)}` : each[0]} window`;
  }
  const widths = viewports.map((v) => String(v.width));
  return `${widths.length > 1 ? `${widths.slice(0, -1).join(", ")} and ${widths.at(-1)}` : widths[0]} px wide`;
}

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
  /** The script's absolute path (a native app's state is a file its tests import). */
  file?: string;
}

/** The script as an async function in the page; one still running after timeoutMs is stopped and reported. */
export function stateExpression(script: string, timeoutMs = 15_000): string {
  // The script starts on the expression's first line, so an error's line number is the script's own.
  return `Promise.race([(async () => {${script}\n})(), new Promise((_, reject) => setTimeout(() => reject(new Error("it was still running after ${timeoutMs / 1000} seconds")), ${timeoutMs}))]).then(() => true)`;
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
  /** Set when the page never finished loading: it was captured as it was. */
  loading?: string;
  cropped?: boolean;
  shots: string[];
  /** Set when the audit of this page couldn't finish. */
  auditError?: string;
  /** How many of the page's screenshots weren't drawn while others were (a native stack's setup failed for them). */
  missing?: number;
  /** Set when the page didn't turn right to left by itself in the --rtl language, so Motif set dir="rtl" on <html>. */
  rtlForced?: boolean;
  /** A native app's screen that redirected (to a sign-in screen, say): the route it was drawn at. */
  landedOn?: string;
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
  /** The width the reduced-motion check runs at, for apps with no desktop size (Expo: a phone); the desktop size when not given. */
  motionWidth?: number;
  /**
   * An Expo app (its web target): Pressables with no role, and icon-font glyphs, are judged as controls (audit), and
   * each screenshot waits until the screen has drawn (expoReady).
   */
  reactNative?: boolean;
  /** How long an Expo screen may stay bundling or empty after it loaded (30 s); then the route's error says which. */
  expoReadyMs?: number;
  /** Also capture each page after each of these scripts runs in it. */
  states?: StateScript[];
  /** How long a state script may run (15 s). */
  stateTimeoutMs?: number;
  /** Some of the sizes (--sizes); all five when not given. */
  viewports?: Viewport[];
  /** Design variants to capture besides the default (always captured): each page again with data-variant set on <html>. */
  variants?: string[];
  /**
   * The default variant's id, when the guide has variants: the default's screenshots set data-variant to it too, so an
   * app that passes its own variant to its theme (a React Native MotifProvider) is still drawn in the default. Motif's
   * web CSS has no rule for that id, so a web page looks the same.
   */
  defaultVariant?: string;
  /**
   * The light or dark an app keeps whatever the phone's setting (an Expo app's userInterfaceStyle): every screenshot is
   * taken in it, the .dark ones too, as a phone would show them. The browser's setting is followed when not given.
   */
  appScheme?: Scheme;
  /**
   * Also capture each page right to left, in this language (a BCP 47 primary tag such as "ar"): the page loads in that
   * locale, and gets dir="rtl" from Motif when it doesn't turn right to left by itself.
   */
  rtl?: string;
}

export function routeSlug(route: string): string {
  const slug = route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "index";
}

export function routeUrl(base: string, route: string): string {
  const url = new URL(base);
  // A route may carry a fragment (/#/about, for a hash router): it stays the address's fragment.
  const hashAt = route.indexOf("#");
  const [path, query] = (hashAt < 0 ? route : route.slice(0, hashAt)).split("?", 2);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path!.replace(/^\/+/, "")}`;
  url.search = query ? `?${query}` : "";
  url.hash = hashAt < 0 ? "" : route.slice(hashAt);
  return url.toString();
}

/**
 * index.mobile.png; in a variant, index+men.mobile.png (after the state: index@sent+men.mobile.dark.png); right to left,
 * .rtl after the size and before .dark (home@filled+men.mobile.rtl.dark.png).
 */
export function shotName(slug: string, viewport: string, scheme: Scheme, variant?: string, rtl?: boolean): string {
  return `${slug}${variant ? `+${variant}` : ""}.${viewport}${rtl ? ".rtl" : ""}${scheme === "dark" ? ".dark" : ""}.png`;
}

/**
 * What a dev server adds to every page isn't part of the app: Next.js's badge, Nuxt DevTools' floating panel (on in
 * every new Nuxt app) and Vue DevTools' (vite-plugin-vue-devtools, which create-vue offers).
 */
const DEV_TOOLS = ["nextjs-portal", "#nuxt-devtools-container", "#__vue-devtools-container__"];
const HIDE_DEV_BADGES = `(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(`${DEV_TOOLS.join(", ")} { display: none !important; }`)}; document.head.append(s); return true; })()`;
const PAGE_HEIGHT = "document.documentElement.scrollHeight";
/**
 * Waits, at most three seconds, for the page's animations that end (a fade-in: Motion keeps opacity animations under
 * reduced motion) to finish, so a screenshot doesn't catch a screen partway in. Endless ones (a spinner) aren't waited for.
 */
const ENTRANCES_DONE = `Promise.race([Promise.all(document.getAnimations().filter((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))]).then(() => true)`;
// A shot longer than the screen leaves a bar fixed or stuck to the bottom of the screen where the first screen ends,
// across the middle of the page (v1 Test A: a phone's tab bar with the list running on below it), and a sidebar the
// height of the screen stopping there (v1 Test A: a desktop app's navigation). For the shot, a bar is drawn where
// someone who scrolls to the end sees it and a sidebar runs to the end of the page; BARS_BACK puts both back before
// the audit.
const BARS_TO_END = `(() => {
  const end = document.documentElement.scrollHeight, moved = [];
  for (const el of document.querySelectorAll("body *")) {
    if (moved.some(([m]) => m.contains(el))) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    const sidebar = r.top <= 1 && r.height >= innerHeight * 0.9 && r.width <= innerWidth / 2;
    const bar = r.height <= innerHeight / 2 && r.top >= innerHeight / 2 && (cs.position === "fixed" || cs.bottom !== "auto");
    // Top bars and overlays stay where they are.
    if (!sidebar && !bar) continue;
    moved.push([el, el.style.cssText]);
    if (cs.position === "sticky") {
      el.style.position = "static";
      if (sidebar) el.style.height = (end - (el.getBoundingClientRect().top + scrollY)) + "px";
      continue;
    }
    const top = sidebar ? r.top + scrollY : end - (innerHeight - r.top);
    const height = sidebar ? end - top : r.height;
    Object.assign(el.style, { position: "absolute", top: "0px", bottom: "auto", left: "0px", right: "auto", margin: "0", width: r.width + "px", height: height + "px" });
    // Placed against whatever holds it, then moved by what is left to where it belongs on the page.
    const at = el.getBoundingClientRect();
    el.style.top = (top - (at.top + scrollY)) + "px";
    el.style.left = (r.left - at.left) + "px";
  }
  window.__motifBars = moved;
  return true;
})()`;
const BARS_BACK = `(() => { for (const [el, css] of window.__motifBars ?? []) el.style.cssText = css; delete window.__motifBars; return true; })()`;

/**
 * Where an Expo screen is, from inside the page (decision 0009): "bundling" while Expo's dev "Bundling..." toast (a
 * lazily loaded route, expo-router's SuspenseFallback) or its fast-refresh badge shows; "empty" while nothing in #root
 * draws anything (no text, image, field or background: a layout still waiting for useFonts returns null); else "ready".
 */
const EXPO_STATE = String.raw`(() => {
  const bundling = [...document.querySelectorAll("body *")].some((e) => e.childElementCount === 0 && /^Bundling(\.\.\.|…)$/.test((e.textContent || "").trim()));
  if (bundling || document.querySelector(".__expo_fast_refresh_show")) return "bundling";
  const root = document.getElementById("root") || document.body;
  const clear = (c) => c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
  const draws = (e) => {
    const box = e.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    if (/^(img|svg|canvas|video|input|textarea|picture|iframe)$/i.test(e.tagName)) return true;
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
    const s = getComputedStyle(e);
    return !clear(s.backgroundColor) || s.backgroundImage !== "none";
  };
  return [...root.querySelectorAll("*")].some(draws) ? "ready" : "empty";
})()`;

type ExpoState = "ready" | "bundling" | "empty";

/**
 * Waits up to maxMs for an Expo screen to draw (EXPO_STATE). The quiet wait isn't enough: in Expo's "static" web
 * output each route is a chunk loaded after the page, and the toast shows while Metro builds it. Errors the page
 * throws meanwhile end the wait; they are returned, and the screen is captured with them, as any page that threw.
 */
async function expoReady(page: { evaluate<T>(e: string): Promise<T>; takeErrors(): string[] }, maxMs: number): Promise<{ state: ExpoState; waited: boolean; errors: string[] }> {
  const until = Date.now() + maxMs;
  const errors: string[] = [];
  for (let waited = false; ; waited = true) {
    const state = await page.evaluate<ExpoState>(EXPO_STATE);
    errors.push(...page.takeErrors());
    if (state === "ready" || errors.length > 0 || Date.now() >= until) return { state, waited, errors };
    await Bun.sleep(100);
  }
}

/** The route's error for an Expo screen that never drew. */
function notDrawn(state: "bundling" | "empty", maxMs: number): string {
  const s = Math.round(maxMs / 1000);
  return state === "bundling"
    ? `Expo was still bundling this screen ${s} s after it loaded (its "Bundling..." toast was showing), so it wasn't captured. Run motif shot again; if it happens again, open the page in a browser to see whether Metro finishes it.`
    : `The screen was still empty ${s} s after it loaded, so it wasn't captured. Open the page in a browser to see what it waits for (fonts loaded with useFonts, data it fetches) before it draws.`;
}

/** An address on this computer: a dev server there may use https with a certificate of its own. */
export const isLocal = (url: string) => /^https?:\/\/((?:[\w-]+\.)*localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(:\d+)?(\/|$)/i.test(url);

/** The SHA-256 of a local https server's public key (base64), so the browser accepts that certificate and no other. */
export function serverKey(url: string, timeoutMs = 5000): Promise<string | null> {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(u.port || 443), servername: /^[\d.:]+$/.test(host) ? undefined : host, rejectUnauthorized: false }, () => {
      try {
        const cert = socket.getPeerCertificate(true);
        const spki = new X509Certificate(cert.raw).publicKey.export({ type: "spki", format: "der" });
        resolve(createHash("sha256").update(spki).digest("base64"));
      } catch {
        resolve(null);
      } finally {
        socket.end();
      }
    });
    socket.on("error", () => resolve(null));
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function probe(url: string, timeoutMs: number): Promise<{ status: number; finalUrl: string; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), ...(isLocal(url) ? { tls: { rejectUnauthorized: false } } : {}) });
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status, finalUrl: res.url };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { status: 0, finalUrl: url, error: timedOut ? `It didn't answer within ${Math.round(timeoutMs / 1000)} s.` : `Couldn't reach it: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function captureScreens(opts: CaptureOptions): Promise<{ routes: RouteResult[]; issues: AuditIssue[] }> {
  // After the page has loaded and what it fetched has arrived (waitForQuiet), a moment for it to draw.
  const settleMs = opts.settleMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const stateTimeoutMs = opts.stateTimeoutMs ?? 15_000;
  const expoReadyMs = opts.expoReadyMs ?? 30_000;
  mkdirSync(opts.outDir, { recursive: true });
  // A local dev server on https with its own certificate: the browser accepts that one certificate, nothing else.
  const key = opts.baseUrl.startsWith("https:") && isLocal(opts.baseUrl) ? await serverKey(opts.baseUrl) : null;
  const browser = await launchBrowser(opts.browserPath, key ? { trustedKeys: [key] } : {});
  const viewports = opts.viewports ?? VIEWPORTS;
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
        result.error = answer.error;
        continue;
      }
      // A page whose load never finishes is captured as it is; after the first wait, the others are short.
      let stuck = false;
      // Whether the first, plain look has said where the page landed in the browser.
      let redirectChecked = result.finalUrl !== undefined;

      const addErrors = (messages: string[]) => {
        if (messages.length > 0) result.pageErrors = [...new Set([...(result.pageErrors ?? []), ...messages])];
      };
      try {
        for (const viewport of viewports) {
          for (const scheme of SCHEMES) {
            const media = [
              { name: "prefers-color-scheme", value: opts.appScheme ?? scheme },
              { name: "prefers-reduced-motion", value: "reduce" },
            ];
            // Each variant left to right and, with --rtl, right to left in that language.
            const looks = [undefined, ...(opts.variants ?? [])].flatMap((variant) => [undefined, ...(opts.rtl ? [opts.rtl] : [])].map((lang) => ({ variant, lang })));
            for (const { variant, lang } of looks) {
              for (const state of [undefined, ...(opts.states ?? [])]) {
                const tag = (message: string) => (state ? `State "${state.name}": ${message}` : message);
                // An error the page threw on its own (already reported, untagged, from the plain screenshot) isn't the
                // state's when it lands while the state's script runs: it's reported once.
                const tagNew = (messages: string[]) => messages.map((m) => (result.pageErrors?.includes(m) ? m : tag(m)));
                // Each screenshot starts as a first visit, in a tab of its own: nothing an earlier page or state stored
                // (a theme choice, a dismissed banner, a cookie) changes it.
                const page = await browser.newPage({ isolated: true });
                try {
                  await page.setViewport(viewport.width, viewport.height, viewport.scale, viewport.mobile);
                  await page.emulateMedia(media);
                  if (lang) await page.emulateLocale(lang);
                  try {
                    await page.goto(url, stuck ? Math.min(timeoutMs, 2000) : timeoutMs);
                    // It loaded this time: later screenshots wait for it in full again.
                    stuck = false;
                  } catch (e) {
                    if (!(e instanceof LoadTimeout)) throw e;
                    result.loading = `It hadn't finished loading after ${Math.round(timeoutMs / 1000)} s; the screenshots show it as it was.`;
                    stuck = true;
                  }
                  // Fonts are ready only once the page has loaded: a page that never does waits a moment, not forever.
                  await page.evaluate(`Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${stuck ? 1000 : 5000}))]).then(() => true)`);
                  // What a stuck page is loading never arrives, so it isn't waited for.
                  if (!stuck) await page.waitForQuiet(300, 5000);
                  // What the page threw as it loaded is the page's own error, the same in every state: not tagged.
                  const loadErrors = page.takeErrors();
                  // An Expo screen can be quiet before it has drawn (a route's chunk still bundling, fonts still loading):
                  // it is waited for, unless it threw. One that never draws is the route's error, not a blank screenshot.
                  if (opts.reactNative && !stuck && loadErrors.length === 0) {
                    const ready = await expoReady(page, expoReadyMs);
                    loadErrors.push(...ready.errors);
                    if (ready.state !== "ready" && ready.errors.length === 0) throw new Error(notDrawn(ready.state, expoReadyMs));
                    if (ready.waited) {
                      // What the screen fetched once it drew (images, its fonts) is waited for as on load.
                      await page.waitForQuiet(300, 5000);
                      await page.evaluate(`Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => true)`);
                    }
                  }
                  addErrors(loadErrors);
                  // A single-page app's router can send the page elsewhere in the browser (an Angular guard to the sign-in
                  // page) while the server answered 200: where it landed is recorded as a server's redirect is. Only the
                  // first, plain look decides: an --rtl look's language (an app sending / to /ar) or a state isn't the route's.
                  if (!redirectChecked && !state && !lang && !variant) {
                    redirectChecked = true;
                    const here = await page.evaluate<string>("location.href");
                    const path = (u: string) => new URL(u).pathname.replace(/\/+$/, "");
                    if (path(here) !== path(url)) result.finalUrl = here;
                  }
                  if (lang && !(await page.evaluate<boolean>(`getComputedStyle(document.documentElement).direction === "rtl"`))) {
                    // The page didn't turn right to left by itself in that language: Motif turns it, and says so.
                    await page.evaluate(`(() => { const html = document.documentElement; html.dir = "rtl"; html.lang = ${JSON.stringify(lang)}; return true; })()`);
                    result.rtlForced = true;
                  }
                  const chosen = variant ?? opts.defaultVariant;
                  if (chosen) {
                    // The variant is chosen on <html>, after load and before any state runs; its fonts may differ.
                    await page.evaluate(`document.documentElement.dataset.variant = ${JSON.stringify(chosen)}; Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${stuck ? 500 : 2000}))]).then(() => true)`);
                  }
                  if (state) {
                    try {
                      await page.evaluate(stateExpression(state.script, stateTimeoutMs), { timeoutMs: stateTimeoutMs });
                    } catch (e) {
                      addErrors([tag(e instanceof Error ? e.message : String(e))]);
                    }
                    // What the script set off (a form sent, a list fetched) is waited for too.
                    if (!stuck) await page.waitForQuiet(300, 5000);
                  }
                  await Bun.sleep(settleMs);
                  await page.evaluate(ENTRANCES_DONE);
                  const thrown = page.takeErrors();
                  if (thrown.length > 0 || loadErrors.length > 0) {
                    addErrors(tagNew(thrown));
                  } else {
                    // Hide the dev tools only when nothing went wrong: Next.js shows its error overlay in the same place.
                    await page.evaluate(HIDE_DEV_BADGES);
                  }
                  const fullHeight = await page.evaluate<number>(PAGE_HEIGHT);
                  if (fullHeight > MAX_HEIGHT) result.cropped = true;
                  // Where the page was scrolled to (a state can scroll something into view): comparisons frame that screen.
                  const top = Math.round(await page.evaluate<number>("scrollY"));
                  const file = join(opts.outDir, shotName(state ? `${slug}@${state.name}` : slug, viewport.file ?? viewport.name, scheme, variant, Boolean(lang)));
                  const long = fullHeight > viewport.height;
                  if (long) await page.evaluate(BARS_TO_END);
                  const png = await page.screenshot({ x: 0, y: 0, width: viewport.width, height: Math.min(await page.evaluate<number>(PAGE_HEIGHT), MAX_HEIGHT) });
                  if (long) await page.evaluate(BARS_BACK);
                  const screen: Screen = { width: viewport.width, top, height: viewport.height };
                  writeFileSync(file, addPngText(png, SCREEN_KEY, JSON.stringify(screen)));
                  result.shots.push(file);
                  if (opts.audit) {
                    try {
                      const found = await auditPage(page, { viewport: viewport.name, scheme, motionSampleMs: opts.motionSampleMs, ...(opts.reactNative ? { reactNative: true } : {}), ...(opts.motionWidth ? { motion: viewport.width === opts.motionWidth } : {}) });
                      for (const raw of found) issues.push({ ...raw, route, viewport: viewport.name, size: viewport.file ?? viewport.name, scheme, shot: file, ...(state ? { state: state.name } : {}), ...(variant ? { variant } : {}), ...(lang ? { rtl: true as const } : {}) });
                    } catch (e) {
                      result.auditError = e instanceof Error ? e.message : String(e);
                    }
                  }
                } catch (e) {
                  // A plain page that fails stops its route, as before. A state that leaves the page unusable costs only
                  // its own screenshot: the rest go on, each in its own tab anyway.
                  if (!state) throw e;
                  addErrors([...tagNew(page.takeErrors()), tag(`Motif couldn't capture this state: ${e instanceof Error ? e.message : String(e)}`)]);
                } finally {
                  await page.close().catch(() => undefined);
                }
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
