---
motifContract: 1
name: Maktaba
updated: 2026-10-20
---

# Maktaba design guide

Maktaba is the neighbourhood library in your pocket: find a book, see whether it's on the shelf, and keep track of what you've borrowed. It feels like a quiet reading room: paper-coloured backgrounds, plenty of room, one deep green for the thing to do next. It speaks English and Arabic equally well, so every layout is written from the start and end of a line, never its left and right. Dates and due days are always easy to read.

## 1. Brief

- **What it is:** a phone app for a neighbourhood library: browse the catalogue, open a book's page, see your loans and renew them, sign in with your library card.
- **Who it is for:** members of all ages, from parents borrowing picture books to students, many of whom read in Arabic and English.
- **Personality:** calm, welcoming, plain, trustworthy.
- **Voice and tone:** a helpful librarian. Short sentences, real dates, no exclamation marks. "Due back on 3 November" rather than "Don't forget!!"

## 2. Direction

- **Style:** the Minimal starting style, recoloured for a library: paper neutrals, a deep green accent, Onest for Latin text and Readex Pro for Arabic.
- **Starting preset:** Minimal.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page, a warm paper; `surface` holds lists and cards; `surface-raised` lifts sheets and menus. `action-primary` (deep green) marks the one main action on a screen; `action-secondary` is for supporting actions. Status colours only for status: `success` for on the shelf, `warning` for due soon, `danger` for overdue and errors, `info` for neutral notices. Text uses `text-primary`, and `text-secondary` for authors, dates and shelf marks.
- **Type:** `title` once per screen (the app bar's title); `heading` for sections; `body` for content and book titles in lists; `label` for controls and status; `caption` for metadata such as shelf marks. Latin text is Onest and Arabic text Readex Pro, chosen per letter, so a list can mix both.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` side padding and between related items, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for status labels and book covers, `radius.md` for buttons and fields, `radius.lg` for sheets and cards. Lists and cards use a `border` and no shadow; `shadow.md` only for menus and sheets.
- **Icons:** Material's outlined icons at 24 px in the text colour; an icon-only button always has a tooltip.

## Variants

- **Variants and who they serve:** **default** is Maktaba's own look, in deep green, for every member. **kids** (Kids' corner) is the palette for the children's corner: a soft plum accent and a warmer page, so the app feels like the picture-book room. It changes only `background`, `action-primary`, `action-secondary` and `focus`, and is readable in light and dark.
- **How the app chooses:** a switch on Home ("Kids' corner colours"), remembered on the phone. It starts off.
- **What changes beyond theme values:** nothing. Flutter variants change colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the icons and every status colour, so the app still reads as one library.

## 4. Motion

- **Presses and small changes:** Material's own ink ripple for presses; `duration.fast` with `easing.standard` for colour and opacity changes.
- **Screens and sheets:** the platform's own page transitions; sheets slide up with `duration.base` and `easing.enter`, and leave with `duration.fast` and `easing.exit`.
- **Lists and content:** skeleton rows pulse gently (`duration.slow`) while the catalogue loads, then the list replaces them.
- **Reduced motion:** every duration goes through `MotifMotion.duration(context, …)`, so it is zero when the phone asks for less motion; skeletons stop pulsing and show their still frame, and a button's spinner becomes its still label.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| AppButton | Actions | primary, secondary, quiet | default, hovered, pressed, focused, disabled, loading |
| AppField | One line of text | — | label, helper, focused, error, disabled |
| BookRow | A book in a list | — | default, pressed, focused |
| AvailabilityLabel | Whether a book is on the shelf, and loan status | on shelf, on loan, due soon, overdue | — |
| Skeleton | Loading placeholder | — | pulsing, still (reduced motion) |
| EmptyState | Nothing here yet | — | with one action |
| ErrorState | Something failed | — | with Try again |
| AppShell | Main navigation | tab bar (phones), side rail (tablets) | current destination |

- **Do:** reuse these before adding new ones; extend with an option first.
- **Don't:** style a one-off button or row inline.

## 6. Patterns

- **Navigation:** a bottom navigation bar on phones (Home, Books, Loans) that becomes a side rail on tablets; a book's page has the app bar's back button. Loans need someone signed in: anyone else goes to Sign in.
- **Forms:** labels above fields, help below them, errors below them in words, checked on submit.
- **Empty, loading and error:** skeleton rows in the list's own layout while loading; an empty state with one action; errors with Try again.
- **Feedback:** a snack bar for confirmations ("Renewed until 17 November"); inline messages for errors.
- **Modal or sheet:** sheets for short tasks; dialogs only for decisions that need an answer.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every tap target is at least 44×44 px.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring in the `focus` colour.
- Layouts use start and end (`EdgeInsetsDirectional`, `AlignmentDirectional`), never left and right, so Arabic mirrors correctly.

## 8. Platform notes

- **Flutter (Android and iOS):** one app for both, with Material 3 widgets. Arabic follows the phone's language; the catalogue keeps each book's own title, so English and Arabic titles share a list.

## 9. Do / Don't

- **Do:** show due dates as dates ("Due 3 Nov"), with a word beside the colour for every status; keep one primary action per screen.
- **Don't:** use colour alone for a loan's status; hard-code left or right.

## 10. Change log

- 2026-10-20 — Created the design guide, with the Kids' corner variant — the Minimal style, recoloured, fits a quiet neighbourhood library — approved by the Motif team
