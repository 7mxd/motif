import { readProjectFonts, type ProjectFont } from "../contract/fonts";
import { readVariants, variantView } from "../contract/variants";
import { resolveMode, resolveToken } from "../contract/resolve";
import type { TokenDocument } from "../contract/types";
import { durationToMs, validateValue, type DtcgColor, type DtcgDuration } from "../contract/values";
import { cssDimension, cssFontFamily, cssShadow, dimensionPx, fontWeightNumber, shadowLayers, type DtcgDimension } from "./css-values";

export interface ThemeColor {
  name: string;
  light: DtcgColor;
  dark: DtcgColor;
}

export interface ThemeSize {
  name: string;
  px: number;
  css: string;
}

export interface ThemeFont {
  name: string;
  family: string;
  sizeCss: string;
  sizePx: number;
  weight: number;
  lineHeight: number;
  letterSpacing?: string;
}

/** One layer of a shadow, in pixels. */
export interface ThemeShadowLayer {
  color: DtcgColor;
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
}

export interface Theme {
  colors: ThemeColor[];
  space: ThemeSize[];
  radius: ThemeSize[];
  /** Each shadow as CSS, and its layers in pixels for stacks that draw them themselves. */
  shadows: { name: string; css: string; layers: ThemeShadowLayer[] }[];
  fonts: ThemeFont[];
  durations: { name: string; ms: number }[];
  easings: { name: string; points: [number, number, number, number] }[];
  springs: { name: string; duration: number; bounce: number }[];
  /** Font files the project bundles itself (never fetched from Google). */
  projectFonts: ProjectFont[];
}

interface Typography {
  fontFamily: string | string[];
  fontSize: DtcgDimension;
  fontWeight: number | string;
  lineHeight: number;
  letterSpacing?: DtcgDimension;
}

export function buildTheme(doc: TokenDocument): Theme {
  const theme: Theme = { colors: [], space: [], radius: [], shadows: [], fonts: [], durations: [], easings: [], springs: [], projectFonts: readProjectFonts(doc).fonts };
  const springs = new Map<string, { duration?: number; bounce?: number }>();

  for (const tok of doc.tokens.values()) {
    const [group, ...rest] = tok.path.split(".");
    if (!group || group === "primitive" || rest.length === 0) continue;
    const r = resolveToken(doc, tok.path);
    if (!r.ok || r.type === null || validateValue(r.type, r.value) !== null) continue;

    if (group === "spring") {
      if (rest.length < 2) continue;
      const name = rest.slice(0, -1).join("-");
      const field = rest[rest.length - 1];
      const s = springs.get(name) ?? {};
      if (field === "duration" && r.type === "duration") s.duration = durationToMs(r.value as DtcgDuration) / 1000;
      if (field === "bounce" && r.type === "number") s.bounce = r.value as number;
      springs.set(name, s);
      continue;
    }

    const name = rest.join("-");
    switch (`${group}:${r.type}`) {
      case "color:color": {
        const dark = resolveMode(doc, tok.path, "dark");
        const darkOk = dark.ok && validateValue("color", dark.value) === null;
        theme.colors.push({ name, light: r.value as DtcgColor, dark: (darkOk ? dark.value : r.value) as DtcgColor });
        break;
      }
      case "space:dimension":
      case "radius:dimension": {
        const d = r.value as DtcgDimension;
        (group === "space" ? theme.space : theme.radius).push({ name, px: dimensionPx(d), css: cssDimension(d) });
        break;
      }
      case "shadow:shadow":
        theme.shadows.push({
          name,
          css: cssShadow(r.value),
          layers: shadowLayers(r.value).map((l) => ({
            color: l.color,
            x: dimensionPx(l.offsetX),
            y: dimensionPx(l.offsetY),
            blur: dimensionPx(l.blur),
            spread: dimensionPx(l.spread),
            inset: l.inset === true,
          })),
        });
        break;
      case "font:typography": {
        const t = r.value as Typography;
        theme.fonts.push({
          name,
          family: cssFontFamily(t.fontFamily),
          sizeCss: cssDimension(t.fontSize),
          sizePx: dimensionPx(t.fontSize),
          weight: fontWeightNumber(t.fontWeight),
          lineHeight: t.lineHeight,
          ...(t.letterSpacing ? { letterSpacing: cssDimension(t.letterSpacing) } : {}),
        });
        break;
      }
      case "duration:duration":
        theme.durations.push({ name, ms: durationToMs(r.value as DtcgDuration) });
        break;
      case "easing:cubicBezier":
        theme.easings.push({ name, points: [...(r.value as number[])] as [number, number, number, number] });
        break;
    }
  }

  for (const [name, s] of springs) {
    if (s.duration !== undefined && s.bounce !== undefined) theme.springs.push({ name, duration: s.duration, bounce: s.bounce });
  }
  return theme;
}

export interface ThemeVariant {
  id: string;
  label: string;
  theme: Theme;
}

export interface ThemeSet {
  base: Theme;
  defaultId: string | null;
  /** The default variant's label, for stacks that name every variant in code (null without variants). */
  defaultLabel: string | null;
  /** The non-default variants only. */
  variants: ThemeVariant[];
}

/** The guide's own theme, plus one theme per non-default design variant. */
export function buildThemeSet(doc: TokenDocument): ThemeSet {
  const { variants, defaultId } = readVariants(doc);
  return {
    base: buildTheme(doc),
    defaultId,
    defaultLabel: variants.find((v) => v.id === defaultId)?.label ?? null,
    variants: variants.filter((v) => v.id !== defaultId).map((v) => ({ id: v.id, label: v.label, theme: buildTheme(variantView(doc, v.id)) })),
  };
}
