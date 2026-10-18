// What the evals check after each session: the developer's own coding agents' MCP servers, which no session may change.
import { AGENTS, defaultAgentEnv, type AgentEnv } from "../../cli/src/agents/catalog";
import { readSettings } from "../../cli/src/detect/sources";

/** A value as JSON with its object keys sorted, so the same servers written in another order compare equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical((value as Record<string, unknown>)[k])]));
  }
  return value;
}

/**
 * The MCP servers in each agent's user settings (where motif connect or "claude mcp add" would add one), as JSON to
 * compare: no file, no servers key and no servers are all "{}"; null when the file can't be read just now (Claude Code
 * may be writing it).
 */
export function agentSettings(e: AgentEnv = defaultAgentEnv()): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const agent of AGENTS) {
    for (const file of agent.settings(e, e.home)) {
      if (file.scope !== "user") continue;
      const doc = readSettings(file.path, file.format);
      out[file.where] = doc === null ? null : JSON.stringify(canonical(doc?.[file.key] ?? {}));
    }
  }
  return out;
}

const servers = (json: string | null | undefined): Record<string, unknown> => {
  const v = json ? JSON.parse(json) : {};
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
};

/**
 * The settings files whose servers changed between two looks, each with the servers added, removed or changed ("~/.cursor/mcp.json
 * (added figma)"); a file that couldn't be read either time isn't counted.
 */
export function changedSettings(before: Record<string, string | null>, after: Record<string, string | null>): string[] {
  return Object.keys({ ...before, ...after })
    .filter((k) => before[k] !== null && after[k] !== null && (before[k] ?? "{}") !== (after[k] ?? "{}"))
    .map((k) => {
      const b = servers(before[k]);
      const a = servers(after[k]);
      const added = Object.keys(a).filter((n) => !(n in b));
      const removed = Object.keys(b).filter((n) => !(n in a));
      const changed = Object.keys(a).filter((n) => n in b && JSON.stringify(a[n]) !== JSON.stringify(b[n]));
      const parts = [added.length ? `added ${added.join(", ")}` : "", removed.length ? `removed ${removed.join(", ")}` : "", changed.length ? `changed ${changed.join(", ")}` : ""];
      return `${k} (${parts.filter(Boolean).join("; ") || "changed"})`;
    });
}
