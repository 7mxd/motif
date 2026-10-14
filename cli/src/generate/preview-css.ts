import { motifCss } from "../stacks/react-web/generate";
import { num } from "./css-values";
import { CSS_HEADER } from "./header";
import type { Theme } from "./theme";
import { googleFontsUrl, themeFonts } from "./theme-fonts";

export const PREVIEW_CSS_PATH = "design/previews/motif.css";

/** The theme's CSS variables plus spring values, which the preview kit hands to Motion. */
export function previewCss(theme: Theme): string {
  const imports = themeFonts(theme)
    .filter((f) => f.source === "google")
    .map((f) => `@import url("${googleFontsUrl(f.family, f.weights)}");`);
  const base = motifCss(theme);
  // @import must come before every rule; after the header comment keeps the file recognisable as Motif's.
  const css = imports.length > 0 ? base.replace(`${CSS_HEADER}\n`, `${CSS_HEADER}\n${imports.join("\n")}\n`) : base;
  const springs = theme.springs.flatMap((s) => [
    `  --motif-spring-${s.name}-duration: ${num(s.duration)};`,
    `  --motif-spring-${s.name}-bounce: ${num(s.bounce)};`,
  ]);
  return `${css}\n/* Springs for the preview kit: duration in seconds and bounce, as Motion takes them. */\n:root {\n${springs.join("\n")}\n}\n`;
}
