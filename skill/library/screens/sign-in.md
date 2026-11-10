# Sign-in

## Purpose

The sign-in is a first impression and a task at once: people should feel the product before they have an account, and get in without a wrong step. The richness goes in the brand panel and in the form's craft, never in extra controls. Fewer controls mean fewer errors, so the form offers only the sign-in methods the app really has: no invented Google or Apple button, no tabs for a sign-up the app doesn't have ([sign-in pattern](../../knowledge/ux-patterns/sign-in.md)).

## Fits

Every app with an account, on every stack. Three layouts:

**Rich panel (desktop and tablet, side by side).** A `brand` panel on one side, about half the width and the window's full height, holding, in this order of preference:

1. **A layered preview of the product:** two or three of its real cards (the app's own components with realistic data), slightly offset from each other, the front one raised with `shadow.lg`, the ones behind it smaller and on `shadow.sm`. It shows the work the app does at a glance.
2. **Or the brief's drawing**, the activity itself (a cyclist on a hill, a plant in a pot, a suitcase), never an abstract shape.
3. **A quote** under or beside it, in `title` (or `hero` for an energetic brief) in `on-brand`, with the person's name and role in `label` under it.

One [depth piece](../depth/tonal-gradient.md) may sit behind the panel's content: a tonal gradient, a [soft glow](../depth/soft-glow.md) behind the preview, or a [pattern](../depth/pattern.md) for a calm brief; never two. A business or money tool keeps the panel calm in colour: its preview shows the product's normal work (paid, sent, on track), never a list of red overdue items that pulls the eye from the form.

**Crafted form (the other half, or the whole page).** Centred in its half, about 400 px wide, in a raised `surface` card or straight on the page:

1. The app's mark or name at the top.
2. The headline in `hero` ("Welcome back"), one short line under it in `body`, `text-secondary`.
3. Fields at full width, each with its label above and a leading icon (mail, lock) in `text-secondary`; generous space between groups, close space within them.
4. The main button straight under the last field, full width, filled in `action-primary`, with the style's [signature](../accents/playful.md) on it when the style has one on by default.
5. "Forgot password?" or "Email me a link" small under its field; under the button, the way in without an account as one quiet text link.
6. A short footer (help, the language switch) lined up with the form's edge.

**Phone.** One column, no panel: the drawing or mark at the top (no taller than a fifth of the screen), centred or spanning the content width, then the `hero` headline (scaled down for the phone), its line, the fields and the button, starting in the top third. At most one depth piece behind the drawing. The form is at full width on the page or in a full-width `surface` card, never a narrow card inset far from the edges.

For an audience that includes people over 60, one centred card instead (about 440 px wide, the drawing or mark at its top) with roomy type: `title` heading, `body` labels and help, never `caption`.

## Loudness

default. A calm brief keeps the panel on `brand` with a pattern or nothing, and the form plain; an energetic or playful brief runs the panel full height with a tonal gradient or a soft glow, and the form in a raised card with the style's signature on the button.

## Data

- Fixed copy: the headline, its line, labels, the quote and its person (a real or realistic member, written for the app).
- The preview cards' data: realistic sample data in the app's own shape (an invoice with a number, an amount and a date; a run with its distance), never lorem ipsum, never the signed-in person's data.
- The sign-in methods the app really has (password, email link, a provider the app already uses).

## States

- **Loading:** the button shows a spinner in place of its label and stays the same size; the fields stay filled and read-only until the answer comes.
- **Empty:** the button stays enabled; pressing it with an empty field says what is missing under that field.
- **Error:** a wrong password or an unknown email says so under the field in `danger`, keeps what was typed, and moves focus to the field; a network failure says it in one line above the button with a retry.
- **Link sent:** for an email link, the form turns into a short note ("Check your inbox for a link to sign in") with the address and a way to send it again.

## Motion

| Level | Sign-in |
|---|---|
| `lively` | the preview's cards settle in by [stagger](../motion/stagger.md), the front one last with `spring.smooth`; the button gives under the finger ([press](../motion/press.md)) |
| `default` | the same stagger with `easing.enter`; press on the button |
| `calm` | the page fades in as one over `duration.base`; press stays |
| `none` | everything shows at once; nothing moves |

Nothing focuses on load: no field is focused when the page opens, so a phone's keyboard doesn't jump up.

## Accessibility

- The headline is the page's heading; the panel's preview and drawing are hidden from screen readers, and the quote reads as text.
- Every field has a visible label and the right input type and autocomplete (`email`, `current-password`); the leading icons are hidden from screen readers.
- Errors are tied to their field and announced; the button is at least 44 pt / 48 dp tall.
- Text on the panel is `on-brand`, on the form `text-primary`; `text-secondary` lines read at 4.5:1.
- Under reduced motion (level `none`) nothing moves.

## Stacks

### react-web

A two-column grid from `lg` up, one column below; `<MotionConfig reducedMotion="user">` at the root makes the stagger instant.

```tsx
<main className="grid min-h-dvh lg:grid-cols-2">
  <aside className="relative hidden overflow-hidden bg-brand p-12 text-on-brand lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
    <PreviewStack cards={sampleCards} />
    <blockquote className="mt-10 font-display text-title">{quote}<footer className="mt-3 text-label">{person}</footer></blockquote>
  </aside>
  <section className="flex items-center justify-center p-6">
    <form className="w-full max-w-[400px] space-y-5" onSubmit={signIn}>
      <h1 className="font-hero text-hero">Welcome back</h1>
      <Field label="Email" icon={<Mail aria-hidden />} type="email" autoComplete="email" />
      <Button className="w-full">Sign in</Button>
    </form>
  </section>
</main>
```

### plain-web

The same grid in CSS; the stagger sits inside `prefers-reduced-motion: no-preference`.

```css
.sign-in { display: grid; min-height: 100dvh; }
@media (min-width: 1024px) { .sign-in { grid-template-columns: 1fr 1fr; } }
.sign-in-panel { background: var(--motif-color-brand); color: var(--motif-color-on-brand); padding: var(--motif-space-12); }
.sign-in h1 { font: var(--motif-font-hero-weight, var(--motif-font-display-weight)) var(--motif-font-hero-size, var(--motif-font-display-size)) / 1.05 var(--motif-font-hero-family, var(--motif-font-display-family)); }
```

### vue

The grid in the template; the preview cards are the app's own card components with sample props, and their entrance CSS sits inside `prefers-reduced-motion: no-preference`.

```vue
<main class="grid min-h-dvh lg:grid-cols-2">
  <aside class="hidden lg:flex flex-col justify-center bg-brand p-12 text-on-brand" aria-hidden="true"><PreviewStack :cards="sample" /></aside>
  <section class="flex items-center justify-center p-6"><SignInForm /></section>
</main>
```

### svelte

The grid in markup; the preview cards arrive with `in:fly` by index, skipped when `prefersReducedMotion.current` is true.

```svelte
<main class="grid min-h-dvh lg:grid-cols-2">
  <aside class="panel" aria-hidden="true">{#each sample as card, i}<div in:fly={{ y: prefersReducedMotion.current ? 0 : 8, delay: i * 60 }}><Card {...card} /></div>{/each}</aside>
  <section class="form-side"><SignInForm /></section>
</main>
```

### angular

The grid in the component's template and CSS; the stagger CSS inside `prefers-reduced-motion: no-preference`.

```html
<main class="sign-in">
  <aside class="sign-in-panel" aria-hidden="true"><app-preview-stack [cards]="sample" /></aside>
  <section class="sign-in-form"><app-sign-in-form /></section>
</main>
```

### flutter

`LayoutBuilder`: side by side from 900 wide, one column below. Durations go through `MotifMotion.duration(context, …)`, zero under reduce motion.

```dart
LayoutBuilder(builder: (context, c) {
  final colors = MotifColors.of(context);
  final form = Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 400), child: SignInForm()));
  if (c.maxWidth < 900) return SafeArea(child: form);
  return Row(children: [
    Expanded(child: ExcludeSemantics(child: ColoredBox(color: colors.brand, child: PreviewStack(cards: sample)))),
    Expanded(child: form),
  ]);
})
```

The headline uses `MotifText.hero` when the theme has it, else `MotifText.display`.

### compose

`BoxWithConstraints`: a `Row` from 900 dp, a `Column` below. Read `MotifMotion.reduced()` and skip the preview's entrance when it is true.

```kotlin
BoxWithConstraints(Modifier.fillMaxSize()) {
    if (maxWidth >= 900.dp) Row(Modifier.fillMaxSize()) {
        PreviewPanel(Modifier.weight(1f).fillMaxHeight().background(MotifTheme.colors.brand).clearAndSetSemantics { })
        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { SignInForm(Modifier.widthIn(max = 400.dp)) }
    } else SignInForm(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(MotifSpace.s6))
}
```

### react-native

A phone layout: the drawing at the top, then the form; on a tablet (`useWindowDimensions().width >= 900`) the panel beside it. When `useReducedMotion()` is true, leave out the `entering` animations.

```tsx
const { width } = useWindowDimensions();
const reduced = useReducedMotion();
<View style={{ flex: 1, flexDirection: width >= 900 ? "row" : "column", backgroundColor: colors.background }}>
  {width >= 900 && <View style={{ flex: 1, backgroundColor: colors.brand }} accessibilityElementsHidden><PreviewStack animate={!reduced} /></View>}
  <View style={{ flex: 1, padding: space.s6, justifyContent: "center" }}><SignInForm /></View>
</View>
```

### swiftui

`ViewThatFits` or a size class: an `HStack` with the panel on regular width, the form alone on compact. Under `accessibilityReduceMotion` the preview appears without animation.

```swift
@Environment(\.horizontalSizeClass) private var size
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@Environment(\.motifColors) private var colors

HStack(spacing: 0) {
    if size == .regular { PreviewPanel(cards: sample).frame(maxWidth: .infinity, maxHeight: .infinity).background(colors.brand).accessibilityHidden(true) }
    SignInForm().frame(maxWidth: 400).frame(maxWidth: .infinity)
}
```
