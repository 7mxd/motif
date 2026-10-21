import { afterAll, describe, expect, test } from "bun:test";
import { TS_HEADER } from "../src/generate/header";
import { discoverSwiftUIScreens, previewSlug, swiftUIRunName, swiftUIScreenProblem } from "../src/stacks/swiftui/screens";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const MANIFEST =
  '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Rafiq", platforms: [.iOS(.v17)], targets: [.executableTarget(name: "Rafiq"), .testTarget(name: "RafiqTests", dependencies: ["Rafiq"])])\n';
const APP = "import SwiftUI\n\n@main\nstruct RafiqApp: App {\n    var body: some Scene { WindowGroup { HomeScreen() } }\n}\n";

const app = (files: Record<string, string>) => makeProject({ "Package.swift": MANIFEST, "Sources/Rafiq/RafiqApp.swift": APP, ...files });

describe("previewSlug", () => {
  test("names become file-name slugs the way Compose's do", () => {
    expect(previewSlug("Settings")).toBe("settings");
    expect(previewSlug("Home Screen")).toBe("home-screen");
    expect(previewSlug("HomeScreen-1")).toBe("home-screen-1");
    expect(previewSlug("Sign in / dark")).toBe("sign-in-dark");
    expect(previewSlug("HTTPServer")).toBe("http-server");
    expect(previewSlug("مرحبا")).toBe("");
  });
});

describe("discoverSwiftUIScreens", () => {
  test("#Preview in each form: named, unnamed, with traits, with trailing arguments", () => {
    const dir = app({
      "Sources/Rafiq/HomeScreen.swift": [
        "import SwiftUI",
        'struct HomeScreen: View { var body: some View { Text("Hi") } }',
        "",
        "#Preview {",
        "    HomeScreen()",
        "}",
        "",
        '#Preview("Home, dark") {',
        "    HomeScreen()",
        "}",
        "",
        '#Preview("Wide", traits: .landscapeLeft) { HomeScreen() }',
        "#Preview(traits: .landscapeLeft) {",
        "    @Previewable @State var on = true",
        "    HomeScreen()",
        "}",
        "#Preview { HomeScreen() }",
      ].join("\n"),
    });
    const s = discoverSwiftUIScreens(dir);
    expect(s.routes).toEqual(["/"]);
    expect(s.skipped).toEqual([]);
    expect(s.previews.map((p) => [p.name, p.slug, p.screen, p.file, p.line])).toEqual([
      ["HomeScreen-1", "home-screen-1", "HomeScreen.swift:4", "Sources/Rafiq/HomeScreen.swift", 4],
      ["Home, dark", "home-dark", "HomeScreen.swift:8", "Sources/Rafiq/HomeScreen.swift", 8],
      ["Wide", "wide", "HomeScreen.swift:12", "Sources/Rafiq/HomeScreen.swift", 12],
      ["HomeScreen-2", "home-screen-2", "HomeScreen.swift:13", "Sources/Rafiq/HomeScreen.swift", 13],
      ["HomeScreen-3", "home-screen-3", "HomeScreen.swift:17", "Sources/Rafiq/HomeScreen.swift", 17],
    ]);
  });

  test("a #Preview in a comment or a string is no screen", () => {
    const dir = app({
      "Sources/Rafiq/A.swift": [
        "// #Preview { Old() }",
        '/* #Preview("Gone") { Old() } */',
        'let a = "#Preview { Nope() }"',
        'let b = """',
        "#Preview { Nope() }",
        '"""',
        'let c = #"#Preview { Raw() }"#',
        '#Preview("Real") { Text("x") }',
      ].join("\n"),
    });
    expect(discoverSwiftUIScreens(dir).previews.map((p) => [p.name, p.line])).toEqual([["Real", 8]]);
  });

  test("a title with an interpolation can't be read, so the preview is unnamed", () => {
    const dir = app({ "Sources/Rafiq/B.swift": '#Preview("Count \\(3)") { Text("x") }\n#Preview("Fine") { Text("x") }\n' });
    expect(discoverSwiftUIScreens(dir).previews.map((p) => p.name)).toEqual(["B-1", "Fine"]);
  });

  test("PreviewProvider types are listed as not drawn, with a reason", () => {
    const dir = app({
      "Sources/Rafiq/Settings.swift": [
        "struct SettingsScreen_Previews: PreviewProvider {",
        "    static var previews: some View { SettingsScreen() }",
        "}",
        'struct Other: View, PreviewProvider { static var previews: some View { Text("x") } }',
        "// struct Dead_Previews: PreviewProvider {",
        '#Preview("Fine") { Text("x") }',
      ].join("\n"),
    });
    const s = discoverSwiftUIScreens(dir);
    expect(s.previews.map((p) => p.name)).toEqual(["Fine"]);
    expect(s.skippedPreviews.map((p) => [p.name, p.slug, p.line])).toEqual([
      ["SettingsScreen", "settings-screen", 1],
      ["Other", "other", 4],
    ]);
    expect(s.skippedPreviews[0]!.reason).toBe("It is a PreviewProvider, which Motif doesn't draw yet. Put its view in a #Preview block to screenshot it.");
    expect(s.notes?.[0]).toBe(
      "SettingsScreen and Other are PreviewProviders, which Motif doesn't draw yet, so they were left out. Put their views in #Preview blocks to screenshot them.",
    );
  });

  test("only the app target's own sources: not tests, Motif's theme, the harness or build folders", () => {
    const dir = app({
      "Sources/Rafiq/Screens/Profile.swift": '#Preview("Profile") { Text("x") }',
      "Sources/Rafiq/Design/MotifTheme.swift": `${TS_HEADER}\n#Preview("Theme") { Text("x") }`,
      "Sources/Rafiq/MotifShots/Shots.swift": '#Preview("Harness") { Text("x") }',
      "Sources/Rafiq/.motif/x/Copy.swift": '#Preview("Copy") { Text("x") }',
      "Tests/RafiqTests/T.swift": '#Preview("Test") { Text("x") }',
      "Sources/Other/Other.swift": '#Preview("Other target") { Text("x") }',
      ".build/checkouts/Dep.swift": '#Preview("Dep") { Text("x") }',
    });
    expect(discoverSwiftUIScreens(dir).previews.map((p) => [p.name, p.screen])).toEqual([["Profile", "Profile.swift:1"]]);
  });

  test("slugs stay unique: two previews called Settings", () => {
    const dir = app({
      "Sources/Rafiq/A.swift": '#Preview("Settings") { Text("a") }',
      "Sources/Rafiq/B.swift": '#Preview("Settings") { Text("b") }',
    });
    const s = discoverSwiftUIScreens(dir);
    expect(s.previews.map((p) => p.slug)).toEqual(["settings", "settings-2"]);
    expect(s.previews.map((p) => swiftUIRunName(s.previews, p))).toEqual(["A.swift:1", "B.swift:1"]);
  });

  test("a folder that is no SwiftUI app has only its root", () => {
    expect(discoverSwiftUIScreens(makeProject({ "x.txt": "" }))).toEqual({ routes: ["/"], skipped: [], previews: [], skippedPreviews: [] });
  });
});

describe("swiftUIScreenProblem", () => {
  const dir = app({
    "Sources/Rafiq/A.swift": '#Preview("Settings") { Text("a") }\nstruct S_Previews: PreviewProvider { static var previews: some View { Text("s") } }',
    "Sources/Rafiq/B.swift": '#Preview("Settings") { Text("b") }\n#Preview("Home") { Text("h") }',
  });
  test("a name, or File.swift:line, is fine", () => {
    expect(swiftUIScreenProblem(dir, ["Home", "A.swift:1"])).toBeNull();
    expect(swiftUIScreenProblem(dir, [])).toBeNull();
  });
  test("a name two previews share asks for File.swift:line", () => {
    expect(swiftUIScreenProblem(dir, ["Settings"])).toBe("--screen Settings is the name of 2 previews (A.swift:1 and B.swift:1). Use File.swift:line for one.");
  });
  test("a PreviewProvider is said to be not drawn yet", () => {
    expect(swiftUIScreenProblem(dir, ["S"])).toBe(
      "--screen S is a PreviewProvider, which Motif doesn't draw yet. Previews found: Settings, Settings and Home. Put its view in a #Preview block, or name one of those.",
    );
  });
  test("an unknown name lists the previews", () => {
    expect(swiftUIScreenProblem(dir, ["Nope"])).toBe("--screen Nope isn't a #Preview Motif found in this app. Previews found: Settings, Settings and Home. Name one of those.");
    expect(swiftUIScreenProblem(makeProject({ x: "" }), ["Nope"])).toBe("--screen Nope isn't a #Preview Motif found in this app. No #Preview blocks were found.");
  });
});
