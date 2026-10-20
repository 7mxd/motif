# Motion

How to use the design guide's motion roles with React Native's animation tools, the common patterns, and how to respect the "reduce motion" setting. The motion guide ([knowledge/motion.md](../../knowledge/motion.md)) says what to animate and why; this file is how. Use Reanimated (3.16 or newer, the starter's choice): it runs animations on the UI thread, and the theme's springs and curves are written for it.

## The roles

`motif tokens` writes three objects of motion values, from section 4 of `DESIGN.md`:

| Object | Roles | Type |
|---|---|---|
| `duration.` | `instant`, `fast`, `base`, `slow` (the guide's own names) | Milliseconds, a number |
| `easing.` | `standard`, `enter`, `exit` | `Easing.bezier(…)` for `withTiming` |
| `spring.` | `snappy`, `smooth`, `bouncy` | `{ mass, stiffness, damping }` for `withSpring` |

Use a duration with an easing for a change between two values, and a spring for movement that follows a finger or should feel physical. Never type a `duration: 300`, an `Easing.inOut(Easing.ease)` or a `damping: 10`: `motif check` reports them as `raw-motion`.

```tsx
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useEffect } from "react";

import { duration, easing, useMotifTheme } from "@/design/motif-theme";

export function FadeSwap({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const { reducedMotion } = useMotifTheme();
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: reducedMotion ? 0 : duration.base,
      easing: easing.standard,
    });
  }, [visible, reducedMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
```

## Common patterns

**A value changing** (size, colour, opacity, position): a shared value moved with `withTiming(` and `duration.fast` or `duration.base` with `easing.standard`, as above.

**Something entering or leaving**: Reanimated's layout animations, `entering=` and `exiting=`, with `duration.base` for what arrives and `duration.fast` for what goes. A layout animation's `.easing(…)` takes a plain easing function, and the theme's `easing.<role>` is a factory that Reanimated 3.16 and 3.17 reject in the type-check (3.19 and 4 accept it), so on the floor leave the curve to the animation's default, or write the move yourself with `withTiming(` and `easing.enter` as above:

```tsx
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { duration, useMotifTheme } from "@/design/motif-theme";

export function SavedNote() {
  const { colors, type, reducedMotion } = useMotifTheme();
  return (
    <Animated.Text
      entering={reducedMotion ? undefined : FadeIn.duration(duration.base)}
      exiting={reducedMotion ? undefined : FadeOut.duration(duration.fast)}
      style={[type.label, { color: colors.textPrimary }]}
    >
      Saved
    </Animated.Text>
  );
}
```

**A tap that gives**: a spring on scale, so the response follows the finger (below).

**Moving between screens**: keep the platform's own transitions. iOS and Android each animate routes in their own way (Expo Router's `Stack` uses them), and people expect it. Don't replace them with a custom one unless `DESIGN.md` asks for it, and then set `animationDuration` from `duration.slow` in the screen's options.

**Lists**: animate an item entering with `entering=` on the row; don't stagger more than a handful of rows, or the last one arrives after people have tried to tap it.

## Springs

`spring.snappy` and the others are `{ mass, stiffness, damping }` objects, to be passed to `withSpring(`. A spring can overshoot its end, which is what makes it feel physical:

```tsx
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { spring, useMotifTheme } from "@/design/motif-theme";

export function SpringPress({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const { reducedMotion } = useMotifTheme();
  const scale = useSharedValue(1);

  const springTo = (target: number) => {
    scale.value = reducedMotion ? target : withSpring(target, spring.snappy);
  };

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => springTo(0.96)}
      onPressOut={() => springTo(1)}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}
```

`SpringPress` is for a child that has its own name (a card with a label, an icon with its text); a bare `Text` can't be reached from a keyboard, so give the `Pressable` an `accessibilityLabel` when the child has none.

A drag that lets go (a sheet, a swipe to dismiss) works the same way: start `withSpring(` from where the finger left, with the finger's velocity, so the motion carries on from it: `withSpring(0, { ...spring.smooth, velocity })`, with `velocity` from the gesture handler's end event. Use `smooth` for large surfaces, `snappy` for small ones, and `bouncy` only where the guide says playful.

## Reduced motion

When the phone's setting is on, `useMotifTheme().reducedMotion` is true (it is Reanimated's `useReducedMotion()` underneath, which you can call yourself). What that asks of you:

- **Values you drive**: pass `0` as the duration, or set the value, as the examples do.
- **Reanimated's own animations** (`withTiming`, `withSpring`, layout animations) already end at once under the setting, because their `reduceMotion` option defaults to `ReduceMotion.System`. Leave it there. `ReduceMotion.Never` makes an animation play regardless, and `motif shot --audit` reports a loop that does.
- **Core `Animated`** (the `Animated` from `react-native`) doesn't check the setting: read it with `AccessibilityInfo.isReduceMotionEnabled()` and listen to `reduceMotionChanged` before starting a loop.
- **Looping animation** (a pulsing skeleton, a shimmer, an animated illustration) stops, and shows its still frame.
- **Movement that carries meaning** (a card that flies to the cart) becomes a fade or an instant change, with the same result.
- **Auto-playing video and Lottie** wait for a tap.

`motif check` reports `reduced-motion` when an app animates and nothing in its own code reads the setting ([checks](checks.md#reduced-motion)). `motif shot --audit` checks it on the screens as drawn ([checks](checks.md#reduced-motion-1)).

## Skeletons

A loading skeleton that pulses is a loop, so it stops when reduce motion is on:

```tsx
import { useEffect } from "react";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { duration, easing, radius, useMotifTheme } from "@/design/motif-theme";

export function Skeleton({ height, width }: { height: number; width?: number }) {
  const { colors, reducedMotion } = useMotifTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.5, { duration: duration.slow, easing: easing.standard }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [reducedMotion, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      style={[{ backgroundColor: colors.border, borderRadius: radius.sm, height, width }, pulse]}
    />
  );
}
```

A spinner is different from a skeleton: an `ActivityIndicator` never stops. For content, prefer a skeleton. A spinner belongs only inside a small control, such as a button that's saving, and when `reducedMotion` is true it is replaced by a still label that is still announced (`AppButton` in [components](components.md#every-state) keeps its label in the layout and in the accessibility tree).
