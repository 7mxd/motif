# Motif — Release evaluation and v1.0.0 (Part 4)

- Date: 2026-10-26
- Status: Approved 2026-10-26
- Builds on: `docs/specs/2026-10-12-motif-core-design.md` (release criteria §3, program §4, tests §13), `docs/decisions/0003-evals-on-your-plan.md` (evals run on the developer's Claude plan), and the eval runner in `tests/evals/` (tests B, C and D on every stack)
- Leads to: v1.0.0

## 1. Summary

Motif v1 ships when Parts 1–4 are done (core spec §4). Parts 1–3 are done and released (v0.6.0, then v0.6.1): the core, all nine stacks, and the packages for six agents. Part 4 is the release evaluation:

- **Test A**, the blind side-by-side the core spec names: the same briefs built with and without Motif, and the two results compared by judges who don't know which is which.
- **The release checklist**: one written list of everything a release must pass, used for v1.0.0 and every release after it.

Then v1.0.0 is released, and the owner shares it on LinkedIn.

## 2. Why, and what changed from the core spec

The core spec planned Test A as a human test run before each release. The owner has no panel of judges and can't count on replies before release: Motif will be shared on LinkedIn *after* v1.0.0, so outside judges can't be what decides the release. The owner's decision (2026-10-26):

- **Before v1.0.0**, Test A is judged by **AI judges** and by **the owner** on the same blind page. It is the release gate.
- **After v1.0.0**, the owner shares Motif in a LinkedIn post, and people who try it may comment. That is feedback, not judging: no votes are collected and nothing is published for voting (the owner's clarification, 2026-10-26).

## 3. Goals, non-goals, anti-goals

**Goals**
- A fair answer to "does an agent with Motif build better-looking, better-made apps than the same agent without it?", across Motif's stacks, before v1.0.0.
- A blind comparison page that makes judging every pair quick for the owner.
- One release checklist that v1.0.0 and later releases follow.

**Non-goals**
- Recruiting judges, paid panels, or posting to Reddit. The owner posts on LinkedIn after the release; nothing else is promised.
- Comparing Motif with other design skills or plugins. The baseline is the same agent without Motif.
- A website for Motif.

**Anti-goals** (failures even if the test "passes")
- A rigged comparison: the baseline given a worse prompt, less time, a different model, or broken screenshots.
- A judging page that gives away which side is Motif (labels, file names, URLs, order, Motif's own preview frame or watermarks).
- A gate that can't fail: a pass rule loose enough that a coin toss passes it.

## 4. Test A: the builds

**Briefs.** The ten Test D briefs in `tests/fixtures/briefs/`, one app each: Stride, Ledgerly and Bloom (web), Sahm (Flutter), Nabta (Jetpack Compose), Rihla (React Native with Expo), Darb (Vue), Nuzha (Svelte), Sanad (Angular) and Masar (SwiftUI, on a Mac). All are in English and Arabic.

**With Motif.** The `d-*` cases of the full eval run on the release candidate (§7) already build each brief with Motif. Test A reuses those apps; it doesn't build them again.

**Without Motif.** One new case per brief, `a-<brief>`, run by the same runner (`tests/evals/run.ts`), under decision 0003's isolation: a fresh Claude Code session on the developer's plan, the same model, the same time limit, the same tools, auto mode, no MCP servers, **and no plugins at all** (Motif's left out). The prompt is the `d-*` prompt with every mention of Motif removed: build the app the brief describes, with these starter routes, and make it look and work well. Nothing in it asks for a worse result. The SwiftUI case runs on the Mac mini, and is skipped elsewhere with the reason, as the SwiftUI evals are.

**One run.** Test A is a fourth test of the same runner (`--tests A`), run in the same eval run as B, C and D on the release candidate, so a full run is 49 sessions (45 off a Mac). The run keeps the `d-*` app folders until Test A has shot them. *(Builder's call.)*

**Retries.** Only a session cut off by a usage limit, a crash or Ctrl+C is run again, as the runner already does. A session that finished stands, whatever it built: the baseline is never re-rolled until Motif wins. *(Builder's call.)*

**What a build must do to count.** Both apps of a brief are built and type-checked as Test D does. A side whose app doesn't build, or whose screen doesn't render, loses that pair (it's recorded as such, not dropped). A pair where neither side renders is left out and recorded. *(Builder's call.)*

## 5. Test A: the screenshots and the pairs

**Screens.** For each brief, its starter screens (the three Test D names in each prompt), captured afresh with `motif shot` from both apps in one step with the same flags (Test D's own screenshots aren't reused) *(builder's call)*: light, at a phone width (390) and, for web apps, a desktop width (1440), English, left to right. `motif shot` works on an app made without Motif, since it reads the app's routes and starts its own dev server.

**What hides the side.** Shots are re-encoded to plain PNGs with no metadata and named by a random id. Neither side's screenshot shows a browser frame, a URL, or anything Motif adds. The app's own name is the brief's, so it is the same on both sides.

**A pair** is one screen at one size: the two apps' screenshots. About 50 pairs in all (10 briefs, 3 screens, 1 or 2 sizes).

## 6. Test A: the judging

**AI judges.** Each pair is judged by a read-only Claude Code session (as test C's grader, decision 0003) with a written rubric, `tests/evals/rubric-a.md`. The judge sees the brief's "What it is", "Who it's for" and "Feel" sections and the two screenshots labelled only "Left" and "Right". It answers in a JSON schema: left, right or tie, and one sentence why. The rubric weighs what the core spec promises Motif improves:
- visual hierarchy and layout;
- consistency (spacing, type, colour, components);
- typography;
- colour and contrast (readability included);
- polish (alignment, states that look finished);
- fit to the brief's feel and audience.

Every pair is judged **twice, with the sides swapped**. A side wins the pair only when both judgements pick it; anything else is a tie. This cancels position bias.

**The owner.** The owner judges in the page's owner mode: every pair of the run, blind, in a random order, with nothing revealed until the last vote. The runner serves the page on the owner's computer for this, so the votes go straight into the run's results. *(Builder's call.)*

**Pass: Motif must win on every stack** (the owner's decision, 2026-10-26). Each brief is scored on its own pairs, so web briefs, which have twice the pairs, count no more than the others. Test A passes when, for **every brief**:
- the AI judges pick Motif's side in **at least 70%** of its pairs, and the baseline in **at most 15%**; and
- the owner picks Motif's side in **more than half** of its pairs, counting "about the same" as not a win.

A brief that falls short blocks v1.0.0 until that stack is improved and Test A passes again. Masar's pairs, from the Mac mini, are needed before the verdict.

**After a failure.** When Motif is changed to fix a stack, the eval cases of the stacks the change touches and all of Test A run again on the new candidate; the other stacks' passing B, C and D results stand. *(Builder's call.)*

Every pair, every judgement and every "why" is kept in the run's results, and `docs/test-a.md` records the verdict per brief and overall, as `docs/parity.md` records each stack's evals.

**The comparison page.** One page per run, served by the runner on the owner's computer only:
- It shows one pair at a time, side by side, with the sides shuffled.
- The owner picks the better one, or "about the same".
- At the end, it shows which side was Motif's in each pair.

## 7. The release checklist

`docs/release-checklist.md`: the steps a release follows, in order, each with how to do it and how to tell it passed. For v1.0.0 and every release after it:

1. **Code**: `main` is green on CI on Windows, macOS and Linux, including every stack's job.
2. **Evals and Test A**: a full run of tests A, B, C and D on the release candidate (49 sessions; 45 off a Mac, with the SwiftUI cases and Masar's Test A pair on the Mac mini, resuming the same run). Every B, C and D case passes, recorded in `docs/parity.md`.
3. **Test A**: the owner judges in owner mode, and Test A passes on every brief, recorded in `docs/test-a.md`.
4. **Release gate**: `MOTIF_RELEASE=1 bun test test/release-gate.test.ts` passes.
5. **Notes and version**: release notes in `docs/releases/v<version>.md`, `skill/VERSION`, and the README's notes, prepared on a release branch (`release/v<version>`) and merged to `main` only on the owner's go-ahead.
6. **Tag**: an annotated tag `v<version>` ("Motif v<version>") is pushed. The release workflow builds, checks and publishes, and every job passes, including the six agents' installs.
7. **Marketplace**: `.claude-plugin/marketplace.json` points at the new release's Claude Code zip with its checksum from `SHA256SUMS`.
8. **After**: memory and backlog are updated, and release worktrees and branches are removed.

A test pins the checklist's steps so it can't silently lose one.

## 8. v1.0.0

v1.0.0 follows the checklist. Beyond v0.6.0, its notes say what 1.0 means: every stack in the parity table is supported, and Test A's result. The README drops "Preview". After the release, the owner posts about Motif on LinkedIn.

## 9. Constraints

- Evals and Test A run on the developer's own Claude plan, never an API key, only when the developer starts them (decision 0003). Test A adds ten build sessions and about a hundred short judge sessions to a full eval run.
- The core spec's §3 row for Test A changes from "Human" to "AI judges and the owner, blind, before release"; §13.3 points here.

## 10. Left to the builder

- The rubric's exact wording and the JSON schema.
- The page's design, in Motif's own preview style.
- Whether `a-*` cases need a Mac-only path beyond what SwiftUI evals already have.
- Calls marked *(builder's call)* above were settled while writing this spec; the owner can overturn any of them.
