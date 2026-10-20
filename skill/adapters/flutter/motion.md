# Motion

How to use the design guide's motion roles with Flutter's animation tools, the common patterns, and how to respect the "reduce motion" setting. The motion guide ([knowledge/motion.md](../../knowledge/motion.md)) says what to animate and why; this file is how.

## The roles

`motif tokens` writes three classes of motion values, from section 4 of `DESIGN.md`:

| Class | Roles | Flutter type |
|---|---|---|
| `MotifDurations.` | `instant`, `fast`, `base`, `slow` (the guide's own names) | `Duration` |
| `MotifCurves.` | `standard`, `enter`, `exit` | `Cubic` |
| `MotifSprings.` | `snappy`, `smooth`, `bouncy` | `SpringDescription` |

Use a duration with a curve for a change between two values, and a spring for movement that follows a finger or should feel physical. Never type a `Duration(milliseconds: 300)`, a `Curves.easeIn` or a `SpringDescription`: `motif check` reports them as `raw-motion`.

Every duration goes through `MotifMotion.duration(context, …)`, which returns zero when the phone's "reduce motion" setting is on:

```dart
AnimatedContainer(
  duration: MotifMotion.duration(context, MotifDurations.base),
  curve: MotifCurves.standard,
  padding: EdgeInsets.all(expanded ? MotifSpace.s6 : MotifSpace.s4),
  child: child,
)
```

## Common patterns

**A value changing** (size, colour, opacity): an implicit animation (`AnimatedContainer`, `AnimatedOpacity`, `AnimatedAlign`, `TweenAnimationBuilder`) with `MotifDurations.fast` or `base` and `MotifCurves.standard`.

**Something entering or leaving**: `AnimatedSwitcher`, with `enter` for what arrives and `exit` for what goes:

```dart
AnimatedSwitcher(
  duration: MotifMotion.duration(context, MotifDurations.base),
  switchInCurve: MotifCurves.enter,
  switchOutCurve: MotifCurves.exit,
  child: loaded
      ? Text('Saved', key: const ValueKey('saved'), style: MotifText.label)
      : const SizedBox.shrink(key: ValueKey('empty')),
)
```

**A tap that gives**: a spring on scale, so the response follows the finger (below).

**Moving between screens**: keep the platform's own transitions. Android and iOS each animate routes in their own way, and people expect it. Don't replace them with a custom one unless `DESIGN.md` asks for it, and then use a `PageRouteBuilder` whose `transitionDuration` is `MotifMotion.duration(context, MotifDurations.slow)` and whose curve is a `CurvedAnimation` with `MotifCurves.enter`.

**Lists**: animate an item entering with `AnimatedList` or `AnimatedSwitcher`; don't stagger more than a handful of rows, or the last one arrives after people have tried to tap it.

## Springs

`MotifSprings.snappy` and the others are `SpringDescription`s, to be used with Flutter's `SpringSimulation` on an `AnimationController`. The controller has to be unbounded, so the spring may overshoot its end:

```dart
import 'package:flutter/material.dart';

import '../design/motif_theme.dart';

class SpringPress extends StatefulWidget {
  const SpringPress({super.key, required this.onTap, required this.child});

  final VoidCallback onTap;
  final Widget child;

  @override
  State<SpringPress> createState() => _SpringPressState();
}

class _SpringPressState extends State<SpringPress>
    with SingleTickerProviderStateMixin {
  late final AnimationController _scale = AnimationController.unbounded(
    vsync: this,
    value: 1,
  );

  void _springTo(double target) {
    if (MotifMotion.reduced(context)) {
      _scale.value = target;
      return;
    }
    _scale.animateWith(
      SpringSimulation(MotifSprings.snappy, _scale.value, target, _scale.velocity),
    );
  }

  @override
  void dispose() {
    _scale.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _springTo(0.96),
      onTapUp: (_) => _springTo(1),
      onTapCancel: () => _springTo(1),
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _scale,
        builder: (context, child) =>
            Transform.scale(scale: _scale.value, child: child),
        child: widget.child,
      ),
    );
  }
}
```

A drag that lets go (a sheet, a swipe to dismiss) works the same way: start the `SpringSimulation` at the position where the finger left, with the finger's velocity, so the motion carries on from it. Use `smooth` for large surfaces, `snappy` for small ones, and `bouncy` only where the guide says playful.

## Reduced motion

When the phone's setting is on, `MediaQuery.disableAnimationsOf(context)` is true. `MotifMotion.reduced(context)` reads it, and `MotifMotion.duration(context, …)` is zero then, so every animation built from a duration jumps to its end. What that leaves for you:

- **Springs and controllers you drive yourself**: check `MotifMotion.reduced(context)` and set the value, as above.
- **Looping animation** (a pulsing skeleton, a shimmer, an animated illustration) stops, and shows its still frame.
- **Movement that carries meaning** (a card that flies to the cart) becomes a fade or an instant change, with the same result.
- **Auto-playing video and Lottie** wait for a tap.

`motif check` reports `reduced-motion` when an app animates and nothing in its own code reads the setting ([checks](checks.md#reduced-motion)). `motif shot --audit` checks it on the screens as drawn, and is stricter than the web's check: on Flutter any animation that keeps running counts, not only movement ([checks](checks.md#reduced-motion-1)).

## Skeletons

A loading skeleton that pulses is a loop, so it stops when reduce motion is on:

```dart
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.width, required this.height});

  final double width;
  final double height;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: MotifDurations.slow,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MotifMotion.reduced(context)) {
      _pulse
        ..stop()
        ..value = 1;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return FadeTransition(
      opacity: Tween<double>(begin: 0.5, end: 1).animate(
        CurvedAnimation(parent: _pulse, curve: MotifCurves.standard),
      ),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: colors.border,
          borderRadius: BorderRadius.circular(MotifRadius.sm),
        ),
      ),
    );
  }
}
```

The same goes for a spinner: a `CircularProgressIndicator` never stops, so when `MotifMotion.reduced(context)` is true show a still "Loading…" label in `MotifText.body` instead.
