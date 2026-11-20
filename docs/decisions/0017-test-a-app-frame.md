# 0017 — The app's own frame is design, not content

- Date: 2026-11-20
- Status: Accepted. Amends decision 0016's third point; the bars of 0013 and 0014 stand.
- Context: run 20261119-025418 (commit 3730000) was the first with shared content (decision 0016). The owner picked Motif in 55% of a brief's pairs, up from 48%, and found the pairs easier to judge. The AI judges picked Motif in 57% and the baseline in 32%, and marked Motif's side off content 15 times; the owner marked no side on any pair. Most of those marks were for things Motif's skill asks every app to have: the app's name or mark on each screen, the language switch of a bilingual app, a password field's show button and hint text in a field. Nabta's 0 of 3 for Motif came from the language switch alone, and it lost that brief outright. The other marks were real additions: a summary figure on a home screen and a sample card on a sign-in screen.

## Decisions

1. **The app's frame is judged as design.** The rubric says the app's name or mark, the language switch of an app the brief says is in more than one language, a button to show the password in a password field, and hint text in an empty field are the app's own frame, judged as design whether or not the content lists them. Anything else not in the content (new data, figures, cards, sections, sample items or actions) is still added content, and the side that adds it loses the pair.
2. **Motif shows given content as given.** When the developer says what a screen shows, `modes/init.md` and `modes/feature.md` ask for exactly that, in their words, with no data, figures, cards, sections, sample items or actions they didn't ask for. The app's own frame stays on every screen.
3. **The owner chose the goal, not the option.** Asked whether to change the rubric, the skill or both, the owner said Motif should end up building the best app. A language switch, the app's name and a password's show button make an app better for its people, so the rubric counts them as design; extra content doesn't, so the skill stops adding it.

## Consequences

- `tests/evals/rubric-a.md` and its test in `cli/test/evals-judge-a.test.ts`; the skill rule and its test in `cli/test/skill-modes.test.ts`.
- The owner's page has no written content rule; the owner's own marks in 20261119-025418 already matched this one.
