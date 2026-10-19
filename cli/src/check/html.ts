// Reading HTML for check and extract: the CSS in <style> blocks and style="" attributes, and everything else, as two
// views the length of the file. Every rule runs unchanged on them, and positions stay exact.
import type { SourceFile } from "./files";

// A start tag; quoted attribute values may hold ">".
const TAG = /<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
const STYLE_ATTR = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/gi;
/**
 * What may start a region: a comment, a CDATA section (an SVG's), a script, or a style block (<style-guide> and
 * <script-loader> are other elements).
 */
const OPENER = /<!--|<!\[CDATA\[|<script(?=[\s>/])|<style(?=[\s>/])/gi;
const MEDIA_ATTR = /\smedia\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
/** Characters written as entities in an attribute, as the browser reads them (quotes, mostly: font names). */
const ENTITY = /&(?:quot|QUOT|#34|#[xX]22|apos|#39|#[xX]27|amp|AMP|#38|#[xX]26);/g;

/** A <style> tag's media is for dark mode: it asks for dark, and not with "not" ("not all and (…: dark)" is light). */
function darkMedia(tag: string): boolean {
  const m = MEDIA_ATTR.exec(tag);
  const media = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  return /prefers-color-scheme\s*:\s*dark/i.test(media) && !/\bnot\b/i.test(media);
}

function blank(chars: string[], from: number, to: number): void {
  for (let i = from; i < to; i++) if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
}

interface Regions {
  comments: [number, number][];
  cdata: [number, number][];
  scripts: [number, number][];
  /** [tag start, content start, content end, block end, dark only] */
  styles: [number, number, number, number, boolean][];
}

/**
 * The comments, CDATA sections, scripts and style blocks, found in order: what's inside a script ("<!--" in a string, '<style>')
 * starts nothing, and a comment marker inside a style block is just CSS's old way of hiding it.
 */
function regions(text: string): Regions {
  const found: Regions = { comments: [], cdata: [], scripts: [], styles: [] };
  const opener = new RegExp(OPENER.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = opener.exec(text))) {
    const at = m.index;
    const kind = m[0].toLowerCase();
    if (kind === "<!--") {
      const close = text.indexOf("-->", at + 4);
      const end = close === -1 ? text.length : close + 3;
      found.comments.push([at, end]);
      opener.lastIndex = end;
    } else if (kind === "<![cdata[") {
      // Text in an SVG or MathML: what it holds ("<!--", "<style>") starts nothing.
      const close = text.indexOf("]]>", at + 9);
      const end = close === -1 ? text.length : close + 3;
      found.cdata.push([at, end]);
      opener.lastIndex = end;
    } else if (kind === "<script") {
      const close = /<\/script\s*>/gi;
      close.lastIndex = at;
      const c = close.exec(text);
      const end = c ? c.index + c[0].length : text.length;
      found.scripts.push([at, end]);
      opener.lastIndex = end;
    } else {
      // The tag ends at its own ">", not one in a quoted attribute: media="(width >= 600px)".
      const tag = new RegExp(TAG.source, "y");
      tag.lastIndex = at;
      const t = tag.exec(text);
      const tagEnd = t ? at + t[0].length - 1 : text.indexOf(">", at);
      const contentStart = tagEnd === -1 ? text.length : tagEnd + 1;
      const close = /<\/style\s*>/gi;
      close.lastIndex = contentStart;
      const c = close.exec(text);
      const contentEnd = c ? c.index : text.length;
      const end = c ? c.index + c[0].length : text.length;
      found.styles.push([at, contentStart, contentEnd, end, darkMedia(text.slice(at, contentStart))]);
      opener.lastIndex = end;
    }
  }
  return found;
}

export function htmlViews(text: string): { css: string; rest: string; dark: [number, number][] } {
  const { comments, cdata, scripts, styles } = regions(text);
  // Comments hide what's inside them from both views.
  const open = text.split("");
  for (const [a, b] of comments) blank(open, a, b);
  const uncommented = open.join("");

  const keep: [number, number][] = [];
  const dark: [number, number][] = [];
  // In the CSS view, each attribute's quotes become ";" so its declarations never run into another region's.
  const separators: number[] = [];
  // Entities in attributes, read as their characters: [start, replacement of the same length].
  const entities: [number, string][] = [];
  for (const [, contentStart, contentEnd, , darkOnly] of styles) {
    keep.push([contentStart, contentEnd]);
    if (darkOnly) dark.push([contentStart, contentEnd]);
  }
  // style="" only in tags: not inside <style> or <script> blocks, or CDATA's text.
  const tagsOnly = uncommented.split("");
  for (const [a, , , b] of styles) blank(tagsOnly, a, b);
  for (const [a, b] of [...scripts, ...cdata]) blank(tagsOnly, a, b);
  const tags = tagsOnly.join("");
  for (const t of tags.matchAll(TAG)) {
    for (const a of t[0].matchAll(STYLE_ATTR)) {
      const quote = t.index! + a.index! + a[1]!.length;
      const value = a[3] ?? a[4] ?? "";
      keep.push([quote + 1, quote + 1 + value.length]);
      separators.push(quote, quote + 1 + value.length);
      // "&quot;Inter&quot;" reads as "Inter": an opening quote keeps its padding before it, a closing one after it.
      let quotes = 0;
      for (const e of value.matchAll(ENTITY)) {
        const at = quote + 1 + e.index!;
        const ch = /amp|#38|#x26/i.test(e[0]) ? "&" : /quot|#34|#x22/i.test(e[0]) ? '"' : "'";
        const pad = " ".repeat(e[0].length - 1);
        entities.push([at, ch === "&" ? ch + pad : quotes++ % 2 === 0 ? pad + ch : ch + pad]);
      }
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
  // Inside a style block, the old "<!--" and "-->" that hid CSS from very old browsers, and an SVG's CDATA, are just
  // markers.
  for (const [, contentStart, contentEnd] of styles) {
    const block = text.slice(contentStart, contentEnd);
    for (const marker of block.matchAll(/<!--|-->|<!\[CDATA\[|\]\]>/g)) blank(css, contentStart + marker.index!, contentStart + marker.index! + marker[0].length);
  }
  for (const [at, replacement] of entities) for (let i = 0; i < replacement.length; i++) css[at + i] = replacement[i]!;
  for (const s of separators) css[s] = ";";
  return { css: css.join(""), rest: rest.join(""), dark };
}

const HTML_FILE = /\.html?$/i;

/** Each HTML file becomes two with the same path: its CSS, read as CSS, and the rest (markup and scripts). */
export function expandHtml(files: SourceFile[]): SourceFile[] {
  return files.flatMap((f) => {
    if (f.lang !== "markup" || !HTML_FILE.test(f.path)) return [f];
    const { css, rest, dark } = htmlViews(f.text);
    return [{ ...f, text: css, lang: "css" as const, ...(dark.length > 0 ? { dark } : {}) }, { ...f, text: rest, lang: "markup" as const }];
  });
}
