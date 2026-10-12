import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAIN = join(import.meta.dir, "../src/main.ts");
const run = (...args: string[]) => Bun.spawnSync([process.execPath, MAIN, ...args]);
const version = readFileSync(join(import.meta.dir, "../../skill/VERSION"), "utf8").trim();

describe("main", () => {
  test("--version prints skill/VERSION", () => {
    const r = run("--version");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString().trim()).toBe(version);
  });
  test("help exits 0 and lists commands", () => {
    const r = run("help");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toContain("Usage: motif <command>");
  });
  test("no command prints help and exits 2", () => {
    expect(run().exitCode).toBe(2);
  });
  test("unknown command exits 2", () => {
    const r = run("fly");
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain('Unknown command "fly"');
  });
});
