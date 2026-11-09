# Playful accent

## Purpose

Two loud, friendly accents for the Playful style, for apps people open for fun:

- **The wavy band:** a full-width `brand` band across the top of the welcome or landing hero whose lower edge is a row of soft scallops, scattered with five to seven rounded shapes (dots, a four-pointed sparkle, a squiggle, a rounded triangle) in `on-brand` at low opacity and in `brand-soft`. The headline sits on it in `on-brand`, the main button in `on-brand` with `brand` text ([character](../../knowledge/character.md), "The brand roles").
- **The mascot:** a round character from the app's world with two dot eyes, a smile and pink cheeks, standing on a soft shadow. A pot for a plant app, a ball for a sports app, a book for a learning app; or a simple friendly blob when the app has no object of its own. It greets on the welcome, waits in empty states and cheers on success moments.

The band and the mascot can share the welcome screen (the mascot standing at the band's edge); elsewhere, one accent per screen.

## Fits

The Playful starting style and briefs that say bright, bouncy, energetic or fun: social apps, games, learning and kids' products. When the brief also says gentle, fresh or reassuring, the band turns `brand-soft` with `text-primary` on it: the colour moves into the mascot and the shapes, never a saturated block (the "playful and gentle together" row in [character](../../knowledge/character.md)).

| Where | Accent |
|---|---|
| [Welcome](../screens/welcome.md) | the wavy band behind the top third, the mascot standing on its scalloped edge |
| [Landing hero](../screens/landing-hero.md) | the wavy band behind the whole hero; on a desktop the mascot beside the headline at the same height |
| [Empty state](../screens/empty-state.md) | the mascot alone, about a fifth of the screen, looking at the action ("Nothing here yet · Add your first word") |
| [Key-figure card](../cards/key-figure-card.md)'s corner | one sparkle and two dots in `on-brand` at 20–30% opacity, top-end |
| [Success moment](../screens/success-moment.md) | the mascot with arms up, the shapes around it |

## Loudness

loud. A saturated band, scattered shapes and a face. Working screens keep only the small corner shapes and the mascot in empty states, so lists and forms stay easy to read. Turning it down means the `brand-soft` band described above, or the mascot alone.

## Data

None of its own. The band holds the hero's content; the mascot points at what to do next, and next to it sits a small card from the app ("Streak · 4 days", "Lily is thirsty · Water today"). Shapes never cover text, the button or the mascot's face.

Roles: `brand` for the band, `on-brand` for its text and its shapes (at about 25% opacity), `brand-soft` for a few shapes; the mascot's body in `brand` (or `brand-soft` on a `brand` band), its eyes and smile in `on-brand` (or `text-primary` on `brand-soft`), cheeks in `color-mix(in srgb, var(--motif-color-danger) 35%, var(--motif-color-surface))` on the web and the same mix natively; its shadow `text-primary` at about 8% opacity. Corners nearby: `radius.lg` and `radius.full`.

## States

- **Loading:** the band shows at once with its shapes still; the mascot waits until the content is ready, so it never greets a skeleton.
- **Empty:** the mascot with its message and one action; its eyes look toward the action.
- **Error:** the mascot looks puzzled (the smile becomes a small flat line), with plain words and a retry. Never a crying or scared face, and never `danger` on the mascot.

## Motion

| Level | Wavy band | Shapes | Mascot |
|---|---|---|---|
| `lively` | slides down by `space.4` and fades in, `spring.smooth` | pop in one after another from 0 to full size, `spring.bouncy`, a quarter of `duration.fast` apart | one small hop on arrival, `spring.bouncy` |
| `default` | fades in and slides down by `space.2`, `duration.slow`, `easing.enter` | fade in together | fades in, no hop |
| `calm` | appears at once | appear at once | appears at once |
| `none` | appears at once | appear at once | appears at once |

The shapes follow [stagger](../motion/stagger.md); the mascot's hop is [success](../motion/success.md)'s bounce. Playful's usual level is `lively`. Everything plays once: no bobbing, no blinking loop, no shapes drifting.

## Accessibility

- The band's shapes and the mascot are decoration and hidden from screen readers; the headline, message and the small card carry the meaning.
- `on-brand` on `brand` for the band's text and button; the shapes stay faint and away from the text so they never lower its contrast.
- The main button is generous (at least 52 px tall on a phone) and every tappable thing is at least 44 pt / 48 dp.
- In right to left, the mascot moves to the other side of the headline and looks the other way.
- Under reduced motion, everything appears at its end state (level `none`).

## Stacks

### react-web

Inline SVG behind the hero. With Motion for React, the shapes pop in with `spring.bouncy` and a delay each; wrap the app once in `<MotionConfig reducedMotion="user">`. `<MotionConfig reducedMotion="user">` stops only transforms, so also read `useReducedMotion()` and pass `initial={false}` when it is true; opacity and `pathLength` would still animate otherwise. Without it, use the plain-web CSS.

```tsx
import { motion, useReducedMotion } from "motion/react";
import { duration, spring } from "@/design/motion";

const sparkle = "M0 -10 Q2 -2 10 0 Q2 2 0 10 Q-2 2 -10 0 Q-2 -2 0 -10 Z";

export function WavyBand({ shapes }: { shapes: { x: number; y: number; kind: "dot" | "sparkle" }[] }) {
  const reduced = useReducedMotion();
  return (
    <motion.svg className="wavy-band" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true"
      initial={reduced ? false : { opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
      <path d="M0 0 H400 V176 Q375 196 350 176 T300 176 T250 176 T200 176 T150 176 T100 176 T50 176 T0 176 Z"
        fill="var(--motif-color-brand)" />
      {shapes.map((s, i) => (
        <motion.g key={i} transform={`translate(${s.x} ${s.y})`} initial={reduced ? false : { scale: 0 }} animate={{ scale: 1 }}
          transition={{ ...spring.bouncy, delay: (i * duration.fast) / 4 }}>
          {s.kind === "dot" ? <circle r="6" fill="var(--motif-color-brand-soft)" />
            : <path d={sparkle} fill="var(--motif-color-on-brand)" fillOpacity="0.25" />}
        </motion.g>
      ))}
    </motion.svg>
  );
}
```

Place the shapes by hand (a fixed list), away from the headline's area: random placement every render looks messy.

### plain-web

The same SVG; each shape gets `--i` for its delay, and the entrances sit inside `prefers-reduced-motion: no-preference`.

```css
.wavy-band .shape { transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: no-preference) {
  .wavy-band { animation: band-in var(--motif-duration-slow) var(--motif-easing-enter) both; }
  .wavy-band .shape { animation: pop var(--motif-duration-base) var(--motif-easing-enter) both;
    animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
  .mascot { animation: hop var(--motif-duration-base) var(--motif-easing-standard) 1 both; }
}
@keyframes band-in { from { opacity: 0; transform: translateY(calc(-1 * var(--motif-space-2))); } }
@keyframes pop { from { transform: scale(0); } }
@keyframes hop { 50% { transform: translateY(calc(-1 * var(--motif-space-2))); } }
```

Plain CSS has no spring; when the project has Motion's `animate()`, use it for the pop with the guide's spring instead.

### vue

The band as a component; the shapes are a `v-for` with `:style="{ '--i': i }"`, and the plain-web CSS sits in `<style scoped>` inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <svg class="wavy-band" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
    <path :d="wave" fill="var(--motif-color-brand)" />
    <g v-for="(s, i) in shapes" :key="i" class="shape" :style="{ '--i': i }" :transform="`translate(${s.x} ${s.y})`">
      <circle r="6" fill="var(--motif-color-brand-soft)" />
    </g>
  </svg>
</template>
```

With Motion for Vue in the project, `motion.g` with `:transition="{ ...spring.bouncy, delay: i * duration.fast / 4 }"` instead, and `:initial="reduced ? false : { scale: 0 }"` where `reduced` is `useReducedMotion()` from `motion-v` (its `MotionConfig` stops transforms only).

### svelte

Svelte's `scale` transition on each shape with a growing `delay`; duration zero when `prefersReducedMotion.current` is true. The mascot's hop is a `Spring` from `spring.bouncy`.

```svelte
<script>
  import { scale } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  let { shapes } = $props();
  const off = prefersReducedMotion.current;
</script>

<svg class="wavy-band" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
  <path d={wave} fill="var(--motif-color-brand)" />
  {#each shapes as s, i}
    <g transform="translate({s.x} {s.y})">
      <circle r="6" fill="var(--motif-color-brand-soft)"
        in:scale={{ duration: off ? 0 : duration.base, delay: off ? 0 : (i * duration.fast) / 4, easing: easing.enter }} />
    </g>
  {/each}
</svg>
```

### angular

A standalone component with the SVG in its template; `[style.--i]` sets each shape's delay, and the plain-web CSS sits in `styles` inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-wavy-band",
  template: `
    <svg class="wavy-band" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
      <path [attr.d]="wave" fill="var(--motif-color-brand)" />
      @for (s of shapes(); track $index) {
        <g class="shape" [style.--i]="$index" [attr.transform]="'translate(' + s.x + ' ' + s.y + ')'">
          <circle r="6" fill="var(--motif-color-brand-soft)" />
        </g>
      }
    </svg>`,
})
export class WavyBand { shapes = input.required<{ x: number; y: number }[]>(); wave = "M0 0 H400 V176 Q375 196 350 176 T300 176 T250 176 T200 176 T150 176 T100 176 T50 176 T0 176 Z"; }
```

### flutter

A `CustomPainter` draws the band (`quadraticBezierTo` scallops) and its shapes; a `TweenAnimationBuilder` slides it in with `MotifMotion.duration(context, …)`, zero under reduced motion. The mascot's hop is a `SpringSimulation` from `MotifSprings.bouncy`, skipped when `MotifMotion.reduced(context)`. Wrap both in `ExcludeSemantics`.

```dart
TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.slow),
  curve: MotifCurves.enter,
  builder: (context, t, child) => Opacity(
    opacity: t,
    child: Transform.translate(offset: Offset(0, -MotifSpace.s2 * (1 - t)), child: child),
  ),
  child: ExcludeSemantics(child: CustomPaint(size: const Size(double.infinity, 200), painter: WavyBandPainter(MotifColors.of(context)))),
)

// In paint: band = Path()..lineTo(w, 0)..lineTo(w, h - 24); then for each scallop step of w / 8 leftwards,
// ..quadraticBezierTo(x - step / 2, h - 24 + (i.isEven ? 20 : -20), x - step, h - 24); close; fill colors.brand.
// Sparkles: colors.onBrand.withValues(alpha: 0.25); dots: colors.brandSoft.
```

For the stagger at `lively`, give each shape its own `TweenAnimationBuilder` started after `MotifDurations.fast ~/ 4 * i`.

### compose

A `Canvas` for the band and shapes; one `Animatable` per shape popping with `MotifSprings.bouncy()` after its delay. Read `MotifMotion.reduced()` into a `val` and snap. `Modifier.clearAndSetSemantics {}` hides it.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val pops = remember { shapes.map { Animatable(if (reduced) 1f else 0f) } }
LaunchedEffect(Unit) {
    if (!reduced) pops.forEachIndexed { i, a -> launch { delay(i * MotifDurations.fast / 4L); a.animateTo(1f, MotifSprings.bouncy()) } }
}
Canvas(Modifier.fillMaxWidth().height(200.dp).clearAndSetSemantics {}) {
    drawPath(wavyBand(size), colors.brand)
    shapes.forEachIndexed { i, s ->
        scale(pops[i].value, pivot = s.center(size)) { drawCircle(colors.brandSoft, radius = 6.dp.toPx(), center = s.center(size)) }
    }
}
```

`wavyBand(size)` builds the scallops with `quadraticTo`. The sparkle suits an `ImageVector`, reused in the key-figure card's corner.

### react-native

`react-native-svg` (ask before adding it) for the band and the mascot; each shape is an `Animated.View` placed over it, popping with `withDelay` and `withSpring(…, spring.bouncy)`. When `useReducedMotion()` is true, start at the end state. Hide the layer with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
function Pop({ i, children }: { i: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) s.value = withDelay((i * duration.fast) / 4, withSpring(1, spring.bouncy)); }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

<View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="none">
    <Path d={wave} fill={colors.brand} />
  </Svg>
</View>
```

### swiftui

A `WavyBand` `Shape` (scallops with `addQuadCurve`) behind the hero, and each shape scaled in with `MotifSprings.bouncy` and a delay; under `accessibilityReduceMotion`, set the values without animation.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown = false

ZStack(alignment: .topLeading) {
    WavyBand().fill(colors.brand)
    ForEach(Array(shapes.enumerated()), id: \.offset) { i, s in
        Sparkle().fill(colors.onBrand.opacity(0.25)).frame(width: 20, height: 20).position(s.point)
            .scaleEffect(shown ? 1 : 0)
            .animation(MotifMotion.animation(MotifSprings.bouncy.delay(Double(i) * MotifDurations.fast / 4), reduceMotion: reduceMotion), value: shown)
    }
}
.accessibilityHidden(true)
.onAppear { shown = true }
```

`MotifMotion.animation` gives no animation under Reduce Motion, so `shown = true` lands at once there. The mascot is a `ZStack` of `Circle()`s and a smile `Path`, cheeks in `colors.danger.motifMix(colors.surface, by: 0.65, in: env)`, with the `motifMix` helper from [soft](soft.md) (iOS 18's `Color.mix` where it can, the resolved components on iOS 17).
