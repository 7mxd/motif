# Character

A screen can follow every rule in the design guide and still look as if nobody cared about it: tidy, correct and forgettable. People decide in the first few seconds whether an app feels like what it is, so the brief's personality has to show at a glance. This file says where the brand gets to be loud, how loud, and how to build those moments from the guide's roles. The other knowledge files say what to avoid; this one says what to add.

## The five-second test

Look at a screenshot of the welcome screen for five seconds, then write down three words for how it feels. Compare them with the personality words in `DESIGN.md` section 1.

- If your words match ("energetic, bold, friendly" for a running club that asked for energetic and friendly), the screen has character.
- If your words are "clean, tidy, plain" or "calm, muted" and the brief asked for something else, the screen isn't finished, however correct it is.
- Every one of the brief's words counts, not just the loudest. "Playful, fresh, friendly" for a brief of "playful, fresh, gentle, reassuring" misses two of them. When you compare directions, the one that misses the fewest wins; a full saturated band reads as bold or energetic, never as gentle or calm.

Run it on the welcome or landing screen, sign-in and home, on a phone and (for web apps) a desktop.

## Turn the dial to the brief

How loud the brand gets follows the personality words, not a house style:

| The brief says | Brand moments |
|---|---|
| calm, precise, quiet, professional, premium | A light page with one refined moment per first-impression screen: a well-set `display` headline (in the serif, when the pairing has one, with one word accented), a realistic preview of the product on a raised card, generous space, a short label above the headline. A deep `brand` area at most once: the sign-in panel or the closing band of a landing page, never a heavy block at the top. Quiet everywhere else. |
| friendly, gentle, warm, reassuring | Soft `brand-soft` tints, a friendly illustration on the welcome screen and empty states, rounded icon tiles, warm copy. |
| playful and gentle together (fun words with soft ones: gentle, fresh, reassuring, cosy) | A light page with a soft `brand-soft` wash, a carefully drawn illustrated scene (a mascot is welcome) beside or above the headline, one headline word in `brand`, small tinted chips for what the app does, rounded generous buttons. No saturated full-width band: the colour lives in the drawing and the accents. |
| energetic, bold, playful, fun, adventurous | A full `brand` band on the welcome screen, a big `display` headline in the heaviest weight the font has, an illustration or mascot, colour-coded content, proof in numbers and faces, lively motion. |

A quiet brief still gets its one moment, and a loud brief still keeps its working screens easy to read. When the words mix rows, the gentler word sets the ground and the louder one shows in the details.

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
- **The first screen is the whole pitch:** headline, one line, the main action and the brand moment all visible without scrolling, on a phone and a desktop.
- **How much follows depends on the product.** A tool people weigh up before they pay for it (invoicing, a business or money app) tells the whole story below the first screen, in this order: what it does (three rows), how it works (three numbered steps), proof (a short quote with a name, or a few real numbers), a closing band with the main action again, and a footer. A simple everyday app (plants, habits, a club) stays focused: at most one short section more and the footer; a long page spreads its attention thin. Either way, never the same card grid four times.
- **The headline can accent one word:** in the `brand` colour, in italic when the headline is set in a serif, or with a `brand-soft` marker behind it. One word, not the whole line.
- **Phone welcome:** an illustration or the app's mark in the top third, the headline, one line, and the actions at the bottom within thumb reach.
- **Sign-in:** on a desktop, a `brand` panel beside the form holding a member's quote, an illustration or a preview of the product; on a phone, a small illustration or the mark above the form, never both stacked, aligned the same way as the heading under it (all centred or all at the start). Public pages show no signed-in chrome: no avatar, no tab bar.
- **What the app does:** three short rows, each with an icon tile on `brand-soft`, read faster than bare icons or text alone (and aren't the identical card grid from [anti-patterns](anti-patterns.md)).
- **Kinds of content:** when items come in kinds people choose between (a pace, a category, a status), give each kind its own small mark (an icon or a dot in its colour) and its name in words, the same way everywhere. Keep the badges themselves one family: soft tints (`brand-soft`, `surface-raised`) with dark text. A saturated fill is for what needs attention now (late, cancelled, full); three or four saturated colours in one list look scattered.

## Illustration

A simple drawn illustration does more for character than any colour choice. Draw it, don't download it:

- A few geometric shapes in role colours only (`brand`, `brand-soft`, `surface`, `text-primary` and the status colours), so it follows dark mode and `motif check` passes. A subject from the app's world: a plant in a pot, a route line under a sun, a stack of invoices, a ticket.
- A small scene beats a lone object: a soft `brand-soft` shape behind, the subject, and two or three supporting pieces (a smaller plant, a sun, floating icon tiles). A single shape in the middle of a band reads as clip art.
- Draw it with care, as people judge the whole screen by it: every shape is recognisable (a circle is a sun with a soft halo, never a stray dot), the colours stay in one family (the brand's greens or blues, `brand-soft`, one warm status colour such as `warning`, never `text-primary` black for an object), small details carry the charm (cheeks, a highlight on a leaf, a soft shadow under the pot), and pieces don't overlap awkwardly or get clipped by the frame.
- A small floating card from the app itself ("Monty is thirsty · Water today") next to the drawing ties it to what the app does.
- Look at the drawing on its own in the screenshot before you finish. If it looks rough next to the type, simplify it rather than ship it.
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
- **A desktop is not a stretched phone.** Use the width: a panel beside the form, a preview beside the headline, two columns for a list and its detail. A sidebar earns its width with real navigation; with only two or three places to go, use a top bar instead. Columns side by side start at the same top line.

## Slips that undo it

People comparing two screens notice small slips before they notice style, and one slip can lose a screen that is better in every other way. Check each first-impression and home screen for these:

- **Every label sits the same distance above its field.** A "Forgot password?" link in the password label's row must not make that row taller (see [sign-in](ux-patterns/sign-in.md)).
- **One focus mark.** A focused field changes its border to `focus` or gets a ring flush against it, never a ring with a gap outside a border that still shows: that reads as a double border. Screenshots often catch the first field focused, so check how it looks.
- **Groups, then gaps.** On a short screen like sign-in, things that belong together sit close (the mark, heading and line; each label and field), the gaps between groups are larger, and the space left over goes below the content, not spread between fields.
- **Inline text matches.** A question and its link ("New to Ledgerly? Create an account"), or a value and its unit, share one size and one baseline.
- **Item titles are never smaller than their descriptions.** In a feature row or a list item the title is `heading` (or `body` in a heavier weight) and the description is `body` or `caption` in `text-secondary`, never larger than the title above it.
- **Counts match what's shown.** "To do today (3)" lists three items, or ends with "Show all".
- **Rows line up.** Titles start at the same place in every row: a leading badge whose width changes with its word pushes them out of line, so status badges go at the end of the row (or the leading slot gets one fixed width). On a phone, titles wrap to a second line instead of ending in "…"; shorten the copy if they're long.
- **Each action appears once.** "Sign in" in the header and again beside the main action is one too many; the hero's second action is something else ("See how it works") or nothing.
- **The main action clearly outweighs the second one,** by fill as well as position.
- **Small grey text is rare.** A row's second line is `label` or `body` in `text-secondary`, not `caption`; `caption` is for a timestamp or a count. A screen where most of the text is small and grey looks unfinished.
- **Repeated actions look alike and stay put.** Every row's action sits in the same place (the end of the row) at the same width, whatever it says: "Join", "Going ✓" or "Full" share one shape, with the state in its words and colour, never a paler button that looks disabled or one that moves below the text in some rows. A row's quieter link ("Can't make it") lines up with the row's text. Buttons people should press look pressable: a fill or border that stands out, not a pale tint.
- **Short labels don't break.** Chips, badges and short facts ("Living room", "12 going") never wrap mid-phrase: shorten them, or let the whole chip move to the next line.
- **Home leads with one thing.** Today's focus first (the next run, today's plants, the amount owed), then a few rows and "See all". A phone's first screen is not a dense list of everything, and a desktop's is not one narrow column beside a large empty area.
- **No stray scaffolding.** No "Demo: name / password" hints, "Lorem", placeholder routes or debug labels on screen; mock sign-in details go in the README.
- **Backgrounds run to the end.** A sidebar's colour reaches the bottom of a long page (let the layout's grid stretch it, with the navigation inside it sticky), and a gradient covers the whole page instead of stopping in a band.

## Before you finish

1. The five-second test passes on the welcome, sign-in and home screens, on a phone and a desktop.
2. Each first-impression screen has its brand moment, as loud as the brief asks.
3. None of the slips above, on any of those screens: look at each screenshot once just for them.
4. Working screens still pass the [visual craft](visual-craft.md) checklist: the brand didn't spill into buttons, links or long lists.
5. Illustrations use role colours only, look right in dark mode, and are hidden from screen readers.
