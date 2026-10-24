# Components

How to build Svelte components that follow the design guide, and the starter set every new app gets.

## Where they live

`src/lib/components/`, one per file, named in PascalCase (`Button.svelte`, `TopBar.svelte`). A feature's own components go in `src/lib/components/<feature>/`, or next to the route that uses them (`src/routes/orders/OrderRow.svelte`) when nothing else will. Import them with the app's path to `src/lib`: `$lib/components/Button.svelte` in SvelteKit 2, `#lib/components/Button.svelte` in SvelteKit 3, a relative path in a Vite app.

To list what exists (the first step of adding a feature), read the components folder, then each component's `$props()` for its variants and states.

## How to build one

- **Svelte 5 runes.** Props with `$props()`, local state with `$state`, derived values with `$derived`, side effects with `$effect`. No `export let`, no `$:`, no `on:click` (use `onclick`).
- **Snippets for content.** The `children` snippet holds the label or body, rendered with `{@render children()}`; named snippets (`icon`, `actions`) are props of type `Snippet`. No `<slot>`.
- **The right element.** `<button>` for actions; `<a>` for navigation; a `<label>` for every input.
- **Variants as a prop.** A `variant` prop that selects a class. Styles in the component's `<style>`, which Svelte scopes, with `var(--motif-…)`: no colours, sizes or fonts of your own.
- **Other attributes pass through.** Type the props with the element's own (`HTMLButtonAttributes` from `svelte/elements`) and spread the rest onto it.
- **Hover** (`:hover`) is an extra; never hide an action behind it.
- **Focus.** Every interactive element shows a focus ring from the `focus` role with `:focus-visible`.
- **Disabled.** The `disabled` attribute (or `aria-disabled="true"` when the element must stay focusable), with a visible change.
- **Pressed.** `:active`, plus `aria-pressed` for a toggle.
- **Loading.** `aria-busy="true"`, the same width as before, and a spinner or skeleton inside.
- **Errors.** `aria-invalid="true"` on the field, and `aria-describedby` pointing at the error text, in the `danger` colour.
- **Names.** An icon-only control gets an `aria-label`; every input a `<label>`.
- **Touch targets.** At least 44 px: `min-block-size: var(--motif-space-12)`.

## Example: Button

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'ghost';

  interface Props extends HTMLButtonAttributes {
    variant?: Variant;
    loading?: boolean;
    children: Snippet;
  }

  let { variant = 'primary', loading = false, disabled = false, children, ...rest }: Props = $props();
</script>

<button
  type="button"
  class="button button-{variant}"
  disabled={disabled || loading}
  aria-busy={loading || undefined}
  {...rest}
>
  {@render children()}
</button>

<style>
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--motif-space-2);
    min-block-size: var(--motif-space-12);
    padding-inline: var(--motif-space-4);
    border: 0;
    border-radius: var(--motif-radius-md);
    font-family: var(--motif-font-label-family);
    font-size: var(--motif-font-label-size);
    cursor: pointer;
    transition: transform var(--motif-duration-fast) var(--motif-easing-standard);
  }
  .button-primary {
    background: var(--motif-color-action-primary);
    color: var(--motif-color-on-action-primary);
  }
  .button-secondary {
    background: var(--motif-color-action-secondary);
    color: var(--motif-color-on-action-secondary);
  }
  .button-ghost {
    background: transparent;
    color: var(--motif-color-text-primary);
  }
  .button:hover {
    filter: brightness(0.96);
  }
  .button:active {
    transform: scale(0.97);
  }
  .button:focus-visible {
    outline: 2px solid var(--motif-color-focus);
    outline-offset: 2px;
  }
  .button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
```

Everything here comes from the theme: the colours, the spacing, the corner radius, the label type role and the press timing. Its states are the element's own: `:hover`, `:focus-visible`, `:disabled`, pressed with `:active`, and loading with `aria-busy`. For a press spring, use `Spring` ([motion](motion.md)).

## Example: IconButton

An icon-only control has no text, so it needs a name. `label` is required, and becomes the `aria-label`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '$lib/components/Button.svelte';

  let { label, icon, onclick }: { label: string; icon: Snippet; onclick?: () => void } = $props();
</script>

<Button variant="ghost" aria-label={label} {onclick}>
  {@render icon()}
</Button>
```

## The starter set

Every new app gets these, each with all the states it needs. The names are roles; the files are in PascalCase (`Button.svelte`, `EmptyState.svelte`).

| Component | For | Built on | Must show |
|---|---|---|---|
| `Button` | Actions | `<button>` | default, hover, pressed, focused, disabled, loading |
| `IconButton` | Universal actions (close, back, menu) | `Button` | as Button, plus an `aria-label` |
| `Input` | One line of text | `<input>` | label, hint, focused, error, disabled, read-only |
| `Textarea` | Longer text | `<textarea>` | as Input |
| `Select` | One choice from a list | native `<select>`, or a headless library's `Select` for a custom one | label, open, selected, focused, error, disabled |
| `Checkbox` | On or off, part of a form | `<input type="checkbox">` | checked, unchecked, focused, disabled; the label is part of the target |
| `Switch` | A setting that applies at once | `<input type="checkbox" role="switch">` | on, off, focused, disabled; the label is part of the target |
| `Card` | A group of related content | `<div>` or `<article>` | default; pressed when the whole card is a link |
| `ListItem` | A row in a list | `<li>` with a link or button inside | default, hover, pressed, selected; the whole row is the target |
| `TopBar` | The screen title and its actions | `<header>` | default; scrolled (raised) |
| `TabBar` | Main navigation on phones | `<nav>` | the current tab marked with `aria-current` |
| `Sidebar` | Main navigation on desktop layouts | `<nav>` | the current item marked; collapsed |
| `Sheet` | A focused task that slides up on phones | `<dialog>`, or a headless `Dialog` | open, closing; focus moves in and back |
| `Dialog` | A decision that needs an answer | `<dialog>` with `showModal()` | open; Escape closes; focus moves in and back |
| `Toast` | A short confirmation | `<div>` with a polite live region | shown for at least 5 s; an action when there is one |
| `Skeleton` | Content that's loading | `<div>` | the layout of the content it stands in for |
| `EmptyState` | Nothing here yet | `<div>` | a title, one line, one action |
| `ErrorState` | Something failed | `<div>` | what happened, Retry, a way out |
| `Avatar` | A person | `<img>` | the photo, or initials when there's none |
| `Badge` | A status or count | `<span>` | a word or icon beside the colour |

The [accessibility guide](../../knowledge/accessibility.md) covers names, focus and announcements in detail, and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md) covers those three components. A project that already uses a component library (Skeleton, Bits UI, shadcn-svelte, Flowbite) keeps it: restyle its components to the theme's roles rather than adding a second set beside them.

## Each component in the design guide

When you add a shared component or change one, list it in `DESIGN.md` section 5: what it's for, its variants and its states.
