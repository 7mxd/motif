// motif check for SwiftUI: colours, sizes, fonts and motion typed in Swift instead of taken from MotifTheme.swift.
import { callArgs, callee, enclosing, type Arg } from "../../check/calls";
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../../check/types";
import { locator } from "../../text";
import { swiftMember, TYPE_MEMBERS } from "./generate";

const FIX = {
  color: "Use colors.<role> from @Environment(\\.motifColors).",
  space: "Use MotifSpace.s<N>.",
  radius: "Use MotifRadius.<role>.",
  text: "Use .motifFont(.<role>).",
  duration: "Use MotifDurations.<role> (seconds).",
  easing: "Use MotifCurves.<role>.",
  spring: "Use MotifSprings.<role>.",
  reducedMotion: "Read @Environment(\\.accessibilityReduceMotion) and skip or shorten the animation, or use MotifMotion.animation(…, reduceMotion:).",
};

/** What to use instead, in Swift: the generated type that holds the theme's value. */
export function swiftUIFix(hit: Hit): string {
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

/** The members MotifColors itself declares, which a colour role's name mustn't take. */
const COLOR_MEMBERS = new Set(["resolve", "light", "dark"]);

/** A theme role as MotifTheme.swift declares it (colors.textSecondary, MotifSpace.s4), for "Closest:" suggestions. */
export function swiftUIRole(kind: ValueKind, name: string): string {
  switch (kind) {
    case "color":
      return `colors.${swiftMember(name, "c", COLOR_MEMBERS)}`;
    case "space":
      return `MotifSpace.${swiftMember(name, "s")}`;
    case "radius":
      return `MotifRadius.${swiftMember(name, "r")}`;
    case "font-size":
    case "font-family":
      return `.motifFont(.${swiftMember(name, "t", TYPE_MEMBERS)})`;
    case "duration":
      return `MotifDurations.${swiftMember(name, "d")}`;
    case "easing":
      return `MotifCurves.${swiftMember(name, "e")}`;
    case "spring":
      return `MotifSprings.${swiftMember(name, "s")}`;
    case "shadow":
      return `MotifShadows.${swiftMember(name, "s")}`;
  }
}

const NUMBER = /^-?\d[\d_]*(?:\.\d[\d_]*)?$/;
const num = (literal: string) => Number(literal.replace(/_/g, ""));
const tail = (call: string) => call.split(".").pop()!;

/** A number literal, or one over another (`12 / 255.0`): its value. */
function numeric(value: string): number | undefined {
  if (NUMBER.test(value)) return num(value);
  const m = value.match(/^(-?\d[\d_]*(?:\.\d[\d_]*)?)\s*\/\s*(\d[\d_]*(?:\.\d[\d_]*)?)$/);
  return m && num(m[2]!) !== 0 ? num(m[1]!) / num(m[2]!) : undefined;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
/** CSS hex from 0-255 channels and an alpha of 0-1: #rrggbb, or #rrggbbaa when it isn't opaque. */
const cssHex = (r: number, g: number, b: number, alpha = 1) => `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha >= 1 ? "" : hex2(alpha * 255)}`;

/** The colour of Color(red:green:blue:opacity:), Color(white:opacity:) and UIColor(red:…alpha:) when every argument is a number (0-1). */
function colorFromArgs(args: Arg[]): string | undefined {
  const named = new Map<string, number>();
  for (const a of args) {
    if (!a.name) continue;
    const v = numeric(a.value);
    if (v === undefined) return undefined;
    named.set(a.name, v);
  }
  const alpha = named.get("opacity") ?? named.get("alpha") ?? 1;
  if (named.has("white")) return cssHex(named.get("white")! * 255, named.get("white")! * 255, named.get("white")! * 255, alpha);
  if (["red", "green", "blue"].every((k) => named.has(k))) return cssHex(named.get("red")! * 255, named.get("green")! * 255, named.get("blue")! * 255, alpha);
  return undefined;
}

/** A `#rgb`, `#rrggbb` or `#rrggbbaa` string as CSS hex (the leading # is optional when asked). */
function hexString(literal: string, needHash: boolean): string | undefined {
  const m = literal.trim().match(needHash ? /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/ : /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return undefined;
  const h = m[1]!.toLowerCase();
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

const BASE = "red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|gray|grey|black|white|magenta|lightGray|darkGray";
const SYSTEM = "systemRed|systemOrange|systemYellow|systemGreen|systemMint|systemTeal|systemCyan|systemBlue|systemIndigo|systemPurple|systemPink|systemBrown|systemGray\\d?";
const NAMED_COLOR = `(?:${BASE}|${SYSTEM})`;
const NAMED_VALUE: Record<string, string> = { black: "#000000", white: "#ffffff" };

const COLOR_CALL = /(?<![\w$])(Color|UIColor|NSColor|CGColor)\s*\(/g;
const COLOR_LITERAL = /#colorLiteral\s*\(/g;
const COLOR_DOT = new RegExp(`(?<![\\w$])Color\\.(${BASE})(?![\\w$(])`, "g");
const KIT_DOT = new RegExp(`(?<![\\w$])(?:UIColor|NSColor)\\.(${NAMED_COLOR})(?![\\w$(])`, "g");
const IMPLICIT_DOT = new RegExp(`(?<![\\w$.])\\.(${BASE})(?![\\w$(])`, "g");
const NAMED_ARG = new RegExp(`^(?:(?:Color|UIColor|NSColor)\\s*)?\\.(?:${NAMED_COLOR})$|^(?:UIColor|NSColor)\\.(?:${NAMED_COLOR})$`);

const TEXT_CALLS = new Set(["foregroundColor", "foregroundStyle", "tint", "accentColor", "symbolRenderingMode"]);
const BACKGROUND_CALLS = new Set(["background", "backgroundStyle", "fill", "listRowBackground", "containerBackground"]);
const BORDER_CALLS = new Set(["border", "stroke", "strokeBorder"]);
const COLOR_CALLS = new Set([...TEXT_CALLS, ...BACKGROUND_CALLS, ...BORDER_CALLS, "overlay", "shadow", "colorMultiply"]);
const LABEL_CONTEXT: Record<string, "text" | "background" | "border"> = {
  foregroundColor: "text", foregroundStyle: "text", tint: "text", tintColor: "text", textColor: "text",
  backgroundColor: "background", background: "background", fill: "background", borderColor: "border", stroke: "border",
};
const LABEL_AT_END = /(?:^|[(,\s])([A-Za-z_]\w*)\s*:(?!:)\s*$/;
const LABEL_AT_START = /^\s*([A-Za-z_]\w*)\s*:(?!:)/;

/** Where a colour is used: a background, text (or a tint), a border; from the modifier or label that holds it. */
function colorContext(text: string, index: number): "text" | "background" | "border" | "other" {
  let at = index;
  for (let level = 0; level < 6; level++) {
    const { argStart, open } = enclosing(text, at);
    const label = text.slice(argStart, at).match(LABEL_AT_START)?.[1];
    if (label) {
      const mapped = LABEL_CONTEXT[label];
      if (mapped) return mapped;
      if (label === "color") return "other";
    }
    if (open === -1) return "other";
    if (text[open] === "{") {
      const name = text.slice(0, open).match(/([A-Za-z_]\w*)\s*(?:\))?\s*$/)?.[1];
      return name === "background" ? "background" : name === "overlay" ? "other" : "other";
    }
    if (text[open] === "(" && !label) {
      const call = tail(callee(text, open));
      if (TEXT_CALLS.has(call)) return "text";
      if (BACKGROUND_CALLS.has(call)) return "background";
      if (BORDER_CALLS.has(call)) return "border";
    }
    at = open;
  }
  return "other";
}

const PADDING_CALL = /\.padding\s*\(/g;
const CORNER_RADIUS = /\.cornerRadius\s*\(/g;
const RADIUS_SHAPE = /(?<![\w$])RoundedRectangle\s*\(|\.rect\s*\(/g;
const SPACING_ARG = /(?<![\w$.])(?:spacing|horizontalSpacing|verticalSpacing|columnSpacing)\s*:\s*(-?\d[\d_]*(?:\.\d[\d_]*)?)(?![\w$.])/g;
const EDGE_INSETS = /(?<![\w$])(?:EdgeInsets|NSDirectionalEdgeInsets|UIEdgeInsets)\s*\(/g;
const SYSTEM_FONT = /\.system\s*\(/g;
const SYSTEM_FONT_KIT = /(?<![\w$.])(?:UIFont|NSFont)\.systemFont\s*\(/g;
export const CUSTOM_FONT = /(?:(?<![\w$])Font)?\.custom\s*\(/g;
const KIT_FONT = /(?<![\w$.])(?:UIFont|NSFont)\s*\(/g;
const CURVE_CALL = /\.(easeIn|easeOut|easeInOut|linear)\s*\(/g;
const CURVE_BARE = /(?<![\w$])\.(easeIn|easeOut|easeInOut|linear)(?![\w$])(?!\s*\()/g;
const TIMING_CURVE = /\.timingCurve\s*\(/g;
const SPRING_CALL = /\.(spring|interpolatingSpring|bouncy|smooth|snappy)\s*\(/g;
const DEFAULT_ANIMATION = /(?:(?<![\w$])withAnimation|\.animation)\s*\(\s*(?:Animation)?(\.default)(?![\w$])/g;
const SPRING_ARGS = new Set(["response", "dampingFraction", "duration", "bounce", "blendDuration", "extraBounce", "mass", "stiffness", "damping", "initialVelocity"]);
const IMPORT_LINE = /^[ \t]*import\s[^\n]*/gm;

const sizeMessage = {
  space: (px: number) => `Spacing ${px}pt isn't on your spacing scale.`,
  radius: (px: number) => `Corner radius ${px}pt isn't one of your radius roles.`,
  "font-size": (px: number) => `Text size ${px}pt isn't one of your text roles.`,
};

/** A string literal starting at `quote` (masked text): its end quote's index, or -1 when it isn't one plain literal. */
function literalEnd(masked: string, quote: number): number {
  if (masked[quote] !== '"' || masked.startsWith('"""', quote)) return -1;
  const end = masked.indexOf('"', quote + 1);
  // Interpolated code (\(…)) stays visible in masked text: not a plain literal.
  if (end === -1 || masked.slice(quote + 1, end).trim() !== "") return -1;
  return end;
}

/** A call written over several lines, on one (it's shown in one line of the report). */
const oneLine = (s: string) => s.replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/,?\s\)$/, ")");

/**
 * Colours, sizes, fonts and motion typed in a Swift file. Read on the code alone (comments and string contents blanked), so
 * positions are the file's own. With a scale, sizes and durations on it are seen but allowed; without one (extract), every
 * value is seen and none is judged.
 */
export function scanSwift(source: SourceFile, scale: Scale | null): Hit[] {
  const original = source.text;
  const text = maskStrings(maskComments(original, "swift"), "swift");
  const file = { ...source, text };
  const at = locator(text);
  const imports = [...text.matchAll(IMPORT_LINE)].map((m): [number, number] => [m.index!, m.index! + m[0].length]);
  const hits: Hit[] = [];
  const push = (index: number, fields: { rule: RuleId; kind: ValueKind; text: string; value?: string; context?: string; violation: boolean; message: string; negative?: true }) => {
    if (imports.some(([a, b]) => index >= a && index < b)) return;
    const hit = makeHit(file, at, index, { ...fields, fix: "" });
    hits.push({ ...hit, fix: swiftUIFix(hit) });
  };
  const callAt = (m: RegExpMatchArray) => callArgs(text, m.index! + m[0].length - 1, ":");

  // ---------- colours ----------
  const taken: [number, number][] = [];
  const color = (index: number, end: number, literal: string, value: string | undefined) => {
    taken.push([index, end]);
    push(index, { rule: "raw-color", kind: "color", text: literal, ...(value ? { value } : {}), context: colorContext(text, index), violation: true, message: `Raw colour ${literal}.` });
  };
  for (const m of text.matchAll(COLOR_CALL)) {
    const call = callAt(m);
    if (!call) continue;
    const literal = oneLine(text.slice(m.index!, call.close + 1));
    const first = call.args[0];
    const labelled = (re: RegExp) => call.args.find((a) => a.name && re.test(a.name));
    // Color(hex: "#3B82F6"), Color(hex: 0xFF8800), Color("#fff"), Color(hexString: "…")
    const hexArg = labelled(/^(?:hex|rgb|rgba|argb)/i) ?? (first && !first.name && first.value.startsWith('"') ? first : undefined);
    if (hexArg) {
      const end = literalEnd(text, hexArg.valueStart);
      if (end !== -1 && end + 1 === hexArg.end) {
        const value = hexString(original.slice(hexArg.valueStart + 1, end), !hexArg.name);
        if (value || hexArg.name) color(m.index!, call.close + 1, oneLine(original.slice(m.index!, call.close + 1)), value);
        continue;
      }
      const int = hexArg.value.match(/^0[xX]([0-9a-fA-F][0-9a-fA-F_]*)$/);
      if (int) {
        const digits = int[1]!.replace(/_/g, "");
        color(m.index!, call.close + 1, literal, digits.length <= 6 ? `#${digits.padStart(6, "0").toLowerCase()}` : undefined);
      }
      continue;
    }
    // Color(uiColor: .systemRed), Color(UIColor.red): a system colour by name. Color(.label) and Color(uiColor: .label) are semantic.
    const kit = call.args.find((a) => (!a.name || /^(?:uiColor|nsColor|cgColor)$/.test(a.name)) && NAMED_ARG.test(a.value));
    if (kit) {
      color(m.index!, call.close + 1, literal, undefined);
      continue;
    }
    const value = colorFromArgs(call.args);
    if (value) color(m.index!, call.close + 1, literal, value);
  }
  for (const m of text.matchAll(COLOR_LITERAL)) {
    const call = callAt(m);
    if (call) color(m.index!, call.close + 1, oneLine(text.slice(m.index!, call.close + 1)), colorFromArgs(call.args));
  }
  const inside = (index: number) => taken.some(([a, b]) => index >= a && index < b);
  for (const m of text.matchAll(COLOR_DOT)) if (!inside(m.index!)) color(m.index!, m.index! + m[0].length, m[0], NAMED_VALUE[m[1]!]);
  for (const m of text.matchAll(KIT_DOT)) if (!inside(m.index!)) color(m.index!, m.index! + m[0].length, m[0], undefined);
  for (const m of text.matchAll(IMPLICIT_DOT)) {
    if (inside(m.index!)) continue;
    // .white is a colour only where a colour goes: given to a colour modifier, or as its colour: argument.
    const { argStart, open } = enclosing(text, m.index!);
    const label = text.slice(argStart, m.index!).match(LABEL_AT_START)?.[1];
    const call = open >= 0 && text[open] === "(" ? tail(callee(text, open)) : "";
    if (label ? label === "color" || label in LABEL_CONTEXT : COLOR_CALLS.has(call)) color(m.index!, m.index! + m[0].length, m[0], NAMED_VALUE[m[1]!]);
  }

  // ---------- sizes ----------
  // A negative size (.padding(.bottom, -2), a pull) is judged by its size, as the other stacks judge negative margins, and
  // keeps its sign in the message and (negative) in its closest role, -MotifSpace.s1.
  const size = (index: number, literal: string, kind: "space" | "radius" | "font-size", number: string) => {
    const signed = num(number);
    const px = Math.abs(signed);
    const set = kind === "space" ? scale?.spacePx : kind === "radius" ? scale?.radiusPx : scale?.fontSizePx;
    const onScale = px === 0 || (set?.has(px) ?? false);
    push(index, {
      rule: "off-scale", kind, text: literal, value: `${px}px`, violation: scale ? !onScale : false, message: sizeMessage[kind](signed === 0 ? 0 : signed),
      ...(signed < 0 ? { negative: true as const } : {}),
    });
  };
  const unlabelledNumber = (args: Arg[]) => args.find((a) => !a.name && NUMBER.test(a.value));
  for (const m of text.matchAll(PADDING_CALL)) {
    const call = callAt(m);
    const n = call && unlabelledNumber(call.args);
    if (call && n) size(m.index!, oneLine(text.slice(m.index!, call.close + 1)), "space", n.value);
  }
  for (const m of text.matchAll(CORNER_RADIUS)) {
    const call = callAt(m);
    const n = call && unlabelledNumber(call.args);
    if (call && n) size(m.index!, oneLine(text.slice(m.index!, call.close + 1)), "radius", n.value);
  }
  for (const m of text.matchAll(RADIUS_SHAPE)) {
    const call = callAt(m);
    const n = call?.args.find((a) => a.name === "cornerRadius" && NUMBER.test(a.value));
    if (call && n) size(m.index!, oneLine(text.slice(m.index!, call.close + 1)), "radius", n.value);
  }
  for (const m of text.matchAll(SPACING_ARG)) size(m.index!, m[0], "space", m[1]!);
  for (const m of text.matchAll(EDGE_INSETS)) {
    const call = callAt(m);
    for (const a of call?.args ?? []) if (a.name && NUMBER.test(a.value)) size(a.start, text.slice(a.start, a.end), "space", a.value);
  }
  for (const m of text.matchAll(SYSTEM_FONT)) {
    const call = callAt(m);
    const n = call?.args.find((a) => a.name === "size" && NUMBER.test(a.value));
    if (call && n) size(m.index!, oneLine(text.slice(m.index!, call.close + 1)), "font-size", n.value);
  }
  for (const m of text.matchAll(SYSTEM_FONT_KIT)) {
    const call = callAt(m);
    const n = call?.args.find((a) => a.name === "ofSize" && NUMBER.test(a.value));
    if (call && n) size(m.index!, oneLine(text.slice(m.index!, call.close + 1)), "font-size", n.value);
  }

  // ---------- fonts ----------
  const font = (index: number, literal: string, family: string) =>
    push(index, { rule: "raw-font", kind: "font-family", text: literal, value: family, violation: true, message: `Hard-coded font ${family}.` });
  for (const m of [...text.matchAll(CUSTOM_FONT), ...text.matchAll(KIT_FONT)]) {
    const call = callAt(m);
    const first = call?.args.find((a) => a.name === "name") ?? call?.args.find((a) => !a.name);
    if (!call || !first) continue;
    const end = literalEnd(text, first.valueStart);
    if (end === -1) continue;
    const family = original.slice(first.valueStart + 1, end).trim();
    if (family) font(m.index!, oneLine(original.slice(m.index!, call.close + 1)), family);
  }

  // ---------- motion ----------
  const duration = (index: number, literal: string, seconds: string) => {
    const ms = Math.round(num(seconds) * 1000);
    const onScale = ms === 0 || (scale?.durationMs.has(ms) ?? false);
    push(index, { rule: "raw-motion", kind: "duration", text: literal, value: `${ms}ms`, violation: scale ? !onScale : false, message: `Animation duration ${num(seconds)}s isn't one of your durations.` });
  };
  const easing = (index: number, literal: string, value: string) =>
    push(index, { rule: "raw-motion", kind: "easing", text: literal, value, violation: true, message: `Hard-coded easing ${literal}.` });
  const durationOf = (call: { args: Arg[] }) => call.args.find((a) => a.name === "duration" && NUMBER.test(a.value));
  for (const m of text.matchAll(CURVE_CALL)) {
    // MotifCurves.linear(over:) is the theme's own curve run over another duration, not SwiftUI's.
    if (/MotifCurves\s*$/.test(text.slice(Math.max(0, m.index! - 40), m.index!))) continue;
    const call = callAt(m);
    if (!call) continue;
    const literal = oneLine(text.slice(m.index!, call.close + 1));
    const d = durationOf(call);
    if (d) duration(m.index!, literal, d.value);
    easing(m.index!, literal, m[1]!);
  }
  for (const m of text.matchAll(CURVE_BARE)) {
    // .linear is also a style (.progressViewStyle(.linear)): only an animation given it is a curve.
    const { open } = enclosing(text, m.index!);
    const call = open >= 0 && text[open] === "(" ? tail(callee(text, open)) : "";
    if (call === "withAnimation" || call === "animation") easing(m.index!, m[0], m[1]!);
  }
  for (const m of text.matchAll(TIMING_CURVE)) {
    const call = callAt(m);
    if (!call) continue;
    const literal = oneLine(text.slice(m.index!, call.close + 1));
    const points = call.args.filter((a) => !a.name).map((a) => a.value);
    const d = durationOf(call);
    if (d) duration(m.index!, literal, d.value);
    easing(m.index!, literal, points.length === 4 && points.every((p) => NUMBER.test(p)) ? `cubic-bezier(${points.map((p) => num(p)).join(", ")})` : literal);
  }
  for (const m of text.matchAll(SPRING_CALL)) {
    const call = callAt(m);
    if (!call || !call.args.some((a) => a.name && SPRING_ARGS.has(a.name) && NUMBER.test(a.value))) continue;
    const literal = oneLine(text.slice(m.index!, call.close + 1));
    push(m.index!, { rule: "raw-motion", kind: "spring", text: literal, value: literal, violation: true, message: `Hard-coded spring ${literal}.` });
  }
  for (const m of text.matchAll(DEFAULT_ANIMATION)) {
    const index = m.index! + m[0].length - m[1]!.length;
    push(index, { rule: "raw-motion", kind: "easing", text: m[1]!, value: "default", violation: true, message: "The default animation is a hard-coded curve and duration." });
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

const ANIMATES =
  /(?<![\w$])withAnimation\s*[({]|\.animation\s*\(|\.repeatForever\s*\(|\.phaseAnimator\s*\(|\.keyframeAnimator\s*\(|\.matchedGeometryEffect\s*\(|(?<![\w$.])(?:PhaseAnimator|KeyframeAnimator)\s*[({<]/;
const RESPECTS_REDUCED_MOTION = /(?<![\w$])accessibilityReduceMotion(?![\w$])|(?<![\w$])isReduceMotionEnabled(?![\w$])|(?<![\w$])MotifMotion(?![\w$])/;

/**
 * One hit when the app animates but nothing in its own code reads the Reduce Motion setting. Motif's generated file defines
 * MotifMotion itself, so only the app's own files count.
 */
export function swiftUIReducedMotion(files: SourceFile[]): Hit[] {
  const code = files.map((f) => ({ file: f, text: maskStrings(maskComments(f.text, "swift"), "swift") }));
  if (code.some((c) => RESPECTS_REDUCED_MOTION.test(c.text))) return [];
  const first = code.find((c) => ANIMATES.test(c.text));
  if (!first) return [];
  const index = first.text.search(ANIMATES);
  return [makeHit(first.file, locator(first.text), index, {
    rule: "reduced-motion",
    text: "animation",
    violation: true,
    message: 'Animations here ignore the "Reduce Motion" setting.',
    fix: FIX.reducedMotion,
  })];
}
