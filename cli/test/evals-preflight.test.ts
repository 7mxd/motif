import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { paths, preflight, type PreflightDeps } from "../../tests/evals/preflight";
import type { RunResult } from "../../tests/evals/tools";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "", timedOut: false });
type Step = "version" | "auth" | "build" | "plugin" | "node" | "doctor" | "flutter";
// Flutter prints an "upgrade available" banner before the JSON at times.
const flutterVersion = (v: string) => ok(`A new version of Flutter is available!\n{\n  "frameworkVersion": "${v}",\n  "dartSdkVersion": "3.10.0"\n}\n`);

function setup(answers: Partial<Record<Step, RunResult>> = {}, which: Record<string, string | null> = {}) {
  const p = paths(tempDir("motif-pre-"));
  const seen: { authEnv?: Record<string, string | undefined>; flutter?: string[] } = {};
  const deps: PreflightDeps = {
    which: (c) => (c in which ? which[c]! : `/bin/${c}`),
    run: async (cmd, _cwd, _t, env) => {
      if (cmd[0] === "node") return answers.node ?? ok("v22.14.0\n");
      if (cmd[0] === "/bin/flutter") {
        seen.flutter = cmd;
        return answers.flutter ?? flutterVersion("3.44.8");
      }
      if (cmd[1] === "--version") return answers.version ?? ok("2.1.289 (Claude Code)\n");
      if (cmd[1] === "auth") {
        seen.authEnv = env;
        return answers.auth ?? ok(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" }));
      }
      if (cmd[2] === "build") {
        mkdirSync(dirname(p.motifBin), { recursive: true });
        writeFileSync(p.motifBin, "");
        return answers.build ?? ok();
      }
      if (cmd[2] === "plugin") {
        mkdirSync(join(p.pluginDir, "skills", "motif"), { recursive: true });
        writeFileSync(join(p.pluginDir, "skills", "motif", "SKILL.md"), "");
        return answers.plugin ?? ok();
      }
      if (cmd[1] === "doctor") return answers.doctor ?? ok(JSON.stringify({ items: [{ id: "browser", status: "ok" }] }));
      return { code: 1, stdout: "", stderr: `unexpected: ${cmd.join(" ")}`, timedOut: false };
    },
    env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x" },
    bun: "/bin/bun",
  };
  return { p, deps, seen };
}

describe("before a run", () => {
  test("ready: Claude Code signed in with a Claude account, this checkout built, Node.js, a browser", async () => {
    const { p, deps, seen } = setup();
    expect(await preflight(p, true, deps)).toEqual({ claude: "/bin/claude", claudeVersion: "2.1.289 (Claude Code)", browser: true });
    expect(seen.authEnv?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test("Claude Code not installed", async () => {
    const { p, deps } = setup({}, { claude: null });
    expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("isn't installed") });
  });

  test("never an API key, and never signed out", async () => {
    for (const auth of [{ loggedIn: true, authMethod: "api_key" }, { loggedIn: false }]) {
      const { p, deps } = setup({ auth: ok(JSON.stringify(auth)) });
      expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("never with an API key") });
    }
  });

  test("a failed build says which", async () => {
    const { p, deps } = setup({ build: { code: 1, stdout: "", stderr: "error: boom", timedOut: false } });
    expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("bun run build") });
  });

  test("Node.js older than 20.9", async () => {
    const { p, deps } = setup({ node: ok("v18.19.0") });
    expect(await preflight(p, false, deps)).toEqual({ error: expect.stringContaining("Node.js 20.9") });
  });

  test("a browser is needed only for tests C and D, and is never downloaded for you", async () => {
    const noBrowser = ok(JSON.stringify({ items: [{ id: "browser", status: "needed" }] }));
    const a = setup({ doctor: noBrowser });
    expect(await preflight(a.p, true, a.deps)).toEqual({ error: expect.stringContaining("motif browser install") });
    const b = setup({ doctor: noBrowser });
    expect(await preflight(b.p, false, b.deps)).toMatchObject({ browser: false });
  });

  test("a missing browser stops the React Native cases too, with doctor's own line and the cases that need none", async () => {
    const line = "No Chrome or Edge found. Previews and screenshots need one.";
    const noBrowser = ok(JSON.stringify({ items: [{ id: "browser", status: "needed", detail: line }] }));
    const { p, deps } = setup({ doctor: noBrowser });
    const r = await preflight(p, true, deps);
    expect(r).toEqual({ error: expect.stringContaining("React Native") });
    expect(r).toEqual({ error: expect.stringContaining(line) });
    expect(r).toEqual({ error: expect.stringContaining("--cases b-settings,b-search,b-profile,b-notifications,b-checkout,b-flutter-reserve,b-flutter-search,c-flutter,d-sahm") });
  });
});

describe("before a run with Flutter cases", () => {
  const otherCases = "b-settings,b-search,b-profile,b-notifications,b-checkout,b-plain,b-rn-orders,b-rn-favourites,c-review,c-plain,c-rn,d-stride,d-ledgerly,d-bloom,d-rihla";

  test("ready: Flutter 3.27 or later on the PATH", async () => {
    const { p, deps, seen } = setup();
    expect(await preflight(p, false, deps, true)).toMatchObject({ claude: "/bin/claude" });
    expect(seen.flutter).toEqual(["/bin/flutter", "--version", "--machine"]);
    const exact = setup({ flutter: flutterVersion("3.27.0") });
    expect(await preflight(exact.p, false, exact.deps, true)).toMatchObject({ claude: "/bin/claude" });
  });

  test("no Flutter: how to install it, and the cases to run instead", async () => {
    const { p, deps } = setup({}, { flutter: null });
    const r = await preflight(p, false, deps, true);
    expect(r).toEqual({ error: expect.stringContaining("https://docs.flutter.dev/get-started/install") });
    expect((r as { error: string }).error).toContain(`--cases ${otherCases}`);
  });

  test("a Flutter older than 3.27, or one that doesn't answer, is the same", async () => {
    for (const flutter of [flutterVersion("3.24.5"), { code: 1, stdout: "", stderr: "boom", timedOut: false }]) {
      const { p, deps } = setup({ flutter });
      const r = await preflight(p, false, deps, true);
      expect(r).toEqual({ error: expect.stringContaining("3.27") });
      expect((r as { error: string }).error).toContain(`--cases ${otherCases}`);
    }
    const old = setup({ flutter: flutterVersion("3.24.5") });
    expect(await preflight(old.p, false, old.deps, true)).toEqual({ error: expect.stringContaining("Flutter 3.24.5") });
  });

  test("not needed without a Flutter case", async () => {
    const { p, deps, seen } = setup({}, { flutter: null });
    expect(await preflight(p, false, deps)).toMatchObject({ claude: "/bin/claude" });
    expect(seen.flutter).toBeUndefined();
  });
});
