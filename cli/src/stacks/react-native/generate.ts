// React Native theme code: one TypeScript file with the guide's colours (every variant, light and dark), sizes, type,
// motion, the fonts for expo-font, and a provider and hook.
import { springPhysics } from "../../contract/spring";
import type { DtcgColor } from "../../contract/values";
import { num } from "../../generate/css-values";
import { TS_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme, ThemeFont, ThemeSet, ThemeShadowLayer } from "../../generate/theme";
import { stackFamilies, themeFonts } from "../../generate/theme-fonts";
import { googlePackage } from "./fonts";

export const THEME_FILE = "motif-theme.tsx";

export interface RnProjectFont {
  family: string;
  weight: number;
  style: string;
  /** The path to require, from the theme file to the font file. */
  asset: string;
}

export interface RnOptions {
  /** Google families whose @expo-google-fonts package the app lists, with the package's name. */
  googlePackages: Map<string, string>;
  /** The .ttf and .otf files of the guide's project fonts, where the app has them. */
  projectFonts: RnProjectFont[];
  /** The face names (Onest_400Regular) each installed package exports, to pick the nearest weight; unknown means every weight exists. */
  faces?: Map<string, Set<string>>;
  /** Packages the app lists but Node can't find: only their regular face, which every package ships, is used. */
  unresolved?: Set<string>;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** A property name as TypeScript writes it: bare when it can be, quoted otherwise. */
export const objKey = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));
const str = (s: string) => JSON.stringify(s);

/**
 * A role name as a camelCase property: words joined (on-action-primary → onActionPrimary), "p" for a point between
 * digits (0-5 → 0p5), a letter in front of a leading digit.
 */
export function member(name: string, lead: string, taken: Set<string> = new Set()): string {
  const words = name.replace(/(\d)[-_](?=\d)/g, "$1p").split(/[^A-Za-z0-9]+/).filter(Boolean);
  let id = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
  if (id === "" || /^[0-9]/.test(id)) id = `${lead}${id}`;
  let unique = id;
  while (taken.has(unique)) unique = `${unique}Value`;
  taken.add(unique);
  return unique;
}

function hexOf(c: DtcgColor): string {
  return (c.hex ?? "#000000").toLowerCase();
}

/** `#rrggbb`, or `rgba(r, g, b, a)` when the colour has alpha. */
export function rnColor(c: DtcgColor): string {
  const alpha = c.alpha ?? 1;
  if (alpha >= 1) return hexOf(c);
  const h = hexOf(c).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${num(alpha)})`;
}

function boxShadow(layers: ThemeShadowLayer[]): string {
  if (layers.length === 0) return "{ boxShadow: [] }";
  const text = layers
    .map((l) => `${l.inset ? "inset " : ""}${num(l.x)}px ${num(l.y)}px ${num(l.blur)}px${l.spread !== 0 ? ` ${num(l.spread)}px` : ""} ${rnColor(l.color)}`)
    .join(", ");
  return `{ boxShadow: ${str(text)} }`;
}

/** Letter spacing in pixels, from the guide's px or rem value. */
function letterSpacing(css: string | undefined): number | null {
  const m = css?.match(/^(-?[\d.]+)(px|rem)$/);
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
}

const roundWeight = (w: number) => Math.min(900, Math.max(100, Math.round(w / 100) * 100));

/** The weight closest to `want` (ties go to the lighter one). */
function nearest(want: number, have: number[]): number {
  return have.reduce((best, w) => {
    const d = Math.abs(w - want) - Math.abs(best - want);
    return d < 0 || (d === 0 && w < best) ? w : best;
  });
}

type Face =
  | { kind: "face"; key: string; google?: { pkg: string }; require?: string; weight: number }
  | { kind: "plain"; family: string; note?: string };

const lookup = <T>(map: Map<string, T>, family: string): T | undefined => {
  for (const [k, v] of map) if (k.toLowerCase() === family.toLowerCase()) return v;
  return undefined;
};

class Resolver {
  readonly sources: Map<string, string>;
  constructor(private readonly theme: Theme, private readonly opts: RnOptions) {
    this.sources = new Map(themeFonts(theme).map((f) => [f.family.toLowerCase(), f.source]));
  }

  /** The face a family has at a weight: a loaded one, or the system font with a note on how to get the real one. */
  face(family: string, weight: number): Face {
    const source = this.sources.get(family.toLowerCase());
    if (source === "project") {
      const files = this.opts.projectFonts.filter((f) => f.family.toLowerCase() === family.toLowerCase() && f.style !== "italic");
      if (files.length === 0) {
        return { kind: "plain", family, note: `${family}: add a .ttf or .otf of it to the guide's font files, then run motif tokens again. Until then it uses the system font.` };
      }
      const w = nearest(weight, files.map((f) => f.weight));
      return { kind: "face", key: `${family}_${w}`, require: files.find((f) => f.weight === w)!.asset, weight: w };
    }
    if (source === "google" || source === "bundled") {
      const pkg = lookup(this.opts.googlePackages, family);
      if (pkg === undefined) {
        const name = googlePackage(family);
        return { kind: "plain", family, note: `${family}: install ${name} (npx expo install expo-font ${name}), then run motif tokens again. Until then it uses the system font.` };
      }
      const prefix = family.replace(/[^A-Za-z0-9]/g, "");
      const exports = this.opts.faces?.get(pkg);
      const all = Object.keys(WEIGHT_NAMES).map(Number);
      const listed = exports ? all.filter((w) => exports.has(`${prefix}_${w}${WEIGHT_NAMES[w]}`)) : [];
      // A package that wasn't found, or whose file lists no face of this family, is not guessed at: only the regular face, which every package ships.
      const have = this.opts.unresolved?.has(pkg) || (exports && listed.length === 0) ? [400] : exports ? listed : all;
      const w = nearest(roundWeight(weight), have);
      return { kind: "face", key: `${prefix}_${w}${WEIGHT_NAMES[w]}`, google: { pkg }, weight: w };
    }
    // A system font (Arial, Georgia): its own name, with the weight.
    return { kind: "plain", family };
  }
}

interface Styled {
  role: string;
  line: string;
  note?: string;
}

function styleLine(font: ThemeFont, face: Face | null): { text: string; note?: string } {
  const spacing = letterSpacing(font.letterSpacing);
  const tail = spacing !== null ? [`letterSpacing: ${num(spacing)}`] : [];
  const size = [`fontSize: ${num(font.sizePx)}`, `lineHeight: ${num(font.lineHeight * font.sizePx)}`];
  if (face?.kind === "face") return { text: `{ ${[`fontFamily: ${str(face.key)}`, ...size, ...tail].join(", ")} }` };
  const family = face?.kind === "plain" ? [`fontFamily: ${str(face.family)}`] : [];
  const note = face?.kind === "plain" ? face.note : undefined;
  return { text: `{ ${[...(note ? [] : family), ...size, `fontWeight: ${str(String(roundWeight(font.weight)))}`, ...tail].join(", ")} }`, note };
}

/** An object whose lines are `key: value` pairs, with an optional comment line above any of them. */
function objectBlock(head: string, rows: { key: string; value: string; note?: string }[], tail = "};"): string[] {
  const seen = new Set<string>();
  return [
    head,
    ...rows.flatMap((r) => {
      const note = r.note && !seen.has(r.note) ? [`  // ${r.note}`] : [];
      if (r.note) seen.add(r.note);
      return [...note, `  ${r.key}: ${r.value},`];
    }),
    tail,
  ];
}

const IMPORTS_REACT = (variants: boolean) => `import { createContext, useContext, ${variants ? "useEffect, " : ""}useMemo, ${variants ? "useState, " : ""}type ReactNode } from "react";`;

/** React Native theme code for the guide. The file's path is relative to the app's theme folder. */
export function generateReactNative(set: ThemeSet, opts: RnOptions): GeneratedFile[] {
  const t = set.base;
  const variants = set.variants.length > 0;
  const resolver = new Resolver(t, opts);

  // Type roles: the main face, and a companion's face for roles that have one.
  const roleKeys = new Set<string>();
  const roles = t.fonts.map((font) => ({ font, key: member(font.name, "t", roleKeys), families: stackFamilies(font.family) }));
  const used = new Map<string, Face & { kind: "face" }>();
  const note = (face: Face) => {
    if (face.kind === "face") used.set(face.key, face);
  };
  const rows = (pick: (r: (typeof roles)[number]) => string | undefined): Styled[] =>
    roles.flatMap((r) => {
      const family = pick(r);
      const face = family === undefined ? null : resolver.face(family, r.font.weight);
      if (family !== undefined && face) note(face);
      const style = styleLine(r.font, face);
      return [{ role: r.key, line: style.text, note: style.note }];
    });
  const main = rows((r) => r.families[0]);
  const companions = roles.filter((r) => r.families.length > 1);
  const arabic = companions.length > 0
    ? roles.flatMap((r) => {
        if (r.families.length < 2) return [];
        const face = resolver.face(r.families[1]!, r.font.weight);
        note(face);
        const style = styleLine(r.font, face);
        return [{ role: r.key, line: style.text, note: style.note }];
      })
    : [];

  // Fonts for useFonts, grouped by package.
  const googleFaces = [...used.values()].filter((f) => f.google);
  const packages = [...new Set(googleFaces.map((f) => f.google!.pkg))];
  const faceName = (f: Face & { kind: "face" }) => f.key;
  const sortedGoogle = packages.flatMap((pkg) => googleFaces.filter((f) => f.google!.pkg === pkg).sort((a, b) => a.weight - b.weight));
  const projectFaces = [...used.values()].filter((f) => f.require !== undefined).sort((a, b) => a.key.localeCompare(b.key));
  const fontRows = [
    ...sortedGoogle.map((f) => `  ${faceName(f)},`),
    ...projectFaces.map((f) => `  ${str(f.key)}: require(${str(f.require!)}),`),
  ];

  const reactNative = ["I18nManager", ...(variants || arabic.length > 0 ? ["Platform"] : []), "useColorScheme", "type TextStyle"].filter((n) => n !== "I18nManager" || arabic.length > 0);

  const lines: string[] = [
    TS_HEADER,
    "",
    IMPORTS_REACT(variants),
    `import { ${reactNative.join(", ")} } from "react-native";`,
    'import { Easing, useReducedMotion } from "react-native-reanimated";',
    ...packages.map((pkg) => `import { ${sortedGoogle.filter((f) => f.google!.pkg === pkg).map(faceName).join(", ")} } from ${str(pkg)};`),
    "",
  ];

  const ids = variants ? [set.defaultId!, ...set.variants.map((v) => v.id)] : [];
  if (variants) {
    lines.push(
      "/** The guide's design variants. The default comes first. */",
      `export type MotifVariant = ${ids.map(str).join(" | ")};`,
      `export const motifVariants: readonly MotifVariant[] = [${ids.map(str).join(", ")}];`,
      "",
    );
  }

  // Colours
  const colorKeys = new Set<string>();
  const roleNames = t.colors.map((c) => ({ name: c.name, key: member(c.name, "c", colorKeys) }));
  lines.push(
    "/** The guide's colour roles. */",
    "export type MotifColors = {",
    ...roleNames.map((r) => `  ${r.key}: string;`),
    "};",
    "",
  );
  const colorSet = (theme: Theme, mode: "light" | "dark", indent: string): string[] => {
    const byName = new Map(theme.colors.map((c) => [c.name, c]));
    return t.colors.map((c, i) => `${indent}${roleNames[i]!.key}: ${str(rnColor((byName.get(c.name) ?? c)[mode]))},`);
  };
  const modes = (theme: Theme, indent: string): string[] =>
    (["light", "dark"] as const).flatMap((mode) => [`${indent}${mode}: {`, ...colorSet(theme, mode, `${indent}  `), `${indent}},`]);
  if (variants) {
    lines.push(
      "/** The colours of each variant, light and dark. */",
      "export const motifColors: Record<MotifVariant, { light: MotifColors; dark: MotifColors }> = {",
      `  ${objKey(set.defaultId!)}: {`,
      ...modes(t, "    "),
      "  },",
      ...set.variants.flatMap((v) => [`  ${objKey(v.id)}: {`, ...modes(v.theme, "    "), "  },"]),
      "};",
    );
  } else {
    lines.push("/** The colours, light and dark. */", "export const motifColors: { light: MotifColors; dark: MotifColors } = {", ...modes(t, "  "), "};");
  }

  // Sizes, shadows and motion
  const sizeKeys = (items: { name: string; px: number }[], lead: string) => {
    const taken = new Set<string>();
    return items.map((i) => ({ key: member(i.name, lead, taken), value: num(i.px) }));
  };
  lines.push("", "/** Spacing, in pixels. */", ...objectBlock("export const space = {", sizeKeys(t.space, "s"), "} as const;"));
  lines.push("", "/** Corner radii, in pixels. */", ...objectBlock("export const radius = {", sizeKeys(t.radius, "r"), "} as const;"));
  {
    const taken = new Set<string>();
    lines.push(
      "",
      "/** Shadows, for a style's boxShadow (React Native 0.76 and later, on the New Architecture). */",
      ...objectBlock("export const shadow = {", t.shadows.map((s) => ({ key: member(s.name, "s", taken), value: boxShadow(s.layers) }))),
    );
  }
  {
    const taken = new Set<string>();
    lines.push("", "/** Durations, in milliseconds. */", ...objectBlock("export const duration = {", t.durations.map((d) => ({ key: member(d.name, "d", taken), value: num(d.ms) }))));
  }
  {
    const taken = new Set<string>();
    lines.push(
      "",
      "/** Easing curves, for Reanimated's withTiming. */",
      ...objectBlock("export const easing = {", t.easings.map((e) => ({ key: member(e.name, "e", taken), value: `Easing.bezier(${e.points.map(num).join(", ")})` }))),
    );
  }
  {
    const taken = new Set<string>();
    lines.push(
      "",
      "/** Springs, for Reanimated's withSpring. */",
      ...objectBlock(
        "export const spring = {",
        t.springs.map((s) => {
          const p = springPhysics(s);
          return { key: member(s.name, "s", taken), value: `{ mass: 1, stiffness: ${p.stiffness.toFixed(2)}, damping: ${p.damping.toFixed(2)} }` };
        }),
      ),
    );
  }

  // Type
  lines.push(
    "",
    "/** One of the guide's type roles, as a style's text properties. */",
    "export type MotifTextStyle = Pick<TextStyle, \"fontFamily\" | \"fontSize\" | \"lineHeight\" | \"fontWeight\" | \"letterSpacing\">;",
    `export type MotifTypeRole = ${roles.length > 0 ? roles.map((r) => str(r.key)).join(" | ") : "string"};`,
    "",
    "// A loaded font face is its own family on React Native, so a role names the face for its weight",
    "// (Onest_600SemiBold) and carries no fontWeight, because a fontWeight on top makes Android fall back to a system font.",
    "// A role whose font isn't loaded uses the system font, with its fontWeight.",
    ...objectBlock("export const type: Record<MotifTypeRole, MotifTextStyle> = {", main.map((m) => ({ key: m.role, value: m.line, note: m.note }))),
  );
  if (arabic.length > 0) {
    lines.push(
      "",
      "/** The roles whose font list has a companion (an Arabic font), drawn in it. Used for right-to-left layouts and Arabic-script languages. */",
      ...objectBlock("export const typeArabic: Partial<Record<MotifTypeRole, MotifTextStyle>> = {", arabic.map((m) => ({ key: m.role, value: m.line, note: m.note }))),
    );
  }

  // Fonts
  lines.push(
    "",
    "/** The fonts to load before the first screen: useFonts(motifFonts) from expo-font. */",
    ...(fontRows.length > 0
      ? ["export const motifFonts: Record<string, number | string> = {", ...fontRows, "};"]
      : ["export const motifFonts: Record<string, number | string> = {};"]),
  );

  // Provider and hook
  const value = [
    "export type MotifThemeValue = {",
    "  colors: MotifColors;",
    "  type: typeof type;",
    "  dark: boolean;",
    ...(variants ? ["  variant: MotifVariant;"] : []),
    "  reducedMotion: boolean;",
    "};",
  ];
  lines.push("", ...value, "", "const MotifContext = createContext<MotifThemeValue | null>(null);");

  if (arabic.length > 0) {
    lines.push(
      "",
      'const RTL_LANGUAGES = ["ar", "fa", "ur", "ps", "ckb", "sd", "ug"];',
      "const arabicType: typeof type = { ...type, ...typeArabic };",
      "",
      "const isRtlLanguage = (tag: string) => RTL_LANGUAGES.includes(tag.split(\"-\")[0]!.toLowerCase());",
      "",
      "function readsRtl(): boolean {",
      "  if (I18nManager.isRTL) return true;",
      "  // react-native-web has no I18nManager.isRTL: a right-to-left page says so on <html>.",
      '  if (Platform.OS === "web" && typeof document !== "undefined") {',
      "    const root = document.documentElement;",
      '    if (root.dir === "rtl" || isRtlLanguage(root.lang)) return true;',
      "  }",
      "  try {",
      "    return isRtlLanguage(Intl.DateTimeFormat().resolvedOptions().locale);",
      "  } catch {",
      "    return false;",
      "  }",
      "}",
    );
  }
  if (variants) {
    lines.push(
      "",
      "/** On the web, a data-variant on the page (Motif's screenshots set it) names the variant. */",
      "function readWebVariant(): MotifVariant | null {",
      '  if (Platform.OS === "web" && typeof document !== "undefined") {',
      "    const id = document.documentElement.dataset.variant;",
      "    if (id !== undefined && (motifVariants as readonly string[]).includes(id)) return id as MotifVariant;",
      "  }",
      "  return null;",
      "}",
      "",
      "function useWebVariant(): MotifVariant | null {",
      "  const [id, setId] = useState(readWebVariant);",
      "  useEffect(() => {",
      '    if (Platform.OS !== "web" || typeof MutationObserver === "undefined") return;',
      "    const watch = new MutationObserver(() => setId(readWebVariant()));",
      '    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-variant"] });',
      "    setId(readWebVariant());",
      "    return () => watch.disconnect();",
      "  }, []);",
      "  return id;",
      "}",
    );
  }
  lines.push(
    "",
    variants
      ? "export function MotifProvider({ variant, children }: { variant?: MotifVariant; children: ReactNode }) {"
      : "export function MotifProvider({ children }: { children: ReactNode }) {",
    '  const dark = useColorScheme() === "dark";',
    "  const reducedMotion = useReducedMotion();",
    ...(variants ? ["  const webVariant = useWebVariant();", "  const active = webVariant ?? variant ?? motifVariants[0]!;"] : []),
    ...(arabic.length > 0 ? ["  const rtl = readsRtl();"] : []),
    "  const value = useMemo<MotifThemeValue>(",
    "    () => ({",
    `      colors: ${variants ? 'motifColors[active][dark ? "dark" : "light"]' : 'motifColors[dark ? "dark" : "light"]'},`,
    `      type: ${arabic.length > 0 ? "rtl ? arabicType : type" : "type"},`,
    "      dark,",
    ...(variants ? ["      variant: active,"] : []),
    "      reducedMotion,",
    "    }),",
    `    [${[...(variants ? ["active"] : []), "dark", ...(arabic.length > 0 ? ["rtl"] : []), "reducedMotion"].join(", ")}],`,
    "  );",
    "  return <MotifContext.Provider value={value}>{children}</MotifContext.Provider>;",
    "}",
    "",
    "/** The colours, type and settings for the current scheme, variant and language. */",
    "export function useMotifTheme(): MotifThemeValue {",
    "  const value = useContext(MotifContext);",
    "  if (value === null) {",
    '    throw new Error("useMotifTheme needs <MotifProvider> above it. Wrap your root layout in <MotifProvider>.");',
    "  }",
    "  return value;",
    "}",
    "",
  );
  return [{ path: THEME_FILE, content: lines.join("\n") }];
}
