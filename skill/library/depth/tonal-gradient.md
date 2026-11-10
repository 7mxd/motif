# Tonal gradient

## Purpose

Depth for a brand panel or a hero band: two neighbouring shades of `brand`, one the brand itself and one mixed a little toward `surface` (lighter) or `text-primary` (deeper), running corner to corner. It reads as one colour with light falling on it, never as two colours. Depth marks what matters most on the screen ([visual craft](../../knowledge/visual-craft.md)); here that is the panel or band people see first.

Use it on first-impression screens only: a [sign-in](../screens/sign-in.md)'s brand panel, a landing hero's band, a welcome's top band. At most one depth piece on a screen, so one per screen: a tonal gradient, a [soft glow](soft-glow.md) or a [pattern](pattern.md), never two.

## Fits

- The sign-in brand panel on a desktop, behind its product preview or drawing.
- The band of a [landing hero](../screens/landing-hero.md) or a [welcome](../screens/welcome.md) for a default or energetic brief.
- Not on working screens (lists, forms, settings, dashboards), not behind body text, not as a page background. Those stay flat.

The mix: from `brand` at the top start to `brand` mixed about 12–20% toward `text-primary` at the bottom end (an energetic brief), or toward `surface` (a gentle one). Text on it stays `on-brand`; check it reads at 4.5:1 on the deeper end.

## Loudness

default. At `calm` keep the mix under 10% so it is barely there; at `loud` it may run to 25%, still within the brand's own hue.

## Data

None: it is built from the design guide's colour roles only (`brand`, `surface`, `text-primary`, `on-brand`), so dark mode, variants and `motif check` hold.

## States

- **Loading:** the gradient is drawn at once with the panel; it never waits for anything.
- **Empty:** a panel with no preview yet still shows the gradient behind the headline.
- **Error:** an error on the form never changes the panel; the message stays on the form side, in its own colours.
- **Dark mode:** the brand's dark value is the start; the mix runs toward `background` instead, deeper and narrower (about two thirds of the light mix).

## Motion

None by default: the gradient is still. It never animates its colours, and nothing on it moves under reduced motion.

## Accessibility

- Decorative: nothing about it is read out, and nothing on it depends on it.
- Text on it is `on-brand` and must read at 4.5:1 on both ends of the gradient; `motif validate` checks `on-brand` on `brand`, so keep the mix small enough that the deeper end stays close.
- It stays still under reduced motion: no drift, no shimmer.

## Stacks

### react-web

A background on the panel from Motif's variables with `color-mix()`; it is still, so `<MotionConfig reducedMotion="user">` at the root has nothing to stop here.

```tsx
<aside className="relative overflow-hidden rounded-lg p-10 text-on-brand"
  style={{ background: "linear-gradient(135deg, var(--motif-color-brand), color-mix(in oklab, var(--motif-color-brand) 84%, var(--motif-color-text-primary)))" }}>
  {preview}
</aside>
```

### plain-web

The same background in CSS; nothing moves, so there is nothing to put inside `prefers-reduced-motion`.

```css
.brand-panel {
  color: var(--motif-color-on-brand);
  background: linear-gradient(135deg, var(--motif-color-brand), color-mix(in oklab, var(--motif-color-brand) 84%, var(--motif-color-text-primary)));
}
```

### vue

A class on the panel with the plain-web CSS in the component's `<style scoped>`; it is still, so `prefers-reduced-motion` needs no rule.

```vue
<aside class="brand-panel rounded-lg p-10"><slot /></aside>
```

### svelte

A class on the panel with the plain-web CSS in the component's `<style>`; it never moves, so `prefersReducedMotion` isn't read here.

```svelte
<aside class="brand-panel"><slot /></aside>
```

### angular

The plain-web rule in the component's CSS on `:host` or the panel; still, so no `prefers-reduced-motion` rule is needed.

```css
:host .brand-panel {
  background: linear-gradient(135deg, var(--motif-color-brand), color-mix(in oklab, var(--motif-color-brand) 84%, var(--motif-color-text-primary)));
}
```

### flutter

A `DecoratedBox` with a `LinearGradient` of the brand and `Color.lerp` toward `textPrimary`; still, so no `MotifMotion.duration(context, …)` is involved.

```dart
final colors = MotifColors.of(context);
DecoratedBox(
  decoration: BoxDecoration(
    borderRadius: BorderRadius.circular(MotifRadius.lg),
    gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [colors.brand, Color.lerp(colors.brand, colors.textPrimary, 0.16)!]),
  ),
  child: preview,
)
```

### compose

`Modifier.background(Brush.linearGradient(…))` with `lerp` from `androidx.compose.ui.graphics`; still, so `MotifMotion.reduced()` has nothing to stop.

```kotlin
val colors = MotifTheme.colors
Box(Modifier.clip(RoundedCornerShape(MotifRadius.lg))
    .background(Brush.linearGradient(listOf(colors.brand, lerp(colors.brand, colors.textPrimary, 0.16f))))) { preview() }
```

### react-native

`expo-linear-gradient` when the app already has it (ask before adding it); otherwise the brand fill alone. Still, so `useReducedMotion` isn't needed.

```tsx
<LinearGradient colors={[colors.brand, mix(colors.brand, colors.textPrimary, 0.16)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
  style={{ borderRadius: radius.lg, padding: space.s10 }}>{preview}</LinearGradient>
```

`mix` is a small helper in the app's design folder that blends two `#rrggbb` theme values channel by channel.

### swiftui

The brand fill with a `LinearGradient` of `textPrimary` at a low opacity laid over it (no `Color.mix`, which needs iOS 18). Still, so `accessibilityReduceMotion` changes nothing.

```swift
@Environment(\.motifColors) private var colors

preview
    .padding(MotifSpace.s10)
    .background(colors.brand)
    .overlay(LinearGradient(colors: [.clear, colors.textPrimary.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing)
        .allowsHitTesting(false))
    .clipShape(RoundedRectangle(cornerRadius: MotifRadius.lg))
```
