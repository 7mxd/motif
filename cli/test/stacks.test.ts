import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { detectApps, detectStack } from "../src/detect/stacks";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "motif-detect-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}
const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ dependencies: deps, devDependencies: dev });

describe("detectStack", () => {
  test.each([
    ["angular", { "package.json": pkg({ "@angular/core": "^18" }) }],
    ["vue", { "package.json": pkg({ nuxt: "^3" }) }],
    ["vue", { "package.json": pkg({ vue: "^3" }) }],
    ["svelte", { "package.json": pkg({}, { "@sveltejs/kit": "^2" }) }],
    ["react-native", { "package.json": pkg({ expo: "^52", react: "^18" }) }],
    ["react-web", { "package.json": pkg({ next: "^15", react: "^19" }) }],
    ["flutter", { "pubspec.yaml": "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n" }],
    ["compose", { "app/build.gradle.kts": "android {\n  buildFeatures {\n    compose = true\n  }\n}\n" }],
    ["compose", { "build.gradle": "implementation 'androidx.compose.ui:ui:1.7.0'\n" }],
    ["swiftui", { "Package.swift": "// swift-tools-version:5.9", "Sources/App/App.swift": "import SwiftUI\n@main struct A: App {}" }],
    ["swiftui", { "Demo.xcodeproj/project.pbxproj": "", "Demo/ContentView.swift": "import SwiftUI" }],
  ])("detects %s", (stack, files) => {
    expect(detectStack(project(files as Record<string, string>))).toBe(stack as any);
  });

  test("a server that only renders React (e.g. emails) is not a web app", () => {
    expect(detectStack(project({ "package.json": pkg({ express: "^4", react: "^19", "react-dom": "^19" }) }))).toBeNull();
  });

  test("React with Vite is a web app", () => {
    expect(detectStack(project({ "package.json": pkg({ react: "^19" }, { vite: "^6" }) }))).toBe("react-web");
  });

  test("a UIKit-only Xcode project is not SwiftUI", () => {
    expect(detectStack(project({ "Demo.xcodeproj/project.pbxproj": "", "Demo/VC.swift": "import UIKit" }))).toBeNull();
  });

  test("an empty folder has no stack", () => {
    expect(detectStack(project({}))).toBeNull();
  });

  test("a broken package.json doesn't crash", () => {
    expect(detectStack(project({ "package.json": "{ nope" }))).toBeNull();
  });
});

describe("detectApps", () => {
  test("the root is the app when it has a stack", () => {
    const root = project({ "package.json": pkg({ react: "^19", vite: "^6" }) });
    expect(detectApps(root).apps).toEqual([{ path: ".", stack: "react-web", source: "detected" }]);
  });

  test("finds apps in a monorepo (apps/web + apps/mobile)", () => {
    const root = project({
      "package.json": pkg({}),
      "apps/web/package.json": pkg({ react: "^19", vite: "^6" }),
      "apps/mobile/pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n",
    });
    expect(detectApps(root).apps).toEqual([
      { path: "apps/mobile", stack: "flutter", source: "detected" },
      { path: "apps/web", stack: "react-web", source: "detected" },
    ]);
  });

  test("never treats node_modules packages as apps", () => {
    const root = project({ "node_modules/react/package.json": pkg({ react: "^19", vite: "^6" }) });
    expect(detectApps(root).apps).toEqual([]);
  });

  test("uses design/motif.json when present", () => {
    const root = project({
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: "web", stack: "react-web" }] }),
    });
    expect(detectApps(root)).toEqual({ apps: [{ path: "web", stack: "react-web", source: "motif.json" }], findings: [] });
  });

  test("reports an unknown stack in motif.json", () => {
    const root = project({ "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "cobol" }] }) });
    const { apps, findings } = detectApps(root);
    expect(apps).toEqual([{ path: ".", stack: null, source: "motif.json" }]);
    expect(findings.map((f) => f.code)).toEqual(["bad-settings"]);
  });

  test("reports broken motif.json and falls back to detection", () => {
    const root = project({ "design/motif.json": "{ nope", "package.json": pkg({ react: "^19", vite: "^6" }) });
    const { apps, findings } = detectApps(root);
    expect(apps).toEqual([{ path: ".", stack: "react-web", source: "detected" }]);
    expect(findings.map((f) => f.code)).toEqual(["bad-settings"]);
  });
});
