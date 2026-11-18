// physical-direction: a fixed left or right where the stack has a start/end form that mirrors by itself in a
// right-to-left language (Arabic, Hebrew). One scanner per source language; each reads text with comments blanked
// (and, where it can, strings), so the word "left" in a comment, a label or a sentence is never layout.

import type { StackId } from "../../detect/stacks";
import { locator } from "../../text";
import type { SourceFile } from "../files";
import { maskComments, maskStrings } from "../mask";
import type { Hit } from "../types";

export type DirectionLang = "css" | "tailwind" | "js-style" | "dart" | "kotlin" | "swift";

interface Found { index: number; text: string; fix: string }

const hit = (file: SourceFile, at: (i: number) => { line: number; column: number }, f: Found): Hit => ({
  rule: "physical-direction",
  file: file.path,
  ...at(f.index),
  text: f.text,
  message: `Uses ${f.text}, which stays on the same side in right-to-left languages.`,
  fix: `Use ${f.fix}, which mirrors by itself.`,
  violation: true,
});

/** Every physical-direction hit in a file, for the scanners that apply to it (see directionLangs). */
export function directionHits(file: SourceFile, langs: DirectionLang[]): Hit[] {
  const masked = maskComments(file.text, file.lang);
  const found: Found[] = [];
  for (const lang of langs) {
    if (lang === "css") found.push(...cssFound(file, masked));
    if (lang === "tailwind" && (file.lang === "markup" || file.lang === "script")) found.push(...tailwindFound(masked));
    if (lang === "js-style" && file.lang === "script") found.push(...jsStyleFound(file.text, masked));
    if (lang === "dart" && file.lang === "dart") found.push(...dartFound(maskStrings(masked, "dart")));
    if (lang === "kotlin" && file.lang === "kotlin") found.push(...kotlinFound(maskStrings(masked, "kotlin")));
    if (lang === "swift" && file.lang === "swift") found.push(...swiftFound(masked));
  }
  const at = locator(file.text);
  return found.sort((a, b) => a.index - b.index).map((f) => hit(file, at, f));
}

/** Which scanners apply to a file of a stack; `tailwind` when the app uses Tailwind (or NativeWind). */
export function directionLangs(stack: StackId, path: string, tailwind: boolean): DirectionLang[] {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "dart") return ["dart"];
  if (ext === "kt" || ext === "kts") return ["kotlin"];
  if (ext === "swift") return ["swift"];
  if (["css", "scss", "sass", "less"].includes(ext)) return ["css"];
  const tw: DirectionLang[] = tailwind ? ["tailwind"] : [];
  if (["vue", "svelte"].includes(ext)) return ["css", ...tw, "js-style"];
  if (["html", "htm"].includes(ext)) return ["css", ...tw];
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return [...tw, "js-style"];
  return [];
}

// ---------- shared helpers ----------

/** The index of the bracket closing the one at `open`, or -1. */
function closing(text: string, open: number): number {
  const pair: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const want = pair[text[open]!];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === want && --depth === 0) return i;
  }
  return -1;
}

/** Top-level comma-separated arguments of a call whose "(" is at `open`. */
function args(text: string, open: number): { text: string; start: number }[] {
  const end = closing(text, open);
  if (end < 0) return [];
  const out: { text: string; start: number }[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < end; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push({ text: text.slice(start, i), start });
      start = i + 1;
    }
  }
  if (text.slice(start, end).trim()) out.push({ text: text.slice(start, end), start });
  return out;
}

const named = (list: { text: string }[], name: string) => list.find((a) => new RegExp(`^\\s*${name}\\s*:`).test(a.text));
const valueOf = (arg: { text: string } | undefined) => arg?.text.replace(/^\s*\w+\s*:/, "").trim();

// ---------- CSS (stylesheets, <style> views, style="" attributes) ----------

const CSS_SIDES: Record<string, string> = {
  "margin-left": "margin-inline-start", "margin-right": "margin-inline-end",
  "padding-left": "padding-inline-start", "padding-right": "padding-inline-end",
  "border-left": "border-inline-start", "border-right": "border-inline-end",
  "border-left-width": "border-inline-start-width", "border-right-width": "border-inline-end-width",
  "border-left-color": "border-inline-start-color", "border-right-color": "border-inline-end-color",
  "border-left-style": "border-inline-start-style", "border-right-style": "border-inline-end-style",
  "border-top-left-radius": "border-start-start-radius", "border-top-right-radius": "border-start-end-radius",
  "border-bottom-left-radius": "border-end-start-radius", "border-bottom-right-radius": "border-end-end-radius",
  left: "inset-inline-start", right: "inset-inline-end",
};
const RTL_SELECTOR = /\[dir|:dir\(|\.rtl\b|:lang\(/i;

interface Decl { prop: string; value: string; index: number }

/** Declarations grouped by block, each block with its selector chain (outer selectors first). */
function cssBlocks(text: string, offset = 0): { selectors: string[]; decls: Decl[] }[] {
  const blocks: { selectors: string[]; decls: Decl[] }[] = [{ selectors: [], decls: [] }];
  const stack: number[] = [0];
  let seg = 0;
  const decl = (from: number, to: number) => {
    const part = text.slice(from, to);
    const m = /^(\s*)(-?[a-zA-Z-]+)\s*:([\s\S]*)$/.exec(part);
    if (!m || part.includes("{")) return;
    blocks[stack[stack.length - 1]!]!.decls.push({ prop: m[2]!.toLowerCase(), value: m[3]!.trim(), index: offset + from + m[1]!.length });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      const parent = blocks[stack[stack.length - 1]!]!;
      blocks.push({ selectors: [...parent.selectors, text.slice(seg, i).trim()], decls: [] });
      stack.push(blocks.length - 1);
      seg = i + 1;
    } else if (c === ";" || c === "}") {
      decl(seg, i);
      if (c === "}" && stack.length > 1) stack.pop();
      seg = i + 1;
    }
  }
  decl(seg, text.length);
  return blocks;
}

function cssFound(file: SourceFile, masked: string): Found[] {
  const sources: { text: string; offset: number }[] = [];
  if (file.lang === "css") sources.push({ text: masked, offset: 0 });
  else if (file.lang === "markup") {
    for (const m of masked.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const value = m[1] ?? m[2] ?? "";
      sources.push({ text: value, offset: m.index! + m[0].length - value.length - 1 });
    }
  } else return [];
  const out: Found[] = [];
  for (const { text, offset } of sources) {
    for (const block of cssBlocks(text, offset)) {
      if (block.selectors.some((s) => RTL_SELECTOR.test(s))) continue;
      const get = (p: string) => block.decls.find((d) => d.prop === p)?.value;
      const transform = get("transform") ?? "";
      const symmetric = get("left") !== undefined && get("left") === get("right");
      for (const d of block.decls) {
        if ((d.prop === "left" || d.prop === "right") && symmetric) continue;
        if (d.prop === "left" && d.value === "50%" && /translateX\(\s*-50%\s*\)/.test(transform)) continue;
        if (d.prop === "right" && d.value === "50%" && /translateX\(\s*50%\s*\)/.test(transform)) continue;
        if (CSS_SIDES[d.prop]) out.push({ index: d.index, text: d.prop, fix: CSS_SIDES[d.prop]! });
        else if ((d.prop === "text-align" || d.prop === "float") && /^(left|right)\b/i.test(d.value)) {
          const side = d.value.toLowerCase().startsWith("left") ? "start" : "end";
          const fix = d.prop === "float" ? `float: inline-${side}` : `text-align: ${side}`;
          out.push({ index: d.index, text: `${d.prop}: ${d.value.split(/\s/)[0]!.toLowerCase()}`, fix });
        }
      }
    }
  }
  return out;
}

// ---------- Tailwind classes (class="", className="", className={`…`}) ----------

const TW: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(m|p)(l|r)-(.+)$/, (m) => `${m[1]}${m[2] === "l" ? "s" : "e"}-${m[3]}`],
  [/^(left|right)-(.+)$/, (m) => `${m[1] === "left" ? "start" : "end"}-${m[2]}`],
  [/^text-(left|right)$/, (m) => `text-${m[1] === "left" ? "start" : "end"}`],
  [/^float-(left|right)$/, (m) => `float-${m[1] === "left" ? "start" : "end"}`],
  [/^border-(l|r)(-.+)?$/, (m) => `border-${m[1] === "l" ? "s" : "e"}${m[2] ?? ""}`],
  [/^rounded-(l|r)(-.+)?$/, (m) => `rounded-${m[1] === "l" ? "s" : "e"}${m[2] ?? ""}`],
  [/^rounded-(tl|tr|bl|br)(-.+)?$/, (m) => `rounded-${{ tl: "ss", tr: "se", bl: "es", br: "ee" }[m[1] as "tl"]}${m[2] ?? ""}`],
];

function tailwindFound(masked: string): Found[] {
  const out: Found[] = [];
  for (const m of masked.matchAll(/\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})/g)) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    const start = m.index! + m[0].indexOf(value);
    const tokens = [...value.matchAll(/\S+/g)].map((t) => ({ raw: t[0], index: start + t.index! }));
    const parsed = tokens.map((t) => {
      const parts = /^((?:[\w-]+:)*)(!?)(-?)(.+)$/.exec(t.raw)!;
      return { ...t, variants: parts[1]!, important: parts[2]!, neg: parts[3]!, base: parts[4]! };
    });
    const has = (base: string) => parsed.some((p) => p.base === base);
    for (const p of parsed) {
      if (/(^|:)(rtl|ltr):/.test(p.variants)) continue;
      const side = /^(left|right)-(.+)$/.exec(p.base);
      if (side) {
        const other = `${side[1] === "left" ? "right" : "left"}-${side[2]}`;
        if (parsed.some((q) => q.base === other && q.variants === p.variants)) continue;
        if (side[2] === "1/2" && (has("translate-x-1/2") || parsed.some((q) => q.neg && q.base === "translate-x-1/2"))) continue;
      }
      for (const [re, to] of TW) {
        const mm = re.exec(p.base);
        if (mm) {
          out.push({ index: p.index, text: p.raw, fix: `${p.variants}${p.important}${p.neg}${to(mm)}` });
          break;
        }
      }
    }
  }
  return out;
}

// ---------- JS style objects (React Native StyleSheet.create, style={{…}}) ----------

const JS_SIDES: Record<string, string> = {
  marginLeft: "marginStart", marginRight: "marginEnd", paddingLeft: "paddingStart", paddingRight: "paddingEnd",
  borderLeftWidth: "borderStartWidth", borderRightWidth: "borderEndWidth", borderLeftColor: "borderStartColor", borderRightColor: "borderEndColor",
  borderTopLeftRadius: "borderTopStartRadius", borderTopRightRadius: "borderTopEndRadius",
  borderBottomLeftRadius: "borderBottomStartRadius", borderBottomRightRadius: "borderBottomEndRadius",
  left: "start", right: "end",
};

/** Blanks the inside of JS strings (quotes stay), so keys and values written as text aren't read. */
function blankJsStrings(text: string): string {
  const out = text.split("");
  for (let i = 0; i < text.length; i++) {
    const q = text[i];
    if (q !== "'" && q !== '"' && q !== "`") continue;
    let j = i + 1;
    for (; j < text.length && text[j] !== q; j++) {
      if (text[j] === "\\") j++;
      if (q !== "`" && text[j] === "\n") break;
    }
    for (let k = i + 1; k < j && k < text.length; k++) if (out[k] !== "\n") out[k] = " ";
    i = j;
  }
  return out.join("");
}

function jsStyleFound(original: string, masked: string): Found[] {
  const blank = blankJsStrings(masked);
  const regions: [number, number][] = [];
  for (const m of blank.matchAll(/StyleSheet\.create\s*\(\s*\{|\bstyle\s*=\s*\{\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    const end = closing(blank, open);
    if (end > 0) regions.push([open, end]);
  }
  const out: Found[] = [];
  for (const [a, b] of regions) {
    const part = blank.slice(a, b);
    for (const k of part.matchAll(/(?<![\w$.])([A-Za-z]+)\s*:/g)) {
      const key = k[1]!;
      const index = a + k.index!;
      if (JS_SIDES[key]) out.push({ index, text: key, fix: JS_SIDES[key]! });
      else if (key === "textAlign") {
        const v = /^textAlign\s*:\s*(['"])(left|right)\1/.exec(original.slice(index));
        if (v) out.push({ index, text: `textAlign: '${v[2]}'`, fix: "no textAlign (text follows the reading direction), or 'auto'" });
      }
    }
  }
  return out;
}

// ---------- Flutter (Dart) ----------

function dartFound(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(/\bEdgeInsets\.(only|fromLTRB)\s*\(/g)) {
    const list = args(text, m.index! + m[0].length - 1);
    if (m[1] === "only" && (named(list, "left") || named(list, "right"))) {
      out.push({ index: m.index!, text: "EdgeInsets.only", fix: "EdgeInsetsDirectional.only(start:, end:)" });
    }
    if (m[1] === "fromLTRB" && list.length === 4 && list[0]!.text.trim() !== list[2]!.text.trim()) {
      out.push({ index: m.index!, text: "EdgeInsets.fromLTRB", fix: "EdgeInsetsDirectional.fromSTEB" });
    }
  }
  for (const m of text.matchAll(/\bAlignment\.(top|center|bottom)(Left|Right)\b/g)) {
    out.push({ index: m.index!, text: m[0], fix: `AlignmentDirectional.${m[1]}${m[2] === "Left" ? "Start" : "End"}` });
  }
  for (const m of text.matchAll(/\bPositioned\s*\(/g)) {
    const list = args(text, m.index! + m[0].length - 1);
    const l = named(list, "left");
    const r = named(list, "right");
    if ((l || r) && !(l && r && valueOf(l) === valueOf(r))) out.push({ index: m.index!, text: "Positioned", fix: "PositionedDirectional(start:, end:)" });
  }
  for (const m of text.matchAll(/\bTextAlign\.(left|right)\b/g)) out.push({ index: m.index!, text: m[0], fix: `TextAlign.${m[1] === "left" ? "start" : "end"}` });
  for (const m of text.matchAll(/\bBorderRadius\.only\s*\(/g)) {
    const list = args(text, m.index! + m[0].length - 1);
    if (["topLeft", "topRight", "bottomLeft", "bottomRight"].some((n) => named(list, n))) {
      out.push({ index: m.index!, text: "BorderRadius.only", fix: "BorderRadiusDirectional.only(topStart:, topEnd:, …)" });
    }
  }
  return out;
}

// ---------- Compose (Kotlin) ----------

function kotlinFound(raw: string): Found[] {
  // import and package lines name APIs, they don't lay anything out: blank them, keeping every offset.
  const text = raw.replace(/^[ \t]*(?:import|package)\b[^\r\n]*/gm, (l) => " ".repeat(l.length));
  const out: Found[] = [];
  const rules: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
    [/\babsolutePadding\b/g, "padding(start =, end =)"],
    [/\babsoluteOffset\b/g, "offset"],
    [/\bArrangement\.Absolute\.(Left|Right)\b/g, (m) => `Arrangement.${m[1] === "Left" ? "Start" : "End"}`],
    [/\bAbsoluteAlignment\.(\w+)\b/g, (m) => `Alignment.${m[1]!.replace("Left", "Start").replace("Right", "End")}`],
    [/\bTextAlign\.(Left|Right)\b/g, (m) => `TextAlign.${m[1] === "Left" ? "Start" : "End"}`],
  ];
  for (const [re, fix] of rules) {
    for (const m of text.matchAll(re)) out.push({ index: m.index!, text: m[0], fix: typeof fix === "string" ? fix : fix(m as RegExpExecArray) });
  }
  for (const m of text.matchAll(/LocalLayoutDirection\s+provides\s+(LayoutDirection\.Ltr)\b/g)) {
    out.push({ index: m.index! + m[0].lastIndexOf(m[1]!), text: m[1]!, fix: "the app's own direction: remove the forced direction" });
  }
  return out;
}

// ---------- SwiftUI ----------

function swiftFound(masked: string): Found[] {
  const out: Found[] = [];
  for (const m of masked.matchAll(/\.environment\s*\(\s*\\\.layoutDirection\s*,\s*(\.leftToRight)\s*\)/g)) {
    out.push({ index: m.index! + m[0].lastIndexOf(m[1]!), text: m[1]!, fix: "the app's own direction: remove the forced .leftToRight" });
  }
  for (const m of masked.matchAll(/\b(?:systemName|systemImage)\s*:\s*"((?:chevron|arrow)\.(?:left|right)(?:\.[a-z.]+)?)"/g)) {
    const end = closing(masked, masked.lastIndexOf("(", m.index!));
    // The modifier chain: the rest of the line, then every following line that starts with ".".
    let to = end < 0 ? m.index! + m[0].length : end;
    for (;;) {
      const nl = masked.indexOf("\n", to);
      if (nl < 0) { to = masked.length; break; }
      const next = masked.slice(nl + 1).match(/^[ \t]*\./);
      if (!next) { to = nl; break; }
      to = nl + 1;
    }
    if (/\.flipsForRightToLeftLayoutDirection\s*\(\s*true\s*\)/.test(masked.slice(m.index!, to))) continue;
    out.push({ index: m.index! + m[0].indexOf(m[1]!), text: m[1]!, fix: `"${m[1]!.replace("left", "backward").replace("right", "forward")}" or .flipsForRightToLeftLayoutDirection(true)` });
  }
  return out;
}
