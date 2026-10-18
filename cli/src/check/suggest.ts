// The closest role for a size that isn't on the guide's scale: what motif check suggests when it groups repeats.
import type { Theme } from "../generate/theme";
import type { Hit } from "./types";

// Tailwind 4's default text sizes and corner sizes, for its classes (text-sm, rounded-xl).
const TEXT_PX: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };
const RADIUS_PX: Record<string, number> = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, "4xl": 32 };

/** A utility class (p-7, text-sm, rounded-t-xl, p-[13px]), not a CSS value. */
const CLASS = /^-?[a-z][a-z-]*-(?:\[[^\]]+\]|[\w.]+)$/;

/** The one or two roles nearest px (two when it falls exactly between them). */
function nearest<T extends { name: string }>(roles: T[], px: number, size: (r: T) => number): T[] {
  if (roles.length === 0 || !Number.isFinite(px)) return [];
  const best = Math.min(...roles.map((r) => Math.abs(size(r) - px)));
  return roles.filter((r) => Math.abs(size(r) - px) === best).slice(0, 2);
}

/** "text-label (14px)", "p-6 (24px) or p-8 (32px)", or a CSS variable outside classes; nothing for other problems. */
export function suggestRole(hit: Hit, theme: Theme): string | undefined {
  const cls = CLASS.test(hit.text);
  const prefix = cls ? hit.text.replace(/-(?:\[[^\]]+\]|[^-]+)$/, "-") : "";
  const value = hit.value ?? "";
  const join = (items: string[]) => (items.length > 0 ? items.join(" or ") : undefined);
  if (hit.kind === "font-size") {
    const px = TEXT_PX[value] ?? Number.parseFloat(value);
    return join(nearest(theme.fonts, px, (f) => f.sizePx).map((f) => `${cls ? `text-${f.name}` : `var(--motif-font-${f.name}-size)`} (${f.sizePx}px)`));
  }
  if (hit.kind === "space") {
    const px = Number.parseFloat(value);
    return join(nearest(theme.space, px, (s) => s.px).map((s) => `${cls ? `${prefix}${s.name}` : `var(--motif-space-${s.name})`} (${s.px}px)`));
  }
  if (hit.kind === "radius") {
    const px = RADIUS_PX[value] ?? Number.parseFloat(value);
    const roles = theme.radius.filter((r) => r.px < 9999 && (r.px > 0 || px === 0));
    return join(nearest(roles, px, (r) => r.px).map((r) => `${cls ? `${prefix}${r.name}` : `var(--motif-radius-${r.name})`} (${r.px}px)`));
  }
  return undefined;
}
