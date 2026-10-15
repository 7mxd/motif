# Motif — Plain web support (Part 2, first adapter)

- Date: 2026-10-15
- Status: Draft for review
- Builds on: `docs/specs/2026-10-12-motif-core-design.md` (the core spec: contract §6, modes §7, tool §10, adapter model §5.3 and §11)
- Evidence: Motif's review of xBloom Recolor on 2026-10-15, kept in `C:\Users\PC\motif-proof\xbloom-recolor-2026-10-15\` (README, screenshots, report)

## 1. Summary

Motif fully supports React web apps today. A site written as plain HTML, CSS and JavaScript, with no framework, is invisible to it: `motif doctor` says "No app found", `motif extract` and `motif check` refuse to run, `motif shot` can't start it, and the CSS inside an HTML page is read as if it were JavaScript. This spec adds **plain web** as Motif's ninth stack, with the same two halves as React web: exact support in the `motif` tool and a stack guide in the skill. It is the first adapter of Part 2, and its HTML and CSS handling is the groundwork the Vue, Svelte and Angular adapters will reuse.

## 2. What the xBloom Recolor review showed

Running Motif's review on a real single-page site (one `public/index.html` with an inline `<style>` and `<script>`, served by a small Node server) worked for the judgement half and the browser audit, and failed at every exact step:

1. `motif extract` and `motif check` only run on React apps, so the design guide was written by hand from the CSS, and nothing checks that the page keeps to it.
2. `motif doctor` reported no app; `motif check` told the developer to run `motif extract`, which can't run either. A beginner hits a dead end.
3. `motif shot` couldn't start the site (it needed `--url` and a server started by hand) and couldn't reach the editor, a state that only appears after a form is submitted; a helper script built on Motif's own browser code had to capture it.
4. `motif tokens` writes plain CSS variables, but nothing says how a page's own `<style>` should use them.

## 3. Goals and non-goals

**Goals**

- A plain web site is recognised, and every `motif` command supports it fully: `doctor`, `validate`, `tokens`, `check`, `extract`, `shot` (with `--audit`, `--save`, `--against`) and `preview`.
- CSS is read where it really is: `.css` files, `<style>` blocks and `style=""` attributes, with exact file, line and column.
- An existing site keeps its own CSS variable names: it maps them onto the design guide once, and from then on `motif check` holds it to the guide.
- Screenshots of plain sites need no server of the developer's, and can reach states behind a form or a click.
- No command ends in a dead end: every refusal says what to do next, in plain words.
- The skill has a plain web stack guide, and the modes (`init`, `feature`, `review`) work on plain sites.
- Fixtures and eval cases for plain web, like Larder for React.

**Non-goals**

- Static-site generators with their own template languages (Eleventy, Hugo, Jekyll, Astro). Their output is plain web, but their sources aren't; they come later, if asked for.
- Sites that need a build step to run at all (TypeScript in the browser, Sass): `check` and `extract` still read their sources, but `shot` needs their dev server and `--url`.
- CSS frameworks loaded from a CDN (Bootstrap, Tailwind's Play CDN) get the plain-CSS rules only.
- Springs in plain CSS. Plain web uses the duration and easing roles; springs stay available to JavaScript through `design/generated/tokens.flat.json`.

## 4. What counts as a plain web app

A folder is a plain web app when all of these hold:

- Motif's existing detection finds no other stack in it (no React, Vue, Svelte, Angular, React Native, Flutter, SwiftUI or Compose).
- It isn't React code Motif can't place (the existing "unrecognised React app" case still asks for `design/motif.json`).
- It has an `index.html` in one of these folders, checked in this order: the folder itself, `public/`, `src/`, `site/`, `www/`. That folder is the app's **site folder** (`srcDir` in `design/motif.json`).

A `package.json` may exist (a small server, or Vite without a framework). Folders named `docs/`, `design/`, `node_modules/` and build output are never site folders. `design/motif.json` can always say `{ "path": ".", "stack": "plain-web", "srcDir": "<folder>" }` to settle an unusual layout.

The stack id is `plain-web`; its label is "Plain web (HTML and CSS)". Monorepo scanning (`apps/`, `packages/`) finds plain web apps the same way as other stacks.

## 5. Theme code (`motif tokens`)

- `motif tokens` writes **`<site folder>/motif.css`**: the same generated stylesheet React web gets (every role as a `--motif-*` variable; light by default, dark from the system setting unless `data-theme="light"`, dark when `data-theme="dark"`; CSS animations stopped under reduced motion). It is marked as generated, so `check` warns when it's edited by hand.
- It also writes `design/generated/tokens.flat.json` (every value, including springs, for scripts).
- Its output tells the developer the one wiring step: add `<link rel="stylesheet" href="motif.css">` in each page's `<head>`, before the page's own styles (the path relative to the page).
- Fonts: the output lists the theme's fonts; the stack guide shows how to load them in a plain page (a `<link>` to Google Fonts, or self-hosted `@font-face` files in the site folder).

## 6. Checking plain sites (`motif check`)

**Where CSS is read**

- `.css` files, as today.
- In `.html` files: each `<style>` block and each `style="…"` attribute is read as CSS, with positions in the HTML file. `<script>` blocks and `.js` files are read as scripts, as today (hex colours in strings, colour functions). `<meta name="theme-color">` stays exempt.
- Inline styles set from scripts (`el.style.background = "#fff"`) are found by the existing script rules.

**Rules on plain web**

| Rule | On plain web |
|---|---|
| `raw-color` | Colour literals in CSS, `<style>`, `style=""` and scripts |
| `off-scale` | Spacing, corner and text sizes off the design guide's scales |
| `raw-font` | Font families other than the theme's (`@font-face` declarations are allowed) |
| `raw-motion` | Durations and easings in transitions and animations |
| `primitive-use` | `--motif-primitive-*` used directly |
| `reduced-motion` | Animations or transitions with no reduced-motion handling anywhere (the generated `motif.css` counts) |
| `generated-edited` | `motif.css` changed by hand |
| `tailwind-*` | Not on plain web |

**A page's own variables.** A site may keep its own variable names. Each one is defined from a design guide role, and then it's a theme value like any other:

```css
:root {
  --bg: var(--motif-color-background);
  --surface: var(--motif-color-surface);
  --muted: var(--motif-color-text-secondary);
}
```

A variable defined with a literal (`--bg: #f2f2f7`) is a `raw-color` hit, as today; once it points at a role, every `var(--bg)` in the page is fine. The page's dark-mode blocks disappear, because `motif.css` switches the roles. (This is how "the design guide maps them" works in practice: the mapping lives in the page's own `:root`, so the page, the guide and `check` agree, and there is one place to change a colour.)

**Allowed exceptions** stay as they are: a `motif-ok: <reason>` comment (`/* … */` in CSS, `<!-- … -->` in HTML, `//` in scripts) on the line or the line above. xBloom Recolor's card colours, which are the user's data, are the example the stack guide uses.

## 7. Drafting a design guide (`motif extract`)

- `extract` runs on plain web apps, reading the same places `check` reads.
- **Dark mode is read, for every stack.** A colour declared inside a dark-mode block (`@media (prefers-color-scheme: dark)`, `[data-theme="dark"]`, `.dark`, `:root:not([data-theme="light"])` inside that media query) is recorded as a dark value. When a variable is declared in both a light and a dark block, the draft pairs them, so a role gets its real dark value instead of a copy of the light one. The report says which roles got real dark values and which were copied.
- The draft's notes name the variables the page defines, so the agent can map them onto roles (section 6).

## 8. Screenshots (`motif shot`)

**Serving.** For a plain web app, `motif shot` serves the site folder itself on `127.0.0.1` (the preview server's static serving: no dotfiles, no paths outside the folder) and stops it afterwards. No developer server, no `.env`, nothing installed. `--url` still works for sites that need their own server (API calls a screen depends on, a build step).

**Pages.** Every `.html` file in the site folder is a page (`index.html` → `/`, `about.html` → `/about.html`, `blog/index.html` → `/blog/`), up to the existing limit; `--routes` chooses others.

**States behind a form or a click.** `--state <file.js>` (repeatable) runs a script in each page after it loads and before it's captured; the file name names the state. `--state design/states/editor.js` captures `/` and `/` in the editor state, saved as `index.png` and `index@editor.png` (with the viewport and scheme in the name as today). The script runs in the page only (it can click, fill fields, call the page's own functions, or wait for something), and is the developer's own file, usually kept in `design/states/`. Errors in it are reported like page errors. `--audit`, `--save` and `--against` include states. This works for React apps too.

## 9. Doctor and messages

- `motif doctor` reports a plain web app as fully supported, with its site folder.
- `motif check` with no design guide: on stacks `extract` supports, "Draft one with `motif extract`"; on others, "Ask your agent to start one (Motif's review drafts it from your code)". Never a command that can't run.
- `motif extract` on a stack it doesn't support yet names the stack and says the review mode drafts the guide by hand meanwhile.
- `motif shot` on a stack it can't start says to run the app and pass `--url`, as today; plain web no longer needs it.

## 10. The skill

- **Stack guide** `skill/adapters/plain-web/` with the template's six files:
  - `README.md`: recognising a plain site, the site folder, starting one (`index.html`, `styles.css`, `app.js`, no build step; or Vite without a framework when the developer wants a dev server), building nothing, and testing with the browser.
  - `tokens.md`: linking `motif.css`; using `var(--motif-*)` in CSS; mapping a site's own variables (section 6); loading fonts.
  - `components.md`: components as HTML patterns with CSS classes (`.button`, `.field`, `.card`), every state through CSS (`:hover`, `:focus-visible`, `:disabled`, `[aria-busy]`, `[aria-invalid]`), the starter set adapted from React web's.
  - `motion.md`: CSS transitions and keyframes with the duration and easing roles; the View Transitions API where supported; reduced motion.
  - `platform.md`: semantic HTML first, native elements before ARIA, forms that work without JavaScript where possible.
  - `checks.md`: each rule's plain web fix, and how to write a state script for `motif shot --state`.
- **SKILL.md and modes:** list plain web among the stacks; `init` offers "a simple web page (no framework)" as a stack choice; `feature` and `review` point at the stack guide's components and checks; `review` writes state scripts for screens behind forms (`design/states/`) so before-and-after pictures cover them.

## 11. Fixtures and evals

- `tests/fixtures/plain-contract-site/`: an original one-page tool (made-up brand, mock data in a script), following the plain web guide: `motif.css` linked, its own variables mapped to roles, every state reachable by a state script. `validate` and `check` clean; `shot --audit` clean.
- `tests/fixtures/plain-seeded-site/`: the same site with at least 12 planted problems (at least 7 that the tool finds, at least 5 that need judgement), listed in `seeded-issues.json` with the same location rules as the React seeded app. Self-tests in CI, like the React fixtures.
- The eval runner gets two cases: `b-plain` (add a feature to the contract site) and `c-plain` (review the seeded site), graded with the same rules and thresholds as tests B and C. Test D's "zero accounts" covers them too.

## 12. Changes to the core spec

- §4 and §16: plain web joins the stacks as the ninth, delivered first in Part 2. A decision record (`docs/decisions/0004-plain-web.md`) records why: real sites without frameworks exist (xBloom Recolor), and the HTML and CSS reading serves Vue, Svelte and Angular next.
- §11.5's rule list gains the plain web column above; §10.2's `shot` gains `--state`.

## 13. Testing

- Unit: detection (each site-folder layout, no false positives on docs sites or other stacks), HTML scanning (positions inside `<style>` and `style=""`, comments, `<meta>`), dark-mode pairing in `extract`, `motif.css` placement and wiring message, route discovery from `.html` files, state file naming.
- Integration: the compiled tool runs `doctor`, `tokens`, `check`, `extract` and `shot --audit --state` on the plain fixtures (the shot tests run where a browser is available, as today).
- Fixture self-tests in CI; eval cases run on demand (decision 0003).

## 14. Delivery

Two plans, each built and reviewed like Part 1's:

- **Plan 2A — the tool:** detection, HTML scanning, `check` and `extract` on plain web, dark-mode pairing, `tokens` output, `shot` serving and `--state`, `doctor` and the messages.
- **Plan 2B — the skill and the evals:** the plain web stack guide, SKILL.md and mode changes, the two fixtures with self-tests, the two eval cases, the core spec and decision record updates.

When 2A lands, xBloom Recolor's `motif-review` branch is re-checked with `motif check` as a real-world test (on the developer's say-so), with its own variables mapped as in section 6.

## 15. Open questions

None blocking. Two choices this spec makes that the developer may want to change:

1. A site's own variables are mapped in its CSS (`--bg: var(--motif-color-background)`), not in a table in `design/motif.json`. One place to change a colour, and `check` needs no extra settings; the cost is a one-time edit of the page's `:root` block.
2. The plain seeded site has 12 planted problems, not the React one's 23, to keep it small; the pass thresholds (percentages) are the same.
