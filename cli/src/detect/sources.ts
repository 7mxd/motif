import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCES, type SourceId } from "../sources/catalog";
import { stripBom } from "../text";

export type { SourceId };

export const SOURCE_LABELS = Object.fromEntries(SOURCES.map((s) => [s.id, s.label])) as Record<SourceId, string>;

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
    for (const source of SOURCES) {
      if (source.configPattern.test(text) && !found.some((f) => f.id === source.id)) {
        found.push({ id: source.id, server: s.name, where: s.where });
      }
    }
  }
  return found;
}
