# The Angular seeded app

Ataa (the Angular contract app) with 12 planted problems, for test C on Angular: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../angular-contract-app/` (so `node_modules/`, `.angular/`, `dist/`, `.motif/` and screenshots never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts angular-seeded-app <empty folder>
```

Then run `npm ci` in the copy before `npm run build`, `npm start` or `motif shot`. The design guide and the generated theme are Ataa's, unchanged. `package.json` and `package-lock.json` are Ataa's with `@angular/animations` added, the package S-06 needs (as an agent that reached for it would add it), and `app.config.ts` gains `provideAnimationsAsync()` for it.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| S-01 | exact (check) | The shift cards' "places left" line coloured with a grey typed into `[style.color]`, `'#625D51'` | `src/app/shift-card/shift-card.html:10` |
| S-02 | exact (check) | Off-scale padding `padding: 18px` in a shift page's component `.css` | `src/app/shift/shift.css:2` |
| S-03 | exact (check) | An off-scale `gap: 6px` in the status badge's inline `styles:` | `src/app/status-badge/status-badge.ts:13` |
| S-04 | exact (check) | An off-scale corner as a Tailwind class, `rounded-[14px]`, on the "How volunteering works" panel | `src/app/shifts/shifts.html:12` |
| S-05 | exact (check) | A typed `font-size: 15px` on a shift's introduction | `src/app/shift/shift.css:6` |
| S-06 | exact (check) | The sign-up confirmation animated with `@angular/animations` and a typed `animate('250ms', …)` | `src/app/signup-note/signup-note.ts:13` |
| S-07 | exact (shot) | The caption on how the email is used, faded to 50%: unreadable | `/sign-in`, `src/app/sign-in/sign-in.html:19` |
| S-08 | exact (shot) | The top bar's sign-in link, an icon with no `aria-label`, so no name | every page, `src/app/top-bar/top-bar.html:18` |
| S-09 | judgement | Shift cards crammed: 4 px padding and gaps, the hours and the place gone | `/`, `src/app/shift-card/shift-card.html` |
| S-10 | judgement | Two primary buttons on the page of a shift with room | `/shifts/[id]`, `src/app/shift/shift.html:42` |
| S-11 | judgement | My shifts has no empty state | `/my-shifts`, `src/app/my-shifts/my-shifts.html` |
| S-12 | judgement | `margin-left` between the top bar's basket and the food bank's name: wrong side in Arabic | every page, `src/app/top-bar/top-bar.css:9` |

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `screen` is a route (`[id]` matches any value, so `/shifts/pack-sunday` is `/shifts/[id]`), `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false.

S-01's typed grey is text-secondary's light value, so it passes in light mode, but in dark mode it sits on the dark surface at about 2.6:1, so the audit reports the "places left" line of every card on `/` in dark mode, in both variants and both directions; those are its declared consequences.

S-04 is a radius typed as a Tailwind class, which `motif check` reports as `tailwind-arbitrary` (the review mode files it under `raw-value`); a review that files it under `spacing`, as it does a typed radius in CSS, or `consistency`, also finds it.

S-06 is Angular's old way to animate: `trigger()`, `transition()` and `animate()` from the deprecated `@angular/animations`, which `motif check` reports at the typed timing as `raw-motion`. The fix is Ataa's own: `animate.enter="rise-in"` with a class timed by `var(--motif-duration-base)` and `var(--motif-easing-enter)`. The timing has no easing on purpose, so the line has one finding. Reduced motion isn't reported: My shifts' withdrawal still checks `matchMedia('(prefers-reduced-motion: reduce)')`, which `motif check` takes as the app respecting the setting.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-angular.test.ts` checks, on every change, that `motif check` reports exactly the six check problems at their lines and nothing else, before and after `npm ci`, that `motif validate` finds nothing, and that every pinned line holds its anchor. Where Node (in Angular 21's range) and npm are installed, it also checks that `ng build` passes on the copy with no warnings, and with a browser that `motif shot --sizes 390,1440 --audit --variant all --rtl` on `/`, `/my-shifts`, `/sign-in` and `/shifts/pack-sunday` reports S-07 and S-08 and nothing that isn't one of them or S-01's consequences.

The audit was checked on 2026-10-25 with Angular 21.2 and Tailwind 4 in Chrome: S-07 is 2.19:1 in light mode and 3.04:1 in dark, in both variants (left to right: the Arabic caption isn't reported); S-08 once, grouped across the four pages; S-01's consequence as one group of twelve places (the six cards on `/`, in both variants). The judgement problems were looked at in the screenshots.
