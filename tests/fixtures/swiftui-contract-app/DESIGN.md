---
motifContract: 1
name: Qahwa
updated: 2026-10-21
---

# Qahwa design guide

Qahwa ("coffee" in Arabic) is the loyalty app of a neighbourhood coffee shop: the menu, a drink's page, and the card that collects a stamp with every drink until the tenth one is on the house. It feels like the shop itself: warm cream, roasted browns, a serif for headings like the chalkboard over the counter, and room to breathe. It speaks English and Arabic equally well, so every layout is written from the leading and trailing edges of a line, never its left and right, and prices read in each language's own way.

## 1. Brief

- **What it is:** an iPhone app for regulars of one coffee shop: browse the menu, open a drink to read about it and add it to an order, see the loyalty card and its stamps, and sign in with the email the card is under.
- **Who it is for:** people who stop by on the way to work or in the evening, in Arabic or English, with the app open for a few seconds at the counter.
- **Personality:** warm, unhurried, generous, plain.
- **Voice and tone:** the barista who knows your order. Short sentences, real prices, no exclamation marks. "3 more drinks until a free one" rather than "Almost there!!"

## 2. Direction

- **Style:** the Warm starting style, roasted: cream and espresso neutrals, a cinnamon accent, a latte foam for supporting actions. Headings in the system's serif (New York), text in the system's sans-serif (San Francisco), and Readex Pro for Arabic, bundled with the app.
- **Starting preset:** Warm.
- **References:** none.
- **Approved mockups:** none yet; the screens were built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the screen; `surface` holds fields; `surface-raised` lifts the drink cards and the loyalty card. `action-primary` (cinnamon) marks the one main action on a screen, prices and filled stamps; `action-secondary` (latte foam) is for supporting actions. Status colours only for status: `success` for a drink added to the order, `danger` for field errors. Text uses `text-primary`, and `text-secondary` for descriptions, help and the member number.
- **Type:** `title` once per screen (its first heading); `heading` for sections; `body` for drink names and content; `label` for controls and prices; `caption` for help under fields. Headings are the system's serif and text its sans-serif, both scaled with Dynamic Type; Arabic text of every role is Readex Pro, chosen by the app's language.
- **Spacing:** the 4 pt scale. `space.1`–`space.3` inside controls and cards, `space.4` side padding and between cards, `space.6` between groups, `space.8` between page sections.
- **Corners and elevation:** `radius.sm` for small marks, `radius.md` (12) for buttons and fields, `radius.lg` (20) for cards, `radius.full` for stamps. Cards use a `border` and no shadow.
- **Icons:** SF Symbols in the text colour, the cup for stamps; symbols that point are the ones that mirror (`chevron.forward`, `arrow.backward`); a button that shows only a symbol always has a name.

## Variants

- **Variants and who they serve:** **default** is Qahwa's own look, in cream and cinnamon, for the day. **evening** (Evening) is the shop after dark: a dusk-lilac screen and a plum accent, for regulars who come by for the evening menu. It changes only `background`, `surface`, `surface-raised`, `border`, `text-secondary`, `action-primary`, `action-secondary` and `focus`, and is readable in light and dark.
- **How the app chooses:** a switch on the loyalty card ("Evening colours"), remembered on the phone. It starts off.
- **What changes beyond theme values:** nothing. SwiftUI variants change colours only, so type, corners, spacing and motion stay the default's.
- **What stays the same:** the layout, the words, the symbols and every status colour.

## 4. Motion

- **Presses and small changes:** a pressed button dims at once; the "Added to your order" line arrives with `easing.enter` over `duration.base`.
- **Screens and sheets:** the `NavigationStack`'s own push and the swipe back.
- **Lists and content:** the menu appears at once (it is on the phone); nothing staggers.
- **Reduced motion:** every animation goes through `MotifMotion.animation(…, reduceMotion:)`, so with Reduce Motion on the line appears without moving.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| AppButton | Actions | primary, secondary | default, pressed, disabled |
| AppField | One line of text, or a password | — | label, focused, error |
| DrinkCard | A drink in the menu, opening its page | — | default, pressed |
| LoyaltySummary | The card's stamps on the menu, opening the card | — | default, pressed |
| StampGrid | The ten stamps of the card | — | stamps collected, none yet |

- **Do:** reuse these before adding new ones; extend with an option first.
- **Don't:** style a one-off button or card inline.

## 6. Patterns

- **Navigation:** the menu is the start; a drink's page and the loyalty card open from it in the `NavigationStack`, with the system's back button. Everything needs someone signed in: anyone else sees Sign in.
- **Forms:** each field's label sits above it and stays while typing; errors sit below the field in words, with a symbol; checked on submit.
- **Empty, loading and error:** the menu and the card live on the phone, so there is no loading; a card with no stamps says so in words.
- **Feedback:** adding a drink shows one line under the button ("Added to your order"); no alerts for small things.
- **Modal or sheet:** none yet; alerts only for decisions that need an answer.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark, in both variants.
- Every touch target is at least 44×44 pt.
- Text scales with Dynamic Type through `.motifFont`, and wraps rather than being cut off.
- The stamps are read as one element ("7 of 10 stamps"), not ten pictures.
- Layouts use leading and trailing (`.padding(.leading)`, `alignment: .leading`), never left and right, and pointing symbols mirror, so Arabic mirrors correctly.

## 8. Platform notes

- **iOS (SwiftUI):** iOS 17 and later, iPhone first. A `NavigationStack` with the system's back button; system toggles and fields with the guide's tint. Arabic follows the phone's language, and prices are formatted for it (Saudi riyals).

## 9. Do / Don't

- **Do:** show prices with their currency; keep one primary action per screen; say how many stamps are left in words.
- **Don't:** use colour alone to show a stamp is collected; hard-code left or right; hurry people with countdowns.

## 10. Change log

- 2026-10-21 — Created the design guide, with the Evening variant — the Warm style, roasted, suits a neighbourhood coffee shop — approved by the Motif team
