import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { COMMAND_NAMES } from "../src/main";
import { lineLimit, lintSkillMarkdown } from "./skill-lint";

const SKILL = join(import.meta.dir, "../../skill");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "vendor" ? [] : walk(path);
    return [path];
  });
}

const files = walk(SKILL)
  .filter((f) => f.endsWith(".md"))
  .map((f) => relative(SKILL, f).replace(/\\/g, "/"));
const opts = { exists: (p: string) => existsSync(join(SKILL, p)), commands: COMMAND_NAMES };

describe("the lint rules", () => {
  const exists = (p: string) => ["knowledge/motion.md", "contract/spec.md"].includes(p);
  const lint = (file: string, text: string) => lintSkillMarkdown(file, text, { exists, commands: ["doctor", "shot"] });

  test("line limits depend on where the file is", () => {
    expect(lineLimit("SKILL.md")).toBe(500);
    expect(lineLimit("knowledge/motion.md")).toBe(300);
    expect(lineLimit("modes/init.md")).toBe(400);
    expect(lint("knowledge/x.md", "line\n".repeat(301))).toEqual(["knowledge/x.md is 302 lines; the limit is 300."]);
  });

  test("relative links must resolve; web links and anchors are fine", () => {
    expect(lint("sources/a.md", "See [motion](../knowledge/motion.md), [web](https://motion.dev) and [here](#top).")).toEqual([]);
    expect(lint("modes/init.md", "Read [the spec](../contract/spec.md#roles).")).toEqual([]);
    expect(lint("modes/init.md", "Read [gone](../knowledge/gone.md).")).toEqual(['modes/init.md links to "../knowledge/gone.md", which doesn\'t exist.']);
  });

  test("agent-specific names, settings and variables are not portable", () => {
    expect(lint("SKILL.md", "Use the AskUserQuestion tool.")).toHaveLength(1);
    expect(lint("SKILL.md", "Call mcp__refero__refero_get_style.")).toHaveLength(1);
    expect(lint("SKILL.md", "---\nname: motif\nallowed-tools: Bash\n---\n")).toHaveLength(1);
    expect(lint("SKILL.md", "Run ${CLAUDE_SKILL_DIR}/bin/motif")).toHaveLength(1);
    expect(lint("SKILL.md", "Ask the developer one question with three options.")).toEqual([]);
  });

  test("motif commands must exist", () => {
    expect(lint("modes/init.md", "Run `motif shot --audit`.\n\n```\nmotif doctor --json\n```")).toEqual([]);
    expect(lint("modes/init.md", "Run `motif fly`.")).toEqual(['modes/init.md mentions "motif fly", which isn\'t a Motif command.']);
    expect(lint("modes/init.md", "Motif keeps the motif tool small.")).toEqual([]);
  });

  test("UX pattern files have the five sections, in order", () => {
    const good = "# Sign-in\n\n## Goal\n\n## Anatomy\n\n## Required states\n\n## Common mistakes\n\n## Mobile and web\n";
    expect(lint("knowledge/ux-patterns/sign-in.md", good)).toEqual([]);
    expect(lint("knowledge/ux-patterns/sign-in.md", good.replace("## Anatomy\n\n", ""))).toHaveLength(1);
    expect(lint("knowledge/motion.md", "# Motion\n\n## Anything\n")).toEqual([]);
  });
});

describe("everything in skill/", () => {
  test("passes the lint rules", () => {
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((f) => lintSkillMarkdown(f, readFileSync(join(SKILL, f), "utf8"), opts));
    expect(problems).toEqual([]);
  });
});
