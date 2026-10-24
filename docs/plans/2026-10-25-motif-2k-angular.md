# Motif 2K — Angular (Phase B, third stack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Angular apps with standalone components (v15 and later; Angular 21 and 22 tested) get the full experience of the parity checklist (spec §4): detection and a toolchain check, React web's CSS theme with Motion's motion values, checks of component templates (`.html` files and inline `template:`), component styles (files and inline `styles:`) and Angular's style and class bindings, a draft guide from an app's CSS and Angular Material's system variables, screenshots and audits through `ng serve`, a stack guide, fixtures and evals.

**Architecture:** Angular is the third `WebStack` (`cli/src/stacks/web.ts`) in `cli/src/stacks/angular/`. Plan 2J's final review listed what the shared modules need before a third stack (carried below); this plan does it first (Task 1), then adds Angular's grammar to `componentViews` as an expression-grammar option that generalises Svelte's `braces` (Task 2), with Vue's and Svelte's views byte-identical. An Angular component's template is either an `.html` file beside its `.ts` or a `template:` string inside it, and its styles a file or a `styles:` string: a new shared helper maps a string literal's content into markup or css views at its exact positions. Theme code is React web's CSS, Tailwind theme and `motion.ts` (Motion's `animate()`, framework-free), used from Angular's native `animate.enter`/`animate.leave`; `@angular/animations` is deprecated (v20.2) and Motif doesn't generate for it (decision 0012). Screenshots reuse the browser pipeline with the app's `start` script (`ng serve`) through a new `devScript` hook.

**Tech Stack:** Bun + TypeScript (`cli/`), Angular 21.2 (fixtures) and 22.2 (CI fixture), `@angular/build` (esbuild with Vite's dev server), Angular Material 22 (M3, `--mat-sys-*`), Motion (`motion` 14) for `animate()`, Tailwind 4 through `@tailwindcss/postcss`, `bun test`, a real dev server in tests that skip without Node and a browser.

**Spec:** `docs/specs/2026-10-19-motif-part2-all-stacks-design.md`: §4, §7 (Phase B: "Angular (standalone, v15+): component styles and inline `styles`, templates' `[style.x]`/`[ngStyle]`/class bindings, router configs, `ng serve`"; motion: "Angular animations or Motion; the builder settles each with the stack's current practice"), §8–§11, and the non-goal "Angular versions before standalone components (v15)". Plans 2I (Vue) and 2J (Svelte) are merged: the `WebStack` registry, `componentViews`, the web-stack branches in tokens, check, extract, shot and doctor, and the rulings in their ledgers.

## Global Constraints

- Nothing changes for React web, plain web, Vue, Svelte or the native stacks. Their generated files and views stay byte-identical, and existing tests pass unchanged unless a task names the test it edits.
- Floors: Angular 15 or later with standalone components (an NgModule-only app is still read; `doctor` says what works). Angular 22 needs Node `^22.22.3 || ^24.15.0 || >=26` and Angular 20–21 Node `^20.19 || ^22.12 || >=24` (from each version's `engines`): `doctor` checks the floor of the installed `@angular/core`. This computer has Node 22.14: the fixtures pin Angular 21.2; an Angular 22 fixture (`ng22-min`) runs in CI (Task 12) and skips locally with a reason. The portable Node 24.22.1 in the session scratchpad runs it for the hands-on and evals. Tailwind 4 for Motif's Tailwind theme (Tailwind 3: CSS variables only, React web's note).
- Theme CSS and `motion.ts` are React web's, from the same functions (`motifCss`, `tailwindCss`, `motionTs`); for the same guide the files equal React web's. Variants switch through `data-variant` on `<html>`.
- Theme files: `src/styles/motif.css`, `src/styles/motif.tailwind.css`, `src/app/design/motion.ts` (the app folder Angular's `ng new` makes, `sourceRoot` from `angular.json` when it isn't `src`). `themeDir` in `design/motif.json` wins. Never inside the project's own `design/` folder.
- Motif never edits `package.json`, `angular.json`, `src/styles.*`, `src/index.html`, `app.config.ts`, `main.ts` or any file it didn't generate. Wiring is a printed one-step note.
- Generated files start with `CSS_HEADER` or `TS_HEADER`.
- Screenshots use the app's own `start` script when it runs `ng serve` (else `dev`), the web's sizes (`VIEWPORTS`), states as JavaScript, and axe's audit, unchanged.
- Shared modules stay stack-neutral: what Angular needs is added as options or `WebStack` hooks that Vue and Svelte don't use, never an `angular` branch in a command.
- Messages are plain words in Motif's voice, and every refusal says what to do next.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on the branch `plan/2k-angular` in the worktree `C:/Users/PC/GitHub/motif-2k`. The owner has authorised pushes to the work branch and to main; never force-push; nothing is tagged or released by this plan.

## Facts checked for this plan (2026-10-25)

- npm: `@angular/core` latest 22.2.3, `@angular/cli` 22.2.4, `@angular/material` 22.2.4; `@angular/animations` is marked deprecated ("Use `animate.enter` and `animate.leave` instead"); `@angular/build` 22 uses Vite 8.
- `ng new ng22 --defaults --routing --style=css` (CLI 22) writes `src/app/app.ts` (`styleUrl: './app.css'`, `templateUrl: './app.html'`), `app.html`, `app.css` (empty), `app.config.ts` (`provideRouter(routes)`), `app.routes.ts` (`export const routes: Routes = [];`), `src/main.ts`, `src/index.html`, `src/styles.css`, `angular.json` (`@angular/build:application`, `"styles": ["src/styles.css"]`, `@angular/build:dev-server`), `package.json` scripts `"start": "ng serve"`, `"build": "ng build"`. File names follow the "2025" style guide (`app.ts`, not `app.component.ts`); `--file-name-style-guide 2016` gives the old names. `--style` choices: css, less, sass, scss, tailwind; `tailwind` adds `.postcssrc.json` (`@tailwindcss/postcss`) and `@import 'tailwindcss';` in `src/styles.css`.
- `animate.enter="cls"`, `[animate.enter]="expr"`, `(animate.leave)="fn($event)"` (an `AnimationCallbackEvent` with `animationComplete()`): compiler syntax, not directives; Angular waits for the longest CSS animation or transition on the element.

## Carried from plan 2J (its final review's "wait for 2K" triage)

Fold each into the task that touches its code; none is a task of its own.
- Task 1: hoist before a third copy: `shown`/`NO_VERSION` (vue/doctor, svelte/doctor); the Node-floor check (`nodeVersion`/`older`, now with an `engines` range reader); reduced-motion helpers (`CSS_ANIMATION`/`TW_ANIMATION`/`REDUCED_QUERY` and the report closure, Vue's and Svelte's copies); `readJson` (three places: `project/package.ts`, `shot/devserver.ts`, `react-native/project.ts`; export the first); `kebab`/`title` imported from `text.ts`, not through `flutter/extract`'s re-export (RN, Compose, SwiftUI, Vue re-pointed). A `WebStack.devScript?(appDir, port)` hook replaces `devCommand`'s hard-coded `"dev"`.
- Task 2: generalise `componentViews`' `braces: boolean` into an expression-grammar option (delimiters plus a block-keyword pattern); `<style lang="">` is skipped as non-CSS (treat an empty lang as CSS, as `<template lang="">` was fixed in 2J's wave); regex literals in `{…}` (`readExpression`) only if Angular's reader reuses it.
- Task 4: stop matching fixes by their wording: `svelteFix`/`vueFix` recognise the web motion fix by text; hits get a fix kind (`Hit.fixKind?`) and each stack's `fix` switches on it. Svelte 4's Motion `animate()` fix points at CSS variables in ms while Motion takes seconds: say "seconds" (divide by 1000) in that fix.

## Parity row (spec §4): what makes Angular "done"

| Area | Task |
|---|---|
| Detect and set up | 1, 9 |
| Theme code | 3 |
| Checks | 2, 4 |
| Drafting a guide | 5 |
| Components (inventory) | 9 (guide), 11 (eval counting) |
| Mockups | none to build (the browser frame) |
| Screenshots | 6, 7, 8 |
| Audit | 8 (axe, unchanged) |
| Skill | 9 |
| Evals | 10, 11 |
| Agents | 13 |

## Review Focus

1. **The official starters.** `ng new` (CLI 21 and 22; `--style=css`, `--style=scss`, `--style=tailwind`; the 2016 file names; `--ssr`) as listed under "Facts checked". `doctor` lists each, `tokens` writes beside them without touching a file of theirs, `extract` drafts from `styles.*`, `shot` finds `/` and every page of `app.routes.ts`. Tests in Tasks 1, 3, 5 and 6.
2. **What only looks like a value in an Angular template.** `{{ count > 13 }}`, `@if (count > 13) { … } @else { … }`, `@for (t of tools; track t.id) { … } @empty { … }`, `@switch`/`@case`, `@defer (on viewport) { … } @placeholder { … }`, `@let total = a + b;`, ICU `{count, plural, =0 {none} other {# tools}}`, `(click)="go(13)"`, `[width]="300"`, text "Call 555-0134, ticket #123", an HTML comment holding `color: #fff`, `{{ '{' }}`: no findings. `style="padding: 13px"`, `[style.color]="'#333'"`, `[style.padding.px]="13"`, `[ngStyle]="{ 'gap.px': 13 }"`, `class="p-[13px]"`, `[class.p-[13px]]="on"`, `.row { gap: 13px }` in a component's `.css`/`.scss` or in `styles: [\`…\`]`: findings at their exact line and column (in the `.ts` file for inline templates and styles). Tests in Tasks 2 and 4.
3. **Vue and Svelte unchanged.** Every `.vue` and `.svelte` case from plans 2I and 2J gives the same views and the same findings after Task 2's grammar change (the digest tests). Tests in Task 2.
4. **Router configs.** `Routes` arrays in `app.routes.ts` and in files reached by `loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)` (or a default export); `component` and `loadComponent` pages; `children` with a parent path; `path: ''` with `redirectTo` (not a page); `pathMatch`; `:id` and `**` skipped; routes typed `Route[]` or untyped; `RouterModule.forRoot([...])` in an NgModule app; `provideRouter(routes, withComponentInputBinding())`. Tests in Task 6.
5. **`ng serve` as Motif starts it.** Port 4200 already in use (Motif passes a free port: `-- --port <n>` through the package manager), the "Would you like to share pseudonymous usage data" prompt (no TTY, `NG_CLI_ANALYTICS=false` in the env), an SSR app's dev server, and an app whose `start` script isn't `ng serve` (falls back to `dev`, else the refusal). Tests in Task 7.

---

### Task 1: Groundwork: Angular apps, shared helpers, and the dev-script hook

**Files:**
- Create: `cli/src/stacks/angular/{project,index,doctor}.ts`, `cli/src/project/node-floor.ts` (the hoisted Node-floor check), `cli/src/stacks/web-doctor.ts` (`shown`, `NO_VERSION`), `cli/src/check/reduced-motion.ts` (hoisted helpers)
- Modify: `cli/src/stacks/web.ts` (register `ANGULAR`; add `devScript?`), `cli/src/stacks/{vue,svelte}/{doctor,rules}.ts`, `cli/src/shot/devserver.ts`, `cli/src/check/files.ts`, the `kebab`/`title` and `readJson` import sites (`kebab`/`title` from `cli/src/text.ts`, where they already live; `readJson` exported once from `cli/src/project/package.ts`)
- Test: `cli/test/angular-detect.test.ts`, `cli/test/files.test.ts`, `cli/test/doctor.test.ts`, `cli/test/devserver.test.ts`; Vue's and Svelte's detect, doctor and rules tests unchanged

**Interfaces:**
- Produces:
  - `nodeFloor(range: string, version: string): boolean` (does `version` satisfy an `engines.node` range of `^a.b.c || >=x` parts) and `nodeVersion()`; Svelte's SvelteKit 3 check re-pointed with its text unchanged.
  - `WebStack.devScript?(appDir: string, port: number): { script: string; args: string[] } | null`: the script `devCommand` runs and its arguments after `--`. Absent, `devCommand` runs `dev` as now. Its refusal names the script it looked for.
  - `angular/project.ts`: `angularMajor(appDir)` (installed `@angular/core`, else declared), `angularProject(appDir)` (the first application project in `angular.json`: `sourceRoot`, `styles`, `build` and `serve` builders, `inlineStyleLanguage`), `isStandalone(appDir)` (`bootstrapApplication` in `main.ts`), `appFolder(appDir)` (`<sourceRoot>/app`).
  - `listAngularFiles(root, appPath, opts)`: `WEB_LANGS` (`.ts`, `.html`, `.css`, `.scss`, `.sass`, `.less`) with `ANGULAR_IGNORES = ["/.angular/", "/dist/", "/out-tsc/", "/coverage/", "/.motif/", "*.d.ts", "*.spec.ts"]`.
  - `angularDoctor`: Angular 21.2 standalone: `ok`, "Angular 21.2 with standalone components."; Angular 22 on a Node outside its range: `needed`, "Angular 22 needs Node.js 22.22.3 or later (or 24.15 or later); this computer has <version>. Install a newer Node.js from nodejs.org."; NgModule-only on 15+: `ok` with "(NgModules)"; Angular 14 or older: `optional` through `unsupported`, "Angular 14 isn't supported: Motif supports Angular 15 and later. Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.".
- [ ] **Step 1: Write the failing tests:** each starter of Review Focus 1 as a temp folder, an Angular workspace with two application projects and a library, an Nx-style `apps/web` beside a Svelte app, Angular 14, Angular 22 with a fake old Node, the ignores, `nodeFloor` on the three real `engines` ranges, `devScript` (absent: `dev` as before; present: its script and `-- --port 4321`), and that every hoisted helper's callers behave as before.
- [ ] **Step 2: Run** `cd cli && bun test test/angular-detect.test.ts test/files.test.ts test/doctor.test.ts test/devserver.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** plus `bun test test/svelte-detect.test.ts test/vue-detect.test.ts test/svelte-rules.test.ts test/vue-rules.test.ts test/rn-detect.test.ts test/extract-flutter.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(stacks): Angular apps; shared web helpers hoisted; a dev-script hook`.

### Task 2: Component views read Angular templates, and strings that hold a template or styles

**Files:**
- Modify: `cli/src/check/component-views.ts`, `cli/src/check/html.ts`
- Create: `cli/src/check/embedded.ts`
- Test: `cli/test/component-views.test.ts` (new Angular cases; every existing case and digest unchanged), `cli/test/embedded.test.ts`

**Interfaces:**
- Produces:
  - `componentViews(text, { bindings, blocks?, grammar? })` where `grammar: { open: string; close: string; blocks?: RegExp }` replaces `braces: true` (Svelte passes `{ open: "{", close: "}", blocks: <its keywords> }`, Vue nothing). Angular's grammar: `{{`…`}}` interpolation to script; `@if (…) {`, `} @else if (…) {`, `} @else {`, `@for (…; track …) {`, `@empty {`, `@switch (…) {`, `@case (…) {`, `@default {`, `@defer (…) {`, `@placeholder (…) {`, `@loading (…) {`, `@error {`: the parenthesised part to script, the keywords and braces blank; `@let name = expr;` to script; ICU `{x, plural, … {text}}`: the selector to script, the case texts markup. Attribute bindings: `[style.prop]="…"` and `[style.prop.unit]="…"` as css when the value is a string or number literal (`prop: value[unit];`), else script; `[ngStyle]`/`[style]` values to script; `[class.name]="…"` (the name, which may hold `[…]`, in the markup view's class reading, the value in script); `[class]`, `[ngClass]`, `[x]`, `(x)`, `[(x)]`, `*ngX`, `bind-`/`on-` forms, `animate.enter`/`animate.leave` values: script (a plain `animate.enter="cls"` is a class list, read as classes). `#ref` and `let-x` are markup.
  - `<style lang="">` treated as CSS (2J residual).
  - `embedded.ts`: `stringRegions(tsText, keys: string[]): { key: string; start: number; end: number; kind: "template" | "style" }[]` (the content of `template: \`…\``/`'…'` and of `styles: \`…\``, `styles: [\`…\`, …]`, in a `@Component({...})` call, without `${…}` parts, which stay script) and `withEmbedded(tsText, views): ComponentViews` that blanks each region in the script view and places its content, at its exact positions, in the markup view (through the Angular grammar) or the css view.
- [ ] **Step 1: Write the failing tests:** Review Focus 2's template, as an `.html` file and as an inline `template:`, each non-blank character at its original position, the negatives blank in every view; `styles` as one string and as an array; a template string with `${x}` (rare, but legal); CRLF; Review Focus 3's digests.
- [ ] **Step 2–4:** run, implement, run with `bun test test/component-views.test.ts test/embedded.test.ts test/check-html.test.ts test/check-vue.test.ts test/check-svelte.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(check): component views read Angular templates and inline templates and styles, with Vue's and Svelte's views unchanged`.

### Task 3: `motif tokens` writes Angular theme code, and decision 0012

**Files:**
- Create: `cli/src/stacks/angular/generate.ts`, `docs/decisions/0012-angular-motion.md`, `cli/test/fixtures/angular-min/` (Angular 21.2 standalone, `ng new --style=tailwind` shape, `motion`, two routes; a committed `package-lock.json`)
- Modify: `cli/src/stacks/angular/index.ts`
- Test: `cli/test/angular-generate.test.ts`, `cli/test/tokens-angular.test.ts`, `cli/test/angular-compile.test.ts` (needs Node; `ng build` on `angular-min`)

**Interfaces:**
- Produces: `generateAngular(set, ctx)`: `src/styles/motif.css`, `motif.tailwind.css` (Tailwind 4), `src/app/design/motion.ts` = `motionTs(set.base)` (React web's: Motion's `animate()` takes seconds), at `sourceRoot` and `themeDir` as the Global Constraints say. Decision 0012 records: Motif's Angular motion is CSS classes with `animate.enter`/`animate.leave` timed by `var(--motif-duration-*)`/`var(--motif-easing-*)`, and Motion's `animate()` with `motion.ts` in `(animate.leave)` callbacks and code; no generation for `@angular/animations` (deprecated in v20.2); Angular 15–20.1 (no `animate.enter`) use the CSS variables and Motion in code.
  - Notes: `motion` not declared: `<pm add> motion` (as React web). Wiring: "Next: add @import \"./styles/motif.css\"; at the top of src/styles.css." (`.scss`: `@use "./styles/motif.css";`; the file `angular.json`'s first `styles` entry names); Tailwind 4: "right after @import \"tailwindcss\"" note. Skipped when the app's styles already import it.
- [ ] **Step 1: Write the failing tests:** files equal React web's; each layout (`ng new` 2025 and 2016 names, `sourceRoot: "projects/web/src"`, `themeDir`, scss, Tailwind 3); notes; protection; "up to date"; no app file changed; `angular-compile.test.ts` (`skipIf` no Node): `angular-min` with the generated files, a component using `animate.enter="fade-in"` with `.fade-in { animation: fade var(--motif-duration-base) var(--motif-easing-standard) }` and `animate(el, { opacity: 0 }, motionSpring.snappy)` in an `(animate.leave)` callback, passes `ng build`.
- [ ] **Step 2–4:** write the decision, implement, run the three files plus `bun test test/tokens-command.test.ts test/tokens-vue.test.ts test/tokens-svelte.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(tokens): Angular theme code — React web's CSS and motion, wired from styles.css; decision 0012`.

### Task 4: `motif check` on Angular files

**Files:**
- Create: `cli/src/stacks/angular/rules.ts`
- Modify: `cli/src/stacks/angular/index.ts` (`views`: a component `.html` (named by a `templateUrl` or beside a `.ts` with `@Component`) through Task 2's grammar, `src/index.html` left to `expandHtml`; a `.ts` with `@Component` through `withEmbedded`); `cli/src/check/types.ts` (`Hit.fixKind?`), `cli/src/stacks/{vue,svelte}/rules.ts` (switch on `fixKind`, texts unchanged except Svelte 4's seconds)
- Test: `cli/test/angular-rules.test.ts`, `cli/test/check-angular.test.ts`; `check-vue`/`check-svelte` unchanged but for the named Svelte 4 text

**Interfaces:**
- Produces: on Angular's views the existing rules find what they find in React web, and `scanAngular` adds:
  - **raw-motion:** `@angular/animations`' `animate('300ms 100ms ease-out', …)`/`animate(300)` timings and `transition(…)` blocks in a `.ts` (fix: "@angular/animations is deprecated: use animate.enter with a class timed by var(--motif-duration-*) and var(--motif-easing-*)"); Motion's `animate(…, { duration, ease, type: "spring" })` as React web's rule judges them.
  - **reduced-motion** (app-wide): the app animates (`animate.enter`/`animate.leave` with CSS animations, `@angular/animations`, Motion's `animate`, CSS animations) and nothing respects reduced motion (`matchMedia('(prefers-reduced-motion…')`, a CSS query, `provideNoopAnimations`/`provideAnimationsAsync('noop')` for the legacy package): the hoisted helpers of Task 1.
  - `ANGULAR.fix`: colours "Use 'var(--motif-color-<role>)' in the component's styles or [style.color], or a class (bg-<role>) with Tailwind."; motion through `fixKind`; `motif-ok` in `<!-- … -->`, `// …` and `/* … */`.
  - `ANGULAR.extensions`: `[".ts", ".html", ".css", ".scss"]` for the "nothing to check" message.
- [ ] **Step 1: Write the failing tests:** Review Focus 2 both ways in the `.html` and inline forms, each rule with exact positions, and the command on a temp `ng new`-shaped app (fixes, `motif-ok`, generated files skipped, reduced motion with and without a `matchMedia` check, Tailwind 4 classes and `[class.x]`), plus the fix-kind switch giving Vue's and Svelte's texts unchanged.
- [ ] **Step 2–4:** run, implement, run plus `bun test test/check-command.test.ts test/check-vue.test.ts test/check-svelte.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(check): Angular — templates, bindings, inline templates and styles, with fixes in Angular's terms`.

### Task 5: `motif extract` drafts a guide from an Angular app

**Files:**
- Create: `cli/src/stacks/angular/extract.ts`
- Modify: `cli/src/stacks/angular/index.ts` (`collect`); `cli/src/commands/extract.ts` only if Angular needs something Vue and Svelte didn't
- Test: `cli/test/extract-angular.test.ts`

**Interfaces:**
- Produces: Angular's views (component files, inline styles, global `styles.*`) go through the web's `collectOccurrences`. `ANGULAR.collect` adds Angular Material: `--mat-sys-*` values set in CSS (`:root`/`html` blocks, `mat.theme-overrides((primary: #…))` and `mat.theme((color: (primary: …)))` maps with literal colours) mapped to roles (`--mat-sys-primary` → action-primary, `on-primary` → its foreground, `surface`, `on-surface`, `error`, `outline-variant` → border, `corner-*` → radii, `color-scheme: light dark` / `.dark-theme` blocks → dark values); a Material palette given only by name (`mat.$azure-palette`) gives no colour and a note naming it.
- [ ] **Step 1–4:** tests on an `ng new` app's `styles.css`, a Material app's `styles.scss` with `mat.theme` and overrides, a Tailwind 4 `@theme`, inline `styles:` and an Nx monorepo (Angular and Svelte drafted together); implement; run plus `bun test test/extract-vue.test.ts test/extract-svelte.test.ts test/extract-command.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(extract): Angular — component and global styles, and Angular Material's system colours`.

### Task 6: Routes of an Angular app

**Files:**
- Create: `cli/src/stacks/angular/routes.ts`
- Modify: `cli/src/stacks/vue/routes.ts` only to share a path-joining helper through `route-source.ts`
- Test: `cli/test/angular-routes.test.ts`

**Interfaces:**
- Produces: `discoverAngularRoutes(appDir): RouteDiscovery`, wired as `ANGULAR.routes`, for every convention of Review Focus 4: start at the array passed to `provideRouter` (through its imported name) or `RouterModule.forRoot`; `loadChildren` followed into the imported file (named or default export; no further than 5 files deep); `children` joined to the parent path; `redirectTo` and `canMatch`-only entries are not pages; `:param` and `**` go to `skipped`; `/` first. Uses the shared object-literal reader.
- [ ] **Step 1–4:** tests on the starters (empty `routes`: `/` only), every convention, a 2016-names app; implement. Expect PASS.
- [ ] **Step 5: Commit** `feat(shot): find an Angular app's routes — router configs and lazy-loaded children`.

### Task 7: `motif shot` starts Angular apps

**Files:**
- Modify: `cli/src/stacks/angular/index.ts` (`devScript`, `devEnv` with `NG_CLI_ANALYTICS=false`, `startTimeoutMs`, `variantHow`, `auditFixes`), shot code only if Angular needs a hook Vue and Svelte didn't
- Test: `cli/test/shot-angular.test.ts`, `cli/test/devserver.test.ts`

**Interfaces:**
- Produces: an Angular app takes the web-stack path in `runShot` with no new branch in the command: `devScript` gives `start` when it runs `ng serve` (else `dev` when present, else null and the refusal "This app has no \"start\" script that runs ng serve…"), with `--port <free>`; `ANGULAR.routes`; the web's sizes; `variantHow` ("motif.css, which follows data-variant on <html>"); the audit's reduced-motion fix in Angular's terms ("Check matchMedia('(prefers-reduced-motion: reduce)') before animating with Motion, and keep CSS animations inside @media (prefers-reduced-motion: no-preference)"). `findLocalAddress` reads `ng serve`'s banner; a test pins one captured from a real `ng serve` of `angular-min` (say in the test that it was captured in a temp copy).
- [ ] **Step 1–4:** tests with fake deps (CLI 21 and 22 apps, package managers, Windows, a busy 4200, Angular 14 taking the same path, refusals, a failing route); implement; run plus `bun test test/shot-vue.test.ts test/shot-svelte.test.ts test/shot-command.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(shot): Angular apps through ng serve`.

### Task 8: Drawn for real: variants, dark, RTL, fonts, states and the audit

**Files:**
- Create: `cli/test/angular-shot-e2e.test.ts` (needs Node and a browser), `cli/test/fixtures/ng22-min/` (Angular 22; its tests skip with a reason when Node is outside 22's range)
- Modify: `cli/test/fixtures/angular-min/` (grows: the generated theme imported from `styles.css`, a variant, Arabic text, a project font, a planted low-contrast caption, a 32 px icon button without a name, a looping CSS animation through `animate.enter`)
- Modify: any shot or audit code the run shows needs it, with a test

**Interfaces:**
- Produces: as plan 2J's Task 8, on `angular-min` and, where Node allows, `ng22-min`: light and dark at 390 and 1440, `--variant all`, `--rtl` in the Arabic companion, a JavaScript state, `--audit` finding the planted problems and the loop unless the app checks reduced motion. Times to the first screenshot go in the ledger and the guide.
- [ ] **Step 1:** Run the fixtures through `motif shot` and Read the PNGs. **Step 2:** Fix what the run shows, with tests. **Step 3–4:** e2e tests; run. Expect PASS (or skip with a reason).
- [ ] **Step 5: Commit** `test(shot): Angular drawn for real, with variants, dark, RTL, states and the audit`.

### Task 9: The Angular stack guide and the modes

**Files:**
- Create: `skill/adapters/angular/{README,tokens,components,motion,platform,checks}.md`
- Modify: `skill/SKILL.md`, `skill/modes/{init,feature,review}.md`, `skill/knowledge/variants.md`
- Test: `cli/test/adapters.test.ts`, `cli/test/skill-modes.test.ts`, `cli/test/skill-content.test.ts`

**Content the tests pin (exact strings):**
- `README.md`: `ng new`, `--style=tailwind`, `ng build`, `npm start`, `design/motif.json`, `themeDir`, the floors (Angular 15, standalone components, Angular 22 needs Node 22.22.3), that Angular 14 isn't supported, the browser frame for mockups, the first-screenshot times from Task 8.
- `tokens.md`: `motif.css`, `motif.tailwind.css`, `src/styles.css`, `angular.json`, `var(--motif-color-`, `bg-action-primary`, `data-variant`, "Switching variants" (`document.documentElement.dataset.variant` from a signal in a service, and with SSR, `DOCUMENT` from `@angular/core` so the server-rendered page starts in the right variant).
- `components.md`: standalone components in `src/app/` (one folder per component, `.ts` + `.html` + `.css`), `input()`/`output()`, `@if`/`@for`, content projection with `<ng-content>`, `<button>` with every state, `aria-label`, component styles with `var(--motif-…)`, the starter set table (role names; files in kebab-case).
- `motion.md`: `animate.enter`, `animate.leave`, `var(--motif-duration-`, `motionSpring.`, `animate(`, `animationComplete()`, `prefers-reduced-motion`, and that `@angular/animations` is deprecated.
- `platform.md`: `dir="rtl"`, logical properties, `<html lang dir>` in `src/index.html` and per locale (`@angular/localize` builds one app per locale), `Directionality` from `@angular/cdk/bidi`, `afterNextRender` for what reads the browser.
- `checks.md`: one section per rule with fix examples that pass `motif check` in an `.html` template and an inline `template:`; states as JavaScript; `--rtl`.
- [ ] **Step 1–4:** tests (every code block run through `motif tokens` and `motif check` in a temp Angular app, as 2J did for Svelte), write, run (plus `bun test test/agents-package.test.ts test/plugin.test.ts`).
- [ ] **Step 5: Commit** `docs(skill): the Angular stack guide`.

### Task 10: Angular fixtures: Ataa, and a seeded copy

**Files:**
- Create: `tests/fixtures/angular-contract-app/`: **Ataa**, a volunteer-shift board for a food bank (open shifts, a shift's page, my shifts, sign-in) in English and Arabic, Angular 21.2 standalone + TypeScript + Tailwind 4, in-memory data, the generated theme, Noto Kufi Arabic as the Arabic companion, variants `default` and `harvest-night` (a dusk palette, colours only), one `animate.enter` with reduced motion respected; `tests/fixtures/angular-seeded-app/{overlay/,seeded-issues.json,README.md}` with at least 8 exact problems (typed colour in `[style.color]`, off-scale padding in a component `.css`, off-scale gap in an inline `styles:`, off-scale radius as a Tailwind class, typed font size, a raw `@angular/animations` timing, low-contrast caption, unnamed icon button) and 4 judgement problems (a cramped shift card, two primary buttons on one screen, no empty state for "my shifts", `margin-left` that doesn't mirror in Arabic).
- Modify: `tests/fixtures/assemble.ts`
- Test: `cli/test/fixtures-angular.test.ts` (sorted hit lists, not membership)
- [ ] **Step 1–4:** as plan 2J's Task 10. Ataa has no `/history` or `/settings` page.
- [ ] **Step 5: Commit** `feat(fixtures): Ataa, an Angular volunteer-shift board with a harvest-night variant and Arabic, and its seeded copy`.

### Task 11: Angular eval cases and grading

**Files:**
- Create: `tests/fixtures/briefs/sanad.md` (a neighbourhood repair-request desk in English and Arabic, Angular, no design sources)
- Modify: `tests/evals/cases.ts`, `collect.ts`, `grade.ts`, `preflight.ts`, `README.md`
- Test: `cli/test/evals-*.test.ts`, `cli/test/fixtures-briefs.test.ts`

**Interfaces:**
- Produces: `b-angular-history` (a volunteer's shift history at `/history`, with an empty state), `b-angular-settings` (settings at `/settings` with the variant switch), `c-angular`, `d-sanad` (routes `/`, `/sign-in`, `/requests`), `stack: "angular"`. Grading: `build` = `npm run build` (`ng build` type-checks templates in strict mode, so `typecheck` = the build's type errors only, through 2J's `typeErrorsOnly`); render through `motif shot --sizes 390,1440`; a route exists when `discoverAngularRoutes` lists it; `angularComponents(diff)` counts new `@Component` classes in files under `src/app/` that aren't routed pages. Preflight: Node and a browser, and Angular 22's Node range when `ng new` would install it (`nodeNeeds.angular22`).
- [ ] **Step 1–4:** tests, implement, run. **Step 5: Commit** `feat(evals): Angular cases — two features on Ataa, the seeded review, and a new app from a brief`.

### Task 12: CI runs the Angular tests

**Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `cli/test/release.test.ts`
- [ ] An `angular` job on `ubuntu-latest` (Node 24 latest, inside Angular 22's range), modelled on `svelte`, with a step that fails when Node is outside `^22.22.3 || ^24.15.0 || >=26` so `ng22-min` can't skip silently; its heavy tests under `heavyStackTests("angular", …)`; `publish.needs` gains `angular`. Push the branch, run CI, see every job pass. **Commit** `ci: an Angular job`.

### Task 13: Angular is supported: hands-on, evals, docs

**Files:** `cli/src/detect/stacks.ts` (`ADAPTERS_AVAILABLE`, `WEB_STACKS`), `docs/parity.md` (the Angular row and its proof section), `docs/notes/<date>-angular-hands-on.md`; tests `doctor`, `adapters`, `release`
- [ ] **Step 1–4:** tests, implement, full suite.
- [ ] **Step 5: Hands-on** on a scratch copy of a public Angular app: first choice, Angular's own sample from `ng new` plus a maintained public Angular 20+ app with Angular Material (e.g. the Angular team's `components` docs site, or a RealWorld Angular app if it builds), run on a Node new enough for the Angular it installs (the portable Node 24 if this computer's is older). `doctor`, `extract`, `tokens`, `check`, `shot --audit --variant all --rtl`. Record what each showed and what was fixed.
- [ ] **Step 6 (controller):** `bun tests/evals/run.ts --cases b-angular-history,b-angular-settings,c-angular,d-sanad`; all four pass; the Evals cell records the run.
- [ ] **Step 7: Commit** `feat: Angular is supported`.
