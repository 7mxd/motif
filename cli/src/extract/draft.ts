import { formatHex, wcagContrast } from "culori";
import type { SourceFile } from "../check/files";
import { darkRanges } from "../check/dark";
import { inRanges, maskComments } from "../check/mask";
import { scanFile } from "../check/run";
import { colorContext, CSS_DECLARATION } from "../check/rules/colors";
import type { Hit } from "../check/types";
import { locator } from "../text";
import { FONT_ROLES, SPACE_SCALE, defaultShadows, ms, pairsExtension, px, springGroup, srgbColor } from "../contract/defaults";
import { clusterColors, parseColor, type ColorCluster, type Sample } from "./cluster";
import type { TailwindDefaults } from "./tailwind-theme";

export interface Variable { name: string; light?: string; dark?: string }

export interface Occurrences {
  colors: Sample[];
  space: Sample[];
  radius: Sample[];
  fontSize: Sample[];
  fontFamily: Sample[];
  duration: Sample[];
  easing: Sample[];
  unresolved: Sample[];
  /** Custom properties set to colours: their light value, and their dark-mode value when one is set. */
  variables?: Variable[];
  /** Custom properties defined from another one (--text-primary: var(--gray-900)), name → the name it uses. */
  aliases?: Record<string, string>;
  /**
   * Read the site's own variables as a person would: uses through var(), names that say a role, buttons' fills, colour
   * lists in scripts as data. Plain web sites only for now; React apps keep the drafts they had.
   */
  followVariables?: boolean;
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
  variables: { name: string; light?: string; dark?: string; role?: string }[];
  notes: string[];
}

const MAX_EXAMPLES = 5;
/** The lists of samples collected; variables and the settings are kept apart. */
type Bucket = Exclude<keyof Occurrences, "variables" | "aliases" | "followVariables">;

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

/** A rule fills a button: its background is an action colour (a secondary one when the selector says so). */
const BUTTON_SELECTOR = /(^|[\s,>+~(])(button|\.btn|\.button)(?![\w-])|\[type=["']?submit|\[role=["']?button/i;
const SECONDARY_SELECTOR = /secondary|ghost|outline|tertiary|subtle/i;
const VAR_USE = /var\(\s*(--[\w-]+)/g;

/** Each rule's selector, found by where its block sits ("" outside any rule). */
function selectorLookup(css: string): (index: number) => string {
  const blocks: { start: number; end: number; selector: string }[] = [];
  const open: { start: number; selector: string }[] = [];
  let segment = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      open.push({ start: i, selector: css.slice(segment, i).trim() });
      segment = i + 1;
    } else if (ch === "}") {
      const block = open.pop();
      if (block) blocks.push({ ...block, end: i });
      segment = i + 1;
    } else if (ch === ";") segment = i + 1;
  }
  return (index) => {
    let inner: (typeof blocks)[number] | undefined;
    for (const b of blocks) if (b.start < index && index < b.end && (!inner || b.start > inner.start)) inner = b;
    return inner?.selector ?? "";
  };
}

interface CssUse {
  /** A variable used through var(), or a colour written out (only for button fills). */
  name?: string;
  value?: string;
  context: string;
  button?: "action" | "action-secondary";
  example: string;
}

/**
 * How a stylesheet uses colours that `scanColors` can't see on its own: variables used through var() (each use counts
 * as a use of the variable's colour), variables defined from other variables, and the fills of buttons. Dark-mode
 * blocks are left out: they set dark values, they don't add uses.
 */
function cssUses(file: SourceFile, aliases: Map<string, string>): CssUse[] {
  const css = maskComments(file.text, "css");
  const dark = darkRanges(css);
  const at = locator(css);
  const selectorAt = selectorLookup(css);
  const uses: CssUse[] = [];
  for (const m of css.matchAll(CSS_DECLARATION)) {
    if (inRanges(m.index!, dark)) continue;
    const prop = m[1]!.toLowerCase();
    const value = m[2]!.trim().replace(/\s*!important$/i, "");
    if (prop.startsWith("--motif-")) continue;
    const example = `${file.path}:${at(m.index!).line}`;
    // --a: var(--b) makes --a another name for --b's colour.
    const alias = prop.startsWith("--") ? value.match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1] : undefined;
    if (alias) {
      aliases.set(prop, alias);
      continue;
    }
    const fill = prop === "background" || prop === "background-color";
    const selector = fill ? selectorAt(m.index!) : "";
    const button = fill && BUTTON_SELECTOR.test(selector) ? (SECONDARY_SELECTOR.test(selector) ? "action-secondary" : "action") : undefined;
    const context = colorContext(prop);
    for (const v of value.matchAll(VAR_USE)) uses.push({ name: v[1]!, context, ...(button ? { button } : {}), example });
    if (button && !value.includes("var(")) uses.push({ value, context, button, example });
  }
  return uses;
}

/** Names a variable has for a role, in order of preference; a name only counts when its colour is used that way. */
const ROLE_NAMES: { role: string; words: string[]; exact: boolean; usedAs?: string[] }[] = [
  { role: "text-secondary", words: ["muted", "subtle", "subdued", "secondary", "dim", "faint", "meta", "hint"], exact: false, usedAs: ["text"] },
  { role: "text-primary", words: ["text", "fg", "foreground", "ink", "body-text", "copy"], exact: true, usedAs: ["text"] },
  { role: "background", words: ["bg", "background", "page", "canvas", "backdrop"], exact: true, usedAs: ["background"] },
  { role: "surface", words: ["surface", "panel", "sheet", "raised"], exact: true, usedAs: ["background"] },
  { role: "border", words: ["border", "hairline", "divider", "separator", "line", "rule"], exact: true, usedAs: ["border"] },
  { role: "action-primary", words: ["primary", "brand", "cta", "action"], exact: true, usedAs: ["action", "background"] },
  { role: "danger", words: ["danger", "error", "destructive", "negative"], exact: true },
  { role: "success", words: ["success", "positive"], exact: true },
  { role: "warning", words: ["warning", "warn", "caution"], exact: true },
  { role: "info", words: ["info", "notice"], exact: true },
];

/**
 * How well a variable's name says a role, lower is better, or -1. 0 is the role's own name (--text-primary,
 * --color-background), which needs no other evidence; then the index of the role's word, plus one.
 */
function nameScore(name: string, entry: (typeof ROLE_NAMES)[number]): number {
  const bare = name.replace(/^--/, "").toLowerCase().replace(/^colou?r-/, "").replace(/-colou?r$/, "");
  if (bare === entry.role) return 0;
  const found = entry.exact ? entry.words.indexOf(bare) : entry.words.findIndex((w) => bare.split("-").includes(w));
  return found < 0 ? -1 : found + 1;
}

export function collectOccurrences(
  files: SourceFile[],
  tw: TailwindDefaults | null,
  tailwindFor: (f: SourceFile) => boolean = () => true,
  followFor: (f: SourceFile) => boolean = () => false,
): Occurrences {
  const buckets: Record<Bucket, Map<string, Sample>> = {
    colors: new Map(), space: new Map(), radius: new Map(), fontSize: new Map(), fontFamily: new Map(),
    duration: new Map(), easing: new Map(), unresolved: new Map(),
  };
  const add = (bucket: Bucket, value: string, hit: Hit, context?: string) => {
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
  /** Marks how a colour is used without counting another use (a button's fill is also a background). */
  const mark = (value: string, key: string) => {
    const s = buckets.colors.get(value);
    if (s) s.contexts[key] = (s.contexts[key] ?? 0) + 1;
  };
  const variables = new Map<string, Variable>();
  const aliases = new Map<string, string>();
  const uses: CssUse[] = [];

  for (const file of files) {
    const follow = followFor(file);
    if (follow && file.lang === "css") uses.push(...cssUses(file, aliases));
    for (const hit of scanFile(file, null, { tailwind: tailwindFor(file) })) {
      if (hit.kind === "color" && hit.prop) {
        const v = variables.get(hit.prop) ?? { name: hit.prop };
        if (hit.scheme === "dark") v.dark ??= hit.value;
        else v.light ??= hit.value;
        variables.set(hit.prop, v);
      }
      // Dark-mode colours give roles their dark values (buildDraft); they don't compete with the light ones.
      if (hit.kind === "color" && hit.scheme === "dark") continue;
      switch (hit.kind) {
        case "color":
          if (hit.rule === "tailwind-palette") {
            const resolved = tw?.colors.get(hit.value!);
            if (resolved) add("colors", resolved, hit, hit.context);
            else add("unresolved", hit.text, hit);
          } else {
            add("colors", hit.value!, hit, hit.context);
            // A colour in a script that isn't set as a style (a list to pick from, a default) is data, not the theme.
            if (follow && file.lang !== "css" && hit.rule === "raw-color" && hit.context === "other") mark(hit.value!, "data");
          }
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
  // Uses through var() count as uses of the variable's colour (following --a: var(--b) to --b); buttons' fills are actions.
  const colorOf = (name: string) => {
    let n = name;
    for (let depth = 0; depth < 8 && !variables.get(n)?.light && aliases.has(n); depth++) n = aliases.get(n)!;
    return variables.get(n)?.light;
  };
  for (const use of uses) {
    const value = use.name ? colorOf(use.name) : use.value;
    if (!value || (!use.name && !buckets.colors.has(value))) continue;
    if (use.name) {
      const s = buckets.colors.get(value) ?? { value, count: 0, contexts: {}, examples: [] };
      s.count++;
      s.contexts[use.context] = (s.contexts[use.context] ?? 0) + 1;
      if (s.examples.length < MAX_EXAMPLES) s.examples.push(use.example);
      buckets.colors.set(value, s);
    }
    if (use.button) mark(value, use.button);
  }
  const sorted = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    colors: sorted(buckets.colors), space: sorted(buckets.space), radius: sorted(buckets.radius), fontSize: sorted(buckets.fontSize),
    fontFamily: sorted(buckets.fontFamily), duration: sorted(buckets.duration), easing: sorted(buckets.easing), unresolved: sorted(buckets.unresolved),
    variables: [...variables.values()],
    ...(files.some(followFor) ? { aliases: Object.fromEntries(aliases), followVariables: true } : {}),
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

const BASE_ROLES = ["text-primary", "text-secondary", "background", "surface", "border", "action-primary", "success", "warning", "danger", "info"];

/** The kind of variable name each base role prefers when several variables share its colour (--text over --shadow). */
const ROLE_CONTEXT: Record<string, string> = { "text-primary": "text", "text-secondary": "text", background: "background", surface: "background", border: "border" };

/** A solid colour as #RRGGBB; undefined when it can't be read or is see-through (shadows and hairlines aren't roles). */
function solidHex(value: string | undefined): string | undefined {
  const c = value ? parseColor(value) : undefined;
  if (!c || (c.alpha ?? 1) < 1) return undefined;
  return formatHex(c)?.toUpperCase();
}

export function buildDraft(occ: Occurrences): { tokens: Record<string, unknown>; report: ExtractReport } {
  const { clusters, unparsed } = clusterColors(occ.colors);
  const used = (c: ColorCluster, k: string) => c.contexts[k] ?? 0;
  const by = (k: string) => clusters.filter((c) => used(c, k) > 0).sort((a, b) => used(b, k) - used(a, k) || b.count - a.count);
  const text = by("text");
  const backgrounds = by("background");
  const borders = by("border");

  // A variable named for a role, whose colour is used that way, takes the role first (--bg, --muted, --danger).
  const clusterOf = (value: string | undefined) => {
    const hex = solidHex(value);
    return hex ? clusters.find((c) => c.members.some((m) => solidHex(m.value) === hex)) : undefined;
  };
  const follow = occ.followVariables === true;
  const aliases = occ.aliases ?? {};
  const lightOf = (name: string): string | undefined => {
    let n = name;
    for (let depth = 0; depth < 8 && aliases[n] && !(occ.variables ?? []).some((v) => v.name === n && v.light); depth++) n = aliases[n]!;
    return (occ.variables ?? []).find((v) => v.name === n)?.light;
  };
  const names = [...(occ.variables ?? []).map((v) => v.name), ...Object.keys(aliases)];
  const named: Record<string, ColorCluster> = {};
  for (const entry of follow ? ROLE_NAMES : []) {
    const best = names
      .map((name) => ({ score: nameScore(name, entry), cluster: clusterOf(lightOf(name)) }))
      // The role's own name is enough; a word like "muted" also needs its colour used that way.
      .filter((x) => x.score >= 0 && x.cluster && (x.score === 0 || !entry.usedAs || entry.usedAs.some((k) => used(x.cluster!, k) > 0)))
      .sort((a, b) => a.score - b.score)[0];
    if (best) named[entry.role] = best.cluster!;
  }
  // Colours only ever listed in scripts (the card colours people pick from) aren't the theme's actions or statuses.
  const isData = (c: ColorCluster) => used(c, "data") >= c.count;

  const chosen: Record<string, ColorCluster | undefined> = {};
  // Page backgrounds are neutral; a much-used saturated background is a brand or action colour.
  chosen.background = named.background ?? backgrounds.find((c) => c.c < 0.04) ?? backgrounds[0];
  // Text must be readable on the background: white text used on buttons isn't the main text colour.
  const readable = text.filter((c) => !chosen.background || wcagContrast(c.hex, chosen.background.hex) >= 3);
  const textPick = (readable.length > 0 ? readable : text).filter((c) => c !== named["text-secondary"]);
  chosen["text-primary"] = named["text-primary"] ?? textPick[0] ?? named["text-secondary"];
  chosen["text-secondary"] = named["text-secondary"] ?? textPick.find((c) => c !== chosen["text-primary"]) ?? chosen["text-primary"];
  chosen.surface = named.surface ?? backgrounds.find((c) => c !== chosen.background && c.c < 0.04) ?? chosen.background;
  chosen.border = named.border ?? borders[0];
  const saturated = clusters.filter((c) => c.c >= 0.08 && !isData(c));
  // Buttons' fills say which colour is the main action, saturated or not (black pill buttons).
  chosen["action-primary"] = named["action-primary"] ?? by("action").find((c) => !isData(c)) ?? saturated[0];
  const secondaryFill = by("action-secondary").find((c) => !isData(c) && c !== chosen["action-primary"]);
  const remaining = saturated.filter((c) => c !== chosen["action-primary"]);
  for (const [role, [hue, width]] of Object.entries(STATUS)) {
    chosen[role] = named[role] ?? remaining.find((c) => hueDistance(c.h, hue) <= width && !Object.values(chosen).includes(c));
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
  for (const role of BASE_ROLES) {
    base[role] = primitiveFor(role);
  }
  base["surface-raised"] = base.surface!;
  // Secondary buttons' fill when the CSS has one (button.secondary), otherwise the surface.
  if (secondaryFill) chosen["action-secondary"] = secondaryFill;
  base["action-secondary"] = secondaryFill ? primitiveFor("action-secondary") : base.surface!;
  base.focus = base["action-primary"]!;
  base["text-inverse"] = base.background!;
  base["on-action-secondary"] = base["text-primary"]!;
  for (const role of ["action-primary", "success", "warning", "danger", "info"]) {
    base[`on-${role}`] = onColor(hexOf(base[role]!)) === WHITE ? "white" : "ink";
  }
  roles["color.surface-raised"] = roles["color.surface"]!;
  roles["color.focus"] = roles["color.action-primary"]!;
  // Dark values from the CSS: a colour variable set in a light block and in a dark block gives its role a real dark value.
  const inCluster = (cluster: ColorCluster | undefined, value: string | undefined) =>
    Boolean(cluster && solidHex(value) && cluster.members.some((m) => solidHex(m.value) === solidHex(value)));
  const darkBase: Record<string, string> = {};
  for (const role of [...BASE_ROLES, ...(secondaryFill ? ["action-secondary"] : [])]) {
    const candidates = (occ.variables ?? []).filter((x) => solidHex(x.dark) && inCluster(chosen[role], x.light));
    const entry = follow ? ROLE_NAMES.find((e) => e.role === role) : undefined;
    const v =
      (entry && candidates.find((x) => nameScore(x.name, entry) >= 0)) ??
      candidates.find((x) => colorContext(x.name) === ROLE_CONTEXT[role]) ??
      candidates[0];
    if (!v) continue;
    const name = `${chosen[role]!.id}-dark`;
    primitives[name] = { $value: srgbColor(solidHex(v.dark)!) };
    darkBase[role] = name;
  }
  if (darkBase.surface) darkBase["surface-raised"] = darkBase.surface;
  if (darkBase.surface && !secondaryFill) darkBase["action-secondary"] = darkBase.surface;
  if (darkBase["action-primary"]) darkBase.focus = darkBase["action-primary"];
  if (darkBase.background) darkBase["text-inverse"] = darkBase.background;
  if (darkBase["text-primary"]) darkBase["on-action-secondary"] = darkBase["text-primary"];
  for (const role of ["action-primary", "success", "warning", "danger", "info"]) {
    if (darkBase[role]) darkBase[`on-${role}`] = onColor(hexOf(darkBase[role]!)) === WHITE ? "white" : "ink";
  }

  const color: Record<string, unknown> = { $type: "color" };
  const order = [
    "background", "surface", "surface-raised", "border", "text-primary", "text-secondary", "text-inverse", "action-primary",
    "on-action-primary", "action-secondary", "on-action-secondary", "focus", "success", "on-success", "warning", "on-warning",
    "danger", "on-danger", "info", "on-info",
  ];
  for (const role of order) {
    const alias = `{primitive.color.${base[role]}}`;
    const dark = darkBase[role] ? `{primitive.color.${darkBase[role]}}` : alias;
    color[role] = { $value: alias, $extensions: { "dev.motif": { modes: { dark } } } };
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

  const darkRoles = Object.keys(darkBase).filter((r) => BASE_ROLES.includes(r));
  const notes = [
    darkRoles.length
      ? `Dark-mode colours came from your CSS for ${darkRoles.join(", ")}; the others were copied from light mode. Review them before turning on dark mode.`
      : "Dark-mode colours were copied from light mode. Review them before turning on dark mode.",
  ];
  const variables = (occ.variables ?? []).filter((v) => v.light).map((v) => {
    const fits = BASE_ROLES.filter((r) => inCluster(chosen[r], v.light));
    const byName = follow ? fits.find((r) => ROLE_NAMES.some((e) => e.role === r && nameScore(v.name, e) >= 0)) : undefined;
    const role = byName ?? fits.find((r) => ROLE_CONTEXT[r] === colorContext(v.name)) ?? fits[0];
    return { name: v.name, light: v.light, ...(v.dark ? { dark: v.dark } : {}), ...(role ? { role: `color.${role}` } : {}) };
  });
  if (variables.length) {
    notes.push(`Your CSS sets ${variables.length} colour ${variables.length === 1 ? "variable" : "variables"}; design/extract-report.json shows the role each matches, so you can define them from Motif's (--bg: var(--motif-color-background)).`);
  }
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
    variables,
    notes,
  };
  return { tokens, report };
}
