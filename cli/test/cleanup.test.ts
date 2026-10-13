import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBrowser } from "../src/detect/browser";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const SRC = join(import.meta.dir, "../src").replace(/\\/g, "/");
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A script in a fresh temp folder (paths in it are JSON-quoted, so Windows backslashes survive). */
function script(body: (dir: string) => string): { file: string; dir: string } {
  const dir = tempDir("motif-exit-");
  const file = join(dir, "run.ts");
  writeFileSync(file, body(dir));
  return { file, dir };
}

describe("onExit", () => {
  test("hooks run when the process exits; cancelled hooks don't", () => {
    const { file, dir } = script((d) => `
import { writeFileSync } from "node:fs";
import { onExit } from "${SRC}/cleanup";
onExit(() => writeFileSync(${JSON.stringify(join(d, "ran"))}, "1"));
const cancel = onExit(() => writeFileSync(${JSON.stringify(join(d, "cancelled"))}, "1"));
cancel();
process.exit(3);
`);
    const r = Bun.spawnSync([process.execPath, file]);
    expect(r.exitCode).toBe(3);
    expect(existsSync(join(dir, "ran"))).toBe(true);
    expect(existsSync(join(dir, "cancelled"))).toBe(false);
  });

  test.skipIf(process.platform === "win32")("Ctrl+C runs the hooks and exits with 130", async () => {
    const { file, dir } = script((d) => `
import { writeFileSync } from "node:fs";
import { onExit } from "${SRC}/cleanup";
onExit(() => writeFileSync(${JSON.stringify(join(d, "ran"))}, "1"));
console.log("ready");
setInterval(() => {}, 1000);
`);
    const proc = Bun.spawn([process.execPath, file], { stdout: "pipe" });
    await proc.stdout.getReader().read(); // "ready"
    proc.kill("SIGINT");
    expect(await proc.exited).toBe(130);
    expect(existsSync(join(dir, "ran"))).toBe(true);
  });
});

describe.skipIf(!findBrowser())("browsers don't outlive Motif (needs Chrome, Edge or Chromium)", () => {
  test("a browser that wasn't closed is stopped when Motif exits", async () => {
    const { file, dir } = script(() => `
import { launchBrowser } from "${SRC}/browser/cdp";
import { findBrowser } from "${SRC}/detect/browser";
const b = await launchBrowser(findBrowser()!.path);
console.log(JSON.stringify({ pid: b.pid }));
process.exit(0);
`);
    // The browser's temporary profile lands in this test's temp folder, which cleanupTempDirs removes.
    const r = Bun.spawnSync([process.execPath, file], { env: { ...process.env, TEMP: dir, TMP: dir, TMPDIR: dir } });
    const { pid } = JSON.parse(r.stdout.toString()) as { pid: number };
    expect(pid).toBeGreaterThan(0);
    const deadline = Date.now() + 5000;
    while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
    expect(alive(pid)).toBe(false);
  }, 30_000);
});
