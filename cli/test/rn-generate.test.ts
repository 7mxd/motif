import { describe, expect, test } from "bun:test";
import { springPhysics } from "../src/contract/spring";
import { TS_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { generateReactNative } from "../src/stacks/react-native/generate";
import { docFrom, partnerTokens, validTokens, withCompanion } from "./helpers";

type Opts = Parameters<typeof generateReactNative>[1];
const INTER = new Map([["Inter", "@expo-google-fonts/inter"]]);

const tsFor = (tokens: any, opts: Partial<Opts> = {}) => {
  const files = generateReactNative(buildThemeSet(docFrom(tokens)), { googlePackages: INTER, projectFonts: [], ...opts });
  expect(files.map((f) => f.path)).toEqual(["motif-theme.tsx"]);
  return files[0]!.content;
};

describe("generateReactNative, the test guide (no variants)", () => {
  const ts = tsFor(validTokens());

  test("starts with Motif's header and imports what it uses", () => {
    expect(ts.startsWith(TS_HEADER + "\n")).toBe(true);
    expect(ts).toContain('import { Easing, useReducedMotion } from "react-native-reanimated";');
    expect(ts).toContain('import { useColorScheme, type TextStyle } from "react-native";');
  });

  test("colours: camelCase roles, light and dark, as hex", () => {
    expect(ts).toContain("export type MotifColors = {");
    expect(ts).toContain("  textPrimary: string;");
    expect(ts).toContain("  onActionPrimary: string;");
    expect(ts).toContain("export const motifColors: { light: MotifColors; dark: MotifColors } = {");
    expect(ts).toContain('    actionPrimary: "#4338ca",');
    expect(ts).toContain('    actionPrimary: "#818cf8",');
    expect(ts).not.toContain("motifVariants");
    expect(ts).not.toContain("MotifVariant");
  });

  test("a colour with alpha is rgba()", () => {
    const t = validTokens();
    t.color.border.$value = { colorSpace: "srgb", components: [1, 0, 0], alpha: 0.5, hex: "#FF0000" };
    expect(tsFor(t)).toContain('border: "rgba(255, 0, 0, 0.5)",');
  });

  test("sizes, shadows and motion", () => {
    expect(ts).toContain("export const space = {");
    expect(ts).toContain("  s0: 0,");
    expect(ts).toContain("  s4: 16,");
    expect(ts).toContain("} as const;");
    expect(ts).toContain("export const radius = {");
    expect(ts).toContain("  full: 9999,");
    expect(ts).toContain('  md: { boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)" },');
    expect(ts).toContain("export const duration = {");
    expect(ts).toContain("  fast: 120,");
    expect(ts).toContain("  standard: Easing.bezier(0.2, 0, 0, 1),");
    const p = springPhysics({ duration: 0.25, bounce: 0 });
    expect(ts).toContain(`  snappy: { mass: 1, stiffness: ${p.stiffness.toFixed(2)}, damping: ${p.damping.toFixed(2)} },`);
  });

  test("every shadow layer is kept, an inset one too", () => {
    const t = validTokens();
    const layer = (inset: boolean, y: number) => ({
      color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.2, hex: "#000000" },
      offsetX: { value: 0, unit: "px" },
      offsetY: { value: y, unit: "px" },
      blur: { value: 3, unit: "px" },
      spread: { value: 1, unit: "px" },
      ...(inset ? { inset: true } : {}),
    });
    t.shadow.sm.$value = [layer(false, 1), layer(true, 2)];
    expect(tsFor(t)).toContain('sm: { boxShadow: "0px 1px 3px 1px rgba(0, 0, 0, 0.2), inset 0px 2px 3px 1px rgba(0, 0, 0, 0.2)" },');
  });

  test("type: a loaded face per role, with no fontWeight, and a reason why", () => {
    expect(ts).toContain("export const type: Record<MotifTypeRole, MotifTextStyle> = {");
    expect(ts).toContain('  body: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 24 },');
    expect(ts).toContain('  heading: { fontFamily: "Inter_600SemiBold", fontSize: 20, lineHeight: 26 },');
    expect(ts).toContain('  display: { fontFamily: "Inter_700Bold", fontSize: 40, lineHeight: 44 },');
    expect(ts).not.toContain("fontWeight:");
    // Why: each weight is its own family on React Native, and a fontWeight on top makes Android fall back to a system font.
    expect(ts).toContain("fontWeight on top");
    expect(ts).not.toContain("typeArabic");
  });

  test("fonts for useFonts: the faces the roles use, imported from the package", () => {
    expect(ts).toContain(
      'import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";',
    );
    expect(ts).toContain("export const motifFonts: Record<string, number | string> = {");
    expect(ts).toContain("  Inter_600SemiBold,");
  });

  test("a provider and a hook", () => {
    expect(ts).toContain("export function MotifProvider({ children }: { children: ReactNode }) {");
    expect(ts).toContain("export function useMotifTheme(): MotifThemeValue {");
    expect(ts).toContain("useColorScheme()");
    expect(ts).toContain("useReducedMotion()");
    expect(ts).not.toContain("MutationObserver");
    expect(ts).toContain("export type MotifThemeValue = {\n  colors: MotifColors;\n  type: typeof type;\n  dark: boolean;\n  reducedMotion: boolean;\n};");
  });

  test("the whole file", () => {
    expect(ts).toMatchSnapshot();
  });
});

describe("generateReactNative, names", () => {
  test("a role named 0-5 becomes s0p5", () => {
    const t = validTokens();
    t.space["0-5"] = { $value: { value: 2, unit: "px" } };
    expect(tsFor(t)).toContain("  s0p5: 2,");
  });
});

describe("generateReactNative, two variants", () => {
  const ts = tsFor(partnerTokens());

  test("the variants, the default first", () => {
    expect(ts).toContain('export type MotifVariant = "default" | "partner";');
    expect(ts).toContain('export const motifVariants: readonly MotifVariant[] = ["default", "partner"];');
  });

  test("colours for each variant, light and dark", () => {
    expect(ts).toContain("export const motifColors: Record<MotifVariant, { light: MotifColors; dark: MotifColors }> = {");
    expect(ts).toContain("  default: {\n    light: {");
    expect(ts).toContain("  partner: {\n    light: {");
    expect(ts).toContain('surface: "#fff7ed",');
    expect(ts).toContain('surface: "#1c1917",');
  });

  test("the provider takes a variant; on the web a data-variant on the page wins", () => {
    expect(ts).toContain("export function MotifProvider({ variant, children }: { variant?: MotifVariant; children: ReactNode }) {");
    expect(ts).toContain("document.documentElement.dataset.variant");
    expect(ts).toContain("new MutationObserver(");
    expect(ts).toContain('Platform.OS === "web"');
    expect(ts).toContain("  variant: MotifVariant;");
  });

  test("a variant id is a quoted key when it isn't an identifier", () => {
    const t = partnerTokens();
    t.$extensions["dev.motif"].variants[1].id = "partner-store";
    const ext = t.color.surface.$extensions["dev.motif"];
    ext.variants = { "partner-store": ext.variants.partner };
    const out = tsFor(t);
    expect(out).toContain('export type MotifVariant = "default" | "partner-store";');
    expect(out).toContain('  "partner-store": {\n    light: {');
    expect(out).toContain("  default: {\n    light: {");
  });
});

describe("generateReactNative, a companion", () => {
  const opts = { googlePackages: new Map([["Onest", "@expo-google-fonts/onest"], ["Readex Pro", "@expo-google-fonts/readex-pro"]]) };
  const ts = tsFor(withCompanion(validTokens()), opts);

  test("the roles with a companion get Arabic styles in its face", () => {
    expect(ts).toContain("export const typeArabic: Partial<Record<MotifTypeRole, MotifTextStyle>> = {");
    expect(ts).toContain('  body: { fontFamily: "ReadexPro_400Regular", fontSize: 16, lineHeight: 24 },');
    expect(ts).toContain('  body: { fontFamily: "Onest_400Regular", fontSize: 16, lineHeight: 24 },');
    expect(ts).toContain('import { ReadexPro_400Regular');
    expect(ts).toContain('from "@expo-google-fonts/readex-pro";');
    expect(ts).toContain("  ReadexPro_400Regular,");
  });

  test("Arabic styles apply when the layout is right-to-left or the language is Arabic-script", () => {
    expect(ts).toContain("Intl.DateTimeFormat().resolvedOptions().locale");
    expect(ts).toContain("I18nManager.isRTL");
    // react-native-web has no I18nManager.isRTL: a dir="rtl" or Arabic lang on <html> counts.
    expect(ts).toContain('root.dir === "rtl" || isRtlLanguage(root.lang)');
    expect(ts).toContain('import { I18nManager, Platform, useColorScheme, type TextStyle } from "react-native";');
    expect(ts).toContain('["ar", "fa", "ur", "ps", "ckb", "sd", "ug"]');
    expect(ts).toContain("typeArabic");
  });
});

describe("generateReactNative, the system font with an Arabic companion (v0.5.0 sweep)", () => {
  const t = validTokens();
  t.font.body.$value.fontFamily = ["system-ui", "Readex Pro"];
  const ts = tsFor(t, { googlePackages: new Map([["Inter", "@expo-google-fonts/inter"], ["Readex Pro", "@expo-google-fonts/readex-pro"]]) });

  test("Latin text in the system font (no fontFamily), Arabic text in the companion's face", () => {
    expect(ts).toContain('  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },');
    expect(ts).toContain("export const typeArabic: Partial<Record<MotifTypeRole, MotifTextStyle>> = {\n  body: { fontFamily: \"ReadexPro_400Regular\", fontSize: 16, lineHeight: 24 },");
    expect(ts).toContain('import { ReadexPro_400Regular } from "@expo-google-fonts/readex-pro";');
    expect(ts).not.toContain('"system-ui"');
  });
});

describe("generateReactNative, project fonts", () => {
  const brand = () => {
    const t = validTokens();
    t.$extensions["dev.motif"].fonts = [{ family: "Brand Sans", files: [{ path: "design/fonts/BrandSans-Regular.ttf", weight: 400, style: "normal" }] }];
    t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    return t;
  };
  const projectFonts = [
    { family: "Brand Sans", weight: 400, style: "normal", asset: "../../assets/fonts/BrandSans-Regular.ttf" },
    { family: "Brand Sans", weight: 700, style: "normal", asset: "../../assets/fonts/BrandSans-Bold.ttf" },
  ];

  test("a project font is required from its file, under a key of family and weight", () => {
    const ts = tsFor(brand(), { projectFonts });
    expect(ts).toContain('  "Brand Sans_400": require("../../assets/fonts/BrandSans-Regular.ttf"),');
    expect(ts).not.toContain("BrandSans-Bold");
    expect(ts).toContain('body: { fontFamily: "Brand Sans_400", fontSize: 16, lineHeight: 24 },');
  });

  test("a weight the family lacks takes the nearest one", () => {
    const t = brand();
    t.font.heading.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const ts = tsFor(t, { projectFonts });
    expect(ts).toContain('heading: { fontFamily: "Brand Sans_700", fontSize: 20, lineHeight: 26 },');
    expect(ts).toContain('  "Brand Sans_700": require("../../assets/fonts/BrandSans-Bold.ttf"),');
  });

  test("a project font without usable files falls back to the system font, with its weight", () => {
    const ts = tsFor(brand(), { projectFonts: [] });
    expect(ts).toContain('body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },');
    expect(ts).toContain("// Brand Sans: add a .ttf or .otf");
  });
});

describe("generateReactNative, Google packages", () => {
  test("a family whose package isn't installed is left out of motifFonts and uses the system font", () => {
    const ts = tsFor(validTokens(), { googlePackages: new Map() });
    expect(ts).not.toContain('from "@expo-google-fonts');
    expect(ts).toContain("export const motifFonts: Record<string, number | string> = {};");
    expect(ts).toContain("// Inter: install @expo-google-fonts/inter");
    expect(ts).toContain('heading: { fontSize: 20, lineHeight: 26, fontWeight: "600" },');
  });

  test("a weight the package lacks takes the nearest one it has", () => {
    const faces = new Map([["@expo-google-fonts/inter", new Set(["Inter_400Regular", "Inter_700Bold"])]]);
    const ts = tsFor(validTokens(), { faces });
    expect(ts).not.toContain("Inter_600SemiBold");
    expect(ts).toContain('heading: { fontFamily: "Inter_700Bold",');
    expect(ts).toContain('label: { fontFamily: "Inter_400Regular",');
  });

  test("a package that can't be found gives only its regular face", () => {
    const ts = tsFor(validTokens(), { unresolved: new Set(["@expo-google-fonts/inter"]) });
    expect(ts).not.toContain("Inter_700Bold");
    expect(ts).toContain('heading: { fontFamily: "Inter_400Regular",');
    expect(ts).toContain('import { Inter_400Regular } from "@expo-google-fonts/inter";');
  });

  test("a package file with no face of the family listed gives only the regular face", () => {
    const faces = new Map([["@expo-google-fonts/inter", new Set(["Other_400Regular"])]]);
    const ts = tsFor(validTokens(), { faces });
    expect(ts).toContain('heading: { fontFamily: "Inter_400Regular",');
    expect(ts).not.toContain("Inter_600SemiBold");
  });

  test("letter spacing is in pixels", () => {
    const t = validTokens();
    t.font.label.$value.letterSpacing = { value: 0.5, unit: "px" };
    expect(tsFor(t)).toContain('label: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 19.6, letterSpacing: 0.5 },');
  });
});
