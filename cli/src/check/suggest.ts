// The closest role for a size that isn't on the guide's scale: what motif check suggests when it groups repeats.
import { differenceEuclidean, formatHex } from "culori";
import { FULL_RADIUS_PX } from "../contract/defaults";
import { parseColor, SAME_COLOR } from "../extract/cluster";
import { cssColor } from "../generate/css-values";
import type { Theme, ThemeVariant } from "../generate/theme";
import type { Hit, ValueKind } from "./types";

// Tailwind's default text sizes and corner sizes, for its classes (text-sm, rounded-xl); Tailwind 3's corners are smaller.
const TEXT_PX: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };
const RADIUS_PX: Record<string, number> = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, "4xl": 32 };
const RADIUS_PX_3: Record<string, number> = { sm: 2, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24 };

/** A utility class (p-7, text-sm, rounded-t-xl, p-[13px]), not a CSS value. */
const CLASS = /^-?[a-z][a-z-]*-(?:\[[^\]]+\]|[\w.]+)$/;

/**
 * The radius roles a corner size is nearest to: the guide's full role for a pill (a corner at extract's full cut-off,
 * 999px, or at the full role's own size when that is smaller), else the one or two nearest other ones.
 */
function nearestRadius<T extends { name: string; px: number }>(radius: T[], px: number): T[] {
  const full = radius.find((r) => r.name === "full") ?? radius.find((r) => r.px >= 9999);
  if (full && px >= Math.min(FULL_RADIUS_PX, full.px)) return [full];
  const finite = radius.filter((r) => r !== full && r.px < 9999 && (r.px > 0 || px === 0));
  return nearest(finite, px, (r) => r.px);
}

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
export function suggestRole(
  hit: Hit,
  theme: Theme,
  opts: { tailwind3?: boolean; variants?: ThemeVariant[]; role?: (kind: ValueKind, name: string) => string } = {},
): string | undefined {
  if (hit.kind === "color" && hit.variant) return variantColorHint(hit, opts.variants ?? []);
  if (opts.role) return nativeSuggestion(hit, theme, opts.role);
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
    const name = (r: { name: string }) =>
      !cls ? `var(--motif-radius-${r.name})` : opts.tailwind3 ? `${prefix}[var(--motif-radius-${r.name})]` : `${prefix}${r.name}`;
    return join(nearestRadius(theme.radius, px).map((r) => `${name(r)} (${r.px}px)`));
  }
  return undefined;
}

const colorDistance = differenceEuclidean("oklab");
/** Role names that fit how a colour is used, to choose between roles of the same colour. */
const FITS: Record<string, RegExp> = { text: /^(?:text|on)-/, background: /^(?:background|surface)/, border: /^border/ };

/**
 * For a native stack, whose code names roles itself (role(kind, name) → MotifSpace.s4): the nearest size roles, as for CSS,
 * and the colour role a typed colour matches (in light or dark mode), when it's within SAME_COLOR of one.
 */
function nativeSuggestion(hit: Hit, theme: Theme, role: (kind: ValueKind, name: string) => string): string | undefined {
  const px = Number.parseFloat(hit.value ?? "");
  const join = (items: string[]) => (items.length > 0 ? items.join(" or ") : undefined);
  // A negative size (a pull, .padding(.bottom, -2)) keeps its direction: -MotifSpace.s1 (-4px). A step of 0 has none.
  const sized = (name: string, size: number) => (hit.negative && size > 0 ? `-${name} (-${size}px)` : `${name} (${size}px)`);
  if (hit.kind === "font-size") return join(nearest(theme.fonts, px, (f) => f.sizePx).map((f) => sized(role("font-size", f.name), f.sizePx)));
  if (hit.kind === "space") return join(nearest(theme.space, px, (s) => s.px).map((s) => sized(role("space", s.name), s.px)));
  if (hit.kind === "radius") return join(nearestRadius(theme.radius, px).map((r) => sized(role("radius", r.name), r.px)));
  if (hit.kind === "color") {
    const wanted = parseColor(hit.value ?? "");
    if (!wanted) return undefined;
    const scored = theme.colors.flatMap((c) =>
      [c.light, c.dark].flatMap((v) => {
        const parsed = parseColor(cssColor(v));
        return parsed ? [{ name: c.name, d: colorDistance(wanted, parsed) }] : [];
      }),
    );
    if (scored.length === 0) return undefined;
    const best = Math.min(...scored.map((s) => s.d));
    // Only a colour that reads as a role's colour gets that role: an off-brand colour has no "closest", just the fix.
    if (best > SAME_COLOR) return undefined;
    const closest = scored.filter((s) => s.d - best < 1e-9);
    const fits = FITS[hit.context ?? ""];
    const chosen = closest.find((s) => fits?.test(s.name)) ?? closest[0]!;
    return role("color", chosen.name);
  }
  return undefined;
}
