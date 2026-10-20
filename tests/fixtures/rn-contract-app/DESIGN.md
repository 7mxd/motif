---
motifContract: 1
name: Dukkan
updated: 2026-10-20
---

# Dukkan design guide

Dukkan is the corner shop on your street, on your phone: look through what's on the shelves, open a product, fill a basket and send the order for collection. It should feel like the shop itself: a warm paper counter, clear prices, one terracotta button for the thing to do next. It speaks English and Arabic equally well, so every layout is written from the start and end of a line, never its left and right, and prices are always easy to read.

## 1. Brief

- **What it is:** a phone app for one neighbourhood shop: browse the catalogue, open a product's page, keep a basket and place an order for collection, sign in with a phone number.
- **Who it is for:** the shop's regulars, from students on their way home to parents doing the week's shop, many of whom read Arabic first.
- **Personality:** warm, quick, honest, neighbourly.
- **Voice and tone:** the shopkeeper who knows you. Short sentences, real prices and quantities, no exclamation marks. "Ready to collect in 20 minutes" rather than "Order placed!!"

## 2. Direction

- **Style:** the Minimal starting style, recoloured for a shop: warm paper neutrals, a terracotta accent, rounder corners, Onest for Latin text and Readex Pro for Arabic.
- **Starting preset:** Minimal.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page, a warm paper; `surface` holds lists and cards; `surface-raised` lifts sheets and menus. `action-primary` (terracotta) marks the one main action on a screen; `action-secondary` is for supporting actions such as the quantity buttons. Status colours only for status: `success` for in stock, `warning` for low stock, `danger` for sold out and errors, `info` for neutral notices. Text uses `text-primary`, and `text-secondary` for units, sizes and notes.
- **Type:** `title` once per screen (its top bar); `heading` for sections and a product's name on its page; `body` for content and product names in lists; `label` for controls, prices and status; `caption` for small notes such as a pack size. Latin text is Onest and Arabic text Readex Pro.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` side padding and between related items, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for status labels, `radius.md` for buttons, fields and product tiles, `radius.lg` for cards and sheets. Lists and cards use a `border` and no shadow; `shadow.md` only for menus and sheets.
- **Icons:** Ionicons' outline icons at 24 px in the text colour; an icon-only button always has a label a screen reader can say.

## Variants

- **Variants and who they serve:** **default** is Dukkan's daytime look, terracotta on paper, for everyone. **night-market** (Night market) is the shop's evening market stall: a deep violet accent, lantern amber in dark mode, and a dusk-coloured page, for the market nights the shop runs in Ramadan and the summer. It changes only `background`, `action-primary`, `action-secondary` and `focus`, and is readable in light and dark.
- **How the app chooses:** the shop turns it on for market nights; the app passes the variant to `MotifProvider`. Customers don't choose it.
- **What changes beyond theme values:** nothing. React Native variants change colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the icons and every status colour, so the app still reads as one shop.

## 4. Motion

- **Presses and small changes:** a dimmed fill on press (Android's ripple too); `duration.fast` with `easing.standard` for colour and opacity changes.
- **Screens and sheets:** the platform's own screen transitions through Expo Router's `Stack`.
- **Lists and content:** skeleton rows pulse gently (`duration.slow`, `easing.standard`) while the catalogue loads, then the list replaces them.
- **Reduced motion:** every animation reads `useMotifTheme().reducedMotion`; skeletons stop pulsing and show their still frame, and a button's spinner becomes its still label.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| AppButton | Actions | primary, secondary | default, pressed, focused, disabled, loading |
| IconButton | An action shown as an icon | — | default, pressed, focused |
| AppField | One line of text | — | label, helper, focused, error |
| ProductRow | A product in the catalogue | — | default, pressed, focused |
| QuantityStepper | How many of a product | — | default, at the minimum |
| StockLabel | Whether a product is in stock | in stock, low, sold out | — |
| Skeleton | Loading placeholder | — | pulsing, still (reduced motion) |
| EmptyState | Nothing here yet | — | with one action |
| ScreenHeader | A screen's title, with back where there is one | with back, without | — |

- **Do:** reuse these before adding new ones; extend with a prop first.
- **Don't:** style a one-off button or row inline.

## 6. Patterns

- **Navigation:** one stack. The catalogue is home, with the basket and sign-in in its header; a product's page and the basket have a back button in their header.
- **Forms:** the label sits above each field; help and errors sit below the field in words; checked on submit.
- **Empty, loading and error:** skeleton rows in the list's own layout while loading; an empty basket says so and leads back to the shop; errors in plain words with Try again.
- **Feedback:** the basket's count in the header changes as soon as something is added; the order's total is always visible above its button.
- **Modal or sheet:** none yet; sheets for short tasks when one is needed.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every tap target is at least 44×44 px.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring in the `focus` colour.
- Layouts use start and end (`marginStart`, `paddingEnd`, a row's `gap`), never left and right, so Arabic mirrors correctly.

## 8. Platform notes

- **React Native with Expo (Android and iOS):** one app for both, through Expo Router. Arabic follows the phone's language; the catalogue keeps each product's English and Arabic names. Screenshots are of Expo's web target.

## 9. Do / Don't

- **Do:** show prices with their currency, written the way the phone's language writes them ("KWD 1.250"), and the pack beside them ("1 L carton"); show a word beside the colour for every stock status; keep one primary action per screen.
- **Don't:** use colour alone for stock; hard-code left or right.

## 10. Change log

- 2026-10-20 — Created the design guide, with the Night market variant — the Minimal style, recoloured, fits a warm neighbourhood shop — approved by the Motif team
