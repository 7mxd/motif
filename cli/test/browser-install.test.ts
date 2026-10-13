import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { cftPlatform, installBrowser, installedBrowser } from "../src/browser/install";
import { runBrowser } from "../src/commands/browser";
import { findBrowser, type BrowserEnv } from "../src/detect/browser";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const plat = cftPlatform()!;
const exeName = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";

function serve(routes: Record<string, Response | (() => Response)>) {
  return Bun.serve({
    port: 0,
    fetch(req) {
      const r = routes[new URL(req.url).pathname];
      return r ? (typeof r === "function" ? r() : r.clone()) : new Response("missing", { status: 404 });
    },
  });
}
const index = (base: string) =>
  Response.json({ channels: { Stable: { version: "1.2.3", downloads: { "chrome-headless-shell": [{ platform: plat, url: `${base}/shell.zip` }] } } } });

describe("cftPlatform", () => {
  test.each([
    ["win32", "x64", "win64"], ["win32", "ia32", "win32"], ["darwin", "arm64", "mac-arm64"], ["darwin", "x64", "mac-x64"],
    ["linux", "x64", "linux64"], ["linux", "arm64", "linux-arm64"], ["aix", "ppc64", null],
  ])("%s %s → %s", (platform, arch, expected) => {
    expect(cftPlatform(platform as NodeJS.Platform, arch)).toBe(expected);
  });
});

describe("installBrowser", () => {
  test("downloads, unpacks and records the headless browser; ignores entries that escape the folder", async () => {
    const zip = zipSync({ [`chrome-headless-shell-${plat}/${exeName}`]: strToU8("fake browser"), "../evil.txt": strToU8("x") });
    const server = serve({});
    const base = `http://127.0.0.1:${server.port}`;
    server.reload({ fetch: (req) => (new URL(req.url).pathname === "/index.json" ? index(base) : new Response(zip)) });
    try {
      const home = tempDir("motif-home-");
      const r = await installBrowser({ home, indexUrl: `${base}/index.json` });
      expect(r.version).toBe("1.2.3");
      expect(readFileSync(r.path, "utf8")).toBe("fake browser");
      expect(installedBrowser(home)).toBe(r.path);
      expect(existsSync(join(home, "browsers", "evil.txt"))).toBe(false);
      expect(existsSync(join(home, "evil.txt"))).toBe(false);
    } finally {
      server.stop(true);
    }
  });

  test("a damaged archive or a missing browser inside it is a plain error", async () => {
    const server = serve({});
    const base = `http://127.0.0.1:${server.port}`;
    let body = strToU8("not a zip");
    server.reload({ fetch: (req) => (new URL(req.url).pathname === "/index.json" ? index(base) : new Response(body)) });
    try {
      await expect(installBrowser({ home: tempDir("motif-home-"), indexUrl: `${base}/index.json` })).rejects.toThrow("damaged");
      body = zipSync({ "something-else/readme.txt": strToU8("x") });
      await expect(installBrowser({ home: tempDir("motif-home-"), indexUrl: `${base}/index.json` })).rejects.toThrow("doesn't contain the browser");
    } finally {
      server.stop(true);
    }
  });

  test("an unreachable list or an unsupported system is a plain error", async () => {
    const server = serve({});
    try {
      await expect(installBrowser({ home: tempDir("motif-home-"), indexUrl: `http://127.0.0.1:${server.port}/nope` })).rejects.toThrow("Couldn't reach");
      await expect(installBrowser({ home: tempDir("motif-home-"), platform: "aix" })).rejects.toThrow("can't download a browser");
    } finally {
      server.stop(true);
    }
  });
});

describe("findBrowser with MOTIF_BROWSER and an installed copy", () => {
  const env = (over: Partial<BrowserEnv>): BrowserEnv => ({
    platform: "linux", env: {}, home: "/home/u", which: () => null, exists: () => true, ...over,
  });
  test("MOTIF_BROWSER=none turns browsers off", () => {
    expect(findBrowser(env({ env: { MOTIF_BROWSER: "none" }, which: () => "/usr/bin/chromium" }))).toBeNull();
  });
  test("the installed copy is used when no system browser exists", () => {
    expect(findBrowser(env({ installed: () => "/m/browsers/1/shell" }))).toEqual({ name: "Motif", path: "/m/browsers/1/shell" });
  });
  test("a system browser wins over the installed copy", () => {
    expect(findBrowser(env({ which: (c) => (c === "chromium" ? "/usr/bin/chromium" : null), installed: () => "/m/shell" }))!.name).toBe("Chromium");
  });
});

describe("runBrowser", () => {
  test("reports the browser in use", async () => {
    const r = await runBrowser(".", { positionals: [] }, { find: () => ({ name: "Edge", path: "C:\\edge.exe" }), install: async () => ({ version: "", path: "", bytes: 0 }) });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("Edge");
  });
  test("says how to install one when none is found", async () => {
    const r = await runBrowser(".", { positionals: [] }, { find: () => null, install: async () => ({ version: "", path: "", bytes: 0 }) });
    expect(r.data.browser).toBeNull();
    expect(r.text).toContain("motif browser install");
  });
  test("install reports what it installed, and failures plainly", async () => {
    const ok = await runBrowser(".", { positionals: ["install"] }, { find: () => null, install: async () => ({ version: "9.9", path: "/m/shell", bytes: 1 }) });
    expect([ok.exitCode, ok.text.includes("9.9")]).toEqual([0, true]);
    const bad = await runBrowser(".", { positionals: ["install"] }, { find: () => null, install: async () => { throw new Error("offline"); } });
    expect([bad.exitCode, bad.text]).toEqual([2, "offline"]);
  });
  test("an unknown action is a usage error", async () => {
    expect((await runBrowser(".", { positionals: ["fly"] }, { find: () => null, install: async () => ({ version: "", path: "", bytes: 0 }) })).exitCode).toBe(2);
  });
});
