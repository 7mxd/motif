# Press

## Purpose

A primary or key action gives slightly under the finger: it scales down a little the moment it is touched and springs back when let go. It tells people "your press registered" before anything else has happened, so a button never feels dead while the app works. It is felt more than seen.

## Fits

Every brief. Use it on primary buttons ("Pay invoice", "Save"), on the screen's key action ("Feed Lily", "Start workout") and on cards that open something (an [item card](../cards/item-card.md), the [key-figure card](../cards/key-figure-card.md) when it leads to detail). Leave it off text links, tabs, list rows, switches and checkboxes: they show their own pressed or selected state, and a screen where everything shrinks under the finger feels soft.

## Loudness

calm. One small scale on the touched control, nothing else on the screen moves.

## Data

None. The pressed state comes from the platform (the button's pressed or `:active` state, the gesture's down and up); the piece never reads the app's data. The label, the width and the layout stay exactly as they are: only a transform on the control changes. A disabled control does not press.

## States

- **Loading:** while the action runs, the button shows its busy state (a small spinner beside the label, same width) and stops taking presses, so a second tap can't send twice. The press itself never waits for the work: it starts within 100 ms of the touch.
- **Empty:** an empty screen's own action ("Add your first plant") presses like any other key action; it is often the only thing on the screen that moves.
- **Error:** a retry button presses as normal. The error itself is shown by the field or message, never by the press (a field's shake is in [motion](../../knowledge/motion.md#feedback)).
- **Disabled:** no scale and no colour change; the control looks disabled and says why nearby when the reason isn't obvious.

## Motion

| Level | Press |
|---|---|
| `lively` | scale to 0.96 with `spring.snappy` |
| `default` | scale to 0.97 with `spring.snappy` |
| `calm` | scale to 0.98 with `spring.snappy`: still there, because it is feedback, but barely |
| `none` | no scale; the pressed colour change (the role's pressed tint or a slight opacity) carries the feedback |

Uses the default motion `press`. It pairs with [success](success.md) when the action completes, and a spring (not a timed curve) is what lets a quick tap-and-release reverse halfway without a jump. On the web, where CSS has no springs, the nearest duration (`duration.fast`) with `easing.standard` stands in.

## Accessibility

- Scale only the drawing, never the tap area: the control keeps its 44 pt / 48 dp target while it is pressed.
- Keyboard and switch users get the same feedback: Enter or Space on a focused button shows the pressed state too.
- Under reduced motion there is no scale (level `none`); the colour change stays, since reduced motion keeps colour changes.
- The pressed colour comes from the role pair the button already uses (`action-primary` with `on-action-primary`), so contrast holds while pressed.
- Hover effects belong only to a fine pointer (`@media (hover: hover)` on the web); on touch they stick after a tap.

## Stacks

### react-web

Motion for React's `whileTap` with `spring.snappy`; wrap the app once in `<MotionConfig reducedMotion="user">`, so reduced motion turns the scale off.

```tsx
import { motion } from "motion/react";
import { spring } from "@/design/motion";

<motion.button whileTap={{ scale: 0.97 }} transition={spring.snappy} className="button-primary" onClick={feed}>
  Feed Lily
</motion.button>
```

Without Motion in the project, use the plain-web CSS below on the button's class. `whileTap` also fires for Enter and Space on a focused button.

### plain-web

`:active` with a transform, timed by the fast duration, inside `prefers-reduced-motion: no-preference`; the pressed colour sits outside it, so it stays under reduced motion.

```css
.button-primary {
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
  transition: background-color var(--motif-duration-fast) var(--motif-easing-standard);
}
.button-primary:active { background: color-mix(in srgb, var(--motif-color-action-primary) 88%, var(--motif-color-on-action-primary)); }
@media (prefers-reduced-motion: no-preference) {
  .button-primary { transition-property: background-color, transform; }
  .button-primary:active { transform: scale(0.97); }
}
```

A `<button>` already shows `:active` for Space; give a link styled as a button the same rule.

### vue

Motion for Vue's `:while-press` with `spring.snappy`; wrap the app in `<MotionConfig reduced-motion="user">`, which follows `prefers-reduced-motion`.

```vue
<script setup lang="ts">
import { motion } from "motion-v";
import { spring } from "../design/motion";
</script>

<template>
  <motion.button :while-press="{ scale: 0.97 }" :transition="spring.snappy" class="button-primary" @click="feed">
    Feed Lily
  </motion.button>
</template>
```

Without `motion-v`, the plain-web CSS in the component's `<style>` does the same.

### svelte

A `Spring` from `svelte/motion` holding the scale, with the guide's `spring.snappy`; when `prefersReducedMotion.current` is true, the value stays at 1.

```svelte
<script lang="ts">
  import { Spring, prefersReducedMotion } from "svelte/motion";
  import { spring } from "$lib/design/motion";

  let { onclick, children } = $props();
  const scale = new Spring(1, spring.snappy);
  const press = (to: number) => { if (!prefersReducedMotion.current) scale.target = to; };
</script>

<button class="button-primary" {onclick} style:transform="scale({scale.current})"
  onpointerdown={() => press(0.97)} onpointerup={() => press(1)} onpointerleave={() => press(1)}>
  {@render children()}
</button>
```

Or the plain-web CSS on the class, which needs no script.

### angular

The plain-web rule in the component's styles, inside `prefers-reduced-motion: no-preference`; for a real spring, Motion's `animate` with `spring.snappy` from pointer events.

```ts
import { animate } from "motion";
import { spring } from "../design/motion";

@HostListener("pointerdown") down() { this.press(0.97); }
@HostListener("pointerup") @HostListener("pointerleave") up() { this.press(1); }

private press(scale: number) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  animate(this.element.nativeElement, { scale }, spring.snappy);
}
```

The [angular motion guide](../../adapters/angular/motion.md) has the full directive.

### flutter

`AnimatedScale` around the button, pressed state from a `Listener` (it doesn't take the tap from the button); `MotifMotion.duration(context, …)` is zero under reduced motion.

```dart
bool _pressed = false;

Listener(
  onPointerDown: (_) => setState(() => _pressed = true),
  onPointerUp: (_) => setState(() => _pressed = false),
  onPointerCancel: (_) => setState(() => _pressed = false),
  child: AnimatedScale(
    scale: _pressed && !MotifMotion.reduced(context) ? 0.97 : 1,
    duration: MotifMotion.duration(context, MotifDurations.fast),
    curve: MotifCurves.standard,
    child: FilledButton(onPressed: _feed, child: const Text('Feed Lily')),
  ),
)
```

For a true spring, the `SpringPress` widget in the [flutter motion guide](../../adapters/flutter/motion.md) runs `MotifSprings.snappy` on an unbounded controller.

### compose

The scale follows `collectIsPressedAsState()`, animated with `MotifSprings.snappy()`; under `MotifMotion.reduced()` it stays at 1.

```kotlin
val source = remember { MutableInteractionSource() }
val pressed by source.collectIsPressedAsState()
val reduced = MotifMotion.reduced()
val scale by animateFloatAsState(
    targetValue = if (pressed && !reduced) 0.97f else 1f,
    animationSpec = MotifSprings.snappy(),
    label = "press",
)
Button(
    onClick = onFeed,
    interactionSource = source,
    modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale },
) { Text("Feed Lily") }
```

`graphicsLayer` scales the drawing only, so the 48 dp touch target stays.

### react-native

A `Pressable` with a Reanimated scale, `withSpring(0.97, spring.snappy)`; when `useReducedMotion()` is true, no scale.

```tsx
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { spring } from "@/design/motif-theme";

const reduced = useReducedMotion();
const scale = useSharedValue(1);
const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
const press = (to: number) => { if (!reduced) scale.value = withSpring(to, spring.snappy); };

<Pressable onPress={feed} onPressIn={() => press(0.97)} onPressOut={() => press(1)} accessibilityRole="button">
  <Animated.View style={[styles.button, style]}><Text style={styles.label}>Feed Lily</Text></Animated.View>
</Pressable>
```

The `Pressable` itself doesn't scale, so its hit area stays the full size.

### swiftui

A `ButtonStyle` that scales on `configuration.isPressed`, animated with `MotifSprings.snappy`; under `accessibilityReduceMotion` it doesn't scale.

```swift
struct PressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(MotifMotion.animation(MotifSprings.snappy, reduceMotion: reduceMotion), value: configuration.isPressed)
    }
}
```

Apply it with `.buttonStyle(PressStyle())` on top of the button's own colours; the opacity change is the feedback that stays under reduced motion.
