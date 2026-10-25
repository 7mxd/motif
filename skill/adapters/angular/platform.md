# Platform rules

The web conventions and accessibility details an Angular app follows, beyond the design guide's own rules.

## Semantic HTML

- Landmarks: `<header>`, `<nav>`, `<main>` and `<footer>`, in the root component's template (`src/app/app.html`), around `<router-outlet />`.
- One `<h1>` per page, and headings in order (no skipped levels).
- Real lists, buttons and links: a clickable `<div>` is neither a button to a screen reader nor to a keyboard. Navigate with `<a routerLink>`; the router handles the click without a reload.
- `lang` on `<html>`, so screen readers pronounce the text correctly: in `src/index.html`, and per locale as below.
- Images with `alt` text (`NgOptimizedImage`'s `ngSrc` keeps it required).
- A page's title, different on every route: `title` on each route in `app.routes.ts` (`{ path: 'orders', title: 'Orders', … }`), which the router sets on navigation.

## Right to left

Use logical properties only, so right-to-left languages mirror for free:

| Instead of | Use |
|---|---|
| `margin-left`, `margin-right` | `margin-inline-start`, `margin-inline-end` |
| `padding-left`, `padding-right` | `padding-inline-start`, `padding-inline-end` |
| `left: 0`, `right: 0` | `inset-inline-start: 0`, `inset-inline-end: 0` |
| `text-align: left` | `text-align: start` |
| Tailwind `pl-4`, `ml-2`, `text-left` | `ps-4`, `ms-2`, `text-start` |

Set `dir="rtl"` on `<html>` for right-to-left languages, and mirror icons that point a direction (back, next). An app in one language writes both in `src/index.html`:

```html
<html lang="ar" dir="rtl">
```

**More than one language.** `@angular/localize` builds one app per locale (`ng build --localize`, each locale in its own folder), and sets `lang` on `<html>` in each copy of `src/index.html`, but not `dir`. Set it from the locale when the app starts, through Angular's `DOCUMENT`, so a server-rendered page has it too. In `app.ts`:

```ts
import { Component, DOCUMENT, LOCALE_ID, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

const RTL = new Set(['ar', 'he', 'fa', 'ur']);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    const locale = inject(LOCALE_ID);
    const html = inject(DOCUMENT).documentElement;
    html.setAttribute('lang', locale);
    html.setAttribute('dir', RTL.has(locale.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr');
  }
}
```

An app that switches language while it runs (with a runtime library such as Transloco or ngx-translate) sets the same two attributes whenever the language changes. Keep Arabic and English lengths in mind: text grows by a third.

**The CDK and Angular Material** read the direction through `Directionality` from `@angular/cdk/bidi`, which takes `dir` from `<html>` or `<body>` when the app starts. For a direction that changes while the app runs, put `[dir]="dir()"` on an element that wraps the app, with the CDK's `Dir` directive (`imports: [BidiModule]`), so menus, dialogs and sliders follow. In your own components, read `inject(Directionality).value` rather than the DOM, and `valueSignal` (or `change`) to follow it.

## Server rendering

With server rendering (`ng new --ssr`, or `ng add @angular/ssr`), a page is drawn on the server first, so code that reads the browser (`window`, `document`, `localStorage`, `matchMedia`) must wait: put it in `afterNextRender` (or `afterEveryRender`), which runs in the browser only, or in an event handler. Use Angular's `DOCUMENT` for what the server must draw too (the `<html>` attributes above, [the variant](tokens.md#switching-variants)). Anything the first paint depends on (the theme, the variant, the locale) should come from the request (a cookie, read through `REQUEST`), so the server draws the right one. A mismatch between the server's and the browser's first render is a hydration error in the console (`NG0500` and its neighbours): fix those, they cost a visible flash. Data the server fetched with `HttpClient` is passed to the browser with the page, so it isn't fetched twice; give a failing request a state (`ErrorState`), not a blank page.

## Pointers and touch

- Hover effects are extras for devices that can hover (`@media (hover: hover)`). Never hide an action behind hover.
- Touch targets are at least 44 px. Where a dense desktop layout needs smaller controls, make them bigger on touch screens with `@media (pointer: coarse)`.

## Breakpoints

The design guide has no breakpoint roles, so use Tailwind's defaults (`sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem) and lay out phone first. The CDK's `BreakpointObserver` takes the same widths in a media query when code needs to know. If the project changes them, say so in `DESIGN.md` section 8.

## System settings

- Light and dark follow `prefers-color-scheme`; the generated CSS does this.
- Reduced motion follows `prefers-reduced-motion` ([motion](motion.md)).
- Text grows with browser zoom, so never fix the height of anything that holds text.

## Phones on the web

- The viewport meta tag (`ng new` adds it to `src/index.html`).
- For bars pinned to the bottom, `viewport-fit=cover` and padding of `env(safe-area-inset-bottom)`, so they clear the home indicator. A safe-area inset isn't a design value, and `motif check` doesn't report `env(…)`, so it needs no `motif-ok`.
- Inputs at least 16 px, so iOS doesn't zoom in when one is focused (the `body` role is 16 px in every starting style).

## Forms

- The right `type` and `inputmode` for each field, so phones show the right keyboard.
- `autocomplete` values (`email`, `name`, `current-password`, `one-time-code`…), so browsers and password managers can fill them.
- `enterkeyhint` on phone keyboards (`next`, `done`, `search`, `send`).
- Enter submits single-field forms such as search and sign-in: use a `<form>` with `(ngSubmit)` (or `(submit)`), not a click handler on the button.
- Errors: show a field's error once it's touched or the form is submitted, with `aria-invalid` and `aria-describedby` bound from the control's state.
- Notes for the design guide: say in `DESIGN.md` section 8 what differs by platform on purpose.
