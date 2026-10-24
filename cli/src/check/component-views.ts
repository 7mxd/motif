// Reading a component file (Vue's .vue, Svelte's .svelte; later Angular's templates) for check and extract: its CSS,
// its script and its markup as three views the length of the file. Every rule runs unchanged on them, positions stay
// exact, and no character is read in two views, so nothing is reported twice.
import type { SourceFile } from "./files";
import { addStyleAttr, attrValue, blank, blanked, cssView, readExpression, readTag, regions, tagText, type CssParts, type Tag } from "./html";

/**
 * An attribute whose value the framework reads as something other than text, by its name. The first binding that
 * matches an attribute decides it:
 * - "script": the value is an expression (Vue's :width="300", v-if="count > 13"), read in the script view at its place.
 * - "css": the attribute sets one CSS property (Svelte's style:color="#333"), read in the CSS view as `prop: value;` in
 *   place. The pattern's first group is the property, or the whole name when it has none.
 * - "markup": the value stays in the markup view only, as a plain attribute's does (Vue's :class, whose quoted class
 *   names the Tailwind rules read there; read in the script view too, each would be reported twice). In a {…}
 *   expression (Svelte's class={…}) only the strings stay there; the rest is script.
 */
export interface Binding {
  attr: RegExp;
  as: "script" | "css" | "markup";
}

/** The style languages read as CSS (postcss is CSS with Tailwind's @apply); a block in another (stylus) is left out of every view. */
const CSS_LANGS = new Set(["css", "scss", "sass", "less", "postcss"]);
/** A Svelte block's or tag's keyword ({#if …}, {:else if …}, {/each}, {@html …}): markup; what follows it is script. */
const BLOCK_KEYWORD =/^[#:/@](?:else\s+if|[a-zA-Z]+)/;

function lang(text: string, tag: Tag): string | null {
  return attrValue(text, tag, "lang")?.toLowerCase() ?? null;
}

/** Where the element whose start tag ends at `from` closes: [its content's end, its end]. A template's runs to its own </template>. */
function blockEnd(text: string, name: string, from: number): [number, number] {
  if (name !== "template") {
    const close = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>`, "gi");
    close.lastIndex = from;
    const c = close.exec(text);
    return c ? [c.index, c.index + c[0].length] : [text.length, text.length];
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
    if (close && --depth === 0) return [lt, lt + close[0].length];
    const tag = readTag(text, lt);
    if (tag?.name.toLowerCase() === "template" && !tag.closed) depth++;
    i = tag ? tag.end : lt + 1;
  }
  return [text.length, text.length];
}

/**
 * What no view reads in a file made of top-level `blocks`: any other top-level element (Vue's <i18n>, <docs>), whole,
 * and a template in another language than HTML (<template lang="pug">), its content, as a style block in one is.
 */
function unreadBlocks(text: string, blocks: string[]): [number, number][] {
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
    const tag = readTag(text, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const name = tag.name.toLowerCase();
    const [contentEnd, end] = tag.closed ? [tag.end, tag.end] : blockEnd(text, name, tag.end);
    if (!blocks.includes(name)) found.push([lt, end]);
    else if (name === "template" && (lang(text, tag) ?? "html") !== "html") found.push([tag.end, contentEnd]);
    i = end;
  }
  return found;
}

type Spans = NonNullable<SourceFile["spans"]>;

/**
 * A component file's views. `css`: its <style> blocks, static style="" attributes and CSS bindings; `script`: its
 * <script> blocks' content and script bindings' values; `markup`: everything else (tags, text, class attributes),
 * with what the other two read blank. Comments are blank in all three; `dark` holds the dark-only style blocks. A
 * self-closing <script /> or <style /> (Vue's src imports) is empty. `blocks`, for a file made of top-level blocks
 * (Vue's template, script and style), names them: any other top-level element is a custom block (<i18n>, <docs>), blank
 * in every view. `spans` says where each script binding's value sits, with its attribute name and element, for the rules that
 * judge a value by what it is bound to (a :style object, a <Transition>'s :duration). Without `blocks` (a Svelte file, whose top level is its markup) every element is read.
 * `braces` (Svelte) reads {…}: an attribute's {…} value or {…} parts are script (in a style="" or CSS binding, blank in
 * the CSS view), and so is the markup's text {…}, its block keyword ({#if, {:else, {@html) left in the markup.
 */
export function componentViews(source: string, opts: { bindings: Binding[]; blocks?: string[]; braces?: boolean }): { css: string; script: string; markup: string; dark: [number, number][]; spans: Spans } {
  const text = opts.blocks ? blanked(source, unreadBlocks(source, opts.blocks)) : source;
  const found = regions(text, { selfClosing: true });
  const { comments, scripts, styles } = found;
  const uncommented = blanked(text, comments);
  const read = styles.filter(([at]) => {
    const tag = readTag(text, at);
    return !tag || CSS_LANGS.has(lang(text, tag) ?? "css");
  });
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
  // Separators that fall on a line break, moved later to a free character of their tag: [where, direction, tag].
  const lineEnds: [number, 1 | -1, Tag][] = [];
  // {…} parts of a value the CSS view keeps: blank there, from "{" to after "}".
  const holes: [number, number][] = [];
  const spans: Spans = [];

  /** An expression's characters, from `start` to `end`, in the script view; with `strings`, those stay in the markup. */
  const toScript = (start: number, end: number, strings: [number, number][] = []) => {
    inScript.fill(1, start, end);
    for (const [a, b] of strings) inScript.fill(0, a, b);
  };
  /** The {…} parts of a value, each to the script view with its span; `inCss` when the value around them is CSS. */
  const exprsToScript = (tag: Tag, attr: string, exprs: [number, number][], inCss: boolean, keepStrings: boolean) => {
    for (const [a, b] of exprs) {
      toScript(a + 1, b - 1, keepStrings ? readExpression(tags, a).strings : []);
      spans.push({ attr, tag: tag.name, start: a + 1, end: b - 1 });
      if (inCss) holes.push([a, b]);
    }
  };

  // Attributes only in tags: not inside <style> or <script> blocks, or CDATA's text. Vue's own <template> tags, nested
  // ones too, are tags like any other.
  const bindings = opts.bindings.map((b) => ({ ...b, attr: new RegExp(b.attr.source, b.attr.flags.replace(/[gyd]/g, "") + "d") }));
  const tags = tagText(uncommented, found);
  const braces = opts.braces === true;
  const readAttrs = (t: Tag) => {
    for (const a of t.attrs) {
      if (!a.value) continue;
      const { name } = a;
      const { start: valueAt, end: valueEnd, quote, exprs } = a.value;
      const binding = bindings.find((b) => b.attr.test(name));
      // A {…} value, shorthand or spread: an expression (in a markup binding, its strings stay in the markup).
      if (quote === "{") {
        toScript(valueAt, valueEnd, binding?.as === "markup" ? readExpression(tags, valueAt - 1).strings : []);
        spans.push({ attr: name, tag: t.name, start: valueAt, end: valueEnd });
        continue;
      }
      // A static style="" is CSS, as in an HTML page (an unquoted one isn't read there either).
      if (name.toLowerCase() === "style") {
        if (quote !== "") addStyleAttr(parts, valueAt - 1, blanked(tags.slice(valueAt, valueEnd), exprs.map(([x, y]): [number, number] => [x - valueAt, y - valueAt])));
        exprsToScript(t, name, exprs, quote !== "", false);
        continue;
      }
      if (!binding || binding.as === "markup") {
        exprsToScript(t, name, exprs, false, binding?.as === "markup");
        continue;
      }
      if (binding.as === "script") {
        inScript.fill(1, valueAt, valueEnd);
        spans.push({ attr: name, tag: t.name, start: valueAt, end: valueEnd });
        continue;
      }
      // prop: value; in place. The character before the property and the one after the value (its closing quote) are
      // separators, so the declaration never runs into another's.
      const prop = binding.attr.exec(name)!.indices![1] ?? [0, name.length];
      const propAt = a.at + prop[0];
      parts.keep.push([propAt, a.at + prop[1]], [valueAt, valueEnd]);
      colons.push(a.value.eq);
      exprsToScript(t, name, exprs, true, false);
      for (const [s, direction] of [[propAt - 1, -1], [valueEnd, 1]] as const) {
        if (s >= text.length) continue;
        if (text[s] === "\n" || text[s] === "\r") lineEnds.push([s, direction, t]);
        else parts.separators.push(s);
      }
    }
  };

  // Tags, in order, and with braces the text's {…} between them.
  const opener = braces ? /[<{]/g : /</g;
  for (let m = opener.exec(tags); m; m = opener.exec(tags)) {
    const i = m.index;
    if (tags[i] === "{") {
      // Text {…}: its keyword in the markup, the rest script. A { that never closes (a file mid-edit) is text, and the
      // scan goes on after it, so the tags that follow are still read.
      const e = readExpression(tags, i);
      if (e.end === -1) continue;
      const keyword = BLOCK_KEYWORD.exec(tags.slice(i + 1, e.end - 1))?.[0].length ?? 0;
      toScript(i + 1 + keyword, e.end - 1);
      opener.lastIndex = e.end;
      continue;
    }
    const t = readTag(tags, i, { braces });
    if (t) {
      readAttrs(t);
      opener.lastIndex = t.end;
    }
  }

  // A separator on a line break moves past it, to the next character of its tag the CSS view doesn't hold (the next
  // line's indent, the tag's ">"), so a binding at a line's end still ends its declaration before the CSS that follows.
  if (lineEnds.length > 0) {
    const kept = new Uint8Array(text.length);
    for (const [a, b] of parts.keep) kept.fill(1, a, b);
    for (const [s, direction, t] of lineEnds) {
      for (let j = s + direction; j >= t.start && j < t.end && !kept[j]; j += direction) {
        if (text[j] !== "\n" && text[j] !== "\r") {
          parts.separators.push(j);
          break;
        }
      }
    }
  }

  const { css: cssText, inCss } = cssView(uncommented, read, parts);
  const css = cssText.split("");
  for (const c of colons) css[c] = ":";
  for (const [a, b] of holes) {
    blank(css, a, b);
    inCss.fill(0, a, b);
  }
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

/** A component file as three files with its path: its CSS (with its dark blocks), its script (with its spans) and its markup. */
export function componentFiles(file: SourceFile, opts: Parameters<typeof componentViews>[1]): SourceFile[] {
  const { css, script, markup, dark, spans } = componentViews(file.text, opts);
  return [
    { ...file, text: css, lang: "css", ...(dark.length > 0 ? { dark } : {}) },
    { ...file, text: script, lang: "script", spans },
    { ...file, text: markup, lang: "markup" },
  ];
}
