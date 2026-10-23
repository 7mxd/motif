// Reading a component file (Vue's .vue; later Svelte's .svelte and Angular's templates) for check and extract: its CSS,
// its script and its markup as three views the length of the file. Every rule runs unchanged on them, positions stay
// exact, and no character is read in two views, so nothing is reported twice.
import type { SourceFile } from "./files";
import { addStyleAttr, blanked, cssView, regions, TAG, type CssParts } from "./html";

/**
 * An attribute whose value the framework reads as something other than text, by its name. The first binding that
 * matches an attribute decides it:
 * - "script": the value is an expression (Vue's :width="300", v-if="count > 13"), read in the script view at its place.
 * - "css": the attribute sets one CSS property (Svelte's style:color="#333"), read in the CSS view as `prop: value;` in
 *   place. The pattern's first group is the property, or the whole name when it has none.
 * - "markup": the value stays in the markup view only, as a plain attribute's does (Vue's :class, whose quoted class
 *   names the Tailwind rules read there; read in the script view too, each would be reported twice).
 */
export interface Binding {
  attr: RegExp;
  as: "script" | "css" | "markup";
}

/** An attribute in a tag; its value's grammar is TAG's, so quoted values may hold ">". */
const ATTR = /\s([^\s"'>/=]+)(?:(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const LANG_ATTR = /\slang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
/** The style languages read as CSS (postcss is CSS with Tailwind's @apply); a block in another (stylus) is left out of every view. */
const CSS_LANGS = new Set(["css", "scss", "sass", "less", "postcss"]);
const TAG_NAME = /^<([^\s/>]+)/;

function cssLang(tag: string): boolean {
  const m = LANG_ATTR.exec(tag);
  return !m || CSS_LANGS.has((m[1] ?? m[2] ?? m[3] ?? "").toLowerCase());
}

/** The start tag at `at`, if one starts there: its lower-case name, where it ends, and whether it closes itself. */
function startTag(text: string, at: number): { name: string; end: number; closed: boolean } | null {
  const tag = new RegExp(TAG.source, "y");
  tag.lastIndex = at;
  const t = tag.exec(text);
  return t ? { name: TAG_NAME.exec(t[0])![1]!.toLowerCase(), end: at + t[0].length, closed: t[0].endsWith("/>") } : null;
}

/** Where the element whose start tag ends at `from` closes: its text runs to </name>, a template's to its own </template>. */
function blockEnd(text: string, name: string, from: number): number {
  if (name !== "template") {
    const close = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>`, "gi");
    close.lastIndex = from;
    const c = close.exec(text);
    return c ? c.index + c[0].length : text.length;
  }
  // Templates nest (<template v-if>): count them, tag by tag, so a quoted "<template>" or a comment's counts for nothing.
  let depth = 1;
  let i = from;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) break;
    if (text.startsWith("<!--", lt)) {
      const c = text.indexOf("-->", lt + 4);
      i = c === -1 ? text.length : c + 3;
      continue;
    }
    const close = /^<\/template\s*>/i.exec(text.slice(lt, lt + 40));
    if (close && --depth === 0) return lt + close[0].length;
    const tag = startTag(text, lt);
    if (tag?.name === "template" && !tag.closed) depth++;
    i = tag ? tag.end : lt + 1;
  }
  return text.length;
}

/** The file's top-level elements whose names aren't `blocks` (Vue's <i18n>, <docs>): [start, end] of each. */
function customBlocks(text: string, blocks: string[]): [number, number][] {
  const found: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) break;
    if (text.startsWith("<!--", lt)) {
      const c = text.indexOf("-->", lt + 4);
      i = c === -1 ? text.length : c + 3;
      continue;
    }
    const tag = startTag(text, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const end = tag.closed ? tag.end : blockEnd(text, tag.name, tag.end);
    if (!blocks.includes(tag.name)) found.push([lt, end]);
    i = end;
  }
  return found;
}

/**
 * A component file's views. `css`: its <style> blocks, static style="" attributes and CSS bindings; `script`: its
 * <script> blocks' content and script bindings' values; `markup`: everything else (tags, text, class attributes),
 * with what the other two read blank. Comments are blank in all three; `dark` holds the dark-only style blocks. A
 * self-closing <script /> or <style /> (Vue's src imports) is empty. `blocks`, for a file made of top-level blocks
 * (Vue's template, script and style), names them: any other top-level element is a custom block (<i18n>, <docs>), blank
 * in every view. `spans` says where each script binding's value sits, with its attribute name and element, for the rules that
 * judge a value by what it is bound to (a :style object, a <Transition>'s :duration). Without `blocks` (a Svelte file, whose top level is its markup) every element is read.
 */
export function componentViews(source: string, opts: { bindings: Binding[]; blocks?: string[] }): { css: string; script: string; markup: string; dark: [number, number][]; spans: NonNullable<SourceFile["spans"]> } {
  const text = opts.blocks ? blanked(source, customBlocks(source, opts.blocks)) : source;
  const { comments, cdata, scripts, styles } = regions(text, { selfClosing: true });
  const uncommented = blanked(text, comments);
  const read = styles.filter(([at, contentStart]) => cssLang(text.slice(at, contentStart)));
  const unread = styles.filter((s) => !read.includes(s)).map(([, contentStart, contentEnd]): [number, number] => [contentStart, contentEnd]);

  const parts: CssParts = { keep: [], separators: [], replacements: [] };
  const dark: [number, number][] = [];
  for (const [, contentStart, contentEnd, , darkOnly] of read) {
    parts.keep.push([contentStart, contentEnd]);
    if (darkOnly) dark.push([contentStart, contentEnd]);
  }
  const inScript = new Uint8Array(text.length);
  for (const [, contentStart, contentEnd] of scripts) inScript.fill(1, contentStart, contentEnd);
  // A CSS binding's "=" reads as ":", after the separators are set.
  const colons: number[] = [];
  const spans: NonNullable<SourceFile["spans"]> = [];

  // Attributes only in tags: not inside <style> or <script> blocks, or CDATA's text. Vue's own <template> tags, nested
  // ones too, are tags like any other.
  const bindings = opts.bindings.map((b) => ({ ...b, attr: new RegExp(b.attr.source, b.attr.flags.replace(/[gyd]/g, "") + "d") }));
  const tags = blanked(uncommented, [...[...styles, ...scripts].map(([a, , , b]): [number, number] => [a, b]), ...cdata]);
  for (const t of tags.matchAll(TAG)) {
    for (const a of t[0].matchAll(ATTR)) {
      const name = a[1]!;
      const value = a[4] ?? a[5] ?? a[6];
      if (value === undefined) continue;
      const nameAt = t.index! + a.index! + 1;
      const quoted = a[6] === undefined;
      const valueAt = t.index! + a.index! + a[0].length - a[3]!.length + (quoted ? 1 : 0);
      const valueEnd = valueAt + value.length;
      // A static style="" is CSS, as in an HTML page (an unquoted one isn't read there either).
      if (name.toLowerCase() === "style") {
        if (quoted) addStyleAttr(parts, valueAt - 1, value);
        continue;
      }
      const binding = bindings.find((b) => b.attr.test(name));
      if (!binding || binding.as === "markup") continue;
      if (binding.as === "script") {
        inScript.fill(1, valueAt, valueEnd);
        spans.push({ attr: name, tag: TAG_NAME.exec(t[0])?.[1] ?? "", start: valueAt, end: valueEnd });
        continue;
      }
      // prop: value; in place. The character before the property and the one after the value (its closing quote) are
      // separators, so the declaration never runs into another's.
      const prop = binding.attr.exec(name)!.indices![1] ?? [0, name.length];
      const propAt = nameAt + prop[0];
      parts.keep.push([propAt, nameAt + prop[1]], [valueAt, valueEnd]);
      colons.push(nameAt + name.length + a[2]!.indexOf("="));
      for (const s of [propAt - 1, valueEnd]) if (s < text.length && text[s] !== "\n" && text[s] !== "\r") parts.separators.push(s);
    }
  }

  const { css: cssText, inCss } = cssView(uncommented, read, parts);
  const css = cssText.split("");
  for (const c of colons) css[c] = ":";
  const script = uncommented.split("");
  const markup = uncommented.split("");
  const unreadMask = new Uint8Array(text.length);
  for (const [a, b] of unread) unreadMask.fill(1, a, b);
  for (let i = 0; i < text.length; i++) {
    if (script[i] === "\n" || script[i] === "\r") continue;
    if (!inScript[i] || inCss[i] || unreadMask[i]) script[i] = " ";
    if (inScript[i] || inCss[i] || unreadMask[i]) markup[i] = " ";
  }
  return { css: css.join(""), script: script.join(""), markup: markup.join(""), dark, spans };
}
