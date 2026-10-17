import { homedir } from "node:os";
import type { CommandResult, RunContext } from "../cli/output";
import { agentById, defaultAgentEnv } from "../agents/catalog";
import { findConfiguredSources, type ConfiguredSource } from "../detect/sources";
import { SOURCES, sourceById, type SourceInfo } from "../sources/catalog";

export interface ConnectDeps {
  which: (cmd: string) => string | null;
  run: (exe: string, args: string[]) => Promise<{ code: number; output: string }>;
  /** True when a person is at the terminal (Motif never reads keys any other way). */
  interactive: boolean;
  readSecret: (prompt: string) => Promise<string>;
  configured: () => ConfiguredSource[];
  home: string;
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

export async function runCommand(exe: string, args: string[]): Promise<{ code: number; output: string }> {
  const { cmd, verbatim } = spawnArgs(exe, args);
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", windowsVerbatimArguments: verbatim });
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

function defaultDeps(cwd: string): ConnectDeps {
  const home = homedir();
  return {
    which: (cmd) => Bun.which(cmd),
    run: runCommand,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    readSecret,
    configured: () => findConfiguredSources(cwd, home, defaultAgentEnv()),
    home,
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

export async function runConnect(cwd: string, ctx: RunContext, deps: ConnectDeps = defaultDeps(cwd)): Promise<CommandResult> {
  const id = ctx.positionals[0];
  if (!id) return list(deps);
  const source = sourceById(id);
  if (!source) return fail(`There's no design source called "${id}". Choose one of: ${ids}.`, { error: "no-such-source" });

  const manual = `To use it with another agent, add this to that agent's MCP settings:\n${genericConfig(source)}`;
  const claude = deps.which("claude");
  if (!claude) {
    return fail(`Motif can set up ${source.label} for Claude Code, which isn't installed here.\n${manual}`, { error: "no-agent", config: JSON.parse(genericConfig(source)) });
  }

  const existing = deps.configured().find((c) => c.id === source.id);
  if (existing) {
    const lines = [`✓ ${source.label} is already connected (server "${existing.server}" in ${existing.where}).`];
    if (source.connect.auth === "oauth") lines.push(`If its tools don't show up, sign in: in Claude Code, type /mcp, choose "${existing.server}" and sign in with your ${source.label} account.`);
    return { command: "connect", exitCode: 0, text: lines.join("\n"), data: { source: source.id, already: true } };
  }

  const args = ["mcp", "add"];
  let secret = "";
  if (source.connect.auth === "key") {
    if (!deps.interactive) {
      const run = `${deps.self} connect ${source.id}`;
      const powershell = run.startsWith('"') ? "\n(In PowerShell, type & and a space before it.)" : "";
      return fail(`${source.label} needs a key. Run this in your own terminal, so the key never passes through the chat:\n  ${run}${powershell}`, { error: "needs-terminal", run });
    }
    const key = await deps.readSecret(`Paste your ${source.label} key (get one at ${source.docs}); it won't be shown: `);
    if (!key) return fail("No key entered. Nothing changed.", { error: "no-key" });
    if (!KEY.test(key)) return fail(`That doesn't look like a ${source.label} key (keys are at least 8 letters, digits or - _ . ~ + / =). Nothing changed.`, { error: "bad-key" });
    secret = key;
    args.push("--header", `${source.connect.keyHeader}: ${key}`);
  }
  args.push("--transport", "http", "--scope", "user", source.connect.name, source.connect.url);

  const result = await deps.run(claude, args);
  if (result.code !== 0) {
    const output = secret ? result.output.replaceAll(secret, "<your key>") : result.output;
    return fail(`Claude Code couldn't add ${source.label}:\n  ${output}\n${manual}`, { error: "agent-failed", output, config: JSON.parse(genericConfig(source)) });
  }

  const lines = [`✓ Added ${source.label} to Claude Code for all your projects. ${source.note}`];
  if (source.connect.auth === "oauth") lines.push(`Next: in Claude Code, type /mcp, choose "${source.connect.name}" and sign in with your ${source.label} account.`);
  if (source.connect.auth === "key") {
    const git = deps.which("git");
    if (git && (await deps.run(git, ["-C", deps.home, "ls-files", "--error-unmatch", ".claude.json"])).code === 0) {
      lines.push("Warning: ~/.claude.json, which now holds your key, is tracked by git. Remove it from that repository before you push.");
    }
  }
  lines.push(`Cost: ${source.cost}.`);
  return { command: "connect", exitCode: 0, text: lines.join("\n"), data: { source: source.id, added: true, scope: "user" } };
}

/** How the developer runs this Motif in their own terminal: the compiled tool's path, with forward slashes, which cmd, PowerShell and Git Bash all accept. */
export function selfCommand(execPath: string, platform: NodeJS.Platform = process.platform): string {
  const win = platform === "win32";
  const path = win ? execPath.replace(/\\/g, "/") : execPath;
  if (!/^motif(\.exe)?$/i.test(path.slice(path.lastIndexOf("/") + 1))) return "motif";
  if (/^[\w./:~+-]+$/.test(path)) return path;
  return win ? `"${path}"` : `'${path.replace(/'/g, "'\\''")}'`;
}
