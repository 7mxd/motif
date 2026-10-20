// Flutter theme code: one Dart file with the guide's colours (every variant, light and dark), type, sizes and motion.
import { springPhysics } from "../../contract/spring";
import type { DtcgColor } from "../../contract/values";
import { num } from "../../generate/css-values";
import { TS_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme, ThemeFont, ThemeSet, ThemeShadowLayer } from "../../generate/theme";
import { stackFamilies, themeFonts } from "../../generate/theme-fonts";
import { dartIdentifier, RESERVED } from "../naming";

export const THEME_FILE = "motif_theme.dart";

/** dart format's line width. */
const WIDTH = 80;

/** A Dart expression: plain text, or a call or literal whose arguments split one per line when it doesn't fit. */
type Expr = string | Call;
interface Call {
  head: string;
  args: Expr[];
  close: string;
}

const call = (head: string, args: Expr[], close = ")"): Call => ({ head, args, close });

const flat = (e: Expr): string =>
  typeof e === "string" ? e : `${e.head}${e.args.map(flat).join(", ")}${e.close}`;

/** The expression as dart format (language 3.8 and later) lays it out, after `prefix` at `indent` spaces, ending with `suffix`. */
function render(e: Expr, indent: number, prefix = "", suffix = ""): string[] {
  const pad = " ".repeat(indent);
  const one = `${pad}${prefix}${flat(e)}${suffix}`;
  if (one.length <= WIDTH) return [one];
  if (typeof e === "string") {
    // A named argument too long for its line moves its value to the next one.
    const named = prefix === "" ? e.match(/^(\w+): (.+)$/) : null;
    return named ? [`${pad}${named[1]}:`, `${pad}    ${named[2]}${suffix}`] : [one];
  }
  if (e.args.length === 0) return [one];
  return [`${pad}${prefix}${e.head}`, ...e.args.flatMap((a) => render(a, indent + 2, "", ",")), `${pad}${e.close}${suffix}`];
}

/** `0xAARRGGBB`, from the colour's hex and alpha. */
export function dartColor(c: DtcgColor): string {
  const alpha = Math.round((c.alpha ?? 1) * 255).toString(16).padStart(2, "0");
  return `Color(0x${`${alpha}${(c.hex ?? "#000000").slice(1)}`.toUpperCase()})`;
}

/** Names MotifColors already uses for its own members. */
const COLOR_MEMBERS = new Set(["light", "dark", "of", "copyWith", "lerp", "type", "hashCode", "runtimeType", "toString", "noSuchMethod"]);

/**
 * A role name as a lowerCamelCase Dart member: words joined (on-action-primary → onActionPrimary), "p" for a point
 * between digits (0-5 → 0p5), a letter in front of a leading digit, and never a keyword.
 */
export function member(name: string, lead: string, taken: Set<string> = new Set()): string {
  const words = name.replace(/(\d)[-_](?=\d)/g, "$1p").split(/[^A-Za-z0-9]+/).filter(Boolean);
  let id = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
  if (id === "" || /^[0-9]/.test(id)) id = `${lead}${id}`;
  return RESERVED.dart.has(id) || taken.has(id) ? `${id}Value` : id;
}
/** A colour role's member on MotifColors (text-secondary → textSecondary). */
export const colorField = (name: string) => member(name, "c", COLOR_MEMBERS);

const dartString = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$")}'`;
const fontWeight = (w: number) => `FontWeight.w${Math.min(900, Math.max(100, Math.round(w / 100) * 100))}`;

/** Letter spacing in logical pixels, from the guide's px or rem value. */
function letterSpacing(css: string | undefined): number | null {
  const m = css?.match(/^(-?[\d.]+)(px|rem)$/);
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
}

function duration(ms: number): string {
  return Number.isInteger(ms) ? `Duration(milliseconds: ${ms})` : `Duration(microseconds: ${Math.round(ms * 1000)})`;
}

function colorsBlock(set: ThemeSet): string[] {
  const colors = set.base.colors;
  const fields = colors.map((c) => colorField(c.name));
  const instance = (name: string, theme: Theme, mode: "light" | "dark", doc: string): string[] => {
    const byName = new Map(theme.colors.map((c) => [c.name, c]));
    return [
      `  /// ${doc}`,
      ...render(
        call("MotifColors(", colors.map((c, i) => `${fields[i]}: ${dartColor((byName.get(c.name) ?? c)[mode])}`)),
        2,
        `static const MotifColors ${name} = `,
        ";",
      ),
    ];
  };
  const oneLine = (label: string) => label.replace(/\s+/g, " ").trim();
  const defaultName = set.defaultLabel ? `${oneLine(set.defaultLabel)} variant, ` : "";
  const instances = [
    instance("light", set.base, "light", `${defaultName}light mode.`.replace(/^./, (c) => c.toUpperCase())),
    "",
    instance("dark", set.base, "dark", `${defaultName}dark mode.`.replace(/^./, (c) => c.toUpperCase())),
    ...set.variants.flatMap((v) => {
      const id = dartIdentifier(v.id);
      const doc = (mode: string) => `${oneLine(v.label)} variant, ${mode} mode.`;
      return ["", instance(`${id}Light`, v.theme, "light", doc("light")), "", instance(`${id}Dark`, v.theme, "dark", doc("dark"))];
    }),
  ].flat();

  return [
    "/// The guide's colour roles, light and dark.",
    "///",
    "/// Read them in a widget with MotifColors.of(context).",
    "class MotifColors extends ThemeExtension<MotifColors> {",
    ...render(call("const MotifColors({", fields.map((f) => `required this.${f}`), "});"), 2),
    "",
    ...fields.map((f) => `  final Color ${f};`),
    "",
    ...instances,
    "",
    "  /// The nearest theme's colours, or the default ones for its brightness.",
    "  static MotifColors of(BuildContext context) {",
    "    final theme = Theme.of(context);",
    "    return theme.extension<MotifColors>() ??",
    "        (theme.brightness == Brightness.dark ? dark : light);",
    "  }",
    "",
    "  @override",
    ...render(call("MotifColors copyWith({", fields.map((f) => `Color? ${f}`), "})"), 2, "", " {"),
    ...render(call("MotifColors(", fields.map((f) => `${f}: ${f} ?? this.${f}`)), 4, "return ", ";"),
    "  }",
    "",
    "  @override",
    "  MotifColors lerp(MotifColors? other, double t) {",
    "    if (other == null) return this;",
    ...render(call("MotifColors(", fields.map((f) => call(`${f}: Color.lerp(`, [f, `other.${f}`, "t"], ")!"))), 4, "return ", ";"),
    "  }",
    "}",
  ];
}

function constants(doc: string[], cls: string, lines: string[]): string[] {
  return ["", ...doc.map((d) => (d ? `/// ${d}` : "///")), `abstract final class ${cls} {`, ...lines, "}"];
}

/** A shadow's layers as BoxShadows. Flutter has no inset shadow, so inset layers are left out. */
function boxShadows(layers: ThemeShadowLayer[]): Expr[] {
  return layers
    .filter((l) => !l.inset)
    .map((l) =>
      call("BoxShadow(", [
        `color: ${dartColor(l.color)}`,
        `offset: Offset(${num(l.x)}, ${num(l.y)})`,
        `blurRadius: ${num(l.blur)}`,
        ...(l.spread !== 0 ? [`spreadRadius: ${num(l.spread)}`] : []),
      ]),
    );
}

/** The type role as a TextStyle: the family first, a companion as its fallback, and no colour. */
function textStyle(font: ThemeFont, google: Set<string>, googleFonts: boolean): Expr {
  const families = stackFamilies(font.family);
  const viaGoogle = (f: string) => googleFonts && google.has(f.toLowerCase());
  const props: string[] = [`fontSize: ${num(font.sizePx)}`, `fontWeight: ${fontWeight(font.weight)}`, `height: ${num(font.lineHeight)}`];
  const spacing = letterSpacing(font.letterSpacing);
  if (spacing !== null) props.push(`letterSpacing: ${num(spacing)}`);
  props.push("leadingDistribution: TextLeadingDistribution.even");

  const [first, ...companions] = families;
  // A companion's family name at the role's weight, through google_fonts when it has the font.
  const weight = font.weight === 400 ? [] : [fontWeight(font.weight)];
  const fallback: Expr[] = companions.map((f) => (viaGoogle(f) ? call("_family(", [dartString(f), ...weight]) : dartString(f)));

  if (first && viaGoogle(first)) {
    // google_fonts sets its own fallback list (the plain family); _font replaces it with the companions.
    return call("_font(", [dartString(first), call("const TextStyle(", props), ...(fallback.length > 0 ? [call("[", fallback, "]")] : [])]);
  }
  const allConst = fallback.every((f) => typeof f === "string");
  const fallbackArg = fallback.length > 0 ? [call("fontFamilyFallback: [", fallback, "]")] : [];
  const args: Expr[] = [...(first ? [`fontFamily: ${dartString(first)}`] : []), ...fallbackArg, ...props];
  return call(`${allConst ? "const " : ""}TextStyle(`, args);
}

/** A family through google_fonts (which loads it), or by plain name when google_fonts doesn't have it. */
const FONT_HELPER = [
  "  /// The family through google_fonts, which loads it, or by its plain name",
  "  /// when google_fonts doesn't have it (a font the app bundles itself).",
  "  static TextStyle _font(",
  "    String family,",
  "    TextStyle style, [",
  "    List<String>? fallback,",
  "  ]) {",
  "    final font = GoogleFonts.asMap().containsKey(family)",
  "        ? GoogleFonts.getFont(family, textStyle: style)",
  "        : style.copyWith(fontFamily: family);",
  "    return fallback == null",
  "        ? font",
  "        : font.copyWith(fontFamilyFallback: fallback);",
  "  }",
];

/** A fallback family's name, loaded through google_fonts when it has the font. */
const FAMILY_HELPER = [
  "  /// A fallback family's name: google_fonts' name for a font it has (which",
  "  /// loads it), or the plain family name.",
  "  static String _family(String family, [FontWeight weight = FontWeight.w400]) {",
  "    return GoogleFonts.asMap().containsKey(family)",
  "        ? GoogleFonts.getFont(family, fontWeight: weight).fontFamily!",
  "        : family;",
  "  }",
];

const TEXT_THEME: [string, string][] = [
  ["displayLarge", "display"], ["displayMedium", "display"], ["displaySmall", "display"],
  ["headlineLarge", "title"], ["headlineMedium", "title"], ["headlineSmall", "title"],
  ["titleLarge", "heading"], ["titleMedium", "heading"], ["titleSmall", "heading"],
  ["bodyLarge", "body"], ["bodyMedium", "body"], ["bodySmall", "caption"],
  ["labelLarge", "label"], ["labelMedium", "label"], ["labelSmall", "caption"],
];

const SCHEME: [string, string][] = [
  ["primary", "action-primary"], ["onPrimary", "on-action-primary"],
  ["secondary", "action-secondary"], ["onSecondary", "on-action-secondary"],
  ["error", "danger"], ["onError", "on-danger"],
  ["surface", "surface"], ["onSurface", "text-primary"], ["onSurfaceVariant", "text-secondary"],
  ["surfaceContainerLow", "background"], ["surfaceContainer", "surface"],
  ["surfaceContainerHigh", "surface-raised"], ["surfaceContainerHighest", "surface-raised"],
  ["outline", "border"], ["outlineVariant", "border"],
  ["inverseSurface", "text-primary"], ["onInverseSurface", "text-inverse"],
  ["surfaceTint", "surface"],
];

function themeBlock(set: ThemeSet): string[] {
  const t = set.base;
  const has = new Set(t.colors.map((c) => c.name));
  const fonts = new Set(t.fonts.map((f) => f.name));
  const scheme = call("colorScheme: ColorScheme(", [
    "brightness: brightness",
    ...SCHEME.filter(([, role]) => has.has(role)).map(([key, role]) => `${key}: colors.${colorField(role)}`),
  ]);
  const textTheme = call(
    "textTheme: TextTheme(",
    TEXT_THEME.filter(([, role]) => fonts.has(role)).map(([key, role]) => `${key}: MotifText.${member(role, "t")}`),
  );
  const theme = call("ThemeData(", [
    "useMaterial3: true",
    scheme,
    ...(has.has("background") ? ["scaffoldBackgroundColor: colors.background"] : []),
    ...(has.has("border") ? ["dividerColor: colors.border"] : []),
    textTheme,
    "extensions: [colors]",
  ]);

  const builders: string[] = [];
  if (set.variants.length === 0) {
    for (const mode of ["light", "dark"]) {
      builders.push(`  /// The ${mode} theme.`, `  static ThemeData ${mode}() => _theme(Brightness.${mode}, MotifColors.${mode});`, "");
    }
  } else {
    const def = `MotifVariant.${dartIdentifier(set.defaultId!)}`;
    for (const mode of ["light", "dark"]) {
      builders.push(
        `  /// The ${mode} theme for a variant (the default one unless you pass another).`,
        ...render(call("static ThemeData " + mode + "({", [`MotifVariant variant = ${def}`], "})"), 2, "", " {"),
        "    final colors = switch (debugVariantOverride ?? variant) {",
        `      ${def} => MotifColors.${mode},`,
        ...set.variants.map((v) => {
          const id = dartIdentifier(v.id);
          return `      MotifVariant.${id} => MotifColors.${id}${mode === "light" ? "Light" : "Dark"},`;
        }),
        "    };",
        `    return _theme(Brightness.${mode}, colors);`,
        "  }",
        "",
      );
    }
  }

  return [
    "",
    "/// Material themes built from the guide, for your MaterialApp:",
    "/// theme: MotifTheme.light(), darkTheme: MotifTheme.dark().",
    "abstract final class MotifTheme {",
    ...(set.variants.length > 0
      ? ["  /// Set by Motif's screenshots. Leave it null in your app.", "  static MotifVariant? debugVariantOverride;", ""]
      : []),
    ...builders,
    "  static ThemeData _theme(Brightness brightness, MotifColors colors) {",
    ...render(theme, 4, "return ", ";"),
    "  }",
    "}",
  ];
}

/** Flutter theme code for the guide. The file's path is relative to the app's theme folder. */
export function generateFlutter(set: ThemeSet, opts: { googleFonts: boolean }): GeneratedFile[] {
  const t = set.base;
  const google = new Set(themeFonts(t).filter((f) => f.source === "google" || f.source === "bundled").map((f) => f.family.toLowerCase()));
  const styles = t.fonts.map((f) => ({ font: f, style: textStyle(f, google, opts.googleFonts) }));
  const usesFont = styles.some((s) => flat(s.style).includes("_font("));
  const usesFamily = styles.some((s) => flat(s.style).includes("_family("));
  const usesGoogleFonts = usesFont || usesFamily;

  const lines = [
    TS_HEADER,
    "",
    "import 'package:flutter/material.dart';",
    ...(usesGoogleFonts ? ["import 'package:google_fonts/google_fonts.dart';"] : []),
    "",
  ];
  if (set.variants.length > 0) {
    const ids = [set.defaultId!, ...set.variants.map((v) => v.id)].map(dartIdentifier);
    lines.push("/// The guide's design variants. The default comes first.", ...render(call("enum MotifVariant { ", ids, " }"), 0), "");
  }
  const field = (type: string, name: string, lead: string, value: Expr) => render(value, 2, `static const ${type} ${member(name, lead)} = `, ";");
  lines.push(
    ...colorsBlock(set),
    ...constants(["Spacing, in logical pixels."], "MotifSpace", t.space.flatMap((s) => field("double", s.name, "s", num(s.px)))),
    ...constants(["Corner radii, in logical pixels."], "MotifRadius", t.radius.flatMap((r) => field("double", r.name, "r", num(r.px)))),
    ...constants(["Shadows, for BoxDecoration.boxShadow."], "MotifShadows", t.shadows.flatMap((s) => field("List<BoxShadow>", s.name, "s", call("[", boxShadows(s.layers), "]")))),
    ...constants(
      ["Durations. Pass them through MotifMotion.duration for reduced motion."],
      "MotifDurations",
      t.durations.flatMap((d) => field("Duration", d.name, "d", duration(d.ms))),
    ),
    ...constants(["Easing curves."], "MotifCurves", t.easings.flatMap((e) => field("Cubic", e.name, "e", `Cubic(${e.points.map(num).join(", ")})`))),
    ...constants(
      ["Springs, for SpringSimulation."],
      "MotifSprings",
      t.springs.flatMap((s) => {
        const p = springPhysics(s);
        const spring = call("SpringDescription(", ["mass: 1", `stiffness: ${p.stiffness.toFixed(2)}`, `damping: ${p.damping.toFixed(2)}`]);
        return render(spring, 2, `static final SpringDescription ${member(s.name, "s")} = `, ";");
      }),
    ),
    ...constants(["Reduced motion: when the system asks for less, durations become zero."], "MotifMotion", [
      "  /// True when the system asks for less motion.",
      "  static bool reduced(BuildContext context) =>",
      "      MediaQuery.disableAnimationsOf(context);",
      "",
      "  /// The duration, or zero when the system asks for less motion.",
      "  static Duration duration(BuildContext context, Duration value) =>",
      "      reduced(context) ? Duration.zero : value;",
    ]),
    ...constants(
      ["The guide's type roles: size, weight, line height and letter spacing.", "They carry no colour, so the theme's text colour applies."],
      "MotifText",
      [
        ...styles.flatMap(({ font, style }, i) => [...(i > 0 ? [""] : []), ...render(style, 2, `static TextStyle get ${member(font.name, "t")} => `, ";")]),
        ...(usesFont ? ["", ...FONT_HELPER] : []),
        ...(usesFamily ? ["", ...FAMILY_HELPER] : []),
      ],
    ),
    ...themeBlock(set),
    "",
  );
  return [{ path: THEME_FILE, content: lines.join("\n") }];
}
