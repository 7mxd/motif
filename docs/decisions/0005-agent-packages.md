# 0005 — How other agents install Motif

- Date: 2026-10-17
- Status: Accepted
- Context: Part 3 brings Motif to Codex, Cursor, GitHub Copilot, Gemini CLI and OpenCode ([the Part 3 spec](../specs/2026-10-17-motif-part3-agents-design.md)). All five read Agent Skills; four have plugin systems that install from a git branch or tag, not from a release zip as Claude Code does. A skill installed from `main` between releases could describe features its downloaded tool doesn't have yet. What each agent did when tried is in [the 3A facts](../plans/notes/2026-10-17-3a-agent-facts.md).

## Decisions

1. **A `plugins` branch holds only the built package**, replaced by the release workflow at each release without a suffix and tagged `plugins-v<version>`. Installs are small and always match a published tool. `main` stays the source; Claude Code keeps its checksum-pinned release zip.
2. **Each agent's marketplace file on `main` points at that branch** (`.agents/plugins/`, `.cursor-plugin/`, `.github/plugin/`), so nothing changes on `main` after a release. The package also carries each agent's marketplace file pointing at itself, so the branch can be added as a marketplace directly (`#plugins`, `--ref plugins`) should an agent not install from `main`'s. Gemini CLI installs the branch as an extension (`--ref plugins --auto-update`).
3. **`/motif` is the entry everywhere but Claude Code** (`$motif` in Codex): one name, which clashes with no agent's own `/init` or `/review`. Gemini CLI also gets `/motif:design`, `/motif:init`, `/motif:feature` and `/motif:review`, as Claude Code has; Gemini makes the skill itself `/motif`.
4. **OpenCode and other agents without plugins use Motif's install script** (`install.sh`, `install.ps1`), which downloads the skill from the release, checks it against `SHA256SUMS`, and installs it where OpenCode reads skills or in `~/.agents/skills`.
5. **`skill/agents.md` is the one place in `skill/` that names agents' tools**: where each agent installs the skill, its question prompt, and its shell.

## Consequences

- Every release publishes `motif-skill.zip` and `motif-skill.tar.gz` too, and checks every agent's install from GitHub on Windows, macOS and Linux (Cursor's on Windows and Linux: its CLI can't keep its sign-in on CI's macOS machine); CI checks them from the build on every push and with the agents' latest versions every week.
- The plugins branch is written by CI only; a fix ships as a new release.
