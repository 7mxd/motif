# Svelte and SvelteKit

How Motif works with SvelteKit apps and with Svelte apps built with Vite: what it expects, how to start a project, and where things live. The theme is React web's CSS theme, so a Svelte app and a React app of the same design guide look the same.

## What Motif expects

- **The floors:** Svelte 5 (runes), with TypeScript, and SvelteKit 2 or 3 for an app with routes and server rendering. SvelteKit 3 needs Node 22.17 or later; `motif doctor` says so when the computer has an older one.
- Tailwind CSS v4, or plain CSS. Tailwind v3 projects get CSS variables only; [theme code](tokens.md) explains how to use them.
- Svelte's own `transition:` directives, `Spring` and `Tween` (`svelte/motion`) for animation. Motion (`npm install motion`) only for what Svelte can't do: a spring that is the same on every screen, or animation of elements Svelte doesn't draw.
- **Svelte 4 isn't supported**, and neither is SvelteKit 1. `motif doctor` says so plainly. What still works there: the CSS theme (`motif.css`), `motif check` and `motif extract` on the `.svelte` files, and `motif shot --url` against a running app. Motif writes no `motion.ts` for them, because `Spring` and `Tween` are Svelte 5's; animate with the `--motif-duration-*` and `--motif-easing-*` variables.

## How Motif recognises it

An app with `svelte` in its `package.json` is a Svelte app, and one with `@sveltejs/kit` is a SvelteKit app. `motif doctor --json` lists it in `apps` with the stack `svelte`. In a monorepo, `design/motif.json` maps each app's folder to its stack, and `srcDir` records where its source lives.

## Starting a new project

SvelteKit is the default: it has routes, server rendering and a `src/lib` folder for shared code (imported as `$lib` on SvelteKit 2, and as `#lib` on SvelteKit 3 through the imports map in `package.json`). Use plain Svelte with Vite for a single page with no routes of its own. Run the starter in an empty folder the developer chose.

```bash
npx sv create my-app --template minimal --types ts --no-add-ons --install npm
```

Then, in the new folder, `npm install motion` if the app needs it (see above), and for Tailwind `npx sv add tailwindcss` (or `npm install tailwindcss @tailwindcss/vite`, the plugin added to `plugins` in `vite.config.ts`, and `@import "tailwindcss";` at the top of the stylesheet that `+layout.svelte` imports).

```bash
npm create vite@latest my-app -- --template svelte-ts
```

Then `npm install`, and the same for Tailwind and Motion; the stylesheet is `src/app.css`.

Use the developer's package manager (its lockfile says which): `pnpm dlx sv create`, `yarn dlx sv create`, `bunx sv create`, and `pnpm create vite`, `yarn create vite`, `bun create vite`. The new `my-app` folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`. Motif never edits `package.json`, `svelte.config.*`, `vite.config.*`, `src/app.html`, `+layout.svelte` or `main.ts`; it prints the one step that wires the theme in ([theme code](tokens.md#wiring-it-in-once)).

## Folders

- **SvelteKit:** pages are `src/routes/**/+page.svelte`, wrapped by `+layout.svelte` files; server code is `+page.server.ts`, `+server.ts` and `src/hooks.server.ts`. Shared code is `src/lib/`, imported as `$lib/…` in SvelteKit 2 and as `#lib/…` in SvelteKit 3, which removed `$lib` (the starter's `package.json` maps `#lib/*` in `imports`; without that map, use a relative path).
- **Vite:** everything in `src/`: `src/App.svelte`, `src/main.ts`, shared components in `src/lib/`. Imports are relative.
- **Components:** `src/lib/components/` ([components](components.md)).
- **Mock data:** one file, `src/lib/mock-data.ts`, with obviously fictional content.
- **Theme code:** written by `motif tokens` in `src/lib/styles/` (`motif.css`, `motif.tailwind.css`) and `src/lib/design/motion.ts`.

`design/motif.json` can name a different theme folder with `themeDir`, a folder inside the project, written from the project's top, which wins over the defaults above; `srcDir` names the source folder when it isn't the usual one:

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "svelte", "srcDir": "src", "themeDir": "src/theme" }] }
```

## Build, type-check and run

- Build: `npm run build`.
- Type-check: `npx svelte-check` (in SvelteKit, `npm run check` runs `svelte-kit sync` first, which a fresh project needs). Run it after every change; it must report no errors.
- Run: `npm run dev`. `motif shot` starts the project's `dev` script itself (`vite dev`) and stops it when it's done, so don't leave a dev server running for it.
- Dependencies must be installed first; Motif says so, with the install line, when they aren't.

## Screenshots

- Routes come from SvelteKit's routes folder (a route group like `(app)` adds nothing to the address, `[[lang]]` is listed without its value, `+page@.svelte` resets the layout and still counts as a page) or from `svelte-spa-router` (hash routes: `/#/about`) or `svelte-routing`. A route with a parameter (`/orders/[id]`) needs a value, so Motif lists it as skipped; draw one with `--routes /orders/1`.
- Sizes are the phone widths (360, 390, 430), a tablet (768) and a desktop. State scripts are JavaScript ([checks](checks.md#screens-behind-a-form-or-a-click)).
- Time to the first screenshot on a cold start, dev server included, typical: SvelteKit 2 about 4 seconds, Svelte with Vite about 3 seconds, SvelteKit 3 about 4 seconds. A large SvelteKit app compiles each route on its first visit, so a long run takes more; use `--sizes 390` and `--routes` while working.
- Mockups for a Svelte or SvelteKit app are drawn in the preview kit's browser frame (`mk-browser`), as for any web app.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, wiring it in, dark mode, variants and fonts.
- [Components](components.md): building components the Svelte way, and the starter set.
- [Motion](motion.md): the motion roles in transitions, `Spring`, `Tween` and CSS.
- [Platform rules](platform.md): web conventions, right to left, server rendering.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and state scripts.
