# Pattern

## Purpose

A faint repeat on a brand panel: diagonal lines, dots or a single contour line, in `on-brand` at 5–8% opacity. It gives a flat brand panel texture, the way paper or fabric has texture, without adding a colour or competing with what sits on it.

Use it on first-impression screens only: a sign-in's brand panel, a landing hero's band, a welcome's top band. At most one depth piece on a screen, so one per screen: a pattern, a [tonal gradient](tonal-gradient.md) or a [soft glow](soft-glow.md), never two.

## Fits

- A sign-in brand panel for a calm or business brief, where a gradient would be too much.
- The brand band of a [landing hero](../screens/landing-hero.md) or a [welcome](../screens/welcome.md).
- Pick the motif from the app's world when one fits: a contour line for maps and routes, dots for counts and habits, diagonal lines for anything else. Never a logo repeated, never icons.

## Loudness

calm. At 5% it is barely there; 8% is the most it goes, for an energetic brief. Never on `background`, `surface` or a card.

## Data

None: drawn in `on-brand` over `brand` from the design guide, so dark mode and `motif check` hold.

## States

- **Loading:** drawn at once with the panel.
- **Empty:** a panel with nothing on it yet still shows the pattern.
- **Error:** an error never changes it.
- **Dark mode:** the same opacity, over the brand's dark value; on a dark panel 5% is usually enough.

## Motion

Still. A pattern never scrolls or shifts on its own, and under reduced motion nothing about it changes.

## Accessibility

- Decorative: hidden from screen readers.
- Text on the panel is `on-brand` and must read at 4.5:1 over the pattern's lines as well as the panel; at 8% or less it does when `on-brand` on `brand` passes.
- Under reduced motion it stays as it is.

## Stacks

### react-web

A `repeating-linear-gradient` in `on-brand` mixed toward transparent, layered over the brand; still, so `<MotionConfig reducedMotion="user">` has nothing to stop.

```tsx
<aside className="rounded-lg bg-brand p-10 text-on-brand" style={{ backgroundImage:
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--motif-color-on-brand) 6%, transparent) 0 1px, transparent 1px 14px)" }}>
  {preview}
</aside>
```

### plain-web

The same in CSS; dots are a `radial-gradient` with a `background-size`. Nothing moves, so no `prefers-reduced-motion` rule.

```css
.brand-panel.lines { background-color: var(--motif-color-brand);
  background-image: repeating-linear-gradient(135deg, color-mix(in oklab, var(--motif-color-on-brand) 6%, transparent) 0 1px, transparent 1px 14px); }
.brand-panel.dots { background-color: var(--motif-color-brand);
  background-image: radial-gradient(color-mix(in oklab, var(--motif-color-on-brand) 7%, transparent) 1.5px, transparent 1.5px);
  background-size: 16px 16px; }
```

### vue

The plain-web classes in the component's `<style scoped>`; still, so `prefers-reduced-motion` needs no rule.

```vue
<aside class="brand-panel dots rounded-lg p-10"><slot /></aside>
```

### svelte

The plain-web classes in the component's `<style>`; it never moves, so `prefersReducedMotion` isn't read here.

```svelte
<aside class="brand-panel lines"><slot /></aside>
```

### angular

The plain-web classes in the component's CSS; still, so no `prefers-reduced-motion` rule.

```html
<aside class="brand-panel lines"><ng-content /></aside>
```

### flutter

A `CustomPaint` painter drawing the lines in `onBrand` at a low alpha, behind the panel's child in `ExcludeSemantics`; still, so `MotifMotion.duration(context, …)` isn't used.

```dart
final colors = MotifColors.of(context);
CustomPaint(
  painter: DiagonalLines(color: colors.onBrand.withValues(alpha: 0.06), gap: 14),
  child: Container(color: Colors.transparent, padding: EdgeInsets.all(MotifSpace.s10), child: preview),
)
```

`DiagonalLines` draws 1-pixel lines every `gap` points across its size, clipped to it.

### compose

`Modifier.drawBehind` drawing lines in `onBrand.copy(alpha = 0.06f)` over the brand fill; still, so `MotifMotion.reduced()` changes nothing.

```kotlin
val colors = MotifTheme.colors
Box(Modifier.background(colors.brand).drawBehind {
    var x = -size.height
    while (x < size.width) { drawLine(colors.onBrand.copy(alpha = 0.06f), Offset(x, size.height), Offset(x + size.height, 0f), 1f); x += 14.dp.toPx() }
}.padding(MotifSpace.s10)) { preview() }
```

### react-native

Lines through `react-native-svg` only if the app already has it (ask before adding it); otherwise leave the pattern out and use the brand fill. Still, so `useReducedMotion` isn't read.

```tsx
<View style={{ backgroundColor: colors.brand, borderRadius: radius.lg, overflow: "hidden" }}>
  <Svg style={StyleSheet.absoluteFill} accessibilityElementsHidden>
    <Defs><Pattern id="l" width={14} height={14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <Line x1={0} y1={0} x2={0} y2={14} stroke={colors.onBrand} strokeOpacity={0.06} /></Pattern></Defs>
    <Rect width="100%" height="100%" fill="url(#l)" />
  </Svg>
  {preview}
</View>
```

### swiftui

A `Canvas` drawing the lines in `onBrand` at a low opacity behind the content, hidden from VoiceOver. Still, so `accessibilityReduceMotion` changes nothing.

```swift
@Environment(\.motifColors) private var colors

preview
    .padding(MotifSpace.s10)
    .background {
        Canvas { context, size in
            var x = -size.height
            while x < size.width {
                var line = Path(); line.move(to: CGPoint(x: x, y: size.height)); line.addLine(to: CGPoint(x: x + size.height, y: 0))
                context.stroke(line, with: .color(colors.onBrand.opacity(0.06)), lineWidth: 1); x += 14
            }
        }
        .background(colors.brand).accessibilityHidden(true)
    }
```
