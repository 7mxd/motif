import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cssColor, cssCubicBezier, num } from "../../generate/css-values";
import { CSS_HEADER, TS_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme } from "../../generate/theme";
import { stripBom } from "../../text";

export type TailwindVersion = "v4" | "v3" | "none";

const V4_PACKAGES = ["@tailwindcss/vite", "@tailwindcss/postcss", "@tailwindcss/cli"];

export function detectTailwind(appDir: string): TailwindVersion {
  let deps: Record<string, unknown>;
  try {
    const pkg = JSON.parse(stripBom(readFileSync(join(appDir, "package.json"), "utf8")));
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return "none";
  }
  if (V4_PACKAGES.some((d) => Object.hasOwn(deps, d))) return "v4";
  if (!Object.hasOwn(deps, "tailwindcss")) return "none";
  return /^[\^~>=<\s]*[0-3]\./.test(String(deps.tailwindcss)) ? "v3" : "v4";
}

export function chooseSrcDir(appDir: string): string {
  if (existsSync(join(appDir, "src"))) return "src";
  if (existsSync(join(appDir, "app"))) return "app";
  return "src";
}

const cssVar = (group: string, name: string) => `--motif-${group}-${name}`;
const indent = (lines: string[], n: number) => lines.map((l) => (l ? " ".repeat(n) + l : "")).join("\n");

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

export function motifCss(theme: Theme): string {
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

export function tailwindCss(theme: Theme): string {
  const lines = [
    "--color-*: initial;",
    "--radius-*: initial;",
    "--shadow-*: initial;",
    "--text-*: initial;",
    "--font-*: initial;",
    "--ease-*: initial;",
    "",
  ];
  for (const c of theme.colors) lines.push(`--color-${c.name}: var(${cssVar("color", c.name)});`);
  // The base keeps sizing utilities working; a key per role makes p-5 exactly space.5 even on a non-linear scale.
  if (theme.space.some((s) => s.name === "1")) lines.push(`--spacing: var(${cssVar("space", "1")});`);
  for (const s of theme.space) lines.push(`--spacing-${s.name}: var(${cssVar("space", s.name)});`);
  // The resets also remove the bare --radius and --shadow, so plain `rounded` and `shadow` need them back.
  const baseRadius = theme.radius.find((r) => r.name === "sm") ?? theme.radius[0];
  if (baseRadius) lines.push(`--radius: var(${cssVar("radius", baseRadius.name)});`);
  for (const r of theme.radius) lines.push(`--radius-${r.name}: var(${cssVar("radius", r.name)});`);
  const baseShadow = theme.shadows.find((s) => s.name === "sm") ?? theme.shadows[0];
  if (baseShadow) lines.push(`--shadow: var(${cssVar("shadow", baseShadow.name)});`);
  for (const s of theme.shadows) lines.push(`--shadow-${s.name}: var(${cssVar("shadow", s.name)});`);
  for (const f of theme.fonts) {
    const p = cssVar("font", f.name);
    lines.push(
      `--font-${f.name}: var(${p}-family);`,
      `--text-${f.name}: var(${p}-size);`,
      `--text-${f.name}--line-height: var(${p}-line-height);`,
      `--text-${f.name}--font-weight: var(${p}-weight);`,
    );
    if (f.letterSpacing) lines.push(`--text-${f.name}--letter-spacing: var(${p}-letter-spacing);`);
  }
  if (theme.fonts.some((f) => f.name === "body")) lines.push(`--default-font-family: var(${cssVar("font", "body")}-family);`);
  for (const e of theme.easings) lines.push(`--ease-${e.name}: var(${cssVar("easing", e.name)});`);
  // `transition*` classes take their timing from these two variables.
  if (theme.durations.some((d) => d.name === "base")) lines.push(`--default-transition-duration: var(${cssVar("duration", "base")});`);
  if (theme.easings.some((e) => e.name === "standard")) lines.push(`--default-transition-timing-function: var(${cssVar("easing", "standard")});`);
  return [CSS_HEADER, "", '@import "./motif.css";', "", "@theme inline {", indent(lines, 2), "}", ""].join("\n");
}

const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

export function motionTs(theme: Theme): string {
  return [
    TS_HEADER,
    "",
    "/** Durations in seconds (the unit Motion uses). */",
    "export const duration = {",
    ...theme.durations.map((d) => `  ${key(d.name)}: ${num(d.ms / 1000)},`),
    "} satisfies Record<string, number>;",
    "",
    "export type Easing = [number, number, number, number];",
    "",
    "export const easing = {",
    ...theme.easings.map((e) => `  ${key(e.name)}: [${e.points.map(num).join(", ")}],`),
    "} satisfies Record<string, Easing>;",
    "",
    'export type Spring = { type: "spring"; visualDuration: number; bounce: number };',
    "",
    "export const spring = {",
    ...theme.springs.map((s) => `  ${key(s.name)}: { type: "spring", visualDuration: ${num(s.duration)}, bounce: ${num(s.bounce)} },`),
    "} satisfies Record<string, Spring>;",
    "",
  ].join("\n");
}

export function generateReactWeb(theme: Theme, opts: { srcDir: string; tailwind: TailwindVersion }): GeneratedFile[] {
  const files: GeneratedFile[] = [{ path: `${opts.srcDir}/styles/motif.css`, content: motifCss(theme) }];
  if (opts.tailwind === "v4") files.push({ path: `${opts.srcDir}/styles/motif.tailwind.css`, content: tailwindCss(theme) });
  files.push({ path: `${opts.srcDir}/design/motion.ts`, content: motionTs(theme) });
  return files;
}
