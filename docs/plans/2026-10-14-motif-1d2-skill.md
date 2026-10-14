# Motif 1D-2 — The Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the Motif skill itself — `SKILL.md`, the four modes and the React web stack guide — make mockups show the theme's real fonts and let design directions carry their own theme, and package everything as a Claude Code development plugin.

**Architecture:** `skill/SKILL.md` is the entry every agent loads: it explains how to run the bundled `motif` tool by its full path, what to do at the start of a session, how to choose a mode, and the rules for every task. `skill/modes/*.md` hold the step-by-step flows of spec §7, calling `motif` for every exact step. `skill/adapters/` holds the stack guides (the template and React web). Two CLI changes make the modes work as the spec describes: the 8 starting styles' fonts ship inside Motif (other theme fonts load from Google Fonts in the browser), and a mockup takes its theme from a `tokens.json` in its own folder, so 2–3 directions can be compared side by side. A build script assembles `dist/claude-code/` (the skill plus thin `/design`, `/motif:init`, `/feature`, `/motif:review` wrappers) for `claude --plugin-dir`.

**Tech Stack:** Markdown (Agent Skills format), Bun 1.4 (`with { type: "file" }` embedding, verified in a compiled binary while planning), TypeScript 7, Fontsource variable fonts (SIL OFL 1.1, vendored), Google Fonts CSS API v2, Claude Code plugins.

**Spec:** `docs/specs/2026-10-12-motif-core-design.md` — implements §5.1 `SKILL.md`, `modes/`, `adapters/`, `plugin/claude-code/`; §5.2 (request flow); §5.5 (agent-neutral); §7 (all modes, gates, review JSON); §9 (beginner experience); §10.4 (preview kit); §11.1–11.2, 11.4 (adapter template, React web guidance and starter screens); §12 (never a dead end). Builds on 1D-1 (`skill/contract`, `skill/knowledge`, `skill/sources`, the `skill/` content lint).

**Builds on:** Plans 1A–1D-1 (current `main`). Read `skill/preview-kit/README.md`, `cli/test/skill-lint.ts`, `cli/src/preview/server.ts`, `cli/src/preview/render.ts`, `cli/src/commands/preview.ts`, `cli/src/commands/validate.ts`, `cli/src/stacks/react-web/generate.ts` and `cli/src/check/types.ts` before starting.

**Verified while planning (2026-10-14):**
- **Fonts.** The 8 starting styles use 11 families: Archivo, DM Sans, Fraunces, Fredoka, IBM Plex Sans, Inter, Nunito, Playfair Display, Source Sans 3, Source Serif 4, Space Grotesk. Each has an `@fontsource-variable/<slug>` package (5.3.x) with `files/<slug>-latin-wght-normal.woff2` (22–51 KB each, about 410 KB in all) and a `LICENSE` file; all are `OFL-1.1`. Weight ranges (from each package's `wght.css`): Archivo 100–900, DM Sans 100–1000, Fraunces 100–900, Fredoka 300–700, IBM Plex Sans 100–700, Inter 100–900, Nunito 200–1000, Playfair Display 400–900, Source Sans 3 200–900, Source Serif 4 200–900, Space Grotesk 300–700.
- **Embedding.** `import f from "./x.woff2" with { type: "file" }` gives a path that `Bun.file()` reads both from source and inside a `bun build --compile` binary (checked by moving the source file away and running the binary).
- **Google Fonts CSS API v2** (`https://fonts.googleapis.com/css2?family=<Name>:wght@400;700&display=swap`): weights a family doesn't have are skipped (200, fewer faces); an unknown family or a weight *range* on a non-variable family is a 400 error for the whole request. So Motif requests one stylesheet per family, listing exact weights.
- **Fontsource for apps.** `@fontsource/<id>/<weight>.css` registers the plain family name (`'Inter'`, `'Plus Jakarta Sans'`), so the generated theme CSS matches; `@fontsource-variable/*` registers `'<Name> Variable'`, and `next/font` renames families, so neither matches the theme's names.
- **Claude Code plugins:** skills live in `skills/<name>/SKILL.md` inside the plugin folder (paths may not leave it); a plugin skill runs as `/<plugin>:<name>`, and the bare `/<name>` also works unless another command already uses it — Claude Code has its own `/init` and `/review`, so those two are `/motif:init` and `/motif:review`. `disable-model-invocation: true` keeps a skill out of automatic use; `$ARGUMENTS` and `${CLAUDE_PLUGIN_ROOT}` are substituted in skill content; `claude plugin validate <dir>` checks a plugin; `/reload-plugins` reloads after edits; `claude --plugin-dir <dir>` loads one for development.
- **Starters:** `npx create-next-app@latest <name> --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-agent-feedback --yes` (Next.js now prepares "agent feedback" by default; Motif turns it off). `npm create vite@latest <name> -- --template react-ts --no-interactive` (Vite 8), then Tailwind v4.3 via `npm install tailwindcss @tailwindcss/vite`, the `tailwindcss()` Vite plugin and `@import "tailwindcss";`.

**Decisions made while planning** (each is recorded where it lands):
1. **Fonts in mockups** (developer's request): ship the starting styles' fonts; load any other theme font from Google Fonts in the browser (download only, nothing uploaded); never request well-known system fonts; report fonts that didn't load. Apps load fonts with `@fontsource/<id>` packages, self-hosted.
2. **Directions need their own theme.** Spec §7.3 step 4 compares 2–3 directions with `motif preview --compare`, but every mockup used the same theme. A mockup now uses the `tokens.json` in its own folder when there is one; PNGs are written next to each mockup unless `--out` says otherwise (the kit README already promised this); `motif validate --tokens <file>` checks a direction before it's shown.
3. **Breakpoints.** Spec §11.2 says "responsive breakpoints from the contract", but the contract (§6.3) has no breakpoint roles. React web uses Tailwind's default breakpoints, and a project that changes them says so in `DESIGN.md` section 8.

## Global Constraints

- Agent-neutral (§5.5): nothing in `skill/` names a specific agent's tools, uses agent-specific frontmatter (`allowed-tools`, `context`, `hooks`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `model`, `agent`) or variables (`$ARGUMENTS`, `${CLAUDE_…}`). Only `plugin/claude-code/` (Claude Code packaging) may use them.
- `SKILL.md` frontmatter has only `name` (`motif`), `description` (1–1024 characters), `license`, `compatibility` (≤ 500 characters) and `metadata`; `SKILL.md` ≤ 500 lines; other Markdown in `skill/` ≤ 400 lines; `skill/knowledge/**` ≤ 300.
- The skill runs the tool by its full path from the skill folder, in the form for the agent's shell; commands in `skill/` are single, portable commands (no `&&`, `||`, `$(…)` or `export`).
- Plain language to developers (§6.1, §9): "your design guide", "theme values"; gates ⏸ on by default (§7.2); choices with a default; one-line "why"; never a dead end (§12).
- Privacy (§14): nothing is uploaded; bundled fonts work offline; Google Fonts only for theme fonts outside the bundle and not system fonts, fetched by the developer's browser; the Next.js starter runs with `--no-agent-feedback`; keys never pass through the chat.
- Fonts are vendored from pinned devDependencies with each font's licence text beside it; no new runtime dependencies.
- Every relative link in `skill/` resolves inside `skill/`; every `motif <command>` named in code exists.
- UX pattern files keep exactly their five sections; knowledge files stay ≤ 300 lines.

## Review Focus

1. **An agent on Windows using PowerShell or Command Prompt rather than Git Bash** → `SKILL.md` gives a working form for each shell, and no file in `skill/` relies on POSIX-only syntax. Pinned: Task 1 (portable-command lint) and Task 6 (the three forms).
2. **A theme font that isn't bundled and isn't on Google Fonts, or no internet** → the mockup still renders (with the next font in the list) within a few seconds, and `motif preview` names the font that fell back. Pinned: Task 3 (render with a font that can't load; the preview message).
3. **A direction's `tokens.json` with mistakes** (bad JSON, missing roles) → `motif preview` refuses and names that file; it never renders the direction with the design guide's theme instead. Pinned: Task 4.
4. **Claude Code's own `/init` and `/review`** → Motif's are reachable as `/motif:init` and `/motif:review`, and the plugin's descriptions and README say so. Pinned: Task 7.
5. **A stale development plugin** (a file removed from `skill/` lingering in the build, or the build pointed at the wrong folder) → each build replaces only a previous plugin build and copies `skill/` afresh. Pinned: Task 7.

---

## File Structure

```
skill/
├── SKILL.md                                   entry: running motif, session start, routing, rules
├── modes/design.md · init.md · feature.md · review.md
├── adapters/_template/README.md               what every stack guide covers
├── adapters/react-web/README.md · tokens.md · components.md · motion.md · platform.md · checks.md
├── preview-kit/fonts/<slug>.woff2 ×11 · LICENSE-<slug>.txt ×11 · fonts.css     vendored by `bun run fonts`
├── preview-kit/README.md                      MODIFY: fonts, directions
├── contract/spec.md · DESIGN.template.md      MODIFY: fixes from the 1D-1 review
└── knowledge/motion.md · accessibility.md     MODIFY: fixes from the 1D-1 review
plugin/claude-code/
├── skills/design · init · feature · review/SKILL.md     Claude Code wrappers
└── README.md
cli/
├── scripts/vendor-fonts.ts · build-plugin.ts
├── src/preview/font-list.ts · fonts.ts · theme-file.ts
├── src/generate/theme-fonts.ts
├── src/preview/server.ts · render.ts          MODIFY: fonts routes, per-mockup themes, font report
├── src/commands/preview.ts · validate.ts · tokens.ts · main.ts     MODIFY
├── src/generate/preview-css.ts                MODIFY: Google Fonts imports
├── src/check/types.ts                         MODIFY: RULE_IDS
└── test/…                                     new and changed tests per task
README.md · .gitattributes                     MODIFY
```

---
### Task 1: Close the gaps the 1D-1 review found in `skill/`

**Files:**
- Modify: `cli/test/skill-lint.ts` (rewrite), `cli/test/skill-content.test.ts` (rewrite the "lint rules" tests), `cli/test/knowledge.test.ts` (append), `cli/test/contract-templates.test.ts` (append)
- Modify: `skill/knowledge/motion.md`, `skill/knowledge/accessibility.md`, `skill/contract/spec.md`, `skill/contract/DESIGN.template.md`

**Interfaces:**
- Consumes: `COMMAND_NAMES` (1D-1).
- Produces (all in `cli/test/skill-lint.ts`): `lineLimit(file: string): number` (unchanged), `lineCount(text: string): number`, `lintSkillMarkdown(file, text, { exists, commands }): string[]` with these rules:
  - size: `lineCount` over the limit (a final newline doesn't add a line);
  - links (inline, with an optional title or `<…>` target, and reference definitions; not inside code blocks) must resolve, and must stay inside `skill/`;
  - `motif <command>` is checked only inside code (inline spans and fenced blocks), including full-path forms such as `"<skill folder>/bin/motif" doctor` and `bin\motif.cmd shot`; `help` is always allowed;
  - fenced shell blocks (no language, or `sh`, `bash`, `shell`, `console`, `powershell`, `ps1`, `pwsh`, `cmd`, `bat`) may not use `&&`, `||`, `$(` or `export NAME=`;
  - agent-specific frontmatter keys are checked only in the frontmatter block;
  - `SKILL.md` must start with frontmatter whose keys are a subset of `name, description, license, compatibility, metadata`, with `name: motif`, a description of 1–1024 characters and a compatibility of ≤ 500;
  - UX pattern sections (unchanged).
- Every later task's Markdown is checked by these rules.

- [ ] **Step 1: Write the failing tests**

Replace the `describe("the lint rules", …)` block in `cli/test/skill-content.test.ts` with:
```ts
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

  test("UX pattern files have the five sections, in order", () => {
    const good = "# Sign-in\n\n## Goal\n\n## Anatomy\n\n## Required states\n\n## Common mistakes\n\n## Mobile and web\n";
    expect(lint("knowledge/ux-patterns/sign-in.md", good)).toEqual([]);
    expect(lint("knowledge/ux-patterns/sign-in.md", good.replace("## Anatomy\n\n", ""))).toHaveLength(1);
    expect(lint("knowledge/motion.md", "# Motion\n\n## Anything\n")).toEqual([]);
  });
});
```
and change the import line to `import { lineCount, lineLimit, lintSkillMarkdown } from "./skill-lint";`.

Append to `cli/test/knowledge.test.ts`:
```ts
describe("knowledge: fixes from the 1D-1 review", () => {
  test("toasts stay at least 5 s everywhere, and exits use a shorter duration role", () => {
    const motion = read("motion.md");
    expect(motion).not.toContain("4–6 s");
    expect(motion).not.toContain("three quarters");
    expect(motion).toContain("at least 5 s");
    expect(motion).toContain("next shorter duration role");
  });
  test("accessibility doesn't promise that text follows the reader's text-size setting", () => {
    expect(read("accessibility.md")).not.toContain("scale with the viewer's text size");
  });
});
```

Append to the `describe("the design guide templates", …)` block in `cli/test/contract-templates.test.ts`:
```ts
  test("spec.md covers the format version and dark values that validate requires", () => {
    const spec = read("spec.md");
    expect(spec).toContain('"motifContract": 1');
    expect(spec).toContain("Every colour role needs a dark value");
  });

  test("the template's change-log line follows spec.md's format", () => {
    expect(read("DESIGN.template.md")).toMatch(/^- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && bun test test/skill-content.test.ts test/knowledge.test.ts test/contract-templates.test.ts`
Expected: FAIL — `lineCount` isn't exported; the new lint cases fail; the content checks fail on the current wording.

- [ ] **Step 3: Rewrite the lint helper**

`cli/test/skill-lint.ts`:
```ts
import { posix } from "node:path";

/** Files load one at a time, so each must stay short (spec §8.4; Agent Skills: SKILL.md under 500 lines). */
export function lineLimit(file: string): number {
  if (file === "SKILL.md") return 500;
  if (file.startsWith("knowledge/")) return 300;
  return 400;
}

/** Lines as an editor counts them: a final newline doesn't start another line. */
export function lineCount(text: string): number {
  return text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
}

const NOT_PORTABLE: [RegExp, string][] = [
  [/\b(?:AskUserQuestion|TodoWrite|SlashCommand|WebFetch|WebSearch)\b/, "a specific agent's tool name"],
  [/\b(?:Bash|Read|Write|Edit|Glob|Grep|Task|Skill) tool\b/, "a specific agent's tool name"],
  [/\bmcp__\w+/, "an agent-specific MCP tool name (name tools by their own names, e.g. refero_get_style)"],
  [/\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/, "an agent-specific variable"],
];
const AGENT_FRONTMATTER = /^(?:allowed-tools|context|hooks|argument-hint|disable-model-invocation|user-invocable|model|agent):/m;
const SKILL_KEYS = ["name", "description", "license", "compatibility", "metadata"];
const UX_SECTIONS = ["Goal", "Anatomy", "Required states", "Common mistakes", "Mobile and web"];
const SHELL_BLOCKS = new Set(["", "sh", "bash", "shell", "console", "powershell", "ps1", "pwsh", "cmd", "bat"]);
const NOT_PORTABLE_SHELL: [RegExp, string][] = [
  [/&&|\|\|/, "chains commands with && or || (Windows PowerShell 5 can't; put one command per line)"],
  [/\$\(/, "uses $(…), which only POSIX shells understand"],
  [/^\s*export\s+\w+=/m, "sets a variable with export, which only POSIX shells understand"],
];
// motif, or a path ending in motif / motif.cmd / motif.ps1 / motif.exe (quoted or not), then a command name.
const MOTIF_CALL = /(?:^|[\s"'(/\\&])motif(?:\.cmd|\.ps1|\.exe)?["']?[ \t]+([a-z][a-z-]*)/gm;
const LINK_PATTERNS = [/\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g, /^[ \t]*\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm];

/** Fenced code blocks (with their language) and inline code spans, plus the text with the blocks taken out. */
function split(text: string): { blocks: { lang: string; body: string }[]; inline: string[]; prose: string } {
  const blocks: { lang: string; body: string }[] = [];
  const prose = text.replace(/^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1\2[ \t]*$/gm, (_m, _indent, _fence, info: string, body: string) => {
    blocks.push({ lang: info.trim().toLowerCase(), body });
    return "";
  });
  return { blocks, inline: [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!), prose };
}

function frontmatter(text: string): string | null {
  return text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1] ?? null;
}

export function lintSkillMarkdown(file: string, raw: string, opts: { exists: (skillPath: string) => boolean; commands: string[] }): string[] {
  const text = raw.replace(/\r\n/g, "\n");
  const problems: string[] = [];
  const { blocks, inline, prose } = split(text);

  const lines = lineCount(text);
  if (lines > lineLimit(file)) problems.push(`${file} is ${lines} lines; the limit is ${lineLimit(file)}.`);

  for (const pattern of LINK_PATTERNS) {
    for (const m of prose.matchAll(pattern)) {
      const shown = m[1]!.replace(/^<|>$/g, "");
      const target = shown.split("#")[0]!;
      if (!target || /^[a-z][a-z+.-]*:/i.test(target)) continue;
      let decoded = target;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        // keep it as written
      }
      const resolved = posix.normalize(posix.join(posix.dirname(file), decoded)).replace(/\/$/, "");
      if (resolved === ".." || resolved.startsWith("../")) {
        problems.push(`${file} links to "${shown}", which is outside the skill folder (agents get only the skill folder).`);
      } else if (!opts.exists(resolved)) {
        problems.push(`${file} links to "${shown}", which doesn't exist.`);
      }
    }
  }

  for (const [pattern, what] of NOT_PORTABLE) {
    if (pattern.test(text)) problems.push(`${file} uses ${what}.`);
  }
  const fm = frontmatter(text);
  if (fm !== null && AGENT_FRONTMATTER.test(fm)) problems.push(`${file} uses agent-specific frontmatter.`);

  for (const code of [...inline, ...blocks.map((b) => b.body)]) {
    for (const m of code.matchAll(MOTIF_CALL)) {
      const command = m[1]!;
      if (command !== "help" && !opts.commands.includes(command)) problems.push(`${file} mentions "motif ${command}", which isn't a Motif command.`);
    }
  }
  for (const block of blocks.filter((b) => SHELL_BLOCKS.has(b.lang))) {
    for (const [pattern, what] of NOT_PORTABLE_SHELL) {
      if (pattern.test(block.body)) problems.push(`${file} has a shell example that ${what}.`);
    }
  }

  if (file === "SKILL.md") problems.push(...skillFrontmatter(fm));

  if (file.startsWith("knowledge/ux-patterns/")) {
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
    if (JSON.stringify(sections) !== JSON.stringify(UX_SECTIONS)) {
      problems.push(`${file} needs exactly these sections, in order: ${UX_SECTIONS.join(", ")} (has: ${sections.join(", ") || "none"}).`);
    }
  }
  return problems;
}

/** The Agent Skills rules for SKILL.md's frontmatter. */
function skillFrontmatter(fm: string | null): string[] {
  if (fm === null) return ["SKILL.md needs frontmatter (name and description between --- lines) at the very top."];
  const problems: string[] = [];
  for (const key of [...fm.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]!)) {
    if (!SKILL_KEYS.includes(key)) problems.push(`SKILL.md frontmatter has "${key}", which the Agent Skills format doesn't define (allowed: ${SKILL_KEYS.join(", ")}).`);
  }
  const field = (key: string) => fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (field("name") !== "motif") problems.push("SKILL.md frontmatter needs name: motif (it must match the folder the skill is installed in).");
  const description = field("description") ?? "";
  if (description.length < 1 || description.length > 1024) problems.push(`SKILL.md description must be 1–1024 characters (it has ${description.length}).`);
  const compatibility = field("compatibility");
  if (compatibility !== undefined && compatibility.length > 500) problems.push(`SKILL.md compatibility must be at most 500 characters (it has ${compatibility.length}).`);
  return problems;
}
```

- [ ] **Step 4: Fix the four content points**

`skill/knowledge/motion.md`:
- Replace the paragraph starting `**Exits are quicker than entrances**` with: `**Exits are quicker than entrances**: use the next shorter duration role for the exit (\`duration.fast\` for something that entered with \`duration.base\`). People have already decided to dismiss it; let it leave promptly.`
- In the pattern catalogue's "Toast in / out" row, replace the notes with: `Slide a short way from the nearest edge with a fade; auto-dismiss after at least 5 s (longer for longer text); a toast with an action stays until dismissed`.

`skill/knowledge/accessibility.md`: in the intro, replace `and the type roles scale with the viewer's text size.` with `and the type roles give every screen the same readable text sizes.`

`skill/contract/spec.md`:
- At the end of the `## tokens.json` section's opening (before `### Two layers`), add the paragraph: `` The file's root carries the format version under Motif's extension: `"$extensions": { "dev.motif": { "motifContract": 1, "pairs": [ … ] } }`. `motif validate` refuses a file without it. ``
- At the end of `### Colours`, add: `Every colour role needs a dark value; \`motif validate\` reports any role without one.`

`skill/contract/DESIGN.template.md`: replace the last line `- 2026-01-01 — Created with Motif.` with `- 2026-01-01 — Created the design guide — the starting point for this app — approved by <name>`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/skill-content.test.ts test/knowledge.test.ts test/contract-templates.test.ts && bun run typecheck`
Expected: PASS (the existing `skill/` files already follow the new rules; if one doesn't, fix the file, not the rule).

- [ ] **Step 6: Commit**

```bash
git add cli/test/skill-lint.ts cli/test/skill-content.test.ts cli/test/knowledge.test.ts cli/test/contract-templates.test.ts skill/knowledge/motion.md skill/knowledge/accessibility.md skill/contract/spec.md skill/contract/DESIGN.template.md
git commit -m "test(skill): stricter content lint; fixes from the 1D-1 review"
```

---
### Task 2: The starting styles' fonts, shipped with Motif

**Files:**
- Dev dependencies (the source of the vendored files): `cd cli && bun add -d --exact @fontsource-variable/archivo@5.3.0 @fontsource-variable/dm-sans@5.3.0 @fontsource-variable/fraunces@5.3.0 @fontsource-variable/fredoka@5.3.0 @fontsource-variable/ibm-plex-sans@5.3.0 @fontsource-variable/inter@5.3.0 @fontsource-variable/nunito@5.3.0 @fontsource-variable/playfair-display@5.3.0 @fontsource-variable/source-sans-3@5.3.1 @fontsource-variable/source-serif-4@5.3.1 @fontsource-variable/space-grotesk@5.3.0`
- Create: `cli/src/preview/font-list.ts`, `cli/src/preview/fonts.ts`, `cli/scripts/vendor-fonts.ts`, `cli/test/preview-fonts.test.ts`; `skill/preview-kit/fonts/` (11 `.woff2`, 11 `LICENSE-<slug>.txt`, `fonts.css`, all written by the script)
- Modify: `cli/package.json` (script `"fonts": "bun scripts/vendor-fonts.ts"`), `cli/src/env.d.ts`, `cli/src/preview/server.ts`, `cli/test/preview-server.test.ts`, `skill/preview-kit/README.md`, `.gitattributes`

**Interfaces:**
- Consumes: `PRESETS` (1C-1); `startPreviewServer`, `injectKit` (1C-1).
- Produces:
  - From `src/preview/font-list.ts`: `interface ListedFont { family: string; slug: string; weight: [number, number] }`; `FONT_LIST: ListedFont[]`; `FONTS_CSS_HEADER: string`; `fontFaceCss(url: (file: string) => string): string`; `isBundledFamily(family: string): boolean` (case-insensitive).
  - From `src/preview/fonts.ts`: `EMBEDDED_FONT_FILES: Record<string, string>` (`"<slug>.woff2"` → a path `Bun.file` reads, in source or in the compiled tool); `FONTS_CSS: string` (the text of `skill/preview-kit/fonts/fonts.css`).
  - The preview server answers `/__motif/kit/fonts/fonts.css` and `/__motif/kit/fonts/<slug>.woff2`; `injectKit` links the fonts stylesheet right after the theme. Task 3 uses `isBundledFamily`.

- [ ] **Step 1: Write the failing tests**

`cli/test/preview-fonts.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FONT_LIST, FONTS_CSS_HEADER, fontFaceCss, isBundledFamily } from "../src/preview/font-list";
import { EMBEDDED_FONT_FILES, FONTS_CSS } from "../src/preview/fonts";
import { PRESETS } from "../src/presets/spec";

const FONTS = join(import.meta.dir, "../../skill/preview-kit/fonts");
const MODULES = join(import.meta.dir, "../node_modules/@fontsource-variable");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("the fonts Motif ships", () => {
  test("every starting style's fonts are included", () => {
    for (const preset of PRESETS) {
      expect(isBundledFamily(preset.fonts.body[0]!)).toBe(true);
      expect(isBundledFamily(preset.fonts.display[0]!)).toBe(true);
    }
    expect(isBundledFamily("inter")).toBe(true);
    expect(isBundledFamily("Plus Jakarta Sans")).toBe(false);
  });

  test("each is a small woff2 file with its SIL Open Font License beside it", () => {
    for (const font of FONT_LIST) {
      const bytes = readFileSync(join(FONTS, `${font.slug}.woff2`));
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(bytes.length).toBeLessThan(80_000);
      expect(readFileSync(join(FONTS, `LICENSE-${font.slug}.txt`), "utf8")).toContain("SIL Open Font License");
    }
  });

  test.skipIf(!existsSync(MODULES))("the weight ranges match the fonts' own packages", () => {
    for (const font of FONT_LIST) {
      const css = readFileSync(join(MODULES, font.slug, "wght.css"), "utf8");
      expect(css).toContain(`font-weight: ${font.weight[0]} ${font.weight[1]};`);
    }
  });

  test("fonts.css declares every font, for use with or without the tool", () => {
    expect(lf(readFileSync(join(FONTS, "fonts.css"), "utf8"))).toBe(`${FONTS_CSS_HEADER}\n\n${fontFaceCss((file) => file)}`);
    expect(fontFaceCss((file) => file)).toContain(
      '@font-face {\n  font-family: "Source Serif 4";\n  font-style: normal;\n  font-display: swap;\n  font-weight: 200 900;\n  src: url("source-serif-4.woff2") format("woff2");\n}',
    );
  });

  test("the tool embeds every font file and the stylesheet", async () => {
    expect(Object.keys(EMBEDDED_FONT_FILES).sort()).toEqual(FONT_LIST.map((f) => `${f.slug}.woff2`).sort());
    for (const [name, path] of Object.entries(EMBEDDED_FONT_FILES)) {
      expect((await Bun.file(path).arrayBuffer()).byteLength).toBe(statSync(join(FONTS, name)).size);
    }
    expect(lf(FONTS_CSS)).toBe(lf(readFileSync(join(FONTS, "fonts.css"), "utf8")));
  });

  test("the kit README tells agents about the fonts", () => {
    const readme = readFileSync(join(import.meta.dir, "../../skill/preview-kit/README.md"), "utf8");
    expect(readme).toContain("## Fonts");
    expect(readme).toContain("fonts/fonts.css");
  });
});
```

In `cli/test/preview-server.test.ts`, change the first `injectKit` test's expectation to:
```ts
    expect(out).toMatch(/theme\.css">\n<link rel="stylesheet" href="\/__motif\/kit\/fonts\/fonts\.css">\n<link rel="stylesheet" href="\/__motif\/kit\/kit\.css">\n<script src="\/__motif\/kit\/vendor\/motion\.js"><\/script>\n<script src="\/__motif\/kit\/kit\.js"><\/script>\n<\/head>/);
```
and add inside `describe("startPreviewServer", …)`:
```ts
  test("serves the built-in fonts and their stylesheet", withServer(async (base) => {
    const css = await fetch(`${base}/__motif/kit/fonts/fonts.css`);
    expect(css.headers.get("content-type")).toStartWith("text/css");
    expect(await css.text()).toContain('font-family: "Inter";');
    const font = await fetch(`${base}/__motif/kit/fonts/inter.woff2`);
    expect(font.headers.get("content-type")).toBe("font/woff2");
    expect(new TextDecoder().decode(new Uint8Array(await font.arrayBuffer()).slice(0, 4))).toBe("wOF2");
    expect((await fetch(`${base}/__motif/kit/fonts/nope.woff2`)).status).toBe(404);
    expect((await fetch(`${base}/__motif/kit/fonts/constructor`)).status).toBe(404);
  }));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && bun test test/preview-fonts.test.ts test/preview-server.test.ts`
Expected: FAIL — `../src/preview/font-list` doesn't exist; the injectKit order and font routes don't exist.

- [ ] **Step 3: The font list and the vendoring script**

`cli/src/preview/font-list.ts`:
```ts
/** The fonts of the 8 starting styles, shipped with Motif: Latin letters, variable weight, from Fontsource (SIL Open Font License 1.1). */
export interface ListedFont {
  family: string;
  slug: string;
  /** The variable font's weight range. */
  weight: [number, number];
}

export const FONT_LIST: ListedFont[] = [
  { family: "Archivo", slug: "archivo", weight: [100, 900] },
  { family: "DM Sans", slug: "dm-sans", weight: [100, 1000] },
  { family: "Fraunces", slug: "fraunces", weight: [100, 900] },
  { family: "Fredoka", slug: "fredoka", weight: [300, 700] },
  { family: "IBM Plex Sans", slug: "ibm-plex-sans", weight: [100, 700] },
  { family: "Inter", slug: "inter", weight: [100, 900] },
  { family: "Nunito", slug: "nunito", weight: [200, 1000] },
  { family: "Playfair Display", slug: "playfair-display", weight: [400, 900] },
  { family: "Source Sans 3", slug: "source-sans-3", weight: [200, 900] },
  { family: "Source Serif 4", slug: "source-serif-4", weight: [200, 900] },
  { family: "Space Grotesk", slug: "space-grotesk", weight: [300, 700] },
];

export const FONTS_CSS_HEADER =
  "/* The fonts of Motif's 8 starting styles: Latin letters, variable weight, from Fontsource. Each is under the SIL Open Font License 1.1 (see LICENSE-<font>.txt). Written by cli/scripts/vendor-fonts.ts. */";

/** One @font-face per font; `url` turns a file name into the address the page loads it from. */
export function fontFaceCss(url: (file: string) => string): string {
  const faces = FONT_LIST.map((f) =>
    [
      "@font-face {",
      `  font-family: "${f.family}";`,
      "  font-style: normal;",
      "  font-display: swap;",
      `  font-weight: ${f.weight[0]} ${f.weight[1]};`,
      `  src: url("${url(`${f.slug}.woff2`)}") format("woff2");`,
      "}",
    ].join("\n"),
  );
  return `${faces.join("\n\n")}\n`;
}

export function isBundledFamily(family: string): boolean {
  const key = family.trim().toLowerCase();
  return FONT_LIST.some((f) => f.family.toLowerCase() === key);
}
```

`cli/scripts/vendor-fonts.ts`:
```ts
// Copies the starting styles' fonts from the pinned @fontsource-variable packages into skill/preview-kit/fonts/.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_LIST, FONTS_CSS_HEADER, fontFaceCss } from "../src/preview/font-list";

const OUT = join(import.meta.dir, "../../skill/preview-kit/fonts");
const MODULES = join(import.meta.dir, "../node_modules/@fontsource-variable");
mkdirSync(OUT, { recursive: true });
for (const font of FONT_LIST) {
  copyFileSync(join(MODULES, font.slug, "files", `${font.slug}-latin-wght-normal.woff2`), join(OUT, `${font.slug}.woff2`));
  copyFileSync(join(MODULES, font.slug, "LICENSE"), join(OUT, `LICENSE-${font.slug}.txt`));
  console.log(`copied ${font.family}`);
}
writeFileSync(join(OUT, "fonts.css"), `${FONTS_CSS_HEADER}\n\n${fontFaceCss((file) => file)}`);
console.log("wrote skill/preview-kit/fonts/fonts.css");
```

Add `"fonts": "bun scripts/vendor-fonts.ts"` to `cli/package.json` scripts, add `*.woff2 binary` to `.gitattributes`, then run:

Run: `cd cli && bun install && bun run fonts`
Expected: 11 `copied …` lines and `wrote skill/preview-kit/fonts/fonts.css`; `skill/preview-kit/fonts/` holds 23 files.

- [ ] **Step 4: Embed them in the tool and serve them**

Append to `cli/src/env.d.ts`:
```ts
declare module "*.woff2" {
  /** A path Bun.file() can read, in the source tree or inside the compiled tool. */
  const path: string;
  export default path;
}
```

`cli/src/preview/fonts.ts`:
```ts
import archivo from "../../../skill/preview-kit/fonts/archivo.woff2" with { type: "file" };
import dmSans from "../../../skill/preview-kit/fonts/dm-sans.woff2" with { type: "file" };
import fontsCss from "../../../skill/preview-kit/fonts/fonts.css" with { type: "text" };
import fraunces from "../../../skill/preview-kit/fonts/fraunces.woff2" with { type: "file" };
import fredoka from "../../../skill/preview-kit/fonts/fredoka.woff2" with { type: "file" };
import ibmPlexSans from "../../../skill/preview-kit/fonts/ibm-plex-sans.woff2" with { type: "file" };
import inter from "../../../skill/preview-kit/fonts/inter.woff2" with { type: "file" };
import nunito from "../../../skill/preview-kit/fonts/nunito.woff2" with { type: "file" };
import playfairDisplay from "../../../skill/preview-kit/fonts/playfair-display.woff2" with { type: "file" };
import sourceSans3 from "../../../skill/preview-kit/fonts/source-sans-3.woff2" with { type: "file" };
import sourceSerif4 from "../../../skill/preview-kit/fonts/source-serif-4.woff2" with { type: "file" };
import spaceGrotesk from "../../../skill/preview-kit/fonts/space-grotesk.woff2" with { type: "file" };

/** Font file name → a path Bun.file() reads, in the source tree or inside the compiled tool. */
export const EMBEDDED_FONT_FILES: Record<string, string> = {
  "archivo.woff2": archivo,
  "dm-sans.woff2": dmSans,
  "fraunces.woff2": fraunces,
  "fredoka.woff2": fredoka,
  "ibm-plex-sans.woff2": ibmPlexSans,
  "inter.woff2": inter,
  "nunito.woff2": nunito,
  "playfair-display.woff2": playfairDisplay,
  "source-sans-3.woff2": sourceSans3,
  "source-serif-4.woff2": sourceSerif4,
  "space-grotesk.woff2": spaceGrotesk,
};

/** skill/preview-kit/fonts/fonts.css: relative URLs, so it works from /__motif/kit/fonts/ and from a copied kit alike. */
export const FONTS_CSS: string = fontsCss;
```

In `cli/src/preview/server.ts`:
- import `{ EMBEDDED_FONT_FILES, FONTS_CSS } from "./fonts"`;
- in `injectKit`, add `'<link rel="stylesheet" href="/__motif/kit/fonts/fonts.css">',` as the second tag (right after the theme link);
- before the `if (path.startsWith("/__motif/kit/"))` branch, add:
```ts
      if (path.startsWith("/__motif/kit/fonts/")) {
        const name = path.slice("/__motif/kit/fonts/".length);
        if (name === "fonts.css") return new Response(FONTS_CSS, { headers: { "content-type": TYPES[".css"]! } });
        if (!Object.hasOwn(EMBEDDED_FONT_FILES, name)) return notFound();
        return new Response(Bun.file(EMBEDDED_FONT_FILES[name]!), { headers: { "content-type": "font/woff2", "cache-control": "max-age=3600" } });
      }
```

- [ ] **Step 5: Tell agents about the fonts**

In `skill/preview-kit/README.md`, add after `## Motion`:
```markdown
## Fonts

The fonts of the 8 starting styles come with the kit, in `fonts/` (each under the SIL Open Font License; the licence sits beside each font). With the tool, every mockup loads them, so a style that uses Fraunces shows Fraunces even on a computer that doesn't have it. A theme font outside that set loads from Google Fonts when you're online; offline, or for a font Google doesn't have, the mockup uses the next font in the theme's list and `motif preview` says which font fell back.
```
and in `## Without the tool`, change the first sentence to: `Copy \`kit.css\`, \`kit.js\`, \`vendor/motion.js\` and the \`fonts\` folder next to the mockup, write the theme variables yourself into a \`<style>\` block (one \`--motif-*\` variable per role in \`design/tokens.json\`), link \`fonts/fonts.css\` and the other files in \`<head>\`, and open the HTML file directly.`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd cli && bun test test/preview-fonts.test.ts test/preview-server.test.ts test/preview-assets.test.ts test/skill-content.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/package.json cli/bun.lock .gitattributes cli/src/env.d.ts cli/src/preview/font-list.ts cli/src/preview/fonts.ts cli/src/preview/server.ts cli/scripts/vendor-fonts.ts cli/test/preview-fonts.test.ts cli/test/preview-server.test.ts skill/preview-kit
git commit -m "feat(preview): ship the starting styles' fonts (SIL OFL) with mockups"
```

---
### Task 3: Other theme fonts, a report of fonts that didn't load, and the fonts an app must load

**Files:**
- Create: `cli/src/generate/theme-fonts.ts`, `cli/test/theme-fonts.test.ts`
- Modify: `cli/src/generate/preview-css.ts`, `cli/src/preview/render.ts`, `cli/src/commands/preview.ts`, `cli/src/commands/tokens.ts`
- Test: `cli/test/preview-css.test.ts`, `cli/test/render.test.ts`, `cli/test/preview-command.test.ts`, `cli/test/tokens-command.test.ts` (change and append)

**Interfaces:**
- Consumes: `isBundledFamily` (Task 2); `Theme`, `ThemeFont.family` (a CSS font-family list such as `Inter, system-ui, sans-serif`) and `ThemeFont.weight` (1B); `CSS_HEADER` (1B).
- Produces:
  - From `src/generate/theme-fonts.ts`: `interface ThemeFontUse { family: string; weights: number[]; source: "bundled" | "google" | "system" }`; `firstFamily(css: string): string | null`; `themeFonts(theme: Theme): ThemeFontUse[]`; `googleFontsUrl(family: string, weights: number[]): string`.
  - `previewCss(theme)` puts one `@import url("…")` per Google font right after the generated-file header.
  - From `src/preview/render.ts`: `interface RenderTarget { url: string; name: string; outDir?: string; fonts?: string[] }`; `interface RenderResult { files: string[]; missingFonts: string[] }`; `renderPngs(opts): Promise<RenderResult>`; `missingFontsScript(families: string[]): string`. Waiting for fonts is capped at 5 s.
  - `motif preview` adds `missingFonts` to its data and a note when any font fell back; `motif tokens` adds `fonts: { family, weights }[]` (no system fonts) to its data and one line to its text. Task 4 sets `outDir` per target; the React web guide (Task 5) tells agents to load `fonts`.

Which family a type role "asks for" is the first one in its list, unless that's a generic family (`system-ui`, `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `ui-serif`, `ui-sans-serif`, `ui-monospace`, `ui-rounded`, `math`, `emoji`, `fangsong`, `-apple-system`, `BlinkMacSystemFont`). Fonts that come with every common OS are `system` and never downloaded: Arial, Helvetica, Helvetica Neue, Georgia, Times, Times New Roman, Courier, Courier New, Verdana, Tahoma, Trebuchet MS, Segoe UI, Segoe UI Variable, SF Pro, SF Pro Text, SF Pro Display, SF Mono, New York, Menlo, Monaco, Consolas, Cascadia Code, Lucida Grande.

- [ ] **Step 1: Write the failing tests**

`cli/test/theme-fonts.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { buildTheme, type Theme } from "../src/generate/theme";
import { firstFamily, googleFontsUrl, themeFonts } from "../src/generate/theme-fonts";
import { presetTheme } from "../src/preview/presets";
import { docFrom, validTokens } from "./helpers";

/** The fixture theme with its font families replaced (sans for body/label/caption, display for the rest). */
function withFonts(sans: string[], display: string[] = sans): Theme {
  const tokens = validTokens();
  tokens.primitive.font.sans.$value = sans;
  tokens.primitive.font.display = { $type: "fontFamily", $value: display };
  for (const role of ["display", "title", "heading"]) tokens.font[role].$value.fontFamily = "{primitive.font.display}";
  return buildTheme(docFrom(tokens));
}

describe("firstFamily", () => {
  test("the family a type role asks for first, unquoted, unless that's a generic family", () => {
    expect(firstFamily("Inter, system-ui, sans-serif")).toBe("Inter");
    expect(firstFamily('"Plus Jakarta Sans", sans-serif')).toBe("Plus Jakarta Sans");
    expect(firstFamily("system-ui, sans-serif")).toBeNull();
    expect(firstFamily("-apple-system, BlinkMacSystemFont, sans-serif")).toBeNull();
  });
});

describe("themeFonts", () => {
  test("a starting style's fonts are all bundled, with the weights its roles use", () => {
    const fonts = themeFonts(presetTheme("editorial")!);
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Playfair Display", "bundled"], ["Source Serif 4", "bundled"]]);
    for (const f of fonts) expect(f.weights).toEqual([...f.weights].sort((a, b) => a - b));
  });

  test("other fonts come from Google Fonts; system fonts are never fetched", () => {
    const fonts = themeFonts(withFonts(["Plus Jakarta Sans", "sans-serif"], ["Georgia", "serif"]));
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Georgia", "system"], ["Plus Jakarta Sans", "google"]]);
  });

  test("a theme that only names generic families asks for nothing", () => {
    expect(themeFonts(withFonts(["system-ui", "sans-serif"]))).toEqual([]);
  });
});

describe("googleFontsUrl", () => {
  test("one family with the exact weights its roles use", () => {
    expect(googleFontsUrl("Plus Jakarta Sans", [400, 600, 700])).toBe("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap");
  });
});
```
(Adjust `withFonts` to the fixture's real token paths if they differ: it sets the families the type roles resolve to. The order of `themeFonts` is the order roles appear in the theme: display first.)

Append to `describe("previewCss", …)` in `cli/test/preview-css.test.ts`:
```ts
  test("a theme font outside the bundle loads from Google Fonts, after the generated-file header", () => {
    const tokens = validTokens();
    tokens.primitive.font.sans.$value = ["Plus Jakarta Sans", "system-ui", "sans-serif"];
    const css = previewCss(buildTheme(docFrom(tokens)));
    const lines = css.split("\n");
    expect(lines[0]).toBe(CSS_HEADER);
    expect(lines[1]).toStartWith('@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@');
    expect(css.indexOf("@import")).toBeLessThan(css.indexOf(":root"));
  });

  test("bundled and system fonts add no imports", () => {
    expect(previewCss(buildTheme(docFrom(validTokens())))).not.toContain("@import");
  });
```

In `cli/test/render.test.ts`, change each `const files = await renderPngs(…)` to `const { files } = await renderPngs(…)`, and append inside the `describe.skipIf(!browser)` block:
```ts
  test("names fonts that couldn't load, and still renders", async () => {
    const font = readFileSync(join(import.meta.dir, "../../skill/preview-kit/fonts/inter.woff2"));
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/good.woff2") return new Response(font, { headers: { "content-type": "font/woff2" } });
        if (path !== "/") return new Response("Not found", { status: 404 });
        const html = `<!doctype html><html><head><style>
          @font-face { font-family: "Good"; src: url("/good.woff2") format("woff2"); }
          @font-face { font-family: "Gone"; src: url("/gone.woff2") format("woff2"); }
          body { margin: 0 } .mk-frame { width: 200px; height: 100px; background: #eee }
        </style></head><body><div class="mk-frame"><p style="font-family: Good">A</p><p style="font-family: Gone">B</p></div></body></html>`;
        return new Response(html, { headers: { "content-type": "text/html" } });
      },
    });
    try {
      const out = tempDir("motif-render-");
      const started = Date.now();
      const result = await renderPngs({
        browserPath: browser!.path,
        outDir: out,
        targets: [{ name: "fonts", url: `http://127.0.0.1:${server.port}/`, fonts: ["Good", "Gone", "Never Declared"] }],
      });
      expect(result.files).toHaveLength(2);
      expect(result.missingFonts.sort()).toEqual(["Gone", "Never Declared"]);
      expect(Date.now() - started).toBeLessThan(30_000);
    } finally {
      server.stop(true);
    }
  }, 60_000);
```

In `cli/test/preview-command.test.ts`, change the fake renderer to return a `RenderResult` (and accept an optional font report):
```ts
function fakes(over: Partial<PreviewDeps> = {}, missingFonts: string[] = []) {
  const calls = { render: [] as { targets: RenderTarget[]; outDir: string; browserPath: string }[], opened: [] as string[] };
  let stop!: () => void;
  const stopped = new Promise<void>((r) => (stop = r));
  const deps: PreviewDeps = {
    findBrowser: () => CHROME,
    render: async (o) => {
      calls.render.push({ targets: o.targets, outDir: o.outDir, browserPath: o.browserPath });
      const files = o.targets.flatMap((t) => [join(t.outDir ?? o.outDir, `${t.name}.png`), join(t.outDir ?? o.outDir, `${t.name}.dark.png`)]);
      return { files, missingFonts };
    },
    openUrl: async (url) => {
      calls.opened.push(url);
      return true;
    },
    waitForStop: () => stopped,
    ...over,
  };
  return { deps, calls, stop };
}
```
and append:
```ts
describe("motif preview: fonts", () => {
  test("each target lists the theme fonts to check", async () => {
    const { deps, calls } = fakes();
    await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), deps);
    expect(calls.render[0]!.targets[0]!.fonts).toEqual(["Inter"]);
  });

  test("a font that didn't load is named, with why", async () => {
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), fakes({}, ["Plus Jakarta Sans"]).deps);
    expect(r.exitCode).toBe(0);
    expect(r.data.missingFonts).toEqual(["Plus Jakarta Sans"]);
    expect(r.text).toContain("Shown with a fallback font: Plus Jakarta Sans");
  });
});
```

Append to `describe("runTokens", …)` in `cli/test/tokens-command.test.ts`:
```ts
  test("lists the fonts the app must load, with the weights its roles use", async () => {
    const r = await runTokens(app(), ctx());
    expect(r.data.fonts).toEqual([{ family: "Inter", weights: expect.any(Array) }]);
    expect((r.data.fonts as { weights: number[] }[])[0]!.weights.length).toBeGreaterThan(0);
    expect(r.text).toContain("Theme fonts: Inter");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && bun test test/theme-fonts.test.ts test/preview-css.test.ts test/render.test.ts test/preview-command.test.ts test/tokens-command.test.ts`
Expected: FAIL — `theme-fonts` doesn't exist; `renderPngs` returns an array; no `missingFonts` or `fonts` in the results.

- [ ] **Step 3: Which fonts a theme uses**

`cli/src/generate/theme-fonts.ts`:
```ts
import { isBundledFamily } from "../preview/font-list";
import type { Theme } from "./theme";

export interface ThemeFontUse {
  family: string;
  /** Weights the theme's type roles use with this family, lowest first. */
  weights: number[];
  /** bundled: ships with Motif · system: on every common OS, never fetched · google: loaded from Google Fonts in mockups. */
  source: "bundled" | "google" | "system";
}

const GENERIC = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace",
  "ui-rounded", "math", "emoji", "fangsong", "-apple-system", "blinkmacsystemfont",
]);
const SYSTEM = new Set([
  "arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman", "courier", "courier new", "verdana",
  "tahoma", "trebuchet ms", "segoe ui", "segoe ui variable", "sf pro", "sf pro text", "sf pro display", "sf mono",
  "new york", "menlo", "monaco", "consolas", "cascadia code", "lucida grande",
]);

/** The family a type role asks for first, or null when its list starts with a generic family. */
export function firstFamily(css: string): string | null {
  const first = css.split(",")[0]!.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  return first && !GENERIC.has(first.toLowerCase()) ? first : null;
}

/** Each family the theme's type roles ask for first, with the weights used. */
export function themeFonts(theme: Theme): ThemeFontUse[] {
  const uses = new Map<string, ThemeFontUse>();
  for (const font of theme.fonts) {
    const family = firstFamily(font.family);
    if (!family) continue;
    const key = family.toLowerCase();
    const use = uses.get(key) ?? { family, weights: [], source: isBundledFamily(family) ? "bundled" : SYSTEM.has(key) ? "system" : "google" };
    if (!use.weights.includes(font.weight)) use.weights.push(font.weight);
    uses.set(key, use);
  }
  return [...uses.values()].map((u) => ({ ...u, weights: [...u.weights].sort((a, b) => a - b) }));
}

/** One family per request: Google skips weights a family lacks, but a family it doesn't know fails the whole request. */
export function googleFontsUrl(family: string, weights: number[]): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights.join(";")}&display=swap`;
}
```
(If the first test shows `themeFonts` listing fonts in a different order than the expectation, sort the result by family name and update the expectations to that order: the order isn't part of the contract.)

In `cli/src/generate/preview-css.ts`, import `CSS_HEADER` from `./header` and `{ googleFontsUrl, themeFonts }` from `./theme-fonts`, and make `previewCss` start with:
```ts
  const imports = themeFonts(theme)
    .filter((f) => f.source === "google")
    .map((f) => `@import url("${googleFontsUrl(f.family, f.weights)}");`);
  const base = motifCss(theme);
  // @import must come before every rule; after the header comment keeps the file recognisable as Motif's.
  const css = imports.length > 0 ? base.replace(`${CSS_HEADER}\n`, `${CSS_HEADER}\n${imports.join("\n")}\n`) : base;
```
and use `css` where it used `motifCss(theme)`.

- [ ] **Step 4: Report fonts that didn't load**

In `cli/src/preview/render.ts`:
```ts
export interface RenderTarget {
  url: string;
  name: string;
  /** Where this target's PNGs go (default: the outDir option). */
  outDir?: string;
  /** Font families the page should have; any that can't load are reported. */
  fonts?: string[];
}

export interface RenderResult {
  files: string[];
  /** Families from the targets' `fonts` that had no loadable font face. */
  missingFonts: string[];
}

const FONT_WAIT_MS = 5000;
// Fonts never hold a render up for long: offline, or with a slow font server, the fallback is shown.
const FONTS_READY = `Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${FONT_WAIT_MS}))]).then(() => true)`;

/** Loads each family explicitly (so ones the page doesn't use yet count too) and lists those with no face that loads. */
export function missingFontsScript(families: string[]): string {
  const list = JSON.stringify(families);
  return `Promise.race([
    Promise.all(${list}.map((f) => document.fonts.load("16px " + JSON.stringify(f)).then((faces) => (faces.length > 0 ? null : f), () => f))),
    new Promise((r) => setTimeout(() => r(${list}), ${FONT_WAIT_MS})),
  ]).then((found) => found.filter(Boolean))`;
}
```
Change `renderPngs` to return `Promise<RenderResult>`: replace the `document.fonts.ready` evaluate with `await page.evaluate(FONTS_READY);`; for the light pass of each target with `fonts?.length`, run `for (const f of await page.evaluate<string[]>(missingFontsScript(target.fonts))) missing.add(f);`; write each target's PNGs to `target.outDir ?? opts.outDir` (create it with `mkdirSync(…, { recursive: true })`); return `{ files: written, missingFonts: [...missing] }`.

In `cli/src/commands/preview.ts`:
- import `{ themeFonts }` from `../generate/theme-fonts`;
- add `const fontsOf = (t: Theme | null) => (t ? themeFonts(t).filter((f) => f.source !== "system").map((f) => f.family) : []);`
- give gallery targets `fonts: fontsOf(presetTheme(id))` and mockup targets `fonts: fontsOf(theme)`;
- after rendering: `const rendered = await deps.render(…); pngs = rendered.files.map(…); missingFonts = rendered.missingFonts;`
- when `missingFonts.length > 0`, add the note `Shown with a fallback font: ${missingFonts.join(", ")}. Motif includes the starting styles' fonts; other fonts come from Google Fonts, which didn't provide these (no connection, or not a Google font).`, and add `missingFonts` to `data` in both the `--png-only` and the serving result.

In `cli/src/commands/tokens.ts` (the normal path, after `const theme = buildTheme(doc);`):
```ts
  const fonts = themeFonts(theme)
    .filter((f) => f.source !== "system")
    .map(({ family, weights }) => ({ family, weights }));
```
add `fonts` to the returned `data`, and when there are any, add this line to the text after the file list: `Theme fonts: ${fonts.map((f) => `${f.family} ${f.weights.join(" · ")}`).join(", ")}. Your app needs to load them (your stack's Motif guide shows how).`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/theme-fonts.test.ts test/preview-css.test.ts test/render.test.ts test/preview-command.test.ts test/preview-live.test.ts test/tokens-command.test.ts test/preview-e2e.test.ts && bun run typecheck`
Expected: PASS (render, live and e2e tests skip without a browser).

- [ ] **Step 6: Commit**

```bash
git add cli/src/generate/theme-fonts.ts cli/src/generate/preview-css.ts cli/src/preview/render.ts cli/src/commands/preview.ts cli/src/commands/tokens.ts cli/test/theme-fonts.test.ts cli/test/preview-css.test.ts cli/test/render.test.ts cli/test/preview-command.test.ts cli/test/tokens-command.test.ts
git commit -m "feat(preview): other theme fonts from Google Fonts, fallback report, fonts an app must load"
```

---
### Task 4: Design directions: a mockup can carry its own theme

**Files:**
- Create: `cli/src/preview/theme-file.ts`, `cli/test/directions.test.ts`
- Modify: `cli/src/preview/server.ts`, `cli/src/commands/preview.ts`, `cli/src/commands/validate.ts`, `cli/src/main.ts`, `cli/src/commands/shot.ts` (one comment), `skill/preview-kit/README.md`
- Test: `cli/test/main.test.ts` (append)

**Interfaces:**
- Consumes: `RenderTarget.outDir`, `RenderTarget.fonts`, `RenderResult` (Task 3); `loadTokenDocument`, `validateTokens`, `checkRoles`, `checkContrast`, `buildTheme`, `formatFindings` (1A–1B); `previewCss` (Task 3).
- Produces:
  - From `src/preview/theme-file.ts`: `loadThemeFile(label: string, text: string): { theme: Theme | null; problems: Finding[] }` (errors only; the theme is null when there are any).
  - From `src/preview/server.ts`: `themeHrefFor(root: string, file: string): string` — `/__motif/theme.css?tokens=<project path>` when the mockup's own folder holds a `tokens.json` other than `design/tokens.json`, else `/__motif/theme.css`; `GET /__motif/theme.css?tokens=<path>` serves that file's theme (a CSS comment when the path is outside the project, isn't a `tokens.json`, or has problems).
  - `motif preview`: a mockup with its own `tokens.json` (a *direction*) uses that theme; each direction's file is checked first (exit 1 naming the file when it has problems); the design guide is needed only for mockups without their own theme; PNGs go next to each mockup unless `--out` is given (the gallery still defaults to `design/previews`).
  - `runValidate(cwd: string, opts?: { tokens?: string }): Promise<CommandResult>` — with `tokens`, checks only that file (format, roles, every readability pair); `motif validate --tokens <file>`.
  - The `init` mode (Task 6) relies on all of this.

- [ ] **Step 1: Write the failing tests**

`cli/test/directions.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runPreview, type PreviewDeps } from "../src/commands/preview";
import { runValidate } from "../src/commands/validate";
import type { RenderTarget } from "../src/preview/render";
import { startPreviewServer, themeHrefFor } from "../src/preview/server";
import { validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const MOCKUP = '<!doctype html><html><head><title>A</title></head><body><div class="mk-stage"><div class="mk-frame mk-phone mk-ios">Hi</div></div></body></html>';

/** The fixture's theme values with the background role pointed elsewhere, so each direction is recognisable. */
function direction(background: string) {
  const tokens = validTokens();
  tokens.color.background.$value = background;
  return JSON.stringify(tokens);
}

const twoDirections = (extra: Record<string, string> = {}) =>
  makeProject({
    "design/directions/calm/tokens.json": direction("{primitive.color.gray.50}"),
    "design/directions/calm/home.html": MOCKUP,
    "design/directions/bold/tokens.json": direction("{primitive.color.white}"),
    "design/directions/bold/home.html": MOCKUP,
    ...extra,
  });

function fakeDeps() {
  const calls: { targets: RenderTarget[]; outDir: string }[] = [];
  const deps: PreviewDeps = {
    findBrowser: () => ({ name: "Chrome", path: "/fake/chrome" }),
    render: async (o) => {
      calls.push({ targets: o.targets, outDir: o.outDir });
      return { files: o.targets.map((t) => join(t.outDir ?? o.outDir, `${t.name}.png`)), missingFonts: [] };
    },
    openUrl: async () => true,
    waitForStop: () => new Promise(() => {}),
  };
  return { deps, calls };
}
const ctx = (positionals: string[], flags: Record<string, string | boolean> = {}) => ({ positionals, flags });

describe("themeHrefFor", () => {
  test("a mockup next to a tokens.json uses it; others use the design guide", () => {
    const root = twoDirections({ "design/tokens.json": JSON.stringify(validTokens()), "design/previews/home.html": MOCKUP, "design/x.html": MOCKUP });
    expect(themeHrefFor(root, join(root, "design/directions/calm/home.html"))).toBe("/__motif/theme.css?tokens=design%2Fdirections%2Fcalm%2Ftokens.json");
    expect(themeHrefFor(root, join(root, "design/previews/home.html"))).toBe("/__motif/theme.css");
    expect(themeHrefFor(root, join(root, "design/x.html"))).toBe("/__motif/theme.css");
  });
});

describe("the preview server and directions", () => {
  test("serves each direction's own theme, and only real tokens.json files inside the project", async () => {
    const root = twoDirections({ "design/directions/calm/notes.json": "{}" });
    const server = startPreviewServer({ root, theme: null });
    try {
      const page = await (await fetch(`${server.url}/design/directions/bold/home.html`)).text();
      expect(page).toContain("theme.css?tokens=design%2Fdirections%2Fbold%2Ftokens.json");
      const css = async (q: string) => (await fetch(`${server.url}/__motif/theme.css?tokens=${encodeURIComponent(q)}`)).text();
      expect(await css("design/directions/bold/tokens.json")).toContain("--motif-color-background: #FFFFFF;");
      expect(await css("design/directions/calm/tokens.json")).toContain("--motif-color-background: #F9FAFB;");
      expect(await css("design/directions/calm/notes.json")).toStartWith("/*");
      expect(await css("../outside/tokens.json")).toStartWith("/*");
    } finally {
      server.stop();
    }
  });
});

describe("motif preview with directions", () => {
  test("compares directions before there's a design guide, each with its own theme and fonts", async () => {
    const root = twoDirections();
    const { deps, calls } = fakeDeps();
    const r = await runPreview(root, ctx(["design/directions/calm/home.html", "design/directions/bold/home.html"], { "png-only": true }), deps);
    expect(r.exitCode).toBe(0);
    const targets = calls[0]!.targets;
    expect(targets.map((t) => t.outDir)).toEqual([join(root, "design/directions/calm"), join(root, "design/directions/bold")]);
    expect(targets.map((t) => t.name)).toEqual(["home", "home"]);
    expect(targets.every((t) => t.fonts?.includes("Inter"))).toBe(true);
    expect(r.data.pngs).toEqual(["design/directions/calm/home.png", "design/directions/bold/home.png"]);
  });

  test("a direction with mistakes is refused, by name, before anything renders", async () => {
    const root = twoDirections({ "design/directions/bold/tokens.json": '{ "color": {} }' });
    const { deps, calls } = fakeDeps();
    const r = await runPreview(root, ctx(["design/directions/calm/home.html", "design/directions/bold/home.html"], { "png-only": true }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("design/directions/bold/tokens.json");
    expect(r.text).toContain("motif validate --tokens design/directions/bold/tokens.json");
    expect(r.data.error).toBe("invalid-direction");
    expect(calls).toHaveLength(0);
  });

  test("a mockup without its own theme still needs the design guide", async () => {
    const root = twoDirections({ "design/previews/home.html": MOCKUP });
    const r = await runPreview(root, ctx(["design/directions/calm/home.html", "design/previews/home.html"], { "png-only": true }), fakeDeps().deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("no-contract");
  });

  test("--out still puts every PNG in one folder", async () => {
    const root = twoDirections();
    const { deps, calls } = fakeDeps();
    await runPreview(root, ctx(["design/directions/calm/home.html", "design/directions/bold/home.html"], { "png-only": true, out: "pictures" }), deps);
    expect(calls[0]!.targets.map((t) => t.outDir)).toEqual([join(root, "pictures"), join(root, "pictures")]);
    expect(calls[0]!.targets.map((t) => t.name)).toEqual(["design-directions-calm-home", "design-directions-bold-home"]);
  });
});

describe("motif validate --tokens", () => {
  test("checks one theme values file on its own, readability included", async () => {
    const root = twoDirections();
    const ok = await runValidate(root, { tokens: "design/directions/calm/tokens.json" });
    expect(ok.exitCode).toBe(0);
    expect(ok.text).toContain("design/directions/calm/tokens.json");
    expect(ok.data.summary).toMatchObject({ errors: 0 });

    const low = validTokens();
    low.color["text-secondary"].$value = "{primitive.color.gray.200}";
    const bad = makeProject({ "d/tokens.json": JSON.stringify(low) });
    const r = await runValidate(bad, { tokens: "d/tokens.json" });
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(r.data.findings)).toContain("contrast");

    expect((await runValidate(root, { tokens: "nope/tokens.json" })).exitCode).toBe(2);
  });
});
```

Append to `cli/test/main.test.ts`:
```ts
describe("main: validate --tokens", () => {
  test("is a known option, listed in help", () => {
    expect(run("help").stdout.toString()).toContain("--tokens");
    expect(run("validate", "--tokens", "missing.json").exitCode).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && bun test test/directions.test.ts test/main.test.ts`
Expected: FAIL — `themeHrefFor` isn't exported; `runValidate` ignores `tokens`; `--tokens` is an unknown option.

- [ ] **Step 3: Load a theme file once, for the server and the command**

`cli/src/preview/theme-file.ts`:
```ts
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import type { Finding } from "../findings";
import { buildTheme, type Theme } from "../generate/theme";

/** A theme values file as a mockup theme: null with its problems when it has any error. */
export function loadThemeFile(label: string, text: string): { theme: Theme | null; problems: Finding[] } {
  const { doc, findings } = loadTokenDocument(label, text);
  const problems = doc ? [...findings, ...validateTokens(doc), ...checkRoles(doc)].filter((f) => f.severity === "error") : findings;
  return { theme: doc && problems.length === 0 ? buildTheme(doc) : null, problems };
}
```
In `cli/src/commands/preview.ts`, make `contractTheme` use it: `return loadThemeFile(TOKENS_JSON, readFileSync(path, "utf8"));` after the existence check.

- [ ] **Step 4: The server serves each direction's theme**

In `cli/src/preview/server.ts` (import `basename`, `join` and `loadThemeFile`):
```ts
const GUIDE_TOKENS = "design/tokens.json";

/** A mockup's theme: the tokens.json in its own folder (a design direction), or the design guide's. */
export function themeHrefFor(root: string, file: string): string {
  const own = join(dirname(file), "tokens.json");
  const rel = relative(root, own).split(sep).join("/");
  if (rel === GUIDE_TOKENS || !existsSync(own)) return "/__motif/theme.css";
  return `/__motif/theme.css?tokens=${encodeURIComponent(rel)}`;
}

function directionCss(root: string, rel: string): string {
  const file = resolveInside(root, rel);
  if (!file || basename(file) !== "tokens.json" || !existsSync(file)) return `/* There's no theme at ${rel}. */\n`;
  const { theme } = loadThemeFile(rel, readFileSync(file, "utf8"));
  return theme ? previewCss(theme) : `/* ${rel} has problems. Run: motif validate --tokens ${rel} */\n`;
}
```
In the `/__motif/theme.css` branch, answer `directionCss(root, tokens)` when `url.searchParams.get("tokens")` is set (else as before), and serve mockups with `injectKit(readFileSync(file, "utf8"), themeHrefFor(root, file))`. The project folder is watched already, so saving a direction's `tokens.json` reloads its mockups.

- [ ] **Step 5: The command checks directions and writes PNGs beside each mockup**

In `cli/src/commands/preview.ts` (import `dirname` and `posix` from `node:path`, and `loadThemeFile`):
```ts
/** The tokens.json beside a mockup that makes it a design direction (the design guide's own file doesn't count). */
function directionTokens(cwd: string, file: string): string | null {
  const rel = posix.join(posix.dirname(file), "tokens.json");
  return rel !== TOKENS_JSON && existsSync(join(cwd, rel)) ? rel : null;
}

/** PNG base names: the file name, or the whole path when two mockups share a file name and an output folder. */
function pngNames(files: string[], outDirs: string[]): string[] {
  const base = files.map((f) => basename(f).replace(/\.html$/i, ""));
  return files.map((f, i) =>
    base.some((b, j) => j !== i && b === base[i] && outDirs[j] === outDirs[i]) ? f.replace(/\.html$/i, "").replace(/\//g, "-") : base[i]!,
  );
}
```
After collecting `files` (and before loading the design guide):
```ts
  const directions = new Map<string, Theme>();
  for (const file of gallery ? [] : files) {
    const rel = directionTokens(cwd, file);
    if (!rel || directions.has(rel)) continue;
    const loaded = loadThemeFile(rel, readFileSync(join(cwd, rel), "utf8"));
    if (!loaded.theme) {
      const n = loaded.problems.length;
      return fail(
        1,
        `✗ ${rel} has ${n} ${n === 1 ? "problem" : "problems"}, so its mockups would be wrong:\n${formatFindings(loaded.problems)}\nFix these first (motif validate --tokens ${rel} shows details).`,
        { error: "invalid-direction", tokens: rel, findings: loaded.problems },
      );
    }
    directions.set(rel, loaded.theme);
  }
  const needsGuide = !gallery && preset === undefined && files.some((f) => !directionTokens(cwd, f));
```
Load the design guide only when `needsGuide` (the "no design guide" error is unchanged). Then build targets:
```ts
  const outFlag = typeof flags.out === "string" ? resolve(cwd, flags.out) : null;
  const defaultOut = outFlag ?? join(cwd, "design", "previews");
  const outFor = (file: string) => outFlag ?? join(cwd, dirname(file));
  const themeOf = (file: string) => {
    const rel = directionTokens(cwd, file);
    return rel ? directions.get(rel)! : theme;
  };
  const names = pngNames(files, files.map(outFor));
  const targets: RenderTarget[] = gallery
    ? PRESET_IDS.map((id) => ({ name: `preset-${id}`, url: `${server.url}/__motif/preset/${id}/sample.html`, outDir: defaultOut, fonts: fontsOf(presetTheme(id)) }))
    : files.map((f, i) => ({ name: names[i]!, url: server.url + urlPath(f), outDir: outFor(f), fonts: fontsOf(themeOf(f)) }));
```
and pass `outDir: defaultOut` to `deps.render`. Update `--out`'s help line to `--out <folder>    Where PNGs go (preview: next to each mockup; gallery: design/previews; shot: design/shots)`.

In `cli/src/commands/shot.ts`, change the comment above `mockupFrames(…)` to: `// motif preview writes a mockup's PNGs next to it (older versions wrote them to design/previews/).`

- [ ] **Step 6: `motif validate --tokens`**

In `cli/src/commands/validate.ts` (import `relative`, `resolve`, `sep` and `statSync`):
```ts
export async function runValidate(cwd: string, opts: { tokens?: string } = {}): Promise<CommandResult> {
  if (opts.tokens !== undefined) return validateTokensFile(cwd, opts.tokens);
  // …the existing body, unchanged
}

/** One theme values file on its own (a design direction): format, roles and every readability pair. */
function validateTokensFile(cwd: string, arg: string): CommandResult {
  const abs = resolve(cwd, arg);
  const rel = relative(cwd, abs).split(sep).join("/");
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { command: "validate", exitCode: 2, text: `Couldn't find ${arg}.`, data: { error: "no-such-file", file: arg } };
  }
  const { doc, findings: loadFindings } = loadTokenDocument(rel, readFileSync(abs, "utf8"));
  const findings: Finding[] = [...loadFindings];
  let contrastChecks = 0;
  if (doc) {
    findings.push(...validateTokens(doc), ...checkRoles(doc));
    const contrast = checkContrast(doc);
    findings.push(...contrast.findings);
    contrastChecks = contrast.checked;
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const tokens = doc?.tokens.size ?? 0;
  const text = errors > 0
    ? `✗ ${rel} has ${plural(errors, "problem", "problems")}:\n${formatFindings(findings)}`
    : `✓ ${rel} is valid: ${plural(tokens, "value", "values")}, ${plural(contrastChecks, "readability check", "readability checks")} passed.${warnings ? `\n${formatFindings(findings)}` : ""}`;
  return { command: "validate", exitCode: errors > 0 ? 1 : 0, text, data: { file: rel, findings, summary: { errors, warnings, tokens, contrastChecks } } };
}
```
In `cli/src/main.ts`: add `tokens: { type: "string" }` to the parsed options and `tokens: values.tokens` to `flags`; register `validate: (cwd, ctx) => runValidate(cwd, { tokens: typeof ctx.flags?.tokens === "string" ? ctx.flags.tokens : undefined }),`; add to `HELP` after the Preview options:
```
Validate options:
  --tokens <file>   Check one theme values file on its own (e.g. a design direction's)
```

- [ ] **Step 7: Tell agents how directions work**

Add to `skill/preview-kit/README.md`, after `## With the tool (normal)`:
```markdown
## Directions

To compare looks side by side, give each direction its own folder, such as `design/directions/calm/`, holding a `tokens.json` (copy a starting style's from the skill's `presets/` folder and change the values) and its mockups. A mockup uses the `tokens.json` in its own folder; every other mockup uses the design guide. Check each direction with `motif validate --tokens design/directions/calm/tokens.json`, make PNGs with `motif preview design/directions/calm --png-only` (they're saved next to the mockups), and show several at once with `motif preview --compare design/directions/calm/home.html design/directions/bold/home.html`.
```
and in `## With the tool (normal)` replace "writes PNGs (light and dark) next to it" with "writes PNGs (light and dark) next to the mockup".

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd cli && bun test test/directions.test.ts test/main.test.ts test/preview-command.test.ts test/preview-server.test.ts test/validate.test.ts test/shot-command.test.ts test/skill-content.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add cli/src/preview/theme-file.ts cli/src/preview/server.ts cli/src/commands/preview.ts cli/src/commands/validate.ts cli/src/commands/shot.ts cli/src/main.ts cli/test/directions.test.ts cli/test/main.test.ts skill/preview-kit/README.md
git commit -m "feat(preview): design directions with their own theme; validate --tokens"
```

---
### Task 5: The stack guides: the template and React web

**Files:**
- Create: `skill/adapters/_template/README.md`; `skill/adapters/react-web/README.md`, `tokens.md`, `components.md`, `motion.md`, `platform.md`, `checks.md`; `cli/test/adapters.test.ts`
- Modify: `cli/src/check/types.ts` (a runtime list of rule ids)

**Interfaces:**
- Consumes: the lint (Task 1); `motif tokens` data `fonts` (Task 3); the generated files and Tailwind theme from 1B (`src/styles/motif.css`, `src/styles/motif.tailwind.css`, `src/design/motion.ts`); `motif check` rules.
- Produces:
  - From `src/check/types.ts`: `RULE_IDS` (readonly array of every rule id) with `type RuleId = (typeof RULE_IDS)[number]` (same union as today).
  - Six React web files that the modes (Task 6) link to: `README.md` (detect and scaffold), `tokens.md`, `components.md`, `motion.md`, `platform.md`, `checks.md`. None of them links to `SKILL.md` or the modes (those are written in Task 6).

How to write the guides: plain instructions for an agent, in Motif's voice; real commands and APIs only (checked in the facts above and against 1B's generator); code examples use theme values only, so they pass `motif check`; one command per line in shell blocks (Task 1 lint). Every file ≤ 400 lines.

- [ ] **Step 1: Write the failing test**

`cli/test/adapters.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";

const ADAPTERS = join(import.meta.dir, "../../skill/adapters");
const read = (rel: string) => readFileSync(join(ADAPTERS, rel), "utf8").replace(/\r\n/g, "\n");
const GUIDE_FILES = ["README.md", "checks.md", "components.md", "motion.md", "platform.md", "tokens.md"];
const STARTER_SET = [
  "Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar",
  "TabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the stack guide template", () => {
  test("names the six files every stack guide has, with the part each covers", () => {
    const template = read("_template/README.md");
    for (const file of GUIDE_FILES) expect(template).toContain(`\`${file}\``);
    for (const part of ["0. Detect and scaffold", "1. Theme code", "2. Components", "3. Motion", "4. Platform rules", "5. Checks and screenshots"]) {
      expect(template).toContain(part);
    }
  });
});

describe("the React web guide", () => {
  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "react-web")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: both starters, without Next.js agent feedback, plus build and type-check commands", () => {
    const readme = read("react-web/README.md");
    for (const s of ["create-next-app@latest", "--no-agent-feedback", "--src-dir", "create vite@latest", "--template react-ts", "@tailwindcss/vite", "npm install motion", "npm run build", "npx tsc --noEmit"]) {
      expect(readme).toContain(s);
    }
  });

  test("tokens.md: the generated files, wiring them in, dark mode and fonts", () => {
    const tokens = read("react-web/tokens.md");
    for (const s of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts", '@import "tailwindcss";', "data-theme", "@fontsource/", "next/font", "bg-action-primary"]) {
      expect(tokens).toContain(s);
    }
  });

  test("components.md: the starter set, with states, focus and an example that uses only theme values", () => {
    const components = read("react-web/components.md");
    for (const c of STARTER_SET) expect(components).toContain(`\`${c}\``);
    for (const s of ["focus-visible:", "aria-busy", "aria-invalid", "radix-ui", "spring.snappy"]) expect(components).toContain(s);
    expect(components).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test("motion.md: MotionConfig, the motion roles and the common patterns", () => {
    const motion = read("react-web/motion.md");
    for (const s of ['reducedMotion="user"', 'from "@/design/motion"', "spring.smooth", "duration.fast", "easing.exit", "AnimatePresence", "layout"]) {
      expect(motion).toContain(s);
    }
  });

  test("platform.md: semantics, logical properties, pointers, breakpoints and safe areas", () => {
    const platform = read("react-web/platform.md");
    for (const s of ["ps-4", "text-start", "hover", "prefers-reduced-motion", "lang", "safe-area-inset", "DESIGN.md"]) expect(platform).toContain(s);
  });

  test("checks.md explains every motif check rule and every shot finding", () => {
    const checks = read("react-web/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(`## \`${id}\``);
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "motif-ok"]) expect(checks).toContain(s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/adapters.test.ts`
Expected: FAIL — `RULE_IDS` isn't exported and the guides don't exist.

- [ ] **Step 3: A runtime list of rule ids**

In `cli/src/check/types.ts`, replace the `RuleId` union with:
```ts
export const RULE_IDS = [
  "raw-color", "tailwind-arbitrary", "tailwind-palette", "off-scale", "raw-font",
  "raw-motion", "primitive-use", "reduced-motion", "generated-edited",
] as const;
export type RuleId = (typeof RULE_IDS)[number];
```

- [ ] **Step 4: Write the template**

`skill/adapters/_template/README.md`:
````markdown
# Stack guide template

Every stack Motif supports has two halves: a guide in `adapters/<stack>/` that agents read, and code in the motif tool that runs exactly (spec §11.1). This file lists what a guide covers; [React web](../react-web/README.md) is the reference.

## Files

| File | Part | Covers | Matching code in the motif tool |
|---|---|---|---|
| `README.md` | 0. Detect and scaffold | How the stack is recognised, the official starter commands, the folders that matter, how to build and type-check | Stack detection; route discovery for `motif shot` |
| `tokens.md` | 1. Theme code | What `motif tokens` writes, how to wire it in, how components use it, how to load the theme's fonts | The theme code generator |
| `components.md` | 2. Components | Where components live, how to build one the stack's way, the starter set, every state | Agents list components by reading the folder |
| `motion.md` | 3. Motion | The motion roles in the stack's animation API, common patterns, reduced motion | Spring and easing output (spec §6.4) |
| `platform.md` | 4. Platform rules | The platform's conventions and accessibility specifics | — |
| `checks.md` | 5. Checks and screenshots | Each `motif check` rule and `motif shot --audit` finding on this stack, and how to fix it | The check rules and the screenshot driver |

## Rules for every guide

- Use the stack's own words and APIs, and link the official docs for anything that changes often.
- Theme values only, always through the generated theme code. Examples must pass `motif check`.
- Every component example shows its states, its focus style and its accessible name.
- Commands are single commands that work in every shell.
- Keep each file under 400 lines.

## Adding a stack

1. Create `adapters/<stack>/` with the six files above, filled for the stack.
2. Add the tool code for each row of the table, with tests.
3. Add two fixtures: a small app that follows a design guide, and an app with seeded issues (Motif's evaluations use both).
````

- [ ] **Step 5: Write the React web guide**

Each file starts with `# <Title>` and a one-sentence intro. Content (each bullet becomes one to three sentences, a table row or a short example):

**`react-web/README.md`** — *React web*
- `## What Motif expects`: React 18 or later with TypeScript; Next.js (App Router) or Vite; Tailwind CSS v4 or plain CSS; Motion (`motion/react`) for animation; shadcn/ui when the project already uses it, otherwise Radix primitives (`radix-ui`) where accessibility needs them (menus, dialogs, selects, tabs). Tailwind v3 projects get CSS variables only (see [theme code](tokens.md)).
- `## How Motif recognises it`: `react` and `react-dom` in `package.json`, plus `next` or `vite`; `motif doctor --json` lists the app with stack `react-web`. In a monorepo, `design/motif.json` maps each app's folder to its stack.
- `## Starting a new project`: Next.js is the default; Vite + React when the developer asks for a single-page app. Use the developer's package manager (`--use-pnpm`, `--use-yarn` or `--use-bun` instead of `--use-npm`). Next.js:
  ```bash
  npx create-next-app@latest my-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-agent-feedback --yes
  ```
  `--no-agent-feedback` stops Next.js preparing feedback from the coding session; Motif shares nothing. Vite (then add Tailwind):
  ```bash
  npm create vite@latest my-app -- --template react-ts --no-interactive
  npm install tailwindcss @tailwindcss/vite
  ```
  then add `tailwindcss()` to `plugins` in `vite.config.ts` and put `@import "tailwindcss";` at the top of `src/index.css`. Both: `npm install motion`; add `npm install radix-ui` when the first component needs a primitive. Run each command from the folder the developer chose; `cd` into the new project before the next ones.
- `## Folders`: Next.js pages in `src/app/` (one folder per route with `page.tsx`, shared layout in `src/app/layout.tsx`); Vite in `src/` (routing with the router the project uses). Components in `src/components/` (shadcn: `src/components/ui/`); mock data in one file, `src/mock-data.ts`; theme code in `src/styles/` and `src/design/` (generated).
- `## Build, type-check and run`: `npm run build`, `npx tsc --noEmit`; `motif shot` starts the `dev` script itself and stops it when done, so don't leave a dev server running for it.
- `## The rest of this guide`: links to [theme code](tokens.md), [components](components.md), [motion](motion.md), [platform rules](platform.md), [checks and screenshots](checks.md).

**`react-web/tokens.md`** — *Theme code*
- `## What motif tokens writes`: `src/styles/motif.css` — a CSS variable per role (`--motif-color-action-primary`, `--motif-space-4`, `--motif-font-body-size`…); light values on `:root`, dark values under `prefers-color-scheme: dark` and on `[data-theme="dark"]`, and `[data-theme="light"]` forces light. Tailwind v4 projects also get `src/styles/motif.tailwind.css`: it imports `motif.css` and maps Tailwind's utilities to the roles, removing Tailwind's default colours, radii, shadows, text sizes, fonts and easings so only the theme's exist. `src/design/motion.ts` exports `duration` (seconds), `easing` (cubic Bézier arrays) and `spring` (Motion's `{ type: "spring", visualDuration, bounce }`). The source folder follows the project (`src/` or `app/`), as recorded in `design/motif.json`. Every file starts with a "Generated by Motif" line: never edit them; change `design/tokens.json` and run `motif tokens` again.
- `## Wiring it in, once`: Tailwind v4 — in the main CSS file (Next.js: `src/app/globals.css`; Vite: `src/index.css`), import `motif.tailwind.css` right after `@import "tailwindcss";`, with a path relative to that file (Next.js example: `@import "../styles/motif.tailwind.css";`); before the Tailwind import it would be overwritten. Without Tailwind, import `motif.css` once from the main CSS file or the entry file. `motif tokens` reminds you when this is missing.
- `## Using the values`: a table of role → Tailwind utility → CSS variable: `color.background` → `bg-background` → `var(--motif-color-background)`; `color.text-primary` → `text-text-primary`; `color.action-primary` + `color.on-action-primary` → `bg-action-primary text-on-action-primary`; `color.border` → `border-border`; `space.4` → `p-4`, `gap-4`, `mt-4`; `radius.md` → `rounded-md`; `shadow.md` → `shadow-md`; `font.body` → `font-body text-body` (family, then size with its line height and weight); `easing.standard` → `ease-standard`; plain `transition` uses `duration.base` and `easing.standard`. In TypeScript, import from `@/design/motion` (motion only); everything else is a class or a CSS variable. `@/` is the import alias the Next.js starter sets up; in a project without one (the Vite starter), use a relative path such as `../design/motion`.
- `## Dark mode`: it follows the system automatically. For a switch, set `data-theme="dark"` or `data-theme="light"` on `<html>` and remember the choice; remove the attribute to follow the system again. Never use Tailwind's `dark:` variant for colours: the roles already change.
- `## Fonts`: `motif tokens --json` lists the theme's `fonts` (family and weights; system fonts are left out). Load each with its Fontsource package: `npm install @fontsource/<id>` (the id is the family in lower case with spaces as hyphens: Inter → `inter`, Source Serif 4 → `source-serif-4`), then import each weight once in the root (Next.js: `src/app/layout.tsx`; Vite: `src/main.tsx`), e.g. `import "@fontsource/inter/400.css";`. The fonts are served with the app, so nothing loads from Google at runtime. Don't use `next/font` or the `@fontsource-variable` packages: both register a different family name, so the theme's font names wouldn't match.
- `## Tailwind v3`: Motif writes the CSS variables only; use them as `bg-[var(--motif-color-action-primary)]`, or upgrade to Tailwind v4 for the generated theme.

**`react-web/components.md`** — *Components*
- `## Where they live`: `src/components/`, one component per file in PascalCase; shadcn/ui projects keep theirs in `src/components/ui/` — restyle those to the theme's roles instead of adding a second set. To list what exists (the `feature` mode's first step): read the folder and each component's props for its variants and states.
- `## How to build one`: a real element for the job (`button` for actions, `a` or the router's link for navigation, `label` for every input); pass `className` and other props through; variants as a `variant` prop mapped to class lists, never inline styles; theme values only. Tailwind v4's `hover:` already applies only on devices that can hover. Every interactive element: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`. Disabled: the `disabled` attribute (or `aria-disabled` when it must stay focusable) and a visible change. Loading: `aria-busy="true"`, keep the width, show a spinner or skeleton inside. Errors: `aria-invalid="true"` and `aria-describedby` pointing at the error text in `text-danger`. Touch targets at least 44 px: `min-h-12` and `px-4` on buttons, `size-12` on icon buttons.
- `## Example: Button`:
  ```tsx
  import { motion, type HTMLMotionProps } from "motion/react";
  import { spring } from "@/design/motion";

  type Variant = "primary" | "secondary" | "ghost";

  const VARIANTS: Record<Variant, string> = {
    primary: "bg-action-primary text-on-action-primary",
    secondary: "bg-action-secondary text-on-action-secondary",
    ghost: "bg-transparent text-text-primary hover:bg-surface-raised",
  };

  export function Button({ variant = "primary", loading = false, disabled, className = "", children, ...props }: HTMLMotionProps<"button"> & { variant?: Variant; loading?: boolean }) {
    const inactive = disabled || loading;
    return (
      <motion.button
        whileTap={inactive ? undefined : { scale: 0.97 }}
        transition={spring.snappy}
        disabled={inactive}
        aria-busy={loading || undefined}
        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 font-label text-label ${VARIANTS[variant]} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
  ```
- `## The starter set`: a table, one row per component with what it's for, the Radix primitive if any, and the states it must show: `Button` (default, hover, pressed, focused, disabled, loading), `IconButton` (as Button, plus an `aria-label`), `Input` and `Textarea` (label, hint, error, disabled, read-only), `Select` (Radix `Select`), `Checkbox` and `Switch` (Radix; the label is part of the target), `Card`, `ListItem` (the whole row is the target), `TopBar`, `TabBar` (mobile web) and `Sidebar` (desktop layouts), `Sheet` (Radix `Dialog` sliding from the bottom on phones), `Dialog` (Radix `Dialog`), `Toast` (announced politely; at least 5 s), `Skeleton`, `EmptyState`, `ErrorState` (with Retry), `Avatar` (initials fallback), `Badge` (status colours with a word or icon). Point to [accessibility](../../knowledge/accessibility.md) and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md).
- `## Each component in the design guide`: when you add or change a shared component, list it in `DESIGN.md` section 5 with its purpose, variants and states.

**`react-web/motion.md`** — *Motion*
- `## Once, at the root`: wrap the app in `<MotionConfig reducedMotion="user">` (Next.js: in a client component such as `src/app/providers.tsx` with `"use client"`, used in `src/app/layout.tsx`; Vite: in `src/main.tsx`); `motif check`'s `reduced-motion` rule looks for it. CSS animations need an `@media (prefers-reduced-motion: reduce)` rule; `motif.css` already slows its own variables.
- `## The roles in code`: `import { duration, easing, spring } from "@/design/motion";` (or a relative path where the project has no `@/` alias), then `transition={spring.smooth}` for springs and `transition={{ duration: duration.base, ease: easing.standard }}` for timed changes. In CSS and Tailwind: `transition` (base duration, standard easing), `ease-enter`, `ease-exit`, and `duration-(--motif-duration-fast)` for another duration. Never type a number of milliseconds or a Bézier curve.
- `## Patterns`: press (`whileTap={{ scale: 0.97 }}` with `spring.snappy`); enter and exit (`AnimatePresence` around conditional content; `initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, transition: { duration: duration.fast, ease: easing.exit } }}`); sheets and dialogs (`spring.smooth`; the backdrop fades with `duration.base`); lists (the `layout` prop on items so the rest close gaps when one leaves; stagger the first items with `staggerChildren: 0.03` in variants, which is choreography rather than a theme value); shared elements (`layoutId` on the thumbnail and the detail image); page transitions (short fades of the content area only). Each pattern shows the code in a few lines. Link the [motion guide](../../knowledge/motion.md) for what to animate and when.
- `## Reduced motion`: with `MotionConfig reducedMotion="user"`, Motion turns movement into fades for people who ask for less; check with `motif shot --audit`, which reports anything still moving. `useReducedMotion()` covers custom cases (auto-playing carousels, parallax: turn them off).

**`react-web/platform.md`** — *Platform rules*
- `## Semantic HTML`: landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page and headings in order, real lists, buttons and links; `<html lang="…">` set in the root layout; images with `alt` (Next.js `Image` for photos).
- `## Right to left`: logical utilities and properties only: `ps-4`/`pe-4` (not `pl`/`pr`), `ms-`/`me-`, `start-0`/`end-0`, `text-start`/`text-end`, `rounded-s-`/`rounded-e-`; set `dir="rtl"` on `<html>` for right-to-left languages; mirror directional icons with `rtl:-scale-x-100`.
- `## Pointers and touch`: hover effects are extras for devices that can hover (Tailwind v4's `hover:` handles this); never hide actions behind hover; 44 px targets on touch (`pointer-coarse:` variant for bigger targets where a dense desktop layout needs smaller ones).
- `## Breakpoints`: the design guide has no breakpoint roles; use Tailwind's defaults (`sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem) and lay out phone first. If the project changes them, say so in `DESIGN.md` section 8.
- `## System settings`: light and dark follow `prefers-color-scheme` (the generated CSS does it); reduced motion follows `prefers-reduced-motion`; text grows with browser zoom, so never fix heights around text.
- `## Phones on the web`: the viewport meta tag (Next.js adds it); `viewport-fit=cover` and `env(safe-area-inset-bottom)` padding for bars pinned to the bottom (`pb-[env(safe-area-inset-bottom)]` is a safe-area value, not a design value, so mark it `motif-ok: safe area`); inputs at least 16 px so iOS doesn't zoom (the `body` role is 16 px in every starting style).
- `## Forms`: `autocomplete` values, the right `type` and `inputmode`, `enterKeyHint`; Enter submits single-field forms.

**`react-web/checks.md`** — *Checks and screenshots*
- Intro: what `motif check` and `motif shot --audit` report on React web, and how to fix each; a deliberate exception gets a `motif-ok: <reason>` comment on its line or the line above (for example a partner's brand colour), and `motif check` lists exceptions separately.
- One `##` section per rule, titled with the rule id in backticks, each with what it catches (one line), an example, and the fix:
  - `` ## `raw-color` ``: hex, `rgb()`, `hsl()`, `oklch()` or named colours in code or CSS → a colour role (`bg-surface`, `text-text-secondary`, `var(--motif-color-border)`).
  - `` ## `tailwind-arbitrary` ``: arbitrary values such as `bg-[#123456]` or `p-[13px]` → the matching role utility.
  - `` ## `tailwind-palette` ``: Tailwind's own palette (`bg-blue-500`) → a role; Motif's theme removes those colours, so they wouldn't render anyway.
  - `` ## `off-scale` ``: spacing, radius, font size or shadow not on the theme's scales (`p-[18px]`, `margin: 18px`, `rounded-[10px]`) → the nearest step; if the design truly needs a new step, propose a design guide change.
  - `` ## `raw-font` ``: a font family typed in code → `font-body` (or another font role) or `var(--motif-font-body-family)`.
  - `` ## `raw-motion` ``: a typed duration or curve in CSS, Tailwind or Motion → `transition`, `ease-standard`, `duration`/`easing`/`spring` from `@/design/motion`.
  - `` ## `primitive-use` ``: a `primitive.*` value used in product code → the role that points at it.
  - `` ## `reduced-motion` ``: the app animates but has no `MotionConfig reducedMotion="user"` (or a global reduced-motion CSS rule) → add it at the root ([motion](motion.md)).
  - `` ## `generated-edited` ``: a generated theme file was edited by hand → move the change into `design/tokens.json` and run `motif tokens`.
- `## Contrast` (shot): text measured on screen below 4.5:1 (3:1 for large text) → use the role pair the design guide defines; if a pair itself fails, `motif validate` reports it and the role values need changing.
- `## Target size` (shot): a control smaller than 24×24 px (critical) or 44×44 on phone widths (minor) → `min-h-12`/`size-12`, padding, or spacing between neighbours.
- `## Reduced motion` (shot): something still moves when reduced motion is on → the root `MotionConfig`, or `useReducedMotion()` for custom animation.
- `## Reading the results`: run with `--json`; `motif check` lists `violations` (file, line, rule, fix), `exceptions` and `warnings`; `motif shot --audit` writes `design/shots/audit.json` in the review format. Fix, then run again until both are clean.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd cli && bun test test/adapters.test.ts test/skill-content.test.ts test/check*.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/src/check/types.ts cli/test/adapters.test.ts skill/adapters
git commit -m "feat(skill): stack guide template and the React web guide"
```

---
### Task 6: `SKILL.md` and the four modes

**Files:**
- Create: `skill/SKILL.md`, `skill/modes/design.md`, `skill/modes/init.md`, `skill/modes/feature.md`, `skill/modes/review.md`, `cli/test/skill-modes.test.ts`

**Interfaces:**
- Consumes: everything earlier in 1D-1 and 1D-2: the lint (Task 1); fonts and the `fonts` list from `motif tokens` (Tasks 2–3); directions and `motif validate --tokens` (Task 4); the stack guides (Task 5); `RULE_IDS` (Task 5); `lineCount` (Task 1); the commands `doctor`, `connect`, `validate`, `tokens`, `check`, `extract`, `browser`, `preview` (`--gallery`, `--compare`, `--png-only`, `--out`), `shot` (`--audit`, `--routes`, `--save`, `--against`).
- Produces: the skill's entry and its four modes. The five files link to each other, so they're written together; the content lint passes once all five exist. Task 7 copies `skill/` into the Claude Code plugin.

The text below is the content of each file. Keep it as written (it's checked by the tests below and the lint); fix only typos and anything the lint reports.

- [ ] **Step 1: Write the failing test**

`cli/test/skill-modes.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";
import { lineCount } from "./skill-lint";

const SKILL = join(import.meta.dir, "../../skill");
const read = (rel: string) => readFileSync(join(SKILL, rel), "utf8").replace(/\r\n/g, "\n");

/** The first part that's missing or out of order, or null when they all appear in this order. */
function outOfOrder(text: string, parts: string[]): string | null {
  let at = 0;
  for (const part of parts) {
    const i = text.indexOf(part, at);
    if (i < 0) return part;
    at = i + part.length;
  }
  return null;
}

const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];

describe("SKILL.md", () => {
  const skill = read("SKILL.md");

  test("says how to run the tool from every common shell", () => {
    for (const form of ['"<skill folder>/bin/motif" <command>', '& "<skill folder>\\bin\\motif.ps1" <command>', '"<skill folder>\\bin\\motif.cmd" <command>']) {
      expect(skill).toContain(form);
    }
    for (const s of ["--json", "--png-only", "needs_browser", "motif browser install"]) expect(skill).toContain(s);
  });

  test("starts each session with doctor, the design sources and unfinished work", () => {
    expect(outOfOrder(skill, ["## At the start of a session", "motif doctor --json", "(sources/motion-dev.md)", "design/.progress.json"])).toBeNull();
  });

  test("routes to every mode and to the stack guides", () => {
    for (const link of ["(modes/design.md)", "(modes/init.md)", "(modes/feature.md)", "(modes/review.md)", "(adapters/react-web/README.md)", "(adapters/_template/README.md)", "(contract/spec.md#the-four-rules)"]) {
      expect(skill).toContain(link);
    }
  });

  test("carries the rules for every task", () => {
    for (const s of ["⏸", "skip previews", "your design guide", "theme values", "be brief", "Never a dead end", "Mock data only", "motif connect", ".gitignore", "directions/"]) {
      expect(skill).toContain(s);
    }
  });

  test("stays short, since it loads every time", () => {
    expect(lineCount(skill)).toBeLessThanOrEqual(200);
  });
});

describe("modes/design.md", () => {
  test("asks one question with three choices, then hands over", () => {
    const design = read("modes/design.md");
    for (const s of ["Start a new app", "Add a feature", "Improve my app's look", "(init.md)", "(feature.md)", "(review.md)", "design/.progress.json"]) {
      expect(design).toContain(s);
    }
  });
});

describe("modes/init.md", () => {
  const init = read("modes/init.md");

  test("has the seven steps of spec §7.3, with the gate on directions", () => {
    expect(outOfOrder(init, ["## 1. Brief", "## 2. Scaffold", "## 3. Research", "## 4. Directions ⏸", "## 5. Design guide", "## 6. Build", "## 7. Verify"])).toBeNull();
  });

  test("uses the tool for every exact step, in order", () => {
    expect(outOfOrder(init, [
      "motif preview --gallery --png-only", "design/directions/", "motif validate --tokens", "motif preview --compare",
      "motif validate", "motif tokens", "motif check", "motif shot --audit", "--against design/previews/",
    ])).toBeNull();
  });
});

describe("modes/feature.md", () => {
  const feature = read("modes/feature.md");

  test("has the six steps of spec §7.4, with the gate on the mockup", () => {
    expect(outOfOrder(feature, ["## 1. Read what exists", "## 2. Understand the feature", "## 3. Research the pattern", "## 4. Mockup ⏸", "## 5. Build", "## 6. Verify"])).toBeNull();
  });

  test("shows the mockup first, then compares the app with it while and after building", () => {
    expect(outOfOrder(feature, ["--png-only", "--against design/previews/", "motif check", "motif shot --audit", "--against design/previews/"])).toBeNull();
    expect(feature).toContain("(review.md#2-extract-only-when-there-is-no-design-guide)");
  });
});

describe("modes/review.md", () => {
  const review = read("modes/review.md");

  test("has the six steps of spec §7.5, with gates on the extracted guide and the report", () => {
    expect(outOfOrder(review, ["## 1. Scope", "## 2. Extract (only when there is no design guide)", "⏸", "## 3. Audit", "## 4. Report ⏸", "## 5. Rebuild", "## 6. A new look instead"])).toBeNull();
  });

  test("merges the exact checks into one report, naming every category and check rule", () => {
    for (const c of CATEGORIES) expect(review).toContain(`\`${c}\``);
    for (const id of RULE_IDS) expect(review).toContain(`\`${id}\``);
    for (const s of ["design/shots/audit.json", "design/reviews/", "motif extract", "design/tokens.draft.json", "low-contrast", '"source": "judgement"']) {
      expect(review).toContain(s);
    }
  });

  test("its example report is valid review JSON", () => {
    const report = JSON.parse(review.match(/```json\n([\s\S]*?)\n```/)![1]!);
    expect(report.motifReview).toBe(1);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) {
      expect(CATEGORIES).toContain(f.category);
      expect(["critical", "major", "minor"]).toContain(f.severity);
      expect(["exact", "judgement"]).toContain(f.source);
    }
  });

  test("proves a rebuild with screenshots from before and after", () => {
    expect(outOfOrder(review, ["--save before", "--against before", '"status": "fixed"'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/skill-modes.test.ts`
Expected: FAIL — the files don't exist.

- [ ] **Step 3: Write `SKILL.md`**

`skill/SKILL.md`:
````markdown
---
name: motif
description: Designs and builds polished, consistent app UI (theme, components, screens and motion) for web and mobile apps, and reviews existing UI against a design guide. Use when the developer wants to start a new app's look, add a screen or feature that matches their design, improve or review how their app looks and feels, or mentions DESIGN.md, a design system, theme values, mockups, motion or Motif.
license: MIT
compatibility: Runs the motif tool from this skill's bin folder (it downloads itself on first use and needs no Node.js). Mockups and screenshots need Chrome or Edge, or a browser Motif downloads with the developer's permission.
---

# Motif

Motif helps you build app UI that looks designed rather than generated, and keeps it consistent as the app grows. Each project gets a design guide: `DESIGN.md` for people and `design/tokens.json` for the exact theme values. Everything you design or build reads both, and the `motif` tool checks the results exactly.

The folder this file is in is the **skill folder**; the links below are relative to it.

## Running the motif tool

The tool is in the skill folder's `bin` folder. Run it by its full path, from the developer's project folder, in the form for your shell:

| Shell | Command |
|---|---|
| macOS, Linux, Git Bash, WSL | `"<skill folder>/bin/motif" <command>` |
| Windows PowerShell | `& "<skill folder>\bin\motif.ps1" <command>` |
| Windows Command Prompt | `"<skill folder>\bin\motif.cmd" <command>` |

Wherever Motif's files say `motif <command>`, run it this way.

- Add `--json` whenever you read the output yourself: it prints one JSON object. Tell the developer what it means in plain words.
- Exit codes: `0` all good, `1` problems found (the output lists them), `2` it couldn't run (the output says why).
- The first run downloads the tool for this computer once, checks it against the release's checksums and keeps it in `~/.motif`. If that fails (offline, a firewall), carry on without the exact steps: open mockups directly as [the preview kit](preview-kit/README.md) describes, review with judgement and the knowledge files, and say once that `motif doctor` will tell when the checks work again.
- `motif preview` keeps serving mockups until it's stopped. Use `--png-only` when you need pictures, and start a live preview only in the background, or ask the developer to run it.
- When a command reports `"status": "needs_browser"`, ask the developer before running `motif browser install`: it downloads a private browser of about 100 MB. If they'd rather not, keep HTML mockups and skip pictures.

## At the start of a session

1. Run `motif doctor --json` once. `apps` lists the apps in this folder with their stacks; `items` says whether there's a browser, the app's toolchain and a valid design guide, and which design sources are connected. Run it again only after something changes (an install, a new app).
2. Look through your own tools for the design sources the notes describe: [Motion](sources/motion-dev.md), [Refero](sources/refero.md), [21st.dev](sources/21st.md) and [60fps.design](sources/60fps.md) ([Supahero](sources/supahero.md) needs nothing). Tell the developer once, in one line, for example: "Connected: Motion · Optional: Refero, 21st.dev, 60fps.design (`motif connect` adds them later)." Don't repeat it in the same session.
3. If `design/.progress.json` exists, an earlier new app or feature stopped part-way. Offer to continue it before starting anything else.

## Choosing what to do

| The developer… | Follow |
|---|---|
| types /design, or asks for design help without saying what | [modes/design.md](modes/design.md) |
| wants a new app, or a new look from scratch | [modes/init.md](modes/init.md) |
| wants a new screen, flow or feature | [modes/feature.md](modes/feature.md) |
| wants to improve, review, audit or fix how the app looks | [modes/review.md](modes/review.md) |
| asks for a small change (one component, a spacing fix, a colour) | No mode: make the change under the rules below, then run `motif check` |

## Your stack

For each app in `apps`, read its stack guide, `adapters/<stack>/README.md`: for example [React web](adapters/react-web/README.md). It says how to start a project, use the theme code, build components, animate, and fix what `motif check` and `motif shot` report.

Motif's guides for other stacks aren't ready yet. For an app on one of them, or on a stack Motif doesn't know, the design guide, the modes and the knowledge files still apply: `motif tokens` writes plain CSS variables and `design/generated/tokens.flat.json`, you map those values into the app by hand, and you tell the developer once that full support for their stack is on its way. [The stack guide template](adapters/_template/README.md) lists what each guide covers.

## Rules for every task

1. **The design guide decides.** Read `DESIGN.md` and `design/tokens.json` before you design anything, and follow [the four rules](contract/spec.md#the-four-rules): theme values only, no silent new values, exceptions say why, generated files aren't edited.
2. **Show, then build.** At each step marked ⏸ in a mode, show what you propose (a mockup, a change to the design guide, a list of findings), explain it in one or two plain sentences, and wait. If the developer says "skip previews" or "don't stop for approval", carry on and show everything at the end. Changes to the design guide are always shown, even then, without waiting.
3. **Ask with choices.** Offer two to four options with a recommended default, plus "or tell me in your own words". Ask everything a step needs in one round; "I don't know" is fine (use the default).
4. **Plain words.** Say "your design guide" and "theme values", never contract or tokens. Explain each finding in one line: what's wrong and why it matters. If the developer says "be brief", drop the explanations.
5. **Show pictures.** When `motif preview` or `motif shot` makes PNGs, show them if you can display images; otherwise give their paths and say what to look for.
6. **Never a dead end.** When something is missing, say in one sentence what it affects, skip only that part, and keep going (the table below).
7. **Mock data only.** Screens use realistic mock data from one clearly named file. Never write back-end logic, real sign-in or payments.
8. **Copy nothing protected.** Use design sources as their notes say: learn from them, restyle everything with the theme values, and keep links, never their images or text.
9. **Keys stay out of the chat.** Never ask the developer to paste an API key to you; `motif connect <source>` asks for it in their own terminal.

### When something is missing

| Problem | What to do |
|---|---|
| The motif tool can't download | Work without the exact checks, as above |
| No browser, and the developer declines the download | Keep HTML mockups; skip PNGs and screenshots |
| The app's toolchain is missing (Node.js for web apps) | Say what to install; skip running the app until it's there |
| A design source fails or runs out of calls | Use the free guidance instead and say so once |
| `DESIGN.md` or `tokens.json` is broken | `motif validate` names the line; offer to fix it |
| The code drifted from the design guide | `motif check` lists where; fix it, or offer a review |
| `motif validate` says the guide comes from a newer Motif | Don't edit it; ask the developer to update Motif |

## Progress

While a new app or feature is under way, write `design/.progress.json` after each step, so a later session can continue:

```json
{ "motifProgress": 1, "mode": "init", "done": ["brief", "scaffold"], "next": "research", "updated": "2026-10-14", "notes": "Pebble, a habit tracker for students. Liked the Soft style." }
```

Make sure `design/.gitignore` lists `.progress.json` and `directions/` (create it if needed): both are drafts that don't belong in git. Delete the progress file when the mode finishes.

## What's in the skill folder

- [contract/spec.md](contract/spec.md): the design guide format, with [DESIGN.template.md](contract/DESIGN.template.md) and [tokens.template.json](contract/tokens.template.json) to start from.
- Knowledge: [visual craft](knowledge/visual-craft.md), [anti-patterns](knowledge/anti-patterns.md), [motion](knowledge/motion.md), [accessibility](knowledge/accessibility.md), and one guide per UX pattern in `knowledge/ux-patterns/`, such as [sign-in](knowledge/ux-patterns/sign-in.md) and [lists and feeds](knowledge/ux-patterns/lists-feeds.md).
- `presets/<style>/`: the 8 starting styles (`tokens.json`, `about.md`, `sample.html`).
- [preview-kit/README.md](preview-kit/README.md): how to write mockups.
- `sources/`: one note per design source. `adapters/`: one guide per stack.
````

- [ ] **Step 4: Write `modes/design.md`**

`skill/modes/design.md`:
````markdown
# Design: where to start

Use this when the developer types /design, or asks for help with their app's design without saying what they want. Your only job here is to find out what they want and hand over to the right mode.

## 1. Check for unfinished work

If `design/.progress.json` exists, say in one line what was done and what comes next, and offer to continue it first.

## 2. Understand the request

If the request already says what they want ("start a recipe app", "add a settings screen", "my app looks dated"), skip the question and go to that mode.

Otherwise ask one question, putting first the option that fits this folder (from `motif doctor --json`):

- **Start a new app**: first when `apps` is empty.
- **Add a feature**: first when there's an app with a valid design guide.
- **Improve my app's look**: first when there's an app without a design guide.
- Or tell me in your own words.

## 3. Say what will happen

In one or two sentences, tell the developer what the mode does and where it will stop for them. For example: "I'll ask a few quick questions, show you two or three looks side by side, and build once you've picked one. Say 'skip previews' any time if you'd rather I just build."

## 4. Mention anything missing, once

If `motif doctor --json` reported something `needed` that the mode uses, say it now in one sentence with its fix, then carry on:

- No browser: "Mockups and screenshots need a browser. When we get there, I can download a private one (about 100 MB) if you'd like."
- No Node.js for a web app: "Your app needs Node.js to run; install it from nodejs.org and I'll take it from there."
- A design guide with problems: "Your design guide has a few problems; I'll fix them first."

## 5. Continue

- Start a new app: [init](init.md)
- Add a feature: [feature](feature.md)
- Improve my app's look: [review](review.md)
````

- [ ] **Step 5: Write `modes/init.md`**

`skill/modes/init.md`:
````markdown
# Init: start a new app

From a short brief to a running app with a design guide, theme code, starter components, an app shell and its first screens, all checked. Steps marked ⏸ wait for the developer unless they turned approvals off. After each step, update `design/.progress.json` (`"mode": "init"`).

## 1. Brief

Ask one round of questions, each with choices and a default. Skip any the developer already answered; accept a brief file instead if they have one.

1. What is the app? (one sentence, in their words)
2. Who is it for?
3. Platform and stack: a web app (React, the default) or another stack. Pre-fill what `motif doctor --json` found.
4. Brand: a name, a logo, colours or fonts they must use (optional).
5. Feel: offer the 8 starting styles. Run `motif preview --gallery --png-only --out design/directions/gallery` and show the PNGs (light and dark); if you can't show images, describe each from `presets/<style>/about.md` in the skill folder. Words work too ("calm and premium").
6. Apps or sites they like (optional; links are enough).

Save the answers in the progress file's `notes`, so a later session doesn't ask again.

## 2. Scaffold

- **No project yet:** create one with the starter command in the stack guide ([React web](../adapters/react-web/README.md): Next.js by default, Vite for a single-page app). Ask before installing anything that command doesn't install.
- **An existing project:** keep it. Add Motif's files beside what's there and change nothing else yet.

## 3. Research

Gather references for the brief's personality and the screens it needs:

- With design sources connected, follow their notes: [Refero](../sources/refero.md) for styles and real screens, [60fps.design](../sources/60fps.md) for mobile motion, [Supahero](../sources/supahero.md) for a landing page's hero.
- Always: [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), the [motion guide](../knowledge/motion.md), and the UX pattern guides for the first screens: [onboarding](../knowledge/ux-patterns/onboarding.md), [sign-in](../knowledge/ux-patterns/sign-in.md) and [home](../knowledge/ux-patterns/home-dashboard.md).

Write down in a few lines what you'll take from each reference. Keep links only.

## 4. Directions ⏸

Make two or three clearly different directions: different colour moods, type pairings or densities, not one look with three accent colours. Each direction is a folder in `design/directions/`, such as `design/directions/calm/`, holding:

- `tokens.json`: start from the closest starting style (`presets/<style>/tokens.json` in the skill folder) or [the template](../contract/tokens.template.json), and change the values to fit the brief. Keep every role; [the format](../contract/spec.md) explains each one.
- `tile.html`: a style tile with the colour roles as swatches, the type scale, and the key components (buttons, a field, a card, a list row) in their main states.
- `<screen>.html`: the one screen that best shows the app (usually home), in the right frame (a phone for mobile apps, a browser for web apps), with realistic mock content.

Write the mockups with [the preview kit](../preview-kit/README.md): screen content and kit classes only, no colours, sizes or fonts of your own. Each mockup uses the `tokens.json` in its own folder.

1. For each direction, run `motif validate --tokens design/directions/<name>/tokens.json` and fix every problem (readability first) before showing it.
2. Run `motif preview design/directions/<name> --png-only` for each direction; the PNGs are saved next to the mockups.
3. For a live side-by-side view, run `motif preview --compare design/directions/<a>/<screen>.html design/directions/<b>/<screen>.html` in the background, or ask the developer to run it.
4. Show the PNGs and describe each direction in one line ("Calm: soft neutrals, rounded corners, generous spacing").
5. The developer picks one, asks for a mix ("A's colours with B's type"), or asks for changes. Update the folders and show them again until they approve one.

## 5. Design guide

1. Copy the approved direction's `tokens.json` to `design/tokens.json`.
2. Write `DESIGN.md` from [the template](../contract/DESIGN.template.md): the summary, the brief, the direction (the style, references as links, the approved mockups), and every other section filled from the decisions so far. [The format](../contract/spec.md) says what each section holds.
3. Move the approved mockups and their PNGs into `design/previews/`, then delete `design/directions/`.
4. Run `motif validate` and fix every problem until it passes.
5. Add the first change-log line: `- <date> — Created the design guide — <name> chosen from <n> directions — approved by <developer>`.

## 6. Build

1. Run `motif tokens` to write the theme code, and do the wiring its output asks for (for example importing the CSS once). Load the theme's fonts in the app as the stack guide shows; `motif tokens --json` lists them in `fonts`.
2. Build the stack guide's starter components, each with every state from `DESIGN.md` section 5 (default, hover where it applies, pressed, focused, disabled, loading, error) and motion from the motion roles.
3. Build the app shell (the navigation model in `DESIGN.md` section 6) and the first screens, with mock data from one clearly named file:
   - Web apps: welcome or landing, sign-in, home.
   - Mobile apps: onboarding, sign-in, home.

   Follow each screen's UX pattern guide, including its loading, empty and error states.

## 7. Verify

1. Run `motif check` and fix every finding. Use a `motif-ok: <reason>` comment only for a value that truly must stay (a partner's brand colour, say).
2. Run the project's build and type check (the stack guide names them).
3. Run `motif shot --audit` for the starter screens, in light and dark at phone and desktop widths. Fix the critical and major findings, then run it again.
4. For each screen with an approved mockup, run `motif shot --routes <route> --against design/previews/<screen>.html` and compare the app with the mockup. Fix differences that change the design.
5. Show the developer the screenshots and a short summary: what was built, what passed, anything left for later.

Delete `design/.progress.json`. The app is ready for new features.
````

- [ ] **Step 6: Write `modes/feature.md`**

`skill/modes/feature.md`:
````markdown
# Feature: add a screen or flow that matches the app

A new feature that looks as if it was always part of the app: built from the design guide and the existing components, shown as a mockup first, then compared with that mockup. Steps marked ⏸ wait for the developer unless they turned approvals off. Keep `design/.progress.json` up to date (`"mode": "feature"`, with the feature's name in `notes`).

## 1. Read what exists

1. Read `DESIGN.md`, `design/tokens.json` and `design/motif.json`.
2. List the existing components. The stack guide says where they live (React web: [components](../adapters/react-web/components.md)). Note each one's name, variants and states, so you reuse them rather than rebuild them.
3. No design guide yet? Run [review's extract step](review.md#2-extract-only-when-there-is-no-design-guide) first, then come back here.

## 2. Understand the feature

Ask, with choices where you can: what the feature does, who uses it, and their path through it (where they start, each step, where they end up). Name every screen and state the path needs.

## 3. Research the pattern

Read the matching UX pattern guides in `knowledge/ux-patterns/` in the skill folder: a settings screen needs [settings](../knowledge/ux-patterns/settings.md); a list people search needs [lists and feeds](../knowledge/ux-patterns/lists-feeds.md) and [search and filters](../knowledge/ux-patterns/search-filters.md). With Refero connected, also see how real products handle it ([Refero](../sources/refero.md)). Note the anatomy and required states you'll build.

## 4. Mockup ⏸

Write a mockup of every new screen and state as `design/previews/<feature>-<screen>.html`, with [the preview kit](../preview-kit/README.md) and nothing but the design guide: kit classes only, no colours, sizes or fonts of your own. Show the loading, empty and error states the pattern guide lists, each in its own frame.

Run `motif preview design/previews/<feature>-<screen>.html --png-only` and show the PNGs (light and dark). Change the mockup until the developer approves it.

## 5. Build

- Reuse existing components first; extend one with a new variant before creating a new component.
- Use theme values only ([the four rules](../contract/spec.md#the-four-rules)).
- If the feature truly needs something the design guide doesn't have (a new component, a new value), stop and propose the change ⏸: what changes, from what to what, and why, in plain words. Once approved, update `design/tokens.json` and `DESIGN.md` (the component in section 5, a change-log line), run `motif validate` and `motif tokens`, and continue.
- While you build, compare the app with the approved mockup whenever a screen takes shape: `motif shot --routes <route> --against design/previews/<feature>-<screen>.html` puts them side by side. Show the images if you can display them.

## 6. Verify

1. Run `motif check` (no findings apart from justified `motif-ok` exceptions) and the project's build and type check.
2. Run `motif shot --audit --routes <the new routes>`. Fix the critical and major findings and run it again.
3. For each screen, run `motif shot --routes <route> --against design/previews/<feature>-<screen>.html`. Fix differences that change the design.
4. Confirm every state from the mockup exists in the app: loading, empty, error, disabled.
5. Show the developer the side-by-side images and a short summary of what was built and checked.

Delete `design/.progress.json`.
````

- [ ] **Step 7: Write `modes/review.md`**

`skill/modes/review.md`:
````markdown
# Review: improve how an existing app looks and feels

Find what's wrong with the app's UI, explain it in plain words ranked by how much it matters, and fix what the developer chooses, with screenshots from before and after. Steps marked ⏸ wait for the developer unless they turned approvals off.

## 1. Scope

Ask whether to review the whole app or named screens or features (default: the whole app). List the routes or screens you'll cover.

## 2. Extract (only when there is no design guide)

1. Run `motif extract`. It collects every value the app uses, groups near-duplicates, and writes draft theme values to `design/tokens.draft.json` and a map from each old value to its proposed role to `design/extract-report.json`.
2. Draft `DESIGN.md` describing the app's *current* design, not an ideal one, and call out the inconsistencies the report shows ("14 greys → 5 colour roles"), using its notes.
3. ⏸ Show the developer the draft in plain words: the colour roles (as swatches if you can), the type scale, the spacing scale and the main inconsistencies.
4. Once approved, rename `design/tokens.draft.json` to `design/tokens.json`, run `motif validate` and fix what it reports, then add the change-log line `- <date> — Design guide extracted from the existing code — so new work stays consistent — approved by <developer>`.

## 3. Audit

**Exact checks**, each with `--json`:

1. `motif validate`: problems in the design guide itself.
2. `motif check`: places in the code that bypass the design guide.
3. `motif shot --audit`: contrast and tap-target sizes as rendered, and movement under reduced motion, for the screens in scope (light and dark, phone and desktop). It also writes its findings to `design/shots/audit.json` in the report format below.

**Judgement**, screen by screen, from the screenshots and the code: hierarchy, layout and spacing rhythm, the flow through each task, missing states, copy, motion quality, platform conventions and the tells of generated UI. Use [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), [motion](../knowledge/motion.md), [accessibility](../knowledge/accessibility.md), the UX pattern guide for each screen, and the stack guide's [checks](../adapters/react-web/checks.md).

## 4. Report ⏸

Write the report as `design/reviews/<YYYY-MM-DD>-<scope>.json`, plus a Markdown version beside it (`.md`):

```json
{
  "motifReview": 1,
  "scope": "whole app",
  "date": "2026-10-14",
  "findings": [
    {
      "id": "F-001",
      "severity": "critical",
      "category": "contrast",
      "source": "exact",
      "location": { "screen": "/settings", "selector": "p.hint", "viewport": "mobile", "scheme": "dark" },
      "summary": "Hint text is hard to read on cards in dark mode (2.8:1; it needs 4.5:1).",
      "fix": "Lighten text-secondary's dark value, or use text-primary on surface-raised.",
      "shot": "design/shots/settings.mobile.dark.png",
      "status": "open"
    },
    {
      "id": "F-002",
      "severity": "major",
      "category": "raw-value",
      "source": "exact",
      "location": { "file": "src/components/PriceTag.tsx", "line": 12 },
      "summary": "The price uses a typed colour, so it ignores the theme and dark mode.",
      "fix": "Use text-success.",
      "status": "open"
    },
    {
      "id": "F-003",
      "severity": "major",
      "category": "missing-state",
      "source": "judgement",
      "location": { "file": "src/app/orders/page.tsx", "screen": "/orders" },
      "summary": "The orders list shows nothing while it loads and nothing when there are no orders.",
      "fix": "Add skeleton rows, and a first-use empty state that links to the shop.",
      "status": "open"
    }
  ]
}
```

**Severity:** `critical` blocks or shuts people out (unreadable text, a control they can't reach, a broken flow); `major` clearly hurts the experience or the design's consistency; `minor` is polish.

**Categories:** `raw-value`, `contrast`, `target-size`, `reduced-motion`, `missing-state`, `hierarchy`, `spacing`, `typography`, `motion`, `navigation`, `copy`, `platform-convention`, `consistency`, `anti-pattern`, `other`.

**Merging the exact checks.** Copy every finding from `design/shots/audit.json` as it is; it already uses this format. Turn each `motif validate` problem and `motif check` violation into a finding with `"source": "exact"` and its file and line:

| From | Category | Severity |
|---|---|---|
| `motif validate`, code `low-contrast` | `contrast` | critical below 3:1, otherwise major |
| `motif validate`, any other code | `consistency` | major |
| `motif check` `raw-color`, `tailwind-arbitrary`, `tailwind-palette`, `primitive-use` | `raw-value` | major |
| `motif check` `off-scale` | `spacing` (space, radius, shadow) or `typography` (font size) | minor |
| `motif check` `raw-font` | `typography` | major |
| `motif check` `raw-motion` | `motion` | minor |
| `motif check` `reduced-motion` | `reduced-motion` | major |
| `motif check` `generated-edited` | `consistency` | minor |

Merge the same problem found in many places into one finding that lists the places. Number the findings `F-001`, `F-002`… across the whole report, renumbering those copied from `audit.json`.

**Judgement findings** use `"source": "judgement"`, a category from the list, the file or screen, a one-line summary of why it matters, and a concrete fix.

**The Markdown version** starts with a summary (how many critical, major and minor findings, and the three that matter most in one line each), then lists the findings by severity: id, category, location, the one-line why, the fix, and the screenshot path.

Show the developer the summary and ask which findings to fix (suggest all critical and major ones).

## 5. Rebuild

1. Before changing anything, keep screenshots of the screens you'll touch: `motif shot --routes <routes> --save before`.
2. Fix the chosen findings with theme values only; a needed new value goes through a design guide change ⏸.
3. Run the exact checks again: `motif validate`, `motif check` and `motif shot --audit`.
4. Run `motif shot --routes <routes> --against before` and show the before-and-after images; the output says how much each screen changed.
5. Mark each fixed finding `"status": "fixed"` in the JSON report and update the Markdown version; leave the rest `"open"`.

## 6. A new look instead

If the developer wants a new look rather than fixes:

1. Keep screenshots first: `motif shot --routes <routes> --save before`.
2. Follow [init](init.md) steps 3 to 5 (research, directions ⏸, design guide) to make the new design guide.
3. Run `motif tokens`. Because the code uses theme roles, much of the new look arrives with this one step.
4. Then go screen by screen: adjust the layouts the new direction calls for, run `motif check` and `motif shot --routes <route> --against before`, and show each screen before moving to the next.
5. If the design guide was just extracted, `design/extract-report.json` maps each old value to its role; use it to replace any raw values left in the code.
````

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd cli && bun test test/skill-modes.test.ts test/skill-content.test.ts`
Expected: PASS (the content lint now also checks `SKILL.md`'s frontmatter and every link between the five files).

- [ ] **Step 9: Commit**

```bash
git add skill/SKILL.md skill/modes cli/test/skill-modes.test.ts
git commit -m "feat(skill): SKILL.md and the design, init, feature and review modes"
```

---
### Task 7: The Claude Code development plugin

**Files:**
- Create: `plugin/claude-code/skills/design/SKILL.md`, `plugin/claude-code/skills/init/SKILL.md`, `plugin/claude-code/skills/feature/SKILL.md`, `plugin/claude-code/skills/review/SKILL.md`, `plugin/claude-code/README.md`, `cli/scripts/build-plugin.ts`, `cli/test/plugin.test.ts`
- Modify: `cli/package.json` (script `"plugin": "bun scripts/build-plugin.ts"`), `README.md`

**Interfaces:**
- Consumes: all of `skill/` (Tasks 1–6); `skill/VERSION`; `runCommand` from `src/commands/connect.ts` (1D-1, runs npm's `claude.cmd` correctly on Windows).
- Produces: from `cli/scripts/build-plugin.ts`: `pluginManifest(version: string): Record<string, unknown>` and `buildPlugin(outDir: string, repo?: string): void` (replaces `outDir` only when it's missing, empty or an earlier build; writes `.claude-plugin/plugin.json`, copies `plugin/claude-code/skills/` to `skills/` and `skill/` to `skills/motif/`, keeps `bin/motif` executable). `bun run plugin` builds `dist/claude-code/` (git-ignored with `dist/`).

The wrappers are Claude Code packaging, not part of the portable skill, so they may use Claude Code's frontmatter and variables. They only start a mode; all the guidance stays in `skill/`.

- [ ] **Step 1: Write the failing test**

`cli/test/plugin.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/plugin.test.ts`
Expected: FAIL — `../scripts/build-plugin` doesn't exist.

- [ ] **Step 3: The wrappers**

`plugin/claude-code/skills/design/SKILL.md`:
```markdown
---
name: design
description: Motif's starting point (/design). Asks whether you're starting a new app, adding a feature or improving your app's look, then takes it from there.
argument-hint: "[what you'd like to do]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/design.md.

What the developer asked for: $ARGUMENTS
```

`plugin/claude-code/skills/init/SKILL.md`:
```markdown
---
name: init
description: Motif — start a new app (run it as /motif:init; plain /init is Claude Code's own). Asks a few questions, shows two or three looks side by side, then writes the design guide, theme code, starter components and first screens.
argument-hint: "[what the app is]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/init.md.

What the developer asked for: $ARGUMENTS
```

`plugin/claude-code/skills/feature/SKILL.md`:
```markdown
---
name: feature
description: Motif — add a screen or flow that matches your app (/feature). Shows a mockup first, builds from your design guide and components, then compares the app with the mockup.
argument-hint: "[the feature]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/feature.md.

What the developer asked for: $ARGUMENTS
```

`plugin/claude-code/skills/review/SKILL.md`:
```markdown
---
name: review
description: Motif — review and improve your app's look (run it as /motif:review; plain /review is Claude Code's own). Ranked findings in plain words, then the fixes you choose, with screenshots from before and after.
argument-hint: "[screens or features, or leave empty for the whole app]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/review.md.

What the developer asked for: $ARGUMENTS
```

- [ ] **Step 4: The build script**

`cli/scripts/build-plugin.ts`:
```ts
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
```
Add `"plugin": "bun scripts/build-plugin.ts"` to `cli/package.json` scripts.

- [ ] **Step 5: The READMEs**

`plugin/claude-code/README.md`:
````markdown
# Motif for Claude Code (development plugin)

Four short commands that start the Motif skill in Claude Code. The build copies them and the whole `skill/` folder into `dist/claude-code/`, a plugin Claude Code can load. (Motif's packages for every agent, in Part 3, will replace this.)

## Build it

From the repository's `cli` folder:

```bash
bun run plugin
```

This replaces `dist/claude-code/` with a fresh copy. Run it again after changing anything in `skill/` or here, then type `/reload-plugins` in Claude Code.

## Try it

Until Motif's first release is published, point the skill at a local build of the tool:

1. In `cli`, run `bun run build`. It writes `dist/motif` (`dist/motif.exe` on Windows).
2. Start Claude Code in your app's folder with `MOTIF_BIN` set to that file and the plugin loaded:
   - macOS, Linux or Git Bash: `MOTIF_BIN=/path/to/motif/dist/motif claude --plugin-dir /path/to/motif/dist/claude-code`
   - PowerShell: first `$env:MOTIF_BIN = "C:\path\to\motif\dist\motif.exe"`, then `claude --plugin-dir C:\path\to\motif\dist\claude-code`

## Commands

| Type | To |
|---|---|
| `/design` | Say what you'd like to do; Motif picks the right mode |
| `/motif:init` | Start a new app (plain `/init` is Claude Code's own command) |
| `/feature` | Add a screen or flow that matches your app (`/motif:feature` works too) |
| `/motif:review` | Review and improve your app's look (plain `/review` is Claude Code's own command) |

Claude also uses Motif by itself when you ask for design work ("make this screen look better"), through the main `motif` skill.
````

In the root `README.md`:
- Replace the "Work in progress" note with: `> Work in progress. The agent skill is ready to try in Claude Code ([how](plugin/claude-code/README.md)); packages for other agents and the first release come next.`
- Add a table row after `motif doctor`: ``| `motif connect` | Connects optional design sources (Motion, Refero, 21st.dev, 60fps.design) to Claude Code for all your projects; keys are typed only in your own terminal |``
- In the `motif validate` row, append: `; \`--tokens <file>\` checks one theme values file, such as a design direction's`
- In the `motif preview` row, append: `; mockups show your theme's real fonts`
- Add to the privacy paragraph: `The 8 starting styles' fonts come with Motif; any other font your theme names is loaded from Google Fonts by your browser while previewing.`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd cli && bun test test/plugin.test.ts && bun run typecheck && bun run plugin`
Expected: PASS (the `claude plugin validate` test runs only where Claude Code is installed; the launcher test only off Windows); `bun run plugin` prints `Built the Claude Code plugin in …/dist/claude-code`.

- [ ] **Step 7: Run everything**

Run: `cd cli && bun test --timeout 120000 && bun run typecheck`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add plugin/claude-code cli/scripts/build-plugin.ts cli/test/plugin.test.ts cli/package.json README.md
git commit -m "feat(plugin): Claude Code development plugin built from skill/"
```

---

## After this plan

- **1E Evals** (next plan): tests B, C and D from spec §13.2, run through Claude Code's headless mode with this plugin: the contract-governed and seeded-issue React fixtures, three brief fixtures, graders, and a CI workflow on demand.
- **Before the first release (v0.1.0):** the end-of-plans manual checks the developer asked for: `motif browser install` end to end, and `motif connect 21st` with hidden key input in a real terminal; then a hands-on `/design` run in Claude Code with the development plugin.
- Deferred from 1D-1 (still open): `connect` doesn't find Claude Code's local install at `~/.claude/local/claude` or honour `CLAUDE_CONFIG_DIR`; a stale `claude` path ends in "unexpected problem"; `readSecret` prompts on stdout; Motion detection's false positives; the git check misses bare dotfiles repositories.
