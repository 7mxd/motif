# Motif for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode

The files here, with `skill/`, make the package every agent but Claude Code installs Motif from. Each release builds it and commits it to the `plugins` branch; people install it as [the README](../../README.md#install) says. Nobody edits the plugins branch by hand.

- `commands/motif/` are Gemini CLI's `/motif:design`, `/motif:init`, `/motif:feature` and `/motif:review`. Gemini makes the `motif` skill itself `/motif`.
- `opencode/commands/motif.md` is OpenCode's `/motif` command, which `install.sh` and `install.ps1` add.
- `branch-README.md` becomes the plugins branch's README.

## Build

From the repository's `cli` folder:

- `bun run packages` builds `dist/agents/` (the package, with each agent's marketplace file pointing at itself) and `dist/agents-local/` (a local marketplace holding it as `motif/`, for every agent with a plugin system).
- `bun run skill:archives` builds `dist/motif-skill.zip` and `dist/motif-skill.tar.gz`, which the install scripts download.

## Try a build

Point the skill at a local build of the tool first: in `cli`, run `bun run build`, which writes `dist/motif` (`dist\motif.exe` on Windows) at the repository's root, then set `MOTIF_BIN` to that file in the terminal you start the agent from. Then:

- **Codex:** `codex plugin marketplace add <repo>/dist/agents-local`, then `codex plugin add motif@motif`.
- **GitHub Copilot CLI:** `copilot plugin marketplace add <repo>/dist/agents-local`, then `copilot plugin install motif@motif`. A local marketplace is loaded in place, so a rebuild shows up in the next session.
- **Cursor CLI:** `cursor-agent plugin marketplace add <repo>/dist/agents-local`, or start it with `--plugin-dir <repo>/dist/agents`.
- **Gemini CLI:** `gemini extensions link <repo>/dist/agents` (a link, so a rebuild shows up at once). Gemini asks whether you trust the folder first.
- **OpenCode, or any agent that reads `~/.agents/skills`:** copy `dist/agents/skills/motif` into `~/.config/opencode/skills/` or `~/.agents/skills/`. The install scripts (`install.sh`, `install.ps1` at the repository's root) do the same from a release.

Remove a marketplace or extension when you're done (`codex plugin marketplace remove motif`, `gemini extensions uninstall motif`, and so on).

## Check every agent

`bun scripts/agent-checks.ts --source local` installs the build in each agent whose CLI is on your PATH, in a throwaway home, and checks that it lists the motif skill (`--agents codex,gemini` picks some). Nobody signs in, except to Cursor: its CLI needs a sign-in even to add a marketplace, so its check runs only with a Cursor API key in `MOTIF_CURSOR_API_KEY` (CI passes the repository secret `CURSOR_API_KEY`), which the script gives to Cursor's command alone. CI runs it on every push (`.github/workflows/agents.yml`), and after each release from GitHub on Windows, macOS and Linux.

Some agents keep a cache outside their home folder (Copilot CLI in `%LOCALAPPDATA%\copilot` on Windows), so a local run can leave files there.
