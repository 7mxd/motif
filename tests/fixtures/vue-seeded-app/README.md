# The Vue seeded app

Bustan (the Vue contract app) with 14 planted problems, for test C on Vue: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../vue-contract-app/` (so `node_modules/`, `dist/`, `.motif/` and screenshots never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts vue-seeded-app <empty folder>
```

Then run `npm ci` in the copy before `npx vue-tsc --noEmit`, `npm run dev` or `motif shot`. The design guide and `package.json` are Bustan's, unchanged; the generated theme is Bustan's with V-14's one hand edit.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| V-01 | exact (check) | The "Free" badge filled with a green typed into a `:style` binding, `'#2E7D32'` | `src/components/StatusBadge.vue:13` |
| V-02 | exact (check) | Off-scale padding `padding: 18px` in `<style scoped>` on a plot's details | `src/views/PlotView.vue:90` |
| V-03 | exact (check) | An off-scale corner as a Tailwind class, `rounded-[10px]`, on the harvest form | `src/views/HarvestView.vue:36` |
| V-04 | exact (check) | A typed `font-size: 15px` on a plot's description | `src/views/PlotView.vue:94` |
| V-05 | exact (check) | A raw `cubic-bezier(0.4, 0, 0.6, 1)` in the button's press | `src/components/AppButton.vue:41` |
| V-06 | exact (shot) | The caption on how the email is used, faded to 50%: unreadable | `/sign-in`, `src/views/SignInView.vue:39` |
| V-07 | exact (shot) | A 32×32 back link on a plot's page | `/plots/[id]`, `src/views/PlotView.vue:25` |
| V-08 | exact (shot) | The top bar's sign-in link, an icon with no `aria-label`, so no name | every page, `src/components/TopBar.vue:32` |
| V-09 | judgement | Plot cards crammed: 4 px padding and gaps, the size and light gone | `/`, `src/components/PlotCard.vue` |
| V-10 | judgement | Two primary buttons on a free plot's page | `/plots/[id]`, `src/views/PlotView.vue:67` |
| V-11 | judgement | The harvest log has no empty state | `/harvest`, `src/views/HarvestView.vue` |
| V-12 | judgement | `margin-left` between the top bar's leaf and the garden's name: wrong side in Arabic | every page, `src/components/TopBar.vue:46` |
| V-13 | exact (check) | Sign in's heading hard-codes `font-family: Arial` in a `style` attribute | `src/views/SignInView.vue:23` |
| V-14 | exact (check) | The generated theme CSS edited by hand (`radius.md` 14px → 12px) | `src/styles/motif.css` |

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `screen` is a route (`[id]` matches any value, so `/plots/by-the-gate` is `/plots/[id]`), `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false. `wholeFile` on V-14 means a finding anywhere in `motif.css` counts.

V-01's typed green passes in light mode (white on it is 5.1:1), but in dark mode the badge's text is the dark on-success colour on the same green, about 3.5:1, so the audit reports every "Free" badge on `/` and a free plot's page in dark mode, in both variants and both directions; those are its declared consequences.

V-03 is a radius typed as a Tailwind class, which `motif check` reports as `tailwind-arbitrary` (the review mode files it under `raw-value`); a review that files it under `spacing`, as it does a typed radius in CSS, or `consistency`, also finds it.

V-13's Arial has Arabic letters on Windows, so in Arabic the heading turns from Tajawal to Arial's Arabic rather than to boxes; the audit doesn't report it.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-vue.test.ts` checks, on every change, that `motif check` reports exactly the seven check problems at their lines (V-14 as a warning on the generated file's first line) and nothing else, before and after `npm ci`, that `motif validate` finds nothing, and that every pinned line holds its anchor. Where Node and npm are installed, it also checks that `npx vue-tsc --noEmit` passes on the copy, and with a browser that `motif shot --sizes 390,1440 --audit --variant all --rtl` on `/`, `/harvest`, `/sign-in` and `/plots/by-the-gate` reports V-06, V-07 and V-08 and nothing that isn't one of them or V-01's consequences.

The audit was checked on 2026-10-23 with Vite 8 and Vue 3.5 in Chrome: V-06 is 2.26:1 in light mode and 2.97:1 in dark, in both variants (left to right: the Arabic caption isn't reported); V-07 once per direction, on a phone only; V-08 once, grouped across the four pages; V-01's consequence as one group of eight places (two pages, two variants, two directions). The judgement problems were looked at in the screenshots.
