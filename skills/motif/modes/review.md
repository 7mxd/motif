# Review: improve how an existing app looks and feels

Find what's wrong with the app's UI, explain it in plain words ranked by how much it matters, and fix what the developer chooses, with screenshots from before and after. Steps marked ⏸ wait for the developer unless they turned approvals off.

## 1. Scope

Ask whether to review the whole app or named screens or features (default: the whole app). List the routes or screens you'll cover. A site with one page needs no question: say you'll review all of it, and go on.

## 2. Extract (only when there is no design guide)

1. Run `motif extract`. It collects every value the app uses, groups near-duplicates, and writes draft theme values to `design/tokens.draft.json` and a map from each old value to its proposed role to `design/extract-report.json`.
2. Draft `DESIGN.md` describing the app's *current* design, not an ideal one, and call out the inconsistencies the report shows ("14 greys → 5 colour roles"), using its notes.
3. ⏸ Show the developer the draft in plain words: the colour roles (as swatches if you can), the type scale, the spacing scale and the main inconsistencies.
4. Once approved, rename `design/tokens.draft.json` to `design/tokens.json`, run `motif validate` and fix what it reports, then add the change-log line `- <date> — Design guide extracted from the existing code — so new work stays consistent — approved by <developer>`.

## 3. Audit

**Exact checks**, each with `--json`:

1. `motif validate`: problems in the design guide itself.
2. `motif check`: places in the code that bypass the design guide.
3. `motif shot --audit`: contrast and tap-target sizes as rendered, and movement under reduced motion, for the screens in scope (light and dark, at three phone sizes and a tablet, plus a desktop for a web app, and in every variant). Screens that only appear after a form or a click (a result, an editor, an error) need a state script: write one per state in `design/states/`, as the stack guide's checks show ([React web](../adapters/react-web/checks.md#screens-behind-a-form-or-a-click), [plain web](../adapters/plain-web/checks.md#screens-behind-a-form-or-a-click), [Flutter](../adapters/flutter/checks.md#screens-behind-a-form-or-a-click), [Jetpack Compose](../adapters/compose/checks.md#screens-behind-a-form-or-a-click), [SwiftUI](../adapters/swiftui/checks.md#screens-behind-a-form-or-a-tap), [React Native](../adapters/react-native/checks.md#screens-behind-a-form-or-a-tap), [Vue and Nuxt](../adapters/vue/checks.md#screens-behind-a-form-or-a-click), [Svelte and SvelteKit](../adapters/svelte/checks.md#screens-behind-a-form-or-a-click), [Angular](../adapters/angular/checks.md#screens-behind-a-form-or-a-click)), and add `--state design/states/<state>.js` for each (`.dart` for a Flutter app, `.kt` for a Compose app, `.swift` for a SwiftUI app; a React Native app's are JavaScript run on Expo's web target, `.js` too, and a Vue, Nuxt, Svelte, SvelteKit or Angular app's are JavaScript). For an app that offers right-to-left languages (Arabic, Hebrew), add `--rtl` to screenshot every screen right to left too, and look at those pictures as well. A SwiftUI app is screenshotted only on a Mac with Xcode: on another computer, say so once and review it from the code and `motif check`. It also writes its findings to `design/shots/audit.json` in the report format below.

**Judgement**, screen by screen and state by state, from the screenshots and the code: hierarchy, layout and spacing rhythm, the flow through each task, whether things people use together (a live preview and the controls that change it, a form and its result) fit on one screen, missing states, copy, motion quality, platform conventions and the tells of generated UI. Use [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), [motion](../knowledge/motion.md), [accessibility](../knowledge/accessibility.md), the UX pattern guide for each screen, and the stack guide's checks ([React web](../adapters/react-web/checks.md), [plain web](../adapters/plain-web/checks.md), [Flutter](../adapters/flutter/checks.md), [Jetpack Compose](../adapters/compose/checks.md), [SwiftUI](../adapters/swiftui/checks.md), [React Native](../adapters/react-native/checks.md), [Vue and Nuxt](../adapters/vue/checks.md), [Svelte and SvelteKit](../adapters/svelte/checks.md), [Angular](../adapters/angular/checks.md)).

Make it a written pass, not a glance: open each screen's screenshots (light at a phone size, and the right-to-left one) and, before writing the report, note for each screen what you checked against the design guide's own rules, at least these four:

- **The one main action.** Which action is drawn loudest (filled, full width, in the action colour)? It should be the screen's main task, and there should be one. A rarely used or final action (sign out, delete, cancel) drawn as the loudest thing on its screen, or two actions drawn as main, is a `hierarchy` finding.
- **Spacing between things.** Against the guide's spacing rules: repeated items (cards, rows, tiles) that touch or sit at uneven gaps, and a heading pressed against what it heads, are `spacing` findings.
- **Words.** Every visible label in each language the app offers: one left untranslated in the other language's screenshot, or a button that doesn't name what it does ("Submit", "OK", "Click here"), is a `copy` finding.
- **Direction.** In the right-to-left screenshots, parts that don't mirror (a row that stays left to right, an arrow that points the wrong way) are `platform-convention` findings.

A screen where you found nothing still gets its line in your notes ("Loyalty card: one main action, spacing on the scale, every string translated, mirrors"), so no screen is skipped.

When the design guide has variants, look at every variant's screenshots: `motif shot --routes <routes> --variant all` (files like `index+men.mobile.png`). A finding that applies to one variant says which in `location` (`"variant": "men"`) and in its summary; one that applies to all is reported once.

Two things screenshots hide, so check them in the code too:

- For every screen that shows data (a list, a feed, search results, a dashboard), find its loading, empty and error states. A screen that renders its mock data straight away looks complete, since mock data always loads and is never empty; one with no branch for any of the three is a `missing-state` finding.
- Emoji standing in for the app's icons or decoration (on buttons, banners, feature cards, empty states) are an `anti-pattern` finding: see [emoji as UI](../knowledge/anti-patterns.md#emoji-as-ui). Emoji in content people write themselves are fine.

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
      "location": { "screen": "/settings", "selector": "p.hint", "viewport": "mobile", "scheme": "dark", "variant": "men" },
      "summary": "In the Men variant, hint text is hard to read on cards in dark mode (2.8:1; it needs 4.5:1).",
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

**Categories:** `raw-value`, `contrast`, `target-size`, `reduced-motion`, `accessibility`, `missing-state`, `hierarchy`, `spacing`, `typography`, `motion`, `navigation`, `copy`, `platform-convention`, `consistency`, `anti-pattern`, `other`. Use `accessibility` for what keeps people who use a screen reader, a keyboard or zoom from using something: a field or button with no label or name, focus you can't see or that gets lost, a control that only appears on hover, content that breaks when zoomed. Contrast, tap sizes and reduced motion keep their own categories. `motif shot --audit` reports unnamed controls under `accessibility`.

The default look (see [anti-patterns](../knowledge/anti-patterns.md) and [type pairings](../knowledge/type-pairings.md)) is advice, not a fault: report it at most once per review, as `anti-pattern` and `minor`, and say the developer may keep it on purpose.

**Merging the exact checks.** Copy every finding from `design/shots/audit.json` as it is; it already uses this format. It already groups texts that fail with the same colours (in light, dark or both), and one element's repeats across sizes, states and pages; a location's `viewport` is `mobile` (a phone), `tablet` or `desktop`; for each group, name its cause (the colour role, the typed colour or the opacity behind it) and merge groups that share one. A finding found in several places keeps the first in `location` and lists the others in `"locations"`. Turn each `motif validate` problem and `motif check` violation into a finding with `"source": "exact"` and its file and line:

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

A cause and its effect stay two findings: a typed colour that `motif check` reports is a `raw-value` finding even when the audit reports the contrast it causes, and that contrast finding's fix points to it ("fixed by F-014"), so fixing the contrast another way can't leave the typed colour behind. Merge only the same problem found in many places into one finding that lists the places. Number the findings `F-001`, `F-002`… across the whole report, renumbering those copied from `audit.json`.

**Judgement findings** use `"source": "judgement"`, a category from the list, the file or screen, a one-line summary of why it matters, and a concrete fix. For a screen behind a form or a click, put the route in `screen` and the state's name in `state` (`{ "screen": "/", "state": "sent" }`), as `audit.json` does.

**The Markdown version** starts with a summary (how many critical, major and minor findings, and the three that matter most in one line each), then lists the findings by severity: id, category, location, the one-line why, the fix, and the screenshot path.

Show the developer the summary and ask which findings to fix (suggest all critical and major ones).

## 5. Rebuild

1. Before changing anything, keep screenshots of the screens you'll touch, in the states the audit used: `motif shot --routes <routes> --state design/states/<state>.js --save before`: one `--state` per state script you have (leave --state out if there are none).
2. Fix the chosen findings with theme values only. A new value, role or rule a fix needs goes through a design guide change ⏸ before you write it into `DESIGN.md` or `design/tokens.json`.
3. Run the exact checks again: `motif validate`, `motif check` and `motif shot --audit` (with the same `--state` options).
4. Run `motif shot --routes <routes> --state design/states/<state>.js --against before`, with the same options as when you saved, and show the before-and-after images; the output says how much each screen changed, and whether something was added (what's below only moved) or the page changed from some point down.
5. Look at every fix at each size: the phones 360, 390 and 430 px wide, the tablet and the desktop. A fix that looks right on one phone can push things apart on another. Where people use things together (a live preview and the controls that change it, a form and its result), end that state's script by scrolling them into view (`document.querySelector("#preview").scrollIntoView({ behavior: "instant" })`). The side-by-side images frame what was on screen, so you can see whether they still fit on one screen wherever they did before; if a fix breaks that, find another way.
6. When a fix came out differently from the report's fix (another approach, or a visible change the finding didn't describe, such as text in a different colour), show its before-and-after and ask before keeping it ⏸.
7. Mark each fixed finding `"status": "fixed"` in the JSON report and update the Markdown version; leave the rest `"open"`.

## 6. A new look instead

If the developer wants a new look rather than fixes:

1. Keep screenshots first: `motif shot --routes <routes> --save before`, with `--state` for each screen behind a form or a click.
2. Follow [init](init.md) steps 3 and 4 (research, directions ⏸). Then update the existing design guide rather than starting from the template: copy the approved direction's `tokens.json` over `design/tokens.json`, rewrite `DESIGN.md`'s summary, direction, foundations and motion for the new look, but keep its change log and component list (update the components' descriptions where the look changed). Add a change-log line for the new look, run `motif validate`, and put new mockups beside the old ones rather than over them.
3. Run `motif tokens`. Because the code uses theme roles, much of the new look arrives with this one step.
4. Then go screen by screen: adjust the layouts the new direction calls for, run `motif check` and `motif shot --routes <route> --against before` (with the same options as when you saved), and show each screen before moving to the next.
5. If the design guide was just extracted, `design/extract-report.json` maps each old value to its role; use it to replace any raw values left in the code.
