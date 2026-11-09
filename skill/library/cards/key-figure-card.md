# Key-figure card

## Purpose

The one number a person opens the app for, set large on a deep `brand` card: what is owed, what came in this month, how far they ran this week. It answers "where do I stand?" before anything else on the home screen, and its drawn [trend line](../charts/trend-line.md) answers "and which way is it going?".

What sits on it, top to bottom:

- **Label and period** in `label`, `on-brand`: "Outstanding · this month". The period is always said, so the figure is never a bare number.
- **The key figure** in `display`, `on-brand`, with tabular figures so it doesn't shift while it counts up: "$18,420".
- **Its change** in `label` beside or under it, as [stat-change](../charts/stat-change.md) draws it: "up 6% on October".
- **The trend line** under the figure across the card's width, stroked in `on-brand`, its last point marked with a small dot. No axes or grid on the card: the detail lives on the chart's own screen.
- **At most one action** ("Send reminders", "See all invoices"), drawn in `on-brand` with `brand` text (or `surface` with `text-primary`) so it stays the strongest thing on the card, as [character](../../knowledge/character.md#the-brand-roles) says for anything on a `brand` fill.

## Fits

Every home screen with a number people track; it is the heart of the calm-but-crafted floor for calm and business briefs (invoicing, money, admin), where it is the screen's one deep `brand` area. Louder briefs keep it and may let the motion go further.

- **One per home screen.** When the screen also has a [today's focus](todays-focus.md) card, only one of the two is `brand`: the key-figure card in a money or admin app, the focus card in a personal or club app.
- **Phone:** full width at the top, under the screen's title, with the [stat row](stat-row.md) under it.
- **Desktop:** the first card of a real desktop layout ([visual craft](../../knowledge/visual-craft.md)): it takes about half the row beside the stat row or a breakdown (a [segmented bar](../charts/segmented-bar.md) of invoices by age), never a full-width slab stretched across a wide window.
- **Native iPhone app:** a full `brand` slab reads loud on a native screen, so here it is a `surface` card on the system's grouped background, with the brand in its figure (`brand` text), its icon (on a `brand-soft` tile), its trend line (`brand` stroke) and its button (`action-primary`). The same holds for a React Native or Flutter app on iOS that follows the system's look. Android and the web keep the `brand` card.
- **Dark mode:** the card is the deeper `brand` the dark theme gives, and stays one card, never a band across the screen.

## Loudness

default. One deep `brand` card per screen, the loudest thing on a working screen, with everything else around it quiet (`surface-raised` cards, `text-secondary` labels, status colour only on what needs action).

## Data

The person's own figures, never a sample:

- the key figure and its unit or currency, already formatted for the locale ("$18,420", "42.5 km");
- its label and period ("Outstanding · this month");
- the series behind the trend line, oldest first, one point per period (the last 6 to 12 months, or the last 7 to 30 days), with the current period last;
- optionally the change against the previous period (value and direction) and the action's label and destination.

With fewer than two points there is no line to draw: show the figure and its label alone, and don't invent a flat line. The card's text alternative is built from the same values: "Outstanding $18,420 this month, up 6% on October".

## States

- **Loading:** the card keeps its size and its `brand` fill; the figure and the line are skeleton bars in `on-brand` at low emphasis, as the stack's motion guide shows for skeletons. No count-up or draw yet.
- **Empty:** a new person has no figure yet. The card says so in their words ("No invoices yet") with the action that starts it ("Create your first invoice"); no zero figure and no line.
- **Error:** the card keeps its place, says what failed in one line ("Couldn't load your totals") with a "Try again" action. If a figure is cached, show it with "Updated 2 h ago" instead of hiding it.
- **Update:** when the figure changes later, it counts from the old value to the new one and the line moves to its new shape over `duration.base`, without starting from zero.

## Motion

Four of the five default motions meet here: [stagger](../motion/stagger.md) brings the card in first among the home screen's cards, [count-up](../motion/count-up.md) runs the figure, [draw-in](../motion/draw-in.md) draws the trend line, and [press](../motion/press.md) answers on the action.

| Level | Key-figure card |
|---|---|
| `lively` | the card rises in first (`duration.fast`, `easing.enter`); the figure counts up over `duration.slow` while the line draws; the line's end dot settles with `spring.smooth`; the action presses with `spring.snappy` |
| `default` | the card fades and rises in first; the figure counts up and the line draws together over `duration.slow`, `easing.enter`; press with `spring.snappy` |
| `calm` | the card fades in with the rest of the screen (no stagger) over `duration.base`; the figure counts up and the line draws over `duration.base`; press with `spring.snappy` |
| `none` | the card is there at once, the figure at its value and the line drawn |

Everything plays once, on first show; a refresh never replays the entrance.

## Accessibility

- `on-brand` on `brand` reaches 4.5:1 for the label and 3:1 for the line ([character](../../knowledge/character.md#the-brand-roles) picks the brand deep enough); in the native iPhone version `brand` text on `surface` is checked the same way.
- The card reads as one group with one label: the figure, period and change in words ("Outstanding $18,420 this month, up 6% on October"). The trend line itself is hidden from screen readers; its key number is in that label.
- The count-up never reaches screen readers: they get the final value at once.
- The action is at least 44 pt / 48 dp tall and names what it does ("Send reminders", not "Go").
- Under reduced motion everything is at its end state (level `none`).

## Stacks

### react-web

A `section` with `bg-brand text-on-brand`, the trend line from [trend-line](../charts/trend-line.md) stroked in `on-brand`, and Motion for React for the entrance and the press (the plain-web CSS when the project has no Motion). Wrap the app once in `<MotionConfig reducedMotion="user">`.

```tsx
import { motion } from "motion/react";
import { duration, easing, spring } from "@/design/motion";

<motion.section aria-label={summary} className="rounded-lg bg-brand text-on-brand p-6 shadow-md"
  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
  transition={{ duration: duration.fast, ease: easing.enter }}>
  <p className="font-label text-label">Outstanding · this month</p>
  <p className="font-display text-display tabular-nums" aria-hidden><CountUp value={total} format={money} /></p>
  <TrendLine points={points} stroke="var(--motif-color-on-brand)" />
  <motion.a href="/invoices?status=overdue" whileTap={{ scale: 0.97 }} transition={spring.snappy}
    className="inline-flex min-h-11 items-center rounded-md bg-on-brand text-brand px-4">Send reminders</motion.a>
</motion.section>
```

On a desktop grid, give it `col-span-6` of twelve beside the stat row.

### plain-web

A `<section>` filled with `var(--motif-color-brand)`, the figure and label in `var(--motif-color-on-brand)`, and the trend line as an inline SVG from [trend-line](../charts/trend-line.md). The entrance and press sit inside `prefers-reduced-motion: no-preference`.

```css
.key-figure { background: var(--motif-color-brand); color: var(--motif-color-on-brand);
  border-radius: var(--motif-radius-lg); padding: var(--motif-space-6); box-shadow: var(--motif-shadow-md); }
.key-figure .figure { font-family: var(--motif-font-display-family); font-size: var(--motif-font-display-size);
  font-weight: var(--motif-font-display-weight); font-variant-numeric: tabular-nums; }
.key-figure .trend { stroke: var(--motif-color-on-brand); fill: none; }
.key-figure .action { min-height: 44px; background: var(--motif-color-on-brand); color: var(--motif-color-brand);
  border-radius: var(--motif-radius-md); padding-inline: var(--motif-space-4); }
@media (prefers-reduced-motion: no-preference) {
  .key-figure { animation: card-in var(--motif-duration-fast) var(--motif-easing-enter) both; }
  .key-figure .action:active { transform: scale(0.97); transition: transform var(--motif-duration-fast); }
}
@keyframes card-in { from { opacity: 0; transform: translateY(var(--motif-space-2)); } }
```

Put the summary sentence in `aria-label` on the section and `aria-hidden="true"` on the SVG.

### vue

A component with the same classes as react-web (or the plain-web CSS in a scoped `<style>`), Motion for Vue's `motion.section` for the entrance when the project has it, and the CSS rules inside `prefers-reduced-motion: no-preference` otherwise.

```vue
<motion.section :aria-label="summary" class="rounded-lg bg-brand text-on-brand p-6 shadow-md"
  :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }"
  :transition="{ duration: duration.fast, ease: easing.enter }">
  <p class="font-label text-label">Outstanding · this month</p>
  <CountUp :value="total" :format="money" class="font-display text-display tabular-nums" aria-hidden="true" />
  <TrendLine :points="points" stroke="var(--motif-color-on-brand)" />
  <motion.a href="/invoices?status=overdue" :while-press="{ scale: 0.97 }" :transition="spring.snappy"
    class="inline-flex min-h-11 items-center rounded-md bg-on-brand text-brand px-4">Send reminders</motion.a>
</motion.section>
```

### svelte

Svelte's own `fly` for the entrance and a `Tween` for the count-up, both skipped when `prefersReducedMotion.current` is true; the card's colours from the CSS variables.

```svelte
<script>
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration } from "$lib/design/motion";
  let { total, points, summary } = $props();
</script>

<section class="key-figure" aria-label={summary}
  in:fly={{ y: 8, duration: prefersReducedMotion.current ? 0 : duration.fast }}>
  <p class="label">Outstanding · this month</p>
  <CountUp value={total} class="figure" aria-hidden="true" />
  <TrendLine {points} stroke="var(--motif-color-on-brand)" />
  <a class="action" href="/invoices?status=overdue">Send reminders</a>
</section>
```

The styles are plain-web's, in the component's `<style>`.

### angular

A standalone component whose host is the card; the colours in its CSS from the variables, the entrance and count-up with Motion's `animate` in `afterNextRender`, skipped under `prefers-reduced-motion`.

```ts
@Component({
  selector: "app-key-figure",
  host: { class: "key-figure", "[attr.aria-label]": "summary()" },
  template: `<p class="label">Outstanding · this month</p>
    <p class="figure" aria-hidden="true">{{ shown() | currency }}</p>
    <app-trend-line [points]="points()" stroke="var(--motif-color-on-brand)" aria-hidden="true" />
    <a class="action" routerLink="/invoices" [queryParams]="{ status: 'overdue' }">Send reminders</a>`,
})
export class KeyFigureCard {
  total = input.required<number>(); points = input.required<number[]>(); summary = input.required<string>();
  shown = signal(0);
  constructor() {
    afterNextRender(() => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return this.shown.set(this.total());
      animate(0, this.total(), { duration: duration.slow, ease: easing.enter, onUpdate: (v) => this.shown.set(v) });
    });
  }
}
```

The press is `:active { transform: scale(0.97) }` in the component's CSS, inside `prefers-reduced-motion: no-preference`.

### flutter

A `Container` in `colors.brand` with `MotifText` in `colors.onBrand`, the trend line's `CustomPainter` from [trend-line](../charts/trend-line.md), and `Semantics` holding the summary. On iOS, the `surface` version.

```dart
final colors = MotifColors.of(context);
final ios = Theme.of(context).platform == TargetPlatform.iOS;
final fill = ios ? colors.surface : colors.brand;
final ink = ios ? colors.brand : colors.onBrand;

Semantics(
  container: true,
  label: summary,
  child: Container(
    padding: const EdgeInsets.all(MotifSpace.s6),
    decoration: BoxDecoration(color: fill, borderRadius: BorderRadius.circular(MotifRadius.lg)),
    child: ExcludeSemantics(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Outstanding · this month', style: MotifText.label.copyWith(color: ink)),
      CountUpText(value: total, style: MotifText.display.copyWith(color: ink, fontFeatures: const [FontFeature.tabularFigures()])),
      SizedBox(height: 48, child: TrendLine(points: points, color: ink)),
    ])),
  ),
)
```

The count-up and draw-in take `MotifMotion.duration(context, MotifDurations.slow)`, zero under reduced motion. The action is a `FilledButton` styled `onBrand` with `brand` text on the brand card, the theme's `FilledButton` on iOS.

### compose

A `Surface` in `MotifTheme.colors.brand` with `contentColor = onBrand`; the trend line's `Canvas` from [trend-line](../charts/trend-line.md); `semantics(mergeDescendants = true)` with the summary.

```kotlin
val colors = MotifTheme.colors
Surface(
    color = colors.brand,
    contentColor = colors.onBrand,
    shape = RoundedCornerShape(MotifRadius.lg),
    modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = summary },
) {
    Column(Modifier.padding(MotifSpace.s6)) {
        Text("Outstanding · this month", style = MotifType.label)
        CountUpText(total, style = MotifType.display.copy(fontFeatureSettings = "tnum"))
        TrendLine(points, color = colors.onBrand, modifier = Modifier.fillMaxWidth().height(48.dp).clearAndSetSemantics { })
        PressButton(onClick = onRemind, containerColor = colors.onBrand, contentColor = colors.brand) { Text("Send reminders") }
    }
}
```

`PressButton` is [press](../motion/press.md)'s scale from `collectIsPressedAsState()`, with `snap()` when `MotifMotion.reduced()` is true.

### react-native

A `View` in `colors.brand` with `type.display` text in `colors.onBrand`, the trend line from `react-native-svg` (ask before adding it) as [trend-line](../charts/trend-line.md) draws it, and the summary as the card's `accessibilityLabel`. On iOS, the `surface` version.

```tsx
const { colors } = useMotifTheme();
const ios = Platform.OS === "ios";
const ink = ios ? colors.brand : colors.onBrand;

<Animated.View entering={reduced ? undefined : FadeInDown.duration(duration.fast)}
  accessible accessibilityLabel={summary}
  style={{ backgroundColor: ios ? colors.surface : colors.brand, borderRadius: radius.lg, padding: space.s6 }}>
  <Text style={[type.label, { color: ink }]}>Outstanding · this month</Text>
  <CountUpText value={total} style={[type.display, { color: ink, fontVariant: ["tabular-nums"] }]} />
  <TrendLine points={points} stroke={ink} />
</Animated.View>
```

`reduced` is `useReducedMotion()`; the count-up and draw-in set their values at once when it is true. The action is [press](../motion/press.md)'s `Pressable` with `withSpring(0.97, spring.snappy)`, at least 44 tall.

### swiftui

The native iPhone version: a `surface` card on the grouped background, the brand in the figure, the icon tile and the line, the button the guide's `action-primary` one. On macOS or iPad, where the screen is a dashboard, the card may take `colors.brand` with `colors.onBrand`.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion

VStack(alignment: .leading, spacing: MotifSpace.s2) {
    Label("Outstanding · this month", systemImage: "doc.text")
        .motifFont(.label).foregroundStyle(colors.textSecondary)
    Text(total, format: .currency(code: currency))
        .motifFont(.display).monospacedDigit().foregroundStyle(colors.brand)
        .contentTransition(.numericText())
    TrendShape(points: points).trim(from: 0, to: progress)
        .stroke(colors.brand, style: StrokeStyle(lineWidth: 2, lineCap: .round)).frame(height: 48)
}
.padding(MotifSpace.s6)
.background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.lg))
.accessibilityElement(children: .ignore)
.accessibilityLabel(summary)
.onAppear {
    withAnimation(MotifMotion.animation(MotifCurves.enter(over: MotifDurations.slow), reduceMotion: reduceMotion)) { progress = 1 }
}
```

The button under it uses [press](../motion/press.md)'s `ButtonStyle`; under `accessibilityReduceMotion` the line is drawn and the figure final at once.
