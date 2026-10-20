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
| Jetpack Compose | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| SwiftUI | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| React Native (Expo) | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| Vue / Nuxt | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| Svelte / SvelteKit | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |
| Angular | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet | not yet |

React web and plain web were finished in Part 1 and plan 2A; right-to-left screenshots and the accessible-name audit came to them with Flutter (plan 2E). Jetpack Compose, SwiftUI and React Native are the rest of Phase A; Vue, Svelte and Angular are Phase B. Motif still helps on those stacks with general guidance: `motif tokens` writes plain CSS variables and `design/generated/tokens.flat.json` to map by hand.

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
