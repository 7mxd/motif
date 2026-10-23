// motif extract for React Native: a draft design guide from an Expo app's code — the colour objects with light and dark
// halves (the starter's constants/Colors.ts), parallel ones as design variants, and the values its styles and animations use.
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import type { SourceFile } from "../../check/files";
import { inRanges, maskComments } from "../../check/mask";
import { colorContext } from "../../check/rules/colors";
import { parseColor, type Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { rootOf, weightStyleOf } from "../../extract/own-fonts";
import { locator } from "../../text";
import { isMonospace } from "../../contract/defaults";
import { GENERIC_WORDS, kebab, pairInstances, title, words, type Paired } from "../flutter/extract";
import { aliasBase } from "./project";
import { scanReactNative } from "./rules";

const MAX_EXAMPLES = 5;
const sortedSamples = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** Words that say nothing about which palette an object is, beside the ones every Motif extractor ignores. */
const GENERIC = new Set([...GENERIC_WORDS, "palettes", "themes", "variants", "modes", "schemes"]);

/** Comments and string contents blanked (quotes and positions kept), so structure is read from code alone. */
function maskCode(original: string): string {
  const text = maskComments(original, "script");
  const out = text.split("");
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") {
        if (text[i + 1] !== "\n") out[i + 1] = " ";
        out[i] = " ";
        i++;
      } else if (c === quote) quote = null;
      else if (c === "\n" && quote !== "`") quote = null;
      else if (c !== "\n" && c !== "\r") out[i] = " ";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
  }
  return out.join("");
}

interface Entry { key: string; keyStart: number; value: Obj | Leaf }
interface Obj { entries: Entry[]; start: number; end: number }
interface Leaf { text: string; start: number }
const isObj = (v: Obj | Leaf): v is Obj => "entries" in v;

const IDENT = "[A-Za-z_$][\\w$]*";
const KEY = new RegExp(`${IDENT}|\\d+`, "y");

/** The index of the first top-level "," or closing bracket at or after `from` (masked text). */
function valueEnd(m: string, from: number): number {
  let depth = 0;
  for (let i = from; i < m.length; i++) {
    const c = m[i]!;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return i;
      depth--;
    } else if (c === "," && depth === 0) return i;
  }
  return m.length;
}

/** The object literal whose "{" is at `open`: its keys and their values, nested objects read too. Spreads and computed keys are skipped. */
function parseObject(m: string, o: string, open: number): Obj {
  const entries: Entry[] = [];
  let i = open + 1;
  const skipSpace = () => {
    while (i < m.length && /\s/.test(m[i]!)) i++;
  };
  while (i < m.length) {
    skipSpace();
    if (m[i] === "}") return { entries, start: open, end: i + 1 };
    if (m[i] === ",") {
      i++;
      continue;
    }
    let key: string | undefined;
    const keyStart = i;
    if (m[i] === '"' || m[i] === "'") {
      const close = m.indexOf(m[i]!, i + 1);
      if (close === -1) break;
      key = o.slice(i + 1, close);
      i = close + 1;
    } else {
      KEY.lastIndex = i;
      const k = KEY.exec(m);
      if (k) {
        key = k[0];
        i += k[0].length;
      }
    }
    if (key === undefined) {
      // Always move on, even when a stray ")" or "]" is what valueEnd stopped at.
      i = Math.max(valueEnd(m, i), i + 1);
      continue;
    }
    skipSpace();
    if (m[i] !== ":") {
      // A shorthand property ({ Onest_400Regular, SpaceMono }): the key is the value.
      entries.push({ key, keyStart, value: { text: key, start: keyStart } });
      continue;
    }
    i++;
    skipSpace();
    if (m[i] === "{") {
      const child = parseObject(m, o, i);
      entries.push({ key, keyStart, value: child });
      i = child.end;
    } else {
      const end = valueEnd(m, i);
      entries.push({ key, keyStart, value: { text: o.slice(i, end).trim(), start: i } });
      i = end;
    }
  }
  return { entries, start: open, end: m.length };
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\([^()]*\)$/i;

/** A colour written as a string literal, in CSS form (3- and 4-digit hex expanded, lower case). */
function colorLiteral(text: string): string | undefined {
  const s = text.match(/^(["'`])([^"'`]*)\1$/)?.[2]?.trim();
  if (!s) return undefined;
  if (HEX.test(s)) {
    const h = s.slice(1).toLowerCase();
    return `#${h.length <= 4 ? [...h].map((c) => c + c).join("") : h}`;
  }
  return FUNCTIONAL.test(s) && parseColor(s) ? s.toLowerCase() : undefined;
}

interface ScriptFile {
  source: SourceFile;
  masked: string;
  lineOf: (index: number) => number;
  /** Top-level object literals: `const X = { … }`, `export default { … }`. */
  roots: { name: string; obj: Obj }[];
}

const ROOT_DECL = new RegExp(`(?<![\\w$.])(?:export\\s+)?(?:const|let|var)\\s+(${IDENT})\\s*(?::[^=;{]+)?=\\s*\\{|(?<![\\w$.])export\\s+default\\s*\\{`, "g");

function readFile(source: SourceFile): ScriptFile {
  const masked = maskCode(source.text);
  const at = locator(masked);
  const roots: { name: string; obj: Obj }[] = [];
  let depth = 0;
  let scanned = 0;
  for (const m of masked.matchAll(ROOT_DECL)) {
    for (; scanned < m.index!; scanned++) {
      if (masked[scanned] === "{") depth++;
      else if (masked[scanned] === "}") depth--;
    }
    if (depth !== 0) continue;
    roots.push({ name: m[1] ?? "default", obj: parseObject(masked, source.text, m.index! + m[0].length - 1) });
  }
  return { source, masked, lineOf: (index) => at(index).line, roots };
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const SIZE_MAPS: [RegExp, "space" | "radius" | "fontSize"][] = [
  [/^(?:spacing|spacings|space)$/i, "space"],
  [/^(?:radius|radii|borderRadius|borderRadii|corners)$/i, "radius"],
  [/^(?:fontSize|fontSizes)$/i, "fontSize"],
];

/** React Native's Easing.ease, the one named curve Reanimated's code spells without numbers. */
const EASE = "cubic-bezier(0.42, 0, 1, 1)";

/** A font family from an Expo font key: Onest_400Regular → Onest, Inter-Bold → Inter; other names as written. */
function familyOf(name: string): string {
  return name.replace(/_\d{3}\w*$/, "").replace(/-(?:Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)(?:Italic)?$/, "");
}

type ProjectFontEntry = NonNullable<Occurrences["projectFonts"]>[number];
type UnfoundFontEntry = NonNullable<Occurrences["unfoundFonts"]>[number];

/**
 * A font file the app ships, root-relative, from the path a require() names: relative to the file, or, with Expo's @/
 * alias, to the app's folder (the nearest one above the file with a package.json). Undefined when it isn't there.
 */
function shippedFont(source: SourceFile, required: string): string | undefined {
  const root = rootOf(source);
  if (root === null) return undefined;
  const dir = posix.dirname(source.path);
  const inside = (p: string) => (p === "." || p.startsWith("..") || posix.isAbsolute(p) ? undefined : p);
  if (required.startsWith("./") || required.startsWith("../")) {
    const path = inside(posix.normalize(posix.join(dir, required)));
    return path && existsSync(root + path) ? path : undefined;
  }
  if (!required.startsWith("@/")) return undefined;
  const base = appFolder(root, dir);
  if (base === null) return undefined;
  const path = inside(posix.normalize(base + required.slice(2)));
  return path && existsSync(root + path) ? path : undefined;
}

/** The app's folder, root-relative with a trailing "/" ("" for the root): the nearest one at or above `dir` with a package.json. */
function appFolder(root: string, dir: string): string | null {
  for (let d = dir; ; d = posix.dirname(d)) {
    const base = d === "." ? "" : `${d}/`;
    if (existsSync(`${root}${base}package.json`)) return base;
    if (d === "." || d === "/" || d === "") return null;
  }
}

const MODULE_SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

/**
 * The app's file an import names: a relative path, or Expo's @/ alias (where tsconfig.json's paths point it, else the
 * app's folder). A package, or a file Motif doesn't scan, gives undefined.
 */
function moduleFile(from: ScriptFile, spec: string, byPath: Map<string, ScriptFile>): ScriptFile | undefined {
  let base: string;
  if (spec.startsWith("./") || spec.startsWith("../")) base = posix.normalize(posix.join(posix.dirname(from.source.path), spec));
  else if (spec.startsWith("@/")) {
    const root = rootOf(from.source);
    const app = root === null ? null : appFolder(root, posix.dirname(from.source.path));
    if (root === null || app === null) return undefined;
    base = posix.normalize(posix.join(app, aliasBase(root + app) ?? "", spec.slice(2)));
  } else return undefined;
  if (base.startsWith("..")) return undefined;
  for (const suffix of MODULE_SUFFIXES) {
    const file = byPath.get(base + suffix);
    if (file) return file;
  }
  return undefined;
}

/** The names a list in braces brings in or sends out: "a, b as c, type T" → [a, a], [b, c] (type-only names left out). */
const bindings = (list: string) =>
  list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^type\s/.test(s))
    .map((s) => {
      const [from, as] = s.split(/\s+as\s+/);
      return [from!.trim(), (as ?? from)!.trim()] as const;
    });

const IMPORT_FROM = /(?<![\w$.])import\s+(?!type\s)(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(["'])([^"'\n]+)\3/g;
const EXPORT_FROM = /(?<![\w$.])export\s+(?!type\s)(?:\{([^}]*)\}|\*)\s*from\s*(["'])([^"'\n]+)\2/g;
const EXPORT_LIST = /(?<![\w$.])export\s*\{([^}]*)\}(?!\s*from)/g;
const EXPORT_DEFAULT_NAME = /(?<![\w$.])export\s+default\s+([A-Za-z_$][\w$]*)\s*;/;

/**
 * The object literal a name stands for in a file, read without running anything: a top-level const (or export default)
 * in it, or one an import brings in from another of the app's files, followed through re-exports. Undefined otherwise.
 */
function objectNamed(file: ScriptFile, name: string, byPath: Map<string, ScriptFile>, seen = new Set<string>()): { file: ScriptFile; obj: Obj } | undefined {
  const key = `${file.source.path}#${name}`;
  if (seen.has(key) || seen.size > 32) return undefined;
  seen.add(key);
  const root = file.roots.find((r) => r.name === name);
  if (root) return { file, obj: root.obj };
  const text = maskComments(file.source.text, "script");
  const follow = (spec: string, exported: string) => {
    const module = moduleFile(file, spec, byPath);
    return module ? objectNamed(module, exported, byPath, seen) : undefined;
  };
  if (name === "default") {
    const local = text.match(EXPORT_DEFAULT_NAME)?.[1];
    return local ? objectNamed(file, local, byPath, seen) : undefined;
  }
  for (const m of text.matchAll(IMPORT_FROM)) {
    if (m[1] === name) return follow(m[4]!, "default");
    const bound = m[2] ? bindings(m[2]).find(([, as]) => as === name) : undefined;
    if (bound) return follow(m[4]!, bound[0]);
  }
  for (const m of text.matchAll(EXPORT_LIST)) {
    const bound = bindings(m[1]!).find(([, as]) => as === name);
    if (bound && bound[0] !== name) return objectNamed(file, bound[0], byPath, seen);
  }
  for (const m of text.matchAll(EXPORT_FROM)) {
    if (m[1] === undefined) {
      const found = follow(m[3]!, name);
      if (found) return found;
      continue;
    }
    const bound = bindings(m[1]).find(([, as]) => as === name);
    if (bound) return follow(m[3]!, bound[0]);
  }
  return undefined;
}

/** A locale test for a language in Arabic script (=== "ar", "fa" or "ur"), or the layout's right-to-left flag. */
const ARABIC_CHECK = /(["'`])(?:ar|fa|ur)\1\s*[!=]==?|[!=]==?\s*(["'`])(?:ar|fa|ur)\2|\bisRTL\b/;

/** A call that loads fonts: useFonts( or Font.loadAsync( with an object literal, or with a name (group 1) for one. */
const FONT_LOAD = new RegExp(`(?<![\\w$.])(?:useFonts|(?:Font\\s*\\.\\s*)?loadAsync)\\s*\\(\\s*(?:(?=\\{)|(${IDENT})\\s*[,)])`, "g");

const APP_CONFIGS = ["app.json", "app.config.json", "app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"];
const FONT_PATH = /\.(?:ttf|otf)$/i;

/**
 * The fonts expo-font's config plugin embeds, from each app's config (the folder above the code with a package.json):
 * app.json's or app.config.json's plugins entry ["expo-font", { fonts: [...] }] (its ios and android lists too, paths
 * or { fontFamily, fontDefinitions }). An app.config.js or .ts is code: it isn't run, and only a literal list of paths
 * in its expo-font entry is read. Each font's path is root-relative, or undefined when the file isn't there.
 */
function pluginFonts(files: SourceFile[]): { family: string; path: string | undefined; from: string; weight: number; style: "normal" | "italic" }[] {
  const root = files.length > 0 ? rootOf(files[0]!) : null;
  if (root === null) return [];
  const apps = new Set<string>();
  for (const f of files) {
    for (let d = posix.dirname(f.path); ; d = posix.dirname(d)) {
      const base = d === "." ? "" : `${d}/`;
      if (existsSync(`${root}${base}package.json`)) {
        apps.add(base);
        break;
      }
      if (d === "." || d === "/" || d === "") break;
    }
  }
  const out: ReturnType<typeof pluginFonts> = [];
  for (const base of [...apps].sort()) {
    for (const name of APP_CONFIGS) {
      let text: string;
      try {
        text = readFileSync(`${root}${base}${name}`, "utf8").replace(/^﻿/, "");
      } catch {
        continue;
      }
      const found: { path: string; family?: string; weight?: number; style?: string }[] = [];
      if (name.endsWith(".json")) {
        let config: any;
        try {
          config = JSON.parse(text);
        } catch {
          continue;
        }
        const plugins = config?.expo?.plugins ?? config?.plugins;
        for (const p of Array.isArray(plugins) ? plugins : []) {
          if (!Array.isArray(p) || p[0] !== "expo-font" || typeof p[1] !== "object" || p[1] === null) continue;
          for (const list of [p[1].fonts, p[1].ios?.fonts, p[1].android?.fonts]) {
            for (const item of Array.isArray(list) ? list : []) {
              if (typeof item === "string") found.push({ path: item });
              else if (item && typeof item.fontFamily === "string" && Array.isArray(item.fontDefinitions)) {
                for (const d of item.fontDefinitions) if (typeof d?.path === "string") found.push({ path: d.path, family: item.fontFamily, weight: d.weight, style: d.style });
              }
            }
          }
        }
      } else {
        const code = maskComments(text, "script");
        for (const m of code.matchAll(/(["'])expo-font\1\s*,\s*\{/g)) {
          const list = code.slice(m.index!, m.index! + 2000).match(/\bfonts\s*:\s*\[([^\]]*)\]/)?.[1] ?? "";
          for (const s of list.matchAll(/(["'])([^"'\n]+)\1/g)) found.push({ path: s[2]! });
        }
      }
      for (const f of found) {
        if (!FONT_PATH.test(f.path)) continue;
        const file = posix.basename(f.path).replace(FONT_PATH, "");
        const face = weightStyleOf(file);
        const path = posix.normalize(base + f.path.replace(/^\.\//, ""));
        const inside = !(path.startsWith("../") || path === ".." || posix.isAbsolute(path));
        out.push({
          family: f.family ?? familyOf(file),
          path: inside && existsSync(root + path) ? path : undefined,
          from: `"${f.path}" in ${base}${name}`,
          weight: typeof f.weight === "number" && f.weight >= 100 && f.weight <= 900 ? Math.round(f.weight / 100) * 100 : face.weight,
          style: f.style === "italic" ? "italic" : f.style === "normal" ? "normal" : face.style,
        });
      }
    }
  }
  return out;
}

/** Colour properties of a React Native style, which a palette's roles aren't called. */
const STYLE_COLOR = /^(?:color|backgroundColor|borderColor|border(?:Top|Bottom|Left|Right|Start|End)Color|shadowColor|tintColor|textShadowColor|textDecorationColor|overlayColor)$/;

interface Half {
  path: string;
  dark: boolean;
  colors: Record<string, string>;
  at: number;
  file: ScriptFile;
  /** For a top-level object named for its half (light, menDark): the words that say which palette it is. */
  own?: string[];
}
interface Instance extends Paired {
  group: string;
  raw: string;
  colors: Record<string, string>;
  at: number;
  file: ScriptFile;
}

/**
 * What an Expo app's code says about its design: colour objects with light and dark halves as colour variables (the
 * default pair as light and dark, the other pairs as design variants), and the sizes, fonts and motion its styles use.
 */
export function collectReactNative(files: SourceFile[], _shared: SourceFile[] = []): Occurrences {
  const scripts = files.filter((f) => f.lang === "script").map(readFile);
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
  const where = (file: ScriptFile, index: number) => `${file.source.path}:${file.lineOf(index)}`;
  /** Code that defines the theme (palette objects, the consts they name): its literals aren't uses. */
  const definitions = new Map<ScriptFile, [number, number][]>();
  const define = (file: ScriptFile, range: [number, number]) => definitions.set(file, [...(definitions.get(file) ?? []), range]);
  const notes: string[] = [];

  // Colours given a name of their own (const tintColorLight = '#0a7ea4'), so a palette can name them.
  const named = new Map<string, { value: string; file: ScriptFile; range: [number, number] }>();
  const declared = new RegExp(`(?<![\\w$.])(?:export\\s+)?const\\s+(${IDENT})\\s*(?::\\s*string\\s*)?=\\s*(?=["'\`])`, "g");
  for (const file of scripts) {
    for (const m of file.masked.matchAll(declared)) {
      const start = m.index! + m[0].length;
      const quote = file.masked[start]!;
      const end = file.masked.indexOf(quote, start + 1);
      if (end === -1) continue;
      const value = colorLiteral(file.source.text.slice(start, end + 1));
      if (value && !named.has(m[1]!)) named.set(m[1]!, { value, file, range: [m.index!, end + 1] });
    }
  }
  const usedNames = new Set<string>();
  const colorOf = (leaf: Leaf): string | undefined => {
    const written = colorLiteral(leaf.text);
    if (written) return written;
    const n = named.get(leaf.text);
    if (n) usedNames.add(leaf.text);
    return n?.value;
  };

  // ---------- colour objects with light and dark halves ----------
  const halves: Half[] = [];
  /** An object's own colours (not those of the objects inside it), by key. */
  const colorsIn = (obj: Obj) => {
    const colors: Record<string, string> = {};
    for (const e of obj.entries) {
      const value = isObj(e.value) ? undefined : colorOf(e.value);
      if (value) colors[e.key] = value;
    }
    return colors;
  };
  /** Walks an object looking for ones with a `light` or `dark` object inside; returns whether any was found. */
  const walk = (file: ScriptFile, obj: Obj, path: string[]): boolean => {
    const half = (name: string) => obj.entries.find((e) => e.key === name && isObj(e.value));
    const light = half("light");
    const dark = half("dark");
    let found = false;
    if (light || dark) {
      for (const [entry, isDark] of [[light, false], [dark, true]] as const) {
        if (!entry) continue;
        const colors = colorsIn(entry.value as Obj);
        if (Object.keys(colors).length === 0) continue;
        halves.push({ path: path.join("."), dark: isDark, colors, at: entry.keyStart, file });
        found = true;
      }
    }
    for (const e of obj.entries) {
      if (!isObj(e.value) || (light || dark) && (e.key === "light" || e.key === "dark")) continue;
      if (walk(file, e.value, [...path, e.key])) found = true;
    }
    return found;
  };
  for (const file of scripts) {
    for (const root of file.roots) {
      if (walk(file, root.obj, [root.name])) {
        define(file, [root.obj.start, root.obj.end]);
        continue;
      }
      // A top-level object named for its half: const light = { … }, darkColors, menLight. Light and dark count only as
      // words of the name, not inside one (highlight).
      const parts = words(root.name);
      const isDark = parts.includes("dark");
      if (!isDark && !parts.includes("light")) continue;
      const colors = colorsIn(root.obj);
      // A palette has several colours; a style object (darkOverlay = { backgroundColor: … }) isn't one.
      if (Object.keys(colors).length < 2 || Object.keys(colors).some((k) => STYLE_COLOR.test(k))) continue;
      const own = parts.filter((w) => w !== "light" && w !== "dark" && !GENERIC.has(w));
      halves.push({ path: root.name, dark: isDark, colors, at: root.obj.start, file, own });
      define(file, [root.obj.start, root.obj.end]);
    }
  }
  for (const name of usedNames) {
    const n = named.get(name)!;
    define(n.file, n.range);
  }

  const variables = new Map<string, Variable>();
  const roleNames = new Set<string>();
  const variantLabels: Record<string, string> = {};
  const instances: Instance[] = halves.map((h, order) => {
    const parts = h.path.split(".");
    const own = h.own ?? parts.flatMap((p) => words(p)).filter((w) => !GENERIC.has(w));
    return {
      name: h.own ? h.path : `${h.path}.${h.dark ? "dark" : "light"}`,
      order,
      dark: h.dark,
      key: own.join("-"),
      label: own.map(title).join(" "),
      group: h.path,
      // The variant's id as written: the last key of an object path (palettes["partner-store"]), else the name in kebab case.
      raw: !h.own && parts.length > 1 && !GENERIC.has(kebab(parts[parts.length - 1]!)) ? parts[parts.length - 1]! : own.join("-"),
      colors: h.colors,
      at: h.at,
      file: h.file,
    };
  });
  const { defaultPair, variants, unpaired } = pairInstances(instances);
  const raws = new Map<Instance, string>(instances.map((i) => [i, i.raw]));
  const idOf = (v: { id: string; light?: Instance; dark?: Instance }) => (v.id === "default-variant" ? v.id : raws.get((v.light ?? v.dark)!) || v.id);
  if (defaultPair && !instances.some((i) => i.key === "" && (defaultPair.light === i || defaultPair.dark === i))) {
    const names = [...new Set([defaultPair.light?.group, defaultPair.dark?.group].filter(Boolean))].join(" and ");
    notes.push(`No colour object is named without a suffix, so ${names} became the default.`);
  }
  for (const i of unpaired) {
    const label = variants.find((v) => v.dark === i || v.light === i)?.label ?? i.group;
    notes.push(
      i.dark
        ? `${i.group} has no light colours to pair with, so the ${label} variant sets dark-mode colours only.`
        : `${i.group} has no dark colours to pair with, so the ${label} variant keeps its light colours in dark mode.`,
    );
  }
  const own = variants.map((v) => ({ ...v, id: idOf(v) }));
  for (const v of own) variantLabels[v.id] ??= v.label;
  const fields = [...new Set(instances.flatMap((i) => Object.keys(i.colors)))];
  /** The variable a colour property is (tabIconSelected → --tab-icon-selected). */
  const varName = (field: string) => `--${kebab(field)}`;
  const fieldVar = new Map<string, string>(fields.map((f) => [f, varName(f)]));
  for (const field of fields) {
    const name = varName(field);
    const light = defaultPair?.light?.colors[field];
    const darkValue = defaultPair?.dark?.colors[field];
    const byVariant: Record<string, { light?: string; dark?: string }> = {};
    for (const v of own) {
      const l = v.light?.colors[field];
      const d = v.dark?.colors[field];
      if (l || d) byVariant[v.id] = { ...(l ? { light: l } : {}), ...(d ? { dark: d } : {}) };
    }
    if (!light && !darkValue && Object.keys(byVariant).length === 0) continue;
    variables.set(name, { name, ...(light ? { light } : {}), ...(darkValue ? { dark: darkValue } : {}), ...(Object.keys(byVariant).length ? { variants: byVariant } : {}) });
    roleNames.add(name);
    // The default palette's light colours are the app's colours, as :root's are on the web; dark and variant ones aren't uses.
    if (light && defaultPair?.light) add("colors", light, where(defaultPair.light.file, defaultPair.light.at), colorContext(name));
  }

  // ---------- uses of colour properties: color: colors.text, backgroundColor: palette.background ----------
  const variableUses: Record<string, Record<string, number>> = {};
  if (fieldVar.size > 0) {
    const use = new RegExp(`(${IDENT})\\s*:\\s*[^,;{}\\n]*?\\.(${IDENT})(?![\\w$(])`, "g");
    for (const file of scripts) {
      const defs = definitions.get(file) ?? [];
      for (const m of file.masked.matchAll(use)) {
        const name = fieldVar.get(m[2]!);
        if (!name || inRanges(m.index!, defs)) continue;
        const context = colorContext(m[1]!);
        if (context === "other") continue;
        const uses = (variableUses[name] ??= {});
        uses[context] = (uses[context] ?? 0) + 1;
      }
    }
  }

  // ---------- sizes in the theme's own maps (spacing: { sm: 8 }) ----------
  const maps = (file: ScriptFile, obj: Obj) => {
    for (const e of obj.entries) {
      if (!isObj(e.value)) continue;
      const bucket = SIZE_MAPS.find(([re]) => re.test(e.key))?.[1];
      if (bucket) {
        for (const leaf of e.value.entries) {
          if (isObj(leaf.value) || !NUMBER.test(leaf.value.text)) continue;
          const px = Math.abs(Number(leaf.value.text));
          if (px > 0) add(bucket, `${px}px`, where(file, leaf.keyStart));
        }
      } else maps(file, e.value);
    }
  };
  for (const file of scripts) for (const root of file.roots) maps(file, root.obj);

  // ---------- what the styles and animations use ----------
  const fontNames = new Set<string>();
  /** Families loaded from the app's own font files, by name in lower case: with the files found, or how the code names them. */
  const ownFonts = new Map<string, ProjectFontEntry | UnfoundFontEntry>();
  /** Families loaded from @expo-google-fonts. */
  const googleFonts = new Set<string>();
  /** A file the app ships for a family: listed with its weight and style, or, when it isn't there, noted as `from`. */
  const shipped = (family: string, path: string | undefined, from: string, face: { weight: number; style: "normal" | "italic" }) => {
    const key = family.toLowerCase();
    const own = ownFonts.get(key);
    if (!path) {
      if (!own) ownFonts.set(key, { family, from });
      return;
    }
    const entry = own && "files" in own ? own : { family, files: [] };
    if (!entry.files.some((f) => f.path === path)) entry.files.push({ path, weight: face.weight, style: face.style });
    ownFonts.set(key, entry);
  };
  const byPath = new Map(scripts.map((f) => [f.source.path, f]));
  /** The families an object of fonts loads (its keys), each a sample once; those from require()d files are the app's own. */
  const loadedFonts = (file: ScriptFile, obj: Obj) => {
    for (const e of obj.entries) {
      const family = familyOf(e.key);
      if (family && !fontNames.has(family)) {
        fontNames.add(family);
        add("fontFamily", family, where(file, e.keyStart));
      }
      // A font loaded from a file the app ships ('Inter-Bold': require('../assets/fonts/Inter-Bold.ttf')) is its own.
      const required = "text" in e.value ? e.value.text.match(/^require\s*\(\s*(["'])([^"'\n]+\.(?:ttf|otf))\1\s*\)$/i)?.[2] : undefined;
      if (!family || !required) continue;
      shipped(family, shippedFont(file.source, required), `require("${required}")`, weightStyleOf(e.key));
    }
  };
  for (const file of scripts) {
    const defs = definitions.get(file) ?? [];
    const lines = [0];
    for (let i = 0; i < file.source.text.length; i++) if (file.source.text.charCodeAt(i) === 10) lines.push(i + 1);
    for (const hit of scanReactNative(file.source, null)) {
      const index = lines[hit.line - 1]! + hit.column - 1;
      if (inRanges(index, defs)) continue;
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
          add("fontFamily", familyOf(hit.value!), example);
          break;
        case "duration":
          add("duration", hit.value!, example);
          break;
        case "easing":
          if (/^cubic-bezier\(/.test(hit.value!)) add("easing", hit.value!, example);
          else if (hit.value === "Easing.ease") add("easing", EASE, example);
          break;
      }
    }

    // Fonts: useFonts({ Onest_400Regular, 'Inter-Bold': require(…) }) or Font.loadAsync({ … }), the object written in
    // the call or passed by name (useFonts(fontAssets), followed to its object literal in this file or an app module it
    // imports), and @expo-google-fonts/* imports.
    for (const m of file.masked.matchAll(FONT_LOAD)) {
      const found = m[1] ? objectNamed(file, m[1], byPath) : { file, obj: parseObject(file.masked, file.source.text, m.index! + m[0].length) };
      if (found) loadedFonts(found.file, found.obj);
    }
    for (const m of file.source.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@expo-google-fonts\/[\w-]+["']/g)) {
      for (const name of m[1]!.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!.trim()).filter((s) => /^[A-Z]/.test(s))) {
        const family = familyOf(name);
        googleFonts.add(family);
        if (!fontNames.has(family)) {
          fontNames.add(family);
          add("fontFamily", family, where(file, m.index!));
        }
      }
    }
  }
  // Fonts expo-font's config plugin embeds in the app ("plugins": [["expo-font", { "fonts": [...] }]]).
  for (const font of pluginFonts(files)) shipped(font.family, font.path, font.from, font);
  // The Arabic companion: a family the app loads, other than its main one, that a file testing for an Arabic-script
  // locale (locale === "ar" ? … : …) or for right to left names (as "ThmanyahSans-Bold", say).
  const families = sortedSamples(buckets.fontFamily).filter((f) => !isMonospace(f.value) && !/^(?:system-ui|sans-serif|serif|monospace)$/i.test(f.value));
  const main = families[0]?.value.toLowerCase();
  const inArabicCheck = new Set<string>();
  for (const file of scripts) {
    const text = maskComments(file.source.text, "script");
    if (!ARABIC_CHECK.test(text)) continue;
    for (const m of text.matchAll(/(["'`])([^"'`\n]+)\1/g)) inArabicCheck.add(familyOf(m[2]!.trim()).toLowerCase());
  }
  const companion = families.find((f) => f.value.toLowerCase() !== main && fontNames.has(f.value) && inArabicCheck.has(f.value.toLowerCase()))?.value;
  const projectFonts = [...ownFonts.values()].filter((f): f is ProjectFontEntry => "files" in f);
  const unfoundFonts = [...ownFonts.values()].filter((f): f is UnfoundFontEntry => "from" in f);

  return {
    colors: sortedSamples(buckets.colors), space: sortedSamples(buckets.space), radius: sortedSamples(buckets.radius), fontSize: sortedSamples(buckets.fontSize),
    fontFamily: sortedSamples(buckets.fontFamily), duration: sortedSamples(buckets.duration), easing: sortedSamples(buckets.easing), unresolved: [],
    variables: [...variables.values()],
    aliases: {},
    roleNames: [...roleNames],
    variableUses,
    followVariables: true,
    source: "script",
    ...(Object.keys(variantLabels).length ? { variantLabels } : {}),
    ...(notes.length ? { notes } : {}),
    ...(companion ? { companion } : {}),
    ...(projectFonts.length ? { projectFonts } : {}),
    ...(googleFonts.size ? { googleFonts: [...googleFonts] } : {}),
    ...(unfoundFonts.length ? { unfoundFonts } : {}),
  };
}
