# Motion

How to use the design guide's motion roles with SwiftUI's animations, the common patterns, and how to respect **Reduce Motion**. The motion guide ([knowledge/motion.md](../../knowledge/motion.md)) says what to animate and why; this file is how.

## The roles

`motif tokens` writes three enums of motion values, from section 4 of `DESIGN.md`:

| Enum | Roles | Swift type |
|---|---|---|
| `MotifDurations.` | `instant`, `fast`, `base`, `slow` (the guide's own names) | `Double`, in seconds |
| `MotifCurves.` | `standard`, `enter`, `exit` | `Animation`: the guide's curve over the `base` duration |
| `MotifSprings.` | `snappy`, `smooth`, `bouncy` | `Animation`: a spring with the guide's duration and bounce |

Use a curve for a change between two values, and a spring for movement that follows a finger or should feel physical. Never type `.easeInOut(duration: 0.3)`, `.linear`, `.timingCurve(…)`, `.spring(response: …)` or `withAnimation(.default)`: `motif check` reports them as `raw-motion`. `withAnimation { }` without an animation is SwiftUI's default curve too: always pass a role.

A curve over another of the guide's durations is the same curve at another speed: `MotifCurves.standard.speed(MotifDurations.base / MotifDurations.slow)` runs over `slow`.

SwiftUI doesn't stop animations by itself when Reduce Motion is on, so every animation goes through `MotifMotion.animation(_:reduceMotion:)`, which gives none then. Read the setting in the view:

```swift
import SwiftUI

struct ExpandingPanel<Content: View>: View {
    let expanded: Bool
    @ViewBuilder let content: Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        content
            .padding(expanded ? MotifSpace.s6 : MotifSpace.s4)
            .animation(MotifMotion.animation(MotifCurves.standard, reduceMotion: reduceMotion), value: expanded)
    }
}
```

## Common patterns

**A value changing** (size, colour, opacity, position): `.animation(_:value:)` on the view, with `MotifCurves.standard`, as above. It animates only when that value changes.

**Something entering or leaving**: an `if` with a `.transition`, and the change made in `withAnimation(`. `enter` for what arrives, `exit` for what goes; under Reduce Motion, a fade instead of movement:

```swift
import SwiftUI

struct SaveRow: View {
    @State private var saved = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: MotifSpace.s2) {
            AppButton(title: "Save") {
                withAnimation(MotifMotion.animation(MotifCurves.enter, reduceMotion: reduceMotion)) {
                    saved = true
                }
            }
            if saved {
                Text("Saved")
                    .motifFont(.label)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
    }
}
```

**A tap that gives**: a spring on scale, in the button's style, so the response follows the finger (below).

**Moving between screens**: keep `NavigationStack`'s push and the sheet's slide, which people expect. Don't replace them unless `DESIGN.md` asks for it.

**Lists**: rows added or removed inside `withAnimation(` animate in a `List` by themselves; don't stagger more than a handful of rows, or the last one arrives after people have tried to tap it.

## Springs

`MotifSprings.snappy` and the others are `Animation`s, for `withAnimation(` or `.animation(_:value:)`, through `MotifMotion.animation` like the curves. A press that gives:

```swift
import SwiftUI

struct SpringPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(MotifMotion.animation(MotifSprings.snappy, reduceMotion: reduceMotion), value: configuration.isPressed)
    }
}
```

`.buttonStyle(SpringPressStyle())` keeps the button's own name and focus; give its label a name VoiceOver can say ([components](components.md#names-and-touch-targets)).

A drag that lets go (a sheet, a swipe to dismiss) ends in `withAnimation(MotifMotion.animation(MotifSprings.smooth, reduceMotion: reduceMotion)) { offset = .zero }`, and a spring that interrupts another animation carries on from its speed. Use `smooth` for large surfaces, `snappy` for small ones, and `bouncy` only where the guide says playful.

## Reduced motion

The setting is **Reduce Motion**: in **Settings › Accessibility › Motion** on iPhone and iPad, and **System Settings › Accessibility › Display** on the Mac. A view reads it as `@Environment(\.accessibilityReduceMotion)`; code outside views reads `UIAccessibility.isReduceMotionEnabled` (on the Mac, `NSWorkspace.shared.accessibilityDisplayShouldReduceMotion`).

When it's on:

- **Animations** go through `MotifMotion.animation(…, reduceMotion:)`, which gives no animation, so the change happens at once.
- **Looping animation** (a `.repeatForever(` pulse, a shimmer, an animated illustration) isn't started: it shows its still frame.
- **Movement that carries meaning** (a card that flies to the basket) becomes a fade (`.transition(.opacity)`) or an instant change, with the same result.
- **Auto-playing video** waits for a tap.

`motif check` reports `reduced-motion` when the app animates (`withAnimation`, `.animation(`, `.repeatForever(`, a phase or keyframe animator, `.matchedGeometryEffect`) and nothing in its own code reads the setting (`accessibilityReduceMotion`, `isReduceMotionEnabled`) or uses `MotifMotion` ([checks](checks.md#reduced-motion)). One use anywhere satisfies it; `motif shot --audit` looks at each screen as drawn with the setting on, and reports what keeps moving ([checks](checks.md#reduced-motion-1)).

## Skeletons

A loading skeleton that pulses is a loop, so under Reduce Motion it stays still:

```swift
import SwiftUI

struct Skeleton: View {
    @State private var dim = false
    @Environment(\.motifColors) private var colors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RoundedRectangle(cornerRadius: MotifRadius.sm)
            .fill(colors.border)
            .opacity(dim ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                // The standard curve over the slow duration, back and forth.
                let pulse = MotifCurves.standard.speed(MotifDurations.base / MotifDurations.slow)
                withAnimation(pulse.repeatForever(autoreverses: true)) {
                    dim = true
                }
            }
    }
}
```

A spinner is different from a skeleton: a `ProgressView` keeps turning under Reduce Motion, as the system's own do, and the audit leaves it out. For content, prefer a skeleton. A spinner belongs only inside a small control, such as a button that's saving (`AppButton` in [components](components.md#every-state) keeps its title in the layout while it shows).
