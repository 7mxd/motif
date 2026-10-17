import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENT_PLUGIN_SCHEMA, agentPluginManifest, buildAgents, buildAgentsLocal, geminiManifest } from "../scripts/build-agents";
import { AGENT_MARKETPLACES, agentMarketplaces } from "../scripts/marketplace";
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

describe("the marketplaces that reach the package", () => {
  test("the package carries each agent's marketplace with Motif at its own root, for installs from the branch itself (Task 1 facts)", () => {
    const out = fresh();
    buildAgents(out);
    for (const [path, file] of Object.entries(agentMarketplaces({ local: "./" }))) {
      expect(JSON.parse(readFileSync(join(out, path), "utf8"))).toEqual(file);
    }
  });

  test("the local marketplace holds the package as motif/ and each agent's marketplace pointing at it", () => {
    const agents = fresh();
    buildAgents(agents);
    const local = join(tempDir("motif-agents-local-"), "agents-local");
    buildAgentsLocal(agents, local);
    expect(walk(join(local, "motif")).sort()).toEqual(walk(agents).sort());
    for (const path of Object.values(AGENT_MARKETPLACES)) {
      expect(JSON.stringify(JSON.parse(readFileSync(join(local, path), "utf8")))).toContain("./motif");
    }
  });

  test("never replaces a folder that isn't a local marketplace build", () => {
    const agents = fresh();
    buildAgents(agents);
    const local = join(tempDir("motif-agents-local-"), "agents-local");
    mkdirSync(local, { recursive: true });
    writeFileSync(join(local, "notes.txt"), "mine");
    expect(() => buildAgentsLocal(agents, local)).toThrow("isn't a Motif local marketplace build");
  });
});

describe("the docs for the package", () => {
  const read = (rel: string) => readFileSync(join(REPO, rel), "utf8").replace(/\r\n/g, "\n");

  test("the Develop guide says how to build the package and try it in every agent", () => {
    const guide = read("plugin/agents/README.md");
    for (const s of [
      "bun run packages", "bun run skill:archives", "dist/agents-local", "codex plugin marketplace add", "copilot plugin marketplace add",
      "gemini extensions link", "cursor-agent", "install.sh", "install.ps1", "MOTIF_BIN", "bun scripts/agent-checks.ts --source local", "plugins branch",
      "`bun run build`, which writes `dist/motif`", "MOTIF_CURSOR_API_KEY",
    ]) expect(guide).toContain(s);
  });

  test("decision 0005 records the plugins branch, /motif and the install script, and the core spec links Part 3's spec", () => {
    const decision = read("docs/decisions/0005-agent-packages.md");
    for (const s of ["plugins", "/motif", "install.sh", "2026-10-17-motif-part3-agents-design.md"]) expect(decision).toContain(s);
    const core = read("docs/specs/2026-10-12-motif-core-design.md");
    expect(core).toContain("2026-10-17-motif-part3-agents-design.md");
    expect(core).toContain("skill/agents.md");
  });

  test("the Part 3 spec matches what was built: no /motif command file, no skills field, Codex and VS Code settings edited directly", () => {
    const spec = read("docs/specs/2026-10-17-motif-part3-agents-design.md");
    expect(spec).not.toContain("├── commands/motif.toml");
    expect(spec).not.toContain('`skills: "./skills/"`');
    expect(spec).toContain("for a URL it starts a sign-in and waits");
    expect(spec).toContain("which doubles its quotes");
  });
});
