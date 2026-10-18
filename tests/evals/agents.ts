// What the evals check after each session: the developer's own coding agents' MCP servers, which no session may change.
import { AGENTS, defaultAgentEnv, type AgentEnv } from "../../cli/src/agents/catalog";
import { readSettings } from "../../cli/src/detect/sources";

/**
 * The MCP servers in each agent's user settings (where Motif connect or "claude mcp add" would add one), as text to
 * compare: "none" without the file, null when it can't be read just now (Claude Code may be writing it).
 */
export function agentSettings(e: AgentEnv = defaultAgentEnv()): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const agent of AGENTS) {
    for (const file of agent.settings(e, e.home)) {
      if (file.scope !== "user") continue;
      const doc = readSettings(file.path, file.format);
      out[file.where] = doc === undefined ? "none" : doc === null ? null : JSON.stringify(doc[file.key] ?? null);
    }
  }
  return out;
}

/** The settings files whose servers changed between two looks (one that couldn't be read either time isn't counted). */
export function changedSettings(before: Record<string, string | null>, after: Record<string, string | null>): string[] {
  return Object.keys({ ...before, ...after }).filter((k) => before[k] !== null && after[k] !== null && before[k] !== after[k]);
}
