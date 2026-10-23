import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { motifSimulators } from "../src/stacks/swiftui/harness";
import { SWIFTUI_FIRST_RUN, swiftUICacheDir } from "../src/stacks/swiftui/shot";
import { FIXTURES, heavyStackTests, hexColor, isMacWithXcode, partnerTokens } from "./helpers";
import { AUDIT_SCREEN, auditFile, expectAudit, THROWS_STATE, TYPED_STATE } from "./swiftui-audit-screen";
import { decodePng } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// Needs a Mac with Xcode and an iOS simulator runtime (bun's skipIf takes no reason, so each name says it). The tests
// share one copy of swiftui-min, in a folder with a space and an "&" in its name: its home screen uses Motif's
// generated theme, which the App passes its own variant (partner) to, shows a red square when signed in (which
// design/states/Setup.swift seeds), and greets the name typed into a field (which a --state does). Motif's home is a
// folder of the test's own, so the first run is a first run, and the build it keeps is deleted afterwards.
const heavy = heavyStackTests("swiftui", isMacWithXcode());
if (!heavy.run) console.log(`[swiftui-shot-e2e] Simulator tests skipped: ${heavy.reason}`);

let root = "";
let home = "";
const saved = process.env.MOTIF_HOME;
const HOME = "SwiftUIMin/Screens/HomeScreen.swift";
const APP = "SwiftUIMin/SwiftUIMinApp.swift";
const CONTENT = "SwiftUIMin/ContentView.swift";

/**
 * A store the App gives its scene with .environment, which owns a SwiftData container of its own (NotesBadge stops the
 * app without the store), and a .modelContainer(for:) on the scene, which SwiftData keeps as a provider Motif can't give
 * the root: the run says so.
 */
const NOTES = String.raw`import SwiftData
import SwiftUI

@Model final class Note {
    var text: String
    init(text: String) { self.text = text }
}

@Observable final class Store {
    let container: ModelContainer
    var title = "Store ready"
    /// How many times a root view opened it: 1 in every screenshot, when each root starts from a fresh App.
    var opens = 0
    init() {
        container = try! ModelContainer(for: Note.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    }
}

/// The App's delegate, kept by @UIApplicationDelegateAdaptor: Motif's root must draw an App that has one.
final class AppDelegate: NSObject, UIApplicationDelegate {}

/// Kept by the App with @StateObject, which Motif's root installs with the App's other property wrappers.
final class Legacy: ObservableObject {
    @Published var ready = true
}

struct NotesBadge: View {
    @Environment(Store.self) private var store
    @Query private var notes: [Note]

    var body: some View {
        Text("\(store.title): \(notes.count) notes")
    }
}
`;

const SETUP = `import Foundation

func motifSetup(variant: String, locale: Locale, dark: Bool) {
    UserDefaults.standard.set(true, forKey: "signedIn")
}
`;

// Only the home screen has the field: on the others the state leaves the screen as it is.
const STATE = `@MainActor func motifState(_ app: MotifHarness) async throws {
    guard app.exists("Name") else { return }
    try await app.type("Sam", into: "Name")
    try await app.tap("Greet")
    try await app.waitFor("Hello, Sam")
    // The App's own @State store, which its root opened once: a fresh App, and store, for each root screenshot on every
    // SDK. A store shared by the launch's root views would say 2, 3… (2H Task 15 and its final review).
    try await app.waitFor("Store opened 1: 0 notes")
}
`;

beforeAll(async () => {
  if (!heavy.run) return;
  root = join(tempDir("motif-swiftui-shot-"), "my app & co");
  cpSync(join(FIXTURES, "swiftui-min"), root, { recursive: true });
  // The partner variant changes the background, so the whole screen shows which variant it is.
  const tokens = partnerTokens();
  tokens.color.background.$extensions["dev.motif"].variants = { partner: { value: hexColor("#FDE68A"), dark: hexColor("#3B0764") } };
  mkdirSync(join(root, "design", "states"), { recursive: true });
  writeFileSync(join(root, "design", "tokens.json"), JSON.stringify(tokens, null, 2));
  writeFileSync(join(root, "design", "states", "Setup.swift"), SETUP);
  writeFileSync(join(root, "design", "states", "greeted.swift"), STATE);
  // The audit's planted problems (Task 10), drawn only where a test names the screen.
  writeFileSync(join(root, auditFile("SwiftUIMin")), AUDIT_SCREEN);
  writeFileSync(join(root, "design", "states", "typed.swift"), TYPED_STATE);
  writeFileSync(join(root, "design", "states", "throws.swift"), THROWS_STATE);
  home = tempDir("motif-swiftui-home-");
  process.env.MOTIF_HOME = home;
  const made = await runTokens(root, { positionals: [], flags: {} });
  if (made.exitCode !== 0) throw new Error(made.text);
  expect(existsSync(join(root, "SwiftUIMin/Design/MotifTheme.swift"))).toBe(true);
  // LF, whatever the checkout wrote (a Windows checkout has CRLF).
  const screen = readFileSync(join(root, HOME), "utf8")
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
  writeFileSync(join(root, HOME), screen);
  const app = readFileSync(join(root, APP), "utf8")
    .replace(/\r\n/g, "\n")
    .replace("import SwiftUI\n", "import SwiftData\nimport SwiftUI\n")
    // The store as State(initialValue:), whose value is made once with the App (as every @State is on Xcode 16's SDK):
    // only a new App for each root view gives each screenshot a fresh one. A delegate adaptor, a @StateObject and the
    // scene phase are what production Apps hold too (Task 15's final review): the root must still be drawn.
    .replace(
      "struct SwiftUIMinApp: App {\n",
      "struct SwiftUIMinApp: App {\n    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate\n    @StateObject private var legacy = Legacy()\n    @Environment(\\.scenePhase) private var scenePhase\n    @State private var store: Store\n\n    init() {\n        _store = State(initialValue: Store())\n    }\n\n",
    )
    .replace(
      "            ContentView()\n        }\n",
      '            ContentView()\n                .motifTheme(variant: .partner)\n                .onAppear {\n                    store.opens += 1\n                    store.title = "Store opened \\(store.opens)"\n                }\n        }\n        .environment(store)\n        .modelContainer(for: Note.self, inMemory: true)\n',
    );
  expect(app).toContain(".motifTheme(variant: .partner)");
  expect(app).toContain('store.title = "Store opened \\(store.opens)"');
  expect(app).toContain("@UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate");
  expect(app).toContain("_store = State(initialValue: Store())");
  expect(app).toContain(".modelContainer(for: Note.self, inMemory: true)");
  writeFileSync(join(root, APP), app);
  writeFileSync(join(root, "SwiftUIMin/Notes.swift"), NOTES);
  const content = readFileSync(join(root, CONTENT), "utf8")
    .replace(/\r\n/g, "\n")
    .replace("        }\n    }\n}\n\n#Preview", "        }\n        .safeAreaInset(edge: .bottom) { NotesBadge() }\n    }\n}\n\n#Preview");
  expect(content).toContain("NotesBadge()");
  writeFileSync(join(root, CONTENT), content);
}, 120_000);

afterAll(() => {
  // MOTIF_KEEP_SHOTS=<folder> keeps the screenshots, to look at them.
  if (root && process.env.MOTIF_KEEP_SHOTS) cpSync(join(root, "design", "shots"), process.env.MOTIF_KEEP_SHOTS, { recursive: true });
  if (saved === undefined) delete process.env.MOTIF_HOME;
  else process.env.MOTIF_HOME = saved;
  cleanupTempDirs();
});

const shot = (flags: Record<string, string | boolean | string[]>) => runShot(root, { positionals: [], flags });
const png = (name: string) => readFileSync(join(root, "design", "shots", name));
const routesOf = (data: Record<string, unknown>) => data.routes as { route: string; status: number; error?: string; pageErrors?: string[]; shots: string[] }[];

/** How many pixels in a box are red (the signed-in square), and the box's colour at its middle. */
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
/** The colour well below the home screen's content (its background), at 3×. */
function background(file: string): number[] {
  const { width, rgba } = decodePng(png(file));
  const at = (2200 * width + 585) * 4;
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

/** The root right to left in Arabic, from the first run, which the second (in Hebrew) draws over. */
let arabicRoot: Buffer | null = null;

const XCODE_DERIVED = join(homedir(), "Library/Developer/Xcode/DerivedData");
const derivedFolders = () => (existsSync(XCODE_DERIVED) ? readdirSync(XCODE_DERIVED) : []);

describe("motif shot on a SwiftUI app, in a simulator Motif owns", () => {
  test.skipIf(!heavy.run)(
    "draws / and a preview at 390, light and dark, in each variant, right to left in Arabic, after the setup and with a state (skipped without Xcode)",
    async () => {
      const before = derivedFolders();
      const started = Date.now();
      const r = await shot({ routes: "/", screen: "Settings", sizes: "390", variant: "all", rtl: "ar", state: "design/states/greeted.swift" });
      console.log(`[swiftui-shot-e2e] first run: ${Math.round((Date.now() - started) / 1000)} s`);
      console.log(r.text);
      expect(r.exitCode).toBe(0);
      // 2 screens × 1 size × 2 schemes × 2 variants × 2 directions × 2 (without and with the state).
      expect(r.text).toContain("✓ 32 screenshots of 2 screens (390 px wide, light and dark, right to left in ar, 2 design variants)");
      expect(r.text).toContain(SWIFTUI_FIRST_RUN);
      // The app has Arabic strings, so there's no note that it doesn't offer them.
      expect(r.text).not.toContain("doesn't offer ar");
      const routes = routesOf(r.data);
      expect(routes.map((x) => [x.route, x.status, x.error ?? null, x.pageErrors ?? null])).toEqual([
        ["/", 200, null, null],
        ["Settings", 200, null, null],
      ]);

      // / and the preview at 390 (1170 × 2532 at 3×), light and dark.
      for (const file of ["index.mobile.png", "index.mobile.dark.png", "settings.mobile.png", "settings.mobile.dark.png"]) {
        expect(pngSize(png(file))).toEqual({ width: 1170, height: 2532 });
      }
      expect(Buffer.compare(png("index.mobile.png"), png("index.mobile.dark.png"))).not.toBe(0);
      expect(Buffer.compare(png("settings.mobile.png"), png("settings.mobile.dark.png"))).not.toBe(0);

      // --variant all: the partner's background is the partner's. The App passes .partner itself, yet the default's
      // screenshots are drawn in the default.
      expect(near("#FDE68A")(background("index+partner.mobile.png"))).toBe(true);
      expect(near("#FDE68A")(background("index.mobile.png"))).toBe(false);
      expect(Buffer.compare(png("index.mobile.dark.png"), png("index+partner.mobile.dark.png"))).not.toBe(0);
      expect(r.text).not.toContain("looks the same as the default");
      // The App's .environment(store) on its scene reached the root, though the store holds a ModelContainer: the state
      // found its title (the root would have stopped the app otherwise). The .modelContainer(for:) on the scene, which
      // SwiftData keeps as a provider, isn't given to the root, and the run says so; nothing else is left out.
      const unapplied = r.text.split("\n").filter((l) => l.includes("couldn't be given to the root view"));
      expect(unapplied).toHaveLength(1);
      expect(unapplied[0]).toMatch(/scene modifier \w*ModelContainer\w* couldn't/);
      // This runtime turns accessibility automation on: no state was told otherwise.
      expect(r.text).not.toContain("couldn't turn on accessibility automation");
      expect(r.text).toContain(`Motif keeps this app's build in ${join(swiftUICacheDir(home, root, "SwiftUIMin"), "DerivedData")} (`);

      // The setup's signed-in flag shows the red square: on the left, and on the right when the screen is right to left.
      const left = { x0: 0, x1: 585, y0: 300, y1: 2400 };
      const right = { x0: 585, x1: 1170, y0: 300, y1: 2400 };
      expect(count("index.mobile.png", left, red)).toBeGreaterThan(100_000);
      expect(count("index.mobile.png", right, red)).toBe(0);
      expect(count("index.mobile.rtl.png", right, red)).toBeGreaterThan(100_000);
      expect(count("index.mobile.rtl.png", left, red)).toBe(0);
      arabicRoot = png("index.mobile.rtl.png");

      // The state typed, tapped and found the greeting (it would have failed otherwise): its screenshot differs.
      expect(Buffer.compare(png("index.mobile.png"), png("index@greeted.mobile.png"))).not.toBe(0);
      expect(existsSync(join(root, "design/shots/settings@greeted+partner.mobile.rtl.dark.png"))).toBe(true);

      // Nothing left behind but the build: no copy, no work folder, no simulator, nothing in Xcode's own DerivedData.
      const cache = swiftUICacheDir(home, root, "SwiftUIMin");
      expect(readdirSync(cache).sort()).toEqual(["DerivedData", "last-used"]);
      const devices = Bun.spawnSync(["xcrun", "simctl", "list", "-j", "devices"], { stdout: "pipe" }).stdout.toString();
      expect(motifSimulators(devices).length).toBe(0);
      expect(derivedFolders().filter((d) => d.startsWith("SwiftUIMin-") && !before.includes(d))).toEqual([]);
      expect(readFileSync(join(root, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");
    },
    1_800_000,
  );

  test.skipIf(!heavy.run)("a second run reuses the build and audits what it draws: the planted problems, after a state that types and one that throws; right to left in a language the app lacks, its titles stay English (skipped without Xcode)", async () => {
    const started = Date.now();
    const r = await shot({
      routes: "/", screen: "Audit", sizes: "390", rtl: "he", variant: "default", audit: true, state: ["design/states/typed.swift", "design/states/throws.swift"],
    });
    console.log(`[swiftui-shot-e2e] second run, with the audit: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    // The audit found problems.
    expect(r.exitCode).toBe(1);
    // 2 screens × 2 schemes × 2 directions × 3 (without a state, typed, throws).
    expect(r.text).toContain("✓ 24 screenshots of 2 screens");
    expectAudit(root, r, "mobile", true);
    expect(r.text).not.toContain(SWIFTUI_FIRST_RUN);
    expect(r.text).toContain("This app doesn't offer he (its string catalogues and .lproj folders have no he strings)");
    // Arabic glyphs: the title rows (the large title and "Welcome") right to left in Arabic differ from the same rows
    // right to left in Hebrew, which the app lacks, so they stay English. Without the Arabic strings they'd be the same.
    expect(arabicRoot).not.toBeNull();
    expect(difference(arabicRoot!, png("index.mobile.rtl.png"), 350, 700)).toBeGreaterThan(5_000);
    expect(readdirSync(swiftUICacheDir(home, root, "SwiftUIMin")).sort()).toEqual(["DerivedData", "last-used"]);
  }, 1_800_000);

  test.skipIf(!heavy.run)("a setup that throws fails its shots; a state that never finishes is stopped after 15 s (skipped without Xcode)", async () => {
    writeFileSync(
      join(root, "design/states/Setup.swift"),
      `import Foundation

struct NoDarkToday: Error, CustomStringConvertible {
    var description: String { "no dark today" }
}

func motifSetup(variant: String, locale: Locale, dark: Bool) throws {
    UserDefaults.standard.set(true, forKey: "signedIn")
    if dark { throw NoDarkToday() }
}
`,
    );
    writeFileSync(
      join(root, "design/states/stuck.swift"),
      `@MainActor func motifState(_ app: MotifHarness) async throws {
    await app.wait(60)
    try await app.tap("Sign out")
}
`,
    );
    const started = Date.now();
    const r = await shot({ screen: "Settings", sizes: "390", state: "design/states/stuck.swift" });
    console.log(`[swiftui-shot-e2e] setup and stuck state: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    writeFileSync(join(root, "design/states/Setup.swift"), SETUP);
    // Light is drawn, the stuck state's shot as it was when stopped; dark fails in the setup.
    const [settings] = routesOf(r.data);
    expect(settings!.status).toBe(200);
    expect(settings!.shots.map((s) => s.split("/").pop())).toEqual(["settings.mobile.png", "settings@stuck.mobile.png"]);
    expect(settings!.pageErrors).toEqual(["design/states/Setup.swift failed: no dark today", 'State "stuck": it was still running after 15 seconds.']);
    // The line says the dark shots weren't drawn; the stuck state, the screen's second error, is in the notes.
    expect(r.text).toContain("Settings  ✗ 2 of its 4 screenshots weren't drawn: design/states/Setup.swift failed: no dark today");
    expect(r.text).toContain('Settings also had: State "stuck": it was still running after 15 seconds.');
  }, 1_800_000);

  test.skipIf(!heavy.run)("a state that doesn't compile is named, with its path and line (skipped without Xcode)", async () => {
    const broken = join(root, "design/states/broken.swift");
    writeFileSync(broken, `@MainActor func motifState(_ app: MotifHarness) async throws {\n    try await app.tap(42)\n}\n`);
    const r = await shot({ screen: "Settings", sizes: "390", state: "design/states/broken.swift" });
    console.log(r.text);
    expect(r.exitCode).not.toBe(0);
    expect(r.text).toContain(`${broken} doesn't compile:\n${broken}:2:`);
    expect(r.text).toContain("Fix it, then run motif shot again.");
  }, 1_800_000);
});
