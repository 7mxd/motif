import { afterAll, describe, expect, test } from "bun:test";
import { detectApps, detectStack } from "../src/detect/stacks";
import { swiftUIApp } from "../src/stacks/swiftui/project";
import { SWIFTUI } from "../src/stacks/swiftui";
import { nativeStack } from "../src/stacks/native";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

interface Target { name: string; sdk?: string; supported?: string; productType?: string; synced?: string }

/**
 * A project file with the given targets in the given order (ids sort the same way), each with its own build settings,
 * as Xcode writes them: target, configuration list, configuration.
 */
function pbxprojOf(targets: Target[]): string {
  const out = ["// !$*UTF8*$!", "{ objects = {"];
  targets.forEach((t, i) => {
    const n = String(i + 1).padStart(2, "0");
    out.push(
      `\tT${n} /* ${t.name} */ = {`,
      "\t\tisa = PBXNativeTarget;",
      `\t\tbuildConfigurationList = L${n} /* Build configuration list for PBXNativeTarget "${t.name}" */;`,
      `\t\tname = ${/[ ()]/.test(t.name) ? `"${t.name}"` : t.name};`,
      ...(t.synced ? [`\t\tfileSystemSynchronizedGroups = (\n\t\t\tG${n} /* ${t.synced} */,\n\t\t);`] : []),
      `\t\tproductType = "${t.productType ?? "com.apple.product-type.application"}";`,
      "\t};",
      `\tL${n} /* Build configuration list */ = {\n\t\tisa = XCConfigurationList;\n\t\tbuildConfigurations = (\n\t\t\tC${n} /* Debug */,\n\t\t);\n\t};`,
      `\tC${n} /* Debug */ = {`,
      "\t\tisa = XCBuildConfiguration;",
      "\t\tbuildSettings = {",
      ...(t.sdk ? [`\t\t\tSDKROOT = ${t.sdk};`] : []),
      ...(t.supported ? [`\t\t\tSUPPORTED_PLATFORMS = "${t.supported}";`] : []),
      '\t\t\tINFOPLIST_KEY_X = "{ not a brace }";',
      "\t\t};",
      "\t\tname = Debug;",
      "\t};",
    );
    if (t.synced) out.push(`\tG${n} /* ${t.synced} */ = {\n\t\tisa = PBXFileSystemSynchronizedRootGroup;\n\t\tpath = ${t.synced};\n\t\tsourceTree = "<group>";\n\t};`);
  });
  out.push("}; }");
  return out.join("\n");
}

/** One app target and its unit-test target. */
function pbxproj(name: string, opts: Omit<Target, "name"> = {}): string {
  return pbxprojOf([{ name, ...opts }, { name: `${name}Tests`, productType: "com.apple.product-type.bundle.unit-test" }]);
}

const view = 'import SwiftUI\n@main struct A: App { var body: some Scene { WindowGroup { Text("x") } } }\n';

describe("SwiftUI apps in Xcode projects", () => {
  test("the Xcode 15 template: the project folder is the app, its target's folder the source root", () => {
    const root = makeProject({
      "Rafiq.xcodeproj/project.pbxproj": pbxproj("Rafiq", { sdk: "iphoneos" }),
      "Rafiq/RafiqApp.swift": view,
      "RafiqTests/RafiqTests.swift": "import XCTest\n",
    });
    expect(detectStack(root)).toBe("swiftui");
    expect(swiftUIApp(root)).toEqual({ kind: "xcodeproj", name: "Rafiq", project: "Rafiq.xcodeproj", platforms: ["ios"], sourceRoot: "Rafiq" });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([[".", "swiftui"]]);
  });

  test("the Xcode 16 template: a synchronized folder is the source root, and a multiplatform target lists its platforms", () => {
    const root = makeProject({
      "Shop.xcodeproj/project.pbxproj": pbxproj("Shop", { sdk: "auto", supported: "iphoneos iphonesimulator macosx xros xrsimulator", synced: "ShopApp" }),
      "ShopApp/ShopApp.swift": view,
    });
    expect(swiftUIApp(root)).toEqual({ kind: "xcodeproj", name: "Shop", project: "Shop.xcodeproj", platforms: ["ios", "macos"], sourceRoot: "ShopApp" });
  });

  test("a Mac app lists macos only", () => {
    const root = makeProject({ "Desk.xcodeproj/project.pbxproj": pbxproj("Desk", { sdk: "macosx" }), "Desk/DeskApp.swift": view });
    expect(swiftUIApp(root)?.platforms).toEqual(["macos"]);
  });

  test("a project with only a framework or test target isn't an app", () => {
    const root = makeProject({
      "Kit.xcodeproj/project.pbxproj": pbxproj("Kit", { productType: "com.apple.product-type.framework" }),
      "Kit/Kit.swift": view,
    });
    expect(swiftUIApp(root)).toBeNull();
    expect(detectStack(root)).toBeNull();
  });

  test("an app target whose sources are UIKit isn't SwiftUI", () => {
    const root = makeProject({ "Old.xcodeproj/project.pbxproj": pbxproj("Old", { sdk: "iphoneos" }), "Old/VC.swift": "import UIKit\n" });
    expect(swiftUIApp(root)).toBeNull();
    expect(detectStack(root)).toBeNull();
  });

  test("an empty project file has no app target", () => {
    expect(swiftUIApp(makeProject({ "Demo.xcodeproj/project.pbxproj": "", "Demo/ContentView.swift": "import SwiftUI" }))).toBeNull();
  });
});

describe("which target is the app", () => {
  test("an iOS app with a watch app: the watch target is never the app, whichever the project file lists first", () => {
    const root = makeProject({
      // The watch target's id sorts first, and it imports SwiftUI too.
      "Shop.xcodeproj/project.pbxproj": pbxprojOf([
        { name: "Shop Watch App", sdk: "watchos" },
        { name: "Customer", sdk: "iphoneos" },
      ]),
      "Shop Watch App/WatchApp.swift": view,
      "Customer/CustomerApp.swift": view,
    });
    expect(swiftUIApp(root)).toMatchObject({ name: "Customer", sourceRoot: "Customer", platforms: ["ios"] });
  });

  test("the target named like the project wins", () => {
    const root = makeProject({
      "Shop.xcodeproj/project.pbxproj": pbxprojOf([{ name: "Clip", sdk: "iphoneos" }, { name: "Shop", sdk: "iphoneos" }]),
      "Clip/ClipApp.swift": view,
      "Shop/ShopApp.swift": view,
    });
    expect(swiftUIApp(root)?.name).toBe("Shop");
  });

  test("platforms come from the chosen target's own settings, not the whole file", () => {
    const root = makeProject({
      "Shop.xcodeproj/project.pbxproj": pbxprojOf([{ name: "Shop", sdk: "iphoneos" }, { name: "Shop Mac Helper", sdk: "macosx" }]),
      "Shop/ShopApp.swift": view,
    });
    expect(swiftUIApp(root)?.platforms).toEqual(["ios"]);
  });

  test("a renamed target: the folder beside the project with the @main App is the source root", () => {
    const root = makeProject({
      "Old.xcodeproj/project.pbxproj": pbxprojOf([{ name: "Renamed", sdk: "iphoneos" }]),
      "Sources/Views.swift": "import SwiftUI\nstruct V: View { var body: some View { Text(\"x\") } }\n",
      "Brand/BrandApp.swift": view,
    });
    expect(swiftUIApp(root)).toMatchObject({ name: "Renamed", sourceRoot: "Brand" });
  });

  test("the Xcode 13-15 Multiplatform template: X (iOS) and X (macOS) with their code in Shared/", () => {
    const root = makeProject({
      "Pair.xcodeproj/project.pbxproj": pbxprojOf([
        { name: "Pair (iOS)", sdk: "iphoneos" },
        { name: "Pair (macOS)", sdk: "macosx" },
        { name: "Tests iOS", productType: "com.apple.product-type.bundle.ui-testing" },
      ]),
      "Shared/PairApp.swift": view,
      "Shared/ContentView.swift": "import SwiftUI\n",
      "iOS/Info.plist": "x",
      "macOS/Info.plist": "x",
      "Tests iOS/T.swift": "import XCTest\n",
    });
    expect(swiftUIApp(root)).toMatchObject({ kind: "xcodeproj", name: "Pair (iOS)", sourceRoot: "Shared", platforms: ["ios"] });
    expect(detectStack(root)).toBe("swiftui");
  });
});

describe("SwiftUI apps in Swift packages", () => {
  const manifest = (products: string) =>
    `// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(\n  name: "Tool",\n  platforms: [.iOS(.v17), .macOS(.v14)],\n  products: [${products}],\n  targets: [.executableTarget(name: "Tool")]\n)\n`;

  test("an executable target importing SwiftUI is an app: Sources/<Name> is the source root", () => {
    const root = makeProject({ "Package.swift": manifest(""), "Sources/Tool/ToolApp.swift": view });
    expect(swiftUIApp(root)).toEqual({ kind: "package", name: "Tool", project: "Package.swift", platforms: ["ios", "macos"], sourceRoot: "Sources/Tool" });
    expect(detectStack(root)).toBe("swiftui");
  });

  test("a Swift Playgrounds app: an .iOSApplication product, its target's path: \".\", the files at the package root", () => {
    const manifest =
      '// swift-tools-version: 5.9\nimport PackageDescription\nimport AppleProductTypes\nlet package = Package(\n  name: "Trip",\n  products: [.iOSApplication(name: "Trip", targets: ["AppModule"], bundleIdentifier: "x.y")],\n  targets: [.executableTarget(name: "AppModule", path: ".")]\n)\n';
    const root = makeProject({ "Package.swift": manifest, "MyApp.swift": view, "ContentView.swift": "import SwiftUI\n" });
    expect(swiftUIApp(root)).toEqual({ kind: "package", name: "AppModule", project: "Package.swift", platforms: ["ios"], sourceRoot: "." });
    expect(detectStack(root)).toBe("swiftui");
    expect(SWIFTUI.themeDir(root, { path: ".", stack: "swiftui", source: "detected" })).toBe("Design");
  });

  test("a target's own path: is its source root", () => {
    const manifest = 'let package = Package(name: "T", targets: [.executableTarget(name: "T", path: "App/Code")])\n';
    const root = makeProject({ "Package.swift": manifest, "App/Code/Main.swift": view });
    expect(swiftUIApp(root)?.sourceRoot).toBe("App/Code");
  });

  test("a SwiftUI library beside a command-line tool is no SwiftUI app", () => {
    const manifest =
      'let package = Package(name: "K", products: [.library(name: "Kit", targets: ["Kit"])], targets: [.target(name: "Kit"), .executableTarget(name: "kit-cli", dependencies: ["Kit"])])\n';
    const root = makeProject({ "Package.swift": manifest, "Sources/Kit/View.swift": "import SwiftUI\n", "Sources/kit-cli/main.swift": "import Foundation\n" });
    expect(swiftUIApp(root)).toBeNull();
    expect(detectStack(root)).toBeNull();
  });

  test("a library package is no app, whatever it imports", () => {
    const lib = '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Kit", products: [.library(name: "Kit", targets: ["Kit"])], targets: [.target(name: "Kit")])\n';
    const root = makeProject({ "Package.swift": lib, "Sources/Kit/Kit.swift": "import SwiftUI\n" });
    expect(swiftUIApp(root)).toBeNull();
    expect(detectStack(root)).toBeNull();
  });

  test("a commented-out executable isn't one", () => {
    const root = makeProject({
      "Package.swift": '// .executableTarget(name: "X")\nlet package = Package(name: "K", targets: [.target(name: "K")])\n',
      "Sources/K/K.swift": "import SwiftUI\n",
    });
    expect(swiftUIApp(root)).toBeNull();
  });
});

describe("finding SwiftUI apps in a project", () => {
  test("a workspace of several app projects lists each", () => {
    const root = makeProject({
      "All.xcworkspace/contents.xcworkspacedata": "<Workspace/>",
      "Customer/Customer.xcodeproj/project.pbxproj": pbxproj("Customer", { sdk: "iphoneos" }),
      "Customer/Customer/CustomerApp.swift": view,
      "Admin/Admin.xcodeproj/project.pbxproj": pbxproj("Admin", { sdk: "iphoneos" }),
      "Admin/Admin/AdminApp.swift": view,
      "Pods/Pods.xcodeproj/project.pbxproj": pbxproj("Pods"),
    });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([["Admin", "swiftui"], ["Customer", "swiftui"]]);
  });

  test("a workspace beside an app project at its root lists the root app and the others", () => {
    const root = makeProject({
      "Main.xcworkspace/contents.xcworkspacedata": "<Workspace/>",
      "Main.xcodeproj/project.pbxproj": pbxproj("Main", { sdk: "iphoneos" }),
      "Main/MainApp.swift": view,
      "Clip/Clip.xcodeproj/project.pbxproj": pbxproj("Clip", { sdk: "iphoneos" }),
      "Clip/Clip/ClipApp.swift": view,
    });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([[".", "swiftui"], ["Clip", "swiftui"]]);
  });

  test("in a monorepo, apps one folder deeper are found", () => {
    const root = makeProject({
      "dashboard/package.json": JSON.stringify({ dependencies: { react: "18", vite: "5" } }),
      "ios/Rafiq/Rafiq.xcodeproj/project.pbxproj": pbxproj("Rafiq", { sdk: "iphoneos" }),
      "ios/Rafiq/Rafiq/RafiqApp.swift": view,
    });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([["dashboard", "react-web"], ["ios/Rafiq", "swiftui"]]);
  });
});

describe("the SWIFTUI stack", () => {
  test("is registered, reads .swift files, and puts the theme in <sourceRoot>/Design unless motif.json says otherwise", () => {
    expect(nativeStack("swiftui")).toBe(SWIFTUI);
    expect(SWIFTUI.id).toBe("swiftui");
    expect(SWIFTUI.extensions).toEqual([".swift"]);
    const root = makeProject({ "ios/Rafiq/Rafiq.xcodeproj/project.pbxproj": pbxproj("Rafiq", { sdk: "iphoneos" }), "ios/Rafiq/Rafiq/RafiqApp.swift": view });
    const app = { path: "ios/Rafiq", stack: "swiftui" as const, source: "detected" as const };
    expect(SWIFTUI.themeDir(root, app)).toBe("ios/Rafiq/Rafiq/Design");
    expect(SWIFTUI.themeDir(root, { ...app, themeDir: "ios/Rafiq/Rafiq/Theme" })).toBe("ios/Rafiq/Rafiq/Theme");
    const atRoot = makeProject({ "Rafiq.xcodeproj/project.pbxproj": pbxproj("Rafiq", { sdk: "iphoneos" }), "Rafiq/RafiqApp.swift": view });
    expect(SWIFTUI.themeDir(atRoot, { path: ".", stack: "swiftui", source: "detected" })).toBe("Rafiq/Design");
  });

  test("sourceFiles lists the app's Swift, not tests or build output", () => {
    const root = makeProject({
      "Rafiq.xcodeproj/project.pbxproj": pbxproj("Rafiq", { sdk: "iphoneos" }),
      "Rafiq/RafiqApp.swift": view,
      "RafiqTests/A.swift": "x",
    });
    expect(SWIFTUI.sourceFiles!(root, { path: ".", stack: "swiftui", source: "detected" }, {}).map((f) => f.path)).toEqual(["Rafiq/RafiqApp.swift"]);
  });
});
