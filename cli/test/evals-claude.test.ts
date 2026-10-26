import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_TOOLS, agentArgs, DENIED_COMMANDS, initInfo, MOTIF_DENIED_COMMANDS, isolationProblems, JUDGE_EXPECTED_TOOLS, JUDGE_TOOLS, judgeArgs, memoryFiles, personalNames, resolveClaude, resultInfo, sessionEnv, usageLimit,
} from "../../tests/evals/claude";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const SHIM = '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n';
const NPM = join(import.meta.dir, "npm-global");
const PLUGIN = join(import.meta.dir, "plugin-dir-for-tests");
const pair = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const AGENT = { pluginDir: PLUGIN, auto: true, tools: AGENT_TOOLS };

const init = (over: Record<string, unknown> = {}) => ({
  type: "system", subtype: "init", model: "some-model", permissionMode: "auto", apiKeySource: "none", mcp_servers: [],
  plugins: [{ name: "motif", path: PLUGIN, source: "motif@inline" }, { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" }],
  tools: ["Bash", "Read", "Write", "Skill"], skills: ["motif:feature", "design"], agents: ["general-purpose"],
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
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/me", MOTIF_BIN: "/repo/dist/motif", MOTIF_NO_CONNECT: "1" });
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

  test("only the tools a coding session needs: nothing that publishes, messages other sessions, schedules work or leaves the folder", () => {
    expect(pair(a, "--tools")).toBe(AGENT_TOOLS.join(","));
    // Tools are an allowlist; the deny list holds only commands (adding MCP servers), never whole tools.
    expect(pair(a, "--disallowedTools")).toBe(DENIED_COMMANDS.join(","));
    for (const rule of DENIED_COMMANDS) expect(rule).toMatch(/^(Bash|PowerShell)\(.+\)$/);
    for (const t of ["Bash", "Read", "Write", "Edit", "Skill"]) expect(AGENT_TOOLS).toContain(t);
    for (const t of ["Artifact", "ArtifactComments", "ArtifactData", "SendMessage", "ListAgents", "RemoteTrigger", "PushNotification", "ScheduleWakeup", "CronCreate", "Workflow", "DesignSync", "EnterWorktree"]) {
      expect(AGENT_TOOLS).not.toContain(t);
    }
  });

  test("the grader's session reads only, loads no plugin and answers in a schema", () => {
    const j = judgeArgs({ mcpConfigFile: "/m", schema: { type: "object" }, maxTurns: 40 });
    expect(pair(j, "--tools")).toBe(JUDGE_TOOLS.join(","));
    expect(JUDGE_TOOLS).toEqual(["Read", "Grep", "Glob"]);
    expect(pair(j, "--json-schema")).toBe('{"type":"object"}');
    expect(pair(j, "--permission-mode")).toBe("default");
    expect(pair(j, "--permission-prompts")).toBe("none");
    expect(pair(j, "--setting-sources")).toBe("local");
    expect(j).toContain("--strict-mcp-config");
    expect(j).not.toContain("--plugin-dir");
  });
});

describe("a session's first event", () => {
  test("an isolated session has no problems", () => {
    expect(isolationProblems(initInfo(init())!, AGENT)).toEqual([]);
  });

  test("an API key, MCP servers, another plugin, or no Motif plugin are each a problem", () => {
    const p = isolationProblems(
      initInfo(init({ apiKeySource: "ANTHROPIC_API_KEY", mcp_servers: [{ name: "refero", status: "connected" }], plugins: [{ name: "superpowers", path: "/home/me/.claude/plugins/superpowers" }] }))!,
      AGENT,
    ).join("\n");
    expect(p).toContain("API key");
    expect(p).toContain("refero");
    expect(p).toContain("superpowers");
    expect(p).toContain("Motif plugin wasn't loaded");
  });

  test("a tool outside the allowed set, or no tool list at all, is a problem", () => {
    expect(isolationProblems(initInfo(init({ tools: ["Bash", "Read", "Artifact"] }))!, AGENT)).toEqual([expect.stringContaining("Artifact")]);
    expect(isolationProblems(initInfo(init({ tools: undefined }))!, AGENT)).toEqual([expect.stringContaining("didn't list its tools")]);
  });

  test("the developer's own skills or agents are a problem", () => {
    const p = isolationProblems(initInfo(init({ skills: ["motif:feature", "apple-design"], agents: ["general-purpose", "my-reviewer"] }))!, { ...AGENT, personal: ["apple-design", "my-reviewer", "unused"] });
    expect(p).toEqual([expect.stringContaining("apple-design, my-reviewer")]);
  });

  test("missing fields count as problems, never as a pass", () => {
    const p = isolationProblems(initInfo({ type: "system", subtype: "init" })!, AGENT);
    expect(p.length).toBeGreaterThanOrEqual(4); // no apiKeySource "none", no tool list, no Motif plugin, not auto mode
  });

  test("a session that didn't start in auto mode can't work unattended", () => {
    expect(isolationProblems(initInfo(init({ permissionMode: "default" }))!, AGENT)).toEqual([expect.stringContaining("--model")]);
  });

  test("the grader's session expects no plugin, no auto mode and only its reading tools", () => {
    const judge = init({ permissionMode: "default", plugins: [{ name: "cc-plugin-telemetry", path: "builtin" }], tools: ["Glob", "Grep", "Read"] });
    expect(isolationProblems(initInfo(judge)!, { auto: false, tools: JUDGE_TOOLS })).toEqual([]);
    expect(isolationProblems(initInfo({ ...judge, tools: ["Read", "Bash"] })!, { auto: false, tools: JUDGE_TOOLS })).toEqual([expect.stringContaining("Bash")]);
  });

  test("the grader may have StructuredOutput, Claude Code's own way to answer in its schema; a session building a feature may not", () => {
    // Claude Code 2.1.301 adds the tool to a session started with --json-schema, which stopped the first real run's grading.
    const judge = init({ permissionMode: "default", plugins: [{ name: "cc-plugin-telemetry", path: "builtin" }], tools: ["Glob", "Grep", "Read", "StructuredOutput"] });
    expect(JUDGE_EXPECTED_TOOLS).toEqual([...JUDGE_TOOLS, "StructuredOutput"]);
    expect(isolationProblems(initInfo(judge)!, { auto: false, tools: JUDGE_EXPECTED_TOOLS })).toEqual([]);
    expect(isolationProblems(initInfo(init({ tools: ["Bash", "Read", "StructuredOutput"] }))!, AGENT)).toEqual([expect.stringContaining("StructuredOutput")]);
  });

  test("other events aren't the first event", () => {
    expect(initInfo({ type: "assistant" })).toBeNull();
    expect(initInfo(null)).toBeNull();
  });
});

describe("what the developer keeps for their own sessions", () => {
  test("their own skills and agents, by name", () => {
    const home = tempDir("motif-home-");
    mkdirSync(join(home, ".claude", "skills", "apple-design"), { recursive: true });
    writeFileSync(join(home, ".claude", "skills", "skills-lock.json"), "{}");
    mkdirSync(join(home, ".claude", "agents"), { recursive: true });
    writeFileSync(join(home, ".claude", "agents", "my-reviewer.md"), "");
    expect(personalNames(home).sort()).toEqual(["apple-design", "my-reviewer"]);
    expect(personalNames(join(home, "nobody"))).toEqual([]);
  });

  test("instruction files Claude Code would read in a session below a folder: in it, above it, and their own", () => {
    const root = tempDir("motif-memory-");
    const home = join(root, "home");
    const work = join(home, "temp", "motif-evals", "run");
    mkdirSync(work, { recursive: true });
    expect(memoryFiles(work, home)).toEqual([]);
    writeFileSync(join(home, "CLAUDE.md"), "Always use tabs.");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "Be terse.");
    writeFileSync(join(home, "temp", "CLAUDE.local.md"), "x");
    expect(memoryFiles(work, home).sort()).toEqual([join(home, ".claude", "CLAUDE.md"), join(home, "CLAUDE.md"), join(home, "temp", "CLAUDE.local.md")].sort());
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

describe("sessions can't change the developer's agents (backlog)", () => {
  test("adding MCP servers through Claude Code or Motif is denied", () => {
    const args = agentArgs({ pluginDir: "p", mcpConfigFile: "m.json", maxTurns: 5, maxBudgetUsd: 1 });
    const denied = args[args.indexOf("--disallowedTools") + 1] ?? "";
    for (const rule of ["Bash(claude mcp *)", "PowerShell(claude mcp *)", "Bash(motif connect *)", "PowerShell(motif connect *)"]) expect(denied).toContain(rule);
  });

  test("CLAUDE.md files in folders a session reads aren't loaded", () => {
    const { env } = sessionEnv({ PATH: "/bin", CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1" }, "/motif");
    expect(env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD).toBeUndefined();
  });
});

describe("the review of batch F", () => {
  test("sessions run with motif connect turned off", () => {
    expect(sessionEnv({ PATH: "/bin" }, "/motif").env.MOTIF_NO_CONNECT).toBe("1");
  });

  test("the grader loads only local settings: nothing a session left in the app's .claude/ reaches it", () => {
    const j = judgeArgs({ mcpConfigFile: "/m", schema: { type: "object" }, maxTurns: 40, appDir: "/app" });
    expect(j[j.indexOf("--setting-sources") + 1]).toBe("local");
  });
});

describe("Test A's sessions: no plugins at all (Part 4 §4)", () => {
  const BASE = { auto: true, tools: AGENT_TOOLS };
  const builtin = { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" };

  test("an a-* session's arguments are a d-* session's without the plugin's two flags and the two rules about motif connect", () => {
    const withMotif = agentArgs({ pluginDir: "/p", mcpConfigFile: "/m", maxTurns: 400, maxBudgetUsd: 80 });
    const without = agentArgs({ mcpConfigFile: "/m", maxTurns: 400, maxBudgetUsd: 80 });
    expect(without).not.toContain("--plugin-dir");
    expect(without).not.toContain("--add-dir");
    expect(MOTIF_DENIED_COMMANDS).toEqual(["Bash(motif connect *)", "PowerShell(motif connect *)"]);
    const expected = withMotif
      .filter((a, i) => !["--plugin-dir", "--add-dir"].includes(a) && !["--plugin-dir", "--add-dir"].includes(withMotif[i - 1]!))
      .map((a) => (a === DENIED_COMMANDS.join(",") ? DENIED_COMMANDS.filter((r) => !MOTIF_DENIED_COMMANDS.includes(r)).join(",") : a));
    expect(without).toEqual(expected);
    expect(pair(without, "--disallowedTools")).toBe("Bash(claude mcp *),PowerShell(claude mcp *)");
    // Nothing in them names Motif; a d-* session still denies motif connect.
    expect(without.join(" ").toLowerCase()).not.toContain("motif");
    expect(pair(withMotif, "--disallowedTools")).toBe(DENIED_COMMANDS.join(","));
  });

  test("the isolation check passes with no plugins (Claude Code's own built-in ones aside)", () => {
    expect(isolationProblems(initInfo(init({ plugins: [] }))!, BASE)).toEqual([]);
    expect(isolationProblems(initInfo(init({ plugins: [builtin] }))!, BASE)).toEqual([]);
  });

  test("and fails when any plugin loads, Motif's included; every other check still applies", () => {
    const motif = isolationProblems(initInfo(init({ plugins: [{ name: "motif", path: PLUGIN }, builtin] }))!, BASE);
    expect(motif).toEqual([expect.stringContaining("motif")]);
    expect(motif[0]).toContain("runs with none");
    const other = isolationProblems(initInfo(init({ plugins: [{ name: "superpowers", path: "/home/me/.claude/plugins/superpowers" }] }))!, BASE);
    expect(other).toEqual([expect.stringContaining("superpowers")]);
    const p = isolationProblems(initInfo(init({ plugins: [], apiKeySource: "ANTHROPIC_API_KEY", mcp_servers: [{ name: "refero" }], permissionMode: "default", tools: ["Bash", "Artifact"] }))!, { ...BASE, personal: ["design"] }).join("\n");
    for (const s of ["API key", "refero", "auto mode", "Artifact", "design"]) expect(p).toContain(s);
  });
});
