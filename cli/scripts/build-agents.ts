// Builds the package every agent but Claude Code installs Motif from (the plugins branch): skill/ as skills/motif/,
// the Agent Plugins manifest Codex, Cursor and Copilot read, and a Gemini CLI extension with /motif:… commands.
// Run: bun run packages
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pluginManifest } from "./build-plugin";

const REPO = resolve(import.meta.dir, "../..");
export const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const lf = (text: string) => text.replace(/\r\n/g, "\n");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The Agent Plugins 1.0 manifest at the package's root; skills/ is found without being named. */
export function agentPluginManifest(version: string): Record<string, unknown> {
  const m = pluginManifest(version) as Record<string, unknown>;
  return {
    $schema: AGENT_PLUGIN_SCHEMA,
    name: m.name,
    version,
    description: m.description,
    author: m.author,
    homepage: m.homepage,
    repository: m.repository,
    license: m.license,
    keywords: m.keywords,
  };
}

/** Gemini CLI's extension manifest: no context file (nothing added to every session) and no MCP servers. */
export function geminiManifest(version: string): Record<string, unknown> {
  const m = pluginManifest(version) as Record<string, unknown>;
  return { name: m.name, version, description: m.description };
}

/** True for a folder an earlier build made. */
export function isAgentsBuild(dir: string): boolean {
  try {
    return JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")).name === "motif" && existsSync(join(dir, "gemini-extension.json"));
  } catch {
    return false;
  }
}

/** Every file under dir, relative, with forward slashes. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path).map((f) => `${name}/${f}`) : [name];
  });
}

/** Replaces outDir with a fresh build; refuses a folder that has files and isn't an earlier build. */
export function buildAgents(outDir: string, repo: string = REPO): void {
  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !isAgentsBuild(outDir)) {
    throw new Error(`${outDir} isn't a Motif package build, so it wasn't replaced.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const version = readFileSync(join(repo, "skill", "VERSION"), "utf8").trim();
  cpSync(join(repo, "skill"), join(outDir, "skills", "motif"), { recursive: true });
  if (process.platform !== "win32") chmodSync(join(outDir, "skills", "motif", "bin", "motif"), 0o755);
  writeFileSync(join(outDir, "plugin.json"), json(agentPluginManifest(version)));
  writeFileSync(join(outDir, "gemini-extension.json"), json(geminiManifest(version)));
  const source = join(repo, "plugin", "agents");
  for (const rel of filesUnder(join(source, "commands"))) {
    const to = join(outDir, "commands", rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, lf(readFileSync(join(source, "commands", rel), "utf8")));
  }
  writeFileSync(join(outDir, "README.md"), lf(readFileSync(join(source, "branch-README.md"), "utf8")).replaceAll("{version}", version));
  for (const f of ["LICENSE", "THIRD-PARTY-NOTICES.txt"]) writeFileSync(join(outDir, f), lf(readFileSync(join(repo, f), "utf8")));
}

if (import.meta.main) {
  const out = resolve(process.argv[2] ?? join(REPO, "dist", "agents"));
  buildAgents(out);
  console.log(`Built the package for other agents in ${out}`);
}
