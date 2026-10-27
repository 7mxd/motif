# Motif preview kit

Mockups are plain HTML that use these classes. They never contain colours, sizes, fonts or timings of their own: everything comes from the design guide's `--motif-*` variables, so a mockup always shows the current design.

## With the tool (normal)

Write the screen into `design/previews/<name>.html`, then run `motif preview design/previews/<name>.html`. The tool serves it, adds the theme and this kit, reloads on save, and writes PNGs (light and dark) next to the mockup.

## Directions

To compare looks side by side, give each direction its own folder, such as `design/directions/calm/`, holding a `tokens.json` (copy a starting style's from the skill's `presets/` folder and change the values) and its mockups. A mockup uses the `tokens.json` in its own folder; every other mockup uses the design guide. Check each direction with `motif validate --tokens design/directions/calm/tokens.json`, make PNGs with `motif preview design/directions/calm --png-only` (they're saved next to the mockups), and show several at once with `motif preview --compare design/directions/calm/home.html design/directions/bold/home.html`.

## Without the tool

Copy `kit.css`, `kit.js`, `vendor/motion.js` and the `fonts` folder next to the mockup, write the theme variables yourself into a `<style>` block (one `--motif-*` variable per role in `design/tokens.json`), link `fonts/fonts.css` and the other files in `<head>`, and open the HTML file directly. There is no live reload and no PNG.

## Frames

- `.mk-stage` — page layout for one or more frames
- `.mk-frame` — every device; add one of `.mk-phone` (with `.mk-ios` or `.mk-android`), `.mk-tablet`, `.mk-browser`
- `data-state="<state>"` on a frame that shows a state behind a form or a click, named like its state script (`design/states/<state>.js`). `motif preview` saves that frame as `<mockup>@<state>.png`, and `motif shot --against` puts it next to that state's screenshot instead of the page as it opens.
- Phone parts, top to bottom: `.mk-status`, your screen, `.mk-home` (iOS)
- Browser parts: `.mk-toolbar` containing `.mk-address`, then `.mk-body-row` with `.mk-sidebar` and `.mk-main`

## Layout and type

`.mk-screen` (scrolling content area), `.mk-pad`, `.mk-stack`, `.mk-row-inline`, `.mk-grow` · `.mk-display`, `.mk-title`, `.mk-heading`, `.mk-body`, `.mk-label`, `.mk-caption`, `.mk-muted` · `code`, `kbd`, `samp` and `pre` are set in the theme's mono role, or the system's monospace fonts when it has none

## Components

`.mk-btn` (with `.mk-secondary`, `.mk-ghost`, `.mk-block`) · `.mk-field` with a `label` and `.mk-input`, `.mk-hint`, `.mk-error-text` · `.mk-card` · `.mk-list` of `.mk-row` · `.mk-avatar` · `.mk-badge` (with `.mk-success`, `.mk-warning`, `.mk-danger`, `.mk-info`) · `.mk-icon` · `.mk-divider` · `.mk-topbar` · `.mk-tabbar` of `.mk-tab` (`.mk-active`) · `.mk-sidebar` of `.mk-nav-item` (`.mk-active`) · `.mk-scrim`, `.mk-sheet`, `.mk-dialog`, `.mk-toast` · `.mk-skeleton` · `.mk-empty`

Brand moments, in the theme's optional `brand`, `on-brand` and `brand-soft` roles (or the action colours when it has none): `.mk-brand`, a panel in the brand colour, or a band across the screen when it sits straight in a frame or an unpadded `.mk-screen`; a `.mk-btn` on it is drawn in on-brand, `.mk-secondary` is outlined and `.mk-muted` is softened · `.mk-tile`, a square tile in brand-soft holding an `.mk-icon` in the brand colour · `.mk-art`, a centred block holding an inline `<svg>` illustration whose `currentColor` is the brand colour · `.mk-stat`, a number over its label ("7 runs a week"). Never use them for buttons or links.

## Motion

Add `data-enter="rise"` (or `fade`, `scale`) to animate an element in with the guide's `smooth` spring; buttons, rows, tabs and nav items get press feedback with the `snappy` spring. Motion is skipped when the viewer prefers reduced motion. Show every state a screen needs (loading with `.mk-skeleton`, empty with `.mk-empty`, errors with `.mk-error-text` or a `.mk-toast`) as separate frames.

## Fonts

The fonts of the 8 starting styles come with the kit, in `fonts/`, and so do the Arabic letters of each style's Arabic companion (each under the SIL Open Font License; the licence sits beside each font). With the tool, every mockup loads them, so a style that uses Vollkorn shows Vollkorn even on a computer that doesn't have it. A theme font outside that set loads from Google Fonts when you're online; offline, or for a font Google doesn't have, the mockup uses the next font in the theme's list and `motif preview` says which font fell back. A font installed on this computer counts as shown, though it doesn't come from Google.

When a font fell back (`missingFonts` in `--json`), tell the developer: name the font, say the mockup shows the next font in the theme's list instead, and why (offline, or not a Google font). A brand or paid font needs its own font files in the app; the stack guide's Fonts section says how.
