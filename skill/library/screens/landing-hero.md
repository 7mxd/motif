# Landing hero

## Purpose

The first screen of a web landing page, and the story under it. In one view, without scrolling, on a phone and a desktop: a `display` headline of two short lines, one line on what the app does for them, the main action with a quiet second one, and the brand moment as loud as the brief asks. Below it the page tells as much of the story as the product needs, then ends. It is where people decide in five seconds whether the app feels like what it is ([character](../../knowledge/character.md)).

## Fits

Web landing and welcome pages on every stack that ships to the web, and the front window of a tablet or desktop app. A native phone app opens on the one-screen [welcome](welcome.md) instead. Pick the variant from the brief's personality words, one per row of character.md's dial table; when words mix rows, the gentler word sets the ground and the louder one shows in the details.

| Variant | The brief says | Ground | Brand moment beside the headline | Headline | Motion level |
|---|---|---|---|---|---|
| Calm, precise | calm, precise, quiet, professional, premium | light `background`, a short label above the headline | a realistic preview of the product on a `surface-raised` card with `shadow.md` (a [key-figure card](../cards/key-figure-card.md) with its trend line, one invoice marked Paid) | serif `display`, one word in italic or in `brand` | `calm` |
| Friendly, gentle | friendly, gentle, warm, reassuring | a `brand-soft` band | a friendly drawn scene from the app's world, rounded icon tiles under the line | `display`, warm copy | `default` |
| Playful and gentle | fun words with soft ones (gentle, fresh, cosy) | light page with a soft `brand-soft` wash, no saturated band | a carefully drawn scene with a mascot (a face on the pot), a small floating card from the app ("Monty is thirsty · Water today") | one word in `brand` | `default` |
| Energetic, bold | energetic, bold, playful, fun, adventurous | a full `brand` band, text in `on-brand` | an illustration or mascot, proof in numbers and faces | `display` in the font's heaviest weight | `lively` |

On a `brand` band the main button is `on-brand` with `brand` text (or `surface` with `text-primary`), so it stays the strongest thing on the band; the second action is an outline or a text link. A calm brief keeps its one deep `brand` area for the closing band, never a heavy block at the top.

**Desktop: a real desktop layout.** Two columns in the same centred column as the header (one max width and side padding for both): the headline column takes about half the width, the drawing or preview sits beside it at the same height, both starting on one top line. The drawing is shown whole inside its shape, never cropped by the band or covered by a card; a next-up card sits beside the headline in place of the drawing or in its own column, never over it. The top bar holds the mark, two or three destinations, the language switch on bilingual apps and at most one action; "Sign in" appears once. See [visual craft](../../knowledge/visual-craft.md) for the columns.

**Phone on the web:** a small drawing (no more than a quarter of the screen, or beside the headline), the headline, one line, then the main action straight under that line and the quiet one under it, then the next-up card, then three short rows of what it does.

**The story under the hero** follows character.md's "How much follows depends on the product":

| Product | After the hero, in order |
|---|---|
| A tool people weigh up before paying (invoicing, money, business) | what it does (three rows with icon tiles on `brand-soft`), how it works (three numbered steps), proof (a short quote with a name, or a few real numbers), a closing band with the main action again (the calm brief's one deep `brand` area), the footer |
| A simple everyday personal app (plants, habits) | one sample of its real content as proof (a plant's care card: its drawing, its name, "water every 7 days", "next: Sat", no button of its own), a closing line with the main action, the footer |
| A club or group, on a desktop | this week's runs as matching cards, how to join in three numbered steps, its kinds (pace groups, each with its colour and name), a closing band with the main action |
| A neighbourhood or community service (repairs, bookings) | how it works in three numbered steps, a short list of recent requests with status chips ("Leaking tap · Fixed"), the closing line; the main action also sits in the header |
| A catalogue people browse (trails, recipes, places) | three real items as cards with their key facts as figures and any closure notice, a numbered "How to start" row on a desktop, the closing line |

Never the same card grid four times; the page ends with one short footer line, the name said once.

## Loudness

default. It follows the variant: `calm` for the calm, precise row (one refined moment), `loud` for the energetic, bold row (a full band). It is a first-impression screen, so even the calmest brief gets its crafted moment here.

## Data

- **Copy:** the headline (two short lines, no lone word on either), one line under it, the main action's label and target. The main action is what most people come to do: "See this week's runs" for a club, "Add your first plant" for a personal app, "Report a problem" for a service; signing up is the quiet second one.
- **The preview or next-up card:** the product's own content with real-looking figures ("Next up · Sat 6:30 · Corniche · 5 km · 14 going"); for a calm money tool, one key figure with its trend ("Outstanding $18,420, up 6% this month").
- **Proof:** real numbers ("7 runs a week · 3–16 km · free to join"), a named quote, initials avatars of people going. Nothing invented to fill space: an element that answers neither "what's happening" nor "what should I do next" goes.

## States

- **Loading:** the headline, line and actions never wait for data. A live card beside them (the next run, recent requests) shows a skeleton of its final size on `surface-raised` after about 300 ms, so the hero doesn't jump when it fills.
- **Empty:** a live card with nothing to show says so in its own words ("No runs this week · See last week's") with its action, or the section is left out; the hero never shows a blank card. A personal app's sample card is fixed copy, so it is never empty.
- **Error:** the hero stays whole. The failed card shows one line and Retry inside its own frame ([empty, loading and error](../../knowledge/ux-patterns/empty-loading-error.md)); a story section whose data failed is left out rather than shown broken.

## Motion

| Level | Hero |
|---|---|
| `lively` | the label, headline, line, actions and drawing arrive by [stagger](../motion/stagger.md) (`duration.fast` steps, a small rise with `spring.smooth`); the preview's line or the drawing's route [draws in](../motion/draw-in.md); proof numbers [count up](../motion/count-up.md); the main button gives under the finger ([press](../motion/press.md)) |
| `default` | the same stagger with `easing.enter` and no settle; draw-in and count-up on the preview card; press on the main action |
| `calm` | the hero fades in as one block over `duration.base`; only the preview's trend line draws in; press stays; no stagger |
| `none` | everything shows at its end state at once |

Each story section plays its stagger once as it scrolls into view, never again on scroll back. The headline's letters, the page's background and the layout never move; no parallax.

## Accessibility

- The headline is the page's one `h1` (or the screen's header trait natively); the line under it is plain text, and headings below step down in order.
- The drawing is decoration: `aria-hidden="true"` on the web, hidden from accessibility natively. A product preview is real content: its key figure is read in words ("Outstanding 18,420 dollars, up 6 percent this month").
- Text on `brand` uses `on-brand`, on `brand-soft` uses `text-primary`; the main button keeps its own pair. Every action is at least 44 pt / 48 dp tall.
- Headlines break with `text-wrap: balance` on the web and shorter copy where a platform can't balance lines.
- Reduced motion (level `none`) shows the hero still and complete; keyboard focus runs headline, main action, second action, then the card.

## Stacks

### react-web

A CSS grid in Tailwind: one column on a phone, two from `lg`, inside the header's max width. Motion for React staggers the hero's children; `<MotionConfig reducedMotion="user">` at the root makes it instant.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

const group = { show: { transition: { staggerChildren: duration.fast / 4 } } };
const part = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: easing.enter } } };

<motion.section variants={group} initial="hidden" animate="show"
  className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
  <div>
    <motion.p variants={part} className="text-label text-text-secondary">Invoicing for studios</motion.p>
    <motion.h1 variants={part} className="font-display text-display text-balance">Get paid <em>on time</em></motion.h1>
    <motion.div variants={part} className="mt-8 flex gap-3">{primary}{secondary}</motion.div>
  </div>
  <motion.div variants={part}><KeyFigureCard /></motion.div>
</motion.section>
```

The energetic variant wraps the section in a `bg-brand text-on-brand` band; the friendly one in `bg-brand-soft`.

### plain-web

A grid that turns into two columns at `64rem`, the hero's parts staggered with an `--i` index inside `prefers-reduced-motion: no-preference`.

```css
.hero { display: grid; gap: var(--motif-space-12); max-width: 72rem; margin-inline: auto; padding: var(--motif-space-16) var(--motif-space-6); }
@media (min-width: 64rem) { .hero { grid-template-columns: 1fr 1fr; align-items: center; } }
.hero h1 { text-wrap: balance; }
.hero--bold { background: var(--motif-color-brand); color: var(--motif-color-on-brand); }
@media (prefers-reduced-motion: no-preference) {
  .hero > * > * { animation: rise var(--motif-duration-base) var(--motif-easing-enter) both;
    animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
}
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
```

Set `style="--i: 2"` on each part in reading order. The story sections get the same rule, started by an `IntersectionObserver` adding a class once.

### vue

The same grid in the template (Tailwind classes or a scoped class), with Motion for Vue's `motion-v` variants when the project has it; otherwise the CSS rule above in `<style scoped>` inside `prefers-reduced-motion: no-preference`.

```vue
<motion.section :variants="group" initial="hidden" animate="show"
  class="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
  <div>
    <motion.h1 :variants="part" class="font-display text-display text-balance">Get paid <em>on time</em></motion.h1>
    <motion.div :variants="part" class="mt-8 flex gap-3"><slot name="actions" /></motion.div>
  </div>
  <motion.div :variants="part"><KeyFigureCard /></motion.div>
</motion.section>
```

`group` and `part` are the same objects as on React, built from `~/design/motion`; `<MotionConfig reduced-motion="user">` makes them instant.

### svelte

The grid in markup, each part arriving with `in:fly` and an index delay; skip the motion when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  const enter = (i) => ({ y: prefersReducedMotion.current ? 0 : 8, delay: prefersReducedMotion.current ? 0 : (i * duration.fast) / 4,
    duration: prefersReducedMotion.current ? 0 : duration.base, easing: easing.enter });
</script>

<section class="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
  <div>
    <h1 in:fly={enter(0)} class="font-display text-display text-balance">Water on <em>time</em></h1>
    <div in:fly={enter(1)} class="mt-8 flex gap-3"><slot name="actions" /></div>
  </div>
  <div in:fly={enter(2)}><Scene /></div>
</section>
```

### angular

The grid in the component's template and CSS; the stagger is the plain-web rule in the component's styles inside `prefers-reduced-motion: no-preference`, with the index bound per part.

```html
<section class="hero" [class.hero--bold]="variant === 'bold'">
  <div>
    <h1 class="hero-title" [style.--i]="0">Run with <em>us</em></h1>
    <div class="hero-actions" [style.--i]="1"><ng-content select="[actions]" /></div>
  </div>
  <app-next-up-card [style.--i]="2" />
</section>
```

The story sections take a class from an `IntersectionObserver` set up in `afterNextRender`, once.

### flutter

For Flutter web and desktop windows. `LayoutBuilder` picks a `Row` of two `Expanded` columns from 1024 wide, a `Column` below it, inside a `ConstrainedBox` that matches the header's max width; the drawing is a `CustomPaint`. Durations go through `MotifMotion.duration(context, …)`, zero under reduced motion.

```dart
LayoutBuilder(builder: (context, c) {
  final colors = MotifColors.of(context);
  final copy = HeroCopy(headline: MotifText.display.copyWith(color: colors.onBrand));
  final art = AspectRatio(aspectRatio: 4 / 3, child: CustomPaint(painter: RunnerScene(colors)));
  return Container(
    color: colors.brand,
    padding: EdgeInsets.symmetric(horizontal: MotifSpace.s6, vertical: MotifSpace.s16),
    child: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1152),
      child: c.maxWidth >= 1024
          ? Row(children: [Expanded(child: copy), SizedBox(width: MotifSpace.s12), Expanded(child: art)])
          : Column(children: [art, SizedBox(height: MotifSpace.s8), copy]),
    )),
  );
})
```

`HeroCopy` staggers its parts with one `AnimationController` and an `Interval` per part, its duration from `MotifMotion.duration(context, MotifDurations.slow)`.

### compose

For a tablet, a desktop window or Compose for web. `BoxWithConstraints` picks a `Row` with two `Modifier.weight(1f)` columns from 840.dp; the drawing is a `Canvas`. Read `MotifMotion.reduced()` into a `val` and show the end state when it is true.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
BoxWithConstraints(Modifier.fillMaxWidth().background(colors.brandSoft).padding(MotifSpace.s6)) {
    if (maxWidth >= 840.dp) Row(Modifier.widthIn(max = 1152.dp).align(Alignment.Center),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MotifSpace.s12)) {
        HeroCopy(reduced, Modifier.weight(1f))
        PlantScene(Modifier.weight(1f).aspectRatio(4f / 3f))
    } else Column(verticalArrangement = Arrangement.spacedBy(MotifSpace.s8)) {
        PlantScene(Modifier.fillMaxWidth(0.6f).aspectRatio(4f / 3f))
        HeroCopy(reduced)
    }
}
```

Inside `HeroCopy`, each part is an `AnimatedVisibility` with a delay of `MotifDurations.fast / 4` steps, skipped when `reduced`.

### react-native

For Expo web and tablets. `useWindowDimensions()` switches `flexDirection` to `"row"` from 1024 wide; the drawing is `react-native-svg` (ask before adding it) or composed views. When `useReducedMotion()` is true, leave out the `entering` animations.

```tsx
const { width } = useWindowDimensions();
const reduced = useReducedMotion();
const { colors, type } = useMotifTheme();
const enter = (i: number) => (reduced ? undefined : FadeInDown.delay((i * duration.fast) / 4).duration(duration.base));

<View style={{ backgroundColor: colors.brand, paddingHorizontal: space.s6, paddingVertical: space.s16 }}>
  <View style={{ flexDirection: width >= 1024 ? "row" : "column", alignItems: "center", gap: space.s12, maxWidth: 1152, alignSelf: "center", width: "100%" }}>
    <Animated.View entering={enter(0)} style={{ flex: 1 }}>
      <Text accessibilityRole="header" style={[type.display, { color: colors.onBrand }]}>Run with us</Text>
    </Animated.View>
    <Animated.View entering={enter(1)} style={{ flex: 1, aspectRatio: 4 / 3 }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <RunnerScene />
    </Animated.View>
  </View>
</View>
```

### swiftui

For iPad and Mac windows. The horizontal size class picks an `HStack` (regular) or a `VStack`; `ViewThatFits` is a fallback when the copy is long. Under `accessibilityReduceMotion` the parts appear without animation.

```swift
@Environment(\.horizontalSizeClass) private var sizeClass
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors
@State private var shown = false

let layout = sizeClass == .regular ? AnyLayout(HStackLayout(spacing: MotifSpace.s12)) : AnyLayout(VStackLayout(spacing: MotifSpace.s8))
layout {
    HeroCopy(shown: shown)                       // headline in .motifFont(.display), one word in colors.brand
    PlantScene().aspectRatio(4 / 3, contentMode: .fit).accessibilityHidden(true)
}
.frame(maxWidth: 1152)
.padding(MotifSpace.s6)
.background(colors.brandSoft)
.onAppear { withAnimation(MotifMotion.animation(MotifCurves.enter, reduceMotion: reduceMotion)) { shown = true } }
```

`HeroCopy` shows each part with `MotifMotion.animation(MotifCurves.enter.delay(Double(i) * MotifDurations.fast / 4), reduceMotion: reduceMotion)`, one step per part.
