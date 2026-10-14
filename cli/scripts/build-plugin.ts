// Assembles the Claude Code development plugin: plugin/claude-code/skills/ plus skill/ as skills/motif/.
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "../..");

export function pluginManifest(version: string): Record<string, unknown> {
  return {
    name: "motif",
    displayName: "Motif",
    version,
    description: "Design and build polished, consistent app UI from a design guide your agent follows: mockups before code, screenshots after, and reviews in plain words.",
    author: { name: "7mxd" },
    homepage: "https://github.com/7mxd/motif",
    repository: "https://github.com/7mxd/motif",
    license: "MIT",
    keywords: ["design", "ui", "ux", "motion", "design-system", "accessibility"],
  };
}

/** Replaces outDir with a fresh build; refuses a folder that has files and isn't an earlier build. */
export function buildPlugin(outDir: string, repo: string = REPO): void {
  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !existsSync(join(outDir, ".claude-plugin", "plugin.json"))) {
    throw new Error(`${outDir} isn't a Motif plugin build, so it wasn't replaced.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, ".claude-plugin"), { recursive: true });
  const version = readFileSync(join(repo, "skill", "VERSION"), "utf8").trim();
  writeFileSync(join(outDir, ".claude-plugin", "plugin.json"), `${JSON.stringify(pluginManifest(version), null, 2)}\n`);
  cpSync(join(repo, "plugin", "claude-code", "skills"), join(outDir, "skills"), { recursive: true });
  cpSync(join(repo, "skill"), join(outDir, "skills", "motif"), { recursive: true });
  if (process.platform !== "win32") chmodSync(join(outDir, "skills", "motif", "bin", "motif"), 0o755);
}

if (import.meta.main) {
  const out = resolve(process.argv[2] ?? join(REPO, "dist", "claude-code"));
  buildPlugin(out);
  console.log(`Built the Claude Code plugin in ${out}`);
}
