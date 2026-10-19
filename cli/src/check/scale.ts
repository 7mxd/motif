import type { Theme } from "../generate/theme";
import type { Scale } from "./types";

export function buildScale(theme: Theme, srcDir: string): Scale {
  return {
    spacePx: new Set([0, ...theme.space.map((s) => s.px)]),
    spaceKeys: new Set(theme.space.map((s) => s.name)),
    radiusPx: new Set([0, ...theme.radius.map((r) => r.px)]),
    radiusKeys: new Set(theme.radius.map((r) => r.name)),
    fontSizePx: new Set(theme.fonts.map((f) => f.sizePx)),
    textKeys: new Set(theme.fonts.map((f) => f.name)),
    shadowKeys: new Set(theme.shadows.map((s) => s.name)),
    easeKeys: new Set(theme.easings.map((e) => e.name)),
    durationMs: new Set([0, ...theme.durations.map((d) => d.ms)]),
    motionImport: `${srcDir}/design/motion`,
  };
}
