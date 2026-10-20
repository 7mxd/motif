---
motifContract: 1
name: Rafiq
updated: 2026-10-20
---

# Rafiq design guide

Rafiq ("companion" in Arabic) is a habit tracker that keeps you company: a short list of small things you mean to do today, a tick when you've done one, and a streak that grows quietly. It feels gentle and encouraging, never like a scoreboard: soft teal, warm sand, round corners and plenty of room. It speaks English and Arabic equally well, so every layout is written from the start and end of a line, never its left and right, and habit names in either language sit in the same list.

## 1. Brief

- **What it is:** an Android app for keeping small daily habits: today's list with a tick for each habit, a habit's page with its streak and the last two weeks, a form to add a habit, and sign-in.
- **Who it is for:** people building one or two new routines, in Arabic or English, who open the app for a few seconds a day.
- **Personality:** gentle, encouraging, calm, honest.
- **Voice and tone:** a kind friend. Short sentences, plain numbers, no exclamation marks and no guilt. "5 days in a row" rather than "Don't break your streak!!"

## 2. Direction

- **Style:** the Soft starting style, with a deeper teal accent: soft neutrals, warm sand for supporting actions, Nunito for Latin text and Readex Pro for Arabic, generous corners.
- **Starting preset:** Soft.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the screen; `surface` holds habit rows and fields; `surface-raised` lifts sheets and menus. `action-primary` (deep teal) marks the one main action on a screen and a ticked habit; `action-secondary` (sand) is for supporting actions and the streak badge. Status colours only for status: `success` for a habit done today, `danger` for field errors. Text uses `text-primary`, and `text-secondary` for help, counts and dates.
- **Type:** `title` once per screen (its first heading); `heading` for app bar titles and sections; `body` for habit names and content; `label` for controls and the streak badge; `caption` for help under fields. Latin text is Nunito and Arabic text Readex Pro, chosen by the app's language, so the whole screen changes with it.
- **Spacing:** the 4 px scale. `space.1`–`space.3` inside controls, `space.4` side padding and between rows, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for the history squares, `radius.md` for buttons and fields, `radius.lg` for habit rows and cards, `radius.full` for the streak badge. Rows and cards use a `border` and no shadow.
- **Icons:** Material's filled icons at 24 dp in the text colour; icons that point (back, a chevron) are the auto-mirrored ones; an icon-only button always has a content description.

## Variants

- **Variants and who they serve:** **default** is Rafiq's own look, in soft teal and sand. **contrast** (High contrast) is for people who find the soft palette hard to read: pure white or black screens, darker secondary text, stronger borders and a deeper accent. It changes only `background`, `text-primary`, `text-secondary`, `border`, `action-primary` and `focus`, and is readable in light and dark.
- **How the app chooses:** a switch at the end of Today ("High-contrast colours"), remembered on the phone. It starts off.
- **What changes beyond theme values:** nothing. Compose variants change colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the icons and every status colour.

## 4. Motion

- **Presses and small changes:** Material's own ripple for presses; a ticked row's border changes colour with `duration.fast` and `easing.standard`.
- **Screens and sheets:** Navigation Compose's own transitions between screens.
- **Lists and content:** the list appears at once (habits are on the phone); nothing staggers.
- **Reduced motion:** every duration goes through `MotifMotion.duration(…)`, so it is zero when Remove animations is on, and a button's spinner becomes its still label.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| AppButton | Actions | primary, secondary | default, pressed, focused, disabled, loading |
| AppField | One line of text | — | label, helper, focused, error |
| HabitRow | A habit in today's list, with its tick | — | default, done, pressed, focused |
| StreakBadge | How many days in a row | — | streak, not started |
| EmptyState | Nothing here yet | — | with one action |
| BackTopBar | The app bar of a page below Today | — | — |

- **Do:** reuse these before adding new ones; extend with an option first.
- **Don't:** style a one-off button or row inline.

## 6. Patterns

- **Navigation:** Today is the start; a habit's page and Add a habit open from it, each with the app bar's back button. Everything needs someone signed in: anyone else goes to Sign in.
- **Forms:** each field's label sits inside it and floats to its top edge once the field is focused or filled (Material's outlined field, through AppField); help and errors sit below the field in words; checked on submit.
- **Empty, loading and error:** habits live on the phone, so there is no loading; an empty Today has an empty state with one action, Add a habit.
- **Feedback:** the tick and the streak change at once; no confirmation messages for small things.
- **Modal or sheet:** none yet; dialogs only for decisions that need an answer.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every touch target is at least 48×48 dp.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring in the `focus` colour.
- Layouts use start and end (`padding(start = …)`, `Alignment.Start`), never left and right, and pointing icons are auto-mirrored, so Arabic mirrors correctly.

## 8. Platform notes

- **Android (Jetpack Compose):** Material 3 composables with the guide's look, edge to edge. Arabic follows the phone's language; habit names keep the language they were written in.

## 9. Do / Don't

- **Do:** show streaks as plain numbers with words ("5 days in a row"); keep one primary action per screen.
- **Don't:** shame a missed day; use colour alone to show a habit is done; hard-code left or right.

## 10. Change log

- 2026-10-20 — Created the design guide, with the High contrast variant — the Soft style, with a deeper teal, suits a gentle daily companion — approved by the Motif team
