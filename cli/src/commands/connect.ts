import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import {
  AGENT_IDS, AGENTS, agentById, claudeLocal, codexHome, defaultAgentEnv, vscodeUserDir,
  type AgentEnv, type AgentInfo,
} from "../agents/catalog";
import { addJsonServer, addTomlServer, type Edited } from "../agents/edit";
import { findConfiguredSources, readAgentServers, type AgentServer, type ConfiguredSource } from "../detect/sources";
import { windowsExe } from "../system";
import { retiredById, SOURCES, sourceById, type SourceInfo } from "../sources/catalog";

export interface ConnectDeps {
  which: (cmd: string) => string | null;
  /** Runs a program; cwd is the folder to run it in (the current one when left out), env its environment (Motif's own when left out). */
  run: (exe: string, args: string[], cwd?: string, env?: Record<string, string | undefined>) => Promise<{ code: number; output: string }>;
  /** True when a person is at the terminal, who can be asked which agents to set up. */
  interactive: boolean;
  /** Reads a line the developer types in their own terminal (shown as typed): which agents to set up. Null when the input ends. */
  ask: (prompt: string) => Promise<string | null>;
  configured: () => ConfiguredSource[];
  /** Every MCP server already in each agent's settings, whatever it is. */
  servers: () => AgentServer[];
  home: string;
  platform: NodeJS.Platform;
  /** Environment variables (agents' settings folders follow some, e.g. CODEX_HOME). */
  vars: Record<string, string | undefined>;
  /** How the developer runs this Motif in their own terminal. */
  self: string;
}

/** npm installs `claude` as a .cmd file on Windows, which only cmd.exe can run; every argument is quoted for it. */
export function spawnArgs(
  exe: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): { cmd: string[]; verbatim: boolean } {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    const quote = (a: string) => `"${a.replace(/"/g, '""')}"`;
    return { cmd: [windowsExe("cmd.exe", env), "/d", "/s", "/c", `"${[exe, ...args].map(quote).join(" ")}"`], verbatim: true };
  }
  return { cmd: [exe, ...args], verbatim: false };
}

export async function runCommand(exe: string, args: string[], cwd?: string, env?: Record<string, string | undefined>): Promise<{ code: number; output: string }> {
  const { cmd, verbatim } = spawnArgs(exe, args);
  const proc = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe", windowsVerbatimArguments: verbatim });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, output: `${out}${err}`.trim() };
}

/** Reads one line from the terminal, as typed; null when the input ends first (Ctrl+D, or Ctrl+Z on Windows). */
export function readLine(prompt: string, stdin: NodeJS.ReadableStream = process.stdin, stdout: NodeJS.WritableStream = process.stderr): Promise<string | null> {
  stdout.write(prompt);
  let value = "";
  return new Promise((resolve) => {
    const done = (line: string | null) => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.pause();
      if (line === null) stdout.write("\n");
      resolve(line);
    };
    const onData = (chunk: Buffer | string) => {
      value += String(chunk);
      // Windows' console sends Ctrl+Z then Enter as characters; a raw terminal sends Ctrl+D as one.
      if (/^[\u0004\u001a]/.test(value)) return done(null);
      const end = value.search(/\r?\n/);
      if (end !== -1) done(value.slice(0, end));
    };
    const onEnd = () => done(null);
    stdin.on("data", onData);
    stdin.on("end", onEnd);
    stdin.resume();
  });
}

function defaultDeps(cwd: string): ConnectDeps {
  const home = homedir();
  return {
    which: (cmd) => Bun.which(cmd),
    run: runCommand,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    ask: readLine,
    configured: () => findConfiguredSources(cwd, home, defaultAgentEnv()),
    servers: () => readAgentServers(cwd, defaultAgentEnv()).servers,
    home,
    platform: process.platform,
    vars: process.env,
    self: selfCommand(process.execPath),
  };
}

/** The settings other agents take. */
export function genericConfig(source: SourceInfo): string {
  return JSON.stringify({ mcpServers: { [source.connect.name]: { type: "http", url: source.connect.url } } }, null, 2);
}

const ids = SOURCES.map((s) => s.id).join(", ");
const fail = (text: string, data: Record<string, unknown>): CommandResult => ({ command: "connect", exitCode: 2, text, data });

function list(deps: ConnectDeps): CommandResult {
  const configured = deps.configured();
  const agentsFor = (id: string) => [...new Set(configured.filter((c) => c.id === id).map((c) => c.agent))];
  const lines = ["Design sources — all optional; Motif works fully without them:"];
  for (const s of SOURCES) {
    const agents = agentsFor(s.id);
    const where = agents.length > 0 ? ` In: ${agents.map((a) => agentById(a)!.label).join(", ")}.` : ` Connect: ${deps.self} connect ${s.id}`;
    lines.push(`  ${agents.length > 0 ? "✓" : "○"} ${s.label} — ${s.gives}. ${s.cost}.${where}`);
  }
  lines.push("  Supahero needs nothing: Motif reads its public pages when you build a landing page.");
  return {
    command: "connect",
    exitCode: 0,
    text: lines.join("\n"),
    data: {
      sources: SOURCES.map((s) => {
        const agents = agentsFor(s.id);
        return { id: s.id, label: s.label, connected: agents.length > 0, agents, gives: s.gives, cost: s.cost, command: `${deps.self} connect ${s.id}` };
      }),
    },
  };
}

/** The agents the developer picked from the numbered list: Enter (nothing) is all of them. Null when the answer isn't a choice. */
export function pickAgents(answer: string, found: AgentInfo[]): AgentInfo[] | null {
  const a = answer.trim();
  if (a === "") return found;
  const picked = a.split(/[\s,]+/).filter(Boolean).map(Number);
  if (picked.some((n) => !Number.isInteger(n) || n < 1 || n > found.length)) return null;
  return [...new Set(picked)].sort((x, y) => x - y).map((n) => found[n - 1]!);
}

interface ServerSpec {
  name: string;
  url: string;
}

interface AddResult {
  ok: boolean;
  output: string;
}

/**
 * Adds the server to one agent's user settings: with the agent's own command, or by editing its file where the command
 * can't — Codex's starts a sign-in and waits for a browser; VS Code's would pass JSON through cmd.exe on Windows.
 */
async function addTo(agent: AgentInfo, server: ServerSpec, deps: ConnectDeps, env: AgentEnv): Promise<AddResult> {
  const command = async (cli: string, args: string[], installed: string | null = null): Promise<AddResult> => {
    const exe = deps.which(cli) ?? installed;
    if (!exe) return { ok: false, output: `its "${cli}" command isn't on PATH` };
    // From the home folder: an agent's command that can also write a project's settings never sees this project.
    const r = await deps.run(exe, args, env.home);
    return { ok: r.code === 0, output: r.output };
  };
  const file = (edit: () => Edited): AddResult => {
    const r = edit();
    return r.ok ? { ok: true, output: "" } : { ok: false, output: r.reason };
  };
  const plain = { url: server.url };
  switch (agent.id) {
    case "claude":
      return command("claude", ["mcp", "add", "--transport", "http", "--scope", "user", server.name, server.url], claudeLocal(env));
    case "codex": {
      const path = join(codexHome(env), "config.toml");
      return file(() => addTomlServer(path, server.name, plain));
    }
    case "cursor": {
      const path = join(env.home, ".cursor", "mcp.json");
      return file(() => addJsonServer(path, "mcpServers", server.name, plain));
    }
    case "copilot":
      return command("copilot", ["mcp", "add", "--transport", "http", server.name, server.url]);
    case "vscode": {
      const path = join(vscodeUserDir(env), "mcp.json");
      return file(() => addJsonServer(path, "servers", server.name, { type: "http", ...plain }));
    }
    case "gemini":
      return command("gemini", ["mcp", "add", "--scope", "user", "--transport", "http", server.name, server.url]);
    case "opencode":
      return command("opencode", ["mcp", "add", server.name, "--url", server.url]);
  }
}

type AgentResult = { agent: AgentInfo; status: "added" | "already" | "failed"; server?: string; where?: string; output?: string };

export async function runConnect(cwd: string, ctx: RunContext, deps: ConnectDeps = defaultDeps(cwd)): Promise<CommandResult> {
  const id = ctx.positionals[0];
  if (!id) return list(deps);
  // For unattended runs (CI, Motif's own evals): nothing may change the developer's agents.
  if (deps.vars.MOTIF_NO_CONNECT && deps.vars.MOTIF_NO_CONNECT !== "0") {
    return fail("motif connect is turned off here (MOTIF_NO_CONNECT is set), so no agent's settings were changed.", { error: "connect-off" });
  }
  const retired = retiredById(id);
  if (retired) {
    const text = `${retired.label} was retired in Motif 2.0. Motif now has this built in: ${retired.builtIn}. There's nothing to connect, and nothing was changed.`;
    return { command: "connect", exitCode: 0, text, data: { retired: retired.id } };
  }
  const source = sourceById(id);
  if (!source) return fail(`There's no design source called "${id}". Choose one of: ${ids}.`, { error: "no-such-source" });
  const env: AgentEnv = { home: deps.home, platform: deps.platform, vars: deps.vars, which: deps.which };
  const config = JSON.parse(genericConfig(source));
  const manual = `To add it by hand, put this in your agent's MCP settings:\n${genericConfig(source)}`;
  const wanted = typeof ctx.flags?.agent === "string" ? ctx.flags.agent : undefined;
  const asked = wanted?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (wanted !== undefined) {
    const unknown = asked!.find((a) => !agentById(a));
    if (asked!.length === 0 || unknown !== undefined) {
      return fail(`There's no agent called "${unknown ?? wanted}". Choose from: ${AGENT_IDS.join(", ")}.`, { error: "no-such-agent" });
    }
  }
  const named = asked ? AGENTS.filter((a) => asked.includes(a.id)) : [];

  // Agents that already have the source are reported as such.
  const configured = deps.configured();
  const has = (agent: AgentInfo) => configured.find((c) => c.id === source.id && c.agent === agent.id);
  // Another product's server may already have the source's name (usemotion.com's "motion"): it's kept, and the source
  // goes in under its second name. Undefined when the agent has both names already.
  const servers = deps.servers();
  const nameFor = (agent: AgentInfo) =>
    [source.connect.name, source.connect.fallback].find((n) => !servers.some((s) => s.agent === agent.id && s.name === n));

  let chosen: AgentInfo[];
  // Named with --agent but not on this computer: nothing is written for them (a settings folder would make them look installed).
  let missing: AgentInfo[] = [];
  let note = "";
  if (asked) {
    chosen = named;
    missing = named.filter((a) => !a.found(env) && !has(a));
  } else {
    const found = AGENTS.filter((a) => a.found(env));
    if (found.length === 0) {
      return fail(`Motif didn't find a coding agent it can set up on this computer (${AGENTS.map((a) => a.label).join(", ")}).\n${manual}`, { error: "no-agent", config });
    }
    if (found.length === 1) chosen = found;
    else if (deps.interactive) {
      const menu = found.map((a, i) => `${i + 1} ${a.label}`).join(", ");
      const answer = await deps.ask(`Set up ${source.label} for which agents? ${menu}. Press Enter for all, or type numbers (such as 1,3): `);
      if (answer === null) return fail("No answer. Nothing changed.", { error: "no-answer" });
      const picked = pickAgents(answer, found);
      if (!picked) return fail("That isn't a choice from the list. Nothing changed.", { error: "bad-choice" });
      chosen = picked;
    } else {
      chosen = found;
      note = `Setting it up in every agent found (choose some with --agent): ${found.map((a) => a.label).join(", ")}.`;
    }
  }

  const results: AgentResult[] = [];
  for (const agent of chosen) {
    const existing = has(agent);
    if (existing) {
      results.push({ agent, status: "already", server: existing.server, where: existing.where });
      continue;
    }
    if (missing.includes(agent)) {
      results.push({ agent, status: "failed", output: `Motif didn't find it on this computer (${agent.notFound(env)})` });
      continue;
    }
    const name = nameFor(agent);
    if (!name) {
      const output = `it already has servers called "${source.connect.name}" and "${source.connect.fallback}" that aren't ${source.label}'s, so nothing was changed`;
      results.push({ agent, status: "failed", output });
      continue;
    }
    // One agent going wrong in a way nobody foresaw is that agent's failure; the others are still set up and reported.
    let r: AddResult;
    try {
      r = await addTo(agent, { name, url: source.connect.url }, deps, env);
    } catch (e) {
      r = { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
    results.push(r.ok ? { agent, status: "added", server: name } : { agent, status: "failed", output: r.output });
  }

  const ok = results.filter((r) => r.status !== "failed");
  const failed = results.filter((r) => r.status === "failed");
  const lines: string[] = note ? [note] : [];
  for (const r of results) {
    if (r.status === "added" && r.server !== source.connect.name) {
      lines.push(`✓ ${r.agent.label}: added ${source.label} for all your projects, as "${r.server}" (you already have a server called "${source.connect.name}" that isn't ${source.label}'s).`);
    } else if (r.status === "added") lines.push(`✓ ${r.agent.label}: added ${source.label} for all your projects.`);
    else if (r.status === "already") lines.push(`✓ ${r.agent.label}: already connected (server "${r.server}" in ${r.where}).`);
    else lines.push(`✗ ${r.agent.label}: couldn't add it: ${r.output}`);
  }
  if (failed.length > 0) lines.push(manual);
  if (ok.length > 0) lines.push(source.note, `Cost: ${source.cost}.`);

  const data: Record<string, unknown> = {
    source: source.id,
    agents: results.map((r) => ({
      agent: r.agent.id, status: r.status, ...(r.server ? { server: r.server } : {}), ...(r.where ? { where: r.where } : {}), ...(r.output ? { output: r.output } : {}),
    })),
  };
  if (failed.length > 0) Object.assign(data, { error: ok.length === 0 ? "agent-failed" : "some-agents-failed", output: failed[0]!.output, config });
  return { command: "connect", exitCode: failed.length === 0 ? 0 : ok.length > 0 ? 1 : 2, text: lines.join("\n"), data };
}

/** How the developer runs this Motif in their own terminal: the compiled tool's path, with forward slashes, which cmd, PowerShell and Git Bash all accept. */
export function selfCommand(execPath: string, platform: NodeJS.Platform = process.platform): string {
  const win = platform === "win32";
  const path = win ? execPath.replace(/\\/g, "/") : execPath;
  if (!/^motif(\.exe)?$/i.test(path.slice(path.lastIndexOf("/") + 1))) return "motif";
  if (/^[\w./:~+-]+$/.test(path)) return path;
  return win ? `"${path}"` : `'${path.replace(/'/g, "'\\''")}'`;
}
