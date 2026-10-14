# Agent evals

Tests B, C and D from the design spec (§13.2), run through **your own signed-in Claude Code** on your Claude plan: never an API key, never in CI, and only when you start them.

| Test | What it checks | Cases |
|---|---|---|
| B — consistency | Fresh sessions each add a feature to Larder (`fixtures/react-contract-app`) and stay inside its design guide | `b-settings`, `b-search`, `b-profile`, `b-notifications`, `b-checkout` |
| C — review accuracy | A review of the seeded app (`fixtures/react-seeded-app`) finds its 23 planted problems | `c-review` |
| D — zero accounts | A new app from each brief (`fixtures/briefs/`), plus B and C, all with no design sources connected | `d-stride`, `d-ledgerly`, `d-bloom` |

## Before you start

- Claude Code, signed in with your Claude account: `claude auth status` shows `"authMethod": "claude.ai"`. The evals never use an API key.
- Bun (this repository's tool), git, and Node.js 20.9 or later with npm.
- Chrome or Edge for tests C and D. If you have neither, `motif browser install` downloads a private browser of about 100 MB; the runner never runs it for you.
- Time and usage. Each case is a full Claude Code session: up to 90 minutes for B and C cases, 3 hours for D cases, plus installing and building the app. A full run is nine sessions and uses a large share of your plan's usage, so you may prefer one test at a time.

## Running

From the repository root:

```bash
bun tests/evals/run.ts --list                  # the nine cases
bun tests/evals/run.ts --dry-run --tests B     # each prompt and the exact Claude Code command, without running anything
bun tests/evals/run.ts --tests B               # one test
bun tests/evals/run.ts --cases b-search,c-review
bun tests/evals/run.ts                         # everything
```

| Option | What it does |
|---|---|
| `--tests B,C,D` · `--cases <id,…>` | Run only these |
| `--dry-run` | Show what would run; start nothing, write nothing |
| `--resume <run>` | Continue a run that stopped |
| `--keep` | Keep each case's folder after grading (to look at the apps) |
| `--model <name>` · `--judge-model <name>` | The model for the sessions, and for test C's grader (default: your account's) |
| `--max-turns <n>` | Cap every case at n turns: a quick check that the runner works |
| `--work <folder>` | Where case folders go (default: your temp folder) |
| `--claude <path>` | The Claude Code program to use |

At the start of a run, the runner builds the motif tool and the Claude Code plugin from this checkout (`bun run build` and `bun run plugin` in `cli`), so the sessions test the code in front of you.

## What each session gets

- **A fresh folder** in your temp folder: a copy of the fixture app with its packages installed (B, C), or an empty folder holding the brief as `brief.md` (D).
- **Your Claude account only.** `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and the other-provider switches are left out of the session's environment, and a session that reports any API key stops the run.
- **None of your setup.** `--setting-sources project,local` leaves out your own settings, hooks and plugins; `--strict-mcp-config` with an empty list leaves out every MCP server (that's test D's "zero accounts"); only Motif's plugin is loaded, from `dist/claude-code`. The session's first event is checked for all of this, and the run stops if anything else was loaded.
- **Unattended, never bypassed.** `--permission-mode auto --permission-prompts none`: Claude Code's auto mode approves ordinary work and refuses risky actions, and nobody is asked. Refusals are listed in the report. If a session doesn't start in auto mode (some models don't support it), the run stops and says to choose another with `--model`. Tools that reach outside the session (remote triggers, phone notifications, schedules, design sync, worktrees) are switched off.
- **Gates off by instruction.** Each prompt starts a Motif command (`/motif:feature`, `/motif:review`, `/motif:init`) and adds "don't stop for approval", as a developer would.
- **No traces.** Sessions keep no transcript in Claude Code (`--no-session-persistence`), and `claude purge` removes Claude Code's state for each case folder afterwards. Case folders are deleted after grading unless you pass `--keep`.

## Usage limits and resuming

If your plan's usage limit is reached, the run pauses, says when the limit resets, and prints the command to continue:

```bash
bun tests/evals/run.ts --resume <run>
```

Ctrl+C works the same way. A case cut off mid-session starts again from a fresh folder; cases already graded keep their results. If the limit is reached while test C is being graded, the review isn't repeated: its folder is kept and `--resume` grades it again. Resuming on a different commit is allowed, and the report says so.

## Results

Everything goes to `tests/evals/results/<run>/` (git-ignored; nothing is uploaded):

- `report.md`: the verdict for each test and a table of criteria for each case; `report.json` and `run.json` hold the same for tools.
- Per case: `session.jsonl` (every event of the session, to see exactly what Claude Code did), `diff.patch` (what it changed), `check.json`, `validate.json`, `build.log`, `typecheck.log`; for C, `review.json`, `review.md`, `audit.json`, `grading.json` and `judge.jsonl`; for D, the new app's `DESIGN.md`, `tokens.json`, `shot.json` and `shots/`.

The dollar figure in the report is Claude Code's own estimate at API prices, to show scale; your plan covers the usage.

Exit codes: `0` every case passed, `1` some case failed or couldn't be graded, `2` the run couldn't start (or a session wasn't isolated), `3` paused at the usage limit.

## How cases are graded

**B** (every case): the feature's page exists; `motif check` finds no problems and no warnings, with at most 2 `motif-ok` exceptions; `motif validate` passes; the app builds and type-checks; at most one new component in `src/components/`, unless the others are named in lines the session added to `DESIGN.md` (a recorded design guide change).

**C**: the review writes a report in the review format (`design/reviews/*.json`) and changes nothing outside `design/`. Findings are matched to `seeded-issues.json` by category and place, following [the seeded app's grading rules](../fixtures/react-seeded-app/README.md#how-a-grader-reads-the-list); knock-on findings the list declares count as correct. Exact problems found at their file (or line) are matched by the runner alone; for judgement problems, and for exact problems a finding names only by screen, a model grader (one read-only Claude Code session, with [this rubric](rubric.md)) confirms which candidate findings describe each problem, and decides whether serious findings that match nothing are real or false. Pass: at least 90% of the 13 exact problems, at least 70% of the 10 judgement problems, at most 10% of critical and major findings false.

**D** (every brief): the new app (the folder with `DESIGN.md`) passes `motif validate` and `motif check` (at most 2 `motif-ok` exceptions); `DESIGN.md` has every section, each filled in; the app builds and type-checks; `/`, `/sign-in` and `/home` render in `motif shot` (status 200, no page errors). Test D passes when the three new apps pass and tests B and C pass, since every session runs with no MCP servers.

## Tests of the runner

`cli/test/evals-*.test.ts` run in CI with a stand-in for Claude Code (`cli/test/fixtures/evals/fake-claude.ts`) and stubbed installs and builds. They never start a real session, use your plan or reach the network.
