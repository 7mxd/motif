import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { MAC_WINDOWS } from "../src/shot/capture";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { motifSimulators } from "../src/stacks/swiftui/harness";
import { shootSwiftUI, SWIFTUI_FIRST_RUN_MAC, swiftUICacheDir } from "../src/stacks/swiftui/shot";
import { FIXTURES, heavyStackTests, hexColor, isMacWithXcode, partnerTokens } from "./helpers";
import { AUDIT_SCREEN, auditFile, expectAudit, THROWS_STATE, TYPED_STATE } from "./swiftui-audit-screen";
import { decodePng } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// Needs a Mac with Xcode (bun's skipIf takes no reason, so each name says it). The tests share one copy of swiftui-mac
// (Xcode 16's macOS App template, with a NavigationSplitView sidebar), in a folder with a space and an "&" in its name:
// its home screen uses Motif's generated theme, shows a red square when signed in (which design/states/Setup.swift
// seeds), and greets the name typed into a field (which a --state does). The last test draws a multiplatform copy of
// it through its macOS destination. Motif's home is a folder of the test's own, so the first run is a first run.
const heavy = heavyStackTests("swiftui", isMacWithXcode());
if (!heavy.run) console.log(`[swiftui-mac-shot-e2e] macOS app tests skipped: ${heavy.reason}`);

let root = "";
let home = "";
/** The fixture app's own bundle id, and the one Motif's test host gets. */
const REAL_ID = "dev.motif.SwiftUIMac";
const HOST_ID = `${REAL_ID}.motif-shots`;
let madeSentinel = false;
const defaults = (...args: string[]) => {
  const r = Bun.spawnSync(["defaults", ...args], { stdout: "pipe", stderr: "pipe" });
  return { exitCode: r.exitCode, stdout: r.stdout.toString() };
};
const saved = process.env.MOTIF_HOME;
const HOME = "SwiftUIMac/Screens/HomeScreen.swift";
/**
 * A preview smaller than any window: a badge of a fixed width, as Landmarks's BadgesView is. Its own size must never
 * become the window's (2H Task 15 follow-up: Landmarks's badge preview was drawn as a 74×72 pt window, its title bar alone).
 */
const TINY = `import SwiftUI

struct TinyBadge: View {
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "star.fill")
            Text("Tiny")
        }
        .padding(8)
        .frame(width: 60)
    }
}

#Preview("Tiny") {
    TinyBadge()
}
`;

const SETUP = `import Foundation

func motifSetup(variant: String, locale: Locale, dark: Bool) {
    UserDefaults.standard.set(true, forKey: "signedIn")
}
`;

// The home screen is greeted; on the settings form, a row's label stands for its field and its switch.
const STATE = `@MainActor func motifState(_ app: MotifHarness) async throws {
    if app.exists("Greet") {
        try await app.type("Sam", into: "Name")
        try await app.tap("Greet")
        try await app.waitFor("Hello, Sam")
    } else if app.exists("Notifications") {
        try await app.type("Sam", into: "Name")
        try await app.tap("Notifications")
    }
}
`;

/** The home screen with the theme's background, the signed-in square, a field and a greeting. */
function homeScreen(text: string): string {
  const screen = text
    .replace(/\r\n/g, "\n")
    .replace(
      "struct HomeScreen: View {\n",
      'struct HomeScreen: View {\n    @Environment(\\.motifColors) private var colors\n    @AppStorage("signedIn") private var signedIn = false\n    @State private var name = ""\n    @State private var greeting = ""\n',
    )
    .replace(
      "            Spacer()\n",
      '            if signedIn {\n                Rectangle().fill(Color(red: 1, green: 0, blue: 0)).frame(width: 120, height: 120)\n            }\n            TextField("Name", text: $name)\n            Button("Greet") { greeting = "Hello, \\(name)" }\n            if !greeting.isEmpty { Text(greeting) }\n            Spacer()\n',
    )
    .replace("        .padding()\n", "        .padding()\n        .background(colors.background)\n");
  expect(screen).toContain(".background(colors.background)");
  return screen;
}

beforeAll(async () => {
  if (!heavy.run) return;
  root = join(tempDir("motif-swiftui-mac-shot-"), "my mac app & co");
  cpSync(join(FIXTURES, "swiftui-mac"), root, { recursive: true });
  // The partner variant changes the background, so the whole detail pane shows which variant it is.
  const tokens = partnerTokens();
  tokens.color.background.$extensions["dev.motif"].variants = { partner: { value: hexColor("#FDE68A"), dark: hexColor("#3B0764") } };
  mkdirSync(join(root, "design", "states"), { recursive: true });
  writeFileSync(join(root, "design", "tokens.json"), JSON.stringify(tokens, null, 2));
  writeFileSync(join(root, "design", "states", "Setup.swift"), SETUP);
  writeFileSync(join(root, "design", "states", "greeted.swift"), STATE);
  // The audit's planted problems (Task 10), drawn only where a test names the screen.
  writeFileSync(join(root, auditFile("SwiftUIMac")), AUDIT_SCREEN);
  writeFileSync(join(root, "SwiftUIMac/Screens/TinyScreen.swift"), TINY);
  // An App with a delegate adaptor, as production Mac apps have: its root must still be drawn (Task 15's final review).
  writeFileSync(join(root, "SwiftUIMac/MacDelegate.swift"), "import AppKit\n\nfinal class MacDelegate: NSObject, NSApplicationDelegate {}\n");
  const appFile = join(root, "SwiftUIMac/SwiftUIMacApp.swift");
  const app = readFileSync(appFile, "utf8")
    .replace(/\r\n/g, "\n")
    .replace("struct SwiftUIMacApp: App {\n", "struct SwiftUIMacApp: App {\n    @NSApplicationDelegateAdaptor(MacDelegate.self) private var delegate\n\n");
  expect(app).toContain("@NSApplicationDelegateAdaptor(MacDelegate.self) private var delegate");
  writeFileSync(appFile, app);
  writeFileSync(join(root, "design", "states", "typed.swift"), TYPED_STATE);
  writeFileSync(join(root, "design", "states", "throws.swift"), THROWS_STATE);
  home = tempDir("motif-swiftui-mac-home-");
  process.env.MOTIF_HOME = home;
  const made = await runTokens(root, { positionals: [], flags: {} });
  if (made.exitCode !== 0) throw new Error(made.text);
  expect(existsSync(join(root, "SwiftUIMac/Design/MotifTheme.swift"))).toBe(true);
  writeFileSync(join(root, HOME), homeScreen(readFileSync(join(root, HOME), "utf8")));
  // The developer's own app's defaults, which a run must never touch: made here when there are none (then removed).
  if (defaults("read", REAL_ID).exitCode !== 0) {
    defaults("write", REAL_ID, "motifSentinel", "-string", "kept");
    madeSentinel = true;
  }
}, 120_000);

afterAll(() => {
  if (madeSentinel) {
    defaults("delete", REAL_ID);
    rmSync(join(homedir(), "Library", "Preferences", `${REAL_ID}.plist`), { force: true });
  }
  // MOTIF_KEEP_SHOTS=<folder> keeps the screenshots, to look at them.
  if (root && process.env.MOTIF_KEEP_SHOTS) cpSync(join(root, "design", "shots"), process.env.MOTIF_KEEP_SHOTS, { recursive: true });
  if (saved === undefined) delete process.env.MOTIF_HOME;
  else process.env.MOTIF_HOME = saved;
  cleanupTempDirs();
});

const shot = (at: string, flags: Record<string, string | boolean | string[]>) => runShot(at, { positionals: [], flags });
const png = (name: string, at = root) => readFileSync(join(at, "design", "shots", name));
const routesOf = (data: Record<string, unknown>) => data.routes as { route: string; status: number; error?: string; pageErrors?: string[]; shots: string[] }[];

/** How many pixels in a box pass the test. */
function count(file: string, box: { x0: number; x1: number; y0: number; y1: number }, test: (rgb: number[]) => boolean): number {
  const { width, rgba } = decodePng(png(file));
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const at = (y * width + x) * 4;
      if (test([rgba[at]!, rgba[at + 1]!, rgba[at + 2]!])) n++;
    }
  }
  return n;
}
const red = ([r, g, b]: number[]) => r! > 240 && g! < 20 && b! < 20;
const near = (hex: string) => {
  const want = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return (rgb: number[]) => rgb.every((v, i) => Math.abs(v - want[i]!) <= 3);
};
/** Every screenshot in the shots folder is exactly its window's size at 2×: 2880×1800 (1440×900) or 1800×1400 (900×700). */
function expectWindowSized(): void {
  const files = readdirSync(join(root, "design", "shots")).filter((f) => f.endsWith(".png"));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const want = file.includes(".desktop-900.") ? { width: 1800, height: 1400 } : { width: 2880, height: 1800 };
    expect([file, pngSize(png(file))]).toEqual([file, want]);
  }
}
/** The colour at a point of a PNG, in pixels. */
function pixel(file: string, x: number, y: number): number[] {
  const { width, rgba } = decodePng(png(file));
  const at = (y * width + x) * 4;
  return [rgba[at]!, rgba[at + 1]!, rgba[at + 2]!];
}

/** How many pixels in rows y0..y1 differ (by more than a little) between two PNGs of one size. */
function difference(one: Buffer, other: Buffer, y0: number, y1: number): number {
  const a = decodePng(one);
  const b = decodePng(other);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < a.width; x++) {
      const at = (y * a.width + x) * 4;
      if ([0, 1, 2].some((k) => Math.abs(a.rgba[at + k]! - b.rgba[at + k]!) > 40)) n++;
    }
  }
  return n;
}

const XCODE_DERIVED = join(homedir(), "Library/Developer/Xcode/DerivedData");
const derivedFolders = () => (existsSync(XCODE_DERIVED) ? readdirSync(XCODE_DERIVED) : []);
const simulators = () => motifSimulators(Bun.spawnSync(["xcrun", "simctl", "list", "-j", "devices"], { stdout: "pipe" }).stdout.toString()).length;
/** Processes still running the app Motif built (the test's host): none once a run is over. */
const hosts = () => Bun.spawnSync(["pgrep", "-f", "SwiftUIMac.app/Contents/MacOS/SwiftUIMac"], { stdout: "pipe" }).stdout.toString().trim();
/** The host leaves no defaults domain behind, and the app's own defaults are as they were. */
function expectDefaultsUntouched(before: string): void {
  expect(defaults("read", HOST_ID).exitCode).not.toBe(0);
  expect(existsSync(join(homedir(), "Library", "Preferences", `${HOST_ID}.plist`))).toBe(false);
  expect(defaults("export", REAL_ID, "-").stdout).toBe(before);
}

/** The root right to left in Arabic, from the first run, which the second (in Hebrew) draws over. */
let arabicRoot: Buffer | null = null;

describe("motif shot on a macOS SwiftUI app, drawn on the Mac", () => {
  test.skipIf(!heavy.run)(
    "draws / and a preview in 1440×900 and 900×700 windows, light and dark, in each variant, right to left in Arabic, after the setup and with a state (skipped without Xcode)",
    async () => {
      const before = derivedFolders();
      const realDefaults = defaults("export", REAL_ID, "-").stdout;
      expect(realDefaults).toContain("<plist");
      const sims = simulators();
      const started = Date.now();
      const r = await shot(root, { routes: "/", screen: "Settings", variant: "all", rtl: "ar", state: "design/states/greeted.swift" });
      console.log(`[swiftui-mac-shot-e2e] first run: ${Math.round((Date.now() - started) / 1000)} s`);
      console.log(r.text);
      expect(r.exitCode).toBe(0);
      // 2 screens × 2 windows × 2 schemes × 2 variants × 2 directions × 2 (without and with the state).
      expect(r.text).toContain("✓ 64 screenshots of 2 screens (a 1440×900 and a 900×700 window, light and dark, right to left in ar, 2 design variants)");
      expect(r.text).toContain(SWIFTUI_FIRST_RUN_MAC);
      expect(r.text).not.toContain("doesn't offer ar");
      // Every shot came from the window server, glass and materials included.
      expect(r.text).not.toContain("without the window server");
      expect(r.text).not.toContain("couldn't turn on accessibility");
      const routes = routesOf(r.data);
      expect(routes.map((x) => [x.route, x.status, x.error ?? null, x.pageErrors ?? null])).toEqual([
        ["/", 200, null, null],
        ["Settings", 200, null, null],
      ]);

      // The windows at 2×: 1440×900 gives 2880×1800, 900×700 gives 1800×1400.
      for (const file of ["index.desktop.png", "index.desktop.dark.png", "settings.desktop.png"]) expect(pngSize(png(file))).toEqual({ width: 2880, height: 1800 });
      for (const file of ["index.desktop-900.png", "settings.desktop-900.dark.png"]) expect(pngSize(png(file))).toEqual({ width: 1800, height: 1400 });
      expectWindowSized();
      expect(Buffer.compare(png("index.desktop.png"), png("index.desktop.dark.png"))).not.toBe(0);
      expect(Buffer.compare(png("settings.desktop.png"), png("settings.desktop.dark.png"))).not.toBe(0);

      // --variant all: the detail pane's background is the partner's in its shots, and not in the default's.
      expect(near("#FDE68A")(pixel("index+partner.desktop.png", 2400, 1500))).toBe(true);
      expect(near("#FDE68A")(pixel("index.desktop.png", 2400, 1500))).toBe(false);
      expect(Buffer.compare(png("index.desktop.dark.png"), png("index+partner.desktop.dark.png"))).not.toBe(0);
      expect(r.text).not.toContain("looks exactly like the default");

      // The setup's signed-in square, at the detail pane's leading edge: past the sidebar on the left, and on the right
      // when the window is right to left (the sidebar then on the far right).
      const nearLeft = { x0: 400, x1: 1440, y0: 200, y1: 1700 };
      const nearRight = { x0: 1440, x1: 2480, y0: 200, y1: 1700 };
      expect(count("index.desktop.png", nearLeft, red)).toBeGreaterThan(30_000);
      expect(count("index.desktop.png", nearRight, red)).toBe(0);
      expect(count("index.desktop.rtl.png", nearRight, red)).toBeGreaterThan(30_000);
      expect(count("index.desktop.rtl.png", nearLeft, red)).toBe(0);
      arabicRoot = png("index.desktop.rtl.png");

      // The state typed, clicked and found the greeting (it would have failed otherwise): its screenshot differs.
      expect(Buffer.compare(png("index.desktop.png"), png("index@greeted.desktop.png"))).not.toBe(0);
      expect(Buffer.compare(png("settings.desktop.png"), png("settings@greeted.desktop.png"))).not.toBe(0);
      // On the settings form the state switched Notifications off. The switch, the only thing in an accent colour in the
      // form's top right (the guide's indigo, or the system blue where macOS doesn't tint switches), is grey after it.
      const toggle = { x0: 1440, x1: 2880, y0: 0, y1: 600 };
      const accent = ([r, , b]: number[]) => b! > 150 && r! < 120;
      const on = count("settings.desktop.png", toggle, accent);
      const off = count("settings@greeted.desktop.png", toggle, accent);
      console.log(`[swiftui-mac-shot-e2e] the settings switch's accent pixels: ${on} on, ${off} after the state`);
      expect(on).toBeGreaterThan(400);
      expect(off).toBeLessThan(on / 10);
      expect(existsSync(join(root, "design/shots/settings@greeted+partner.desktop-900.rtl.dark.png"))).toBe(true);

      // Nothing left behind but the build: no copy, no work folder, no simulator, no app still running, nothing in
      // Xcode's own DerivedData, and the developer's project untouched.
      const cache = swiftUICacheDir(home, root, "SwiftUIMac");
      expect(readdirSync(cache).sort()).toEqual(["DerivedData-macos", "last-used"]);
      expect(simulators()).toBe(sims);
      expect(hosts()).toBe("");
      expect(derivedFolders().filter((d) => d.startsWith("SwiftUIMac-") && !before.includes(d))).toEqual([]);
      expect(readFileSync(join(root, "SwiftUIMac.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");
      // The setup's signed-in flag went to the host's own domain, which is gone; the app's own defaults are untouched.
      expectDefaultsUntouched(realDefaults);
    },
    1_800_000,
  );

  test.skipIf(!heavy.run)("a second run reuses the build; right to left in a language the app lacks, its titles stay English (skipped without Xcode)", async () => {
    const started = Date.now();
    const r = await shot(root, { routes: "/", sizes: "1440", rtl: "he" });
    console.log(`[swiftui-mac-shot-e2e] second run: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("✓ 4 screenshots of 1 screen (a 1440×900 window, light and dark, right to left in he)");
    expect(r.text).not.toContain(SWIFTUI_FIRST_RUN_MAC);
    expect(r.text).toContain("This app doesn't offer he");
    // Arabic glyphs: the title rows right to left in Arabic differ from the same rows right to left in Hebrew, which
    // the app lacks, so they stay English.
    expect(arabicRoot).not.toBeNull();
    expect(difference(arabicRoot!, png("index.desktop.rtl.png"), 150, 500)).toBeGreaterThan(5_000);
    expect(readdirSync(swiftUICacheDir(home, root, "SwiftUIMac")).sort()).toEqual(["DerivedData-macos", "last-used"]);
    expect(hosts()).toBe("");
  }, 1_800_000);

  test.skipIf(!heavy.run)("a preview smaller than the window is drawn in the whole window, at both sizes (Task 15 follow-up; skipped without Xcode)", async () => {
    const r = await shot(root, { screen: "Tiny" });
    console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("✓ 4 screenshots of 1 screen (a 1440×900 and a 900×700 window, light and dark)");
    expect(r.text).not.toContain("without the window server");
    for (const file of ["tiny.desktop.png", "tiny.desktop.dark.png", "tiny.desktop-900.png", "tiny.desktop-900.dark.png"]) expect(existsSync(join(root, "design", "shots", file))).toBe(true);
    expectWindowSized();
    expect(hosts()).toBe("");
  }, 1_800_000);

  test.skipIf(!heavy.run)("--audit on the Mac: the planted problems, right to left too; no tap-target check (skipped without Xcode)", async () => {
    const started = Date.now();
    // The states' part (typing, throwing) is the simulator e2e's: the same harness code runs them on the Mac. Each shot
    // of the planted screen waits out the settle cap (5 s), as its pulse never stops, so this run keeps to 8 shots.
    const r = await shot(root, { routes: "/", screen: "Audit", sizes: "1440", rtl: "he", variant: "default", audit: true });
    console.log(`[swiftui-mac-shot-e2e] the audit: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    expect(r.exitCode).toBe(1);
    // 2 screens × 2 schemes × 2 directions.
    expect(r.text).toContain("✓ 8 screenshots of 2 screens (a 1440×900 window");
    expect(r.text).not.toContain("without the window server");
    expectAudit(root, r, "desktop", false);
    expect(hosts()).toBe("");
  }, 1_800_000);

  test.skipIf(!heavy.run)("a multiplatform app's macOS destination: --sizes 1440 draws it on the Mac, with no simulator (skipped without Xcode)", async () => {
    const multi = join(tempDir("motif-swiftui-multi-"), "multi app");
    cpSync(join(FIXTURES, "swiftui-mac"), multi, { recursive: true });
    const pbx = join(multi, "SwiftUIMac.xcodeproj/project.pbxproj");
    writeFileSync(
      pbx,
      readFileSync(pbx, "utf8")
        .replace(/\r\n/g, "\n")
        .replace(
          /(\t+)(INFOPLIST_FILE = [^;]+;)/g,
          '$1$2\n$1IPHONEOS_DEPLOYMENT_TARGET = 17.0;\n$1SDKROOT = auto;\n$1SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";\n$1SUPPORTS_MACCATALYST = YES;\n$1TARGETED_DEVICE_FAMILY = "1,2";',
        ),
    );
    const sims = simulators();
    const started = Date.now();
    const r = await shot(multi, { routes: "/", sizes: "1440" });
    console.log(`[swiftui-mac-shot-e2e] multiplatform, macOS: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("✓ 2 screenshots of 1 screen (a 1440×900 window, light and dark)");
    expect(r.text).toContain(SWIFTUI_FIRST_RUN_MAC);
    expect(r.text).not.toContain("without the window server");
    expect(pngSize(png("index.desktop.png", multi))).toEqual({ width: 2880, height: 1800 });
    expect(simulators()).toBe(sims);
    expect(hosts()).toBe("");
    // With Mac Catalyst on too, the destination is the Mac's own: the app was built for macOS, not for Catalyst.
    const products = join(swiftUICacheDir(home, multi, "SwiftUIMac"), "DerivedData-macos", "Build", "Products");
    const built = readdirSync(products).sort();
    expect(built.filter((f) => !f.endsWith(".xctestrun"))).toEqual(["Debug"]);
    expect(built.filter((f) => f.endsWith(".xctestrun")).every((f) => /_macosx[\d.]+-/.test(f))).toBe(true);
  }, 1_800_000);
});

// A preview that stops the app, and one that never finishes drawing: added for the tests below, after the others.
const PROBES = `import SwiftUI

struct BrokenScreen: View {
    var body: some View {
        if Date.distantPast < Date() { fatalError("Broken on purpose") }
        return Text("never")
    }
}

#Preview("Broken") {
    BrokenScreen()
}

struct HangScreen: View {
    var body: some View {
        while Date.distantPast < Date() {}
        return Text("never")
    }
}

#Preview("Hang") {
    HangScreen()
}
`;

/** The test host Motif built for the shared copy, still running: its path is inside Motif's own folder. */
const ownHosts = () => {
  // The app's own executable in Motif's build (xcodebuild, whose arguments name the build folder, doesn't match).
  // It runs from the folder's real path (a temporary folder's /var/folders/… is /private/var/folders/…).
  const cache = swiftUICacheDir(home, root, "SwiftUIMac");
  const executable = join(existsSync(cache) ? realpathSync(cache) : cache, "DerivedData-macos", "Build", "Products", "Debug", "SwiftUIMac.app", "Contents", "MacOS", "SwiftUIMac");
  return Bun.spawnSync(["pgrep", "-f", `^${executable}`], { stdout: "pipe" }).stdout.toString().trim();
};
/** The screen the harness is drawing now, from its result file in the run's work folder. */
const drawing = (): string => {
  try {
    const result = JSON.parse(readFileSync(join(swiftUICacheDir(home, root, "SwiftUIMac"), "work", "result.json"), "utf8")) as { current?: { screen: string } };
    return result.current?.screen ?? "";
  } catch {
    return "";
  }
};

describe("a macOS run that fails, is stopped, or draws with AppKit alone (Task 9, fix round 1)", () => {
  test.skipIf(!heavy.run)("a preview that stops the app fails alone; the others are drawn in a new launch (skipped without Xcode)", async () => {
    writeFileSync(join(root, "SwiftUIMac/Screens/Probes.swift"), PROBES);
    const realDefaults = defaults("export", REAL_ID, "-").stdout;
    const started = Date.now();
    const r = await shot(root, { screen: ["Broken", "Settings"], sizes: "900" });
    console.log(`[swiftui-mac-shot-e2e] a preview that stops the app: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    const routes = routesOf(r.data);
    const broken = routes.find((x) => x.route === "Broken")!;
    expect(broken.status).toBe(0);
    expect(broken.error).toMatch(/^The preview Probes\.swift:\d+ stopped the app: Fatal error: Broken on purpose/);
    const settings = routes.find((x) => x.route === "Settings")!;
    expect([settings.status, settings.shots.length]).toEqual([200, 2]);
    expect(pngSize(png("settings.desktop-900.png"))).toEqual({ width: 1800, height: 1400 });
    expect(ownHosts()).toBe("");
    expectDefaultsUntouched(realDefaults);
  }, 1_800_000);

  test.skipIf(!heavy.run)("a preview that never finishes uses up the time; the app Motif launched is stopped with it (skipped without Xcode)", async () => {
    const [app] = detectApps(root).apps;
    const outDir = join(root, "design", "shots");
    const started = Date.now();
    // The build is kept from the run before: the time goes to the launch and the hang.
    const run = shootSwiftUI({
      root, app: app!, routes: [], screens: ["Hang"], outDir, viewports: [MAC_WINDOWS[1]!], variants: [], states: [], audit: false, timeoutMs: 90_000,
    });
    await expect(run).rejects.toThrow(/The screenshots took longer than \d+ s and were stopped while drawing Probes\.swift:\d+/);
    console.log(`[swiftui-mac-shot-e2e] a preview that never finishes: ${Math.round((Date.now() - started) / 1000)} s`);
    expect(ownHosts()).toBe("");
    expect(defaults("read", HOST_ID).exitCode).not.toBe(0);
  }, 1_800_000);

  test.skipIf(!heavy.run)("Ctrl+C while a screen hangs: Motif exits, and the app it launched is stopped (skipped without Xcode)", async () => {
    const main = join(import.meta.dir, "../src/main.ts");
    const proc = Bun.spawn([process.execPath, main, "shot", "--screen", "Hang", "--sizes", "900", "--cwd", root], {
      env: { ...process.env, MOTIF_HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    });
    // Waits for the host to be up and drawing the preview that hangs, then sends Ctrl+C.
    const deadline = Date.now() + 600_000;
    while ((ownHosts() === "" || !/Probes\.swift/.test(drawing())) && Date.now() < deadline && proc.exitCode === null) await Bun.sleep(500);
    expect(ownHosts()).not.toBe("");
    expect(drawing()).toMatch(/Probes\.swift:\d+/);
    await Bun.sleep(1_000);
    expect(ownHosts()).not.toBe("");
    proc.kill("SIGINT");
    const code = await Promise.race([proc.exited, Bun.sleep(60_000).then(() => "still running")]);
    expect(code).toBe(130);
    for (let i = 0; i < 20 && ownHosts() !== ""; i++) await Bun.sleep(250);
    expect(ownHosts()).toBe("");
    expect(defaults("read", HOST_ID).exitCode).not.toBe(0);
  }, 1_800_000);

  test.skipIf(!heavy.run)("drawn with AppKit alone (MOTIF_SWIFTUI_APPKIT=1): opaque 2× windows, and one note that says so (skipped without Xcode)", async () => {
    const saved = process.env.MOTIF_SWIFTUI_APPKIT;
    process.env.MOTIF_SWIFTUI_APPKIT = "1";
    let r: Awaited<ReturnType<typeof shot>>;
    try {
      r = await shot(root, { routes: "/", sizes: "1440" });
    } finally {
      if (saved === undefined) delete process.env.MOTIF_SWIFTUI_APPKIT;
      else process.env.MOTIF_SWIFTUI_APPKIT = saved;
    }
    console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.text.split("without the window server").length - 1).toBe(1);
    expect(r.text).toContain("without the window server (Motif was told to draw with AppKit alone, MOTIF_SWIFTUI_APPKIT=1)");
    for (const file of ["index.desktop.png", "index.desktop.dark.png"]) {
      expect(pngSize(png(file))).toEqual({ width: 2880, height: 1800 });
      const { rgba } = decodePng(png(file));
      let seeThrough = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) seeThrough++;
      expect(seeThrough).toBe(0);
    }
    expect(ownHosts()).toBe("");
  }, 1_800_000);
});
