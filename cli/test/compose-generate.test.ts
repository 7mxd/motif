import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatedEditedHits } from "../src/check/rules/app";
import { springPhysics } from "../src/contract/spring";
import { isMotifGenerated, TS_HEADER, XML_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { generateCompose, kotlinMember } from "../src/stacks/compose/generate";
import { fontCertsXml, resourceName } from "../src/stacks/compose/fonts";
import { docFrom, partnerTokens, validTokens, withCompanion } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

type Opts = Partial<Parameters<typeof generateCompose>[1]>;

const kotlinFor = (tokens: any, opts: Opts = {}) => {
  const files = generateCompose(buildThemeSet(docFrom(tokens)), {
    packageName: "com.example.rafiq.ui.motif",
    rPackage: "com.example.rafiq",
    googleFonts: true,
    resFonts: new Map(),
    ...opts,
  });
  expect(files.map((f) => f.path)).toEqual(["MotifTheme.kt"]);
  return files[0]!.content;
};

/** Tokens whose body font is a font the project bundles. */
const brandTokens = () => {
  const t = validTokens();
  t.$extensions["dev.motif"].fonts = [{
    family: "Brand Sans",
    files: [
      { path: "design/fonts/Brand Sans Regular.ttf", weight: 400, style: "normal" },
      { path: "design/fonts/Brand Sans Bold.ttf", weight: 700, style: "normal" },
      { path: "design/fonts/Brand Sans Italic.ttf", weight: 400, style: "italic" },
    ],
  }];
  t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
  return t;
};

describe("generateCompose, the test guide (no variants)", () => {
  const kt = kotlinFor(validTokens());

  test("starts with Motif's header, then the package", () => {
    expect(kt.startsWith(`${TS_HEADER}\n\npackage com.example.rafiq.ui.motif\n`)).toBe(true);
    expect(isMotifGenerated("MotifTheme.kt", kt)).toBe(true);
  });

  test("colours: an immutable data class with one property per role, light and dark", () => {
    expect(kt).toContain("@Immutable\ndata class MotifColors(\n");
    expect(kt).toContain("    val textPrimary: Color,\n");
    expect(kt).toContain("    val onActionPrimary: Color,\n");
    expect(kt).toContain("        val Light = MotifColors(\n");
    expect(kt).toContain("        val Dark = MotifColors(\n");
    expect(kt).toContain("actionPrimary = Color(0xFF4338CA),"); // light
    expect(kt).toContain("actionPrimary = Color(0xFF818CF8),"); // dark
    expect(kt).toContain("val LocalMotifColors = staticCompositionLocalOf { MotifColors.Light }");
  });

  test("the colour scheme is explicit and comes from the roles, never dynamic colour", () => {
    expect(kt).not.toContain("dynamicColor");
    expect(kt).not.toContain("dynamicLightColorScheme");
    expect(kt).toContain("lightColorScheme(");
    expect(kt).toContain("darkColorScheme(");
    for (const line of [
      "primary = colors.actionPrimary,",
      "onPrimary = colors.onActionPrimary,",
      "secondary = colors.actionSecondary,",
      "onSecondary = colors.onActionSecondary,",
      "error = colors.danger,",
      "onError = colors.onDanger,",
      "background = colors.background,",
      "onBackground = colors.textPrimary,",
      "surface = colors.surface,",
      "onSurface = colors.textPrimary,",
      "onSurfaceVariant = colors.textSecondary,",
      "surfaceContainerLow = colors.background,",
      "surfaceContainer = colors.surface,",
      "surfaceContainerHigh = colors.surfaceRaised,",
      "surfaceContainerHighest = colors.surfaceRaised,",
      "outline = colors.border,",
      "outlineVariant = colors.border,",
      "inverseSurface = colors.textPrimary,",
      "inverseOnSurface = colors.textInverse,",
      "surfaceTint = colors.surface,",
    ]) expect(kt.split(line).length).toBe(3); // once in each scheme
  });

  test("sizes and shadows", () => {
    expect(kt).toContain("object MotifSpace {\n    val s0 = 0.dp\n    val s1 = 4.dp\n");
    expect(kt).toContain("    val s4 = 16.dp\n");
    expect(kt).toContain("object MotifRadius {\n    val none = 0.dp\n");
    // The guide's own value: RoundedCornerShape clamps it to a pill.
    expect(kt).toContain("    val full = 9999.dp\n");
    expect(kt).toContain("    val md: List<Shadow> = listOf(\n        Shadow(radius = 12.dp, color = Color(0x1A000000), offset = DpOffset(0.dp, 4.dp)),\n    )");
    expect(kt).toContain("fun Modifier.motifShadow(shadows: List<Shadow>, shape: Shape): Modifier =\n    shadows.foldRight(this) { shadow, modifier -> modifier.dropShadow(shape, shadow) }");
    expect(kt).toContain("Shapes(\n    extraSmall = RoundedCornerShape(MotifRadius.sm),\n    small = RoundedCornerShape(MotifRadius.sm),\n    medium = RoundedCornerShape(MotifRadius.md),\n    large = RoundedCornerShape(MotifRadius.lg),\n    extraLarge = RoundedCornerShape(MotifRadius.lg),\n)");
  });

  test("a shadow's inset layers are left out, and spread is written only when it isn't zero", () => {
    const t = validTokens();
    t.shadow.md.$value = [
      { ...t.shadow.md.$value, spread: { value: 2, unit: "px" } },
      { ...t.shadow.md.$value, inset: true },
    ];
    const out = kotlinFor(t);
    expect(out).toContain("Shadow(\n            radius = 12.dp,\n            spread = 2.dp,\n            color = Color(0x1A000000),\n            offset = DpOffset(0.dp, 4.dp),\n        ),");
    expect(out.match(/radius = 12\.dp/g)).toHaveLength(1);
  });

  test("motion: milliseconds, easing curves, springs and reduced motion", () => {
    expect(kt).toContain("object MotifDurations {\n    const val instant = 0\n    const val fast = 120\n    const val base = 200\n");
    expect(kt).toContain("val standard = CubicBezierEasing(0.2f, 0f, 0f, 1f)");
    const snappy = springPhysics({ duration: 0.25, bounce: 0 });
    const smooth = springPhysics({ duration: 0.4, bounce: 0.1 });
    const two = (n: number) => Number(n.toFixed(2));
    expect(kt).toContain(`fun <T> snappy(): SpringSpec<T> = spring(dampingRatio = 1f, stiffness = ${two(snappy.stiffness)}f)`);
    expect(kt).toContain(`fun <T> smooth(): SpringSpec<T> = spring(dampingRatio = ${two(smooth.dampingRatio)}f, stiffness = ${two(smooth.stiffness)}f)`);
    expect(kt).toContain("spring(dampingRatio =");
    expect(kt).toContain("@Composable\n    fun reduced(): Boolean {");
    expect(kt).toContain("Settings.Global.ANIMATOR_DURATION_SCALE,");
    expect(kt).toContain("@Composable\n    fun duration(millis: Int): Int = if (reduced()) 0 else millis");
  });

  test("type: one style per role with no colour, through MotifFonts, mapped onto Material's slots", () => {
    expect(kt).toContain("object MotifType {");
    expect(kt).toContain("    val display: TextStyle\n        get() = TextStyle(\n            fontFamily = MotifFonts.inter,\n            fontWeight = FontWeight.W700,\n            fontSize = 40.sp,\n            lineHeight = 44.sp,\n            lineHeightStyle = EvenLeading,\n        )");
    expect(kt).toContain("fontWeight = FontWeight.W600,");
    expect(kt).not.toMatch(/TextStyle\([^)]*color =/);
    // The slots step down on the guide's own sizes, as Flutter's do; a smaller copy keeps the role's line height ratio.
    for (const line of [
      "displayLarge = display,",
      "displaySmall = display,",
      "headlineLarge = title,",
      "headlineSmall = title.copy(fontSize = 20.sp, lineHeight = 24.sp),",
      "titleLarge = heading,",
      "titleMedium = heading.copy(fontSize = 16.sp, lineHeight = 20.8.sp),",
      "bodyLarge = body,",
      "bodyMedium = body.copy(fontSize = 14.sp, lineHeight = 21.sp),",
      "bodySmall = caption,",
      "labelLarge = label,",
      "labelSmall = label.copy(fontSize = 12.sp, lineHeight = 16.8.sp),",
    ]) expect(kt).toContain(line);
    expect(kt).not.toContain("Arabic");
  });

  test("fonts: a Google family through downloadable fonts, with the screenshots' override", () => {
    expect(kt).toContain("object MotifFonts {");
    expect(kt).toContain("    /** Set by Motif's screenshots. Leave it null in your app. */\n    var debugFontOverride: ((String) -> FontFamily?)? = null");
    expect(kt).toContain('providerAuthority = "com.google.android.gms.fonts",');
    expect(kt).toContain('providerPackage = "com.google.android.gms",');
    expect(kt).toContain("certificates = R.array.com_google_android_gms_fonts_certs,");
    expect(kt).toContain("import com.example.rafiq.R\n");
    expect(kt).toContain('get() = debugFontOverride?.invoke("Inter") ?: interFamily');
    expect(kt).toContain('Font(googleFont = GoogleFont("Inter"), fontProvider = provider, weight = FontWeight.W400),');
    expect(kt).toContain('Font(googleFont = GoogleFont("Inter"), fontProvider = provider, weight = FontWeight.W700),');
  });

  test("without variants there is no variant enum, parameter or override", () => {
    expect(kt).not.toContain("MotifVariant");
    expect(kt).not.toContain("debugVariantOverride");
    expect(kt).toContain("fun MotifTheme(\n    darkTheme: Boolean = isSystemInDarkTheme(),\n    content: @Composable () -> Unit,\n) {");
    expect(kt).toContain("val colors = if (darkTheme) MotifColors.Dark else MotifColors.Light");
    expect(kt).toContain("CompositionLocalProvider(LocalMotifColors provides colors) {");
    expect(kt).toContain("MaterialTheme(\n            colorScheme = motifColorScheme(colors, darkTheme),\n            typography = motifTypography(),\n            shapes = MotifShapes,\n            content = content,\n        )");
    expect(kt).toContain("object MotifTheme {\n");
    expect(kt).toContain("    val colors: MotifColors\n        @Composable\n        @ReadOnlyComposable\n        get() = LocalMotifColors.current\n");
  });

  test("no line is longer than 100 characters, and indentation is in fours", () => {
    for (const line of kt.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(100);
      if (!/^ *\*/.test(line)) expect(line.match(/^ */)![0].length % 4).toBe(0);
    }
  });

  test("the whole file", () => {
    expect(kt).toMatchSnapshot();
  });
});

describe("generateCompose, names", () => {
  test("role names become lowerCamelCase members, never a Kotlin keyword", () => {
    expect(kotlinMember("0-5", "s")).toBe("s0p5");
    expect(kotlinMember("on-action-primary", "c")).toBe("onActionPrimary");
    expect(kotlinMember("in", "e")).toBe("inValue");
    expect(kotlinMember("object", "e")).toBe("objectValue");
    expect(kotlinMember("default", "c")).toBe("default");
    const t = validTokens();
    t.space["0-5"] = { $value: { value: 2, unit: "px" } };
    t.easing.in = { $value: [0.4, 0, 1, 1] };
    const kt = kotlinFor(t);
    expect(kt).toContain("    val s0p5 = 2.dp\n");
    expect(kt).toContain("    val inValue = CubicBezierEasing(0.4f, 0f, 1f, 1f)\n");
  });

  test("a font file's resource name: lowercase letters, digits and underscores, starting with a letter", () => {
    expect(resourceName("Thmanyah Sans Bold.ttf")).toBe("thmanyah_sans_bold");
    expect(resourceName("BrandSans-Regular.otf")).toBe("brandsans_regular");
    expect(resourceName("2024 Brand.ttf")).toBe("font_2024_brand");
  });
});

describe("generateCompose, two variants", () => {
  const kt = kotlinFor(partnerTokens());

  test("an enum with the default first, and colours for each variant", () => {
    expect(kt).toContain("enum class MotifVariant { Default, Partner }");
    expect(kt).toContain("        val Light = MotifColors(");
    expect(kt).toContain("        val PartnerLight = MotifColors(");
    expect(kt).toContain("        val PartnerDark = MotifColors(");
    const partnerLight = kt.slice(kt.indexOf("val PartnerLight"));
    expect(partnerLight).toContain("surface = Color(0xFFFFF7ED),");
  });

  test("MotifTheme takes a variant, and the screenshots' override wins", () => {
    expect(kt).toContain("fun MotifTheme(\n    variant: MotifVariant = MotifVariant.Default,\n    darkTheme: Boolean = isSystemInDarkTheme(),\n");
    expect(kt).toContain("val colors = when (MotifTheme.debugVariantOverride ?: variant) {");
    expect(kt).toContain("debugVariantOverride ?: variant");
    expect(kt).toContain("MotifVariant.Partner -> if (darkTheme) MotifColors.PartnerDark else MotifColors.PartnerLight");
    expect(kt).toContain("    /** Set by Motif's screenshots. Leave it null in your app. */\n    var debugVariantOverride: MotifVariant? = null");
  });
});

describe("generateCompose, an Arabic companion", () => {
  const t = withCompanion(validTokens());
  t.font.display.$value.fontFamily = ["Onest", "Readex Pro", "sans-serif"];
  const kt = kotlinFor(t);

  test("roles with a companion get an Arabic style, used in Arabic-script locales", () => {
    expect(kt).toContain("    val displayArabic: TextStyle\n        get() = TextStyle(\n            fontFamily = MotifFonts.readexPro,");
    expect(kt).toContain("    val bodyArabic: TextStyle\n");
    expect(kt).not.toContain("titleArabic");
    expect(kt).toContain('private val ARABIC_SCRIPT = setOf("ar", "fa", "ur", "ps", "ckb", "sd", "ug")');
    expect(kt).toContain("typography = motifTypography(arabic),");
    expect(kt).toContain("val display = if (arabic) MotifType.displayArabic else MotifType.display");
    expect(kt).toContain("val title = MotifType.title\n");
  });

  test("the companion is loaded at the weights its roles use", () => {
    // Too long for one line, so one argument per line.
    for (const weight of ["W400", "W700"]) {
      expect(kt).toContain(`        Font(\n            googleFont = GoogleFont("Readex Pro"),\n            fontProvider = provider,\n            weight = FontWeight.${weight},\n        ),`);
    }
  });
});

describe("generateCompose, fonts", () => {
  test("a project font comes from the app's res/font resources, at each file's weight and style", () => {
    const kt = kotlinFor(brandTokens(), {
      resFonts: new Map([["brand sans", ["brand_sans_regular", "brand_sans_bold", "brand_sans_italic"]]]),
    });
    expect(kt).toContain("Font(R.font.brand_sans_regular, FontWeight.W400),");
    expect(kt).toContain("Font(R.font.brand_sans_bold, FontWeight.W700),");
    expect(kt).toContain("Font(R.font.brand_sans_italic, FontWeight.W400, FontStyle.Italic),");
    expect(kt).toContain("fontFamily = MotifFonts.brandSans,");
    expect(kt).toContain("import androidx.compose.ui.text.font.FontStyle\n");
  });

  test("a project font with no font files Android reads stays on the system font, named in a comment", () => {
    const kt = kotlinFor(brandTokens(), { resFonts: new Map() });
    expect(kt).toContain("/** Brand Sans: not in the app's font resources (res/font), so the system font stands in. */");
    expect(kt).toContain('get() = debugFontOverride?.invoke("Brand Sans") ?: FontFamily.Default');
  });

  test("without the Google Fonts dependency, the family is the system font, named in a comment", () => {
    const kt = kotlinFor(validTokens(), { googleFonts: false });
    expect(kt).not.toContain("GoogleFont");
    expect(kt).not.toContain("import com.example.rafiq.R");
    expect(kt).toContain("/** Inter: the system font until the app depends on ui-text-google-fonts (Google Fonts). */");
    expect(kt).toContain('get() = debugFontOverride?.invoke("Inter") ?: FontFamily.Default');
  });

  test("a generic family is Compose's own", () => {
    const t = validTokens();
    t.font.body.$value.fontFamily = ["system-ui", "sans-serif"];
    t.font.caption.$value.fontFamily = ["Menlo", "monospace"];
    t.font.label.$value.fontFamily = ["Georgia", "serif"];
    const kt = kotlinFor(t);
    expect(kt).toContain("    val body: TextStyle\n        get() = TextStyle(\n            fontFamily = FontFamily.Default,");
    expect(kt).toContain("    val caption: TextStyle\n        get() = TextStyle(\n            fontFamily = FontFamily.Monospace,");
    expect(kt).toContain("    val label: TextStyle\n        get() = TextStyle(\n            fontFamily = FontFamily.Serif,");
  });

  test("the R class isn't imported when the theme is in the module's own package", () => {
    const kt = kotlinFor(validTokens(), { packageName: "com.example.rafiq", rPackage: "com.example.rafiq" });
    expect(kt).not.toContain("import com.example.rafiq.R");
    expect(kt).toContain("certificates = R.array.com_google_android_gms_fonts_certs,");
  });

  test("letter spacing in sp", () => {
    const t = validTokens();
    t.font.display.$value.letterSpacing = { value: -0.5, unit: "px" };
    expect(kotlinFor(t)).toContain("letterSpacing = (-0.5).sp,");
  });
});

describe("the font certificates", () => {
  test("Google Play services' published certificates, with Motif's XML header", () => {
    const xml = fontCertsXml();
    expect(xml.startsWith(`${XML_HEADER}\n`)).toBe(true);
    expect(isMotifGenerated("app/src/main/res/values/motif_font_certs.xml", xml)).toBe(true);
    expect(xml).toContain('<array name="com_google_android_gms_fonts_certs">');
    expect(xml).toContain("<item>@array/com_google_android_gms_fonts_certs_dev</item>");
    expect(xml).toContain('<string-array name="com_google_android_gms_fonts_certs_prod">');
    expect(xml).toContain("android/compose-samples");
    expect(xml).not.toContain("<?xml");
  });

  test("a hand-written XML file isn't Motif's", () => {
    expect(isMotifGenerated("res/values/x.xml", '<?xml version="1.0" encoding="utf-8"?>\n<resources />\n')).toBe(false);
    expect(isMotifGenerated("res/values/x.xml", `${XML_HEADER}\n<resources />\n`)).toBe(true);
  });
});

describe("generated-edited for Motif's XML", () => {
  test("an edited certificates file is flagged; an untouched one isn't", () => {
    const path = "app/src/main/res/values/motif_font_certs.xml";
    const root = makeProject({ [path]: fontCertsXml() });
    expect(generatedEditedHits(root, [{ path, content: fontCertsXml() }])).toEqual([]);
    writeFileSync(join(root, path), fontCertsXml().replace("</resources>", "    <string name=\"x\">x</string>\n</resources>"));
    expect(generatedEditedHits(root, [{ path, content: fontCertsXml() }]).map((h) => h.rule)).toEqual(["generated-edited"]);
  });
});
