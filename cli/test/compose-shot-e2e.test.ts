import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { NATIVE_VIEWPORTS } from "../src/shot/capture";
import { CONFIG_FILE, HARNESS_SRC, INIT_SCRIPT, RESULT_FILE } from "../src/stacks/compose/harness";
import { shootCompose } from "../src/stacks/compose/shot";
import { FIXTURES, hasAndroid, heavyStackTests, hexColor, partnerTokens } from "./helpers";
import { decodePng, pixel } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// Needs a JDK and the Android SDK (bun's skipIf takes no reason, so each name says it). The tests share one copy of
// compose-min, in a folder with a space and an "&" in its name, whose activity uses Motif's generated theme and passes
// its own variant (Partner); Gradle reuses its build from one run to the next.
const heavy = heavyStackTests("compose", hasAndroid());
const android = heavy.run;
if (!heavy.run) console.log(`[compose-shot-e2e] Gradle and Robolectric tests skipped: ${heavy.reason}`);

let root = "";
let app = "";
const saved = { home: process.env.MOTIF_HOME, debug: process.env.MOTIF_DEBUG };
const MAIN = "app/src/main/java/dev/motif/composemin/MainActivity.kt";

beforeAll(async () => {
  if (!android) return;
  root = join(tempDir("motif-compose-shot-"), "my app & co");
  cpSync(join(FIXTURES, "compose-min"), root, {
    recursive: true,
    filter: (src) => ![".gradle", "build", ".kotlin", ".motif"].includes(basename(src)),
  });
  app = join(root, "app");
  // The partner variant changes the background too, so the whole screen shows which variant it is.
  const tokens = partnerTokens();
  tokens.color.background.$extensions["dev.motif"].variants = { partner: { value: hexColor("#FDE68A"), dark: hexColor("#3B0764") } };
  mkdirSync(join(root, "design"), { recursive: true });
  writeFileSync(join(root, "design", "tokens.json"), JSON.stringify(tokens, null, 2));
  // Google fonts are fetched once into this checkout's test cache (gitignored), so later runs are offline.
  process.env.MOTIF_HOME = join(import.meta.dir, ".tmp", "compose-home");
  const made = await runTokens(root, { positionals: [], flags: {} });
  if (made.exitCode !== 0) throw new Error(made.text);
  // The app wraps its screens in MotifTheme and asks for the partner variant itself, and has a route with a value.
  // LF, whatever the checkout wrote (a Windows checkout has CRLF).
  const main = readFileSync(join(root, MAIN), "utf8")
    .replace(/\r\n/g, "\n")
    .replace('        composable("settings") {', '        composable("detail/{id}") { entry -> Text("Detail ${entry.arguments?.getString("id")}") }\n        composable("settings") {')
    .replace("import dev.motif.composemin.ui.theme.ComposeMinTheme", "import dev.motif.composemin.ui.theme.ComposeMinTheme\nimport dev.motif.composemin.ui.motif.MotifTheme\nimport dev.motif.composemin.ui.motif.MotifVariant")
    .replace("            ComposeMinTheme {\n                App()\n            }", "            MotifTheme(variant = MotifVariant.Partner) {\n                App()\n            }");
  expect(main).toContain("MotifTheme(variant = MotifVariant.Partner)");
  writeFileSync(join(root, MAIN), main);
}, 120_000);

afterAll(() => {
  for (const [key, value] of [["MOTIF_HOME", saved.home], ["MOTIF_DEBUG", saved.debug]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  cleanupTempDirs();
});

/** How many pixels in a box differ from the box's top-left one (the background there): text drawn in it. */
function ink(png: Buffer, x0: number, x1: number, y0: number, y1: number): number {
  const { width, rgba } = decodePng(png);
  const at = (x: number, y: number) => rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 3).join(",");
  const background = at(x0, y0);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (at(x, y) !== background) n++;
  return n;
}

const shot = (flags: Record<string, string | boolean | string[]>) => runShot(root, { positionals: [], flags });
const png = (name: string) => readFileSync(join(root, "design", "shots", name));
const same = (a: string, b: string) => Buffer.compare(png(a), png(b)) === 0;
const routesOf = (data: Record<string, unknown>) => data.routes as { route: string; status: number; error?: string; pageErrors?: string[]; shots: string[] }[];
const RED = [255, 0, 0, 255];

const AUDIT_FILE = "app/src/main/java/dev/motif/composemin/ui/screens/AuditScreen.kt";

/**
 * What the audit is for: a caption in a pale grey, a line in a mid grey (under 4.5:1, too little for its size) with a large
 * bold one in the same grey (enough for large text), two 32 dp icon buttons with no contentDescription and a third, of
 * Material's own size, further down (three unnamed buttons, two of them alike but for where they are), a pulse that
 * loops with Animatable (Remove animations makes each step instant, so it flickers instead of stopping), and a form.
 */
const AUDIT_SCREEN = `package dev.motif.composemin.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.motif.composemin.ui.theme.ComposeMinTheme

@Composable
fun AuditScreen() {
    Scaffold { innerPadding ->
        Column(Modifier.padding(innerPadding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Your order", style = MaterialTheme.typography.headlineMedium)
            Text("Prices include tax", color = Color(0xFFAAAAAA))
            Text("Fresh today", color = Color(0xFF808080), fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text("Delivery in 2 days", color = Color(0xFF808080))
            Row {
                IconButton(onClick = {}, modifier = Modifier.size(32.dp).testTag("close")) {
                    Box(Modifier.size(16.dp).background(Color.Black))
                }
                IconButton(onClick = {}, modifier = Modifier.size(32.dp)) {
                    Box(Modifier.size(16.dp).background(Color.Black))
                }
            }
            Text("Share this order")
            IconButton(onClick = {}) {
                Box(Modifier.size(16.dp).background(Color.Black))
            }
        }
    }
}

@Composable
fun Pulse() {
    val x = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        while (true) {
            x.animateTo(100f, tween(800))
            x.animateTo(0f, tween(800))
        }
    }
    Box(Modifier.padding(24.dp).offset(x = x.value.dp).size(24.dp).background(Color(0xFF1D4ED8)))
}

@Composable
fun FormScreen() {
    var name by remember { mutableStateOf("") }
    Scaffold { innerPadding ->
        Column(Modifier.padding(innerPadding).padding(24.dp)) {
            TextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
        }
    }
}

@Preview
@Composable
fun AuditPreview() {
    ComposeMinTheme { AuditScreen() }
}

@Preview
@Composable
fun PulsePreview() {
    ComposeMinTheme { Pulse() }
}

@Preview
@Composable
fun FormPreview() {
    ComposeMinTheme { FormScreen() }
}
`;

const FILLED_STATE = `package dev.motif.states.filled

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.performTextInput

/** A name typed in. */
fun motifState(rule: ComposeContentTestRule) {
    rule.onNode(hasSetTextAction()).performTextInput("Ada Lovelace")
}
`;

const BROKEN_STATE = `package dev.motif.states.broken

import androidx.compose.ui.test.junit4.ComposeContentTestRule

fun motifState(rule: ComposeContentTestRule) {
    error("The sign-in service is down")
}
`;

/** Replaces a file of the copy for one test, and puts it back. */
async function withFiles(files: Record<string, string>, body: () => Promise<void>): Promise<void> {
  const before = Object.fromEntries(Object.keys(files).map((f) => [f, existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : null]));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  try {
    await body();
  } finally {
    for (const [f, text] of Object.entries(before)) {
      if (text === null) rmSync(join(root, f), { force: true });
      else writeFileSync(join(root, f), text);
    }
  }
}

describe("motif shot on compose-min, drawn by Robolectric", () => {
  test.skipIf(!android)("/ and /settings at 390 in light and dark, every variant and right to left; the app's own variant doesn't decide the default's look (skipped without a JDK and the Android SDK)", async () => {
    // MOTIF_DEBUG keeps result.json, with the texts each screen showed.
    process.env.MOTIF_DEBUG = "1";
    const r = await shot({ routes: "/,/settings,/detail/5", sizes: "390", variant: "all", rtl: true }).finally(() => delete process.env.MOTIF_DEBUG);
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.data.shots).toEqual(
      ["index", "settings", "detail-5"].flatMap((s) => [
        `design/shots/${s}.mobile.png`, `design/shots/${s}.mobile.rtl.png`, `design/shots/${s}+partner.mobile.png`, `design/shots/${s}+partner.mobile.rtl.png`,
        `design/shots/${s}.mobile.dark.png`, `design/shots/${s}.mobile.rtl.dark.png`, `design/shots/${s}+partner.mobile.dark.png`, `design/shots/${s}+partner.mobile.rtl.dark.png`,
      ]),
    );
    for (const name of (r.data.shots as string[]).map((s) => basename(s))) expect(pngSize(png(name))).toEqual({ width: 780, height: 1688 });
    expect(same("index.mobile.png", "index.mobile.dark.png")).toBe(false);
    // /settings was opened through the app's own NavController.
    expect(same("index.mobile.png", "settings.mobile.png")).toBe(false);
    // The app asks for Partner itself; the default's screenshots are still in the default's colours.
    expect(same("index.mobile.png", "index+partner.mobile.png")).toBe(false);
    expect(same("index.mobile.dark.png", "index+partner.mobile.dark.png")).toBe(false);
    expect(pixel(png("index+partner.mobile.png"), 20, 1600)).toEqual([0xfd, 0xe6, 0x8a, 255]);
    expect(pixel(png("index.mobile.png"), 20, 1600)).not.toEqual([0xfd, 0xe6, 0x8a, 255]);
    // A route with a value, matched against detail/{id}, landed with its value.
    const result = JSON.parse(readFileSync(join(app, RESULT_FILE), "utf8")) as { screens: { route: string; texts: string[] }[] };
    const texts = (route: string) => result.screens.find((s) => s.route === route)!.texts;
    expect(texts("/detail/5")).toContain("Detail 5");
    expect(same("index.mobile.png", "detail-5.mobile.png")).toBe(false);
    // Arabic strings (values-ar), laid out right to left: the title (the column is as wide as its widest line) has ink at the right of its row and none at the left.
    expect(texts("/")).toContain("أهلا بك");
    expect(texts("/")).toContain("Welcome home");
    expect(ink(png("index.mobile.rtl.png"), 380, 540, 140, 210)).toBeGreaterThan(200);
    expect(ink(png("index.mobile.rtl.png"), 48, 300, 140, 210)).toBe(0);
    expect(ink(png("index.mobile.png"), 48, 300, 140, 210)).toBeGreaterThan(200);
    const notes = JSON.stringify(r.data.notes ?? []);
    expect(notes).not.toContain("looks exactly like the default");
    expect(notes).not.toContain("doesn't offer");
    // Only the ignored .motif folder is left.
    for (const file of [HARNESS_SRC, INIT_SCRIPT, CONFIG_FILE]) expect(existsSync(join(app, file))).toBe(false);
    expect(readFileSync(join(app, ".motif/.gitignore"), "utf8")).toBe("*\n");
  }, 1_200_000);

  test.skipIf(!android)("a preview by --screen; --rtl he, which the app doesn't offer, is still right to left, with a note (skipped without a JDK and the Android SDK)", async () => {
    const r = await shot({ screen: "HomePreview", sizes: "390", rtl: "he", variant: "default" });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.data.shots).toEqual(["design/shots/home.mobile.png", "design/shots/home.mobile.rtl.png", "design/shots/home.mobile.dark.png", "design/shots/home.mobile.rtl.dark.png"]);
    expect(same("home.mobile.png", "home.mobile.rtl.png")).toBe(false);
    expect(r.data.notes).toContain("This app doesn't offer he (it has no res/values-he folder), so its RTL screenshots show its default strings, laid out right to left.");
    // What the harness wrote is gone, result.json too; only .motif/.gitignore stays.
    expect(existsSync(join(app, RESULT_FILE))).toBe(false);
    expect(readFileSync(join(app, ".motif/.gitignore"), "utf8")).toBe("*\n");
  }, 1_200_000);

  test.skipIf(!android)("each screen starts the Application again: Koin is stopped between screens; one that can't start twice gets its own note; a variant the theme lacks fails only its shots (skipped without a JDK and the Android SDK)", async () => {
    // Koin's GlobalContext, as the harness reaches it: an object with stopKoin().
    const koin = `package org.koin.core.context

object GlobalContext {
    var started = false
    fun stopKoin() {
        started = false
    }
}
`;
    const app = (check: string) => `package dev.motif.composemin

import android.app.Application
import org.koin.core.context.GlobalContext

class StartedApp : Application() {
    override fun onCreate() {
        super.onCreate()
${check}
    }

    companion object {
        var startedOnce = false
    }
}
`;
    const manifest = readFileSync(join(root, "app/src/main/AndroidManifest.xml"), "utf8").replace("<application", '<application\n        android:name=".StartedApp"');
    // The guide gains a variant the generated theme doesn't have yet (motif tokens not run again).
    const tokens = JSON.parse(readFileSync(join(root, "design/tokens.json"), "utf8"));
    tokens.$extensions["dev.motif"].variants.push({ id: "extra", label: "Extra" });
    const files = {
      "app/src/main/AndroidManifest.xml": manifest,
      "app/src/main/java/org/koin/core/context/GlobalContext.kt": koin,
      "design/tokens.json": JSON.stringify(tokens, null, 2),
    };
    const koinApp = '        check(!GlobalContext.started) { "A Koin Application has already been started" }\n        GlobalContext.started = true';
    await withFiles({ ...files, "app/src/main/java/dev/motif/composemin/StartedApp.kt": app(koinApp) }, async () => {
      const r = await shot({ routes: "/,/settings", sizes: "390", variant: "all" });
      const routes = routesOf(r.data);
      expect(routes.map((x) => [x.route, x.status, x.shots.length])).toEqual([["/", 200, 4], ["/settings", 200, 4]]);
      expect(routes[0]!.pageErrors).toEqual(["The theme code has no Extra variant (MotifVariant), so its screenshots weren't taken. Run motif tokens again, then motif shot."]);
      expect(r.data.shots).toContain("design/shots/settings+partner.mobile.dark.png");
      expect(JSON.stringify(r.data.notes ?? [])).not.toContain("Application class");
    });
    const twice = '        check(!startedOnce) { "Started twice" }\n        startedOnce = true';
    await withFiles({ ...files, "app/src/main/java/dev/motif/composemin/StartedApp.kt": app(twice) }, async () => {
      const r = await shot({ routes: "/,/settings", sizes: "390", variant: "default" });
      expect(routesOf(r.data).map((x) => [x.route, x.status])).toEqual([["/", 200], ["/settings", 200]]);
      expect(JSON.stringify(r.data.notes)).toContain(
        "The app's Application class started for the first screen, then failed when Robolectric started it again for the next one (IllegalStateException: Started twice)",
      );
    });
  }, 1_200_000);

  test.skipIf(!android)("design/states/Setup.kt seeds a signed-in flag, and / reaches the signed-in screen (skipped without a JDK and the Android SDK)", async () => {
    const gated = readFileSync(join(root, MAIN), "utf8")
      .replace("import androidx.activity.enableEdgeToEdge", "import androidx.activity.enableEdgeToEdge\nimport androidx.compose.foundation.background\nimport androidx.compose.foundation.layout.Box\nimport androidx.compose.foundation.layout.fillMaxSize\nimport androidx.compose.ui.graphics.Color")
      .replace("                App()\n", '                if (getSharedPreferences("session", MODE_PRIVATE).getBoolean("signed_in", false)) App() else SignIn()\n')
      .concat("\n@Composable\nfun SignIn() {\n    Box(Modifier.fillMaxSize().background(Color.Red))\n}\n\n@Preview\n@Composable\nfun SignInPreview() {\n    SignIn()\n}\n");
    const setup = `package dev.motif.states

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.util.Locale

/** Signed in, as someone who has used the app. */
fun motifSetup(variant: String, locale: Locale, dark: Boolean) {
    ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("session", Context.MODE_PRIVATE)
        .edit().putBoolean("signed_in", true).commit()
}
`;
    await withFiles({ [MAIN]: gated, "design/states/Setup.kt": setup }, async () => {
      const r = await shot({ routes: "/", screen: "SignInPreview", sizes: "390", variant: "default" });
      if (r.exitCode !== 0) console.log(r.text);
      expect(r.exitCode).toBe(0);
      expect(pixel(png("sign-in.mobile.png"), 390, 844)).toEqual(RED);
      expect(pixel(png("index.mobile.png"), 390, 844)).not.toEqual(RED);
    });
  }, 1_200_000);

  test.skipIf(!android)("an Application that can't start in a test and a screen that throws: previews are drawn, the throw is reported for its screen, and the run goes on (skipped without a JDK and the Android SDK)", async () => {
    const manifest = readFileSync(join(app, "src/main/AndroidManifest.xml"), "utf8").replace("<application", '<application\n        android:name=".BrokenApp"');
    const brokenApp = `package dev.motif.composemin

import android.app.Application

class BrokenApp : Application() {
    override fun onCreate() {
        super.onCreate()
        error("Firebase isn't configured")
    }
}
`;
    const main = readFileSync(join(root, MAIN), "utf8").replace(
      '        composable("settings") {',
      '        composable("crash") { error("No network in a test") }\n        composable("settings") {',
    );
    await withFiles({ "app/src/main/AndroidManifest.xml": manifest, "app/src/main/java/dev/motif/composemin/BrokenApp.kt": brokenApp, [MAIN]: main }, async () => {
      const r = await shot({ routes: "/,/crash", screen: "HomePreview", sizes: "390", variant: "default" });
      expect(r.exitCode).toBe(1);
      const routes = routesOf(r.data);
      expect(routes.map((x) => [x.route, x.status])).toEqual([["/", 200], ["/crash", 0], ["HomePreview", 200]]);
      expect(routes[1]!.error).toBe("/crash couldn't start in a test: IllegalStateException: No network in a test. Draw its screens from previews (--screen), or set it up in design/states/Setup.kt.");
      expect(existsSync(join(root, "design/shots/home.mobile.png"))).toBe(true);
      expect(JSON.stringify(r.data.notes)).toContain("The app's Application class couldn't start in a test (IllegalStateException: Firebase isn't configured)");
    });
  }, 1_200_000);

  test.skipIf(!android)("--audit finds the pale caption, the small icon buttons with no name, and the pulse that keeps moving with Remove animations on (skipped without a JDK and the Android SDK)", async () => {
    await withFiles({ [AUDIT_FILE]: AUDIT_SCREEN }, async () => {
      const r = await shot({ screen: "AuditPreview,PulsePreview", sizes: "390", variant: "default", audit: true });
      if (r.exitCode !== 1) console.log(r.text);
      expect(r.exitCode).toBe(1);
      expect(r.data.shots).toEqual(["design/shots/audit.mobile.png", "design/shots/audit.mobile.dark.png", "design/shots/pulse.mobile.png", "design/shots/pulse.mobile.dark.png"]);
      expect(routesOf(r.data).map((x) => [x.route, x.status, (x as { auditError?: string }).auditError ?? null])).toEqual([["AuditPreview", 200, null], ["PulsePreview", 200, null]]);
      const review = JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8"));
      type Place = { screen: string; selector: string; scheme?: string };
      const findings = review.findings as { category: string; severity: string; summary: string; location: Place; locations?: Place[]; shot: string }[];
      const of = (category: string) => findings.filter((f) => f.category === category);
      // The title, in the theme's own colours, is fine; so is the caption in dark mode (#aaaaaa on a dark surface), and
      // "Fresh today": ATF judges every Compose text at 3:1, and Motif asks 4.5:1 only of text below WCAG's large size.
      expect(JSON.stringify(findings)).not.toContain("Your order");
      expect(JSON.stringify(findings)).not.toContain("Fresh today");
      const [caption, grey, ...otherTexts] = of("contrast");
      expect(otherTexts).toEqual([]);
      expect(caption!.summary).toMatch(/^Text "Prices include tax" is hard to read in light mode \(2\.\d\d:1, needs 4\.5:1\)\.$/);
      expect(caption!.severity).toBe("critical");
      // Selectors start with the app's own composable around the node.
      expect(caption!.location).toMatchObject({ screen: "AuditPreview", selector: 'AuditScreen > Text("Prices include tax")', scheme: "light" });
      expect(grey!.summary).toMatch(/^Text "Delivery in 2 days" is hard to read in light mode \(3\.\d\d:1, needs 4\.5:1\)\.$/);
      expect(grey!.severity).toBe("major");
      // Two 32 dp icon buttons side by side: Compose widens a small target's touch area to 48 dp only where nothing else
      // is, so the first is 32 dp wide where people tap it, and the second, with room on its right, is 48 dp.
      expect(of("target-size").map((f) => [f.location.selector, f.summary])).toEqual([["AuditScreen > Button#close", "A button is 32×48 px on a phone; 44×44 px is easier to tap."]]);
      // The two untagged ones are told apart by their order on the screen, so neither is lost.
      expect(of("accessibility").map((f) => [f.location.selector, f.summary])).toEqual([
        ["AuditScreen > Button#close", "The button has no name a screen reader can say."],
        ["AuditScreen > Button[1]", "The button has no name a screen reader can say."],
        ["AuditScreen > Button[2]", "The button has no name a screen reader can say."],
      ]);
      const moving = of("reduced-motion");
      expect(moving.map((f) => [f.location.screen, f.location.selector, f.summary])).toEqual([
        ["PulsePreview", "PulsePreview > ComposeMinTheme > Pulse", 'The "Pulse" element keeps moving when the viewer asks for reduced motion.'],
      ]);
      expect(moving[0]!.shot).toBe("design/shots/pulse.mobile.png");
    });
  }, 1_200_000);

  test.skipIf(!android)("a card whose text is below the screen's edge isn't called unnamed: a screen reader scrolls to it and reads its text (Task 15; skipped without a JDK and the Android SDK)", async () => {
    // JetNews's "Popular on Jetnews" cards: only their pictures show at the bottom of the home screen, and ATF, which
    // reads what is on the screen, found no text for them.
    const below = `package dev.motif.composemin.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.motif.composemin.ui.theme.ComposeMinTheme

@Composable
fun BelowTheFold() {
    Column(Modifier.verticalScroll(rememberScrollState())) {
        Spacer(Modifier.height(640.dp))
        Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(400.dp))
            Text("Popular this week")
        }
    }
}

@Preview
@Composable
fun BelowTheFoldPreview() {
    ComposeMinTheme { BelowTheFold() }
}
`;
    await withFiles({ "app/src/main/java/dev/motif/composemin/ui/screens/BelowTheFold.kt": below }, async () => {
      const r = await shot({ screen: "BelowTheFoldPreview", sizes: "390", variant: "default", audit: true });
      expect(routesOf(r.data).map((x) => [x.route, x.status, (x as { auditError?: string }).auditError ?? null])).toEqual([["BelowTheFoldPreview", 200, null]]);
      const review = JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8"));
      expect(review.findings.map((f: { summary: string; location: { selector: string } }) => [f.location.selector, f.summary])).toEqual([]);
      expect(r.exitCode).toBe(0);
    });
  }, 1_200_000);

  test.skipIf(!android)("routes are audited as the app draws them: compose-min's only finding is the settings switch, which says nothing of what it switches (skipped without a JDK and the Android SDK)", async () => {
    const r = await shot({ routes: "/,/settings", sizes: "390", variant: "default", audit: true });
    expect(r.exitCode).toBe(1);
    expect(routesOf(r.data).map((x) => [x.route, x.status, x.shots.length, (x as { auditError?: string }).auditError ?? null])).toEqual([["/", 200, 2, null], ["/settings", 200, 2, null]]);
    const review = JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8"));
    expect(review.findings.map((f: { summary: string; location: { screen: string; selector: string } }) => [f.location.screen, f.location.selector, f.summary])).toEqual([
      ["/settings", "SettingsScreen > Switch", "The element has no name a screen reader can say."],
    ]);
  }, 1_200_000);

  test.skipIf(!android)("a check that fails keeps the others' findings, a missing internal is a note that says what to do, and without the slot-table tag previews are still drawn and routes open by deep link (skipped without a JDK and the Android SDK)", async () => {
    await withFiles({ [AUDIT_FILE]: AUDIT_SCREEN }, async () => {
      const got = await shootCompose(
        {
          root,
          app: { path: "app", stack: "compose", source: "detected" },
          routes: ["/", "/settings"],
          screens: ["AuditPreview"],
          outDir: join(root, "design", "shots"),
          viewports: [NATIVE_VIEWPORTS[1]!],
          variants: [],
          states: [],
          audit: true,
          timeoutMs: 1_100_000,
        },
        { faults: { contrast: "unreadable", names: "error" }, slotTables: false },
      );
      expect(got.routes.map((r) => [r.route, r.status, r.shots.length, r.auditError ?? null])).toEqual([
        ["/", 200, 2, "the names check: IllegalStateException: planted by Motif's test"],
        ["/settings", 200, 2, "the names check: IllegalStateException: planted by Motif's test"],
        ["AuditPreview", 200, 2, "the names check: IllegalStateException: planted by Motif's test"],
      ]);
      // /settings was opened by its deep link.
      expect(same("index.mobile.png", "settings.mobile.png")).toBe(false);
      // The tap-target check ran; contrast and names didn't. Without the slot tables, selectors have no composable.
      expect(got.issues.map((i) => [i.route, i.rule, i.selector])).toEqual([["AuditPreview", "target-mobile", "Button#close"]]);
      expect(got.notes).toContain(
        "Motif couldn't read an internal it needs (NoSuchFieldException: planted by Motif's test) from this version of Compose, so the contrast check wasn't run on AuditPreview. Tell Motif's maintainers which Compose version the app uses.",
      );
      expect(got.notes).toContain(
        "Motif couldn't find Layout Inspector's slot-table tag in this version of Compose, so routes were opened by deep link and moving composables weren't named. Tell Motif's maintainers which Compose version the app uses.",
      );
    });
  }, 1_200_000);

  test.skipIf(!android)("a state that types a name gives form@filled; a state that throws is reported, and the other screenshots are kept (skipped without a JDK and the Android SDK)", async () => {
    await withFiles({ [AUDIT_FILE]: AUDIT_SCREEN, "design/states/filled.kt": FILLED_STATE, "design/states/broken.kt": BROKEN_STATE }, async () => {
      const r = await shot({ screen: "FormPreview", sizes: "390", variant: "default", state: ["design/states/filled.kt", "design/states/broken.kt"] });
      // A state that throws is the screen's error, as on the web: exit 1, with every screenshot taken.
      expect(r.exitCode).toBe(1);
      expect(r.text).toContain('✗ the page threw an error: State "broken": IllegalStateException: The sign-in service is down');
      expect(r.data.shots).toEqual([
        "design/shots/form.mobile.png", "design/shots/form@filled.mobile.png", "design/shots/form@broken.mobile.png",
        "design/shots/form.mobile.dark.png", "design/shots/form@filled.mobile.dark.png", "design/shots/form@broken.mobile.dark.png",
      ]);
      expect(same("form.mobile.png", "form@filled.mobile.png")).toBe(false);
      expect(same("form.mobile.png", "form@broken.mobile.png")).toBe(true);
      expect(routesOf(r.data)[0]!.pageErrors).toEqual(['State "broken": IllegalStateException: The sign-in service is down']);
    });
  }, 1_200_000);

  test.skipIf(!android)("without the app's NavController, a route is opened by a deep link, and one that doesn't land is reported (skipped without a JDK and the Android SDK)", async () => {
    const got = await shootCompose(
      {
        root,
        app: { path: "app", stack: "compose", source: "detected" },
        routes: ["/", "/settings", "/nowhere"],
        screens: [],
        outDir: join(root, "design", "shots"),
        viewports: [NATIVE_VIEWPORTS[1]!],
        variants: [],
        states: [],
        audit: false,
        timeoutMs: 1_100_000,
      },
      { deepLinks: true },
    );
    expect(got.routes.map((r) => [r.route, r.status])).toEqual([["/", 200], ["/settings", 200], ["/nowhere", 0]]);
    expect(same("index.mobile.png", "settings.mobile.png")).toBe(false);
    expect(got.routes[2]!.error).toBe(
      "/nowhere couldn't be opened: Motif found no NavController in the app's composition, and a deep link to /nowhere showed the first screen instead. Draw it from a preview (--screen).",
    );
  }, 1_200_000);
});
