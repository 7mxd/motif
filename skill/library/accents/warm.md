# Warm accent

## Purpose

Two crafted, earthy accents for the Warm style, for apps about food, places, homes and things made by hand:

- **The horizon:** two layered hills along the bottom of the welcome or landing hero, a back hill in `brand-soft` and a narrower front hill in `brand`, with a peach sun half risen behind them. It runs off both screen edges, so it reads as land, not a sticker. The headline and actions sit above it on `background`. For a food app the hills can become a table's edge with a bowl on it; for travel, a road can run over the front hill. The subject comes from the app's world ([character](../../knowledge/character.md), "Illustration").
- **The stitch:** a dashed line with round ends, like a hand-sewn seam, starting from a small leaf. It divides sections, runs under a card's header, and sits at the foot of the key-figure card.

One horizon per screen; the stitch can repeat between sections.

## Signature

**A hand-drawn underline.** Optional. A loose, slightly uneven stroke in `accent` under one word, used the same way across the app:

- **Buttons:** none on buttons; they stay filled and warm-cornered.
- **Cards:** under one word of a first-impression card's title, or the headline of the welcome or landing hero.
- **Badges:** filled in `accent-2` with rounded corners, no underline.

## Fits

The Warm starting style and briefs that say earthy, welcoming, crafted or natural: food, hospitality, travel, home and handmade goods.

| Where | Accent |
|---|---|
| [Welcome](../screens/welcome.md) | the horizon across the drawing's quarter of the screen, the subject standing on the front hill |
| [Landing hero](../screens/landing-hero.md) | the horizon along the hero's foot at full width; on a desktop, the drawing beside the headline stands on it |
| [Empty state](../screens/empty-state.md) | a short horizon (a single hill and the sun) inside a rounded shape above the message |
| [Key-figure card](../cards/key-figure-card.md)'s corner and foot | a quarter sun in `on-brand` at low opacity rising from the bottom-end corner; the stitch above the card's footnote |

## Loudness

default. Earth tints and one deep strip of `brand` at the very bottom of the hero; the page above stays light. Turning it up means a third layer and a small subject on the hill (a house, a cup, a tent); turning it down means the stitch alone.

## Data

None of its own. The horizon is the ground the hero's content stands on: the subject on it is what the app is for, and a small floating card from the app beside it ("Tonight · Table for 4 · 8:00") ties the drawing to a real item. The stitch stands for a real break between sections; with no break, it goes.

Roles: `brand-soft` for the back hill, `brand` for the front hill, the sun mixed from a role with `surface` (on the web `color-mix(in srgb, var(--motif-color-warning) 55%, var(--motif-color-surface))`; natively the same mix from the theme's roles). The stitch is `brand` mixed half with `surface`, 2 px wide, dashes about `space.2` long. On the key-figure card, the quarter sun is `on-brand` at about 16% opacity.

## States

- **Loading:** the horizon shows at once, still; skeletons sit above it.
- **Empty:** the empty state's short horizon above a warm message ("No recipes saved yet") and one action.
- **Error:** the horizon stays without its subject; the message and retry sit above it. Never colour a hill `danger`.

## Motion

| Level | Horizon | Stitch |
|---|---|---|
| `lively` | the back hill rises by `space.3` and fades in, then the front hill, then the sun, each a quarter of `duration.fast` apart, `duration.slow`, `easing.enter` | draws from the leaf along its length, `duration.slow` |
| `default` | both hills rise by `space.2` and fade in together, once, `duration.slow`, `easing.enter`; the sun is already there | draws in once when it scrolls into view |
| `calm` | appears at once | appears drawn |
| `none` | appears at once | appears drawn |

The layers' order at `lively` is [stagger](../motion/stagger.md); the stitch is [draw-in](../motion/draw-in.md). Warm's motion is relaxed: nothing bounces, nothing loops.

## Accessibility

- Both accents are decoration and hidden from screen readers; the headline and the floating card carry the meaning.
- Text never sits on the hills. Above them, text is `text-primary` on `background`; the main action keeps `action-primary` with `on-action-primary`.
- In right to left the hills can stay as drawn; the stitch's leaf moves to the start edge (the right).
- Under reduced motion, both appear at their end state (level `none`).

## Stacks

### react-web

Inline SVG across the hero's foot (`preserveAspectRatio="none"` for the hills, the sun in its own small SVG so it stays round). With Motion for React, raise and fade the hills once and wrap the app once in `<MotionConfig reducedMotion="user">`; otherwise use the plain-web CSS.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

const rise = {
  initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 },
  transition: { duration: duration.slow, ease: easing.enter },
};

export function Horizon() {
  return (
    <svg className="horizon" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
      <motion.path {...rise} d="M0 48 C80 20 160 20 240 40 C300 54 350 30 400 36 V80 H0 Z"
        fill="var(--motif-color-brand-soft)" />
      <motion.path {...rise} d="M0 64 C100 44 200 72 300 56 C340 50 370 52 400 58 V80 H0 Z"
        fill="var(--motif-color-brand)" />
    </svg>
  );
}
```

The sun is a `circle` in `color-mix(in srgb, var(--motif-color-warning) 55%, var(--motif-color-surface))`, placed behind the back hill so its lower half is hidden.

### plain-web

The same SVG; the hills' rise and the stitch's draw sit inside `prefers-reduced-motion: no-preference`.

```css
.horizon { display: block; inline-size: 100%; block-size: clamp(64px, 18vw, 160px); }
.stitch { stroke: color-mix(in srgb, var(--motif-color-brand) 50%, var(--motif-color-surface));
  stroke-width: 2; stroke-linecap: round; stroke-dasharray: 8 8; }
@media (prefers-reduced-motion: no-preference) {
  .horizon path { animation: hill-rise var(--motif-duration-slow) var(--motif-easing-enter) both; }
  .stitch-wrap.is-in { animation: stitch-draw var(--motif-duration-slow) var(--motif-easing-enter) both; }
}
@keyframes hill-rise { from { opacity: 0; transform: translateY(var(--motif-space-2)); } }
@keyframes stitch-draw { from { clip-path: inset(0 100% 0 0); } }
[dir="rtl"] .stitch-wrap.is-in { animation-name: stitch-draw-rtl; }
@keyframes stitch-draw-rtl { from { clip-path: inset(0 0 0 100%); } }
```

A dashed stroke can't draw in with its own dash array, so the stitch's SVG (`.stitch-wrap`) is revealed with `clip-path` instead, once an `IntersectionObserver` adds `.is-in`.

### vue

The horizon as a component with the SVG above, its CSS in `<style scoped>` inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <svg class="horizon" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 48 C80 20 160 20 240 40 C300 54 350 30 400 36 V80 H0 Z" fill="var(--motif-color-brand-soft)" />
    <path d="M0 64 C100 44 200 72 300 56 C340 50 370 52 400 58 V80 H0 Z" fill="var(--motif-color-brand)" />
  </svg>
</template>
```

### svelte

Svelte's `fly` (`y` of a few pixels, with opacity) on each hill, with a zero duration when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  const t = { y: 8, duration: prefersReducedMotion.current ? 0 : duration.slow, easing: easing.enter };
</script>

<svg class="horizon" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
  <path in:fly={t} d="M0 48 C80 20 160 20 240 40 C300 54 350 30 400 36 V80 H0 Z" fill="var(--motif-color-brand-soft)" />
  <path in:fly={t} d="M0 64 C100 44 200 72 300 56 C340 50 370 52 400 58 V80 H0 Z" fill="var(--motif-color-brand)" />
</svg>
```

### angular

A standalone component with the SVG in its template and the plain-web CSS in `styles`, inside `prefers-reduced-motion: no-preference`; the stitch is a second small component.

```ts
@Component({
  selector: "app-stitch",
  template: `<svg width="100%" height="12" aria-hidden="true">
    <path d="M2 6 q4 -6 8 0 q-4 6 -8 0" fill="var(--motif-color-brand)" />
    <line class="stitch" x1="18" y1="6" x2="100%" y2="6" />
  </svg>`,
})
export class Stitch {}
```

The leaf is the small closed `path` at the line's start.

### flutter

A `CustomPainter` draws the hills with `cubicTo` and the sun with `drawCircle`, scaled to its size; `TweenAnimationBuilder` raises and fades it, with `MotifMotion.duration(context, …)` zero under reduced motion. Wrap it in `ExcludeSemantics`.

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, child) => Opacity(
    opacity: t,
    child: Transform.translate(offset: Offset(0, MotifSpace.s2 * (1 - t)), child: child),
  ),
  child: ExcludeSemantics(
    child: CustomPaint(size: const Size(double.infinity, 120), painter: HorizonPainter(MotifColors.of(context))),
  ),
)

// In paint: sun first (Color.lerp(colors.surface, colors.warning, 0.55)), then
// back hill in colors.brandSoft, front hill in colors.brand, each a Path of cubicTo scaled by size.width / 400.
```

The stitch is a painter that steps along a line drawing short round-capped segments in `Color.lerp(colors.surface, colors.brand, 0.5)`, up to a progress value for its draw-in.

### compose

A `Canvas` with the hills as `Path`s and an `Animatable` for the rise; read `MotifMotion.reduced()` into a `val` first. The stitch uses `PathEffect.dashPathEffect`. `Modifier.clearAndSetSemantics {}` hides both.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val t = remember { Animatable(if (reduced) 1f else 0f) }
LaunchedEffect(Unit) { if (!reduced) t.animateTo(1f, tween(MotifDurations.slow, easing = MotifEasing.enter)) }
Canvas(Modifier.fillMaxWidth().height(120.dp).graphicsLayer {
    alpha = t.value; translationY = MotifSpace.s2.toPx() * (1 - t.value)
}.clearAndSetSemantics {}) {
    val k = size.width / 400f; val y0 = size.height - 80 * k
    drawCircle(lerp(colors.surface, colors.warning, 0.55f), radius = 22 * k, center = Offset(300 * k, y0 + 40 * k))
    drawPath(Path().apply { moveTo(0f, y0 + 48 * k); cubicTo(80 * k, y0 + 20 * k, 160 * k, y0 + 20 * k, 240 * k, y0 + 40 * k)
        cubicTo(300 * k, y0 + 54 * k, 350 * k, y0 + 30 * k, size.width, y0 + 36 * k); lineTo(size.width, size.height); lineTo(0f, size.height); close() }, colors.brandSoft)
    // the front hill the same way, in colors.brand
}
```

For the stitch: `drawLine(…, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 8.dp.toPx())), cap = StrokeCap.Round)`.

### react-native

`react-native-svg` (ask before adding it) with the same paths, in an `Animated.View` raised and faded by Reanimated; when `useReducedMotion()` is true, start at the end state. Hide it with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const t = useSharedValue(reduced ? 1 : 0);
useEffect(() => { if (!reduced) t.value = withTiming(1, { duration: duration.slow, easing: easing.enter }); }, []);
const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: space.s2 * (1 - t.value) }] }));

<Animated.View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Svg viewBox="0 0 400 80" width="100%" height={120} preserveAspectRatio="none">
    <Path d={backHill} fill={colors.brandSoft} />
    <Path d={frontHill} fill={colors.brand} />
  </Svg>
</Animated.View>
```

The stitch is a `Line` with `strokeDasharray="8 8"` and `strokeLinecap="round"`.

### swiftui

`Hill` `Shape`s (each two `addCurve`s, closed along the bottom) stacked in a `ZStack` over a sun `Circle`, raised and faded on appear; under `accessibilityReduceMotion`, set the value without animation.

```swift
extension Color {
    /// Mixes toward `other` by `amount`: `Color.mix` on iOS 18, the resolved components on iOS 17.
    func motifMix(_ other: Color, by amount: Double, in env: EnvironmentValues) -> Color {
        if #available(iOS 18, *) { return mix(with: other, by: amount) }
        let a = resolve(in: env), b = other.resolve(in: env), t = Float(amount)
        return Color(Color.Resolved(red: a.red + (b.red - a.red) * t, green: a.green + (b.green - a.green) * t,
                                    blue: a.blue + (b.blue - a.blue) * t, opacity: a.opacity + (b.opacity - a.opacity) * t))
    }
}

@Environment(\.self) private var env
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown = false

ZStack(alignment: .bottom) {
    Circle().fill(colors.warning.motifMix(colors.surface, by: 0.45, in: env)).frame(width: 44).offset(x: 80, y: -36)
    BackHill().fill(colors.brandSoft)
    FrontHill().fill(colors.brand)
}
.frame(height: 120)
.opacity(shown ? 1 : 0)
.offset(y: shown ? 0 : MotifSpace.s2)
.accessibilityHidden(true)
.onAppear {
    if reduceMotion { shown = true } else { withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { shown = true } }
}
```

`motifMix` uses iOS 18's `Color.mix(with:by:)` and mixes the resolved components on iOS 17, the adapter's floor. The stitch is a `Path` stroked with `StrokeStyle(lineWidth: 2, lineCap: .round, dash: [8, 8])`.
