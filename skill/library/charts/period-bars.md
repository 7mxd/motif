# Period bars

## Purpose

A small bar chart of the last few periods (days, weeks or months) with the current period highlighted in `brand` and the others in a quiet role. It answers "is this period better or worse than the ones before?" in one look, and puts the eye on now while the past bars give it scale.

## Fits

Every brief with a figure counted per period: sales per week, runs per day, hours per month, plants watered per week. It sits in a card under its figure ("This week $3,240") or beside a [stat change](stat-change.md). Not for a long history (use the [trend line](trend-line.md)), and not for parts of one total (use the [segmented bar](segmented-bar.md)).

## Loudness

calm. The current period's bar is `brand`; the past bars are `brand-soft` (or `border` for the quietest briefs); the period labels under the bars are `text-secondary`, except the current period's, which is `text-primary` in the `label` weight. No axis line, no grid, no value on every bar: the current period's figure sits above the chart as the card's figure. Bars have `radius.sm` on their top corners and are about three fifths of their column's width. Louder briefs may set the chart on a `brand` card, with the current bar in `on-brand` and the past ones in `brand-soft`.

## Data

- An ordered list of 3 to 12 periods, oldest first, each with a short label ("Mon", "W45", "Nov") and a value of zero or more. The last one is the current period; when the person picks another period, that one is highlighted instead.
- Heights run from zero to the largest value in the list: bars always start at zero, never at a cut-off baseline, so their heights compare truly.
- A value of zero draws a hairline stub in `border`, so the period still shows. A period with no data at all has no bar and its label reads "–".
- A current period still in progress is labelled as such ("This week, so far"), so a short bar isn't read as a bad week.
- Negative values don't belong here; use a different chart.
- In a right-to-left layout time runs from right to left: the oldest bar is on the right and the current period on the left edge.

## States

- **Loading:** every bar at the same middle height in `border`, with the period labels in place.
- **Empty:** no values at all, or all zero: no bars. A line in their place says what will appear: "No sales yet this month. Each week shows here."
- **Error:** "Couldn't load the weeks" with a Retry text button (at least 44 pt / 48 dp tall) where the bars would be. When the data arrives, the bars grow in then.
- **Update:** a new value moves its bar's height with `duration.base`; the others stay still.

## Motion

The bars use [draw-in](../motion/draw-in.md): each grows up from the baseline, oldest first, so the eye travels to the current period last. The figure above the chart uses [count-up](../motion/count-up.md) over the same duration.

| Level | Bars |
|---|---|
| `lively` | each bar over `duration.slow`, `easing.enter`, one after another by a quarter of `duration.fast`; the current period's bar settles with `spring.smooth` |
| `default` | each bar over `duration.slow`, `easing.enter`, one after another by a quarter of `duration.fast` |
| `calm` | all bars together over `duration.base`, `easing.enter` |
| `none` | the bars appear at their heights, at once |

## Accessibility

- The chart is one element to a screen reader, labelled with its key numbers in words: "Sales this week $3,240 so far, the highest of the last 8 weeks. Last week $2,910." Offer the full list (a "Show all weeks" link or the table on the detail page) for every value.
- The current period is marked by its label (in `text-primary`, `label` weight, and the words "This week") as well as by its colour.
- The `brand` bar needs 3:1 against the card; the past bars carry context only, and their values are in the full list.
- Bars on a phone are often narrower than 44 pt / 48 dp, so they aren't separate controls: the whole chart opens the detail page, or each period is a row in the list.
- Under reduced motion the bars appear at their heights (level `none`).

## Stacks

### react-web

Plain elements, not SVG: a flex row of columns, each a bar over its label. Heights are percents, so the chart fills whatever width the card has, and `dir="rtl"` reverses the order by itself.

```tsx
type Period = { label: string; value: number };

export function PeriodBars({ periods, label, current = periods.length - 1 }: { periods: Period[]; label: string; current?: number }) {
  const max = Math.max(1, ...periods.map((p) => p.value));
  return (
    <div className="bars" role="img" aria-label={label}>
      {periods.map((p, i) => (
        <div key={p.label} className={i === current ? "bar-col is-current" : "bar-col"} aria-hidden="true">
          <div className="bar-track">
            <span className={p.value === 0 ? "bar is-zero" : "bar"} style={{ height: `${(p.value / max) * 100}%`, "--i": i } as React.CSSProperties} />
          </div>
          <span className="bar-label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}
```

```css
.bars { display: flex; gap: var(--motif-space-2); }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--motif-space-1); }
.bar-track { height: var(--motif-space-16); width: 60%; display: flex; align-items: flex-end; }
.bar { width: 100%; background: var(--motif-color-brand-soft); border-radius: var(--motif-radius-sm) var(--motif-radius-sm) 0 0; transform-origin: bottom; }
.bar.is-zero { height: 1px !important; background: var(--motif-color-border); }
.is-current .bar { background: var(--motif-color-brand); }
.bar-label { color: var(--motif-color-text-secondary); }
.is-current .bar-label { color: var(--motif-color-text-primary); font-weight: var(--motif-font-label-weight); }
@media (prefers-reduced-motion: no-preference) {
  .bar { animation: rise var(--motif-duration-slow) var(--motif-easing-enter) both; animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
}
@keyframes rise { from { transform: scaleY(0); } }
```

At `calm`, drop the delay and use `var(--motif-duration-base)`.

### plain-web

The same markup and CSS as react-web, written in the page or built from the data in a script; each bar's `height` is its share of the largest value, and `--i` its place.

```html
<div class="bars" role="img" aria-label="Sales this week $3,240 so far, the highest of the last 8 weeks. Last week $2,910.">
  <div class="bar-col" aria-hidden="true"><div class="bar-track"><span class="bar" style="height: 74%; --i: 6"></span></div><span class="bar-label">W44</span></div>
  <div class="bar-col is-current" aria-hidden="true"><div class="bar-track"><span class="bar" style="height: 100%; --i: 7"></span></div><span class="bar-label">This week</span></div>
</div>
```

The rise plays inside `prefers-reduced-motion: no-preference`; for a chart below the fold, add the animating class when it scrolls into view ([draw-in](../motion/draw-in.md)).

### vue

A `v-for` over the periods, a `computed` largest value, and react-web's CSS in `<style scoped>`.

```vue
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ periods: { label: string; value: number }[]; label: string }>();
const max = computed(() => Math.max(1, ...props.periods.map((p) => p.value)));
</script>

<template>
  <div class="bars" role="img" :aria-label="label">
    <div v-for="(p, i) in periods" :key="p.label" class="bar-col" :class="{ 'is-current': i === periods.length - 1 }" aria-hidden="true">
      <div class="bar-track"><span class="bar" :class="{ 'is-zero': p.value === 0 }" :style="{ height: `${(p.value / max) * 100}%`, '--i': i }" /></div>
      <span class="bar-label">{{ p.label }}</span>
    </div>
  </div>
</template>
```

### svelte

An `{#each}` over the periods with react-web's CSS; when `prefersReducedMotion.current` is true, leave off the class that animates.

```svelte
<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  let { periods, label }: { periods: { label: string; value: number }[]; label: string } = $props();
  const max = $derived(Math.max(1, ...periods.map((p) => p.value)));
</script>

<div class="bars" role="img" aria-label={label}>
  {#each periods as p, i (p.label)}
    <div class="bar-col" class:is-current={i === periods.length - 1} aria-hidden="true">
      <div class="bar-track">
        <span class="bar" class:rise={!prefersReducedMotion.current} class:is-zero={p.value === 0}
          style:height="{(p.value / max) * 100}%" style:--i={i}></span>
      </div>
      <span class="bar-label">{p.label}</span>
    </div>
  {/each}
</div>
```

Put the `animation` rule on `.bar.rise`.

### angular

A standalone component with a `@for` over the periods and react-web's CSS in its styles, the rise inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-period-bars",
  template: `
    <div class="bars" role="img" [attr.aria-label]="label()">
      @for (p of periods(); track p.label; let i = $index, last = $last) {
        <div class="bar-col" [class.is-current]="last" aria-hidden="true">
          <div class="bar-track"><span class="bar" [class.is-zero]="p.value === 0" [style.height.%]="(p.value / max()) * 100" [style.--i]="i"></span></div>
          <span class="bar-label">{{ p.label }}</span>
        </div>
      }
    </div>`,
  styleUrl: "./period-bars.css",
})
export class PeriodBars {
  periods = input.required<{ label: string; value: number }[]>();
  label = input.required<string>();
  max = computed(() => Math.max(1, ...this.periods().map((p) => p.value)));
}
```

### flutter

A `Row` of columns, each a bar box over its label, so right-to-left and text scaling come free; one `TweenAnimationBuilder` drives every bar's height, each a little behind the one before, and `MotifMotion.duration(context, …)` is zero under reduced motion. A `CustomPainter` works too when the bars need to share one drawn baseline.

```dart
final colors = MotifColors.of(context);
final max = periods.map((p) => p.value).fold(1.0, math.max);
// calm: true when the brief sets the calm motion level
final lag = calm ? 0.0 : MotifDurations.fast.inMilliseconds / 4 / MotifDurations.slow.inMilliseconds;

TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, _) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      for (var i = 0; i < periods.length; i++)
        Expanded(child: Column(children: [
          SizedBox(height: MotifSpace.s16, child: Align(alignment: Alignment.bottomCenter, child: FractionallySizedBox(
            widthFactor: 0.6,
            heightFactor: (periods[i].value / max) * ((t - i * lag) / (1 - (periods.length - 1) * lag)).clamp(0.0, 1.0),
            child: DecoratedBox(decoration: BoxDecoration(
              color: i == periods.length - 1 ? colors.brand : colors.brandSoft,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(MotifRadius.sm)),
            )),
          ))),
          SizedBox(height: MotifSpace.s1),
          Text(periods[i].label, style: MotifText.caption.copyWith(
            color: i == periods.length - 1 ? colors.textPrimary : colors.textSecondary)),
        ])),
    ],
  ),
)
```

Wrap it in `Semantics(label: …)` with `ExcludeSemantics` around the row.

### compose

A `Row` of `Box`es, each `fillMaxHeight` by its share and scaled up from the bottom in `graphicsLayer`, from one `Animatable` and the same lag as Flutter's; `MotifMotion.reduced()` snaps it to 1. A `Canvas` works too when the bars need one drawn baseline.

```kotlin
val t = remember { Animatable(0f) }
val reduced = MotifMotion.reduced()
val slow = MotifMotion.duration(MotifDurations.slow)
LaunchedEffect(Unit) { if (reduced) t.snapTo(1f) else t.animateTo(1f, tween(slow, easing = MotifEasing.enter)) }
val max = periods.maxOf { it.value }.coerceAtLeast(1f)
Row(Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = label }, horizontalArrangement = Arrangement.spacedBy(MotifSpace.s2)) {
    periods.forEachIndexed { i, p ->
        val current = i == periods.lastIndex
        val grow = ((t.value - i * lag) / (1 - periods.lastIndex * lag)).coerceIn(0f, 1f)
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.height(MotifSpace.s16).fillMaxWidth(0.6f), contentAlignment = Alignment.BottomCenter) {
                Box(Modifier.fillMaxWidth().fillMaxHeight(p.value / max)
                    .graphicsLayer { scaleY = grow; transformOrigin = TransformOrigin(0.5f, 1f) }
                    .background(if (current) MotifTheme.colors.brand else MotifTheme.colors.brandSoft,
                        RoundedCornerShape(topStart = MotifRadius.sm, topEnd = MotifRadius.sm)))
            }
            Text(p.label, style = MotifType.caption, color = if (current) MotifTheme.colors.textPrimary else MotifTheme.colors.textSecondary)
        }
    }
}
```

`lag` is `MotifDurations.fast / 4f / MotifDurations.slow`, or `0f` at `calm`. `Row` follows the layout direction by itself.

### react-native

A `View` row of columns, each bar an `Animated.View` with its height as a percent, scaled up from the bottom; no `react-native-svg` needed here. Reanimated's `withDelay` gives each bar its step, and `useReducedMotion()` sets the end at once.

```tsx
function Bar({ share, index, current }: { share: number; index: number; current: boolean }) {
  const { colors } = useMotifTheme();
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) grow.value = withDelay(index * duration.fast / 4, withTiming(1, { duration: duration.slow, easing: easing.enter }));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  return (
    <View style={{ height: space.s16, width: "60%", justifyContent: "flex-end" }}>
      <Animated.View style={[{ height: `${share * 100}%`, transformOrigin: "bottom",
        backgroundColor: current ? colors.brand : colors.brandSoft,
        borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm }, style]} />
    </View>
  );
}
```

Lay the columns out in a `View` with `flexDirection: "row"` (which flips under right-to-left by itself), each `flex: 1` with its `Bar` and a `Text` label in `type.caption`; give the row `accessible` and `accessibilityLabel`. At `calm`, pass index 0 to every bar.

### swiftui

Swift Charts' `BarMark` fits here: hide the axes except the period labels, colour the current period by `brand`, and grow each bar from zero with a small delay. Under `accessibilityReduceMotion`, `MotifMotion.animation` gives none and the bars are at their heights at once.

```swift
import Charts

struct PeriodBars: View {
    let periods: [(label: String, value: Double)]
    let label: String
    @Environment(\.motifColors) private var colors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown: Set<Int> = []

    var body: some View {
        Chart(periods.indices, id: \.self) { i in
            BarMark(x: .value("Period", periods[i].label), y: .value("Value", grown.contains(i) ? periods[i].value : 0), width: .ratio(0.6))
                .foregroundStyle(i == periods.count - 1 ? colors.brand : colors.brandSoft)
                .cornerRadius(MotifRadius.sm)
        }
        .chartYAxis(.hidden)
        .chartYScale(domain: 0...(periods.map(\.value).max() ?? 1))
        .frame(height: MotifSpace.s16)
        .accessibilityElement().accessibilityLabel(label)
        .onAppear {
            for i in periods.indices {
                withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)?
                    .delay(Double(i) * MotifDurations.fast / 4)) { _ = grown.insert(i) }
            }
        }
    }
}
```

The fixed `chartYScale` keeps the scale still while the bars grow. `.cornerRadius` rounds all four corners; the bottom ones sit on the baseline and barely show. Style the x axis labels with `.chartXAxis { AxisMarks { AxisValueLabel().font(MotifType.caption.font()) } }`, the current period's in `colors.textPrimary`.
