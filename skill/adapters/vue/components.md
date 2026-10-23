# Components

How to build Vue components that follow the design guide, and the starter set every new app gets.

## Where they live

- **Vite:** `src/components/`, one per file, named in PascalCase (`BaseButton.vue`; multi-word names keep Vue's lint happy). A feature's own components go in `src/components/<feature>/`.
- **Nuxt:** `components/` (`app/components/` in Nuxt 4), with auto-imports: a file there is usable in every template without an import, and a folder adds its name (`components/form/Input.vue` is `<FormInput>`).

To list what exists (the first step of adding a feature), read the components folder, then each component's `defineProps` for its variants and states.

## How to build one

- **Single-file components with `<script setup lang="ts">`.** Props with `defineProps<{ … }>()`, events with `defineEmits`, two-way values with `defineModel`.
- **The right element.** `<button>` for actions; `<a>`, or `<RouterLink>` / `<NuxtLink>`, for navigation; a `<label>` for every input.
- **Slots for content.** The default slot for the label or body; named slots for icons and actions. Vue passes the element's other attributes to the root element.
- **Variants as a prop.** A `variant` prop that selects a class. Styles in `<style scoped>` with `var(--motif-…)`: no colours, sizes or fonts of your own.
- **Hover** (`:hover`) is an extra; never hide an action behind it.
- **Focus.** Every interactive element shows a focus ring from the `focus` role with `:focus-visible`.
- **Disabled.** The `disabled` attribute (or `aria-disabled="true"` when the element must stay focusable), with a visible change.
- **Pressed.** `:active`, plus `aria-pressed` for a toggle.
- **Loading.** `aria-busy="true"`, the same width as before, and a spinner or skeleton inside.
- **Errors.** `aria-invalid="true"` on the field, and `aria-describedby` pointing at the error text, in the `danger` colour.
- **Names.** An icon-only control gets an `aria-label`; every input a `<label>`.
- **Touch targets.** At least 44 px: `min-block-size: var(--motif-space-12)`.

## Example: Button

```vue
<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost'

withDefaults(defineProps<{ variant?: Variant; loading?: boolean; disabled?: boolean }>(), {
  variant: 'primary',
  loading: false,
  disabled: false,
})
</script>

<template>
  <button
    type="button"
    class="button"
    :class="`button-${variant}`"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <slot />
  </button>
</template>

<style scoped>
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

Everything here comes from the theme: the colours, the spacing, the corner radius, the label type role and the press timing. Its states are the element's own: `:hover`, `:focus-visible`, `:disabled`, pressed with `:active`, and loading with `aria-busy`. For a press spring, use Motion for Vue ([motion](motion.md)).

## The starter set

Every new app gets these, each with all the states it needs:

| Component | For | Built on | Must show |
|---|---|---|---|
| `Button` | Actions | `<button>` | default, hover, pressed, focused, disabled, loading |
| `IconButton` | Universal actions (close, back, menu) | `Button` | as Button, plus an `aria-label` |
| `Input` | One line of text | `<input>` | label, hint, focused, error, disabled, read-only |
| `Textarea` | Longer text | `<textarea>` | as Input |
| `Select` | One choice from a list | native `<select>`, or Reka UI `Select` for a custom one | label, open, selected, focused, error, disabled |
| `Checkbox` | On or off, part of a form | `<input type="checkbox">` | checked, unchecked, focused, disabled; the label is part of the target |
| `Switch` | A setting that applies at once | `<input type="checkbox" role="switch">` | on, off, focused, disabled; the label is part of the target |
| `Card` | A group of related content | `<div>` or `<article>` | default; pressed when the whole card is a link |
| `ListItem` | A row in a list | `<li>` with a link or button inside | default, hover, pressed, selected; the whole row is the target |
| `TopBar` | The screen title and its actions | `<header>` | default; scrolled (raised) |
| `TabBar` | Main navigation on phones | `<nav>` | the current tab marked with `aria-current` |
| `Sidebar` | Main navigation on desktop layouts | `<nav>` | the current item marked; collapsed |
| `Sheet` | A focused task that slides up on phones | `<dialog>`, or Reka UI `Dialog` | open, closing; focus moves in and back |
| `Dialog` | A decision that needs an answer | `<dialog>` with `showModal()` | open; Escape closes; focus moves in and back |
| `Toast` | A short confirmation | `<div>` with a polite live region | shown for at least 5 s; an action when there is one |
| `Skeleton` | Content that's loading | `<div>` | the layout of the content it stands in for |
| `EmptyState` | Nothing here yet | `<div>` | a title, one line, one action |
| `ErrorState` | Something failed | `<div>` | what happened, Retry, a way out |
| `Avatar` | A person | `<img>` | the photo, or initials when there's none |
| `Badge` | A status or count | `<span>` | a word or icon beside the colour |

The [accessibility guide](../../knowledge/accessibility.md) covers names, focus and announcements in detail, and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md) covers those three components. A project that already uses a component library (Vuetify, PrimeVue, Nuxt UI) keeps it: restyle its components to the theme's roles rather than adding a second set beside them.

## Each component in the design guide

When you add a shared component or change one, list it in `DESIGN.md` section 5: what it's for, its variants and its states.
