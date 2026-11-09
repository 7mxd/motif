# Trend line

## Purpose

A sparkline: a small line of one figure over its recent periods, with no axes and no grid, ending in a dot at today's value. It answers "which way is it going?" beside the figure itself, so people read the number first and its direction a moment later. It is the line on the [key-figure card](../cards/key-figure-card.md) and the small chart in a [stat row](../cards/stat-row.md).

## Fits

Every brief, wherever one figure has a history: money owed over twelve weeks, runs per week, a plant's watering streak. Calm business briefs (invoicing, money, admin) use it on the home screen's deep `brand` card; louder briefs may add a soft area fill under the line. Not for comparing periods to each other (use [period bars](period-bars.md)) or for parts of a whole (use the [segmented bar](segmented-bar.md)).

## Loudness

calm. One thin line in `brand` (or `on-brand` on a `brand` card), a dot of the same colour at the last point, nothing else. At loud briefs only, a fill under the line in `brand-soft` (on a `brand` card, no fill). Never a second colour along the line, a gradient or a shadow under it.

## Data

- An ordered series of at least two values, oldest first; the last value is the one the figure beside it shows ("Outstanding $18,420").
- The x positions are even steps from start to end. The y range runs from the series' smallest to its largest value, with the stroke's width as padding top and bottom, so the line uses the full height. A flat series (all values equal) draws a level line through the middle.
- A missing value breaks the line there; it is never drawn as zero.
- Twelve to thirty points read well at this size. More than that, take each period's total or average first.
- In a right-to-left layout time runs from right to left: mirror the x axis, and the line draws in from the right.

## States

- **Loading:** a flat line across the middle in `border`, where the trend will be; no dot.
- **Empty:** fewer than two points: no line. Say when it will appear, in `text-secondary`: "Your trend shows after two weeks of invoices."
- **Error:** the figure keeps its place; the line's space says "Couldn't load the trend" with a Retry text button (at least 44 pt / 48 dp tall). When the data arrives, the line draws in then.
- **Update:** new data moves the line from its old shape to the new one with `duration.base`, without drawing from the start again.

## Motion

The line uses [draw-in](../motion/draw-in.md); the figure beside it uses [count-up](../motion/count-up.md), over the same duration so both land together.

| Level | Trend line |
|---|---|
| `lively` | the line draws over `duration.slow` with `easing.enter`; the end dot then settles in with `spring.smooth` |
| `default` | the line draws over `duration.slow` with `easing.enter`; the end dot fades in over `duration.fast` as the line reaches it |
| `calm` | the line draws over `duration.base`; the dot is there from the start |
| `none` | the line and dot appear drawn, at once |

Draw once, when the chart first shows, never again on scroll.

## Accessibility

- The chart is one element to a screen reader, with a label that gives its key number in words: "Outstanding $18,420, up 6% over 12 weeks." The line's own drawing is hidden from screen readers.
- The direction is also in text (the [stat change](stat-change.md) beside the figure), so the line is never the only place it is said.
- The line needs 3:1 against what it sits on: `brand` on `surface`, or `on-brand` on `brand`, as the theme's pairs promise. Stroke at least 2 px.
- The sparkline isn't a control. When the card opens a detail page, the whole card is the target (at least 44 pt / 48 dp), not the line.
- Under reduced motion it appears drawn (level `none`).

## Stacks

Each stack's component is called `TrendLine` and takes the `points` (oldest first) and the line's colour, which is `brand` by default and `on-brand` on a `brand` card, as the [key-figure card](../cards/key-figure-card.md) passes it. With a `label` it is its own element to a screen reader; without one it is hidden, because the card around it says the figure in words.

### react-web

Inline SVG. A small helper turns the points into a path; `pathLength={1}` lets the CSS draw it with a dash of 1, whatever its real length.

```tsx
export function linePath(points: number[], w: number, h: number, pad = 2): string {
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  return points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = max === min ? h / 2 : pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

type Props = { points: number[]; stroke?: string; label?: string };

export function TrendLine({ points, stroke = "var(--motif-color-brand)", label }: Props) {
  return (
    <svg viewBox="0 0 240 48" className="trend" role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={linePath(points, 240, 48)} pathLength={1} className="trend-line" style={{ stroke }} />
    </svg>
  );
}
```

```css
.trend { width: 100%; height: auto; overflow: visible; }
.trend-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
[dir="rtl"] .trend { transform: scaleX(-1); }
@media (prefers-reduced-motion: no-preference) {
  .trend-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw var(--motif-duration-slow) var(--motif-easing-enter) forwards; }
}
@keyframes draw { to { stroke-dashoffset: 0; } }
```

Make the `viewBox` the size the chart usually shows at, so the stroke stays near 2 px. When the app already uses Motion for React, `motion.path` with `pathLength` from 0 to 1 does the same, with `duration.slow` as it is (the generated file is in seconds), inside `<MotionConfig reducedMotion="user">` ([draw-in](../motion/draw-in.md)).

### plain-web

The same SVG written in the page and the same CSS as react-web (the draw sits inside `prefers-reduced-motion: no-preference`). Build the path with react-web's `linePath` helper in a script.

```html
<svg viewBox="0 0 240 48" class="trend" role="img" aria-label="Outstanding $18,420, up 6% over 12 weeks">
  <path class="trend-line" pathLength="1" d="" style="stroke: var(--motif-color-brand)"></path>
  <circle class="trend-dot" r="3"></circle>
</svg>
```

Set the path's `d` and the dot's `cx`/`cy` (the last point) from the data, then add the class that starts the draw when the chart scrolls into view, as [draw-in](../motion/draw-in.md) shows. The dot is `fill: var(--motif-color-brand)`.

### vue

A `TrendLine` component that computes the path in a `computed`; react-web's CSS goes in its `<style scoped>`.

```vue
<script setup lang="ts">
import { computed } from "vue";
import { linePath } from "@/design/charts";
const props = withDefaults(defineProps<{ points: number[]; stroke?: string; label?: string }>(),
  { stroke: "var(--motif-color-brand)" });
const d = computed(() => linePath(props.points, 240, 48));
</script>

<template>
  <svg viewBox="0 0 240 48" class="trend" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'">
    <path :d="d" pathLength="1" class="trend-line" :style="{ stroke }" />
  </svg>
</template>
```

Keep `linePath` in one shared file (here `design/charts.ts`). Motion for Vue's `motion.path` is an option only when the project already has `motion-v`.

### svelte

The SVG with Svelte's `draw` transition on the path, skipped when `prefersReducedMotion.current` is true (`duration.slow` is in milliseconds here, as the transition takes it).

```svelte
<script lang="ts">
  import { draw } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  import { linePath } from "$lib/design/charts";
  let { points, stroke = "var(--motif-color-brand)", label }: { points: number[]; stroke?: string; label?: string } = $props();
</script>

<svg viewBox="0 0 240 48" class="trend" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
  <path d={linePath(points, 240, 48)} class="trend-line" style:stroke={stroke}
    in:draw={{ duration: prefersReducedMotion.current ? 0 : duration.slow, easing: easing.enter }} />
</svg>
```

Use react-web's CSS without the `animation` rule, since the transition draws it.

### angular

A standalone `TrendLine` component with the SVG in its template; the CSS draw sits in its styles inside `prefers-reduced-motion: no-preference`, so no animation code is needed.

```ts
@Component({
  selector: "app-trend-line",
  template: `
    <svg viewBox="0 0 240 48" class="trend" [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() ?? null" [attr.aria-hidden]="label() ? null : 'true'">
      <path [attr.d]="d()" pathLength="1" class="trend-line" [style.stroke]="stroke()" />
    </svg>`,
  styleUrl: "./trend-line.css",
})
export class TrendLine {
  points = input.required<number[]>();
  stroke = input("var(--motif-color-brand)");
  label = input<string>();
  d = computed(() => linePath(this.points(), 240, 48));
}
```

`trend-line.css` holds react-web's rules. Motion's `animate` is an option when the project already has `motion` (its durations are in seconds, used as they are).

### flutter

A `TrendLine` widget: a `CustomPainter` builds the path and draws it up to a progress value, and `TweenAnimationBuilder` drives the progress. `MotifMotion.duration(context, …)` is zero under reduced motion.

```dart
class TrendLine extends StatelessWidget {
  const TrendLine({super.key, required this.points, this.color, this.label});
  final List<double> points;
  final Color? color;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final line = TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: MotifMotion.duration(context, MotifDurations.slow),
      curve: MotifCurves.enter,
      builder: (context, t, _) => CustomPaint(
        size: Size.infinite,
        painter: _TrendPainter(points, t, color ?? MotifColors.of(context).brand),
      ),
    );
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final drawn = ExcludeSemantics(child: Transform.flip(flipX: rtl, child: line));
    return label == null ? drawn : Semantics(label: label, child: drawn);
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.points, this.progress, this.color);
  final List<double> points;
  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final lo = points.reduce(math.min), hi = points.reduce(math.max);
    final span = hi - lo == 0 ? 1.0 : hi - lo;
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final x = size.width * i / (points.length - 1);
      final y = hi == lo ? size.height / 2 : 2 + (1 - (points[i] - lo) / span) * (size.height - 4);
      i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    final paint = Paint()..color = color..strokeWidth = 2..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    for (final m in path.computeMetrics()) {
      canvas.drawPath(m.extractPath(0, m.length * progress), paint);
    }
  }

  @override
  bool shouldRepaint(_TrendPainter old) => old.progress != progress || old.points != points || old.color != color;
}
```

Give it a height from its parent (`SizedBox(height: 48, child: TrendLine(points: points))`).

### compose

A `TrendLine` composable: a `Canvas` builds the `Path` and draws a `PathMeasure` segment up to an `Animatable`'s value. Read `MotifMotion.reduced()` and the duration in the composable's body, and snap to 1 when it is on.

```kotlin
@Composable
fun TrendLine(points: List<Float>, color: Color = MotifTheme.colors.brand, modifier: Modifier = Modifier) {
    val progress = remember { Animatable(0f) }
    val reduced = MotifMotion.reduced()
    val slow = MotifMotion.duration(MotifDurations.slow)
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    LaunchedEffect(points) {
        if (reduced) progress.snapTo(1f) else progress.animateTo(1f, tween(slow, easing = MotifEasing.enter))
    }
    Canvas(modifier.graphicsLayer { scaleX = if (rtl) -1f else 1f }) {
        val lo = points.min(); val hi = points.max(); val span = (hi - lo).takeIf { it > 0f } ?: 1f
        val path = Path()
        points.forEachIndexed { i, v ->
            val x = size.width * i / (points.size - 1)
            val y = if (hi == lo) size.height / 2 else 2.dp.toPx() + (1 - (v - lo) / span) * (size.height - 4.dp.toPx())
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        val measure = PathMeasure().apply { setPath(path, false) }
        val partial = Path().also { measure.getSegment(0f, measure.length * progress.value, it) }
        drawPath(partial, color, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
    }
}
```

The caller sets the size and the semantics: `Modifier.fillMaxWidth().height(48.dp).semantics { contentDescription = label }` on its own, or `.clearAndSetSemantics { }` inside a card that says it.

### react-native

`react-native-svg` draws the path; Reanimated drives its `strokeDashoffset` (`duration.slow` is in milliseconds, as `withTiming` takes it). Motif's React Native guide assumes Expo and Reanimated 3.16, not `react-native-svg`: when `package.json` doesn't list it, add it with `npx expo install react-native-svg`.

```tsx
import Svg, { Path } from "react-native-svg";
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easing, useMotifTheme } from "@/design/motif-theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function TrendLine({ points, stroke, label }: { points: number[]; stroke?: string; label?: string }) {
  const { colors } = useMotifTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) progress.value = withTiming(1, { duration: duration.slow, easing: easing.enter });
  }, []);
  const props = useAnimatedProps(() => ({ strokeDashoffset: 1 - progress.value }));
  return (
    <Svg viewBox="0 0 240 48" width="100%" height={48} accessible={!!label} accessibilityLabel={label}
      style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
      <AnimatedPath d={linePath(points, 240, 48)} pathLength={1} strokeDasharray={1} animatedProps={props}
        stroke={stroke ?? colors.brand} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
```

`linePath` is react-web's helper, kept in one shared file.

### swiftui

A `TrendShape` (a `Shape` built from the points), trimmed by a progress value that animates on appear. Under `accessibilityReduceMotion`, `MotifMotion.animation(_:reduceMotion:)` gives no animation and the line is drawn at once.

```swift
struct TrendShape: Shape {
    let points: [Double]
    func path(in rect: CGRect) -> Path {
        guard points.count > 1, let lo = points.min(), let hi = points.max() else { return Path() }
        let span = hi - lo == 0 ? 1 : hi - lo
        return Path { p in
            for (i, v) in points.enumerated() {
                let x = rect.width * CGFloat(i) / CGFloat(points.count - 1)
                let y = hi == lo ? rect.midY : 2 + (1 - CGFloat((v - lo) / span)) * (rect.height - 4)
                i == 0 ? p.move(to: CGPoint(x: x, y: y)) : p.addLine(to: CGPoint(x: x, y: y))
            }
        }
    }
}

struct TrendLine: View {
    let points: [Double]
    var color: Color? = nil
    var label: String? = nil
    @Environment(\.motifColors) private var colors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.layoutDirection) private var direction
    @State private var progress: CGFloat = 0

    var body: some View {
        TrendShape(points: points).trim(from: 0, to: progress)
            .stroke(color ?? colors.brand, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            .scaleEffect(x: direction == .rightToLeft ? -1 : 1)
            .frame(height: 48)
            .accessibilityHidden(label == nil).accessibilityLabel(label ?? "")
            .onAppear {
                withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { progress = 1 }
            }
    }
}
```

On a `brand` card, pass `color: colors.onBrand`. Swift Charts' `LineMark` with both axes hidden fits too when the screen already uses Swift Charts: mask it with a `Rectangle` whose width is `progress` of the chart's, from `.leading`.
