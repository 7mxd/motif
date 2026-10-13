# Motif

Design guide tools for AI coding agents: build web and mobile apps with polished UI, UX and motion — and keep them consistent as your app and team grow.

> Work in progress. The agent skill (`/design`, `/init`, `/feature`, `/review`) comes next; today Motif ships its command-line tool.

## The `motif` tool

| Command | What it does |
|---|---|
| `motif doctor` | Explains what works on this computer and what's optional |
| `motif validate` | Checks your design guide (`DESIGN.md` + `design/tokens.json`) |
| `motif tokens` | Turns your design guide into theme code (React web: CSS variables, a Tailwind v4 theme, Motion timings); `--stack preview` writes the CSS mockups use |
| `motif check` | Finds colours, sizes and animations in your code that bypass your design guide |
| `motif extract` | Drafts a design guide from an existing app's code |
| `motif preview` | Shows mockups in your browser with live reload and saves them as PNGs in light and dark; `--compare` puts several side by side, `--gallery` shows the 8 starting styles |
| `motif browser` | Shows which browser previews use; `motif browser install` downloads a private one if you have none |

Add `--json` for machine-readable output and `--cwd <folder>` to run elsewhere. In a project with several apps, `--app <path>` picks one.

Previews run on your computer only: the preview server listens on `127.0.0.1`, serves nothing outside your project, and nothing is uploaded. Motif uses the Chrome or Edge you already have; it downloads a browser only when you run `motif browser install`.

Design: `docs/specs/2026-10-12-motif-core-design.md` · Plans: `docs/plans/`
