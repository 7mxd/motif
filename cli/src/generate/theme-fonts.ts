import { isBundledFamily } from "../preview/font-list";
import type { Theme } from "./theme";

export interface ThemeFontUse {
  family: string;
  /** Weights the theme's type roles use with this family, lowest first. */
  weights: number[];
  /** bundled: ships with Motif · system: on every common OS, never fetched · google: loaded from Google Fonts in mockups. */
  source: "bundled" | "google" | "system";
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

/** Every family a type role names, unquoted and in order, without generic families: a companion second in the list counts too. */
export function stackFamilies(css: string): string[] {
  return css
    .split(",")
    .map((part) => part.trim().replace(/^(["'])(.*)\1$/, "$2").trim())
    .filter((family) => family && !GENERIC.has(family.toLowerCase()));
}

/** Each family the theme's type roles name (the first, and any companion after it), with the weights used. */
export function themeFonts(theme: Theme): ThemeFontUse[] {
  const uses = new Map<string, ThemeFontUse>();
  for (const font of theme.fonts) {
    for (const family of stackFamilies(font.family)) {
      const key = family.toLowerCase();
      const use = uses.get(key) ?? { family, weights: [], source: isBundledFamily(family) ? "bundled" : SYSTEM.has(key) ? "system" : "google" };
      if (!use.weights.includes(font.weight)) use.weights.push(font.weight);
      uses.set(key, use);
    }
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
