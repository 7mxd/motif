# Motion

How to use the design guide's motion roles with Compose's animation API, the common patterns, and how to respect Android's **Remove animations** setting. The motion guide ([knowledge/motion.md](../../knowledge/motion.md)) says what to animate and why; this file is how.

## The roles

`motif tokens` writes three objects of motion values, from section 4 of `DESIGN.md`:

| Object | Roles | Kotlin type |
|---|---|---|
| `MotifDurations.` | `instant`, `fast`, `base`, `slow` (the guide's own names) | `Int`, in milliseconds |
| `MotifEasing.` | `standard`, `enter`, `exit` | `CubicBezierEasing` |
| `MotifSprings.` | `snappy()`, `smooth()`, `bouncy()` | `SpringSpec<T>` |

Use a duration with an easing (`tween`) for a change between two values, and a spring for movement that follows a finger or should feel physical. Never type `tween(300)`, `FastOutSlowInEasing`, a `CubicBezierEasing(…)` or `spring(dampingRatio = …)`: `motif check` reports them as `raw-motion` (a typed duration only when it isn't one of the guide's, but use the role anyway).

Every duration goes through `MotifMotion.duration(…)`, which is zero when Remove animations is on:

```kotlin
@Composable
fun ExpandingPanel(expanded: Boolean, content: @Composable () -> Unit) {
    val padding by animateDpAsState(
        targetValue = if (expanded) MotifSpace.s6 else MotifSpace.s4,
        animationSpec = tween(MotifMotion.duration(MotifDurations.base), easing = MotifEasing.standard),
        label = "padding",
    )
    Box(Modifier.padding(padding)) { content() }
}
```

`MotifMotion.duration` and `MotifMotion.reduced()` are composable: call them in the composable's body, not inside a lambda that runs later (a `NavHost` transition, a `LaunchedEffect`); read them into a `val` first.

## Common patterns

**A value changing** (size, colour, opacity, position): the `animate*AsState` functions (`animateDpAsState`, `animateColorAsState`, `animateFloatAsState`) with `MotifDurations.fast` or `base` and `MotifEasing.standard`.

**Something entering or leaving**: `AnimatedVisibility`, with `enter` for what arrives and `exit` for what goes:

```kotlin
@Composable
fun SavedNote(visible: Boolean) {
    val duration = MotifMotion.duration(MotifDurations.base)
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(duration, easing = MotifEasing.enter)) +
            expandVertically(tween(duration, easing = MotifEasing.enter)),
        exit = fadeOut(tween(duration, easing = MotifEasing.exit)) +
            shrinkVertically(tween(duration, easing = MotifEasing.exit)),
    ) {
        Text("Saved", style = MotifType.label)
    }
}
```

`AnimatedContent` and `Crossfade` swap one thing for another the same way.

**A tap that gives**: a spring on scale, so the response follows the finger (below).

**Moving between screens**: keep Navigation Compose's own transitions, which people expect. Don't replace them unless `DESIGN.md` asks for it, and then pass `enterTransition` and `exitTransition` to the `NavHost`, with a duration read before it: `val slow = MotifMotion.duration(MotifDurations.slow)`, then `enterTransition = { fadeIn(tween(slow, easing = MotifEasing.enter)) }`.

**Lists**: `Modifier.animateItem()` on a `LazyColumn`'s items animates rows that arrive, leave or move; don't stagger more than a handful of rows, or the last one arrives after people have tried to tap it.

## Springs

`MotifSprings.snappy()` and the others are `SpringSpec`s, for any `animationSpec`. Under Remove animations, use `snap()` instead, so the value jumps to its end:

```kotlin
@Composable
fun SpringPress(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = if (MotifMotion.reduced()) snap() else MotifSprings.snappy(),
        label = "press",
    )
    Box(
        modifier = modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clickable(interactionSource = interactionSource, indication = ripple(), onClick = onClick),
    ) {
        content()
    }
}
```

`SpringPress` makes its content one tappable, focusable element; give the content a name a screen reader can say ([components](components.md#names-and-touch-targets)).

A drag that lets go (a sheet, a swipe to dismiss) works the same way: animate an `Animatable` from where the finger left, with `animateTo(target, MotifSprings.smooth(), initialVelocity = velocity)`, so the motion carries on from it. Use `smooth` for large surfaces, `snappy` for small ones, and `bouncy` only where the guide says playful.

## Reduced motion

Android's setting is **Remove animations**, in the phone's accessibility settings (where depends on the phone). When it's on, the animator duration scale is 0. `MotifMotion.reduced()` reads it, and `MotifMotion.duration(…)` is zero then.

Compose reads the same scale itself: with it at 0, `animate*AsState`, `AnimatedVisibility`, a single `Animatable.animateTo` and `rememberInfiniteTransition` jump to their end. Still go through `MotifMotion.duration(…)`: it says in the code that the app respects the setting, and covers waits Compose doesn't run itself (a `delay` between the steps of a sequence). What that leaves for you:

- **A loop you drive yourself** (`while (true) { animatable.animateTo(…) }`, a `withFrameNanos` loop): it keeps jumping between its ends every frame. Check `MotifMotion.reduced()` and don't start it.
- **Looping animation** (a pulsing skeleton, a shimmer, an animated illustration) shows its still frame.
- **Movement that carries meaning** (a card that flies to the cart) becomes a fade or an instant change, with the same result.
- **Auto-playing video and Lottie** wait for a tap.

`motif check` reports `reduced-motion` when the app animates (`animate*AsState`, `AnimatedVisibility`, `AnimatedContent`, `Crossfade`, `rememberInfiniteTransition`, `updateTransition`, `Animatable`) and nothing in its own code uses `MotifMotion` or reads the setting ([checks](checks.md#reduced-motion)). `motif shot --audit` looks at each screen as drawn with the setting on, and reports what keeps moving ([checks](checks.md#reduced-motion-1)).

## Skeletons

A loading skeleton that pulses is a loop, so with Remove animations on it shows its still frame:

```kotlin
@Composable
fun Skeleton(modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    val alpha = if (MotifMotion.reduced()) {
        1f
    } else {
        val pulse = rememberInfiniteTransition(label = "skeleton")
        val value by pulse.animateFloat(
            initialValue = 0.5f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(MotifDurations.slow, easing = MotifEasing.standard),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "pulse",
        )
        value
    }
    Box(
        modifier
            .graphicsLayer { this.alpha = alpha }
            .background(colors.border, RoundedCornerShape(MotifRadius.sm)),
    )
}
```

A spinner is different from a skeleton: a `CircularProgressIndicator` stops under Remove animations and shows one frozen position, which reads as stuck. For content, prefer a skeleton. A spinner belongs only inside a small control, such as a button that's saving, and when `MotifMotion.reduced()` is true it is replaced by a still label that is still announced (`AppButton` in [components](components.md#every-state) keeps its label in the layout and in semantics).
