# Platform rules

The web conventions and accessibility details a React web app follows, beyond the design guide's own rules.

## Semantic HTML

- Landmarks: `header`, `nav`, `main` and `footer`.
- One `h1` per page, and headings in order (no skipped levels).
- Real lists, buttons and links: a clickable `div` is neither a button to a screen reader nor to a keyboard.
- `<html lang="…">` set in the root layout, so screen readers pronounce the text correctly.
- Images with `alt` text (Next.js: the `Image` component for photos).

## Right to left

Use logical utilities and properties only, so right-to-left languages mirror for free:

| Instead of | Use |
|---|---|
| `pl-4`, `pr-4` | `ps-4`, `pe-4` |
| `ml-2`, `mr-2` | `ms-2`, `me-2` |
| `left-0`, `right-0` | `start-0`, `end-0` |
| `text-left`, `text-right` | `text-start`, `text-end` |
| `rounded-l-md`, `rounded-r-md` | `rounded-s-md`, `rounded-e-md` |

Set `dir="rtl"` on `<html>` for right-to-left languages, and mirror icons that point a direction (back, next) with `rtl:-scale-x-100`.

## Pointers and touch

- Hover effects are extras for devices that can hover; Tailwind v4's `hover:` applies only there. Never hide an action behind hover.
- Touch targets are at least 44 px. Where a dense desktop layout needs smaller controls, make them bigger on touch screens with the `pointer-coarse:` variant.

## Breakpoints

The design guide has no breakpoint roles, so use Tailwind's defaults (`sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem) and lay out phone first. If the project changes them, say so in `DESIGN.md` section 8.

## System settings

- Light and dark follow `prefers-color-scheme`; the generated CSS does this.
- Reduced motion follows `prefers-reduced-motion` ([motion](motion.md)).
- Text grows with browser zoom, so never fix the height of anything that holds text.

## Phones on the web

- The viewport meta tag (Next.js adds it).
- For bars pinned to the bottom, `viewport-fit=cover` and padding of `env(safe-area-inset-bottom)`, so they clear the home indicator. A safe-area inset isn't a design value, and `motif check` doesn't report `env(…)`, so it needs no `motif-ok`.
- Inputs at least 16 px, so iOS doesn't zoom in when one is focused (the `body` role is 16 px in every starting style).

## Forms

- The right `type` and `inputmode` for each field, so phones show the right keyboard.
- `autocomplete` values (`email`, `name`, `street-address`, `current-password`, `one-time-code`…), so browsers and password managers can fill them.
- `enterKeyHint` on phone keyboards (`next`, `done`, `search`, `send`).
- Enter submits single-field forms such as search and sign-in.
