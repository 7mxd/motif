<p align="center"><img src="docs/cover.png" alt="Motif: the title and &quot;A design guide your coding agent follows&quot; beside two phones showing its sample site in light and dark, a card with that site's design guide colours, and a terminal card with Motif's checks passing"></p>

# Motif

Design guide tools for AI coding agents: build web and mobile apps with polished UI, UX and motion — and keep them consistent as your app and team grow.

> **Preview (v0.2.0).** Motif works in Claude Code today, for React web apps and plain web sites. Packages for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode come with this release; more stacks and the first full release come next.

## Install

In Claude Code:

```
/plugin marketplace add 7mxd/motif
/plugin install motif@motif
```

Then ask for design work ("make this screen look better"), or type `/motif:design`.

You need Claude Code 2.1.224 or later and git. The first time Motif runs, it downloads its tool (about 100 MB) from the [release](https://github.com/7mxd/motif/releases/tag/v0.1.0) and checks it against the release's checksums. See the [release notes](docs/releases/v0.1.0.md), or [build and try the plugin from source](plugin/claude-code/README.md).

## The `motif` tool

| Command | What it does |
|---|---|
| `motif doctor` | Explains what works on this computer and what's optional |
| `motif connect` | Connects optional design sources (Motion, Refero, 21st.dev, 60fps.design) to the coding agents you choose, for all your projects; keys are typed only in your own terminal |
| `motif validate` | Checks your design guide (`DESIGN.md` + `design/tokens.json`); `--tokens <file>` checks one theme values file, such as a design direction's |
| `motif tokens` | Turns your design guide into theme code (React web: CSS variables, a Tailwind v4 theme, Motion timings; plain web sites: `motif.css` in the site folder); `--stack preview` writes the CSS mockups use |
| `motif check` | Finds colours, sizes and animations in your code that bypass your design guide |
| `motif extract` | Drafts a design guide from an existing app's code |
| `motif preview` | Shows mockups in your browser with live reload and saves them as PNGs in light and dark; `--compare` puts several side by side, `--gallery` shows the 8 starting styles; mockups show your theme's real fonts |
| `motif shot` | Screenshots your real app's pages at three phone sizes (360, 390 and 430 px wide, as tall as a phone browser shows), a tablet and a desktop, in light and dark (starting its dev server if needed, or serving a plain web site's folder itself); `--state <script>` also captures states behind a form or a click; `--audit` checks contrast, tap-target sizes and reduced motion as rendered; `--against` puts them side by side with the mockup while you build, or with an earlier run (`--save before`) after a rebuild |
| `motif browser` | Shows which browser previews use; `motif browser install` downloads a private one if you have none |

Add `--json` for machine-readable output and `--cwd <folder>` to run elsewhere. In a project with several apps, `--app <path>` picks one.

Full support today: React web apps, and plain web sites (HTML, CSS and JavaScript without a framework: a folder with an `index.html` in it, `public/`, `src/`, `site/` or `www/`). `motif check` and `motif extract` read CSS where it is, including `<style>` blocks and `style=""` attributes.

Previews and screenshots run on your computer only: the preview server listens on `127.0.0.1`, serves nothing outside your project, and nothing is uploaded. Screenshots of your app go to `design/shots/`, which Motif keeps out of git. Motif uses the Chrome or Edge you already have; it downloads a browser only when you run `motif browser install`. The 8 starting styles' fonts come with Motif; any other font your theme names is loaded from Google Fonts by your browser while previewing.

Design: `docs/specs/2026-10-12-motif-core-design.md` · Plans: `docs/plans/`
