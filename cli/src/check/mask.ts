import type { Lang } from "./files";

/**
 * Replace comments with spaces, keeping every other character (and every line break) in place,
 * so rules don't read values inside comments and positions stay exact.
 * Strings are respected, so "https://…" inside quotes is not a comment.
 */
export function maskComments(text: string, lang: Lang): string {
  if (lang === "dart") return scanDart(text, "comments");
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

/**
 * Replace the contents of string literals with spaces, keeping the quotes, every line break and the length.
 * Dart only: `'…'`, `"…"`, triple-quoted and raw (`r'…'`) strings are blanked; code inside `${…}` stays visible
 * (nested braces and strings handled); a bare `$name` interpolation is blanked with the rest of the string.
 * Comments are left as they are (mask them first with maskComments). Other languages are returned unchanged.
 */
export function maskStrings(text: string, lang: Lang): string {
  return lang === "dart" ? scanDart(text, "strings") : text;
}

const isIdent = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_$]/.test(c);

/** One left-to-right pass over Dart: comments (nested blocks) and strings (all forms, interpolation). */
function scanDart(text: string, mode: "comments" | "strings"): string {
  const out = text.split("");
  const n = text.length;
  const isBreak = (c: string | undefined) => c === "\n" || c === "\r";
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (!isBreak(out[k])) out[k] = " ";
  };

  // Scans a string whose opening quote run starts at `i`; returns the index after it.
  const string = (i: number, raw: boolean): number => {
    const q = text[i]!;
    const triple = text[i + 1] === q && text[i + 2] === q;
    const open = triple ? 3 : 1;
    let j = i + open;
    let from = j;
    const flush = (to: number) => {
      if (mode === "strings") blank(from, to);
    };
    while (j < n) {
      const c = text[j]!;
      if (triple ? text.startsWith(q.repeat(3), j) : c === q) {
        flush(j);
        return j + open;
      }
      if (!triple && isBreak(c)) {
        flush(j);
        return j;
      }
      if (!raw && c === "\\") {
        j += 2;
        continue;
      }
      if (!raw && c === "$" && text[j + 1] === "{") {
        flush(j);
        j = code(j + 2, true) + 1;
        from = j;
        continue;
      }
      j++;
    }
    flush(Math.min(j, n));
    return n;
  };

  // Scans code from `start`. Inside an interpolation, returns the index of its closing `}`; otherwise n.
  const code = (start: number, interp: boolean): number => {
    let i = start;
    let depth = 0;
    while (i < n) {
      const c = text[i]!;
      if (c === "/" && text[i + 1] === "/") {
        let end = i;
        while (end < n && !isBreak(text[end])) end++;
        if (mode === "comments") blank(i, end);
        i = end;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        let level = 1;
        let j = i + 2;
        while (j < n && level > 0) {
          if (text[j] === "/" && text[j + 1] === "*") {
            level++;
            j += 2;
          } else if (text[j] === "*" && text[j + 1] === "/") {
            level--;
            j += 2;
          } else j++;
        }
        if (mode === "comments") blank(i, j);
        i = j;
        continue;
      }
      if (c === "'" || c === '"') {
        i = string(i, false);
        continue;
      }
      if (c === "r" && (text[i + 1] === "'" || text[i + 1] === '"') && !isIdent(text[i - 1])) {
        i = string(i + 1, true);
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        if (interp && depth === 0) return i;
        if (depth > 0) depth--;
      }
      i++;
    }
    return n;
  };

  code(0, false);
  return out.join("");
}

/** [start, end) ranges of every match of a global regex. */
export function rangesOf(text: string, re: RegExp): [number, number][] {
  return [...text.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length]);
}

export const inRanges = (index: number, ranges: [number, number][]) => ranges.some(([a, b]) => index >= a && index < b);
