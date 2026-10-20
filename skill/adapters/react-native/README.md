# React Native with Expo

How Motif works with a React Native app built with Expo: what it expects, how to start one, where things live, and how to build and run it. Motif's theme code for React Native is one TypeScript file that sits beside your components; nothing else is added to the app.

## What Motif expects

- An Expo app in TypeScript, with Expo Router (the starter's default) or React Navigation. React Native without Expo isn't supported: theme code, checks and drafts work there, but screenshots need Expo's web target.
- **The floors:** Expo SDK 52 (React Native 0.76, whose New Architecture draws `boxShadow`), TypeScript 5 and Reanimated 3.16. Motif's own tests ran on SDK 52 and on a current SDK. `motif doctor` says when the SDK is older than 52: `npx expo install expo@latest --fix`.
- One design guide for the whole project. Motif writes the same theme for iOS and Android; [platform rules](platform.md) says what to keep different on purpose.

## How Motif recognises it

A folder is an Expo app when its `package.json` lists `expo` and `react-native`. `motif doctor --json` lists the apps, with the stack `react-native`. It also checks the **Expo web target**, because screenshots use it, and tells the developer in one line: `Expo web target`, ok, "Expo SDK 52, with the web target's packages." When `react-dom`, `react-native-web` or `@expo/metro-runtime` is missing, the same line is marked as needed, with the command:

```bash
npx expo install react-dom react-native-web @expo/metro-runtime
```

Theme code, checks and drafts work without them; screenshots don't.

## Starting a new project

```bash
npx create-expo-app@latest my-app
```

The starter comes with Expo Router, TypeScript and the web packages. The new `my-app` folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`. It prints one `npx expo install …` line for any package the theme file needs and the app doesn't list yet (`expo-font`, `react-native-reanimated`, the `@expo-google-fonts/<family>` packages). Run that line, then `motif tokens` again. Motif never edits `package.json`, `app.json`, `babel.config.js` or `metro.config.js`.

The starter has sample screens, themed components and a `scripts/reset-project.js`; remove what the design doesn't use ([theme code](tokens.md#wiring-it-in)).

## Folders

- **Theme code:** `design/motif-theme.tsx`, written by `motif tokens` (under `src/design/` when the app keeps its code in `src/`). Never edit it by hand ([theme code](tokens.md)).
- **Screens:** `app/` (or `src/app/`), one file per route with Expo Router.
- **Reusable components:** `components/`; a feature's own components go in `features/<feature>/components/` ([components](components.md)).
- **Fonts the theme brings:** the `@expo-google-fonts/<family>` packages, or `assets/fonts/` for the guide's own `.ttf` and `.otf` files, which `motif tokens` copies there when they sit outside the app.
- **The design guide:** `DESIGN.md` and `design/` in the project folder. Screenshot state scripts live in `design/states/` ([checks](checks.md#screens-behind-a-form-or-a-tap)).

`design/motif.json` can name a different theme folder when the code isn't laid out this way: `themeDir` is a folder inside the project, written from the project's top.

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "react-native", "themeDir": "src/theme" }] }
```

In a monorepo each Expo app is found on its own, and one guide can serve a web dashboard and an Expo app: one `DESIGN.md` and one `design/tokens.json` at the project's top, with `themeDir` per app and the platform notes (section 8) saying what differs on purpose. `motif shot --app mobile/customer` draws one of them.

## Build, type-check and run

- `npx tsc --noEmit`: the type-check. Run it after every change; it must report no errors. The theme file is typed, so a role that doesn't exist fails here.
- `npx expo start`: runs the app on a simulator, an emulator or a phone with Expo Go.
- `npx expo start --web`: runs the same app in the browser, through `react-native-web`. This is what `motif shot` draws, so it must work.
- `npx expo install <package>`: adds a package at the version this SDK expects. Use it instead of `npm install` for anything Expo or React Native.
- `npx expo lint`: the starter's linter, if the app has one.

**The web target.** React Native screenshots are of Expo's web target in Chrome: close to the app, but native-only components and platform fonts can differ. Motif says so in the first run's notes. What the web shows exactly: the guide's colours, light and dark, every variant, the fonts the app loads, and Arabic text and layout. What it can't show: native-only components (maps, the camera, native date pickers), San Francisco and Roboto, native navigation chrome (large titles, blur), and the status bar and notch insets. When the app imports a package that has no web version, Expo throws as the page loads and Motif says which package to move into a `.web.tsx` twin file (a copy that leaves it out). A missing package stops the run with the `npx expo install` line to fix it.

- Each file under `app/` is a route: `index.tsx` is `/`, `(tabs)` groups add no segment, and `[id]` routes need a value, so Motif lists them as skipped; draw one with `--routes /orders/1`. Without `--routes`, a run takes 12 routes, sign-in pages first. With React Navigation, a `linking` config's paths are read.
- A screenshot takes about a second each on top of the first start (a few seconds for Expo's server and its first bundle), so a full run takes a minute or more. Use `--sizes 390` and `--routes` while working.
- Sizes are the phone widths (360, 390, 430) and a tablet (768). `--sizes desktop` adds a desktop width, which the audit judges for contrast and names only.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, using it, fonts and switching variants.
- [Components](components.md): building components the React Native way, and the starter set.
- [Motion](motion.md): the motion roles in Reanimated, springs and reduced motion.
- [Platform rules](platform.md): iOS and Android conventions, right to left, safe areas, text and accessibility.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and state scripts.
