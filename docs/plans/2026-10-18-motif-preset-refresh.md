# Motif Preset Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Motif's eight starting styles fonts and colours that don't read as "made by an AI agent", give every style an Arabic companion font, and teach init and review to steer away from the overused fonts and colour looks.

**Architecture:** The styles are data in `cli/src/presets/spec.ts`, built into `skill/presets/` by `bun run presets`. The preview kit ships each style's fonts: the Latin variable file, plus an Arabic-only file declared with `unicode-range` for each Arabic companion. Font discovery (`themeFonts`) walks the whole font list, so a companion second in the list is loaded too. Guidance is a new `skill/knowledge/type-pairings.md`, used by init's directions and by review's "default look" note.

**Tech Stack:** Bun 1.4.3, TypeScript, culori, `@fontsource-variable/*` 5.3.x (kit files), `bun:test`.

**Spec:** The decisions below. They come from the developer's choices on 2026-10-18 (fonts: new fonts for the styles, init proposes pairings, review notes generic type as advice; colours included; "the option that gives the better experience" for every pick) and from the font and colour research done that day. The visual review page shows every style today and proposed, in light and dark: https://claude.ai/artifact/N29uMwroYo3BpdojLywEET

## Decisions (binding)

| Style | Text | Headings | Arabic companion | Corners (sm/md/lg) | Shadow strength |
|---|---|---|---|---|---|
| Minimal | Onest | Onest | Readex Pro | 3 / 6 / 10 | 0.6 |
| Soft | Nunito (kept) | Nunito (kept) | Rubik | 8 / 14 / 24 | 1 |
| Playful | Nunito (kept) | Fredoka (kept) | Baloo Bhaijaan 2 | 10 / 18 / 28 | 1 |
| Editorial | Source Serif 4 (kept) | Noto Serif Display | Markazi Text | 0 / 2 / 4 | 0.4 |
| Bold | Zalando Sans | Zalando Sans Expanded | Alexandria | 2 / 6 / 12 | 0.8 |
| Dark Tech | Geologica | TASA Orbiter | Changa | 2 / 4 / 8 | 0.5 |
| Warm | Merriweather Sans | Vollkorn | El Messiri | 6 / 10 / 16 | 1 |
| Trust | Public Sans | Public Sans | Mada | 6 / 8 / 12 | 0.9 |

- New palettes for all eight styles, exactly as in Task 3. Each was checked: text 4.5:1 and focus 3:1 in both modes, no Tailwind v3/v4.2, shadcn or Material value (OKLab distance ≥ 0.02 for colours, ≥ 0.004 for near-greys), no light background in the "cream" band, danger kept apart from the accent.
- The Arabic companion is second in both font lists (`["Onest", "Readex Pro", "system-ui", "sans-serif"]`): Arabic letters use it, Latin letters keep the style's font.
- Shadows take the style's light `text-primary` colour instead of black, scaled by the strength above (alphas 0.08 / 0.10 / 0.14 × strength).
- Retired from the kit: Archivo, DM Sans, Fraunces, IBM Plex Sans, Inter, Playfair Display, Source Sans 3, Space Grotesk. A guide that still uses one loads it from Google Fonts in mockups (the existing path for any font outside the kit).
- Existing design guides are never changed. Only new guides, presets and previews of presets use the new values.
- The "default look" note in reviews is advice: category `anti-pattern`, severity `minor`, once per review, never a `motif validate` or `motif check` error.

## Global Constraints

- Every kit font file is under 80,000 bytes (`cli/test/preview-fonts.test.ts`).
- Every bundled font is under the SIL Open Font License 1.1, with `LICENSE-<slug>.txt` beside it, and is listed in `THIRD-PARTY-NOTICES.txt` (`bun run notices`).
- Fontsource packages are pinned to exact versions in `cli/package.json` `devDependencies` (`bun add -d --exact`).
- Apps load theme fonts with the static `@fontsource/<id>` packages, whose family names match the theme. The kit copies files from the `@fontsource-variable/<id>` packages.
- Every style passes `motif validate` readability in light and dark (`cli/test/presets.test.ts` already checks this).
- User-facing text (skill docs, CLI messages) is plain: short sentences, words a developer uses, no jargon.
- Commits: `git -c user.name=7mxd -c user.email=7895735+7mxd@users.noreply.github.com commit`, message ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Bash heredocs collapse backslashes even when quoted: write files that contain `\` with the Write or Edit tool.
- Full suite, from `cli/`: `bun run typecheck`, then `bun test --timeout 300000` (about 11 minutes; run it in the background and read the tail).

## Review Focus

1. A page with no Arabic text must not list the Arabic companion as "shown with a fallback font" in `motif preview`. A face limited to Arabic letters never loads for `document.fonts.load("16px X")`, which only asks for a space. Pinned by Task 1's render test and Task 3's preset preview test.
2. A guide whose *main* font is one of the Arabic companions (Rubik, Readex Pro) must still get its Latin letters, from Google Fonts. The kit has only their Arabic letters. Pinned by Task 2's `themeFonts` test.
3. A guide made before this change, using a retired font such as Inter, still previews: online from Google, offline named as "fell back", never a crash. Pinned by Task 4's `themeFonts` test.
4. Vollkorn's figures are old-style by default, so prices set in it look small and uneven. The pairings guide and visual craft say to use lining, tabular figures. Pinned by Task 5's doc test.
5. A font list that has system fonts after a web font (`"Acme Sans", Helvetica, Arial`) must never fetch the system fonts. Pinned by Task 1's `themeFonts` test.

---

### Task 1: Every web font in a font list counts, and previews check fonts with Latin and Arabic text

**Files:**
- Modify: `cli/src/generate/theme-fonts.ts` (add `stackFamilies`; `themeFonts` walks every family)
- Modify: `cli/src/preview/render.ts:38-52` (`fontsScript` loads each family with sample text)
- Test: `cli/test/theme-fonts.test.ts`, `cli/test/render.test.ts`

**Interfaces:**
- Produces: `stackFamilies(css: string): string[]`: every non-generic family in a CSS font list, unquoted, in order. `themeFonts(theme)` returns every family any role names (not just the first), keeping `{ family, weights, source }`. `FONT_SAMPLE` (exported from `render.ts`): the text each family is loaded with.

- [ ] **Step 1: Write the failing tests**

In `cli/test/theme-fonts.test.ts`, change the import to `import { firstFamily, googleFontsUrl, stackFamilies, themeFonts } from "../src/generate/theme-fonts";`. Then replace the editorial test's first assertion so system fonts don't count (the editorial list has Georgia after its web fonts):

```ts
  test("a starting style's fonts are all bundled, with the weights its roles use", () => {
    const fonts = themeFonts(presetTheme("editorial")!).filter((f) => f.source !== "system");
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Playfair Display", "bundled"], ["Source Serif 4", "bundled"]]);
    for (const f of fonts) expect(f.weights).toEqual([...f.weights].sort((a, b) => a - b));
  });
```

Append:

```ts
describe("every web font in a font list (preset refresh)", () => {
  test("stackFamilies: each family in order, unquoted, without generic families", () => {
    expect(stackFamilies('Onest, "Readex Pro", system-ui, sans-serif')).toEqual(["Onest", "Readex Pro"]);
    expect(stackFamilies("system-ui, sans-serif")).toEqual([]);
  });

  test("a companion second in the list is loaded too, with the same weights", () => {
    const fonts = themeFonts(withFonts(["Plus Jakarta Sans", "Noto Kufi Arabic", "system-ui", "sans-serif"]));
    expect(fonts.map((f) => f.family)).toEqual(["Plus Jakarta Sans", "Noto Kufi Arabic"]);
    expect(fonts[1]!.weights).toEqual(fonts[0]!.weights);
  });

  test("system fonts later in the list are never fetched (review focus)", () => {
    const fonts = themeFonts(withFonts(["Acme Sans", "Helvetica", "Arial", "sans-serif"]));
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Acme Sans", "google"], ["Helvetica", "system"], ["Arial", "system"]]);
  });
});
```

In `cli/test/render.test.ts`, change the import to `import { FONT_SAMPLE, fontsScript, pngName, pngNamer, renderPngs } from "../src/preview/render";` and add this test after "names fonts that couldn't load, and still renders":

```ts
  test("a face that only covers Arabic letters counts as loaded (preset refresh: review focus)", async () => {
    const font = readFileSync(join(import.meta.dir, "../../skill/preview-kit/fonts/nunito.woff2"));
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/ar.woff2") return new Response(font, { headers: { "content-type": "font/woff2" } });
        if (path !== "/") return new Response("Not found", { status: 404 });
        const html = `<!doctype html><html><head><style>
          @font-face { font-family: "Companion"; src: url("/ar.woff2") format("woff2"); unicode-range: U+0600-06FF; }
          body { margin: 0 } .mk-frame { width: 200px; height: 100px; background: #eee }
        </style></head><body><div class="mk-frame"><p style="font-family: Companion, sans-serif">Latin only</p></div></body></html>`;
        return new Response(html, { headers: { "content-type": "text/html" } });
      },
    });
    try {
      const result = await renderPngs({
        browserPath: browser!.path,
        outDir: tempDir("motif-render-"),
        targets: [{ name: "ar", url: `http://127.0.0.1:${server.port}/`, fonts: ["Companion"] }],
      });
      expect(result.missingFonts).toEqual([]);
      expect(FONT_SAMPLE).toMatch(/[؀-ۿ]/);
    } finally {
      server.stop(true);
    }
  }, 60_000);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `cli/`): `bun test test/theme-fonts.test.ts test/render.test.ts`
Expected: FAIL. The import of `stackFamilies` / `FONT_SAMPLE` fails ("Export named ... not found").

- [ ] **Step 3: Implement**

In `cli/src/generate/theme-fonts.ts`, add below `firstFamily`:

```ts
/** Every family a type role names, unquoted and in order, without generic families: a companion second in the list counts too. */
export function stackFamilies(css: string): string[] {
  return css
    .split(",")
    .map((part) => part.trim().replace(/^(["'])(.*)\1$/, "$2").trim())
    .filter((family) => family && !GENERIC.has(family.toLowerCase()));
}
```

and replace the body of `themeFonts`:

```ts
/** Each family the theme's type roles name (the first, and any companion after it), with the weights used. */
export function themeFonts(theme: Theme): ThemeFontUse[] {
  const uses = new Map<string, ThemeFontUse>();
  for (const font of theme.fonts) {
    for (const family of stackFamilies(font.family)) {
      const key = family.toLowerCase();
      const use = uses.get(key) ?? { family, weights: [], source: isBundledFamily(family) ? "bundled" : SYSTEM.has(key) ? "system" : "google" };
      if (!use.weights.includes(font.weight)) use.weights.push(font.weight);
      uses.set(key, use);
    }
  }
  return [...uses.values()].map((u) => ({ ...u, weights: [...u.weights].sort((a, b) => a - b) }));
}
```

Update the `firstFamily` comment's callers: none outside this file and its test; keep it.

In `cli/src/preview/render.ts`, above `fontsScript`:

```ts
/**
 * The text each family is loaded with. Loading a family asks only for the faces that cover the text, and the default
 * (a space) skips a face limited to Arabic letters, so a style's Arabic companion would wrongly count as missing.
 */
export const FONT_SAMPLE = "Aa ب";
```

and in the script change the load line to:

```ts
    await within(Promise.allSettled(families.map((f) => document.fonts.load("16px " + JSON.stringify(f), ${JSON.stringify(FONT_SAMPLE)}))));
```

(`FONT_SAMPLE` holds the escape `ب`, an Arabic letter, so the source file stays ASCII. Write this edit with the Edit tool, not a heredoc.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test test/theme-fonts.test.ts test/render.test.ts test/preview-command.test.ts test/tokens-command.test.ts test/directions.test.ts`
Expected: PASS (the last three exercise `themeFonts` through `motif preview` and `motif tokens`).

- [ ] **Step 5: Commit**

```bash
git add cli/src/generate/theme-fonts.ts cli/src/preview/render.ts cli/test/theme-fonts.test.ts cli/test/render.test.ts
git commit -m "feat(fonts): every web font in a font list counts; check fonts with Latin and Arabic text"
```

---

### Task 2: The kit ships the new fonts and the Arabic companions

**Files:**
- Modify: `cli/package.json`, `cli/bun.lock` (add 17 `@fontsource-variable` packages)
- Modify: `cli/src/preview/font-list.ts` (Arabic entries, `fontFile`, `bundledCoverage`, `ARABIC_RANGE`, `unicode-range` in `fontFaceCss`)
- Modify: `cli/scripts/vendor-fonts.ts` (copy Arabic files)
- Modify: `cli/src/preview/fonts.ts` (embed the new files)
- Modify: `cli/src/generate/theme-fonts.ts` (an Arabic-only kit font is "bundled" only as a companion)
- Modify: `cli/scripts/notices.ts` (`FONT_NAMES`), then `bun run notices` rewrites `THIRD-PARTY-NOTICES.txt`
- Modify: `skill/preview-kit/README.md` (Fonts section)
- Create (generated by `bun run fonts`): `skill/preview-kit/fonts/<slug>.woff2`, `<slug>-arabic.woff2`, `LICENSE-<slug>.txt`, `fonts.css`
- Test: `cli/test/preview-fonts.test.ts`, `cli/test/theme-fonts.test.ts`, `cli/test/notices.test.ts`

**Interfaces:**
- Consumes: `stackFamilies` (Task 1).
- Produces: `ListedFont { family; slug; weight: [number, number]; arabic?: boolean }`; `fontFile(f: ListedFont): string` (`"onest.woff2"`, `"readex-pro-arabic.woff2"`); `bundledCoverage(family: string): "full" | "arabic" | null`; `isBundledFamily(family)` is now `bundledCoverage(family) === "full"`; `ARABIC_RANGE: string`.

- [ ] **Step 1: Add the packages**

Run (from `cli/`):

```bash
bun add -d --exact @fontsource-variable/onest@5.3.1 @fontsource-variable/zalando-sans@5.3.0 @fontsource-variable/zalando-sans-expanded@5.3.0 @fontsource-variable/geologica@5.3.0 @fontsource-variable/tasa-orbiter@5.3.0 @fontsource-variable/merriweather-sans@5.3.0 @fontsource-variable/vollkorn@5.3.0 @fontsource-variable/noto-serif-display@5.3.0 @fontsource-variable/public-sans@5.3.0 @fontsource-variable/readex-pro@5.3.0 @fontsource-variable/alexandria@5.3.0 @fontsource-variable/changa@5.3.0 @fontsource-variable/el-messiri@5.3.0 @fontsource-variable/markazi-text@5.3.0 @fontsource-variable/rubik@5.3.0 @fontsource-variable/baloo-bhaijaan-2@5.3.0 @fontsource-variable/mada@5.3.0
```

Expected: `cli/package.json` lists each at the exact version; `node_modules/@fontsource-variable/readex-pro/files/readex-pro-arabic-wght-normal.woff2` exists.

- [ ] **Step 2: Write the failing tests**

In `cli/test/preview-fonts.test.ts`, change the import to `import { ARABIC_RANGE, FONT_LIST, FONTS_CSS_HEADER, bundledCoverage, fontFaceCss, fontFile, isBundledFamily } from "../src/preview/font-list";` and replace the file-checking tests with:

```ts
  test("each is a small woff2 file with its SIL Open Font License beside it", () => {
    for (const font of FONT_LIST) {
      const bytes = readFileSync(join(FONTS, fontFile(font)));
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(bytes.length).toBeLessThan(80_000);
      expect(readFileSync(join(FONTS, `LICENSE-${font.slug}.txt`), "utf8")).toContain("SIL Open Font License");
    }
  });

  test.skipIf(!existsSync(MODULES))("the weight ranges, and the Arabic letters' range, match the fonts' own packages", () => {
    for (const font of FONT_LIST) {
      const css = readFileSync(join(MODULES, font.slug, "wght.css"), "utf8").replace(/\r\n/g, "\n");
      expect(css).toContain(`font-weight: ${font.weight[0]} ${font.weight[1]};`);
      if (font.arabic) expect(css).toContain(`unicode-range: ${ARABIC_RANGE};`);
    }
  });

  test("the tool embeds every font file and the stylesheet", async () => {
    expect(Object.keys(EMBEDDED_FONT_FILES).sort()).toEqual(FONT_LIST.map(fontFile).sort());
    for (const [name, path] of Object.entries(EMBEDDED_FONT_FILES)) {
      expect((await Bun.file(path).arrayBuffer()).byteLength).toBe(statSync(join(FONTS, name)).size);
    }
    expect(lf(FONTS_CSS)).toBe(lf(readFileSync(join(FONTS, "fonts.css"), "utf8")));
  });
```

and append a new block:

```ts
describe("Arabic companions (preset refresh)", () => {
  test("the kit ships only their Arabic letters, declared for Arabic text only", () => {
    expect(bundledCoverage("Readex Pro")).toBe("arabic");
    expect(bundledCoverage("onest")).toBe("full");
    expect(bundledCoverage("Plus Jakarta Sans")).toBeNull();
    expect(isBundledFamily("Readex Pro")).toBe(false);
    const css = fontFaceCss((file) => file);
    expect(css).toContain(`font-family: "Readex Pro";`);
    expect(css).toContain(`src: url("readex-pro-arabic.woff2") format("woff2");\n  unicode-range: ${ARABIC_RANGE};`);
    expect(css).not.toContain(`src: url("onest.woff2") format("woff2");\n  unicode-range`);
  });
});
```

In `cli/test/theme-fonts.test.ts`, append:

```ts
describe("Arabic companions Motif ships (preset refresh)", () => {
  test("bundled when second in a list; the same family first in a list comes from Google, for its Latin letters (review focus)", () => {
    expect(themeFonts(withFonts(["Onest", "Readex Pro", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Onest", "bundled"], ["Readex Pro", "bundled"]]);
    expect(themeFonts(withFonts(["Rubik", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Rubik", "google"]]);
    expect(themeFonts(withFonts(["Onest", "Rubik", "sans-serif"], ["Rubik", "sans-serif"])).find((f) => f.family === "Rubik")!.source).toBe("google");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test test/preview-fonts.test.ts test/theme-fonts.test.ts`
Expected: FAIL ("Export named 'ARABIC_RANGE' not found" and `bundledCoverage` missing).

- [ ] **Step 4: Implement `font-list.ts`**

Replace `cli/src/preview/font-list.ts` with (Write tool):

```ts
/**
 * The fonts of the 8 starting styles, shipped with Motif: each style's Latin fonts (variable weight), and only the Arabic
 * letters of each style's Arabic companion. From Fontsource, under the SIL Open Font License 1.1.
 */
export interface ListedFont {
  family: string;
  slug: string;
  /** The variable font's weight range. */
  weight: [number, number];
  /** Only its Arabic letters ship: a companion second in a style's font list, used for Arabic text. */
  arabic?: boolean;
}

/** The Arabic letters' range, as Fontsource declares it for each companion's Arabic file. */
export const ARABIC_RANGE =
  "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1";

export const FONT_LIST: ListedFont[] = [
  { family: "Alexandria", slug: "alexandria", weight: [100, 900], arabic: true },
  { family: "Archivo", slug: "archivo", weight: [100, 900] },
  { family: "Baloo Bhaijaan 2", slug: "baloo-bhaijaan-2", weight: [400, 800], arabic: true },
  { family: "Changa", slug: "changa", weight: [200, 800], arabic: true },
  { family: "DM Sans", slug: "dm-sans", weight: [100, 1000] },
  { family: "El Messiri", slug: "el-messiri", weight: [400, 700], arabic: true },
  { family: "Fraunces", slug: "fraunces", weight: [100, 900] },
  { family: "Fredoka", slug: "fredoka", weight: [300, 700] },
  { family: "Geologica", slug: "geologica", weight: [100, 900] },
  { family: "IBM Plex Sans", slug: "ibm-plex-sans", weight: [100, 700] },
  { family: "Inter", slug: "inter", weight: [100, 900] },
  { family: "Mada", slug: "mada", weight: [200, 900], arabic: true },
  { family: "Markazi Text", slug: "markazi-text", weight: [400, 700], arabic: true },
  { family: "Merriweather Sans", slug: "merriweather-sans", weight: [300, 800] },
  { family: "Noto Serif Display", slug: "noto-serif-display", weight: [100, 900] },
  { family: "Nunito", slug: "nunito", weight: [200, 1000] },
  { family: "Onest", slug: "onest", weight: [100, 900] },
  { family: "Playfair Display", slug: "playfair-display", weight: [400, 900] },
  { family: "Public Sans", slug: "public-sans", weight: [100, 900] },
  { family: "Readex Pro", slug: "readex-pro", weight: [160, 700], arabic: true },
  { family: "Rubik", slug: "rubik", weight: [300, 900], arabic: true },
  { family: "Source Sans 3", slug: "source-sans-3", weight: [200, 900] },
  { family: "Source Serif 4", slug: "source-serif-4", weight: [200, 900] },
  { family: "Space Grotesk", slug: "space-grotesk", weight: [300, 700] },
  { family: "TASA Orbiter", slug: "tasa-orbiter", weight: [400, 800] },
  { family: "Vollkorn", slug: "vollkorn", weight: [400, 900] },
  { family: "Zalando Sans", slug: "zalando-sans", weight: [200, 900] },
  { family: "Zalando Sans Expanded", slug: "zalando-sans-expanded", weight: [200, 900] },
];

export const FONTS_CSS_HEADER =
  "/* The fonts of Motif's 8 starting styles (variable weight), and the Arabic letters of each style's Arabic companion, from Fontsource. Each is under the SIL Open Font License 1.1 (see LICENSE-<font>.txt). Written by cli/scripts/vendor-fonts.ts. */";

/** The kit's file for a font: its Latin file, or only its Arabic letters. */
export const fontFile = (f: ListedFont) => `${f.slug}${f.arabic ? "-arabic" : ""}.woff2`;

/** One @font-face per font; `url` turns a file name into the address the page loads it from. */
export function fontFaceCss(url: (file: string) => string): string {
  const faces = FONT_LIST.map((f) =>
    [
      "@font-face {",
      `  font-family: "${f.family}";`,
      "  font-style: normal;",
      "  font-display: swap;",
      `  font-weight: ${f.weight[0]} ${f.weight[1]};`,
      `  src: url("${url(fontFile(f))}") format("woff2");`,
      ...(f.arabic ? [`  unicode-range: ${ARABIC_RANGE};`] : []),
      "}",
    ].join("\n"),
  );
  return `${faces.join("\n\n")}\n`;
}

/** "full" when the kit has the font's Latin file, "arabic" when it has only its Arabic letters, null when it has neither. */
export function bundledCoverage(family: string): "full" | "arabic" | null {
  const key = family.trim().toLowerCase();
  const font = FONT_LIST.find((f) => f.family.toLowerCase() === key);
  return font ? (font.arabic ? "arabic" : "full") : null;
}

export function isBundledFamily(family: string): boolean {
  return bundledCoverage(family) === "full";
}
```

(The retired fonts stay in this task so the current styles keep working; Task 4 removes them.)

- [ ] **Step 5: Implement the vendor script, the embedded files and `themeFonts`**

`cli/scripts/vendor-fonts.ts`, loop body:

```ts
for (const font of FONT_LIST) {
  const source = `${font.slug}-${font.arabic ? "arabic" : "latin"}-wght-normal.woff2`;
  copyFileSync(join(MODULES, font.slug, "files", source), join(OUT, fontFile(font)));
  copyFileSync(join(MODULES, font.slug, "LICENSE"), join(OUT, `LICENSE-${font.slug}.txt`));
  console.log(`copied ${font.family}${font.arabic ? " (Arabic letters)" : ""}`);
}
```

with `fontFile` added to its import from `../src/preview/font-list`.

`cli/src/preview/fonts.ts`: one `import <name> from "../../../skill/preview-kit/fonts/<file>" with { type: "file" };` per `fontFile(font)` of `FONT_LIST`, and the same names in `EMBEDDED_FONT_FILES`, sorted by file name. The new lines:

```ts
import alexandriaArabic from "../../../skill/preview-kit/fonts/alexandria-arabic.woff2" with { type: "file" };
import balooBhaijaan2Arabic from "../../../skill/preview-kit/fonts/baloo-bhaijaan-2-arabic.woff2" with { type: "file" };
import changaArabic from "../../../skill/preview-kit/fonts/changa-arabic.woff2" with { type: "file" };
import elMessiriArabic from "../../../skill/preview-kit/fonts/el-messiri-arabic.woff2" with { type: "file" };
import geologica from "../../../skill/preview-kit/fonts/geologica.woff2" with { type: "file" };
import madaArabic from "../../../skill/preview-kit/fonts/mada-arabic.woff2" with { type: "file" };
import markaziTextArabic from "../../../skill/preview-kit/fonts/markazi-text-arabic.woff2" with { type: "file" };
import merriweatherSans from "../../../skill/preview-kit/fonts/merriweather-sans.woff2" with { type: "file" };
import notoSerifDisplay from "../../../skill/preview-kit/fonts/noto-serif-display.woff2" with { type: "file" };
import onest from "../../../skill/preview-kit/fonts/onest.woff2" with { type: "file" };
import publicSans from "../../../skill/preview-kit/fonts/public-sans.woff2" with { type: "file" };
import readexProArabic from "../../../skill/preview-kit/fonts/readex-pro-arabic.woff2" with { type: "file" };
import rubikArabic from "../../../skill/preview-kit/fonts/rubik-arabic.woff2" with { type: "file" };
import tasaOrbiter from "../../../skill/preview-kit/fonts/tasa-orbiter.woff2" with { type: "file" };
import vollkorn from "../../../skill/preview-kit/fonts/vollkorn.woff2" with { type: "file" };
import zalandoSans from "../../../skill/preview-kit/fonts/zalando-sans.woff2" with { type: "file" };
import zalandoSansExpanded from "../../../skill/preview-kit/fonts/zalando-sans-expanded.woff2" with { type: "file" };
```

and in `EMBEDDED_FONT_FILES` the entries `"alexandria-arabic.woff2": alexandriaArabic`, `"baloo-bhaijaan-2-arabic.woff2": balooBhaijaan2Arabic`, `"changa-arabic.woff2": changaArabic`, `"el-messiri-arabic.woff2": elMessiriArabic`, `"geologica.woff2": geologica`, `"mada-arabic.woff2": madaArabic`, `"markazi-text-arabic.woff2": markaziTextArabic`, `"merriweather-sans.woff2": merriweatherSans`, `"noto-serif-display.woff2": notoSerifDisplay`, `"onest.woff2": onest`, `"public-sans.woff2": publicSans`, `"readex-pro-arabic.woff2": readexProArabic`, `"rubik-arabic.woff2": rubikArabic`, `"tasa-orbiter.woff2": tasaOrbiter`, `"vollkorn.woff2": vollkorn`, `"zalando-sans.woff2": zalandoSans`, `"zalando-sans-expanded.woff2": zalandoSansExpanded`.

`cli/src/generate/theme-fonts.ts`: import `bundledCoverage` instead of `isBundledFamily`, and in `themeFonts` replace the inner loop with:

```ts
    stackFamilies(font.family).forEach((family, i) => {
      const key = family.toLowerCase();
      // The kit has only the Arabic letters of a style's Arabic companion: enough second in a list, not first.
      const coverage = bundledCoverage(family);
      const source = coverage === "full" || (coverage === "arabic" && i > 0) ? "bundled" : SYSTEM.has(key) ? "system" : "google";
      const use = uses.get(key) ?? { family, weights: [], source };
      if (use.source === "bundled" && source === "google") use.source = "google";
      if (!use.weights.includes(font.weight)) use.weights.push(font.weight);
      uses.set(key, use);
    });
```

`cli/scripts/notices.ts` `FONT_NAMES`: add, in file-name order, `"LICENSE-alexandria.txt": "Alexandria"`, `"LICENSE-baloo-bhaijaan-2.txt": "Baloo Bhaijaan 2"`, `"LICENSE-changa.txt": "Changa"`, `"LICENSE-el-messiri.txt": "El Messiri"`, `"LICENSE-geologica.txt": "Geologica"`, `"LICENSE-mada.txt": "Mada"`, `"LICENSE-markazi-text.txt": "Markazi Text"`, `"LICENSE-merriweather-sans.txt": "Merriweather Sans"`, `"LICENSE-noto-serif-display.txt": "Noto Serif Display"`, `"LICENSE-onest.txt": "Onest"`, `"LICENSE-public-sans.txt": "Public Sans"`, `"LICENSE-readex-pro.txt": "Readex Pro"`, `"LICENSE-rubik.txt": "Rubik"`, `"LICENSE-tasa-orbiter.txt": "TASA Orbiter"`, `"LICENSE-vollkorn.txt": "Vollkorn"`, `"LICENSE-zalando-sans.txt": "Zalando Sans"`, `"LICENSE-zalando-sans-expanded.txt": "Zalando Sans Expanded"`.

`skill/preview-kit/README.md`, first paragraph of `## Fonts`: replace its first sentence with "The fonts of the 8 starting styles come with the kit, in `fonts/`, and so do the Arabic letters of each style's Arabic companion (each under the SIL Open Font License; the licence sits beside each font)."

- [ ] **Step 6: Generate the files**

Run (from `cli/`): `bun run fonts && bun run notices`
Expected: "copied … (Arabic letters)" for the 8 companions; `skill/preview-kit/fonts/` gains 17 `.woff2` files and their licences; `THIRD-PARTY-NOTICES.txt` lists them.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test test/preview-fonts.test.ts test/theme-fonts.test.ts test/notices.test.ts test/preview-server.test.ts test/preview-assets.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add cli/package.json cli/bun.lock cli/src/preview/font-list.ts cli/src/preview/fonts.ts cli/scripts/vendor-fonts.ts cli/scripts/notices.ts cli/src/generate/theme-fonts.ts cli/test/preview-fonts.test.ts cli/test/theme-fonts.test.ts skill/preview-kit THIRD-PARTY-NOTICES.txt
git commit -m "feat(fonts): the kit ships the new styles' fonts and their Arabic companions"
```

---

### Task 3: The new values for the eight styles

**Files:**
- Modify: `cli/src/presets/spec.ts` (`PresetSpec.shadow`; fonts, radius, palettes)
- Modify: `cli/src/contract/defaults.ts:41-46` (`defaultShadows(ink, strength)`)
- Modify: `cli/src/presets/build.ts` (tinted shadows; `presetAbout` names the Arabic companion)
- Generated: `skill/presets/*/{tokens.json,about.md}`, `skill/contract/tokens.template.json`, `cli/test/__snapshots__/presets.test.ts.snap`
- Test: `cli/test/presets.test.ts`, `cli/test/theme-fonts.test.ts`, plus any test that pins a preset's old value (Step 6)

**Interfaces:**
- Consumes: `bundledCoverage`, `fontFile` (Task 2); `themeFonts` (Task 1/2).
- Produces: `PresetSpec.shadow: number`; `defaultShadows(ink?: string, strength?: number)` (defaults `"#000000"`, `1`, so `extract/draft.ts` is unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `cli/test/presets.test.ts` (it already imports `PRESETS`, `presetTokens` and `presetAbout`; add `import { converter, wcagContrast } from "culori";`, `import { bundledCoverage } from "../src/preview/font-list";` and `import { renderPngs } from "../src/preview/render";` only where missing):

```ts
// Tailwind v3's default palette, the values generated sites use as they are (preset refresh).
const TAILWIND = `f8fafc f1f5f9 e2e8f0 cbd5e1 94a3b8 64748b 475569 334155 1e293b 0f172a 020617 f9fafb f3f4f6 e5e7eb d1d5db 9ca3af 6b7280 4b5563 374151 1f2937 111827 030712 fafafa f4f4f5 e4e4e7 d4d4d8 a1a1aa 71717a 52525b 3f3f46 27272a 18181b 09090b f5f5f5 e5e5e5 d4d4d4 a3a3a3 737373 525252 404040 262626 171717 0a0a0a fafaf9 f5f5f4 e7e5e4 d6d3d1 a8a29e 78716c 57534e 44403c 292524 1c1917 0c0a09 fef2f2 fee2e2 fecaca fca5a5 f87171 ef4444 dc2626 b91c1c 991b1b 7f1d1d 450a0a fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407 fffbeb fef3c7 fde68a fcd34d fbbf24 f59e0b d97706 b45309 92400e 78350f 451a03 fefce8 fef9c3 fef08a fde047 facc15 eab308 ca8a04 a16207 854d0e 713f12 422006 f7fee7 ecfccb d9f99d bef264 a3e635 84cc16 65a30d 4d7c0f 3f6212 365314 1a2e05 f0fdf4 dcfce7 bbf7d0 86efac 4ade80 22c55e 16a34a 15803d 166534 14532d 052e16 ecfdf5 d1fae5 a7f3d0 6ee7b7 34d399 10b981 059669 047857 065f46 064e3b 022c22 f0fdfa ccfbf1 99f6e4 5eead4 2dd4bf 14b8a6 0d9488 0f766e 115e59 134e4a 042f2e ecfeff cffafe a5f3fc 67e8f9 22d3ee 06b6d4 0891b2 0e7490 155e75 164e63 083344 f0f9ff e0f2fe bae6fd 7dd3fc 38bdf8 0ea5e9 0284c7 0369a1 075985 0c4a6e 082f49 eff6ff dbeafe bfdbfe 93c5fd 60a5fa 3b82f6 2563eb 1d4ed8 1e40af 1e3a8a 172554 eef2ff e0e7ff c7d2fe a5b4fc 818cf8 6366f1 4f46e5 4338ca 3730a3 312e81 1e1b4b f5f3ff ede9fe ddd6fe c4b5fd a78bfa 8b5cf6 7c3aed 6d28d9 5b21b6 4c1d95 2e1065 faf5ff f3e8ff e9d5ff d8b4fe c084fc a855f7 9333ea 7e22ce 6b21a8 581c87 3b0764 fdf4ff fae8ff f5d0fe f0abfc e879f9 d946ef c026d3 a21caf 86198f 701a75 4a044e fdf2f8 fce7f3 fbcfe8 f9a8d4 f472b6 ec4899 db2777 be185d 9d174d 831843 500724 fff1f2 ffe4e6 fecdd3 fda4af fb7185 f43f5e e11d48 be123c 9f1239 881337 4c0519`
  .split(" ").map((h) => `#${h.toUpperCase()}`);
const oklch = converter("oklch");

describe("the starting styles don't look generated (preset refresh)", () => {
  test("no colour is one of Tailwind's defaults, Google's Material blue or its error red", () => {
    const library = new Set([...TAILWIND, "#0B57D0", "#8AB4F8", "#B3261E", "#F2B8B5"]);
    const used = PRESETS.flatMap((p) => [...Object.values(p.light), ...Object.values(p.dark)].map((hex) => `${p.id} ${hex}`));
    expect(used.filter((u) => library.has(u.split(" ")[1]!))).toEqual([]);
  });

  test("no light background is in the cream band (light, warm, red above blue by 6–48)", () => {
    const cream = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      return Math.min(r, g, b) >= 209 && r >= g && g >= b && r - b >= 6 && r - b <= 48;
    };
    expect(PRESETS.filter((p) => cream(p.light.background)).map((p) => p.id)).toEqual([]);
  });

  test("danger stays apart from the main action: 20° of hue or 0.08 of lightness", () => {
    const apart = (a: string, b: string) => {
      const x = oklch(a)!, y = oklch(b)!;
      const hue = Math.abs(((x.h ?? 0) - (y.h ?? 0) + 540) % 360 - 180);
      return hue >= 20 || Math.abs(x.l - y.l) >= 0.08;
    };
    for (const p of PRESETS) {
      expect([p.id, apart(p.light.danger, p.light["action-primary"])]).toEqual([p.id, true]);
      expect([p.id, apart(p.dark.danger, p.dark["action-primary"])]).toEqual([p.id, true]);
    }
  });

  test("every style names an Arabic companion second in both font lists, and the kit has it", () => {
    for (const p of PRESETS) {
      expect(p.fonts.body[1]).toBe(p.fonts.display[1]);
      expect(bundledCoverage(p.fonts.body[1]!)).not.toBeNull();
      expect(bundledCoverage(p.fonts.body[0]!)).toBe("full");
      expect(bundledCoverage(p.fonts.display[0]!)).toBe("full");
      expect(presetAbout(p)).toContain(`${p.fonts.body[1]} for Arabic`);
    }
  });

  test("shadows take the style's own ink, lighter in the flatter styles", () => {
    for (const p of PRESETS) {
      const md = (presetTokens(p) as any).shadow.md.$value;
      expect(md.color.hex).toBe(p.light["text-primary"].toUpperCase());
      expect(md.color.alpha).toBeCloseTo(0.1 * p.shadow, 5);
    }
  });
});
```

Also append to the same file a browser test for review focus 1 (skipped without a browser, like the other browser tests; use the file's existing `findBrowser` import or add `import { findBrowser } from "../src/detect/browser";`):

```ts
const browserForPresets = findBrowser();
describe.skipIf(!browserForPresets)("previews of the starting styles (needs Chrome, Edge or Chromium)", () => {
  test("no style's font, Arabic companion included, falls back in a preview of its sample (review focus)", async () => {
    const { startPreviewServer } = await import("../src/preview/server");
    const { presetTheme } = await import("../src/preview/presets");
    const { themeFonts } = await import("../src/generate/theme-fonts");
    const server = startPreviewServer({ root: tempDir("motif-presets-"), theme: null });
    try {
      const targets = PRESETS.map((p) => ({
        name: p.id,
        url: `${server.url}/__motif/preset/${p.id}/sample.html`,
        fonts: themeFonts(presetTheme(p.id)!).filter((f) => f.source !== "system").map((f) => f.family),
      }));
      const result = await renderPngs({ browserPath: browserForPresets!.path, outDir: tempDir("motif-presets-"), targets });
      expect(result.missingFonts).toEqual([]);
    } finally {
      server.stop();
    }
  }, 180_000);
});
```

(`startPreviewServer(opts: { root: string; theme: Theme | null; … })` in `cli/src/preview/server.ts:126` returns the server synchronously, with `url` and `stop()`; `motif preview --gallery` builds the same targets at `cli/src/commands/preview.ts:170`.) Import `tempDir` from `./tmp` if the file doesn't already.

In `cli/test/theme-fonts.test.ts`, update the editorial test to the new fonts:

```ts
  test("a starting style's fonts are all bundled, with the weights its roles use", () => {
    const fonts = themeFonts(presetTheme("editorial")!).filter((f) => f.source !== "system");
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Noto Serif Display", "bundled"], ["Markazi Text", "bundled"], ["Source Serif 4", "bundled"]]);
    for (const f of fonts) expect(f.weights).toEqual([...f.weights].sort((a, b) => a - b));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/presets.test.ts test/theme-fonts.test.ts`
Expected: FAIL. Tailwind values are found (Minimal's zinc, Bold's slate…), Warm/Soft/Playful are in the cream band, Editorial's danger matches its accent, there are no Arabic companions, and `p.shadow` is undefined.

- [ ] **Step 3: Implement the values**

In `cli/src/presets/spec.ts`, add to `PresetSpec` after `radius`:

```ts
  /** How strong the shadows are (1 = Motif's default); they take the light text colour, never plain black. */
  shadow: number;
```

Delete `STATUS_LIGHT` (no style uses it any more). In each style, replace the `fonts`, `radius`, `light` and `dark` lines and add `shadow` after `radius`, with these values (keep every other field: `id`, `title`, `words`, `bestFor`, `avoidFor`, `motionNote`, `sizes`, `durations`, `easing`, `springs`):

```ts
// minimal
    fonts: { body: ["Onest", "Readex Pro", "system-ui", "sans-serif"], display: ["Onest", "Readex Pro", "system-ui", "sans-serif"] },
    radius: { sm: 3, md: 6, lg: 10 }, shadow: 0.6,
    light: { background: "#F6F9F7", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#DCE1DE", "text-primary": "#181D1B", "text-secondary": "#575E5B", "action-primary": "#212825", "action-secondary": "#EAEFED", success: "#237742", warning: "#A45D25", danger: "#B6322D", info: "#2F6094", focus: "#28302C" },
    dark: { background: "#101412", surface: "#171A19", "surface-raised": "#1F2422", border: "#303533", "text-primary": "#ECF0EE", "text-secondary": "#A8AEAB", "action-primary": "#E8ECEA", "action-secondary": "#242927", success: "#7ECE94", warning: "#F0C16E", danger: "#F28881", info: "#84B9E6", focus: "#DADFDD" },
// soft
    fonts: { body: ["Nunito", "Rubik", "system-ui", "sans-serif"], display: ["Nunito", "Rubik", "system-ui", "sans-serif"] },
    radius: { sm: 8, md: 14, lg: 24 }, shadow: 1,
    light: { background: "#F5FAFA", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D7E2E1", "text-primary": "#1B292B", "text-secondary": "#556567", "action-primary": "#2E7577", "action-secondary": "#FBE6DE", success: "#247A4B", warning: "#A45D25", danger: "#B73F28", info: "#256E9B", focus: "#2E7577" },
    dark: { background: "#0D1A1B", surface: "#122123", "surface-raised": "#192A2C", border: "#2A3D3F", "text-primary": "#EAF2F1", "text-secondary": "#A5B7B6", "action-primary": "#7FCFC4", "action-secondary": "#3C2826", success: "#88D1A2", warning: "#F0C374", danger: "#F59485", info: "#88BFE6", focus: "#7FCFC4" },
// playful
    fonts: { body: ["Nunito", "Baloo Bhaijaan 2", "system-ui", "sans-serif"], display: ["Fredoka", "Baloo Bhaijaan 2", "Nunito", "system-ui", "sans-serif"] },
    radius: { sm: 10, md: 18, lg: 28 }, shadow: 1,
    light: { background: "#F5FBFF", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D4E0E7", "text-primary": "#291A24", "text-secondary": "#6A5562", "action-primary": "#C2126D", "action-secondary": "#F7E170", success: "#078050", warning: "#9D6C26", danger: "#B93F35", info: "#2F62AC", focus: "#C2126D" },
    dark: { background: "#221118", surface: "#2C1820", "surface-raised": "#38212A", border: "#4D333D", "text-primary": "#F9F1F4", "text-secondary": "#C9B2BC", "action-primary": "#FD87B2", "action-secondary": "#EDD55E", success: "#7CD591", warning: "#F8B65D", danger: "#F98A74", info: "#83BDF5", focus: "#FD87B2" },
// editorial
    fonts: { body: ["Source Serif 4", "Markazi Text", "Georgia", "serif"], display: ["Noto Serif Display", "Markazi Text", "Georgia", "serif"] },
    radius: { sm: 0, md: 2, lg: 4 }, shadow: 0.4,
    light: { background: "#FAF7F5", surface: "#FFFDFD", "surface-raised": "#F5F2F0", border: "#DDD8D6", "text-primary": "#1F1716", "text-secondary": "#615956", "action-primary": "#852535", "action-secondary": "#F0E9E7", success: "#2C6D3E", warning: "#916508", danger: "#B54531", info: "#295F8A", focus: "#1F1716" },
    dark: { background: "#161312", surface: "#1E1A18", "surface-raised": "#282321", border: "#3B3534", "text-primary": "#F1EEEA", "text-secondary": "#B4AEA9", "action-primary": "#E5848C", "action-secondary": "#2D2826", success: "#88CA95", warning: "#EABC6E", danger: "#F78E64", info: "#89BAE4", focus: "#F1EEEA" },
// bold
    fonts: { body: ["Zalando Sans", "Alexandria", "system-ui", "sans-serif"], display: ["Zalando Sans Expanded", "Alexandria", "Zalando Sans", "system-ui", "sans-serif"] },
    radius: { sm: 2, md: 6, lg: 12 }, shadow: 0.8,
    light: { background: "#FFFFFF", surface: "#F8F5F3", "surface-raised": "#FFFFFF", border: "#D2CDC9", "text-primary": "#16110F", "text-secondary": "#534B47", "action-primary": "#D83A1A", "action-secondary": "#16110F", success: "#1D7635", warning: "#A45D25", danger: "#9B2A4B", info: "#205F9F", focus: "#B13C11" },
    dark: { background: "#191513", surface: "#221D1A", "surface-raised": "#2D2724", border: "#48413D", "text-primary": "#F9F6F3", "text-secondary": "#C3BCB7", "action-primary": "#F8633F", "action-secondary": "#F9F6F3", success: "#73D083", warning: "#F1C45E", danger: "#E97294", info: "#7FB2EC", focus: "#F8633F" },
// dark-tech
    fonts: { body: ["Geologica", "Changa", "system-ui", "sans-serif"], display: ["TASA Orbiter", "Changa", "Geologica", "system-ui", "sans-serif"] },
    radius: { sm: 2, md: 4, lg: 8 }, shadow: 0.5,
    light: { background: "#F2F1EE", surface: "#FEFCFB", "surface-raised": "#FFFFFF", border: "#DBD7D2", "text-primary": "#1B1611", "text-secondary": "#5D5751", "action-primary": "#A45803", "action-secondary": "#E7E4E0", success: "#207963", warning: "#7F6A03", danger: "#B52332", info: "#136B94", focus: "#A45803" },
    dark: { background: "#15110D", surface: "#1F1A16", "surface-raised": "#27221D", border: "#38322C", "text-primary": "#F1ECE4", "text-secondary": "#B2ABA2", "action-primary": "#FB9F44", "action-secondary": "#2B2520", success: "#71D6A3", warning: "#E6DD5A", danger: "#F07683", info: "#76BBE2", focus: "#FB9F44" },
// warm
    fonts: { body: ["Merriweather Sans", "El Messiri", "system-ui", "sans-serif"], display: ["Vollkorn", "El Messiri", "Georgia", "serif"] },
    radius: { sm: 6, md: 10, lg: 16 }, shadow: 1,
    light: { background: "#F5F8F1", surface: "#FCFDFA", "surface-raised": "#FFFFFF", border: "#DBDCD1", "text-primary": "#252117", "text-secondary": "#625D51", "action-primary": "#596517", "action-secondary": "#F4E6D2", success: "#357855", warning: "#A45D25", danger: "#B63132", info: "#2B6991", focus: "#596517" },
    dark: { background: "#171610", surface: "#1F1E17", "surface-raised": "#28271F", border: "#3A382F", "text-primary": "#F1EFE6", "text-secondary": "#B8B4A6", "action-primary": "#B1C16D", "action-secondary": "#312A20", success: "#7ED1B7", warning: "#EBC070", danger: "#F68678", info: "#85BCE2", focus: "#B1C16D" },
// trust
    fonts: { body: ["Public Sans", "Mada", "Segoe UI", "system-ui", "sans-serif"], display: ["Public Sans", "Mada", "Segoe UI", "system-ui", "sans-serif"] },
    radius: { sm: 6, md: 8, lg: 12 }, shadow: 0.9,
    light: { background: "#F5F9FB", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D6E0E4", "text-primary": "#10212F", "text-secondary": "#4C5D6A", "action-primary": "#006C97", "action-secondary": "#E2EDF3", success: "#1E7546", warning: "#A45D25", danger: "#B23641", info: "#147175", focus: "#006C97" },
    dark: { background: "#0C1721", surface: "#131F2A", "surface-raised": "#1A2834", border: "#2D3C49", "text-primary": "#E9F0F5", "text-secondary": "#A7B7C3", "action-primary": "#6ABCE6", "action-secondary": "#1C2B37", success: "#7ED09C", warning: "#F0C374", danger: "#F28881", info: "#80C5C9", focus: "#6ABCE6" },
```

In `cli/src/contract/defaults.ts`, replace `defaultShadows`:

```ts
/** Three shadows in one colour (the style's dark text, so they never look like plain grey), scaled by strength. */
export function defaultShadows(ink = "#000000", strength = 1): Record<string, unknown> {
  const color = srgbColor(ink);
  const shadow = (y: number, blur: number, alpha: number) => ({
    $value: { color: { ...color, alpha: Number((alpha * strength).toFixed(4)) }, offsetX: px(0), offsetY: px(y), blur: px(blur), spread: px(0) },
  });
  return { $type: "shadow", sm: shadow(1, 2, 0.08), md: shadow(4, 12, 0.1), lg: shadow(12, 32, 0.14) };
}
```

In `cli/src/presets/build.ts`: `shadow: defaultShadows(spec.light["text-primary"], spec.shadow),` and in `presetAbout`:

```ts
  const main = spec.fonts.display[0] === spec.fonts.body[0]
    ? `${spec.fonts.body[0]} throughout`
    : `${spec.fonts.display[0]} for headings, ${spec.fonts.body[0]} for text`;
  const fonts = `${main}, ${spec.fonts.body[1]} for Arabic`;
```

- [ ] **Step 4: Regenerate the styles and the snapshot**

Run (from `cli/`): `bun run presets && bun test test/presets.test.ts --update-snapshots`
Expected: "wrote skill/presets/<id>" ×8 and the template; the snapshot file is rewritten. Read `git diff --stat cli/test/__snapshots__` and spot-check that only preset values changed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test test/presets.test.ts test/theme-fonts.test.ts test/contract-templates.test.ts`
Expected: PASS.

- [ ] **Step 6: Update tests that pinned old preset values**

Run the full suite (background, about 11 minutes). For each failure, check whether the test reads a preset or the template (`presetTheme`, `templateTokens`, `skill/presets/`, `tokens.template.json`). If it does, update the expected value to the new one and note the file in the commit message. Tests built on their own fixtures (`validTokens()`, `cli/test/fixtures/`) must not change; a failure there is a bug to debug with superpowers:systematic-debugging, not a value to update.
Expected: the full suite passes.

- [ ] **Step 7: Commit**

```bash
git add cli/src/presets/spec.ts cli/src/presets/build.ts cli/src/contract/defaults.ts skill/presets skill/contract/tokens.template.json cli/test
git commit -m "feat(presets): new fonts, colours, corners and tinted shadows for the eight starting styles"
```

---

### Task 4: Retire the replaced fonts from the kit

**Files:**
- Modify: `cli/src/preview/font-list.ts` (remove 8 entries), `cli/src/preview/fonts.ts`, `cli/scripts/notices.ts`, `cli/package.json`, `cli/bun.lock`, `THIRD-PARTY-NOTICES.txt`
- Delete: `skill/preview-kit/fonts/{archivo,dm-sans,fraunces,ibm-plex-sans,inter,playfair-display,source-sans-3,space-grotesk}.woff2` and their `LICENSE-*.txt`
- Create: `docs/cover/fonts/archivo.woff2`, `docs/cover/fonts/ibm-plex-sans.woff2` and their licences (moved, so the README cover keeps its look)
- Modify: `docs/cover/cover.html:7-8` (point at `fonts/`)
- Test: `cli/test/preview-fonts.test.ts`, `cli/test/theme-fonts.test.ts`, `cli/test/render.test.ts:99`, `cli/test/preview-server.test.ts:136-140`

**Interfaces:**
- Consumes: everything from Tasks 2 and 3.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `cli/test/preview-fonts.test.ts`, in "every starting style's fonts are included", replace the two `isBundledFamily` lines at the end with:

```ts
    expect(isBundledFamily("onest")).toBe(true);
    expect(isBundledFamily("Plus Jakarta Sans")).toBe(false);
  });

  test("the kit ships only the fonts the styles use (preset refresh)", () => {
    const used = new Set(PRESETS.flatMap((p) => [...p.fonts.body, ...p.fonts.display]).map((f) => f.toLowerCase()));
    expect(FONT_LIST.filter((f) => !used.has(f.family.toLowerCase())).map((f) => f.family)).toEqual([]);
```

(the test's closing `});` already follows). In `cli/test/theme-fonts.test.ts`, append:

```ts
describe("guides made before the preset refresh", () => {
  test("a retired font still loads in mockups, from Google Fonts (review focus)", () => {
    expect(themeFonts(withFonts(["Inter", "system-ui", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Inter", "google"]]);
  });
});
```

In `cli/test/render.test.ts:99`, change `fonts/inter.woff2` to `fonts/onest.woff2`. In `cli/test/preview-server.test.ts`, "serves the built-in fonts and their stylesheet": change `'font-family: "Inter";'` to `'font-family: "Onest";'` and `fonts/inter.woff2` to `fonts/onest.woff2`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/preview-fonts.test.ts test/theme-fonts.test.ts`
Expected: FAIL. The kit still lists Archivo, DM Sans, Fraunces, IBM Plex Sans, Inter, Playfair Display, Source Sans 3 and Space Grotesk, and Inter is "bundled".

- [ ] **Step 3: Implement**

1. Move the cover's two fonts first: `mkdir -p docs/cover/fonts`, then `git mv skill/preview-kit/fonts/archivo.woff2 docs/cover/fonts/archivo.woff2`, and the same for `ibm-plex-sans.woff2`, `LICENSE-archivo.txt` and `LICENSE-ibm-plex-sans.txt`. In `docs/cover/cover.html`, change `url("../../skill/preview-kit/fonts/archivo.woff2")` to `url("fonts/archivo.woff2")` and `url("../../skill/preview-kit/fonts/ibm-plex-sans.woff2")` to `url("fonts/ibm-plex-sans.woff2")` (Nunito stays in the kit; leave its line).
2. Remove the 8 retired entries from `FONT_LIST`, their imports and `EMBEDDED_FONT_FILES` entries from `cli/src/preview/fonts.ts`, and their `FONT_NAMES` lines from `cli/scripts/notices.ts`.
3. `git rm` the remaining retired files in `skill/preview-kit/fonts/` (`dm-sans`, `fraunces`, `inter`, `playfair-display`, `source-sans-3`, `space-grotesk`: the `.woff2` and the `LICENSE-*.txt`).
4. Run (from `cli/`): `bun remove @fontsource-variable/archivo @fontsource-variable/dm-sans @fontsource-variable/fraunces @fontsource-variable/ibm-plex-sans @fontsource-variable/inter @fontsource-variable/playfair-display @fontsource-variable/source-sans-3 @fontsource-variable/space-grotesk && bun run fonts && bun run notices`.
5. Check the cover: from the repo root, `bun docs/cover/render.ts` (it renders `docs/cover.png` from `cover.html`). Open the new `docs/cover.png` beside `git show HEAD:docs/cover.png > <scratch>/cover-before.png`: the title (Archivo) and body text (IBM Plex Sans) must look the same. Then restore the committed image with `git checkout docs/cover.png`, since nothing about the cover changed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test test/preview-fonts.test.ts test/theme-fonts.test.ts test/render.test.ts test/preview-server.test.ts test/notices.test.ts test/preview-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A skill/preview-kit/fonts docs/cover cli/src/preview cli/scripts/notices.ts cli/package.json cli/bun.lock THIRD-PARTY-NOTICES.txt cli/test
git commit -m "chore(fonts): retire the replaced fonts from the kit; the cover keeps its own copies"
```

---

### Task 5: Guidance: the type pairings guide, init's directions and the "default look" review note

**Files:**
- Create: `skill/knowledge/type-pairings.md`
- Modify: `skill/modes/init.md:28` (Research), `:34` (Directions), `:44` (describe each direction)
- Modify: `skill/knowledge/anti-patterns.md` (new section "Type and colour")
- Modify: `skill/modes/review.md:73` (the default look is advice)
- Modify: `skill/knowledge/visual-craft.md` (Type section)
- Modify: `skill/SKILL.md:96` (list the new guide)
- Modify: `skill/adapters/react-web/tokens.md` (Fonts: example font, Arabic companion), `skill/adapters/plain-web/tokens.md` (Fonts: Arabic companion)
- Test: `cli/test/knowledge.test.ts`

**Interfaces:**
- Consumes: the style fonts in `PRESETS` (Task 3).
- Produces: nothing in code.

- [ ] **Step 1: Write the failing tests**

In `cli/test/knowledge.test.ts`, add `import { PRESETS } from "../src/presets/spec";`, add `"default look"` to the `anti-patterns.md` `mustMention` list, and append:

```ts
describe("knowledge: type pairings (preset refresh)", () => {
  covers("type-pairings.md", {
    minLines: 60,
    mustMention: ["Inter", "Space Grotesk", "Fraunces", "Playfair Display", "purple", "cream", "neon", "Arabic", "tabular", "lining", "Fontsource", "second"],
  });

  test("it lists every starting style's own pairing, Arabic companion included", () => {
    const text = read("type-pairings.md");
    for (const p of PRESETS) for (const family of [p.fonts.body[0]!, p.fonts.display[0]!, p.fonts.body[1]!]) expect(text).toContain(family);
  });

  test("init's directions and review point to it", () => {
    const skill = (rel: string) => readFileSync(join(KNOWLEDGE, "..", rel), "utf8");
    expect(skill("modes/init.md")).toContain("../knowledge/type-pairings.md");
    expect(skill("modes/review.md")).toContain("../knowledge/type-pairings.md");
    expect(skill("SKILL.md")).toContain("knowledge/type-pairings.md");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/knowledge.test.ts`
Expected: FAIL (`type-pairings.md` doesn't exist; anti-patterns has no "default look").

- [ ] **Step 3: Write `skill/knowledge/type-pairings.md`**

```markdown
# Type pairings

Fonts are one of the first things that make a site look generated: most sites built by coding agents use the same handful. This guide lists checked pairings by mood, each with a text font, a heading font and an Arabic companion, and the fonts and colour looks to leave out unless the developer asks for them.

## How to use it

- In init's directions, give each direction a different pairing from the mood that fits the brief, and say in one line why it suits the brand.
- Put the Arabic companion second in both font lists, such as `["Onest", "Readex Pro", "system-ui", "sans-serif"]`. Arabic letters use it and Latin letters keep the main font. Apps download it only when a page shows Arabic text.
- The developer's own fonts (a brand font, a font they name) always come first.
- Mockups load fonts outside the starting styles from Google Fonts. Apps load every font with its Fontsource package, as the stack guide's Fonts section says.

## Overused: leave these out unless asked

**Fonts:** Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Space Grotesk, DM Sans, Manrope, Outfit, Plus Jakarta Sans, Geist, IBM Plex Sans, Bricolage Grotesque, Syne, Fraunces, Playfair Display, Instrument Serif, Instrument Sans, Newsreader, Crimson Pro, Lora, Cormorant and DM Serif. Also a monospace font for labels and headings when the product isn't a code tool.

**Colour looks:** purple or indigo accents and purple-to-blue gradients; a cream background with a terracotta accent and serif headings; near-black with one neon cyan or green accent; Tailwind's default colours used as they are, such as blue-600 buttons on slate or zinc greys.

These are fine when the developer asks for them or the brand already uses them. Otherwise they make a product look like a template before anyone reads a word.

## Pairings by mood

### Calm and precise (tools, dashboards, developer products)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Onest | Onest | Readex Pro | Open shapes and tabular figures. The Minimal style's pair. It has no italic, so avoid long italic passages. |
| Hanken Grotesk | Hanken Grotesk | Mada | A quiet grotesk with true italics. |
| Libre Franklin | Libre Franklin | Readex Pro | A classic American gothic, firm at small sizes. |

### Loud and modern (marketing, launches, sports, media)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Zalando Sans | Zalando Sans Expanded | Alexandria | Wide headlines from the same family. The Bold style's pair. Latin letters only: no Cyrillic or Greek. |
| Archivo | Archivo (weights 800–900) | Beiruti | A compact, punchy grotesk. |
| Libre Franklin | Big Shoulders | Alexandria | Tall, condensed headlines for sports and posters. |

### Technical (developer tools, AI products, analytics)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Geologica | TASA Orbiter | Changa | Even texture at small sizes, and a futuristic heading without game-screen clichés. The Dark Tech style's pair. |
| Funnel Sans | Funnel Display | Kufam | Engineered shapes with a distinct display cut. |
| Golos Text | Golos Text | Changa | Neutral and very legible in dense tables, with Cyrillic. |

### Earthy and crafted (food, hospitality, travel, handmade goods)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Merriweather Sans | Vollkorn | El Messiri | A large, open text font with true italics under a warm book serif. The Warm style's pair. Vollkorn's figures are old-style by default: use lining figures for prices. |
| Commissioner | Besley | Markazi Text | A friendly grotesk under a sturdy, inky serif. |

### Literary (publishing, long reads, portfolios)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Source Serif 4 | Noto Serif Display | Markazi Text | A reading serif under a refined, high-contrast display serif. The Editorial style's pair. |
| Source Serif 4 | Eczar | Markazi Text | Livelier, more confident headings (no Cyrillic). |
| Literata | Literata | Noto Naskh Arabic | A reading face made for e-books, with a classic Naskh. |

### Reassuring (banking, insurance, healthcare, government)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Public Sans | Public Sans | Mada | Made for government services; its tailed l keeps I, l and 1 apart in account numbers. The Trust style's pair. Latin letters only. |
| Atkinson Hyperlegible Next | Atkinson Hyperlegible Next | Mada | Made for readers with low vision: every letter is distinct. |
| Source Sans 3 | Source Sans 3 | Readex Pro | When Cyrillic or Greek is needed. Common in generated sites, so give it a palette of its own. |

### Gentle (wellness, journaling, community)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Nunito | Nunito | Rubik | Rounded and friendly. The Soft style's pair. It has no tabular figures, so avoid it in tables of numbers. |
| Lexend | Lexend | Readex Pro | Made for easy reading; Readex Pro is its Arabic sibling. |
| Rubik | Rubik | Rubik | Soft corners, and one family covers Latin and Arabic. |

### Playful (games, learning, kids, social)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Nunito | Fredoka | Baloo Bhaijaan 2 | Round, bouncy headings. The Playful style's pair. |
| Gabarito | Gabarito | Lemonada | A bouncy geometric with heavy weights. |
| Baloo 2 | Baloo 2 | Baloo Bhaijaan 2 | One design across Latin and Arabic. |

## Checking a pairing

- Both fonts have the weights the type roles use: 400, 500, 600 and 700.
- Numbers in tables, prices and timers use tabular, lining figures: `font-variant-numeric: tabular-nums lining-nums`.
- Text stays readable at 14–16 px: a tall x-height, open shapes, and I, l and 1 easy to tell apart.
- It covers the scripts the app needs: Cyrillic, Greek, Vietnamese, Arabic.
- Fontsource has it (`fontsource.org/fonts/<name>`), so the app can serve it itself.
```

- [ ] **Step 4: Update the modes, knowledge and stack guides**

`skill/modes/init.md`:
- Research, the "Always:" line: after `[anti-patterns](../knowledge/anti-patterns.md),` add ` [type pairings](../knowledge/type-pairings.md),`.
- Directions, after the sentence that ends "not one look with three accent colours.", add: "Each direction names its font pairing (text, headings and an Arabic companion second in both font lists) from [type pairings](../knowledge/type-pairings.md), different from the other directions', with one line on why it suits the brief. Leave out the overused fonts and colour looks listed there unless the developer asks for them."
- Directions, step 4: change the example to `("Calm: soft neutrals, rounded corners, generous spacing; Onest, with Readex Pro for Arabic")`.

`skill/knowledge/anti-patterns.md`: before `## Layout`, add:

```markdown
## Type and colour

### The default look

- **Looks like:** the fonts most generated sites share (Inter, Space Grotesk, Fraunces, Playfair Display and the rest of the list in [type pairings](type-pairings.md)), purple or indigo accents, cream with terracotta and a serif, near-black with one neon accent, or Tailwind's default colours used as they are.
- **Why it hurts:** people have seen it on hundreds of generated sites, so the product reads as a template before they read a word, and the brand doesn't come through.
- **Instead:** a pairing from [type pairings](type-pairings.md) that fits the guide's Direction, and an accent from the subject's own world. This one is advice: if the developer chose these on purpose, leave them.
```

`skill/modes/review.md`, after the **Categories** paragraph, add: "The default look (see [anti-patterns](../knowledge/anti-patterns.md) and [type pairings](../knowledge/type-pairings.md)) is advice, not a fault: report it at most once per review, as `anti-pattern` and `minor`, and say the developer may keep it on purpose."

`skill/knowledge/visual-craft.md`, Type section:
- After the "One family is enough; two at most." paragraph, add: "**Fonts with a voice.** Pick the pairing for the brand's mood from [type pairings](type-pairings.md), with an Arabic companion second in the list when the app may show Arabic. The fonts most generated sites share make a product look like a template."
- Change the tabular-figures bullet to: "Tabular, lining figures (`font-variant-numeric: tabular-nums lining-nums`) for prices, times, tables and anything that updates in place, so numbers don't jiggle and old-style figures don't shrink."

`skill/SKILL.md:96`: after `[anti-patterns](knowledge/anti-patterns.md),` add ` [type pairings](knowledge/type-pairings.md),`.

`skill/adapters/react-web/tokens.md`, Fonts section: change the example to Onest (`npm install @fontsource/onest`, `import "@fontsource/onest/400.css";`, `import "@fontsource/onest/600.css";`; "Onest is `@fontsource/onest`, Source Serif 4 is `@fontsource/source-serif-4`") and add after the import example: "An Arabic companion, second in the theme's font list (such as Readex Pro), loads the same way: install its package and import the same weights. Its Arabic files download only when a page shows Arabic text."

`skill/adapters/plain-web/tokens.md`, Fonts section, after "Fontsource has the files for every Google font…": add "For an Arabic companion, copy only its Arabic file (`<name>-arabic-wght-normal.woff2` in Fontsource's variable package) and add the `unicode-range` line from Fontsource's CSS for that file, so it's used for Arabic letters only. A Google Fonts link does this by itself."

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test test/knowledge.test.ts test/skill-content.test.ts test/skill-modes.test.ts test/contract-templates.test.ts`
Expected: PASS (`skill-content` checks every link and each file's line limit).

- [ ] **Step 6: Commit**

```bash
git add skill/knowledge skill/modes skill/SKILL.md skill/adapters cli/test/knowledge.test.ts
git commit -m "docs(skill): type pairings guide; init's directions name a pairing; reviews note the default look as advice"
```

---

### Task 6: The whole change, end to end

**Files:** none new.

- [ ] **Step 1: Full suite and type check**

Run (from `cli/`, background): `bun run typecheck && bun test --timeout 300000`
Expected: 0 fail.

- [ ] **Step 2: Build and check the plugin and the tool**

Run (from `cli/`): `bun run build`, then `bun scripts/build-plugin.ts`.
Expected: the tool builds, and `dist/claude-code/skills/motif/preview-kit/fonts/` has the new files and none of the retired ones (`ls` it).

- [ ] **Step 3: Look at every style**

Run, from a new empty scratch folder (it writes `design/previews/` there): `bun C:/Users/PC/GitHub/motif/cli/src/main.ts preview --gallery --png-only`
Expected: 16 PNGs (`preset-<id>.png` and `preset-<id>.dark.png`) and no "Shown with a fallback font" note. Open them and compare each style with the review page. Fix anything that differs (a font not loading, a wrong colour) before finishing.

- [ ] **Step 4: Record the result**

Append to the ledger the commits, the suite result and anything ruled during the tasks.
