# Components

How to build React components that follow the design guide, and the starter set every new app gets.

## Where they live

Components live in `src/components/`, one per file, named in PascalCase (`Button.tsx`). Projects that use shadcn/ui keep theirs in `src/components/ui/`: restyle those to the theme's roles rather than adding a second set beside them.

To list what exists (the first step of adding a feature), read the components folder, then each component's props for its variants and states.

## How to build one

- **The right element.** `button` for actions; `a`, or the router's link, for navigation; a `label` for every input.
- **Pass things through.** Accept `className` and the element's other props, and pass them on.
- **Variants as a prop.** A `variant` prop mapped to lists of classes. No inline styles, no values of your own: theme values only.
- **Hover.** Tailwind v4's `hover:` already applies only on devices that can hover, so it's safe as an extra; never hide an action behind it.
- **Focus.** Every interactive element shows a focus ring from the `focus` role: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`.
- **Disabled.** The `disabled` attribute (or `aria-disabled="true"` when the element must stay focusable), with a visible change.
- **Loading.** `aria-busy="true"`, the same width as before, and a spinner or skeleton inside.
- **Errors.** `aria-invalid="true"` on the field, and `aria-describedby` pointing at the error text, shown in `text-danger`.
- **Touch targets.** At least 44 px: `min-h-12` and `px-4` on buttons, `size-12` on icon buttons.

## Example: Button

```tsx
import { motion, type HTMLMotionProps } from "motion/react";
import { spring } from "@/design/motion";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action-primary text-on-action-primary",
  secondary: "bg-action-secondary text-on-action-secondary",
  ghost: "bg-transparent text-text-primary hover:bg-surface-raised",
};

export function Button({ variant = "primary", loading = false, disabled, className = "", children, ...props }: HTMLMotionProps<"button"> & { variant?: Variant; loading?: boolean }) {
  const inactive = disabled || loading;
  return (
    <motion.button
      whileTap={inactive ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 font-label text-label ${VARIANTS[variant]} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
```

Everything here comes from the theme: the colours, the spacing (`gap-2`, `px-4`, `min-h-12`), the corner radius, the label type role, and the press spring from `@/design/motion` (use a relative path where the project has no `@/` alias).

## The starter set

Every new app gets these, each with all the states it needs:

| Component | For | Built on | Must show |
|---|---|---|---|
| `Button` | Actions | `motion.button` | default, hover, pressed, focused, disabled, loading |
| `IconButton` | Universal actions (close, back, menu) | `Button` | as Button, plus an `aria-label` |
| `Input` | One line of text | `input` | label, hint, focused, error, disabled, read-only |
| `Textarea` | Longer text | `textarea` | as Input |
| `Select` | One choice from a list | Radix `Select` (`radix-ui`) | label, open, selected, focused, error, disabled |
| `Checkbox` | On or off, part of a form | Radix `Checkbox` | checked, unchecked, focused, disabled; the label is part of the target |
| `Switch` | A setting that applies at once | Radix `Switch` | on, off, focused, disabled; the label is part of the target |
| `Card` | A group of related content | `div` or `article` | default; pressed when the whole card is a link |
| `ListItem` | A row in a list | `li` with a link or button inside | default, hover, pressed, selected; the whole row is the target |
| `TopBar` | The screen title and its actions | `header` | default; scrolled (raised) |
| `TabBar` | Main navigation on phones | `nav` | the current tab marked with `aria-current` |
| `Sidebar` | Main navigation on desktop layouts | `nav` | the current item marked; collapsed |
| `Sheet` | A focused task that slides up on phones | Radix `Dialog` | open, closing; focus moves in and back |
| `Dialog` | A decision that needs an answer | Radix `Dialog` | open; Escape closes; focus moves in and back |
| `Toast` | A short confirmation | `div` with a polite live region | shown for at least 5 s; an action when there is one |
| `Skeleton` | Content that's loading | `div` | the layout of the content it stands in for |
| `EmptyState` | Nothing here yet | `div` | a title, one line, one action |
| `ErrorState` | Something failed | `div` | what happened, Retry, a way out |
| `Avatar` | A person | `img` | the photo, or initials when there's none |
| `Badge` | A status or count | `span` | a word or icon beside the colour |

The [accessibility guide](../../knowledge/accessibility.md) covers names, focus and announcements in detail, and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md) covers those three components.

## Each component in the design guide

When you add a shared component or change one, list it in `DESIGN.md` section 5: what it's for, its variants and its states.
