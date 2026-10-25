// Reading HTML for check and extract: the CSS in <style> blocks and style="" attributes, and everything else, as two
// views the length of the file. Every rule runs unchanged on them, and positions stay exact. The tag grammar here
// (readTag) is the one component files' views read too.
import type { SourceFile } from "./files";

/**
 * What may start a region: a comment, a CDATA section (an SVG's), a script, or a style block (<style-guide> and
 * <script-loader> are other elements).
 */
const OPENER = /<!--|<!\[CDATA\[|<script(?=[\s>/])|<style(?=[\s>/])/gi;
/** Characters written as entities in an attribute, as the browser reads them (quotes, mostly: font names). */
const ENTITY = /&(?:quot|QUOT|#34|#[xX]22|apos|#39|#[xX]27|amp|AMP|#38|#[xX]26);/g;

const SPACE = /\s/;
const TAG_START = /[a-zA-Z]/;
/** What ends a tag's name, an attribute's name, and an unquoted value. */
const TAG_NAME_END = /[\s/>]/;
const ATTR_NAME_END = /[\s"'>/=]/;
const UNQUOTED_END = /[\s"'=<>`]/;

/** An attribute in a start tag. */
export interface Attr {
  /** As written; a Svelte shorthand or spread ({name}, {...props}) is named by what its delimiters hold. */
  name: string;
  /** Where the name starts (a shorthand's or spread's opening delimiter). */
  at: number;
  /**
   * The value, without its quotes or delimiters: `quote` is '"', "'", "" (unquoted) or "{" (a whole delimited value,
   * shorthand or spread, read with `delimiters`: Svelte's {…}). `eq` is where its "=" is (-1 for a shorthand or
   * spread). `exprs` are the delimited parts of a quoted or unquoted value read with `delimiters` (Svelte's {…},
   * Angular's {{…}}), from the opening delimiter to after the closing one.
   */
  value?: { start: number; end: number; quote: string; eq: number; exprs: [number, number][] };
}

/** A start tag: its name as written, where it starts and ends, whether it closes itself (/>), and its attributes. */
export interface Tag {
  name: string;
  start: number;
  end: number;
  closed: boolean;
  attrs: Attr[];
}

/** A {…} expression: where it ends (after its "}", or -1 when it never closes) and the string literals in it. */
export interface Expression {
  end: number;
  strings: [number, number][];
}

/**
 * What opens and closes an expression in a template's text and attribute values: Svelte's "{" and "}", Angular's "{{"
 * and "}}" (braces only). With `regex` (Angular's), an expression may hold a regular expression literal; Svelte's
 * reading leaves it out, so its {/if} is never one.
 */
export interface Delimiters {
  open: string;
  close: string;
  regex?: boolean;
}

/** What may stand before a "/" that starts a regular expression literal rather than divides (not a postfix ++ or --). */
const BEFORE_REGEX = /(?:^|(?<![+-])[+-]|[(,=:[!&|?{};*%<>~^]|(?<![\w$])(?:return|typeof|case|void|delete|in|of|new|instanceof))$/;

/**
 * Where the regular expression literal the "/" at `at` opens ends (after its flags), looking back no further than
 * `from`: -1 when that "/" divides, or the literal doesn't close on its line.
 */
export function regexEnd(text: string, at: number, from: number): number {
  if (!BEFORE_REGEX.test(text.slice(Math.max(from, at - 32), at).trimEnd())) return -1;
  let inClass = false;
  for (let i = at + 1; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\") i++;
    else if (c === "\n" || c === "\r") return -1;
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      let end = i + 1;
      while (end < text.length && /[a-z]/i.test(text[end]!)) end++;
      return end;
    }
  }
  return -1;
}

/** Where the string literal opening at `at` ends (after its quote; at its line's end when it doesn't close). */
function stringEnd(text: string, at: number): number {
  const quote = text[at];
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i + 1;
    else if (text[i] === "\n" || text[i] === "\r") return i;
  }
  return text.length;
}

/**
 * The {…} expression opening at `open`, as Svelte reads one: braces nest, and a brace in a string ('…', "…"), a template
 * literal (with its own ${…}) or a comment counts for nothing; with `regex`, in a regular expression literal too (a "/"
 * where no value ends: after "(", "=", "{", an operator or `return`, never after a name, a number, a closing bracket or
 * a postfix ++). `strings` are its string literals, quotes included, and a template literal's text parts.
 */
export function readExpression(text: string, open: number, regex = false): Expression {
  const strings: [number, number][] = [];
  // What each open "{", "${" or "`" is; a template literal keeps where its current text part started.
  const stack: { kind: "{" | "${" | "`"; part: number }[] = [];
  let i = open;
  while (i < text.length) {
    const c = text[i]!;
    const top = stack[stack.length - 1];
    if (top?.kind === "`") {
      if (c === "\\") i += 2;
      else if (c === "`") {
        strings.push([top.part, i + 1]);
        stack.pop();
        i++;
      } else if (c === "$" && text[i + 1] === "{") {
        strings.push([top.part, i]);
        stack.push({ kind: "${", part: 0 });
        i += 2;
      } else i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = stringEnd(text, i);
      strings.push([i, end]);
      i = end;
    } else if (c === "`") {
      stack.push({ kind: "`", part: i });
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      const nl = text.slice(i).search(/[\r\n]/);
      i = nl === -1 ? text.length : i + nl;
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
    } else if (c === "/" && regex && regexEnd(text, i, open) !== -1) {
      i = regexEnd(text, i, open);
    } else if (c === "{") {
      stack.push({ kind: "{", part: 0 });
      i++;
    } else if (c === "}") {
      const closed = stack.pop();
      if (stack.length === 0) return { end: i + 1, strings };
      const outer = stack[stack.length - 1]!;
      if (closed?.kind === "${" && outer.kind === "`") outer.part = i + 1;
      i++;
    } else i++;
  }
  return { end: -1, strings };
}

/**
 * The expression opening with `d.open` at `at`, read as readExpression reads a {…} one (Angular's {{…}} is a {…} holding
 * a {…}); it never closes when it doesn't end with `d.close`.
 */
export function readDelimited(text: string, at: number, d: Delimiters): Expression {
  const e = readExpression(text, at, d.regex === true);
  const closes = e.end !== -1 && e.end - at >= d.open.length + d.close.length && text.startsWith(d.close, e.end - d.close.length);
  return closes ? e : { end: -1, strings: e.strings };
}

/**
 * Where `stop` first stands from `from`, outside strings and brackets ((…), […] and {…} nest), or -1 when it doesn't
 * before a bracket closes that didn't open here: the end of Angular's block parameters, "(…)", and of its @let statement.
 */
export function readUntil(text: string, from: number, stop: string): number {
  let depth = 0;
  for (let i = from; i < text.length; ) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "`") {
      i = stringEnd(text, i);
      continue;
    }
    if (depth === 0 && c === stop) return i;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return -1;
      depth--;
    }
    i++;
  }
  return -1;
}

/**
 * The start tag at `at`, if one starts there, as the browser reads it: quoted values may hold ">", and a tag that
 * doesn't close (an open quote) isn't one. With `delimiters` (Svelte's {…}, Angular's {{…}}), a value may be one
 * delimited expression, a quoted or unquoted value may hold delimited parts, an attribute may be {name} or {...props},
 * and attributes after a quote or delimiter need no space.
 */
export function readTag(text: string, at: number, opts: { delimiters?: Delimiters } = {}): Tag | null {
  const d = opts.delimiters;
  if (text[at] !== "<" || !TAG_START.test(text[at + 1] ?? "")) return null;
  let i = at + 2;
  while (i < text.length && !TAG_NAME_END.test(text[i]!)) i++;
  const tag: Tag = { name: text.slice(at + 1, i), start: at, end: 0, closed: false, attrs: [] };
  let delimited = false;
  for (;;) {
    const spaced = i;
    while (i < text.length && SPACE.test(text[i]!)) i++;
    if (text[i] === ">") return { ...tag, end: i + 1, closed: text[i - 1] === "/" };
    if (text[i] === "/" && text[i + 1] === ">") return { ...tag, end: i + 2, closed: true };
    if (i === spaced && !delimited) return null;
    if (d && text.startsWith(d.open, i)) {
      const e = readDelimited(text, i, d);
      if (e.end === -1) return null;
      const [start, end] = [i + d.open.length, e.end - d.close.length];
      tag.attrs.push({ name: text.slice(start, end).trim(), at: i, value: { start, end, quote: "{", eq: -1, exprs: [] } });
      i = e.end;
      delimited = true;
      continue;
    }
    const nameAt = i;
    while (i < text.length && !ATTR_NAME_END.test(text[i]!)) i++;
    if (i === nameAt) return null;
    const attr: Attr = { name: text.slice(nameAt, i), at: nameAt };
    tag.attrs.push(attr);
    delimited = false;
    let eq = i;
    while (eq < text.length && SPACE.test(text[eq]!)) eq++;
    if (text[eq] !== "=") continue;
    let v = eq + 1;
    while (v < text.length && SPACE.test(text[v]!)) v++;
    const value = readValue(text, v, d);
    if (!value) return null;
    attr.value = { ...value, eq };
    i = value.end + (value.quote === "" ? 0 : value.quote === "{" ? d!.close.length : 1);
    delimited = d !== undefined && value.quote !== "";
  }
}

/** An attribute's value starting at `at`: quoted, delimited (with delimiters) or unquoted; null when there's none to read. */
function readValue(text: string, at: number, d: Delimiters | undefined): Omit<NonNullable<Attr["value"]>, "eq"> | null {
  const exprs: [number, number][] = [];
  const q = text[at];
  if (d && text.startsWith(d.open, at)) {
    const e = readDelimited(text, at, d);
    return e.end === -1 ? null : { start: at + d.open.length, end: e.end - d.close.length, quote: "{", exprs };
  }
  if (q === '"' || q === "'") {
    for (let i = at + 1; i < text.length; ) {
      if (text[i] === q) return { start: at + 1, end: i, quote: q, exprs };
      // A { that never closes (a file mid-edit) is the value's text, so the tags after it are still read.
      const e = d && text.startsWith(d.open, i) ? readDelimited(text, i, d) : null;
      if (e && e.end !== -1) {
        exprs.push([i, e.end]);
        i = e.end;
      } else i++;
    }
    return null;
  }
  let i = at;
  while (i < text.length && !UNQUOTED_END.test(text[i]!)) {
    const e = d && text.startsWith(d.open, i) ? readDelimited(text, i, d) : null;
    if (e && e.end !== -1) {
      exprs.push([i, e.end]);
      i = e.end;
    } else i++;
  }
  return i === at ? null : { start: at, end: i, quote: "", exprs };
}

/** Every start tag in the text, in order, as readTag reads them. */
function* tagsIn(text: string): Generator<Tag> {
  let lt = text.indexOf("<");
  while (lt !== -1) {
    const tag = readTag(text, lt);
    lt = text.indexOf("<", tag ? tag.end : lt + 1);
    if (tag) yield tag;
  }
}

/** A start tag's attribute value as written, by name (any case), or null. */
export function attrValue(text: string, tag: Tag, name: string): string | null {
  const a = tag.attrs.find((x) => x.name.toLowerCase() === name && x.value);
  return a ? text.slice(a.value!.start, a.value!.end) : null;
}

/** A <style> tag's media is for dark mode: it asks for dark, and not with "not" ("not all and (…: dark)" is light). */
function darkMedia(text: string, at: number): boolean {
  const tag = readTag(text, at);
  const media = tag ? (attrValue(text, tag, "media") ?? "") : "";
  return /prefers-color-scheme\s*:\s*dark/i.test(media) && !/\bnot\b/i.test(media);
}

/** These characters blank, line breaks kept. */
export function blank(chars: string[], from: number, to: number): void {
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
  const t = readTag(text, at);
  const tagEnd = t ? t.end - 1 : text.indexOf(">", at);
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
  const t = readTag(text, at);
  return t?.closed ? t.end : null;
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
      found.styles.push([at, contentStart, contentEnd, end, darkMedia(text, at)]);
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

/** The text where tags are read: the uncommented text with its style and script blocks and CDATA sections blank. */
export function tagText(uncommented: string, found: Omit<Regions, "comments">): string {
  const blocks = [...found.styles, ...found.scripts].map(([a, , , b]): [number, number] => [a, b]);
  return blanked(uncommented, [...blocks, ...found.cdata]);
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
  const tags = tagText(uncommented, { cdata, scripts, styles });
  for (const t of tagsIn(tags)) {
    for (const a of t.attrs) {
      if (a.name.toLowerCase() === "style" && a.value && a.value.quote !== "") addStyleAttr(parts, a.value.start - 1, tags.slice(a.value.start, a.value.end));
    }
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
