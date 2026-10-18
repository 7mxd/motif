import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ARABIC_RANGE, FONT_LIST, FONTS_CSS_HEADER, bundledCoverage, fontFaceCss, fontFile, isBundledFamily } from "../src/preview/font-list";
import { EMBEDDED_FONT_FILES, FONTS_CSS } from "../src/preview/fonts";
import { PRESETS } from "../src/presets/spec";

const FONTS = join(import.meta.dir, "../../skill/preview-kit/fonts");
const MODULES = join(import.meta.dir, "../node_modules/@fontsource-variable");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("the fonts Motif ships", () => {
  test("every starting style's fonts are included", () => {
    for (const preset of PRESETS) {
      expect(isBundledFamily(preset.fonts.body[0]!)).toBe(true);
      expect(isBundledFamily(preset.fonts.display[0]!)).toBe(true);
    }
    expect(isBundledFamily("inter")).toBe(true);
    expect(isBundledFamily("Plus Jakarta Sans")).toBe(false);
  });

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

  test("fonts.css declares every font, for use with or without the tool", () => {
    expect(lf(readFileSync(join(FONTS, "fonts.css"), "utf8"))).toBe(`${FONTS_CSS_HEADER}\n\n${fontFaceCss((file) => file)}`);
    expect(fontFaceCss((file) => file)).toContain(
      '@font-face {\n  font-family: "Source Serif 4";\n  font-style: normal;\n  font-display: swap;\n  font-weight: 200 900;\n  src: url("source-serif-4.woff2") format("woff2");\n}',
    );
  });

  test("the tool embeds every font file and the stylesheet", async () => {
    expect(Object.keys(EMBEDDED_FONT_FILES).sort()).toEqual(FONT_LIST.map(fontFile).sort());
    for (const [name, path] of Object.entries(EMBEDDED_FONT_FILES)) {
      expect((await Bun.file(path).arrayBuffer()).byteLength).toBe(statSync(join(FONTS, name)).size);
    }
    expect(lf(FONTS_CSS)).toBe(lf(readFileSync(join(FONTS, "fonts.css"), "utf8")));
  });

  test("the kit README tells agents about the fonts", () => {
    const readme = readFileSync(join(import.meta.dir, "../../skill/preview-kit/README.md"), "utf8");
    expect(readme).toContain("## Fonts");
    expect(readme).toContain("fonts/fonts.css");
  });

  test("the kit README says what to tell the developer when a font fell back (backlog)", () => {
    const readme = readFileSync(join(import.meta.dir, "../../skill/preview-kit/README.md"), "utf8");
    for (const s of ["missingFonts", "tell the developer", "installed on this computer", "Fonts section"]) expect(readme).toContain(s);
  });
});

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
