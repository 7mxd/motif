// Material 3's type scale slots, shared by the stacks whose theme code fills them (Flutter's TextTheme, Compose's Typography).

/**
 * Each slot: the type role it takes its font, weight and line height from, and Material 3's default size for it. Apps
 * rely on the slots stepping down (titleSmall is smaller than titleLarge), so a slot's size is the guide's size closest
 * to Material's, never bigger than its role's own.
 */
export const TYPE_SLOTS: [string, string, number][] = [
  ["displayLarge", "display", 57], ["displayMedium", "display", 45], ["displaySmall", "display", 36],
  ["headlineLarge", "title", 32], ["headlineMedium", "title", 28], ["headlineSmall", "title", 24],
  ["titleLarge", "heading", 22], ["titleMedium", "heading", 16], ["titleSmall", "heading", 14],
  ["bodyLarge", "body", 16], ["bodyMedium", "body", 14], ["bodySmall", "caption", 12],
  ["labelLarge", "label", 14], ["labelMedium", "label", 12], ["labelSmall", "label", 11],
];

/** The guide's size closest to Material's for a slot, no bigger than the role's own (ties go to the smaller). */
export function slotSize(materialPx: number, rolePx: number, scale: number[]): number {
  const fits = scale.filter((px) => px <= rolePx);
  if (fits.length === 0) return rolePx;
  return fits.reduce((best, px) => {
    const d = Math.abs(px - materialPx) - Math.abs(best - materialPx);
    return d < 0 || (d === 0 && px < best) ? px : best;
  });
}

/** The sizes a slot can step down to: every type role's size but the monospace one's. */
export function typeScale(fonts: { name: string; sizePx: number }[]): number[] {
  return [...new Set(fonts.filter((f) => f.name !== "mono").map((f) => f.sizePx))];
}
