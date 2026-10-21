import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { pngSize } from "../src/browser/png";
import { buildThemeSet } from "../src/generate/theme";
import { motifSimulators, runSwiftUIHarness, type SwiftUIHarnessResult, type SwiftUIShot } from "../src/stacks/swiftui/harness";
import { generateSwiftUI } from "../src/stacks/swiftui/generate";
import { swiftUIApp } from "../src/stacks/swiftui/project";
import { docFrom, FIXTURES, heavyStackTests, isMacWithXcode, partnerTokens } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

/** How many different colours an 8-bit PNG (grey, RGB, grey and alpha, or RGBA) has, counting up to max. */
function colours(png: Buffer, max = 2): number {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  const bpp = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[png[25]!]!;
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * bpp;
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  const seen = new Set<string>();
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? line[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[x] = (v + [0, a, b, (a + b) >> 1, paeth][filter]!) & 0xff;
    }
    for (let x = 0; x < stride; x += bpp) {
      seen.add(line.subarray(x, x + bpp).join(","));
      if (seen.size >= max) return seen.size;
    }
    prev.set(line);
  }
  return seen.size;
}

/** A preview the test adds to its copy: the generated theme's surface colour, which differs by variant. */
const PROBE = `import SwiftUI

struct ThemeProbe: View {
    @Environment(\\.motifColors) private var colors

    var body: some View {
        colors.surface
    }
}

#Preview("Probe") {
    ThemeProbe()
}
`;

const heavy = heavyStackTests("swiftui", isMacWithXcode());
if (!heavy.run) console.log(`[swiftui-render] Simulator tests skipped: ${heavy.reason}`);

const XCODE_DERIVED = join(homedir(), "Library/Developer/Xcode/DerivedData");
const derivedFolders = () => (existsSync(XCODE_DERIVED) ? readdirSync(XCODE_DERIVED) : []);
const phone = { width: 390, height: 844, scale: 3, insets: [47, 34] as [number, number], locale: "en", rtl: false };

/** What the run says about itself, for CI's log: the runtime (and whether it is the SDK's) and the timings. */
function logRun(name: string, run: SwiftUIHarnessResult) {
  const sim = run.simulator;
  console.log(`[swiftui-render] ${name}: ${sim?.runtime} (${sim?.matchesSdk ? "the SDK's" : "not the SDK's"}), ${sim?.deviceType}: ${JSON.stringify(run.timings)}`);
  for (const note of run.notes) console.log(`[swiftui-render] ${name}: ${note}`);
  if (run.problem || run.code !== 0) console.log(run.output.split(/\r?\n/).slice(-60).join("\n"));
}

/** Leaves no simulator and no DerivedData folder of Xcode's own behind. */
function expectNothingLeft(run: SwiftUIHarnessResult, before: string[], name: string) {
  const devices = Bun.spawnSync(["xcrun", "simctl", "list", "-j", "devices"], { stdout: "pipe" }).stdout.toString();
  expect(motifSimulators(devices)).not.toContain(run.udid!);
  expect(derivedFolders().filter((d) => d.startsWith(`${name}-`) && !before.includes(d))).toEqual([]);
}

describe("the SwiftUI screenshot harness (decision 0010)", () => {
  // Each needs a Mac with Xcode and an iOS simulator runtime (bun's skipIf takes no reason, so the name says it). They
  // pick the runtime of the selected Xcode's own iOS SDK (iOS 18.5 on CI's Xcode 16.4), create a simulator and delete it.
  test.skipIf(!heavy.run)("draws swiftui-min's root and previews, light, dark, right to left and in a variant (skipped without Xcode)", async () => {
    // A space and an "&" in the path: the project, the scheme and the options are all named through it.
    const root = join(tempDir("motif-swiftui-render-"), "my app & co");
    const copyDir = join(root, "app");
    cpSync(join(FIXTURES, "swiftui-min"), copyDir, { recursive: true });
    // Motif's generated theme with a partner variant, and a preview that shows its surface colour.
    const [theme] = generateSwiftUI(buildThemeSet(docFrom(partnerTokens())));
    mkdirSync(join(copyDir, "SwiftUIMin/Design"), { recursive: true });
    writeFileSync(join(copyDir, "SwiftUIMin/Design/MotifTheme.swift"), theme!.content);
    writeFileSync(join(copyDir, "SwiftUIMin/ThemeProbe.swift"), PROBE);
    const app = swiftUIApp(copyDir)!;
    expect(app).toMatchObject({ kind: "xcodeproj", name: "SwiftUIMin" });
    const outDir = join(root, "shots");
    const shots: SwiftUIShot[] = [
      { ...phone, screen: "/", file: "home.mobile.png", dark: false, variant: "default" },
      { ...phone, screen: "/", file: "home.mobile.dark.png", dark: true, variant: "default" },
      // A preview by its file and line alone, and by its id with the module.
      { ...phone, screen: "SettingsScreen.swift:20", file: "settings.mobile.rtl.png", dark: false, locale: "ar", rtl: true, variant: "default" },
      { screen: "SwiftUIMin/HomeScreen.swift:26", file: "home-preview.tablet.png", width: 768, height: 1024, scale: 2, dark: false, locale: "en", rtl: false, variant: "default" },
      { ...phone, screen: "ThemeProbe.swift:11", file: "probe.png", dark: false, variant: "default" },
      { ...phone, screen: "ThemeProbe.swift:11", file: "probe+partner.png", dark: false, variant: "partner" },
      { ...phone, screen: "ThemeProbe.swift:11", file: "probe+nope.png", dark: false, variant: "nope" },
    ];
    const before = derivedFolders();
    const run = await runSwiftUIHarness({
      copyDir, workDir: join(root, "work"), app, appStruct: "SwiftUIMinApp", theme: true, variants: true, options: { outDir, shots }, timeoutMs: 1_500_000,
    });
    logRun("swiftui-min", run);
    expect(run.problem).toBeUndefined();
    expect(run.code).toBe(0);
    const result = run.result!;
    const byFile = new Map(result.shots.map((s) => [s.file, s]));
    for (const s of shots.filter((s) => s.variant !== "nope")) expect([s.file, byFile.get(s.file)?.error ?? null]).toEqual([s.file, null]);
    // A variant the theme doesn't have fails its shot, rather than drawing the default.
    expect(byFile.get("probe+nope.png")?.error).toBe("The app's MotifTheme.swift has no variant nope. Run motif tokens again, then motif shot.");
    expect(existsSync(join(outDir, "probe+nope.png"))).toBe(false);
    expect(byFile.get("home.mobile.png")?.view).toBe("ContentView");
    // The #Preview blocks, found in the app's own code at run time, by file and line; the settings one has its name.
    expect(result.previews).toEqual([
      { id: "SwiftUIMin/ContentView.swift:27" },
      { id: "SwiftUIMin/HomeScreen.swift:26" },
      { id: "SwiftUIMin/SettingsScreen.swift:20", name: "Settings" },
      { id: "SwiftUIMin/ThemeProbe.swift:11", name: "Probe" },
    ]);

    const png = (file: string) => readFileSync(join(outDir, file));
    for (const file of ["home.mobile.png", "home.mobile.dark.png", "settings.mobile.rtl.png", "probe.png"]) expect(pngSize(png(file))).toEqual({ width: 1170, height: 2532 });
    expect(pngSize(png("home-preview.tablet.png"))).toEqual({ width: 1536, height: 2048 });
    expect(Buffer.compare(png("home.mobile.png"), png("home.mobile.dark.png"))).not.toBe(0);
    // The variant reaches the theme: the partner's surface isn't the default's.
    expect(Buffer.compare(png("probe.png"), png("probe+partner.png"))).not.toBe(0);
    // Something is drawn: a blank window would pass the checks above.
    for (const file of ["home.mobile.png", "home.mobile.dark.png", "settings.mobile.rtl.png", "home-preview.tablet.png"]) expect(colours(png(file))).toBeGreaterThan(1);

    expectNothingLeft(run, before, "SwiftUIMin");
    // The developer's fixture wasn't touched, and the copy holds no harness sources.
    expect(readFileSync(join(FIXTURES, "swiftui-min/SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");
    expect(existsSync(join(copyDir, "MotifShots"))).toBe(false);
  }, 1_600_000);

  test.skipIf(!heavy.run)(
    "draws Xcode 26's template (main actor by default, SwiftData, a titled WindowGroup); a preview that stops the app fails alone (skipped without Xcode)",
    async () => {
      const root = tempDir("motif-swiftui-render26-");
      const copyDir = join(root, "app");
      cpSync(join(FIXTURES, "swiftui-xcode26"), copyDir, { recursive: true });
      const app = swiftUIApp(copyDir)!;
      expect(app).toMatchObject({ kind: "xcodeproj", name: "SwiftUI26" });
      const outDir = join(root, "shots");
      const shots: SwiftUIShot[] = [
        { ...phone, screen: "/", file: "root.png", dark: false },
        { ...phone, screen: "BrokenPreview.swift:22", file: "broken.png", dark: false },
        { ...phone, screen: "BrokenPreview.swift:22", file: "broken.dark.png", dark: true },
        { ...phone, screen: "ContentView.swift:26", file: "previewable.png", dark: false },
      ];
      const before = derivedFolders();
      const run = await runSwiftUIHarness({
        copyDir, workDir: join(root, "work"), app, appStruct: "SwiftUI26App", theme: false, variants: false, options: { outDir, shots }, timeoutMs: 1_500_000,
      });
      logRun("swiftui-xcode26", run);
      expect(run.problem).toBeUndefined();
      const result = run.result!;
      const byFile = new Map(result.shots.map((s) => [s.file, s]));
      // The titled WindowGroup's content, not its title (a Text).
      expect(byFile.get("root.png")).toMatchObject({ view: expect.stringContaining("ContentView") });
      expect(byFile.get("root.png")?.error).toBeUndefined();
      expect(byFile.get("root.png")?.view).not.toMatch(/^Text/);
      expect(byFile.get("previewable.png")?.error).toBeUndefined();
      // The broken preview stops the app: its two shots fail with SwiftUI's reason, and the others are still drawn.
      for (const file of ["broken.png", "broken.dark.png"]) {
        expect(byFile.get(file)?.error).toStartWith("The preview BrokenPreview.swift:22 stopped the app: Fatal error: No ObservableObject of type Session found.");
        expect(existsSync(join(outDir, file))).toBe(false);
      }
      expect(result.previews.map((p) => p.name ?? p.id)).toEqual(["Broken", "Previewable"]);
      for (const file of ["root.png", "previewable.png"]) {
        expect(pngSize(readFileSync(join(outDir, file)))).toEqual({ width: 1170, height: 2532 });
        expect(colours(readFileSync(join(outDir, file)))).toBeGreaterThan(1);
      }
      expectNothingLeft(run, before, "SwiftUI26");
    },
    1_600_000,
  );
});
