export const COLOR_SPACES = [
  "srgb", "srgb-linear", "hsl", "hwb", "lab", "lch", "oklab", "oklch",
  "display-p3", "a98-rgb", "prophoto-rgb", "rec2020", "xyz-d65", "xyz-d50",
] as const;

const FONT_WEIGHT_NAMES = [
  "thin", "hairline", "extra-light", "ultra-light", "light", "normal", "regular", "book", "medium",
  "semi-bold", "demi-bold", "bold", "extra-bold", "ultra-bold", "black", "heavy", "extra-black", "ultra-black",
];

export interface DtcgColor {
  colorSpace: string;
  components: (number | "none")[];
  alpha?: number;
  hex?: string;
}

export interface DtcgDuration {
  value: number;
  unit: "ms" | "s";
}

/** Spaces whose components are 0–1 channel values. */
const RGB_SPACES = ["srgb", "srgb-linear", "display-p3", "a98-rgb", "prophoto-rgb", "rec2020"];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function checkColor(v: unknown): string | null {
  if (!isObj(v)) return "a color must be an object with colorSpace and components";
  if (!(COLOR_SPACES as readonly string[]).includes(String(v.colorSpace))) return `unknown color space "${String(v.colorSpace)}"`;
  if (!Array.isArray(v.components) || v.components.length !== 3 || !v.components.every((c) => isNum(c) || c === "none")) {
    return "components must be 3 numbers";
  }
  const space = String(v.colorSpace);
  const nums = v.components.map((c) => (c === "none" ? 0 : c)) as number[];
  if (RGB_SPACES.includes(space) && nums.some((c) => c < 0 || c > 1)) {
    const looks255 = nums.every((c) => c >= 0 && c <= 255);
    return `${space} components must be between 0 and 1${looks255 ? " (these look like 0–255 values; divide them by 255)" : ""}`;
  }
  if ((space === "hsl" || space === "hwb") && [nums[1]!, nums[2]!].some((c) => c < 0 || c > 100)) {
    return `${space} ${space === "hsl" ? "saturation and lightness" : "whiteness and blackness"} must be between 0 and 100`;
  }
  if (v.alpha !== undefined && !(isNum(v.alpha) && v.alpha >= 0 && v.alpha <= 1)) return "alpha must be between 0 and 1";
  if (v.hex !== undefined && !(typeof v.hex === "string" && /^#[0-9a-fA-F]{6}$/.test(v.hex))) return 'hex must look like "#1A2B3C"';
  if (v.hex === undefined) return 'add a "hex" value such as "#1A2B3C" (Motif keeps one on every color)';
  if (space === "srgb") {
    const expected = "#" + nums.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
    if (expected !== String(v.hex).toUpperCase()) return `hex "${String(v.hex)}" doesn't match the components (they make "${expected}")`;
  }
  return null;
}

function checkDimension(v: unknown): string | null {
  if (!isObj(v) || !isNum(v.value)) return 'a size must look like { "value": 16, "unit": "px" }';
  if (v.unit !== "px" && v.unit !== "rem") return 'size unit must be "px" or "rem"';
  return null;
}

function checkDuration(v: unknown): string | null {
  if (!isObj(v) || !isNum(v.value)) return 'a duration must look like { "value": 200, "unit": "ms" }';
  if (v.value < 0) return "a duration can't be negative";
  if (v.unit !== "ms" && v.unit !== "s") return 'duration unit must be "ms" or "s"';
  return null;
}

function checkCubicBezier(v: unknown): string | null {
  const ok = Array.isArray(v) && v.length === 4 && v.every(isNum) && v[0] >= 0 && v[0] <= 1 && v[2] >= 0 && v[2] <= 1;
  return ok ? null : "an easing curve needs 4 numbers and its 1st and 3rd numbers must be between 0 and 1";
}

function checkFontFamily(v: unknown): string | null {
  const ok = (typeof v === "string" && v.length > 0)
    || (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.length > 0));
  return ok ? null : "a font family must be a name or a list of names";
}

function checkFontWeight(v: unknown): string | null {
  const ok = (isNum(v) && v >= 1 && v <= 1000) || (typeof v === "string" && FONT_WEIGHT_NAMES.includes(v));
  return ok ? null : 'a font weight must be 1–1000 or a name like "bold"';
}

function field(name: string, problem: string | null): string | null {
  return problem ? `${name}: ${problem}` : null;
}

function checkShadowLayer(v: unknown): string | null {
  if (!isObj(v)) return "a shadow must be an object with color, offsetX, offsetY, blur and spread";
  return field("color", checkColor(v.color))
    ?? field("offsetX", checkDimension(v.offsetX))
    ?? field("offsetY", checkDimension(v.offsetY))
    ?? field("blur", checkDimension(v.blur))
    ?? field("spread", checkDimension(v.spread))
    ?? (v.inset !== undefined && typeof v.inset !== "boolean" ? "inset: must be true or false" : null);
}

function checkShadow(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const layer of v) {
      const p = checkShadowLayer(layer);
      if (p) return p;
    }
    return v.length > 0 ? null : "a shadow list can't be empty";
  }
  return checkShadowLayer(v);
}

function checkTypography(v: unknown): string | null {
  if (!isObj(v)) return "typography must be an object with fontFamily, fontSize, fontWeight and lineHeight";
  return field("fontFamily", checkFontFamily(v.fontFamily))
    ?? field("fontSize", checkDimension(v.fontSize))
    ?? field("fontWeight", checkFontWeight(v.fontWeight))
    ?? field("lineHeight", isNum(v.lineHeight) ? null : "must be a number")
    ?? (v.letterSpacing !== undefined ? field("letterSpacing", checkDimension(v.letterSpacing)) : null);
}

/** Returns null when valid, otherwise a short lowercase explanation. Types Motif v1 doesn't inspect pass. */
export function validateValue(type: string, value: unknown): string | null {
  switch (type) {
    case "color": return checkColor(value);
    case "dimension": return checkDimension(value);
    case "duration": return checkDuration(value);
    case "cubicBezier": return checkCubicBezier(value);
    case "number": return isNum(value) ? null : "must be a number";
    case "fontFamily": return checkFontFamily(value);
    case "fontWeight": return checkFontWeight(value);
    case "shadow": return checkShadow(value);
    case "typography": return checkTypography(value);
    default: return null; // strokeStyle, border, transition, gradient: not inspected in v1
  }
}

export function durationToMs(d: DtcgDuration): number {
  return d.unit === "s" ? d.value * 1000 : d.value;
}
