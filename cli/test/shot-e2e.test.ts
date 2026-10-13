import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
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

describe.skipIf(!browser || !bun)("compiled motif shot (needs Chrome, Edge or Chromium, and bun on PATH)", () => {
  beforeAll(() => {
    bin = join(tempDir("motif-build-"), process.platform === "win32" ? "motif.exe" : "motif");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", bin]);
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  }, 180_000);

  test("starts the app, screenshots and audits its pages, then stops it", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "fixture", private: true, scripts: { dev: "bun server.ts" }, dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } }),
      "bun.lock": "",
      "node_modules/.keep": "",
      "server.ts": SERVER,
    });
    const r = Bun.spawnSync([bin, "shot", "--audit", "--routes", "/,/settings", "--json", "--cwd", root], { env: { ...process.env, MOTIF_HOME: tempDir("motif-home-") } });
    const out = JSON.parse(r.stdout.toString());
    expect(r.exitCode).toBe(1);
    expect(out.routes.map((x: { route: string; status: number }) => [x.route, x.status])).toEqual([["/", 200], ["/settings", 200]]);
    expect(out.shots).toHaveLength(8);
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
});
