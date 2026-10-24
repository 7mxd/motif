# Motif 2J — Svelte and SvelteKit (Phase B, second stack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Svelte 5 apps (SvelteKit 2 and 3, and Svelte with Vite) get the full experience of the parity checklist (spec §4): detection and a toolchain check, React web's CSS theme with Svelte's own motion values, checks of `.svelte` files (markup, `{…}` expressions, directives and style blocks), a draft guide from an app's CSS, screenshots and audits through the app's own dev server, a stack guide, fixtures and evals.

**Architecture:** Svelte is the second `WebStack` (`cli/src/stacks/web.ts`, built in plan 2I) in `cli/src/stacks/svelte/`. Plan 2I's final review found the shared modules aren't ready for Svelte by a registry line alone; the ruling recorded there is carried out here: `check/component-views.ts` gains a value-delimiter option so attribute values written as `{…}` (with spaces, `=`, `>` and nested braces inside) and text interpolations (`{expr}`, `{#if …}`, `{@html …}`) are read, while Vue's views stay byte-identical. Theme code is React web's CSS and Tailwind theme plus a `motion.ts` in Svelte's terms: durations in milliseconds and easing functions for `svelte/transition` and `Tween`, springs for `svelte/motion`'s `Spring`, and Motion's spring objects for `animate()`; decision 0011 records how Motif's springs map onto Svelte's. Screenshots reuse the browser pipeline with the app's `dev` script.

**Tech Stack:** Bun + TypeScript (`cli/`), Svelte 5.57 (runes), SvelteKit 2.70 and 3.1, Vite 8, `svelte-check`, Motion (`motion` 14) for `animate()`, Tailwind 4, `bun test`, a real dev server in tests that skip without Node and a browser.

**Spec:** `docs/specs/2026-10-19-motif-part2-all-stacks-design.md`: §4, §7 (Phase B: "Svelte/SvelteKit (Svelte 5): `.svelte` files (`<style>`, `style:` directives, class bindings), SvelteKit's `src/routes`, the Vite dev server"; motion: "Svelte's `svelte/motion` and Motion"), §8–§11. Plan 2I (Vue) is merged: the `WebStack` registry, `componentViews`, the web-stack branches in tokens, check, extract, shot and doctor, and the rulings in its ledger.

## Global Constraints

- Nothing changes for React web, plain web, Vue or the native stacks. Their generated files and views stay byte-identical, and existing tests pass unchanged unless a task names the test it edits.
- Floors: Svelte 5 (runes; Svelte 4 and earlier are a spec non-goal, and `doctor` says so plainly), SvelteKit 2 or 3. SvelteKit 3 needs Node 22.17 or later: the fixtures pin SvelteKit 2.70 so they run on any Node 20.19+/22.12+, and a SvelteKit 3 fixture runs in CI (Task 12), skipping locally with a reason on an older Node. Tailwind 4 for Motif's Tailwind theme (Tailwind 3: CSS variables only, React web's note).
- Theme CSS is React web's, from the same functions (`motifCss`, `tailwindCss`); for the same guide the CSS files equal React web's. `motion.ts` is Svelte's own (Task 3). Variants switch through `data-variant` on `<html>`.
- Theme files go under `src/lib/` (SvelteKit's `$lib`, and where `npm create vite` puts a Svelte app's own code): `src/lib/styles/motif.css`, `src/lib/styles/motif.tailwind.css`, `src/lib/design/motion.ts`. `themeDir` in `design/motif.json` wins. Never inside the project's own `design/` folder.
- Motif never edits `package.json`, `svelte.config.*`, `vite.config.*`, `src/app.html`, `+layout.svelte`, `main.ts` or any file it didn't generate. Wiring is a printed one-step note.
- Generated files start with `CSS_HEADER` or `TS_HEADER`.
- Screenshots use the app's own `dev` script, the web's sizes (`VIEWPORTS`, the desktop included), states as JavaScript, and axe's audit, unchanged.
- Shared modules stay stack-neutral: what Svelte needs is added as options or `WebStack` hooks that Vue doesn't use, never a `stack === "svelte"` branch in a command.
- Messages are plain words in Motif's voice, and every refusal says what to do next.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on the branch `plan/2j-svelte` in the worktree `C:/Users/PC/GitHub/motif-2j`. The owner has authorised pushes to the work branch and to main; nothing is tagged or released by this plan.

## Carried from plan 2I (its final review's "wait for 2J" triage)

Fold each into the task that touches its code; none is a task of its own.
- Task 1: doctor's hard-coded Vue line (→ `unsupported` hook); `declared` imported from React Native's project; doctor says "Vue." / "Nuxt." with no readable version; move `packageManager`/`addPackages`/`LOCKFILES`/`installRoot` out of `shot/devserver.ts`; Vue's extract imports `kebab`/`title` from Flutter's and the object-literal parser from React Native's (→ shared helpers).
- Task 2: pug templates read as HTML (blank non-HTML template langs); CSS bindings on separate lines lose their `;`; tag-region blanking duplicated in `html.ts` and `component-views.ts`, two attribute grammars, `TAG` exported with the `g` flag; tests for CRLF with bindings and unclosed blocks by content; `selfClosing` always on (fine for Svelte, say so in a test).
- Task 4: Vue's per-`:style`-span full-length copy (`vue/rules.ts`) — use one buffer, and don't repeat it in Svelte's rules.
- Task 5: Vuetify themes with custom names (`myLight`) pair with nothing; the status-role test uses distinct hues (prove the name match); Vuetify `on-*` names unmapped.
- Task 6: Vue routes: spread-only `children` drop the parent; an untyped separate routes array is missed; `needsValue` checks only a segment's first character (`/p/prefix-:id`); `/files/:path*` dropped rather than skipped; the 500-file walk without `src/` covers `dist/` and `design/`.
- Task 8: e2e pixel probes hard-coded to viewport geometry; timing `console.log` lines in test output.
- Task 9: Vue guide nits (README "(version 3)" vs Vue 2; the Vue 2 line omits `shot --url`; a state-script comment's placement; "measured on Windows" wording; Nuxt's fixed 500 ms hydration wait).
- Task 10: fixtures' "nothing else" compares membership, not counts; `CATEGORIES` is a hand copy of review.md's list.
- Task 11: `cases.ts` special-cases `vue` for the page noun (→ a parameter); type errors counted twice (build + typecheck); `vueComponents` only under root/`src`/`app` `components/`.

## Parity row (spec §4): what makes Svelte "done"

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

1. **The official starters.** `npx sv create` (SvelteKit minimal, TypeScript) writes `src/routes/+page.svelte`, `src/routes/+layout.svelte` (importing nothing or `../app.css`), `src/app.html`, `src/lib/index.ts`, `svelte.config.js`; its "demo" template adds `/about` and `/sverdle` with scoped styles and CSS variables in `src/app.css`. `npm create vite` with the Svelte template writes `src/App.svelte`, `src/main.ts`, `src/app.css`, `src/lib/Counter.svelte`. `doctor` lists each, `tokens` writes beside them without touching a file of theirs, `extract` drafts from `app.css`, `shot` finds `/`, `/about` and `/sverdle` (Kit demo) and `/` (Vite). Tests in Tasks 1, 3, 5 and 6.
2. **What only looks like a value in a `.svelte` file.** `{count > 13}` and `{#if count > 13}`, `onclick={() => a > b}`, `bind:value={name}`, `<img width={300}>`, template text "Call 555-0134, ticket #123", an HTML comment holding `color: #fff`, a script string `"rgba is a function"`, `{@html markup}`: no findings. `style:color="#333"`, `style="padding: 13px; color: {c}"`, `.row { gap: 13px }` in `<style>`, `class="p-[13px]"`, `class:p-[13px]={on}`, `transition:fly={{ y: 8, duration: 300 }}`: findings at their exact line and column. Tests in Tasks 2 and 4.
3. **Vue unchanged.** Every `.vue` case from plan 2I's tests gives the same views and the same findings after Task 2's grammar change. Tests in Task 2.
4. **SvelteKit's file routes.** Groups `(app)`, params `[slug]`, optional `[[lang]]`, rest `[...path]`, matchers `[id=integer]`, layout resets `+page@.svelte`, a `+page.server.ts` without a `+page.svelte` (not a page), `+error.svelte`, and a custom `kit.files.routes` folder. Tests in Task 6.
5. **A Svelte 4 app, or SvelteKit 1.** `doctor` says it isn't supported and what still works (through a `WebStack` hook, replacing Vue's hard-coded line in `doctor.ts`); `tokens` writes the CSS theme and says why there's no `motion.ts` (`svelte/motion`'s `Spring` and `Tween` classes are Svelte 5); `check` and `extract` read its `.svelte` files. Tests in Tasks 1 and 3.

---

### Task 1: Groundwork: Svelte apps, shared helpers, and the unsupported-version hook

**Files:**
- Create: `cli/src/stacks/svelte/{project,index,doctor}.ts`, `cli/src/project/package.ts` (shared helpers moved here)
- Modify: `cli/src/stacks/web.ts` (register `SVELTE`; add `unsupported?(appDir): string | null`), `cli/src/stacks/vue/{index,doctor,project,generate}.ts`, `cli/src/stacks/react-native/project.ts`, `cli/src/shot/devserver.ts`, `cli/src/commands/doctor.ts`, `cli/src/check/files.ts`
- Test: `cli/test/svelte-detect.test.ts`, `cli/test/files.test.ts`, `cli/test/doctor.test.ts`, `cli/test/vue-detect.test.ts` (unchanged, must pass)

**Interfaces:**
- Produces:
  - `project/package.ts`: `declared(appDir, pkg)` (moved from `react-native/project.ts`), `installedVersion(appDir, pkg)` / the version reader Vue uses, `packageManager(appDir)`, `addPackages(...)`, `LOCKFILES`, `installRoot(appDir)` (moved from `shot/devserver.ts`). Old import sites re-point; no behaviour change (plan 2I ledger: T1, T13 deferred minors).
  - `WebStack.unsupported?(appDir): string | null`: the doctor line for a version Motif doesn't support. `doctor.ts` uses it instead of its `app.stack === "vue"` branch; Vue's own text is unchanged.
  - `svelte/project.ts`: `isSvelteKit(appDir)` (`@sveltejs/kit` in dependencies), `svelteMajor(appDir)`, `kitMajor(appDir)`, `routesDir(appDir)` (`kit.files.routes` from `svelte.config.*` when a string literal, else `src/routes`), `svelteSrcDir(appDir)` (`src`).
  - `listSvelteFiles(root, appPath, opts)`: `WEB_LANGS` plus `".svelte": "markup"`, with `SVELTE_IGNORES = ["/.svelte-kit/", "/build/", "/.vercel/", "/.netlify/", "/.output/", "/dist/", "/.motif/", "*.d.ts"]`.
  - `svelteDoctor`: Svelte 5 with SvelteKit: `ok`, "Svelte 5.57 with SvelteKit 2.70." (SvelteKit 3 on a Node older than 22.17: `needed`, "SvelteKit 3 needs Node.js 22.17 or later; this computer has <version>. Install a newer Node.js from nodejs.org."); Svelte with Vite: "Svelte 5.57 with Vite."; Svelte 4 or SvelteKit 1: `optional`, "Svelte 4 isn't supported: Motif supports Svelte 5 (runes). Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url." (through `unsupported`).
- [ ] **Step 1: Write the failing tests:** both starters of Review Focus 1 as temp folders, a SvelteKit app with `kit.files.routes`, a monorepo with `apps/web` (SvelteKit) beside `apps/admin` (Vue), a Svelte 4 app, SvelteKit 3 with a fake old Node, the ignores, and that every moved helper's callers behave as before.
- [ ] **Step 2: Run** `cd cli && bun test test/svelte-detect.test.ts test/files.test.ts test/doctor.test.ts test/vue-detect.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** plus `bun test test/detect.test.ts test/rn-detect.test.ts test/devserver.test.ts test/tokens-vue.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(stacks): Svelte and SvelteKit apps; shared package helpers; a doctor hook for unsupported versions`.

### Task 2: Component views read `{…}`: Svelte's markup

**Files:**
- Modify: `cli/src/check/component-views.ts`, `cli/src/check/html.ts` (one attribute grammar and one blanking helper, shared: plan 2I ledger T2 deferred minors), `cli/src/stacks/svelte/index.ts` (`views`)
- Test: `cli/test/component-views.test.ts` (new Svelte cases; every existing case unchanged), `cli/test/check-html.test.ts` (unchanged)

**Interfaces:**
- Produces: `componentViews(text, { bindings, blocks?, braces?: true })`. With `braces`, an attribute value may be `{…}` (balanced braces, strings, template literals and comments inside), a quoted value may hold `{…}` parts (`style="padding: 13px; color: {c}"`: the literal parts in the css view, the `{…}` parts blanked there and placed in the script view), and text `{…}` in the markup (including `{#if …}`, `{:else if …}`, `{#each … as …}`, `{@html …}`, `{@const …}`, `{@render …}`) goes to the script view. Svelte's bindings: `style:prop="…"`/`style:prop={…}` as css (`prop: value;`, with a `;` kept between bindings on separate lines: the plan 2I T2 minor), `class:name={…}` (the name in the markup view, the value in script), `class={…}` in the markup view's class reading (quoted names inside) and script, `on*={…}`, `bind:*`, `transition:`/`in:`/`out:`/`animate:`/`use:` and any other `{…}` value in script. `<script>` and `<script module>` are script; `<style>` (with `:global(...)`) is css; `<svelte:head>`, `<svelte:window>`, `<svelte:options>` are markup. Svelte has no custom blocks (`blocks` omitted, as plan 2I's ledger notes).
- [ ] **Step 1: Write the failing tests:** Review Focus 2's file (each non-blank character at its original position; the negatives blank in every view), a `{…}` value holding `>`, `=`, nested braces and a template literal with `${}`, CRLF with bindings (plan 2I T2 gap), and Review Focus 3: all of plan 2I's Vue cases byte-identical.
- [ ] **Step 2–4:** run, implement, run with `bun test test/component-views.test.ts test/check-html.test.ts test/check-vue.test.ts test/vue-rules.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(check): component views read {…} values and text, for Svelte, with Vue's views unchanged`.

### Task 3: `motif tokens` writes Svelte theme code, and decision 0011

**Files:**
- Create: `cli/src/stacks/svelte/generate.ts`, `docs/decisions/0011-svelte-motion.md`, `cli/test/fixtures/svelte-min/` (SvelteKit 2.70 + TypeScript + Tailwind 4 + `motion`: `package.json`, `svelte.config.js`, `vite.config.ts`, `src/app.html`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `src/routes/settings/+page.svelte`; a committed `package-lock.json`)
- Modify: `cli/src/stacks/svelte/index.ts`
- Test: `cli/test/svelte-generate.test.ts`, `cli/test/tokens-svelte.test.ts`, `cli/test/svelte-compile.test.ts` (needs Node; `svelte-check` on `svelte-min`)

**Interfaces:**
- Produces: `generateSvelte(set, ctx)`: `src/lib/styles/motif.css`, `motif.tailwind.css` (Tailwind 4), `src/lib/design/motion.ts` with:
  - `duration` (milliseconds, Svelte's unit for transitions and `Tween`),
  - `easing`: functions `(t: number) => number` from each easing role's cubic-bezier points (a small exact cubic-bezier solver in the file, no dependency), usable as `easing.standard` in `transition:fly={{ easing: easing.standard }}` and `new Tween(0, { easing })`,
  - `spring`: `{ stiffness, damping }` options for `svelte/motion`'s `Spring` (how Motif's spring roles, defined by duration and bounce, map onto Svelte's per-frame model is decided by a spike and recorded in decision 0011, with a test that the mapped spring settles within 20% of the role's duration and overshoots by about its bounce),
  - `motionSpring`: Motion's `{ type: "spring", visualDuration, bounce }` for `animate()` (React web's shape).
  - Svelte 4 or SvelteKit 1: the CSS files only, with the note "motion.ts uses Svelte 5's Spring and Tween, so Motif didn't write it. Animate with the CSS variables in motif.css (--motif-duration-*, --motif-easing-*)."
  - `SVELTE.wiring`: SvelteKit: "Next: import '$lib/styles/motif.css' once in src/routes/+layout.svelte (in its <script>)."; Vite: "Next: import './lib/styles/motif.css' once in src/main.ts (or main.js)."; Tailwind 4: the existing "right after @import \"tailwindcss\"" note. Skipped when the app's code already imports it (outside `design/generated/`, as plan 2I's fix wave does).
- [ ] **Step 1: Write the failing tests:** CSS equal to React web's; each layout (SvelteKit, Vite, `themeDir`, Svelte 4); the easing functions match their curves at 11 points; the spring mapping test; notes; protection; "up to date"; no app file changed; `svelte-compile.test.ts` (`skipIf` no Node): `svelte-min` with the generated files and a component using `transition:fly={{ duration: duration.base, easing: easing.standard }}`, `new Spring(0, spring.snappy)` and `animate(el, { opacity: 1 }, motionSpring.snappy)` passes `npx svelte-check --fail-on-warnings`.
- [ ] **Step 2:** Spike the spring mapping (draw a mapped `Spring` and the role's curve; Read the plot or compare numbers) and write decision 0011 in the style of 0009.
- [ ] **Step 3–4:** implement, run the three files plus `bun test test/tokens-command.test.ts test/tokens-vue.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(tokens): Svelte theme code — React web's CSS, motion in Svelte's terms; decision 0011`.

### Task 4: `motif check` on Svelte files

**Files:**
- Create: `cli/src/stacks/svelte/rules.ts`
- Modify: `cli/src/stacks/svelte/index.ts`; shared rule files only where a pattern must accept Svelte's syntax
- Test: `cli/test/svelte-rules.test.ts`, `cli/test/check-svelte.test.ts`

**Interfaces:**
- Produces: on Svelte's views, the existing rules find what they find in React web, and `scanSvelte` adds, on the script view's spans:
  - **raw-motion:** `duration`/`delay` in `transition:`/`in:`/`out:`/`animate:` parameter objects (milliseconds); named easings from `svelte/easing` (`cubicOut`, `quintInOut`, …) imported and used where `easing.<role>` from `motion.ts` belongs (kind `easing`); `new Spring(…, { stiffness, damping })` and `new Tween(…, { duration, easing })` literals; Motion's `animate(…, …, { duration, type: "spring", … })` as React web's motion rule judges them.
  - **reduced-motion** (app-wide): the app animates (`transition:`, `in:`, `out:`, `animate:`, `Spring`, `Tween`, Motion's `animate`, CSS animations) and nothing respects reduced motion: `prefersReducedMotion` from `svelte/motion` (Svelte 5.7+), a `prefers-reduced-motion` query in CSS (Motion's and svelte's split as plan 2I ruled for Vue: Motion/Spring/Tween/transitions need the JavaScript check; CSS animations need the query).
  - `SVELTE.fix`: "Use 'var(--motif-color-<role>)' in style: or style=\"…\", or a class (bg-<role>) with Tailwind."; motion: "Import { duration, easing, spring } from $lib/design/motion and pass them: transition:fly={{ duration: duration.base, easing: easing.standard }}."; `motif-ok` in `<!-- … -->`, `// …` and `/* … */`.
  - `SVELTE.extensions`: `[".svelte"]` (the "nothing to check" message).
- [ ] **Step 1: Write the failing tests:** Review Focus 2 both ways, each rule with exact positions, and the command on a temp `sv create`-shaped app (fixes, `motif-ok`, generated files skipped and `generated-edited`, reduced motion with and without `prefersReducedMotion`, Tailwind 4 classes, `class:` directives).
- [ ] **Step 2–4:** run, implement, run plus `bun test test/check-command.test.ts test/check-vue.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(check): Svelte — markup, directives, {…} values and style blocks, with fixes in Svelte's terms`.

### Task 5: `motif extract` drafts a guide from a Svelte app

**Files:**
- Modify: `cli/src/commands/extract.ts` only if Svelte needs something Vue didn't; `cli/src/stacks/svelte/index.ts` (`collect`)
- Test: `cli/test/extract-svelte.test.ts`

**Interfaces:**
- Produces: Svelte's views go through the web's `collectOccurrences` as Vue's do (CSS variables with dark blocks, `:global(...)` rules, Tailwind 4 `@theme`, usage samples). `SVELTE.collect` adds nothing stack-specific beyond what the CSS gives (Svelte's common theme systems, Skeleton and shadcn-svelte, are CSS variables); it exists so extract treats Svelte as supported, and a test says so. A dark mode set by a class or attribute on `<html>` from `src/app.html` (`%sveltekit.*%` placeholders ignored) is read like a page's.
- [ ] **Step 1–4:** tests on the Kit demo's `app.css`, a shadcn-svelte-style `app.css` with `.dark` and `@theme inline`, scoped styles, a mixed monorepo (Svelte and Vue drafted together); implement; run plus `bun test test/extract-vue.test.ts test/extract-command.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(extract): Svelte — style blocks and CSS with dark values`.

### Task 6: Routes of a Svelte app

**Files:**
- Create: `cli/src/stacks/svelte/routes.ts`
- Test: `cli/test/svelte-routes.test.ts`

**Interfaces:**
- Produces: `discoverSvelteRoutes(appDir): RouteDiscovery`, wired as `SVELTE.routes`: SvelteKit's routes folder (Task 1's `routesDir`): a folder with `+page.svelte` (or `+page@….svelte`) is a page; groups `(…)` add nothing; `[slug]`, `[[lang]]`, `[...path]` and `[id=integer]` segments go to `skipped`; a folder with only `+page.server.ts`/`+server.ts` isn't a page; `/` first. Plain Svelte: `svelte-spa-router`'s routes object (`{ '/': Home, '/about': About }`, wildcard and `:param` keys skipped) and `svelte-routing`'s `<Route path="…">`; else `/` only.
- [ ] **Step 1–4:** tests on both starters and the demo template, every convention of Review Focus 4, a spa-router map; implement. Expect PASS.
- [ ] **Step 5: Commit** `feat(shot): find a Svelte app's routes — SvelteKit's routes folder and Svelte routers`.

### Task 7: `motif shot` starts Svelte apps

**Files:**
- Modify: `cli/src/stacks/svelte/index.ts` (`startTimeoutMs`, `variantHow`, `auditFixes`), shot code only if Svelte needs a hook Vue didn't
- Test: `cli/test/shot-svelte.test.ts`, `cli/test/devserver.test.ts`

**Interfaces:**
- Produces: a Svelte app takes the web-stack path in `runShot` with no new branch in the command: the `dev` script (`vite dev` in both starters), `SVELTE.routes`, the web's sizes, `variantHow` ("motif.css, which follows data-variant on <html>"), the audit's reduced-motion fix in Svelte's terms ("Check prefersReducedMotion.current from svelte/motion before animating, and keep CSS animations inside @media (prefers-reduced-motion: no-preference)"). `findLocalAddress` reads SvelteKit's banner (Vite's); a test pins one captured from a real `vite dev` of `svelte-min`.
- [ ] **Step 1–4:** tests with fake deps (Kit and Vite apps, package managers, Windows, Svelte 4 taking the same path, refusals, a failing route); implement; run plus `bun test test/shot-vue.test.ts test/shot-command.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(shot): Svelte and SvelteKit apps through their own dev server`.

### Task 8: Drawn for real: variants, dark, RTL, fonts, states and the audit

**Files:**
- Create: `cli/test/svelte-shot-e2e.test.ts` (needs Node and a browser), `cli/test/fixtures/svelte-vite-min/` (Svelte with Vite, a committed lockfile), `cli/test/fixtures/kit3-min/` (SvelteKit 3; its tests skip with a reason when Node is older than 22.17)
- Modify: `cli/test/fixtures/svelte-min/` (grows: the generated theme imported in `+layout.svelte`, a variant, Arabic text, a project font, a planted low-contrast caption, a 32 px icon button without a name, a looping `transition`/`Spring` animation)
- Modify: any shot or audit code the run shows needs it, with a test

**Interfaces:**
- Produces: as plan 2I's Task 8, on `svelte-min` (server-rendered), `svelte-vite-min` and, where Node allows, `kit3-min`: light and dark at 390 and 1440, `--variant all`, `--rtl` in the Arabic companion, a JavaScript state, `--audit` finding the planted problems and the loop unless the app checks `prefersReducedMotion`. Times to the first screenshot go in the ledger and the guide.
- [ ] **Step 1:** Run the fixtures through `motif shot` and Read the PNGs. **Step 2:** Fix what the run shows, with tests. **Step 3–4:** e2e tests; run. Expect PASS (or skip with a reason).
- [ ] **Step 5: Commit** `test(shot): Svelte and SvelteKit drawn for real, with variants, dark, RTL, states and the audit`.

### Task 9: The Svelte stack guide and the modes

**Files:**
- Create: `skill/adapters/svelte/{README,tokens,components,motion,platform,checks}.md`
- Modify: `skill/SKILL.md`, `skill/modes/{init,feature,review}.md`, `skill/knowledge/variants.md`
- Test: `cli/test/adapters.test.ts`, `cli/test/skill-modes.test.ts`, `cli/test/skill-content.test.ts`

**Content the tests pin (exact strings):**
- `README.md`: `npx sv create`, `npm create vite@latest`, `npx svelte-check`, `npm run dev`, `design/motif.json`, `themeDir`, the floors (Svelte 5, SvelteKit 2 or 3, SvelteKit 3 needs Node 22.17), that Svelte 4 isn't supported, the browser frame for mockups, the first-screenshot times from Task 8.
- `tokens.md`: `motif.css`, `motif.tailwind.css`, `$lib/styles/motif.css`, `+layout.svelte`, `var(--motif-color-`, `bg-action-primary`, `data-variant`, "Switching variants" (`document.documentElement.dataset.variant` from app state, and for SvelteKit a `transformPageChunk` in `hooks.server.ts` or `%sveltekit.*%`-free `<html data-variant>` set from a cookie so server-rendered pages start in the right variant).
- `components.md`: where components live (`src/lib/components/`), `$props()`, snippets and `{@render}`, `<button>` with every state, `aria-label`, scoped `<style>` with `var(--motif-…)`, the starter set table (role names; files in PascalCase).
- `motion.md`: `transition:fly`, `duration.`, `easing.`, `Spring`, `spring.`, `Tween`, `prefersReducedMotion`, Motion's `animate(` with `motionSpring.`.
- `platform.md`: `dir="rtl"`, logical properties, `<html lang dir>` in `src/app.html` and setting them per locale (`transformPageChunk`), server rendering and `onMount`/`$effect` for what reads the browser.
- `checks.md`: one section per rule with fix examples that pass `motif check` on a `.svelte` file; states as JavaScript; `--rtl`.
- [ ] **Step 1–4:** tests (including every code block run through `motif tokens` and `motif check` in a temp Svelte app, as plan 2I did for Vue), write, run (plus `bun test test/agents-package.test.ts test/plugin.test.ts`).
- [ ] **Step 5: Commit** `docs(skill): the Svelte stack guide`.

### Task 10: Svelte fixtures: Adawat, and a seeded copy

**Files:**
- Create: `tests/fixtures/svelte-contract-app/`: **Adawat**, a neighbourhood tool library (tools to borrow, a tool's page, my loans, sign-in) in English and Arabic, SvelteKit 2.70 + TypeScript + Tailwind 4, in-memory data, the generated theme, IBM Plex Sans Arabic as the Arabic companion, variants `default` and `workshop` (a warm workshop palette, colours only), one Svelte transition with reduced motion respected; `tests/fixtures/svelte-seeded-app/{overlay/,seeded-issues.json,README.md}` with at least 8 exact problems (typed colour in a `style:` directive, off-scale padding in `<style>`, off-scale radius as a Tailwind class, typed font size, a raw `cubicOut` easing, low-contrast caption, small icon button, unnamed icon button) and 4 judgement problems (a cramped tool card, two primary buttons on one screen, no empty state for "my loans", `margin-left` that doesn't mirror in Arabic).
- Modify: `tests/fixtures/assemble.ts`
- Test: `cli/test/fixtures-svelte.test.ts` (with plan 2I's T10 lesson: "nothing else" compares sorted hit lists, not membership)
- [ ] **Step 1–4:** as plan 2I's Task 10. Adawat has no `/history` or `/settings` page.
- [ ] **Step 5: Commit** `feat(fixtures): Adawat, a SvelteKit tool library with a workshop variant and Arabic, and its seeded copy`.

### Task 11: Svelte eval cases and grading

**Files:**
- Create: `tests/fixtures/briefs/nuzha.md` (a city's parks and trails guide in English and Arabic, Svelte, no design sources)
- Modify: `tests/evals/cases.ts` (the stack's page noun as a parameter, not a `vue` special case: plan 2I T11 minor), `collect.ts`, `grade.ts`, `preflight.ts`, `README.md`
- Test: `cli/test/evals-*.test.ts`

**Interfaces:**
- Produces: `b-svelte-history` (a tool's borrowing history at `/history`, with an empty state), `b-svelte-settings` (settings at `/settings` with the variant switch), `c-svelte`, `d-nuzha` (routes `/`, `/sign-in`, `/trails`), `stack: "svelte"`. Grading: `typecheck` = `npx svelte-check --fail-on-warnings`; `build` = `npm run build`; render through `motif shot --sizes 390,1440`; a route exists when `discoverSvelteRoutes` lists it; `svelteComponents(diff)` counts new `.svelte` files under `src/lib/components/` (or `src/lib/`), not `+page`/`+layout` files. Preflight: Node and a browser (Node 22.17 when a case's app is SvelteKit 3).
- [ ] **Step 1–4:** tests, implement, run. **Step 5: Commit** `feat(evals): Svelte cases — two features on Adawat, the seeded review, and a new app from a brief`.

### Task 12: CI runs the Svelte tests

**Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `cli/test/release.test.ts`
- [ ] A `svelte` job on `ubuntu-latest` (Node 22 latest, which satisfies SvelteKit 3), modelled on `vue`; its heavy tests under `heavyStackTests("svelte", …)`; `publish.needs` gains `svelte`. Push the branch, run CI, see every job pass. **Commit** `ci: a Svelte job`.

### Task 13: Svelte is supported: hands-on, evals, docs

**Files:** `cli/src/detect/stacks.ts` (`ADAPTERS_AVAILABLE`, `WEB_STACKS`), `docs/parity.md` (the Svelte row and its proof section), `docs/notes/<date>-svelte-hands-on.md`; tests `doctor`, `adapters`, `release`
- [ ] **Step 1–4:** tests, implement, full suite.
- [ ] **Step 5: Hands-on** on a scratch copy of a public Svelte 5 app: first choice, the Svelte team's SvelteKit demo (`npx sv create --template demo`, run on a Node new enough for the SvelteKit it installs, through a portable Node if this computer's is older); also a maintained public SvelteKit 5 app with its own styling if one builds (named in the note). `doctor`, `extract`, `tokens`, `check`, `shot --audit --variant all --rtl`. Record what each showed and what was fixed.
- [ ] **Step 6 (controller):** `bun tests/evals/run.ts --cases b-svelte-history,b-svelte-settings,c-svelte,d-nuzha`; all four pass; the Evals cell records the run.
- [ ] **Step 7: Commit** `feat: Svelte and SvelteKit are supported`.
