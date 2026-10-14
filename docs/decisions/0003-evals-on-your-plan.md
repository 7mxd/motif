# 0003 — Evals run on the developer's Claude plan, on demand

- Date: 2026-10-14
- Status: Accepted
- Context: spec §13.2 planned nightly eval runs in CI, with "an API key stored as a CI secret". The developer decided on 2026-10-14 not to use an API key. Verified the same day with Claude Code 2.1.289 signed in with a Claude account (see the 1E-2 plan, `docs/plans/2026-10-14-motif-1e2-evals.md`).

## Decisions

1. **No API key.** Evals run through the developer's signed-in Claude Code (`claude auth status` → `"authMethod": "claude.ai"`). API key and other-provider variables are removed from each session's environment, and a session whose first event reports an API key source stops the run.
2. **On demand only**, from `bun tests/evals/run.ts`, one case at a time, resumable after a usage limit or Ctrl+C. No nightly runs. CI runs only the runner's own tests, with a stand-in for Claude Code.
3. **Isolation, checked.** `--setting-sources project,local`, `--strict-mcp-config` with an empty list, only Motif's plugin (built from the checkout), `--no-session-persistence`; only the tools a coding session needs (`--tools` allowlist). The first event (`system/init`) is checked for the API key source, MCP servers, plugins, tools, the developer's own skills and agents, and the permission mode; a missing first event stops the run too. A run won't start while a `CLAUDE.md` every session would read sits above the case folders.
4. **Unattended in auto mode** (`--permission-mode auto --permission-prompts none`): Claude Code's auto mode decides, and nobody is asked. Bypassing permissions was rejected because the sessions run on the developer's own computer. Auto mode needs a model that supports it; the runner stops when a session doesn't start in auto mode.
5. **Test C's model grader** is one read-only Claude Code session (Read, Grep and Glob only) answering in a JSON schema, following `tests/evals/rubric.md`.
6. **Test D's starter routes** are named in the prompt (`/`, `/sign-in`, `/home`) so the screens can be checked without a model.
7. **`claude purge`** removes Claude Code's state for each case folder after its sessions.

## Consequences

- The release checklist (Part 4) must include a local eval run; results stay on the developer's computer (`tests/evals/results/`, git-ignored).
- §13.2's "nightly" and "API key stored as a CI secret" no longer apply; the spec now points here.
- Runs use the developer's plan. The report shows Claude Code's own cost estimate at API prices, for scale only.
