// The action colour as text: a readable version of action-primary, for stacks whose own widgets draw it as a label.
import { clampChroma, converter, formatHex, parse } from "culori";
import { contrastRatio } from "../contract/color";
import { srgbColor } from "../contract/defaults";
import type { DtcgColor } from "../contract/values";
import type { Theme, ThemeSet } from "./theme";

/** The readable action colour in one mode, and the colour for text on it. Both uppercase #RRGGBB. */
export interface ReadableColor {
  text: string;
  onText: string;
}

export interface ModePair {
  light: ReadableColor;
  dark: ReadableColor;
}

/** The readable action colour for the guide's own theme and for each non-default variant (by id). */
export interface ReadableAction {
  base: ModePair;
  variants: Record<string, ModePair>;
}

/** WCAG's ratio for body text. */
const MIN = 4.5;
/** Each step of the walk moves OKLCH lightness this much. */
const STEP = 0.005;
const WHITE = "#FFFFFF";
const BLACK = "#000000";

const toOklch = converter("oklch");
const upper = (c: DtcgColor) => (c.hex ?? BLACK).toUpperCase();
const ratioOn = (fg: string, bg: DtcgColor) => contrastRatio(srgbColor(fg), bg);

/** A theme's colour in one mode, falling back to the base theme's when a variant lacks the role. */
function colorOf(theme: Theme, base: Theme, name: string, mode: "light" | "dark"): DtcgColor | undefined {
  return (theme.colors.find((c) => c.name === name) ?? base.colors.find((c) => c.name === name))?.[mode];
}

/** The fills the action colour sits on as text: the background, and the surface when the guide has one. */
function fillsOf(theme: Theme, base: Theme, mode: "light" | "dark"): DtcgColor[] {
  return ["background", "surface"].map((r) => colorOf(theme, base, r, mode)).filter((c): c is DtcgColor => c !== undefined);
}

/**
 * The action colour darkened (or lightened, on a dark page) in OKLCH, keeping its hue and chroma, a step at a time
 * until it reads on every fill. Null when no lightness gets there.
 */
function walk(action: DtcgColor, fills: DtcgColor[]): string | null {
  const page = fills[0]!;
  const darker = contrastRatio(srgbColor(BLACK), page) >= contrastRatio(srgbColor(WHITE), page);
  const start = toOklch(parse(upper(action))!)!;
  for (let step = 1; step * STEP <= 1; step++) {
    const l = start.l + (darker ? -step : step) * STEP;
    if (l < 0 || l > 1) break;
    const hex = formatHex(clampChroma({ ...start, l }, "oklch"))?.toUpperCase();
    if (hex && fills.every((f) => ratioOn(hex, f) >= MIN)) return hex;
  }
  return null;
}

/** One theme in one mode: whether action-primary already reads, the readable colour, and the text on it. */
function readableIn(theme: Theme, base: Theme, mode: "light" | "dark"): { reads: boolean; color: ReadableColor } {
  const action = colorOf(theme, base, "action-primary", mode)!;
  const fills = fillsOf(theme, base, mode);
  const reads = fills.every((f) => contrastRatio(action, f) >= MIN);
  const textPrimary = colorOf(theme, base, "text-primary", mode);
  const text = reads ? upper(action) : (walk(action, fills) ?? (textPrimary ? upper(textPrimary) : bestOf(fills[0]!)));

  const on = srgbColor(text);
  const candidates = ["on-action-primary", "text-inverse", "background", "text-primary"]
    .map((r) => colorOf(theme, base, r, mode))
    .filter((c): c is DtcgColor => c !== undefined);
  const found = candidates.find((c) => contrastRatio(c, on) >= MIN);
  return { reads, color: { text, onText: found ? upper(found) : bestOf(on) } };
}

/** White or black, whichever reads better on the colour. */
function bestOf(bg: DtcgColor): string {
  return ratioOn(WHITE, bg) >= ratioOn(BLACK, bg) ? WHITE : BLACK;
}

/**
 * A readable version of the action colour, for the base theme and each variant, light and dark: action-primary where
 * it already reads as text (4.5:1 on the background, and on the surface when there is one), else the same hue and
 * chroma darkened (or lightened, on a dark page) until it reads, else text-primary. Null when action-primary reads in
 * every mode of every theme, or the guide has no action-primary or background.
 */
export function readableAction(set: ThemeSet): ReadableAction | null {
  const base = set.base;
  const names = new Set(base.colors.map((c) => c.name));
  if (!names.has("action-primary") || !names.has("background")) return null;

  let changed = false;
  const pair = (theme: Theme): ModePair => {
    const light = readableIn(theme, base, "light");
    const dark = readableIn(theme, base, "dark");
    if (!light.reads || !dark.reads) changed = true;
    return { light: light.color, dark: dark.color };
  };
  const result: ReadableAction = {
    base: pair(base),
    variants: Object.fromEntries(set.variants.map((v) => [v.id, pair(v.theme)])),
  };
  return changed ? result : null;
}
