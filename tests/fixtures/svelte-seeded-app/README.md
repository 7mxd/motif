# The Svelte seeded app

Adawat (the Svelte contract app) with 14 planted problems, for test C on Svelte: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../svelte-contract-app/` (so `node_modules/`, `.svelte-kit/`, `build/`, `.motif/` and screenshots never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts svelte-seeded-app <empty folder>
```

Then run `npm ci` in the copy before `npm run check`, `npm run dev` or `motif shot`. The design guide and `package.json` are Adawat's, unchanged; the generated theme is Adawat's with S-14's one hand edit.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| S-01 | exact (check) | The "On the shelf" badge filled with a green typed into a `style:` directive, `'#2E7D32'` | `src/lib/components/StatusBadge.svelte:11` |
| S-02 | exact (check) | Off-scale padding `padding: 18px` in a tool page's `<style>` | `src/routes/tools/[id]/+page.svelte:88` |
| S-03 | exact (check) | An off-scale corner as a Tailwind class, `rounded-[10px]`, on the "How borrowing works" panel | `src/routes/+page.svelte:25` |
| S-04 | exact (check) | A typed `font-size: 15px` on a tool's description | `src/routes/tools/[id]/+page.svelte:92` |
| S-05 | exact (check) | The loan confirmation's transition eased with `cubicOut` from `svelte/easing` | `src/lib/components/LoanNote.svelte:19` |
| S-06 | exact (shot) | The caption on how the email is used, faded to 50%: unreadable | `/sign-in`, `src/routes/sign-in/+page.svelte:42` |
| S-07 | exact (shot) | A 32×32 back link on a tool's page | `/tools/[id]`, `src/routes/tools/[id]/+page.svelte:25` |
| S-08 | exact (shot) | The top bar's sign-in link, an icon with no `aria-label`, so no name | every page, `src/lib/components/TopBar.svelte:35` |
| S-09 | judgement | Tool cards crammed: 4 px padding and gaps, the loan length and weight gone | `/`, `src/lib/components/ToolCard.svelte` |
| S-10 | judgement | Two primary buttons on the page of a tool that's on the shelf | `/tools/[id]`, `src/routes/tools/[id]/+page.svelte:67` |
| S-11 | judgement | My loans has no empty state | `/loans`, `src/routes/loans/+page.svelte` |
| S-12 | judgement | `margin-left` between the top bar's wrench and the library's name: wrong side in Arabic | every page, `src/lib/components/TopBar.svelte:48` |
| S-13 | exact (check) | Sign in's heading hard-codes `font-family: Arial` in a `style` attribute | `src/routes/sign-in/+page.svelte:26` |
| S-14 | exact (check) | The generated theme CSS edited by hand (`radius.md` 8px → 10px) | `src/lib/styles/motif.css` |

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `screen` is a route (`[id]` matches any value, so `/tools/cordless-drill` is `/tools/[id]`), `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false. `wholeFile` on S-14 means a finding anywhere in `motif.css` counts.

S-01's typed green passes in light mode (white on it is 5.1:1), but in dark mode the badge's text is the dark on-success colour on the same green, about 3.3:1, so the audit reports every "On the shelf" badge on `/` and on the page of a tool that's on the shelf in dark mode, in both variants and both directions; those are its declared consequences.

S-03 is a radius typed as a Tailwind class, which `motif check` reports as `tailwind-arbitrary` (the review mode files it under `raw-value`); a review that files it under `spacing`, as it does a typed radius in CSS, or `consistency`, also finds it.

S-05 is Svelte's own way to type a curve: an easing imported from `svelte/easing`, which `motif check` reports where it's passed (`easing: cubicOut`) as `raw-motion`. The fix is `easing.enter` from the generated `motion.ts`.

S-13's Arial has Arabic letters on Windows, so in Arabic the heading turns from IBM Plex Sans Arabic to Arial's Arabic rather than to boxes; the audit doesn't report it.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-svelte.test.ts` checks, on every change, that `motif check` reports exactly the seven check problems at their lines (S-14 as a warning on the generated file's first line) and nothing else, before and after `npm ci`, that `motif validate` finds nothing, and that every pinned line holds its anchor. Where Node and npm are installed, it also checks that `npm run check` (svelte-check) passes on the copy, and with a browser that `motif shot --sizes 390,1440 --audit --variant all --rtl` on `/`, `/loans`, `/sign-in` and `/tools/cordless-drill` reports S-06, S-07 and S-08 and nothing that isn't one of them or S-01's consequences.

The audit was checked on 2026-10-24 with SvelteKit 2.70, Svelte 5 and Vite 8 in Chrome: S-06 is 2.29:1 in light mode and 2.88:1 in dark, in both variants (left to right: the Arabic caption isn't reported); S-07 once per direction, on a phone only; S-08 once, grouped across the four pages; S-01's consequence as one group of eight places (the three badges on `/` and the one on the drill's page, in both variants; the right-to-left copies share their places). The judgement problems were looked at in the screenshots.
