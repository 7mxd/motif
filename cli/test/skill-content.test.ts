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

describe("the Compose guide matches the tool", () => {
  const read = (p: string) => readFileSync(join(SKILL, p), "utf8").replace(/\r\n/g, "\n");

  test("its words for a missing Android SDK, the setup and a state are the tool's own", async () => {
    const { NO_ANDROID_SDK } = await import("../src/stacks/compose/doctor");
    const { COMPOSE_FIRST_RUN, SETUP_FILE } = await import("../src/stacks/compose/shot");
    expect(read("adapters/compose/README.md")).toContain(NO_ANDROID_SDK);
    const checks = read("adapters/compose/checks.md");
    expect(checks).toContain(SETUP_FILE);
    expect(checks).toContain(COMPOSE_FIRST_RUN);
  });

  test("every Compose guide file stays under the line limit and links only to files that exist", () => {
    for (const f of files.filter((f) => f.startsWith("adapters/compose/"))) {
      expect(lintSkillMarkdown(f, readFileSync(join(SKILL, f), "utf8"), opts)).toEqual([]);
    }
    expect(files.filter((f) => f.startsWith("adapters/compose/")).length).toBe(6);
  });
});

describe("the SwiftUI guide matches the tool", () => {
  const read = (p: string) => readFileSync(join(SKILL, p), "utf8").replace(/\r\n/g, "\n");

  test("doctor's lines are the tool's own, on a Mac and elsewhere", async () => {
    const { swiftUIDoctor } = await import("../src/stacks/swiftui/doctor");
    const readme = read("adapters/swiftui/README.md");
    const deps = (platform: NodeJS.Platform, run?: (cmd: string[]) => { code: number; stdout: string }) =>
      ({ platform, arch: "arm64", home: "/Users/you", findBrowser: () => null, which: () => null, ...(run ? { run } : {}) });
    expect(readme).toContain(swiftUIDoctor(deps("win32"), { root: ".", apps: [] })[0]!.detail);
    expect(readme).toContain(swiftUIDoctor(deps("darwin", () => ({ code: 127, stdout: "" })), { root: ".", apps: [] })[0]!.detail);
    const tools = (cmd: string[]) => (cmd[0] === "xcode-select" ? { code: 0, stdout: "/Library/Developer/CommandLineTools\n" } : { code: 0, stdout: "" });
    expect(readme).toContain(swiftUIDoctor(deps("darwin", tools), { root: ".", apps: [] })[0]!.detail);
  });

  test("its setup file, first-run lines, variant hint and audit fixes are the tool's own", async () => {
    const { SETUP_FILE, SWIFTUI_FIRST_RUN, SWIFTUI_FIRST_RUN_MAC, SWIFTUI_FIXES } = await import("../src/stacks/swiftui/shot");
    const checks = read("adapters/swiftui/checks.md");
    for (const s of [SETUP_FILE, SWIFTUI_FIRST_RUN, SWIFTUI_FIRST_RUN_MAC]) expect(checks).toContain(s);
    // The audit's advice and the guide's agree: each fix's code is in both.
    const fixes = Object.values(SWIFTUI_FIXES).join("\n");
    for (const s of [".accessibilityLabel(", ".frame(minWidth: 44, minHeight: 44)", ".contentShape(Rectangle())", "@Environment(\\.accessibilityReduceMotion)", ".foregroundStyle(", ".tint(", "MotifMotion.animation("]) {
      expect([s, fixes.includes(s), checks.includes(s)]).toEqual([s, true, true]);
    }
  });

  test("its wiring and variants are the theme's own names; the default variant is the guide's own, not one called default (fix round 1)", async () => {
    const { generateSwiftUI } = await import("../src/stacks/swiftui/generate");
    const { buildThemeSet } = await import("../src/generate/theme");
    const { docFrom, twoVariantTokens } = await import("./helpers");
    // women is the default, as in the format's own example.
    const theme = generateSwiftUI(buildThemeSet(docFrom(twoVariantTokens())))[0]!.content;
    const tokens = read("adapters/swiftui/tokens.md");
    for (const s of [
      "@Environment(\\.motifColors) private var colors", "func motifTheme(variant: MotifVariant = .women)", "case women\n    case men", "func motifFont(_ type: MotifType)",
      "@MainActor static var debugVariantOverride", "@Entry var motifVariant", "static func standard(over duration: Double) -> Animation",
    ]) {
      expect([s, theme.includes(s)]).toEqual([s, true]);
    }
    for (const s of [
      "@Environment(\\.motifColors) private var colors", ".motifTheme(variant: .women)", "MotifVariant(rawValue: variant) ?? .women", 'marks `"default": true`, whatever its id',
      ".motifFont(.body)", "MotifTheme.debugVariantOverride", "@Environment(\\.motifVariant)",
    ]) {
      expect(tokens).toContain(s);
    }
    expect(tokens).not.toContain("MotifVariant.defaultVariant");
    expect(read("adapters/swiftui/motion.md")).toContain("MotifCurves.standard(over: MotifDurations.slow)");
  });

  test("Dynamic Type, line spacing, scene modifiers and the Xcode steps say what the theme and the tool do now (fix round 1)", () => {
    const tokens = read("adapters/swiftui/tokens.md");
    const platform = read("adapters/swiftui/platform.md");
    // .motifFont scales every role, the system font's too; MotifType.x.font() alone doesn't scale a system role.
    for (const s of ["`.motifFont` scales every role with Dynamic Type", "`MotifType.body.font()` alone", "the font's own line height"]) expect(tokens).toContain(s);
    expect(platform).toContain("`.motifFont` scales every role with Dynamic Type");
    for (const text of [tokens, platform]) {
      expect(text).not.toContain("A role in the system font keeps its size");
      expect(text).not.toContain("1.2 times the size, true of the system font");
    }
    // Scene modifiers reach the views; only .modelContainer(for:) and the App's own setup don't reach the screenshots.
    expect(tokens).not.toContain("a modifier on the scene doesn't reach the views");
    expect(tokens).toContain("`.modelContainer(for:)`");
    // Xcode makes the app's folder itself; its language modes are Swift 5 and Swift 6.
    const readme = read("adapters/swiftui/README.md");
    expect(readme).toContain("Xcode makes the `MyApp` folder there");
    expect(readme).not.toContain("Swift 5.9");
    expect(read("modes/init.md")).toContain("Xcode makes the app's folder there");
    // System controls aren't all 44 points: the system sizes them, and the audit doesn't flag them.
    expect(read("adapters/swiftui/components.md")).toContain("the system sizes them, and the audit doesn't flag them");
    expect(platform).toContain("the system sizes them, and the audit doesn't flag them");
    // A SwiftUI app's other screens are previews: feature names --screen beside --routes.
    const feature = read("modes/feature.md");
    expect((feature.match(/--screen <preview>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("symbols that point are named by reading order, for the documented reason: the left and right names flip only through a compatibility list (Task 12)", () => {
    const platform = read("adapters/swiftui/platform.md");
    for (const s of ["`chevron.forward`, not `chevron.right`", "`arrow.backward`, not `arrow.left`", "only through a compatibility list"]) expect(platform).toContain(s);
    // Qahwa's seeded copy showed chevron.right drawn pointing left in Arabic: the guide no longer says it doesn't mirror.
    expect(platform).not.toContain('| `Image(systemName: "chevron.right")` |');
  });

  test("every SwiftUI guide file stays under the line limit and links only to files that exist", () => {
    for (const f of files.filter((f) => f.startsWith("adapters/swiftui/"))) {
      expect(lintSkillMarkdown(f, readFileSync(join(SKILL, f), "utf8"), opts)).toEqual([]);
    }
    expect(files.filter((f) => f.startsWith("adapters/swiftui/")).length).toBe(6);
  });
});

describe("the Angular guide matches the tool", () => {
  const read = (p: string) => readFileSync(join(SKILL, p), "utf8").replace(/\r\n/g, "\n");

  test("the wiring it shows is the line motif tokens prints, with Tailwind and without", async () => {
    const { cpSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { basename } = await import("node:path");
    const { runTokens } = await import("../src/commands/tokens");
    const { FIXTURES } = await import("./helpers");
    const { tempDir } = await import("./tmp");
    const tokens = read("adapters/angular/tokens.md");
    const fixturePkg = JSON.parse(readFileSync(join(FIXTURES, "angular-min/package.json"), "utf8"));
    const plain = { ...fixturePkg, devDependencies: { ...fixturePkg.devDependencies } };
    for (const d of ["@tailwindcss/postcss", "postcss", "tailwindcss"]) delete plain.devDependencies[d];
    for (const [pkg, styles] of [[fixturePkg, "@import 'tailwindcss';\n"], [plain, ""]] as const) {
      const root = tempDir("motif-ng-wiring-");
      cpSync(join(FIXTURES, "angular-min"), root, { recursive: true, filter: (src) => !["node_modules", ".angular", "dist"].includes(basename(src)) });
      mkdirSync(join(root, "design"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
      writeFileSync(join(root, "src/styles.css"), styles);
      const r = await runTokens(root, { positionals: [] });
      const note = ((r.data as any).notes as string[]).find((n) => n.startsWith("Next:"))!;
      const statement = /@import "[^"]+";/.exec(note)![0];
      expect(tokens).toContain(statement);
      expect(note).toContain("src/styles.css");
    }
  });

  test("every Angular guide file stays under the line limit and links only to files that exist", () => {
    for (const f of files.filter((f) => f.startsWith("adapters/angular/"))) {
      expect(lintSkillMarkdown(f, readFileSync(join(SKILL, f), "utf8"), opts)).toEqual([]);
    }
    expect(files.filter((f) => f.startsWith("adapters/angular/")).length).toBe(6);
  });
});
