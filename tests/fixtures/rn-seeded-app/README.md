# The Expo seeded app

Dukkan (the Expo contract app) with 14 planted problems, for test C on React Native: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../rn-contract-app/` (so `node_modules/`, `.expo/`, `dist/`, `.motif/` and screenshots never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts rn-seeded-app <empty folder>
```

Then run `npm ci` in the copy before `npx tsc --noEmit`, `npx expo start --web` or `motif shot`. The design guide and `package.json` are Dukkan's, unchanged; the generated theme is Dukkan's with E-14's one hand edit.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| E-01 | exact (check) | The "In stock" label filled with a typed green, `"#2E7D32"` | `components/stock-label.tsx:11` |
| E-02 | exact (check) | Off-scale padding `padding: 18` on the product page | `app/products/[id].tsx:68` |
| E-03 | exact (check) | Off-scale corner `borderRadius: 10` on the basket's lines | `app/basket.tsx:75` |
| E-04 | exact (check) | A typed `fontSize: 15` on the product's description | `app/products/[id].tsx:51` |
| E-05 | exact (check) | A raw `Easing.bezier(0.4, 0, 0.6, 1)` in the skeleton's pulse | `components/skeleton.tsx:17` |
| E-06 | exact (shot) | The text-rates caption faded to 50%: unreadable | `/sign-in`, `app/sign-in.tsx:51` |
| E-07 | exact (shot) | 32×32 "Add to basket" buttons on every product | `/`, `components/product-row.tsx:71` |
| E-08 | exact (shot) | A sign-in icon button with no `accessibilityLabel`, so no name | `/`, `app/index.tsx:26` |
| E-09 | judgement | Products crammed into tight rows, the pack size gone | `/`, `components/product-row.tsx` |
| E-10 | judgement | The product page's main action is a hand-made secondary pill, unlike every other main action | `/products/[id]`, `app/products/[id].tsx:55` |
| E-11 | judgement | The basket has no empty state | `/basket`, `app/basket.tsx` |
| E-12 | judgement | `marginLeft` on the top bar's title: wrong side in Arabic | every screen, `components/screen-header.tsx:42` |
| E-13 | exact (check) | The "On the shelves" heading hard-codes `fontFamily: "Georgia"` | `app/index.tsx:68` |
| E-14 | exact (check) | The generated theme edited by hand (`radius.md` 8 → 6) | `design/motif-theme.tsx` |

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `screen` is a route (`[id]` matches any value, so `/products/oat-milk` is `/products/[id]`), `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false. `wholeFile` on E-14 means a finding anywhere in `motif-theme.tsx` counts.

E-01's typed green passes in light mode (white on it is 5.1:1) but in dark mode the label's text is the dark on-success colour on the same green, about 3.3:1, so the audit reports every "In stock" label on `/` and a product's page in dark mode, in both variants and both directions; those are its declared consequences.

E-13's Georgia has no Arabic letters, so in Arabic the heading falls back to the system's font on the web target (not boxes); the audit doesn't report it.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-rn.test.ts` checks, on every change, that `motif check` reports exactly the seven check problems at their lines (E-14 as a warning on the generated file's first line) and nothing else, before and after `npm ci`, that `motif validate` finds nothing, and that every pinned line holds its anchor. Where Node and npm are installed, it also checks that `npx tsc --noEmit` passes on the copy, and with a browser that `motif shot --sizes 390 --audit --variant all --rtl` on `/`, `/sign-in`, `/basket` and `/products/oat-milk` reports E-06, E-07 and E-08 and nothing that isn't one of them or E-01's consequences.

The audit was checked on 2026-10-20 with Expo SDK 58 in Chrome: E-06 is 2.23:1 in light mode (2.21:1 in the night market) and 2.9:1 in dark; E-07 is reported for each of the four products in stock, once per direction (the sold-out eggs' button is disabled); E-08 once, on `/`. The judgement problems were looked at in the screenshots.
