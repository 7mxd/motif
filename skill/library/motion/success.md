# Success

## Purpose

A key action confirms itself right where it was pressed: tap "Feed Lily" and the button's water drop becomes a check that pops in with a small happy bounce, the button turns `success`, and its label says what happened ("Lily fed"). Short and specific, it tells people the thing is done without a dialog to dismiss, and gives the app's main action a moment of character.

## Fits

Every brief, on the app's key actions: feeding or watering a plant, marking an invoice paid, logging a workout, sending an invite, ticking off today's habit. Routine saves get a short toast or nothing. A bigger moment (a goal reached, the first invoice paid, a streak) is a [success moment](../screens/success-moment.md), not this. Confetti and fireworks only where the brief asks for celebration.

## Loudness

default. One small bounce on one control; a `lively` brief may let the whole button bounce.

## Data

- **The action's result**, from the app: play it only once the action has really succeeded (the store or server confirmed it), or optimistically when the app offers Undo.
- **The label names what happened**, with the item's own name: "Lily fed", "Invoice #1042 paid", "Invite sent to Sam". When there is a useful next fact, say it nearby: "Next feed in 7 days".
- **The new state stays while it is true** ("Fed today"), read from the data, not reset on a timer. An action that can repeat at once (send another invite) returns to its normal label after a few seconds.
- Drive the bounce from the action's result (an event), not from the state, so opening a screen where Lily is already fed shows the check without bouncing.

## States

- **Loading:** while the action runs, the button keeps its width, shows a small spinner beside the label and takes no more presses. Under about 300 ms, show nothing extra. No check until the result is in.
- **Empty:** a key action on an empty screen ("Add your first plant") confirms the same way when it creates the first item; the new item then arrives in the list.
- **Error:** no bounce and no check. The button returns to its action and the error says what went wrong in words ("Couldn't feed Lily. Check your connection and try again"), with a short shake on the control where the input was rejected ([motion](../../knowledge/motion.md#feedback)). Never colour alone.
- **Undo:** where the action can be undone, a toast offers Undo for a few seconds; undoing returns the button to its action without a bounce.

## Motion

| Level | Success |
|---|---|
| `lively` | the check pops in with `spring.bouncy`, its stroke [draws in](draw-in.md) with `duration.base`, and the whole button gives one small bounce |
| `default` | the check pops in (from about 0.6 of its size) with `spring.bouncy`; the colour and label change with `duration.fast` |
| `calm` | the check scales in with `spring.smooth` (no overshoot); no bounce on the button |
| `none` | the check, colour and label simply change; colour changes stay under reduced motion |

Uses the default motion `success`, after `press` on the same button. A light success haptic on phones (where the app already uses haptics) adds to it; haptics don't count as motion.

## Accessibility

- Announce the result in words through the platform's announcement or a polite live region ("Lily fed. Next feed in 7 days"); the check alone says nothing to a screen reader.
- Focus stays on the button; the screen doesn't move or scroll.
- The change is never colour alone: the icon and the label change too. The button uses the `success` / `on-success` pair, so its contrast holds.
- The button keeps its 44 pt / 48 dp target and its width; the bounce is a transform on the drawing.
- Under reduced motion nothing scales (level `none`).

## Stacks

### react-web

Motion for React's `AnimatePresence` swapping the icon, the check scaling in with `spring.bouncy` (`spring.smooth` at `calm`); wrap the app once in `<MotionConfig reducedMotion="user">`.

```tsx
import { AnimatePresence, motion } from "motion/react";
import { duration, easing, spring } from "@/design/motion";

<button className="feed" data-done={fed || undefined} onClick={feed} disabled={busy}>
  <AnimatePresence mode="popLayout" initial={false}>
    {fed ? (
      <motion.svg key="check" viewBox="0 0 24 24" aria-hidden="true"
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={calm ? spring.smooth : spring.bouncy}>
        <motion.path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth={2}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: duration.base, ease: easing.enter }} />
      </motion.svg>
    ) : <DropIcon key="drop" aria-hidden="true" />}
  </AnimatePresence>
  {fed ? "Lily fed" : "Feed Lily"}
</button>
<p role="status" className="sr-only">{fed ? "Lily fed. Next feed in 7 days." : ""}</p>
```

`.feed[data-done]` takes `var(--motif-color-success)` with `var(--motif-color-on-success)`. `initial={false}` keeps an already-fed button still on first show.

### plain-web

Keyframes on the check (CSS has no springs, so a short overshoot stands in for `spring.bouncy`), inside `prefers-reduced-motion: no-preference`; the colour change sits outside it.

```css
.feed { transition: background-color var(--motif-duration-fast) var(--motif-easing-standard); }
.feed[data-done] { background: var(--motif-color-success); color: var(--motif-color-on-success); }
@media (prefers-reduced-motion: no-preference) {
  .feed.just-done .check { animation: pop var(--motif-duration-base) var(--motif-easing-standard); }
  .feed.just-done .check path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw var(--motif-duration-base) var(--motif-easing-enter) forwards; }
}
@keyframes pop { from { transform: scale(0.6); } 60% { transform: scale(1.08); } to { transform: scale(1); } }
@keyframes draw { to { stroke-dashoffset: 0; } }
```

Give the check's path `pathLength="1"`. Add `data-done` from the data and `just-done` only when the action succeeds, and set the text of a `role="status"` element to "Lily fed". At `calm`, drop the 60% step.

### vue

Motion for Vue's `AnimatePresence` and `motion.svg`, `spring.bouncy` (`spring.smooth` at `calm`); `<MotionConfig reduced-motion="user">` follows `prefers-reduced-motion`.

```vue
<template>
  <button class="feed" :data-done="fed || undefined" :disabled="busy" @click="feed">
    <AnimatePresence mode="popLayout" :initial="false">
      <motion.svg v-if="fed" key="check" viewBox="0 0 24 24" aria-hidden="true"
        :initial="{ scale: 0.6, opacity: 0 }" :animate="{ scale: 1, opacity: 1 }" :transition="calm ? spring.smooth : spring.bouncy">
        <motion.path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="2"
          :initial="{ pathLength: 0 }" :animate="{ pathLength: 1 }" :transition="{ duration: duration.base, ease: easing.enter }" />
      </motion.svg>
      <DropIcon v-else key="drop" aria-hidden="true" />
    </AnimatePresence>
    {{ fed ? "Lily fed" : "Feed Lily" }}
  </button>
  <p role="status" class="visually-hidden">{{ fed ? "Lily fed. Next feed in 7 days." : "" }}</p>
</template>
```

Without `motion-v`, the plain-web CSS in the component's `<style>`.

### svelte

A `Spring` from `svelte/motion` with `spring.bouncy` (`spring.smooth` at `calm`) for the pop, and `draw` for the stroke; when `prefersReducedMotion.current` is true, neither runs.

```svelte
<script lang="ts">
  import { Spring, prefersReducedMotion } from "svelte/motion";
  import { draw } from "svelte/transition";
  import { duration, easing, spring } from "$lib/design/motion";

  let { fed, calm, onfeed } = $props();
  const pop = new Spring(1, calm ? spring.smooth : spring.bouncy);
  async function feed() {
    if (!(await onfeed())) return;
    if (!prefersReducedMotion.current) { await pop.set(0.6, { instant: true }); pop.target = 1; }
  }
</script>

<button class="feed" class:done={fed} onclick={feed}>
  {#if fed}
    <svg viewBox="0 0 24 24" aria-hidden="true" style:transform="scale({pop.current})">
      <path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="2"
        in:draw={{ duration: prefersReducedMotion.current ? 0 : duration.base, easing: easing.enter }} />
    </svg>
  {/if}
  {fed ? "Lily fed" : "Feed Lily"}
</button>
<p role="status" class="visually-hidden">{fed ? "Lily fed. Next feed in 7 days." : ""}</p>
```

### angular

Motion's `animate` on the check with `spring.bouncy` (`spring.smooth` at `calm`) once the action succeeds; skip it under `prefers-reduced-motion`. The CDK's `LiveAnnouncer` (or a `role="status"` element) says the result.

```ts
import { animate } from "motion";
import { spring } from "../design/motion";

async feed() {
  if (!(await this.plants.feed(this.plant().id))) return;
  this.fed.set(true);
  this.announcer.announce("Lily fed. Next feed in 7 days.", "polite");
  afterNextRender(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate(this.check()!.nativeElement, { scale: [0.6, 1] }, this.calm() ? spring.smooth : spring.bouncy);
  }, { injector: this.injector });
}
```

The button's colours come from the plain-web rules in the component's styles.

### flutter

An `AnimatedSwitcher` swapping the icon, timed by `MotifMotion.duration(context, …)`, and the check scaled with a `SpringSimulation` from `MotifSprings.bouncy` (`smooth` at `calm`), skipped when `MotifMotion.reduced(context)`.

```dart
late final _pop = AnimationController.unbounded(vsync: this, value: 1);

Future<void> _feed() async {
  if (!await widget.onFeed() || !mounted) return;
  SemanticsService.announce('Lily fed. Next feed in 7 days.', Directionality.of(context));
  HapticFeedback.lightImpact();
  if (MotifMotion.reduced(context)) return;
  _pop.animateWith(SpringSimulation(widget.calm ? MotifSprings.smooth : MotifSprings.bouncy, 0.6, 1, 0));
}

FilledButton.icon(
  onPressed: widget.busy ? null : _feed,
  style: FilledButton.styleFrom(
    backgroundColor: widget.fed ? colors.success : colors.actionPrimary,
    foregroundColor: widget.fed ? colors.onSuccess : colors.onActionPrimary,
  ),
  icon: AnimatedSwitcher(
    duration: MotifMotion.duration(context, MotifDurations.fast),
    child: widget.fed
        ? ScaleTransition(key: const ValueKey('fed'), scale: _pop, child: const Icon(Icons.check))
        : const Icon(Icons.water_drop_outlined, key: ValueKey('feed')),
  ),
  label: Text(widget.fed ? 'Lily fed' : 'Feed Lily'),
)
```

For a check whose stroke draws, paint it as in [draw-in](draw-in.md).

### compose

An `Animatable` scale on the check, run with `MotifSprings.bouncy()` (`smooth()` at `calm`) when the action succeeds; skipped under `MotifMotion.reduced()`. A polite live region on the label announces it.

```kotlin
val pop = remember { Animatable(1f) }
val reduced = MotifMotion.reduced()
val colors = MotifTheme.colors
LaunchedEffect(viewModel) {
    viewModel.fedEvents.collect {
        if (!reduced) { pop.snapTo(0.6f); pop.animateTo(1f, if (calm) MotifSprings.smooth() else MotifSprings.bouncy()) }
    }
}
Button(
    onClick = viewModel::feed,
    colors = ButtonDefaults.buttonColors(
        containerColor = if (fed) colors.success else colors.actionPrimary,
        contentColor = if (fed) colors.onSuccess else colors.onActionPrimary,
    ),
) {
    Icon(if (fed) Icons.Default.Check else Icons.Outlined.WaterDrop, contentDescription = null,
        modifier = Modifier.graphicsLayer { scaleX = pop.value; scaleY = pop.value })
    Spacer(Modifier.width(MotifSpace.s2))
    Text(if (fed) "Lily fed" else "Feed Lily", modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
}
```

`fedEvents` fires only on a successful feed, so reopening the screen doesn't bounce.

### react-native

A Reanimated scale from 0.6 to 1 with `withSpring(1, spring.bouncy)` (`spring.smooth` at `calm`); when `useReducedMotion()` is true, no scale. `AccessibilityInfo.announceForAccessibility` says the result.

```tsx
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { spring, useMotifTheme } from "@/design/motif-theme";

const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const pop = useSharedValue(1);
const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

async function feed() {
  if (!(await onFeed())) return;
  AccessibilityInfo.announceForAccessibility("Lily fed. Next feed in 7 days.");
  if (!reduced) pop.value = withSequence(withTiming(0.6, { duration: 0 }), withSpring(1, calm ? spring.smooth : spring.bouncy));
}

<Pressable onPress={feed} disabled={busy} accessibilityRole="button"
  style={[styles.button, { backgroundColor: fed ? colors.success : colors.actionPrimary }]}>
  <Animated.View style={style}>{fed ? <CheckIcon color={colors.onSuccess} /> : <DropIcon color={colors.onActionPrimary} />}</Animated.View>
  <Text style={[styles.label, { color: fed ? colors.onSuccess : colors.onActionPrimary }]}>{fed ? "Lily fed" : "Feed Lily"}</Text>
</Pressable>
```

The icons are `react-native-svg` paths; with Moti already in the project, its `MotiView` can play the same spring.

### swiftui

The label's symbol swaps to a checkmark and bounces once (`.symbolEffect(.bounce)`), the change animated with `MotifSprings.bouncy` (`smooth` at `calm`); under `accessibilityReduceMotion` there is no bounce. An announcement and a success haptic go with it.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors
@State private var bounces = 0

Button { Task { await feed() } } label: {
    Label(fed ? "Lily fed" : "Feed Lily", systemImage: fed ? "checkmark" : "drop")
        .contentTransition(.symbolEffect(.replace))
        .symbolEffect(.bounce, value: bounces)
}
.buttonStyle(.borderedProminent)
.tint(fed ? colors.success : colors.actionPrimary)
.foregroundStyle(fed ? colors.onSuccess : colors.onActionPrimary)
.sensoryFeedback(.success, trigger: fed)

private func feed() async {
    guard await plant.feed() else { return }
    withAnimation(MotifMotion.animation(calm ? MotifSprings.smooth : MotifSprings.bouncy, reduceMotion: reduceMotion)) { fed = true }
    if !reduceMotion && !calm { bounces += 1 }
    AccessibilityNotification.Announcement("Lily fed. Next feed in 7 days.").post()
}
```

`bounces` only grows on a real feed, so a screen that opens already fed stays still.
