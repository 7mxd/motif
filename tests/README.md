# Tests

Fixtures and evaluations for Motif. Nothing here ships to users: skill installs copy only `skill/`, and releases contain only the tool's binaries. `node_modules/`, `.next/` and eval results are never committed. The tool's own unit tests live in `cli/test/`.

## Fixtures

- **`fixtures/react-contract-app/`** — Larder, a grocery-ordering app: Next.js 16 and Tailwind v4, a design guide from the Warm starting style, the React web guide's 20 starter components, an app shell and three screens (Home, Products, a product). It is clean by construction: CI checks it with `motif validate` and `motif check` (`cli/test/fixtures-contract.test.ts`), and its build and `motif shot --audit` were checked when it was made. Test B adds features to copies of it.
- **`fixtures/react-seeded-app/`** — the same app with 23 planted problems: `overlay/` holds the files that differ, and `seeded-issues.json` is the exact list of problems and where each one is. Test C reviews a copy and is graded against the list. Its [README](fixtures/react-seeded-app/README.md) describes every problem.
- **`fixtures/plain-contract-site/`** — Kitepost, a one-page postcard tool in plain HTML, CSS and JavaScript (no framework, no build): a design guide from the Soft starting style, its own variables defined from roles, the plain web guide's components it uses, and three state scripts (`design/states/`) for the screens behind its form. CI checks it with `motif validate`, `motif check` and, where a browser is found, `motif shot --audit` in every state (`cli/test/fixtures-plain-contract.test.ts`). Test B's `b-plain` adds a page to a copy.
- **`fixtures/plain-seeded-site/`** — the same site with 18 planted problems, listed in its `seeded-issues.json`, and without the state scripts (a review writes its own). Test C's `c-plain` reviews a copy. Its [README](fixtures/plain-seeded-site/README.md) describes every problem.
- **`fixtures/briefs/`** — three briefs (Stride, Ledgerly, Bloom) for test D's new apps.
- **`fixtures/assemble.ts`** — builds a working copy of any of these fixtures in an empty folder:

  ```bash
  bun tests/fixtures/assemble.ts react-contract-app <empty folder>
  bun tests/fixtures/assemble.ts react-seeded-app <empty folder>
  bun tests/fixtures/assemble.ts plain-contract-site <empty folder>
  bun tests/fixtures/assemble.ts plain-seeded-site <empty folder>
  ```

  Then run `npm install` in a React app's folder to build or run it; a plain site needs nothing installed.

## Evals

`evals/` runs tests B, C and D from the design spec through your signed-in Claude Code, never an API key, one case at a time and only when you start it: `bun tests/evals/run.ts --list` to see the cases. [evals/README.md](evals/README.md) explains what each session gets, how to resume after a usage limit, and how cases are graded.
