# Motion

How to animate a Vue app with `<Transition>`, CSS and Motion for Vue (`motion-v`), with the design guide's motion roles. The [motion guide](../../knowledge/motion.md) says what to animate and when; this file says how.

## CSS and `<Transition>`

Most movement in a Vue app is a `<Transition>` with CSS classes, timed by the roles in `motif.css`:

```vue
<script setup lang="ts">
defineProps<{ open: boolean }>()
</script>

<template>
  <Transition name="fade">
    <p v-if="open">Saved</p>
  </Transition>
</template>

<style scoped>
.fade-enter-active {
  transition: opacity var(--motif-duration-base) var(--motif-easing-enter);
}
.fade-leave-active {
  transition: opacity var(--motif-duration-fast) var(--motif-easing-exit);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

Exits are shorter than entrances. Don't pass a number to `<Transition :duration>`; time the transition in CSS with `var(--motif-duration-base)` and let Vue read the end of the transition. `<TransitionGroup>` moves list items the same way (`.list-move` with the same variables).

Tailwind: `transition` (the base duration and standard easing), `ease-enter`, `ease-exit`, and `duration-(--motif-duration-fast)` for another duration.

## Motion for Vue

For springs, gestures and layout animation, install `motion-v` (`npm install motion-v`; in Nuxt, add `'motion-v/nuxt'` to `modules`). Take the roles from the generated `motion.ts`:

```ts
import { duration, easing, spring } from '~/design/motion'
```

In a Vite app use a relative path (`../design/motion`) or your alias. Then:

- Springs: `:transition="spring.smooth"` (or `spring.snappy`, `spring.bouncy`).
- Timed changes: `:transition="{ duration: duration.base, ease: easing.standard }"`.

Never type a number of milliseconds or a Bézier curve: `motif check` reports them.

**Press feedback.** Interactive elements scale down slightly while pressed:

```vue
<script setup lang="ts">
import { motion } from 'motion-v'
import { spring } from '../design/motion'
</script>

<template>
  <motion.button :while-press="{ scale: 0.97 }" :transition="spring.snappy">Save</motion.button>
</template>
```

**Enter and exit.** Wrap content that comes and goes in `AnimatePresence`; exits are shorter than entrances:

```vue
<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { duration, easing, spring } from '../design/motion'

defineProps<{ open: boolean }>()
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="open"
      :initial="{ opacity: 0, y: 8 }"
      :animate="{ opacity: 1, y: 0, transition: spring.smooth }"
      :exit="{ opacity: 0, transition: { duration: duration.fast, ease: easing.exit } }"
    />
  </AnimatePresence>
</template>
```

**Sheets and dialogs.** The panel moves with `spring.smooth`; the backdrop fades with `duration.base`. **Lists.** Give each item `layout`, so the others close the gap when one leaves. **Shared elements.** Give a thumbnail and its detail image the same `layout-id`. **Page changes** (`pageTransition` in Nuxt, `<RouterView v-slot>` with `<Transition>` in Vue Router): keep them short, fade the content area only, never block input.

## Reduced motion

People who ask their system for less movement need it honoured, and `motif check`'s `reduced-motion` rule looks for it.

- **Motion's animations:** wrap the app once in `<MotionConfig reduced-motion="user">` (in `App.vue`, or Nuxt's `app.vue`), or check `useReducedMotion()` in the component and turn the movement off.
- **CSS and `<Transition>` animations:** need a `@media (prefers-reduced-motion: reduce)` query. `motif.css` has one for its own variables, so transitions timed with `var(--motif-duration-…)` already shorten; add a query for any animation of your own.

```vue
<script setup lang="ts">
import { MotionConfig } from 'motion-v'
</script>

<template>
  <MotionConfig reduced-motion="user">
    <RouterView />
  </MotionConfig>
</template>
```

`motif shot --audit` reports anything that still moves when reduced motion is on.
