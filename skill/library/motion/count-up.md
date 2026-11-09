# Count-up

## Purpose

A key figure counts up to its value when it first shows: "$0" runs to "$18,420" in a moment, so the number reads as freshly measured and draws the eye before the detail around it. The number on screen is always formatted the way the app formats that figure everywhere else (currency, locale, decimals), and a screen reader hears the final value from the start, never the counting.

## Fits

Every brief, sparingly: the key figure on the [key-figure card](../cards/key-figure-card.md), one or two figures in a [stat row](../cards/stat-row.md), the total on a [success moment](../screens/success-moment.md). Not prices in a list, form fields, balances people check to the cent while typing, live tickers, badge counts or small numbers ("3 plants"): a count that runs everywhere stops meaning anything.

## Loudness

default. One count per figure, on first show; a figure that is already on screen and changes moves from its old value, not from zero.

## Data

- **The value** the app already shows, and **the app's own formatter** for it: the same currency, locale, grouping and number of decimals as the rest of the app (`Intl.NumberFormat`, Flutter's `intl` `NumberFormat`, `java.text.NumberFormat`, Swift's `FormatStyle`, or the project's own helper). Never a separate format just for the animation.
- While counting, each frame shows the in-between value rounded to the figure's own precision: whole units for "$18,420", one decimal for "4.2 kg". Never more precision than the final number has.
- Counts start at 0 on first show. A later change (a payment arrives) runs from the old value to the new one over `duration.base`.
- A percentage counts its number, with the sign and the `%` where the locale puts them; in right-to-left locales the formatter places the currency sign and the digits.

## States

- **Loading:** no count: a skeleton block the width of the number, in `border`.
- **Empty:** no count: a zero figure appears as "$0" at once, with the empty state's message beside it ("No invoices yet").
- **Error:** no count: show the last known value marked as out of date, or the error and a retry. When the data arrives after a retry, the figure counts then.

## Motion

| Level | Count-up |
|---|---|
| `lively` | `duration.slow`, `easing.enter`, starting together with the card's [draw-in](draw-in.md) |
| `default` | `duration.slow`, `easing.enter` |
| `calm` | `duration.base`, `easing.enter`, only on the screen's one key figure |
| `none` | the final number, at once |

Uses the default motion `count-up`, usually beside `draw-in` on the same card. Start when the figure is on screen, once.

## Accessibility

- The final value is the figure's accessible name from the first frame (hidden text, a label or a content description). The counting text is hidden from assistive technology and never sits in a live region, so nothing announces "1,204… 5,880…".
- Use tabular figures (all digits one width), so the number doesn't jitter or push its neighbours while it counts.
- The figure keeps its contrast pair throughout (`on-brand` on the deep `brand` card).
- Under reduced motion the final number appears at once (level `none`).

## Stacks

### react-web

Motion's `animate(from, to, { onUpdate })` writing the formatted text; `useReducedMotion()` shows the final number (`<MotionConfig reducedMotion="user">` doesn't reach a hand-written `animate`).

```tsx
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { duration, easing } from "@/design/motion";

export function CountUp({ value, format }: { value: number; format: Intl.NumberFormat }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!inView || reduced) return;
    const run = animate(0, value, {
      duration: duration.slow, ease: easing.enter,
      onUpdate: (v) => { if (ref.current) ref.current.textContent = format.format(v); },
    });
    return () => run.stop();
  }, [inView, reduced, value]);
  return (
    <span className="tabular-nums">
      <span ref={ref} aria-hidden="true">{format.format(reduced ? value : 0)}</span>
      <span className="sr-only">{format.format(value)}</span>
    </span>
  );
}
```

`format` is the app's own `Intl.NumberFormat(locale, { style: "currency", currency })`.

### plain-web

`requestAnimationFrame` over the slow duration read from the theme's variable; under `prefers-reduced-motion` write the final number at once.

```html
<p class="key-figure">
  <span class="count-up" data-value="18420" aria-hidden="true"></span>
  <span class="visually-hidden">$18,420</span>
</p>
<script type="module">
  const format = new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "currency", currency: appCurrency, maximumFractionDigits: 0 });
  for (const el of document.querySelectorAll(".count-up")) {
    const to = Number(el.dataset.value);
    const ms = Number.parseFloat(getComputedStyle(el).getPropertyValue("--motif-duration-slow"));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !ms) { el.textContent = format.format(to); continue; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      el.textContent = format.format(to * (1 - (1 - t) ** 3)); // decelerating, like easing.enter
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
</script>
```

Give `.key-figure` `font-variant-numeric: tabular-nums`, and start the loop from an `IntersectionObserver` when the figure sits below the fold.

### vue

Motion's `animate` from `motion-v` into a `ref`; `useReducedMotion()` follows `prefers-reduced-motion` and shows the final number.

```vue
<script setup lang="ts">
import { animate, useInView, useReducedMotion } from "motion-v";
import { ref, watch } from "vue";
import { duration, easing } from "../design/motion";

const props = defineProps<{ value: number; format: Intl.NumberFormat }>();
const el = ref<HTMLElement>();
const inView = useInView(el, { once: true });
const reduced = useReducedMotion();
const shown = ref(reduced.value ? props.value : 0);
watch(inView, (on) => {
  if (!on || reduced.value) return void (shown.value = props.value);
  animate(0, props.value, { duration: duration.slow, ease: easing.enter, onUpdate: (v) => (shown.value = v) });
});
</script>

<template>
  <span ref="el" class="tabular-nums">
    <span aria-hidden="true">{{ format.format(shown) }}</span>
    <span class="visually-hidden">{{ format.format(value) }}</span>
  </span>
</template>
```

### svelte

A `Tween` from `svelte/motion` holding the number; when `prefersReducedMotion.current` is true, set it with no duration.

```svelte
<script lang="ts">
  import { Tween, prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";

  let { value, format }: { value: number; format: Intl.NumberFormat } = $props();
  const shown = new Tween(0, { duration: duration.slow, easing: easing.enter });
  $effect(() => { shown.set(value, prefersReducedMotion.current ? { duration: 0 } : undefined); });
</script>

<span class="tabular-nums">
  <span aria-hidden="true">{format.format(shown.current)}</span>
  <span class="visually-hidden">{format.format(value)}</span>
</span>
```

A later change tweens from the current value; pass `{ duration: duration.base }` for it.

### angular

Motion's `animate(from, to, { onUpdate })` into a signal, run from `afterNextRender`; skip it under `prefers-reduced-motion`. The template formats with the app's `currency` pipe, so `LOCALE_ID` and the currency stay the app's own.

```ts
import { animate } from "motion";
import { duration, easing } from "../design/motion";

readonly value = input.required<number>();
readonly shown = signal(0);

constructor() {
  afterNextRender(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return this.shown.set(this.value());
    animate(0, this.value(), { duration: duration.slow, ease: easing.enter, onUpdate: (v) => this.shown.set(v) });
  });
}
```

```html
<span class="tabular-nums">
  <span aria-hidden="true">{{ shown() | currency: currencyCode : "symbol" : "1.0-0" }}</span>
  <span class="visually-hidden">{{ value() | currency: currencyCode : "symbol" : "1.0-0" }}</span>
</span>
```

The roles' `duration` is in seconds here, as Motion takes it.

### flutter

`TweenAnimationBuilder<double>` building the number's `Text`; `MotifMotion.duration(context, …)` is zero under reduced motion, so the final number shows at once. `Semantics` gives the final value and hides the counting.

```dart
final format = NumberFormat.simpleCurrency(locale: Localizations.localeOf(context).toString(), decimalDigits: 0);

Semantics(
  label: format.format(total),
  excludeSemantics: true,
  child: TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: total),
    duration: MotifMotion.duration(context, MotifDurations.slow),
    curve: MotifCurves.enter,
    builder: (context, v, _) => Text(
      format.format(v),
      style: figureStyle.copyWith(color: colors.onBrand, fontFeatures: const [FontFeature.tabularFigures()]),
    ),
  ),
)
```

When `total` changes later, the builder runs from the shown value to the new one by itself. Use the app's own formatter if it has one.

### compose

An `Animatable` counting to the value, snapped under `MotifMotion.reduced()`; `clearAndSetSemantics` gives the final value as the content description.

```kotlin
val shown = remember { Animatable(0f) }
val reduced = MotifMotion.reduced()
val locale = LocalConfiguration.current.locales[0]
val format = remember(locale) { NumberFormat.getCurrencyInstance(locale).apply { maximumFractionDigits = 0 } }
LaunchedEffect(total) {
    if (reduced) shown.snapTo(total)
    else shown.animateTo(total, tween(MotifDurations.slow, easing = MotifEasing.enter))
}
Text(
    format.format(shown.value),
    color = MotifTheme.colors.onBrand,
    style = figureStyle.copy(fontFeatureSettings = "tnum"),
    modifier = Modifier.clearAndSetSemantics { contentDescription = format.format(total) },
)
```

### react-native

A Reanimated shared value with `withTiming`, its rounded value passed to the text with `runOnJS`; when `useReducedMotion()` is true, set it straight to the value.

```tsx
import { runOnJS, useAnimatedReaction, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easing } from "@/design/motif-theme";

const reduced = useReducedMotion();
const progress = useSharedValue(reduced ? value : 0);
const [text, setText] = useState(format.format(reduced ? value : 0));
const show = (v: number) => setText(format.format(v));
useAnimatedReaction(() => Math.round(progress.value), (v, prev) => { if (v !== prev) runOnJS(show)(v); });
useEffect(() => {
  progress.value = reduced ? value : withTiming(value, { duration: duration.slow, easing: easing.enter });
}, [value]);

<Text accessibilityLabel={format.format(value)} style={[styles.figure, { fontVariant: ["tabular-nums"] }]}>{text}</Text>
```

`format` is the app's own `Intl.NumberFormat` (Hermes has it); round to tenths instead of whole units for a figure with one decimal.

### swiftui

The number's `Text` with `.contentTransition(.numericText(value:))`, its value changed inside `withAnimation` on appear; under `accessibilityReduceMotion` set it without animation. The label is the final value.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors
@State private var shown = 0.0

Text(shown, format: .currency(code: currencyCode).precision(.fractionLength(0)))
    .monospacedDigit()
    .foregroundStyle(colors.onBrand)
    .contentTransition(.numericText(value: shown))
    .accessibilityLabel(Text(total, format: .currency(code: currencyCode).precision(.fractionLength(0))))
    .onAppear {
        if reduceMotion { shown = total } else { withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { shown = total } }
    }
```

`.currency(code:)` follows the person's locale by itself; the digits roll to the value rather than counting every step, which is SwiftUI's own way to count.
