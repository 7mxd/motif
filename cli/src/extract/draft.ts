import { formatHex, wcagContrast } from "culori";
import type { SourceFile } from "../check/files";
import { darkRanges } from "../check/dark";
import { CLASS_PREFIX, classSegments, utilContext } from "../check/rules/tailwind";
import { TAILWIND_SPACING_PX } from "../check/rules/tailwind-scale";
import { inRanges, maskComments } from "../check/mask";
import { scanFile } from "../check/run";
import { colorContext, CSS_COLOR_LITERAL, CSS_DECLARATION, isPageSelector } from "../check/rules/colors";
import type { Hit } from "../check/types";
import { locator } from "../text";
import { FONT_ROLES, MONO_ROLE, MONO_STACK, SPACE_SCALE, defaultShadows, isMonospace, ms, pairsExtension, px, springGroup, srgbColor } from "../contract/defaults";
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
  /** The variable names declared where variables are followed: the only ones read as role hints. */
  roleNames?: string[];
  /** How each followed variable is used through var(), by context (text, background, border, action…). */
  variableUses?: Record<string, Record<string, number>>;
  /**
   * Read the app's own variables as a person would: uses through var() and through the app's Tailwind theme classes,
   * names that say a role, buttons' fills, colour lists in scripts as data.
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
type Bucket = Exclude<keyof Occurrences, "variables" | "aliases" | "roleNames" | "variableUses" | "followVariables">;

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

const SECONDARY_SELECTOR = /secondary|ghost|outline|tertiary|subtle/i;
/** A state or an exclusion: a disabled or hovered button's fill isn't the button's colour. */
const STATE_SELECTOR = /:(hover|active|focus|focus-visible|focus-within|disabled|not|checked)\b/i;
const BUTTON_TAG = /^(button|input\[type=["']?(submit|button)["']?\])(?![\w-])/i;
/** .btn, .button and their variants (.btn-primary, .btn--primary), but not a link styled as a button (.btn-link). */
const BUTTON_CLASS = /\.(btn|button)(-{1,2}(?!link(?![\w-]))[\w-]+)?(?![\w-])/i;
const BUTTON_ATTR = /^\[(type=["']?submit|role=["']?button)/i;

/**
 * A rule that fills buttons, at rest: every selector in its list must target a button (a reset that also styles
 * fields isn't a button colour), with no state like :disabled or :hover. A secondary one when the selector says so.
 */
function buttonFill(selector: string): "action" | "action-secondary" | undefined {
  const parts = selector.split(",").map((p) => p.trim()).filter(Boolean);
  const isButton = (part: string) => {
    if (STATE_SELECTOR.test(part)) return false;
    const last = part.split(/\s*[\s>+~]\s*/).pop() ?? "";
    return BUTTON_TAG.test(last) || BUTTON_CLASS.test(last) || BUTTON_ATTR.test(last);
  };
  if (parts.length === 0 || !parts.every(isButton)) return undefined;
  return parts.some((p) => SECONDARY_SELECTOR.test(p)) ? "action-secondary" : "action";
}

/** Each outermost var(--name, fallback) in a value: the name, and where its fallback starts and ends. */
function outerVars(value: string): { name: string; start: number; fallback?: [number, number] }[] {
  const out: { name: string; start: number; fallback?: [number, number] }[] = [];
  for (let i = value.indexOf("var("); i >= 0; ) {
    let depth = 0;
    let end = value.length;
    for (let j = i + 3; j < value.length; j++) {
      if (value[j] === "(") depth++;
      else if (value[j] === ")" && --depth === 0) {
        end = j;
        break;
      }
    }
    const inside = value.slice(i + 4, end);
    const name = inside.match(/^\s*(--[\w-]+)/)?.[1];
    const comma = inside.indexOf(",");
    if (name) out.push({ name, start: i, ...(comma >= 0 ? { fallback: [i + 4 + comma + 1, end] as [number, number] } : {}) });
    i = value.indexOf("var(", end);
  }
  return out;
}

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
  /** The page's own background (body { background: var(--x) }). */
  page?: true;
  example: string;
}

/**
 * How a stylesheet uses colours that `scanColors` can't see on its own: variables used through var() (each use counts
 * as a use of the variable's colour), variables defined from other variables, and the fills of buttons. Dark-mode
 * blocks are left out: they set dark values, they don't add uses.
 */
function cssUses(file: SourceFile, aliases: Map<string, string>, fallbacks: Map<string, string>): CssUse[] {
  const css = maskComments(file.text, "css");
  const dark = [...darkRanges(css), ...(file.dark ?? [])];
  const at = locator(css);
  const selectorAt = selectorLookup(css);
  const uses: CssUse[] = [];
  for (const m of css.matchAll(CSS_DECLARATION)) {
    if (inRanges(m.index!, dark)) continue;
    // Custom properties are case-sensitive (--textPrimary isn't --textprimary).
    const prop = m[1]!;
    const raw = m[2]!;
    const value = raw.trim().replace(/\s*!important$/i, "");
    if (prop.startsWith("--motif-")) continue;
    const example = `${file.path}:${at(m.index!).line}`;
    // --a: var(--b) makes --a another name for --b's colour.
    const alias = prop.startsWith("--") ? value.match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1] : undefined;
    if (alias) {
      aliases.set(prop, alias);
      continue;
    }
    const fill = /^background(-color)?$/i.test(prop);
    const button = fill ? buttonFill(selectorAt(m.index!)) : undefined;
    const page = fill && isPageSelector(selectorAt(m.index!));
    const context = colorContext(prop);
    // The value's own start in the stylesheet, so a fallback's colours can be found where scanColors reports them.
    const valueStart = m.index! + m[0].length - raw.length + (raw.length - raw.trimStart().length);
    const vars = outerVars(value);
    for (const v of vars) {
      // light-dark(var(--a), var(--b)): --b is the dark value, not a use.
      if (inRanges(valueStart + v.start, dark)) continue;
      uses.push({ name: v.name, context, ...(button ? { button } : {}), ...(page ? { page: true as const } : {}), example });
      // var(--x, #fff): the fallback only shows when --x has no colour, so it isn't a use of its own as well.
      if (!v.fallback) continue;
      for (const c of value.slice(v.fallback[0], v.fallback[1]).matchAll(CSS_COLOR_LITERAL)) {
        const p = at(valueStart + v.fallback[0] + c.index!);
        fallbacks.set(`${file.path}:${p.line}:${p.column}`, v.name);
      }
    }
    if (button && vars.length === 0) uses.push({ value, context, button, example });
  }
  return uses;
}

/** Names a variable has for a role, in order of preference; a name only counts when its colour is used that way. */
const ROLE_NAMES: { role: string; words: string[]; exact: boolean; usedAs?: string[] }[] = [
  { role: "text-secondary", words: ["muted", "subtle", "subdued", "dim", "faint", "meta", "hint"], exact: false, usedAs: ["text"] },
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
  const parts = bare.split("-");
  // A text role never takes a fill's or a line's name (--bg-muted is a background, however muted).
  if (entry.role.startsWith("text-") && parts.some((p) => FILL_WORDS.has(p))) return -1;
  const found = entry.exact ? entry.words.indexOf(bare) : entry.words.findIndex((w) => parts.includes(w));
  return found < 0 ? -1 : found + 1;
}
const FILL_WORDS = new Set(["bg", "background", "surface", "fill", "panel", "card", "canvas", "border", "ring", "outline", "shadow", "divider"]);

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
  /** Colours written as a var() fallback, by place: counted only when the variable has no colour. */
  const fallbacks = new Map<string, string>();
  const heldBack: { hit: Hit; name: string }[] = [];
  /** Names declared in the files whose variables are followed: only these are read as role hints. */
  const roleNames = new Set<string>();

  for (const file of files) {
    const follow = followFor(file);
    if (follow && file.lang === "css") {
      const before = new Set(aliases.keys());
      uses.push(...cssUses(file, aliases, fallbacks));
      for (const name of aliases.keys()) if (!before.has(name)) roleNames.add(name);
    }
    for (const hit of scanFile(file, null, { tailwind: tailwindFor(file) })) {
      if (hit.kind === "color" && hit.prop) {
        const v = variables.get(hit.prop) ?? { name: hit.prop };
        if (hit.scheme === "dark") v.dark ??= hit.value;
        else v.light ??= hit.value;
        variables.set(hit.prop, v);
        if (follow) roleNames.add(hit.prop);
      }
      // Dark-mode colours give roles their dark values (buildDraft); they don't compete with the light ones.
      if (hit.kind === "color" && hit.scheme === "dark") continue;
      const fallbackFor = hit.kind === "color" ? fallbacks.get(`${hit.file}:${hit.line}:${hit.column}`) : undefined;
      if (fallbackFor) {
        heldBack.push({ hit, name: fallbackFor });
        continue;
      }
      switch (hit.kind) {
        case "color":
          if (hit.rule === "tailwind-palette") {
            const resolved = tw?.colors.get(hit.value!);
            if (resolved) add("colors", resolved, hit, hit.context);
            else add("unresolved", hit.text, hit);
          } else {
            add("colors", hit.value!, hit, hit.context);
            // A background set on the page itself (html, body, :root) is the page's, whatever cards use more.
            if (hit.page) mark(hit.value!, "page");
            // A colour in a script that isn't set as a style (a list to pick from, a default) is data, not the theme.
            if (follow && file.lang !== "css" && hit.rule === "raw-color" && hit.context === "other") mark(hit.value!, "data");
          }
          break;
        case "space": {
          // A spacing class (p-3) counts in steps of the app's own spacing base (Tailwind's --spacing), not always 4 px.
          const step = tw && tw.spacingPx !== TAILWIND_SPACING_PX && /^(?:[\w-]+:)*!?-?[a-z-]+-\d+(?:\.\d+)?$/.test(hit.text);
          add("space", step ? `${(Number.parseFloat(hit.value!) / TAILWIND_SPACING_PX) * tw!.spacingPx}px` : hit.value!, hit);
          break;
        }
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
  // A Tailwind 4 app's own colour classes (text-ink, bg-card): each is a use of the --color-* variable its @theme sets, so
  // an app styled through its theme is read the way it's used, not only from the few colours written out.
  const themeColors = [...new Set([...aliases.keys(), ...variables.keys()])].filter((n) => n.startsWith("--color-")).map((n) => n.slice("--color-".length));
  if (themeColors.length > 0) {
    const names = themeColors.sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const pattern = new RegExp(`${CLASS_PREFIX}(bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|decoration|caret|accent|from|via|to|divide|placeholder)-(${names})(?:\\/\\d{1,3})?(?![\\w-])`, "g");
    for (const file of files) {
      if (!followFor(file) || !tailwindFor(file)) continue;
      const masked = { ...file, text: maskComments(file.text, file.lang) };
      const at = locator(masked.text);
      // body { @apply bg-paper } sets the page's background.
      const selectorAt = file.lang === "css" ? selectorLookup(masked.text) : () => "";
      for (const seg of classSegments(masked)) {
        const page = isPageSelector(selectorAt(seg.offset));
        for (const m of seg.text.matchAll(pattern)) {
          const context = utilContext(m[1]!);
          uses.push({
            name: `--color-${m[2]}`,
            context,
            ...(page && m[1] === "bg" ? { page: true as const } : {}),
            example: `${file.path}:${at(seg.offset + m.index!).line}`,
          });
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
  /** How each variable itself is used (by the name written in var()): the evidence a name hint needs. */
  const variableUses: Record<string, Record<string, number>> = {};
  for (const use of uses) {
    const value = use.name ? colorOf(use.name) : use.value;
    if (!value || (!use.name && !buckets.colors.has(value))) continue;
    if (use.name) {
      const s = buckets.colors.get(value) ?? { value, count: 0, contexts: {}, examples: [] };
      s.count++;
      s.contexts[use.context] = (s.contexts[use.context] ?? 0) + 1;
      if (s.examples.length < MAX_EXAMPLES) s.examples.push(use.example);
      buckets.colors.set(value, s);
      const own = (variableUses[use.name] ??= {});
      own[use.context] = (own[use.context] ?? 0) + 1;
      if (use.button) own[use.button] = (own[use.button] ?? 0) + 1;
    }
    if (use.button) mark(value, use.button);
    // A background set on the page itself, through a variable, is the page's.
    if (use.page) mark(value, "page");
  }
  // A fallback's colour counts after all when its variable never got one.
  for (const { hit, name } of heldBack) if (!colorOf(name)) add("colors", hit.value!, hit, hit.context);
  const sorted = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    colors: sorted(buckets.colors), space: sorted(buckets.space), radius: sorted(buckets.radius), fontSize: sorted(buckets.fontSize),
    fontFamily: sorted(buckets.fontFamily), duration: sorted(buckets.duration), easing: sorted(buckets.easing), unresolved: sorted(buckets.unresolved),
    // A variable set from another one in light (--ink: var(--gray-900)) and written out in dark has its light value
    // through that one, so its dark value can reach its role.
    variables: [...variables.values()].map((v) => {
      const light = v.light ?? (aliases.has(v.name) ? colorOf(v.name) : undefined);
      return light ? { ...v, light } : v;
    }),
    ...(files.some(followFor) ? { aliases: Object.fromEntries(aliases), roleNames: [...roleNames], variableUses, followVariables: true } : {}),
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

  // A variable named for a role, and used that way itself, takes the role first (--bg, --muted, --danger).
  const clusterByHex = new Map<string, ColorCluster>();
  for (const c of clusters) for (const m of c.members) {
    const hex = solidHex(m.value);
    if (hex && !clusterByHex.has(hex)) clusterByHex.set(hex, c);
  }
  const clusterOf = (value: string | undefined) => {
    const hex = solidHex(value);
    return hex ? clusterByHex.get(hex) : undefined;
  };
  const follow = occ.followVariables === true;
  const aliases = occ.aliases ?? {};
  const lightByName = new Map((occ.variables ?? []).filter((v) => v.light).map((v) => [v.name, v.light!]));
  const lightOf = (name: string): string | undefined => {
    let n = name;
    for (let depth = 0; depth < 8 && !lightByName.has(n) && aliases[n]; depth++) n = aliases[n]!;
    return lightByName.get(n);
  };
  const ownUses = occ.variableUses ?? {};
  const candidates = (follow ? (occ.roleNames ?? []) : []).map((name) => ({ name, cluster: clusterOf(lightOf(name)) })).filter((x) => x.cluster);
  const named: Record<string, ColorCluster> = {};
  for (const entry of ROLE_NAMES) {
    const best = candidates
      .map((x) => ({ ...x, score: nameScore(x.name, entry) }))
      // The role's own name is enough; a word like "muted" also needs that variable itself used that way.
      .filter((x) => x.score >= 0 && (x.score === 0 || !entry.usedAs || entry.usedAs.some((k) => (ownUses[x.name]?.[k] ?? 0) > 0)))
      .sort((a, b) => a.score - b.score)[0];
    if (best) named[entry.role] = best.cluster!;
  }
  // Colours only ever listed in scripts (the card colours people pick from) aren't the theme's actions or statuses.
  const isData = (c: ColorCluster) => used(c, "data") >= c.count;

  const chosen: Record<string, ColorCluster | undefined> = {};
  // Page backgrounds are neutral; a much-used saturated background is a brand or action colour.
  chosen.background = named.background ?? backgrounds.find((c) => used(c, "page") > 0 && c.c < 0.04) ?? backgrounds.find((c) => c.c < 0.04) ?? backgrounds[0];
  // Text must be readable on the background: white text used on buttons isn't the main text colour, whatever its name.
  const readableOn = (c: ColorCluster) => !chosen.background || wcagContrast(c.hex, chosen.background.hex) >= 3;
  for (const role of ["text-primary", "text-secondary"]) if (named[role] && !readableOn(named[role]!)) delete named[role];
  const readable = text.filter(readableOn);
  const textPick = (readable.length > 0 ? readable : text).filter((c) => c !== named["text-secondary"]);
  chosen["text-primary"] = named["text-primary"] ?? textPick[0] ?? named["text-secondary"];
  chosen["text-secondary"] = named["text-secondary"] ?? textPick.find((c) => c !== chosen["text-primary"]) ?? chosen["text-primary"];
  // A surface sits close to the page (cards on it), not a mid-grey used for a dot or a chip, and is tinted no more than
  // the page is (an error badge's pale red isn't a surface).
  const nearPage = (c: ColorCluster) =>
    !chosen.background || (wcagContrast(c.hex, chosen.background.hex) < 1.2 && c.c <= Math.max(0.012, chosen.background.c * 2));
  // The border role is the neutral line between things; a coloured one is usually a focus or an active state.
  chosen.border = named.border ?? borders.find((c) => c.c < 0.04) ?? borders[0];
  // A card the colour of its own outline would lose its edge: the lines' colour isn't a surface.
  chosen.surface =
    named.surface ?? backgrounds.find((c) => c !== chosen.background && c !== chosen.border && c.c < 0.04 && nearPage(c)) ?? chosen.background;
  const saturated = clusters.filter((c) => c.c >= 0.08 && !isData(c));
  // Buttons' fills say which colour is the main action, saturated or not (black pill buttons), but not a fill that is
  // the page or a card again (a reset giving buttons the surface colour).
  const pageLike = (c: ColorCluster) =>
    c === chosen.background || c === chosen.surface || (chosen.background !== undefined && wcagContrast(c.hex, chosen.background.hex) < 1.5);
  chosen["action-primary"] = named["action-primary"] ?? by("action").find((c) => !isData(c) && !pageLike(c)) ?? saturated[0];
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
  // Text on secondary buttons: the main text colour when it reads on their fill, otherwise white or ink.
  const onFill = (textName: string, fillName: string) =>
    wcagContrast(hexOf(textName), hexOf(fillName)) >= 4.5 ? textName : onColor(hexOf(fillName)) === WHITE ? "white" : "ink";
  base["on-action-secondary"] = secondaryFill ? onFill(base["text-primary"]!, base["action-secondary"]!) : base["text-primary"]!;
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
  if (secondaryFill) {
    darkBase["on-action-secondary"] = onFill(darkBase["text-primary"] ?? base["text-primary"]!, darkBase["action-secondary"] ?? base["action-secondary"]!);
  } else if (darkBase["text-primary"]) darkBase["on-action-secondary"] = darkBase["text-primary"];
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
  // The brand font, not a generic family that happens to be common (system-ui fallbacks), and not a code font.
  const GENERIC = new Set(["system-ui", "sans-serif", "serif", "monospace", "cursive", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded"]);
  const textFonts = occ.fontFamily.filter((f) => !isMonospace(f.value));
  const namedIn = (list: Sample[]) => list.find((f) => !GENERIC.has(f.value.toLowerCase()))?.value;
  // An app set all in a mono font (a developer tool, a brutalist site) keeps it as its text font too.
  const family = namedIn(textFonts) ?? namedIn(occ.fontFamily) ?? textFonts[0]?.value ?? "system-ui";
  const font: Record<string, unknown> = { $type: "typography" };
  for (const [role, weight, lineHeight] of FONT_ROLES) {
    font[role] = { $value: { fontFamily: "{primitive.font.sans}", fontSize: px(sizeOf[role]!), fontWeight: weight, lineHeight } };
  }
  // Code text gets the optional mono role: the app's own code font first, then the system's.
  const code = occ.fontFamily.find((f) => isMonospace(f.value))?.value;
  const monoFamilies = code === undefined ? [] : [...new Map([...(GENERIC.has(code.toLowerCase()) ? [] : [code]), ...MONO_STACK].map((f) => [f.toLowerCase(), f])).values()];
  if (code !== undefined) {
    const [name, weight, lineHeight] = MONO_ROLE;
    font[name] = { $value: { fontFamily: "{primitive.font.mono}", fontSize: px(sizeOf.label!), fontWeight: weight, lineHeight } };
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
      font: {
        sans: { $type: "fontFamily", $value: [...new Set([family, "system-ui", "sans-serif"])] },
        ...(monoFamilies.length ? { mono: { $type: "fontFamily", $value: monoFamilies } } : {}),
      },
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
  if (code !== undefined) {
    const which = GENERIC.has(code.toLowerCase()) ? "The system's monospace fonts" : code;
    notes.push(`${which} became the optional mono role (font.mono), for code text${family === code ? `; ${code} stays your text font too` : ""}.`);
  }
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
