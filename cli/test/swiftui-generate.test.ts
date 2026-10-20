import { describe, expect, test } from "bun:test";
import { isMotifGenerated, TS_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { generateSwiftUI, swiftColor, swiftMember, textStyleFor } from "../src/stacks/swiftui/generate";
import { docFrom, hexColor, partnerTokens, twoVariantTokens, validTokens, withCompanion } from "./helpers";

const swiftFor = (tokens: any) => {
  const files = generateSwiftUI(buildThemeSet(docFrom(tokens)));
  expect(files.map((f) => f.path)).toEqual(["MotifTheme.swift"]);
  return files[0]!.content;
};

describe("generateSwiftUI, the test guide (no variants)", () => {
  const swift = swiftFor(validTokens());

  test("starts with Motif's header, then imports SwiftUI", () => {
    expect(swift.startsWith(`${TS_HEADER}\n\nimport SwiftUI\n`)).toBe(true);
    expect(isMotifGenerated("MotifTheme.swift", swift)).toBe(true);
  });

  test("colours: one property per role, light and dark, from the guide's own components", () => {
    expect(swift).toContain("struct MotifColors: Equatable, Sendable {\n    let background: Color\n    let surface: Color\n");
    expect(swift).toContain("    let onActionPrimary: Color\n");
    expect(swift).toContain("    static let light = MotifColors(\n");
    expect(swift).toContain("    static let dark = MotifColors(\n");
    expect(swift).toContain("        actionPrimary: Color(.sRGB, red: 0.2627, green: 0.2196, blue: 0.7922, opacity: 1),\n"); // #4338CA
    expect(swift).toContain("        background: Color(.sRGB, red: 0.9765, green: 0.9804, blue: 0.9843, opacity: 1),\n");
    // Never an asset catalogue's colour.
    expect(swift).not.toMatch(/Color\("/);
    expect(swift).toContain("    static func resolve(_ scheme: ColorScheme) -> MotifColors {\n        scheme == .dark ? dark : light\n    }");
  });

  test("colours are read from the environment, which follows the colour scheme", () => {
    expect(swift).toContain("extension EnvironmentValues {");
    expect(swift).toContain("    /// The guide's colours for the colour scheme here.\n    var motifColors: MotifColors { MotifColors.resolve(colorScheme) }");
    expect(swift).not.toContain("@Entry");
    expect(swift).not.toContain("design variant");
  });

  test("without variants: no variant enum, environment value or override; .motifTheme() sets the accent colour", () => {
    expect(swift).not.toContain("MotifVariant");
    expect(swift).not.toContain("debugVariantOverride");
    expect(swift).toContain("    func motifTheme() -> some View {\n        modifier(MotifThemeModifier())\n    }");
    expect(swift).toContain(".tint(MotifColors.resolve(scheme).actionPrimary)");
  });

  test("sizes in points", () => {
    expect(swift).toContain("enum MotifSpace {\n    static let s0: CGFloat = 0\n    static let s1: CGFloat = 4\n");
    expect(swift).toContain("    static let s16: CGFloat = 64\n");
    expect(swift).toContain("enum MotifRadius {\n    static let none: CGFloat = 0\n");
    expect(swift).toContain("    static let full: CGFloat = 9999\n");
  });

  test("shadows: layers with half the CSS blur as their radius, and a modifier that draws them", () => {
    expect(swift).toContain("struct MotifShadow: Sendable {\n    let color: Color\n    let radius: CGFloat\n    let x: CGFloat\n    let y: CGFloat\n}");
    expect(swift).toContain(
      "    static let md: [MotifShadow] = [\n        MotifShadow(color: Color(.sRGB, red: 0, green: 0, blue: 0, opacity: 0.1), radius: 6, x: 0, y: 4),\n    ]",
    );
    // In CSS's order: the first layer is applied first, so it's drawn on top of the later ones' shadows.
    expect(swift).toContain("    func motifShadow(_ layers: [MotifShadow]) -> some View {\n        layers.reduce(AnyView(self)) { view, layer in\n");
    expect(swift).not.toContain("reversed()");
    expect(swift).toContain("so each later layer also casts the earlier ones");
  });

  test("a shadow's inset layers are left out, and one with none left is empty", () => {
    const t = validTokens();
    t.shadow.md.$value = [{ ...t.shadow.md.$value, spread: { value: 2, unit: "px" } }, { ...t.shadow.md.$value, inset: true }];
    t.shadow.sm.$value = { ...t.shadow.sm.$value, inset: true };
    const out = swiftFor(t);
    expect(out.match(/radius: 6, x: 0, y: 4/g)).toHaveLength(1);
    expect(out).toContain("    static let sm: [MotifShadow] = []\n");
  });

  test("motion: seconds, timing curves, springs that take the guide's duration and bounce, and reduced motion", () => {
    expect(swift).toContain("enum MotifDurations {\n    static let instant: Double = 0\n    static let fast: Double = 0.12\n    static let base: Double = 0.2\n    static let slow: Double = 0.32\n}");
    expect(swift).toContain("    static let standard = Animation.timingCurve(0.2, 0, 0, 1, duration: MotifDurations.base)\n");
    expect(swift).toContain("    static let exit = Animation.timingCurve(0.3, 0, 1, 1, duration: MotifDurations.base)\n");
    expect(swift).toContain("    static let snappy = Animation.spring(duration: 0.25, bounce: 0)\n");
    expect(swift).toContain("    static let smooth = Animation.spring(duration: 0.4, bounce: 0.1)\n");
    expect(swift).toContain("    static func animation(_ animation: Animation, reduceMotion: Bool) -> Animation? {\n        reduceMotion ? nil : animation\n    }");
    expect(swift).toContain("@Environment(\\.accessibilityReduceMotion)");
  });

  test("a curve takes the first duration that isn't zero when the guide has no base duration", () => {
    const t = validTokens();
    delete t.duration.base;
    expect(swiftFor(t)).toContain("Animation.timingCurve(0.2, 0, 0, 1, duration: MotifDurations.fast)");
  });

  test("type: each role in its family, sized relative to the nearest text style, with its weight, line spacing and tracking", () => {
    expect(swift).toContain("struct MotifType: Sendable {");
    expect(swift).toContain(
      "    static let display = MotifType(\n        size: 40,\n        lineSpacing: 0,\n        tracking: 0,\n        latin: Font.custom(\"Inter\", size: 40, relativeTo: .largeTitle).weight(.bold),\n        arabic: nil\n    )",
    );
    // 16 × 1.5 = 24, less the usual 1.2 × 16.
    expect(swift).toContain("        size: 16,\n        lineSpacing: 4.8,\n");
    expect(swift).toContain('Font.custom("Inter", size: 16, relativeTo: .callout).weight(.regular)');
    expect(swift).toContain('Font.custom("Inter", size: 20, relativeTo: .title3).weight(.semibold)');
    expect(swift).toContain('Font.custom("Inter", size: 14, relativeTo: .subheadline).weight(.medium)');
    expect(swift).toContain('Font.custom("Inter", size: 12, relativeTo: .caption).weight(.regular)');
    // Only a role in a named font scales with Dynamic Type: Font.system(size:) keeps its size.
    expect(swift).toContain("A role in a named font (Font.custom) scales with Dynamic Type");
    expect(swift).toContain("a role in the system font (Font.system(size:)) keeps its size.");
    expect(swift).toContain("    func motifFont(_ type: MotifType) -> some View {");
    expect(swift).toContain(".lineSpacing(type.lineSpacing)");
    expect(swift).toContain(".tracking(type.tracking)");
  });

  test("letter spacing in points, from px or rem", () => {
    const t = validTokens();
    t.font.display.$value.letterSpacing = { value: -0.5, unit: "px" };
    t.font.caption.$value.letterSpacing = { value: 0.05, unit: "rem" };
    const out = swiftFor(t);
    expect(out).toContain("        size: 40,\n        lineSpacing: 0,\n        tracking: -0.5,\n");
    expect(out).toContain("        tracking: 0.8,\n");
  });

  test("generic and Apple system families become the system font in their design", () => {
    const t = validTokens();
    t.font.display.$value.fontFamily = ["ui-serif", "serif"];
    t.font.title.$value.fontFamily = ["SF Mono", "monospace"];
    t.font.heading.$value.fontFamily = ["Segoe UI", "ui-rounded"];
    t.font.caption.$value.fontFamily = ["Georgia", "serif"];
    t.font.label.$value.fontFamily = ["Times", "serif"];
    const out = swiftFor(t);
    expect(out).toContain('Font.custom("Times", size: 14, relativeTo: .subheadline).weight(.medium)');
    expect(out).toContain("Font.system(size: 40, weight: .bold, design: .serif)");
    expect(out).toContain("Font.system(size: 28, weight: .bold, design: .monospaced)");
    // Segoe UI isn't on Apple's platforms: the next family in the list.
    expect(out).toContain("Font.system(size: 20, weight: .semibold, design: .rounded)");
    // Georgia ships with iOS and macOS.
    expect(out).toContain('Font.custom("Georgia", size: 12, relativeTo: .caption).weight(.regular)');
  });

  test("no Arabic companion: the modifier doesn't look at the locale", () => {
    expect(swift).not.toContain("Readex");
    expect(swift).not.toContain("\\.locale");
  });

  test("the whole file", () => {
    expect(swift).toMatchSnapshot();
  });
});

describe("generateSwiftUI, two variants and an Arabic companion", () => {
  const swift = swiftFor(withCompanion(partnerTokens()));

  test("the variants as a String enum, the default first, a Swift keyword suffixed", () => {
    expect(swift).toContain('enum MotifVariant: String, CaseIterable, Sendable {\n    case defaultVariant = "default"\n    case partner\n}');
  });

  test("each variant's colours, light and dark, and resolve picks them", () => {
    expect(swift).toContain("    static let partnerLight = MotifColors(\n");
    expect(swift).toContain("    static let partnerDark = MotifColors(\n");
    expect(swift).toContain("        surface: Color(.sRGB, red: 1, green: 0.9686, blue: 0.9294, opacity: 1),\n"); // #FFF7ED
    expect(swift).toContain(
      "    static func resolve(_ scheme: ColorScheme, variant: MotifVariant = .defaultVariant) -> MotifColors {\n" +
        "        switch variant {\n" +
        "        case .defaultVariant: return scheme == .dark ? dark : light\n" +
        "        case .partner: return scheme == .dark ? partnerDark : partnerLight\n" +
        "        }\n    }",
    );
  });

  test("the variant is an environment value, which .motifTheme(variant:) sets, and the screenshots can override", () => {
    expect(swift).toContain("    @Entry var motifVariant: MotifVariant = .defaultVariant\n");
    expect(swift).toContain("    var motifColors: MotifColors { MotifColors.resolve(colorScheme, variant: motifVariant) }");
    expect(swift).toContain("enum MotifTheme {\n    /// Set by Motif's screenshots. Leave it nil in your app.\n    @MainActor static var debugVariantOverride: MotifVariant?\n}");
    expect(swift).toContain("    func motifTheme(variant: MotifVariant = .defaultVariant) -> some View {");
    expect(swift).toContain("let chosen = MotifTheme.debugVariantOverride ?? variant");
    expect(swift).toContain(".environment(\\.motifVariant, chosen)");
    expect(swift).toContain(".tint(MotifColors.resolve(scheme, variant: chosen).actionPrimary)");
  });

  test("a role with an Arabic companion has both fonts, and .motifFont picks by direction and language", () => {
    expect(swift).toContain(
      '        latin: Font.custom("Onest", size: 16, relativeTo: .callout).weight(.regular),\n        arabic: Font.custom("Readex Pro", size: 16, relativeTo: .callout).weight(.regular)\n',
    );
    expect(swift).toContain('    private static let arabicScript: Set<String> = ["ar", "fa", "ur", "ps", "ckb", "sd", "ug"]');
    expect(swift).toContain("locale.language.languageCode?.identifier");
    expect(swift).toContain("@Environment(\\.layoutDirection) private var direction");
    expect(swift).toContain("@Environment(\\.locale) private var locale");
    expect(swift).toContain(".font(type.font(arabic: direction == .rightToLeft || MotifType.isArabic(locale)))");
  });

  test("the whole file", () => {
    expect(swift).toMatchSnapshot();
  });
});

describe("generateSwiftUI, variants whose default isn't called default", () => {
  const swift = swiftFor(twoVariantTokens());

  test("every default is the guide's own default variant", () => {
    expect(swift).toContain("enum MotifVariant: String, CaseIterable, Sendable {\n    case women\n    case men\n}");
    expect(swift).toContain("    static func resolve(_ scheme: ColorScheme, variant: MotifVariant = .women) -> MotifColors {");
    expect(swift).toContain("        case .women: return scheme == .dark ? dark : light\n        case .men: return scheme == .dark ? menDark : menLight\n");
    expect(swift).toContain("    @Entry var motifVariant: MotifVariant = .women\n");
    expect(swift).toContain("    func motifTheme(variant: MotifVariant = .women) -> some View {");
    expect(swift).not.toContain("defaultVariant");
  });
});

describe("Swift names and values", () => {
  test("members: lowerCamelCase, a keyword or a taken name gets Value", () => {
    expect(swiftMember("on-action-primary", "c")).toBe("onActionPrimary");
    expect(swiftMember("0-5", "s")).toBe("s0p5");
    expect(swiftMember("2xl", "r")).toBe("r2xl");
    expect(swiftMember("default", "r")).toBe("defaultValue");
    expect(swiftMember("light", "c", new Set(["light"]))).toBe("lightValue");
  });

  test("colours: sRGB and Display P3 from their components, anything else from its hex; alpha as opacity", () => {
    expect(swiftColor(hexColor("#4338CA"))).toBe("Color(.sRGB, red: 0.2627, green: 0.2196, blue: 0.7922, opacity: 1)");
    expect(swiftColor({ colorSpace: "display-p3", components: [1, 0, "none"], alpha: 0.5, hex: "#FF0000" })).toBe(
      "Color(.displayP3, red: 1, green: 0, blue: 0, opacity: 0.5)",
    );
    expect(swiftColor({ colorSpace: "oklch", components: [0.6, 0.2, 30], hex: "#FF0000" })).toBe("Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 1)");
  });

  test("text styles: the nearest by size, body before headline", () => {
    expect(textStyleFor(40)).toBe("largeTitle");
    expect(textStyleFor(17)).toBe("body");
    expect(textStyleFor(24)).toBe("title2");
    expect(textStyleFor(9)).toBe("caption2");
  });

  test("role names that clash with MotifColors' or MotifType's own members get Value", () => {
    const t = validTokens();
    t.color.light = { $type: "color", $value: hexColor("#FFFFFF") };
    t.font.size = JSON.parse(JSON.stringify(t.font.body));
    const out = swiftFor(t);
    expect(out).toContain("    let lightValue: Color\n");
    expect(out).toContain("    static let sizeValue = MotifType(\n");
  });
});
