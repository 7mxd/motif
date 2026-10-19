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

const SHOP_COLORS = readFileSync(join(PALETTES, "lib/theme/shop_colors.dart"), "utf8");
const SHOP_THEME = readFileSync(join(PALETTES, "lib/theme/shop_theme.dart"), "utf8");

describe("motif extract reads the theme of a package the app takes from a folder (fix round 1)", () => {
  const project = () =>
    makeProject({
      "mobile/app/pubspec.yaml": `${PUBSPEC}  core:\n    path: ../packages/core\n  elsewhere:\n    path: ../../../elsewhere\n  pay:\n    git:\n      url: git@example.com:pay.git\n      path: ../../../sdk\n\nflutter:\n  uses-material-design: true\n`,
      "mobile/app/lib/main.dart": `import 'package:flutter/material.dart';
import 'package:core/theme/shop_colors.dart';

class Home extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).extension<ShopColors>()!;
    return Container(padding: EdgeInsets.all(13), decoration: BoxDecoration(color: palette.bg));
  }
}
`,
      "mobile/packages/core/pubspec.yaml": "name: core\ndependencies:\n  flutter:\n    sdk: flutter\n\nflutter:\n  fonts:\n    - family: Thmanyah Sans\n",
      "mobile/packages/core/lib/theme/shop_colors.dart": SHOP_COLORS,
      "mobile/packages/core/lib/theme/shop_theme.dart": SHOP_THEME.replace(
        "extensions: [palette],",
        "extensions: [palette],\n      cardTheme: CardThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),",
      ),
      // A widget in the package: its values are the package's, not the app's.
      "mobile/packages/core/lib/widgets/chip.dart": "import 'package:flutter/material.dart';\n\nWidget chip() => Padding(padding: EdgeInsets.all(7), child: SizedBox());\n",
    });

  test("the palettes of a path: dependency become the draft's variants; its widgets don't count", async () => {
    const root = project();
    const r = await runExtract(root, { positionals: [], app: "mobile/app" });
    expect(r.exitCode).toBe(0);
    const draft = JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
    expect(draft.$extensions["dev.motif"].variants.map((v: any) => v.id)).toEqual(["default", "male", "female"]);
    const report = JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
    const px = report.spacing.map((s: any) => s.px);
    expect(px).toContain(13);
    expect(px).not.toContain(7);
    // The package's ThemeData and fonts are the app's.
    expect(report.radius.map((s: any) => s.value)).toContain("20px");
    expect(report.fontFamilies.map((s: any) => s.value)).toEqual(expect.arrayContaining(["Onest", "Thmanyah Sans"]));
    expect(report.notes.join("\n")).toContain("The theme code of the shared package core (mobile/packages/core) was read too.");
  });

  test("a path: dependency outside the project is skipped, with a note", async () => {
    const r = await runExtract(project(), { positionals: [], app: "mobile/app" });
    expect((r.data.notes as string[]).join("\n")).toContain("The elsewhere package (../../../elsewhere) is outside the project, so its theme code wasn't read.");
    // A git: dependency's path: is a folder in that repository, not here.
    expect((r.data.notes as string[]).join("\n")).not.toContain("pay package");
  });
});

describe("a role takes every mode's and variant's value from one variable (fix round 1)", () => {
  // HiSalon's shape: bg is the same in every palette, cards are white and used more than the page, and ColorScheme's
  // surface and onPrimary name palette fields.
  const instance = (name: string, bg: string, card: string, accent: string, on: string) =>
    `  static const AppColors ${name} = AppColors(bg: Color(0xFF${bg}), card: Color(0xFF${card}), text: Color(0xFF0A1733), accent: Color(0xFF${accent}), accentContrast: Color(0xFF${on}), cardBorder: Color(0x140F3C32));`;
  const root = makeProject({
    "pubspec.yaml": PUBSPEC,
    "lib/main.dart": "void main() {}\n",
    "lib/colors.dart": `import 'package:flutter/material.dart';

class AppColors extends ThemeExtension<AppColors> {
  const AppColors({required this.bg, required this.card, required this.text, required this.accent, required this.accentContrast, required this.cardBorder});
  final Color bg;
  final Color card;
  final Color text;
  final Color accent;
  final Color accentContrast;
  final Color cardBorder;
${instance("light", "F8FAF9", "FFFFFF", "7EEBC1", "0A1733")}
${instance("dark", "0F1413", "1B2120", "7EEBC1", "0A1733")}
${instance("lightMale", "F8FAF9", "FFFFFF", "3D4B6E", "FFFFFF")}
${instance("lightFemale", "F8FAF9", "FFFFFF", "5F4D85", "FFFFFF")}
${instance("darkMale", "0F1413", "1B2120", "7E94C9", "0A1733")}
${instance("darkFemale", "0F1413", "1B2120", "A595D0", "0A1733")}
}
`,
    "lib/theme.dart": `import 'package:flutter/material.dart';
import 'colors.dart';

ThemeData build(AppColors palette) => ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: palette.accent, primary: palette.accent, onPrimary: palette.accentContrast, surface: palette.bg, onSurface: palette.text),
      scaffoldBackgroundColor: palette.bg,
    );
`,
    "lib/cards.dart": `import 'package:flutter/material.dart';
import 'colors.dart';

Widget cards(AppColors c) => Column(children: [
      Card(color: c.card),
      Card(color: c.card),
      Card(color: c.card),
      Container(decoration: BoxDecoration(color: c.card, border: Border.all(color: c.cardBorder))),
      Container(decoration: BoxDecoration(border: Border.all(color: c.cardBorder))),
    ]);
`,
  });
  const { tokens, report } = buildDraft(collect(root));
  const t = tokens as any;
  const values = (role: string) => {
    const r = t.color[role];
    const own = r.$extensions["dev.motif"].variants ?? {};
    return {
      light: hexOf(t, r.$value),
      dark: hexOf(t, r.$extensions["dev.motif"].modes.dark),
      male: own.male && [hexOf(t, own.male.value), hexOf(t, own.male.dark)],
      female: own.female && [hexOf(t, own.female.value), hexOf(t, own.female.dark)],
    };
  };

  test("background is the same colour in the default and in every variant", () => {
    const bg = values("background");
    expect(bg.male ?? [bg.light, bg.dark]).toEqual([bg.light, bg.dark]);
    expect(bg.female ?? [bg.light, bg.dark]).toEqual([bg.light, bg.dark]);
    expect(bg.dark).toBe("#0F1413");
  });

  test("surface's dark and variant values come from the variable its light value came from (--surface → --bg)", () => {
    const surface = values("surface");
    const bg = values("background");
    expect(surface.light).toBe(bg.light);
    expect(surface.dark).toBe("#0F1413");
    expect(surface.male ?? [surface.light, surface.dark]).toEqual([surface.light, surface.dark]);
  });

  test("on-action-primary follows ColorScheme's onPrimary, in every mode and variant", () => {
    const on = values("on-action-primary");
    expect([on.light, on.dark]).toEqual(["#0A1733", "#0A1733"]);
    expect(on.male).toEqual(["#FFFFFF", "#0A1733"]);
    const accent = values("action-primary");
    expect(accent.male).toEqual(["#3D4B6E", "#7E94C9"]);
  });

  test("a role drafted from a see-through colour is noted", () => {
    expect(report.notes.join("\n")).toContain("border comes from a see-through colour (#0f3c3214)");
  });

  test("the draft stays a valid guide", () => {
    const doc = docFrom(tokens);
    expect(validateTokens(doc)).toEqual([]);
    expect(checkRoles(doc)).toEqual([]);
    expect(checkVariants(doc).filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("palette names and places (fix round 1)", () => {
  const variantsOf = (body: string, extra: Record<string, string> = {}) => {
    const root = makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": "void main() {}\n", "lib/colors.dart": COLORS(body), ...extra });
    return collect(root);
  };
  const p = (name: string, accent: string) => `  static const AppColors ${name} = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xFF555555), accent: Color(0xFF${accent}));`;

  test("light and dark count only as words of the name: highlight and darkened aren't halves", () => {
    const occ = variantsOf([p("light", "4338CA"), p("dark", "818CF8"), p("highlight", "F59E0B"), p("darkened", "1E1B4B")].join("\n"));
    const accent = occ.variables!.find((v) => v.name === "--accent")!;
    expect([accent.light, accent.dark]).toEqual(["#4338ca", "#818cf8"]);
    expect(accent.variants).toEqual({ highlight: { light: "#f59e0b" }, darkened: { light: "#1e1b4b" } });
  });

  test("a palette called Default beside the unsuffixed one is the variant default-variant", () => {
    const occ = variantsOf([p("light", "4338CA"), p("dark", "818CF8"), p("lightDefault", "B91C1C"), p("darkDefault", "F87171")].join("\n"));
    expect(occ.variables!.find((v) => v.name === "--accent")!.variants).toEqual({ "default-variant": { light: "#b91c1c", dark: "#f87171" } });
    const { tokens } = buildDraft(occ);
    expect((tokens as any).$extensions["dev.motif"].variants).toEqual([
      { id: "default", label: "Default", default: true },
      { id: "default-variant", label: "Default variant" },
    ]);
  });

  test("lightDefault and darkDefault alone are the default", () => {
    const occ = variantsOf([p("lightDefault", "4338CA"), p("darkDefault", "818CF8"), p("lightMale", "1D4ED8")].join("\n"));
    const accent = occ.variables!.find((v) => v.name === "--accent")!;
    expect([accent.light, accent.dark]).toEqual(["#4338ca", "#818cf8"]);
    expect(Object.keys(accent.variants!)).toEqual(["male"]);
  });

  test("a palette built inside a function or method isn't one of the app's palettes", () => {
    const occ = variantsOf([p("light", "4338CA"), p("dark", "818CF8")].join("\n"), {
      "lib/build.dart": `import 'colors.dart';

AppColors pick(bool male) {
  final lightMale = AppColors(bg: Color(0xFFFFFFFF), textMuted: Color(0xFF555555), accent: Color(0xFF1D4ED8));
  return male ? lightMale : AppColors.light;
}

class Picker {
  AppColors get colors {
    const darkMale = AppColors(bg: Color(0xFF000000), textMuted: Color(0xFFAAAAAA), accent: Color(0xFF60A5FA));
    return darkMale;
  }
}
`,
    });
    expect(occ.variables!.find((v) => v.name === "--accent")!.variants).toBeUndefined();
  });
});
