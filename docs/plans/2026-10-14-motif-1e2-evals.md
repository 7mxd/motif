# Motif 1E-2 — The Eval Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command, `bun tests/evals/run.ts`, that runs Motif's agent evals (tests B, C and D) through the developer's own signed-in Claude Code, never an API key, one isolated case at a time; grades each case against the spec's thresholds; writes a report; and picks up where it stopped after a usage limit.

**Architecture:** `tests/evals/` holds small modules with one job each: starting Claude Code headless and reading its event stream (`claude.ts`, `session.ts`), the nine cases (`cases.ts`), each case's folder and what changed in it (`workspace.ts`), running the app's commands and the motif tool (`tools.ts`), grading (`match.ts` and `judge.ts` for test C, `grade.ts` for the pass/fail rules, `collect.ts` to measure a finished case), the run's record and report (`state.ts`, `report.ts`), and the command itself (`preflight.ts`, `run.ts`). Every session runs `claude -p` in a fresh copy in the temp folder with the developer's settings, plugins and MCP servers left out, only Motif's plugin loaded, and auto mode with nobody to answer prompts; its first event is checked, and a session that isn't isolated stops the run. Grading uses the compiled motif tool, the app's own build and type check, git (kept outside the app) for what changed, and, for test C's judgement problems, one read-only Claude Code session with a JSON schema and a written rubric. CI runs only the runner's own tests, with a stand-in for Claude Code.

**Tech Stack:** Bun 1.4 + TypeScript (no new dependencies), Claude Code 2.1 headless mode (`claude -p`), git, npm, the motif tool from this checkout.

**Spec:** `docs/specs/2026-10-12-motif-core-design.md` — §3 (tests B, C, D), §13.2 (agent evals: fixtures, pass thresholds, "Run through Claude Code's headless mode with the Part 1 plugin loaded and gates switched off by instruction"), §14 (security and privacy). The developer's decision of 2026-10-14 replaces §13.2's last line ("Eval runs need an API key stored as a CI secret"): **no API key**; evals run on demand through the signed-in Claude Code. Task 11 records this as decision 0003 and updates the spec.

**Builds on:** Plans 1A–1E-1 (current `main`). Read `tests/README.md`, `tests/fixtures/react-seeded-app/README.md` (the grading rules for test C) and `seeded-issues.json`, `tests/fixtures/assemble.ts`, `skill/modes/{feature,review,init}.md`, `cli/src/commands/{check,validate,shot,connect}.ts`, `cli/src/shot/devserver.ts` (`killTree`), `cli/src/cleanup.ts` (`onExit`) and `cli/test/tmp.ts` before starting.

**Verified while planning (2026-10-14, Claude Code 2.1.289, signed in with a Claude account):**
- `claude -p --output-format stream-json --verbose` prints one JSON event per line. The first is `{"type":"system","subtype":"init",…}` with `model`, `permissionMode`, `apiKeySource` (`"none"` when signed in with a Claude account), `mcp_servers` (empty with `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`), `plugins` (`{"name":"motif","path":"<the --plugin-dir>"}` plus Claude Code's built-ins, which have `"path":"builtin"`), `claude_code_version` and `memory_paths`. The last is `{"type":"result",…}` with `subtype` (`success`, `error_max_turns`, …), `is_error`, `num_turns`, `total_cost_usd`, `duration_ms`, `permission_denials` (`[{tool_name, tool_input}]`), `result` and `api_error_status`; with `--json-schema '<schema>'` it also has `structured_output`. `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed",…,"resetsAt":<unix seconds>}}` events report the plan's limits.
- `--setting-sources project,local --strict-mcp-config --mcp-config '{"mcpServers":{}}' --plugin-dir dist/claude-code` loads `motif:motif`, `motif:feature`, `motif:review`, `motif:init` and none of the developer's own plugins or MCP servers.
- `--permission-mode auto --permission-prompts none` ran a shell command and wrote a file with no refusals on a mid-size model. On the smallest model, the session started in `"permissionMode":"default"` instead and refused every action, so the runner must check the mode in the first event.
- A slash command sent on standard input (`/motif:review …`) starts the plugin's skill. The skill then reads its own files in the plugin folder, outside the working folder, which needs `--add-dir <plugin folder>`.
- Each session leaves a folder under `~/.claude/projects/` even with `--no-session-persistence`; `claude purge -y <folder>` removes Claude Code's state for that folder (transcripts, memory, its config entry).
- `claude auth status` prints JSON: `{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max",…}`.
- npm installs Claude Code on Windows as `claude.cmd`, a shim whose last line runs `"%dp0%\node_modules\@anthropic-ai\claude-code\bin\claude.exe" %*`; cmd.exe would garble a JSON argument, so the runner starts `claude.exe` itself.
- Claude Code 2.1.289 has a built-in skill named `design` (with `design-sync`, `design-consent`, `design-revoke`), so plain `/design` may not reach Motif: the plugin's docs must say `/motif:design` (Task 11).
- `motif check --json` → `{summary:{files,violations,exceptions,warnings},violations,exceptions,warnings}`; `motif validate --json` → `{summary:{errors,warnings,…},findings:[{code,…}]}` (a missing DESIGN.md section is `code: "missing-section"`); `motif shot --json` → `{routes:[{route,status,pageErrors?,shots}],shots,findings?}`; exit code 2 means it couldn't run (`{error}`).

## Global Constraints

- **Never an API key.** Sessions run on the developer's Claude account (`claude auth status` → `"authMethod": "claude.ai"`). `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and the other-provider switches are removed from every session's environment, and a session whose first event reports any `apiKeySource` other than `"none"` stops the run.
- **Only when the developer starts it**, one case at a time; resumable after a usage limit or Ctrl+C. CI runs only `cli/test/evals-*.test.ts`, which never start Claude Code, install packages or use the network.
- **Isolated sessions:** `--setting-sources project,local`, `--strict-mcp-config` with an empty server list, only Motif's plugin (built from this checkout at the start of the run), `--no-session-persistence`, and `claude purge -y <folder>` after each session. Checked from the first event; a session that isn't isolated stops the whole run.
- **Unattended, never bypassed:** `--permission-mode auto --permission-prompts none`. Never `bypassPermissions` or `--dangerously-skip-permissions`. Tools that reach outside the session (`RemoteTrigger`, `PushNotification`, `ScheduleWakeup`, `CronCreate`, `CronDelete`, `Workflow`, `DesignSync`, `EnterWorktree`, `ExitWorktree`) are switched off.
- **Nothing uploaded, nothing committed:** results go to `tests/evals/results/<run>/` (already git-ignored); case folders go to the temp folder and are deleted after grading unless `--keep`.
- **Spec thresholds, exactly:** B — `motif check` zero violations (justified `motif-ok` exceptions allowed, at most 2), builds and type-checks, at most one new component unless recorded as a contract change. C — recall ≥ 90% for exact issues, ≥ 70% for judgement issues, ≤ 10% of critical/major findings false. D — `validate` and `check` clean, builds, all starter screens exist and render in `shot`, `DESIGN.md` has all sections; plus B and C with no MCP servers.
- Gates are switched off by instruction in each prompt (spec §13.2), using the skill's own words: "don't stop for approval".
- No model names in code, docs or commits: a model is chosen only by the developer, with `--model`.
- Plain words in everything the runner prints, in Motif's voice.
- Windows, macOS and Linux: paths with `join`, `.cmd` programs through cmd.exe (`spawnArgs`), process trees stopped with `killTree`, line endings normalised when reading.
- Commits use the repository's configured no-reply address and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Claude Code's real event stream differs from the stand-in** (a renamed field, a usage-limit message worded another way) → the isolation check fails closed (no first event, or a missing field, is a problem, never a pass), and Task 11's real smoke run checks the runner against a real session. Pinned: Tasks 1–2 (tests), Task 11 (smoke run).
2. **Windows: Claude Code started through `claude.cmd` garbles the JSON arguments** (the grader's schema) → `resolveClaude` starts `claude.exe` behind the shim. Pinned: Task 1.
3. **A session or a build leaves processes running** (Claude Code's children, a dev server) after a time limit or Ctrl+C → whole process trees are stopped (`killTree`, `onExit`). Pinned: Tasks 2 and 3 (time-limit tests).
4. **A review finding points at the right problem in a shape the grader didn't expect** (an absolute path, `file:line`, a full URL, a dynamic route, several places in one finding) → normalised before matching. Pinned: Task 5.
5. **The usage limit is reached while test C is being graded**, after an hour-long review session → grading pauses, the case folder is kept, and `--resume` grades it again without a new session. Pinned: Tasks 8 and 10.

---

## File Structure

```
tests/evals/
├── README.md        how to run the evals, what each session gets, resuming, results, how cases are graded
├── rubric.md        the written rubric test C's model grader follows
├── claude.ts        finding Claude Code; each session's arguments and environment; reading its events
├── session.ts       one headless session: prompt on stdin, events saved, isolation checked, time limit, usage limit
├── tools.ts         running programs with a time limit (npm, npx, git, the motif tool); the app's package manager
├── cases.ts         the nine cases (B ×5, C, D ×3) with their prompts and caps
├── workspace.ts     a case's folder; git's record of how it started (kept outside the app); what changed
├── match.ts         test C: reading a review report; matching findings to the seeded list (README rules)
├── judge.ts         test C: the model grader's prompt, schema and answer
├── grade.ts         pass/fail rules for B, C and D, criterion by criterion
├── collect.ts       measuring a finished case (checks, build, type check, changes, review) and grading it
├── state.ts         the run's record (run.json), run ids, what's left, the checkout's commit
├── report.ts        test verdicts and report.md
├── preflight.ts     checks before a run: Claude Code signed in, builds, Node.js, a browser
└── run.ts           the command
cli/test/
├── evals-claude.test.ts · evals-session.test.ts · evals-tools.test.ts · evals-cases.test.ts
├── evals-workspace.test.ts · evals-match.test.ts · evals-judge.test.ts · evals-grade.test.ts
├── evals-collect.test.ts · evals-state.test.ts · evals-preflight.test.ts · evals-run.test.ts · evals-docs.test.ts
└── fixtures/evals/ fake-claude.ts (a stand-in for Claude Code) · fake-motif.ts (a stand-in for the motif tool)
tests/fixtures/react-seeded-app/seeded-issues.json · README.md      MODIFY: S-16, S-17, S-22 can be reported by screen
tests/README.md                                                     MODIFY: Evals section
docs/decisions/0003-evals-on-your-plan.md                           CREATE
docs/specs/2026-10-12-motif-core-design.md                          MODIFY: §3 table, §5.1 comment, §13.2
plugin/claude-code/README.md · plugin/claude-code/skills/design/SKILL.md · cli/test/plugin.test.ts   MODIFY: /motif:design
```

The runner's modules live in `tests/evals/` (spec §5.1: `tests/` holds the evals) and import a few helpers from `cli/src/` (`spawnArgs`, `killTree`, `onExit`, `discoverRoutes`, `REQUIRED_SECTIONS`) and `tests/fixtures/assemble.ts`. Their tests live in `cli/test/`, so CI's existing `bun test` and `tsc` (which follows the imports) cover them.

---

### Task 1: Starting Claude Code — program, arguments, environment, events

**Files:**
- Create: `tests/evals/claude.ts`
- Test: `cli/test/evals-claude.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `resolveClaude(found: string | null, read?: (path: string) => string, exists?: (path: string) => boolean): { exe: string } | { error: string }`
  - `DROPPED_ENV: string[]`; `sessionEnv(base: Record<string, string | undefined>, motifBin: string): { env: Record<string, string>; dropped: string[] }`
  - `DISALLOWED_TOOLS: string[]`; `agentArgs(o: { pluginDir: string; mcpConfigFile: string; maxTurns: number; maxBudgetUsd: number; model?: string }): string[]`; `judgeArgs(o: { mcpConfigFile: string; schema: object; maxTurns: number; model?: string }): string[]`
  - `interface InitInfo { model: string; permissionMode: string; apiKeySource: string; mcpServers: string[]; plugins: { name: string; path: string }[]; version: string }`; `initInfo(e: unknown): InitInfo | null`
  - `isolationProblems(init: InitInfo, expect: { pluginDir?: string; auto: boolean }): string[]`
  - `interface ResultInfo { subtype: string; isError: boolean; turns: number; costUsd: number; durationMs: number; denials: string[]; text: string; structured?: unknown; apiErrorStatus: number | null }`; `resultInfo(e: unknown): ResultInfo | null`
  - `usageLimit(e: unknown): { resetsAt?: number } | null`

- [ ] **Step 1: Write the failing test**

`cli/test/evals-claude.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { agentArgs, DISALLOWED_TOOLS, initInfo, isolationProblems, judgeArgs, resolveClaude, resultInfo, sessionEnv, usageLimit } from "../../tests/evals/claude";

const SHIM = '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n';
const NPM = join(import.meta.dir, "npm-global");
const PLUGIN = join(import.meta.dir, "plugin-dir-for-tests");
const pair = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

const init = (over: Record<string, unknown> = {}) => ({
  type: "system", subtype: "init", model: "some-model", permissionMode: "auto", apiKeySource: "none", mcp_servers: [],
  plugins: [{ name: "motif", path: PLUGIN, source: "motif@inline" }, { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" }],
  claude_code_version: "2.1.289",
  ...over,
});

describe("finding Claude Code", () => {
  test("says plainly when it isn't installed", () => {
    expect(resolveClaude(null)).toEqual({ error: expect.stringContaining("isn't installed") });
  });

  test("uses a program it finds directly", () => {
    expect(resolveClaude("/usr/local/bin/claude")).toEqual({ exe: "/usr/local/bin/claude" });
  });

  test("starts the program behind npm's Windows shim, not the shim (cmd.exe would garble JSON arguments)", () => {
    const r = resolveClaude(join(NPM, "claude.cmd"), () => SHIM, () => true);
    expect(r).toEqual({ exe: join(NPM, "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe") });
  });

  test("refuses a shim whose program is missing or unknown, and says how to point at Claude Code", () => {
    expect(resolveClaude(join(NPM, "claude.cmd"), () => SHIM, () => false)).toEqual({ error: expect.stringContaining("--claude") });
    expect(resolveClaude(join(NPM, "claude.cmd"), () => "@echo off", () => true)).toEqual({ error: expect.stringContaining("--claude") });
  });
});

describe("each session's environment", () => {
  test("leaves out API keys, other providers and the parent session's markers, keeps the rest, and points the skill at this checkout's motif", () => {
    const { env, dropped } = sessionEnv(
      { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x", anthropic_auth_token: "t", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDECODE: "1", ANTHROPIC_BASE_URL: "", HOME: "/home/me", UNSET: undefined },
      "/repo/dist/motif",
    );
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/me", MOTIF_BIN: "/repo/dist/motif" });
    expect(dropped.sort()).toEqual(["ANTHROPIC_API_KEY", "CLAUDECODE", "CLAUDE_CODE_USE_BEDROCK", "anthropic_auth_token"]);
  });
});

describe("an eval session's arguments", () => {
  const a = agentArgs({ pluginDir: "/p", mcpConfigFile: "/r/no-mcp.json", maxTurns: 200, maxBudgetUsd: 40 });

  test("headless, every event streamed, nothing saved", () => {
    expect(a[0]).toBe("-p");
    expect(pair(a, "--output-format")).toBe("stream-json");
    expect(a).toContain("--verbose");
    expect(a).toContain("--no-session-persistence");
  });

  test("isolated: no user settings, an empty MCP list, only the Motif plugin (which the session may read)", () => {
    expect(pair(a, "--setting-sources")).toBe("project,local");
    expect(a).toContain("--strict-mcp-config");
    expect(pair(a, "--mcp-config")).toBe("/r/no-mcp.json");
    expect(pair(a, "--plugin-dir")).toBe("/p");
    expect(pair(a, "--add-dir")).toBe("/p");
  });

  test("unattended in auto mode, never with permissions bypassed", () => {
    expect(pair(a, "--permission-mode")).toBe("auto");
    expect(pair(a, "--permission-prompts")).toBe("none");
    expect(a.join(" ")).not.toMatch(/bypass|dangerously/i);
  });

  test("capped, and given a model only when the developer chose one", () => {
    expect(pair(a, "--max-turns")).toBe("200");
    expect(pair(a, "--max-budget-usd")).toBe("40");
    expect(a).not.toContain("--model");
    expect(pair(agentArgs({ pluginDir: "/p", mcpConfigFile: "/m", maxTurns: 1, maxBudgetUsd: 1, model: "chosen" }), "--model")).toBe("chosen");
  });

  test("tools that reach outside the session are switched off", () => {
    expect(pair(a, "--disallowedTools")).toBe(DISALLOWED_TOOLS.join(","));
    for (const t of ["RemoteTrigger", "PushNotification", "ScheduleWakeup", "Workflow", "DesignSync", "EnterWorktree"]) expect(DISALLOWED_TOOLS).toContain(t);
  });

  test("the grader's session reads only, loads no plugin and answers in a schema", () => {
    const j = judgeArgs({ mcpConfigFile: "/m", schema: { type: "object" }, maxTurns: 40 });
    expect(pair(j, "--tools")).toBe("Read,Grep,Glob");
    expect(pair(j, "--json-schema")).toBe('{"type":"object"}');
    expect(pair(j, "--permission-mode")).toBe("default");
    expect(pair(j, "--permission-prompts")).toBe("none");
    expect(pair(j, "--setting-sources")).toBe("project,local");
    expect(j).toContain("--strict-mcp-config");
    expect(j).not.toContain("--plugin-dir");
  });
});

describe("a session's first event", () => {
  test("an isolated session has no problems", () => {
    expect(isolationProblems(initInfo(init())!, { pluginDir: PLUGIN, auto: true })).toEqual([]);
  });

  test("an API key, MCP servers, another plugin, or no Motif plugin are each a problem", () => {
    const p = isolationProblems(
      initInfo(init({ apiKeySource: "ANTHROPIC_API_KEY", mcp_servers: [{ name: "refero", status: "connected" }], plugins: [{ name: "superpowers", path: "/home/me/.claude/plugins/superpowers" }] }))!,
      { pluginDir: PLUGIN, auto: true },
    ).join("\n");
    expect(p).toContain("API key");
    expect(p).toContain("refero");
    expect(p).toContain("superpowers");
    expect(p).toContain("Motif plugin wasn't loaded");
  });

  test("missing fields count as problems, never as a pass", () => {
    const p = isolationProblems(initInfo({ type: "system", subtype: "init" })!, { pluginDir: PLUGIN, auto: true });
    expect(p.length).toBeGreaterThanOrEqual(3); // no apiKeySource "none", no Motif plugin, not auto mode
  });

  test("a session that didn't start in auto mode can't work unattended", () => {
    expect(isolationProblems(initInfo(init({ permissionMode: "default" }))!, { pluginDir: PLUGIN, auto: true })).toEqual([expect.stringContaining("--model")]);
  });

  test("the grader's session expects no plugin and no auto mode", () => {
    expect(isolationProblems(initInfo(init({ permissionMode: "default", plugins: [{ name: "cc-plugin-telemetry", path: "builtin" }] }))!, { auto: false })).toEqual([]);
  });

  test("other events aren't the first event", () => {
    expect(initInfo({ type: "assistant" })).toBeNull();
    expect(initInfo(null)).toBeNull();
  });
});

describe("a session's end", () => {
  test("reads the result, its refusals and its structured answer", () => {
    const r = resultInfo({
      type: "result", subtype: "success", is_error: false, num_turns: 12, total_cost_usd: 1.5, duration_ms: 60000,
      permission_denials: [{ tool_name: "Bash", tool_use_id: "t", tool_input: { command: "rm -rf /" } }], result: "Done", api_error_status: null, structured_output: { a: 1 },
    })!;
    expect(r).toMatchObject({ subtype: "success", isError: false, turns: 12, costUsd: 1.5, durationMs: 60000, text: "Done", structured: { a: 1 }, apiErrorStatus: null });
    expect(r.denials).toEqual([expect.stringContaining("Bash")]);
    expect(resultInfo({ type: "system" })).toBeNull();
  });

  test("notices the developer's usage limit, from a refused request or from the final message", () => {
    expect(usageLimit({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1792000800 } })).toEqual({ resetsAt: 1792000800 });
    expect(usageLimit({ type: "rate_limit_event", rate_limit_info: { status: "allowed", resetsAt: 1792000800 } })).toBeNull();
    expect(usageLimit({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached|1792000800" })).toEqual({});
    expect(usageLimit({ type: "result", subtype: "success", is_error: true, result: "You've hit your limit · resets 5pm" })).toEqual({});
    expect(usageLimit({ type: "result", subtype: "success", is_error: true, api_error_status: 429, result: "" })).toEqual({});
    expect(usageLimit({ type: "result", subtype: "success", is_error: false, result: "I added a rate limit notice." })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-claude.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/claude'`.

- [ ] **Step 3: Write `tests/evals/claude.ts`**

```ts
// How the evals start Claude Code: which program, which arguments, which environment, and what its event stream says.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * npm installs Claude Code on Windows as claude.cmd, a shim that starts claude.exe. The evals start claude.exe itself:
 * through cmd.exe, an argument holding JSON (the grader's schema) would be garbled.
 */
export function resolveClaude(
  found: string | null,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
  exists: (path: string) => boolean = existsSync,
): { exe: string } | { error: string } {
  if (!found) {
    return { error: "Claude Code isn't installed here (no claude command found). Install it, sign in with your Claude account, and run this again." };
  }
  if (!/\.(cmd|bat)$/i.test(found)) return { exe: found };
  let target: string | undefined;
  try {
    target = read(found).match(/"%dp0%\\?([^"]+?\.exe)"/i)?.[1];
  } catch {
    target = undefined;
  }
  const exe = target ? join(dirname(found), target) : null;
  if (exe && exists(exe)) return { exe };
  return { error: `Found ${found}, but not the Claude Code program it starts. Reinstall Claude Code, or pass --claude <path to claude.exe>.` };
}

/** Variables that would make Claude Code use an API key or another provider instead of the developer's Claude account, or mark it as running inside another session. */
export const DROPPED_ENV = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT",
];

export function sessionEnv(base: Record<string, string | undefined>, motifBin: string): { env: Record<string, string>; dropped: string[] } {
  const env: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (DROPPED_ENV.includes(key.toUpperCase())) {
      if (value !== "") dropped.push(key);
      continue;
    }
    env[key] = value;
  }
  env.MOTIF_BIN = motifBin;
  return { env, dropped };
}

/** Tools an unattended eval never needs: they reach outside the session (triggers, phone notifications, schedules, design sync) or move work out of the folder being graded. */
export const DISALLOWED_TOOLS = ["RemoteTrigger", "PushNotification", "ScheduleWakeup", "CronCreate", "CronDelete", "Workflow", "DesignSync", "EnterWorktree", "ExitWorktree"];

/** Every session: headless, every event streamed, nothing saved, none of the developer's settings, no MCP servers. */
const isolation = (mcpConfigFile: string) => [
  "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
  "--setting-sources", "project,local", "--strict-mcp-config", "--mcp-config", mcpConfigFile,
];

export function agentArgs(o: { pluginDir: string; mcpConfigFile: string; maxTurns: number; maxBudgetUsd: number; model?: string }): string[] {
  return [
    ...isolation(o.mcpConfigFile),
    "--permission-mode", "auto", "--permission-prompts", "none",
    "--plugin-dir", o.pluginDir, "--add-dir", o.pluginDir,
    "--max-turns", String(o.maxTurns), "--max-budget-usd", String(o.maxBudgetUsd),
    ...(o.model ? ["--model", o.model] : []),
    "--disallowedTools", DISALLOWED_TOOLS.join(","),
  ];
}

/** Test C's grader: read-only tools, no plugin, a structured answer. */
export function judgeArgs(o: { mcpConfigFile: string; schema: object; maxTurns: number; model?: string }): string[] {
  return [
    ...isolation(o.mcpConfigFile),
    "--permission-mode", "default", "--permission-prompts", "none",
    "--tools", "Read,Grep,Glob",
    "--max-turns", String(o.maxTurns),
    ...(o.model ? ["--model", o.model] : []),
    "--json-schema", JSON.stringify(o.schema),
  ];
}

export interface InitInfo { model: string; permissionMode: string; apiKeySource: string; mcpServers: string[]; plugins: { name: string; path: string }[]; version: string }

export function initInfo(e: unknown): InitInfo | null {
  const x = e as any;
  if (x?.type !== "system" || x.subtype !== "init") return null;
  return {
    model: String(x.model ?? ""),
    permissionMode: String(x.permissionMode ?? ""),
    apiKeySource: String(x.apiKeySource ?? ""),
    mcpServers: (Array.isArray(x.mcp_servers) ? x.mcp_servers : []).map((s: any) => String(s?.name ?? s)),
    plugins: (Array.isArray(x.plugins) ? x.plugins : []).map((p: any) => ({ name: String(p?.name ?? ""), path: String(p?.path ?? "") })),
    version: String(x.claude_code_version ?? ""),
  };
}

const samePath = (a: string, b: string) => {
  const n = (p: string) => resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

/** What would make a session's results meaningless. Anything missing counts as a problem. */
export function isolationProblems(init: InitInfo, expect: { pluginDir?: string; auto: boolean }): string[] {
  const problems: string[] = [];
  if (init.apiKeySource !== "none") {
    problems.push(`Claude Code didn't confirm it's using your Claude account (API key source: "${init.apiKeySource || "not reported"}"); the evals run only on your Claude plan.`);
  }
  if (init.mcpServers.length > 0) problems.push(`MCP servers were loaded (${init.mcpServers.join(", ")}); every eval session runs with none.`);
  const motif = (p: { name: string; path: string }) => Boolean(expect.pluginDir) && p.name === "motif" && samePath(p.path, expect.pluginDir!);
  const others = init.plugins.filter((p) => p.path !== "builtin" && !motif(p));
  if (others.length > 0) problems.push(`Other plugins were loaded (${others.map((p) => p.name).join(", ")}); every eval session runs with Motif's alone.`);
  if (expect.pluginDir && !init.plugins.some(motif)) problems.push(`The Motif plugin wasn't loaded from ${expect.pluginDir}.`);
  if (expect.auto && init.permissionMode !== "auto") {
    problems.push(`Claude Code started in "${init.permissionMode || "unknown"}" permission mode instead of auto mode, so it can't work unattended. Auto mode needs a model that supports it: choose one with --model.`);
  }
  return problems;
}

export interface ResultInfo { subtype: string; isError: boolean; turns: number; costUsd: number; durationMs: number; denials: string[]; text: string; structured?: unknown; apiErrorStatus: number | null }

export function resultInfo(e: unknown): ResultInfo | null {
  const x = e as any;
  if (x?.type !== "result") return null;
  return {
    subtype: String(x.subtype ?? ""),
    isError: x.is_error === true,
    turns: Number(x.num_turns ?? 0),
    costUsd: Number(x.total_cost_usd ?? 0),
    durationMs: Number(x.duration_ms ?? 0),
    denials: (Array.isArray(x.permission_denials) ? x.permission_denials : []).map((d: any) => `${d?.tool_name ?? "?"}: ${JSON.stringify(d?.tool_input ?? {}).slice(0, 200)}`),
    text: typeof x.result === "string" ? x.result : "",
    ...(x.structured_output !== undefined ? { structured: x.structured_output } : {}),
    apiErrorStatus: typeof x.api_error_status === "number" ? x.api_error_status : null,
  };
}

const LIMIT_TEXT = /usage limit|hit your limit|limit reached|rate limit/i;

/** The developer's plan ran out of usage for now: the run pauses and can be resumed later. */
export function usageLimit(e: unknown): { resetsAt?: number } | null {
  const x = e as any;
  if (x?.type === "rate_limit_event" && x.rate_limit_info?.status === "rejected") {
    const at = Number(x.rate_limit_info.resetsAt);
    return Number.isFinite(at) && at > 0 ? { resetsAt: at } : {};
  }
  const r = resultInfo(e);
  if (r?.isError && (r.apiErrorStatus === 429 || LIMIT_TEXT.test(r.text))) return {};
  return null;
}
```

- [ ] **Step 4: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-claude.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add tests/evals/claude.ts cli/test/evals-claude.test.ts
git commit -m "feat(evals): start Claude Code isolated, on the developer's account, and read its events" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Running one session

**Files:**
- Create: `tests/evals/session.ts`
- Create: `cli/test/fixtures/evals/fake-claude.ts`
- Test: `cli/test/evals-session.test.ts`

**Interfaces:**
- Consumes: `initInfo`, `isolationProblems`, `resultInfo`, `usageLimit`, `InitInfo`, `ResultInfo`, `agentArgs` (Task 1); `onExit` (`cli/src/cleanup.ts`); `killTree(pid, force)` (`cli/src/shot/devserver.ts`).
- Produces:
  - `interface SessionSpec { command: string[]; args: string[]; cwd: string; env: Record<string, string>; prompt: string; transcript: string; timeoutMs: number; expect: { pluginDir?: string; auto: boolean } }`
  - `type SessionEnd = "finished" | "turn-cap" | "budget-cap" | "time-limit" | "usage-limit" | "not-isolated" | "failed"`
  - `interface SessionOutcome { end: SessionEnd; init?: InitInfo; result?: ResultInfo; problems: string[]; resetsAt?: number; minutes: number }`
  - `runSession(spec: SessionSpec): Promise<SessionOutcome>`
  - The stand-in `cli/test/fixtures/evals/fake-claude.ts` (driven by `FAKE_CLAUDE_SCENARIO`, a JSON file; records what it got in `FAKE_CLAUDE_RECORD`); Task 11's README names it.

- [ ] **Step 1: Write the stand-in for Claude Code**

`cli/test/fixtures/evals/fake-claude.ts`:
```ts
// A stand-in for Claude Code in the eval runner's tests: reads the prompt, prints a scripted event stream, and can write files or hang.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface Scenario {
  /** Fields to change in the first event. */
  init?: Record<string, unknown>;
  /** Printed after the first event, in order. */
  events?: unknown[];
  /** Written relative to the working folder before the last event. */
  files?: Record<string, string>;
  /** Waits this long before the last event. */
  hangMs?: number;
  /** Fields to change in the last event; null prints none. */
  result?: Record<string, unknown> | null;
  stderr?: string;
  exitCode?: number;
}

const file = process.env.FAKE_CLAUDE_SCENARIO;
const scenario: Scenario = file ? JSON.parse(await Bun.file(file).text()) : {};
const prompt = await new Response(Bun.stdin.stream()).text();
const args = process.argv.slice(2);
if (process.env.FAKE_CLAUDE_RECORD) {
  writeFileSync(process.env.FAKE_CLAUDE_RECORD, JSON.stringify({ args, prompt, cwd: process.cwd(), motifBin: process.env.MOTIF_BIN ?? null, apiKey: process.env.ANTHROPIC_API_KEY ?? null }));
}
const out = (e: unknown) => process.stdout.write(JSON.stringify(e) + "\n");
const pluginDir = args.includes("--plugin-dir") ? args[args.indexOf("--plugin-dir") + 1] : undefined;

out({
  type: "system", subtype: "init", cwd: process.cwd(), session_id: "fake", model: "fake-model",
  permissionMode: args.includes("--permission-mode") ? args[args.indexOf("--permission-mode") + 1] : "default", apiKeySource: "none", mcp_servers: [],
  plugins: [...(pluginDir ? [{ name: "motif", path: pluginDir, source: "motif@inline" }] : []), { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" }],
  claude_code_version: "0.0.0-fake",
  ...scenario.init,
});
for (const e of scenario.events ?? []) out(e);
for (const [path, content] of Object.entries(scenario.files ?? {})) {
  mkdirSync(dirname(join(process.cwd(), path)), { recursive: true });
  writeFileSync(join(process.cwd(), path), content);
}
if (scenario.hangMs) await Bun.sleep(scenario.hangMs);
if (scenario.result !== null) {
  out({ type: "result", subtype: "success", is_error: false, num_turns: 3, total_cost_usd: 0.5, duration_ms: 1000, permission_denials: [], result: "Done.", api_error_status: null, ...scenario.result });
}
if (scenario.stderr) process.stderr.write(scenario.stderr);
process.exit(scenario.exitCode ?? 0);
```

- [ ] **Step 2: Write the failing test**

`cli/test/evals-session.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentArgs } from "../../tests/evals/claude";
import { runSession, type SessionSpec } from "../../tests/evals/session";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FAKE = join(import.meta.dir, "fixtures", "evals", "fake-claude.ts");

function spec(scenario: object, over: Partial<SessionSpec> = {}): SessionSpec & { record: string } {
  const dir = tempDir("motif-session-");
  const pluginDir = join(dir, "plugin");
  writeFileSync(join(dir, "scenario.json"), JSON.stringify(scenario));
  const record = join(dir, "record.json");
  return {
    command: [process.execPath, FAKE],
    args: agentArgs({ pluginDir, mcpConfigFile: join(dir, "no-mcp.json"), maxTurns: 5, maxBudgetUsd: 1 }),
    cwd: dir,
    env: { ...(process.env as Record<string, string>), FAKE_CLAUDE_SCENARIO: join(dir, "scenario.json"), FAKE_CLAUDE_RECORD: record },
    prompt: "/motif:feature Add a settings screen.",
    transcript: join(dir, "out", "session.jsonl"),
    timeoutMs: 60_000,
    expect: { pluginDir, auto: true },
    record,
    ...over,
  };
}

describe("a session", () => {
  test("finishes: the prompt arrives on standard input and every event is saved", async () => {
    const s = spec({});
    const o = await runSession(s);
    expect(o.end).toBe("finished");
    expect(o.init?.model).toBe("fake-model");
    expect(o.result?.turns).toBe(3);
    expect(o.problems).toEqual([]);
    expect(JSON.parse(readFileSync(s.record, "utf8")).prompt).toBe("/motif:feature Add a settings screen.");
    expect(readFileSync(s.transcript, "utf8").trim().split("\n")).toHaveLength(2);
  });

  test("is stopped at once when it isn't isolated", async () => {
    const started = Date.now();
    const o = await runSession(spec({ init: { mcp_servers: [{ name: "refero" }] }, hangMs: 30_000 }));
    expect(o.end).toBe("not-isolated");
    expect(o.problems.join(" ")).toContain("refero");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("pauses on the developer's usage limit", async () => {
    const o = await runSession(spec({
      events: [{ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1792000800 } }],
      result: { is_error: true, result: "You've hit your limit" },
    }));
    expect(o.end).toBe("usage-limit");
    expect(o.resetsAt).toBe(1792000800);
  });

  test("is stopped, with everything it started, at its time limit", async () => {
    const started = Date.now();
    const o = await runSession(spec({ hangMs: 60_000 }, { timeoutMs: 1500 }));
    expect(o.end).toBe("time-limit");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  test("reports its caps", async () => {
    expect((await runSession(spec({ result: { subtype: "error_max_turns", is_error: true } }))).end).toBe("turn-cap");
    expect((await runSession(spec({ result: { subtype: "error_max_budget_usd", is_error: true } }))).end).toBe("budget-cap");
  });

  test("says why when Claude Code stops unexpectedly", async () => {
    const o = await runSession(spec({ result: null, exitCode: 1, stderr: "Invalid API key" }));
    expect(o.end).toBe("failed");
    expect(o.problems.join(" ")).toContain("Invalid API key");
  });

  test("a program that doesn't exist fails without throwing", async () => {
    const o = await runSession(spec({}, { command: [join(tempDir("motif-none-"), "no-such-claude")] }));
    expect(o.end).toBe("failed");
    expect(o.init).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-session.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/session'`.

- [ ] **Step 4: Write `tests/evals/session.ts`**

```ts
// Runs one headless Claude Code session: the prompt on standard input, every event saved to a transcript, isolation checked as soon as
// the session starts, a time limit, and the developer's usage limit noticed. The whole process tree is stopped on a time limit or Ctrl+C.
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { onExit } from "../../cli/src/cleanup";
import { killTree } from "../../cli/src/shot/devserver";
import { initInfo, isolationProblems, resultInfo, usageLimit, type InitInfo, type ResultInfo } from "./claude";

export interface SessionSpec {
  /** The program and anything before the session's own arguments (a stand-in for Claude Code in tests). */
  command: string[];
  args: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  transcript: string;
  timeoutMs: number;
  expect: { pluginDir?: string; auto: boolean };
}

export type SessionEnd = "finished" | "turn-cap" | "budget-cap" | "time-limit" | "usage-limit" | "not-isolated" | "failed";

export interface SessionOutcome { end: SessionEnd; init?: InitInfo; result?: ResultInfo; problems: string[]; resetsAt?: number; minutes: number }

export async function runSession(spec: SessionSpec): Promise<SessionOutcome> {
  mkdirSync(dirname(spec.transcript), { recursive: true });
  writeFileSync(spec.transcript, "");
  const started = Date.now();
  let proc: ChildProcess;
  try {
    proc = spawn(spec.command[0]!, [...spec.command.slice(1), ...spec.args], {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32", // its own process group, so the whole tree can be stopped
      windowsHide: true,
    });
  } catch (e) {
    return { end: "failed", problems: [`Claude Code couldn't start: ${(e as Error).message}`], minutes: 0 };
  }
  const stop = () => {
    if (proc.pid) killTree(proc.pid, true);
  };
  const cancelExitHook = onExit(stop);

  let init: InitInfo | undefined;
  let result: ResultInfo | undefined;
  let limit: { resetsAt?: number } | null = null;
  let notIsolated = false;
  let timedOut = false;
  const problems: string[] = [];
  let pending = "";
  let stderr = "";

  const onEvent = (line: string) => {
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      return;
    }
    const i = initInfo(e);
    if (i && !init) {
      init = i;
      const p = isolationProblems(i, spec.expect);
      if (p.length > 0) {
        problems.push(...p);
        notIsolated = true;
        stop();
      }
    }
    limit ??= usageLimit(e);
    result = resultInfo(e) ?? result;
  };

  proc.stdout!.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    appendFileSync(spec.transcript, text);
    pending += text;
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const l of lines) if (l.trim()) onEvent(l);
  });
  proc.stderr!.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  let spawnError: Error | undefined;
  const ended = new Promise<number | null>((resolve) => {
    proc.once("close", (code) => resolve(code));
    proc.once("error", (e) => {
      spawnError = e;
      resolve(null);
    });
  });
  proc.stdin!.on("error", () => {}); // a session that exits early closes its input
  proc.stdin!.end(spec.prompt);
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, spec.timeoutMs);
  const code = await ended;
  clearTimeout(timer);
  cancelExitHook();
  if (pending.trim()) onEvent(pending);

  const base = { init, result, problems, minutes: Math.round((Date.now() - started) / 600) / 100, ...(limit?.resetsAt ? { resetsAt: limit.resetsAt } : {}) };
  if (notIsolated) return { ...base, end: "not-isolated" };
  if (limit) return { ...base, end: "usage-limit" };
  if (timedOut) return { ...base, end: "time-limit" };
  if (result?.subtype === "success" && !result.isError) return { ...base, end: "finished" };
  if (result?.subtype === "error_max_turns") return { ...base, end: "turn-cap" };
  if (result?.subtype === "error_max_budget_usd") return { ...base, end: "budget-cap" };
  const why = spawnError?.message ?? (stderr.trim().split("\n").slice(-5).join(" ") || result?.text || `exit code ${code}`);
  return { ...base, problems: [...problems, `Claude Code stopped unexpectedly: ${why}`], end: "failed" };
}
```

- [ ] **Step 5: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-session.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/evals/session.ts cli/test/fixtures/evals/fake-claude.ts cli/test/evals-session.test.ts
git commit -m "feat(evals): run one headless session with a transcript, isolation check, time limit and usage-limit pause" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Running programs, and the nine cases

**Files:**
- Create: `tests/evals/tools.ts`
- Create: `tests/evals/cases.ts`
- Create: `cli/test/fixtures/evals/fake-motif.ts`
- Test: `cli/test/evals-tools.test.ts`, `cli/test/evals-cases.test.ts`

**Interfaces:**
- Consumes: `spawnArgs(exe, args, platform)` (`cli/src/commands/connect.ts`); `killTree` (`cli/src/shot/devserver.ts`); `onExit` (`cli/src/cleanup.ts`).
- Produces:
  - `interface RunResult { code: number; stdout: string; stderr: string; timedOut: boolean }`; `type Run = (cmd: string[], cwd: string, timeoutMs: number, env?: Record<string, string | undefined>) => Promise<RunResult>`
  - `tail(r: RunResult, lines?: number): string`; `commandLine(cmd, which?, platform?): { cmd: string[]; verbatim: boolean }`; `runCmd: Run`
  - `interface MotifResult { code: number; json: any; output: string }`; `type Motif = (args: string[], cwd: string, timeoutMs?: number) => Promise<MotifResult>`; `motifRunner(command: string[], run?: Run, env?: Record<string, string | undefined>): Motif`
  - `packageManager(dir: string): string`
  - `type TestId = "B" | "C" | "D"`; `interface EvalCase { id; test: TestId; title; fixture?: "react-contract-app" | "react-seeded-app"; brief?: string; routes: string[]; prompt; maxTurns; maxBudgetUsd; minutes }`
  - `UNATTENDED: string`; `CASES: EvalCase[]`; `selectCases(all: EvalCase[], pick: { tests?: string[]; ids?: string[] }): EvalCase[] | { error: string }`

- [ ] **Step 1: Write the stand-in for the motif tool**

`cli/test/fixtures/evals/fake-motif.ts`:
```ts
// A stand-in for the motif tool: prints FAKE_MOTIF_RAW as it is, or the JSON that FAKE_MOTIF_OUTPUT gives for the command.
if (process.env.FAKE_MOTIF_RAW) {
  console.log(process.env.FAKE_MOTIF_RAW);
  process.exit(1);
}
const outputs = JSON.parse(process.env.FAKE_MOTIF_OUTPUT ?? "{}");
const command = process.argv[2] ?? "";
const out = outputs[command] ?? { command, ok: false, exitCode: 2, error: "unknown-command" };
console.log(JSON.stringify(out));
process.exit(out.exitCode ?? 0);
```

- [ ] **Step 2: Write the failing tests**

`cli/test/evals-tools.test.ts`:
```ts
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
```

`cli/test/evals-cases.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, selectCases, UNATTENDED, type EvalCase } from "../../tests/evals/cases";

const REPO = join(import.meta.dir, "../..");
const ids = (r: EvalCase[] | { error: string }) => ("error" in r ? r : r.map((c) => c.id));

describe("the eval cases (spec §13.2)", () => {
  test("five features for B, one review for C and three new apps for D", () => {
    expect(CASES.filter((c) => c.test === "B").map((c) => c.id)).toEqual(["b-settings", "b-search", "b-profile", "b-notifications", "b-checkout"]);
    expect(CASES.filter((c) => c.test === "C").map((c) => c.id)).toEqual(["c-review"]);
    expect(CASES.filter((c) => c.test === "D").map((c) => c.id)).toEqual(["d-stride", "d-ledgerly", "d-bloom"]);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  test("B adds a page to the contract app; C reviews the seeded app; D starts from a brief that exists", () => {
    for (const c of CASES.filter((x) => x.test === "B")) {
      expect(c.fixture).toBe("react-contract-app");
      expect(c.routes).toHaveLength(1);
      expect(c.prompt).toContain(` ${c.routes[0]}:`);
    }
    expect(CASES.find((c) => c.id === "c-review")!.fixture).toBe("react-seeded-app");
    for (const c of CASES.filter((x) => x.test === "D")) {
      expect(existsSync(join(REPO, "tests/fixtures/briefs", `${c.brief}.md`))).toBe(true);
      expect(c.routes).toEqual(["/", "/sign-in", "/home"]);
      for (const r of ["/sign-in", "/home"]) expect(c.prompt).toContain(r);
    }
  });

  test("every prompt starts a Motif command and switches approvals off in the skill's own words", () => {
    expect(readFileSync(join(REPO, "skill/SKILL.md"), "utf8")).toContain("don't stop for approval");
    expect(UNATTENDED.toLowerCase()).toContain("don't stop for approval");
    expect(UNATTENDED).not.toContain("skip previews"); // mockups are part of what's evaluated
    for (const c of CASES) {
      expect(c.prompt).toMatch(/^\/motif:(feature|review|init) /);
      expect(c.prompt).toContain(UNATTENDED);
    }
  });

  test("the review is report-only and names the screens", () => {
    const p = CASES.find((c) => c.id === "c-review")!.prompt;
    expect(p).toContain("don't change the app's code");
    for (const r of ["/products", "/products/oats"]) expect(p).toContain(r);
  });

  test("every case is capped", () => {
    for (const c of CASES) {
      expect(c.maxTurns).toBeGreaterThan(0);
      expect(c.maxBudgetUsd).toBeGreaterThan(0);
      expect(c.minutes).toBeGreaterThan(0);
    }
  });
});

describe("choosing cases", () => {
  test("by test and by id; everything by default", () => {
    expect(ids(selectCases(CASES, { tests: ["c"] }))).toEqual(["c-review"]);
    expect(ids(selectCases(CASES, { ids: ["d-bloom", "b-search"] }))).toEqual(["b-search", "d-bloom"]);
    expect(ids(selectCases(CASES, {}))).toHaveLength(9);
  });

  test("names what doesn't exist, and refuses an empty choice", () => {
    expect(selectCases(CASES, { tests: ["E"] })).toEqual({ error: expect.stringContaining('"E"') });
    expect(selectCases(CASES, { ids: ["b-nope"] })).toEqual({ error: expect.stringContaining('"b-nope"') });
    expect(selectCases(CASES, { tests: ["B"], ids: ["c-review"] })).toEqual({ error: expect.any(String) });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run (from `cli/`): `bun test test/evals-tools.test.ts test/evals-cases.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/tools'` and `'../../tests/evals/cases'`.

- [ ] **Step 4: Write `tests/evals/tools.ts`**

```ts
// Running programs for the evals (npm, npx, git, the motif tool) with a time limit. On Windows, .cmd programs go through cmd.exe.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { onExit } from "../../cli/src/cleanup";
import { spawnArgs } from "../../cli/src/commands/connect";
import { killTree } from "../../cli/src/shot/devserver";

export interface RunResult { code: number; stdout: string; stderr: string; timedOut: boolean }
export type Run = (cmd: string[], cwd: string, timeoutMs: number, env?: Record<string, string | undefined>) => Promise<RunResult>;

export const tail = (r: RunResult, lines = 8): string => `${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-lines).join("\n");

/** npm, npx and other .cmd programs run through cmd.exe on Windows (spawnArgs quotes each argument); everything else starts directly. */
export function commandLine(
  cmd: string[],
  which: (c: string) => string | null = (c) => Bun.which(c),
  platform: NodeJS.Platform = process.platform,
): { cmd: string[]; verbatim: boolean } {
  return spawnArgs(which(cmd[0]!) ?? cmd[0]!, cmd.slice(1), platform);
}

const KEEP = 5_000_000;

export const runCmd: Run = (cmd, cwd, timeoutMs, env) =>
  new Promise((resolve) => {
    const line = commandLine(cmd);
    let proc: ChildProcess;
    try {
      proc = spawn(line.cmd[0]!, line.cmd.slice(1), {
        cwd,
        env: env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
        windowsVerbatimArguments: line.verbatim,
      });
    } catch (e) {
      resolve({ code: 127, stdout: "", stderr: (e as Error).message, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;
    proc.stdout!.on("data", (c: Buffer) => {
      stdout = (stdout + c.toString()).slice(-KEEP);
    });
    proc.stderr!.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-KEEP);
    });
    const stop = () => {
      if (proc.pid) killTree(proc.pid, true);
    };
    const cancelExitHook = onExit(stop);
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const finish = (code: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancelExitHook();
      resolve({ code, stdout, stderr, timedOut });
    };
    proc.once("error", (e) => {
      stderr += e.message;
      finish(127);
    });
    proc.once("close", (code) => finish(code ?? 1));
  });

export interface MotifResult { code: number; json: any; output: string }
export type Motif = (args: string[], cwd: string, timeoutMs?: number) => Promise<MotifResult>;

/** Runs the motif tool with --json and reads the one JSON line it prints last. */
export function motifRunner(command: string[], run: Run = runCmd, env?: Record<string, string | undefined>): Motif {
  return async (args, cwd, timeoutMs = 600_000) => {
    const r = await run([...command, ...args, "--json"], cwd, timeoutMs, env);
    let json: any = null;
    try {
      json = JSON.parse(r.stdout.trim().split("\n").pop() ?? "");
    } catch {
      // Not JSON: the text stays in output.
    }
    return { code: r.code, json, output: tail(r, 20) };
  };
}

const LOCKFILES: [string, string][] = [["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"]];

export function packageManager(dir: string): string {
  return LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1] ?? "npm";
}
```

- [ ] **Step 5: Write `tests/evals/cases.ts`**

```ts
// The eval cases (spec §13.2): test B's five features on copies of the contract app, test C's review of the seeded app,
// and test D's three new apps from briefs. Each prompt switches approvals off in the skill's own words.

export type TestId = "B" | "C" | "D";

export interface EvalCase {
  id: string;
  test: TestId;
  title: string;
  /** B and C: the fixture app copied for the session. */
  fixture?: "react-contract-app" | "react-seeded-app";
  /** D: tests/fixtures/briefs/<brief>.md, copied into the empty folder as brief.md. */
  brief?: string;
  /** B: the feature's page. C: the screens reviewed. D: the starter screens. */
  routes: string[];
  prompt: string;
  maxTurns: number;
  /** Claude Code's --max-budget-usd, at its API-price estimate; the developer's plan pays, not an API account. */
  maxBudgetUsd: number;
  minutes: number;
}

export const UNATTENDED =
  "Don't stop for approval on this task, and don't ask me anything: choose the recommended option whenever there's a choice, carry on through every step that would wait for me, and show me everything at the end. If something can't be done here (no browser for screenshots, say), skip only that part and keep going.";

const feature = (id: string, title: string, route: string, what: string): EvalCase => ({
  id, test: "B", title, fixture: "react-contract-app", routes: [route],
  prompt: `/motif:feature ${what}\n\n${UNATTENDED}`,
  maxTurns: 200, maxBudgetUsd: 40, minutes: 90,
});

const newApp = (brief: string, title: string): EvalCase => ({
  id: `d-${brief}`, test: "D", title, brief, routes: ["/", "/sign-in", "/home"],
  prompt: `/motif:init Build the app described in brief.md in this folder; it has my answers to your questions. Put the welcome page at /, sign-in at /sign-in and home at /home.\n\n${UNATTENDED}`,
  maxTurns: 400, maxBudgetUsd: 80, minutes: 180,
});

export const CASES: EvalCase[] = [
  feature("b-settings", "Settings screen", "/settings",
    "Add a settings screen at /settings: switches for order-update and offer notifications, the delivery address with a way to change it, appearance (system, light or dark), and a sign-out button. Link to it from the app's navigation."),
  feature("b-search", "Search with an empty state", "/search",
    "Add product search at /search: a search field, matching products as a list, a state for when nothing matches that suggests another search, and a state for before anything is typed."),
  feature("b-profile", "Profile edit form with validation", "/profile/edit",
    "Add a profile edit form at /profile/edit: name, email and phone, with validation messages when a field is left and when the form is sent, a saving state and a success message. Pretend to save; there's no back end."),
  feature("b-notifications", "Notifications list", "/notifications",
    "Add a notifications list at /notifications: order and offer notifications grouped by day, unread markers, a mark-all-as-read action, and an empty state."),
  feature("b-checkout", "Checkout summary", "/checkout",
    "Add a checkout summary at /checkout: the basket's items with quantities and prices, the subtotal, delivery fee and total, a choice of delivery slot, and a place-order button with a confirmation state. Mock data only."),
  {
    id: "c-review", test: "C", title: "Review of the seeded app", fixture: "react-seeded-app", routes: ["/", "/products", "/products/oats"],
    prompt: `/motif:review Review the whole app: its screens are /, /products and /products/oats (a product). Write the report only: stop after the report step and don't change the app's code.\n\n${UNATTENDED}`,
    maxTurns: 150, maxBudgetUsd: 40, minutes: 90,
  },
  newApp("stride", "New app: Stride (a running club)"),
  newApp("ledgerly", "New app: Ledgerly (invoicing)"),
  newApp("bloom", "New app: Bloom (plant care)"),
];

export function selectCases(all: EvalCase[], pick: { tests?: string[]; ids?: string[] }): EvalCase[] | { error: string } {
  const tests = (pick.tests ?? []).map((t) => t.toUpperCase());
  const badTest = tests.find((t) => !["B", "C", "D"].includes(t));
  if (badTest) return { error: `There's no test "${badTest}". Tests: B, C, D.` };
  const badId = (pick.ids ?? []).find((id) => !all.some((c) => c.id === id));
  if (badId) return { error: `There's no case "${badId}". Cases: ${all.map((c) => c.id).join(", ")}.` };
  const chosen = all.filter((c) => (tests.length === 0 || tests.includes(c.test)) && (!pick.ids?.length || pick.ids.includes(c.id)));
  return chosen.length > 0 ? chosen : { error: "Those options leave no cases to run." };
}
```

- [ ] **Step 6: Run them to see them pass**

Run (from `cli/`): `bun test test/evals-tools.test.ts test/evals-cases.test.ts`
Expected: PASS (the `.cmd` test is skipped off Windows).

- [ ] **Step 7: Commit**

```bash
git add tests/evals/tools.ts tests/evals/cases.ts cli/test/fixtures/evals/fake-motif.ts cli/test/evals-tools.test.ts cli/test/evals-cases.test.ts
git commit -m "feat(evals): the nine cases, and running programs with a time limit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: A case's folder and what changed in it

**Files:**
- Create: `tests/evals/workspace.ts`
- Test: `cli/test/evals-workspace.test.ts`

**Interfaces:**
- Consumes: `assemble(fixture, dest)` (`tests/fixtures/assemble.ts`); `EvalCase` (Task 3); `Run`, `tail`, `runCmd` (Task 3).
- Produces:
  - `interface Workspace { dir: string; app: string; gitDir: string; baseline?: string }` — `app` is the session's working folder; `gitDir` holds git's record, beside the app.
  - `interface Change { status: "added" | "modified" | "deleted"; path: string }`
  - `removeDir(dir: string): void`; `snapshot(ws: { gitDir: string; app: string }, run: Run): Promise<string>`
  - `changes(ws: Workspace, run: Run): Promise<Change[]>`; `patch(ws: Workspace, run: Run, paths?: string[]): Promise<string>`
  - `prepareWorkspace(c: EvalCase, dir: string, run: Run): Promise<Workspace>`; `findApp(dir: string): string | null`

- [ ] **Step 1: Write the failing test**

`cli/test/evals-workspace.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import { runCmd, type Run } from "../../tests/evals/tools";
import { changes, findApp, patch, prepareWorkspace } from "../../tests/evals/workspace";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const npmCalls: string[][] = [];
// Real git; npm is stubbed, so CI never installs packages.
const run: Run = async (cmd, cwd, t, env) => {
  if (cmd[0] === "npm") {
    npmCalls.push(cmd);
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  }
  return runCmd(cmd, cwd, t, env);
};
const byId = (id: string) => CASES.find((c) => c.id === id)!;
const sorted = <T extends { path: string }>(xs: T[]) => [...xs].sort((a, b) => a.path.localeCompare(b.path));

describe("a case's folder", () => {
  test("B and C: a fresh copy of the app, its packages installed, its starting state recorded beside it", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-ws-"), "b-settings"), run);
    expect(existsSync(join(ws.app, "DESIGN.md"))).toBe(true);
    expect(npmCalls.at(-1)).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(ws.app, ".git"))).toBe(false);
    expect(await changes(ws, run)).toEqual([]);
  });

  test("lists what the session added, changed and deleted, ignoring installed packages and build output", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-ws-"), "b"), run);
    mkdirSync(join(ws.app, "src/app/settings"), { recursive: true });
    writeFileSync(join(ws.app, "src/app/settings/page.tsx"), "export default function Settings() { return null; }\n");
    writeFileSync(join(ws.app, "src/app/page.tsx"), "export default function Home() { return null; }\n");
    rmSync(join(ws.app, "src/components/Badge.tsx"));
    mkdirSync(join(ws.app, "node_modules/x"), { recursive: true });
    writeFileSync(join(ws.app, "node_modules/x/index.js"), "");
    mkdirSync(join(ws.app, ".next"), { recursive: true });
    writeFileSync(join(ws.app, ".next/trace"), "");
    expect(sorted(await changes(ws, run))).toEqual(sorted([
      { status: "added", path: "src/app/settings/page.tsx" },
      { status: "modified", path: "src/app/page.tsx" },
      { status: "deleted", path: "src/components/Badge.tsx" },
    ]));
    expect(await patch(ws, run, ["src/app/settings/page.tsx"])).toContain("+export default function Settings()");
  });

  test("a git repository the session makes inside the app doesn't change the record", async () => {
    const ws = await prepareWorkspace(byId("b-search"), join(tempDir("motif-ws-"), "g"), run);
    await runCmd(["git", "init", "-q"], ws.app, 60_000);
    await runCmd(["git", "add", "-A"], ws.app, 60_000);
    writeFileSync(join(ws.app, "src/app/new.ts"), "export {};\n");
    expect(await changes(ws, run)).toEqual([{ status: "added", path: "src/app/new.ts" }]);
  });

  test("D: an empty folder holding the brief, nothing recorded", async () => {
    const ws = await prepareWorkspace(byId("d-stride"), join(tempDir("motif-ws-"), "d"), run);
    expect(readdirSync(ws.app)).toEqual(["brief.md"]);
    expect(ws.baseline).toBeUndefined();
    expect(await changes(ws, run)).toEqual([]);
  });

  test("a failed install stops the case with npm's own words", async () => {
    const failing: Run = async (cmd, cwd, t) => (cmd[0] === "npm" ? { code: 1, stdout: "", stderr: "npm ERR! network unreachable", timedOut: false } : runCmd(cmd, cwd, t));
    await expect(prepareWorkspace(byId("b-search"), join(tempDir("motif-ws-"), "s"), failing)).rejects.toThrow("network unreachable");
  });

  test("preparing again starts from scratch", async () => {
    const dir = join(tempDir("motif-ws-"), "again");
    const first = await prepareWorkspace(byId("d-bloom"), dir, run);
    writeFileSync(join(first.app, "leftover.txt"), "x");
    const second = await prepareWorkspace(byId("d-bloom"), dir, run);
    expect(readdirSync(second.app)).toEqual(["brief.md"]);
  });
});

describe("test D's new app", () => {
  test("is the folder with a design guide: this one, or the one inside it", () => {
    const dir = tempDir("motif-find-");
    expect(findApp(dir)).toBeNull();
    mkdirSync(join(dir, "stride"));
    writeFileSync(join(dir, "stride", "DESIGN.md"), "");
    expect(findApp(dir)).toBe(join(dir, "stride"));
    writeFileSync(join(dir, "DESIGN.md"), "");
    expect(findApp(dir)).toBe(dir);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-workspace.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/workspace'`.

- [ ] **Step 3: Write `tests/evals/workspace.ts`**

```ts
// A case's folder: a fresh copy of the fixture app with its packages installed (B, C), or an empty folder holding the brief (D),
// plus git's record of how it started. The record lives beside the app, not in it, so nothing the session does can change it.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "../fixtures/assemble";
import type { EvalCase } from "./cases";
import { tail, type Run } from "./tools";

export interface Workspace { dir: string; app: string; gitDir: string; baseline?: string }
export interface Change { status: "added" | "modified" | "deleted"; path: string }

const BRIEFS = join(import.meta.dir, "..", "fixtures", "briefs");

/** Deletes a folder; on Windows a program that just stopped can hold its files for a moment. */
export function removeDir(dir: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (attempt >= 30) throw e;
      Bun.sleepSync(200);
    }
  }
}

const git = (ws: { gitDir: string; app: string }, args: string[]) => [
  "git", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.quotePath=false",
  `--git-dir=${ws.gitDir}`, `--work-tree=${ws.app}`, ...args,
];

async function gitOut(ws: { gitDir: string; app: string }, run: Run, args: string[]): Promise<string> {
  const r = await run(git(ws, args), ws.app, 300_000);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${tail(r)}`);
  return r.stdout;
}

/** Records the app folder as it is now (the files git would keep); returns git's id for that state. */
export async function snapshot(ws: { gitDir: string; app: string }, run: Run): Promise<string> {
  if (!existsSync(ws.gitDir)) await gitOut(ws, run, ["init", "-q"]);
  await gitOut(ws, run, ["add", "-A"]);
  return (await gitOut(ws, run, ["write-tree"])).trim();
}

const STATUS: Record<string, Change["status"]> = { A: "added", D: "deleted" };

/** What changed since the snapshot. Ignored files (node_modules, .next) don't count. */
export async function changes(ws: Workspace, run: Run): Promise<Change[]> {
  if (!ws.baseline) return [];
  await gitOut(ws, run, ["add", "-A"]);
  const out = await gitOut(ws, run, ["diff", "--cached", "--name-status", "--no-renames", ws.baseline]);
  return out.split("\n").filter((l) => l.trim()).map((l) => {
    const [status, ...path] = l.split("\t");
    return { status: STATUS[status!.charAt(0)] ?? "modified", path: path.join("\t") };
  });
}

/** The diff since the snapshot, for the results folder; only for some paths if given. */
export async function patch(ws: Workspace, run: Run, paths: string[] = []): Promise<string> {
  if (!ws.baseline) return "";
  await gitOut(ws, run, ["add", "-A"]);
  return gitOut(ws, run, ["diff", "--cached", "--no-renames", ws.baseline, ...(paths.length ? ["--", ...paths] : [])]);
}

export async function prepareWorkspace(c: EvalCase, dir: string, run: Run): Promise<Workspace> {
  removeDir(dir);
  const ws: Workspace = { dir, app: join(dir, "app"), gitDir: join(dir, "baseline.git") };
  mkdirSync(ws.app, { recursive: true });
  if (c.brief) {
    copyFileSync(join(BRIEFS, `${c.brief}.md`), join(ws.app, "brief.md"));
    return ws;
  }
  assemble(c.fixture!, ws.app);
  const install = await run(["npm", "ci", "--no-audit", "--no-fund"], ws.app, 900_000);
  if (install.code !== 0) throw new Error(`Installing the app's packages failed (npm ci):\n${tail(install)}`);
  ws.baseline = await snapshot(ws, run);
  return ws;
}

/** Where test D's new app ended up: this folder, or the one folder inside it with a design guide. */
export function findApp(dir: string): string | null {
  if (existsSync(join(dir, "DESIGN.md"))) return dir;
  const withGuide = readdirSync(dir).filter(
    (n) => !n.startsWith(".") && n !== "node_modules" && statSync(join(dir, n)).isDirectory() && existsSync(join(dir, n, "DESIGN.md")),
  );
  if (withGuide.length === 1) return join(dir, withGuide[0]!);
  const apps = withGuide.filter((n) => existsSync(join(dir, n, "package.json")));
  return apps.length === 1 ? join(dir, apps[0]!) : null;
}
```

- [ ] **Step 4: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-workspace.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/evals/workspace.ts cli/test/evals-workspace.test.ts
git commit -m "feat(evals): each case's folder, with git's record of how it started kept outside the app" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Test C — matching a review's findings to the seeded list

**Files:**
- Create: `tests/evals/match.ts`
- Modify: `tests/fixtures/react-seeded-app/seeded-issues.json` (S-16, S-17, S-22), `tests/fixtures/react-seeded-app/README.md` (their rows)
- Test: `cli/test/evals-match.test.ts`

**Interfaces:**
- Consumes: `tests/fixtures/react-seeded-app/seeded-issues.json`, read by the README's rules ("How a grader reads the list").
- Produces:
  - `CATEGORIES` (the 15 review categories); `interface Location { file?; line?; screen?; scheme?; viewport?; selector?; app? }`; `interface Consequence`; `interface SeededIssue`; `interface Finding { id; severity; category; source?; location: Location; locations?: Location[]; summary; fix? }`
  - `parseReport(raw: string): { findings: Finding[]; problems: string[] }`
  - `normFile(file, appRoot?)`, `normScreen(screen)`, `sameScreen(a, b)`, `places(f: Finding, appRoot?): Location[]`
  - `type LineText = (file: string, line: number) => string | undefined`; `pointsAt(issue, place, lineText): boolean`
  - `interface ExactGrade { exact: { id: string; findings: string[] }[]; candidates: { id: string; findings: string[] }[]; consequences: string[]; unmatchedSerious: string[] }`; `gradeExact(findings, issues, lineText, appRoot?): ExactGrade`

**Why the list changes:** S-16 (emoji), S-17 (gradient text) and S-22 (hover-only buttons) are judgement problems a reviewer sees on a screen, and a review often reports what it sees by screen. Today they can only be matched at one file and line, so a correct finding on `/` ("emoji on the home screen") would never reach the model grader. Adding their screens makes them "file and screen: either one", like S-14, S-15 and S-18–S-23. S-20 (an unknown product) has no screen to show it on.

- [ ] **Step 1: Write the failing test**

`cli/test/evals-match.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gradeExact, normScreen, parseReport, places, sameScreen, type Finding, type LineText, type SeededIssue } from "../../tests/evals/match";

const SEEDED = join(import.meta.dir, "../../tests/fixtures/react-seeded-app");
const issues: SeededIssue[] = JSON.parse(readFileSync(join(SEEDED, "seeded-issues.json"), "utf8")).issues;
const noLines: LineText = () => undefined;
let n = 0;
const finding = (category: string, location: Finding["location"], severity = "major"): Finding => ({ id: `F-${String(++n).padStart(3, "0")}`, severity, category, source: "exact", location, summary: "x", fix: "y" });
const exactFor = (fs: Finding[], id: string, lineText: LineText = noLines) => gradeExact(fs, issues, lineText).exact.find((e) => e.id === id)!.findings;

describe("reading a review report", () => {
  test("keeps findings in the review format", () => {
    const r = parseReport(JSON.stringify({ motifReview: 1, scope: "whole app", findings: [finding("contrast", { screen: "/" })] }));
    expect(r.findings).toHaveLength(1);
    expect(r.problems).toEqual([]);
  });

  test("names what isn't in the format and leaves it out", () => {
    const r = parseReport(JSON.stringify({ motifReview: 1, findings: [
      { id: "F-1", severity: "high", category: "contrast", location: {}, summary: "x" },
      { id: "F-2", severity: "major", category: "colours", location: {}, summary: "x" },
      { id: "F-3", severity: "minor", category: "copy", location: {}, summary: "x" },
      { id: "F-3", severity: "minor", category: "copy", location: {}, summary: "x" },
    ] }));
    expect(r.findings.map((f) => f.id)).toEqual(["F-3"]);
    const p = r.problems.join("\n");
    expect(p).toContain('severity "high"');
    expect(p).toContain('category "colours"');
    expect(p).toContain("F-3: the id is used twice");
  });

  test("a file that isn't a report", () => {
    expect(parseReport("{").problems[0]).toContain("isn't valid JSON");
    expect(parseReport('{"findings": []}').problems[0]).toContain("motifReview");
    expect(parseReport('{"motifReview": 1}').problems[0]).toContain("no findings list");
  });
});

describe("where a finding points", () => {
  test("screens are routes, however they're written", () => {
    expect(normScreen("http://localhost:3000/products/oats/?x=1")).toBe("/products/oats");
    expect(normScreen("products")).toBe("/products");
    expect(normScreen("/")).toBe("/");
    expect(sameScreen("/products/[id]", "/products/oats")).toBe(true);
    expect(sameScreen("/products", "/products/oats")).toBe(false);
  });

  test("files are relative to the app, with file:line split", () => {
    const app = join(SEEDED, "copy");
    expect(places(finding("raw-value", { file: "src/components/PriceTag.tsx:3" }))[0]).toMatchObject({ file: "src/components/PriceTag.tsx", line: 3 });
    expect(places(finding("raw-value", { file: join(app, "src", "components", "PriceTag.tsx"), line: 3 }), app)[0]!.file).toBe("src/components/PriceTag.tsx");
    expect(places(finding("raw-value", { file: ".\\src\\app\\page.tsx" }))[0]!.file).toBe("src/app/page.tsx");
  });

  test("a finding's extra places count too", () => {
    const f = { ...finding("raw-value", { file: "src/components/PromoBanner.tsx", line: 9 }), locations: [{ file: "src/components/PriceTag.tsx", line: 3 }] };
    expect(exactFor([f], "S-01")).toEqual([f.id]);
    expect(exactFor([f], "S-02")).toEqual([f.id]);
  });
});

describe("the exact problems (README: how a grader reads the list)", () => {
  test("file and line: the finding must point there, in one of the problem's categories", () => {
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx", line: 3 })], "S-01")).toHaveLength(1);
    expect(exactFor([finding("contrast", { file: "src/components/PriceTag.tsx", line: 3 })], "S-01")).toHaveLength(0);
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx" })], "S-01")).toHaveLength(0);
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx", line: 7 })], "S-01")).toHaveLength(0);
  });

  test("…or at a line holding the problem's anchor", () => {
    const lineText: LineText = (f, l) => (f === "src/components/PriceTag.tsx" && l === 4 ? 'className="text-[#2F7D4F]"' : undefined);
    expect(exactFor([finding("raw-value", { file: "src/components/PriceTag.tsx", line: 4 })], "S-01", lineText)).toHaveLength(1);
  });

  test("file alone: anywhere in that file", () => {
    expect(exactFor([finding("contrast", { file: "design/tokens.json", line: 40 })], "S-11")).toHaveLength(1);
  });

  test("file and screen: either one", () => {
    expect(exactFor([finding("contrast", { screen: "/", scheme: "light" })], "S-12")).toHaveLength(1);
    expect(exactFor([finding("contrast", { file: "src/components/PromoBanner.tsx", line: 16 })], "S-12")).toHaveLength(1);
  });

  test("the whole app: the category alone", () => {
    expect(exactFor([finding("reduced-motion", { screen: "/products" })], "S-09")).toHaveLength(1);
  });
});

describe("knock-on findings and the rest", () => {
  test("a declared consequence is correct, not false", () => {
    const f = finding("contrast", { screen: "/products", scheme: "light", selector: "p.caption" });
    const g = gradeExact([f], issues, noLines);
    expect(g.consequences).toEqual([f.id]);
    expect(g.unmatchedSerious).toEqual([]);
  });

  test("…only in the schemes the list names", () => {
    // S-02's banner is a problem only in dark mode.
    expect(gradeExact([finding("contrast", { screen: "/", scheme: "light" })], issues.filter((i) => i.id === "S-02"), noLines).consequences).toEqual([]);
  });

  test("judgement problems get candidates by category and place, for the model grader to confirm", () => {
    const yes = finding("hierarchy", { screen: "/" });
    const no = finding("copy", { screen: "/products" }, "minor");
    expect(gradeExact([yes, no], issues, noLines).candidates.find((c) => c.id === "S-14")!.findings).toEqual([yes.id]);
  });

  test("serious findings that match nothing go to the model grader; minor ones don't count", () => {
    const stray = finding("navigation", { screen: "/settings" }, "critical");
    const small = finding("other", { screen: "/settings" }, "minor");
    expect(gradeExact([stray, small], issues, noLines).unmatchedSerious).toEqual([stray.id]);
  });
});

describe("the seeded list itself", () => {
  test("a review reporting every planted problem where the list says finds all of them", () => {
    const perfect = issues.map((i) => finding(i.categories[0]!, i.location.app ? { screen: "/" } : { ...i.location }, i.severity));
    const g = gradeExact(perfect, issues, noLines);
    expect(g.exact.filter((e) => e.findings.length === 0)).toEqual([]);
    expect(g.candidates.filter((c) => c.findings.length === 0)).toEqual([]);
  });

  test("every judgement problem seen on a screen can be reported by its screen (all but the unknown product)", () => {
    for (const i of issues.filter((x) => x.kind === "judgement" && x.id !== "S-20")) expect(i.location.screen).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-match.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/match'`.

- [ ] **Step 3: Write `tests/evals/match.ts`**

```ts
// Test C's exact grading: which planted problems a review found, by category and location, following "How a grader reads the list"
// in tests/fixtures/react-seeded-app/README.md. Judgement problems only get candidates here; the model grader (judge.ts) confirms them.
import { isAbsolute, relative } from "node:path";

export const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
] as const;
const SEVERITIES = ["critical", "major", "minor"];

export interface Location { file?: string; line?: number; screen?: string; scheme?: string; viewport?: string; selector?: string; app?: boolean }
export interface Consequence { category: string; screens: string[]; schemes: string[]; note: string }
export interface SeededIssue {
  id: string; kind: "exact" | "judgement"; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: Location; anchor?: string; summary: string; consequences?: Consequence[];
}
export interface Finding { id: string; severity: string; category: string; source?: string; location: Location; locations?: Location[]; summary: string; fix?: string }

/** Reads a review's JSON report; findings that don't follow the format are left out and named. */
export function parseReport(raw: string): { findings: Finding[]; problems: string[] } {
  let doc: any;
  try {
    doc = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (e) {
    return { findings: [], problems: [`The report isn't valid JSON: ${(e as Error).message}`] };
  }
  if (doc?.motifReview !== 1) return { findings: [], problems: ['The report doesn\'t say "motifReview": 1.'] };
  if (!Array.isArray(doc.findings)) return { findings: [], problems: ["The report has no findings list."] };
  const findings: Finding[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  doc.findings.forEach((f: any, i: number) => {
    const wrong: string[] = [];
    if (typeof f?.id !== "string") wrong.push("no id");
    if (!SEVERITIES.includes(f?.severity)) wrong.push(`severity "${f?.severity}"`);
    if (!(CATEGORIES as readonly string[]).includes(f?.category)) wrong.push(`category "${f?.category}"`);
    if (typeof f?.location !== "object" || f.location === null) wrong.push("no location");
    if (typeof f?.summary !== "string") wrong.push("no summary");
    const name = typeof f?.id === "string" ? f.id : `finding ${i + 1}`;
    if (wrong.length) problems.push(`${name}: ${wrong.join(", ")}`);
    else if (seen.has(f.id)) problems.push(`${f.id}: the id is used twice`);
    else {
      seen.add(f.id);
      findings.push(f as Finding);
    }
  });
  return { findings, problems };
}

export function normFile(file: string, appRoot?: string): string {
  let f = file.trim();
  if (appRoot && isAbsolute(f)) {
    const rel = relative(appRoot, f);
    if (!rel.startsWith("..") && !isAbsolute(rel)) f = rel;
  }
  return f.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** "/products/oats/", "http://localhost:3000/products/oats?x=1" and "products/oats" are the same screen. */
export function normScreen(screen: string): string {
  let s = screen.trim().replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase() || "/";
}

/** A dynamic segment ([id]) matches any value. */
export function sameScreen(a: string, b: string): boolean {
  const x = normScreen(a).split("/");
  const y = normScreen(b).split("/");
  const dynamic = (s: string) => /^\[.+\]$/.test(s);
  return x.length === y.length && x.every((s, i) => s === y[i] || dynamic(s) || dynamic(y[i]!));
}

/** The places a finding points at, tidied: files relative to the app, "file:12" split, screens as routes. */
export function places(f: Finding, appRoot?: string): Location[] {
  const all = [f.location, ...(Array.isArray(f.locations) ? f.locations : [])].filter((l): l is Location => typeof l === "object" && l !== null);
  return all.map((l) => {
    const out: Location = { ...l };
    if (typeof l.line === "string") out.line = Number(l.line);
    if (typeof l.file === "string") {
      const m = l.line === undefined ? l.file.match(/^(.*?):(\d+)(?::\d+)?$/) : null;
      out.file = normFile(m ? m[1]! : l.file, appRoot);
      if (m) out.line = Number(m[2]);
    }
    if (typeof l.screen === "string") out.screen = normScreen(l.screen);
    return out;
  });
}

export type LineText = (file: string, line: number) => string | undefined;

/** Whether a place points at a planted problem: file and line (or a line holding the anchor), file alone, screen, either, or the whole app. */
export function pointsAt(issue: SeededIssue, place: Location, lineText: LineText): boolean {
  const L = issue.location;
  if (L.app) return true;
  let fileOk = false;
  if (L.file && place.file === L.file) {
    if (L.line === undefined || place.line === L.line) fileOk = true;
    else if (place.line !== undefined && issue.anchor) fileOk = (lineText(place.file, place.line) ?? "").includes(issue.anchor);
  }
  const screenOk = Boolean(L.screen && place.screen && sameScreen(place.screen, L.screen));
  return fileOk || screenOk;
}

const matches = (issue: SeededIssue, f: Finding, lineText: LineText, appRoot?: string) =>
  issue.categories.includes(f.category) && places(f, appRoot).some((p) => pointsAt(issue, p, lineText));

/** A knock-on finding the list declares: its category, on one of its screens (and schemes), or at the problem's own place. */
function isConsequence(f: Finding, issues: SeededIssue[], lineText: LineText, appRoot?: string): boolean {
  const ps = places(f, appRoot);
  return issues.some((issue) =>
    (issue.consequences ?? []).some((c) =>
      c.category === f.category &&
      ps.some((p) =>
        (p.screen !== undefined && c.screens.some((s) => sameScreen(p.screen!, s)) && (p.scheme === undefined || c.schemes.includes(String(p.scheme).toLowerCase()))) ||
        pointsAt({ ...issue, location: { ...issue.location, app: false } }, p, lineText))));
}

export interface ExactGrade {
  /** Per exact problem, the findings that found it. */
  exact: { id: string; findings: string[] }[];
  /** Per judgement problem, the findings in one of its categories that point at its place. */
  candidates: { id: string; findings: string[] }[];
  /** Findings that are declared knock-ons: correct, though they find nothing new. */
  consequences: string[];
  /** Critical and major findings that matched no exact problem and no knock-on; the model grader decides if they're real. */
  unmatchedSerious: string[];
}

export function gradeExact(findings: Finding[], issues: SeededIssue[], lineText: LineText, appRoot?: string): ExactGrade {
  const per = (kind: SeededIssue["kind"]) =>
    issues.filter((i) => i.kind === kind).map((i) => ({ id: i.id, findings: findings.filter((f) => matches(i, f, lineText, appRoot)).map((f) => f.id) }));
  const exact = per("exact");
  const candidates = per("judgement");
  const found = new Set(exact.flatMap((e) => e.findings));
  const consequences = findings.filter((f) => !found.has(f.id) && isConsequence(f, issues, lineText, appRoot)).map((f) => f.id);
  const settled = new Set([...found, ...consequences]);
  const unmatchedSerious = findings.filter((f) => (f.severity === "critical" || f.severity === "major") && !settled.has(f.id)).map((f) => f.id);
  return { exact, candidates, consequences, unmatchedSerious };
}
```

- [ ] **Step 4: Give S-16, S-17 and S-22 their screens**

In `tests/fixtures/react-seeded-app/seeded-issues.json`, make these three edits (nothing else changes):

```
"location": { "file": "src/components/PromoBanner.tsx", "line": 11 }, "anchor": "🔥"
→ "location": { "file": "src/components/PromoBanner.tsx", "line": 11, "screen": "/" }, "anchor": "🔥"

"location": { "file": "src/components/PromoBanner.tsx", "line": 13 }, "anchor": "bg-clip-text"
→ "location": { "file": "src/components/PromoBanner.tsx", "line": 13, "screen": "/" }, "anchor": "bg-clip-text"

"location": { "file": "src/app/products/page.tsx", "line": 19 }, "anchor": "group-hover:opacity-100"
→ "location": { "file": "src/app/products/page.tsx", "line": 19, "screen": "/products" }, "anchor": "group-hover:opacity-100"
```

In `tests/fixtures/react-seeded-app/README.md`, update the three rows' "Where" column:

```
| S-16 | judgement | Emoji used as UI | `/`: `PromoBanner.tsx:11`, the feature cards |
| S-17 | judgement | Gradient text on the promo headline | `/`, `PromoBanner.tsx:13` |
| S-22 | judgement | Add buttons appear only on hover | `/products`, `src/app/products/page.tsx:19` |
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/evals-match.test.ts test/fixtures-seeded.test.ts`
Expected: PASS (the seeded fixture's own tests still pass: no exact problem moved).

- [ ] **Step 6: Commit**

```bash
git add tests/evals/match.ts cli/test/evals-match.test.ts tests/fixtures/react-seeded-app/seeded-issues.json tests/fixtures/react-seeded-app/README.md
git commit -m "feat(evals): match review findings to the seeded list by category and place, knock-ons included" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Test C — the model grader and its rubric

**Files:**
- Create: `tests/evals/judge.ts`
- Create: `tests/evals/rubric.md`
- Test: `cli/test/evals-judge.test.ts`

**Interfaces:**
- Consumes: `Finding`, `SeededIssue` (Task 5).
- Produces:
  - `RUBRIC: string` (path); `JUDGE_SCHEMA` (a JSON schema object)
  - `interface JudgeInput { issues: { issue: SeededIssue; candidates: Finding[] }[]; unmatched: Finding[] }`
  - `interface JudgeVerdict { issues: Record<string, { findings: string[]; why: string }>; unmatched: Record<string, { verdict: "real" | "false"; why: string }>; notes: string[] }`
  - `type JudgeOutcome = { verdict: JudgeVerdict } | { paused: { resetsAt?: number } } | { error: string }`; `type JudgeFn = (input: JudgeInput, cwd: string) => Promise<JudgeOutcome>`
  - `judgePrompt(input: JudgeInput, rubric?: string): string`; `readVerdict(structured: unknown, input: JudgeInput): JudgeVerdict`
  - `class Paused extends Error { resetsAt?: number }` — thrown when grading meets the usage limit (Task 8 throws it, Task 10 catches it).

- [ ] **Step 1: Write the failing test**

`cli/test/evals-judge.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { JUDGE_SCHEMA, judgePrompt, Paused, readVerdict, RUBRIC, type JudgeInput } from "../../tests/evals/judge";
import type { Finding, SeededIssue } from "../../tests/evals/match";

const issue: SeededIssue = {
  id: "S-14", kind: "judgement", detectedBy: "review", categories: ["hierarchy"], severity: "major",
  location: { file: "src/app/page.tsx", screen: "/" }, summary: "Home has three primary buttons side by side, so nothing says what to do first.",
};
const f = (id: string, summary: string): Finding => ({ id, severity: "major", category: "hierarchy", location: { screen: "/" }, summary, fix: "Make one primary." });
const input: JudgeInput = {
  issues: [{ issue, candidates: [f("F-001", "Three equal primary buttons compete."), f("F-002", "The headline is too big.")] }],
  unmatched: [f("F-009", "The settings page is missing.")],
};

describe("test C's model grader", () => {
  test("has a written rubric with both parts", () => {
    expect(existsSync(RUBRIC)).toBe(true);
    const r = readFileSync(RUBRIC, "utf8");
    expect(r).toContain("## Part A");
    expect(r).toContain("## Part B");
  });

  test("is asked about each planted problem with its candidates, and each serious unmatched finding", () => {
    const p = judgePrompt(input, "RUBRIC TEXT");
    for (const s of ["RUBRIC TEXT", "S-14", "F-001", "F-002", "F-009", "Three equal primary buttons compete.", "Don't change anything"]) expect(p).toContain(s);
  });

  test("answers in a schema that needs both parts", () => {
    const schema = JSON.parse(JSON.stringify(JUDGE_SCHEMA));
    expect(schema.required).toEqual(["issues", "unmatched"]);
    expect(schema.properties.unmatched.items.properties.verdict.enum).toEqual(["real", "false"]);
  });

  test("only findings it was offered count, and anything unanswered is noted", () => {
    const v = readVerdict({ issues: [{ issue: "S-14", findings: ["F-001", "F-777"], why: "F-001 names it." }], unmatched: [] }, input);
    expect(v.issues["S-14"]!.findings).toEqual(["F-001"]);
    expect(v.unmatched["F-009"]!.verdict).toBe("false");
    expect(v.notes.join(" ")).toContain("F-009");
  });

  test("a problem it didn't answer counts as not found", () => {
    const v = readVerdict({ issues: [], unmatched: [{ finding: "F-009", verdict: "real", why: "True." }] }, input);
    expect(v.issues["S-14"]!.findings).toEqual([]);
    expect(v.unmatched["F-009"]!.verdict).toBe("real");
    expect(v.notes.join(" ")).toContain("S-14");
  });

  test("a usage limit while grading is a pause, with when it resets", () => {
    const e = new Paused(1792000800);
    expect(e).toBeInstanceOf(Error);
    expect(e.resetsAt).toBe(1792000800);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-judge.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/judge'`.

- [ ] **Step 3: Write `tests/evals/rubric.md`**

```markdown
# Test C grading rubric

You grade a design review of the web app in this folder. Some problems were planted in the app on purpose; the review's findings are JSON objects with a severity, a category, a location (a file and line, a screen route, or both) and a one-line summary. Read the app's code, its `design/` folder and the screenshots in `design/shots/` whenever a claim needs checking. Don't change anything.

## Part A — does a finding describe a planted problem?

For each planted problem you get the findings that are in one of its categories and point at its place. Say which of them describe **this** problem.

- A finding describes the problem when a developer reading it would fix this problem: it names the same thing (the element, the copy, the state, the layout) and the same fault, in any words.
- One finding may cover several problems ("emoji and gradient text on the promo") and counts for each one it clearly names.
- A vague finding ("the home screen could be clearer") doesn't describe a specific problem. Neither does a finding about a different fault in the same place.
- The finding's severity and its proposed fix don't matter here.

## Part B — is a serious finding real?

For each critical or major finding that matched no planted problem, decide whether it is **real** or **false**.

- **Real:** the problem is there in the app as it is (check the code or the screenshots), and a careful designer would agree it hurts the experience or breaks the app's design guide (`DESIGN.md`), even though nobody planted it.
- **False:** the claim is wrong (the thing isn't there, or works as it should), or it is a matter of taste with no basis in the design guide or common practice.
- If you can't confirm a claim from the code or the screenshots, it is false.

## Answer

One entry per Part A problem: its id, the ids of the findings that describe it (possibly none) and why, in a sentence. One entry per Part B finding: "real" or "false", and why, in a sentence.
```

- [ ] **Step 4: Write `tests/evals/judge.ts`**

```ts
// Test C's model grader (spec §13.2: "judgement issues: model grader with a written rubric"). One read-only Claude Code session in the
// reviewed app decides which candidate findings describe each planted judgement problem, and whether unmatched serious findings are real.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, SeededIssue } from "./match";

export const RUBRIC = join(import.meta.dir, "rubric.md");

export const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: { issue: { type: "string" }, findings: { type: "array", items: { type: "string" } }, why: { type: "string" } },
        required: ["issue", "findings", "why"],
        additionalProperties: false,
      },
    },
    unmatched: {
      type: "array",
      items: {
        type: "object",
        properties: { finding: { type: "string" }, verdict: { type: "string", enum: ["real", "false"] }, why: { type: "string" } },
        required: ["finding", "verdict", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues", "unmatched"],
  additionalProperties: false,
};

export interface JudgeInput { issues: { issue: SeededIssue; candidates: Finding[] }[]; unmatched: Finding[] }
export interface JudgeVerdict {
  issues: Record<string, { findings: string[]; why: string }>;
  unmatched: Record<string, { verdict: "real" | "false"; why: string }>;
  notes: string[];
}
export type JudgeOutcome = { verdict: JudgeVerdict } | { paused: { resetsAt?: number } } | { error: string };
export type JudgeFn = (input: JudgeInput, cwd: string) => Promise<JudgeOutcome>;

/** Grading met the developer's usage limit: the run pauses, and --resume grades the case again. */
export class Paused extends Error {
  resetsAt?: number;
  constructor(resetsAt?: number) {
    super("The usage limit was reached while grading.");
    if (resetsAt) this.resetsAt = resetsAt;
  }
}

const show = (f: Finding) =>
  JSON.stringify({ id: f.id, severity: f.severity, category: f.category, location: f.location, ...(f.locations ? { locations: f.locations } : {}), summary: f.summary, fix: f.fix });

export function judgePrompt(input: JudgeInput, rubric: string = readFileSync(RUBRIC, "utf8")): string {
  const partA = input.issues
    .map(({ issue, candidates }) =>
      [`### ${issue.id} (${issue.categories.join(", ")})`, issue.summary, `Where: ${JSON.stringify(issue.location)}`, "Candidate findings:", ...candidates.map((f) => `- ${show(f)}`)].join("\n"))
    .join("\n\n");
  return [
    "You are grading a design review of the web app in this folder. Follow the rubric below exactly. Read the app's files (its code, design/ and the screenshots in design/shots/) to check claims. Don't change anything.",
    rubric,
    "## Part A: planted problems and the findings that might describe them",
    partA || "(none)",
    "## Part B: critical and major findings that matched no planted problem",
    input.unmatched.map((f) => `- ${show(f)}`).join("\n") || "(none)",
    'Answer with "issues" (one entry per Part A problem: the ids of the candidate findings that describe it, possibly none, and why) and "unmatched" (one entry per Part B finding: "real" or "false", and why).',
  ].join("\n\n");
}

/** Keeps only answers about findings each question offered; whatever wasn't answered is noted (a problem as not found, a finding as false). */
export function readVerdict(structured: unknown, input: JudgeInput): JudgeVerdict {
  const s = (structured ?? {}) as { issues?: any[]; unmatched?: any[] };
  const out: JudgeVerdict = { issues: {}, unmatched: {}, notes: [] };
  for (const { issue, candidates } of input.issues) {
    const answer = (s.issues ?? []).find((a) => a?.issue === issue.id);
    const offered = new Set(candidates.map((f) => f.id));
    if (!answer) out.notes.push(`No answer for ${issue.id}; counted as not found.`);
    const ids = (Array.isArray(answer?.findings) ? answer.findings : []).filter((id: unknown): id is string => typeof id === "string" && offered.has(id));
    out.issues[issue.id] = { findings: ids, why: String(answer?.why ?? "") };
  }
  for (const f of input.unmatched) {
    const answer = (s.unmatched ?? []).find((a) => a?.finding === f.id);
    if (answer?.verdict === "real" || answer?.verdict === "false") {
      out.unmatched[f.id] = { verdict: answer.verdict, why: String(answer.why ?? "") };
    } else {
      out.notes.push(`No verdict for ${f.id}; counted as false.`);
      out.unmatched[f.id] = { verdict: "false", why: "" };
    }
  }
  return out;
}
```

- [ ] **Step 5: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-judge.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/evals/judge.ts tests/evals/rubric.md cli/test/evals-judge.test.ts
git commit -m "feat(evals): test C's model grader with a written rubric and a JSON schema" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Pass or fail — the rules for B, C and D

**Files:**
- Create: `tests/evals/grade.ts`
- Test: `cli/test/evals-grade.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure rules over measured facts).
- Produces:
  - `interface Criterion { id: string; label: string; pass: boolean; detail: string }`; `interface Grade { pass: boolean; criteria: Criterion[]; metrics: Record<string, number | string> }`
  - `type CheckFacts = { violations: number; exceptions: number; warnings: number } | { error: string }`; `type ValidateFacts = { errors: number; warnings: number; missingSections: string[] } | { error: string }`; `interface CmdFacts { code: number; timedOut?: boolean }`
  - `interface BFacts { route; pageExists; check; validate; build; typecheck; newComponents: string[]; recorded: string[] }`; `gradeB(f: BFacts): Grade` — criterion ids `feature`, `check`, `exceptions`, `validate`, `build`, `typecheck`, `components`
  - `interface CFacts { report: { findings: number; problems: string[] } | { error: string }; exact: { found: string[]; missed: string[] }; judgement: { found: string[]; missed: string[] }; serious: number; falseFindings: string[]; changedCode: string[] }`; `gradeC(f: CFacts): Grade` — ids `report`, `exact-recall`, `judgement-recall`, `false-findings`, `report-only`; metrics `exactRecall`, `judgementRecall`, `falseRate` (percent, one decimal)
  - `interface ScreenFacts { route: string; status: number; pageErrors: number }`; `interface DFacts { app: string | null; validate; check; sections: { missing: string[]; empty: string[] }; build; typecheck; screens: ScreenFacts[] | { error: string }; routes: string[]; auditFindings?: number }`; `gradeD(f: DFacts): Grade` — ids `app`, `validate`, `check`, `exceptions`, `sections`, `build`, `typecheck`, `screens`

- [ ] **Step 1: Write the failing test**

`cli/test/evals-grade.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { gradeB, gradeC, gradeD, type BFacts, type CFacts, type DFacts, type Grade, type ScreenFacts } from "../../tests/evals/grade";

const failing = (g: Grade) => g.criteria.filter((c) => !c.pass).map((c) => c.id);

const okB: BFacts = {
  route: "/settings", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
  build: { code: 0 }, typecheck: { code: 0 }, newComponents: [], recorded: [],
};

describe("test B", () => {
  test("passes when everything holds", () => {
    expect(gradeB(okB).pass).toBe(true);
    expect(failing(gradeB(okB))).toEqual([]);
  });

  test("each requirement can fail it", () => {
    expect(failing(gradeB({ ...okB, pageExists: false }))).toEqual(["feature"]);
    expect(failing(gradeB({ ...okB, check: { violations: 1, exceptions: 0, warnings: 0 } }))).toEqual(["check"]);
    expect(failing(gradeB({ ...okB, check: { violations: 0, exceptions: 0, warnings: 1 } }))).toEqual(["check"]);
    expect(failing(gradeB({ ...okB, check: { violations: 0, exceptions: 3, warnings: 0 } }))).toEqual(["exceptions"]);
    expect(failing(gradeB({ ...okB, check: { error: "no-contract" } }))).toEqual(["check"]);
    expect(failing(gradeB({ ...okB, validate: { errors: 1, warnings: 0, missingSections: [] } }))).toEqual(["validate"]);
    expect(failing(gradeB({ ...okB, build: { code: 1 } }))).toEqual(["build"]);
    expect(failing(gradeB({ ...okB, typecheck: { code: 2 } }))).toEqual(["typecheck"]);
  });

  test("two motif-ok exceptions are allowed", () => {
    expect(gradeB({ ...okB, check: { violations: 0, exceptions: 2, warnings: 0 } }).pass).toBe(true);
  });

  test("one new component is fine; more must be recorded in the design guide", () => {
    expect(gradeB({ ...okB, newComponents: ["SettingsRow"] }).pass).toBe(true);
    expect(failing(gradeB({ ...okB, newComponents: ["SettingsRow", "AddressCard"] }))).toEqual(["components"]);
    expect(gradeB({ ...okB, newComponents: ["SettingsRow", "AddressCard"], recorded: ["AddressCard"] }).pass).toBe(true);
  });
});

const okC: CFacts = {
  report: { findings: 30, problems: [] },
  exact: { found: ["S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-10", "S-11", "S-12"], missed: ["S-13"] },
  judgement: { found: ["S-14", "S-15", "S-16", "S-17", "S-18", "S-19", "S-20"], missed: ["S-21", "S-22", "S-23"] },
  serious: 10, falseFindings: ["F-030"], changedCode: [],
};

describe("test C", () => {
  test("passes at the thresholds: 12 of 13 exact (92.3%), 7 of 10 judgement, 1 false in 10 serious", () => {
    expect(gradeC(okC).pass).toBe(true);
    expect(gradeC(okC).metrics).toEqual({ exactRecall: 92.3, judgementRecall: 70, falseRate: 10 });
  });

  test("fails below them", () => {
    expect(failing(gradeC({ ...okC, exact: { found: okC.exact.found.slice(1), missed: ["S-01", "S-13"] } }))).toEqual(["exact-recall"]);
    expect(failing(gradeC({ ...okC, judgement: { found: okC.judgement.found.slice(1), missed: ["S-14", "S-21", "S-22", "S-23"] } }))).toEqual(["judgement-recall"]);
    expect(failing(gradeC({ ...okC, falseFindings: ["F-029", "F-030"] }))).toEqual(["false-findings"]);
  });

  test("no serious findings means none are false", () => {
    expect(failing(gradeC({ ...okC, serious: 0, falseFindings: [] }))).toEqual([]);
  });

  test("changing the app's code, or writing no report, fails it", () => {
    expect(failing(gradeC({ ...okC, changedCode: ["src/app/page.tsx"] }))).toEqual(["report-only"]);
    expect(failing(gradeC({ ...okC, report: { error: "No review report was written." } }))).toEqual(["report"]);
  });
});

const screens: ScreenFacts[] = [{ route: "/", status: 200, pageErrors: 0 }, { route: "/sign-in", status: 200, pageErrors: 0 }, { route: "/home", status: 200, pageErrors: 0 }];
const okD: DFacts = {
  app: "/w/stride", validate: { errors: 0, warnings: 1, missingSections: [] }, check: { violations: 0, exceptions: 1, warnings: 0 },
  sections: { missing: [], empty: [] }, build: { code: 0 }, typecheck: { code: 0 }, screens, routes: ["/", "/sign-in", "/home"], auditFindings: 2,
};

describe("test D", () => {
  test("passes when the new app is complete", () => {
    expect(gradeD(okD).pass).toBe(true);
  });

  test("no app, a broken screen, an empty section or a failed build fails it", () => {
    expect(failing(gradeD({ ...okD, app: null }))).toEqual(["app"]);
    expect(failing(gradeD({ ...okD, screens: [screens[0]!, { route: "/sign-in", status: 500, pageErrors: 0 }] }))).toEqual(["screens"]);
    expect(failing(gradeD({ ...okD, screens: screens.map((s) => ({ ...s, pageErrors: s.route === "/home" ? 1 : 0 })) }))).toEqual(["screens"]);
    expect(failing(gradeD({ ...okD, screens: { error: "needs-browser" } }))).toEqual(["screens"]);
    expect(failing(gradeD({ ...okD, sections: { missing: [], empty: ["Patterns"] } }))).toEqual(["sections"]);
    expect(failing(gradeD({ ...okD, validate: { errors: 1, warnings: 0, missingSections: ['Your design guide is missing the "Motion" section.'] } }))).toEqual(["validate"]);
    expect(failing(gradeD({ ...okD, build: { code: 1, timedOut: true } }))).toEqual(["build"]);
  });

  test("says which screens didn't render, and why", () => {
    const g = gradeD({ ...okD, screens: [screens[0]!, { route: "/sign-in", status: 500, pageErrors: 0 }] });
    expect(g.criteria.find((c) => c.id === "screens")!.detail).toContain("/sign-in (status 500)");
    expect(g.criteria.find((c) => c.id === "screens")!.detail).toContain("/home (not captured)");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-grade.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/grade'`.

- [ ] **Step 3: Write `tests/evals/grade.ts`**

```ts
// Pass or fail for each case, criterion by criterion, with the spec's thresholds (§13.2).

export interface Criterion { id: string; label: string; pass: boolean; detail: string }
export interface Grade { pass: boolean; criteria: Criterion[]; metrics: Record<string, number | string> }

export type CheckFacts = { violations: number; exceptions: number; warnings: number } | { error: string };
export type ValidateFacts = { errors: number; warnings: number; missingSections: string[] } | { error: string };
export interface CmdFacts { code: number; timedOut?: boolean }

const MAX_EXCEPTIONS = 2;

const grade = (criteria: Criterion[], metrics: Grade["metrics"] = {}): Grade => ({ pass: criteria.every((c) => c.pass), criteria, metrics });
const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 1000) / 10);
const ran = (c: CmdFacts, what: string) => (c.code === 0 ? `${what} passed.` : c.timedOut ? `${what} ran out of time.` : `${what} failed (exit code ${c.code}).`);
const missedText = (missed: string[]) => (missed.length ? `; missed ${missed.join(", ")}` : "");

function checkCriteria(check: CheckFacts): Criterion[] {
  if ("error" in check) return [{ id: "check", label: "motif check finds nothing", pass: false, detail: `motif check couldn't run: ${check.error}` }];
  return [
    { id: "check", label: "motif check finds nothing", pass: check.violations === 0 && check.warnings === 0, detail: `${check.violations} problems, ${check.warnings} warnings.` },
    { id: "exceptions", label: `At most ${MAX_EXCEPTIONS} motif-ok exceptions`, pass: check.exceptions <= MAX_EXCEPTIONS, detail: `${check.exceptions} exceptions.` },
  ];
}

function validateCriterion(v: ValidateFacts): Criterion {
  return "error" in v
    ? { id: "validate", label: "The design guide is valid", pass: false, detail: `motif validate couldn't run: ${v.error}` }
    : { id: "validate", label: "The design guide is valid", pass: v.errors === 0, detail: `${v.errors} problems, ${v.warnings} suggestions.` };
}

const buildCriteria = (build: CmdFacts, typecheck: CmdFacts): Criterion[] => [
  { id: "build", label: "The app builds", pass: build.code === 0, detail: ran(build, "The build") },
  { id: "typecheck", label: "The app type-checks", pass: typecheck.code === 0, detail: ran(typecheck, "The type check") },
];

export interface BFacts {
  route: string; pageExists: boolean; check: CheckFacts; validate: ValidateFacts; build: CmdFacts; typecheck: CmdFacts;
  /** Component files the session added under src/components/. */
  newComponents: string[];
  /** Those named in lines the session added to DESIGN.md (a recorded design guide change). */
  recorded: string[];
}

export function gradeB(f: BFacts): Grade {
  const unrecorded = f.newComponents.filter((c) => !f.recorded.includes(c));
  const recorded = f.newComponents.filter((c) => f.recorded.includes(c));
  return grade([
    { id: "feature", label: `The feature's page exists (${f.route})`, pass: f.pageExists, detail: f.pageExists ? `${f.route} is a page of the app.` : `There's no page at ${f.route}.` },
    ...checkCriteria(f.check),
    validateCriterion(f.validate),
    ...buildCriteria(f.build, f.typecheck),
    {
      id: "components", label: "At most one new component, unless recorded in the design guide", pass: unrecorded.length <= 1,
      detail: f.newComponents.length === 0 ? "No new components." : `New: ${f.newComponents.join(", ")}${recorded.length ? ` (recorded in DESIGN.md: ${recorded.join(", ")})` : ""}.`,
    },
  ], { newComponents: f.newComponents.length });
}

export interface CFacts {
  report: { findings: number; problems: string[] } | { error: string };
  exact: { found: string[]; missed: string[] };
  judgement: { found: string[]; missed: string[] };
  /** Critical and major findings in the report. */
  serious: number;
  falseFindings: string[];
  /** Files outside design/ the review changed. */
  changedCode: string[];
}

export function gradeC(f: CFacts): Grade {
  const exactOf = f.exact.found.length + f.exact.missed.length;
  const judgementOf = f.judgement.found.length + f.judgement.missed.length;
  const exactRecall = pct(f.exact.found.length, exactOf);
  const judgementRecall = pct(f.judgement.found.length, judgementOf);
  const falseRate = pct(f.falseFindings.length, f.serious);
  const report: Criterion = "error" in f.report
    ? { id: "report", label: "A review report was written", pass: false, detail: f.report.error }
    : { id: "report", label: "A review report was written", pass: true, detail: `${f.report.findings} findings${f.report.problems.length ? `; left out (not in the review format): ${f.report.problems.join("; ")}` : ""}.` };
  return grade([
    report,
    { id: "exact-recall", label: "Finds at least 90% of the exact problems", pass: exactRecall >= 90, detail: `${f.exact.found.length} of ${exactOf} (${exactRecall}%)${missedText(f.exact.missed)}.` },
    { id: "judgement-recall", label: "Finds at least 70% of the judgement problems", pass: judgementRecall >= 70, detail: `${f.judgement.found.length} of ${judgementOf} (${judgementRecall}%)${missedText(f.judgement.missed)}.` },
    { id: "false-findings", label: "At most 10% of critical and major findings are false", pass: falseRate <= 10, detail: `${f.falseFindings.length} of ${f.serious} (${falseRate}%)${f.falseFindings.length ? `: ${f.falseFindings.join(", ")}` : ""}.` },
    { id: "report-only", label: "The app's code wasn't changed", pass: f.changedCode.length === 0, detail: f.changedCode.length ? `Changed: ${f.changedCode.join(", ")}.` : "Only design/ changed." },
  ], { exactRecall, judgementRecall, falseRate });
}

export interface ScreenFacts { route: string; status: number; pageErrors: number }

export interface DFacts {
  app: string | null; validate: ValidateFacts; check: CheckFacts; sections: { missing: string[]; empty: string[] };
  build: CmdFacts; typecheck: CmdFacts; screens: ScreenFacts[] | { error: string }; routes: string[]; auditFindings?: number;
}

export function gradeD(f: DFacts): Grade {
  if (!f.app) return grade([{ id: "app", label: "The new app exists", pass: false, detail: "No folder with a DESIGN.md was found." }]);
  const shown = "error" in f.screens ? [] : f.screens;
  const bad = f.routes.flatMap((route) => {
    const s = shown.find((x) => x.route === route);
    if (!s) return [`${route} (not captured)`];
    if (s.status !== 200 || s.pageErrors > 0) return [`${route} (status ${s.status}${s.pageErrors ? `, ${s.pageErrors} page errors` : ""})`];
    return [];
  });
  const gaps = [f.sections.missing.length ? `missing: ${f.sections.missing.join(", ")}` : "", f.sections.empty.length ? `empty: ${f.sections.empty.join(", ")}` : ""].filter(Boolean);
  return grade([
    { id: "app", label: "The new app exists", pass: true, detail: f.app },
    validateCriterion(f.validate),
    ...checkCriteria(f.check),
    { id: "sections", label: "DESIGN.md has every section, each filled in", pass: gaps.length === 0, detail: gaps.length ? `${gaps.join("; ")}.` : "All sections are there." },
    ...buildCriteria(f.build, f.typecheck),
    {
      id: "screens", label: `The starter screens render (${f.routes.join(", ")})`, pass: !("error" in f.screens) && bad.length === 0,
      detail: "error" in f.screens ? `motif shot couldn't run: ${f.screens.error}` : bad.length ? `Didn't render: ${bad.join(", ")}.` : "All rendered.",
    },
  ], f.auditFindings !== undefined ? { auditFindings: f.auditFindings } : {});
}
```

- [ ] **Step 4: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-grade.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/evals/grade.ts cli/test/evals-grade.test.ts
git commit -m "feat(evals): pass/fail rules for tests B, C and D with the spec's thresholds" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Measuring a finished case

**Files:**
- Create: `tests/evals/collect.ts`
- Test: `cli/test/evals-collect.test.ts`

**Interfaces:**
- Consumes: `EvalCase` (Task 3); `Run`, `Motif`, `MotifResult`, `packageManager`, `runCmd` (Task 3); `Workspace`, `changes`, `patch`, `findApp`, `prepareWorkspace` (Task 4); `parseReport`, `gradeExact`, `SeededIssue` (Task 5); `JudgeFn`, `JudgeInput`, `JudgeVerdict`, `Paused` (Task 6); `gradeB`, `gradeC`, `gradeD`, the facts types (Task 7); `REQUIRED_SECTIONS` (`cli/src/contract/design-md.ts`); `discoverRoutes` (`cli/src/stacks/react-web/routes.ts`).
- Produces:
  - `interface Collectors { run: Run; motif: Motif; judge: JudgeFn }`
  - `designSections(md: string): { missing: string[]; empty: string[] }`
  - `collectB(c, ws, k, out): Promise<BFacts>`; `collectC(c, ws, k, out): Promise<CFacts>` (throws `Paused`, or `Error` when the grader fails); `collectD(c, ws, k, out): Promise<DFacts>`
  - `collectAndGrade(c: EvalCase, ws: Workspace, out: string, k: Collectors): Promise<Grade>`
  - Files written to the case's results folder `out`: B — `check.json`, `validate.json`, `diff.patch`, `build.log`, `typecheck.log`; C — `diff.patch`, `review.json`, `review.md`, `audit.json` (when present), `grading.json`; D — `DESIGN.md`, `tokens.json`, `validate.json`, `check.json`, `build.log`, `typecheck.log`, `shot.json`, `shots/*.png`, `install.log` (when it installed).

- [ ] **Step 1: Write the failing test**

`cli/test/evals-collect.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import { collectB, collectC, collectD, designSections } from "../../tests/evals/collect";
import { Paused, type JudgeFn } from "../../tests/evals/judge";
import type { SeededIssue } from "../../tests/evals/match";
import { runCmd, type MotifResult, type Run } from "../../tests/evals/tools";
import { prepareWorkspace } from "../../tests/evals/workspace";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const byId = (id: string) => CASES.find((c) => c.id === id)!;
const commands: string[][] = [];
// Real git; installs, builds and type checks are stubbed (exit 0) and recorded.
const run: Run = async (cmd, cwd, t, env) => {
  if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
  commands.push(cmd);
  return { code: 0, stdout: "ok", stderr: "", timedOut: false };
};
const outputs: Record<string, any> = {
  check: { command: "check", ok: true, exitCode: 0, summary: { files: 40, violations: 0, exceptions: 1, warnings: 0 } },
  validate: { command: "validate", ok: true, exitCode: 0, findings: [], summary: { errors: 0, warnings: 0 } },
  shot: {
    command: "shot", ok: false, exitCode: 1, shots: [], findings: [{ id: "F-001" }],
    routes: [{ route: "/", status: 200, shots: [] }, { route: "/sign-in", status: 200, shots: [] }, { route: "/home", status: 200, pageErrors: ["TypeError: x"], shots: [] }],
  },
};
const motif = async (args: string[]): Promise<MotifResult> => ({ code: 0, json: outputs[args[0]!], output: "" });
const noJudge: JudgeFn = async () => ({ error: "the grader wasn't expected here" });

describe("DESIGN.md's sections", () => {
  const ALL = ["1. Brief", "2. Direction", "3. Foundations", "4. Motion", "5. Components", "6. Patterns", "7. Accessibility", "8. Platform notes", "9. Do / Don't", "10. Change log"];
  const md = (body: Record<string, string>) => ["---", "motifContract: 1", "---", "", "Summary.", "", ...Object.entries(body).flatMap(([h, t]) => [`## ${h}`, "", t, ""])].join("\n");

  test("all there and filled in", () => {
    expect(designSections(md(Object.fromEntries(ALL.map((h) => [h, "Text."]))))).toEqual({ missing: [], empty: [] });
  });

  test("missing and empty ones are named; a comment or sub-heading alone is empty", () => {
    const body = Object.fromEntries(ALL.filter((h) => h !== "6. Patterns").map((h) => [h, "Text."]));
    body["4. Motion"] = "<!-- Fill this in -->\n### Springs";
    expect(designSections(md(body))).toEqual({ missing: ["Patterns"], empty: ["Motion"] });
  });

  test("the contract fixture's guide is complete", () => {
    expect(designSections(readFileSync(join(REPO, "tests/fixtures/react-contract-app/DESIGN.md"), "utf8"))).toEqual({ missing: [], empty: [] });
  });
});

describe("test B's measurements", () => {
  test("the page, new components (and which the design guide records), check, validate, build and type check", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-col-"), "b"), run);
    mkdirSync(join(ws.app, "src/app/settings"), { recursive: true });
    writeFileSync(join(ws.app, "src/app/settings/page.tsx"), "export default function Settings() { return null; }\n");
    writeFileSync(join(ws.app, "src/components/SettingsRow.tsx"), "export function SettingsRow() { return null; }\n");
    writeFileSync(join(ws.app, "src/components/AddressCard.tsx"), "export function AddressCard() { return null; }\n");
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-14 — Added AddressCard for saved addresses — approved by the eval\n`);
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-settings"), ws, { run, motif, judge: noJudge }, out);
    expect(f).toMatchObject({ route: "/settings", pageExists: true, check: { violations: 0, exceptions: 1, warnings: 0 }, validate: { errors: 0 }, build: { code: 0 }, typecheck: { code: 0 } });
    expect([...f.newComponents].sort()).toEqual(["AddressCard", "SettingsRow"]);
    expect(f.recorded).toEqual(["AddressCard"]);
    expect(commands.some((c) => c.join(" ") === "npm run build")).toBe(true);
    expect(commands.some((c) => c.join(" ") === "npx --no tsc --noEmit")).toBe(true);
    for (const file of ["check.json", "validate.json", "diff.patch", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("no page at the feature's route", async () => {
    const ws = await prepareWorkspace(byId("b-search"), join(tempDir("motif-col-"), "b2"), run);
    expect((await collectB(byId("b-search"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("test C's measurements", () => {
  const seeded: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/react-seeded-app/seeded-issues.json"), "utf8")).issues;
  const perfect = seeded.map((i, n) => ({
    id: `F-${String(n + 1).padStart(3, "0")}`, severity: i.severity, category: i.categories[0], source: i.kind,
    location: i.location.app ? { screen: "/" } : i.location, summary: i.summary, fix: "Fix it.",
  }));
  const writeReport = (app: string, findings: unknown[]) => {
    mkdirSync(join(app, "design/reviews"), { recursive: true });
    writeFileSync(join(app, "design/reviews/2026-10-14-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-14", findings }));
    writeFileSync(join(app, "design/reviews/2026-10-14-whole-app.md"), "# Review\n");
  };
  const confirmAll: JudgeFn = async (input) => ({
    verdict: {
      issues: Object.fromEntries(input.issues.map((x) => [x.issue.id, { findings: x.candidates.map((f) => f.id), why: "" }])),
      unmatched: Object.fromEntries(input.unmatched.map((f) => [f.id, { verdict: "real" as const, why: "" }])),
      notes: [],
    },
  });

  test("a review that reports every planted problem finds them all, with nothing false", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c"), run);
    writeReport(ws.app, perfect);
    const out = join(ws.dir, "results");
    const f = await collectC(byId("c-review"), ws, { run, motif, judge: confirmAll }, out);
    expect(f.exact.missed).toEqual([]);
    expect(f.judgement.missed).toEqual([]);
    expect(f.falseFindings).toEqual([]);
    expect(f.changedCode).toEqual([]);
    expect(f.report).toEqual({ findings: seeded.length, problems: [] });
    for (const file of ["review.json", "review.md", "grading.json", "diff.patch"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("a finding the grader calls false counts, and changes to the code are listed", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c2"), run);
    writeReport(ws.app, [...perfect, { id: "F-999", severity: "critical", category: "navigation", source: "judgement", location: { screen: "/settings" }, summary: "Settings can't be reached.", fix: "Add it." }]);
    writeFileSync(join(ws.app, "src/app/page.tsx"), "export default function Home() { return null; }\n");
    const judge: JudgeFn = async (input) => {
      const r = await confirmAll(input);
      if ("verdict" in r) r.verdict.unmatched["F-999"] = { verdict: "false", why: "There's no settings page in this app." };
      return r;
    };
    const f = await collectC(byId("c-review"), ws, { run, motif, judge }, join(ws.dir, "results"));
    expect(f.falseFindings).toEqual(["F-999"]);
    expect(f.changedCode).toEqual(["src/app/page.tsx"]);
  });

  test("no report: everything missed", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c3"), run);
    const f = await collectC(byId("c-review"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.report).toEqual({ error: expect.stringContaining("No review report") });
    expect(f.exact.found).toEqual([]);
    expect(f.judgement.missed).toHaveLength(10);
  });

  test("the grader meeting the usage limit pauses grading; a grader that fails is an error", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c4"), run);
    writeReport(ws.app, perfect);
    const out = join(ws.dir, "results");
    await expect(collectC(byId("c-review"), ws, { run, motif, judge: async () => ({ paused: { resetsAt: 1 } }) }, out)).rejects.toBeInstanceOf(Paused);
    await expect(collectC(byId("c-review"), ws, { run, motif, judge: async () => ({ error: "timed out" }) }, out)).rejects.toThrow("timed out");
  });
});

describe("test D's measurements", () => {
  test("finds the new app and measures it, screens included", async () => {
    const ws = await prepareWorkspace(byId("d-stride"), join(tempDir("motif-col-"), "d"), run);
    const app = join(ws.app, "stride");
    mkdirSync(join(app, "node_modules"), { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/react-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const out = join(ws.dir, "results");
    const before = commands.length;
    const f = await collectD(byId("d-stride"), ws, { run, motif, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.sections).toEqual({ missing: [], empty: [] });
    expect(f.screens).toEqual([{ route: "/", status: 200, pageErrors: 0 }, { route: "/sign-in", status: 200, pageErrors: 0 }, { route: "/home", status: 200, pageErrors: 1 }]);
    expect(f.auditFindings).toBe(1);
    expect(commands.slice(before).some((c) => c[1] === "install")).toBe(false); // its packages were installed
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("installs the packages when the session didn't", async () => {
    const ws = await prepareWorkspace(byId("d-ledgerly"), join(tempDir("motif-col-"), "d3"), run);
    writeFileSync(join(ws.app, "DESIGN.md"), "");
    const before = commands.length;
    await collectD(byId("d-ledgerly"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(commands.slice(before)).toContainEqual(["npm", "install"]);
  });

  test("no app found", async () => {
    const ws = await prepareWorkspace(byId("d-bloom"), join(tempDir("motif-col-"), "d2"), run);
    expect((await collectD(byId("d-bloom"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).app).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-collect.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/collect'`.

- [ ] **Step 3: Write `tests/evals/collect.ts`**

```ts
// Measures what a finished case left behind: the motif tool's checks, the build and the type check, what the session changed,
// and for test C the review report, graded against the seeded list (match.ts) and by the model grader (judge.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { REQUIRED_SECTIONS } from "../../cli/src/contract/design-md";
import { discoverRoutes } from "../../cli/src/stacks/react-web/routes";
import type { EvalCase } from "./cases";
import { gradeB, gradeC, gradeD, type BFacts, type CFacts, type CheckFacts, type CmdFacts, type DFacts, type Grade, type ValidateFacts } from "./grade";
import { Paused, type JudgeFn, type JudgeInput, type JudgeVerdict } from "./judge";
import { gradeExact, parseReport, type SeededIssue } from "./match";
import { packageManager, type Motif, type MotifResult, type Run } from "./tools";
import { changes, findApp, patch, type Workspace } from "./workspace";

export interface Collectors { run: Run; motif: Motif; judge: JudgeFn }

const SEEDED = join(import.meta.dir, "..", "fixtures", "react-seeded-app", "seeded-issues.json");

const save = (out: string, name: string, data: unknown) => writeFileSync(join(out, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));

const checkFacts = (r: MotifResult): CheckFacts =>
  r.json?.summary ? { violations: r.json.summary.violations, exceptions: r.json.summary.exceptions, warnings: r.json.summary.warnings } : { error: String(r.json?.error ?? r.output) };

const validateFacts = (r: MotifResult): ValidateFacts =>
  r.json?.summary
    ? { errors: r.json.summary.errors, warnings: r.json.summary.warnings, missingSections: (r.json.findings ?? []).filter((x: any) => x.code === "missing-section").map((x: any) => String(x.message)) }
    : { error: String(r.json?.error ?? r.output) };

async function motifJson(k: Collectors, args: string[], cwd: string, out: string, name: string, timeoutMs?: number): Promise<MotifResult> {
  const r = await k.motif(args, cwd, timeoutMs);
  save(out, name, r.json ?? { output: r.output });
  return r;
}

async function buildAndTypecheck(dir: string, k: Collectors, out: string): Promise<{ build: CmdFacts; typecheck: CmdFacts }> {
  const build = await k.run([packageManager(dir), "run", "build"], dir, 900_000);
  save(out, "build.log", `${build.stdout}\n${build.stderr}`);
  const typecheck = await k.run(["npx", "--no", "tsc", "--noEmit"], dir, 600_000);
  save(out, "typecheck.log", `${typecheck.stdout}\n${typecheck.stderr}`);
  return { build: { code: build.code, timedOut: build.timedOut }, typecheck: { code: typecheck.code, timedOut: typecheck.timedOut } };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function collectB(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<BFacts> {
  mkdirSync(out, { recursive: true });
  const route = c.routes[0]!;
  // What changed is read before the build, which may touch files of its own.
  const changed = await changes(ws, k.run);
  save(out, "diff.patch", await patch(ws, k.run));
  const newComponents = changed
    .filter((x) => x.status === "added" && /^src\/components\/.+\.(tsx|jsx)$/.test(x.path))
    .map((x) => basename(x.path, extname(x.path)));
  const added = (await patch(ws, k.run, ["DESIGN.md"])).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  const recorded = newComponents.filter((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`).test(added));
  const check = await motifJson(k, ["check"], ws.app, out, "check.json");
  const validate = await motifJson(k, ["validate"], ws.app, out, "validate.json");
  const { build, typecheck } = await buildAndTypecheck(ws.app, k, out);
  return {
    route, pageExists: discoverRoutes(ws.app).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
    build, typecheck, newComponents, recorded,
  };
}

function newestReport(app: string): string | null {
  const dir = join(app, "design", "reviews");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** What a report-only review may change: its report, screenshots and notes in design/, and files agents keep for themselves. */
const reviewMayChange = (path: string) => path.startsWith("design/") || path.startsWith(".claude/") || path === "AGENTS.md" || path === "CLAUDE.md";

export async function collectC(_c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<CFacts> {
  mkdirSync(out, { recursive: true });
  const issues: SeededIssue[] = JSON.parse(readFileSync(SEEDED, "utf8")).issues;
  const exactIds = issues.filter((i) => i.kind === "exact").map((i) => i.id);
  const judgementIds = issues.filter((i) => i.kind === "judgement").map((i) => i.id);
  const changed = await changes(ws, k.run);
  save(out, "diff.patch", await patch(ws, k.run));
  const changedCode = changed.map((x) => x.path).filter((p) => !reviewMayChange(p));

  const file = newestReport(ws.app);
  if (!file) {
    return {
      report: { error: "No review report was written (design/reviews/*.json)." },
      exact: { found: [], missed: exactIds }, judgement: { found: [], missed: judgementIds }, serious: 0, falseFindings: [], changedCode,
    };
  }
  for (const ext of [".json", ".md"]) {
    const f = file.replace(/\.json$/, ext);
    if (existsSync(f)) copyFileSync(f, join(out, `review${ext}`));
  }
  const audit = join(ws.app, "design", "shots", "audit.json");
  if (existsSync(audit)) copyFileSync(audit, join(out, "audit.json"));

  const { findings, problems } = parseReport(readFileSync(file, "utf8"));
  const lineText = (path: string, line: number) => {
    try {
      return readFileSync(join(ws.app, path), "utf8").split(/\r?\n/)[line - 1];
    } catch {
      return undefined;
    }
  };
  const g = gradeExact(findings, issues, lineText, ws.app);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const input: JudgeInput = {
    issues: g.candidates.filter((x) => x.findings.length > 0).map((x) => ({ issue: issues.find((i) => i.id === x.id)!, candidates: x.findings.map((id) => byId.get(id)!) })),
    unmatched: g.unmatchedSerious.map((id) => byId.get(id)!),
  };
  let verdict: JudgeVerdict = { issues: {}, unmatched: {}, notes: [] };
  if (input.issues.length + input.unmatched.length > 0) {
    const r = await k.judge(input, ws.app);
    if ("paused" in r) throw new Paused(r.paused.resetsAt);
    if ("error" in r) throw new Error(`The grader couldn't finish: ${r.error}`);
    verdict = r.verdict;
  }
  const confirmed = new Set(Object.values(verdict.issues).flatMap((v) => v.findings));
  const judgementFound = judgementIds.filter((id) => (verdict.issues[id]?.findings.length ?? 0) > 0);
  const falseFindings = g.unmatchedSerious.filter((id) => !confirmed.has(id) && verdict.unmatched[id]?.verdict !== "real");
  save(out, "grading.json", { ...g, judge: verdict });
  return {
    report: { findings: findings.length, problems },
    exact: { found: g.exact.filter((e) => e.findings.length > 0).map((e) => e.id), missed: g.exact.filter((e) => e.findings.length === 0).map((e) => e.id) },
    judgement: { found: judgementFound, missed: judgementIds.filter((id) => !judgementFound.includes(id)) },
    serious: findings.filter((f) => f.severity === "critical" || f.severity === "major").length,
    falseFindings,
    changedCode,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

/** Which of DESIGN.md's sections are missing, and which hold nothing but comments or sub-headings. */
export function designSections(md: string): { missing: string[]; empty: string[] } {
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n").split("\n");
  const heads = lines.flatMap((l, i) => {
    const m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*#*\s*$/);
    return m ? [{ i, name: norm(m[1]!) }] : [];
  });
  const missing: string[] = [];
  const empty: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const at = heads.findIndex((h) => h.name === norm(section));
    if (at === -1) {
      missing.push(section);
      continue;
    }
    const body = lines.slice(heads[at]!.i + 1, heads[at + 1]?.i ?? lines.length).filter((l) => l.trim() !== "" && !/^#{1,6}\s/.test(l));
    if (body.length === 0) empty.push(section);
  }
  return { missing, empty };
}

function copyShots(app: string, json: any, dest: string): void {
  const shots: unknown[] = Array.isArray(json?.shots) ? json.shots : [];
  for (const s of shots) {
    if (typeof s !== "string" || !existsSync(join(app, s))) continue;
    mkdirSync(dest, { recursive: true });
    copyFileSync(join(app, s), join(dest, basename(s)));
  }
}

export async function collectD(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<DFacts> {
  mkdirSync(out, { recursive: true });
  const app = findApp(ws.app);
  if (!app) {
    const none = { error: "no app" };
    return { app: null, validate: none, check: none, sections: { missing: [...REQUIRED_SECTIONS], empty: [] }, build: { code: 1 }, typecheck: { code: 1 }, screens: none, routes: c.routes };
  }
  for (const f of ["DESIGN.md", "design/tokens.json"]) if (existsSync(join(app, f))) copyFileSync(join(app, f), join(out, basename(f)));
  if (!existsSync(join(app, "node_modules"))) {
    const r = await k.run([packageManager(app), "install"], app, 900_000);
    save(out, "install.log", `${r.stdout}\n${r.stderr}`);
  }
  const validate = await motifJson(k, ["validate"], app, out, "validate.json");
  const check = await motifJson(k, ["check"], app, out, "check.json");
  const sections = designSections(existsSync(join(app, "DESIGN.md")) ? readFileSync(join(app, "DESIGN.md"), "utf8") : "");
  const { build, typecheck } = await buildAndTypecheck(app, k, out);
  const shot = await motifJson(k, ["shot", "--audit", "--routes", c.routes.join(",")], app, out, "shot.json", 900_000);
  copyShots(app, shot.json, join(out, "shots"));
  const screens = Array.isArray(shot.json?.routes)
    ? shot.json.routes.map((r: any) => ({ route: String(r.route), status: Number(r.status ?? 0), pageErrors: Array.isArray(r.pageErrors) ? r.pageErrors.length : 0 }))
    : { error: String(shot.json?.error ?? shot.output) };
  return {
    app, validate: validateFacts(validate), check: checkFacts(check), sections, build, typecheck, screens, routes: c.routes,
    ...(Array.isArray(shot.json?.findings) ? { auditFindings: shot.json.findings.length } : {}),
  };
}

export async function collectAndGrade(c: EvalCase, ws: Workspace, out: string, k: Collectors): Promise<Grade> {
  if (c.test === "B") return gradeB(await collectB(c, ws, k, out));
  if (c.test === "C") return gradeC(await collectC(c, ws, k, out));
  return gradeD(await collectD(c, ws, k, out));
}
```

- [ ] **Step 4: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-collect.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/evals/collect.ts cli/test/evals-collect.test.ts
git commit -m "feat(evals): measure a finished case and grade it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The run's record and its report

**Files:**
- Create: `tests/evals/state.ts`
- Create: `tests/evals/report.ts`
- Test: `cli/test/evals-state.test.ts`

**Interfaces:**
- Consumes: `Grade` (Task 7); `Workspace` (Task 4); `EvalCase`, `TestId`, `CASES` (Task 3).
- Produces:
  - `type CaseStatus = "pending" | "session-done" | "graded" | "interrupted" | "error"`
  - `interface SessionSummary { end: string; model: string; turns: number; minutes: number; costUsd: number; denials: string[]; problems: string[] }`
  - `interface CaseState { status: CaseStatus; attempts: number; workspace?: Workspace; session?: SessionSummary; grade?: Grade; note?: string }`
  - `interface RunOptions { model?: string; judgeModel?: string; keep: boolean; maxTurns?: number; work: string }`
  - `interface RunState { motifEvalRun: 1; id: string; commit: string; dirty: boolean; started: string; claudeVersion: string; resumes: { at: string; commit: string; dirty: boolean }[]; options: RunOptions; cases: Record<string, CaseState> }`
  - `newRunId(d: Date): string`; `runDir(results, id): string`; `saveRun(results, state): void`; `loadRun(results, id): RunState | { error: string }`; `remaining(state): string[]`; `gitState(repo: string): { commit: string; dirty: boolean }`
  - `interface TestVerdict { test: TestId; status: "pass" | "fail" | "incomplete"; detail: string }`; `TEST_NAMES`; `testVerdicts(state, cases): TestVerdict[]` (always `[B, C, D]`); `renderReport(state, cases, verdicts): string`

- [ ] **Step 1: Write the failing test**

`cli/test/evals-state.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { CASES } from "../../tests/evals/cases";
import type { Grade } from "../../tests/evals/grade";
import { renderReport, testVerdicts } from "../../tests/evals/report";
import { loadRun, newRunId, remaining, saveRun, type CaseState, type RunState } from "../../tests/evals/state";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const pass: Grade = { pass: true, criteria: [{ id: "build", label: "The app builds", pass: true, detail: "The build passed." }], metrics: {} };
const fail: Grade = { pass: false, criteria: [{ id: "check", label: "motif check finds nothing", pass: false, detail: "2 problems | 0 warnings." }], metrics: {} };
const state = (cases: Record<string, CaseState>): RunState => ({
  motifEvalRun: 1, id: "20261014-120000", commit: "369b8d8aaaaaaaaaaaaaaa", dirty: false, started: "2026-10-14T12:00:00.000Z",
  claudeVersion: "2.1.289 (Claude Code)", resumes: [], options: { keep: false, work: "/tmp/w" }, cases,
});
const allGraded = (grade: Grade, ids = CASES.map((c) => c.id)) => Object.fromEntries(ids.map((id) => [id, { status: "graded" as const, attempts: 1, grade }]));

describe("a run's record", () => {
  test("run ids sort by time", () => {
    expect(newRunId(new Date(2026, 9, 14, 9, 5, 7))).toBe("20261014-090507");
  });

  test("saves and loads", () => {
    const dir = tempDir("motif-runs-");
    const s = state({ "b-settings": { status: "pending", attempts: 0 } });
    saveRun(dir, s);
    expect(loadRun(dir, s.id)).toEqual(s);
  });

  test("an unknown or odd run id is refused", () => {
    const dir = tempDir("motif-runs-");
    expect(loadRun(dir, "nope")).toEqual({ error: expect.stringContaining('"nope"') });
    expect(loadRun(dir, "../x")).toEqual({ error: expect.any(String) });
  });

  test("what's left is everything not graded, in order", () => {
    expect(remaining(state({
      a: { status: "graded", attempts: 1 }, b: { status: "interrupted", attempts: 1 }, c: { status: "session-done", attempts: 1 },
      d: { status: "pending", attempts: 0 }, e: { status: "error", attempts: 1 },
    }))).toEqual(["b", "c", "d", "e"]);
  });
});

describe("the verdicts", () => {
  test("every case passing passes all three tests", () => {
    expect(testVerdicts(state(allGraded(pass)), CASES).map((v) => v.status)).toEqual(["pass", "pass", "pass"]);
  });

  test("a failing B case fails B, and D with it (D needs B and C with no MCP servers)", () => {
    const s = state({ ...allGraded(pass), "b-search": { status: "graded", attempts: 1, grade: fail } });
    expect(testVerdicts(s, CASES).map((v) => v.status)).toEqual(["fail", "pass", "fail"]);
  });

  test("cases not run leave their tests incomplete", () => {
    expect(testVerdicts(state(allGraded(pass, ["c-review"])), CASES).map((v) => v.status)).toEqual(["incomplete", "pass", "incomplete"]);
  });
});

describe("the report", () => {
  test("shows the verdicts, each case's criteria and session, and what wasn't graded", () => {
    const s = state({
      "b-settings": { status: "graded", attempts: 1, grade: fail, session: { end: "finished", model: "m", turns: 40, minutes: 12.5, costUsd: 3.2, denials: ['Bash: {"command":"rm -rf .."}'], problems: [] } },
      "c-review": { status: "interrupted", attempts: 1, note: "Usage limit reached." },
    });
    s.resumes.push({ at: "2026-10-15T08:00:00.000Z", commit: "def4567890abcdef", dirty: true });
    const md = renderReport(s, CASES, testVerdicts(s, CASES));
    for (const t of ["Test B — consistency: FAIL", "✗", "2 problems \\| 0 warnings.", "Not graded (interrupted)", "Usage limit reached.", "Refused by auto mode", "40 turns", "def4567890ab"]) {
      expect(md).toContain(t);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/evals-state.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/report'`.

- [ ] **Step 3: Write `tests/evals/state.ts`**

```ts
// A run's record in tests/evals/results/<id>/run.json: every case's progress, so a run stopped by a usage limit or Ctrl+C
// continues where it left off (--resume <id>).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Grade } from "./grade";
import type { Workspace } from "./workspace";

export type CaseStatus = "pending" | "session-done" | "graded" | "interrupted" | "error";

export interface SessionSummary { end: string; model: string; turns: number; minutes: number; costUsd: number; denials: string[]; problems: string[] }

export interface CaseState { status: CaseStatus; attempts: number; workspace?: Workspace; session?: SessionSummary; grade?: Grade; note?: string }

export interface RunOptions { model?: string; judgeModel?: string; keep: boolean; maxTurns?: number; work: string }

export interface RunState {
  motifEvalRun: 1;
  id: string;
  commit: string;
  dirty: boolean;
  started: string;
  claudeVersion: string;
  /** Resumes on another commit, or with uncommitted changes, so the report says the cases ran on different code. */
  resumes: { at: string; commit: string; dirty: boolean }[];
  options: RunOptions;
  cases: Record<string, CaseState>;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const newRunId = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const runDir = (results: string, id: string) => join(results, id);

export function saveRun(results: string, state: RunState): void {
  const dir = runDir(results, state.id);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "run.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function loadRun(results: string, id: string): RunState | { error: string } {
  const file = join(runDir(results, id), "run.json");
  if (!/^[\w-]+$/.test(id) || !existsSync(file)) return { error: `There's no run "${id}" in ${results}.` };
  try {
    const state = JSON.parse(readFileSync(file, "utf8"));
    if (state?.motifEvalRun !== 1) return { error: `${file} isn't a run this version of the runner understands.` };
    return state as RunState;
  } catch (e) {
    return { error: `${file} can't be read: ${(e as Error).message}` };
  }
}

/** The cases still to do, in order: everything not yet graded. */
export const remaining = (state: RunState): string[] => Object.entries(state.cases).filter(([, c]) => c.status !== "graded").map(([id]) => id);

/** The checkout's commit, and whether tracked files have uncommitted changes. */
export function gitState(repo: string): { commit: string; dirty: boolean } {
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repo });
  const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=no"], { cwd: repo });
  return { commit: head.stdout.toString().trim() || "unknown", dirty: status.stdout.toString().trim() !== "" };
}
```

- [ ] **Step 4: Write `tests/evals/report.ts`**

```ts
// The run's report: a verdict per test and each case's criteria, as report.md for people (run.ts writes report.json beside it).
import type { EvalCase, TestId } from "./cases";
import type { RunState } from "./state";

export interface TestVerdict { test: TestId; status: "pass" | "fail" | "incomplete"; detail: string }

export const TEST_NAMES: Record<TestId, string> = { B: "Test B — consistency", C: "Test C — review accuracy", D: "Test D — zero accounts" };

function verdictOf(state: RunState, cases: EvalCase[], test: TestId): TestVerdict {
  const mine = cases.filter((c) => c.test === test);
  const graded = mine.filter((c) => state.cases[c.id]?.status === "graded");
  const failed = graded.filter((c) => state.cases[c.id]!.grade?.pass === false).map((c) => c.id);
  if (failed.length > 0) return { test, status: "fail", detail: `Failed: ${failed.join(", ")}.` };
  if (graded.length < mine.length) return { test, status: "incomplete", detail: `${graded.length} of ${mine.length} cases graded.` };
  return { test, status: "pass", detail: `All ${mine.length} cases passed.` };
}

/** Test D is B and C with no MCP servers (every session here has none; each is checked as it starts) plus the three new apps (spec §13.2). */
export function testVerdicts(state: RunState, cases: EvalCase[]): TestVerdict[] {
  const b = verdictOf(state, cases, "B");
  const c = verdictOf(state, cases, "C");
  const apps = verdictOf(state, cases, "D");
  let d: TestVerdict;
  if (apps.status === "fail") d = apps;
  else if (b.status === "fail" || c.status === "fail") d = { test: "D", status: "fail", detail: "Test D also needs B and C to pass with no design sources connected." };
  else if (apps.status === "incomplete" || b.status === "incomplete" || c.status === "incomplete") d = { test: "D", status: "incomplete", detail: `${apps.detail} Test D also needs B and C to pass.` };
  else d = { test: "D", status: "pass", detail: "The three new apps passed, and B and C passed with no design sources connected." };
  return [b, c, d];
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const commit = (c: string, dirty: boolean) => `${c.slice(0, 12)}${dirty ? " (with uncommitted changes)" : ""}`;

export function renderReport(state: RunState, cases: EvalCase[], verdicts: TestVerdict[]): string {
  const models = [...new Set(Object.values(state.cases).map((c) => c.session?.model).filter(Boolean))].join(", ");
  const lines: string[] = [
    `# Motif evals: run ${state.id}`,
    "",
    `- Commit ${commit(state.commit, state.dirty)}, started ${state.started}`,
    ...state.resumes.map((r) => `- Resumed ${r.at} on commit ${commit(r.commit, r.dirty)}`),
    `- Claude Code ${state.claudeVersion || "(version unknown)"}; model: ${models || "your account's default"}`,
    "- Every session: your Claude account (no API key), none of your settings, plugins or MCP servers, and Motif's plugin only.",
    "",
    "## Verdicts",
    "",
    ...verdicts.map((v) => `- **${TEST_NAMES[v.test]}: ${v.status.toUpperCase()}** — ${v.detail}`),
    "",
  ];
  for (const c of cases) {
    const s = state.cases[c.id];
    if (!s) continue;
    lines.push(`## ${c.id}: ${c.title}`, "");
    if (s.session) {
      const x = s.session;
      lines.push(`Session: ${x.end}, ${x.turns} turns, ${x.minutes} minutes, about $${x.costUsd.toFixed(2)} at API prices (your plan covers it)${x.denials.length ? `, ${x.denials.length} actions refused by auto mode` : ""}.`, "");
    }
    if (s.note) lines.push(`Note: ${s.note}`, "");
    if (s.status !== "graded" || !s.grade) {
      lines.push(`Not graded (${s.status}).`, "");
      continue;
    }
    lines.push(
      `**${s.grade.pass ? "PASS" : "FAIL"}**`, "",
      "| | Criterion | Detail |", "|---|---|---|",
      ...s.grade.criteria.map((k) => `| ${k.pass ? "✓" : "✗"} | ${cell(k.label)} | ${cell(k.detail)} |`),
      "",
    );
    if (s.session?.denials.length) lines.push("Refused by auto mode:", ...s.session.denials.map((d) => `- ${cell(d)}`), "");
  }
  return lines.join("\n");
}
```

- [ ] **Step 5: Run it to see it pass**

Run (from `cli/`): `bun test test/evals-state.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/evals/state.ts tests/evals/report.ts cli/test/evals-state.test.ts
git commit -m "feat(evals): the run's resumable record, test verdicts and the report" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The command — preflight and the run

**Files:**
- Create: `tests/evals/preflight.ts`
- Create: `tests/evals/run.ts`
- Test: `cli/test/evals-preflight.test.ts`, `cli/test/evals-run.test.ts`

**Interfaces:**
- Consumes: everything above — `resolveClaude`, `sessionEnv`, `agentArgs`, `judgeArgs` (Task 1); `runSession`, `SessionSpec`, `SessionOutcome` (Task 2); `CASES`, `selectCases`, `EvalCase`, `runCmd`, `motifRunner`, `tail`, `Run` (Task 3); `prepareWorkspace`, `removeDir`, `Workspace` (Task 4); `JUDGE_SCHEMA`, `judgePrompt`, `readVerdict`, `Paused`, `JudgeFn` (Task 6); `Grade` (Task 7); `collectAndGrade` (Task 8); `loadRun`, `saveRun`, `newRunId`, `remaining`, `runDir`, `gitState`, `RunState`, `SessionSummary`, `testVerdicts`, `renderReport` (Task 9).
- Produces:
  - `interface Paths { repo: string; cli: string; motifBin: string; pluginDir: string }`; `paths(repo: string): Paths`
  - `interface Ready { claude: string; claudeVersion: string; browser: boolean }`; `interface PreflightDeps { which; run: Run; env; bun: string; claudeOverride?: string }`; `preflight(p: Paths, needsBrowser: boolean, d: PreflightDeps): Promise<Ready | { error: string }>`
  - `USAGE: string`; `interface RunDeps { preflight; prepare; session; collect; purge; removeDir; git; now; log; env }`; `runEvals(argv: string[], deps: RunDeps, where: { repo: string; results: string }): Promise<number>` — exit codes: `0` every case in the run graded and passed, `1` otherwise, `2` couldn't run (options, preflight, a session that wasn't isolated), `3` paused at the usage limit.
  - The command: `bun tests/evals/run.ts [--list] [--tests B,C,D] [--cases id,…] [--dry-run] [--resume <run>] [--keep] [--model <name>] [--judge-model <name>] [--max-turns <n>] [--work <folder>] [--claude <path>]`

- [ ] **Step 1: Write the failing tests**

`cli/test/evals-preflight.test.ts`:
```ts
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
```

`cli/test/evals-run.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalCase } from "../../tests/evals/cases";
import type { Grade } from "../../tests/evals/grade";
import { Paused } from "../../tests/evals/judge";
import { runEvals, type RunDeps } from "../../tests/evals/run";
import type { SessionOutcome, SessionSpec } from "../../tests/evals/session";
import { loadRun, type RunState } from "../../tests/evals/state";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const RUN = "20261014-120000";
const PASS: Grade = { pass: true, criteria: [], metrics: {} };
const finished = (): SessionOutcome => ({
  end: "finished",
  init: { model: "m", permissionMode: "auto", apiKeySource: "none", mcpServers: [], plugins: [], version: "x" },
  result: { subtype: "success", isError: false, turns: 5, costUsd: 1, durationMs: 1, denials: [], text: "", apiErrorStatus: null },
  problems: [], minutes: 1,
});

function harness(over: Partial<RunDeps> = {}) {
  const root = tempDir("motif-evalrun-");
  const calls = { prepare: [] as string[], session: [] as SessionSpec[], collect: [] as string[], purge: [] as string[], removed: [] as string[], preflight: 0 };
  const lines: string[] = [];
  const deps: RunDeps = {
    preflight: async () => {
      calls.preflight++;
      return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true };
    },
    prepare: async (c: EvalCase, dir: string) => {
      calls.prepare.push(c.id);
      mkdirSync(join(dir, "app"), { recursive: true });
      return { dir, app: join(dir, "app"), gitDir: join(dir, "baseline.git") };
    },
    session: async (s) => {
      calls.session.push(s);
      return finished();
    },
    collect: async (c) => {
      calls.collect.push(c.id);
      return PASS;
    },
    purge: async (_claude, cwd) => {
      calls.purge.push(cwd);
    },
    removeDir: (dir) => {
      calls.removed.push(dir);
    },
    git: () => ({ commit: "abc1234567890", dirty: false }),
    now: () => new Date(2026, 9, 14, 12, 0, 0),
    log: (l) => lines.push(l),
    env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x" },
    ...over,
  };
  return { deps, calls, lines, root, where: { repo: root, results: join(root, "results") }, work: join(root, "work") };
}

describe("the eval runner", () => {
  test("--list names every case without starting anything", async () => {
    const h = harness();
    expect(await runEvals(["--list"], h.deps, h.where)).toBe(0);
    expect(h.lines.join("\n")).toContain("c-review");
    expect(h.calls.preflight).toBe(0);
  });

  test("--dry-run shows each prompt and the Claude Code command, and writes nothing", async () => {
    const h = harness();
    expect(await runEvals(["--dry-run", "--cases", "c-review"], h.deps, h.where)).toBe(0);
    const text = h.lines.join("\n");
    expect(text).toContain("/motif:review");
    expect(text).toContain("--permission-mode auto");
    expect(h.calls.preflight + h.calls.session.length).toBe(0);
    expect(existsSync(h.where.results)).toBe(false);
  });

  test("unknown options and cases can't run", async () => {
    const h = harness();
    expect(await runEvals(["--bogus"], h.deps, h.where)).toBe(2);
    expect(await runEvals(["--cases", "b-nope"], h.deps, h.where)).toBe(2);
    expect(await runEvals(["--cases", "b-search", "--max-turns", "0"], h.deps, h.where)).toBe(2);
  });

  test("a run: each case prepared, run in its folder with its prompt and caps, graded, cleaned up, reported", async () => {
    const h = harness();
    expect(await runEvals(["--cases", "b-settings,c-review", "--work", h.work], h.deps, h.where)).toBe(0);
    expect(h.calls.prepare).toEqual(["b-settings", "c-review"]);
    const s = h.calls.session[0]!;
    expect(s.prompt).toStartWith("/motif:feature");
    expect(s.cwd).toBe(join(h.work, "b-settings", "app"));
    expect(s.args[s.args.indexOf("--max-turns") + 1]).toBe("200");
    expect(s.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(s.env.MOTIF_BIN).toBe(join(h.root, "dist", process.platform === "win32" ? "motif.exe" : "motif"));
    expect(s.expect).toEqual({ pluginDir: join(h.root, "dist", "claude-code"), auto: true });
    expect(h.calls.collect).toEqual(["b-settings", "c-review"]);
    expect(h.calls.purge).toContain(join(h.work, "b-settings", "app"));
    expect(h.calls.removed).toEqual([join(h.work, "b-settings"), join(h.work, "c-review")]);
    expect(h.lines.join("\n")).toContain("ANTHROPIC_API_KEY");
    expect(readFileSync(join(h.where.results, RUN, "report.md"), "utf8")).toContain("PASS");
    expect(existsSync(join(h.where.results, RUN, "report.json"))).toBe(true);
    expect(readFileSync(join(h.where.results, RUN, "no-mcp.json"), "utf8")).toBe('{"mcpServers":{}}');
  });

  test("--keep keeps the folders; --max-turns caps every case", async () => {
    const h = harness();
    await runEvals(["--cases", "b-search", "--keep", "--max-turns", "4", "--work", h.work], h.deps, h.where);
    expect(h.calls.removed).toEqual([]);
    const a = h.calls.session[0]!.args;
    expect(a[a.indexOf("--max-turns") + 1]).toBe("4");
  });

  test("a failing case makes the exit code 1", async () => {
    const h = harness({ collect: async () => ({ pass: false, criteria: [], metrics: {} }) });
    expect(await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where)).toBe(1);
  });

  test("a usage limit pauses the run; --resume continues with what's left", async () => {
    let n = 0;
    const h = harness({ session: async () => (++n === 2 ? { ...finished(), end: "usage-limit", resetsAt: 1792000800 } : finished()) });
    expect(await runEvals(["--cases", "b-settings,b-search,b-profile", "--work", h.work], h.deps, h.where)).toBe(3);
    expect(h.lines.join("\n")).toContain(`--resume ${RUN}`);
    const s = loadRun(h.where.results, RUN) as RunState;
    expect(Object.fromEntries(Object.entries(s.cases).map(([k, v]) => [k, v.status]))).toEqual({ "b-settings": "graded", "b-search": "interrupted", "b-profile": "pending" });
    h.calls.prepare.length = 0;
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.prepare).toEqual(["b-search", "b-profile"]);
  });

  test("grading paused by the usage limit is picked up again without a new session", async () => {
    let first = true;
    const h = harness({
      collect: async () => {
        if (first) {
          first = false;
          throw new Paused();
        }
        return PASS;
      },
    });
    expect(await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where)).toBe(3);
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.session).toHaveLength(1);
    expect(h.calls.prepare).toEqual(["c-review"]);
  });

  test("grading that fails keeps the folder for the next --resume", async () => {
    let first = true;
    const h = harness({
      collect: async () => {
        if (first) {
          first = false;
          throw new Error("the grader's session ended with \"time-limit\"");
        }
        return PASS;
      },
    });
    expect(await runEvals(["--cases", "c-review", "--work", h.work], h.deps, h.where)).toBe(1);
    expect(h.calls.removed).toEqual([]);
    expect((loadRun(h.where.results, RUN) as RunState).cases["c-review"]!.status).toBe("session-done");
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(h.calls.session).toHaveLength(1);
  });

  test("a session that isn't isolated stops the whole run", async () => {
    const h = harness({ session: async () => ({ ...finished(), end: "not-isolated", problems: ["MCP servers were loaded (refero)."] }) });
    expect(await runEvals(["--cases", "b-settings,b-search", "--work", h.work], h.deps, h.where)).toBe(2);
    expect(h.calls.prepare).toEqual(["b-settings"]);
    expect(h.lines.join("\n")).toContain("refero");
  });

  test("a folder that can't be prepared is an error for that case only", async () => {
    const h = harness();
    const prepare = h.deps.prepare;
    let n = 0;
    h.deps.prepare = async (c, dir) => {
      if (++n === 1) throw new Error("npm ci failed: network unreachable");
      return prepare(c, dir);
    };
    expect(await runEvals(["--cases", "b-settings,b-search", "--work", h.work], h.deps, h.where)).toBe(1);
    const s = loadRun(h.where.results, RUN) as RunState;
    expect(s.cases["b-settings"]).toMatchObject({ status: "error", note: expect.stringContaining("network unreachable") });
    expect(s.cases["b-search"]!.status).toBe("graded");
  });

  test("a run can't start when preflight fails, and leaves nothing behind", async () => {
    const h = harness({ preflight: async () => ({ error: "Sign in with your Claude account." }) });
    expect(await runEvals(["--cases", "b-search"], h.deps, h.where)).toBe(2);
    expect(h.lines.join("\n")).toContain("Sign in");
    expect(existsSync(h.where.results)).toBe(false);
  });

  test("resuming on another commit is allowed and noted in the report", async () => {
    let n = 0;
    const h = harness({ session: async () => (++n === 1 ? { ...finished(), end: "usage-limit" } : finished()) });
    await runEvals(["--cases", "b-search", "--work", h.work], h.deps, h.where);
    h.deps.git = () => ({ commit: "def4567890abcdef", dirty: true });
    expect(await runEvals(["--resume", RUN], h.deps, h.where)).toBe(0);
    expect(readFileSync(join(h.where.results, RUN, "report.md"), "utf8")).toContain("def4567890ab");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `cli/`): `bun test test/evals-preflight.test.ts test/evals-run.test.ts`
Expected: FAIL — `Cannot find module '../../tests/evals/preflight'` and `'../../tests/evals/run'`.

- [ ] **Step 3: Write `tests/evals/preflight.ts`**

```ts
// Checks before a run: Claude Code signed in with a Claude account (never an API key), this checkout's motif tool and plugin built,
// Node.js for the apps, and a browser for the cases that need one. Nothing is downloaded or installed for the developer.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveClaude, sessionEnv } from "./claude";
import { tail, type Run } from "./tools";

export interface Paths { repo: string; cli: string; motifBin: string; pluginDir: string }

export function paths(repo: string): Paths {
  return { repo, cli: join(repo, "cli"), motifBin: join(repo, "dist", process.platform === "win32" ? "motif.exe" : "motif"), pluginDir: join(repo, "dist", "claude-code") };
}

export interface Ready { claude: string; claudeVersion: string; browser: boolean }

export interface PreflightDeps {
  which: (cmd: string) => string | null;
  run: Run;
  env: Record<string, string | undefined>;
  /** This Bun, for `bun run build` and `bun run plugin`. */
  bun: string;
  claudeOverride?: string;
}

export async function preflight(p: Paths, needsBrowser: boolean, d: PreflightDeps): Promise<Ready | { error: string }> {
  const found = resolveClaude(d.claudeOverride ?? d.which("claude"));
  if ("error" in found) return found;
  const { env } = sessionEnv(d.env, p.motifBin);

  const version = await d.run([found.exe, "--version"], p.repo, 60_000, env);
  if (version.code !== 0) return { error: `Claude Code didn't start (${found.exe} --version):\n${tail(version)}` };
  const auth = await d.run([found.exe, "auth", "status"], p.repo, 60_000, env);
  let status: any = null;
  try {
    status = JSON.parse(auth.stdout);
  } catch {
    status = null;
  }
  if (status?.loggedIn !== true || status.authMethod !== "claude.ai") {
    return { error: "The evals run on your Claude plan through Claude Code, never with an API key. Sign in with your Claude account (claude auth login), then run this again." };
  }

  for (const [script, what] of [["build", "the motif tool"], ["plugin", "the Claude Code plugin"]] as const) {
    const r = await d.run([d.bun, "run", script], p.cli, 600_000);
    if (r.code !== 0) return { error: `Building ${what} failed (bun run ${script} in cli):\n${tail(r)}` };
  }
  if (!existsSync(p.motifBin) || !existsSync(join(p.pluginDir, "skills", "motif", "SKILL.md"))) {
    return { error: "The build didn't produce dist/motif and dist/claude-code; run bun run build and bun run plugin in cli to see why." };
  }

  const node = await d.run(["node", "--version"], p.repo, 30_000);
  const [major = 0, minor = 0] = node.stdout.trim().replace(/^v/, "").split(".").map(Number);
  if (node.code !== 0 || !d.which("npm") || major < 20 || (major === 20 && minor < 9)) {
    return { error: "Node.js 20.9 or later, with npm, is needed to install and build the eval apps. Install it, then run this again." };
  }

  const doctor = await d.run([p.motifBin, "doctor", "--json"], p.repo, 60_000);
  let browser = false;
  try {
    browser = JSON.parse(doctor.stdout).items.some((i: any) => i.id === "browser" && i.status === "ok");
  } catch {
    browser = false;
  }
  if (needsBrowser && !browser) {
    return {
      error: "No Chrome or Edge was found. Test C's review checks what the browser shows, and test D's apps are checked in a browser. Install Chrome or Edge, or run motif browser install yourself (it downloads about 100 MB), then run this again. Test B alone (--tests B) doesn't need one.",
    };
  }
  return { claude: found.exe, claudeVersion: version.stdout.trim(), browser };
}
```

- [ ] **Step 4: Write `tests/evals/run.ts`**

```ts
// Runs Motif's agent evals (tests B, C and D, spec §13.2) through your signed-in Claude Code, one case at a time, and grades them.
// Never an API key; never in CI. See tests/evals/README.md.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES, selectCases, type EvalCase } from "./cases";
import { agentArgs, judgeArgs, sessionEnv } from "./claude";
import { collectAndGrade } from "./collect";
import type { Grade } from "./grade";
import { JUDGE_SCHEMA, judgePrompt, Paused, readVerdict, type JudgeFn } from "./judge";
import { paths, preflight, type Ready } from "./preflight";
import { renderReport, testVerdicts } from "./report";
import { runSession, type SessionOutcome, type SessionSpec } from "./session";
import { gitState, loadRun, newRunId, remaining, runDir, saveRun, type RunState, type SessionSummary } from "./state";
import { motifRunner, runCmd } from "./tools";
import { prepareWorkspace, removeDir, type Workspace } from "./workspace";

export const USAGE = `Usage: bun tests/evals/run.ts [options]

Runs Motif's agent evals through your signed-in Claude Code (never an API key), one case at a time.

  --list                 List the cases
  --tests B,C,D          Run only these tests
  --cases <id,...>       Run only these cases
  --dry-run              Show each case's prompt and the Claude Code command, without running anything
  --resume <run>         Continue a run that stopped (a usage limit, Ctrl+C)
  --keep                 Keep each case's folder after grading
  --model <name>         The model for the eval sessions (default: your account's)
  --judge-model <name>   The model for test C's grader (default: your account's)
  --max-turns <n>        Cap every case at n turns (for a quick check of the runner)
  --work <folder>        Where case folders go (default: your temp folder)
  --claude <path>        The Claude Code program to use`;

export interface RunDeps {
  preflight(needsBrowser: boolean, claude?: string): Promise<Ready | { error: string }>;
  prepare(c: EvalCase, dir: string): Promise<Workspace>;
  session(spec: SessionSpec): Promise<SessionOutcome>;
  collect(c: EvalCase, ws: Workspace, out: string, judge: JudgeFn): Promise<Grade>;
  purge(claude: string, cwd: string): Promise<void>;
  removeDir(dir: string): void;
  git(): { commit: string; dirty: boolean };
  now(): Date;
  log(line: string): void;
  env: Record<string, string | undefined>;
}

const summary = (o: SessionOutcome): SessionSummary => ({
  end: o.end, model: o.init?.model ?? "", turns: o.result?.turns ?? 0, minutes: o.minutes, costUsd: o.result?.costUsd ?? 0, denials: o.result?.denials ?? [], problems: o.problems,
});
const resets = (at?: number) => (at ? ` (it resets ${new Date(at * 1000).toLocaleString()})` : "");
const list = (v: unknown) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export async function runEvals(argv: string[], deps: RunDeps, where: { repo: string; results: string }): Promise<number> {
  let o: Record<string, string | boolean | undefined>;
  try {
    o = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        list: { type: "boolean" }, tests: { type: "string" }, cases: { type: "string" }, "dry-run": { type: "boolean" }, resume: { type: "string" },
        keep: { type: "boolean" }, model: { type: "string" }, "judge-model": { type: "string" }, "max-turns": { type: "string" },
        work: { type: "string" }, claude: { type: "string" }, help: { type: "boolean" },
      },
    }).values;
  } catch (e) {
    deps.log(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    deps.log(USAGE);
    return 0;
  }
  if (o.list) {
    for (const c of CASES) deps.log(`${c.id.padEnd(16)} ${c.test}  ${c.title}`);
    return 0;
  }
  const p = paths(where.repo);

  let state: RunState;
  if (typeof o.resume === "string") {
    const loaded = loadRun(where.results, o.resume);
    if ("error" in loaded) {
      deps.log(loaded.error);
      return 2;
    }
    state = loaded;
  } else {
    const picked = selectCases(CASES, { tests: list(o.tests), ids: list(o.cases) });
    if ("error" in picked) {
      deps.log(picked.error);
      return 2;
    }
    const maxTurns = o["max-turns"] === undefined ? undefined : Number(o["max-turns"]);
    if (maxTurns !== undefined && !(Number.isInteger(maxTurns) && maxTurns > 0)) {
      deps.log("--max-turns needs a whole number above 0.");
      return 2;
    }
    const id = newRunId(deps.now());
    const git = deps.git();
    state = {
      motifEvalRun: 1, id, commit: git.commit, dirty: git.dirty, started: deps.now().toISOString(), claudeVersion: "", resumes: [],
      options: {
        keep: o.keep === true,
        work: typeof o.work === "string" ? resolve(o.work) : join(tmpdir(), "motif-evals", id),
        ...(typeof o.model === "string" ? { model: o.model } : {}),
        ...(typeof o["judge-model"] === "string" ? { judgeModel: o["judge-model"] } : {}),
        ...(maxTurns ? { maxTurns } : {}),
      },
      cases: Object.fromEntries(picked.map((c) => [c.id, { status: "pending" as const, attempts: 0 }])),
    };
  }

  const todo = remaining(state).map((id) => CASES.find((c) => c.id === id)).filter((c): c is EvalCase => Boolean(c));
  const dir = runDir(where.results, state.id);
  const mcpConfigFile = join(dir, "no-mcp.json");
  const caseArgs = (c: EvalCase) =>
    agentArgs({ pluginDir: p.pluginDir, mcpConfigFile, maxTurns: state.options.maxTurns ?? c.maxTurns, maxBudgetUsd: c.maxBudgetUsd, model: state.options.model });

  if (o["dry-run"]) {
    for (const c of todo) {
      deps.log([
        `\n${c.id}: ${c.title}`,
        `  Folder: ${join(state.options.work, c.id, "app")}`,
        `  Limits: ${state.options.maxTurns ?? c.maxTurns} turns, ${c.minutes} minutes`,
        `  Command: claude ${caseArgs(c).join(" ")}`,
        "  Prompt (on standard input):",
        ...c.prompt.split("\n").map((l) => `    ${l}`),
      ].join("\n"));
    }
    return 0;
  }

  const ready = await deps.preflight(todo.some((c) => c.test !== "B"), typeof o.claude === "string" ? o.claude : undefined);
  if ("error" in ready) {
    deps.log(ready.error);
    return 2;
  }
  const { env, dropped } = sessionEnv(deps.env, p.motifBin);
  if (dropped.length) deps.log(`Leaving these out of the eval sessions' environment: ${dropped.join(", ")}.`);
  if (typeof o.resume === "string") {
    const git = deps.git();
    if (git.commit !== state.commit || git.dirty !== state.dirty) state.resumes.push({ at: deps.now().toISOString(), commit: git.commit, dirty: git.dirty });
  }
  state.claudeVersion = ready.claudeVersion;
  mkdirSync(dir, { recursive: true });
  writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: {} }));
  const save = () => saveRun(where.results, state);
  save();

  const finish = (): number => {
    const verdicts = testVerdicts(state, CASES);
    writeFileSync(join(dir, "report.md"), renderReport(state, CASES, verdicts));
    writeFileSync(join(dir, "report.json"), JSON.stringify({ run: state, verdicts }, null, 2));
    deps.log(`\n${verdicts.map((v) => `${v.test}: ${v.status} — ${v.detail}`).join("\n")}\nReport: ${join(dir, "report.md")}`);
    return Object.values(state.cases).every((c) => c.status === "graded" && c.grade?.pass) ? 0 : 1;
  };
  const pause = (at?: number): number => {
    finish();
    deps.log(`\nPaused: your Claude plan's usage limit was reached${resets(at)}. Continue with: bun tests/evals/run.ts --resume ${state.id}`);
    return 3;
  };

  deps.log(`Run ${state.id}: ${todo.length} cases. Each starts a fresh Claude Code session on your plan. Stop any time with Ctrl+C, then continue with --resume ${state.id}.`);
  for (const c of todo) {
    const cs = state.cases[c.id]!;
    const out = join(dir, c.id);
    mkdirSync(out, { recursive: true });

    if (!(cs.status === "session-done" && cs.workspace && existsSync(cs.workspace.app))) {
      deps.log(`\n${c.id} (${c.title}): preparing its folder…`);
      try {
        cs.workspace = await deps.prepare(c, join(state.options.work, c.id));
      } catch (e) {
        cs.status = "error";
        cs.note = `Couldn't prepare the folder: ${(e as Error).message}`;
        save();
        deps.log(`${c.id}: ${cs.note}`);
        continue;
      }
      cs.attempts += 1;
      delete cs.note;
      save();
      deps.log(`${c.id}: Claude Code is working (up to ${c.minutes} minutes). Everything it does goes to ${join(out, "session.jsonl")}.`);
      const outcome = await deps.session({
        command: [ready.claude], args: caseArgs(c), cwd: cs.workspace.app, env, prompt: c.prompt,
        transcript: join(out, "session.jsonl"), timeoutMs: c.minutes * 60_000, expect: { pluginDir: p.pluginDir, auto: true },
      });
      cs.session = summary(outcome);
      await deps.purge(ready.claude, cs.workspace.app);
      if (outcome.end === "not-isolated") {
        cs.status = "error";
        cs.note = outcome.problems.join(" ");
        save();
        deps.log(`\nStopped: ${cs.note}`);
        finish();
        return 2;
      }
      if (outcome.end === "usage-limit") {
        cs.status = "interrupted";
        cs.note = `Usage limit reached${resets(outcome.resetsAt)}.`;
        save();
        return pause(outcome.resetsAt);
      }
      if (!outcome.init) {
        cs.status = "error";
        cs.note = outcome.problems.join(" ") || "Claude Code didn't start.";
        save();
        deps.log(`${c.id}: ${cs.note}`);
        continue;
      }
      cs.status = "session-done";
      save();
    }

    deps.log(`${c.id}: grading…`);
    const ws = cs.workspace!;
    const judge: JudgeFn = async (input, cwd) => {
      const r = await deps.session({
        command: [ready.claude], args: judgeArgs({ mcpConfigFile, schema: JUDGE_SCHEMA, maxTurns: 40, model: state.options.judgeModel }), cwd, env,
        prompt: judgePrompt(input), transcript: join(out, "judge.jsonl"), timeoutMs: 30 * 60_000, expect: { auto: false },
      });
      await deps.purge(ready.claude, cwd);
      if (r.end === "usage-limit") return { paused: r.resetsAt ? { resetsAt: r.resetsAt } : {} };
      if (r.end === "finished" && r.result?.structured !== undefined) return { verdict: readVerdict(r.result.structured, input) };
      return { error: r.problems.join(" ") || `the grader's session ended with "${r.end}"` };
    };
    try {
      cs.grade = await deps.collect(c, ws, out, judge);
    } catch (e) {
      if (e instanceof Paused) {
        cs.note = `Grading paused: usage limit reached${resets(e.resetsAt)}.`;
        save();
        return pause(e.resetsAt);
      }
      cs.note = `Grading failed: ${(e as Error).message} The folder is kept; --resume grades it again.`;
      save();
      deps.log(`${c.id}: ${cs.note}`);
      continue;
    }
    cs.status = "graded";
    delete cs.note;
    save();
    if (!state.options.keep) deps.removeDir(ws.dir);
    const failed = cs.grade.criteria.filter((k) => !k.pass).map((k) => k.label);
    deps.log(`${c.id}: ${cs.grade.pass ? "PASS" : `FAIL (${failed.join("; ")})`}`);
  }
  return finish();
}

if (import.meta.main) {
  const repo = resolve(import.meta.dir, "..", "..");
  const p = paths(repo);
  const motif = motifRunner([p.motifBin]);
  const code = await runEvals(
    process.argv.slice(2),
    {
      preflight: (needsBrowser, claude) =>
        preflight(p, needsBrowser, { which: (cmd) => Bun.which(cmd), run: runCmd, env: process.env, bun: process.execPath, ...(claude ? { claudeOverride: resolve(claude) } : {}) }),
      prepare: (c, dir) => prepareWorkspace(c, dir, runCmd),
      session: runSession,
      collect: (c, ws, out, judge) => collectAndGrade(c, ws, out, { run: runCmd, motif, judge }),
      purge: async (claude, cwd) => {
        await runCmd([claude, "purge", "-y", cwd], repo, 60_000);
      },
      removeDir,
      git: () => gitState(repo),
      now: () => new Date(),
      log: (line) => console.log(line),
      env: process.env,
    },
    { repo, results: join(repo, "tests", "evals", "results") },
  );
  process.exit(code);
}
```

- [ ] **Step 5: Run them to see them pass**

Run (from `cli/`): `bun test test/evals-preflight.test.ts test/evals-run.test.ts`
Expected: PASS (6 + 13 tests).

- [ ] **Step 6: Type-check and run the whole suite**

Run (from `cli/`): `bun run typecheck && bun test --timeout 120000`
Expected: typecheck clean; every test passes (the 688 from before plus the new `evals-*` tests; the same 3 skips, plus the `.cmd` test skipped off Windows).

- [ ] **Step 7: Commit**

```bash
git add tests/evals/preflight.ts tests/evals/run.ts cli/test/evals-preflight.test.ts cli/test/evals-run.test.ts
git commit -m "feat(evals): the eval command — preflight, isolated sessions, grading, pause and resume, report" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Docs, the decision record, /motif:design, and a real smoke run

**Files:**
- Create: `tests/evals/README.md`
- Create: `docs/decisions/0003-evals-on-your-plan.md`
- Modify: `tests/README.md` (the Evals section)
- Modify: `docs/specs/2026-10-12-motif-core-design.md` (§3 table's "When it runs", §5.1's workflows comment, §13.2's heading and last bullet)
- Modify: `plugin/claude-code/README.md` (the commands table), `plugin/claude-code/skills/design/SKILL.md` (description), `cli/test/plugin.test.ts`
- Test: `cli/test/evals-docs.test.ts`, `cli/test/plugin.test.ts`

**Interfaces:**
- Consumes: the command and its options (Task 10); `CASES` (Task 3).
- Produces: documentation only; the plugin's `/design` entry is documented as `/motif:design`.

- [ ] **Step 1: Write the failing tests**

`cli/test/evals-docs.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";

const REPO = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

describe("the evals' docs", () => {
  test("the README says how to run, resume and read the results, and that it never uses an API key", () => {
    const readme = read("tests/evals/README.md");
    for (const s of ["bun tests/evals/run.ts", "--resume", "--dry-run", "--list", "--keep", "--max-turns", "never an API key", "claude auth status", "tests/evals/results/", "claude purge", "--permission-mode auto", "motif browser install"]) {
      expect(readme).toContain(s);
    }
    for (const c of CASES) expect(readme).toContain(c.id);
  });

  test("the tests README points at it", () => {
    expect(read("tests/README.md")).toContain("evals/README.md");
  });

  test("the decision is recorded and the spec follows it", () => {
    const decision = read("docs/decisions/0003-evals-on-your-plan.md");
    for (const s of ["No API key", "On demand", "auto mode", "claude purge"]) expect(decision).toContain(s);
    const spec = read("docs/specs/2026-10-12-motif-core-design.md");
    expect(spec).toContain("0003-evals-on-your-plan.md");
    expect(spec).not.toContain("Eval runs need an API key stored as a CI secret");
    expect(spec).not.toContain("Nightly, on demand");
  });
});
```

In `cli/test/plugin.test.ts`, change the README test (line 46–51) to expect `/motif:design` and check the design wrapper says so:
```ts
  test("says how to reach the commands Claude Code's own /init, /review and design skill hide", () => {
    const readme = readFileSync(join(REPO, "plugin/claude-code/README.md"), "utf8");
    for (const s of ["/motif:design", "/motif:init", "/feature", "/motif:review", "MOTIF_BIN", "bun run plugin", "/reload-plugins"]) expect(readme).toContain(s);
    expect(readFileSync(join(REPO, "plugin/claude-code/skills/design/SKILL.md"), "utf8")).toContain("/motif:design");
    expect(readFileSync(join(REPO, "plugin/claude-code/skills/init/SKILL.md"), "utf8")).toContain("/motif:init");
    expect(readFileSync(join(REPO, "plugin/claude-code/skills/review/SKILL.md"), "utf8")).toContain("/motif:review");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run (from `cli/`): `bun test test/evals-docs.test.ts test/plugin.test.ts`
Expected: FAIL — `tests/evals/README.md` doesn't exist; the plugin README has no `/motif:design`.

- [ ] **Step 3: Write `tests/evals/README.md`**

````markdown
# Agent evals

Tests B, C and D from the design spec (§13.2), run through **your own signed-in Claude Code** on your Claude plan: never an API key, never in CI, and only when you start them.

| Test | What it checks | Cases |
|---|---|---|
| B — consistency | Fresh sessions each add a feature to Larder (`fixtures/react-contract-app`) and stay inside its design guide | `b-settings`, `b-search`, `b-profile`, `b-notifications`, `b-checkout` |
| C — review accuracy | A review of the seeded app (`fixtures/react-seeded-app`) finds its 23 planted problems | `c-review` |
| D — zero accounts | A new app from each brief (`fixtures/briefs/`), plus B and C, all with no design sources connected | `d-stride`, `d-ledgerly`, `d-bloom` |

## Before you start

- Claude Code, signed in with your Claude account: `claude auth status` shows `"authMethod": "claude.ai"`. The evals never use an API key.
- Bun (this repository's tool), git, and Node.js 20.9 or later with npm.
- Chrome or Edge for tests C and D. If you have neither, `motif browser install` downloads a private browser of about 100 MB; the runner never runs it for you.
- Time and usage. Each case is a full Claude Code session: up to 90 minutes for B and C cases, 3 hours for D cases, plus installing and building the app. A full run is nine sessions and uses a large share of your plan's usage, so you may prefer one test at a time.

## Running

From the repository root:

```bash
bun tests/evals/run.ts --list                  # the nine cases
bun tests/evals/run.ts --dry-run --tests B     # each prompt and the exact Claude Code command, without running anything
bun tests/evals/run.ts --tests B               # one test
bun tests/evals/run.ts --cases b-search,c-review
bun tests/evals/run.ts                         # everything
```

| Option | What it does |
|---|---|
| `--tests B,C,D` · `--cases <id,…>` | Run only these |
| `--dry-run` | Show what would run; start nothing, write nothing |
| `--resume <run>` | Continue a run that stopped |
| `--keep` | Keep each case's folder after grading (to look at the apps) |
| `--model <name>` · `--judge-model <name>` | The model for the sessions, and for test C's grader (default: your account's) |
| `--max-turns <n>` | Cap every case at n turns: a quick check that the runner works |
| `--work <folder>` | Where case folders go (default: your temp folder) |
| `--claude <path>` | The Claude Code program to use |

At the start of a run, the runner builds the motif tool and the Claude Code plugin from this checkout (`bun run build` and `bun run plugin` in `cli`), so the sessions test the code in front of you.

## What each session gets

- **A fresh folder** in your temp folder: a copy of the fixture app with its packages installed (B, C), or an empty folder holding the brief as `brief.md` (D).
- **Your Claude account only.** `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and the other-provider switches are left out of the session's environment, and a session that reports any API key stops the run.
- **None of your setup.** `--setting-sources project,local` leaves out your own settings, hooks and plugins; `--strict-mcp-config` with an empty list leaves out every MCP server (that's test D's "zero accounts"); only Motif's plugin is loaded, from `dist/claude-code`. The session's first event is checked for all of this, and the run stops if anything else was loaded.
- **Unattended, never bypassed.** `--permission-mode auto --permission-prompts none`: Claude Code's auto mode approves ordinary work and refuses risky actions, and nobody is asked. Refusals are listed in the report. If a session doesn't start in auto mode (some models don't support it), the run stops and says to choose another with `--model`. Tools that reach outside the session (remote triggers, phone notifications, schedules, design sync, worktrees) are switched off.
- **Gates off by instruction.** Each prompt starts a Motif command (`/motif:feature`, `/motif:review`, `/motif:init`) and adds "don't stop for approval", as a developer would.
- **No traces.** Sessions keep no transcript in Claude Code (`--no-session-persistence`), and `claude purge` removes Claude Code's state for each case folder afterwards. Case folders are deleted after grading unless you pass `--keep`.

## Usage limits and resuming

If your plan's usage limit is reached, the run pauses, says when the limit resets, and prints the command to continue:

```bash
bun tests/evals/run.ts --resume <run>
```

Ctrl+C works the same way. A case cut off mid-session starts again from a fresh folder; cases already graded keep their results. If the limit is reached while test C is being graded, the review isn't repeated: its folder is kept and `--resume` grades it again. Resuming on a different commit is allowed, and the report says so.

## Results

Everything goes to `tests/evals/results/<run>/` (git-ignored; nothing is uploaded):

- `report.md`: the verdict for each test and a table of criteria for each case; `report.json` and `run.json` hold the same for tools.
- Per case: `session.jsonl` (every event of the session, to see exactly what Claude Code did), `diff.patch` (what it changed), `check.json`, `validate.json`, `build.log`, `typecheck.log`; for C, `review.json`, `review.md`, `audit.json`, `grading.json` and `judge.jsonl`; for D, the new app's `DESIGN.md`, `tokens.json`, `shot.json` and `shots/`.

The dollar figure in the report is Claude Code's own estimate at API prices, to show scale; your plan covers the usage.

Exit codes: `0` every case passed, `1` some case failed or couldn't be graded, `2` the run couldn't start (or a session wasn't isolated), `3` paused at the usage limit.

## How cases are graded

**B** (every case): the feature's page exists; `motif check` finds no problems and no warnings, with at most 2 `motif-ok` exceptions; `motif validate` passes; the app builds and type-checks; at most one new component in `src/components/`, unless the others are named in lines the session added to `DESIGN.md` (a recorded design guide change).

**C**: the review writes a report in the review format (`design/reviews/*.json`) and changes nothing outside `design/`. Findings are matched to `seeded-issues.json` by category and place, following [the seeded app's grading rules](../fixtures/react-seeded-app/README.md#how-a-grader-reads-the-list); knock-on findings the list declares count as correct. Exact problems are matched by the runner alone; for judgement problems, a model grader (one read-only Claude Code session, with [this rubric](rubric.md)) confirms which candidate findings describe each problem, and decides whether serious findings that match nothing are real or false. Pass: at least 90% of the 13 exact problems, at least 70% of the 10 judgement problems, at most 10% of critical and major findings false.

**D** (every brief): the new app (the folder with `DESIGN.md`) passes `motif validate` and `motif check` (at most 2 `motif-ok` exceptions); `DESIGN.md` has every section, each filled in; the app builds and type-checks; `/`, `/sign-in` and `/home` render in `motif shot` (status 200, no page errors). Test D passes when the three new apps pass and tests B and C pass, since every session runs with no MCP servers.

## Tests of the runner

`cli/test/evals-*.test.ts` run in CI with a stand-in for Claude Code (`cli/test/fixtures/evals/fake-claude.ts`) and stubbed installs and builds. They never start a real session, use your plan or reach the network.
````

- [ ] **Step 4: Point `tests/README.md` at it**

Replace the Evals section of `tests/README.md` with:
```markdown
## Evals

`evals/` runs tests B, C and D from the design spec through your signed-in Claude Code, never an API key, one case at a time and only when you start it: `bun tests/evals/run.ts --list` to see the cases. [evals/README.md](evals/README.md) explains what each session gets, how to resume after a usage limit, and how cases are graded.
```

- [ ] **Step 5: Write `docs/decisions/0003-evals-on-your-plan.md`**

```markdown
# 0003 — Evals run on the developer's Claude plan, on demand

- Date: 2026-10-14
- Status: Accepted
- Context: spec §13.2 planned nightly eval runs in CI, with "an API key stored as a CI secret". The developer decided on 2026-10-14 not to use an API key. Verified the same day with Claude Code 2.1.289 signed in with a Claude account (see the 1E-2 plan, `docs/plans/2026-10-14-motif-1e2-evals.md`).

## Decisions

1. **No API key.** Evals run through the developer's signed-in Claude Code (`claude auth status` → `"authMethod": "claude.ai"`). API key and other-provider variables are removed from each session's environment, and a session whose first event reports an API key source stops the run.
2. **On demand only**, from `bun tests/evals/run.ts`, one case at a time, resumable after a usage limit or Ctrl+C. No nightly runs. CI runs only the runner's own tests, with a stand-in for Claude Code.
3. **Isolation, checked.** `--setting-sources project,local`, `--strict-mcp-config` with an empty list, only Motif's plugin (built from the checkout), `--no-session-persistence`; the first event (`system/init`) is checked for the API key source, MCP servers, plugins and permission mode.
4. **Unattended in auto mode** (`--permission-mode auto --permission-prompts none`): Claude Code's auto mode decides, and nobody is asked. Bypassing permissions was rejected because the sessions run on the developer's own computer. Auto mode needs a model that supports it; the runner stops when a session doesn't start in auto mode.
5. **Test C's model grader** is one read-only Claude Code session (Read, Grep and Glob only) answering in a JSON schema, following `tests/evals/rubric.md`.
6. **Test D's starter routes** are named in the prompt (`/`, `/sign-in`, `/home`) so the screens can be checked without a model.
7. **`claude purge`** removes Claude Code's state for each case folder after its sessions.

## Consequences

- The release checklist (Part 4) must include a local eval run; results stay on the developer's computer (`tests/evals/results/`, git-ignored).
- §13.2's "nightly" and "API key stored as a CI secret" no longer apply; the spec now points here.
- Runs use the developer's plan. The report shows Claude Code's own cost estimate at API prices, for scale only.
```

- [ ] **Step 6: Update the spec**

In `docs/specs/2026-10-12-motif-core-design.md`:
- §3 table, rows B, C and D: "Nightly, on demand, required before release" → "On demand, required before release".
- §5.1 layout comment: `← tool tests (every change), evals (nightly/on demand), release` → `← tool tests (every change), release`.
- §13.2 heading: `### 13.2 Agent evals (nightly, on demand, required before release)` → `### 13.2 Agent evals (on demand, required before release)`.
- §13.2 last bullet: replace "- Eval runs need an API key stored as a CI secret and are capped per run to control cost." with:
  ```markdown
  - Eval runs use the developer's signed-in Claude Code, never an API key, run only when the developer starts them, and are capped per case ([decision 0003](../decisions/0003-evals-on-your-plan.md)). CI runs only the runner's own tests.
  ```

- [ ] **Step 7: Say `/motif:design` in the plugin's docs**

`plugin/claude-code/README.md`, the first row of the commands table:
```markdown
| `/motif:design` | Say what you'd like to do; Motif picks the right mode (plain `/design` can be Claude Code's own design skill) |
```

`plugin/claude-code/skills/design/SKILL.md`, the description line:
```yaml
description: Motif's starting point (run it as /motif:design; plain /design can be Claude Code's own). Asks whether you're starting a new app, adding a feature or improving your app's look, then takes it from there.
```

- [ ] **Step 8: Run the tests to see them pass, then the whole suite**

Run (from `cli/`): `bun test test/evals-docs.test.ts test/plugin.test.ts`
Expected: PASS.

Run (from `cli/`): `bun run typecheck && bun test --timeout 120000 && bun run plugin && claude plugin validate ../dist/claude-code`
Expected: typecheck clean; all tests pass; the plugin validates.

- [ ] **Step 9: Commit**

```bash
git add tests/evals/README.md tests/README.md docs/decisions/0003-evals-on-your-plan.md docs/specs/2026-10-12-motif-core-design.md plugin/claude-code/README.md plugin/claude-code/skills/design/SKILL.md cli/test/plugin.test.ts cli/test/evals-docs.test.ts
git commit -m "docs(evals): how to run the evals on your plan; decision 0003; /motif:design" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Check the command by hand (no session)**

From the repository root:

Run: `bun tests/evals/run.ts --list`
Expected: nine lines, `b-settings` … `d-bloom`.

Run: `bun tests/evals/run.ts --dry-run --cases b-settings,c-review`
Expected: for each case, its folder under the temp folder, its limits, `Command: claude -p --output-format stream-json --verbose --no-session-persistence --setting-sources project,local --strict-mcp-config --mcp-config … --permission-mode auto --permission-prompts none --plugin-dir …/dist/claude-code --add-dir …/dist/claude-code --max-turns … --disallowedTools …`, and the prompt; `tests/evals/results/` gets nothing new.

- [ ] **Step 11: A real smoke run (small: one case, four turns)**

This uses a few turns of the developer's plan (the account's default model), installs Larder's packages from the npm registry, and builds the app once. It checks the runner against a real Claude Code session: preflight, isolation, auto mode, the turn cap, grading, purge and the report.

Run: `bun tests/evals/run.ts --cases b-settings --max-turns 4 --keep`
Expected:
- preflight passes (no output about signing in), and the build steps run;
- `b-settings: preparing its folder…`, then `Claude Code is working…`;
- the session ends at the turn cap; grading runs; `b-settings: FAIL (…The feature's page exists…)` (four turns aren't enough to build it); exit code 1;
- `tests/evals/results/<run>/report.md` shows `Session: turn-cap, 4 turns`, and the criteria table;
- the first line of `tests/evals/results/<run>/b-settings/session.jsonl` is the `system/init` event with `"permissionMode":"auto"`, `"apiKeySource":"none"`, `"mcp_servers":[]`, and the plugins `motif` (from `dist/claude-code`) plus built-ins only; its later events show the Motif skill being read;
- `claude purge --dry-run <the case's app folder>` reports nothing to delete.

If any expectation fails, find the cause (superpowers:systematic-debugging), fix it test-first in the module that owns it, and record a ruling. Then delete the kept folder (`<temp folder>/motif-evals/<run>/`) and the smoke run's results folder (`tests/evals/results/<run>/`).
