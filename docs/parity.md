# The parity checklist

A stack is supported when the developer gets the whole of Motif on it, not part of it. This page is that list (spec §4 of [Part 2](specs/2026-10-19-motif-part2-all-stacks-design.md)), with one row per stack. A stack's adapter is finished when every area in its row is done ([core spec §11.1](specs/2026-10-12-motif-core-design.md#111-the-adapter-template-applies-to-every-stack)). Until then the README, the release notes and the website don't list it as supported, and a release's `motif doctor` says the stack is detected and support is coming. A stack can also wait on release gates that aren't areas (a run on a real phone, say); its section below lists them.

## The areas

| Area | What the developer gets |
|---|---|
| Detect and set up | `motif doctor` recognises the app (also inside a monorepo) and its toolchain, and says what's missing and how to install it. `init` knows the stack's official starter. |
| Theme code | `motif tokens` writes theme code the stack's way: colours (light, dark, every variant), type roles with the Arabic companion, spacing, corners, shadows, durations, easings and springs, fonts wired in, and a one-step note on how to use it. |
| Checks | `motif check` finds colours, sizes, fonts and animation timings typed in the code instead of taken from the theme, with file, line and column, `motif-ok` exceptions and fix hints, by the same rules as React web. |
| Drafting a guide | `motif extract` drafts `design/tokens.draft.json` from an existing app's theme code and usage, with dark values and the variants it finds. |
| Components | The `feature` mode lists the app's components (widgets, composables, views, components). |
| Mockups | `motif preview` works the same, in the right frame (a phone for mobile stacks, a browser for web). |
| Screenshots | `motif shot` captures the app's screens at three phone sizes, a tablet and (where the stack runs on desktops) a desktop, light and dark, every variant, right to left; `--state` reaches screens behind a form or a tap; `--save` and `--against` compare. |
| Audit | `motif shot --audit` checks contrast, tap-target size, reduced motion and accessible names as rendered, and writes `design/shots/audit.json`. |
| Skill | A stack guide in `skill/adapters/<stack>/`, and the `init`, `feature` and `review` modes working on the stack. |
| Evals | Fixture apps and eval cases for tests B, C and D. |
| Agents | Works through all six agent packages; nothing per agent is stack-specific. |

## Where each stack stands

| Stack | Detect and set up | Theme code | Checks | Drafting a guide | Components | Mockups | Screenshots | Audit | Skill | Evals | Agents |
|---|---|---|---|---|---|---|---|---|---|---|---|
| React web | done | done | done | done | done | done | done | done | done | done | done |
| Plain web | done | done | done | done | done | done | done | done | done | done | done |
| Flutter | done | done | done | done | done | done | done | done | done | done | done |
| Jetpack Compose | done | done | done | done | done | done | done | done | done | pending | done |
| SwiftUI | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| React Native (Expo) | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| Vue / Nuxt | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| Svelte / SvelteKit | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| Angular | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |

React web and plain web were finished in Part 1 and plan 2A; right-to-left screenshots and the accessible-name audit came to them with Flutter (plan 2E). Flutter (plan 2E) is done, and Jetpack Compose (plan 2F) is done but for its evals; SwiftUI and React Native are the rest of Phase A; Vue, Svelte and Angular are Phase B. Motif still helps on those stacks with general guidance: `motif tokens` writes plain CSS variables and `design/generated/tokens.flat.json` to map by hand.

## Flutter: the tests that show it

Flutter was built in [plan 2E](plans/2026-10-19-motif-2e-flutter.md). Every area is done. Its code is in the CLI, so `motif doctor` built from source already treats it as supported; the README and the release notes list it from v0.5.0, once its row is complete and these release gates are passed:

- The Flutter job in CI passes on the pull request.
- The owner runs an app's generated theme on an iPhone (plan 2E, Task 15): a release step, not an area.

Tests marked "needs Flutter" run in CI's Flutter job and skip, saying so, where the Flutter SDK isn't installed.

| Area | What shows it |
|---|---|
| Detect and set up | Apps found one folder deeper in a monorepo, told apart from shared packages, and a theme folder per app: [flutter-detect.test.ts](../cli/test/flutter-detect.test.ts). The Flutter SDK and its version, with the install or upgrade step: [doctor.test.ts](../cli/test/doctor.test.ts) ("the Flutter toolchain"). `init` starts with `flutter create`: [skill-modes.test.ts](../cli/test/skill-modes.test.ts) ("Flutter in the skill and the modes"). |
| Theme code | `lib/design/motif_theme.dart` with a `ThemeExtension`, an explicit `ColorScheme`, the text theme with the Arabic companion, sizes, motion and every variant: [flutter-generate.test.ts](../cli/test/flutter-generate.test.ts). Wiring notes, fonts copied in with the `pubspec.yaml` lines to add, one theme for apps that share a folder: [tokens-flutter.test.ts](../cli/test/tokens-flutter.test.ts). The generated Dart passes `flutter analyze` (needs Flutter): [flutter-compile.test.ts](../cli/test/flutter-compile.test.ts). |
| Checks | Typed colours, sizes, fonts, durations, curves and springs in Dart, and what only looks like one: [flutter-rules.test.ts](../cli/test/flutter-rules.test.ts). The command on a Flutter app, with Dart fixes, `motif-ok`, grouping and reduced motion: [check-flutter.test.ts](../cli/test/check-flutter.test.ts). Every planted problem in the seeded app found at its place, and nothing else: [fixtures-flutter.test.ts](../cli/test/fixtures-flutter.test.ts). |
| Drafting a guide | `ThemeData`, `ColorScheme`, `ThemeExtension` and palette classes, parallel palettes becoming variants, a shared package's theme: [extract-flutter.test.ts](../cli/test/extract-flutter.test.ts). |
| Components | The `feature` mode lists a Flutter app's widgets from its guide: [skill-modes.test.ts](../cli/test/skill-modes.test.ts). The guide's components page: [adapters.test.ts](../cli/test/adapters.test.ts) ("the Flutter guide"). New widgets counted in the B evals: [evals-collect.test.ts](../cli/test/evals-collect.test.ts) ("new components on Flutter"). |
| Mockups | Mockups are HTML on every stack, so nothing was built for Flutter: the phone frame is the preview kit's ([preview-kit.test.ts](../cli/test/preview-kit.test.ts)), and the `init` mode asks for the right frame. |
| Screenshots | Routes from go_router and named routes: [flutter-routes.test.ts](../cli/test/flutter-routes.test.ts). The four native sizes, `--sizes`, `--screen`, variants, `--rtl`, `.dart` states, `setup.dart` and `http.json`: [shot-flutter.test.ts](../cli/test/shot-flutter.test.ts). Drawn for real by `flutter test` (needs Flutter): [flutter-render.test.ts](../cli/test/flutter-render.test.ts), [flutter-shot-e2e.test.ts](../cli/test/flutter-shot-e2e.test.ts). Fonts loaded for the pictures: [flutter-harness.test.ts](../cli/test/flutter-harness.test.ts). How Flutter is drawn: [decision 0007](decisions/0007-flutter-rendering.md). |
| Audit | Contrast, tap targets, unnamed controls and reduced motion in `audit.json`: [shot-flutter.test.ts](../cli/test/shot-flutter.test.ts) ("the audit and states on a Flutter app"), and found as rendered (needs Flutter): [flutter-shot-e2e.test.ts](../cli/test/flutter-shot-e2e.test.ts). |
| Skill | The Flutter guide's six files and their Dart examples, which pass `motif check`: [adapters.test.ts](../cli/test/adapters.test.ts). The modes on Flutter: [skill-modes.test.ts](../cli/test/skill-modes.test.ts). |
| Evals | Maktaba and its seeded copy: [fixtures-flutter.test.ts](../cli/test/fixtures-flutter.test.ts). The four cases (two features, the seeded review, Sahm from a brief): [evals-cases.test.ts](../cli/test/evals-cases.test.ts). The release's tests check the fixtures and the cases' definitions; the eval runs themselves (an agent working each case) are run by hand, not by the release. Recorded in eval run 20261020-090551 on commit f8fc998 (2026-10-20): all four Flutter cases passed, b-flutter-reserve, b-flutter-search, c-flutter (exact problems 9 of 10, judgement 6 of 6, no false critical or major findings) and d-sahm. The run predates the final review's fix wave (commits after f8fc998). |
| Agents | The package for other agents carries the whole skill, the Flutter guide with it: [agents-package.test.ts](../cli/test/agents-package.test.ts), [plugin.test.ts](../cli/test/plugin.test.ts). |

## Jetpack Compose: the tests that show it

Jetpack Compose was built in [plan 2F](plans/2026-10-20-motif-2f-compose.md). Every area but Evals is done; Evals is pending until the four Compose cases pass. Its code is in the CLI, so `motif doctor` built from source already treats Compose apps as supported; the README and the release notes list it from v0.5.0, with the rest of Phase A, once its row is complete and these release gates are passed:

- The Compose job in CI passes on the pull request.
- The four Compose eval cases pass (the Evals row below).

Tests marked "needs a JDK and the Android SDK" run Gradle and Robolectric. They run in CI's Compose job, and skip, saying so, where either isn't installed.

| Area | What shows it |
|---|---|
| Detect and set up | The app module of a Gradle project (not its root), Groovy and Kotlin build files, library modules left out, an Android project one folder deeper in a monorepo, and Android Studio's template root: [compose-detect.test.ts](../cli/test/compose-detect.test.ts). The JDK (`JAVA_HOME`, the PATH, Android Studio's own) and the Android SDK with its platforms, each with what to install: [doctor.test.ts](../cli/test/doctor.test.ts) ("the Android toolchain"). `init` starts from Android Studio's Empty Activity template, or writes its files: [skill-modes.test.ts](../cli/test/skill-modes.test.ts) ("Jetpack Compose in the skill and the modes"). |
| Theme code | `MotifTheme.kt` with lowerCamelCase colour roles light and dark, an explicit Material colour scheme (never dynamic colour), sizes, shadows, motion with reduced motion, type with the Arabic companion mapped onto Material's type, fonts and every variant as an enum: [compose-generate.test.ts](../cli/test/compose-generate.test.ts). Where it goes (the app's package, or `themeDir`), the wiring note, protection, fonts copied into `res/font`, the font certificates, and the one-step note for `ui-text-google-fonts`, never touching the Gradle files: [tokens-compose.test.ts](../cli/test/tokens-compose.test.ts), [compose-stack.test.ts](../cli/test/compose-stack.test.ts). The generated Kotlin compiles with the app's Gradle with no warnings from Motif's files (needs a JDK and the Android SDK): [compose-compile.test.ts](../cli/test/compose-compile.test.ts). |
| Checks | Typed colours, sizes, fonts and animation timings in Kotlin, and what only looks like one (strings, comments, templates): [compose-rules.test.ts](../cli/test/compose-rules.test.ts), [mask-kotlin.test.ts](../cli/test/mask-kotlin.test.ts). The command on a Compose app, with Kotlin fixes, `motif-ok`, the generated file never scanned, the template's `Color.kt`, grouping and reduced motion: [check-compose.test.ts](../cli/test/check-compose.test.ts). Every planted problem in the seeded app found at its place, and nothing else: [fixtures-compose.test.ts](../cli/test/fixtures-compose.test.ts). |
| Drafting a guide | The template's `Color.kt` and `Theme.kt`, colour constants followed through, parallel schemes becoming variants, a custom colour class, and usage samples: [extract-compose.test.ts](../cli/test/extract-compose.test.ts). |
| Components | The `feature` mode lists a Compose app's composables from its guide: [skill-modes.test.ts](../cli/test/skill-modes.test.ts). The guide's components page: [adapters.test.ts](../cli/test/adapters.test.ts) ("the Compose guide"). New composables counted in the B evals: [evals-collect.test.ts](../cli/test/evals-collect.test.ts) ("new components on Compose"). |
| Mockups | Mockups are HTML on every stack, so nothing was built for Compose: the phone frame is the preview kit's ([preview-kit.test.ts](../cli/test/preview-kit.test.ts)), and the `init` mode asks for the right frame. |
| Screenshots | Navigation Compose routes (nested graphs, type-safe destinations, constants), `@Preview` functions and the 12-screen cap: [compose-screens.test.ts](../cli/test/compose-screens.test.ts). The four native sizes, `--routes` and `--screen`, variants, `--rtl`, Kotlin states, `Setup.kt`, the missing wrapper or toolchain, the first run's download and Gradle's failures, and the harness removed after every run: [shot-compose.test.ts](../cli/test/shot-compose.test.ts). The JDK the run uses and the Gradle command: [compose-harness.test.ts](../cli/test/compose-harness.test.ts). Drawn for real by Robolectric (needs a JDK and the Android SDK): [compose-render.test.ts](../cli/test/compose-render.test.ts), [compose-shot-e2e.test.ts](../cli/test/compose-shot-e2e.test.ts), and on the Android Gradle Plugin 9, whose built-in Kotlin replaces the Kotlin Android plugin: [compose-agp9.test.ts](../cli/test/compose-agp9.test.ts). How Compose is drawn: [decision 0008](decisions/0008-compose-rendering.md). |
| Audit | Contrast, touch targets, unnamed controls and reduced motion in `audit.json`, in Compose's terms: [shot-compose.test.ts](../cli/test/shot-compose.test.ts) ("the audit and states on a Compose app"), and found as rendered (needs a JDK and the Android SDK): [compose-shot-e2e.test.ts](../cli/test/compose-shot-e2e.test.ts), with Rafiq clean and its seeded copy's planted problems found: [fixtures-compose.test.ts](../cli/test/fixtures-compose.test.ts). |
| Skill | The Compose guide's six files and their Kotlin examples, which pass `motif check`: [adapters.test.ts](../cli/test/adapters.test.ts). The modes on Compose: [skill-modes.test.ts](../cli/test/skill-modes.test.ts). |
| Evals | Rafiq and its seeded copy: [fixtures-compose.test.ts](../cli/test/fixtures-compose.test.ts). The four cases (two features, the seeded review, Nabta from a brief): [evals-cases.test.ts](../cli/test/evals-cases.test.ts), and what tests B, C and D collect on Compose: [evals-collect.test.ts](../cli/test/evals-collect.test.ts). The release's tests check the fixtures and the cases' definitions; the eval runs themselves (an agent working each case) are run by hand, not by the release. Pending: the four Compose cases (b-compose-reminder, b-compose-stats, c-compose and d-nabta) haven't been run yet. |
| Agents | The package for other agents carries the whole skill, the Compose guide with it: [agents-package.test.ts](../cli/test/agents-package.test.ts), [plugin.test.ts](../cli/test/plugin.test.ts). |
