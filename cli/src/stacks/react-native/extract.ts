// motif extract for React Native: a draft design guide from an Expo app's code — the colour objects with light and dark
// halves (the starter's constants/Colors.ts), parallel ones as design variants, and the values its styles and animations use.
import type { SourceFile } from "../../check/files";
import { inRanges, maskComments } from "../../check/mask";
import { colorContext } from "../../check/rules/colors";
import { parseColor, type Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { locator } from "../../text";
import { GENERIC_WORDS, kebab, pairInstances, title, words, type Paired } from "../flutter/extract";
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

    // Fonts: useFonts({ Onest_400Regular, 'Inter-Bold': require(…) }) and @expo-google-fonts/* imports.
    for (const m of file.masked.matchAll(/(?<![\w$.])useFonts\s*\(\s*(?=\{)/g)) {
      const obj = parseObject(file.masked, file.source.text, m.index! + m[0].length);
      for (const e of obj.entries) {
        const family = familyOf(e.key);
        if (family && !fontNames.has(family)) {
          fontNames.add(family);
          add("fontFamily", family, where(file, e.keyStart));
        }
      }
    }
    for (const m of file.source.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@expo-google-fonts\/[\w-]+["']/g)) {
      for (const name of m[1]!.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!.trim()).filter((s) => /^[A-Z]/.test(s))) {
        const family = familyOf(name);
        if (!fontNames.has(family)) {
          fontNames.add(family);
          add("fontFamily", family, where(file, m.index!));
        }
      }
    }
  }

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
  };
}
