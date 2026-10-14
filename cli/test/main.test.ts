import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

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

describe("main: never crashes into a stack trace", () => {
  test("built-in object names are unknown commands", () => {
    const r = run("constructor");
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain('Unknown command "constructor"');
  });

  test("a folder that doesn't exist is a usage error", () => {
    const missing = join(tmpdir(), "motif-no-such-folder-" + Date.now());
    const r = run("doctor", "--cwd", missing);
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toContain("This folder doesn't exist");
    const j = run("doctor", "--json", "--cwd", missing);
    expect(JSON.parse(j.stdout.toString())).toMatchObject({ command: "doctor", ok: false, exitCode: 2, error: "no-folder" });
  });

  test("an unexpected error exits 2 with a plain message, and JSON under --json", () => {
    const dir = tempDir("motif-odd-");
    mkdirSync(join(dir, "DESIGN.md"));
    mkdirSync(join(dir, "design", "tokens.json"), { recursive: true });
    const r = run("validate", "--cwd", dir);
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toContain("Motif hit an unexpected problem");
    const j = run("validate", "--json", "--cwd", dir);
    expect(JSON.parse(j.stdout.toString())).toMatchObject({ command: "validate", ok: false, exitCode: 2, error: "unexpected" });
  });
});

describe("main: --app", () => {
  test("is accepted by every command and listed in help", () => {
    expect(run("help").stdout.toString()).toContain("--app");
    const missing = join(tmpdir(), "motif-no-such-folder-" + Date.now());
    const r = run("doctor", "--app", "web", "--cwd", missing);
    expect(r.stderr.toString()).not.toContain("Unknown option");
    expect(r.stdout.toString()).toContain("This folder doesn't exist");
  });
});

describe("main: preview options", () => {
  test("are accepted by the parser", () => {
    const missing = join(tmpdir(), "motif-no-such-folder-" + Date.now());
    const r = run("doctor", "--png-only", "--compare", "--gallery", "--no-open", "--preset", "minimal", "--out", "x", "--stack", "preview", "--cwd", missing);
    expect(r.stderr.toString()).not.toContain("Unknown option");
    expect(r.exitCode).toBe(2);
  });
});

describe("main: preview and browser", () => {
  test("are listed in help with their options", () => {
    const help = run("help").stdout.toString();
    for (const word of ["preview", "browser", "--png-only", "--gallery", "--compare", "--preset", "--no-open", "--out", "--stack preview"]) {
      expect(help).toContain(word);
    }
  });
  test("preview without mockup names is a usage error", () => {
    const r = run("preview", "--cwd", tempDir("motif-empty-"));
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toContain("motif preview --gallery");
  });
});

describe("main: shot", () => {
  test("is listed in help with its options", () => {
    const help = run("help").stdout.toString();
    for (const word of ["shot", "--url", "--routes", "--audit"]) expect(help).toContain(word);
  });
  test("with no app and no --url it says what to do", () => {
    const r = run("shot", "--cwd", tempDir("motif-empty-"));
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toMatch(/--url|motif browser install/);
  });
});

describe("main: connect", () => {
  test("is listed in help", () => {
    expect(run("help").stdout.toString()).toContain("connect");
  });
});

describe("main: validate --tokens", () => {
  test("is a known option, listed in help", () => {
    expect(run("help").stdout.toString()).toContain("--tokens");
    expect(run("validate", "--tokens", "missing.json").exitCode).toBe(2);
  });
});
