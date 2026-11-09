# Segmented bar

## Purpose

One horizontal bar split into the parts of a whole, with a legend under it: invoices by age (current, 1–30 days, 31–60 days, 60+ days), a budget by category, a week's runs by kind. It shows at a glance how the whole is made up and which part needs attention, and the legend gives each part's exact figure.

## Fits

Every brief that has a breakdown of one total into two to five parts. It is the breakdown on a calm business home screen, under or beside the [key-figure card](../cards/key-figure-card.md) whose figure is the bar's whole. Not for change over time (use [period bars](period-bars.md) or the [trend line](trend-line.md)) and not for one share of a goal (use the [progress ring](progress-ring.md)).

## Loudness

calm. Parts that are fine take quiet roles: the main healthy part `brand`, the next `brand-soft`. Status colours go only to the parts that need action: `warning` for a part that wants a nudge (31–60 days), `danger` for one that wants action now (60+ days). Parts are separated by a gap of `space.1`, so neighbours never rely on colour to tell apart. The bar's ends are `radius.full`; the gaps stay square.

| Part (invoices by age) | Role | Why |
|---|---|---|
| Current | `brand` | the healthy bulk |
| 1–30 days | `brand-soft` | late, not yet a worry |
| 31–60 days | `warning` | send a reminder |
| 60+ days | `danger` | act now |

## Data

- A list of parts, each with a label, a value of zero or more, an optional count ("4 invoices") and a tone (`quiet`, `warning` or `danger`). The parts add up to a whole: their sum is the total the card's figure shows ("Outstanding $18,420"), and each part's width is its value ÷ that total.
- The order is the parts' meaning (oldest last, or the order the app uses everywhere), never sorted by size, so the bar reads the same from day to day.
- Two to five parts. More than five: keep the four largest and group the rest as "Other".
- A part of zero is left out of the bar and kept in the legend ("31–60 days · $0"), so the breakdown still reads complete. A part above zero gets at least `space.1` of width, so it never disappears.
- The legend gives amounts; when it gives percents, round them so they sum to 100.
- In a right-to-left layout the bar starts on the right, and the parts grow from the right.

## States

- **Loading:** the bar's shape in `border`, one piece, with two or three legend rows as grey lines in `border`.
- **Empty:** a total of zero: no bar. Say so plainly in its place, with the next step if there is one: "No open invoices. New invoices show here by age."
- **Error:** "Couldn't load the breakdown" with a Retry text button (at least 44 pt / 48 dp tall) where the bar would be. When the data arrives, the parts grow in then.
- **Update:** new values move each part's width with `duration.base`; parts never shrink to zero and regrow.

## Motion

The parts use [draw-in](../motion/draw-in.md): each grows from the bar's start edge to its width. The legend's figures appear with the bar; when the bar's total is the card's key figure, that figure uses [count-up](../motion/count-up.md).

| Level | Parts |
|---|---|
| `lively` | each part over `duration.slow`, `easing.enter`, one after another by a quarter of `duration.fast`; the last part settles with `spring.smooth` |
| `default` | each part over `duration.slow`, `easing.enter`, one after another by a quarter of `duration.fast` |
| `calm` | all parts together over `duration.base`, `easing.enter` |
| `none` | the bar appears whole, at once |

## Accessibility

- The bar is one element to a screen reader whose label gives the total and each part in words: "Outstanding $18,420: current $9,800; 1 to 30 days $4,200; 31 to 60 days $2,900; over 60 days $1,520, 4 invoices." The legend under it is plain text and reads in the same order.
- A part that needs action says so in its legend row in words ("Overdue · 4 invoices"), not by its colour alone, and each legend row has a small square of its part's colour.
- Status text uses `warning` or `danger` only where the theme's pairs say that role reads at 4.5:1 on the card; otherwise the row's text is `text-primary` and the square carries the colour.
- When a legend row opens that part's list, the whole row is the target, at least 44 pt / 48 dp tall.
- Under reduced motion the bar appears whole (level `none`).

## Stacks

### react-web

Plain elements in a flex row, not SVG: each part's `flex-grow` is its value, so the browser does the sums, and `dir="rtl"` flips the order by itself.

```tsx
type Part = { label: string; value: number; tone: "brand" | "brand-soft" | "warning" | "danger" };

export function SegmentedBar({ parts, label }: { parts: Part[]; label: string }) {
  return (
    <div className="seg" role="img" aria-label={label}>
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <span key={p.label} className="seg-part"
          style={{ flexGrow: p.value, background: `var(--motif-color-${p.tone})`, "--i": i } as React.CSSProperties} />
      ))}
    </div>
  );
}
```

```css
.seg { display: flex; gap: var(--motif-space-1); height: var(--motif-space-3); border-radius: var(--motif-radius-full); overflow: hidden; }
.seg-part { flex-basis: 0; min-width: var(--motif-space-1); transform-origin: left; }
[dir="rtl"] .seg-part { transform-origin: right; }
@media (prefers-reduced-motion: no-preference) {
  .seg-part { animation: grow var(--motif-duration-slow) var(--motif-easing-enter) both;
    animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
}
@keyframes grow { from { transform: scaleX(0); } }
```

At `calm`, drop the `animation-delay` and use `var(--motif-duration-base)`. The legend is a `<ul>` under the bar, each row a small square in the same `var(--motif-color-…)`, the label and the amount.

### plain-web

The same markup and CSS as react-web, written in the page: one `span` per part with its value as `flex-grow` and its index as `--i`.

```html
<div class="seg" role="img" aria-label="Outstanding $18,420: current $9,800; 1 to 30 days $4,200; 31 to 60 days $2,900; over 60 days $1,520, 4 invoices">
  <span class="seg-part" style="flex-grow: 9800; background: var(--motif-color-brand); --i: 0"></span>
  <span class="seg-part" style="flex-grow: 4200; background: var(--motif-color-brand-soft); --i: 1"></span>
  <span class="seg-part" style="flex-grow: 2900; background: var(--motif-color-warning); --i: 2"></span>
  <span class="seg-part" style="flex-grow: 1520; background: var(--motif-color-danger); --i: 3"></span>
</div>
```

The growth plays inside `prefers-reduced-motion: no-preference`; for a bar below the fold, add the animating class when it scrolls into view ([draw-in](../motion/draw-in.md)).

### vue

A `v-for` over the parts with react-web's CSS in `<style scoped>`.

```vue
<script setup lang="ts">
defineProps<{ parts: { label: string; value: number; tone: string }[]; label: string }>();
</script>

<template>
  <div class="seg" role="img" :aria-label="label">
    <span v-for="(p, i) in parts.filter((p) => p.value > 0)" :key="p.label" class="seg-part"
      :style="{ flexGrow: p.value, background: `var(--motif-color-${p.tone})`, '--i': i }" />
  </div>
</template>
```

### svelte

An `{#each}` over the parts with react-web's CSS in the component's `<style>`; when `prefersReducedMotion.current` is true, leave off the class that animates.

```svelte
<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  let { parts, label }: { parts: { label: string; value: number; tone: string }[]; label: string } = $props();
</script>

<div class="seg" role="img" aria-label={label}>
  {#each parts.filter((p) => p.value > 0) as p, i (p.label)}
    <span class="seg-part" class:grow={!prefersReducedMotion.current}
      style:flex-grow={p.value} style:background="var(--motif-color-{p.tone})" style:--i={i}></span>
  {/each}
</div>
```

Put the `animation` rule on `.seg-part.grow`; the media query can stay as well.

### angular

A standalone component with a `@for` over the parts and react-web's CSS in its styles, inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-segmented-bar",
  template: `
    <div class="seg" role="img" [attr.aria-label]="label()">
      @for (p of shown(); track p.label; let i = $index) {
        <span class="seg-part" [style.flex-grow]="p.value" [style.background]="'var(--motif-color-' + p.tone + ')'" [style.--i]="i"></span>
      }
    </div>`,
  styleUrl: "./segmented-bar.css",
})
export class SegmentedBar {
  parts = input.required<{ label: string; value: number; tone: string }[]>();
  label = input.required<string>();
  shown = computed(() => this.parts().filter((p) => p.value > 0));
}
```

### flutter

A `CustomPainter` that lays the parts out with gaps and grows each from the start edge; one `TweenAnimationBuilder` drives them, each part a little behind the one before. `MotifMotion.duration(context, …)` is zero under reduced motion.

```dart
class SegmentsPainter extends CustomPainter {
  SegmentsPainter(this.parts, {required this.t, required this.lag, required this.gap, required this.rtl});
  final List<(double, Color)> parts; // value, colour; zeros already left out
  final double t, lag, gap;
  final bool rtl;

  @override
  void paint(Canvas canvas, Size size) {
    final total = parts.fold(0.0, (s, p) => s + p.$1);
    final free = size.width - gap * (parts.length - 1);
    canvas.clipRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(size.height / 2)));
    var x = 0.0;
    for (var i = 0; i < parts.length; i++) {
      final w = math.max(gap, free * parts[i].$1 / total);
      final grown = w * ((t - i * lag) / (1 - (parts.length - 1) * lag)).clamp(0.0, 1.0);
      final start = rtl ? size.width - x - grown : x;
      canvas.drawRect(Rect.fromLTWH(start, 0, grown, size.height), Paint()..color = parts[i].$2);
      x += w + gap;
    }
  }

  @override
  bool shouldRepaint(SegmentsPainter old) => old.t != t || old.parts != parts;
}
```

Drive `t` from 0 to 1 with `TweenAnimationBuilder<double>` over `MotifMotion.duration(context, MotifDurations.slow)` and `MotifCurves.enter`. Pass `gap: MotifSpace.s1`, `rtl: Directionality.of(context) == TextDirection.rtl`, colours from `MotifColors.of(context)`, and `lag` as a quarter of `MotifDurations.fast` over `MotifDurations.slow` (0 at `calm`). Paint it at a height of `MotifSpace.s3` inside `Semantics(label: …)`.

### compose

A `Canvas` drawing the parts with gaps, from one `Animatable` and the same lag as Flutter's; `MotifMotion.reduced()` snaps it to 1, and the start edge follows `LocalLayoutDirection`.

```kotlin
@Composable
fun SegmentedBar(parts: List<Pair<Float, Color>>, label: String, lag: Float) {
    val t = remember { Animatable(0f) }
    val reduced = MotifMotion.reduced()
    val slow = MotifMotion.duration(MotifDurations.slow)
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    LaunchedEffect(Unit) { if (reduced) t.snapTo(1f) else t.animateTo(1f, tween(slow, easing = MotifEasing.enter)) }
    Canvas(Modifier.fillMaxWidth().height(MotifSpace.s3).clip(RoundedCornerShape(MotifRadius.full))
        .semantics { contentDescription = label }) {
        val gap = MotifSpace.s1.toPx()
        val total = parts.sumOf { it.first.toDouble() }.toFloat()
        val free = size.width - gap * (parts.size - 1)
        var x = 0f
        parts.forEachIndexed { i, (value, color) ->
            val w = maxOf(gap, free * value / total)
            val grown = w * ((t.value - i * lag) / (1 - (parts.size - 1) * lag)).coerceIn(0f, 1f)
            drawRect(color, topLeft = Offset(if (rtl) size.width - x - grown else x, 0f), size = Size(grown, size.height))
            x += w + gap
        }
    }
}
```

Pass `lag = MotifDurations.fast / 4f / MotifDurations.slow` (0f at `calm`) and colours from `MotifTheme.colors`; leave zero parts out before calling.

### react-native

A `View` row whose parts use `flexGrow`, each an `Animated.View` growing with `scaleX` from its start edge; no `react-native-svg` needed here. Reanimated's `withDelay` gives each part its step, and `useReducedMotion()` sets the end at once.

```tsx
function Part({ value, color, index }: { value: number; color: string; index: number }) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) grow.value = withDelay(index * duration.fast / 4, withTiming(1, { duration: duration.slow, easing: easing.enter }));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  return <Animated.View style={[{ flexGrow: value, flexBasis: 0, minWidth: space.s1, backgroundColor: color,
    transformOrigin: I18nManager.isRTL ? "right" : "left" }, style]} />;
}

export function SegmentedBar({ parts, label }: { parts: { value: number; color: string }[]; label: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}
      style={{ flexDirection: "row", gap: space.s1, height: space.s3, borderRadius: radius.full, overflow: "hidden" }}>
      {parts.filter((p) => p.value > 0).map((p, i) => <Part key={i} index={i} {...p} />)}
    </View>
  );
}
```

Colours come from `useMotifTheme().colors` (`colors.brand`, `colors.brandSoft`, `colors.warning`, `colors.danger`). At `calm`, pass index 0 to every part.

### swiftui

An `HStack` of `Rectangle`s sized by share inside a `GeometryReader`, each scaled from `.leading` (which follows the layout direction) with a small delay; under `accessibilityReduceMotion`, `MotifMotion.animation` gives none and the bar is whole at once.

```swift
struct SegmentedBar: View {
    let parts: [(value: Double, color: Color)] // zeros already left out
    let label: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false

    var body: some View {
        GeometryReader { g in
            let total = parts.reduce(0) { $0 + $1.value }
            let free = g.size.width - MotifSpace.s1 * CGFloat(parts.count - 1)
            HStack(spacing: MotifSpace.s1) {
                ForEach(parts.indices, id: \.self) { i in
                    Rectangle().fill(parts[i].color)
                        .frame(width: max(MotifSpace.s1, free * parts[i].value / total))
                        .scaleEffect(x: grown ? 1 : 0, anchor: .leading)
                        .animation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)?
                            .delay(Double(i) * MotifDurations.fast / 4), value: grown)
                }
            }
        }
        .frame(height: MotifSpace.s3).clipShape(Capsule())
        .accessibilityElement().accessibilityLabel(label)
        .onAppear { grown = true }
    }
}
```

Colours from `@Environment(\.motifColors)`. Swift Charts' `BarMark(x:stacking: .normalized)` with the axes hidden draws the same bar, when the screen already uses Swift Charts.
