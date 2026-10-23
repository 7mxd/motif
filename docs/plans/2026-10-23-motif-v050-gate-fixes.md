# v0.5.0 gate fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two problems the v0.5.0 simulator check found on HiSalon's Flutter app before v0.5.0 is tagged.

**Architecture:** One shared helper works out, per theme (the base and each variant) and mode, a readable version of the action colour. Each native generator uses it only where the platform draws the action colour as text, and only when the guide's own `action-primary` doesn't read; otherwise its output is byte-identical. Separately, extract drafts a see-through role colour as it shows over the background, as it already does for see-through palette fields.

**Tech Stack:** Bun/TypeScript CLI (`cli/`), the stack guides (`skill/adapters/`), Flutter, Jetpack Compose and SwiftUI generators.

**Spec:** docs/specs/2026-10-19-motif-part2-all-stacks-design.md (§6 theme code, §11 delivery). Source: the simulator check of 2026-10-23 on a scratch copy of HiSalon (`19407123`), with Motif main `a370253`: HiSalon's drafted guide has `action-primary` #7EEBC1 (mint) on a #F7F9F8 page, about 1.4:1. Flutter's `TextButton` (the update card's "Later") drew mint text on white. Card and segmented-button outlines were near-black, because `border` was drafted as solid #0F3C32 from HiSalon's `#0f3c3214`.

## Global Constraints

- Generated files change only for guides whose `action-primary` fails 4.5:1 as text on `background` (or on `surface`, when the guide has it) in some mode or variant. Every other guide's generated output stays byte-identical on every stack; the existing golden and snapshot tests must pass unchanged.
- Web (React web, plain web) and React Native theme code don't change: they don't draw the action colour as text by default.
- The readable colour keeps the action colour's hue and chroma: darkened (or lightened, on a dark page) in OKLCH in small steps until it reaches 4.5:1 on `background` and `surface`. When no lightness gets there, it's `text-primary`.
- Messages are plain words in Motif's voice. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on branch `fix/v050-gate` in the worktree `C:/Users/PC/GitHub/motif-gate`. Push only that branch.

## Review Focus

- A guide whose action colour reads in light mode but not in dark (a deep blue on a near-black page): only dark gets the readable colour.
- A guide with variants where only one variant's action colour is light: that variant alone changes; the rest keep `action-primary`.
- A guide without `surface`, or without `action-primary`: no crash, no change.
- Extract on an app whose see-through colour is the only text colour, or a see-through `background` itself: the draft still validates, and a see-through background isn't composited over itself.
- The readable colour's own text (Compose's `onPrimary`) reads on it at 4.5:1.

---

### Task 1: The readable action colour, and Flutter's text and outlined buttons

**Files:** Create `cli/src/generate/readable-action.ts`; modify `cli/src/stacks/flutter/generate.ts` and `skill/adapters/flutter/tokens.md`. Tests: `cli/test/readable-action.test.ts`, `cli/test/flutter-generate.test.ts`.

**Interfaces (produced):**
- `readableAction(set: ThemeSet): ReadableAction | null`: null when `action-primary` reads (≥4.5:1 on `background`, and on `surface` when present) in both modes of the base theme and every variant, or when the guide has no `action-primary` or `background`.
- `interface ReadableAction { base: ModePair; variants: Record<string, ModePair> }` with `interface ModePair { light: { text: string; onText: string }; dark: { text: string; onText: string } }`, each colour as uppercase `#RRGGBB`. `text` is the readable action colour (equal to `action-primary` where that already reads); `onText` is the first of `on-action-primary`, `text-inverse`, `background`, `text-primary` that reads on `text` at 4.5:1, else whichever of `#FFFFFF` and `#000000` reads better.

- [ ] Tests for `readableAction`: HiSalon's values (#7EEBC1 on #F7F9F8 and #FFFFFF) give a darker green with the same hue (±2°) at ≥4.5:1 on both; a guide whose action colour reads gives null; dark mode only; one variant only; no `surface`; `onText` ≥4.5:1 on `text`.
- [ ] Flutter: when `readableAction` isn't null, `MotifColors` gains `actionText` (light, dark and per variant, with a doc comment saying it's the action colour for text, readable on the background), and `textButtonTheme` and `outlinedButtonTheme` set `foregroundColor: colors.actionText` beside their shape. `ColorScheme.primary` stays `action-primary`, so filled buttons keep the brand fill. Test with a HiSalon-shaped guide; the generated Dart passes the existing analyze test (`flutter-compile.test.ts`, needs Flutter). Every existing Flutter golden stays unchanged.
- [ ] The Flutter guide's tokens page says when `actionText` exists and what uses it.
- [ ] Commit: `fix(tokens): a light action colour gets a readable version for Flutter's text and outlined buttons`.

### Task 2: Compose

**Files:** `cli/src/stacks/compose/generate.ts`, `skill/adapters/compose/tokens.md`. Tests: `cli/test/compose-generate.test.ts`.

- [ ] When `readableAction` isn't null: `MotifColors` gains `actionText`; Material's `primary` is `actionText` and `onPrimary` the `onText` colour, while `primaryContainer`, `onPrimaryContainer` and `inversePrimary` stay `action-primary` and `on-action-primary`. So `TextButton`, `OutlinedButton`, checkboxes and switches read on the page; the guide's own button (which sets `containerColor = colors.actionPrimary`) keeps the brand fill. Per variant and mode. Byte-identical otherwise. The generated Kotlin passes the existing compile test (needs a JDK and the Android SDK).
- [ ] The Compose guide's tokens table says `primary` is `actionText` when the guide's action colour is too light for text, and that a plain Material `Button` then fills with it.
- [ ] Commit: `fix(tokens): Compose's primary is a readable version of a light action colour, the fill stays the brand's`.

### Task 3: SwiftUI

**Files:** `cli/src/stacks/swiftui/generate.ts`, `skill/adapters/swiftui/tokens.md`. Tests: `cli/test/swiftui-generate.test.ts`.

- [ ] When `readableAction` isn't null: `MotifColors` gains `actionText`, and `.motifTheme()` tints with `actionText` instead of `actionPrimary`, so borderless buttons, links and toolbar buttons read. Per variant and mode. Byte-identical otherwise. The generated Swift passes the existing typecheck test (`swiftui-compile.test.ts`, needs a Mac with Xcode; CI's `swiftui` job runs it).
- [ ] The SwiftUI guide's tokens page says so, and that `.borderedProminent` then fills with `actionText`; for the brand fill, use the guide's button (which draws `actionPrimary`).
- [ ] Commit: `fix(tokens): SwiftUI's tint is a readable version of a light action colour`.

### Task 4: A see-through role colour is drafted as it shows

**Files:** `cli/src/extract/draft.ts`. Tests: `cli/test/extract-*.test.ts` (the shared draft tests and one per stack where a see-through colour occurs).

- [ ] A role (other than `background`) whose chosen colour is see-through (alpha < 1) is drafted as that colour laid over the drafted background, in light and dark and in each variant over theirs, as see-through palette fields already are; its note says so in the palette-field note's words ("…which is see-through (#0f3c3214): drafted as #E4EAE7, how it shows over the background…"). HiSalon's case is the test: `border` from `#0f3c3214` over #F7F9F8 is a light grey-green, not #0F3C32.
- [ ] List every fixture whose draft changes, and why, in the report; the rest stay byte-identical.
- [ ] Commit: `fix(extract): a see-through role colour is drafted as it shows over the background, not as its solid colour`.

### Task 5: Notes

**Files:** `docs/releases/v0.5.0.md`.

- [ ] Under "Every stack", one line each: theme code gives a light action colour a readable version where the platform draws it as text (Flutter's text and outlined buttons, Compose's `primary`, SwiftUI's tint), and extract drafts a see-through colour as it shows over the background.
- [ ] Commit: `docs(release): v0.5.0 notes name the gate fixes`.
