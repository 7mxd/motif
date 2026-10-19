import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { checkRoles } from "../src/contract/roles";
import { validateTokens } from "../src/contract/tokens";
import { checkVariants } from "../src/contract/variants";
import { buildDraft } from "../src/extract/draft";
import { collectFlutter } from "../src/stacks/flutter/extract";
import { FLUTTER } from "../src/stacks/flutter";
import type { AppInfo } from "../src/detect/stacks";
import { docFrom, FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const app = { path: ".", stack: "flutter" } as AppInfo;
const filesOf = (root: string) => FLUTTER.sourceFiles!(root, app, {});
const collect = (root: string) => collectFlutter(filesOf(root));
const values = (samples: { value: string }[]) => samples.map((s) => s.value);
const PALETTES = join(FIXTURES, "flutter-palettes");
const PUBSPEC = "name: shop\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n";

/** The hex a role's alias names, through the draft's primitives. */
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;

describe("collectFlutter on parallel palettes", () => {
  const occ = collect(PALETTES);
  const { tokens, report } = buildDraft(occ);
  const t = tokens as any;

  test("the draft declares the default palette and one variant per parallel palette", () => {
    expect(t.$extensions["dev.motif"].variants).toEqual([
      { id: "default", label: "Default", default: true },
      { id: "male", label: "Male" },
      { id: "female", label: "Female" },
    ]);
    expect(report.designVariants).toEqual([{ id: "default", label: "Default" }, { id: "male", label: "Male" }, { id: "female", label: "Female" }]);
  });

  test("the accent's role takes each palette's light and dark values", () => {
    const role = t.color["action-primary"];
    expect(hexOf(t, role.$value)).toBe("#0F766E");
    expect(hexOf(t, role.$extensions["dev.motif"].modes.dark)).toBe("#5EEAD4");
    const own = role.$extensions["dev.motif"].variants;
    expect([hexOf(t, own.male.value), hexOf(t, own.male.dark)]).toEqual(["#1D4ED8", "#60A5FA"]);
    expect([hexOf(t, own.female.value), hexOf(t, own.female.dark)]).toEqual(["#BE185D", "#F472B6"]);
  });

  test("the report lists each palette field with its light, dark and variant values", () => {
    expect(report.variables.find((v) => v.name === "--accent")).toEqual({
      name: "--accent",
      light: "#0f766e",
      dark: "#5eead4",
      role: "color.action-primary",
      variants: { male: { light: "#1d4ed8", dark: "#60a5fa" }, female: { light: "#be185d", dark: "#f472b6" } },
    });
  });

  test("ColorScheme arguments name Motif's roles, following palette fields as aliases", () => {
    expect(occ.aliases).toMatchObject({ "--action-primary": "--accent", "--surface": "--bg", "--text-primary": "--text" });
    expect(occ.variables!.find((v) => v.name === "--on-action-primary")).toEqual({ name: "--on-action-primary", light: "#ffffff" });
    expect(occ.followVariables).toBe(true);
    // Where the widgets use a field counts as evidence for its name.
    expect(occ.variableUses!["--bg"]).toMatchObject({ background: 2 });
    expect(occ.variableUses!["--text"]).toMatchObject({ text: 1 });
    expect(hexOf(t, t.color.background.$value)).toBe("#F8FAF9");
    expect(hexOf(t, t.color["text-primary"].$value)).toBe("#0A1733");
    // primary: palette.accent names the action colour, however much another saturated colour is used.
    const busier = buildDraft({ ...occ, colors: [{ value: "#7c3aed", count: 50, contexts: { background: 50 }, examples: [] }, ...occ.colors] }).tokens as any;
    expect(hexOf(busier, busier.color["action-primary"].$value)).toBe("#0F766E");
  });

  test("usage samples: spacing, corners, durations, easings and fonts", () => {
    expect(values(occ.space)).toContain("13px");
    expect(values(occ.radius)).toContain("12px");
    expect(values(occ.duration)).toContain("250ms");
    expect(values(occ.easing)).toContain("cubic-bezier(0, 0, 0.58, 1)");
    expect(values(occ.fontFamily)).toContain("Onest");
    // Bundled fonts listed in pubspec.yaml count too.
    expect(values(occ.fontFamily)).toContain("Thmanyah Sans");
    expect(values(occ.fontSize).sort()).toEqual(["16px", "22px"]);
  });

  test("only the default light palette's colours are samples; commented-out palettes aren't read", () => {
    const colors = values(occ.colors);
    expect(colors).toContain("#0f766e");
    for (const other of ["#5eead4", "#1d4ed8", "#be185d", "#ff0000"]) expect(colors).not.toContain(other);
    expect(occ.variables!.map((v) => v.name)).not.toContain("--retro");
  });

  test("the draft is a valid guide with valid variants", () => {
    const doc = docFrom(tokens);
    expect(validateTokens(doc)).toEqual([]);
    expect(checkRoles(doc)).toEqual([]);
    expect(checkVariants(doc).filter((f) => f.severity === "error")).toEqual([]);
  });
});

const COLORS = (body: string) => `import 'package:flutter/material.dart';

class AppColors extends ThemeExtension<AppColors> {
  const AppColors({required this.bg, required this.textMuted, required this.accent});

  final Color bg;
  final Color textMuted;
  final Color accent;
${body}
}
`;

describe("collectFlutter pairing", () => {
  test("one palette class with only light and dark drafts no variants", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/colors.dart": COLORS(`
  static const light = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xA60A1733), accent: Color(0xFF4338CA));
  static const dark = AppColors(bg: Color(0xFF111111), textMuted: Color(0xA6F5F7F6), accent: Color(0xFF818CF8));`),
    });
    const occ = collect(root);
    expect(occ.variables!.find((v) => v.name === "--text-muted")).toEqual({ name: "--text-muted", light: "#0a1733a6", dark: "#f5f7f6a6" });
    const { tokens, report } = buildDraft(occ);
    expect(JSON.stringify(tokens)).not.toContain("variants");
    expect(report.designVariants).toBeUndefined();
  });

  test("names pair on dark/light: darkTheme with theme, and a multi-word suffix", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/colors.dart": COLORS(""),
      "lib/palettes.dart": `import 'colors.dart';

const theme = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xFF555555), accent: Color(0xFF4338CA));
const darkTheme = AppColors(bg: Color(0xFF111111), textMuted: Color(0xFFAAAAAA), accent: Color(0xFF818CF8));
final lightHighContrast = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xFF222222), accent: Color(0xFF1E1B4B));
final darkHighContrast = AppColors(bg: Color(0xFF000000), textMuted: Color(0xFFDDDDDD), accent: Color(0xFFC7D2FE));
`,
    });
    const occ = collect(root);
    expect(occ.variables!.find((v) => v.name === "--accent")).toEqual({
      name: "--accent", light: "#4338ca", dark: "#818cf8", variants: { "high-contrast": { light: "#1e1b4b", dark: "#c7d2fe" } },
    });
    const { tokens } = buildDraft(occ);
    expect((tokens as any).$extensions["dev.motif"].variants).toEqual([
      { id: "default", label: "Default", default: true },
      { id: "high-contrast", label: "High Contrast" },
    ]);
  });

  test("an unpaired palette is a light-only variant, noted in the report", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/colors.dart": COLORS(`
  static const AppColors light = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xFF555555), accent: Color(0xFF4338CA));
  static const AppColors dark = AppColors(bg: Color(0xFF111111), textMuted: Color(0xFFAAAAAA), accent: Color(0xFF818CF8));
  static const AppColors lightSpring = AppColors(bg: Color(0xFFF0FDF4), textMuted: Color(0xFF555555), accent: Color(0xFF15803D));`),
    });
    const occ = collect(root);
    expect(occ.variables!.find((v) => v.name === "--accent")!.variants).toEqual({ spring: { light: "#15803d" } });
    const { report } = buildDraft(occ);
    expect(report.notes.join("\n")).toContain("lightSpring has no dark palette");
  });

  test("with no unsuffixed pair, the first pair in source order is the default", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/colors.dart": COLORS(`
  static const AppColors lightMale = AppColors(bg: Color(0xFFF1F5F9), textMuted: Color(0xFF555555), accent: Color(0xFF1D4ED8));
  static const AppColors darkMale = AppColors(bg: Color(0xFF0B1220), textMuted: Color(0xFFAAAAAA), accent: Color(0xFF60A5FA));
  static const AppColors lightFemale = AppColors(bg: Color(0xFFFDF2F8), textMuted: Color(0xFF555555), accent: Color(0xFFBE185D));
  static const AppColors darkFemale = AppColors(bg: Color(0xFF1F0A16), textMuted: Color(0xFFAAAAAA), accent: Color(0xFFF472B6));`),
    });
    const occ = collect(root);
    expect(occ.variables!.find((v) => v.name === "--accent")).toEqual({
      name: "--accent", light: "#1d4ed8", dark: "#60a5fa", variants: { female: { light: "#be185d", dark: "#f472b6" } },
    });
  });

  test("ColorScheme.dark and literal colours set dark values; colours named in a const are followed", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/theme.dart": `import 'package:flutter/material.dart';

const brand = Color(0xFF4338CA);
final light = ThemeData(colorScheme: ColorScheme.light(primary: brand, error: Color(0xFFB91C1C), outline: Color(0xFFD1D5DB)));
final dark = ThemeData(colorScheme: ColorScheme(brightness: Brightness.dark, primary: Color(0xFF818CF8), error: Color(0xFFF87171)));
`,
    });
    const occ = collect(root);
    expect(occ.variables!.find((v) => v.name === "--action-primary")).toEqual({ name: "--action-primary", light: "#4338ca", dark: "#818cf8" });
    expect(occ.variables!.find((v) => v.name === "--danger")).toEqual({ name: "--danger", light: "#b91c1c", dark: "#f87171" });
    expect(occ.variables!.find((v) => v.name === "--border")).toEqual({ name: "--border", light: "#d1d5db" });
  });

  test("two palette classes with the same field name keep both, prefixed with the class name", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/colors.dart": COLORS(`
  static const light = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xFF555555), accent: Color(0xFF4338CA));`),
      "lib/chart.dart": `import 'package:flutter/material.dart';

class ChartColors extends ThemeExtension<ChartColors> {
  const ChartColors({required this.accent, required this.grid});
  final Color accent;
  final Color grid;
  static const light = ChartColors(accent: Color(0xFFEA580C), grid: Color(0xFFE5E7EB));
}
`,
    });
    const names = collect(root).variables!.map((v) => v.name);
    expect(names).toEqual(expect.arrayContaining(["--app-colors-accent", "--chart-colors-accent", "--grid", "--bg", "--text-muted"]));
    expect(names).not.toContain("--accent");
  });
});

describe("motif extract on a Flutter app", () => {
  test("writes a draft with the palettes' variants from the app's Dart files", async () => {
    const root = tempDir("motif-flutter-extract-");
    cpSync(PALETTES, root, { recursive: true });
    const r = await runExtract(root, { positionals: [] });
    expect(r.exitCode).toBe(0);
    const draft = JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
    expect(draft.$extensions["dev.motif"].variants.map((v: any) => v.id)).toEqual(["default", "male", "female"]);
    const report = JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
    expect(report.designVariants.map((v: any) => v.id)).toEqual(["default", "male", "female"]);
    expect((r.data.summary as any).fonts).toContain("Onest");
    expect(r.text).not.toContain("Your CSS");
  });

  test("a web app and a Flutter app in one project make one draft from both", async () => {
    const root = tempDir("motif-flutter-extract-");
    cpSync(PALETTES, join(root, "apps/mobile"), { recursive: true });
    const pkg = JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } });
    cpSync(makeProject({ "package.json": pkg, "src/App.tsx": '<p className="a" />\n', "src/a.css": ".a { padding: 21px; transition: opacity 400ms ease-out; }\n" }), join(root, "apps/web"), { recursive: true });
    const r = await runExtract(root, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).not.toContain("Skipped");
    const report = JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
    expect(report.designVariants.map((v: any) => v.id)).toEqual(["default", "male", "female"]);
    expect(report.spacing.map((s: any) => s.px)).toEqual(expect.arrayContaining([13, 21]));
    expect(report.durations.map((s: any) => s.value)).toEqual(expect.arrayContaining(["250ms", "400ms"]));
  });
});
