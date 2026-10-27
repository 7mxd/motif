# Character

A screen can follow every rule in the design guide and still look as if nobody cared about it: tidy, correct and forgettable. People decide in the first few seconds whether an app feels like what it is, so the brief's personality has to show at a glance. This file says where the brand gets to be loud, how loud, and how to build those moments from the guide's roles. The other knowledge files say what to avoid; this one says what to add.

## The five-second test

Look at a screenshot of the welcome screen for five seconds, then write down three words for how it feels. Compare them with the personality words in `DESIGN.md` section 1.

- If your words match ("energetic, bold, friendly" for a running club that asked for energetic and friendly), the screen has character.
- If your words are "clean, tidy, plain" or "calm, muted" and the brief asked for something else, the screen isn't finished, however correct it is.

Run it on the welcome or landing screen, sign-in and home, on a phone and (for web apps) a desktop.

## Turn the dial to the brief

How loud the brand gets follows the personality words, not a house style:

| The brief says | Brand moments |
|---|---|
| calm, precise, quiet, professional, premium | One refined moment per first-impression screen: a deep `brand` panel beside the sign-in form, a well-set `display` headline, a realistic preview of the product. Quiet everywhere else. |
| friendly, gentle, warm, reassuring | Soft `brand-soft` tints, a friendly illustration on the welcome screen and empty states, rounded icon tiles, warm copy. |
| energetic, bold, playful, fun, adventurous | A full `brand` band on the welcome screen, a big `display` headline in the heaviest weight the font has, an illustration or mascot, colour-coded content, proof in numbers and faces, lively motion. |

A quiet brief still gets its one moment, and a loud brief still keeps its working screens easy to read.

## Where the brand is loud

- **First impressions:** the welcome or landing page, onboarding, sign-in, empty states and success moments. The brand lives here.
- **Working screens:** lists, forms, settings and dashboards. Here the [visual craft](visual-craft.md) rules hold: about a tenth accent, one primary action, `action-primary` only for acting. Character shows in the details: the screen's key number in `display`, initials avatars of the people involved, tinted category tiles, an illustrated empty state.

## The brand roles

Every starting style has three optional colour roles for this; a theme without them can add them (with their readability pairs, described in `DESIGN.md` section 3 and logged in the change log):

- `brand`: the brand's own colour for bands, panels, illustration fills and a highlighted stat. Never for buttons or links: those stay `action-primary`, so people can still tell what they can press.
- `on-brand`: text and icons on a `brand` fill.
- `brand-soft`: a quiet tint for icon tiles, highlighted rows and the ground behind an illustration.

On a `brand` band, the main button is drawn in `on-brand` with `brand` text (or `surface` with `text-primary`), so it stays the strongest thing on the band; a second action is an outline or a text link. In dark mode the band is deeper and smaller, as large saturated areas are in [visual craft](visual-craft.md).

## Building a brand moment

- **Web welcome or landing page:** a `brand` band (or a `brand-soft` one for gentler briefs) holding a `display` headline of two short lines, one line on what the app does for them, the main action and a quiet second one, then proof: a row of facts ("7 runs a week · 3–16 km · free to join"), the faces of people who use it, or a preview of the app's main screen with realistic content. Below the band, the page can calm down.
- **Phone welcome:** an illustration or the app's mark in the top third, the headline, one line, and the actions at the bottom within thumb reach.
- **Sign-in:** on a desktop, a `brand` panel beside the form holding a member's quote, an illustration or a preview of the product; on a phone, the mark or a small illustration above the form. Public pages show no signed-in chrome: no avatar, no tab bar.
- **What the app does:** three short rows, each with an icon tile on `brand-soft`, read faster than bare icons or text alone (and aren't the identical card grid from [anti-patterns](anti-patterns.md)).
- **Kinds of content:** when items come in kinds people choose between (a pace, a category, a status), give each kind its own tint and its name in words, the same way everywhere.

## Illustration

A simple drawn illustration does more for character than any colour choice. Draw it, don't download it:

- A few geometric shapes in role colours only (`brand`, `brand-soft`, `surface`, `text-primary` and the status colours), so it follows dark mode and `motif check` passes. A subject from the app's world: a plant in a pot, a route line under a sun, a stack of invoices, a ticket.
- For playful briefs, a face makes it a mascot (two dots and a smile on the pot).
- One illustration per screen, sized to the moment: about a third of a phone's welcome screen, smaller in an empty state, none on working screens.
- It's decoration: hidden from screen readers (`aria-hidden="true"` on the web, excluded from accessibility on native platforms).
- Each stack draws it with its own tools: inline `<svg>` with `fill="var(--motif-color-brand)"` or `currentColor` on the web; `Canvas` in Compose; `CustomPaint` in Flutter; `Shape` and `Path` in SwiftUI; `react-native-svg` in Expo (ask before adding it) or composed views. Mockups use an inline `<svg>` inside the preview kit's `.mk-art`.
- Never emoji in its place (see [emoji as UI](anti-patterns.md#emoji-as-ui)).

## Details that read as care

- **Headlines break well.** No single word alone on a headline's last line: `text-wrap: balance` on the web, and shorter copy where a platform can't balance lines.
- **The second button stays quiet.** A second action on `surface` with a `border`, or a text button. Two saturated buttons side by side make people stop and compare.
- **Bilingual apps show their language switch** on public screens (at the top end), not only in settings.
- **Real-looking content.** Names, initials avatars, counts, exact times and places. A list of people going reads warmer than "12 attendees".
- **A desktop is not a stretched phone.** Use the width: a panel beside the form, a preview beside the headline, two columns for a list and its detail.

## Before you finish

1. The five-second test passes on the welcome, sign-in and home screens, on a phone and a desktop.
2. Each first-impression screen has its brand moment, as loud as the brief asks.
3. Working screens still pass the [visual craft](visual-craft.md) checklist: the brand didn't spill into buttons, links or long lists.
4. Illustrations use role colours only, look right in dark mode, and are hidden from screen readers.
