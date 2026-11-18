# Findings: Chandrajith KM's design-rules posts → Motif tasks

Date: 2026-11-18. Status: owner picked T1–T4, T12, T13 for 2.0 (written into `2026-11-18-motif-2.0-fair-test-and-rtl-design.md` §5.5); T5–T11 are the 2.1 AI-features release. Nothing built yet.
Source: 15 LinkedIn posts by Chandrajith KM (Lead Product Designer), read from the owner's local copy (not in this repo).
All slides read; videos sampled one frame every 4 s (post 10: 16 frames, 11: 12, 13: 17, 14: 15, 15: 15) plus audio
transcripts (10 and 11 have no speech). Quotes are short and only used as evidence.

## 1. Summary

- 15 posts read. About two thirds are about products that have AI features in them (copilots, agents, chat). The rest are
  about design systems that agents can follow.
- Motif already does much of the design-system half: raw-value checks, semantic colour roles with dark values, one
  primary action, error copy that says what to do, "14 greys → 5 roles" in review, Do/Don't rules, no Lorem.
- Two ideas are already in the pending fair-test design (`2026-11-18-motif-2.0-fair-test-and-rtl-design.md`): the
  "no access" state and the left/right check (§4).
- 13 tasks kept: 0 must (beyond the 2 already in that design), 4 should for 2.0 (small skill-text changes), 9 later.
- Biggest new idea: a UX guide for apps that have AI features (T5). Motif teaches nothing about these today.

## 2. Task table (ranked)

| # | Task | Source | Today | Size | Priority |
|---|---|---|---|---|---|
| T1 | Undo before "Are you sure?", and confirmations that name the exact scope | 03, 05 S6, 08 S4, 10 f11–13 | partly | S | should for 2.0 |
| T2 | Arabic digits and mirrored arrows in the right-to-left check | 09 S6, 12 S6, 15 | partly | S | should for 2.0 |
| T3 | One colour role, one meaning; variants change shape, not meaning | 12 S4, 14 f8/f15 | partly | S | should for 2.0 |
| T4 | Message weight matches the stakes (tip vs payment failure) | 02 S4 | partly | S | should for 2.0 |
| T5 | UX guide for AI features: way-finders, autonomy by risk, plan before acting, trust cues, generated answers | 03, 04, 05, 06, 07, 08, 10 | new | L | later (2.1) |
| T6 | Library pieces for AI features (plan card, source chip, undo toast with countdown, confidence note) | 05 S1/S3, 07 S1/S4/S5, 08 S4/S5 | new | L | later (after T5) |
| T7 | `motif check`: hard-coded user-facing text when the app has a translation layer | 09 S3, 13 f10/f14 | new | L | later |
| T8 | Duplicate components next to a listed one (ButtonAlt, LinkButton next to Button) | 13 f3/f14 | partly | M | later |
| T9 | `motif check --baseline`: existing apps' findings may go down, never up | 09 S4–S5 | new | M | later |
| T10 | Pre-merge recipe: run `motif check` in CI and block merge on new problems | 09 S4, 13 f14 | new | S | later |
| T11 | Component token tier (`button.primary.bg` → role) | 12 S3 | partly | L | later |
| T12 | Generated data screens: choose the component from the data's shape | 06 S5 | new | M | later (part of T5) |
| T13 | Smart-filled forms: tag filled fields with where they came from, flag uncertain ones | 08 S2 | new | S | later (part of T5) |

## 3. Per-task detail

**T1. Undo before "Are you sure?"; confirmations name the scope.**
- Evidence: 08 S4, a toast "Reminders sent to 6 clients · UNDO 0:08" with a countdown. 05 S6, the action names its
  scope ("Send to 6 clients, Thu 9am"). 03, low-risk actions are "done, with Undo".
- Motif today: `ux-patterns/lists-feeds.md` prefers undo for deleting list items. Nothing general, and nothing about
  wording a confirmation.
- Change: `knowledge/anti-patterns.md` gets a new entry: a confirm dialog where undo would work. `character.md` or
  `ux-patterns/forms.md` gets a rule: a confirmation for something that can't be undone names what, how many, and who
  or when. `modes/review.md` gets the check.
- Stacks: all 9 (skill text, the same for every stack).
- Test: skill-text tests. Optionally a planted issue in a seeded fixture for Test C (owner OK needed for fixture
  changes).

**T2. Arabic digits and mirrored arrows.**
- Evidence: 09 S6 and 12 S6, the right-to-left card mirrors, its trend arrow flips, and its numbers use Arabic-Indic
  digits. 15, "Spacing, icons, and numbers have to mirror properly".
- Motif today: `motif shot --rtl` exists, and each adapter's `platform.md` says to mirror direction icons. Nothing
  covers which digits to use. The review step doesn't say to look for unflipped arrows.
- Change: `DESIGN.md` template section 7 gets a line for the digit choice (Western or Arabic-Indic, decided once). Each
  adapter's `platform.md` shows how to format numbers by locale in its stack (Intl.NumberFormat on web and in RN,
  `NumberFormat` in Flutter, `NumberFormat`/locale in Compose, `.formatted()` with locale in SwiftUI). `modes/review.md`
  adds two things to check on the `--rtl` screenshot: arrows and chevrons point the reading way, and numbers follow the
  digit choice.
- Stacks: all 9.
- Test: skill-text tests.
- Overlap: pairs with the fair-test design's left/right check (§4).

**T3. One role, one meaning.**
- Evidence: 12 S4, "variant = shape, color = meaning". 14 f15, the "Away" badge reuses `status.warn` only because it
  means the same thing.
- Motif today: colour roles exist and colour is "used on purpose". Nothing stops one role carrying two meanings, or a
  button variant that is only a new colour.
- Change: `contract/spec.md` and the template's Foundations section say that a role keeps one meaning on every screen.
  `modes/review.md` flags a status role used for an unrelated meaning, and a component variant that differs only in
  colour without a meaning.
- Stacks: all 9.
- Test: skill-text tests.

**T4. Message weight matches the stakes.**
- Evidence: 02 S4, "A casual tip and a payment failure should never look or sound the same". The tip auto-dismisses.
  The failure stays, says "Nothing was charged", and offers "Use another card" and "Get help".
- Motif today: `ux-patterns/notifications.md` covers toasts vs banners. `empty-loading-error.md` covers error copy.
  Neither ties visual weight and persistence to how much is at stake.
- Change: one short section in `notifications.md` with low/medium/high stakes mapped to presentation (toast, inline,
  persistent card), and a "say what didn't happen" line for money or data. Review flags a high-stakes failure shown as
  a toast.
- Stacks: all 9.
- Test: skill-text tests.

**T5. UX guide for apps with AI features.**
- Evidence: 04, way-finders (a specific placeholder, 3–4 suggestion chips, a "based on" context line, an "Enhance"
  control). 03, autonomy by what a mistake costs (suggest / draft first / do it with Undo). 05 and 10, plan before
  acting (numbered steps, an "undoable / can't undo" label in words as well as colour, "nothing runs yet",
  Approve / Edit / Cancel). 07, trust (numbered source chips, reasoning folded by default, confidence in plain words
  plus an uncertainty note). 08, soft refusal with alternatives, progress steps with Stop. 06, "never invent prices,
  dates or numbers".
- Motif today: nothing. No pattern covers chat, prompt inputs, agent actions or generated answers.
- Change: new `skill/knowledge/ux-patterns/ai-features.md` covering each pattern, its states, and its review checks
  (e.g. a bare "Ask me anything" input; an agent that acts without showing a plan for something it can't undo; a claim
  with no source). Linked from `modes/init.md`, `feature.md` and `review.md` when the app has an AI feature.
- Stacks: all 9 (text). Examples are written stack-neutral first, and adapters add notes where native patterns differ.
- Test: a new eval brief with an AI feature (D and Test A). That is an L-size eval change and needs the owner's OK.

**T6. Library pieces for AI features.**
- Change: `skill/library/` gets `plan-card`, `source-chip`, `undo-toast` (countdown motion) and `confidence-note`,
  each with every state.
- Stacks: all 9, per the parity rule.
- Test: skill-text tests and library lint. Test A only through T5's brief.
- Depends on: T5.

**T7. Hard-coded user-facing text.**
- Evidence: 13 f10, "Every string goes through translation" (`"Save"` → `t('cta.save')`). 09 S3, a rules file has the
  same rule.
- Change: a new `motif check` rule. It is on only when the project has a translation layer (i18next, vue-i18n,
  ngx-translate, Flutter `intl`/ARB, Android string resources, iOS String Catalogs). It flags literal text in
  components.
- Stacks: all 9 (the detection differs per stack).
- Test: unit tests per stack. B/C/D run.
- Risk: B/D's "check finds nothing" criterion.

**T8. Duplicate components.**
- Evidence: 13 f3, Button, ButtonAlt and LinkButton side by side ("which one is allowed?").
- Motif today: `DESIGN.md` section 5 lists components, and feature work adds at most one new one.
- Change: `motif check` or the review step flags a new component whose name or markup closely matches a listed one.
- Stacks: all 9.
- Test: unit tests. Test C planted issue.

**T9. Baseline / ratchet.**
- Evidence: 09 S4, "lint errors may go down, never up". 09 S5 grandfathers old code.
- Change: `motif check --baseline design/check-baseline.json` records today's findings. Later runs fail only on new
  ones. Review mode offers it for existing apps.
- Stacks: tool-level, so all 9 at once.
- Test: unit tests.

**T10. Pre-merge recipe.**
- Change: `modes/init.md` and `review.md` offer to add a CI step that runs `motif check` (with T9's baseline on
  existing apps). Each adapter gets the snippet.
- Stacks: all 9.
- Test: skill-text tests. Install check in CI.

**T11. Component token tier.**
- Evidence: 12 S3, three tiers (base → semantic → component).
- Motif today: two tiers (primitives → roles).
- Change: optional `component.*` tokens that point at roles, in the contract, generators and checks.
- Stacks: all 9 generators.
- Risk: changes the contract format. A decision record is needed.

**T12. Generated data screens.**
- Evidence: 06 S5, "when comparing ≤ 5 options use ComparisonTable", "when steps > 3 use Checklist".
- Change: a section of T5 that maps the data's shape to the right component (table, checklist, stat tiles, chart).
  Motif's existing `library/charts` and `cards` are the targets.

**T13. Smart-filled forms.**
- Evidence: 08 S2, fields tagged "FROM SCAN", an uncertain field tagged "CHECK", one "Looks right" confirm.
- Change: a section of T5, plus one line in `ux-patterns/forms.md`.

## 4. Overlaps with the fair-test / RTL design (no new task)

| Idea | Posts | Where it already is |
|---|---|---|
| "No access" state | 12 S5, 15 | Fair-test design §5.3 |
| Left/right → start/end check with a fix hint | 09 S4, 13 f11/f14, 15 | Fair-test design §5.4 (`physical-direction`) |
| Raw colours → tokens, `no-raw-colors` lint | 09 S2, 13 f9, 14 f12–13, 15 | Covered: `raw-color`, `primitive-use` rules |
| Count the greys, map each to a role | 12 S2, 14 f15 | Covered: review mode's "14 greys → 5 colour roles" |
| Dark mode is a second mapping | 14 f10 | Covered: roles carry a dark value (`dev.motif.modes.dark`) |
| Every component state (default, hover, focus, disabled, loading) | 12 S5 | Covered: `DESIGN.md` section 5 states, init step 2 |
| One primary action per view; verb-first labels | 02 S3, 06 S1 | Covered: `character.md`, `accessibility.md` |
| Error says what happened and what to do | 02 S4 | Covered: `empty-loading-error.md` |
| Rules with a "not this" example | 13 f8–11 | Covered: `DESIGN.md` section 9 Do / Don't |
| Placeholder people and fake data left in | 11 f5–6 | Covered: anti-patterns "Lorem ipsum and fake metrics", "No stray scaffolding" |

T2 (digits and arrows) sits next to §5.4. It could join the fair-test design if the owner wants all right-to-left work
in one place.

## 5. Dropped

- 01 AI-Native vs AI-Enabled: product strategy ("Remove the AI. Does it still work?"). Nothing an agent builds changes.
- 02 / 03 autonomy dial drawn as a gauge: a framing device. Its useful part is folded into T5.
- 09 tokens pulled from the design file by a connector: Motif dropped outside design sources (decision 0015).
- 09 boundaries check (features import only from the UI layer): code architecture, not UI.
- 09 S5 protected main / no bypass: repository policy, not app UI.
- 10 agents drawing on a Figma canvas: designer tooling, outside Motif's scope.
- 11 "never use it to remove the user" and the survey cards: research opinion. The concrete faults are already covered
  (§4).
