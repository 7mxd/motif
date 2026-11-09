# Welcome

## Purpose

The first screen of a native phone app, and the few steps after it, up to the first moment of real value. The welcome is one screen that is never scrolled: the drawing, the headline, one line, two or three short rows of what the app does, and the main action with a quiet second one pinned at the bottom within thumb reach ([character](../../knowledge/character.md)). What follows is as short as the app allows: at most three benefit steps, a permission primer just before a system prompt, a few personalisation choices, then the real product with one guided first action ([onboarding](../../knowledge/ux-patterns/onboarding.md)).

## Fits

Native phone apps on Flutter, Compose, React Native and SwiftUI, for every brief. On the web the welcome is the [landing hero](landing-hero.md) at phone width (its actions straight under the line, never pinned a screen away) and on a desktop a real desktop layout with the drawing beside the headline; web onboarding is usually no carousel at all, but a short sign-up and an in-app checklist ("3 of 5 done") on the home screen.

**The one screen, top to bottom:**

1. **The drawing**, about a quarter of the height, whole and centred, inside its shape (a `brand-soft` disc or blob) or on a band that runs to the screen's edges. A scene from the app's own world: a plant in a pot with a smaller one beside it, a route line under a sun, an invoice marked Paid.
2. **The headline** in `display` (or `title` on a small phone), two short lines, one word accented in `brand` or italic.
3. **One line** in `body`, `text-secondary`, on what the app does for them.
4. **Two or three rows**, each an icon tile on `brand-soft` with a short phrase in `heading` weight ("Reminders before each watering").
5. **Flexible space**, then **the actions** pinned to the bottom inside the safe area: the main one filled in `action-primary` at full width ("Add your first plant", "See this week's runs"), the quiet one under it as a text button ("I already have an account").

Everything fits with room to spare above the actions, and nothing runs past the bottom edge. If it doesn't fit, drop a row first, then shrink the drawing; no sample card here.

**By loudness:** a calm brief shows the app's mark or a small drawing on `surface`, the brand only in the drawing and the button; friendly and playful-and-gentle briefs put the scene on a `brand-soft` shape (a face on the mascot for playful); an energetic brief runs a full `brand` band across the top third holding the drawing, with the text below it on `background`.

**The steps after it:**

- **Benefit steps** (optional, at most three): one idea each, a smaller drawing, a `title` and one line of `body`, progress dots that match the real number of steps, Skip at the top end and Continue pinned at the bottom. Swipe and buttons both move between them.
- **Permission primer:** just before the feature needs it, why and what they get ("Get a nudge the morning a plant needs water"), with "Allow" filled and "Not now" quiet. The system prompt appears only after "Allow".
- **Personalisation** (optional): a few choices as chips or cards, several selectable at once, the selected ones filled in `brand-soft` with a check; Skip and Continue.
- **First run:** the real product with its [empty state](empty-state.md) offering the one first action; finishing it plays the [success moment](success-moment.md) and shows the next reminder.

## Loudness

default. It is the app's first impression and the brand's loudest native screen, so it follows the brief: one refined moment for a calm brief, a full band for an energetic one. The steps after it are quieter (a smaller drawing, the same layout).

## Data

- The app's name or mark, the headline, the line, two or three benefit rows and the two action labels: fixed copy, never fetched.
- Steps: how many there are (the dots show that number), which step they reached, what they picked; all kept on the device so a returning person resumes where they left off.
- Permission state per feature: not asked, granted or denied.

## States

- **Loading:** the welcome never waits: its copy and drawing are local, and fonts load before the first screen. After personalisation, a short progress state says what is being prepared ("Setting up your garden"), never a bare spinner.
- **Empty:** personalisation with nothing picked still lets them go on (Skip, or Continue with nothing required); the first-run screen is the app's [empty state](empty-state.md) with its one action, never an empty dashboard.
- **Error:** account creation failed says what went wrong and keeps everything entered; offline, the welcome and steps still read, and a step that needs the network says so and keeps their choices.
- **Permission denied:** carry on without it, with one line on where to turn it on later; never ask again on the next screen.
- **Returning but unfinished:** open at the step they left, with their choices still selected.

## Motion

| Level | Welcome and steps |
|---|---|
| `lively` | the drawing settles in with `spring.smooth`, then the headline, line, rows and actions follow by [stagger](../motion/stagger.md) in `duration.fast` steps; the main button gives under the finger ([press](../motion/press.md)) |
| `default` | the same stagger with `easing.enter` and no settle; press on the main action |
| `calm` | the screen fades in as one over `duration.base`; no stagger; press stays |
| `none` | everything shows at its end state at once |

Between steps the platform's own pager moves with the finger; the active dot widens over `duration.fast` with `easing.standard`. A step's drawing never loops or keeps moving. The first-run's first action ends in [success](../motion/success.md).

## Accessibility

- The headline is the screen's heading (header trait); the drawing is hidden from screen readers; the rows read as plain text in order.
- The dots read as "Step 2 of 3"; Skip, Continue and the second action are each a labelled button of at least 44 pt / 48 dp; swiping is never the only way forward.
- Text on `brand` uses `on-brand`, on `brand-soft` uses `text-primary`; the line under the headline is `text-secondary` at 4.5:1 or more.
- At the largest text sizes the one-screen rule gives way to reading: drop the rows and shrink the drawing first, then let the text scroll above the pinned actions.
- Reduced motion (level `none`) shows each screen still and complete; paging between steps still follows the finger, without the dot animation.

## Stacks

### react-web

The welcome is the [landing hero](landing-hero.md)'s phone layout. An installed web app that opens on a welcome uses a full-height grid with the actions in the last row; `<MotionConfig reducedMotion="user">` at the root makes the stagger instant.

```tsx
<main className="grid min-h-dvh grid-rows-[auto_auto_1fr_auto] gap-6 px-6 pb-[max(env(safe-area-inset-bottom),var(--motif-space-6))] pt-12">
  <Scene className="mx-auto h-[24dvh]" aria-hidden="true" />
  <div><h1 className="font-display text-display text-balance">Plants that <span className="text-brand">thrive</span></h1>
    <p className="mt-2 text-body text-text-secondary">Reminders, care notes and a calendar for every pot.</p></div>
  <ul className="flex flex-col gap-3 self-start">{rows}</ul>
  <div className="flex flex-col gap-2">{primary}{quiet}</div>
</main>
```

Setup tasks after sign-up go in a home-screen checklist card ("3 of 5 done"), not blocking steps.

### plain-web

The same full-height grid in CSS, with the safe-area inset at the bottom; the stagger sits inside `prefers-reduced-motion: no-preference`.

```css
.welcome { display: grid; grid-template-rows: auto auto 1fr auto; gap: var(--motif-space-6); min-height: 100dvh;
  padding: var(--motif-space-12) var(--motif-space-6) max(env(safe-area-inset-bottom), var(--motif-space-6)); }
.welcome-art { height: 24dvh; margin-inline: auto; }
@media (prefers-reduced-motion: no-preference) {
  .welcome > * { animation: rise var(--motif-duration-base) var(--motif-easing-enter) both;
    animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
}
```

On a desktop the page is the landing hero's two columns instead.

### vue

The same grid in the template; a step flow is a `<Transition mode="out-in">` around the current step, its CSS inside `prefers-reduced-motion: no-preference`.

```vue
<main class="grid min-h-dvh grid-rows-[auto_auto_1fr_auto] gap-6 px-6 pt-12 pb-6">
  <Transition name="step" mode="out-in"><component :is="steps[current]" :key="current" /></Transition>
  <p class="text-center text-label text-text-secondary">Step {{ current + 1 }} of {{ steps.length }}</p>
  <div class="flex flex-col gap-2"><Button @click="next">Continue</Button><button class="quiet" @click="skip">Skip</button></div>
</main>
```

Keep `current` and the choices in `localStorage` so a returning person resumes.

### svelte

The grid in markup, parts arriving with `in:fly` by index; skip it when `prefersReducedMotion.current` is true.

```svelte
<main class="grid min-h-dvh grid-rows-[auto_auto_1fr_auto] gap-6 px-6 pt-12 pb-6">
  {#each parts as Part, i}
    <div in:fly={{ y: prefersReducedMotion.current ? 0 : 8, delay: prefersReducedMotion.current ? 0 : (i * duration.fast) / 4,
      duration: prefersReducedMotion.current ? 0 : duration.base }}><Part /></div>
  {/each}
</main>
```

### angular

The grid in the component's template and CSS; steps switch with `@switch (step())` on a signal kept in `localStorage`, and the stagger CSS sits inside `prefers-reduced-motion: no-preference`.

```html
<main class="welcome">
  @switch (step()) {
    @case (0) { <app-welcome-intro [style.--i]="0" /> }
    @case (1) { <app-notify-primer (allow)="askPermission()" (later)="next()" /> }
  }
  <div class="welcome-actions"><button appButton (click)="next()">Continue</button></div>
</main>
```

### flutter

A `SafeArea` around a `Column`: the drawing, the text and the rows at the top, an `Expanded` space, and the actions last. `LayoutBuilder` drops the third row on a short screen. Steps are a `PageView` with dots; durations go through `MotifMotion.duration(context, …)`.

```dart
SafeArea(child: LayoutBuilder(builder: (context, c) {
  final colors = MotifColors.of(context);
  final rows = c.maxHeight < 680 ? benefits.take(2) : benefits.take(3);
  return Padding(
    padding: EdgeInsets.all(MotifSpace.s6),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(height: c.maxHeight * 0.25, width: double.infinity,
          child: ExcludeSemantics(child: CustomPaint(painter: PlantScene(colors)))),
      SizedBox(height: MotifSpace.s6),
      Semantics(header: true, child: Text("Plants that thrive", style: MotifText.display)),
      Text("Reminders and care notes for every pot.", style: MotifText.body.copyWith(color: colors.textSecondary)),
      SizedBox(height: MotifSpace.s6),
      ...rows.map((b) => BenefitRow(b)),
      const Spacer(),
      AppButton(label: "Add your first plant", onPressed: start),
      Center(child: TextButton(onPressed: signIn, child: const Text("I already have an account"))),
    ]),
  );
}))
```

The step dots use `AnimatedContainer` widths with `MotifMotion.duration(context, MotifDurations.fast)`.

### compose

A `Column` with `Modifier.weight(1f)` space before the actions, padded with `WindowInsets.safeDrawing`; `BoxWithConstraints` drops a row on a short screen; steps are a `HorizontalPager`. Read `MotifMotion.reduced()` into a `val` and skip the entrance when it is true.

```kotlin
val colors = MotifTheme.colors
BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(MotifSpace.s6)) {
    val rows = if (maxHeight < 680.dp) benefits.take(2) else benefits.take(3)
    Column(Modifier.fillMaxSize()) {
        PlantScene(Modifier.fillMaxWidth().height(maxHeight * 0.25f).clearAndSetSemantics { })
        Spacer(Modifier.height(MotifSpace.s6))
        Text("Plants that thrive", style = MotifType.display, modifier = Modifier.semantics { heading() })
        Text("Reminders and care notes for every pot.", style = MotifType.body, color = colors.textSecondary)
        rows.forEach { BenefitRow(it) }
        Spacer(Modifier.weight(1f))
        AppButton(label = "Add your first plant", onClick = start, modifier = Modifier.fillMaxWidth())
        TextButton(onClick = signIn, modifier = Modifier.fillMaxWidth()) { Text("I already have an account") }
    }
}
```

For steps, `HorizontalPager(state = rememberPagerState { steps.size })` with Skip in the top bar.

### react-native

`SafeAreaView` from `react-native-safe-area-context` with `flex: 1` and the actions last after a `flex: 1` spacer; `useWindowDimensions().height` drops a row. When `useReducedMotion()` is true, leave out the `entering` animations.

```tsx
const { height } = useWindowDimensions();
const reduced = useReducedMotion();
const rows = benefits.slice(0, height < 680 ? 2 : 3);
const enter = (i: number) => (reduced ? undefined : FadeInDown.delay((i * duration.fast) / 4).duration(duration.base));

<SafeAreaView style={{ flex: 1, padding: space.s6, backgroundColor: colors.background }}>
  <Animated.View entering={enter(0)} style={{ height: height * 0.25 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <PlantScene />
  </Animated.View>
  <Animated.Text entering={enter(1)} accessibilityRole="header" style={[type.display, { color: colors.textPrimary }]}>Plants that thrive</Animated.Text>
  {rows.map((b, i) => <Animated.View key={b.id} entering={enter(i + 2)}><BenefitRow {...b} /></Animated.View>)}
  <View style={{ flex: 1 }} />
  <AppButton label="Add your first plant" onPress={start} />
  <Pressable onPress={signIn} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", alignItems: "center" }}>
    <Text style={[type.label, { color: colors.actionPrimary }]}>I already have an account</Text>
  </Pressable>
</SafeAreaView>
```

Steps are a horizontal `FlatList` with `pagingEnabled`, plus Continue so swiping isn't the only way.

### swiftui

A `VStack` for the drawing, text and rows, with the actions in `.safeAreaInset(edge: .bottom)` so they stay pinned; `ViewThatFits(in: .vertical)` drops a row when three don't fit. Steps are a `TabView` with `.tabViewStyle(.page)`. Under `accessibilityReduceMotion` the parts appear without animation.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors

VStack(alignment: .leading, spacing: MotifSpace.s6) {
    PlantScene().frame(maxWidth: .infinity).containerRelativeFrame(.vertical) { h, _ in h * 0.25 }.accessibilityHidden(true)
    Text("Plants that thrive").motifFont(.display).accessibilityAddTraits(.isHeader)
    Text("Reminders and care notes for every pot.").motifFont(.body).foregroundStyle(colors.textSecondary)
    ViewThatFits(in: .vertical) { BenefitRows(benefits.prefix(3)); BenefitRows(benefits.prefix(2)) }
    Spacer(minLength: 0)
}
.padding(MotifSpace.s6)
.safeAreaInset(edge: .bottom) {
    VStack(spacing: MotifSpace.s2) {
        AppButton(title: "Add your first plant", action: start)
        Button("I already have an account", action: signIn).frame(minHeight: 44)
    }.padding(MotifSpace.s6)
}
```

The stagger shows each part on appear with `MotifMotion.animation(MotifCurves.enter.delay(Double(i) * MotifDurations.fast / 4), reduceMotion: reduceMotion)`, so it is instant under Reduce Motion.
