# Platform rules

The web conventions and accessibility details a plain web site follows, beyond the design guide's own rules.

## Semantic HTML first

- Landmarks: `header`, `nav`, `main` and `footer`.
- One `h1` per page (or per state of a one-page tool), and headings in order.
- Native elements before ARIA: `button`, `a`, `input`, `select`, `dialog` and `details` already work with a keyboard and a screen reader. A clickable `div` is neither a button to a screen reader nor to a keyboard.
- `<html lang="…">` on every page, so screen readers pronounce the text correctly.
- Images with `alt` text; decorative ones with `alt=""`.

## Forms

- A visible `label` for every field. A placeholder isn't a label: it disappears as soon as someone types.
- A real `form` with a submit `button`, so Enter sends it. Where the site has a server, give the form an `action` and `method` so it works before the script loads.
- The right `type`, `inputmode` and `autocomplete` for each field (`email`, `name`, `tel`, `current-password`, `one-time-code`…), so phones show the right keyboard and browsers can fill them.
- `enterkeyhint` on phone keyboards (`next`, `done`, `search`, `send`).
- Check a field when it's left and when the form is sent; say what's wrong in words below it ([components](components.md#example-field)).

## Right to left

Use logical properties, so right-to-left languages mirror for free:

| Instead of | Use |
|---|---|
| `padding-left`, `padding-right` | `padding-inline-start`, `padding-inline-end` |
| `margin-left`, `margin-right` | `margin-inline-start`, `margin-inline-end` |
| `left`, `right` | `inset-inline-start`, `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `border-top` | `border-block-start` |

Set `dir="rtl"` on `<html>` for right-to-left languages, and mirror icons that point a direction with `:dir(rtl) .icon-back { transform: scaleX(-1); }`.

## Pointers and touch

- Hover effects go inside `@media (hover: hover)` and are extras: never hide an action behind hover.
- Touch targets are at least 44 px. Where a dense desktop layout needs smaller controls, make them bigger on touch screens with `@media (pointer: coarse)`.

## Breakpoints

The design guide has no breakpoint roles, and CSS variables can't be used in media queries, so use these widths and lay out phone first: `@media (min-width: 40rem)`, `48rem`, `64rem` and `80rem`. If the site uses others, say so in `DESIGN.md` section 8.

## System settings

- Light and dark follow `prefers-color-scheme`; `motif.css` does this ([theme code](tokens.md#dark-mode)).
- Reduced motion follows `prefers-reduced-motion` ([motion](motion.md#reduced-motion)).
- Text grows with browser zoom, so never fix the height of anything that holds text.

## Phones

- The viewport meta tag on every page: `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- For bars pinned to the bottom, `viewport-fit=cover` in that tag and `padding-block-end: env(safe-area-inset-bottom)`, so they clear the home indicator. A safe-area inset isn't a design value: mark it `motif-ok: safe area` if `motif check` reports it.
- Inputs at least 16 px, so iOS doesn't zoom in when one is focused (the `body` role is 16 px in every starting style).
- Things people use together stay on one screen: a live preview and the controls that change it, a field and its error, a total and the button that pays it. `motif shot` captures phones 360, 390 and 430 px wide, a tablet and a desktop: check each.
