# Soft accent

## Purpose

Two gentle accents for the Soft style, for apps that should feel like a friend rather than a tool:

- **The cloud wash and its scene:** a rounded, organic `brand-soft` shape (no straight edges, no points) with a small drawn scene standing on it: the app's own subject, filled, with two or three supporting pieces. For a journaling app, a mug beside an open notebook with a leaf sprig; for a meditation app, a cushion under a peach sun; for a community app, two figures on a bench. It is the welcome's and the empty state's drawing ([character](../../knowledge/character.md), the "friendly, gentle, warm, reassuring" row).
- **Pebbles:** three overlapping rounded pebbles in `on-brand` at low opacity in the key-figure card's top-end corner, running off the card's rounded edge. They soften a deep card without adding a picture.

One cloud scene per screen; the pebbles only on the one `brand` card.

## Fits

The Soft starting style and briefs that say gentle, friendly, warm or approachable: wellness, journaling, community and lifestyle apps.

| Where | Accent |
|---|---|
| [Welcome](../screens/welcome.md) | the cloud scene, about a quarter to a third of a phone's height, above the headline |
| [Landing hero](../screens/landing-hero.md) | the cloud scene beside the headline on a desktop, at the same height; above it on a phone |
| [Empty state](../screens/empty-state.md) | a smaller cloud scene (about a fifth of the screen) above the message |
| [Key-figure card](../cards/key-figure-card.md)'s corner | pebbles in `on-brand` at 12–18% opacity |

## Loudness

default. Colour lives in the drawing and the tint, not in bands: no saturated full-width block. Turning it up means a face on the subject (two dots and a smile make it a mascot) and a second small cloud; turning it down means the pebbles alone and no scene.

## Data

None of its own: the scene shows what the app is for, and an empty state's scene shows what will be there ("Your first entry will sit here"). A small floating card from the app itself beside the scene ("Today · 3 minutes of calm") ties it to the person's own content.

Roles: `brand-soft` for the cloud; the subject filled in `brand`, or in a warm or soft mix of a role with `surface` (on the web `color-mix(in srgb, var(--motif-color-warning) 55%, var(--motif-color-surface))` for peach and terracotta, `info` the same way for lavender; natively the same mix computed from the roles); `surface` for highlights; never `text-primary` black for an object. Corners on any card beside it: `radius.lg`.

## States

- **Loading:** the cloud shows, still, without its scene; skeletons sit beside it, not on it.
- **Empty:** the empty state's smaller scene, its message in warm words and one action.
- **Error:** the cloud stays and the scene steps back (the subject alone, no supporting pieces); the message says what happened and offers a retry. No `danger` in the drawing.

## Motion

| Level | Cloud scene | Pebbles |
|---|---|---|
| `lively` | the cloud fades in and grows from 96% to full size with `spring.smooth`; the scene's pieces follow one after another | fade in once, `duration.slow` |
| `default` | the cloud and scene fade in together and grow from 96%, `duration.slow`, `easing.enter`, once | fade in once, `duration.slow` |
| `calm` | appears at once | appear at once |
| `none` | appears at once | appear at once |

The scene's pieces at `lively` follow [stagger](../motion/stagger.md). Nothing loops or floats: the drawing settles once and stays still.

## Accessibility

- Both accents are decoration and hidden from screen readers; the headline and message carry the meaning.
- Text never sits on the drawing. Beside it, text is `text-primary` on `background` or `surface`; on the key-figure card, `on-brand` on `brand`, with the pebbles too faint to lower that contrast.
- Pebbles mirror to the top-start corner in right to left; the scene can stay as drawn unless it points a direction.
- Under reduced motion, both appear at their end state (level `none`).

## Stacks

### react-web

Inline SVG, `aria-hidden="true"`. With Motion for React, fade and grow the whole `svg` once and wrap the app once in `<MotionConfig reducedMotion="user">`; otherwise use the plain-web CSS.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

export function CloudScene() {
  return (
    <motion.svg viewBox="0 0 200 160" className="cloud-scene" aria-hidden="true"
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: duration.slow, ease: easing.enter }}>
      <path d="M100 8 C150 6 196 40 192 86 C188 132 146 156 98 152 C50 148 6 124 8 80 C10 36 50 10 100 8 Z"
        fill="var(--motif-color-brand-soft)" />
      <circle cx="148" cy="44" r="14" fill="color-mix(in srgb, var(--motif-color-warning) 55%, var(--motif-color-surface))" />
      <ellipse cx="96" cy="128" rx="44" ry="6" fill="color-mix(in srgb, var(--motif-color-brand) 20%, transparent)" />
      <rect x="72" y="80" width="44" height="48" rx="10" fill="var(--motif-color-brand)" />
      <path d="M116 92 a10 10 0 0 1 0 20" fill="none" stroke="var(--motif-color-brand)" strokeWidth="6" />
    </motion.svg>
  );
}
```

That is a mug on its shadow under a peach sun; swap the subject for the app's own, keeping the cloud and the sun.

### plain-web

The same SVG; the entrance sits inside `prefers-reduced-motion: no-preference`.

```css
.cloud-scene { display: block; inline-size: min(100%, 320px); margin-inline: auto; }
@media (prefers-reduced-motion: no-preference) {
  .cloud-scene { animation: cloud-in var(--motif-duration-slow) var(--motif-easing-enter) both; }
  .pebbles { animation: pebbles-in var(--motif-duration-slow) var(--motif-easing-enter) both; }
}
@keyframes cloud-in { from { opacity: 0; transform: scale(0.96); } }
@keyframes pebbles-in { from { opacity: 0; } }
.pebbles { position: absolute; inset-block-start: 0; inset-inline-end: 0; pointer-events: none; }
.key-figure { position: relative; overflow: hidden; border-radius: var(--motif-radius-lg); }
```

The pebbles are an SVG of three `circle`s in `var(--motif-color-on-brand)` with `fill-opacity="0.14"`, centred near the card's corner so the card's `overflow: hidden` cuts them on its curve.

### vue

The scene as a component with the SVG above, entered with `<Transition appear>`; its classes sit inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <Transition appear name="cloud">
    <svg viewBox="0 0 200 160" class="cloud-scene" aria-hidden="true">
      <path :d="cloudPath" fill="var(--motif-color-brand-soft)" />
      <slot />
    </svg>
  </Transition>
</template>
```

The `<slot />` takes the app's subject, drawn in role colours.

### svelte

Svelte's `scale` transition (start `0.96`, with opacity) on the scene; duration zero when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { scale } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
</script>

<svg viewBox="0 0 200 160" class="cloud-scene" aria-hidden="true"
  in:scale={{ start: 0.96, duration: prefersReducedMotion.current ? 0 : duration.slow, easing: easing.enter }}>
  <path d={cloudPath} fill="var(--motif-color-brand-soft)" />
  <!-- the app's subject, filled in role colours -->
</svg>
```

### angular

A standalone component with the SVG in its template and the plain-web CSS in `styles`, inside `prefers-reduced-motion: no-preference`; project the subject with `<ng-content>`.

```ts
@Component({
  selector: "app-cloud-scene",
  template: `
    <svg viewBox="0 0 200 160" class="cloud-scene" aria-hidden="true">
      <path [attr.d]="cloudPath" fill="var(--motif-color-brand-soft)" />
      <ng-content />
    </svg>`,
})
export class CloudScene { cloudPath = "M100 8 C150 6 196 40 192 86 C188 132 146 156 98 152 C50 148 6 124 8 80 C10 36 50 10 100 8 Z"; }
```

### flutter

A `CustomPainter` draws the cloud with `cubicTo` and the subject's shapes; `TweenAnimationBuilder` fades and grows it, with `MotifMotion.duration(context, …)` zero under reduced motion. Warm fills mix roles with `Color.lerp`. Wrap it in `ExcludeSemantics`.

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, child) => Opacity(opacity: t, child: Transform.scale(scale: 0.96 + 0.04 * t, child: child)),
  child: ExcludeSemantics(child: CustomPaint(size: const Size(200, 160), painter: CloudScenePainter(MotifColors.of(context)))),
)

// In paint: the cloud
// final cloud = Path()..moveTo(100, 8)..cubicTo(150, 6, 196, 40, 192, 86)..cubicTo(188, 132, 146, 156, 98, 152)
//   ..cubicTo(50, 148, 6, 124, 8, 80)..cubicTo(10, 36, 50, 10, 100, 8)..close();
// canvas.drawPath(cloud, Paint()..color = colors.brandSoft);
// final peach = Color.lerp(colors.surface, colors.warning, 0.55)!;
```

Scale the painter's coordinates to `size` so the scene fits any width.

### compose

A `Canvas` with the cloud as a `Path` of `cubicTo`s and the subject on it; read `MotifMotion.reduced()` into a `val`, and fade and grow with an `Animatable`. Warm fills use `lerp(colors.surface, colors.warning, 0.55f)`. `Modifier.clearAndSetSemantics {}` hides it.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val t = remember { Animatable(if (reduced) 1f else 0f) }
LaunchedEffect(Unit) { if (!reduced) t.animateTo(1f, tween(MotifDurations.slow, easing = MotifEasing.enter)) }
Canvas(Modifier.size(200.dp, 160.dp).graphicsLayer {
    alpha = t.value; scaleX = 0.96f + 0.04f * t.value; scaleY = scaleX
}.clearAndSetSemantics {}) {
    val k = size.width / 200f
    val cloud = Path().apply {
        moveTo(100 * k, 8 * k); cubicTo(150 * k, 6 * k, 196 * k, 40 * k, 192 * k, 86 * k)
        cubicTo(188 * k, 132 * k, 146 * k, 156 * k, 98 * k, 152 * k)
        cubicTo(50 * k, 148 * k, 6 * k, 124 * k, 8 * k, 80 * k); cubicTo(10 * k, 36 * k, 50 * k, 10 * k, 100 * k, 8 * k); close()
    }
    drawPath(cloud, colors.brandSoft)
    drawCircle(lerp(colors.surface, colors.warning, 0.55f), radius = 14 * k, center = Offset(148 * k, 44 * k))
}
```

### react-native

`react-native-svg` (ask before adding it) with the same paths, in an `Animated.View` faded and grown by Reanimated; when `useReducedMotion()` is true, start at the end state. Warm fills come from a small helper that mixes two roles. Hide it with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const t = useSharedValue(reduced ? 1 : 0);
useEffect(() => { if (!reduced) t.value = withTiming(1, { duration: duration.slow, easing: easing.enter }); }, []);
const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.96 + 0.04 * t.value }] }));

<Animated.View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Svg viewBox="0 0 200 160" width="100%" height={160}>
    <Path d={cloudPath} fill={colors.brandSoft} />
    {/* React Native has no colour mixing: lay warning at 55% over a surface copy of the shape */}
    <Circle cx={148} cy={44} r={14} fill={colors.surface} />
    <Circle cx={148} cy={44} r={14} fill={colors.warning} fillOpacity={0.55} />
  </Svg>
</Animated.View>
```

### swiftui

A `Cloud` `Shape` (four `addCurve`s) under the subject's shapes in a `ZStack`, faded and grown on appear; under `accessibilityReduceMotion`, set the value without animation. Warm fills use `colors.warning.mix(with: colors.surface, by: 0.45)` (iOS 18; on earlier versions, mix the roles' components yourself).

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown = false

ZStack {
    Cloud().fill(colors.brandSoft)
    Circle().fill(colors.warning.mix(with: colors.surface, by: 0.45)).frame(width: 28).offset(x: 48, y: -36)
    MugShape().fill(colors.brand).frame(width: 44, height: 48).offset(y: 24)
}
.frame(width: 200, height: 160)
.opacity(shown ? 1 : 0)
.scaleEffect(shown ? 1 : 0.96)
.accessibilityHidden(true)
.onAppear {
    if reduceMotion { shown = true } else { withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { shown = true } }
}
```

The pebbles are three `Circle()`s in `colors.onBrand.opacity(0.14)` in the card's `.overlay(alignment: .topTrailing)`, clipped by the card's `RoundedRectangle(cornerRadius: MotifRadius.lg)`.
