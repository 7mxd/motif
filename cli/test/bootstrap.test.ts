import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO_ROOT = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO_ROOT, "skill/VERSION"), "utf8").trim();
const isWin = process.platform === "win32";
const OS = isWin ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
const ARCH = isWin ? "x64" : process.arch === "arm64" ? "arm64" : "x64";
const ASSET = `motif-${OS}-${ARCH}${isWin ? ".exe" : ""}`;
const slash = (p: string) => p.replace(/\\/g, "/");

let builtPath = "";
let binary: Uint8Array<ArrayBuffer>;
let server: ReturnType<typeof Bun.serve>;
let hits = 0;

beforeAll(() => {
  builtPath = join(tempDir("motif-build-"), isWin ? "motif.exe" : "motif");
  const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", builtPath]);
  if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  binary = new Uint8Array(readFileSync(builtPath));
  const goodSums = `${createHash("sha256").update(binary).digest("hex")}  ${ASSET}\n`;
  const badSums = `${"0".repeat(64)}  ${ASSET}\n`;
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === `/ok/${ASSET}` || path === `/bad/${ASSET}`) {
        hits++;
        return new Response(binary);
      }
      if (path === "/ok/SHA256SUMS") return new Response(goodSums);
      if (path === "/bad/SHA256SUMS") return new Response(badSums);
      return new Response("not found", { status: 404 });
    },
  });
}, 180_000);

afterAll(() => server?.stop(true));

const sh = Bun.which("sh");
const RUNNERS = [
  { name: "posix sh", available: Boolean(sh), cmd: (a: string[]) => [sh!, join(REPO_ROOT, "skill/bin/motif"), ...a] },
  { name: "windows cmd → powershell", available: isWin, cmd: (a: string[]) => ["cmd", "/c", join(REPO_ROOT, "skill/bin/motif.cmd"), ...a] },
];

for (const runner of RUNNERS) {
  describe.skipIf(!runner.available)(`bootstrap via ${runner.name}`, () => {
    const freshHome = () => slash(tempDir("motif-home-"));
    const cached = (home: string) => join(home, "bin", VERSION, isWin ? "motif.exe" : "motif");
    // Async spawn: a synchronous spawn would block this process, and with it the local download server.
    const run = async (base: string, home: string, args: string[], extra: Record<string, string> = {}) => {
      const proc = Bun.spawn(runner.cmd(args), {
        env: { ...process.env, MOTIF_HOME: home, MOTIF_DOWNLOAD_BASE: `http://127.0.0.1:${server.port}/${base}`, ...extra },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { stdout, stderr, exitCode };
    };

    test("downloads once, verifies, caches, then runs from the cache", async () => {
      const home = freshHome();
      const before = hits;
      const first = await run("ok", home, ["--version"]);
      expect(first.stderr.toString()).toContain("one time only");
      expect(first.exitCode).toBe(0);
      expect(first.stdout.toString().trim()).toBe(VERSION);
      expect(existsSync(cached(home))).toBe(true);
      const second = await run("ok", home, ["--version"]);
      expect(second.exitCode).toBe(0);
      expect(second.stderr.toString()).not.toContain("one time only");
      expect(hits - before).toBe(1);
    }, 120_000);

    test("passes arguments and exit codes through", async () => {
      const r = await run("ok", freshHome(), ["fly"]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain('Unknown command "fly"');
    }, 120_000);

    test("a checksum mismatch aborts with a plain message and caches nothing", async () => {
      const home = freshHome();
      const r = await run("bad", home, ["--version"]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("failed its safety check");
      expect(existsSync(cached(home))).toBe(false);
    }, 120_000);

    test("a failed download aborts with a plain message and caches nothing", async () => {
      const home = freshHome();
      const r = await run("missing", home, ["--version"]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("couldn't download");
      expect(existsSync(join(home, "bin"))).toBe(false);
    }, 120_000);

    test("several first runs at the same time all succeed (agents run tools in parallel)", async () => {
      const home = freshHome();
      const results = await Promise.all(Array.from({ length: 6 }, () => run("ok", home, ["--version"])));
      for (const r of results) {
        expect(r.stderr).not.toContain("Move-Item");
        expect(r.stderr).not.toContain("cannot stat");
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe(VERSION);
      }
    }, 180_000);

    test("MOTIF_BIN skips the download entirely", async () => {
      const r = await run("missing", freshHome(), ["--version"], { MOTIF_BIN: slash(builtPath) });
      expect(r.exitCode).toBe(0);
      expect(r.stdout.toString().trim()).toBe(VERSION);
    }, 120_000);
  });
}
