import { clampRgb, converter, wcagContrast, type Color, type Rgb } from "culori";
import type { DtcgColor } from "./values";

const toRgb = converter("rgb");

/** DTCG colorSpace → culori mode, channel keys, and per-channel scale into culori's ranges. */
const SPACES: Record<string, { mode: string; keys: [string, string, string]; scale?: [number, number, number] }> = {
  "srgb": { mode: "rgb", keys: ["r", "g", "b"] },
  "srgb-linear": { mode: "lrgb", keys: ["r", "g", "b"] },
  "hsl": { mode: "hsl", keys: ["h", "s", "l"], scale: [1, 0.01, 0.01] },
  "hwb": { mode: "hwb", keys: ["h", "w", "b"], scale: [1, 0.01, 0.01] },
  "lab": { mode: "lab", keys: ["l", "a", "b"] },
  "lch": { mode: "lch", keys: ["l", "c", "h"] },
  "oklab": { mode: "oklab", keys: ["l", "a", "b"] },
  "oklch": { mode: "oklch", keys: ["l", "c", "h"] },
  "display-p3": { mode: "p3", keys: ["r", "g", "b"] },
  "a98-rgb": { mode: "a98", keys: ["r", "g", "b"] },
  "prophoto-rgb": { mode: "prophoto", keys: ["r", "g", "b"] },
  "rec2020": { mode: "rec2020", keys: ["r", "g", "b"] },
  "xyz-d65": { mode: "xyz65", keys: ["x", "y", "z"] },
  "xyz-d50": { mode: "xyz50", keys: ["x", "y", "z"] },
};

function toCulori(c: DtcgColor): Color {
  const space = SPACES[c.colorSpace];
  if (!space) throw new Error(`unsupported color space ${c.colorSpace}`);
  const out: Record<string, unknown> = { mode: space.mode };
  space.keys.forEach((key, i) => {
    const raw = c.components[i];
    if (raw === "none") {
      out[key] = key === "h" ? undefined : 0;
    } else {
      out[key] = (raw ?? 0) * (space.scale?.[i] ?? 1);
    }
  });
  if (c.alpha !== undefined) out.alpha = c.alpha;
  return out as unknown as Color;
}

function rgbOf(c: DtcgColor): Rgb {
  return clampRgb(toRgb(toCulori(c))) as Rgb;
}

export function contrastRatio(fg: DtcgColor, bg: DtcgColor): number {
  const b = rgbOf(bg);
  const f = rgbOf(fg);
  const a = f.alpha ?? 1;
  const over: Rgb = {
    mode: "rgb",
    r: f.r * a + b.r * (1 - a),
    g: f.g * a + b.g * (1 - a),
    b: f.b * a + b.b * (1 - a),
  };
  return wcagContrast(over, { mode: "rgb", r: b.r, g: b.g, b: b.b });
}
