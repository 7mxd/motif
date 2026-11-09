# Success moment

## Purpose

What people see right after a key action works: the invoice sent, the run joined, the plant watered, the booking paid. The app confirms it in their own words ("Invoice INV-1042 sent to Dana"), plays the [success](../motion/success.md) motion once, and says what happens next ("We'll remind her on 12 Nov if it's still unpaid"), with the one next action that makes sense. It closes the loop, so nobody wonders whether it worked, and it is one of the brand's first-impression moments ([character](../../knowledge/character.md)).

## Fits

Every brief and stack, after the actions that matter: the first item added in onboarding, a payment, a booking, a sign-up, a task that finishes a list. Not after routine saves: settings and edits confirm quietly with a toast or nothing. Pick the smallest size that fits the action:

| Size | When | What shows |
|---|---|---|
| Inline | a routine action on a row: water a plant, mark a task done, "I'm going" | the row's own control turns: the check-off circle fills in `success` with its check, the label changes ("Going ✓", same shape and width), the row's line updates ("Next: in 7 days"). A toast with Undo when the row leaves the list |
| Toast | an action whose result lives elsewhere: an invoice sent, a reminder set | a short line at the bottom with one action ("Invoice INV-1042 sent to Dana · View"), up for at least 5 s, Undo when the action can be undone |
| Confirmation | a big, paid or final action: a payment, a booking, an order, finishing onboarding | a screen (or a sheet on a phone): the check on a `success` disc, a `title` saying what happened ("You're booked"), the key facts in labelled rows (what, when, where, amount, reference), what happens next in one line, the main next action ("Add to calendar") and a quiet "Done" |

**The confirmation's layout:** on a phone, the check and title near the top third, the facts in one `surface` card at full width, the next line under it, the actions pinned at the bottom within thumb reach. On a desktop, a centred card about 560 px wide on `background`, or a two-column layout with the facts beside the next steps, never a phone column stretched across the window. The facts are the receipt: "Sat 2 Nov · 06:30 · Corniche · 5 km", "Paid $1,240 · Ref 8F2K".

**By loudness:** calm briefs show the check and the words only. Friendly and playful briefs let the illustration react (the plant's pot smiles, two drawn water drops land). Energetic briefs add a short burst of three to five small drawn shapes in `brand` and `brand-soft` around the check, once. Never confetti over content, never on a routine save, never a full-screen takeover for a row's action.

## Loudness

default. A real moment for the actions that matter, quiet for routine ones; the burst and the illustration's reaction come only with playful and energetic briefs.

## Data

- **What happened, in the user's words:** the item ("Invoice INV-1042"), the person or place ("to Dana", "at Corniche"), the result ("sent", "booked", "paid").
- **The facts that make it a receipt:** date and time, place, amount, reference code; only what this action has.
- **What happens next:** the next step with its date and who does it ("We'll text you the day before", "Next watering: Sat"). When there is none, the line is left out rather than filled.
- **The next action:** one ("Add to calendar", "View invoice", "Water Fernanda next"), plus "Done" or Undo.

## States

- **Loading:** while the action is pending, the button keeps its label and shows its inline spinner ("Sending…"); the success shows only once it is confirmed. A reversible action may confirm at once (optimistically) with Undo, and roll back with a message if it then fails.
- **Empty:** a confirmation with no next step shows the check, the title, the facts and "Done"; nothing is invented to fill the space.
- **Error:** no success motion. The error says what happened in plain words, keeps everything entered, and offers Retry ([empty, loading and error](../../knowledge/ux-patterns/empty-loading-error.md)). A partial success says both ("Booked · we couldn't send the email, it's in your bookings").
- **Offline:** an action queued to send later says so ("Saved · sends when you're back online") with a clock icon in `text-secondary`, not the check; the success plays when it goes through.

## Motion

| Level | Success moment |
|---|---|
| `lively` | the check [draws in](../motion/draw-in.md) and settles with `spring.bouncy`; the illustration reacts or the burst plays once; the amount [counts up](../motion/count-up.md); the facts follow by [stagger](../motion/stagger.md) |
| `default` | the check draws in over `duration.fast` and scales in with `spring.bouncy`; the facts follow by stagger |
| `calm` | the check scales in with `spring.smooth`; no burst, no stagger: the facts arrive together over `duration.base` |
| `none` | the check, title and facts appear at once |

The trigger button gives under the finger first ([press](../motion/press.md)). It plays once per action and never loops; a toast slides in with `duration.base` and `easing.enter`, and out with `easing.exit`.

## Accessibility

- The result is announced politely in words ("Invoice sent to Dana"); a confirmation screen moves focus to its title. The check is decoration; the title says it.
- Success is never colour alone: the check, the word ("Paid", "Booked") and the `success` disc with `on-success` on it at 4.5:1 or more.
- A toast stays up at least 5 s and its Undo is reachable by keyboard and screen reader; every action is at least 44 pt / 48 dp.
- A success haptic on native phones goes with the words, never instead of them.
- Reduced motion (level `none`) shows the end state at once.

## Stacks

### react-web

Motion for React draws the check's path and scales its disc with `spring.bouncy`; the message sits in a polite live region. `<MotionConfig reducedMotion="user">` makes it instant.

```tsx
import { motion } from "motion/react";
import { duration, spring } from "@/design/motion";

<div role="status" className="flex flex-col items-center gap-3 text-center">
  <motion.svg viewBox="0 0 48 48" className="size-16" aria-hidden="true"
    initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.bouncy}>
    <circle cx="24" cy="24" r="24" fill="var(--motif-color-success)" />
    <motion.path d="M14 25l7 7 13-15" fill="none" stroke="var(--motif-color-on-success)" strokeWidth="4" strokeLinecap="round"
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: duration.fast }} />
  </motion.svg>
  <h1 ref={titleRef} tabIndex={-1} className="font-body text-title">You're booked</h1>
</div>
```

Call `titleRef.current?.focus()` when a confirmation screen opens.

### plain-web

The check drawn with `stroke-dashoffset`, then a small `scale` settle, inside `prefers-reduced-motion: no-preference`; the message in a `role="status"` element.

```css
@media (prefers-reduced-motion: no-preference) {
  .success-mark { animation: settle var(--motif-duration-base) var(--motif-easing-enter) both; }
  .success-check { stroke-dasharray: 1; stroke-dashoffset: 1;
    animation: draw var(--motif-duration-fast) var(--motif-easing-enter) forwards; }
}
.success-mark circle { fill: var(--motif-color-success); }
.success-check { stroke: var(--motif-color-on-success); }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes settle { from { transform: scale(0.6); } 70% { transform: scale(1.06); } }
```

The mark is an `<svg class="success-mark" aria-hidden="true">` whose check path has `pathLength="1"`, so the dash values hold at any size. Give the title `tabindex="-1"` and focus it when the confirmation opens.

### vue

Motion for Vue's `motion.svg` with `spring.bouncy`, or the plain-web CSS in `<style scoped>` inside `prefers-reduced-motion: no-preference`.

```vue
<div role="status" class="flex flex-col items-center gap-3">
  <motion.svg viewBox="0 0 48 48" class="size-16" aria-hidden="true"
    :initial="{ scale: 0.6 }" :animate="{ scale: 1 }" :transition="reduced ? { duration: 0 } : spring.bouncy">
    <circle cx="24" cy="24" r="24" fill="var(--motif-color-success)" />
    <path d="M14 25l7 7 13-15" fill="none" stroke="var(--motif-color-on-success)" stroke-width="4" stroke-linecap="round" />
  </motion.svg>
  <h1 ref="title" tabindex="-1" class="text-title">Invoice INV-1042 sent to Dana</h1>
</div>
```

`reduced` is `useReducedMotion()` from `motion-v`.

### svelte

A `Spring` from `svelte/motion` scales the disc; the check uses the `draw` transition; set the spring to 1 at once when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { Spring, prefersReducedMotion } from "svelte/motion";
  import { draw } from "svelte/transition";
  import { duration, spring } from "$lib/design/motion";
  const scale = new Spring(prefersReducedMotion.current ? 1 : 0.6, spring.bouncy);
  $effect(() => { scale.target = 1; });
</script>

<div role="status">
  <svg viewBox="0 0 48 48" aria-hidden="true" style:transform="scale({scale.current})">
    <circle cx="24" cy="24" r="24" fill="var(--motif-color-success)" />
    <path d="M14 25l7 7 13-15" in:draw={{ duration: prefersReducedMotion.current ? 0 : duration.fast }}
      fill="none" stroke="var(--motif-color-on-success)" stroke-width="4" stroke-linecap="round" />
  </svg>
  <h1>Fernanda is watered</h1>
</div>
```

### angular

Motion's `animate` scales the disc with `spring.bouncy` after render; the CDK's `LiveAnnouncer` reads the result; skip the animation under `prefers-reduced-motion`.

```ts
import { animate } from "motion";
import { spring } from "../design/motion";

afterNextRender(() => {
  this.announcer.announce("Invoice INV-1042 sent to Dana", "polite");
  this.title.nativeElement.focus();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  animate(this.disc.nativeElement, { scale: [0.6, 1] }, spring.bouncy);
});
```

A toast is the guide's `Toast` component, up for at least 5 s, with Undo as its action.

### flutter

An unbounded `AnimationController` runs a `SpringSimulation` from `MotifSprings.bouncy` for the disc's scale; the check draws through a `TweenAnimationBuilder` with `MotifMotion.duration(context, MotifDurations.fast)`. Announce with `SemanticsService.announce`.

```dart
late final AnimationController _scale = AnimationController.unbounded(vsync: this, value: 0.6);

void _celebrate() {
  SemanticsService.announce("Invoice INV-1042 sent to Dana", Directionality.of(context));
  if (MotifMotion.reduced(context)) { _scale.value = 1; return; }
  _scale.animateWith(SpringSimulation(MotifSprings.bouncy, _scale.value, 1, 0));
}

ScaleTransition(
  scale: _scale,
  child: TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: MotifMotion.duration(context, MotifDurations.fast),
    builder: (context, t, _) => CustomPaint(size: const Size.square(64), painter: CheckPainter(colors, progress: t)),
  ),
)
```

A toast is a `SnackBar` with an Undo `SnackBarAction`; `HapticFeedback.mediumImpact()` may go with a confirmation.

### compose

An `Animatable` scales the disc with `MotifSprings.bouncy()`; read `MotifMotion.reduced()` into a `val` first and snap when it is true. The title is a polite live region; a toast is a `Snackbar` with Undo.

```kotlin
val reduced = MotifMotion.reduced()
val scale = remember { Animatable(if (reduced) 1f else 0.6f) }
val haptics = LocalHapticFeedback.current
LaunchedEffect(Unit) {
    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
    if (!reduced) scale.animateTo(1f, MotifSprings.bouncy())
}
Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MotifSpace.s3)) {
    SuccessCheck(Modifier.size(64.dp).graphicsLayer { scaleX = scale.value; scaleY = scale.value }.clearAndSetSemantics { })
    Text("You're booked", style = MotifType.title, modifier = Modifier.semantics { heading(); liveRegion = LiveRegionMode.Polite })
}
```

`SuccessCheck` is a `Canvas` drawing a `colors.success` circle and the check in `colors.onSuccess`. `HapticFeedbackType.Confirm` needs Compose UI 1.8 or later.

### react-native

Reanimated scales the disc with `withSpring(1, spring.bouncy)`; when `useReducedMotion()` is true, set it to 1 directly. Announce with `AccessibilityInfo.announceForAccessibility`.

```tsx
const reduced = useReducedMotion();
const scale = useSharedValue(reduced ? 1 : 0.6);
useEffect(() => {
  AccessibilityInfo.announceForAccessibility("Invoice INV-1042 sent to Dana");
  if (!reduced) scale.value = withSpring(1, spring.bouncy);
}, []);
const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

<Animated.View style={[{ width: 64, height: 64, borderRadius: radius.full, backgroundColor: colors.success,
  alignItems: "center", justifyContent: "center" }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
  <CheckIcon color={colors.onSuccess} />
</Animated.View>
```

With `expo-haptics` already in the project, `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` goes with it.

### swiftui

A checkmark symbol with `.symbolEffect(.bounce)`, or a scale with `MotifSprings.bouncy`, through `MotifMotion.animation`; under `accessibilityReduceMotion` it shows without animation. Announce with `AccessibilityNotification.Announcement` and add `.sensoryFeedback(.success, trigger:)`.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors
@State private var done = false

VStack(spacing: MotifSpace.s3) {
    Image(systemName: "checkmark.circle.fill")
        .resizable().frame(width: 64, height: 64)
        .symbolRenderingMode(.palette).foregroundStyle(colors.onSuccess, colors.success)
        .scaleEffect(done ? 1 : 0.6)
        .accessibilityHidden(true)
    Text("You're booked").motifFont(.title).accessibilityAddTraits(.isHeader)
}
.sensoryFeedback(.success, trigger: done)
.onAppear {
    withAnimation(MotifMotion.animation(MotifSprings.bouncy, reduceMotion: reduceMotion)) { done = true }
    AccessibilityNotification.Announcement("Booked for Saturday at 6:30").post()
}
```
