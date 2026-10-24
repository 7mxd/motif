# Checks and screenshots

What `motif check` and `motif shot --audit` report in a Vue or Nuxt app, and how to fix each finding.

`motif check` reads `.vue` files as three parts: the template (including `:class`), the bindings (`:style`, `:transition`, `:animate`, `<Transition :duration>`) and the `<style>` blocks (scoped, SCSS and others). It reports each finding at its line and column in the `.vue` file. Template text, script strings and `v-if="count > 13"` are not values and are left alone.

A value that truly must stay as it is (a partner's brand colour, say) gets a `motif-ok: <reason>` comment on its line or the line above: `<!-- motif-ok: partner brand -->` in a template, `// motif-ok: …` in a script, `/* motif-ok: … */` in a style block. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason.

On Tailwind 3, Motif writes the CSS variables only, so its role classes (`bg-action-primary`, `text-body`) don't exist there and are reported as `tailwind-palette`. Use the role's variable as an arbitrary value instead: `bg-[var(--motif-color-action-primary)]`. Spacing classes (`p-4`) work on both.

## `raw-color`

A colour typed into a template, a style binding or a `<style>` block: hex, `rgb()`, `hsl()`, `oklch()` or a named colour.

- Example: `style="color:#333"`, `:style="{ background: '#fff' }"`, `color: #4B5563` in `<style scoped>`. (The same colour inside a Tailwind class, `text-[#4B5563]`, is reported as `tailwind-arbitrary`.)
- Fix: the colour role it stands for: `var(--motif-color-text-secondary)` in CSS or a binding, `text-text-secondary` as a class.

```vue
<template>
  <p class="note" :style="{ color: 'var(--motif-color-text-secondary)' }">Saved</p>
</template>

<style scoped>
.note {
  border-block-end: 1px solid var(--motif-color-border);
}
</style>
```

## `tailwind-arbitrary`

A Tailwind arbitrary value for a colour, spacing, radius, shadow or font size.

- Example: `class="bg-[#123456] p-[13px] rounded-[10px]"`.
- Fix: the matching role utility: `bg-action-primary`, `p-3`, `rounded-md`.

```vue
<template>
  <section class="bg-surface p-4 rounded-md">
    <slot />
  </section>
</template>
```

## `tailwind-palette`

Tailwind's own colour palette.

- Example: `bg-blue-500`, `text-gray-600`.
- Fix: a role (`bg-action-primary`, `text-text-secondary`). Motif's theme removes Tailwind's palette, so these colours wouldn't render anyway.

## `off-scale`

A spacing, radius, font size or shadow value that isn't on the theme's scales.

- Example: `:style="{ padding: '13px' }"`, `.row { gap: 13px }` in `<style scoped>`, or `p-7` when the spacing scale has no step 7. (`:width="300"` on an `<img>` is an attribute, not a style, and isn't reported.)
- Fix: the nearest step of the scale. If the design truly needs a new step, propose a change to the design guide instead.

```vue
<template>
  <div class="row" :style="{ padding: 'var(--motif-space-4)' }">
    <slot />
  </div>
</template>

<style scoped>
.row {
  display: flex;
  gap: var(--motif-space-3);
}
</style>
```

## `raw-font`

A font family typed into a style or binding.

- Example: `font-family: "Inter", sans-serif`, `:style="{ fontFamily: 'Georgia' }"`.
- Fix: a font role (`font-body`, `font-display`) or `var(--motif-font-body-family)`. For a code font, the optional `font.mono` role (`font-mono`, `var(--motif-font-mono-family)`); if the theme has no mono role, propose adding it as a design guide change.

```vue
<style scoped>
.title {
  font-family: var(--motif-font-display-family);
  font-size: var(--motif-font-display-size);
}
</style>
```

## `raw-motion`

A duration, easing curve or spring typed into CSS, a Tailwind class, `<Transition :duration>` or a Motion binding.

- Example: `transition: opacity 300ms ease-in`, `duration-300`, `<Transition :duration="300">`, `:transition="{ duration: 0.3 }"`.
- Fix: `var(--motif-duration-base)` and `var(--motif-easing-standard)` in CSS, `transition` and `ease-standard` in Tailwind, or `duration`, `easing` and `spring` from the generated `motion.ts` ([motion](motion.md)). For `<Transition>`, drop `:duration` and time it in CSS.

```vue
<script setup lang="ts">
import { motion } from 'motion-v'
import { duration, easing } from '../design/motion'
</script>

<template>
  <Transition name="fade"><p>Saved</p></Transition>
  <motion.div :animate="{ opacity: 1 }" :transition="{ duration: duration.base, ease: easing.standard }" />
</template>

<style scoped>
.fade-enter-active {
  transition: opacity var(--motif-duration-base) var(--motif-easing-standard);
}
</style>
```

## `primitive-use`

A raw palette value (`primitive.*`) used in product code.

- Example: `var(--motif-primitive-color-indigo-700)`.
- Fix: the role that points at it (`var(--motif-color-action-primary)`).

## `reduced-motion`

The app animates, but nothing honours reduced motion.

- Fix: for Motion for Vue, `<MotionConfig reduced-motion="user">` at the root or `useReducedMotion()`; for `<Transition>` and CSS animation, a `@media (prefers-reduced-motion: reduce)` query ([motion](motion.md#reduced-motion)).

```vue
<script setup lang="ts">
import { MotionConfig } from 'motion-v'
</script>

<template>
  <MotionConfig reduced-motion="user">
    <slot />
  </MotionConfig>
</template>
```

## `generated-edited`

A generated theme file was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Contrast

From `motif shot --audit`: text measured on screen below 4.5:1 (3:1 for large text).

- Fix: use the text role the design guide pairs with that surface (`var(--motif-color-text-primary)` on `var(--motif-color-surface-raised)`). If a pair itself fails, `motif validate` reports it too, and the role values need changing.

## Target size

From `motif shot --audit`: a control smaller than 24×24 px (critical), or smaller than 44×44 px on touch screens: the phone and tablet sizes (minor).

- Fix: `min-block-size: var(--motif-space-12)` on buttons, the same for icon buttons' width, more padding around small links, or more space between neighbouring controls.

## Reduced motion

From `motif shot --audit`: something still moves when reduced motion is on.

- Fix: `<MotionConfig reduced-motion="user">` at the root, or `useReducedMotion()` for custom animation; a `prefers-reduced-motion` query for CSS and `<Transition>` animation.

## Screens behind a form or a click

`motif shot` captures each page as it loads. A screen that only appears after someone fills in a form, opens a panel or sends something needs a **state script**: a few lines of JavaScript, run in the page after it loads, that get it there. States are JavaScript whatever the app is written in. Keep one per state in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.js` for each.

Vue listens to the field's own `input` event for `v-model`, so set the value and send that event:

```js
// design/states/searched.js: the results after a search. Only the search page has the field.
const field = document.querySelector("input[name=q]");
if (!field) return;
field.value = "linen";
field.dispatchEvent(new Event("input", { bubbles: true }));
// A field outside a <form>: click the page's own button instead.
field.form?.requestSubmit();
```

- It runs in every page `motif shot` captures: start it with a guard that returns on other pages (`if (!field) return;`), or capture only its page with `--routes`.
- On a Nuxt app, wait for the page to hydrate before clicking: the script runs after load, and a click before hydration does nothing. A short `await new Promise((r) => setTimeout(r, 500))` at the top is enough.
- Screenshots are named after the page and the state (`search@searched.mobile.png`); each starts as a first visit, and a script still running after 15 seconds is stopped and reported.
- Use the same `--state` options for `--save` and `--against`, and mock data only.
- For an app with right-to-left languages (Arabic, Hebrew), add `--rtl` to screenshot every screen right to left too.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the element and a screenshot. Fix what they report, then run them again until both are clean.
