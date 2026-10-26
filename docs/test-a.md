# Test A: with Motif and without

Test A builds the same ten briefs with Motif and without it, shoots both apps the same way, and has AI judges and the owner pick the better screen without knowing which is which. It is part of the release gate ([Part 4 spec](specs/2026-10-26-motif-part4-release-evaluation-design.md), [decision 0013](decisions/0013-test-a-judges.md)).

## The pass rule

Motif must win on every brief. For each brief, on its own pairs:

- The AI judges pick Motif's side in at least 70% of the pairs, and the baseline in at most 15%. Each pair is judged twice, with the sides swapped. A side wins only when both judgements pick it.
- The owner picks Motif's side in more than half of the pairs. "About the same" is not a win.

A brief that falls short blocks the release until that stack is improved and Test A passes again. A re-run of Test A runs D too: each app built without Motif is compared with the one Motif builds on the new candidate, so the runner adds the `d-*` cases (`--tests A` runs `--tests D,A`).

## Known biases

Test A is fair, not perfect. These are the known ways it leans:

- PNG colour chunks (gAMA, sRGB, iCCP) are dropped on both sides, so both show as sRGB. Colours can differ a little from what a device shows.
- Flutter and Compose baselines that load Google Fonts at runtime fall back to Roboto in offline screenshots (Robolectric, `flutter test`). They may look plainer than they would on a device.
- Expo apps on both sides get Expo's web packages installed before shooting. The setup is equal.
- SwiftUI shots name each app's own previews.

## Runs

| Brief | Pairs | AI: Motif / baseline / tie | Owner: Motif / other | Verdict |
|---|---|---|---|---|
