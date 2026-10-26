# Motif 2L — Release evaluation (Part 4) and v1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test A (the same briefs built with and without Motif, judged blind by AI judges and the owner), the release checklist, and v1.0.0.

**Architecture:** Test A is a fourth test of the eval runner in `tests/evals/` (`TestId` gains `"A"`). Its `a-<brief>` cases build each Test D brief with no plugins; once a brief's `d-*` and `a-*` apps exist, both are shot with the same flags into anonymous pairs. Each pair is judged twice (sides swapped) by read-only Claude Code sessions, and the owner judges every pair on a blind page the runner serves locally. Scores are kept per brief; the verdict passes only when every brief passes.

**Tech Stack:** Bun + TypeScript (`tests/evals/`, `cli/`), Claude Code headless sessions on the developer's plan (decision 0003), `motif shot`, a self-contained HTML page, `bun test`.

**Spec:** `docs/specs/2026-10-26-motif-part4-release-evaluation-design.md` (approved 2026-10-26). Core spec `docs/specs/2026-10-12-motif-core-design.md` §3, §4, §13; decision `docs/decisions/0003-evals-on-your-plan.md`.

## Global Constraints

- Evals and Test A run on the developer's signed-in Claude Code, never an API key, only when the developer starts them; the isolation of decision 0003 applies to every session (`--setting-sources project,local`, `--strict-mcp-config` with an empty list, the tools allowlist, auto mode, `--no-session-persistence`, `claude purge`).
- `a-*` sessions load **no plugins at all**; everything else (model, time limit, turn and budget caps, tools, auto mode, starter routes) equals the matching `d-*` case.
- The `a-*` prompt is the `d-*` prompt with every mention of Motif removed, and asks for nothing worse: build the app the brief describes, at these routes, and make it look and work well.
- Nothing on a pair, a file name, a URL, an image's metadata or the page source tells the sides apart before the reveal.
- Pass is per brief: AI judges pick Motif in at least 70% of the brief's judged pairs and the baseline in at most 15%; the owner picks Motif in more than half of the brief's pairs ("about the same" is not a win). Test A passes only when every brief passes; a brief with no verdict (Masar off a Mac) leaves Test A incomplete.
- A side whose app doesn't build or whose screen doesn't render loses that pair; a pair where neither side renders is left out and recorded.
- Only a session cut off by a usage limit, a crash or Ctrl+C runs again; a finished session's result stands.
- B, C and D are unchanged: existing eval tests pass unchanged unless a task names the test.
- Messages in the runner's plain voice. Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on `plan/2l-release-evaluation` in the worktree `C:/Users/PC/GitHub/motif-2l`. The owner has authorised pushes to the work branch and main; never force-push; nothing is tagged by Tasks 1–7.

## Review Focus

1. **A baseline app Motif's shot can't start** (no dev script, a different port, a framework Motif doesn't support): that side loses its pairs with the reason recorded; the run doesn't stop. Test in Task 2.
2. **A tell in the files**: PNG text chunks (`tEXt`, `iTXt`, `eXIf`), file names, folder names or page source naming "motif", "baseline", `d-` or `a-` before the reveal. Test in Tasks 2 and 5.
3. **A usage limit in the middle of judging**: resuming judges only the pairs left; finished judgements stand. Test in Task 3.
4. **The owner closes the page part-way**: every vote is saved as it's made, and reopening continues at the next unjudged pair. Test in Task 5.
5. **Test A run off a Mac**: Masar's `a-masar` is skipped with the Mac note, and the verdict is incomplete, never pass. Test in Task 4.

---

### Task 1: Test A cases: building each brief without Motif

**Files:**
- Modify: `tests/evals/cases.ts` (`TestId` = `"A" | "B" | "C" | "D"`; `baselineApp` builder; `a-*` cases in `CASES`), `tests/evals/run.ts` (`--tests A`; no plugin for A sessions; keep each `d-*`/`a-*` app until its brief's pairs are shot), `tests/evals/session.ts` (the isolation check accepts "no plugins" for A), `tests/evals/collect.ts` and `grade.ts` (grade an `a-*` case as D's build and type check only), `tests/evals/README.md`
- Test: `cli/test/evals-cases.test.ts`, `cli/test/evals-run.test.ts`, `cli/test/evals-session.test.ts` (or where the isolation check is tested)

**Interfaces:**
- Produces: `baselineCase(d: EvalCase): EvalCase` — `id: "a-" + brief`, `test: "A"`, same `brief`, `starter`, `routes`, `stack`, `mac`, `maxTurns`, `maxBudgetUsd`, `minutes`; `prompt` = the D prompt without `/motif:init` and Motif's words: `Build the app described in brief.md in this folder; it has the answers to any questions you'd ask. Put the welcome page at /, sign-in at /sign-in and home at /home. Make it look and work well.\n\n${UNATTENDED}` (each brief's own routes and noun, and SwiftUI's preview wording, as its `d-*` has them). `isBaseline(c)`; `pairedCase(c)` (`a-x` ↔ `d-x`).
- `RunState.cases[id]` for `a-*` records build and type-check facts like D's (`AFacts = Pick<DFacts, "build" | "typecheck" | "screens">`).
- [ ] **Step 1: Failing tests:** ten `a-*` cases, one per D brief, each equal to its `d-*` but `test`, `id` and `prompt`; no prompt contains "motif" (case-insensitive) or `/motif:`; `--tests A` selects them; an A session's spec has no `pluginDir` and the isolation check passes with zero plugins and fails if any plugin loads; with A selected, `d-*` and `a-*` folders are kept after grading until Task 2's step runs (a stub); `--list` shows 49 cases.
- [ ] **Step 2:** `cd cli && bun test test/evals-cases.test.ts test/evals-run.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `UNATTENDED` stays shared (check it names nothing Motif-specific; if it does, give A its own copy without it).
- [ ] **Step 4:** run plus every `test/evals-*.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(evals): Test A cases — each brief built without Motif, no plugins`.

### Task 2: Shots and anonymous pairs

**Files:**
- Create: `tests/evals/pairs.ts`
- Modify: `tests/evals/run.ts` (after a brief's `d-*` and `a-*` are both graded: shoot, pair, then remove the kept folders unless `--keep`)
- Test: `cli/test/evals-pairs.test.ts`

**Interfaces:**
- Produces: `interface Pair { id: string; brief: string; screen: string; size: number; motif?: string; baseline?: string; outcome: "both" | "motif-only" | "baseline-only" | "neither"; why?: string }` (paths relative to the run folder, under `a/`); `shotSizes(stack?: StackId): number[]` (`[390, 1440]` for web stacks, `[390]` for Flutter, Compose, Expo and SwiftUI); `async function shootPairs(brief: string, motifApp: string, baselineApp: string, c: EvalCase, out: string, k: Collectors): Promise<Pair[]>`; `stripPng(bytes: Uint8Array): Uint8Array` (keeps only `IHDR`, `PLTE`, `tRNS`, `IDAT`, `IEND`); `pairsFile = "a/pairs.json"`.
- Shots: `motif shot --routes <the case's routes> --sizes <shotSizes> --scheme light` (use the flags `motif shot --help` names for light-only, LTR and English), the same command for both apps; each PNG through `stripPng`, saved as `a/img/<random 12-hex>.png`.
- [ ] **Step 1: Failing tests:** `stripPng` drops `tEXt`/`iTXt`/`zTXt`/`eXIf`/`tIME` chunks and keeps the image decodable (byte-compare the IDAT chunks); shootPairs with a fake `motif shot` gives one pair per screen × size with both sides, `baseline-only`/`motif-only` when one side's shot fails (its `why` recorded), `neither` when both fail; file names are random and never contain "motif", "base", "d-", "a-" or the brief; a baseline app with no dev script gives `motif-only` pairs, not a thrown error (Review Focus 1).
- [ ] **Step 2–4:** run, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(evals): Test A shoots both apps the same way into anonymous pairs`.

### Task 3: AI judges

**Files:**
- Create: `tests/evals/judge-a.ts`, `tests/evals/rubric-a.md`
- Modify: `tests/evals/run.ts` (judge every `both` pair after shooting; resumable)
- Test: `cli/test/evals-judge-a.test.ts`

**Interfaces:**
- Produces: `JUDGE_A_SCHEMA` (`{ pick: "left" | "right" | "tie", why: string }`); `judgeAPrompt(brief: BriefParts, rubric: string): string` (the brief's "What it is", "Who it's for" and "Feel" sections, the rubric, and "Left" / "Right" images by path, nothing else); `pairResult(first: Pick, second: Pick): "motif" | "baseline" | "tie"` (first judgement has Motif on the left, second on the right; a side wins only when both judgements pick it); judgements saved to `a/judgements.json` as `{ pairId, order: "motif-left" | "motif-right", pick, why }[]`, written after each one.
- The judge is one read-only Claude Code session per judgement (Read only, as test C's grader), `--judge-model` honoured, with decision 0003's isolation.
- `rubric-a.md`: the six criteria of spec §6 in plain words, how to weigh them, and that a screen that fails to render loses.
- [ ] **Step 1: Failing tests:** `pairResult` truth table (left/right/tie × both orders); the prompt contains the three brief sections and no other brief text, and never "motif"/"baseline"/the image file names' origin; a usage limit after N judgements pauses, and resuming judges only the pairs left (Review Focus 3); only `both` pairs are sent to a judge (one-sided pairs are scored in Task 4).
- [ ] **Step 2–4:** run, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(evals): Test A's AI judges, each pair judged twice with the sides swapped`.

### Task 4: Scores, the verdict and the report

**Files:**
- Create: `tests/evals/score-a.ts`
- Modify: `tests/evals/report.ts` (`TEST_NAMES.A = "Test A — with and without Motif"`; `testVerdicts` and `renderReport` for A)
- Test: `cli/test/evals-score-a.test.ts`, `cli/test/evals-report.test.ts`

**Interfaces:**
- Produces: `interface BriefScore { brief: string; pairs: number; ai: { motif: number; baseline: number; tie: number }; owner?: { motif: number; other: number }; left: string[]; pass: boolean | null; why: string }`; `scoreBrief(brief: string, pairs: Pair[], results: Map<string, "motif" | "baseline" | "tie">, owner?: Map<string, "motif" | "baseline" | "same">): BriefScore`; `verdictA(scores: BriefScore[], expected: string[]): { status: "pass" | "fail" | "incomplete"; detail: string }`.
- Rules (spec §6): `motif-only` pairs count as Motif wins and `baseline-only` as baseline wins, for AI and owner alike; `neither` is left out (listed in `left`). AI pass: `motif / judged ≥ 0.70` and `baseline / judged ≤ 0.15`. Owner pass: `motif / judged > 0.5`, "same" counted in `judged`. No owner votes yet → `pass: null`, "waiting for the owner's votes". `verdictA` is incomplete while any expected brief has `pass: null` or no pairs (Masar off a Mac); fail when any brief fails; else pass.
- [ ] **Step 1: Failing tests:** boundaries (7/10 Motif and 1/10 baseline passes; 7/10 and 2/10 fails on the 15%; 6/10 fails), the owner's "same" counted, one-sided pairs, a `neither` pair left out, every brief must pass (nine pass and one fails → fail), Masar missing → incomplete (Review Focus 5), the report's Test A section lists each brief's numbers and why.
- [ ] **Step 2–4:** run, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(evals): Test A scores each brief on its own, and passes only when every brief does`.

### Task 5: The comparison page and the owner's judging

**Files:**
- Create: `tests/evals/page-a/template.html` (the page: markup, styles, script), `tests/evals/page-a.ts` (writes the page for a run; serves owner mode), `tests/evals/judge-owner.ts` (CLI: `bun tests/evals/judge-owner.ts <run>`)
- Modify: `tests/evals/README.md`
- Test: `cli/test/evals-page-a.test.ts` (unit, plus one browser test that skips without Chrome)

**Interfaces:**
- Produces: `writePage(run: string, mode: "owner" | "public", pairs: Pair[]): string` (path of the HTML; images referenced by their random names, never inlined with telling names); `serveOwner(run: string, port?: number): Promise<{ url: string; stop(): void }>` — serves the page and `POST /vote { pairId, pick: "left" | "right" | "same", order }` appending to `a/owner-votes.json` (one vote per pair; a second vote replaces it); `GET /votes` for resuming.
- The page: one pair at a time, side by side above 720 px and stacked below; sides shuffled per voter (owner: per pair, recorded as `order`); "Left", "Right", "About the same"; keyboard 1/2/3; progress "12 of 48". Owner mode shows every pair whose sides both or one rendered (not `neither`), in a random order, and reveals nothing until the last vote, then shows Motif's side per pair. Motif's preview style (`skill/preview-kit/kit.css` tokens) for the page's own look.
- [ ] **Step 1: Failing tests:** the written HTML and every served response contain no "motif", "baseline", `d-`/`a-` case ids, brief-folder names or the mapping before the last vote (Review Focus 2; the reveal data arrives from `GET /reveal` only once votes cover every pair); a vote is saved immediately and reopening resumes at the next unjudged pair (Review Focus 4); browser test: the page loads, three votes by keyboard reach `owner-votes.json`.
- [ ] **Step 2–4:** run, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(evals): the blind comparison page, and the owner's judging served from the run`.

### Task 6: (dropped)

The public voting page was dropped on 2026-10-26: the owner's LinkedIn post invites comments, not votes (spec §2).

### Task 7: The release checklist and the docs

**Files:**
- Create: `docs/release-checklist.md` (spec §7's eight steps, each with how and how to tell it passed), `docs/test-a.md` (a table per run: brief, pairs, AI Motif/baseline/tie, owner Motif/other, pass; and the overall verdict — empty until the run), `docs/decisions/0013-test-a-judges.md` (Test A judged by AI and the owner, blind, before release; the owner's decision of 2026-10-26)
- Modify: `docs/specs/2026-10-12-motif-core-design.md` (§3's Test A row: "AI judges and the owner, blind, before release"; §13.3 points to the Part 4 spec), `tests/evals/README.md` (Test A: what it builds, judges, the page, `judge-owner.ts`, the 49 sessions), `cli/test/release.test.ts`
- Test: `cli/test/release.test.ts` (the checklist has its eight steps in order, by their headings; `docs/test-a.md` exists; the core spec's Test A row no longer says only "Human")
- [ ] **Step 1–4:** tests, write, run → PASS (plus `test/evals-docs.test.ts`).
- [ ] **Step 5: Commit** `docs: the release checklist, Test A's record and decision 0013`.

### Task 8 (controller): the run, the owner's judging, and v1.0.0

Not a subagent task; the controller does it with the owner, following `docs/release-checklist.md`:
- [ ] Final whole-branch review, fix wave, merge to `main`, CI green (checklist step 1).
- [ ] The full run on the candidate: `bun tests/evals/run.ts --tests A,B,C,D` with the portable Node 24 first on PATH; the SwiftUI cases and `a-masar`/`d-masar` on the Mac mini, resuming the same run. Every B, C and D case passes; recorded in `docs/parity.md`.
- [ ] The owner judges: `bun tests/evals/judge-owner.ts <run>`; the verdict and per-brief table go in `docs/test-a.md`. A brief that fails blocks v1.0.0: improve that stack, re-run its evals and all of Test A on the new candidate, and judge again.
- [ ] v1.0.0 on a release branch: notes `docs/releases/v1.0.0.md` (every stack supported, Test A's result), `skill/VERSION` 1.0.0, the README without "Preview"; merged on the owner's go-ahead; tag, release workflow, marketplace (checklist steps 4–8).
- [ ] After the release, the owner posts about Motif on LinkedIn.
