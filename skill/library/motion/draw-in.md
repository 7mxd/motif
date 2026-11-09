# Draw-in

## Purpose

A chart arrives by drawing itself: a trend line traces from start to end, a progress ring fills to its value, a segmented bar's parts grow from the start edge one after another. It tells people "this is live data, just measured" and leads the eye along the line in reading order, so the key figure is read before the detail.

## Fits

Every brief. It is the default motion for every chart in the library's charts group and for the trend line on the key-figure card. Calm business briefs (money, admin) keep it short and plain; playful and energetic ones may add a small settle at the end.

## Loudness

default. One draw per chart, on first show only; never repeated on scroll or on every data refresh.

## Data

The chart's own values. The animation only drives a progress value from 0 to 1: the line's drawn length, the ring's filled angle, or each segment's width. It never animates the numbers themselves (that is [count-up](count-up.md)).

## States

- **Loading:** no draw: show the chart's skeleton (a flat line or an empty ring in `border`), as the stack's motion guide shows for skeletons.
- **Empty:** no draw: show the empty state's message ("No payments yet") in place of the chart.
- **Error:** no draw: show the error and a retry. When the data arrives after a retry, the chart draws in then.
- **Update:** when values change after the first show, move from the old shape to the new one with `duration.base`, without starting from zero again.

## Motion

| Level | Draw-in |
|---|---|
| `lively` | `duration.slow`, `easing.enter`, then a small settle (`spring.smooth`) on the line's end dot or the ring's cap |
| `default` | `duration.slow`, `easing.enter`; a segmented bar's parts follow each other by a quarter of `duration.fast` |
| `calm` | `duration.base`, `easing.enter`, all parts together (no stagger, no settle) |
| `none` | the chart appears drawn, at once |

Start when the chart is on screen (on load for a chart above the fold; when it scrolls into view otherwise), once.

## Accessibility

- The chart's text alternative (its key number in words, such as "Outstanding $18,420, up 6% this month") is there from the start; the draw is decoration on top of it.
- Under reduced motion the chart appears already drawn (level `none`).
- Animate only the stroke's drawn length, a transform or opacity: never the layout around the chart.

## Stacks

### react-web

Motion for React draws an SVG path with `pathLength` (the generated `@/design/motion` gives durations in seconds, Motion's unit); wrap the app once in `<MotionConfig reducedMotion="user">`. `<MotionConfig reducedMotion="user">` stops only transforms, so also read `useReducedMotion()` and pass `initial={false}` when it is true; opacity and `pathLength` would still animate otherwise.

```tsx
import { motion, useReducedMotion } from "motion/react";
import { duration, easing } from "@/design/motion";

const reduced = useReducedMotion();

<motion.path
  d={d}
  stroke="var(--motif-color-brand)"
  fill="none"
  initial={reduced ? false : { pathLength: 0 }}
  whileInView={{ pathLength: 1 }}
  viewport={{ once: true }}
  transition={{ duration: duration.slow, ease: easing.enter }}
/>
```

A ring is the same with a `circle`; a segment uses `initial={{ scaleX: 0 }}` with `style={{ originX: 0 }}` (flip to 1 in right-to-left layouts).

### plain-web

Draw the path with `stroke-dasharray` and `stroke-dashoffset`, inside `prefers-reduced-motion: no-preference` so reduced motion shows it drawn.

```css
@media (prefers-reduced-motion: no-preference) {
  .chart-line {
    stroke-dasharray: var(--len);
    stroke-dashoffset: var(--len);
    animation: draw var(--motif-duration-slow) var(--motif-easing-enter) forwards;
  }
}
@keyframes draw { to { stroke-dashoffset: 0; } }
```

Set `--len` from `path.getTotalLength()` in a script, and start the animation when the chart scrolls into view (an `IntersectionObserver` adding a class).

### vue

Motion for Vue's `motion.path` with `pathLength`, as on React; or a CSS `@keyframes` like plain web inside `prefers-reduced-motion: no-preference`.

```vue
<motion.path :d="d" fill="none" :initial="{ pathLength: 0 }" :while-in-view="{ pathLength: 1 }"
  :in-view-options="{ once: true }" :transition="{ duration: duration.slow, ease: easing.enter }" />
```

Wrap the app in `<MotionConfig reduced-motion="user">`, or check `useReducedMotion()` and skip the `initial`.

### svelte

Svelte's own `draw` transition on the path; skip it when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { draw } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration } from "$lib/design/motion";
</script>

<path {d} fill="none" in:draw={{ duration: prefersReducedMotion.current ? 0 : duration.slow }} />
```

For a segment, a `Tween` from 0 to the segment's width; for a ring, a `Tween` of the dash offset.

### angular

Motion's `animate` on the path element after it renders; the CSS fallback sits inside `prefers-reduced-motion: no-preference`.

```ts
import { animate } from "motion";
import { duration, easing } from "../design/motion";

afterNextRender(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  animate(this.path.nativeElement, { pathLength: [0, 1] }, { duration: duration.slow, ease: easing.enter });
});
```

### flutter

A `CustomPainter` that draws the path up to a progress value, driven by `TweenAnimationBuilder`; `MotifMotion.duration(context, …)` is zero under reduced motion.

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, _) => CustomPaint(painter: TrendPainter(points, progress: t)),
)
```

In the painter, take `path.computeMetrics()` and draw `metric.extractPath(0, metric.length * progress)`.

### compose

An `Animatable` from 0 to 1 driving a `Canvas` path; check `MotifMotion.reduced()` and snap to 1.

```kotlin
val progress = remember { Animatable(0f) }
val reduced = MotifMotion.reduced()
LaunchedEffect(Unit) {
    if (reduced) progress.snapTo(1f)
    else progress.animateTo(1f, tween(MotifDurations.slow, easing = MotifEasing.enter))
}
Canvas(Modifier.fillMaxWidth().height(48.dp)) {
    val measure = PathMeasure().apply { setPath(path, false) }
    val partial = Path().also { measure.getSegment(0f, measure.length * progress.value, it) }
    drawPath(partial, color = brand, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
}
```

### react-native

Reanimated drives `strokeDashoffset` on a `react-native-svg` path (ask before adding it); when `useReducedMotion()` is true, set the value without `withTiming`.

```tsx
const reduced = useReducedMotion();
const progress = useSharedValue(reduced ? 1 : 0);
useEffect(() => {
  if (!reduced) progress.value = withTiming(1, { duration: duration.slow, easing: easing.enter });
}, []);
const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));

<AnimatedPath d={d} strokeDasharray={length} animatedProps={props} fill="none" />
```

### swiftui

`.trim(from:to:)` on the chart's `Shape`, animated on appear through `MotifMotion.animation(_:reduceMotion:)`, which gives no animation when `accessibilityReduceMotion` is on.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors
@State private var progress: CGFloat = 0

TrendShape(points: points)
    .trim(from: 0, to: progress)
    .stroke(colors.brand, style: StrokeStyle(lineWidth: 2, lineCap: .round))
    .onAppear {
        withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { progress = 1 }
    }
```

Swift Charts' `LineMark` can draw in the same way with a `.mask` trimmed by `progress`.
