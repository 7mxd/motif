import { wcagContrast } from "culori";
import type { SourceFile } from "../check/files";
import { scanFile } from "../check/run";
import type { Hit } from "../check/types";
import { FONT_ROLES, SPACE_SCALE, defaultShadows, ms, pairsExtension, px, springGroup, srgbColor } from "../contract/defaults";
import { clusterColors, type ColorCluster, type Sample } from "./cluster";
import type { TailwindDefaults } from "./tailwind-theme";

export interface Occurrences {
  colors: Sample[];
  space: Sample[];
  radius: Sample[];
  fontSize: Sample[];
  fontFamily: Sample[];
  duration: Sample[];
  easing: Sample[];
  unresolved: Sample[];
}

export interface ExtractReport {
  motifExtract: 1;
  roles: Record<string, string>;
  colors: unknown[];
  spacing: unknown[];
  radius: Sample[];
  fontSizes: Sample[];
  fontFamilies: Sample[];
  durations: Sample[];
  easings: Sample[];
  unresolved: Sample[];
  notes: string[];
}

const MAX_EXAMPLES = 5;

// ---------- collecting ----------

const KEYWORD_EASINGS: Record<string, number[]> = {
  ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1],
  easein: [0.42, 0, 1, 1], easeout: [0, 0, 0.58, 1], easeinout: [0.42, 0, 0.58, 1], linear: [0, 0, 1, 1],
  in: [0.4, 0, 1, 1], out: [0, 0, 0.2, 1], "in-out": [0.4, 0, 0.2, 1],
};

function easingPoints(raw: string, tw: TailwindDefaults | null): number[] | null {
  const v = raw.replace(/["']/g, "").trim();
  const fromTw = tw?.easings.get(v);
  const text = fromTw ?? v;
  const nums = text.match(/^(?:cubic-bezier\(|\[)([^)\]]*)[)\]]$/)?.[1]?.split(/[,\s_]+/).filter(Boolean).map(Number);
  if (nums && nums.length === 4 && nums.every(Number.isFinite)) return nums;
  return KEYWORD_EASINGS[text.toLowerCase()] ?? null;
}

const bezier = (p: number[]) => `cubic-bezier(${p.join(", ")})`;

function cleanFamily(raw: string): string {
  const generic: Record<string, string> = { sans: "system-ui", serif: "serif", mono: "monospace" };
  if (generic[raw]) return generic[raw]!;
  return raw.split(",")[0]!.trim().replace(/^['"]|['"]$/g, "").replace(/_/g, " ");
}

export function collectOccurrences(files: SourceFile[], tw: TailwindDefaults | null): Occurrences {
  const buckets: Record<keyof Occurrences, Map<string, Sample>> = {
    colors: new Map(), space: new Map(), radius: new Map(), fontSize: new Map(), fontFamily: new Map(),
    duration: new Map(), easing: new Map(), unresolved: new Map(),
  };
  const add = (bucket: keyof Occurrences, value: string, hit: Hit, context?: string) => {
    const s = buckets[bucket].get(value) ?? { value, count: 0, contexts: {}, examples: [] };
    s.count++;
    if (context) s.contexts[context] = (s.contexts[context] ?? 0) + 1;
    if (s.examples.length < MAX_EXAMPLES) s.examples.push(`${hit.file}:${hit.line}`);
    buckets[bucket].set(value, s);
  };
  const sized = (bucket: "radius" | "fontSize", hit: Hit, table: Map<string, number> | undefined) => {
    const v = hit.value!;
    if (/^\d/.test(v)) return add(bucket, v, hit);
    const px = table?.get(v) ?? (bucket === "radius" && v === "none" ? 0 : bucket === "radius" && v === "full" ? 9999 : undefined);
    if (px !== undefined) add(bucket, `${px}px`, hit);
    else add("unresolved", hit.text, hit);
  };

  for (const file of files) {
    for (const hit of scanFile(file, null)) {
      switch (hit.kind) {
        case "color":
          if (hit.rule === "tailwind-palette") {
            const resolved = tw?.colors.get(hit.value!);
            if (resolved) add("colors", resolved, hit, hit.context);
            else add("unresolved", hit.text, hit);
          } else add("colors", hit.value!, hit, hit.context);
          break;
        case "space":
          add("space", hit.value!, hit);
          break;
        case "radius":
          sized("radius", hit, tw?.radiusPx);
          break;
        case "font-size":
          sized("fontSize", hit, tw?.textPx);
          break;
        case "font-family":
          add("fontFamily", cleanFamily(hit.value!), hit);
          break;
        case "duration":
          add("duration", hit.value!, hit);
          break;
        case "easing": {
          const points = easingPoints(hit.value!, tw);
          if (points) add("easing", bezier(points), hit);
          break;
        }
      }
    }
  }
  const sorted = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    colors: sorted(buckets.colors), space: sorted(buckets.space), radius: sorted(buckets.radius), fontSize: sorted(buckets.fontSize),
    fontFamily: sorted(buckets.fontFamily), duration: sorted(buckets.duration), easing: sorted(buckets.easing), unresolved: sorted(buckets.unresolved),
  };
}

// ---------- building the draft ----------

const DEFAULT_COLORS: Record<string, string> = {
  background: "#F9FAFB", surface: "#FFFFFF", border: "#D1D5DB", "text-primary": "#111827", "text-secondary": "#4B5563",
  "action-primary": "#4338CA", "action-secondary": "#E5E7EB", success: "#15803D", warning: "#B45309", danger: "#B91C1C", info: "#1D4ED8",
};
const WHITE = "#FFFFFF";
const INK = "#111827";
const STATUS: Record<string, [number, number]> = { success: [145, 40], warning: [75, 25], danger: [25, 25], info: [245, 30] };
const pxOf = (s: Sample) => Number.parseFloat(s.value);
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

function onColor(hex: string): string {
  return wcagContrast(WHITE, hex) >= wcagContrast(INK, hex) ? WHITE : INK;
}

export function buildDraft(occ: Occurrences): { tokens: Record<string, unknown>; report: ExtractReport } {
  const { clusters, unparsed } = clusterColors(occ.colors);
  const used = (c: ColorCluster, k: string) => c.contexts[k] ?? 0;
  const by = (k: string) => clusters.filter((c) => used(c, k) > 0).sort((a, b) => used(b, k) - used(a, k) || b.count - a.count);
  const text = by("text");
  const backgrounds = by("background");
  const borders = by("border");

  const chosen: Record<string, ColorCluster | undefined> = {};
  // Page backgrounds are neutral; a much-used saturated background is a brand or action colour.
  chosen.background = backgrounds.find((c) => c.c < 0.04) ?? backgrounds[0];
  // Text must be readable on the background: white text used on buttons isn't the main text colour.
  const readable = text.filter((c) => !chosen.background || wcagContrast(c.hex, chosen.background.hex) >= 3);
  const textPick = readable.length > 0 ? readable : text;
  chosen["text-primary"] = textPick[0];
  chosen["text-secondary"] = textPick[1] ?? textPick[0];
  chosen.surface = backgrounds.find((c) => c !== chosen.background && c.c < 0.04) ?? chosen.background;
  chosen.border = borders[0];
  const saturated = clusters.filter((c) => c.c >= 0.08);
  chosen["action-primary"] = saturated[0];
  const remaining = saturated.filter((c) => c !== chosen["action-primary"]);
  for (const [role, [hue, width]] of Object.entries(STATUS)) {
    chosen[role] = remaining.find((c) => hueDistance(c.h, hue) <= width && !Object.values(chosen).includes(c));
  }

  // Primitive colours: one per cluster used, plus defaults, white and ink.
  const primitives: Record<string, unknown> = {};
  const roles: Record<string, string> = {};
  const defaulted: string[] = [];
  const primitiveFor = (role: string): string => {
    const cluster = chosen[role];
    if (cluster) {
      primitives[cluster.id] = { $value: srgbColor(cluster.hex) };
      roles[`color.${role}`] = cluster.id;
      return cluster.id;
    }
    const name = `default-${role}`;
    primitives[name] = { $value: srgbColor(DEFAULT_COLORS[role]!) };
    roles[`color.${role}`] = "default";
    if (["success", "warning", "danger", "info", "action-primary", "text-primary", "background", "border"].includes(role)) defaulted.push(role);
    return name;
  };
  const hexOf = (name: string) => (primitives[name] as { $value: { hex: string } }).$value.hex;
  primitives.white = { $value: srgbColor(WHITE) };
  primitives.ink = { $value: srgbColor(INK) };

  const base: Record<string, string> = {};
  for (const role of ["text-primary", "text-secondary", "background", "surface", "border", "action-primary", "success", "warning", "danger", "info"]) {
    base[role] = primitiveFor(role);
  }
  base["surface-raised"] = base.surface!;
  base["action-secondary"] = base.surface!;
  base.focus = base["action-primary"]!;
  base["text-inverse"] = base.background!;
  base["on-action-secondary"] = base["text-primary"]!;
  for (const role of ["action-primary", "success", "warning", "danger", "info"]) {
    base[`on-${role}`] = onColor(hexOf(base[role]!)) === WHITE ? "white" : "ink";
  }
  roles["color.surface-raised"] = roles["color.surface"]!;
  roles["color.focus"] = roles["color.action-primary"]!;

  const color: Record<string, unknown> = { $type: "color" };
  const order = [
    "background", "surface", "surface-raised", "border", "text-primary", "text-secondary", "text-inverse", "action-primary",
    "on-action-primary", "action-secondary", "on-action-secondary", "focus", "success", "on-success", "warning", "on-warning",
    "danger", "on-danger", "info", "on-info",
  ];
  for (const role of order) {
    const alias = `{primitive.color.${base[role]}}`;
    color[role] = { $value: alias, $extensions: { "dev.motif": { modes: { dark: alias } } } };
  }

  // Spacing: the standard 4px scale.
  const space: Record<string, unknown> = { $type: "dimension" };
  for (const [key, value] of SPACE_SCALE) space[key] = { $value: px(value) };
  const nearestStep = (value: number) => SPACE_SCALE.reduce((best, step) => (Math.abs(step[1] - value) < Math.abs(best[1] - value) ? step : best));
  const spacing = occ.space.map((s) => {
    const v = pxOf(s);
    const [key, stepPx] = nearestStep(v);
    return { px: v, count: s.count, nearest: `space.${key}`, onScale: stepPx === v, examples: s.examples };
  });

  // Radius.
  const radiusValues = [...new Set(occ.radius.map(pxOf).filter((v) => v > 0 && v < 999))].sort((a, b) => a - b);
  let sm = 4, md = 8, lg = 16;
  if (radiusValues.length === 1) [sm, md, lg] = [Math.max(2, Math.round(radiusValues[0]! / 2)), radiusValues[0]!, radiusValues[0]! * 2];
  else if (radiusValues.length === 2) [sm, md, lg] = [radiusValues[0]!, radiusValues[1]!, Math.round(radiusValues[1]! * 1.5)];
  else if (radiusValues.length >= 3) [sm, md, lg] = [radiusValues[0]!, radiusValues[Math.floor((radiusValues.length - 1) / 2)]!, radiusValues[radiusValues.length - 1]!];

  // Type.
  const sizes = [...new Set(occ.fontSize.map(pxOf))].sort((a, b) => a - b);
  const bodySample = occ.fontSize.find((s) => pxOf(s) >= 14 && pxOf(s) <= 18);
  const body = bodySample ? pxOf(bodySample) : 16;
  const smaller = sizes.filter((v) => v < body);
  const larger = sizes.filter((v) => v > body);
  let caption = smaller[0] ?? Math.round(body * 0.75);
  let label = smaller.length >= 2 ? smaller[smaller.length - 1]! : Math.round(body * 0.875);
  if (caption > label) [caption, label] = [label, caption];
  const heading = larger[0] ?? Math.round(body * 1.25);
  let title = larger[1] ?? Math.round(body * 1.75);
  if (title <= heading) title = Math.round(heading * 1.4);
  let display = larger.length >= 3 ? larger[larger.length - 1]! : Math.round(body * 2.5);
  if (display <= title) display = Math.round(title * 1.4);
  const sizeOf: Record<string, number> = { display, title, heading, body, label, caption };
  // The brand font, not a generic family that happens to be common (font-mono for code, system-ui fallbacks).
  const GENERIC = new Set(["system-ui", "sans-serif", "serif", "monospace", "cursive", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded"]);
  const family = occ.fontFamily.find((f) => !GENERIC.has(f.value.toLowerCase()))?.value ?? occ.fontFamily[0]?.value ?? "system-ui";
  const font: Record<string, unknown> = { $type: "typography" };
  for (const [role, weight, lineHeight] of FONT_ROLES) {
    font[role] = { $value: { fontFamily: "{primitive.font.sans}", fontSize: px(sizeOf[role]!), fontWeight: weight, lineHeight } };
  }

  // Motion.
  const durations = [...new Set(occ.duration.map(pxOf).filter((v) => v > 0).map((v) => Math.min(v, 2000)))].sort((a, b) => a - b);
  const [fast, baseMs, slow] = durations.length
    ? [durations[0]!, durations[Math.floor(durations.length / 2)]!, durations[durations.length - 1]!]
    : [120, 200, 320];
  const standard = occ.easing[0]?.value.match(/\(([^)]*)\)/)?.[1]?.split(",").map((n) => Number(n.trim())) ?? [0.2, 0, 0, 1];

  const tokens: Record<string, unknown> = {
    $extensions: {
      "dev.motif": {
        motifContract: 1,
        pairs: pairsExtension(),
      },
    },
    primitive: {
      color: { $type: "color", ...primitives },
      font: { sans: { $type: "fontFamily", $value: [...new Set([family, "system-ui", "sans-serif"])] } },
    },
    color,
    font,
    space,
    radius: { $type: "dimension", none: { $value: px(0) }, sm: { $value: px(sm) }, md: { $value: px(md) }, lg: { $value: px(lg) }, full: { $value: px(9999) } },
    shadow: defaultShadows(),
    duration: { $type: "duration", instant: { $value: ms(0) }, fast: { $value: ms(fast) }, base: { $value: ms(baseMs) }, slow: { $value: ms(slow) } },
    easing: { $type: "cubicBezier", standard: { $value: standard }, enter: { $value: [0, 0, 0, 1] }, exit: { $value: [0.3, 0, 1, 1] } },
    spring: { snappy: springGroup(0.25, 0), smooth: springGroup(0.4, 0.1), bouncy: springGroup(0.5, 0.3) },
  };

  const notes = ["Dark-mode colours were copied from light mode. Review them before turning on dark mode."];
  if (defaulted.length) notes.push(`No colour was found for ${defaulted.join(", ")}, so Motif used defaults.`);
  const offScale = spacing.filter((s) => !s.onScale).length;
  if (offScale) notes.push(`${offScale} spacing ${offScale === 1 ? "value wasn't" : "values weren't"} on a 4px scale; the report shows the nearest step for each.`);
  const unresolved = [...occ.unresolved, ...unparsed];
  if (occ.unresolved.length) notes.push(`${occ.unresolved.length} Tailwind ${occ.unresolved.length === 1 ? "class" : "classes"} couldn't be resolved because Tailwind isn't installed here. Run your package install, then motif extract again.`);

  const report: ExtractReport = {
    motifExtract: 1,
    roles,
    colors: clusters.map((c) => ({ id: c.id, hex: c.hex, count: c.count, contexts: c.contexts, members: c.members.map((m) => ({ value: m.value, count: m.count, examples: m.examples })) })),
    spacing,
    radius: occ.radius,
    fontSizes: occ.fontSize,
    fontFamilies: occ.fontFamily,
    durations: occ.duration,
    easings: occ.easing,
    unresolved,
    notes,
  };
  return { tokens, report };
}
