# Item card

## Purpose

One item in a list people choose from (a trail, a park, a plant, a trip, a run), shown as a card with a drawn thumbnail that is that item's own small scene and the labelled facts people decide by. The picture says "this one" at a glance; the facts say "is it for me?" without opening it. The whole card opens the item.

What sits on it:

- **The drawn thumbnail**, vector and drawn from the item's own data: dunes for a desert trip, a harbour for a coast walk, a ridge for a mountain trail (its outline from the trail's own height profile), the plant's pot with its leaves. Never one placeholder shape repeated down the list.
- **A small map** for anything people travel to or along (a trail, a route, a ride, a trip): the route as a line from a start dot to an end dot, in a corner of the picture or beside it, so the card shows what it looks like and where it goes.
- **The name** in `heading`, on one line.
- **The facts people decide by**, each once: in a row of figures each led by a small icon ("5.2 km · 1 h 40 · 320 m climb"), or in labelled rows ("Surface · Gravel"). More facts in order read as care; the same facts in one dense line read as clutter.
- **A status badge** when something affects the decision ("Closed", "Partly closed", "Full"), and kind tags ("Easy", "Pram-friendly") in their own marks and words.

## Fits

Lists and grids of items that are places or things with a look of their own, in any brief but a business tool's, calm ones included: a trail list without its route pictures reads as a plain text list. For playful, friendly or energetic briefs, every item in the app gets one, from the same drawing family as the welcome screen. Where the picture goes follows [character](../../knowledge/character.md#where-the-brand-is-loud):

- **Phone list:** each card keeps its drawn banner across the top (about 16:7), the status badge on the banner's corner, then the name on one line, then the figures each led by a small icon. A detail that doesn't fit (a surface type) waits for the item's own page rather than being cut off with an ellipsis.
- **Compact row** (a dense list, a sidebar, the [today's focus](todays-focus.md) card): a square of about 64 px beside the title, the facts under the title.
- **Desktop:** a grid of the same banner cards, three or four across in a real desktop layout ([visual craft](../../knowledge/visual-craft.md)), or rows with the 64 px square. It keeps the thumbnails and tags; it never turns into a plain table.
- **Never** a large picture beside a narrow text column: titles break on lone words and chips spill onto extra lines.
- The card is `surface-raised` with a `border` line (or `shadow.sm`, not both), `radius.lg`, the banner clipped to the card's top corners, `space.4` inside under the banner.

## Loudness

default. The drawing is the card's colour; everything else on it is quiet (`text-primary`, `text-secondary`, soft badges). Louder briefs draw richer scenes, quiet ones simpler shapes in fewer tints.

## Data

The item's own data, drawn and written from what the app stores:

- its name, its kind and the values that shape its scene (a trail's height profile, a trip's landscape, a plant's species), so two items never look the same;
- its route, when it has one, as a list of points, reduced to a start, an end and a simplified line for the small map;
- two to four facts people decide by, in the order they check them (length, time, climb, difficulty; who, when, where, how many seats), each with its icon and spoken label;
- its status, if any, and its kind tags; the destination it opens.

The drawing uses only the theme's roles: ground in `brand-soft`, the main shapes in `brand`, sky or water in `surface` or `info` at a soft tint, details in `on-brand`; status colours stay on the badge, never in the scene.

## States

- **Loading:** cards keep their size; the banner is a plain `surface` block and the name and facts are skeleton bars. Never a spinner per card.
- **Empty:** the list shows the [empty state](../screens/empty-state.md) with its own drawing and first action ("Save your first trail"); a filter with no matches says so and offers to clear the filter.
- **Error:** the list says what failed with "Try again", above any cards already loaded. A card whose scene data is missing still draws the scene for its kind, plainly, rather than a broken picture.
- **Closed or full:** the card stays in the list with its badge in a saturated status colour (`danger` with `on-danger` for "Closed", `warning` with `on-warning` for "Partly closed") on the banner's corner; the rest of the card is unchanged, so people still see what it is.

## Motion

The first cards on screen arrive with [stagger](../motion/stagger.md) (the first six or so; later ones appear as they scroll in, without it), each card answers its tap with [press](../motion/press.md), and the small map's route can trace itself with [draw-in](../motion/draw-in.md).

| Level | Item card |
|---|---|
| `lively` | cards rise in one after another, `duration.fast` apart; the route draws over `duration.slow`; press with `spring.snappy` |
| `default` | cards fade and rise in a quarter of `duration.fast` apart; the route draws over `duration.slow`, `easing.enter`; press with `spring.snappy` |
| `calm` | the list fades in as one (no stagger) over `duration.base`; the route is drawn already; press with `spring.snappy` |
| `none` | everything is there at once |

A list that refreshes or loads more never replays the entrance.

## Accessibility

- The card is one link or button whose label reads the item in words: "Wadi Shawka trail, closed. 5.2 kilometres, 1 hour 40, 320 metres climb, easy." The status comes first when there is one.
- The drawing and the small map are hidden from screen readers; what they show that matters (the place, the route's length) is in the label. Icons beside facts are hidden too; their words carry them.
- Status is never colour alone: the badge always has its word, and its pair reaches 4.5:1. Kind marks have their names in words.
- The whole card is the target, at least 44 pt / 48 dp tall. Under reduced motion it is at its end state (level `none`).

## Stacks

### react-web

A `motion.a` card in a grid, the scene an inline SVG component chosen by kind and shaped by the item's values; the parent staggers and the card presses (the plain-web CSS when the project has no Motion), inside `<MotionConfig reducedMotion="user">`.

```tsx
function Ridge({ profile }: { profile: number[] }) {
  const top = Math.max(...profile);
  const pts = profile.map((h, i) => `${(i / (profile.length - 1)) * 160},${70 - (h / top) * 40}`).join(" L");
  return (
    <svg viewBox="0 0 160 70" aria-hidden className="block w-full">
      <rect width="160" height="70" fill="var(--motif-color-brand-soft)" />
      <path d={`M0,70 L${pts} L160,70 Z`} fill="var(--motif-color-brand)" />
    </svg>
  );
}

<motion.a href={`/trails/${t.id}`} variants={tile} whileTap={{ scale: 0.98 }} transition={spring.snappy}
  aria-label={t.spoken} className="block overflow-hidden rounded-lg border border-border bg-surface-raised">
  <div className="relative"><Scene item={t} /><StatusBadge status={t.status} className="absolute end-2 top-2" /></div>
  <div className="p-4"><h3 className="truncate font-heading text-heading">{t.name}</h3><Facts facts={t.facts} /></div>
</motion.a>
```

`Scene` picks `Ridge`, `Dunes` or `Harbour` by `item.kind`; the grid is `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`.

### plain-web

An `<a class="item">` per card with the scene as inline SVG written from the item's data; the grid, stagger and press in CSS, the motion inside `prefers-reduced-motion: no-preference`.

```css
.items { display: grid; gap: var(--motif-space-4); grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
.item { display: block; overflow: hidden; border-radius: var(--motif-radius-lg); color: var(--motif-color-text-primary);
  background: var(--motif-color-surface-raised); border: 1px solid var(--motif-color-border); }
.item .banner { position: relative; aspect-ratio: 16 / 7; background: var(--motif-color-brand-soft); }
.item .badge { position: absolute; inset-block-start: var(--motif-space-2); inset-inline-end: var(--motif-space-2);
  background: var(--motif-color-danger); color: var(--motif-color-on-danger); border-radius: var(--motif-radius-full); }
.item .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-reduced-motion: no-preference) {
  .item { animation: tile-in var(--motif-duration-fast) var(--motif-easing-enter) both;
    animation-delay: calc(min(var(--i), 6) * var(--motif-duration-fast) / 4); }
  .item:active { transform: scale(0.98); transition: transform var(--motif-duration-fast); }
}
@keyframes tile-in { from { opacity: 0; transform: translateY(var(--motif-space-2)); } }
```

The scene's shapes take `fill="var(--motif-color-brand)"`; the SVG has `aria-hidden="true"`.

### vue

An `ItemCard` component with the scene as an SVG sub-component per kind, the list in `<TransitionGroup appear>` with a `--i` delay, the CSS inside `prefers-reduced-motion: no-preference`.

```vue
<RouterLink :to="`/trails/${item.id}`" class="item" :aria-label="item.spoken">
  <div class="banner">
    <component :is="scenes[item.kind]" :item="item" aria-hidden="true" />
    <RouteMap v-if="item.route" :points="item.route" class="map" aria-hidden="true" />
    <StatusBadge v-if="item.status" :status="item.status" class="badge" />
  </div>
  <div class="body"><h3 class="name">{{ item.name }}</h3><ItemFacts :facts="item.facts" /></div>
</RouterLink>
```

`scenes` maps `ridge`, `dunes` and `harbour` to their components; `RouteMap` is a small SVG polyline with a start dot and an end dot in `on-brand`.

### svelte

An `ItemCard` component with the scene in SVG, `in:fly` with `delay: Math.min(i, 6) * duration.fast / 4`, zero when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration } from "$lib/design/motion";
  let { item, i } = $props();
  const still = $derived(prefersReducedMotion.current);
</script>

<a class="item" href="/trails/{item.id}" aria-label={item.spoken}
  in:fly={{ y: 8, duration: still ? 0 : duration.fast, delay: still ? 0 : Math.min(i, 6) * duration.fast / 4 }}>
  <div class="banner">
    <Scene {item} />
    {#if item.status}<span class="badge">{item.status.label}</span>{/if}
  </div>
  <div class="body"><h3 class="name">{item.name}</h3><ItemFacts facts={item.facts} /></div>
</a>
```

### angular

An `app-item-card` with the scene as an SVG template per kind (`@switch (item().kind)`), the list's entrance with Motion's `animate` and `stagger` after render, skipped under `prefers-reduced-motion`.

```ts
@Component({
  selector: "app-item-card",
  template: `<a class="item" [routerLink]="['/trails', item().id]" [attr.aria-label]="item().spoken">
    <div class="banner">
      @switch (item().kind) {
        @case ("ridge") { <svg viewBox="0 0 160 70" aria-hidden="true"><path [attr.d]="ridgePath()" fill="var(--motif-color-brand)" /></svg> }
        @case ("dunes") { <app-dunes [seed]="item().id" /> }
      }
      @if (item().status; as s) { <span class="badge">{{ s.label }}</span> }
    </div>
    <div class="body"><h3 class="name">{{ item().name }}</h3><app-item-facts [facts]="item().facts" /></div>
  </a>`,
})
export class ItemCard { item = input.required<Trail>(); ridgePath = computed(() => ridge(this.item().profile)); }
```

The CSS is plain-web's, its press `:active` inside `prefers-reduced-motion: no-preference`.

### flutter

A card `InkWell` whose banner is a `CustomPaint` with a painter per kind, shaped by the item's values; the list's first items stagger from one controller with an `Interval` each, timed with `MotifMotion.duration(context, …)`.

```dart
class RidgePainter extends CustomPainter {
  RidgePainter(this.profile, this.colors);
  final List<double> profile;
  final MotifColors colors;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = colors.brandSoft);
    final top = profile.reduce(math.max);
    final path = Path()..moveTo(0, size.height);
    for (final (i, h) in profile.indexed) {
      path.lineTo(size.width * i / (profile.length - 1), size.height * (1 - 0.6 * h / top));
    }
    canvas.drawPath(path..lineTo(size.width, size.height)..close(), Paint()..color = colors.brand);
  }

  @override
  bool shouldRepaint(RidgePainter old) => old.profile != profile || old.colors != colors;
}
```

The card is `Semantics(button: true, label: item.spoken, excludeSemantics: true)` around a `Column`: an `AspectRatio(aspectRatio: 16 / 7)` holding a `Stack` of the `CustomPaint` and the badge (`PositionedDirectional(top: MotifSpace.s2, end: MotifSpace.s2)`), then the name with `maxLines: 1` and the facts. Press is [press](../motion/press.md)'s `AnimatedScale`.

### compose

A `Surface(onClick = …)` card whose banner is a `Canvas` drawing the item's scene, the badge aligned to the banner's top end, and the list's first items in `AnimatedVisibility` with stepped delays; `MotifMotion.reduced()` shows them at once.

```kotlin
val colors = MotifTheme.colors
Surface(onClick = { open(item) }, shape = RoundedCornerShape(MotifRadius.lg), color = colors.surfaceRaised,
    border = BorderStroke(1.dp, colors.border),
    modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = item.spoken }) {
    Column {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 7f)) {
            Canvas(Modifier.matchParentSize().clearAndSetSemantics { }) {
                drawRect(colors.brandSoft)
                val top = item.profile.max()
                val ridge = Path().apply {
                    moveTo(0f, size.height)
                    item.profile.forEachIndexed { i, h -> lineTo(size.width * i / (item.profile.size - 1), size.height * (1 - 0.6f * h / top)) }
                    lineTo(size.width, size.height); close()
                }
                drawPath(ridge, colors.brand)
            }
            item.status?.let { StatusBadge(it, Modifier.align(Alignment.TopEnd).padding(MotifSpace.s2)) }
        }
        Column(Modifier.padding(MotifSpace.s4)) {
            Text(item.name, style = MotifType.heading, maxLines = 1, overflow = TextOverflow.Ellipsis)
            ItemFacts(item.facts)
        }
    }
}
```

### react-native

A `Pressable` card whose banner is a `react-native-svg` scene (ask before adding it) shaped by the item, the first items with `entering={FadeInDown.delay(…)}`, left out when `useReducedMotion()` is true.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();

<Animated.View entering={reduced || index > 5 ? undefined : FadeInDown.delay(index * duration.fast / 4)}>
  <PressScale onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={item.spoken}
    style={{ borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }}>
    <View style={{ aspectRatio: 16 / 7 }} importantForAccessibility="no-hide-descendants">
      <Svg viewBox="0 0 160 70" width="100%" height="100%">
        <Rect width={160} height={70} fill={colors.brandSoft} />
        <Path d={ridgePath(item.profile)} fill={colors.brand} />
      </Svg>
      {item.status && <StatusBadge status={item.status} style={{ position: "absolute", top: space.s2, end: space.s2 }} />}
    </View>
    <View style={{ padding: space.s4 }}>
      <Text numberOfLines={1} style={[type.heading, { color: colors.textPrimary }]}>{item.name}</Text>
      <ItemFacts facts={item.facts} />
    </View>
  </PressScale>
</Animated.View>
```

### swiftui

A `NavigationLink` card whose banner is a `Shape` built from the item's values, the badge in an `.overlay(alignment: .topTrailing)`, the first rows with a delayed `.transition`; under `accessibilityReduceMotion` the delay and movement go.

```swift
struct RidgeShape: Shape {
    let profile: [Double]
    func path(in rect: CGRect) -> Path {
        let top = profile.max() ?? 1
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.maxY))
        for (i, h) in profile.enumerated() {
            p.addLine(to: CGPoint(x: rect.width * Double(i) / Double(profile.count - 1), y: rect.height * (1 - 0.6 * h / top)))
        }
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

RidgeShape(profile: trail.profile).fill(colors.brand)
    .background(colors.brandSoft)
    .aspectRatio(16 / 7, contentMode: .fit)
    .overlay(alignment: .topTrailing) { StatusBadge(trail.status).padding(MotifSpace.s2) }
    .accessibilityHidden(true)
```

Under it, the name with `.lineLimit(1)` and the facts; the whole card gets `.accessibilityElement(children: .ignore)` with `.accessibilityLabel(trail.spoken)` and [press](../motion/press.md)'s `ButtonStyle`.
