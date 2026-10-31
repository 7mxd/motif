# Test A: with Motif and without

Test A builds the same ten briefs with Motif and without it, shoots both apps the same way, and has AI judges and the owner pick the better screen without knowing which is which. It is part of the release gate ([Part 4 spec](specs/2026-10-26-motif-part4-release-evaluation-design.md), [decision 0013](decisions/0013-test-a-judges.md)).

## The pass rule

Motif must win on every brief. For each brief, on its own pairs:

- The AI judges pick Motif's side in at least 70% of the pairs, and the baseline in at most 15%. Each pair is judged twice, with the sides swapped. A side wins only when both judgements pick it.
- The owner picks Motif's side in more than half of the pairs. "About the same" is not a win.
- A side whose app doesn't build loses every pair. A brief Motif wins that way, or with no pair that has both apps' screens, is won by forfeit: the report's row and the verdict say so and name the log to read (`a-<brief>/build.log`, the stack's own log, or `pair-shots.json`) before the win is accepted.
- Both apps of a brief are built by the same model. A brief whose two apps different models built can't pass: it stays pending until both are built again.

A brief that falls short blocks the release until that stack is improved and Test A passes again. A re-run of Test A runs D too: each app built without Motif is compared with the one Motif builds on the new candidate, so the runner adds the `d-*` cases (`--tests A` runs `--tests D,A`).

## Known biases

Test A is fair, not perfect. These are the known ways it leans:

- PNG colour chunks (gAMA, sRGB, iCCP) are dropped on both sides, so both show as sRGB. Colours can differ a little from what a device shows.
- Compose baselines that load Google Fonts at runtime (the downloadable-fonts provider) fall back to Roboto under Robolectric: Compose's shot wires fonts only through Motif's own theme. They may look plainer than they would on a device. Flutter baselines get the google_fonts families their code names (`GoogleFonts.onest(…)`, `GoogleFonts.getFont('Onest')`): Motif's shot downloads them into its cache and loads them before drawing, as it does for an app made with Motif. Only a family named at runtime (a variable passed to `getFont`), or one that can't be downloaded, falls back, and the shot's notes say so.
- Expo apps on both sides get Expo's web packages installed before shooting. The setup is equal.
- SwiftUI shots name each app's own previews.
- A pair's screenshot is the app's first screen, taken on its own. A page that fades its content in from `opacity: 0` can be caught before it shows: the final run's Ledgerly phone welcome without Motif was blank in its pair, though its own full screenshot shows the page. That pair counts for Motif in the table below, and it shouldn't: without it, Ledgerly is 4 / 1 for the AI judges and 1 / 4 for the owner. Waiting for the page to settle before the pair's shot is on the backlog.

## Where it stands before v1.0.0

The final run on the v0.7.0 candidate (run 20261029-210923, guidance at 162da5b; Masar on the Mac, run 20261029-102812) didn't pass Test A. By the pass rule, Stride and Nabta passed and every other brief fell short.

- **AI judges.** Across that run's 48 pairs, Motif won 35 (73%) and the baseline 8 (17%). Across the 15 runs of plans 2L's tuning (312 pairs, guidance changing between runs), Motif won 66% and the baseline 19%. Every brief passed in at least one run, but never all in the same run: each run builds both apps afresh, so a brief swings by about two pairs from run to run, and the judges' taste for a layout swings too (a sign-in in a card or without one, compact rows or illustrated ones).
- **The owner** judged all 48 pairs blind, on a phone (a private page that showed the same pairs, in the same order and on the same sides as `judge-owner.ts`, and saved each answer as it was given). Motif won 31 (65%), the baseline 16 (33%), about the same 1. By brief: Sanad 6 / 0, Stride 5 / 0 / 1, Nuzha 5 / 1, Darb 4 / 2, Sahm, Nabta and Rihla 2 / 1 each, Bloom 3 / 3, Ledgerly 2 / 4, Masar 0 / 3.
- **What the owner's notes ask Motif to take from the baseline:** a map with the picture on a place's card (Sahm, Nuzha, Stride); more on each card, but in order (Sanad's requests); a real chart where the brief is about money (Ledgerly); a desktop layout, not a phone layout on a wide screen (Bloom); no text cut off (Nabta); a lighter top bar (Darb); the app's name or mark in sight (Sahm, Sanad, Bloom); and a calmer, better-ordered sign-in (Masar).

So Motif usually makes the difference a person sees, and not yet on every brief.

Two more rounds of guidance followed: round 25 (fd1d6e7) from the owner's notes, and round 26 (b28387b) from round 25's misses. Each was checked with a full Test A run.

- **AI judges.** Round 25: Motif 38 of 48 (79%), baseline 6 (12.5%). Round 26: Motif 38 (79%), baseline 5 (10%). Two of round 26's Nabta pairs count for Motif because the app without Motif has no route to the screen (a Compose app with no `NavController` can only have its first screen drawn), so they aren't a fair comparison.
- **The owner** judged round 26's 46 fair pairs blind, on the same kind of phone page. Motif won 30 (65%), the baseline 14 (30%), about the same 2. That is the same share as the first round, but spread differently. Bloom went from 3 / 3 to 6 / 0 and Darb from 4 / 2 to 5 / 1. Stride went from 5 / 0 to 3 / 2, Rihla from 2 / 1 to 1 / 2 and Masar from 0 / 3 to 1 / 2.
- **By the pass rule**, round 26 passes Sahm, Nabta and Darb. Stride and Masar fall short on the owner's side only. Bloom and Sanad fall short on the AI side only, by one pair each. Ledgerly, Rihla and Nuzha fall short on both sides.
- **What the owner's notes ask for now:** the date on a home's focus card (Masar), a "Your next run" card (Stride), a picture at the top of a phone sign-in (Stride), no truncated text on a trip's rows (Rihla), richer filters (Nuzha), and no actions that need an account shown to someone signed out (Bloom). A highlight colour must mean something: the owner asked why a past date was yellow (Darb). Several notes said Motif's screen was nicer but picked the other one for a single feature it lacked.

The guidance has plateaued at about four Motif wins in five for the AI judges and two in three for the owner. Each run rebuilds both apps, so a brief's result moves by a pair or two between runs, and the briefs that miss change from one run to the next. Whether v1.0.0 ships on this record, or waits for more work, is the owner's call.

## Runs

One row per brief of each run, with the run's id (its folder in `tests/evals/results/`), the candidate's commit and the model both sides were built by (`--model`). Keep failed runs too: a new candidate re-runs both sides, so each run is its own record.

| Run | Commit | Model | Brief | Pairs | AI: Motif / baseline / tie | Owner: Motif / other | Verdict |
|---|---|---|---|---|---|---|---|
| 20261029-210923 | 162da5b | claude-opus-5-5 | Stride | 6 | 6 / 0 / 0 | 5 / 0 (1 about the same) | pass |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Ledgerly | 6 | 5 / 1 / 0 | 2 / 4 | fail (one pair's baseline shot was blank, see the biases) |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Bloom | 6 | 5 / 1 / 0 | 3 / 3 | fail |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Sahm | 3 | 1 / 1 / 1 | 2 / 1 | fail (Motif's app failed a check: a false finding, fixed in 5ec38c9) |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Nabta | 3 | 3 / 0 / 0 | 2 / 1 | pass |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Rihla | 3 | 0 / 1 / 2 | 2 / 1 | fail |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Darb | 6 | 5 / 1 / 0 | 4 / 2 | fail |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Nuzha | 6 | 3 / 1 / 2 | 5 / 1 | fail |
| 20261029-210923 | 162da5b | claude-opus-5-5 | Sanad | 6 | 4 / 2 / 0 | 6 / 0 | fail |
| 20261029-102812 | 162da5b | claude-opus-5-5 | Masar (on the Mac) | 3 | 3 / 0 / 0 | 0 / 3 | fail |
| 20261030-093708 | 0b43c96 | claude-opus-5-5 | Sahm (again, after the Flutter check's fix) | 3 | 1 / 1 / 1 | not judged | fail |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Stride | 6 | 5 / 0 / 1 | not judged | AI side passes |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Ledgerly | 6 | 2 / 3 / 1 | not judged | fail |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Bloom | 6 | 4 / 1 / 1 | not judged | fail |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Sahm | 3 | 3 / 0 / 0 | not judged | AI side passes |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Nabta | 3 | 3 / 0 / 0 | not judged | AI side passes |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Rihla | 3 | 2 / 1 / 0 | not judged | fail |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Darb | 6 | 6 / 0 / 0 | not judged | AI side passes |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Nuzha | 6 | 4 / 1 / 1 | not judged | fail |
| 20261030-132940 | fd1d6e7 | claude-opus-5-5 | Sanad | 6 | 6 / 0 / 0 | not judged | AI side passes |
| 20261030-022944 | fd1d6e7 | claude-opus-5-5 | Masar (on the Mac) | 3 | 3 / 0 / 0 | not judged | AI side passes |
| 20261030-202113 | b28387b | claude-opus-5-5 | Stride | 6 | 6 / 0 / 0 | 3 / 2 (1 about the same) | fail |
| 20261030-202113 | b28387b | claude-opus-5-5 | Ledgerly | 6 | 3 / 2 / 1 | 2 / 3 (1 about the same) | fail |
| 20261030-202113 | b28387b | claude-opus-5-5 | Bloom | 6 | 5 / 1 / 0 | 6 / 0 | fail |
| 20261030-202113 | b28387b | claude-opus-5-5 | Sahm | 3 | 3 / 0 / 0 | 2 / 1 | pass |
| 20261030-202113 | b28387b | claude-opus-5-5 | Nabta | 3 | 3 / 0 / 0 | 3 / 0 | pass (two pairs had no screen without Motif, see above) |
| 20261030-202113 | b28387b | claude-opus-5-5 | Rihla | 3 | 2 / 0 / 1 | 1 / 2 | fail |
| 20261030-202113 | b28387b | claude-opus-5-5 | Darb | 6 | 6 / 0 / 0 | 5 / 1 | pass |
| 20261030-202113 | b28387b | claude-opus-5-5 | Nuzha | 6 | 2 / 1 / 3 | 4 / 2 | fail |
| 20261030-202113 | b28387b | claude-opus-5-5 | Sanad | 6 | 5 / 1 / 0 | 5 / 1 | fail |
| 20261030-092116 | b28387b | claude-opus-5-5 | Masar (on the Mac) | 3 | 3 / 0 / 0 | 1 / 2 | fail |
