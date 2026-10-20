import { describe, expect, test } from "bun:test";
import { springPhysics } from "../src/contract/spring";
import { TS_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { generateFlutter, member, slotSize } from "../src/stacks/flutter/generate";
import { docFrom, partnerTokens, validTokens, withCompanion } from "./helpers";

const dartFor = (tokens: any, googleFonts = true) => {
  const files = generateFlutter(buildThemeSet(docFrom(tokens)), { googleFonts });
  expect(files.map((f) => f.path)).toEqual(["motif_theme.dart"]);
  return files[0]!.content;
};

describe("generateFlutter, the test guide (no variants)", () => {
  const dart = dartFor(validTokens());

  test("starts with Motif's header and imports Material", () => {
    expect(dart.startsWith(TS_HEADER + "\n")).toBe(true);
    expect(dart).toContain("import 'package:flutter/material.dart';");
  });

  test("colours: a theme extension with one field per role, light and dark", () => {
    expect(dart).toContain("class MotifColors extends ThemeExtension<MotifColors>");
    expect(dart).toContain("final Color textPrimary;");
    expect(dart).toContain("final Color onActionPrimary;");
    expect(dart).toContain("static const MotifColors light = MotifColors(");
    expect(dart).toContain("static const MotifColors dark = MotifColors(");
    expect(dart).toContain("actionPrimary: Color(0xFF4338CA),"); // light
    expect(dart).toContain("actionPrimary: Color(0xFF818CF8),"); // dark
    expect(dart).toContain("static MotifColors of(BuildContext context)");
    expect(dart).toContain("MotifColors copyWith({");
    expect(dart).toContain("textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,");
  });

  test("the colour scheme is explicit and comes from the roles", () => {
    expect(dart).not.toContain("fromSeed");
    for (const line of [
      "primary: colors.actionPrimary,",
      "onPrimary: colors.onActionPrimary,",
      "secondary: colors.actionSecondary,",
      "onSecondary: colors.onActionSecondary,",
      "error: colors.danger,",
      "onError: colors.onDanger,",
      "surface: colors.surface,",
      "onSurface: colors.textPrimary,",
      "onSurfaceVariant: colors.textSecondary,",
      "surfaceContainerLow: colors.background,",
      "surfaceContainer: colors.surface,",
      "surfaceContainerHigh: colors.surfaceRaised,",
      "surfaceContainerHighest: colors.surfaceRaised,",
      "outline: colors.border,",
      "outlineVariant: colors.border,",
      "inverseSurface: colors.textPrimary,",
      "onInverseSurface: colors.textInverse,",
      "surfaceTint: colors.surface,",
      "scaffoldBackgroundColor: colors.background,",
      "dividerColor: colors.border,",
      "extensions: [colors],",
    ]) expect(dart).toContain(line);
  });

  test("sizes, shadows and motion", () => {
    expect(dart).toContain("abstract final class MotifSpace {");
    expect(dart).toContain("static const double s0 = 0;");
    expect(dart).toContain("static const double s4 = 16;");
    expect(dart).toContain("static const double full = 9999;");
    expect(dart).toContain("static const List<BoxShadow> md = [");
    // md: black at 0.1, 4px down, 12px blur
    expect(dart).toContain("    BoxShadow(color: Color(0x1A000000), offset: Offset(0, 4), blurRadius: 12),");
    expect(dart).toContain("static const Duration fast = Duration(milliseconds: 120);");
    expect(dart).toContain("static const Cubic standard = Cubic(0.2, 0, 0, 1);");
    const p = springPhysics({ duration: 0.25, bounce: 0 });
    // Split one argument per line, as dart format lays it out; values to 2 decimals.
    expect(dart).toContain(
      `static final SpringDescription snappy = SpringDescription(\n    mass: 1,\n    stiffness: ${p.stiffness.toFixed(2)},\n    damping: ${p.damping.toFixed(2)},\n  );`,
    );
    expect(dart).toContain("static bool reduced(BuildContext context) =>");
    expect(dart).toContain("MediaQuery.disableAnimationsOf(context)");
    expect(dart).toContain("reduced(context) ? Duration.zero : value");
  });

  test("type: one getter per role, with no colour, mapped onto the text theme", () => {
    expect(dart).toContain("static TextStyle get body =>");
    expect(dart).toContain("static TextStyle get body => _font(\n    'Inter',\n    const TextStyle(");
    // One guarded helper loads a family through google_fonts only when it has it.
    expect(dart).toContain("static TextStyle _font(");
    expect(dart).toContain("GoogleFonts.asMap().containsKey(family)");
    expect(dart).toContain(": style.copyWith(fontFamily: family);");
    expect(dart).not.toContain("GoogleFonts.getFont('");
    // No companion, so no fallback helper (an unused one is a lint warning).
    expect(dart).not.toContain("_family(");
    expect(dart).toContain("fontWeight: FontWeight.w600,");
    expect(dart).toContain("height: 1.3,");
    expect(dart).not.toMatch(/TextStyle\([^)]*color:/);
    // The slots step down as Material's do, on the guide's own sizes (40, 28, 20, 16, 14, 12 px here): a title slot
    // never grows to the heading role's size, which made an app's small titles and labels too big.
    for (const line of [
      "displayLarge: MotifText.display,",
      "displaySmall: MotifText.display,",
      "headlineLarge: MotifText.title,",
      "headlineSmall: MotifText.title.copyWith(fontSize: 20),",
      "titleLarge: MotifText.heading,",
      "titleMedium: MotifText.heading.copyWith(fontSize: 16),",
      "titleSmall: MotifText.heading.copyWith(fontSize: 14),",
      "bodyLarge: MotifText.body,",
      "bodyMedium: MotifText.body.copyWith(fontSize: 14),",
      "bodySmall: MotifText.caption,",
      "labelLarge: MotifText.label,",
      "labelMedium: MotifText.label.copyWith(fontSize: 12),",
      "labelSmall: MotifText.label.copyWith(fontSize: 12),",
    ]) expect(dart).toContain(line);
  });

  test("a slot's size: the guide's closest to Material's, never above its role, ties to the smaller", () => {
    const scale = [32, 24, 20, 16, 14, 12];
    expect(slotSize(16, 20, scale)).toBe(16);
    expect(slotSize(14, 20, scale)).toBe(14);
    expect(slotSize(22, 20, scale)).toBe(20);
    expect(slotSize(57, 32, scale)).toBe(32);
    expect(slotSize(11, 14, scale)).toBe(12);
    expect(slotSize(15, 20, scale)).toBe(14);
    expect(slotSize(12, 10, scale)).toBe(10);
  });

  test("without variants there is no variant enum, parameter or override", () => {
    expect(dart).not.toContain("MotifVariant");
    expect(dart).not.toContain("debugVariantOverride");
    expect(dart).toContain("static ThemeData light() =>");
    expect(dart).toContain("static ThemeData dark() =>");
  });

  test("the whole file", () => {
    expect(dart).toMatchSnapshot();
  });
});

describe("generateFlutter, names", () => {
  test("role names become lint-clean lowerCamelCase members", () => {
    expect(member("0-5", "s")).toBe("s0p5");
    expect(member("2xl", "r")).toBe("r2xl");
    expect(member("on-action-primary", "c")).toBe("onActionPrimary");
    expect(member("surface_raised", "c")).toBe("surfaceRaised");
    expect(member("default", "c")).toBe("defaultValue");
    const t = validTokens();
    t.space["0-5"] = { $value: { value: 2, unit: "px" } };
    expect(dartFor(t)).toContain("static const double s0p5 = 2;");
  });
});

describe("generateFlutter, two variants", () => {
  const dart = dartFor(partnerTokens());

  test("an enum with the default first, and colours for each variant", () => {
    expect(dart).toContain("enum MotifVariant { defaultVariant, partner }");
    expect(dart).toContain("static const MotifColors light = MotifColors(");
    expect(dart).toContain("static const MotifColors partnerLight = MotifColors(");
    expect(dart).toContain("static const MotifColors partnerDark = MotifColors(");
    const partnerLight = dart.slice(dart.indexOf("static const MotifColors partnerLight"));
    expect(partnerLight).toContain("surface: Color(0xFFFFF7ED),");
  });

  test("light and dark take a variant, and the screenshots' override wins", () => {
    expect(dart).toContain("static ThemeData light({MotifVariant variant = MotifVariant.defaultVariant})");
    expect(dart).toContain("static ThemeData dark({MotifVariant variant = MotifVariant.defaultVariant})");
    expect(dart).toContain("/// Set by Motif's screenshots. Leave it null in your app.\n  static MotifVariant? debugVariantOverride;");
    expect(dart.split("switch (debugVariantOverride ?? variant)")).toHaveLength(3);
    expect(dart).toContain("MotifVariant.partner => MotifColors.partnerDark,");
  });
});

describe("generateFlutter, an Arabic companion", () => {
  test("with google_fonts, both families load through it", () => {
    const dart = dartFor(withCompanion(validTokens()));
    expect(dart).toContain("import 'package:google_fonts/google_fonts.dart';");
    expect(dart).toContain("static TextStyle get body => _font(\n    'Onest',");
    // _font adds the companion after google_fonts has set its own fallback list.
    expect(dart).toContain("    [_family('Readex Pro')],\n  );");
    expect(dart).toContain(": font.copyWith(fontFamilyFallback: fallback);");
    expect(dart).toContain("static String _family(String family, [FontWeight weight = FontWeight.w400]) {");
    expect(dart).toContain("? GoogleFonts.getFont(family, fontWeight: weight).fontFamily!\n        : family;");
  });

  test("a bold role asks for the companion's bold face", () => {
    const t = withCompanion(validTokens());
    t.font.heading.$value.fontFamily = ["Onest", "Readex Pro"];
    expect(dartFor(t)).toContain("[_family('Readex Pro', FontWeight.w600)],");
  });

  test("a family google_fonts may not know goes through the guarded helper, never straight to getFont", () => {
    const t = validTokens();
    t.font.body.$value.fontFamily = ["Satoshi", "sans-serif"];
    const dart = dartFor(t);
    expect(dart).toContain("static TextStyle get body => _font(\n    'Satoshi',");
    expect(dart).not.toContain("getFont('Satoshi'");
  });

  test("without google_fonts, both are plain family names", () => {
    const dart = dartFor(withCompanion(validTokens()), false);
    expect(dart).not.toContain("GoogleFonts");
    expect(dart).not.toContain("google_fonts");
    expect(dart).toContain("fontFamily: 'Onest',");
    expect(dart).toContain("fontFamilyFallback: ['Readex Pro'],");
  });
});
