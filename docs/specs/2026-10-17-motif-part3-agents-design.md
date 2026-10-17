# Motif — Packages for other agents (Part 3)

- **Date:** 2026-10-17
- **Status:** Draft for review
- **Owner:** 7mxd
- **Scope:** Part 3 of the [core spec](2026-10-12-motif-core-design.md) (§4): Motif in Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode, plus any other agent that reads Agent Skills, and `motif connect` / `doctor` for all of them. Ships as v0.2.0, a pre-release. More stacks (the rest of Part 2) and Test A (Part 4) stay out; the agent evals stay at the end, run in Claude Code as today.

---

## 1. Goal

Anyone using one of the six agents installs Motif with the agent's own commands (or one line for OpenCode), gets updates when a release is published, and starts it the same way everywhere. Motif fetches its tool on first use exactly as it does in Claude Code today.

Today only Claude Code can install Motif ([v0.1.0 spec](2026-10-17-motif-v0.1.0-release-design.md)); `motif connect` sets design sources up only for Claude Code, and `doctor` only reads Claude Code's settings.

**Done means:**

1. The GitHub release `v0.2.0`, marked **Pre-release**, holds everything v0.1.0 had plus `motif-skill.zip` and `motif-skill.tar.gz`, and the `plugins` branch holds the v0.2.0 package (§3).
2. A post-release check passes on Windows, macOS and Linux for every agent: Motif installs from GitHub exactly as the README says, the agent lists the `motif` skill, and the installed skill's bootstrap runs `doctor` (§9). Cursor's CLI only adds the marketplace (installing the plugin happens in Cursor), and on Windows and Linux only: it can't keep its sign-in on CI's macOS machine.
3. `motif connect <source>` sets a source up in each agent found on the computer that the developer picks, and `doctor` reports which agents have each source (§7).
4. The README tells people how to install Motif in each agent (§10).
5. Nothing is tagged, published or pushed without the developer's approval at each step (§9.3).

## 2. Decisions

| Question | Decision |
|---|---|
| Where the other agents install from | A `plugins` branch that CI rebuilds at each release. It holds only the built package, so installs are small and always match a published tool version. `main` stays the source. |
| Claude Code | Unchanged: its checksum-pinned release zip and marketplace, updated after each release as for v0.1.0. |
| How people start Motif | `/motif` in Cursor, Copilot, Gemini CLI and OpenCode, `$motif` in Codex: on its own it asks what they'd like to do, with words it goes straight there. Gemini also gets `/motif:design`, `/motif:init`, `/motif:feature` and `/motif:review`, like Claude Code. No command clashes with an agent's own `/init` or `/review`. |
| OpenCode and agents without plugins | Motif's own install script (`install.sh`, `install.ps1`): it downloads the skill from the release, checks it against `SHA256SUMS`, and installs it where OpenCode reads skills, or in the shared `~/.agents/skills`. |
| Design sources | `motif connect` and `doctor` cover every agent (§7). |
| Checks | Install checks without signing in to any account: on Linux on every push, on Windows, macOS and Linux after each release. Cursor's CLI needs a sign-in even to add a marketplace, so it's checked after each release only, with an API key from a repository secret. Hands-on use in Cursor, Gemini CLI and Copilot at the end, with the evals. |
| Delivery | One spec, two plans built back to back: 3A packages, install script and release; 3B `connect` and `doctor`. Released together as v0.2.0. |

## 3. The package

`bun run packages` (in `cli/`) builds `dist/agents/` from `skill/` and the files in `plugin/agents/`:

```
dist/agents/
├── skills/motif/              skill/ as is (SKILL.md, VERSION, bin/, modes/, knowledge/, …)
├── plugin.json                Agent Plugins 1.0 manifest, read by Codex, Cursor, Copilot and VS Code
├── gemini-extension.json      Gemini CLI extension manifest
├── commands/motif/            Gemini: /motif:design, /motif:init, /motif:feature, /motif:review
├── .agents/plugins/, .cursor-plugin/, .github/plugin/   each agent's marketplace, pointing at this package itself
├── README.md                  what this branch is, how to install, "built from main at v<version>; don't edit"
├── LICENSE
└── THIRD-PARTY-NOTICES.txt
```

- **`plugin.json`** follows [Agent Plugins 1.0](https://agent-plugins.org): `$schema`, `name: "motif"`, `version` (from `skill/VERSION`), `description`, `author`, `homepage`, `repository`, `license`, and `keywords`; Agent Plugins finds `skills/` without it being named. It declares no MCP servers: design sources are optional and set up by `motif connect` (§7).
- **An agent's own manifest** (`.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.github/plugin/plugin.json`) is added only where that agent's install check (§9) shows it needs one.
- **`gemini-extension.json`**: `name: "motif"`, `version`, `description`. No context file (nothing is added to every Gemini session) and no MCP servers. Gemini reads the skill from `skills/` and the commands from `commands/`.
- **Gemini commands** are TOML. Each tells the model to activate the `motif` skill, read its `SKILL.md`, and (for the four namespaced ones) follow that mode's file, with the developer's words from `{{args}}`. Gemini makes the `motif` skill itself `/motif`, so there's no `/motif` command file.
- **Version:** every manifest carries `skill/VERSION`; a test fails if any differs.
- **The build refuses** to write into a folder that has files and isn't an earlier `dist/agents` build, as the Claude Code plugin build does.

The same build also writes `dist/agents-local/`, a local marketplace for each agent pointing at `dist/agents/`, used by CI's install checks and by the [Develop guide](../../plugin/agents/README.md).

### 3.1 The `plugins` branch

- At each published release whose tag has no suffix (`v0.2.0`, not `v1.0.0-rc.1`), the release workflow replaces the `plugins` branch's files with `dist/agents/` and commits them as "Motif v<version>". The branch is created on the first release. It is also tagged `plugins-v<version>` so people can pin a version.
- Nothing else is ever on that branch, and nobody edits it by hand; its README says so.
- The commit is made by the workflow's own identity. The workflow trigger stays `v*` tags, which `plugins-v*` doesn't match.

### 3.2 Marketplaces on `main`

Each agent with a plugin system gets its own marketplace file on `main`, listing one plugin, `motif`, whose source is this repo's `plugins` branch:

| Agent | File |
|---|---|
| Codex | `.agents/plugins/marketplace.json` |
| Cursor | `.cursor-plugin/marketplace.json` |
| GitHub Copilot (CLI and VS Code) | `.github/plugin/marketplace.json` |
| Claude Code | `.claude-plugin/marketplace.json`, unchanged (release zip, pinned by SHA-256) |

They follow the branch, so they don't change after a release. They are written by `bun scripts/marketplace.ts` and checked by a test, like Claude Code's. They land with the code (merged at approval A): until the first release creates the branch, an install from them fails, and nobody is told to install before the README changes at C.

## 4. How people install and start Motif

| Agent | Install | Start |
|---|---|---|
| Claude Code | `/plugin marketplace add 7mxd/motif`, then `/plugin install motif@motif` (unchanged) | `/motif:design` and the other three (unchanged) |
| Codex | `codex plugin marketplace add 7mxd/motif`, then `codex plugin add motif@motif` | `$motif` |
| Cursor | Add the plugin marketplace `7mxd/motif` in Cursor's plugin settings, or `agent plugin marketplace add https://github.com/7mxd/motif` in the CLI | `/motif` |
| GitHub Copilot CLI | `copilot plugin marketplace add 7mxd/motif`, then `copilot plugin install motif@motif` | `/motif` |
| VS Code (Copilot) | "Chat: Install Plugin From Source", then `7mxd/motif` | `/motif` |
| Gemini CLI | `gemini extensions install https://github.com/7mxd/motif --ref plugins --auto-update` | `/motif`, or `/motif:design` and the other three |
| OpenCode, and any agent that reads `~/.agents/skills` | the install script (§6) | `/motif` in OpenCode; elsewhere the agent's own way to start a skill |

The exact commands are confirmed by the install checks (§9) before the README shows them; §12 lists what the first task verifies.

## 5. Changes to the skill

- **A bare `/motif`.** `SKILL.md`'s "Choosing what to do" table gains: the developer typed `/motif` with nothing else → [modes/design.md](../../skill/modes/design.md), like `/design` today.
- **`skill/agents.md` (new):** one table, a row per agent, with:
  - where the skill folder is once installed, for an agent that doesn't tell the model (the bootstrap runs from `<skill folder>/bin/`);
  - its question prompt and when it's available (for example, Codex asks multiple-choice questions only in Plan mode; otherwise Motif's numbered-list fallback applies);
  - which shell runs commands on Windows (PowerShell in all five, so the `motif.cmd` row applies);
  - how to sign in to a design source that needs it (Refero, 60fps.design).

  `SKILL.md` links to it from "Running the motif tool" and from rule 3. It is the only file in `skill/` that names an agent's tools, which [core spec §5.5](2026-10-12-motif-core-design.md) allows for per-agent notes; the skill lint enforces that.
- **Source notes** (`skill/sources/*.md`): "`motif connect <source>` sets it up for Claude Code" becomes "for the agents you choose"; the per-agent sign-in steps move to `agents.md`.
- **The Claude Code commands** (`plugin/claude-code/skills/`) stay as they are.

## 6. The install script

For OpenCode, which has no plugin system, and for any other agent that reads Agent Skills from `~/.agents/skills` (for example Amp, Goose or Kiro).

- **Files:** `install.sh` (POSIX sh) and `install.ps1` (Windows PowerShell 5.1 and later) at the root of `main`. The README shows:
  - macOS, Linux, Git Bash: `curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh`
  - Windows PowerShell: `irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1 | iex`

  and how to download the script and read it before running it.
- **Steps:**
  1. Find the version: `skills/motif/VERSION` on the `plugins` branch, unless `--version <x.y.z>` pins one.
  2. Download `motif-skill.tar.gz` (sh) or `motif-skill.zip` (PowerShell) and `SHA256SUMS` from that release; stop with a plain message if the checksum doesn't match, the download fails, or `tar`/`Expand-Archive` is missing.
  3. Choose where: OpenCode's skills folder when OpenCode is installed (its command is on PATH or its config folder exists), otherwise `~/.agents/skills`. `--agent opencode|agents` chooses explicitly.
  4. Install the skill as `<folder>/motif`, replacing only an earlier Motif install (its `SKILL.md` names `motif`); anything else there is left alone and the script stops.
  5. For OpenCode, also write a `/motif` command (`commands/motif.md` in its config folder) that starts the skill with the developer's words; it carries a marker line so the script knows it's Motif's.
  6. Print what it installed, where, which agents read that folder, and how to start.
- **`--uninstall`** removes only Motif's skill folder and command. Running the script again updates Motif.
- **Nothing else:** no telemetry; it downloads only from github.com and raw.githubusercontent.com; no admin rights.
- **Assets:** each release attaches `motif-skill.tar.gz` and `motif-skill.zip` (the `skills/motif/` folder), both in `SHA256SUMS`.

## 7. `motif connect` and `doctor` for every agent

### 7.1 Agents

| Id | Agent | Found by |
|---|---|---|
| `claude` | Claude Code | `claude` on PATH |
| `codex` | Codex | `codex` on PATH, or its settings folder (`$CODEX_HOME`, `~/.codex`) exists: Codex's app and editor extension use it without the command |
| `cursor` | Cursor | `~/.cursor` exists, or `cursor` or `cursor-agent` on PATH |
| `copilot` | GitHub Copilot CLI | `copilot` on PATH |
| `vscode` | VS Code (Copilot) | `code` on PATH, or VS Code's user settings folder exists |
| `gemini` | Gemini CLI | `gemini` on PATH |
| `opencode` | OpenCode | `opencode` on PATH |

Settings folders follow each agent's own variable where it has one (`CODEX_HOME`, `COPILOT_HOME`, `GEMINI_CLI_HOME`, `XDG_CONFIG_HOME`).

### 7.2 `motif connect <source>`

1. Find the agents. With none, print the settings to paste by hand, as today (exit 2).
2. Choose:
   - **In the developer's terminal:** a numbered question, "Set up Motion for which agents? 1 Claude Code, 2 Cursor, 3 Gemini CLI. Press Enter for all, or type numbers (1,3)." Numbers work in every terminal, including Git Bash's.
   - **One agent found:** no question.
   - **`--agent claude,cursor`:** no question. An agent named there that isn't on this computer gets nothing written (a settings folder would make it look installed) and is reported ✗. A command Motif prints repeats the ids as it read them, once each and in this table's order (`--agent "Cursor, Claude"` → `--agent claude,cursor`).
   - **The input ends at the question** (Ctrl+D, or Ctrl+Z on Windows): nothing changes, and it says so (exit 2). At the hidden key prompt, Ctrl+C, Ctrl+D and Ctrl+Z all mean no key.
   - **Not in a terminal, without `--agent`:** a source with no key is set up in every agent found (the output says which); a source with a key stops and prints the command to run in the developer's own terminal, as today.
3. For a key source, ask for the key once with hidden input, as today, and check it the same way.
4. Add the source to each chosen agent's **user-level** settings, never a project file:

   | Agent | How |
   |---|---|
   | Claude Code | `claude mcp add --transport http --scope user [--header] <name> <url>` (as today) |
   | Codex | A `[mcp_servers.<name>]` table with `url` (and `http_headers` for a key) added to `config.toml`: `codex mcp add` can't set headers, and for a URL it starts a sign-in and waits for a browser |
   | Cursor | `mcpServers.<name>` (`url`, `headers`) added to `~/.cursor/mcp.json` |
   | Copilot CLI | `copilot mcp add --transport http [--header] <name> <url>` |
   | VS Code | `servers.<name>` (`type`, `url`, `headers`) added to its user `mcp.json`: `code --add-mcp` would pass the JSON through cmd.exe on Windows, which doubles its quotes |
   | Gemini CLI | `gemini mcp add --scope user --transport http [--header] <name> <url>` |
   | OpenCode | `opencode mcp add <name> --url <url> [--header]` |

   Files are edited so every other entry, comment and the formatting stay as they were; a comment after the last server stays on its line, and a settings file that is a link (dotfiles kept elsewhere) stays a link, followed link by link to the file it points to, which is the one changed (and checked against git when it now holds a key). A link into a folder that doesn't exist, links that lead back to themselves, or a link to a file that can't be changed (such as home-manager's read-only store) leave everything as it was, with the reason. A new file holding a key is created readable by its owner only.

   A server that matches the source, under any name, is left alone and reported as already connected. A different server already using Motif's name, servers that aren't a list (`"servers": null`), or the servers key written twice, leave the file as it was, and that agent is reported ✗ with the reason. Anything else that goes wrong for one agent is that agent's ✗; the others are still set up.
5. **Report one line per agent:** ✓ added, ✓ already connected, or ✗ with the reason and the settings to paste. One agent failing doesn't stop the others. Exit 0 when every chosen agent has the source, 1 when some failed, 2 when none could be set up.
6. **Sign-in:** for Refero and 60fps.design, one line per agent on how to sign in (Claude Code `/mcp`; Codex `codex mcp login <name>`, or Authenticate under MCP servers in its app or editor extension; Gemini `/mcp auth <name>`; OpenCode `opencode mcp auth <name>`; Cursor's MCP settings; Copilot `/mcp`; VS Code's sign-in prompt on first use).
7. **Keys:** typed only in the developer's own terminal, never in the chat; any output that echoes a key shows `<your key>` instead; a warning when a settings file now holding a key is tracked by git.

The exact command-line flags are confirmed against each agent's installed version during the plan (§12), and pinned by tests that check the arguments Motif passes.

### 7.3 `doctor` and `motif connect` (no source)

Both list each source with the agents that have it, for example "✓ Motion: Claude Code, Cursor · ○ Refero (connect: motif connect refero)". They read each agent's user and project settings:

| Agent | User | Project |
|---|---|---|
| Claude Code | `~/.claude.json` | `.mcp.json`, and `~/.claude.json`'s entry for this folder |
| Codex | `$CODEX_HOME/config.toml` (`~/.codex`) | `.codex/config.toml` |
| Cursor | `~/.cursor/mcp.json` | `.cursor/mcp.json` |
| Copilot CLI | `$COPILOT_HOME/mcp-config.json` (`~/.copilot`) | `.mcp.json`, `.github/mcp.json` |
| VS Code | the user profile's `mcp.json` | `.vscode/mcp.json` |
| Gemini CLI | `~/.gemini/settings.json` | `.gemini/settings.json` |
| OpenCode | `~/.config/opencode/opencode.json` or `.jsonc` | `opencode.json` or `.jsonc` |

- JSON files are read leniently (comments and trailing commas allowed) with the existing `jsonc-parser`; Codex's TOML with Bun's built-in parser. No new dependency.
- Each server is matched against the source catalog as today (its name and settings).
- A file that can't be read is skipped and named, in `doctor`'s text ("Agent settings") and in `--json` output; it never makes `doctor` fail.

## 8. Release workflow

- **`plugin` job:** builds the Claude Code zip (as today), `dist/agents/`, and `motif-skill.zip` / `motif-skill.tar.gz`; checks every manifest's version against the tag.
- **`publish` job:** creates the release (as today, with the new assets in `SHA256SUMS`).
- **`plugins-branch` job:** after `publish`, for a tag without a suffix, commits `dist/agents/` to the `plugins` branch and tags it `plugins-v<version>`. It and `publish` are the only jobs with `contents: write`.
- **`check` job:** after publishing, on Windows, macOS and Linux, installs the Claude Code plugin from the release and runs its bootstrap.
- **`agents` job:** after the `plugins` branch is updated, on Windows, macOS and Linux, installs Motif from GitHub in every agent as §4 says (§9.2). Cursor is checked on Windows and Linux: its CLI can't keep its sign-in on CI's macOS machine.
- **Dry run** (`workflow_dispatch`): builds everything, publishes nothing, pushes nothing.

## 9. Checks

### 9.1 Tests (every change)

- The package: layout, manifests (valid, same version), Gemini TOML parses and names the right mode files, no Claude-only placeholders (`${CLAUDE_PLUGIN_ROOT}`, `$ARGUMENTS`) anywhere in `dist/agents/`, the build's refusal rule.
- The marketplace files: each lists `motif` from the `plugins` branch.
- The install scripts, against a local fake release (the bootstrap tests' approach): install, update, a checksum mismatch, a folder that isn't Motif's, `--uninstall`, OpenCode's command file; sh on macOS and Linux (and Git Bash), PowerShell on Windows.
- `connect`: the arguments passed to each agent's command and the file edits for Codex, Cursor and VS Code, with every other entry kept; the agent choice (numbers, Enter, `--agent`, not in a terminal); per-agent results and exit codes; keys never in output.
- `doctor`: each agent's settings formats, user and project, including comments, a missing file and a broken one.
- The skill lint: agent tool names only in `skill/agents.md`.

### 9.2 Install checks (no accounts; Cursor with an API key)

- **On every push (Linux):** CI installs each agent's CLI at a pinned version in a throwaway home (Codex, Copilot CLI, Gemini CLI, OpenCode; Cursor's CLI adds marketplaces only from a git URL and needs a sign-in, so it's checked after releases only), installs Motif from `dist/agents-local/` the way that agent installs plugins (OpenCode through the install script against a local fake release), and checks that the agent lists the `motif` skill (for example `gemini skills list`, `opencode debug skill`, `copilot skill list`, `codex plugin list`).
- **After each release (Windows, macOS, Linux):** the same, from GitHub exactly as §4 says, plus the installed skill's bootstrap running `doctor --json` with the tool downloaded from the release (as the Claude Code check does today). Cursor's CLI adds the marketplace (`cursor-agent plugin marketplace list` shows it) with a key from the `CURSOR_API_KEY` secret, given to Cursor alone, on Windows and Linux.
- **Weekly:** a scheduled run of the push check with each agent's latest version, so a breaking change in an agent shows up before people hit it.

### 9.3 Release steps

Approval points, as for v0.1.0:

- **A:** merge to `main`, push, and run the release workflow as a dry run.
- **B:** tag `v0.2.0`; the release publishes, the `plugins` branch is created, and the post-release check runs.
- **C:** if every check passes: update Claude Code's marketplace (as for v0.1.0) and the README's install section, push, and install Motif here in Claude Code from GitHub in a throwaway configuration. The other agents are covered by the post-release check; nothing new is installed on the developer's computer without asking.

### 9.4 Hands-on (at the end, with the evals)

The developer uses Motif in Cursor, Gemini CLI and Copilot, signed in: `/motif` starts it, the model finds the skill folder and runs the tool, asks with the agent's question prompt, and `motif connect motion` sets up Motion in each. Anything found ships as v0.2.x.

## 10. Docs

- **README:** "Install" gets a short block per agent (§4); the preview line names the six agents.
- **`docs/releases/v0.2.0.md`:** release notes, as for v0.1.0.
- **`plugin/agents/README.md` (new):** what the package is, and how to build it and try it in each agent from a local build (each agent's local-install form, with `MOTIF_BIN` pointing at a local tool build).
- **Decision 0005:** the `plugins` branch, `/motif` as the entry everywhere but Claude Code, the install script, and `connect` for every agent.
- **Core spec:** §4's Part 3 row links here; §10.2's `connect` row says every agent; §5.5 mentions `skill/agents.md`.

## 11. Out of scope

- Running the agent evals in other agents: the eval runner stays on Claude Code.
- Listing Motif in the agents' public directories (Cursor's marketplace, Gemini's extension gallery, Codex's directory): later, with the developer's approval.
- Copilot's cloud agent (repository settings, no sign-in to design sources) and JetBrains.
- Packages specific to agents beyond the six; they use `~/.agents/skills` through the install script.

## 12. Risks, verified first

The first task of plan 3A installs each agent's CLI in a throwaway home and checks, before anything else is built on them:

1. **Each agent reads its own marketplace file, not Claude Code's**, and installs from a branch. If one doesn't, its install command adds the marketplace from the `plugins` branch instead (`#plugins` or `--ref plugins`), which then also carries that agent's marketplace file.
2. **Codex, Cursor and Copilot accept the Agent Plugins `plugin.json`.** If one doesn't, it gets its own manifest (§3).
3. **Gemini names extension commands `/motif:design`** (its docs say `/motif.design`; its code uses a colon).
4. **Folders on Windows:** where OpenCode keeps its config and skills, and where each agent installs plugins (for `agents.md`).
5. **The `connect` command-line flags** of each agent (§7.2).

Known risks that remain:

- **Cursor and Copilot may not tell the model where the skill folder is.** `agents.md` lists where each agent installs it; the hands-on check (§9.4) confirms.
- **Codex only offers its question prompt in Plan mode.** Elsewhere, Motif asks with a numbered list (rule 3 already says so).
- **Agents change quickly.** CI pins their versions, and the weekly run with the latest versions warns early.
- **`irm … | iex` and `curl … | sh` run a script from the internet.** The scripts are short and on `main` for anyone to read, everything they download is checked against `SHA256SUMS`, and the README shows how to read a script before running it.
- **Keys on a command line.** As with Claude Code today, `connect` passes a key to an agent's own command as an argument, briefly visible to other processes of the same user. Files Motif edits itself (Cursor, Codex) never pass the key on a command line.

## Appendix: what each agent supports (checked 2026-10-17)

| | Codex 0.163 | Cursor CLI 2026.10.08 | Copilot CLI 1.0.98 / VS Code | Gemini CLI 0.64 | OpenCode 1.19 |
|---|---|---|---|---|---|
| Agent Skills | `.agents/skills`, `~/.agents/skills` | `.agents/skills`, `.cursor/skills`, `~/.agents/skills`, `~/.cursor/skills`; also reads `.claude/skills` | `.github/skills`, `.agents/skills`, `~/.copilot/skills`, `~/.agents/skills` | `.gemini/skills`, `.agents/skills`, `~/.gemini/skills`, `~/.agents/skills`; extensions' `skills/` | `.opencode/skills`, `.agents/skills`, `.claude/skills`, `~/.config/opencode/skills`, `~/.agents/skills` |
| Plugins | `codex plugin marketplace add`; reads `plugin.json` (Agent Plugins), `.codex-plugin/`, `.claude-plugin/` | Cursor plugins and Agent Plugins; marketplaces from git | `copilot plugin`; reads `plugin.json`, `.github/plugin/`, `.claude-plugin/` | Extensions (`gemini-extension.json`), from git with `--ref`, auto-update | None (JS plugins only); skill and command folders |
| Model told the skill's folder | Yes | Not documented | Not documented | Yes | Yes |
| Question prompt | `request_user_input`, Plan mode only | Ask questions (interactive only) | `ask_user`; VS Code `askQuestions` | `ask_user` | `question` |
| Shell on Windows | PowerShell | PowerShell | PowerShell | PowerShell | pwsh, PowerShell, Git Bash or cmd |
| MCP settings | `config.toml` (`[mcp_servers]`) | `mcp.json` | `mcp-config.json`, `.mcp.json`; VS Code `mcp.json` | `settings.json` | `opencode.json` (`mcp`) |
| Config isolation for checks | `CODEX_HOME` + HOME | HOME | `COPILOT_HOME` | `GEMINI_CLI_HOME` | XDG folders + HOME |

Sources: [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Codex plugins](https://developers.openai.com/codex/plugins/build), [Cursor skills](https://cursor.com/docs/skills), [Cursor plugins](https://cursor.com/docs/plugins), [Copilot skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [Copilot CLI plugins](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference), [VS Code agent plugins](https://code.visualstudio.com/docs/copilot/customization/agent-plugins), [Gemini CLI skills](https://geminicli.com/docs/cli/skills/), [Gemini CLI extensions](https://geminicli.com/docs/extensions/reference/), [OpenCode skills](https://opencode.ai/docs/skills/), [OpenCode commands](https://opencode.ai/docs/commands/), [Agent Skills](https://agentskills.io/specification), [Agent Plugins](https://agent-plugins.org).
