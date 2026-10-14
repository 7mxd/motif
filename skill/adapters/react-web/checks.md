# Checks and screenshots

What `motif check` and `motif shot --audit` report in a React web app, and how to fix each finding.

A value that truly must stay as it is (a partner's brand colour, say) gets a `motif-ok: <reason>` comment on its line or the line above. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason.

## `raw-color`

A colour typed into code or CSS: hex, `rgb()`, `hsl()`, `oklch()` or a named colour.

- Example: `color: #4B5563` in CSS, `stroke="rgb(17 24 39)"` on an icon. (The same colour inside a Tailwind class, `text-[#4B5563]`, is reported as `tailwind-arbitrary`.)
- Fix: the colour role it stands for, such as `text-text-secondary`, `bg-surface` or `var(--motif-color-border)`.

## `tailwind-arbitrary`

A Tailwind arbitrary value for a colour, spacing, radius, shadow or font size.

- Example: `bg-[#123456]`, `p-[13px]`, `rounded-[10px]`.
- Fix: the matching role utility: `bg-action-primary`, `p-3`, `rounded-md`.

## `tailwind-palette`

Tailwind's own colour palette.

- Example: `bg-blue-500`, `text-gray-600`.
- Fix: a role (`bg-action-primary`, `text-text-secondary`). Motif's theme removes Tailwind's palette, so these colours wouldn't render anyway.

## `off-scale`

A spacing, radius, font size or shadow value that isn't on the theme's scales.

- Example: `margin: 18px` or `font-size: 15px` in CSS, or `p-7` when the spacing scale has no step 7.
- Fix: the nearest step of the scale (`p-4`, `text-body`). If the design truly needs a new step, propose a change to the design guide instead.

## `raw-font`

A font family typed into code.

- Example: `font-family: "Inter", sans-serif`, `style={{ fontFamily: "Georgia" }}`.
- Fix: a font role (`font-body`, `font-display`) or `var(--motif-font-body-family)`.

## `raw-motion`

A duration or easing curve typed into CSS, Tailwind or a Motion transition.

- Example: `transition: opacity 300ms ease-in`, `duration-300`, `transition={{ duration: 0.3 }}`.
- Fix: `transition` and `ease-standard` in Tailwind, or `duration`, `easing` and `spring` from `@/design/motion` ([motion](motion.md)).

## `primitive-use`

A raw palette value (`primitive.*`) used in product code.

- Example: `var(--motif-primitive-color-indigo-700)`.
- Fix: the role that points at it (`var(--motif-color-action-primary)`).

## `reduced-motion`

The app animates, but nothing honours reduced motion.

- Fix: `<MotionConfig reducedMotion="user">` at the root, or a global `@media (prefers-reduced-motion: reduce)` rule for CSS animation ([motion](motion.md)).

## `generated-edited`

A generated theme file was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Contrast

From `motif shot --audit`: text measured on screen below 4.5:1 (3:1 for large text).

- Fix: use the text role the design guide pairs with that surface (`text-text-primary` on `bg-surface-raised`). If a pair itself fails, `motif validate` reports it too, and the role values need changing.

## Target size

From `motif shot --audit`: a control smaller than 24×24 px (critical), or smaller than 44×44 px at phone widths (minor).

- Fix: `min-h-12` on buttons, `size-12` on icon buttons, more padding around small links, or more space between neighbouring controls.

## Reduced motion

From `motif shot --audit`: something still moves when reduced motion is on.

- Fix: `MotionConfig reducedMotion="user"` at the root; for custom animation, `useReducedMotion()` to turn it off.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the element and a screenshot. Fix what they report, then run them again until both are clean.
