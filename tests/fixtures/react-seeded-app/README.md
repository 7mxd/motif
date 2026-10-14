# The seeded app

Larder (the contract app) with 23 planted problems, for test C: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies `../react-contract-app/` (without `node_modules/` and `.next/`), then `overlay/` on top, then deletes the paths in `seeded-issues.json`'s `remove` list (the products list's loading state and the product page's not-found state).

```bash
bun tests/fixtures/assemble.ts react-seeded-app <empty folder>
```

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| S-01 | exact (check) | Prices use a typed hex colour | `src/components/PriceTag.tsx:3` |
| S-02 | exact (check) | Arbitrary hex background on the promo banner | `src/components/PromoBanner.tsx:6` |
| S-03 | exact (check) | Tailwind's gray palette for units | `src/app/products/page.tsx:17` |
| S-04 | exact (check) | Off-scale padding `p-7` | `src/app/products/page.tsx:11` |
| S-05 | exact (check) | Hard-coded Georgia for recipe titles | `src/components/RecipeCard.tsx:6` |
| S-06 | exact (check) | Typed 0.6 s animation duration | `src/components/PromoBanner.tsx:7` |
| S-07 | exact (check) | A primitive colour variable in CSS | `src/app/promo.css:3` |
| S-08 | exact (check) | A typed `rgb()` background | `src/app/promo.css:2` |
| S-09 | exact (check, shot) | No `MotionConfig reducedMotion="user"`; the promo keeps moving | the whole app |
| S-10 | exact (check) | Generated theme CSS edited by hand | `src/styles/motif.css` |
| S-11 | exact (validate) | text-secondary too faint on light surfaces | `design/tokens.json` |
| S-12 | exact (shot) | Promo small print faded to unreadable | `/` |
| S-13 | exact (shot) | 20×20 px dismiss button | `/` |
| S-14 | judgement | Three primary buttons side by side | `/` |
| S-15 | judgement | A grid of identical emoji feature cards | `/` |
| S-16 | judgement | Emoji used as UI | `PromoBanner.tsx:8`, feature cards |
| S-17 | judgement | Gradient text on the promo headline | `PromoBanner.tsx:10` |
| S-18 | judgement | "Submit" and "Click here" buttons | `/products/oats` |
| S-19 | judgement | No loading or empty state on the product list | `/products` |
| S-20 | judgement | An unknown product crashes (no not-found state) | `src/app/products/[id]/page.tsx` |
| S-21 | judgement | No way back from a product | `/products/oats` |
| S-22 | judgement | Add buttons appear only on hover | `src/app/products/page.tsx:19` |
| S-23 | judgement | Everything centred; giant headline, tiny body | `/` |

## Changing it

Change the overlay and the list together. `cli/test/fixtures-seeded.test.ts` checks, on every change, that every problem `motif check` and `motif validate` can see is still exactly where the list says, and that they report nothing unplanned.

The problems only a browser can see were checked with `motif shot --audit --routes /,/products,/products/oats` on 2026-10-14 after `npm install` and `npm run build` (the build succeeds):

- S-12 and S-13 are reported on `/`, and S-09 as a `reduced-motion` finding on `/`. S-13 is rated minor: the 20 px button passes the 24 px WCAG minimum only because nothing sits close to it, so the 44 px phone check is what catches it.
- The other findings are consequences of planted problems: text-secondary text everywhere in light mode (S-11), the hex price colour (S-01, 3.7–4.5:1), and the promo banner and strip keeping their light backgrounds in dark mode (S-02, S-07, S-08).
- Nothing else was reported. (A 42 px wide product link was widened so it isn't an accidental extra finding.)
