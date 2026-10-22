# Motif 2H — SwiftUI (Phase A, fourth stack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SwiftUI apps (iOS and iPadOS, and macOS) get the full experience of the parity checklist (spec §4): detection and a toolchain check, Swift theme code with every variant, checks of Swift code, a draft guide from asset catalogues and `Color` extensions, screenshots and audits rendered on a Mac (a headless simulator Motif starts and stops for iOS; directly for macOS), a stack guide, fixtures and evals.

**Architecture:** SwiftUI is a `NativeStack` (`cli/src/stacks/native.ts`) in `cli/src/stacks/swiftui/`, built the way Flutter (2E) and Compose (2F) were. Everything except screenshots works on any OS. Screenshots need macOS with Xcode: Motif copies the app's project into a temporary folder it owns, adds a test target there (never in the developer's project), runs it with `xcodebuild test` in a simulator it creates, boots and deletes (iOS), or as a macOS test, and reads a `result.json` in the shape Flutter's and Compose's harnesses write. Each screen is hosted in a window and drawn with the system's own renderer; the audit uses XCTest's accessibility audit (`performAccessibilityAudit`) where it applies, mapped onto Motif's rules. On Windows and Linux `motif shot` and `doctor` say a Mac is needed and stop cleanly.

**Tech Stack:** Bun + TypeScript (`cli/`), Swift 6 and SwiftUI (iOS 17 / macOS 14 floor; Task 6's spike confirms), Xcode 16+ (`xcodebuild`, `xcrun simctl`), XCTest, `bun test`, Mac-only tests that skip elsewhere with a reason.

**Spec:** `docs/specs/2026-10-19-motif-part2-all-stacks-design.md`: §4, §6 (common) and §6.3 (SwiftUI), §8–§12. Plans 2E, 2F and 2G are merged: `NativeStack` (with `doctor(deps, ctx)`), `heavyStackTests`, the result format of the native harnesses, `--rtl`, the name audit, the identical-variant note, and the default variant's override for the default's shots are the patterns this plan follows. Spec §11: a stack that isn't finished doesn't hold up its phase — if SwiftUI's row isn't complete when the rest of Phase A is ready, v0.5.0 ships without it.

## Global Constraints

- Nothing changes for React web, plain web, Flutter, Compose or Expo users. Their generated files stay byte-identical, and existing tests pass unchanged unless a task names the test it edits.
- Floors: iOS 17 and macOS 14 (for `@Observable`-free code the theme only needs `Color`, `Font`, `Animation.spring(duration:bounce:)` from iOS 17), Swift 5.9 language mode or Swift 6, Xcode 16. Task 6's spike confirms each against the installed Xcode and records it in decision 0010; `doctor` and the guide say the same.
- Generated Swift files start with `TS_HEADER` (a `//` comment line), so protection and `generated-edited` work unchanged.
- Motif never edits `*.xcodeproj`, `*.xcworkspace`, `Package.swift`, `Info.plist`, asset catalogues or any file it didn't generate. Registration it needs (adding the generated file and fonts to the target, `UIAppFonts`) is printed as a one-step note.
- The screenshot harness works on a copy of the project in a temporary folder Motif owns (under the OS temp folder, deleted when the run ends whatever happens) or under `<app>/.motif/` with a `.gitignore` of `*`; it never builds inside the developer's own project folder. The simulator Motif creates is deleted when the run ends.
- Variant ids become Swift enum cases in lowerCamelCase (`partner-store` → `partnerStore`), with a keyword suffix as decision 0006 gives for Dart (`default` → `defaultVariant`); the clash check covers the Swift form.
- Screenshot names follow 2E: `<slug>[@<state>][+<variant>].<size>[.rtl][.dark].png`.
- Mac-only tests use `heavyStackTests("swiftui", isMacWithXcode())` and skip elsewhere with their reason; CI runs them in a `swiftui` job on `macos-latest`.
- Messages are plain words in Motif's voice, and every refusal says what to do next.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on the branch `plan/2h-swiftui`. The Mac mini reaches the code through that branch on GitHub (the controller pushes it); nothing else is pushed.

## Parity row (spec §4): what makes SwiftUI "done"

| Area | Task |
|---|---|
| Detect and set up | 1, 2, 11 |
| Theme code | 3 |
| Checks | 4 |
| Drafting a guide | 5 |
| Components (inventory) | 11, 13 |
| Mockups | none to build (phone frame, 11) |
| Screenshots | 6, 7, 8, 9 |
| Audit | 10 |
| Skill | 11 |
| Evals | 12, 13 |
| Agents | 15 |

## Review Focus

1. **Xcode's own templates.** A new iOS App project (`<Name>.xcodeproj`, `<Name>/ContentView.swift`, `<Name>App.swift`, `Assets.xcassets` with `AccentColor.colorset`), the same as a multiplatform app, and a Swift package app (`Package.swift` with an executable or an `.iOSApplication` product). Doctor lists each, `tokens` writes beside the template's files, `extract` reads `AccentColor` (with its dark appearance) and colour sets, and `shot` draws `ContentView` and every `#Preview`. Tests in Tasks 1, 3, 5, 7.
2. **Swift that only looks like a value.** `Color(red: 0.2, green: …)` in a comment or a multi-line `"""` string, `Color.clear`, `Color.primary` (a semantic colour — allowed), `.padding()` with no value, `.padding(.horizontal)`, `Spacer(minLength: 0)`, `Task.sleep(for: .seconds(2))`. `Color(red:…)` in a view, `.padding(13)`, `.font(.system(size: 15))`, `.cornerRadius(7)` and `.animation(.easeIn(duration: 0.3), value:)` must be findings. Tests in Task 4.
3. **Projects that don't build in a test.** An app that needs a signing team, a capability (push, iCloud), a package that fails to resolve offline, or a `@main` that starts networking. The harness signs for the simulator only, builds previews and views without the app's `@main` when it can, reports what failed per screen in plain words, and never fails the whole run for one screen. Tests in Task 8.
4. **No Mac.** On Windows and Linux every non-screenshot command works; `shot` and `doctor` say exactly what needs a Mac and stop cleanly (exit 2 with `error: "needs-mac"`). Tests in Tasks 2 and 7.
5. **The simulator is Motif's.** Motif creates a named simulator for the run, boots it headless, and deletes it afterwards — also after Ctrl+C or a crash in the run — and never touches simulators the developer has. Tests in Task 7 (fake `simctl`) and Task 8 (real, Mac only).

---

### Task 1: Groundwork: Swift sources, SwiftUI apps in Xcode projects and packages

**Files:** Create `cli/src/stacks/swiftui/project.ts`, `cli/src/stacks/swiftui/index.ts` (the `SWIFTUI` stack, registered in `native.ts`); modify `cli/src/check/files.ts`, `cli/src/detect/stacks.ts`, `cli/src/stacks/naming.ts`, `cli/src/contract/variants.ts`. Test `cli/test/swiftui-detect.test.ts`, `files.test.ts`, `variants.test.ts`.

**Interfaces:**
- `Lang` gains `"swift"`; `listSwiftFiles(root, appPath, opts)` with `SWIFTUI_IGNORES = ["/build/", "/DerivedData/", "/.build/", "/.motif/", "*Tests/", "*UITests/", "/Pods/", "/Carthage/", "*.generated.swift"]`.
- `project.ts`: `swiftUIApp(dir): { kind: "xcodeproj" | "package"; name: string; project: string; platforms: ("ios" | "macos")[]; sourceRoot: string } | null` — an `.xcodeproj` whose `project.pbxproj` has an application target (`productType = "com.apple.product-type.application"`) and whose sources import SwiftUI, or a `Package.swift` with an executable/app product importing SwiftUI; platforms from `SDKROOT`/`SUPPORTED_PLATFORMS` (pbxproj) or `platforms:` (package). `sourceRoot` is the target's folder (`<Name>/`).
- Detection lists the project folder as the app; a workspace with several app projects lists each; in a monorepo one folder deeper, as for the other native stacks.
- `swiftIdentifier(id)` in `naming.ts`: lowerCamelCase with Swift's keywords (`default`, `case`, `class`, `func`, `protocol`, `extension`, …) given the `Variant` suffix; the clash check compares Swift forms too.
- `SWIFTUI` with `id`, `extensions: [".swift"]`, `themeDir` (default `<sourceRoot>/Design`; `app.themeDir` wins), `sourceFiles`.
- [ ] **Step 1–5:** failing tests (the template shapes of Review Focus 1, a package app, a workspace, ignores, identifiers), implement, run (plus `detect`, `flutter-detect`, `compose-detect`, `rn-detect`, `doctor`), commit `feat(stacks): Swift sources, SwiftUI apps in Xcode projects and Swift packages`.

### Task 2: `motif doctor` checks Xcode

**Files:** Create `cli/src/stacks/swiftui/doctor.ts`; test `cli/test/doctor.test.ts`.

**Interfaces:** `swiftUIDoctor(deps, ctx)`:
- On macOS: `xcode` — `ok` "Xcode 16.2 (Swift 6.0.3), with the iOS 18.2 simulator." from `xcodebuild -version`, `swift --version`, `xcrun simctl list runtimes --json`; `needed` when `xcode-select -p` points at the Command Line Tools only ("Screenshots need Xcode, not only its command-line tools: install Xcode from the App Store, then run sudo xcode-select -s /Applications/Xcode.app."), when no iOS runtime exists for an iOS app ("…install an iOS simulator in Xcode › Settings › Components."), or Xcode is older than the floor.
- On Windows and Linux: `needs-mac` — `optional` "SwiftUI screenshots need a Mac with Xcode. Theme code, checks and drafts work here."
- [ ] **Step 1–5:** fake-`run` tests for each case, implement, run, commit `feat(doctor): Xcode and its simulators for SwiftUI apps`.

### Task 3: `motif tokens` writes SwiftUI theme code

**Files:** Create `cli/src/stacks/swiftui/generate.ts`, `cli/src/stacks/swiftui/fonts.ts`, `cli/test/fixtures/swiftui-min/` (a minimal iOS app project as Xcode 16 creates it: `.xcodeproj`, `App.swift`, `ContentView.swift`, `Assets.xcassets`; Task 6 grows it); tests `cli/test/swiftui-generate.test.ts`, `tokens-swiftui.test.ts`, `swiftui-compile.test.ts` (Mac only: `swiftc -typecheck` of the generated file with the iOS and macOS SDKs, or `xcodebuild build` of the fixture).

**Interfaces:** `generateSwiftUI(set, opts): GeneratedFile[]` → `MotifTheme.swift` in the theme folder:
- `enum MotifVariant: String, CaseIterable { case defaultVariant = "default", partner }` (only with variants; default first).
- `struct MotifColors { let background: Color; … }` with `static let light`, `dark`, `<variant>Light`, `<variant>Dark`, colours as `Color(.sRGB, red:green:blue:opacity:)` from the guide (never asset-catalogue names), plus `static func resolve(_ scheme: ColorScheme, variant: MotifVariant) -> MotifColors`.
- An environment value: `extension EnvironmentValues { @Entry var motifVariant: MotifVariant = .defaultVariant }` (or the iOS 17-compatible `EnvironmentKey` form if `@Entry` needs Xcode 16 — record), and `struct MotifTheme { static var debugVariantOverride: MotifVariant? }` with the doc comment "Set by Motif's screenshots. Leave it nil in your app.", and a `View` extension `.motifColors` / a `@Environment` reader: `MotifColors.current(scheme, variant)`; a modifier `.motifTheme(variant:)` that sets the environment value and (when the guide has them) the accent colour.
- `enum MotifSpace { static let s0: CGFloat = 0; … }`, `enum MotifRadius { … }`, `enum MotifShadows { static let md = [MotifShadow(color:radius:x:y:)] }` with a `View.motifShadow(_:)` modifier applying each layer, `enum MotifDurations { static let base: Double = 0.2 }` (seconds), `enum MotifCurves { static let standard = Animation.timingCurve(0.2, 0, 0, 1, duration: MotifDurations.base) }`, `enum MotifSprings { static let snappy = Animation.spring(duration: 0.25, bounce: 0) }` (the guide's own perceived duration and bounce — SwiftUI's spring takes them directly), `enum MotifMotion { static func animation(_ a: Animation, reduceMotion: Bool) -> Animation? }` and a guide line on `@Environment(\.accessibilityReduceMotion)`.
- `enum MotifType { static func body(arabic: Bool = false) -> Font }`-style or properties: each role as `Font.custom("<Family>", size:relativeTo:)` (Dynamic Type relative to the nearest text style) with the weight; the Arabic companion used when the layout is right to left or the locale's language is in `ar fa ur ps ckb sd ug` (a `View` modifier `.motifFont(.body)` reads `\.layoutDirection` and `\.locale` and picks); system families map to `Font.system(size:weight:design:)`.
- Fonts (`fonts.ts`): project `.ttf`/`.otf` files are copied to `<sourceRoot>/Fonts/`; the note lists the Info.plist `UIAppFonts` entries (iOS) or the `ATSApplicationFontsPath` (macOS) and "add the Fonts folder to the app target". Google families: no package mechanism exists, so the note says to download the TTFs (Motif's font cache has them: offer to copy them in as project fonts) — record the choice.
- `SWIFTUI.wiring`: "Next: add Design/MotifTheme.swift to your app target, then apply .motifTheme() to your root view in <Name>App.swift and read colours with @Environment(\.motifColors)…"; skipped once the app uses `.motifTheme(`.
- [ ] **Step 1–5:** substring tests + snapshot; tokens tests on the template shape (path, protection, up to date, wiring, fonts copied, Info.plist note); the Mac-only compile test; implement; commit `feat(tokens): SwiftUI theme code — colours in every variant, type with the Arabic companion, sizes, shadows and springs`.

### Task 4: `motif check` on SwiftUI apps

**Files:** Create `cli/src/stacks/swiftui/rules.ts`; modify `cli/src/check/mask.ts` (`"swift"`: `//`, nested `/* */`, `"…"` with `\(…)` interpolation kept as code, `"""` multi-line, `#"…"#` raw strings); tests `cli/test/mask-swift.test.ts`, `swiftui-rules.test.ts`, `check-swiftui.test.ts`.

**Interfaces:** `scanSwift(file, scale)`: **raw-color** for `Color(red:green:blue:)`, `Color(.sRGB, …)`, `Color(hex: "…")`/`Color("#…")`-style helpers, `Color(uiColor: .systemRed)`/`Color.red`-style named colours (not `.clear`, `.primary`, `.secondary`, `.accentColor`, `Color(.label)`-style semantic colours), `UIColor(red:…)`; **off-scale** for `.padding(N)`, `.padding(.horizontal, N)`, `spacing: N`, `.cornerRadius(N)`, `RoundedRectangle(cornerRadius: N)`, `.font(.system(size: N))`; **raw-font** for `.font(.custom("…", size:))` and `Font.custom` outside the theme; **raw-motion** for `.easeIn/.easeOut/.easeInOut/.linear(duration:)`, `.timingCurve(…)`, `.spring(response:dampingFraction:)` / `.spring(duration:bounce:)` literals, `withAnimation(.default)`; **reduced-motion** app-wide (the app animates and never reads `accessibilityReduceMotion` or `MotifMotion`); **generated-edited**; `paletteFile` for `extension Color { static let brand = Color(…) }` files and colour-set-backed extensions. Fix texts in Swift ("Use colors.<role> from @Environment(\.motifColors).", "Use MotifSpace.s<N>.", …).
- [ ] **Step 1–5:** tests with exact positions and Review Focus 2's negatives; command tests on a temp template app; implement; commit `feat(check): SwiftUI — typed colours, sizes, fonts and animations in Swift, with Swift fixes`.

### Task 5: `motif extract` drafts a guide from a SwiftUI app

**Files:** Create `cli/src/stacks/swiftui/extract.ts`; tests `cli/test/extract-swiftui.test.ts` with `cli/test/fixtures/swiftui-palettes/`.

**Interfaces:** `collectSwiftUI(files)`: asset catalogue colour sets (`*.colorset/Contents.json`: `universal` and `appearances: [{ appearance: "luminosity", value: "dark" }]`, sRGB/display-P3 components as floats, 0–255 integers or hex strings) become variables with light and dark (`AccentColor` → `--accent-color`, a role hint for action-primary); parallel catalogues or name prefixes (`Men/Primary`, `Women/Primary` folders with "provides namespace") become variants; `extension Color { static let … }` constants; `Font.custom` families and sizes, paddings and corner radii from Task 4's hits as samples; animations as motion.
- [ ] **Step 1–5:** tests on the template (AccentColor light/dark), a namespaced pair as variants, samples; implement; commit `feat(extract): SwiftUI — asset catalogue colours with dark appearances, colour extensions, parallel sets as variants`.

### Task 6: Spike: draw SwiftUI headless on the Mac, and record the decision

**Files:** Create `docs/decisions/0010-swiftui-rendering.md`, `cli/src/stacks/swiftui/harness/` (Swift sources and the project-patching step, embedded as text); modify `cli/test/fixtures/swiftui-min/` (two screens with a `NavigationStack`, previews, English and Arabic `Localizable.xcstrings`, a bundled OFL Arabic TTF).

**Questions to answer on the Mac mini, and record:**
- **Injecting a test target without touching the developer's project:** copy the project to a temp folder and add a hosted unit-test target there — with the `xcodeproj` Ruby gem (installed per user if missing — record), by writing the pbxproj objects directly, or by generating a separate harness project that compiles the app's sources (and packages) into a test bundle. For a Swift package app, add a test target in the copy's `Package.swift`. Choose, prove on the fixture and on a template-shaped project, and record why.
- **Drawing:** host each screen in a `UIWindow` (`UIHostingController`) at the size and trait collection (`userInterfaceStyle`, `layoutDirection`, `preferredContentSizeCategory`, display scale 2/3) and capture with `drawHierarchy(in:afterScreenUpdates:)` (iOS) / `NSHostingView` + `bitmapImageRepForCachingDisplay` (macOS); compare with `ImageRenderer` (which can't draw UIKit-backed views such as `List`, `NavigationStack`, `TextField`) and record.
- **Screens:** `#Preview` bodies (the macro expands to a `PreviewRegistry` type; find how to enumerate and instantiate them from a test — `DeveloperToolsSupport`'s preview registry, or Motif's own discovery of `#Preview { … }` blocks compiled into the harness as functions), and the app's root view (from `@main`'s `WindowGroup`).
- **Device settings:** the four native sizes (390×844 etc. at @3x for phones and @2x for the tablet — record the scale), light/dark, the variant via `MotifTheme.debugVariantOverride` (set to the default too), RTL via `environment(\.layoutDirection, .rightToLeft)` and `\.locale`, fonts registered from Motif's cache with `CTFontManagerRegisterFontsForURL` for Google families.
- **Simulator lifecycle:** `xcrun simctl create motif-<run> <device type> <runtime>`, `boot`, `xcodebuild test -destination id=…`, `delete` in a finally and on interrupt; headless (no Simulator.app window).
- **Timings and the time limit:** first build, each extra screenshot.
- **CI:** `macos-latest` with the runner's Xcode; record the pin.
- [ ] **Step 1:** smallest harness drawing `swiftui-min`'s `ContentView` and one preview, light and dark; Read the PNGs (real glyphs, Arabic shaped).
- [ ] **Step 2:** answer the questions; **Step 3:** decision 0010; **Step 4:** `cli/test/swiftui-render.test.ts` (Mac only); **Step 5:** commit `spike(swiftui): draw SwiftUI headless on the Mac; decision 0010`.

### Task 7: Screens of a SwiftUI app, and `motif shot` refusals off the Mac

**Files:** Create `cli/src/stacks/swiftui/screens.ts`; tests `cli/test/swiftui-screens.test.ts`, `cli/test/shot-swiftui.test.ts`.

**Interfaces:** `discoverSwiftUIScreens(appDir)`: `#Preview("Name") { … }` and `#Preview { … }` blocks (named by their title or `<File>-<n>`), `PreviewProvider` types, and `/` as the app's root view; navigation destinations aren't URL-addressable in SwiftUI, so routes are `/` only unless the app declares `.navigationDestination(for:)` values the spike can construct (record). `--screen <PreviewName>`. `shotRefusal`: not macOS → `needs-mac` (exit 2) with doctor's line; no Xcode → doctor's line. The first-run note: "The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build."
- [ ] **Step 1–5:** tests (previews of each form, slugs, refusals with fake platform), implement, commit `feat(shot): find a SwiftUI app's previews, and say when a Mac is needed`.

### Task 8: `motif shot` on SwiftUI apps: sizes, light and dark, variants, RTL, states

**Files:** Create `cli/src/stacks/swiftui/shot.ts`, the harness sources; tests `cli/test/shot-swiftui.test.ts` (fake runner), `cli/test/swiftui-shot-e2e.test.ts` (Mac only).

**Interfaces:** `SWIFTUI.shoot(opts)` in the native stacks' five steps (copy and patch the project in a temp folder; create and boot the simulator; `xcodebuild test`; read `result.json`; delete the copy and the simulator whatever happened). States: `design/states/<name>.swift` defining `@MainActor func motifState(_ app: MotifHarness) async throws` (tap by accessibility label, type text, wait), and `design/states/Setup.swift` with `func motifSetup(variant: String, locale: Locale, dark: Bool)` (seed `UserDefaults`, set fakes). Per-screen errors in plain words (Review Focus 3); signing: the copy builds with `CODE_SIGNING_ALLOWED=NO` for the simulator; capabilities that need signing are reported. The identical-variant `<how>`: ".motifTheme(variant:), or design/states/Setup.swift for an app that switches its own palette". RTL without the language in the app's string catalogue: the note, as on the other stacks.
- [ ] **Step 1–5:** fake-runner tests (command lines, cleanup on failure and interrupt, refusals, mapping); Mac e2e (`/` and a preview at 390 light and dark; `--variant all` differs; an app passing its own variant drawn in the default for the default's shots; `--rtl` in Arabic glyphs; a setup seeding a signed-in flag); commit `feat(shot): SwiftUI screens drawn in a simulator Motif owns — every size, scheme, variant and direction`.

### Task 9: macOS SwiftUI apps

**Files:** extend the harness and `shot.ts`; tests in `swiftui-shot-e2e.test.ts`.

**Interfaces:** a macOS app (or the macOS destination of a multiplatform app) is drawn without a simulator at the desktop size (1440×900 @2x) plus a compact window (900×700), light and dark, variants, RTL; `--sizes` maps to window sizes. Fonts registered the macOS way.
- [ ] **Step 1–5:** tests, implement, commit `feat(shot): macOS SwiftUI apps at desktop sizes`.

### Task 10: The audit on SwiftUI

**Files:** harness and `shot.ts`; tests in both shot test files.

**Interfaces:** on every screenshot with `--audit`: XCTest's `performAccessibilityAudit(for: [.contrast, .hitRegion, .sufficientElementDescription])` in a UI-test pass where the spike shows it's needed, or the same checks computed in the hosted test from the accessibility tree (`accessibilityLabel`, `accessibilityFrame`, traits) and rendered pixels — whichever decision 0010 records — mapped to `color-contrast` (fg, bg, ratio, expected 4.5 or 3 for large text, label), `target-mobile` (44×44 pt), `name` (buttons and images without a label), and `motion` (with `UIAccessibility.isReduceMotionEnabled` overridden on, the screen still animating 2 s after settling). Fix texts in SwiftUI's terms (`.accessibilityLabel`, `.frame(minWidth: 44, minHeight: 44)` / `.contentShape`, `@Environment(\.accessibilityReduceMotion)`).
- [ ] **Step 1–5:** mapping tests (fake result), Mac e2e on planted issues (grey caption, a 30 pt icon button without a label, a repeating animation), a typing state and a throwing state; commit `feat(shot): SwiftUI audit — contrast, hit regions, names and reduced motion as drawn`.

### Task 11: The SwiftUI stack guide and the modes

**Files:** `skill/adapters/swiftui/{README,tokens,components,motion,platform,checks}.md`; `skill/SKILL.md`, `skill/modes/{init,feature,review}.md`, `skill/knowledge/variants.md`; tests `adapters.test.ts`, `skill-modes.test.ts`, `skill-content.test.ts`.

**Content the tests pin:** README: Xcode's "App" template (there's no command-line starter for an Xcode project; offer `swift package init --type executable` only for packages, or have the developer create it in Xcode), `xcodebuild`, the Mac requirement for screenshots, doctor's lines, floors. tokens: `.motifTheme(`, `@Environment(\.motifColors)`, `.motifFont(`, `MotifSpace.`, `UIAppFonts`, "Switching variants" from `@AppStorage`. components: `Button` styles (`ButtonStyle` with `configuration.isPressed`), `.accessibilityLabel`, `.contentShape`, minimum 44 pt, focus (`@FocusState`). motion: `MotifSprings.`, `withAnimation(`, `accessibilityReduceMotion`. platform: `.environment(\.layoutDirection`, leading/trailing, `.flipsForRightToLeftLayoutDirection(true)`, Dynamic Type, safe areas. checks: one section per rule with Swift examples passing `scanSwift`; `design/states/Setup.swift` and a state with exact signatures; `--screen`; `--rtl`; the Mac requirement.
- [ ] **Step 1–5:** pin tests, write the guide, run, commit `docs(skill): the SwiftUI stack guide`.

### Task 12: SwiftUI fixtures: Qahwa, and a seeded copy

**Files:** `tests/fixtures/swiftui-contract-app/`: **Qahwa**, a coffee shop's loyalty app (menu, a drink's page, the loyalty card, sign-in), English and Arabic, an Xcode project as Xcode creates it, the generated theme, Readex Pro as the Arabic companion (bundled), variants `default` and `evening` (colours only), previews for each screen, `design/states/Setup.swift`. `tests/fixtures/swiftui-seeded-app/{overlay/,seeded-issues.json,README.md}` with ≥8 exact problems and ≥4 judgement problems in the style of the other seeded lists. Qahwa has no `orders` or `rewards-history` screen (Task 13's B cases add them). `tests/fixtures/assemble.ts`; `cli/test/fixtures-swiftui.test.ts` (validate, check clean, up to date; seeded lines exact; Mac-only: builds, `shot --sizes 390 --audit --variant all --rtl` clean on Qahwa, planted problems found on the seeded copy).
- [ ] **Step 1–5:** tests, build the fixtures, commit `feat(fixtures): Qahwa, a SwiftUI coffee loyalty app with an evening variant and Arabic, and its seeded copy`.

### Task 13: SwiftUI eval cases and grading

**Files:** `tests/fixtures/briefs/masar.md` (a running tracker for iPhone, English and Arabic, no design sources); `tests/evals/{cases,collect,grade,preflight}.ts`, `README.md`; tests `evals-*.test.ts`, `fixtures-briefs.test.ts`.

**Interfaces:** `b-swiftui-orders`, `b-swiftui-rewards`, `c-swiftui`, `d-masar` with `stack: "swiftui"` and `mac: true` (the runner skips them off macOS with the reason, spec §9); typecheck = `xcodebuild build` for a simulator destination (CODE_SIGNING_ALLOWED=NO); render via `motif shot --sizes 390 --screen …`; screens via `discoverSwiftUIScreens`; `swiftUIComponents(diff)`: new public `View` structs outside the theme that aren't `*View` screens referenced as a screen's root or previews.
- [ ] **Step 1–5:** tests, implement, commit `feat(evals): SwiftUI cases (Mac only) — two features on Qahwa, the seeded review, and a new app from a brief`.

### Task 14: CI runs the SwiftUI tests on macOS

**Files:** `.github/workflows/ci.yml`, `release.yml`; `cli/test/release.test.ts`.
- [ ] A `swiftui` job on `macos-latest` (Bun; the runner's Xcode selected by `xcode-select`, pinned by version; `MOTIF_STACK_JOB: swiftui`; the swiftui test files); release mirrors it; the string-contract test covers it; commit `ci: a SwiftUI job on macOS`.

### Task 15: SwiftUI is supported: hands-on, evals, docs

**Files:** `cli/src/detect/stacks.ts` (`ADAPTERS_AVAILABLE` gains `"swiftui"`), `cli/src/commands/doctor.ts`, `README.md`, `docs/parity.md` (SwiftUI's row with Evals pending until they pass, and its proof section).
- [ ] Doctor's "Full support for SwiftUI"; the parity row; the full suite.
- [ ] Hands-on on the Mac mini on a scratch clone of a public SwiftUI sample (Apple's "Landmarks" from the SwiftUI tutorials or another public sample app): doctor, extract, tokens, check, `shot --audit --variant all --rtl`; a note in `docs/notes/`.
- [ ] The controller runs `bun tests/evals/run.ts --cases b-swiftui-orders,b-swiftui-rewards,c-swiftui,d-masar` on the Mac mini; all four must pass before the Evals cell turns done.
- [ ] Commit `feat: SwiftUI is supported`.
