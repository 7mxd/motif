import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addTestTarget,
  appBuildSettings,
  appSourceFor,
  motifSimulators,
  pbxString,
  pickSimulator,
  schemeFor,
  TEST_SOURCE,
  TEST_TARGET,
  type SwiftUIAppBuild,
} from "../src/stacks/swiftui/harness";
import { swiftUIApp } from "../src/stacks/swiftui/project";
import { FIXTURES } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const PBXPROJ = readFileSync(join(FIXTURES, "swiftui-min/SwiftUIMin.xcodeproj/project.pbxproj"), "utf8");
const BUILD: SwiftUIAppBuild = { module: "SwiftUIMin", product: "SwiftUIMin.app", executable: "SwiftUIMin", appStruct: "SwiftUIMinApp", variants: true, theme: true };
const FILES = ["MotifShotTests.swift", "MotifPreviews.swift", "MotifShotApp.swift"];

/** The `ID = { … }` object with this id, as text (good enough for the objects this test looks at). */
function object(pbx: string, id: string): string {
  const at = pbx.search(new RegExp(`\\t${id}(?: /\\*[^*]*\\*/)? = \\{`));
  expect(at).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = pbx.indexOf("{", at); i < pbx.length; i++) {
    if (pbx[i] === "{") depth++;
    if (pbx[i] === "}" && --depth === 0) return pbx.slice(at, i + 1);
  }
  throw new Error(`no end for ${id}`);
}

describe("the harness's test target in the project file (decision 0010)", () => {
  const patched = addTestTarget(PBXPROJ, "SwiftUIMin", FILES, BUILD, { IPHONEOS_DEPLOYMENT_TARGET: "17.0" });

  test("adds a unit-test target hosted by the app, listed in the project, with the harness's files as its sources", () => {
    expect(patched.appTarget).toBe("A10000000000000000000006");
    const target = object(patched.pbx, patched.testTarget);
    expect(target).toContain("isa = PBXNativeTarget;");
    expect(target).toContain(`name = ${TEST_TARGET};`);
    expect(target).toContain('productType = "com.apple.product-type.bundle.unit-test";');
    // The project lists it after the app, and the main group shows its folder.
    expect(object(patched.pbx, "A10000000000000000000009")).toMatch(/targets = \(\s*A10000000000000000000006[^,]*,\s*4D4F54494600\w{12},\s*\);/);
    expect(object(patched.pbx, "A10000000000000000000004")).toMatch(/children = \([^)]*4D4F54494600\w{12},\s*\);/);
    // One build file per source, in the target's sources phase.
    const phases = target.match(/buildPhases = \(([^)]*)\)/)![1]!.match(/\w{24}/g)!;
    const sources = object(patched.pbx, phases[0]!);
    expect(sources).toContain("isa = PBXSourcesBuildPhase;");
    const files = sources.match(/files = \(([^)]*)\)/)![1]!.match(/\w{24}/g)!;
    expect(files.length).toBe(3);
    const paths = files.map((id) => {
      const ref = object(patched.pbx, id).match(/fileRef = (\w+)/)![1]!;
      return object(patched.pbx, ref).match(/path = ([^;]+);/)![1];
    });
    expect(paths).toEqual(FILES);
    expect(patched.pbx).toContain('path = ".motif-shots";\n\t\t\tsourceTree = SOURCE_ROOT;');
    // It depends on the app.
    const dependency = object(patched.pbx, target.match(/dependencies = \(\s*(\w+)/)![1]!);
    expect(dependency).toContain("target = A10000000000000000000006;");
  });

  test("its settings host it in the app, in the harness's own language mode, with the app's deployment target", () => {
    const list = object(patched.pbx, object(patched.pbx, patched.testTarget).match(/buildConfigurationList = (\w+)/)![1]!);
    const configs = list.match(/buildConfigurations = \(([^)]*)\)/)![1]!.match(/\w{24}/g)!.map((id) => object(patched.pbx, id));
    expect(configs.map((c) => c.match(/name = (\w+);\s*\}$/)?.[1])).toEqual(["Debug", "Release"]);
    for (const c of configs) {
      expect(c).toContain('TEST_HOST = "$(BUILT_PRODUCTS_DIR)/SwiftUIMin.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/SwiftUIMin";');
      expect(c).toContain('BUNDLE_LOADER = "$(TEST_HOST)";');
      expect(c).toContain("SWIFT_VERSION = 5.0;");
      expect(c).toContain("SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated;");
      expect(c).toContain("IPHONEOS_DEPLOYMENT_TARGET = 17.0;");
      expect(c).toContain("GENERATE_INFOPLIST_FILE = YES;");
    }
  });

  test("the ids are new, the file still balances, and Motif still finds the app target", () => {
    const ids = [...patched.pbx.matchAll(/\b(4D4F54494600\w{12})\b/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(3 * 2 + 9);
    for (const id of new Set(ids)) expect(PBXPROJ.includes(id!)).toBe(false);
    const opens = (patched.pbx.match(/[{(]/g) ?? []).length;
    const closes = (patched.pbx.match(/[})]/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(patched.pbx.trimEnd().endsWith("}")).toBe(true);
    const dir = tempDir("motif-swiftui-harness-");
    cpSync(join(FIXTURES, "swiftui-min"), dir, { recursive: true });
    writeFileSync(join(dir, "SwiftUIMin.xcodeproj/project.pbxproj"), patched.pbx);
    expect(swiftUIApp(dir)).toMatchObject({ kind: "xcodeproj", name: "SwiftUIMin", sourceRoot: "SwiftUIMin" });
  });

  test("refuses a project that has the harness already, and a target that isn't there", () => {
    expect(() => addTestTarget(patched.pbx, "SwiftUIMin", FILES, BUILD)).toThrow("already has a MotifShots target");
    expect(() => addTestTarget(PBXPROJ, "Nope", FILES, BUILD)).toThrow("no target named Nope");
  });

  test("quotes names with spaces, and reads a quoted target name", () => {
    expect(pbxString("SwiftUIMin.app")).toBe("SwiftUIMin.app");
    expect(pbxString("My App.app")).toBe('"My App.app"');
    expect(pbxString('a"b')).toBe('"a\\"b"');
    const spaced = PBXPROJ.replace("name = SwiftUIMin;", 'name = "My App";');
    const out = addTestTarget(spaced, "My App", FILES, { ...BUILD, product: "My App.app", executable: "My App" });
    expect(out.pbx).toContain('TEST_HOST = "$(BUILT_PRODUCTS_DIR)/My App.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/My App";');
    expect(out.pbx).toContain('remoteInfo = "My App";');
  });
});

describe("the harness's scheme and its own Swift file", () => {
  test("the scheme builds the app and tests the harness", () => {
    const patched = addTestTarget(PBXPROJ, "SwiftUIMin", FILES, BUILD);
    const scheme = schemeFor("Swift & UI.xcodeproj", patched, "SwiftUIMin", BUILD);
    expect(scheme).toContain(`BlueprintIdentifier = "${patched.appTarget}"`);
    expect(scheme).toContain(`BlueprintIdentifier = "${patched.testTarget}"`);
    expect(scheme).toContain('BuildableName = "MotifShots.xctest"');
    expect(scheme).toContain('ReferencedContainer = "container:Swift &amp; UI.xcodeproj"');
    expect(scheme).not.toMatch(/__\w+__/);
  });

  test("names the app's module and App struct, and the theme's variant and modifier only when the app has them", () => {
    const full = appSourceFor(BUILD);
    expect(full).toContain("@testable import SwiftUIMin\n");
    expect(full).toContain("MotifMirror.windowContent(SwiftUIMinApp().body)");
    expect(full).toContain("MotifTheme.debugVariantOverride = id.flatMap(MotifVariant.init(rawValue:))");
    expect(full).toContain("AnyView(view.motifTheme())");
    expect(full).not.toMatch(/__\w+__|\r/);
    const plain = appSourceFor({ ...BUILD, variants: false, theme: false });
    expect(plain).not.toContain("MotifTheme");
    expect(plain).not.toContain("motifTheme");
    expect(TEST_SOURCE).not.toContain("\r");
  });
});

describe("the simulator", () => {
  const runtime = (version: string, extra: Record<string, unknown> = {}) => ({
    identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replace(".", "-")}`,
    version,
    platform: "iOS",
    name: `iOS ${version}`,
    isAvailable: true,
    ...extra,
  });
  const type = (name: string) => ({ identifier: `com.apple.CoreSimulator.SimDeviceType.${name.replace(/ /g, "-")}`, name });

  test("the newest available iOS runtime and its newest iPhone Pro", () => {
    const list = JSON.stringify({
      runtimes: [
        runtime("18.5"),
        runtime("27.0", { isAvailable: false }),
        { identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-11-5", version: "11.5", platform: "watchOS", isAvailable: true },
        runtime("18.6"),
      ],
      devicetypes: [type("iPhone 16"), type("iPhone 16 Pro"), type("iPhone 16 Pro Max"), type("iPhone 15 Pro"), type("iPad Pro 13-inch (M4)")],
    });
    expect(pickSimulator(list)).toEqual({
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-6",
      version: "18.6",
      deviceType: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
    });
  });

  test("a runtime's own device types win, and any iPhone does without a Pro", () => {
    const list = JSON.stringify({
      runtimes: [runtime("26.0", { supportedDeviceTypes: [type("iPhone 17e"), type("iPad Air 11-inch (M4)")] })],
      devicetypes: [type("iPhone 17 Pro")],
    });
    expect(pickSimulator(list)?.deviceType).toBe("com.apple.CoreSimulator.SimDeviceType.iPhone-17e");
    expect(pickSimulator(JSON.stringify({ runtimes: [], devicetypes: [type("iPhone 17 Pro")] }))).toBeNull();
    expect(pickSimulator("not json")).toBeNull();
  });

  test("Motif's own simulators, left by a run that was killed, are found by name", () => {
    const list = JSON.stringify({
      devices: {
        "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [
          { name: "motif-123-abc", udid: "A" },
          { name: "iPhone 16 Pro", udid: "B" },
        ],
        "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [{ name: "motif-9-x", udid: "C" }],
      },
    });
    expect(motifSimulators(list)).toEqual(["A", "C"]);
    expect(motifSimulators("")).toEqual([]);
  });

  test("the app's build settings are read past what xcodebuild prints first", () => {
    const out = 'Command line invocation:\n    xcodebuild -showBuildSettings\n[\n  {"target": "SwiftUIMin", "buildSettings": {"PRODUCT_MODULE_NAME": "SwiftUIMin", "FULL_PRODUCT_NAME": "SwiftUIMin.app"}}\n]\n';
    expect(appBuildSettings(out)).toEqual({ PRODUCT_MODULE_NAME: "SwiftUIMin", FULL_PRODUCT_NAME: "SwiftUIMin.app" });
    expect(appBuildSettings("error")).toBeNull();
    // Through a scheme, xcodebuild lists every target it builds: the app's are the ones asked for.
    const two = JSON.stringify([
      { target: "Widgets", buildSettings: { PRODUCT_MODULE_NAME: "Widgets" } },
      { target: "SwiftUIMin", buildSettings: { PRODUCT_MODULE_NAME: "SwiftUIMin" } },
    ]);
    expect(appBuildSettings(two, "SwiftUIMin")).toEqual({ PRODUCT_MODULE_NAME: "SwiftUIMin" });
    expect(appBuildSettings(two, "Nope")).toBeNull();
    // xcodebuild's warnings on stderr come after the JSON, with brackets of their own.
    const warned = `[
  {
    "buildSettings" : {
      "PRODUCT_MODULE_NAME" : "SwiftUIMin"
    },
    "target" : "SwiftUIMin"
  }
]
--- xcodebuild: WARNING: Using the first of multiple matching destinations:
{ platform:macOS, arch:arm64, variant:Designed for [iPad,iPhone], name:My Mac }
`;
    expect(appBuildSettings(warned, "SwiftUIMin")).toEqual({ PRODUCT_MODULE_NAME: "SwiftUIMin" });
  });
});
