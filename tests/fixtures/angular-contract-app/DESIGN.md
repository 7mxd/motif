---
motifContract: 1
name: Ataa
updated: 2026-10-25
---

# Ataa design guide

Ataa (عطاء, "giving") is the volunteer-shift board of a neighbourhood food bank, in a browser: see which shifts still need hands, open a shift to read where it is and what to bring, sign up for it, and keep track of the shifts you've taken. It should feel like the food bank's own noticeboard on a good day: oat paper, olive ink, one clear button for the next thing to do, soft corners and a friendly serif for headings. It speaks English and Arabic equally well, so every layout is written from the start and end of a line, never its left and right.

## 1. Brief

- **What it is:** a web app for one food bank run by volunteers: browse the open shifts (sorting donations, packing boxes, delivering, the distribution day, the community kitchen), open a shift's page, sign up for one that has room or join the waiting list of one that's full, see your shifts and withdraw from one, and sign in with an email link.
- **Who it is for:** neighbours who can give a morning or an evening, from students who need volunteering hours to retired couples who drive the delivery van every week, many of whom read Arabic first.
- **Personality:** warm, generous, orderly, unfussy.
- **Voice and tone:** a shift lead at the door. Short sentences, real days and times, no exclamation marks. "Bring closed shoes; we start at 9:00 sharp" rather than "You're amazing!"

## 2. Direction

- **Style:** the Warm starting style, made a food bank's: oat paper and an olive green, soft corners, Fraunces for headings, Work Sans for text and Noto Kufi Arabic for Arabic.
- **Starting preset:** Warm.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page, oat paper; `surface` holds cards and forms; `surface-raised` lifts the sign-up confirmation. `action-primary` (olive) marks the one main action on a screen; `action-secondary` is for supporting actions, such as writing to the coordinator. Status colours only for status: `success` for a shift with room, `warning` for a shift with only a few places left, `danger` for errors, `info` for a full shift and neutral notices. Text uses `text-primary`, and `text-secondary` for times, places and notes.
- **Type:** `title` once per page (its heading); `heading` for sections, shift names in lists and the name in the top bar; `body` for content; `label` for controls, tabs, status and places left; `caption` for small notes such as a shift's kind or how an email is used. Headings are Fraunces, text is Work Sans, and Arabic text is Noto Kufi Arabic throughout.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` side padding and between related items, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for status labels, `radius.md` for buttons and fields, `radius.lg` for cards, forms and panels, `radius.full` for icon buttons. Cards use a `border` and no shadow; `shadow.md` only for the sign-up confirmation.
- **Icons:** simple line icons drawn at 20 px in the text colour, with a 1.75 px stroke; an icon-only control always has a name a screen reader can say, and the back arrow mirrors in Arabic.

## Variants

- **Variants and who they serve:** **default** is Ataa's everyday look, olive on oat, for everyone. **harvest-night** (Harvest night) is the look for the autumn harvest drive, when the food bank packs boxes in the evenings after work: a dusk lilac page with a plum accent in light mode, and a night page with a harvest-moon amber in dark mode. It changes only `background`, `action-primary`, `action-secondary` and `focus`, and is readable in light and dark.
- **How the app chooses:** the food bank's calendar (`harvestDrive` in the app's data) chooses it: during the drive the variant service, started with the app, writes `data-variant="harvest-night"` on `<html>` before the first page is drawn. A choice saved in the `variant` cookie wins over the calendar, so a settings page can offer it later. Volunteers don't choose it today.
- **What changes beyond theme values:** nothing. Harvest night changes colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the icons and every status colour, so the board still reads as one food bank.

## 4. Motion

- **Presses and small changes:** a slight scale on press, `duration.fast` with `easing.standard`; colour changes on hover in the same timing.
- **Screens and sheets:** pages change at once, with no transition, so moving between shifts is quick.
- **Lists and content:** the sign-up confirmation rises into place when you sign up or join a waiting list (`animate.enter` with a class timed by `duration.base` and `easing.enter`); a shift you withdraw from leaves My shifts with Motion's `spring.snappy` (`(animate.leave)`); nothing else moves on its own.
- **Reduced motion:** the confirmation's CSS animation is stopped by `motif.css`'s reduced-motion rule, so it simply appears; the withdrawal checks `matchMedia('(prefers-reduced-motion: reduce)')` and removes the row at once.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| Button | Actions, on a real `<button>` (`button[appButton]`) | primary, secondary | default, hover, pressed, focused, disabled |
| IconButton | An action or link shown as an icon | — | default, hover, pressed, focused |
| Icon | A line icon in the text colour | back, basket, user, clock, calendar, pin, people, check | — |
| TextField | One line of text | — | label, hint, focused, error |
| TopBar | The food bank's name, its pages and sign-in | — | the current page marked with `aria-current` |
| ShiftCard | A shift in the list, the whole card a link | — | default, hover, focused |
| StatusBadge | Whether a shift has room | open, few places left, full | — |
| EmptyState | Nothing here yet, or nothing found | — | with one action |
| SignupNote | The confirmation once you sign up or join a waiting list | — | entering (`animate.enter`) |

- **Do:** reuse these before adding new ones; extend with an input first.
- **Don't:** style a one-off button or card inline.

## 6. Patterns

- **Navigation:** a top bar on every page with the food bank's name, the two main pages (Shifts and My shifts) and sign-in. A shift's page has a back button before its title.
- **Forms:** the label sits above each field; hints and errors sit below the field in words; checked on submit; Enter submits.
- **Empty, loading and error:** the data is in memory, so nothing loads; with no shifts taken, My shifts says so and points to the open shifts; a shift that doesn't exist, or a page that doesn't, says so and leads back to the list.
- **Feedback:** signing up or joining a waiting list shows its confirmation in place, under the button, and the shift appears in My shifts with its day and time.
- **Modal or sheet:** none; every task fits on its page.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring in the `focus` colour.
- Layouts use start and end (`ps-4`, `margin-inline-start`, a row's `gap`), never left and right, so Arabic mirrors correctly.

## 8. Platform notes

- **Web (Angular):** one app for phones and desktops, laid out phone first with Tailwind's default breakpoints, drawn in the browser. The language follows the browser's: the locale service, started with the app, writes `lang` and `dir` (`rtl` in Arabic) on `<html>` through Angular's `DOCUMENT`. Shift names, places and what to bring are kept in English and Arabic in the app's data.

## 9. Do / Don't

- **Do:** give every shift its day, its hours and its places left; show dates, times and numbers the way the page's language writes them; keep one primary action per page.
- **Don't:** use colour alone for a shift's status; hard-code left or right.

## 10. Change log

- 2026-10-25 — Created the design guide, with the Harvest night variant — the Warm style, made a food bank's, fits a board where neighbours give their time to feed their neighbours — approved by the Motif team
