import { locator } from "../../text";
import { darkRanges } from "../dark";
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
// Styles set from a script: el.style.background = "…", el.style.setProperty("--card-bg", "…"), ctx.fillStyle = "…".
const STYLE_SET = /\.style\.([A-Za-z]+)\s*=\s*["'`]?[^"'`]*$/;
const PROPERTY_SET = /setProperty\(\s*["'`](--[\w-]+|[a-z-]+)["'`]\s*,\s*["'`]?[^"'`]*$/;
const CANVAS_SET = /\.(fillStyle|strokeStyle|shadowColor)\s*=\s*["'`]?[^"'`]*$/;
// Rules that style the page itself: their background is the page's.
const PAGE_SELECTOR = /^(?:html|body|:root)(?![\w-])/;
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
  const add = (index: number, literal: string, context: string, extra: Pick<Hit, "prop" | "scheme" | "page"> = {}) =>
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
    // The selector of the rule each declaration is in (from the previous "{", "}" or ";" back to its "{").
    const selectorAt = (index: number) => {
      const open = file.text.lastIndexOf("{", index);
      if (open === -1) return "";
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
      // A variable's colour is its value only when the value is that one colour (not a shadow or a color-mix()).
      const whole = value.trim().replace(/\s*!important$/i, "");
      const page = context === "background" && selectorAt(m.index!).split(",").some((s) => PAGE_SELECTOR.test(s.trim()));
      const extra = (literal: string): Pick<Hit, "prop" | "scheme" | "page"> => ({
        ...(prop.startsWith("--") && literal === whole ? { prop } : {}),
        ...(inRanges(start, dark) ? { scheme: "dark" as const } : {}),
        ...(page ? { page: true } : {}),
      });
      for (const c of value.matchAll(CSS_COLOR_LITERAL)) add(start + c.index!, c[0], context, extra(c[0]));
      if (CSS_COLOR_PROP.test(prop)) for (const n of value.matchAll(CSS_NAMED)) add(start + n.index!, n[0], context, extra(n[0]));
    }
    return hits.sort((a, b) => a.line - b.line || a.column - b.column);
  }

  const contextBefore = (index: number) => {
    const lineStart = file.text.lastIndexOf("\n", index - 1) + 1;
    const before = file.text.slice(lineStart, index);
    const styled = before.match(STYLE_SET)?.[1] ?? before.match(PROPERTY_SET)?.[1];
    if (styled) return colorContext(styled);
    const canvas = before.match(CANVAS_SET)?.[1];
    if (canvas) return canvas === "fillStyle" ? "background" : canvas === "strokeStyle" ? "border" : "other";
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
    const lineStart = file.text.lastIndexOf("\n", m.index! - 1) + 1;
    const lineEnd = (file.text.indexOf("\n", m.index!) + 1 || file.text.length + 1) - 1;
    const before = file.text.slice(lineStart, m.index!);
    const q = /(["'`])[^"'`]*$/.exec(before);
    if (!q) continue;
    const close = file.text.indexOf(q[1]!, m.index!);
    if (close === -1 || close > lineEnd) continue;
    if (!CSS_VALUE_HINT.test(file.text.slice(lineStart + q.index + 1, close))) continue;
    add(m.index!, m[0], contextBefore(m.index!));
  }
  for (const m of file.text.matchAll(SCRIPT_FN)) if (!inRanges(m.index!, metaTags)) add(m.index!, m[0], contextBefore(m.index!));
  for (const m of file.text.matchAll(STYLE_NAMED)) {
    const literal = m[3]!;
    add(m.index! + m[0].lastIndexOf(literal), literal, colorContext(m[1]!));
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}
