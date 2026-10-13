import { motifCss } from "../stacks/react-web/generate";
import { num } from "./css-values";
import type { Theme } from "./theme";

export const PREVIEW_CSS_PATH = "design/previews/motif.css";

/** The theme's CSS variables plus spring values, which the preview kit hands to Motion. */
export function previewCss(theme: Theme): string {
  const springs = theme.springs.flatMap((s) => [
    `  --motif-spring-${s.name}-duration: ${num(s.duration)};`,
    `  --motif-spring-${s.name}-bounce: ${num(s.bounce)};`,
  ]);
  return `${motifCss(theme)}\n/* Springs for the preview kit: duration in seconds and bounce, as Motion takes them. */\n:root {\n${springs.join("\n")}\n}\n`;
}
