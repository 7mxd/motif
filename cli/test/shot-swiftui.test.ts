import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { DoctorDeps } from "../src/commands/doctor";
import { runShot, type ShotDeps } from "../src/commands/shot";
import { detectApps } from "../src/detect/stacks";
import { NATIVE_VIEWPORTS, type RouteResult } from "../src/shot/capture";
import type { NativeShotOptions } from "../src/stacks/native";
import { SWIFTUI } from "../src/stacks/swiftui";
import { swiftUIDoctor } from "../src/stacks/swiftui/doctor";
import { hooksSource, RESULT_FILE, scriptSource, SOURCES_FOLDER, type Exec, type ExecResult, type SwiftUIHarnessResult, type SwiftUIShot } from "../src/stacks/swiftui/harness";
import {
  appStructName, copyBase, KEEP_BUILDS, KEEP_DAYS, mapSwiftUIResult, offersLanguage, planSwiftUIShots, projectReferences, pruneSwiftUIBuilds, readSwiftUIInputs, screenError, shootSwiftUI, signedCapabilities,
  SWIFTUI_FIRST_RUN, SWIFTUI_VARIANT_HOW, swiftUICacheDir, swiftUIRoutes, swiftUIShotRefusal, swiftUITargets, swiftUITimeLimit, type PlannedShot,
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

  test("an app for macOS only is refused until macOS apps are drawn", () => {
    const pbx = readFileSync(join(xcodeRoot, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8").replace(/(INFOPLIST_FILE = [^;]+;)/g, "$1\n\t\t\t\tSDKROOT = macosx;");
    const root = xcodeProject({ "SwiftUIMin.xcodeproj/project.pbxproj": pbx });
    const [app] = detectApps(root).apps;
    expect(swiftUIShotRefusal(root, app!, machine())).toEqual({
      error: "macos-not-yet",
      text:
        "SwiftUIMin is built for macOS only, and Motif draws SwiftUI screens in the iOS simulator; macOS apps can't be drawn yet. " +
        "If the app can run on iPhone or iPad too, add iPhone to its target's Supported Destinations in Xcode, then run motif shot again.",
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
    const refs = projectReferences(pbx, resolve("/r/apps/ios"), (p) => files[resolve(p)] ?? null);
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

  test("a project that refers to files outside the folder motif runs in is refused before anything runs, with the path", () => {
    const pbx = readFileSync(join(xcodeRoot, "SwiftUIMin.xcodeproj/project.pbxproj"), "utf8").replace(
      /(mainGroup = \w+)/,
      "$1;\n\t\t\tpackageReferences = ( 4D4F54494600AAAAAAAAAAAA )",
    ).replace("/* End PBXProject section */", '/* End PBXProject section */\n\t\t4D4F54494600AAAAAAAAAAAA = {isa = XCLocalSwiftPackageReference; relativePath = "../../Kit"; };');
    const root = xcodeProject({ "SwiftUIMin.xcodeproj/project.pbxproj": pbx });
    const [app] = detectApps(root).apps;
    const kit = resolve(root, "../../Kit");
    expect(swiftUIShotRefusal(root, app!, machine())).toEqual({
      error: "outside-project",
      text:
        `SwiftUIMin's project uses ${kit}, outside the folder motif runs in (${resolve(root)}), and Motif's copy of the app can't take it. ` +
        `Run motif shot from a folder that holds both (${resolve(root, "../..")}), with --app pointing at the app.`,
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

  test("a root view that stops the app for want of what the App gives it says how to give it", () => {
    const error = "The app's root view stopped the app: SwiftData/ModelContext.swift: Fatal error: Set a .modelContext in view's environment to use Query";
    expect(screenError(error, "/")).toBe(
      `${error} Motif draws the root view from the App's WindowGroup on its own, with the environment the App puts on its scene; what the App sets up elsewhere (in its init, or in onAppear) doesn't reach it. Give it inside the WindowGroup (WindowGroup { ContentView().environmentObject(…) }), or set it up in design/states/Setup.swift.`,
    );
    // Any other crash keeps its plain words.
    const other = "The app's root view stopped the app: Fatal error: Index out of range";
    expect(screenError(other, "/")).toBe(other);
  });
});

// ---- The run, with stand-ins for xcodebuild and simctl ----

const UDID = "6863BE3D-AAA8-4177-A1E6-AB1EC415FEF2";
const LEFTOVER = "11111111-2222-3333-4444-555555555555";
const SETTINGS = JSON.stringify([{ target: "SwiftUIMin", buildSettings: { PRODUCT_MODULE_NAME: "SwiftUIMin", FULL_PRODUCT_NAME: "SwiftUIMin.app", EXECUTABLE_NAME: "SwiftUIMin" } }]);
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
  sources: Record<string, string>;
  options: { shots: SwiftUIShot[]; setupFile?: string; stateLimit?: number } | null;
  copyDir: string;
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
) {
  const fake: Fake = { calls: [], removed: [], hooks: [], sources: {}, options: null, copyDir: "" };
  const exec: Exec = async (cmd, o) => {
    fake.calls.push(cmd);
    const c = cmd.join(" ");
    if (c === "xcrun simctl list -j devices") return ok(DEVICES);
    if (cmd[0] === "xcodebuild" && cmd[1] === "-showBuildSettings") {
      fake.copyDir = dirname(cmd[cmd.indexOf("-project") + 1]!);
      return ok(SETTINGS);
    }
    if (c === "xcrun --sdk iphonesimulator --show-sdk-version") return ok("18.5\n");
    if (c.startsWith("xcrun simctl list")) return ok(SIMS);
    if (c.startsWith("xcrun simctl create")) return ok(`${UDID}\n`);
    if (cmd[0] === "xcrun") return ok();
    if (cmd[0] === "xcodebuild" && cmd[1] === "build-for-testing") return build;
    if (cmd[0] === "xcodebuild") {
      const path = o.env!.TEST_RUNNER_MOTIF_SHOT_OPTIONS!;
      const folder = join(dirname(path), SOURCES_FOLDER);
      for (const f of readdirSync(folder)) fake.sources[f] = readFileSync(join(folder, f), "utf8");
      fake.options = JSON.parse(readFileSync(path, "utf8"));
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
        return { code: 0, stderr: "" };
      },
      onExit: (fn) => {
        fake.hooks.push(fn);
        return () => fake.hooks.splice(fake.hooks.indexOf(fn), 1);
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

  test("interrupted (Ctrl+C, a termination signal): the exit hooks delete the simulator and the copy", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const cache = swiftUICacheDir(home, root, "SwiftUIMin");
    let seen: string[] = [];
    const { promise, fake } = await fakeShoot(root, {}, home, (options, path, f) => {
      // Motif exits while xcodebuild runs: what its exit hooks do.
      for (const hook of [...f.hooks]) hook();
      seen = readdirSync(cache).sort();
      return drawsAll(options, path);
    });
    await promise.catch(() => {});
    expect(fake.removed).toContain(UDID);
    expect(seen).toEqual(["last-used"]);
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
    make("Current-1", 0);
    make("Old-2", 20);
    make("OldButRunning-3", 30, process.ppid);
    make("Recent-4", 1);
    make("Recent-5", 2);
    make("Recent-6", 3);
    make("DeadLock-7", 15, 99999999);
    expect([KEEP_DAYS, KEEP_BUILDS]).toEqual([14, 3]);
    const removed = pruneSwiftUIBuilds(dir, join(dir, "Current-1"), now);
    // Unused for 14 days (a lock whose process is gone doesn't save it); then the current app and the running one count
    // toward the three, so of the rest only the one used most recently is kept.
    expect({ old: removed.old.sort(), extra: removed.extra.sort() }).toEqual({ old: ["DeadLock-7", "Old-2"], extra: ["Recent-5", "Recent-6"] });
    expect(readdirSync(dir).sort()).toEqual(["Current-1", "OldButRunning-3", "Recent-4"]);
    expect(pruneSwiftUIBuilds(join(dir, "none"), join(dir, "none", "x"), now)).toEqual({ old: [], extra: [] });
  });

  test("the first run says where the build is kept, how big it is, and when Motif removes it; others it removed are named", async () => {
    const root = xcodeProject();
    const home = tempDir("motif-swiftui-home-");
    const old = join(home, "swiftui", "Old-abc");
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
      "The partner variant looks exactly like the default on every screen: the app may not switch variants the way Motif sets them (.motifTheme(variant:), or design/states/Setup.swift for an app that switches its own palette).",
    );
  });
});
