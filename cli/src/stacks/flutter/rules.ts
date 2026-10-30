// motif check for Flutter: colours, sizes, fonts and motion typed in Dart widget code instead of taken from motif_theme.dart.
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../../check/types";
import { locator } from "../../text";
import { callArgs, callee, enclosing, namedArgument, type Arg } from "../../check/calls";
import { colorField, member } from "./generate";

const FIX = {
  color: "Use MotifColors.of(context).<role>.",
  space: "Use MotifSpace.s<N>.",
  radius: "Use MotifRadius.<role>.",
  text: "Use MotifText.<role>.",
  duration: "Use MotifDurations.<role> (or MotifMotion.duration(context, …)).",
  easing: "Use MotifCurves.<role>.",
  spring: "Use MotifSprings.<role>.",
  reducedMotion: "Use MotifMotion.duration(context, …) for durations (it is zero when reduce motion is on), or check MediaQuery.disableAnimationsOf(context).",
};

/** What to use instead, in Dart: the generated class that holds the theme's value. */
export function dartFix(hit: Hit): string {
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

/** A theme role as the member motif_theme.dart declares for it (MotifColors.of(context).textSecondary, MotifSpace.s4). */
export function dartRole(kind: ValueKind, name: string): string {
  switch (kind) {
    case "color":
      return `MotifColors.of(context).${colorField(name)}`;
    case "space":
      return `MotifSpace.${member(name, "s")}`;
    case "radius":
      return `MotifRadius.${member(name, "r")}`;
    case "font-size":
    case "font-family":
      return `MotifText.${member(name, "t")}`;
    case "duration":
      return `MotifDurations.${member(name, "d")}`;
    case "easing":
      return `MotifCurves.${member(name, "e")}`;
    case "spring":
      return `MotifSprings.${member(name, "s")}`;
    case "shadow":
      return `MotifShadows.${member(name, "s")}`;
  }
}

/** A number literal; Dart allows digit separators (1_000). */
const NUMBER = /^-?\d[\d_]*(?:\.\d[\d_]*)?$/;
const num = (literal: string) => Number(literal.replace(/_/g, ""));

export { callArgs, namedArgument };
export type { Arg };

const BACKGROUND_ARGS = new Set(["backgroundColor", "fillColor", "scaffoldBackgroundColor", "canvasColor"]);
const TEXT_ARGS = new Set(["foregroundColor", "iconColor", "cursorColor"]);
const BACKGROUND_CALLS = new Set(["Container", "BoxDecoration", "Material", "Card", "ColoredBox"]);
const TEXT_CALLS = new Set(["TextStyle", "Icon"]);
const BORDER_CALLS = new Set(["BorderSide", "Border.all"]);

export function colorContext(text: string, index: number): "text" | "background" | "border" | "other" {
  const arg = namedArgument(text, index);
  if (!arg) return "other";
  if (BACKGROUND_ARGS.has(arg.name)) return "background";
  if (TEXT_ARGS.has(arg.name)) return "text";
  if (arg.name === "borderColor") return "border";
  if (arg.name !== "color") return "other";
  if (BACKGROUND_CALLS.has(arg.call)) return "background";
  if (TEXT_CALLS.has(arg.call)) return "text";
  if (BORDER_CALLS.has(arg.call)) return "border";
  return "other";
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
/** CSS hex from 0–255 channels and an alpha of 0–255: #rrggbb, or #rrggbbaa when it isn't opaque. */
const cssHex = (a: number, r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}${Math.round(a) >= 255 ? "" : hex2(a)}`;

/** The colour a Color.fromARGB / fromRGBO / from call makes, when all its arguments are numbers. */
function colorFromArgs(kind: string, args: Arg[]): string | undefined {
  const nums = args.map((a) => (NUMBER.test(a.value) ? num(a.value) : Number.NaN));
  if (nums.some((n) => Number.isNaN(n))) return undefined;
  if (kind === "fromARGB" && nums.length === 4) return cssHex(nums[0]!, nums[1]!, nums[2]!, nums[3]!);
  if (kind === "fromRGBO" && nums.length === 4) return cssHex(nums[3]! * 255, nums[0]!, nums[1]!, nums[2]!);
  if (kind === "from") {
    const named = new Map(args.map((a, i) => [a.name, nums[i]!]));
    const [alpha, red, green, blue] = ["alpha", "red", "green", "blue"].map((k) => named.get(k));
    if (alpha === undefined || red === undefined || green === undefined || blue === undefined) return undefined;
    return cssHex(alpha * 255, red * 255, green * 255, blue * 255);
  }
  return undefined;
}

// Dart digit separators are allowed: Color(0xFF_3B_82_F6).
const COLOR_HEX = /(?<![\w$])Color\s*\(\s*0[xX]([0-9a-fA-F][0-9a-fA-F_]*)\s*\)/g;
const COLOR_CALL = /(?<![\w$])Color\.(fromARGB|fromRGBO|from)\s*\(/g;
const NAMED_COLOR = /(?<![\w$])(Colors|CupertinoColors)\.([A-Za-z_$][\w$]*)(?:\.(shade\d+))?/g;
const SPACE_CALL = /(?<![\w$])(?:EdgeInsets\.(?:all|symmetric|only|fromLTRB)|EdgeInsetsDirectional\.(?:only|fromSTEB)|Gap)\s*\(/g;
const SIZED_BOX = /(?<![\w$.])SizedBox\s*\(/g;
const SPACING_ARG = /(?<![\w$.])(?:spacing|runSpacing|mainAxisSpacing|crossAxisSpacing)\s*:\s*(-?\d[\d_]*(?:\.\d[\d_]*)?)(?=\s*[,)\]}])/g;
const RADIUS_CALL = /(?<![\w$])(?:BorderRadius|BorderRadiusDirectional|Radius)\.circular\s*\(/g;
const FONT_SIZE = /(?<![\w$.])fontSize\s*:\s*(-?\d[\d_]*(?:\.\d[\d_]*)?)(?=\s*[,)\]}])/g;
const FONT_FAMILY = /(?<![\w$.])fontFamily\s*:\s*r?(?=['"])/g;
const FONT_FALLBACK = /(?<![\w$.])fontFamilyFallback\s*:\s*(?:const\s+)?(?:<\s*String\s*>\s*)?\[/g;
const GOOGLE_FONT = /(?<![\w$])GoogleFonts\.([A-Za-z_$][\w$]*)\s*\(/g;
const NOT_A_FAMILY = new Set(["config", "asMap", "pendingFonts", "getTextTheme"]);
const DURATION_CALL = /(?<![\w$.])Duration\s*\(/g;
/** Named arguments ending in "uration" that time something other than an animation. */
const NOT_MOTION_DURATIONS = new Set([
  "waitDuration", "showDuration", "exitDuration", "debounceDuration", "cacheDuration", "timeoutDuration",
  "pollDuration", "refreshDuration", "autoplayDuration", "pauseDuration", "delayDuration",
]);
/** Widgets whose duration: is how long they stay up, not an animation. */
const DISPLAY_TIMERS = new Set(["SnackBar", "MaterialBanner", "Tooltip"]);
/** A named argument's value up to this Duration: the Duration itself, or one side of a choice (reduce ? Duration.zero : …). */
const DURATION_ARG = /^\s*([A-Za-z_$][\w$]*uration)\s*:(?:\s*|[^,]*[?:]\s*)(?:const\s+)?$/;

/** True when the Duration at `index` is the value of an animation's duration argument (duration:, reverseDuration:, …). */
function animationDuration(text: string, index: number): boolean {
  const { argStart, open } = enclosing(text, index);
  const name = text.slice(argStart, index).match(DURATION_ARG)?.[1];
  if (!name || NOT_MOTION_DURATIONS.has(name)) return false;
  return !(name === "duration" && DISPLAY_TIMERS.has(callee(text, open)));
}
const DURATION_UNITS: Record<string, number> = { microseconds: 0.001, milliseconds: 1, seconds: 1000, minutes: 60000 };
const CURVE = /(?<![\w$])Curves\.([A-Za-z_$][\w$]*)/g;
const CUBIC = /(?<![\w$.])Cubic\s*\(/g;
const SPRING = /(?<![\w$.])SpringDescription(?:\.withDampingRatio)?\s*\(/g;

const sizeMessage = {
  space: (px: number) => `Spacing ${px}px isn't on your spacing scale.`,
  radius: (px: number) => `Corner size ${px}px isn't one of your radius roles.`,
  "font-size": (px: number) => `Text size ${px}px isn't one of your text roles.`,
};

/** A string literal starting at `quote` (masked text): its end quote's index, or -1 when it isn't one plain literal. */
function literalEnd(masked: string, quote: number): number {
  const q = masked[quote];
  if (q !== "'" && q !== '"') return -1;
  if (masked.startsWith(q.repeat(3), quote)) return -1;
  const end = masked.indexOf(q, quote + 1);
  // Interpolated code (${…}) stays visible in masked text: not a plain literal.
  if (end === -1 || masked.slice(quote + 1, end).trim() !== "") return -1;
  return end;
}

const PAINT_METHOD = /(?<![\w$])void\s+paint\s*\(\s*Canvas\s+\w+\s*,\s*Size\s+\w+\s*\)\s*\{/g;

/**
 * Each CustomPainter paint method's body, from its { to its }, in masked text. Its numbers are a drawing's geometry on a
 * canvas it scales itself (a rounded hill, a gate's corners), not the interface's corners and gaps, so its sizes aren't
 * judged; its colours still are.
 */
function paintBodies(text: string): [number, number][] {
  const bodies: [number, number][] = [];
  for (const m of text.matchAll(PAINT_METHOD)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        bodies.push([open, i]);
        break;
      }
    }
  }
  return bodies;
}

/** A call written over several lines, on one (it's shown in one line of the report). */
const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/,?\s\)$/, ")");

/** A google_fonts member as the family it names: robotoMono → Roboto Mono, interTextTheme → Inter. */
function googleFamily(name: string): string {
  return name
    .replace(/TextTheme$/, "")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Colours, sizes, fonts and motion typed in a Dart file. Read on the code alone (comments and string contents blanked), so
 * positions are the file's own. With a scale, sizes and durations on it are seen but allowed; without one (extract), every
 * value is seen and none is judged.
 */
export function scanDart(source: SourceFile, scale: Scale | null): Hit[] {
  const original = source.text;
  const text = maskStrings(maskComments(original, "dart"), "dart");
  const file = { ...source, text };
  const at = locator(text);
  const hits: Hit[] = [];
  const push = (index: number, fields: { rule: RuleId; kind: ValueKind; text: string; value?: string; context?: string; violation: boolean; message: string }) => {
    const hit = makeHit(file, at, index, { ...fields, fix: "" });
    hits.push({ ...hit, fix: dartFix(hit) });
  };

  // ---------- colours ----------
  const color = (index: number, literal: string, value: string | undefined) =>
    push(index, { rule: "raw-color", kind: "color", text: literal, ...(value ? { value } : {}), context: colorContext(text, index), violation: true, message: `Raw colour ${literal}.` });
  for (const m of text.matchAll(COLOR_HEX)) {
    const digits = m[1]!.replace(/_/g, "");
    if (digits.length > 8) continue;
    const v = digits.padStart(8, "0").toLowerCase();
    color(m.index!, m[0], cssHex(Number.parseInt(v.slice(0, 2), 16), Number.parseInt(v.slice(2, 4), 16), Number.parseInt(v.slice(4, 6), 16), Number.parseInt(v.slice(6, 8), 16)));
  }
  for (const m of text.matchAll(COLOR_CALL)) {
    const open = m.index! + m[0].length - 1;
    const call = callArgs(text, open);
    color(m.index!, call ? oneLine(text.slice(m.index!, call.close + 1)) : m[0], call ? colorFromArgs(m[1]!, call.args) : undefined);
  }
  for (const m of text.matchAll(NAMED_COLOR)) {
    const name = m[2]!;
    if (name === "transparent") continue;
    const value = m[3] ? undefined : name === "white" ? "#ffffff" : name === "black" ? "#000000" : undefined;
    color(m.index!, m[0], value);
  }

  // ---------- sizes ----------
  const drawings = paintBodies(text);
  const size = (index: number, literal: string, kind: "space" | "radius" | "font-size", number: string) => {
    if (drawings.some(([open, close]) => index > open && index < close)) return;
    const px = Math.abs(num(number));
    const set = kind === "space" ? scale?.spacePx : kind === "radius" ? scale?.radiusPx : scale?.fontSizePx;
    const onScale = px === 0 || (set?.has(px) ?? false);
    push(index, { rule: "off-scale", kind, text: literal, value: `${px}px`, violation: scale ? !onScale : false, message: sizeMessage[kind](px) });
  };
  const numberArgs = (args: Arg[], kind: "space" | "radius") => {
    for (const a of args) if (NUMBER.test(a.value)) size(a.start, text.slice(a.start, a.end), kind, a.value);
  };
  for (const m of text.matchAll(SPACE_CALL)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (call) numberArgs(call.args, "space");
  }
  for (const m of text.matchAll(SIZED_BOX)) {
    // A box with one side and nothing in it is a gap between widgets; a sized box (width and height) or one with a child isn't.
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (!call || call.args.some((a) => a.name === "child")) continue;
    const sides = call.args.filter((a) => a.name === "width" || a.name === "height");
    if (sides.length === 1) numberArgs(sides, "space");
  }
  for (const m of text.matchAll(SPACING_ARG)) size(m.index!, m[0], "space", m[1]!);
  for (const m of text.matchAll(RADIUS_CALL)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (call) numberArgs(call.args, "radius");
  }
  for (const m of text.matchAll(FONT_SIZE)) size(m.index!, m[0], "font-size", m[1]!);

  // ---------- fonts ----------
  const font = (index: number, literal: string, family: string) =>
    push(index, { rule: "raw-font", kind: "font-family", text: literal, value: family, violation: true, message: `Hard-coded font ${family}.` });
  for (const m of text.matchAll(FONT_FAMILY)) {
    const quote = m.index! + m[0].length;
    const end = literalEnd(text, quote);
    const family = end === -1 ? "" : original.slice(quote + 1, end).trim();
    if (family) font(m.index!, original.slice(m.index!, end + 1), family);
  }
  for (const m of text.matchAll(FONT_FALLBACK)) {
    const open = m.index! + m[0].length - 1;
    const list = callArgs(text, open);
    if (!list) continue;
    for (const a of list.args) {
      const quote = a.start + (text[a.start] === "r" ? 1 : 0);
      const end = literalEnd(text, quote);
      if (end === -1 || end + 1 !== a.end) continue;
      const family = original.slice(quote + 1, end).trim();
      if (family) font(a.start, original.slice(a.start, a.end), family);
    }
  }
  for (const m of text.matchAll(GOOGLE_FONT)) {
    const name = m[1]!;
    if (NOT_A_FAMILY.has(name)) continue;
    if (name === "getFont") {
      const call = callArgs(text, m.index! + m[0].length - 1);
      const first = call?.args[0];
      if (!call || !first || first.name) continue;
      const quote = first.start + (text[first.start] === "r" ? 1 : 0);
      const end = literalEnd(text, quote);
      const family = end === -1 ? "" : original.slice(quote + 1, end).trim();
      if (family) font(m.index!, oneLine(original.slice(m.index!, call.close + 1)), family);
      continue;
    }
    font(m.index!, `GoogleFonts.${name}`, googleFamily(name));
  }

  // ---------- motion ----------
  for (const m of text.matchAll(DURATION_CALL)) {
    // Only a Duration given as an animation's duration: timers, timeouts and how long a message stays up aren't motion.
    const start = m.index!;
    if (!animationDuration(text, start)) continue;
    const call = callArgs(text, m.index! + m[0].length - 1);
    if (!call || call.args.length === 0) continue;
    let ms = 0;
    let readable = true;
    for (const a of call.args) {
      const unit = a.name ? DURATION_UNITS[a.name] : undefined;
      if (unit === undefined || !NUMBER.test(a.value)) readable = false;
      else ms += num(a.value) * unit;
    }
    if (!readable) continue;
    const onScale = ms === 0 || (scale?.durationMs.has(ms) ?? false);
    push(start, {
      rule: "raw-motion", kind: "duration", text: oneLine(text.slice(start, call.close + 1)), value: `${ms}ms`,
      violation: scale ? !onScale : false, message: `Animation duration ${ms}ms isn't one of your durations.`,
    });
  }
  for (const m of text.matchAll(CURVE)) {
    if (m[1] === "linear") continue;
    push(m.index!, { rule: "raw-motion", kind: "easing", text: m[0], value: m[0], violation: true, message: `Hard-coded easing ${m[0]}.` });
  }
  for (const m of text.matchAll(CUBIC)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    const literal = call ? oneLine(text.slice(m.index!, call.close + 1)) : m[0];
    const points = call?.args.map((a) => a.value) ?? [];
    const value = points.length === 4 && points.every((p) => NUMBER.test(p)) ? `cubic-bezier(${points.join(", ")})` : literal;
    push(m.index!, { rule: "raw-motion", kind: "easing", text: literal, value, violation: true, message: `Hard-coded easing ${literal}.` });
  }
  for (const m of text.matchAll(SPRING)) {
    const call = callArgs(text, m.index! + m[0].length - 1);
    const literal = call ? oneLine(text.slice(m.index!, call.close + 1)) : m[0];
    push(m.index!, { rule: "raw-motion", kind: "spring", text: literal, value: literal, violation: true, message: `Hard-coded spring ${literal}.` });
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

const ANIMATES = /(?<![\w$])AnimationController\s*\(|(?<![\w$])Animated[A-Z][\w$]*\s*(?:<[^<>()]*>\s*)?\(|(?<![\w$])TweenAnimationBuilder\b|\.animate\s*\(|(?<![\w$])Hero\s*\(/;
const RESPECTS_REDUCED_MOTION = /disableAnimations|(?<![\w$])MotifMotion\./;

/**
 * One hit when the app animates but nothing in its own code reads the reduce-motion setting. Motif's generated file defines
 * MotifMotion (and reads disableAnimations) itself, so only the app's own files count.
 */
export function dartReducedMotion(files: SourceFile[]): Hit[] {
  const code = files.map((f) => ({ file: f, text: maskStrings(maskComments(f.text, "dart"), "dart") }));
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
