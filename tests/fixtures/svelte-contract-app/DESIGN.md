---
motifContract: 1
name: Adawat
updated: 2026-10-24
---

# Adawat design guide

Adawat is the neighbourhood's tool library, in a browser: see which tools are on the shelf, open a tool to read what comes with it and how long you can keep it, borrow it for a week, and keep track of what you have out. It should feel like a well-kept workshop wall: pale concrete, every tool on its hook, one deep blue button for the thing to do next, firm corners and plain, sturdy type. It speaks English and Arabic equally well, so every layout is written from the start and end of a line, never its left and right.

## 1. Brief

- **What it is:** a web app for one tool library run by volunteers in the community hall: browse the tools, open a tool's page, borrow one that's on the shelf or reserve one that's out, see your loans and when each is due back, and sign in with an email link.
- **Who it is for:** neighbours who need a drill for an afternoon or a ladder for a weekend, from people fixing up their first flat to retired builders who lend a hand on repair days, many of whom read Arabic first.
- **Personality:** practical, sturdy, orderly, neighbourly.
- **Voice and tone:** a volunteer at the counter. Short sentences, real days and deposits, no exclamation marks. "Bring it back by Saturday 31 October" rather than "You're all set!"

## 2. Direction

- **Style:** the Trust starting style, made a workshop's: concrete greys and a deep pegboard blue, firm corners, Archivo for headings, IBM Plex Sans for text and IBM Plex Sans Arabic for Arabic.
- **Starting preset:** Trust.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page, pale concrete; `surface` holds cards and forms; `surface-raised` lifts the loan confirmation. `action-primary` (pegboard blue) marks the one main action on a screen; `action-secondary` is for supporting actions, such as writing to a volunteer. Status colours only for status: `success` for a tool on the shelf, `warning` for a tool on loan, `danger` for errors, `info` for neutral notices. Text uses `text-primary`, and `text-secondary` for loan lengths, dates and notes.
- **Type:** `title` once per page (its heading); `heading` for sections, tool names in lists and the brand in the top bar; `body` for content; `label` for controls, tabs, status and deposits; `caption` for small notes such as a tool's kind or how an email is used. Headings are Archivo, text is IBM Plex Sans, and Arabic text is IBM Plex Sans Arabic throughout.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4` side padding and between related items, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for status labels, `radius.md` for buttons and fields, `radius.lg` for cards, forms and panels, `radius.full` for icon buttons. Cards use a `border` and no shadow; `shadow.md` only for the loan confirmation.
- **Icons:** simple line icons drawn at 20 px in the text colour, with a 1.75 px stroke; an icon-only control always has a name a screen reader can say, and the back arrow mirrors in Arabic.

## Variants

- **Variants and who they serve:** **default** is Adawat's everyday look, pegboard blue on concrete, for everyone. **workshop** (Workshop) is the look for the library's repair weekends, the first weekend of each month, when volunteers fix things in the hall's workshop: a rust accent on a sawdust page, with a warm amber in dark mode. It changes only `background`, `action-primary`, `action-secondary` and `focus`, and is readable in light and dark.
- **How the app chooses:** the library's calendar (`libraryWeekend` in the app's data) chooses it: on a repair weekend the server writes `data-variant="workshop"` on `<html>` as it draws the page, so it never flashes the default first. Members don't choose it.
- **What changes beyond theme values:** nothing. The workshop look changes colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the icons and every status colour, so the app still reads as one library.

## 4. Motion

- **Presses and small changes:** a slight scale on press, `duration.fast` with `easing.standard`; colour changes on hover in the same timing.
- **Screens and sheets:** pages change at once, with no transition, so moving between tools is quick.
- **Lists and content:** the loan confirmation rises into place when a tool is borrowed or reserved (Svelte's `fly`, `duration.base` with `easing.enter`); nothing else moves on its own.
- **Reduced motion:** the confirmation checks `prefersReducedMotion` and only fades in, without moving; every CSS transition is timed with the duration roles, which `motif.css` shortens.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| Button | Actions, or a link that looks like one | primary, secondary | default, hover, pressed, focused, disabled |
| IconButton | An action or link shown as an icon | — | default, hover, pressed, focused |
| Icon | A line icon in the text colour | back, wrench, user, clock, scale, pin, box, check | — |
| TextField | One line of text | — | label, hint, focused, error |
| TopBar | The library's name, its pages and sign-in | — | the current page marked with `aria-current` |
| ToolCard | A tool in the list, the whole card a link | — | default, hover, focused |
| StatusBadge | Whether a tool can be borrowed | on the shelf, on loan, in for repair | — |
| EmptyState | Nothing here yet, or nothing found | — | with one action |
| LoanNote | The confirmation once a tool is borrowed or reserved | — | entering (a Svelte transition) |

- **Do:** reuse these before adding new ones; extend with a prop first.
- **Don't:** style a one-off button or card inline.

## 6. Patterns

- **Navigation:** a top bar on every page with the library's name, the two main pages (Tools and My loans) and sign-in. A tool's page has a back button before its title.
- **Forms:** the label sits above each field; hints and errors sit below the field in words; checked on submit; Enter submits.
- **Empty, loading and error:** the data is in memory, so nothing loads; with nothing borrowed, My loans says so and points to the tools; a tool that doesn't exist, or a page that doesn't, says so and leads back to the list.
- **Feedback:** borrowing or reserving a tool shows its confirmation in place, under the button, and the loan appears in My loans with its due date.
- **Modal or sheet:** none; every task fits on its page.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring in the `focus` colour.
- Layouts use start and end (`ps-4`, `margin-inline-start`, a row's `gap`), never left and right, so Arabic mirrors correctly.

## 8. Platform notes

- **Web (SvelteKit):** one app for phones and desktops, laid out phone first with Tailwind's default breakpoints and drawn on the server. The language follows the browser's: the server reads it and writes `lang` and `dir` (`rtl` in Arabic) on `<html>`. Tool names, kits and care notes are kept in English and Arabic in the app's data.

## 9. Do / Don't

- **Do:** give every tool its loan length in days and its deposit beside it; show dates and numbers the way the page's language writes them; keep one primary action per page.
- **Don't:** use colour alone for a tool's status; hard-code left or right.

## 10. Change log

- 2026-10-24 — Created the design guide, with the Workshop variant — the Trust style, made a workshop's, fits a library of tools that people trust with a deposit — approved by the Motif team
