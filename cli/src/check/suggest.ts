// The closest role for a size that isn't on the guide's scale: what motif check suggests when it groups repeats.
import { formatHex } from "culori";
import { parseColor } from "../extract/cluster";
import { cssColor } from "../generate/css-values";
import type { Theme, ThemeVariant } from "../generate/theme";
import type { Hit } from "./types";

// Tailwind's default text sizes and corner sizes, for its classes (text-sm, rounded-xl); Tailwind 3's corners are smaller.
const TEXT_PX: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };
const RADIUS_PX: Record<string, number> = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, "4xl": 32 };
const RADIUS_PX_3: Record<string, number> = { sm: 2, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24 };

/** A utility class (p-7, text-sm, rounded-t-xl, p-[13px]), not a CSS value. */
const CLASS = /^-?[a-z][a-z-]*-(?:\[[^\]]+\]|[\w.]+)$/;

/** The one or two roles nearest px (two when it falls exactly between them). */
function nearest<T extends { name: string }>(roles: T[], px: number, size: (r: T) => number): T[] {
  if (roles.length === 0 || !Number.isFinite(px)) return [];
  const best = Math.min(...roles.map((r) => Math.abs(size(r) - px)));
  return roles.filter((r) => Math.abs(size(r) - px) === best).slice(0, 2);
}

/** A colour as #rrggbb (with alpha when it has some), so two spellings of one colour compare equal. */
function normalHex(value: string): string | undefined {
  const c = parseColor(value);
  return c ? formatHex(c)?.toLowerCase() : undefined;
}

/**
 * For a colour set in a variant's block: the role that variant gives that colour, and what to do about it. Nothing when the
 * guide has no such variant, or none of its roles has the colour.
 */
function variantColorHint(hit: Hit, variants: ThemeVariant[]): string | undefined {
  const variant = variants.find((v) => v.id === hit.variant);
  const wanted = normalHex(hit.value ?? "");
  if (!variant || !wanted) return undefined;
  const dark = hit.scheme === "dark";
  const role = variant.theme.colors.find((c) => normalHex(cssColor(dark ? c.dark : c.light)) === wanted);
  if (!role) return undefined;
  return `This is the ${variant.label} variant's ${dark ? "dark " : ""}${role.name}: use var(--motif-color-${role.name}) and set data-variant="${variant.id}".`;
}

/**
 * "text-label (14px)", "p-6 (24px) or p-8 (32px)", or a CSS variable outside classes; nothing for other problems. A
 * class keeps its variants (md:p-6). On Tailwind 3, which has no theme classes for Motif's roles, text sizes and corners
 * use the variables as arbitrary values.
 */
export function suggestRole(hit: Hit, theme: Theme, opts: { tailwind3?: boolean; variants?: ThemeVariant[] } = {}): string | undefined {
  if (hit.kind === "color" && hit.variant) return variantColorHint(hit, opts.variants ?? []);
  const [, variants = "", base = hit.text] = hit.text.match(/^((?:[\w-]+:)*!?)(.*)$/) ?? [];
  const cls = CLASS.test(base);
  const prefix = cls ? variants + base.replace(/-(?:\[[^\]]+\]|[^-]+)$/, "-") : "";
  const value = hit.value ?? "";
  const join = (items: string[]) => (items.length > 0 ? items.join(" or ") : undefined);
  if (hit.kind === "font-size") {
    const px = TEXT_PX[value] ?? Number.parseFloat(value);
    const name = (f: { name: string }) =>
      !cls ? `var(--motif-font-${f.name}-size)` : opts.tailwind3 ? `${variants}text-[length:var(--motif-font-${f.name}-size)]` : `${variants}text-${f.name}`;
    return join(nearest(theme.fonts, px, (f) => f.sizePx).map((f) => `${name(f)} (${f.sizePx}px)`));
  }
  if (hit.kind === "space") {
    const px = Number.parseFloat(value);
    return join(nearest(theme.space, px, (s) => s.px).map((s) => `${cls ? `${prefix}${s.name}` : `var(--motif-space-${s.name})`} (${s.px}px)`));
  }
  if (hit.kind === "radius") {
    const px = (opts.tailwind3 ? RADIUS_PX_3 : RADIUS_PX)[value] ?? Number.parseFloat(value);
    const roles = theme.radius.filter((r) => r.px < 9999 && (r.px > 0 || px === 0));
    const name = (r: { name: string }) =>
      !cls ? `var(--motif-radius-${r.name})` : opts.tailwind3 ? `${prefix}[var(--motif-radius-${r.name})]` : `${prefix}${r.name}`;
    return join(nearest(roles, px, (r) => r.px).map((r) => `${name(r)} (${r.px}px)`));
  }
  return undefined;
}
