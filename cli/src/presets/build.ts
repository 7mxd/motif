import { wcagContrast } from "culori";
import { FONT_ROLES, MONO_ROLE, MONO_STACK, SPACE_SCALE, defaultShadows, ms, pairsExtension, px, springGroup, srgbColor } from "../contract/defaults";
import { PRESETS, type PaletteRole, type PresetSpec } from "./spec";

const ON_BASES = ["action-primary", "action-secondary", "success", "warning", "danger", "info"] as const;
const DISPLAY_ROLES = new Set(["display", "title", "heading"]);

export function presetTokens(spec: PresetSpec): Record<string, unknown> {
  const primitives: Record<string, unknown> = { $type: "color" };
  const color: Record<string, unknown> = { $type: "color" };
  const inks = [spec.light["text-primary"], spec.dark["text-primary"], "#FFFFFF"];
  const onFor = (base: string) => inks.reduce((best, c) => (wcagContrast(c, base) > wcagContrast(best, base) ? c : best));
  const primitive = (name: string, hex: string) => {
    primitives[name] = { $value: srgbColor(hex) };
    return `{primitive.color.${name}}`;
  };
  const role = (name: string, light: string, dark: string) => {
    color[name] = {
      $value: primitive(`light-${name}`, light),
      $extensions: { "dev.motif": { modes: { dark: primitive(`dark-${name}`, dark) } } },
    };
  };
  for (const r of Object.keys(spec.light) as PaletteRole[]) role(r, spec.light[r], spec.dark[r]);
  role("text-inverse", spec.light.surface, spec.dark.background);
  for (const base of ON_BASES) role(`on-${base}`, onFor(spec.light[base]), onFor(spec.dark[base]));

  const font: Record<string, unknown> = { $type: "typography" };
  for (const [name, weight, lineHeight] of FONT_ROLES) {
    font[name] = {
      $value: {
        fontFamily: DISPLAY_ROLES.has(name) ? "{primitive.font.display}" : "{primitive.font.sans}",
        fontSize: px(spec.sizes[name as keyof PresetSpec["sizes"]]),
        fontWeight: weight,
        lineHeight,
      },
    };
  }
  // The optional role for code, at the label size, in the system's own monospace fonts (nothing to download).
  const [monoName, monoWeight, monoLineHeight] = MONO_ROLE;
  font[monoName] = {
    $value: { fontFamily: "{primitive.font.mono}", fontSize: px(spec.sizes.label), fontWeight: monoWeight, lineHeight: monoLineHeight },
  };
  const space: Record<string, unknown> = { $type: "dimension" };
  for (const [key, value] of SPACE_SCALE) space[key] = { $value: px(value) };

  return {
    $extensions: { "dev.motif": { motifContract: 1, preset: spec.id, pairs: pairsExtension() } },
    primitive: {
      color: primitives,
      font: {
        sans: { $type: "fontFamily", $value: spec.fonts.body },
        display: { $type: "fontFamily", $value: spec.fonts.display },
        mono: { $type: "fontFamily", $value: MONO_STACK },
      },
    },
    color,
    font,
    space,
    radius: {
      $type: "dimension",
      none: { $value: px(0) },
      sm: { $value: px(spec.radius.sm) },
      md: { $value: px(spec.radius.md) },
      lg: { $value: px(spec.radius.lg) },
      full: { $value: px(9999) },
    },
    shadow: defaultShadows(),
    duration: {
      $type: "duration",
      instant: { $value: ms(0) },
      fast: { $value: ms(spec.durations.fast) },
      base: { $value: ms(spec.durations.base) },
      slow: { $value: ms(spec.durations.slow) },
    },
    easing: { $type: "cubicBezier", standard: { $value: spec.easing }, enter: { $value: [0, 0, 0, 1] }, exit: { $value: [0.3, 0, 1, 1] } },
    spring: {
      snappy: springGroup(...spec.springs.snappy),
      smooth: springGroup(...spec.springs.smooth),
      bouncy: springGroup(...spec.springs.bouncy),
    },
  };
}

export function presetAbout(spec: PresetSpec): string {
  const fonts = spec.fonts.display[0] === spec.fonts.body[0]
    ? `${spec.fonts.body[0]} throughout`
    : `${spec.fonts.display[0]} for headings, ${spec.fonts.body[0]} for text`;
  return [
    `# ${spec.title}`,
    "",
    `**Feels:** ${spec.words.join(", ")}`,
    "",
    `**Best for:** ${spec.bestFor}`,
    "",
    `**Avoid for:** ${spec.avoidFor}`,
    "",
    `**Fonts:** ${fonts} · **Corners:** ${spec.radius.sm} / ${spec.radius.md} / ${spec.radius.lg} px · **Motion:** ${spec.motionNote}`,
    "",
  ].join("\n");
}

export function presetSample(spec: PresetSpec, template: string): string {
  return template.replace(/\r\n/g, "\n").replace("<title>Motif mockup</title>", `<title>${spec.title} — Motif</title>`);
}

/** The starting theme values for a new design guide: the Minimal style, untagged, with a note for whoever edits it. */
export function templateTokens(): Record<string, unknown> {
  const tokens = presetTokens(PRESETS.find((p) => p.id === "minimal")!) as Record<string, any>;
  delete tokens.$extensions["dev.motif"].preset;
  return {
    $description: "Starting theme values (the Minimal style). Replace them with this app's own, keep every role, and run motif validate after each change.",
    ...tokens,
  };
}
