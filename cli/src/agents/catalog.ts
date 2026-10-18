// The coding agents Motif sets design sources up for: how to find each, where it keeps its MCP settings, and how to
// sign in to a server there (Part 3 spec §7).
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type AgentId = "claude" | "codex" | "cursor" | "copilot" | "vscode" | "gemini" | "opencode";
export const AGENT_IDS: AgentId[] = ["claude", "codex", "cursor", "copilot", "vscode", "gemini", "opencode"];

/** What Motif needs to know about this computer to find agents and their settings. */
export interface AgentEnv {
  home: string;
  platform: NodeJS.Platform;
  vars: Record<string, string | undefined>;
  which: (cmd: string) => string | null;
}

export interface SettingsFile {
  path: string;
  /** The file as the developer is shown it. */
  where: string;
  format: "json" | "toml";
  /** Where the servers are inside the file. */
  key: "mcpServers" | "servers" | "mcp" | "mcp_servers";
  scope: "user" | "project";
}

export interface AgentInfo {
  id: AgentId;
  label: string;
  found(e: AgentEnv): boolean;
  /** What Motif looked for and didn't find, for "Motif didn't find it on this computer (…)". */
  notFound(e: AgentEnv): string;
  /** User settings first, then the project's. */
  settings(e: AgentEnv, cwd: string): SettingsFile[];
  /** How to sign in to a server that needs it (Refero, 60fps.design), as the end of a sentence. */
  signIn(server: string): string;
}

export function defaultAgentEnv(): AgentEnv {
  return { home: homedir(), platform: process.platform, vars: process.env, which: (c) => Bun.which(c) };
}

/** A path in the home folder as ~/… with forward slashes; any other path as it is. */
export function shown(e: AgentEnv, path: string): string {
  const rel = relative(e.home, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? `~/${rel.split(sep).join("/")}` : path;
}

export const codexHome = (e: AgentEnv) => e.vars.CODEX_HOME || join(e.home, ".codex");
/** CLAUDE_CONFIG_DIR as Claude Code reads it, a relative one from the home folder (where Motif runs claude); undefined when unset. */
const claudeConfigDir = (e: AgentEnv) => {
  const v = e.vars.CLAUDE_CONFIG_DIR;
  return v ? (isAbsolute(v) ? v : resolve(e.home, v)) : undefined;
};
/** Claude Code's user settings: in CLAUDE_CONFIG_DIR when it's set, otherwise ~/.claude.json. */
export const claudeSettings = (e: AgentEnv) => join(claudeConfigDir(e) ?? e.home, ".claude.json");
/** Claude Code's own installer puts it here and leaves PATH alone. */
const claudeInstalled = (e: AgentEnv) => join(e.home, ".local", "bin", e.platform === "win32" ? "claude.exe" : "claude");

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Claude Code installed but not on PATH: by its own installer (~/.local/bin/claude), or an older local install in its
 * folder (~/.claude/local, or CLAUDE_CONFIG_DIR's). On Windows that one's "claude" is a shell script, so its .cmd runs.
 */
export function claudeLocal(e: AgentEnv): string | null {
  const local = join(claudeConfigDir(e) ?? join(e.home, ".claude"), "local");
  const older = e.platform === "win32" ? ["claude.cmd", "claude.exe"].map((n) => join(local, "node_modules", ".bin", n)) : [join(local, "claude")];
  return [claudeInstalled(e), ...older].find(isFile) ?? null;
}
export const copilotHome = (e: AgentEnv) => e.vars.COPILOT_HOME || join(e.home, ".copilot");
export const geminiDir = (e: AgentEnv) => join(e.vars.GEMINI_CLI_HOME || e.home, ".gemini");
export const configHome = (e: AgentEnv) => e.vars.XDG_CONFIG_HOME || join(e.home, ".config");

/** VS Code's user profile folder, where its user mcp.json lives. */
export function vscodeUserDir(e: AgentEnv): string {
  if (e.platform === "win32") return join(e.vars.APPDATA || join(e.home, "AppData", "Roaming"), "Code", "User");
  if (e.platform === "darwin") return join(e.home, "Library", "Application Support", "Code", "User");
  return join(configHome(e), "Code", "User");
}

const user = (e: AgentEnv, path: string, format: SettingsFile["format"], key: SettingsFile["key"]): SettingsFile =>
  ({ path, where: shown(e, path), format, key, scope: "user" });
const project = (cwd: string, rel: string, format: SettingsFile["format"], key: SettingsFile["key"]): SettingsFile =>
  ({ path: join(cwd, ...rel.split("/")), where: rel, format, key, scope: "project" });

export const AGENTS: AgentInfo[] = [
  {
    id: "claude",
    label: "Claude Code",
    found: (e) => Boolean(e.which("claude") || claudeLocal(e)),
    notFound: (e) => `no "claude" command on PATH, and no ${shown(e, claudeInstalled(e))}`,
    settings: (e, cwd) => [user(e, claudeSettings(e), "json", "mcpServers"), project(cwd, ".mcp.json", "json", "mcpServers")],
    signIn: (s) => `in Claude Code, type /mcp, choose "${s}" and sign in`,
  },
  {
    id: "codex",
    label: "Codex",
    // Its settings folder too: Codex's app and editor extension use it without the codex command.
    found: (e) => Boolean(e.which("codex")) || existsSync(codexHome(e)),
    notFound: (e) => `no "codex" command on PATH, and no ${shown(e, codexHome(e))} folder`,
    settings: (e, cwd) => [user(e, join(codexHome(e), "config.toml"), "toml", "mcp_servers"), project(cwd, ".codex/config.toml", "toml", "mcp_servers")],
    signIn: (s) => `run "codex mcp login ${s}" in a terminal, or in Codex's app or editor extension open MCP servers in its settings and choose Authenticate`,
  },
  {
    id: "cursor",
    label: "Cursor",
    found: (e) => existsSync(join(e.home, ".cursor")) || Boolean(e.which("cursor") || e.which("cursor-agent")),
    notFound: (e) => `no ${shown(e, join(e.home, ".cursor"))} folder, and no "cursor" or "cursor-agent" command on PATH`,
    settings: (e, cwd) => [user(e, join(e.home, ".cursor", "mcp.json"), "json", "mcpServers"), project(cwd, ".cursor/mcp.json", "json", "mcpServers")],
    signIn: (s) => `in Cursor's settings, under MCP, sign in to "${s}" (or run "cursor-agent mcp login ${s}")`,
  },
  {
    id: "copilot",
    label: "GitHub Copilot CLI",
    found: (e) => Boolean(e.which("copilot")),
    notFound: () => 'no "copilot" command on PATH',
    settings: (e, cwd) => [
      user(e, join(copilotHome(e), "mcp-config.json"), "json", "mcpServers"),
      project(cwd, ".mcp.json", "json", "mcpServers"),
      project(cwd, ".github/mcp.json", "json", "mcpServers"),
    ],
    signIn: (s) => `in Copilot CLI, type /mcp and sign in to "${s}"`,
  },
  {
    id: "vscode",
    label: "VS Code",
    found: (e) => Boolean(e.which("code")) || existsSync(vscodeUserDir(e)),
    notFound: (e) => `no "code" command on PATH, and no ${shown(e, vscodeUserDir(e))} folder`,
    settings: (e, cwd) => [user(e, join(vscodeUserDir(e), "mcp.json"), "json", "servers"), project(cwd, ".vscode/mcp.json", "json", "servers")],
    signIn: (s) => `VS Code asks you to sign in to "${s}" the first time Copilot uses it`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    found: (e) => Boolean(e.which("gemini")),
    notFound: () => 'no "gemini" command on PATH',
    settings: (e, cwd) => [user(e, join(geminiDir(e), "settings.json"), "json", "mcpServers"), project(cwd, ".gemini/settings.json", "json", "mcpServers")],
    signIn: (s) => `in Gemini CLI, type /mcp auth ${s}`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    found: (e) => Boolean(e.which("opencode")),
    notFound: () => 'no "opencode" command on PATH',
    settings: (e, cwd) => [
      user(e, join(configHome(e), "opencode", "opencode.json"), "json", "mcp"),
      user(e, join(configHome(e), "opencode", "opencode.jsonc"), "json", "mcp"),
      project(cwd, "opencode.json", "json", "mcp"),
      project(cwd, "opencode.jsonc", "json", "mcp"),
    ],
    signIn: (s) => `run "opencode mcp auth ${s}" in a terminal`,
  },
];

export function agentById(id: string): AgentInfo | undefined {
  return AGENTS.find((a) => a.id === id);
}
