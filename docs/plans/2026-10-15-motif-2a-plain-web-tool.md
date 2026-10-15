# Motif 2A — Plain web support in the tool: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `motif` command fully supports a plain web site (HTML, CSS and JavaScript with no framework): it's recognised, its CSS is read where it really is (`.css` files, `<style>` blocks, `style=""` attributes), `tokens` writes its theme stylesheet, `extract` drafts a design guide with real dark-mode colours, and `shot` serves it and can capture states behind a form or a click.

**Architecture:** A ninth stack id, `plain-web`, with a **site folder** (`.`, `public/`, `src/`, `site/` or `www/`, the first with an `index.html`) recorded as the app's `srcDir`. HTML files are split into two views the length of the file (only the CSS, and everything else), so every existing rule runs unchanged with exact positions. Colour hits in CSS carry their custom property name and whether they sit in a dark-mode block, which lets `extract` pair light and dark values for every stack. `shot` serves a plain site's folder itself on `127.0.0.1` and runs optional state scripts in each page before capturing it.

**Tech Stack:** Bun 1.4 + TypeScript (no new dependencies), the existing check rules, Motif's CDP browser client.

**Spec:** `docs/specs/2026-10-15-motif-plain-web-design.md` (approved 2026-10-15). It builds on `docs/specs/2026-10-12-motif-core-design.md`.

**Split:** Part 2's first adapter is two plans. **2A (this plan)** is the tool. **2B** is the skill's plain web stack guide, the mode changes, the two fixtures and their eval cases, and the core spec and decision record updates (spec §14).

**Builds on:** `main` at `fe200e0`. Read before starting: `cli/src/detect/stacks.ts`, `cli/src/check/{files,run,mask,types,exceptions}.ts`, `cli/src/check/rules/{colors,values,app}.ts`, `cli/src/extract/draft.ts`, `cli/src/commands/{check,extract,tokens,shot,doctor}.ts`, `cli/src/shot/{capture,audit}.ts`, `cli/src/preview/server.ts`, `cli/src/stacks/react-web/{generate,routes}.ts`, `cli/src/main.ts`, `cli/src/cli/output.ts`, and the tests `cli/test/{project,helpers,tmp}.ts`, `cli/test/shot-command.test.ts`, `cli/test/shot-e2e.test.ts`.

**Facts the plan relies on (read from the code, 2026-10-15):**
- `listSourceFiles` reads `.html` as `lang: "markup"`, and the colour and value rules treat markup like a script: CSS inside an HTML page isn't read as CSS today.
- `scanColors` flags a literal colour in any custom property except `--motif-*` (`--bg: #f2f2f7` is a `raw-color` hit), and a `var(--bg)` is never a hit.
- `motifCss(theme)` in `cli/src/stacks/react-web/generate.ts` is plain CSS: roles as `--motif-*` variables, light by default, dark from `prefers-color-scheme` unless `[data-theme="light"]`, dark with `[data-theme="dark"]`, and a reduced-motion block.
- `extract` is built on `scanFile` hits and copies light colours into dark mode ("Dark-mode colours were copied from light mode…", asserted in `cli/test/extract-draft.test.ts`).
- `exceptionFor` already accepts `<!-- motif-ok: reason -->`.
- `--save` and `--against` pair screenshots by file name, so a state's screenshot (`index@editor.mobile.png`) pairs with no extra work.
- `page.evaluate` awaits promises and throws `Script error in the page: …` when one rejects.
- The test design guide (`cli/test/fixtures/contract`): spacing 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px; radius 0, 4, 8, 16 px; text sizes 40, 28, 20, 16, 14, 12 px.

## Global Constraints

- No new dependencies. Bun 1.4 + TypeScript 7; `bun run typecheck` and `bun test --timeout 120000` (from `cli/`) stay green on Windows, macOS and Linux.
- React web behaviour doesn't change, except that `<style>` blocks and `style=""` attributes in its `.html` files are now read as CSS (spec §6). Existing tests pass unchanged, apart from the two this plan edits on purpose (`cli/test/shot-command.test.ts` gets a stand-in for the new static server; nothing else).
- Positions are exact: every hit in an HTML file names the line and column in that file.
- The static server listens on `127.0.0.1` only, answers only its own `Host`, never serves a hidden file or folder (`.env`, `.git`) or anything outside the site folder.
- Plain words in every message (Motif's voice): say what's wrong and what to do next. No command ends in a dead end (spec §9).
- Commits use the repository's configured no-reply address and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.

## Review Focus

1. **HTML that isn't tidy:** upper-case tags (`<STYLE>`), single-quoted attributes, `data-style=""`, a `>` inside an attribute value, an unclosed `<style>`, HTML comments → CSS regions found exactly, nothing double-counted, no crash. Pinned: Task 2.
2. **Dark mode written in different ways:** `@media (prefers-color-scheme: dark)`, `[data-theme="dark"]` quoted or not, `[data-mode=dark]`, `.dark`, `html.dark`, a dark rule inside another media query, and look-alikes that aren't dark (`.dark-mode`, a light media query) → only real dark blocks count. Pinned: Task 5.
3. **Requests that try to leave the site folder:** `/../`, `%2e%2e`, `/.env`, `/.git/config`, a forged `Host` → refused. Pinned: Task 7.
4. **A state script that throws or never finishes** → reported against its page and state; capture goes on; a script that hangs is stopped after 15 s. Pinned: Task 8 (expression), Task 9 (a throwing script in a real browser).
5. **Folders that look like a site but aren't one** (`docs/index.html`, Motif's own `design/previews/`, `templates/`, React apps with `public/index.html`, Vue with an `index.html`) → not plain web. Pinned: Task 1.

---

## File Structure

```
cli/src/
├── detect/stacks.ts            MODIFY: plain-web id, label, SITE_FOLDERS, siteFolder(), siteDir(); detection; srcDir on detected plain apps
├── check/html.ts               CREATE: htmlViews() and expandHtml(): an HTML file as a CSS view and a rest view
├── check/dark.ts               CREATE: darkRanges(): the parts of a stylesheet that apply in dark mode
├── check/files.ts              MODIFY: .htm is markup
├── check/types.ts              MODIFY: Hit.prop and Hit.scheme
├── check/run.ts                MODIFY: scanFile(…, { tailwind }); checkApp for plain web (generated motif.css, HTML views, fixes)
├── check/rules/colors.ts       MODIFY: colour hits in CSS carry prop (custom properties) and scheme ("dark")
├── commands/check.ts           MODIFY: plain web supported; no-contract message by stack
├── commands/tokens.ts          MODIFY: plain web writes <site>/motif.css and tokens.flat.json; <link> wiring note; srcDir in motif.json
├── generate/fallback.ts        MODIFY: flatTokensFile()
├── extract/draft.ts            MODIFY: variables (light/dark), dark colours kept out of clustering, dark values paired, report.variables, notes
├── commands/extract.ts         MODIFY: plain web supported; HTML views; message for other stacks
├── commands/doctor.ts          MODIFY: plain web reported with its site folder
├── preview/server.ts           MODIFY: export CONTENT_TYPES
├── shot/static-server.ts       CREATE: startStaticServer(root)
├── stacks/plain-web/routes.ts  CREATE: discoverPlainRoutes(siteDir)
├── shot/capture.ts             MODIFY: StateScript, stateExpression(), states in captureScreens
├── shot/audit.ts               MODIFY: AuditIssue.state, location.state, merge key
├── commands/shot.ts            MODIFY: plain web served and discovered; --state read and passed on
├── cli/output.ts               MODIFY: flags may hold string[]
└── main.ts                     MODIFY: --state (repeatable), help text
cli/test/
├── plain-web-detect.test.ts · check-html.test.ts · check-plain.test.ts · tokens-plain.test.ts
├── dark.test.ts · extract-plain.test.ts · shot-plain.test.ts · shot-state.test.ts · plain-web-e2e.test.ts
└── shot-command.test.ts        MODIFY: its stand-in deps get serveStatic
README.md                       MODIFY: plain web in the tool table
```

---

### Task 1: Recognising a plain web site

**Files:**
- Modify: `cli/src/detect/stacks.ts`, `cli/src/commands/doctor.ts`
- Test: `cli/test/plain-web-detect.test.ts`

**Interfaces:**
- Consumes: `detectStack`, `detectApps`, `AppInfo` (existing).
- Produces:
  - `StackId` includes `"plain-web"`; `STACK_LABELS["plain-web"] = "Plain web (HTML and CSS)"`; `ADAPTERS_AVAILABLE = ["react-web", "plain-web"]`.
  - `SITE_FOLDERS: readonly [".", "public", "src", "site", "www"]`; `siteFolder(dir: string): string | null`; `siteDir(root: string, app: AppInfo): string` (the site folder relative to the app).
  - Detected plain web apps carry `srcDir` (their site folder).

- [ ] **Step 1: Write the failing test**

`cli/test/plain-web-detect.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { runDoctor, type DoctorDeps, type DoctorItem } from "../src/commands/doctor";
import { detectApps, detectStack, siteDir, siteFolder, STACK_LABELS } from "../src/detect/stacks";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (deps: Record<string, string>, extra: object = {}) => JSON.stringify({ dependencies: deps, ...extra });

describe("plain web sites", () => {
  test("a folder with an index.html and no framework, in each site folder", () => {
    for (const folder of [".", "public", "src", "site", "www"]) {
      const root = makeProject({ [folder === "." ? "index.html" : `${folder}/index.html`]: "<!doctype html>" });
      expect(detectStack(root)).toBe("plain-web");
      expect(siteFolder(root)).toBe(folder);
      expect(detectApps(root).apps).toEqual([{ path: ".", stack: "plain-web", source: "detected", srcDir: folder }]);
    }
    expect(STACK_LABELS["plain-web"]).toBe("Plain web (HTML and CSS)");
  });

  test("a small server, or Vite without a framework, is still plain web", () => {
    expect(detectStack(makeProject({ "package.json": JSON.stringify({ scripts: { start: "node server.js" } }), "server.js": "", "public/index.html": "" }))).toBe("plain-web");
    expect(detectStack(makeProject({ "package.json": JSON.stringify({ devDependencies: { vite: "^6" } }), "index.html": "" }))).toBe("plain-web");
  });

  test("other stacks, React without known tooling, and pages that aren't a site aren't plain web", () => {
    expect(detectStack(makeProject({ "package.json": pkg({ react: "^19", "react-dom": "^19", "react-scripts": "5" }), "public/index.html": "" }))).toBe("react-web");
    expect(detectStack(makeProject({ "package.json": pkg({ vue: "^3" }), "index.html": "" }))).toBe("vue");
    expect(detectStack(makeProject({ "package.json": pkg({ react: "^19" }), "index.html": "" }))).toBeNull();
    expect(detectStack(makeProject({ "docs/index.html": "", "design/previews/home.html": "", "templates/index.html": "" }))).toBeNull();
  });

  test("found in apps/ like other stacks; design/motif.json can name it and its folder", () => {
    const root = makeProject({ "apps/site/public/index.html": "", "apps/web/package.json": pkg({ next: "15", react: "19" }) });
    expect(detectApps(root).apps).toEqual([
      { path: "apps/site", stack: "plain-web", source: "detected", srcDir: "public" },
      { path: "apps/web", stack: "react-web", source: "detected" },
    ]);
    const named = makeProject({ "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "plain-web", srcDir: "pages" }] }), "pages/home.html": "" });
    const app = detectApps(named).apps[0]!;
    expect(app).toEqual({ path: ".", stack: "plain-web", source: "motif.json", srcDir: "pages" });
    expect(siteDir(named, app)).toBe("pages");
    expect(siteDir(makeProject({ "public/index.html": "" }), { path: ".", stack: "plain-web", source: "motif.json" })).toBe("public");
  });
});

describe("doctor", () => {
  const deps = (): DoctorDeps => ({ platform: "linux", arch: "x64", home: tempDir("motif-home-"), findBrowser: () => null, which: () => null });

  test("reports a plain web site as fully supported, with its site folder, and doesn't ask for Node.js", async () => {
    const items = (await runDoctor(makeProject({ "public/index.html": "<!doctype html>" }), deps())).data.items as DoctorItem[];
    expect(items.find((i) => i.id === "app:.")).toMatchObject({ status: "ok", detail: "Full support for Plain web (HTML and CSS); its pages are in public/." });
    expect(items.find((i) => i.id === "node")).toBeUndefined();
    const atRoot = (await runDoctor(makeProject({ "index.html": "" }), deps())).data.items as DoctorItem[];
    expect(atRoot.find((i) => i.id === "app:.")!.detail).toContain("its pages are in this folder");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/plain-web-detect.test.ts`
Expected: FAIL — `siteFolder` and `siteDir` aren't exported (SyntaxError: export not found).

- [ ] **Step 3: Implement detection in `cli/src/detect/stacks.ts`**

Replace the stack list, labels and adapters:
```ts
export const STACK_IDS = ["react-web", "vue", "svelte", "angular", "react-native", "flutter", "swiftui", "compose", "plain-web"] as const;
export type StackId = (typeof STACK_IDS)[number];

export const STACK_LABELS: Record<StackId, string> = {
  "react-web": "React (web)",
  vue: "Vue / Nuxt",
  svelte: "Svelte / SvelteKit",
  angular: "Angular",
  "react-native": "React Native (Expo)",
  flutter: "Flutter",
  swiftui: "SwiftUI",
  compose: "Jetpack Compose",
  "plain-web": "Plain web (HTML and CSS)",
};

export const ADAPTERS_AVAILABLE: readonly StackId[] = ["react-web", "plain-web"];
```

After `NODE_STACKS`, add:
```ts
/** Where a plain web app's pages live: the first of these folders (inside the app) with an index.html. */
export const SITE_FOLDERS = [".", "public", "src", "site", "www"] as const;

export function siteFolder(dir: string): string | null {
  return SITE_FOLDERS.find((f) => existsSync(join(dir, f, "index.html"))) ?? null;
}
```

At the end of `detectStack`, replace
```ts
  if (looksLikeSwift && hasSwiftUIImport(dir)) return "swiftui";

  return null;
}
```
with
```ts
  if (looksLikeSwift && hasSwiftUIImport(dir)) return "swiftui";

  // Pages without a framework. React without known tooling isn't plain web: it's an app Motif can't place yet.
  if (!deps?.has("react") && siteFolder(dir) !== null) return "plain-web";
  return null;
}
```

In `detectApps`, record the site folder of detected plain web apps. Add above `export function detectApps`:
```ts
const detected = (root: string, path: string, stack: StackId | null): AppInfo => ({
  path,
  stack,
  source: "detected",
  ...(stack === "plain-web" ? { srcDir: siteFolder(join(root, path)) ?? "." } : {}),
});
```
and use it in both places:
```ts
  if (rootStack || isUnrecognisedReactApp(root)) {
    return { apps: [detected(root, ".", rootStack)], findings: settings.findings };
  }
```
```ts
      if (stack || isUnrecognisedReactApp(abs)) apps.push(detected(root, rel(relPath), stack));
```

After `detectApps`, add:
```ts
/** A plain web app's site folder, relative to the app: from design/motif.json, or found again. */
export function siteDir(root: string, app: AppInfo): string {
  return app.srcDir ?? siteFolder(join(root, app.path)) ?? ".";
}
```

- [ ] **Step 4: Report the site folder in `cli/src/commands/doctor.ts`**

Add `siteDir` to the import from `../detect/stacks`, and replace
```ts
    } else if (ADAPTERS_AVAILABLE.includes(app.stack)) {
      push(`app:${app.path}`, "ok", label, `Full support for ${STACK_LABELS[app.stack]}.`);
```
with
```ts
    } else if (ADAPTERS_AVAILABLE.includes(app.stack)) {
      const site = app.stack === "plain-web" ? siteDir(cwd, app) : null;
      const where = site === null ? "" : `; its pages are in ${site === "." ? "this folder" : `${site}/`}`;
      push(`app:${app.path}`, "ok", label, `Full support for ${STACK_LABELS[app.stack]}${where}.`);
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/plain-web-detect.test.ts test/stacks.test.ts test/doctor.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/detect/stacks.ts cli/src/commands/doctor.ts cli/test/plain-web-detect.test.ts
git commit -m "feat(stacks): recognise plain web sites and their site folder" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reading the CSS inside HTML

**Files:**
- Create: `cli/src/check/html.ts`
- Modify: `cli/src/check/files.ts` (`.htm`), `cli/src/check/run.ts` (`scanFile` options)
- Test: `cli/test/check-html.test.ts`

**Interfaces:**
- Consumes: `SourceFile`, `Lang` (`cli/src/check/files.ts`); `scanFile` (`cli/src/check/run.ts`).
- Produces:
  - `htmlViews(text: string): { css: string; rest: string }` — both the length of `text`, line breaks kept: `css` keeps only `<style>` contents and `style=""` values (their quotes become `;`), `rest` keeps everything else; HTML comments are blank in both.
  - `expandHtml(files: SourceFile[]): SourceFile[]` — each `.html`/`.htm` markup file becomes `[{ …, text: css, lang: "css" }, { …, text: rest, lang: "markup" }]` with the same path.
  - `scanFile(file: SourceFile, scale: Scale | null, opts?: { tailwind?: boolean }): Hit[]` — `tailwind` defaults to `true`; `false` skips the Tailwind rules.

- [ ] **Step 1: Write the failing test**

`cli/test/check-html.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { listSourceFiles, type SourceFile } from "../src/check/files";
import { expandHtml, htmlViews } from "../src/check/html";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
const page = (text: string): SourceFile => ({ path: "public/index.html", abs: "/x/public/index.html", text, lang: "markup" });
const hitsOf = (text: string) => expandHtml([page(text)]).flatMap((f) => scanFile(f, scale, { tailwind: false }));
/** Line and column (1-based) of the first occurrence of needle. */
const at = (text: string, needle: string) => {
  const i = text.indexOf(needle);
  return { line: text.slice(0, i).split("\n").length, column: i - text.lastIndexOf("\n", i - 1) };
};

const PAGE = [
  "<!doctype html>",
  '<meta name="theme-color" content="#000000">',
  '<STYLE media="screen">',
  "  :root { --bg: #f2f2f7; }",
  "  .card { padding: 13px; color: var(--text); }",
  "  /* .old { color: #123456; } */",
  "</STYLE>",
  '<p style="color: #d70015; margin: 7px">Hi</p>',
  '<!-- <p style="color: #abcdef">old</p> -->',
  `<div data-style="x" data-label="Room #101" title="a > b" style='background: rgb(1 2 3)'></div>`,
  "<script>",
  '  const accent = "#2959ae";',
  "  const markup = 'style=\"color: #aaaaaa\"';",
  "</script>",
  '<p class="p-7 text-gray-500">Plain class names</p>',
].join("\n");

describe("the CSS inside an HTML page", () => {
  test("is read as CSS where it is: <style> blocks and style=\"\" attributes, at exact positions", () => {
    const hits = hitsOf(PAGE);
    const colours = hits.filter((h) => h.rule === "raw-color").map((h) => h.text);
    expect(colours.sort()).toEqual(["#2959ae", "#aaaaaa", "#d70015", "#f2f2f7", "rgb(1 2 3)"].sort());
    for (const needle of ["#f2f2f7", "#d70015", "rgb(1 2 3)", "#2959ae"]) {
      expect(hits.find((h) => h.text === needle)).toMatchObject(at(PAGE, needle));
    }
    const offScale = hits.filter((h) => h.rule === "off-scale").map((h) => [h.text, h.line]);
    expect(offScale).toEqual([["13px", 5], ["7px", 8]]);
  });

  test("leaves out comments, the theme-color tag, prose and look-alike attributes, and counts nothing twice", () => {
    const texts = hitsOf(PAGE).map((h) => h.text);
    for (const absent of ["#000000", "#123456", "#abcdef", "#101"]) expect(texts).not.toContain(absent);
    expect(new Set(hitsOf(PAGE).map((h) => `${h.rule}|${h.line}|${h.column}`)).size).toBe(hitsOf(PAGE).length);
  });

  test("class names in a plain page aren't Tailwind", () => {
    expect(hitsOf(PAGE).filter((h) => h.rule.startsWith("tailwind"))).toEqual([]);
  });

  test("both views keep the file's length and line breaks; an attribute's quotes become semicolons", () => {
    const html = '<p style="a:b">\n<i>';
    const { css, rest } = htmlViews(html);
    expect(css).toBe('         ;a:b; \n   ');
    expect(rest).toBe('<p style="   ">\n<i>');
    const big = htmlViews(PAGE);
    expect(big.css.length).toBe(PAGE.length);
    expect(big.rest.split("\n").length).toBe(PAGE.split("\n").length);
  });

  test("an unclosed <style> is read to the end, without failing", () => {
    expect(hitsOf("<style>\na { color: red").map((h) => h.text)).toEqual(["red"]);
  });

  test("other files pass through, and .htm counts as HTML", () => {
    const css: SourceFile = { path: "a.css", abs: "/a.css", text: "a{color:red}", lang: "css" };
    expect(expandHtml([css])).toEqual([css]);
    const root = makeProject({ "old.htm": "<p style=\"color: #c0ffee\"></p>" });
    const files = expandHtml(listSourceFiles(root, "."));
    expect(files.map((f) => [f.path, f.lang])).toEqual([["old.htm", "css"], ["old.htm", "markup"]]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/check-html.test.ts`
Expected: FAIL — `Cannot find module '../src/check/html'`.

- [ ] **Step 3: Write `cli/src/check/html.ts`**

```ts
// Reading HTML for check and extract: the CSS in <style> blocks and style="" attributes, and everything else, as two
// views the length of the file. Every rule runs unchanged on them, and positions stay exact.
import type { SourceFile } from "./files";

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(?:<\/style\s*>|$)/gi;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi;
// A start tag; quoted attribute values may hold ">".
const TAG = /<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
const STYLE_ATTR = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/gi;

function blank(chars: string[], from: number, to: number): void {
  for (let i = from; i < to; i++) if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
}

export function htmlViews(text: string): { css: string; rest: string } {
  // Comments hide what's inside them from both views.
  const open = text.split("");
  for (const m of text.matchAll(COMMENT)) blank(open, m.index!, m.index! + m[0].length);
  const uncommented = open.join("");

  const keep: [number, number][] = [];
  // In the CSS view, each attribute's quotes become ";" so its declarations never run into another region's.
  const separators: number[] = [];
  for (const m of uncommented.matchAll(STYLE_BLOCK)) {
    const start = m.index! + m[1]!.length;
    keep.push([start, start + m[2]!.length]);
  }
  // style="" only in tags: not inside <style> or <script> blocks.
  const tagsOnly = uncommented.split("");
  for (const m of uncommented.matchAll(STYLE_BLOCK)) blank(tagsOnly, m.index!, m.index! + m[0].length);
  for (const m of uncommented.matchAll(SCRIPT_BLOCK)) blank(tagsOnly, m.index!, m.index! + m[0].length);
  const tags = tagsOnly.join("");
  for (const t of tags.matchAll(TAG)) {
    for (const a of t[0].matchAll(STYLE_ATTR)) {
      const quote = t.index! + a.index! + a[1]!.length;
      const value = a[3] ?? a[4] ?? "";
      keep.push([quote + 1, quote + 1 + value.length]);
      separators.push(quote, quote + 1 + value.length);
    }
  }

  const inCss = new Uint8Array(text.length);
  for (const [a, b] of keep) inCss.fill(1, a, b);
  const css = uncommented.split("");
  const rest = uncommented.split("");
  for (let i = 0; i < text.length; i++) {
    if (css[i] === "\n" || css[i] === "\r") continue;
    if (inCss[i]) rest[i] = " ";
    else css[i] = " ";
  }
  for (const s of separators) css[s] = ";";
  return { css: css.join(""), rest: rest.join("") };
}

const HTML_FILE = /\.html?$/i;

/** Each HTML file becomes two with the same path: its CSS, read as CSS, and the rest (markup and scripts). */
export function expandHtml(files: SourceFile[]): SourceFile[] {
  return files.flatMap((f) => {
    if (f.lang !== "markup" || !HTML_FILE.test(f.path)) return [f];
    const { css, rest } = htmlViews(f.text);
    return [{ ...f, text: css, lang: "css" as const }, { ...f, text: rest, lang: "markup" as const }];
  });
}
```

- [ ] **Step 4: `.htm` and the Tailwind switch**

In `cli/src/check/files.ts`, in `LANGS`, replace `".html": "markup", ".mdx": "markup",` with `".html": "markup", ".htm": "markup", ".mdx": "markup",`.

In `cli/src/check/run.ts`, replace `scanFile` with:
```ts
export function scanFile(file: SourceFile, scale: Scale | null, opts: { tailwind?: boolean } = {}): Hit[] {
  const tailwind = opts.tailwind ?? true;
  return [
    ...scanColors(file),
    ...(tailwind ? [...scanTailwind(file, scale), ...scanTailwindScale(file, scale)] : []),
    ...scanValues(file, scale),
  ];
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/check-html.test.ts test/check-basics.test.ts test/rule-colors.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/check/html.ts cli/src/check/files.ts cli/src/check/run.ts cli/test/check-html.test.ts
git commit -m "feat(check): read the CSS inside HTML pages as CSS, at exact positions" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `motif check` on plain web sites

**Files:**
- Modify: `cli/src/check/run.ts` (`checkApp`), `cli/src/commands/check.ts`
- Test: `cli/test/check-plain.test.ts`

**Interfaces:**
- Consumes: `siteDir`, `ADAPTERS_AVAILABLE` (Task 1); `expandHtml`, `scanFile(…, { tailwind })` (Task 2); `motifCss(theme)` (`cli/src/stacks/react-web/generate.ts`).
- Produces: `checkApp` handles `plain-web` (its generated file is `<site>/motif.css`; HTML read through `expandHtml` for every stack; Tailwind rules off; fixes in plain CSS terms). `runCheck` accepts plain web apps.

- [ ] **Step 1: Write the failing test**

`cli/test/check-plain.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { runCheck } from "../src/commands/check";
import type { ExceptionHit } from "../src/check/run";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { motifCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const theme = buildTheme(docFrom(validTokens()));
const site = (files: Record<string, string>) => makeProject({ "design/tokens.json": JSON.stringify(validTokens()), ...files });
type Result = { violations: Hit[]; exceptions: ExceptionHit[]; warnings: Hit[]; summary: { files: number } };
const check = async (root: string) => {
  const r = await runCheck(root, { positionals: [] });
  return { code: r.exitCode, text: r.text, ...(r.data as Result) };
};

describe("motif check on a plain web site", () => {
  test("reads CSS in <style> and style=\"\" with exact lines; class names aren't Tailwind; fixes speak plain CSS", async () => {
    const r = await check(site({
      "public/index.html": [
        "<!doctype html>",
        "<html><head><style>",
        "  .card { color: #c0ffee; }",
        "</style></head>",
        '<body><p class="p-7 text-gray-500" style="margin: 7px">Hi</p></body></html>',
      ].join("\n"),
    }));
    expect(r.violations.map((v) => [v.rule, v.text, v.file, v.line])).toEqual([
      ["raw-color", "#c0ffee", "public/index.html", 3],
      ["off-scale", "7px", "public/index.html", 5],
    ]);
    expect(r.violations[0]!.fix).toContain("var(--motif-color-");
    expect(r.violations[0]!.fix).not.toContain("class");
    expect(r.summary.files).toBe(1);
  });

  test("the page's own variables, defined from roles, are theme values; one set to a literal isn't", async () => {
    const r = await check(site({
      "public/index.html": [
        "<style>",
        ":root { --bg: var(--motif-color-background); --muted: #6c6c70; }",
        "body { background: var(--bg); color: var(--muted); }",
        "</style>",
      ].join("\n"),
    }));
    expect(r.violations.map((v) => [v.rule, v.text, v.line])).toEqual([["raw-color", "#6c6c70", 2]]);
  });

  test("motif-ok in an HTML comment allows a value, with its reason", async () => {
    const r = await check(site({
      "public/index.html": "<!-- motif-ok: card colours are the user's own data -->\n<div style=\"background: #C9D5B8\"></div>\n",
    }));
    expect(r.violations).toEqual([]);
    expect(r.exceptions.map((e) => [e.text, e.reason])).toEqual([["#C9D5B8", "card colours are the user's own data"]]);
  });

  test("reduced motion: reported until the generated motif.css is there; editing that file by hand is reported", async () => {
    const PAGE = "<style>button { transition: opacity var(--motif-duration-fast) var(--motif-easing-standard); }</style>\n";
    const bare = await check(site({ "public/index.html": PAGE }));
    expect(bare.violations.map((v) => v.rule)).toEqual(["reduced-motion"]);

    const linked = await check(site({ "public/index.html": PAGE, "public/motif.css": motifCss(theme) }));
    expect(linked.violations).toEqual([]);
    expect(linked.warnings).toEqual([]);

    const edited = await check(site({ "public/index.html": PAGE, "public/motif.css": `${motifCss(theme)}\n.x { color: red; }\n` }));
    expect(edited.violations).toEqual([]);
    expect(edited.warnings.map((w) => [w.rule, w.file])).toEqual([["generated-edited", "public/motif.css"]]);
  });

  test("a site at the root: its motif.css is at the root", async () => {
    const r = await check(site({ "index.html": "<p></p>", "motif.css": `${motifCss(theme)}/* edited */\n` }));
    expect(r.warnings.map((w) => w.file)).toEqual(["motif.css"]);
  });

  test("names both stacks it reads when it can't read an app", async () => {
    const r = await check(site({ "package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "src/App.vue": "" }));
    expect(r.code).toBe(2);
    expect(r.text).toContain("React web apps and plain web sites");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/check-plain.test.ts`
Expected: FAIL — `runCheck` reports the plain site as unsupported (exit 2), so the first expectations fail.

- [ ] **Step 3: Teach `checkApp` plain web (`cli/src/check/run.ts`)**

Add imports:
```ts
import { siteDir } from "../detect/stacks";
import type { GeneratedFile } from "../generate/header";
import { chooseSrcDir, detectTailwind, generateReactWeb, motifCss } from "../stacks/react-web/generate";
import { expandHtml } from "./html";
```
(replace the existing `chooseSrcDir, detectTailwind, generateReactWeb` import with the one above).

Add above `checkApp`:
```ts
/** Plain web fixes speak CSS: there are no utility classes on a plain site. */
function plainFix(hit: Hit): string {
  if (hit.rule === "raw-color") return "Use var(--motif-color-<role>), or one of your own variables defined from it (--bg: var(--motif-color-background)).";
  if (hit.rule === "raw-font") return "Use var(--motif-font-<role>-family).";
  if (hit.rule === "off-scale" && hit.kind === "radius") return "Use var(--motif-radius-<role>).";
  if (hit.rule === "off-scale" && hit.kind === "font-size") return "Use var(--motif-font-<role>-size).";
  return hit.fix;
}
```

Replace the body of `checkApp` up to the `return` with:
```ts
export function checkApp(root: string, app: AppInfo, theme: Theme, opts: { paths?: string[]; ignore?: string[] } = {}): AppCheck {
  const appDir = join(root, app.path);
  const plain = app.stack === "plain-web";
  const srcDir = plain ? siteDir(root, app) : (app.srcDir ?? chooseSrcDir(appDir));
  const scale = buildScale(theme, srcDir);
  const generatedHere: GeneratedFile[] = plain
    ? [{ path: srcDir === "." ? "motif.css" : `${srcDir}/motif.css`, content: motifCss(theme) }]
    : generateReactWeb(theme, { srcDir, tailwind: detectTailwind(appDir) });
  const expected = generatedHere.map((f) => ({ path: prefixPath(app.path, f.path), content: f.content }));

  // App-wide rules need the whole app even when the scan is narrowed to some paths.
  const all = listSourceFiles(root, app.path, { ignore: opts.ignore });
  const generated = all.filter((f) => isMotifGenerated(f.path, f.text));
  const appFiles = all.filter((f) => !isMotifGenerated(f.path, f.text));
  const wanted = opts.paths ?? [];
  const files = appFiles.filter((f) => matchesPaths(f.path, wanted));
  const inScope = new Set(files.map((f) => f.path));
  // Exceptions are read from the files as written, not from their HTML views.
  const lines = new Map(files.map((f) => [f.path, f.text.split(/\r?\n/)]));

  const violations: Hit[] = [];
  const exceptions: ExceptionHit[] = [];
  const appWide = reducedMotionHits(expandHtml(appFiles), expandHtml(generated)).filter((h) => inScope.has(h.file));
  const scanned = expandHtml(files).flatMap((f) => scanFile(f, scale, { tailwind: !plain }));
  for (const found of [...scanned, ...appWide]) {
    if (!found.violation) continue;
    const hit = plain ? { ...found, fix: plainFix(found) } : found;
    const ex = exceptionFor(lines.get(hit.file) ?? [], hit.line);
    if (ex && "reason" in ex) exceptions.push({ ...hit, reason: ex.reason });
    else if (ex) violations.push({ ...hit, fix: `${hit.fix} (A "motif-ok" comment needs a reason, e.g. "motif-ok: required by the partner's brand guide".)` });
    else violations.push(hit);
  }
```
(the `return { … }` that follows is unchanged).

- [ ] **Step 4: Accept plain web in `cli/src/commands/check.ts`**

Add `ADAPTERS_AVAILABLE` to the import from `../detect/stacks`. Replace
```ts
  const supported = apps.filter((a) => a.stack === "react-web");
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    return {
      command: "check",
      exitCode: 2,
      text: `motif check works on React web apps in this version.${others.length ? ` Found: ${others.join(", ")}.` : " No React web app was found here."} Support for more stacks is coming soon.`,
```
with
```ts
  const supported = apps.filter((a) => a.stack !== null && ADAPTERS_AVAILABLE.includes(a.stack));
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    return {
      command: "check",
      exitCode: 2,
      text: `motif check works on React web apps and plain web sites in this version.${others.length ? ` Found: ${others.join(", ")}.` : " Neither was found here."} Support for more stacks is coming soon.`,
```
and replace
```ts
  const skipped = apps.filter((a) => a.stack !== "react-web").map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
```
with
```ts
  const skipped = apps.filter((a) => !supported.includes(a)).map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/check-plain.test.ts test/check-command.test.ts test/rule-app.test.ts test/fixtures-contract.test.ts test/fixtures-seeded.test.ts && bun run typecheck`
Expected: PASS; typecheck clean. (The React fixtures still report exactly what they did.)

- [ ] **Step 6: Commit**

```bash
git add cli/src/check/run.ts cli/src/commands/check.ts cli/test/check-plain.test.ts
git commit -m "feat(check): check plain web sites, their own variables, motif-ok in HTML and their generated motif.css" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `motif tokens` for plain web

**Files:**
- Modify: `cli/src/commands/tokens.ts`, `cli/src/generate/fallback.ts`
- Test: `cli/test/tokens-plain.test.ts`

**Interfaces:**
- Consumes: `siteDir` (Task 1); `motifCss` (existing).
- Produces: `flatTokensFile(theme: Theme): GeneratedFile` (`cli/src/generate/fallback.ts`); `runTokens` writes `<site>/motif.css` and `design/generated/tokens.flat.json` for plain web apps, records `srcDir` in `design/motif.json`, and says how to link the stylesheet unless a page already does.

- [ ] **Step 1: Write the failing test**

`cli/test/tokens-plain.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { CSS_HEADER } from "../src/generate/header";
import { buildTheme } from "../src/generate/theme";
import { motifCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const theme = buildTheme(docFrom(validTokens()));
const site = (files: Record<string, string>) => makeProject({ "design/tokens.json": JSON.stringify(validTokens()), ...files });
const run = async (root: string) => {
  const r = await runTokens(root, { positionals: [] });
  return { code: r.exitCode, files: r.data.files as { path: string; status: string }[], notes: r.data.notes as string[] };
};

describe("motif tokens on a plain web site", () => {
  test("writes motif.css in the site folder and the flat values, records the folder, and says how to link it", async () => {
    const root = site({ "public/index.html": "<!doctype html><title>Site</title>" });
    const r = await run(root);
    expect(r.code).toBe(0);
    expect(r.files).toEqual([
      { path: "public/motif.css", status: "created" },
      { path: "design/generated/tokens.flat.json", status: "created" },
      { path: "design/motif.json", status: "created" },
    ]);
    const css = readFileSync(join(root, "public/motif.css"), "utf8");
    expect(css).toBe(motifCss(theme));
    expect(css.startsWith(CSS_HEADER)).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "plain-web", srcDir: "public" }]);
    expect(r.notes.join("\n")).toContain('<link rel="stylesheet" href="motif.css">');
  });

  test("no wiring note once a page links it; a site at the root gets motif.css at the root", async () => {
    const linked = await run(site({ "index.html": '<link rel="stylesheet" href="motif.css">' }));
    expect(linked.files[0]).toEqual({ path: "motif.css", status: "created" });
    expect(linked.notes.join("\n")).not.toContain("Next:");
  });

  test("the flat values are written once when another app also needs them", async () => {
    const r = await run(site({
      "apps/site/public/index.html": "",
      "apps/mobile/pubspec.yaml": "name: m\ndependencies:\n  flutter:\n    sdk: flutter\n",
    }));
    expect(r.files.filter((f) => f.path === "design/generated/tokens.flat.json")).toHaveLength(1);
    expect(r.files.map((f) => f.path)).toContain("apps/site/public/motif.css");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/tokens-plain.test.ts`
Expected: FAIL — plain web falls into "support is coming soon": `design/generated/motif.css` is written instead of `public/motif.css`.

- [ ] **Step 3: `flatTokensFile` in `cli/src/generate/fallback.ts`**

Replace `generateFallback` with:
```ts
export function flatTokensFile(theme: Theme): GeneratedFile {
  return { path: `${FALLBACK_DIR}/tokens.flat.json`, content: JSON.stringify(flatTokens(theme), null, 2) + "\n" };
}

export function generateFallback(theme: Theme): GeneratedFile[] {
  return [{ path: `${FALLBACK_DIR}/motif.css`, content: motifCss(theme) }, flatTokensFile(theme)];
}
```

- [ ] **Step 4: Plain web in `cli/src/commands/tokens.ts`**

Imports: add `siteDir` to the import from `../detect/stacks`; change `import { generateFallback } from "../generate/fallback";` to `import { flatTokensFile, generateFallback } from "../generate/fallback";`; change the react-web import to `import { chooseSrcDir, detectTailwind, generateReactWeb, motifCss } from "../stacks/react-web/generate";`.

Let `isReferenced` see HTML pages: replace `const CODE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs)$/;` with `const CODE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs|html?)$/;`.

In `updateSettings`, replace `if (a?.stack === "react-web" && typeof a.srcDir !== "string" && srcDirs.has(a.path)) {` with `if ((a?.stack === "react-web" || a?.stack === "plain-web") && typeof a.srcDir !== "string" && srcDirs.has(a.path)) {`.

In `runTokens`, after `let needsFallback = false;` add:
```ts
  let needsFlat = false;
  const links: { dir: string; path: string }[] = [];
```
and add a branch before `} else if (app.stack) {`:
```ts
    } else if (app.stack === "plain-web") {
      const site = siteDir(cwd, app);
      srcDirs.set(app.path, site);
      const cssPath = prefixPath(app.path, site === "." ? "motif.css" : `${site}/motif.css`);
      files.push({ path: cssPath, content: motifCss(theme) });
      links.push({ dir: join(appDir, site), path: cssPath });
      needsFlat = true;
```
Replace `if (needsFallback) files.push(...generateFallback(theme));` with:
```ts
  if (needsFallback) files.push(...generateFallback(theme));
  else if (needsFlat) files.push(flatTokensFile(theme));
```
After the existing `for (const e of entries) { … }` wiring loop, add:
```ts
  for (const l of links) {
    if (blockedPaths.has(l.path) || isReferenced(l.dir, "motif.css")) continue;
    notes.push(`Next: link ${l.path} in each page's <head>, before your own styles: <link rel="stylesheet" href="motif.css"> (write the path relative to the page).`);
  }
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/tokens-plain.test.ts test/tokens-command.test.ts test/fallback.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/tokens.ts cli/src/generate/fallback.ts cli/test/tokens-plain.test.ts
git commit -m "feat(tokens): plain web sites get motif.css in their site folder, and how to link it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Knowing which colours are dark-mode colours

**Files:**
- Create: `cli/src/check/dark.ts`
- Modify: `cli/src/check/types.ts` (`Hit`), `cli/src/check/rules/colors.ts`
- Test: `cli/test/dark.test.ts`

**Interfaces:**
- Consumes: `maskComments`, `inRanges` (`cli/src/check/mask.ts`).
- Produces:
  - `darkRanges(css: string): [number, number][]` — the `[start, end)` ranges of a stylesheet that apply in dark mode.
  - `Hit.prop?: string` (set on colour hits in CSS custom properties: the variable's name) and `Hit.scheme?: "dark"` (set on colour hits in CSS inside a dark range).

- [ ] **Step 1: Write the failing test**

`cli/test/dark.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { darkRanges } from "../src/check/dark";
import type { SourceFile } from "../src/check/files";
import { inRanges } from "../src/check/mask";
import { scanColors } from "../src/check/rules/colors";

const CSS = [
  ":root { --bg: #f2f2f7; }",
  "@media (prefers-color-scheme: dark) {",
  "  :root:not([data-theme=light]) { --bg: #000000; }",
  "}",
  ':root[data-theme="dark"] { --bg: #111111; }',
  "html.dark .card { color: #222222; }",
  ".dark-mode { color: #333333; }",
  "@media (prefers-color-scheme: light) { :root { --bg: #fafafa; } }",
  "@media (min-width: 600px) { [data-mode=dark] a { color: #444444 } }",
  "[data-theme=light] { --bg: #555555; }",
].join("\n");

const file = (text: string): SourceFile => ({ path: "a.css", abs: "/a.css", text, lang: "css" });

describe("dark-mode blocks", () => {
  test("found however they're written, and look-alikes left out", () => {
    const ranges = darkRanges(CSS);
    const isDark = (needle: string) => inRanges(CSS.indexOf(needle), ranges);
    for (const dark of ["#000000", "#111111", "#222222", "#444444"]) expect(isDark(dark)).toBe(true);
    for (const light of ["#f2f2f7", "#333333", "#fafafa", "#555555"]) expect(isDark(light)).toBe(false);
  });

  test("colour hits in CSS say whether they're dark, and which variable they set", () => {
    const hits = scanColors(file(CSS));
    const byText = Object.fromEntries(hits.map((h) => [h.text, { prop: h.prop, scheme: h.scheme }]));
    expect(byText["#f2f2f7"]).toEqual({ prop: "--bg", scheme: undefined });
    expect(byText["#000000"]).toEqual({ prop: "--bg", scheme: "dark" });
    expect(byText["#222222"]).toEqual({ prop: undefined, scheme: "dark" });
    expect(byText["#333333"]).toEqual({ prop: undefined, scheme: undefined });
  });

  test("nothing changes for scripts, and an unclosed block runs to the end", () => {
    const script: SourceFile = { path: "a.ts", abs: "/a.ts", text: 'const c = "#123456";', lang: "script" };
    expect(scanColors(script).map((h) => [h.prop, h.scheme])).toEqual([[undefined, undefined]]);
    expect(darkRanges(".dark { color: #000")).toEqual([[6, 19]]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/dark.test.ts`
Expected: FAIL — `Cannot find module '../src/check/dark'`.

- [ ] **Step 3: Write `cli/src/check/dark.ts`**

```ts
// The parts of a stylesheet that apply in dark mode: inside @media (prefers-color-scheme: dark), and rules whose selector
// asks for dark ([data-theme="dark"], [data-mode=dark], .dark). Extract reads a colour's dark value from them.
const DARK_MEDIA = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/gi;
const DARK_SELECTOR = /\[data-(?:theme|mode|color-scheme)\s*=\s*["']?dark["']?\]|\.dark(?![\w-])/;

/** Just past the "}" that closes the block opened at `open` (a "{"), or the end of the text. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  return css.length;
}

export function darkRanges(css: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of css.matchAll(DARK_MEDIA)) {
    const open = m.index! + m[0].length - 1;
    ranges.push([open, blockEnd(css, open)]);
  }
  // A rule's selector runs from the previous "{", "}" or ";" to its "{".
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;
    let s = i - 1;
    while (s >= 0 && css[s] !== "{" && css[s] !== "}" && css[s] !== ";") s--;
    const selector = css.slice(s + 1, i).trim();
    if (!selector.startsWith("@") && DARK_SELECTOR.test(selector)) ranges.push([i, blockEnd(css, i)]);
  }
  return ranges;
}
```

- [ ] **Step 4: The two new hit fields**

In `cli/src/check/types.ts`, inside `interface Hit`, after `context?: string;`, add:
```ts
  /** For colours set on a CSS custom property: its name (--bg). */
  prop?: string;
  /** "dark" for colours set inside a dark-mode block. */
  scheme?: "dark";
```

In `cli/src/check/rules/colors.ts`, add the imports `import { darkRanges } from "../dark";` and add `inRanges` is already imported from `../mask`. Replace the `add` helper and the CSS branch:
```ts
  const add = (index: number, literal: string, context: string, extra: Pick<Hit, "prop" | "scheme"> = {}) =>
    hits.push(makeHit(file, at, index, {
      rule: "raw-color",
      text: literal,
      value: literal,
      kind: "color",
      context,
      ...extra,
      violation: true,
      message: `Raw colour ${literal}.`,
      fix: "Use a theme colour instead: a class like bg-action-primary or text-text-primary, or var(--motif-color-<role>).",
    }));

  if (file.lang === "css") {
    const dark = darkRanges(file.text);
    for (const m of file.text.matchAll(CSS_DECLARATION)) {
      const prop = m[1]!;
      const value = m[2]!;
      if (prop.startsWith("--motif-")) continue;
      const start = m.index! + m[0].length - value.length;
      const context = colorContext(prop);
      const extra: Pick<Hit, "prop" | "scheme"> = {
        ...(prop.startsWith("--") ? { prop } : {}),
        ...(inRanges(start, dark) ? { scheme: "dark" as const } : {}),
      };
      for (const c of value.matchAll(CSS_COLOR_LITERAL)) add(start + c.index!, c[0], context, extra);
      if (CSS_COLOR_PROP.test(prop)) for (const n of value.matchAll(CSS_NAMED)) add(start + n.index!, n[0], context, extra);
    }
    return hits.sort((a, b) => a.line - b.line || a.column - b.column);
  }
```

- [ ] **Step 5: Run the tests to see them pass**

Run (from `cli/`): `bun test test/dark.test.ts test/rule-colors.test.ts test/check-command.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/check/dark.ts cli/src/check/types.ts cli/src/check/rules/colors.ts cli/test/dark.test.ts
git commit -m "feat(check): colour hits say which variable they set and whether they're in a dark-mode block" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `motif extract` on plain web, with real dark-mode colours

**Files:**
- Modify: `cli/src/extract/draft.ts`, `cli/src/commands/extract.ts`, `cli/src/commands/check.ts` (no-guide message)
- Test: `cli/test/extract-plain.test.ts`

**Interfaces:**
- Consumes: `Hit.prop`, `Hit.scheme` (Task 5); `expandHtml`, `scanFile(…, { tailwind })` (Task 2); `ADAPTERS_AVAILABLE` (Task 1); `parseColor` (`cli/src/extract/cluster.ts`).
- Produces:
  - `interface Variable { name: string; light?: string; dark?: string }`; `Occurrences.variables?: Variable[]`.
  - `collectOccurrences(files, tw, tailwindFor?: (f: SourceFile) => boolean)` — dark-mode colours don't enter the light clustering.
  - `buildDraft` gives a role a real dark value when one of its colours is a variable with a dark value; `ExtractReport.variables: { name; light?; dark?; role? }[]`.

- [ ] **Step 1: Write the failing test**

`cli/test/extract-plain.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runExtract } from "../src/commands/extract";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const XBLOOM_LIKE = [
  "<!doctype html><style>",
  "  :root { --bg: #f2f2f7; --surface: #ffffff; --text: #000000; --accent: #2959ae; }",
  "  @media (prefers-color-scheme: dark) {",
  "    :root:not([data-theme=light]) { --bg: #000000; --surface: #1c1c1e; --text: #ffffff; --accent: #90b2df; }",
  "  }",
  "  :root[data-theme=dark] { --bg: #000000; --surface: #1c1c1e; --text: #ffffff; --accent: #90b2df; }",
  "  body { background: var(--bg); color: var(--text); }",
  "</style>",
].join("\n");

const read = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));
/** A role's hex in light or dark mode, through its primitive. */
const hex = (tokens: any, role: string, mode: "light" | "dark") => {
  const t = tokens.color[role];
  const alias: string = mode === "dark" ? t.$extensions["dev.motif"].modes.dark : t.$value;
  return tokens.primitive.color[alias.match(/^\{primitive\.color\.(.+)\}$/)![1]!].$value.hex;
};

describe("motif extract on a plain web site", () => {
  test("drafts a guide from the CSS in the page, with dark values from its dark-mode blocks", async () => {
    const root = makeProject({ "public/index.html": XBLOOM_LIKE });
    const r = await runExtract(root, { positionals: [] });
    expect(r.exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "background", "light"), hex(tokens, "background", "dark")]).toEqual(["#F2F2F7", "#000000"]);
    expect([hex(tokens, "surface", "light"), hex(tokens, "surface", "dark")]).toEqual(["#FFFFFF", "#1C1C1E"]);
    expect(hex(tokens, "text-primary", "dark")).toBe("#FFFFFF");
    expect(hex(tokens, "action-primary", "dark")).toBe("#90B2DF");
    const report = read(root, "design/extract-report.json");
    expect(report.variables).toContainEqual({ name: "--bg", light: "#f2f2f7", dark: "#000000", role: "color.background" });
    expect(report.variables).toContainEqual({ name: "--accent", light: "#2959ae", dark: "#90b2df", role: "color.action-primary" });
    expect(report.notes.join("\n")).toMatch(/came from your CSS for .*background/);
  });

  test("React apps get real dark values too (a .dark block)", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "15", react: "19" } }),
      "src/app/globals.css": ":root { --background: #ffffff; --foreground: #09090b; }\n.dark { --background: #09090b; --foreground: #fafafa; }\n",
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "background", "light"), hex(tokens, "background", "dark")]).toEqual(["#FFFFFF", "#09090B"]);
  });

  test("with no dark-mode blocks, dark copies light and says so", async () => {
    const root = makeProject({ "index.html": "<style>body { background: #fafafa; color: #111111; }</style>" });
    await runExtract(root, { positionals: [] });
    expect(read(root, "design/extract-report.json").notes.join("\n")).toContain("Dark-mode colours were copied from light mode");
  });

  test("on a stack it can't read yet, extract and check point at the review instead of a dead end", async () => {
    const vue = makeProject({ "package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "src/App.vue": "" });
    const e = await runExtract(vue, { positionals: [] });
    expect(e.exitCode).toBe(2);
    expect(e.text).toContain("React web apps and plain web sites");
    expect(e.text).toContain("review");
    const c = await runCheck(vue, { positionals: [] });
    expect(c.text).toContain("Start one with /design");
    expect(c.text).not.toContain("motif extract");
    const plain = await runCheck(makeProject({ "index.html": "" }), { positionals: [] });
    expect(plain.text).toContain("motif extract");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/extract-plain.test.ts`
Expected: FAIL — extract refuses the plain site ("works on React web apps in this version").

- [ ] **Step 3: Variables and dark colours in `collectOccurrences` (`cli/src/extract/draft.ts`)**

Imports: change `import { wcagContrast } from "culori";` to `import { formatHex, wcagContrast } from "culori";` and `import { clusterColors, type ColorCluster, type Sample } from "./cluster";` to `import { clusterColors, parseColor, type ColorCluster, type Sample } from "./cluster";`.

After `export interface Occurrences { … }`'s `unresolved: Sample[];` line, add (inside the interface):
```ts
  /** Custom properties set to colours: their light value, and their dark-mode value when one is set. */
  variables?: Variable[];
```
and above the interface:
```ts
export interface Variable { name: string; light?: string; dark?: string }
```
Add to `ExtractReport` (after `unresolved: Sample[];`):
```ts
  variables: { name: string; light?: string; dark?: string; role?: string }[];
```

Change `collectOccurrences`' signature and loop head:
```ts
export function collectOccurrences(files: SourceFile[], tw: TailwindDefaults | null, tailwindFor: (f: SourceFile) => boolean = () => true): Occurrences {
```
After the `sized` helper, add `const variables = new Map<string, Variable>();` and replace
```ts
  for (const file of files) {
    for (const hit of scanFile(file, null)) {
      switch (hit.kind) {
```
with
```ts
  for (const file of files) {
    for (const hit of scanFile(file, null, { tailwind: tailwindFor(file) })) {
      if (hit.kind === "color" && hit.prop) {
        const v = variables.get(hit.prop) ?? { name: hit.prop };
        if (hit.scheme === "dark") v.dark ??= hit.value;
        else v.light ??= hit.value;
        variables.set(hit.prop, v);
      }
      // Dark-mode colours give roles their dark values (buildDraft); they don't compete with the light ones.
      if (hit.kind === "color" && hit.scheme === "dark") continue;
      switch (hit.kind) {
```
and in the returned object add `variables: [...variables.values()],`.

- [ ] **Step 4: Pair dark values in `buildDraft`**

Add above `export function buildDraft`:
```ts
const BASE_ROLES = ["text-primary", "text-secondary", "background", "surface", "border", "action-primary", "success", "warning", "danger", "info"];

/** A colour as #RRGGBB, or undefined when it can't be read. */
function hexIfColor(value: string | undefined): string | undefined {
  const c = value ? parseColor(value) : undefined;
  return c ? formatHex(c)?.toUpperCase() : undefined;
}
```
In `buildDraft`, replace `for (const role of ["text-primary", "text-secondary", "background", "surface", "border", "action-primary", "success", "warning", "danger", "info"]) {` with `for (const role of BASE_ROLES) {`.

After `roles["color.focus"] = roles["color.action-primary"]!;`, add:
```ts
  // Dark values from the CSS: a colour variable set in a light block and in a dark block gives its role a real dark value.
  const inCluster = (cluster: ColorCluster | undefined, value: string | undefined) =>
    Boolean(cluster && value && cluster.members.some((m) => hexIfColor(m.value) === hexIfColor(value)));
  const darkBase: Record<string, string> = {};
  for (const role of BASE_ROLES) {
    const v = (occ.variables ?? []).find((x) => hexIfColor(x.dark) && inCluster(chosen[role], x.light));
    if (!v) continue;
    const name = `${chosen[role]!.id}-dark`;
    primitives[name] = { $value: srgbColor(hexIfColor(v.dark)!) };
    darkBase[role] = name;
  }
  if (darkBase.surface) darkBase["surface-raised"] = darkBase["action-secondary"] = darkBase.surface;
  if (darkBase["action-primary"]) darkBase.focus = darkBase["action-primary"];
  if (darkBase.background) darkBase["text-inverse"] = darkBase.background;
  if (darkBase["text-primary"]) darkBase["on-action-secondary"] = darkBase["text-primary"];
  for (const role of ["action-primary", "success", "warning", "danger", "info"]) {
    if (darkBase[role]) darkBase[`on-${role}`] = onColor(hexOf(darkBase[role]!)) === WHITE ? "white" : "ink";
  }
```
Replace the colour loop
```ts
  for (const role of order) {
    const alias = `{primitive.color.${base[role]}}`;
    color[role] = { $value: alias, $extensions: { "dev.motif": { modes: { dark: alias } } } };
  }
```
with
```ts
  for (const role of order) {
    const alias = `{primitive.color.${base[role]}}`;
    const dark = darkBase[role] ? `{primitive.color.${darkBase[role]}}` : alias;
    color[role] = { $value: alias, $extensions: { "dev.motif": { modes: { dark } } } };
  }
```
Replace `const notes = ["Dark-mode colours were copied from light mode. Review them before turning on dark mode."];` with:
```ts
  const darkRoles = Object.keys(darkBase).filter((r) => BASE_ROLES.includes(r));
  const notes = [
    darkRoles.length
      ? `Dark-mode colours came from your CSS for ${darkRoles.join(", ")}; the others were copied from light mode. Review them before turning on dark mode.`
      : "Dark-mode colours were copied from light mode. Review them before turning on dark mode.",
  ];
  const variables = (occ.variables ?? []).filter((v) => v.light).map((v) => {
    const role = BASE_ROLES.find((r) => inCluster(chosen[r], v.light));
    return { name: v.name, light: v.light, ...(v.dark ? { dark: v.dark } : {}), ...(role ? { role: `color.${role}` } : {}) };
  });
  if (variables.length) {
    notes.push(`Your CSS sets ${variables.length} colour ${variables.length === 1 ? "variable" : "variables"}; design/extract-report.json shows the role each matches, so you can define them from Motif's (--bg: var(--motif-color-background)).`);
  }
```
and add `variables,` to the `report` object (after `unresolved,`).

- [ ] **Step 5: Plain web in `cli/src/commands/extract.ts`**

Imports: add `ADAPTERS_AVAILABLE` to the import from `../detect/stacks`; add `import { expandHtml } from "../check/html";` and `import type { SourceFile } from "../check/files";` (keep the existing `listSourceFiles` import).

Replace everything from `const react = apps.filter((a) => a.stack === "react-web");` through `const { tokens, report } = buildDraft(occ);` with:
```ts
  const supported = apps.filter((a) => a.stack !== null && ADAPTERS_AVAILABLE.includes(a.stack));
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    return {
      command: "extract",
      exitCode: 2,
      text: `motif extract works on React web apps and plain web sites in this version.${others.length ? ` Found: ${others.join(", ")}.` : " Neither was found here."} Meanwhile, Motif's review can draft a design guide from your app's code by hand: ask your agent for a design review.`,
      data: { error: "unsupported-stack" },
    };
  }

  const ignore = readIgnorePatterns(cwd);
  const noTailwind = new Set<SourceFile>();
  const files = supported.flatMap((a) => {
    const own = expandHtml(listSourceFiles(cwd, a.path, { ignore }).filter((f) => !isMotifGenerated(f.path, f.text)));
    if (a.stack === "plain-web") for (const f of own) noTailwind.add(f);
    return own;
  });
  const react = supported.filter((a) => a.stack === "react-web");
  const tw = readTailwindDefaults([...react.map((a) => join(cwd, a.path)), cwd]);
  const occ = collectOccurrences(files, tw, (f) => !noTailwind.has(f));
  const { tokens, report } = buildDraft(occ);
```
and replace
```ts
  const skipped = apps.filter((a) => a.stack !== "react-web").map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
```
with
```ts
  const skipped = apps.filter((a) => !supported.includes(a)).map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
```

- [ ] **Step 6: No dead end in `motif check` without a guide (`cli/src/commands/check.ts`)**

Replace the first `if (!existsSync(tokensPath)) { … }` block with:
```ts
  if (!existsSync(tokensPath)) {
    const found = detectApps(cwd).apps;
    // extract can't read every stack yet; then the review mode is the way to a first guide.
    const unreadable = found.length > 0 && !found.some((a) => a.stack !== null && ADAPTERS_AVAILABLE.includes(a.stack));
    return {
      command: "check",
      exitCode: 2,
      text: unreadable
        ? "No design guide found in this folder (missing design/tokens.json).\nStart one with /design: Motif's review drafts a design guide from your app's code."
        : "No design guide found in this folder (missing design/tokens.json).\nDraft one from your code with motif extract, or start one with /design.",
      data: { error: "no-contract" },
    };
  }
```

- [ ] **Step 7: Run the tests to see them pass**

Run (from `cli/`): `bun test test/extract-plain.test.ts test/extract-draft.test.ts test/extract-command.test.ts test/extract-basics.test.ts test/check-command.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add cli/src/extract/draft.ts cli/src/commands/extract.ts cli/src/commands/check.ts cli/test/extract-plain.test.ts
git commit -m "feat(extract): plain web sites, and real dark-mode colours from dark blocks on every stack" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `motif shot` serves a plain site itself

**Files:**
- Create: `cli/src/shot/static-server.ts`, `cli/src/stacks/plain-web/routes.ts`
- Modify: `cli/src/preview/server.ts` (export `CONTENT_TYPES`), `cli/src/commands/shot.ts`, `cli/test/shot-command.test.ts` (its stand-in deps)
- Test: `cli/test/shot-plain.test.ts`

**Interfaces:**
- Consumes: `siteDir` (Task 1); `resolveInside` (`cli/src/preview/server.ts`); `RouteDiscovery` (`cli/src/stacks/react-web/routes.ts`).
- Produces:
  - `CONTENT_TYPES: Record<string, string>` exported from `cli/src/preview/server.ts` (the former `TYPES`).
  - `interface StaticServer { url: string; stop(): void }`; `startStaticServer(root: string): StaticServer`.
  - `discoverPlainRoutes(siteDir: string): RouteDiscovery`.
  - `ShotDeps.serveStatic: (root: string) => StaticServer`.

- [ ] **Step 1: Write the failing test**

`cli/test/shot-plain.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import type { CaptureOptions } from "../src/shot/capture";
import { startStaticServer } from "../src/shot/static-server";
import { discoverPlainRoutes } from "../src/stacks/plain-web/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

/** Status (and Location) for a raw request: fetch tidies paths and won't let tests set Host. */
function raw(port: number, path: string, host = `127.0.0.1:${port}`): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    let data = "";
    const socket = connect(port, "127.0.0.1", () => socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
    socket.on("data", (d) => (data += d.toString()));
    socket.on("end", () => resolve({ status: Number(data.split(" ")[1]), location: data.match(/\r\nlocation: ([^\r\n]+)/i)?.[1] }));
    socket.on("error", reject);
  });
}

const SITE = {
  "secret.txt": "outside the site",
  "public/index.html": "<h1>Home</h1>",
  "public/about.html": "<h1>About</h1>",
  "public/blog/index.html": "<h1>Blog</h1>",
  "public/blog/post.html": "<h1>Post</h1>",
  "public/style.css": "body{}",
  "public/.env": "SECRET=1",
  "public/.git/config": "[core]",
};

describe("the static server for plain sites", () => {
  test("serves the site's files and folders' index pages", async () => {
    const root = makeProject(SITE);
    const s = startStaticServer(join(root, "public"));
    try {
      const page = await fetch(`${s.url}/`);
      expect([page.status, await page.text()]).toEqual([200, "<h1>Home</h1>"]);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect((await fetch(`${s.url}/about.html`)).status).toBe(200);
      expect(await (await fetch(`${s.url}/blog/`)).text()).toBe("<h1>Blog</h1>");
      expect((await fetch(`${s.url}/style.css`)).headers.get("content-type")).toContain("text/css");
      const port = Number(new URL(s.url).port);
      expect(await raw(port, "/blog")).toEqual({ status: 301, location: "/blog/" });
      expect((await raw(port, "/missing.html")).status).toBe(404);
    } finally {
      s.stop();
    }
  });

  test("never serves hidden files, anything outside the site folder, or another Host", async () => {
    const root = makeProject(SITE);
    const s = startStaticServer(join(root, "public"));
    try {
      const port = Number(new URL(s.url).port);
      for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/.env", "/.git/config"]) expect((await raw(port, path)).status).toBe(404);
      expect((await raw(port, "/", "evil.example:80")).status).toBe(403);
      expect((await raw(port, "/", `localhost:${port}`)).status).toBe(200);
      expect(s.url).toStartWith("http://127.0.0.1:");
    } finally {
      s.stop();
    }
  });
});

describe("a plain site's pages", () => {
  test("every .html file, index pages as their folder, leaving out hidden folders, packages, build output and design/", () => {
    const root = makeProject({
      "index.html": "", "about.html": "", "blog/index.html": "", "blog/post.html": "", "OLD.HTM": "",
      ".hidden/x.html": "", "node_modules/x/index.html": "", "dist/index.html": "", "design/previews/home.html": "",
    });
    expect(discoverPlainRoutes(root)).toEqual({ routes: ["/", "/OLD.HTM", "/about.html", "/blog/", "/blog/post.html"], skipped: [] });
  });
});

describe("motif shot on a plain site", () => {
  const deps = () => {
    const calls = { served: [] as string[], stopped: 0, captured: [] as CaptureOptions[] };
    const fail = () => {
      throw new Error("a dev server shouldn't be started for a plain site");
    };
    const d: ShotDeps = {
      findBrowser: () => ({ name: "Chrome", path: "/fake/chrome" }),
      devCommand: fail,
      startDevServer: fail,
      serveStatic: (root) => {
        calls.served.push(root);
        return { url: "http://127.0.0.1:5555", stop: () => void calls.stopped++ };
      },
      capture: async (o) => {
        calls.captured.push(o);
        const routes = o.routes.map((route) => ({ route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, `${route === "/" ? "index" : "about"}.mobile.png`)] }));
        for (const shot of routes.flatMap((r) => r.shots)) {
          mkdirSync(dirname(shot), { recursive: true });
          writeFileSync(shot, "png");
        }
        return { routes, issues: [] };
      },
      compare: async () => [],
      today: () => "2026-10-15",
    };
    return { d, calls };
  };

  test("serves the site folder itself, captures its pages, and stops the server", async () => {
    const root = makeProject({ "public/index.html": "", "public/about.html": "" });
    const { d, calls } = deps();
    const r = await runShot(root, { positionals: [], flags: {} }, d);
    expect(r.exitCode).toBe(0);
    expect(calls.served).toEqual([join(root, "public")]);
    expect(calls.captured[0]).toMatchObject({ baseUrl: "http://127.0.0.1:5555", routes: ["/", "/about.html"] });
    expect(calls.stopped).toBe(1);
  });

  test("with --url, uses the running site and still finds the pages from its files", async () => {
    const root = makeProject({ "public/index.html": "", "public/about.html": "" });
    const { d, calls } = deps();
    await runShot(root, { positionals: [], flags: { url: "http://localhost:3000" } }, d);
    expect(calls.served).toEqual([]);
    expect(calls.captured[0]).toMatchObject({ baseUrl: "http://localhost:3000", routes: ["/", "/about.html"] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/shot-plain.test.ts`
Expected: FAIL — `Cannot find module '../src/shot/static-server'`.

- [ ] **Step 3: Export the content types (`cli/src/preview/server.ts`)**

Rename `const TYPES` to `export const CONTENT_TYPES` and every `TYPES[` in the file to `CONTENT_TYPES[` (replace all; there's no other identifier containing `TYPES`).

- [ ] **Step 4: Write `cli/src/shot/static-server.ts`**

```ts
// Serves a plain web site's folder on 127.0.0.1 for screenshots: its own files only, never hidden ones (.env, .git),
// nothing outside it, and only to requests addressed to it.
import { existsSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { CONTENT_TYPES, resolveInside } from "../preview/server";

export interface StaticServer {
  url: string;
  stop(): void;
}

const notFound = () => new Response("Not found", { status: 404 });

export function startStaticServer(root: string): StaticServer {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      const host = req.headers.get("host");
      if (host !== `127.0.0.1:${srv.port}` && host !== `localhost:${srv.port}`) return new Response("Forbidden", { status: 403 });
      const path = new URL(req.url).pathname;
      let file = resolveInside(root, path);
      if (!file || !existsSync(file)) return notFound();
      if (relative(root, file).split(sep).some((part) => part.startsWith("."))) return notFound();
      if (statSync(file).isDirectory()) {
        // A folder's page links relative to the folder, so its address ends with "/".
        if (!path.endsWith("/")) return new Response(null, { status: 301, headers: { location: `${path}/` } });
        file = join(file, "index.html");
        if (!existsSync(file)) return notFound();
      }
      if (!statSync(file).isFile()) return notFound();
      return new Response(Bun.file(file), {
        headers: { "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => void server.stop(true) };
}
```

- [ ] **Step 5: Write `cli/src/stacks/plain-web/routes.ts`**

```ts
// A plain web site's pages: every .html file in its site folder. index.html is its folder's address ("/", "/blog/").
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RouteDiscovery } from "../react-web/routes";

/** Never pages: packages, build output, and (at the top of the site) Motif's own design/ folder. */
const SKIP = new Set(["node_modules", "dist", "build", "out", "coverage"]);

export function discoverPlainRoutes(siteDir: string): RouteDiscovery {
  const routes: string[] = [];
  const visit = (dir: string, prefix: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP.has(name) || (prefix === "" && name === "design")) continue;
      const path = join(dir, name);
      let isDir: boolean;
      try {
        isDir = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (isDir) visit(path, `${prefix}${name}/`);
      else if (/\.html?$/i.test(name)) routes.push(name.toLowerCase() === "index.html" ? `/${prefix}` : `/${prefix}${name}`);
    }
  };
  visit(siteDir, "");
  const rest = [...new Set(routes)].filter((r) => r !== "/").sort();
  return { routes: routes.includes("/") ? ["/", ...rest] : rest, skipped: [] };
}
```

- [ ] **Step 6: Serve and discover plain sites in `cli/src/commands/shot.ts`**

Imports: add `siteDir` to the import from `../detect/stacks`; add
```ts
import { startStaticServer, type StaticServer } from "../shot/static-server";
import { discoverPlainRoutes } from "../stacks/plain-web/routes";
```
In `interface ShotDeps`, add `serveStatic: (root: string) => StaticServer;`, and in `defaultDeps` add `serveStatic: startStaticServer,`.

Replace
```ts
    if (app.stack !== "react-web") {
```
with
```ts
    if (app.stack !== "react-web" && app.stack !== "plain-web") {
```
Replace
```ts
  const appDir = app ? join(cwd, app.path) : cwd;

  const discovery: RouteDiscovery =
    typeof flags.routes === "string"
      ? { routes: parseRoutes(flags.routes), skipped: [] }
      : app?.stack === "react-web"
        ? discoverRoutes(appDir)
        : { routes: ["/"], skipped: [] };
```
with
```ts
  const appDir = app ? join(cwd, app.path) : cwd;
  const siteFolderPath = app?.stack === "plain-web" ? join(appDir, siteDir(cwd, app)) : undefined;

  const discovery: RouteDiscovery =
    typeof flags.routes === "string"
      ? { routes: parseRoutes(flags.routes), skipped: [] }
      : app?.stack === "react-web"
        ? discoverRoutes(appDir)
        : siteFolderPath
          ? discoverPlainRoutes(siteFolderPath)
          : { routes: ["/"], skipped: [] };
```
Replace
```ts
  let server: DevServer | undefined;
  let baseUrl = givenUrl;
  if (!baseUrl) {
```
with
```ts
  let server: DevServer | undefined;
  let site: StaticServer | undefined;
  let baseUrl = givenUrl;
  if (!baseUrl && siteFolderPath) {
    site = deps.serveStatic(siteFolderPath);
    baseUrl = site.url;
  } else if (!baseUrl) {
```
and in the capture's `finally`, replace `await server?.stop();` with:
```ts
    await server?.stop();
    site?.stop();
```

- [ ] **Step 7: Give the existing shot tests' stand-ins a static server**

In `cli/test/shot-command.test.ts`, inside `fakes()`'s `deps` object, after `startDevServer: …,` add:
```ts
    serveStatic: () => ({ url: "http://127.0.0.1:1", stop: () => {} }),
```

- [ ] **Step 8: Run the tests to see them pass**

Run (from `cli/`): `bun test test/shot-plain.test.ts test/shot-command.test.ts test/preview-server.test.ts test/routes.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add cli/src/shot/static-server.ts cli/src/stacks/plain-web/routes.ts cli/src/preview/server.ts cli/src/commands/shot.ts cli/test/shot-plain.test.ts cli/test/shot-command.test.ts
git commit -m "feat(shot): serve plain web sites from their folder and capture every page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `--state`: screenshots of states behind a form or a click

**Files:**
- Modify: `cli/src/shot/capture.ts`, `cli/src/shot/audit.ts`, `cli/src/commands/shot.ts`, `cli/src/cli/output.ts`, `cli/src/main.ts`
- Test: `cli/test/shot-state.test.ts`

**Interfaces:**
- Consumes: `captureScreens`, `CaptureOptions`, `shotName`, `AuditIssue`, `toFindings` (existing).
- Produces:
  - `interface StateScript { name: string; script: string }`; `stateExpression(script: string, timeoutMs?: number): string` (`cli/src/shot/capture.ts`); `CaptureOptions.states?: StateScript[]`.
  - `readStates(cwd: string, value: unknown): StateScript[] | { error: string }` (`cli/src/commands/shot.ts`).
  - `AuditIssue.state?: string`; `ReviewFinding.location.state?: string`.
  - `RunContext.flags` values may be `string[]`; `motif shot --state <file.js>` (repeatable, or a comma list).
  - Screenshot names: `<page>@<state>.<viewport>[.dark].png`.

- [ ] **Step 1: Write the failing test**

`cli/test/shot-state.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readStates, runShot, type ShotDeps } from "../src/commands/shot";
import { toFindings, type AuditIssue } from "../src/shot/audit";
import { stateExpression, type CaptureOptions } from "../src/shot/capture";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

describe("state scripts", () => {
  test("are read from files, repeated or as a comma list, and named by their file", () => {
    const root = makeProject({ "design/states/editor.js": "open();", "design/states/Result.js": "save();" });
    expect(readStates(root, ["design/states/editor.js", "design/states/Result.js"])).toEqual([
      { name: "editor", script: "open();" },
      { name: "result", script: "save();" },
    ]);
    expect(readStates(root, "design/states/editor.js,design/states/Result.js")).toHaveLength(2);
    expect(readStates(root, undefined)).toEqual([]);
  });

  test("a missing file, a name that can't name a screenshot, or two with one name are refused, plainly", () => {
    const root = makeProject({ "a/editor.js": "", "b/editor.js": "", "design/states/my state.js": "" });
    expect(readStates(root, ["design/states/nope.js"])).toEqual({ error: expect.stringContaining("doesn't exist") });
    expect(readStates(root, ["design/states/my state.js"])).toEqual({ error: expect.stringContaining("letters, digits and dashes") });
    expect(readStates(root, ["a/editor.js", "b/editor.js"])).toEqual({ error: expect.stringContaining('"editor"') });
  });

  test("run in the page as an async function, stopped after 15 seconds by default", () => {
    const e = stateExpression("document.querySelector('#open').click();");
    expect(e).toContain("document.querySelector('#open').click();");
    expect(e).toContain("15000");
    expect(e).toContain("async");
    expect(stateExpression("x", 50)).toContain("50");
  });

  test("motif shot passes them to the capture, and refuses a bad one before starting anything", async () => {
    const root = makeProject({ "public/index.html": "", "design/states/editor.js": "open();" });
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
        const shot = join(o.outDir, "index@editor.mobile.png");
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
        return { routes: [{ route: "/", url: o.baseUrl, status: 200, shots: [shot] }], issues: [] };
      },
      compare: async () => [],
      today: () => "2026-10-15",
    };
    const ok = await runShot(root, { positionals: [], flags: { state: ["design/states/editor.js"] } }, deps);
    expect(ok.exitCode).toBe(0);
    expect(captured[0]!.states).toEqual([{ name: "editor", script: "open();" }]);
    expect(ok.data.states).toEqual(["editor"]);
    const bad = await runShot(root, { positionals: [], flags: { state: ["design/states/nope.js"] } }, deps);
    expect(bad.exitCode).toBe(2);
    expect(captured).toHaveLength(1);
  });
});

describe("audit findings in a state", () => {
  test("are kept apart from the same element on the plain page, and say which state", () => {
    const issue = (state?: string): AuditIssue => ({
      rule: "color-contrast", selector: ".cup", label: "Tea", kind: "element", ratio: 1.7, expected: 4.5, fg: "#999", bg: "#aaa",
      route: "/", viewport: "mobile", scheme: "light", shot: "design/shots/index.mobile.png", ...(state ? { state } : {}),
    });
    const findings = toFindings([issue(), issue("editor")]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.location.state)).toEqual([undefined, "editor"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `cli/`): `bun test test/shot-state.test.ts`
Expected: FAIL — `readStates` and `stateExpression` aren't exported.

- [ ] **Step 3: Flags may be lists (`cli/src/cli/output.ts`) and `--state` (`cli/src/main.ts`)**

In `RunContext`, replace `flags?: Record<string, string | boolean | undefined>;` with `flags?: Record<string, string | string[] | boolean | undefined>;`.

In `cli/src/main.ts`: in `parseArgs`' options add `state: { type: "string", multiple: true },`; in the flags passed to the runner add `state: values.state,`; in `HELP`'s "Shot options", after the `--against` line, add:
```
  --state <file.js> Also capture each page after this script runs in it (a state behind a form or a click); repeat for more
```

- [ ] **Step 4: States in `cli/src/shot/capture.ts`**

Add after `MAX_HEIGHT`:
```ts
/** A script run in each page before it's captured again: its file name names the state ("editor" → index@editor.png). */
export interface StateScript {
  name: string;
  script: string;
}

/** The script as an async function in the page; one still running after timeoutMs is stopped and reported. */
export function stateExpression(script: string, timeoutMs = 15_000): string {
  return `Promise.race([(async () => {\n${script}\n})(), new Promise((_, reject) => setTimeout(() => reject(new Error("it was still running after ${timeoutMs / 1000} seconds")), ${timeoutMs}))]).then(() => true)`;
}
```
In `CaptureOptions`, add:
```ts
  /** Also capture each page after each of these scripts runs in it. */
  states?: StateScript[];
```
Replace the whole `for (const viewport of VIEWPORTS) { … }` block inside the `try` of the route loop with:
```ts
        for (const viewport of VIEWPORTS) {
          await page.setViewport(viewport.width, viewport.height, viewport.scale, viewport.mobile);
          for (const scheme of SCHEMES) {
            await page.emulateMedia([
              { name: "prefers-color-scheme", value: scheme },
              { name: "prefers-reduced-motion", value: "reduce" },
            ]);
            for (const state of [undefined, ...(opts.states ?? [])]) {
              const tag = (message: string) => (state ? `State "${state.name}": ${message}` : message);
              page.takeErrors();
              await page.goto(url, timeoutMs);
              await page.evaluate("document.fonts.ready.then(() => true)");
              if (state) {
                try {
                  await page.evaluate(stateExpression(state.script));
                } catch (e) {
                  result.pageErrors = [...new Set([...(result.pageErrors ?? []), tag(e instanceof Error ? e.message : String(e))])];
                }
              }
              await Bun.sleep(settleMs);
              const thrown = page.takeErrors();
              if (thrown.length > 0) {
                result.pageErrors = [...new Set([...(result.pageErrors ?? []), ...thrown.map(tag)])];
              } else {
                // Hide the dev badge only when nothing went wrong: Next.js shows its error overlay in the same place.
                await page.evaluate(HIDE_DEV_BADGES);
              }
              const fullHeight = await page.evaluate<number>(PAGE_HEIGHT);
              if (fullHeight > MAX_HEIGHT) result.cropped = true;
              const file = join(opts.outDir, shotName(state ? `${slug}@${state.name}` : slug, viewport.name, scheme));
              writeFileSync(file, await page.screenshot({ x: 0, y: 0, width: viewport.width, height: Math.min(fullHeight, MAX_HEIGHT) }));
              result.shots.push(file);
              if (opts.audit) {
                try {
                  const found = await auditPage(page, { viewport: viewport.name, scheme, motionSampleMs: opts.motionSampleMs });
                  for (const raw of found) issues.push({ ...raw, route, viewport: viewport.name, scheme, shot: file, ...(state ? { state: state.name } : {}) });
                } catch (e) {
                  result.auditError = e instanceof Error ? e.message : String(e);
                }
              }
            }
          }
        }
```

- [ ] **Step 5: States in the audit (`cli/src/shot/audit.ts`)**

In `interface AuditIssue`, add `/** The state script the page was in, if any. */ state?: string;`. In `ReviewFinding`, change `location` to:
```ts
  location: { screen: string; selector: string; viewport: "mobile" | "desktop"; scheme?: Scheme; state?: string };
```
Replace `mergeKey` with:
```ts
const mergeKey = (i: AuditIssue) =>
  i.rule === "color-contrast" ? `${i.rule}|${i.route}|${i.state ?? ""}|${i.selector}|${i.scheme}` : `${i.rule}|${i.route}|${i.state ?? ""}|${i.selector}`;
```
In `toFindings`, replace the dedupe check
```ts
    if (seen.has(key) || (issue.rule === "target-mobile" && seen.has(`target-size|${issue.route}|${issue.selector}`))) continue;
```
with
```ts
    if (seen.has(key) || (issue.rule === "target-mobile" && seen.has(`target-size|${issue.route}|${issue.state ?? ""}|${issue.selector}`))) continue;
```
and the `location` line with:
```ts
      location: { screen: issue.route, selector: issue.selector, viewport: issue.viewport, ...(withScheme ? { scheme: issue.scheme } : {}), ...(issue.state ? { state: issue.state } : {}) },
```

- [ ] **Step 6: Read and pass states in `cli/src/commands/shot.ts`**

Imports: add `readFileSync`, `statSync` to the `node:fs` import if missing, and `type StateScript` to the import from `../shot/capture`.

Add above `runShot`:
```ts
/** --state values: repeated, or a comma list; each a script file whose name names the state. */
export function readStates(cwd: string, value: unknown): StateScript[] | { error: string } {
  const given = (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).flatMap((v) => String(v).split(","));
  const states: StateScript[] = [];
  for (const file of given.map((f) => f.trim()).filter(Boolean)) {
    const abs = resolve(cwd, file);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      return { error: `--state: "${file}" doesn't exist. Give the path to a script, like design/states/editor.js.` };
    }
    const name = basename(abs).replace(/\.[^.]+$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return { error: `--state: "${basename(abs)}" names the screenshots, so use letters, digits and dashes (like editor.js).` };
    }
    if (states.some((s) => s.name === name)) return { error: `--state: two scripts are named "${name}"; rename one.` };
    states.push({ name, script: readFileSync(abs, "utf8") });
  }
  return states;
}
```
In `runShot`, right after the `--url` format check (before the browser lookup), add:
```ts
  const states = readStates(cwd, flags.state);
  if ("error" in states) return usage(states.error, { error: "usage" });
```
Pass them to the capture: replace `captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit });` with
```ts
    captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit, states });
```
In the audit summary lines, replace
```ts
      const where = `${f.location.screen} (${f.location.viewport}${f.location.scheme ? `, ${f.location.scheme}` : ""})`;
```
with
```ts
      const where = `${f.location.screen}${f.location.state ? ` in "${f.location.state}"` : ""} (${f.location.viewport}${f.location.scheme ? `, ${f.location.scheme}` : ""})`;
```
and in the returned `data`, after `skipped: discovery.skipped,` add `states: states.map((s) => s.name),`.

- [ ] **Step 7: Run the tests to see them pass**

Run (from `cli/`): `bun test test/shot-state.test.ts test/shot-plain.test.ts test/shot-command.test.ts test/audit.test.ts test/capture.test.ts test/main.test.ts && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add cli/src/shot/capture.ts cli/src/shot/audit.ts cli/src/commands/shot.ts cli/src/cli/output.ts cli/src/main.ts cli/test/shot-state.test.ts
git commit -m "feat(shot): --state captures states behind a form or a click, audited and compared like pages" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: End to end on a plain site, and the README

**Files:**
- Test: `cli/test/plain-web-e2e.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above, through the compiled tool.
- Produces: an end-to-end test (the shot part runs where Chrome, Edge or Chromium is found, like `shot-e2e`), and the README's tool table naming plain web.

- [ ] **Step 1: Write the end-to-end test**

`cli/test/plain-web-e2e.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findBrowser } from "../src/detect/browser";
import { validDesignMd, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO_ROOT = join(import.meta.dir, "../..");
const browser = findBrowser();
let bin = "";

const PAGE = [
  "<!doctype html>",
  '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="motif.css">',
  "<style>",
  "  :root { --page: var(--motif-color-background); --ink: var(--motif-color-text-primary); }",
  "  body { margin: 0; padding: var(--motif-space-6); background: var(--page); color: var(--ink); }",
  "  .badge { color: #c0ffee; }",
  "  #panel { display: none; }",
  "  #panel.open { display: block; min-height: 400px; }",
  "</style></head>",
  '<body><h1>Sample</h1><div id="panel">Opened</div><a href="about.html">About</a></body></html>',
].join("\n");

const site = () =>
  makeProject({
    "DESIGN.md": validDesignMd(),
    "design/tokens.json": JSON.stringify(validTokens()),
    "public/index.html": PAGE,
    "public/about.html": '<!doctype html><link rel="stylesheet" href="motif.css"><h1>About</h1>',
    "design/states/open.js": 'document.getElementById("panel").classList.add("open");',
    "design/states/broken.js": 'throw new Error("no such button");',
  });

const run = (cwd: string, args: string[]) => {
  const r = Bun.spawnSync([bin, ...args, "--json"], { cwd, env: { ...process.env, NO_COLOR: "1" } });
  const out = r.stdout.toString().trim().split("\n").pop() ?? "";
  return { code: r.exitCode, json: JSON.parse(out) };
};

describe("the compiled tool on a plain web site", () => {
  beforeAll(() => {
    bin = join(tempDir("motif-build-"), process.platform === "win32" ? "motif.exe" : "motif");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", bin]);
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  });

  test("doctor, tokens, check and extract", () => {
    const root = site();
    const doctor = run(root, ["doctor"]);
    expect(doctor.json.items.find((i: any) => i.id === "app:.")).toMatchObject({ status: "ok", detail: expect.stringContaining("public/") });

    const tokens = run(root, ["tokens"]);
    expect(tokens.code).toBe(0);
    expect(tokens.json.files).toContainEqual({ path: "public/motif.css", status: "created" });
    expect(tokens.json.notes.join("\n")).not.toContain("Next:");

    const check = run(root, ["check"]);
    expect(check.code).toBe(1);
    expect(check.json.violations.map((v: any) => [v.rule, v.text, v.file, v.line])).toEqual([["raw-color", "#c0ffee", "public/index.html", 6]]);

    const extract = run(root, ["extract"]);
    expect(extract.code).toBe(0);
    expect(existsSync(join(root, "design/tokens.draft.json"))).toBe(true);
  });

  test.skipIf(!browser)("shot serves the site, finds its pages, and captures states (needs Chrome, Edge or Chromium)", () => {
    const root = site();
    run(root, ["tokens"]);
    const shot = run(root, ["shot", "--audit", "--state", "design/states/open.js", "--state", "design/states/broken.js"]);
    expect(shot.json.routes.map((r: any) => r.route)).toEqual(["/", "/about.html"]);
    expect(shot.json.states).toEqual(["open", "broken"]);
    const shots: string[] = shot.json.shots;
    for (const name of ["index.mobile.png", "index@open.mobile.png", "index@open.desktop.dark.png", "about-html@broken.mobile.png"]) {
      expect(shots).toContain(`design/shots/${name}`);
    }
    const plain = readFileSync(join(root, "design/shots/index.mobile.png"));
    const opened = readFileSync(join(root, "design/shots/index@open.mobile.png"));
    expect(Buffer.compare(plain, opened)).not.toBe(0);
    const home = shot.json.routes.find((r: any) => r.route === "/");
    expect(home.pageErrors.join("\n")).toContain('State "broken"');
    expect(home.pageErrors.join("\n")).toContain("no such button");
  });
});
```

- [ ] **Step 2: Run it**

Run (from `cli/`): `bun test test/plain-web-e2e.test.ts --timeout 300000`
Expected: PASS (the shot test is skipped where no browser is found). If a step's output differs from the test, find the cause in the task that owns that code (superpowers:systematic-debugging) and fix it there, test first.

- [ ] **Step 3: The README**

In `README.md`'s tool table, replace the `motif tokens` row with:
```
| `motif tokens` | Turns your design guide into theme code (React web: CSS variables, a Tailwind v4 theme, Motion timings; plain web sites: `motif.css` in the site folder); `--stack preview` writes the CSS mockups use |
```
and the `motif shot` row with:
```
| `motif shot` | Screenshots your real app's pages at phone and desktop widths in light and dark (starting its dev server if needed, or serving a plain web site's folder itself); `--state <script>` also captures states behind a form or a click; `--audit` checks contrast, tap-target sizes and reduced motion as rendered; `--against` puts them side by side with the mockup while you build, or with an earlier run (`--save before`) after a rebuild |
```
After the paragraph that starts "Add `--json` for machine-readable output", add:
```
Full support today: React web apps, and plain web sites (HTML, CSS and JavaScript without a framework: a folder with an `index.html` in it, `public/`, `src/`, `site/` or `www/`). `motif check` and `motif extract` read CSS where it is, including `<style>` blocks and `style=""` attributes.
```

- [ ] **Step 4: The whole suite**

Run (from `cli/`): `bun run typecheck && bun test --timeout 120000`
Expected: typecheck clean; every test passes (827 before this plan, plus the new ones; the same skips).

- [ ] **Step 5: Commit**

```bash
git add cli/test/plain-web-e2e.test.ts README.md
git commit -m "test(plain-web): end to end with the compiled tool; README names plain web support" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
