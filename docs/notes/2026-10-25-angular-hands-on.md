# Hands-on test: Motif on a new Angular Material app and on Conduit (Angular)

- **Date:** 2026-10-25
- **Plan:** [2K Angular](../plans/2026-10-25-motif-2k-angular.md), Task 13 (spec §11 of [Part 2](../specs/2026-10-19-motif-part2-all-stacks-design.md))
- **Motif:** branch `plan/2k-angular`, run from source (`bun C:/Users/PC/GitHub/motif-2k/cli/src/main.ts …`) on Windows 11 with Bun 1.4.3 and Chrome. The run started on `caae07c` with `ADAPTERS_AVAILABLE` edited in the working tree (`"angular"` added), so `doctor` says what a release will say; the three fixes it led to are `81f3565`, `73fb1ae` and `4ff208c`, and each was run again on the app that showed it. The commit `feat: Angular is supported` marks Angular supported with that same change. This computer's Node is 22.14, older than Angular 22 needs (22.22.3, or 24.15), so a portable Node 24.22.1 (the official zip) was first on `PATH` for these commands only: the apps' installs, builds and dev servers ran on it. Nothing system-wide was changed.
- **A new app, as `ng new` and `ng add @angular/material` make it:** `ng new ng22mat --style=scss --ssr=false --defaults` with CLI 22.2.4 (Angular 22.2.3, `@angular/build` 22.2.4), then Angular Material 22.2.4 with its custom M3 theme (`mat.theme((color: (primary: mat.$azure-palette, tertiary: mat.$blue-palette), typography: Roboto, density: 0))` in `src/styles.scss`, Roboto and Material Symbols from Google Fonts in `index.html`). The portable Node's npm couldn't answer `ng add`'s registry lookup (a file missing from that npm's own folder), so the packages were installed with `npm install @angular/material@^22.2.0 @angular/cdk@^22.2.0` and the schematic run as `ng g @angular/material:ng-add --theme=custom`, which writes the same files. One page: a toolbar with an icon button, a card with a slide toggle and two buttons.
- **A maintained public Angular app with its own styling, [gothinkster/angular-realworld-example-app](https://github.com/gothinkster/angular-realworld-example-app)** at `dd99ed2` (2026-05-13): Conduit, the RealWorld blogging app, Angular 21.2.12, standalone components, `@angular/build` 21.2.10, with bun (`bun.lock`). Its styling is the RealWorld project's shared Bootstrap 4 theme, `realworld/assets/theme/styles.css`, which comes in a git submodule (`realworld-apps/realworld` at `ffbd690`) and is the only entry in `angular.json`'s styles, plus one component stylesheet; the articles come from the public RealWorld demo API. It builds (`bun run build`) and serves on Node 24.

This is the record of the test until the pull request exists. The four Angular eval cases are run by the controller after this task.

## What was changed in the scratch copies

Only these, and only in the copies, in a scratch folder outside the repository: the installs (`npm` for the new app, `bun install --ignore-scripts` and `git submodule update --init` for Conduit); the new app's page (above); `design/tokens.json` (the draft as it came); the wiring each `tokens` note asked for (`@use "./styles/motif.css";` at the top of `src/styles.scss`; `src/styles/motif.css` added to Conduit's `angular.json` styles); and what Motif wrote itself. No `DESIGN.md` was written, so `motif validate` wasn't part of this run; `tokens` reads `design/tokens.json` without it. Neither guide has a second variant, so `--variant all` drew one palette, and Motif says so.

No screenshots are kept with this note: Conduit's pages show other people's posts.

## Results

| Step | The new Material app (Angular 22) | Conduit (Angular 21) |
|---|---|---|
| 1. `doctor` | Passed: "Full support for Angular.", "Angular 22.2 with standalone components." | Passed: "Full support for Angular.", "Angular 21.2 with standalone components." |
| 2. `extract` | Passed after a fix: the palettes named in notes, and (fixed) Roboto from `mat.theme`'s typography | Passed: 43 colours grouped into 26, the theme's fonts, timings and corners, all from the submodule's stylesheet |
| 3. `tokens` | Passed: `src/styles/motif.css` and `src/app/design/motion.ts`, the `@use` note for `styles.scss`; wired, `ng build` passes and a second run is "up to date" with no note | Passed after a fix: the note said to edit the submodule's stylesheet; now it says to add the theme to `angular.json`'s styles after it |
| 4. `check` | Passed: "No design problems found in 7 files." | Passed: 197 problems in 3 files, all in the submodule (left, below) |
| 5. `shot --audit --variant all --rtl` | Passed after a fix: 20 screenshots of 1 page in 41 s; the audit reported Material's buttons and switch as too small, which they aren't (fixed) | Passed after a fix: 100 screenshots of 5 pages in 3 min 37 s, true contrast and tap-target findings; `/editor` and `/settings` are the sign-in page, which Motif now says (fixed) |

### 1. doctor (the new app, Node 24 first on `PATH`)

```
Motif doctor
  ✓ Motif tool — Version 0.5.0 (win32-x64).
  ✓ App (this folder) — Full support for Angular.
  ✓ Screenshots and previews — Using Chrome.
  ✓ Node.js — Found. Your app needs it to run (Motif itself doesn't).
  ✓ Angular (this folder) — Angular 22.2 with standalone components.
  ○ Design guide — None yet — /design will create one.
  ✓ Design sources — Connected: 21st.dev (Claude Code).
```

Conduit's is the same with "Angular 21.2 with standalone components."

### 2. extract

The new app, first run:

```
✓ Draft theme values written to design/tokens.draft.json (from 7 files).
  Colours: 0 found, grouped into 0
  Spacing: 2 values, 0 off a 4px scale
  Corners: 0 sizes · Text sizes: 0 · Fonts: none found · Animation timings: 0
• Dark-mode colours were copied from light mode. Review them before turning on dark mode.
• Angular Material's mat.$azure-palette is a named palette; Motif can't read its colours from the code. Set action-primary in the guide by hand.
• Angular Material's mat.$blue-palette (tertiary) is a named palette; Motif can't read its colours from the code. If your app shows its tertiary colours, set the matching role in design/tokens.json by hand; otherwise there's nothing to do.
• No colour was found for text-primary, background, border, action-primary, success, warning, danger, info, so Motif used defaults.
```

The palette notes are right: the theme's colours are in Material's palettes, not in the app's code. "Fonts: none found" was wrong: the app's font is `typography: Roboto` in `mat.theme()`, and the body takes it through `font: var(--mat-sys-body-medium)`, so no `font-family` names it. Fixed in `73fb1ae` (below); after it, "Fonts: Roboto", and the draft's `font.sans` starts with Roboto.

Conduit: values only from `realworld/assets/theme/styles.css`, the stylesheet `angular.json` names: white page, the theme's green `#33AA44`, 8 corner sizes, 13 text sizes, 4 timings, 29 colour variables matched to roles, and "No colour was found for warning, info". The fonts are Lora (three rules) and Source Sans Pro (the body's, one rule); the draft took Lora as the body font, as it did on Svelte's Conduit (left, below).

### 3. tokens

The new app:

```
✓ Theme code is ready:
  created    src/styles/motif.css
  created    src/app/design/motion.ts
  created    design/motif.json
• src/app/design/motion.ts is for Motion's animate(): npm install motion. animate.enter and animate.leave can use the CSS variables in motif.css instead.
• Next: add @use "./styles/motif.css"; at the top of src/styles.scss.
```

Nothing of the app's was changed (`git status`). With the `@use` added above Material's own `@use`, `ng build` passed and the built `styles-*.css` holds the `--motif-*` variables; a second `tokens` was "up to date" with no note.

Conduit, first run: `Next: add @import "../../../src/styles/motif.css"; at the top of realworld/assets/theme/styles.css.` The path was right, but the file is in the `realworld` git submodule: another repository's, where a change doesn't stay with the app. Fixed in `73fb1ae`; the note is now `Next: add "src/styles/motif.css" to the build's styles in angular.json, after "realworld/assets/theme/styles.css", which is in the git submodule realworld/.` With that done, `bun run build` passed and `tokens` gave no note. The fonts line named Lora 400 to 700, which the app loads from Google Fonts in `index.html` (the same shared note as on Svelte).

### 4. check

The new app: "No design problems found in 7 files." Right: its own stylesheet has only `24px` and `16px` spacing (on the drafted scale), and Material's styles are in `node_modules`.

Conduit: 197 problems in 3 files: `realworld/assets/theme/styles.css` (raw colours, `15px` spacing, `ease` and `0.15s` timings, `'Lora', serif`, each at its line), `realworld/assets/media/conduit-logo.svg.generate.ts:32` (`#222`) and `realworld/docs/src/tailwind.css` (the RealWorld project's own documentation site's colours). The first is the app's styling; the other two are files of the submodule the app doesn't use (left, below). Conduit's own components hold no hard-coded values.

### 5. shot

The new app, first run:

```
✓ 20 screenshots of 1 page (three phone sizes, a tablet and a desktop, light and dark, right to left in ar) in design/shots/
✗ Audit: 4 minor (details in design/shots/audit.json):
  minor    / (mobile) The "Settings" button is 40×40 px on a phone; 44×44 px is easier to tap.
  minor    / (mobile) A button is 77×32 px on a phone; 44×44 px is easier to tap.
  minor    / (mobile) The "Later" button is 64×40 px on a phone; 44×44 px is easier to tap.
  minor    / (mobile) The "Place order" button is 121×40 px on a phone; 44×44 px is easier to tap.
• This design guide has one palette, so --variant all is the same as leaving --variant out.
• / doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.
```

All four were false: each Material button and the slide toggle hold an empty `span` or `div`, absolutely placed, that makes the hit area 48 px tall (`.mat-mdc-button-touch-target`, `.mat-mdc-slide-toggle-touch-target`, at density 0). The audit measured only the control's own box. And "A button" is the slide toggle's switch, named by `aria-labelledby`, which the finding's label didn't read. Both fixed in `81f3565`; the second run: "Audit: no contrast, tap-target or reduced-motion problems found, and no controls without a name."

The pictures are the app as it runs: the toolbar, the card, the toggle and the buttons, drawn with Roboto. In right to left the toolbar, card header, toggle and actions mirror. The dark pictures are light: `ng add` writes `color-scheme: light` on `body`, and Material's colours follow it, so the app has no dark mode until it changes that (the app's choice, not Motif's).

Conduit, first run: 100 screenshots of `/`, `/editor`, `/login`, `/register` and `/settings`; `/article/:slug`, `/editor/:slug`, `/profile/:username` and its favourites, and `/tag/:tag` skipped by name, for `--routes`. The audit found 4 critical and 2 major contrast problems, all true and all the theme's (the nav links `#b3b3b3` on white at 2.09:1, the dates and "Read more…" `#bbb`, the tags `#aaa`, the tagline `#999`, green on white and white on green at 3.01:1); 8 major name problems, true and the app's (each article's author picture is an `img` with no `alt` inside a link with no other text); and 34 minor tap targets, true (the 38 px nav links, the 16 px author links, the 31 px tag pills). Three things in it were Motif's:

- `/editor` and `/settings` were drawn and audited as the sign-in page, under their own names, without a word: Conduit's route guards send a visitor without a session to `/login` in the browser, while the server answers 200. Motif knew only redirects the server makes. Fixed in `4ff208c`: `/editor    2 screenshots (went to /login)`, and "Pages that redirected were audited as the page they landed on: /editor → /login, /settings → /login."
- The logo links were "A link is 88×40 px": each holds only `<img alt="Conduit">`. Svelte's hands-on left this for the web backlog; it is the same label code as the switch above, so `81f3565` also reads an inner image's `alt`: `The "Conduit" link is 88×40 px on a phone`.
- Nothing else: the routes (`loadComponent` pages, the parameters, the guards) came from `app.routes.ts` as the tests say, the app's `start` script (`ng serve`) was started through bun on a free port, and it was stopped at the end.

In right to left Conduit's Bootstrap 4 theme runs the nav links together and floats the logo to the other side; its theme has no right-to-left styles (the app's own). It has no dark mode, so its dark pictures are light.

## The two things the guide's review left open

- **`Directionality.valueSignal` works with `@angular/cdk` 22.** In the new app (CDK 22.2.4), a component reading `inject(Directionality).valueSignal()` compiles in `ng build` and shows `ltr`. Inside an element with `[dir]="pageDir()"` and the CDK's `Dir` directive (`BidiModule`), a child component's `valueSignal()` followed the change: a state script clicked a button that set `pageDir` to `rtl`, checked that the child then said `rtl`, and Motif's screenshot of that state shows "Section direction: rtl" with the section mirrored. The root `Directionality` (outside the wrapper) kept `ltr` after Motif set `dir="rtl"` on `<html>` once the app had started, as the guide's `platform.md` says: it reads `dir` when the app starts.
- **A Fontsource `@import` from `src/styles.css` resolves in `ng build` on Angular 22.** A second new app (`ng new ng22css --style=css`, Angular 22.2.3) with `@fontsource/onest` and `@fontsource/noto-kufi-arabic` installed and `@import "@fontsource/onest/400.css";`, `…/600.css` and `@import "@fontsource/noto-kufi-arabic/400.css";` at the top of `src/styles.css`: `ng build` passed with no warning, the fonts' `.woff2` and `.woff` files were copied into `dist/…/browser/media/`, and the built stylesheet's `@font-face` rules point at them.

## Problems found, and what was done

Three of Motif's problems were fixed, with tests, and four things are left, with why.

1. **Fixed (`81f3565`, shared web): a hit area a library puts inside a control didn't count, and a control named by `aria-labelledby` or an inner image's `alt` was "A button" or "A link".** The audit now takes an absolutely placed child that takes taps (not `pointer-events: none`, and not clipped by the control's `overflow`) as part of the control's hit area, and the finding's label reads `aria-labelledby`, then the text, then an inner image's `alt`. Every web stack shares this, and Svelte's hands-on item 1 is answered: Angular Material's controls at the default density are no longer reported on any of them. At a negative density Material leaves the touch target out, so a control under 44 px is still reported, rightly. The final review's fix wave narrowed the rule: only a child that covers the control's centre counts, and not one a wrapper inside the control clips, so a corner badge or an open menu can't hide a small target. Test: [audit.test.ts](../../cli/test/audit.test.ts) ("a hit area a component library adds inside a control counts").
2. **Fixed (`73fb1ae`, Angular): `mat.theme`'s typography wasn't read, and the wiring note pointed into a git submodule.** `motif extract` reads `typography:` (one family, or a map's `plain-family` and `brand-family`; a Sass variable is left out), and the wiring note passes over a stylesheet in a folder `.gitmodules` lists for the app's own, or, with none, says to add the theme to `angular.json`'s styles after it. Tests: [extract-angular.test.ts](../../cli/test/extract-angular.test.ts) ("mat.theme's typography is the theme's font"), [angular-generate.test.ts](../../cli/test/angular-generate.test.ts) ("a styles file in a git submodule").
3. **Fixed (`4ff208c`, shared web): a redirect in the browser wasn't seen.** After a page loads, Motif reads where it is; a path other than the route's is recorded as a server's redirect is. Every web stack's router redirects (Vue Router's, React Router's) are now named the same way. Only the path is compared, so a hash router's redirect (`/#/admin` to `/#/sign-in`) isn't seen, and only the first plain look decides (the fix wave), so a page the `--rtl` look's language sends elsewhere isn't marked. Test: [capture.test.ts](../../cli/test/capture.test.ts) ("a page the app's router sends elsewhere records where it landed").
4. **`check` reads a git submodule's files** (left). Conduit's `realworld/` holds the RealWorld project's documentation site and specs beside the theme; `check` reads its CSS and TypeScript as the app's. File listing is shared by every stack, and the theme in the same submodule is the app's real styling, so skipping submodules isn't simply right; `design/motif.json`'s `ignore` leaves the folders out today. It belongs to the shared backlog.
5. **The draft's body font** (left). Conduit's heading serif, Lora, became the body font over Source Sans Pro (the `body` rule's), because it is named three times to once: the shared draft's choice on every web stack, as Svelte's hands-on found, for the reviewer's pass to correct.
6. **The fonts line names fonts the app loads from Google Fonts** (left). The shared web note doesn't look at `index.html`'s `<link>`s, as on Svelte and React web.
7. **The portable Node's npm couldn't run `ng add`'s registry lookup** (not Motif's). That copy of npm 11.19.1 misses one of its own files; the packages and the schematic were run as above. Nothing in Motif depends on it.

## After the run

The Angular tests (`angular-*.test.ts`, `check-angular`, `extract-angular`, `shot-angular`, `tokens-angular`, `fixtures-angular`), `audit.test.ts`, `capture.test.ts`, `doctor.test.ts`, `adapters.test.ts` and `release.test.ts` pass, and the full suite on the commit that marks Angular supported is in the task's report. Every dev server and browser the run started was stopped.
