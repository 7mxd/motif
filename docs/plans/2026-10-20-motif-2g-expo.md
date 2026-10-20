# Motif 2G — React Native with Expo (Phase A, third stack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React Native apps built with Expo get the full experience of the parity checklist (spec §4): detection and a toolchain check, TypeScript theme code with every variant, checks of React Native styles, a draft guide from an existing theme object, screenshots and audits through Expo's web target in Chrome, a stack guide, fixtures and evals.

**Architecture:** React Native is a `NativeStack` (`cli/src/stacks/native.ts`) in `cli/src/stacks/react-native/` for theme code, checks and extract, and reuses the **browser pipeline** for screenshots instead of a harness: `runShot` starts Expo's web dev server, discovers Expo Router routes, and calls the existing `captureScreens` with the native sizes; the audit is axe's, unchanged. The generated provider follows the browser's dark mode (`prefers-color-scheme`, which react-native-web's `Appearance` reads) and, on the web only, the `data-variant` attribute Motif sets on `<html>`, so every variant is drawn without anything app-specific. Checks extend the existing script rules with React Native's style objects (`StyleSheet.create`, `style={…}` arrays and objects with bare numbers) and Reanimated's motion calls.

**Tech Stack:** Bun + TypeScript (`cli/`), Expo SDK 52+ (React Native 0.76+, New Architecture), TypeScript, Reanimated 3, `expo-font`, `@expo-google-fonts/*`, react-native-web for screenshots, `bun test`, Expo's web server in tests that skip without Node and a browser.

**Spec:** `docs/specs/2026-10-19-motif-part2-all-stacks-design.md`: §4, §6 (common) and §6.4 (React Native), §8, §9, §10, §11. Plan 2E (Flutter) is merged; `NativeStack`, `--rtl`, the name audit and the identical-variant note exist. Plan 2F (Compose) runs in parallel on its own branch: this plan must not depend on anything it adds, and where both edit a shared file (`native.ts`'s `STACKS`, `cases.ts`, `ci.yml`, `docs/parity.md`, `README.md`) each adds its own lines only.

## Global Constraints

- Nothing changes for React web, plain web or Flutter users except where a task names it (Task 7's default-variant attribute). Their generated files stay byte-identical, and existing tests pass unchanged unless a task names the test it edits.
- Floors: Expo SDK 52 (React Native 0.76, whose New Architecture draws `boxShadow`), TypeScript 5, Reanimated 3.16. Task 7's spike confirms each against a current SDK and records it in decision 0009; `doctor` and the guide say the same.
- Generated files start with `TS_HEADER`, so protection and `generated-edited` work unchanged.
- Motif never edits `package.json`, `app.json`/`app.config.*`, `babel.config.js`, `metro.config.js` or any file it didn't generate. Packages it needs are printed as one `npx expo install …` line.
- Screenshots are of the **web target** and Motif says so in the run's notes the first time: "React Native screenshots are of Expo's web target in Chrome: close to the app, but native-only components and platform fonts can differ." An app that can't run on the web says why (a missing web dependency, a native-only module that throws) and names what to install or stub.
- Variant ids are TypeScript object keys as written (`"partner-store"` is quoted); no identifier conversion. Colour roles are camelCase properties (`textSecondary`), as React Native styles are.
- Screenshot names follow 2E: `<slug>[@<state>][+<variant>].<size>[.rtl][.dark].png`.
- Tests that need Node and a browser skip with a reason when either is missing; tests that start Expo also need the fixture's `node_modules` (installed once by the test, offline afterwards where npm's cache allows).
- Messages are plain words in Motif's voice, and every refusal says what to do next.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on the branch `plan/2g-expo`; never push without the developer asking.

## Parity row (spec §4): what makes React Native "done"

| Area | Task |
|---|---|
| Detect and set up | 1, 9 |
| Theme code | 2 |
| Checks | 3 |
| Drafting a guide | 4 |
| Components (inventory) | 9 (guide), 11 (eval counting) |
| Mockups | none to build (phone frame, 9) |
| Screenshots | 5, 6, 7, 8 |
| Audit | 8 (axe, unchanged, on the web target) |
| Skill | 9 |
| Evals | 10, 11 |
| Agents | 13 |

## Review Focus

1. **Expo's own starter.** `create-expo-app` (default template) has Expo Router in `app/` with `(tabs)`, `_layout.tsx`, `+not-found.tsx`, `constants/Colors.ts` with `light`/`dark` objects, `hooks/useColorScheme.ts`, and `components/Themed*.tsx`. `doctor` lists it, `tokens` writes beside it without touching `constants/Colors.ts`, `extract` drafts from `constants/Colors.ts`, `shot` finds `/`, `/explore` and skips `+not-found`. Tests in Tasks 1, 2, 4 and 5.
2. **Styles that only look like values.** `StyleSheet.create({ row: { flex: 1, zIndex: 2, opacity: 0.5, aspectRatio: 1.5 } })` has no findings (not spacing); `{ padding: 13 }`, `{ borderRadius: 7 }`, `{ fontSize: 15 }` and `{ color: '#333' }` are; `withTiming(1, { duration: 300 })` off the scale is; `setTimeout(fn, 300)` isn't. Tests in Task 3.
3. **An app whose web target fails.** A dependency without web support (`react-native-maps`), a missing `react-native-web`, or a screen that throws on the web: the run reports which, per route, and keeps the others. Tests in Task 6.
4. **The app's own variant and dark mode.** An app that passes `variant="contrast"` to `MotifProvider` is drawn in the guide's default for the default's shots, because Motif sets `data-variant` to the default id too (Task 7), and the provider prefers the attribute on the web. An app that forces light mode (`userInterfaceStyle: "light"` in `app.json`) gets a note when its dark shots equal its light ones. Tests in Task 7.
5. **Arabic.** `--rtl` on an app that calls `I18nManager.forceRTL` only on native: the shots still come out right to left (Motif sets `dir="rtl"` on the web, as it does for any site, with the note), and the companion font is used because the provider chooses it from the locale. Tests in Task 7.

---

### Task 1: Groundwork: React Native apps, sources and the stack

**Files:**
- Create: `cli/src/stacks/react-native/project.ts`, `cli/src/stacks/react-native/index.ts` (the `REACT_NATIVE` stack, registered in `native.ts`'s `STACKS`), `cli/src/stacks/react-native/doctor.ts`
- Modify: `cli/src/check/files.ts`, `cli/src/stacks/native.ts`
- Test: `cli/test/rn-detect.test.ts`, `cli/test/files.test.ts`, `cli/test/doctor.test.ts`

**Interfaces:**
- Produces:
  - `project.ts`: `isExpoApp(dir)` (`expo` in dependencies), `expoSdk(dir): number | null` (major of the installed `node_modules/expo/package.json` version, else of the range in `package.json`), `usesExpoRouter(dir)`, `srcRoot(dir)` (`src` when `src/app` or `src/` exists, else the app folder), `hasWebSupport(dir): string[]` (the missing packages among `react-dom`, `react-native-web`, `@expo/metro-runtime`).
  - `listRnFiles(root, appPath, opts)`: `.ts/.tsx/.js/.jsx` with `RN_IGNORES = ["/ios/", "/android/", "/.expo/", "/dist/", "/web-build/", "/.motif/", "expo-env.d.ts", "*.test.*", "__tests__/"]` from the app.
  - A bare React Native app without Expo is detected as today but `doctor` says: "React Native without Expo isn't supported: Motif supports Expo apps (spec non-goal). Theme code, checks and drafts still work; screenshots need Expo's web target."
  - `rnDoctor(deps)`: for an Expo app, one item `expo-web`: `ok` "Expo SDK 54, with the web target's packages." or `needed` "The web target needs react-dom, react-native-web and @expo/metro-runtime for screenshots: npx expo install react-dom react-native-web @expo/metro-runtime". An SDK under 52: "Expo SDK 51 is older than 52, which Motif's theme code needs: npx expo install expo@latest --fix."
- [ ] **Step 1: Write the failing tests:** the starter shape of Review Focus 1, a monorepo with `mobile/expo-app` beside a Flutter app, a bare React Native app, `listRnFiles` ignores, and the doctor items with fake files.
- [ ] **Step 2: Run** `cd cli && bun test test/rn-detect.test.ts test/files.test.ts test/doctor.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files plus `bun test test/detect.test.ts test/flutter-detect.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(stacks): Expo apps, their sources, and the web target's packages in doctor`.

### Task 2: `motif tokens` writes React Native theme code

**Files:**
- Create: `cli/src/stacks/react-native/generate.ts`, `cli/src/stacks/react-native/fonts.ts`, `cli/test/fixtures/expo-min/` (a minimal Expo Router app: `package.json` with Expo, Expo Router, Reanimated, `react-native-web`, `react-dom`, `@expo/metro-runtime` and one Google font package; `app.json`; `app/_layout.tsx`, `app/index.tsx`, `app/settings.tsx`; a committed lockfile)
- Modify: `cli/src/stacks/react-native/index.ts`
- Test: `cli/test/rn-generate.test.ts`, `cli/test/tokens-rn.test.ts`, `cli/test/rn-compile.test.ts` (needs Node; runs `tsc --noEmit` on the fixture)

**Interfaces:**
- Produces: `generateReactNative(set, opts: { googlePackages: Map<string, string>; projectFonts: { family: string; weight: number; style: string; asset: string }[] }): GeneratedFile[]`, one file `motif-theme.tsx` in the theme folder (default `<srcRoot>/design/`; `themeDir` in `motif.json` wins). Its public API:
  - `export type MotifVariant = "default" | "partner"` and `export const motifVariants: readonly MotifVariant[]` (only with variants; default first). `export type MotifColors = { background: string; … }` (camelCase roles), colours as `#rrggbb` or `rgba(…)`.
  - `export const motifColors: Record<MotifVariant, { light: MotifColors; dark: MotifColors }>` (without variants: `{ light, dark }` directly).
  - `export const space = { s0: 0, s4: 16, … } as const` (role `0-5` → `s0p5`), `radius = { none, sm, md, lg, full }` (numbers), `shadow = { sm: { boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.08)" }, … }` (RN's `boxShadow` string, every layer, inset layers kept since RN supports them), `type = { body: { fontFamily, fontSize, lineHeight, fontWeight, letterSpacing }, … }` (line height in px, weight as a string `"600"`), `typeArabic` (only for roles with a companion), `duration = { base: 200, … }` (ms), `easing = { standard: Easing.bezier(0.2, 0, 0, 1), … }` (Reanimated), `spring = { snappy: { mass: 1, stiffness, damping }, … }` (from `springPhysics`, 2 decimals, Reanimated's `withSpring` config).
  - `export const motifFonts: Record<string, number | string>` for `useFonts` (Google families from their `@expo-google-fonts/<family>` exports such as `Onest_400Regular`, project fonts with `require("<relative path>")`), and the font family names used in `type` match those keys.
  - `export function MotifProvider({ variant, children }: { variant?: MotifVariant; children: React.ReactNode })` and `export function useMotifTheme(): { colors: MotifColors; type: typeof type; dark: boolean; variant: MotifVariant; reducedMotion: boolean }`. The scheme comes from `useColorScheme()`; the variant is, on the web only, `document.documentElement.dataset.variant` when it names a variant (watched with a `MutationObserver`), else the prop, else the default; the Arabic styles are used when `I18nManager.isRTL` or the locale's language is one of `ar fa ur ps ckb sd ug` (from `Intl`/`expo-localization` when present); `reducedMotion` from Reanimated's `useReducedMotion()`.
  - Fonts (`fonts.ts`): a Google family whose `@expo-google-fonts/<kebab-family>` package isn't in `package.json` gets the install note ("npx expo install expo-font @expo-google-fonts/onest") and is left out of `motifFonts` (its role's `fontFamily` falls back to the system font, with a comment) until installed. Project `.ttf`/`.otf` files are copied to `<app>/assets/fonts/`; `.woff2`-only gets the note.
- `REACT_NATIVE.wiring`: "Next: wrap your root layout in <MotifProvider> (import from <path>), load motifFonts with useFonts from expo-font before rendering, and read colours with useMotifTheme()." — skipped once the app's code uses `MotifProvider` outside the generated file. With variants, how to pass one from app state.
- [ ] **Step 1: Write the failing tests:** exact substrings for the test guide, two variants, a companion, a project font, Google packages present and missing, a snapshot; `tokens-rn.test.ts` on the starter shape (file path, no edit of `constants/Colors.ts`, wiring note, protection, "up to date"); `rn-compile.test.ts` (`skipIf` no Node): the fixture with the generated file and a usage file passes `npx tsc --noEmit`.
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run** the three files plus `bun test test/tokens-command.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(tokens): React Native theme code — every variant and mode, a provider and hook, fonts for expo-font, Reanimated motion`.

### Task 3: `motif check` on React Native styles

**Files:**
- Create: `cli/src/stacks/react-native/rules.ts`
- Modify: `cli/src/stacks/react-native/index.ts`
- Test: `cli/test/rn-rules.test.ts`, `cli/test/check-rn.test.ts`

**Interfaces:**
- Produces: `scanReactNative(file, scale): Hit[]`, which runs the existing script rules (`scanColors`, Tailwind rules when `nativewind` is a dependency) and adds, on the masked text:
  - **off-scale** inside style objects (the argument of `StyleSheet.create(`, a `style={…}` object or array element, and `contentContainerStyle`/`*Style` props): kind `space` for `margin*`, `padding*`, `gap`, `rowGap`, `columnGap` with a bare number; kind `radius` for `border*Radius`; kind `font-size` for `fontSize`. Not `top/left/right/bottom`, `width`, `height`, `flex`, `zIndex`, `opacity`, `aspectRatio`, `lineHeight`, `borderWidth`. Negative numbers compare by magnitude.
  - **raw-font:** `fontFamily: "…"` with a literal.
  - **raw-motion:** kind `duration` for `duration: N` in `withTiming(`/`withDelay(`/`Animated.timing(` configs and Reanimated layout animations' `.duration(N)`; kind `easing` for `Easing.bezier(`, `Easing.ease`, `Easing.in/out/inOut(` outside the generated file; kind `spring` for literal `damping`/`stiffness`/`mass` in `withSpring(` configs and `.springify().damping(N)`.
  - **reduced-motion** (app-wide): the app animates (`useSharedValue`, `withTiming`, `withSpring`, `Animated.`, `entering=`, `exiting=`, `LayoutAnimation`) and no file uses `useReducedMotion`, `ReduceMotion.` or `useMotifTheme().reducedMotion`/`reducedMotion`.
  - `paletteFile`: `constants/Colors.ts`-style objects of colours (an exported object whose values are mostly colour strings, or `light`/`dark` sub-objects) get the palette hint.
- `REACT_NATIVE.fix` and `role`: "Use colors.<role> from useMotifTheme().", "Use space.s<N>.", "Use radius.<role>.", "Use type.<role>.", "Use duration.<role>.", "Use easing.<role>.", "Use spring.<role>." (imports from the theme file).
- [ ] **Step 1: Write the failing tests:** each pattern with exact positions, Review Focus 2's negatives, the scale cases, and the command on a temp starter-shaped app (fixes, `motif-ok`, generated file skipped and `generated-edited`, `constants/Colors.ts` with the palette hint, reduced-motion with and without `useReducedMotion`).
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run** the two files plus `bun test test/check-command.test.ts test/check-flutter.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(check): React Native — style objects, fonts and Reanimated motion, with fixes for the theme`.

### Task 4: `motif extract` drafts a guide from an Expo app

**Files:**
- Create: `cli/src/stacks/react-native/extract.ts`
- Test: `cli/test/extract-rn.test.ts`, with `cli/test/fixtures/rn-palettes/`

**Interfaces:**
- Produces: `collectReactNative(files): Occurrences`: a colours object with `light` and `dark` keys (the starter's `Colors`) gives variables with light and dark values (`tint` → `--tint`, `text` → `--text`, `background` → `--background`, `icon` → `--icon`); parallel objects (`Colors.light`/`Colors.dark` beside `MenColors.light`/`MenColors.dark`, or `palettes.men.light`) become variants as Flutter's palettes do; a theme object's `spacing`/`radius`/`fontSize` maps and Task 3's hits give usage samples; fonts from `useFonts({ … })` keys and `@expo-google-fonts/*` imports; motion from Task 3's motion hits.
- [ ] **Step 1: Write the failing tests** (the starter's `constants/Colors.ts`; a `men`/`women` pair as variants; samples). **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run** plus `bun test test/extract-flutter.test.ts test/extract-draft.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(extract): React Native — colour objects with light and dark, parallel palettes as variants`.

### Task 5: Routes of an Expo app

**Files:**
- Create: `cli/src/stacks/react-native/routes.ts`
- Test: `cli/test/rn-routes.test.ts`

**Interfaces:**
- Produces: `discoverExpoRoutes(appDir): RouteDiscovery`: Expo Router's `app/` (or `src/app/`) files: `index.tsx` → its folder, groups `(tabs)` flattened, `_layout`, `+not-found`, `+html`, `+native-intent`, `+api` and `*.web.tsx` duplicates skipped, `[id]` and `[...rest]` in `skipped`; React Navigation's `linking: { config: { screens: { Home: "home", … } } }` paths when Expo Router isn't used; `/` always. Wired as `REACT_NATIVE.routes`.
- [ ] **Step 1–4:** tests on the starter (`/`, `/explore`), nested groups and dynamic routes, a linking config; then implement. Expect PASS.
- [ ] **Step 5: Commit** `feat(shot): find an Expo app's routes`.

### Task 6: `motif shot` starts Expo's web target

**Files:**
- Modify: `cli/src/commands/shot.ts`, `cli/src/shot/devserver.ts`, `cli/src/stacks/react-native/index.ts`
- Test: `cli/test/shot-rn.test.ts`, `cli/test/devserver.test.ts`

**Interfaces:**
- Produces:
  - `devCommand` for an Expo app: `scripts.web` when it exists, else `npx expo start --web --port <free port>` (through the app's package manager's exec: `npx`, `pnpm exec`, `yarn`, `bunx`), with `CI=1` so Expo doesn't prompt and `EXPO_NO_TELEMETRY=1`. `findLocalAddress` already accepts "Web is waiting on http://localhost:8081"; a test pins it.
  - `runShot`: a `react-native` app takes the web path (no `shoot`), with `REACT_NATIVE.routes`, `NATIVE_VIEWPORTS` as the default sizes (no desktop unless `--sizes desktop`), the first-run note of the Global Constraints, and the stack's `variantHow` ("MotifProvider, which follows data-variant on the web") for the identical-variant note.
  - Refusals: missing web packages (exit 2, `error: "needs-web-target"`, doctor's install line); `--screen` (usage error: "React Native screens are routes; pass --routes.").
  - Per-route errors from the browser (`pageErrors`) are reported as on the web; an error naming a module without web support adds "<module> doesn't run on the web; stub it for screenshots with a <name>.web.tsx file beside the import, or skip the route."
- [ ] **Step 1: Write the failing tests** with fake deps (the command chosen on each package manager and on Windows, the refusals, the defaults, the notes). **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run** plus `bun test test/shot-command.test.ts test/shot-flutter.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(shot): Expo apps through their web target`.

### Task 7: Spike and decision: Expo's web target in Motif's browser; variants, dark, RTL and fonts

**Files:**
- Create: `docs/decisions/0009-expo-rendering.md`, `cli/test/rn-shot-e2e.test.ts` (needs Node and a browser)
- Modify: `cli/src/shot/capture.ts` (the default variant's attribute), `cli/test/fixtures/expo-min/` (grows: a variant, an Arabic string table, a project font), Task 2's generator if the spike shows a change is needed

**Interfaces:**
- Produces:
  - **The default variant's attribute (all browser stacks):** when the guide has variants, the default's shots set `data-variant="<default id>"` too, so an app that passes its own variant is still drawn in the default (the 2E lesson). React web and plain web CSS has no rule for the default id, so their shots are unchanged; a test pins that.
  - The decision records, from runs on Windows: the time to the first screenshot (Metro's first web bundle) and per extra screenshot, and the run's time limit; that `useColorScheme()` follows the emulated `prefers-color-scheme` on react-native-web; that the provider's `data-variant` watch switches variants after load; what `--rtl` does (react-native-web's `I18nManager` versus `dir` on `<html>`, and the note); that `motifFonts` load (Google and project fonts) before the screenshot (`document.fonts.ready` is already awaited); and how a native-only module fails.
  - `rn-shot-e2e.test.ts`: on a temp copy of `expo-min` (npm install once): `/` and `/settings` at `--sizes 390` light and dark; `--variant all` gives `+partner` files that differ; `--rtl` gives `.rtl` files in Arabic glyphs; an app passing its own variant draws the default for the default's shots.
- [ ] **Step 1:** Run the fixture through `motif shot` and Read the PNGs: real fonts, dark mode, a variant, Arabic.
- [ ] **Step 2:** Fix what the spike shows (in the generator or `capture.ts`), with tests.
- [ ] **Step 3:** Write decision 0009 in the style of 0007.
- [ ] **Step 4:** Run the e2e file. Expect PASS.
- [ ] **Step 5: Commit** `spike(rn): Expo's web target in the browser pipeline; decision 0009`.

### Task 8: States and the audit on Expo apps

**Files:**
- Modify: `cli/src/commands/shot.ts` only if needed
- Test: `cli/test/rn-shot-e2e.test.ts`

**Interfaces:**
- Produces: proof that `--state` JavaScript scripts and `--audit` work on the web target unchanged: `expo-min` gains a planted low-contrast caption, a 32 px `Pressable` icon without `accessibilityLabel`, and a looping Reanimated animation; the audit finds contrast, target and name issues (react-native-web maps `accessibilityLabel`/`aria-label` to the DOM), and the motion check finds the loop under reduced motion unless the app checks `useReducedMotion`. A state that fills a `TextInput` (found by `aria-label` or `placeholder`) gives `index@filled.mobile.png`. Any gap is fixed in the audit's DOM queries with a test, or recorded in decision 0009 as a limit.
- [ ] **Step 1–4:** tests, run, fix, run.
- [ ] **Step 5: Commit** `feat(shot): states and the audit on Expo's web target`.

### Task 9: The React Native stack guide and the modes

**Files:**
- Create: `skill/adapters/react-native/{README,tokens,components,motion,platform,checks}.md`
- Modify: `skill/SKILL.md`, `skill/modes/init.md` (`npx create-expo-app@latest`), `skill/modes/feature.md`, `skill/modes/review.md`, `skill/knowledge/variants.md`
- Test: `cli/test/adapters.test.ts`, `cli/test/skill-modes.test.ts`, `cli/test/skill-content.test.ts`

**Content the tests pin (exact strings):**
- `README.md`: `npx create-expo-app@latest`, `npx expo install`, `npx tsc --noEmit`, `npx expo start --web`, `react-native-web`, `design/motif.json`, `themeDir`, the web-target note, the floors.
- `tokens.md`: `MotifProvider`, `useMotifTheme()`, `motifFonts`, `useFonts`, `@expo-google-fonts/`, `space.`, `radius.`, `type.`, `boxShadow`, "Switching variants" with state, and that `constants/Colors.ts` and `useThemeColor` can go once the app uses the provider.
- `components.md`: where components live (`components/`), `Pressable` with `pressed` state and `android_ripple`, `accessibilityRole`, `accessibilityLabel`, `hitSlop`, every state, and the starter set table.
- `motion.md`: `withSpring(`, `spring.`, `withTiming(`, `duration.`, `easing.`, `useReducedMotion`, `entering=`.
- `platform.md`: `I18nManager`, `start`/`end` (`marginStart`, `paddingEnd`), `SafeAreaView` from `react-native-safe-area-context`, iOS and Android differences, `expo-localization`.
- `checks.md`: one section per rule (not `tailwind-*` unless NativeWind) with fix examples that pass `scanReactNative`; states as JavaScript for the web target; `--rtl`.
- [ ] **Step 1–4:** tests, write, run (plus `bun test test/agents-package.test.ts test/plugin.test.ts`).
- [ ] **Step 5: Commit** `docs(skill): the React Native stack guide`.

### Task 10: Expo fixtures: Dukkan, and a seeded copy

**Files:**
- Create: `tests/fixtures/rn-contract-app/`: **Dukkan**, a corner shop's ordering app (catalogue, a product's page, the basket, sign-in) in English and Arabic, Expo Router, in-memory data, the generated theme, Readex Pro as the Arabic companion, variants `default` and `night-market` (an evening market palette, colours only); `tests/fixtures/rn-seeded-app/{overlay/,seeded-issues.json,README.md}` with at least 8 exact problems (typed colour, off-scale padding, off-scale radius, typed font size, raw `Easing.bezier`, low-contrast caption, small pressable, unlabelled icon button) and 4 judgement problems (cramped list row, inconsistent buttons, missing empty basket state, `marginLeft` that doesn't mirror).
- Modify: `tests/fixtures/assemble.ts`
- Test: `cli/test/fixtures-rn.test.ts`
- [ ] **Step 1–4:** Dukkan validates, checks clean, is up to date, type-checks; the seeded problems are found at their lines; with a browser, `shot --sizes 390 --audit --variant all --rtl` draws Dukkan with no findings and finds the seeded copy's planted ones. Dukkan has no `orders` or `favourites` route (Task 11's B cases add them).
- [ ] **Step 5: Commit** `feat(fixtures): Dukkan, an Expo shop app with a night-market variant and Arabic, and its seeded copy`.

### Task 11: Expo eval cases and grading

**Files:**
- Create: `tests/fixtures/briefs/rihla.md` (a trip planner in English and Arabic, Expo, no design sources)
- Modify: `tests/evals/cases.ts`, `collect.ts`, `grade.ts`, `preflight.ts`, `README.md`
- Test: `cli/test/evals-*.test.ts`

**Interfaces:**
- Produces: `b-rn-orders` (past orders at `/orders`, with an empty state), `b-rn-favourites` (favourites at `/favourites`, saved from a product's page), `c-rn` (the seeded review), `d-rihla` (routes `/`, `/sign-in`, `/trips`), with `stack: "react-native"`. Grading: `typecheck` = `npx tsc --noEmit`; no `build`; render through `motif shot --sizes 390`; a route exists when `discoverExpoRoutes` lists it; `rnComponents(diff)` counts new exported function components rendering JSX under `components/` (route files under `app/` are screens; private components in a route file are screen parts; the generated theme never counts). Preflight: Node and a browser, with doctor's lines.
- [ ] **Step 1–4:** tests, implement, run `bun test test/evals-*.test.ts`. Expect PASS.
- [ ] **Step 5: Commit** `feat(evals): React Native cases — two features on Dukkan, the seeded review, and a new app from a brief`.

### Task 12: CI runs the React Native tests

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- [ ] **Step 1:** A `react-native` job on `ubuntu-latest`: Bun, Node (setup-node pinned by SHA, npm cache), Chrome (already on the runner), `bun test test/rn-*.test.ts test/check-rn.test.ts test/extract-rn.test.ts test/fixtures-rn.test.ts test/shot-rn.test.ts test/tokens-rn.test.ts`.
- [ ] **Step 2:** The full suite passes locally; without Node's fixture install the e2e tests skip with a reason.
- [ ] **Step 3: Commit** `ci: a React Native job`.

### Task 13: React Native is supported: hands-on, evals, docs

**Files:**
- Modify: `cli/src/detect/stacks.ts` (`ADAPTERS_AVAILABLE` gains `"react-native"`), `cli/src/commands/doctor.ts`, `README.md`, `docs/parity.md` (the React Native row and its proof section)
- Test: `cli/test/doctor.test.ts`, `cli/test/adapters.test.ts`, `cli/test/release.test.ts`
- [ ] **Step 1–4:** tests (doctor's "Full support for React Native (Expo)", the parity row), implement, full suite.
- [ ] **Step 5: Hands-on** on a scratch copy of HiSalon's Expo app (`mobile/react-native` in a copy of `C:\Users\PC\GitHub\HiSalon`, never the real repository): `doctor`, `extract`, `tokens`, `check` (top groups), `shot --audit --variant all --rtl` (with the web packages installed in the copy if missing). Record each result in the ledger.
- [ ] **Step 6:** `bun tests/evals/run.ts --cases b-rn-orders,b-rn-favourites,c-rn,d-rihla`. All four must PASS.
- [ ] **Step 7: Commit** `feat: React Native (Expo) is supported`.
