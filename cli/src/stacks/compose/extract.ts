// motif extract for Jetpack Compose: a draft design guide from an app's theme code — its colour constants, its
// lightColorScheme/darkColorScheme calls and custom colour classes (parallel ones become design variants), its Typography,
// and the values its composables use.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "../../check/files";
import { callArgs } from "../../check/calls";
import { inRanges, maskComments, maskStrings } from "../../check/mask";
import { colorContext as nameContext } from "../../check/rules/colors";
import type { Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { axisWeightRanges, rootOf } from "../../extract/own-fonts";
import { kebab as dartKebab, locator, title } from "../../text";
import { pairInstances, SLOT_NAMES, TEXT_SLOTS, type Paired } from "../flutter/extract";
import { scanKotlin } from "./rules";

const MAX_EXAMPLES = 5;
const IDENT = "[A-Za-z_][\\w]*";
const sortedSamples = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** A Kotlin name in kebab case: Purple80 → purple-80, PurpleGrey40 → purple-grey-40, textMuted → text-muted. */
const kebab = (name: string) => dartKebab(name).replace(/([a-z])(\d)/g, "$1-$2");
const words = (name: string) => kebab(name).split("-").filter(Boolean);

/** colorScheme arguments, by the Motif role variable each one is (Flutter's mapping, with background too). */
const SCHEME_ROLES: Record<string, string> = {
  primary: "--action-primary",
  onPrimary: "--on-action-primary",
  secondary: "--action-secondary",
  onSecondary: "--on-action-secondary",
  error: "--danger",
  onError: "--on-danger",
  background: "--background",
  surface: "--surface",
  onSurface: "--text-primary",
  onSurfaceVariant: "--text-secondary",
  outline: "--border",
};

/** Words in a scheme's name that say nothing about which scheme it is (LightColors, DarkColorScheme). */
const GENERIC_WORDS = new Set(["theme", "palette", "color", "colors", "colour", "colours", "scheme", "mode"]);

/** Compose's named easings, with their control points (Easing.kt). */
const EASINGS: Record<string, number[]> = {
  FastOutSlowInEasing: [0.4, 0, 0.2, 1],
  LinearOutSlowInEasing: [0, 0, 0.2, 1],
  FastOutLinearInEasing: [0.4, 0, 1, 1],
  Ease: [0.25, 0.1, 0.25, 1],
  EaseIn: [0.42, 0, 1, 1],
  EaseOut: [0, 0, 0.58, 1],
  EaseInOut: [0.42, 0, 0.58, 1],
  EaseInSine: [0.12, 0, 0.39, 0],
  EaseOutSine: [0.61, 1, 0.88, 1],
  EaseInOutSine: [0.37, 0, 0.63, 1],
  EaseInCubic: [0.32, 0, 0.67, 0],
  EaseOutCubic: [0.33, 1, 0.68, 1],
  EaseInOutCubic: [0.65, 0, 0.35, 1],
  EaseInQuad: [0.11, 0, 0.5, 0],
  EaseOutQuad: [0.5, 1, 0.89, 1],
  EaseInOutQuad: [0.45, 0, 0.55, 1],
  EaseInQuart: [0.5, 0, 0.75, 0],
  EaseOutQuart: [0.25, 1, 0.5, 1],
  EaseInOutQuart: [0.76, 0, 0.24, 1],
  EaseInQuint: [0.64, 0, 0.78, 0],
  EaseOutQuint: [0.22, 1, 0.36, 1],
  EaseInOutQuint: [0.83, 0, 0.17, 1],
  EaseInExpo: [0.7, 0, 0.84, 0],
  EaseOutExpo: [0.16, 1, 0.3, 1],
  EaseInOutExpo: [0.87, 0, 0.13, 1],
  EaseInCirc: [0.55, 0, 1, 0.45],
  EaseOutCirc: [0, 0.55, 0.45, 1],
  EaseInOutCirc: [0.85, 0, 0.15, 1],
  EaseInBack: [0.36, 0, 0.66, -0.56],
  EaseOutBack: [0.34, 1.56, 0.64, 1],
  EaseInOutBack: [0.68, -0.6, 0.32, 1.6],
};

const WEIGHTS: Record<string, number> = { Thin: 100, ExtraLight: 200, Light: 300, Normal: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };

interface KotlinFile {
  source: SourceFile;
  /** A file of a package the app depends on: its theme counts, but its composables aren't the app's. */
  shared: boolean;
  /** Comments and string contents blanked, at the file's own positions. */
  code: string;
  /** Comments blanked, strings kept (for reading a GoogleFont's name). */
  text: string;
  lineOf: (index: number) => number;
  colorAt: Map<number, string>;
  hits: ReturnType<typeof scanKotlin>;
  hitIndex: (hit: { line: number; column: number }) => number;
}

function readFile(source: SourceFile, shared: boolean): KotlinFile {
  const text = maskComments(source.text, "kotlin");
  const code = maskStrings(text, "kotlin");
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const hitIndex = (hit: { line: number; column: number }) => starts[hit.line - 1]! + hit.column - 1;
  const at = locator(code);
  const hits = scanKotlin(source, null);
  const colorAt = new Map<number, string>();
  for (const h of hits) if (h.kind === "color" && h.value) colorAt.set(hitIndex(h), h.value);
  return { source, shared, code, text, lineOf: (i) => at(i).line, colorAt, hits, hitIndex };
}

/** True when `index` is at the top level of a file, or in the body of an object (a colour holder), not inside a function or class. */
function declarationLevel(code: string, index: number): boolean {
  const open: number[] = [];
  for (let i = 0; i < index; i++) {
    if (code[i] === "{") open.push(i);
    else if (code[i] === "}") open.pop();
  }
  return open.every((o) => /(?:^|[\s;}])object\b[^{};]*$/.test(code.slice(0, o)));
}

interface Instance extends Paired {
  file: KotlinFile;
  at: number;
  colors: Record<string, string>;
}

type Style = { size: number; weight?: number; lineHeight?: number };

/** The type-role style a TextStyle(…) in a Typography slot gives: size, weight, and line height as a multiple of the size. */
function slotStyle(value: string): Style | undefined {
  const size = value.match(/\bfontSize\s*=\s*(\d+(?:\.\d+)?)\.sp\b/)?.[1];
  if (!size) return undefined;
  const w = value.match(/\bFontWeight\.(?:W([1-9])00|(Thin|ExtraLight|Light|Normal|Medium|SemiBold|Bold|ExtraBold|Black))\b/);
  const weight = w ? (w[1] ? Number(w[1]) * 100 : WEIGHTS[w[2]!]) : undefined;
  const height = value.match(/\blineHeight\s*=\s*(\d+(?:\.\d+)?)\.sp\b/)?.[1];
  return {
    size: Number(size),
    ...(weight ? { weight } : {}),
    ...(height ? { lineHeight: Math.round((Number(height) / Number(size)) * 100) / 100 } : {}),
  };
}

/** The Typography(…) or copy(…) call that sets the most slots with a size (the first, when two set as many). */
function typographyRoles(files: KotlinFile[]): Occurrences["typeRoles"] {
  let best: { from: string; roles: Record<string, Style>; sized: number } | undefined;
  for (const file of files) {
    for (const m of file.code.matchAll(/(?<![\w$])(?:Typography|copy)\s*\(/g)) {
      const call = callArgs(file.code, m.index! + m[0].length - 1, "=");
      if (!call) continue;
      const slots = new Map<string, Style>();
      for (const a of call.args) {
        if (!a.name || !SLOT_NAMES.has(a.name)) continue;
        const style = slotStyle(a.value);
        if (style) slots.set(a.name, style);
      }
      if (slots.size < 2 || (best && slots.size <= best.sized)) continue;
      const roles: Record<string, Style> = {};
      for (const [role, names] of TEXT_SLOTS) {
        const slot = names.find((n) => slots.has(n));
        if (slot) roles[role] = slots.get(slot)!;
      }
      best = { from: `${file.source.path}:${file.lineOf(m.index!)}`, roles, sized: slots.size };
    }
  }
  return best ? { from: best.from, roles: best.roles } : undefined;
}

/** A font family's name from a resource (R.font.inter_bold → Inter): the words before a weight or style word. */
function familyFromResource(resource: string): string {
  const parts = resource.split("_").filter(Boolean);
  const cut = parts.findIndex((p, i) => i > 0 && /^(?:thin|extralight|light|regular|normal|medium|semibold|bold|extrabold|black|italic|variable)$/i.test(p));
  return (cut > 0 ? parts.slice(0, cut) : parts).map((p) => title(p.toLowerCase())).join(" ");
}

type ProjectFontEntry = NonNullable<Occurrences["projectFonts"]>[number];
type UnfoundFontEntry = NonNullable<Occurrences["unfoundFonts"]>[number];

/** Each Font(R.font.…) in a FontFamily(…) call: its resource, and its weight and style (400 and normal unless it gives them). */
function fontCalls(code: string): { resource: string; weight: number; style: "normal" | "italic" }[] {
  const out: { resource: string; weight: number; style: "normal" | "italic" }[] = [];
  for (const m of code.matchAll(/(?<![\w$.])Font\s*\(/g)) {
    const call = callArgs(code, m.index! + m[0].length - 1, "=");
    if (!call) continue;
    const args = code.slice(m.index!, call.close);
    const resource = args.match(/(?:^|[^\w$])R\.font\.([A-Za-z_]\w*)/)?.[1];
    if (!resource) continue;
    const w = args.match(/\bFontWeight\s*(?:\.\s*(?:W([1-9])00|(Thin|ExtraLight|Light|Normal|Medium|SemiBold|Bold|ExtraBold|Black))\b|\(\s*([1-9]00)\s*\))/);
    const weight = w ? (w[1] ? Number(w[1]) * 100 : w[2] ? WEIGHTS[w[2]]! : Number(w[3])) : 400;
    out.push({ resource, weight, style: /\bFontStyle\s*\.\s*Italic\b/.test(args) ? "italic" : "normal" });
  }
  return out;
}

/**
 * A font resource's file (root-relative): a .ttf or .otf of that name (or another kind, given in `exts`) in the res/font
 * folder of a source set above the Kotlin file.
 */
function resFontFile(source: SourceFile, resource: string, exts = [".ttf", ".otf"]): string | undefined {
  const root = rootOf(source);
  if (root === null) return undefined;
  const dirs = source.path.split("/").slice(0, -1);
  for (let n = dirs.length; n >= 0; n--) {
    for (const ext of exts) {
      const path = [...dirs.slice(0, n), "res", "font", `${resource}${ext}`].join("/");
      if (existsSync(join(root, path))) return path;
    }
  }
  return undefined;
}

/**
 * What a Compose app's Kotlin code says about its design: its colour schemes and custom colour classes as colour variables
 * (the default pair as light and dark, the other pairs as design variants), its colour constants, and the colours, sizes,
 * fonts and motion its composables use.
 */
export function collectCompose(files: SourceFile[], shared: SourceFile[] = []): Occurrences {
  const own = new Set(files.map((f) => f.path));
  const kotlin = [
    ...files.filter((f) => f.lang === "kotlin").map((f) => readFile(f, false)),
    ...shared.filter((f) => f.lang === "kotlin" && !own.has(f.path)).map((f) => readFile(f, true)),
  ];
  type Bucket = "colors" | "space" | "radius" | "fontSize" | "fontFamily" | "duration" | "easing";
  const buckets: Record<Bucket, Map<string, Sample>> = {
    colors: new Map(), space: new Map(), radius: new Map(), fontSize: new Map(), fontFamily: new Map(), duration: new Map(), easing: new Map(),
  };
  const add = (bucket: Bucket, value: string, example: string, context?: string) => {
    const s = buckets[bucket].get(value) ?? { value, count: 0, contexts: {}, examples: [] };
    s.count++;
    if (context) s.contexts[context] = (s.contexts[context] ?? 0) + 1;
    if (s.examples.length < MAX_EXAMPLES) s.examples.push(example);
    buckets[bucket].set(value, s);
  };
  const where = (file: KotlinFile, index: number) => `${file.source.path}:${file.lineOf(index)}`;
  /** Code that defines the theme (constants, scheme calls, colour instances): its literals aren't uses. */
  const definitions = new Map<KotlinFile, [number, number][]>();
  const define = (file: KotlinFile, range: [number, number]) => definitions.set(file, [...(definitions.get(file) ?? []), range]);
  const notes: string[] = [];
  const variables = new Map<string, Variable>();
  const roleNames = new Set<string>();
  const variantLabels: Record<string, string> = {};

  // ---------- colour constants: val Purple80 = Color(0xFFD0BCFF) ----------
  const named = new Map<string, string>();
  const constants: { name: string; value: string }[] = [];
  const declared = new RegExp(`(?<![\\w$.])(?:(?:private|internal|public)\\s+)?(?:const\\s+)?val\\s+(${IDENT})\\s*(?::\\s*Color\\s*)?=\\s*`, "g");
  for (const file of kotlin) {
    for (const m of file.code.matchAll(declared)) {
      const end = m.index! + m[0].length;
      const value = file.colorAt.get(end);
      if (!value || !declarationLevel(file.code, m.index!)) continue;
      define(file, [m.index!, end + 1]);
      if (!named.has(m[1]!)) {
        named.set(m[1]!, value);
        constants.push({ name: m[1]!, value });
      }
    }
  }
  /** The colour an argument's value is: a colour written out, or a named constant (followed to its value). */
  const colorOf = (file: KotlinFile, value: string, valueStart: number): string | undefined => {
    const written = file.colorAt.get(valueStart);
    if (written) return written;
    const name = value.match(new RegExp(`^(?:${IDENT}\\.)*(${IDENT})$`))?.[1];
    return name ? named.get(name) : undefined;
  };

  /** Pairs instances into light/dark halves and puts each field's values on its variable: the default pair, then variants. */
  const emit = (what: string, instances: Instance[], fields: { arg: string; name: string }[]) => {
    if (instances.length === 0) return;
    const { defaultPair, variants, unpaired } = pairInstances(instances);
    if (defaultPair && !instances.some((i) => i.key === "" && (defaultPair.light === i || defaultPair.dark === i))) {
      const halves = [defaultPair.light?.name, defaultPair.dark?.name].filter(Boolean).join("/");
      notes.push(`${what} has none without a suffix, so ${halves} became the default.`);
    }
    for (const i of unpaired) {
      notes.push(
        i.dark
          ? `${what} ${i.name} has no light one to pair with, so the ${variants.find((v) => v.dark === i)?.label ?? i.name} variant sets dark-mode colours only.`
          : `${what} ${i.name} has no dark one to pair with, so the ${variants.find((v) => v.light === i)?.label ?? i.name} variant keeps its light colours in dark mode.`,
      );
    }
    for (const v of variants) variantLabels[v.id] ??= v.label;
    for (const { arg, name } of fields) {
      const light = defaultPair?.light?.colors[arg];
      const dark = defaultPair?.dark?.colors[arg];
      const ownVariants: Record<string, { light?: string; dark?: string }> = {};
      for (const v of variants) {
        const l = v.light?.colors[arg];
        const d = v.dark?.colors[arg];
        if (l || d) ownVariants[v.id] = { ...(l ? { light: l } : {}), ...(d ? { dark: d } : {}) };
      }
      if (!light && !dark && Object.keys(ownVariants).length === 0) continue;
      variables.set(name, { name, ...(light ? { light } : {}), ...(dark ? { dark } : {}), ...(Object.keys(ownVariants).length ? { variants: ownVariants } : {}) });
      roleNames.add(name);
      // The default scheme's light colours are the app's colours, as :root's are on the web; dark and variant ones aren't uses.
      if (light && defaultPair?.light) add("colors", light, where(defaultPair.light.file, defaultPair.light.at), nameContext(name));
    }
  };

  /** A name's parts that say which instance it is (Partner in PartnerLightColors), and which half when the name says. */
  const nameParts = (name: string) => {
    const parts = words(name);
    const half = parts.includes("dark") ? "dark" : parts.includes("light") ? "light" : undefined;
    const rest = parts.filter((w, i) => i !== parts.indexOf(half ?? "") && !GENERIC_WORDS.has(w));
    return { half, key: rest.join("-"), label: rest.map(title).join(" ") };
  };

  // ---------- lightColorScheme(…) / darkColorScheme(…) ----------
  const schemes: Instance[] = [];
  const bound = new RegExp(`(?<![\\w$.])val\\s+(${IDENT})\\s*(?::\\s*ColorScheme\\s*)?=\\s*$`);
  for (const file of kotlin) {
    for (const m of file.code.matchAll(/(?<![\w$.])(light|dark)ColorScheme\s*\(/g)) {
      const call = callArgs(file.code, m.index! + m[0].length - 1, "=");
      if (!call) continue;
      define(file, [m.index!, call.close + 1]);
      const colors: Record<string, string> = {};
      for (const a of call.args) {
        const value = a.name && SCHEME_ROLES[a.name] ? colorOf(file, a.value, a.valueStart) : undefined;
        if (a.name && value) colors[a.name] = value;
      }
      const owner = file.code.slice(Math.max(0, m.index! - 120), m.index!).match(bound)?.[1];
      // A scheme that isn't a named val (passed straight to MaterialTheme) is the plain one of its half.
      const parts = owner ? nameParts(owner) : { key: "", label: "" };
      schemes.push({ name: owner ?? `${m[1]}ColorScheme`, file, at: m.index!, order: schemes.length, colors, dark: m[1] === "dark", key: parts.key, label: parts.label });
    }
  }
  emit("A colour scheme", schemes, Object.entries(SCHEME_ROLES).map(([arg, name]) => ({ arg, name })));

  // ---------- custom colour classes: data class AppColors(val brand: Color, …) ----------
  const classDecl = new RegExp(`(?<![\\w$])class\\s+(${IDENT})\\s*(?:<[^>]*>\\s*)?(?:(?:private|internal|public)\\s+)?(?:constructor\\s*)?\\(`, "g");
  const classes: { name: string; params: { name: string; color: boolean }[] }[] = [];
  for (const file of kotlin) {
    for (const m of file.code.matchAll(classDecl)) {
      const call = callArgs(file.code, m.index! + m[0].length - 1, "=");
      if (!call) continue;
      const params = call.args.map((a) => {
        const p = a.value.match(new RegExp(`^(?:(?:private|internal|public|override)\\s+)*(?:val|var)\\s+(${IDENT})\\s*:\\s*(Color)?`));
        return { name: p?.[1] ?? "", color: Boolean(p?.[2]) };
      });
      if (params.some((p) => p.color)) classes.push({ name: m[1]!, params });
    }
  }
  // A field two classes share is told apart by its class's name.
  const fieldCount = new Map<string, number>();
  for (const c of classes) for (const p of c.params) if (p.color) fieldCount.set(p.name, (fieldCount.get(p.name) ?? 0) + 1);
  for (const c of classes) {
    const instances: Instance[] = [];
    const decl = new RegExp(`(?<![\\w$.])val\\s+(${IDENT})\\s*(?::\\s*${c.name}\\s*)?=\\s*${c.name}\\s*\\(`, "g");
    for (const file of kotlin) {
      for (const m of file.code.matchAll(decl)) {
        const call = callArgs(file.code, m.index! + m[0].length - 1, "=");
        if (!call) continue;
        define(file, [m.index!, call.close + 1]);
        if (!declarationLevel(file.code, m.index!)) continue;
        const colors: Record<string, string> = {};
        call.args.forEach((a, i) => {
          const field = a.name ?? c.params[i]?.name;
          if (!field || !c.params.some((p) => p.name === field && p.color)) return;
          const value = colorOf(file, a.value, a.valueStart);
          if (value) colors[field] = value;
        });
        const parts = nameParts(m[1]!);
        instances.push({ name: m[1]!, file, at: m.index!, order: instances.length, colors, dark: parts.half === "dark", key: parts.key, label: parts.label });
      }
    }
    const fields = c.params.filter((p) => p.color).map((p) => ({ arg: p.name, name: fieldCount.get(p.name)! > 1 ? `--${kebab(c.name)}-${kebab(p.name)}` : `--${kebab(p.name)}` }));
    emit(c.name, instances, fields);
  }

  // Constants are variables too (a name a role's variable already took is left to the role).
  for (const c of constants) {
    const name = `--${kebab(c.name)}`;
    if (!variables.has(name)) variables.set(name, { name, light: c.value });
  }

  // ---------- what the composables use ----------
  /** Families built from the app's font resources, by name in lower case: with the files found, or how the code names them. */
  const ownFonts = new Map<string, ProjectFontEntry | UnfoundFontEntry>();
  /** Families downloaded from Google Fonts (GoogleFont("Inter")). */
  const googleFonts = new Set<string>();
  for (const file of kotlin) {
    const defs = definitions.get(file) ?? [];
    for (const hit of file.hits) {
      const index = file.hitIndex(hit);
      if (hit.kind === "color" && inRanges(index, defs)) continue;
      // A shared package's composables aren't the app's; its fonts are.
      if (file.shared && hit.kind !== "font-family") continue;
      const example = `${hit.file}:${hit.line}`;
      switch (hit.kind) {
        case "color":
          if (hit.value) add("colors", hit.value, example, hit.context);
          break;
        case "space":
          add("space", hit.value!, example);
          break;
        case "radius":
          add("radius", hit.value!, example);
          break;
        case "font-size":
          add("fontSize", hit.value!, example);
          break;
        case "font-family":
          // FontFamily(Font(…)) and GoogleFont("…") are read below, wherever they are.
          if (!/^(?:FontFamily\s*\(|GoogleFont\b)/.test(hit.text)) add("fontFamily", hit.value!, example);
          break;
        case "duration":
          add("duration", hit.value!, example);
          break;
        case "easing": {
          const nums = hit.value!.match(/^cubic-bezier\(([^)]*)\)$/)?.[1]?.split(",").map((n) => Number(n.trim()));
          const points = EASINGS[hit.value!] ?? (nums?.length === 4 && nums.every(Number.isFinite) ? nums : undefined);
          if (points) add("easing", `cubic-bezier(${points.join(", ")})`, example);
          break;
        }
      }
    }
    // Fonts: FontFamily(Font(R.font.inter_regular)) is the family its val is named, else its resource's; GoogleFont("Inter") its name.
    for (const m of file.code.matchAll(/(?<![\w$.])FontFamily\s*\(/g)) {
      const call = callArgs(file.code, m.index! + m[0].length - 1, "=");
      if (!call) continue;
      const resource = file.code.slice(m.index!, call.close).match(/(?:^|[^\w$])R\.font\.([A-Za-z_]\w*)/)?.[1];
      if (!resource) continue;
      const owner = file.code.slice(Math.max(0, m.index! - 80), m.index!).match(new RegExp(`val\\s+(${IDENT})\\s*(?::\\s*FontFamily\\s*)?=\\s*$`))?.[1];
      const family = owner ? words(owner).map(title).join(" ") : familyFromResource(resource);
      if (!family) continue;
      add("fontFamily", family, where(file, m.index!));
      // The family's files are the app's own: each Font(R.font.…) in it, found in a res/font folder above the file.
      if (ownFonts.has(family.toLowerCase())) continue;
      const files: ProjectFontEntry["files"] = [];
      for (const f of fontCalls(file.code.slice(m.index!, call.close))) {
        const path = resFontFile(file.source, f.resource);
        if (path && !files.some((x) => x.path === path)) files.push({ path, weight: f.weight, style: f.style });
      }
      // An XML font family (res/font/inter.xml) names its files, or a download, in a way Motif doesn't read yet.
      const xml = files.length > 0 ? undefined : resFontFile(file.source, resource, [".xml"]);
      ownFonts.set(family.toLowerCase(), files.length > 0 ? { family, files } : { family, from: `R.font.${resource}`, ...(xml ? { xml } : {}) });
    }
    for (const m of file.code.matchAll(/(?<![\w$.])GoogleFont\s*\(/g)) {
      const family = file.text.slice(m.index!).match(/^GoogleFont\s*\(\s*(?:name\s*=\s*)?"([^"\n]+)"/)?.[1]?.trim();
      if (!family) continue;
      add("fontFamily", family, where(file, m.index!));
      googleFonts.add(family);
    }
  }
  const typeRoles = typographyRoles(kotlin);
  const projectFonts = [...ownFonts.values()].filter((f): f is ProjectFontEntry => "files" in f);
  const unfoundFonts = [...ownFonts.values()].filter((f): f is UnfoundFontEntry => "from" in f);
  const fontWeightRanges = axisWeightRanges(files[0] ? rootOf(files[0]) : null, projectFonts);

  return {
    colors: sortedSamples(buckets.colors), space: sortedSamples(buckets.space), radius: sortedSamples(buckets.radius), fontSize: sortedSamples(buckets.fontSize),
    fontFamily: sortedSamples(buckets.fontFamily), duration: sortedSamples(buckets.duration), easing: sortedSamples(buckets.easing), unresolved: [],
    variables: [...variables.values()],
    aliases: {},
    roleNames: [...roleNames],
    variableUses: {},
    followVariables: true,
    source: "kotlin",
    ...(Object.keys(variantLabels).length ? { variantLabels } : {}),
    ...(notes.length ? { notes } : {}),
    ...(typeRoles ? { typeRoles } : {}),
    ...(projectFonts.length ? { projectFonts } : {}),
    ...(fontWeightRanges.length ? { fontWeightRanges } : {}),
    ...(googleFonts.size ? { googleFonts: [...googleFonts] } : {}),
    ...(unfoundFonts.length ? { unfoundFonts } : {}),
  };
}
