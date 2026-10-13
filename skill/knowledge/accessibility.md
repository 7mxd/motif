# Accessibility

Motif aims every app at WCAG 2.2 level AA. Much of that is built in: the design guide's readability pairs fix contrast, the `focus` role gives every control a visible focus ring, and the type roles scale with the viewer's text size. The rest depends on how screens are assembled, which is what this file covers. Accessible screens are also simply better screens: clearer labels, bigger targets and honest states help everyone.

## Contrast

| What | Minimum |
|---|---|
| Normal text | 4.5:1 |
| Large text (at least 24 px, or about 18.7 px bold) | 3:1 |
| UI parts: input borders, focus rings, icons that carry meaning, chart lines | 3:1 against what's next to them |

These apply in light and dark mode alike.

**The guide encodes this.** Each readability pair in `design/tokens.json` names a text or on-colour role and the surface it sits on, and `motif validate` checks every pair in both modes. When a screen puts a text role on a surface that has no pair yet, add the pair and validate, rather than eyeballing it.

**Never rely on colour alone.**

- Errors have words ("Enter a valid email"), not just a red border.
- Required fields say "required", or use a symbol that is explained.
- Links inside text are underlined or otherwise distinct beyond colour.
- Charts label their series directly or use patterns and shapes as well as colour.
- Status badges carry an icon or a word next to the colour.

**Text over images** needs a scrim (a dark gradient behind the text) or a solid surface. Check contrast against the lightest part of the image the text can overlap.

## Target size

- At least **24×24** CSS px for every target, with space around it (WCAG 2.2 AA).
- At least **44×44** on touch screens: Apple's guideline is 44 pt and Android's is 48 dp. Motif uses 44 as the shared floor.
- Small icons get padding to reach the size; the visible icon can stay 20 px while the hit area is 44.
- Keep adjacent targets apart, so a slightly-off tap doesn't hit the neighbour (`space.2` at least between icon buttons).
- Inline links in a paragraph are the exception; everything else follows the rule.

`motif shot --audit` measures the rendered targets of the running app and reports the ones that are too small.

## Keyboard and focus

- Everything works with a keyboard alone, in an order that follows the layout: start to end, top to bottom.
- No keyboard traps: focus can always move on, except inside an open dialog, where it cycles until the dialog closes.
- Every interactive element shows a visible focus ring using the `focus` role. Never remove the focus style without a replacement; show it for keyboard focus, not for every mouse click.
- Focus is never hidden behind sticky headers, cookie banners or toasts (new in WCAG 2.2).
- Dialogs and sheets move focus inside when they open, return it to the control that opened them when they close, and close with Escape.
- Pages with a lot of navigation before the content have a "Skip to content" link as the first focusable item.
- Anything done by dragging (reordering, sliders, swipe-to-delete) also has a single-tap or keyboard alternative (new in WCAG 2.2).

## Text and zoom

- Text can grow to 200% without losing content, overlapping or needing sideways scrolling on a phone-width page.
- No fixed-height containers around text; let them grow.
- Respect the platform's text size setting on mobile (Dynamic Type on iOS, font scale on Android); test the largest common size.
- Layouts reflow at narrow widths instead of shrinking text.

## Names, labels and announcements

**Every input has a visible label.** Placeholders are not labels: they disappear as people type and are usually too faint. Put the label above the field and use the placeholder only for an example format.

**Every control has an accessible name.** Icon-only buttons (close, menu, share) get a name that says what they do ("Close", not "X icon").

**Images have alt text that says what matters.** A product photo's alt names the product; a chart's alt states the takeaway. Decorative images get an empty alt so screen readers skip them.

**Use real elements.** Buttons for actions, links for navigation, real headings in order (one top-level heading per page, no skipped levels), real lists for lists. A clickable box is not a button to a screen reader or a keyboard.

**Announce changes that happen in place.** Toasts, form errors, "3 results", "Saved" and loading finished are announced through a polite live region (`aria-live="polite"` on the web, the platform's announcement API on mobile). Use an assertive announcement only for errors that block progress.

## Forms

- Show errors next to the field, in words, saying how to fix it: "Use at least 8 characters", not "Invalid input".
- On long forms, also summarise the errors at the top and move focus to the summary when submitting fails.
- Never clear what people typed when there is an error.
- Use the right input types (email, phone, number) and autocomplete hints, so phones show the right keyboard and browsers can fill details.
- Group related fields (an address, a card) with a group label.
- Don't make people type the same information twice in one flow (new in WCAG 2.2): offer "same as shipping address".
- Sign-in must not depend on a memory or puzzle test: allow pasting into password and code fields and support password managers (new in WCAG 2.2).

## Motion and flashing

- Honour reduced motion: remove movement, keep fades (the details are in [motion](motion.md)).
- Nothing flashes more than three times a second.
- Anything that moves, scrolls or updates automatically for more than five seconds can be paused, stopped or hidden.
- Never auto-play sound.

## Right-to-left and languages

- Lay out with **start** and **end**, not left and right, so right-to-left languages (Arabic, Hebrew, Persian, Urdu) mirror correctly.
- Icons that show direction mirror too: back, forward, chevrons in lists, reply.
- Some things don't mirror: numbers, clocks, media playback controls, logos, and charts with a time axis.
- Leave room for longer translations, about 30% more than English for short labels; never fix a button's width to its English label.
- Never put text inside images; it can't be translated, resized or read aloud.
- Set the page or app language so screen readers pronounce it correctly.

## Common components

| Component | Make sure |
|---|---|
| Button | A real button with a verb label; disabled buttons explain why nearby, or stay enabled and show the error on press |
| Text field | Visible label above, error text below, the right input type, and the error announced when it appears |
| Toggle and checkbox | The label is part of the target, so tapping the words works; the state is exposed, not only drawn |
| Tabs | Arrow keys move between tabs; the selected tab is exposed as selected, not just highlighted |
| Menu | Opens from its button, arrow keys move through items, Escape closes and returns focus to the button |
| Dialog and sheet | Focus moves in and is held there, Escape closes, and the title is announced on open |
| Toast | Announced politely; stays long enough to read (at least 5 s); any action in it is also reachable elsewhere |
| Carousel | Has previous and next controls and a pause control, and never moves on its own under reduced motion |

## Testing it yourself

A few minutes of checks catch most problems before a review does:

- **Keyboard:** put the mouse away and Tab through the screen. Can you reach and use everything, and always see where you are?
- **Zoom:** set the browser to 200%, or the phone to its largest text size. Does anything overlap, cut off or disappear?
- **Screen reader:** turn on VoiceOver (Apple), TalkBack (Android) or NVDA (Windows) and move through the screen once. Does every control say what it is and what it does?
- **Reduced motion:** turn the setting on and repeat the main flow.
- **Right-to-left:** switch the layout direction and look for anything that didn't mirror, or mirrored when it shouldn't.

## Checklist

1. Every text-on-surface combination has a readability pair, and both modes pass.
2. Nothing relies on colour alone: errors, status, links and charts all carry words, icons or shapes.
3. Every target is at least 24×24, and 44×44 on touch screens.
4. The whole screen works with a keyboard, in a sensible order, with a visible focus ring; dialogs and sheets move focus in, return it on close, and close with Escape.
5. Text grows to 200% without breaking the layout.
6. Every input has a visible label; every icon-only button has a name; every meaningful image has alt text.
7. Headings, lists, buttons and links are real elements, in a logical order.
8. In-place changes (toasts, errors, results) are announced.
9. Form errors are next to the field, in words, and keep what people typed.
10. Reduced motion is honoured, and nothing flashes.
11. Layouts use start and end, directional icons mirror, and labels have room to grow.
12. Run `motif validate` and `motif shot --audit`, and fix what they report.
