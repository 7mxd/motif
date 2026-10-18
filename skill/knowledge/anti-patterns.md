# Anti-patterns

These are the tells of generic, AI-generated UI: choices that look fine in isolation but add up to a screen nobody designed. Avoid them when you build, and look for them when you review. Review mode reports each one it finds under the `anti-pattern` category, with the fix from its **Instead** line.

Each pattern has three parts: what it **looks like**, **why it hurts**, and what to do **instead**. The fix almost always comes from the design guide: a role that already exists, or a rule in DESIGN.md that was skipped.

## Decoration

### Gradient overuse

- **Looks like:** purple-to-blue gradients on buttons, headings, backgrounds and borders, often all on one screen.
- **Why it hurts:** gradients pull the eye wherever they are, so nothing stands out; they also date a product quickly and rarely survive dark mode.
- **Instead:** flat role colours from the guide. Allow at most one subtle gradient, and only where the guide's Direction section calls for it (a hero background, say).

### Glass and glow

- **Looks like:** frosted translucent panels, neon outlines, soft blurred colour blobs behind content.
- **Why it hurts:** blur and glow lower text contrast unpredictably, cost performance on phones, and replace hierarchy with atmosphere.
- **Instead:** `surface`, `surface-raised` and `border` from the guide; depth from the elevation roles (`shadow.sm`, `shadow.md`, `shadow.lg`).

### Shadows on everything

- **Looks like:** every card, button, input and section with a soft drop shadow.
- **Why it hurts:** a shadow says "this floats above the page". When everything floats, nothing does, and the screen looks muddy, especially in dark mode.
- **Instead:** borders and surface steps for things that sit on the page; shadows only for things that truly float (menus, popovers, dialogs, sheets).

### Over-rounded everything

- **Looks like:** pill-shaped buttons and inputs, cards with huge corner radii, rounded corners on full-width sections.
- **Why it hurts:** one radius for every size makes small things look swollen and big things look soft; nested elements end up with mismatched curves.
- **Instead:** the radius roles by size (`radius.sm` for small controls up to `radius.lg` for cards and sheets), and `radius.full` only for pills, avatars and toggles the guide calls for.

## Type and colour

### The default look

- **Looks like:** the fonts most generated sites share (Inter, Space Grotesk, Fraunces, Playfair Display and the rest of the list in [type pairings](type-pairings.md)), purple or indigo accents, cream with terracotta and a serif, near-black with one neon accent, or Tailwind's default colours used as they are.
- **Why it hurts:** people have seen it on hundreds of generated sites, so the product reads as a template before they read a word, and the brand doesn't come through.
- **Instead:** a pairing from [type pairings](type-pairings.md) that fits the guide's Direction, and an accent from the subject's own world. This one is advice: if the developer chose these on purpose, leave them.

## Layout

### The identical card grid

- **Looks like:** three or six cards in a row, each with an icon, a bold title and two lines of text, all the same size and weight.
- **Why it hurts:** it says every item is equally important, which is almost never true, and it is the default layout people have learned to skim past.
- **Instead:** let importance shape the layout. A list for things people compare, a table for things with attributes, one featured item and a quieter list, or plain text with headings.

### Centred everything

- **Looks like:** headings, paragraphs, forms and lists all centred down the middle of the screen.
- **Why it hurts:** each line starts in a new place, so reading is slower; there is no edge to scan down, and right-to-left support gets harder to reason about.
- **Instead:** start-aligned content with one clear edge. Centre only short standalone things: an empty state, a hero headline, a single call to action.

### Giant headline, tiny body, nothing between

- **Looks like:** a huge `display` headline followed directly by small grey body text.
- **Why it hurts:** the jump skips the levels that organise a page, so sections blur together and the headline feels like decoration.
- **Instead:** use the whole type scale. Most screens need `title`, `heading` and `body`; `display` is for a hero number or a landing headline only.

### Dashboards of identical stat cards

- **Looks like:** a row of four boxes with a big number, a label and a green or red arrow ("+12.5%"), with no period or comparison.
- **Why it hurts:** the numbers look important but answer no question; an arrow without a period ("compared with what?") is noise.
- **Instead:** show the few numbers that drive a decision, each with a label, a period ("this week") and a comparison ("vs last week"), and link each to its detail.

## Icons and emoji

### An icon on everything

- **Looks like:** an icon before every heading, every list item and every menu entry, often from mixed sets.
- **Why it hurts:** when every line has an icon, icons stop helping people scan; meaningless icons (a sparkle for "AI", a rocket for "start") add visual noise.
- **Instead:** icons only where they speed up scanning (a known file type, a status) or name a universal action (close, back, search). One set, one weight.

### Emoji as UI

- **Looks like:** 🚀 on the launch button, ✅ for success messages, 🎉 in empty states, 🔥 next to popular items.
- **Why it hurts:** emoji render differently on every platform, can't follow the theme's colours, read out oddly in screen readers, and set a tone the brand never chose.
- **Instead:** icons from the app's set, coloured with role colours. Emoji belong only in content people write themselves.

## Copy and content

### Generic copy

- **Looks like:** "Unlock your potential", "A seamless experience", "Elevate your workflow", "Supercharge your productivity".
- **Why it hurts:** it could describe any product, so it describes none; people skip it and miss what the screen is for.
- **Instead:** say what the thing does, in the app's voice from DESIGN.md section 1. "Send invoices and get paid in two taps" beats "Streamline your finances".

### Lorem ipsum and fake metrics

- **Looks like:** placeholder Latin, "10x faster", "Trusted by 10,000+ teams", invented testimonials and logos.
- **Why it hurts:** placeholder text hides layout problems (real names and titles are longer), and invented claims can end up shipped.
- **Instead:** realistic mock data in one clearly named file (for example `mock-data`), with obviously fictional names; no claims the developer didn't give you.

### Vague button labels

- **Looks like:** "Submit", "OK", "Click here", "Learn more" everywhere.
- **Why it hurts:** people decide whether to press a button by reading it; vague labels make them read everything around it first.
- **Instead:** the action's verb and object: "Save changes", "Send invite", "Delete project".

## States and interaction

### Missing states

- **Looks like:** screens built only for the happy path: no loading, empty, error, disabled or focus styles.
- **Why it hurts:** real use hits these states first: a new account is empty, networks fail, keyboards need focus rings.
- **Instead:** every component's required states from DESIGN.md section 5, and the empty, loading and error patterns from the UX pattern guides.

### Hover-only affordances

- **Looks like:** edit and delete buttons that appear only when the pointer hovers over a row.
- **Why it hurts:** touch screens have no hover, so the actions are invisible; keyboard users can't find them either.
- **Instead:** actions visible by default (or in a clearly marked menu) on touch; hover can reveal extras on devices with a fine pointer.

### Spinners and modals for everything

- **Looks like:** a full-screen spinner for every load; a modal for every choice, form and message.
- **Why it hurts:** spinners hide the layout until everything is ready; modals interrupt and trap people for small decisions.
- **Instead:** skeletons that keep the layout for content, a progress bar for long tasks, and inline expansion or a sheet before reaching for a modal.

## Motion

### Everything moves

- **Looks like:** every element fades up as it scrolls into view, every card bounces on hover, small UI changes take 600 ms or more.
- **Why it hurts:** motion that explains nothing slows people down and makes the app feel heavy; for some people it causes real discomfort.
- **Instead:** motion only where it explains a change (where something came from, what replaced what), from the motion roles (`duration.fast`, `spring.snappy`, `spring.smooth`), with reduced motion honoured.

## Dark mode

### Dark mode by inversion

- **Looks like:** colours flipped automatically: pure black backgrounds, pure white text, the same saturated accent areas as light mode, shadows that vanish.
- **Why it hurts:** full contrast glares, saturated areas vibrate on black, and without shadows every layer looks flat.
- **Instead:** the guide's dark roles: near-black surfaces that get lighter as they rise, slightly softened text, smaller areas of accent colour. Check both modes every time.
