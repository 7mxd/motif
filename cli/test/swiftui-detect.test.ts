import { afterAll, describe, expect, test } from "bun:test";
import { detectApps, detectStack } from "../src/detect/stacks";
import { swiftUIApp } from "../src/stacks/swiftui/project";
import { SWIFTUI } from "../src/stacks/swiftui";
import { nativeStack } from "../src/stacks/native";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

/** The target block Xcode writes for an app, a unit-test target beside it, and build settings for the given platforms. */
function pbxproj(name: string, opts: { sdk?: string; supported?: string; synced?: string; productType?: string } = {}): string {
  return [
    "// !$*UTF8*$!",
    "{ objects = {",
    "/* Begin PBXNativeTarget section */",
    `\tAAA /* ${name} */ = {`,
    "\t\tisa = PBXNativeTarget;",
    `\t\tname = ${name};`,
    ...(opts.synced ? [`\t\tfileSystemSynchronizedGroups = (\n\t\t\tGGG /* ${opts.synced} */,\n\t\t);`] : []),
    `\t\tproductType = "${opts.productType ?? "com.apple.product-type.application"}";`,
    "\t};",
    `\tBBB /* ${name}Tests */ = {`,
    "\t\tisa = PBXNativeTarget;",
    `\t\tname = ${name}Tests;`,
    '\t\tproductType = "com.apple.product-type.bundle.unit-test";',
    "\t};",
    "/* End PBXNativeTarget section */",
    ...(opts.synced ? [`\tGGG /* ${opts.synced} */ = {\n\t\tisa = PBXFileSystemSynchronizedRootGroup;\n\t\tpath = ${opts.synced};\n\t\tsourceTree = "<group>";\n\t};`] : []),
    "\tCCC /* Debug */ = {",
    "\t\tisa = XCBuildConfiguration;",
    "\t\tbuildSettings = {",
    ...(opts.sdk ? [`\t\t\tSDKROOT = ${opts.sdk};`] : []),
    ...(opts.supported ? [`\t\t\tSUPPORTED_PLATFORMS = "${opts.supported}";`] : []),
    "\t\t};",
    "\t};",
    "}; }",
  ].join("\n");
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

describe("SwiftUI apps in Swift packages", () => {
  const manifest = (products: string) =>
    `// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(\n  name: "Tool",\n  platforms: [.iOS(.v17), .macOS(.v14)],\n  products: [${products}],\n  targets: [.executableTarget(name: "Tool")]\n)\n`;

  test("an executable target importing SwiftUI is an app: Sources/<Name> is the source root", () => {
    const root = makeProject({ "Package.swift": manifest(""), "Sources/Tool/ToolApp.swift": view });
    expect(swiftUIApp(root)).toEqual({ kind: "package", name: "Tool", project: "Package.swift", platforms: ["ios", "macos"], sourceRoot: "Sources/Tool" });
    expect(detectStack(root)).toBe("swiftui");
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
