// Reading HTML for check and extract: the CSS in <style> blocks and style="" attributes, and everything else, as two
// views the length of the file. Every rule runs unchanged on them, and positions stay exact.
import type { SourceFile } from "./files";

// A start tag; quoted attribute values may hold ">".
export const TAG = /<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
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

/** The text with these ranges blank, its line breaks kept. */
export function blanked(text: string, ranges: [number, number][]): string {
  const chars = text.split("");
  for (const [a, b] of ranges) blank(chars, a, b);
  return chars.join("");
}

/** Where a start tag's content begins: after its own ">", not one in a quoted attribute (media="(width >= 600px)"). */
function contentStartOf(text: string, at: number): number {
  const tag = new RegExp(TAG.source, "y");
  tag.lastIndex = at;
  const t = tag.exec(text);
  const tagEnd = t ? at + t[0].length - 1 : text.indexOf(">", at);
  return tagEnd === -1 ? text.length : tagEnd + 1;
}

export interface Regions {
  comments: [number, number][];
  cdata: [number, number][];
  /** [tag start, content start, content end, block end] */
  scripts: [number, number, number, number][];
  /** [tag start, content start, content end, block end, dark only] */
  styles: [number, number, number, number, boolean][];
}

/** Where a self-closing start tag at `at` ends (<script src="./x.ts" />), or null when it isn't one. */
function selfClosedAt(text: string, at: number): number | null {
  const tag = new RegExp(TAG.source, "y");
  tag.lastIndex = at;
  const t = tag.exec(text);
  return t && t[0].endsWith("/>") ? at + t[0].length : null;
}

/**
 * The comments, CDATA sections, scripts and style blocks, found in order: what's inside a script ("<!--" in a string, '<style>')
 * starts nothing, and a comment marker inside a style block is just CSS's old way of hiding it. In HTML a <script /> still
 * reads on to its </script>; with `selfClosing` (a component file's blocks, Vue's <style src="./a.css" />) it's empty.
 */
export function regions(text: string, opts: { selfClosing?: boolean } = {}): Regions {
  const found: Regions = { comments: [], cdata: [], scripts: [], styles: [] };
  const opener = new RegExp(OPENER.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = opener.exec(text))) {
    const at = m.index;
    const kind = m[0].toLowerCase();
    const closed = opts.selfClosing && (kind === "<script" || kind === "<style") ? selfClosedAt(text, at) : null;
    if (closed !== null) {
      if (kind === "<script") found.scripts.push([at, closed, closed, closed]);
      else found.styles.push([at, closed, closed, closed, false]);
      opener.lastIndex = closed;
    } else if (kind === "<!--") {
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
      const contentEnd = c ? c.index : text.length;
      const end = c ? c.index + c[0].length : text.length;
      found.scripts.push([at, Math.min(contentStartOf(text, at), contentEnd), contentEnd, end]);
      opener.lastIndex = end;
    } else {
      const contentStart = contentStartOf(text, at);
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

/** What the CSS view keeps, and the characters it reads differently from the text. */
export interface CssParts {
  keep: [number, number][];
  /** In the CSS view, each attribute's quotes become ";" so its declarations never run into another region's. */
  separators: number[];
  /** Characters read differently, entities in attributes as their characters: [start, replacement of the same length]. */
  replacements: [number, string][];
}

/** A style="" attribute's value, its opening quote at `quote`: kept, between separators, with its entities read. */
export function addStyleAttr(parts: CssParts, quote: number, value: string): void {
  parts.keep.push([quote + 1, quote + 1 + value.length]);
  parts.separators.push(quote, quote + 1 + value.length);
  // "&quot;Inter&quot;" reads as "Inter": an opening quote keeps its padding before it, a closing one after it.
  let quotes = 0;
  for (const e of value.matchAll(ENTITY)) {
    const at = quote + 1 + e.index!;
    const ch = /amp|#38|#x26/i.test(e[0]) ? "&" : /quot|#34|#x22/i.test(e[0]) ? '"' : "'";
    const pad = " ".repeat(e[0].length - 1);
    parts.replacements.push([at, ch === "&" ? ch + pad : quotes++ % 2 === 0 ? pad + ch : ch + pad]);
  }
}

/**
 * The CSS view of the uncommented text: what `parts` keeps, the rest blank. `styles` are the style blocks it keeps;
 * `inCss` says which characters it holds, for the other views to leave out.
 */
export function cssView(uncommented: string, styles: Regions["styles"], parts: CssParts): { css: string; inCss: Uint8Array } {
  const inCss = new Uint8Array(uncommented.length);
  for (const [a, b] of parts.keep) inCss.fill(1, a, b);
  const css = uncommented.split("");
  for (let i = 0; i < css.length; i++) if (!inCss[i] && css[i] !== "\n" && css[i] !== "\r") css[i] = " ";
  // Inside a style block, the old "<!--" and "-->" that hid CSS from very old browsers, and an SVG's CDATA, are just
  // markers.
  for (const [, contentStart, contentEnd] of styles) {
    const block = uncommented.slice(contentStart, contentEnd);
    for (const marker of block.matchAll(/<!--|-->|<!\[CDATA\[|\]\]>/g)) blank(css, contentStart + marker.index!, contentStart + marker.index! + marker[0].length);
  }
  for (const [at, replacement] of parts.replacements) for (let i = 0; i < replacement.length; i++) css[at + i] = replacement[i]!;
  for (const s of parts.separators) css[s] = ";";
  return { css: css.join(""), inCss };
}

export function htmlViews(text: string): { css: string; rest: string; dark: [number, number][] } {
  const { comments, cdata, scripts, styles } = regions(text);
  // Comments hide what's inside them from both views.
  const uncommented = blanked(text, comments);

  const parts: CssParts = { keep: [], separators: [], replacements: [] };
  const dark: [number, number][] = [];
  for (const [, contentStart, contentEnd, , darkOnly] of styles) {
    parts.keep.push([contentStart, contentEnd]);
    if (darkOnly) dark.push([contentStart, contentEnd]);
  }
  // style="" only in tags: not inside <style> or <script> blocks, or CDATA's text.
  const tags = blanked(uncommented, [...styles.map(([a, , , b]): [number, number] => [a, b]), ...scripts.map(([a, , , b]): [number, number] => [a, b]), ...cdata]);
  for (const t of tags.matchAll(TAG)) {
    for (const a of t[0].matchAll(STYLE_ATTR)) addStyleAttr(parts, t.index! + a.index! + a[1]!.length, a[3] ?? a[4] ?? "");
  }

  const { css, inCss } = cssView(uncommented, styles, parts);
  const rest = uncommented.split("");
  for (let i = 0; i < rest.length; i++) if (inCss[i] && rest[i] !== "\n" && rest[i] !== "\r") rest[i] = " ";
  return { css, rest: rest.join(""), dark };
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
