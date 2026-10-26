# 0013 — Test A is judged by AI and the owner, before release

- Date: 2026-10-26
- Status: Accepted
- Context: the core spec planned Test A as a blind comparison judged by people, before each release. The owner has no panel of judges, and Motif will be shared on LinkedIn only after v1.0.0, so outside judges can't decide the release. The owner decided this on 2026-10-26 (Part 4 spec, §2).

## Decisions

1. **Two kinds of judge, before release.** AI judges (read-only Claude Code sessions with `tests/evals/rubric-a.md`) judge every pair twice, with the sides swapped. A side wins only when both judgements pick it. The owner judges every pair too, blind, in a random order, on a page served from their own computer (`bun tests/evals/judge-owner.ts <run>`).
2. **Motif must win on every brief.** The AI judges pick Motif in at least 70% of a brief's pairs and the baseline in at most 15%. The owner picks Motif in more than half. One brief that falls short blocks v1.0.0.
3. **No public voting.** Nothing is published for votes. After v1.0.0 the owner posts about Motif on LinkedIn, and the post invites comments only. Comments are feedback, not results.
4. **The baseline is the same agent without Motif**: same model, time limit and tools, no plugins, a prompt with every mention of Motif removed. It is never re-rolled until Motif wins.

## Why

- There is no judge panel, and replies can't be counted on before release. A gate that waits for strangers would never close.
- Release comes before sharing, so the people who see Motif first can't be the ones who judge it.
- Two AI judgements with the sides swapped cancel position bias, and the owner's blind vote keeps a human in the gate.

## Consequences

- Test A runs on the developer's Claude plan, never an API key, only when the developer starts it (decision 0003). A full run is 49 sessions, 44 off a Mac.
- Known biases are listed in `docs/test-a.md`.
- The release checklist (`docs/release-checklist.md`) has Test A as steps 2 and 3.
