# Motion

How to animate a Svelte app with transitions, `Spring`, `Tween`, CSS and Motion, with the design guide's motion roles. The [motion guide](../../knowledge/motion.md) says what to animate and when; this file says how.

Take the roles from the generated `motion.ts`:

```ts
import { duration, easing, spring, motionSpring } from '$lib/design/motion'
```

(`#lib/design/motion` in SvelteKit 3; a relative path in a Vite app.) `duration` is in milliseconds, `easing` holds functions, `spring` is `{ stiffness, damping }` for `Spring`, and `motionSpring` is for Motion's `animate()`. Never type a number of milliseconds, a curve or a stiffness: `motif check` reports them.

## Transitions

Content that comes and goes uses Svelte's `transition:`, `in:` and `out:` directives, timed by the roles. Exits are shorter than entrances:

```svelte
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';
  import { duration, easing } from '$lib/design/motion';

  let { open }: { open: boolean } = $props();
</script>

{#if open}
  <p
    in:fly={{ y: prefersReducedMotion.current ? 0 : 8, duration: duration.base, easing: easing.enter }}
    out:fly={{ y: 0, duration: duration.fast, easing: easing.exit }}
  >
    Saved
  </p>
{/if}
```

Pass `transition:fly={{ y: 8, duration: duration.base, easing: easing.standard }}` when entering and leaving are the same. Lists move with the `animate:flip` directive on the children of a keyed `{#each}`, with the same `duration` and `easing`. Don't import easings from `svelte/easing`: the guide's own are in `easing`. Page changes (a layout's `{#key page.url.pathname}` around the content, or `onNavigate` with the View Transitions API): keep them short, fade the content area only, never block input.

## CSS

Hover, press and colour changes belong in CSS, timed by the variables in `motif.css`:

```svelte
<button class="chip">Filter</button>

<style>
  .chip {
    transition: background-color var(--motif-duration-fast) var(--motif-easing-standard);
  }
  .chip:hover {
    background-color: var(--motif-color-surface-raised);
  }
</style>
```

Tailwind: `transition` (the base duration and standard easing), `ease-enter`, `ease-exit`, and `duration-(--motif-duration-fast)` for another duration.

## Springs and tweens

`Spring` and `Tween` (Svelte 5.8 and later) hold a number that moves toward a target. A spring for press feedback:

```svelte
<script lang="ts">
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import { spring } from '$lib/design/motion';

  const scale = new Spring(1, spring.snappy);
</script>

<button
  style:transform="scale({scale.current})"
  onpointerdown={() => (scale.target = prefersReducedMotion.current ? 1 : 0.97)}
  onpointerup={() => (scale.target = 1)}
>
  Save
</button>
```

A timed change that CSS can't do (a number counting up, a value that several things read) is a `Tween`:

```svelte
<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { duration, easing } from '$lib/design/motion';

  let { total }: { total: number } = $props();

  const shown = new Tween(0, { duration: duration.slow, easing: easing.standard });
  $effect(() => {
    shown.target = total;
  });
</script>

<output>{Math.round(shown.current)}</output>
```

**Springs and screens.** Svelte moves a spring one step per frame, and `spring.*` is the guide's spring at 60 frames a second, exact there (the same motion as the native stacks). On a 120 Hz screen the same pair is stiffer and more damped, and a bouncy role barely bounces. When the spring must feel the same on every screen, use Motion's `animate()` with `motionSpring`, which runs by the clock. Motion stretches its springs by about a sixth, so `motionSpring.snappy` settles slightly later than `spring.snappy`: that is the same on React web and Vue, and it is expected.

## Motion

`npm install motion`. Use `animate()` for what Svelte's own tools don't do: a refresh-independent spring, a sequence, a gesture-driven movement.

```svelte
<script lang="ts">
  import { animate } from 'motion';
  import { prefersReducedMotion } from 'svelte/motion';
  import { motionSpring } from '$lib/design/motion';

  let card = $state<HTMLElement>();

  function lift() {
    if (card && !prefersReducedMotion.current) animate(card, { y: -4 }, motionSpring.smooth);
  }
</script>

<article bind:this={card} onpointerenter={lift}>Order</article>
```

## Reduced motion

People who ask their system for less movement need it honoured, and `motif check`'s `reduced-motion` rule looks for it.

- **Transitions, `Spring`, `Tween` and Motion's animations:** use `prefersReducedMotion` from `svelte/motion` (`prefersReducedMotion.current` is true when the person asked for less): shorten the duration to `0`, drop the distance, or skip the animation, as the examples above do. One use anywhere in the app satisfies the check, but apply it to every animation.
- **CSS animations and transitions:** need a `@media (prefers-reduced-motion: reduce)` query. `motif.css` has one for its own variables, so transitions timed with `var(--motif-duration-…)` already shorten; add a query for any animation of your own.

`motif shot --audit` reports anything that still moves when reduced motion is on.
