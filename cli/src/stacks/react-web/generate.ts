import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { num } from "../../generate/css-values";
import { motionFile } from "../../generate/javascript";
import { cssVar, indent, motifCss } from "../../generate/motif-css";
import { CSS_HEADER, TS_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme, ThemeVariant } from "../../generate/theme";
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

export { motifCss };

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

/** A role's name as an object key in TypeScript: as it is when it's an identifier, quoted when it isn't. */
export const tsKey = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

/** What the web stacks say when the app has Tailwind 3, whose theme Motif doesn't write. */
export const tailwindV3Note = (label: string) =>
  `${label}: Tailwind v3 found, so Motif wrote CSS variables only. Use them as bg-[var(--motif-color-action-primary)], or upgrade to Tailwind v4 for Motif's Tailwind theme.`;

/** The one step that puts Motif's Tailwind theme to use, at its root-relative path. */
export const tailwindWiringNote = (path: string) =>
  `Next: in your main CSS file, add an @import for ${path} right after @import "tailwindcss" (write the path relative to that CSS file). Importing it before Tailwind undoes the theme.`;

export function motionTs(theme: Theme): string {
  return [
    TS_HEADER,
    "",
    "/** Durations in seconds (the unit Motion uses). */",
    "export const duration = {",
    ...theme.durations.map((d) => `  ${tsKey(d.name)}: ${num(d.ms / 1000)},`),
    "} satisfies Record<string, number>;",
    "",
    "export type Easing = [number, number, number, number];",
    "",
    "export const easing = {",
    ...theme.easings.map((e) => `  ${tsKey(e.name)}: [${e.points.map(num).join(", ")}],`),
    "} satisfies Record<string, Easing>;",
    "",
    'export type Spring = { type: "spring"; visualDuration: number; bounce: number };',
    "",
    "export const spring = {",
    ...theme.springs.map((s) => `  ${tsKey(s.name)}: { type: "spring", visualDuration: ${num(s.duration)}, bounce: ${num(s.bounce)} },`),
    "} satisfies Record<string, Spring>;",
    "",
  ].join("\n");
}

/** opts.javascript: the app has no TypeScript, so its motion module is motion.js. */
export function generateReactWeb(theme: Theme, opts: { srcDir: string; tailwind: TailwindVersion; javascript?: boolean }, variants: ThemeVariant[] = []): GeneratedFile[] {
  const files: GeneratedFile[] = [{ path: `${opts.srcDir}/styles/motif.css`, content: motifCss(theme, variants) }];
  if (opts.tailwind === "v4") files.push({ path: `${opts.srcDir}/styles/motif.tailwind.css`, content: tailwindCss(theme) });
  files.push(motionFile(`${opts.srcDir}/design/motion.ts`, motionTs(theme), opts.javascript === true));
  return files;
}
