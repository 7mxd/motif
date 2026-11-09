# Stat change

## Purpose

A figure with its change since the last period beside it: an arrow, the change with its sign ("+6%", "−4%", "+3"), and what it is measured against ("on October"). It tells people whether the number is moving the right way without a chart, and says so in a sign or a word as well as a colour, so it reads the same to everyone.

## Fits

Every brief, under or beside any figure that has a previous period: the [key-figure card](../cards/key-figure-card.md), each figure in a [stat row](../cards/stat-row.md), the heading of [period bars](period-bars.md). Money and large figures change in percent; small counts (invoices, runs, plants) change by the count itself ("+3 on last week"), since "+50%" of two runs says little.

## Loudness

calm. The change is in the `label` role with tabular figures, and its colour says whether the move is good: `success` when it moves the way the stat wants (sales up, overdue down), `danger` when it moves the wrong way, `text-secondary` when it is flat or the stat has no good direction. The "on October" part is always `text-secondary`. On a `brand` card the whole change is `on-brand`, its arrow and sign carrying the direction, since status colours rarely read on a `brand` fill. Never an arrow on every number of a table, and never a filled badge for each change on a calm screen.

## Data

- The current value, the previous period's value (or none), what the previous period is called ("October", "last week"), and which way is good for this stat: `up` (sales, collected), `down` (overdue, costs) or `neither` (number of clients, say).
- Percent change is (current − previous) ÷ |previous| × 100, rounded to a whole percent. A change that rounds to 0 but isn't zero shows "<1%" with its arrow; a real zero shows "No change" with a level dash and no arrow.
- Count change is current − previous, shown with its sign ("+3", "−1").
- A previous value of zero has no percent: say "New this month" (or the count change, "+4"), never "+∞%" or "+100%".
- No previous value at all (the first period): show the figure with no change.
- Write the minus as a true minus sign (−, U+2212), not a hyphen, and let the locale format the number, so "+6 %" and Arabic digits come right by themselves.
- The arrows point up and down, never on a slant, so they mean the same in right-to-left layouts and stay unmirrored.

## States

- **Loading:** a short line in `border` where the figure goes and a shorter one where the change goes.
- **Empty:** no data yet: the figure reads "–" with a next step in `text-secondary` ("Send your first invoice"); a first period has the figure and, in place of the change, "First month: changes show from December".
- **Error:** "Couldn't load" with a Retry text button (at least 44 pt / 48 dp tall) in place of the figure. When only the previous period fails, show the figure without the change.
- **Update:** when the value changes, the figure counts from its old value to the new one and the change swaps in without a fade.

## Motion

The figure uses [count-up](../motion/count-up.md). The change arrives once the figure has landed, so the eye reads the number first; the arrow itself never moves or bounces.

| Level | Figure and change |
|---|---|
| `lively` | the figure counts over `duration.slow`; the change fades in over `duration.fast` with `easing.enter` as the count ends |
| `default` | the same as `lively` |
| `calm` | the figure counts over `duration.base`; the change is there from the start |
| `none` | the final figure and the change appear at once |

## Accessibility

- The figure and its change are one element to a screen reader, read with the change in words: "Revenue $12,400, up 6% on October." Say "up", "down" or "no change": never "plus", an arrow's name or a colour.
- The direction is shown three ways (the arrow's shape, the sign and the colour), so it never rests on colour alone.
- Status text uses `success` or `danger` only where the theme's pairs say it reads at 4.5:1 on the card; where it doesn't, use the role as a small fill behind the change with its `on-success` or `on-danger` text, or keep the text `text-primary` and colour only the arrow.
- The figure counts with tabular figures, so it doesn't shift sideways. The screen reader gets the final figure from the start, never the counting.
- Under reduced motion the figure and change appear final (level `none`).

## Stacks

Every stack uses the same small rule to turn the data into what is shown; react-web gives it in TypeScript, and the native stacks write it in their own language.

### react-web

A helper works out direction, text and tone; the component shows the arrow (inline SVG), the signed change and the period, with `CountUp` from [count-up](../motion/count-up.md) for the figure.

```tsx
type Good = "up" | "down" | "neither";
export function statChange(current: number, previous: number | null, good: Good, locale?: string) {
  if (previous === null) return null;
  const dir = current > previous ? "up" : current < previous ? "down" : "flat";
  if (dir === "flat") return { dir, text: "No change", words: "no change", tone: "neutral" as const };
  if (previous === 0) return { dir, text: "New", words: "new", tone: "neutral" as const };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const shown = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(pct));
  const tiny = Math.round(pct) === 0;
  const text = `${dir === "up" ? "+" : "−"}${tiny ? "<1" : shown}%`;
  const tone = good === "neither" ? "neutral" : dir === good ? "success" : "danger";
  return { dir, text, words: `${dir} ${tiny ? "less than 1" : shown}%`, tone };
}

export function StatChange({ change, since }: { change: NonNullable<ReturnType<typeof statChange>>; since: string }) {
  return (
    <span className="change" data-tone={change.tone} aria-hidden="true">
      {change.dir !== "flat" && (
        <svg viewBox="0 0 16 16" width="16" height="16" style={{ rotate: change.dir === "down" ? "180deg" : undefined }}>
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {change.text} <span className="change-since">{since}</span>
    </span>
  );
}
```

```css
.change { display: inline-flex; align-items: center; gap: var(--motif-space-1); font-variant-numeric: tabular-nums; font-weight: var(--motif-font-label-weight); }
.change[data-tone="success"] { color: var(--motif-color-success); }
.change[data-tone="danger"] { color: var(--motif-color-danger); }
.change[data-tone="neutral"], .change-since { color: var(--motif-color-text-secondary); }
@media (prefers-reduced-motion: no-preference) {
  .change { animation: change-in var(--motif-duration-fast) var(--motif-easing-enter) var(--motif-duration-slow) both; }
}
@keyframes change-in { from { opacity: 0; } }
```

The figure and change sit in one element whose visually hidden text is the sentence in words ("Revenue $12,400, up 6% on October"); both visible parts are `aria-hidden`. At `calm`, drop the `animation`.

### plain-web

The same helper in a script, the same markup and CSS as react-web; the fade waits `var(--motif-duration-slow)`, the count's length, inside `prefers-reduced-motion: no-preference`.

```html
<p class="stat">
  <span class="visually-hidden">Revenue $12,400, up 6% on October</span>
  <span class="figure" aria-hidden="true" data-count-to="12400">$12,400</span>
  <span class="change" data-tone="success" aria-hidden="true">
    <svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    +6% <span class="change-since">on October</span>
  </span>
</p>
```

The figure counts as [count-up](../motion/count-up.md) shows (a script reading `--motif-duration-slow` gets milliseconds). For a down change, add `style="rotate: 180deg"` on the `svg`.

### vue

A `StatChange` component taking the result of the shared `statChange` helper; react-web's CSS goes in its `<style scoped>`, and the figure is `CountUp`.

```vue
<script setup lang="ts">
import type { statChange } from "@/design/charts";
defineProps<{ change: NonNullable<ReturnType<typeof statChange>>; since: string }>();
</script>

<template>
  <span class="change" :data-tone="change.tone" aria-hidden="true">
    <svg v-if="change.dir !== 'flat'" viewBox="0 0 16 16" width="16" height="16" :style="{ rotate: change.dir === 'down' ? '180deg' : undefined }">
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    {{ change.text }} <span class="change-since">{{ since }}</span>
  </span>
</template>
```

### svelte

The same component with react-web's CSS; when `prefersReducedMotion.current` is true, leave off the class that fades it in.

```svelte
<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import type { statChange } from "$lib/design/charts";
  let { change, since }: { change: NonNullable<ReturnType<typeof statChange>>; since: string } = $props();
</script>

<span class="change" class:arrive={!prefersReducedMotion.current} data-tone={change.tone} aria-hidden="true">
  {#if change.dir !== "flat"}
    <svg viewBox="0 0 16 16" width="16" height="16" style:rotate={change.dir === "down" ? "180deg" : null}>
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {/if}
  {change.text} <span class="change-since">{since}</span>
</span>
```

Put the `animation` rule on `.change.arrive`.

### angular

A standalone component that computes the change from its inputs; react-web's CSS sits in its styles inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-stat-change",
  template: `
    @if (change(); as c) {
      <span class="change" [attr.data-tone]="c.tone" aria-hidden="true">
        @if (c.dir !== 'flat') {
          <svg viewBox="0 0 16 16" width="16" height="16" [style.rotate]="c.dir === 'down' ? '180deg' : null">
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        }
        {{ c.text }} <span class="change-since">{{ since() }}</span>
      </span>
    }`,
  styleUrl: "./stat-change.css",
})
export class StatChange {
  current = input.required<number>();
  previous = input<number | null>(null);
  good = input<"up" | "down" | "neither">("up");
  since = input.required<string>();
  change = computed(() => statChange(this.current(), this.previous(), this.good()));
}
```

### flutter

A `Row` of the arrow (`Icons.arrow_upward` or `Icons.arrow_downward`), the signed change and the period, faded in by `AnimatedOpacity` once the count has run; `MotifMotion.duration(context, …)` makes both instant under reduced motion. The figure is `CountUpText`.

```dart
final colors = MotifColors.of(context);
final tone = switch (change.tone) { Tone.success => colors.success, Tone.danger => colors.danger, _ => colors.textSecondary };

Semantics(
  label: 'Revenue $figureText, ${change.words} on October',
  excludeSemantics: true,
  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    CountUpText(value: total, style: MotifText.display.copyWith(color: colors.textPrimary, fontFeatures: const [FontFeature.tabularFigures()])),
    AnimatedOpacity(
      opacity: counted ? 1 : 0,
      duration: MotifMotion.duration(context, MotifDurations.fast),
      curve: MotifCurves.enter,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (change.dir != Dir.flat) Icon(change.dir == Dir.up ? Icons.arrow_upward : Icons.arrow_downward, size: 16, color: tone),
        SizedBox(width: MotifSpace.s1),
        Text(change.text, style: MotifText.label.copyWith(color: tone, fontFeatures: const [FontFeature.tabularFigures()])),
        SizedBox(width: MotifSpace.s1),
        Text('on October', style: MotifText.label.copyWith(color: colors.textSecondary)),
      ]),
    ),
  ]),
)
```

Set `counted` to true after `MotifMotion.duration(context, MotifDurations.slow)` (a `Future.delayed` from `initState`'s first frame), or from the start at `calm`. `change` comes from the same rule as react-web's helper, written in Dart.

### compose

A `Row` of the arrow (`Icons.Rounded.ArrowUpward` or `ArrowDownward`), the change and the period, with `clearAndSetSemantics` on the whole stat giving the sentence in words; the change fades in after the count, snapped under `MotifMotion.reduced()`. The figure is `CountUpText`.

```kotlin
val colors = MotifTheme.colors
val tone = when (change.tone) { Tone.Success -> colors.success; Tone.Danger -> colors.danger; else -> colors.textSecondary }
val shown = remember { Animatable(0f) }
val reduced = MotifMotion.reduced()
val fast = MotifMotion.duration(MotifDurations.fast)
LaunchedEffect(Unit) {
    if (reduced) shown.snapTo(1f) else { delay(MotifDurations.slow.toLong()); shown.animateTo(1f, tween(fast, easing = MotifEasing.enter)) }
}
Column(Modifier.clearAndSetSemantics { contentDescription = "Revenue $figureText, ${change.words} on October" }) {
    CountUpText(total, style = MotifType.display.copy(fontFeatureSettings = "tnum"))
    Row(Modifier.graphicsLayer { alpha = shown.value }, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MotifSpace.s1)) {
        if (change.dir != Dir.Flat) Icon(if (change.dir == Dir.Up) Icons.Rounded.ArrowUpward else Icons.Rounded.ArrowDownward, null, Modifier.size(16.dp), tint = tone)
        Text(change.text, style = MotifType.label.copy(fontFeatureSettings = "tnum"), color = tone)
        Text("on October", style = MotifType.label, color = colors.textSecondary)
    }
}
```

At `calm`, snap `shown` to 1 as under reduced motion.

### react-native

A row of the arrow (a small `react-native-svg` path, or the app's `@expo/vector-icons` set), the change and the period, faded in by Reanimated after the count (`duration.slow` and `duration.fast` are milliseconds, as `withDelay` and `withTiming` take them). `react-native-svg` isn't among what Motif's React Native guide assumes: ask before adding it with `npx expo install react-native-svg`, or use the icon set the app has.

```tsx
export function StatChange({ change, since }: { change: NonNullable<ReturnType<typeof statChange>>; since: string }) {
  const { colors, type } = useMotifTheme();
  const reduced = useReducedMotion();
  const tone = change.tone === "success" ? colors.success : change.tone === "danger" ? colors.danger : colors.textSecondary;
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) shown.value = withDelay(duration.slow, withTiming(1, { duration: duration.fast, easing: easing.enter }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View importantForAccessibility="no-hide-descendants" style={[{ flexDirection: "row", alignItems: "center", gap: space.s1 }, style]}>
      {change.dir !== "flat" && (
        <Svg viewBox="0 0 16 16" width={16} height={16} style={change.dir === "down" ? { transform: [{ rotate: "180deg" }] } : undefined}>
          <Path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke={tone} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
      <Text style={[type.label, { color: tone, fontVariant: ["tabular-nums"] }]}>{change.text}</Text>
      <Text style={[type.label, { color: colors.textSecondary }]}>{since}</Text>
    </Animated.View>
  );
}
```

`statChange` is react-web's helper. The parent stat is `accessible` with `accessibilityLabel` set to the sentence in words, and shows `CountUpText` above this row.

### swiftui

An `HStack` of an SF Symbol (`arrow.up` or `arrow.down`), the signed change and the period; the figure's `Text` counts with `.contentTransition(.numericText(value:))`. Under `accessibilityReduceMotion`, `MotifMotion.animation(_:reduceMotion:)` gives no animation and both appear at once.

```swift
struct StatChange: View {
    let change: Change // dir, text, words, tone: the same rule as react-web's helper
    let since: String
    @Environment(\.motifColors) private var colors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    private var tone: Color {
        switch change.tone { case .success: colors.success; case .danger: colors.danger; case .neutral: colors.textSecondary }
    }

    var body: some View {
        HStack(spacing: MotifSpace.s1) {
            if change.dir != .flat { Image(systemName: change.dir == .up ? "arrow.up" : "arrow.down").foregroundStyle(tone) }
            Text(change.text).foregroundStyle(tone).monospacedDigit()
            Text(since).foregroundStyle(colors.textSecondary)
        }
        .motifFont(.label)
        .opacity(shown ? 1 : 0)
        .accessibilityHidden(true)
        .onAppear {
            withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.fast), reduceMotion: reduceMotion)?
                .delay(MotifDurations.slow)) { shown = true }
        }
    }
}
```

The stat around it is `.accessibilityElement(children: .ignore)` with `.accessibilityLabel("Revenue \(figure), \(change.words) \(since)")`. At `calm`, set `shown` to true without animation.
