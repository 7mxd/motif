# Motif — Every stack, and design variants (Part 2, completed)

- Date: 2026-10-19
- Status: Approved 2026-10-19
- Builds on: `docs/specs/2026-10-12-motif-core-design.md` (contract §6, modes §7, tool §10, adapter model §5.3 and §11.1, tests §13) and `docs/specs/2026-10-15-motif-plain-web-design.md` (the first Part 2 adapter, whose HTML and CSS handling the web stacks reuse)
- Leads to: v1.0.0, together with Part 4 (Test A and the release checklist), which has its own spec

## 1. Summary

Motif v1 promises every developer the same experience whatever they build with. Today only React web and plain web are supported; the other seven stacks Motif already recognises (`STACK_IDS` in `cli/src/detect/stacks.ts`) get "detected, not supported yet". This spec finishes Part 2: it adds **Flutter, Jetpack Compose, SwiftUI, React Native (Expo), Vue/Nuxt, Svelte/SvelteKit and Angular**, each with the full experience, and first adds **design variants** to the design guide (named palettes such as a salon app's women's and men's looks), for every stack including the two already supported.

The work ships in three phases, each a preview release:

| Phase | Contents | Release |
|---|---|---|
| 0 | Design variants and project fonts, in the format and in React web and plain web | with Phase A |
| A | Flutter, Jetpack Compose, SwiftUI, React Native (Expo) | v0.5.0 |
| B | Vue/Nuxt, Svelte/SvelteKit, Angular | v0.6.0 |

v1.0.0 follows Part 4. Nothing here ships as 1.0 on its own.

## 2. Who it's for, and why now

The developer who owns Motif will start using it at 1.0, on Join-Future's products. A look at their active repositories (2026-10-19) shows the shape Motif has to serve:

- **Flutter is the main mobile stack**: HiSalon (an admin app and a customer app sharing a `hisalon_core` package), Delmon, joinCX, Stmnt, gcc_currency, and HiPay's Flutter SDK. Apps run on a real iPhone; code is written on Windows with Claude Code, and a Mac mini builds for iOS.
- **React (Vite) is the web stack** (dashboards, admin panels, sites) beside Express backends.
- **React Native (Expo)** appears in HiSalon (an earlier customer app the Flutter app was ported from) and in HiPay's SDK. Svelte appears in one personal project. Vue, Angular, SwiftUI and Compose don't appear: they're for other Motif users, built to the same standard and checked against each platform's official examples.
- **Each product is a monorepo** with one brand across a web dashboard and a Flutter app, usually in English and Arabic. Delmon already shares a hand-made `design-tokens` package between its web apps, but its Flutter app isn't connected to it: one design guide driving every app in the repo is exactly what Motif is for.
- **HiSalon's Flutter theme** (`hisalon_core/lib/theme/`) is Material 3 `ThemeData` built from a custom `ThemeExtension` (`HiSalonColors`: `bg`, `card`, `text`, `textMuted`, `accent`…), light and dark, Onest (Google Fonts) for Latin with Thmanyah Sans bundled for Arabic, chosen by locale, and **palettes swapped by the customer's gender**. It's hand-typed Dart today. Motif's Flutter output should feel like this, generated from the guide.

## 3. Goals, non-goals, anti-goals

**Goals**

- **Parity (the owner's one requirement):** every stack gets the full experience in §4, the new ones and React web and plain web alike. A stack isn't done until its row of the parity checklist is complete.
- Design variants in the guide, checked and generated for every stack.
- One design guide for a monorepo's apps on different stacks (a React dashboard and a Flutter app from the same `tokens.json`).
- Screenshots and audits that need **no device, no simulator and no Mac** for Flutter, Compose, React Native and the web stacks, so they run on Windows, macOS and Linux and in CI.
- Right-to-left as a first-class case on every stack: screenshots in RTL, platform guidance for mirroring, and Arabic companion fonts wired into each stack's theme.

**Non-goals**

- Kotlin Multiplatform with Compose Multiplatform on iOS, Flutter web and desktop targets, React Native without Expo (bare), SwiftUI on watchOS/tvOS/visionOS, Angular versions before standalone components (v15), Vue 2, Svelte before 5. Each can come later; detection says plainly what isn't supported.
- Screenshots from a real phone, or from a simulator or emulator the developer has open. (A later version may add them; the rendering here comes first because it works everywhere.) A headless simulator that Motif's own harness starts and stops is allowed where the platform has no other way to render, which is SwiftUI on iOS (§6.3).
- Icons and imagery as theme values. A variant's icon set and imagery are described in `DESIGN.md`, not generated.
- Test A. It's Part 4.

**Anti-goals** (failure even if it technically works)

- A stack listed as supported while some command, mode or check quietly does less on it.
- Leaving changes in the developer's project that they didn't ask for. Screenshot harnesses, test files and build tweaks Motif needs are temporary or kept under a folder Motif owns and git ignores; theme code goes only where `motif tokens` says it writes.
- Breaking an existing design guide. Variants are optional; a guide without them works exactly as before.
- Needing a Mac for anything that isn't Apple's own framework.
- Variants that turn into stereotypes (pink for women, blue for men by default). Motif proposes, with research, and the developer decides.

## 4. The full experience (the parity checklist)

Each stack must have all of this before its phase ships. The plan tracks it as a table, one row per stack, and the release notes don't list a stack until its row is complete.

| Area | What the developer gets |
|---|---|
| Detect and set up | `motif doctor` recognises the app (also inside a monorepo) and its toolchain, and says what's missing and how to install it. `init` knows the stack's official starter. |
| Theme code | `motif tokens` writes idiomatic theme code: colours (light, dark, every variant), type roles with the Arabic companion, spacing, corners, shadows/elevation, durations, easings and springs; fonts wired into the stack's asset system; a one-step note on how to use it. |
| Checks | `motif check` finds colours, sizes, fonts and animation timings typed in the code instead of taken from the theme, with file, line and column, `motif-ok` exceptions, and fix hints. The rules match React web's on every stack: a typed colour is always a finding; a typed size or duration is a finding when it's off the theme's scale, and seen but allowed when it's on it (the existing `off-scale` behaviour). *(Builder-check call: parity with React web, not stricter.)* |
| Drafting a guide | `motif extract` drafts `design/tokens.draft.json` from an existing app's theme code and usage (Flutter's `ThemeData` and `ThemeExtension`, Compose's `MaterialTheme`, SwiftUI asset catalogues and `Color` extensions, RN `StyleSheet`s and theme objects, CSS in the web stacks), including dark values and existing variants it can find. |
| Components | The `feature` mode's component inventory finds the app's components (widgets, composables, views, components). |
| Mockups | `motif preview` works the same on every stack (mockups are HTML with the preview kit), in the right frame (phone for mobile stacks, browser for web). |
| Screenshots | `motif shot` captures the app's screens at three phone sizes, a tablet and (for web and desktop-capable stacks) a desktop, in light and dark, in every variant when asked, and in RTL; `--state` reaches screens behind a form or a tap; `--save`/`--against` compare with mockups and earlier runs. |
| Audit | `motif shot --audit` checks contrast, tap-target size, reduced motion and accessible names as rendered, and writes `design/shots/audit.json` in the review format. |
| Skill | A stack guide in `skill/adapters/<stack>/` (README, tokens, components, motion, platform, checks), and the `init`, `feature` and `review` modes working on the stack. |
| Evals | Fixture apps and eval cases for tests B, C and D (§9). |
| Agents | Works through all six agent packages (Part 3); nothing per-agent is stack-specific. |

## 5. Phase 0: design variants and project fonts

### 5.1 What a variant is

A **variant** is a named alternative look of the same app for an audience or context the app's idea calls for: HiSalon's women's and men's experiences, a white-label app's brand per customer, a kids' mode. Light and dark aren't variants; every variant has both. One variant is the default (the one the app shows when it doesn't know which to use).

A variant **mainly changes colour roles**. It may also change other theme values (fonts, corners, motion) when the research in §5.6 shows it should; the format allows any role to vary, and expects colours.

### 5.2 In the design guide

- `tokens.json` declares the variants once, at the top level under `$extensions["dev.motif"].variants`: each with an id (kebab-case), a label, and which one is the default. A guide without this block has one implicit default variant, exactly as today.
- A role's `$value` and its `modes.dark` stay the **default variant's** light and dark values. A role that differs in a variant adds, in its own `$extensions["dev.motif"]`, that variant's light value and dark value (aliases allowed, as everywhere). A role that doesn't mention a variant uses the default's value in that variant.
- `DESIGN.md` gets a **Variants** section (required when variants exist, absent otherwise): what each variant is for and who it serves, how the app chooses it, what it changes beyond theme values (icon set, imagery, illustration style, copy tone), and what must stay the same across all of them so the app still reads as one brand. The contract spec (`skill/contract/spec.md`) and the DESIGN.md template gain these.

The exact JSON shape is the builder's call, within these rules; it must stay valid DTCG and be readable by tools that ignore `$extensions`.

### 5.3 Checking and generating

- `motif validate` checks every readability pair **in every variant, in light and dark**, and reports a problem with its variant and mode ("In the men's variant, dark: text-secondary on surface is 3.9:1"). A variant role that names an unknown variant, or a declared variant with no differences, is reported.
- `motif tokens` generates every variant on every stack (§6 and §7 say how each stack switches). On the web: `data-variant="<id>"` on the page selects it, combined with the existing `data-theme` and system dark setting.
- `motif preview` renders a mockup in each variant (`--variant <id>`, or `all`); `motif shot` likewise (default: the default variant; `--variant all` for every one). `--audit` covers every variant, since contrast is per variant.
- `motif check` treats any variant's colour as a theme colour (it isn't a hard-coded value just because it isn't the default's).
- `motif extract` drafts variants when it finds parallel palettes in the code (HiSalon's gender palettes are the reference case).

### 5.4 A project's own fonts

Today a theme font is Motif's own (shipped with the preview kit), a system font, or loaded from Google Fonts. A real app often bundles one that is none of these (HiSalon's Arabic font, Thmanyah Sans). The design guide gains a way to name a **project font**: its family and the font files' paths inside the repository (under `$extensions["dev.motif"]`, shape left to the builder). Previews and screenshots load those files; `validate` reports a named file that doesn't exist.

Font files and `motif tokens` *(builder-check call)*: `tokens` never downloads anything. On native stacks it copies the theme's fonts that it already has locally (Motif's own preset fonts, and project fonts) into the stack's font folder (`assets/fonts/` for Flutter, `res/font/` for Compose, the target's folder for SwiftUI, `assets/fonts/` for Expo) and writes the registration the stack needs where that's theme code it owns; registration in files it doesn't own (`pubspec.yaml`, `Info.plist`) is printed as a one-step instruction, not edited. A Google font is fetched by the stack's own mechanism (`google_fonts` for Flutter, `expo-google-fonts`, downloadable fonts on Android) or, where there is none, by the agent following the stack guide.

### 5.5 React web and plain web

Both get variants in Phase 0 (generated CSS, Tailwind theme, preview and shot support, checks), with tests and an update to Larder or Kitepost showing a variant. This is how Phase 0 proves the format before the new stacks depend on it.

### 5.6 In the skill

- When a developer asks for a variant (in `init`, or later in `design`), Motif first does a short **research step**: how comparable apps handle it, what the connected design sources show, and known pitfalls (for audience variants such as gender: avoiding stereotypes, keeping both equally good, never making one the "real" app). It then proposes what differs (usually colour, maybe icons or imagery) and what stays the same, and the developer approves before anything is written (a ⏸ gate, as for directions).
- `knowledge/` gains a short guide to variants (when they're worth it, what to vary, what never to vary, testing every variant). Each stack guide shows how its generated code switches variant at runtime.
- Reviews look at every variant's screenshots and report findings with the variant they apply to.

## 6. Phase A: native stacks

Common to all four: mockups stay HTML (the preview kit is stack-neutral); the motion roles map to each platform's API through the existing spring maths (core §6.4); `DESIGN.md`'s platform notes cover the platform's conventions; and Motif's screenshot harness for a stack lives in a folder Motif owns (for example `.motif/` in the app, git-ignored) or a temporary folder, never in the developer's source.

### 6.1 Flutter

- **Detect:** `pubspec.yaml` with the Flutter SDK (exists). Monorepos with several Flutter apps and shared packages (`mobile/packages/*`) are scanned like other workspaces; theme code for a shared package is supported (`design/motif.json` can point `tokens` output at the package).
- **Theme code:** Dart under the app's `lib/` (default `lib/design/`): a `ThemeExtension` with Motif's colour roles (every variant, light and dark), `ThemeData` for light and dark built from it with an **explicit** `ColorScheme` (not `fromSeed`, which invents colours the guide never chose), a `TextTheme` from the type roles with the Arabic companion as a fallback family, and constants for spacing, corners, elevation, durations, curves and `SpringDescription`s. Variant selection is a parameter, as in HiSalon (`MotifTheme.light(variant: …)`). Fonts: the output lists the `pubspec.yaml` font assets to add (bundled) or says to use `google_fonts`; it never edits `pubspec.yaml` itself unless the stack guide's step asks the agent to.
- **Checks:** `Color(0x…)`, `Colors.*` (other than `transparent`), numeric `EdgeInsets`/`SizedBox`/`BorderRadius`/`fontSize`/`Duration` literals and `Curves.*` in widget code, outside the generated files.
- **Extract:** from `ThemeData`, `ColorScheme`, `ThemeExtension` classes and widget usage; parallel palettes become variants.
- **Components:** widget classes under `lib/` (excluding generated and the theme).
- **Screenshots:** rendered with Flutter's own test renderer (`flutter test`) through a Motif harness: no device, simulator or Mac. It pumps each screen at each size, in light and dark, each variant when asked, and in RTL (with the app's localizations), with **real fonts** loaded (bundled assets and Google Fonts), and writes PNGs. Screens come from the app's router (go_router, or named routes) or from `--screen` naming a widget. **States** are short Dart scripts in `design/states/` that drive the widget tester (tap, enter text, pump). **Audit** uses Flutter's accessibility guidelines (text contrast, tap-target size for Android and iOS, labelled tap targets), plus the reduced-motion setting. Network and platform plugins are faked or stubbed by the harness so screens render offline; what can't be stubbed is reported plainly.
- **Screens behind sign-in and live data** *(builder-check call)*: real apps start with storage and an API client before `runApp`, and redirect to sign-in. Reaching the signed-in screens is part of the full experience, so the harness gives a general way to set the app up for a screenshot: a setup script in `design/states/` (Dart) that can override providers (Riverpod, Provider), seed storage, and answer HTTP requests from fixture data kept in `design/`. The stack guide shows the agent how to write it for the app in front of it. Without one, `shot` captures what renders and says which screens it couldn't reach and why.
- **Doctor:** the Flutter SDK and its version.

### 6.2 Jetpack Compose

- **Theme code:** Kotlin under the app module (default `ui/theme/` in the app's package): `MotifColors` for every variant, light and dark, wired into `MaterialTheme`'s colour scheme, `Typography` with the Arabic companion, spacing and shape constants, motion specs (`tween`, `spring(dampingRatio, stiffness)`), and a `MotifTheme(variant, darkTheme)` composable. Fonts go in `res/font`.
- **Checks:** `Color(0x…)`, `Color.Red`-style constants, numeric `.dp`/`.sp` literals in modifiers and text, and literal animation specs in composables.
- **Extract:** from `lightColorScheme`/`darkColorScheme`, custom colour classes, `Typography` and `Shapes`.
- **Screenshots:** rendered on the JVM (Robolectric with Roborazzi, or Paparazzi; the builder chooses and records why), so they run on Windows. The harness is added for the run (a Gradle init script or a temporary test source set), not to the developer's build files. Screens come from `@Preview` functions and, where a navigation graph exists, its destinations. Audit uses Android's Accessibility Test Framework checks (contrast, touch target, labels). **Doctor:** a JDK and the Android SDK.

### 6.3 SwiftUI

- **Theme code:** Swift: a `MotifTheme` with colour roles for every variant (light and dark through dynamic colours), `Font` styles with the Arabic companion, spacing, corner and animation values (`.spring(duration:bounce:)`), and an environment value to choose the variant. Fonts are added to the target and `UIAppFonts`.
- **Checks:** `Color(red:…)`/`Color(hex)`-style literals, `.padding(13)`-style literals, `.font(.system(size:))`, literal animations, outside the generated files.
- **Extract:** from asset catalogue colours, `Color` extensions and font helpers.
- **Apps in scope** *(builder-check call)*: iOS and iPadOS apps, and macOS apps. Theme code covers both (`UIFont`/`NSFont` registration differs: `UIAppFonts` on iOS, the app's fonts folder on macOS); macOS apps get desktop sizes.
- **Screenshots:** need a Mac with Xcode (SwiftUI only renders there). A Motif harness renders `#Preview`s and views at each size, light/dark, variant and RTL. For iOS it runs as a test (`xcodebuild test`) in a **headless simulator the harness starts and stops**, since an iOS app's views can't render otherwise; for macOS apps it renders directly. *(Builder-check call: the headless simulator is allowed; it's Motif's own and leaves nothing open.)* **States** are short scripts in `design/states/` (Swift, or UI-test steps; the builder chooses) for screens behind a tap. **Audit:** contrast from rendered colours, tap-target sizes from layout, accessible names from the accessibility tree the test exposes; the builder records any limits. On Windows and Linux `motif shot` says it needs a Mac and stops cleanly; `doctor` says the same.
- CI runs SwiftUI's screenshot tests on macOS runners; the owner's Mac mini covers hands-on tests.

### 6.4 React Native (Expo)

- **Theme code:** TypeScript: a theme object with every variant and mode, a provider and hook (`useMotifTheme()`) that follow the system's light/dark and a chosen variant, spacing, radii, font families with the Arabic companion (loaded with `expo-font`), and Reanimated spring and timing configs.
- **Checks:** hex/rgb colours and raw numbers in `StyleSheet.create`, inline `style` props and NativeWind classes, literal Animated/Reanimated configs.
- **Extract:** from theme objects and `StyleSheet`s.
- **Screenshots:** through Expo's web target in Chrome, reusing the browser pipeline (sizes, light/dark, variants, RTL, states as JavaScript, the axe audit). Motif says plainly that this approximates the native look: platform-only components and native fonts may differ. Apps that can't run on the web target are reported with the reason.

## 7. Phase B: web stacks

They reuse the browser pipeline (dev server, routes, `--state`, the axe audit) and plain web's HTML and CSS reading.

- **Vue/Nuxt:** `.vue` files (`<style>`, `<style scoped>`, template `style`/`:style` and class bindings), Nuxt's `pages/` routes and Vue Router configs, Nuxt and Vite dev servers.
- **Svelte/SvelteKit (Svelte 5):** `.svelte` files (`<style>`, `style:` directives, class bindings), SvelteKit's `src/routes`, the Vite dev server.
- **Angular (standalone, v15+):** component styles and inline `styles`, templates' `[style.x]`/`[ngStyle]`/class bindings, router configs, `ng serve`.
- **Theme code:** the CSS variables and Tailwind v4 theme React web gets, plus each stack's motion idiom (Motion for Vue, Svelte's `svelte/motion` and Motion, Angular animations or Motion; the builder settles each with the stack's current practice). Variants through `data-variant`.

## 8. Monorepos: one guide, many apps

- One `design/` (one `DESIGN.md`, one `tokens.json`) at the repository root can govern several apps on different stacks. `design/motif.json` lists them (already supported for detection); `motif tokens` writes each app's theme code, `check`, `extract` and `shot` take `--app` or run over all, and `validate` runs once.
- `DESIGN.md`'s platform notes say per app what differs on purpose (a dashboard on the web, a phone app on Flutter).
- The Delmon case is the reference: web apps and a Flutter app reading the same guide.

## 9. Fixtures and evals

- Each new stack gets a **contract-governed fixture app** (like Larder and Kitepost) and a **seeded-issue app** with planted exact and judgement problems listed in `seeded-issues.json`, as the existing fixtures do. Product themes vary across stacks so evals don't overlap; at least one fixture uses variants and Arabic/RTL.
- **Evals per stack:** at least two B cases (adding a feature), one C case (the seeded review) and one D brief (a new app with no design sources), using the existing runner and grading rules. Cases needing a Mac (SwiftUI) are marked so the runner skips them elsewhere with a reason.
- Running every case costs the owner's Claude plan; the release checks for each phase run that phase's cases, and v1 runs all of them.

## 10. Tool and CI

- Each stack's exact half lives in `cli/src/stacks/<stack>/`, following the adapter template (core §11.1). The parts of plain web's HTML and CSS reading that the web stacks share move to a common module.
- `motif doctor` reports each stack's toolchain (Flutter SDK; JDK and Android SDK; Xcode; Node with Expo) with the install step, and what works without it.
- CI adds the toolchains per job (Flutter, Java and the Android SDK, Xcode on macOS runners) and keeps a job per stack's heavy tests, so the suite stays within CI limits and a failure names its stack. Tests that need a toolchain skip with a reason when it's absent, locally and in CI's other jobs.

## 11. Delivery

- **Phase 0 + A → v0.5.0**, after its parity rows are complete, CI is green on all three systems, the phase's eval cases pass, and a hands-on test on a copy of HiSalon's Flutter customer app has passed. That test *(builder-check call)* shows: `motif extract` drafting a guide from `HiSalonColors`, its three palettes becoming variants; `motif tokens` writing Flutter theme code beside the app's own theme (moving HiSalon onto Motif's theme is the developer's choice, not part of the test); `motif check` reporting sensibly on the existing code; and `motif shot --audit` capturing the sign-in screen and at least one signed-in screen in every variant, light and dark, and Arabic. The owner then runs the generated theme on their iPhone through the Mac mini.
- **Phase B → v0.6.0**, the same way, with a hands-on test on a public sample app per stack.
- **A stack that isn't finished doesn't hold up its phase** *(builder-check call)*: if one stack's parity row is still open (SwiftUI, with its Mac-only parts, is the likeliest), the phase ships without it, that stack stays "detected, not supported yet", and it ships in a later preview. All seven are complete before v1.0.0.
- Each phase has its own plan (`docs/plans/`) and may be split into several plans; decision records (`docs/decisions/`) capture the rendering choice for each native stack and the variant format.
- The README's preview note, the release notes and the website list a stack as supported only from the release where its parity row is complete.

## 12. Left to the builder

- The exact JSON shape of variants (within §5.2), and the names and file layout of each stack's generated code (within §6 and §7, following each platform's conventions).
- The renderer for Compose (Roborazzi or Paparazzi) and SwiftUI (`ImageRenderer` or a snapshot library), recorded as decisions.
- How each harness stubs network and plugins, and what it reports when it can't.
- How screens are discovered on each stack beyond the routers named above.
- The order of stacks within a phase (Flutter first in Phase A is the suggestion, since it matters most to the owner).

## 13. Changes to the core spec

- §6 (contract): variants (§5.2 here) and project fonts (§5.4).
- §10 (tool): `--variant` on `preview` and `shot`; per-stack doctor checks.
- §11.1 (adapter template): the parity checklist (§4 here) becomes the definition of a finished adapter.
- §13.2: eval cases per stack, and Mac-only cases.
