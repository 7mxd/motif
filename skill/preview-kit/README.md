# Motif preview kit

Mockups are plain HTML that use these classes. They never contain colours, sizes, fonts or timings of their own: everything comes from the design guide's `--motif-*` variables, so a mockup always shows the current design.

## With the tool (normal)

Write the screen into `design/previews/<name>.html`, then run `motif preview design/previews/<name>.html`. The tool serves it, adds the theme and this kit, reloads on save, and writes PNGs (light and dark) next to it.

## Without the tool

Copy `kit.css`, `kit.js`, `vendor/motion.js` and the `fonts` folder next to the mockup, write the theme variables yourself into a `<style>` block (one `--motif-*` variable per role in `design/tokens.json`), link `fonts/fonts.css` and the other files in `<head>`, and open the HTML file directly. There is no live reload and no PNG.

## Frames

- `.mk-stage` — page layout for one or more frames
- `.mk-frame` — every device; add one of `.mk-phone` (with `.mk-ios` or `.mk-android`), `.mk-tablet`, `.mk-browser`
- Phone parts, top to bottom: `.mk-status`, your screen, `.mk-home` (iOS)
- Browser parts: `.mk-toolbar` containing `.mk-address`, then `.mk-body-row` with `.mk-sidebar` and `.mk-main`

## Layout and type

`.mk-screen` (scrolling content area), `.mk-pad`, `.mk-stack`, `.mk-row-inline`, `.mk-grow` · `.mk-display`, `.mk-title`, `.mk-heading`, `.mk-body`, `.mk-label`, `.mk-caption`, `.mk-muted`

## Components

`.mk-btn` (with `.mk-secondary`, `.mk-ghost`, `.mk-block`) · `.mk-field` with a `label` and `.mk-input`, `.mk-hint`, `.mk-error-text` · `.mk-card` · `.mk-list` of `.mk-row` · `.mk-avatar` · `.mk-badge` (with `.mk-success`, `.mk-warning`, `.mk-danger`, `.mk-info`) · `.mk-icon` · `.mk-divider` · `.mk-topbar` · `.mk-tabbar` of `.mk-tab` (`.mk-active`) · `.mk-sidebar` of `.mk-nav-item` (`.mk-active`) · `.mk-scrim`, `.mk-sheet`, `.mk-dialog`, `.mk-toast` · `.mk-skeleton` · `.mk-empty`

## Motion

Add `data-enter="rise"` (or `fade`, `scale`) to animate an element in with the guide's `smooth` spring; buttons, rows, tabs and nav items get press feedback with the `snappy` spring. Motion is skipped when the viewer prefers reduced motion. Show every state a screen needs (loading with `.mk-skeleton`, empty with `.mk-empty`, errors with `.mk-error-text` or a `.mk-toast`) as separate frames.

## Fonts

The fonts of the 8 starting styles come with the kit, in `fonts/` (each under the SIL Open Font License; the licence sits beside each font). With the tool, every mockup loads them, so a style that uses Fraunces shows Fraunces even on a computer that doesn't have it. A theme font outside that set loads from Google Fonts when you're online; offline, or for a font Google doesn't have, the mockup uses the next font in the theme's list and `motif preview` says which font fell back.
