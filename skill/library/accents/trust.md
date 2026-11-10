# Trust accent

## Purpose

Two steady accents for the Trust style, for apps that hold people's money, health or records and need to feel reliable before anything else:

- **The arc band:** a `brand-soft` band across the top of the welcome or landing hero whose lower edge is one shallow, even arc: a calm, sheltering shape, never a wave. The headline, its line and the drawing sit on it; the page under it stays plain.
- **The seal:** a small round mark (a `brand-soft` circle with a `brand` check) that always stands beside a trust statement in words: "Encrypted end to end", "Licensed by the Central Bank", "Paid on time for 12 months". It is the proof row's mark, never a badge on its own.

Use the arc band once per screen at most; the seal can repeat along one proof row (three statements, three seals).

## Signature

**A check-mark seal.** Optional. A small round seal in `success` with a check, used the same way across the app:

- **Buttons:** none on buttons; a confirm button may lead with the check icon.
- **Cards:** the seal sits on cards that state something verified or done (paid, signed, approved), at the title's end.
- **Badges:** status badges lead with the seal's check for "done" states only.

## Fits

The Trust starting style and briefs that say reliable, clear, professional or reassuring: banking, insurance, healthcare, government services.

| Where | Accent |
|---|---|
| [Welcome](../screens/welcome.md) | the arc band behind the top quarter, holding the drawing; seals on the two or three rows of what the app does |
| [Landing hero](../screens/landing-hero.md) | the arc band behind the hero on a phone; on a desktop, the seals in the proof row under the headline |
| [Empty state](../screens/empty-state.md) | one seal above the message when the empty list is also a safe one ("No claims open · Everything is settled") |
| [Key-figure card](../cards/key-figure-card.md)'s corner | a seal in `on-brand` outline beside a status in words ("Insured · Policy active") |

## Loudness

calm. A tint and a small mark. Trust apps are judged on calm, so `brand-soft` is the band's only fill (never a full `brand` band at the top, as [character](../../knowledge/character.md) keeps deep bands for the sign-in panel or the closing band). Turning it down means the band without its arc (a plain `brand-soft` block with `radius.lg` lower corners).

## Data

- **Arc band:** none of its own; it holds the hero's content. Its height follows that content (about a quarter of a phone's screen), never a fixed slab with empty space.
- **Seal:** the statement beside it, which must be true and specific to the app (a licence, an encryption claim, a record). No statement, no seal.

Roles: `brand-soft` for the band and the seal's circle, `brand` for the check, `text-primary` and `text-secondary` for text on the band; on the key-figure card the seal is an `on-brand` outline with an `on-brand` check. Sizes: the arc dips `space.6` below the band's sides; the seal is 24 px across with a 2 px check, and the row around it at least 44 pt / 48 dp tall when it is tappable.

## States

- **Loading:** the band shows at once with skeleton lines on it; seals wait for their statements.
- **Empty:** a single seal with the reassuring empty message, and the action under it.
- **Error:** the band stays; the error and retry sit on the page under it. A seal never turns `danger`, and a statement that can't be confirmed (a check that failed to load) drops its seal rather than show it unverified.

## Motion

| Level | Arc band | Seal |
|---|---|---|
| `lively` | fades in and settles down by `space.2`, `duration.slow`, `easing.enter` | the check draws in after the circle, `duration.base` |
| `default` | fades in once, `duration.base`, `easing.enter` | the check draws in once, `duration.base` |
| `calm` | appears at once | appears drawn |
| `none` | appears at once | appears drawn |

The check's stroke is [draw-in](../motion/draw-in.md); a row of seals follows [stagger](../motion/stagger.md) only at `lively`. Trust asks for calm, predictable motion, so `calm` is its usual level.

## Accessibility

- The band and the seal's drawing are hidden from screen readers; the statement beside the seal is real text and carries the meaning.
- Text on the band is `text-primary` on `brand-soft`; check the pair in light and dark mode.
- The seal is not a button. If the statement links to proof (the licence page), the whole row is the link, at least 44 pt / 48 dp tall.
- The arc is symmetrical, so it needs no change in right to left; the seal sits at the row's start edge.
- Under reduced motion, both appear at their end state (level `none`).

## Stacks

### react-web

Inline SVG stretched behind the hero (`preserveAspectRatio="none"`); the seal is a 24 px SVG. With Motion for React, fade with `initial`/`animate` and wrap the app once in `<MotionConfig reducedMotion="user">`; otherwise use the plain-web CSS.

```tsx
import { motion } from "motion/react";
import { duration, easing } from "@/design/motion";

export function ArcBand({ children }: { children: React.ReactNode }) {
  return (
    <section className="arc-hero">
      <motion.svg className="arc-band" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.base, ease: easing.enter }}>
        <path d="M0 0 H400 V96 Q200 128 0 96 Z" fill="var(--motif-color-brand-soft)" />
      </motion.svg>
      <div className="arc-content">{children}</div>
    </section>
  );
}

export const Seal = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="var(--motif-color-brand-soft)" />
    <path d="M7 12.5 L10.5 16 L17 9" fill="none" stroke="var(--motif-color-brand)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
```

### plain-web

The same SVGs; `.arc-band` is absolutely placed behind the content, and its fade and the check's draw sit inside `prefers-reduced-motion: no-preference`.

```css
.arc-hero { position: relative; padding: var(--motif-space-8) var(--motif-space-4) var(--motif-space-12); }
.arc-band { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; }
@media (prefers-reduced-motion: no-preference) {
  .arc-band { animation: band-in var(--motif-duration-base) var(--motif-easing-enter) both; }
  .seal path { stroke-dasharray: 16; stroke-dashoffset: 16;
    animation: check-draw var(--motif-duration-base) var(--motif-easing-enter) forwards; }
}
@keyframes band-in { from { opacity: 0; } }
@keyframes check-draw { to { stroke-dashoffset: 0; } }
```

### vue

`<Transition appear>` fades the band once; its CSS classes sit inside `prefers-reduced-motion: no-preference`, so reduced motion shows it at once.

```vue
<template>
  <section class="arc-hero">
    <Transition appear name="band">
      <svg class="arc-band" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 H400 V96 Q200 128 0 96 Z" fill="var(--motif-color-brand-soft)" />
      </svg>
    </Transition>
    <div class="arc-content"><slot /></div>
  </section>
</template>
```

### svelte

Svelte's `fade` on the band and `draw` on the check; both get a zero duration when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fade, draw } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration, easing } from "$lib/design/motion";
  const t = { duration: prefersReducedMotion.current ? 0 : duration.base, easing: easing.enter };
</script>

<svg class="arc-band" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true" in:fade={t}>
  <path d="M0 0 H400 V96 Q200 128 0 96 Z" fill="var(--motif-color-brand-soft)" />
</svg>
<svg class="seal" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="12" fill="var(--motif-color-brand-soft)" />
  <path d="M7 12.5 L10.5 16 L17 9" fill="none" stroke="var(--motif-color-brand)" stroke-width="2" in:draw={t} />
</svg>
```

### angular

A standalone component with both SVGs in its template and the plain-web CSS in `styles`, inside `prefers-reduced-motion: no-preference`.

```ts
@Component({
  selector: "app-proof-row",
  template: `
    @for (claim of claims(); track claim) {
      <div class="proof">
        <svg class="seal" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="var(--motif-color-brand-soft)" />
          <path d="M7 12.5 L10.5 16 L17 9" fill="none" stroke="var(--motif-color-brand)" stroke-width="2" />
        </svg>
        <span>{{ claim }}</span>
      </div>
    }`,
})
export class ProofRow { claims = input.required<string[]>(); }
```

### flutter

The band is a `ClipPath` with a `CustomClipper` (the arc as `quadraticBezierTo`) filled with `colors.brandSoft`, faded by `TweenAnimationBuilder`; `MotifMotion.duration(context, …)` is zero under reduced motion. The seal is a small `CustomPainter`. Wrap both in `ExcludeSemantics`.

```dart
class ArcClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size s) => Path()
    ..lineTo(s.width, 0)
    ..lineTo(s.width, s.height - MotifSpace.s6)
    ..quadraticBezierTo(s.width / 2, s.height + MotifSpace.s2, 0, s.height - MotifSpace.s6)
    ..close();
  @override
  bool shouldReclip(covariant CustomClipper<Path> old) => false;
}

TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: MotifMotion.duration(context, MotifDurations.base),
  curve: MotifCurves.enter,
  builder: (context, t, child) => Opacity(opacity: t, child: child),
  child: ExcludeSemantics(child: ClipPath(clipper: ArcClipper(), child: ColoredBox(color: MotifColors.of(context).brandSoft))),
)
```

The seal's painter draws `canvas.drawCircle` in `colors.brandSoft` and the check as a stroked `Path` in `colors.brand` with `StrokeCap.round`.

### compose

A `GenericShape` for the arc, used as the band's background shape; fade it with an `Animatable`, reading `MotifMotion.reduced()` into a `val` first. `Modifier.clearAndSetSemantics {}` on the band and the seal.

```kotlin
val ArcBandShape = GenericShape { size, _ ->
    val dip = 24f
    lineTo(size.width, 0f); lineTo(size.width, size.height - dip)
    quadraticTo(size.width / 2, size.height + dip / 3, 0f, size.height - dip); close()
}

val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
val alpha = remember { Animatable(if (reduced) 1f else 0f) }
LaunchedEffect(Unit) { if (!reduced) alpha.animateTo(1f, tween(MotifDurations.base, easing = MotifEasing.enter)) }
Box(Modifier.fillMaxWidth().graphicsLayer { this.alpha = alpha.value }
    .background(colors.brandSoft, ArcBandShape).clearAndSetSemantics {})
```

The seal suits an `ImageVector` (a circle path in `colors.brandSoft`, a stroked check in `colors.brand`), as it repeats along the proof row.

### react-native

`react-native-svg` (ask before adding it) for the band and the seal, the band absolutely placed behind the hero; Reanimated fades it, and when `useReducedMotion()` is true the opacity starts at 1. Hide both with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const opacity = useSharedValue(reduced ? 1 : 0);
useEffect(() => { if (!reduced) opacity.value = withTiming(1, { duration: duration.base, easing: easing.enter }); }, []);
const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

<Animated.View style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none">
    <Path d="M0 0 H400 V96 Q200 128 0 96 Z" fill={colors.brandSoft} />
  </Svg>
</Animated.View>
```

### swiftui

An `ArcBand` `Shape` used as the hero's background, faded on appear; under `accessibilityReduceMotion`, set the value without animation.

```swift
struct ArcBand: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: .zero); p.addLine(to: CGPoint(x: r.maxX, y: 0))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - MotifSpace.s6))
        p.addQuadCurve(to: CGPoint(x: 0, y: r.maxY - MotifSpace.s6), control: CGPoint(x: r.midX, y: r.maxY + MotifSpace.s2))
        p.closeSubpath(); return p
    }
}

@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var shown = false

heroContent
    .background { ArcBand().fill(colors.brandSoft).opacity(shown ? 1 : 0).ignoresSafeArea(edges: .top).accessibilityHidden(true) }
    .onAppear { if reduceMotion { shown = true } else { withAnimation(MotifMotion.animation(MotifCurves.enter, reduceMotion: reduceMotion)) { shown = true } } }
```

The seal is a `ZStack` of `Circle().fill(colors.brandSoft)` and a check `Path` stroked in `colors.brand`, marked `.accessibilityHidden(true)`.
