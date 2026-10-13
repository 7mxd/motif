# Motif 1D-1 — Guidance Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the guidance the Motif skill reads — the design guide format and templates, the knowledge base (UX patterns, motion, visual craft, accessibility, anti-patterns) and the design-source notes — plus `motif connect`, with automated checks that keep all of it portable, linked and short enough to load.

**Architecture:** Everything agents read lives in `skill/` as plain Markdown (Agent Skills format, agent-neutral per spec §5.5). A content test (`cli/test/skill-content.test.ts`) lints every skill file on every change: size limits, working relative links, no agent-specific tool names, only real `motif` commands, and the required sections of each UX pattern file. Design-source facts were verified on 2026-10-13 and live in one catalog (`cli/src/sources/catalog.ts`) that `doctor` and the new `motif connect` share; the prose in `skill/sources/` repeats the same facts for agents.

**Tech Stack:** Markdown, Bun 1.4 tests, TypeScript 7, Claude Code's `claude mcp add` (for `connect`).

**Spec:** `docs/specs/2026-10-12-motif-core-design.md` — implements §5.1 `skill/contract/`, `skill/knowledge/`, `skill/sources/`; §5.5 (agent-neutral); §6 (contract format, for agents); §8 (sources, rules, knowledge contents); §10.2 `motif connect`; §15 risk 3 (record the sources' real MCP tool names). Facts that differ from the spec are recorded in `docs/decisions/0002-design-sources.md` (Task 7).

**Split:** Plan 1D is two plans. **1D-1 (this plan)** writes what the skill refers to. **1D-2 The skill** writes `SKILL.md`, the four modes (`design`, `init`, `feature`, `review`), the adapter template and React web guidance, and the Claude Code development plugin; its files link into this plan's files.

**Builds on:** Plans 1A–1C (current `main`). Read `cli/src/main.ts`, `cli/src/detect/sources.ts`, `cli/src/commands/doctor.ts`, `cli/scripts/build-presets.ts`, `cli/src/contract/design-md.ts`, `skill/preview-kit/README.md` before starting.

**Verified while planning (2026-10-13)** — design sources, from official docs, repos and live endpoints:
- **Refero:** official remote MCP `https://api.refero.design/mcp` (OAuth, or `Authorization: Bearer <token>`); paid plans only (Pro/Team/Lifetime, 8,000 calls/month); tools `refero_search_styles`, `refero_get_style` (full design guidance: colour and type roles, scales, components, do/don't), `refero_search_screens`, `refero_get_screen`, `refero_get_similar_screens`, `refero_get_screen_image`, `refero_search_flows`, `refero_get_flow`, `refero_search_site`, `refero_search_app`. Terms forbid scraping or systematic extraction; `styles.refero.design` blocks AI crawlers.
- **21st.dev ("21st MCP"):** remote MCP `https://21st.dev/api/mcp` with an `x-api-key` header (free key) or OAuth; free tier: search unlimited, 2 code retrievals per day; tools `search`, `get_component`, `get_inspiration`, `search_logo` (`generate` only with AI plans); old `21st_magic_*` names are retired. Terms forbid scraping; components keep their authors' licences.
- **60fps.design:** remote MCP `https://mcp.60fps.design/mcp` (OAuth with a licence key); separate paid plan ($29/month); iOS shots only, SwiftUI code only; tools `60fps_search_shots`, `60fps_list_filters`, `60fps_get_shot`, `60fps_get_motion_breakdown`, `60fps_get_motion_code`, `60fps_get_related_shots`. Terms forbid bulk copying.
- **Motion:** free remote MCP `https://mcp.motion.dev` (no account) with `search-motion-docs`; Motion+ server `https://mcp.motion.dev/plus` (OAuth, paid) with `search-motion-source`, `save-transition`, `open-transition-editor`; `motion` is MIT; every docs page is available as Markdown.
- **Supahero:** no API or MCP; free public gallery of hero sections (image, tagline, link); now part of ScreensDesign.
- **Claude Code:** `claude mcp add --transport http <name> <url> [--header "Name: value"] --scope user`; user scope is stored in `~/.claude.json`; sign-in for OAuth servers happens with `/mcp` inside a session; tools appear as `mcp__<server>__<tool>`, but plugins and connectors change the server segment, so agents should recognise a source by its tool names, not its server name.
- **Agent Skills format:** frontmatter `name` (lowercase, matches the folder) and `description` required; `license`, `compatibility`, `metadata` optional; `SKILL.md` under 500 lines; relative links one level deep from `SKILL.md`; agents run commands from the project folder, so the skill names its own scripts by full path.

## Global Constraints

- Agent-neutral (§5.5): no tool names of a specific agent (`Bash`, `AskUserQuestion`, `TodoWrite`, `mcp__…`), no `allowed-tools`, `context: fork`, hooks, `$ARGUMENTS` or `${CLAUDE_…}` variables anywhere in `skill/`. Capabilities are described in plain words ("run this command", "show this image to the developer if you can display images; otherwise give the file path").
- Plain language for developers: "design guide" (not contract), "theme values" (not tokens) in anything an agent says to a developer; contributor-facing terms only in `contract/spec.md`.
- Size: every file in `skill/knowledge/` ≤ 300 lines (§8.4); every other Markdown file in `skill/` ≤ 400 lines; `SKILL.md` ≤ 500 (1D-2).
- Originality (§8.3): all writing is Motif's own; no copied text, no third-party images, references are links only.
- Every relative link in `skill/` resolves; every `motif <command>` mentioned exists.
- UX pattern files (`skill/knowledge/ux-patterns/*.md`) each have exactly these sections, in order: `## Goal`, `## Anatomy`, `## Required states`, `## Common mistakes`, `## Mobile and web`.
- `motif connect` writes nothing into the project, never accepts a key through the agent (it refuses to run without an interactive terminal when a key is needed), and stores keys only in user-level agent configuration.

## Review Focus

1. **A source whose tools or terms change again** → detection is by tool-name *suffix* listed in one place per source, and the skill falls back to the free baseline when a call fails (once, silently). Pinned in Task 7 (catalog test asserts every documented tool name appears in its source note).
2. **`motif connect` run by an agent instead of the developer** (no terminal) for a source that needs a key → refuses with the exact command to run, never reads a key from piped input. Pinned in Task 8.
3. **`claude` not installed, or `claude mcp add` failing** (name already exists, old CLI) → plain message plus the generic JSON to paste, exit 2; nothing half-written. Pinned in Task 8.
4. **Template drift**: `tokens.template.json` or `DESIGN.template.md` stops passing `motif validate` after a format change → caught by a test that validates both. Pinned in Task 2.
5. **Knowledge files that quietly grow past 300 lines or link to files that moved** → caught by the content test on every change. Pinned in Task 1.

---

## File Structure

```
skill/
├── contract/spec.md · DESIGN.template.md · tokens.template.json     the design guide format, for agents
├── knowledge/
│   ├── visual-craft.md · anti-patterns.md · motion.md · accessibility.md
│   └── ux-patterns/onboarding.md · sign-in.md · home-dashboard.md · lists-feeds.md · detail-pages.md · forms.md
│                   search-filters.md · settings.md · checkout.md · notifications.md · profile.md · empty-loading-error.md
└── sources/refero.md · 21st.md · 60fps.md · motion-dev.md · supahero.md
cli/
├── scripts/build-presets.ts          MODIFY: also writes skill/contract/tokens.template.json
├── src/main.ts                       MODIFY: export COMMAND_NAMES; register connect
├── src/sources/catalog.ts            verified facts per source (detection, connect, cost)
├── src/detect/sources.ts             MODIFY: patterns from the catalog
├── src/commands/connect.ts           motif connect
└── test/skill-content.test.ts · contract-templates.test.ts · catalog.test.ts · connect.test.ts
docs/decisions/0002-design-sources.md
```

---

### Task 1: Content checks for everything in `skill/`

**Files:**
- Create: `cli/test/skill-lint.ts` (test helper), `cli/test/skill-content.test.ts`
- Modify: `cli/src/main.ts` (export `COMMAND_NAMES`)

**Interfaces:**
- Consumes: `COMMANDS` in `cli/src/main.ts` (1A–1C).
- Produces:
  - From `src/main.ts`: `COMMAND_NAMES: string[]` (every registered command)
  - From `test/skill-lint.ts`: `lintSkillMarkdown(file: string, text: string, opts: { exists: (skillPath: string) => boolean; commands: string[] }): string[]` — `file` is the path inside `skill/` with forward slashes; returns plain problem descriptions (empty when the file is fine); `lineLimit(file: string): number`
- Every later task in Plans 1D-1 and 1D-2 is checked by `skill-content.test.ts` automatically.

Rules the lint enforces (Global Constraints): line limits (`SKILL.md` 500, `knowledge/**` 300, else 400); relative Markdown links resolve; no agent-specific tool names, frontmatter or variables; `motif <command>` (in backticks or at the start of a code line) names a real command; files in `knowledge/ux-patterns/` have exactly the five sections in order.

- [ ] **Step 1: Write the failing test**

`cli/test/skill-content.test.ts`:
```ts
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
    expect(lint("knowledge/ux-patterns/a.md", "See [motion](../motion.md), [web](https://motion.dev) and [here](#top).")).toEqual([]);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/skill-content.test.ts`
Expected: FAIL — `COMMAND_NAMES` isn't exported from `../src/main`, and `./skill-lint` doesn't exist.

- [ ] **Step 3: Export the command names**

In `cli/src/main.ts`, right after the `COMMANDS` object, add:
```ts
/** Every command the tool has (the skill's content test checks that the skill only mentions these). */
export const COMMAND_NAMES = Object.keys(COMMANDS);
```

- [ ] **Step 4: Write the lint helper**

`cli/test/skill-lint.ts`:
```ts
import { posix } from "node:path";

/** Files load one at a time, so each must stay short (spec §8.4; Agent Skills: SKILL.md under 500 lines). */
export function lineLimit(file: string): number {
  if (file === "SKILL.md") return 500;
  if (file.startsWith("knowledge/")) return 300;
  return 400;
}

const NOT_PORTABLE: [RegExp, string][] = [
  [/\b(?:AskUserQuestion|TodoWrite|SlashCommand|WebFetch|WebSearch)\b/, "a specific agent's tool name"],
  [/\b(?:Bash|Read|Write|Edit|Glob|Grep|Task|Skill) tool\b/, "a specific agent's tool name"],
  [/\bmcp__\w+/, "an agent-specific MCP tool name (name tools by their own names, e.g. refero_get_style)"],
  [/^(?:allowed-tools|context|hooks|argument-hint|disable-model-invocation):/m, "agent-specific frontmatter"],
  [/\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/, "an agent-specific variable"],
];

const UX_SECTIONS = ["Goal", "Anatomy", "Required states", "Common mistakes", "Mobile and web"];

export function lintSkillMarkdown(file: string, raw: string, opts: { exists: (skillPath: string) => boolean; commands: string[] }): string[] {
  const text = raw.replace(/\r\n/g, "\n");
  const problems: string[] = [];

  const lines = text.split("\n").length;
  if (lines > lineLimit(file)) problems.push(`${file} is ${lines} lines; the limit is ${lineLimit(file)}.`);

  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1]!.split("#")[0]!;
    if (!target || /^[a-z][a-z+.-]*:/i.test(target)) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(file), target));
    if (!opts.exists(resolved)) problems.push(`${file} links to "${m[1]}", which doesn't exist.`);
  }

  for (const [pattern, what] of NOT_PORTABLE) {
    if (pattern.test(text)) problems.push(`${file} uses ${what}.`);
  }

  for (const m of text.matchAll(/(?:^|`)[ \t]*motif ([a-z][a-z-]*)/gm)) {
    if (!opts.commands.includes(m[1]!)) problems.push(`${file} mentions "motif ${m[1]}", which isn't a Motif command.`);
  }

  if (file.startsWith("knowledge/ux-patterns/")) {
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
    if (JSON.stringify(sections) !== JSON.stringify(UX_SECTIONS)) {
      problems.push(`${file} needs exactly these sections, in order: ${UX_SECTIONS.join(", ")} (has: ${sections.join(", ") || "none"}).`);
    }
  }
  return problems;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd cli && bun test test/skill-content.test.ts && bun run typecheck`
Expected: PASS (today `skill/` holds the preview kit README and the presets' `about.md` files, which already follow the rules).

- [ ] **Step 6: Commit**

```bash
git add cli/src/main.ts cli/test/skill-lint.ts cli/test/skill-content.test.ts
git commit -m "test(skill): lint everything in skill/ — size, links, portability, real commands"
```

---

### Task 2: The design guide format, for agents

**Files:**
- Create: `skill/contract/spec.md`, `skill/contract/DESIGN.template.md`, `skill/contract/tokens.template.json` (generated)
- Modify: `cli/src/presets/build.ts` (add `templateTokens`), `cli/scripts/build-presets.ts`
- Test: `cli/test/contract-templates.test.ts`

**Interfaces:**
- Consumes: `presetTokens`, `PRESETS` (1C-1); `runValidate` (1A); `REQUIRED_ROLES`, `REQUIRED_SPRINGS` (1A); `makeProject` (test helper).
- Produces: `templateTokens(): Record<string, unknown>` from `src/presets/build.ts` — the Minimal preset's values without the `preset` tag, with a root `$description`; `bun run presets` also writes `skill/contract/tokens.template.json`. 1D-2's modes link to all three files.

- [ ] **Step 1: Write the failing test**

`cli/test/contract-templates.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runValidate } from "../src/commands/validate";
import { REQUIRED_ROLES, REQUIRED_SPRINGS } from "../src/contract/roles";
import { templateTokens } from "../src/presets/build";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const CONTRACT = join(import.meta.dir, "../../skill/contract");
const read = (name: string) => readFileSync(join(CONTRACT, name), "utf8").replace(/\r\n/g, "\n");

describe("the design guide templates", () => {
  test("tokens.template.json is the Minimal style's values without its preset tag", () => {
    expect(read("tokens.template.json")).toBe(JSON.stringify(templateTokens(), null, 2) + "\n");
    const motif = (templateTokens().$extensions as Record<string, Record<string, unknown>>)["dev.motif"]!;
    expect(motif.preset).toBeUndefined();
    expect(templateTokens().$description).toBeString();
  });

  test("the two templates together pass motif validate with no problems at all", async () => {
    const root = makeProject({ "DESIGN.md": read("DESIGN.template.md"), "design/tokens.json": read("tokens.template.json") });
    const r = await runValidate(root);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  test("spec.md names every required role and spring", () => {
    const spec = read("spec.md");
    for (const [group, { names }] of Object.entries(REQUIRED_ROLES)) {
      for (const name of names) expect(spec).toContain(group === "color" ? `\`${name}\`` : name);
    }
    for (const spring of REQUIRED_SPRINGS) expect(spec).toContain(`\`${spring}\``);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/contract-templates.test.ts`
Expected: FAIL — `templateTokens` isn't exported, and the files don't exist.

- [ ] **Step 3: The template values**

Append to `cli/src/presets/build.ts`:
```ts
/** The starting theme values for a new design guide: the Minimal style, untagged, with a note for whoever edits it. */
export function templateTokens(): Record<string, unknown> {
  const tokens = presetTokens(PRESETS.find((p) => p.id === "minimal")!) as Record<string, any>;
  delete tokens.$extensions["dev.motif"].preset;
  return {
    $description: "Starting theme values (the Minimal style). Replace them with this app's own, keep every role, and run motif validate after each change.",
    ...tokens,
  };
}
```
(`build.ts` imports only types from `./spec` today; change that line to `import { PRESETS, type PaletteRole, type PresetSpec } from "./spec";`.)

In `cli/scripts/build-presets.ts`, change the import to `import { presetAbout, presetSample, presetTokens, templateTokens } from "../src/presets/build";` and append:
```ts
mkdirSync(join(SKILL, "contract"), { recursive: true });
writeFileSync(join(SKILL, "contract", "tokens.template.json"), JSON.stringify(templateTokens(), null, 2) + "\n");
console.log("wrote skill/contract/tokens.template.json");
```

Run: `cd cli && bun run presets`
Expected: the eight preset lines, then `wrote skill/contract/tokens.template.json`; `git status` shows no change to `skill/presets/`.

- [ ] **Step 4: Write `DESIGN.template.md`**

`skill/contract/DESIGN.template.md`:
````markdown
---
motifContract: 1
name: App name
updated: 2026-01-01
---

# App name design guide

App name feels calm, clear and trustworthy. Replace this paragraph with three to five plain sentences a new teammate could read in a minute: who the app is for, how it should feel, and the one or two rules that matter most (for example "one accent colour, used only for the main action").

## 1. Brief

<!-- What the app is, who it is for, 3–5 personality words, and the voice and tone of its copy. -->

- **What it is:**
- **Who it is for:**
- **Personality:**
- **Voice and tone:**

## 2. Direction

<!-- The chosen style and preset (if any), reference links (links only — never copy someone else's images), and the approved mockups in design/previews/. -->

- **Style:**
- **Starting preset:**
- **References:**
- **Approved mockups:**

## 3. Foundations

<!-- Intent, not values: the values live in design/tokens.json. One line per colour role saying what it is for; the type scale and when each style is used; spacing rhythm; corner radius; elevation; icons. -->

- **Colour:**
- **Type:**
- **Spacing:**
- **Corners and elevation:**
- **Icons:**

## 4. Motion

<!-- Which duration, easing and spring roles to use when; what animates and what never does; how screens and sheets enter and leave; press feedback; what happens when the viewer asks for reduced motion. -->

- **Presses and small changes:**
- **Screens and sheets:**
- **Lists and content:**
- **Reduced motion:**

## 5. Components

<!-- Every shared component: purpose, variants, required states (default, hover where it applies, pressed, focused, disabled, loading, error) and a do/don't line. -->

| Component | Purpose | Variants | States |
|---|---|---|---|

## 6. Patterns

<!-- Navigation model; forms and validation; empty, loading and error states; feedback (toasts, inline messages); when to use a modal and when a sheet. -->

- **Navigation:**
- **Forms:**
- **Empty, loading and error:**
- **Feedback:**
- **Modal or sheet:**

## 7. Accessibility

<!-- The contrast target, minimum tap target, text scaling, focus styles and right-to-left support. -->

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring.
- Layouts use start/end (not left/right), so right-to-left languages work.

## 8. Platform notes

<!-- Deliberate differences between platforms or stacks, e.g. the iOS back-swipe. "None yet." is fine. -->

None yet.

## 9. Do / Don't

<!-- Short, concrete rules a reviewer can check. -->

- **Do:**
- **Don't:**

## 10. Change log

<!-- One line per change: date — what changed — why — who approved it. -->

- 2026-01-01 — Created with Motif.
````

- [ ] **Step 5: Write `spec.md`**

`skill/contract/spec.md`:
````markdown
# The design guide format

Motif keeps each app's design in a design guide that lives in the project: people read `DESIGN.md`, code and tools read `design/tokens.json`. Everything you build reads both, so a screen added next month matches one added today.

When you talk to the developer, say "your design guide" and "theme values". Words like contract, token and role are for this file and for tool output only.

## Files

| File | Holds | In git? |
|---|---|---|
| `DESIGN.md` | The guide in plain words: brief, direction, foundations, motion, components, patterns, accessibility, platform notes, do/don't, change log | Yes |
| `design/tokens.json` | The exact theme values, in the W3C Design Tokens format (2025.10) | Yes |
| `design/motif.json` | The project's apps and their stacks; folders to ignore | Yes |
| `design/previews/` | Approved mockups (HTML and PNG) | Yes |
| `design/reviews/` | Review reports (Markdown and JSON) | Yes |
| `design/shots/` | Screenshots of the running app (Motif keeps it out of git) | No |
| `design/.progress.json` | Where an unfinished new app or feature stopped | No |

Start a new guide from [DESIGN.template.md](DESIGN.template.md) and [tokens.template.json](tokens.template.json). After every change run `motif validate`, then `motif tokens` to regenerate the theme code.

## DESIGN.md

- A header between two `---` lines: `motifContract: 1`, `name:` and `updated:` (YYYY-MM-DD).
- A plain summary of three to five sentences before the first section ("This app feels calm and premium…").
- Ten numbered sections, in this order: 1. Brief · 2. Direction · 3. Foundations · 4. Motion · 5. Components · 6. Patterns · 7. Accessibility · 8. Platform notes · 9. Do / Don't · 10. Change log.
- It states intent and rules. Exact values live only in `tokens.json`: write "the primary action colour", not a hex code.
- Change log lines: `- YYYY-MM-DD — what changed — why — approved by <name>`.

## tokens.json

### Two layers

- `primitive.*` holds the raw palette and font families. Product code never uses these.
- Everything else is a role, and each role points at a primitive with an alias such as `"{primitive.color.light-action-primary}"`. Product code uses roles only.

### Colours

Colours use the object form with `colorSpace`, `components` (0–1) and `hex`:

```json
"light-action-primary": { "$value": { "colorSpace": "srgb", "components": [0.0941, 0.0941, 0.1059], "hex": "#18181B" } }
```

A colour role's `$value` is its light value; its dark value sits in `$extensions["dev.motif"].modes.dark`:

```json
"action-primary": {
  "$value": "{primitive.color.light-action-primary}",
  "$extensions": { "dev.motif": { "modes": { "dark": "{primitive.color.dark-action-primary}" } } }
}
```

### Required roles

`motif validate` fails if any of these is missing.

| Group | Roles |
|---|---|
| `color` | `background`, `surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`, `text-inverse`, `action-primary`, `on-action-primary`, `action-secondary`, `on-action-secondary`, `focus`, `success`, `on-success`, `warning`, `on-warning`, `danger`, `on-danger`, `info`, `on-info` |
| `font` | display, title, heading, body, label, caption — typography values with `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` |
| `space` | 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16 — on a 4 px base (`space.4` is 16 px) |
| `radius` | none, sm, md, lg, full |
| `shadow` | sm, md, lg |
| `duration` | instant, fast, base, slow |
| `easing` | standard, enter, exit — cubic Bézier curves |
| `spring` | `snappy`, `smooth`, `bouncy` — each a `duration` (seconds) and a `bounce` (between −1 and 1) |

Value shapes: sizes `{ "value": 16, "unit": "px" }`; durations `{ "value": 200, "unit": "ms" }`; easing `[0.2, 0, 0, 1]`; spring duration `{ "value": 0.4, "unit": "s" }` with bounce `0.1`.

A project may add roles (a `color.chart-1`, say). Describe each new role in DESIGN.md section 3 or 4 and log it in the change log.

### Readability pairs

`$extensions["dev.motif"].pairs` lists which text or on-colour roles sit on which surfaces: `{ "fg": "color.text-secondary", "bg": "color.surface", "kind": "text" }`. `motif validate` checks every pair in light and dark: 4.5:1 for text (3:1 for large text), 3:1 for UI parts (`"kind": "ui"`). When you use a text role on a new surface, add the pair.

### Springs

A spring is a perceived duration and a bounce, the way Motion and SwiftUI describe them. Use `snappy` (about 0.25 s, no bounce) for presses, toggles and small changes; `smooth` (about 0.4 s, slight bounce) for screens, sheets and cards; `bouncy` only for rare playful moments such as a completed goal. Generated code turns them into each platform's own spring.

## The four rules

1. **Roles only.** Product code uses role values (through the generated theme code), never raw colours, sizes, fonts or timings, and never primitives. `motif check` finds anything that slips through.
2. **No silent new values.** If a screen truly needs something the guide doesn't have, stop and propose a change in plain words: what changes, from what to what, and why. Wait for approval, then update `tokens.json` and `DESIGN.md`, run `motif validate` and `motif tokens`, and add a change-log line. Show the proposal even when the developer has turned approvals off; in that case continue without waiting.
3. **Exceptions say why.** A deliberate raw value is allowed only with a `motif-ok: <reason>` comment on its line or the comment line above, for example a third-party brand colour that must match exactly. `motif check` lists exceptions separately. Keep them rare.
4. **Generated files are not edited.** Files written by `motif tokens` start with a "generated by Motif" header. Change `tokens.json` and regenerate instead.

## design/motif.json

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "react-web" }], "ignore": ["**/vendor/**"] }
```

`motif tokens` writes it from detection the first time. In a monorepo it lists each app (`apps/web` → `react-web`), all sharing one design guide. `.gitignore` is always respected as well as `ignore`.

## Commands that read the guide

- `motif validate` — checks both files: format, required roles, aliases, every readability pair in light and dark, motion ranges, and DESIGN.md's header and sections.
- `motif tokens` — writes the theme code for each app (React web: CSS variables, a Tailwind v4 theme, Motion timings).
- `motif check` — finds raw values and other drift in the app's code.
- `motif extract` — drafts `design/tokens.draft.json` from an app that has no guide yet.
- `motif preview` and `motif shot` — show mockups and the running app using the guide.
````

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd cli && bun test test/contract-templates.test.ts test/presets.test.ts test/skill-content.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/src/presets/build.ts cli/scripts/build-presets.ts skill/contract cli/test/contract-templates.test.ts
git commit -m "feat(skill): the design guide format and templates, for agents"
```

---

### Task 3: Knowledge — visual craft and anti-patterns

**Files:**
- Create: `skill/knowledge/visual-craft.md`, `skill/knowledge/anti-patterns.md`
- Test: `cli/test/knowledge.test.ts` (created here; Tasks 4–6 append to it)

**Interfaces:**
- Consumes: the lint from Task 1 (runs on these files automatically).
- Produces: `covers(rel, { minLines, mustMention })` in `knowledge.test.ts`, reused by Tasks 4–6; the two files, which 1D-2's modes link to (`init` step 4 and `review` step 3 read both).

How to write knowledge files (applies to Tasks 3–6): original prose in Motif's voice; short paragraphs and bullet lists; concrete numbers and role names (`action-primary`, `space.4`, `duration.fast`, `spring.smooth`) instead of raw values; stack-neutral (no framework APIs — those belong to the adapters in 1D-2); each outline bullet below becomes one to three sentences, a table row or a short example. Headings are as listed.

- [ ] **Step 1: Write the failing test**

`cli/test/knowledge.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KNOWLEDGE = join(import.meta.dir, "../../skill/knowledge");
const read = (rel: string) => readFileSync(join(KNOWLEDGE, rel), "utf8").replace(/\r\n/g, "\n");

/** A knowledge file has a title, real sections, enough substance, and the points the skill relies on. */
function covers(rel: string, opts: { minLines: number; mustMention: (string | RegExp)[] }) {
  test(`${rel} covers what the skill relies on`, () => {
    expect(existsSync(join(KNOWLEDGE, rel))).toBe(true);
    const text = read(rel);
    expect(text.startsWith("# ")).toBe(true);
    expect([...text.matchAll(/^## /gm)].length).toBeGreaterThanOrEqual(4);
    expect(text.split("\n").length).toBeGreaterThanOrEqual(opts.minLines);
    const lower = text.toLowerCase();
    const missing = opts.mustMention.filter((m) => (typeof m === "string" ? !lower.includes(m.toLowerCase()) : !m.test(text)));
    expect(missing).toEqual([]);
  });
}

describe("knowledge: visual craft and anti-patterns", () => {
  covers("visual-craft.md", {
    minLines: 100,
    mustMention: ["hierarchy", "squint", "proximity", "space.4", "line length", "action-primary", "dark mode", "shadow", "radius", "start-align", "icon", "checklist"],
  });
  covers("anti-patterns.md", {
    minLines: 100,
    mustMention: ["gradient", "card grid", "shadow", "centred", "emoji", "icon", "copy", "lorem", "glass", "fade", "dark mode", "instead"],
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/knowledge.test.ts`
Expected: FAIL — neither file exists.

- [ ] **Step 3: Write `visual-craft.md`**

`skill/knowledge/visual-craft.md` — title `# Visual craft`, one-paragraph intro (screens look intentional when every choice comes from the design guide and serves one order of attention), then these sections:

- `## Hierarchy`
  - Decide the order of attention before laying out: one primary thing per screen, two or three secondary, everything else quiet.
  - Levers from strongest to weakest: size, weight, contrast (text-primary vs text-secondary), position, space. Use one or two levers per level, not all five.
  - One `action-primary` button per view; other actions use `action-secondary` or a quiet text button.
  - Type roles by job: `display` for hero numbers and landing headlines only, `title` for the screen title, `heading` for sections, `body` for content, `label` for controls, `caption` for metadata.
  - The squint test: blur your eyes (or the screenshot); the most important thing should still stand out.
- `## Spacing rhythm`
  - Only the space scale. Proximity: things that belong together sit closer than things that don't; inner spacing smaller than outer.
  - A starting rhythm: `space.2`–`space.3` inside controls, `space.4` between related items, `space.6`–`space.8` between groups, `space.12`–`space.16` between page sections.
  - Same container, same padding everywhere; align edges to a shared line.
  - Density follows the job: lists, tables and tools are denser; onboarding and marketing breathe.
- `## Type`
  - One family is enough; two at most (display and text). Contrast comes from size and weight, not from more families.
  - Line length 45–75 characters for reading text; use the role's line height.
  - Sentence case; capitals only for short labels if the guide says so. Tabular figures for prices, times and tables.
  - Truncate with care: one line for names in lists, two for previews, never truncate prices or errors. Never go below `caption`.
- `## Colour`
  - Roughly 60/30/10: background and surfaces dominate, text and borders carry structure, the accent stays rare.
  - `action-primary` means "you can act here". Never use it for decoration, illustration fills or headings.
  - Status colours (`success`, `warning`, `danger`, `info`) only for status, always with an icon or words — never colour alone.
  - Dark mode is designed, not inverted: surfaces get lighter as they rise (`surface-raised` above `surface`), large saturated areas shrink, and both modes are checked.
- `## Depth and corners`
  - Elevation tells what floats: `shadow.sm` for raised controls, `shadow.md` for menus and popovers, `shadow.lg` for dialogs and sheets. Cards on a surface often look better with a border and no shadow.
  - Radius by size: small controls `radius.sm`–`radius.md`, cards `radius.md`–`radius.lg`, sheets `radius.lg` on the top corners, pills and avatars `radius.full`.
  - Nested corners: inner radius = outer radius − padding, so curves stay parallel.
- `## Alignment and layout`
  - Start-align reading content (start, not left: right-to-left languages flip). Centre only short, standalone content: an empty state, a single call to action, a hero.
  - Readable widths: forms about 480–560 px, reading columns about 680 px, dashboards fluid with a sensible maximum.
  - Phone: one column, stacked, primary action within thumb reach. Desktop: navigation beside content; forms don't stretch to full width.
- `## Imagery and icons`
  - One icon set, one stroke weight, sized with its text (16, 20 or 24 px). Icons support labels; icon-only buttons are for universal actions (close, back, search, menu) and still have an accessible name.
  - Images: consistent aspect ratios, real-looking content, skeletons that keep the same ratio while loading.
  - Avatars fall back to initials on `surface-raised`.
- `## Polishing checklist`
  - A 10–12 item checklist to run before showing a screen: one primary action; squint test passes; spacing only from the scale; text from type roles; no raw colours; both modes checked; states present (loading, empty, error, disabled, focus); targets big enough; long text and long names tried; nothing centred that should be start-aligned; icons consistent; motion from motion roles.

- [ ] **Step 4: Write `anti-patterns.md`**

`skill/knowledge/anti-patterns.md` — title `# Anti-patterns`, intro (these are the tells of generic AI-generated UI; review mode reports them under the `anti-pattern` category), then one `##` section per group below. Each pattern is written as three short parts: **Looks like**, **Why it hurts**, **Instead**.

- `## Decoration`
  - Gradient overuse (purple-to-blue on buttons, text and backgrounds) → flat role colours; at most one subtle gradient where the guide's Direction section calls for it.
  - Glass and glow (frosted panels, neon outlines, blurred blobs) → surfaces and borders from the guide; depth from elevation roles.
  - Shadows on everything → borders and surface steps; shadows only for things that float.
  - Over-rounded everything (pill buttons, huge card radii) → the radius roles by size.
- `## Layout`
  - The identical card grid (three or six cards, icon + title + two lines, same weight) → let importance shape the layout: a list, a table, one featured item, or plain text.
  - Centred everything → start-aligned content with a clear edge.
  - Giant headline, tiny body, nothing between → use the full type scale; most screens need `title`, `heading` and `body`, not `display`.
  - Dashboards of identical stat cards with random trend arrows → show the few numbers that drive a decision, with labels, periods and comparisons.
- `## Icons and emoji`
  - An icon on every heading and list item → icons only where they speed up scanning or name a universal action.
  - Emoji as UI (🚀 for launch, ✅ for success) → icons from the app's set; emoji only in content people write.
- `## Copy and content`
  - Generic copy ("Unlock your potential", "Seamless experience", "Elevate your workflow") → say what the thing does, in the app's voice from DESIGN.md.
  - Lorem ipsum and fake metrics ("10x faster", "Trusted by 10,000+ teams") → realistic, clearly labelled mock data in one named file.
  - Buttons that say "Submit" or "Click here" → the action's verb: "Save changes", "Send invite".
- `## States and interaction`
  - Missing states: no loading, empty, error, disabled or focus styles → every component's required states from DESIGN.md section 5.
  - Hover-only affordances (actions that appear only on hover) → visible by default on touch; hover as an enhancement for fine pointers.
  - Spinners for everything, modals for everything → skeletons for content, progress for long tasks; sheets or inline expansion before a modal.
- `## Motion`
  - Everything fades up on scroll, everything bounces, durations of 600 ms or more for small UI → motion only where it explains a change, from the motion roles, with reduced motion honoured.
- `## Dark mode`
  - Dark mode by inversion, pure black with full-white text everywhere → the guide's dark roles: near-black surfaces that lighten as they rise, softened text, smaller saturated areas.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/knowledge.test.ts test/skill-content.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skill/knowledge/visual-craft.md skill/knowledge/anti-patterns.md cli/test/knowledge.test.ts
git commit -m "feat(skill): knowledge — visual craft and anti-patterns"
```

---

### Task 4: Knowledge — motion and accessibility

**Files:**
- Create: `skill/knowledge/motion.md`, `skill/knowledge/accessibility.md`
- Test: `cli/test/knowledge.test.ts` (append)

**Interfaces:**
- Consumes: `covers` (Task 3).
- Produces: the two files; 1D-2's modes and the React web adapter link to them.

- [ ] **Step 1: Write the failing test**

Append to `cli/test/knowledge.test.ts`:
```ts
describe("knowledge: motion and accessibility", () => {
  covers("motion.md", {
    minLines: 120,
    mustMention: [
      "duration.fast", "duration.base", "duration.slow", "easing.enter", "easing.exit",
      "spring.snappy", "spring.smooth", "spring.bouncy", "transform", "opacity", "stagger",
      "shared element", "prefers-reduced-motion", "press", "skeleton", "60",
    ],
  });
  covers("accessibility.md", {
    minLines: 120,
    mustMention: [
      "WCAG 2.2", "4.5:1", "3:1", "24×24", "44×44", "focus", "keyboard", "200%",
      "label", "alt", "aria-live", "start", "right-to-left", "colour alone", "motion",
    ],
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/knowledge.test.ts`
Expected: FAIL — the two new files don't exist (the Task 3 tests still pass).

- [ ] **Step 3: Write `motion.md`**

`skill/knowledge/motion.md` — title `# Motion`, intro (motion explains change: feedback, orientation and continuity; it is never decoration; every value comes from the guide's motion roles), then:

- `## Durations and easing`
  - Role by job: `duration.instant` for changes that must feel immediate (selection, toggled text); `duration.fast` (about 100–150 ms) for hovers, presses and small fades; `duration.base` (about 200–250 ms) for menus, toasts and most transitions; `duration.slow` (about 300–400 ms) for large surfaces such as sheets and page transitions.
  - Bigger distance or bigger surface → longer. Exits are quicker than entrances (about three quarters of the time).
  - `easing.standard` for moving between two states, `easing.enter` (decelerating) for things arriving, `easing.exit` (accelerating) for things leaving.
- `## Springs`
  - Springs for anything a finger or pointer drives, and anything that may be interrupted: they keep velocity and never jump.
  - `spring.snappy` for presses, toggles and small UI; `spring.smooth` for cards, sheets and screens; `spring.bouncy` only for rare moments of delight (a goal reached), never for routine UI.
  - The duration is perceived, not exact; the bounce shows overshoot. Don't add a duration on top of a spring.
- `## What to animate`
  - Transform (move, scale, rotate) and opacity only: they stay smooth at 60 frames per second. Avoid animating width, height, top, left, margins, shadows or blur on large areas.
  - For size and position changes, use the platform's layout animation instead of animating layout properties.
  - Keep things that move small and few; never animate body text letter by letter.
- `## Choreography`
  - Order: the container first, then its content. Stagger lists by 20–40 ms per item and stop staggering after about 6–8 items.
  - Shared element transitions: the tapped thumbnail becomes the detail image, so people keep their place.
  - Direction follows navigation: forward slides in from the end edge, back from the start edge (mirrored in right-to-left languages). Sheets rise from the bottom, menus grow from their trigger.
- `## Feedback`
  - Press: scale to about 0.97–0.98 with `spring.snappy`, within 100 ms. Hover effects only for fine pointers.
  - Loading: a skeleton that keeps the final layout, with a gentle opacity pulse; a progress bar for tasks over about a second; then cross-fade skeleton to content.
  - Success: a short, specific confirmation (a check that draws in, a toast) — not confetti, except where the brief asks for celebration.
- `## Page and screen transitions`
  - Web: short (≤ `duration.base`) fades or small slides that never block input; keep the header still.
  - Mobile: follow the platform's navigation (push and pop, sheets, tabs that switch without sliding).
- `## Reduced motion`
  - When the viewer sets `prefers-reduced-motion`, remove movement: slides, scales, parallax, auto-playing carousels and looping animations. Keep opacity fades and colour changes; they don't trigger motion sickness.
  - Never auto-play video or carousels without a pause control.
  - `motif shot --audit` reports anything still moving under reduced motion.
- `## Performance`
  - Aim for 60 frames per second on a mid-range phone. Avoid animating shadows and filters over large areas; use will-change sparingly and briefly.
  - Animate on scroll with intersection-based triggers that run once, not with scroll event handlers.
- `## Pattern catalogue`
  - A table of about 12 recipes (pattern, roles, notes): button press; toggle switch; menu open/close; toast in/out; bottom sheet; dialog; list item added/removed; tab change indicator; accordion; skeleton to content; pull to refresh (mobile); success check.

- [ ] **Step 4: Write `accessibility.md`**

`skill/knowledge/accessibility.md` — title `# Accessibility`, intro (Motif's target is WCAG 2.2 AA; most of it is built in by the guide, the rest is how screens are assembled), then:

- `## Contrast`
  - 4.5:1 for normal text, 3:1 for large text (at least 24 px, or 18.5 px bold) and for UI parts such as borders of inputs and focus rings. Both light and dark.
  - The guide's readability pairs encode this; `motif validate` checks them. A new text-on-surface combination means a new pair.
  - Never rely on colour alone: errors have text, required fields have words or a symbol with a label, charts have labels or patterns.
  - Text over images needs a scrim or a solid surface.
- `## Target size`
  - At least 24×24 CSS px with space around it (WCAG 2.2 AA); 44×44 on touch screens. Small icons get padding, not tiny hit areas. Keep adjacent targets apart.
  - `motif shot --audit` measures rendered targets.
- `## Keyboard and focus`
  - Everything works with a keyboard in a logical order; no traps. Visible focus on every interactive element (the `focus` role), never removed without a replacement.
  - Dialogs move focus in and return it on close; Escape closes them. Skip links on content-heavy pages.
- `## Text and zoom`
  - Text can grow to 200% without losing content or overlapping; no fixed-height text containers; respect the platform's text size setting on mobile.
- `## Names, labels and announcements`
  - Every input has a visible label (placeholders are not labels). Icon-only buttons have an accessible name. Images have alt text that says what matters, or empty alt when decorative.
  - Use real buttons, links, headings and lists; the heading order follows the page's structure.
  - Status changes that happen without a page change (toasts, form errors, loading finished) are announced through a polite live region (`aria-live` on the web).
- `## Forms`
  - Errors next to the field, in words, with how to fix it; summarise errors at the top of long forms and move focus there. Don't clear what people typed.
  - Use the right input types and autocomplete hints; group related fields.
- `## Motion and flashing`
  - Honour reduced motion (see [motion](motion.md)); nothing flashes more than three times a second; anything moving for more than five seconds can be paused.
- `## Right-to-left and languages`
  - Lay out with start and end, not left and right, so right-to-left languages mirror correctly; icons that show direction (back, next) mirror too; numbers and media controls don't.
  - Leave room for longer translations (about 30% more); never put text in images.
- `## Checklist`
  - A 10–12 item checklist mirroring the sections above, ending with "run `motif validate` and `motif shot --audit` and fix what they report".

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/knowledge.test.ts test/skill-content.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skill/knowledge/motion.md skill/knowledge/accessibility.md cli/test/knowledge.test.ts
git commit -m "feat(skill): knowledge — motion and accessibility"
```

---

### Task 5: UX patterns — getting in and getting around

**Files:**
- Create: `skill/knowledge/ux-patterns/onboarding.md`, `sign-in.md`, `home-dashboard.md`, `lists-feeds.md`, `detail-pages.md`, `forms.md`
- Test: `cli/test/knowledge.test.ts` (append)

**Interfaces:**
- Consumes: `covers` (Task 3); the five-section rule (Task 1 lint).
- Produces: six pattern files. 1D-2's `feature` mode step 3 and `init` step 6 read the pattern that matches the screen being built.

Every pattern file: title `# <Pattern>`, one-sentence intro, then exactly `## Goal`, `## Anatomy`, `## Required states`, `## Common mistakes`, `## Mobile and web`. Anatomy and states are bullet lists; mistakes are written as "mistake → instead". Stay stack-neutral and use role names where values matter. Mock data only: patterns never describe real back-end logic.

- [ ] **Step 1: Write the failing test**

Append to `cli/test/knowledge.test.ts`:
```ts
describe("UX patterns: getting in and getting around", () => {
  covers("ux-patterns/onboarding.md", { minLines: 40, mustMention: ["skip", "permission", "progress", "first", "resume"] });
  covers("ux-patterns/sign-in.md", { minLines: 40, mustMention: ["forgot", "show", "autocomplete", "passkey", "loading", "paste"] });
  covers("ux-patterns/home-dashboard.md", { minLines: 40, mustMention: ["empty", "skeleton", "next action", "retry", "summary"] });
  covers("ux-patterns/lists-feeds.md", { minLines: 40, mustMention: ["undo", "pagination", "skeleton", "row", "scroll position", "swipe"] });
  covers("ux-patterns/detail-pages.md", { minLines: 40, mustMention: ["primary action", "sticky", "not found", "back", "breadcrumb"] });
  covers("ux-patterns/forms.md", { minLines: 40, mustMention: ["label", "inline", "blur", "keyboard", "unsaved", "error summary", "autofill"] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/knowledge.test.ts`
Expected: FAIL — the six files don't exist.

- [ ] **Step 3: Write the six files**

**`onboarding.md`** — *Onboarding*
- Goal: reach the first moment of real value fast; ask only what is needed now; explain value, not the interface.
- Anatomy: welcome (one-line value, primary "Get started", secondary "I already have an account"); up to three optional benefit steps with progress dots and Skip; a permission primer before any system prompt (why, Allow, Not now); a few personalisation choices as chips with Skip; a first-run screen that leads to one guided first action.
- Required states: first launch; returning but unfinished (resume where they left off); permission granted, denied (explain how to turn it on later and carry on); offline; loading after personalisation; account creation failed.
- Common mistakes: long carousels → one welcome and get to the product; permissions on launch → ask at the moment they are needed; sign-up before any value → let people look first where possible; no Skip → always skippable; tooltip tours pointing at every button → one contextual tip at the right time; pre-ticked marketing consent → unticked, plain words.
- Mobile and web: mobile has full-screen steps, primary action at the bottom within thumb reach, swipe plus buttons; web usually skips carousels (landing → sign-up → first project) and uses an in-app checklist instead.

**`sign-in.md`** — *Sign-in and sign-up*
- Goal: get people in with the least effort and risk, and make recovery easy.
- Anatomy: email field; password with Show/Hide; primary "Sign in"; passkey or platform sign-in first when available, then social options; "Forgot password?"; a link to switch between sign-in and sign-up; sign-up shows password rules up front and the terms in one line; magic link as an alternative; a one-time code field that accepts paste and the platform's code autofill.
- Required states: empty; typing; invalid email (checked on blur); wrong email or password (one generic message that doesn't reveal which); too many attempts (when they can try again); loading (button shows progress, no double submit); success; offline; "check your inbox" with a resend that waits a minute; expired link.
- Common mistakes: placeholders as labels → visible labels; blocking paste → allow paste and password managers; rules shown only after failure → show them before typing; clearing the form on error → keep what was typed; a confirm-password field → Show/Hide instead; a bare "Error" → say what happened and what to do; social buttons louder than the main path → one primary action.
- Mobile and web: mobile uses the email keyboard, autocomplete hints (`username`, `current-password`, `new-password`, `one-time-code`), biometric re-entry, and keeps the button above the keyboard; web uses a narrow centred card (about 400–480 px), Enter submits, focus starts in the first field.

**`home-dashboard.md`** — *Home and dashboard*
- Goal: answer "what's going on, and what should I do next?" in a few seconds.
- Anatomy: a short context line; the one summary that matters most (balance, status, progress); the next action; recent activity; shortcuts; main navigation (tab bar or sidebar); the notifications entry.
- Required states: first use (empty, leading to the first action); loading (skeleton matching the layout); partial data; one section failing (retry in place, the rest of the page still works); stale or offline (show when it was last updated); very full (a "See all").
- Common mistakes: rows of equal stat cards → one summary and the next action; vanity numbers → numbers that drive a decision; charts without period or comparison → label both; everything competing above the fold → a clear order; no empty state → a first-use state with a single action.
- Mobile and web: mobile is one column in priority order with pull to refresh and a bottom tab bar; web is a grid with one clear primary region, sidebar navigation, more density, details on hover and focus.

**`lists-feeds.md`** — *Lists and feeds*
- Goal: scan, find and act on many items quickly.
- Anatomy: the row (leading avatar or media, title, secondary text, metadata, trailing action or chevron); section headers; search; sort and filter entry; pagination or loading more; pull to refresh; swipe actions on touch; a selection mode for bulk actions; an add action.
- Required states: first page loading (skeleton rows); empty — first use, no results, everything filtered out (three different messages); error with retry; loading more; end of the list; item updating or removed (immediate, with Undo); offline with cached items.
- Common mistakes: cards for plain lists → rows; uneven row heights → consistent structure; only the text is tappable → the whole row; infinite scroll that hides the footer → paginate or move the footer; back loses the scroll position → restore it; delete without Undo → Undo in a toast; five actions per row → one, plus an overflow menu.
- Mobile and web: mobile rows are full width and at least 44 px tall, swipe actions also reachable another way, pull to refresh; web uses tables for comparable data with sortable columns, secondary actions visible on hover and on focus, arrow-key navigation, pagination for large sets.

**`detail-pages.md`** — *Detail pages*
- Goal: show everything about one item and the actions on it.
- Anatomy: a header with the title and the key status or price; media; key facts; the primary action; secondary actions in an overflow menu; related items; history and metadata; back navigation; share.
- Required states: loading (show what the list already knew — the title — at once, skeleton for the rest); not found or deleted; no permission; error; editing; saving.
- Common mistakes: the primary action buried at the bottom → keep it visible; repeating only what the list showed → add the details people came for; walls of specifications → group and lead with the few that matter; details in a modal → a page (or a side panel on wide screens); back loses the list's place → restore it.
- Mobile and web: mobile has hero media, a sticky bottom bar with the primary action, stacked sections; web uses two columns (content and an action panel), a breadcrumb, and master–detail on wide screens.

**`forms.md`** — *Forms and validation*
- Goal: collect accurate information with the least effort and no surprises.
- Anatomy: a label above each field; helper text; mark whichever is the minority, required or optional; grouped sections; one column; inputs that match the data (radio buttons for up to about seven options, a select or search beyond that, real date pickers); the primary submit at the end and a way to cancel; multi-step forms show progress and end with a review step.
- Required states: default, focused, filled; invalid (shown inline after blur or on submit, never on every keystroke); valid only when it helps (password strength); disabled and read-only; submitting (button shows progress, no double submit); success; server error (keep everything typed); unsaved changes warning when leaving.
- Common mistakes: validating each keystroke → on blur and submit; "Invalid input" → what's wrong and how to fix it; clearing fields after an error → keep them; two-column forms → one column; placeholders as labels → labels; a disabled submit with no reason → enable it and explain on submit; fields nobody needs → remove them; back resets the form → keep its state.
- Mobile and web: mobile uses the right keyboard for each field, autofill hints, Next and Done keys, keeps the focused field above the keyboard, and pins the submit button; web keeps a logical tab order, submits single-field forms with Enter, shows an error summary at the top of long forms that links to each field, and caps width at about 560 px.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && bun test test/knowledge.test.ts test/skill-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skill/knowledge/ux-patterns cli/test/knowledge.test.ts
git commit -m "feat(skill): UX patterns — onboarding, sign-in, home, lists, details, forms"
```

---

### Task 6: UX patterns — finding, deciding and staying informed

**Files:**
- Create: `skill/knowledge/ux-patterns/search-filters.md`, `settings.md`, `checkout.md`, `notifications.md`, `profile.md`, `empty-loading-error.md`
- Test: `cli/test/knowledge.test.ts` (append)

**Interfaces:**
- Consumes: `covers` (Task 3); the five-section rule (Task 1 lint).
- Produces: six pattern files (the spec's §8.4 list is then complete: 12 files).

Same rules as Task 5.

- [ ] **Step 1: Write the failing test**

In `cli/test/knowledge.test.ts`, change the `node:fs` import to `import { existsSync, readdirSync, readFileSync } from "node:fs";`, then append:
```ts
describe("UX patterns: finding, deciding and staying informed", () => {
  covers("ux-patterns/search-filters.md", { minLines: 40, mustMention: ["no results", "recent", "chips", "debounce", "clear", "URL"] });
  covers("ux-patterns/settings.md", { minLines: 40, mustMention: ["switch", "destructive", "confirm", "group", "optimistic"] });
  covers("ux-patterns/checkout.md", { minLines: 40, mustMention: ["total", "guest", "declined", "wallet", "twice", "order summary", "mock"] });
  covers("ux-patterns/notifications.md", { minLines: 40, mustMention: ["toast", "badge", "unread", "caught up", "push", "preferences"] });
  covers("ux-patterns/profile.md", { minLines: 40, mustMention: ["initials", "edit", "avatar", "private", "own"] });
  covers("ux-patterns/empty-loading-error.md", { minLines: 40, mustMention: ["first use", "no results", "retry", "skeleton", "300 ms", "offline", "plain words"] });
});

test("the knowledge base has every pattern the spec lists, and nothing else", () => {
  expect(readdirSync(join(KNOWLEDGE, "ux-patterns")).sort()).toEqual([
    "checkout.md", "detail-pages.md", "empty-loading-error.md", "forms.md", "home-dashboard.md", "lists-feeds.md",
    "notifications.md", "onboarding.md", "profile.md", "search-filters.md", "settings.md", "sign-in.md",
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/knowledge.test.ts`
Expected: FAIL — the six files don't exist, and the folder has only six patterns.

- [ ] **Step 3: Write the six files**

**`search-filters.md`** — *Search and filters*
- Goal: help people find the right thing fast, even with a vague query.
- Anatomy: a search field with a Clear button; recent searches; suggestions as people type; results with the matching words highlighted; filters as chips or a panel; active filters shown as removable chips with "Clear all"; sort; the result count.
- Required states: idle (recent searches and suggestions); typing (suggestions after a short debounce of about 200–300 ms); loading; results; no results (suggest a spelling, removing a filter, or broader words); error; filtered to nothing.
- Common mistakes: searching only on Enter with no feedback → live results or a clear Search button; back loses the query → keep it; filters reset on navigation → keep them; no count → show it; active filters hidden in a panel → chips above the results; exact matches only → tolerate typos and plurals.
- Mobile and web: mobile opens a full-screen search, filters in a sheet with Apply and a live count; web keeps a persistent search bar, a filter sidebar, puts the query and filters in the URL so results can be shared, supports `/` to focus search and arrow keys in suggestions.

**`settings.md`** — *Settings*
- Goal: let people find and change preferences with confidence.
- Anatomy: grouped rows (account, notifications, appearance, privacy, help, about); each row has a label, its current value and a control — a switch for things that apply at once, a chevron for a sub-page; destructive actions (sign out, delete account) last and set apart; search when there are many settings.
- Required states: switches update optimistically and revert with a message if saving fails; a quiet saved confirmation; error; confirming dangerous actions (type the name to confirm anything irreversible); disabled with the reason; loading.
- Common mistakes: a Save button for switches → apply immediately; jargon labels → plain words with a one-line description; deep nesting → at most two levels; destructive actions beside everyday ones → a separate group at the end; no confirmation or undo → confirm what can't be undone; changes that need a restart without saying so → say so.
- Mobile and web: mobile follows the platform's grouped lists, switches and sub-screens; web uses a section sidebar and a content panel, autosaves switches and saves text fields explicitly with a clear saved state.

**`checkout.md`** — *Checkout and payment*
- Goal: complete a purchase quickly and safely, with no surprises. (Motif builds the interface with mock data; real payment handling is the developer's back end.)
- Anatomy: an order summary (items, quantities, editable); contact and delivery details; delivery options with price and date; payment, with wallet buttons first and card fields that format as people type and show the card brand; a collapsed promo code field; the total with tax and fees itemised; the primary button saying the amount ("Pay $24.00"); a short security note and refund policy link; a confirmation page with the order number and next steps.
- Required states: totals updating; invalid card details; payment declined (keep everything, say why if known, offer another method); extra verification by the bank; processing (the button can't be pressed twice); success; item out of stock; address problems; guest checkout.
- Common mistakes: forcing an account → offer guest checkout and an account after; fees revealed at the last step → show them early; many steps → one page with sections where possible; clearing card details after an error → keep them; "Continue" on the final step → the amount; a prominent promo field that sends people hunting for codes → collapse it.
- Mobile and web: mobile puts express wallets on top, pins the total and pay button, uses the numeric keypad and card autofill hints; web uses two columns with a sticky order summary and address autocomplete.

**`notifications.md`** — *Notifications*
- Goal: tell people what needs their attention without overwhelming them.
- Anatomy: an inbox (grouped by day, unread markers, who did what to what and when, inline actions); badges (capped at 99+); toasts for short confirmations; banners for conditions that persist; push notifications with a primer before the system prompt; a link to notification preferences.
- Required states: empty ("You're all caught up"); unread and read; loading; error; marking all as read; the thing a notification points to was deleted; push permission denied.
- Common mistakes: toasts for errors that need action → inline messages or banners; badges that never clear → clear on view; asking for push on launch → ask after people see the value; notifying about everything → let people choose; no way to mute → per-type controls; toasts covering the primary action → a consistent corner away from it; toasts that vanish before they can be read → at least five seconds, paused on hover and focus.
- Mobile and web: mobile uses push with deep links, an inbox in a tab or behind a bell, swipe to dismiss; web uses a bell with a popover and "See all", toasts in one corner (bottom, end side), announced through a polite live region.

**`profile.md`** — *Profile*
- Goal: show who someone is, and let people manage their own details.
- Anatomy: avatar with an initials fallback; name; handle or role; a short bio or key facts; the primary action (Follow or Message on someone else's profile, Edit on your own); sections or tabs of their content; an edit form with photo upload, crop and preview; a privacy indicator.
- Required states: your own profile vs someone else's; loading; nothing posted yet; private or blocked; editing; uploading a photo (progress); validation errors (handle already taken); saved.
- Common mistakes: vanity stats → facts that matter in this app; Edit hidden in a menu → visible on your own profile; uploads without crop or preview → both; no fallback avatar → initials; long bios breaking the layout → clamp with "More"; settings mixed into the profile → link to settings.
- Mobile and web: mobile has a header with avatar and action row, then tabbed content; web uses a wider header and two columns (about and content), editing in place or in a dialog.

**`empty-loading-error.md`** — *Empty, loading and error states*
- Goal: never leave people looking at nothing or at a dead end: every state says what is happening and what to do next.
- Anatomy: empty states (a small optional illustration, a title, one plain line, one primary action); loading (skeletons for content, a spinner only for small inline waits, a progress bar with a percentage for long tasks); errors (what happened in plain words, what to do, Retry, everything typed kept, a way to get help); an offline banner; partial failure inside a page.
- Required states: first use (nothing created yet); no results; cleared ("All done"); loading under about 300 ms (show nothing, to avoid a flash); loading over 300 ms (skeleton); long waits over about three seconds (progress or a message); recoverable error (Retry); unrecoverable error (go back or home, contact support); offline; permission needed.
- Common mistakes: blank screens → always a state; a full-page spinner → skeletons; skeletons flashing for fast loads → wait about 300 ms first; error codes → plain words; "Something went wrong" with no next step → Retry or a way out; blaming people ("You entered an invalid…") → describe the fix; an empty state with no action → one clear action; layout jumping when content arrives → skeletons with the same size.
- Mobile and web: mobile shows states inside the content area with pull to retry and an offline banner at the top; web keeps failures local to their section, uses a toast for background failures, and announces state changes through a polite live region.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd cli && bun test test/knowledge.test.ts test/skill-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skill/knowledge/ux-patterns cli/test/knowledge.test.ts
git commit -m "feat(skill): UX patterns — search, settings, checkout, notifications, profile, empty/loading/error"
```

---

### Task 7: One catalog of design sources, and `motif connect`

**Files:**
- Create: `cli/src/sources/catalog.ts`, `cli/src/commands/connect.ts`
- Modify: `cli/src/detect/sources.ts` (patterns and labels from the catalog), `cli/src/main.ts` (register `connect`, help line)
- Test: `cli/test/catalog.test.ts`, `cli/test/connect.test.ts`, `cli/test/main.test.ts` (append)

**Interfaces:**
- Consumes: `findConfiguredSources`, `ConfiguredSource` (1A); `RunContext`, `CommandResult`; `tempDir`, `cleanupTempDirs`.
- Produces:
  - From `src/sources/catalog.ts`: `type SourceId = "refero" | "21st" | "60fps" | "motion"`; `interface SourceInfo { id: SourceId; label: string; gives: string; cost: string; configPattern: RegExp; tools: string[]; note: string; connect: { name: string; url: string; auth: "none" | "oauth" | "key"; keyHeader?: string }; docs: string }`; `SOURCES: SourceInfo[]` (in this order: motion, refero, 21st, 60fps); `sourceById(id: string): SourceInfo | undefined`
  - `src/detect/sources.ts` keeps exporting `SourceId`, `SOURCE_LABELS`, `ConfiguredSource`, `findConfiguredSources` (now driven by the catalog)
  - From `src/commands/connect.ts`: `interface ConnectDeps { which: (cmd: string) => string | null; run: (exe: string, args: string[]) => Promise<{ code: number; output: string }>; interactive: boolean; readSecret: (prompt: string) => Promise<string>; configured: () => ConfiguredSource[]; home: string }`; `spawnArgs(exe: string, args: string[], platform?: NodeJS.Platform): { cmd: string[]; verbatim: boolean }`; `runCommand(exe: string, args: string[]): Promise<{ code: number; output: string }>`; `genericConfig(source: SourceInfo): string`; `runConnect(cwd: string, ctx: RunContext, deps?: ConnectDeps): Promise<CommandResult>`
  - Task 8's source notes are checked against `SOURCES[].tools`.

Behaviour of `motif connect`:

| Call | Result |
|---|---|
| `motif connect` | lists the four sources: connected or not, what each adds, what it costs, the command to connect it; notes that Supahero needs nothing. Exit 0. |
| `motif connect <id>` with an unknown id | exit 2, lists the ids |
| `claude` not installed | exit 2: Motif can set this up for Claude Code; other agents: the generic JSON to paste |
| already connected (found in the agent's config) | exit 0, says where, changes nothing |
| `motion` (no sign-in) or `refero` / `60fps` (OAuth) | runs `claude mcp add --transport http --scope user <name> <url>`; for OAuth sources, says to type `/mcp` in Claude Code and sign in. Exit 0. |
| `21st` (key) without an interactive terminal | exit 2: run it in your own terminal so the key never passes through the chat; nothing is read or written |
| `21st` (key) in a terminal | asks for the key with hidden input; empty → exit 2, nothing changed; else runs `claude mcp add --header "x-api-key: <key>" --transport http --scope user 21st <url>`; warns if `~/.claude.json` is tracked by git |
| `claude mcp add` fails | exit 2 with its output and the generic JSON |

Keys go only to Claude Code's user-level configuration (`~/.claude.json`); nothing is written in the project. On Windows, an npm-installed `claude` is a `.cmd` file, which is run through `cmd.exe` with every argument quoted (checked while planning: spaces, `:`, `&`, `|` and `^` arrive intact).

- [ ] **Step 1: Write the failing tests**

`cli/test/catalog.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findConfiguredSources, SOURCE_LABELS } from "../src/detect/sources";
import { SOURCES, sourceById } from "../src/sources/catalog";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("the design source catalog", () => {
  test("four sources, each with verified connection details", () => {
    expect(SOURCES.map((s) => s.id)).toEqual(["motion", "refero", "21st", "60fps"]);
    for (const s of SOURCES) {
      expect(s.connect.url).toStartWith("https://");
      expect(s.docs).toStartWith("https://");
      expect(s.tools.length).toBeGreaterThan(0);
      expect(s.connect.auth === "key").toBe(Boolean(s.connect.keyHeader));
    }
    expect(sourceById("21st")!.connect).toMatchObject({ url: "https://21st.dev/api/mcp", auth: "key", keyHeader: "x-api-key" });
    expect(sourceById("motion")!.connect).toMatchObject({ url: "https://mcp.motion.dev", auth: "none" });
    expect(sourceById("nope")).toBeUndefined();
    expect(SOURCE_LABELS["60fps"]).toBe("60fps.design");
  });

  test("the configurations each source's own installer writes are recognised", () => {
    const cwd = tempDir("motif-cat-");
    const home = tempDir("motif-cat-");
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "21st": { type: "http", url: "https://21st.dev/api/mcp", headers: { "x-api-key": "${API_KEY_21ST}" } },
        motion: { type: "http", url: "https://mcp.motion.dev" },
        "motion-plus": { type: "http", url: "https://mcp.motion.dev/plus" },
      },
    }));
    writeFileSync(join(home, ".claude.json"), JSON.stringify({
      mcpServers: {
        refero: { type: "http", url: "https://api.refero.design/mcp" },
        library: { type: "http", url: "https://mcp.60fps.design/mcp" },
        github: { command: "gh-mcp" },
      },
    }));
    expect(findConfiguredSources(cwd, home).map((s) => s.id).sort()).toEqual(["21st", "60fps", "motion", "refero"]);
  });
});
```

`cli/test/connect.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { genericConfig, runCommand, runConnect, spawnArgs, type ConnectDeps } from "../src/commands/connect";
import type { ConfiguredSource } from "../src/detect/sources";
import { sourceById } from "../src/sources/catalog";
import { tempDir } from "./tmp";

function fakes(over: Partial<ConnectDeps> & { connected?: ConfiguredSource[]; claudeExit?: number; gitTracked?: boolean; key?: string } = {}) {
  const calls = { runs: [] as { exe: string; args: string[] }[], prompts: 0 };
  const { connected = [], claudeExit = 0, gitTracked = false, key = "secret-key", ...rest } = over;
  const deps: ConnectDeps = {
    which: (cmd) => (cmd === "claude" ? "/usr/bin/claude" : cmd === "git" ? "/usr/bin/git" : null),
    run: async (exe, args) => {
      calls.runs.push({ exe, args });
      if (exe.endsWith("git")) return { code: gitTracked ? 0 : 1, output: "" };
      return { code: claudeExit, output: claudeExit === 0 ? "Added HTTP MCP server" : "MCP server 21st already exists in user config" };
    },
    interactive: true,
    readSecret: async () => {
      calls.prompts++;
      return key;
    },
    configured: () => connected,
    home: "/home/dev",
    ...rest,
  };
  return { deps, calls };
}
const ctx = (...positionals: string[]) => ({ positionals });
const claudeRuns = (runs: { exe: string; args: string[] }[]) => runs.filter((r) => r.exe.endsWith("claude"));

describe("motif connect (no source)", () => {
  test("lists every source with what it adds, its cost, and how to connect it", async () => {
    const { deps } = fakes({ connected: [{ id: "motion", server: "motion", where: ".mcp.json" }] });
    const r = await runConnect(".", ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("✓ Motion");
    expect(r.text).toContain("motif connect refero");
    expect(r.text).toContain("Supahero");
    expect((r.data.sources as { id: string; connected: boolean }[]).map((s) => [s.id, s.connected])).toEqual([
      ["motion", true], ["refero", false], ["21st", false], ["60fps", false],
    ]);
  });
});

describe("motif connect <source>", () => {
  test("an unknown source lists the real ones", async () => {
    const r = await runConnect(".", ctx("dribbble"), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motion, refero, 21st, 60fps");
  });

  test("without Claude Code, it shows the settings to paste into another agent", async () => {
    const { deps, calls } = fakes({ which: () => null });
    const r = await runConnect(".", ctx("refero"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("https://api.refero.design/mcp");
    expect(calls.runs).toEqual([]);
  });

  test("an already connected source is left alone", async () => {
    const { deps, calls } = fakes({ connected: [{ id: "refero", server: "refero", where: "~/.claude.json" }] });
    const r = await runConnect(".", ctx("refero"), deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("~/.claude.json");
    expect(calls.runs).toEqual([]);
  });

  test("Motion needs no account", async () => {
    const { deps, calls } = fakes();
    const r = await runConnect(".", ctx("motion"), deps);
    expect(r.exitCode).toBe(0);
    expect(claudeRuns(calls.runs)[0]!.args).toEqual(["mcp", "add", "--transport", "http", "--scope", "user", "motion", "https://mcp.motion.dev"]);
    expect(r.text).not.toContain("/mcp");
    expect(calls.prompts).toBe(0);
  });

  test("Refero and 60fps sign in inside Claude Code", async () => {
    const { deps, calls } = fakes();
    const r = await runConnect(".", ctx("60fps"), deps);
    expect(r.exitCode).toBe(0);
    expect(claudeRuns(calls.runs)[0]!.args).toEqual(["mcp", "add", "--transport", "http", "--scope", "user", "60fps", "https://mcp.60fps.design/mcp"]);
    expect(r.text).toContain("/mcp");
    expect(calls.prompts).toBe(0);
  });

  test("a key is never read without the developer's own terminal", async () => {
    const { deps, calls } = fakes({ interactive: false });
    const r = await runConnect(".", ctx("21st"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("your own terminal");
    expect(calls.prompts).toBe(0);
    expect(calls.runs).toEqual([]);
  });

  test("a key is read hidden and stored in Claude Code's user settings", async () => {
    const { deps, calls } = fakes();
    const r = await runConnect(".", ctx("21st"), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.prompts).toBe(1);
    expect(claudeRuns(calls.runs)[0]!.args).toEqual([
      "mcp", "add", "--header", "x-api-key: secret-key", "--transport", "http", "--scope", "user", "21st", "https://21st.dev/api/mcp",
    ]);
    expect(r.text).not.toContain("secret-key");
    expect(JSON.stringify(r.data)).not.toContain("secret-key");
    expect(r.text).not.toContain("tracked by git");
  });

  test("warns when the settings file holding the key is tracked by git", async () => {
    const r = await runConnect(".", ctx("21st"), fakes({ gitTracked: true }).deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("tracked by git");
  });

  test("an empty key changes nothing", async () => {
    const { deps, calls } = fakes({ key: "" });
    const r = await runConnect(".", ctx("21st"), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Nothing changed");
    expect(claudeRuns(calls.runs)).toEqual([]);
  });

  test("when Claude Code refuses, its message and the manual settings are shown", async () => {
    const r = await runConnect(".", ctx("refero"), fakes({ claudeExit: 1 }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("already exists");
    expect(r.text).toContain("https://api.refero.design/mcp");
  });
});

describe("running claude", () => {
  test("npm's .cmd shims on Windows go through cmd.exe with every argument quoted", () => {
    expect(spawnArgs("C:\\Users\\me\\npm\\claude.cmd", ["mcp", "add", "--header", "x-api-key: a&b"], "win32")).toEqual({
      cmd: ["cmd.exe", "/d", "/s", "/c", '""C:\\Users\\me\\npm\\claude.cmd" "mcp" "add" "--header" "x-api-key: a&b""'],
      verbatim: true,
    });
    expect(spawnArgs("C:\\tools\\claude.exe", ["mcp"], "win32")).toEqual({ cmd: ["C:\\tools\\claude.exe", "mcp"], verbatim: false });
    expect(spawnArgs("/usr/bin/claude", ["mcp"], "linux")).toEqual({ cmd: ["/usr/bin/claude", "mcp"], verbatim: false });
  });

  test.skipIf(process.platform !== "win32")("arguments reach a .cmd file intact, even in a folder with spaces", async () => {
    const dir = tempDir("motif cmd ");
    const shim = join(dir, "echoargs.cmd");
    // %1 keeps each argument's quotes, so the echo itself can't misread & or |.
    writeFileSync(shim, "@echo off\r\necho [%1] [%2]\r\n");
    const r = await runCommand(shim, ["--header", "x-api-key: ab&c|d^e"]);
    expect(r).toEqual({ code: 0, output: '["--header"] ["x-api-key: ab&c|d^e"]' });
  });

  test("genericConfig is the JSON other agents take, with a key placeholder where one is needed", () => {
    expect(JSON.parse(genericConfig(sourceById("21st")!))).toEqual({
      mcpServers: { "21st": { type: "http", url: "https://21st.dev/api/mcp", headers: { "x-api-key": "<your 21st.dev key>" } } },
    });
    expect(JSON.parse(genericConfig(sourceById("motion")!))).toEqual({ mcpServers: { motion: { type: "http", url: "https://mcp.motion.dev" } } });
  });
});
```

Append to `cli/test/main.test.ts`:
```ts
describe("main: connect", () => {
  test("is listed in help", () => {
    expect(run("help").stdout.toString()).toContain("connect");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && bun test test/catalog.test.ts test/connect.test.ts test/main.test.ts`
Expected: FAIL — `../src/sources/catalog` and `../src/commands/connect` don't exist; help has no `connect`.

- [ ] **Step 3: The catalog**

`cli/src/sources/catalog.ts`:
```ts
/** Optional design sources, as verified on 2026-10-13 (docs/decisions/0002-design-sources.md). */
export type SourceId = "refero" | "21st" | "60fps" | "motion";

export interface SourceInfo {
  id: SourceId;
  label: string;
  /** What it adds to Motif, in a few words. */
  gives: string;
  /** Who can use it. */
  cost: string;
  /** Matched against "<server name>\n<server settings JSON>" in an agent's MCP settings. */
  configPattern: RegExp;
  /** Tool names as the server reports them; agents may show them with their own prefix. */
  tools: string[];
  /** One line for the developer about limits or scope. */
  note: string;
  connect: {
    /** The server name to register. */
    name: string;
    url: string;
    /** none: open; oauth: sign in inside the agent; key: a key in a header. */
    auth: "none" | "oauth" | "key";
    keyHeader?: string;
  };
  docs: string;
}

export const SOURCES: SourceInfo[] = [
  {
    id: "motion",
    label: "Motion",
    gives: "search of Motion's animation docs and examples",
    cost: "Free, no account",
    configPattern: /^motion(?:-plus)?$|mcp\.motion\.dev|motion-ai/im,
    tools: ["search-motion-docs"],
    note: "Motion+ subscribers can also add Motion's source and transition tools with npx motion-ai.",
    connect: { name: "motion", url: "https://mcp.motion.dev", auth: "none" },
    docs: "https://motion.dev/docs/ai-kit",
  },
  {
    id: "refero",
    label: "Refero",
    gives: "real app and website screens, flows and style guides to research with",
    cost: "Paid Refero plan (Pro, Team or Lifetime)",
    configPattern: /refero/i,
    tools: [
      "refero_search_styles", "refero_get_style", "refero_search_screens", "refero_get_screen", "refero_get_similar_screens",
      "refero_get_screen_image", "refero_search_flows", "refero_get_flow", "refero_search_site", "refero_search_app",
    ],
    note: "Up to 8,000 tool calls a month on paid plans.",
    connect: { name: "refero", url: "https://api.refero.design/mcp", auth: "oauth" },
    docs: "https://doc.refero.design/mcp/getting-started",
  },
  {
    id: "21st",
    label: "21st.dev",
    gives: "React component ideas and code to adapt",
    cost: "Free key; paid plans for more code copies",
    configPattern: /21st/i,
    tools: ["search", "get_component", "get_inspiration", "search_logo"],
    note: "The free key allows unlimited search and 2 code copies a day.",
    connect: { name: "21st", url: "https://21st.dev/api/mcp", auth: "key", keyHeader: "x-api-key" },
    docs: "https://21st.dev/mcp.md",
  },
  {
    id: "60fps",
    label: "60fps.design",
    gives: "iOS motion and interaction references with SwiftUI breakdowns",
    cost: "Paid 60fps MCP plan",
    configPattern: /60fps/i,
    tools: ["60fps_search_shots", "60fps_list_filters", "60fps_get_shot", "60fps_get_motion_breakdown", "60fps_get_motion_code", "60fps_get_related_shots"],
    note: "iOS shots only; code comes as SwiftUI.",
    connect: { name: "60fps", url: "https://mcp.60fps.design/mcp", auth: "oauth" },
    docs: "https://60fps.design/mcp",
  },
];

export function sourceById(id: string): SourceInfo | undefined {
  return SOURCES.find((s) => s.id === id);
}
```

In `cli/src/detect/sources.ts`, replace the `SourceId` type, `SOURCE_LABELS` and `SOURCE_PATTERNS` with:
```ts
import { SOURCES, type SourceId } from "../sources/catalog";

export type { SourceId };

export const SOURCE_LABELS = Object.fromEntries(SOURCES.map((s) => [s.id, s.label])) as Record<SourceId, string>;
```
and in `findConfiguredSources`, replace the inner loop over `SOURCE_PATTERNS` with:
```ts
    for (const source of SOURCES) {
      if (source.configPattern.test(text) && !found.some((f) => f.id === source.id)) {
        found.push({ id: source.id, server: s.name, where: s.where });
      }
    }
```

Run: `cd cli && bun test test/catalog.test.ts test/sources.test.ts test/doctor.test.ts`
Expected: PASS.

- [ ] **Step 4: The command**

`cli/src/commands/connect.ts`:
```ts
import { homedir } from "node:os";
import type { CommandResult, RunContext } from "../cli/output";
import { findConfiguredSources, type ConfiguredSource } from "../detect/sources";
import { SOURCES, sourceById, type SourceInfo } from "../sources/catalog";

export interface ConnectDeps {
  which: (cmd: string) => string | null;
  run: (exe: string, args: string[]) => Promise<{ code: number; output: string }>;
  /** True when a person is at the terminal (Motif never reads keys any other way). */
  interactive: boolean;
  readSecret: (prompt: string) => Promise<string>;
  configured: () => ConfiguredSource[];
  home: string;
}

/** npm installs `claude` as a .cmd file on Windows, which only cmd.exe can run; every argument is quoted for it. */
export function spawnArgs(exe: string, args: string[], platform: NodeJS.Platform = process.platform): { cmd: string[]; verbatim: boolean } {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    const quote = (a: string) => `"${a.replace(/"/g, '""')}"`;
    return { cmd: ["cmd.exe", "/d", "/s", "/c", `"${[exe, ...args].map(quote).join(" ")}"`], verbatim: true };
  }
  return { cmd: [exe, ...args], verbatim: false };
}

export async function runCommand(exe: string, args: string[]): Promise<{ code: number; output: string }> {
  const { cmd, verbatim } = spawnArgs(exe, args);
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", windowsVerbatimArguments: verbatim });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, output: `${out}${err}`.trim() };
}

/** Reads a line from the terminal without showing it. */
function readSecret(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    const finish = (cancelled: boolean) => {
      stdin.off("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(cancelled ? "" : value.trim());
    };
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return finish(false);
        if (ch === "\u0003") return finish(true); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

function defaultDeps(cwd: string): ConnectDeps {
  const home = homedir();
  return {
    which: (cmd) => Bun.which(cmd),
    run: runCommand,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    readSecret,
    configured: () => findConfiguredSources(cwd, home),
    home,
  };
}

/** The settings other agents take (a placeholder where a key goes). */
export function genericConfig(source: SourceInfo): string {
  const server: Record<string, unknown> = { type: "http", url: source.connect.url };
  if (source.connect.keyHeader) server.headers = { [source.connect.keyHeader]: `<your ${source.label} key>` };
  return JSON.stringify({ mcpServers: { [source.connect.name]: server } }, null, 2);
}

const ids = SOURCES.map((s) => s.id).join(", ");
const fail = (text: string, data: Record<string, unknown>): CommandResult => ({ command: "connect", exitCode: 2, text, data });

function list(deps: ConnectDeps): CommandResult {
  const connected = new Set(deps.configured().map((c) => c.id));
  const lines = ["Design sources — all optional; Motif works fully without them:"];
  for (const s of SOURCES) {
    const on = connected.has(s.id);
    lines.push(`  ${on ? "✓" : "○"} ${s.label} — ${s.gives}. ${s.cost}.${on ? "" : ` Connect: motif connect ${s.id}`}`);
  }
  lines.push("  Supahero needs nothing: Motif reads its public pages when you build a landing page.");
  return {
    command: "connect",
    exitCode: 0,
    text: lines.join("\n"),
    data: { sources: SOURCES.map((s) => ({ id: s.id, label: s.label, connected: connected.has(s.id), gives: s.gives, cost: s.cost, command: `motif connect ${s.id}` })) },
  };
}

export async function runConnect(cwd: string, ctx: RunContext, deps: ConnectDeps = defaultDeps(cwd)): Promise<CommandResult> {
  const id = ctx.positionals[0];
  if (!id) return list(deps);
  const source = sourceById(id);
  if (!source) return fail(`There's no design source called "${id}". Choose one of: ${ids}.`, { error: "no-such-source" });

  const manual = `To use it with another agent, add this to that agent's MCP settings:\n${genericConfig(source)}`;
  const claude = deps.which("claude");
  if (!claude) {
    return fail(`Motif can set up ${source.label} for Claude Code, which isn't installed here.\n${manual}`, { error: "no-agent", config: JSON.parse(genericConfig(source)) });
  }

  const existing = deps.configured().find((c) => c.id === source.id);
  if (existing) {
    return { command: "connect", exitCode: 0, text: `✓ ${source.label} is already connected (server "${existing.server}" in ${existing.where}).`, data: { source: source.id, already: true } };
  }

  const args = ["mcp", "add"];
  if (source.connect.auth === "key") {
    if (!deps.interactive) {
      return fail(`${source.label} needs a key. Run this in your own terminal, so the key never passes through the chat:\n  motif connect ${source.id}`, { error: "needs-terminal" });
    }
    const key = await deps.readSecret(`Paste your ${source.label} key (get one at ${source.docs}); it won't be shown: `);
    if (!key) return fail("No key entered. Nothing changed.", { error: "no-key" });
    args.push("--header", `${source.connect.keyHeader}: ${key}`);
  }
  args.push("--transport", "http", "--scope", "user", source.connect.name, source.connect.url);

  const result = await deps.run(claude, args);
  if (result.code !== 0) {
    return fail(`Claude Code couldn't add ${source.label}:\n  ${result.output}\n${manual}`, { error: "agent-failed" });
  }

  const lines = [`✓ Added ${source.label} to Claude Code for all your projects. ${source.note}`];
  if (source.connect.auth === "oauth") lines.push(`Next: in Claude Code, type /mcp, choose "${source.connect.name}" and sign in with your ${source.label} account.`);
  if (source.connect.auth === "key") {
    const git = deps.which("git");
    if (git && (await deps.run(git, ["-C", deps.home, "ls-files", "--error-unmatch", ".claude.json"])).code === 0) {
      lines.push("Warning: ~/.claude.json, which now holds your key, is tracked by git. Remove it from that repository before you push.");
    }
  }
  lines.push(`Cost: ${source.cost}.`);
  return { command: "connect", exitCode: 0, text: lines.join("\n"), data: { source: source.id, added: true, scope: "user" } };
}
```

In `cli/src/main.ts`: import `runConnect` from `./commands/connect`, add `connect: runConnect,` to `COMMANDS`, and add this help line after `doctor`:
```
  connect    Connect optional design sources (Motion, Refero, 21st.dev, 60fps.design)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/catalog.test.ts test/connect.test.ts test/main.test.ts test/sources.test.ts test/doctor.test.ts && bun run typecheck`
Expected: PASS (the `.cmd` test runs on Windows only).

- [ ] **Step 6: Commit**

```bash
git add cli/src/sources/catalog.ts cli/src/detect/sources.ts cli/src/commands/connect.ts cli/src/main.ts cli/test/catalog.test.ts cli/test/connect.test.ts cli/test/main.test.ts
git commit -m "feat(cli): verified design-source catalog and motif connect"
```

---

### Task 8: The design-source notes, and the decision record

**Files:**
- Create: `skill/sources/motion-dev.md`, `refero.md`, `21st.md`, `60fps.md`, `supahero.md`; `docs/decisions/0002-design-sources.md`
- Modify: `docs/specs/2026-10-12-motif-core-design.md` (one note under the §8.2 table)
- Test: `cli/test/catalog.test.ts` (append)

**Interfaces:**
- Consumes: `SOURCES`, `SourceId` (Task 7); the knowledge files (Tasks 3–6) for fallback links; `motif connect` (Task 7).
- Produces: five notes that 1D-2's `SKILL.md` and modes link to (§8.1 detection line, `init` step 3, `feature` step 3).

Every connectable source's note has these sections: `# <Source>` with a two-sentence intro (what it is, what Motif uses it for); `## Is it connected?`; `## When it's connected`; `## When it isn't`; `## Connecting`; `## Rules`. Tool names are written in backticks exactly as the source reports them; agents may show them with a prefix of their own, so detection is "a tool whose name ends with …". Sign-in is described neutrally ("the developer signs in through their agent's MCP sign-in"); `motif connect` sets sources up for Claude Code and prints the settings for other agents.

- [ ] **Step 1: Write the failing test**

Append to `cli/test/catalog.test.ts` (and add `readdirSync, readFileSync` to its `node:fs` import):
```ts
describe("the source notes agents read", () => {
  const NOTES = join(import.meta.dir, "../../skill/sources");
  const FILES: Record<string, string> = { motion: "motion-dev.md", refero: "refero.md", "21st": "21st.md", "60fps": "60fps.md" };
  const note = (file: string) => readFileSync(join(NOTES, file), "utf8");

  for (const s of SOURCES) {
    test(`${FILES[s.id]} names every ${s.label} tool and how to connect it`, () => {
      const text = note(FILES[s.id]!);
      for (const tool of s.tools) expect(text).toContain(`\`${tool}\``);
      expect(text).toContain(`motif connect ${s.id}`);
      for (const section of ["## Is it connected?", "## When it's connected", "## When it isn't", "## Connecting", "## Rules"]) {
        expect(text).toContain(section);
      }
    });
  }

  test("supahero.md is for landing pages only and has nothing to connect", () => {
    const text = note("supahero.md");
    expect(text).toContain("landing");
    expect(text).not.toContain("motif connect");
  });

  test("the folder holds exactly the five notes", () => {
    expect(readdirSync(NOTES).sort()).toEqual(["21st.md", "60fps.md", "motion-dev.md", "refero.md", "supahero.md"]);
  });

  test("the verified facts are on record", () => {
    const record = readFileSync(join(import.meta.dir, "../../docs/decisions/0002-design-sources.md"), "utf8");
    for (const s of SOURCES) expect(record).toContain(s.connect.url);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/catalog.test.ts`
Expected: FAIL — `skill/sources/` and the decision record don't exist.

- [ ] **Step 3: Write the five notes**

**`skill/sources/motion-dev.md`** — *Motion*
- Intro: Motion (motion.dev) is the MIT-licensed animation library the React web adapter uses; its MCP server searches Motion's docs and examples, free and without an account.
- Is it connected? A tool whose name ends with `search-motion-docs`. Motion+ subscribers may also have `search-motion-source`, `save-transition` and `open-transition-editor`.
- When it's connected: before writing animation code, search the docs (`search-motion-docs` with the platform — `react`, `js` or `vue` — and a search term) for the API in question: springs, layout animations, enter and exit, gestures, scroll, reduced motion. Use the answer's API with the guide's own motion values (on React web, the generated motion values file). Motion+ tools only when the developer has them.
- When it isn't: Motion's docs are public, and every page has a Markdown version (add `.md` to a docs address); read the page you need. The library itself is always free to use. [motion](../knowledge/motion.md) covers what to animate and when.
- Connecting: `motif connect motion` — free, no account. Suggest this one first.
- Rules: values come from the guide's motion roles, never from examples; honour reduced motion; if a call fails, read the public docs instead and say so once.

**`skill/sources/refero.md`** — *Refero*
- Intro: Refero is a library of real product screens, user flows and style guides; Motif uses it to research directions (`init`) and patterns (`feature`). It needs a paid Refero plan.
- Is it connected? Tools whose names end with `refero_search_styles`, `refero_get_style`, `refero_search_screens`, `refero_get_screen`, `refero_get_similar_screens`, `refero_get_screen_image`, `refero_search_flows`, `refero_get_flow`, `refero_search_site` or `refero_search_app`. Until the developer signs in, the tools may be missing.
- When it's connected:
  - Directions: `refero_search_styles` with the brief's personality words and category; `refero_get_style` for two or three candidates; adapt what it returns (colour and type roles, scales, components, do/don't rules) into Motif's format — roles in `tokens.json`, prose in `DESIGN.md` — in your own words, then run `motif validate`.
  - Patterns: `refero_search_flows` or `refero_search_screens` (platform `web` or `ios`) for the pattern you're building, `refero_get_flow` for its steps, `refero_get_screen_image` only to look. Summarise what good products do — order, states, copy — in your own words.
  - Save the screen and flow links you relied on in the guide's Direction section (links only).
  - Paid plans allow 8,000 calls a month: search, then fetch one or two results, not everything.
- When it isn't: use the built-in styles (`motif preview --gallery`) and [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md) and the UX patterns (for example [lists and feeds](../knowledge/ux-patterns/lists-feeds.md)). Don't open Refero's pages yourself: its terms forbid scraping, and its site blocks AI crawlers. Links or screenshots the developer gives you are fine to look at.
- Connecting: `motif connect refero` (paid plan: Pro, Team or Lifetime); then the developer signs in through their agent's MCP sign-in.
- Rules: restyle everything into the guide's roles; copy nothing — no images into the project, no pasted text; mockups stay original; if a call fails or the monthly limit is reached, switch to the free baseline and say so once.

**`skill/sources/21st.md`** — *21st.dev*
- Intro: 21st.dev is a marketplace of React components; Motif uses it for component ideas and, on React web, code to adapt. A free key allows unlimited search and two code copies a day.
- Is it connected? Tools named `search`, `get_component`, `get_inspiration` and `search_logo` that come from a server whose name includes "21st" (the names alone are too generic to trust).
- When it's connected:
  - `search` first (free) for a component the guide doesn't have yet; pick one with the developer.
  - `get_inspiration` for visual ideas; `search_logo` for a company logo the developer asked for.
  - `get_component` only for the component actually chosen — the free key allows two copies a day.
  - React web: adapt the code — every colour, size, radius, shadow, font and timing becomes a guide role; drop dependencies the project doesn't need; keep a licence notice if the author's licence asks for one; add it to the guide's Components section; run `motif check` until it reports nothing.
  - Other stacks: treat it as a picture; rebuild natively from the adapter's guidance.
- When it isn't: public component pages on 21st.dev may be read for ideas when the developer points to one; otherwise build from the adapter's component guidance and [visual craft](../knowledge/visual-craft.md). Don't collect pages in bulk (the terms forbid it).
- Connecting: `motif connect 21st` asks for the free key in the developer's own terminal.
- Rules: restyle everything; one component at a time; respect each component's licence; if a call fails or the daily limit is reached, build it from the guidance and say so once.

**`skill/sources/60fps.md`** — *60fps.design*
- Intro: 60fps.design is a library of iOS motion and interaction recordings with breakdowns; Motif uses it for motion ideas on mobile apps. It needs a separate paid MCP plan and covers iOS only.
- Is it connected? Tools whose names end with `60fps_search_shots`, `60fps_list_filters`, `60fps_get_shot`, `60fps_get_motion_breakdown`, `60fps_get_motion_code` or `60fps_get_related_shots`.
- When it's connected: `60fps_list_filters` to see the gesture, pattern and effect filters; `60fps_search_shots` for the interaction you're designing; `60fps_get_motion_breakdown` for timing, easing and order; `60fps_get_motion_code` only for SwiftUI apps (for other stacks, read it as a timing reference); `60fps_get_related_shots` for alternatives. Map what you learn onto the guide's motion roles (the nearest duration or spring); propose a guide change only if nothing fits. Limits: 2,000 calls and 250 breakdowns or code snippets a day.
- When it isn't: [motion](../knowledge/motion.md) and its pattern catalogue. Public 60fps pages may be read when the developer links one; respect anything marked Pro; never copy the library in bulk.
- Connecting: `motif connect 60fps` (paid MCP plan); then the developer signs in through their agent's MCP sign-in.
- Rules: web apps start from the motion guide (60fps is iOS only); copy no recordings or code into the project; if a call fails, use the motion guide and say so once.

**`skill/sources/supahero.md`** — *Supahero*
- Intro: Supahero is a free public gallery of landing-page hero sections (now part of ScreensDesign). It has no API or MCP server, so there is nothing to connect.
- `## When to use it`: only when building a landing or welcome page.
- `## How`: look at a few public hero pages for structure (headline length, where the main action sits, what proof appears); write down the pattern in your own words; keep links in the guide's Direction section.
- `## Rules`: its content is all rights reserved — never copy images, headlines or code; build an original hero with the guide's roles; see [anti-patterns](../knowledge/anti-patterns.md) for heroes that look generated.

- [ ] **Step 4: Record the decision**

`docs/decisions/0002-design-sources.md`:
```markdown
# 0002 — Design sources, as they really are

- Date: 2026-10-13
- Status: Accepted
- Context: spec §8 (sources and the free baseline) and §15 risk 3 (record the sources' real MCP tool names). Verified against official docs, repositories and the live MCP endpoints.

## Verified facts

| Source | MCP server | Sign-in and cost | Tools | Public pages |
|---|---|---|---|---|
| Motion | `https://mcp.motion.dev` (HTTP) | None; free. Motion+ (`https://mcp.motion.dev/plus`) is paid, OAuth | `search-motion-docs`; Motion+: `search-motion-source`, `save-transition`, `open-transition-editor` | All docs as Markdown; library MIT |
| Refero | `https://api.refero.design/mcp` (HTTP) | OAuth or bearer token; paid plans only, 8,000 calls/month | `refero_search_styles`, `refero_get_style`, `refero_search_screens`, `refero_get_screen`, `refero_get_similar_screens`, `refero_get_screen_image`, `refero_search_flows`, `refero_get_flow`, `refero_search_site`, `refero_search_app` | Terms forbid scraping; AI crawlers blocked |
| 21st.dev | `https://21st.dev/api/mcp` (HTTP) | `x-api-key` header (free key) or OAuth; free: unlimited search, 2 code copies a day | `search`, `get_component`, `get_inspiration`, `search_logo` (`generate` with AI plans); `21st_magic_*` names retired | Pages readable for AI input, not training; no bulk collection |
| 60fps.design | `https://mcp.60fps.design/mcp` (HTTP) | OAuth with a licence key; separate paid plan; iOS only, SwiftUI code | `60fps_search_shots`, `60fps_list_filters`, `60fps_get_shot`, `60fps_get_motion_breakdown`, `60fps_get_motion_code`, `60fps_get_related_shots` | Public pages readable; no bulk copying |
| Supahero | None | Free gallery | — | All rights reserved; images and taglines only |

## Decisions

1. **Detection** by tool names (the skill) and by server addresses in agent settings (`motif doctor`), from one catalog: `cli/src/sources/catalog.ts`. Agents show tool names with their own prefixes, so the skill matches the end of the name.
2. **Motion is the recommended first source**: free, no account, and it serves the library the React web adapter uses.
3. **Refero** is used only when connected. Without it, Motif relies on its presets and knowledge files and never reads Refero's pages itself.
4. **21st.dev**: search freely, fetch code only for the component chosen (free keys allow two copies a day), restyle everything.
5. **60fps.design** is for mobile motion ideas; web apps use the motion guide.
6. **Supahero** has nothing to connect; its public pages are read only when building a landing page.
7. **`motif connect`** runs `claude mcp add --transport http --scope user …` (user-level settings, nothing in the project). OAuth sources sign in inside the agent; the 21st.dev key is read with hidden input in the developer's own terminal and refused otherwise.

## Consequences

- Where §8.2 of the spec differs (Refero described as free to use, 60fps not iOS-only, old tool names), this record applies.
- Re-check these facts before each release; they change.
```

In `docs/specs/2026-10-12-motif-core-design.md`, add this line directly below the §8.2 table:
```markdown
> Verified 2026-10-13: Refero and 60fps.design need paid plans (60fps is iOS only), 21st.dev renamed its tools, and Motion has a free MCP server. Current details are in `docs/decisions/0002-design-sources.md`; where they differ from this table, the decision record applies.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/catalog.test.ts test/skill-content.test.ts`
Expected: PASS.

- [ ] **Step 6: Run everything**

Run: `cd cli && bun test --timeout 120000 && bun run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add skill/sources docs/decisions/0002-design-sources.md docs/specs/2026-10-12-motif-core-design.md cli/test/catalog.test.ts
git commit -m "feat(skill): design-source notes with verified tools, and decision 0002"
```

---

## After this plan

- **1D-2 The skill** (next plan): `SKILL.md` (entry, routing, global rules, running `motif` by its full path), `modes/design.md`, `init.md`, `feature.md`, `review.md` (including mockups before building, `motif shot --against` the mockup while building, `--save before` / `--against before` around a rebuild, and merging `design/shots/audit.json` into review reports), `adapters/_template/` and `adapters/react-web/`, and a Claude Code development plugin assembled from `skill/` (`/design`, `/init`, `/feature`, `/review`). Its files link into this plan's contract, knowledge and source notes, and the content test checks every link.
- Open question for the developer before 1D-2: whether previews may load the theme's fonts from Google Fonts (a download from the developer's browser; nothing is uploaded) so mockups show the real typefaces.
- **1E Evals** follow 1D-2.

