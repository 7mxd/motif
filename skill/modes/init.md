# Init: start a new app

From a short brief to a running app with a design guide, theme code, starter components, an app shell and its first screens, all checked. Steps marked ⏸ wait for the developer unless they turned approvals off. After each step, update `design/.progress.json` (`"mode": "init"`).

## 1. Brief

Ask one round of questions, each with choices and a default. Skip any the developer already answered; accept a brief file instead if they have one.

1. What is the app? (one sentence, in their words)
2. Who is it for?
3. Platform and stack: a web app (React, the default), a simple web page or site with no framework (plain web), a web app in Vue (Vite) or Nuxt, a web app in Svelte (Vite) or SvelteKit, a web app in Angular, a mobile app in Flutter or in React Native with Expo, an Android app in Jetpack Compose, an iPhone or Mac app in SwiftUI, or another stack. Pre-fill what `motif doctor --json` found.
4. Brand: a name, a logo, colours or fonts they must use (optional).
5. Feel: offer the 8 starting styles. Run `motif preview --gallery --png-only --out design/directions/gallery` and show the PNGs (light and dark); if you can't show images, describe each from `presets/<style>/about.md` in the skill folder. Words work too ("calm and premium").
6. Apps or sites they like (optional; links are enough).

Save the answers in the progress file's `notes`, so a later session doesn't ask again.

## 2. Scaffold

- **No project yet:** create it in a new folder named after the app, with the starter in the stack guide ([React web](../adapters/react-web/README.md): Next.js by default, Vite for a single-page app; [plain web](../adapters/plain-web/README.md): a few files and no build step; [Flutter](../adapters/flutter/README.md): `flutter create --org <the developer's reverse-domain name> <app>`, which adds `flutter_test` to `dev_dependencies`; `motif shot` needs it, so add it to an existing app that lacks it; [Jetpack Compose](../adapters/compose/README.md): Android Studio's Empty Activity template, which has no command-line starter, so ask the developer to create it in Android Studio, or write the template's files yourself when they prefer, as the guide lists them, starting with the Gradle wrapper, which the guide makes without Gradle installed; [SwiftUI](../adapters/swiftui/README.md): Xcode's App template, which has no command-line starter either, so ask the developer to create it in Xcode (they choose where to keep it, and Xcode makes the app's folder there), and say that its screenshots need a Mac with Xcode; [React Native](../adapters/react-native/README.md): `npx create-expo-app@latest <app>`, which includes the web packages screenshots use; [Vue and Nuxt](../adapters/vue/README.md): `npm create vue@latest <app>` (TypeScript and Router) for a single-page app, or `npm create nuxt@latest <app>` for server rendering; [Svelte and SvelteKit](../adapters/svelte/README.md): `npx sv create <app> --template minimal --types ts --no-add-ons --install npm` for SvelteKit, or `npm create vite@latest <app> -- --template svelte-ts` for a single page with no routes; [Angular](../adapters/angular/README.md): `npx @angular/cli@latest new <app> --defaults --style=tailwind`, the Angular CLI's `ng new`, with `--style=css` or `--style=scss` for no Tailwind and `--ssr` for server rendering). Starters need an empty folder, so the brief's files can't go first: once the project exists, move the `design/` folder from step 1 into it, and run every later command (`motif` included) from the new folder. Ask before installing anything the starter command doesn't install.
- **An existing project:** keep it. Add Motif's files beside what's there and change nothing else yet.

## 3. Research

Gather references for the brief's personality and the screens it needs:

- With design sources connected, follow their notes: [Refero](../sources/refero.md) for styles and real screens, [60fps.design](../sources/60fps.md) for mobile motion, [Supahero](../sources/supahero.md) for a landing page's hero.
- Always: [visual craft](../knowledge/visual-craft.md), [character](../knowledge/character.md), [anti-patterns](../knowledge/anti-patterns.md), [type pairings](../knowledge/type-pairings.md), the [motion guide](../knowledge/motion.md), and the UX pattern guides for the first screens: [onboarding](../knowledge/ux-patterns/onboarding.md), [sign-in](../knowledge/ux-patterns/sign-in.md) and [home](../knowledge/ux-patterns/home-dashboard.md).

Write down in a few lines what you'll take from each reference. Keep links only.

**If the brief calls for a variant** (a look for another audience, or a brand per customer), do a short research step on it first: how comparable apps handle it, what the connected design sources show, and the pitfalls. Then propose what differs (usually colours, maybe icons or imagery) and what stays the same, and ⏸ wait for the developer to approve what varies before anything is written. [Variants](../knowledge/variants.md) covers when a variant is worth it, and for an audience variant how to avoid stereotypes and keep both equally good. Approved variants go in the design guide in step 5 and are checked in step 7.

## 4. Directions ⏸

Make two or three clearly different directions: different colour moods, type pairings or densities, not one look with three accent colours. Each direction names its font pairing (text and headings, plus an Arabic companion second in both font lists when the app may show Arabic) from [type pairings](../knowledge/type-pairings.md), different from the other directions', with one line on why it suits the brief. Leave out the overused fonts and colour looks listed there unless the developer asks for them. At least one direction takes the brief's personality as far as it goes ([character](../knowledge/character.md) says how loud each kind of brief gets); when a starting style already matches the personality, don't tone it down. Each direction is a folder in `design/directions/`, such as `design/directions/calm/`, holding:

- `tokens.json`: start from the closest starting style (`presets/<style>/tokens.json` in the skill folder) or [the template](../contract/tokens.template.json), and change the values to fit the brief. Keep every role; [the format](../contract/spec.md) explains each one. With variants, add each one's values and `--variant all` when you preview.
- `tile.html`: a style tile with the colour roles as swatches, the type scale, and the key components (buttons, a field, a card, a list row) in their main states.
- `<screen>.html`: the one screen that best shows the app (usually home), in the right frame (a phone for mobile apps, a browser for web apps), with realistic mock content.
- `welcome.html`: the welcome or landing screen with its brand moment (a `brand` band or panel, an illustration, proof), on a phone and, for web apps, a desktop.

Write the mockups with [the preview kit](../preview-kit/README.md): screen content and kit classes only, no colours, sizes or fonts of your own. The kit's brand classes (`.mk-brand`, `.mk-art`, `.mk-tile`, `.mk-stat`) build the brand moments, and an illustration is an inline `<svg>` whose fills are `var(--motif-color-*)` roles or `currentColor`. Each mockup uses the `tokens.json` in its own folder.

1. For each direction, run `motif validate --tokens design/directions/<name>/tokens.json` and fix every problem (readability first) before showing it.
2. Run `motif preview design/directions/<name> --png-only` for each direction; the PNGs are saved next to the mockups. It refuses a direction whose theme values match another's, and notes one that shares another's fonts: change it until each direction is clearly its own, then run it again.
3. For a live side-by-side view, run `motif preview --compare design/directions/<a>/<screen>.html design/directions/<b>/<screen>.html` in the background, or ask the developer to run it.
4. Show the PNGs and describe each direction in one line ("Calm: soft neutrals, rounded corners, generous spacing; Onest, with Readex Pro for Arabic"). Run the [five-second test](../knowledge/character.md#the-five-second-test) on each welcome mockup, and recommend the direction whose words match the brief's personality best (every one of its words, not just the loudest), not the safest one.
5. The developer picks one, asks for a mix ("A's colours with B's type"), or asks for changes. Update the folders and show them again until they approve one.

## 5. Design guide

1. Copy the approved direction's `tokens.json` to `design/tokens.json`.
2. Write `DESIGN.md` from [the template](../contract/DESIGN.template.md) (keep its `## Variants` section only if there are variants): the summary, the brief, the direction (the style, references as links, the approved mockups), and every other section filled from the decisions so far. [The format](../contract/spec.md) says what each section holds.
3. Move the approved mockups and their PNGs into `design/previews/`, then delete `design/directions/`.
4. Run `motif validate` and fix every problem until it passes.
5. Add the first change-log line, replacing the template's example line: `- <date> — Created the design guide — <name> chosen from <n> directions — approved by <developer>`.

## 6. Build

1. Run `motif tokens` to write the theme code, and do the wiring its output asks for (for example importing the CSS once, linking `motif.css` in each page, wrapping a Compose app's `setContent` in `MotifTheme`, or adding `.motifTheme()` to a SwiftUI app's root view). Load the theme's fonts in the app as the stack guide shows; `motif tokens --json` lists them in `fonts`.
2. Build the stack guide's starter components, each with every state from `DESIGN.md` section 5 (default, hover where it applies, pressed, focused, disabled, loading, error) and motion from the motion roles.
3. Build the app shell (the navigation model in `DESIGN.md` section 6) and the first screens, with mock data from one clearly named file:
   - Web apps: welcome or landing, sign-in, home.
   - Mobile apps: onboarding, sign-in, home.
   - Plain web sites: the pages the brief names; a one-page tool is its page and each state behind a form or a click.

   Follow each screen's UX pattern guide, including its loading, empty and error states.

## 7. Verify

1. Run `motif check` and fix every finding. Use a `motif-ok: <reason>` comment only for a value that truly must stay (a partner's brand colour, say).
2. Run the project's build and type check (the stack guide names them; a plain web site has none).
3. Run `motif shot --audit` for the starter screens (it covers every variant), in light and dark at every size it takes (three phones and a tablet, plus a desktop for a web app), adding `--state` for each screen behind a form or a click (the stack guide's checks show how). Fix the critical and major findings, then run it again.
4. For each screen with an approved mockup, run `motif shot --routes <route> --against design/previews/<screen>.html` and compare the app with the mockup. Fix differences that change the design.
5. Run the [five-second test](../knowledge/character.md#the-five-second-test) on the welcome, sign-in and home screenshots, phone and desktop. Where your words don't match the brief's personality, add the missing brand moment and shoot again. Then look at each of those screenshots once just for the [slips that undo it](../knowledge/character.md#slips-that-undo-it) (uneven label gaps, a title smaller than its description, a count that doesn't match, rows out of line) and fix any you find.
6. Show the developer the screenshots and a short summary: what was built, what passed, anything left for later.

Delete `design/.progress.json`. The app is ready for new features.
