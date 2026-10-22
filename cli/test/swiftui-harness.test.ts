import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  addTestTarget,
  appBuildSettings,
  appSourceFor,
  crashReason,
  DERIVED_DATA,
  type Exec,
  type ExecResult,
  motifSimulators,
  pbxString,
  pickSimulator,
  RESULT_FILE,
  removeSimulator,
  runSwiftUIHarness,
  schemeFor,
  SIMCTL_TIMEOUT_MS,
  SOURCES_FOLDER,
  type SwiftUIAppBuild,
  type SwiftUIShot,
  TEST_SOURCE,
  TEST_TARGET,
  testConfiguration,
} from "../src/stacks/swiftui/harness";
import { field, idsIn, pbxObjects, swiftUIApp, unquote } from "../src/stacks/swiftui/project";
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
    expect(patched.pbx).toContain("name = MotifShots;\n\t\t\tpath = MotifShots;\n\t\t\tsourceTree = SOURCE_ROOT;");
    // The run's own folder, outside the copy: an absolute path.
    const outside = addTestTarget(PBXPROJ, "SwiftUIMin", FILES, BUILD, {}, "/tmp/motif run & co/MotifShots");
    expect(outside.pbx).toContain('path = "/tmp/motif run & co/MotifShots";\n\t\t\tsourceTree = "<absolute>";');
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


describe("the project file's helpers (project.ts)", () => {
  test("strings keep their escapes, objects know where they are", () => {
    expect(unquote('"My \\"Pro\\" App"')).toBe('My "Pro" App');
    expect(unquote('"C:\\\\Apps"')).toBe("C:\\Apps");
    expect(unquote("SwiftUIMin")).toBe("SwiftUIMin");
    const pbx = '{ objects = {\n\t\tT1 /* x */ = {isa = PBXNativeTarget; name = "My \\"Pro\\" App; v2"; productName = X; };\n\t}; }';
    const t = pbxObjects(pbx).get("T1")!;
    expect(pbx.slice(t.start, t.end + 1)).toBe(t.text);
    expect(unquote(field(t.own, "name")!)).toBe('My "Pro" App; v2');
    expect(unquote(field(t.own, "productName")!)).toBe("X");
    expect(idsIn("A1 /* Debug */, B2 /* Release, (old) */,")).toEqual(["A1", "B2"]);
  });

  test("a target whose name has an escaped quote is found and hosted", () => {
    const quoted = PBXPROJ.replace("name = SwiftUIMin;", 'name = "Swift \\"UI\\"";');
    const out = addTestTarget(quoted, 'Swift "UI"', FILES, BUILD);
    expect(out.appTarget).toBe("A10000000000000000000006");
    expect(out.pbx).toContain('remoteInfo = "Swift \\"UI\\"";');
  });
});

describe("the configuration the harness builds in", () => {
  test("the app's own scheme's test configuration, else Debug, else the target's default", () => {
    expect(testConfiguration(PBXPROJ, "SwiftUIMin")).toBe("Debug");
    // Configurations Dev and Prod, the target's default Prod: no Debug.
    const renamed = PBXPROJ.replace(/name = Debug;/g, "name = Dev;")
      .replace(/name = Release;/g, "name = Prod;")
      .replace(/defaultConfigurationName = Release;/g, "defaultConfigurationName = Prod;");
    expect(testConfiguration(renamed, "SwiftUIMin")).toBe("Prod");
    const scheme = `<Scheme><BuildAction><BuildableReference BlueprintIdentifier = "A10000000000000000000006" BlueprintName = "SwiftUIMin"/></BuildAction>
      <TestAction buildConfiguration = "Dev" selectedDebuggerIdentifier = ""></TestAction></Scheme>`;
    expect(testConfiguration(renamed, "SwiftUIMin", [scheme])).toBe("Dev");
    // Another target's scheme, or a configuration the project doesn't have, doesn't count.
    expect(testConfiguration(renamed, "SwiftUIMin", [scheme.replace("A10000000000000000000006", "B1")])).toBe("Prod");
    expect(testConfiguration(PBXPROJ, "SwiftUIMin", [scheme])).toBe("Debug");
    expect(() => testConfiguration(PBXPROJ, "Nope")).toThrow("no target named Nope");
  });
});

describe("the harness's scheme and its own Swift file", () => {
  test("the scheme builds the app and tests the harness, in the configuration given", () => {
    const patched = addTestTarget(PBXPROJ, "SwiftUIMin", FILES, BUILD);
    const scheme = schemeFor("Swift & UI.xcodeproj", patched, "SwiftUIMin", BUILD, "Staging");
    expect(scheme).toContain(`BlueprintIdentifier = "${patched.appTarget}"`);
    expect(scheme).toContain(`BlueprintIdentifier = "${patched.testTarget}"`);
    expect(scheme).toContain('BuildableName = "MotifShots.xctest"');
    expect(scheme).toContain('ReferencedContainer = "container:Swift &amp; UI.xcodeproj"');
    expect(scheme.match(/buildConfiguration = "Staging"/g)?.length).toBe(2);
    expect(scheme).not.toMatch(/__\w+__|"Debug"/);
  });

  test("names the app's module and App struct; a variant the theme lacks fails the shot", () => {
    const full = appSourceFor(BUILD);
    expect(full).toContain("@testable import SwiftUIMin\n");
    // A new App for each root view, its @State installed by the view that holds it (final review).
    expect(full).toContain("extension SwiftUIMinApp: DynamicProperty {}");
    // A new App for each root view, so each screenshot of / starts from a fresh model on every SDK (final review).
    expect(full).toContain("let made = SwiftUIMinApp()");
    expect(full).toContain("ImageRenderer(content: MotifAppKeeper(app: made))");
    expect(full).not.toContain("static let launched");
    expect(full).toContain("MotifMirror.windowContent(MotifAppState.app().body)");
    expect(full).toContain("SwiftUIMinApp keeps \\(list) in @State, which Motif couldn't keep for the root view");
    expect(full).toContain("guard let variant = MotifVariant(rawValue: id) else {");
    expect(full).toContain("has no variant \\(id). Run motif tokens again, then motif shot.");
    expect(full).toContain("MotifTheme.debugVariantOverride = variant");
    expect(full).toContain("AnyView(view.motifTheme())");
    expect(full).not.toMatch(/__\w+__|\r/);
    const plain = appSourceFor({ ...BUILD, variants: false, theme: false });
    expect(plain).not.toContain("MotifTheme.debugVariantOverride");
    expect(plain).toContain("has no variants, so \\(id) can't be drawn");
    expect(plain).not.toContain("motifTheme()");
    expect(TEST_SOURCE).not.toContain("\r");
  });

  test("a crash's reason is read from xcodebuild's output", () => {
    const out = [
      "Test Case '-[MotifShots.MotifShotTests testShots]' started.",
      "SwiftUICore/EnvironmentObject.swift:93: Fatal error: No ObservableObject of type Needed found. A View.environmentObject(_:) for Needed may be missing as an ancestor of this view.",
      "2026-10-20 18:28:07.97 SwiftUIMin[1:2] SwiftUICore/EnvironmentObject.swift:93: Fatal error: again",
    ].join("\n");
    expect(crashReason(out)).toBe(
      "Fatal error: No ObservableObject of type Needed found. A View.environmentObject(_:) for Needed may be missing as an ancestor of this view.",
    );
    expect(crashReason("** TEST SUCCEEDED **")).toBeNull();
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
  const LIST = JSON.stringify({
    runtimes: [
      runtime("18.5"),
      runtime("27.0", { isAvailable: false }),
      { identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-11-5", version: "11.5", platform: "watchOS", isAvailable: true },
      runtime("26.2"),
      runtime("18.6"),
    ],
    devicetypes: [type("iPhone 16"), type("iPhone 16 Pro"), type("iPhone 16 Pro Max"), type("iPhone 15 Pro"), type("iPad Pro 13-inch (M4)")],
  });

  test("the runtime of Xcode's own iOS SDK first, and its newest iPhone Pro", () => {
    expect(pickSimulator(LIST, "18.5\n")).toEqual({
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
      version: "18.5",
      deviceType: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
      matchesSdk: true,
    });
    expect(pickSimulator(LIST, "26.2")?.runtime).toBe("com.apple.CoreSimulator.SimRuntime.iOS-26-2");
  });

  test("without the SDK's runtime (or no SDK version), the newest available, which says it isn't the SDK's", () => {
    expect(pickSimulator(LIST, "27.0")).toMatchObject({ runtime: "com.apple.CoreSimulator.SimRuntime.iOS-26-2", matchesSdk: false });
    expect(pickSimulator(LIST)).toMatchObject({ version: "26.2", matchesSdk: false });
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

  test("the app's build settings come from xcodebuild's standard output, the app target's entry", () => {
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
  });
});

// ---- The run, with stand-ins for xcodebuild and simctl ----

const UDID = "6863BE3D-AAA8-4177-A1E6-AB1EC415FEF2";
const SETTINGS = JSON.stringify([
  { target: "SwiftUIMin", buildSettings: { PRODUCT_MODULE_NAME: "SwiftUIMin", FULL_PRODUCT_NAME: "SwiftUIMin.app", EXECUTABLE_NAME: "SwiftUIMin", IPHONEOS_DEPLOYMENT_TARGET: "17.0" } },
]);
const SIMS = JSON.stringify({
  runtimes: [{ identifier: "com.apple.CoreSimulator.SimRuntime.iOS-18-5", version: "18.5", platform: "iOS", isAvailable: true }],
  devicetypes: [{ identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro", name: "iPhone 16 Pro" }],
});
const ok = (stdout = ""): ExecResult => ({ code: 0, stdout, stderr: "", timedOut: false });
const failed = (code: number | null, stderr: string, stdout = ""): ExecResult => ({ code, stdout, stderr, timedOut: false });
const shot = (screen: string, file: string): SwiftUIShot => ({ screen, file, width: 390, height: 844, scale: 3, dark: false, locale: "en", rtl: false });
const writeResult = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));
/** A launch that draws every shot it's given. */
const drawsAll = (_: number, options: { shots: SwiftUIShot[] }, path: string) => {
  writeResult(path, { shots: options.shots.map((s) => ({ file: s.file, ms: 200 })), previews: [], notes: [], done: true });
  return ok("** TEST SUCCEEDED **");
};

/** A run of the harness on a copy of swiftui-min; `answer` overrides commands, and `launch` plays the test's part. */
async function fakeRun(
  shots: SwiftUIShot[],
  answer: (cmd: string[], opts: Parameters<Exec>[1]) => ExecResult | Promise<ExecResult> | undefined,
  launch: (n: number, options: { shots: SwiftUIShot[] }, resultPath: string) => ExecResult,
  remove: (udid: string) => { code: number; stderr: string } = () => ({ code: 0, stderr: "" }),
  extra: Partial<Parameters<typeof runSwiftUIHarness>[0]> = {},
) {
  const root = tempDir("motif-swiftui-run-");
  const copyDir = join(root, "app");
  cpSync(join(FIXTURES, "swiftui-min"), copyDir, { recursive: true });
  const workDir = join(root, "work");
  const calls: string[][] = [];
  const removed: string[] = [];
  let launches = 0;
  const exec: Exec = async (cmd, opts) => {
    calls.push(cmd);
    const answered = await answer(cmd, opts);
    if (answered) return answered;
    if (cmd[0] === "xcodebuild" && cmd[1] === "-showBuildSettings") return ok(SETTINGS);
    if (cmd.join(" ") === "xcrun --sdk iphonesimulator --show-sdk-version") return ok("18.5\n");
    if (cmd.slice(0, 3).join(" ") === "xcrun simctl list") return ok(SIMS);
    if (cmd.slice(0, 3).join(" ") === "xcrun simctl create") return ok(`${UDID}\n`);
    if (cmd[0] === "xcrun") return ok();
    if (cmd[0] === "xcodebuild" && cmd[1] === "build-for-testing") return ok("** TEST BUILD SUCCEEDED **");
    if (cmd[0] === "xcodebuild") {
      const optionsPath = opts.env!.TEST_RUNNER_MOTIF_SHOT_OPTIONS!;
      return launch(launches++, JSON.parse(readFileSync(optionsPath, "utf8")), join(dirname(optionsPath), RESULT_FILE));
    }
    throw new Error(`unexpected ${cmd.join(" ")}`);
  };
  const r = await runSwiftUIHarness({
    copyDir,
    workDir,
    app: swiftUIApp(copyDir)!,
    appStruct: "SwiftUIMinApp",
    theme: false,
    variants: false,
    options: { outDir: join(root, "shots"), shots },
    timeoutMs: 60_000,
    exec,
    remove: (udid) => {
      removed.push(udid);
      return remove(udid);
    },
    ...extra,
  });
  return { r, calls, removed, copyDir, workDir };
}

describe("runSwiftUIHarness (with stand-ins for xcodebuild and simctl)", () => {
  test("a run: the harness goes outside the copy, the simulator matches the SDK and is deleted", async () => {
    const { r, calls, removed, copyDir, workDir } = await fakeRun([shot("/", "home.png")], () => undefined, drawsAll);
    expect(r.problem).toBeUndefined();
    expect(r.result?.shots).toEqual([{ file: "home.png", ms: 200 }]);
    expect(r.simulator).toMatchObject({ version: "18.5", matchesSdk: true });
    expect(r.udid).toBe(UDID);
    expect(removed).toEqual([UDID]);
    expect(r.notes).toEqual([]);
    // The harness's sources are in the work folder, which the project names by its absolute path; nothing in the copy.
    expect(existsSync(join(workDir, SOURCES_FOLDER, "MotifShotTests.swift"))).toBe(true);
    expect(existsSync(join(copyDir, SOURCES_FOLDER))).toBe(false);
    expect(readFileSync(join(copyDir, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).toContain('sourceTree = "<absolute>";');
    // Built while the simulator boots, then tested without building again.
    expect(calls.filter((c) => c[0] === "xcodebuild").map((c) => c[1])).toEqual(["-showBuildSettings", "build-for-testing", "test-without-building"]);
    const test = calls.find((c) => c[1] === "test-without-building")!;
    expect(calls.find((c) => c[1] === "build-for-testing")!.slice(2)).toEqual(test.slice(2));
    expect(test).toContain("-collect-test-diagnostics");
    expect(test).toContain("ENABLE_TESTABILITY=YES");
    expect(test[test.indexOf("-configuration") + 1]).toBe("Debug");
    expect(test[test.indexOf("-derivedDataPath") + 1]).toBe(join(workDir, DERIVED_DATA));
    expect(calls.find((c) => c[1] === "-showBuildSettings")).toContain("-derivedDataPath");
    // Booted, and waited for.
    expect(calls.filter((c) => c[2] === "boot" || c[2] === "bootstatus").map((c) => c[2])).toEqual(["boot", "bootstatus"]);
  });

  test("a screen that stops the app fails with its reason, and the other screens are drawn in a new launch", async () => {
    const shots = [shot("/", "home.png"), shot("Crash.swift:12", "crash.png"), shot("Crash.swift:12", "crash.dark.png"), shot("SettingsScreen.swift:20", "settings.png")];
    const launched: string[][] = [];
    const { r, calls } = await fakeRun(shots, () => undefined, (n, options, path) => {
      launched.push(options.shots.map((s) => s.file));
      if (n > 0) return drawsAll(n, options, path);
      writeResult(path, {
        shots: [{ file: "home.png", ms: 200 }],
        previews: [{ id: "SwiftUIMin/Crash.swift:12" }],
        notes: [],
        current: { screen: "Crash.swift:12", file: "crash.png" },
        done: false,
      });
      return failed(65, "", "SwiftUICore/EnvironmentObject.swift:93: Fatal error: No ObservableObject of type Needed found.\n** TEST FAILED **");
    });
    expect(launched).toEqual([["home.png", "crash.png", "crash.dark.png", "settings.png"], ["settings.png"]]);
    expect(calls.filter((c) => c[0] === "xcodebuild" && c[1] !== "-showBuildSettings").map((c) => c[1])).toEqual(["build-for-testing", "test-without-building", "test-without-building"]);
    const error = "The preview Crash.swift:12 stopped the app: Fatal error: No ObservableObject of type Needed found.";
    expect(r.result?.shots).toEqual([
      { file: "home.png", ms: 200 },
      { file: "crash.png", error },
      { file: "crash.dark.png", error },
      { file: "settings.png", ms: 200 },
    ]);
    expect(r.result?.previews).toEqual([{ id: "SwiftUIMin/Crash.swift:12" }]);
    expect(r.result?.notes).toEqual([error]);
    expect(r.problem).toBeUndefined();
  });

  test("no result at all is a problem, never a quiet null: a skipped test, or an app that stops at once", async () => {
    const skipped = await fakeRun([shot("/", "home.png")], () => undefined, () =>
      ok("Test skipped: MOTIF_SHOT_OPTIONS isn't set: Motif runs this test itself.\n** TEST SUCCEEDED **"),
    );
    expect(skipped.r.result).toBeNull();
    expect(skipped.r.problem).toContain("ran without its options and drew nothing");
    const silent = await fakeRun([shot("/", "home.png")], () => undefined, () => failed(65, "", "Fatal error: boom\n** TEST FAILED **"));
    expect(silent.r.problem).toContain("wrote no result");
    expect(silent.r.problem).toContain("The app stopped before the first screenshot.");
    const early = await fakeRun([shot("/", "home.png")], () => undefined, (_, __, path) => {
      writeResult(path, { shots: [], previews: [], notes: [], done: false });
      return failed(65, "", "Fatal error: before anything");
    });
    expect(early.r.problem).toBe(
      "The app stopped before drawing its first screen: Fatal error: before anything. Check that it launches in the simulator, then run motif shot again.",
    );
  });

  test("a build that fails says so, with the compiler's errors", async () => {
    const out = [
      "/tmp/x/app/SwiftUI26/BrokenPreview.swift:9:7: error: type 'Session' does not conform to protocol 'ObservableObject'",
      "/tmp/x/app/SwiftUI26/BrokenPreview.swift:9:7: error: type 'Session' does not conform to protocol 'ObservableObject'",
      "Testing failed:",
      "\tTesting cancelled because the build failed.",
      "** TEST FAILED **",
    ].join("\n");
    const { r, calls } = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[1] === "build-for-testing" ? failed(65, "", out) : undefined), drawsAll);
    expect(calls.some((c) => c[1] === "test-without-building")).toBe(false);
    expect(r.result).toBeNull();
    expect(r.problem).toBe(
      "The app didn't build with Motif's harness:\n/tmp/x/app/SwiftUI26/BrokenPreview.swift:9:7: error: type 'Session' does not conform to protocol 'ObservableObject'\nCheck that the app builds for the iOS simulator in Xcode, then run motif shot again.",
    );
  });

  test("boot, settings and listing failures are refused in plain words, and the simulator is still deleted", async () => {
    const boot = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[2] === "boot" ? failed(149, "Unable to boot device in current state: Booted") : undefined), drawsAll);
    expect(boot.r.problem).toContain("couldn't start:\nUnable to boot device in current state: Booted\nFree some disk space");
    expect(boot.removed).toEqual([UDID]);
    expect(boot.calls.some((c) => c[1] === "test-without-building")).toBe(false);
    const status = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[2] === "bootstatus" ? failed(1, "timed out") : undefined), drawsAll);
    expect(status.r.problem).toContain("didn't finish booting");
    expect(status.removed).toEqual([UDID]);
    const settings = await fakeRun(
      [shot("/", "home.png")],
      (cmd) => (cmd[1] === "-showBuildSettings" ? failed(65, "xcodebuild: error: Scheme MotifShots is not currently configured") : undefined),
      drawsAll,
    );
    expect(settings.r.problem).toContain("couldn't read the SwiftUIMin target's build settings");
    expect(settings.r.problem).toContain("Check that the SwiftUIMin scheme builds for the iOS simulator in Xcode, then run motif shot again.");
    expect(settings.removed).toEqual([]);
    const list = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[2] === "list" ? failed(72, 'xcrun: error: unable to find utility "simctl"') : undefined), drawsAll);
    expect(list.r.problem).toContain("Motif couldn't list the iOS simulators");
    expect(list.r.problem).not.toContain("no iOS simulator runtime");
  });

  test("a simulator that can't be deleted is named, with the command that deletes it", async () => {
    const { r } = await fakeRun([shot("/", "home.png")], () => undefined, drawsAll, () => ({ code: 1, stderr: "Invalid device state" }));
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(new RegExp(`^The simulator motif-\\d+-\\w+ \\(${UDID}\\) couldn't be deleted: Invalid device state\\. Delete it with: xcrun simctl delete ${UDID}$`));
  });

  test("a command that uses up the time stops the run, which says where", async () => {
    const { r, removed } = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[2] === "bootstatus" ? { code: null, stdout: "", stderr: "", timedOut: true } : undefined), drawsAll);
    expect(r.timedOut).toBe(true);
    expect(r.problem).toContain("were stopped while waiting for the simulator to boot");
    expect(removed).toEqual([UDID]);
  });

  test("a runtime other than the SDK's is said", async () => {
    const { r } = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[1] === "--sdk" ? ok("27.0\n") : undefined), drawsAll);
    expect(r.notes[0]).toBe(
      "No iOS 27.0 simulator is installed, the version of Xcode's iOS SDK, so the screenshots were drawn on iOS 18.5. Install iOS 27.0 in Xcode › Settings › Components to draw them as your Xcode builds them.",
    );
  });
});

describe("fix round 2", () => {
  test("a screen that hangs until the time runs out keeps the shots before it, and the problem names it", async () => {
    const { r, removed } = await fakeRun([shot("/", "home.png"), shot("Hang.swift:5", "hang.png"), shot("SettingsScreen.swift:20", "settings.png")], () => undefined, (_, __, path) => {
      writeResult(path, { shots: [{ file: "home.png", ms: 200 }], previews: [], notes: [], current: { screen: "Hang.swift:5", file: "hang.png" }, done: false });
      return { code: null, stdout: "", stderr: "", timedOut: true };
    });
    expect(r.timedOut).toBe(true);
    expect(r.result?.shots).toEqual([{ file: "home.png", ms: 200 }]);
    expect(r.problem).toBe(
      "The screenshots took longer than 60 s and were stopped while drawing Hang.swift:5 (hang.png); the shots before it were kept. Check that screen for work that never ends, or run motif shot again with a longer time limit.",
    );
    expect(removed).toEqual([UDID]);
  });

  test("a work folder or DerivedData inside the copy is refused before anything runs", async () => {
    const root = tempDir("motif-swiftui-inside-");
    const copyDir = join(root, "app");
    cpSync(join(FIXTURES, "swiftui-min"), copyDir, { recursive: true });
    const calls: string[][] = [];
    const exec: Exec = async (cmd) => {
      calls.push(cmd);
      return ok();
    };
    const base = { copyDir, app: swiftUIApp(copyDir)!, appStruct: "SwiftUIMinApp", theme: false, variants: false, options: { outDir: join(root, "shots"), shots: [shot("/", "a.png")] }, timeoutMs: 60_000, exec };
    const work = await runSwiftUIHarness({ ...base, workDir: join(copyDir, ".motif-work") });
    expect(work.problem).toBe(
      `Motif's work folder (${join(copyDir, ".motif-work")}) is inside the copy of the app, where a synchronized folder could build it into the app. Put it outside the copy.`,
    );
    const derived = await runSwiftUIHarness({ ...base, workDir: join(root, "work"), derivedData: join(copyDir, "DerivedData") });
    expect(derived.problem).toContain(`Motif's DerivedData (${join(copyDir, "DerivedData")}) is inside the copy of the app`);
    expect(calls).toEqual([]);
    expect(readFileSync(join(copyDir, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");
  });

  test("removing the simulator is bounded: each simctl call has a time limit", () => {
    const seen: { cmd: string[]; timeout?: number }[] = [];
    const spawn = (cmd: string[], opts: { timeout?: number }) => {
      seen.push({ cmd, timeout: opts.timeout });
      return { exitCode: cmd[2] === "delete" ? 0 : 0, stderr: Buffer.from("") };
    };
    expect(removeSimulator(UDID, spawn)).toEqual({ code: 0, stderr: "" });
    expect(seen.map((s) => [s.cmd.slice(0, 3).join(" "), s.timeout])).toEqual([
      ["xcrun simctl shutdown", SIMCTL_TIMEOUT_MS],
      ["xcrun simctl delete", SIMCTL_TIMEOUT_MS],
    ]);
    expect(SIMCTL_TIMEOUT_MS).toBe(30_000);
    // A delete stopped at its limit has no exit code: it failed.
    expect(removeSimulator(UDID, (cmd) => ({ exitCode: cmd[2] === "delete" ? null : 0, stderr: Buffer.from("") })).code).not.toBe(0);
  });

  test("a project file's escapes are decoded: \\n, \\t, \\\\ and \\\" (and others kept as written)", () => {
    expect(unquote('"line one\\nline two"')).toBe("line one\nline two");
    expect(unquote('"a\\tb"')).toBe("a\tb");
    expect(unquote('"C:\\\\new"')).toBe("C:\\new");
    expect(unquote('"say \\"hi\\""')).toBe('say "hi"');
    expect(unquote('"odd \\q"')).toBe("odd \\q");
  });

  test("a crash's reason: an uncaught exception too", () => {
    const out = [
      "2026-10-21 03:00:00.000 SwiftUIMin[1:2] *** Terminating app due to uncaught exception 'NSInvalidArgumentException', reason: '-[NSNull length]: unrecognized selector sent to instance 0x1'",
      "*** First throw call stack:",
    ].join("\n");
    expect(crashReason(out)).toBe("Terminating app due to uncaught exception 'NSInvalidArgumentException', reason: '-[NSNull length]: unrecognized selector sent to instance 0x1'");
    // A Swift fatal error is still read first.
    expect(crashReason(`Fatal error: first\n${out}`)).toBe("Fatal error: first");
  });
});

describe("fix round 1 (Task 8): the build alongside the boot, and the states' compile errors", () => {
  test("a simulator that can't boot stops the build at once; when both fail, both are said", async () => {
    let stopped = false;
    // A build that runs until it's stopped.
    const waits = (opts: Parameters<Exec>[1]) =>
      new Promise<ExecResult>((done) => {
        opts.signal?.addEventListener("abort", () => {
          stopped = true;
          done({ code: null, stdout: "", stderr: "", timedOut: false });
        });
      });
    const boot = await fakeRun(
      [shot("/", "home.png")],
      (cmd, opts) => (cmd[2] === "boot" ? failed(149, "Unable to boot device") : cmd[1] === "build-for-testing" ? waits(opts) : undefined),
      drawsAll,
    );
    expect(stopped).toBe(true);
    expect(boot.r.problem).toContain("couldn't start:\nUnable to boot device\nFree some disk space");
    expect(boot.r.problem).not.toContain("didn't build");
    expect(boot.removed).toEqual([UDID]);

    const both = await fakeRun(
      [shot("/", "home.png")],
      (cmd) => (cmd[2] === "boot" ? failed(149, "Unable to boot device") : cmd[1] === "build-for-testing" ? failed(65, "", "/a/X.swift:1:1: error: nope\n** TEST BUILD FAILED **") : undefined),
      drawsAll,
    );
    expect(both.r.problem).toContain("The app didn't build with Motif's harness:\n/a/X.swift:1:1: error: nope");
    expect(both.r.problem).toContain("couldn't start:\nUnable to boot device");
  });

  test("a state or setup that doesn't compile is named, with the compiler's errors, not the app", async () => {
    const state = { name: "opened", file: "/p/my app/design/states/opened.swift", text: "@MainActor func motifState(_ app: MotifHarness) async throws { nope }\n" };
    const out = `/p/my app/design/states/opened.swift:1:63: error: cannot find 'nope' in scope\n** TEST BUILD FAILED **`;
    const { r } = await fakeRun([shot("/", "home.png")], (cmd) => (cmd[1] === "build-for-testing" ? failed(65, "", out) : undefined), drawsAll, undefined, {
      scripts: { states: [state] },
    });
    expect(r.problem).toBe(
      "/p/my app/design/states/opened.swift doesn't compile:\n/p/my app/design/states/opened.swift:1:63: error: cannot find 'nope' in scope\nFix it, then run motif shot again.",
    );
  });
});

describe("fix round 1 (Task 8): the warm-up never makes the run longer", () => {
  test("while the build runs, the booted simulator is warmed up with an app of its own, started and stopped", async () => {
    let built: () => void = () => {};
    const { calls } = await fakeRun(
      [shot("/", "home.png")],
      (cmd) => {
        // The build finishes once the warm-up has stopped its app.
        if (cmd[1] === "build-for-testing") return new Promise<ExecResult>((done) => (built = () => done(ok("** TEST BUILD SUCCEEDED **"))));
        if (cmd[2] === "terminate") setTimeout(() => built(), 10);
        return undefined;
      },
      drawsAll,
    );
    const simctl = calls.filter((c) => c[1] === "simctl").map((c) => [c[2], ...c.slice(4)].join(" "));
    const at = simctl.indexOf("bootstatus -b");
    expect(simctl.slice(at, at + 3)).toEqual(["bootstatus -b", "launch com.apple.Preferences", "terminate com.apple.Preferences"]);
  });

  test("a warm-up still running when the build is done is stopped; a build done before the boot means none", async () => {
    let stopped = false;
    let built: () => void = () => {};
    const { r } = await fakeRun(
      [shot("/", "home.png")],
      (cmd, opts) => {
        if (cmd[1] === "build-for-testing") return new Promise<ExecResult>((done) => (built = () => done(ok("** TEST BUILD SUCCEEDED **"))));
        if (cmd[2] !== "launch") return undefined;
        // The app the warm-up starts never answers; the build finishes meanwhile.
        setTimeout(() => built(), 10);
        return new Promise<ExecResult>((done) => {
          opts.signal?.addEventListener("abort", () => {
            stopped = true;
            done({ code: null, stdout: "", stderr: "", timedOut: false });
          });
        });
      },
      drawsAll,
    );
    expect(stopped).toBe(true);
    expect(r.problem).toBeUndefined();
    expect(r.result?.shots).toEqual([{ file: "home.png", ms: 200 }]);
    // The stand-ins' build is done at once, before the boot: no warm-up at all.
    const quick = await fakeRun([shot("/", "home.png")], () => undefined, drawsAll);
    expect(quick.calls.some((c) => c[2] === "launch")).toBe(false);
  });
});
