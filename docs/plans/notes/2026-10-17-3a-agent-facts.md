# What the agents do: checked before plan 3A builds on them

- Date: 2026-10-17, on Windows 11 (Git Bash), with each agent's CLI installed from npm into a scratch folder and run with a throwaway home (`HOME`, `USERPROFILE` and the agent's own variable). Nobody signed in.
- Versions: Codex CLI 0.163.0, GitHub Copilot CLI 1.0.98, Gemini CLI 0.64.0, OpenCode 1.19.3. Cursor's CLI wasn't run here (its Windows installer changes the user's PATH); CI checks it.
- The candidate package was exactly plan 3A's: `skills/motif/`, the Agent Plugins `plugin.json`, `gemini-extension.json`, Gemini TOML commands, and the marketplace files from Task 4 (plus a decoy `.claude-plugin/marketplace.json` naming a different marketplace, to see which file each agent reads).

## Codex 0.163.0

- `codex plugin marketplace add <folder>` read `.agents/plugins/marketplace.json`, not the decoy Claude Code file.
- `codex plugin add motif@motif` installed it; `codex plugin list` shows `motif@motif  installed, enabled  0.1.0`.
- The Agent Plugins `plugin.json` is enough: no `.codex-plugin/` manifest needed.
- Sources that worked: `{ "source": "local", "path": "./motif" }`, `{ "source": "local", "path": "./" }` (the plugin at the marketplace's own root), and `{ "source": "url", "url": "<git url>", "ref": "plugins" }` (installs the `plugins` branch).
- The skill lands in `$CODEX_HOME/plugins/cache/motif/motif/<version>/skills/motif` (`~/.codex/...` by default). `CODEX_HOME` must exist first.
- On Windows a git install clones under `$CODEX_HOME/plugins/.marketplace-plugin-source-staging/…`; with a very long home path git failed with "Filename too long". Normal home paths are fine.
- Codex prints a harmless warning when `CODEX_HOME` is under a temp folder ("could not create PATH aliases").

## GitHub Copilot CLI 1.0.98

- `copilot plugin marketplace add <folder>` read `.github/plugin/marketplace.json`, not the decoy.
- From a local folder marketplace with a local source (`./motif` or `./`), `copilot plugin install motif@motif` "enabled" it as a live plugin (loaded in place, never copied); `copilot plugin list` shows it under "Live Plugins", and `copilot skill list` lists `motif` under "Plugin skills".
- From a local folder marketplace whose plugin source is a git URL with `ref: "plugins"`: the install cloned the right branch into `$COPILOT_HOME/installed-plugins/motif/motif/` and reported success, but the next `copilot plugin list` or `copilot skill list` removed it again ("No plugins installed"; `config.json`'s `installedPlugins` emptied). Twice, in fresh homes. Whether this also happens with a marketplace added from GitHub (`copilot plugin marketplace add 7mxd/motif`) can't be checked locally: Copilot doesn't accept `file://` marketplaces (it treats them as paths). CI checks the GitHub form.
- The skill lands in `$COPILOT_HOME/installed-plugins/motif/motif/skills/motif` (`~/.copilot/...` by default) for copied installs.
- Copilot keeps marketplace clones and its own package cache in `%LOCALAPPDATA%\copilot`, outside `COPILOT_HOME`, so a throwaway home doesn't isolate those. (The ones these checks created were removed afterwards.)

## Gemini CLI 0.64.0

- `gemini extensions validate <folder>` passes the package as built.
- Installing from a local folder asks "Do you trust the files in this folder?"; `--consent` doesn't answer it, and without a terminal it waits forever. Git installs also check that the current folder is trusted. In a throwaway home, `{"security":{"folderTrust":{"enabled":false}}}` in `~/.gemini/settings.json` skips both; then `gemini extensions install <folder> --consent --skip-settings` works.
- `gemini skills list` shows `motif [Enabled]` with its location; `gemini extensions list -o json` works too but prints every skill's full text.
- The extension lands in `~/.gemini/extensions/motif`, so the skill is `~/.gemini/extensions/motif/skills/motif`. (`GEMINI_CLI_HOME` moves `~`.)
- **Every skill is also a slash command**: Gemini's `SkillCommandLoader` turns the `motif` skill into `/motif`, which activates it and sends the developer's words as the prompt ("Use the skill motif" when there are none).
- Extension commands are named by their path with a colon (`commands/motif/design.toml` → `/motif:design`); only on a clash is a name renamed, by putting `motif:` in front.
- `file://` URLs count as local folders, and `--ref` isn't allowed for those, so the `--ref plugins` branch install is checked in CI against GitHub.

## OpenCode 1.19.3

- `opencode debug paths` on Windows, with no `XDG_*` variables: config `%USERPROFILE%\.config\opencode`, data `%USERPROFILE%\.local\share\opencode`, cache `%USERPROFILE%\.cache\opencode` — the same layout as macOS and Linux.
- A skill copied to `<config>/skills/motif` is listed by `opencode debug skill` (JSON) as `motif`, at `<config>\skills\motif\SKILL.md`.
- OpenCode's npm install step created an empty `~/.config/opencode` in the real home folder (it ran without the throwaway home). It was removed afterwards. So an empty config folder can mean "OpenCode was installed once", which is still a fair reason for the install script to choose OpenCode.

## Changes to the plan

1. **Task 3:** no `commands/motif.toml`. Gemini already makes the `motif` skill `/motif`; a command of the same name would clash and one of them would become `/motif:motif`. The four `commands/motif/*.toml` stay (`/motif:design` and the rest). The test for the top-level command is dropped.
2. **Task 4:** the package also carries each agent's marketplace file with its plugin at the package's own root (`agentMarketplaces({ local: "./" })`), so `codex plugin marketplace add 7mxd/motif --ref plugins`, `copilot plugin marketplace add 7mxd/motif#plugins` and `cursor-agent plugin marketplace add … --git-ref plugins` work as a fallback without another release, if CI shows an agent can't install from `main`'s marketplace (Copilot is the one to watch).
3. **Task 8:** the Gemini check writes `{"security":{"folderTrust":{"enabled":false}}}` to `<home>/.gemini/settings.json` before installing. The Copilot check lists with `copilot skill list` (it names the skill under "Plugin skills"), not `copilot plugin list`.
4. **Task 2 (`skill/agents.md`):** the paths above are confirmed for Codex, Copilot, Gemini CLI and OpenCode (Windows included); Cursor's stays a search hint until CI or the hands-on test.
