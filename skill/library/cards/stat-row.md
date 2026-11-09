# Stat row

## Purpose

A row of two to four small stats a person acts on, each one tile that opens the list behind it. "Paid this month · $12,300 of $20,000" with a [progress ring](../charts/progress-ring.md), "Overdue · 4 invoices" in a status colour, "Due this week · 7". It turns the home screen's one big number into the few things to do about it.

Each tile, top to bottom:

- **Label** in `label`, `text-secondary`: "Paid this month".
- **Value** in `title`, `text-primary`, tabular figures: "$12,300". A goal adds the ring beside the value, its share in words under it ("62% of $20,000").
- **One small line of context** in `caption`: a change from [stat-change](../charts/stat-change.md) ("up 3 on last week"), or what needs doing.
- **Status only where action is needed.** A count that needs action ("Overdue · 4 invoices") gets its status colour: a small `danger` badge with `on-danger` text, or the value in `danger` where that pairs at 4.5:1 on the tile. Everything else stays neutral, so the one red tile is the one people see. When the count is zero it turns neutral ("Nothing overdue", with a `success` check), never a red zero.

## Fits

Every home screen and dashboard, under the [key-figure card](key-figure-card.md) or beside it. It is part of the calm-but-crafted floor for calm and business briefs (the ring for a goal or a share paid, the overdue count in status colour), and louder briefs keep it with tinted icon tiles on `brand-soft`.

- **Phone:** two tiles per row; three or four tiles wrap to a 2 × 2 grid (three leaves the last one full width). Never a sideways scroll: a stat off screen is a stat nobody acts on.
- **Desktop:** one row of up to four tiles side by side in a real desktop layout ([visual craft](../../knowledge/visual-craft.md)): beside the key-figure card (the two tiles stacked) or across the row under it, each tile at least about 200 px wide.
- **Native iPhone app:** the tiles are `surface` cards on the grouped background, the ring in `brand`.
- Each tile is `surface-raised` with a `border` line (or `shadow.sm`, not both), `radius.md`, `space.4` inside and `space.3` between tiles.

## Loudness

calm. Small, neutral tiles; colour appears only on the ring and on the one count that needs action.

## Data

The person's own counts, each with somewhere to go:

- per tile: a label, a value (formatted for the locale), and the destination it opens (the overdue invoices, filtered);
- for a ring: the value and its goal or whole (`paid` of `invoiced`), so the share is `value / goal`, capped at the full ring with the true figure still said in words ("125% of goal");
- for a status tile: the count and the status it is in (`danger` for overdue or late, `warning` for due soon, `info` for something new); a count of zero is neutral;
- optionally a change against the previous period.

Pick the two to four stats people act on most; a stat nobody opens goes. Don't fill a fourth tile for symmetry.

## States

- **Loading:** each tile keeps its size, with skeleton bars for its value and an empty ring in `border`; the label can show at once, since it is known.
- **Empty:** a stat with no data yet says so in place ("No payments yet") in `text-secondary`, never a dash or a red zero. When every tile is empty (a new account), the row gives way to the screen's [empty state](../screens/empty-state.md).
- **Error:** the tile that failed says "Couldn't load · Try again" in place, at the same size; the others stay. One failure never blanks the row.
- **Update:** a value counts from its old figure to the new one over `duration.base`; a status tile that drops to zero changes to its neutral look with a cross-fade.

## Motion

The tiles arrive with [stagger](../motion/stagger.md) after the key-figure card, each value runs [count-up](../motion/count-up.md), the ring fills with [draw-in](../motion/draw-in.md), and each tile answers its tap with [press](../motion/press.md).

| Level | Stat row |
|---|---|
| `lively` | tiles rise in one after another, `duration.fast` apart; values count up and rings fill over `duration.slow`; press with `spring.snappy` |
| `default` | tiles fade and rise in a quarter of `duration.fast` apart; values count up and rings fill over `duration.slow`, `easing.enter`; press with `spring.snappy` |
| `calm` | the row fades in as one (no stagger) over `duration.base`; rings fill and values count over `duration.base`; press with `spring.snappy` |
| `none` | the row is there at once, values final, rings full to their value |

## Accessibility

- Each tile is one button or link whose label says the stat in words: "Paid this month, $12,300 of $20,000, 62%. Opens paid invoices." The ring is hidden from screen readers; its share is in that label.
- Status is never colour alone: the word ("Overdue") and a count sit with the colour, and the badge pair (`danger` with `on-danger`) reaches 4.5:1.
- Every tile is at least 44 pt / 48 dp tall (they are larger anyway) and the whole tile is the target, not just its value.
- Under reduced motion the row is at its end state (level `none`).

## Stacks

### react-web

A grid of links, each a `motion.a` child of a parent that staggers; Motion for React for the entrance and press (the plain-web CSS when the project has no Motion), inside `<MotionConfig reducedMotion="user">`.

```tsx
import { motion } from "motion/react";
import { duration, easing, spring } from "@/design/motion";

const row = { show: { transition: { staggerChildren: duration.fast / 4 } } };
const tile = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: duration.fast, ease: easing.enter } } };

<motion.ul variants={row} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
  {stats.map((s) => (
    <motion.li key={s.id} variants={tile}>
      <motion.a href={s.href} aria-label={s.spoken} whileTap={{ scale: 0.97 }} transition={spring.snappy}
        className="block min-h-11 rounded-md border border-border bg-surface-raised p-4">
        <span className="font-label text-label text-text-secondary">{s.label}</span>
        <StatValue stat={s} />
      </motion.a>
    </motion.li>
  ))}
</motion.ul>
```

`StatValue` shows the value, the ring from [progress-ring](../charts/progress-ring.md) when `s.goal` is set, and a `bg-danger text-on-danger` badge when `s.status === "overdue"` and the count is above zero.

### plain-web

A `<ul>` grid of links; each tile's delay is its index, inside `prefers-reduced-motion: no-preference`.

```css
.stat-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--motif-space-3); }
@media (min-width: 64rem) { .stat-row { grid-template-columns: repeat(4, 1fr); } }
.stat { display: block; min-height: 44px; padding: var(--motif-space-4); border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface-raised); border: 1px solid var(--motif-color-border); color: var(--motif-color-text-primary); }
.stat .badge { background: var(--motif-color-danger); color: var(--motif-color-on-danger); border-radius: var(--motif-radius-full); }
@media (prefers-reduced-motion: no-preference) {
  .stat { animation: tile-in var(--motif-duration-fast) var(--motif-easing-enter) both;
    animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
  .stat:active { transform: scale(0.97); transition: transform var(--motif-duration-fast); }
}
@keyframes tile-in { from { opacity: 0; transform: translateY(var(--motif-space-2)); } }
```

Set `style="--i: 0"`, `1`, `2` on each tile; at the `calm` level drop the delay.

### vue

`<TransitionGroup appear>` with a `--i` delay per tile, the plain-web rules in a scoped style, inside `prefers-reduced-motion: no-preference`; or Motion for Vue's variants as on React when the project has it.

```vue
<TransitionGroup tag="ul" name="tile" appear class="stat-row">
  <li v-for="(s, i) in stats" :key="s.id" :style="{ '--i': i }">
    <RouterLink :to="s.to" class="stat" :aria-label="s.spoken">
      <span class="label">{{ s.label }}</span>
      <StatValue :stat="s" />
    </RouterLink>
  </li>
</TransitionGroup>
```

### svelte

`in:fly` with `delay: i * duration.fast / 4`, zero when `prefersReducedMotion.current` is true; the tiles styled with plain-web's CSS.

```svelte
<script>
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration } from "$lib/design/motion";
  let { stats } = $props();
  const still = $derived(prefersReducedMotion.current);
</script>

<ul class="stat-row">
  {#each stats as s, i (s.id)}
    <li in:fly={{ y: 8, duration: still ? 0 : duration.fast, delay: still ? 0 : i * duration.fast / 4 }}>
      <a class="stat" href={s.href} aria-label={s.spoken}><span class="label">{s.label}</span><StatValue stat={s} /></a>
    </li>
  {/each}
</ul>
```

### angular

`@for` over the stats, then Motion's `animate` with `stagger` on the tiles after render, skipped under `prefers-reduced-motion`; the press in the component's CSS.

```ts
afterNextRender(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  animate(this.host.nativeElement.querySelectorAll(".stat"), { opacity: [0, 1], y: [8, 0] },
    { duration: duration.fast, ease: easing.enter, delay: stagger(duration.fast / 4) });
});
```

The template is `<a class="stat" [routerLink]="s.link" [attr.aria-label]="s.spoken">` per tile, with the plain-web CSS.

### flutter

A `Wrap` (phone) or `Row` of `Expanded` tiles (wide), each an `InkWell` in `colors.surfaceRaised`; one `AnimationController` with an `Interval` per tile for the stagger, its duration from `MotifMotion.duration(context, …)`.

```dart
final colors = MotifColors.of(context);
final wide = MediaQuery.sizeOf(context).width >= 1024;

GridView.count(
  crossAxisCount: wide ? 4 : 2, shrinkWrap: true, mainAxisSpacing: MotifSpace.s3, crossAxisSpacing: MotifSpace.s3,
  children: [
    for (final (i, s) in stats.indexed)
      FadeTransition(
        opacity: CurvedAnimation(parent: controller, curve: Interval(i * 0.15, 0.4 + i * 0.15, curve: MotifCurves.enter)),
        child: Semantics(button: true, label: s.spoken, excludeSemantics: true,
          child: PressScale(onTap: () => open(s), child: StatTile(stat: s, colors: colors))),
      ),
  ],
)
```

`controller` runs once in `initState` over `MotifMotion.duration(context, MotifDurations.slow)`; `PressScale` is [press](../motion/press.md)'s `AnimatedScale` to 0.97. A status tile's badge is `colors.danger` with `colors.onDanger`.

### compose

A `FlowRow` (or `LazyVerticalGrid` with `GridCells.Adaptive(160.dp)`) of tiles, each `AnimatedVisibility` with a delay of `MotifDurations.fast / 4` steps, and `MotifMotion.reduced()` showing them at once.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
FlowRow(horizontalArrangement = Arrangement.spacedBy(MotifSpace.s3), verticalArrangement = Arrangement.spacedBy(MotifSpace.s3), maxItemsInEachRow = if (wide) 4 else 2) {
    stats.forEachIndexed { i, s ->
        val shown = remember { MutableTransitionState(reduced) }.apply { targetState = true }
        AnimatedVisibility(shown, Modifier.weight(1f),
            enter = fadeIn(tween(MotifDurations.fast, delayMillis = i * MotifDurations.fast / 4, easing = MotifEasing.enter))) {
            StatTile(s, onClick = { open(s) }, modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = s.spoken })
        }
    }
}
```

`StatTile` is a `Surface(onClick = …, color = colors.surfaceRaised, border = BorderStroke(1.dp, colors.border))` with [press](../motion/press.md)'s scale; its badge is `colors.danger` with `colors.onDanger`.

### react-native

A `View` with `flexDirection: "row"`, `flexWrap: "wrap"`, each tile an `Animated.View` with `entering={FadeInDown.delay(i * duration.fast / 4)}`, left out when `useReducedMotion()` is true.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();

<View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s3 }}>
  {stats.map((s, i) => (
    <Animated.View key={s.id} style={{ flexBasis: wide ? "23%" : "47%", flexGrow: 1 }}
      entering={reduced ? undefined : FadeInDown.delay(i * duration.fast / 4).duration(duration.fast)}>
      <PressScale onPress={() => open(s)} accessibilityRole="button" accessibilityLabel={s.spoken}
        style={{ minHeight: 44, padding: space.s4, borderRadius: radius.md, borderWidth: 1,
          borderColor: colors.border, backgroundColor: colors.surfaceRaised }}>
        <Text style={[type.label, { color: colors.textSecondary }]}>{s.label}</Text>
        <StatValue stat={s} />
      </PressScale>
    </Animated.View>
  ))}
</View>
```

`PressScale` is [press](../motion/press.md)'s `Pressable` with `withSpring(0.97, spring.snappy)`.

### swiftui

A `LazyVGrid` of `NavigationLink`s, two columns on iPhone and four on a regular width; each tile a `surface` card with a `.transition` delayed by its index, and no delay under `accessibilityReduceMotion`.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.horizontalSizeClass) private var sizeClass

LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MotifSpace.s3), count: sizeClass == .regular ? 4 : 2),
          spacing: MotifSpace.s3) {
    ForEach(Array(stats.enumerated()), id: \.element.id) { i, stat in
        NavigationLink(value: stat.destination) {
            StatTile(stat: stat)
                .background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.md))
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(stat.spoken)
        .opacity(shown ? 1 : 0)
        .animation(MotifMotion.animation(MotifCurves.enter.delay(Double(i) * MotifDurations.fast / 4), reduceMotion: reduceMotion), value: shown)
    }
}
.onAppear { shown = true }
```

`PressStyle` is [press](../motion/press.md)'s `ButtonStyle` with `MotifSprings.snappy`; `reduceMotion` is `@Environment(\.accessibilityReduceMotion)`. The ring is `brand`, the overdue badge `colors.danger` with `colors.onDanger`.
