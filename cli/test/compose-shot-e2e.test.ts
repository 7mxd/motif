import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { NATIVE_VIEWPORTS } from "../src/shot/capture";
import { CONFIG_FILE, HARNESS_SRC, INIT_SCRIPT } from "../src/stacks/compose/harness";
import { shootCompose } from "../src/stacks/compose/shot";
import { FIXTURES, hasAndroid, hexColor, partnerTokens } from "./helpers";
import { pixel } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// Needs a JDK and the Android SDK (bun's skipIf takes no reason, so each name says it). The tests share one copy of
// compose-min, in a folder with a space and an "&" in its name, whose activity uses Motif's generated theme and passes
// its own variant (Partner); Gradle reuses its build from one run to the next.
const android = hasAndroid();
let root = "";
let app = "";
const saved = { home: process.env.MOTIF_HOME };
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
  // The app wraps its screens in MotifTheme and asks for the partner variant itself.
  const main = readFileSync(join(root, MAIN), "utf8")
    .replace("import dev.motif.composemin.ui.theme.ComposeMinTheme", "import dev.motif.composemin.ui.theme.ComposeMinTheme\nimport dev.motif.composemin.ui.motif.MotifTheme\nimport dev.motif.composemin.ui.motif.MotifVariant")
    .replace("            ComposeMinTheme {\n                App()\n            }", "            MotifTheme(variant = MotifVariant.Partner) {\n                App()\n            }");
  expect(main).toContain("MotifTheme(variant = MotifVariant.Partner)");
  writeFileSync(join(root, MAIN), main);
}, 120_000);

afterAll(() => {
  if (saved.home === undefined) delete process.env.MOTIF_HOME;
  else process.env.MOTIF_HOME = saved.home;
  cleanupTempDirs();
});

const shot = (flags: Record<string, string | boolean | string[]>) => runShot(root, { positionals: [], flags });
const png = (name: string) => readFileSync(join(root, "design", "shots", name));
const same = (a: string, b: string) => Buffer.compare(png(a), png(b)) === 0;
const routesOf = (data: Record<string, unknown>) => data.routes as { route: string; status: number; error?: string; pageErrors?: string[]; shots: string[] }[];
const RED = [255, 0, 0, 255];

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
    const r = await shot({ routes: "/,/settings", sizes: "390", variant: "all", rtl: true });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.data.shots).toEqual(
      ["index", "settings"].flatMap((s) => [
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
    // Arabic strings, laid out right to left.
    expect(same("index.mobile.png", "index.mobile.rtl.png")).toBe(false);
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
