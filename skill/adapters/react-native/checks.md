# Checks and screenshots

What `motif check` and `motif shot --audit` report in an Expo app, how to fix each finding, and the state scripts that let `motif shot` reach screens behind a form or a tap.

`motif check` reads the app's TypeScript and JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`). Comments and the insides of strings are not code, so a colour in a comment is fine. Sizes are read only inside style objects (`StyleSheet.create`, `style={…}` and props ending in `Style`), and motion only inside Reanimated and `Animated` calls, so a number in a data table isn't a finding. These aren't read: `ios/`, `android/`, `.expo/`, `dist/`, `web-build/`, `expo-env.d.ts`, tests (`*.test.*`, `__tests__/`) and Motif's own `motif-theme.tsx`.

A value that truly must stay as it is (a colour the user picks, a partner's brand colour) gets a `// motif-ok: <reason>` comment on its line or the line above. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason:

```tsx
// motif-ok: the partner's brand colour, fixed by their licence
export const partnerBlue = "#0057b8";
```

## `raw-color`

A colour typed into a style.

- Example: `"#8a8a8a"`, `"rgba(0, 0, 0, 0.5)"`, `"white"`, `"hsl(210, 50%, 40%)"`. (`"transparent"` is fine.)
- Fix: the colour role it stands for, `colors.<role>` from `useMotifTheme()`. Each finding names the nearest role.
- The starter's `constants/Colors.ts` (an exported object of light and dark colours) is the app's own palette, so its colours are flagged too, and `motif check` adds one line for the file: `<file> is your own theme's palette: once the app uses Motif's theme, remove it, or list its folder under "ignore" in design/motif.json.` Don't rewrite the palette with Motif's roles: move the components to `useMotifTheme()`, then delete it ([theme code](tokens.md#wiring-it-in)).

```tsx
import { Text, View } from "react-native";

import { useMotifTheme } from "@/design/motif-theme";

export function Note() {
  const { colors, type } = useMotifTheme();
  return (
    <View style={{ backgroundColor: colors.surface }}>
      <Text style={[type.caption, { color: colors.textSecondary }]}>Prices include tax</Text>
    </View>
  );
}
```

## `off-scale`

A spacing, corner or text size in a style that isn't on the theme's scales. A number that is on a scale (`padding: 16`) is seen but allowed, since the build stays correct; still prefer the role, so a change to the guide arrives everywhere.

- Example: `padding: 13`, `marginTop: 18`, `gap: 6`, `borderRadius: 10`, `fontSize: 15`.
- Fix: the nearest step, `space.s4`, `radius.md`, or a text role's `...type.body`. If the design truly needs a new step, propose a change to the design guide instead. Layout sizes that aren't spacing (`width`, `height`, `minHeight`, `borderWidth`) aren't read.

```tsx
import { StyleSheet, View } from "react-native";

import { radius, space } from "@/design/motif-theme";

export function Box({ children }: { children: React.ReactNode }) {
  return <View style={styles.box}>{children}</View>;
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, gap: space.s2, padding: space.s4 },
});
```

## `raw-font`

A font family typed into a style.

- Example: `fontFamily: "Georgia"`, `fontFamily: "Inter_400Regular"`.
- Fix: a text role, `...type.body`, which already has the theme's face and its Arabic companion. For a code font the guide's `font.mono` role; if the theme has none, propose adding it as a design guide change.

```tsx
import { Text } from "react-native";

import { useMotifTheme } from "@/design/motif-theme";

export function OrderNumber() {
  const { type } = useMotifTheme();
  return <Text style={type.label}>#A1429</Text>;
}
```

## `raw-motion`

A duration, easing or spring typed into an animation.

- Example: `withTiming(1, { duration: 300 })`, `Easing.inOut(Easing.ease)`, `Easing.bezier(0.4, 0, 0.2, 1)`, `withSpring(1, { damping: 10, stiffness: 100 })`, `FadeIn.duration(250)`, `FadeIn.springify().damping(12)`.
- Fix: `duration.<role>`, `easing.<role>` and `spring.<role>` ([motion](motion.md)).
- Not motion, so not findings: `Easing.linear`, and a delay or timeout that is a timer (`setTimeout`, a debounce, how long a toast stays up).

```tsx
import { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { duration, easing, spring, useMotifTheme } from "@/design/motif-theme";

export function Dot({ on }: { on: boolean }) {
  const { reducedMotion } = useMotifTheme();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(on ? 1 : 0.4, { duration: reducedMotion ? 0 : duration.fast, easing: easing.standard });
    scale.value = withSpring(on ? 1 : 0.9, spring.snappy);
  }, [on, reducedMotion, opacity, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={style} />;
}
```

## `reduced-motion`

The app animates (`useSharedValue`, `withTiming`, `withSpring`, `Animated`, `entering=`, `LayoutAnimation`), but nothing in its own code respects the "reduce motion" setting. Motif's theme file reads it itself, so only the app's own files count.

- Fix: read `useMotifTheme().reducedMotion` (or Reanimated's `useReducedMotion()`), and skip or shorten the animation when it is on. Reanimated's `ReduceMotion.System`, its default, also satisfies the check. For core `Animated`, `AccessibilityInfo.isReduceMotionEnabled()` ([motion](motion.md#reduced-motion)). One use anywhere in the app's code satisfies the check; the audit below looks at each screen.

```tsx
import { useEffect } from "react";
import { useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { duration, easing } from "@/design/motif-theme";

export function useFadeIn() {
  const reduce = useReducedMotion();
  const opacity = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) opacity.value = withTiming(1, { duration: duration.base, easing: easing.enter });
  }, [reduce, opacity]);
  return opacity;
}
```

## NativeWind

An app that uses NativeWind (`nativewind` in `package.json`) is also checked for Tailwind classes, as a web app is: `tailwind-arbitrary` for an arbitrary value (`p-[13px]`, `bg-[#8a8a8a]`) and `tailwind-palette` for a palette colour (`bg-gray-500`) instead of a role. Fix them as [the React web guide](../react-web/checks.md#tailwind-arbitrary) does, with the classes the theme gives. Without NativeWind these rules don't apply.

## `generated-edited`

`motif-theme.tsx` was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Contrast

From `motif shot --audit`: text measured as drawn below 4.5:1 (3:1 for large text: 24 px, or 18.66 px bold), and icons below 3:1. The audit runs axe on Expo's web target, so it judges the text and the pixels behind it as drawn, light and dark, in every variant.

- Fix: use the text role the design guide pairs with that surface (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). If a pair itself fails, `motif validate` reports it too, and the role values need changing.
- Text over a photo or a gradient has no single background, so it is left out; look at those screens by eye.

```tsx
import { Text } from "react-native";

import { useMotifTheme } from "@/design/motif-theme";

export function Estimate() {
  const { colors, type } = useMotifTheme();
  return <Text style={[type.caption, { color: colors.textSecondary }]}>Delivery times are estimates</Text>;
}
```

## Target size

From `motif shot --audit`: a tappable control smaller than 44×44 px on the phone and tablet sizes. React Native draws a `Pressable`, `TouchableOpacity` or `TouchableHighlight` on the web as a plain element with no role, which axe doesn't see, so Motif also takes every pointer-cursor element that can be focused and isn't a link, button or field, and measures that. The size is the element's box, as the web draws it.

- Fix: `hitSlop`, which widens the area that counts as a tap without changing how it looks, or a minimum width and height, or padding. `hitSlop` doesn't change the box the audit measures on the web, so for a small control inside a row prefer the size:

```tsx
import { Pressable, StyleSheet } from "react-native";

import { space } from "@/design/motif-theme";

export function Remove({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Remove" hitSlop={space.s2} onPress={onPress} style={styles.target}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
});
```

## Names

From `motif shot --audit`: a tappable control or text field with no name a screen reader can say. The finding is reported in the review format under the category `accessibility`, as "The button has no name" or, for a control holding only an icon from an icon font (`@expo/vector-icons`), "The icon has no name". An icon glyph is a character to the browser, so a bare glyph never counts as a name.

- Fix: an `accessibilityLabel` (it becomes `aria-label` on the web), or visible text inside the control. A `TextInput` is named by its `accessibilityLabel` or its `placeholder`. Set `accessibilityRole` too, so a screen reader says what it is.
- Decoration gets `accessible={false}` or `accessibilityElementsHidden`.

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { space, useMotifTheme } from "@/design/motif-theme";

export function MenuButton({ onPress }: { onPress: () => void }) {
  const { colors } = useMotifTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={space.s3} onPress={onPress}>
      <Ionicons name="menu" size={24} color={colors.textPrimary} />
    </Pressable>
  );
}
```

## Reduced motion

From `motif shot --audit`: with the "reduce motion" setting on, something on the screen keeps moving. Motif draws every screenshot with the setting on, at the 390 px phone size, and samples the elements' transforms.

- Reanimated's animations stop by themselves under the setting unless the app passes `ReduceMotion.Never`, so a loop with the default `ReduceMotion.System` is correctly not reported. Take `ReduceMotion.Never` out, or give the loop a still frame.
- Core `Animated.loop` doesn't check the setting: start it only when `AccessibilityInfo.isReduceMotionEnabled()` is false, and listen to `reduceMotionChanged` ([motion](motion.md#reduced-motion)).

## Screens behind a form or a tap

`motif shot` draws each route as it first appears. A screen that only appears after someone fills in a form or taps something needs a **state script**: a few lines of JavaScript, run in the web page after it loads, that get the screen there. Keep one per state in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.js` for each. Because the script runs on Expo's web target, you find things in the page's markup, not in React: a `TextInput` is an `<input>` with an `aria-label` (from `accessibilityLabel`) or a `placeholder`, and a `Pressable` with `accessibilityRole="button"` is a `<button>`. Set the value the way typing would (the input's own setter), then send the `input` event React listens for:

```js
// design/states/filled.js: the item form with a name typed in. Only the form route has the field.
const field = document.querySelector('input[aria-label="Item name"], input[placeholder="Item name"]');
if (!field) return;
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
set.call(field, "Oat milk");
field.dispatchEvent(new Event("input", { bubbles: true }));
await new Promise((done) => setTimeout(done, 200));
// A control to tap: find it by its label and click it.
document.querySelector('[aria-label="Add item"]')?.click();
```

```bash
motif shot --routes /form --state design/states/filled.js
```

- It runs on every route `motif shot` draws: start with a guard that returns on the others, or capture only its route with `--routes`.
- Screenshots are named after the route and the state (`form@filled.mobile.png`), each starting from a fresh visit. Use the same `--state` options for `--save` and `--against`.
- A script can `await`. One still running after 15 seconds is left behind and reported. An error it throws is the screen's error, and the screenshot is still taken.
- An app that reads its state from storage or the network shows mock data on the web as it does on a phone; the script runs after load, so set up state by using the screen. Mock data only.
- A screen that is a route is drawn with `--routes`. A route with a parameter (`/orders/[id]`) is skipped until you name one: `--routes /orders/1`.

## Right to left

`motif shot --rtl` takes every screenshot a second time in Arabic, right to left (`--rtl he` for Hebrew), named with `.rtl`, and the audit covers them too. On the web target `I18nManager.forceRTL` does nothing, so Motif sets the page's language and `dir="rtl"` and says so in its notes; flex rows then mirror as they would on a phone. The app's own table gives Arabic strings when it picks the language from the locale ([platform](platform.md#right-to-left)).

```bash
motif shot --audit --rtl
```

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the route, the element and a screenshot. `motif shot` needs the app's web packages (`npx expo install react-dom react-native-web @expo/metro-runtime`) and draws the web target: its first run says so, because native-only components and platform fonts can differ. A screen that throws as it loads is left out of the audit, and the run says which. Fix what they report, then run them again until both are clean; `npx tsc --noEmit` too.
