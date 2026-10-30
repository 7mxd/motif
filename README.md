<p align="center"><img src="docs/cover.png" alt="Motif: the title and &quot;A design guide your coding agent follows&quot; beside two phones showing its sample site in light and dark, a card with that site's design guide colours, and a terminal card with Motif's checks passing"></p>

# Motif

Design guide tools for AI coding agents: build web and mobile apps with polished UI, UX and motion — and keep them consistent as your app and team grow.

> **Preview (v0.7.0).** Motif works in Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode, for React web apps, plain web sites, Vue (and Nuxt), Svelte (and SvelteKit) and Angular apps, and Flutter, Jetpack Compose, React Native (Expo) and SwiftUI apps ([what each stack gets](docs/parity.md)). The first full release comes next.

## Install

**Claude Code**

```
/plugin marketplace add 7mxd/motif
/plugin install motif@motif
```

**Codex**

```
codex plugin marketplace add 7mxd/motif
codex plugin add motif@motif
```

**GitHub Copilot CLI**

```
copilot plugin marketplace add 7mxd/motif
copilot plugin install motif@motif
```

In VS Code, run "Chat: Install Plugin From Source" and enter `7mxd/motif`.

**Cursor:** add the plugin marketplace `7mxd/motif` in Cursor's plugin settings, or in the CLI run `cursor-agent plugin marketplace add https://github.com/7mxd/motif`.

**Gemini CLI**

```
gemini extensions install https://github.com/7mxd/motif --ref plugins --auto-update
```

**OpenCode, or any agent that reads `~/.agents/skills`**

- macOS and Linux: `curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh`
- Windows PowerShell: `irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1 | iex`

Then ask for design work ("make this screen look better"), or start Motif: `/motif:design` in Claude Code, `$motif` in Codex, `/motif` everywhere else.

You need git, and Claude Code 2.1.224 or later if you use Claude Code. The first time Motif runs, it downloads its tool (about 100 MB) from the [release](https://github.com/7mxd/motif/releases/tag/v0.7.0) and checks it against the release's checksums. See the [release notes](docs/releases/v0.7.0.md), or build and try Motif from source: [Claude Code](plugin/claude-code/README.md), [other agents](plugin/agents/README.md).

## The `motif` tool

| Command | What it does |
|---|---|
| `motif doctor` | Explains what works on this computer and what's optional |
| `motif connect` | Connects optional design sources (Motion, Refero, 21st.dev, 60fps.design) to the coding agents you choose, for all your projects; keys are typed only in your own terminal |
| `motif validate` | Checks your design guide (`DESIGN.md` + `design/tokens.json`); `--tokens <file>` checks one theme values file, such as a design direction's |
| `motif tokens` | Turns your design guide into theme code (React web: CSS variables, a Tailwind v4 theme, Motion timings; plain web sites: `motif.css` in the site folder; Flutter, from v0.5.0: `lib/design/motif_theme.dart`, with a `ThemeExtension`, light and dark `ThemeData` and every variant, or one file for several apps in the `themeDir` that `design/motif.json` names; Jetpack Compose, from v0.5.0: `ui/motif/MotifTheme.kt` in the app module's package, with `MotifTheme`, every variant light and dark, the Material colour scheme and type, and the fonts in `res/font`; React Native with Expo, from v0.5.0: `src/design/motif-theme.tsx` (or `design/` without `src/`), with `MotifProvider`, `useMotifTheme()`, every variant light and dark, and the fonts for `expo-font`; SwiftUI, from v0.5.0: `Design/MotifTheme.swift` in the app target's folder, with `.motifTheme()`, every variant light and dark, type that scales with Dynamic Type, and the fonts in `Fonts/`; Vue, Svelte and Angular, from v0.6.0: React web's CSS variables and Tailwind v4 theme in the app's own folders, and a `motion.ts` for Motion for Vue, Svelte's `Spring` and transitions, or Motion's `animate()` in Angular); `--stack preview` writes the CSS mockups use |
| `motif check` | Finds colours, sizes, fonts and animations in your code (CSS, HTML, JavaScript, TypeScript, Dart and, from v0.5.0, Kotlin and Swift; from v0.6.0, Vue, Svelte and Angular components, with their templates and style blocks) that bypass your design guide |
| `motif extract` | Drafts a design guide from an existing app's code; in a Flutter app (from v0.5.0), from its `ThemeData`, `ColorScheme` and palette classes, with parallel palettes (light and dark, or one per brand) as variants; in a Compose app (from v0.5.0), from its colour schemes and `Color` constants (the template's `Color.kt` and `Theme.kt`), with parallel schemes as variants too; in an Expo app (from v0.5.0), from its colour objects (the starter's `Colors`, say) and styles, with parallel palettes as variants too; in a SwiftUI app (from v0.5.0), from its asset catalogues' colour sets (light and dark) and `Color` constants, with parallel sets as variants too; in a Vue, Svelte or Angular app (from v0.6.0), from its CSS and its components' style blocks, with a Vuetify app's themes as light, dark and variants, and Angular Material's system colours and `mat.theme` font |
| `motif preview` | Shows mockups in your browser with live reload and saves them as PNGs in light and dark; `--variant <id>` (or `all`) shows a design variant; `--compare` puts several side by side, `--gallery` shows the 8 starting styles; mockups show your theme's real fonts |
| `motif shot` | Screenshots your real app's pages at three phone sizes (360, 390 and 430 px wide, as tall as a phone browser shows), a tablet and a desktop, in light and dark (starting its dev server if needed, or serving a plain web site's folder itself); `--state <script>` also captures states behind a form or a click; `--audit` checks contrast, tap-target sizes, reduced motion, and from v0.5.0 controls with no name (under `accessibility`), as rendered; `--against` puts them side by side with the mockup while you build, or with an earlier run (`--save before`) after a rebuild, and says whether a page changed, grew or only moved; `--sizes 390,1440` takes only some sizes for a quick run; `--variant <id>` (or `all`) screenshots a design variant; from v0.5.0, `--rtl` also screenshots every page right to left (Arabic unless you name another language) |
| `motif browser` | Shows which browser previews use; `motif browser install` downloads a private one if you have none |

Add `--json` for machine-readable output and `--cwd <folder>` to run elsewhere. In a project with several apps, `--app <path>` picks one.

Full support in v0.6.0: React web apps and plain web sites (HTML, CSS and JavaScript without a framework: a folder with an `index.html` in it, `public/`, `src/`, `site/` or `www/`). Vue 3 apps with Vite, and Nuxt 3 or 4 apps; Vue 2 and Nuxt 2 aren't supported, though the CSS theme, checks and drafts work on them. Svelte 5 apps, with SvelteKit 2 or 3 or with Vite; SvelteKit 3 needs Node.js 22.17 or later, which `motif doctor` checks; Svelte 4 and SvelteKit 1 aren't supported, though the CSS theme, checks and drafts work on them. Angular 15 or later, with standalone components or NgModules; each Angular version needs a Node.js in its own range (Angular 22: 22.22.3 or later, or 24.15 or later), which `motif doctor` checks; Angular 14 and older aren't supported, though the CSS theme, checks and drafts work on them. Flutter apps, also inside a monorepo (apps under `mobile/`, say, with a shared package). Jetpack Compose apps (Android); in a Gradle project with several modules, Motif finds each app module and reads its own code, and names the Compose library modules it depends on, which it doesn't read yet. React Native apps made with Expo (SDK 52 or later), also inside a monorepo; React Native without Expo isn't supported, though theme code, checks and drafts work on it. SwiftUI apps for iPhone, iPad and the Mac, in an Xcode project or a Swift package: theme code, checks and drafts work on any computer, and screenshots need a Mac with Xcode. `motif check` and `motif extract` read CSS where it is, including `<style>` blocks and `style=""` attributes. Other stacks are detected, and Motif helps on them with general guidance; [the parity checklist](docs/parity.md) says what a stack gets once it's supported.

From v0.6.0, on Vue, Svelte and Angular, `motif tokens` writes its files in the app's own folders and prints the one step that wires the theme in; it never edits a file of the app's, such as `package.json`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `angular.json` or the app's own stylesheet. `motif shot` needs Node.js and the app's packages installed (it says so, with the install line, when they aren't). It starts the app's own dev script (Vite or `nuxt dev`, SvelteKit's or Vite's, or the `start` script that runs `ng serve`) and draws its pages at the web's sizes, as on React web. It takes the app's routes (Nuxt's `pages/`, Vue Router, SvelteKit's `src/routes`, svelte-spa-router and svelte-routing, and Angular's router configs), and a state is a JavaScript file run in the page, as on the web.

From v0.5.0, on Flutter, `motif shot` needs the Flutter SDK (3.27 or later; `motif doctor` checks it) and draws the screens with `flutter test`: no device, simulator or Mac. It takes the app's routes (go_router or named routes) at three phone sizes and a tablet, and `--screen <Widget>` adds a widget no route opens. A state is a Dart script (`--state design/states/<name>.dart`). Screens behind sign-in or live data need `design/states/setup.dart`, which runs before the app starts (sign someone in, store settings, pick the variant), and `design/states/http.json`, which answers the app's requests from files under `design/`; nothing leaves your computer. Motif's harness lives in the app's `.motif/` folder, which git ignores.

From v0.5.0, on Jetpack Compose, `motif shot` needs JDK 17 and the Android SDK (`motif doctor` finds both, Android Studio's own JDK too) and the app's Gradle wrapper, and draws the screens on the JVM with Robolectric: no phone or emulator. The app needs Kotlin 2.0, Compose UI 1.9 (a Compose BOM of 2025.08.00 or later) and the Android Gradle Plugin 8.6 or later. It takes the app's Navigation Compose routes and its `@Preview` functions at three phone sizes and a tablet, and a state is a Kotlin file (`--state design/states/<name>.kt`), with `design/states/Setup.kt` for screens behind sign-in. The test it runs and its init script live in the module's `.motif/` folder for the run only; Motif never edits the app's Gradle files. The first run downloads about 1.5 GB (Gradle's and Robolectric's libraries) and takes minutes; later runs work offline.

From v0.5.0, on React Native, `motif shot` draws Expo's web target in Chrome, so it needs the app's web packages (`npx expo install react-dom react-native-web @expo/metro-runtime`; `motif doctor` checks them) and starts Expo's web server itself. The screenshots are close to the app, but native-only components and platform fonts can differ, and a screen that uses a native-only module says what to install or stub. It takes the app's routes (Expo Router, or React Navigation's linking config) at three phone sizes and a tablet, and a state is a JavaScript file run in the page, as on the web (`--state design/states/<name>.js`).

From v0.5.0, on SwiftUI, `motif shot` needs a Mac with Xcode 16 or later and, for an iPhone or iPad app, an iOS simulator (`motif doctor` checks both). The app needs a deployment target of iOS 17 or macOS 14 or later, as the theme's springs do (`motif doctor` doesn't read it), and may use either Swift language mode, 5 or 6. Motif builds a copy of the app with a test of its own and draws it in a simulator it creates and deletes, or on the Mac for a Mac app; it never builds inside your project folder, and never edits the Xcode project, `Info.plist`, `Package.swift` or the asset catalogues. It takes the root view (the content of the `App`'s `WindowGroup`) and the app's `#Preview`s, at three phone sizes and a tablet, or in a 1440×900 and a 900×700 window for a Mac app. A state is a Swift file (`--state design/states/<name>.swift`), with `design/states/Setup.swift` for screens behind sign-in. It refuses a Swift package, an app that uses CocoaPods, and a project that uses files outside its folder, each with what to do. The first run builds the app, which takes a few minutes; Motif keeps the build in `~/.motif/swiftui/` for later runs.

Motif's tool includes axe-core 4.14.0 (MPL-2.0), unchanged, for the rendered checks; its source is at https://github.com/dequelabs/axe-core/tree/v4.14.0, and THIRD-PARTY-NOTICES.txt lists everything Motif includes with its licence.

Previews and screenshots run on your computer only: the preview server listens on `127.0.0.1`, serves nothing outside your project, and nothing is uploaded. Screenshots of your app go to `design/shots/`, which Motif keeps out of git. Motif uses the Chrome or Edge you already have; it downloads a browser only when you run `motif browser install`. The 8 starting styles' fonts come with Motif; any other font your theme names is loaded from Google Fonts by your browser while previewing.

Design: `docs/specs/2026-10-12-motif-core-design.md` · Plans: `docs/plans/`
