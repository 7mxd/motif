import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRtlFlag } from "../src/main";
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
    const r = run("preview", "--png-only", "--compare", "--gallery", "--no-open", "--preset", "minimal", "--out", "x", "--cwd", missing);
    expect(r.stderr.toString()).not.toContain("Unknown option");
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toContain("This folder doesn't exist");
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
  test("--rtl takes an optional language: not an option or a path that follows it", () => {
    expect(readRtlFlag(["shot", "--rtl"])).toEqual({ args: ["shot"], rtl: true });
    expect(readRtlFlag(["shot", "--rtl", "he", "--audit"])).toEqual({ args: ["shot", "--audit"], rtl: "he" });
    expect(readRtlFlag(["shot", "--rtl=fa"])).toEqual({ args: ["shot"], rtl: "fa" });
    expect(readRtlFlag(["shot", "--rtl", "--audit"])).toEqual({ args: ["shot", "--audit"], rtl: true });
    expect(readRtlFlag(["shot", "--rtl", "./app"])).toEqual({ args: ["shot", "./app"], rtl: true });
    expect(readRtlFlag(["shot", "--rtl", "C:\\app"])).toEqual({ args: ["shot", "C:\\app"], rtl: true });
    expect(readRtlFlag(["shot", "--rtl", "index.html"])).toEqual({ args: ["shot", "index.html"], rtl: true });
    expect(readRtlFlag(["--rtl", "shot"])).toEqual({ args: ["shot"], rtl: true });
    // What isn't a language is still its value, so shot can say what to give.
    expect(readRtlFlag(["shot", "--rtl", "12"])).toEqual({ args: ["shot"], rtl: "12" });
    expect(readRtlFlag(["shot", "--audit"])).toEqual({ args: ["shot", "--audit"] });
  });
  test("--sizes lists a macOS app's windows in help", () => {
    expect(run("help").stdout.toString()).toContain(
      "--sizes <list>    Only some sizes, for a quick run: widths (360, 390, 430, 768, 1440) or phones, tablet, desktop; a macOS app's windows: 1440, 900\n",
    );
  });
  test("--rtl is listed in help, and a value that isn't a language is a usage error", () => {
    expect(run("help").stdout.toString()).toContain("--rtl [<lang>]");
    const r = run("shot", "--rtl", "12", "--url", "http://localhost:1", "--cwd", tempDir("motif-empty-"));
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toContain("--rtl takes a language code");
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

describe("main: an option the command doesn't use", () => {
  // A review agent ran `motif tokens --out /tmp/x` to write theme files somewhere safe; tokens ignored --out and
  // rewrote the app's own motif.css. An option a command doesn't read must stop it before it does anything.
  const app = () => {
    const dir = tempDir("motif-strict-");
    const src = join(import.meta.dir, "../../tests/fixtures/react-contract-app");
    for (const part of ["DESIGN.md", "design", "package.json", "src/styles"]) cpSync(join(src, part), join(dir, part), { recursive: true });
    const css = join(dir, "src/styles/motif.css");
    writeFileSync(css, readFileSync(css, "utf8") + "/* edited by hand */\n");
    return { dir, css, before: readFileSync(css, "utf8") };
  };
  test("tokens --out is refused, names the option and the command, and writes nothing", () => {
    const { dir, css, before } = app();
    const r = run("tokens", "--out", join(dir, "elsewhere"), "--cwd", dir);
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("--out");
    expect(r.stderr.toString()).toContain("motif tokens");
    expect(readFileSync(css, "utf8")).toBe(before);
    expect(existsSync(join(dir, "elsewhere"))).toBe(false);
  });
  test("under --json the refusal is JSON", () => {
    const { dir, css, before } = app();
    const r = run("tokens", "--routes", "/", "--json", "--cwd", dir);
    expect(r.exitCode).toBe(2);
    const out = JSON.parse(r.stdout.toString());
    expect(out).toMatchObject({ command: "tokens", ok: false, error: "unused-option", options: ["--routes"] });
    expect(readFileSync(css, "utf8")).toBe(before);
  });
  test("every command still takes its own options and the shared ones", () => {
    const missing = join(tmpdir(), "motif-no-such-folder-" + Date.now());
    const cases: string[][] = [
      ["preview", "--png-only", "--compare", "--gallery", "--no-open", "--preset", "minimal", "--variant", "all", "--out", "x"],
      ["shot", "--url", "u", "--routes", "/", "--audit", "--save", "s", "--against", "a", "--state", "s.js", "--states-only", "--screen", "W", "--sizes", "390", "--variant", "all", "--out", "x", "--rtl"],
      ["tokens", "--stack", "preview"],
      ["validate", "--tokens", "t.json"],
      ["connect", "--agent", "codex"],
      ["doctor"], ["check"], ["extract"], ["browser"],
    ];
    for (const args of cases) {
      const r = run(...args, "--app", "web", "--json", "--cwd", missing);
      expect(JSON.parse(r.stdout.toString())).toMatchObject({ command: args[0], error: "no-folder" });
    }
  });
  test("shot --rtl is its own; other commands refuse it", () => {
    const r = run("check", "--rtl", "--cwd", tempDir("motif-empty-"));
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("--rtl");
  });
});

describe("main: validate --tokens", () => {
  test("is a known option, listed in help", () => {
    expect(run("help").stdout.toString()).toContain("--tokens");
    expect(run("validate", "--tokens", "missing.json").exitCode).toBe(2);
  });
});
