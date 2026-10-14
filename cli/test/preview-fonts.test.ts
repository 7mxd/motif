import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FONT_LIST, FONTS_CSS_HEADER, fontFaceCss, isBundledFamily } from "../src/preview/font-list";
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
      const bytes = readFileSync(join(FONTS, `${font.slug}.woff2`));
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(bytes.length).toBeLessThan(80_000);
      expect(readFileSync(join(FONTS, `LICENSE-${font.slug}.txt`), "utf8")).toContain("SIL Open Font License");
    }
  });

  test.skipIf(!existsSync(MODULES))("the weight ranges match the fonts' own packages", () => {
    for (const font of FONT_LIST) {
      const css = readFileSync(join(MODULES, font.slug, "wght.css"), "utf8");
      expect(css).toContain(`font-weight: ${font.weight[0]} ${font.weight[1]};`);
    }
  });

  test("fonts.css declares every font, for use with or without the tool", () => {
    expect(lf(readFileSync(join(FONTS, "fonts.css"), "utf8"))).toBe(`${FONTS_CSS_HEADER}\n\n${fontFaceCss((file) => file)}`);
    expect(fontFaceCss((file) => file)).toContain(
      '@font-face {\n  font-family: "Source Serif 4";\n  font-style: normal;\n  font-display: swap;\n  font-weight: 200 900;\n  src: url("source-serif-4.woff2") format("woff2");\n}',
    );
  });

  test("the tool embeds every font file and the stylesheet", async () => {
    expect(Object.keys(EMBEDDED_FONT_FILES).sort()).toEqual(FONT_LIST.map((f) => `${f.slug}.woff2`).sort());
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
});
