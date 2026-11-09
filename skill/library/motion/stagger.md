# Stagger

## Purpose

A group arrives one item after another the first time a screen shows: each card or row fades in and rises a little (`space.2`) a moment after the one before it. It leads the eye through the group in reading order and makes a home screen feel assembled rather than dumped. The container arrives first, then its content.

## Fits

Every brief except calm ones, on first show only: the home screen's cards (the [key-figure card](../cards/key-figure-card.md), then a [stat row](../cards/stat-row.md), then today's focus), the first screenful of a list, the three rows of a welcome screen. Never on scroll, on pull-to-refresh, on a filter or sort change, on returning to a tab, or on each new page of an infinite list: by then people know the layout and a stagger is only a wait. Never on body text, word by word or letter by letter.

## Loudness

default. One pass, on first show, over a handful of items.

## Data

The items as the screen shows them, in reading order (top to bottom, then start to end, mirrored in right-to-left layouts). Each item takes its index `i` and waits `min(i, 7)` steps of a quarter of `duration.fast`, so the stagger stops after about six to eight items: the rest arrive together with the last step. Only items in the first screenful take part; anything below arrives as it scrolls in, without a delay.

## States

- **Loading:** the skeleton appears at once, without a stagger. When the real items replace it, they stagger in then (it is their first show); an item that only changes cross-fades with `duration.fast`.
- **Empty:** no stagger: the [empty state](../screens/empty-state.md) appears with a single fade.
- **Error:** no stagger: the error and its retry appear at once. When the retry succeeds, the items stagger in then.
- **Later changes:** an item added or removed after the first show moves with the platform's layout animation, never with the stagger's delay.

## Motion

| Level | Stagger |
|---|---|
| `lively` | steps of a third of `duration.fast`, each item `spring.smooth`, up to eight items |
| `default` | steps of a quarter of `duration.fast`, each item `duration.base` with `easing.enter`, up to seven or eight items |
| `calm` | no stagger: the whole group fades in together with `duration.base` |
| `none` | everything appears at once, in place |

Uses the default motion `stagger`. Charts inside a staggered card still [draw in](draw-in.md) when their card arrives; figures [count up](count-up.md) with it. Remember that the screen has been shown (a flag in the screen's state or view model), so coming back doesn't replay it.

## Accessibility

- Every item is in the accessibility tree, in its final order, from the start; focus doesn't move and nothing is announced.
- Items take taps as soon as they are on screen, even while later ones are still arriving; never block input for the stagger.
- Animate only opacity and a small transform; the layout is final from the first frame, so nothing below jumps.
- Under reduced motion, everything appears at once (level `none`).

## Stacks

### react-web

Motion for React variants with a capped `delay` per item, on mount only; wrap the app once in `<MotionConfig reducedMotion="user">`, so reduced motion shows the items in place.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

const step = duration.fast / 4;
const item = {
  hidden: { opacity: 0, y: 8 },
  shown: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: duration.base, ease: easing.enter, delay: Math.min(i, 7) * step },
  }),
};

{cards.map((card, i) => (
  <motion.li key={card.id} custom={i} variants={item} initial={firstShow ? "hidden" : false} animate="shown">
    <Card {...card} />
  </motion.li>
))}
```

`y: 8` is `space.2` in pixels; read it from the theme when the project exports the spacing scale. `firstShow` is the screen's remembered flag.

### plain-web

A `--i` index per item and `animation-delay` from the fast duration, inside `prefers-reduced-motion: no-preference`; add the class only on the first show.

```css
@media (prefers-reduced-motion: no-preference) {
  .first-show > * {
    animation: arrive var(--motif-duration-base) var(--motif-easing-enter) backwards;
    animation-delay: calc(min(var(--i), 7) * var(--motif-duration-fast) / 4);
  }
}
@keyframes arrive { from { opacity: 0; transform: translateY(var(--motif-space-2)); } }
```

Set `style="--i: 0"`, `--i: 1`, … on each item, and remove `first-show` from the list after its last animation ends (`animationend`), so items added later arrive without a delay.

### vue

A `<TransitionGroup appear>` with the same `--i` delay, its CSS inside `prefers-reduced-motion: no-preference`; switch the group's name off after the first show.

```vue
<template>
  <TransitionGroup tag="ul" :name="firstShow ? 'arrive' : 'list'" appear>
    <li v-for="(card, i) in cards" :key="card.id" :style="{ '--i': Math.min(i, 7) }"><Card v-bind="card" /></li>
  </TransitionGroup>
</template>

<style>
@media (prefers-reduced-motion: no-preference) {
  .arrive-enter-active {
    transition: opacity var(--motif-duration-base) var(--motif-easing-enter), transform var(--motif-duration-base) var(--motif-easing-enter);
    transition-delay: calc(var(--i) * var(--motif-duration-fast) / 4);
  }
  .arrive-enter-from { opacity: 0; transform: translateY(var(--motif-space-2)); }
}
</style>
```

With `motion-v` in the project, the react-web variants work the same with `:custom`, `:variants` and `:initial`.

### svelte

`in:fly` with a capped delay; when `prefersReducedMotion.current` is true, no rise and no delay. `|global` lets it play when the list appears inside an `{#if}` after loading.

```svelte
<script lang="ts">
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";

  let { cards, firstShow } = $props();
  const arrive = (i: number) => prefersReducedMotion.current || !firstShow
    ? { duration: 0 }
    : { y: 8, duration: duration.base, easing: easing.enter, delay: Math.min(i, 7) * duration.fast / 4 };
</script>

{#each cards as card, i (card.id)}
  <li in:fly|global={arrive(i)}><Card {...card} /></li>
{/each}
```

`y: 8` is `space.2` in pixels.

### angular

Motion's `animate` over the items with a capped delay function, run once from `afterNextRender`; skip it under `prefers-reduced-motion`.

```ts
import { animate } from "motion";
import { duration, easing } from "../design/motion";

afterNextRender(() => {
  if (!this.firstShow || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const items = this.list.nativeElement.querySelectorAll(":scope > li");
  animate(items, { opacity: [0, 1], y: [8, 0] }, {
    duration: duration.base, ease: easing.enter,
    delay: (i: number) => Math.min(i, 7) * duration.fast / 4,
  });
});
```

The roles' `duration` is in seconds here, as Motion takes it. Without Motion, the plain-web CSS works as `animate.enter` classes on the `@for` items.

### flutter

One `AnimationController` and an `Interval` per item, started once; `MotifMotion.duration(context, …)` is zero under reduced motion, and then the controller simply jumps to the end.

```dart
late final _c = AnimationController(vsync: this);
var _step = 0.0, _each = 1.0, _started = false;

@override
void didChangeDependencies() {
  super.didChangeDependencies();
  if (_started) return;
  _started = true;
  final step = MotifMotion.duration(context, MotifDurations.fast) * 0.25;
  final each = MotifMotion.duration(context, MotifDurations.base);
  final total = step * 7 + each;
  if (total == Duration.zero) { _c.value = 1; return; }
  _c.duration = total;
  _step = step.inMicroseconds / total.inMicroseconds;
  _each = each.inMicroseconds / total.inMicroseconds;
  _c.forward();
}

Widget _arrive(int i, Widget child) {
  final at = min(i, 7) * _step;
  final t = CurvedAnimation(parent: _c, curve: Interval(at, min(1.0, at + _each), curve: MotifCurves.enter));
  return FadeTransition(
    opacity: t,
    child: AnimatedBuilder(
      animation: t,
      builder: (context, child) => Transform.translate(offset: Offset(0, MotifSpace.s2 * (1 - t.value)), child: child),
      child: child,
    ),
  );
}
```

Keep `_started` in the screen's state so returning to it doesn't replay.

### compose

`AnimatedVisibility` per item, starting visible under `MotifMotion.reduced()` or after the first show, with a delay of `MotifDurations.fast / 4` steps.

```kotlin
val reduced = MotifMotion.reduced()
val rise = with(LocalDensity.current) { MotifSpace.s2.roundToPx() }

cards.forEachIndexed { i, card ->
    val state = remember { MutableTransitionState(reduced || !firstShow).apply { targetState = true } }
    val delay = minOf(i, 7) * MotifDurations.fast / 4
    AnimatedVisibility(
        visibleState = state,
        enter = fadeIn(tween(MotifDurations.base, delay, MotifEasing.enter)) +
            slideInVertically(tween(MotifDurations.base, delay, MotifEasing.enter)) { rise },
    ) { CardRow(card) }
}
```

In a `LazyColumn`, give only the first screenful the delay: items composed later start visible.

### react-native

Reanimated's `entering` with a capped delay; `useReducedMotion()` drops it, and `LayoutAnimationConfig` skips it after the first show.

```tsx
import Animated, { FadeInDown, LayoutAnimationConfig, useReducedMotion } from "react-native-reanimated";
import { duration, easing } from "@/design/motif-theme";

const reduced = useReducedMotion();
const arrive = (i: number) =>
  reduced ? undefined : FadeInDown.delay(Math.min(i, 7) * duration.fast / 4).duration(duration.base).easing(easing.enter);

<LayoutAnimationConfig skipEntering={!firstShow}>
  {cards.map((card, i) => (
    <Animated.View key={card.id} entering={arrive(i)}><Card {...card} /></Animated.View>
  ))}
</LayoutAnimationConfig>
```

In a `FlatList`, pass `entering` only for indexes in the first screenful, so rows scrolled into view arrive without it.

### swiftui

Opacity and offset per item, each animated with a delay of `MotifDurations.fast / 4` steps; under `accessibilityReduceMotion` `MotifMotion.animation` gives none, so the items are simply there.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown = false

ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
    CardRow(card: card)
        .opacity(shown ? 1 : 0)
        .offset(y: shown ? 0 : MotifSpace.s2)
        .animation(
            MotifMotion.animation(MotifCurves.enter(over: MotifDurations.base).delay(Double(min(i, 7)) * MotifDurations.fast / 4), reduceMotion: reduceMotion),
            value: shown
        )
}
.onAppear { shown = true }
```

Keep `shown` in state that outlives the view (the screen's model) when it should not replay on returning to the tab.
