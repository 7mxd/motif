# Progress ring

## Purpose

A ring that fills to show how far a goal has come: 72% of this month's collections, 3 of 5 runs this week, the share of an invoice paid. The figure sits in the middle, so the ring and its number read as one thing, and the empty part of the ring shows at a glance how much is left.

## Fits

Every brief, wherever there is a target to reach: a monthly goal, a quota, a share paid, a streak's week. On a calm home screen it sits beside the key figure, or in a [stat row](../cards/stat-row.md) at a small size. Not for a figure without a target (use the [trend line](trend-line.md)), and not for several parts (use the [segmented bar](segmented-bar.md)): one ring holds one share.

## Loudness

calm. The track is `border`; the filled arc is `brand`; the figure in the middle is `text-primary` in the theme's `heading` or `title` role, with a short caption under it in `text-secondary`. On a `brand` card the arc is `on-brand` and the track `brand-soft`. When the goal is reached the arc turns `success` and a check and the words "Goal reached" join it. Never more than one ring per card, never a gradient along the arc.

## Data

- A value and a target, both zero or more ("$13,260 of $18,400"). The share is value ÷ target, held between 0 and 1 for drawing.
- The figure in the middle is the share as a whole percent, rounded down, so 99.6% shows "99%" and the ring never reads full before it is; or the count itself ("3 of 5") when the target is a small number of things.
- Past the target, the ring is full and the figure says so ("112%", caption "Goal passed").
- A target of zero, or no target set, is the empty state below, never a full or a blank ring.
- The arc starts at the top and runs clockwise, in either reading direction.
- Size: about 48 pt / dp in a row, 96 to 120 on a card. The stroke is about a tenth of the ring's width, with round caps.

## States

- **Loading:** the track alone, in `border`, with the middle empty; no arc.
- **Empty:** no target yet: the track and, in the middle, "Set a goal" as a text button (at least 44 pt / 48 dp tall) that opens where the goal is set.
- **Error:** the track and "Couldn't load" with a Retry text button under the ring. When the data arrives, the arc draws in then.
- **Update:** a new value moves the arc from where it is to the new share with `duration.base`, and the figure counts from the old number to the new one; it never empties and refills.

## Motion

The arc uses [draw-in](../motion/draw-in.md) and the figure in the middle uses [count-up](../motion/count-up.md), over the same duration and curve so the number lands as the arc stops. When the person's own action completes the goal (they log the fifth run), the check may use [success](../motion/success.md); a goal reached on load just shows it.

| Level | Arc and figure |
|---|---|
| `lively` | `duration.slow`, `easing.enter`; the arc's cap then settles with `spring.smooth` |
| `default` | `duration.slow`, `easing.enter`, arc and count together |
| `calm` | `duration.base`, `easing.enter`, arc and count together |
| `none` | the arc and the final figure appear at once |

## Accessibility

- The ring and its figure are one element to a screen reader, labelled with its key number in words: "Collected $13,260 of $18,400 this month, 72%." The drawing itself is hidden.
- Reaching the goal is said in words ("Goal reached") and with a check, not by the colour change alone.
- The arc needs 3:1 against the track and the card: `brand` on `surface` beside `border`, or `on-brand` on `brand`, as the theme's pairs promise.
- The figure in the middle uses tabular figures, so it doesn't shift sideways while it counts.
- When the ring opens the goal's page, the whole ring with its caption is the target (at least 44 pt / 48 dp).
- Under reduced motion the ring appears filled to its value (level `none`).

## Stacks

### react-web

Inline SVG: two circles, the arc with `pathLength="100"` so its dash is the percent itself. The figure is HTML on top (a one-cell grid), so it uses the theme's type.

```tsx
export function ProgressRing({ share, label, children }: { share: number; label: string; children: React.ReactNode }) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" className="ring-track" />
        <circle cx="24" cy="24" r="21" pathLength={100} className="ring-arc" style={{ "--pct": pct } as React.CSSProperties} />
      </svg>
      <div className="ring-figure" aria-hidden="true">{children}</div>
    </div>
  );
}
```

```css
.ring { display: grid; place-items: center; width: 96px; aspect-ratio: 1; }
.ring > * { grid-area: 1 / 1; }
.ring svg { width: 100%; height: 100%; }
.ring circle { fill: none; stroke-width: 5; }
.ring-track { stroke: var(--motif-color-border); }
.ring-arc { stroke: var(--motif-color-brand); stroke-linecap: round; stroke-dasharray: 100;
  stroke-dashoffset: calc(100 - var(--pct)); transform: rotate(-90deg); transform-origin: center; transform-box: fill-box; }
.ring-figure { font-variant-numeric: tabular-nums; color: var(--motif-color-text-primary); }
@media (prefers-reduced-motion: no-preference) {
  .ring-arc { animation: ring-fill var(--motif-duration-slow) var(--motif-easing-enter) both; }
}
@keyframes ring-fill { from { stroke-dashoffset: 100; } }
```

The `@keyframes` has only a `from`, so it ends at each ring's own value. The figure counts up as [count-up](../motion/count-up.md) shows. A share of 0 hides the arc (`stroke-dashoffset: 100` with a round cap still paints a dot, so leave the arc out then).

### plain-web

The same markup and CSS as react-web, written in the page; set `--pct` on the arc from the data.

```html
<div class="ring" role="img" aria-label="Collected $13,260 of $18,400 this month, 72%">
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21" class="ring-track"></circle>
    <circle cx="24" cy="24" r="21" class="ring-arc" pathLength="100" style="--pct: 72"></circle>
  </svg>
  <div class="ring-figure" aria-hidden="true"><strong>72%</strong></div>
</div>
```

The fill plays inside `prefers-reduced-motion: no-preference`; for a ring below the fold, start it when it scrolls into view ([draw-in](../motion/draw-in.md)).

### vue

A component with the same SVG and a `computed` share; react-web's CSS goes in its `<style scoped>`.

```vue
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ value: number; target: number; label: string }>();
const pct = computed(() => (props.target > 0 ? Math.min(1, props.value / props.target) * 100 : 0));
</script>

<template>
  <div class="ring" role="img" :aria-label="label">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" class="ring-track" />
      <circle v-if="pct > 0" cx="24" cy="24" r="21" pathLength="100" class="ring-arc" :style="{ '--pct': pct }" />
    </svg>
    <div class="ring-figure" aria-hidden="true"><slot /></div>
  </div>
</template>
```

### svelte

A `Tween` from `svelte/motion` holds the share; the arc's dash offset reads it, and the same tween can feed the figure's count.

```svelte
<script lang="ts">
  import { Tween, prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  let { share, label }: { share: number; label: string } = $props();
  const shown = new Tween(0, { easing: easing.enter });
  $effect(() => { shown.set(share, { duration: prefersReducedMotion.current ? 0 : duration.slow }); });
</script>

<div class="ring" role="img" aria-label={label}>
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21" class="ring-track" />
    <circle cx="24" cy="24" r="21" pathLength="100" class="ring-arc" stroke-dashoffset={100 - shown.current * 100} />
  </svg>
  <strong class="ring-figure" aria-hidden="true">{Math.floor(shown.current * 100)}%</strong>
</div>
```

Use react-web's CSS without the `animation` line, since the tween drives the offset.

### angular

A standalone component with the SVG in its template and react-web's CSS in its styles; the fill plays from CSS inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-progress-ring",
  template: `
    <div class="ring" role="img" [attr.aria-label]="label()">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" class="ring-track" />
        @if (pct() > 0) { <circle cx="24" cy="24" r="21" pathLength="100" class="ring-arc" [style.--pct]="pct()" /> }
      </svg>
      <div class="ring-figure" aria-hidden="true"><ng-content /></div>
    </div>`,
  styleUrl: "./progress-ring.css",
})
export class ProgressRing {
  share = input.required<number>();
  label = input.required<string>();
  pct = computed(() => Math.max(0, Math.min(1, this.share())) * 100);
}
```

### flutter

A `CustomPainter` with `drawArc` from the top, its sweep driven by `TweenAnimationBuilder`; `MotifMotion.duration(context, …)` is zero under reduced motion. The figure is a `Text` in a `Stack` over it.

```dart
class RingPainter extends CustomPainter {
  RingPainter({required this.share, required this.track, required this.arc});
  final double share;
  final Color track, arc;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width / 10;
    final rect = Offset.zero & size;
    final paint = Paint()..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.round;
    canvas.drawArc(rect.deflate(stroke / 2), 0, 2 * math.pi, false, paint..color = track);
    if (share > 0) canvas.drawArc(rect.deflate(stroke / 2), -math.pi / 2, 2 * math.pi * share, false, paint..color = arc);
  }

  @override
  bool shouldRepaint(RingPainter old) => old.share != share || old.arc != arc;
}

final colors = MotifColors.of(context);
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: share.clamp(0, 1)),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, _) => CustomPaint(
    size: const Size.square(96),
    painter: RingPainter(share: t, track: colors.border, arc: colors.brand),
    child: Center(child: Text('${(t * 100).floor()}%',
        style: MotifText.title.copyWith(color: colors.textPrimary, fontFeatures: const [FontFeature.tabularFigures()]))),
  ),
)
```

Wrap it in `Semantics(label: …)` with `ExcludeSemantics` around the painted ring and its figure.

### compose

`drawArc` in a `Canvas`, from −90° (the top), with the sweep from an `Animatable`; `MotifMotion.reduced()` snaps it to the value.

```kotlin
@Composable
fun ProgressRing(share: Float, label: String, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    val shown = remember { Animatable(0f) }
    val reduced = MotifMotion.reduced()
    val slow = MotifMotion.duration(MotifDurations.slow)
    LaunchedEffect(share) {
        val end = share.coerceIn(0f, 1f)
        if (reduced) shown.snapTo(end) else shown.animateTo(end, tween(slow, easing = MotifEasing.enter))
    }
    Box(modifier.size(96.dp).clearAndSetSemantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val stroke = Stroke(width = size.minDimension / 10, cap = StrokeCap.Round)
            val inset = stroke.width / 2
            val arcSize = Size(size.width - stroke.width, size.height - stroke.width)
            drawArc(colors.border, 0f, 360f, false, Offset(inset, inset), arcSize, style = stroke)
            if (shown.value > 0f) drawArc(colors.brand, -90f, 360f * shown.value, false, Offset(inset, inset), arcSize, style = stroke)
        }
        Text("${(shown.value * 100).toInt()}%", style = MotifType.title.copy(fontFeatureSettings = "tnum"), color = colors.textPrimary)
    }
}
```

### react-native

`react-native-svg` draws the two circles; Reanimated drives the arc's `strokeDashoffset`, and a `G` turned by −90° starts it at the top. Motif's React Native guide assumes Expo and Reanimated 3.16, not `react-native-svg`: when the app doesn't list it, ask before adding it with `npx expo install react-native-svg`.

```tsx
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 2 * Math.PI * 21; // the arc's length (2πr): the dash is measured, not normalised

export function ProgressRing({ share, label, children }: { share: number; label: string; children: React.ReactNode }) {
  const { colors } = useMotifTheme();
  const reduced = useReducedMotion();
  const end = Math.max(0, Math.min(1, share));
  const shown = useSharedValue(reduced ? end : 0);
  useEffect(() => {
    shown.value = reduced ? end : withTiming(end, { duration: duration.slow, easing: easing.enter });
  }, [end]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - shown.value) }));
  return (
    <View accessible accessibilityLabel={label} style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}>
      <Svg viewBox="0 0 48 48" style={StyleSheet.absoluteFill}>
        <G rotation={-90} origin="24, 24">
          <Circle cx={24} cy={24} r={21} stroke={colors.border} strokeWidth={5} fill="none" />
          {end > 0 && <AnimatedCircle cx={24} cy={24} r={21} strokeDasharray={RING} animatedProps={arc}
            stroke={colors.brand} strokeWidth={5} strokeLinecap="round" fill="none" />}
        </G>
      </Svg>
      <View importantForAccessibility="no-hide-descendants">{children}</View>
    </View>
  );
}
```

### swiftui

Two `Circle`s, the arc with `.trim(from: 0, to: share)` and turned by −90°; a `Gauge` would hand the look to the system, so draw it. Under `accessibilityReduceMotion`, `MotifMotion.animation` gives no animation and the value is set at once.

```swift
struct ProgressRing: View {
    let share: Double
    let label: String
    @Environment(\.motifColors) private var colors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown: Double = 0

    var body: some View {
        ZStack {
            Circle().stroke(colors.border, lineWidth: 10)
            Circle().trim(from: 0, to: shown)
                .stroke(colors.brand, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(shown, format: .percent.precision(.fractionLength(0)).rounded(rule: .down))
                .motifFont(.title).monospacedDigit()
                .contentTransition(.numericText(value: shown))
        }
        .frame(width: 96, height: 96)
        .accessibilityElement(children: .ignore).accessibilityLabel(label)
        .onAppear {
            withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) {
                shown = min(max(share, 0), 1)
            }
        }
    }
}
```

Swift Charts' `SectorMark` can draw a ring too, but for one share the trimmed `Circle` is simpler and draws in the same way as the other charts.
