// motif extract for SwiftUI: a draft design guide from an app's colours and the values its views use. The colours come from
// its asset catalogues (each colour set's light and dark appearances; parallel sets become design variants) and from
// `extension Color { static let … }` constants; sizes, fonts and motion come from the values its views type.
import type { SourceFile } from "../../check/files";
import { callArgs } from "../../check/calls";
import { inRanges, maskComments, maskStrings } from "../../check/mask";
import { colorContext as nameContext } from "../../check/rules/colors";
import type { Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { axisWeightRanges, rootOf } from "../../extract/own-fonts";
import { PLATFORM_LATIN } from "../../generate/theme-fonts";
import { bundledCoverage } from "../../preview/font-list";
import { locator } from "../../text";
import { kebab as dartKebab, pairInstances, title, type Paired } from "../flutter/extract";
import { appFontFiles, fontKey, isSystemFamily, type FontFile } from "./font-files";
import { CUSTOM_FONT, scanSwift } from "./rules";

const MAX_EXAMPLES = 5;
const IDENT = "[A-Za-z_][\\w]*";
const NUMBER = /^-?\d[\d_]*(?:\.\d[\d_]*)?$/;
/** `static let standardPadding: CGFloat = 14` (CGFloat, Double, Float or no type), a plain number and nothing after it. */
const SIZE_CONSTANT = new RegExp(`(?<![\\w$.])static\\s+(?:let|var)\\s+(${IDENT})\\s*(?::\\s*(?:CGFloat|Double|Float)\\s*)?=\\s*(-?\\d[\\d_]*(?:\\.\\d[\\d_]*)?)(?=[ \\t]*(?:[;}\\r\\n]|$))`, "g");
const SHOWN_CONSTANTS = 5;
const SPACE_WORDS = new Set(["padding", "paddings", "spacing", "inset", "insets", "gap", "gaps", "margin", "margins"]);
const RADIUS_WORDS = new Set(["radius", "radii", "corner", "corners"]);
/** Words that make a size word something else: shadowRadius, blurRadius, paddingMultiplier, spacingRatio. */
const NOT_SIZE_WORDS = new Set([
  "shadow", "shadows", "blur", "multiplier", "ratio", "factor", "scale", "count", "opacity", "alpha", "duration", "delay",
]);

/** A Swift name's words, lower case: standardPadding, HPadding, padding8, VSpacing_large, UIInsetTop. */
const nameWords = (name: string) =>
  name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)|(\d)([A-Za-z])/g, (_, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

/** Which samples a size constant's name puts it in: a corner (cornerRadius), a spacing (standardPadding), or none. */
function sizeBucket(name: string): "radius" | "space" | undefined {
  const words = nameWords(name);
  if (words.some((w) => NOT_SIZE_WORDS.has(w))) return undefined;
  if (words.some((w) => RADIUS_WORDS.has(w))) return "radius";
  if (words.some((w) => SPACE_WORDS.has(w))) return "space";
  return undefined;
}
const sortedSamples = (m: Map<string, Sample>) => [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/** A Swift or asset name in kebab case: AccentColor → accent-color, Purple80 → purple-80. */
const kebab = (name: string) => dartKebab(name.replace(/[\s.]+/g, "_")).replace(/([a-z])(\d)/g, "$1-$2");

/** Words in a catalogue's or folder's name that say nothing about which set it is (PartnerAssets, Colors). */
const GENERIC_WORDS = new Set(["assets", "asset", "catalog", "catalogue", "color", "colors", "colour", "colours", "resources", "theme", "palette"]);

/** SwiftUI's named curves as the cubic Béziers they are. */
const EASINGS: Record<string, number[]> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
};

/** One colour's channel from a colour set: "0.200" (0-1), "51" (0-255) or "0x33" (hex), as a fraction (not yet clamped). Alpha 0 and 1 are fractions. */
function channel(raw: unknown, alpha = false): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? (raw >= -1 && raw <= 1 ? raw : raw / 255) : undefined;
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  const sign = s.startsWith("-") ? -1 : 1;
  const body = s.replace(/^[-+]/, "");
  if (/^0x[0-9a-f]{1,2}$/i.test(body)) return (sign * parseInt(body, 16)) / 255;
  if (/^\d+$/.test(body)) {
    const n = Number(body);
    return sign * (alpha && n <= 1 ? n : n / 255);
  }
  if (/^\d*\.\d+$/.test(body)) return sign * Number(body);
  return undefined;
}

/** A colour set's colour as a hex string (#rrggbb, or #rrggbbaa when see-through), the space it is written in, and whether a value had to be clamped to 0-1. */
function hexOfColor(color: any): { hex: string; space: string; clamped: boolean } | undefined {
  const c = color?.components;
  if (!c || typeof c !== "object") return undefined;
  const space = String(color["color-space"] ?? "srgb").toLowerCase();
  const grey = c.white !== undefined;
  const rgb = grey ? [channel(c.white), channel(c.white), channel(c.white)] : [channel(c.red), channel(c.green), channel(c.blue)];
  if (rgb.some((v) => v === undefined)) return undefined;
  const a = c.alpha === undefined ? 1 : channel(c.alpha, true);
  if (a === undefined) return undefined;
  const all = [...rgb, a] as number[];
  const clamped = all.some((v) => v < 0 || v > 1);
  const two = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return { hex: `#${rgb.map((v) => two(v!)).join("")}${a < 1 ? two(a) : ""}`, space, clamped };
}

interface Entry {
  /** The colour's name without namespace: Primary. */
  name: string;
  /** Which set it belongs to: the catalogue's and namespace folders' words, kebab case ("" for a plain colour set). */
  key: string;
  path: string;
  light?: string;
  dark?: string;
  /** The name as the catalogue shows it, with the namespace folders that prefix it: Men/Primary. */
  shown: string;
  /** Written in Display P3 or in linear sRGB, whose numbers are read as sRGB. */
  p3: boolean;
  linear: boolean;
  /** A value outside 0 to 1 (extended sRGB) was clamped. */
  clamped: boolean;
}

/** A colour set that names one of the system's colours (Xcode's "System Indigo"), which has no value to read. */
interface SystemColour {
  name: string;
  shown: string;
  reference: string;
}

/**
 * The colour sets of every asset catalogue the files hold, with the namespaces their folders provide, and (in `system`)
 * the sets that are only a system colour.
 */
function readCatalogues(files: SourceFile[], system: SystemColour[] = []): Entry[] {
  const json = new Map<string, any>();
  for (const f of files) {
    if (f.lang !== "json" || !/\.xcassets\//.test(f.path)) continue;
    try {
      json.set(f.path, JSON.parse(f.text));
    } catch {
      // A Contents.json that isn't JSON says nothing.
    }
  }
  const entries: Entry[] = [];
  for (const [path, contents] of json) {
    const parts = path.split("/");
    const folder = parts[parts.length - 2]!;
    if (!folder.endsWith(".colorset")) continue;
    const catalogue = parts.findIndex((s) => s.endsWith(".xcassets"));
    if (catalogue < 0) continue;
    const keyWords = kebab(parts[catalogue]!.replace(/\.xcassets$/, "")).split("-").filter((w) => w && !GENERIC_WORDS.has(w));
    // A folder prefixes its colours' names only when it says so (provides-namespace).
    const shown: string[] = [];
    for (let i = catalogue + 1; i < parts.length - 2; i++) {
      const own = json.get([...parts.slice(0, i + 1), "Contents.json"].join("/"));
      if (own?.properties?.["provides-namespace"] === true) {
        keyWords.push(...kebab(parts[i]!).split("-").filter(Boolean));
        shown.push(parts[i]!);
      }
    }
    const given: any[] = Array.isArray(contents?.colors) ? contents.colors : [];
    // Universal entries first; high-contrast and other appearances are not the plain colours.
    const ranked = [...given].sort((a, b) => Number(b?.idiom === "universal") - Number(a?.idiom === "universal"));
    const appearance = (e: any) => (Array.isArray(e?.appearances) ? e.appearances : []) as { appearance?: string; value?: string }[];
    const plain = (e: any) => appearance(e).every((a) => a.appearance === "luminosity");
    // Xcode's "Any, Light, Dark" writes the Any entry (no appearances) before the explicit Light one; iOS shows the Light one.
    const modeOf = (e: any) => (appearance(e).length === 0 ? "any" : appearance(e).some((a) => a.value === "dark") ? "dark" : "light");
    const read = (...modes: string[]) => {
      for (const mode of modes) {
        const e = ranked.find((x) => plain(x) && modeOf(x) === mode && hexOfColor(x?.color));
        if (e) return hexOfColor(e.color);
      }
      return undefined;
    };
    const light = read("light", "any");
    const dark = read("dark");
    const name = folder.replace(/\.colorset$/, "");
    if (!light && !dark) {
      const reference = ranked.map((e) => e?.color?.reference).find((r): r is string => typeof r === "string" && r !== "");
      if (reference) system.push({ name, shown: [...shown, name].join("/"), reference });
      continue;
    }
    entries.push({
      name,
      shown: [...shown, name].join("/"),
      key: keyWords.join("-"),
      path,
      ...(light ? { light: light.hex } : {}),
      ...(dark ? { dark: dark.hex } : {}),
      p3: [light, dark].some((c) => c?.space === "display-p3"),
      linear: [light, dark].some((c) => c?.space === "extended-linear-srgb"),
      clamped: [light, dark].some((c) => c?.clamped),
    });
  }
  return entries;
}

interface Instance extends Paired {
  at: string;
  colors: Record<string, string>;
}

interface SwiftFile {
  source: SourceFile;
  /** Comments and string contents blanked, at the file's own positions. */
  code: string;
  lineOf: (index: number) => number;
  colorAt: Map<number, string>;
  hits: ReturnType<typeof scanSwift>;
  hitIndex: (hit: { line: number; column: number }) => number;
}

function readFile(source: SourceFile): SwiftFile {
  const code = maskStrings(maskComments(source.text, "swift"), "swift");
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const hitIndex = (hit: { line: number; column: number }) => starts[hit.line - 1]! + hit.column - 1;
  const at = locator(code);
  const hits = scanSwift(source, null);
  const colorAt = new Map<number, string>();
  for (const h of hits) if (h.kind === "color" && h.value) colorAt.set(hitIndex(h), h.value);
  return { source, code, lineOf: (i) => at(i).line, colorAt, hits, hitIndex };
}

/**
 * What a SwiftUI app says about its design: its asset catalogue colour sets as colour variables (the plain sets as light and
 * dark, a namespace or catalogue that repeats the same names as a design variant), its Color constants, and the sizes,
 * fonts and motion its views use.
 */
export function collectSwiftUI(files: SourceFile[]): Occurrences {
  const swift = files.filter((f) => f.lang === "swift").map(readFile);
  // The font files the app ships, and the family each Font.custom name finds among them (its family, full or PostScript
  // name, or its file's name): SwiftUI can't load a font from Google, so a family the app draws is one it ships.
  const root = swift.length ? rootOf(swift[0]!.source) : null;
  const fontFiles = root === null ? [] : appFontFiles(root);
  const shippedFamily = (name: string) => fontFiles.find((f) => f.keys.has(fontKey(name)))?.family;
  /** Each family name the code writes (Font.custom, UIFont(name:)), with the call it is written in. */
  const written = new Map<string, string>();
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
  /** Code that defines a colour (a constant): its literal isn't a use. */
  const definitions = new Map<SwiftFile, [number, number][]>();
  const notes: string[] = [];
  const variables = new Map<string, Variable>();
  const roleNames = new Set<string>();
  const variantLabels: Record<string, string> = {};

  // ---------- asset catalogue colour sets ----------
  const system: SystemColour[] = [];
  const entries = readCatalogues(files, system);
  if (system.length === 1) {
    const [s] = system as [SystemColour];
    const role = s.name === "AccentColor" ? " (action-primary, for the accent colour)" : "";
    notes.push(`${s.shown} is the system colour ${s.reference}, which has no value in the catalogue to read, so the draft leaves it out: give its role${role} a value yourself.`);
  } else if (system.length > 1) {
    const what = system.map((s) => `${s.shown} is the system colour ${s.reference}`).join("; ");
    notes.push(`${what}. System colours have no value in the catalogue to read, so the draft leaves them out: give their roles values yourself.`);
  }
  const keysOf = new Map<string, Set<string>>();
  for (const e of entries) keysOf.set(e.name, (keysOf.get(e.name) ?? new Set()).add(e.key));
  const parallel = new Set<string>();
  for (const e of entries) if (e.key !== "" && (keysOf.get(e.name)?.size ?? 0) > 1) parallel.add(e.key);
  const anyDark = entries.some((e) => e.dark);
  // A set whose names nothing else repeats just prefixes its colours' names; it is not a variant.
  const placed = entries.map((e) => (e.key === "" || parallel.has(e.key) ? { ...e, field: kebab(e.name) } : { ...e, key: "", field: `${e.key}-${kebab(e.name)}` }));
  const groups = new Map<string, typeof placed>();
  for (const e of placed) groups.set(e.key, [...(groups.get(e.key) ?? []), e]);
  const instances: Instance[] = [];
  const fieldNames = new Set<string>();
  for (const [key, group] of groups) {
    const label = key.split("-").filter(Boolean).map(title).join(" ");
    const half = (dark: boolean): Instance | undefined => {
      const colors: Record<string, string> = {};
      for (const e of group) {
        const value = dark ? e.dark : e.light;
        if (value) colors[e.field] = value;
      }
      return dark && Object.keys(colors).length === 0
        ? undefined
        : { name: key ? `${label} colours` : "The colour sets", at: group[0]!.path, order: instances.length + (dark ? 0.5 : 0), colors, dark, key, label };
    };
    for (const i of [half(false), half(true)]) if (i) instances.push(i);
    for (const e of group) fieldNames.add(e.field);
  }
  const colourNote = (pick: (e: Entry) => boolean, what: string) => {
    const names = [...new Set(entries.filter(pick).map((e) => e.shown))];
    if (names.length > 0) notes.push(`${names.join(", ")} ${names.length === 1 ? "is" : "are"} ${what}`);
  };
  colourNote((e) => e.p3, "written in Display P3. The draft reads their numbers as sRGB, so check them.");
  colourNote((e) => e.linear, "written in extended linear sRGB. The draft reads their numbers as ordinary sRGB, so check them.");
  colourNote((e) => e.clamped, "written with a value outside 0 to 1 (extended sRGB). The draft clamps it to 0 or 1, so check it.");
  if (instances.length > 0) {
    const { defaultPair, variants, unpaired } = pairInstances(instances);
    if (defaultPair && !instances.some((i) => i.key === "" && (defaultPair.light === i || defaultPair.dark === i))) {
      const halves = [...new Set([defaultPair.light?.name, defaultPair.dark?.name].filter(Boolean))].join(" and ");
      notes.push(`No colour set sits outside a namespace or an extra catalogue, so ${halves} became the default.`);
    }
    for (const i of unpaired) {
      if (i.dark) notes.push(`${i.name} has dark appearances but no light colours, so the ${variants.find((v) => v.dark === i)?.label ?? i.label} variant sets dark-mode colours only.`);
      else if (anyDark) notes.push(`${i.name} has no dark appearance, so the ${variants.find((v) => v.light === i)?.label ?? i.label} variant keeps its light colours in dark mode.`);
    }
    for (const v of variants) variantLabels[v.id] ??= v.label;
    for (const field of fieldNames) {
      const name = `--${field}`;
      const light = defaultPair?.light?.colors[field];
      const dark = defaultPair?.dark?.colors[field];
      const own: Record<string, { light?: string; dark?: string }> = {};
      for (const v of variants) {
        const l = (v.light as Instance | undefined)?.colors[field];
        const d = (v.dark as Instance | undefined)?.colors[field];
        if (l || d) own[v.id] = { ...(l ? { light: l } : {}), ...(d ? { dark: d } : {}) };
      }
      if (!light && !dark && Object.keys(own).length === 0) continue;
      variables.set(name, { name, ...(light ? { light } : {}), ...(dark ? { dark } : {}), ...(Object.keys(own).length ? { variants: own } : {}) });
      roleNames.add(name);
      // The default set's light colours are the app's colours, as :root's are on the web; dark and variant ones aren't uses.
      if (light && defaultPair?.light) add("colors", light, `${defaultPair.light.at}:1`, nameContext(name));
    }
  }

  // ---------- Color constants: extension Color { static let brand = Color(red: …) } ----------
  const declared = new RegExp(`(?<![\\w$.])static\\s+(?:let|var)\\s+(${IDENT})\\s*(?::\\s*Color\\s*)?(?:=\\s*|\\{\\s*(?:return\\s+)?)`, "g");
  const constants: { name: string; value: string; at: string }[] = [];
  for (const file of swift) {
    for (const m of file.code.matchAll(declared)) {
      const end = m.index! + m[0].length;
      const value = file.colorAt.get(end);
      if (!value) continue;
      definitions.set(file, [...(definitions.get(file) ?? []), [m.index!, end + 1]]);
      if (!constants.some((c) => c.name === m[1])) constants.push({ name: m[1]!, value, at: `${file.source.path}:${file.lineOf(m.index!)}` });
    }
  }
  // A name a colour set already took is left to the colour set.
  // Like a default colour set, a constant is a role-name candidate with one sample: its uses (Color.brand) aren't traced.
  for (const c of constants) {
    const name = `--${kebab(c.name)}`;
    if (variables.has(name)) continue;
    variables.set(name, { name, light: c.value });
    roleNames.add(name);
    add("colors", c.value, c.at, nameContext(name));
  }

  // ---------- sizes kept in a constants type: struct Constants { static let standardPadding: CGFloat = 14 } ----------
  // Like a Color constant, each is one sample at its definition: its uses (Constants.standardPadding) aren't traced.
  const sizes: string[] = [];
  for (const file of swift) {
    for (const m of file.code.matchAll(SIZE_CONSTANT)) {
      const bucket = sizeBucket(m[1]!);
      if (!bucket) continue;
      add(bucket, `${Math.abs(Number(m[2]!.replace(/_/g, "")))}px`, `${file.source.path}:${file.lineOf(m.index!)}`);
      sizes.push(m[1]!);
    }
  }
  if (sizes.length > 0) {
    const shown = sizes.length > SHOWN_CONSTANTS ? `${sizes.slice(0, SHOWN_CONSTANTS).join(", ")} and ${sizes.length - SHOWN_CONSTANTS} more` : sizes.join(", ");
    notes.push(
      `${sizes.length === 1 ? "1 size is" : `${sizes.length} sizes are`} kept as named constants (${shown}), so each counts once, where it is defined: neither extract nor motif check sees where the views use them. Once the app uses Motif's theme, replace them with MotifSpace and MotifRadius roles.`,
    );
  }

  // ---------- what the views use ----------
  for (const file of swift) {
    const defs = definitions.get(file) ?? [];
    for (const hit of file.hits) {
      const index = file.hitIndex(hit);
      if (hit.kind === "color" && inRanges(index, defs)) continue;
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
        case "font-family": {
          const kit = /^(UIFont|NSFont)(?![\w$])/.exec(hit.text)?.[1];
          if (!written.has(hit.value!)) written.set(hit.value!, kit ? `${kit}(name: "${hit.value}")` : `Font.custom("${hit.value}")`);
          add("fontFamily", shippedFamily(hit.value!) ?? hit.value!, example);
          break;
        }
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
    // Font.custom("Inter", size: 22) gives a size as well as a family.
    for (const m of file.code.matchAll(CUSTOM_FONT)) {
      const call = callArgs(file.code, m.index! + m[0].length - 1, ":");
      const size = call?.args.find((a) => a.name === "size" && NUMBER.test(a.value));
      if (size) add("fontSize", `${Number(size.value.replace(/_/g, ""))}px`, `${file.source.path}:${file.lineOf(m.index!)}`);
    }
  }

  const { note: fontNote, ...fonts } = shippedFonts(fontFiles, written, shippedFamily);
  if (fontNote) notes.push(fontNote);
  // A variable font's axis is its weight range, read as every stack reads it.
  const fontWeightRanges = axisWeightRanges(root, fonts.projectFonts ?? []);
  return {
    colors: sortedSamples(buckets.colors), space: sortedSamples(buckets.space), radius: sortedSamples(buckets.radius), fontSize: sortedSamples(buckets.fontSize),
    fontFamily: sortedSamples(buckets.fontFamily), duration: sortedSamples(buckets.duration), easing: sortedSamples(buckets.easing), unresolved: [],
    variables: [...variables.values()],
    aliases: {},
    roleNames: [...roleNames],
    variableUses: {},
    followVariables: true,
    source: "swift",
    ...(Object.keys(variantLabels).length ? { variantLabels } : {}),
    ...(notes.length ? { notes } : {}),
    ...fonts,
    ...(fontWeightRanges.length ? { fontWeightRanges } : {}),
  };
}

/**
 * The fonts a SwiftUI app ships, for the draft: each family the code names whose files are in the app, with every file
 * of that family (a variable font's weight axis as a range), and an Arabic companion; and the names whose files Motif
 * didn't find, unless the system has them. The companion is a family the app ships that covers Arabic: one the code
 * names beside a family that doesn't, or, when the code names none, one the Info.plist registers (Qahwa's Readex Pro).
 * After the system font, a companion must be one Motif knows covers Arabic (bundledCoverage), as motif tokens reads the
 * guide: the contract can't yet mark a project font as Arabic. A registered one it doesn't know gets a note instead.
 */
function shippedFonts(files: FontFile[], written: Map<string, string>, shippedFamily: (name: string) => string | undefined): Pick<Occurrences, "projectFonts" | "unfoundFonts" | "companion" | "keptFonts"> & { note?: string } {
  const named = [...new Set([...written.keys()].flatMap((n) => shippedFamily(n) ?? []))];
  const ofFamily = (family: string) => files.filter((f) => fontKey(f.family) === fontKey(family));
  const covers = (family: string) => ofFamily(family).some((f) => f.arabic);
  const latin = [...written.keys()].some((n) => !covers(shippedFamily(n) ?? n));
  const registered = written.size === 0 ? files.find((f) => f.registered && f.arabic) : undefined;
  const known = registered !== undefined && bundledCoverage(registered.family) === "arabic";
  const companion = written.size === 0 ? (known ? registered.family : undefined) : latin ? named.find(covers) : undefined;
  const note =
    registered && !known
      ? `${registered.family} is registered in your app's Info.plist and covers Arabic, but Motif can only treat a font it knows as the Arabic companion after the system font, so no type role uses it yet; its files are in the guide's fonts list. To use it, name a Latin font first ("${PLATFORM_LATIN.swiftui}, ${registered.family}"); until a type role names it, motif validate warns that it isn't used.`
      : undefined;
  // A registered Arabic font Motif can't make the companion keeps its files in the guide's fonts list (keptFonts).
  const kept = registered && !known ? [registered.family] : [];
  const families = [...new Set([...named, ...(companion ? [companion] : []), ...kept])];
  const projectFonts = families.map((family) => ({ family, files: ofFamily(family).map((f) => ({ path: f.path, weight: f.weight, style: f.style })) }));
  const unfoundFonts = [...written].filter(([name]) => !shippedFamily(name) && !isSystemFamily(name)).map(([family, from]) => ({ family, from }));
  return {
    ...(projectFonts.length ? { projectFonts } : {}),
    ...(unfoundFonts.length ? { unfoundFonts } : {}),
    ...(companion ? { companion } : {}),
    ...(kept.length ? { keptFonts: kept } : {}),
    ...(note ? { note } : {}),
  };
}
