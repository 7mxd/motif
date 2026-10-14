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
