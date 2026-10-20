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

/** The smallest project file with an application target (a plan 2H change: detection needs the target, not just the file). */
const APP_PBXPROJ = "{ objects = { A = { isa = PBXNativeTarget; name = Demo; productType = \"com.apple.product-type.application\"; }; }; }";

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
    ["swiftui", { "Package.swift": "// swift-tools-version:5.9\nlet package = Package(name: \"App\", targets: [.executableTarget(name: \"App\")])", "Sources/App/App.swift": "import SwiftUI\n@main struct A: App {}" }],
    ["swiftui", { "Demo.xcodeproj/project.pbxproj": APP_PBXPROJ, "Demo/ContentView.swift": "import SwiftUI" }],
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
    expect(detectStack(project({ "Demo.xcodeproj/project.pbxproj": APP_PBXPROJ, "Demo/VC.swift": "import UIKit" }))).toBeNull();
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
      "apps/mobile/lib/main.dart": "void main() {}\n",
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
    const files: Record<string, string> = { "Package.swift": 'let package = Package(name: "A", targets: [.executableTarget(name: "A")])' };
    for (let i = 0; i < 5100; i++) files[`f${String(i).padStart(4, "0")}/.keep`] = "";
    files["f5099/View.swift"] = "import SwiftUI";
    const started = Date.now();
    expect(detectStack(project(files))).toBeNull();
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);
});

describe("detectApps: from the review of batch C1", () => {
  test("a workspace root that is itself the app keeps it, beside a library in packages/", () => {
    const next = project({
      "package.json": JSON.stringify({ workspaces: ["packages/*"], dependencies: { next: "^15", react: "^19" } }),
      "next.config.ts": "export default {};",
      "app/page.tsx": "",
      "packages/ui/package.json": pkg({}, { react: "^19", vite: "^6" }),
    });
    expect(detectApps(next).apps.map((a) => [a.path, a.stack])).toEqual([[".", "react-web"]]);
    const cra = project({
      "package.json": JSON.stringify({ workspaces: ["packages/*"], dependencies: { react: "^19", "react-scripts": "^5" } }),
      "public/index.html": "<div id=root></div>",
      "src/index.tsx": "",
    });
    expect(detectApps(cra).apps.map((a) => [a.path, a.stack])).toEqual([[".", "react-web"]]);
    const empty = project({ "package.json": JSON.stringify({ workspaces: [], dependencies: { react: "^19", vite: "^6" } }), "apps/web/package.json": pkg({ react: "^19", vite: "^6" }) });
    expect(detectApps(empty).apps.map((a) => a.path)).toEqual(["."]);
  });

  test("an ordinary SwiftUI app is found, however many images its asset catalogue holds", () => {
    const files: Record<string, string> = { "MyApp.xcodeproj/project.pbxproj": APP_PBXPROJ.replace("Demo", "MyApp"), "MyApp/ContentView.swift": "import SwiftUI" };
    for (let i = 0; i < 1300; i++) for (const f of ["Contents.json", "a.png", "a@2x.png", "a@3x.png"]) files[`MyApp/Assets.xcassets/img${i}.imageset/${f}`] = "";
    expect(detectStack(project(files))).toBe("swiftui");
  }, 60_000);

  test("the home-folder guard compares paths as the system does, and says what to do", () => {
    const home = project({ "projects/app/package.json": pkg({ react: "^19", vite: "^6" }) });
    const other = process.platform === "win32" ? home.replace(/^[A-Z]:/, (d) => d.toLowerCase()) : home;
    const r = detectApps(other, { home });
    expect(r.apps).toEqual([]);
    expect(r.findings[0]!.message).toBe("This is your home folder, so Motif doesn't look through every folder in it. Run Motif inside your app's folder, or list your apps in design/motif.json.");
  });

  test("an absolute path in design/motif.json is named as such; a UTF-16 design/motif.json says to save it as UTF-8", () => {
    const abs = project({ "web/package.json": pkg({}) });
    const withAbs = project({ "design/motif.json": JSON.stringify({ apps: [{ path: join(abs, "web"), stack: "react-web" }] }) });
    expect(detectApps(withAbs).findings[0]!.message).toBe(`design/motif.json lists "${join(abs, "web").replace(/\\/g, "/")}" as a full path: write it relative to this folder, like "web".`);
    const utf16 = project({});
    mkdirSync(join(utf16, "design"), { recursive: true });
    writeFileSync(join(utf16, "design", "motif.json"), new Uint8Array([0xff, 0xfe, ...Buffer.from(JSON.stringify({ apps: [] }), "utf16le")]));
    expect(detectApps(utf16).findings.map((f) => f.message)).toEqual([expect.stringContaining("saved as UTF-16")]);
  });

  test("Hugo's older configs (yaml, json, config/_default) and Zola sites aren't plain web; index.htm is served as the folder's page", () => {
    expect(detectStack(project({ "config.yaml": "title: x", "layouts/index.html": "", "public/index.html": "" }))).toBeNull();
    expect(detectStack(project({ "config/_default/hugo.toml": "", "public/index.html": "" }))).toBeNull();
    expect(detectStack(project({ "config.toml": 'base_url = "x"', "templates/index.html": "", "public/index.html": "" }))).toBeNull();
  });
});
