# Motif — Core Design (Part 1 of 4)

- **Date:** 2026-10-12
- **Status:** Draft for review
- **Owner:** 7mxd
- **Scope of this document:** Part 1 (Core + React web reference adapter). Parts 2–4 are summarised in §4 and get their own specs.

---

## 1. Summary

Motif is an open-source plugin for AI coding agents that helps any developer — beginner or expert — build web and mobile apps with polished UI, UX and motion, and keep that quality consistent as more features and more developers are added.

Its centre is a **design contract** committed to the developer's repository (`DESIGN.md` + `design/tokens.json`). Every Motif action reads it, so a feature built today by one developer matches a feature built next month by another.

Motif has three jobs, reachable through one beginner-friendly entry (`/design`) or three direct commands:

| Mode | Job |
|---|---|
| `init` | Start a new app: brief → visual directions → contract → theme, starter components, app shell and first screens |
| `feature` | Add a feature that matches the existing contract and components |
| `review` | Audit an existing app (extracting a contract if none exists), report ranked findings, rebuild what the developer approves |

Motif optionally draws on Refero, 21st.dev, 60fps.design, Motion (motion.dev) and Supahero when the developer has them connected, and works well with none of them.

## 2. Goals and non-goals

### Goals
1. Any developer can produce UI that is visibly better than an unaided agent, on any of the 8 supported stacks (after Parts 1–2).
2. Consistency across features, sessions and developers, enforced by an exact checker rather than by hope.
3. Beginner-first: one-step install, no Node.js required, no configuration, plain language, visual choices instead of open questions, never a dead end.
4. Previews before code (mockups) and proof after code (real screenshots).
5. Works fully with zero paid accounts; connected sources make it better, never required.
6. Portable across coding agents (core in the open Agent Skills format; native wrappers in Part 3).

### Non-goals (all parts)
- Backends, data layers, real authentication logic. Starter screens use clearly marked mock data.
- Generating Figma files, app-store assets or marketing images.
- Hosting anything. Motif never uploads code, screenshots or designs.
- Copying third-party content (screenshots, paid code) into Motif or into the developer's repo.

## 3. Users and success criteria

**Users:** any developer using a supported coding agent — from a beginner who has never heard of design tokens to a senior engineer who wants exact control.

**Release criteria for v1** (all four must pass before the v1 release; v1 = Parts 1–4 complete):

| ID | Test | Type | When it runs |
|---|---|---|---|
| A | Blind side-by-side: same briefs built with and without Motif across stacks; human judges pick the better result | Human | Before each release (Part 4) |
| B | Consistency: fresh agent sessions each add a different feature to a contract-governed app; zero unjustified contract violations, existing components reused | Automated agent eval | On demand, required before release |
| C | Review accuracy: `review` finds seeded issues in a deliberately flawed app | Automated agent eval | On demand, required before release |
| D | Zero accounts: B, C and a full `init` with no MCP sources connected | Automated agent eval | On demand, required before release |
| — | Tool tests (unit, snapshot, cross-OS) | Automated | Every change |

Exact pass thresholds are in §13.

## 4. Program overview

v1 is delivered as four sub-projects. Each has its own spec → plan → build cycle. v1 ships only when all four are done.

| Part | Contents | Depends on |
|---|---|---|
| **1. Core** *(this spec)* | Contract format, `/design` + three modes, knowledge base, source integrations with free fallbacks, preview kit and style gallery, the `motif` tool, React web reference adapter, tests B/C/D harness, minimal Claude Code plugin for development | — |
| 2. Stack adapters | Vue/Nuxt, Svelte/SvelteKit, Angular, React Native (Expo), Flutter, SwiftUI, Jetpack Compose — each built from the adapter template defined here | Part 1 |
| 3. Agent packaging | Build step generating native packages for Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode; installer; per-agent install smoke tests; Agent Skills baseline for all other agents | Part 1 (can overlap with Part 2) |
| 4. Release evaluation | Test A (human blind comparison) across stacks; release checklist | Parts 1–3 |

Part 1 develops and tests in Claude Code only. Everything in `skill/` must stay agent-neutral (§5.5) so Part 3 can package it unchanged.

## 5. Architecture

### 5.1 Repository layout

```
motif/
├── skill/                         ← the portable core (Agent Skills format)
│   ├── SKILL.md                   ← entry: detects mode + stack, routes, global rules
│   ├── VERSION                    ← pinned tool version (must equal release tag)
│   ├── bin/
│   │   ├── motif                  ← POSIX bootstrap script (macOS, Linux, Git Bash)
│   │   └── motif.ps1              ← Windows PowerShell bootstrap script
│   ├── modes/
│   │   ├── design.md              ← the beginner entry: "what would you like to do?"
│   │   ├── init.md
│   │   ├── feature.md
│   │   └── review.md
│   ├── contract/
│   │   ├── spec.md                ← the DESIGN.md + tokens.json format, for agents
│   │   ├── DESIGN.template.md
│   │   └── tokens.template.json
│   ├── knowledge/                 ← Motif's own written guidance (free baseline)
│   │   ├── ux-patterns/           ← one file per pattern (onboarding, sign-in, lists, …)
│   │   ├── motion.md
│   │   ├── visual-craft.md
│   │   ├── accessibility.md
│   │   └── anti-patterns.md
│   ├── sources/                   ← refero.md, 21st.md, 60fps.md, motion-dev.md, supahero.md
│   ├── presets/                   ← the built-in style gallery (8 styles)
│   │   └── <style>/               ← tokens.json, sample.html, about.md
│   ├── preview-kit/               ← frames, mock elements, vendored Motion, live-reload client
│   └── adapters/
│       ├── _template/             ← the 5-part adapter template (§11.1)
│       └── react-web/
├── cli/                           ← the motif tool (TypeScript, compiled to single binaries)
│   ├── src/
│   │   ├── commands/              ← doctor, connect, validate, tokens, check, extract, preview, shot
│   │   ├── contract/              ← tokens.json parsing, validation, contrast, spring maths
│   │   ├── detect/                ← stack + app detection for all 8 stacks
│   │   └── stacks/react-web/      ← token code generation, check rules, shot driver
│   └── test/
├── plugin/claude-code/            ← minimal Claude Code plugin used during Part 1 (replaced by Part 3 output)
├── tests/
│   ├── fixtures/                  ← sample briefs, contract-governed app, seeded-issue app
│   └── evals/                     ← runners and graders for tests B, C, D
├── docs/
│   └── specs/
├── .github/workflows/             ← tool tests (every change), release
├── LICENSE                        ← MIT
└── README.md
```

`tests/` is committed; its outputs (screenshots, logs, eval results) are git-ignored and kept as CI artifacts. Users never receive `tests/`: skill installs copy only `skill/`, and releases contain only binaries.

### 5.2 How a request flows

Example: a developer types `/feature add a checkout screen`.

1. The agent loads `skill/SKILL.md`, which routes to `modes/feature.md`.
2. The agent runs `motif doctor --json` once per session (§10.2) to learn: tool availability, detected apps and stacks, available browser, contract status.
3. It loads `adapters/<stack>/` for the detected stack (only `react-web` exists in Part 1; others get the generic path, §12).
4. It checks which design sources are connected (§8.1) and says so in one line.
5. It follows the mode's steps (§7), calling `motif` for every exact operation (validate, tokens, check, preview, shot) and using its own judgement for everything else.

### 5.3 The adapter model

Every stack adapter has two halves built from one template (§11.1):

- **Guidance half** — `skill/adapters/<stack>/`: Markdown the agent reads (how to build components, motion, platform rules on this stack).
- **Exact half** — `cli/src/stacks/<stack>/`: code the tool runs (token → theme code generation, check rules, screenshot driver).

Adding a stack = filling both halves against the template and adding its fixtures. Part 2 uses exactly this process.

### 5.4 Versioning

- One version number for the whole project (`skill/VERSION`, release tag `v<version>`, binary `--version`).
- The bootstrap scripts always run the tool version named in `skill/VERSION`, so a skill never runs a mismatched tool.
- CI fails a release if `skill/VERSION` ≠ tag.
- `tokens.json` and `DESIGN.md` carry a `motifContract` format version (starting at `1`). The tool reads older formats and `validate` offers an upgrade; it refuses newer formats with a plain message to update Motif.

### 5.5 Agent-neutrality rules for `skill/`

To stay portable (Part 3), files in `skill/` must not use agent-specific features: no hooks, no `allowed-tools`, no `context: fork`, no tool names of a specific agent. Where the skill needs an agent capability (run a shell command, show an image, ask the user a question), it describes the action in plain words ("run this command", "show this image to the developer if you can display images; otherwise give the file path and open it in the browser"). Part 3 adds per-agent tool-name notes alongside the generated packages.

## 6. The design contract

### 6.1 Files in the developer's project

```
DESIGN.md                    ← the design guide: readable by people and agents
design/
├── tokens.json              ← exact values (W3C Design Tokens format)
├── motif.json               ← project settings: apps → stacks, ignore globs
├── previews/                ← approved mockups (PNG + HTML), committed
├── reviews/                 ← review reports (Markdown + JSON), committed
├── shots/                   ← screenshots of the real app (git-ignored)
└── .progress.json           ← init/feature progress for resuming (git-ignored)
```

User-facing language calls `DESIGN.md` **"your design guide"** and tokens **"theme values"**. The words *contract* and *tokens* appear only in docs for contributors and in `--json` output.

### 6.2 `DESIGN.md` structure

The file starts with a 3–5 sentence plain-language summary ("This app feels calm and premium…"), then these sections, in this order:

1. **Brief** — what the app is, who it is for, 3–5 personality words, voice and tone.
2. **Direction** — chosen style (and preset, if any), reference links (links only, no third-party images), approved mockup paths.
3. **Foundations** — colour roles (light and dark) and what each is for; type scale; spacing; radius; elevation; iconography. Describes intent; exact values live in `tokens.json`.
4. **Motion** — duration, easing and spring roles and when to use each; what animates; enter/exit choreography; touch/press feedback; reduced-motion policy.
5. **Components** — inventory; for each: purpose, variants, required states (default, hover where applicable, pressed, focused, disabled, loading, error), do/don't.
6. **Patterns** — navigation model; forms; empty, loading and error states; feedback (toasts, inline); modal vs sheet rules.
7. **Accessibility** — contrast target (WCAG 2.2 AA), minimum target sizes, text scaling, focus, RTL support.
8. **Platform notes** — deliberate per-stack differences (e.g. native back-swipe on iOS).
9. **Do / Don't**
10. **Change log** — dated entries: what changed, why, who approved.

The front of the file carries a small YAML header: `motifContract: 1`, `name`, `updated`.

### 6.3 `design/tokens.json`

Format: **W3C Design Tokens Community Group (DTCG) Format Module, 2025.10** (stable). Colours use the DTCG object form and include the `hex` field. Motif-specific data goes under `$extensions["dev.motif"]`, which the format allows.

**Two layers:**
- `primitive.*` — raw palette and scales (e.g. `primitive.color.indigo.600`). Code must never use these directly.
- Role tokens — everything else; aliases to primitives (`"{primitive.color.indigo.600}"`). Code uses only these.

**Light/dark:** each colour role's `$value` is its light value; its dark value is in `$extensions["dev.motif"].modes.dark` (also an alias).

**Required roles** (validate fails if any is missing):

| Group | Roles |
|---|---|
| `color` | `background`, `surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`, `text-inverse`, `action-primary`, `on-action-primary`, `action-secondary`, `on-action-secondary`, `focus`, `success`, `on-success`, `warning`, `on-warning`, `danger`, `on-danger`, `info`, `on-info` |
| `font` | `display`, `title`, `heading`, `body`, `label`, `caption` (DTCG `typography` composites) |
| `space` | `0`, `1`, `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, `16` (DTCG `dimension`; default base 4px) |
| `radius` | `none`, `sm`, `md`, `lg`, `full` |
| `shadow` | `sm`, `md`, `lg` |
| `duration` | `instant`, `fast`, `base`, `slow` (DTCG `duration`) |
| `easing` | `standard`, `enter`, `exit` (DTCG `cubicBezier`) |
| `spring` | `snappy`, `smooth`, `bouncy` — each a group of `duration` (DTCG `duration`) and `bounce` (DTCG `number`, range −1 < bounce < 1) |

Projects may add roles; added roles must be documented in `DESIGN.md` §3/§4 and recorded in the change log.

**Contrast pairs:** `$extensions["dev.motif"].pairs` lists which text/on-colour roles are used on which surfaces. `validate` checks every pair in both modes.

### 6.4 Spring maths (canonical model: duration + bounce)

Springs are stored as perceptual duration `d` (seconds) and `bounce` `b`. With mass = 1:

- stiffness `k = (2π / d)²`
- for `0 ≤ b < 1`: damping `c = 4π(1 − b) / d`, damping ratio `ζ = 1 − b`
- for `−1 < b < 0`: damping `c = 4π / (d(1 + b))`, `ζ = 1 / (1 + b)`

Per-stack output: Motion `{ type: "spring", visualDuration: d, bounce: b }`; SwiftUI `.spring(duration: d, bounce: b)`; Compose `spring(dampingRatio = ζ, stiffness = k)`; Flutter `SpringDescription(mass: 1, stiffness: k, damping: c)`; Reanimated `{ stiffness: k, damping: c, mass: 1 }`. Part 1 implements the maths and the Motion output; Part 2 adapters use the same function.

### 6.5 Contract rules

1. **Roles only.** Product code references role tokens, never raw values or primitives. `motif check` enforces this.
2. **No silent new values.** `feature` and `review` never invent a value. If one is truly needed, the agent proposes a contract change (shows the diff in plain words), waits for approval, applies it, regenerates theme code and adds a change-log entry.
3. **Exceptions are explicit.** A deliberate raw value is allowed only with an inline `motif-ok: <reason>` comment; `check` reports these separately and never as violations. A reason is required.
4. **Generated files are not edited.** Theme files generated by `motif tokens` start with a "generated by Motif — edit design/tokens.json instead" header; `check` warns if they were hand-edited.

### 6.6 `design/motif.json`

```json
{
  "motifContract": 1,
  "apps": [
    { "path": ".", "stack": "react-web" }
  ],
  "ignore": ["**/vendor/**"]
}
```

`init` writes it from detection. Monorepos list several apps sharing one contract (e.g. `apps/web` → `react-web`, `apps/mobile` → `flutter`). `.gitignore` is always respected in addition to `ignore`.

## 7. Modes

### 7.1 `/design` — the beginner entry

Asks one question with three plain options — *Start a new app* · *Add a feature* · *Improve my app's look* — plus free text. If the request already makes the intent clear, it skips the question and routes directly. `/init`, `/feature` and `/review` remain for developers who want them.

### 7.2 Approval gates (⏸)

Gates are on by default. At a gate the agent shows what it proposes (mockup, diff or findings), explains it in one or two plain sentences, and waits. The developer can say "skip previews" or "don't stop for approval" at any time; the agent then proceeds and shows the results at the end. Contract changes (§6.5 rule 2) always show the diff even when gates are off, but do not wait.

### 7.3 `init`

1. **Brief.** One round of questions with multiple-choice answers and defaults; "I don't know" is always acceptable. Asks: what the app is; who it is for; platform/stack (pre-filled if detected); brand assets (logo, colours, fonts — optional); feel (choose from preset thumbnails or words); apps/sites they like (optional). Accepts a brief file instead.
2. **Scaffold.** If no project exists, create it with the adapter's official starter (React web: Next.js App Router by default; Vite + React if the developer asks for a single-page app), TypeScript, Tailwind v4. Otherwise add to the existing project.
3. **Research.** Use connected sources (§8) or `knowledge/` + presets.
4. **Directions** ⏸. Produce 2–3 clearly different directions as mockups via the preview kit: each = a style tile (colours, type, key components) + one key screen in the right frame. Shown side by side (`motif preview --compare`). The developer picks one or asks for a mix; the agent iterates until approved.
5. **Contract.** Write `DESIGN.md`, `design/tokens.json`, `design/motif.json`; run `motif validate` and fix any failures (e.g. contrast). Save approved mockups to `design/previews/`.
6. **Build.**
   a. `motif tokens` → theme code.
   b. Starter component set (§11.2 lists it for React web), every state, with motion from motion roles.
   c. App shell (navigation model from the contract) and first screens. Mobile stacks: onboarding, sign-in, home. Web stacks: welcome/landing, sign-in, home. Mock data only, clearly labelled.
7. **Verify.** `motif check` (fix all violations), project build/type-check, `motif shot --audit` of every starter screen (light and dark, mobile and desktop widths for web). Show the screenshots and a short summary.

Progress after each step is written to `design/.progress.json`. Running `/init` again in a project with unfinished progress offers to resume from the next step.

### 7.4 `feature`

1. Read `DESIGN.md`, `tokens.json`, `motif.json` and inventory existing components (adapter-specific scan). No contract → run review's *extract* step (§7.5 step 2) first, then continue.
2. Clarify what the feature does and the user's path through it (multiple choice where possible).
3. Research how real products handle the pattern (Refero flows/screens if connected; `knowledge/ux-patterns/` always).
4. **Mockup** ⏸ of every new screen/state using only the contract, via the preview kit. Include loading, empty and error states where they apply.
5. **Build**, reusing existing components first. A new component or value requires a contract change proposal ⏸ (§6.5).
6. **Verify.** `motif check` (zero violations), build/type-check, `motif shot --audit` of the new screens, compared side by side with the approved mockup; confirm required states exist. Show results.

### 7.5 `review`

1. **Scope.** Whole app, or named screens/features.
2. **Extract** (only if there is no contract). `motif extract` collects every value in use, groups near-duplicates and drafts `tokens.json`; the agent drafts `DESIGN.md` describing the *current* design, flagging inconsistencies it found ("14 greys → proposed 5 roles"). ⏸ Developer approves the draft; the agent then moves `design/tokens.draft.json` to `design/tokens.json`, runs `motif validate`, and records "contract extracted from existing code" in the change log.
3. **Audit.**
   - Exact: `motif validate`, `motif check`, `motif shot --audit` (contrast as rendered, target sizes, reduced motion).
   - Judgement: hierarchy, layout and spacing rhythm, UX flow, missing states, copy clarity, motion quality, platform conventions, anti-patterns — guided by `knowledge/` and the adapter.
4. **Report** ⏸. Written to `design/reviews/<YYYY-MM-DD>-<scope>.md` and `.json`. Findings ranked **critical / major / minor**; each has: id, severity, category, location (file:line and/or screen), one-line plain explanation of why it matters, proposed fix, screenshot where relevant. The developer selects which to fix (default suggestion: all critical + major).
5. **Rebuild.** Fix selected findings; re-run the exact checks; show before/after screenshots; mark findings fixed in the report.
6. **Redesign option.** If the developer wants a new look instead of fixes, run `init` steps 3–5 (directions → new contract), then migrate the app screen by screen, using the extract report's old→new value map, verifying each screen with check + shots.

### 7.6 Review JSON format

```json
{
  "motifReview": 1,
  "scope": "whole app",
  "date": "2026-10-12",
  "findings": [
    {
      "id": "F-001",
      "severity": "critical",
      "category": "contrast",
      "source": "exact",
      "location": { "file": "src/app/page.tsx", "line": 42, "screen": "home" },
      "summary": "Secondary text is hard to read on the card background (3.1:1, needs 4.5:1).",
      "fix": "Use text-primary on surface-raised, or darken text-secondary.",
      "status": "open"
    }
  ]
}
```

`category` ∈ `raw-value`, `contrast`, `target-size`, `reduced-motion`, `missing-state`, `hierarchy`, `spacing`, `typography`, `motion`, `navigation`, `copy`, `platform-convention`, `consistency`, `anti-pattern`, `other`. `source` ∈ `exact`, `judgement`. Test C grades against this format.

## 8. Design sources and the free baseline

### 8.1 Detection

At the start of a mode the agent checks its own available tools for each source's MCP tools (name patterns listed in each `sources/<name>.md`) and reports once, in one line: "Connected: Refero, 60fps · Optional: 21st.dev, Motion AI Kit — run `motif connect` later if you want them." It never repeats the suggestion in the same session.

### 8.2 Per-source behaviour

| Source | Used for | When connected | When not connected |
|---|---|---|---|
| Refero | directions; real screens and flows for patterns | MCP: style search (returns a `design.md` Motif adapts into its own contract format), screen and flow search | presets + `knowledge/ux-patterns/` + links/screenshots the developer provides |
| 21st.dev | component ideas and code | MCP/API: search first, fetch code only for components actually chosen (free tier: 2 copies/day). React stacks adapt the code; other stacks treat it as a visual reference and rebuild natively | free public component pages for ideas; adapter component recipes |
| 60fps.design | motion and interaction ideas | MCP: search by gesture, pattern, effect | `knowledge/motion.md` pattern catalogue |
| Motion | web animation implementation | AI Kit / MCP (Motion+ subscribers) | Motion's public documentation; the library itself is MIT and always usable |
| Supahero | hero sections for landing pages | no API | public pages, only when building a landing/welcome page |

> Verified 2026-10-13: Refero and 60fps.design need paid plans (60fps is iOS only), 21st.dev renamed its tools, and Motion has a free MCP server. Current details are in `docs/decisions/0002-design-sources.md`; where they differ from this table, the decision record applies.

### 8.3 Rules

1. **Restyle everything imported.** Any code or pattern taken from a source is rewritten to use contract roles before it lands; `check` enforces it.
2. **Copy nothing protected.** `knowledge/` and `presets/` are Motif's own original work. `DESIGN.md` stores links to references, never their images. Mockups are always original. Only public pages are fetched; nothing behind a paywall is scraped.
3. **Failures fall back silently once.** If a source errors or its quota is exhausted, the agent switches to the fallback and mentions it once.

### 8.4 Knowledge base contents (`skill/knowledge/`)

- `ux-patterns/`: onboarding, sign-in/sign-up, home/dashboard, lists and feeds, detail pages, forms and validation, search and filters, settings, checkout/payment, notifications, profile, empty/loading/error states. Each file: goal, anatomy, required states, common mistakes, mobile vs web differences.
- `motion.md`: duration and easing guidance, springs, choreography (sequence, stagger, shared elements), press/gesture feedback, page transitions, reduced motion, performance (animate transform/opacity).
- `visual-craft.md`: hierarchy, spacing rhythm, type pairing and scales, colour and contrast, density, alignment, imagery and icons.
- `accessibility.md`: WCAG 2.2 AA essentials, target sizes, focus, text scaling, screen-reader labels, RTL (logical start/end properties).
- `anti-patterns.md`: signs of generic AI-generated UI (gradient overuse, identical card grids, default shadows everywhere, centred-everything layouts, meaningless icons, emoji as UI) and what to do instead.

All files are original writing. Each stays focused enough to load on its own (target ≤ 300 lines).

## 9. Beginner experience

1. **Install in one step** per agent (Part 3 provides the native installs; Part 1: Claude Code `--plugin-dir` for development).
2. **No Node.js.** The tool is a single binary downloaded automatically on first use (§10.1). Screenshots use the browser already installed (Chrome or Edge); a browser download happens only with permission.
3. **One entry point** (`/design`) and a `doctor` command that explains, in plain words, what works and what is optional.
4. **Show, don't ask.** Multiple choice with defaults; the style gallery (8 presets) for choosing a feel; direction mockups side by side.
5. **Zero setup for sources.** Everything works unconnected; `motif connect` is an optional later upgrade.
6. **Plain language by default.** No jargon in messages to the developer; every finding has a one-line "why". "Be brief" switches explanations off for experienced developers.
7. **Never a dead end** (§12).

**Presets (v1, exactly 8):** Minimal, Soft, Playful, Editorial, Bold, Dark Tech, Warm, Trust. Each: complete valid `tokens.json`, a sample screen (`sample.html`), and `about.md` (personality words, best for, avoid for). `motif preview --gallery` shows them all.

## 10. The `motif` tool

### 10.1 Distribution

- Written in TypeScript; compiled with `bun build --compile` to single executables for `windows-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.
- Published on GitHub Releases (`7mxd/motif`, tag `v<version>`) with a `SHA256SUMS` file.
- `skill/bin/motif` (POSIX) and `skill/bin/motif.ps1` (Windows) are the only entry points the skill uses. They:
  1. read `skill/VERSION`;
  2. use `MOTIF_BIN` if set (development override);
  3. otherwise look for `~/.motif/bin/<version>/motif[.exe]`;
  4. if missing, download the matching asset and `SHA256SUMS`, verify the checksum (abort with a plain message on mismatch), mark executable, and cache it;
  5. execute it with all arguments, passing through the exit code.
- No admin rights, no global install, no PATH changes.

### 10.2 Commands

All commands: plain-language output by default; `--json` prints a single JSON object for agents and CI; exit code `0` success, `1` findings/violations present, `2` usage or environment error.

| Command | Purpose | Key behaviour |
|---|---|---|
| `motif doctor` | Environment report | Tool version; OS; detected apps and stacks (all 8 stacks detectable from Part 1); browser found; stack toolchain present (e.g. Node for web stacks); contract present/valid; configured MCP sources found in known agent config files. Each item: ✓ works / ○ optional / ✗ needed for X, with one plain sentence. |
| `motif connect [source]` | Optional source setup | Run by the developer in their own terminal (the agent prints the exact command). Detects installed agents; asks which to configure; writes that agent's MCP configuration (Part 1: Claude Code via `claude mcp add`; others in Part 3); prompts for any key with hidden input; stores keys only in user-level agent config or environment, never in the project; warns if a target file is tracked by git. |
| `motif validate` | Check the contract | Schema and DTCG validity; required roles (§6.3); alias resolution; every contrast pair in light and dark (4.5:1 text, 3:1 large text and UI components); `DESIGN.md` header and required sections present; motion values in sane ranges. Reports file + line for every problem. |
| `motif tokens [--app <path>]` | Generate theme code | Per app in `motif.json`, runs the stack's generator (§11.3). Idempotent; generated files carry the header from §6.5 rule 4. `--stack preview` produces the CSS used by the preview kit. Unsupported stack → plain CSS variables + `tokens.flat.json`. |
| `motif check [paths…]` | Find contract violations | Runs the stack's rule set (§11.5) over source files, respecting `.gitignore`, `motif.json` `ignore`, and generated headers. Reports violations, justified exceptions (`motif-ok`) separately, and hand-edited generated files. |
| `motif extract [--app <path>]` | Draft a contract from existing code | Collects literal values with the same scanners as `check`; groups colours by perceptual distance (OKLab ΔE ≤ 0.03), snaps spacing/radius to the nearest scale step (4px base), groups font sizes into a type scale, collects durations/easings; infers roles from usage context (text, background, border, button); writes `design/tokens.draft.json` and `design/extract-report.json` (old value → proposed role map, with counts and file locations). |
| `motif preview` | Render mockups | `motif preview <file.html|dir>` serves on `127.0.0.1` (random free port) with live reload, injects the contract CSS (or a preset's), opens the system browser, and writes PNGs at 2× to `design/previews/` (phone 390×844, desktop 1440×900, per frame used). `--compare a b c` shows several side by side. `--gallery` shows the presets. `--png-only` renders without opening a browser. |
| `motif shot` | Screenshot the real app | Starts the app's dev server (or uses `--url`), waits until ready, captures the given routes (`--routes`) or adapter-discovered routes, at mobile and desktop widths, light and dark, into `design/shots/`. `--audit` also measures rendered contrast and target sizes and checks reduced-motion handling, reporting findings in review JSON format (§7.6). Stops the dev server it started. |

### 10.3 Browser use

`preview` and `shot` drive Chrome or Edge already installed on the machine (headless), found via standard install locations. If none is found, they ask (in `--json`: return a `needs_browser` status the agent turns into a question) before downloading a headless Chromium into `~/.motif/browsers/`. Whether this uses `playwright-core` inside the compiled binary or a minimal Chrome DevTools Protocol client is decided by the first task of the implementation plan (§15); the requirement is fixed: no Node.js needed, system browser first.

### 10.4 Preview kit (`skill/preview-kit/`)

Plain HTML/CSS/JS, usable with or without the tool:

- **Frames:** generic iOS-style phone, generic Android-style phone, browser window, tablet. No real device images or trademarks.
- **Mock elements:** buttons, inputs, list rows, cards, top bars, tab bars, sidebars, sheets, dialogs, toasts, skeletons, empty states — all styled only through contract CSS variables.
- **Motion:** vendored Motion (MIT) so mockups show real springs and transitions using the contract's motion roles.
- **Without the tool:** the agent writes CSS variables from `tokens.json` itself and opens the HTML file directly (no PNG export, no live reload).

The agent writes only the screen content; the kit supplies everything else, so mockups are fast and consistent.

## 11. React web reference adapter

### 11.1 The adapter template (applies to every stack)

Each adapter must provide, in both halves:

| Part | Guidance half (`skill/adapters/<stack>/`) | Exact half (`cli/src/stacks/<stack>/`) |
|---|---|---|
| 0. Detect & scaffold | how the stack is recognised; official starter commands | detection rules; route/component discovery |
| 1. Tokens | how theme code is used in components | generator: `tokens.json` → native theme files |
| 2. Components | idiomatic component construction; the starter set; state handling | component inventory scanner (for `feature` step 1) |
| 3. Motion | mapping of motion roles to the stack's animation API; patterns | spring/easing output via §6.4 |
| 4. Platform rules | conventions to respect (HIG, Material, web standards), accessibility specifics | — |
| 5. Checks & shots | what `check` and `shot` catch on this stack; how to fix each finding | rule set; screenshot driver |

Plus fixtures: a minimal contract-governed app and a seeded-issue app for this stack (used by tests B/C/D).

### 11.2 React web: guidance half

- **Stack assumptions:** React 18+, TypeScript, Next.js (App Router) or Vite; Tailwind v4 or plain CSS; shadcn/ui primitives when the project already uses them (otherwise plain React + Radix primitives where accessibility needs them); Motion (`motion/react`) for animation.
- **Starter component set:** Button, IconButton, Input, Textarea, Select, Checkbox, Switch, Card, ListItem, TopBar, TabBar (mobile web) / Sidebar (desktop app layouts), Sheet, Dialog, Toast, Skeleton, EmptyState, ErrorState, Avatar, Badge. Each with all states from §6.2 item 5, keyboard and focus-visible support, and motion from motion roles.
- **Motion rules:** `MotionConfig reducedMotion="user"` at the app root; transitions only from generated motion tokens; animate transform/opacity; press feedback on interactive elements; enter/exit via `AnimatePresence`; layout animations for reordering.
- **Platform rules:** semantic HTML; logical CSS properties (RTL-ready); hover styles only for fine pointers; responsive breakpoints from the contract; `prefers-color-scheme` and `prefers-reduced-motion` honoured; visible focus on every interactive element.

### 11.3 React web: token generation

`motif tokens` writes:
- `src/styles/motif.css` — CSS custom properties for every role; light values on `:root`, dark values under `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]` (with `[data-theme="light"]` forcing light).
- Tailwind v4 projects: an `@theme` block mapping utilities to roles (e.g. `bg-action-primary`, `p-4` → `space.4`, `rounded-md`, `shadow-md`, `font-body`) and resetting Tailwind's default colour palette so only roles exist.
- `src/design/motion.ts` — typed exports for durations, easings and springs in Motion's format.

Paths follow the project's existing source root (`src/` or `app/`), recorded in `motif.json`.

### 11.4 React web: starter screens

Welcome/landing, sign-in, home (dashboard or feed, chosen from the brief), wired into the app shell, with mock data in one clearly named file.

### 11.5 React web: `check` rules

| Rule | Catches |
|---|---|
| `raw-color` | hex, `rgb()`, `hsl()`, `oklch()`, named colours (except `transparent`, `currentColor`, `inherit`) in TS/TSX/JS/JSX/CSS/SCSS outside generated files |
| `tailwind-arbitrary` | arbitrary values for colour, spacing, radius, shadow, font size (`bg-[#…]`, `p-[13px]`) |
| `tailwind-palette` | Tailwind default palette classes (`bg-blue-500`) not mapped to roles |
| `off-scale` | px/rem spacing, radius and font-size literals not on the contract scale |
| `raw-font` | font-family literals not from tokens |
| `raw-motion` | literal durations/easings in CSS transitions/animations and in Motion `transition` props |
| `primitive-use` | references to `primitive.*` tokens in product code |
| `reduced-motion` | app root without `MotionConfig reducedMotion="user"` or an equivalent global CSS rule while animations exist |
| `generated-edited` | generated files whose content no longer matches the generator output |

`shot --audit` adds, at runtime: rendered text contrast (axe-core), target size (critical below 24×24 CSS px — fails WCAG 2.2 AA; minor below 44×44 at mobile widths), and motion still running under emulated `prefers-reduced-motion: reduce`.

## 12. When things go wrong

| Situation | Behaviour |
|---|---|
| Tool can't download (offline, firewall, checksum mismatch) | Continue without exact steps: preview kit opened directly (§10.4), review uses judgement + `knowledge/` only. Say so once; suggest `motif doctor` when back online. |
| No browser found | Ask before downloading one; if declined, skip screenshots and PNG export, keep HTML previews. |
| Stack toolchain missing (e.g. Node for a web stack) | Explain in one sentence what's missing and what it affects; skip only that step. |
| Source error or quota exhausted | Fall back (§8.3 rule 3). |
| Broken `DESIGN.md`/`tokens.json` | `validate` points to the exact line; agent offers to fix. |
| Code drifted from contract | `check` reports; `review` fixes. |
| Stack outside the eight / adapter not yet built | Contract, modes and guidance still work; `tokens` emits CSS variables + flat JSON; agent says the stack is not fully supported yet and hand-maps values. |
| Multiple apps (e.g. web + mobile) | One contract at the root; `motif.json` maps apps → stacks; each app uses its own adapter. |
| Interrupted `init` or `feature` | Resume from `design/.progress.json`. |
| Newer contract format than the tool understands | Refuse to edit; plain message to update Motif. |

## 13. Testing

### 13.1 Tool tests (every change, CI matrix: Windows, macOS, Linux)
- Unit: DTCG parsing and alias resolution; required-role validation; contrast maths (against known WCAG examples); spring maths (against reference values for SwiftUI/Motion conversion); OKLab clustering; scale snapping.
- Snapshot: React web generator output for every preset.
- Rule tests: each `check` rule has positive fixtures (must flag) and negative fixtures (must not flag); clean fixture app must produce zero findings.
- Integration: compiled binary runs `doctor`, `validate`, `tokens`, `check`, `extract` on fixtures; `preview --png-only` and `shot` on the fixture app with a CI browser.
- Bootstrap scripts: download, checksum verification (including a tampered-file case), cache reuse, `MOTIF_BIN` override.

### 13.2 Agent evals (on demand, required before release)

Run through Claude Code's headless mode with the Part 1 plugin loaded and gates switched off by instruction.

- **Test B — consistency.** Fixture: `tests/fixtures/react-contract-app` (Next.js + Tailwind v4, full contract, starter components, 3 screens). Five feature tasks, each in a fresh session: settings screen; search with empty state; profile edit form with validation; notifications list; checkout summary. **Pass:** for every task, `motif check` reports zero violations (justified `motif-ok` exceptions allowed, max 2 per task), the project builds and type-checks, and at most one new component is created per task unless recorded as a contract change.
- **Test C — review accuracy.** Fixture: `tests/fixtures/react-seeded-app` with `seeded-issues.json` (≥ 20 issues: ≥ 12 exact-detectable, ≥ 8 judgement). Run `review` in report-only mode. Grader matches findings to seeded issues by category + location (exact issues: deterministic; judgement issues: model grader with a written rubric). **Pass:** recall ≥ 90% for exact issues, ≥ 70% for judgement issues; ≤ 10% of critical/major findings are false.
- **Test D — zero accounts.** Run B and C with no MCP servers configured, plus `init` from each of 3 brief fixtures (`tests/fixtures/briefs/`). **Pass for init:** `validate` and `check` clean, project builds, all starter screens exist and render in `shot`, `DESIGN.md` has all sections.
- Eval runs use the developer's signed-in Claude Code, never an API key, run only when the developer starts them, and are capped per case ([decision 0003](../decisions/0003-evals-on-your-plan.md)). CI runs only the runner's own tests.

### 13.3 Test A
Defined and run in Part 4.

## 14. Security and privacy

- Downloaded binaries are verified against `SHA256SUMS` from the same release; mismatch aborts.
- `preview` binds to `127.0.0.1` only.
- No telemetry. Nothing is uploaded.
- API keys never enter the project or the chat: `motif connect` prompts in the developer's own terminal with hidden input.
- Fetching is limited to public pages of the listed sources and official docs.

## 15. Risks to resolve at the start of implementation

1. **Screenshots from a single binary.** First plan task: a spike proving headless Chrome/Edge control from a `bun --compile` binary on Windows, macOS and Linux (try `playwright-core`; fall back to a minimal CDP client). The requirement in §10.3 does not change.
2. **DTCG 2025.10 exact value shapes.** Verify colour, dimension, duration and typography value formats against the published spec before writing `validate`.
3. **MCP tool names of each source.** Record the actual tool names exposed by Refero, 21st.dev, 60fps and Motion MCP servers in `sources/*.md`; detection patterns depend on them.
4. **21st.dev licence terms** for code copied into projects — confirm and state in `sources/21st.md`.

## 16. Out of scope for Part 1

- Adapters other than React web (Part 2). `doctor` still detects all 8 stacks.
- Native packages for agents other than Claude Code, the build step and installer (Part 3).
- Test A (Part 4).
- Tailwind v3 theme generation (v3 projects get CSS variables and guidance).
