// The CSS variables every stack starts from: one per role, light and dark, and reduced motion.
import { cssColor, cssCubicBezier, num } from "./css-values";
import { CSS_HEADER } from "./header";
import type { Theme, ThemeVariant } from "./theme";

export const cssVar = (group: string, name: string) => `--motif-${group}-${name}`;
export const indent = (lines: string[], n: number) => lines.map((l) => (l ? " ".repeat(n) + l : "")).join("\n");

function rootVariables(theme: Theme): string[] {
  const lines: string[] = [];
  for (const c of theme.colors) lines.push(`${cssVar("color", c.name)}: ${cssColor(c.light)};`);
  for (const s of theme.space) lines.push(`${cssVar("space", s.name)}: ${s.css};`);
  for (const r of theme.radius) lines.push(`${cssVar("radius", r.name)}: ${r.css};`);
  for (const s of theme.shadows) lines.push(`${cssVar("shadow", s.name)}: ${s.css};`);
  for (const f of theme.fonts) {
    const p = cssVar("font", f.name);
    lines.push(`${p}-family: ${f.family};`, `${p}-size: ${f.sizeCss};`, `${p}-weight: ${f.weight};`, `${p}-line-height: ${num(f.lineHeight)};`);
    if (f.letterSpacing) lines.push(`${p}-letter-spacing: ${f.letterSpacing};`);
  }
  for (const d of theme.durations) lines.push(`${cssVar("duration", d.name)}: ${num(d.ms)}ms;`);
  for (const e of theme.easings) lines.push(`${cssVar("easing", e.name)}: ${cssCubicBezier(e.points)};`);
  return lines;
}

const darkVariables = (theme: Theme) => theme.colors.map((c) => `${cssVar("color", c.name)}: ${cssColor(c.dark)};`);

/**
 * What one variant changes, as three blocks: light (and every non-colour value), and dark twice.
 * In dark mode the variant block comes after the base dark block, so a role the variant changes in light is
 * listed in dark too (with its dark value); otherwise it would show its light colour there.
 */
function variantBlocks(base: Theme, variant: ThemeVariant): string[] {
  const sel = `:root[data-variant="${variant.id}"]`;
  const baseLight = new Set(rootVariables(base));
  const light = rootVariables(variant.theme).filter((l) => !baseLight.has(l));
  const lightColors = new Set(variant.theme.colors.filter((c) => !baseLight.has(`${cssVar("color", c.name)}: ${cssColor(c.light)};`)).map((c) => c.name));
  const baseDark = new Set(darkVariables(base));
  const dark = variant.theme.colors
    .filter((c) => lightColors.has(c.name) || !baseDark.has(`${cssVar("color", c.name)}: ${cssColor(c.dark)};`))
    .map((c) => `${cssVar("color", c.name)}: ${cssColor(c.dark)};`);
  const out: string[] = [];
  if (light.length > 0) out.push(`${sel} {`, indent(light, 2), "}", "");
  if (dark.length > 0) {
    out.push("@media (prefers-color-scheme: dark) {", `  ${sel}:not([data-theme="light"]) {`, indent(dark, 4), "  }", "}", "");
    out.push(`${sel}[data-theme="dark"] {`, indent(dark, 2), "}", "");
  }
  return out;
}

export function motifCss(theme: Theme, variants: ThemeVariant[] = []): string {
  return [
    CSS_HEADER,
    "",
    ":root,",
    '[data-theme="light"] {',
    indent(["color-scheme: light;", ...rootVariables(theme)], 2),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    indent(["color-scheme: dark;", ...darkVariables(theme)], 4),
    "  }",
    "}",
    "",
    '[data-theme="dark"] {',
    indent(["color-scheme: dark;", ...darkVariables(theme)], 2),
    "}",
    "",
    ...variants.flatMap((v) => variantBlocks(theme, v)),
    "@media (prefers-reduced-motion: reduce) {",
    "  *,",
    "  *::before,",
    "  *::after {",
    "    animation-duration: 0.01ms !important;",
    "    animation-iteration-count: 1 !important;",
    "    transition-duration: 0.01ms !important;",
    "    scroll-behavior: auto !important;",
    "  }",
    "}",
    "",
  ].join("\n");
}
