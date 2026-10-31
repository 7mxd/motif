# Motif v1.1.0: the package for Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode

This branch is built from [Motif's main branch](https://github.com/7mxd/motif) at each release, here v1.1.0. Don't edit it: every release replaces its files.

- `skills/motif/` is the Motif skill. It fetches the motif tool from the matching release the first time it runs.
- `plugin.json` is the plugin manifest Codex, Cursor and GitHub Copilot read; `gemini-extension.json` and `commands/` make it a Gemini CLI extension.

Install Motif as [the README](https://github.com/7mxd/motif#install) says, then start it with `/motif` (`$motif` in Codex).
