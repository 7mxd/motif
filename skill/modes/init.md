# Init: start a new app

From a short brief to a running app with a design guide, theme code, starter components, an app shell and its first screens, all checked. Steps marked ⏸ wait for the developer unless they turned approvals off. After each step, update `design/.progress.json` (`"mode": "init"`).

## 1. Brief

Ask one round of questions, each with choices and a default. Skip any the developer already answered; accept a brief file instead if they have one.

1. What is the app? (one sentence, in their words)
2. Who is it for?
3. Platform and stack: a web app (React, the default), a simple web page or site with no framework (plain web), or another stack. Pre-fill what `motif doctor --json` found.
4. Brand: a name, a logo, colours or fonts they must use (optional).
5. Feel: offer the 8 starting styles. Run `motif preview --gallery --png-only --out design/directions/gallery` and show the PNGs (light and dark); if you can't show images, describe each from `presets/<style>/about.md` in the skill folder. Words work too ("calm and premium").
6. Apps or sites they like (optional; links are enough).

Save the answers in the progress file's `notes`, so a later session doesn't ask again.

## 2. Scaffold

- **No project yet:** create it in a new folder named after the app, with the starter in the stack guide ([React web](../adapters/react-web/README.md): Next.js by default, Vite for a single-page app; [plain web](../adapters/plain-web/README.md): a few files and no build step). Starters need an empty folder, so the brief's files can't go first: once the project exists, move the `design/` folder from step 1 into it, and run every later command (`motif` included) from the new folder. Ask before installing anything the starter command doesn't install.
- **An existing project:** keep it. Add Motif's files beside what's there and change nothing else yet.

## 3. Research

Gather references for the brief's personality and the screens it needs:

- With design sources connected, follow their notes: [Refero](../sources/refero.md) for styles and real screens, [60fps.design](../sources/60fps.md) for mobile motion, [Supahero](../sources/supahero.md) for a landing page's hero.
- Always: [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), [type pairings](../knowledge/type-pairings.md), the [motion guide](../knowledge/motion.md), and the UX pattern guides for the first screens: [onboarding](../knowledge/ux-patterns/onboarding.md), [sign-in](../knowledge/ux-patterns/sign-in.md) and [home](../knowledge/ux-patterns/home-dashboard.md).

Write down in a few lines what you'll take from each reference. Keep links only.

## 4. Directions ⏸

Make two or three clearly different directions: different colour moods, type pairings or densities, not one look with three accent colours. Each direction names its font pairing (text and headings, plus an Arabic companion second in both font lists when the app may show Arabic) from [type pairings](../knowledge/type-pairings.md), different from the other directions', with one line on why it suits the brief. Leave out the overused fonts and colour looks listed there unless the developer asks for them. Each direction is a folder in `design/directions/`, such as `design/directions/calm/`, holding:

- `tokens.json`: start from the closest starting style (`presets/<style>/tokens.json` in the skill folder) or [the template](../contract/tokens.template.json), and change the values to fit the brief. Keep every role; [the format](../contract/spec.md) explains each one.
- `tile.html`: a style tile with the colour roles as swatches, the type scale, and the key components (buttons, a field, a card, a list row) in their main states.
- `<screen>.html`: the one screen that best shows the app (usually home), in the right frame (a phone for mobile apps, a browser for web apps), with realistic mock content.

Write the mockups with [the preview kit](../preview-kit/README.md): screen content and kit classes only, no colours, sizes or fonts of your own. Each mockup uses the `tokens.json` in its own folder.

1. For each direction, run `motif validate --tokens design/directions/<name>/tokens.json` and fix every problem (readability first) before showing it.
2. Run `motif preview design/directions/<name> --png-only` for each direction; the PNGs are saved next to the mockups. It refuses a direction whose theme values match another's, and notes one that shares another's fonts: change it until each direction is clearly its own, then run it again.
3. For a live side-by-side view, run `motif preview --compare design/directions/<a>/<screen>.html design/directions/<b>/<screen>.html` in the background, or ask the developer to run it.
4. Show the PNGs and describe each direction in one line ("Calm: soft neutrals, rounded corners, generous spacing; Onest, with Readex Pro for Arabic").
5. The developer picks one, asks for a mix ("A's colours with B's type"), or asks for changes. Update the folders and show them again until they approve one.

## 5. Design guide

1. Copy the approved direction's `tokens.json` to `design/tokens.json`.
2. Write `DESIGN.md` from [the template](../contract/DESIGN.template.md): the summary, the brief, the direction (the style, references as links, the approved mockups), and every other section filled from the decisions so far. [The format](../contract/spec.md) says what each section holds.
3. Move the approved mockups and their PNGs into `design/previews/`, then delete `design/directions/`.
4. Run `motif validate` and fix every problem until it passes.
5. Add the first change-log line, replacing the template's example line: `- <date> — Created the design guide — <name> chosen from <n> directions — approved by <developer>`.

## 6. Build

1. Run `motif tokens` to write the theme code, and do the wiring its output asks for (for example importing the CSS once, or linking `motif.css` in each page). Load the theme's fonts in the app as the stack guide shows; `motif tokens --json` lists them in `fonts`.
2. Build the stack guide's starter components, each with every state from `DESIGN.md` section 5 (default, hover where it applies, pressed, focused, disabled, loading, error) and motion from the motion roles.
3. Build the app shell (the navigation model in `DESIGN.md` section 6) and the first screens, with mock data from one clearly named file:
   - Web apps: welcome or landing, sign-in, home.
   - Mobile apps: onboarding, sign-in, home.
   - Plain web sites: the pages the brief names; a one-page tool is its page and each state behind a form or a click.

   Follow each screen's UX pattern guide, including its loading, empty and error states.

## 7. Verify

1. Run `motif check` and fix every finding. Use a `motif-ok: <reason>` comment only for a value that truly must stay (a partner's brand colour, say).
2. Run the project's build and type check (the stack guide names them; a plain web site has none).
3. Run `motif shot --audit` for the starter screens, in light and dark at every size it takes (three phones, a tablet and a desktop), adding `--state` for each screen behind a form or a click (the stack guide's checks show how). Fix the critical and major findings, then run it again.
4. For each screen with an approved mockup, run `motif shot --routes <route> --against design/previews/<screen>.html` and compare the app with the mockup. Fix differences that change the design.
5. Show the developer the screenshots and a short summary: what was built, what passed, anything left for later.

Delete `design/.progress.json`. The app is ready for new features.
