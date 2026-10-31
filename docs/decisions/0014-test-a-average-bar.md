# 0014 — Test A passes on the briefs' average

- Date: 2026-10-31
- Status: Accepted. Amends decision 0013's second point.
- Context: decision 0013 had Motif win on every brief, in one run: the AI judges at least 70% for Motif and at most 15% for the baseline, the owner more than half, for each of the ten briefs on its own. Over plan 2L's 17 runs and two rounds of blind judging by the owner, every brief passed in some run, but never all ten in the same one. Each run builds both apps afresh, so a brief with three or six pairs moves by a pair or two from run to run, and the briefs that miss change from one run to the next. Two more rounds of guidance left the owner's share where it was (65% both times) while the AI judges' rose (73% to 79%). The owner decided on 2026-10-31 to judge Motif on its overall result and release v1.0.0 on it.

## Decisions

1. **Test A passes on the briefs' average.** Each brief's shares are taken on its own pairs, then averaged over the briefs, each counting the same (so a web brief with six pairs counts no more than a native one with three). Test A passes when the average clears the same bars as before: the AI judges pick Motif in at least 70% of a brief's pairs and the baseline in at most 15%, and the owner picks Motif in more than half ("about the same" isn't a win).
2. **No brief is lost outright.** Test A fails if the baseline wins any brief with both kinds of judge: the AI judges pick the baseline in more of its pairs than Motif, and the owner picks Motif in fewer than half.
3. **Each brief's own result is still reported.** The report's table keeps each brief's verdict against the old bar, and the Test A verdict names the briefs below it ("Below the bar on their own: …"). `docs/test-a.md` records them for each run.
4. **Everything else in 0013 stands:** the two kinds of judge, both blind; pairs judged twice with the sides swapped; forfeits named; a brief whose two apps different models built is pending, and the verdict waits for it.

## Why

- A gate that one noisy brief can close will rarely open, however good Motif gets: with three to six pairs a brief, a single pair is 17 to 33 points.
- The average still asks Motif to win clearly overall, with both kinds of judge, and the floor keeps a stack where Motif makes things worse from passing unseen.
- The briefs below the bar stay visible, so the next round of work knows where to look.

## Consequences

- `tests/evals/score-a.ts` gives each brief its `shares` once nothing waits, and `verdictA` averages them. Tests: `cli/test/evals-score-a.test.ts`.
- Round 26 (b28387b, runs 20261030-202113 and 20261030-092116) passes: the AI judges averaged 82% for Motif and 8% for the baseline, and the owner 65%. Seven briefs were below the bar on their own.
