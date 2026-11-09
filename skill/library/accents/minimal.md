# Minimal accent

## Purpose

Two quiet accents for the Minimal style, so a calm, precise app still has a crafted touch on its first-impression and home screens without adding colour everywhere:

- **The measured rule:** a hairline across the content width with three small ticks at the quarters, and a short `brand` segment from the start edge that marks a real fraction: "Step 2 of 3" on onboarding, "Day 18 of 30" at the foot of the key-figure card, "1 of 3 set up" in an empty state. It reads like a ruler, not a progress bar, and it always says something.
- **The dot field:** a small square grid of dots (five by five) in `border`, set in one corner behind the landing hero's product preview or behind the empty state's drawing. It gives the preview a place to stand, like graph paper under a sketch.

One of the two per screen, never both.

## Fits

The Minimal starting style ([character](../../knowledge/character.md), the "calm, precise, quiet, professional" row) and any brief whose words are calm, precise or focused: productivity tools, dashboards, developer products.

| Where | Accent |
|---|---|
| [Welcome](../screens/welcome.md) and onboarding | the measured rule above the headline, marking the step |
| [Landing hero](../screens/landing-hero.md) | the dot field behind the corner of the product preview card |
| [Empty state](../screens/empty-state.md) | the dot field behind the drawing, or the measured rule under the message when setup has steps |
| [Key-figure card](../cards/key-figure-card.md)'s foot | the measured rule in `on-brand` at low opacity, its segment in `on-brand` |

## Loudness

calm. A hairline and one short stroke of colour; the dot field is in `border`, the quietest role on the page. Turning it up means the segment gets `radius.full` ends and the dot field takes `brand-soft`; it never becomes a filled band.

## Data

- **Measured rule:** a value from 0 to 1 and the label that says it ("Step 2 of 3", "Day 18 of 30"). The segment's length is that value times the rule's width. With no value there is no segment, only the hairline and ticks.
- **Dot field:** none of its own. It only frames what sits on it (the preview card, the drawing); without that it goes.

Roles: `border` for the hairline, ticks and dots; `brand` for the segment on a light page; on the key-figure card, `on-brand` at about 30% opacity for the hairline and full `on-brand` for the segment. Sizes: the rule is 1 px with a 2 px segment, ticks 4 px tall; dots 2 px across on a `space.4` pitch.

## States

- **Loading:** the hairline and ticks show at once with no segment; the segment draws in when the value arrives.
- **Empty:** the empty state keeps the dot field behind its drawing, or the rule at "0 of 3" (hairline only, label in words).
- **Error:** the rule keeps its last value, or shows only the hairline; it never turns `danger`. The error message and retry sit beside it.
- **Update:** a new value moves the segment's end with `duration.base`, without starting from zero.

## Motion

| Level | Measured rule | Dot field |
|---|---|---|
| `lively` | the segment grows from the start edge, `duration.slow`, `easing.enter` | fades in once, `duration.slow` |
| `default` | the same, once | fades in once, `duration.base` |
| `calm` | appears drawn, no motion | appears at once |
| `none` | appears drawn | appears at once |

The segment's growth is [draw-in](../motion/draw-in.md); the field's fade is a plain opacity change, played once on first show. Minimal is calm by nature, so `calm` is its usual level and the accents usually don't move at all.

## Accessibility

- The rule's label carries its meaning in words ("Step 2 of 3"), as text beside or under it; the drawing itself is hidden from screen readers.
- The dot field is decoration: hidden from screen readers on every stack.
- Contrast: the label is `text-secondary` on `surface` or `background`, or `on-brand` on the key-figure card; the dots never sit behind body text.
- Right to left, the segment grows from the right edge.
- Under reduced motion, both appear at their end state (level `none`).

## Stacks

### react-web

Inline SVG, sized by its container. With Motion for React already in the project, grow the segment with `scaleX`; wrap the app once in `<MotionConfig reducedMotion="user">`. Without it, use the plain-web CSS.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

export function MeasuredRule({ value, label }: { value: number; label: string }) {
  return (
    <div className="measured-rule">
      <svg width="100%" height="8" aria-hidden="true">
        <line x1="0" y1="4" x2="100%" y2="4" stroke="var(--motif-color-border)" />
        {["25%", "50%", "75%"].map((x) => <line key={x} x1={x} y1="2" x2={x} y2="6" stroke="var(--motif-color-border)" />)}
        <motion.rect y="3" height="2" width={`${value * 100}%`} fill="var(--motif-color-brand)"
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }}
          transition={{ duration: duration.slow, ease: easing.enter }} />
      </svg>
      <span className="caption">{label}</span>
    </div>
  );
}
```

The dot field is an SVG `<pattern>` of one 2 px circle in `var(--motif-color-border)`, filling a square `rect` behind the preview's corner.

### plain-web

The same SVG; the segment grows in CSS inside `prefers-reduced-motion: no-preference`, and the field is a `radial-gradient` dot repeat (dots, not a backdrop wash).

```css
.rule-segment { transform-origin: 0 50%; }
@media (prefers-reduced-motion: no-preference) {
  .rule-segment { animation: rule-grow var(--motif-duration-slow) var(--motif-easing-enter) both; }
  .dot-field { animation: field-in var(--motif-duration-base) var(--motif-easing-enter) both; }
}
@keyframes rule-grow { from { transform: scaleX(0); } }
@keyframes field-in { from { opacity: 0; } }
.dot-field {
  background: radial-gradient(circle, var(--motif-color-border) 1px, transparent 1.5px) 0 0 / var(--motif-space-4) var(--motif-space-4);
}
[dir="rtl"] .rule-segment { transform-origin: 100% 50%; }
```

Add `aria-hidden="true"` to the SVG and the field's element.

### vue

The SVG in a component; the CSS above in its `<style scoped>`, inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <div class="measured-rule">
    <svg width="100%" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="100%" y2="4" stroke="var(--motif-color-border)" />
      <rect class="rule-segment" y="3" height="2" :width="`${value * 100}%`" fill="var(--motif-color-brand)" />
    </svg>
    <span class="caption">{{ label }}</span>
  </div>
</template>
```

### svelte

A `Tween` of the segment's width from 0, set at once when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { Tween, prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  let { value, label } = $props();
  const width = new Tween(0, { duration: prefersReducedMotion.current ? 0 : duration.slow, easing: easing.enter });
  $effect(() => { width.target = value; });
</script>

<svg width="100%" height="8" aria-hidden="true">
  <line x1="0" y1="4" x2="100%" y2="4" stroke="var(--motif-color-border)" />
  <rect y="3" height="2" width="{width.current * 100}%" fill="var(--motif-color-brand)" />
</svg>
<span class="caption">{label}</span>
```

### angular

A standalone component with the SVG in its template and the plain-web CSS in `styles`, inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-measured-rule",
  template: `
    <svg width="100%" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="100%" y2="4" stroke="var(--motif-color-border)" />
      <rect class="rule-segment" y="3" height="2" [attr.width]="value() * 100 + '%'" fill="var(--motif-color-brand)" />
    </svg>
    <span class="caption">{{ label() }}</span>`,
})
export class MeasuredRule { value = input.required<number>(); label = input.required<string>(); }
```

### flutter

A `CustomPainter` for the hairline, ticks and segment, driven by `TweenAnimationBuilder`; `MotifMotion.duration(context, …)` is zero under reduced motion. Wrap it in `ExcludeSemantics` and put the label in a `Text` beside it.

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: value),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, _) => ExcludeSemantics(
    child: CustomPaint(size: const Size(double.infinity, 8), painter: RulePainter(t, MotifColors.of(context))),
  ),
)

// In RulePainter.paint: the hairline and ticks in colors.border (strokeWidth 1),
// then canvas.drawRect(Rect.fromLTWH(0, 3, size.width * t, 2), Paint()..color = colors.brand);
```

The dot field is a second painter drawing `canvas.drawCircle` on a `MotifSpace.s4` pitch in `colors.border`. For right to left, mirror with `Directionality.of(context)`.

### compose

A `Canvas` with an `Animatable`; read `MotifMotion.reduced()` into a `val` and snap when it is true. `Modifier.clearAndSetSemantics {}` hides it; the label is a `Text` beside it.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val t = remember { Animatable(0f) }
LaunchedEffect(value) {
    if (reduced) t.snapTo(value) else t.animateTo(value, tween(MotifDurations.slow, easing = MotifEasing.enter))
}
Canvas(Modifier.fillMaxWidth().height(8.dp).clearAndSetSemantics {}) {
    drawLine(colors.border, Offset(0f, center.y), Offset(size.width, center.y), strokeWidth = 1.dp.toPx())
    listOf(0.25f, 0.5f, 0.75f).forEach { drawLine(colors.border, Offset(size.width * it, 2.dp.toPx()), Offset(size.width * it, 6.dp.toPx())) }
    drawRect(colors.brand, topLeft = Offset(0f, 3.dp.toPx()), size = Size(size.width * t.value, 2.dp.toPx()))
}
```

In right to left, wrap the drawing in `scale(-1f, 1f)` when `LocalLayoutDirection.current == LayoutDirection.Rtl`.

### react-native

`react-native-svg` (ask before adding it) with a Reanimated width; when `useReducedMotion()` is true, set the value without `withTiming`. Hide it with `importantForAccessibility="no-hide-descendants"` and `accessibilityElementsHidden`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const t = useSharedValue(reduced ? value : 0);
useEffect(() => { t.value = reduced ? value : withTiming(value, { duration: duration.slow, easing: easing.enter }); }, [value]);
const props = useAnimatedProps(() => ({ width: `${t.value * 100}%` }));

<Svg width="100%" height={8} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Line x1="0" y1="4" x2="100%" y2="4" stroke={colors.border} />
  <AnimatedRect y={3} height={2} animatedProps={props} fill={colors.brand} />
</Svg>
```

### swiftui

A `Shape` for the hairline and ticks, a `Rectangle` for the segment scaled from the leading edge; under `accessibilityReduceMotion`, set the value without animation.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown: CGFloat = 0

ZStack(alignment: .leading) {
    RuleTicks().stroke(colors.border, lineWidth: 1)
    GeometryReader { g in Rectangle().fill(colors.brand).frame(width: g.size.width * value * shown, height: 2) }
        .frame(height: 2)
}
.frame(height: 8)
.accessibilityHidden(true)
.onAppear {
    if reduceMotion { shown = 1 } else { withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { shown = 1 } }
}
```

SwiftUI's leading edge follows right to left by itself. The dot field is a `Canvas` filling small circles in `colors.border`.
