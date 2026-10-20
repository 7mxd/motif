// Compose theme code: one Kotlin file with the guide's colours (every variant, light and dark), type, sizes and motion.
import { springPhysics } from "../../contract/spring";
import type { DtcgColor } from "../../contract/values";
import { num } from "../../generate/css-values";
import { TS_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme, ThemeFont, ThemeSet, ThemeShadowLayer } from "../../generate/theme";
import { stackFamilies, themeFonts, type ThemeFontUse } from "../../generate/theme-fonts";
import { slotSize, TYPE_SLOTS, typeScale } from "../../generate/type-slots";
import { kotlinIdentifier, lowerCamel, RESERVED } from "../naming";

export const THEME_FILE = "MotifTheme.kt";

/** The official Kotlin style's line width. */
const WIDTH = 100;
const INDENT = 4;

/** A Kotlin expression: plain text, or a call whose arguments split one per line (with a trailing comma) when it doesn't fit. */
type Expr = string | Call;
interface Call {
  head: string;
  args: Expr[];
  close: string;
  /** Always one argument per line, even when it would fit on one. */
  split: boolean;
}

const call = (head: string, args: Expr[], close = ")", split = false): Call => ({ head, args, close, split });

const flat = (e: Expr): string => (typeof e === "string" ? e : `${e.head}${e.args.map(flat).join(", ")}${e.close}`);

/** The expression laid out in the official style, after `prefix` at `indent` spaces, ending with `suffix`. */
function render(e: Expr, indent: number, prefix = "", suffix = ""): string[] {
  const pad = " ".repeat(indent);
  const one = `${pad}${prefix}${flat(e)}${suffix}`;
  if (typeof e === "string" || e.args.length === 0 || (!e.split && one.length <= WIDTH)) return [one];
  return [`${pad}${prefix}${e.head}`, ...e.args.flatMap((a) => render(a, indent + INDENT, "", ",")), `${pad}${e.close}${suffix}`];
}

/** `Color(0xAARRGGBB)`, from the colour's hex and alpha. */
export function kotlinColor(c: DtcgColor): string {
  const alpha = Math.round((c.alpha ?? 1) * 255).toString(16).padStart(2, "0");
  return `Color(0x${`${alpha}${(c.hex ?? "#000000").slice(1)}`.toUpperCase()})`;
}

/** A role name as a lowerCamelCase Kotlin member, never a keyword or a name the class already uses (it gets "Value"). */
export function kotlinMember(name: string, lead: string, taken: Set<string> = new Set()): string {
  const id = lowerCamel(name, lead);
  return RESERVED.kotlin.has(id) || taken.has(id) ? `${id}Value` : id;
}

/** Names a data class already has: its copy, equals, hashCode, toString and componentN functions. */
const COLOR_MEMBERS = new Set(["copy", "equals", "hashCode", "toString"]);
export const colorField = (name: string) => {
  const id = kotlinMember(name, "c", COLOR_MEMBERS);
  return /^component\d+$/.test(id) ? `${id}Value` : id;
};

/** A number with two decimals at most. */
const round2 = (n: number) => num(Math.round(n * 100) / 100);
/** A Float literal: 0.2f, 1f. */
const float = (n: number) => `${num(n)}f`;
/** A Dp or sp literal; a negative one in brackets, so the minus applies to the number. */
const unit = (n: number, u: "dp" | "sp") => (n < 0 ? `(${num(n)}).${u}` : `${num(n)}.${u}`);
const fontWeight = (w: number) => `FontWeight.W${Math.min(900, Math.max(100, Math.round(w / 100) * 100))}`;
const kotlinString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;

/** Letter spacing in sp, from the guide's px or rem value. */
function letterSpacing(css: string | undefined): number | null {
  const m = css?.match(/^(-?[\d.]+)(px|rem)$/);
  return m ? Number(m[1]) * (m[2] === "rem" ? 16 : 1) : null;
}

/** Languages written in Arabic script, whose text takes the type roles' Arabic companion. */
const ARABIC_SCRIPT = ["ar", "fa", "ur", "ps", "ckb", "sd", "ug"];

/** CSS's generic families as Compose's own. */
const GENERIC: Record<string, string> = {
  "sans-serif": "FontFamily.SansSerif",
  "ui-sans-serif": "FontFamily.SansSerif",
  serif: "FontFamily.Serif",
  "ui-serif": "FontFamily.Serif",
  monospace: "FontFamily.Monospace",
  "ui-monospace": "FontFamily.Monospace",
  cursive: "FontFamily.Cursive",
  "system-ui": "FontFamily.Default",
  "-apple-system": "FontFamily.Default",
  blinkmacsystemfont: "FontFamily.Default",
  fantasy: "FontFamily.Default",
  "ui-rounded": "FontFamily.Default",
  math: "FontFamily.Default",
  emoji: "FontFamily.Default",
  fangsong: "FontFamily.Default",
};

const PROJECT_FONT = /\.(ttf|otf)$/i;

export interface ComposeOptions {
  /** The Kotlin package of the theme file. */
  packageName: string;
  /** The package of the module's R class (its namespace). */
  rPackage: string;
  /** Whether the module depends on androidx.compose.ui:ui-text-google-fonts. */
  googleFonts: boolean;
  /** Each project font's resource names (family in lower case), in the order of its .ttf and .otf files in the guide. */
  resFonts: Map<string, string[]>;
}

/** A family the type roles use, as a MotifFonts member. */
interface FamilyMember {
  family: string;
  member: string;
  /** The FontFamily(…) it loads, or null when the system font stands in (with the comment saying why). */
  fonts: Expr[] | null;
  doc: string;
}

/** How each type role names its font: a MotifFonts member, or one of Compose's generic families. */
function fontPlan(t: Theme, opts: ComposeOptions) {
  const uses = new Map<string, ThemeFontUse>(themeFonts(t).map((u) => [u.family.toLowerCase(), u]));
  const members = new Map<string, FamilyMember>();
  const taken = new Set(["debugFontOverride", "provider"]);

  const memberFor = (use: ThemeFontUse): string => {
    const key = use.family.toLowerCase();
    const known = members.get(key);
    if (known) return `MotifFonts.${known.member}`;
    const member = kotlinMember(use.family, "f", taken);
    taken.add(member);
    taken.add(`${member}Family`);
    let fonts: Expr[] | null = null;
    let doc: string;
    if (use.source === "project") {
      const font = t.projectFonts.find((f) => f.family.toLowerCase() === key);
      const files = (font?.files ?? []).filter((f) => PROJECT_FONT.test(f.path));
      const names = opts.resFonts.get(key) ?? [];
      if (files.length > 0 && names.length === files.length) {
        fonts = files.map((f, i) => `Font(R.font.${names[i]}, ${fontWeight(f.weight)}${f.style === "italic" ? ", FontStyle.Italic" : ""})`);
        doc = `${use.family}, from the app's font resources.`;
      } else {
        doc = `${use.family}: not in the app's font resources (res/font), so the system font stands in.`;
      }
    } else if (opts.googleFonts) {
      fonts = use.weights.map((w) =>
        call("Font(", [`googleFont = GoogleFont(${kotlinString(use.family)})`, "fontProvider = provider", `weight = ${fontWeight(w)}`]),
      );
      doc = `${use.family}, from Google Fonts (Google Play services downloads it).`;
    } else {
      doc = `${use.family}: the system font until the app depends on ui-text-google-fonts (Google Fonts).`;
    }
    members.set(key, { family: use.family, member, fonts, doc });
    return `MotifFonts.${member}`;
  };

  /** The role's first family Android can draw: a project or Google font, or a generic family; system fonts are skipped. */
  const primary = (font: ThemeFont): string => {
    for (const raw of font.family.split(",")) {
      const name = raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
      const key = name.toLowerCase();
      if (GENERIC[key]) return GENERIC[key]!;
      const use = uses.get(key);
      if (use && use.source !== "system") return memberFor(use);
    }
    return "FontFamily.Default";
  };

  /** The role's Arabic companion (second in its list), or null. */
  const companion = (font: ThemeFont, first: string): string | null => {
    const second = stackFamilies(font.family)[1];
    const use = second ? uses.get(second.toLowerCase()) : undefined;
    if (!use || use.source === "system") return null;
    const ref = memberFor(use);
    return ref === first ? null : ref;
  };

  const roles = t.fonts.map((font) => {
    const family = primary(font);
    return { font, family, companion: companion(font, family) };
  });
  return { roles, members: [...members.values()] };
}

function textStyle(font: ThemeFont, family: string): Expr {
  const spacing = letterSpacing(font.letterSpacing);
  return call(
    "TextStyle(",
    [
      `fontFamily = ${family}`,
      `fontWeight = ${fontWeight(font.weight)}`,
      `fontSize = ${unit(font.sizePx, "sp")}`,
      `lineHeight = ${unit(Number(round2(font.sizePx * font.lineHeight)), "sp")}`,
      ...(spacing !== null ? [`letterSpacing = ${unit(spacing, "sp")}`] : []),
      "lineHeightStyle = EvenLeading",
    ],
    ")",
    true,
  );
}

function kdoc(lines: string[], indent = 0): string[] {
  const pad = " ".repeat(indent);
  if (lines.length === 1 && `${pad}/** ${lines[0]} */`.length <= WIDTH) return [`${pad}/** ${lines[0]} */`];
  return [`${pad}/**`, ...lines.map((l) => (l ? `${pad} * ${l}` : `${pad} *`)), `${pad} */`];
}

function object(doc: string[], name: string, body: string[]): string[] {
  return ["", ...kdoc(doc), `object ${name} {`, ...body, "}"];
}

function colorsBlock(set: ThemeSet): string[] {
  const colors = set.base.colors;
  const fields = colors.map((c) => colorField(c.name));
  const oneLine = (label: string) => label.replace(/\s+/g, " ").trim();
  const instance = (name: string, theme: Theme, mode: "light" | "dark", doc: string): string[] => {
    const byName = new Map(theme.colors.map((c) => [c.name, c]));
    return [
      ...kdoc([doc], 8),
      ...render(
        call("MotifColors(", colors.map((c, i) => `${fields[i]} = ${kotlinColor((byName.get(c.name) ?? c)[mode])}`), ")", true),
        8,
        `val ${name} = `,
      ),
    ];
  };
  const defaultName = set.defaultLabel ? `${oneLine(set.defaultLabel)} variant, ` : "";
  const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  const instances = [
    instance("Light", set.base, "light", cap(`${defaultName}light mode.`)),
    "",
    instance("Dark", set.base, "dark", cap(`${defaultName}dark mode.`)),
    ...set.variants.flatMap((v) => {
      const id = kotlinIdentifier(v.id);
      const doc = (mode: string) => `${oneLine(v.label)} variant, ${mode} mode.`;
      return ["", instance(`${id}Light`, v.theme, "light", doc("light")), "", instance(`${id}Dark`, v.theme, "dark", doc("dark"))];
    }),
  ].flat();

  return [
    "",
    ...kdoc(["The guide's colour roles, light and dark.", "", "Read them in a composable with MotifTheme.colors."]),
    "@Immutable",
    ...render(call("data class MotifColors(", fields.map((f) => `val ${f}: Color`), ")", true), 0, "", " {"),
    "    companion object {",
    ...instances,
    "    }",
    "}",
    "",
    "/** The colours of the nearest MotifTheme. Read them with MotifTheme.colors. */",
    "val LocalMotifColors = staticCompositionLocalOf { MotifColors.Light }",
  ];
}

/** A shadow's layers as Shadows. Inset layers are left out, as on Flutter. */
function shadows(layers: ThemeShadowLayer[]): Expr[] {
  return layers
    .filter((l) => !l.inset)
    .map((l) =>
      call("Shadow(", [
        `radius = ${unit(l.blur, "dp")}`,
        ...(l.spread !== 0 ? [`spread = ${unit(l.spread, "dp")}`] : []),
        `color = ${kotlinColor(l.color)}`,
        `offset = DpOffset(${unit(l.x, "dp")}, ${unit(l.y, "dp")})`,
      ]),
    );
}

/**
 * Each scheme colour and the role it comes from: Flutter's mapping, plus background and onBackground, which Compose's
 * scheme still has.
 */
const SCHEME: [string, string][] = [
  ["primary", "action-primary"], ["onPrimary", "on-action-primary"],
  ["secondary", "action-secondary"], ["onSecondary", "on-action-secondary"],
  ["error", "danger"], ["onError", "on-danger"],
  ["background", "background"], ["onBackground", "text-primary"],
  ["surface", "surface"], ["onSurface", "text-primary"], ["onSurfaceVariant", "text-secondary"],
  ["surfaceContainerLow", "background"], ["surfaceContainer", "surface"],
  ["surfaceContainerHigh", "surface-raised"], ["surfaceContainerHighest", "surface-raised"],
  ["outline", "border"], ["outlineVariant", "border"],
  ["inverseSurface", "text-primary"], ["inverseOnSurface", "text-inverse"],
  ["surfaceTint", "surface"],
];

function schemeBlock(t: Theme): string[] {
  const has = new Set(t.colors.map((c) => c.name));
  const args = SCHEME.filter(([, role]) => has.has(role)).map(([key, role]) => `${key} = colors.${colorField(role)}`);
  return [
    "",
    "/** Material's colours, from the guide's roles only: never dynamic colour. */",
    "private fun motifColorScheme(colors: MotifColors, darkTheme: Boolean): ColorScheme =",
    "    if (darkTheme) {",
    ...render(call("darkColorScheme(", args, ")", true), 8),
    "    } else {",
    ...render(call("lightColorScheme(", args, ")", true), 8),
    "    }",
  ];
}

function typographyBlock(t: Theme, roles: { font: ThemeFont; companion: string | null }[], arabic: boolean): string[] {
  const own = new Map(t.fonts.map((f) => [f.name, f]));
  const scale = typeScale(t.fonts);
  const slots = TYPE_SLOTS.filter(([, role]) => own.has(role));
  const used = [...new Set(slots.map(([, role]) => role))];
  const local = (role: string) => kotlinMember(role, "t", new Set(["arabic"]));
  const locals = used.map((role) => {
    const name = kotlinMember(role, "t");
    const hasCompanion = roles.some((r) => r.font.name === role && r.companion);
    const value = hasCompanion ? `if (arabic) MotifType.${name}Arabic else MotifType.${name}` : `MotifType.${name}`;
    return `    val ${local(role)} = ${value}`;
  });
  const args = slots.map(([slot, role, materialPx]) => {
    const font = own.get(role)!;
    const px = slotSize(materialPx, font.sizePx, scale);
    if (px === font.sizePx) return `${slot} = ${local(role)}`;
    return `${slot} = ${local(role)}.copy(fontSize = ${unit(px, "sp")}, lineHeight = ${unit(Number(round2(px * font.lineHeight)), "sp")})`;
  });
  return [
    "",
    ...kdoc(["Material's type scale on the guide's roles: each slot steps down on the guide's own sizes."]),
    `private fun motifTypography(${arabic ? "arabic: Boolean" : ""}): Typography {`,
    ...locals,
    ...render(call("Typography(", args, ")", true), 4, "return "),
    "}",
  ];
}

function shapesBlock(t: Theme): string[] {
  const has = new Set(t.radius.map((r) => r.name));
  const corner = (name: string) => `RoundedCornerShape(MotifRadius.${kotlinMember(name, "r")})`;
  const args = (
    [["extraSmall", "sm"], ["small", "sm"], ["medium", "md"], ["large", "lg"], ["extraLarge", "lg"]] as const
  ).filter(([, r]) => has.has(r)).map(([key, r]) => `${key} = ${corner(r)}`);
  return ["", "/** Material's corners, from the guide's radii. */", ...render(call("Shapes(", args, ")", args.length > 0), 0, "private val MotifShapes = ")];
}

function themeBlock(set: ThemeSet, arabic: boolean): string[] {
  const variants = set.variants.length > 0 && set.defaultId !== null;
  const def = variants ? kotlinIdentifier(set.defaultId!) : "";
  const pick: string[] = [];
  if (!variants) {
    pick.push("    val colors = if (darkTheme) MotifColors.Dark else MotifColors.Light");
  } else {
    const branch = (entry: string, light: string, dark: string) => {
      const line = `        MotifVariant.${entry} -> if (darkTheme) MotifColors.${dark} else MotifColors.${light}`;
      return line.length <= WIDTH ? [line] : [`        MotifVariant.${entry} ->`, `            if (darkTheme) MotifColors.${dark} else MotifColors.${light}`];
    };
    pick.push(
      "    val colors = when (MotifTheme.debugVariantOverride ?: variant) {",
      ...branch(def, "Light", "Dark"),
      ...set.variants.flatMap((v) => {
        const id = kotlinIdentifier(v.id);
        return branch(id, `${id}Light`, `${id}Dark`);
      }),
      "    }",
    );
  }
  return [
    "",
    ...kdoc([
      "The guide's Material theme: its colours (light or dark), type and corners, and MotifTheme.colors",
      "for every colour role.",
      ...(arabic ? ["", "In a language written in Arabic script, the type roles use their Arabic companion."] : []),
    ]),
    "@Composable",
    "fun MotifTheme(",
    ...(variants ? [`    variant: MotifVariant = MotifVariant.${def},`] : []),
    "    darkTheme: Boolean = isSystemInDarkTheme(),",
    "    content: @Composable () -> Unit,",
    ") {",
    ...pick,
    ...(arabic ? ["    val arabic = localeLanguage() in ARABIC_SCRIPT"] : []),
    "    CompositionLocalProvider(LocalMotifColors provides colors) {",
    "        MaterialTheme(",
    "            colorScheme = motifColorScheme(colors, darkTheme),",
    `            typography = motifTypography(${arabic ? "arabic" : ""}),`,
    "            shapes = MotifShapes,",
    "            content = content,",
    "        )",
    "    }",
    "}",
    "",
    "/** The theme's values in a composable: MotifTheme.colors.textSecondary. */",
    "object MotifTheme {",
    "    /** The colour roles of the nearest MotifTheme. */",
    "    val colors: MotifColors",
    "        @Composable",
    "        @ReadOnlyComposable",
    "        get() = LocalMotifColors.current",
    ...(variants ? ["", "    /** Set by Motif's screenshots. Leave it null in your app. */", "    var debugVariantOverride: MotifVariant? = null"] : []),
    "}",
  ];
}

const LOCALE_BLOCK = [
  "",
  "/** Languages written in Arabic script: their text takes the type roles' Arabic companion. */",
  `private val ARABIC_SCRIPT = setOf(${ARABIC_SCRIPT.map((l) => `"${l}"`).join(", ")})`,
  "",
  "/** The language of the app's locale (in a preview, the one it sets). */",
  "@Composable",
  "@ReadOnlyComposable",
  "private fun localeLanguage(): String {",
  "    val configuration = LocalConfiguration.current",
  "    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {",
  "        configuration.locales[0].language",
  "    } else {",
  '        @Suppress("DEPRECATION")',
  "        configuration.locale.language",
  "    }",
  "}",
];

/** Compose theme code for the guide. The file's path is relative to the app's theme folder. */
export function generateCompose(set: ThemeSet, opts: ComposeOptions): GeneratedFile[] {
  const t = set.base;
  const plan = fontPlan(t, opts);
  const arabic = plan.roles.some((r) => r.companion);
  const google = plan.members.some((m) => m.fonts?.some((f) => flat(f).includes("GoogleFont(")));
  const resources = plan.members.some((m) => m.fonts?.some((f) => flat(f).includes("R.font.")));
  const italic = plan.members.some((m) => m.fonts?.some((f) => flat(f).includes("FontStyle.Italic")));
  const variants = set.variants.length > 0 && set.defaultId !== null;

  const imports = new Set([
    "android.provider.Settings",
    "androidx.compose.foundation.isSystemInDarkTheme",
    "androidx.compose.material3.ColorScheme",
    "androidx.compose.material3.MaterialTheme",
    "androidx.compose.material3.Shapes",
    "androidx.compose.material3.Typography",
    "androidx.compose.material3.darkColorScheme",
    "androidx.compose.material3.lightColorScheme",
    "androidx.compose.runtime.Composable",
    "androidx.compose.runtime.CompositionLocalProvider",
    "androidx.compose.runtime.Immutable",
    "androidx.compose.runtime.ReadOnlyComposable",
    "androidx.compose.runtime.staticCompositionLocalOf",
    "androidx.compose.ui.Modifier",
    "androidx.compose.ui.draw.dropShadow",
    "androidx.compose.ui.graphics.Color",
    "androidx.compose.ui.graphics.Shape",
    "androidx.compose.ui.graphics.shadow.Shadow",
    "androidx.compose.ui.platform.LocalContext",
    "androidx.compose.ui.text.TextStyle",
    "androidx.compose.ui.text.font.FontFamily",
    "androidx.compose.ui.text.font.FontWeight",
    "androidx.compose.ui.text.style.LineHeightStyle",
    "androidx.compose.ui.unit.DpOffset",
    "androidx.compose.ui.unit.dp",
    "androidx.compose.ui.unit.sp",
  ]);
  if (t.radius.some((r) => ["sm", "md", "lg"].includes(r.name))) imports.add("androidx.compose.foundation.shape.RoundedCornerShape");
  if (t.easings.length > 0) imports.add("androidx.compose.animation.core.CubicBezierEasing");
  if (t.springs.length > 0) {
    imports.add("androidx.compose.animation.core.SpringSpec");
    imports.add("androidx.compose.animation.core.spring");
  }
  if (arabic) {
    imports.add("android.os.Build");
    imports.add("androidx.compose.ui.platform.LocalConfiguration");
  }
  if (resources) imports.add("androidx.compose.ui.text.font.Font");
  if (italic) imports.add("androidx.compose.ui.text.font.FontStyle");
  if (google) {
    imports.add("androidx.compose.ui.text.googlefonts.Font");
    imports.add("androidx.compose.ui.text.googlefonts.GoogleFont");
  }
  if ((google || resources) && opts.rPackage !== opts.packageName) imports.add(`${opts.rPackage}.R`);

  const lines = [TS_HEADER, "", ...(opts.packageName ? [`package ${opts.packageName}`, ""] : []), ...[...imports].sort().map((i) => `import ${i}`)];

  if (variants) {
    const ids = [set.defaultId!, ...set.variants.map((v) => v.id)].map(kotlinIdentifier);
    const one = `enum class MotifVariant { ${ids.join(", ")} }`;
    lines.push("", "/** The guide's design variants. The default comes first. */", ...(one.length <= WIDTH ? [one] : ["enum class MotifVariant {", ...ids.map((id) => `    ${id},`), "}"]));
  }

  const val = (name: string, lead: string, value: Expr) => render(value, INDENT, `val ${kotlinMember(name, lead)} = `);
  lines.push(
    ...colorsBlock(set),
    ...object(["Spacing."], "MotifSpace", t.space.flatMap((s) => val(s.name, "s", unit(s.px, "dp")))),
    ...object(["Corner radii."], "MotifRadius", t.radius.flatMap((r) => val(r.name, "r", unit(r.px, "dp")))),
    ...object(
      ["Shadows, for Modifier.motifShadow. Inset layers are left out."],
      "MotifShadows",
      t.shadows.flatMap((s) => {
        const layers = shadows(s.layers);
        const value = layers.length > 0 ? call("listOf(", layers, ")", true) : "emptyList()";
        return render(value, INDENT, `val ${kotlinMember(s.name, "s")}: List<Shadow> = `);
      }),
    ),
    "",
    ...kdoc(["Draws the layers behind the content in its shape, the first on top as in CSS."]),
    "fun Modifier.motifShadow(shadows: List<Shadow>, shape: Shape): Modifier =",
    "    shadows.foldRight(this) { shadow, modifier -> modifier.dropShadow(shape, shadow) }",
    ...object(
      ["Durations, in milliseconds. Pass them through MotifMotion.duration for reduced motion."],
      "MotifDurations",
      t.durations.map((d) => `    const val ${kotlinMember(d.name, "d")} = ${Math.round(d.ms)}`),
    ),
    ...object(["Easing curves, for tween(easing = …)."], "MotifEasing", t.easings.flatMap((e) => val(e.name, "e", `CubicBezierEasing(${e.points.map(float).join(", ")})`))),
    ...object(
      ["Springs, for animationSpec = MotifSprings.snappy()."],
      "MotifSprings",
      t.springs.flatMap((s) => {
        const p = springPhysics(s);
        const spring = call("spring(", [`dampingRatio = ${float(Number(round2(p.dampingRatio)))}`, `stiffness = ${float(Number(round2(p.stiffness)))}`]);
        return render(spring, INDENT, `fun <T> ${kotlinMember(s.name, "s")}(): SpringSpec<T> = `);
      }),
    ),
    ...object(["Reduced motion: when the system turns animations off, durations become zero."], "MotifMotion", [
      "    /** True when the system asks for less motion (its animator duration scale is 0). */",
      "    @Composable",
      "    fun reduced(): Boolean {",
      "        val scale = Settings.Global.getFloat(",
      "            LocalContext.current.contentResolver,",
      "            Settings.Global.ANIMATOR_DURATION_SCALE,",
      "            1f,",
      "        )",
      "        return scale == 0f",
      "    }",
      "",
      "    /** The duration, or zero when the system asks for less motion. */",
      "    @Composable",
      "    fun duration(millis: Int): Int = if (reduced()) 0 else millis",
    ]),
    ...fontsBlock(plan.members, google),
    ...object(
      ["The guide's type roles: size, weight, line height and letter spacing.", "They carry no colour, so the theme's text colour applies."],
      "MotifType",
      plan.roles.flatMap(({ font, family, companion }, i) => {
        const name = kotlinMember(font.name, "t");
        return [
          ...(i > 0 ? [""] : []),
          `    val ${name}: TextStyle`,
          ...render(textStyle(font, family), 8, "get() = "),
          ...(companion ? ["", `    val ${name}Arabic: TextStyle`, ...render(textStyle(font, companion), 8, "get() = ")] : []),
        ];
      }),
    ),
    "",
    "/** Text sits in the middle of its line height, as on the web. */",
    "private val EvenLeading =",
    "    LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)",
    ...schemeBlock(t),
    ...typographyBlock(t, plan.roles, arabic),
    ...shapesBlock(t),
    ...(arabic ? LOCALE_BLOCK : []),
    ...themeBlock(set, arabic),
    "",
  );
  return [{ path: THEME_FILE, content: lines.join("\n") }];
}

function fontsBlock(members: FamilyMember[], google: boolean): string[] {
  const body = ["    /** Set by Motif's screenshots. Leave it null in your app. */", "    var debugFontOverride: ((String) -> FontFamily?)? = null"];
  if (google) {
    body.push(
      "",
      ...render(
        call("GoogleFont.Provider(", [
          'providerAuthority = "com.google.android.gms.fonts"',
          'providerPackage = "com.google.android.gms"',
          "certificates = R.array.com_google_android_gms_fonts_certs",
        ], ")", true),
        INDENT,
        "private val provider = ",
      ),
    );
  }
  for (const m of members) {
    const fallback = m.fonts ? `${m.member}Family` : "FontFamily.Default";
    body.push("", ...kdoc([m.doc], INDENT), `    val ${m.member}: FontFamily`, `        get() = debugFontOverride?.invoke(${kotlinString(m.family)}) ?: ${fallback}`);
    if (m.fonts) body.push("", ...render(call("FontFamily(", m.fonts, ")", true), INDENT, `private val ${m.member}Family = `));
  }
  return object(["The guide's font families."], "MotifFonts", body);
}
