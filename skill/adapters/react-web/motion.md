# Motion

How to animate a React web app with Motion (`motion/react`) and the design guide's motion roles. The [motion guide](../../knowledge/motion.md) says what to animate and when; this file says how.

## Once, at the root

Wrap the whole app in `<MotionConfig reducedMotion="user">`. People who ask their system for less motion then get fades instead of movement, and `motif check`'s `reduced-motion` rule finds the setting.

- **Next.js:** in a client component such as `src/app/providers.tsx` (it starts with `"use client";`), used around `children` in `src/app/layout.tsx`.
- **Vite:** around `<App />` in `src/main.tsx`.

```tsx
"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

CSS animations need their own `@media (prefers-reduced-motion: reduce)` rule; `motif.css` already handles its own variables.

## The roles in code

```tsx
import { duration, easing, spring } from "@/design/motion";
```

Use a relative path (such as `../design/motion`) where the project has no `@/` alias. Then:

- Springs: `transition={spring.smooth}` (or `spring.snappy`, `spring.bouncy`).
- Timed changes: `transition={{ duration: duration.base, ease: easing.standard }}`.
- CSS and Tailwind: `transition` (the base duration and standard easing), `ease-enter`, `ease-exit`, and `duration-(--motif-duration-fast)` for another duration.

Never type a number of milliseconds or a Bézier curve: `motif check` reports them.

## Patterns

**Press feedback.** Interactive elements scale down slightly while pressed:

```tsx
<motion.button whileTap={{ scale: 0.97 }} transition={spring.snappy}>Save</motion.button>
```

**Enter and exit.** Wrap content that comes and goes in `AnimatePresence`; exits are shorter than entrances:

```tsx
<AnimatePresence>
  {open && (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: spring.smooth }}
      exit={{ opacity: 0, transition: { duration: duration.fast, ease: easing.exit } }}
    />
  )}
</AnimatePresence>
```

**Sheets and dialogs.** The panel moves with `spring.smooth`; the backdrop fades with `duration.base`. A sheet follows the finger when dragged (`drag="y"` with `dragConstraints`) and closes past a threshold.

**Lists.** Give each item the `layout` prop, so the others close the gap when one leaves and move smoothly when the order changes. Stagger the first few items with `staggerChildren: 0.03` in the parent's variants; a stagger step is choreography, not a theme value.

**Shared elements.** Give a thumbnail and its detail image the same `layoutId`, and the image grows from where it was tapped.

**Page changes.** Keep them short: fade the content area only, never the navigation, and never block input while it runs.

## Skeletons and spinners

A pulsing skeleton or a turning spinner loops, so it has no duration of its own to type: time it from the roles, and `motif check` has nothing to report.

```css
.skeleton {
  animation: motif-pulse var(--motif-duration-slow) var(--motif-easing-standard) infinite alternate;
}
@keyframes motif-pulse {
  to { opacity: 0.5; }
}

.spinner {
  animation: motif-spin calc(var(--motif-duration-slow) * 2) linear infinite;
}
@keyframes motif-spin {
  to { transform: rotate(1turn); }
}
```

`motif.css` stops both when reduced motion is on: the skeleton shows its still frame. A stopped spinner reads as stuck, so for content prefer a skeleton, and keep a spinner to a small control, such as a button that's saving, whose label still says what's happening.

## Default motion

Motif plays five small animations by default. Read the level from [motion](../../knowledge/motion.md#default-motion-and-level): `lively`, `default` (the usual case), `calm` (shorter, fewer moving things, no stagger) or `none`.

| Motion | Here |
|---|---|
| `draw-in` | a chart's line or segments with Motion's `motion.path` (`pathLength` from 0 to 1) or `scaleX` from 0, `duration.slow` + `easing.enter` |
| `count-up` | Motion's `animate(from, to, { duration })` writing into the number's text, `duration.slow` |
| `stagger` | a parent's `transition={{ staggerChildren }}` of `duration.fast` steps, on first show only |
| `press` | `whileTap={{ scale: 0.97 }}` with `spring.snappy` |
| `success` | a check that scales in with `spring.bouncy` (`spring.smooth` at `calm`) |

`<MotionConfig reducedMotion="user">` makes the transforms instant (the press, the check's scale) but leaves opacity and `pathLength` running, so the draw-in, stagger and success also read `useReducedMotion()` and pass `initial={false}` when it is true; a hand-written count-up checks it too and shows the final number.

Each one has a full recipe with this stack's code in the library: [draw-in](../../library/motion/draw-in.md), [count-up](../../library/motion/count-up.md), [stagger](../../library/motion/stagger.md), [press](../../library/motion/press.md) and [success](../../library/motion/success.md).

## Reduced motion

With `MotionConfig reducedMotion="user"` at the root, Motion turns movement into fades for people who ask for less. For custom cases, such as auto-playing carousels or parallax, check `useReducedMotion()` and turn them off. `motif shot --audit` reports anything that still moves when reduced motion is on.
