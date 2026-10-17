# Motif for Claude Code

Four short commands that start the Motif skill in Claude Code. The build copies them and the whole `skill/` folder into a plugin; each release attaches it as `motif-claude-code.zip`. (Motif's packages for other agents, in Part 3, come later.)

## Install

```
/plugin marketplace add 7mxd/motif
/plugin install motif@motif
```

You need Claude Code 2.1.224 or later and git.

## Develop

From the repository's `cli` folder, `bun run plugin` replaces `dist/claude-code/` with a fresh build. Run it again after changing anything in `skill/` or here, then type `/reload-plugins` in Claude Code. `bun run plugin:zip` zips it as a release does.

To try your build, point the skill at a local build of the tool:

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
