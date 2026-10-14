import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandLine, motifRunner, packageManager, runCmd } from "../../tests/evals/tools";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FAKE_MOTIF = [process.execPath, join(import.meta.dir, "fixtures", "evals", "fake-motif.ts")];

describe("running programs", () => {
  test("npm and other .cmd programs go through cmd.exe on Windows; others start directly", () => {
    const r = commandLine(["npm", "ci"], () => "C:\\nodejs\\npm.cmd", "win32");
    expect(r.cmd.slice(0, 4)).toEqual(["cmd.exe", "/d", "/s", "/c"]);
    expect(r.verbatim).toBe(true);
    expect(commandLine(["git", "status"], () => "/usr/bin/git", "linux")).toEqual({ cmd: ["/usr/bin/git", "status"], verbatim: false });
  });

  test("collects the output and the exit code", async () => {
    const r = await runCmd([process.execPath, "-e", "console.log('out'); console.error('err'); process.exit(3)"], tempDir("motif-run-"), 30_000);
    expect(r).toMatchObject({ code: 3, timedOut: false });
    expect(r.stdout.trim()).toBe("out");
    expect(r.stderr.trim()).toBe("err");
  });

  test("stops a program at its time limit", async () => {
    const started = Date.now();
    const r = await runCmd([process.execPath, "-e", "await Bun.sleep(60000)"], tempDir("motif-run-"), 1000);
    expect(r.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("a missing program is an exit code, not a crash", async () => {
    expect((await runCmd(["motif-no-such-program-xyz"], tempDir("motif-run-"), 10_000)).code).not.toBe(0);
  });

  test.skipIf(process.platform !== "win32")("runs a .cmd program through cmd.exe with its arguments intact", async () => {
    const dir = tempDir("motif-run-");
    const script = join(dir, "hello.cmd");
    writeFileSync(script, "@echo off\r\necho hi %~1\r\n");
    const r = await runCmd([script, "a b"], dir, 30_000);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("hi a b");
  });
});

describe("the motif tool", () => {
  test("runs with --json and its output is read", async () => {
    const env = { ...process.env, FAKE_MOTIF_OUTPUT: JSON.stringify({ check: { command: "check", ok: true, exitCode: 0, summary: { files: 9, violations: 0, exceptions: 0, warnings: 0 } } }) };
    const r = await motifRunner(FAKE_MOTIF, runCmd, env)(["check"], tempDir("motif-run-"));
    expect(r.code).toBe(0);
    expect(r.json.summary.files).toBe(9);
  });

  test("output that isn't JSON leaves json empty and keeps the text", async () => {
    const r = await motifRunner(FAKE_MOTIF, runCmd, { ...process.env, FAKE_MOTIF_RAW: "Something broke" })(["validate"], tempDir("motif-run-"));
    expect(r.json).toBeNull();
    expect(r.output).toContain("Something broke");
  });
});

describe("the app's package manager", () => {
  test("comes from its lockfile, npm by default", () => {
    const dir = tempDir("motif-pm-");
    expect(packageManager(dir)).toBe("npm");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(packageManager(dir)).toBe("pnpm");
  });
});
