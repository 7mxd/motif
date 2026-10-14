// Copies the starting styles' fonts from the pinned @fontsource-variable packages into skill/preview-kit/fonts/.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_LIST, FONTS_CSS_HEADER, fontFaceCss } from "../src/preview/font-list";

const OUT = join(import.meta.dir, "../../skill/preview-kit/fonts");
const MODULES = join(import.meta.dir, "../node_modules/@fontsource-variable");
mkdirSync(OUT, { recursive: true });
for (const font of FONT_LIST) {
  copyFileSync(join(MODULES, font.slug, "files", `${font.slug}-latin-wght-normal.woff2`), join(OUT, `${font.slug}.woff2`));
  copyFileSync(join(MODULES, font.slug, "LICENSE"), join(OUT, `LICENSE-${font.slug}.txt`));
  console.log(`copied ${font.family}`);
}
writeFileSync(join(OUT, "fonts.css"), `${FONTS_CSS_HEADER}\n\n${fontFaceCss((file) => file)}`);
console.log("wrote skill/preview-kit/fonts/fonts.css");
