import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../text";

export type SourceId = "refero" | "21st" | "60fps" | "motion";

export const SOURCE_LABELS: Record<SourceId, string> = {
  refero: "Refero",
  "21st": "21st.dev",
  "60fps": "60fps",
  motion: "Motion",
};

/** Provisional patterns matched against "<server name>\n<server config JSON>". Plan 1D pins verified names. */
const SOURCE_PATTERNS: Record<SourceId, RegExp> = {
  refero: /refero/i,
  "21st": /21st/i,
  "60fps": /60fps/i,
  motion: /^motion$|motion\.dev|motion-?mcp/im,
};

export interface ConfiguredSource {
  id: SourceId;
  server: string;
  where: string;
}

function readJson(path: string): any {
  try {
    return JSON.parse(stripBom(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

const normPath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export function findConfiguredSources(cwd: string, home: string): ConfiguredSource[] {
  const servers: { name: string; def: unknown; where: string }[] = [];
  const addAll = (map: unknown, where: string) => {
    if (map && typeof map === "object") {
      for (const [name, def] of Object.entries(map)) servers.push({ name, def, where });
    }
  };

  addAll(readJson(join(cwd, ".mcp.json"))?.mcpServers, ".mcp.json");
  const user = readJson(join(home, ".claude.json"));
  addAll(user?.mcpServers, "~/.claude.json");
  for (const [projectPath, project] of Object.entries(user?.projects ?? {})) {
    if (normPath(projectPath) === normPath(cwd)) addAll((project as any)?.mcpServers, "~/.claude.json (this project)");
  }

  const found: ConfiguredSource[] = [];
  for (const s of servers) {
    const text = `${s.name}\n${JSON.stringify(s.def)}`;
    for (const id of Object.keys(SOURCE_PATTERNS) as SourceId[]) {
      if (SOURCE_PATTERNS[id].test(text) && !found.some((f) => f.id === id)) {
        found.push({ id, server: s.name, where: s.where });
      }
    }
  }
  return found;
}
