import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { pngSize } from "../src/browser/png";
import { motifSimulators, runSwiftUIHarness, type SwiftUIShot } from "../src/stacks/swiftui/harness";
import { swiftUIApp } from "../src/stacks/swiftui/project";
import { FIXTURES, heavyStackTests, isMacWithXcode } from "./helpers";
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

const heavy = heavyStackTests("swiftui", isMacWithXcode());
if (!heavy.run) console.log(`[swiftui-render] Simulator tests skipped: ${heavy.reason}`);

describe("the SwiftUI screenshot harness (decision 0010)", () => {
  // Needs a Mac with Xcode and an iOS simulator runtime (bun's skipIf takes no reason, so the name says it). It picks the
  // newest iOS runtime installed and a phone it supports, creates a simulator, and deletes it at the end.
  test.skipIf(!heavy.run)("draws swiftui-min's root and previews in an iOS simulator, light, dark and right to left (skipped without Xcode)", async () => {
    // A space and an "&" in the path: the project, the scheme and the options are all named through it.
    const root = join(tempDir("motif-swiftui-render-"), "my app & co");
    cpSync(join(FIXTURES, "swiftui-min"), root, { recursive: true });
    const app = swiftUIApp(root)!;
    expect(app).toMatchObject({ kind: "xcodeproj", name: "SwiftUIMin" });
    const outDir = join(root, "shots");
    const phone = { width: 390, height: 844, scale: 3, insets: [47, 34] as [number, number], locale: "en", rtl: false };
    const shots: SwiftUIShot[] = [
      { ...phone, screen: "/", file: "home.mobile.png", dark: false },
      { ...phone, screen: "/", file: "home.mobile.dark.png", dark: true },
      { ...phone, screen: "SwiftUIMin/SettingsScreen.swift:20", file: "settings.mobile.rtl.png", dark: false, locale: "ar", rtl: true },
      { screen: "SwiftUIMin/HomeScreen.swift:26", file: "home-preview.tablet.png", width: 768, height: 1024, scale: 2, dark: false, locale: "en", rtl: false },
    ];
    const xcodeDerived = join(homedir(), "Library/Developer/Xcode/DerivedData");
    const derivedBefore = existsSync(xcodeDerived) ? readdirSync(xcodeDerived) : [];
    const run = await runSwiftUIHarness({ copyDir: root, app, appStruct: "SwiftUIMinApp", theme: false, variants: false, options: { outDir, shots }, timeoutMs: 1_500_000 });
    if (run.code !== 0 || !run.result) console.log(run.output.split(/\r?\n/).slice(-60).join("\n"));
    console.log(`[swiftui-render] ${run.simulator.runtime}, ${run.simulator.deviceType}: ${JSON.stringify(run.timings)}`);
    expect(run.code).toBe(0);
    const result = run.result as { shots: { file: string; error?: string }[]; previews: { id: string; name?: string }[] };
    expect(result.shots.map((s) => [s.file, s.error ?? null])).toEqual(shots.map((s) => [s.file, null]));
    // The #Preview blocks, found in the app's own code at run time, by file and line; the settings one has its name.
    expect(result.previews).toEqual([
      { id: "SwiftUIMin/ContentView.swift:27" },
      { id: "SwiftUIMin/HomeScreen.swift:26" },
      { id: "SwiftUIMin/SettingsScreen.swift:20", name: "Settings" },
    ]);

    const light = readFileSync(join(outDir, "home.mobile.png"));
    const dark = readFileSync(join(outDir, "home.mobile.dark.png"));
    const rtl = readFileSync(join(outDir, "settings.mobile.rtl.png"));
    const tablet = readFileSync(join(outDir, "home-preview.tablet.png"));
    for (const png of [light, dark, rtl]) expect(pngSize(png)).toEqual({ width: 1170, height: 2532 });
    expect(pngSize(tablet)).toEqual({ width: 1536, height: 2048 });
    expect(Buffer.compare(light, dark)).not.toBe(0);
    // Something is drawn: a blank window would pass the checks above.
    for (const png of [light, dark, rtl, tablet]) expect(colours(png)).toBeGreaterThan(1);

    // The simulator is gone, and the developer's fixture wasn't touched.
    const devices = Bun.spawnSync(["xcrun", "simctl", "list", "-j", "devices"], { stdout: "pipe" }).stdout.toString();
    expect(motifSimulators(devices)).not.toContain(run.udid);
    expect(readFileSync(join(FIXTURES, "swiftui-min/SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");
    expect(existsSync(join(FIXTURES, "swiftui-min/.motif-shots"))).toBe(false);
    // Every xcodebuild call names its DerivedData in the copy: none is left in Xcode's own folder for the copy.
    const derivedAfter = existsSync(xcodeDerived) ? readdirSync(xcodeDerived) : [];
    expect(derivedAfter.filter((d) => d.startsWith("SwiftUIMin-") && !derivedBefore.includes(d))).toEqual([]);
  }, 1_600_000);
});
