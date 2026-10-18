import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectApps, detectStack } from "../src/detect/stacks";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

function project(files: Record<string, string>): string {
  const root = tempDir("motif-detect-");
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

  test("a package.json with a byte-order mark is still read", () => {
    expect(detectStack(project({ "package.json": "\uFEFF" + pkg({ react: "^19", vite: "^6" }) }))).toBe("react-web");
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

  test("a React app with build tooling Motif doesn't recognise is listed with an unknown stack", () => {
    const root = project({ "package.json": pkg({ react: "^19", "react-dom": "^19" }, { esbuild: "^0.24" }) });
    expect(detectApps(root).apps).toEqual([{ path: ".", stack: null, source: "detected" }]);
  });

  test("a server that renders React is not listed as an app", () => {
    const root = project({ "package.json": pkg({ express: "^4", react: "^19" }) });
    expect(detectApps(root).apps).toEqual([]);
  });

  test("uses design/motif.json when present", () => {
    const root = project({
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: "web", stack: "react-web" }] }),
      "web/package.json": pkg({}),
    });
    expect(detectApps(root)).toEqual({ apps: [{ path: "web", stack: "react-web", source: "motif.json" }], findings: [] });
  });

  test("design/motif.json with a byte-order mark is still used", () => {
    const root = project({ "design/motif.json": "\uFEFF" + JSON.stringify({ apps: [{ path: "web", stack: "react-web" }] }), "web/package.json": pkg({}) });
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

describe("detectApps: from the backlog", () => {
  test("a workspace root whose hoisted dependencies look like one app lists its apps instead", () => {
    const root = project({
      "package.json": JSON.stringify({ workspaces: ["apps/*"], dependencies: { expo: "^52", react: "^19", vite: "^6" } }),
      "apps/mobile/package.json": pkg({ expo: "^52", react: "^19" }),
      "apps/web/package.json": pkg({ react: "^19", vite: "^6" }),
    });
    expect(detectApps(root).apps).toEqual([
      { path: "apps/mobile", stack: "react-native", source: "detected" },
      { path: "apps/web", stack: "react-web", source: "detected" },
    ]);
  });

  test("an app design/motif.json lists that isn't there is reported and left out; with none left, apps are detected", () => {
    const some = project({
      "design/motif.json": JSON.stringify({ apps: [{ path: "web", stack: "react-web" }, { path: "gone", stack: "react-web" }] }),
      "web/package.json": pkg({}),
    });
    const r = detectApps(some);
    expect(r.apps.map((a) => a.path)).toEqual(["web"]);
    expect(r.findings.map((f) => f.message)).toEqual(['design/motif.json lists "gone", but there\'s no such folder here.']);
    const none = project({ "design/motif.json": JSON.stringify({ apps: [{ path: "gone", stack: "react-web" }] }), "package.json": pkg({ react: "^19", vite: "^6" }) });
    expect(detectApps(none).apps).toEqual([{ path: ".", stack: "react-web", source: "detected" }]);
  });

  test("a site folder design/motif.json names that isn't there is reported, and the site's pages are found again", () => {
    const root = project({ "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "plain-web", srcDir: "site" }] }), "public/index.html": "<p>x</p>" });
    const r = detectApps(root);
    expect(r.apps).toEqual([{ path: ".", stack: "plain-web", source: "motif.json" }]);
    expect(r.findings.map((f) => f.message)).toEqual(['design/motif.json says the pages of "." are in "site", but there\'s no such folder.']);
  });

  test("in a home folder or a drive's root, Motif doesn't look through every folder", () => {
    const home = project({ "projects/app/package.json": pkg({ react: "^19", vite: "^6" }) });
    const r = detectApps(home, { home });
    expect(r.apps).toEqual([]);
    expect(r.findings.map((f) => f.code)).toEqual(["home-folder"]);
  });

  test("index.htm counts as a page; Hugo's older config.toml beside its layouts isn't plain web", () => {
    expect(detectStack(project({ "index.htm": "<p>x</p>" }))).toBe("plain-web");
    expect(detectStack(project({ "config.toml": 'title = "x"', "layouts/index.html": "", "public/index.html": "" }))).toBeNull();
  });

  test("a Swift project with very many folders is looked through only so far", () => {
    const files: Record<string, string> = { "Package.swift": "// swift-tools-version:5.9" };
    for (let i = 0; i < 5100; i++) files[`f${String(i).padStart(4, "0")}/.keep`] = "";
    files["f5099/View.swift"] = "import SwiftUI";
    const started = Date.now();
    expect(detectStack(project(files))).toBeNull();
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);
});
