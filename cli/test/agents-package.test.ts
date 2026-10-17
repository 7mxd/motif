import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENT_PLUGIN_SCHEMA, agentPluginManifest, buildAgents, geminiManifest } from "../scripts/build-agents";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const MODES = ["design", "init", "feature", "review"];
const COMMANDS = MODES.map((m) => `commands/motif/${m}.toml`);
const fresh = () => join(tempDir("motif-agents-"), "agents");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, base) : [relative(base, path).replace(/\\/g, "/")];
  });
}

describe("the package for other agents", () => {
  const out = fresh();
  buildAgents(out);
  const read = (rel: string) => readFileSync(join(out, rel), "utf8");
  const files = walk(out);

  test("holds the whole skill as skills/motif, the two manifests and Gemini's commands, at the skill's version", () => {
    expect(walk(join(out, "skills/motif")).sort()).toEqual(walk(join(REPO, "skill")).sort());
    expect(readdirSync(join(out, "skills"))).toEqual(["motif"]);
    for (const f of ["plugin.json", "gemini-extension.json", ...COMMANDS, "README.md", "LICENSE", "THIRD-PARTY-NOTICES.txt"]) {
      expect(files).toContain(f);
    }
    const plugin = JSON.parse(read("plugin.json"));
    expect(plugin).toEqual(agentPluginManifest(VERSION));
    expect(plugin.$schema).toBe(AGENT_PLUGIN_SCHEMA);
    expect([plugin.name, plugin.version]).toEqual(["motif", VERSION]);
    expect(JSON.parse(read("gemini-extension.json"))).toEqual(geminiManifest(VERSION));
    expect(geminiManifest(VERSION)).toMatchObject({ name: "motif", version: VERSION });
  });

  test("Gemini's commands parse, start the motif skill and follow the right mode; /motif itself is the skill's own command", () => {
    for (const mode of MODES) {
      const c = Bun.TOML.parse(read(`commands/motif/${mode}.toml`)) as { description: string; prompt: string };
      expect(c.description).toContain("Motif");
      for (const s of ["motif skill", "{{args}}", `modes/${mode}.md`]) expect(c.prompt).toContain(s);
    }
    // Gemini makes every skill a slash command, so a commands/motif.toml would clash with the skill's /motif (Task 1 facts).
    expect(existsSync(join(out, "commands/motif.toml"))).toBe(false);
  });

  test("names no Claude Code placeholder anywhere", () => {
    const text = files.filter((f) => /\.(md|toml|json|txt)$/.test(f) || f === "LICENSE");
    expect(text.filter((f) => /\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/.test(read(f)))).toEqual([]);
  });

  test("its README says what the branch is, the version, and not to edit it", () => {
    const readme = read("README.md");
    for (const s of [`v${VERSION}`, "Don't edit", "https://github.com/7mxd/motif", "/motif"]) expect(readme).toContain(s);
  });

  test("a rebuild drops files that are no longer in skill/", () => {
    const dir = fresh();
    buildAgents(dir);
    writeFileSync(join(dir, "skills/motif/stale.md"), "old");
    buildAgents(dir);
    expect(existsSync(join(dir, "skills/motif/stale.md"))).toBe(false);
  });

  test("never replaces a folder that isn't a package build", () => {
    const dir = fresh();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "notes.txt"), "mine");
    expect(() => buildAgents(dir)).toThrow("isn't a Motif package build");
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("mine");
  });

  test("a Windows checkout (CRLF) still gives Gemini's commands and the README Unix line endings (review focus)", () => {
    const repo = tempDir("motif-crlf-repo-");
    cpSync(join(REPO, "skill"), join(repo, "skill"), { recursive: true });
    cpSync(join(REPO, "plugin/agents"), join(repo, "plugin/agents"), { recursive: true });
    for (const f of ["LICENSE", "THIRD-PARTY-NOTICES.txt"]) cpSync(join(REPO, f), join(repo, f));
    for (const f of [...COMMANDS, "branch-README.md"]) {
      const p = join(repo, "plugin/agents", f);
      writeFileSync(p, readFileSync(p, "utf8").replace(/\r?\n/g, "\r\n"));
    }
    const dir = fresh();
    buildAgents(dir, repo);
    for (const f of [...COMMANDS, "README.md", "plugin.json", "gemini-extension.json"]) {
      expect(readFileSync(join(dir, f), "utf8").includes("\r") ? f : "LF").toBe("LF");
    }
  });
});
