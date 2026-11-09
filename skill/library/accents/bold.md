# Bold accent

## Purpose

Two loud, decisive accents for the Bold style, for launches, sports and media where the first screen should hit hard:

- **The angled slab:** a full-bleed `brand` band across the top of the welcome or landing hero whose lower edge is cut at an angle (deeper at the start edge, shallower at the end). Three thick parallel stripes in `on-brand` at low opacity run off its end edge behind the headline, like speed marks. The `display` headline sits on it in `on-brand`, in the heaviest weight the font has ([character](../../knowledge/character.md), the "energetic, bold" row).
- **The chevron run:** three chunky chevrons in a row (`›››`) that point at the next thing: beside the closing call to action, after "See this week's runs", or beside a key figure's change ("+12% this week") to show which way it moved. Direction is the information; the chevrons never point at nothing.

The slab once per screen, at the top; the chevron run once per screen.

## Fits

The Bold starting style and briefs that say loud, decisive, high-contrast or energetic: marketing sites, launches, sports, media.

| Where | Accent |
|---|---|
| [Welcome](../screens/welcome.md) | the angled slab behind the top third, holding the headline; stripes at its end |
| [Landing hero](../screens/landing-hero.md) | the slab behind the whole hero at full width; the chevron run beside the closing band's action |
| [Empty state](../screens/empty-state.md) | a short slab (a quarter of the screen) with the message on it and the chevron run pointing at the action |
| [Key-figure card](../cards/key-figure-card.md)'s corner | two short stripes in `on-brand` at about 15% opacity running off the top-end corner; chevrons beside the change, pointing up or down |

## Loudness

loud. A saturated slab, an angled cut and heavy marks. Working screens keep only the key-figure card's stripes and the chevrons, so lists stay readable. Turning it down means the slab without stripes and with a straight lower edge; it never gains a gradient or a second colour.

## Data

None of the slab's own: it holds the headline, the line on what the app does, and the actions. The chevron run carries a direction: toward the action it sits beside, or the direction of a change (up for a rise, down for a fall, coloured `success` or `danger` only when the change needs attention).

Roles: `brand` for the slab, `on-brand` for its text and its stripes (at about 15% opacity), `on-brand` with `brand` text for the main button on the slab; the chevrons in `brand` on a light page, `on-brand` on the slab. Sizes: the cut drops `space.10` across the width; stripes about `space.5` thick; chevron strokes 4 px with square ends, `space.3` apart. Corners stay sharp (`radius.sm`), as the style's are.

## States

- **Loading:** the slab shows at once, still, with skeleton lines in `on-brand` at low opacity on it; no chevrons until there is somewhere to go.
- **Empty:** the short slab with a punchy message ("No matches yet") and the chevrons pointing at the one action.
- **Error:** the slab stays; the error and retry sit under it on the page in plain words. The slab never turns `danger`.

## Motion

| Level | Angled slab | Stripes | Chevron run |
|---|---|---|---|
| `lively` | slides in from the start edge by `space.12`, `spring.snappy` | slide in after it, one after another, a quarter of `duration.fast` apart | each chevron steps in after the one before |
| `default` | slides in by `space.6` and fades in, `duration.base`, `easing.enter`, once | arrive with the slab | appear together |
| `calm` | appears at once | appear at once | appear at once |
| `none` | appears at once | appear at once | appear at once |

The stripes and chevrons follow [stagger](../motion/stagger.md). Bold's motion is fast and punchy, so it uses `duration.base` and `spring.snappy`, never `duration.slow`; everything plays once and nothing loops.

## Accessibility

- The slab's shape, stripes and chevrons are decoration and hidden from screen readers; a change's direction is also said in words ("up 12% this week").
- `on-brand` on `brand` for every word on the slab; the stripes sit behind the headline's end, faint enough not to lower its contrast, and never behind body text.
- Tap targets on the slab are at least 44 pt / 48 dp; the chevrons are not a separate button, the action beside them is.
- In right to left, the cut, the stripes and the slide all mirror, and the chevrons point the other way.
- Under reduced motion, everything appears at its end state (level `none`).

## Stacks

### react-web

Inline SVG behind the hero (`preserveAspectRatio="none"`). With Motion for React, slide the slab in once and wrap the app once in `<MotionConfig reducedMotion="user">`; the `motion` file's durations are already in seconds. Without Motion, use the plain-web CSS.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

const stripes = ["M276 40 H400 V60 H256 Z", "M300 76 H400 V96 H280 Z", "M324 112 H400 V132 H304 Z"];

export function AngledSlab() {
  return (
    <motion.svg className="angled-slab" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true"
      initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: duration.base, ease: easing.enter }}>
      <path d="M0 0 H400 V200 L0 240 Z" fill="var(--motif-color-brand)" />
      {stripes.map((d) => <path key={d} d={d} fill="var(--motif-color-on-brand)" fillOpacity="0.15" />)}
    </motion.svg>
  );
}

export const Chevrons = () => (
  <svg width="40" height="16" viewBox="0 0 40 16" aria-hidden="true" className="chevrons">
    {[0, 12, 24].map((x) => <path key={x} d={`M${x + 2} 2 L${x + 9} 8 L${x + 2} 14`} fill="none"
      stroke="currentColor" strokeWidth="4" strokeLinecap="square" />)}
  </svg>
);
```

Set `color: var(--motif-color-brand)` on the chevrons' parent (or `on-brand` on the slab).

### plain-web

The same SVGs; the slab's slide and the chevrons' steps sit inside `prefers-reduced-motion: no-preference`.

```css
.angled-slab { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; z-index: -1; }
[dir="rtl"] .angled-slab, [dir="rtl"] .chevrons { transform: scaleX(-1); }
@media (prefers-reduced-motion: no-preference) {
  .angled-slab { animation: slab-in var(--motif-duration-base) var(--motif-easing-enter) both; }
  .chevrons path { animation: chevron-in var(--motif-duration-fast) var(--motif-easing-enter) both; }
  .chevrons path:nth-child(2) { animation-delay: calc(var(--motif-duration-fast) / 4); }
  .chevrons path:nth-child(3) { animation-delay: calc(var(--motif-duration-fast) / 2); }
}
@keyframes slab-in { from { opacity: 0; translate: calc(-1 * var(--motif-space-6)) 0; } }
@keyframes chevron-in { from { opacity: 0; } }
```

`translate` (not `transform`) for the slide keeps the right-to-left `scaleX(-1)` intact.

### vue

The slab as a component with the SVG above, entered with `<Transition appear>`; its classes sit inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <Transition appear name="slab">
    <svg class="angled-slab" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 0 H400 V200 L0 240 Z" fill="var(--motif-color-brand)" />
      <path v-for="d in stripes" :key="d" :d="d" fill="var(--motif-color-on-brand)" fill-opacity="0.15" />
    </svg>
  </Transition>
</template>
```

With Motion for Vue in the project, `motion.svg` with `:transition="{ duration: duration.base, ease: easing.enter }"` (already in seconds).

### svelte

Svelte's `fly` on the slab (`x` from the start edge) and on each chevron with a growing delay; duration zero when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fly, fade } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  const off = prefersReducedMotion.current;
</script>

<svg class="angled-slab" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true"
  in:fly={{ x: -24, duration: off ? 0 : duration.base, easing: easing.enter }}>
  <path d="M0 0 H400 V200 L0 240 Z" fill="var(--motif-color-brand)" />
</svg>
<svg class="chevrons" width="40" height="16" aria-hidden="true">
  {#each [0, 12, 24] as x, i}
    <path d="M{x + 2} 2 L{x + 9} 8 L{x + 2} 14" fill="none" stroke="currentColor" stroke-width="4"
      in:fade={{ duration: off ? 0 : duration.fast, delay: off ? 0 : (i * duration.fast) / 4 }} />
  {/each}
</svg>
```

### angular

A standalone component with the SVG in its template and the plain-web CSS in `styles`, inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-angled-slab",
  template: `
    <svg class="angled-slab" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 0 H400 V200 L0 240 Z" fill="var(--motif-color-brand)" />
      @for (d of stripes; track d) { <path [attr.d]="d" fill="var(--motif-color-on-brand)" fill-opacity="0.15" /> }
    </svg>
    <ng-content />`,
})
export class AngledSlab { stripes = ["M276 40 H400 V60 H256 Z", "M300 76 H400 V96 H280 Z", "M324 112 H400 V132 H304 Z"]; }
```

### flutter

A `ClipPath` with a `CustomClipper` for the cut, filled with `colors.brand`, and a `CustomPainter` for the stripes; a `TweenAnimationBuilder` slides it in with `MotifMotion.duration(context, …)`, zero under reduced motion. Wrap the drawing in `ExcludeSemantics`.

```dart
class SlabClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size s) => Path()..lineTo(s.width, 0)..lineTo(s.width, s.height - MotifSpace.s10)..lineTo(0, s.height)..close();
  @override
  bool shouldReclip(covariant CustomClipper<Path> old) => false;
}

final rtl = Directionality.of(context) == TextDirection.rtl;
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.base),
  curve: MotifCurves.enter,
  builder: (context, t, child) => Opacity(
    opacity: t,
    child: Transform.translate(offset: Offset((rtl ? 1 : -1) * MotifSpace.s6 * (1 - t), 0), child: child),
  ),
  child: ExcludeSemantics(child: Transform.flip(flipX: rtl, child: ClipPath(clipper: SlabClipper(),
    child: CustomPaint(painter: StripesPainter(MotifColors.of(context)), child: ColoredBox(color: MotifColors.of(context).brand))))),
)
```

The stripes paint in `colors.onBrand.withValues(alpha: 0.15)`; the chevrons are a painter of three stroked paths with `StrokeCap.square`.

### compose

A `GenericShape` for the cut as the band's background; an `Animatable` slides it, with `MotifSprings.snappy()` at `lively`. Read `MotifMotion.reduced()` into a `val` and snap. `Modifier.clearAndSetSemantics {}` hides the drawing layer.

```kotlin
val SlabShape = GenericShape { size, dir ->
    val drop = size.height * 0.16f
    if (dir == LayoutDirection.Ltr) { lineTo(size.width, 0f); lineTo(size.width, size.height - drop); lineTo(0f, size.height) }
    else { lineTo(size.width, 0f); lineTo(size.width, size.height); lineTo(0f, size.height - drop) }
    close()
}

val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val t = remember { Animatable(if (reduced) 1f else 0f) }
LaunchedEffect(Unit) { if (!reduced) t.animateTo(1f, tween(MotifDurations.base, easing = MotifEasing.enter)) }
Box(Modifier.fillMaxWidth().graphicsLayer { alpha = t.value; translationX = -MotifSpace.s6.toPx() * (1 - t.value) }
    .background(colors.brand, SlabShape)) {
    Canvas(Modifier.matchParentSize().clearAndSetSemantics {}) { drawStripes(colors.onBrand.copy(alpha = 0.15f)) }
    heroContent()
}
```

The chevrons suit an `ImageVector` with `autoMirror = true`, so they flip in right to left by themselves.

### react-native

`react-native-svg` (ask before adding it) for the slab and chevrons, the slab absolutely placed behind the hero; Reanimated slides it in, and when `useReducedMotion()` is true it starts at its end state. Hide it with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const t = useSharedValue(reduced ? 1 : 0);
useEffect(() => { if (!reduced) t.value = withTiming(1, { duration: duration.base, easing: easing.enter }); }, []);
const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateX: -space.s6 * (1 - t.value) }] }));

<Animated.View style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Svg viewBox="0 0 400 240" width="100%" height="100%" preserveAspectRatio="none">
    <Path d="M0 0 H400 V200 L0 240 Z" fill={colors.brand} />
    {stripes.map((d) => <Path key={d} d={d} fill={colors.onBrand} fillOpacity={0.15} />)}
  </Svg>
</Animated.View>
```

For right to left, flip the layer with `transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }]` and slide from the other side.

### swiftui

A `Slab` `Shape` behind the hero, slid in on appear with `MotifSprings.snappy` at `lively`; under `accessibilityReduceMotion`, set the value without animation.

```swift
struct Slab: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: .zero); p.addLine(to: CGPoint(x: r.maxX, y: 0))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - MotifSpace.s10)); p.addLine(to: CGPoint(x: 0, y: r.maxY))
        p.closeSubpath(); return p
    }
}

@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown = false

heroContent
    .background {
        Slab().fill(colors.brand).overlay { Stripes().fill(colors.onBrand.opacity(0.15)) }
            .flipsForRightToLeftLayoutDirection(true)
            .offset(x: shown ? 0 : -MotifSpace.s6).opacity(shown ? 1 : 0)
            .ignoresSafeArea(edges: .top).accessibilityHidden(true)
    }
    .onAppear { if reduceMotion { shown = true } else { withAnimation(MotifMotion.animation(MotifCurves.enter, reduceMotion: reduceMotion)) { shown = true } } }
```

The chevrons are a `Path` of three strokes with `StrokeStyle(lineWidth: 4, lineCap: .square)`, also `flipsForRightToLeftLayoutDirection(true)`.
