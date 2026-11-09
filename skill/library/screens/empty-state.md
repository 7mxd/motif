# Empty state

## Purpose

What a screen or section shows when it has nothing in it: a small drawing from the app's own world, a short title, one line in plain words on what will appear here, and one action. It turns a blank area into the next step ("Add your first plant") and is one of the brand's first-impression moments ([character](../../knowledge/character.md)), so it gets a real drawing rather than a grey icon.

## Fits

Every brief and every stack: lists, dashboards' sections, search results, inboxes. Three kinds, each with its own message ([empty, loading and error](../../knowledge/ux-patterns/empty-loading-error.md)):

| Kind | Title and line | Action | Drawing |
|---|---|---|---|
| First use | "No invoices yet" · "Send your first invoice and it shows up here with its due date." | one filled `action-primary` button: "Create invoice" | the subject, waiting: a blank invoice sheet with a pen, an empty pot with a seedling and a watering can, a route line from a start dot to a flag under a sun |
| No results | "No trails match 'stroller'" · "Try fewer filters or another word." | one quiet or outlined button: "Clear filters" | a magnifier over a folded trail map |
| Cleared | "All watered for today" · "Next: Fernanda on Saturday." | none: celebrate quietly | the subject, content: the pot with a small sun beside it |

**The drawing comes from the app's world** and the brief's illustration family: the same plant, route or invoice as the welcome and the item thumbnails, never a generic box or cloud. A small scene: a soft `brand-soft` shape behind, the subject filled in role colours (a terracotta pot mixed from `warning` and `surface`, leaves in `brand`), one or two supporting pieces. Playful briefs give it a face (the pot looking up); calm and business briefs keep it simpler, or use the app's icon on a `brand-soft` tile.

**Layout:** a centred stack (drawing, title in `heading`, the line in `body` and `text-secondary` at about 40 characters wide, the action) inside the content area, keeping the header, tabs, search and tab bar around it. On a phone the group starts near the top third, not floated to the middle of a tall blank area. On a desktop it sits inside the section's own frame at the section's normal size (a list's panel, a dashboard card); a full-width list that is empty keeps its header, tabs and search, with the empty state centred in the list's column. The drawing is about 120–160 pt tall, never larger than the text needs; one illustration per screen, so the other empty cards on a dashboard get one line each ("No overdue invoices"), no drawing.

## Loudness

default. A real drawing at a modest size; louder briefs add a face, calm ones shrink it to an icon tile. Never larger than about a fifth of a phone's height.

## Data

- **The kind**, decided from data that has loaded: zero items ever (first use), zero items for the current search or filters (no results), or every item done (cleared).
- **For no results:** the search words and the active filters, so the line can name them and the action can clear them.
- **For cleared:** the next upcoming item ("Next: Fernanda on Saturday"), when there is one.
- **The action:** its label and target; for first use it starts the thing the list holds.

## States

- **Loading:** a skeleton in the list's final layout after about 300 ms, never the empty state: "No invoices yet" flashing before the invoices arrive reads as data lost. Decide "empty" only once the data has loaded.
- **Empty:** this piece, with the message for its kind: first use, no results and cleared never share one message.
- **Error:** not an empty state. The section shows what happened and Retry ("We couldn't load your invoices · Try again"); offline with nothing cached says so ("You're offline · your plants will show when you're back"), and with something cached shows that.
- **Permission needed:** what the feature needs and why, with a button to grant it or open the system settings, in the same layout.

## Motion

| Level | Empty state |
|---|---|
| `lively` | the drawing settles in with `spring.smooth` (a mascot's small hop with `spring.bouncy`), then the title, line and action follow by [stagger](../motion/stagger.md) in `duration.fast` steps |
| `default` | the drawing, title, line and action by stagger with `easing.enter`, no settle |
| `calm` | the whole group fades in over `duration.base`; no stagger |
| `none` | it appears at once |

It plays once when the state first shows, not again when a filter changes between two empty results. The action gives under the finger ([press](../motion/press.md)). When the last item is done and the list turns to "cleared", that item's [success](../motion/success.md) plays first, then the cleared state arrives. The drawing never loops.

## Accessibility

- The drawing is decoration: `aria-hidden="true"` on the web, hidden from accessibility natively. The title and line carry the meaning.
- The title is a heading at the section's level; the action is a real button of at least 44 pt / 48 dp with a label that says what it does.
- A change to no results is announced in a polite live region ("No trails match 'stroller'"), and focus stays where it was (in the search field).
- The line is `text-secondary` on its surface at 4.5:1 or more; under reduced motion (level `none`) it shows still.

## Stacks

### react-web

An `EmptyState` component holding an inline `<svg>` in role colours; the results area is a polite live region. `<MotionConfig reducedMotion="user">` makes the stagger instant.

```tsx
<div aria-live="polite" className="mx-auto flex max-w-sm flex-col items-center gap-3 py-12 text-center">
  <svg viewBox="0 0 120 120" className="h-36" aria-hidden="true">
    <circle cx="60" cy="66" r="50" fill="var(--motif-color-brand-soft)" />
    <path d="M38 70h44l-7 38H45z" style={{ fill: "color-mix(in srgb, var(--motif-color-warning) 55%, var(--motif-color-surface))" }} />
    <path d="M60 70V48" stroke="var(--motif-color-brand)" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="68" cy="46" rx="9" ry="4.5" fill="var(--motif-color-brand)" />
  </svg>
  <h2 className="font-body text-heading">No plants yet</h2>
  <p className="text-body text-text-secondary">Add one and we'll remind you when it needs water.</p>
  <Button onClick={addPlant}>Add your first plant</Button>
</div>
```

### plain-web

The same SVG with its fills in CSS, so dark mode follows the roles; the entrance sits inside `prefers-reduced-motion: no-preference`.

```css
.empty { display: grid; justify-items: center; gap: var(--motif-space-3); max-width: 24rem; margin-inline: auto;
  padding-block: var(--motif-space-12); text-align: center; }
.empty p { color: var(--motif-color-text-secondary); }
.empty .pot { fill: color-mix(in srgb, var(--motif-color-warning) 55%, var(--motif-color-surface)); }
.empty .halo { fill: var(--motif-color-brand-soft); }
@media (prefers-reduced-motion: no-preference) {
  .empty > * { animation: rise var(--motif-duration-base) var(--motif-easing-enter) both;
    animation-delay: calc(var(--i) * var(--motif-duration-fast) / 4); }
}
```

Wrap the list in `<div aria-live="polite">` so a change to "No results" is read out.

### vue

An `EmptyState.vue` with `kind`, `title`, `line` and an `action` slot; the drawing is an inline `<svg>` with `var(--motif-…)` fills, and its CSS entrance sits inside `prefers-reduced-motion: no-preference`.

```vue
<template>
  <div aria-live="polite" class="empty">
    <PotDrawing aria-hidden="true" class="h-36" />
    <h2 class="text-heading">{{ title }}</h2>
    <p>{{ line }}</p>
    <slot name="action" />
  </div>
</template>
```

The list decides the kind: `v-if="loading"` shows the skeleton, `v-else-if="error"` the error, and only then the empty state.

### svelte

The list's `{#if}` chain keeps loading, error and empty apart; the group arrives with `in:fly`, skipped when `prefersReducedMotion.current` is true.

```svelte
{#if loading}
  <ListSkeleton />
{:else if error}
  <ErrorState message="We couldn't load your plants." onretry={reload} />
{:else if plants.length === 0}
  <div class="empty" aria-live="polite"
    in:fly={{ y: prefersReducedMotion.current ? 0 : 8, duration: prefersReducedMotion.current ? 0 : duration.base }}>
    <PotDrawing aria-hidden="true" />
    <h2>No plants yet</h2>
    <p>Add one and we'll remind you when it needs water.</p>
    <Button onclick={addPlant}>Add your first plant</Button>
  </div>
{/if}
```

### angular

`@if` blocks in the list's template, the empty state as `app-empty-state` with inputs for its kind; the CDK's `LiveAnnouncer` reads out "No results", and the entrance CSS sits inside `prefers-reduced-motion: no-preference`.

```html
@if (loading()) { <app-list-skeleton /> }
@else if (error()) { <app-error-state (retry)="reload()" /> }
@else if (plants().length === 0) {
  <app-empty-state title="No plants yet" line="Add one and we'll remind you when it needs water.">
    <app-pot-drawing aria-hidden="true" />
    <button appButton (click)="addPlant()">Add your first plant</button>
  </app-empty-state>
}
```

### flutter

A `Column` with `mainAxisSize: MainAxisSize.min` near the top of the content area; the drawing is a `CustomPainter` reading `MotifColors`, with the terracotta mixed by `Color.lerp`. The entrance uses `MotifMotion.duration(context, MotifDurations.base)`, zero under reduced motion.

```dart
class PotPainter extends CustomPainter {
  PotPainter(this.colors);
  final MotifColors colors;

  @override
  void paint(Canvas canvas, Size s) {
    final terracotta = Color.lerp(colors.warning, colors.surface, 0.45)!;
    canvas.drawCircle(Offset(s.width / 2, s.height * 0.55), s.width * 0.42, Paint()..color = colors.brandSoft);
    final pot = Path()..moveTo(s.width * 0.32, s.height * 0.58)..lineTo(s.width * 0.68, s.height * 0.58)
      ..lineTo(s.width * 0.62, s.height * 0.9)..lineTo(s.width * 0.38, s.height * 0.9)..close();
    canvas.drawPath(pot, Paint()..color = terracotta);
    canvas.drawLine(Offset(s.width / 2, s.height * 0.58), Offset(s.width / 2, s.height * 0.4),
        Paint()..color = colors.brand..strokeWidth = 3..strokeCap = StrokeCap.round);
  }

  @override
  bool shouldRepaint(PotPainter old) => old.colors != colors;
}
```

Wrap it in `ExcludeSemantics` and a `SizedBox(height: 140)`, then the title (`MotifText.heading`), the line and an `AppButton`, spaced with `MotifSpace.s3`.

### compose

A `Column` with `horizontalAlignment = Alignment.CenterHorizontally`; the drawing is a `Canvas`, cleared from semantics, its terracotta from `lerp`. Read `MotifMotion.reduced()` into a `val` and skip the entrance when it is true.

```kotlin
val colors = MotifTheme.colors
Column(Modifier.fillMaxWidth().padding(top = MotifSpace.s12), horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(MotifSpace.s3)) {
    Canvas(Modifier.size(140.dp).clearAndSetSemantics { }) {
        val w = size.width; val h = size.height
        drawCircle(colors.brandSoft, radius = w * 0.42f, center = Offset(w / 2, h * 0.55f))
        val pot = Path().apply { moveTo(w * 0.32f, h * 0.58f); lineTo(w * 0.68f, h * 0.58f); lineTo(w * 0.62f, h * 0.9f); lineTo(w * 0.38f, h * 0.9f); close() }
        drawPath(pot, lerp(colors.warning, colors.surface, 0.45f))
        drawLine(colors.brand, Offset(w / 2, h * 0.58f), Offset(w / 2, h * 0.4f), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
    }
    Text("No plants yet", style = MotifType.heading, modifier = Modifier.semantics { heading() })
    Text("Add one and we'll remind you when it needs water.", style = MotifType.body, color = colors.textSecondary, textAlign = TextAlign.Center)
    AppButton(label = "Add your first plant", onClick = addPlant)
}
```

### react-native

A `View` with `alignItems: "center"`; the drawing is `react-native-svg` (ask before adding it) or composed views, hidden from accessibility. When `useReducedMotion()` is true, leave out the `entering` animation.

```tsx
const reduced = useReducedMotion();
const { colors, type } = useMotifTheme();

<Animated.View entering={reduced ? undefined : FadeIn.duration(duration.base)} accessibilityLiveRegion="polite"
  style={{ alignItems: "center", gap: space.s3, paddingTop: space.s12, paddingHorizontal: space.s6 }}>
  <Svg viewBox="0 0 120 120" width={140} height={140} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Circle cx={60} cy={66} r={50} fill={colors.brandSoft} />
    {/* the terracotta: warning at 55% over a surface copy of the pot, since React Native has no colour mixing */}
    <Path d="M38 70h44l-7 38H45z" fill={colors.surface} />
    <Path d="M38 70h44l-7 38H45z" fill={colors.warning} fillOpacity={0.55} />
    <Path d="M60 70V48" stroke={colors.brand} strokeWidth={3} strokeLinecap="round" />
  </Svg>
  <Text accessibilityRole="header" style={[type.heading, { color: colors.textPrimary }]}>No plants yet</Text>
  <Text style={[type.body, { color: colors.textSecondary, textAlign: "center" }]}>Add one and we'll remind you when it needs water.</Text>
  <AppButton label="Add your first plant" onPress={addPlant} />
</Animated.View>
```

### swiftui

`ContentUnavailableView` with a custom label holding the drawing (a `Shape` or `Canvas`), the description and the action; `ContentUnavailableView.search(text:)` covers no results. Under `accessibilityReduceMotion` it appears without animation.

```swift
@Environment(\.motifColors) private var colors
@Environment(\.accessibilityReduceMotion) private var reduceMotion

ContentUnavailableView {
    VStack(spacing: MotifSpace.s3) {
        PotDrawing(pot: colors.warning.mix(with: colors.surface, by: 0.45), leaf: colors.brand, halo: colors.brandSoft)
            .frame(width: 140, height: 140)
            .accessibilityHidden(true)
        Text("No plants yet").motifFont(.heading)
    }
} description: {
    Text("Add one and we'll remind you when it needs water.").motifFont(.body)
} actions: {
    AppButton(title: "Add your first plant", action: addPlant)
}
.transition(.opacity)
.animation(MotifMotion.animation(MotifCurves.enter, reduceMotion: reduceMotion), value: plants.isEmpty)
```

`Color.mix(with:by:)` needs iOS 18; on earlier systems, compute the mix from the roles' components.
