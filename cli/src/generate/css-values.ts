import { durationToMs, type DtcgColor, type DtcgDuration } from "../contract/values";

export interface DtcgDimension {
  value: number;
  unit: "px" | "rem";
}

export function num(n: number): string {
  return String(Number.parseFloat(n.toFixed(4)));
}

const channel = (c: number | "none") => (c === "none" ? "none" : num(c));
const percent = (c: number | "none") => (c === "none" ? "none" : `${num(c)}%`);

export function cssColor(c: DtcgColor): string {
  const alpha = c.alpha !== undefined && c.alpha < 1 ? ` / ${num(c.alpha)}` : "";
  const [a, b, d] = c.components as [number | "none", number | "none", number | "none"];
  switch (c.colorSpace) {
    case "srgb": {
      if (!alpha && c.hex) return c.hex.toUpperCase();
      const to255 = (x: number | "none") => (x === "none" ? 0 : Math.round(x * 255));
      return `rgb(${to255(a)} ${to255(b)} ${to255(d)}${alpha})`;
    }
    case "hsl":
    case "hwb":
      return `${c.colorSpace}(${channel(a)} ${percent(b)} ${percent(d)}${alpha})`;
    case "lab":
    case "lch":
    case "oklab":
    case "oklch":
      return `${c.colorSpace}(${channel(a)} ${channel(b)} ${channel(d)}${alpha})`;
    default:
      return `color(${c.colorSpace} ${channel(a)} ${channel(b)} ${channel(d)}${alpha})`;
  }
}

export function cssDimension(d: DtcgDimension): string {
  return `${num(d.value)}${d.unit}`;
}

export function dimensionPx(d: DtcgDimension): number {
  return d.unit === "rem" ? d.value * 16 : d.value;
}

export function cssDuration(d: DtcgDuration): string {
  return `${num(durationToMs(d))}ms`;
}

export function cssCubicBezier(p: number[]): string {
  return `cubic-bezier(${p.map(num).join(", ")})`;
}

interface ShadowLayer {
  color: DtcgColor;
  offsetX: DtcgDimension;
  offsetY: DtcgDimension;
  blur: DtcgDimension;
  spread: DtcgDimension;
  inset?: boolean;
}

export function cssShadow(v: unknown): string {
  const layers = (Array.isArray(v) ? v : [v]) as ShadowLayer[];
  return layers
    .map((l) => `${l.inset ? "inset " : ""}${cssDimension(l.offsetX)} ${cssDimension(l.offsetY)} ${cssDimension(l.blur)} ${cssDimension(l.spread)} ${cssColor(l.color)}`)
    .join(", ");
}

const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif",
  "ui-monospace", "ui-rounded", "math", "emoji", "fangsong",
]);

/** Words that mean something else unquoted in a font list: a font with one of these names must be quoted. */
const CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer", "default"]);

export function cssFontFamily(v: string | string[]): string {
  return (Array.isArray(v) ? v : [v])
    // A single identifier stays as it is: system keywords like -apple-system only work unquoted.
    .map((name) =>
      GENERIC_FAMILIES.has(name.toLowerCase()) || (/^-?[A-Za-z_][\w-]*$/.test(name) && !CSS_WIDE.has(name.toLowerCase()))
        ? name
        : `"${name.replace(/"/g, '\\"')}"`,
    )
    .join(", ");
}

const WEIGHTS: Record<string, number> = {
  thin: 100, hairline: 100, "extra-light": 200, "ultra-light": 200, light: 300, normal: 400, regular: 400, book: 400,
  medium: 500, "semi-bold": 600, "demi-bold": 600, bold: 700, "extra-bold": 800, "ultra-bold": 800,
  black: 900, heavy: 900, "extra-black": 950, "ultra-black": 950,
};

export function fontWeightNumber(v: number | string): number {
  return typeof v === "number" ? v : (WEIGHTS[v] ?? 400);
}
