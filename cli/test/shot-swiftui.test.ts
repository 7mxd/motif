import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { DoctorDeps } from "../src/commands/doctor";
import { runShot, type ShotDeps } from "../src/commands/shot";
import { detectApps } from "../src/detect/stacks";
import { toFindings } from "../src/shot/audit";
import { describeSizes, NATIVE_DESKTOP, NATIVE_VIEWPORTS, type RouteResult } from "../src/shot/capture";
import type { NativeShotOptions } from "../src/stacks/native";
import { SWIFTUI } from "../src/stacks/swiftui";
import { swiftUIDoctor } from "../src/stacks/swiftui/doctor";
import { hooksSource, MAC_HOST_SUFFIX, RESULT_FILE, scriptSource, SOURCES_FOLDER, stopMacHost, withHostIds, type Exec, type ExecResult, type SwiftUIHarnessResult, type SwiftUIShot, type SwiftUIShotResult } from "../src/stacks/swiftui/harness";
import {
  appStructName, copyBase, KEEP_BUILDS, MAC_WINDOWS, SWIFTUI_FIRST_RUN_MAC, swiftUIPlatform, swiftUIShotSizes, KEEP_DAYS, mapSwiftUIResult, offersLanguage, planSwiftUIShots, projectReferences, prunedNotes, pruneSwiftUIBuilds, readSwiftUIInputs, takeLock, screenError, shootSwiftUI, signedCapabilities,
  removeRunFolders, SWIFTUI_FIRST_RUN, SWIFTUI_FIXES, ENVIRONMENT_ONLY, SWIFTUI_VARIANT_HOW, swiftUIAuditChecks, swiftUICacheDir, swiftUIRoutes, swiftUIShotRefusal, swiftUITargets, swiftUITimeLimit, type PlannedShot,
} from "../src/stacks/swiftui/shot";
import { discoverSwiftUIScreens } from "../src/stacks/swiftui/screens";
import { swiftUIApp } from "../src/stacks/swiftui/project";
import { FIXTURES, partnerTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const MANIFEST =
  '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Rafiq", platforms: [.iOS(.v17)], targets: [.executableTarget(name: "Rafiq")])\n';
const packageRoot = makeProject({
  "Package.swift": MANIFEST,
  "Sources/Rafiq/RafiqApp.swift": 'import SwiftUI\n@main struct RafiqApp: App { var body: some Scene { WindowGroup { Text("x") } } }\n',
});
const [packageApp] = detectApps(packageRoot).apps;

/** A project whose app is a copy of swiftui-min (an Xcode project) at its root, in a folder with a space and an "&". */
function xcodeProject(files: Record<string, string> = {}): string {
  const root = join(tempDir("motif-shot-swiftui-"), "my app & co");
  cpSync(join(FIXTURES, "swiftui-min"), root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}
const xcodeRoot = xcodeProject();
const [xcodeApp] = detectApps(xcodeRoot).apps;

/** A fake machine: what each command answers. */
function machine(opts: { platform?: NodeJS.Platform; xcode?: "ok" | "missing" | "tools" | "old"; simulator?: boolean } = {}): DoctorDeps {
  const { platform = "darwin", xcode = "ok", simulator = true } = opts;
  return {
    platform,
    arch: "arm64",
    home: "/h",
    findBrowser: () => null,
    which: () => null,
    run: (cmd) => {
      const c = cmd.join(" ");
      if (c === "xcode-select -p") return { code: 0, stdout: xcode === "tools" ? "/Library/Developer/CommandLineTools\n" : "/Applications/Xcode.app/Contents/Developer\n" };
      if (c === "xcodebuild -version") {
        if (xcode === "missing") return { code: 127, stdout: "" };
        return { code: 0, stdout: `Xcode ${xcode === "old" ? "15.4" : "16.4"}\nBuild version 16F6\n` };
      }
      if (c === "swift --version") return { code: 0, stdout: "Swift version 6.1.2\n" };
      if (c.startsWith("xcrun simctl list runtimes")) {
        return { code: 0, stdout: JSON.stringify({ runtimes: simulator ? [{ platform: "iOS", version: "18.5", isAvailable: true }] : [] }) };
      }
      return { code: 127, stdout: "" };
    },
  };
}

describe("motif shot's refusals for a SwiftUI app", () => {
  test("a Mac with Xcode and a simulator is not refused for an Xcode project", () => {
    expect(swiftUIShotRefusal(xcodeRoot, xcodeApp!, machine())).toBeNull();
    expect(SWIFTUI.shotRefusal?.(xcodeRoot, xcodeApp!, () => null, machine())).toBeNull();
  });

  test("not a Mac: needs-mac, with doctor's line and what to do", () => {
    const deps = machine({ platform: "win32" });
    const doctor = swiftUIDoctor(deps, { root: packageRoot, apps: [packageApp!] })[0]!.detail;
    expect(doctor).toBe("SwiftUI screenshots need a Mac with Xcode. Theme code, checks and drafts work here.");
    expect(swiftUIShotRefusal(packageRoot, packageApp!, deps)).toEqual({ error: "needs-mac", text: `${doctor} Run motif shot on a Mac that has Xcode.` });
    expect(SWIFTUI.shotRefusal?.(xcodeRoot, xcodeApp!, () => null, deps)?.error).toBe("needs-mac");
  });

  test("no Xcode, only the command-line tools, an old Xcode, or no simulator: needs-xcode with doctor's line", () => {
    for (const xcode of ["missing", "tools", "old"] as const) {
      const deps = machine({ xcode });
      const doctor = swiftUIDoctor(deps, { root: xcodeRoot, apps: [xcodeApp!] })[0]!.detail;
      expect(swiftUIShotRefusal(xcodeRoot, xcodeApp!, deps)).toEqual({ error: "needs-xcode", text: `${doctor} Then run motif shot again.` });
    }
    const none = swiftUIShotRefusal(xcodeRoot, xcodeApp!, machine({ simulator: false }));
    expect(none?.error).toBe("needs-xcode");
    expect(none?.text).toContain("has no iOS simulator");
  });

  test("a check that could not be made is not a refusal", () => {
    const base = machine();
    const deps = { ...base, run: (cmd: string[]) => (cmd[0] === "xcrun" ? { code: 1, stdout: "" } : base.run!(cmd)) };
    expect(swiftUIShotRefusal(xcodeRoot, xcodeApp!, deps)).toBeNull();
  });

  test("a Swift package app is refused on a Mac, with what to do instead", () => {
    expect(swiftUIShotRefusal(packageRoot, packageApp!, machine())).toEqual({
      error: "needs-xcode-project",
      text:
        "Motif draws a SwiftUI app's screens through its Xcode project, and Rafiq is a Swift package (Package.swift), which motif shot can't draw yet. " +
        "Make an Xcode project for it (in Xcode: File › New › Project › App, then add the package and use its views), and run motif shot in that project's folder.",
    });
  });

  test("the first-run note, the variant hint, Swift states and the time limit", () => {
    expect(SWIFTUI_FIRST_RUN).toBe("The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build.");
    expect(SWIFTUI.variantHow).toBe(".motifTheme(variant:), or design/states/Setup.swift for an app that switches its own palette");
    expect(SWIFTUI.variantHow).toBe(SWIFTUI_VARIANT_HOW);
    expect(SWIFTUI.stateFiles).toEqual({ extension: ".swift", language: "Swift" });
    expect(SWIFTUI.shotTimeLimit?.(10)).toBe(650_000);
    expect(swiftUITimeLimit(0)).toBe(600_000);
  });
});

// ---- What a run is given ----

const STATE = "@MainActor func motifState(_ app: MotifHarness) async throws {\n    try await app.tap(\"Open settings\")\n}\n";
const SETUP = "import Foundation\n\nfunc motifSetup(variant: String, locale: Locale, dark: Bool) {\n    UserDefaults.standard.set(true, forKey: \"signedIn\")\n}\n";

describe("what motif shot is given for a SwiftUI app", () => {
  test("a state must be a Swift file defining motifState; the setup must define motifSetup", () => {
    const root = xcodeProject();
    const state = (file: string, script: string) => ({ name: "opened", file: join(root, file), script });
    expect(readSwiftUIInputs(root, root, { screens: [], states: [state("design/states/opened.kt", STATE)] })).toEqual({
      error: "--state: opened.kt isn't a Swift file; a SwiftUI app's states are Swift files, like design/states/opened.swift.",
    });
    // A motifState in a comment or a string doesn't count.
    expect(readSwiftUIInputs(root, root, { screens: [], states: [state("design/states/opened.swift", '// func motifState(\nlet s = "func motifState("\n')] })).toEqual({
      error: "--state: opened.swift must define @MainActor func motifState(_ app: MotifHarness) async throws, which Motif runs on each screen once it has settled. Add it, then run motif shot again.",
    });
    // Two states whose Swift names would be one are refused, naming both.
    expect(
      readSwiftUIInputs(root, root, { screens: [], states: [{ ...state("design/states/signed-in.swift", STATE), name: "signed-in" }, { ...state("design/states/signed_in.swift", STATE), name: "signed_in" }] }),
    ).toEqual({ error: "--state: signed-in.swift and signed_in.swift would be compiled under one name (motifState_signed_in). Rename one of them." });
    const ok = readSwiftUIInputs(root, root, { screens: [], states: [state("design/states/opened.swift", STATE)] });
    expect(ok).toEqual({ states: [{ name: "opened", file: join(root, "design/states/opened.swift"), text: STATE }], setup: null });

    mkdirSync(join(root, "design/states"), { recursive: true });
    writeFileSync(join(root, "design/states/Setup.swift"), "func setUp() {}\n");
    expect(readSwiftUIInputs(root, root, { screens: [], states: [] })).toEqual({
      error: "design/states/Setup.swift must define func motifSetup(variant: String, locale: Locale, dark: Bool). Fix it, then run motif shot again.",
    });
    writeFileSync(join(root, "design/states/Setup.swift"), SETUP);
    const read = readSwiftUIInputs(root, root, { screens: [], states: [] });
    expect(read).toMatchObject({ setup: { script: { file: join(root, "design/states/Setup.swift"), text: SETUP }, file: { shown: "design/states/Setup.swift", own: false } } });
    expect(SWIFTUI.shotInputsProblem?.(root, detectApps(root).apps[0]!, { screens: ["Nope"], states: [] })).toContain("--screen Nope isn't a #Preview Motif found in this app.");
  });

  test("the harness compiles a state with the app's module, its own line numbers and its own function name", () => {
    const source = scriptSource({ name: "signed-in", file: "/p/my \"app\"/design/states/signed-in.swift", text: `// motifState is here\n${STATE}` }, "SwiftUIMin");
    expect(source).toBe(
      'import Foundation\n@testable import SwiftUIMin\n#sourceLocation(file: "/p/my \\"app\\"/design/states/signed-in.swift", line: 1)\n' +
        `// motifState is here\n${STATE.replace("func motifState", "func motifState_signed_in")}\n#sourceLocation()\n`,
    );
    expect(scriptSource({ file: "/p/Setup.swift", text: SETUP }, "App")).toContain(`${SETUP}\n#sourceLocation()`);
    const hooks = hooksSource({ setup: { file: "/p/Setup.swift", text: SETUP }, states: [{ name: "signed-in", file: "/p/s.swift", text: STATE }] });
    expect(hooks).toContain("static let hasSetup = true");
    expect(hooks).toContain("        try await motifSetup(variant: variant, locale: locale, dark: dark)");
    expect(hooks).toContain('        case "signed-in": try await motifState_signed_in(app)');
    expect(hooks).toContain('default: throw MotifShotError("Motif didn\'t compile the state \\(name) into the run.")');
    expect(hooksSource()).toContain("static let hasSetup = false");
  });

  test("the root view and every #Preview, at most 12, with a note naming what was left out", () => {
    expect(SWIFTUI.routes!(xcodeRoot)).toEqual({ routes: ["/"], skipped: [], screens: ["ContentView-1", "HomeScreen-1", "Settings"] });
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`SwiftUIMin/More/P${i}.swift`, `import SwiftUI\n#Preview("P${i}") { Text("x") }\n`]));
    const root = xcodeProject(many);
    const r = swiftUIRoutes(root);
    expect(r.screens).toHaveLength(11);
    expect(r.notes).toEqual(["Captured 12 of 17 screens: / first, then the previews. Left out: P7, P8, P9, HomeScreen-1 and Settings. Choose others with --screen."]);
  });

  test("the App struct, the copy's folder and Motif's folder for the app", () => {
    expect(appStructName("// @main struct Nope: App\n@main\nstruct ShopApp: App {\n}")).toBe("ShopApp");
    expect(appStructName("@main @MainActor final class Shop: App {}")).toBe("Shop");
    expect(appStructName("struct Nope: App {}")).toBeNull();
    const a = swiftUICacheDir("/home/.motif", "/r/apps/ios", "Shop App");
    expect(a).toMatch(/[\\/]home[\\/]\.motif[\\/]swiftui[\\/]ShopApp-[0-9a-f]{12}$/);
    expect(swiftUICacheDir("/home/.motif", "/r/apps/other", "Shop App")).not.toBe(a);
  });

  test("what the project refers to: groups' paths added up, packages, settings and xcconfig includes", () => {
    // The app is /r/apps/ios; its project is there.
    const pbx = `// !$*UTF8*$!
{
	objects = {
		R0 = {isa = PBXProject; mainGroup = G0; targets = ( ); };
		G0 = {isa = PBXGroup; children = ( G1, F3, G5 ); sourceTree = "<group>"; };
		G1 = {isa = PBXGroup; children = ( F1, F2, G2 ); path = Sources; sourceTree = "<group>"; };
		G2 = {isa = PBXGroup; children = ( F5 ); path = Deep; sourceTree = "<group>"; };
		F1 = {isa = PBXFileReference; path = "../../Shared/Model.swift"; sourceTree = "<group>"; };
		F2 = {isa = PBXFileReference; path = ../Resources/a.png; sourceTree = "<group>"; };
		F3 = {isa = PBXFileReference; path = ..; sourceTree = "<group>"; };
		F5 = {isa = PBXFileReference; path = ../../../Kit/Kit.swift; sourceTree = "<group>"; };
		G5 = {isa = PBXGroup; children = ( ); path = Config; sourceTree = SOURCE_ROOT; };
		P1 = {isa = PBXFileReference; path = Product.app; sourceTree = BUILT_PRODUCTS_DIR; };
		X1 = {isa = XCLocalSwiftPackageReference; relativePath = ../Packages/Core; };
		C1 = {isa = XCBuildConfiguration; baseConfigurationReference = F4; buildSettings = { INFOPLIST_FILE = "$(SRCROOT)/../Plists/Info.plist"; CODE_SIGN_ENTITLEMENTS = ../App.entitlements; }; name = Debug; };
		F4 = {isa = PBXFileReference; path = Config/Base.xcconfig; sourceTree = SOURCE_ROOT; };
	};
	rootObject = R0;
}`;
    const files: Record<string, string> = {
      [resolve("/r/apps/ios/Config/Base.xcconfig")]: '#include "../../Shared/Common.xcconfig"\nTOOLS = $(SRCROOT)/../../Tools/x\n',
      [resolve("/r/apps/Shared/Common.xcconfig")]: '#include? "Local.xcconfig"\n',
    };
    const refs = projectReferences(pbx, resolve("/r/apps/ios"), (p) => files[resolve(p)] ?? null, () => true);
    expect(refs.filter((r) => !r.startsWith(resolve("/r/apps/ios")))).toEqual(
      [
        "/r/apps",
        "/r/apps/App.entitlements",
        "/r/apps/Kit/Kit.swift",
        "/r/apps/Packages/Core",
        "/r/apps/Plists/Info.plist",
        "/r/apps/Shared/Common.xcconfig",
        "/r/apps/Shared/Local.xcconfig",
        "/r/apps/Shared/Model.swift",
        "/r/Tools/x",
      ].map((p) => resolve(p)).sort(),
    );
    // Those back inside the app don't make the copy climb; the others take it to the folder that holds them all.
    expect(refs).toContain(resolve("/r/apps/ios/Resources/a.png"));
    expect(copyBase("/r", "/r/apps/ios", [resolve("/r/apps/ios/Resources/a.png")])).toEqual({ base: resolve("/r/apps/ios") });
    expect(copyBase("/r", "/r/apps/ios", [resolve("/r/apps/Shared/Model.swift")])).toEqual({ base: resolve("/r/apps") });
    expect(copyBase("/r", "/r/apps/ios", refs)).toEqual({ base: resolve("/r") });
    // Outside the folder motif runs in, the copy can't take it: the first such path is named.
    expect(copyBase("/r/apps", "/r/apps/ios", refs)).toEqual({ outside: resolve("/r/Tools/x") });
  });

  test("what isn't a reference the copy must take: absolute paths, a plain group's own path, files that don't exist", () => {
    const pbx = `{
	objects = {
		R0 = {isa = PBXProject; mainGroup = G0; targets = ( ); };
		G0 = {isa = PBXGroup; children = ( A1, G7, S1, G8 ); sourceTree = "<group>"; };
		A1 = {isa = PBXFileReference; path = /Users/someone/Shared/Theme.swift; sourceTree = "<absolute>"; };
		G7 = {isa = PBXGroup; children = ( ); path = ../../Old; sourceTree = "<group>"; };
		G8 = {isa = PBXGroup; children = ( F8 ); path = ../Kit; sourceTree = "<group>"; };
		F8 = {isa = PBXFileReference; path = Kit.swift; sourceTree = "<group>"; };
		S1 = {isa = PBXFileSystemSynchronizedRootGroup; path = ../Feature; sourceTree = "<group>"; };
		F9 = {isa = PBXFileReference; path = ../Gone.swift; sourceTree = "<group>"; };
	};
	rootObject = R0;
}`;
    const exists = (p: string) => p !== resolve("/r/apps/Gone.swift");
    const refs = projectReferences(pbx, resolve("/r/apps/ios"), () => null, exists);
    // An absolute path works the same from the copy; an empty group's stale path names nothing; a group counts through
    // its files, and a synchronized folder is itself what the project builds.
    expect(refs).toEqual([resolve("/r/apps/Feature"), resolve("/r/apps/Kit/Kit.swift")].sort());
  });

  test("Xcode 16's xcconfig in a synchronized folder, and any build setting that climbs out of the project's folder", () => {
    const pbx = `{
	objects = {
		R0 = {isa = PBXProject; mainGroup = G0; targets = ( ); };
		G0 = {isa = PBXGroup; children = ( S1 ); sourceTree = "<group>"; };
		S1 = {isa = PBXFileSystemSynchronizedRootGroup; path = Config; sourceTree = "<group>"; };
		C1 = {isa = XCBuildConfiguration; baseConfigurationReferenceAnchor = S1; baseConfigurationReferenceRelativePath = App.xcconfig; buildSettings = { SWIFT_OBJC_BRIDGING_HEADER = ../Bridge/App-Bridging-Header.h; OTHER = "x"; }; name = Debug; };
	};
	rootObject = R0;
}`;
    const files: Record<string, string> = { [resolve("/r/apps/ios/Config/App.xcconfig")]: "ASSETS = ../../Assets\n" };
    const refs = projectReferences(pbx, resolve("/r/apps/ios"), (p) => files[resolve(p)] ?? null, () => true);
    expect(refs).toContain(resolve("/r/apps/ios/Config/App.xcconfig"));
    expect(refs).toContain(resolve("/r/apps/Bridge/App-Bridging-Header.h"));
    // An xcconfig's own upward setting, from the project's folder as Xcode reads it.
    expect(refs).toContain(resolve("/r/Assets"));
  });

  test("a project that refers to files outside the folder motif runs in is refused before anything runs, with the path", () => {
    const pbx = readFileSync(join(xcodeRoot, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8").replace(
      /(mainGroup = \w+)/,
      "$1;\n\t\t\tpackageReferences = ( 4D4F54494600AAAAAAAAAAAA )",
    ).replace("/* End PBXProject section */", '/* End PBXProject section */\n\t\t4D4F54494600AAAAAAAAAAAA = {isa = XCLocalSwiftPackageReference; relativePath = "../Kit"; };');
    const root = xcodeProject({ "SwiftUIMin.xcodeproj/project.pbxproj": pbx });
    const [app] = detectApps(root).apps;
    const kit = resolve(root, "../Kit");
    // A package that isn't there isn't one the copy must take.
    expect(swiftUIShotRefusal(root, app!, machine())).toBeNull();
    mkdirSync(kit);
    expect(swiftUIShotRefusal(root, app!, machine())).toEqual({
      error: "outside-project",
      text:
        `SwiftUIMin's project uses ${kit}, outside the folder motif runs in (${resolve(root)}), and Motif's copy of the app can't take it. ` +
        `Run motif shot from a folder that holds both (${resolve(root, "..")}), with --app pointing at the app.`,
    });
  });

  test("a CocoaPods app is refused: Motif builds the Xcode project alone", () => {
    const root = xcodeProject({ Podfile: "platform :ios, '17.0'\ntarget 'SwiftUIMin' do\n  pod 'Alamofire'\nend\n" });
    const [app] = detectApps(root).apps;
    expect(swiftUIShotRefusal(root, app!, machine())).toEqual({
      error: "needs-workspace",
      text:
        "SwiftUIMin gets libraries from CocoaPods (its Podfile), which build only through its workspace, and Motif builds the Xcode project alone, so its screens can't be drawn yet. " +
        "If the libraries are also Swift packages, move to those (in Xcode: File › Add Package Dependencies…), then run motif shot again.",
    });
  });

  test("whether the app offers a language: its string catalogue, or a .lproj folder", () => {
    expect(offersLanguage(xcodeRoot, "ar")).toBe(true);
    expect(offersLanguage(xcodeRoot, "he")).toBe(false);
    const lproj = makeProject({ "App/he.lproj/Localizable.strings": '"a" = "b";', "App/x.swift": "" });
    expect(offersLanguage(lproj, "he")).toBe(true);
    expect(offersLanguage(lproj, "ar")).toBe(false);
  });

  test("the capabilities the app's entitlements ask for, which a build without signing doesn't give", () => {
    const pbx = readFileSync(join(xcodeRoot, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8").replace(
      /(INFOPLIST_FILE = [^;]+;)/g,
      "$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = SwiftUIMin/SwiftUIMin.entitlements;",
    );
    const plist =
      '<plist version="1.0"><dict><key>com.apple.security.application-groups</key><array><string>group.x</string></array>' +
      "<key>aps-environment</key><string>development</string><key>com.apple.developer.icloud-container-identifiers</key><array/>" +
      "<key>com.apple.security.app-sandbox</key><true/></dict></plist>";
    const root = xcodeProject({ "SwiftUIMin.xcodeproj/project.pbxproj": pbx, "SwiftUIMin/SwiftUIMin.entitlements": plist });
    expect(pbx).toContain("CODE_SIGN_ENTITLEMENTS");
    expect(signedCapabilities(root, swiftUIApp(root)!)).toEqual(["App Groups", "push notifications", "iCloud"]);
    expect(signedCapabilities(xcodeRoot, swiftUIApp(xcodeRoot)!)).toEqual([]);
  });
});

// ---- The screenshots planned, and what they become ----

const phoneOpts = (o: Partial<NativeShotOptions> = {}): NativeShotOptions => ({
  root: xcodeRoot, app: xcodeApp!, routes: ["/"], screens: [], outDir: "/out", viewports: NATIVE_VIEWPORTS, variants: [], states: [], audit: false, timeoutMs: 60_000, ...o,
});

describe("the screenshots of a SwiftUI run", () => {
  const previews = discoverSwiftUIScreens(xcodeRoot).previews;

  test("every size, light and dark, variant, direction and state, named as on the other stacks; phones at 3× with their safe area", () => {
    const opts = phoneOpts({ screens: ["Settings"], variants: ["partner"], rtl: "ar", states: [{ name: "opened", script: STATE }] });
    const targets = swiftUITargets(opts, previews);
    expect(targets).toEqual([
      { key: "/", slug: "index", screen: "/" },
      { key: "Settings", screen: "SettingsScreen.swift:20", slug: "settings", file: "SwiftUIMin/Screens/SettingsScreen.swift" },
    ]);
    const shots = planSwiftUIShots(opts, targets, { variants: true }, "default");
    expect(shots).toHaveLength(2 * 4 * 2 * 2 * 2 * 2);
    expect(shots[0]).toEqual({
      target: "/", screen: "/", file: "index.mobile-360.png", width: 360, height: 800, scale: 3, dark: false, locale: "en_US", rtl: false, insets: [47, 34], variant: "default", variantId: "default",
    });
    expect(shots[1]).toMatchObject({ file: "index@opened.mobile-360.png", state: "opened" });
    expect(shots[2]).toMatchObject({ file: "index.mobile-360.rtl.png", locale: "ar", rtl: true });
    expect(shots[4]).toMatchObject({ file: "index+partner.mobile-360.png", variant: "partner", variantId: "partner" });
    expect(shots.find((s) => s.file === "settings+partner.mobile.rtl.dark.png")).toMatchObject({ screen: "SettingsScreen.swift:20", width: 390, dark: true, scale: 3 });
    const tablet = shots.find((s) => s.file === "index.tablet.png")!;
    expect([tablet.scale, tablet.insets]).toEqual([2, undefined]);
  });

  test("the default's shots set the default variant only when the app's theme has variants; a guide without variants sets none", () => {
    const targets = swiftUITargets(phoneOpts(), previews);
    const opts = phoneOpts({ viewports: [NATIVE_VIEWPORTS[1]!], variants: ["partner"] });
    const old = planSwiftUIShots(opts, targets, { variants: false }, "default");
    expect(old.map((s) => [s.file, s.variant, s.variantId])).toEqual([
      ["index.mobile.png", undefined, "default"],
      ["index+partner.mobile.png", "partner", "partner"],
      ["index.mobile.dark.png", undefined, "default"],
      ["index+partner.mobile.dark.png", "partner", "partner"],
    ]);
    const none = planSwiftUIShots(phoneOpts({ viewports: [NATIVE_VIEWPORTS[1]!] }), targets, { variants: false }, "");
    expect(none.map((s) => [s.variant, s.variantId])).toEqual([
      [undefined, ""],
      [undefined, ""],
    ]);
  });

  test("a route other than / can't be opened, and says so", () => {
    const targets = swiftUITargets(phoneOpts({ routes: ["/", "/settings"] }), previews);
    expect(targets[1]).toEqual({
      key: "/settings",
      slug: "settings",
      error: "/settings can't be opened: SwiftUI screens aren't reached by an address, so Motif draws / (the app's root view) and its #Preview blocks. Give the screen's preview with --screen.",
    });
    expect(planSwiftUIShots(phoneOpts({ viewports: [NATIVE_VIEWPORTS[1]!] }), targets, null, "").map((s) => s.target)).toEqual(["/", "/"]);
  });

  test("what the harness drew becomes the screens' results: shots, errors, states' errors, and the time limit", () => {
    const outDir = tempDir("motif-swiftui-map-");
    const opts = phoneOpts({ outDir, viewports: [NATIVE_VIEWPORTS[1]!], routes: ["/", "/x"], screens: ["Settings", "HomeScreen-1"], states: [{ name: "opened", script: STATE }] });
    const targets = swiftUITargets(opts, previews);
    const shots = planSwiftUIShots(opts, targets, null, "");
    for (const f of ["index.mobile.png", "index.mobile.dark.png", "index@opened.mobile.png", "index@opened.mobile.dark.png"]) writeFileSync(join(outDir, f), "png");
    const crash = "The preview SettingsScreen.swift:20 stopped the app: Fatal error: No ObservableObject of type Session found. A View.environmentObject(_:) for Session may be missing as an ancestor of this view.";
    const run: Pick<SwiftUIHarnessResult, "result" | "problem" | "timedOut" | "notes"> = {
      timedOut: true,
      problem: "The screenshots took longer than 60 s and were stopped while drawing HomeScreen.swift:26 (home-screen-1.mobile.png); the shots before it were kept. Check that screen for work that never ends, or run motif shot again with a longer time limit.",
      notes: ["No iOS 27.0 simulator is installed."],
      result: {
        shots: [
          { file: "index.mobile.png", ms: 200 },
          { file: "index@opened.mobile.png", ms: 900, stateError: 'State "opened": There\'s nothing called "Open settings" on the screen.' },
          { file: "index.mobile.dark.png", ms: 200 },
          { file: "index@opened.mobile.dark.png", ms: 900, stateError: 'State "opened": There\'s nothing called "Open settings" on the screen.' },
          { file: "settings.mobile.png", error: crash },
          { file: "settings@opened.mobile.png", error: crash },
        ],
        previews: [],
        notes: [crash, "Screens were drawn from their layers."],
      },
    };
    const mapped = mapSwiftUIResult(targets, shots as PlannedShot[], outDir, run, 60_000);
    const [root, x, settings, home] = mapped.routes as RouteResult[];
    expect(root).toEqual({
      route: "/", url: "/", status: 200,
      shots: ["index.mobile.png", "index@opened.mobile.png", "index.mobile.dark.png", "index@opened.mobile.dark.png"].map((f) => join(outDir, f)),
      pageErrors: ['State "opened": There\'s nothing called "Open settings" on the screen.'],
    });
    expect(x).toMatchObject({ route: "/x", status: 0, shots: [] });
    expect(settings).toEqual({
      route: "Settings", url: "Settings", status: 0, shots: [],
      error: `${crash} Give the preview what the screen needs in its #Preview block (.environmentObject(…), .environment(…), .modelContainer(…)).`,
    });
    expect(home).toEqual({ route: "HomeScreen-1", url: "HomeScreen-1", status: 0, shots: [], error: "The run reached its time limit (60 s) before drawing it." });
    expect(mapped.notes).toEqual(["Screens were drawn from their layers.", run.problem!, "No iOS 27.0 simulator is installed."]);
  });

  test("a screen some of whose shots weren't drawn says how many; its other errors (a stuck state) are in the notes", () => {
    const outDir = tempDir("motif-swiftui-map-");
    const opts = phoneOpts({ outDir, viewports: [NATIVE_VIEWPORTS[1]!], routes: [], screens: ["Settings"], states: [{ name: "stuck", script: STATE }] });
    const targets = swiftUITargets(opts, previews);
    const shots = planSwiftUIShots(opts, targets, null, "");
    for (const f of ["settings.mobile.png", "settings@stuck.mobile.png"]) writeFileSync(join(outDir, f), "png");
    const setup = "design/states/Setup.swift failed: no dark today";
    const stuck = 'State "stuck": it was still running after 15 seconds.';
    const mapped = mapSwiftUIResult(targets, shots as PlannedShot[], outDir, {
      timedOut: false,
      notes: [],
      result: {
        shots: [
          { file: "settings.mobile.png", ms: 200 },
          { file: "settings@stuck.mobile.png", ms: 15_200, stateError: stuck },
          { file: "settings.mobile.dark.png", error: setup },
          { file: "settings@stuck.mobile.dark.png", error: setup },
        ],
        previews: [],
        notes: [],
      },
    }, 60_000);
    expect(mapped.routes[0]).toEqual({
      route: "Settings", url: "Settings", status: 200, missing: 2,
      shots: [join(outDir, "settings.mobile.png"), join(outDir, "settings@stuck.mobile.png")],
      pageErrors: [setup, stuck],
    });
    expect(mapped.notes).toEqual([`Settings also had: ${stuck}`]);
  });

  test("a root view that stops the app for want of what the App gives it says how to give it", () => {
    const error = "The app's root view stopped the app: SwiftData/ModelContext.swift: Fatal error: Set a .modelContext in view's environment to use Query";
    expect(screenError(error, "/")).toBe(
      `${error} Motif draws the root view from a new App's WindowGroup, with what the App puts on its scene; the App's init runs for it, but what its delegate sets up at launch, and SwiftData's .modelContainer(for:) on the scene, don't reach it. Give it inside the WindowGroup (WindowGroup { ContentView().environmentObject(…) }), or set it up in design/states/Setup.swift.`,
    );
    // Any other crash keeps its plain words.
    const other = "The app's root view stopped the app: Fatal error: Index out of range";
    expect(screenError(other, "/")).toBe(other);
  });

  test("a root view that stops the app with a second configure (FirebaseApp.configure() in the App's init) names the init and how to guard it", () => {
    const hint =
      " The App's init runs again for each screenshot of the root, as Motif makes a new App for each, and work in it that can't run twice stops the app. Guard it in the App's init (if FirebaseApp.app() == nil { FirebaseApp.configure() }), or move it to the app's delegate, then run motif shot again.";
    const firebase = "The app's root view stopped the app: Terminating app due to uncaught exception 'com.firebase.core', reason: 'Default app has already been configured.'";
    expect(screenError(firebase, "/")).toBe(firebase + hint);
    for (const words of ["Fatal error: Analytics is already configured", "Fatal error: The SDK has already been configured."]) {
      const error = `The app's root view stopped the app: ${words}`;
      expect(screenError(error, "/")).toBe(error + hint);
    }
    // A preview doesn't make the App, so its crash keeps its plain words; so does a root view's that isn't a second configure.
    const preview = "The preview Home.swift:12 stopped the app: Terminating app due to uncaught exception 'com.firebase.core', reason: 'Default app has already been configured.'";
    expect(screenError(preview, "Home.swift:12")).toBe(preview);
    const configured = "The app's root view stopped the app: Fatal error: The store isn't configured";
    expect(screenError(configured, "/")).toBe(configured);
  });
});

// ---- The run, with stand-ins for xcodebuild and simctl ----

const UDID = "6863BE3D-AAA8-4177-A1E6-AB1EC415FEF2";
const LEFTOVER = "11111111-2222-3333-4444-555555555555";
const SETTINGS = JSON.stringify([
  { target: "SwiftUIMin", buildSettings: { PRODUCT_MODULE_NAME: "SwiftUIMin", FULL_PRODUCT_NAME: "SwiftUIMin.app", EXECUTABLE_NAME: "SwiftUIMin", PRODUCT_BUNDLE_IDENTIFIER: "dev.motif.SwiftUIMin" } },
]);
const SIMS = JSON.stringify({
  runtimes: [{ identifier: "com.apple.CoreSimulator.SimRuntime.iOS-18-5", version: "18.5", platform: "iOS", isAvailable: true }],
  devicetypes: [{ identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro", name: "iPhone 16 Pro" }],
});
// A simulator a killed run left (its process, 99999999, is gone), and the developer's own.
const DEVICES = JSON.stringify({ devices: { "iOS-18-5": [{ name: "motif-99999999-abc", udid: LEFTOVER }, { name: "iPhone 16", udid: "MINE" }] } });
const ok = (stdout = ""): ExecResult => ({ code: 0, stdout, stderr: "", timedOut: false });

interface Fake {
  calls: string[][];
  removed: string[];
  hooks: (() => void)[];
  /** Exit hooks added to run after all the others (cleanup's onExit with last). */
  lastHooks: (() => void)[];
  /** For each simulator deleted, whether the copy was still there then: processes go before folders. */
  copyAtRemove: boolean[];
  sources: Record<string, string>;
  options: { shots: SwiftUIShot[]; setupFile?: string; stateLimit?: number; appKitOnly?: boolean } | null;
  copyDir: string;
  /** The copy's project file and the test's environment, as the launch saw them. */
  pbx: string;
  env: Record<string, string | undefined> | null;
  /** A macOS run's host clean-up: the commands it ran, the processes it stopped, and the home it cleaned. */
  host: { spawned: string[][]; killed: number[]; home: string; ps: string };
}

/**
 * motif shot's SWIFTUI.shoot on a project, with stand-ins for xcodebuild and simctl: `test` plays the test's part
 * (by default it draws every shot). The harness itself is the real one.
 */
async function fakeShoot(
  root: string,
  opts: Partial<NativeShotOptions>,
  home: string,
  test: (options: { shots: SwiftUIShot[] }, resultPath: string, fake: Fake) => ExecResult = drawsAll,
  build: ExecResult = ok("** TEST BUILD SUCCEEDED **"),
  ps = "",
  builtId?: string,
) {
  // The id in a built app's Info.plist: Motif's own (dev.motif.<App>.motif-shots) unless the test says otherwise.
  const idOf = (plist: string) => builtId ?? `dev.motif.${basename(dirname(dirname(plist))).replace(/\.app$/, "")}.motif-shots`;
  const fake: Fake = {
    calls: [], removed: [], hooks: [], lastHooks: [], copyAtRemove: [], sources: {}, options: null, copyDir: "", pbx: "", env: null,
    host: { spawned: [], killed: [], home: tempDir("motif-swiftui-user-"), ps },
  };
  const exec: Exec = async (cmd, o) => {
    fake.calls.push(cmd);
    const c = cmd.join(" ");
    if (c === "xcrun simctl list -j devices") return ok(DEVICES);
    if (cmd[0] === "xcodebuild" && cmd[1] === "-showBuildSettings") {
      const project = cmd[cmd.indexOf("-project") + 1]!;
      fake.copyDir = dirname(project);
      // The app target's settings, named as the project is (SwiftUIMin, SwiftUIMac).
      return ok(SETTINGS.replaceAll("SwiftUIMin", basename(project).replace(/\.xcodeproj$/, "")));
    }
    if (c === "xcrun --sdk iphonesimulator --show-sdk-version") return ok("18.5\n");
    if (c.startsWith("xcrun simctl list")) return ok(SIMS);
    if (c.startsWith("xcrun simctl create")) return ok(`${UDID}\n`);
    if (cmd[0] === "xcrun") return ok();
    if (cmd[0] === "xcodebuild" && cmd[1] === "build-for-testing") return build;
    if (cmd[0] === "plutil") return ok(`${idOf(cmd[cmd.length - 1]!)}\n`);
    if (cmd[0] === "xcodebuild") {
      const path = o.env!.TEST_RUNNER_MOTIF_SHOT_OPTIONS!;
      const folder = join(dirname(path), SOURCES_FOLDER);
      for (const f of readdirSync(folder)) fake.sources[f] = readFileSync(join(folder, f), "utf8");
      fake.options = JSON.parse(readFileSync(path, "utf8"));
      fake.pbx = readFileSync(join(fake.copyDir, readdirSync(fake.copyDir).find((f) => f.endsWith(".xcodeproj"))!, "project.pbxproj"), "utf8");
      fake.env = o.env ?? null;
      return test(fake.options!, join(dirname(path), RESULT_FILE), fake);
    }
    throw new Error(`unexpected ${c}`);
  };
  const [app] = detectApps(root).apps;
  const promise = shootSwiftUI(
    { root, app: app!, routes: ["/"], screens: [], outDir: join(root, "design/shots"), viewports: [NATIVE_VIEWPORTS[1]!], variants: [], states: [], audit: false, timeoutMs: 60_000, ...opts },
    {
      themeDir: SWIFTUI.themeDir(root, app!),
      home,
      exec,
      remove: (udid) => {
        fake.removed.push(udid);
        fake.copyAtRemove.push(fake.copyDir !== "" && existsSync(fake.copyDir));
        return { code: 0, stderr: "" };
      },
      onExit: (fn, o) => {
        const list = o?.last ? fake.lastHooks : fake.hooks;
        list.push(fn);
        return () => list.splice(list.indexOf(fn), 1);
      },
      host: {
        spawn: (cmd) => {
          fake.host.spawned.push(cmd);
          return { exitCode: 0, stdout: cmd[0] === "ps" ? fake.host.ps : cmd[0] === "plutil" ? `${idOf(cmd[cmd.length - 1]!)}\n` : "" };
        },
        kill: (pid) => void fake.host.killed.push(pid),
        home: fake.host.home,
      },
    },
  );
  return { promise, fake };
}

/** A launch that draws every shot it's given (an empty PNG each). */
function drawsAll(options: { shots: SwiftUIShot[]; outDir?: string }, path: string): ExecResult {
  const outDir = (options as { outDir: string }).outDir;
  mkdirSync(outDir, { recursive: true });
  for (const s of options.shots) writeFileSync(join(outDir, s.file), "png");
  writeFileSync(path, JSON.stringify({ shots: options.shots.map((s) => ({ file: s.file, ms: 200 })), previews: [], notes: [], done: true }));
  return ok("** TEST SUCCEEDED **");
}

describe("SWIFTUI.shoot (with stand-ins for xcodebuild and simctl)", () => {
  test("copies the app into Motif's folder, runs the harness there with the setup and states, and keeps only the build", async () => {
    const root = xcodeProject({
      "design/tokens.json": JSON.stringify(partnerTokens()),
      "design/states/Setup.swift": SETUP,
      "design/states/opened.swift": STATE,
      "SwiftUIMin/Design/MotifTheme.swift": "// Generated by Motif\nenum MotifTheme { @MainActor static var debugVariantOverride: MotifVariant? }\n",
    });
    const home = tempDir("motif-swiftui-home-");
    const progress: string[] = [];
    const states = [{ name: "opened", script: STATE, file: join(root, "design/states/opened.swift") }];
    const { promise, fake } = await fakeShoot(root, { states, variants: ["partner"], progress: (l) => progress.push(l) }, home);
    const r = await promise;
    const cache = swiftUICacheDir(home, root, "SwiftUIMin");

    // The copy and the build are in Motif's own folder, outside the project; the developer's project is untouched.
    expect(fake.copyDir).toBe(join(cache, "copy"));
    expect(relative(root, fake.copyDir).startsWith("..")).toBe(true);
    expect(fake.calls.filter((c) => c[0] === "xcodebuild").map((c) => c[1])).toEqual(["-showBuildSettings", "build-for-testing", "test-without-building"]);
    const test = fake.calls.find((c) => c[0] === "xcodebuild" && c[1] === "test-without-building")!;
    expect(test.slice(0, 8)).toEqual(["xcodebuild", "test-without-building", "-project", join(cache, "copy", "SwiftUIMin.xcodeproj"), "-scheme", "MotifShots", "-configuration", "Debug"]);
    expect(test).toContain(`id=${UDID}`);
    expect(test[test.indexOf("-derivedDataPath") + 1]).toBe(join(cache, "DerivedData"));
    expect(test).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(readFileSync(join(root, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8")).not.toContain("MotifShots");

    // The setup and the state go into the harness, with the app's module.
    expect(fake.sources["MotifSetup.swift"]).toContain(`@testable import SwiftUIMin\n#sourceLocation(file: ${JSON.stringify(join(root, "design/states/Setup.swift"))}`);
    expect(fake.sources["MotifState_opened.swift"]).toContain("func motifState_opened(_ app: MotifHarness)");
    expect(fake.sources["MotifHooks.swift"]).toContain('case "opened": try await motifState_opened(app)');
    expect(fake.options).toMatchObject({ setupFile: "design/states/Setup.swift", stateLimit: 15, settle: 5 });
    expect(fake.options!.shots.map((s) => [s.file, s.variant, s.state])).toEqual([
      ["index.mobile.png", "default", undefined],
      ["index@opened.mobile.png", "default", "opened"],
      ["index+partner.mobile.png", "partner", undefined],
      ["index@opened+partner.mobile.png", "partner", "opened"],
      ["index.mobile.dark.png", "default", undefined],
      ["index@opened.mobile.dark.png", "default", "opened"],
      ["index+partner.mobile.dark.png", "partner", undefined],
      ["index@opened+partner.mobile.dark.png", "partner", "opened"],
    ]);

    // Drawn; the copy and the work folder are gone, the build is kept; the simulators it made and a killed run's are deleted.
    expect(r.routes).toEqual([{ route: "/", url: "/", status: 200, shots: fake.options!.shots.map((s) => join(root, "design/shots", s.file)) }]);
    expect(readdirSync(cache).sort()).toEqual(["last-used"]);
    expect(fake.removed).toEqual([LEFTOVER, UDID]);
    expect(fake.hooks).toEqual([]);
    expect(progress).toEqual([SWIFTUI_FIRST_RUN]);
    expect(r.notes).toEqual([SWIFTUI_FIRST_RUN, "Deleted a simulator that an earlier motif shot left behind when it was stopped."]);

    // The next run reuses the build, and doesn't say it's the first.
    mkdirSync(join(cache, "DerivedData"));
    const again = await fakeShoot(root, {}, home);
    expect((await again.promise).notes).not.toContain(SWIFTUI_FIRST_RUN);
    expect(readdirSync(cache).sort()).toEqual(["DerivedData", "last-used"]);
  });

  test("a build that fails says so, and the copy, the work folder and the simulator are still removed", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const { promise, fake } = await fakeShoot(root, {}, home, drawsAll, {
      code: 65, stdout: "/x/ContentView.swift:3:5: error: cannot find 'Foo' in scope\n** TEST BUILD FAILED **", stderr: "", timedOut: false,
    });
    await expect(promise).rejects.toThrow("The app didn't build with Motif's harness:\n/x/ContentView.swift:3:5: error: cannot find 'Foo' in scope");
    const cache = swiftUICacheDir(home, root, "SwiftUIMin");
    expect(readdirSync(cache).sort()).toEqual(["last-used"]);
    expect(fake.removed).toContain(UDID);
    expect(fake.hooks).toEqual([]);
  });

  test("a build script that needs git fails in Motif's copy, which has no .git: the error says so, with what to do (final review)", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const out = [
      "PhaseScriptExecution Set\\ version /x/Script-1.sh (in target 'SwiftUIMin' from project 'SwiftUIMin')",
      "fatal: not a git repository (or any of the parent directories): .git",
      "Command PhaseScriptExecution failed with a nonzero exit code",
      "** TEST BUILD FAILED **",
    ].join("\n");
    const { promise } = await fakeShoot(root, {}, home, drawsAll, { code: 65, stdout: out, stderr: "", timedOut: false });
    const error = await promise.then(() => "", (e: Error) => e.message);
    expect(error).toContain("The app didn't build with Motif's harness:");
    expect(error).toContain(
      "Motif builds a copy of the project without its .git folder, and a build script here needs git (\"not a git repository\"). Make the script carry on without git (check git rev-parse --is-inside-work-tree first), then run motif shot again.",
    );
    // A build that fails for another reason doesn't get the hint.
    const other = await fakeShoot(xcodeProject(), {}, tempDir("motif-swiftui-home-"), drawsAll, {
      code: 65, stdout: "/x/ContentView.swift:3:5: error: cannot find 'Foo' in scope\n** TEST BUILD FAILED **", stderr: "", timedOut: false,
    });
    expect(await other.promise.then(() => "", (e: Error) => e.message)).not.toContain(".git folder");
    // Nor does a package that can't be fetched, whose address ends in .git (final review's re-review).
    const fetch = await fakeShoot(xcodeProject(), {}, tempDir("motif-swiftui-home-"), drawsAll, {
      code: 74, stdout: "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com\n** TEST BUILD FAILED **", stderr: "", timedOut: false,
    });
    expect(await fetch.promise.then(() => "", (e: Error) => e.message)).not.toContain(".git folder");
  });

  test("interrupted (Ctrl+C, a termination signal): the exit hooks stop and delete the simulator first, then the copy and the lock", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const cache = swiftUICacheDir(home, root, "SwiftUIMin");
    let seen: string[] = [];
    let last = 0;
    const { promise, fake } = await fakeShoot(root, {}, home, (options, path, f) => {
      // Motif exits while xcodebuild runs: what its exit hooks do, in cleanup's order (the last ones after the others).
      last = f.lastHooks.length;
      for (const hook of [...f.hooks, ...f.lastHooks]) hook();
      seen = readdirSync(cache).sort();
      return drawsAll(options, path);
    });
    await promise.catch(() => {});
    expect(fake.removed).toContain(UDID);
    // The folders' removal is a last hook, so the simulator (and xcodebuild, the Mac's host) go while the copy is there.
    expect(last).toBe(1);
    expect(fake.copyAtRemove[fake.removed.indexOf(UDID)]).toBe(true);
    expect(seen).toEqual(["last-used"]);
    expect(fake.lastHooks).toEqual([]);
  });

  test("the run's folders are removed one by one: a folder that can't be removed never keeps the lock (final review)", () => {
    const removed: string[] = [];
    const rm = (path: string) => {
      if (path === "copy") throw new Error("EBUSY: resource busy or locked");
      removed.push(path);
    };
    removeRunFolders(["copy", "work"], "run.lock", rm);
    expect(removed).toEqual(["work", "run.lock"]);
  });

  test("another run on the same app is refused while it draws; a lock left by a run that died is taken over", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const cache = swiftUICacheDir(home, root, "SwiftUIMin");
    mkdirSync(cache, { recursive: true });
    // A live process that isn't this one: the test runner's parent.
    writeFileSync(join(cache, "run.lock"), String(process.ppid));
    const busy = await fakeShoot(root, {}, home);
    await expect(busy.promise).rejects.toThrow(
      `Another motif shot (process ${process.ppid}) is drawing this app's screens. Wait for it to finish, then run motif shot again. If none is running, delete ${join(cache, "run.lock")}.`,
    );
    // The lock is taken with an exclusive create, so two runs starting together can't both take it.
    expect(readFileSync(join(cache, "run.lock"), "utf8")).toBe(String(process.ppid));
    writeFileSync(join(cache, "run.lock"), "99999999");
    const free = await fakeShoot(root, {}, home);
    expect((await free.promise).routes[0]!.status).toBe(200);
  });

  test("the copy leaves out build output at the app's top and version control, but keeps a source folder named build", async () => {
    const root = xcodeProject({
      "build/Debug/junk.o": "x",
      "DerivedData/x": "x",
      ".git/HEAD": "ref",
      "SwiftUIMin/build/Builder.swift": "struct Builder {}\n",
      "SwiftUIMin/DerivedData/Kept.swift": "struct Kept {}\n",
    });
    const home = tempDir("motif-swiftui-home-");
    const seen: Record<string, boolean> = {};
    const { promise } = await fakeShoot(root, {}, home, (options, path, f) => {
      for (const p of ["build", "DerivedData", ".git", "SwiftUIMin/build/Builder.swift", "SwiftUIMin/DerivedData/Kept.swift", "SwiftUIMin/ContentView.swift"]) seen[p] = existsSync(join(f.copyDir, p));
      return drawsAll(options, path);
    });
    await promise;
    expect(seen).toEqual({
      build: false,
      DerivedData: false,
      ".git": false,
      "SwiftUIMin/build/Builder.swift": true,
      "SwiftUIMin/DerivedData/Kept.swift": true,
      "SwiftUIMin/ContentView.swift": true,
    });
  });

  test("an app with a workspace (no CocoaPods) is drawn from its project alone, and the run says so", async () => {
    const root = xcodeProject({ "Shop.xcworkspace/contents.xcworkspacedata": '<?xml version="1.0"?><Workspace version="1.0"></Workspace>' });
    const { promise } = await fakeShoot(root, {}, tempDir("motif-swiftui-home-"));
    expect((await promise).notes).toContain(
      "This app has a workspace (Shop.xcworkspace), and Motif builds SwiftUIMin.xcodeproj alone: projects only the workspace brings in aren't built, and if the app needs them its build fails.",
    );
  });

  test("the kept builds are bounded: unused for 14 days, or beyond the 3 most recent, they're removed; a running one never", () => {
    const dir = tempDir("motif-swiftui-builds-");
    const now = Date.parse("2026-10-21T12:00:00Z");
    const day = 86_400_000;
    const make = (name: string, daysAgo: number, lock?: number) => {
      mkdirSync(join(dir, name, "DerivedData"), { recursive: true });
      const stamp = join(dir, name, "last-used");
      writeFileSync(stamp, "");
      utimesSync(stamp, new Date(now - daysAgo * day), new Date(now - daysAgo * day));
      if (lock) writeFileSync(join(dir, name, "run.lock"), String(lock));
    };
    make("Current-000000000001", 0);
    make("Old-000000000002", 20);
    make("OldButRunning-000000000003", 30, process.ppid);
    make("Recent-000000000004", 1);
    make("Recent-000000000005", 2);
    make("Recent-000000000006", 3);
    make("DeadLock-000000000007", 15, 99999999);
    expect([KEEP_DAYS, KEEP_BUILDS]).toEqual([14, 3]);
    const removed = pruneSwiftUIBuilds(dir, join(dir, "Current-000000000001"), now);
    // Unused for 14 days (a lock whose process is gone doesn't save it); then the current app and the running one count
    // toward the three, so of the rest only the one used most recently is kept.
    expect({ old: removed.old.sort(), extra: removed.extra.sort() }).toEqual({ old: ["DeadLock-000000000007", "Old-000000000002"], extra: ["Recent-000000000005", "Recent-000000000006"] });
    expect(readdirSync(dir).sort()).toEqual(["Current-000000000001", "OldButRunning-000000000003", "Recent-000000000004"]);
    expect(pruneSwiftUIBuilds(join(dir, "none"), join(dir, "none", "x"), now)).toEqual({ old: [], extra: [], failed: [] });
  });

  test("pruning only ever removes Motif's own folders, named <App>-<12 hex digits>: nothing else under swiftui/ (final review)", () => {
    const dir = tempDir("motif-swiftui-builds-");
    const now = Date.parse("2026-10-21T12:00:00Z");
    for (const name of ["Old-000000000002", "notes", "Backup-1", "Old-00000000000g", "Old-0000000000002"]) {
      mkdirSync(join(dir, name, "DerivedData"), { recursive: true });
      const stamp = join(dir, name, "last-used");
      writeFileSync(stamp, "");
      utimesSync(stamp, new Date(now - 30 * 86_400_000), new Date(now - 30 * 86_400_000));
    }
    const removed = pruneSwiftUIBuilds(dir, join(dir, "Current-000000000000"), now);
    expect(removed).toEqual({ old: ["Old-000000000002"], extra: [], failed: [] });
    expect(readdirSync(dir).sort()).toEqual(["Backup-1", "Old-0000000000002", "Old-00000000000g", "notes"]);
    // Motif's own name for an app's folder has that form.
    expect(basename(swiftUICacheDir(tempDir("motif-home-"), dir, "My App!"))).toMatch(/^MyApp-[0-9a-f]{12}$/);
  });

  test("pruning takes each folder's lock before removing it: one a run took meanwhile is kept; a removal that fails is a note", () => {
    const dir = tempDir("motif-swiftui-builds-");
    const now = Date.parse("2026-10-21T12:00:00Z");
    const make = (name: string) => {
      mkdirSync(join(dir, name, "DerivedData"), { recursive: true });
      const stamp = join(dir, name, "last-used");
      writeFileSync(stamp, "");
      utimesSync(stamp, new Date(now - 30 * 86_400_000), new Date(now - 30 * 86_400_000));
    };
    make("Raced-000000000001");
    make("Stuck-000000000002");
    make("Gone-000000000003");
    const removed = pruneSwiftUIBuilds(dir, join(dir, "Current-000000000000"), now, KEEP_DAYS, KEEP_BUILDS, {
      // A run starts on Raced-000000000001 between the listing and its removal; Stuck-000000000002 can't be removed.
      beforeClaim: (folder) => {
        if (folder.endsWith("Raced-000000000001")) writeFileSync(join(folder, "run.lock"), String(process.ppid));
      },
      remove: (folder) => {
        if (folder.endsWith("Stuck-000000000002")) throw new Error("EBUSY: resource busy or locked");
        rmSync(folder, { recursive: true, force: true });
      },
    });
    expect(removed.old).toEqual(["Gone-000000000003"]);
    expect(removed.failed).toEqual([{ name: "Stuck-000000000002", path: join(dir, "Stuck-000000000002"), error: "EBUSY: resource busy or locked" }]);
    expect(readdirSync(dir).sort()).toEqual(["Raced-000000000001", "Stuck-000000000002"]);
    // The raced run's lock is its own, untouched; the folder that couldn't be removed isn't left locked.
    expect(readFileSync(join(dir, "Raced-000000000001", "run.lock"), "utf8")).toBe(String(process.ppid));
    expect(existsSync(join(dir, "Stuck-000000000002", "run.lock"))).toBe(false);
    expect(prunedNotes(removed)).toEqual([
      "Removed Motif's kept build of an app not drawn in the last 14 days (Gone).",
      `Motif couldn't remove its kept build of Stuck (${join(dir, "Stuck-000000000002")}): EBUSY: resource busy or locked. Delete the folder to free its space.`,
    ]);
  });

  test("pruning goes on when a folder vanishes before its lock is taken (another run pruned it), and doesn't fail the run", () => {
    const dir = tempDir("motif-swiftui-builds-");
    const now = Date.parse("2026-10-21T12:00:00Z");
    for (const name of ["Vanished-000000000001", "Old-000000000002"]) {
      mkdirSync(join(dir, name, "DerivedData"), { recursive: true });
      const stamp = join(dir, name, "last-used");
      writeFileSync(stamp, "");
      utimesSync(stamp, new Date(now - 30 * 86_400_000), new Date(now - 30 * 86_400_000));
    }
    const removed = pruneSwiftUIBuilds(dir, join(dir, "Current-000000000000"), now, KEEP_DAYS, KEEP_BUILDS, {
      beforeClaim: (folder) => {
        if (folder.endsWith("Vanished-000000000001")) rmSync(folder, { recursive: true, force: true });
      },
    });
    expect(removed.old).toEqual(["Old-000000000002"]);
    expect(removed.failed).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("a stale lock is taken over by moving it aside: a run that took it meanwhile keeps it, and this one stops", () => {
    const dir = tempDir("motif-swiftui-lock-");
    const lock = join(dir, "run.lock");
    writeFileSync(lock, "99999999");
    // Between reading the dead process and moving the lock aside, another run takes it over.
    expect(() => takeLock(lock, { beforeTakeover: () => writeFileSync(lock, String(process.ppid)) })).toThrow(`Another motif shot (process ${process.ppid})`);
    expect(readFileSync(lock, "utf8")).toBe(String(process.ppid));
    expect(readdirSync(dir)).toEqual(["run.lock"]);
    // Without a race, the stale lock is this run's now.
    writeFileSync(lock, "99999999");
    takeLock(lock);
    expect(readFileSync(lock, "utf8")).toBe(String(process.pid));
  });

  test("the first run says where the build is kept, how big it is, and when Motif removes it; others it removed are named", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const old = join(home, "swiftui", "Old-000000000abc");
    mkdirSync(join(old, "DerivedData"), { recursive: true });
    utimesSync(old, new Date(Date.now() - 30 * 86_400_000), new Date(Date.now() - 30 * 86_400_000));
    const { promise } = await fakeShoot(root, {}, home, (options, path, f) => {
      // xcodebuild fills DerivedData: 3 MB.
      const dd = join(dirname(f.copyDir), "DerivedData");
      mkdirSync(dd, { recursive: true });
      writeFileSync(join(dd, "big"), Buffer.alloc(3 * 1024 * 1024));
      return drawsAll(options, path);
    });
    const r = await promise;
    const cache = swiftUICacheDir(home, root, "SwiftUIMin");
    expect(existsSync(old)).toBe(false);
    expect(r.notes).toContain("Removed Motif's kept build of an app not drawn in the last 14 days (Old).");
    expect(r.notes).toContain(
      `Motif keeps this app's build in ${join(cache, "DerivedData")} (3.0 MB), so later runs are quicker. It removes a build that goes 14 days without a run, and keeps those of the 3 apps drawn most recently.`,
    );
    expect(existsSync(join(cache, "last-used"))).toBe(true);
  });

  test("a screen that stops the app fails alone; the others are drawn in a new launch; RTL without the language says so", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    let launch = 0;
    const { promise } = await fakeShoot(root, { screens: ["Settings"], routes: [], rtl: "he" }, home, (options, path) => {
      if (launch++ > 0) return drawsAll(options, path);
      writeFileSync(path, JSON.stringify({ shots: [], previews: [], notes: [], current: { screen: "SettingsScreen.swift:20", file: options.shots[0]!.file } }));
      return { code: 65, stdout: "SwiftUICore/EnvironmentObject.swift:93: Fatal error: No ObservableObject of type Session found.\n", stderr: "", timedOut: false };
    });
    const r = await promise;
    expect(r.routes[0]).toMatchObject({ route: "Settings", status: 0 });
    expect(r.routes[0]!.error).toStartWith("The preview SettingsScreen.swift:20 stopped the app: Fatal error: No ObservableObject of type Session found. Give the preview what the screen needs");
    expect(r.notes).toContain("This app doesn't offer he (its string catalogues and .lproj folders have no he strings), so its RTL screenshots show its default strings, laid out right to left.");
  });

  test("a root view stopped by a second FirebaseApp.configure() in the App's init gets the hint that names the init", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    let launch = 0;
    const { promise } = await fakeShoot(root, { screens: ["Settings"] }, home, (options, path) => {
      if (launch++ > 0) return drawsAll(options, path);
      const first = options.shots.find((s) => s.screen === "/")!;
      writeFileSync(path, JSON.stringify({ shots: [], previews: [], notes: [], current: { screen: "/", file: first.file } }));
      // What xcodebuild printed on the Mac mini: XCTest catches the exception in the harness's test, which ends the launch.
      const caught = "/x/work/MotifShots/MotifShotApp.swift:26: error: -[MotifShots.MotifShotTests testShots] : Default app has already been configured. (com.firebase.core)";
      return { code: 65, stdout: `${caught}\n** TEST EXECUTE FAILED **\n`, stderr: "", timedOut: false };
    });
    const r = await promise;
    const home_ = r.routes.find((x) => x.route === "/")!;
    expect(home_).toMatchObject({ status: 0 });
    expect(home_.error).toBe(
      "The app's root view stopped the app: An exception was raised: Default app has already been configured. (com.firebase.core) The App's init runs again for each screenshot of the root, as Motif makes a new App for each, and work in it that can't run twice stops the app. Guard it in the App's init (if FirebaseApp.app() == nil { FirebaseApp.configure() }), or move it to the app's delegate, then run motif shot again.",
    );
    expect(r.routes.find((x) => x.route === "Settings")).toMatchObject({ status: 200 });
  });
});

// ---- Through motif shot ----

const ctx = (flags: Record<string, string | string[] | boolean> = {}) => ({ positionals: [], flags });

function shotDeps(answer?: (o: NativeShotOptions) => RouteResult[]): { deps: ShotDeps; calls: NativeShotOptions[] } {
  const calls: NativeShotOptions[] = [];
  const never = () => {
    throw new Error("a SwiftUI app needs no browser or dev server");
  };
  return {
    calls,
    deps: {
      findBrowser: never, devCommand: never, startDevServer: never, serveStatic: never, capture: never, compare: async () => [], today: () => "2026-10-21", which: () => null,
      doctor: () => machine(),
      shoot: async (o) => {
        calls.push(o);
        const routes = answer?.(o) ?? [...o.routes, ...o.screens].map((route) => ({ route, url: route, status: 200, shots: [join(o.outDir, `${route === "/" ? "index" : "x"}.mobile.png`)] }));
        for (const s of routes.flatMap((r) => r.shots)) {
          mkdirSync(dirname(s), { recursive: true });
          if (!existsSync(s)) writeFileSync(s, "png");
        }
        return { routes, issues: [], notes: [] };
      },
    },
  };
}

describe("motif shot on a SwiftUI app", () => {
  test("takes / and every #Preview at the four native sizes, with SwiftUI's time limit and Swift states", async () => {
    const root = xcodeProject({ "design/tokens.json": JSON.stringify(partnerTokens()), "design/states/opened.swift": STATE });
    const { deps, calls } = shotDeps();
    const r = await runShot(root, ctx({ variant: "all", rtl: "ar", state: "design/states/opened.swift" }), deps);
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    const o = calls[0]!;
    expect([o.routes, o.screens, o.variants, o.rtl]).toEqual([["/"], ["ContentView-1", "HomeScreen-1", "Settings"], ["partner"], "ar"]);
    expect(o.states.map((s) => s.name)).toEqual(["opened"]);
    // 4 screens × 4 sizes × 2 schemes × 2 variants × 2 directions × 2 (with the state), at 5 s each, on top of 600 s.
    expect(o.timeoutMs).toBe(swiftUITimeLimit(256));
    expect(r.text).toContain("of 4 screens (three phone sizes and a tablet, light and dark, right to left in ar, 2 design variants)");
  });

  test("a browser script as a state, and a state without motifState, are refused before anything runs", async () => {
    const root = xcodeProject({ "design/states/a.js": "1", "design/states/b.swift": "func other() {}\n" });
    const { deps, calls } = shotDeps();
    const js = await runShot(root, ctx({ state: "design/states/a.js" }), deps);
    expect(js.text).toContain("--state: a.js is a browser script; a SwiftUI app's states are Swift files, like design/states/a.swift.");
    const b = await runShot(root, ctx({ state: "design/states/b.swift" }), deps);
    expect(b.text).toContain("--state: b.swift must define @MainActor func motifState(_ app: MotifHarness) async throws");
    expect(calls).toEqual([]);
  });

  test("a screen with shots that weren't drawn says how many, without saying the screenshots show it", async () => {
    const root = xcodeProject();
    const { deps } = shotDeps((o) => {
      const shots = [join(o.outDir, "settings.mobile.png")];
      mkdirSync(o.outDir, { recursive: true });
      writeFileSync(shots[0]!, "png");
      return [{ route: "Settings", url: "Settings", status: 200, shots, missing: 1, pageErrors: ["design/states/Setup.swift failed: no dark today"] }];
    });
    const r = await runShot(root, ctx({ screen: "Settings", sizes: "390" }), deps);
    expect(r.text).toContain("Settings  ✗ 1 of its 2 screenshots weren't drawn: design/states/Setup.swift failed: no dark today");
    expect(r.text).not.toContain("the screenshots show what it looked like");
  });

  test("a variant drawn exactly like the default gets SwiftUI's hint", async () => {
    const root = xcodeProject({ "design/tokens.json": JSON.stringify(partnerTokens()) });
    const { deps } = shotDeps((o) => {
      const shots = ["index.mobile.png", "index+partner.mobile.png"].map((f) => join(o.outDir, f));
      mkdirSync(o.outDir, { recursive: true });
      for (const s of shots) writeFileSync(s, "same");
      return [{ route: "/", url: "/", status: 200, shots }];
    });
    const r = await runShot(root, ctx({ variant: "all", sizes: "390" }), deps);
    expect(r.text).toContain(
      "The partner variant looks the same as the default on every screen: the app may not switch variants the way Motif sets them (.motifTheme(variant:), or design/states/Setup.swift for an app that switches its own palette).",
    );
  });
});

// ---- macOS apps (plan 2H, Task 9) ----

/** A project whose app is a copy of swiftui-mac (Xcode 16's macOS App template), in a folder with a space and an "&". */
function macProject(files: Record<string, string> = {}): string {
  const root = join(tempDir("motif-shot-swiftui-mac-"), "my mac app & co");
  cpSync(join(FIXTURES, "swiftui-mac"), root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

/** swiftui-mac's project made multiplatform, as Xcode's Multiplatform App template has it: one target for iPhone, iPad and Mac. */
function multiplatformPbx(): string {
  return readFileSync(join(FIXTURES, "swiftui-mac/SwiftUIMac.xcodeproj/project.pbxproj"), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/(\t+)(INFOPLIST_FILE = [^;]+;)/g, '$1$2\n$1IPHONEOS_DEPLOYMENT_TARGET = 17.0;\n$1SDKROOT = auto;\n$1SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";\n$1TARGETED_DEVICE_FAMILY = "1,2";');
}

describe("macOS SwiftUI apps", () => {
  const macRoot = macProject();
  const [macApp] = detectApps(macRoot).apps;
  const multiRoot = macProject({ "SwiftUIMac.xcodeproj/project.pbxproj": multiplatformPbx() });
  const [multiApp] = detectApps(multiRoot).apps;

  test("a macOS app is one whose target or project names macOS; a multiplatform target names both", () => {
    // Xcode's macOS template sets SDKROOT on the project only.
    expect(readFileSync(join(macRoot, "SwiftUIMac.xcodeproj/project.pbxproj"), "utf8")).not.toMatch(/INFOPLIST_FILE[^}]*SDKROOT/);
    expect(swiftUIApp(macRoot)?.platforms).toEqual(["macos"]);
    expect(swiftUIApp(multiRoot)?.platforms).toEqual(["ios", "macos"]);
    // An iOS app's project-level SDKROOT still makes it an iOS app.
    expect(swiftUIApp(xcodeRoot)?.platforms).toEqual(["ios"]);
  });

  test("a macOS app, or a multiplatform one, is not refused; a Swift package still is", () => {
    expect(swiftUIShotRefusal(macRoot, macApp!, machine())).toBeNull();
    // A macOS app needs no simulator.
    expect(swiftUIShotRefusal(macRoot, macApp!, machine({ simulator: false }))).toBeNull();
    expect(swiftUIShotRefusal(multiRoot, multiApp!, machine())).toBeNull();
    const pkg = makeProject({
      "Package.swift": '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Desk", platforms: [.macOS(.v14)], targets: [.executableTarget(name: "Desk")])\n',
      "Sources/Desk/DeskApp.swift": 'import SwiftUI\n@main struct DeskApp: App { var body: some Scene { WindowGroup { Text("x") } } }\n',
    });
    const [pkgApp] = detectApps(pkg).apps;
    expect(swiftUIShotRefusal(pkg, pkgApp!, machine())?.error).toBe("needs-xcode-project");
  });

  test("a macOS app's sizes are windows: 1440×900 and a compact 900×700 by default, both at 2×", () => {
    expect(MAC_WINDOWS).toEqual([
      { name: "desktop", width: 1440, height: 900, scale: 2, mobile: false },
      { name: "desktop", file: "desktop-900", width: 900, height: 700, scale: 2, mobile: false },
    ]);
    expect(SWIFTUI.shotSizes?.(macRoot, macApp!, undefined)).toEqual({ viewports: MAC_WINDOWS });
    expect(swiftUIShotSizes(macRoot, macApp!, "1440")).toEqual({ viewports: [MAC_WINDOWS[0]!] });
    expect(swiftUIShotSizes(macRoot, macApp!, "900")).toEqual({ viewports: [MAC_WINDOWS[1]!] });
    expect(swiftUIShotSizes(macRoot, macApp!, "desktop")).toEqual({ viewports: [MAC_WINDOWS[0]!] });
    expect(swiftUIShotSizes(macRoot, macApp!, "900, 1440")).toEqual({ viewports: MAC_WINDOWS });
  });

  test("a macOS app refuses a phone's size, or any other width, plainly, with the sizes it has", () => {
    const refusal = (w: string) =>
      `--sizes: "${w}" isn't one of a macOS app's sizes. SwiftUIMac is built for macOS only, so its screens are drawn in windows: 1440 (1440×900) and 900 (900×700), like --sizes 1440,900.`;
    for (const given of ["390", "phones", "tablet", "1280"]) expect(swiftUIShotSizes(macRoot, macApp!, given)).toEqual({ error: refusal(given) });
    expect(swiftUIShotSizes(macRoot, macApp!, "1440,390")).toEqual({ error: refusal("390") });
  });

  test("a multiplatform app is drawn on iOS unless --sizes asks only for windows; both at once is refused", () => {
    expect(swiftUIShotSizes(multiRoot, multiApp!, undefined)).toBeNull();
    expect(swiftUIShotSizes(multiRoot, multiApp!, "390")).toEqual({ viewports: [NATIVE_VIEWPORTS[1]!] });
    expect(swiftUIShotSizes(multiRoot, multiApp!, "phones")).toEqual({ viewports: NATIVE_VIEWPORTS.slice(0, 3) });
    expect(swiftUIShotSizes(multiRoot, multiApp!, "1440,900")).toEqual({ viewports: MAC_WINDOWS });
    expect(swiftUIShotSizes(multiRoot, multiApp!, "desktop")).toEqual({ viewports: [MAC_WINDOWS[0]!] });
    expect(swiftUIShotSizes(multiRoot, multiApp!, "390,1440")).toEqual({
      error:
        "--sizes: SwiftUIMac runs on iPhone and on the Mac, and Motif draws one of them a run: phone and tablet sizes (360, 390, 430, 768) in the iOS simulator, windows (1440, 900) on the Mac. Run motif shot once for each, like --sizes 390 and --sizes 1440.",
    });
    expect(swiftUIShotSizes(multiRoot, multiApp!, "1024")).toEqual({
      error: "--sizes: \"1024\" isn't one of the sizes. Use widths (360, 390, 430, 768, 1440, 900) or names (phones, mobile, tablet, desktop), like --sizes 390,1440.",
    });
    // An iOS app keeps the native sizes, its desktop size included.
    expect(swiftUIShotSizes(xcodeRoot, xcodeApp!, undefined)).toBeNull();
    expect(swiftUIShotSizes(xcodeRoot, xcodeApp!, "1440")).toBeNull();
    expect(swiftUIPlatform(swiftUIApp(xcodeRoot)!, [NATIVE_DESKTOP])).toBe("ios");
    expect(swiftUIPlatform(swiftUIApp(multiRoot)!, MAC_WINDOWS)).toBe("macos");
    expect(swiftUIPlatform(swiftUIApp(multiRoot)!, [NATIVE_VIEWPORTS[1]!])).toBe("ios");
    expect(swiftUIPlatform(swiftUIApp(macRoot)!, MAC_WINDOWS)).toBe("macos");
  });

  test("a macOS app's shots: windows at 2× with no safe area, named desktop and desktop-900", () => {
    const opts = phoneOpts({ root: macRoot, app: macApp!, viewports: MAC_WINDOWS, rtl: "ar", variants: ["partner"] });
    const targets = swiftUITargets(opts, discoverSwiftUIScreens(macRoot).previews);
    const shots = planSwiftUIShots(opts, targets, { variants: true }, "default", "macos");
    expect(shots[0]).toEqual({
      target: "/", screen: "/", file: "index.desktop.png", width: 1440, height: 900, scale: 2, dark: false, locale: "en_US", rtl: false, variant: "default", variantId: "default",
    });
    expect(shots.map((s) => s.file)).toContain("index+partner.desktop-900.rtl.dark.png");
    expect(shots.find((s) => s.file === "index.desktop-900.png")).toMatchObject({ width: 900, height: 700, scale: 2 });
    expect(shots.every((s) => s.insets === undefined)).toBe(true);
  });

  test("SWIFTUI.shoot draws a macOS app on the Mac: no simulator, the macOS destination, and only the build kept", async () => {
    const root = macProject({
      "design/tokens.json": JSON.stringify(partnerTokens()),
      "design/states/opened.swift": STATE,
      "SwiftUIMac/Design/MotifTheme.swift": "// Generated by Motif\nenum MotifTheme { @MainActor static var debugVariantOverride: MotifVariant? }\n",
    });
    const home = tempDir("motif-swiftui-home-");
    const progress: string[] = [];
    const states = [{ name: "opened", script: STATE, file: join(root, "design/states/opened.swift") }];
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS, states, progress: (l) => progress.push(l) }, home);
    const r = await promise;
    const cache = swiftUICacheDir(home, root, "SwiftUIMac");

    // Not one simctl call: no simulator is listed, made, booted or deleted.
    expect(fake.calls.filter((c) => c[0] === "xcrun")).toEqual([]);
    expect(fake.removed).toEqual([]);
    // xcodebuild's settings, build and test, and in between the built app's id read back (plutil).
    expect(fake.calls.map((c) => `${c[0]} ${c[1]}`)).toEqual(["xcodebuild -showBuildSettings", "xcodebuild build-for-testing", "plutil -extract", "xcodebuild test-without-building"]);
    const settings = fake.calls[0]!;
    expect(settings[settings.indexOf("-destination") + 1]).toBe("generic/platform=macOS");
    const build = fake.calls[1]!;
    const test = fake.calls[3]!;
    expect(build.slice(2)).toEqual(test.slice(2));
    expect(test.slice(0, 10)).toEqual([
      "xcodebuild", "test-without-building", "-project", join(cache, "copy", "SwiftUIMac.xcodeproj"), "-scheme", "MotifShots", "-configuration", "Debug", "-destination", "platform=macOS",
    ]);
    expect(test[test.indexOf("-derivedDataPath") + 1]).toBe(join(cache, "DerivedData-macos"));
    expect(test).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(fake.options!.shots.map((s) => [s.file, s.scale, s.width])).toEqual([
      ["index.desktop.png", 2, 1440],
      ["index@opened.desktop.png", 2, 1440],
      ["index.desktop.dark.png", 2, 1440],
      ["index@opened.desktop.dark.png", 2, 1440],
      ["index.desktop-900.png", 2, 900],
      ["index@opened.desktop-900.png", 2, 900],
      ["index.desktop-900.dark.png", 2, 900],
      ["index@opened.desktop-900.dark.png", 2, 900],
    ]);
    expect(fake.sources["MotifState_opened.swift"]).toContain("@testable import SwiftUIMac\n");

    // Drawn; the copy and the work folder are gone, the build is kept (none was made by the stand-in).
    expect(r.routes.map((x) => [x.route, x.status, x.shots.length])).toEqual([["/", 200, 8]]);
    expect(readdirSync(cache).sort()).toEqual(["last-used"]);
    expect(fake.hooks).toEqual([]);
    expect(progress).toEqual([SWIFTUI_FIRST_RUN_MAC]);
    expect(r.notes).toEqual([SWIFTUI_FIRST_RUN_MAC]);
  });

  test("a multiplatform app drawn at window sizes goes to the Mac; at phone sizes, to the simulator", async () => {
    const home = tempDir("motif-swiftui-home-");
    const mac = await fakeShoot(multiRoot, { viewports: [MAC_WINDOWS[0]!] }, home);
    await mac.promise;
    expect(mac.fake.calls.filter((c) => c[0] === "xcrun")).toEqual([]);
    expect(mac.fake.calls.find((c) => c[1] === "test-without-building")).toContain("platform=macOS");
    const phone = await fakeShoot(multiRoot, {}, home);
    await phone.promise;
    expect(phone.fake.calls.some((c) => c.join(" ").startsWith("xcrun simctl create"))).toBe(true);
    expect(phone.fake.calls.find((c) => c[1] === "test-without-building")).toContain(`id=${UDID}`);
  });

  test("a macOS build that fails says so for the Mac, and the copy and the work folder are still removed", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home, drawsAll, {
      code: 65, stdout: "/x/ContentView.swift:3:5: error: cannot find 'Foo' in scope\n** TEST BUILD FAILED **", stderr: "", timedOut: false,
    });
    await expect(promise).rejects.toThrow(
      "The app didn't build with Motif's harness:\n/x/ContentView.swift:3:5: error: cannot find 'Foo' in scope\nCheck that the app builds for My Mac in Xcode, then run motif shot again.",
    );
    expect(readdirSync(swiftUICacheDir(home, root, "SwiftUIMac")).sort()).toEqual(["last-used"]);
    expect(fake.hooks).toEqual([]);
  });

  test("motif shot on a macOS app draws its windows; --sizes with a phone's width is refused before anything runs", async () => {
    const root = macProject({ "design/tokens.json": JSON.stringify(partnerTokens()) });
    const { deps, calls } = shotDeps((o) => {
      const shots = o.viewports.map((v) => join(o.outDir, `index.${v.file ?? v.name}.png`));
      return [{ route: "/", url: "/", status: 200, shots }];
    });
    const r = await runShot(root, ctx({ routes: "/" }), deps);
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(calls[0]!.viewports).toEqual(MAC_WINDOWS);
    expect(r.text).toContain("of 1 screen (a 1440×900 and a 900×700 window, light and dark)");
    // Its sizes are its own: no note that --sizes left anything out.
    expect(r.text).not.toContain("--sizes left out");
    const one = await runShot(root, ctx({ routes: "/", sizes: "900" }), deps);
    expect(calls[1]!.viewports).toEqual([MAC_WINDOWS[1]!]);
    expect(one.exitCode).toBe(0);
    const phone = await runShot(root, ctx({ sizes: "390" }), deps);
    expect(phone.exitCode).toBe(2);
    expect(phone.text).toContain("--sizes: \"390\" isn't one of a macOS app's sizes.");
    expect(calls).toHaveLength(2);
  });
});

// ---- macOS apps, fix round 1 (plan 2H, Task 9) ----

describe("a macOS run is isolated from the developer's own app (Task 9, fix round 1)", () => {
  const HOST = "dev.motif.SwiftUIMac.motif-shots";

  test("the host has its own bundle id and home: the copy's app target is renamed, and the test's home is in the work folder", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home);
    await promise;
    const cache = swiftUICacheDir(home, root, "SwiftUIMac");
    // Only the app target's configurations: the harness's own target keeps its own id.
    expect(fake.pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g)!.sort()).toEqual([
      `PRODUCT_BUNDLE_IDENTIFIER = "${HOST}";`,
      `PRODUCT_BUNDLE_IDENTIFIER = "${HOST}";`,
      "PRODUCT_BUNDLE_IDENTIFIER = dev.motif.shots;",
      "PRODUCT_BUNDLE_IDENTIFIER = dev.motif.shots;",
    ]);
    expect(readFileSync(join(root, "SwiftUIMac.xcodeproj/project.pbxproj"), "utf8")).not.toContain(HOST);
    expect(fake.env!.TEST_RUNNER_CFFIXED_USER_HOME).toBe(join(cache, "work", "home"));
    expect(fake.env!.TEST_RUNNER_HOME).toBe(join(cache, "work", "home"));
  });

  test("its defaults domain and saved state are removed before and after the run, and only its own", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home);
    const prefs = join(fake.host.home, "Library", "Preferences");
    mkdirSync(prefs, { recursive: true });
    writeFileSync(join(prefs, `${HOST}.plist`), "left by an earlier run");
    writeFileSync(join(prefs, "dev.motif.SwiftUIMac.plist"), "the developer's own");
    const saved = join(fake.host.home, "Library", "Saved Application State", `${HOST}.savedState`);
    mkdirSync(saved, { recursive: true });
    await promise;
    const deletes = fake.host.spawned.filter((c) => c[0] === "defaults");
    expect(deletes).toEqual([["defaults", "delete", HOST], ["defaults", "delete", HOST]]);
    expect(existsSync(join(prefs, `${HOST}.plist`))).toBe(false);
    expect(existsSync(saved)).toBe(false);
    expect(readFileSync(join(prefs, "dev.motif.SwiftUIMac.plist"), "utf8")).toBe("the developer's own");
  });

  test("a host a killed run left is stopped first, and the run's own host after it, by its path in Motif's build; nothing else", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const products = join(swiftUICacheDir(home, root, "SwiftUIMac"), "DerivedData-macos", "Build", "Products", "Debug");
    const ps = [
      `  4242 ${products}/SwiftUIMac.app/Contents/MacOS/SwiftUIMac -NSTreatUnknownArgumentsAsOpen NO`,
      "  4343 /Applications/SwiftUIMac.app/Contents/MacOS/SwiftUIMac",
      `  4444 /bin/zsh -c echo ${products}/SwiftUIMac.app/Contents/MacOS/SwiftUIMac`,
      "  4545 /usr/bin/xcodebuild test-without-building",
    ].join("\n");
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home, drawsAll, ok("** TEST BUILD SUCCEEDED **"), ps);
    const r = await promise;
    // Once before the run (a leftover), once after it: only the process running Motif's own build of the app.
    expect(fake.host.killed).toEqual([4242, 4242]);
    expect(fake.host.spawned.filter((c) => c[0] === "ps").length).toBe(2);
    expect(r.notes).toContain("Stopped a copy of the app that an earlier motif shot left running when it was stopped.");
  });

  test("interrupted (Ctrl+C, a termination signal, the time limit): the exit hook stops the host and removes its domain", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const products = join(swiftUICacheDir(home, root, "SwiftUIMac"), "DerivedData-macos", "Build", "Products", "Debug");
    let during: { killed: number[]; deletes: number } = { killed: [], deletes: 0 };
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home, (options, path, f) => {
      // The host is running while xcodebuild waits; Motif exits: what its exit hooks do.
      f.host.ps = `  5151 ${products}/SwiftUIMac.app/Contents/MacOS/SwiftUIMac`;
      for (const hook of [...f.hooks]) hook();
      during = { killed: [...f.host.killed], deletes: f.host.spawned.filter((c) => c[0] === "defaults").length };
      return drawsAll(options, path);
    });
    // The exit hooks removed the work folder too, so the launch can't write its result: the run fails, as it would.
    await promise.catch(() => {});
    expect(during.killed).toEqual([5151]);
    expect(during.deletes).toBe(2);
    expect(fake.hooks).toEqual([]);
  });

  test("an iOS run neither looks for a host nor touches defaults", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const { promise, fake } = await fakeShoot(root, {}, home);
    await promise;
    expect(fake.host.spawned).toEqual([]);
    expect(fake.pbx).not.toContain(".motif-shots");
    expect(fake.env!.TEST_RUNNER_CFFIXED_USER_HOME).toBeUndefined();
  });

  test("stopMacHost: the processes under Motif's build, the suffixed domain; never a domain without the suffix", () => {
    const derived = join(tempDir("motif-swiftui-dd-"), "DerivedData-macos");
    const userHome = tempDir("motif-swiftui-user-");
    const spawned: string[][] = [];
    const killed: number[] = [];
    const io = {
      spawn: (cmd: string[]) => {
        spawned.push(cmd);
        const app = (dd: string) => join(dd, "Build", "Products", "Debug", "A.app", "Contents", "MacOS", "A");
        return { exitCode: 0, stdout: cmd[0] === "ps" ? `  7 ${app(derived)}\n  8 ${app(`${derived}-other`)}` : "" };
      },
      kill: (pid: number) => void killed.push(pid),
      home: userHome,
    };
    expect(stopMacHost(derived, "dev.example.A.motif-shots", io)).toEqual({ killed: 1 });
    expect(killed).toEqual([7]);
    expect(spawned.filter((c) => c[0] === "defaults")).toEqual([["defaults", "delete", "dev.example.A.motif-shots"]]);
    spawned.length = 0;
    stopMacHost(derived, "dev.example.A", io);
    expect(spawned.filter((c) => c[0] === "defaults")).toEqual([]);
    expect(MAC_HOST_SUFFIX).toBe(".motif-shots");
  });

  test("stopMacHost: the window state macOS saves in the user's own temporary folder (DARWIN_USER_TEMP_DIR/<id>.savedState) goes too, only the host's, whatever TMPDIR says (Task 15 and its final review)", () => {
    const derived = join(tempDir("motif-swiftui-dd-"), "DerivedData-macos");
    // macOS's per-user temporary folder, which getconf gives (with a trailing slash), not $TMPDIR (an eval runner sets its own).
    const tmp = tempDir("motif-swiftui-tmp-");
    expect(resolve(tmp)).not.toBe(resolve(tmpdir()));
    for (const id of ["dev.example.A.motif-shots", "dev.example.A"]) {
      mkdirSync(join(tmp, `${id}.savedState`), { recursive: true });
      writeFileSync(join(tmp, `${id}.savedState`, "windows.plist"), "state");
    }
    const asked: string[][] = [];
    const spawn = (cmd: string[]) => {
      asked.push(cmd);
      return { exitCode: 0, stdout: cmd.join(" ") === "getconf DARWIN_USER_TEMP_DIR" ? `${tmp}/\n` : "" };
    };
    const io = { spawn, kill: () => {}, home: tempDir("motif-swiftui-user-") };
    stopMacHost(derived, "dev.example.A", io);
    expect(readdirSync(tmp).sort()).toEqual(["dev.example.A.motif-shots.savedState", "dev.example.A.savedState"]);
    stopMacHost(derived, "dev.example.A.motif-shots", io);
    expect(readdirSync(tmp)).toEqual(["dev.example.A.savedState"]);
    expect(asked).toContainEqual(["getconf", "DARWIN_USER_TEMP_DIR"]);
  });

  test("stopMacHost: a host running from the build's real path (/private/var/… for /var/…) is stopped too (fix round 2)", () => {
    const derived = join(tempDir("motif-swiftui-dd-"), "DerivedData-macos");
    const real = `${derived}-real`;
    const killed: number[] = [];
    const io = {
      spawn: (cmd: string[]) => ({ exitCode: 0, stdout: cmd[0] === "ps" ? `  9 ${join(real, "Build", "Products", "Debug", "A.app", "Contents", "MacOS", "A")}` : "" }),
      kill: (pid: number) => void killed.push(pid),
      realpath: (p: string) => (p === derived ? real : p),
    };
    expect(stopMacHost(derived, undefined, io)).toEqual({ killed: 1 });
    expect(killed).toEqual([9]);
  });
});

describe("macOS runs, fix round 1 (Task 9): sizes, notes and the refusal", () => {
  test("a multiplatform app drawn on the Mac needs no iOS simulator; drawn on iOS it does", () => {
    const root = macProject({ "SwiftUIMac.xcodeproj/project.pbxproj": multiplatformPbx() });
    const [app] = detectApps(root).apps;
    const noSimulator = machine({ simulator: false });
    expect(swiftUIShotRefusal(root, app!, noSimulator, MAC_WINDOWS)).toBeNull();
    expect(SWIFTUI.shotRefusal?.(root, app!, () => null, noSimulator, [MAC_WINDOWS[0]!])).toBeNull();
    expect(swiftUIShotRefusal(root, app!, noSimulator)?.error).toBe("needs-xcode");
    expect(swiftUIShotRefusal(root, app!, noSimulator, [NATIVE_VIEWPORTS[1]!])?.error).toBe("needs-xcode");
  });

  test("a multiplatform app's iOS and macOS builds are kept apart: each platform's first run says so", async () => {
    const root = macProject({ "SwiftUIMac.xcodeproj/project.pbxproj": multiplatformPbx() });
    const home = tempDir("motif-swiftui-home-");
    const cache = swiftUICacheDir(home, root, "SwiftUIMac");
    mkdirSync(join(cache, "DerivedData"), { recursive: true });
    const mac = await fakeShoot(root, { viewports: MAC_WINDOWS }, home);
    const r = await mac.promise;
    expect(r.notes[0]).toBe(SWIFTUI_FIRST_RUN_MAC);
    const test = mac.fake.calls.find((c) => c[1] === "test-without-building")!;
    expect(test[test.indexOf("-derivedDataPath") + 1]).toBe(join(cache, "DerivedData-macos"));
  });

  test("the capabilities note says where the app runs: the simulator, or this Mac", async () => {
    const entitlements = '<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.application-groups</key><array/></dict></plist>';
    const pbx = readFileSync(join(FIXTURES, "swiftui-mac/SwiftUIMac.xcodeproj/project.pbxproj"), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/(\t+)(INFOPLIST_FILE = [^;]+;)/g, "$1$2\n$1CODE_SIGN_ENTITLEMENTS = SwiftUIMac/SwiftUIMac.entitlements;");
    const root = macProject({ "SwiftUIMac.xcodeproj/project.pbxproj": pbx, "SwiftUIMac/SwiftUIMac.entitlements": entitlements });
    const home = tempDir("motif-swiftui-home-");
    const { promise } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home);
    const r = await promise;
    expect(r.notes).toContain(
      "Motif builds the app for this Mac without signing it, so it runs without what its entitlements give (App Groups): screens that use it may fail or show nothing. Fake what they need in design/states/Setup.swift.",
    );
  });

  test("MOTIF_SWIFTUI_APPKIT=1 asks the harness to draw with AppKit alone (to test that way)", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const saved = process.env.MOTIF_SWIFTUI_APPKIT;
    process.env.MOTIF_SWIFTUI_APPKIT = "1";
    try {
      const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home);
      await promise;
      expect(fake.options!.appKitOnly).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.MOTIF_SWIFTUI_APPKIT;
      else process.env.MOTIF_SWIFTUI_APPKIT = saved;
    }
    const plain = await fakeShoot(macProject(), { viewports: MAC_WINDOWS }, tempDir("motif-swiftui-home-"));
    await plain.promise;
    expect(plain.fake.options!.appKitOnly).toBeUndefined();
  });

  test("a macOS run's sizes read as windows", () => {
    expect(describeSizes(MAC_WINDOWS)).toBe("a 1440×900 and a 900×700 window");
    expect(describeSizes([MAC_WINDOWS[0]!])).toBe("a 1440×900 window");
    // The other stacks' desktop size reads as before.
    expect(describeSizes([NATIVE_DESKTOP])).toBe("1440 px wide");
  });
});

// ---- macOS apps, fix round 2 (plan 2H, Task 9) ----

/** A target of the project's own, with its bundle id as written (an extension the app embeds, say). */
function withTarget(pbx: string, n: number, name: string, id: string): string {
  const hex = (k: number) => `B4000000000000000000${(n * 16 + k).toString(16).toUpperCase().padStart(4, "0")}`;
  const config = (k: number, config: string) =>
    `\t\t${hex(k)} = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = ${id};\n\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";\n\t\t\t};\n\t\t\tname = ${config};\n\t\t};\n`;
  const objects =
    `\t\t${hex(1)} = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${hex(2)};\n\t\t\tbuildPhases = (\n\t\t\t);\n\t\t\tname = ${name};\n\t\t\tproductType = "com.apple.product-type.app-extension";\n\t\t};\n` +
    `\t\t${hex(2)} = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${hex(3)},\n\t\t\t\t${hex(4)},\n\t\t\t);\n\t\t};\n` +
    config(3, "Debug") +
    config(4, "Release");
  const end = pbx.lastIndexOf("\t};\n\trootObject");
  return `${pbx.slice(0, end)}${objects}${pbx.slice(end)}`;
}

const MAC_PBX = () => readFileSync(join(FIXTURES, "swiftui-mac/SwiftUIMac.xcodeproj/project.pbxproj"), "utf8").replace(/\r\n/g, "\n");
const ids = (pbx: string): string[] => [...(pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g) ?? [])].sort();

describe("a macOS run's bundle ids, and what it leaves (Task 9, fix round 2)", () => {
  const HOST = "dev.motif.SwiftUIMac.motif-shots";

  test("the app's id and every id written under it (an embedded extension's) get the suffix; others are left alone", () => {
    let pbx = withTarget(MAC_PBX(), 1, "SwiftUIMacWidget", "dev.motif.SwiftUIMac.SwiftUIMacWidget");
    pbx = withTarget(pbx, 2, "Elsewhere", "com.example.other");
    pbx = withTarget(pbx, 3, "FromXcconfig", '"$(BASE_ID).share"');
    pbx = withTarget(pbx, 4, "LookAlike", "dev.motif.SwiftUIMacintosh");
    expect(ids(withHostIds(pbx, "SwiftUIMac", "dev.motif.SwiftUIMac", HOST))).toEqual(
      [
        `PRODUCT_BUNDLE_IDENTIFIER = "${HOST}";`,
        `PRODUCT_BUNDLE_IDENTIFIER = "${HOST}";`,
        `PRODUCT_BUNDLE_IDENTIFIER = "${HOST}.SwiftUIMacWidget";`,
        `PRODUCT_BUNDLE_IDENTIFIER = "${HOST}.SwiftUIMacWidget";`,
        "PRODUCT_BUNDLE_IDENTIFIER = com.example.other;",
        "PRODUCT_BUNDLE_IDENTIFIER = com.example.other;",
        'PRODUCT_BUNDLE_IDENTIFIER = "$(BASE_ID).share";',
        'PRODUCT_BUNDLE_IDENTIFIER = "$(BASE_ID).share";',
        "PRODUCT_BUNDLE_IDENTIFIER = dev.motif.SwiftUIMacintosh;",
        "PRODUCT_BUNDLE_IDENTIFIER = dev.motif.SwiftUIMacintosh;",
      ].sort(),
    );
  });

  test("SWIFTUI.shoot gives an embedded extension's id the suffix in the copy", async () => {
    const root = macProject({ "SwiftUIMac.xcodeproj/project.pbxproj": withTarget(MAC_PBX(), 1, "SwiftUIMacWidget", "dev.motif.SwiftUIMac.SwiftUIMacWidget") });
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, tempDir("motif-swiftui-home-"));
    await promise;
    expect(fake.pbx).toContain(`PRODUCT_BUNDLE_IDENTIFIER = "${HOST}.SwiftUIMacWidget";`);
    expect(fake.pbx).not.toContain("PRODUCT_BUNDLE_IDENTIFIER = dev.motif.SwiftUIMac.SwiftUIMacWidget;");
  });

  test("an embedded binary whose id Motif couldn't change stops the build at Xcode's check: refused, with what to do", async () => {
    const root = macProject();
    const failed: ExecResult = {
      code: 65,
      stdout:
        "error: Embedded binary's bundle identifier is not prefixed with the parent app's bundle identifier.\n** TEST BUILD FAILED **\n\nThe following build commands failed:\n\tValidateEmbeddedBinary /x/SwiftUIMac.app/Contents/PlugIns/Share.appex (in target 'SwiftUIMac' from project 'SwiftUIMac')\n",
      stderr: "",
      timedOut: false,
    };
    const { promise } = await fakeShoot(root, { viewports: MAC_WINDOWS }, tempDir("motif-swiftui-home-"), drawsAll, failed);
    await expect(promise).rejects.toThrow(
      `Motif gives SwiftUIMac a bundle id of its own for its screenshots (${HOST}), and it embeds Share.appex, whose bundle id Motif couldn't change to match: its id isn't written in its target as one that starts with dev.motif.SwiftUIMac. (it may come from an xcconfig or a variable). Write it that way in the extension target's build settings (Product Bundle Identifier), then run motif shot again.`,
    );
  });

  test("a built app whose bundle id isn't Motif's own is never launched: refused, with what to do", async () => {
    const root = macProject();
    const home = tempDir("motif-swiftui-home-");
    const { promise, fake } = await fakeShoot(root, { viewports: MAC_WINDOWS }, home, drawsAll, ok("** TEST BUILD SUCCEEDED **"), "", "dev.motif.SwiftUIMac");
    await expect(promise).rejects.toThrow(
      `Motif couldn't give SwiftUIMac a bundle id of its own for its screenshots: the app it built is dev.motif.SwiftUIMac, not ${HOST}, so its screens would read and write your own SwiftUIMac's settings, and Motif stopped before launching it. Set the SwiftUIMac target's Product Bundle Identifier in its build settings, and its Info.plist's CFBundleIdentifier to $(PRODUCT_BUNDLE_IDENTIFIER), then run motif shot again.`,
    );
    expect(fake.calls.some((c) => c[1] === "test-without-building")).toBe(false);
    const read = fake.calls.find((c) => c[0] === "plutil")!;
    expect(read.slice(0, 6)).toEqual(["plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-"]);
    expect(read[6]).toBe(join(swiftUICacheDir(home, root, "SwiftUIMac"), "DerivedData-macos", "Build", "Products", "Debug", "SwiftUIMac.app", "Contents", "Info.plist"));
  });

  test("an iOS run of an app with a macOS build stops the host and removes the domain a killed macOS run left", async () => {
    const root = macProject({ "SwiftUIMac.xcodeproj/project.pbxproj": multiplatformPbx() });
    const home = tempDir("motif-swiftui-home-");
    const macBuild = join(swiftUICacheDir(home, root, "SwiftUIMac"), "DerivedData-macos", "Build", "Products", "Debug");
    mkdirSync(join(macBuild, "SwiftUIMac.app", "Contents"), { recursive: true });
    const ps = `  6161 ${join(macBuild, "SwiftUIMac.app", "Contents", "MacOS", "SwiftUIMac")}`;
    const { promise, fake } = await fakeShoot(root, {}, home, drawsAll, ok("** TEST BUILD SUCCEEDED **"), ps);
    const r = await promise;
    expect(fake.host.killed).toEqual([6161]);
    expect(fake.host.spawned.filter((c) => c[0] === "defaults")).toEqual([["defaults", "delete", HOST]]);
    expect(r.notes).toContain("Stopped a copy of the app that an earlier motif shot left running when it was stopped.");
    // An iOS run of an app with no macOS build looks for none.
    const plain = await fakeShoot(xcodeProject(), {}, tempDir("motif-swiftui-home-"));
    await plain.promise;
    expect(plain.fake.host.spawned).toEqual([]);
  });

  test("a --sizes the app can't be drawn at is said before any refusal, as before", async () => {
    const root = macProject();
    const { deps, calls } = shotDeps();
    deps.doctor = () => machine({ platform: "win32" });
    const r = await runShot(root, ctx({ sizes: "390" }), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("--sizes: \"390\" isn't one of a macOS app's sizes.");
    expect(calls).toEqual([]);
  });
});

// ---- The audit (plan 2H, Task 10) ----

describe("--audit on a SwiftUI app (Task 10)", () => {
  const previews = discoverSwiftUIScreens(xcodeRoot).previews;

  test("each shot gets the other native stacks' checks in the simulator; on the Mac, no tap targets and motion in the 1440 window", () => {
    const opts = phoneOpts({ viewports: [NATIVE_VIEWPORTS[0]!, NATIVE_VIEWPORTS[1]!, NATIVE_VIEWPORTS[3]!], variants: ["partner"], audit: true });
    const shots = planSwiftUIShots(opts, swiftUITargets(opts, previews), { variants: true }, "default");
    const checks = (file: string) => {
      const s = shots.find((x) => x.file === file)!;
      return [s.checks, s.reduceMotion ?? false, s.seen];
    };
    expect(checks("index.mobile-360.png")).toEqual([["contrast", "names", "targets"], false, { size: "mobile-360" }]);
    expect(checks("index.mobile.png")).toEqual([["contrast", "names", "targets", "motion"], true, { size: "mobile" }]);
    expect(checks("index+partner.mobile.png")).toEqual([["contrast", "names", "targets", "motion"], true, { size: "mobile", variant: "partner" }]);
    expect(checks("index.mobile.dark.png")).toEqual([["contrast", "names"], false, { size: "mobile" }]);
    expect(checks("index.tablet.png")).toEqual([["contrast", "names", "targets"], false, { size: "tablet" }]);
    // Without --audit, nothing changes.
    expect(planSwiftUIShots(phoneOpts(), swiftUITargets(phoneOpts(), previews), null, "").every((s) => !("checks" in s) && !("seen" in s) && !("reduceMotion" in s))).toBe(true);

    const mac = phoneOpts({ root: macProject(), viewports: MAC_WINDOWS, audit: true });
    const macShots = planSwiftUIShots(mac, swiftUITargets(mac, []), null, "", "macos");
    expect(macShots.map((s) => [s.file, s.checks, s.reduceMotion ?? false])).toEqual([
      ["index.desktop.png", ["contrast", "names", "motion"], true],
      ["index.desktop.dark.png", ["contrast", "names"], false],
      ["index.desktop-900.png", ["contrast", "names"], false],
      ["index.desktop-900.dark.png", ["contrast", "names"], false],
    ]);
    expect(swiftUIAuditChecks(MAC_WINDOWS[0]!, "light", "macos")).toEqual(["contrast", "names", "motion"]);
    expect(SWIFTUI.motionSize).toEqual({ width: 390, text: "the 390 pt phone size" });
  });

  test("what the harness's audit found becomes issues named by where they were seen, with SwiftUI's fixes; its failure is the screen's", () => {
    const outDir = tempDir("motif-swiftui-audit-");
    const opts = phoneOpts({ outDir, viewports: [NATIVE_VIEWPORTS[1]!], routes: ["/"], screens: ["Settings"], variants: ["partner"], rtl: "ar", states: [{ name: "typed", script: STATE }], audit: true });
    const targets = swiftUITargets(opts, previews);
    const shots = planSwiftUIShots(opts, targets, { variants: true }, "default");
    for (const s of shots) writeFileSync(join(outDir, s.file), "png");
    const caption = { rule: "color-contrast" as const, selector: 'Text("Prices include tax")', label: "Prices include tax", kind: "element" as const, ratio: 1.83, expected: 4.5, fg: "#bfbfbf", bg: "#ffffff" };
    const unnamed = { rule: "name" as const, selector: "Button(gearshape)", label: "", kind: "button" as const, nth: 2, of: 2 };
    const small = { rule: "target-mobile" as const, selector: "Button(gearshape)", label: "gearshape", kind: "button" as const, width: 30, height: 30 };
    const pulse = { rule: "motion" as const, selector: "View(40×40)", label: "", kind: "element" as const };
    const icon = { rule: "color-contrast" as const, selector: "Button(bell.badge)", label: "", kind: "icon" as const, icon: "bell.badge", ratio: 2.1, expected: 3, fg: "#c7c7cc", bg: "#ffffff" };
    const throws = `State "typed": There's nothing called "Code" on the screen.`;
    const accessibility = "Motif couldn't turn on accessibility automation in this simulator runtime (iOS 18.5), so it couldn't read the screen's text, names and controls.";
    const found: SwiftUIShotResult[] = [
          { file: "index.mobile.png", issues: [caption, unnamed, small, pulse] },
          { file: "index@typed.mobile.png", issues: [caption], stateError: throws },
          { file: "index+partner.mobile.rtl.png", issues: [icon], unjudged: ["Over the photo", "Over the photo"] },
          { file: "index.mobile.dark.png", issues: [] },
          { file: "settings.mobile.png", auditError: accessibility },
          { file: "settings.mobile.dark.png", auditError: "a later one" },
    ];
    // The other shots found nothing.
    for (const s of shots) if (!found.some((f) => f.file === s.file)) found.push({ file: s.file, issues: [] });
    const mapped = mapSwiftUIResult(targets, shots, outDir, { timedOut: false, notes: [], result: { previews: [], notes: [], shots: found } }, 60_000);
    const [root, settings] = mapped.routes;
    expect(root).toMatchObject({ route: "/", status: 200, pageErrors: [throws] });
    expect(root!.auditError).toBeUndefined();
    expect(settings).toMatchObject({ route: "Settings", status: 200, auditError: accessibility });
    expect(mapped.notes).toContain("Contrast on / wasn't judged for 1 text with no one colour behind it (a picture or a gradient): check it by eye.");

    const shot = (f: string) => join(outDir, f);
    const at = { route: "/", viewport: "mobile" as const, size: "mobile", scheme: "light" as const };
    expect(mapped.issues).toEqual([
      { ...caption, ...at, shot: shot("index.mobile.png"), fix: SWIFTUI_FIXES["color-contrast"] },
      { rule: "name", selector: "Button(gearshape)[2]", label: "", kind: "button", ...at, shot: shot("index.mobile.png"), fix: SWIFTUI_FIXES.name },
      { ...small, ...at, shot: shot("index.mobile.png"), fix: SWIFTUI_FIXES["target-mobile"] },
      { ...pulse, ...at, shot: shot("index.mobile.png"), fix: SWIFTUI_FIXES.motion },
      { ...caption, ...at, shot: shot("index@typed.mobile.png"), state: "typed", fix: SWIFTUI_FIXES["color-contrast"] },
      { ...icon, ...at, shot: shot("index+partner.mobile.rtl.png"), variant: "partner", rtl: true, fix: SWIFTUI_FIXES.icon },
    ]);

    // As audit.json has them: the caption once, with its state's place; the fixes in SwiftUI's terms.
    const findings = toFindings(mapped.issues);
    expect(findings.map((f) => [f.severity, f.summary])).toEqual([
      ["critical", 'Text "Prices include tax" is hard to read in light mode (1.83:1, needs 4.5:1).'],
      ["critical", "An icon (bell.badge) is hard to see in light mode in the partner variant (2.1:1, needs 3:1)."],
      ["major", "The button has no name a screen reader can say."],
      ["major", "An element keeps moving when the viewer asks for reduced motion."],
      ["minor", 'The "gearshape" button is 30×30 px on a phone; 44×44 px is easier to tap.'],
    ]);
    expect(findings[0]!.locations).toEqual([{ screen: "/", selector: 'Text("Prices include tax")', viewport: "mobile", scheme: "light", state: "typed" }]);
    expect(findings[1]!.location).toMatchObject({ variant: "partner", rtl: true });
    expect(findings[2]!.fix).toContain('.accessibilityLabel("…")');
    expect(findings[3]!.fix).toContain("@Environment(\\.accessibilityReduceMotion)");
    expect(findings[4]!.fix).toContain(".frame(minWidth: 44, minHeight: 44)");
    expect(findings[4]!.fix).toContain(".contentShape(Rectangle())");
    // Contrast in SwiftUI's terms too: the tokens, and a system colour replaced with .foregroundStyle or .tint.
    expect(findings[0]!.fix).toContain("design/tokens.json");
    expect(findings[0]!.fix).toContain(".foregroundStyle(…)");
    expect(findings[0]!.fix).toContain(".tint(…)");
    expect(findings[1]!.fix).toContain(".tint(…) on its button");
  });

  test("what the system draws itself (MapKit's Legal link, UIKit's split-view dividers) is left out of the audit, with one note (Task 15 follow-up)", () => {
    const outDir = tempDir("motif-swiftui-audit-");
    const opts = phoneOpts({ outDir, viewports: [NATIVE_VIEWPORTS[1]!], routes: ["/"], audit: true });
    const targets = swiftUITargets(opts, previews);
    const shots = planSwiftUIShots(opts, targets, null, "");
    for (const s of shots) writeFileSync(join(outDir, s.file), "png");
    const caption = { rule: "color-contrast" as const, selector: 'Text("Prices include tax")', label: "Prices include tax", kind: "element" as const, ratio: 1.83, expected: 4.5, fg: "#bfbfbf", bg: "#ffffff" };
    const legal = { rule: "color-contrast" as const, selector: 'Link("Legal")', label: "Legal", kind: "link" as const, ratio: 2.59, expected: 4.5, fg: "#7c7a76", bg: "#f9f5ed", systemPart: "MapKit" };
    const divider = { rule: "name" as const, selector: "Slider", label: "", kind: "element" as const, systemPart: "UIKit's split view" };
    const marker = { rule: "motion" as const, selector: 'View("Uyuni Salt Flat")', label: "Uyuni Salt Flat", kind: "element" as const, systemPart: "MapKit" };
    const found: SwiftUIShotResult[] = shots.map((s) => ({ file: s.file, issues: s.file === "index.mobile.png" ? [caption, legal, divider, marker] : [] }));
    const mapped = mapSwiftUIResult(targets, shots, outDir, { timedOut: false, notes: [], result: { previews: [], notes: [], shots: found } }, 60_000);
    expect(mapped.issues.map((i) => i.selector)).toEqual(['Text("Prices include tax")']);
    expect(mapped.issues[0]).not.toHaveProperty("systemPart");
    expect(mapped.notes).toContain("The audit left out what the system draws itself (MapKit, UIKit's split view), which the app can't change.");
  });

  test("each kind of target gets its own fix, and a motion finding drawn with SwiftUI's environment alone says what it couldn't turn on (fix round 1)", () => {
    const outDir = tempDir("motif-swiftui-audit-");
    const ios = phoneOpts({ outDir, viewports: [NATIVE_VIEWPORTS[1]!], audit: true });
    const iosTargets = swiftUITargets(ios, previews);
    const iosShots = planSwiftUIShots(ios, iosTargets, null, "");
    for (const s of iosShots) writeFileSync(join(outDir, s.file), "png");
    const link = { rule: "target-mobile" as const, selector: 'Link("Site")', label: "Site", kind: "link" as const, width: 29, height: 22 };
    const button = { rule: "target-mobile" as const, selector: 'Button("Greet")', label: "Greet", kind: "button" as const, width: 43, height: 22 };
    const pulse = { rule: "motion" as const, selector: "View(40×40)", label: "", kind: "element" as const, reducedBy: "environment" as const };
    const result = (shots: PlannedShot[], issues: SwiftUIShotResult["issues"]) => ({
      timedOut: false, notes: [], result: { previews: [], notes: [], shots: shots.map((s, n) => ({ file: s.file, issues: n === 0 ? issues : [] })) },
    });
    const mapped = mapSwiftUIResult(iosTargets, iosShots, outDir, result(iosShots, [link, button, pulse]), 60_000);
    expect(mapped.issues.map((i) => [i.selector, i.fix])).toEqual([
      ['Link("Site")', SWIFTUI_FIXES["target-link"]],
      ['Button("Greet")', SWIFTUI_FIXES["target-mobile"]],
      ["View(40×40)", `${SWIFTUI_FIXES.motion} ${ENVIRONMENT_ONLY.ios}`],
    ]);
    expect("reducedBy" in mapped.issues[2]!).toBe(false);
    expect(SWIFTUI_FIXES["target-link"]).toContain("inside a sentence of Text needs none");
    expect(SWIFTUI_FIXES["target-mobile"]).toContain(".buttonStyle(.bordered)");
    expect(SWIFTUI_FIXES["target-mobile"]).toContain(".onTapGesture");
    expect(ENVIRONMENT_ONLY.ios).toContain("UIAccessibility.isReduceMotionEnabled");

    // On the Mac, NSWorkspace's setting is named.
    const mac = phoneOpts({ root: macProject(), outDir, viewports: [MAC_WINDOWS[0]!], audit: true });
    const macTargets = swiftUITargets(mac, []);
    const macShots = planSwiftUIShots(mac, macTargets, null, "", "macos");
    for (const s of macShots) writeFileSync(join(outDir, s.file), "png");
    const onMac = mapSwiftUIResult(macTargets, macShots, outDir, result(macShots, [pulse, { ...pulse, reducedBy: undefined, selector: "View(80×80)" }]), 60_000);
    expect(onMac.issues.map((i) => [i.viewport, i.fix])).toEqual([
      ["desktop", `${SWIFTUI_FIXES.motion} ${ENVIRONMENT_ONLY.macos}`],
      ["desktop", SWIFTUI_FIXES.motion],
    ]);
    expect(ENVIRONMENT_ONLY.macos).toContain("NSWorkspace");
  });

  test("SWIFTUI.shoot passes the checks to the harness (not where findings are seen), returns what it found, and no longer says it can't audit", async () => {
    const root = xcodeProject();
    const finds = (options: { shots: SwiftUIShot[] }, path: string): ExecResult => {
      const outDir = (options as unknown as { outDir: string }).outDir;
      mkdirSync(outDir, { recursive: true });
      for (const s of options.shots) writeFileSync(join(outDir, s.file), "png");
      const issue = { rule: "name", selector: "Button(gearshape)", label: "", kind: "button" };
      writeFileSync(path, JSON.stringify({ shots: options.shots.map((s) => ({ file: s.file, ms: 200, issues: s.checks?.includes("names") ? [issue] : [] })), previews: [], notes: [], done: true }));
      return ok("** TEST SUCCEEDED **");
    };
    const { promise, fake } = await fakeShoot(root, { audit: true }, tempDir("motif-swiftui-home-"), finds);
    const r = await promise;
    expect(fake.options!.shots.map((s) => [s.file, s.checks, s.reduceMotion])).toEqual([
      ["index.mobile.png", ["contrast", "names", "targets", "motion"], true],
      ["index.mobile.dark.png", ["contrast", "names"], undefined],
    ]);
    expect(fake.options!.shots.some((s) => "seen" in s)).toBe(false);
    expect(fake.sources["MotifAudit.swift"]).toContain("enum MotifAudit");
    expect(r.routes[0]!.auditError).toBeUndefined();
    expect(r.issues.map((i) => [i.route, i.rule, i.selector, i.scheme])).toEqual([
      ["/", "name", "Button(gearshape)", "light"],
      ["/", "name", "Button(gearshape)", "dark"],
    ]);
  });

  test("on the Mac, a run without the 1440 window says the reduced-motion check didn't run", async () => {
    const { promise } = await fakeShoot(macProject(), { viewports: [MAC_WINDOWS[1]!], audit: true }, tempDir("motif-swiftui-home-"));
    expect((await promise).notes).toContain("The reduced-motion check runs in the 1440×900 window, which --sizes left out.");
    const all = await fakeShoot(macProject(), { viewports: MAC_WINDOWS, audit: true }, tempDir("motif-swiftui-home-"));
    expect((await all.promise).notes.join("\n")).not.toContain("reduced-motion check");
  });

  test("a clean audit of a Mac app says only what was checked: no tap targets on the Mac (final review)", async () => {
    // The real shoot says a macOS run checked no tap targets, and an iOS run did.
    const mac = await fakeShoot(macProject(), { viewports: MAC_WINDOWS, audit: true }, tempDir("motif-swiftui-home-"));
    expect((await mac.promise).noTapTargets).toBe(true);
    const ios = await fakeShoot(xcodeProject(), { audit: true }, tempDir("motif-swiftui-home-"));
    expect((await ios.promise).noTapTargets).toBeUndefined();
    // The command's line follows it.
    const { deps } = shotDeps();
    const shoot = deps.shoot!;
    deps.shoot = async (o) => ({ ...(await shoot(o)), noTapTargets: true });
    const r = await runShot(macProject(), ctx({ sizes: "1440", audit: true, routes: "/" }), deps);
    expect(r.text).toContain("✓ Audit: no contrast or reduced-motion problems found, and no controls without a name (design/shots/audit.json).");
    expect(r.text).not.toContain("tap-target");
  });

  test("motif shot --audit on an iOS app at --sizes 360 says where the reduced-motion check runs", async () => {
    const root = xcodeProject();
    const { deps } = shotDeps();
    const r = await runShot(root, ctx({ sizes: "360", audit: true, routes: "/" }), deps);
    expect(r.text).toContain("The reduced-motion check runs at the 390 pt phone size, which --sizes left out.");
    expect(r.text).toContain("✓ Audit: no contrast, tap-target or reduced-motion problems found");
  });
});
