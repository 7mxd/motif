// motif check for React Native: colours, sizes, fonts and motion typed in style objects and Reanimated calls instead of taken
// from motif-theme.tsx. Colours and (with nativewind) Tailwind classes come from the web rules; the rest is read here.
import type { SourceFile } from "../../check/files";
import { maskComments } from "../../check/mask";
import { scanColors } from "../../check/rules/colors";
import { scanTailwind } from "../../check/rules/tailwind";
import { scanTailwindScale } from "../../check/rules/tailwind-scale";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../../check/types";
import { locator } from "../../text";
import { callArgs } from "../../check/calls";
import { member } from "./generate";

const FIX = {
  color: "Use colors.<role> from useMotifTheme().",
  space: "Use space.s<N>.",
  radius: "Use radius.<role>.",
  text: "Use type.<role>.",
  duration: "Use duration.<role>.",
  easing: "Use easing.<role>.",
  spring: "Use spring.<role>.",
  reducedMotion: "Read useMotifTheme().reducedMotion (or Reanimated's useReducedMotion()) and skip or shorten the animation when it is on.",
};

/** What to use instead, in TypeScript: the theme file's export that holds the value. */
export function rnFix(hit: Hit): string {
  if (hit.rule === "reduced-motion") return FIX.reducedMotion;
  switch (hit.kind) {
    case "color":
      return FIX.color;
    case "space":
      return FIX.space;
    case "radius":
      return FIX.radius;
    case "font-size":
    case "font-family":
      return FIX.text;
    case "duration":
      return FIX.duration;
    case "easing":
      return FIX.easing;
    case "spring":
      return FIX.spring;
    default:
      return hit.fix;
  }
}

/** A theme role as motif-theme.tsx exports it (colors.textSecondary, space.s4, type.body), for "Closest:" suggestions. */
export function rnRole(kind: ValueKind, name: string): string {
  switch (kind) {
    case "color":
      return `colors.${member(name, "c")}`;
    case "space":
      return `space.${member(name, "s")}`;
    case "radius":
      return `radius.${member(name, "r")}`;
    case "font-size":
    case "font-family":
      return `type.${member(name, "t")}`;
    case "duration":
      return `duration.${member(name, "d")}`;
    case "easing":
      return `easing.${member(name, "e")}`;
    case "spring":
      return `spring.${member(name, "s")}`;
    case "shadow":
      return `shadow.${member(name, "s")}`;
  }
}

/** Comments and the insides of string literals blanked (quotes, line breaks and positions kept), so rules read code alone. */
function maskCode(original: string): string {
  const text = maskComments(original, "script");
  const out = text.split("");
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") {
        if (text[i + 1] !== "\n") out[i + 1] = " ";
        out[i] = " ";
        i++;
      } else if (c === quote) quote = null;
      else if (c === "\n" && quote !== "`") quote = null;
      else if (c !== "\n" && c !== "\r") out[i] = " ";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
  }
  return out.join("");
}

const OPENERS = "([{";
const CLOSERS = ")]}";
/** The index of the bracket that closes the one at `open` (masked text), or -1. */
function closeOf(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (OPENERS.includes(text[i]!)) depth++;
    else if (CLOSERS.includes(text[i]!) && --depth === 0) return i;
  }
  return -1;
}

const NUM = "-?\\d+(?:\\.\\d+)?";
const END = "(?![\\w.$])";
const STYLE_CREATE = /(?<![\w$.])StyleSheet\s*\.\s*create\s*\(/g;
/** style={…}, contentContainerStyle={…}, and style: … / tabBarStyle: … inside an options object. */
const STYLE_PROP = /(?<![\w$.])(?:style|[A-Za-z]*Style)\s*([=:])\s*(?=[{[])/g;
const SIDES = "(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)";
const SIZE_PROP = new RegExp(
  `(?<![\\w$.])(?:margin${SIDES}?|padding${SIDES}?|gap|rowGap|columnGap|border(?:(?:Top|Bottom)(?:Left|Right|Start|End)|(?:Start|End)(?:Start|End))?Radius|fontSize)\\s*:\\s*(${NUM})${END}(?=\\s*(?:[,}\\])]|$))`,
  "gm",
);
const FONT_FAMILY = /(?<![\w$.])fontFamily\s*:\s*(?=["'])/g;
const TIMING_CALL = /(?<![\w$.])(?:withTiming|withDelay)\s*\(|(?<![\w$.])Animated\s*\.\s*timing\s*\(/g;
const DURATION_KEY = new RegExp(`(?<![\\w$.])duration\\s*:\\s*(${NUM})${END}`, "g");
const LAYOUT_DURATION = new RegExp(`(?<![\\w$.])[A-Z][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*\\([^()]*\\))*(\\s*\\.\\s*duration\\s*\\(\\s*(${NUM})\\s*\\))`, "g");
const EASING_CALL = /(?<![\w$.])Easing\s*\.\s*(bezier|in|out|inOut)\s*\(/g;
const EASING_EASE = /(?<![\w$.])Easing\s*\.\s*ease(?![\w$])/g;
const SPRING_CALL = /(?<![\w$.])withSpring\s*\(/g;
const SPRING_KEY = new RegExp(`(?<![\\w$.])(damping|stiffness|mass)\\s*:\\s*(${NUM})${END}`, "g");
const SPRINGIFY = /\.\s*springify\s*\(\s*\)((?:\s*\.\s*[A-Za-z_$][\w$]*\s*\([^()]*\))*)/g;
const SPRING_CHAIN = new RegExp(`\\.\\s*(damping|stiffness|mass)\\s*\\(\\s*(${NUM})\\s*\\)`, "g");

const sizeMessage = {
  space: (px: number) => `Spacing ${px}px isn't on your spacing scale.`,
  radius: (px: number) => `Corner size ${px}px isn't one of your radius roles.`,
  "font-size": (px: number) => `Text size ${px}px isn't one of your text roles.`,
};

/** A call written over several lines, on one (it's shown in one line of the report). */
const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/,?\s\)$/, ")");

/**
 * Colours, sizes, fonts and motion typed in a React Native file. Sizes are read only inside style objects (StyleSheet.create,
 * style and *Style props), motion only inside Reanimated and Animated calls. With a scale, sizes and durations on it are
 * seen but allowed; without one (extract), every value is seen and none is judged. Tailwind classes are read when the app
 * uses nativewind.
 */
export function scanReactNative(source: SourceFile, scale: Scale | null, opts: { nativewind?: boolean } = {}): Hit[] {
  const original = source.text;
  const text = maskCode(original);
  const file = { ...source, text };
  const at = locator(text);
  const found = new Map<string, Hit>();
  const push = (index: number, fields: { rule: RuleId; kind: ValueKind; text: string; value?: string; violation: boolean; message: string }) => {
    const key = `${index}:${fields.kind}`;
    if (found.has(key)) return;
    const hit = makeHit(file, at, index, { ...fields, fix: "" });
    found.set(key, { ...hit, fix: rnFix(hit) });
  };

  // ---------- sizes, inside style objects ----------
  const styles: [number, number][] = [];
  for (const m of text.matchAll(STYLE_CREATE)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (call) styles.push([m.index!, call.close]);
  }
  for (const m of text.matchAll(STYLE_PROP)) {
    const open = m.index! + m[0].length;
    const close = closeOf(text, open);
    if (close !== -1) styles.push([open, close]);
  }
  for (const [from, to] of styles) {
    for (const m of text.slice(from, to).matchAll(SIZE_PROP)) {
      const index = from + m.index!;
      const key = m[0].slice(0, m[0].indexOf(":")).trim();
      const kind = key === "fontSize" ? "font-size" : /Radius$/.test(key) ? "radius" : "space";
      const px = Math.abs(Number(m[1]));
      const set = kind === "space" ? scale?.spacePx : kind === "radius" ? scale?.radiusPx : scale?.fontSizePx;
      push(index, { rule: "off-scale", kind, text: m[0], value: `${px}px`, violation: scale ? !(px === 0 || set?.has(px)) : false, message: sizeMessage[kind](px) });
    }
  }

  // ---------- fonts ----------
  for (const m of text.matchAll(FONT_FAMILY)) {
    const quote = m.index! + m[0].length;
    const end = text.indexOf(text[quote]!, quote + 1);
    if (end === -1 || text.slice(quote + 1, end).trim() !== "") continue;
    const family = original.slice(quote + 1, end).trim();
    if (family) push(m.index!, { rule: "raw-font", kind: "font-family", text: original.slice(m.index!, end + 1), value: family, violation: true, message: `Hard-coded font ${family}.` });
  }

  // ---------- motion ----------
  const duration = (index: number, literal: string, number: string) => {
    const ms = Number(number);
    push(index, { rule: "raw-motion", kind: "duration", text: literal, value: `${ms}ms`, violation: scale ? !(ms === 0 || scale.durationMs.has(ms)) : false, message: `Animation duration ${ms}ms isn't one of your durations.` });
  };
  for (const m of text.matchAll(TIMING_CALL)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (!call) continue;
    for (const d of text.slice(m.index!, call.close).matchAll(DURATION_KEY)) duration(m.index! + d.index!, d[0], d[1]!);
  }
  for (const m of text.matchAll(LAYOUT_DURATION)) {
    const start = m.index! + m[0].length - m[1]!.length;
    const dot = m[1]!.indexOf(".");
    duration(start + dot, m[1]!.slice(dot).trim(), m[2]!);
  }
  const easings: [number, number][] = [];
  for (const m of text.matchAll(EASING_CALL)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (!call) continue;
    easings.push([m.index!, call.close]);
    const literal = oneLine(original.slice(m.index!, call.close + 1));
    const points = m[1] === "bezier" ? call.args.map((a) => a.value) : [];
    const value = points.length === 4 && points.every((p) => /^-?\d*\.?\d+$/.test(p)) ? `cubic-bezier(${points.join(", ")})` : literal;
    push(m.index!, { rule: "raw-motion", kind: "easing", text: literal, value, violation: true, message: `Hard-coded easing ${literal}.` });
  }
  for (const m of text.matchAll(EASING_EASE)) {
    // The curve inside Easing.in(Easing.ease) is part of the call already reported.
    if (easings.some(([a, b]) => m.index! > a && m.index! < b)) continue;
    push(m.index!, { rule: "raw-motion", kind: "easing", text: m[0].replace(/\s+/g, ""), value: m[0].replace(/\s+/g, ""), violation: true, message: `Hard-coded easing ${m[0].replace(/\s+/g, "")}.` });
  }
  const spring = (index: number, literal: string, name: string, number: string) =>
    push(index, { rule: "raw-motion", kind: "spring", text: literal, value: `${name} ${number}`, violation: true, message: `Hard-coded spring setting ${literal}.` });
  for (const m of text.matchAll(SPRING_CALL)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (!call) continue;
    for (const s of text.slice(m.index!, call.close).matchAll(SPRING_KEY)) spring(m.index! + s.index!, s[0], s[1]!, s[2]!);
  }
  for (const m of text.matchAll(SPRINGIFY)) {
    const chain = m[1]!;
    const base = m.index! + m[0].length - chain.length;
    for (const s of chain.matchAll(SPRING_CHAIN)) spring(base + s.index!, s[0], s[1]!, s[2]!);
  }

  // ---------- colours and Tailwind ----------
  const web = [...scanColors(source), ...(opts.nativewind ? [...scanTailwind(source, scale), ...scanTailwindScale(source, scale)] : [])];
  const hits = [...found.values(), ...web.map((h) => ({ ...h, fix: rnFix(h) }))];
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

const ANIMATES = /(?<![\w$])(?:useSharedValue|withTiming|withSpring)\s*\(|(?<![\w$])Animated\s*\.|(?<![\w$])(?:entering|exiting)\s*=|(?<![\w$])LayoutAnimation\b/;
const RESPECTS_REDUCED_MOTION = /(?<![\w$])useReducedMotion\b|(?<![\w$])ReduceMotion\s*\.|(?<![\w$.])reducedMotion\b|\.reducedMotion\b/;

/**
 * One hit when the app animates but nothing in its own code reads the reduce-motion setting. Motif's generated file reads it
 * itself, so only the app's own files count.
 */
export function rnReducedMotion(files: SourceFile[]): Hit[] {
  const code = files.map((f) => ({ file: f, text: maskCode(f.text) }));
  if (code.some((c) => RESPECTS_REDUCED_MOTION.test(c.text))) return [];
  const first = code.find((c) => ANIMATES.test(c.text));
  if (!first) return [];
  const index = first.text.search(ANIMATES);
  return [makeHit(first.file, locator(first.text), index, {
    rule: "reduced-motion",
    text: "animation",
    violation: true,
    message: 'Animations here ignore the "reduce motion" setting.',
    fix: FIX.reducedMotion,
  })];
}

const PALETTE_OBJECT = /(?<![\w$])export\s+(?:const\s+[A-Za-z_$][\w$]*(?:\s*:\s*[^=;{]+)?\s*=\s*|default\s+)\{/g;
const LEAF = /(?<![\w$.])[A-Za-z_$][\w$]*\s*:\s*(?=[^\s{])/g;

/**
 * True when most of a file's typed colours (at least one) are in an exported object that is mostly colours: the starter's
 * constants/Colors.ts, with its light and dark objects. Such a file is the app's own palette, not a screen.
 */
export function rnPaletteFile(file: SourceFile, hits: Hit[]): boolean {
  const colors = hits.filter((h) => h.file === file.path && h.kind === "color");
  if (colors.length === 0) return false;
  const code = maskCode(file.text);
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const places = colors.map((h) => starts[h.line - 1]! + h.column - 1);
  let inside = 0;
  const counted = new Set<number>();
  for (const m of code.matchAll(PALETTE_OBJECT)) {
    const open = m.index! + m[0].length - 1;
    const close = closeOf(code, open);
    if (close === -1) continue;
    const mine = places.filter((p) => p > open && p < close && !counted.has(p));
    const leaves = [...code.slice(open + 1, close).matchAll(LEAF)].length;
    if (mine.length === 0 || mine.length * 2 < leaves) continue;
    for (const p of mine) counted.add(p);
    inside += mine.length;
  }
  return inside > 0 && inside * 2 >= colors.length;
}
