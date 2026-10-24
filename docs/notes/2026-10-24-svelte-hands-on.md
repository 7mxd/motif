# Hands-on test: Motif on the Svelte team's demo and on Conduit (Svelte / SvelteKit)

- **Date:** 2026-10-24
- **Plan:** [2J Svelte](../plans/2026-10-24-motif-2j-svelte.md), Task 13 (spec §11 of [Part 2](../specs/2026-10-19-motif-part2-all-stacks-design.md))
- **Motif:** branch `plan/2j-svelte` at `be315b7`, run from source (`bun C:/Users/PC/GitHub/motif-2j/cli/src/main.ts …`) on Windows 11 with Bun 1.4.3 and Chrome. `ADAPTERS_AVAILABLE` had `"svelte"` added in the working tree for the run (the change of the commit that marks Svelte supported), so `doctor` says what a release will say. This computer's Node is 22.14, older than SvelteKit 3 needs (22.17), so a portable Node 24.22.1 (the official zip) was first on `PATH` for these commands only: the apps' installs and dev servers ran on it. Nothing system-wide was changed.
- **The first choice, the Svelte team's demo:** `npx sv create demo-app --template demo --types ts --no-add-ons --install npm` with sv 1.1.1. It writes a SvelteKit 3.1.0 app (Svelte 5.57.2, Vite 8.3.5) with `/`, `/about`, `/sverdle` and `/sverdle/how-to-play`, its global styles in `src/routes/layout.css` (CSS variables and a gradient page), scoped `<style>` blocks, a `Spring` in the counter, and `#lib` imports (SvelteKit 3 removed `$lib`). sv added its `enhanced-img` add-on despite `--no-add-ons` (sv's own behaviour; the welcome image is an `<enhanced:img>`).
- **A maintained public SvelteKit 5 app with its own styling, [sveltejs/realworld](https://github.com/sveltejs/realworld)** at `df79670` (2026-08-10): Conduit, the RealWorld blogging app, SvelteKit 2.70.3, Svelte 5.57.2, Vite 7.3.7, with pnpm. Its styling is its own Bootstrap 4 theme, `static/conduit-theme.css` (green accent, Source Sans Pro and Lora, Ionicons), plus scoped `<style>` blocks; the articles come from the public RealWorld API (`api.realworld.show`, no key). It builds and serves on Node 24. Also tried: [sveltejs/hn.svelte.dev](https://github.com/sveltejs/hn.svelte.dev), last changed in 2022 on Svelte 3 and Sapper, so not a Svelte 5 app; it was set aside.

This is the record of the test until the pull request exists. The four Svelte eval cases are run by the controller after this task.

## What was changed in the scratch copies

Only these, and only in the copies, in a temporary folder (since removed): the install (`npm` for the demo, `pnpm install` for Conduit); `DESIGN.md` (the ten sections and the Variants section, short); `design/tokens.json` (the draft, and a second variant so that `--variant all` has two to draw: `dusk`, which changes `background` and `action-primary`); and what Motif wrote itself. Conduit's draft needed four roles set by hand before `motif validate` passed (below). For the demo's second screenshot run, the theme was wired in as `motif tokens` asked (`import '#lib/styles/motif.css'` in `src/routes/+layout.svelte`) and `layout.css`'s `--color-bg-0`, `--color-bg-1` and `--color-theme-2` took `var(--motif-color-background)` and `var(--motif-color-action-primary)`, so a variant shows.

No screenshots are kept with this note: Conduit's pages show other people's posts.

## Results

| Step | The demo (SvelteKit 3) | Conduit (SvelteKit 2) |
|---|---|---|
| 1. `doctor` | Passed: "Full support for Svelte / SvelteKit.", "Svelte 5.57 with SvelteKit 3.1." On the system Node 22.14 it says SvelteKit 3 needs 22.17 and how to get it | Passed: the same, "Svelte 5.57 with SvelteKit 2.70." |
| 2. `extract`, then a guide that validates | Passed: `layout.css`'s variables and every scoped style block read; valid as drafted. The Svelte orange became `danger` (left, below) | Passed with corrections by hand: `success` and `danger` against their text colours, and the variant's text and focus colours |
| 3. `tokens` | Passed: `src/lib/styles/motif.css` and `src/lib/design/motion.ts`, no file of the app's touched, the note through `#lib` | Passed: the same files, the note through `$lib` |
| 4. `check` | Passed: 41 problems in 5 files, at the right lines in the `.svelte` files' style blocks and in a `{…}` attribute value | Passed: 192 problems in 4 files, Svelte's `transition:` and `animate:` timings at their columns, with Svelte's fixes and the reduced-motion finding |
| 5. `shot --audit --variant all --rtl` | Passed: 160 screenshots of 4 pages in 3 min 49 s; then 80 of two pages (`--routes /,/sverdle`) in 2 min with the variant drawn | Passed: 240 screenshots of 6 pages in 7 min 53 s, with real contrast findings |

### 1. doctor (the demo, Node 24 first on `PATH`)

```
Motif doctor
  ✓ Motif tool — Version 0.5.0 (win32-x64).
  ✓ App (this folder) — Full support for Svelte / SvelteKit.
  ✓ Screenshots and previews — Using Chrome.
  ✓ Node.js — Found. Your app needs it to run (Motif itself doesn't).
  ✓ Svelte / SvelteKit (this folder) — Svelte 5.57 with SvelteKit 3.1.
  ○ Design guide — None yet — /design will create one.
  ✓ Design sources — Connected: 21st.dev (Claude Code).
```

On the system Node the Svelte line is `✗ … SvelteKit 3 needs Node.js 22.17 or later; this computer has 22.14.0. Install a newer Node.js from nodejs.org.`, which is true: the demo's dev server doesn't start on it.

### 2. extract

The demo:

```
✓ Draft theme values written to design/tokens.draft.json (from 15 files).
  Colours: 19 found, grouped into 9
  Spacing: 5 values, 2 off a 4px scale
  Corners: 3 sizes · Text sizes: 6 · Fonts: Arial, Fira Mono · Animation timings: 2
• Dark-mode colours were copied from light mode. Review them before turning on dark mode.
• Your CSS sets 7 colour variables; design/extract-report.json shows the role each matches, …
• text-primary comes from --color-text, which is see-through (rgba(0, 0, 0, 0.7)): drafted as #3E4246, how it shows over the background …
• No colour was found for success, warning, so Motif used defaults.
• Fira Mono became the optional mono role (font.mono), for code text.
```

The page colour is `--color-bg-1` (`hsl(209, 36%, 86%)`, `#CEDCE8`), the text the see-through `--color-text` as it shows over it, the action the demo's blue `--color-theme-2`, and Fira Mono the mono role: what the app has. `src/app.html`'s `%sveltekit.head%` placeholders weren't read as values. `--color-theme-1`, the Svelte orange `#ff3e00`, which the demo uses for its accents, became `danger` by its hue; a reviewer would make it the accent. The draft validated as it was, with the `dusk` variant added: "valid — 73 theme values and 52 readability checks (light + dark, 2 variants) passed."

Conduit: 33 colours grouped into 18, from `static/conduit-theme.css` and `PreloadingIndicator.svelte`: white page, `#373A3C` text, the theme's green `#33AA44` as the action. As drafted, `motif validate` found white on `success` (4.25:1) and on `danger` (4.44:1) too faint, and in `dusk` the drafted dark text on the rust accent and the focus colour on the warm page; I set darker `success` and `danger`, white text on both, and the variant's text and focus colours, and it passed (76 theme values, 52 checks). The draft took Lora (the theme's serif for headings, used three times) as the body font over Source Sans Pro (the body's, once), and left out the theme's most used corner, 8 px (eight times), with corners of 6, 12 and 160 px (left, below).

### 3. tokens

The demo:

```
✓ Theme code is ready:
  created    src/lib/styles/motif.css
  created    src/lib/design/motion.ts
  created    design/motif.json
Theme fonts: Fira Mono 400. Your app needs to load them (your stack's Motif guide shows how).
• Next: import '#lib/styles/motif.css' once in src/routes/+layout.svelte (in its <script>).
```

`#lib`, because the demo's `package.json` maps it (Task 8's fix for SvelteKit 3); Conduit's note says `$lib`. Nothing of either app was changed (checked with `git status`). Once the demo's layout imported the file, a second run was "up to date" with no note. The fonts line names Fira Mono, which the demo already loads through `@fontsource/fira-mono` (left, below).

### 4. check

The demo, the top groups of 41 problems in 5 files:

```
  8× white  Raw colour white. … At src/routes/sverdle/+page.svelte:273, …:285, …:321 and 5 more.
  3× 0.2rem  Spacing 3.2px isn't on your spacing scale. Closest: var(--motif-space-1) (4px). …
  3× rgba(0, 0, 0, 0.7)  Raw colour rgba(0, 0, 0, 0.7). At src/routes/layout.css:13, …
  2× #ff3e00  Raw colour #ff3e00. At src/routes/layout.css:11, src/routes/sverdle/+page.svelte:194.
  1× #444  Raw colour #444. At src/routes/Counter.svelte:66.
  1× 0.2s  Hard-coded animation timing 0.2s. … At src/routes/Header.svelte:124.
  1× 0.5s  Hard-coded animation timing 0.5s. … At src/routes/sverdle/+page.svelte:253.
```

Every line I looked up was right: `sverdle/+page.svelte:194` is the confetti's `colors: ['#ff3e00', '#40b3ff', '#676778']` inside a `use:confetti={{ … }}` value, `:273` is `background: white;` in the style block, `Counter.svelte:66` is `stroke: #444;`. `src="#lib/images/svelte-welcome.png"` and the markup's `{…}` expressions gave nothing. With the theme wired in, 38 remained. No reduced-motion finding: the counter's `Spring` doesn't check the setting, but the Sverdle page imports `prefersReducedMotion` (for its confetti), and the rule counts one sign anywhere in the app (left, below); the Sverdle page's shake is inside `@media (prefers-reduced-motion: no-preference)`.

Conduit, 192 problems in 4 files, nearly all in `static/conduit-theme.css`. The Svelte ones:

```
reduced-motion  src/routes/editor/Editor.svelte:66:8   motion
raw-motion      src/routes/editor/Editor.svelte:67:35  duration: 200   (transition:scale|local={{ duration: 200 }})
raw-motion      src/routes/editor/Editor.svelte:68:25  duration: 200   (animate:flip={{ duration: 200 }})
raw-color       src/routes/PreloadingIndicator.svelte:43:21  #5cb85c
off-scale       src/routes/article/[slug]/Comment.svelte:38:16  5px
```

The timings have Svelte's fix ("Import { duration, easing, spring } from $lib/design/motion and pass them: transition:fly={{ duration: duration.base, easing: easing.standard }}"), and the reduced-motion finding points at the `<button` whose `transition:` ignores the setting, with `prefersReducedMotion`'s fix.

### 5. shot

The demo, the first run:

```
✓ 160 screenshots of 4 pages (three phone sizes, a tablet and a desktop, light and dark, right to left in ar, 2 design variants) in design/shots/
  /                     40 screenshots
  /about                40 screenshots
  /sverdle              40 screenshots
  /sverdle/how-to-play  40 screenshots
✗ Audit: 30 minor (details in design/shots/audit.json):
  minor    / (mobile) A link is 42×48 px on a phone; 44×44 px is easier to tap.
  minor    /sverdle (mobile) The "How to play" link is 110×20 px on a phone; 44×44 px is easier to tap.
  minor    /sverdle (mobile) The "q" button is 29×42 px on a phone; 44×44 px is easier to tap.
  …
• / doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.
• The dusk variant looks the same as the default on every screen: the app may not switch variants the way Motif sets them (motif.css, which follows data-variant on <html>).
```

All right: the four pages from `src/routes` (the server-only `+page.server.ts` files aren't pages), drawn by SvelteKit 3's dev server on Node 24, and the variant note true, since the app didn't use the theme yet. The findings are true: Sverdle's keyboard keys are 29 px wide on a phone, and the corner links are 42 px wide. The pictures are the app as it runs; in right to left the header, the grid and the keyboard mirror, and the current tile is on the right. The demo has no dark mode, so its dark pictures are light. The two corner links are "A link": each is named by its image's `alt`, which the audit's label doesn't read (left, below).

The second run, with the theme wired in, `--routes /,/sverdle`: 80 screenshots in 2 minutes, and the `dusk` pictures show the warm page; the "looks the same" note was gone.

Conduit: 240 screenshots of 6 pages in 7 min 53 s. `/editor`, `/profile` and `/settings` redirect to `/login` without a session, and were drawn and audited as `/login`, which Motif says; `/article/[slug]`, `/editor/[slug]`, `/profile/@[user]` and its favourites were skipped by name, for `--routes`. The audit found 4 critical and 2 major contrast problems, all true and all the theme's: the nav links (`#b3b3b3` on white, 2.09:1), dates and "Read more…" (`#bbb`, 1.91:1), tags (`#aaa`), the tagline (`#999`), and the green on white and white on the green button (3.01:1); and 30 minor tap targets (the nav's 38 px links, the 16 px author links). In right to left Conduit's Bootstrap 4 grid pushes the sign-in form into the right half (its `offset-md-3` is a left margin) and runs the nav links together: the app's own, since its theme has no right-to-left styles.

## Problems found, and what was done

No problem in Svelte's own code was found: detection, the theme files and their `#lib`/`$lib` note, the `.svelte` views, Svelte's rules and fixes, SvelteKit's routes and the dev server worked on both apps as the tests say. These are left, with why:

1. **A link named by its image's `alt` is "A link" in a tap-target finding** (left). The audit's label reads the element's `aria-label`, text, `title` and its own `alt`, not an image inside it; it doesn't miss the name (no unnamed-control finding), only the words of the message. It's the shared web audit (React web and plain web say the same), and plan 2J changes nothing for those stacks; it belongs to the web backlog: the label could fall back to an inner image's `alt`.
2. **One `prefersReducedMotion` anywhere settles reduced motion for the whole app** (left). The demo's counter `Spring` ignores the setting, but the Sverdle page checks it for its confetti, so `check` reports nothing. That is the rule as built (Task 4) and as React web's `MotionConfig` rule works: one app-wide sign, reported once. A per-animation check would be more precise and noisier; it's a ruling for the web stacks together, not Svelte's alone.
3. **The draft's role choices** (left). The demo's orange accent became `danger` by its hue; Conduit's heading serif became the body font, and its most used corner (8 px) isn't one of the drafted corners. These are the shared draft's choices for every web stack, and the reviewer's pass the skill asks for corrects them.
4. **The fonts line names a font the app already loads** (left). `Theme fonts: Fira Mono 400. Your app needs to load them` is the shared web note; it doesn't look for `@fontsource` imports. It's said the same on React web.
5. **`sv create --no-add-ons` added `enhanced-img`** (not Motif's). The demo template brings it; nothing in Motif depends on it.

## After the run

The Svelte tests (`svelte-*.test.ts`, `check-svelte`, `extract-svelte`, `shot-svelte`, `tokens-svelte`, `fixtures-svelte`), `doctor.test.ts`, `adapters.test.ts` and `release.test.ts` pass, and the full suite on the commit that marks Svelte supported is in the task's report.
