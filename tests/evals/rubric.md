# Test C grading rubric

You grade a design review of the app named above. Some problems were planted in the app on purpose; the review's findings are JSON objects with a severity, a category, a location (a file and line, a screen route, or both) and a one-line summary. Read the app's code, its `design/` folder and the screenshots in `design/shots/` whenever a claim needs checking. Don't change anything.

## Part A — does a finding describe a planted problem?

For each planted problem you get the findings that are in one of its categories and point at its place (its file, or its screen). Say which of them describe **this** problem.

- A finding describes the problem when a developer reading it would fix this problem: it names the same thing (the element, the copy, the state, the layout) and the same fault, in any words.
- One finding may cover several problems ("emoji and gradient text on the promo") and counts for each one it clearly names.
- A vague finding ("the home screen could be clearer") doesn't describe a specific problem. Neither does a finding about a different fault in the same place.
- The finding's severity and its proposed fix don't matter here.

## Part B — is a serious finding real?

For each critical or major finding that matched no planted problem, decide whether it is **real** or **false**.

- **Real:** the problem is there in the app as it is (check the code or the screenshots), and a careful designer would agree it hurts the experience or breaks the app's design guide (`DESIGN.md`), even though nobody planted it.
- **False:** the claim is wrong (the thing isn't there, or works as it should), or it is a matter of taste with no basis in the design guide or common practice.
- If you can't confirm a claim from the code or the screenshots, it is false.

## Answer

One entry per Part A problem: its id, the ids of the findings that describe it (possibly none) and why, in a sentence. One entry per Part B finding: "real" or "false", and why, in a sentence.
