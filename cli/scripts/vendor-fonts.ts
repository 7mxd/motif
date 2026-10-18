// Copies the starting styles' fonts from the pinned @fontsource-variable packages into skill/preview-kit/fonts/:
// each style's Latin file, and only the Arabic letters of each Arabic companion.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_LIST, FONTS_CSS_HEADER, fontFaceCss, fontFile } from "../src/preview/font-list";

const OUT = join(import.meta.dir, "../../skill/preview-kit/fonts");
const MODULES = join(import.meta.dir, "../node_modules/@fontsource-variable");
mkdirSync(OUT, { recursive: true });
for (const font of FONT_LIST) {
  const source = `${font.slug}-${font.arabic ? "arabic" : "latin"}-wght-normal.woff2`;
  copyFileSync(join(MODULES, font.slug, "files", source), join(OUT, fontFile(font)));
  copyFileSync(join(MODULES, font.slug, "LICENSE"), join(OUT, `LICENSE-${font.slug}.txt`));
  console.log(`copied ${font.family}${font.arabic ? " (Arabic letters)" : ""}`);
}
writeFileSync(join(OUT, "fonts.css"), `${FONTS_CSS_HEADER}\n\n${fontFaceCss((file) => file)}`);
console.log("wrote skill/preview-kit/fonts/fonts.css");
