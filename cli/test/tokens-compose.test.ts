import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { TS_HEADER, XML_HEADER } from "../src/generate/header";
import { twoVariantTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = JSON.stringify(validTokens());
const THEME = "app/src/main/java/com/example/rafiq/ui/motif/MotifTheme.kt";
const CERTS = "app/src/main/res/values/motif_font_certs.xml";
const GOOGLE_FONTS_LIB = 'androidx-compose-ui-text-google-fonts = { group = "androidx.compose.ui", name = "ui-text-google-fonts" }';

const catalogue = (googleFonts: boolean) =>
  [
    "[versions]",
    'agp = "8.13.1"',
    'composeBom = "2025.08.00"',
    "",
    "[libraries]",
    'androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }',
    'androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }',
    ...(googleFonts ? [GOOGLE_FONTS_LIB] : []),
    "",
    "[plugins]",
    'android-application = { id = "com.android.application", version.ref = "agp" }',
    'kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version = "2.2.20" }',
    "",
  ].join("\n");

const appGradle = (deps: string[]) =>
  [
    "plugins {",
    "    alias(libs.plugins.android.application)",
    "    alias(libs.plugins.kotlin.compose)",
    "}",
    "",
    "android {",
    '    namespace = "com.example.rafiq"',
    "    buildFeatures {",
    "        compose = true",
    "    }",
    "}",
    "",
    "dependencies {",
    "    implementation(platform(libs.androidx.compose.bom))",
    "    implementation(libs.androidx.compose.material3)",
    ...deps.map((d) => `    ${d}`),
    "}",
    "",
  ].join("\n");

const MAIN = `package com.example.rafiq

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.example.rafiq.ui.theme.RafiqTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RafiqTheme {
            }
        }
    }
}
`;
const TEMPLATE_THEME = "package com.example.rafiq.ui.theme\n\n@Composable\nfun RafiqTheme(content: @Composable () -> Unit) {\n    MaterialTheme(content = content)\n}\n";

/** An app shaped like Android Studio's Empty Activity template, with Google's downloadable fonts unless told otherwise. */
const composeApp = (files: Record<string, string> = {}, opts: { googleFonts?: boolean } = {}) =>
  makeProject({
    "settings.gradle.kts": 'rootProject.name = "Rafiq"\ninclude(":app")\n',
    "build.gradle.kts": "plugins {\n    alias(libs.plugins.android.application) apply false\n    alias(libs.plugins.kotlin.compose) apply false\n}\n",
    "gradle/libs.versions.toml": catalogue(opts.googleFonts !== false),
    "app/build.gradle.kts": appGradle(opts.googleFonts !== false ? ["implementation(libs.androidx.compose.ui.text.google.fonts)"] : []),
    "app/src/main/java/com/example/rafiq/MainActivity.kt": MAIN,
    "app/src/main/java/com/example/rafiq/ui/theme/Theme.kt": TEMPLATE_THEME,
    "design/tokens.json": TOKENS,
    ...files,
  });
const ctx = { positionals: [] };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => (r.data.notes as string[]).join("\n");
const WIRING = "Next: wrap your setContent in MotifTheme { … } (import com.example.rafiq.ui.motif.MotifTheme) in place of the template's own theme.";

/** Tokens whose body font is a font the project bundles, with these files. */
const brandTokens = (files: string[]) => {
  const t = validTokens();
  t.$extensions["dev.motif"].fonts = [{
    family: "Thmanyah Sans",
    files: files.map((path) => ({ path, weight: /Bold/.test(path) ? 700 : 400, style: "normal" })),
  }];
  t.font.body.$value.fontFamily = ["Thmanyah Sans", "sans-serif"];
  return JSON.stringify(t);
};

describe("motif tokens for a Compose app", () => {
  test("writes MotifTheme.kt in the app's package and the font certificates, and says how to wire it", async () => {
    const root = composeApp();
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({ [THEME]: "created", [CERTS]: "created", "design/motif.json": "created" });
    const kt = readFileSync(join(root, THEME), "utf8");
    expect(kt.startsWith(`${TS_HEADER}\n\npackage com.example.rafiq.ui.motif\n`)).toBe(true);
    expect(kt).toContain("import com.example.rafiq.R\n");
    expect(kt).toContain('Font(googleFont = GoogleFont("Inter"), fontProvider = provider, weight = FontWeight.W400),');
    expect(readFileSync(join(root, CERTS), "utf8").startsWith(`${XML_HEADER}\n`)).toBe(true);
    expect(notes(r)).toContain(WIRING);
    expect(notes(r)).not.toContain("coming soon");
    expect(notes(r).match(/Next: wrap/g)).toHaveLength(1);
    // The template's own theme is left as it was, and nothing is written for other stacks.
    expect(readFileSync(join(root, "app/src/main/java/com/example/rafiq/ui/theme/Theme.kt"), "utf8")).toBe(TEMPLATE_THEME);
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: "app", stack: "compose" }]);
  });

  test("running again changes nothing, and once the app calls MotifTheme the wiring note goes", async () => {
    const root = composeApp();
    await runTokens(root, ctx);
    const main = join(root, "app/src/main/java/com/example/rafiq/MainActivity.kt");
    // A call in a comment or a string doesn't count.
    writeFileSync(main, MAIN.replace("RafiqTheme {", '// MotifTheme {\n            val s = "MotifTheme {"\n            RafiqTheme {'));
    expect(notes(await runTokens(root, ctx))).toContain(WIRING);
    writeFileSync(main, MAIN.replace("RafiqTheme {", "MotifTheme {"));
    const r = await runTokens(root, ctx);
    expect(new Set(Object.values(statuses(r)))).toEqual(new Set(["unchanged"]));
    expect(r.text).toContain("up to date");
    expect(notes(r)).not.toContain("Next: wrap");
    // MotifTheme( with arguments counts too.
    writeFileSync(main, MAIN.replace("RafiqTheme {", "MotifTheme(darkTheme = false) {"));
    expect(notes(await runTokens(root, ctx))).not.toContain("Next: wrap");
  });

  test("without Google's downloadable fonts, the note gives the catalogue and dependency lines, and no certificates are written", async () => {
    const root = composeApp({}, { googleFonts: false });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)[CERTS]).toBeUndefined();
    expect(notes(r)).toContain(
      [
        "app uses Inter from Google Fonts, which needs Compose's downloadable fonts. Add this line to gradle/libs.versions.toml, under [libraries]:",
        GOOGLE_FONTS_LIB,
        "and this one to app/build.gradle.kts, under dependencies:",
        "implementation(libs.androidx.compose.ui.text.google.fonts)",
        "Then run motif tokens again. Until then, the theme uses the system font for Inter.",
      ].join("\n"),
    );
    const kt = readFileSync(join(root, THEME), "utf8");
    expect(kt).toContain('get() = debugFontOverride?.invoke("Inter") ?: FontFamily.Default');
    expect(kt).not.toContain("GoogleFont");
  });

  test("the dependency counts when it's named in the build file itself, and a catalogue alias only when it's used", async () => {
    const direct = composeApp(
      { "app/build.gradle.kts": appGradle(['implementation("androidx.compose.ui:ui-text-google-fonts:1.9.0")']) },
      { googleFonts: false },
    );
    expect(statuses(await runTokens(direct, ctx))[CERTS]).toBe("created");
    // In the catalogue, but the module doesn't use it (or only in a comment).
    const unused = composeApp(
      { "app/build.gradle.kts": appGradle(["// implementation(libs.androidx.compose.ui.text.google.fonts)"]) },
      { googleFonts: true },
    );
    expect(notes(await runTokens(unused, ctx))).toContain("Then run motif tokens again.");
  });

  test("without a version catalogue, the note gives the dependency line alone", async () => {
    const root = composeApp({}, { googleFonts: false });
    writeFileSync(join(root, "gradle/libs.versions.toml"), "");
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain(
      'Add this line to app/build.gradle.kts, under dependencies (the Compose BOM sets its version):\nimplementation("androidx.compose.ui:ui-text-google-fonts")\nThen run motif tokens again.',
    );
  });

  test("a project font's .ttf files are copied to res/font under resource names", async () => {
    const root = composeApp({
      "design/tokens.json": brandTokens(["design/fonts/Thmanyah Sans Regular.ttf", "design/fonts/Thmanyah Sans Bold.ttf"]),
      "design/fonts/Thmanyah Sans Regular.ttf": "regular",
      "design/fonts/Thmanyah Sans Bold.ttf": "bold",
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)["app/src/main/res/font/thmanyah_sans_regular.ttf"]).toBe("created");
    expect(statuses(r)["app/src/main/res/font/thmanyah_sans_bold.ttf"]).toBe("created");
    expect(readFileSync(join(root, "app/src/main/res/font/thmanyah_sans_bold.ttf"), "utf8")).toBe("bold");
    const kt = readFileSync(join(root, THEME), "utf8");
    expect(kt).toContain("Font(R.font.thmanyah_sans_regular, FontWeight.W400),");
    expect(kt).toContain("Font(R.font.thmanyah_sans_bold, FontWeight.W700),");
    expect(statuses(await runTokens(root, ctx))["app/src/main/res/font/thmanyah_sans_bold.ttf"]).toBe("unchanged");
  });

  test("font files with the same name from different folders get different resource names", async () => {
    const t = validTokens();
    t.$extensions["dev.motif"].fonts = [{
      family: "Brand Sans",
      files: [
        { path: "design/fonts/regular/Brand.ttf", weight: 400, style: "normal" },
        { path: "design/fonts/bold/Brand.ttf", weight: 700, style: "normal" },
      ],
    }];
    t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const root = composeApp({
      "design/tokens.json": JSON.stringify(t),
      "design/fonts/regular/Brand.ttf": "regular",
      "design/fonts/bold/Brand.ttf": "bold",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["app/src/main/res/font/regular_brand.ttf"]).toBe("created");
    expect(statuses(r)["app/src/main/res/font/bold_brand.ttf"]).toBe("created");
  });

  test("a project font with only WOFF2 files gets a note", async () => {
    const root = composeApp({
      "design/tokens.json": brandTokens(["design/fonts/ThmanyahSans.woff2"]),
      "design/fonts/ThmanyahSans.woff2": "woff2",
    });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("Android can't use WOFF2: add a .ttf or .otf of Thmanyah Sans to the guide's font files.");
    expect(Object.keys(statuses(r)).some((p) => p.includes("res/font"))).toBe(false);
  });

  test("themeDir in motif.json changes the folder and the package", async () => {
    const root = composeApp({
      "design/motif.json": JSON.stringify({
        motifContract: 1,
        apps: [{ path: "app", stack: "compose", themeDir: "app/src/main/java/com/example/rafiq/design" }],
        ignore: [],
      }),
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    const path = "app/src/main/java/com/example/rafiq/design/MotifTheme.kt";
    expect(statuses(r)[path]).toBe("created");
    expect(readFileSync(join(root, path), "utf8")).toContain("\npackage com.example.rafiq.design\n");
    expect(notes(r)).toContain("(import com.example.rafiq.design.MotifTheme)");
  });

  test("a theme folder outside the module's source folders gets a note", async () => {
    const root = composeApp({
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: "app", stack: "compose", themeDir: "design/compose" }], ignore: [] }),
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["design/compose/MotifTheme.kt"]).toBe("created");
    expect(notes(r)).toContain(
      "design/compose isn't inside a Kotlin source folder (like app/src/main/java), so Gradle won't compile MotifTheme.kt. Set themeDir in design/motif.json to a folder under app/src/main/java and run motif tokens again.",
    );
  });

  test("a hand-written MotifTheme.kt is never overwritten", async () => {
    const mine = "package com.example.rafiq.ui.motif\n\nobject MotifTheme\n";
    const root = composeApp({ [THEME]: mine });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(statuses(r)[THEME]).toBe("protected");
    expect(readFileSync(join(root, THEME), "utf8")).toBe(mine);
    expect(notes(r)).not.toContain("Next: wrap");
  });

  test("a hand-written resource file with the certificates' name is never overwritten", async () => {
    const mine = '<?xml version="1.0" encoding="utf-8"?>\n<resources />\n';
    const root = composeApp({ [CERTS]: mine });
    const r = await runTokens(root, ctx);
    expect(statuses(r)[CERTS]).toBe("protected");
    expect(readFileSync(join(root, CERTS), "utf8")).toBe(mine);
  });

  test("with design variants, the wiring note says how to choose one, and the other changes are named", async () => {
    const r = await runTokens(composeApp({ "design/tokens.json": JSON.stringify(twoVariantTokens()) }), ctx);
    expect(r.exitCode).toBe(0);
    expect(notes(r)).toContain(WIRING);
    expect(notes(r)).toContain("MotifTheme(variant = MotifVariant.Women)");
    expect(notes(r)).toContain("MotifVariant.Men");
    expect(notes(r)).toContain("at runtime");
    expect(notes(r)).toContain("The Men variant also changes corners. Compose theme code gives each variant its own colours only, so it uses the default corners.");
  });

  test("without variants, the note doesn't mention them", async () => {
    expect(notes(await runTokens(composeApp(), ctx))).not.toContain("variant");
  });
});

/** The certificates as an app that already uses downloadable fonts has them (Android's own sample file). */
const OWN_CERTS = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <array name="com_google_android_gms_fonts_certs">\n        <item>@array/com_google_android_gms_fonts_certs_dev</item>\n    </array>\n</resources>\n';

describe("motif tokens for a Compose app: review fixes (Task 4, round 1)", () => {
  test("an app that already has the font certificates keeps its own, and Motif writes none", async () => {
    const root = composeApp({ "app/src/main/res/values-v23/font_certs.xml": OWN_CERTS });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)[CERTS]).toBeUndefined();
    expect(existsSync(join(root, CERTS))).toBe(false);
    // The theme's R.array reference resolves to the app's own array.
    expect(readFileSync(join(root, THEME), "utf8")).toContain("certificates = R.array.com_google_android_gms_fonts_certs,");
  });

  test("when the app adds its own certificates after Motif wrote them, a note says to delete Motif's copy", async () => {
    const root = composeApp();
    await runTokens(root, ctx);
    expect(existsSync(join(root, CERTS))).toBe(true);
    writeFileSync(join(root, "app/src/main/res/values/font_certs.xml"), OWN_CERTS);
    const r = await runTokens(root, ctx);
    expect(statuses(r)[CERTS]).toBeUndefined();
    expect(notes(r)).toContain(
      `Delete ${CERTS}: app/src/main/res/values/font_certs.xml defines the same font certificates, and Android won't build an app that defines them twice.`,
    );
    // Once it's gone, there's nothing more to say.
    rmSync(join(root, CERTS));
    expect(notes(await runTokens(root, ctx))).not.toContain("font certificates");
  });

  test("a project font whose file isn't there stays on the system font: the code never names a resource that isn't in place", async () => {
    const root = composeApp({ "design/tokens.json": brandTokens(["design/fonts/Thmanyah Sans Regular.ttf"]) });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["app/src/main/res/font/thmanyah_sans_regular.ttf"]).toBe("skipped");
    expect(notes(r)).toContain("design/fonts/Thmanyah Sans Regular.ttf doesn't exist, so it wasn't copied");
    const kt = readFileSync(join(root, THEME), "utf8");
    expect(kt).not.toContain("R.font.");
    expect(kt).toContain('get() = debugFontOverride?.invoke("Thmanyah Sans") ?: FontFamily.Default');
    // A copy already in place is used even when the guide's own file has gone.
    mkdirSync(join(root, "app/src/main/res/font"), { recursive: true });
    writeFileSync(join(root, "app/src/main/res/font/thmanyah_sans_regular.ttf"), "regular");
    await runTokens(root, ctx);
    expect(readFileSync(join(root, THEME), "utf8")).toContain("Font(R.font.thmanyah_sans_regular, FontWeight.W400),");
  });

  test("a font file already in res/font keeps its own name; a copy that would share it gets another", async () => {
    const t = validTokens();
    t.$extensions["dev.motif"].fonts = [{
      family: "Brand Sans",
      files: [
        { path: "design/fonts/Brand.otf", weight: 700, style: "normal" },
        { path: "app/src/main/res/font/brand.ttf", weight: 400, style: "normal" },
      ],
    }];
    t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const root = composeApp({
      "design/tokens.json": JSON.stringify(t),
      "design/fonts/Brand.otf": "bold",
      "app/src/main/res/font/brand.ttf": "regular",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["app/src/main/res/font/brand_2.otf"]).toBe("created");
    expect(Object.keys(statuses(r))).not.toContain("app/src/main/res/font/brand.ttf");
    const kt = readFileSync(join(root, THEME), "utf8");
    expect(kt).toContain("Font(R.font.brand_2, FontWeight.W700),");
    expect(kt).toContain("Font(R.font.brand, FontWeight.W400),");
  });

  for (const [folder, word] of [["my-theme", "my-theme"], ["in", "in"]]) {
    test(`a themeDir that isn't a Kotlin package (${folder}) is refused with what to do`, async () => {
      const themeDir = `app/src/main/java/com/example/rafiq/${folder}/motif`;
      const root = composeApp({
        "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: "app", stack: "compose", themeDir }], ignore: [] }),
      });
      const r = await runTokens(root, ctx);
      expect(notes(r)).toContain(
        `design/motif.json: the themeDir for "app" (${themeDir}) can't be a Kotlin package, because "${word}" isn't a Kotlin name. ` +
          "Rename that folder (letters, digits and underscores, not starting with a digit, and not a Kotlin keyword) or choose another themeDir, then run motif tokens again.",
      );
      expect(existsSync(join(root, themeDir, "MotifTheme.kt"))).toBe(false);
      // As for any themeDir Motif can't use, the theme goes to the default folder.
      expect(statuses(r)[THEME]).toBe("created");
    });
  }
});
