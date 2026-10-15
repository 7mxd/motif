# Motif Plan 2C: the xBloom re-check follow-ups

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three tool problems the xBloom re-check found that needed a design: `motif extract` ignores a site's own variables, phone screenshots are taller than what a phone browser shows, and `motif check` and `extract` read server code beside a plain site.

**Architecture:** Three independent changes to existing code.
- `check/run.ts` gets one helper that lists an app's files, limited to a plain site's folder; `check` and `extract` both use it.
- `extract/draft.ts` counts colours used through variables, reads variable names as role hints, finds buttons' fills, and stops treating colour lists in scripts as theme colours.
- `shot/capture.ts` gets phone heights that match a phone browser while scrolling, and `shot/compare.ts` draws the end of the first screen on side-by-side images.

**Tech Stack:** Bun 1.4 + TypeScript (cli/), bun:test, the minimal CDP client in `cli/src/browser/cdp.ts`, culori.

**Spec:** the design approved in chat on 2026-10-16. It follows the re-check report `C:\Users\PC\motif-proof\xbloom-recolor-recheck-2026-10-15\README.md` (problems 4, 5 and 6). The core spec (`docs/specs/2026-10-12-motif-core-design.md`) and the plain web spec (`docs/specs/2026-10-15-motif-plain-web-design.md`) still bind everything they say.

## Global Constraints

- No new dependencies.
- Servers bind 127.0.0.1 only; tests never reach the network.
- React web behaviour is unchanged except where a task says otherwise. The React fixtures' drafts and checks must not move.
- Plain language in every message and doc line (the project's copy rules: short sentences, no jargon).
- Commits use `7895735+7mxd@users.noreply.github.com` and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. Name hints that catch the wrong variable: `--card` holding a user's card colour, `--surface-2`, `--text-muted`, `--color-bg`. Each must land on the right role, or none.
2. Variables used through other variables (`--a: var(--b)`), with fallbacks (`var(--x, #fff)`), or inside dark-mode blocks: none should double-count or count the dark value as a light use.
3. React apps: colours in TSX style objects and Tailwind classes are real usage, not data. The React fixture's draft must not change.
4. A plain site whose folder is the project root (`.`): `check` and `extract` still read everything there.
5. The screen frame:
   - mockup pairs, and sets saved before this change (no record: no frame);
   - pages shorter than one screen;
   - the desktop and tablet scales;
   - a state that scrolls to the bottom;
   - a PNG with the record must still open everywhere, including the comparison's own measurement.

---

### Task 1: On a plain site, read only the site folder

**Files:**
- Modify: `cli/src/check/run.ts` (new `appSourceFiles`, used by `checkApp`)
- Modify: `cli/src/commands/extract.ts` (use `appSourceFiles`)
- Test: `cli/test/check-plain.test.ts`, `cli/test/extract-plain.test.ts`

**Interfaces:**
- Produces: `appSourceFiles(root: string, app: AppInfo, opts?: { ignore?: string[] }): SourceFile[]`

- [ ] **Step 1: Failing tests.** In `check-plain.test.ts`:

```ts
  test("reads only the site folder: server code beside it isn't the site (xBloom re-check)", async () => {
    const r = await check(site({
      "public/index.html": "<!doctype html><p>Hi</p>",
      "lib/xbloom.js": 'export const DEFAULT_CARD = "#C9D5B8";',
      "server.js": 'const ERROR = "#ff0000";',
    }));
    expect(r.violations).toEqual([]);
    expect(r.summary.files).toBe(1);
  });
```

In `extract-plain.test.ts`:

```ts
  test("drafts from the site folder only, not server code beside it", async () => {
    const root = makeProject({ "public/index.html": XBLOOM_LIKE, "lib/xbloom.js": 'export const DEFAULT_CARD = "#C9D5B8";' });
    const r = await runExtract(root, { positionals: [] });
    expect((r.data as { files: number }).files).toBe(1);
    const report = read(root, "design/extract-report.json");
    expect(report.colors.flatMap((c: any) => c.members.flatMap((m: any) => m.examples))).not.toContainEqual(expect.stringContaining("lib/"));
  });
```

- [ ] **Step 2: Run them; they fail.** `bun test test/check-plain.test.ts test/extract-plain.test.ts` reports `lib/xbloom.js` and `server.js` and counts 3 files.
- [ ] **Step 3: Implement.** In `check/run.ts`:

```ts
/** The files Motif reads for an app. On a plain web site, only its site folder: server code beside it isn't the site. */
export function appSourceFiles(root: string, app: AppInfo, opts: { ignore?: string[] } = {}): SourceFile[] {
  const site = app.stack === "plain-web" ? siteDir(root, app) : ".";
  return listSourceFiles(root, app.path, { ignore: opts.ignore, ...(site === "." ? {} : { paths: [prefixPath(app.path, site)] }) });
}
```

`checkApp` uses `appSourceFiles(root, app, { ignore: opts.ignore })` for `all`; `runExtract` uses `appSourceFiles(cwd, a, { ignore })`.
- [ ] **Step 4: Run the tests; they pass.** Also run `test/check-*.test.ts test/extract-*.test.ts test/fixtures-plain-*.test.ts`.
- [ ] **Step 5: Commit** `fix(plain-web): check and extract read only the site folder`.

### Task 2: extract follows a site's own variables

**Files:**
- Modify: `cli/src/check/rules/colors.ts` (export `CSS_DECLARATION`)
- Modify: `cli/src/extract/draft.ts`
- Test: `cli/test/extract-plain.test.ts`; the existing `extract-*.test.ts` must stay green unchanged.

**Interfaces:**
- Consumes: `colorContext`, `darkRanges`, `maskComments`, `CSS_DECLARATION`.
- Produces: `Occurrences` unchanged in shape. Sample `contexts` gain the keys `action`, `action-secondary` and `data`; these don't count towards `count`.

What changes, in order:
1. **Uses through variables count.** For each declaration in CSS (outside dark-mode blocks) whose value contains `var(--name…)`, when `--name` holds a colour, add a use of that colour. Its context comes from the property (`color` → text, `background` → background, `border…` → border). An example is kept at the declaration's line.
2. **Buttons.** A `background`/`background-color` declaration in a rule whose selector names a button (`button`, `.btn`, `.button`, `[type=submit]`, `[role=button]`) also adds context `action`, or `action-secondary` when the selector also says secondary, ghost, outline, tertiary or subtle. This applies to colours written out and colours used through variables.
3. **Data, not theme.** A colour written in a script, not set as a style property (a list of colours, a default value), adds context `data`. A cluster whose every use is data doesn't fill action or status roles.
4. **Names are hints.** A variable with a solid colour whose name says a role takes that role first:

| Role | Names (with an optional `color-` prefix or `-color` suffix) |
|---|---|
| text-secondary | contains muted, secondary, subtle, subdued, dim, faint, meta or hint |
| text-primary | text, fg, foreground, ink, body-text, copy |
| background | bg, background, page, canvas, backdrop |
| surface | surface, panel, sheet, raised |
| border | border, hairline, divider, separator, line, rule |
| action-primary | primary, brand, cta, action |
| danger, success, warning, info | danger/error/destructive/negative, success/positive, warning/warn/caution, info/notice |

5. **Choosing**, for each role: the named variable's cluster, then the usage rules as today. Action-primary takes the most-used `action` cluster before the most-used saturated one. The report's variable list prefers the named role.
6. **Plain web sites only, for now** (ruling while building): on HiSalon's two React apps the same rules gave worse drafts, because those apps colour text through Tailwind classes that extract can't see. So `collectOccurrences` follows variables only for plain web files (`followFor`), and the React drafts stay exactly as they were. A role's own name set through another variable (`--text-primary: var(--gray-900)`) counts with no other evidence.

- [ ] **Step 1: Failing test** (`extract-plain.test.ts`). An xBloom-shaped page:
  - variables in light and dark: `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--danger`, a translucent `--hairline`, `--accent` and `--card`;
  - `color: var(--muted)` in four rules;
  - `button { background: var(--text); color: var(--bg); }` and `button.secondary { background: var(--surface-2); }`;
  - `border-top: 1px solid var(--surface-2)` twice;
  - a slider thumb `border: 3px solid #fff` twice;
  - a `<script>` holding a list of card colours: `#2E8B57`, `#F2C14E`, `#4A90F0`, `#D9302C`.

Expected draft:

| Role | Light | Dark |
|---|---|---|
| background | #F2F2F7 | #000000 |
| surface | #FFFFFF | #1C1C1E |
| text-primary | #000000 | #FFFFFF |
| text-secondary | #6C6C70 | #8E8E93 |
| border | #E5E5EA | #2C2C2E |
| action-primary | #000000 | #FFFFFF |
| danger | #D70015 | #FF6961 |

Neither success nor warning comes from the card list. The report maps `--muted` to `color.text-secondary` and `--bg` to `color.background`.
- [ ] **Step 2: Run it; it fails** (today: text-secondary is black, and success comes from the card list).
- [ ] **Step 3: Implement** in `draft.ts` as listed above.
- [ ] **Step 4: Run** `bun test test/extract-*.test.ts test/fixtures-*.test.ts`. The new test passes; existing expectations are unchanged (the React fixture's draft included).
- [ ] **Step 5: Commit** `fix(extract): follow a site's own variables, names and buttons`.

### Task 3: Phone screenshots show what a phone browser shows, and comparisons frame the screen

**Files:**
- Modify: `cli/src/browser/png.ts` (`addPngText`, `readPngText`)
- Modify: `cli/src/shot/capture.ts` (`VIEWPORTS` heights; each screenshot records the screen it was looking at)
- Modify: `cli/src/shot/compare.ts` (exported `comparePage`, the screen frame)
- Modify: `skill/modes/review.md` step 5, `skill/adapters/plain-web/checks.md`, the `README.md` shot row, the core spec's `motif shot` row, `docs/decisions/0004-plain-web.md` item 6
- Test: `cli/test/png.test.ts` (new), `cli/test/shot-sizes.test.ts`, `cli/test/compare.test.ts`

**Interfaces:**
- Produces:
  - `addPngText(png: Uint8Array, key: string, value: string): Uint8Array`
  - `readPngText(png: Uint8Array, key: string): string | undefined`
  - `screenOf(png: Uint8Array): Screen | undefined`, where `Screen = { width: number; top: number; height: number }` (CSS px)
  - `comparePage(labels: [string, string], column: number, n: number, screens: [Screen | null, Screen | null]): string`

**Phone heights** are the visible area of a phone browser once its toolbar shrinks while scrolling (Safari's `100vh`, the large viewport). The xBloom report measured about 855 px on a 430 px iPhone. The same browser bars on the other phones give 360×740 and 390×767. The tablet (768×1024) and desktop (1440×900) are unchanged.

**The screen frame (a refinement of the approved "line at the end of the first screen"):**
- A line at a fixed height from the top only helps for content near the top of the page. xBloom's card and sliders sit lower down, where people scroll to use them.
- So each screenshot records the part of the page that was on screen when it was taken: the viewport's width, its height, and how far the page was scrolled. A state script can scroll things into view first (`element.scrollIntoView()`).
- The record goes into the PNG itself (a `tEXt` chunk named `motif:screen`), so saved sets keep it. Screenshots without it, from older sets or mockups, simply get no frame.
- On the side-by-side image, each shot with a record gets a dashed frame around that area, labelled "On screen". It's the first screen when nothing was scrolled.

- [ ] **Step 1: Failing tests.**
  - `png.test.ts`: add a text chunk to a real PNG (from a 1×1 screenshot or a fixture), read it back, and check `pngSize` is unchanged. Without the chunk, `readPngText` gives undefined.
  - `shot-sizes.test.ts`:
    - `VIEWPORTS.map((v) => [v.file ?? v.name, v.width, v.height])` equals `[["mobile-360", 360, 740], ["mobile", 390, 767], ["mobile-430", 430, 855], ["tablet", 768, 1024], ["desktop", 1440, 900]]`;
    - a real capture of a tall page, with a state that scrolls to 600 px, gives a `mobile-430` PNG with screen `{ width: 430, top: 600, height: 855 }`, and the plain page `{ width: 430, top: 0, height: 855 }`.
  - `compare.test.ts`:
    - `comparePage(["Before", "Now"], 430, 0, [{ width: 430, top: 600, height: 855 }, null])` has one `class="screen"` box at `top: 600px; height: 855px`;
    - on a desktop shot shown 720 px wide, `{ width: 1440, top: 0, height: 900 }` gives `top: 0px; height: 450px`;
    - a real render of two identical shots still says "No visible change" (the frame isn't measured).
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
  - `png.ts`: insert a `tEXt` chunk (`key\0value`, CRC32 over type and data with `Bun.hash.crc32`) right after IHDR; `readPngText` walks the chunks.
  - `capture.ts`:
    - phone heights 740, 767 and 855, with a comment saying why;
    - after the state script and the wait, read `scrollY`;
    - write the screenshot with `addPngText(png, "motif:screen", JSON.stringify({ width, top, height }))`;
    - export `screenOf`.
  - `compare.ts`:
    - each image sits in a `position: relative; overflow: hidden` box;
    - a shot with a screen gets a box with `top: top × column / width` and `height: height × column / width`, with a 2 px dashed border and the label "On screen";
    - `renderComparisons` reads both PNGs' screens.
- [ ] **Step 4: Run** `bun test test/png.test.ts test/shot-sizes.test.ts test/compare.test.ts test/shot-*.test.ts test/capture.test.ts`; they pass.
- [ ] **Step 5: Docs.**
  - `review.md` step 5: side-by-side images frame what was on screen. To check that things people use together still fit, end the state script by scrolling them into view (`document.querySelector("#card").scrollIntoView({ behavior: "instant" })`), then see that they sit inside the frame wherever they did before.
  - `checks.md`: the state-script list gets the same scroll tip, and one line saying the phone sizes are what a phone browser shows while scrolling.
  - README, the core spec's `motif shot` row and decision 0004 item 6: give the phone heights and mention the frame.
- [ ] **Step 6: Commit** `fix(shot): phone screenshots are as tall as a phone browser shows, and comparisons frame the screen`.

### Task 4: Check on xBloom

- [ ] Run `motif extract` on a copy of xBloom before the first review (90e3334), and compare the roles with the hand-written guide (`compare_roles.py`). Expect at least background, surface, text-primary, text-secondary, border, action-primary and danger to match in light and dark.
- [ ] Replay the regression. The Custom colour state script ends by scrolling the card into view. Run `--save before` on 90e3334's page, then `--against before` with 2def9e1's page. The 430 px side-by-side image shows the Lightness slider inside the "On screen" frame before (827 px from the card's top) and outside it after (863 px).
- [ ] Record both in the proof folder's README (a section "After Plan 2C").
