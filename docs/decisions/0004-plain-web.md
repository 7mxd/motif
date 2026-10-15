# 0004 — Plain web is the first Part 2 adapter

- Date: 2026-10-15
- Status: Accepted
- Context: Motif's review of xBloom Recolor (one HTML page with no framework) on 2026-10-15 worked for the judgement half and the browser audit, and failed at every exact step: `doctor` found no app, `extract` and `check` refused it, `shot` couldn't start it or reach the editor behind its form ([the plain web spec](../specs/2026-10-15-motif-plain-web-design.md) §2). Real sites without a framework exist, and reading HTML and CSS is groundwork the Vue, Svelte and Angular adapters reuse.

## Decisions

1. **A ninth stack, `plain-web`, before the seven framework stacks.** A folder with an `index.html` (in itself, `public/`, `src/`, `site/` or `www/`) and no framework is a plain web site; that folder is its site folder (`srcDir`). Folders that hold apps, documentation, Motif's own files, templates, tests or reports never are, other UI libraries and static-site generators aren't plain web, and pages beside an app of another stack don't hide it.
2. **HTML is read as two views** of the same length: its CSS (`<style>` blocks and `style=""` attributes) and everything else. Every rule runs unchanged, positions stay exact, and React apps' `.html` files are read the same way.
3. **A site keeps its own variable names**, each defined from a role in its `:root` (`--bg: var(--motif-color-background)`), rather than a mapping table in `design/motif.json`: one place to change a colour, and no extra settings for `check`.
4. **`extract` pairs dark values on every stack**: a solid, single-colour variable set in a light block and in a dark-mode block gives its role a real dark value instead of a copy.
5. **`motif shot` serves a plain site's folder itself** (on 127.0.0.1, to its own Host only, checking real paths, never hidden files) and takes `--state <script>` for screens behind a form or a click.
6. **Screenshots at five sizes by default**: phones 360, 390 and 430 px wide, a tablet (768 px) and a desktop (1440 px), each in light and dark. The xBloom review's one regression, a fix that made table rows taller only on wider phones and pushed the live card preview away from its sliders, showed on a 430 px phone and not at 390 px, Motif's only phone size until then. The review mode now checks every fix at every size and keeps things people use together on one screen.

## Consequences

- The skill has a plain web stack guide (`skill/adapters/plain-web/`), and init, feature and review work on plain sites, with state scripts in `design/states/` for screens behind forms.
- Two fixtures (`tests/fixtures/plain-contract-site/` and `tests/fixtures/plain-seeded-site/`) and two eval cases (`b-plain`, `c-plain`) cover plain web the way Larder covers React. A plain site has nothing to build: `b-plain` checks that its new page loads in a browser instead.
- Static-site generators (Eleventy, Hugo, Jekyll, Astro) and sites that need a build step stay out of scope for now; `shot --url` still works for them.
