# Motif 2B — Plain web support in the skill, fixtures and evals: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents using Motif can start, extend and review a plain web site (HTML, CSS and JavaScript with no framework) as well as a React app: a plain web stack guide, modes that know plain sites and screens behind forms, a clean and a seeded practice site with self-tests, two eval cases, and the spec and decision records updated.

**Architecture:** The skill gains `skill/adapters/plain-web/` (the template's six files), and SKILL.md and the modes point at it. Kitepost, a made-up one-page postcard tool, is the clean fixture (`tests/fixtures/plain-contract-site/`); the seeded site is Kitepost plus an overlay with 17 planted problems. The eval runner learns that a plain site has nothing to install or build: its new page is checked in a browser, and a new component is a new `Component:` line in its CSS. One small tool change, `motif shot --phones`, comes from the xBloom review's lesson.

**Tech Stack:** Bun 1.4 + TypeScript (no new dependencies); Motif's own tool for every check; the eval runner in `tests/evals/`.

**Spec:** `docs/specs/2026-10-15-motif-plain-web-design.md` (approved 2026-10-15), sections 10–14. It builds on `docs/specs/2026-10-12-motif-core-design.md`.

**Split:** Plan 2A (merged and pushed at `5fb9f72`) built the tool half. This plan, 2B, is the rest of the spec. The xBloom re-check with the new tool happens after this plan (the developer's decision, 2026-10-15).

**Not in the spec — needs the developer's approval:** Task 1, `motif shot --phones`. The xBloom review's one regression (fix F-005 made the pour rows taller only on 430 px phones, pushing the live card preview away from its sliders) didn't show at Motif's only phone width, 390 px. The review mode's new rule "check every fix at every phone width" (Task 3) uses it. Without Task 1, drop it and the `--phones` lines in Tasks 2, 3 and 7.

**Builds on:** `main` at `5fb9f72`. Read before starting: `skill/SKILL.md`, `skill/modes/{init,feature,review,design}.md`, `skill/adapters/_template/README.md`, `skill/adapters/react-web/*.md`, `cli/test/{adapters,skill-modes,skill-content}.test.ts` and `cli/test/skill-lint.ts`, `tests/fixtures/assemble.ts`, `tests/fixtures/react-seeded-app/{README.md,seeded-issues.json}`, `cli/test/fixtures-{contract,seeded}.test.ts`, `tests/evals/{cases,workspace,collect,grade,match,run,preflight}.ts`, `tests/evals/README.md`, `cli/test/evals-{cases,workspace,collect,grade,match,run}.test.ts`, `cli/src/shot/capture.ts`, `cli/src/commands/shot.ts`, `cli/src/main.ts`.

**Facts the plan relies on (checked on 2026-10-15 with a prototype of both fixtures, built with Plan 2A's tool):**
- Kitepost as written below: `motif validate` passes with no warnings (100 theme values, 26 readability checks), `motif check` finds nothing (5 files read), and `motif shot --audit --state` with its three state scripts finds nothing on `/` in any state, light or dark, phone or desktop, with no page errors.
- The seeded overlay below: `motif check` reports exactly 7 violations on 6 lines plus one `generated-edited` warning, `motif validate` reports 3 `low-contrast` errors (text-secondary on background, surface and surface-raised, light mode), and `motif shot --audit` with the sent state reports the faded small print (contrast), the 20×20 dismiss button (target-size, minor) and the drifting plane (reduced-motion), plus contrast knock-ons only on `/`: light mode from the faint text-secondary and the typed grey hint, dark mode from the postcard's typed paper colour.
- Every CSS, HTML and script example in the plain web guide below passes `motif check`'s rules, and every guide file passes the skill lint (links, length, shell examples, command names).
- `motif tokens` on a plain site writes `<site>/motif.css`, `design/generated/tokens.flat.json` and `design/motif.json` (`{ "path": ".", "stack": "plain-web", "srcDir": "." }` for Kitepost).
- `listSourceFiles` leaves `design/` out, so state scripts in `design/states/` are never checked.
- The audit's motion check catches Web Animations (`element.animate`) through `document.getAnimations()`; `motif.css`'s reduced-motion rule stops only CSS animations and transitions.
- `pairWithMockup` pairs a phone mockup with the shot whose name ends `.mobile.png` (or `.mobile.dark.png`).

## Global Constraints

- No new dependencies. Bun 1.4 + TypeScript 7; `bun run typecheck` and `bun test --timeout 120000` (from `cli/`) stay green on Windows, macOS and Linux. Tests that need a browser skip where none is found, like `shot-e2e`.
- Everything in `skill/` stays agent-neutral and passes the skill lint (`cli/test/skill-content.test.ts`): links stay inside the skill folder, each file at most 400 lines (SKILL.md at most 200 by its own test), shell examples work in every shell (no `&&`, `||`, `$(…)` or `export`), and only real `motif` commands are named.
- Stack guide rules (`skill/adapters/_template/README.md`): the stack's own words; theme values only; examples pass `motif check`; every component example shows its states, its focus style and its accessible name; commands are single commands that work in every shell.
- Fixtures are made up: a made-up brand, made-up people, all mock data in one file. Nothing in `tests/` ships to users.
- Plain words in every guide (Motif's voice): say "your design guide" and "theme values"; explain what's wrong and what to do.
- The plain seeded site: at least 12 planted problems, at least 7 the tool finds and at least 5 that need judgement; pass thresholds the same as tests B and C (spec §11).
- Evals run on the developer's own Claude Code plan, never an API key; CI runs only the runner's own tests with stand-ins (decision 0003).
- Commits use the repository's configured no-reply address and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A feature session that only edits an existing component** (a new variant on Kitepost's `Button`, which rewrites its `Component:` line) → it isn't counted as a new component. Pinned: Task 6.
2. **A review that names Kitepost's page as `/index.html`, `index.html` or `http://127.0.0.1:5555/index.html`** → the same screen as `/`. Pinned: Task 6.
3. **An agent that copies a guide example as it is** → it passes `motif check`. Pinned: Task 2.
4. **The seeded site ships with no state scripts** → a review has to write its own for the sent state; an assembled copy has no `design/states/`. Pinned: Task 5.
5. **`--phones` beside `--against <mockup>`** → the 390 px phone still pairs with a phone mockup, and the extra phones never take its place. Pinned: Task 1.

---

## File Structure

```
cli/src/
├── shot/capture.ts                  MODIFY: PHONES, viewportsFor(), Viewport.file, CaptureOptions.phones
├── commands/shot.ts                 MODIFY: --phones passed to the capture and reported
└── main.ts                          MODIFY: --phones option and help line
skill/
├── SKILL.md                         MODIFY: plain web stack guide link; toolchain row
├── adapters/plain-web/              CREATE: README.md, tokens.md, components.md, motion.md, platform.md, checks.md
└── modes/{init,feature,review,design}.md  MODIFY: plain web, state scripts, phones, things used together
tests/fixtures/
├── assemble.ts                      MODIFY: four fixtures; each seeded one names its base
├── plain-contract-site/             CREATE: Kitepost (index.html, components.css, styles.css, app.js, mock-data.js,
│                                            motif.css, fonts/, DESIGN.md, design/{tokens.json,motif.json,
│                                            generated/tokens.flat.json,.gitignore,states/*.js})
└── plain-seeded-site/               CREATE: README.md, seeded-issues.json, overlay/{index.html,styles.css,
                                             components.css,app.js,motif.css,design/tokens.json}
tests/README.md                      MODIFY: the plain fixtures
tests/evals/
├── cases.ts                         MODIFY: Fixture type, isPlain(), needsBrowser(), b-plain, c-plain
├── workspace.ts                     MODIFY: npm ci only when there's a package.json
├── collect.ts                       MODIFY: per-fixture seeded list; plain B (page, render, Component: lines)
├── grade.ts                         MODIFY: BFacts.render; "renders" criterion when there's nothing to build
├── match.ts                         MODIFY: a folder's index.html is the folder's screen
├── run.ts                           MODIFY: needsBrowser per case
├── preflight.ts                     MODIFY: the no-browser message names b-plain
└── README.md                        MODIFY: the plain cases and how they're graded
docs/
├── specs/2026-10-12-motif-core-design.md   MODIFY: §4, §10.2, §11.5, §13.2, §16
├── specs/2026-10-15-motif-plain-web-design.md  MODIFY: status
└── decisions/0004-plain-web.md      CREATE
cli/test/
├── shot-phones.test.ts · fixtures-plain-contract.test.ts · fixtures-plain-seeded.test.ts · plain-web-docs.test.ts
└── adapters.test.ts · skill-modes.test.ts · plain-web-e2e.test.ts · evals-{cases,workspace,collect,grade,match,run}.test.ts   MODIFY
```

---

### Task 1: `motif shot --phones` (not in the spec; needs the developer's approval)

**Files:**
- Modify: `cli/src/shot/capture.ts`, `cli/src/commands/shot.ts`, `cli/src/main.ts`
- Test: `cli/test/shot-phones.test.ts`

**Interfaces:**
- Consumes: `captureScreens`, `CaptureOptions`, `VIEWPORTS`, `shotName` (`cli/src/shot/capture.ts`); `runShot`, `ShotDeps` (`cli/src/commands/shot.ts`); `startStaticServer` (`cli/src/shot/static-server.ts`); `pairWithMockup` (`cli/src/shot/compare.ts`).
- Produces:
  - `Viewport.file?: string` (the name in screenshot file names; the viewport's `name` when not set).
  - `PHONES: Viewport[]` (`mobile-360` 360×780 and `mobile-430` 430×932, both `name: "mobile"`, scale 2); `viewportsFor(phones: boolean): Viewport[]` (`VIEWPORTS`, or 360, 390, 430 and desktop in that order).
  - `shotName(slug: string, viewport: string, scheme: Scheme): string` (its `viewport` parameter widened to `string`).
  - `CaptureOptions.phones?: boolean`; `motif shot --phones`; `data.phones: boolean`.

- [ ] **Step 1: Write the failing test**

`cli/test/shot-phones.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot, type ShotDeps } from "../src/commands/shot";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, shotName, viewportsFor, VIEWPORTS, type CaptureOptions } from "../src/shot/capture";
import { pairWithMockup } from "../src/shot/compare";
import { startStaticServer } from "../src/shot/static-server";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const MAIN = join(import.meta.dir, "../src/main.ts");

describe("motif shot --phones", () => {
  test("adds a narrow and a wide phone around the usual one, named apart in the screenshots", () => {
    expect(viewportsFor(false)).toEqual(VIEWPORTS);
    const all = viewportsFor(true);
    expect(all.map((v) => [v.file ?? v.name, v.width])).toEqual([["mobile-360", 360], ["mobile", 390], ["mobile-430", 430], ["desktop", 1440]]);
    // Every phone is audited as a phone (the 44 px tap-target check).
    expect(all.filter((v) => v.mobile).map((v) => v.name)).toEqual(["mobile", "mobile", "mobile"]);
    expect(shotName("index", "mobile-360", "dark")).toBe("index.mobile-360.dark.png");
  });

  test("a phone mockup still pairs with the 390 px phone, never the extra ones", () => {
    const frame = join(tempDir("motif-phones-"), "home.png");
    const header = new Uint8Array(24);
    header.set([137, 80, 78, 71, 13, 10, 26, 10]);
    new DataView(header.buffer).setUint32(16, 780);
    new DataView(header.buffer).setUint32(20, 1688);
    writeFileSync(frame, header);
    const shots = ["s/index.mobile-360.png", "s/index.mobile.png", "s/index.mobile-430.png", "s/index.desktop.png"];
    expect(pairWithMockup([frame], shots, "cmp").map((p) => p.after)).toEqual(["s/index.mobile.png"]);
  });

  test("motif shot passes it to the capture and says so", async () => {
    const root = makeProject({ "index.html": "" });
    const captured: CaptureOptions[] = [];
    const deps: ShotDeps = {
      findBrowser: () => ({ name: "Chrome", path: "/fake/chrome" }),
      devCommand: () => ({ error: "unused" }),
      startDevServer: async () => {
        throw new Error("unused");
      },
      serveStatic: () => ({ url: "http://127.0.0.1:5555", stop: () => {} }),
      capture: async (o) => {
        captured.push(o);
        const shot = join(o.outDir, "index.mobile-360.png");
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
        return { routes: [{ route: "/", url: o.baseUrl, status: 200, shots: [shot] }], issues: [] };
      },
      compare: async () => [],
      today: () => "2026-10-15",
    };
    const r = await runShot(root, { positionals: [], flags: { phones: true } }, deps);
    expect(r.exitCode).toBe(0);
    expect(captured[0]!.phones).toBe(true);
    expect(r.data.phones).toBe(true);
    await runShot(root, { positionals: [], flags: {} }, deps);
    expect(captured[1]!.phones).toBe(false);
  });

  test("is listed in help", () => {
    expect(Bun.spawnSync([process.execPath, MAIN, "help"]).stdout.toString()).toContain("--phones");
  });

  const browser = findBrowser();
  test.skipIf(!browser)("captures each phone at its own width (needs Chrome, Edge or Chromium)", async () => {
    const root = makeProject({ "index.html": '<!doctype html><meta name="viewport" content="width=device-width"><p>Hi</p>' });
    const site = startStaticServer(root);
    try {
      const outDir = join(root, "shots");
      const r = await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir, settleMs: 50, phones: true });
      expect(r.routes[0]!.shots.map((s) => s.split(/[\\/]/).pop())).toEqual([
        "index.mobile-360.png", "index.mobile-360.dark.png", "index.mobile.png", "index.mobile.dark.png",
        "index.mobile-430.png", "index.mobile-430.dark.png", "index.desktop.png", "index.desktop.dark.png",
      ]);
      const width = (name: string) => pngSize(new Uint8Array(readFileSync(join(outDir, name)))).width;
      expect([width("index.mobile-360.png"), width("index.mobile.png"), width("index.mobile-430.png")]).toEqual([720, 780, 860]);
    } finally {
      site.stop();
    }
  }, 120_000);
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/shot-phones.test.ts`
Expected: FAIL — `viewportsFor` isn't exported (SyntaxError: export not found).

- [ ] **Step 3: Phones in `cli/src/shot/capture.ts`**

Replace the `Viewport` interface and add `PHONES` and `viewportsFor` after `VIEWPORTS`:
```ts
export interface Viewport {
  name: "mobile" | "desktop";
  /** The name in screenshot file names ("mobile-360"); the viewport's name when not set. */
  file?: string;
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
}
```
```ts
/** --phones: a narrow and a wide phone beside the usual one, for checking that a layout change holds on every phone. */
export const PHONES: Viewport[] = [
  { name: "mobile", file: "mobile-360", width: 360, height: 780, scale: 2, mobile: true },
  { name: "mobile", file: "mobile-430", width: 430, height: 932, scale: 2, mobile: true },
];

export function viewportsFor(phones: boolean): Viewport[] {
  return phones ? [PHONES[0]!, VIEWPORTS[0]!, PHONES[1]!, VIEWPORTS[1]!] : VIEWPORTS;
}
```
Change `shotName`'s signature to `export function shotName(slug: string, viewport: string, scheme: Scheme): string {` (the body is unchanged). In `CaptureOptions`, after `stateTimeoutMs?: number;`, add:
```ts
  /** Also capture phones 360 and 430 px wide. */
  phones?: boolean;
```
In `captureScreens`, replace `for (const viewport of VIEWPORTS) {` with `for (const viewport of viewportsFor(opts.phones ?? false)) {`, and replace the screenshot's file name line
```ts
                const file = join(opts.outDir, shotName(state ? `${slug}@${state.name}` : slug, viewport.name, scheme));
```
with
```ts
                const file = join(opts.outDir, shotName(state ? `${slug}@${state.name}` : slug, viewport.file ?? viewport.name, scheme));
```

- [ ] **Step 4: The option in `cli/src/commands/shot.ts` and `cli/src/main.ts`**

In `runShot`, after `const audit = flags.audit === true;`, add `const phones = flags.phones === true;`. Replace
```ts
    captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit, states });
```
with
```ts
    captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit, states, phones });
```
and in the returned `data`, after `states: states.map((s) => s.name),` add `phones,`.

In `cli/src/main.ts`: in `parseArgs`' options add `phones: { type: "boolean", default: false },` after `state: { type: "string", multiple: true },`; in the flags passed to the runner add `phones: values.phones,` after `state: values.state,`; in `HELP`'s "Shot options", after the `--state` line, add:
```
  --phones          Also capture phones 360 and 430 px wide, to check a layout change on every phone
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/shot-phones.test.ts test/capture.test.ts test/shot-command.test.ts test/shot-state.test.ts test/main.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/shot/capture.ts cli/src/commands/shot.ts cli/src/main.ts cli/test/shot-phones.test.ts
git commit -m "feat(shot): --phones also captures phones 360 and 430 px wide" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The plain web stack guide

**Files:**
- Create: `skill/adapters/plain-web/README.md`, `tokens.md`, `components.md`, `motion.md`, `platform.md`, `checks.md`
- Test: `cli/test/adapters.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: `RULE_IDS` (`cli/src/check/types.ts`); `expandHtml` (`cli/src/check/html.ts`); `scanFile` (`cli/src/check/run.ts`); `buildScale`, `buildTheme`; `docFrom`, `validTokens` (`cli/test/helpers.ts`).
- Produces: the guide files and their anchors, which Tasks 3 and 7 link to: `adapters/plain-web/README.md`, `components.md`, `checks.md#screens-behind-a-form-or-a-click`, `tokens.md#the-sites-own-names`, `tokens.md#linking-it-once-per-page`, `tokens.md#fonts`, `tokens.md#dark-mode`, `motion.md#motion-in-javascript`, `motion.md#reduced-motion`, `components.md#example-field`.

- [ ] **Step 1: Write the failing test**

In `cli/test/adapters.test.ts`, add to the imports:
```ts
import { expandHtml } from "../src/check/html";
import type { Lang } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";
```
and add at the end of the file:
```ts
const PLAIN_STARTER_SET = [
  "Button", "IconButton", "Field", "Checkbox", "Choice", "Switch", "Card", "ListItem", "TopBar", "TabBar",
  "Sidebar", "Dialog", "Sheet", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the plain web guide", () => {
  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "plain-web")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: how a site and its site folder are recognised, starting one, and nothing to build", () => {
    const readme = read("plain-web/README.md");
    for (const s of ["index.html", "`public/`", "`src/`", "`site/`", "`www/`", "plain-web", "srcDir", "components.css", "styles.css", "mock-data.js", "npm create vite@latest", "--template vanilla", "nothing to build", "--url"]) {
      expect(readme).toContain(s);
    }
  });

  test("tokens.md: motif.css in the site folder linked first, the site's own names, dark mode and fonts", () => {
    const tokens = read("plain-web/tokens.md");
    for (const s of ['<link rel="stylesheet" href="motif.css">', "var(--motif-color-background)", "--bg: var(--motif-color-background);", "data-theme", "@font-face", "fonts.googleapis.com", "tokens.flat.json", "motif extract", "motif-ok"]) {
      expect(tokens).toContain(s);
    }
  });

  test("components.md: the Component: lines, states through CSS, and the starter set", () => {
    const components = read("plain-web/components.md");
    for (const c of PLAIN_STARTER_SET) expect(components).toContain(`\`${c}\``);
    for (const s of ["/* Component:", "components.css", ":focus-visible", ":disabled", '[aria-busy="true"]', '[aria-invalid="true"]', "showModal()", "aria-label"]) {
      expect(components).toContain(s);
    }
  });

  test("motion.md: the roles in CSS, View Transitions, and reduced motion in scripts", () => {
    const motion = read("plain-web/motion.md");
    for (const s of ["var(--motif-duration-base)", "var(--motif-easing-enter)", "var(--motif-easing-exit)", "@keyframes", "startViewTransition", "prefers-reduced-motion", "getPropertyValue"]) {
      expect(motion).toContain(s);
    }
  });

  test("platform.md: native elements, labels, logical properties, phones, and things used together", () => {
    const platform = read("plain-web/platform.md");
    for (const s of ["Native elements", "A placeholder isn't a label", "padding-inline-start", "@media (hover: hover)", "safe-area-inset", "lang", "DESIGN.md", "on one screen", "--phones"]) {
      expect(platform).toContain(s);
    }
  });

  test("checks.md: every rule on plain web, the audit's findings, and state scripts", () => {
    const checks = read("plain-web/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(id.startsWith("tailwind") ? `\`${id}\`` : `## \`${id}\``);
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "<!-- motif-ok", "## Screens behind a form or a click", "design/states/", "--state", "index@sent.mobile.png", "15 seconds"]) {
      expect(checks).toContain(s);
    }
  });

  test("every CSS, HTML and script example passes motif check as it is", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
    const LANGS: Record<string, Lang> = { css: "css", html: "markup", js: "script" };
    for (const file of GUIDE_FILES) {
      const text = read(`plain-web/${file}`);
      for (const [i, m] of [...text.matchAll(/```(css|html|js)\n([\s\S]*?)```/g)].entries()) {
        const path = `${file}-example-${i + 1}.${m[1]}`;
        const hits = expandHtml([{ path, abs: path, text: m[2]!, lang: LANGS[m[1]!]! }])
          .flatMap((f) => scanFile(f, scale, { tailwind: false }))
          .filter((h) => h.violation);
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/adapters.test.ts`
Expected: FAIL — `readdirSync` can't find `skill/adapters/plain-web` (ENOENT).

- [ ] **Step 3: Write the six files**

`skill/adapters/plain-web/README.md`:
````markdown
# Plain web

How Motif works with a site made of HTML, CSS and JavaScript and no framework: what it expects, how to start one, and where things live.

## What Motif expects

- Pages written as `.html` files, styles in `.css` files and `<style>` blocks, behaviour in `.js` files.
- No build step: the browser opens the files as they are. Vite without a framework is fine when the developer wants a dev server.
- Modern browsers: CSS variables, `:has()`, `<dialog>` and `:focus-visible` are all available.
- No CSS framework. A site that loads one from a CDN (Bootstrap, say) gets only the plain CSS rules.

## How Motif recognises it

A folder is a plain web site when it has an `index.html` and no framework in its `package.json` (a small server, or Vite on its own, is fine). The first of these folders with an `index.html` is the **site folder**, where the pages live: the project folder itself, then `public/`, `src/`, `site/` and `www/`. `motif doctor --json` lists the site with the stack `plain-web` and says where its pages are; `design/motif.json` records it as `srcDir`, and can name another folder for an unusual layout:

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "plain-web", "srcDir": "pages" }] }
```

Folders named `docs/`, `design/`, `templates/` and `test/` are never taken for a site.

## Starting a new project

Create a folder named after the site, and in it:

- `index.html`: the first page, linking the stylesheets in this order: `motif.css`, then `components.css`, then `styles.css`.
- `components.css`: the shared components ([components](components.md)).
- `styles.css`: the page layout, and the site's own names for roles if it has any ([theme code](tokens.md)).
- `app.js`: the page's behaviour, loaded with `defer`.
- `mock-data.js`: every piece of made-up content, in one file.

A starting `index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Site name</title>
  <link rel="stylesheet" href="motif.css">
  <link rel="stylesheet" href="components.css">
  <link rel="stylesheet" href="styles.css">
  <script src="mock-data.js" defer></script>
  <script src="app.js" defer></script>
</head>
<body>
  <main class="page">
    <h1 class="page-title">Site name</h1>
  </main>
</body>
</html>
```

`motif tokens` writes `motif.css` beside it. When the developer wants a dev server with live reload, start the site with Vite instead, then put the files above in the folder it makes:

```bash
npm create vite@latest my-site -- --template vanilla --no-interactive
```

## Folders

- **The site folder:** the pages (`index.html`, `about.html`, `blog/index.html`), `motif.css`, `components.css`, `styles.css`, `app.js` and `mock-data.js`.
- **Fonts:** `fonts/` in the site folder, with each font's licence ([theme code](tokens.md#fonts)).
- **The design guide:** `DESIGN.md` and `design/` beside the site folder (or in it, when the site folder is the project folder). State scripts for `motif shot` go in `design/states/` ([checks](checks.md#screens-behind-a-form-or-a-click)).

## Build, type-check and run

- There's nothing to build or type-check. Open the page in a browser to try it.
- `motif shot` serves the site folder itself on this computer and captures every `.html` page; nothing needs to be running. Use `--url` only for a site that needs its own server (API calls the pages depend on, a build step).
- Each page is a screen: `index.html` is `/`, `about.html` is `/about.html`, `blog/index.html` is `/blog/`.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, linking it, the site's own variables, dark mode and fonts.
- [Components](components.md): building components with HTML and CSS, and the starter set.
- [Motion](motion.md): the motion roles in CSS and JavaScript.
- [Platform rules](platform.md): semantic HTML, forms and accessibility.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and state scripts.
````

`skill/adapters/plain-web/tokens.md`:
````markdown
# Theme code

What `motif tokens` writes for a plain web site, how to link it, and how pages use the theme values.

## What motif tokens writes

| File | Holds |
|---|---|
| `motif.css` in the site folder | A CSS variable per role: `--motif-color-action-primary`, `--motif-space-4`, `--motif-font-body-size` and so on. Light values sit on `:root`; dark values apply under `prefers-color-scheme: dark` and on `[data-theme="dark"]`; `[data-theme="light"]` forces light. It also stops CSS animations and transitions for people who ask for reduced motion. |
| `design/generated/tokens.flat.json` | Every value, springs included, for scripts that need numbers. |

Both start with a "Generated by Motif" line. Never edit them: change `design/tokens.json`, then run `motif tokens` again.

## Linking it, once per page

Link `motif.css` in each page's `<head>`, before the site's own stylesheets, with a path relative to the page:

```html
<link rel="stylesheet" href="motif.css">
<link rel="stylesheet" href="components.css">
<link rel="stylesheet" href="styles.css">
```

A page in a subfolder links `../motif.css`. `motif tokens` reminds you while no page links it.

## Using the values

Every colour, size, corner, shadow, font and timing comes from a variable:

```css
.notice {
  padding: var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
  line-height: var(--motif-font-body-line-height);
}
```

| Role | CSS |
|---|---|
| `color.background` | `var(--motif-color-background)` |
| `color.action-primary` with `color.on-action-primary` | `var(--motif-color-action-primary)` and `var(--motif-color-on-action-primary)` |
| `space.4` | `var(--motif-space-4)` |
| `radius.md` | `var(--motif-radius-md)` |
| `shadow.md` | `var(--motif-shadow-md)` |
| `font.body` | `var(--motif-font-body-family)`, `-size`, `-weight` and `-line-height` |
| `duration.base`, `easing.standard` | `var(--motif-duration-base)`, `var(--motif-easing-standard)` |

Lengths that aren't design values stay as they are: a `1px` border, a `40rem` maximum width, a `3rem` minimum height for touch targets.

## The site's own names

An existing site often has its own variables (`--bg`, `--muted`). Keep the names, and define each one from a role once, in one `:root` block:

```css
:root {
  --bg: var(--motif-color-background);
  --surface: var(--motif-color-surface);
  --muted: var(--motif-color-text-secondary);
  --accent: var(--motif-color-action-primary);
}
```

Every `var(--bg)` in the site is then a theme value, and `motif check` stops reporting it. A variable set to a typed colour (`--bg: #f2f2f7`) is still reported. Delete the site's own dark-mode blocks once its variables point at roles: `motif.css` switches the roles. `motif extract` lists the site's variables in `design/extract-report.json`, with the role each one matches.

Colours that are the user's own data (a colour they picked for their card, say) aren't theme values: mark those lines `motif-ok` with the reason ([checks](checks.md)).

## Dark mode

Dark mode follows the system automatically. To offer a switch, set `data-theme` on `<html>` and remember the choice:

```js
const saved = localStorage.getItem("theme");
if (saved) document.documentElement.dataset.theme = saved;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}
```

Remove the attribute (`delete document.documentElement.dataset.theme`) to follow the system again. Never write your own `prefers-color-scheme` rules for colours: the roles already change.

## Fonts

`motif tokens --json` lists the theme's `fonts`: each family with the weights its roles use (fonts every computer has are left out). Load each one either way:

**From the site's own folder** (nothing loads from another server). Put the font file and its licence in `fonts/`, and declare it once at the top of `styles.css`. A variable font covers every weight with one file:

```css
@font-face {
  font-family: "Nunito";
  font-style: normal;
  font-display: swap;
  font-weight: 200 1000;
  src: url("fonts/nunito.woff2") format("woff2");
}
```

Fontsource has the files for every Google font, with their licences (`fontsource.org`).

**From Google Fonts.** One link per family in each page's `<head>`, before `motif.css`:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap">
```

The family name must match the theme's exactly, or text falls back to the system font.

## Springs

CSS has no springs. Use the duration and easing roles in CSS. A script that animates with springs reads them from `design/generated/tokens.flat.json`.
````

`skill/adapters/plain-web/components.md`:
````markdown
# Components

How to build components for a plain web site with HTML and CSS, so they follow the design guide, and the starter set.

## Where they live

Shared components live in `components.css` in the site folder. Each one starts with a comment line naming it, so people and agents can list them:

```css
/* Component: Button — actions: primary (default), secondary, ghost */
```

To list what exists (the first step of adding a feature), read the `Component:` lines in `components.css`, then each one's classes for its variants and states. A page's own layout goes in `styles.css`, never a one-off button or field.

A component is an HTML pattern with classes: a base class named after the component (`.button`), a class per variant (`.button-secondary`), and classes for its parts (`.field-label`, `.field-hint`). States come from the element and its attributes, not from extra classes.

## How to build one

- **The right element.** `button` for actions, `a` for navigation, a `label` for every field, `dialog` for dialogs and sheets, `details` for disclosure.
- **Variants as classes.** One class per variant, theme values only. No `style=""` attributes.
- **Hover.** Inside `@media (hover: hover)`, as an extra: never hide an action behind it.
- **Focus.** Every interactive element shows a focus ring from the `focus` role: `outline: 2px solid var(--motif-color-focus); outline-offset: 2px;` under `:focus-visible`.
- **Disabled.** The `disabled` attribute (or `aria-disabled="true"` when the element must stay focusable), styled with `:disabled` and `[aria-disabled="true"]`.
- **Loading.** `aria-busy="true"` on the element, styled with `[aria-busy="true"]`; keep its width.
- **Errors.** `aria-invalid="true"` on the field and `aria-describedby` pointing at the error text, styled with `[aria-invalid="true"]` and shown in `danger`.
- **Touch targets.** At least 44 px: `min-height: 3rem` on buttons and fields, `3rem` square icon buttons.

## Example: Button

```html
<button class="button" type="button">Save</button>
<button class="button button-secondary" type="button">Cancel</button>
<button class="button" type="submit" aria-busy="true">Saving…</button>
```

```css
/* Component: Button — actions: primary (default), secondary */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--motif-space-2);
  min-height: 3rem;
  padding-inline: var(--motif-space-5);
  border: 0;
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-label-line-height);
  cursor: pointer;
  transition: transform var(--motif-duration-fast) var(--motif-easing-standard);
}
.button:active:not(:disabled) { transform: scale(0.97); }
.button:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.button:disabled { cursor: not-allowed; opacity: 0.5; }
.button[aria-busy="true"] { cursor: progress; }
.button-secondary { background: var(--motif-color-action-secondary); color: var(--motif-color-on-action-secondary); }
```

## Example: Field

```html
<div class="field">
  <label class="field-label" for="email">Email</label>
  <input class="field-input" id="email" name="email" type="email" autocomplete="email" aria-describedby="email-error">
  <p class="field-error" id="email-error" hidden>Enter an email address like name@example.com.</p>
</div>
```

```css
/* Component: Field — a labelled input, textarea or select, with a hint and an error */
.field { display: grid; gap: var(--motif-space-2); }
.field-label { color: var(--motif-color-text-primary); font-family: var(--motif-font-label-family); font-size: var(--motif-font-label-size); font-weight: var(--motif-font-label-weight); }
.field-input {
  min-height: 3rem;
  padding: var(--motif-space-3) var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
}
.field-input:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.field-input[aria-invalid="true"] { border-color: var(--motif-color-danger); }
.field-error { margin: 0; color: var(--motif-color-danger); font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); }
```

Show the error with a few lines of script: set `aria-invalid="true"` on the field and remove `hidden` from its error, when the field is left empty and when the form is sent.

## The starter set

A new site gets the components its pages use, each with every state it needs, from this set:

| Component | For | Built on | Must show |
|---|---|---|---|
| `Button` | Actions | `button` | default, hover, pressed, focused, disabled, loading |
| `IconButton` | Universal actions (close, back, menu) | `button` with an `aria-label` | as Button |
| `Field` | Text, longer text or a choice from a list | `label` with `input`, `textarea` or `select` | label, hint, focused, error, disabled, read-only |
| `Checkbox` | On or off, part of a form | `input type="checkbox"` inside its `label` | checked, unchecked, focused, disabled |
| `Choice` | One option of a few, shown as a chip | `input type="radio"` inside its `label` | chosen, focused, disabled |
| `Switch` | A setting that applies at once | `input type="checkbox" role="switch"` | on, off, focused, disabled |
| `Card` | A group of related content | `article` or `div` | default; pressed when the whole card is a link |
| `ListItem` | A row in a list | `li`, with a link or button inside when it does something | default, hover, pressed |
| `TopBar` | The page title and its actions | `header` | default |
| `TabBar` | Main navigation on phones | `nav` with links | the current page marked with `aria-current="page"` |
| `Sidebar` | Main navigation on wide screens | `nav` with links | the current page marked |
| `Dialog` | A decision that needs an answer | `dialog`, opened with `showModal()` | open; Escape closes; focus returns |
| `Sheet` | A focused task that slides up on phones | `dialog` at the bottom of the screen | open, closing |
| `Toast` | A short confirmation | `div role="status"` | shown for at least 5 s; an action when there is one |
| `Skeleton` | Content that's loading | `div` | the layout of the content it stands in for |
| `EmptyState` | Nothing here yet | `div` | a title, one line, one action |
| `ErrorState` | Something failed | `div` | what happened, Retry, a way out |
| `Avatar` | A person | `img` | the photo, or initials when there's none |
| `Badge` | A status or count | `span` | a word beside the colour |

The [accessibility guide](../../knowledge/accessibility.md) covers names, focus and announcements in detail, and the [empty, loading and error guide](../../knowledge/ux-patterns/empty-loading-error.md) covers those three components.

## Each component in the design guide

When you add a shared component or change one, give it its `Component:` line in `components.css` and list it in `DESIGN.md` section 5: what it's for, its variants and its states.
````

`skill/adapters/plain-web/motion.md`:
````markdown
# Motion

How to animate a plain web site with CSS, and a little JavaScript, using the design guide's motion roles. The [motion guide](../../knowledge/motion.md) says what to animate and when; this file says how.

## The roles in CSS

Every transition and animation takes its duration and easing from the roles:

```css
.panel {
  transition: opacity var(--motif-duration-base) var(--motif-easing-standard), transform var(--motif-duration-base) var(--motif-easing-standard);
}
.toast { animation: toast-in var(--motif-duration-base) var(--motif-easing-enter); }
.toast.is-leaving { animation: toast-out var(--motif-duration-fast) var(--motif-easing-exit) forwards; }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: none; }
}
@keyframes toast-out {
  to { opacity: 0; }
}
```

Never type a number of milliseconds or a Bézier curve: `motif check` reports them. A delay between staggered items is choreography, not a theme value: compute it from a role, `calc(var(--motif-duration-fast) / 4 * var(--i))`.

CSS has no springs. Where the design guide asks for a spring, use the nearest duration and `easing.standard` in CSS.

## Patterns

**Press feedback.** Interactive elements scale down slightly while pressed:

```css
.button { transition: transform var(--motif-duration-fast) var(--motif-easing-standard); }
.button:active:not(:disabled) { transform: scale(0.97); }
```

**Enter and exit.** Content that appears fades and rises in with `easing.enter`; exits are shorter, with `duration.fast` and `easing.exit`. Remove an element only after its exit ends (`animationend`).

**Dialogs and sheets.** Animate `dialog[open]` with a keyframe on open. The backdrop fades with `duration.base`:

```css
dialog[open] { animation: toast-in var(--motif-duration-base) var(--motif-easing-enter); }
dialog::backdrop { background: var(--motif-color-text-primary); opacity: 0.4; }
```

**Changing a page's content.** The View Transitions API cross-fades a change where the browser supports it; elsewhere the change simply happens:

```js
function show(update) {
  if (document.startViewTransition) document.startViewTransition(update);
  else update();
}
```

Keep page changes short: fade the content area only, never the navigation.

## Motion in JavaScript

When a script animates (`element.animate()`, a loop with `requestAnimationFrame`), read the roles from the page and check reduced motion first:

```js
const css = getComputedStyle(document.documentElement);
const base = Number.parseFloat(css.getPropertyValue("--motif-duration-base"));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduce) panel.animate([{ transform: "translateY(0.5rem)" }, { transform: "none" }], { duration: base, easing: css.getPropertyValue("--motif-easing-enter") });
```

## Reduced motion

`motif.css` stops CSS animations and transitions for people who ask their system for less motion, so CSS motion needs nothing more. Script-driven motion doesn't stop on its own: check `prefers-reduced-motion` as above and skip it, or swap movement for a fade. `motif shot --audit` reports anything that still moves when reduced motion is on.
````

`skill/adapters/plain-web/platform.md`:
````markdown
# Platform rules

The web conventions and accessibility details a plain web site follows, beyond the design guide's own rules.

## Semantic HTML first

- Landmarks: `header`, `nav`, `main` and `footer`.
- One `h1` per page (or per state of a one-page tool), and headings in order.
- Native elements before ARIA: `button`, `a`, `input`, `select`, `dialog` and `details` already work with a keyboard and a screen reader. A clickable `div` is neither a button to a screen reader nor to a keyboard.
- `<html lang="…">` on every page, so screen readers pronounce the text correctly.
- Images with `alt` text; decorative ones with `alt=""`.

## Forms

- A visible `label` for every field. A placeholder isn't a label: it disappears as soon as someone types.
- A real `form` with a submit `button`, so Enter sends it. Where the site has a server, give the form an `action` and `method` so it works before the script loads.
- The right `type`, `inputmode` and `autocomplete` for each field (`email`, `name`, `tel`, `current-password`, `one-time-code`…), so phones show the right keyboard and browsers can fill them.
- `enterkeyhint` on phone keyboards (`next`, `done`, `search`, `send`).
- Check a field when it's left and when the form is sent; say what's wrong in words below it ([components](components.md#example-field)).

## Right to left

Use logical properties, so right-to-left languages mirror for free:

| Instead of | Use |
|---|---|
| `padding-left`, `padding-right` | `padding-inline-start`, `padding-inline-end` |
| `margin-left`, `margin-right` | `margin-inline-start`, `margin-inline-end` |
| `left`, `right` | `inset-inline-start`, `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `border-top` | `border-block-start` |

Set `dir="rtl"` on `<html>` for right-to-left languages, and mirror icons that point a direction with `:dir(rtl) .icon-back { transform: scaleX(-1); }`.

## Pointers and touch

- Hover effects go inside `@media (hover: hover)` and are extras: never hide an action behind hover.
- Touch targets are at least 44 px. Where a dense desktop layout needs smaller controls, make them bigger on touch screens with `@media (pointer: coarse)`.

## Breakpoints

The design guide has no breakpoint roles, and CSS variables can't be used in media queries, so use these widths and lay out phone first: `@media (min-width: 40rem)`, `48rem`, `64rem` and `80rem`. If the site uses others, say so in `DESIGN.md` section 8.

## System settings

- Light and dark follow `prefers-color-scheme`; `motif.css` does this ([theme code](tokens.md#dark-mode)).
- Reduced motion follows `prefers-reduced-motion` ([motion](motion.md#reduced-motion)).
- Text grows with browser zoom, so never fix the height of anything that holds text.

## Phones

- The viewport meta tag on every page: `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- For bars pinned to the bottom, `viewport-fit=cover` in that tag and `padding-block-end: env(safe-area-inset-bottom)`, so they clear the home indicator. A safe-area inset isn't a design value: mark it `motif-ok: safe area` if `motif check` reports it.
- Inputs at least 16 px, so iOS doesn't zoom in when one is focused (the `body` role is 16 px in every starting style).
- Things people use together stay on one screen: a live preview and the controls that change it, a field and its error, a total and the button that pays it. Check at narrow and wide phone widths (`motif shot --phones`).
````

`skill/adapters/plain-web/checks.md`:
````markdown
# Checks and screenshots

What `motif check` and `motif shot --audit` report on a plain web site, how to fix each finding, and how to capture screens that only appear after a form or a click.

`motif check` reads CSS where it is: `.css` files, `<style>` blocks and `style=""` attributes in `.html` pages. Scripts are read as scripts (colours in strings, styles set from code). Every finding names the file, line and column.

A value that truly must stay as it is (a colour the user picked, a partner's brand colour) gets a `motif-ok: <reason>` comment on its line or the line above: `/* motif-ok: … */` in CSS, `<!-- motif-ok: … -->` in HTML, `// motif-ok: …` in scripts. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason.

## `raw-color`

A colour typed into CSS, a `style=""` attribute or a script: hex, `rgb()`, `hsl()`, `oklch()` or a named colour. That includes the site's own variables set to a colour.

- Example: `color: #8a8a8a`, `style="background: tomato"`, `--bg: #f2f2f7`, `el.style.color = "#333"`.
- Fix: the colour role it stands for, `var(--motif-color-text-secondary)`, or the site's own variable defined from that role (`--bg: var(--motif-color-background)`; [theme code](tokens.md#the-sites-own-names)).

## `off-scale`

A spacing, corner or text size that isn't on the theme's scales.

- Example: `padding: 13px`, `gap: 18px`, `border-radius: 10px`, `font-size: 15px`.
- Fix: the nearest step, `var(--motif-space-4)`, `var(--motif-radius-md)` or a text role's `var(--motif-font-body-size)`. If the design truly needs a new step, propose a change to the design guide instead.

## `raw-font`

A font family typed into CSS or a script. `@font-face` declarations are fine: they load the theme's fonts.

- Example: `font-family: Georgia, serif`.
- Fix: a font role's family, `var(--motif-font-heading-family)`.

## `raw-motion`

A duration or easing curve typed into a transition, an animation or a script.

- Example: `transition: transform 250ms ease-in-out`, `{ duration: 300 }` in `element.animate()`.
- Fix: `var(--motif-duration-fast)` and `var(--motif-easing-standard)`; in scripts, read them from the page ([motion](motion.md#motion-in-javascript)).

## `primitive-use`

A raw palette value used in the site.

- Example: `var(--motif-primitive-color-violet-600)`.
- Fix: the role that points at it, `var(--motif-color-action-primary)`.

## `reduced-motion`

The site animates, but nothing honours reduced motion. Linking `motif.css` fixes it for CSS animation; it already has the rule.

- Fix: link `motif.css` on every page ([theme code](tokens.md#linking-it-once-per-page)), or add a global `@media (prefers-reduced-motion: reduce)` rule for your own animations.

## `generated-edited`

`motif.css` was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Tailwind's rules

`tailwind-arbitrary` and `tailwind-palette` don't apply to plain web sites: class names are the site's own.

## Contrast

From `motif shot --audit`: text measured on screen below 4.5:1 (3:1 for large text).

- Fix: use the text role the design guide pairs with that surface. Look for text faded with `opacity`, and for colours that don't change in dark mode (a typed colour, or a variable set to one). If a pair itself fails, `motif validate` reports it too, and the role values need changing.

## Target size

From `motif shot --audit`: a control smaller than 24×24 px (critical), or smaller than 44×44 px at phone widths (minor).

- Fix: `min-height: 3rem` on buttons and fields, `3rem` square icon buttons, more padding around small links, or more space between neighbouring controls.

## Reduced motion

From `motif shot --audit`: something still moves when reduced motion is on.

- Fix: script-driven motion checks `prefers-reduced-motion` before it starts ([motion](motion.md#reduced-motion)); CSS motion stops with `motif.css` linked.

## Screens behind a form or a click

`motif shot` captures each page as it loads. A screen that only appears after someone fills in a form, opens a panel or sends something needs a **state script**: a few lines of JavaScript that get the page there. Keep one per state in `design/states/`, named after the state (letters, digits and dashes):

```js
// design/states/sent.js: the page after a postcard is sent.
const form = document.getElementById("form");
form.elements.to.value = "Amara Okafor";
form.elements.message.value = "Wish you were here.";
form.requestSubmit();
```

Then capture each page in its plain state and in every state, at phone and desktop widths, in light and dark:

```bash
motif shot --audit --state design/states/sent.js --state design/states/errors.js
```

- The screenshots are named after the page and the state: `index@sent.mobile.png`, `index@sent.desktop.dark.png`.
- A state script runs in the page, after it loads. It can click (`element.click()`), fill fields, send a form (`form.requestSubmit()`), call the page's own functions, or wait for something (`await new Promise((r) => setTimeout(r, 500))`).
- It's stopped after 15 seconds. A script that fails, or a dialog the page opens, is reported with the state's name, and the other screenshots go on.
- `--save` and `--against` include states, so before-and-after pictures cover them too. Use the same `--state` options for both runs.
- Use mock data in state scripts, never anything real.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the state, the element and a screenshot. Fix what they report, then run them again until both are clean.
````

- [ ] **Step 4: Run the tests to see them pass**

Run (from `cli/`): `bun test test/adapters.test.ts test/skill-content.test.ts test/plugin.test.ts`
Expected: PASS (the lint reads the new files too; the plugin build copies them).

- [ ] **Step 5: Commit**

```bash
git add skill/adapters/plain-web cli/test/adapters.test.ts
git commit -m "feat(skill): the plain web stack guide" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: SKILL.md and the modes

**Files:**
- Modify: `skill/SKILL.md`, `skill/modes/init.md`, `skill/modes/feature.md`, `skill/modes/review.md`, `skill/modes/design.md`
- Test: `cli/test/skill-modes.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: the guide's files and anchors (Task 2); `motif shot --phones` (Task 1) and `--state` (Plan 2A).
- Produces: nothing code consumes; the eval cases (Task 6) run these modes.

- [ ] **Step 1: Write the failing test**

Add at the end of `cli/test/skill-modes.test.ts`:
```ts
describe("plain web, screens behind forms, and every phone width", () => {
  test("SKILL.md sends plain web sites to their guide; they need no Node.js", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/plain-web/README.md)");
    expect(skill).toContain("plain web sites need none");
  });

  test("init offers a simple web page and starts it from the plain web guide", () => {
    const init = read("modes/init.md");
    for (const s of ["a simple web page or site with no framework", "(../adapters/plain-web/README.md)", "linking `motif.css` in each page", "a plain web site has none", "--state"]) {
      expect(init).toContain(s);
    }
  });

  test("feature lists a plain site's components from components.css, and captures new states", () => {
    const feature = read("modes/feature.md");
    for (const s of ["(../adapters/plain-web/components.md)", "`Component:` lines", "--state"]) expect(feature).toContain(s);
  });

  test("review captures screens behind forms, checks every fix at every phone width, and keeps things used together on one screen", () => {
    const review = read("modes/review.md");
    expect(outOfOrder(review, [
      "## 3. Audit", "design/states/", "(../adapters/plain-web/checks.md#screens-behind-a-form-or-a-click)", "fit on one screen",
      "## 5. Rebuild", "--phones --state design/states/<state>.js --save before", "--against before", "360, 390 and 430 px", "on one screen", '"status": "fixed"',
    ])).toBeNull();
    expect(review).toContain("(../adapters/plain-web/checks.md)");
  });

  test("the design mode asks for Node.js only for React apps", () => {
    expect(read("modes/design.md")).toContain("No Node.js for a React app");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/skill-modes.test.ts`
Expected: FAIL — the new tests: SKILL.md doesn't contain `(adapters/plain-web/README.md)`, and so on.

- [ ] **Step 3: `skill/SKILL.md`**

Replace
```
For each app in `apps`, read its stack guide, `adapters/<stack>/README.md`: for example [React web](adapters/react-web/README.md). It says how to start a project, use the theme code, build components, animate, and fix what `motif check` and `motif shot` report.
```
with
```
For each app in `apps`, read its stack guide, `adapters/<stack>/README.md`: [React web](adapters/react-web/README.md), or [plain web](adapters/plain-web/README.md) for a site of HTML, CSS and JavaScript without a framework. It says how to start a project, use the theme code, build components, animate, and fix what `motif check` and `motif shot` report.
```
and replace `| The app's toolchain is missing (Node.js for web apps) |` with `| The app's toolchain is missing (Node.js for React apps; plain web sites need none) |`.

- [ ] **Step 4: `skill/modes/init.md`**

Replace
```
3. Platform and stack: a web app (React, the default) or another stack. Pre-fill what `motif doctor --json` found.
```
with
```
3. Platform and stack: a web app (React, the default), a simple web page or site with no framework (plain web), or another stack. Pre-fill what `motif doctor --json` found.
```
Replace `with the starter command in the stack guide ([React web](../adapters/react-web/README.md): Next.js by default, Vite for a single-page app).` with:
```
with the starter in the stack guide ([React web](../adapters/react-web/README.md): Next.js by default, Vite for a single-page app; [plain web](../adapters/plain-web/README.md): a few files and no build step).
```
Replace `(for example importing the CSS once)` with
```
(for example importing the CSS once, or linking `motif.css` in each page)
```

Replace
```
   - Web apps: welcome or landing, sign-in, home.
   - Mobile apps: onboarding, sign-in, home.
```
with
```
   - Web apps: welcome or landing, sign-in, home.
   - Mobile apps: onboarding, sign-in, home.
   - Plain web sites: the pages the brief names; a one-page tool is its page and each state behind a form or a click.
```
Replace `2. Run the project's build and type check (the stack guide names them).` with `2. Run the project's build and type check (the stack guide names them; a plain web site has none).`

Replace the first sentence of step 7's item 3,
```
3. Run `motif shot --audit` for the starter screens, in light and dark at phone and desktop widths.
```
with
```
3. Run `motif shot --audit` for the starter screens, in light and dark at phone and desktop widths, adding `--state` for each screen behind a form or a click (the stack guide's checks show how).
```

- [ ] **Step 5: `skill/modes/feature.md`**

Replace `The stack guide says where they live (React web: [components](../adapters/react-web/components.md)).` with:
```
The stack guide says where they live (React web: [components](../adapters/react-web/components.md); plain web: the `Component:` lines in `components.css`, [components](../adapters/plain-web/components.md)).
```
Replace
```
2. Run `motif shot --audit --routes <the new routes>`. Fix the critical and major findings and run it again.
```
with
```
2. Run `motif shot --audit --routes <the new routes>`, adding `--state` for each new screen behind a form or a click. Fix the critical and major findings and run it again.
```

- [ ] **Step 6: `skill/modes/review.md`**

Replace
```
3. `motif shot --audit`: contrast and tap-target sizes as rendered, and movement under reduced motion, for the screens in scope (light and dark, phone and desktop). It also writes its findings to `design/shots/audit.json` in the report format below.
```
with
```
3. `motif shot --audit`: contrast and tap-target sizes as rendered, and movement under reduced motion, for the screens in scope (light and dark, phone and desktop). Screens that only appear after a form or a click (a result, an editor, an error) need a state script: write one per state in `design/states/`, as the stack guide's checks show ([plain web](../adapters/plain-web/checks.md#screens-behind-a-form-or-a-click)), and add `--state design/states/<state>.js` for each. It also writes its findings to `design/shots/audit.json` in the report format below.
```
Replace
```
**Judgement**, screen by screen, from the screenshots and the code: hierarchy, layout and spacing rhythm, the flow through each task, missing states, copy, motion quality, platform conventions and the tells of generated UI. Use [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), [motion](../knowledge/motion.md), [accessibility](../knowledge/accessibility.md), the UX pattern guide for each screen, and the stack guide's [checks](../adapters/react-web/checks.md).
```
with
```
**Judgement**, screen by screen and state by state, from the screenshots and the code: hierarchy, layout and spacing rhythm, the flow through each task, whether things people use together (a live preview and the controls that change it, a form and its result) fit on one screen, missing states, copy, motion quality, platform conventions and the tells of generated UI. Use [visual craft](../knowledge/visual-craft.md), [anti-patterns](../knowledge/anti-patterns.md), [motion](../knowledge/motion.md), [accessibility](../knowledge/accessibility.md), the UX pattern guide for each screen, and the stack guide's checks ([React web](../adapters/react-web/checks.md), [plain web](../adapters/plain-web/checks.md)).
```
Replace section 5's list
```
1. Before changing anything, keep screenshots of the screens you'll touch: `motif shot --routes <routes> --save before`.
2. Fix the chosen findings with theme values only; a needed new value goes through a design guide change ⏸.
3. Run the exact checks again: `motif validate`, `motif check` and `motif shot --audit`.
4. Run `motif shot --routes <routes> --against before` and show the before-and-after images; the output says how much each screen changed.
5. Mark each fixed finding `"status": "fixed"` in the JSON report and update the Markdown version; leave the rest `"open"`.
```
with
```
1. Before changing anything, keep screenshots of the screens you'll touch, in the states the audit used and at every phone width: `motif shot --routes <routes> --phones --state design/states/<state>.js --save before` (one `--state` per state script).
2. Fix the chosen findings with theme values only; a needed new value goes through a design guide change ⏸.
3. Run the exact checks again: `motif validate`, `motif check` and `motif shot --audit` (with the same `--state` options).
4. Run `motif shot --routes <routes> --phones --state design/states/<state>.js --against before`, with the same options as when you saved, and show the before-and-after images; the output says how much each screen changed.
5. Look at every fix at each phone width: 360, 390 and 430 px. A fix that looks right on one phone can push things apart on another. Where people use things together (a live preview and the controls that change it, a form and its result), make sure they still fit on one screen wherever they did before; if a fix breaks that, find another way.
6. Mark each fixed finding `"status": "fixed"` in the JSON report and update the Markdown version; leave the rest `"open"`.
```
In section 6, replace
```
1. Keep screenshots first: `motif shot --routes <routes> --save before`.
```
with
```
1. Keep screenshots first: `motif shot --routes <routes> --phones --save before`, with `--state` for each screen behind a form or a click.
```
and in its item 4 replace
```
run `motif check` and `motif shot --routes <route> --against before`,
```
with
```
run `motif check` and `motif shot --routes <route> --against before` (with the same options as when you saved),
```

- [ ] **Step 7: `skill/modes/design.md`**

Replace `- No Node.js for a web app:` with `- No Node.js for a React app:`.

- [ ] **Step 8: Run the tests to see them pass**

Run (from `cli/`): `bun test test/skill-modes.test.ts test/skill-content.test.ts test/plugin.test.ts`
Expected: PASS (every existing order test still holds: the new text adds to the steps without reordering them).

- [ ] **Step 9: Commit**

```bash
git add skill/SKILL.md skill/modes cli/test/skill-modes.test.ts
git commit -m "feat(skill): plain web in SKILL.md and the modes; reviews cover screens behind forms and every phone width" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The plain contract site (Kitepost)

**Files:**
- Create: `tests/fixtures/plain-contract-site/` (the files below)
- Modify: `tests/fixtures/assemble.ts`
- Test: `cli/test/fixtures-plain-contract.test.ts`

**Interfaces:**
- Consumes: `runValidate`, `runCheck`, `runShot`, `detectApps`, `findBrowser`; `motif tokens` (run from source).
- Produces:
  - `FixtureName` = `"react-contract-app" | "react-seeded-app" | "plain-contract-site" | "plain-seeded-site"`; `assemble(fixture, dest)` copies a seeded fixture's base, then its overlay, then removes its `remove` list (Task 5 adds the seeded site's files; this task adds its name).
  - Kitepost's facts later tasks use: one page (`/`), site folder `.`, components `Button`, `Field`, `Choice`, `Card`, `ListItem`, `Badge`, `EmptyState`, `TopBar`, state scripts `design/states/{sent,errors,empty}.js`, mock data in `mock-data.js`.

- [ ] **Step 1: Write the failing test**

`cli/test/fixtures-plain-contract.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runValidate } from "../src/commands/validate";
import { findBrowser } from "../src/detect/browser";
import { detectApps } from "../src/detect/stacks";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const SITE = join(import.meta.dir, "../../tests/fixtures/plain-contract-site");
const read = (rel: string) => readFileSync(join(SITE, rel), "utf8").replace(/\r\n/g, "\n");

describe("the plain contract site (Kitepost)", () => {
  test("its design guide is valid, without a single warning", async () => {
    const r = await runValidate(SITE);
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  test("its code follows the design guide: no violations, exceptions or warnings", async () => {
    const r = await runCheck(SITE, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("Motif sees one plain web site, with its pages in this folder", () => {
    expect(detectApps(SITE).apps).toEqual([{ path: ".", stack: "plain-web", source: "motif.json", srcDir: "." }]);
    expect(existsSync(join(SITE, "package.json"))).toBe(false);
  });

  test("it's wired the way the plain web guide says", () => {
    const page = read("index.html");
    expect([...page.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1])).toEqual(["motif.css", "components.css", "styles.css"]);
    for (const s of ['<html lang="en">', '<meta name="viewport" content="width=device-width, initial-scale=1">', '<script src="mock-data.js" defer></script>', '<script src="app.js" defer></script>']) {
      expect(page).toContain(s);
    }
    expect(read("motif.css").startsWith("/* Generated by Motif")).toBe(true);
    expect(read("styles.css")).toContain('src: url("fonts/nunito.woff2") format("woff2");');
    for (const f of ["fonts/nunito.woff2", "fonts/LICENSE-nunito.txt"]) expect(existsSync(join(SITE, f))).toBe(true);
  });

  test("its own names are defined from roles", () => {
    const root = read("styles.css").match(/:root \{([^}]*)\}/)![1]!;
    for (const name of ["--paper", "--ink", "--ink-soft"]) expect(root).toMatch(new RegExp(`${name}: var\\(--motif-color-[a-z-]+\\);`));
  });

  test("components.css and DESIGN.md section 5 list the same components", () => {
    const inCss = [...read("components.css").matchAll(/^\/\* Component: (\w+) —/gm)].map((m) => m[1]);
    const section = read("DESIGN.md").split("## 5. Components")[1]!.split("## 6.")[0]!;
    const inGuide = [...section.matchAll(/^\| (\w+) \|/gm)].map((m) => m[1]).filter((n) => n !== "Component");
    expect(inCss).toEqual(["Button", "Field", "Choice", "Card", "ListItem", "Badge", "EmptyState", "TopBar"]);
    expect(inGuide).toEqual(inCss);
  });

  test("every state has a script, all mock data is in one file, and drafts stay out of git", () => {
    for (const s of ["sent", "errors", "empty"]) expect(existsSync(join(SITE, `design/states/${s}.js`))).toBe(true);
    expect(read("mock-data.js")).toContain("window.MOCK = {");
    expect(read("app.js")).not.toContain("Amara");
    expect(read("design/.gitignore")).toContain(".progress.json");
  });
});

describe("the plain contract site in a browser", () => {
  const browser = findBrowser();
  test.skipIf(!browser)("motif shot --audit finds nothing in any state, light or dark, phone or desktop (needs Chrome, Edge or Chromium)", async () => {
    const dest = join(tempDir("motif-plain-"), "site");
    assemble("plain-contract-site", dest);
    const r = await runShot(dest, { positionals: [], flags: { audit: true, state: ["design/states/sent.js", "design/states/errors.js", "design/states/empty.js"] } });
    expect(r.data.routes.map((x: any) => [x.route, x.status, x.pageErrors ?? []])).toEqual([["/", 200, []]]);
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 180_000);
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/fixtures-plain-contract.test.ts`
Expected: FAIL — `motif validate` reports no design guide in the missing folder, and `assemble` rejects the unknown fixture name (a TypeScript error when type-checking; at run time the folder doesn't exist).

- [ ] **Step 3: Four fixture names in `tests/fixtures/assemble.ts`**

Replace the file's body from `export type FixtureName` to the end with:
```ts
export const FIXTURE_NAMES = ["react-contract-app", "react-seeded-app", "plain-contract-site", "plain-seeded-site"] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

/** Each seeded fixture is its base fixture plus an overlay. */
const BASES: Partial<Record<FixtureName, FixtureName>> = { "react-seeded-app": "react-contract-app", "plain-seeded-site": "plain-contract-site" };

const FIXTURES = import.meta.dir;
```
keep `keptFiles` and `copyKept` as they are, then:
```ts
export function assemble(fixture: FixtureName, dest: string): void {
  if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} isn't empty; a fixture is only assembled into an empty folder.`);
  mkdirSync(dest, { recursive: true });
  const base = BASES[fixture];
  copyKept(join(FIXTURES, base ?? fixture), dest);
  if (base) {
    copyKept(join(FIXTURES, fixture, "overlay"), dest);
    const list = JSON.parse(readFileSync(join(FIXTURES, fixture, "seeded-issues.json"), "utf8"));
    for (const path of list.remove as string[]) rmSync(join(dest, path), { force: true });
  }
}

if (import.meta.main) {
  const [fixture, dest] = process.argv.slice(2);
  if (!(FIXTURE_NAMES as readonly string[]).includes(fixture ?? "") || !dest) {
    console.error(`Usage: bun tests/fixtures/assemble.ts <${FIXTURE_NAMES.join("|")}> <empty folder>`);
    process.exit(2);
  }
  assemble(fixture as FixtureName, resolve(dest));
  console.log(`Assembled ${fixture} in ${resolve(dest)}`);
}
```
(The `const FIXTURES = import.meta.dir;` line that was above `keptFiles` moves up with the names; keep only one.) Update the file's first comment to `// Builds a working copy of an eval fixture: a contract app or site, plus the seeded overlay for a seeded one.`

- [ ] **Step 4: Write Kitepost's files**

`tests/fixtures/plain-contract-site/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kitepost: send a postcard</title>
  <link rel="stylesheet" href="motif.css">
  <link rel="stylesheet" href="components.css">
  <link rel="stylesheet" href="styles.css">
  <script src="mock-data.js" defer></script>
  <script src="app.js" defer></script>
</head>
<body>
  <header class="top-bar">
    <p class="top-bar-title">Kitepost</p>
  </header>

  <main class="page">
    <section class="composer" id="composer" aria-labelledby="composer-title">
      <h1 class="page-title" id="composer-title">Send a postcard</h1>

      <figure class="postcard" id="preview" data-stamp="kite" aria-label="Postcard preview">
        <span class="postcard-stamp" aria-hidden="true"></span>
        <p class="postcard-message" id="preview-message">Your message appears here as you write it.</p>
        <p class="postcard-line">To <span id="preview-to">someone special</span></p>
        <p class="postcard-line">From <span id="preview-from">you</span></p>
      </figure>

      <form class="composer-form" id="form" novalidate>
        <div class="field">
          <label class="field-label" for="to">To</label>
          <input class="field-input" id="to" name="to" autocomplete="off" aria-describedby="to-error">
          <p class="field-error" id="to-error" hidden>Add who the postcard is for.</p>
        </div>
        <div class="field">
          <label class="field-label" for="message">Message</label>
          <textarea class="field-input" id="message" name="message" rows="3" maxlength="140" aria-describedby="message-hint message-error"></textarea>
          <p class="field-hint" id="message-hint"><span id="message-count">0</span> of 140 characters</p>
          <p class="field-error" id="message-error" hidden>Write a message first.</p>
        </div>
        <div class="field">
          <label class="field-label" for="from">From</label>
          <input class="field-input" id="from" name="from" autocomplete="name" aria-describedby="from-error">
          <p class="field-error" id="from-error" hidden>Add your name, so they know who it's from.</p>
        </div>
        <fieldset class="choice-group">
          <legend class="field-label">Stamp</legend>
          <label class="choice"><input class="choice-input" type="radio" name="stamp" value="kite" checked><span class="choice-swatch" data-stamp="kite"></span>Kite</label>
          <label class="choice"><input class="choice-input" type="radio" name="stamp" value="cloud"><span class="choice-swatch" data-stamp="cloud"></span>Cloud</label>
          <label class="choice"><input class="choice-input" type="radio" name="stamp" value="ink"><span class="choice-swatch" data-stamp="ink"></span>Ink</label>
        </fieldset>
        <button class="button" type="submit">Send postcard</button>
      </form>
    </section>

    <section class="sent" id="sent" tabindex="-1" aria-labelledby="sent-title" hidden>
      <h1 class="page-title" id="sent-title">Your postcard is on its way</h1>
      <p class="sent-text">We'll post it to <span id="sent-to"></span> tomorrow morning. Your tracking code is <strong id="sent-code"></strong>.</p>
      <button class="button button-secondary" id="again" type="button">Write another postcard</button>
    </section>

    <section class="recent" aria-labelledby="recent-title">
      <h2 class="section-title" id="recent-title">Recently sent</h2>
      <ul class="list" id="recent"></ul>
      <div class="empty-state" id="recent-empty" hidden>
        <p class="empty-state-title">No postcards yet</p>
        <p class="empty-state-text">The postcards you send will be listed here.</p>
      </div>
    </section>
  </main>
</body>
</html>
```

`tests/fixtures/plain-contract-site/components.css`:
```css
/* Kitepost's components. Each starts with a "Component:" line; DESIGN.md section 5 lists the same set. */

/* Component: Button — actions: primary (default), secondary */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--motif-space-2);
  min-height: 3rem;
  padding-inline: var(--motif-space-5);
  border: 0;
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-label-line-height);
  cursor: pointer;
  transition: transform var(--motif-duration-fast) var(--motif-easing-standard);
}
.button:active:not(:disabled) { transform: scale(0.97); }
.button:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.button:disabled { cursor: not-allowed; opacity: 0.5; }
.button[aria-busy="true"] { cursor: progress; }
.button-secondary { background: var(--motif-color-action-secondary); color: var(--motif-color-on-action-secondary); }

/* Component: Field — a labelled input or textarea, with a hint and an error */
.field { display: grid; gap: var(--motif-space-2); }
.field-label {
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-label-line-height);
  color: var(--motif-color-text-primary);
}
.field-input {
  min-height: 3rem;
  padding: var(--motif-space-3) var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
  line-height: var(--motif-font-body-line-height);
}
.field-input:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.field-input[aria-invalid="true"] { border-color: var(--motif-color-danger); }
.field-input:disabled { opacity: 0.5; }
.field-hint, .field-error {
  margin: 0;
  font-family: var(--motif-font-caption-family);
  font-size: var(--motif-font-caption-size);
  line-height: var(--motif-font-caption-line-height);
}
.field-hint { color: var(--motif-color-text-secondary); }
.field-error { color: var(--motif-color-danger); }

/* Component: Choice — one option in a group of radio buttons, with a swatch */
.choice-group { display: flex; flex-wrap: wrap; gap: var(--motif-space-3); margin: 0; padding: 0; border: 0; }
.choice-group > legend { margin-block-end: var(--motif-space-2); padding: 0; }
.choice {
  display: inline-flex;
  align-items: center;
  gap: var(--motif-space-2);
  min-height: 3rem;
  padding-inline: var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-full);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  cursor: pointer;
}
.choice:has(.choice-input:checked) { border-color: var(--motif-color-action-primary); background: var(--motif-color-surface-raised); }
.choice:has(.choice-input:focus-visible) { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.choice-input { position: absolute; opacity: 0; pointer-events: none; }
.choice-swatch { width: 1.25rem; height: 1.25rem; border-radius: var(--motif-radius-full); background: var(--stamp); }

/* Component: Card — a group of related content */
.card {
  padding: var(--motif-space-5);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-lg);
  background: var(--motif-color-surface);
}

/* Component: ListItem — a row in a list */
.list { margin: 0; padding: 0; list-style: none; border: 1px solid var(--motif-color-border); border-radius: var(--motif-radius-lg); background: var(--motif-color-surface); }
.list-item { display: flex; align-items: center; justify-content: space-between; gap: var(--motif-space-4); padding: var(--motif-space-4) var(--motif-space-5); }
.list-item + .list-item { border-block-start: 1px solid var(--motif-color-border); }
.list-item-title { margin: 0; color: var(--motif-color-text-primary); font-family: var(--motif-font-body-family); font-size: var(--motif-font-body-size); line-height: var(--motif-font-body-line-height); }
.list-item-meta { margin: 0; color: var(--motif-color-text-secondary); font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); line-height: var(--motif-font-caption-line-height); }

/* Component: Badge — a status in words, on its status colour */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--motif-space-1) var(--motif-space-3);
  border-radius: var(--motif-radius-full);
  font-family: var(--motif-font-caption-family);
  font-size: var(--motif-font-caption-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-caption-line-height);
}
.badge-success { background: var(--motif-color-success); color: var(--motif-color-on-success); }
.badge-info { background: var(--motif-color-info); color: var(--motif-color-on-info); }

/* Component: EmptyState — nothing here yet: a title and one line */
.empty-state { padding: var(--motif-space-8) var(--motif-space-5); border: 1px dashed var(--motif-color-border); border-radius: var(--motif-radius-lg); text-align: center; }
.empty-state-title { margin: 0 0 var(--motif-space-2); color: var(--motif-color-text-primary); font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); font-weight: var(--motif-font-heading-weight); line-height: var(--motif-font-heading-line-height); }
.empty-state-text { margin: 0; color: var(--motif-color-text-secondary); font-family: var(--motif-font-body-family); font-size: var(--motif-font-body-size); line-height: var(--motif-font-body-line-height); }

/* Component: TopBar — the site's name at the top of every page */
.top-bar { display: flex; align-items: center; min-height: 3.5rem; padding-inline: var(--motif-space-4); border-block-end: 1px solid var(--motif-color-border); background: var(--motif-color-surface); }
.top-bar-title { margin: 0; color: var(--motif-color-text-primary); font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); font-weight: var(--motif-font-heading-weight); line-height: var(--motif-font-heading-line-height); }
```

`tests/fixtures/plain-contract-site/styles.css`:
```css
/* Kitepost's page: the theme's font, its own names for a few roles, and the layout. */

@font-face {
  font-family: "Nunito";
  font-style: normal;
  font-display: swap;
  font-weight: 200 1000;
  src: url("fonts/nunito.woff2") format("woff2");
}

/* The postcard's own names, each defined from a role, so dark mode and the design guide apply. */
:root {
  --paper: var(--motif-color-surface-raised);
  --ink: var(--motif-color-text-primary);
  --ink-soft: var(--motif-color-text-secondary);
}
[data-stamp="kite"] { --stamp: var(--motif-color-action-primary); }
[data-stamp="cloud"] { --stamp: var(--motif-color-action-secondary); }
[data-stamp="ink"] { --stamp: var(--motif-color-text-primary); }

body {
  margin: 0;
  background: var(--motif-color-background);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
  line-height: var(--motif-font-body-line-height);
}

.page { display: grid; gap: var(--motif-space-10); max-width: 40rem; margin-inline: auto; padding: var(--motif-space-6) var(--motif-space-4) var(--motif-space-12); }
.page-title { margin: 0; font-family: var(--motif-font-title-family); font-size: var(--motif-font-title-size); font-weight: var(--motif-font-title-weight); line-height: var(--motif-font-title-line-height); }
.section-title { margin: 0 0 var(--motif-space-4); font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); font-weight: var(--motif-font-heading-weight); line-height: var(--motif-font-heading-line-height); }

/* The preview sits right above the fields that change it, so both stay in view while writing. */
.composer { display: grid; gap: var(--motif-space-5); }
.composer-form { display: grid; gap: var(--motif-space-5); }

.postcard {
  position: relative;
  display: grid;
  gap: var(--motif-space-2);
  margin: 0;
  padding: var(--motif-space-5);
  padding-inline-end: var(--motif-space-16);
  border-radius: var(--motif-radius-lg);
  background: var(--paper);
  box-shadow: var(--motif-shadow-md);
  color: var(--ink);
}
.postcard-stamp { position: absolute; inset-block-start: var(--motif-space-4); inset-inline-end: var(--motif-space-4); width: 2.5rem; height: 3rem; border-radius: var(--motif-radius-sm); background: var(--stamp); }
.postcard-message { margin: 0; min-height: 3rem; font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); line-height: var(--motif-font-heading-line-height); overflow-wrap: anywhere; }
.postcard-line { margin: 0; color: var(--ink-soft); font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); line-height: var(--motif-font-caption-line-height); }

.sent { display: grid; gap: var(--motif-space-5); justify-items: start; animation: rise var(--motif-duration-slow) var(--motif-easing-enter); }
.sent:focus { outline: none; }
.sent-text { margin: 0; color: var(--motif-color-text-secondary); }

@keyframes rise {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: none; }
}

[hidden] { display: none !important; }
```

`tests/fixtures/plain-contract-site/mock-data.js`:
```js
// Kitepost's mock data: made-up people and postcards. Nothing here is real, and nothing is ever sent.
window.MOCK = {
  recent: [
    { to: "Amara Okafor", sent: "2026-10-12", status: "delivered" },
    { to: "Theo Lindqvist", sent: "2026-10-09", status: "delivered" },
    { to: "Grandma June", sent: "2026-10-14", status: "on-its-way" },
  ],
  nextCode: "KP-4821",
};
```

`tests/fixtures/plain-contract-site/app.js`:
```js
// Kitepost: the live preview, the form's checks, the sent state and the recent list. Mock data only; nothing is sent.
const $ = (id) => document.getElementById(id);
const form = $("form");
const REQUIRED = ["to", "message", "from"];
const STATUS = { delivered: ["Delivered", "badge-success"], "on-its-way": ["On its way", "badge-info"] };
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

const value = (name) => form.elements[name].value.trim();

function updatePreview() {
  $("preview-message").textContent = value("message") || "Your message appears here as you write it.";
  $("preview-to").textContent = value("to") || "someone special";
  $("preview-from").textContent = value("from") || "you";
  $("preview").dataset.stamp = form.elements.stamp.value;
  $("message-count").textContent = String(form.elements.message.value.length);
}

/** Marks each empty field and shows its message; true when nothing is missing. */
function check() {
  let first = null;
  for (const name of REQUIRED) {
    const missing = value(name) === "";
    form.elements[name].setAttribute("aria-invalid", String(missing));
    $(`${name}-error`).hidden = !missing;
    if (missing && !first) first = form.elements[name];
  }
  first?.focus();
  return first === null;
}

function send() {
  $("sent-to").textContent = value("to");
  $("sent-code").textContent = window.MOCK.nextCode;
  $("composer").hidden = true;
  $("sent").hidden = false;
  $("sent").focus();
}

function writeAnother() {
  form.reset();
  for (const name of REQUIRED) {
    form.elements[name].removeAttribute("aria-invalid");
    $(`${name}-error`).hidden = true;
  }
  updatePreview();
  $("sent").hidden = true;
  $("composer").hidden = false;
  form.elements.to.focus();
}

function renderRecent(items) {
  const list = $("recent");
  list.replaceChildren(...items.map((item) => {
    const [label, tone] = STATUS[item.status];
    const row = document.createElement("li");
    row.className = "list-item";
    const text = document.createElement("div");
    text.append(
      Object.assign(document.createElement("p"), { className: "list-item-title", textContent: item.to }),
      Object.assign(document.createElement("p"), { className: "list-item-meta", textContent: `Sent ${dateFormat.format(new Date(item.sent))}` }),
    );
    row.append(text, Object.assign(document.createElement("span"), { className: `badge ${tone}`, textContent: label }));
    return row;
  }));
  list.hidden = items.length === 0;
  $("recent-empty").hidden = items.length > 0;
}

form.addEventListener("input", updatePreview);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (check()) send();
});
$("again").addEventListener("click", writeAnother);

// For state scripts (design/states/): the recent list can be shown with other data.
window.kitepost = { renderRecent };
renderRecent(window.MOCK.recent);
updatePreview();
```

`tests/fixtures/plain-contract-site/DESIGN.md`:
````markdown
---
motifContract: 1
name: Kitepost
updated: 2026-10-15
---

# Kitepost design guide

Kitepost feels like writing a postcard at a sunny kitchen table: gentle, friendly and quick. One page does one job: write a few lines, choose a stamp, send. The postcard preview sits right above the fields that change it, so you always see what you're making. Rounded shapes, soft colours and Nunito throughout keep it warm without getting in the way.

## 1. Brief

- **What it is:** a one-page tool for writing a short postcard and sending it (pretend: nothing is sent), with a list of recently sent postcards.
- **Who it is for:** anyone who wants to send a quick note to a friend or relative, often on a phone.
- **Personality:** gentle, friendly, quick, warm.
- **Voice and tone:** warm and plain. Short sentences, no exclamation marks. "Your postcard is on its way" rather than "Woohoo! Sent!"

## 2. Direction

- **Style:** the Soft starting style: warm neutrals, a gentle accent, Nunito for everything, generous corners.
- **Starting preset:** Soft.
- **References:** none.
- **Approved mockups:** none; the page was built straight from this guide.

## 3. Foundations

- **Colour:** `background` is the page; `surface` holds the form fields, the list and the top bar; `surface-raised` is the postcard's paper and the chosen stamp. `action-primary` marks the one main action (Send postcard) and the Kite stamp; `action-secondary` is for supporting actions and the Cloud stamp. Status colours only for status: `success` for delivered, `info` for on its way, `danger` for field errors. Text uses `text-primary`, and `text-secondary` for hints and metadata. The page's own names (`--paper`, `--ink`, `--ink-soft`, `--stamp`) are defined from these roles in `styles.css`.
- **Type:** `title` once per state of the page; `heading` for sections, the postcard's message and the site name; `body` for content and fields; `label` for controls; `caption` for hints, errors and dates.
- **Spacing:** the 4 px scale. `space.2`–`space.3` inside controls, `space.4`–`space.5` between related items, `space.10` between sections. The page has `space.4` side padding and is at most 40rem wide.
- **Corners and elevation:** `radius.sm` for the stamp, `radius.md` for buttons and fields, `radius.lg` for the postcard, cards and the list, `radius.full` for choices and badges. The postcard alone has `shadow.md`; everything else is flat with a `border`.
- **Icons:** none yet; words carry every action.

## 4. Motion

- **Presses:** buttons scale to 0.97 with `duration.fast` and `easing.standard`.
- **Changes of state:** the sent message rises in with `duration.slow` and `easing.enter`.
- **Reduced motion:** `motif.css` stops animations and transitions for people who ask for less motion.

## 5. Components

| Component | Purpose | Variants | States |
|---|---|---|---|
| Button | Actions | primary, secondary | default, pressed, focused, disabled, loading |
| Field | A labelled input or textarea | — | label, hint, focused, error, disabled |
| Choice | One option in a group of radio buttons | with a swatch | default, chosen, focused |
| Card | A group of related content | — | default |
| ListItem | A row in a list | — | default |
| Badge | A status in words | success, info | — |
| EmptyState | Nothing here yet | — | a title and one line |
| TopBar | The site's name | — | default |

- **Do:** reuse these before adding new ones; add a variant before a new component. New components go in `components.css` with a `Component:` line and a row here.
- **Don't:** style a one-off button or field in a page's own CSS.

## 6. Patterns

- **Navigation:** one page; the top bar names the site.
- **Forms:** labels above fields, the message's character count below it, errors below each field in words, checked when the form is sent.
- **Empty, loading and error:** the recent list has an empty state; nothing loads.
- **Feedback:** sending replaces the form with a confirmation and a tracking code, and a way to write another.
- **Modal or sheet:** none.

## 7. Accessibility

- Text meets WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text and UI parts) in light and dark.
- Every tap target is at least 24×24 px, and 44×44 px on touch screens.
- Text can be enlarged to 200% without losing content.
- Every interactive element shows a visible focus ring.
- Layouts use start/end (not left/right), so right-to-left languages work.

## 8. Platform notes

- A plain web page: `index.html`, `components.css`, `styles.css`, `app.js` and `mock-data.js`, with `motif.css` linked first. Nunito is served from `fonts/`.

## 9. Do / Don't

- **Do:** keep the preview and the fields that change it on one screen; say who a postcard went to and when.
- **Don't:** use colour alone for a postcard's status; send without checking the form.

## 10. Change log

- 2026-10-15 — Created the design guide — the Soft style suits a friendly postcard tool — approved by the Motif team
````

`tests/fixtures/plain-contract-site/design/states/sent.js`:
```js
// Kitepost after a postcard is sent: fill in the form and send it.
const form = document.getElementById("form");
form.elements.to.value = "Amara Okafor";
form.elements.message.value = "Wish you were here. The sea is warmer than it looks.";
form.elements.from.value = "Sam";
form.requestSubmit();
```

`tests/fixtures/plain-contract-site/design/states/errors.js`:
```js
// Kitepost when someone sends an empty postcard: every field says what's missing.
document.getElementById("form").requestSubmit();
```

`tests/fixtures/plain-contract-site/design/states/empty.js`:
```js
// Kitepost before the first postcard: the recent list is empty.
window.kitepost.renderRecent([]);
```

`tests/fixtures/plain-contract-site/design/.gitignore`:
```
.progress.json
directions/
```

- [ ] **Step 5: The theme values, the generated theme code and the font**

Run from the repository root:
```bash
cp skill/presets/soft/tokens.json tests/fixtures/plain-contract-site/design/tokens.json
bun cli/src/main.ts tokens --cwd tests/fixtures/plain-contract-site
mkdir -p tests/fixtures/plain-contract-site/fonts
cp skill/preview-kit/fonts/nunito.woff2 skill/preview-kit/fonts/LICENSE-nunito.txt tests/fixtures/plain-contract-site/fonts/
```
Expected: `motif tokens` reports `created motif.css`, `created design/generated/tokens.flat.json` and `created design/motif.json`, lists "Theme fonts: Nunito 400 · 500 · 600 · 700", and gives no "Next: link" note (the page already links `motif.css`).

- [ ] **Step 6: Run the tests to see them pass**

Run (from `cli/`): `bun test test/fixtures-plain-contract.test.ts test/fixtures-seeded.test.ts && bun run typecheck`
Expected: PASS; typecheck clean (the React seeded fixture still assembles the same way). Where a browser is found, the audit test runs: 1 page × 4 states × 4 captures, no findings.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/assemble.ts tests/fixtures/plain-contract-site cli/test/fixtures-plain-contract.test.ts
git commit -m "test(fixtures): Kitepost, a plain web site that follows its design guide" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The plain seeded site

**Files:**
- Create: `tests/fixtures/plain-seeded-site/README.md`, `seeded-issues.json`, `overlay/index.html`, `overlay/styles.css`, `overlay/components.css`, `overlay/app.js`, `overlay/motif.css`, `overlay/design/tokens.json`
- Modify: `tests/README.md`
- Test: `cli/test/fixtures-plain-seeded.test.ts`, `cli/test/plain-web-e2e.test.ts` (two tests on both fixtures with the compiled tool)

**Interfaces:**
- Consumes: `assemble("plain-seeded-site", dest)` (Task 4); Kitepost's `design/states/sent.js` (Task 4).
- Produces: `tests/fixtures/plain-seeded-site/seeded-issues.json` in the React seeded list's format (`motifSeeded: 1`, `remove`, `issues` with `id`, `kind`, `detectedBy`, `rule?`, `categories`, `severity`, `location`, `anchor?`, `summary`, `consequences?`), ids `P-01`…`P-17` (11 exact: `P-01`–`P-11`; 6 judgement: `P-12`–`P-17`). Task 6 grades `c-plain` against it.

- [ ] **Step 1: Write the failing test**

`cli/test/fixtures-plain-seeded.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runValidate } from "../src/commands/validate";
import { findBrowser } from "../src/detect/browser";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const list = JSON.parse(readFileSync(join(FIXTURES, "plain-seeded-site/seeded-issues.json"), "utf8"));
const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];
type Consequence = { category: string; screens: string[]; schemes: string[]; note: string };
type Issue = {
  id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: { file?: string; line?: number; screen?: string; app?: boolean }; anchor?: string; summary: string; consequences?: Consequence[];
};
const issues: Issue[] = list.issues;
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);

describe("the plain seeded site's list of planted problems", () => {
  test("has at least 12 problems: at least 7 the tool can detect and 5 that need judgement", () => {
    expect(issues.length).toBeGreaterThanOrEqual(12);
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(7);
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(5);
  });

  test("every entry is well formed", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      for (const c of i.categories) expect(CATEGORIES).toContain(c);
      expect(["critical", "major", "minor"]).toContain(i.severity);
      expect(Boolean(i.location.file || i.location.screen || i.location.app)).toBe(true);
      expect(i.summary.length).toBeGreaterThan(10);
    }
  });

  test("knock-on findings are declared, so a grader doesn't count them as false", () => {
    for (const id of ["P-02", "P-03", "P-08"]) {
      const issue = issues.find((i) => i.id === id)!;
      expect(issue.consequences?.length ?? 0).toBeGreaterThan(0);
      for (const c of issue.consequences!) {
        expect(CATEGORIES).toContain(c.category);
        expect(c.screens).toEqual(["/"]);
        for (const s of c.schemes) expect(["light", "dark"]).toContain(s);
        expect(c.note.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("the assembled plain seeded site", () => {
  const dest = join(tempDir("motif-plain-seeded-"), "site");
  assemble("plain-seeded-site", dest);
  const at = (rel: string) => readFileSync(join(dest, rel), "utf8").replace(/\r\n/g, "\n");

  test("motif check reports every planted problem at its place, and nothing else", async () => {
    const r = await runCheck(dest, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])];
    for (const issue of byDetector("check")) {
      const hit = found.find((h) => h.rule === issue.rule && h.file === issue.location.file && h.line === issue.location.line);
      expect(hit ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const h of found) {
      const planted = byDetector("check").some((i) => i.rule === h.rule && i.location.file === h.file && i.location.line === h.line);
      expect(planted ? "planted" : `unplanned ${h.rule} at ${h.file}:${h.line}`).toBe("planted");
    }
    expect(r.data.exceptions).toEqual([]);
  });

  test("motif validate reports the planted readability problem, and nothing else", async () => {
    const r = await runValidate(dest);
    const findings = r.data.findings as { code: string; file: string }[];
    for (const issue of byDetector("validate")) expect(findings.some((f) => f.code === issue.rule && f.file === issue.location.file)).toBe(true);
    expect(findings.filter((f) => !byDetector("validate").some((i) => i.rule === f.code))).toEqual([]);
  });

  test("every pinned line holds its anchor text", () => {
    for (const issue of issues.filter((i) => i.location.file && i.location.line)) {
      expect(typeof issue.anchor === "string" ? "anchored" : `${issue.id} has no anchor`).toBe("anchored");
      const line = at(issue.location.file!).split("\n")[issue.location.line! - 1] ?? "";
      expect(line.includes(issue.anchor!) ? issue.id : `${issue.id}: "${line.trim()}"`).toBe(issue.id);
    }
  });

  test("it has no state scripts, so a review has to write its own", () => {
    expect(list.remove).toEqual(["design/states/sent.js", "design/states/errors.js", "design/states/empty.js"]);
    expect(existsSync(join(dest, "design/states"))).toBe(false);
  });

  test("nothing else is wrong on purpose: the tip closes, sending works, the plane is hidden from screen readers", () => {
    expect(at("app.js")).toContain('$("tip-close").addEventListener("click", () => $("tip").remove());');
    expect(at("app.js")).toContain("  send();");
    const page = at("index.html");
    for (const s of ['aria-label="Dismiss tip"', 'id="plane" aria-hidden="true"', '<legend class="field-label">Stamp</legend>', 'aria-label="Postcard preview"']) expect(page).toContain(s);
  });

  test("the tests README lists both plain fixtures", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/plain-contract-site/", "fixtures/plain-seeded-site/", "assemble.ts plain-seeded-site"]) expect(readme).toContain(s);
  });
});

describe("the plain seeded site in a browser", () => {
  const browser = findBrowser();
  // What the audit shows of each planted problem it finds: the element's selector or its text.
  const SHOWN: Record<string, string> = { "P-09": "Postage paid by Kitepost", "P-10": "#tip-close", "P-11": "#plane" };

  test.skipIf(!browser)("motif shot --audit finds the planted problems, and everything else is a declared knock-on (needs Chrome, Edge or Chromium)", async () => {
    const dest = join(tempDir("motif-plain-seeded-"), "site");
    assemble("plain-seeded-site", dest);
    mkdirSync(join(dest, "design/states"), { recursive: true });
    writeFileSync(join(dest, "design/states/sent.js"), readFileSync(join(FIXTURES, "plain-contract-site/design/states/sent.js")));
    const r = await runShot(dest, { positionals: [], flags: { audit: true, state: ["design/states/sent.js"] } });
    type Found = { category: string; location: { screen: string; selector: string; scheme?: string }; summary: string };
    const findings: Found[] = r.data.findings;
    const shows = (f: Found, id: string) => `${f.location.selector} ${f.summary}`.includes(SHOWN[id]!);
    for (const issue of byDetector("shot")) {
      const seen = findings.some((f) => issue.categories.includes(f.category) && shows(f, issue.id));
      expect(seen ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const f of findings) {
      const planted = byDetector("shot").some((i) => i.categories.includes(f.category) && shows(f, i.id));
      const knockOn = issues.some((i) => (i.consequences ?? []).some((c) => c.category === f.category && c.screens.includes(f.location.screen) && (!f.location.scheme || c.schemes.includes(f.location.scheme))));
      expect(planted || knockOn ? "expected" : `unplanned ${f.category}: ${f.location.selector} ${f.summary}`).toBe("expected");
    }
  }, 180_000);
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/fixtures-plain-seeded.test.ts`
Expected: FAIL — `seeded-issues.json` doesn't exist (ENOENT).

- [ ] **Step 3: The overlay's pages, styles and script**

`tests/fixtures/plain-seeded-site/overlay/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kitepost: send a postcard</title>
  <link rel="stylesheet" href="motif.css">
  <link rel="stylesheet" href="components.css">
  <link rel="stylesheet" href="styles.css">
  <script src="mock-data.js" defer></script>
  <script src="app.js" defer></script>
</head>
<body>
  <header class="top-bar">
    <p class="top-bar-title">Kitepost</p>
  </header>

  <main class="page">
    <section class="composer" id="composer" aria-labelledby="composer-title">
      <h1 class="page-title" id="composer-title">Send a postcard <span class="plane" id="plane" aria-hidden="true">✈️</span></h1>

      <div class="tip" id="tip">
        <p class="tip-text">Tip: short messages feel friendlier.</p>
        <button class="tip-close" id="tip-close" type="button" aria-label="Dismiss tip">×</button>
      </div>

      <form class="composer-form" id="form" novalidate>
        <div class="field">
          <input class="field-input" id="to" name="to" autocomplete="off" placeholder="To">
        </div>
        <div class="field">
          <textarea class="field-input" id="message" name="message" rows="3" maxlength="140" placeholder="Message" aria-describedby="message-hint"></textarea>
          <p class="field-hint" id="message-hint" style="color: #9A9A9A"><span id="message-count">0</span> of 140 characters</p>
        </div>
        <div class="field">
          <input class="field-input" id="from" name="from" autocomplete="name" placeholder="From">
        </div>
        <fieldset class="choice-group">
          <legend class="field-label">Stamp</legend>
          <label class="choice"><input class="choice-input" type="radio" name="stamp" value="kite" checked><span class="choice-swatch" data-stamp="kite"></span>Kite</label>
          <label class="choice"><input class="choice-input" type="radio" name="stamp" value="cloud"><span class="choice-swatch" data-stamp="cloud"></span>Cloud</label>
          <label class="choice"><input class="choice-input" type="radio" name="stamp" value="ink"><span class="choice-swatch" data-stamp="ink"></span>Ink</label>
        </fieldset>
        <button class="button" type="submit">Submit</button>
      </form>
    </section>

    <section class="sent" id="sent" tabindex="-1" aria-labelledby="sent-title" hidden>
      <h1 class="page-title" id="sent-title">Your postcard is on its way</h1>
      <p class="sent-text">We'll post it to <span id="sent-to"></span> tomorrow morning. Your tracking code is <strong id="sent-code"></strong>.</p>
    </section>

    <section class="recent" aria-labelledby="recent-title">
      <h2 class="section-title" id="recent-title">Recently sent</h2>
      <ul class="list" id="recent"></ul>
      <div class="empty-state" id="recent-empty" hidden>
        <p class="empty-state-title">No postcards yet</p>
        <p class="empty-state-text">The postcards you send will be listed here.</p>
      </div>
    </section>

    <figure class="postcard" id="preview" data-stamp="kite" aria-label="Postcard preview">
      <span class="postcard-stamp" aria-hidden="true"></span>
      <p class="postcard-message" id="preview-message">Your message appears here as you write it.</p>
      <p class="postcard-line">To <span id="preview-to">someone special</span></p>
      <p class="postcard-line">From <span id="preview-from">you</span></p>
      <p class="postcard-small">Postage paid by Kitepost</p>
    </figure>
  </main>
</body>
</html>
```

`tests/fixtures/plain-seeded-site/overlay/styles.css`:
```css
/* Kitepost's page: the theme's font, its own names for a few roles, and the layout. */

@font-face {
  font-family: "Nunito";
  font-style: normal;
  font-display: swap;
  font-weight: 200 1000;
  src: url("fonts/nunito.woff2") format("woff2");
}

/* The postcard's own names, each defined from a role, so dark mode and the design guide apply. */
:root {
  --paper: #FFF8EC;
  --ink: var(--motif-color-text-primary);
  --ink-soft: var(--motif-color-text-secondary);
}
[data-stamp="kite"] { --stamp: var(--motif-color-action-primary); }
[data-stamp="cloud"] { --stamp: var(--motif-color-action-secondary); }
[data-stamp="ink"] { --stamp: var(--motif-color-text-primary); }

body {
  margin: 0;
  background: var(--motif-color-background);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
  line-height: var(--motif-font-body-line-height);
}

.page { display: grid; gap: var(--motif-space-10); max-width: 40rem; margin-inline: auto; padding: var(--motif-space-6) var(--motif-space-4) var(--motif-space-12); }
.page-title { margin: 0; font-family: var(--motif-font-title-family); font-size: var(--motif-font-title-size); font-weight: var(--motif-font-title-weight); line-height: var(--motif-font-title-line-height); }
.section-title { margin: 0 0 var(--motif-space-4); font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); font-weight: var(--motif-font-heading-weight); line-height: var(--motif-font-heading-line-height); }

/* The preview sits right above the fields that change it, so both stay in view while writing. */
.composer { display: grid; gap: var(--motif-space-5); }
.composer-form { display: grid; gap: 18px; }

.postcard {
  position: relative;
  display: grid;
  gap: var(--motif-space-2);
  margin: 0;
  padding: var(--motif-space-5);
  padding-inline-end: var(--motif-space-16);
  border-radius: var(--motif-radius-lg);
  background: var(--paper);
  border: 2px dashed #D9C7B8;
  box-shadow: var(--motif-shadow-md);
  color: var(--ink);
}
.postcard-stamp { position: absolute; inset-block-start: var(--motif-space-4); inset-inline-end: var(--motif-space-4); width: 2.5rem; height: 3rem; border-radius: var(--motif-radius-sm); background: var(--stamp); }
.postcard-message { margin: 0; min-height: 3rem; font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); line-height: var(--motif-font-heading-line-height); overflow-wrap: anywhere; }
.postcard-line { margin: 0; color: var(--ink-soft); font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); line-height: var(--motif-font-caption-line-height); }

.postcard-small { margin: 0; opacity: 0.4; font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); line-height: var(--motif-font-caption-line-height); }

.tip { display: flex; align-items: center; justify-content: space-between; gap: var(--motif-space-3); padding: var(--motif-space-3) var(--motif-space-4); border-radius: var(--motif-radius-md); background: var(--motif-color-surface); }
.tip-text { margin: 0; font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); line-height: var(--motif-font-caption-line-height); }
.tip-close { display: grid; place-items: center; width: 1.25rem; height: 1.25rem; padding: 0; border: 0; border-radius: var(--motif-radius-full); background: var(--motif-color-action-secondary); color: var(--motif-color-on-action-secondary); cursor: pointer; }
.tip-close:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.plane { display: inline-block; }

.sent { display: grid; gap: var(--motif-space-5); justify-items: start; animation: rise var(--motif-duration-slow) var(--motif-easing-enter); }
.sent:focus { outline: none; }
.sent-text { margin: 0; color: var(--motif-color-text-secondary); }

@keyframes rise {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: none; }
}

[hidden] { display: none !important; }
```

`tests/fixtures/plain-seeded-site/overlay/components.css` (Kitepost's, with line 20's transition and line 118's font typed in):
```css
/* Kitepost's components. Each starts with a "Component:" line; DESIGN.md section 5 lists the same set. */

/* Component: Button — actions: primary (default), secondary */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--motif-space-2);
  min-height: 3rem;
  padding-inline: var(--motif-space-5);
  border: 0;
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-action-primary);
  color: var(--motif-color-on-action-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-label-line-height);
  cursor: pointer;
  transition: transform 250ms ease-in-out;
}
.button:active:not(:disabled) { transform: scale(0.97); }
.button:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.button:disabled { cursor: not-allowed; opacity: 0.5; }
.button[aria-busy="true"] { cursor: progress; }
.button-secondary { background: var(--motif-color-action-secondary); color: var(--motif-color-on-action-secondary); }

/* Component: Field — a labelled input or textarea, with a hint and an error */
.field { display: grid; gap: var(--motif-space-2); }
.field-label {
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-label-line-height);
  color: var(--motif-color-text-primary);
}
.field-input {
  min-height: 3rem;
  padding: var(--motif-space-3) var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-md);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-body-family);
  font-size: var(--motif-font-body-size);
  line-height: var(--motif-font-body-line-height);
}
.field-input:focus-visible { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.field-input[aria-invalid="true"] { border-color: var(--motif-color-danger); }
.field-input:disabled { opacity: 0.5; }
.field-hint, .field-error {
  margin: 0;
  font-family: var(--motif-font-caption-family);
  font-size: var(--motif-font-caption-size);
  line-height: var(--motif-font-caption-line-height);
}
.field-hint { color: var(--motif-color-text-secondary); }
.field-error { color: var(--motif-color-danger); }

/* Component: Choice — one option in a group of radio buttons, with a swatch */
.choice-group { display: flex; flex-wrap: wrap; gap: var(--motif-space-3); margin: 0; padding: 0; border: 0; }
.choice-group > legend { margin-block-end: var(--motif-space-2); padding: 0; }
.choice {
  display: inline-flex;
  align-items: center;
  gap: var(--motif-space-2);
  min-height: 3rem;
  padding-inline: var(--motif-space-4);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-full);
  background: var(--motif-color-surface);
  color: var(--motif-color-text-primary);
  font-family: var(--motif-font-label-family);
  font-size: var(--motif-font-label-size);
  cursor: pointer;
}
.choice:has(.choice-input:checked) { border-color: var(--motif-color-action-primary); background: var(--motif-color-surface-raised); }
.choice:has(.choice-input:focus-visible) { outline: 2px solid var(--motif-color-focus); outline-offset: 2px; }
.choice-input { position: absolute; opacity: 0; pointer-events: none; }
.choice-swatch { width: 1.25rem; height: 1.25rem; border-radius: var(--motif-radius-full); background: var(--stamp); }

/* Component: Card — a group of related content */
.card {
  padding: var(--motif-space-5);
  border: 1px solid var(--motif-color-border);
  border-radius: var(--motif-radius-lg);
  background: var(--motif-color-surface);
}

/* Component: ListItem — a row in a list */
.list { margin: 0; padding: 0; list-style: none; border: 1px solid var(--motif-color-border); border-radius: var(--motif-radius-lg); background: var(--motif-color-surface); }
.list-item { display: flex; align-items: center; justify-content: space-between; gap: var(--motif-space-4); padding: var(--motif-space-4) var(--motif-space-5); }
.list-item + .list-item { border-block-start: 1px solid var(--motif-color-border); }
.list-item-title { margin: 0; color: var(--motif-color-text-primary); font-family: var(--motif-font-body-family); font-size: var(--motif-font-body-size); line-height: var(--motif-font-body-line-height); }
.list-item-meta { margin: 0; color: var(--motif-color-text-secondary); font-family: var(--motif-font-caption-family); font-size: var(--motif-font-caption-size); line-height: var(--motif-font-caption-line-height); }

/* Component: Badge — a status in words, on its status colour */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--motif-space-1) var(--motif-space-3);
  border-radius: var(--motif-radius-full);
  font-family: var(--motif-font-caption-family);
  font-size: var(--motif-font-caption-size);
  font-weight: var(--motif-font-label-weight);
  line-height: var(--motif-font-caption-line-height);
}
.badge-success { background: var(--motif-color-success); color: var(--motif-color-on-success); }
.badge-info { background: var(--motif-color-info); color: var(--motif-color-on-info); }

/* Component: EmptyState — nothing here yet: a title and one line */
.empty-state { padding: var(--motif-space-8) var(--motif-space-5); border: 1px dashed var(--motif-color-border); border-radius: var(--motif-radius-lg); text-align: center; }
.empty-state-title { margin: 0 0 var(--motif-space-2); color: var(--motif-color-text-primary); font-family: var(--motif-font-heading-family); font-size: var(--motif-font-heading-size); font-weight: var(--motif-font-heading-weight); line-height: var(--motif-font-heading-line-height); }
.empty-state-text { margin: 0; color: var(--motif-color-text-secondary); font-family: var(--motif-font-body-family); font-size: var(--motif-font-body-size); line-height: var(--motif-font-body-line-height); }

/* Component: TopBar — the site's name at the top of every page */
.top-bar { display: flex; align-items: center; min-height: 3.5rem; padding-inline: var(--motif-space-4); border-block-end: 1px solid var(--motif-color-border); background: var(--motif-color-surface); }
.top-bar-title { margin: 0; color: var(--motif-color-text-primary); font-family: "Trebuchet MS", sans-serif; font-size: var(--motif-font-heading-size); font-weight: var(--motif-font-heading-weight); line-height: var(--motif-font-heading-line-height); }
```

`tests/fixtures/plain-seeded-site/overlay/app.js`:
```js
// Kitepost: the live preview, the sent state and the recent list. Mock data only; nothing is sent.
const $ = (id) => document.getElementById(id);
const form = $("form");
const STATUS = { delivered: ["Delivered", "badge-success"], "on-its-way": ["On its way", "badge-info"] };
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

const value = (name) => form.elements[name].value.trim();

function updatePreview() {
  $("preview-message").textContent = value("message") || "Your message appears here as you write it.";
  $("preview-to").textContent = value("to") || "someone special";
  $("preview-from").textContent = value("from") || "you";
  $("preview").dataset.stamp = form.elements.stamp.value;
  $("message-count").textContent = String(form.elements.message.value.length);
}

function send() {
  $("sent-to").textContent = value("to");
  $("sent-code").textContent = window.MOCK.nextCode;
  $("composer").hidden = true;
  $("sent").hidden = false;
  $("sent").focus();
}

function renderRecent(items) {
  const list = $("recent");
  list.replaceChildren(...items.map((item) => {
    const [label, tone] = STATUS[item.status];
    const row = document.createElement("li");
    row.className = "list-item";
    const text = document.createElement("div");
    text.append(
      Object.assign(document.createElement("p"), { className: "list-item-title", textContent: item.to }),
      Object.assign(document.createElement("p"), { className: "list-item-meta", textContent: `Sent ${dateFormat.format(new Date(item.sent))}` }),
    );
    row.append(text, Object.assign(document.createElement("span"), { className: `badge ${tone}`, textContent: label }));
    return row;
  }));
  list.hidden = items.length === 0;
  $("recent-empty").hidden = items.length > 0;
}

form.addEventListener("input", updatePreview);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  send();
});
$("tip-close").addEventListener("click", () => $("tip").remove());

// A little plane drifts beside the title, at the theme's slow pace.
const slow = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motif-duration-slow"));
$("plane").animate([{ transform: "translateY(0)" }, { transform: "translateY(-0.5rem)" }], { duration: slow * 2, iterations: Infinity, direction: "alternate" });

// For state scripts (design/states/): the recent list can be shown with other data.
window.kitepost = { renderRecent };
renderRecent(window.MOCK.recent);
updatePreview();
```

- [ ] **Step 4: The faint text colour and the edited theme code**

Run from the repository root (bash):
```bash
mkdir -p tests/fixtures/plain-seeded-site/overlay/design
bun -e 'const p = "tests/fixtures/plain-contract-site/design/tokens.json"; const d = JSON.parse(await Bun.file(p).text()); d.primitive.color["light-text-secondary"].$value = { colorSpace: "srgb", components: [0.698, 0.6549, 0.6235], hex: "#B2A79F" }; await Bun.write("tests/fixtures/plain-seeded-site/overlay/design/tokens.json", JSON.stringify(d, null, 2) + "\n");'
tmp=$(mktemp -d)
mkdir -p "$tmp/design"
cp tests/fixtures/plain-seeded-site/overlay/design/tokens.json "$tmp/design/tokens.json"
echo '<!doctype html><link rel="stylesheet" href="motif.css">' > "$tmp/index.html"
bun cli/src/main.ts tokens --cwd "$tmp"
sed 's/  --motif-radius-md: 16px;/  --motif-radius-md: 12px;/' "$tmp/motif.css" > tests/fixtures/plain-seeded-site/overlay/motif.css
rm -rf "$tmp"
grep -n "text-secondary: #B2A79F\|radius-md: 12px" tests/fixtures/plain-seeded-site/overlay/motif.css
```
Expected: the last command prints two lines: `11:  --motif-color-text-secondary: #B2A79F;` and `39:  --motif-radius-md: 12px;`.

- [ ] **Step 5: The list of planted problems**

`tests/fixtures/plain-seeded-site/seeded-issues.json`:
```json
{
  "motifSeeded": 1,
  "remove": ["design/states/sent.js", "design/states/errors.js", "design/states/empty.js"],
  "issues": [
    { "id": "P-01", "kind": "exact", "detectedBy": "check", "rule": "raw-color", "categories": ["raw-value"], "severity": "major", "location": { "file": "styles.css", "line": 47 }, "anchor": "#D9C7B8", "summary": "The postcard's dashed border is a typed colour, so it ignores the theme and dark mode." },
    { "id": "P-02", "kind": "exact", "detectedBy": "check", "rule": "raw-color", "categories": ["raw-value"], "severity": "major", "location": { "file": "styles.css", "line": 13 }, "anchor": "--paper: #FFF8EC", "summary": "The site's own --paper variable is set to a typed colour instead of a role, so the postcard stays light in dark mode.", "consequences": [{ "category": "contrast", "screens": ["/"], "schemes": ["dark"], "note": "The postcard keeps its light paper in dark mode, under the dark theme's light text: its message and its To and From lines fail." }] },
    { "id": "P-03", "kind": "exact", "detectedBy": "check", "rule": "raw-color", "categories": ["raw-value"], "severity": "major", "location": { "file": "index.html", "line": 33 }, "anchor": "style=\"color: #9A9A9A\"", "summary": "The character count is coloured with a style attribute holding a typed grey instead of text-secondary.", "consequences": [{ "category": "contrast", "screens": ["/"], "schemes": ["light"], "note": "The typed grey falls well short of 4.5:1 on the light page." }] },
    { "id": "P-04", "kind": "exact", "detectedBy": "check", "rule": "off-scale", "categories": ["spacing"], "severity": "minor", "location": { "file": "styles.css", "line": 36 }, "anchor": "gap: 18px", "summary": "The form's gap (18px) isn't on the spacing scale." },
    { "id": "P-05", "kind": "exact", "detectedBy": "check", "rule": "raw-font", "categories": ["typography"], "severity": "major", "location": { "file": "components.css", "line": 118 }, "anchor": "Trebuchet MS", "summary": "The top bar's title hard-codes Trebuchet MS instead of the heading font role." },
    { "id": "P-06", "kind": "exact", "detectedBy": "check", "rule": "raw-motion", "categories": ["motion", "raw-value"], "severity": "minor", "location": { "file": "components.css", "line": 20 }, "anchor": "250ms ease-in-out", "summary": "The button's press transition has a typed duration and easing instead of the motion roles." },
    { "id": "P-07", "kind": "exact", "detectedBy": "check", "rule": "generated-edited", "categories": ["consistency"], "severity": "minor", "location": { "file": "motif.css", "line": 1 }, "anchor": "Generated by Motif", "summary": "The generated theme CSS was edited by hand (radius.md changed), so it no longer matches the design guide." },
    { "id": "P-08", "kind": "exact", "detectedBy": "validate", "rule": "low-contrast", "categories": ["contrast"], "severity": "critical", "location": { "file": "design/tokens.json" }, "summary": "The light text-secondary colour is too faint on the light surfaces (about 2.2:1; it needs 4.5:1).", "consequences": [{ "category": "contrast", "screens": ["/"], "schemes": ["light"], "note": "Every text-secondary text in light mode fails as rendered: the recent list's dates, the postcard's To and From lines, the sent message." }] },
    { "id": "P-09", "kind": "exact", "detectedBy": "shot", "categories": ["contrast"], "severity": "critical", "location": { "file": "index.html", "line": 67, "screen": "/" }, "anchor": "postcard-small", "summary": "The postcard's small print is primary text faded to 40% opacity, so it's unreadable in light and dark mode." },
    { "id": "P-10", "kind": "exact", "detectedBy": "shot", "categories": ["target-size"], "severity": "minor", "location": { "file": "index.html", "line": 24, "screen": "/" }, "anchor": "tip-close", "summary": "The tip's dismiss button is 20×20 px; phones need 44×44 px (it passes the 24 px minimum only because nothing sits next to it)." },
    { "id": "P-11", "kind": "exact", "detectedBy": "shot", "categories": ["reduced-motion", "motion"], "severity": "major", "location": { "file": "app.js", "line": 52, "screen": "/" }, "anchor": "$(\"plane\").animate", "summary": "The plane beside the title drifts forever from a script that ignores reduced motion, so it keeps moving for people who ask for less." },
    { "id": "P-12", "kind": "judgement", "detectedBy": "review", "categories": ["hierarchy", "spacing", "other"], "severity": "major", "location": { "file": "index.html", "screen": "/" }, "summary": "The postcard preview sits at the bottom of the page, below the recent list, so it's off screen while you write: you can't see what the fields change." },
    { "id": "P-13", "kind": "judgement", "detectedBy": "review", "categories": ["copy"], "severity": "major", "location": { "file": "index.html", "line": 44, "screen": "/" }, "anchor": ">Submit<", "summary": "The send button says \"Submit\" instead of what it does (Send postcard)." },
    { "id": "P-14", "kind": "judgement", "detectedBy": "review", "categories": ["missing-state"], "severity": "major", "location": { "file": "app.js", "screen": "/" }, "summary": "The form sends an empty postcard: nothing checks the fields, so the confirmation says it will be posted to nobody." },
    { "id": "P-15", "kind": "judgement", "detectedBy": "review", "categories": ["platform-convention", "anti-pattern"], "severity": "major", "location": { "file": "index.html", "screen": "/" }, "summary": "The To, Message and From fields have placeholders instead of labels, so the label disappears as soon as someone types and screen readers get no name." },
    { "id": "P-16", "kind": "judgement", "detectedBy": "review", "categories": ["anti-pattern", "copy"], "severity": "minor", "location": { "file": "index.html", "line": 20, "screen": "/" }, "anchor": "class=\"plane\"", "summary": "An emoji is used as decoration in the page title instead of the site's own style." },
    { "id": "P-17", "kind": "judgement", "detectedBy": "review", "categories": ["navigation", "missing-state"], "severity": "major", "location": { "file": "index.html", "screen": "/" }, "summary": "After sending, the page has no way to write another postcard: the form is gone until the page is reloaded." }
  ]
}
```

- [ ] **Step 6: The README, and the tests README**

`tests/fixtures/plain-seeded-site/README.md`:
````markdown
# The plain seeded site

Kitepost (the plain contract site) with 17 planted problems, for test C's `c-plain`: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

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
| P-09 | exact (shot) | The postcard's small print (primary text) faded to unreadable | `/`, `index.html:67` |
| P-10 | exact (shot) | 20×20 px dismiss button on the tip | `/`, `index.html:24` |
| P-11 | exact (shot) | A scripted plane keeps drifting under reduced motion | `/`, `app.js:52` |
| P-12 | judgement | The preview sits below the recent list, off screen while you write | `/` |
| P-13 | judgement | The send button says "Submit" | `/`, `index.html:44` |
| P-14 | judgement | Nothing checks the form: an empty postcard can be sent | `/`, `app.js` |
| P-15 | judgement | Placeholders instead of labels | `/`, `index.html` |
| P-16 | judgement | An emoji as decoration in the title | `/`, `index.html:20` |
| P-17 | judgement | No way to write another postcard after sending | `/` (after sending) |

## How a grader reads the list

The same rules as [the React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list):

- `location` with `file` and `line`: a finding must point there (each such problem has an `anchor`, text that is on that line). `file` alone: anywhere in that file. `screen`: that page. `file` and `screen` together: either one, except that for an exact problem a finding naming only the screen counts once the model grader confirms it describes this problem.
- The site has one page, so most problems share the screen `/`. `/index.html` and a full address such as `http://127.0.0.1:5555/index.html` are the same screen, and a finding's `state` (such as `sent`) doesn't change it.
- `categories`: the review categories that count as finding the problem; the first is the expected one.
- `consequences`: findings a correct review will also report because of this problem (for example every text-secondary text failing contrast in light mode once P-08 makes the colour too faint). A grader counts a finding that matches a consequence's category, screen and scheme as correct, not as a false finding.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-plain-seeded.test.ts` checks, on every change, that every problem `motif check` and `motif validate` can see is exactly where the list says and that they report nothing unplanned; where a browser is found, it also runs `motif shot --audit` with a sent-state script and checks that P-09, P-10 and P-11 are reported and that everything else it reports is one of the declared consequences: contrast on `/` in light mode (P-03, P-08) and in dark mode (P-02).
````

In `tests/README.md`, after the `fixtures/react-seeded-app/` bullet, add:
```markdown
- **`fixtures/plain-contract-site/`** — Kitepost, a one-page postcard tool in plain HTML, CSS and JavaScript (no framework, no build): a design guide from the Soft starting style, its own variables defined from roles, the plain web guide's components it uses, and three state scripts (`design/states/`) for the screens behind its form. CI checks it with `motif validate`, `motif check` and, where a browser is found, `motif shot --audit` in every state (`cli/test/fixtures-plain-contract.test.ts`). Test B's `b-plain` adds a page to a copy.
- **`fixtures/plain-seeded-site/`** — the same site with 17 planted problems, listed in its `seeded-issues.json`, and without the state scripts (a review writes its own). Test C's `c-plain` reviews a copy. Its [README](fixtures/plain-seeded-site/README.md) describes every problem.
```
and in the `assemble.ts` bullet's code block, add:
```bash
bun tests/fixtures/assemble.ts plain-contract-site <empty folder>
bun tests/fixtures/assemble.ts plain-seeded-site <empty folder>
```
and change the sentence after the block to:
```markdown
Then run `npm install` in a React app's folder to build or run it; a plain site needs nothing installed.
```

- [ ] **Step 7: The compiled tool on both plain fixtures (spec §13)**

In `cli/test/plain-web-e2e.test.ts`, add `import { assemble } from "../../tests/fixtures/assemble";` to the imports, and add these two tests inside `describe("the compiled tool on a plain web site")`, after its existing tests (they use its `run` helper, the binary its `beforeAll` builds, and its `browser`):
```ts
  test("on the plain fixtures: doctor, tokens and check on Kitepost; check and extract on the seeded site", () => {
    const site = join(tempDir("motif-fixture-"), "site");
    assemble("plain-contract-site", site);
    expect(run(site, ["doctor"]).json.items.find((i: any) => i.id === "app:.")).toMatchObject({ status: "ok", detail: expect.stringContaining("this folder") });
    const tokens = run(site, ["tokens"]);
    expect(tokens.code).toBe(0);
    expect(tokens.json.files.filter((f: any) => f.status !== "unchanged")).toEqual([]);
    expect(run(site, ["check"]).code).toBe(0);
    const seeded = join(tempDir("motif-fixture-"), "site");
    assemble("plain-seeded-site", seeded);
    expect(run(seeded, ["check"]).json.summary).toMatchObject({ violations: 7, warnings: 1 });
    expect(run(seeded, ["extract"]).code).toBe(0);
    const report = JSON.parse(readFileSync(join(seeded, "design/extract-report.json"), "utf8"));
    expect(report.variables).toContainEqual({ name: "--paper", light: "#FFF8EC" });
  });

  test.skipIf(!browser)("shot --audit with Kitepost's state scripts finds nothing (needs Chrome, Edge or Chromium)", () => {
    const site = join(tempDir("motif-fixture-"), "site");
    assemble("plain-contract-site", site);
    const shot = run(site, ["shot", "--audit", "--state", "design/states/sent.js", "--state", "design/states/errors.js", "--state", "design/states/empty.js"]);
    expect(shot.json.states).toEqual(["sent", "errors", "empty"]);
    expect(shot.json.findings).toEqual([]);
    expect(shot.code).toBe(0);
  });
```

- [ ] **Step 8: Run the tests to see them pass**

Run (from `cli/`): `bun test test/fixtures-plain-seeded.test.ts test/fixtures-plain-contract.test.ts test/fixtures-seeded.test.ts && bun test test/plain-web-e2e.test.ts --timeout 300000`
Expected: PASS. Where a browser is found, the audit reports P-09, P-10 and P-11, and its other findings are the contrast knock-ons of P-02 (dark), P-03 and P-08 (light) on `/`; the compiled tool's audit of Kitepost finds nothing.

- [ ] **Step 9: Commit**

```bash
git add tests/fixtures/plain-seeded-site tests/README.md cli/test/fixtures-plain-seeded.test.ts cli/test/plain-web-e2e.test.ts
git commit -m "test(fixtures): the plain seeded site, Kitepost with 17 planted problems" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Eval cases b-plain and c-plain

**Files:**
- Modify: `tests/evals/cases.ts`, `tests/evals/workspace.ts`, `tests/evals/collect.ts`, `tests/evals/grade.ts`, `tests/evals/match.ts`, `tests/evals/run.ts`, `tests/evals/preflight.ts`, `tests/evals/README.md`
- Test: `cli/test/evals-cases.test.ts`, `evals-workspace.test.ts`, `evals-collect.test.ts`, `evals-grade.test.ts`, `evals-match.test.ts`, `evals-run.test.ts`

**Interfaces:**
- Consumes: `FixtureName`, `assemble` (Task 4); the plain fixtures (Tasks 4, 5); `detectApps`, `siteDir` (`cli/src/detect/stacks.ts`); `discoverPlainRoutes` (`cli/src/stacks/plain-web/routes.ts`).
- Produces:
  - `EvalCase.fixture?: FixtureName`; `isPlain(c: EvalCase): boolean`; `needsBrowser(c: EvalCase): boolean` (`tests/evals/cases.ts`).
  - Cases `b-plain` (B, `plain-contract-site`, route `/history.html`) and `c-plain` (C, `plain-seeded-site`, route `/`).
  - `addedComponents(diff: string): string[]` (`tests/evals/collect.ts`).
  - `BFacts.build?` and `BFacts.typecheck?` (React), `BFacts.render?: ScreenFacts | { error: string }` (plain); criterion id `renders`.

- [ ] **Step 1: Write the failing tests**

In `cli/test/evals-cases.test.ts`, replace the first two tests of `describe("the eval cases (spec §13.2)")` with:
```ts
  test("six features for B, two reviews for C and three new apps for D", () => {
    expect(CASES.filter((c) => c.test === "B").map((c) => c.id)).toEqual(["b-settings", "b-search", "b-profile", "b-notifications", "b-checkout", "b-plain"]);
    expect(CASES.filter((c) => c.test === "C").map((c) => c.id)).toEqual(["c-review", "c-plain"]);
    expect(CASES.filter((c) => c.test === "D").map((c) => c.id)).toEqual(["d-stride", "d-ledgerly", "d-bloom"]);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  test("B adds a page to a contract fixture; C reviews a seeded one; D starts from a brief that exists", () => {
    for (const c of CASES.filter((x) => x.test === "B")) {
      expect(["react-contract-app", "plain-contract-site"]).toContain(c.fixture!);
      expect(c.routes).toHaveLength(1);
      expect(c.prompt).toContain(` ${c.routes[0]}:`);
    }
    expect(CASES.find((c) => c.id === "b-plain")!).toMatchObject({ fixture: "plain-contract-site", routes: ["/history.html"] });
    expect(CASES.find((c) => c.id === "c-review")!.fixture).toBe("react-seeded-app");
    expect(CASES.find((c) => c.id === "c-plain")!).toMatchObject({ fixture: "plain-seeded-site", routes: ["/"] });
    for (const c of CASES.filter((x) => x.test === "D")) {
      expect(existsSync(join(REPO, "tests/fixtures/briefs", `${c.brief}.md`))).toBe(true);
      expect(c.routes).toEqual(["/", "/sign-in", "/home"]);
      for (const r of ["/sign-in", "/home"]) expect(c.prompt).toContain(r);
    }
  });

  test("plain cases install nothing; every case but B on Larder needs a browser", () => {
    expect(CASES.filter(isPlain).map((c) => c.id)).toEqual(["b-plain", "c-plain"]);
    expect(CASES.filter((c) => !needsBrowser(c)).map((c) => c.id)).toEqual(["b-settings", "b-search", "b-profile", "b-notifications", "b-checkout"]);
  });
```
change the import to `import { CASES, isPlain, needsBrowser, selectCases, UNATTENDED, type EvalCase } from "../../tests/evals/cases";`, and in the test "the review is report-only and names the screens" add:
```ts
    const plain = CASES.find((c) => c.id === "c-plain")!.prompt;
    expect(plain).toContain("don't change the site's code");
    expect(plain).toContain("after a postcard is sent");
```

In `cli/test/evals-workspace.test.ts`, add inside `describe("a case's folder")`:
```ts
  test("a plain site: a fresh copy with its state scripts, nothing installed, its starting state recorded", async () => {
    const before = npmCalls.length;
    const ws = await prepareWorkspace(byId("b-plain"), join(tempDir("motif-ws-"), "b-plain"), run);
    expect(existsSync(join(ws.app, "index.html"))).toBe(true);
    expect(existsSync(join(ws.app, "design/states/sent.js"))).toBe(true);
    expect(npmCalls.length).toBe(before);
    expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
    const seeded = await prepareWorkspace(byId("c-plain"), join(tempDir("motif-ws-"), "c-plain"), run);
    expect(existsSync(join(seeded.app, "design/states"))).toBe(false);
  });
```

In `cli/test/evals-grade.test.ts`, add:
```ts
describe("test B on a plain site", () => {
  const okPlain: BFacts = {
    route: "/history.html", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
    render: { route: "/history.html", status: 200, pageErrors: 0 }, newComponents: [], recorded: [],
  };
  test("passes when the page loads with no page errors; there's nothing to build", () => {
    const g = gradeB(okPlain);
    expect(g.pass).toBe(true);
    expect(g.criteria.map((c) => c.id)).toEqual(["feature", "check", "exceptions", "validate", "renders", "components"]);
  });
  test("fails when the page has errors, isn't served, or couldn't be captured", () => {
    expect(failing(gradeB({ ...okPlain, render: { route: "/history.html", status: 200, pageErrors: 1 } }))).toEqual(["renders"]);
    expect(failing(gradeB({ ...okPlain, render: { route: "/history.html", status: 404, pageErrors: 0 } }))).toEqual(["renders"]);
    expect(failing(gradeB({ ...okPlain, render: { error: "No Chrome or Edge found." } }))).toEqual(["renders"]);
  });
});
```

In `cli/test/evals-match.test.ts`, add (importing `normScreen`, `sameScreen` from `../../tests/evals/match` if not already imported):
```ts
describe("a plain site's screens", () => {
  test("a folder's index page is the folder", () => {
    for (const s of ["/index.html", "index.html", "/INDEX.HTM", "http://127.0.0.1:5555/index.html?x=1", "/"]) expect(normScreen(s)).toBe("/");
    expect(normScreen("/blog/index.html")).toBe("/blog");
    expect(normScreen("/about.html")).toBe("/about.html");
    expect(sameScreen("/index.html", "/")).toBe(true);
  });
});
```

In `cli/test/evals-collect.test.ts`, add `addedComponents` to the import from `../../tests/evals/collect`, and add:
```ts
describe("test B on a plain site", () => {
  test("new components are new Component: lines; an edited one isn't new", () => {
    const diff = [
      "diff --git a/components.css b/components.css",
      "--- a/components.css",
      "+++ b/components.css",
      "-/* Component: Button — actions: primary (default), secondary */",
      "+/* Component: Button — actions: primary (default), secondary, ghost */",
      "+/* Component: MonthGroup — a month's heading and its rows */",
      "+/* Component: Stat — a number with a label */",
    ].join("\n");
    expect(addedComponents(diff)).toEqual(["MonthGroup", "Stat"]);
  });

  test("the page, the page loading in a browser, new components (and which the guide records), check and validate; nothing built", async () => {
    const ws = await prepareWorkspace(byId("b-plain"), join(tempDir("motif-col-"), "bp"), run);
    const before = commands.length;
    writeFileSync(join(ws.app, "history.html"), "<!doctype html><title>History</title>\n");
    writeFileSync(join(ws.app, "components.css"), `${readFileSync(join(ws.app, "components.css"), "utf8")}\n/* Component: MonthGroup — a month's heading and its rows */\n.month-group { display: grid; }\n`);
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-15 — Added MonthGroup for the history page — approved by the eval\n`);
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/history.html", status: 200, shots: [] }] };
    try {
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-plain"), ws, { run, motif, judge: noJudge }, out);
      expect(f).toMatchObject({ route: "/history.html", pageExists: true, render: { route: "/history.html", status: 200, pageErrors: 0 }, newComponents: ["MonthGroup"], recorded: ["MonthGroup"] });
      expect(f.build).toBeUndefined();
      expect(commands.slice(before).some((c) => c.includes("build") || c.includes("tsc") || c[0] === "npm")).toBe(false);
      expect(existsSync(join(out, "shot.json"))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });
});

describe("test C on the plain seeded site", () => {
  test("is graded against the site's own list", async () => {
    const seededSite: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/plain-seeded-site/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-plain"), join(tempDir("motif-col-"), "cp"), run);
    const p01 = seededSite.find((i) => i.id === "P-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-15-whole-site.json"), JSON.stringify({ motifReview: 1, scope: "whole site", date: "2026-10-15", findings: [
      { id: "F-001", severity: "major", category: "raw-value", source: "exact", location: p01.location, summary: p01.summary, fix: "Use the border role." },
    ] }));
    const f = await collectC(byId("c-plain"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["P-01"]);
    expect(f.exact.missed).toHaveLength(seededSite.filter((i) => i.kind === "exact").length - 1);
    expect(f.judgement.missed).toHaveLength(seededSite.filter((i) => i.kind === "judgement").length);
  });
});
```

In `cli/test/evals-run.test.ts`, add inside `describe("the eval runner")`:
```ts
  test("a browser is required only when a chosen case needs one", async () => {
    for (const [id, needs] of [["b-search", false], ["b-plain", true], ["c-plain", true]] as const) {
      const seen: boolean[] = [];
      const h = harness({
        preflight: async (n) => {
          seen.push(n);
          return { claude: "claude-exe", claudeVersion: "2.1.289 (Claude Code)", browser: true };
        },
      });
      await runEvals(["--cases", id], h.deps, h.where);
      expect(seen).toEqual([needs]);
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run (from `cli/`): `bun test test/evals-cases.test.ts test/evals-workspace.test.ts test/evals-grade.test.ts test/evals-match.test.ts test/evals-collect.test.ts test/evals-run.test.ts`
Expected: FAIL — `isPlain` and `addedComponents` aren't exported, and there's no case `b-plain`.

- [ ] **Step 3: The cases (`tests/evals/cases.ts`)**

Add `import type { FixtureName } from "../fixtures/assemble";` at the top, change the first comment line to `// The eval cases (spec §13.2 and the plain web spec §11): test B's features on copies of the contract app and site, test C's reviews of the seeded app and site,`, change `fixture?: "react-contract-app" | "react-seeded-app";` to `fixture?: FixtureName;` (its comment becomes `/** B and C: the fixture copied for the session. */`), and add after `UNATTENDED`:
```ts
/** A case on a plain web site: nothing to install or build. */
export const isPlain = (c: EvalCase): boolean => c.fixture?.startsWith("plain-") ?? false;

/** Whether grading needs a browser: C and D always, and B on a plain site, whose new page is checked in one. */
export const needsBrowser = (c: EvalCase): boolean => c.test !== "B" || isPlain(c);
```
In `CASES`, after the `b-checkout` feature, add:
```ts
  {
    id: "b-plain", test: "B", title: "History page on a plain site", fixture: "plain-contract-site", routes: ["/history.html"],
    prompt: `/motif:feature Add a history page at /history.html: every postcard sent so far, newest first and grouped by month, each with who it went to, the day it was sent and its status, plus an empty state for before the first postcard. Link to it from the main page.\n\n${UNATTENDED}`,
    maxTurns: 200, maxBudgetUsd: 40, minutes: 90,
  },
```
and after the `c-review` case, add:
```ts
  {
    id: "c-plain", test: "C", title: "Review of the seeded plain site", fixture: "plain-seeded-site", routes: ["/"],
    prompt: `/motif:review Review the whole site: it's one page (/), including what it shows after a postcard is sent. Write the report only: stop after the report step and don't change the site's code.\n\n${UNATTENDED}`,
    maxTurns: 150, maxBudgetUsd: 40, minutes: 90,
  },
```

- [ ] **Step 4: Nothing to install on a plain site (`tests/evals/workspace.ts`)**

Replace
```ts
  assemble(c.fixture!, ws.app);
  const install = await run(["npm", "ci", "--no-audit", "--no-fund"], ws.app, 900_000);
  if (install.code !== 0) throw new Error(`Installing the app's packages failed (npm ci):\n${tail(install)}`);
```
with
```ts
  assemble(c.fixture!, ws.app);
  // A plain web site has no packages to install.
  if (existsSync(join(ws.app, "package.json"))) {
    const install = await run(["npm", "ci", "--no-audit", "--no-fund"], ws.app, 900_000);
    if (install.code !== 0) throw new Error(`Installing the app's packages failed (npm ci):\n${tail(install)}`);
  }
```
and change the file's second comment line to `// plus git's record of how it started (a plain site installs nothing). The record lives beside the app, not in it, so nothing the session does can change it.`

- [ ] **Step 5: Grading B without a build (`tests/evals/grade.ts`)**

Replace `BFacts` with:
```ts
export interface BFacts {
  route: string; pageExists: boolean; check: CheckFacts; validate: ValidateFacts;
  /** React web: the build and the type check. */
  build?: CmdFacts; typecheck?: CmdFacts;
  /** A plain site has nothing to build: its new page, as a browser loads it. */
  render?: ScreenFacts | { error: string };
  /** New components: React files under src/; a plain site's new "Component:" lines. */
  newComponents: string[];
  /** Those named in lines the session added to DESIGN.md (a recorded design guide change). */
  recorded: string[];
}

function renderCriterion(route: string, r: ScreenFacts | { error: string } | undefined): Criterion {
  const label = `The feature's page loads without errors (${route})`;
  if (!r || "error" in r) return { id: "renders", label, pass: false, detail: `motif shot couldn't capture it: ${r?.error ?? "it didn't run"}` };
  const pass = r.status === 200 && r.pageErrors === 0;
  return { id: "renders", label, pass, detail: pass ? "It loads with no page errors." : `Status ${r.status}${r.pageErrors ? `, ${r.pageErrors} page errors` : ""}.` };
}
```
and in `gradeB` replace `...buildCriteria(f.build, f.typecheck),` with:
```ts
    ...(f.build && f.typecheck ? buildCriteria(f.build, f.typecheck) : [renderCriterion(f.route, f.render)]),
```

- [ ] **Step 6: A folder's index page (`tests/evals/match.ts`)**

In `normScreen`, after the line
```ts
  if (!s.startsWith("/")) s = `/${s}`;
```
add:
```ts
  // A folder's index page is the folder: a plain site's "/index.html" is "/".
  s = s.replace(/\/index\.html?$/i, "/");
```
and change its comment to `/** "/products/oats/", "http://localhost:3000/products/oats?x=1", "products/oats" are the same screen; so are "/index.html" and "/". */`.

- [ ] **Step 7: Collecting a plain site's B and C (`tests/evals/collect.ts`)**

Add imports:
```ts
import { detectApps, siteDir } from "../../cli/src/detect/stacks";
import { discoverPlainRoutes } from "../../cli/src/stacks/plain-web/routes";
import { isPlain, type EvalCase } from "./cases";
```
(replacing `import type { EvalCase } from "./cases";`), and add `type ScreenFacts` to the existing import from `./grade`. Replace `const SEEDED = join(import.meta.dir, "..", "fixtures", "react-seeded-app", "seeded-issues.json");` with `const FIXTURES = join(import.meta.dir, "..", "fixtures");`.

Add above `collectB`:
```ts
/** A plain site's new components: names on "Component:" lines the diff adds, minus those it only rewrote (a new variant). */
export function addedComponents(diff: string): string[] {
  const named = (sign: "+" | "-") =>
    new Set(diff.split("\n").filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3))).flatMap((l) => [...l.matchAll(/Component:\s*([A-Za-z][\w-]*)/g)].map((m) => m[1]!)));
  const before = named("-");
  return [...named("+")].filter((n) => !before.has(n));
}

/** A plain site's folder of pages, as Motif finds it. */
function plainSite(app: string): string {
  const site = detectApps(app).apps.find((a) => a.stack === "plain-web");
  return site ? join(app, siteDir(app, site)) : app;
}

/** The feature's page in a browser: its status and how many errors it threw. */
async function renderFacts(k: Collectors, app: string, route: string, out: string): Promise<ScreenFacts | { error: string }> {
  const shot = await motifJson(k, ["shot", "--routes", route], app, out, "shot.json", 900_000);
  const r = Array.isArray(shot.json?.routes) ? shot.json.routes.find((x: any) => x.route === route) : undefined;
  if (!r) return { error: String(shot.json?.error ?? `${route} wasn't captured`) };
  return { route, status: Number(r.status ?? 0), pageErrors: Array.isArray(r.pageErrors) ? r.pageErrors.length : 0 };
}
```
Replace `collectB` with:
```ts
export async function collectB(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<BFacts> {
  mkdirSync(out, { recursive: true });
  const route = c.routes[0]!;
  // What changed is read before the build, which may touch files of its own.
  const changed = await changes(ws, k.run);
  save(out, "diff.patch", await patch(ws, k.run));
  const plain = isPlain(c);
  const styled = changed.filter((x) => x.status !== "deleted" && /\.(css|html?)$/i.test(x.path)).map((x) => x.path);
  const newComponents = plain
    ? styled.length > 0 ? addedComponents(await patch(ws, k.run, styled)) : []
    : changed.filter((x) => x.status === "added" && isComponentFile(x.path)).map((x) => basename(x.path, extname(x.path)));
  const added = (await patch(ws, k.run, ["DESIGN.md"])).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  const recorded = newComponents.filter((n) => new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(added));
  const check = await motifJson(k, ["check"], ws.app, out, "check.json");
  const validate = await motifJson(k, ["validate"], ws.app, out, "validate.json");
  if (plain) {
    return {
      route, pageExists: discoverPlainRoutes(plainSite(ws.app)).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
      render: await renderFacts(k, ws.app, route, out), newComponents, recorded,
    };
  }
  const { build, typecheck } = await buildAndTypecheck(ws.app, k, out);
  return {
    route, pageExists: discoverRoutes(ws.app).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
    build, typecheck, newComponents, recorded,
  };
}
```
In `collectC`, rename the parameter `_c` to `c` and replace `JSON.parse(readFileSync(SEEDED, "utf8")).issues` with `JSON.parse(readFileSync(join(FIXTURES, c.fixture!, "seeded-issues.json"), "utf8")).issues`. Change the file's first comment to `// Measures what a finished case left behind: the motif tool's checks, the build and the type check (or, on a plain site, the page in a browser), what the session changed,`.

- [ ] **Step 8: A browser for b-plain (`tests/evals/run.ts`, `tests/evals/preflight.ts`)**

In `run.ts`, add `needsBrowser` to the import from `./cases`, and replace `todo.some((c) => c.test !== "B")` with `todo.some(needsBrowser)`.

In `preflight.ts`, replace the no-browser message with:
```ts
      error: "No Chrome or Edge was found. Test C's reviews check what the browser shows, and test D's apps and b-plain's page are checked in a browser. Install Chrome or Edge, or run motif browser install yourself (it downloads about 100 MB), then run this again. Test B on Larder alone (--cases b-settings,b-search,b-profile,b-notifications,b-checkout) doesn't need one.",
```

- [ ] **Step 9: The evals README (`tests/evals/README.md`)**

Replace the table's B and C rows with:
```markdown
| B — consistency | Fresh sessions each add a feature to Larder (`fixtures/react-contract-app`), or a page to Kitepost (`fixtures/plain-contract-site`), and stay inside its design guide | `b-settings`, `b-search`, `b-profile`, `b-notifications`, `b-checkout`, `b-plain` |
| C — review accuracy | Reviews of the seeded app (`fixtures/react-seeded-app`, 23 planted problems) and the seeded site (`fixtures/plain-seeded-site`, 17) find what was planted | `c-review`, `c-plain` |
```
At the end of the **B** paragraph under "How cases are graded", add (after a space):
```markdown
On Kitepost (`b-plain`), a plain web site with nothing to build, the new page must load in `motif shot` with no page errors instead of building and type-checking, and a new component is a new `Component:` line in its CSS (rewriting an existing one's line doesn't count).
```

In the **C** paragraph, replace `following [the seeded app's grading rules](../fixtures/react-seeded-app/README.md#how-a-grader-reads-the-list)` with `following the seeded fixture's grading rules ([the app](../fixtures/react-seeded-app/README.md#how-a-grader-reads-the-list), [the site](../fixtures/plain-seeded-site/README.md#how-a-grader-reads-the-list))`, and replace `Pass: at least 90% of the 13 exact problems, at least 70% of the 10 judgement problems` with `Pass: at least 90% of the exact problems (13 in the app, 11 in the site), at least 70% of the judgement problems (10 and 6)`.

- [ ] **Step 10: Run the tests to see them pass**

Run (from `cli/`): `bun test test/evals-cases.test.ts test/evals-workspace.test.ts test/evals-grade.test.ts test/evals-match.test.ts test/evals-collect.test.ts test/evals-run.test.ts test/evals-docs.test.ts test/evals-preflight.test.ts && bun run typecheck`
Expected: PASS; typecheck clean. (`evals-docs` checks that the README names every case, `b-plain` and `c-plain` included.)

- [ ] **Step 11: Commit**

```bash
git add tests/evals cli/test/evals-cases.test.ts cli/test/evals-workspace.test.ts cli/test/evals-grade.test.ts cli/test/evals-match.test.ts cli/test/evals-collect.test.ts cli/test/evals-run.test.ts
git commit -m "feat(evals): b-plain and c-plain, graded like B and C without a build" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The core spec, decision 0004 and the plain web spec's status

**Files:**
- Create: `docs/decisions/0004-plain-web.md`
- Modify: `docs/specs/2026-10-12-motif-core-design.md`, `docs/specs/2026-10-15-motif-plain-web-design.md`
- Test: `cli/test/plain-web-docs.test.ts`

**Interfaces:**
- Consumes: what Tasks 1–6 built (named, not called).
- Produces: nothing code consumes.

- [ ] **Step 1: Write the failing test**

`cli/test/plain-web-docs.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8").replace(/\r\n/g, "\n");

describe("plain web in the design docs", () => {
  test("decision 0004 records why plain web came first and what it decided", () => {
    const decision = read("docs/decisions/0004-plain-web.md");
    for (const s of ["# 0004 — Plain web is the first Part 2 adapter", "Status: Accepted", "xBloom Recolor", "site folder", "two views", "--bg: var(--motif-color-background)", "--state", "--phones", "b-plain", "c-plain"]) {
      expect(decision).toContain(s);
    }
  });

  test("the core spec names plain web, its rules, --state, --phones and the plain eval cases, and points at the decision", () => {
    const spec = read("docs/specs/2026-10-12-motif-core-design.md");
    for (const s of ["Plain web (HTML and CSS) first", "0004-plain-web.md", "plain web, the ninth", "`--state <file.js>`", "`--phones`", "the two `tailwind-*` rules don't apply", "`b-plain`", "`c-plain`"]) {
      expect(spec).toContain(s);
    }
  });

  test("the plain web spec is approved and names its plans", () => {
    expect(read("docs/specs/2026-10-15-motif-plain-web-design.md")).toContain("- Status: Approved 2026-10-15; built by Plans 2A and 2B");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/plain-web-docs.test.ts`
Expected: FAIL — `docs/decisions/0004-plain-web.md` doesn't exist (ENOENT).

- [ ] **Step 3: The decision record**

`docs/decisions/0004-plain-web.md`:
````markdown
# 0004 — Plain web is the first Part 2 adapter

- Date: 2026-10-15
- Status: Accepted
- Context: Motif's review of xBloom Recolor (one HTML page with no framework) on 2026-10-15 worked for the judgement half and the browser audit, and failed at every exact step: `doctor` found no app, `extract` and `check` refused it, `shot` couldn't start it or reach the editor behind its form ([the plain web spec](../specs/2026-10-15-motif-plain-web-design.md) §2). Real sites without a framework exist, and reading HTML and CSS is groundwork the Vue, Svelte and Angular adapters reuse.

## Decisions

1. **A ninth stack, `plain-web`, before the seven framework stacks.** A folder with an `index.html` (in itself, `public/`, `src/`, `site/` or `www/`) and no framework is a plain web site; that folder is its site folder (`srcDir`). Folders that hold apps, documentation, Motif's own files, templates, tests or reports never are, other UI libraries and static-site generators aren't plain web, and pages beside an app of another stack don't hide it.
2. **HTML is read as two views** of the same length: its CSS (`<style>` blocks and `style=""` attributes) and everything else. Every rule runs unchanged, positions stay exact, and React apps' `.html` files are read the same way.
3. **A site keeps its own variable names**, each defined from a role in its `:root` (`--bg: var(--motif-color-background)`), rather than a mapping table in `design/motif.json`: one place to change a colour, and no extra settings for `check`.
4. **`extract` pairs dark values on every stack**: a solid, single-colour variable set in a light block and in a dark-mode block gives its role a real dark value instead of a copy.
5. **`motif shot` serves a plain site's folder itself** (on 127.0.0.1, to its own Host only, checking real paths, never hidden files) and takes `--state <script>` for screens behind a form or a click.
6. **`--phones` adds phones 360 and 430 px wide.** The xBloom review's one regression, a fix that made table rows taller only on wider phones and pushed the live card preview away from its sliders, showed on a 430 px phone and not at 390 px. The review mode now checks every fix at every phone width and keeps things people use together on one screen.

## Consequences

- The skill has a plain web stack guide (`skill/adapters/plain-web/`), and init, feature and review work on plain sites, with state scripts in `design/states/` for screens behind forms.
- Two fixtures (`tests/fixtures/plain-contract-site/` and `tests/fixtures/plain-seeded-site/`) and two eval cases (`b-plain`, `c-plain`) cover plain web the way Larder covers React. A plain site has nothing to build: `b-plain` checks that its new page loads in a browser instead.
- Static-site generators (Eleventy, Hugo, Jekyll, Astro) and sites that need a build step stay out of scope for now; `shot --url` still works for them.
````

- [ ] **Step 4: The core spec**

In `docs/specs/2026-10-12-motif-core-design.md`:

1. §4's table: replace `| 2. Stack adapters | Vue/Nuxt, Svelte/SvelteKit, Angular, React Native (Expo), Flutter, SwiftUI, Jetpack Compose — each built from the adapter template defined here | Part 1 |` with:
```
| 2. Stack adapters | Plain web (HTML and CSS) first ([its spec](2026-10-15-motif-plain-web-design.md), [decision 0004](../decisions/0004-plain-web.md)), then Vue/Nuxt, Svelte/SvelteKit, Angular, React Native (Expo), Flutter, SwiftUI, Jetpack Compose — each built from the adapter template defined here | Part 1 |
```
2. §10.2's `motif doctor` row: replace `(all 8 stacks detectable from Part 1)` with `(all 8 stacks detectable from Part 1; plain web, the ninth, from Part 2)`.
3. §10.2's `motif shot` row: replace `Stops the dev server it started. |` with:
```
Stops the dev server it started. A plain web site is served from its own folder instead. `--state <file.js>` (repeatable) also captures each page after a script brings it to a state behind a form or a click (`index@<state>.png`); `--phones` adds phones 360 and 430 px wide, to check a layout change on every phone. |
```
4. §11.5: after the paragraph that starts `` `shot --audit` adds, at runtime``, add the paragraph:
```
On plain web sites (Part 2), the same rules read CSS where it is (`.css` files, `<style>` blocks and `style=""` attributes) and scripts as scripts; the two `tailwind-*` rules don't apply ([plain web spec §6](2026-10-15-motif-plain-web-design.md)).
```
5. §13.2: at the end of the **Test B** bullet (after `unless recorded as a contract change.`), add (after a space):
```markdown
Plain web (Part 2): `b-plain` adds a page to `tests/fixtures/plain-contract-site` with the same pass rules, except that the page must load without errors instead of building.
```
At the end of the **Test C** bullet (after `≤ 10% of critical/major findings are false.`), add (after a space):
```markdown
Plain web: `c-plain` reviews `tests/fixtures/plain-seeded-site` (17 problems: 11 exact, 6 judgement) with the same thresholds.
```
6. §16: replace
```markdown
- Adapters other than React web (Part 2). `doctor` still detects all 8 stacks.
```
with
```markdown
- Adapters other than React web (Part 2; plain web came first, [decision 0004](../decisions/0004-plain-web.md)). `doctor` still detects all 8 stacks.
```

- [ ] **Step 5: The plain web spec's status**

In `docs/specs/2026-10-15-motif-plain-web-design.md`, replace `- Status: Draft for review` with `- Status: Approved 2026-10-15; built by Plans 2A and 2B`.

- [ ] **Step 6: Run the whole suite**

Run (from `cli/`): `bun test test/plain-web-docs.test.ts test/evals-docs.test.ts && bun run typecheck && bun test --timeout 120000`
Expected: PASS; typecheck clean; every test passes (876 before this plan, plus the new ones; the same skips, more where no browser is found).

- [ ] **Step 7: Commit**

```bash
git add docs/decisions/0004-plain-web.md docs/specs/2026-10-12-motif-core-design.md docs/specs/2026-10-15-motif-plain-web-design.md cli/test/plain-web-docs.test.ts
git commit -m "docs: decision 0004 and the core spec for plain web" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
