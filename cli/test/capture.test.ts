import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, routeSlug, routeUrl, shotName } from "../src/shot/capture";
import { cleanupTempDirs, tempDir } from "./tmp";

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
  test("shotName", () => {
    expect(shotName("index", "mobile", "light")).toBe("index.mobile.png");
    expect(shotName("index", "desktop", "dark")).toBe("index.desktop.dark.png");
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
      return html("<h1>Not found</h1>", 404);
    },
  });
});
afterAll(() => server?.stop(true));

const size = (file: string) => pngSize(new Uint8Array(readFileSync(file)));

describe.skipIf(!browser)("captureScreens (needs Chrome, Edge or Chromium)", () => {
  test("every page at phone and desktop widths, light and dark; long pages are cropped", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/", "/long"], outDir: out, settleMs: 50 });
    expect(routes.map((r) => [r.route, r.status, r.error])).toEqual([["/", 200, undefined], ["/long", 200, undefined]]);
    expect(routes[0]!.shots.map((f) => f.slice(out.length + 1))).toEqual(["index.mobile.png", "index.mobile.dark.png", "index.desktop.png", "index.desktop.dark.png"]);
    expect(size(join(out, "index.mobile.png"))).toEqual({ width: 780, height: 2000 });
    expect(size(join(out, "index.desktop.png"))).toEqual({ width: 1440, height: 1000 });
    expect(routes[1]!.cropped).toBe(true);
    expect(size(join(out, "long.mobile.png"))).toEqual({ width: 780, height: 16000 });
    expect(size(join(out, "long.desktop.dark.png"))).toEqual({ width: 1440, height: 8000 });
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
    expect(byRoute["/broken"]!.shots).toHaveLength(4);
    expect(byRoute["/missing"]!.status).toBe(404);
    expect(byRoute["/old"]!.status).toBe(200);
    expect(byRoute["/old"]!.finalUrl).toBe(`http://localhost:${server.port}/`);
    expect(byRoute["/slow"]!.error).toBeString();
    expect(byRoute["/"]!.shots).toHaveLength(4);
    const unreachable = await captureScreens({ browserPath: browser!.path, baseUrl: "http://127.0.0.1:1", routes: ["/"], outDir: out, settleMs: 50, timeoutMs: 3000 });
    expect(unreachable.routes[0]).toMatchObject({ status: 0, shots: [] });
    expect(unreachable.routes[0]!.error).toContain("Couldn't reach");
  }, 120_000);
});
