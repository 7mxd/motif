---
motifContract: 1
name: Kitepost
updated: 2026-10-15
---

# Kitepost design guide

Kitepost feels like writing a postcard at a sunny kitchen table: gentle, friendly and quick. One page does one job: write a few lines, choose a stamp, send. The postcard preview sits right above the fields that change it, so you always see what you're making. Rounded shapes, soft colours and Nunito throughout keep it warm without getting in the way.

## 1. Brief

- **What it is:** a one-page tool for writing a short postcard and sending it (pretend: nothing is sent), with a list of recently sent postcards.
- **Who it is for:** anyone who wants to send a quick note to a friend or relative, often on a phone.
- **Personality:** gentle, friendly, quick, warm.
- **Voice and tone:** warm and plain. Short sentences, no exclamation marks. "Your postcard is on its way" rather than "Woohoo! Sent!"

## 2. Direction

- **Style:** the Soft starting style: warm neutrals, a gentle accent, Nunito for everything, generous corners.
- **Starting preset:** Soft.
- **References:** none.
- **Approved mockups:** none; the page was built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page; `surface` holds the form fields, the list and the top bar; `surface-raised` is the postcard's paper and the chosen stamp. `action-primary` marks the one main action (Send postcard) and the Kite stamp; `action-secondary` is for supporting actions and the Cloud stamp. Status colours only for status: `success` for delivered, `info` for on its way, `danger` for field errors. Text uses `text-primary`, and `text-secondary` for hints and metadata. The page's own names (`--paper`, `--ink`, `--ink-soft`, `--stamp`) are defined from these roles in `styles.css`.
- **Type:** `title` once per state of the page; `heading` for sections, the postcard's message and the site name; `body` for content and fields; `label` for controls; `caption` for hints, errors and dates.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4`–`space.5` between related items, `space.10` between sections. The page has `space.4` side padding and is at most 40rem wide.
- **Corners and elevation:** `radius.sm` for the stamp, `radius.md` for buttons and fields, `radius.lg` for the postcard, cards and the list, `radius.full` for choices and badges. The postcard alone has `shadow.md`; everything else is flat with a `border`.
- **Icons:** none yet; words carry every action.

## 4. Motion

- **Presses:** buttons scale to 0.97 with `duration.fast` and `easing.standard`.
- **Changes of state:** the sent message rises in with `duration.slow` and `easing.enter`.
- **Reduced motion:** `motif.css` stops animations and transitions for people who ask for less motion.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| Button | Actions | primary, secondary | default, pressed, focused, disabled, loading |
| Field | A labelled input or textarea | — | label, hint, focused, error, disabled |
| Choice | One option in a group of radio buttons | with a swatch | default, chosen, focused |
| Card | A group of related content | — | default |
| ListItem | A row in a list | — | default |
| Badge | A status in words | success, info | — |
| EmptyState | Nothing here yet | — | a title and one line |
| TopBar | The site's name | — | default |

- **Do:** reuse these before adding new ones; add a variant before a new component. New components go in `components.css` with a `Component:` line and a row here.
- **Don't:** style a one-off button or field in a page's own CSS.

## 6. Patterns

- **Navigation:** one page; the top bar names the site.
- **Forms:** labels above fields, the message's character count below it, errors below each field in words, checked when the form is sent.
- **Empty, loading and error:** the recent list has an empty state; nothing loads.
- **Feedback:** sending replaces the form with a confirmation and a tracking code, and a way to write another.
- **Modal or sheet:** none.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring.
- Layouts use start/end (not left/right), so right-to-left languages work.

## 8. Platform notes

- A plain web page: `index.html`, `components.css`, `styles.css`, `app.js` and `mock-data.js`, with `motif.css` linked first. Nunito is served from `fonts/`.

## 9. Do / Don't

- **Do:** keep the preview and the fields that change it on one screen; say who a postcard went to and when.
- **Don't:** use colour alone for a postcard's status; send without checking the form.

## 10. Change log

- 2026-10-15 — Created the design guide — the Soft style suits a friendly postcard tool — approved by the Motif team
