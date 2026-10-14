# Motif for Claude Code (development plugin)

Four short commands that start the Motif skill in Claude Code. The build copies them and the whole `skill/` folder into `dist/claude-code/`, a plugin Claude Code can load. (Motif's packages for every agent, in Part 3, will replace this.)

## Build it

From the repository's `cli` folder:

```bash
bun run plugin
```

This replaces `dist/claude-code/` with a fresh copy. Run it again after changing anything in `skill/` or here, then type `/reload-plugins` in Claude Code.

## Try it

Until Motif's first release is published, point the skill at a local build of the tool:

1. In `cli`, run `bun run build`. It writes `dist/motif` (`dist/motif.exe` on Windows).
2. Start Claude Code in your app's folder with `MOTIF_BIN` set to that file and the plugin loaded:
   - macOS, Linux or Git Bash: `MOTIF_BIN=/path/to/motif/dist/motif claude --plugin-dir /path/to/motif/dist/claude-code`
   - PowerShell: first `$env:MOTIF_BIN = "C:\path\to\motif\dist\motif.exe"`, then `claude --plugin-dir C:\path\to\motif\dist\claude-code`

## Commands

| Type | To |
|---|---|
| `/motif:design` | Say what you'd like to do; Motif picks the right mode (plain `/design` can be Claude Code's own design skill) |
| `/motif:init` | Start a new app (plain `/init` is Claude Code's own command) |
| `/feature` | Add a screen or flow that matches your app (`/motif:feature` works too) |
| `/motif:review` | Review and improve your app's look (plain `/review` is Claude Code's own command) |

Claude also uses Motif by itself when you ask for design work ("make this screen look better"), through the main `motif` skill.
