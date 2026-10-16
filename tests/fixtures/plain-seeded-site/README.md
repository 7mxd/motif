# The plain seeded site

Kitepost (the plain contract site) with 18 planted problems, for test C's `c-plain`: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../plain-contract-site/`, then the overlay's files on top, then deletes the paths in `seeded-issues.json`'s `remove` list: Kitepost's three state scripts. A review has to write its own to see the page after a postcard is sent, which is where two of the problems are.

```bash
bun tests/fixtures/assemble.ts plain-seeded-site <empty folder>
```

Nothing needs installing: `motif shot` serves the site itself.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| P-01 | exact (check) | The postcard's dashed border is a typed colour | `styles.css:47` |
| P-02 | exact (check) | The site's own `--paper` variable is a typed colour, not a role | `styles.css:13` |
| P-03 | exact (check) | A typed grey in a `style=""` attribute on the character count | `index.html:33` |
| P-04 | exact (check) | Off-scale gap `18px` | `styles.css:36` |
| P-05 | exact (check) | Hard-coded Trebuchet MS for the top bar's title | `components.css:118` |
| P-06 | exact (check) | Typed `250ms ease-in-out` press transition | `components.css:20` |
| P-07 | exact (check) | Generated theme CSS edited by hand | `motif.css` |
| P-08 | exact (validate) | text-secondary too faint on light surfaces | `design/tokens.json` |
| P-09 | exact (shot) | The postcard's small print (primary text) faded to unreadable | `/`, `index.html:63` |
| P-10 | exact (shot) | 20×20 px dismiss button on the tip | `/`, `index.html:24` |
| P-11 | exact (shot) | A scripted plane keeps drifting under reduced motion | `/`, `app.js:51` |
| P-12 | judgement | The preview sits below the recent list, off screen while you write | `/` |
| P-13 | judgement | The send button says "Submit" | `/`, `index.html:44` |
| P-14 | judgement | Nothing checks the form: an empty postcard can be sent | `/`, `app.js` |
| P-15 | judgement | Placeholders instead of labels | `/`, `index.html` |
| P-16 | judgement | An emoji as decoration in the title | `/`, `index.html:20` |
| P-17 | judgement | No way to write another postcard after sending | `/` (after sending) |
| P-18 | judgement | The recently sent list has no empty state | `/`, `index.html` |

## How a grader reads the list

The same rules as [the React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list):

- `location` with `file` and `line`: a finding must point there (each such problem has an `anchor`, text that is on that line). `file` alone: anywhere in that file. `screen`: that page. `file` and `screen` together: either one, except that for an exact problem a finding naming only the screen counts once the model grader confirms it describes this problem.
- The site has one page, so most problems share the screen `/`. `/index.html` and a full address such as `http://127.0.0.1:5555/index.html` are the same screen, and a finding's `state` (such as `sent`) doesn't change it, whether it's in its own field or written into the screen (`/ (sent)`, `/@sent`).
- `wholeFile`: a finding anywhere in the problem's file counts. It marks a hand edit to a generated file: `motif check` reports it on the file's header, but the edit, and a review's finding, can be on any line.
- `categories`: the review categories that count as finding the problem; the first is the expected one. For a judgement problem, a finding the review filed under `other` is also offered to the model grader, which decides whether it describes the problem (a reviewer doesn't always find a category that fits); exact problems take only their own categories.
- `consequences`: findings a correct review will also report because of this problem (for example every text-secondary text failing contrast in light mode once P-08 makes the colour too faint). A grader counts a finding that matches a consequence's category, screen and scheme as correct, not as a false finding.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-plain-seeded.test.ts` checks, on every change, that every problem `motif check` and `motif validate` can see is exactly where the list says and that they report nothing unplanned; where a browser is found, it also runs `motif shot --audit` with a sent-state script and checks that P-09, P-10 and P-11 are reported and that everything else it reports is one of the declared consequences: contrast on `/` in light mode (P-03, P-08) and in dark mode (P-02).
