# Plain web

How Motif works with a site made of HTML, CSS and JavaScript and no framework: what it expects, how to start one, and where things live.

## What Motif expects

- Pages written as `.html` files, styles in `.css` files and `<style>` blocks, behaviour in `.js` files.
- No build step: the browser opens the files as they are. Vite without a framework is fine when the developer wants a dev server.
- Modern browsers: CSS variables, `:has()`, `<dialog>` and `:focus-visible` are all available.
- No CSS framework. A site that loads one from a CDN (Bootstrap, say) gets only the plain CSS rules.

## How Motif recognises it

A folder is a plain web site when it has an `index.html` (or `index.htm`) and no framework in its `package.json` (a small server, or Vite on its own, is fine). The first of these folders with one is the **site folder**, where the pages live: the project folder itself, then `public/`, `src/`, `site/` and `www/`. `motif doctor --json` lists the site with the stack `plain-web` and says where its pages are; `design/motif.json` records it as `srcDir`, and can name another folder for an unusual layout:

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "plain-web", "srcDir": "pages" }] }
```

Folders named `docs/`, `design/`, `templates/` and `test/` are never taken for a site.

## Starting a new project

Create a folder named after the site, and in it:

- `index.html`: the first page, linking the stylesheets in this order: `motif.css`, then `components.css`, then `styles.css`.
- `components.css`: the shared components ([components](components.md)).
- `styles.css`: the page layout, and the site's own names for roles if it has any ([theme code](tokens.md)).
- `app.js`: the page's behaviour, loaded with `defer`.
- `mock-data.js`: every piece of made-up content, in one file.

A starting `index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Site name</title>
  <link rel="stylesheet" href="motif.css">
  <link rel="stylesheet" href="components.css">
  <link rel="stylesheet" href="styles.css">
  <script src="mock-data.js" defer></script>
  <script src="app.js" defer></script>
</head>
<body>
  <main class="page">
    <h1 class="page-title">Site name</h1>
  </main>
</body>
</html>
```

`motif tokens` writes `motif.css` beside it. When the developer wants a dev server with live reload, start the site with Vite instead, then put the files above in the folder it makes:

```bash
npm create vite@latest my-site -- --template vanilla --no-interactive
```

## Folders

- **The site folder:** the pages (`index.html`, `about.html`, `blog/index.html`), `motif.css`, `components.css`, `styles.css`, `app.js` and `mock-data.js`.
- **Fonts:** `fonts/` in the site folder, with each font's licence ([theme code](tokens.md#fonts)).
- **The design guide:** `DESIGN.md` and `design/` beside the site folder (or in it, when the site folder is the project folder). State scripts for `motif shot` go in `design/states/` ([checks](checks.md#screens-behind-a-form-or-a-click)).

## Build, type-check and run

- There's nothing to build or type-check. Open the page in a browser to try it.
- `motif shot` serves the site folder itself on this computer and captures every `.html` page; nothing needs to be running. Use `--url` only for a site that needs its own server (API calls the pages depend on, a build step).
- Each page is a screen: `index.html` is `/`, `about.html` is `/about.html`, `blog/index.html` is `/blog/`.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, linking it, the site's own variables, dark mode and fonts.
- [Components](components.md): building components with HTML and CSS, and the starter set.
- [Motion](motion.md): the motion roles in CSS and JavaScript.
- [Platform rules](platform.md): semantic HTML, forms and accessibility.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and state scripts.
