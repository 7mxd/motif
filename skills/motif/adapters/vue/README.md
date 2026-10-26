# Vue and Nuxt

How Motif works with Vue apps (Vite) and Nuxt apps: what it expects, how to start a project, and where things live. The theme is React web's CSS theme, so a Vue app and a React app of the same design guide look the same.

## What Motif expects

- **The floors:** Vue 3 and Nuxt 3, with TypeScript. Nuxt 4.6 needs Node 22.22.3, or 24.15 or later (Nuxt 4.5 needs 22.19); npm warns when Node is older.
- Vue 3 with Vite (Vue's own starter), or Nuxt (3 or 4).
- Tailwind CSS v4, or plain CSS. Tailwind v3 projects get CSS variables only; [theme code](tokens.md) explains how to use them.
- Motion for Vue (`motion-v` 1 or later) for animation that CSS can't do. Vue's own `<Transition>` and CSS for the rest.
- **Vue 2 and Nuxt 2 aren't supported.** `motif doctor` says so plainly. What still works there: the CSS theme (`motif.css`), `motif check` and `motif extract` on the `.vue` files, and `motif shot --url` against a running app. Motif writes no `motion.ts` for them, because Motion for Vue needs Vue 3; animate with the `--motif-duration-*` and `--motif-easing-*` variables.

## How Motif recognises it

An app with `vue` in its `package.json` is a Vue app (a Vue 2 app is recognised too, so `doctor` can say it isn't supported), and one with `nuxt` is a Nuxt app. `motif doctor --json` lists it in `apps` with the stack `vue`. In a monorepo, `design/motif.json` maps each app's folder to its stack, and `srcDir` records where its source lives.

## Starting a new project

Vue with Vite is the default for a single-page app; use Nuxt when the developer wants server rendering, file-based pages or SEO. Run the starter in an empty folder the developer chose.

```bash
npm create vue@latest my-app
```

Choose TypeScript and Vue Router. Then, in the new folder, `npm install motion-v`, and for Tailwind `npm install tailwindcss @tailwindcss/vite`: add `tailwindcss()` to `plugins` in `vite.config.ts` (imported from `@tailwindcss/vite`) and put `@import "tailwindcss";` at the top of `src/assets/main.css`.

```bash
npm create nuxt@latest my-app
```

Then `npm install motion-v` (and `npm install tailwindcss @tailwindcss/vite` for Tailwind, with the plugin in `vite.plugins` of `nuxt.config.ts`). The Nuxt 4 starter has an `app/app.vue` with `<NuxtWelcome />` and no `pages/` folder: add `app/pages/index.vue` and replace `NuxtWelcome` with `<NuxtPage />`.

Use the developer's package manager (its lockfile says which): `pnpm create vue@latest`, `yarn create vue`, `bun create vue@latest`, and `pnpm add`, `yarn add`, `bun add` for packages. The new `my-app` folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`. Motif never edits `package.json`, `vite.config.*`, `nuxt.config.*`, `main.ts`, `App.vue` or `app.vue`; it prints the one step that wires the theme in ([theme code](tokens.md#wiring-it-in-once)).

## Folders

- **Vite:** everything in `src/`; pages (views) in `src/views/`, routes in `src/router/index.ts`.
- **Nuxt 4:** the source folder is `app/`, with `app/pages/`, `app/components/` and `app/layouts/`. **Nuxt 3:** the source folder is the project root (`pages/`, `components/`), unless `srcDir` says otherwise. Motif's `design/` folder sits at the project root: in a Nuxt 3 app at the root it is also the app's own source folder, so the theme code is kept out of it ([theme code](tokens.md)).
- **Components:** `src/components/`, or Nuxt's `components/` ([components](components.md)).
- **Mock data:** one file, `src/mock-data.ts` (Nuxt: `utils/mock-data.ts`), with obviously fictional content.
- **Theme code:** written by `motif tokens`; Vite: `src/styles/` and `src/design/`; Nuxt: `<srcDir>/assets/css/` and `<srcDir>/design/` (`motion/motif-motion.ts` for a Nuxt 3 app at the project root).

`design/motif.json` can name a different theme folder with `themeDir`, a folder inside the project, written from the project's top, which wins over every default above; `srcDir` names the source folder when it isn't the usual one:

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "vue", "srcDir": "src", "themeDir": "src/theme" }] }
```

## Build, type-check and run

- Build: `npm run build`.
- Type-check: Vite, `npx vue-tsc --noEmit`; Nuxt, `nuxi typecheck` (`npx nuxi typecheck`). Run it after every change; it must report no errors.
- Run: `npm run dev`. `motif shot` starts the project's `dev` script itself (Vite, or `nuxt dev`, which Motif runs with `NODE_ENV=development`) and stops it when it's done, so don't leave a dev server running for it.
- Dependencies must be installed first; Motif says so, with the install line, when they aren't.

## Screenshots

- Routes come from Nuxt's `pages/` folder, vue-router 5's file routes, or the routes in a Vue Router config. A dynamic route (`/orders/:id`) needs a value, so Motif lists it as skipped; draw one with `--routes /orders/1`.
- Sizes are the phone widths (360, 390, 430), a tablet (768) and a desktop. State scripts are JavaScript ([checks](checks.md#screens-behind-a-form-or-a-click)).
- Time to the first screenshot on a cold start, dev server included, typical: Vite about 2 seconds, Nuxt with server rendering about 7 seconds. A Nuxt app with many pages compiles each on its first visit, so a long run takes more; use `--sizes 390` and `--routes` while working.
- Mockups for a Vue or Nuxt app are drawn in the preview kit's browser frame (`mk-browser`), as for any web app.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, wiring it in, dark mode, variants and fonts.
- [Components](components.md): building components the Vue way, and the starter set.
- [Motion](motion.md): the motion roles in `<Transition>`, CSS and Motion for Vue.
- [Platform rules](platform.md): web conventions, right to left, server rendering.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and state scripts.
