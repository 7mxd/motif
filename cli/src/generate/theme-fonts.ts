import { bundledCoverage } from "../preview/font-list";
import type { Theme } from "./theme";

export interface ThemeFontUse {
  family: string;
  /** Weights the theme's type roles use with this family, lowest first. */
  weights: number[];
  /** bundled: ships with Motif · system: on every common OS, never fetched · google: loaded from Google Fonts in mockups. */
  source: "bundled" | "google" | "system";
  /** Never first in a font list: a companion (an Arabic font second in the list), checked with its Arabic letters. */
  companion: boolean;
}

const GENERIC = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace",
  "ui-rounded", "math", "emoji", "fangsong", "-apple-system", "blinkmacsystemfont",
]);
const SYSTEM = new Set([
  "arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman", "courier", "courier new", "verdana",
  "tahoma", "trebuchet ms", "segoe ui", "segoe ui variable", "sf pro", "sf pro text", "sf pro display", "sf mono",
  "new york", "menlo", "monaco", "consolas", "cascadia code", "cascadia mono", "lucida grande", "sfmono-regular", "liberation mono",
  "lucida console", "dejavu sans mono", "andale mono",
]);

/** The family a type role asks for first, or null when its list starts with a generic family. */
export function firstFamily(css: string): string | null {
  const first = css.split(",")[0]!.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  return first && !GENERIC.has(first.toLowerCase()) ? first : null;
}

/**
 * The families a page loads for a type role: the first, and each one after it up to the first generic or system font.
 * A companion second in the list (an Arabic font) counts; fallbacks after a system font are never loaded or installed.
 */
export function stackFamilies(css: string): string[] {
  const all = css.split(",").map((part) => part.trim().replace(/^(["'])(.*)\1$/, "$2").trim());
  const first = all[0];
  if (!first || GENERIC.has(first.toLowerCase())) return [];
  const families = [first];
  for (const family of all.slice(1)) {
    const key = family.toLowerCase();
    if (!family || GENERIC.has(key) || SYSTEM.has(key)) break;
    families.push(family);
  }
  return families;
}

/** Each family the theme's type roles name (the first, and any companion after it), with the weights used. */
export function themeFonts(theme: Theme): ThemeFontUse[] {
  const uses = new Map<string, ThemeFontUse>();
  for (const font of theme.fonts) {
    stackFamilies(font.family).forEach((family, i) => {
      const key = family.toLowerCase();
      // The kit has only the Arabic letters of a style's Arabic companion: enough second in a list, not first.
      const coverage = bundledCoverage(family);
      const source = coverage === "full" || (coverage === "arabic" && i > 0) ? "bundled" : SYSTEM.has(key) ? "system" : "google";
      const use = uses.get(key) ?? { family, weights: [], source, companion: i > 0 };
      if (i === 0) use.companion = false;
      if (use.source === "bundled" && source === "google") use.source = "google";
      if (!use.weights.includes(font.weight)) use.weights.push(font.weight);
      uses.set(key, use);
    });
  }
  return [...uses.values()].map((u) => ({ ...u, weights: [...u.weights].sort((a, b) => a - b) }));
}

/** One family per request: Google skips weights a family lacks, but a family it doesn't know fails the whole request. */
export function googleFontsUrl(family: string, weights: number[]): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights.join(";")}&display=swap`;
}

/** The stylesheet addresses for a theme's fonts that come from Google Fonts, one per family. */
export function fontStylesheets(theme: Theme, url: (family: string, weights: number[]) => string = googleFontsUrl): string[] {
  return themeFonts(theme)
    .filter((f) => f.source === "google")
    .map((f) => url(f.family, f.weights));
}
