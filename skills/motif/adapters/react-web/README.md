# React web

How Motif works with React apps on the web: what it expects, how to start a project, and where things live.

## What Motif expects

- React 18 or later, with TypeScript.
- Next.js (App Router) or Vite.
- Tailwind CSS v4, or plain CSS. Tailwind v3 projects get CSS variables only; [theme code](tokens.md) explains how to use them.
- Motion (`motion/react`) for animation.
- shadcn/ui when the project already uses it. Otherwise, Radix primitives (`radix-ui`) wherever accessibility needs them: menus, dialogs, selects, tabs.

## How Motif recognises it

An app with `react` and `react-dom` in its `package.json`, plus `next` or `vite`, is a React web app. `motif doctor --json` lists it in `apps` with the stack `react-web`. In a monorepo, `design/motif.json` maps each app's folder to its stack.

## Starting a new project

Next.js is the default. Use Vite with React when the developer asks for a single-page app. Use the developer's package manager: swap `--use-npm` for `--use-pnpm`, `--use-yarn` or `--use-bun`.

Next.js:

```bash
npx create-next-app@latest my-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-agent-feedback --yes
```

`--no-agent-feedback` stops Next.js preparing feedback from the coding session; Motif shares nothing.

Vite, then Tailwind:

```bash
npm create vite@latest my-app -- --template react-ts --no-interactive
npm install tailwindcss @tailwindcss/vite
```

Then add `tailwindcss()` to `plugins` in `vite.config.ts` (imported from `@tailwindcss/vite`), and put `@import "tailwindcss";` at the top of `src/index.css`.

For both, add Motion:

```bash
npm install motion
```

Add `npm install radix-ui` when the first component needs a primitive. Run each command from the folder the developer chose, and move into the new project folder before the ones that follow `create`.

## Folders

- **Next.js:** pages in `src/app/`, one folder per route with a `page.tsx`; the shared layout in `src/app/layout.tsx`.
- **Vite:** everything in `src/`, with routes from whichever router the project uses.
- **Components:** `src/components/` (shadcn/ui projects: `src/components/ui/`).
- **Mock data:** one file, `src/mock-data.ts`, with obviously fictional content.
- **Theme code:** `src/styles/` and `src/design/`, written by `motif tokens`.

## Build, type-check and run

- Build: `npm run build`.
- Type-check: `npx tsc --noEmit`.
- `motif shot` starts the project's `dev` script itself and stops it when it's done, so don't leave a dev server running for it.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, wiring it in, dark mode and fonts.
- [Components](components.md): building components and the starter set.
- [Motion](motion.md): the motion roles in Motion.
- [Platform rules](platform.md): web conventions and accessibility specifics.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report.
