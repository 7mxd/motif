import { motifCss } from "../stacks/react-web/generate";
import { num } from "./css-values";
import type { Theme } from "./theme";
import { fontStylesheets, googleFontsUrl } from "./theme-fonts";

export const PREVIEW_CSS_PATH = "design/previews/motif.css";

/**
 * The theme's CSS variables plus spring values, which the preview kit hands to Motion.
 * Theme fonts from Google Fonts are not imported here: an @import would hold the page up on a network that
 * doesn't answer. The preview server loads them after the page (see injectKit); this lists them for anyone
 * opening a mockup without Motif.
 */
export function previewCss(theme: Theme, fontCssUrl: (family: string, weights: number[]) => string = googleFontsUrl): string {
  const springs = theme.springs.flatMap((s) => [
    `  --motif-spring-${s.name}-duration: ${num(s.duration)};`,
    `  --motif-spring-${s.name}-bounce: ${num(s.bounce)};`,
  ]);
  const links = fontStylesheets(theme, fontCssUrl);
  const fonts = links.length > 0 ? `\n/* Theme fonts from Google Fonts. Opening a mockup without Motif, link these in its <head>:\n${links.map((l) => `   ${l}`).join("\n")} */\n` : "";
  return `${motifCss(theme)}${fonts}\n/* Springs for the preview kit: duration in seconds and bounce, as Motion takes them. */\n:root {\n${springs.join("\n")}\n}\n`;
}
