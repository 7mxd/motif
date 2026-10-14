import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { paths, preflight, type PreflightDeps } from "../../tests/evals/preflight";
import type { RunResult } from "../../tests/evals/tools";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "", timedOut: false });
type Step = "version" | "auth" | "build" | "plugin" | "node" | "doctor";

function setup(answers: Partial<Record<Step, RunResult>> = {}, which: Record<string, string | null> = {}) {
  const p = paths(tempDir("motif-pre-"));
  const seen: { authEnv?: Record<string, string | undefined> } = {};
  const deps: PreflightDeps = {
    which: (c) => (c in which ? which[c]! : `/bin/${c}`),
    run: async (cmd, _cwd, _t, env) => {
      if (cmd[0] === "node") return answers.node ?? ok("v22.14.0\n");
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
});
