---
motifContract: 1
name: Bustan
updated: 2026-10-23
---

# Bustan design guide

Bustan is the neighbourhood's community garden, in a browser: see which raised beds are free, open a plot to read about its sun, soil and water, book it for the season, and keep a log of what you pick. It should feel like the garden on a calm morning: pale sage paper, one leaf-green button for the thing to do next, soft corners and a friendly serif for headings. It speaks English and Arabic equally well, so every layout is written from the start and end of a line, never its left and right.

## 1. Brief

- **What it is:** a web app for one community garden: browse the plots, open a plot's page, book a free one for the season, log each harvest by weight, and sign in with an email link.
- **Who it is for:** the garden's members and neighbours who want a plot, from retired growers who know every bed to families trying it for the first time, many of whom read Arabic first.
- **Personality:** calm, friendly, practical, neighbourly.
- **Voice and tone:** a fellow gardener at the shed. Short sentences, real sizes and weights, no exclamation marks. "Plot 4 is yours until 30 November" rather than "Booking confirmed!"

## 2. Direction

- **Style:** the Soft starting style, recoloured for a garden: sage and leaf-green neutrals, rounded corners, Fraunces for headings, Nunito for text and Tajawal for Arabic.
- **Starting preset:** Soft.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page, a pale sage paper; `surface` holds cards and forms; `surface-raised` lifts menus and the booking confirmation. `action-primary` (leaf green) marks the one main action on a screen; `action-secondary` is for supporting actions, such as writing to the garden team. Status colours only for status: `success` for a free plot, `warning` for a plot with a waiting list, `danger` for errors, `info` for neutral notices. Text uses `text-primary`, and `text-secondary` for sizes, dates and notes.
- **Type:** `title` once per page (its heading); `heading` for sections and the brand in the top bar; `body` for content and plot names in lists; `label` for controls, tabs and status; `caption` for small notes such as how an email is used. Headings are Fraunces, text is Nunito, and Arabic text is Tajawal throughout.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` side padding and between related items, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for status labels, `radius.md` for buttons and fields, `radius.lg` for cards and forms, `radius.full` for icon buttons. Cards use a `border` and no shadow; `shadow.md` only for the booking confirmation.
- **Icons:** simple line icons drawn at 20 px in the text colour, with a 1.75 px stroke; an icon-only control always has a name a screen reader can say, and the back arrow mirrors in Arabic.

## Variants

- **Variants and who they serve:** **default** is Bustan's growing-season look, leaf green on sage paper, for everyone. **harvest** (Harvest) is the autumn look for the harvest weeks in October and November, when the garden holds its open days: a rust accent on a warm wheat page, with ember orange in dark mode. It changes only `background`, `action-primary`, `action-secondary` and `focus`, and is readable in light and dark.
- **How the app chooses:** the garden's season (`gardenSeason` in the app's data) chooses it: in the harvest weeks the app sets `data-variant="harvest"` on `<html>` before it mounts. Members don't choose it.
- **What changes beyond theme values:** nothing. The harvest look changes colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the icons and every status colour, so the app still reads as one garden.

## 4. Motion

- **Presses and small changes:** a slight scale on press, `duration.fast` with `easing.standard`; colour changes on hover in the same timing.
- **Screens and sheets:** pages change at once, with no transition, so moving between plots is quick.
- **Lists and content:** the booking confirmation rises into place with `spring.smooth` (Motion for Vue) when a plot is booked; nothing else moves on its own.
- **Reduced motion:** the app is wrapped once in `<MotionConfig reduced-motion="user">`, so the confirmation fades in without moving, and every CSS transition is timed with the duration roles, which `motif.css` shortens.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| AppButton | Actions | primary, secondary | default, hover, pressed, focused, disabled |
| IconButton | An action or link shown as an icon | — | default, hover, pressed, focused |
| AppIcon | A line icon in the text colour | back, leaf, sun, part-sun, shade, drop, ruler, user, basket, check | — |
| TextField | One line of text | — | label, hint, focused, error |
| TopBar | The garden's name, its pages and sign-in | — | the current page marked with `aria-current` |
| PlotCard | A plot in the list, the whole card a link | — | default, hover, focused |
| StatusBadge | Whether a plot is free | free, waiting list, booked | — |
| EmptyState | Nothing here yet, or nothing found | — | with one action |
| BookingNote | The confirmation once a plot is booked | — | entering (Motion for Vue) |

- **Do:** reuse these before adding new ones; extend with a prop first.
- **Don't:** style a one-off button or card inline.

## 6. Patterns

- **Navigation:** a top bar on every page with the garden's name, the two main pages (Plots and Harvest log) and sign-in. A plot's page has a back button before its title.
- **Forms:** the label sits above each field; hints and errors sit below the field in words; checked on submit; Enter submits.
- **Empty, loading and error:** the data is in memory, so nothing loads; an empty harvest log says so and points to the plots; a plot that doesn't exist says so and leads back to the list.
- **Feedback:** booking a plot shows its confirmation in place, under the button; a logged harvest appears at the top of the list with the season's total above it.
- **Modal or sheet:** none; every task fits on its page.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring in the `focus` colour.
- Layouts use start and end (`ps-4`, `margin-inline-start`, a row's `gap`), never left and right, so Arabic mirrors correctly.

## 8. Platform notes

- **Web (Vue with Vite):** one app for phones and desktops, laid out phone first with Tailwind's default breakpoints. The language follows the browser's: Arabic sets `lang="ar"` and `dir="rtl"` on `<html>`. Plot names and crops are kept in English and Arabic in the app's data.

## 9. Do / Don't

- **Do:** give every plot its size in square metres and its light in words ("Full sun", "Part shade") beside the icon; show weights in kilograms the way the page's language writes them; keep one primary action per page.
- **Don't:** use colour alone for a plot's status; hard-code left or right.

## 10. Change log

- 2026-10-23 — Created the design guide, with the Harvest variant — the Soft style, recoloured, fits a calm neighbourhood garden — approved by the Motif team
