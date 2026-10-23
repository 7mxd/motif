import { describe, expect, test } from "bun:test";
import { srgbColor } from "../src/contract/defaults";
import { isMotifGenerated, TS_HEADER } from "../src/generate/header";
import { readableAction } from "../src/generate/readable-action";
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

  test("each curve also runs over another duration, and the comments say so in names motif check allows (fix round 1)", () => {
    expect(swift).toContain(
      "    /// The standard curve over another duration.\n    static func standard(over duration: Double) -> Animation {\n        Animation.timingCurve(0.2, 0, 0, 1, duration: duration)\n    }\n",
    );
    expect(swift).toContain("    static func exit(over duration: Double) -> Animation {\n        Animation.timingCurve(0.3, 0, 1, 1, duration: duration)\n    }\n");
    expect(swift).toContain("/// Easing curves, for withAnimation(MotifCurves.standard), over the base duration.\n/// Over another: MotifCurves.standard(over: MotifDurations.slow).\n");
    // motif check reports any typed .timingCurve(…) in the app: the comments never suggest one.
    expect(swift).not.toContain("Animation.timingCurve(…");
  });

  test("a curve takes the first duration that isn't zero when the guide has no base duration", () => {
    const t = validTokens();
    delete t.duration.base;
    const out = swiftFor(t);
    expect(out).toContain("Animation.timingCurve(0.2, 0, 0, 1, duration: MotifDurations.fast)");
    expect(out).toContain("over the fast duration.\n/// Over another: MotifCurves.standard(over: MotifDurations.slow).\n");
  });

  test("with no duration but zero, a curve runs over 0.25 seconds, and the comment names no duration it lacks", () => {
    const t = validTokens();
    for (const k of Object.keys(t.duration)) if (!k.startsWith("$") && k !== "instant") delete t.duration[k];
    const out = swiftFor(t);
    expect(out).toContain("Animation.timingCurve(0.2, 0, 0, 1, duration: 0.25)");
    expect(out).toContain("over 0.25 seconds.\nenum MotifCurves {");
    expect(out).not.toContain("Over another");
  });

  test("type: each role's family, size, line height, tracking, weight and the text style it scales with", () => {
    expect(swift).toContain("struct MotifType: Sendable {");
    expect(swift).toContain(
      "    static let display = MotifType(\n        size: 40,\n        lineHeight: 1.1,\n        tracking: 0,\n        weight: .bold,\n        textStyle: .largeTitle,\n" +
        '        family: "Inter",\n        design: .default,\n        arabicFamily: nil\n    )',
    );
    expect(swift).toContain("        size: 16,\n        lineHeight: 1.5,\n        tracking: 0,\n        weight: .regular,\n        textStyle: .callout,\n");
    expect(swift).toContain("        size: 20,\n        lineHeight: 1.3,\n        tracking: 0,\n        weight: .semibold,\n        textStyle: .title3,\n");
    expect(swift).toContain("        weight: .medium,\n        textStyle: .subheadline,\n");
    expect(swift).toContain("        size: 12,\n        lineHeight: 1.4,\n        tracking: 0,\n        weight: .regular,\n        textStyle: .caption,\n");
    // The role's own font, as before: a named font scales by itself; the system font can't.
    expect(swift).toContain("            return Font.custom(name, size: size, relativeTo: textStyle).weight(weight)");
    expect(swift).toContain("        return Font.system(size: size, weight: weight, design: design)");
    expect(swift).toContain("    func motifFont(_ type: MotifType) -> some View {");
  });

  test("Dynamic Type: .motifFont scales every role, the system font's too, with its line spacing and tracking (fix round 1)", () => {
    expect(swift).toContain("    @ScaledMetric private var size: CGFloat\n");
    expect(swift).toContain("        _size = ScaledMetric(wrappedValue: type.size, relativeTo: type.textStyle)\n");
    expect(swift).toContain("            .font(type.font(size: size))\n            .lineSpacing(type.lineSpacing(size: size))\n            .tracking(type.tracking(size: size))\n");
    // At a size .motifFont gives, a named font is fixed (the metric already scaled it) and the system font takes it as it is.
    expect(swift).toContain("            return Font.custom(name, fixedSize: size).weight(weight)");
    expect(swift).toContain("        tracking * size / max(self.size, 1)");
    // MotifType.body.font() alone can't scale a system role: the comment says so.
    expect(swift).toContain(".motifFont(.body) scales every role with Dynamic Type");
    expect(swift).toContain("MotifType.body.font() alone scales a role in a named font, not one in the system font");
  });

  test("line spacing comes from the font's own line height at run time, 1.2 times the size only when it can't be loaded (fix round 1)", () => {
    expect(swift).toContain("#if canImport(UIKit)\nimport UIKit\n#elseif canImport(AppKit)\nimport AppKit\n#endif\n");
    expect(swift).toContain("        max(0, lineHeight * size - (naturalLineHeight(size: size, arabic: useArabic) ?? 1.2 * size))");
    expect(swift).toContain("UIFont(name: name, size: size)");
    expect(swift).toContain("NSFont(name: name, size: size)");
    expect(swift).toContain("font.ascender - font.descender + font.leading");
    expect(swift).not.toContain("lineSpacing:");
  });

  test("letter spacing in points, from px or rem", () => {
    const t = validTokens();
    t.font.display.$value.letterSpacing = { value: -0.5, unit: "px" };
    t.font.caption.$value.letterSpacing = { value: 0.05, unit: "rem" };
    const out = swiftFor(t);
    expect(out).toContain("        size: 40,\n        lineHeight: 1.1,\n        tracking: -0.5,\n");
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
    expect(out).toContain('        weight: .medium,\n        textStyle: .subheadline,\n        family: "Times",\n        design: .default,\n');
    expect(out).toContain("        size: 40,\n        lineHeight: 1.1,\n        tracking: 0,\n        weight: .bold,\n        textStyle: .largeTitle,\n        family: nil,\n        design: .serif,\n");
    expect(out).toContain("        weight: .bold,\n        textStyle: .title,\n        family: nil,\n        design: .monospaced,\n");
    // Segoe UI isn't on Apple's platforms: the next family in the list.
    expect(out).toContain("        weight: .semibold,\n        textStyle: .title3,\n        family: nil,\n        design: .rounded,\n");
    // Georgia ships with iOS and macOS.
    expect(out).toContain('        textStyle: .caption,\n        family: "Georgia",\n        design: .default,\n');
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
    expect(swift).toContain('        family: "Onest",\n        design: .default,\n        arabicFamily: "Readex Pro"\n');
    expect(swift).toContain('    private static let arabicScript: Set<String> = ["ar", "fa", "ur", "ps", "ckb", "sd", "ug"]');
    expect(swift).toContain("locale.language.languageCode?.identifier");
    expect(swift).toContain("@Environment(\\.layoutDirection) private var direction");
    expect(swift).toContain("@Environment(\\.locale) private var locale");
    expect(swift).toContain("        let arabic = direction == .rightToLeft || MotifType.isArabic(locale)\n");
    expect(swift).toContain(
      "            .font(type.font(size: size, arabic: arabic))\n            .lineSpacing(type.lineSpacing(size: size, arabic: arabic))\n            .tracking(type.tracking(size: size))\n",
    );
  });

  test("the whole file", () => {
    expect(swift).toMatchSnapshot();
  });
});

describe("generateSwiftUI, the system font with an Arabic companion (v0.5.0 sweep)", () => {
  const t = validTokens();
  t.font.body.$value.fontFamily = ["system-ui", "Readex Pro"];
  const swift = swiftFor(t);

  test("Latin text in the system font, Arabic text in the companion", () => {
    expect(swift).toContain('        family: nil,\n        design: .default,\n        arabicFamily: "Readex Pro"\n');
    expect(swift).toContain("        let arabic = direction == .rightToLeft || MotifType.isArabic(locale)\n");
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

describe("generateSwiftUI, a light action colour (HiSalon's mint on a near-white page)", () => {
  /** HiSalon's light colours: mint #7EEBC1 on #F7F9F8 with white cards, about 1.4:1. Dark stays the fixture's. */
  const hisalon = (t = validTokens()) => {
    t.color["action-primary"].$value = hexColor("#7EEBC1");
    t.color.background.$value = hexColor("#F7F9F8");
    t.color.surface.$value = hexColor("#FFFFFF");
    return t;
  };
  const tokens = hisalon();
  const swift = swiftFor(tokens);
  const readable = readableAction(buildThemeSet(docFrom(tokens)))!;
  const color = (hex: string) => swiftColor(srgbColor(hex));
  /** One MotifColors instance, from its declaration to its closing parenthesis. */
  const instance = (out: string, name: string) => {
    const start = out.indexOf(`    static let ${name} = MotifColors(\n`);
    return out.slice(start, out.indexOf("    )\n", start) + 6);
  };

  test("MotifColors gains actionText, light and dark, with a doc comment", () => {
    expect(swift).toContain("\n\n    /// The action colour for text, readable on the background.\n    let actionText: Color\n\n");
    expect(readable.base.light.text).not.toBe("#7EEBC1");
    expect(instance(swift, "light")).toContain(`,\n        actionText: ${color(readable.base.light.text)}\n    )\n`);
    // Dark mode's action colour already reads: actionText is action-primary there.
    expect(instance(swift, "dark")).toContain(",\n        actionText: Color(.sRGB, red: 0.5059, green: 0.549, blue: 0.9725, opacity: 1)\n    )\n"); // #818CF8
    // The brand fill stays: actionPrimary is still the guide's mint.
    expect(instance(swift, "light")).toContain(`        actionPrimary: ${color("#7EEBC1")},\n`);
  });

  test(".motifTheme() tints with actionText, so borderless buttons, links and toolbar buttons read", () => {
    expect(swift).toContain("        content.tint(MotifColors.resolve(scheme).actionText)\n");
    expect(swift).not.toContain(".tint(MotifColors.resolve(scheme).actionPrimary)");
  });

  test("with variants, only the light variant's actionText changes; the others are action-primary", () => {
    const t = partnerTokens();
    t.color["action-primary"].$extensions["dev.motif"].variants = { partner: { value: hexColor("#7EEBC1") } };
    const out = swiftFor(t);
    const r = readableAction(buildThemeSet(docFrom(t)))!;
    expect(out).toContain("    /// The action colour for text, readable on the background.\n    let actionText: Color\n");
    expect(instance(out, "light")).toContain(`        actionText: ${color("#4338CA")}\n`);
    expect(instance(out, "dark")).toContain(`        actionText: ${color("#818CF8")}\n`);
    expect(r.variants.partner!.light.text).not.toBe("#7EEBC1");
    expect(instance(out, "partnerLight")).toContain(`        actionText: ${color(r.variants.partner!.light.text)}\n`);
    expect(instance(out, "partnerLight")).toContain(`        actionPrimary: ${color("#7EEBC1")},\n`);
    expect(instance(out, "partnerDark")).toContain(`        actionText: ${color("#818CF8")}\n`);
    expect(out).toContain("            .tint(MotifColors.resolve(scheme, variant: chosen).actionText)\n");
  });

  test("a guide with its own action-text role keeps it; the readable colour takes another name", () => {
    const t = hisalon();
    t.color["action-text"] = { $value: hexColor("#123456"), $extensions: { "dev.motif": { modes: { dark: hexColor("#654321") } } } };
    const out = swiftFor(t);
    expect(out).toContain("    let actionText: Color\n");
    expect(out).toContain("    /// The action colour for text, readable on the background.\n    let actionTextValue: Color\n");
    expect(out).toContain("        content.tint(MotifColors.resolve(scheme).actionTextValue)\n");
  });

  test("a guide whose action colour reads has no actionText at all, and tints with actionPrimary", () => {
    for (const t of [validTokens(), partnerTokens()]) {
      const out = swiftFor(t);
      expect(out).not.toContain("actionText");
      expect(out).toMatch(/\.tint\(MotifColors\.resolve\(scheme(, variant: chosen)?\)\.actionPrimary\)/);
    }
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
