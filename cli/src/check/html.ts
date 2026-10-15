// Reading HTML for check and extract: the CSS in <style> blocks and style="" attributes, and everything else, as two
// views the length of the file. Every rule runs unchanged on them, and positions stay exact.
import type { SourceFile } from "./files";

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(?:<\/style\s*>|$)/gi;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi;
// A start tag; quoted attribute values may hold ">".
const TAG = /<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
const STYLE_ATTR = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/gi;

function blank(chars: string[], from: number, to: number): void {
  for (let i = from; i < to; i++) if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
}

export function htmlViews(text: string): { css: string; rest: string } {
  // Comments hide what's inside them from both views.
  const open = text.split("");
  for (const m of text.matchAll(COMMENT)) blank(open, m.index!, m.index! + m[0].length);
  const uncommented = open.join("");

  const keep: [number, number][] = [];
  // In the CSS view, each attribute's quotes become ";" so its declarations never run into another region's.
  const separators: number[] = [];
  for (const m of uncommented.matchAll(STYLE_BLOCK)) {
    const start = m.index! + m[1]!.length;
    keep.push([start, start + m[2]!.length]);
  }
  // style="" only in tags: not inside <style> or <script> blocks.
  const tagsOnly = uncommented.split("");
  for (const m of uncommented.matchAll(STYLE_BLOCK)) blank(tagsOnly, m.index!, m.index! + m[0].length);
  for (const m of uncommented.matchAll(SCRIPT_BLOCK)) blank(tagsOnly, m.index!, m.index! + m[0].length);
  const tags = tagsOnly.join("");
  for (const t of tags.matchAll(TAG)) {
    for (const a of t[0].matchAll(STYLE_ATTR)) {
      const quote = t.index! + a.index! + a[1]!.length;
      const value = a[3] ?? a[4] ?? "";
      keep.push([quote + 1, quote + 1 + value.length]);
      separators.push(quote, quote + 1 + value.length);
    }
  }

  const inCss = new Uint8Array(text.length);
  for (const [a, b] of keep) inCss.fill(1, a, b);
  const css = uncommented.split("");
  const rest = uncommented.split("");
  for (let i = 0; i < text.length; i++) {
    if (css[i] === "\n" || css[i] === "\r") continue;
    if (inCss[i]) rest[i] = " ";
    else css[i] = " ";
  }
  for (const s of separators) css[s] = ";";
  return { css: css.join(""), rest: rest.join("") };
}

const HTML_FILE = /\.html?$/i;

/** Each HTML file becomes two with the same path: its CSS, read as CSS, and the rest (markup and scripts). */
export function expandHtml(files: SourceFile[]): SourceFile[] {
  return files.flatMap((f) => {
    if (f.lang !== "markup" || !HTML_FILE.test(f.path)) return [f];
    const { css, rest } = htmlViews(f.text);
    return [{ ...f, text: css, lang: "css" as const }, { ...f, text: rest, lang: "markup" as const }];
  });
}
