# Motif

Design guide tools for AI coding agents: build web and mobile apps with polished UI, UX and motion — and keep them consistent as your app and team grow.

> Work in progress. The agent skill (`/design`, `/init`, `/feature`, `/review`) comes next; today Motif ships its command-line tool.

## The `motif` tool

| Command | What it does |
|---|---|
| `motif doctor` | Explains what works on this computer and what's optional |
| `motif validate` | Checks your design guide (`DESIGN.md` + `design/tokens.json`) |
| `motif tokens` | Turns your design guide into theme code (React web: CSS variables, a Tailwind v4 theme, Motion timings) |
| `motif check` | Finds colours, sizes and animations in your code that bypass your design guide |
| `motif extract` | Drafts a design guide from an existing app's code |

Add `--json` for machine-readable output and `--cwd <folder>` to run elsewhere. In a project with several apps, `--app <path>` picks one.

Design: `docs/specs/2026-10-12-motif-core-design.md` · Plans: `docs/plans/`
