import { afterAll, describe, expect, test } from "bun:test";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

describe("installBrowser (backlog)", () => {
  async function withZips(zips: ReturnType<typeof zipSync>[], fn: (indexUrl: string) => Promise<void>) {
    let n = 0;
    const server = serve({});
    const base = `http://127.0.0.1:${server.port}`;
    server.reload({ fetch: (req) => (new URL(req.url).pathname === "/index.json" ? index(base) : new Response(zips[Math.min(n++, zips.length - 1)]!)) });
    try {
      await fn(`${base}/index.json`);
    } finally {
      server.stop(true);
    }
  }
  const exe = `chrome-headless-shell-${plat}/${exeName}`;

  test("an unpack that fails leaves the copy already installed as it was, and no half-unpacked folder", async () => {
    const good = zipSync({ [exe]: strToU8("fake browser") });
    const bad = zipSync({ [exe]: strToU8("new browser"), [`chrome-headless-shell-${plat}/x`]: strToU8("a file"), [`chrome-headless-shell-${plat}/x/y`]: strToU8("under a file") });
    await withZips([good, bad], async (indexUrl) => {
      const home = tempDir("motif-home-");
      await installBrowser({ home, indexUrl });
      await expect(installBrowser({ home, indexUrl })).rejects.toThrow("Couldn't unpack the browser");
      expect(readFileSync(installedBrowser(home)!, "utf8")).toBe("fake browser");
      expect(readdirSync(join(home, "browsers")).sort()).toEqual(["1.2.3", "current.json"]);
    });
  });

  test("entries with a drive letter or an absolute path are skipped, not a raw error", async () => {
    await withZips([zipSync({ [exe]: strToU8("fake browser"), "C:/evil.txt": strToU8("x"), "/abs.txt": strToU8("x") })], async (indexUrl) => {
      const home = tempDir("motif-home-");
      const r = await installBrowser({ home, indexUrl });
      expect(readFileSync(r.path, "utf8")).toBe("fake browser");
      expect(readdirSync(join(home, "browsers", "1.2.3"))).toEqual([`chrome-headless-shell-${plat}`]);
    });
  });

  test("reinstalling the same version while its copy is in use replaces it; leftovers go on the next install (review of batch A)", async () => {
    const zip = (text: string) => zipSync({ [exe]: strToU8(text) });
    await withZips([zip("old browser"), zip("new browser"), zip("newest browser")], async (indexUrl) => {
      const home = tempDir("motif-home-");
      const first = await installBrowser({ home, indexUrl });
      const held = openSync(first.path, "r");
      try {
        await installBrowser({ home, indexUrl });
        expect(readFileSync(installedBrowser(home)!, "utf8")).toBe("new browser");
      } finally {
        closeSync(held);
      }
      mkdirSync(join(home, "browsers", "1.0.0.motif-99999.partial"), { recursive: true });
      writeFileSync(join(home, "browsers", "1.0.0.motif-99999.partial", "junk"), "x");
      await installBrowser({ home, indexUrl });
      expect(readFileSync(installedBrowser(home)!, "utf8")).toBe("newest browser");
      expect(readdirSync(join(home, "browsers")).sort()).toEqual(["1.2.3", "current.json"]);
    });
  });

  test("says when it starts unpacking, and gives a total of 0 when the server doesn't say the size (review of batch A)", async () => {
    const body = zipSync({ [exe]: strToU8("fake browser".repeat(1000)) });
    const server = serve({});
    const base = `http://127.0.0.1:${server.port}`;
    server.reload({
      fetch: (req) =>
        new URL(req.url).pathname === "/index.json"
          ? index(base)
          : // Still open when the reply starts, so the server can't know the size and sends it in chunks (on Linux it
          // otherwise buffers a stream that closes at once and gives its length).
          new Response(new ReadableStream({ start(c) { c.enqueue(body.slice(0, 100)); setTimeout(() => { c.enqueue(body.slice(100)); c.close(); }, 50); } })),
    });
    try {
      const totals = new Set<number>();
      const stages: string[] = [];
      await installBrowser({ home: tempDir("motif-home-"), indexUrl: `${base}/index.json`, onProgress: (_got, total) => totals.add(total), onStage: (s) => stages.push(s) });
      expect([...totals]).toEqual([0]);
      expect(stages).toEqual(["unpacking"]);
    } finally {
      server.stop(true);
    }
  });

  test("a download that stops sending gives up, instead of waiting forever (backlog)", async () => {
    const server = serve({});
    const base = `http://127.0.0.1:${server.port}`;
    server.reload({
      fetch: (req) =>
        new URL(req.url).pathname === "/index.json"
          ? index(base)
          : new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); } }), { headers: { "content-length": "1000" } }),
    });
    try {
      const started = Date.now();
      await expect(installBrowser({ home: tempDir("motif-home-"), indexUrl: `${base}/index.json`, idleTimeoutMs: 500 })).rejects.toThrow("stopped");
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      server.stop(true);
    }
  });

  test("a download whose server never answers gives up, and so does a list that stops part-way (review of batch G)", async () => {
    const server = serve({});
    const base = `http://127.0.0.1:${server.port}`;
    server.reload({ fetch: (req) => (new URL(req.url).pathname === "/index.json" ? index(base) : new Promise<Response>(() => {})) });
    try {
      const started = Date.now();
      await expect(installBrowser({ home: tempDir("motif-home-"), indexUrl: `${base}/index.json`, idleTimeoutMs: 500 })).rejects.toThrow("didn't answer");
      expect(Date.now() - started).toBeLessThan(5000);
      server.reload({ fetch: () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{")); } }), { headers: { "content-type": "application/json" } }) });
      await expect(installBrowser({ home: tempDir("motif-home-"), indexUrl: `${base}/index.json`, idleTimeoutMs: 500 })).rejects.toThrow("Couldn't read the Chrome for Testing download list");
    } finally {
      server.stop(true);
    }
  });

  test("reports how much has downloaded", async () => {
    await withZips([zipSync({ [exe]: strToU8("fake browser".repeat(1000)) })], async (indexUrl) => {
      const seen: [number, number][] = [];
      await installBrowser({ home: tempDir("motif-home-"), indexUrl, onProgress: (got, total) => seen.push([got, total]) });
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.at(-1)![0]).toBe(seen.at(-1)![1]);
      expect(seen.every(([got], i) => i === 0 || got >= seen[i - 1]![0])).toBe(true);
    });
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
  test("MOTIF_BROWSER=none is named, not \"No Chrome or Edge found\" (backlog)", async () => {
    const r = await runBrowser(".", { positionals: [] }, { find: () => null, off: () => true, install: async () => ({ version: "", path: "", bytes: 0 }) });
    expect(r.text).toBe("MOTIF_BROWSER=none turns the browser off: previews and screenshots make no images. Unset MOTIF_BROWSER to use Chrome or Edge.");
  });
  test("without a size, install counts megabytes; it says when it unpacks (review of batch A)", async () => {
    const lines: string[] = [];
    const install = async (onProgress?: (got: number, total: number) => void, onStage?: (stage: "unpacking") => void) => {
      for (const got of [5e6, 12e6, 15e6, 25e6]) onProgress?.(got, 0);
      onStage?.("unpacking");
      return { version: "9.9", path: "/m/shell", bytes: 25e6 };
    };
    await runBrowser(".", { positionals: ["install"], progress: (l: string) => lines.push(l) }, { find: () => null, install });
    expect(lines).toEqual(["Downloading the browser… 10 MB", "Downloading the browser… 20 MB", "Unpacking the browser…"]);
  });
  test("install shows its progress to a person watching (backlog)", async () => {
    const lines: string[] = [];
    const install = async (onProgress?: (got: number, total: number) => void) => {
      for (const got of [10, 50, 55, 100]) onProgress?.(got, 100);
      return { version: "9.9", path: "/m/shell", bytes: 100 };
    };
    await runBrowser(".", { positionals: ["install"], progress: (l: string) => lines.push(l) }, { find: () => null, install });
    expect(lines).toEqual(["Downloading the browser… 10%", "Downloading the browser… 50%", "Downloading the browser… 100%"]);
  });
  test("an unknown action is a usage error", async () => {
    expect((await runBrowser(".", { positionals: ["fly"] }, { find: () => null, install: async () => ({ version: "", path: "", bytes: 0 }) })).exitCode).toBe(2);
  });
});
