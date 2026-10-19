import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, routeSlug, routeUrl, shotName, stateExpression } from "../src/shot/capture";
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
