import { locator } from "../../text";
import type { SourceFile } from "../files";
import { maskComments } from "../mask";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../types";
import { NAMED_COLORS } from "./colors";

/** Class boundary, optional variants (hover:, md:, dark:…), optional ! and a negative sign. */
export const CLASS_PREFIX = "(?<![\\w-])(?:[\\w-]+:)*!?-?";

const ARBITRARY = new RegExp(`${CLASS_PREFIX}([a-z]+(?:-[a-z]+)*)-\\[([^\\]\\s]+)\\]`, "g");
const TW_COLORS = "slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PALETTE = new RegExp(
  `${CLASS_PREFIX}(bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|decoration|caret|accent|from|via|to|divide|placeholder|shadow)-(?:(${TW_COLORS})-(50|[1-9]00|950)|(black|white))(?:\\/\\d{1,3})?(?![\\w-])`,
  "g",
);

const COLOR_UTILS = new Set([
  "bg", "border", "border-x", "border-y", "border-t", "border-r", "border-b", "border-l", "border-s", "border-e",
  "ring", "ring-offset", "outline", "fill", "stroke", "decoration", "caret", "accent", "from", "via", "to", "divide", "placeholder",
]);
const SPACE_UTILS = new Set([
  "p", "px", "py", "pt", "pr", "pb", "pl", "ps", "pe", "m", "mx", "my", "mt", "mr", "mb", "ml", "ms", "me",
  "gap", "gap-x", "gap-y", "space-x", "space-y", "inset", "inset-x", "inset-y", "top", "right", "bottom", "left", "start", "end",
]);
const RADIUS_UTIL = /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?$/;

const isColorLiteral = (v: string) =>
  /^#[0-9a-fA-F]{3,8}$/.test(v) || /^(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch|color)\(/.test(v) || NAMED_COLORS.has(v.toLowerCase());
const isLength = (v: string) => /^-?\d*\.?\d+(?:px|rem|em)$/.test(v);
const isMotifVar = (v: string) => /^(?:var\()?--motif-/.test(v);

export function toPx(length: string): number {
  const n = Number.parseFloat(length);
  return /px$/.test(length) ? n : n * 16;
}

export function utilContext(util: string): "text" | "background" | "border" | "other" {
  if (util === "bg" || util === "from" || util === "via" || util === "to") return "background";
  if (["text", "fill", "stroke", "decoration", "caret", "placeholder", "accent"].includes(util)) return "text";
  if (util.startsWith("border") || util.startsWith("ring") || util === "outline" || util === "divide") return "border";
  return "other";
}

export function classSegments(file: SourceFile): { text: string; offset: number }[] {
  if (file.lang !== "css") return [{ text: file.text, offset: 0 }];
  return [...file.text.matchAll(/@apply\s+([^;]+);/g)].map((m) => ({ text: m[1]!, offset: m.index! + m[0].indexOf(m[1]!) }));
}

interface Classified {
  rule: RuleId;
  kind: ValueKind;
  value: string;
  context?: string;
  message: string;
  fix: string;
}

function classifyArbitrary(util: string, value: string, cls: string, motionImport: string): Classified | null {
  if (isMotifVar(value)) return null;
  if (util === "duration" || util === "delay") {
    const t = value.match(/^(\d*\.?\d+)(ms|s)$/);
    const ms = t ? `${Number.parseFloat(t[1]!) * (t[2] === "s" ? 1000 : 1)}ms` : value;
    return { rule: "raw-motion", kind: "duration", value: ms, message: `Hard-coded animation timing ${cls}.`, fix: `Use duration-(--motif-duration-base) (or fast/slow), or import { duration } from "${motionImport}".` };
  }
  if (util === "ease") {
    return { rule: "raw-motion", kind: "easing", value, message: `Hard-coded easing ${cls}.`, fix: "Use ease-standard, ease-enter or ease-exit." };
  }
  if (util === "font") {
    if (/^\d+$/.test(value)) return null;
    return { rule: "raw-font", kind: "font-family", value, message: `Hard-coded font ${cls}.`, fix: "Use a font role class such as font-body." };
  }
  const color = (context: string): Classified => ({
    rule: "tailwind-arbitrary", kind: "color", value, context, message: `Arbitrary colour ${cls}.`, fix: "Use a theme colour class such as bg-action-primary or text-text-primary.",
  });
  if (util === "text") {
    if (isColorLiteral(value)) return color("text");
    if (isLength(value)) return { rule: "tailwind-arbitrary", kind: "font-size", value: `${toPx(value)}px`, message: `Arbitrary text size ${cls}.`, fix: "Use a text role class such as text-body or text-heading." };
    return null;
  }
  if (util === "shadow") {
    if (isColorLiteral(value)) return color("other");
    return { rule: "tailwind-arbitrary", kind: "shadow", value, message: `Arbitrary shadow ${cls}.`, fix: "Use shadow-sm, shadow-md or shadow-lg." };
  }
  if (COLOR_UTILS.has(util) && isColorLiteral(value)) return color(utilContext(util));
  if (SPACE_UTILS.has(util) && isLength(value)) {
    return { rule: "tailwind-arbitrary", kind: "space", value: `${toPx(value)}px`, message: `Arbitrary spacing ${cls}.`, fix: "Use a step from your spacing scale, e.g. p-4." };
  }
  if (RADIUS_UTIL.test(util) && isLength(value)) {
    return { rule: "tailwind-arbitrary", kind: "radius", value: `${toPx(value)}px`, message: `Arbitrary corner size ${cls}.`, fix: "Use rounded-sm, rounded-md, rounded-lg or rounded-full." };
  }
  return null;
}

/** The theme's role names, for an app on Tailwind 3: Motif's theme classes need Tailwind 4 there. */
export interface ThemeRoles {
  colors: string[];
  fonts: string[];
  easings: string[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Motif's theme classes in an app on Tailwind 3, which doesn't read the Tailwind 4 theme: they do nothing there. */
export function scanThemeClassesV3(source: SourceFile, roles: ThemeRoles): Hit[] {
  const file = { ...source, text: maskComments(source.text, source.lang) };
  const at = locator(file.text);
  const hits: Hit[] = [];
  const alt = (names: string[]) => names.map(esc).join("|");
  type Found = Pick<Hit, "kind" | "value" | "context" | "fix">;
  const patterns: [RegExp, (m: RegExpMatchArray) => Found][] = [];
  if (roles.colors.length) {
    patterns.push([
      new RegExp(`${CLASS_PREFIX}(bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|decoration|caret|accent|from|via|to|divide|placeholder)-(${alt(roles.colors)})(?:\\/\\d{1,3})?(?![\\w-])`, "g"),
      (m) => ({ kind: "color", value: m[2]!, context: utilContext(m[1]!), fix: `Use ${m[1]}-[var(--motif-color-${m[2]})], or upgrade to Tailwind 4.` }),
    ]);
  }
  if (roles.fonts.length) {
    patterns.push([
      new RegExp(`${CLASS_PREFIX}(text|font)-(${alt(roles.fonts)})(?![\\w-])`, "g"),
      (m) =>
        m[1] === "text"
          ? { kind: "font-size", value: m[2]!, fix: `Use text-[length:var(--motif-font-${m[2]}-size)], or upgrade to Tailwind 4.` }
          : { kind: "font-family", value: m[2]!, fix: `Use font-[family-name:var(--motif-font-${m[2]}-family)], or upgrade to Tailwind 4.` },
    ]);
  }
  if (roles.easings.length) {
    patterns.push([
      new RegExp(`${CLASS_PREFIX}ease-(${alt(roles.easings)})(?![\\w-])`, "g"),
      (m) => ({ kind: "easing", value: m[1]!, fix: `Use ease-[var(--motif-easing-${m[1]})], or upgrade to Tailwind 4.` }),
    ]);
  }
  for (const seg of classSegments(file)) {
    for (const [pattern, found] of patterns) {
      for (const m of seg.text.matchAll(pattern)) {
        const cls = m[0].replace(/^(?:[\w-]+:)*!?/, "");
        hits.push(makeHit(file, at, seg.offset + m.index!, {
          rule: "tailwind-palette",
          ...found(m),
          text: m[0],
          violation: true,
          message: `${cls} is a class of Motif's Tailwind 4 theme: with Tailwind 3 it does nothing.`,
        }));
      }
    }
  }
  return hits;
}

export function scanTailwind(source: SourceFile, scale: Scale | null): Hit[] {
  const file = { ...source, text: maskComments(source.text, source.lang) };
  const at = locator(file.text);
  const motionImport = scale?.motionImport ?? "design/motion";
  const hits: Hit[] = [];
  for (const seg of classSegments(file)) {
    for (const m of seg.text.matchAll(ARBITRARY)) {
      const c = classifyArbitrary(m[1]!, m[2]!, m[0], motionImport);
      if (c) hits.push(makeHit(file, at, seg.offset + m.index!, { ...c, text: m[0], violation: true }));
    }
    for (const m of seg.text.matchAll(PALETTE)) {
      const value = m[2] ? `${m[2]}-${m[3]}` : m[4]!;
      hits.push(makeHit(file, at, seg.offset + m.index!, {
        rule: "tailwind-palette",
        kind: "color",
        value,
        context: utilContext(m[1]!),
        text: m[0],
        violation: true,
        message: `Tailwind default colour ${m[0]} — Motif's theme replaces the default palette.`,
        fix: "Use a theme colour class such as bg-action-primary or text-text-secondary.",
      }));
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}
