// motif check for Jetpack Compose: colours, sizes, fonts and motion typed in Kotlin instead of taken from MotifTheme.kt.
import { callArgs, callee, closingBrace, enclosing, namedArgument, type Arg } from "../../check/calls";
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../../check/types";
import { locator } from "../../text";
import { colorField, kotlinMember } from "./generate";

const FIX = {
  color: "Use MotifTheme.colors.<role>.",
  space: "Use MotifSpace.s<N>.",
  radius: "Use MotifRadius.<role>.",
  text: "Use MotifType.<role>.",
  duration: "Use MotifDurations.<role> (or MotifMotion.duration(…)).",
  easing: "Use MotifEasing.<role>.",
  spring: "Use MotifSprings.<role>().",
  reducedMotion: "Use MotifMotion.duration(…) for durations (it is zero when Remove animations is on), or check MotifMotion.reduced().",
};

/** What to use instead, in Kotlin: the generated object that holds the theme's value. */
export function composeFix(hit: Hit): string {
  switch (hit.rule) {
    case "raw-color":
      return FIX.color;
    case "raw-font":
      return FIX.text;
    case "reduced-motion":
      return FIX.reducedMotion;
    case "off-scale":
      return hit.kind === "space" ? FIX.space : hit.kind === "radius" ? FIX.radius : hit.kind === "font-size" ? FIX.text : hit.fix;
    case "raw-motion":
      return hit.kind === "duration" ? FIX.duration : hit.kind === "easing" ? FIX.easing : hit.kind === "spring" ? FIX.spring : hit.fix;
    default:
      return hit.fix;
  }
}

/** A theme role as the member MotifTheme.kt declares for it (MotifTheme.colors.textSecondary, MotifSpace.s4). */
export function composeRole(kind: ValueKind, name: string): string {
  switch (kind) {
    case "color":
      return `MotifTheme.colors.${colorField(name)}`;
    case "space":
      return `MotifSpace.${kotlinMember(name, "s")}`;
    case "radius":
      return `MotifRadius.${kotlinMember(name, "r")}`;
    case "font-size":
    case "font-family":
      return `MotifType.${kotlinMember(name, "t")}`;
    case "duration":
      return `MotifDurations.${kotlinMember(name, "d")}`;
    case "easing":
      return `MotifEasing.${kotlinMember(name, "e")}`;
    case "spring":
      return `MotifSprings.${kotlinMember(name, "s")}()`;
    case "shadow":
      return `MotifShadows.${kotlinMember(name, "s")}`;
  }
}

/** A number literal: Kotlin allows digit separators (1_000) and an f suffix. */
const NUMBER = /^-?\d[\d_]*(?:\.\d[\d_]*)?[fF]?$/;
const INTEGER = /^\d[\d_]*$/;
const num = (literal: string) => Number(literal.replace(/[_fF]/g, ""));
const HEX = /^0[xX]([0-9a-fA-F][0-9a-fA-F_]*)[lL]?$/;
const DP = /^(-?\d[\d_]*(?:\.\d[\d_]*)?)[fF]?\.dp$/;
const isFloat = (literal: string) => /[.fF]/.test(literal);

const BACKGROUND_ARGS = new Set(["containerColor", "backgroundColor", "disabledContainerColor", "selectedContainerColor", "unselectedContainerColor", "scrimColor"]);
const TEXT_ARGS = new Set(["contentColor", "textColor", "tint", "disabledContentColor", "iconColor", "selectedContentColor", "unselectedContentColor", "cursorColor"]);
const BACKGROUND_CALLS = new Set(["background", "Surface", "Card", "ElevatedCard", "OutlinedCard", "Box", "ColoredBox"]);
const TEXT_CALLS = new Set(["Text", "TextStyle", "SpanStyle", "Icon"]);
const BORDER_CALLS = new Set(["BorderStroke", "border"]);
const tail = (call: string) => call.split(".").pop()!;

/** Where a colour is used: a background, text (or an icon's tint), a border; from the argument or call that holds it. */
function colorContext(text: string, index: number): "text" | "background" | "border" | "other" {
  // Given by position to background( or border(: Modifier.background(Color.White), border(1.dp, Color.Red).
  const { argStart, open } = enclosing(text, index);
  if (open >= 0 && text[open] === "(" && !/^\s*[A-Za-z_]\w*\s*=(?!=)/.test(text.slice(argStart, index))) {
    const call = tail(callee(text, open));
    if (call === "background") return "background";
    if (BORDER_CALLS.has(call)) return "border";
  }
  const arg = namedArgument(text, index, "=");
  if (!arg) return "other";
  if (BACKGROUND_ARGS.has(arg.name)) return "background";
  if (TEXT_ARGS.has(arg.name)) return "text";
  if (arg.name === "borderColor") return "border";
  if (arg.name !== "color") return "other";
  const call = tail(arg.call);
  if (BACKGROUND_CALLS.has(call)) return "background";
  if (TEXT_CALLS.has(call)) return "text";
  if (BORDER_CALLS.has(call)) return "border";
  return "other";
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
/** CSS hex from 0–255 channels and an alpha of 0–255: #rrggbb, or #rrggbbaa when it isn't opaque. */
const cssHex = (a: number, r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}${Math.round(a) >= 255 ? "" : hex2(a)}`;

/** Compose's named colours, as CSS hex. Transparent and Unspecified are not colours of the design. */
const NAMED: Record<string, string> = {
  Black: "#000000", DarkGray: "#444444", Gray: "#888888", LightGray: "#cccccc", White: "#ffffff",
  Red: "#ff0000", Green: "#00ff00", Blue: "#0000ff", Yellow: "#ffff00", Cyan: "#00ffff", Magenta: "#ff00ff",
};

/** The colour of Color(red, green, blue[, alpha]) when every argument is a number: Ints are 0–255, Floats 0–1. */
function colorFromArgs(args: Arg[]): string | undefined {
  if (args.length < 3 || args.length > 4 || args.some((a) => !NUMBER.test(a.value))) return undefined;
  const order = ["red", "green", "blue", "alpha"];
  const byName = new Map<string, string>();
  for (const [i, a] of args.entries()) {
    const name = a.name ?? order[i]!;
    if (!order.includes(name) || byName.has(name)) return undefined;
    byName.set(name, a.value);
  }
  if (!["red", "green", "blue"].every((k) => byName.has(k))) return undefined;
  const floats = [...byName.values()].some(isFloat);
  const channel = (name: string, fallback: number) => {
    const v = byName.get(name);
    return v === undefined ? fallback : floats ? num(v) * 255 : num(v);
  };
  return cssHex(channel("alpha", 255), channel("red", 0), channel("green", 0), channel("blue", 0));
}

/** Android's Color.parseColor string (#RGB, #RRGGBB, #AARRGGBB) as CSS hex. */
function parseColorValue(literal: string): string | undefined {
  const m = literal.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return undefined;
  const h = m[1]!.toLowerCase();
  if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  if (h.length === 6) return `#${h}`;
  const alpha = h.slice(0, 2);
  return `#${h.slice(2)}${alpha === "ff" ? "" : alpha}`;
}

const COLOR_CALL = /(?<![\w$])Color\s*\(/g;
const NAMED_COLOR = new RegExp(`(?<![\\w$])Color\\.(${Object.keys(NAMED).join("|")})(?![\\w$])`, "g");
const PARSE_COLOR = /(?<![\w$])(?:android\.graphics\.)?Color\.parseColor\s*\(/g;
const PADDING_CALL = /(?<![\w$])(?:absolutePadding|padding)\s*\(/g;
const SPACED_BY = /(?<![\w$])spacedBy\s*\(/g;
const PADDING_VALUES = /(?<![\w$])PaddingValues\s*\(/g;
const SPACER = /(?<![\w$])Spacer\s*\(/g;
const SPACER_SIDE = /(?<![\w$])(?:height|width)\s*\(/g;
const RADIUS_CALL = /(?<![\w$])(?:RoundedCornerShape|CornerSize)\s*\(/g;
const FONT_SIZE = /(?<![\w$.])fontSize\s*=(?!=)\s*(-?\d[\d_]*(?:\.\d[\d_]*)?)[fF]?\.sp(?![\w$])/g;
const FONT_FAMILY_CALL = /(?<![\w$.])FontFamily\s*\(/g;
const GENERIC_FAMILY = /(?<![\w$.])fontFamily\s*=(?!=)\s*FontFamily\.(Serif|Monospace|Cursive)(?![\w$])/g;
const GOOGLE_FONT = /(?<![\w$.])GoogleFont\s*\(/g;
const FONT_CALL = /(?<![\w$])Font\s*\(/;
const TWEEN = /(?<![\w$.])(tween|snap)\s*(?:<[^<>()]*>\s*)?\(/g;
const KEYFRAMES = /(?<![\w$.])keyframes\s*(?:<[^<>()]*>\s*)?\{/g;
const KEYFRAME_DURATION = /(?<![\w$.])durationMillis\s*=(?!=)\s*(\d[\d_]*)(?![\w$.])/g;
const EASING_CONSTANT = /(?<![\w$])(?:FastOutSlowInEasing|LinearOutSlowInEasing|FastOutLinearInEasing|Ease(?:In|Out|InOut)?(?:Sine|Quad|Cubic|Quart|Quint|Expo|Circ|Back|Elastic|Bounce)?)(?![\w$])/g;
const CUBIC = /(?<![\w$.])CubicBezierEasing\s*\(/g;
const SPRING = /(?<![\w$.])spring\s*(?:<[^<>()]*>\s*)?\(/g;
const IMPORT_LINE = /^[ \t]*(?:import|package)\s[^\n]*/gm;

/** A function marked @Composable: its modifiers, name and parameter list, up to the "(". */
const COMPOSABLE_FUN =
  /@Composable\b(?:\s*@[A-Za-z_]\w*(?:\.\w+)*(?:\([^()]*\))?)*\s*(?:(?:public|private|internal|protected|inline|suspend|tailrec|operator|override|open|final)\s+)*fun\s*(?:<[^>]*>\s*)?[\w.]+\s*\(/g;

/** The bodies of the @Composable functions in a file (masked): a block, or an expression up to the next line that starts at the margin. */
function composableRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of code.matchAll(COMPOSABLE_FUN)) {
    const open = m.index! + m[0].length - 1;
    const params = callArgs(code, open, "=");
    if (!params) continue;
    const after = code.slice(params.close + 1, params.close + 1 + 300).match(/^[^{=]*([{=])/);
    if (!after) continue;
    const mark = params.close + 1 + after[0].length - 1;
    if (after[1] === "{") ranges.push([m.index!, closingBrace(code, mark)]);
    else {
      const next = code.slice(mark).search(/\n(?=[^\s)}\]])/);
      ranges.push([m.index!, next === -1 ? code.length : mark + next]);
    }
  }
  return ranges;
}

const sizeMessage = {
  space: (px: number) => `Spacing ${px}px isn't on your spacing scale.`,
  radius: (px: number) => `Corner size ${px}px isn't one of your radius roles.`,
  "font-size": (px: number) => `Text size ${px}px isn't one of your text roles.`,
};

/** A string literal starting at `quote` (masked text): its end quote's index, or -1 when it isn't one plain literal. */
function literalEnd(masked: string, quote: number): number {
  if (masked[quote] !== '"' || masked.startsWith('"""', quote)) return -1;
  const end = masked.indexOf('"', quote + 1);
  // Interpolated code (${…}) stays visible in masked text: not a plain literal.
  if (end === -1 || masked.slice(quote + 1, end).trim() !== "") return -1;
  return end;
}

/** A call written over several lines, on one (it's shown in one line of the report). */
const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/,?\s\)$/, ")");

/**
 * Colours, sizes, fonts and motion typed in a Kotlin file. Read on the code alone (comments and string contents blanked), so
 * positions are the file's own. With a scale, sizes and durations on it are seen but allowed; without one (extract), every
 * value is seen and none is judged.
 */
export function scanKotlin(source: SourceFile, scale: Scale | null): Hit[] {
  const original = source.text;
  const text = maskStrings(maskComments(original, "kotlin"), "kotlin");
  const file = { ...source, text };
  const at = locator(text);
  const imports = [...text.matchAll(IMPORT_LINE)].map((m): [number, number] => [m.index!, m.index! + m[0].length]);
  const hits: Hit[] = [];
  const push = (index: number, fields: { rule: RuleId; kind: ValueKind; text: string; value?: string; context?: string; violation: boolean; message: string }) => {
    if (imports.some(([a, b]) => index >= a && index < b)) return;
    const hit = makeHit(file, at, index, { ...fields, fix: "" });
    hits.push({ ...hit, fix: composeFix(hit) });
  };

  // ---------- colours ----------
  const color = (index: number, literal: string, value: string | undefined) =>
    push(index, { rule: "raw-color", kind: "color", text: literal, ...(value ? { value } : {}), context: colorContext(text, index), violation: true, message: `Raw colour ${literal}.` });
  for (const m of text.matchAll(COLOR_CALL)) {
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    if (!call) continue;
    const literal = oneLine(text.slice(m.index!, call.close + 1));
    const hex = call.args.length === 1 && !call.args[0]!.name ? call.args[0]!.value.match(HEX) : null;
    if (hex) {
      const digits = hex[1]!.replace(/_/g, "");
      if (digits.length > 8) continue;
      const v = digits.padStart(8, "0").toLowerCase();
      color(m.index!, literal, cssHex(Number.parseInt(v.slice(0, 2), 16), Number.parseInt(v.slice(2, 4), 16), Number.parseInt(v.slice(4, 6), 16), Number.parseInt(v.slice(6, 8), 16)));
      continue;
    }
    const value = colorFromArgs(call.args);
    if (value) color(m.index!, literal, value);
  }
  for (const m of text.matchAll(NAMED_COLOR)) color(m.index!, m[0], NAMED[m[1]!]);
  for (const m of text.matchAll(PARSE_COLOR)) {
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    const first = call?.args[0];
    if (!call || !first || first.name) continue;
    const end = literalEnd(text, first.start);
    if (end === -1 || end + 1 !== first.end) continue;
    color(m.index!, oneLine(original.slice(m.index!, call.close + 1)), parseColorValue(original.slice(first.start + 1, end)));
  }

  // ---------- sizes ----------
  const size = (index: number, literal: string, kind: "space" | "radius" | "font-size", number: string) => {
    const px = Math.abs(num(number));
    const set = kind === "space" ? scale?.spacePx : kind === "radius" ? scale?.radiusPx : scale?.fontSizePx;
    const onScale = px === 0 || (set?.has(px) ?? false);
    push(index, { rule: "off-scale", kind, text: literal, value: `${px}px`, violation: scale ? !onScale : false, message: sizeMessage[kind](px) });
  };
  const dpArgs = (args: Arg[], kind: "space" | "radius") => {
    for (const a of args) {
      const m = a.value.match(DP);
      if (m) size(a.start, text.slice(a.start, a.end), kind, m[1]!);
    }
  };
  for (const [re, kind] of [[PADDING_CALL, "space"], [SPACED_BY, "space"], [PADDING_VALUES, "space"], [RADIUS_CALL, "radius"]] as const) {
    for (const m of text.matchAll(re)) {
      const call = callArgs(text, m.index! + m[0].length - 1, "=");
      if (call) dpArgs(call.args, kind);
    }
  }
  for (const m of text.matchAll(SPACER)) {
    // Spacer(Modifier.height(8.dp)) is a gap between things; Spacer(Modifier.size(16.dp)) sits in a layout of its own and isn't read.
    const open = m.index! + m[0].length - 1;
    const call = callArgs(text, open, "=");
    if (!call) continue;
    for (const side of text.slice(open, call.close).matchAll(SPACER_SIDE)) {
      const sideCall = callArgs(text, open + side.index! + side[0].length - 1, "=");
      if (sideCall) dpArgs(sideCall.args, "space");
    }
  }
  for (const m of text.matchAll(FONT_SIZE)) size(m.index!, m[0], "font-size", m[1]!);

  // ---------- fonts ----------
  const font = (index: number, literal: string, family: string | undefined) =>
    push(index, { rule: "raw-font", kind: "font-family", text: literal, ...(family ? { value: family } : {}), violation: true, message: `Hard-coded font${family ? ` ${family}` : ""}.` });
  const composables = composableRanges(text);
  const built: [number, number][] = [];
  for (const m of text.matchAll(FONT_FAMILY_CALL)) {
    // Only a family built in a composable: the app's own type setup, at the top of a file, is its theme code.
    if (!composables.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    if (!call) continue;
    const inside = text.slice(m.index!, call.close + 1);
    const fontCall = inside.match(FONT_CALL);
    if (!fontCall) continue;
    const fontArgs = callArgs(text, m.index! + fontCall.index! + fontCall[0].length - 1, "=");
    const resource = fontArgs?.args[0]?.value.match(/(?:^|\.)font\.([A-Za-z_]\w*)$/)?.[1];
    built.push([m.index!, call.close + 1]);
    font(m.index!, oneLine(inside), resource);
  }
  for (const m of text.matchAll(GENERIC_FAMILY)) font(m.index!, oneLine(m[0]), m[1]!.toLowerCase());
  for (const m of text.matchAll(GOOGLE_FONT)) {
    if (built.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    const first = call?.args.find((a) => a.name === "name") ?? call?.args.find((a) => !a.name);
    if (!call || !first) continue;
    const end = literalEnd(text, first.valueStart);
    const family = end === -1 ? "" : original.slice(first.valueStart + 1, end).trim();
    if (family) font(m.index!, oneLine(original.slice(m.index!, call.close + 1)), family);
  }

  // ---------- motion ----------
  const duration = (index: number, literal: string, digits: string) => {
    const ms = num(digits);
    const onScale = ms === 0 || (scale?.durationMs.has(ms) ?? false);
    push(index, { rule: "raw-motion", kind: "duration", text: literal, value: `${ms}ms`, violation: scale ? !onScale : false, message: `Animation duration ${ms}ms isn't one of your durations.` });
  };
  for (const m of text.matchAll(TWEEN)) {
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    if (!call) continue;
    const named = m[1] === "tween" ? "durationMillis" : "delayMillis";
    const arg = call.args.find((a) => a.name === named) ?? (call.args[0] && !call.args[0].name ? call.args[0] : undefined);
    if (arg && INTEGER.test(arg.value)) duration(m.index!, oneLine(text.slice(m.index!, call.close + 1)), arg.value);
  }
  for (const m of text.matchAll(KEYFRAMES)) {
    const open = m.index! + m[0].length - 1;
    const body = text.slice(open, closingBrace(text, open));
    for (const d of body.matchAll(KEYFRAME_DURATION)) duration(open + d.index!, d[0], d[1]!);
  }
  const easing = (index: number, literal: string, value: string) =>
    push(index, { rule: "raw-motion", kind: "easing", text: literal, value, violation: true, message: `Hard-coded easing ${literal}.` });
  for (const m of text.matchAll(EASING_CONSTANT)) easing(m.index!, m[0], m[0]);
  for (const m of text.matchAll(CUBIC)) {
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    const literal = call ? oneLine(text.slice(m.index!, call.close + 1)) : m[0];
    const points = call?.args.map((a) => a.value) ?? [];
    const value = points.length === 4 && points.every((p) => NUMBER.test(p)) ? `cubic-bezier(${points.map((p) => num(p)).join(", ")})` : literal;
    easing(m.index!, literal, value);
  }
  for (const m of text.matchAll(SPRING)) {
    const call = callArgs(text, m.index! + m[0].length - 1, "=");
    if (!call) continue;
    const typed = call.args.some((a, i) => {
      const name = a.name ?? (["dampingRatio", "stiffness"][i] as string | undefined);
      return (name === "dampingRatio" || name === "stiffness") && (NUMBER.test(a.value) || /^Spring\.(?:DampingRatio|Stiffness)\w*$/.test(a.value));
    });
    if (!typed) continue;
    const literal = oneLine(text.slice(m.index!, call.close + 1));
    push(m.index!, { rule: "raw-motion", kind: "spring", text: literal, value: literal, violation: true, message: `Hard-coded spring ${literal}.` });
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

const ANIMATES =
  /(?<![\w$])animate[A-Z]\w*AsState\s*(?:<[^<>()]*>\s*)?\(|(?<![\w$])(?:AnimatedVisibility|AnimatedContent|Crossfade|rememberInfiniteTransition|updateTransition|Animatable)\s*(?:<[^<>()]*>\s*)?\(/;
const RESPECTS_REDUCED_MOTION = /(?<![\w$])ANIMATOR_DURATION_SCALE(?![\w$])|(?<![\w$])MotifMotion\./;

/**
 * One hit when the app animates but nothing in its own code reads the animator duration scale. Motif's generated file defines
 * MotifMotion (and reads the scale) itself, so only the app's own files count.
 */
export function composeReducedMotion(files: SourceFile[]): Hit[] {
  const code = files.map((f) => ({ file: f, text: maskStrings(maskComments(f.text, "kotlin"), "kotlin") }));
  if (code.some((c) => RESPECTS_REDUCED_MOTION.test(c.text))) return [];
  const first = code.find((c) => ANIMATES.test(c.text));
  if (!first) return [];
  const index = first.text.search(ANIMATES);
  return [makeHit(first.file, locator(first.text), index, {
    rule: "reduced-motion",
    text: "animation",
    violation: true,
    message: 'Animations here ignore the "Remove animations" setting.',
    fix: FIX.reducedMotion,
  })];
}
