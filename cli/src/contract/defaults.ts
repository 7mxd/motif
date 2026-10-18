/** Values every Motif design guide shares unless a person changes them: readability pairs, spacing scale, type roles, shadows. */

export const STANDARD_PAIRS: [string, string, "text" | "ui"][] = [
  ["text-primary", "background", "text"], ["text-primary", "surface", "text"], ["text-primary", "surface-raised", "text"],
  ["text-secondary", "background", "text"], ["text-secondary", "surface", "text"], ["text-secondary", "surface-raised", "text"],
  ["on-action-primary", "action-primary", "text"], ["on-action-secondary", "action-secondary", "text"], ["on-success", "success", "text"],
  ["on-warning", "warning", "text"], ["on-danger", "danger", "text"], ["on-info", "info", "text"], ["focus", "background", "ui"],
];

export const SPACE_SCALE: [string, number][] = [
  ["0", 0], ["1", 4], ["2", 8], ["3", 12], ["4", 16], ["5", 20], ["6", 24], ["8", 32], ["10", 40], ["12", 48], ["16", 64],
];

/** Type roles: name, weight, line height. */
export const FONT_ROLES: [string, number, number][] = [
  ["display", 700, 1.1], ["title", 700, 1.2], ["heading", 600, 1.3], ["body", 400, 1.5], ["label", 500, 1.4], ["caption", 400, 1.4],
];

/** The optional type role for code (name, weight, line height), and the system's own monospace fonts it starts from. */
export const MONO_ROLE: [string, number, number] = ["mono", 400, 1.5];
export const MONO_STACK = ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"];

/**
 * A code font: monospace, ui-monospace, a family whose name has the word Mono (JetBrains Mono, SFMono-Regular), or a
 * well-known one (Fira Code, Menlo, Iosevka). Not Monoton, Kimono or Code Pro, which are text fonts.
 */
export const isMonospace = (family: string) =>
  /(?:^|[\s"'-]|sf)mono(?:space)?(?![a-z])|\b(?:fira|cascadia|source) code\b|\b(?:consolas|menlo|monaco|courier|inconsolata|lucida console|monaspace|monolisa|iosevka|pragmata)/i.test(family);

export const px = (value: number) => ({ value, unit: "px" });
export const ms = (value: number) => ({ value, unit: "ms" });

export function srgbColor(hex: string) {
  const channel = (i: number) => Number((Number.parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  return { colorSpace: "srgb", components: [channel(1), channel(3), channel(5)], hex: hex.toUpperCase() };
}

export function defaultShadows(): Record<string, unknown> {
  const shadow = (y: number, blur: number, alpha: number) => ({
    $value: { color: { colorSpace: "srgb", components: [0, 0, 0], alpha, hex: "#000000" }, offsetX: px(0), offsetY: px(y), blur: px(blur), spread: px(0) },
  });
  return { $type: "shadow", sm: shadow(1, 2, 0.08), md: shadow(4, 12, 0.1), lg: shadow(12, 32, 0.14) };
}

export function springGroup(duration: number, bounce: number) {
  return {
    duration: { $type: "duration", $value: { value: duration, unit: "s" } },
    bounce: { $type: "number", $value: bounce },
  };
}

export function pairsExtension() {
  return STANDARD_PAIRS.map(([fg, bg, kind]) => ({ fg: `color.${fg}`, bg: `color.${bg}`, kind }));
}
