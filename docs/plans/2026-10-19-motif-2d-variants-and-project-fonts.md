# Motif 2D — Design variants and project fonts (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A design guide can declare named variants (alternative palettes such as a salon app's women's and men's looks) and fonts the project bundles itself; every command and the skill handle both, on React web and plain web.

**Architecture:** A variant is a *view* of the token document: `variantView(doc, id)` returns a document whose roles carry that variant's values in `$value` and `modes.dark`, so contrast checks, alias resolution and `buildTheme` run unchanged on it. Generators emit the default theme as today plus, per other variant, only the values that differ, keyed by `data-variant` on the page. Project fonts are a list of families with font files in the repository, served to mockups by the preview server.

**Tech Stack:** TypeScript on Bun (`cli/`), Markdown skill files (`skill/`), `bun test`.

**Spec:** `docs/specs/2026-10-19-motif-part2-all-stacks-design.md` §5 (and §4's parity checklist for React web and plain web).

## Global Constraints

- A guide with no variants block and no project fonts must validate, generate and render exactly as before (byte-identical generated files). Every task's tests include this case.
- Variant ids: kebab-case, `^[a-z][a-z0-9-]*$`. Exactly one variant is the default.
- The default variant's values are the role's `$value` and `modes.dark`; only non-default variants appear in a role's `variants` extension.
- On the web, the variant is chosen with `data-variant="<id>"` on the same element as `data-theme` (the `<html>` element), combined with `data-theme` and the system dark setting.
- File names: a variant's PNG adds `+<id>` after the name (and after `@<state>`), before the size or `.dark`: `home+men.png`, `home+men.dark.png`, `index@sent+men.mobile.dark.png`. The default variant adds nothing.
- Messages are plain words, like the existing ones ("In the men variant, dark mode: …").
- Format shapes (copy exactly):
  - Root: `"$extensions": { "dev.motif": { "variants": [ { "id": "women", "label": "Women", "default": true }, { "id": "men", "label": "Men" } ] } }`
  - Role: `"$extensions": { "dev.motif": { "modes": { "dark": "…" }, "variants": { "men": { "value": "{primitive.color.teal-600}", "dark": "{primitive.color.teal-300}" } } } }` (colour roles need `value` and `dark`; other roles take `value` only)
  - Root: `"$extensions": { "dev.motif": { "fonts": [ { "family": "Thmanyah Sans", "files": [ { "path": "assets/fonts/ThmanyahSans-Regular.woff2", "weight": 400, "style": "normal" } ] } ] } }` (paths relative to the folder that holds `design/`)
- Font files are served only from inside the project (the preview server's existing rule).

## Review Focus

- **A variant overriding a role that the default aliases** (`surface-raised: {color.surface}`, and `surface` changes in the men variant): `surface-raised` must follow in that variant. Test in Task 1.
- **`data-variant` set and the system in dark mode, with no `data-theme`:** the variant's dark values must win. Test in Task 4 (CSS selector specificity, asserted on the exact output).
- **A project font file path pointing outside the project (`../x.woff2`) or to a missing file:** reported by `validate`, never served. Test in Task 3 and Task 5.
- **`--variant men` on a guide without variants, or `--variant nope`:** a plain-words refusal listing the variants, before anything renders. Tests in Task 5 and Task 6.
- **An old guide with no variants:** `motif tokens` output byte-identical to before. Test in Task 4 (snapshot comparison against the current output).

---

### Task 1: The variants format and the variant view

**Files:**
- Create: `cli/src/contract/variants.ts`
- Test: `cli/test/variants.test.ts`

**Interfaces:**
- Produces:
  - `export interface VariantInfo { id: string; label: string }`
  - `export function readVariants(doc: TokenDocument): { variants: VariantInfo[]; defaultId: string | null; findings: Finding[] }` — no block: `{ variants: [], defaultId: null, findings: [] }`; the default is listed first in `variants`.
  - `export function variantView(doc: TokenDocument, id: string): TokenDocument` — `id === defaultId` (or no variants) returns `doc` itself; otherwise a new document (same `file`, `rootExtensions`) whose tokens with a `variants[id]` entry have `value` and `extensions["dev.motif"].modes.dark` replaced by that entry's `value` and `dark` (a non-colour entry replaces `value` only).
  - `export function checkVariants(doc: TokenDocument): Finding[]` — format problems only.

- [ ] **Step 1: Write the failing tests** in `cli/test/variants.test.ts`, building documents with the existing `docFrom(validTokens())` helper (`cli/test/helpers.ts`) and adding the extensions:
  - `readVariants` on the fixture guide → `{ variants: [], defaultId: null, findings: [] }`.
  - With `[{id:"women",label:"Women",default:true},{id:"men",label:"Men"}]` → `defaultId: "women"`, ids `["women","men"]`.
  - `variantView(doc, "men")` where `color.surface` has `variants.men = { value: "#123456", dark: "#654321" }` → `resolveMode(view, "color.surface", "light").value` is that colour, `"dark"` the dark one, and `color.surface-raised` (aliased to `{color.surface}` in the test document) resolves to the same colours in the view.
  - `variantView(doc, "women")` returns the same object (`toBe(doc)`).
  - `checkVariants` findings, one test each, asserting `code`: `bad-variant-id` (`"Men"`), `no-default-variant` (none marked), `several-default-variants` (two marked), `unknown-variant` (a role mentions `kids`, not declared), `empty-variant` (declared non-default variant no role mentions; severity `warning`), `variant-missing-dark` (colour role entry with `value` but no `dark`), `bad-value` (an entry's value isn't valid for the role's type; message includes `(men)`).

- [ ] **Step 2: Run** `cd cli && bun test test/variants.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement `cli/src/contract/variants.ts`.** Read `rootExtensions["dev.motif"].variants`; validate entries with `resolveValue`/`validateValue` from `resolve.ts`/`values.ts`. `variantView` copies the `tokens` map, cloning only changed tokens.

- [ ] **Step 4: Run** the test file — expect PASS. Also `bun test test/resolve.test.ts test/contrast.test.ts` stay green.

- [ ] **Step 5: Commit** `feat(contract): design variants — the format, and a document seen through one variant`.

### Task 2: `motif validate` checks every variant, and DESIGN.md's Variants section

**Files:**
- Modify: `cli/src/contract/contrast.ts`, `cli/src/commands/validate.ts`, `cli/src/contract/design-md.ts`
- Test: `cli/test/validate.test.ts`, `cli/test/design-md.test.ts`

**Interfaces:**
- Consumes: Task 1's `readVariants`, `variantView`, `checkVariants`.
- Produces:
  - `export function checkContrastAll(doc: TokenDocument): { findings: Finding[]; checked: number }` in `contrast.ts` — runs `checkContrast` on each variant's view; with variants, each message is prefixed `In the <label> variant, ` and keeps the rest (`"…, dark mode: …"` wording: change `In ${mode} mode` to `${mode} mode` after the prefix); `checked` = pairs × 2 × variant count (× 1 with no variants); each finding gets `variant: <id>` (add `variant?: string` to `Finding` in `cli/src/findings.ts`).
  - `checkDesignMd(file: string, text: string, opts?: { variants?: VariantInfo[] }): Finding[]` — with variants: `missing-section` error "Your design guide is missing the "Variants" section, which says what each variant is for." when no `## Variants` heading; a `warning` `variant-not-described` per variant whose id and label both don't appear in that section. The Variants section is optional when there are no variants and never affects the section-order check.

- [ ] **Step 1: Write the failing tests.**
  - `validate.test.ts`: "checks readability in every variant, light and dark" — a guide (temp project via `makeProject`) whose men variant gives `text-secondary` a colour at 3.9:1 on `surface` in dark → exit 1, a finding with `variant: "men"` and message starting `In the Men variant, dark mode:`; the summary's `contrastChecks` = pairs × 4.
  - `validate.test.ts`: "a guide without variants reads exactly as before" — the fixture guide's text output equals today's (`✓ Your design guide is valid — … readability checks (light + dark) passed.`).
  - `validate.test.ts`: `--tokens` on a direction file with variants runs the same checks.
  - `design-md.test.ts`: the missing-section error and the `variant-not-described` warning, and no new finding for the fixture DESIGN.md.

- [ ] **Step 2: Run** them — expect FAIL.

- [ ] **Step 3: Implement.** `runValidate` and `validateTokensFile` call `checkVariants(doc)` and `checkContrastAll(doc)` instead of `checkContrast(doc)`, and pass `readVariants(doc).variants` to `checkDesignMd`. The success line says `(light + dark, N variants)` only when there are variants.

- [ ] **Step 4: Run** `bun test test/validate.test.ts test/design-md.test.ts test/contrast.test.ts` — PASS.

- [ ] **Step 5: Commit** `feat(validate): readability in every variant; DESIGN.md says what each variant is for`.

### Task 3: Project fonts in the guide

**Files:**
- Create: `cli/src/contract/fonts.ts`
- Modify: `cli/src/commands/validate.ts`
- Test: `cli/test/project-fonts.test.ts`

**Interfaces:**
- Produces:
  - `export interface ProjectFontFile { path: string; weight: number; style: "normal" | "italic" }`
  - `export interface ProjectFont { family: string; files: ProjectFontFile[] }`
  - `export function readProjectFonts(doc: TokenDocument): { fonts: ProjectFont[]; findings: Finding[] }` — format problems: `bad-project-font` (no family, no files, weight not 100–900, style not normal/italic, path absolute).
  - `export function checkProjectFontFiles(root: string, fonts: ProjectFont[]): Finding[]` — `missing-font-file` when a path doesn't exist; `font-outside-project` when it resolves outside `root`; `font-not-used` warning when the family isn't named in any type role.

- [ ] **Step 1: Write the failing tests:** each finding above, one test each; a valid entry with an existing `.woff2` in a temp project → no findings; `motif validate` on that project reports `missing-font-file` with the path.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**, and call both from `runValidate` (root = `cwd`) and `validateTokensFile` (root = `cwd`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(contract): fonts the project bundles itself, checked to exist inside the project`.

### Task 4: Theme code with variants (React web, plain web, flat tokens, preview CSS)

**Files:**
- Modify: `cli/src/generate/theme.ts`, `cli/src/generate/motif-css.ts`, `cli/src/generate/preview-css.ts`, `cli/src/generate/fallback.ts`, `cli/src/generate/theme-fonts.ts`, `cli/src/commands/tokens.ts`
- Test: `cli/test/theme.test.ts`, `cli/test/tokens-command.test.ts`, `cli/test/tokens-plain.test.ts`, `cli/test/preview-css.test.ts`, `cli/test/fallback.test.ts`, `cli/test/theme-fonts.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces:
  - `export interface ThemeVariant { id: string; label: string; theme: Theme }`
  - `export interface ThemeSet { base: Theme; defaultId: string | null; variants: ThemeVariant[] }` — `variants` holds the non-default variants only.
  - `export function buildThemeSet(doc: TokenDocument): ThemeSet` in `theme.ts` (`base = buildTheme(doc)`; each variant `buildTheme(variantView(doc, id))`).
  - `Theme` gains `projectFonts: ProjectFont[]` (filled by `buildTheme` from `readProjectFonts`; `[]` when none).
  - `motifCss(theme: Theme, variants: ThemeVariant[] = []): string` — after the existing dark block and before the reduced-motion block, for each variant with any differing value:

    ```css
    :root[data-variant="men"] {
      <light colours and non-colour values that differ from the base>
    }

    @media (prefers-color-scheme: dark) {
      :root[data-variant="men"]:not([data-theme="light"]) {
        <dark colours that differ from the base's dark>
      }
    }

    :root[data-variant="men"][data-theme="dark"] {
      <dark colours that differ from the base's dark>
    }
    ```
  - `previewCss(theme, fontCssUrl?, variants: ThemeVariant[] = [])` passes `variants` to `motifCss`.
  - `flatTokens(theme, variants: ThemeVariant[] = [])` adds `"variants": { "<id>": <flatTokens(variant.theme)> }` only when `variants` isn't empty.
  - `ThemeFontUse.source` gains `"project"`: a family listed in `theme.projectFonts` is `project` (never fetched from Google).

- [ ] **Step 1: Write the failing tests.**
  - `theme.test.ts`: `buildThemeSet` on a two-variant document → `variants[0].id === "men"`, its `surface` colour is the override, base unchanged.
  - `preview-css.test.ts` (or a new `motif-css` test in it): exact output of the three variant blocks for a one-colour difference, including selectors; no variant blocks when nothing differs; **byte-identical output for the fixture guide versus `motifCss(theme)` today** (compare with the existing snapshot in `cli/test/__snapshots__`).
  - `tokens-command.test.ts` and `tokens-plain.test.ts`: a React app and a plain site with a two-variant guide → `src/styles/motif.css` / `<site>/motif.css` contain `:root[data-variant="men"]`; `design/generated/tokens.flat.json` has `variants.men`.
  - `theme-fonts.test.ts`: a family in `projectFonts` is `source: "project"`, and `fontStylesheets` doesn't return a Google URL for it.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; `runTokens` builds a `ThemeSet` once and passes `variants` to every writer (React web's `motif.css`, plain web's `motif.css`, `design/previews/motif.css`, `tokens.flat.json`). The Tailwind theme needs no change (it reads the CSS variables).
- [ ] **Step 4: Run** `bun test test/theme.test.ts test/preview-css.test.ts test/tokens-command.test.ts test/tokens-plain.test.ts test/fallback.test.ts test/theme-fonts.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(tokens): every variant in the generated CSS and flat tokens; project fonts are never fetched`.

### Task 5: Previews — project fonts, and `--variant`

**Files:**
- Modify: `cli/src/preview/server.ts`, `cli/src/preview/render.ts`, `cli/src/commands/preview.ts`, `cli/src/cli/` (the command's flag list and help, where `preview`'s flags are declared)
- Test: `cli/test/preview-server.test.ts`, `cli/test/preview-command.test.ts`, `cli/test/preview-e2e.test.ts`

**Interfaces:**
- Consumes: Task 4's `ThemeSet`, `projectFonts`.
- Produces:
  - Preview server: `GET /__motif/project-fonts.css` returns `@font-face` rules for every project font file (`url("/__motif/project-font/<n>")`, `font-weight`, `font-style`); `GET /__motif/project-font/<n>` serves file n (index into the flattened file list) only if it's inside the project, else 404. `injectKit` links `project-fonts.css` when there are project fonts. `startPreviewServer` takes `themeSet?: ThemeSet` (keeps `theme` for directions).
  - `RenderTarget` gains `variant?: string`; `renderPngs` sets `document.documentElement.dataset.variant` before each capture when given.
  - `pngName(name, index, scheme, state?, variant?)` adds `+<variant>` per the Global Constraints.
  - `motif preview --variant <id|all>`: unknown id or a guide without variants → exit 2, `error: "no-such-variant"`, text listing the variants ("This design guide has no variants." when none). `all` renders the default and each variant.

- [ ] **Step 1: Write the failing tests.**
  - `preview-server.test.ts`: `project-fonts.css` lists one `@font-face` per file; a file outside the project → 404; no project fonts → 404 for the CSS.
  - `preview-command.test.ts` (fake deps, as the existing tests do): `--variant men` → targets carry `variant: "men"` and PNG names `home+men.png`; `--variant all` → default and men targets; `--variant nope` → exit 2 `no-such-variant` and no render.
  - `preview-e2e.test.ts` (needs a browser, existing skip pattern): a mockup with a variant renders a different pixel colour at a known point in `home+men.png` than in `home.png`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Project fonts count as loaded in the missing-font check (`render.ts` treats `source: "project"` like `bundled`).
- [ ] **Step 4: Run** the three files — PASS.
- [ ] **Step 5: Commit** `feat(preview): mockups in each variant, with the project's own fonts`.

### Task 6: Screenshots — `--variant`, and audits in every variant

**Files:**
- Modify: `cli/src/shot/capture.ts`, `cli/src/shot/compare.ts`, `cli/src/shot/audit.ts`, `cli/src/commands/shot.ts`, the `shot` flag list in `cli/src/cli/`
- Test: `cli/test/shot-command.test.ts`, `cli/test/compare.test.ts`, `cli/test/shot-e2e.test.ts`

**Interfaces:**
- Consumes: Task 1's `readVariants` (the guide's variants, read by the command from `design/tokens.json`).
- Produces:
  - `CaptureOptions.variants?: string[]` — each page is captured once per entry (after the default, which is always captured); the harness sets `document.documentElement.dataset.variant` after load and before states run.
  - `shotName(slug, viewport, scheme, variant?)` adds `+<variant>`.
  - Audit findings' `location` gains `variant?: string`; `audit.json` groups repeats across variants like it does across sizes.
  - `motif shot --variant <id|all>` (same refusal as preview); `--audit` with no `--variant` covers every variant of the guide.
  - `--against`: a variant shot is compared with the mockup PNG or saved shot of the same variant (`home+men.png`); falls back to the default's when the variant has none, and says so.

- [ ] **Step 1: Write the failing tests:** names (`index@sent+men.mobile.dark.png`), the capture loop with fake browser deps, audit coverage of all variants, the refusal, and compare pairing with and without a variant mockup.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test test/shot-command.test.ts test/compare.test.ts test/shot-e2e.test.ts test/shot-state.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(shot): screenshots and audits in every variant`.

### Task 7: `check` and `extract` know variants

**Files:**
- Modify: `cli/src/check/dark.ts` (add variant ranges beside dark ranges), `cli/src/check/rules/colors.ts`, `cli/src/check/suggest.ts`, `cli/src/check/run.ts`, `cli/src/extract/draft.ts`, `cli/src/commands/extract.ts`
- Test: `cli/test/rule-colors.test.ts`, `cli/test/check-command.test.ts`, `cli/test/extract-plain.test.ts`, `cli/test/extract-draft.test.ts`

**Interfaces:**
- Produces:
  - `export function variantRanges(css: string): { id: string; range: [number, number] }[]` — blocks whose selector sets an attribute value or class on the root or body (`[data-variant="men"]`, `[data-gender="male"]`, `.theme-men`, `html.men`) and redefines custom properties; the id is the attribute value or class without `theme-`.
  - Colour hits gain `variant?: string`.
  - `suggestRole(hit, theme, opts)` gets the `ThemeSet` (via `opts.variants`) and, for a hit with a variant, matches against that variant's colours; the fix hint names the variant ("This is the Men variant's action-primary: use var(--motif-color-action-primary) and set data-variant=\"men\".").
  - `Variable` (extract) gains `variants?: Record<string, { light?: string; dark?: string }>`; `buildDraft` writes declared variants (first found = the `:root` palette = default, labelled "Default") and per-role `variants` entries in the draft, and the report lists them.

- [ ] **Step 1: Write the failing tests:**
  - `rule-colors.test.ts`: a hex inside `[data-gender="male"] { --accent: #0e5c4d }` → hit with `variant: "male"`.
  - `check-command.test.ts`: the hint text for that hit, against a guide with a `male` variant whose action-primary is `#0E5C4D`.
  - `extract-plain.test.ts`: a site with `:root { --accent: … }` and `[data-gender="female"] { --accent: …; --bg: … }` and `[data-gender="male"] { … }` → the draft declares variants `default`, `female`, `male` and gives the accent's role a `variants` entry for each; a site with no such blocks drafts exactly as before.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test test/rule-colors.test.ts test/check-command.test.ts test/extract-plain.test.ts test/extract-draft.test.ts test/extract-command.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(check, extract): colours set in a variant's block are read as that variant's`.

### Task 8: The skill — format, research step, stack guides

**Files:**
- Modify: `skill/contract/spec.md` (Variants and Project fonts subsections under `## tokens.json`, and the Variants section under `## DESIGN.md`), `skill/contract/DESIGN.template.md` (an optional `## Variants` section after `## 3. Foundations`, with an HTML comment saying to delete it when there are no variants), `skill/modes/init.md` and `skill/modes/design.md` (when a variant is asked for: the research step and a ⏸ gate), `skill/modes/review.md` (screenshots and findings per variant), `skill/modes/feature.md` (new screens in every variant), `skill/adapters/react-web/tokens.md` and `skill/adapters/plain-web/tokens.md` (setting `data-variant`; project fonts with `@font-face`)
- Create: `skill/knowledge/variants.md`
- Test: `cli/test/skill-modes.test.ts`, `cli/test/skill-content.test.ts`

**Content the tests pin (exact strings):**
- `spec.md`: `"variants"`, `"default": true`, `"fonts"`, `data-variant`.
- `knowledge/variants.md` headings: `## When a variant is worth it`, `## What to vary`, `## What never varies`, `## Audience variants without stereotypes`, `## Checking every variant`; links to `../contract/spec.md`.
- `init.md` and `design.md`: in this order, `variant`, `research`, `⏸`, `(../knowledge/variants.md)`.
- `review.md`: `--variant all`.
- `react-web/tokens.md` and `plain-web/tokens.md`: `data-variant`, `@font-face`.

- [ ] **Step 1: Write the failing tests** (the strings above, with `outOfOrder` for the mode order, as the existing tests do).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Write the skill text.** Plain words, the existing files' tone; the research step says what to look at (comparable apps, the connected design sources, pitfalls) and that the developer approves what varies before anything is written. Keep each file within the line limits `skill-content.test.ts` enforces.
- [ ] **Step 4: Run** `bun test test/skill-modes.test.ts test/skill-content.test.ts test/agents-package.test.ts test/plugin.test.ts` — PASS.
- [ ] **Step 5: Commit** `docs(skill): variants and project fonts — the format, a research step, and how each web stack switches`.

### Task 9: A fixture with variants, docs and decision record

**Files:**
- Modify: `tests/fixtures/react-contract-app/design/tokens.json` and `DESIGN.md` (Larder gains a second variant: a partner store's palette, `"id": "partner"`, changing the action and accent colours, readable in light and dark), `tests/fixtures/react-contract-app/src/` (a toggle in settings that sets `data-variant`), `README.md` (the tool table: `--variant` on `preview` and `shot`), `docs/specs/2026-10-12-motif-core-design.md` (§6 and §10 notes pointing to the Part 2 spec)
- Create: `docs/decisions/0006-design-variants.md` (why a variant is a view of the document, why `data-variant`, why variants are colours first)
- Test: `cli/test/fixtures-contract.test.ts`

- [ ] **Step 1: Write the failing test:** Larder's guide declares variants `["default", "partner"]`, `motif validate` passes with `contrastChecks` = pairs × 4, and `motif tokens` output contains `:root[data-variant="partner"]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Update the fixture, docs and decision record.** Check that the eval cases using Larder (`tests/evals/cases.ts`, B tests) still describe the app correctly.
- [ ] **Step 4: Run** `bun test test/fixtures-contract.test.ts test/release.test.ts` — PASS; then the full suite `cd cli && bun run typecheck && bun test` — 0 failures (report any skip that's new).
- [ ] **Step 5: Commit** `feat(fixtures): Larder has a partner variant; decision record for design variants`.

### Task 10: Verify on the real case and open the PR

- [ ] **Step 1:** On a scratch copy of a plain site with two palettes (write one in the scratchpad: `:root` and `[data-gender="male"]` blocks), run `motif extract`, `motif validate`, `motif tokens`, `motif preview --variant all --png-only` and `motif shot --audit` from source (`bun cli/src/main.ts …`), and check the PNGs show both palettes in light and dark.
- [ ] **Step 2:** Run `bun tests/evals/run.ts --cases b-settings,c-review` (B and C on Larder with its new variant) — both PASS.
- [ ] **Step 3:** Push the branch and open a PR titled "Design variants and project fonts (Part 2, Phase 0)"; it ships in v0.5.0 with Phase A, so no release here.
