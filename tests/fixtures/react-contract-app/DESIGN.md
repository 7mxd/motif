---
motifContract: 1
name: Larder
updated: 2026-10-14
---

# Larder design guide

Larder feels like a good neighbourhood grocer: warm, unhurried and honest about what things cost. Screens are calm, with plenty of room, earthy colours and a serif for headings that gives the app a crafted feel. One accent colour marks the thing you can do next, and nothing else competes with it. Prices and quantities are always easy to read.

## 1. Brief

- **What it is:** a grocery ordering app for a local shop: browse products, reorder your usual basket, track deliveries.
- **Who it is for:** busy households who shop weekly and want it done in a few minutes.
- **Personality:** warm, honest, unhurried, crafted.
- **Voice and tone:** friendly and plain. Short sentences, real numbers, no exclamation marks. "Your basket is on its way" rather than "Woohoo! Order placed!"

## 2. Direction

- **Style:** the Warm starting style: earthy neutrals, a terracotta accent, Fraunces for headings and DM Sans for text.
- **Starting preset:** Warm.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page; `surface` holds cards and lists; `surface-raised` lifts sheets, menus and selected rows. `action-primary` (terracotta) marks the one main action on a screen and links; `action-secondary` is for supporting actions. Status colours only for status: `success` for delivered and in stock, `warning` for low stock and delays, `danger` for problems and destructive actions, `info` for neutral notices. Text uses `text-primary`, and `text-secondary` for metadata.
- **Type:** `display` only for the basket total on checkout-style screens; `title` once per screen; `heading` for sections; `body` for content; `label` for controls and prices in lists; `caption` for metadata such as dates and units. Figures in prices are tabular.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` between related items, `space.6`–`space.8` between groups, `space.12` between page sections. Screens have `space.4` side padding on phones and `space.8` on desktops.
- **Corners and elevation:** `radius.sm` for chips and badges, `radius.md` for buttons, fields and cards, `radius.lg` for sheets and dialogs, `radius.full` for avatars and switches. Cards use a `border` and no shadow; `shadow.md` for menus and toasts, `shadow.lg` for dialogs and sheets.
- **Icons:** simple line icons drawn inline at 20 px with the text colour; icon-only buttons have an accessible name.

## 4. Motion

- **Presses and small changes:** `spring.snappy` for presses (scale to 0.97) and toggles; `duration.fast` for colour and opacity changes.
- **Screens and sheets:** sheets and dialogs move with `spring.smooth`; their backdrop fades with `duration.base`. Exits use `duration.fast` and `easing.exit`.
- **Lists and content:** new rows fade in with `duration.base`; skeletons pulse gently while loading and cross-fade to content.
- **Reduced motion:** the whole app sits inside `MotionConfig reducedMotion="user"`, so movement becomes fades for people who ask for less.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| Button | Actions | primary, secondary, ghost | default, hover, pressed, focused, disabled, loading |
| IconButton | Universal actions | ghost | as Button, with an accessible name |
| Input | One line of text | — | label, hint, focused, error, disabled, read-only |
| Textarea | Longer text | — | as Input |
| Select | One choice from a list | — | label, open, selected, focused, error, disabled |
| Checkbox | On/off inside a form | — | checked, unchecked, focused, disabled |
| Switch | A setting that applies at once | — | on, off, focused, disabled |
| Card | A group of related content | plain, link | default, pressed (link) |
| ListItem | A row in a list | plain, link | default, hover, pressed, selected |
| TopBar | Screen title and actions | — | default |
| TabBar | Main navigation on phones | — | current tab |
| Sidebar | Main navigation on desktop | — | current item |
| Sheet | A focused task from the bottom on phones | — | open, closing |
| Dialog | A decision that needs an answer | — | open |
| Toast | A short confirmation | info, success, danger | shown, with an optional action |
| Skeleton | Loading placeholder | line, block, circle | pulsing |
| EmptyState | Nothing here yet | — | with one action |
| ErrorState | Something failed | — | with Retry |
| Avatar | A person | image, initials | — |
| Badge | A status or count | neutral, success, warning, danger, info | — |

- **Do:** reuse these before adding new ones; extend with a variant first.
- **Don't:** style a one-off button or card inline.

## 6. Patterns

- **Navigation:** a bottom tab bar on phones (Home, Products) and a sidebar on desktop; detail screens have a back link.
- **Forms:** labels above fields, errors below them in words, checked when a field loses focus and on submit.
- **Empty, loading and error:** skeletons that match the content while loading; an empty state with one action; errors with Retry.
- **Feedback:** toasts for confirmations ("Added to your basket"), at least 5 s, with Undo where it helps; inline messages for errors.
- **Modal or sheet:** sheets for focused tasks on phones; dialogs only for decisions that need an answer.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring.
- Layouts use start/end (not left/right), so right-to-left languages work.

## 8. Platform notes

None yet.

## 9. Do / Don't

- **Do:** show prices with their unit ("£2.40 / kg"); keep one primary action per screen.
- **Don't:** use colour alone for stock or delivery status; centre long text.

## 10. Change log

- 2026-10-14 — Created the design guide — the Warm style fits a neighbourhood grocer — approved by the Motif team
