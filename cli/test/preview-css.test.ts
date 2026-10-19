import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { CSS_HEADER } from "../src/generate/header";
import { previewCss } from "../src/generate/preview-css";
import { motifCss } from "../src/generate/motif-css";
import { flatTokensFile } from "../src/generate/fallback";
import { buildTheme, buildThemeSet } from "../src/generate/theme";
import { docFrom, FIXTURES, hexColor, twoVariantTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");

describe("previewCss", () => {
  test("is the theme's CSS plus spring values for the kit", () => {
    const css = previewCss(buildTheme(docFrom(validTokens())));
    expect(css.startsWith(CSS_HEADER)).toBe(true);
    expect(css).toContain("--motif-color-background: #F9FAFB;");
    expect(css).toContain("--motif-spring-smooth-duration: 0.4;");
    expect(css).toContain("--motif-spring-smooth-bounce: 0.1;");
  });

  test("a theme font outside the bundle is listed for opening mockups without Motif, never @imported", () => {
    const tokens = validTokens();
    tokens.primitive.font.sans.$value = ["Plus Jakarta Sans", "system-ui", "sans-serif"];
    const css = previewCss(buildTheme(docFrom(tokens)));
    expect(css.split("\n")[0]).toBe(CSS_HEADER);
    expect(css).not.toContain("@import");
    expect(css).toContain("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@");
  });

  test("bundled and system fonts add no imports", () => {
    expect(previewCss(buildTheme(docFrom(validTokens())))).not.toContain("@import");
  });
});

describe("motif tokens --stack preview", () => {
  const ctx = (stack: string) => ({ positionals: [], flags: { stack } });
  test("writes design/previews/motif.css and nothing else", async () => {
    const root = makeProject({ "package.json": JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { vite: "^6" } }), "src/main.tsx": "", "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx("preview"));
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(root, "design/previews/motif.css"), "utf8")).toContain("--motif-spring-snappy-duration");
    expect(existsSync(join(root, "src/styles"))).toBe(false);
  });
  test("an unknown --stack is a usage error", async () => {
    const r = await runTokens(makeProject({ "design/tokens.json": TOKENS }), ctx("flutter"));
    expect(r.exitCode).toBe(2);
  });
});

describe("variant blocks in the CSS", () => {
  const baseline = (name: string) => readFileSync(join(FIXTURES, "generated-baseline", name), "utf8");
  const base = buildTheme(docFrom(validTokens()));
  const DECL = [{ id: "women", label: "Women", default: true }, { id: "men", label: "Men" }];

  test("a guide without variants gives byte-identical files to before", () => {
    expect(motifCss(base)).toBe(baseline("motif.css"));
    expect(motifCss(base, [])).toBe(baseline("motif.css"));
    expect(previewCss(base, (f, w) => `https://fonts.test/${f}:${w.join(",")}`)).toBe(baseline("preview.css"));
    expect(flatTokensFile(base).content).toBe(baseline("tokens.flat.json"));
  });

  test("a variant that changes one colour gets exactly the three blocks, before the reduced-motion block", () => {
    const t = validTokens();
    t.color.surface.$extensions["dev.motif"].variants = { men: { value: hexColor("#123456"), dark: hexColor("#654321") } };
    t.$extensions = { "dev.motif": { variants: DECL } };
    const set = buildThemeSet(docFrom(t));
    const css = motifCss(set.base, set.variants);
    const blocks = [
      ':root[data-variant="men"] {\n  --motif-color-surface: #123456;\n}',
      '@media (prefers-color-scheme: dark) {\n  :root[data-variant="men"]:not([data-theme="light"]) {\n    --motif-color-surface: #654321;\n  }\n}',
      ':root[data-variant="men"][data-theme="dark"] {\n  --motif-color-surface: #654321;\n}',
    ].join("\n\n");
    expect(css).toContain(`}\n\n${blocks}\n\n@media (prefers-reduced-motion`);
    expect(css.indexOf(blocks)).toBeGreaterThan(css.indexOf('[data-theme="dark"] {'));
  });

  test("no variant blocks when nothing differs", () => {
    const t = validTokens();
    t.$extensions = { "dev.motif": { variants: DECL } };
    const set = buildThemeSet(docFrom(t));
    expect(motifCss(set.base, set.variants)).toBe(baseline("motif.css"));
  });

  test("non-colour differences go in the light block only", () => {
    const set = buildThemeSet(docFrom(twoVariantTokens()));
    const css = motifCss(set.base, set.variants);
    const start = css.indexOf(':root[data-variant="men"] {');
    const light = css.slice(start, css.indexOf("}\n", start));
    expect(light).toContain("--motif-radius-md: 12px;");
    expect(css.match(/--motif-radius-md/g)).toHaveLength(2);
  });

  test("a colour that changes only in light still appears in the variant's dark blocks, with the base dark value", () => {
    const set = buildThemeSet(docFrom(twoVariantTokens()));
    const css = motifCss(set.base, set.variants);
    const darkMedia = css.slice(css.indexOf(':root[data-variant="men"]:not'));
    const darkAttr = css.slice(css.indexOf(':root[data-variant="men"][data-theme="dark"]'));
    for (const part of [darkMedia, darkAttr]) {
      expect(part).toContain("--motif-color-border: #374151;");
      expect(part).toContain("--motif-color-surface: #654321;");
    }
    expect(css).toContain("--motif-color-border: #ABCDEF;");
    // roles that don't change are left out of the variant's blocks
    expect(darkAttr.slice(0, darkAttr.indexOf("}\n"))).not.toContain("--motif-color-background");
  });

  test("the preview CSS carries the variant blocks", () => {
    const set = buildThemeSet(docFrom(twoVariantTokens()));
    expect(previewCss(set.base, undefined, set.variants)).toContain(':root[data-variant="men"] {');
  });
});
