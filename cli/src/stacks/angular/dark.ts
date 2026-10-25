// The dark-theme classes Angular Material's guides use (.dark-theme, .theme-dark, .dark-mode, body.dark): blocks for dark
// mode that the web's reading of CSS (which knows .dark and [data-theme=dark]) doesn't take as dark. Angular's views mark
// them, so every colour in them is a dark value, in motif extract as in motif check.
import { isDarkSelector, withoutNot } from "../../check/dark";
import type { SourceFile } from "../../check/files";
import { maskComments } from "../../check/mask";

const SASS_FILE = /\.(?:scss|sass|less)$/i;
const NEGATIONS = new Set(["not", "no", "non"]);

/** A class name or attribute value that says dark as a word of its own (dark, dark-theme, theme-dark), not not-dark or darkened. */
function saysDark(name: string): boolean {
  const words = name.toLowerCase().split(/[-_]/);
  return words.includes("dark") && !words.some((w) => NEGATIONS.has(w));
}

/** A selector for dark mode only: each selector in its list names a dark class or attribute value (not inside :not(…), which says what it isn't). */
export function isDarkClassSelector(selector: string): boolean {
  const items = withoutNot(selector).split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return false;
  return items.every((item) => {
    const names = [...item.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
    const values = [...item.matchAll(/\[[\w-]+\s*[~|^$*]?=\s*["']?([\w-]+)["']?\s*\]/g)].map((m) => m[1]!);
    return [...names, ...values].some(saysDark);
  });
}

/** Just past the "}" that closes the "{" at `open`, or the end of the text. */
function braceEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  return css.length;
}

/** The blocks of a stylesheet's text whose selector is a dark class the web doesn't already take as dark. */
export function darkClassRanges(css: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;
    let s = i - 1;
    while (s >= 0 && css[s] !== "{" && css[s] !== "}" && css[s] !== ";") s--;
    const selector = css.slice(s + 1, i).trim();
    if (selector.startsWith("@") || isDarkSelector(selector)) continue;
    if (isDarkClassSelector(selector)) ranges.push([i, braceEnd(css, i)]);
  }
  return ranges;
}

/** Comments masked as the file's language writes them (Sass and Less also have // comments). */
export const maskStyles = (file: SourceFile) => maskComments(file.text, SASS_FILE.test(file.path) ? "script" : "css");

/** A CSS view with its dark-class blocks marked dark, beside the ranges it already has. */
export function withDarkClasses(view: SourceFile): SourceFile {
  if (view.lang !== "css") return view;
  const found = darkClassRanges(maskStyles(view));
  return found.length > 0 ? { ...view, dark: [...(view.dark ?? []), ...found] } : view;
}
