import { readFileSync } from "node:fs";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { AGENTS, type AgentEnv, type AgentId } from "../agents/catalog";
import { SOURCES, type SourceId } from "../sources/catalog";
import { stripBom } from "../text";

export type { SourceId };

export const SOURCE_LABELS = Object.fromEntries(SOURCES.map((s) => [s.id, s.label])) as Record<SourceId, string>;

export interface ConfiguredSource {
  id: SourceId;
  agent: AgentId;
  server: string;
  where: string;
}

export interface AgentServer {
  agent: AgentId;
  name: string;
  def: unknown;
  where: string;
}

/** A settings file's contents: undefined when there's no such file, null when it can't be read or parsed. */
export function readSettings(path: string, format: "json" | "toml"): Record<string, unknown> | null | undefined {
  let text: string;
  try {
    text = stripBom(readFileSync(path, "utf8"));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? undefined : null;
  }
  if (format === "toml") {
    try {
      return Bun.TOML.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: true });
  return errors.length === 0 && value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

const normPath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Every MCP server in every agent's user and project settings, and the settings files that couldn't be read. */
export function readAgentServers(cwd: string, e: AgentEnv): { servers: AgentServer[]; unreadable: string[] } {
  const servers: AgentServer[] = [];
  const unreadable: string[] = [];
  for (const agent of AGENTS) {
    for (const file of agent.settings(e, cwd)) {
      const doc = readSettings(file.path, file.format);
      if (doc === null) {
        if (!unreadable.includes(file.path)) unreadable.push(file.path);
        continue;
      }
      if (!doc) continue;
      const addAll = (map: unknown, where: string) => {
        if (map && typeof map === "object" && !Array.isArray(map)) {
          for (const [name, def] of Object.entries(map)) servers.push({ agent: agent.id, name, def, where });
        }
      };
      addAll(doc[file.key], file.where);
      if (agent.id === "claude" && file.scope === "user") {
        for (const [projectPath, project] of Object.entries((doc.projects as Record<string, unknown>) ?? {})) {
          if (normPath(projectPath) === normPath(cwd)) addAll((project as any)?.mcpServers, `${file.where} (this project)`);
        }
      }
    }
  }
  return { servers, unreadable };
}

/** The design sources among those servers: one entry per agent and source, from the first server that matches. */
export function sourcesIn(servers: AgentServer[]): ConfiguredSource[] {
  const found: ConfiguredSource[] = [];
  for (const s of servers) {
    const text = `${s.name}\n${JSON.stringify(s.def)}`;
    for (const source of SOURCES) {
      if (source.configPattern.test(text) && !found.some((f) => f.id === source.id && f.agent === s.agent)) {
        found.push({ id: source.id, agent: s.agent, server: s.name, where: s.where });
      }
    }
  }
  return found;
}

/** The design sources set up in each agent. Without e, it assumes this platform and no agent variables. */
export function findConfiguredSources(cwd: string, home: string, e: Partial<Omit<AgentEnv, "home">> = {}): ConfiguredSource[] {
  const env: AgentEnv = { home, platform: e.platform ?? process.platform, vars: e.vars ?? {}, which: e.which ?? (() => null) };
  return sourcesIn(readAgentServers(cwd, env).servers);
}
