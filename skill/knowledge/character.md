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
| playful and gentle together (fun words with soft ones: gentle, fresh, reassuring, cosy) | A light page with a soft `brand-soft` wash, a carefully drawn illustrated scene (a mascot is welcome) beside or above the headline, one headline word in `brand`, what the app does as three short rows with icon tiles, rounded generous buttons. No saturated full-width band: the colour lives in the drawing and the accents. |
| energetic, bold, playful, fun, adventurous | A full `brand` band on the welcome screen, a big `display` headline in the heaviest weight the font has, an illustration or mascot, colour-coded content, proof in numbers and faces, lively motion. |

A quiet brief still gets its one moment, and a loud brief still keeps its working screens easy to read. When the words mix rows, the gentler word sets the ground and the louder one shows in the details.

## Where the brand is loud

- **First impressions:** the welcome or landing page, onboarding, sign-in, empty states and success moments. The brand lives here.
- **Working screens:** lists, forms, settings and dashboards. Here the [visual craft](visual-craft.md) rules hold: about a tenth accent, one primary action, `action-primary` only for acting. Character shows in the details: the screen's key number in `display`, today's focus card (the next run, the amount owed) in `brand` with `on-brand` text when the brief is energetic, bold, playful or friendly (a pale card there reads as flat), initials avatars of the people involved, tinted category tiles, an illustrated empty state. For playful, friendly or energetic briefs the dial reaches these screens too, or they read as "clean but plain" beside the welcome screen: each item gets a small drawn thumbnail from the same family as the welcome drawing (the plant's pot with its face, a run's route line), kinds get colour-coded tags, a to-do gets a round check-off circle, and buttons feel tactile (below). Quiet briefs keep their working screens plain.

## The brand roles

Every starting style has three optional colour roles for this; a theme without them can add them (with their readability pairs, described in `DESIGN.md` section 3 and logged in the change log):

- `brand`: the brand's own colour for bands, panels, illustration fills and a highlighted stat. Never for buttons or links: those stay `action-primary`, so people can still tell what they can press.
- `on-brand`: text and icons on a `brand` fill. Pick `brand` deep enough that `on-brand` can be white or near-white at 4.5:1 or more (a burnt orange, not a tangerine; a forest green, not a lime). Near-black text on a bright band looks muddy at a glance, even when it passes; keep the bright shade for the drawing's highlights.
- `brand-soft`: a quiet tint for icon tiles, highlighted rows and the ground behind an illustration.

On a `brand` band, the main button is drawn in `on-brand` with `brand` text (or `surface` with `text-primary`), so it stays the strongest thing on the band; a second action is an outline or a text link. In dark mode the band is deeper and smaller, as large saturated areas are in [visual craft](visual-craft.md).

## Building a brand moment

- **Web welcome or landing page:** a `brand` band (or a `brand-soft` one for gentler briefs) holding a `display` headline of two short lines, one line on what the app does for them, the main action and a quiet second one, then proof: a row of facts ("7 runs a week · 3–16 km · free to join"), the faces of people who use it, or a preview of the app's main screen with realistic content. Below the band, the page can calm down.
- **The first screen is the whole pitch:** headline, one line, the main action and the brand moment all visible without scrolling, on a phone and a desktop.
- **How much follows depends on the product.** A tool people weigh up before they pay for it (invoicing, a business or money app) tells the whole story below the first screen, in this order: what it does (three rows), how it works (three numbered steps), proof (a short quote with a name, or a few real numbers), a closing band with the main action again, and a footer. A simple everyday app (plants, habits, a club) stays focused: one section showing a sample of its real content as proof (this week's runs, a plant's care card), a closing line with the main action again, and the footer; a long page spreads its attention thin, and a hero followed by only three feature rows looks sparse. Either way, never the same card grid four times. On a phone, an everyday app's welcome is one tight screen, a little more at most: a smaller drawing, the headline, one line, three compact rows (an icon tile and one line each), the main action and the quiet second one. The sample of real content and any further sections show from tablet width up, not on the phone.
- **The headline can accent one word:** in the `brand` colour, in italic when the headline is set in a serif, or with a `brand-soft` marker behind it. One word, not the whole line.
- **Phone welcome:** an illustration in the top third, the headline, one line, then the main action straight under that line (and the quiet second one under it), then what the app does in three rows. On a native app's welcome screen with nothing below, the actions can sit at the bottom within thumb reach instead; on a web page they follow the text, never a screen away from it.
- **Sign-in:** on a desktop, a `brand` panel beside the form holding a member's quote, an illustration or a preview of the product; on a phone, a small drawn illustration above the heading for friendly, warm or playful briefs (the app's mark alone is for quiet ones), never both stacked, aligned the same way as the heading under it (all centred or all at the start). The phone sign-in fills its screen: the drawing and heading in the top third, the form below, never a short form at the top over an empty bottom half. Public pages show no signed-in chrome: no avatar, no tab bar.
- **What the app does:** three short rows, each with an icon tile on `brand-soft`, read faster than bare icons or text alone (and aren't the identical card grid from [anti-patterns](anti-patterns.md)).
- **Kinds of content:** when items come in kinds people choose between (a pace, a category, a status), give each kind its own small mark (an icon or a dot in its colour) and its name in words, the same way everywhere. Keep the badges themselves one family: soft tints (`brand-soft`, `surface-raised`) with dark text. A saturated fill is for what needs attention now (late, cancelled, full); three or four saturated colours in one list look scattered.

## Illustration

A simple drawn illustration does more for character than any colour choice. Draw it, don't download it:

- A few geometric shapes in role colours only (`brand`, `brand-soft`, `surface`, `text-primary` and the status colours), so it follows dark mode and `motif check` passes. A subject from the app's world: a plant in a pot, a route line under a sun, a stack of invoices, a ticket.
- A small scene beats a lone object: a soft `brand-soft` shape behind, the subject, and two or three supporting pieces (a smaller plant, a sun, floating icon tiles). A single shape in the middle of a band reads as clip art.
- Draw it with care, as people judge the whole screen by it: every shape is recognisable (a circle is a sun with a soft halo, never a stray dot), the colours stay in one family with one or two cheerful accents (the brand's greens or blues and `brand-soft`, plus a light warm accent such as a soft yellow sun or pink cheeks, never `text-primary` black for an object; a dark text-safe shade like light mode's `warning` reads as mud in a drawing, so take a light tint, or leave the sun out), small details carry the charm (cheeks, a highlight on a leaf, a soft shadow under the pot), and pieces don't overlap awkwardly or get clipped by the frame.
- A small floating card from the app itself ("Monty is thirsty · Water today") next to the drawing ties it to what the app does.
- Look at the drawing on its own in the screenshot before you finish. If it looks rough next to the type, simplify it rather than ship it.
- For playful briefs, a face makes it a mascot (two dots and a smile on the pot).
- One illustration per screen, sized to the moment: about a third of a phone's welcome screen, smaller in an empty state; on working screens only the small item thumbnails above, for playful, friendly or energetic briefs.
- A drawing never stops at a hard edge partway across the screen: it sits inside a shape (a circle, a soft blob, a rounded card) or runs off the screen's edge.
- It's decoration: hidden from screen readers (`aria-hidden="true"` on the web, excluded from accessibility on native platforms).
- Each stack draws it with its own tools: inline `<svg>` with `fill="var(--motif-color-brand)"` or `currentColor` on the web; `Canvas` in Compose; `CustomPaint` in Flutter; `Shape` and `Path` in SwiftUI; `react-native-svg` in Expo (ask before adding it) or composed views. Mockups use an inline `<svg>` inside the preview kit's `.mk-art`.
- Never emoji in its place (see [emoji as UI](anti-patterns.md#emoji-as-ui)).

## Details that read as care

- **Headlines break well.** No single word alone on a headline's last line: `text-wrap: balance` on the web, and shorter copy where a platform can't balance lines.
- **The second button stays quiet.** A second action on `surface` with a `border`, or a text button. Two saturated buttons side by side make people stop and compare.
- **Bilingual apps show their language switch** on public screens (at the top end), not only in settings.
- **Real-looking content.** Names, initials avatars, counts, exact times and places. A list of people going reads warmer than "12 attendees".
- **A desktop is not a stretched phone.** Use the width: a panel beside the form, a preview beside the headline, two columns for a list and its detail. A sidebar earns its width with real navigation; with only two or three places to go, use a top bar instead. Columns side by side start at the same top line. A list row is never wider than about 720px: a wider list becomes a grid of cards or gains a side column, so rows don't stretch across empty space.
- **Playful and energetic briefs feel tactile.** The main button is generous (at least 52px tall on a phone, a heavier label) with a darker edge of 3–4px underneath (on the web, a `box-shadow` of `color-mix()` between `action-primary` and `text-primary`; natively, the same mix computed from the theme's roles) that flattens when pressed. Fields carry a leading icon (mail, lock). On a phone, the sign-in form sits in a `surface` card under the drawing and heading. Quiet briefs keep flat, plain buttons and fields.

## Slips that undo it

People comparing two screens notice small slips before they notice style, and one slip can lose a screen that is better in every other way. Check each first-impression and home screen for these:

- **Every label sits the same distance above its field.** A "Forgot password?" link in the password label's row must not make that row taller (see [sign-in](ux-patterns/sign-in.md)).
- **One focus mark.** A focused field changes its border to `focus` or gets a ring flush against it, never a ring with a gap outside a border that still shows: that reads as a double border. Screenshots often catch the first field focused, so check how it looks.
- **Groups, then gaps.** On a short screen like sign-in, things that belong together sit close (the mark, heading and line; each label and field), the gaps between groups are larger, and fields never drift apart to fill the screen. If a phone screen ends with half of it empty, its top is missing something (the illustration or mark the brief asks for), not its gaps. A short phone screen like sign-in centres its group in the screen's height, so the space left over splits above and below instead of pooling at the bottom.
- **Nothing is focused on load.** A sign-in doesn't autofocus its first field: on a phone it throws up the keyboard, and in a screenshot a highlighted empty field looks like an error.
- **Inline text matches.** A question and its link ("New to Ledgerly? Create an account"), or a value and its unit, share one size and one baseline.
- **Item titles are never smaller than their descriptions.** In a feature row or a list item the title is `heading` (or `body` in a heavier weight) and the description is `body` or `caption` in `text-secondary`, never larger than the title above it.
- **Counts match what's shown.** "To do today (3)" lists three items, or ends with "Show all".
- **Rows line up.** Titles start at the same place in every row: a leading badge whose width changes with its word pushes them out of line, so status badges go at the end of the row (or the leading slot gets one fixed width). On a phone, titles wrap to a second line instead of ending in "…"; shorten the copy if they're long.
- **Each action appears once.** "Sign in" in the header and again beside the main action is one too many; the hero's second action is something else ("See how it works") or nothing.
- **The main action clearly outweighs the second one,** by fill as well as position.
- **A button's label is never small.** A large button's label is `body` size or bigger in a heavier weight, never `label` or `caption` size: a small label in a big button reads as faint, and in a shrunk screenshot it can look like dark text on the fill.
- **Progress never starts empty.** The mock data shows some progress ("2 of 5 done" with the bar part-filled), or the summary shows a count instead of a bar; an empty bar looks broken.
- **Small grey text is rare.** A row's second line is `label` or `body` in `text-secondary`, not `caption`; `caption` is for a timestamp or a count. A screen where most of the text is small and grey looks unfinished.
- **Repeated actions look alike and stay put.** Every row's action sits in the same place (the end of the row) at the same width, whatever it says: "Join", "Going ✓" or "Full" share one shape, with the state in its words and colour, never a paler button that looks disabled or one that moves below the text in some rows. A row's quieter link ("Can't make it") lines up with the row's text. Buttons people should press look pressable: the row's action is filled in `action-primary` or outlined in it, never a `brand-soft` or `action-secondary` fill, which reads as disabled next to a strong button elsewhere.
- **Only what can be pressed looks pressable.** A white or outlined pill reads as a button. Facts and features that do nothing are rows with an icon tile, or plain tinted text, never a row of white pills.
- **A control beside a heading sits on its line.** A filter or sort next to a section heading shares the heading's centre line, with its label inside the control ("Pace: All") or as its accessible name, never a label floating above it.
- **Phone rows leave the title room.** If a row's time column and its action leave the title less than half the width, titles wrap word by word: move the time into the row's first line ("Today · 18:30") or the action below the text, so a title wraps at most once.
- **The mark appears once per screen.** A desktop sign-in with a `brand` panel puts the logo on the panel or above the form, not both.
- **One heading per thing.** A page title and a section title right under it that say the same ("This week" over "This week's runs") are one too many: drop one.
- **Overlapping avatars keep every initial whole.** They overlap by at most a quarter of their width, each with a ring in the surface colour, and the initials stay centred and uncut.
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
