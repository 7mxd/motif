# 0018 — Action weight, the first screen, and taste findings

- Date: 2026-11-21
- Status: Accepted. The bars of 0013 and 0014 stand; no test, fixture, rubric, grader or judge changed.
- Context: run 20261120-053030 (commit cbc1003) failed Test A and two Test C cases. In Test A the AI judges, who see each pair in both orders, picked Motif on both orders in 33 of 48 pairs, the baseline on both orders in 12, and split on 3; the briefs' average share for the baseline was 22%, over the 15% bar. Three briefs split evenly and three more each lost a pair. The owner skipped the blind votes on this run, so the pairs and the judges' reasons were read. The screenshots were taken the same way on both sides (whole pages on the web and Expo briefs, both sides growing; one fixed screen on the native ones), and the judges' descriptions matched the images, so the result is the skill's. In Test C, 3 of 13 serious findings in one review and 2 of 16 in another were judged false (bar: 10%), with fixtures and grader unchanged since the run before, where both passed.

## What lost, and why

The 12 pairs lost on both orders fall into four groups. Each session had read the skill's character guide and opened its own screenshots, so none of this was a rule nobody saw.

1. **Every row's action at one weight (5 pairs).** The skill asked for it: "Repeated actions look alike" told every row to use "the same filled pill on each card", and "one primary action per view" pushed other lists to all-outlined rows. The baseline filled only the row waiting on the person, outlined the action that steps back, and showed a state nobody can act on as a soft pill; Motif drew that state as a solid bar the shape of a button, which "coloured by how serious it is" invited. The right rule existed only for a desktop working list.
2. **The first screen (5 pairs).** The recipes put the points below the hero, so on a desktop a short welcome became a tall, half-empty hero and a strip of points far under the button, and on a phone a large drawing and a card per point made the page a third taller than the other side's, which fitted one screen. The Illustration section said the drawing takes a third of a phone's welcome where the recipes said a quarter. One of these also had a light button on a pale tint of its own hue: the skill sent a yellow button to a `brand-soft` band, which is a paler yellow.
3. **Decoration in place of content (1 pair, and part of another).** "No empty areas" offers an illustration as a fill, and with the screen's content fixed (decision 0017) a desktop list gained a drawing or a side panel that took width from its rows.
4. **Slips the look-pass doesn't ask about (1 pair, and parts of others).** A floating button over a row's own button, initials cut by their circle, two words of a headline run together, a tiny label in a language switch, a drawing that stops short of the margin. Rules for most of these exist; the look-pass in `modes/init.md` names four other slips, and `modes/feature.md` had none.

What won is unchanged and stays: in the 33 pairs Motif won on both orders the judges named the drawing that fits the brief, finished fields (icons, hint text, a show button), the app's name and language switch, a headline with the action straight under it, a desktop layout that uses the width, and one filled action that tells the eye where to start. Motif also won three phone welcomes with the action under the headline and the points after it, so the order stays; what changes is how much room the drawing and the points take.

## Decisions

1. **A row's weight says what its action does.** Repeated actions keep one place, width and shape. Fill is the weight, two weights at most, both in the action colour: filled for the step forward, outlined for the step back; when one row waits on the person, its action is the only filled one. A new colour per action is not a weight. A row's action repeated down a list counts as one primary action. A state nobody can act on is text on a pale tint, never a bar where the button would be.
2. **The brand moment gives way to the message and the main action.** The crafted moment stays on every first-impression screen, but it is the first thing to shrink. A short welcome (a headline, a line, a few points, the action) is one group: on a desktop the points sit under the action in the headline's column and the hero is as tall as its content; on a phone the points follow the actions as compact rows and the whole welcome is about one screen. The drawing is a quarter of a phone's welcome everywhere the skill says a size.
3. **A button stands clear of its ground.** A light fill doesn't sit on a pale tint of its own hue; a yellow button's ground is `surface`.
4. **Short given content closes a band up; it isn't padded.** A section is as tall as what it holds, and a list keeps its width: what sits beside it is the list's own.
5. **A floating button stays off rows that end in their own button.** That action goes in the header or under the list.
6. **The look-pass asks about these, in writing.** `modes/init.md` and `modes/feature.md` end their checks with five questions per screen: covered or cut, action weight, a button on its ground, the first screen, small labels.
7. **A review's taste call is minor.** A finding from the judgement pass is `major` only when a rule in the design guide, an exact check or a harm that can be stated in one sentence backs it; otherwise it is reported as `minor`. A plain screen or an empty band is `minor` unless the guide asks for what is missing. Nothing is dropped from the report.

## Consequences

- `skill/knowledge/character.md`, `skill/knowledge/visual-craft.md`, `skill/library/screens/landing-hero.md`, `skill/modes/init.md`, `skill/modes/feature.md`, `skill/modes/review.md`; their test is the last block of `cli/test/skill-modes.test.ts`.
- "Every row's action uses the same one style" (2026-10-29) is withdrawn. It was written against rows styled three different ways; the two-weight limit keeps that.
- Not yet shown by a run. A targeted run of the briefs that lost and the two review cases, more than once, comes before a full one: a brief has three or six pairs, so one pair moves its share by 17 to 33 points.
