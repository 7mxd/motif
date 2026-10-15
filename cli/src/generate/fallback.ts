import { motifCss } from "../stacks/react-web/generate";
import { cssColor, cssCubicBezier, num } from "./css-values";
import { JSON_COMMENT, type GeneratedFile } from "./header";
import type { Theme } from "./theme";

export const FALLBACK_DIR = "design/generated";

/** Every role with CSS-ready values, for agents to map by hand onto stacks Motif doesn't support yet. */
export function flatTokens(theme: Theme): Record<string, unknown> {
  const out: Record<string, unknown> = { $comment: JSON_COMMENT };
  for (const c of theme.colors) out[`color.${c.name}`] = { light: cssColor(c.light), dark: cssColor(c.dark) };
  for (const s of theme.space) out[`space.${s.name}`] = s.css;
  for (const r of theme.radius) out[`radius.${r.name}`] = r.css;
  for (const s of theme.shadows) out[`shadow.${s.name}`] = s.css;
  for (const f of theme.fonts) {
    out[`font.${f.name}`] = {
      family: f.family,
      size: f.sizeCss,
      weight: f.weight,
      lineHeight: f.lineHeight,
      ...(f.letterSpacing ? { letterSpacing: f.letterSpacing } : {}),
    };
  }
  for (const d of theme.durations) out[`duration.${d.name}`] = `${num(d.ms)}ms`;
  for (const e of theme.easings) out[`easing.${e.name}`] = cssCubicBezier(e.points);
  for (const s of theme.springs) out[`spring.${s.name}`] = { duration: s.duration, bounce: s.bounce };
  return out;
}

export function flatTokensFile(theme: Theme): GeneratedFile {
  return { path: `${FALLBACK_DIR}/tokens.flat.json`, content: JSON.stringify(flatTokens(theme), null, 2) + "\n" };
}

export function generateFallback(theme: Theme): GeneratedFile[] {
  return [{ path: `${FALLBACK_DIR}/motif.css`, content: motifCss(theme) }, flatTokensFile(theme)];
}
