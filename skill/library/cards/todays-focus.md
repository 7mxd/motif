# Today's focus

## Purpose

The one next thing, with the button that does it: the next run ("Sat 6:30 · Corniche · 5 km · 14 going" with "I'm going"), the plant due today ("Lily needs water" with "Mark as watered"), the invoice to chase ("Acme Ltd · $2,400 · 12 days late" with "Send reminder"). It answers "what should I do next?" so the home screen opens on an action, not a list to search.

What sits on it:

- **A short eyebrow** in `label`: "Today", "Next up", "Due today".
- **The thing itself** in `heading`: "Lily needs water". Beside it, its drawn thumbnail when the item has a look of its own (the plant's pot, the run's route line), as [item card](item-card.md) draws it, at the 64 px square size.
- **The facts people act by**, each once, in one short row of figures led by small icons (when, where, how far, who is going), never a dense run-on line.
- **One action**, a verb for exactly this item ("Mark as watered", not "Done"), at full width on a phone and at the card's end on a desktop.
- **What comes after,** in `caption`, `text-secondary`: "Then: Fern on Tue". It tells people the list goes on without showing it.

## Fits

Every home screen of an app people return to for something to do: clubs and groups (the next meetup), personal care apps (plants, habits, pets), and business tools (the next invoice to chase, the next booking). Its colour follows the brief and the platform, as [character](../../knowledge/character.md#where-the-brand-is-loud) sets it:

- **Energetic, bold, playful or friendly briefs on the web, and on Android:** the card is `brand` with `on-brand` text, so it reads as the screen's one moment (a pale card there reads as flat). Its button is drawn in `on-brand` with `brand` text.
- **Calm and business briefs:** a `surface-raised` card with a `brand-soft` icon tile, its button `action-primary`, since the [key-figure card](key-figure-card.md) is already the screen's one `brand` area.
- **Native iPhone app, every brief:** a `surface` card on the system's grouped background, the brand in its figure, its icon and its button. The same holds for a React Native or Flutter app on iOS that follows the system's look.
- **Placement:** on a phone, at the top (a personal or club app) or straight under the key-figure card (a money app). On a desktop, beside the key-figure card or the week's list in a real desktop layout ([visual craft](../../knowledge/visual-craft.md)), never stretched across the full width.

One focus card per screen; a second "next thing" is a row in the list under it.

## Loudness

default. Loud enough to be the first thing tapped: `brand` for louder briefs, a calm card with a `brand-soft` tile for quiet ones.

## Data

The person's own next item, picked by the app, not by them: the one due soonest or most overdue.

- its eyebrow (why it is first: "Due today", "Next up", "12 days late"), its title and, where it has one, its kind for the drawn thumbnail;
- two to four facts people act by (time, place, distance, who is going, amount);
- the action's label (a verb for this item) and what it does; the item after it ("Then: Fern on Tue"), if any;
- after the action, the next item to show in its place.

## States

- **Loading:** the card keeps its size; title, facts and button are skeleton bars; the button is not pressable yet.
- **Empty:** nothing is due, which is good news. Say so with the next date ("All watered · Next: Fern on Tue"), a small drawing or a `success` check, and no button, or a quiet one ("See all plants"). A new account with nothing yet shows the [empty state](../screens/empty-state.md)'s first action instead ("Add your first plant").
- **Error:** the card says what failed in one line ("Couldn't load today's plan") with "Try again". If the action itself fails, the card stays as it was with the reason under the button ("Couldn't save. Try again"), never a silent reset.
- **Done:** the action confirms with [success](../motion/success.md) ("Watered" with a check), then after a beat the card cross-fades to the next item, or to the empty state when there is none. Offer "Undo" for a few seconds where the action can be taken back.

## Motion

The card arrives with the home screen's [stagger](../motion/stagger.md), its button answers with [press](../motion/press.md), and a finished action plays [success](../motion/success.md) before the card changes to the next item. No count-up or draw-in unless it carries a figure or a route line ([draw-in](../motion/draw-in.md) then).

| Level | Today's focus |
|---|---|
| `lively` | the card rises in first; press with `spring.snappy`; success bounces the check with `spring.bouncy`, then the next item slides in from the end edge over `duration.base` |
| `default` | the card fades and rises in, in step with the screen's stagger; press with `spring.snappy`; success with `spring.bouncy`, then a cross-fade over `duration.base` |
| `calm` | the card fades in with the screen (no stagger); press with `spring.snappy`; success with `spring.smooth`, then a cross-fade over `duration.fast` |
| `none` | the card is there at once; the check and the next item appear without moving |

## Accessibility

- The card reads in order: the eyebrow, the title, the facts in words ("Saturday 6:30 AM, Corniche, 5 kilometres, 14 going"), then the button. Icons beside facts are hidden from screen readers; the words carry them.
- The button is at least 44 pt / 48 dp tall and its label names the item when it is read alone ("Mark Lily as watered").
- The success and the change to the next item are announced ("Lily watered. Next: Fern on Tuesday") through the stack's live region, since the card changes under the person's focus; keep focus on the card, not lost to the page.
- `on-brand` on `brand` and `on-action-primary` on `action-primary` reach 4.5:1. Under reduced motion every change is instant (level `none`).

## Stacks

### react-web

A `section` with an `aria-live="polite"` line for the outcome; Motion for React for the entrance, the press and the swap to the next item with `AnimatePresence` (the plain-web CSS when the project has no Motion), inside `<MotionConfig reducedMotion="user">`.

```tsx
import { AnimatePresence, motion } from "motion/react";
import { duration, spring } from "@/design/motion";

<section aria-labelledby="focus-title" className={loud ? "bg-brand text-on-brand" : "bg-surface-raised text-text-primary"}>
  <AnimatePresence mode="wait">
    <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: duration.base }}>
      <p className="font-label text-label">{item.eyebrow}</p>
      <h2 id="focus-title" className="font-heading text-heading">{item.title}</h2>
      <Facts facts={item.facts} />
      <motion.button whileTap={{ scale: 0.97 }} transition={spring.snappy} onClick={complete}
        aria-label={item.spokenAction} className={loud ? "bg-on-brand text-brand" : "bg-action-primary text-on-action-primary"}>
        {item.action}
      </motion.button>
    </motion.div>
  </AnimatePresence>
  <p aria-live="polite" className="sr-only">{announcement}</p>
</section>
```

`complete` plays [success](../motion/success.md)'s check, sets the announcement, then moves to the next item. Give the button `min-h-11`, `rounded-md` and `px-4`.

### plain-web

A `<section>` whose colours come from the variables, a hidden `aria-live` line, and the swap as a class change; the entrance, press and cross-fade inside `prefers-reduced-motion: no-preference`.

```css
.focus { padding: var(--motif-space-5); border-radius: var(--motif-radius-lg);
  background: var(--motif-color-surface-raised); color: var(--motif-color-text-primary); }
.focus.is-loud { background: var(--motif-color-brand); color: var(--motif-color-on-brand); }
.focus .action { min-height: 44px; border-radius: var(--motif-radius-md);
  background: var(--motif-color-action-primary); color: var(--motif-color-on-action-primary); }
.focus.is-loud .action { background: var(--motif-color-on-brand); color: var(--motif-color-brand); }
@media (prefers-reduced-motion: no-preference) {
  .focus { animation: card-in var(--motif-duration-fast) var(--motif-easing-enter) both; }
  .focus .action:active { transform: scale(0.97); transition: transform var(--motif-duration-fast); }
  .focus .body.is-leaving { opacity: 0; transition: opacity var(--motif-duration-base) var(--motif-easing-exit); }
}
@keyframes card-in { from { opacity: 0; transform: translateY(var(--motif-space-2)); } }
```

After the action, add `is-leaving`, wait for `transitionend` (or go on at once under reduced motion), then fill in the next item.

### vue

`<Transition mode="out-in" appear>` keyed on the item swaps it for the next; the CSS sits inside `prefers-reduced-motion: no-preference`. Motion for Vue's `:while-press` gives the press when the project has it.

```vue
<section class="focus" :class="{ 'is-loud': loud }" aria-labelledby="focus-title">
  <Transition name="focus" mode="out-in" appear>
    <div :key="item.id" class="body">
      <p class="eyebrow">{{ item.eyebrow }}</p>
      <h2 id="focus-title">{{ item.title }}</h2>
      <FocusFacts :facts="item.facts" />
      <button class="action" :aria-label="item.spokenAction" @click="complete">{{ item.action }}</button>
    </div>
  </Transition>
  <p class="sr-only" aria-live="polite">{{ announcement }}</p>
</section>
```

### svelte

A `{#key item.id}` block with `in:fade` and `out:fade` swaps the item; durations are zero when `prefersReducedMotion.current` is true.

```svelte
<script>
  import { fade } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { duration } from "$lib/design/motion";
  let { item, loud, complete, announcement } = $props();
  const t = $derived({ duration: prefersReducedMotion.current ? 0 : duration.base });
</script>

<section class="focus" class:is-loud={loud} aria-labelledby="focus-title">
  {#key item.id}
    <div in:fade={t} out:fade={t}>
      <p class="eyebrow">{item.eyebrow}</p>
      <h2 id="focus-title">{item.title}</h2>
      <button class="action" aria-label={item.spokenAction} onclick={complete}>{item.action}</button>
    </div>
  {/key}
  <p class="sr-only" aria-live="polite">{announcement}</p>
</section>
```

### angular

A component holding the item as a signal; the swap is Motion's `animate` on the body's opacity, skipped under `prefers-reduced-motion`, and the outcome goes to `LiveAnnouncer` from the CDK.

```ts
async complete() {
  await this.store.complete(this.item());
  this.announcer.announce(`${this.item().title} done. Next: ${this.next()?.title ?? "nothing due"}`);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!still) await animate(this.body.nativeElement, { opacity: 0 }, { duration: duration.base, ease: easing.exit });
  this.item.set(this.next());
  if (!still) animate(this.body.nativeElement, { opacity: [0, 1] }, { duration: duration.base, ease: easing.enter });
}
```

The template and CSS are plain-web's; the press is `:active` in the component's CSS.

### flutter

A `Card`-shaped `Container` whose colours follow the brief and platform, an `AnimatedSwitcher` keyed on the item for the swap, and `SemanticsService.announce` for the outcome.

```dart
final colors = MotifColors.of(context);
final ios = Theme.of(context).platform == TargetPlatform.iOS;
final fill = ios ? colors.surface : (loud ? colors.brand : colors.surfaceRaised);
final ink = !ios && loud ? colors.onBrand : colors.textPrimary;

Container(
  padding: const EdgeInsets.all(MotifSpace.s5),
  decoration: BoxDecoration(color: fill, borderRadius: BorderRadius.circular(MotifRadius.lg)),
  child: AnimatedSwitcher(
    duration: MotifMotion.duration(context, MotifDurations.base),
    child: Column(key: ValueKey(item.id), crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(item.eyebrow, style: MotifText.label.copyWith(color: ink)),
      Text(item.title, style: MotifText.heading.copyWith(color: ink)),
      FocusFacts(item.facts, color: ink),
      PressScale(child: FilledButton(onPressed: complete, child: Text(item.action))),
    ]),
  ),
)
```

On the `brand` card, style the `FilledButton` with `colors.onBrand` and `colors.brand` text. `complete` plays [success](../motion/success.md), then calls `SemanticsService.announce(…)` and sets the next item.

### compose

A `Surface` coloured by the brief, `AnimatedContent` on the item for the swap, and a `liveRegion` on the outcome line; `MotifMotion.reduced()` turns the swap into `snap()`.

```kotlin
val colors = MotifTheme.colors
val reduced = MotifMotion.reduced()
Surface(color = if (loud) colors.brand else colors.surfaceRaised, contentColor = if (loud) colors.onBrand else colors.textPrimary,
    shape = RoundedCornerShape(MotifRadius.lg)) { Column {
    AnimatedContent(item, transitionSpec = {
        if (reduced) EnterTransition.None togetherWith ExitTransition.None
        else fadeIn(tween(MotifDurations.base)) togetherWith fadeOut(tween(MotifDurations.base))
    }, label = "focus") { current ->
        Column(Modifier.padding(MotifSpace.s5)) {
            Text(current.eyebrow, style = MotifType.label)
            Text(current.title, style = MotifType.heading, modifier = Modifier.semantics { heading() })
            FocusFacts(current.facts)
            PressButton(onClick = { complete(current) }) { Text(current.action) }
        }
    }
    Text(announcement, style = MotifType.caption,
        modifier = Modifier.padding(horizontal = MotifSpace.s5).semantics { liveRegion = LiveRegionMode.Polite })
} }
```

### react-native

An `Animated.View` keyed on the item with `entering` and `exiting` fades, both left out when `useReducedMotion()` is true, and `AccessibilityInfo.announceForAccessibility` for the outcome.

```tsx
const { colors } = useMotifTheme();
const reduced = useReducedMotion();
const ios = Platform.OS === "ios";
const fill = ios ? colors.surface : loud ? colors.brand : colors.surfaceRaised;
const ink = !ios && loud ? colors.onBrand : colors.textPrimary;

<View style={{ backgroundColor: fill, borderRadius: radius.lg, padding: space.s5 }}>
  <Animated.View key={item.id} entering={reduced ? undefined : FadeIn.duration(duration.base)}
    exiting={reduced ? undefined : FadeOut.duration(duration.base)}>
    <Text style={[type.label, { color: ink }]}>{item.eyebrow}</Text>
    <Text accessibilityRole="header" style={[type.heading, { color: ink }]}>{item.title}</Text>
    <FocusFacts facts={item.facts} color={ink} />
    <PressScale onPress={complete} accessibilityLabel={item.spokenAction} style={{ minHeight: 44 }}>
      <Text style={type.label}>{item.action}</Text>
    </PressScale>
  </Animated.View>
</View>
```

### swiftui

The native iPhone version for every brief: a `surface` card on the grouped background, the brand in its icon tile and the guide's `action-primary` button; the swap is an `.id` change inside `withAnimation`, and the outcome is posted with `AccessibilityNotification.Announcement`.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion

VStack(alignment: .leading, spacing: MotifSpace.s2) {
    Text(item.eyebrow).motifFont(.label).foregroundStyle(colors.brand)
    Text(item.title).motifFont(.heading).foregroundStyle(colors.textPrimary).accessibilityAddTraits(.isHeader)
    FocusFacts(facts: item.facts)
    Button(item.action, action: complete).buttonStyle(PrimaryPressStyle()).accessibilityLabel(item.spokenAction)
}
.id(item.id)
.transition(.opacity)
.padding(MotifSpace.s5)
.background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.lg))
```

In `complete`, play [success](../motion/success.md)'s `.symbolEffect(.bounce)` on a check, post `AccessibilityNotification.Announcement("Lily watered. Next: Fern").post()`, then set the next item inside `withAnimation(MotifMotion.animation(MotifCurves.standard, reduceMotion: reduceMotion))`.
