import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { COMMAND_NAMES } from "../src/main";
import { lineCount, lineLimit, lintSkillMarkdown } from "./skill-lint";

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
  const exists = (p: string) => ["knowledge/motion.md", "contract/spec.md", "modes"].includes(p);
  const lint = (file: string, text: string) => lintSkillMarkdown(file, text, { exists, commands: ["doctor", "shot"] });

  test("line limits depend on where the file is; a final newline doesn't count", () => {
    expect(lineLimit("SKILL.md")).toBe(500);
    expect(lineLimit("knowledge/motion.md")).toBe(300);
    expect(lineLimit("modes/init.md")).toBe(400);
    expect(lineCount("a\nb\n")).toBe(2);
    expect(lineCount("a\nb")).toBe(2);
    expect(lint("knowledge/x.md", "line\n".repeat(300))).toEqual([]);
    expect(lint("knowledge/x.md", "line\n".repeat(301))).toEqual(["knowledge/x.md is 301 lines; the limit is 300."]);
  });

  test("relative links must resolve inside the skill folder; web links and anchors are fine", () => {
    expect(lint("sources/a.md", "See [motion](../knowledge/motion.md), [web](https://motion.dev) and [here](#top).")).toEqual([]);
    expect(lint("modes/init.md", "Read [the spec](../contract/spec.md#roles).")).toEqual([]);
    expect(lint("modes/init.md", 'Read [the spec](../contract/spec.md "The format") or [it](<../contract/spec.md>).')).toEqual([]);
    expect(lint("modes/init.md", "Read [gone](../knowledge/gone.md).")).toEqual(['modes/init.md links to "../knowledge/gone.md", which doesn\'t exist.']);
    expect(lint("modes/init.md", "Read [gone][g].\n\n[g]: ../knowledge/gone.md")).toEqual(['modes/init.md links to "../knowledge/gone.md", which doesn\'t exist.']);
    expect(lint("sources/a.md", "See [the record](../../docs/decisions/0002-design-sources.md).")).toEqual([
      'sources/a.md links to "../../docs/decisions/0002-design-sources.md", which is outside the skill folder (agents get only the skill folder).',
    ]);
    expect(lint("modes/init.md", "```md\n[example](nowhere.md)\n```")).toEqual([]);
  });

  test("agent-specific names, settings and variables are not portable", () => {
    expect(lint("modes/init.md", "Use the AskUserQuestion tool.")).toHaveLength(1);
    expect(lint("modes/init.md", "Call mcp__refero__refero_get_style.")).toHaveLength(1);
    expect(lint("modes/init.md", "---\nname: x\nallowed-tools: Bash\n---\n")).toHaveLength(1);
    expect(lint("modes/init.md", "Run ${CLAUDE_SKILL_DIR}/bin/motif")).toHaveLength(1);
    expect(lint("modes/init.md", "Ask the developer one question with three options.")).toEqual([]);
    expect(lint("modes/init.md", "```yaml\ncontext: fork\n```")).toEqual([]);
  });

  test("motif commands named in code must exist, however the tool is called", () => {
    expect(lint("modes/init.md", "Run `motif shot --audit`.\n\n```\nmotif doctor --json\n```")).toEqual([]);
    expect(lint("modes/init.md", "Run `motif fly`.")).toEqual(['modes/init.md mentions "motif fly", which isn\'t a Motif command.']);
    expect(lint("modes/init.md", '```\n"<skill folder>/bin/motif" fly\n```')).toEqual(['modes/init.md mentions "motif fly", which isn\'t a Motif command.']);
    expect(lint("modes/init.md", 'Run `& "<skill folder>\\bin\\motif.ps1" doctor` or `bin\\motif.cmd shot`.')).toEqual([]);
    expect(lint("modes/init.md", "Run `motif help` or `motif <command>`; `design/motif.json` too.")).toEqual([]);
    expect(lint("modes/init.md", "Motif keeps the motif tool small, and `DESIGN.md` motif reads it.")).toEqual([]);
  });

  test("shell examples work in every shell", () => {
    expect(lint("modes/init.md", "```bash\nnpm install && npm run dev\n```")).toHaveLength(1);
    expect(lint("modes/init.md", "```\nexport MOTIF_BIN=/x/motif\n```")).toHaveLength(1);
    expect(lint("modes/init.md", "```sh\necho $(pwd)\n```")).toHaveLength(1);
    expect(lint("modes/init.md", "```bash\nnpm install motion\n```")).toEqual([]);
    expect(lint("modes/init.md", '```json\n{ "a": "x && y" }\n```')).toEqual([]);
  });

  test("SKILL.md has Agent Skills frontmatter and nothing else in it", () => {
    const fm = (body: string) => `---\n${body}\n---\n\n# Motif\n`;
    expect(lint("SKILL.md", fm("name: motif\ndescription: Builds UI.\nlicense: MIT\nmetadata:\n  author: 7mxd"))).toEqual([]);
    expect(lint("SKILL.md", "# Motif\n")).toEqual(["SKILL.md needs frontmatter (name and description between --- lines) at the very top."]);
    expect(lint("SKILL.md", fm("name: ui\ndescription: Builds UI."))).toEqual(["SKILL.md frontmatter needs name: motif (it must match the folder the skill is installed in)."]);
    expect(lint("SKILL.md", fm(`name: motif\ndescription: ${"x".repeat(1025)}`))).toEqual(["SKILL.md description must be 1–1024 characters (it has 1025)."]);
    expect(lint("SKILL.md", fm("name: motif\ndescription: Builds UI.\nversion: 1"))).toEqual([
      'SKILL.md frontmatter has "version", which the Agent Skills format doesn\'t define (allowed: name, description, license, compatibility, metadata).',
    ]);
    expect(lint("SKILL.md", fm(`name: motif\ndescription: Builds UI.\ncompatibility: ${"x".repeat(501)}`))).toEqual(["SKILL.md compatibility must be at most 500 characters (it has 501)."]);
  });

  test("fences close as Markdown says; info strings may carry attributes; C:/ isn't a web link; NAME=value prefixes aren't portable (backlog)", () => {
    const lint = (text: string, file = "modes/a.md") => lintSkillMarkdown(file, text, { exists: () => true, commands: ["doctor"] });
    // A longer closing fence, or one at another indent, still closes the block: the motif command inside is checked.
    expect(lint("```sh\nmotif nonsense\n````\n")).toEqual(['modes/a.md mentions "motif nonsense", which isn\'t a Motif command.']);
    expect(lint("  ```sh\nmotif nonsense\n```\n")).toEqual(['modes/a.md mentions "motif nonsense", which isn\'t a Motif command.']);
    // "bash title=x" is a bash block: its portability is checked.
    expect(lint("```bash title=install\nmotif doctor && motif doctor\n```\n")).toEqual([expect.stringContaining("chains commands with && or ||")]);
    expect(lint("```sh\nMOTIF_HOME=/tmp/m motif doctor\n```\n")).toEqual([expect.stringContaining("NAME=value")]);
    expect(lint("[x](C:/Users/me/x.md)\n")).toEqual([expect.stringContaining("absolute path")]);
  });

  test("a description written as a YAML block is read whole (backlog)", () => {
    const fm = (description: string) => `---\nname: motif\ndescription: ${description}\n---\n# Motif\n`;
    expect(lintSkillMarkdown("SKILL.md", fm(">\n  Design guide tools for agents.\n  Mockups first."), { exists: () => true, commands: [] })).toEqual([]);
    expect(lintSkillMarkdown("SKILL.md", fm(">\n" + "  " + "x".repeat(1100)), { exists: () => true, commands: [] })).toEqual([
      "SKILL.md description must be 1–1024 characters (it has 1100).",
    ]);
  });

  test("lint: a fence inside a list closes; NAME=value lines and comments aren't one-command prefixes; a YAML block with a blank line or a comment is read whole (review of batch G)", () => {
    const lint = (text: string, file = "modes/a.md") => lintSkillMarkdown(file, text, { exists: () => true, commands: ["doctor"] });
    expect(lint("- step\n\n    ```sh\n    motif doctor\n    ```\n\nRun `motif nonsense`.\n")).toEqual(['modes/a.md mentions "motif nonsense", which isn\'t a Motif command.']);
    expect(lint("```sh\nMOTIF_HOME=/x\nmotif doctor\n```\n")).toEqual([]);
    expect(lint("```sh\nPORT=3000 # dev\n```\n")).toEqual([]);
    const fm = (description: string) => `---\nname: motif\ndescription: ${description}\n---\n# Motif\n`;
    const long = "x".repeat(600);
    expect(lintSkillMarkdown("SKILL.md", fm(`>\n  ${long}\n\n  ${long}`), { exists: () => true, commands: [] })).toEqual([expect.stringContaining("1–1024 characters")]);
    expect(lintSkillMarkdown("SKILL.md", fm(`> # note\n  ${long}\n  ${long}`), { exists: () => true, commands: [] })).toEqual([expect.stringContaining("1–1024 characters")]);
  });

  test("UX pattern files have the five sections, in order", () => {
    const good = "# Sign-in\n\n## Goal\n\n## Anatomy\n\n## Required states\n\n## Common mistakes\n\n## Mobile and web\n";
    expect(lint("knowledge/ux-patterns/sign-in.md", good)).toEqual([]);
    expect(lint("knowledge/ux-patterns/sign-in.md", good.replace("## Anatomy\n\n", ""))).toHaveLength(1);
    expect(lint("knowledge/motion.md", "# Motion\n\n## Anything\n")).toEqual([]);
  });

  test("agent tool names appear only in agents.md (Part 3)", () => {
    expect(lint("modes/feature.md", "Ask with ask_user.\n")).toEqual(["modes/feature.md uses a specific agent's tool name."]);
    expect(lint("modes/feature.md", "Use request_user_input.\n")).toEqual(["modes/feature.md uses a specific agent's tool name."]);
    expect(lint("modes/feature.md", "Use AskQuestion or askQuestions.\n")).toEqual(["modes/feature.md uses a specific agent's tool name."]);
    expect(lint("agents.md", "| Codex | request_user_input | AskUserQuestion | ask_user |\n")).toEqual([]);
    expect(lint("agents.md", "Use $ARGUMENTS.\n")).toEqual(["agents.md uses an agent-specific variable."]);
  });
});

describe("everything in skill/", () => {
  test("passes the lint rules", () => {
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((f) => lintSkillMarkdown(f, readFileSync(join(SKILL, f), "utf8"), opts));
    expect(problems).toEqual([]);
  });
});

describe("the React checks guide on Tailwind 3 (review of batch C2)", () => {
  test("says how to fix classes there, where Motif writes only the variables", () => {
    const checks = readFileSync(join(SKILL, "adapters/react-web/checks.md"), "utf8");
    expect(checks).toContain("On Tailwind 3");
    expect(checks).toContain("bg-[var(--motif-color-action-primary)]");
  });
});

describe("the guides: from the backlog", () => {
  const read = (p: string) => readFileSync(join(SKILL, p), "utf8");

  test("the React guide's commands work with the project's own package manager", () => {
    const guide = read("adapters/react-web/README.md");
    for (const s of ["pnpm add", "yarn add", "bun add", "pnpm-lock.yaml"]) expect(guide).toContain(s);
  });

  test("a font without a Fontsource package is self-hosted under the theme's name", () => {
    expect(read("adapters/react-web/tokens.md")).toContain("@font-face");
  });

  test("plain web: the button shows hover, the theme choice is set before the page draws and can be undone fully, the backdrop fades in", () => {
    expect(read("adapters/plain-web/components.md")).toContain(":hover");
    const tokens = read("adapters/plain-web/tokens.md");
    expect(tokens).toContain('localStorage.removeItem("theme")');
    expect(tokens).toContain("<head>");
    expect(read("adapters/plain-web/README.md")).toContain("theme");
    expect(read("adapters/plain-web/motion.md")).toMatch(/::backdrop \{[^}]*animation/);
  });

  test("the head script keeps its names to itself and survives blocked storage; a site that blocks inline scripts has an alternative (review of batch G)", () => {
    const tokens = read("adapters/plain-web/tokens.md").replace(/\r\n/g, "\n");
    expect(tokens).toContain("<script>\n  try {");
    expect(tokens).toContain("theme.js");
  });

  test("self-hosted fonts: a variable file covers its weights, static files get one @font-face each (review of batch G)", () => {
    const tokens = read("adapters/react-web/tokens.md");
    expect(tokens).toContain("variable font");
    expect(tokens).toContain("font-weight: 700;");
  });

  test("the React state script works without a form and on any field; the Vite row keeps its options (review of batch G)", () => {
    const checks = read("adapters/react-web/checks.md");
    expect(checks).toContain("Object.getPrototypeOf(field)");
    expect(checks).toContain("field.form?.requestSubmit()");
    const readme = read("adapters/react-web/README.md");
    expect(readme).toContain("`pnpm create vite my-app --template react-ts`");
    expect(readme).toContain("bun.lockb");
  });

  test("React's checks say how to capture screens behind a form, and review links both stacks; the rebuild step's --state is only for scripts you have", () => {
    expect(read("adapters/react-web/checks.md")).toContain("## Screens behind a form or a click");
    const review = read("modes/review.md");
    expect(review).toContain("../adapters/react-web/checks.md#screens-behind-a-form-or-a-click");
    expect(review).toContain("leave --state out if there are none");
  });
});
