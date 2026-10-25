# Angular

How Motif works with Angular apps: what it expects, how to start a project, and where things live. The theme is React web's CSS theme, so an Angular app and a React app of the same design guide look the same.

## What Motif expects

- **The floors:** Angular 15 or later, with standalone components, and TypeScript. Angular 22 needs Node 22.22.3 or later (or 24.15 or later); Angular 20 and 21 need Node 20.19 or later (or 22.12 or later). `motif doctor` checks the floor of the Angular the app has installed and says when the computer's Node is too old.
- An app built from NgModules is still read (checks, drafts and screenshots work), and `motif doctor` says it uses NgModules. Write new components as standalone ones.
- Tailwind CSS v4, or plain CSS or Sass. Tailwind v3 projects get CSS variables only; [theme code](tokens.md) explains how to use them.
- Angular's own `animate.enter` and `animate.leave` (Angular 20.2 and later) with CSS classes timed by Motif's variables, and Motion (`npm install motion`) for springs and animation in code. `@angular/animations` is deprecated: don't use it in new code ([motion](motion.md)).
- **Angular 14 and older aren't supported.** `motif doctor` says so plainly. What still works there: the CSS theme (`motif.css`), `motif check` and `motif extract`, and `motif shot --url` against a running app (start the app yourself and pass its address).

Some features in this guide arrived after Angular 15: signals in 16, the built-in control flow (`@if`, `@for`) in 17, `input()` and `output()` in 17.1 and 17.3, `animate.enter` in 20.2. On an older app, use what it has (`*ngIf`, `@Input()`, CSS transitions) with the same theme values.

## How Motif recognises it

An app with `@angular/core` in its `package.json` is an Angular app; Motif reads its application project from `angular.json` (or Nx's `project.json`). `motif doctor --json` lists it in `apps` with the stack `angular`. In a monorepo, `design/motif.json` maps each app's folder to its stack. The source folder is the project's `sourceRoot` in `angular.json` (usually `src`).

## Starting a new project

Run the Angular CLI's `ng new` in a folder the developer chose. With Tailwind:

```bash
npx @angular/cli@latest new my-app --defaults --style=tailwind
```

`--style=tailwind` sets up Tailwind 4 (`.postcssrc.json` and `@import 'tailwindcss';` in `src/styles.css`). Use `--style=css` or `--style=scss` for no Tailwind, and add `--ssr` for server rendering. `--defaults` answers the CLI's other questions with their defaults. With the CLI installed globally, the same is `ng new my-app --defaults --style=tailwind`. Use the developer's package manager with `--package-manager pnpm` (or `yarn`, `bun`). Then, in the new folder, `npm install motion` if the app needs it (see above).

The new `my-app` folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`. Motif never edits `package.json`, `angular.json`, `src/styles.*`, `src/index.html`, `app.config.ts` or `main.ts`; it prints the one step that wires the theme in ([theme code](tokens.md#wiring-it-in-once)).

## Folders

- **The app:** `src/main.ts` starts it with `bootstrapApplication`, `src/app/app.config.ts` holds its providers, and `src/app/app.routes.ts` its routes. The root component is `src/app/app.ts` with `app.html` and `app.css` (the CLI's 2025 file names; an app made with `--file-name-style-guide 2016`, or before Angular 20, has `app.component.ts`, `app.component.html` and `app.component.css`). Follow the names the app already uses.
- **Global styles:** `src/styles.css` (or `.scss`), listed in `angular.json`'s `styles`.
- **Components:** `src/app/`, one folder per component ([components](components.md)).
- **Mock data:** one file, `src/app/mock-data.ts`, with obviously fictional content.
- **Theme code:** written by `motif tokens` in `src/styles/` (`motif.css`, `motif.tailwind.css`) and `src/app/design/motion.ts`.

`design/motif.json` can name a different theme folder with `themeDir`, a folder inside the project, written from the project's top, which wins over the defaults above; `srcDir` names the source folder when it isn't `sourceRoot`:

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "angular", "srcDir": "src", "themeDir": "src/theme" }] }
```

## Build, type-check and run

- Build and type-check: `ng build` (or `npm run build`). It type-checks the components and their templates, so run it after every change; it must report no errors.
- Run: `npm start`, which runs `ng serve`. `motif shot` starts the project's `start` script itself (or `dev` when `start` doesn't run `ng serve`) on a free port, and stops it when it's done, so don't leave a dev server running for it.
- Dependencies must be installed first; Motif says so, with the install line, when they aren't.

## Screenshots

- Routes come from the app's router configs: the `Routes` array in `app.routes.ts` (`component` and `loadComponent` pages, `children` with their parent's path) and the files reached through `loadChildren`. A redirect (`redirectTo`) isn't a page, `**` is skipped, and a route with a parameter (`orders/:id`) needs a value, so Motif lists it as skipped; draw one with `--routes /orders/1`. An app with `withHashLocation()` gets `/#/` addresses.
- Sizes are the phone widths (360, 390, 430), a tablet (768) and a desktop. State scripts are JavaScript ([checks](checks.md#screens-behind-a-form-or-a-click)).
- Time to the first screenshot on a cold start, dev server included, typical: Angular 21 about 4 seconds, Angular 22 about 4 seconds. The first run right after installing packages takes about 7.5 seconds, while Angular fills its build cache. `ng serve` builds the whole app before it answers, so a large app takes longer; use `--sizes 390` and `--routes` while working.
- Mockups for an Angular app are drawn in the preview kit's browser frame (`mk-browser`), as for any web app.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, wiring it in, dark mode, variants, fonts and Angular Material.
- [Components](components.md): building standalone components, and the starter set.
- [Motion](motion.md): the motion roles in `animate.enter`, `animate.leave`, CSS and Motion.
- [Platform rules](platform.md): web conventions, right to left, server rendering.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and state scripts.
