import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import {
  AGENT_IDS, AGENTS, agentById, codexHome, configHome, copilotHome, defaultAgentEnv, geminiDir, shown, vscodeUserDir,
  type AgentEnv, type AgentInfo,
} from "../agents/catalog";
import { addJsonServer, addTomlServer, type Edited } from "../agents/edit";
import { findConfiguredSources, type ConfiguredSource } from "../detect/sources";
import { SOURCES, sourceById, type SourceInfo } from "../sources/catalog";

export interface ConnectDeps {
  which: (cmd: string) => string | null;
  /** Runs a program; cwd is the folder to run it in (the current one when left out). */
  run: (exe: string, args: string[], cwd?: string) => Promise<{ code: number; output: string }>;
  /** True when a person is at the terminal (Motif never reads keys any other way). */
  interactive: boolean;
  readSecret: (prompt: string) => Promise<string>;
  /** Reads a line the developer types in their own terminal (shown as typed): which agents to set up. */
  ask: (prompt: string) => Promise<string>;
  configured: () => ConfiguredSource[];
  home: string;
  platform: NodeJS.Platform;
  /** Environment variables (agents' settings folders follow some, e.g. CODEX_HOME). */
  vars: Record<string, string | undefined>;
  /** How the developer runs this Motif in their own terminal. */
  self: string;
}

/** npm installs `claude` as a .cmd file on Windows, which only cmd.exe can run; every argument is quoted for it. */
export function spawnArgs(exe: string, args: string[], platform: NodeJS.Platform = process.platform): { cmd: string[]; verbatim: boolean } {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    const quote = (a: string) => `"${a.replace(/"/g, '""')}"`;
    return { cmd: ["cmd.exe", "/d", "/s", "/c", `"${[exe, ...args].map(quote).join(" ")}"`], verbatim: true };
  }
  return { cmd: [exe, ...args], verbatim: false };
}

export async function runCommand(exe: string, args: string[], cwd?: string): Promise<{ code: number; output: string }> {
  const { cmd, verbatim } = spawnArgs(exe, args);
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", windowsVerbatimArguments: verbatim });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, output: `${out}${err}`.trim() };
}

/** Reads a line from the terminal without showing it. */
function readSecret(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    const finish = (cancelled: boolean) => {
      stdin.off("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(cancelled ? "" : value.trim());
    };
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return finish(false);
        if (ch === "\u0003") return finish(true); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Reads one line from the terminal, as typed. */
function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  let value = "";
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      value += chunk.toString("utf8");
      const end = value.search(/\r?\n/);
      if (end !== -1) {
        stdin.off("data", onData);
        stdin.pause();
        resolve(value.slice(0, end));
      }
    };
    stdin.resume();
    stdin.on("data", onData);
  });
}

function defaultDeps(cwd: string): ConnectDeps {
  const home = homedir();
  return {
    which: (cmd) => Bun.which(cmd),
    run: runCommand,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    readSecret,
    ask: readLine,
    configured: () => findConfiguredSources(cwd, home, defaultAgentEnv()),
    home,
    platform: process.platform,
    vars: process.env,
    self: selfCommand(process.execPath),
  };
}

/** The settings other agents take (a placeholder where a key goes). */
export function genericConfig(source: SourceInfo): string {
  const server: Record<string, unknown> = { type: "http", url: source.connect.url };
  if (source.connect.keyHeader) server.headers = { [source.connect.keyHeader]: `<your ${source.label} key>` };
  return JSON.stringify({ mcpServers: { [source.connect.name]: server } }, null, 2);
}

const ids = SOURCES.map((s) => s.id).join(", ");
/** Keys are tokens: at least 8 letters, digits or - _ . ~ + / =. Anything else is a paste mistake, and could be mangled on its way to claude. */
const KEY = /^[A-Za-z0-9._~+/=-]{8,}$/;
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
  headers?: Record<string, string>;
}

interface AddResult {
  ok: boolean;
  output: string;
  /** Files that now hold the key, to check against git. */
  keyFiles: string[];
}

/**
 * Adds the server to one agent's user settings: with the agent's own command, or by editing its file where the command
 * can't — Codex's starts a sign-in and waits for a browser; VS Code's would pass JSON through cmd.exe on Windows.
 */
async function addTo(agent: AgentInfo, server: ServerSpec, deps: ConnectDeps, env: AgentEnv): Promise<AddResult> {
  const header = server.headers ? Object.entries(server.headers)[0] : undefined;
  const colon = header ? ["--header", `${header[0]}: ${header[1]}`] : [];
  const command = async (cli: string, args: string[], keyFiles: string[]): Promise<AddResult> => {
    const exe = deps.which(cli);
    if (!exe) return { ok: false, output: `its "${cli}" command isn't on PATH`, keyFiles: [] };
    // From the home folder: an agent's command that can also write a project's settings never sees this project.
    const r = await deps.run(exe, args, env.home);
    return { ok: r.code === 0, output: r.output, keyFiles };
  };
  const file = (path: string, edit: () => Edited): AddResult => {
    const r = edit();
    return r.ok ? { ok: true, output: "", keyFiles: [path] } : { ok: false, output: r.reason, keyFiles: [] };
  };
  const holdsKey = Boolean(header);
  const plain = { url: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  switch (agent.id) {
    case "claude":
      return command("claude", ["mcp", "add", ...colon, "--transport", "http", "--scope", "user", server.name, server.url], [join(env.home, ".claude.json")]);
    case "codex": {
      const path = join(codexHome(env), "config.toml");
      return file(path, () => addTomlServer(path, server.name, plain, holdsKey));
    }
    case "cursor": {
      const path = join(env.home, ".cursor", "mcp.json");
      return file(path, () => addJsonServer(path, "mcpServers", server.name, plain, holdsKey));
    }
    case "copilot":
      return command("copilot", ["mcp", "add", "--transport", "http", ...colon, server.name, server.url], [join(copilotHome(env), "mcp-config.json")]);
    case "vscode": {
      const path = join(vscodeUserDir(env), "mcp.json");
      return file(path, () => addJsonServer(path, "servers", server.name, { type: "http", ...plain }, holdsKey));
    }
    case "gemini":
      return command("gemini", ["mcp", "add", "--scope", "user", "--transport", "http", ...colon, server.name, server.url], [join(geminiDir(env), "settings.json")]);
    case "opencode": {
      const dir = join(configHome(env), "opencode");
      const equals = header ? ["--header", `${header[0]}=${header[1]}`] : [];
      return command("opencode", ["mcp", "add", server.name, "--url", server.url, ...equals], [join(dir, "opencode.jsonc"), join(dir, "opencode.json")]);
    }
  }
}

type AgentResult = { agent: AgentInfo; status: "added" | "already" | "failed"; server?: string; where?: string; output?: string; keyFiles?: string[] };

function needsTerminal(source: SourceInfo, deps: ConnectDeps, agentFlag: string): CommandResult {
  const run = `${deps.self} connect ${source.id}${agentFlag}`;
  const powershell = run.startsWith('"') ? "\n(In PowerShell, type & and a space before it.)" : "";
  return fail(`${source.label} needs a key. Run this in your own terminal, so the key never passes through the chat:\n  ${run}${powershell}`, { error: "needs-terminal", run });
}

export async function runConnect(cwd: string, ctx: RunContext, deps: ConnectDeps = defaultDeps(cwd)): Promise<CommandResult> {
  const id = ctx.positionals[0];
  if (!id) return list(deps);
  const source = sourceById(id);
  if (!source) return fail(`There's no design source called "${id}". Choose one of: ${ids}.`, { error: "no-such-source" });
  const env: AgentEnv = { home: deps.home, platform: deps.platform, vars: deps.vars, which: deps.which };
  const config = JSON.parse(genericConfig(source));
  const manual = `To add it by hand, put this in your agent's MCP settings:\n${genericConfig(source)}`;
  const wanted = typeof ctx.flags?.agent === "string" ? ctx.flags.agent : undefined;
  const agentFlag = wanted ? ` --agent ${wanted}` : "";

  // Agents that already have the source are reported as such, and need no key.
  const configured = deps.configured();
  const has = (agent: AgentInfo) => configured.find((c) => c.id === source.id && c.agent === agent.id);

  let chosen: AgentInfo[];
  let note = "";
  if (wanted !== undefined) {
    const asked = wanted.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const unknown = asked.find((a) => !agentById(a));
    if (asked.length === 0 || unknown !== undefined) {
      return fail(`There's no agent called "${unknown ?? wanted}". Choose from: ${AGENT_IDS.join(", ")}.`, { error: "no-such-agent" });
    }
    chosen = AGENTS.filter((a) => asked.includes(a.id));
  } else {
    const found = AGENTS.filter((a) => a.found(env));
    if (found.length === 0) {
      return fail(`Motif didn't find a coding agent it can set up on this computer (${AGENTS.map((a) => a.label).join(", ")}).\n${manual}`, { error: "no-agent", config });
    }
    if (found.length === 1) chosen = found;
    else if (deps.interactive) {
      const menu = found.map((a, i) => `${i + 1} ${a.label}`).join(", ");
      const picked = pickAgents(await deps.ask(`Set up ${source.label} for which agents? ${menu}. Press Enter for all, or type numbers (such as 1,3): `), found);
      if (!picked) return fail("That isn't a choice from the list. Nothing changed.", { error: "bad-choice" });
      chosen = picked;
    } else if (source.connect.auth === "key" && found.some((a) => !has(a))) {
      return needsTerminal(source, deps, agentFlag);
    } else {
      chosen = found;
      note = `Setting it up in every agent found (choose some with --agent): ${found.map((a) => a.label).join(", ")}.`;
    }
  }

  let secret = "";
  if (source.connect.auth === "key" && chosen.some((a) => !has(a))) {
    if (!deps.interactive) return needsTerminal(source, deps, agentFlag);
    const key = await deps.readSecret(`Paste your ${source.label} key (get one at ${source.docs}); it won't be shown: `);
    if (!key) return fail("No key entered. Nothing changed.", { error: "no-key" });
    if (!KEY.test(key)) return fail(`That doesn't look like a ${source.label} key (keys are at least 8 letters, digits or - _ . ~ + / =). Nothing changed.`, { error: "bad-key" });
    secret = key;
  }
  const server: ServerSpec = { name: source.connect.name, url: source.connect.url, ...(secret ? { headers: { [source.connect.keyHeader!]: secret } } : {}) };
  const hide = (text: string) => (secret ? text.replaceAll(secret, "<your key>") : text);

  const results: AgentResult[] = [];
  for (const agent of chosen) {
    const existing = has(agent);
    if (existing) {
      results.push({ agent, status: "already", server: existing.server, where: existing.where });
      continue;
    }
    const r = await addTo(agent, server, deps, env);
    results.push(r.ok ? { agent, status: "added", keyFiles: r.keyFiles } : { agent, status: "failed", output: hide(r.output) });
  }

  const ok = results.filter((r) => r.status !== "failed");
  const failed = results.filter((r) => r.status === "failed");
  const lines: string[] = note ? [note] : [];
  for (const r of results) {
    if (r.status === "added") lines.push(`✓ ${r.agent.label}: added ${source.label} for all your projects.`);
    else if (r.status === "already") lines.push(`✓ ${r.agent.label}: already connected (server "${r.server}" in ${r.where}).`);
    else lines.push(`✗ ${r.agent.label}: couldn't add it: ${r.output}`);
  }
  if (failed.length > 0) lines.push(manual);
  if (source.connect.auth === "oauth" && ok.length > 0) {
    lines.push(`Next, sign in with your ${source.label} account:`);
    for (const r of ok) lines.push(`  ${r.agent.label}: ${r.agent.signIn(r.server ?? source.connect.name)}.`);
  }
  if (secret) {
    const git = deps.which("git");
    for (const file of ok.flatMap((r) => r.keyFiles ?? [])) {
      if (git && (await deps.run(git, ["-C", dirname(file), "ls-files", "--error-unmatch", basename(file)])).code === 0) {
        lines.push(`Warning: ${shown(env, file)}, which now holds your key, is tracked by git. Remove it from that repository before you push.`);
      }
    }
  }
  if (ok.length > 0) lines.push(source.note, `Cost: ${source.cost}.`);

  const data: Record<string, unknown> = {
    source: source.id,
    agents: results.map((r) => ({ agent: r.agent.id, status: r.status, ...(r.where ? { where: r.where } : {}), ...(r.output ? { output: r.output } : {}) })),
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
