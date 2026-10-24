# Hands-on test: Motif on Nuxt's own sample apps (Vue / Nuxt)

- **Date:** 2026-10-24
- **Plan:** [2I Vue](../plans/2026-10-23-motif-2i-vue.md), Task 13 (spec §11 of [Part 2](../specs/2026-10-19-motif-part2-all-stacks-design.md))
- **Motif:** branch `plan/2i-vue` at `30b68ff`, run from source (`bun C:/Users/PC/GitHub/motif-2i/cli/src/main.ts …`) on Windows 11 with Node 22.14.0, pnpm 10.33.2 and Chrome. `ADAPTERS_AVAILABLE` and `WEB_STACKS` had `"vue"` added in the working tree for the run (the change of the commit that marks Vue supported), so `doctor` says what a release will say. The two fixes below were made during the run and run again on the app.
- **The first choice, [nuxt/movies](https://github.com/nuxt/movies)** at `215904c` (2026-10-11): a movie and TV browser on The Movie Database, styled with UnoCSS, through a public proxy, so it needs no API key. It pins a Nuxt nightly (`nuxt-nightly@4.6.0-29812804`) and Node 24 (`devEngines`, which pnpm met by downloading Node 24.22.1 for the app's scripts). Its own dev server doesn't get past "Building server" on this machine: Nitro stops on `[plugin impound] This module cannot be imported in server runtime` for the nightly CLI's `dev-close-sockets.mjs`, with or without Motif (checked by running `pnpm dev` alone), so the app never serves a page. `doctor`, `extract`, `validate`, `tokens` and `check` ran on it, and `shot` found the first problem below.
- **The app tested end to end, [nuxt/hackernews](https://github.com/nuxt/hackernews)** at `b18aa75` (2026-10-19): Nuxt's Hacker News reader, Nuxt 4.6.2 with pnpm, its own CSS in `<style>` blocks (`lang="postcss"` with `postcss-nesting`), a navy header, feeds (`/[feed]/[page]`), a story with its comments (`/item/[id]`) and a user's page (`/user/[id]`), on the public Hacker News API (no key). Nuxt 4.6 needs Node 22.22.3 or 24.15 and the app asks for 24.22 (`devEngines`, with `onFail: "warn"`); in the scratch copy that was changed to `"download"`, as nuxt/movies has it, so pnpm ran the app on Node 24.22.1. Motif itself ran on Bun.

This is the record of the test until the pull request exists. The four Vue eval cases are run by the controller after this task.

## What was changed in the scratch copies

Only these, and only in the copies, in a temporary folder (since removed): `pnpm install` (and, in hackernews, `devEngines.runtime.onFail` set to `"download"`); `DESIGN.md` (the ten sections, short); `design/tokens.json` (the draft, with roles set by hand as a reviewer of the draft would, and a second variant so that `--variant all` has two to draw: `night` for movies, `dusk` for hackernews, each changing `background` and `action-primary`); and what Motif wrote itself. For the second screenshot run of hackernews, the theme was wired in as `motif tokens` asked (`css: ['~/assets/css/motif.css']` in `nuxt.config.ts`) and the body's background and the header links' accent took `var(--motif-color-background)` and `var(--motif-color-action-primary)`, so a variant shows.

No screenshots are kept with this note: the pages show other people's posts.

## Results

| Step | nuxt/hackernews | nuxt/movies |
|---|---|---|
| 1. `doctor` | Passed: "Full support for Vue / Nuxt.", "Nuxt 4.6." | Passed, the same |
| 2. `extract`, then a guide that validates | Passed with corrections by hand: the page's `#F4F4F5` was grouped with `#eee` and the body's navy text lost to `#222` (left, below) | Partly: UnoCSS's theme isn't read, so the action colour came from the Nuxt logo (left, below), and the Tailwind note's advice was wrong for UnoCSS (left, below) |
| 3. `tokens` | Passed: `app/assets/css/motif.css` and `app/design/motion.ts`, no file of the app's touched, the `nuxt.config.ts` note; but the motion-v line said `npm install` in a pnpm app (problem 2, fixed) | The same |
| 4. `check` | Passed: 59 problems in 9 files, at the right lines in the `.vue` files' style blocks | Passed: 82 problems in 25 files, UnoCSS's utilities read as Tailwind's |
| 5. `shot --audit --variant all --rtl` | Passed: 40 screenshots of `/` (to `/news/1`) in 80 s; then 120 of three pages (`--routes /news/1,/item/…,/user/…`) in 230 s, with the variant drawn and a real contrast finding | Failed at first: Motif drew Nuxt's loading screen and audited it (problem 1, fixed); after the fix it says the server was still building after 180 s, which is the app's own failure |

### 1. doctor (hackernews)

```
Motif doctor
  ✓ Motif tool — Version 0.5.0 (win32-x64).
  ✓ App (this folder) — Full support for Vue / Nuxt.
  ✓ Screenshots and previews — Using Chrome.
  ✓ Node.js — Found. Your app needs it to run (Motif itself doesn't).
  ✓ Vue / Nuxt (this folder) — Nuxt 4.6.
  ○ Design guide — None yet — /design will create one.
  ✓ Design sources — Connected: 21st.dev (Claude Code).
```

Node 22.14 is older than Nuxt 4.6 needs, and doctor doesn't say so (the ledger's deferred note from Task 8: doctor could check Node for Nuxt). Here pnpm ran the app on its own Node 24, so nothing failed for that reason.

### 2. extract

hackernews:

```
✓ Draft theme values written to design/tokens.draft.json (from 22 files).
  Colours: 13 found, grouped into 10
  Spacing: 10 values, 6 off a 4px scale
  Corners: 2 sizes · Text sizes: 2 · Fonts: -apple-system · Animation timings: 5
• Dark-mode colours were copied from light mode. Review them before turning on dark mode.
• No colour was found for warning, danger, info, so Motif used defaults.
• 6 spacing values weren't on a 4px scale; the report shows the nearest step for each.
```

Every colour in the `<style lang="postcss">` blocks was found, at its line, nested rules included. Two choices of the shared draft needed a reviewer: the body's `#F4F4F5` (once) was grouped with `#eee` (twice, on borders), so the background became `#EEEEEE`; and text-primary became `#222` (three uses in comments) rather than the body's navy `#020420` (also the header's background). I set both by hand; then `motif validate` asked for a `focus` and a `dusk` `on-action-primary` with enough contrast, and passed: "valid — 74 theme values and 52 readability checks (light + dark, 2 variants) passed."

movies: 11 colours, the page's `#111` and white text from `app.vue`'s style block, and the rest from SVG logos. The app's own accent, `primary: '#40c1ad'` in `unocss.config.ts`, isn't read, so `action-primary` was drafted as the Nuxt logo's `#00DC82`; I set it by hand.

### 3. tokens

```
✓ Theme code is ready:
  created    app/assets/css/motif.css
  created    app/design/motion.ts
  created    design/motif.json
• app/design/motion.ts is for Motion for Vue: npm install motion-v. Vue's <Transition> can use the CSS variables in motif.css instead.
• Next: add '~/assets/css/motif.css' to the css list in nuxt.config.ts (css: ['~/assets/css/motif.css']), before your own styles.
```

Both are Nuxt 4 apps with `app/`: the files went where the Vue guide says, and nothing of the app's was changed. After problem 2's fix the first note reads `pnpm add motion-v`; once `nuxt.config.ts` listed the file, the "Next" note was gone and a second run was "up to date".

### 4. check

hackernews, the top groups of 59 problems in 9 files (all in `<style>` blocks but one SVG `fill`):

```
  8× #fff  Raw colour #fff. … At app/app.vue:52, app/app.vue:75, app/components/ItemListNav.vue:39 and 5 more.
  4× 10px  Spacing 10px isn't on your spacing scale. Closest: var(--motif-space-2) (8px) or var(--motif-space-3) (12px). …
  4× 30px  Spacing 30px isn't on your spacing scale. Closest: var(--motif-space-8) (32px). …
  3× #00C48D  Raw colour #00C48D. …
  3× #00DC82  Raw colour #00DC82. At app/app.vue:62, app/app.vue:66, app/components/AppHeader.vue:23.
  2× cubic-bezier(0.55, 0, 0.1, 1)  Hard-coded easing …
  1× 0.15s  Hard-coded animation timing 0.15s. Use var(--motif-duration-fast), … At app/app.vue:54.
```

Every line I looked up was right (`app.vue:26` is `background-color: #F4F4F5;`, `app.vue:54` is `transition: color 0.15s ease;`). `AppHeader.vue:23` is the logo's SVG `fill`, the kind of value `motif-ok` is for. No reduced-motion finding: the app animates (a spinner, transitions) without a `prefers-reduced-motion` rule, but the generated `motif.css`, which has one, counted before it was wired in, as on React web.

movies, the top groups of 82 problems in 25 files: `12× text-3xl`, `11× bg-black`, `11× text-sm`, `10× text-2xl`, `5× text-4xl`, `4× text-white`, `3× duration-100`, then the logos' colours and `app.vue`'s `#111`. UnoCSS's utilities are Tailwind's names, so they're read as Tailwind's; the fixes name Motif's Tailwind classes, which an UnoCSS app has only if its UnoCSS theme maps them.

### 5. shot

hackernews, the first run:

```
✓ 40 screenshots of 1 page (three phone sizes, a tablet and a desktop, light and dark, right to left in ar, 2 design variants) in design/shots/
  /  40 screenshots (went to /news/1)
✗ Audit: 17 minor (details in design/shots/audit.json):
  minor    /news/1 (mobile) The "Go to homepage" link is 40×30 px on a phone; 44×44 px is easier to tap.
  …
• Skipped pages that need values in their address: /[feed], /[feed]/[page], /item/[id], /user/[id]. Add real ones with --routes.
• / doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.
• The dusk variant looks the same as the default on every screen: the app may not switch variants the way Motif sets them (motif.css, which follows data-variant on <html>).
• Pages that redirected were audited as the page they landed on: / → /news/1.
```

All right: the pages came from `app/pages`, the dynamic ones skipped by name, the redirect followed, and the variant note was true, since the app didn't use the theme yet. The pictures are the app as it runs: the feed at each size, the desktop's right-to-left picture drawn where it is laid out (Task 10b's fix), and in right to left the app's own `margin-right` on the header links running "Jobs" into "Show", which is the app's to fix. The app has no dark mode, so its dark pictures are light, as the app is.

The second run, after wiring the theme in, with three pages: 120 screenshots in 230 s, the item page cropped at 8000 px, and one critical finding, true: in the `dusk` variant the indigo accent on the header's navy reads at 2.55:1. The guide's pairs don't include the accent on the header's colour, which is a hard-coded navy, so only the rendered audit could find it.

movies: see problem 1.

## Problems found, and what was done

1. **Motif drew Nuxt's loading screen** (fixed, `ad01931`). `nuxt dev` answers at once, with its loading screen and HTTP 503, while it builds the app. Motif took any answer as ready, so on nuxt/movies it drew 80 screenshots of "building server · step 6/7" and the audit reported the Nuxt version label's contrast as a critical finding. A web stack can now name the status its dev server answers with while it builds (Vue: 503 for a Nuxt app), and Motif waits for another answer, or says at the limit that the server was still building, with its last output. On nuxt/movies that now reads: "The dev server at http://localhost:3000/ was still building the app after 180 s (it answered HTTP 503)", followed by Nitro's error. Tests: `devserver.test.ts` ("a server that answers with its loading screen first…", "…still on its loading screen at the limit…"), `shot-vue.test.ts` ("a Nuxt app is drawn once it is built").
2. **The motion-v line said npm in a pnpm app** (fixed, `c30ff53`). It now follows the lockfile, as `motif shot` does: `pnpm add`, `yarn add`, `bun add` or `npm install`. Test: `vue-generate.test.ts` ("the install line is the lockfile's package manager's").
3. **UnoCSS's theme isn't read** (left). `motif extract` reads Tailwind's theme and the app's CSS; an UnoCSS config's `theme.colors` isn't either, so nuxt/movies's teal accent was missed. UnoCSS is a different styling system from the ones the spec names (CSS, Tailwind), and the same holds for a React app with UnoCSS; it belongs with the web stacks' backlog, not Vue's.
4. **The extract note told an UnoCSS app to install Tailwind** (left). "15 Tailwind classes couldn't be resolved because Tailwind isn't installed here. Run your package install" is the shared draft's note whenever Tailwind's theme can't be read; for an app without Tailwind the advice doesn't help. It's shared web code (React web says the same), so it's left for the web backlog: the note could say the app doesn't use Tailwind when no Tailwind package is declared.
5. **The draft's grouping and text role** (left). On hackernews the page colour was grouped into a nearby border grey and the text role went to the most used text colour rather than the body's. These are the shared draft's choices for every web stack, and the reviewer's pass that the skill asks for corrects them, as here.
6. **Reduced motion is settled by a generated `motif.css` that isn't wired in yet** (left). As on React web, `check` counts the generated file's `prefers-reduced-motion` rule; the `tokens` note asks for the file to be wired in, and until it is, the app's animations don't follow the setting.
7. **`doctor` doesn't say when Node is too old for the app's Nuxt** (left, the ledger's deferred note from Task 8).

## After the fixes

The Vue tests (`vue-*.test.ts`, `check-vue`, `extract-vue`, `shot-vue`, `tokens-vue`, `component-views`), `devserver.test.ts` and the e2e run of vue-min and nuxt-min (`vue-shot-e2e.test.ts`, which now waits through nuxt-min's loading screen) pass, and the full suite on the commit that marks Vue supported is in the task's report.
