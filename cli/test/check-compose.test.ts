import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emit } from "../src/cli/output";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const SRC = "app/src/main/java/com/example/rafiq";
const THEME = `${SRC}/ui/motif/MotifTheme.kt`;
const GRADLE = [
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
  "}",
  "",
].join("\n");
const CATALOGUE = [
  "[versions]",
  'agp = "8.13.1"',
  "",
  "[libraries]",
  'androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version = "2025.08.00" }',
  'androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }',
  "",
  "[plugins]",
  'android-application = { id = "com.android.application", version = "8.13.1" }',
  'kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version = "2.2.20" }',
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
// Android Studio's Empty Activity template: Color.kt, Theme.kt and Type.kt in ui/theme.
const COLOR_KT = `package com.example.rafiq.ui.theme

import androidx.compose.ui.graphics.Color

val Purple80 = Color(0xFFD0BCFF)
val PurpleGrey80 = Color(0xFFCCC2DC)
val Pink80 = Color(0xFFEFB8C8)

val Purple40 = Color(0xFF6650a4)
val PurpleGrey40 = Color(0xFF625b71)
val Pink40 = Color(0xFF7D5260)
`;
const QUIET_COLOR_KT = "package com.example.rafiq.ui.theme\n";
const THEME_KT = `package com.example.rafiq.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = Purple80,
    secondary = PurpleGrey80,
    tertiary = Pink80,
)

@Composable
fun RafiqTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColorScheme, content = content)
}
`;
const TYPE_KT = `package com.example.rafiq.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp

val Typography = Typography(
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontSize = 16.sp,
    ),
)
`;
const HOME = `package com.example.rafiq

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun Home() {
    Surface(color = Color(0xFF3B82F6), modifier = Modifier.padding(13.dp)) {
        // motif-ok: partner brand
        Text("Hi", color = Color(0xFFFF00AA))
    }
}
`;
const FADE = `package com.example.rafiq

import androidx.compose.animation.animateFloatAsState
import androidx.compose.runtime.Composable

@Composable
fun Fade(on: Boolean) {
    val alpha = animateFloatAsState(if (on) 1f else 0f)
}
`;
const MOTION = "package com.example.rafiq\n\nfun fast() = MotifMotion.duration(MotifDurations.fast)\n";

/** A Compose app shaped like Android Studio's Empty Activity template, with its theme code written by motif tokens. */
async function composeApp(files: Record<string, string> = {}): Promise<string> {
  const root = makeProject({
    "settings.gradle.kts": 'rootProject.name = "Rafiq"\ninclude(":app")\n',
    "build.gradle.kts": "plugins {\n    alias(libs.plugins.android.application) apply false\n    alias(libs.plugins.kotlin.compose) apply false\n}\n",
    "gradle/libs.versions.toml": CATALOGUE,
    "app/build.gradle.kts": GRADLE,
    [`${SRC}/MainActivity.kt`]: MAIN,
    [`${SRC}/ui/theme/Color.kt`]: COLOR_KT,
    [`${SRC}/ui/theme/Theme.kt`]: THEME_KT,
    [`${SRC}/ui/theme/Type.kt`]: TYPE_KT,
    "design/tokens.json": TOKENS,
    ...files,
  });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}
const check = (root: string) => runCheck(root, { positionals: [] });
const where = (r: any) => (r.data.violations as any[]).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);
const only = (file: string) => (h: string) => h.includes(file);

describe("motif check on a Compose app", () => {
  test("a Compose app without a guide is sent to motif extract, which reads it (Task 15)", async () => {
    const root = makeProject({
      "settings.gradle.kts": 'rootProject.name = "Rafiq"\ninclude(":app")\n',
      "app/build.gradle.kts": GRADLE,
      [`${SRC}/MainActivity.kt`]: MAIN,
    });
    const r = await check(root);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Draft one from your code with motif extract");
  });

  test("reports typed colours and sizes with Kotlin fixes, and honours a reasoned motif-ok", async () => {
    const r = await check(await composeApp({ [`${SRC}/Home.kt`]: HOME, [`${SRC}/ui/theme/Color.kt`]: QUIET_COLOR_KT }));
    expect(r.exitCode).toBe(1);
    expect(where(r)).toEqual([`raw-color ${SRC}/Home.kt:13:21`, `off-scale ${SRC}/Home.kt:13:68`]);
    expect(r.text).toContain("Use MotifTheme.colors.<role>.");
    expect(r.text).toContain("Use MotifSpace.s<N>.");
    expect(r.text).not.toContain("var(--motif");
    expect(r.text).not.toContain("MotifColors.of(context)");
    expect((r.data.exceptions as any[]).map((e) => [e.rule, e.file, e.line, e.reason])).toEqual([["raw-color", `${SRC}/Home.kt`, 15, "partner brand"]]);
    expect(r.text).toContain(`${SRC}/Home.kt:15  raw-color  Color(0xFFFF00AA) — motif-ok: partner brand`);
  });

  test("--json lists each hit with its file, line and column", async () => {
    const r = await check(await composeApp({ [`${SRC}/Home.kt`]: HOME, [`${SRC}/ui/theme/Color.kt`]: QUIET_COLOR_KT }));
    let out = "";
    emit(r, true, (s) => void (out += s));
    const hits = JSON.parse(out).violations as any[];
    expect(hits.map((h) => `${h.file}:${h.line}:${h.column}`)).toEqual([`${SRC}/Home.kt:13:21`, `${SRC}/Home.kt:13:68`]);
    expect(hits[0]).toMatchObject({ rule: "raw-color", kind: "color", value: "#3b82f6", context: "background", fix: "Use MotifTheme.colors.<role>." });
    expect(hits[1]).toMatchObject({ rule: "off-scale", kind: "space", value: "13px", fix: "Use MotifSpace.s<N>." });
  });

  test("the generated theme file is never scanned; edited by hand, it is a warning", async () => {
    const root = await composeApp({ [`${SRC}/ui/theme/Color.kt`]: QUIET_COLOR_KT });
    const clean = await check(root);
    expect(clean.exitCode).toBe(0);
    expect(clean.data.violations).toEqual([]);
    expect(clean.data.warnings).toEqual([]);

    const theme = join(root, THEME);
    writeFileSync(theme, readFileSync(theme, "utf8").replace("Color(0x", "Color(0x1"));
    const edited = await check(root);
    expect(edited.data.violations).toEqual([]);
    expect((edited.data.warnings as any[]).map((w) => [w.rule, w.file])).toEqual([["generated-edited", THEME]]);
    expect(edited.text).toContain("Warnings:");
  });

  test("the template's Color.kt is the app's palette: reported, with the palette hint", async () => {
    const r = await check(await composeApp());
    expect(r.exitCode).toBe(1);
    expect(where(r).filter(only("Color.kt"))).toHaveLength(6);
    expect(where(r).filter((w) => !only("Color.kt")(w))).toEqual([]);
    expect(r.data.palettes).toEqual([`${SRC}/ui/theme/Color.kt`]);
    expect(r.text).toMatch(/palette/i);
  });

  test("reduced motion: reported when the app animates without MotifMotion, gone once it uses it", async () => {
    const quiet = { [`${SRC}/ui/theme/Color.kt`]: QUIET_COLOR_KT };
    const bare = await check(await composeApp({ ...quiet, [`${SRC}/Fade.kt`]: FADE }));
    expect(where(bare)).toEqual([`reduced-motion ${SRC}/Fade.kt:8:17`]);
    expect(bare.text).toContain('Animations here ignore the "Remove animations" setting.');
    expect(bare.text).toContain("Use MotifMotion.duration(…) for durations");

    const motif = await check(await composeApp({ ...quiet, [`${SRC}/Fade.kt`]: FADE, [`${SRC}/Motion.kt`]: MOTION }));
    expect(motif.data.violations).toEqual([]);
    expect(motif.exitCode).toBe(0);
  });

  test("many problems are grouped with the closest generated member, in Kotlin", async () => {
    const lines = Array.from({ length: 26 }, (_, i) => `val c${i} = Color(0xFF4B5563)`);
    const quiet = { [`${SRC}/ui/theme/Color.kt`]: QUIET_COLOR_KT };
    const r = await check(await composeApp({ ...quiet, [`${SRC}/Many.kt`]: [...lines, "fun p() = Modifier.padding(13.dp)", "val o = Color(0xFFFF00AA)", ""].join("\n") }));
    expect(r.text).toContain("26× Color(0xFF4B5563)");
    expect(r.text).toContain("Closest: MotifTheme.colors.textSecondary.");
    expect(r.text).toContain("Closest: MotifSpace.s3 (12px).");
  });
});
