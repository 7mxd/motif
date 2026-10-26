# The release checklist

The steps a release follows, in order. Each says how to do it and how to tell it passed. v1.0.0 and every release after it follow this list ([Part 4 spec](specs/2026-10-26-motif-part4-release-evaluation-design.md) §7). Its steps are pinned by a test, so it can't lose one without notice.

## 1. Code

`main` is green on CI on Windows, macOS and Linux, including every stack's job.

- How: look at the latest CI run on `main` on GitHub.
- Passed when: every job is green on all three systems.

## 2. Evals and Test A

A full run of tests A, B, C and D on the release candidate. A run of only some cases can report Test A on fewer briefs, so run all of them.

- How: `bun tests/evals/run.ts --work <a folder> --model <id> --judge-model <id>`. Name both models, so every session uses the same one however long the run takes (a usage-limit pause, the Mac's part): a brief whose two apps different models built can't pass until both are built again. Choose a `--work` folder whose path doesn't contain "motif" (the default, `~/.motif-evals`, does), so the baseline sessions never see Motif's name. A full run is 49 sessions. Off a Mac it is 44: the four SwiftUI cases and `a-masar` need the Mac mini. Run those there, resuming the same run. A re-run of Test A runs D too: Test A compares each app with the one Motif builds, so the runner adds each `d-*` an `a-*` needs (`--tests A` runs `--tests D,A`) and says so.
- Passed when: every B, C and D case passes, and `docs/parity.md` records it.

## 3. Test A

The owner judges every pair, blind.

- How: once the whole run has finished, the Mac part included and its run folder brought back from the Mac, run `bun tests/evals/judge-owner.ts <run>`, then vote on every pair. The answers stay locked until every brief's pairs are in and each has a vote, so no pair is judged after seeing which side is Motif's. [Test A](test-a.md) says how it is scored.
- Passed when: Test A passes on every brief, and `docs/test-a.md` records the run and the verdict.

## 4. Release gate

- How: `MOTIF_RELEASE=1 bun test test/release-gate.test.ts`, in `cli/`.
- Passed when: it passes.

## 5. Notes and version

- How: on a release branch (`release/v<version>`), write the release notes in `docs/releases/v<version>.md`, set `skill/VERSION`, and update the README's notes. Open a pull request into `main`. Merge it only on the owner's go-ahead.
- Passed when: the pull request is merged and `main` is green.

## 6. Tag

- How: push an annotated tag `v<version>` with the message "Motif v<version>". The release workflow builds, checks and publishes.
- Passed when: every job of the release workflow passes, including the six agents' installs, and the release has its files and `SHA256SUMS`.

## 7. Marketplace

- How: in a pull request, point `.claude-plugin/marketplace.json` at the new release's `motif-claude-code.zip`, with its checksum from `SHA256SUMS`. Merge it.
- Passed when: `/plugin marketplace add 7mxd/motif` then `/plugin install motif@motif` installs the new version.

## 8. After

- How: update memory and the backlog, and remove the release worktrees and branches.
- Passed when: no release branch or worktree is left, and the backlog says what is still open.
