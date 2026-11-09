# Editorial accent

## Purpose

Two printed-page accents for the Editorial style, taken from how books and magazines mark their structure rather than from screen decoration:

- **The section rule:** two hairlines with a small `brand` lozenge (a four-pointed diamond) between them, centred on the column. It marks a real break: between the landing hero and its proof, above a pull quote, and at the end of a long read, where it says "this is the end" (the end mark).
- **Plate corners:** two thin L-shaped marks, like a printer's crop marks, at the top-start and bottom-end corners of the key-figure card or the landing hero's product preview. They frame the figure the way a book frames a plate, without a border or a shadow.

The headline's one accented word (italic, in `brand`) is the style's third accent and lives in the type, not here ([character](../../knowledge/character.md)).

## Fits

The Editorial starting style and briefs that say refined, literary, timeless or premium: publishing, portfolios, long reads, premium brands.

| Where | Accent |
|---|---|
| [Landing hero](../screens/landing-hero.md) | plate corners around the product preview; the section rule under the hero, before the proof |
| [Welcome](../screens/welcome.md) | the section rule between the headline and the rows of what the app does |
| [Empty state](../screens/empty-state.md) | a short section rule (half width) above the message, in place of a drawing for the quietest briefs |
| [Key-figure card](../cards/key-figure-card.md)'s corners | plate corners in `on-brand` at about 40% opacity |
| End of an article | the section rule as the end mark, after the last paragraph |

## Loudness

calm. Hairlines in `border` and one small mark of `brand`. Turning it up means a slightly larger lozenge and the rule at full column width; it never becomes an ornament band or a filled panel. One section rule per screen on a phone; on a long page, one between each major part at most.

## Data

None of its own. The section rule stands for a real division in the content (a new section, the end of the text); with no division there, it goes. Plate corners frame one thing that matters (the key figure, the preview); they never frame a plain paragraph.

Roles: `border` for the hairlines, `brand` for the lozenge; on the key-figure card, `on-brand` at about 40% opacity. Sizes: hairlines 1 px; the lozenge about 10 px tall; plate corner arms `space.3` long, set `space.2` inside the card's edge. Corners stay square (`radius.sm` at most), as the style's are.

## States

- **Loading:** the rule and the plate corners show at once, still; a skeleton sits inside the corners.
- **Empty:** the empty state's short rule sits above its message ("No stories saved yet"), with the action under it.
- **Error:** the accents stay as they are; the message and retry take the space. Never colour the lozenge `danger`.

## Motion

| Level | Section rule | Plate corners |
|---|---|---|
| `lively` | the lozenge fades in, then both hairlines draw outward from it, `duration.slow`, `easing.enter` | each arm draws from the corner outward, `duration.base` |
| `default` | the hairlines draw outward together, `duration.slow`, `easing.enter`, once when the rule scrolls into view | appear at once |
| `calm` | appears drawn | appear at once |
| `none` | appears drawn | appear at once |

The hairlines' drawing is [draw-in](../motion/draw-in.md), played once; nothing loops. Editorial asks for restrained motion, so most apps run it at `calm`.

## Accessibility

- Both accents are decoration and hidden from screen readers. Where the rule marks a section break, the next section's heading carries the structure; the end mark is followed by real content (related reads, a footer), not left as the page's only signal.
- The lozenge in `brand` sits on `background` or `surface`; the plate corners on the `brand` card use `on-brand`, so both keep the role pairs' contrast.
- In right to left, the plate corners swap sides (top-end and bottom-start); the rule is symmetrical.
- Under reduced motion, everything appears drawn (level `none`).

## Stacks

### react-web

Inline SVG. With Motion for React in the project, draw the hairlines with `pathLength` and wrap the app once in `<MotionConfig reducedMotion="user">`; otherwise use the plain-web CSS.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

const draw = {
  initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true },
  transition: { duration: duration.slow, ease: easing.enter },
};

export function SectionRule() {
  return (
    <svg className="section-rule" viewBox="0 0 240 12" width="240" height="12" aria-hidden="true">
      <motion.path d="M108 6 H0" stroke="var(--motif-color-border)" {...draw} />
      <path d="M120 1 L125 6 L120 11 L115 6 Z" fill="var(--motif-color-brand)" />
      <motion.path d="M132 6 H240" stroke="var(--motif-color-border)" {...draw} />
    </svg>
  );
}
```

Plate corners are two `path`s, `M0 12 V0 H12` and its mirror at the opposite corner, in an absolutely placed SVG over the card.

### plain-web

The same SVG; the hairlines draw with `stroke-dasharray` inside `prefers-reduced-motion: no-preference`, started by an `IntersectionObserver` adding `.is-in`.

```css
.section-rule { display: block; margin-inline: auto; max-width: 100%; }
.plate-corner { position: absolute; inline-size: var(--motif-space-3); block-size: var(--motif-space-3);
  border-color: color-mix(in srgb, var(--motif-color-on-brand) 40%, transparent); }
.plate-corner.start { inset-block-start: var(--motif-space-2); inset-inline-start: var(--motif-space-2);
  border-block-start: 1px solid; border-inline-start: 1px solid; }
@media (prefers-reduced-motion: no-preference) {
  .section-rule path[stroke] { stroke-dasharray: 108; stroke-dashoffset: 108; }
  .section-rule.is-in path[stroke] { animation: rule-draw var(--motif-duration-slow) var(--motif-easing-enter) forwards; }
}
@keyframes rule-draw { to { stroke-dashoffset: 0; } }
```

Logical properties (`inset-inline-start`, `border-inline-start`) move the corners in right to left by themselves.

### vue

The rule as a component with the SVG above; the CSS in `<style scoped>`, inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <svg ref="rule" class="section-rule" :class="{ 'is-in': seen }" viewBox="0 0 240 12" aria-hidden="true">
    <path d="M108 6 H0" stroke="var(--motif-color-border)" />
    <path d="M120 1 L125 6 L120 11 L115 6 Z" fill="var(--motif-color-brand)" />
    <path d="M132 6 H240" stroke="var(--motif-color-border)" />
  </svg>
</template>
```

Set `seen` once from an `IntersectionObserver` in `onMounted`.

### svelte

Svelte's `draw` transition on each hairline; skip it when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { draw } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  const t = { duration: prefersReducedMotion.current ? 0 : duration.slow, easing: easing.enter };
</script>

<svg class="section-rule" viewBox="0 0 240 12" aria-hidden="true">
  <path d="M108 6 H0" stroke="var(--motif-color-border)" in:draw={t} />
  <path d="M120 1 L125 6 L120 11 L115 6 Z" fill="var(--motif-color-brand)" />
  <path d="M132 6 H240" stroke="var(--motif-color-border)" in:draw={t} />
</svg>
```

### angular

A standalone component holding the SVG, with the plain-web CSS in its `styles` inside `prefers-reduced-motion: no-preference`; add `is-in` from an `IntersectionObserver` in `afterNextRender`.

```ts
@Component({
  selector: "app-section-rule",
  template: `<svg class="section-rule" [class.is-in]="seen()" viewBox="0 0 240 12" aria-hidden="true">
    <path d="M108 6 H0" stroke="var(--motif-color-border)" />
    <path d="M120 1 L125 6 L120 11 L115 6 Z" fill="var(--motif-color-brand)" />
    <path d="M132 6 H240" stroke="var(--motif-color-border)" /></svg>`,
})
export class SectionRule { seen = signal(false); }
```

### flutter

A `CustomPainter` drawing the lozenge and the two hairlines up to a progress value, driven by `TweenAnimationBuilder`; `MotifMotion.duration(context, …)` is zero under reduced motion. Wrap it in `ExcludeSemantics`.

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, _) => ExcludeSemantics(
    child: CustomPaint(size: const Size(240, 12), painter: SectionRulePainter(t, MotifColors.of(context))),
  ),
)

// In paint: final c = size.center(Offset.zero); final arm = (c.dx - 12) * t;
// canvas.drawLine(Offset(c.dx - 12, c.dy), Offset(c.dx - 12 - arm, c.dy), line);  // and its mirror
// canvas.drawPath(Path()..moveTo(c.dx, 1)..lineTo(c.dx + 5, c.dy)..lineTo(c.dx, 11)..lineTo(c.dx - 5, c.dy)..close(),
//     Paint()..color = colors.brand);
```

Plate corners are a second painter with two short `drawPath` strokes in `colors.onBrand.withValues(alpha: 0.4)`, placed in a `Stack` over the card; flip them with `Directionality.of(context)`.

### compose

A `Canvas` with an `Animatable` from 0 to 1; read `MotifMotion.reduced()` into a `val` and snap when it is true. `Modifier.clearAndSetSemantics {}` hides it.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val t = remember { Animatable(0f) }
LaunchedEffect(Unit) { if (reduced) t.snapTo(1f) else t.animateTo(1f, tween(MotifDurations.slow, easing = MotifEasing.enter)) }
Canvas(Modifier.width(240.dp).height(12.dp).clearAndSetSemantics {}) {
    val gap = 12.dp.toPx(); val arm = (center.x - gap) * t.value
    drawLine(colors.border, Offset(center.x - gap, center.y), Offset(center.x - gap - arm, center.y), 1.dp.toPx())
    drawLine(colors.border, Offset(center.x + gap, center.y), Offset(center.x + gap + arm, center.y), 1.dp.toPx())
    drawPath(Path().apply { moveTo(center.x, 1.dp.toPx()); lineTo(center.x + 5.dp.toPx(), center.y)
        lineTo(center.x, 11.dp.toPx()); lineTo(center.x - 5.dp.toPx(), center.y); close() }, colors.brand)
}
```

The lozenge alone can be an `ImageVector` (one `path` with `fill = SolidColor(colors.brand)`) when it repeats as a list bullet.

### react-native

`react-native-svg` (ask before adding it) with Reanimated driving `strokeDashoffset`; when `useReducedMotion()` is true, set the value without `withTiming`. Hide it with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const t = useSharedValue(reduced ? 1 : 0);
useEffect(() => { if (!reduced) t.value = withTiming(1, { duration: duration.slow, easing: easing.enter }); }, []);
const arm = useAnimatedProps(() => ({ strokeDashoffset: 108 * (1 - t.value) }));

<Svg viewBox="0 0 240 12" width={240} height={12} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <AnimatedPath d="M108 6 H0" stroke={colors.border} strokeDasharray={108} animatedProps={arm} />
  <Path d="M120 1 L125 6 L120 11 L115 6 Z" fill={colors.brand} />
  <AnimatedPath d="M132 6 H240" stroke={colors.border} strokeDasharray={108} animatedProps={arm} />
</Svg>
```

### swiftui

Two `Path` hairlines trimmed by `progress` and a lozenge `Shape`; under `accessibilityReduceMotion`, set the value without animation.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var progress: CGFloat = 0

HStack(spacing: MotifSpace.s2) {
    Hairline().trim(from: 1 - progress, to: 1).stroke(colors.border, lineWidth: 1)
    Lozenge().fill(colors.brand).frame(width: 10, height: 10)
    Hairline().trim(from: 0, to: progress).stroke(colors.border, lineWidth: 1)
}
.frame(height: 12)
.accessibilityHidden(true)
.onAppear {
    if reduceMotion { progress = 1 } else { withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { progress = 1 } }
}
```

`Lozenge` is a `Shape` whose `path(in:)` joins the four mid-points of its rect. Plate corners are a `Path` overlay on the card in `colors.onBrand.opacity(0.4)`.
