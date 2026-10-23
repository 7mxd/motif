// Reading a component file (Vue's .vue; later Svelte's .svelte and Angular's templates) for check and extract: its CSS,
// its script and its markup as three views the length of the file. Every rule runs unchanged on them, positions stay
// exact, and no character is read in two views, so nothing is reported twice.
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
/** The style languages read as CSS; a block in another (stylus) is left out of every view. */
const CSS_LANGS = new Set(["css", "scss", "sass", "less"]);

function cssLang(tag: string): boolean {
  const m = LANG_ATTR.exec(tag);
  return !m || CSS_LANGS.has((m[1] ?? m[2] ?? m[3] ?? "").toLowerCase());
}

/**
 * A component file's views. `css`: its <style> blocks, static style="" attributes and CSS bindings; `script`: its
 * <script> blocks' content and script bindings' values; `markup`: everything else (tags, text, class attributes),
 * with what the other two read blank. Comments are blank in all three; `dark` holds the dark-only style blocks.
 */
export function componentViews(text: string, opts: { bindings: Binding[] }): { css: string; script: string; markup: string; dark: [number, number][] } {
  const { comments, cdata, scripts, styles } = regions(text);
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
  return { css: css.join(""), script: script.join(""), markup: markup.join(""), dark };
}
