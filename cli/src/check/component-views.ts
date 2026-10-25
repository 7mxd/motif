// Reading a component file (Vue's .vue, Svelte's .svelte, Angular's templates) for check and extract: its CSS,
// its script and its markup as three views the length of the file. Every rule runs unchanged on them, positions stay
// exact, and no character is read in two views, so nothing is reported twice.
import type { SourceFile } from "./files";
import { addStyleAttr, attrValue, blank, blanked, cssView, readDelimited, readTag, readUntil, regions, tagText, type CssParts, type Delimiters, type Tag } from "./html";

/**
 * An attribute whose value the framework reads as something other than text, by its name. The first binding that
 * matches an attribute decides it:
 * - "script": the value is an expression (Vue's :width="300", v-if="count > 13"), read in the script view at its place.
 * - "css": the attribute sets one CSS property (Svelte's style:color="#333"), read in the CSS view as `prop: value;` in
 *   place. The pattern's first group is the property, or the whole name when it has none. With `literal`, the value is
 *   an expression, read as CSS only when it is a string or number literal, without its quotes (Angular's
 *   [style.color]="'#333'", [style.opacity]="0.5"); any other value is script.
 * - "markup": the value stays in the markup view only, as a plain attribute's does (Vue's :class, whose quoted class
 *   names the Tailwind rules read there; read in the script view too, each would be reported twice). In a {…}
 *   expression (Svelte's class={…}) only the strings stay there; the rest is script.
 */
export interface Binding {
  attr: RegExp;
  as: "script" | "css" | "markup";
  literal?: boolean;
}

/**
 * How a template's text and attribute values hold expressions: between `open` and `close` (Svelte's {…}, Angular's
 * {{…}}), each to the script view, in the text and in attribute values (a style="" or CSS binding's parts blank in the
 * CSS view), the delimiters left in the markup.
 */
export interface Grammar extends Delimiters {
  /** A keyword at an expression's start (Svelte's {#if …}, {:else}, {/each}, {@html …}): markup; the rest of the expression is script. */
  blocks?: RegExp;
  /**
   * A control-flow keyword in the text, matched where it stands (Angular's @if, } @else {, @for, @let): blank in every
   * view, with the "{" that opens its body and the "}" that closes it. Its (…) parameters are script; a keyword with
   * neither parameters nor a body (@let total = a + b;) starts a statement, script up to its ";" (blank).
   */
  flow?: RegExp;
  /**
   * ICU messages in the text ({count, plural, =0 {none} other {# tools}}, select, selectordinal): the selector is
   * script; the keywords, case names and braces are blank; each case's text is the template's again.
   */
  icu?: boolean;
}

/** What componentViews reads a file as. */
export interface ComponentViews {
  css: string;
  script: string;
  markup: string;
  dark: [number, number][];
  spans: Spans;
}

/** The style languages read as CSS (postcss is CSS with Tailwind's @apply), and an empty lang; a block in another (stylus) is left out of every view. */
const CSS_LANGS = new Set(["css", "scss", "sass", "less", "postcss"]);
/** An ICU message's start: "{", its selector (the first group) and its kind, to the comma before its first case. */
const ICU_HEAD = /\{\s*([^,{}]*?[^\s,{}])\s*,\s*(?:plural|select|selectordinal)\s*,/dy;
/** Spaces, from where they're matched. */
const SPACES = /\s*/y;
/** An ICU case's name (=0, other, male) or plural offset (offset:1). */
const ICU_KEY = /[^\s{}]+/y;
/** A literal an Angular style binding's value may be: a number, or a string without quotes inside. */
const NUMBER_LITERAL = /^-?(?:\d+\.?\d*|\.\d+)$/;
const STRING_LITERAL = /^(["'])([^"']*)\1$/;

/** Where the literal in a value is, without its quotes and the spaces around it; null when the value is no string or number literal. */
function literalAt(text: string, start: number, end: number): [number, number] | null {
  const value = text.slice(start, end);
  const trimmed = value.trim();
  const at = start + value.indexOf(trimmed);
  if (NUMBER_LITERAL.test(trimmed)) return [at, at + trimmed.length];
  return STRING_LITERAL.test(trimmed) ? [at + 1, at + trimmed.length - 1] : null;
}

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
    else if (name === "template" && (lang(text, tag) || "html") !== "html") found.push([tag.end, contentEnd]);
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
 * `grammar` (Svelte's, Angular's) says how the template holds expressions, blocks and messages; without one (Vue's
 * {{…}} is text) only bound attributes are script.
 */
export function componentViews(source: string, opts: { bindings: Binding[]; blocks?: string[]; grammar?: Grammar }): ComponentViews {
  const text = opts.blocks ? blanked(source, unreadBlocks(source, opts.blocks)) : source;
  const found = regions(text, { selfClosing: true });
  const { comments, scripts, styles } = found;
  const uncommented = blanked(text, comments);
  const read = styles.filter(([at]) => {
    const tag = readTag(text, at);
    return !tag || CSS_LANGS.has(lang(text, tag) || "css");
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
  // Delimited parts of a value the CSS view keeps: blank there, from the opening delimiter to after the closing one.
  const holes: [number, number][] = [];
  // Blank in every view: Angular's block keywords and braces, an ICU message's keywords and braces.
  const hidden: [number, number][] = [];
  const spans: Spans = [];
  const grammar = opts.grammar;
  const [open, close] = [grammar?.open.length ?? 0, grammar?.close.length ?? 0];

  /** An expression's characters, from `start` to `end`, in the script view; with `strings`, those stay in the markup. */
  const toScript = (start: number, end: number, strings: [number, number][] = []) => {
    inScript.fill(1, start, end);
    for (const [a, b] of strings) inScript.fill(0, a, b);
  };
  /** The delimited parts of a value, each to the script view with its span; `inCss` when the value around them is CSS. */
  const exprsToScript = (tag: Tag, attr: string, exprs: [number, number][], inCss: boolean, keepStrings: boolean) => {
    for (const [a, b] of exprs) {
      toScript(a + open, b - close, keepStrings ? readDelimited(tags, a, grammar!).strings : []);
      spans.push({ attr, tag: tag.name, start: a + open, end: b - close });
      if (inCss) holes.push([a, b]);
    }
  };

  // Attributes only in tags: not inside <style> or <script> blocks, or CDATA's text. Vue's own <template> tags, nested
  // ones too, are tags like any other.
  const bindings = opts.bindings.map((b) => ({ ...b, attr: new RegExp(b.attr.source, b.attr.flags.replace(/[gyd]/g, "") + "d") }));
  const tags = tagText(uncommented, found);
  const readAttrs = (t: Tag) => {
    for (const a of t.attrs) {
      if (!a.value) continue;
      const { name } = a;
      const { start: valueAt, end: valueEnd, quote, exprs } = a.value;
      const binding = bindings.find((b) => b.attr.test(name));
      // A delimited value, shorthand or spread: an expression (in a markup binding, its strings stay in the markup).
      if (quote === "{") {
        toScript(valueAt, valueEnd, binding?.as === "markup" ? readDelimited(tags, valueAt - open, grammar!).strings : []);
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
      const literal = binding.literal ? literalAt(tags, valueAt, valueEnd) : null;
      if (binding.as === "script" || (binding.literal && !literal)) {
        inScript.fill(1, valueAt, valueEnd);
        spans.push({ attr: name, tag: t.name, start: valueAt, end: valueEnd });
        continue;
      }
      // prop: value; in place. The character before the property and the one after the value (its closing quote) are
      // separators, so the declaration never runs into another's.
      const prop = binding.attr.exec(name)!.indices![1] ?? [0, name.length];
      const propAt = a.at + prop[0];
      parts.keep.push([propAt, a.at + prop[1]], literal ?? [valueAt, valueEnd]);
      colons.push(a.value.eq);
      exprsToScript(t, name, exprs, true, false);
      for (const [s, direction] of [[propAt - 1, -1], [valueEnd, 1]] as const) {
        if (s >= text.length) continue;
        if (text[s] === "\n" || text[s] === "\r") lineEnds.push([s, direction, t]);
        else parts.separators.push(s);
      }
    }
  };

  // What the text's "}" closes, innermost last: a control-flow block's body, an ICU message (between its cases), or one
  // of its cases.
  const frames: ("block" | "icu" | "case")[] = [];
  /** An ICU message's case names from `from`, to the "{" that opens a case's text or the "}" that ends it: where the scan goes on. */
  const icuCases = (from: number): number => {
    let j = from;
    for (;;) {
      while (j < tags.length && /\s/.test(tags[j]!)) j++;
      if (j >= tags.length) return j;
      if (tags[j] === "}" || tags[j] === "{") {
        hidden.push([j, j + 1]);
        if (tags[j] === "}") frames.pop();
        else frames.push("case");
        return j + 1;
      }
      ICU_KEY.lastIndex = j;
      const key = ICU_KEY.exec(tags)![0];
      hidden.push([j, j + key.length]);
      j += key.length;
    }
  };
  /** A control-flow keyword at `i` (`length` long): where the scan goes on. */
  const flowAt = (i: number, length: number): number => {
    hidden.push([i, i + length]);
    const next = (from: number) => {
      SPACES.lastIndex = from;
      return from + SPACES.exec(tags)![0].length;
    };
    let j = next(i + length);
    if (tags[j] === "(") {
      const end = readUntil(tags, j + 1, ")");
      if (end === -1) return j;
      hidden.push([j, j + 1], [end, end + 1]);
      toScript(j + 1, end);
      j = next(end + 1);
      if (tags[j] !== "{") return end + 1;
    }
    if (tags[j] === "{") {
      hidden.push([j, j + 1]);
      frames.push("block");
      return j + 1;
    }
    const end = readUntil(tags, i + length, ";");
    if (end === -1) return i + length;
    toScript(i + length, end);
    hidden.push([end, end + 1]);
    return end + 1;
  };

  // Tags, in order, and with a grammar the text's expressions, blocks and messages between them.
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const starts = ["<", ...(grammar ? [escape(grammar.open)] : []), ...(grammar?.flow ? ["@"] : []), ...(grammar?.flow || grammar?.icu ? ["[{}]"] : [])];
  const opener = new RegExp(starts.join("|"), "g");
  const flow = grammar?.flow ? new RegExp(grammar.flow.source, grammar.flow.flags.replace(/[gy]/g, "") + "y") : null;
  for (let m = opener.exec(tags); m; m = opener.exec(tags)) {
    const i = m.index;
    if (grammar && tags.startsWith(grammar.open, i)) {
      // Text expression: its keyword in the markup, the rest script. One that never closes (a file mid-edit) is text,
      // and the scan goes on after it, so the tags that follow are still read.
      const e = readDelimited(tags, i, grammar);
      if (e.end === -1) continue;
      const keyword = grammar.blocks?.exec(tags.slice(i + open, e.end - close))?.[0].length ?? 0;
      toScript(i + open + keyword, e.end - close);
      opener.lastIndex = e.end;
      continue;
    }
    if (tags[i] === "@" && flow) {
      flow.lastIndex = i;
      const k = flow.exec(tags);
      if (k) opener.lastIndex = flowAt(i, k[0].length);
      continue;
    }
    if (tags[i] === "}") {
      // A "}" that closes nothing is text.
      if (frames.length === 0) continue;
      hidden.push([i, i + 1]);
      if (frames.pop() === "case") opener.lastIndex = icuCases(i + 1);
      continue;
    }
    if (tags[i] === "{") {
      // A "{" that starts no message is text.
      ICU_HEAD.lastIndex = i;
      const head = grammar?.icu ? ICU_HEAD.exec(tags) : null;
      if (!head) continue;
      const [a, b] = head.indices![1]!;
      hidden.push([i, a], [b, i + head[0].length]);
      toScript(a, b);
      frames.push("icu");
      opener.lastIndex = icuCases(i + head[0].length);
      continue;
    }
    const t = readTag(tags, i, { delimiters: grammar });
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
  for (const [a, b] of [...unread, ...hidden]) unreadMask.fill(1, a, b);
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
