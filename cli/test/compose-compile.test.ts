import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { buildThemeSet } from "../src/generate/theme";
import { fontCertsXml } from "../src/stacks/compose/fonts";
import { generateCompose } from "../src/stacks/compose/generate";
import { androidToolchain, docFrom, FIXTURES, hasAndroid, heavyStackTests, hexColor, partnerTokens, validTokens, withCompanion } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const PACKAGE = "dev.motif.composemin";
const SOURCES = `app/src/main/java/${PACKAGE.split(".").join("/")}`;

/** Code that uses every part of the generated API, so the compiler checks it the way an app calls it. */
const USAGE = `package ${PACKAGE}.ui.motif

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle

/** A role without an Arabic companion is a plain value, so it can be read outside composables. */
val HeadingStyle: TextStyle = MotifType.heading

@Composable
fun Example(open: Boolean) {
    val colors = MotifTheme.colors
    val width by animateDpAsState(
        targetValue = if (open) MotifSpace.s16 else MotifSpace.s4,
        animationSpec = tween(MotifMotion.duration(MotifDurations.base), easing = MotifEasing.standard),
    )
    val height by animateDpAsState(
        targetValue = if (open) MotifSpace.s8 else MotifSpace.s0p5,
        animationSpec = MotifSprings.snappy(),
    )
    Box(
        Modifier
            .motifShadow(MotifShadows.md, RoundedCornerShape(MotifRadius.md))
            .background(colors.surface, RoundedCornerShape(MotifRadius.full))
            .padding(horizontal = width, vertical = height),
    ) {
        // body has an Arabic companion: in a composable, MotifType.body follows the locale.
        Text("Hi", style = MotifType.body.copy(color = colors.textPrimary))
        Text("Latin", style = MotifType.bodyLatin)
        Text("Heading", style = HeadingStyle)
        Text("\\u0645\\u0631\\u062D\\u0628\\u0627", style = MotifType.bodyArabic)
        Text("\${MotifMotion.reduced()}", style = MaterialTheme.typography.labelSmall)
        Text("Ok", fontFamily = MotifFonts.readexPro, color = LocalMotifColors.current.actionPrimary)
        Text("Small", style = MotifType.caption.copy(fontFamily = MotifFonts.brandSans))
    }
}

@Composable
fun App() {
    MotifTheme.debugVariantOverride = MotifVariant.Partner
    MotifFonts.debugFontOverride = { null }
    MotifTheme(variant = MotifVariant.Partner, darkTheme = true) {
        Example(open = true)
    }
    MotifTheme {
        Example(open = MotifColors.PartnerLight != MotifColors.Dark)
    }
    MotifTheme.debugVariantOverride = null
    MotifFonts.debugFontOverride = null
}
`;

/** The other shape: no variants, no companion, a project font from res/font, and no downloadable fonts. */
const PLAIN_USAGE = `package ${PACKAGE}.plain

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
fun Plain() {
    MotifTheme(darkTheme = false) {
        Text("Hi", style = MotifType.body, color = MotifTheme.colors.textSecondary)
    }
}
`;

/** A light action colour: actionText for a link, and onActionText on it. */
const READABLE_USAGE = `package ${PACKAGE}.readable

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
fun Readable() {
    MotifTheme(variant = MotifVariant.Partner, darkTheme = false) {
        Text("Later", color = MotifTheme.colors.actionText)
        Text("On", color = MotifColors.PartnerLight.onActionText)
    }
}
`;

function run(cmd: string[], cwd: string, env: Record<string, string | undefined>): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

const heavy = heavyStackTests("compose", hasAndroid());
if (!heavy.run) console.log(`[compose-compile] Gradle and Robolectric tests skipped: ${heavy.reason}`);

describe("the generated Kotlin", () => {
  test.skipIf(!heavy.run)("compiles with the app's Gradle, with no warnings from Motif's files", () => {
    const { java, sdk } = androidToolchain()!;
    const dir = tempDir("motif-compose-");
    cpSync(join(FIXTURES, "compose-min"), dir, {
      recursive: true,
      filter: (src) => ![".gradle", "build", ".kotlin", "local.properties"].includes(basename(src)),
    });
    writeFileSync(join(dir, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`);

    // Two variants, an Arabic companion and Google's downloadable fonts (the fixture depends on them).
    const tokens = withCompanion(partnerTokens());
    tokens.space["0-5"] = { $value: { value: 2, unit: "px" } };
    tokens.shadow.md.$value = [{ ...tokens.shadow.md.$value, spread: { value: -1, unit: "px" } }, tokens.shadow.sm.$value];
    // And a project font, so one file takes Font from both androidx.compose.ui.text.font and googlefonts.
    tokens.$extensions["dev.motif"].fonts = [{ family: "Brand Sans", files: [{ path: "design/fonts/Brand.ttf", weight: 400, style: "normal" }] }];
    tokens.font.caption.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const [theme] = generateCompose(buildThemeSet(docFrom(tokens)), {
      packageName: `${PACKAGE}.ui.motif`,
      rPackage: PACKAGE,
      googleFonts: true,
      resFonts: new Map([["brand sans", ["brand_sans"]]]),
    });
    expect(theme!.content).toContain("enum class MotifVariant { Default, Partner }");
    expect(theme!.content).toContain("val bodyArabic: TextStyle");
    expect(theme!.content).toContain("get() = if (arabicScript()) bodyArabic else bodyLatin");
    // Every slot of Material 3 1.3's scheme, so the floor's compiler checks each name.
    expect(theme!.content).toContain("tertiaryContainer = colors.surfaceRaised,");
    expect(theme!.content).toContain("surfaceContainerLowest = colors.background,");
    expect(theme!.content).toContain("scrim = Color.Black,");
    expect(theme!.content).toContain("import androidx.compose.ui.text.font.Font\n");
    expect(theme!.content).toContain("import androidx.compose.ui.text.googlefonts.Font\n");
    expect(theme!.content).toContain("Font(R.font.brand_sans, FontWeight.W400),");
    mkdirSync(join(dir, SOURCES, "ui/motif"), { recursive: true });
    writeFileSync(join(dir, SOURCES, "ui/motif/MotifTheme.kt"), theme!.content);
    writeFileSync(join(dir, SOURCES, "ui/motif/Usage.kt"), USAGE);
    writeFileSync(join(dir, "app/src/main/res/values/motif_font_certs.xml"), fontCertsXml());

    const plainTokens = validTokens();
    plainTokens.$extensions["dev.motif"].fonts = [{ family: "Brand Sans", files: [{ path: "design/fonts/Brand.ttf", weight: 400, style: "normal" }] }];
    plainTokens.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const [plain] = generateCompose(buildThemeSet(docFrom(plainTokens)), {
      packageName: `${PACKAGE}.plain`,
      rPackage: PACKAGE,
      googleFonts: false,
      resFonts: new Map([["brand sans", ["brand_sans"]]]),
    });
    expect(plain!.content).toContain("Font(R.font.brand_sans, FontWeight.W400),");
    mkdirSync(join(dir, SOURCES, "plain"), { recursive: true });
    writeFileSync(join(dir, SOURCES, "plain/MotifTheme.kt"), plain!.content);
    writeFileSync(join(dir, SOURCES, "plain/Usage.kt"), PLAIN_USAGE);
    // The system font with an Arabic companion: Latin in FontFamily.Default, Arabic in the companion (v0.5.0 sweep).
    const systemTokens = validTokens();
    systemTokens.font.body.$value.fontFamily = ["system-ui", "Readex Pro"];
    const [system] = generateCompose(buildThemeSet(docFrom(systemTokens)), {
      packageName: `${PACKAGE}.system`,
      rPackage: PACKAGE,
      googleFonts: true,
      resFonts: new Map(),
    });
    expect(system!.content).toContain("get() = if (arabicScript()) bodyArabic else bodyLatin");
    mkdirSync(join(dir, SOURCES, "system"), { recursive: true });
    writeFileSync(join(dir, SOURCES, "system/MotifTheme.kt"), system!.content);
    // HiSalon's mint on a near-white page, in the default variant and the partner one: primary is actionText
    // (v0.5.0 gate).
    const readableTokens = partnerTokens();
    readableTokens.color["action-primary"].$value = hexColor("#7EEBC1");
    readableTokens.color["action-primary"].$extensions["dev.motif"].variants = { partner: { value: hexColor("#7EEBC1") } };
    readableTokens.color.background.$value = hexColor("#F7F9F8");
    const [readable] = generateCompose(buildThemeSet(docFrom(readableTokens)), {
      packageName: `${PACKAGE}.readable`,
      rPackage: PACKAGE,
      googleFonts: false,
      resFonts: new Map(),
    });
    expect(readable!.content).toContain("primary = colors.actionText,");
    mkdirSync(join(dir, SOURCES, "readable"), { recursive: true });
    writeFileSync(join(dir, SOURCES, "readable/MotifTheme.kt"), readable!.content);
    writeFileSync(join(dir, SOURCES, "readable/Usage.kt"), READABLE_USAGE);
    mkdirSync(join(dir, "app/src/main/res/font"), { recursive: true });
    copyFileSync(join(FIXTURES, "flutter-min/assets/fonts/NotoNaskhArabic.ttf"), join(dir, "app/src/main/res/font/brand_sans.ttf"));

    // Gradle runs on the JDK Motif finds: the PATH's java needs nothing, any other needs JAVA_HOME.
    const env = { ...process.env, ...(process.env.JAVA_HOME || Bun.which("java") ? {} : { JAVA_HOME: dirname(dirname(java)) }) };
    const gradlew = process.platform === "win32" ? ["cmd", "/c", join(dir, "gradlew.bat")] : ["sh", join(dir, "gradlew")];
    const task = [":app:compileDebugKotlin", "--console=plain", "--warning-mode=none"];
    // Offline once Gradle, the Android plugin and Compose have been downloaded on this machine.
    let build = run([...gradlew, ...task, "--offline"], dir, env);
    if (build.code !== 0) build = run([...gradlew, ...task], dir, env);
    if (build.code !== 0) console.log(build.out);
    expect(build.code).toBe(0);
    const warnings = build.out.split(/\r?\n/).filter((l) => /^w: /.test(l) && /[\\/](ui[\\/]motif|plain|system|readable)[\\/]/.test(l));
    expect(warnings).toEqual([]);
  }, 1_200_000);
});
