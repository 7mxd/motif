# Soft glow

## Purpose

Depth behind the one thing a first screen shows off: a large, blurred circle of `brand-soft` or `accent` behind the hero's drawing, or behind the product preview on a sign-in panel. It lifts that thing off the page the way light behind an object does, and draws the eye there first.

Use it on first-impression screens only: a welcome, a landing hero, a sign-in. At most one depth piece on a screen, so one per screen: a soft glow, a [tonal gradient](tonal-gradient.md) or a [pattern](pattern.md), never two. Never behind a chart, a card on a working screen or text.

## Fits

- Behind the drawing of a [welcome](../screens/welcome.md) or a [landing hero](../screens/landing-hero.md).
- Behind the layered product preview on a sign-in brand panel.
- One circle (two at most, the second smaller and in `accent-2`), about 1.2–1.6 times the drawing's width, centred a little off the drawing's middle, blurred to about a third of its own width.

## Loudness

default. At `calm` use `brand-soft` only, at about half strength; at `loud` the circle may use `accent`, with a second smaller one in `accent-2`. It never uses `brand` at full strength and never sits behind body text.

## Data

None: it is built from the design guide's colour roles (`brand-soft`, `accent`, `accent-2`, falling back to `brand-soft` when a theme has no accents), so dark mode and `motif check` hold.

## States

- **Loading:** drawn at once with the screen, before the drawing finishes loading; it never waits.
- **Empty:** with no drawing yet, leave the glow out rather than glowing behind nothing.
- **Error:** an error keeps the glow as it is; the message stays where the form is.
- **Dark mode:** smaller (about 0.8 of the light size) and deeper: the role's dark value at about 60% opacity, so it reads as a faint light, never a bright blob.

## Motion

Still by default. At `lively` it may drift a few points over a long, slow loop (20 seconds or more, `easing.standard`), which stops at once under reduced motion (`none`), where it is drawn still in its place.

## Accessibility

- Decorative: hidden from screen readers.
- Nothing readable sits on it: the headline and the form are beside it or above it, on `background` or `surface`.
- Under reduced motion it never moves.

## Stacks

### react-web

An absolutely placed, blurred circle behind the drawing, `aria-hidden`. The optional drift uses Motion; `<MotionConfig reducedMotion="user">` at the root stops it.

```tsx
<div className="relative isolate">
  <div aria-hidden="true" className="absolute -z-10 left-1/2 top-1/2 size-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
    style={{ background: "var(--motif-color-accent, var(--motif-color-brand-soft))" }} />
  <Scene className="mx-auto h-64" aria-hidden="true" />
</div>
```

### plain-web

The same circle as a `::before`; the drift runs only inside `prefers-reduced-motion: no-preference`.

```css
.hero-art { position: relative; isolation: isolate; }
.hero-art::before { content: ""; position: absolute; inset: -20%; z-index: -1; border-radius: 50%;
  background: var(--motif-color-accent, var(--motif-color-brand-soft)); filter: blur(48px); }
@media (prefers-reduced-motion: no-preference) {
  .hero-art.lively::before { animation: drift 24s var(--motif-easing-standard) infinite alternate; }
}
```

### vue

The plain-web CSS in the component's `<style scoped>`; the drift stays inside `prefers-reduced-motion: no-preference`.

```vue
<div class="hero-art"><Scene aria-hidden="true" /></div>
```

### svelte

The plain-web CSS in the component's `<style>`; add the `lively` class only when `prefersReducedMotion.current` is false.

```svelte
<div class="hero-art" class:lively={level === "lively" && !prefersReducedMotion.current}><Scene /></div>
```

### angular

The plain-web CSS in the component's stylesheet, the drift inside `prefers-reduced-motion: no-preference`.

```html
<div class="hero-art" aria-hidden="true"><app-scene /></div>
```

### flutter

A `Stack` with an `ImageFiltered` circle behind the drawing, under `ExcludeSemantics`. A drift uses `MotifMotion.duration(context, …)`, which is zero under reduce motion, so it stays still.

```dart
final colors = MotifColors.of(context);
Stack(alignment: Alignment.center, children: [
  ExcludeSemantics(child: ImageFiltered(
    imageFilter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
    child: Container(width: 260, height: 260,
        decoration: BoxDecoration(shape: BoxShape.circle, color: colors.accent)), // colors.brandSoft when the theme has no accents
  )),
  scene,
])
```

### compose

A `Box` with a blurred circle (`Modifier.blur`, Android 12 and up; below it, a radial gradient from the role to transparent) behind the drawing. Read `MotifMotion.reduced()` and skip any drift when it is true.

```kotlin
val colors = MotifTheme.colors
Box(contentAlignment = Alignment.Center) {
    Box(Modifier.size(260.dp).clearAndSetSemantics { }
        .background(Brush.radialGradient(listOf(colors.accent, Color.Transparent)), CircleShape))
    scene()
}
```

### react-native

A circle `View` behind the drawing with a large `borderRadius` and low opacity (React Native has no blur on a plain view; a radial fill from `react-native-svg` only if the app already has it; ask before adding it). Skip the drift when `useReducedMotion()` is true.

```tsx
<View style={{ alignItems: "center", justifyContent: "center" }}>
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: colors.accent, opacity: 0.6 }} />
  <Scene />
</View>
```

### swiftui

A `Circle` filled with the role and `.blur(radius:)` behind the drawing, hidden from VoiceOver. Under `accessibilityReduceMotion` it never drifts.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion

ZStack {
    Circle().fill(colors.accent).frame(width: 260, height: 260).blur(radius: 40).accessibilityHidden(true)
    Scene()
}
```
