// motif extract for Flutter: a draft design guide from an app's theme code — its ThemeExtension palettes (light and dark
// pairs; parallel palettes become design variants), its ColorScheme, and the values its widgets use.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { SourceFile } from "../../check/files";
import { inRanges, maskComments, maskStrings } from "../../check/mask";
import { colorContext as nameContext } from "../../check/rules/colors";
import type { Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { isMonospace } from "../../contract/defaults";
import { locator, stripBom } from "../../text";
import { fontAssets } from "./project";
import { callArgs, colorContext, namedArgument, scanDart } from "./rules";

const MAX_EXAMPLES = 5;
const sortedSamples = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** Flutter's named cubic curves, with the control points from Flutter's curves.dart. */
const CURVES: Record<string, number[]> = {
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  fastOutSlowIn: [0.4, 0, 0.2, 1],
  easeInOutCubic: [0.645, 0.045, 0.355, 1],
  easeOutCubic: [0.215, 0.61, 0.355, 1],
  easeInCubic: [0.55, 0.055, 0.675, 0.19],
  // Curves.decelerate is 1 - (1 - t)², which is exactly this cubic.
  decelerate: [0.333, 0.667, 0.667, 1],
  linearToEaseOut: [0.35, 0.91, 0.33, 0.97],
};

/** ColorScheme arguments, by the Motif role variable each one is. */
const SCHEME_ROLES: Record<string, string> = {
  primary: "--action-primary",
  onPrimary: "--on-action-primary",
  secondary: "--action-secondary",
  onSecondary: "--on-action-secondary",
  error: "--danger",
  onError: "--on-danger",
  surface: "--surface",
  onSurface: "--text-primary",
  onSurfaceVariant: "--text-secondary",
  outline: "--border",
};

/** Words in a palette's name that say nothing about which palette it is (lightTheme, darkPalette). */
export const GENERIC_WORDS = new Set(["theme", "palette", "colors", "colours", "scheme", "mode"]);

const IDENT = "[A-Za-z_$][\\w$]*";
const escape = (s: string) => s.replace(/[$]/g, "\\$");

/** A Dart name in kebab case: textMuted → text-muted, HiSalonColors → hi-salon-colors. */
export function kebab(name: string): string {
  return name
    .replace(/^[_$]+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[_$]+/g, "-")
    .toLowerCase();
}

/** The words of a name: HighContrast → High, Contrast; high_contrast → high, contrast. */
export const words = (name: string) => kebab(name).split("-").filter(Boolean);
export const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * True when a declaration at `index` is a palette's: a top-level one, or a static member of a class (mixin, extension)
 * body, not a variable inside a function or method.
 */
function declarationLevel(code: string, index: number, isStatic: boolean): boolean {
  const open: number[] = [];
  for (let i = 0; i < index; i++) {
    if (code[i] === "{") open.push(i);
    else if (code[i] === "}") open.pop();
  }
  if (open.length === 0) return !isStatic;
  if (open.length !== 1 || !isStatic) return false;
  return /(?:^|[\s;}])(?:class|mixin|extension|enum)\b[^{};]*$/.test(code.slice(0, open[0]));
}

/** The index just past the brace that closes the one at `open` (on masked text). */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

interface DartFile {
  source: SourceFile;
  /** A file of a package the app depends on: its theme counts, but its widgets aren't the app's. */
  shared: boolean;
  /** Where ThemeData(…) calls are: a shared package's theme settings, which count as the app's. */
  themeData: [number, number][];
  /** Comments and string contents blanked: the code alone, at the file's own positions. */
  code: string;
  lineOf: (index: number) => number;
  /** Colours written out, by where they start. */
  colorAt: Map<number, string>;
  hits: ReturnType<typeof scanDart>;
  hitIndex: (hit: { line: number; column: number }) => number;
}

function readFile(source: SourceFile, shared: boolean): DartFile {
  const code = maskStrings(maskComments(source.text, "dart"), "dart");
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const hitIndex = (hit: { line: number; column: number }) => starts[hit.line - 1]! + hit.column - 1;
  const at = locator(code);
  const lineOf = (index: number) => at(index).line;
  const hits = scanDart(source, null);
  const colorAt = new Map<number, string>();
  for (const h of hits) if (h.kind === "color" && h.value) colorAt.set(hitIndex(h), h.value);
  const themeData: [number, number][] = [];
  if (shared) {
    for (const m of code.matchAll(/(?<![\w$.])ThemeData(?:\.\w+)?\s*\(/g)) {
      const call = callArgs(code, m.index! + m[0].length - 1);
      if (call) themeData.push([m.index!, call.close + 1]);
    }
  }
  return { source, shared, themeData, code, lineOf, colorAt, hits, hitIndex };
}

interface PaletteClass {
  name: string;
  fields: string[];
  file: DartFile;
  body: [number, number];
}

interface Instance {
  name: string;
  file: DartFile;
  /** Where it's declared in its file, and its place in the source order of all files. */
  at: number;
  order: number;
  colors: Record<string, string>;
  dark: boolean;
  /** The words that say which palette it is (Male in darkMale), and its id and label from them. */
  key: string;
  label: string;
}

/** What pairing needs to know of a palette: its place in the source, which half it is, and the words that say which one. */
export interface PairableInstance { name: string; order: number; dark: boolean; key: string; label: string }

/** Pairs a palette's instances into light/dark halves, picks the default, and names the variants. */
export function pairInstances<Instance extends PairableInstance>(instances: Instance[]): {
  defaultPair: { light?: Instance; dark?: Instance } | undefined;
  variants: { id: string; label: string; light?: Instance; dark?: Instance }[];
  unpaired: Instance[];
} {
  const pairs: { light: Instance; dark: Instance }[] = [];
  const paired = new Set<Instance>();
  for (const d of instances.filter((i) => i.dark)) {
    const light = instances.find((i) => !i.dark && !paired.has(i) && i.key === d.key);
    if (!light) continue;
    pairs.push({ light, dark: d });
    paired.add(light).add(d);
  }
  pairs.sort((a, b) => Math.min(a.light.order, a.dark.order) - Math.min(b.light.order, b.dark.order));
  const unpaired = instances.filter((i) => !paired.has(i));
  // The pair without a suffix (or one called Default: lightDefault/darkDefault); else an unpaired light palette like that;
  // else the first pair; else the first palette.
  let defaultPair: { light?: Instance; dark?: Instance } | undefined;
  for (const key of ["", "default"]) {
    defaultPair ??= pairs.find((p) => p.light.key === key);
    const single = unpaired.find((i) => !i.dark && i.key === key);
    defaultPair ??= single ? { light: single } : undefined;
  }
  defaultPair ??= pairs[0];
  defaultPair ??= instances[0] ? (instances[0].dark ? { dark: instances[0] } : { light: instances[0] }) : undefined;
  const isDefault = (i: Instance) => defaultPair?.light === i || defaultPair?.dark === i;
  const variants: { id: string; label: string; light?: Instance; dark?: Instance }[] = [];
  const add = (id: string, label: string, light?: Instance, dark?: Instance) => {
    const own = variants.find((v) => v.id === id);
    if (own) {
      own.light ??= light;
      own.dark ??= dark;
    } else variants.push({ id, label, ...(light ? { light } : {}), ...(dark ? { dark } : {}) });
  };
  const entries = [
    ...pairs.filter((p) => !isDefault(p.light)).map((p) => ({ order: Math.min(p.light.order, p.dark.order), light: p.light, dark: p.dark })),
    ...unpaired.filter((i) => !isDefault(i)).map((i) => ({ order: i.order, light: i.dark ? undefined : i, dark: i.dark ? i : undefined })),
  ].sort((a, b) => a.order - b.order);
  for (const e of entries) {
    const one = (e.light ?? e.dark)!;
    // A palette called Default that isn't the default one keeps an id of its own (the guide's default is "default").
    if (one.key === "default") add("default-variant", "Default variant", e.light, e.dark);
    else add(one.key || kebab(one.name), one.label || words(one.name).map(title).join(" "), e.light, e.dark);
  }
  return { defaultPair, variants, unpaired: unpaired.filter((i) => !isDefault(i)) };
}

/**
 * Each pubspec.yaml above the files (the app's, a package's), read once: its bundled font families, where it is, and the
 * families' files (paths from the project's root; files outside the project left out).
 */
function pubspecFonts(files: SourceFile[]): { family: string; path: string; files: { path: string; weight: number; style: "normal" | "italic" }[] }[] {
  const seen = new Set<string>();
  const out: { family: string; path: string; files: { path: string; weight: number; style: "normal" | "italic" }[] }[] = [];
  for (const f of files) {
    if (!f.abs) continue;
    let abs = dirname(f.abs);
    let rel = posix.dirname(f.path);
    for (let depth = 0; depth < 12; depth++) {
      const file = join(abs, "pubspec.yaml");
      if (seen.has(file)) break;
      if (existsSync(file)) {
        seen.add(file);
        let text = "";
        try {
          text = stripBom(readFileSync(file, "utf8"));
        } catch {
          // Unreadable: no fonts from it.
        }
        const top = rel === "." || rel === "";
        const path = top ? "pubspec.yaml" : `${rel}/pubspec.yaml`;
        for (const font of fontAssets(text)) {
          const own = font.files
            .map((f) => ({ path: posix.normalize(top ? f.asset : `${rel}/${f.asset}`), weight: f.weight, style: f.style }))
            .filter((f) => !f.path.startsWith("..") && !posix.isAbsolute(f.path));
          out.push({ family: font.family, path, files: own });
        }
        break;
      }
      const up = dirname(abs);
      if (up === abs) break;
      abs = up;
      rel = rel === "." || rel === "" ? ".." : posix.dirname(rel);
    }
  }
  return out;
}

/** A TextTheme's slots, by the Motif role each one is evidence for, in order of preference (the inverse of generate.ts's map). */
const TEXT_SLOTS: [string, string[]][] = [
  ["display", ["displayLarge", "displayMedium", "displaySmall"]],
  ["title", ["headlineLarge", "headlineMedium", "headlineSmall"]],
  ["heading", ["titleLarge", "titleMedium", "titleSmall"]],
  ["body", ["bodyLarge", "bodyMedium"]],
  ["label", ["labelLarge", "labelMedium"]],
  ["caption", ["bodySmall", "labelSmall"]],
];
const SLOT_NAMES = new Set(TEXT_SLOTS.flatMap(([, slots]) => slots));
const NAMED_WEIGHTS: Record<string, number> = { normal: 400, bold: 700 };

/** A text style's size, weight and height, as written in a slot (TextStyle(fontSize: 14), GoogleFonts.onest(…), s(14, …)). */
function slotStyle(value: string): { size: number; weight?: number; lineHeight?: number } | undefined {
  const size = value.match(/\bfontSize\s*:\s*(\d+(?:\.\d+)?)\b/)?.[1] ?? value.match(/^[\w$.?!]+\s*\(\s*(\d+(?:\.\d+)?)\s*[,)]/)?.[1];
  if (!size) return undefined;
  const w = value.match(/\bFontWeight\.(?:w([1-9])00|(normal|bold))\b/);
  const weight = w ? (w[1] ? Number(w[1]) * 100 : NAMED_WEIGHTS[w[2]!]) : undefined;
  const height = value.match(/\bheight\s*:\s*(\d+(?:\.\d+)?)\b/)?.[1];
  return { size: Number(size), ...(weight ? { weight } : {}), ...(height ? { lineHeight: Number(height) } : {}) };
}

/**
 * The app's text theme: the TextTheme(…) or copyWith(…) call that sets the most slots with a size (the first, when two
 * set as many), as Motif's type roles.
 */
function textThemeRoles(files: DartFile[]): Occurrences["typeRoles"] {
  let best: { from: string; roles: Record<string, { size: number; weight?: number; lineHeight?: number }>; sized: number } | undefined;
  for (const file of files) {
    for (const m of file.code.matchAll(/(?<![\w$])(?:TextTheme|copyWith)\s*\(/g)) {
      const call = callArgs(file.code, m.index! + m[0].length - 1);
      if (!call) continue;
      const slots = new Map<string, NonNullable<ReturnType<typeof slotStyle>>>();
      for (const a of call.args) {
        if (!a.name || !SLOT_NAMES.has(a.name)) continue;
        const style = slotStyle(a.value);
        if (style) slots.set(a.name, style);
      }
      if (slots.size < 2 || (best && slots.size <= best.sized)) continue;
      const roles: Record<string, { size: number; weight?: number; lineHeight?: number }> = {};
      for (const [role, names] of TEXT_SLOTS) {
        const slot = names.find((n) => slots.has(n));
        if (slot) roles[role] = slots.get(slot)!;
      }
      best = { from: `${file.source.path}:${file.lineOf(m.index!)}`, roles, sized: slots.size };
    }
  }
  return best ? { from: best.from, roles: best.roles } : undefined;
}

/** A locale check for a right-to-left language with its own script: languageCode == 'ar' (or 'fa', 'ur'). */
const RTL_LOCALE = /languageCode\s*==\s*(["'])(?:ar|fa|ur)\1|(["'])(?:ar|fa|ur)\2\s*==\s*[\w$.?!()]*languageCode/;

/** A locale test's two branches: languageCode == 'ar' ? 'Cairo' : 'Inter' (either side of the test, == or !=). */
const LOCALE_TERNARY = [
  /languageCode\s*(?<op>==|!=)\s*["'](?:ar|fa|ur)["']\s*\?\s*["'](?<first>[^"'\n]+)["']\s*:\s*["'](?<second>[^"'\n]+)["']/g,
  /["'](?:ar|fa|ur)["']\s*(?<op>==|!=)\s*[\w$.?!()]*languageCode\s*\?\s*["'](?<first>[^"'\n]+)["']\s*:\s*["'](?<second>[^"'\n]+)["']/g,
];
const FALLBACK_LIST = /\bfontFamilyFallback\s*:\s*(?:const\s*)?(?:<String>\s*)?\[([^\]]*)\]/g;

/**
 * A family the app bundles that its theme picks for another script, never its main family: the 'ar' branch of a locale
 * test that chooses between two families; else one listed in a fontFamilyFallback; else one named in a file that checks
 * for Arabic (locale.languageCode == 'ar' choosing a text theme in it). `main` is the family the app uses most.
 */
function companionFamily(files: DartFile[], bundled: string[], main: string | undefined): string | undefined {
  const texts = files.map((f) => maskComments(f.source.text, "dart"));
  const known = new Map(bundled.map((b) => [b.toLowerCase(), b]));
  const arabic = new Set<string>();
  const latin = new Set<string>();
  for (const t of texts) {
    for (const re of LOCALE_TERNARY) {
      for (const m of t.matchAll(re)) {
        const { op, first, second } = m.groups!;
        arabic.add((op === "==" ? first : second)!.toLowerCase());
        latin.add((op === "==" ? second : first)!.toLowerCase());
      }
    }
  }
  const pick = [...arabic].find((f) => known.has(f) && !latin.has(f));
  if (pick) return known.get(pick);
  const quoted = (family: string) => new RegExp(`(["'])${family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`);
  const candidates = bundled.filter((f) => !latin.has(f.toLowerCase()) && f.toLowerCase() !== main?.toLowerCase());
  const listed = candidates.find((family) => texts.some((t) => [...t.matchAll(FALLBACK_LIST)].some((m) => quoted(family).test(m[1]!))));
  return listed ?? candidates.find((family) => texts.some((t) => RTL_LOCALE.test(t) && quoted(family).test(t)));
}

/**
 * What a Flutter app's Dart code says about its design: its ThemeExtension palettes as colour variables (the default
 * pair as light and dark, the other pairs as design variants), its ColorScheme as Motif's role variables, and the
 * colours, sizes, fonts and motion its widgets use.
 */
export function collectFlutter(files: SourceFile[], shared: SourceFile[] = []): Occurrences {
  const own = new Set(files.map((f) => f.path));
  const dart = [
    ...files.filter((f) => f.lang === "dart").map((f) => readFile(f, false)),
    ...shared.filter((f) => f.lang === "dart" && !own.has(f.path)).map((f) => readFile(f, true)),
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
  const mark = (value: string, key: string) => {
    const s = buckets.colors.get(value);
    if (s) s.contexts[key] = (s.contexts[key] ?? 0) + 1;
  };
  const where = (file: DartFile, index: number) => `${file.source.path}:${file.lineOf(index)}`;
  /** Code that defines the theme (palettes, ColorScheme calls): its literals aren't uses. */
  const definitions = new Map<DartFile, [number, number][]>();
  const define = (file: DartFile, range: [number, number]) => definitions.set(file, [...(definitions.get(file) ?? []), range]);
  const notes: string[] = [];

  // Colours given a name of their own (const brand = Color(0xFF4338CA)), so a palette or a ColorScheme can name them.
  const named = new Map<string, string>();
  const declared = new RegExp(`(?<![\\w$.])(?:static\\s+)?(?:const|final)\\s+(?:Color\\s+)?(${IDENT})\\s*=\\s*(?:const\\s+)?`, "g");
  for (const file of dart) {
    for (const m of file.code.matchAll(declared)) {
      const value = file.colorAt.get(m.index! + m[0].length);
      if (value && !named.has(m[1]!)) named.set(m[1]!, value);
    }
  }
  /** The colour an argument's value is: a colour written out, or a named one. */
  const colorOf = (file: DartFile, value: string, valueStart: number): string | undefined => {
    const lead = value.match(/^const\s+/)?.[0].length ?? 0;
    const written = file.colorAt.get(valueStart + lead);
    if (written) return written;
    const name = value.match(new RegExp(`^(?:${IDENT}\\.)*(${IDENT})$`))?.[1];
    return name ? named.get(name) : undefined;
  };

  // ---------- ThemeExtension palettes ----------
  const classes: PaletteClass[] = [];
  const classDecl = new RegExp(`(?<![\\w$])class\\s+(${IDENT})\\s*(?:<[^{]*?>)?\\s+extends\\s+ThemeExtension\\s*<[^{]*?>[^{;]*\\{`, "g");
  for (const file of dart) {
    for (const m of file.code.matchAll(classDecl)) {
      const open = m.index! + m[0].length - 1;
      const end = closingBrace(file.code, open);
      const body = file.code.slice(open, end);
      const fields = [...body.matchAll(new RegExp(`(?<![\\w$.])final\\s+Color\\??\\s+(${IDENT})\\s*;`, "g"))].map((f) => f[1]!);
      if (fields.length > 0) classes.push({ name: m[1]!, fields, file, body: [open, end] });
    }
  }
  // A field name two classes share is told apart by its class's name.
  const fieldCount = new Map<string, number>();
  for (const c of classes) for (const f of new Set(c.fields)) fieldCount.set(f, (fieldCount.get(f) ?? 0) + 1);
  const varName = (c: PaletteClass, field: string) => (fieldCount.get(field)! > 1 ? `--${kebab(c.name)}-${kebab(field)}` : `--${kebab(field)}`);
  /** Which variable a field name read in code is (the first class's, when two share it). */
  const fieldVar = new Map<string, string>();
  for (const c of classes) for (const f of c.fields) if (!fieldVar.has(f)) fieldVar.set(f, varName(c, f));

  const variables = new Map<string, Variable>();
  const roleNames = new Set<string>();
  const variantLabels: Record<string, string> = {};
  for (const c of classes) {
    const instances: Instance[] = [];
    const ctor = escape(c.name);
    const decl = new RegExp(`(?<![\\w$.])(static\\s+)?(?:const|final)\\s+(?:${ctor}\\s+)?(${IDENT})\\s*=\\s*(?:const\\s+)?${ctor}\\s*\\(`, "g");
    for (const file of dart) {
      for (const m of file.code.matchAll(decl)) {
        const open = m.index! + m[0].length - 1;
        const call = callArgs(file.code, open);
        if (!call) continue;
        define(file, [m.index!, call.close + 1]);
        // A palette is declared at the top level or as a class's static member, not as a local inside a function.
        if (!declarationLevel(file.code, m.index!, Boolean(m[1]))) continue;
        const colors: Record<string, string> = {};
        for (const a of call.args) {
          if (!a.name || !c.fields.includes(a.name)) continue;
          const value = colorOf(file, a.value, a.valueStart);
          if (value) colors[a.name] = value;
        }
        const name = m[2]!;
        // light and dark count only as words of the name (lightMale, dark_male), not inside one (highlight, darkened).
        const parts = words(name);
        const half = parts.includes("dark") ? "dark" : parts.includes("light") ? "light" : undefined;
        const dark = half === "dark";
        const own = parts.filter((w, i) => i !== parts.indexOf(half ?? "") && !GENERIC_WORDS.has(w));
        instances.push({ name, file, at: m.index!, order: instances.length, colors, dark, key: own.join("-"), label: own.map(title).join(" ") });
      }
    }
    if (instances.length === 0) continue;
    const { defaultPair, variants, unpaired } = pairInstances(instances);
    if (defaultPair && !instances.some((i) => i.key === "" && (defaultPair.light === i || defaultPair.dark === i))) {
      const halves = [defaultPair.light?.name, defaultPair.dark?.name].filter(Boolean).join("/");
      notes.push(`${c.name} has no palette without a suffix, so ${halves} became the default.`);
    }
    for (const i of unpaired) {
      notes.push(
        i.dark
          ? `${c.name}.${i.name} has no light palette to pair with, so the ${variants.find((v) => v.dark === i)?.label ?? i.name} variant sets dark-mode colours only.`
          : `${c.name}.${i.name} has no dark palette to pair with, so the ${variants.find((v) => v.light === i)?.label ?? i.name} variant keeps its light colours in dark mode.`,
      );
    }
    for (const v of variants) variantLabels[v.id] ??= v.label;
    for (const field of c.fields) {
      const name = varName(c, field);
      const light = defaultPair?.light?.colors[field];
      const darkValue = defaultPair?.dark?.colors[field];
      const own: Record<string, { light?: string; dark?: string }> = {};
      for (const v of variants) {
        const l = v.light?.colors[field];
        const d = v.dark?.colors[field];
        if (l || d) own[v.id] = { ...(l ? { light: l } : {}), ...(d ? { dark: d } : {}) };
      }
      if (!light && !darkValue && Object.keys(own).length === 0) continue;
      variables.set(name, { name, ...(light ? { light } : {}), ...(darkValue ? { dark: darkValue } : {}), ...(Object.keys(own).length ? { variants: own } : {}) });
      roleNames.add(name);
      // The default palette's light colours are the app's colours, as :root's are on the web; dark and variant ones aren't uses.
      if (light && defaultPair?.light) add("colors", light, where(defaultPair.light.file, defaultPair.light.at), nameContext(name));
    }
  }

  // ---------- ColorScheme ----------
  const aliases: Record<string, string> = {};
  /** A palette field the value names: palette.accent, context.colors.accent, HiSalonColors.light.accent. */
  const fieldRef = new RegExp(`^(?:[\\w$]+(?:\\(\\))?[!?]?\\.)+(${IDENT})$`);
  for (const file of dart) {
    for (const m of file.code.matchAll(/(?<![\w$.])ColorScheme(?:\.(light|dark|fromSeed))?\s*\(/g)) {
      const open = m.index! + m[0].length - 1;
      const call = callArgs(file.code, open);
      if (!call) continue;
      define(file, [m.index!, call.close + 1]);
      const dark = m[1] === "dark" || call.args.some((a) => a.name === "brightness" && /(?:^|\.)Brightness\.dark$/.test(a.value));
      for (const a of call.args) {
        const name = a.name ? SCHEME_ROLES[a.name] : undefined;
        if (!name) continue;
        const field = a.value.match(fieldRef)?.[1];
        const target = field ? fieldVar.get(field) : undefined;
        if (target) {
          if (target !== name) aliases[name] ??= target;
          roleNames.add(name);
          continue;
        }
        const value = colorOf(file, a.value, a.valueStart);
        if (!value) continue;
        const v = variables.get(name) ?? { name };
        if (dark) v.dark ??= value;
        else if (!v.light) {
          v.light = value;
          add("colors", value, where(file, a.start), nameContext(name));
        }
        variables.set(name, v);
        roleNames.add(name);
      }
    }
  }

  // ---------- uses of palette fields ----------
  const variableUses: Record<string, Record<string, number>> = {};
  const lightOf = (name: string) => {
    let n = name;
    for (let depth = 0; depth < 8 && !variables.get(n)?.light && aliases[n]; depth++) n = aliases[n]!;
    return variables.get(n)?.light;
  };
  const insideClass = (file: DartFile, index: number) => classes.some((c) => c.file === file && index >= c.body[0] && index < c.body[1]);
  if (fieldVar.size > 0) {
    const ref = new RegExp(`(?<=[\\w$)\\]!])\\??\\.(${IDENT})(?![\\w$])(?!\\s*[(<])`, "g");
    for (const file of dart) {
      const defs = definitions.get(file) ?? [];
      for (const m of file.code.matchAll(ref)) {
        const name = fieldVar.get(m[1]!);
        if (!name || insideClass(file, m.index!) || inRanges(m.index!, defs)) continue;
        // A shared package's widgets aren't the app's; its ThemeData is.
        if (file.shared && !inRanges(m.index!, file.themeData)) continue;
        const context = colorContext(file.code, m.index!);
        if (context === "other") continue;
        const own = (variableUses[name] ??= {});
        own[context] = (own[context] ?? 0) + 1;
        const value = lightOf(name);
        if (value) add("colors", value, where(file, m.index!), context);
        // A button's fill is its action colour, as on the web.
        const arg = namedArgument(file.code, m.index!);
        if (arg?.name === "backgroundColor" && /(?:Button(?:\.styleFrom)?|ButtonStyle|styleFrom)$/.test(arg.call)) {
          own.action = (own.action ?? 0) + 1;
          if (value) mark(value, "action");
        }
      }
    }
  }

  // ---------- what the widgets use ----------
  for (const file of dart) {
    const defs = definitions.get(file) ?? [];
    for (const hit of file.hits) {
      const index = file.hitIndex(hit);
      if (inRanges(index, defs)) continue;
      // From a shared package: its fonts and its ThemeData's values, not its widgets'.
      if (file.shared && hit.kind !== "font-family" && !inRanges(index, file.themeData)) continue;
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
          add("fontFamily", hit.value!, example);
          break;
        case "duration":
          add("duration", hit.value!, example);
          break;
        case "easing": {
          const curve = hit.value!.match(/^Curves\.(\w+)$/)?.[1];
          const nums = hit.value!.match(/^cubic-bezier\(([^)]*)\)$/)?.[1]?.split(",").map((n) => Number(n.trim().replace(/_/g, "")));
          const points = curve ? CURVES[curve] : nums?.length === 4 && nums.every(Number.isFinite) ? nums : undefined;
          if (points) add("easing", `cubic-bezier(${points.join(", ")})`, example);
          break;
        }
      }
    }
  }
  const bundled = pubspecFonts([...files, ...shared]);
  for (const { family, path } of bundled) add("fontFamily", family, path);
  const typeRoles = textThemeRoles(dart);
  // The family the app uses most (not a code font) is its main one, never the companion.
  const main = sortedSamples(buckets.fontFamily).find((f) => !isMonospace(f.value) && !/^(?:system-ui|sans-serif|serif|monospace)$/i.test(f.value))?.value;
  const companion = companionFamily(dart, [...new Set(bundled.map((b) => b.family))], main);
  const projectFonts = bundled
    .filter((b) => b.family === companion)
    .map((b) => ({ family: b.family, files: b.files.filter((f) => /\.(ttf|otf)$/i.test(f.path)) }))
    .filter((b) => b.files.length > 0)
    .slice(0, 1);

  const sorted = sortedSamples;
  return {
    colors: sorted(buckets.colors), space: sorted(buckets.space), radius: sorted(buckets.radius), fontSize: sorted(buckets.fontSize),
    fontFamily: sorted(buckets.fontFamily), duration: sorted(buckets.duration), easing: sorted(buckets.easing), unresolved: [],
    variables: [...variables.values()],
    aliases,
    roleNames: [...roleNames],
    variableUses,
    followVariables: true,
    source: "dart",
    ...(Object.keys(variantLabels).length ? { variantLabels } : {}),
    ...(notes.length ? { notes } : {}),
    ...(typeRoles ? { typeRoles } : {}),
    ...(companion ? { companion } : {}),
    ...(projectFonts.length ? { projectFonts } : {}),
  };
}
