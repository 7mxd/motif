import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../text";

export interface TailwindDefaults {
  colors: Map<string, string>;
  spacingPx: number;
  radiusPx: Map<string, number>;
  textPx: Map<string, number>;
  easings: Map<string, string>;
}

const toPx = (value: string): number | null => {
  const m = value.trim().match(/^(-?\d*\.?\d+)(rem|px)$/);
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
};

/** Tailwind v4 ships its default theme as CSS variables in node_modules/tailwindcss/theme.css. */
/**
 * The spacing step an app sets for itself in its CSS (@theme { --spacing: 0.5rem }), which Tailwind's own theme.css
 * doesn't know: its spacing classes (p-3) count in that step.
 */
export function ownSpacingPx(cssTexts: string[]): number | null {
  for (const css of cssTexts) {
    for (const block of css.matchAll(/@theme\b[^{]*\{([^}]*)\}/g)) {
      const m = block[1]!.match(/--spacing\s*:\s*([^;]+);/);
      const px = m ? toPx(m[1]!.trim()) : null;
      if (px !== null) return px;
    }
  }
  return null;
}

export function readTailwindDefaults(dirs: string[]): TailwindDefaults | null {
  for (const dir of dirs) {
    let css: string;
    try {
      css = stripBom(readFileSync(join(dir, "node_modules", "tailwindcss", "theme.css"), "utf8"));
    } catch {
      continue;
    }
    const d: TailwindDefaults = { colors: new Map(), spacingPx: 4, radiusPx: new Map(), textPx: new Map(), easings: new Map() };
    for (const m of css.matchAll(/--([\w.-]+)\s*:\s*([^;]+);/g)) {
      const name = m[1]!;
      const value = m[2]!.trim();
      if (name.includes("--")) continue;
      if (name.startsWith("color-")) d.colors.set(name.slice(6), value);
      else if (name === "spacing") d.spacingPx = toPx(value) ?? 4;
      else if (name.startsWith("radius-")) {
        const px = toPx(value);
        if (px !== null) d.radiusPx.set(name.slice(7), px);
      } else if (name.startsWith("text-")) {
        const px = toPx(value);
        if (px !== null) d.textPx.set(name.slice(5), px);
      } else if (name.startsWith("ease-")) d.easings.set(name.slice(5), value);
    }
    return d;
  }
  return null;
}
