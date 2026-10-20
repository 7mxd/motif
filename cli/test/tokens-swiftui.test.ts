import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { TS_HEADER } from "../src/generate/header";
import { FIXTURES, twoVariantTokens, validTokens, withCompanion } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

// Motif's own font cache is an empty folder here, whatever this computer has downloaded.
const ownHome = process.env.MOTIF_HOME;
beforeAll(() => {
  process.env.MOTIF_HOME = tempDir("motif-home-");
});
afterAll(() => {
  if (ownHome === undefined) delete process.env.MOTIF_HOME;
  else process.env.MOTIF_HOME = ownHome;
  cleanupTempDirs();
});

const fixture = (path: string) => readFileSync(join(FIXTURES, "swiftui-min", path), "utf8");
const PBXPROJ = "SwiftUIMin.xcodeproj/project.pbxproj";
const THEME = "SwiftUIMin/Design/MotifTheme.swift";
const APP_FILE = "SwiftUIMin/SwiftUIMinApp.swift";
const TOKENS = JSON.stringify(validTokens());

/** The fixture's project as Xcode 16's App template makes it: SwiftUIMin is a synchronized folder. */
const swiftApp = (files: Record<string, string> = {}) =>
  makeProject({
    [PBXPROJ]: fixture(PBXPROJ),
    [APP_FILE]: fixture(APP_FILE),
    "SwiftUIMin/ContentView.swift": fixture("SwiftUIMin/ContentView.swift"),
    "design/tokens.json": TOKENS,
    ...files,
  });

/** The same project as Xcode 15 made it: groups and file references, no synchronized folder. */
const classicPbxproj = () =>
  fixture(PBXPROJ)
    .replace(/\/\* Begin PBXFileSystemSynchronizedRootGroup section \*\/[\s\S]*?\/\* End PBXFileSystemSynchronizedRootGroup section \*\/\r?\n/, "")
    .replace(/\t\t\tfileSystemSynchronizedGroups = \([\s\S]*?\);\r?\n/, "");

const ctx = { positionals: [] };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => (r.data.notes as string[]).join("\n");
const USAGE =
  "apply .motifTheme() to your root view in SwiftUIMinApp.swift (WindowGroup { ContentView().motifTheme() }), then read colours in your views with @Environment(\\.motifColors) private var colors, type with .motifFont(.body) and sizes with MotifSpace.";
const WIRING = `Next: ${USAGE} Xcode already builds ${THEME} into the SwiftUIMin target: SwiftUIMin is a synchronized folder.`;

/** Tokens whose body font is a font the project bundles, with these files. */
const brandTokens = (files: string[]) => {
  const t = validTokens();
  t.$extensions["dev.motif"].fonts = [{ family: "Brand Sans", files: files.map((path) => ({ path, weight: /Bold/.test(path) ? 700 : 400, style: "normal" })) }];
  t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
  return JSON.stringify(t);
};

describe("motif tokens for a SwiftUI app", () => {
  test("writes MotifTheme.swift in the target's Design folder, and says how to apply it", async () => {
    const root = swiftApp();
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({ [THEME]: "created", "design/motif.json": "created" });
    const swift = readFileSync(join(root, THEME), "utf8");
    expect(swift.startsWith(`${TS_HEADER}\n\nimport SwiftUI\n`)).toBe(true);
    expect(swift).toContain('Font.custom("Inter", size: 16, relativeTo: .callout)');
    expect(notes(r)).toContain(WIRING);
    expect(notes(r)).not.toContain("coming soon");
    expect(notes(r).match(/Next: /g)).toHaveLength(1);
    // The app's own files are left as they were, and nothing is written for other stacks.
    expect(readFileSync(join(root, APP_FILE), "utf8")).toBe(fixture(APP_FILE));
    expect(readFileSync(join(root, PBXPROJ), "utf8")).toBe(fixture(PBXPROJ));
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "swiftui" }]);
  });

  test("running again changes nothing, and once the app applies .motifTheme( the wiring note goes", async () => {
    const root = swiftApp();
    await runTokens(root, ctx);
    const app = join(root, APP_FILE);
    // A call in a comment doesn't count.
    writeFileSync(app, fixture(APP_FILE).replace("ContentView()", "ContentView() // .motifTheme()"));
    expect(notes(await runTokens(root, ctx))).toContain(WIRING);
    writeFileSync(app, fixture(APP_FILE).replace("ContentView()", "ContentView().motifTheme()"));
    const r = await runTokens(root, ctx);
    expect(new Set(Object.values(statuses(r)))).toEqual(new Set(["unchanged"]));
    expect(r.text).toContain("up to date");
    expect(notes(r)).not.toContain("Next: ");
  });

  test("a hand-written MotifTheme.swift is never overwritten", async () => {
    const root = swiftApp({ [THEME]: "import SwiftUI\n// mine\n" });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(statuses(r)[THEME]).toBe("protected");
    expect(readFileSync(join(root, THEME), "utf8")).toBe("import SwiftUI\n// mine\n");
    expect(notes(r)).not.toContain("Next: ");
  });

  test("a Google family: the note says to bundle its files, as SwiftUI has no Google Fonts package", async () => {
    const r = await runTokens(swiftApp(), ctx);
    expect(notes(r)).toContain(
      "SwiftUI has no Google Fonts package, so the theme draws Inter in the system font until the app bundles it. " +
        "Download its .ttf files from fonts.google.com, add them to the guide's font files (the fonts list in design/tokens.json) and run motif tokens again: " +
        "Motif then copies them into SwiftUIMin/Fonts and gives the lines that register them.",
    );
    expect(notes(r)).not.toContain("Motif already has");
  });

  test("a Google family Motif has downloaded for screenshots: the note says where its files are", async () => {
    const home = tempDir("motif-home-");
    mkdirSync(join(home, "fonts/google/Inter"), { recursive: true });
    writeFileSync(join(home, "fonts/google/Inter/files.json"), JSON.stringify([{ weight: 400, italic: false, file: "regular.ttf" }]));
    writeFileSync(join(home, "fonts/google/Inter/regular.ttf"), "ttf");
    const before = process.env.MOTIF_HOME;
    process.env.MOTIF_HOME = home;
    try {
      const r = await runTokens(swiftApp(), ctx);
      expect(notes(r)).toContain(`Motif already has Inter's .ttf files from its screenshots, in ${join(home, "fonts/google/Inter")}: copy them into design/fonts/ to use them.`);
    } finally {
      process.env.MOTIF_HOME = before;
    }
  });

  test("a project font's files are copied into the target's Fonts folder, with the UIAppFonts lines", async () => {
    const root = swiftApp({
      "design/tokens.json": brandTokens(["design/fonts/Brand-Regular.ttf", "design/fonts/Brand-Bold.otf"]),
      "design/fonts/Brand-Regular.ttf": "regular",
      "design/fonts/Brand-Bold.otf": "bold",
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)["SwiftUIMin/Fonts/Brand-Regular.ttf"]).toBe("created");
    expect(statuses(r)["SwiftUIMin/Fonts/Brand-Bold.otf"]).toBe("created");
    expect(readFileSync(join(root, "SwiftUIMin/Fonts/Brand-Bold.otf"), "utf8")).toBe("bold");
    expect(readFileSync(join(root, THEME), "utf8")).toContain('Font.custom("Brand Sans", size: 16, relativeTo: .callout).weight(.regular)');
    expect(notes(r)).toContain(
      [
        'Register the theme\'s fonts: in Xcode, open the SwiftUIMin target\'s Info tab and add "Fonts provided by application" (UIAppFonts) with these items, or add these lines to its Info.plist:',
        "<key>UIAppFonts</key>",
        "<array>",
        "    <string>Brand-Regular.ttf</string>",
        "    <string>Brand-Bold.otf</string>",
        "</array>",
        "Xcode already copies SwiftUIMin/Fonts into the app: SwiftUIMin is a synchronized folder.",
      ].join("\n"),
    );
    expect(notes(r)).not.toContain("draws Brand Sans");
    expect(statuses(await runTokens(root, ctx))["SwiftUIMin/Fonts/Brand-Bold.otf"]).toBe("unchanged");
  });

  test("font files already in the target are registered where they are, and an Info.plist that lists them gets no note", async () => {
    const root = swiftApp({
      "design/tokens.json": brandTokens(["SwiftUIMin/Resources/Brand-Regular.ttf"]),
      "SwiftUIMin/Resources/Brand-Regular.ttf": "regular",
    });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r)).some((p) => p.includes("/Fonts/"))).toBe(false);
    expect(notes(r)).toContain("    <string>Brand-Regular.ttf</string>");
    writeFileSync(join(root, "SwiftUIMin/Info.plist"), "<plist><dict><key>UIAppFonts</key><array><string>Brand-Regular.ttf</string></array></dict></plist>");
    expect(notes(await runTokens(root, ctx))).not.toContain("UIAppFonts");
  });

  test("a project font with only WOFF2 files gets a note", async () => {
    const root = swiftApp({ "design/tokens.json": brandTokens(["design/fonts/Brand.woff2"]), "design/fonts/Brand.woff2": "woff2" });
    expect(notes(await runTokens(root, ctx))).toContain("Apple's platforms can't use WOFF2: add a .ttf or .otf of Brand Sans to the guide's font files.");
  });

  test("a project without synchronized folders: add the theme file and the Fonts folder to the target", async () => {
    const root = swiftApp({
      [PBXPROJ]: classicPbxproj(),
      "design/tokens.json": brandTokens(["design/fonts/Brand-Regular.ttf"]),
      "design/fonts/Brand-Regular.ttf": "regular",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)[THEME]).toBe("created");
    expect(notes(r)).toContain(`Next: add ${THEME} to the SwiftUIMin target (in Xcode: File › Add Files to "SwiftUIMin"…), then ${USAGE}`);
    expect(notes(r)).toContain('Then add the SwiftUIMin/Fonts folder to the SwiftUIMin target (in Xcode: File › Add Files to "SwiftUIMin"…, with the target ticked).');
  });

  test("a Mac app gets the ATSApplicationFontsPath line", async () => {
    const root = swiftApp({
      // The target's own settings name the platform.
      [PBXPROJ]: fixture(PBXPROJ).replace(/SWIFT_VERSION = 5\.0;/g, "SDKROOT = macosx;\n\t\t\t\tSWIFT_VERSION = 5.0;"),
      "design/tokens.json": brandTokens(["design/fonts/Brand-Regular.ttf"]),
      "design/fonts/Brand-Regular.ttf": "regular",
    });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("<key>ATSApplicationFontsPath</key>\n<string>.</string>");
    expect(notes(r)).not.toContain("UIAppFonts");
  });

  test("a Swift package app: the theme in the target's folder, which the package builds as it is", async () => {
    const root = makeProject({
      "Package.swift":
        '// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: "Desk", platforms: [.macOS(.v14)], targets: [.executableTarget(name: "Desk")])\n',
      "Sources/Desk/DeskApp.swift": 'import SwiftUI\n@main struct DeskApp: App { var body: some Scene { WindowGroup { Text("x") } } }\n',
      "design/tokens.json": brandTokens(["design/fonts/Brand-Regular.ttf"]),
      "design/fonts/Brand-Regular.ttf": "regular",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["Sources/Desk/Design/MotifTheme.swift"]).toBe("created");
    expect(statuses(r)["Sources/Desk/Fonts/Brand-Regular.ttf"]).toBe("created");
    expect(notes(r)).toContain(
      "Next: apply .motifTheme() to your root view in DeskApp.swift (WindowGroup { ContentView().motifTheme() }), then read colours in your views with @Environment(\\.motifColors) private var colors, type with .motifFont(.body) and sizes with MotifSpace. " +
        "Swift Package Manager already builds Sources/Desk/Design/MotifTheme.swift into the Desk target.",
    );
    expect(notes(r)).toContain(
      'A Swift package has no Info.plist for its fonts: add resources: [.copy("Fonts")] to the Desk target in Package.swift, and register each font when the app starts, with CTFontManagerRegisterFontsForURL.',
    );
  });

  test("a package's themeDir outside the target's folder gets a note", async () => {
    const root = makeProject({
      "Package.swift": 'let package = Package(name: "Desk", targets: [.executableTarget(name: "Desk")])\n',
      "Sources/Desk/DeskApp.swift": 'import SwiftUI\n@main struct DeskApp: App { var body: some Scene { WindowGroup { Text("x") } } }\n',
      "design/tokens.json": TOKENS,
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "swiftui", themeDir: "Theme" }], ignore: [] }),
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["Theme/MotifTheme.swift"]).toBe("created");
    expect(notes(r)).toContain(
      "Theme isn't inside the Desk target's folder (Sources/Desk), so Swift Package Manager won't build MotifTheme.swift. Set themeDir in design/motif.json to a folder under Sources/Desk and run motif tokens again.",
    );
  });

  test("with design variants, the wiring note says how to choose one, and the other changes are named", async () => {
    const root = swiftApp({ "design/tokens.json": JSON.stringify(twoVariantTokens()) });
    const r = await runTokens(root, ctx);
    expect(readFileSync(join(root, THEME), "utf8")).toContain("enum MotifVariant: String, CaseIterable, Sendable {\n    case women\n    case men\n}");
    expect(notes(r)).toContain(
      "Your guide has design variants (Women and Men): .motifTheme(variant: .women) chooses one (.women and .men; .women when you pass none). " +
        "To switch at runtime, keep the variant's rawValue in @AppStorage and pass MotifVariant(rawValue: stored) ?? .women to .motifTheme(variant:).",
    );
    expect(notes(r)).toContain("The Men variant also changes corners. SwiftUI theme code gives each variant its own colours only, so it uses the default corners.");
  });

  test("an Arabic companion from Motif's kit is a family to bundle too", async () => {
    const r = await runTokens(swiftApp({ "design/tokens.json": JSON.stringify(withCompanion(validTokens())) }), ctx);
    expect(notes(r)).toContain("so the theme draws Inter, Onest and Readex Pro in the system font until the app bundles them.");
  });
});
