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
  const app = readFileSync(join(root, APP), "utf8").replace(/\r\n/g, "\n").replace("            ContentView()\n", "            ContentView()\n                .motifTheme(variant: .partner)\n");
  expect(app).toContain(".motifTheme(variant: .partner)");
  writeFileSync(join(root, APP), app);
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
      expect(r.text).not.toContain("looks exactly like the default");

      // The setup's signed-in flag shows the red square: on the left, and on the right when the screen is right to left.
      const left = { x0: 0, x1: 585, y0: 300, y1: 2400 };
      const right = { x0: 585, x1: 1170, y0: 300, y1: 2400 };
      expect(count("index.mobile.png", left, red)).toBeGreaterThan(100_000);
      expect(count("index.mobile.png", right, red)).toBe(0);
      expect(count("index.mobile.rtl.png", right, red)).toBeGreaterThan(100_000);
      expect(count("index.mobile.rtl.png", left, red)).toBe(0);

      // The state typed, tapped and found the greeting (it would have failed otherwise): its screenshot differs.
      expect(Buffer.compare(png("index.mobile.png"), png("index@greeted.mobile.png"))).not.toBe(0);
      expect(existsSync(join(root, "design/shots/settings@greeted+partner.mobile.rtl.dark.png"))).toBe(true);

      // Nothing left behind but the build: no copy, no work folder, no simulator, nothing in Xcode's own DerivedData.
      const cache = swiftUICacheDir(home, root, "SwiftUIMin");
      expect(readdirSync(cache)).toEqual(["DerivedData"]);
      const devices = Bun.spawnSync(["xcrun", "simctl", "list", "-j", "devices"], { stdout: "pipe" }).stdout.toString();
      expect(motifSimulators(devices).length).toBe(0);
      expect(derivedFolders().filter((d) => d.startsWith("SwiftUIMin-") && !before.includes(d))).toEqual([]);
      expect(readFileSync(join(root, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");
    },
    1_800_000,
  );

  test.skipIf(!heavy.run)("a second run reuses the build and says nothing about a first run (skipped without Xcode)", async () => {
    const started = Date.now();
    const r = await shot({ screen: "Settings", sizes: "390" });
    console.log(`[swiftui-shot-e2e] second run: ${Math.round((Date.now() - started) / 1000)} s`);
    console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("✓ 2 screenshots of 1 screen");
    expect(r.text).not.toContain(SWIFTUI_FIRST_RUN);
    expect(readdirSync(swiftUICacheDir(home, root, "SwiftUIMin"))).toEqual(["DerivedData"]);
  }, 1_800_000);
});
