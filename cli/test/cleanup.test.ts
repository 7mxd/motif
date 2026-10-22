import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Processes whose command line mentions the text (Chrome's helpers all name the profile folder). */
function processesMentioning(text: string): string[] {
  const out = process.platform === "win32"
    ? Bun.spawnSync(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }"]).stdout.toString()
    : Bun.spawnSync(["ps", "-A", "-o", "args="]).stdout.toString();
  return out.split(/\r?\n/).filter((line) => line.includes(text) && !line.includes("Get-CimInstance"));
}

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

  test("hooks added with last run after all the others, whatever the order they were added in (plan 2H's final review)", () => {
    const { file, dir } = script((d) => `
import { appendFileSync } from "node:fs";
import { onExit } from "${SRC}/cleanup";
const log = (s) => () => appendFileSync(${JSON.stringify(join(d, "order"))}, s + "\\n");
onExit(log("remove the folders"), { last: true });
onExit(log("stop xcodebuild"));
onExit(() => { throw new Error("a hook that fails"); });
onExit(log("delete the simulator"));
process.exit(0);
`);
    expect(Bun.spawnSync([process.execPath, file]).exitCode).toBe(0);
    expect(readFileSync(join(dir, "order"), "utf8").trim().split("\n")).toEqual(["stop xcodebuild", "delete the simulator", "remove the folders"]);
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

describe("waitForStop (backlog)", () => {
  test("Ctrl+C ends a command that runs until stopped (a live preview): exit 0, hooks run", () => {
    const { file, dir } = script((d) => `
import { writeFileSync } from "node:fs";
import { onExit, waitForStop } from "${SRC}/cleanup";
onExit(() => writeFileSync(${JSON.stringify(join(d, "ran"))}, "1"));
const keepAlive = setInterval(() => {}, 1000);
waitForStop().then(() => {
  writeFileSync(${JSON.stringify(join(d, "stopped"))}, "1");
  clearInterval(keepAlive);
});
setTimeout(() => process.emit("SIGINT"), 50);
`);
    const r = Bun.spawnSync([process.execPath, file]);
    expect(r.exitCode).toBe(0);
    expect([existsSync(join(dir, "stopped")), existsSync(join(dir, "ran"))]).toEqual([true, true]);
  });
});

describe("waitForStop and other signals (review of batch A)", () => {
  test("a termination signal ends the process at once (143), hooks run, even while a command waits for Ctrl+C", () => {
    const { file, dir } = script((d) => `
import { writeFileSync } from "node:fs";
import { onExit, waitForStop } from "${SRC}/cleanup";
onExit(() => writeFileSync(${JSON.stringify(join(d, "ran"))}, "1"));
setInterval(() => {}, 1000);
waitForStop().then(() => writeFileSync(${JSON.stringify(join(d, "stopped"))}, "1"));
setTimeout(() => process.emit("SIGTERM"), 50);
`);
    const r = Bun.spawnSync([process.execPath, file]);
    expect(r.exitCode).toBe(143);
    expect([existsSync(join(dir, "ran")), existsSync(join(dir, "stopped"))]).toEqual([true, false]);
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
    // Its helpers go with it, not just the main process (they can write into the profile again: macOS CI).
    expect(processesMentioning(join(dir, "motif-browser-"))).toEqual([]);
    // Its temporary profile goes too (backlog).
    expect(readdirSync(dir).filter((n) => n.startsWith("motif-browser-"))).toEqual([]);
  }, 30_000);
});
