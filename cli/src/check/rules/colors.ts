import { locator } from "../../text";
import { darkRanges, variantAt, variantRanges } from "../dark";
import type { SourceFile } from "../files";
import { inRanges, maskComments, rangesOf } from "../mask";
import { makeHit, type Hit } from "../types";

export const NAMED_COLORS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
    "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
    "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
    "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid " +
    "mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen " +
    "paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown " +
    "royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow " +
    "springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen").split(" "),
);

const NAMED_ALT = [...NAMED_COLORS].join("|");
const HEX = "#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\\w-])";
const COLOR_FN = "(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch|color)\\([^()]*\\)";

// A property, or a custom property whose name may hold digits (--surface-2).
export const CSS_DECLARATION = /(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
export const CSS_COLOR_LITERAL = new RegExp(`${HEX}|${COLOR_FN}`, "g");
const CSS_NAMED = new RegExp(`(?<![\\w#.-])(?:${NAMED_ALT})(?![\\w-])`, "gi");
const CSS_COLOR_PROP =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?|--[\w-]+)$/i;

// A hex colour starts a string, or follows ":", "(" or "," — not a space in prose ("Room #101", "see #456").
const SCRIPT_HEX = new RegExp(`(?<=["'\`]|:\\s{0,3}|\\(\\s{0,3}|,\\s{0,3})${HEX}(?!\\s*[(=.])`, "g");
// <meta name="theme-color" content="#…">, Safari's <link rel="mask-icon" color="#…"> and friends can't use CSS variables.
const META_TAG = /<meta\b[^>]*>|<link\b[^>]*\brel\s*=\s*["']?mask-icon\b[^>]*>/gi;
// A colour after a space inside a string that holds a CSS value ("0 1px 2px #ccc", "1px solid #333"), not prose.
const SPACED_HEX = new RegExp(`(?<=\\s)${HEX}`, "g");
const CSS_VALUE_HINT = /\d(?:px|rem|em|%)|\b(?:solid|dashed|dotted|double|inset)\b|\b(?:rgba?|hsla?)\(/;
// Each word of a CSS value: a number or length, a colour, a function, or a keyword a border or shadow takes.
const CSS_VALUE_WORD = new RegExp(
  `^(?:-?\\d*\\.?\\d+(?:px|rem|em|%|vh|vw|ch)?|#[0-9a-fA-F]{3,8}|[\\w-]+\\([^()]*\\)|solid|dashed|dotted|double|groove|ridge|inset|outset|none|transparent|currentcolor|!important|${NAMED_ALT})$`,
  "i",
);

/** Where the string around `index` starts and ends (inside its quotes), pairing quotes from the start of its line. */
function stringAround(text: string, index: number): [number, number] | null {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const lineEnd = text.indexOf("\n", index) === -1 ? text.length : text.indexOf("\n", index);
  let open = -1;
  for (let i = lineStart; i < lineEnd; i++) {
    const ch = text[i]!;
    if (open !== -1 && ch === "\\") i++;
    else if (open === -1 && (ch === '"' || ch === "'" || ch === "`")) {
      if (i > index) return null;
      open = i;
    } else if (open !== -1 && ch === text[open]) {
      if (i > index) return [open + 1, i];
      open = -1;
    }
  }
  return null;
}

/** A CSS value, or one declaration's value in a list of them ("color: red; border: 1px solid #333"), not prose. */
function readsAsCssValue(str: string, at: number): boolean {
  const start = str.lastIndexOf(";", at) + 1;
  const end = str.indexOf(";", at) === -1 ? str.length : str.indexOf(";", at);
  const value = str.slice(start, end).replace(/^\s*(?:--[\w-]+|[a-z-]+)\s*:/, "");
  if (!CSS_VALUE_HINT.test(value)) return false;
  // A function is one word: rgba(0, 0, 0, 0.1). A template's ${…} stands for a number: `${w}px solid #ddd`.
  const words = value
    .replace(/\$\{[^}]*\}/g, "0")
    .replace(/[\w-]+\([^()]*\)/g, (f) => f.replace(/[\s,/]/g, ""))
    .split(/[\s,/]+/)
    .filter(Boolean);
  return words.every((w) => CSS_VALUE_WORD.test(w));
}
// Styles set from a script: el.style.background = "…", el.style.setProperty("--card-bg", "…"), ctx.fillStyle = "…".
// Either colour of a choice is set too: el.style.color = dark ? "#fff" : "#111".
const CHOICE = String.raw`(?:(?:[^"'\`;?]|"[^"]*"|'[^']*')*\?\s*(?:(?:"[^"]*"|'[^']*'|\`[^\`]*\`)\s*:\s*)?)?`;
const STYLE_SET = new RegExp(String.raw`\.style\.([A-Za-z]+)\s*=\s*${CHOICE}["'\`]?[^"'\`]*$`);
const PROPERTY_SET = new RegExp(String.raw`setProperty\(\s*["'\`](--[\w-]+|[a-z-]+)["'\`]\s*,\s*${CHOICE}["'\`]?[^"'\`]*$`);
const CANVAS_SET = new RegExp(String.raw`\.(fillStyle|strokeStyle|shadowColor)\s*=\s*${CHOICE}["'\`]?[^"'\`]*$`);
// The page itself: html, body or :root on its own (html.dark, :root[data-theme=x]), not something inside it (body .panel).
const PAGE_ITEM = /^(?:html|body|:root)(?:[.#:[][^\s>+~]*)?$/i;

/** A rule that styles the page itself: its background is the page's. */
export const isPageSelector = (selector: string) => selector.split(",").some((s) => PAGE_ITEM.test(s.trim()));

/** light-dark(a, b)'s two colours, as written; null for any other value. */
function lightDarkArgs(value: string): string[] | null {
  if (!/^light-dark\(/i.test(value) || !value.endsWith(")")) return null;
  const inner = value.slice("light-dark(".length, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "(") depth++;
    else if (inner[i] === ")") depth--;
    else if (inner[i] === "," && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
  }
  return null;
}
const SCRIPT_FN = /(?<![\w[-])(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch)\(\s*[\d.][^()]*\)/g;
const STYLE_NAMED = new RegExp(
  `\\b(color|background|backgroundColor|border(?:Top|Right|Bottom|Left)?Color|outlineColor|fill|stroke|textDecorationColor|caretColor|accentColor)\\s*:\\s*(["'])(${NAMED_ALT})\\2`,
  "gi",
);
const KEY_BEFORE = /([A-Za-z-]+)\s*:\s*["'`]?[^"'`:]*$/;

export function colorContext(prop: string): "text" | "background" | "border" | "other" {
  const p = prop.toLowerCase();
  if (p.startsWith("--")) {
    // Custom properties: the name says how the colour is used (--card-foreground is text, --card is a background).
    if (/(^|-)(text|fg|foreground|ink|heading|label|copy)(-|$)/.test(p)) return "text";
    if (/(^|-)(bg|background|surface|canvas|card|panel|page|backdrop|popover)(-|$)/.test(p)) return "background";
    if (/(^|-)(border|stroke|outline|ring|divider|separator)(-|$)/.test(p)) return "border";
    return "other";
  }
  if (p === "color" || p === "fill" || p === "stroke" || p === "caret-color" || p === "caretcolor") return "text";
  if (p.startsWith("background") || p === "bg") return "background";
  if (p.startsWith("border") || p.startsWith("outline") || p.startsWith("ring") || p.startsWith("divide") || p.startsWith("column-rule")) return "border";
  return "other";
}

export function scanColors(source: SourceFile): Hit[] {
  const file = { ...source, text: maskComments(source.text, source.lang) };
  const at = locator(file.text);
  const hits: Hit[] = [];
  const add = (index: number, literal: string, context: string, extra: Pick<Hit, "prop" | "scheme" | "page" | "variant"> = {}) =>
    hits.push(makeHit(file, at, index, {
      rule: "raw-color",
      text: literal,
      value: literal,
      kind: "color",
      context,
      ...extra,
      violation: true,
      message: `Raw colour ${literal}.`,
      fix: "Use a theme colour instead: a class like bg-action-primary or text-text-primary, or var(--motif-color-<role>).",
    }));

  if (file.lang === "css") {
    const dark = [...darkRanges(file.text), ...(source.dark ?? [])];
    const variants = variantRanges(file.text);
    // The selector of the rule each declaration is in (from the previous "{", "}" or ";" back to its "{"); none when the
    // rule closed before it (an HTML page's style="" after its <style> block).
    const selectorAt = (index: number) => {
      const open = file.text.lastIndexOf("{", index);
      if (open === -1 || file.text.lastIndexOf("}", index) > open) return "";
      let s = open - 1;
      while (s >= 0 && file.text[s] !== "{" && file.text[s] !== "}" && file.text[s] !== ";") s--;
      return file.text.slice(s + 1, open).trim();
    };
    for (const m of file.text.matchAll(CSS_DECLARATION)) {
      const prop = m[1]!;
      const value = m[2]!;
      if (prop.startsWith("--motif-")) continue;
      const start = m.index! + m[0].length - value.length;
      const context = colorContext(prop);
      // A variable's colour is its value only when the value is that one colour (not a shadow or a color-mix()), or one of
      // light-dark()'s two.
      const whole = value.trim().replace(/\s*!important$/i, "");
      const pair = prop.startsWith("--") ? lightDarkArgs(whole) : null;
      const page = /^background(-color)?$/i.test(prop) && isPageSelector(selectorAt(m.index!));
      // Each colour's own position: light-dark()'s second colour is its dark one.
      const extra = (literal: string, at: number): Pick<Hit, "prop" | "scheme" | "page" | "variant"> => ({
        ...(prop.startsWith("--") && (literal === whole || pair?.includes(literal)) ? { prop } : {}),
        ...(inRanges(at, dark) ? { scheme: "dark" as const } : {}),
        ...(page ? { page: true } : {}),
        ...(variantAt(at, variants) ? { variant: variantAt(at, variants) } : {}),
      });
      for (const c of value.matchAll(CSS_COLOR_LITERAL)) add(start + c.index!, c[0], context, extra(c[0], start + c.index!));
      if (CSS_COLOR_PROP.test(prop)) for (const n of value.matchAll(CSS_NAMED)) add(start + n.index!, n[0], context, extra(n[0], start + n.index!));
    }
    return hits.sort((a, b) => a.line - b.line || a.column - b.column);
  }

  const contextBefore = (index: number) => {
    const lineStart = file.text.lastIndexOf("\n", index - 1) + 1;
    const before = file.text.slice(lineStart, index);
    const styled = before.match(STYLE_SET)?.[1] ?? before.match(PROPERTY_SET)?.[1];
    if (styled) return colorContext(styled);
    const canvas = before.match(CANVAS_SET)?.[1];
    // A canvas fill colours shapes and chart marks, not the page: it isn't a background.
    if (canvas) return canvas === "strokeStyle" ? "border" : "other";
    const key = before.match(KEY_BEFORE)?.[1];
    return key ? colorContext(key) : "other";
  };
  const metaTags = rangesOf(file.text, META_TAG);
  const found = new Set<number>();
  for (const m of file.text.matchAll(SCRIPT_HEX)) {
    if (inRanges(m.index!, metaTags)) continue;
    found.add(m.index!);
    add(m.index!, m[0], contextBefore(m.index!));
  }
  for (const m of file.text.matchAll(SPACED_HEX)) {
    if (found.has(m.index!) || inRanges(m.index!, metaTags)) continue;
    // Inside a quoted string on its line that reads as a CSS value.
    const str = stringAround(file.text, m.index!);
    if (!str || !readsAsCssValue(file.text.slice(str[0], str[1]), m.index! - str[0])) continue;
    add(m.index!, m[0], contextBefore(m.index!));
  }
  for (const m of file.text.matchAll(SCRIPT_FN)) if (!inRanges(m.index!, metaTags)) add(m.index!, m[0], contextBefore(m.index!));
  for (const m of file.text.matchAll(STYLE_NAMED)) {
    const literal = m[3]!;
    add(m.index! + m[0].lastIndexOf(literal), literal, colorContext(m[1]!));
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}
