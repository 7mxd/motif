import { bundledCoverage } from "../preview/font-list";
import type { Theme } from "./theme";

export interface ThemeFontUse {
  family: string;
  /** Weights the theme's type roles use with this family, lowest first. */
  weights: number[];
  /** bundled: ships with Motif · system: on every common OS, never fetched · project: the project's own font files, never fetched · google: loaded from Google Fonts in mockups. */
  source: "bundled" | "google" | "project" | "system";
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

/** A font list's families, unquoted, in order. */
const listFamilies = (css: string) => css.split(",").map((part) => part.trim().replace(/^(["'])(.*)\1$/, "$2").trim());

/** True for a family Motif knows covers Arabic: an Arabic companion its kit ships the letters of. */
const knownArabic = (family: string) => bundledCoverage(family) === "arabic";

/**
 * A type role's families: the first, then its companions. The first is null when the list starts with a generic family
 * (the platform's system font) and an Arabic companion comes right after it, as in "system-ui, Readex Pro": Latin text
 * in the system font, Arabic text in the companion. A list with no named family to load is empty.
 */
export type FamilyStack = [] | [first: string | null, ...companions: string[]];

/**
 * The families a page loads for a type role: the first, and each one after it up to the first generic or system font.
 * A companion second in the list (an Arabic font) counts; fallbacks after a system font are never loaded or installed.
 * After a generic first family (the system font), only a family Motif knows covers Arabic qualifies, as the companion:
 * anything else there ("system-ui, Avenir, Helvetica") is a fallback, and the list is empty, as a web page reads it.
 */
export function stackFamilies(css: string): FamilyStack {
  const all = listFamilies(css);
  const first = all[0];
  if (!first) return [];
  if (GENERIC.has(first.toLowerCase())) {
    const next = all[1];
    return next && knownArabic(next) ? [null, next] : [];
  }
  const families: [string, ...string[]] = [first];
  for (const family of all.slice(1)) {
    const key = family.toLowerCase();
    if (!family || GENERIC.has(key) || SYSTEM.has(key)) break;
    families.push(family);
  }
  return families;
}

/** A family a font list names that native apps skip, though it may be meant as the roles' Arabic companion. */
export interface SkippedCompanion {
  family: string;
  /** The generic family its list starts with. */
  after: string;
  /** The type roles whose list names it, in the theme's order. */
  roles: string[];
  /**
   * project: a project font right after a generic family (Motif can't tell whether it covers Arabic) ·
   * after-generics: a font Motif knows covers Arabic, after more than one generic family.
   */
  kind: "project" | "after-generics";
}

/**
 * The families native apps skip in lists that start with a generic family, where the guide may have meant an Arabic
 * companion. Fallbacks Motif can't call Arabic (Avenir, Roboto) aren't named: those are what such lists are for.
 */
export function skippedCompanions(theme: Theme): SkippedCompanion[] {
  const own = new Set(theme.projectFonts.map((f) => f.family.toLowerCase()));
  const found = new Map<string, SkippedCompanion>();
  for (const font of theme.fonts) {
    const all = listFamilies(font.family);
    if (!all[0] || !GENERIC.has(all[0].toLowerCase())) continue;
    let i = 1;
    while (i < all.length && GENERIC.has(all[i]!.toLowerCase())) i++;
    const family = all[i];
    if (!family || SYSTEM.has(family.toLowerCase())) continue;
    const kind = own.has(family.toLowerCase()) && !knownArabic(family) ? "project" : i > 1 && knownArabic(family) ? "after-generics" : null;
    if (!kind) continue;
    const key = family.toLowerCase();
    const entry = found.get(key) ?? { family, after: all[0], roles: [], kind };
    if (!entry.roles.includes(font.name)) entry.roles.push(font.name);
    found.set(key, entry);
  }
  return [...found.values()];
}

/** Each family the theme's type roles name (the first, and any companion after it), with the weights used. */
export function themeFonts(theme: Theme): ThemeFontUse[] {
  const uses = new Map<string, ThemeFontUse>();
  const own = new Set(theme.projectFonts.map((f) => f.family.toLowerCase()));
  for (const font of theme.fonts) {
    stackFamilies(font.family).forEach((family, i) => {
      if (family === null) return;
      const key = family.toLowerCase();
      // The kit has only the Arabic letters of a style's Arabic companion: enough second in a list, not first.
      const coverage = bundledCoverage(family);
      const source = own.has(key) ? "project" : coverage === "full" || (coverage === "arabic" && i > 0) ? "bundled" : SYSTEM.has(key) ? "system" : "google";
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
