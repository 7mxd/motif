import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, routeSlug, routeUrl, shotName, stateExpression } from "../src/shot/capture";
import { generateFallback } from "../src/generate/fallback";
import { motifCss } from "../src/generate/motif-css";
import { buildThemeSet } from "../src/generate/theme";
import { startStaticServer } from "../src/shot/static-server";
import { generateReactWeb } from "../src/stacks/react-web/generate";
import { docFrom, twoVariantTokens } from "./helpers";
import { pixel } from "./png-pixels";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";
import { selfSignedCert } from "./tls";

afterAll(cleanupTempDirs);

describe("names and addresses", () => {
  test("routeSlug", () => {
    expect(routeSlug("/")).toBe("index");
    expect(routeSlug("/settings/profile")).toBe("settings-profile");
    expect(routeSlug("/Search?q=Shoes")).toBe("search-q-shoes");
  });
  test("routeUrl keeps the base path and the route's query", () => {
    expect(routeUrl("http://localhost:3000", "/")).toBe("http://localhost:3000/");
    expect(routeUrl("http://localhost:3000/", "/settings")).toBe("http://localhost:3000/settings");
    expect(routeUrl("http://localhost:5173/app/", "/settings?tab=billing")).toBe("http://localhost:5173/app/settings?tab=billing");
  });
  test("a state script starts on the first line, so its errors name its own lines (backlog)", () => {
    expect(stateExpression("first();\nsecond();").split("\n")[0]).toContain("first();");
  });
  test("shotName", () => {
    expect(shotName("index", "mobile", "light")).toBe("index.mobile.png");
    expect(shotName("index", "desktop", "dark")).toBe("index.desktop.dark.png");
    // Right to left comes after the size and before .dark.
    expect(shotName("home@filled", "mobile", "dark", "men", true)).toBe("home@filled+men.mobile.rtl.dark.png");
    expect(shotName("index", "mobile-360", "light", undefined, true)).toBe("index.mobile-360.rtl.png");
    expect(shotName("index", "mobile", "light", undefined, false)).toBe("index.mobile.png");
  });
});

const browser = findBrowser();
const PAGE = (body: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body { margin: 0; font: 16px sans-serif; } @media (prefers-color-scheme: dark) { body { background: #111111; color: #eeeeee; } }</style></head><body>${body}</body></html>`;
const html = (body: string, status = 200) => new Response(PAGE(body), { status, headers: { "content-type": "text/html" } });
let server: ReturnType<typeof Bun.serve>;
const EXPO_SCREEN = '<div style="position:absolute;inset:0;background:#123456;color:#fff"><div>Pantry</div></div>';
const EXPO_TOAST = '<div style="position:absolute;inset:0;background:#f2f2f2"></div><div style="position:fixed;bottom:16px;left:16px;opacity:0.9"><div>Bundling...</div><div>app/index.tsx</div></div>';
const later = (ms: number) => `<script>setTimeout(() => { document.getElementById("root").innerHTML = ${JSON.stringify(EXPO_SCREEN)}; }, ${ms});</script>`;
const EXPO_PAGES: Record<string, string> = {
  "/expo-bundling": `<div id="root">${EXPO_TOAST}</div>${later(1500)}`,
  // Expo's own wrappers fill the screen, transparent, before the app draws.
  "/expo-fonts": `<div id="root"><div style="position:absolute;inset:0;background:rgba(0, 0, 0, 0)"><div style="height:100%"></div></div></div>${later(1500)}`,
  "/expo-stuck": `<div id="root">${EXPO_TOAST}</div>`,
  "/expo-blank": '<div id="root"><div style="position:absolute;inset:0"><div style="height:100%;background:transparent"></div></div></div>',
  "/expo-crash": '<div id="root"></div><script>throw new Error("boom: native module")</script>',
  "/expo-textless": '<div id="root"><div style="position:absolute;inset:0;background:#123456"></div></div>',
};

// What a framework's dev server adds to every page: Nuxt DevTools' floating panel (#nuxt-devtools-container), Vue
// DevTools' (vite-plugin-vue-devtools: #__vue-devtools-container__) and Next.js's badge (<nextjs-portal>). Each is a red
// box over the top left here, holding a small button with no name.
const OVERLAY = '<div style="position:fixed;top:0;left:0;width:120px;height:120px;background:#ff0000"><button style="width:16px;height:16px"></button></div>';
const DEVTOOLS_PAGE = `<h1 style="margin:40px 0 0">Home</h1><div id="nuxt-devtools-container">${OVERLAY}</div><div id="__vue-devtools-container__">${OVERLAY}</div><nextjs-portal>${OVERLAY}</nextjs-portal>`;

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/") return html('<div style="height: 1000px">Home</div>');
      if (path === "/long") return html('<div style="height: 10000px">Long</div>');
      if (path === "/broken") return html("<h1>Something went wrong</h1>", 500);
      if (path === "/old") return Response.redirect(new URL("/", req.url).toString(), 302);
      if (path === "/slow") return html('<img src="/never" alt="">'); // the load event waits for this image forever
      if (path === "/never") return new Promise<Response>(() => {});
      if (path === "/throws") return html('<h1>Half a page</h1><script>throw new Error("boom: data is undefined")</script>');
      if (path === "/later") return html('<button id="go">Go</button><script>document.getElementById("go").onclick = () => fetch("/data").then((r) => r.text()).then((t) => { const d = document.createElement("div"); d.style.height = t + "px"; document.body.append(d); });</script>');
      if (path === "/data") return new Promise<Response>((res) => setTimeout(() => res(new Response("3000")), 900));
      if (path === "/poll") return html('<h1>Live</h1><script>fetch("/hold")</script>');
      if (path === "/hold") return new Promise<Response>(() => {});
      // Expo's web target while it loads a screen: the "Bundling..." toast (expo-router's SuspenseFallback, a lazily
      // loaded route) on react-navigation's grey card, or a root with nothing drawn (a layout waiting for useFonts).
      // Neither fetches anything, so the quiet wait passes during it.
      if (path.startsWith("/expo-")) return html(EXPO_PAGES[path] ?? "", EXPO_PAGES[path] ? 200 : 404);
      if (path === "/devtools") return html(DEVTOOLS_PAGE);
      return html("<h1>Not found</h1>", 404);
    },
  });
});
afterAll(() => server?.stop(true));

const size = (file: string) => pngSize(new Uint8Array(readFileSync(file)));

describe.skipIf(!browser)("captureScreens (needs Chrome, Edge or Chromium)", () => {
  test("every page at each size, light and dark; long pages are cropped", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/", "/long"], outDir: out, settleMs: 50 });
    expect(routes.map((r) => [r.route, r.status, r.error])).toEqual([["/", 200, undefined], ["/long", 200, undefined]]);
    expect(routes[0]!.shots.map((f) => f.slice(out.length + 1))).toEqual(["index.mobile-360.png", "index.mobile-360.dark.png", "index.mobile.png", "index.mobile.dark.png", "index.mobile-430.png", "index.mobile-430.dark.png", "index.tablet.png", "index.tablet.dark.png", "index.desktop.png", "index.desktop.dark.png"]);
    expect(size(join(out, "index.mobile.png"))).toEqual({ width: 780, height: 2000 });
    expect(size(join(out, "index.desktop.png"))).toEqual({ width: 1440, height: 1000 });
    expect(routes[1]!.cropped).toBe(true);
    expect(size(join(out, "long.mobile.png"))).toEqual({ width: 780, height: 16000 });
    expect(size(join(out, "long.desktop.dark.png"))).toEqual({ width: 1440, height: 8000 });
  }, 120_000);

  test("errors the page throws are reported (the HTTP status alone says 200)", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/throws", "/"], outDir: out, settleMs: 50 });
    expect(routes[0]!.status).toBe(200);
    expect(routes[0]!.pageErrors).toEqual(["Error: boom: data is undefined"]);
    expect(routes[0]!.shots).toHaveLength(10);
    expect(routes[1]!.pageErrors).toBeUndefined();
  }, 120_000);

  test("error pages are captured and reported; unreachable or stuck pages don't stop the run", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({
      browserPath: browser!.path,
      baseUrl: `http://localhost:${server.port}`,
      routes: ["/broken", "/missing", "/old", "/slow", "/"],
      outDir: out,
      settleMs: 50,
      timeoutMs: 3000,
    });
    const byRoute = Object.fromEntries(routes.map((r) => [r.route, r]));
    expect(byRoute["/broken"]!.status).toBe(500);
    expect(byRoute["/broken"]!.shots).toHaveLength(10);
    expect(byRoute["/missing"]!.status).toBe(404);
    expect(byRoute["/old"]!.status).toBe(200);
    expect(byRoute["/old"]!.finalUrl).toBe(`http://localhost:${server.port}/`);
    // A page that never finishes loading is captured as it is, with a note (backlog #33).
    expect(byRoute["/slow"]!.shots).toHaveLength(10);
    expect(byRoute["/slow"]!.loading).toBe("It hadn't finished loading after 3 s; the screenshots show it as it was.");
    expect(byRoute["/slow"]!.pageErrors).toBeUndefined();
    expect(byRoute["/"]!.shots).toHaveLength(10);
    const unreachable = await captureScreens({ browserPath: browser!.path, baseUrl: "http://127.0.0.1:1", routes: ["/"], outDir: out, settleMs: 50, timeoutMs: 3000 });
    expect(unreachable.routes[0]).toMatchObject({ status: 0, shots: [] });
    expect(unreachable.routes[0]!.error).toContain("Couldn't reach");
    const silent = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/never"], outDir: out, settleMs: 50, timeoutMs: 2000 });
    expect(silent.routes[0]!.error).toBe("It didn't answer within 2 s.");
  }, 120_000);
});

describe.skipIf(!browser)("an Expo screen that is still loading (needs Chrome, Edge or Chromium)", () => {
  const PHONE = [{ name: "mobile" as const, width: 390, height: 844, scale: 2, mobile: true }];
  const topLeft = (file: string) => pixel(readFileSync(file), 10, 10).slice(0, 3);
  const base = () => `http://localhost:${server.port}`;

  test("is waited for: the screenshot shows the screen, not Expo's Bundling toast or an empty root", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: base(), routes: ["/expo-bundling", "/expo-fonts", "/expo-textless"], outDir: out, settleMs: 50, viewports: PHONE, reactNative: true });
    expect(routes.map((r) => [r.route, r.error, r.pageErrors, r.shots.length])).toEqual([["/expo-bundling", undefined, undefined, 2], ["/expo-fonts", undefined, undefined, 2], ["/expo-textless", undefined, undefined, 2]]);
    for (const name of ["expo-bundling.mobile.png", "expo-bundling.mobile.dark.png", "expo-fonts.mobile.png", "expo-textless.mobile.png"]) expect(topLeft(join(out, name))).toEqual([0x12, 0x34, 0x56]);
  }, 120_000);

  test("one that never finishes is the route's error, saying which, and nothing is captured of it", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: base(), routes: ["/expo-stuck", "/expo-blank", "/expo-bundling"], outDir: out, settleMs: 50, viewports: PHONE, reactNative: true, expoReadyMs: 3000 });
    expect(routes[0]!.shots).toEqual([]);
    expect(routes[0]!.error).toBe(`Expo was still bundling this screen 3 s after it loaded (its "Bundling..." toast was showing), so it wasn't captured. Run motif shot again; if it happens again, open the page in a browser to see whether Metro finishes it.`);
    expect(routes[1]!.shots).toEqual([]);
    expect(routes[1]!.error).toBe("The screen was still empty 3 s after it loaded, so it wasn't captured. Open the page in a browser to see what it waits for (fonts loaded with useFonts, data it fetches) before it draws.");
    // The others go on.
    expect(routes[2]!.shots).toHaveLength(2);
  }, 120_000);

  test("a screen that threw isn't waited for: it is captured with its error, as before", async () => {
    const out = tempDir("motif-shots-");
    const started = Date.now();
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: base(), routes: ["/expo-crash"], outDir: out, settleMs: 50, viewports: PHONE, reactNative: true });
    expect(routes[0]!.error).toBeUndefined();
    expect(routes[0]!.pageErrors).toEqual(["Error: boom: native module"]);
    expect(routes[0]!.shots).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 120_000);

  test("other stacks aren't waited for: a web page with no #root content is captured at once", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: base(), routes: ["/expo-bundling"], outDir: out, settleMs: 50, viewports: PHONE });
    expect(routes[0]!.error).toBeUndefined();
    expect(topLeft(join(out, "expo-bundling.mobile.png"))).toEqual([0xf2, 0xf2, 0xf2]);
  }, 120_000);
});

describe.skipIf(!browser)("a dev server's own tools (needs Chrome, Edge or Chromium)", () => {
  test("Nuxt DevTools, Vue DevTools and Next.js's badge are hidden from the screenshots and the audit: they aren't the app", async () => {
    const PHONE = [{ name: "mobile" as const, width: 390, height: 844, scale: 2, mobile: true }];
    const out = tempDir("motif-shots-");
    const { routes, issues } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/devtools"], outDir: out, settleMs: 50, viewports: PHONE, audit: true });
    expect(routes[0]!.error).toBeUndefined();
    expect(pixel(readFileSync(join(out, "devtools.mobile.png")), 120, 120).slice(0, 3)).toEqual([255, 255, 255]);
    expect(issues).toEqual([]);
  }, 120_000);
});

const cert = selfSignedCert();
describe.skipIf(!browser || !cert)("captureScreens on https with the dev server's own certificate (backlog)", () => {
  test("a local app on https is captured", async () => {
    const tls = Bun.serve({ hostname: "127.0.0.1", port: 0, tls: cert!, fetch: () => html("<h1>Secure</h1>") });
    try {
      const out = tempDir("motif-shots-");
      const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `https://127.0.0.1:${tls.port}`, routes: ["/"], outDir: out, settleMs: 50, viewports: [{ name: "desktop", width: 1440, height: 900, scale: 1, mobile: false }] });
      expect([routes[0]!.status, routes[0]!.error]).toEqual([200, undefined]);
      expect(routes[0]!.shots).toHaveLength(2);
    } finally {
      tls.stop(true);
    }
  }, 60_000);
});

const DESKTOP = [{ name: "desktop" as const, width: 1440, height: 900, scale: 1, mobile: false }];
describe.skipIf(!browser)("captureScreens: from the review of batch B", () => {
  test("what a state script starts loading is waited for, as the page itself is", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({
      browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/later"], outDir: out, settleMs: 50, viewports: DESKTOP,
      states: [{ name: "clicked", script: 'document.getElementById("go").click();' }],
    });
    expect(routes[0]!.pageErrors).toBeUndefined();
    expect(size(join(out, "later@clicked.desktop.png")).height).toBeGreaterThanOrEqual(3000);
  }, 60_000);

  test("a request the page keeps open (a long poll) doesn't hold every screenshot up", async () => {
    // Against a plain page captured the same way, so a slow machine's own time cancels out: each of the two screenshots
    // waits about 2 s longer for the long poll (when it counts as live), not the 5 s it would wait if it held them up.
    const time = async (route: string) => {
      const started = Date.now();
      const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: [route], outDir: tempDir("motif-shots-"), settleMs: 50, viewports: DESKTOP });
      // On a slow CI runner a capture has come back empty (Oct 2026); say why if it does again.
      if (routes[0]!.shots.length !== 2) console.log(JSON.stringify(routes[0], null, 2));
      expect(routes[0]!.shots).toHaveLength(2);
      return Date.now() - started;
    };
    const plain = await time("/");
    const poll = await time("/poll");
    expect(poll - plain).toBeLessThan(7_000);
  }, 90_000);
});

describe.skipIf(!browser)("a page's own errors and its states (backlog)", () => {
  test("an error the page throws as it loads is reported once, not again for each state", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({
      browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/throws"], outDir: out, settleMs: 50,
      viewports: [{ name: "desktop", width: 1440, height: 900, scale: 1, mobile: false }],
      states: [{ name: "open", script: "document.body.dataset.open = '1';" }],
    });
    expect(routes[0]!.pageErrors).toEqual(["Error: boom: data is undefined"]);
  }, 60_000);
});

// Plan 2G, Task 7 (the 2E lesson): an app that passes its own variant to its theme is still drawn in the guide's default
// for the default's screenshots, because those set data-variant to the default's id too.
describe.skipIf(!browser)("the default variant's attribute (needs Chrome, Edge or Chromium)", () => {
  const PHONE = [{ name: "mobile" as const, width: 390, height: 844, scale: 2, mobile: true }];
  /** A page whose theme follows data-variant when it names a variant, else the app's own choice ("men"), as Motif's React Native provider does. */
  const OWN_CHOICE = `<!doctype html><html><head><style>body { margin: 0 } #t { height: 200px }</style></head><body><div id="t">Hello</div><script>
    const colours = { women: "#b91c1c", men: "#0e5c4d" };
    const paint = () => { const id = document.documentElement.dataset.variant; document.getElementById("t").style.background = colours[id in colours ? id : "men"]; };
    paint();
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-variant"] });
  </script></body></html>`;

  test("the default's shots set data-variant to the default's id: an app's own variant doesn't take them over; names are unchanged", async () => {
    const root = makeProject({ "index.html": OWN_CHOICE });
    const site = startStaticServer(root);
    try {
      const out = join(root, "shots");
      const r = await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir: out, settleMs: 50, viewports: PHONE, variants: ["men"], defaultVariant: "women" });
      if (r.routes[0]!.shots.length !== 4) console.log(JSON.stringify(r.routes[0], null, 2));
      expect(r.routes[0]!.shots.map((s) => s.slice(out.length + 1)).sort()).toEqual(["index+men.mobile.dark.png", "index+men.mobile.png", "index.mobile.dark.png", "index.mobile.png"]);
      expect(readFileSync(join(out, "index.mobile.png")).equals(readFileSync(join(out, "index+men.mobile.png")))).toBe(false);

      // Without it (as before), the app's own choice is what the default's shots show.
      const before = join(root, "before");
      await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir: before, settleMs: 50, viewports: PHONE, variants: ["men"] });
      expect(readFileSync(join(before, "index.mobile.png")).equals(readFileSync(join(before, "index+men.mobile.png")))).toBe(true);
    } finally {
      site.stop();
    }
  }, 120_000);

  test("a page styled by Motif's web CSS looks the same with the default's id set: it has no rule for it", async () => {
    const set = buildThemeSet(docFrom(twoVariantTokens()));
    const css = motifCss(set.base, set.variants);
    const page = `<!doctype html><html><head><style>${css}\nbody { margin: 0; background: var(--motif-color-background); } .card { margin: 24px; height: 120px; background: var(--motif-color-surface); border: 2px solid var(--motif-color-border); border-radius: var(--motif-radius-md); }</style></head><body><div class="card"></div></body></html>`;
    const root = makeProject({ "index.html": page });
    const site = startStaticServer(root);
    try {
      const withId = join(root, "with"), without = join(root, "without");
      await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir: withId, settleMs: 50, viewports: PHONE, variants: ["men"], defaultVariant: "women" });
      await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir: without, settleMs: 50, viewports: PHONE, variants: ["men"] });
      for (const name of ["index.mobile.png", "index.mobile.dark.png"]) expect(readFileSync(join(withId, name)).equals(readFileSync(join(without, name)))).toBe(true);
      // And the variant does differ, so the page does follow data-variant.
      expect(readFileSync(join(withId, "index.mobile.png")).equals(readFileSync(join(withId, "index+men.mobile.png")))).toBe(false);
    } finally {
      site.stop();
    }
  }, 120_000);
});

describe("the web's generated CSS has no rule for the default variant's id", () => {
  test("React web (every Tailwind setup) and plain web", () => {
    const set = buildThemeSet(docFrom(twoVariantTokens()));
    const files = [
      ...(["v4", "v3", "none"] as const).flatMap((tailwind) => generateReactWeb(set.base, { srcDir: "src", tailwind }, set.variants)),
      ...generateFallback(set.base, set.variants),
    ];
    expect(files.some((f) => f.content.includes('data-variant="men"'))).toBe(true);
    for (const f of files) expect(f.content).not.toContain('data-variant="women"');
  });
});

describe.skipIf(!browser)("an app's own fixed scheme (needs Chrome, Edge or Chromium)", () => {
  test("every screenshot is taken in it: the .dark ones of a light-only app look light", async () => {
    const PHONE = [{ name: "mobile" as const, width: 390, height: 844, scale: 2, mobile: true }];
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/"], outDir: out, settleMs: 50, viewports: PHONE, appScheme: "light" });
    expect(routes[0]!.shots.map((f) => f.slice(out.length + 1))).toEqual(["index.mobile.png", "index.mobile.dark.png"]);
    expect(readFileSync(join(out, "index.mobile.png")).equals(readFileSync(join(out, "index.mobile.dark.png")))).toBe(true);
    // The same page follows the browser without it (its own CSS has a dark mode).
    const free = tempDir("motif-shots-");
    await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/"], outDir: free, settleMs: 50, viewports: PHONE });
    expect(readFileSync(join(free, "index.mobile.png")).equals(readFileSync(join(free, "index.mobile.dark.png")))).toBe(false);
  }, 120_000);
});
