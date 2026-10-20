import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { validateTokens } from "../src/contract/tokens";
import { checkRoles } from "../src/contract/roles";
import { checkVariants } from "../src/contract/variants";
import { buildDraft } from "../src/extract/draft";
import type { AppInfo } from "../src/detect/stacks";
import { REACT_NATIVE } from "../src/stacks/react-native";
import { collectReactNative } from "../src/stacks/react-native/extract";
import { docFrom, FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const app = { path: ".", stack: "react-native" } as AppInfo;
const filesOf = (root: string) => REACT_NATIVE.sourceFiles!(root, app, {});
const collect = (root: string) => collectReactNative(filesOf(root));
const values = (samples: { value: string }[]) => samples.map((s) => s.value);
const PALETTES = join(FIXTURES, "rn-palettes");
const PKG = JSON.stringify({ name: "shop", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4" } });
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;

describe("collectReactNative on the Expo starter's Colors and a parallel pair", () => {
  const occ = collect(PALETTES);
  const { tokens, report } = buildDraft(occ);
  const t = tokens as any;

  test("light and dark objects give variables with both values, following identifiers to their const", () => {
    const byName = Object.fromEntries(occ.variables!.map((v) => [v.name, v]));
    expect(byName["--tint"]).toMatchObject({ light: "#0a7ea4", dark: "#ffffff" });
    expect(byName["--text"]).toMatchObject({ light: "#11181c", dark: "#ecedee" });
    expect(byName["--background"]).toMatchObject({ light: "#ffffff", dark: "#151718" });
    expect(byName["--icon"]).toMatchObject({ light: "#687076", dark: "#9ba1a6" });
    expect(byName["--tab-icon-selected"]).toMatchObject({ light: "#0a7ea4", dark: "#ffffff" });
    expect(occ.source).toBe("script");
    expect(occ.followVariables).toBe(true);
  });

  test("MenColors and WomenColors become variants, with the starter's Colors as the default", () => {
    expect(t.$extensions["dev.motif"].variants).toEqual([
      { id: "default", label: "Default", default: true },
      { id: "men", label: "Men" },
      { id: "women", label: "Women" },
    ]);
    const tint = occ.variables!.find((v) => v.name === "--tint")!;
    expect(tint.variants).toEqual({ men: { light: "#1d4ed8", dark: "#60a5fa" }, women: { light: "#be185d", dark: "#f472b6" } });
    expect(report.designVariants!.map((v) => v.id)).toEqual(["default", "men", "women"]);
    expect(hexOf(t, t.color.background.$value)).toBe("#FFFFFF");
  });

  test("usage samples: spacing and corners from style objects and the theme's maps, motion, fonts", () => {
    expect(values(occ.space)).toEqual(expect.arrayContaining(["13px", "8px", "16px", "24px"]));
    expect(values(occ.radius)).toEqual(expect.arrayContaining(["12px"]));
    expect(values(occ.fontSize).sort()).toEqual(["16px", "22px"]);
    expect(values(occ.duration)).toContain("250ms");
    expect(values(occ.fontFamily)).toEqual(expect.arrayContaining(["Onest", "SpaceMono"]));
  });

  test("only the default light palette's colours are samples", () => {
    const colors = values(occ.colors);
    expect(colors).toContain("#0a7ea4");
    for (const other of ["#1d4ed8", "#be185d", "#60a5fa"]) expect(colors).not.toContain(other);
  });

  test("the draft is a valid guide with valid variants", () => {
    const doc = docFrom(tokens);
    expect(validateTokens(doc)).toEqual([]);
    expect(checkRoles(doc)).toEqual([]);
    expect(checkVariants(doc).filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("collectReactNative pairing", () => {
  const project = (files: Record<string, string>) => collect(makeProject({ "package.json": PKG, "app/index.tsx": "export default function I() { return null; }\n", ...files }));

  test("one light/dark object drafts no variants", () => {
    const occ = project({ "constants/Colors.ts": "export const Colors = { light: { text: '#111', tint: '#4338ca' }, dark: { text: '#eee', tint: '#818cf8' } };\n" });
    expect(occ.variables!.find((v) => v.name === "--tint")).toEqual({ name: "--tint", light: "#4338ca", dark: "#818cf8" });
    const { tokens, report } = buildDraft(occ);
    expect(JSON.stringify(tokens)).not.toContain("variants");
    expect(report.designVariants).toBeUndefined();
  });

  test("palettes.men.light nests variants by key as written, quoted keys included", () => {
    const occ = project({
      "theme/palettes.ts": `export const palettes = {
  default: { light: { tint: '#4338ca', bg: '#fff' }, dark: { tint: '#818cf8', bg: '#111' } },
  'partner-store': { light: { tint: '#0f766e', bg: '#f0fdfa' }, dark: { tint: '#5eead4', bg: '#042f2e' } },
};\n`,
    });
    expect(occ.variables!.find((v) => v.name === "--tint")).toEqual({
      name: "--tint", light: "#4338ca", dark: "#818cf8", variants: { "partner-store": { light: "#0f766e", dark: "#5eead4" } },
    });
    expect(occ.variantLabels).toEqual({ "partner-store": "Partner Store" });
  });

  test("with no unsuffixed pair, the first pair is the default and the report says so", () => {
    const occ = project({
      "theme/c.ts": `export const MenColors = { light: { tint: '#1d4ed8' }, dark: { tint: '#60a5fa' } };
export const WomenColors = { light: { tint: '#be185d' }, dark: { tint: '#f472b6' } };\n`,
    });
    expect(occ.variables!.find((v) => v.name === "--tint")).toEqual({ name: "--tint", light: "#1d4ed8", dark: "#60a5fa", variants: { women: { light: "#be185d", dark: "#f472b6" } } });
    expect(occ.notes!.join("\n")).toContain("MenColors");
  });

  test("a light object with no dark one is a light-only variant, noted", () => {
    const occ = project({
      "theme/c.ts": `export const Colors = { light: { tint: '#4338ca' }, dark: { tint: '#818cf8' } };
export const SpringColors = { light: { tint: '#15803d' } };\n`,
    });
    expect(occ.variables!.find((v) => v.name === "--tint")!.variants).toEqual({ spring: { light: "#15803d" } });
    expect(occ.notes!.join("\n")).toContain("SpringColors");
  });

  test("top-level light and dark objects pair by name, typed or not, with a palette's other words as its variant (hands-on)", () => {
    const occ = project({
      "src/theme/colors.ts": `export interface Palette { name: string; bg: string; accent: string }
export const light: Palette = {
  name: "light",
  bg: "#F8FAF9", // the page
  accent: "#1F9F87",
};
export const dark: Palette = { name: "dark", bg: "#0F1413", accent: "#5DCBB1" };
export const menLight = { bg: "#F5F7FA", accent: "#1D4ED8" };
export const menDark = { bg: "#0B1220", accent: "#60A5FA" };
export const palettes: Record<string, Palette> = { light, dark };
export const darkShadows = { card: 4 };
export const darkOverlay = { backgroundColor: "#000000", borderColor: "#111111" };
export const lightAccent = { accent: "#ff0000" };
export const highlight = { bg: "#FFFF00", fg: "#000000" };\n`,
    });
    expect(occ.variables!.find((v) => v.name === "--bg")).toEqual({
      name: "--bg", light: "#f8faf9", dark: "#0f1413", variants: { men: { light: "#f5f7fa", dark: "#0b1220" } },
    });
    expect(occ.variables!.map((v) => v.name).sort()).toEqual(["--accent", "--bg"]);
    expect(occ.notes ?? []).toEqual([]);
    const { tokens } = buildDraft(occ);
    expect((tokens as any).$extensions["dev.motif"].variants.map((v: any) => v.id)).toEqual(["default", "men"]);
  });

  test("the palette's tint or accent is the action colour, over another colour the screens type more often (final review)", () => {
    const actionOf = (files: Record<string, string>) => {
      const { tokens } = buildDraft(project(files)) as { tokens: any };
      const ref = (r: string) => tokens.primitive.color[r.slice("{primitive.color.".length, -1)].$value.hex;
      const action = tokens.color["action-primary"];
      return [ref(action.$value), ref(action.$extensions["dev.motif"].modes.dark)];
    };
    // Art the screens type more often than the brand colour.
    const art = `import { View } from "react-native";
export function Tiles() {
  return <><View style={{ backgroundColor: "#d4a574" }} /><View style={{ backgroundColor: "#d4a574" }} /><View style={{ backgroundColor: "#d4a574" }} /></>;
}\n`;
    // The create-expo-app starter before SDK 54: constants/Colors.ts, with tint read for the tab bar.
    const starter = `const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';
export const Colors = {
  light: { text: '#11181C', background: '#fff', tint: tintColorLight, icon: '#687076', tabIconDefault: '#687076', tabIconSelected: tintColorLight },
  dark: { text: '#ECEDEE', background: '#151718', tint: tintColorDark, icon: '#9BA1A6', tabIconDefault: '#9BA1A6', tabIconSelected: tintColorDark },
};\n`;
    const tabs = `import { Tabs } from "expo-router";
import { Colors } from "@/constants/Colors";
export default function TabLayout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: Colors.light.tint }} />;
}\n`;
    expect(actionOf({ "constants/Colors.ts": starter, "app/(tabs)/_layout.tsx": tabs, "components/Tiles.tsx": art })).toEqual(["#0A7EA4", "#FFFFFF"]);
    // HiSalon's shape: light and dark objects with an accent.
    const palette = `export const light = { bg: "#F8FAF9", text: "#0F1F1B", accent: "#1F9F87" };
export const dark = { bg: "#0F1413", text: "#F5F7F6", accent: "#5DCBB1" };\n`;
    expect(actionOf({ "src/theme/colors.ts": palette, "src/components/Tiles.tsx": art })).toEqual(["#1F9F87", "#5DCBB1"]);
  });

  test("commented-out palettes and objects that aren't colours are not read", () => {
    const occ = project({
      "theme/c.ts": `export const Colors = { light: { tint: '#4338ca' }, dark: { tint: '#818cf8' } };
// export const Old = { light: { retro: '#ff0000' }, dark: { retro: '#00ff00' } };
export const Shadows = { light: { card: 2 }, dark: { card: 4 } };\n`,
    });
    expect(occ.variables!.map((v) => v.name)).toEqual(["--tint"]);
  });
});

describe("motif extract on an Expo app", () => {
  test("writes a draft from the app's code, and is supported", async () => {
    const root = tempDir("motif-rn-extract-");
    cpSync(PALETTES, root, { recursive: true });
    const r = await runExtract(root, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.data.error).toBeUndefined();
    const draft = JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
    expect(draft.$extensions["dev.motif"].variants.map((v: any) => v.id)).toEqual(["default", "men", "women"]);
    expect(r.text).not.toContain("Your CSS");
    expect(r.text).not.toContain("Dart");
  });
});

describe("a half-written object", () => {
  test("does not hang extract", () => {
    const dir = makeProject({ "package.json": PKG, "constants/Colors.ts": "export const Colors = { light: { text: '#111' ), ] }\n" });
    const started = Date.now();
    collect(dir);
    expect(Date.now() - started).toBeLessThan(2000);
  }, 5000);
});
