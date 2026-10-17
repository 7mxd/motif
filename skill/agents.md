# Motif in each agent

Motif's files are the same in every agent. This page lists what differs: where the skill folder is, how to ask the developer a question, and which shell runs commands. Use your own agent's row.

## Where the skill folder is

You run the motif tool from the skill folder (`<skill folder>/bin/motif`, as [SKILL.md](SKILL.md) shows). Most agents tell you the folder when the skill loads. If yours doesn't, look for `skills/motif/SKILL.md` here (`~` is the developer's home folder, `C:\Users\<name>` on Windows):

| Agent | Installed through | Skill folder |
|---|---|---|
| Claude Code | its plugin marketplace | `~/.claude/plugins/cache/motif/motif/<version>/skills/motif` |
| Codex | its plugin marketplace | `~/.codex/plugins/cache/motif/motif/<version>/skills/motif` |
| Cursor | its plugin marketplace | a `skills/motif` folder under `~/.cursor/plugins/` |
| GitHub Copilot CLI | its plugin marketplace | `~/.copilot/installed-plugins/motif/motif/skills/motif` |
| VS Code (Copilot) | its agent plugins | the Copilot CLI folder above, or a `skills/motif` folder under VS Code's agent plugins folder |
| Gemini CLI | an extension | `~/.gemini/extensions/motif/skills/motif` |
| OpenCode | Motif's install script | `~/.config/opencode/skills/motif` |
| Any other agent | Motif's install script | `~/.agents/skills/motif` |

If several versions are there, use the newest.

## Asking the developer

Rule 3 in [SKILL.md](SKILL.md) asks with your agent's question prompt when it has one, and in a numbered list at the end of your message when it doesn't:

| Agent | Question prompt |
|---|---|
| Claude Code | AskUserQuestion |
| Codex | request_user_input, only in Plan mode; otherwise use the numbered list |
| Cursor | its ask-questions tool (AskQuestion), when your model has it; otherwise the numbered list |
| GitHub Copilot CLI | ask_user |
| VS Code (Copilot) | askQuestions |
| Gemini CLI | ask_user |
| OpenCode | question |
| Any other agent | its own, if it has one; otherwise the numbered list |

## Which shell runs commands

On Windows, Codex, Cursor, GitHub Copilot and Gemini CLI run commands in PowerShell, so use the PowerShell row of SKILL.md's table (`motif.cmd`). OpenCode uses PowerShell when it's installed, and Git Bash or Command Prompt otherwise: match the row to the shell you're in. On macOS and Linux, every agent uses `sh`.

## Signing in to a design source

Refero and 60fps.design need the developer to sign in once, after `motif connect` adds them. The server is `refero` or `60fps`:

| Agent | How the developer signs in |
|---|---|
| Claude Code | type /mcp, choose the server and sign in |
| Codex | run `codex mcp login <server>` in a terminal |
| Cursor | in Cursor's settings, under MCP, sign in to the server (or run `cursor-agent mcp login <server>`) |
| GitHub Copilot CLI | type /mcp and sign in to the server |
| VS Code (Copilot) | VS Code asks them to sign in the first time Copilot uses the server |
| Gemini CLI | type `/mcp auth <server>` |
| OpenCode | run `opencode mcp auth <server>` in a terminal |
