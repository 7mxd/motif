# Checks and screenshots

What `motif check` and `motif shot --audit` report in a Svelte or SvelteKit app, and how to fix each finding.

`motif check` reads `.svelte` files as markup, the `{…}` values in it, and `<style>` blocks. In markup it reads `style="…"` and `style:prop="…"` (a literal value is read as CSS), the class names of `class="…"` and `class:name`, and the parameters of `transition:`, `in:`, `out:` and `animate:`. In script it reads easings imported from `svelte/easing`, `new Spring(…)`, `new Tween(…)` and Motion's `animate()`. It reports each finding at its line and column in the `.svelte` file. Template text, script strings and `{#if count > 13}` or `onclick={() => a > b}` are not values and are left alone.

A value that truly must stay as it is (a partner's brand colour, say) gets a `motif-ok: <reason>` comment on its line or the line above: `<!-- motif-ok: partner brand -->` in markup, `// motif-ok: …` in a script, `/* motif-ok: … */` in a style block. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason.

On Tailwind 3, Motif writes the CSS variables only, so its role classes (`bg-action-primary`, `text-body`) don't exist there and are reported as `tailwind-palette`. Use the role's variable as an arbitrary value instead: `bg-[var(--motif-color-action-primary)]`. Spacing classes (`p-4`) work on both.

## `raw-color`

A colour typed into markup, a `style:` directive or a `<style>` block: hex, `rgb()`, `hsl()`, `oklch()` or a named colour.

- Example: `style="color:#333"`, `style:background="#fff"`, `color: #4B5563` in `<style>`. (The same colour inside a Tailwind class, `text-[#4B5563]`, is reported as `tailwind-arbitrary`.)
- Fix: the colour role it stands for: `var(--motif-color-text-secondary)` in CSS or a `style:` directive, `text-text-secondary` as a class.

```svelte
<p class="note" style:color="var(--motif-color-text-secondary)">Saved</p>

<style>
  .note {
    border-block-end: 1px solid var(--motif-color-border);
  }
</style>
```

## `tailwind-arbitrary`

A Tailwind arbitrary value for a colour, spacing, radius, shadow or font size, in `class="…"` or in `class:name={…}`.

- Example: `class="bg-[#123456] p-[13px] rounded-[10px]"`, `class:p-[13px]={on}`.
- Fix: the matching role utility: `bg-action-primary`, `p-3`, `rounded-md`.

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { raised = false, children }: { raised?: boolean; children: Snippet } = $props();
</script>

<section class="bg-surface p-4 rounded-md" class:shadow-md={raised}>
  {@render children()}
</section>
```

## `tailwind-palette`

Tailwind's own colour palette.

- Example: `bg-blue-500`, `text-gray-600`.
- Fix: a role (`bg-action-primary`, `text-text-secondary`). Motif's theme removes Tailwind's palette, so these colours wouldn't render anyway.

## `off-scale`

A spacing, radius, font size or shadow value that isn't on the theme's scales.

- Example: `style="padding: 13px"`, `style:gap="13px"`, `.row { gap: 13px }` in `<style>`, or `p-7` when the spacing scale has no step 7. (`<img width={300}>` is an attribute, not a style, and isn't reported.)
- Fix: the nearest step of the scale. If the design truly needs a new step, propose a change to the design guide instead.

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="row" style:padding="var(--motif-space-4)">
  {@render children()}
</div>

<style>
  .row {
    display: flex;
    gap: var(--motif-space-3);
  }
</style>
```

## `raw-font`

A font family typed into a style.

- Example: `font-family: "Inter", sans-serif`, `style:font-family="Georgia"`.
- Fix: a font role (`font-body`, `font-display`) or `var(--motif-font-body-family)`. For a code font, the optional `font.mono` role (`font-mono`, `var(--motif-font-mono-family)`); if the theme has no mono role, propose adding it as a design guide change.

```svelte
<h1 class="title">Orders</h1>

<style>
  .title {
    font-family: var(--motif-font-display-family);
    font-size: var(--motif-font-display-size);
  }
</style>
```

## `raw-motion`

A duration, easing curve or spring typed into CSS, a Tailwind class, a transition's parameters, `new Spring`, `new Tween` or Motion's `animate()`.

- Example: `transition: opacity 300ms ease-in`, `duration-300`, `transition:fly={{ y: 8, duration: 300 }}`, `new Tween(0, { duration: 400 })`, `new Spring(0, { stiffness: 0.15, damping: 0.8 })`, an easing imported from `svelte/easing`.
- Fix: `var(--motif-duration-base)` and `var(--motif-easing-standard)` in CSS, `transition` and `ease-standard` in Tailwind, or `duration`, `easing` and `spring` from the generated `motion.ts` ([motion](motion.md)).

```svelte
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';
  import { duration, easing } from '$lib/design/motion';

  let { open }: { open: boolean } = $props();
</script>

{#if open}
  <p class="fade" transition:fly={{ y: 8, duration: prefersReducedMotion.current ? 0 : duration.base, easing: easing.standard }}>Saved</p>
{/if}

<style>
  .fade {
    transition: opacity var(--motif-duration-base) var(--motif-easing-standard);
  }
</style>
```

## `primitive-use`

A raw palette value (`primitive.*`) used in product code.

- Example: `var(--motif-primitive-color-indigo-700)`.
- Fix: the role that points at it (`var(--motif-color-action-primary)`).

## `reduced-motion`

The app animates, but nothing honours reduced motion. The check is split by what animates:

- **Transitions, `Spring`, `Tween` and Motion's `animate()`:** need `prefersReducedMotion` from `svelte/motion` somewhere in the app.
- **CSS animations and transitions:** need a `@media (prefers-reduced-motion: reduce)` query; `motif.css` has one, and it counts.
- Fix: read `prefersReducedMotion.current` and turn the movement off ([motion](motion.md#reduced-motion)).

```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';
  import { duration } from '$lib/design/motion';

  let { open }: { open: boolean } = $props();
</script>

{#if open}
  <p transition:fade={{ duration: prefersReducedMotion.current ? 0 : duration.base }}>Saved</p>
{/if}
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

- Fix: `prefersReducedMotion` from `svelte/motion` for transitions, `Spring`, `Tween` and Motion; a `prefers-reduced-motion` query for CSS animation.

## Screens behind a form or a click

`motif shot` captures each page as it loads. A screen that only appears after someone fills in a form, opens a panel or sends something needs a **state script**: a few lines of JavaScript, run in the page after it loads, that get it there. States are JavaScript whatever the app is written in. Keep one per state in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.js` for each.

Svelte listens to the field's own `input` event for `bind:value`, so set the value and send that event:

```js
// design/states/searched.js: the results after a search. Only the search page has the field.
const field = document.querySelector("input[name=q]");
if (!field) return;
field.value = "linen";
field.dispatchEvent(new Event("input", { bubbles: true }));
// Submit the form. A field outside a <form> has none: click the page's own button instead.
field.form?.requestSubmit();
```

- It runs in every page `motif shot` captures: start it with a guard that returns on other pages (`if (!field) return;`), or capture only its page with `--routes`.
- On a SvelteKit app, wait for the page to hydrate before clicking: the script runs after load, and a click before hydration does nothing (the form submits as a plain page load). Don't wait a fixed time; wait for something only the running app shows. Have the root layout set `data-ready` on `<body>` (`onMount(() => { document.body.dataset.ready = 'true' })`, with `onMount` imported from `svelte`), and start the script with `for (let i = 0; i < 50 && !document.body.hasAttribute("data-ready"); i++) await new Promise((r) => setTimeout(r, 100));`, which waits for the attribute and gives up after five seconds.
- Screenshots are named after the page and the state (`search@searched.mobile.png`); each starts as a first visit, and a script still running after 15 seconds is stopped and reported.
- Use the same `--state` options for `--save` and `--against`, and mock data only.
- For an app with right-to-left languages (Arabic, Hebrew), add `--rtl` to screenshot every screen right to left too.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the element and a screenshot. Fix what they report, then run them again until both are clean.
