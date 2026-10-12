import type { Lang } from "./files";

/**
 * Replace comments with spaces, keeping every other character (and every line break) in place,
 * so rules don't read values inside comments and positions stay exact.
 * Strings are respected, so "https://…" inside quotes is not a comment.
 */
export function maskComments(text: string, lang: Lang): string {
  const out = text.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let quote: string | null = null;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (lang !== "css" && c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (lang === "markup" && text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      const stop = end === -1 ? text.length : end + 3;
      blank(i, stop);
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** [start, end) ranges of every match of a global regex. */
export function rangesOf(text: string, re: RegExp): [number, number][] {
  return [...text.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length]);
}

export const inRanges = (index: number, ranges: [number, number][]) => ranges.some(([a, b]) => index >= a && index < b);
