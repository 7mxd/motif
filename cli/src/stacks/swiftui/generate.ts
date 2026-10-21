// SwiftUI theme code: one Swift file with the guide's colours (every variant, light and dark), type, sizes and motion.
import type { DtcgColor } from "../../contract/values";
import { num } from "../../generate/css-values";
import { TS_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme, ThemeFont, ThemeSet, ThemeShadowLayer } from "../../generate/theme";
import { stackFamilies, themeFonts, type ThemeFontUse } from "../../generate/theme-fonts";
import { lowerCamel, RESERVED, swiftIdentifier } from "../naming";

export const THEME_FILE = "MotifTheme.swift";

/** A role name as a lowerCamelCase Swift member, never a keyword or a name the type already uses (it gets "Value"). */
export function swiftMember(name: string, lead: string, taken: Set<string> = new Set()): string {
  const id = lowerCamel(name, lead);
  return RESERVED.swift.has(id) || taken.has(id) ? `${id}Value` : id;
}

const channel = (c: number | "none") => num(c === "none" ? 0 : c);

/** `Color(.sRGB, red:green:blue:opacity:)` from the guide's components (Display P3 kept as it is); other spaces from the hex. */
export function swiftColor(c: DtcgColor): string {
  const opacity = num(c.alpha ?? 1);
  if (c.colorSpace === "srgb" || c.colorSpace === "display-p3") {
    const [r, g, b] = c.components;
    const space = c.colorSpace === "srgb" ? ".sRGB" : ".displayP3";
    return `Color(${space}, red: ${channel(r!)}, green: ${channel(g!)}, blue: ${channel(b!)}, opacity: ${opacity})`;
  }
  const hex = (c.hex ?? "#000000").slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => num(parseInt(hex.slice(i, i + 2), 16) / 255));
  return `Color(.sRGB, red: ${r}, green: ${g}, blue: ${b}, opacity: ${opacity})`;
}

/** Dynamic Type's text styles and their sizes at the default setting on iOS, largest first; body before headline. */
const TEXT_STYLES: [string, number][] = [
  ["largeTitle", 34], ["title", 28], ["title2", 22], ["title3", 20], ["body", 17], ["headline", 17],
  ["callout", 16], ["subheadline", 15], ["footnote", 13], ["caption", 12], ["caption2", 11],
];

/** The text style whose size is nearest (the larger one on a tie): a role's font scales with it under Dynamic Type. */
export function textStyleFor(size: number): string {
  let best = TEXT_STYLES[0]!;
  for (const s of TEXT_STYLES) if (Math.abs(s[1] - size) < Math.abs(best[1] - size)) best = s;
  return best[0];
}

const WEIGHTS: [number, string][] = [
  [100, "ultraLight"], [200, "thin"], [300, "light"], [400, "regular"], [500, "medium"], [600, "semibold"], [700, "bold"], [800, "heavy"], [900, "black"],
];
const fontWeight = (w: number) => `.${WEIGHTS.find(([n]) => n === Math.min(900, Math.max(100, Math.round(w / 100) * 100)))![1]}`;

const swiftString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Letter spacing in points, from the guide's px or rem value. */
function tracking(css: string | undefined): number {
  const m = css?.match(/^(-?[\d.]+)(px|rem)$/);
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : 0;
}

/** CSS's generic families and Apple's own system families, as the system font's designs. */
const SYSTEM_DESIGN: Record<string, string> = {
  "sans-serif": "default",
  "ui-sans-serif": "default",
  "system-ui": "default",
  "-apple-system": "default",
  blinkmacsystemfont: "default",
  "sf pro": "default",
  "sf pro text": "default",
  "sf pro display": "default",
  serif: "serif",
  "ui-serif": "serif",
  "new york": "serif",
  monospace: "monospaced",
  "ui-monospace": "monospaced",
  "sf mono": "monospaced",
  "sfmono-regular": "monospaced",
  "ui-rounded": "rounded",
  cursive: "default",
  fantasy: "default",
  math: "default",
  emoji: "default",
  fangsong: "default",
};

/** System fonts that ship with both iOS and macOS, so Font.custom finds them by name. */
const APPLE_FONTS = new Set(["arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman", "courier", "courier new", "verdana", "trebuchet ms", "menlo"]);

/** Languages written in Arabic script, whose text takes the type roles' Arabic companion. */
const ARABIC_SCRIPT = ["ar", "fa", "ur", "ps", "ckb", "sd", "ug"];

/** The natural line a font has when it can't be loaded: about 1.2 times its size, as San Francisco's (decision 0010, §7). */
const NATURAL_LINE = 1.2;

/** How a type role draws: its first family Apple can draw (null for the system font, in its design), and its Arabic companion's. */
function typePlan(t: Theme) {
  const uses = new Map<string, ThemeFontUse>(themeFonts(t).map((u) => [u.family.toLowerCase(), u]));

  const primary = (font: ThemeFont): { family: string | null; design: string } => {
    for (const raw of font.family.split(",")) {
      const name = raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
      const key = name.toLowerCase();
      if (SYSTEM_DESIGN[key]) return { family: null, design: SYSTEM_DESIGN[key]! };
      if (APPLE_FONTS.has(key)) return { family: name, design: "default" };
      const use = uses.get(key);
      if (use && use.source !== "system") return { family: use.family, design: "default" };
    }
    return { family: null, design: "default" };
  };

  return t.fonts.map((font) => {
    const first = primary(font);
    const second = stackFamilies(font.family)[1];
    const use = second ? uses.get(second.toLowerCase()) : undefined;
    const arabic = use && use.source !== "system" && use.family.toLowerCase() !== first.family?.toLowerCase() ? use.family : null;
    return { font, family: first.family, design: first.design, arabic };
  });
}

function doc(lines: string[], indent = 0): string[] {
  const pad = " ".repeat(indent);
  return lines.map((l) => (l ? `${pad}/// ${l}` : `${pad}///`));
}

const oneLine = (label: string) => label.replace(/\s+/g, " ").trim();

function variantsBlock(set: ThemeSet): string[] {
  const ids = [set.defaultId!, ...set.variants.map((v) => v.id)];
  return [
    "",
    ...doc(["The guide's design variants. The default comes first."]),
    "enum MotifVariant: String, CaseIterable, Sendable {",
    ...ids.map((id) => {
      const name = swiftIdentifier(id);
      return name === id ? `    case ${name}` : `    case ${name} = ${swiftString(id)}`;
    }),
    "}",
  ];
}

function colorsBlock(set: ThemeSet, variants: boolean): string[] {
  const colors = set.base.colors;
  const instanceNames = ["light", "dark", ...set.variants.flatMap((v) => [`${swiftIdentifier(v.id)}Light`, `${swiftIdentifier(v.id)}Dark`])];
  const taken = new Set(["resolve", ...instanceNames]);
  const fields = colors.map((c) => swiftMember(c.name, "c", taken));
  const instance = (name: string, theme: Theme, mode: "light" | "dark", what: string): string[] => {
    const byName = new Map(theme.colors.map((c) => [c.name, c]));
    return [
      ...doc([what], 4),
      `    static let ${name} = MotifColors(`,
      ...colors.map((c, i) => `        ${fields[i]}: ${swiftColor((byName.get(c.name) ?? c)[mode])}${i < colors.length - 1 ? "," : ""}`),
      "    )",
    ];
  };
  const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  const defaultName = set.defaultLabel && variants ? `${oneLine(set.defaultLabel)} variant, ` : "";
  const instances = [
    ...instance("light", set.base, "light", cap(`${defaultName}light mode.`)),
    "",
    ...instance("dark", set.base, "dark", cap(`${defaultName}dark mode.`)),
    ...set.variants.flatMap((v) => {
      const id = swiftIdentifier(v.id);
      const what = (mode: string) => `${oneLine(v.label)} variant, ${mode} mode.`;
      return ["", ...instance(`${id}Light`, v.theme, "light", what("light")), "", ...instance(`${id}Dark`, v.theme, "dark", what("dark"))];
    }),
  ];
  const resolve = variants
    ? [
        ...doc(["The colours for a colour scheme and a design variant."], 4),
        `    static func resolve(_ scheme: ColorScheme, variant: MotifVariant = .${swiftIdentifier(set.defaultId!)}) -> MotifColors {`,
        "        switch variant {",
        `        case .${swiftIdentifier(set.defaultId!)}: return scheme == .dark ? dark : light`,
        ...set.variants.map((v) => {
          const id = swiftIdentifier(v.id);
          return `        case .${id}: return scheme == .dark ? ${id}Dark : ${id}Light`;
        }),
        "        }",
        "    }",
      ]
    : [...doc(["The colours for a colour scheme."], 4), "    static func resolve(_ scheme: ColorScheme) -> MotifColors {", "        scheme == .dark ? dark : light", "    }"];
  return [
    "",
    ...doc(["The guide's colour roles, light and dark.", "", "Read them in a view with @Environment(\\.motifColors) private var colors."]),
    "struct MotifColors: Equatable, Sendable {",
    ...fields.map((f) => `    let ${f}: Color`),
    "",
    ...instances,
    "",
    ...resolve,
    "}",
  ];
}

function environmentBlock(set: ThemeSet, variants: boolean, accent: string | null): string[] {
  const def = variants ? swiftIdentifier(set.defaultId!) : "";
  const resolved = variants ? "MotifColors.resolve(colorScheme, variant: motifVariant)" : "MotifColors.resolve(colorScheme)";
  const lines = [
    "",
    "extension EnvironmentValues {",
    ...(variants ? [...doc(["The design variant .motifTheme(variant:) chose."], 4), `    @Entry var motifVariant: MotifVariant = .${def}`, ""] : []),
    ...doc([variants ? "The guide's colours for the colour scheme and the design variant here." : "The guide's colours for the colour scheme here."], 4),
    `    var motifColors: MotifColors { ${resolved} }`,
    "}",
  ];
  if (variants) {
    lines.push("", ...doc(["The theme's settings."]), "enum MotifTheme {", "    /// Set by Motif's screenshots. Leave it nil in your app.", "    @MainActor static var debugVariantOverride: MotifVariant?", "}");
  }
  const what = [variants ? "the design variant" : null, accent ? "the accent colour (tint)" : null].filter(Boolean).join(" and ");
  lines.push(
    "",
    "extension View {",
    ...doc([`The guide's theme for this view and the views inside it${what ? `: ${what}` : ""}.`, "Apply it to your root view, in your App's WindowGroup."], 4),
    variants ? `    func motifTheme(variant: MotifVariant = .${def}) -> some View {` : "    func motifTheme() -> some View {",
    variants ? "        modifier(MotifThemeModifier(variant: variant))" : "        modifier(MotifThemeModifier())",
    "    }",
    "}",
    "",
    "private struct MotifThemeModifier: ViewModifier {",
  );
  if (variants) lines.push("    let variant: MotifVariant");
  if (accent) lines.push("    @Environment(\\.colorScheme) private var scheme");
  if (variants || accent) lines.push("");
  lines.push("    func body(content: Content) -> some View {");
  if (variants) {
    lines.push("        let chosen = MotifTheme.debugVariantOverride ?? variant", "        return content", "            .environment(\\.motifVariant, chosen)");
    if (accent) lines.push(`            .tint(MotifColors.resolve(scheme, variant: chosen).${accent})`);
  } else if (accent) {
    lines.push(`        content.tint(MotifColors.resolve(scheme).${accent})`);
  } else {
    lines.push("        content");
  }
  lines.push("    }", "}");
  return lines;
}

function sizesBlock(name: string, what: string, sizes: { name: string; px: number }[], lead: string): string[] {
  return ["", ...doc([what]), `enum ${name} {`, ...sizes.map((s) => `    static let ${swiftMember(s.name, lead)}: CGFloat = ${num(s.px)}`), "}"];
}

/** A shadow's layers. Inset layers are left out, and spread too: SwiftUI's shadows have neither. */
function shadowLayers(layers: ThemeShadowLayer[]): string[] {
  return layers.filter((l) => !l.inset).map((l) => `MotifShadow(color: ${swiftColor(l.color)}, radius: ${num(l.blur / 2)}, x: ${num(l.x)}, y: ${num(l.y)})`);
}

function shadowsBlock(t: Theme): string[] {
  return [
    "",
    ...doc(["One layer of a shadow. The radius is half the CSS blur, as SwiftUI blurs it."]),
    "struct MotifShadow: Sendable {",
    "    let color: Color",
    "    let radius: CGFloat",
    "    let x: CGFloat",
    "    let y: CGFloat",
    "}",
    "",
    ...doc(["Shadows, for .motifShadow(MotifShadows.md). Inset layers and spread are left out."]),
    "enum MotifShadows {",
    ...t.shadows.flatMap((s) => {
      const layers = shadowLayers(s.layers);
      const name = swiftMember(s.name, "s");
      return layers.length === 0 ? [`    static let ${name}: [MotifShadow] = []`] : [`    static let ${name}: [MotifShadow] = [`, ...layers.map((l) => `        ${l},`), "    ]"];
    }),
    "}",
    "",
    "extension View {",
    ...doc([
      "Draws the shadow's layers around the view in CSS's order, the first on top. SwiftUI shadows the view with",
      "the earlier layers' shadows in it, so each later layer also casts the earlier ones: they compound a little.",
    ], 4),
    "    func motifShadow(_ layers: [MotifShadow]) -> some View {",
    "        layers.reduce(AnyView(self)) { view, layer in",
    "            AnyView(view.shadow(color: layer.color, radius: layer.radius, x: layer.x, y: layer.y))",
    "        }",
    "    }",
    "}",
  ];
}

function motionBlock(t: Theme): string[] {
  const durations = t.durations.map((d) => ({ ...d, member: swiftMember(d.name, "d") }));
  const base = durations.find((d) => d.name === "base") ?? durations.find((d) => d.ms > 0);
  const curveDuration = base ? `MotifDurations.${base.member}` : "0.25";
  // Another of the guide's durations for the comment: the longest that isn't the curves' own.
  const other = durations.filter((d) => d.ms > 0 && d !== base).sort((a, b) => b.ms - a.ms)[0];
  const curves = t.easings.map((e) => ({ member: swiftMember(e.name, "e"), name: e.name, points: e.points.map(num).join(", ") }));
  const first = curves[0]?.member ?? "standard";
  return [
    "",
    ...doc(["Durations, in seconds."]),
    "enum MotifDurations {",
    ...durations.map((d) => `    static let ${d.member}: Double = ${num(d.ms / 1000)}`),
    "}",
    "",
    ...doc([
      `Easing curves, for withAnimation(MotifCurves.${first}), over ${base ? `the ${base.name} duration` : "0.25 seconds"}.`,
      ...(other ? [`Over another: MotifCurves.${first}(over: MotifDurations.${other.member}).`] : []),
    ]),
    "enum MotifCurves {",
    ...curves.flatMap((c, i) => [
      ...(i > 0 ? [""] : []),
      `    static let ${c.member} = Animation.timingCurve(${c.points}, duration: ${curveDuration})`,
      ...doc([`The ${c.name} curve over another duration.`], 4),
      `    static func ${c.member}(over duration: Double) -> Animation {`,
      `        Animation.timingCurve(${c.points}, duration: duration)`,
      "    }",
    ]),
    "}",
    "",
    ...doc(["Springs, for withAnimation(MotifSprings.snappy): the guide's own duration and bounce."]),
    "enum MotifSprings {",
    ...t.springs.map((s) => `    static let ${swiftMember(s.name, "s")} = Animation.spring(duration: ${num(s.duration)}, bounce: ${num(s.bounce)})`),
    "}",
    "",
    ...doc([
      "Reduced motion. Read the setting in a view, and pass it with each animation:",
      "",
      "    @Environment(\\.accessibilityReduceMotion) private var reduceMotion",
      "    withAnimation(MotifMotion.animation(MotifSprings.snappy, reduceMotion: reduceMotion)) { … }",
    ]),
    "enum MotifMotion {",
    ...doc(["The animation, or none when the person asks for less motion."], 4),
    "    static func animation(_ animation: Animation, reduceMotion: Bool) -> Animation? {",
    "        reduceMotion ? nil : animation",
    "    }",
    "}",
  ];
}

/** The members of MotifType itself, which a role's name mustn't take. */
export const TYPE_MEMBERS = new Set([
  "size", "lineHeight", "tracking", "weight", "textStyle", "family", "design", "arabicFamily", "font", "lineSpacing", "naturalLineHeight",
  "systemDesign", "isArabic", "arabicScript",
]);

/** How the font's own line height is read, on iOS (UIKit) and on the Mac (AppKit): decision 0010, §7. */
const NATURAL_LINE_HEIGHT = [
  "    /// The font's own line height at a size (its ascender, descender and leading), or nil when it can't be loaded.",
  "    func naturalLineHeight(size: CGFloat, arabic useArabic: Bool = false) -> CGFloat? {",
  "        let name = useArabic ? (arabicFamily ?? family) : family",
  "        #if canImport(UIKit)",
  "        if let name {",
  "            if let font = UIFont(name: name, size: size) { return font.lineHeight }",
  "            let font = UIFont(descriptor: UIFontDescriptor(fontAttributes: [.family: name]), size: size)",
  "            return font.familyName.caseInsensitiveCompare(name) == .orderedSame ? font.lineHeight : nil",
  "        }",
  "        let system = UIFont.systemFont(ofSize: size)",
  "        return (system.fontDescriptor.withDesign(systemDesign).map { UIFont(descriptor: $0, size: size) } ?? system).lineHeight",
  "        #elseif canImport(AppKit)",
  "        let font: NSFont?",
  "        if let name {",
  "            let byFamily = NSFont(descriptor: NSFontDescriptor(fontAttributes: [.family: name]), size: size)",
  "            font = NSFont(name: name, size: size) ?? (byFamily?.familyName?.caseInsensitiveCompare(name) == .orderedSame ? byFamily : nil)",
  "        } else {",
  "            let system = NSFont.systemFont(ofSize: size)",
  "            font = system.fontDescriptor.withDesign(systemDesign).flatMap { NSFont(descriptor: $0, size: size) } ?? system",
  "        }",
  "        guard let font else { return nil }",
  "        return font.ascender - font.descender + font.leading",
  "        #else",
  "        return nil",
  "        #endif",
  "    }",
  "",
  "    #if canImport(UIKit)",
  "    private var systemDesign: UIFontDescriptor.SystemDesign {",
  "        design == .serif ? .serif : design == .rounded ? .rounded : design == .monospaced ? .monospaced : .default",
  "    }",
  "    #elseif canImport(AppKit)",
  "    private var systemDesign: NSFontDescriptor.SystemDesign {",
  "        design == .serif ? .serif : design == .rounded ? .rounded : design == .monospaced ? .monospaced : .default",
  "    }",
  "    #endif",
];

function typeBlock(t: Theme): string[] {
  const plan = typePlan(t);
  const arabic = plan.some((r) => r.arabic);
  const roles = plan.flatMap(({ font, family, design, arabic: companion }, i) => [
    ...(i > 0 ? [""] : []),
    `    static let ${swiftMember(font.name, "t", TYPE_MEMBERS)} = MotifType(`,
    `        size: ${num(font.sizePx)},`,
    `        lineHeight: ${num(font.lineHeight)},`,
    `        tracking: ${num(tracking(font.letterSpacing))},`,
    `        weight: ${fontWeight(font.weight)},`,
    `        textStyle: .${textStyleFor(font.sizePx)},`,
    `        family: ${family === null ? "nil" : swiftString(family)},`,
    `        design: .${design},`,
    `        arabicFamily: ${companion === null ? "nil" : swiftString(companion)}`,
    "    )",
  ]);
  const scaled = (a: string) => [
    `            .font(type.font(size: size${a}))`,
    `            .lineSpacing(type.lineSpacing(size: size${a}))`,
    "            .tracking(type.tracking(size: size))",
  ];
  return [
    "",
    ...doc([
      "A type role: its font, its line height and its letter spacing. It carries no colour, so the view's foreground",
      "style applies.",
      "",
      "Use it with .motifFont(.body), which sets all three. .motifFont(.body) scales every role with Dynamic Type",
      "(relative to the role's text style), the system font's too, with its line spacing and letter spacing; the line",
      `spacing comes from the font's own line height (${NATURAL_LINE} times the size when the font can't be loaded).`,
      "Where a Font is needed: MotifType.body.font(), which sets neither spacing.",
      "MotifType.body.font() alone scales a role in a named font, not one in the system font: prefer .motifFont.",
      ...(arabic ? ["A role with an Arabic companion uses it when the layout is right to left or the language is written in Arabic script."] : []),
    ]),
    "struct MotifType: Sendable {",
    ...doc(["The size in points, before Dynamic Type."], 4),
    "    let size: CGFloat",
    ...doc(["The guide's line height, as a multiple of the size."], 4),
    "    let lineHeight: CGFloat",
    ...doc(["Letter spacing in points, before Dynamic Type."], 4),
    "    let tracking: CGFloat",
    "    let weight: Font.Weight",
    ...doc(["The Dynamic Type text style the role scales with."], 4),
    "    let textStyle: Font.TextStyle",
    ...doc(["The font's family, or nil for the system font in its design."], 4),
    "    let family: String?",
    "    let design: Font.Design",
    ...doc(["The Arabic companion's family, when the role has one."], 4),
    "    let arabicFamily: String?",
    "",
    ...doc([
      "The role's font at its own size, or its Arabic companion's (the role's own font when it has none). A named font",
      "scales with Dynamic Type by itself; the system font keeps its size: use .motifFont for that.",
    ], 4),
    "    func font(arabic useArabic: Bool = false) -> Font {",
    "        if let name = useArabic ? (arabicFamily ?? family) : family {",
    "            return Font.custom(name, size: size, relativeTo: textStyle).weight(weight)",
    "        }",
    "        return Font.system(size: size, weight: weight, design: design)",
    "    }",
    "",
    ...doc(["The role's font at a size Dynamic Type has already scaled, as .motifFont gives it."], 4),
    "    func font(size: CGFloat, arabic useArabic: Bool = false) -> Font {",
    "        if let name = useArabic ? (arabicFamily ?? family) : family {",
    "            return Font.custom(name, fixedSize: size).weight(weight)",
    "        }",
    "        return Font.system(size: size, weight: weight, design: design)",
    "    }",
    "",
    ...doc(["Letter spacing at a scaled size."], 4),
    "    func tracking(size: CGFloat) -> CGFloat {",
    "        tracking * size / max(self.size, 1)",
    "    }",
    "",
    ...doc([
      "The space between lines at a scaled size: the guide's line height less the font's own, read from the font",
      `(${NATURAL_LINE} times the size when it can't be loaded).`,
    ], 4),
    "    func lineSpacing(size: CGFloat, arabic useArabic: Bool = false) -> CGFloat {",
    `        max(0, lineHeight * size - (naturalLineHeight(size: size, arabic: useArabic) ?? ${NATURAL_LINE} * size))`,
    "    }",
    "",
    ...NATURAL_LINE_HEIGHT,
    ...(arabic
      ? [
          "",
          ...doc(["Languages written in Arabic script: their text takes the Arabic companion."], 4),
          `    private static let arabicScript: Set<String> = [${ARABIC_SCRIPT.map((l) => `"${l}"`).join(", ")}]`,
          "",
          ...doc(["True when the locale's language is written in Arabic script."], 4),
          "    static func isArabic(_ locale: Locale) -> Bool {",
          '        arabicScript.contains(locale.language.languageCode?.identifier ?? "")',
          "    }",
        ]
      : []),
    "",
    ...roles,
    "}",
    "",
    "extension View {",
    ...doc(["The type role's font, line spacing and letter spacing, scaled with Dynamic Type.", ...(arabic ? ["Its Arabic companion when the layout is right to left or the language is written in Arabic script."] : [])], 4),
    "    func motifFont(_ type: MotifType) -> some View {",
    "        modifier(MotifFontModifier(type: type))",
    "    }",
    "}",
    "",
    "private struct MotifFontModifier: ViewModifier {",
    "    let type: MotifType",
    ...doc(["The role's size, scaled with Dynamic Type relative to its text style."], 4),
    "    @ScaledMetric private var size: CGFloat",
    ...(arabic ? ["    @Environment(\\.layoutDirection) private var direction", "    @Environment(\\.locale) private var locale"] : []),
    "",
    "    init(type: MotifType) {",
    "        self.type = type",
    "        _size = ScaledMetric(wrappedValue: type.size, relativeTo: type.textStyle)",
    "    }",
    "",
    "    func body(content: Content) -> some View {",
    ...(arabic
      ? ["        let arabic = direction == .rightToLeft || MotifType.isArabic(locale)", "        return content", ...scaled(", arabic: arabic")]
      : ["        content", ...scaled("")]),
    "    }",
    "}",
  ];
}

/** SwiftUI theme code for the guide. The file's path is relative to the app's theme folder. */
export function generateSwiftUI(set: ThemeSet): GeneratedFile[] {
  const t = set.base;
  const variants = set.variants.length > 0 && set.defaultId !== null;
  const accent = t.colors.some((c) => c.name === "action-primary") ? swiftMember("action-primary", "c") : null;
  const lines = [
    TS_HEADER,
    "",
    "import SwiftUI",
    "#if canImport(UIKit)",
    "import UIKit",
    "#elseif canImport(AppKit)",
    "import AppKit",
    "#endif",
    ...(variants ? variantsBlock(set) : []),
    ...colorsBlock(set, variants),
    ...environmentBlock(set, variants, accent),
    ...sizesBlock("MotifSpace", "Spacing, in points.", t.space, "s"),
    ...sizesBlock("MotifRadius", "Corner radii, in points.", t.radius, "r"),
    ...shadowsBlock(t),
    ...motionBlock(t),
    ...typeBlock(t),
    "",
  ];
  return [{ path: THEME_FILE, content: lines.join("\n") }];
}
