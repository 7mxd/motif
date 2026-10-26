# Platform rules

The web conventions and accessibility details a Vue or Nuxt app follows, beyond the design guide's own rules.

## Semantic HTML

- Landmarks: `<header>`, `<nav>`, `<main>` and `<footer>`, in `App.vue` or the Nuxt layout.
- One `<h1>` per page, and headings in order (no skipped levels).
- Real lists, buttons and links: a clickable `<div>` is neither a button to a screen reader nor to a keyboard. Navigate with `<RouterLink>` or `<NuxtLink>`.
- `lang` on `<html>`, so screen readers pronounce the text correctly. Vue: set it in `index.html`. Nuxt: `useHead({ htmlAttrs: { lang, dir } })` in `app.vue`, or the `lang` and `dir` that `@nuxtjs/i18n` sets.
- Images with `alt` text.

## Right to left

Use logical properties only, so right-to-left languages mirror for free:

| Instead of | Use |
|---|---|
| `margin-left`, `margin-right` | `margin-inline-start`, `margin-inline-end` |
| `padding-left`, `padding-right` | `padding-inline-start`, `padding-inline-end` |
| `left: 0`, `right: 0` | `inset-inline-start: 0`, `inset-inline-end: 0` |
| `text-align: left` | `text-align: start` |
| Tailwind `pl-4`, `ml-2`, `text-left` | `ps-4`, `ms-2`, `text-start` |

Set `dir="rtl"` on `<html>` for right-to-left languages, and mirror icons that point a direction (back, next). Vue with `vue-i18n`: keep the locale in state and set the attribute from it. In Nuxt:

```ts
const { locale } = useI18n()
useHead({ htmlAttrs: { lang: () => locale.value, dir: () => (locale.value === 'ar' ? 'rtl' : 'ltr') } })
```

Use `vue-i18n` (or `@nuxtjs/i18n`) for every string once the app has a second language; keep Arabic and English lengths in mind, since text grows by a third.

## Server rendering

With server rendering, a Nuxt page is drawn on the server first, so code that reads the browser (`window`, `document`, `localStorage`, `matchMedia`) must wait: put it in `onMounted`, or in a component wrapped in `<ClientOnly>`. Anything the first paint depends on (the theme, the variant, the locale) should come from a cookie (`useCookie`) or `useHead`, so the server draws the right one. A mismatch between the server's and the browser's first render is a hydration warning in the console: fix those, they cost a visible flash.

## Pointers and touch

- Hover effects are extras for devices that can hover (`@media (hover: hover)`). Never hide an action behind hover.
- Touch targets are at least 44 px. Where a dense desktop layout needs smaller controls, make them bigger on touch screens with `@media (pointer: coarse)`.

## Breakpoints

The design guide has no breakpoint roles, so use Tailwind's defaults (`sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem) and lay out phone first. If the project changes them, say so in `DESIGN.md` section 8.

## System settings

- Light and dark follow `prefers-color-scheme`; the generated CSS does this.
- Reduced motion follows `prefers-reduced-motion` ([motion](motion.md)).
- Text grows with browser zoom, so never fix the height of anything that holds text.

## Phones on the web

- The viewport meta tag (both starters add it).
- For bars pinned to the bottom, `viewport-fit=cover` and padding of `env(safe-area-inset-bottom)`, so they clear the home indicator. A safe-area inset isn't a design value: mark it `motif-ok: safe area` if `motif check` reports it.
- Inputs at least 16 px, so iOS doesn't zoom in when one is focused (the `body` role is 16 px in every starting style).

## Forms

- The right `type` and `inputmode` for each field, so phones show the right keyboard.
- `autocomplete` values (`email`, `name`, `current-password`, `one-time-code`…), so browsers and password managers can fill them.
- `enterkeyhint` on phone keyboards (`next`, `done`, `search`, `send`).
- Enter submits single-field forms such as search and sign-in: use `<form @submit.prevent>`, not a click handler on the button.
- Notes for the design guide: say in `DESIGN.md` section 8 what differs by platform on purpose.
