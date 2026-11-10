# Dark tech accent

## Purpose

Three precise, drafted accents for the Dark tech style, taken from plotting paper and instrument displays rather than from science fiction:

- **The plot grid:** a fine square grid of 1 px lines in `border`, with a small `+` mark in `text-secondary` at every fourth crossing, inside a bounded `radius.md` panel behind the landing hero's product preview or the empty state's message. It says "measured, exact" and gives the preview a ground to sit on.
- **Bracket corners:** four short square brackets in `brand` (or `on-brand` on the key-figure card) at the corners of the one figure that matters, like a viewfinder locked on it.
- **The trace:** a thin stepped line (straight, a 45° step, straight) ending in a small square node in `brand`, joining the numbered steps of "How it works" (1 → 2 → 3) or leading from a section label to its content.

**Stay out of the "C look".** Every stroke and fill is flat and solid: no blur, no halo, no light bloom around lines, no neon colours outside the theme's roles, no gradient backdrop, no fading mask on the grid. The page's `background` stays one flat colour; the brand appears in thin lines and one small node, never as a wash ([anti-patterns](../../knowledge/anti-patterns.md)).

## Signature

**A thin glow edge.** On by default. A 1 px edge in `focus` (or `accent`) at about 40% with a soft spread of a few points, used the same way across the app:

- **Buttons:** the main button carries the edge; hover or press brightens it a step.
- **Cards:** the key cards on first-impression screens carry the edge; on the sign-in panel one card may be glass (a translucent `surface-raised` over the panel with a background blur). Working-screen cards stay flat with a plain `border`.
- **Badges:** status badges take the edge in their own status colour, never a glowing chart.

Under reduced motion nothing pulses: the edge is still.

## Fits

The Dark tech starting style and briefs that say technical, sleek, focused or precise: developer tools, AI products, analytics, crypto.

| Where | Accent |
|---|---|
| [Landing hero](../screens/landing-hero.md) | the plot grid behind the product preview, the preview's key figure in bracket corners |
| [Welcome](../screens/welcome.md) | the trace joining the two or three rows of what the app does, each row's icon tile at a node |
| [Empty state](../screens/empty-state.md) | a small plot grid with an empty axis and the message on it ("No runs logged yet · Connect a source") |
| [Key-figure card](../cards/key-figure-card.md)'s corners | bracket corners in `on-brand` at about 50% opacity around the figure |

## Loudness

default. Thin lines and one colour accent, on a dark page that is already strong. Turning it down means the bracket corners alone; turning it up means the trace on the landing page as well. It never gains colour fills, more than one accent colour, or lines brighter than `brand`.

## Data

- **Plot grid:** none of its own; it frames the preview or the empty chart. With nothing on it, it goes. In an empty state it may carry the chart's real axis labels (this week's days) so the empty chart shows what will appear.
- **Bracket corners:** frame exactly one figure (the key figure, a model's score); never several on a screen.
- **Trace:** joins real, ordered steps; its nodes line up with the steps' numbers.

Roles: `border` for the grid, `text-secondary` for its `+` marks, `brand` for the brackets, trace and node, `on-brand` at about 50% opacity for brackets on the key-figure card. Sizes: grid pitch `space.4`; brackets' arms `space.3` long, 2 px; the trace 1 px with a 6 px square node. Corners sharp, as the style's are (`radius.sm` and `radius.md`).

## States

- **Loading:** the grid shows at once, still, with the preview's skeleton on it; the brackets wait for the figure.
- **Empty:** the empty state's small grid with its axis labels, the message and one action.
- **Error:** the grid stays; the error code in words and a retry sit on it. Brackets and trace never turn `danger`; a node can show `danger` only when its step itself failed ("Step 2 · Connection failed").

## Motion

| Level | Plot grid | Bracket corners | Trace |
|---|---|---|---|
| `lively` | fades in once, `duration.base`, `easing.enter` | draw in from the corners toward the figure, `spring.snappy` | draws from the first node to the last, `duration.slow`, then each node appears |
| `default` | fades in once, `duration.base` | close in from `space.2` outside to their place, `duration.fast`, `easing.enter` | draws in once, `duration.slow`, `easing.enter` |
| `calm` | appears at once | appear in place | appears drawn |
| `none` | appears at once | appear in place | appears drawn |

The trace is [draw-in](../motion/draw-in.md); its nodes at `lively` follow [stagger](../motion/stagger.md). Dark tech's motion is crisp: short, exact and once. No scanning line, no flicker, no pulsing node.

## Accessibility

- All three are decoration and hidden from screen readers; the figure, the steps and the message carry the meaning.
- The grid's lines are `border` on `background`, deliberately faint; text on the grid uses `text-primary` and keeps its contrast because no line runs under a label's box (the label sits on a `surface` patch with `radius.sm`).
- Bracket corners in `brand` must still read on `background` (3:1 for a graphic); on the key-figure card use `on-brand`.
- In right to left, the trace runs from the right; the grid and brackets are symmetrical.
- Under reduced motion, everything appears at its end state (level `none`).

## Stacks

### react-web

Inline SVG: the grid as a `<pattern>`, the brackets as four `path`s over the figure. With Motion for React, fade the grid and draw the trace with `pathLength`; wrap the app once in `<MotionConfig reducedMotion="user">`. `<MotionConfig reducedMotion="user">` stops only transforms, so also read `useReducedMotion()` and pass `initial={false}` when it is true; opacity and `pathLength` would still animate otherwise. Durations from the `motion` file are already in seconds.

```tsx
import { motion, useReducedMotion } from "motion/react";
import { duration, easing } from "@/design/motion";

export function PlotGrid({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className="plot-panel">
      <motion.svg className="plot-grid" aria-hidden="true" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: duration.base, ease: easing.enter }}>
        <defs>
          <pattern id="plot" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0 H0 V16" fill="none" stroke="var(--motif-color-border)" strokeWidth="1" />
          </pattern>
          <pattern id="plot-marks" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M-3 0 H3 M0 -3 V3" stroke="var(--motif-color-text-secondary)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#plot)" />
        <rect width="100%" height="100%" fill="url(#plot-marks)" />
      </motion.svg>
      {children}
    </div>
  );
}
```

Give each pattern a unique `id` (`useId()`) when the grid appears twice on a page. The trace is a `motion.path` with `initial={reduced ? false : { pathLength: 0 }}` and `whileInView={{ pathLength: 1 }}`.

### plain-web

The same SVG; the fades and the trace's draw sit inside `prefers-reduced-motion: no-preference`. Brackets can be pure CSS borders.

```css
.plot-panel { position: relative; border-radius: var(--motif-radius-md); overflow: hidden; background: var(--motif-color-background); }
.plot-grid { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
.bracket { position: absolute; inline-size: var(--motif-space-3); block-size: var(--motif-space-3); border: 0 solid var(--motif-color-brand); }
.bracket.top-start { inset-block-start: 0; inset-inline-start: 0; border-block-start-width: 2px; border-inline-start-width: 2px; }
@media (prefers-reduced-motion: no-preference) {
  .plot-grid { animation: grid-in var(--motif-duration-base) var(--motif-easing-enter) both; }
  .trace { stroke-dasharray: var(--len); stroke-dashoffset: var(--len);
    animation: trace-draw var(--motif-duration-slow) var(--motif-easing-enter) forwards; }
}
@keyframes grid-in { from { opacity: 0; } }
@keyframes trace-draw { to { stroke-dashoffset: 0; } }
```

Set `--len` from `path.getTotalLength()` and start the trace when it scrolls into view.

### vue

The grid as a component with the SVG above and the CSS in `<style scoped>` inside `prefers-reduced-motion: no-preference`; `useId()` keeps the pattern ids unique.

```vue
<script setup lang="ts">
import { useId } from "vue";
const id = useId();
</script>

<template>
  <div class="plot-panel">
    <svg class="plot-grid" aria-hidden="true">
      <defs><pattern :id="id" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M16 0 H0 V16" fill="none" stroke="var(--motif-color-border)" /></pattern></defs>
      <rect width="100%" height="100%" :fill="`url(#${id})`" />
    </svg>
    <slot />
  </div>
</template>
```

### svelte

Svelte's `fade` on the grid and `draw` on the trace; both get a zero duration when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fade, draw } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  const off = prefersReducedMotion.current;
  let { d } = $props();
</script>

<svg class="plot-grid" aria-hidden="true" in:fade={{ duration: off ? 0 : duration.base }}>
  <rect width="100%" height="100%" fill="url(#plot)" />
</svg>
<svg class="trace-layer" aria-hidden="true">
  <path {d} class="trace" fill="none" stroke="var(--motif-color-brand)" stroke-width="1"
    in:draw={{ duration: off ? 0 : duration.slow, easing: easing.enter }} />
</svg>
```

### angular

A standalone component with the grid SVG in its template and the plain-web CSS in `styles`, inside `prefers-reduced-motion: no-preference`; the brackets are four `span.bracket`s.

```ts
@Component({
  selector: "app-bracketed",
  template: `
    <span class="bracket top-start" aria-hidden="true"></span>
    <span class="bracket top-end" aria-hidden="true"></span>
    <span class="bracket bottom-start" aria-hidden="true"></span>
    <span class="bracket bottom-end" aria-hidden="true"></span>
    <ng-content />`,
  host: { style: "position: relative; display: inline-block; padding: var(--motif-space-2)" },
})
export class Bracketed {}
```

### flutter

A `CustomPainter` draws the grid lines and `+` marks in a loop; a second painter draws the trace up to a progress value with `computeMetrics`/`extractPath`. `TweenAnimationBuilder` drives both, with `MotifMotion.duration(context, …)` zero under reduced motion. Wrap them in `ExcludeSemantics`.

```dart
class PlotGridPainter extends CustomPainter {
  PlotGridPainter(this.colors);
  final MotifColors colors;
  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()..color = colors.border..strokeWidth = 1;
    for (var x = 0.0; x <= size.width; x += MotifSpace.s4) canvas.drawLine(Offset(x, 0), Offset(x, size.height), line);
    for (var y = 0.0; y <= size.height; y += MotifSpace.s4) canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
    // a `+` in colors.textSecondary at every fourth crossing
  }
  @override
  bool shouldRepaint(PlotGridPainter old) => old.colors != colors;
}

TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.base),
  curve: MotifCurves.enter,
  builder: (context, t, child) => Opacity(opacity: t, child: child),
  child: ExcludeSemantics(child: ClipRRect(borderRadius: BorderRadius.circular(MotifRadius.md),
    child: CustomPaint(painter: PlotGridPainter(MotifColors.of(context)), child: preview))),
)
```

### compose

A `Canvas` behind the preview for the grid, and an `Animatable` for its fade and the trace's draw; read `MotifMotion.reduced()` into a `val` and snap. `Modifier.clearAndSetSemantics {}` hides the drawing.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val t = remember { Animatable(if (reduced) 1f else 0f) }
LaunchedEffect(Unit) { if (!reduced) t.animateTo(1f, tween(MotifDurations.base, easing = MotifEasing.enter)) }
Box(Modifier.clip(RoundedCornerShape(MotifRadius.md))) {
    Canvas(Modifier.matchParentSize().graphicsLayer { alpha = t.value }.clearAndSetSemantics {}) {
        val step = MotifSpace.s4.toPx()
        var x = 0f; while (x <= size.width) { drawLine(colors.border, Offset(x, 0f), Offset(x, size.height), 1f); x += step }
        var y = 0f; while (y <= size.height) { drawLine(colors.border, Offset(0f, y), Offset(size.width, y), 1f); y += step }
    }
    preview()
}
```

The trace draws with `PathMeasure.getSegment` up to its progress, as in [draw-in](../motion/draw-in.md); the node is a `drawRect` in `colors.brand`.

### react-native

`react-native-svg` (ask before adding it): the grid as a `Pattern` filling a `Rect`, the trace a `Path` with Reanimated driving `strokeDashoffset`. When `useReducedMotion()` is true, set the values without `withTiming`. Hide it with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const t = useSharedValue(reduced ? 1 : 0);
useEffect(() => { if (!reduced) t.value = withTiming(1, { duration: duration.slow, easing: easing.enter }); }, []);
const trace = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - t.value) }));

<Svg style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Defs>
    <Pattern id="plot" width={space.s4} height={space.s4} patternUnits="userSpaceOnUse">
      <Path d={`M${space.s4} 0 H0 V${space.s4}`} fill="none" stroke={colors.border} strokeWidth={1} />
    </Pattern>
  </Defs>
  <Rect width="100%" height="100%" fill="url(#plot)" />
  <AnimatedPath d={d} stroke={colors.brand} strokeWidth={1} fill="none" strokeDasharray={length} animatedProps={trace} />
</Svg>
```

### swiftui

A `Canvas` for the grid behind the preview, `BracketCorners` as a `Shape` overlay, and the trace's `Shape` trimmed by `progress`; under `accessibilityReduceMotion`, set the values without animation.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var progress: CGFloat = 0

preview
    .background {
        Canvas { ctx, size in
            var grid = Path()
            for x in stride(from: 0, through: size.width, by: MotifSpace.s4) { grid.move(to: CGPoint(x: x, y: 0)); grid.addLine(to: CGPoint(x: x, y: size.height)) }
            for y in stride(from: 0, through: size.height, by: MotifSpace.s4) { grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: size.width, y: y)) }
            ctx.stroke(grid, with: .color(colors.border), lineWidth: 1)
        }
        .opacity(progress)
        .clipShape(RoundedRectangle(cornerRadius: MotifRadius.md))
        .accessibilityHidden(true)
    }
    .onAppear { if reduceMotion { progress = 1 } else { withAnimation(MotifMotion.animation(MotifCurves.enter, reduceMotion: reduceMotion)) { progress = 1 } } }
```

`BracketCorners` draws four L-shaped arms in its rect; stroke it with `colors.brand` at 2 points and mark it `.accessibilityHidden(true)`.
