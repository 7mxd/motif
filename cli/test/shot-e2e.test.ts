import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, VIEWPORTS } from "../src/shot/capture";
import { startStaticServer } from "../src/shot/static-server";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO_ROOT = join(import.meta.dir, "../..");
const browser = findBrowser();
const bun = Bun.which("bun");
let bin = "";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// The fixture app's "dev server": a tiny Bun server, started by `bun run dev` like any other app.
const SERVER = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
const page = (body) => new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px;font:16px sans-serif;background:#ffffff;color:#111111">' + body + "</body></html>", { headers: { "content-type": "text/html" } });
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === "/") return page('<h1>Home</h1><button style="width:48px;height:48px">OK</button>');
  if (path === "/settings") return page('<p style="color:#aaaaaa">Faint</p><div><button aria-label="A" style="width:16px;height:16px;padding:0;border:0;margin:0"></button><button aria-label="B" style="width:16px;height:16px;padding:0;border:0;margin:0"></button></div>');
  return new Response("Not found", { status: 404 });
} });
console.log("  ➜  Local:   http://localhost:" + s.port + "/");
`;
const FIXTURE = {
  "package.json": JSON.stringify({ name: "fixture", private: true, scripts: { dev: "bun server.ts" }, dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } }),
  "bun.lock": "",
  "node_modules/.keep": "",
  "server.ts": SERVER,
};

describe.skipIf(!browser || !bun)("compiled motif shot (needs Chrome, Edge or Chromium, and bun on PATH)", () => {
  beforeAll(() => {
    bin = join(tempDir("motif-build-"), process.platform === "win32" ? "motif.exe" : "motif");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", bin]);
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  }, 180_000);

  test("starts the app, screenshots and audits its pages, then stops it", async () => {
    const root = makeProject(FIXTURE);
    const r = Bun.spawnSync([bin, "shot", "--audit", "--routes", "/,/settings", "--json", "--cwd", root], { env: { ...process.env, MOTIF_HOME: tempDir("motif-home-") } });
    const out = JSON.parse(r.stdout.toString());
    expect(r.exitCode).toBe(1);
    expect(out.routes.map((x: { route: string; status: number }) => [x.route, x.status])).toEqual([["/", 200], ["/settings", 200]]);
    expect(out.shots).toHaveLength(20);
    expect(pngSize(new Uint8Array(readFileSync(join(root, "design/shots/index.mobile.png")))).width).toBe(780);
    const found = new Set(out.findings.map((f: { severity: string; category: string; location: { screen: string } }) => `${f.severity} ${f.category} ${f.location.screen}`));
    expect(found.has("critical contrast /settings")).toBe(true);
    expect(found.has("critical target-size /settings")).toBe(true);
    expect([...found].some((f) => String(f).endsWith(" /"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "design/shots/audit.json"), "utf8")).motifReview).toBe(1);
    expect(existsSync(join(root, "design/shots/.gitignore"))).toBe(true);
    const pid = Number(readFileSync(join(root, "server.pid"), "utf8"));
    const deadline = Date.now() + 5000;
    while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
    expect(alive(pid)).toBe(false);
  }, 180_000);

  test("the app next to its mockup while building, and before and after a change", async () => {
    const root = makeProject(FIXTURE);
    const run = (...args: string[]) => {
      const r = Bun.spawnSync([bin, ...args, "--json", "--cwd", root], { env: { ...process.env, MOTIF_HOME: tempDir("motif-home-") } });
      return { code: r.exitCode, out: JSON.parse(r.stdout.toString()) };
    };

    // While building: the mockup's PNGs, then the page next to them.
    mkdirSync(join(root, "design", "previews"), { recursive: true });
    writeFileSync(join(root, "design/previews/home.html"), readFileSync(join(REPO_ROOT, "skill/preview-kit/template.html"), "utf8"));
    expect(run("preview", "design/previews/home.html", "--png-only", "--preset", "minimal").code).toBe(0);
    const side = run("shot", "--routes", "/", "--against", "design/previews/home.html");
    expect(side.out.comparisons.map((c: { image: string }) => c.image)).toEqual(["design/shots/compare/mockup/home.dark.png", "design/shots/compare/mockup/home.png"]);
    expect(existsSync(join(root, "design/shots/compare/mockup/home.png"))).toBe(true);

    // Before and after a change.
    expect(run("shot", "--routes", "/,/settings", "--save", "before").out.saved).toBe("design/shots/before");
    writeFileSync(join(root, "server.ts"), SERVER.replace("<h1>Home</h1>", "<h1>Welcome home</h1><p>New intro text</p>"));
    const after = run("shot", "--routes", "/,/settings", "--against", "before");
    const changed = Object.fromEntries(after.out.comparisons.map((c: { after: string; changed: number }) => [c.after.split("/").pop(), c.changed]));
    expect(changed["index.mobile.png"]).toBeGreaterThan(0.1);
    expect(changed["settings.mobile.png"]).toBe(0);
    expect(existsSync(join(root, "design/shots/compare/before/index.mobile.png"))).toBe(true);
  }, 240_000);
});

describe.skipIf(!browser)("captureScreens in a design variant (needs Chrome, Edge or Chromium)", () => {
  test("data-variant is set after load and before a state script; names carry +<variant>; the audit sees the variant's colours", async () => {
    const root = makeProject({
      "index.html":
        '<!doctype html><style>p { color: #111111 } html[data-variant="men"] p { color: #dddddd } body { background: #ffffff; margin: 0 }</style><p id="t">Hello there</p><script>document.title = "" + document.documentElement.dataset.variant</script>',
    });
    const site = startStaticServer(root);
    try {
      const outDir = join(root, "shots");
      const r = await captureScreens({
        browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir, settleMs: 50, audit: true, viewports: VIEWPORTS.filter((v) => v.width === 390),
        variants: ["men"],
        // The state script sees the variant already set.
        states: [{ name: "seen", script: 'document.getElementById("t").textContent = "variant:" + document.documentElement.dataset.variant;' }],
      });
      const files = r.routes[0]!.shots.map((s) => s.slice(outDir.length + 1).replace(/\\/g, "/")).sort();
      expect(files).toEqual([
        "index+men.mobile.dark.png", "index+men.mobile.png", "index.mobile.dark.png", "index.mobile.png",
        "index@seen+men.mobile.dark.png", "index@seen+men.mobile.png", "index@seen.mobile.dark.png", "index@seen.mobile.png",
      ]);
      expect(r.issues.length).toBeGreaterThan(0);
      const contrast = r.issues.filter((i) => i.rule === "color-contrast");
      expect(contrast.every((i) => i.variant === "men")).toBe(true);
      expect(contrast.some((i) => i.shot.includes("index+men."))).toBe(true);
    } finally {
      site.stop();
    }
  }, 120_000);
});

describe.skipIf(!browser)("accessible names and right to left (needs Chrome, Edge or Chromium)", () => {
  const PAGE = (body: string, head = "") =>
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${head}<style>body { margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111 }</style></head><body>${body}</body></html>`;

  test("a button with only an icon in it has no name", async () => {
    const root = makeProject({
      "index.html": PAGE('<button id="menu" style="width: 48px; height: 48px"><svg width="16" height="16"></svg></button><button id="ok" style="width: 48px; height: 48px">OK</button>'),
    });
    const site = startStaticServer(root);
    try {
      const r = await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir: join(root, "shots"), settleMs: 50, audit: true, viewports: VIEWPORTS.filter((v) => v.width === 390) });
      const named = r.issues.filter((i) => i.rule === "name");
      expect(named.length).toBeGreaterThan(0);
      expect(new Set(named.map((i) => `${i.selector} ${i.kind}`))).toEqual(new Set(["#menu button"]));
      // Light and dark both: the check runs in every scheme.
      expect(new Set(named.map((i) => i.scheme))).toEqual(new Set(["light", "dark"]));
    } finally {
      site.stop();
    }
  }, 120_000);

  test("--rtl: a page with no dir is set right to left by Motif and says so; one that follows the language doesn't", async () => {
    const root = makeProject({
      "public/index.html": PAGE("<h1>Hello there</h1><p>A short line of text that sits on one side.</p>"),
      "public/follows.html": PAGE(
        "<h1>Hello there</h1><p>A short line of text that sits on one side.</p>",
        '<script>document.documentElement.dir = navigator.language.startsWith("ar") ? "rtl" : "ltr"; document.documentElement.lang = navigator.language;</script>',
      ),
    });
    const r = await runShot(root, { positionals: [], flags: { rtl: "ar", sizes: "390" } });
    expect(r.exitCode).toBe(0);
    expect(r.data.notes).toEqual([`/ doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.`]);
    const shots = join(root, "design/shots");
    for (const name of ["index", "follows-html"]) {
      for (const dark of ["", ".dark"]) {
        const ltr = readFileSync(join(shots, `${name}.mobile${dark}.png`));
        const rtl = readFileSync(join(shots, `${name}.mobile.rtl${dark}.png`));
        expect(Buffer.compare(ltr, rtl)).not.toBe(0);
      }
    }
    expect(r.text).toContain("light and dark, right to left in ar)");
  }, 120_000);
});
