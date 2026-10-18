// How the evals start Claude Code: which program, which arguments, which environment, and what its event stream says.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  // Would load CLAUDE.md from folders added with --add-dir (the grader reads the app from outside it).
  "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD",
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
  // motif connect would change the developer's own agents (the skill may suggest it for a free source).
  env.MOTIF_NO_CONNECT = "1";
  return { env, dropped };
}

/**
 * The only tools an eval session gets: files, the shell, search, skills, subagents, its task list and the web. Anything else Claude Code
 * offers (publishing pages, messaging other sessions, triggers, notifications, schedules, worktrees, and whatever a later version adds)
 * is left out, and the session's first event is checked against this list. Names a platform doesn't have (PowerShell) are ignored.
 */
export const AGENT_TOOLS = [
  "Bash", "PowerShell", "Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit", "Skill", "ToolSearch",
  "Task", "TaskCreate", "TaskGet", "TaskList", "TaskUpdate", "TaskStop", "Monitor", "WebFetch", "WebSearch",
];

/** Test C's grader only reads. */
export const JUDGE_TOOLS = ["Read", "Grep", "Glob"];

/**
 * The tools the grader's first event may list: its reading tools, and StructuredOutput, the tool Claude Code itself adds
 * to a session started with --json-schema so it can give its answer in that schema (Claude Code 2.1.301 and later).
 */
export const JUDGE_EXPECTED_TOOLS = [...JUDGE_TOOLS, "StructuredOutput"];

/** Every session: headless, every event streamed, nothing saved, none of the developer's settings, no MCP servers. */
const isolation = (mcpConfigFile: string, sources = "project,local") => [
  "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
  "--setting-sources", sources, "--strict-mcp-config", "--mcp-config", mcpConfigFile,
];

/**
 * What a session may not run: adding MCP servers to the developer's own coding agents, through Claude Code or Motif.
 * The runner also checks the agents' settings after each session (agentSettings), whatever the command was.
 */
export const DENIED_COMMANDS = ["Bash(claude mcp *)", "PowerShell(claude mcp *)", "Bash(motif connect *)", "PowerShell(motif connect *)"];

export function agentArgs(o: { pluginDir: string; mcpConfigFile: string; maxTurns: number; maxBudgetUsd: number; model?: string }): string[] {
  return [
    ...isolation(o.mcpConfigFile),
    "--permission-mode", "auto", "--permission-prompts", "none",
    "--plugin-dir", o.pluginDir, "--add-dir", o.pluginDir,
    "--max-turns", String(o.maxTurns), "--max-budget-usd", String(o.maxBudgetUsd),
    ...(o.model ? ["--model", o.model] : []),
    "--tools", AGENT_TOOLS.join(","),
    "--disallowedTools", DENIED_COMMANDS.join(","),
  ];
}

/** Test C's grader: read-only tools, no plugin, a structured answer. */
export function judgeArgs(o: { mcpConfigFile: string; schema: object; maxTurns: number; model?: string; appDir?: string }): string[] {
  return [
    // Local settings only: with project settings on, Claude Code also loads skills and agents from --add-dir folders.
    ...isolation(o.mcpConfigFile, "local"),
    // It works from a folder of its own and reads the app from there, so nothing the session left in the app (a
    // CLAUDE.md, .claude/ settings) reaches the grader.
    ...(o.appDir ? ["--add-dir", o.appDir] : []),
    "--permission-mode", "default", "--permission-prompts", "none",
    "--tools", JUDGE_TOOLS.join(","),
    "--max-turns", String(o.maxTurns),
    ...(o.model ? ["--model", o.model] : []),
    "--json-schema", JSON.stringify(o.schema),
  ];
}

export interface InitInfo {
  model: string; permissionMode: string; apiKeySource: string; mcpServers: string[]; plugins: { name: string; path: string }[];
  tools: string[]; skills: string[]; agents: string[]; version: string;
}

const names = (v: unknown): string[] => (Array.isArray(v) ? v.map((s: any) => String(s?.name ?? s)) : []);

export function initInfo(e: unknown): InitInfo | null {
  const x = e as any;
  if (x?.type !== "system" || x.subtype !== "init") return null;
  return {
    model: String(x.model ?? ""),
    permissionMode: String(x.permissionMode ?? ""),
    apiKeySource: String(x.apiKeySource ?? ""),
    mcpServers: names(x.mcp_servers),
    plugins: (Array.isArray(x.plugins) ? x.plugins : []).map((p: any) => ({ name: String(p?.name ?? ""), path: String(p?.path ?? "") })),
    tools: names(x.tools),
    skills: names(x.skills),
    agents: names(x.agents),
    version: String(x.claude_code_version ?? ""),
  };
}

/** The developer's own skills (~/.claude/skills/<name>/) and agents (~/.claude/agents/<name>.md), which no eval session may load. */
export function personalNames(home: string): string[] {
  const out: string[] = [];
  const skills = join(home, ".claude", "skills");
  const agents = join(home, ".claude", "agents");
  try {
    for (const n of readdirSync(skills)) if (statSync(join(skills, n)).isDirectory()) out.push(n);
  } catch {
    // None.
  }
  try {
    for (const n of readdirSync(agents)) if (n.endsWith(".md")) out.push(n.slice(0, -3));
  } catch {
    // None.
  }
  return out;
}

/** Instruction files Claude Code would read in a session started below `dir`: in it and every folder above it, and the developer's own. */
export function memoryFiles(dir: string, home: string): string[] {
  const found: string[] = [];
  let d = resolve(dir);
  for (;;) {
    for (const f of ["CLAUDE.md", "CLAUDE.local.md", join(".claude", "CLAUDE.md")]) if (existsSync(join(d, f))) found.push(join(d, f));
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  const own = join(home, ".claude", "CLAUDE.md");
  if (existsSync(own) && !found.includes(own)) found.push(own);
  return found;
}

const samePath = (a: string, b: string) => {
  const n = (p: string) => resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

/** What would make a session's results meaningless. Anything missing counts as a problem. */
export function isolationProblems(init: InitInfo, expect: { pluginDir?: string; auto: boolean; tools: string[]; personal?: string[] }): string[] {
  const problems: string[] = [];
  if (init.tools.length === 0) problems.push("Claude Code didn't list its tools, so the runner can't check what the session may do.");
  const extra = init.tools.filter((t) => !expect.tools.includes(t));
  if (extra.length > 0) problems.push(`Claude Code offered tools the evals don't allow (${extra.join(", ")}).`);
  const mine = [...init.skills, ...init.agents].filter((n) => expect.personal?.includes(n));
  if (mine.length > 0) problems.push(`Your own skills or agents were loaded (${mine.join(", ")}); every eval session runs without them.`);
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
