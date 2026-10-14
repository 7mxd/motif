import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildPlugin, pluginManifest } from "../scripts/build-plugin";
import { runCommand } from "../src/commands/connect";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const MODES = ["design", "init", "feature", "review"];
const fresh = () => join(tempDir("motif-plugin-"), "claude-code");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, base) : [relative(base, path).replace(/\\/g, "/")];
  });
}

describe("the Claude Code development plugin", () => {
  test("is the whole skill plus four wrappers, at the skill's version", () => {
    const out = fresh();
    buildPlugin(out);
    expect(JSON.parse(readFileSync(join(out, ".claude-plugin/plugin.json"), "utf8"))).toEqual(pluginManifest(VERSION));
    expect(pluginManifest(VERSION).name).toBe("motif");
    expect(walk(join(out, "skills/motif")).sort()).toEqual(walk(join(REPO, "skill")).sort());
    expect(readFileSync(join(out, "skills/motif/SKILL.md"), "utf8")).toBe(readFileSync(join(REPO, "skill/SKILL.md"), "utf8"));
    expect(readdirSync(join(out, "skills")).sort()).toEqual(["design", "feature", "init", "motif", "review"]);
  });

  test("each wrapper is a command only people run, and hands over to its mode", () => {
    const out = fresh();
    buildPlugin(out);
    for (const mode of MODES) {
      const text = readFileSync(join(out, "skills", mode, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
      expect(text).toContain(`name: ${mode}\n`);
      expect(text).toContain("disable-model-invocation: true");
      expect(text).toContain(`\${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/${mode}.md`);
      expect(text).toContain("${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md");
      expect(text).toContain("$ARGUMENTS");
    }
  });

  test("says how to reach the two commands Claude Code's own /init and /review hide", () => {
    const readme = readFileSync(join(REPO, "plugin/claude-code/README.md"), "utf8");
    for (const s of ["/design", "/motif:init", "/feature", "/motif:review", "MOTIF_BIN", "bun run plugin", "/reload-plugins"]) expect(readme).toContain(s);
    expect(readFileSync(join(REPO, "plugin/claude-code/skills/init/SKILL.md"), "utf8")).toContain("/motif:init");
    expect(readFileSync(join(REPO, "plugin/claude-code/skills/review/SKILL.md"), "utf8")).toContain("/motif:review");
  });

  test("a rebuild drops files that are no longer in skill/", () => {
    const out = fresh();
    buildPlugin(out);
    writeFileSync(join(out, "skills/motif/stale.md"), "old");
    buildPlugin(out);
    expect(existsSync(join(out, "skills/motif/stale.md"))).toBe(false);
  });

  test("never replaces a folder that isn't a plugin build", () => {
    const out = tempDir("motif-plugin-");
    writeFileSync(join(out, "important.txt"), "keep me");
    expect(() => buildPlugin(out)).toThrow("isn't a Motif plugin build");
    expect(readFileSync(join(out, "important.txt"), "utf8")).toBe("keep me");
  });

  test.skipIf(process.platform === "win32")("keeps the tool's launcher executable", () => {
    const out = fresh();
    buildPlugin(out);
    expect(statSync(join(out, "skills/motif/bin/motif")).mode & 0o111).not.toBe(0);
  });

  test.skipIf(!Bun.which("claude"))("passes claude plugin validate (needs Claude Code)", async () => {
    const out = fresh();
    buildPlugin(out);
    const r = await runCommand(Bun.which("claude")!, ["plugin", "validate", out]);
    expect(r.output).toContain("Validation passed");
    expect(r.code).toBe(0);
  }, 60_000);

  test("the main README lists every command and says how to try the skill", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf8");
    for (const s of ["`motif connect`", "--tokens", "plugin/claude-code/README.md"]) expect(readme).toContain(s);
  });
});
