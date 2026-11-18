# 0016 — Test A's two sides show the same content

- Date: 2026-11-18
- Status: Accepted. Adds to decisions 0013 and 0014; their bars stand.
- Context: in run 20261113-052637 (commit 8dd1e1b) the AI judges picked Motif in 87% of a brief's pairs, but the owner in only 48%. Judging the pairs, the owner found that the two sides of a pair often showed different things: one booking page had four of the same button, the other four different ones; one list had three items, the other five. Each side made up its own content, so a pick was partly about the content, not only the design. The owner asked that every pair show "the exact page and exact data … so the design is the main difference", and said they would mark a side that didn't follow it.

## Decisions

1. **Each brief fixes its content.** Every D and A brief ends with `## Content`: one sub-heading per screen, `### <Label> (<screen>)`, listing the items in order with their situations and actions, and every title, button, field and link label. Its first line says to show exactly that, no more and no less, and leaves the look and layout to the app. Both sides get the same brief, so both are asked for the same content.
2. **The runner checks it.** A run whose chosen D or A brief lacks the section, its first line, or a screen's sub-heading stops before it starts, naming the brief and the screen.
3. **A side that doesn't follow the content loses the pair.** The AI judges are given the screen's content and answer `offContent` (left, right, both or none); a marked side loses that judgement, and when both are marked the pick stands as judged. The owner's page has a "Didn't follow the content" button under each side: one mark saves a vote for the other side, both marks save "about the same".
4. **The bars don't change.** Test A still passes on the briefs' average as decision 0014 says. The report counts the marks against each app, from the judges and from the owner, so a side that wins by skipping content shows.

## Why

- Test A asks whether Motif makes a better design. Pairs that differ in content measure the content too, and the owner can't separate the two at a glance.
- Fixing the content in the brief costs nothing at run time and is the same for both sides, so neither is helped.
- Losing the pair, rather than leaving it out, keeps a side from gaining by drawing less.

## Consequences

- `tests/evals/content.ts` reads the section and `preflight` checks it; `judge-a.ts` and `rubric-a.md` give the judges the content; `page-a.ts` and its template add the marks; `score-a.ts` and `report.ts` count them. Tests: `cli/test/evals-content.test.ts`, `evals-judge-a.test.ts`, `evals-page-a.test.ts`, `evals-score-a.test.ts`.
- Runs before this decision had no content to follow; their judgements and votes read the same as before, with no marks.
