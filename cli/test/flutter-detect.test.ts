import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { importFor, isFlutterApp, isFlutterPackage, packageName, dependsOn } from "../src/stacks/flutter/project";
import { flutterDoctor } from "../src/stacks/flutter/doctor";
import { nativeStack, nativeStacks } from "../src/stacks/native";
import { dartIdentifier } from "../src/stacks/naming";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const pubspec = (name: string) => `name: ${name}\ndependencies:\n  flutter:\n    sdk: flutter\n  provider: ^6.0.0\ndev_dependencies:\n  lints: ^3.0.0\n`;

const tree = () => makeProject({
  "package.json": JSON.stringify({ workspaces: ["dashboard"] }),
  "pnpm-workspace.yaml": "packages:\n  - dashboard\n",
  "dashboard/package.json": JSON.stringify({ dependencies: { react: "18", vite: "5" } }),
  "mobile/customer/pubspec.yaml": pubspec("customer"),
  "mobile/customer/lib/main.dart": "void main() {}\n",
  "mobile/admin/pubspec.yaml": pubspec("admin"),
  "mobile/admin/lib/main.dart": "void main() {}\n",
  "mobile/packages/core/pubspec.yaml": pubspec("core"),
  "mobile/packages/core/lib/core.dart": "library core;\n",
  "mobile/react-native/package.json": JSON.stringify({ dependencies: { expo: "51", "react-native": "0.74" } }),
  "mobile/landing/index.html": "<html></html>",
});

describe("Flutter apps inside a monorepo", () => {
  test("finds apps one folder deeper, but not packages or plain web", () => {
    const { apps } = detectApps(tree());
    expect(apps.map((a) => a.path)).toEqual(["dashboard", "mobile/admin", "mobile/customer", "mobile/react-native"]);
    expect(apps.map((a) => a.stack)).toEqual(["react-web", "flutter", "flutter", "react-native"]);
  });

  test("tells apps from packages and reads the pubspec", () => {
    const root = tree();
    expect(isFlutterApp(join(root, "mobile/customer"))).toBe(true);
    expect(isFlutterPackage(join(root, "mobile/customer"))).toBe(false);
    expect(isFlutterPackage(join(root, "mobile/packages/core"))).toBe(true);
    expect(isFlutterApp(join(root, "mobile/packages/core"))).toBe(false);
    expect(packageName(join(root, "mobile/packages/core"))).toBe("core");
    expect(packageName(join(root, "dashboard"))).toBeNull();
    expect(dependsOn(join(root, "mobile/customer"), "provider")).toBe(true);
    expect(dependsOn(join(root, "mobile/customer"), "lints")).toBe(true);
    expect(dependsOn(join(root, "mobile/customer"), "riverpod")).toBe(false);
  });

  test("a path dependency's own keys are not dependencies", () => {
    const text = ["name: a", "dependencies:", "  flutter:", "    sdk: flutter", "  core:", "    path: ../core", "  other:", "    git:", "      url: x", ""].join("\n");
    const root = makeProject({ "pubspec.yaml": text });
    expect(dependsOn(root, "core")).toBe(true);
    for (const k of ["path", "sdk", "git", "url"]) expect(dependsOn(root, k)).toBe(false);
  });

  test("importFor uses the nearest pubspec above the file", () => {
    const root = tree();
    expect(importFor(root, "mobile/packages/core/lib/design/motif_theme.dart")).toBe("package:core/design/motif_theme.dart");
    expect(importFor(root, "mobile/customer/lib/a/b.dart")).toBe("package:customer/a/b.dart");
    expect(importFor(root, "dashboard/lib/x.dart")).toBeNull();
    expect(importFor(root, "mobile/customer/test/x.dart")).toBeNull();
  });
});

describe("which Flutter folders are apps", () => {
  test("a flavor app with only lib/main_dev.dart is listed", () => {
    const root = makeProject({ "pubspec.yaml": pubspec("shop"), "lib/main_dev.dart": "void main() {}\n" });
    expect(detectApps(root).apps.map((a) => a.path)).toEqual(["."]);
    const nested = makeProject({ "package.json": "{}", "apps/shop/pubspec.yaml": pubspec("shop"), "apps/shop/lib/main_dev.dart": "x" });
    expect(detectApps(nested).apps.map((a) => a.path)).toEqual(["apps/shop"]);
  });
  test("platform folders make an app too", () => {
    const root = makeProject({ "pubspec.yaml": pubspec("shop"), "ios/Runner/x": "" });
    expect(isFlutterApp(root)).toBe(true);
  });
  test("shared packages are not listed, at depth 2 or in packages/", () => {
    const root = makeProject({
      "package.json": "{}",
      "mobile/shared_ui/pubspec.yaml": pubspec("shared_ui"), "mobile/shared_ui/lib/a.dart": "x",
      "mobile/app/pubspec.yaml": pubspec("app"), "mobile/app/lib/main.dart": "x",
      "packages/core/pubspec.yaml": pubspec("core"), "packages/core/lib/core.dart": "x",
    });
    expect(detectApps(root).apps.map((a) => a.path)).toEqual(["mobile/app"]);
  });
});

describe("a theme folder per app", () => {
  const withSettings = (themeDir: unknown) => makeProject({
    "pubspec.yaml": pubspec("shop"),
    "lib/main.dart": "void main() {}\n",
    "mobile/packages/core/lib/design/.keep": "",
    "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "flutter", themeDir }], ignore: [] }),
  });

  test("keeps a folder inside the project", () => {
    const { apps, findings } = detectApps(withSettings("mobile/packages/core/lib/design"));
    expect(apps[0]!.themeDir).toBe("mobile/packages/core/lib/design");
    expect(findings).toEqual([]);
  });

  test("rejects a folder outside the project", () => {
    const { findings } = detectApps(withSettings("../x"));
    expect(findings.map((f) => f.code)).toEqual(["bad-settings"]);
    expect(findings[0]!.message).toContain("must be a folder inside this project");
  });
});

describe("naming and the registry", () => {
  test("dartIdentifier camel-cases and avoids reserved words", () => {
    expect(dartIdentifier("partner-store")).toBe("partnerStore");
    expect(dartIdentifier("default")).toBe("defaultVariant");
    expect(dartIdentifier("women")).toBe("women");
    expect(dartIdentifier("dark-blue-2")).toBe("darkBlue2");
  });
  test("Flutter is the only native stack registered so far", () => {
    expect(nativeStack("flutter")?.id).toBe("flutter");
    expect(nativeStack("swiftui")).toBeNull();
    expect(nativeStack(null)).toBeNull();
  });
});

describe("final review: one folder deeper is for native and mobile stacks only (Ruling V)", () => {
  test("a React example under examples/ isn't a new app; a Flutter app under mobile/ is", () => {
    const root = makeProject({
      "dashboard/package.json": JSON.stringify({ dependencies: { react: "18", vite: "5" } }),
      "examples/demo/package.json": JSON.stringify({ dependencies: { react: "18", vite: "5" } }),
      "e2e/fixture/package.json": JSON.stringify({ dependencies: { vue: "3", vite: "5" } }),
      "mobile/customer/pubspec.yaml": pubspec("customer"),
      "mobile/customer/lib/main.dart": "void main() {}\n",
    });
    const { apps } = detectApps(root);
    expect(apps.map((a) => [a.path, a.stack])).toEqual([["dashboard", "react-web"], ["mobile/customer", "flutter"]]);
  });
});

describe("final review: the commands reach a stack through its registration (Minor #10)", () => {
  test("Flutter brings its doctor item, its file extensions and what a state script is; extract and check read them from the registry", () => {
    const flutter = nativeStack("flutter")!;
    expect(flutter.doctor).toBe(flutterDoctor);
    expect(flutter.extensions).toEqual([".dart"]);
    expect(flutter.stateFiles).toEqual({ extension: ".dart", language: "Dart" });
    expect(nativeStacks().map((s) => s.id)).toEqual(["flutter", "compose", "react-native"]);
  });
});

describe("final review: a package name with a comment after it (Minor #13)", () => {
  test("name: shop # the customer app is shop", () => {
    expect(packageName(makeProject({ "pubspec.yaml": "name: shop # the customer app\n" }))).toBe("shop");
    expect(packageName(makeProject({ "pubspec.yaml": "name: 'shop'#x\n" }))).toBe("shop");
    expect(packageName(makeProject({ "pubspec.yaml": "name: shop app\n" }))).toBeNull();
  });
});
