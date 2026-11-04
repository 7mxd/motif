# Review: improve how an existing app looks and feels

Find what's wrong with the app's UI, explain it in plain words ranked by how much it matters, and fix what the developer chooses, with screenshots from before and after. Steps marked ⏸ wait for the developer unless they turned approvals off.

## 1. Scope

Ask whether to review the whole app or named screens or features (default: the whole app). List the routes or screens you'll cover. A site with one page needs no question: say you'll review all of it, and go on.

## 2. Extract (only when there is no design guide)

1. Run `motif extract`. It collects every value the app uses, groups near-duplicates, and writes draft theme values to `design/tokens.draft.json` and a map from each old value to its proposed role to `design/extract-report.json`.
2. Draft `DESIGN.md` describing the app's *current* design, not an ideal one, and call out the inconsistencies the report shows ("14 greys → 5 colour roles"), using its notes.
3. ⏸ Show the developer the draft in plain words: the colour roles (as swatches if you can), the type scale, the spacing scale and the main inconsistencies. Ask in their terms ("Use this as the app's design guide?"): which file gets renamed is your work, not their decision.
4. Once approved, rename `design/tokens.draft.json` to `design/tokens.json`, run `motif validate` and fix what it reports, then add the change-log line `- <date> — Design guide extracted from the existing code — so new work stays consistent — approved by <developer>`.

## 3. Audit

**Exact checks**, each with `--json`:

1. `motif validate`: problems in the design guide itself.
2. `motif check`: places in the code that bypass the design guide.
3. `motif shot --audit`: contrast and tap-target sizes as rendered, and movement under reduced motion, for the screens in scope (light and dark, at three phone sizes and a tablet, plus a desktop for a web app, and in every variant). It's a foreground step: run it and wait for it to finish, however long it takes, and never run it in the background, because a session that ends while it's still running loses everything it found. When a run might take longer than your shell allows, split the screens across runs with `--routes`. Screens that only appear after a form or a click (a result, an editor, an error) need a state script: write one per state in `design/states/`, as the stack guide's checks show ([React web](../adapters/react-web/checks.md#screens-behind-a-form-or-a-click), [plain web](../adapters/plain-web/checks.md#screens-behind-a-form-or-a-click), [Flutter](../adapters/flutter/checks.md#screens-behind-a-form-or-a-click), [Jetpack Compose](../adapters/compose/checks.md#screens-behind-a-form-or-a-click), [SwiftUI](../adapters/swiftui/checks.md#screens-behind-a-form-or-a-tap), [React Native](../adapters/react-native/checks.md#screens-behind-a-form-or-a-tap), [Vue and Nuxt](../adapters/vue/checks.md#screens-behind-a-form-or-a-click), [Svelte and SvelteKit](../adapters/svelte/checks.md#screens-behind-a-form-or-a-click), [Angular](../adapters/angular/checks.md#screens-behind-a-form-or-a-click)), and add `--state design/states/<state>.js` for each (`.dart` for a Flutter app, `.kt` for a Compose app, `.swift` for a SwiftUI app; a React Native app's are JavaScript run on Expo's web target, `.js` too, and a Vue, Nuxt, Svelte, SvelteKit or Angular app's are JavaScript). Open each script with a `// motif-screens:` line naming the screens it belongs on, which you pick from the app's own routes and screens (its router, its pages folder, its previews), as the run names them (`// motif-screens: /#/applications/*`, where `*` stands for one part of the address, like an id), and guard it with `return false` where it finds nothing to do: `motif shot` runs each state only on its own screens, and keeps no screenshot where it returned `false`. When an existing state script is without a `// motif-screens:` line, add one as part of the review, unless it belongs on every screen (signing in): that one keeps no line, so it runs everywhere. When the run says a state didn't run, its line names no screen the run took: add them to `--routes`. When it says a state is lost (it returned `false` in every shot of a screen its line names), its line or its script is out of date with the app: fix whichever is wrong and run it again. For an app that offers right-to-left languages (Arabic, Hebrew), add `--rtl` to screenshot every screen right to left too, and look at those pictures as well. A SwiftUI app is screenshotted only on a Mac with Xcode: on another computer, say so once and review it from the code and `motif check`. It also writes its findings to `design/shots/audit.json` in the report format below. It shoots at most 12 pages a run: when its output says pages were left out (`leftOut` with `--json`), run it again with `--routes` naming them, so every screen in scope is audited; a run with `--routes` adds its pages to `audit.json` rather than replacing it. When it says the app picks its pages from the address hash (`hashRouted` with `--json`), it found only `/`: read the app's router for its pages and name them with `--routes` (`/#/settings`). When every page sits behind a sign-in, sign in with a state script that has no `// motif-screens:` line (it belongs on every page) and add `--states-only`, so each page is taken only signed in, not also as the sign-in screen it shows before.

**Judgement**, screen by screen and state by state, from the screenshots and the code: hierarchy, layout and spacing rhythm, the flow through each task, whether things people use together (a live preview and the controls that change it, a form and its result) fit on one screen, missing states, copy, motion quality, platform conventions and the tells of generated UI. Use [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), [motion](../knowledge/motion.md), [accessibility](../knowledge/accessibility.md), the UX pattern guide for each screen, and the stack guide's checks ([React web](../adapters/react-web/checks.md), [plain web](../adapters/plain-web/checks.md), [Flutter](../adapters/flutter/checks.md), [Jetpack Compose](../adapters/compose/checks.md), [SwiftUI](../adapters/swiftui/checks.md), [React Native](../adapters/react-native/checks.md), [Vue and Nuxt](../adapters/vue/checks.md), [Svelte and SvelteKit](../adapters/svelte/checks.md), [Angular](../adapters/angular/checks.md)).

Make it a written pass, not a glance: open each screen's screenshots (light at a phone size, and the right-to-left one) and, before writing the report, note for each screen what you checked against the design guide's own rules, at least these four. The notes go into the Markdown report as its **What was checked** section:

- **The one main action.** Which action is drawn loudest (filled, full width, in the action colour)? It should be the screen's main task, and there should be one. A rarely used or final action (sign out, delete, cancel) drawn as the loudest thing on its screen, or two actions drawn as main, is a `hierarchy` finding.
- **Spacing between things.** Against the guide's spacing rules, not only its scale. A value can be a real step on the scale and still be wrong for its place: 0 and 4 px are steps of a 4 px scale, and `motif check` passes them, yet a guide that asks for `space.4` between cards is broken by either. So for each repeated item (card, row, tile) and each section on the screen, open its code and write the actual numbers in your notes: the padding inside an item, the gaps inside it, the gap between items, and the gap between a heading and what it heads. Set each one against what the guide says belongs in that place, and name the rule (where the guide has none, against the same kind of item elsewhere in the app). "On the scale" and "even" aren't results. Repeated items that touch or sit at uneven gaps, and a heading pressed against what it heads, are `spacing` findings. So is an item packed too tight inside: padding below the guide's scale or below what the guide gives that place, text cut to fit (one line where it needs two), or details the item should show dropped to make room. To see what was dropped, compare the item with its data (its type, its mock data) and with its own detail screen, and note what it leaves out. When what's dropped is what people choose by (a price, a date, a status, a size, a place), it's a `hierarchy` finding too.

- **Words.** Every visible label in each language the app offers: one left untranslated in the other language's screenshot, or a button that doesn't name what it does ("Submit", "OK", "Click here"), is a `copy` finding. Before proposing new wording, look for it in the project's own docs (a spec, a PRD, a README): wording a spec defines is the team's decision, so the finding says which document names it, and a fix updates that document too.
- **Direction.** In the right-to-left screenshots, parts that don't mirror (a row that stays left to right, an arrow that points the wrong way) are `platform-convention` findings. A gap on the wrong side looks only slightly off in a screenshot, so check the code too, by searching and not by what you happen to open: across all the app's source, stylesheets included (an Angular component's styles sit in their own file, so reading its template never shows them), search for the physical names below and note how many hits there were, even none. In an app that offers right-to-left languages, spacing or position set on a physical side where the start or end side is meant is a `platform-convention` finding at that line. In CSS that's `margin-left`/`margin-right`, `padding-left`/`padding-right` or `left`/`right` where `margin-inline-start`, `padding-inline-start`, `inset-inline-start` (and their `-end`) or the row's `gap` belong; in React Native, `marginLeft` or `paddingLeft` where `marginStart` or `paddingStart` belongs; in Flutter, `EdgeInsets.only(left: …)` where `EdgeInsetsDirectional.only(start: …)` belongs; in Jetpack Compose, `Modifier.absolutePadding(left = …)` where `Modifier.padding(start = …)` belongs. SwiftUI's `.leading` and `.trailing` already mirror, so there it's a fixed `.offset(x: …)` standing in for padding. Each stack guide's right-to-left table lists the rest ([React web](../adapters/react-web/platform.md#right-to-left), [plain web](../adapters/plain-web/platform.md#right-to-left), [Flutter](../adapters/flutter/platform.md#right-to-left), [Jetpack Compose](../adapters/compose/platform.md#right-to-left), [SwiftUI](../adapters/swiftui/platform.md#right-to-left), [React Native](../adapters/react-native/platform.md#right-to-left), [Vue and Nuxt](../adapters/vue/platform.md#right-to-left), [Svelte and SvelteKit](../adapters/svelte/platform.md#right-to-left), [Angular](../adapters/angular/platform.md#right-to-left)).

A screen where you found nothing still gets its line in your notes ("Loyalty card: one main action; card padding 20 and gaps 16, as the guide's spacing rules ask; shows everything its data has; every string translated; mirrors; the search for physical sides found none"), so no screen is skipped.

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

**Status:** `open` until it is dealt with; `fixed` once a fix is in; `accepted` when you checked it and it stays as it is on purpose (a false positive, or a trade-off the developer chose), with a `note` that says why: `"status": "accepted", "note": "The eight week bars must fit across a phone."`.

**Severity:** `critical` blocks or shuts people out (unreadable text, a control they can't reach, a broken flow); `major` clearly hurts the experience or the design's consistency; `minor` is polish.

**Categories:** `raw-value`, `contrast`, `target-size`, `reduced-motion`, `accessibility`, `missing-state`, `hierarchy`, `spacing`, `typography`, `motion`, `navigation`, `copy`, `platform-convention`, `consistency`, `anti-pattern`, `other`. Use `accessibility` for what keeps people who use a screen reader, a keyboard or zoom from using something: a field or button with no label or name, focus you can't see or that gets lost, a control that only appears on hover, content that breaks when zoomed. Contrast, tap sizes and reduced motion keep their own categories. `motif shot --audit` reports unnamed controls under `accessibility`.

The default look (see [anti-patterns](../knowledge/anti-patterns.md) and [type pairings](../knowledge/type-pairings.md)) is advice, not a fault: report it at most once per review, as `anti-pattern` and `minor`, and say the developer may keep it on purpose.

**Merging the exact checks.** Copy every finding from `design/shots/audit.json` as it is; it already uses this format. It already groups texts that fail with the same colours (in light, dark or both), controls that are too small for the same reason (the same classes, short by the same pixels), and one element's repeats across sizes, states and pages; a location's `viewport` is `mobile` (a phone), `tablet` or `desktop`; for each group, name its cause (the colour role, the typed colour or the opacity behind it) and merge groups that share one. The audit finds a problem on the screen, not in the code: find the line that causes it (the class, the style, the component) and add its `"file"` and `"line"` to the finding's `location`, so the report says where to fix it. A finding found in several places keeps the first in `location` and lists the others in `"locations"`. Turn each `motif validate` problem and `motif check` violation into a finding with `"source": "exact"` and its file and line:

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

**The Markdown version** starts with a summary (how many critical, major and minor findings, and the three that matter most in one line each), then lists the findings by severity: id, category, location, the one-line why, the fix, and the screenshot path. After the findings comes **What was checked**: the written pass's notes, one line per screen, including the screens where you found nothing. The JSON report has no such field: it stays as shown above.

Show the developer the summary and ask which findings to fix (suggest all critical and major ones).

## 5. Rebuild

1. Before changing anything, keep screenshots of the screens you'll touch, in the states the audit used: `motif shot --routes <routes> --state design/states/<state>.js --save before`: one `--state` per state script you have (leave --state out if there are none).
2. Fix the chosen findings with theme values only. A new value, role or rule a fix needs goes through a design guide change ⏸ before you write it into `DESIGN.md` or `design/tokens.json`.
3. Run the exact checks again: `motif validate`, `motif check` and `motif shot --audit` (with the same `--state` options, and in the foreground, as in the audit).
4. Run `motif shot --routes <routes> --state design/states/<state>.js --against before`, with the same options as when you saved, and show the before-and-after images; the output says how much each screen changed, and whether something was added (what's below only moved) or the page changed from some point down.
5. Look at every fix at each size: the phones 360, 390 and 430 px wide, the tablet and the desktop. A fix that looks right on one phone can push things apart on another. Where people use things together (a live preview and the controls that change it, a form and its result), end that state's script by scrolling them into view (`document.querySelector("#preview").scrollIntoView({ behavior: "instant" })`). The side-by-side images frame what was on screen, so you can see whether they still fit on one screen wherever they did before; if a fix breaks that, find another way.
6. When a fix came out differently from the report's fix (another approach, or a visible change the finding didn't describe, such as text in a different colour), show its before-and-after and ask before keeping it ⏸.
7. Mark each fixed finding `"status": "fixed"` in the JSON report, and each one you checked and left as it is on purpose `"status": "accepted"` with a `note`; leave the rest `"open"`. Update the Markdown version to match.

## 6. A new look instead

If the developer wants a new look rather than fixes:

1. Keep screenshots first: `motif shot --routes <routes> --save before`, with `--state` for each screen behind a form or a click.
2. Follow [init](init.md) steps 3 and 4 (research, directions ⏸). Then update the existing design guide rather than starting from the template: copy the approved direction's `tokens.json` over `design/tokens.json`, rewrite `DESIGN.md`'s summary, direction, foundations and motion for the new look, but keep its change log and component list (update the components' descriptions where the look changed). Add a change-log line for the new look, run `motif validate`, and put new mockups beside the old ones rather than over them.
3. Run `motif tokens`. Because the code uses theme roles, much of the new look arrives with this one step.
4. Then go screen by screen: adjust the layouts the new direction calls for, run `motif check` and `motif shot --routes <route> --against before` (with the same options as when you saved), and show each screen before moving to the next.
5. If the design guide was just extracted, `design/extract-report.json` maps each old value to its role; use it to replace any raw values left in the code.
