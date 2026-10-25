import { afterAll, describe, expect, test } from "bun:test";
import { ANGULAR_IGNORES, FLUTTER_IGNORES, listAngularFiles, listDartFiles, listKotlinFiles, listRnFiles, listSourceFiles, listVueFiles, listSvelteFiles, listSwiftFiles, SWIFTUI_IGNORES } from "../src/check/files";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const paths = (files: { path: string }[]) => files.map((f) => f.path);

describe("listSourceFiles", () => {
  test("finds CSS, script and markup files with forward-slash paths", () => {
    const root = makeProject({
      "src/App.tsx": "x", "src/index.css": "x", "index.html": "x", "src/util.mjs": "x", "README.md": "x", "logo.svg": "x",
    });
    const files = listSourceFiles(root, ".");
    expect(paths(files)).toEqual(["index.html", "src/App.tsx", "src/index.css", "src/util.mjs"]);
    expect(files.map((f) => f.lang)).toEqual(["markup", "script", "css", "script"]);
  });

  test("skips dependencies, build output, tests, stories, configs, minified and type files", () => {
    const root = makeProject({
      "src/App.tsx": "x",
      "node_modules/lib/index.js": "x",
      "dist/app.js": "x",
      ".next/page.js": "x",
      "src/App.test.tsx": "x",
      "src/__tests__/a.tsx": "x",
      "src/Button.stories.tsx": "x",
      "tailwind.config.ts": "x",
      "public/vendor.min.js": "x",
      "src/env.d.ts": "x",
    });
    expect(paths(listSourceFiles(root, "."))).toEqual(["src/App.tsx"]);
  });

  test("respects .gitignore at the root and in the app, plus motif.json patterns", () => {
    const root = makeProject({
      ".gitignore": "generated/\n",
      "apps/web/.gitignore": "tmp/\n",
      "apps/web/src/App.tsx": "x",
      "apps/web/generated/a.ts": "x",
      "apps/web/tmp/b.ts": "x",
      "apps/web/legacy/old.css": "x",
    });
    expect(paths(listSourceFiles(root, "apps/web", { ignore: ["legacy/"] }))).toEqual(["apps/web/src/App.tsx"]);
  });

  test("skips huge files and minified files that aren't named .min", () => {
    const root = makeProject({
      "src/App.tsx": "x",
      "public/vendor.js": "a".repeat(600 * 1024),
      "src/bundle.js": "var a=1;" + "b".repeat(4000) + "\n",
    });
    expect(paths(listSourceFiles(root, "."))).toEqual(["src/App.tsx"]);
  });

  test("paths narrow the scan to files or folders", () => {
    const root = makeProject({ "src/a/One.tsx": "x", "src/a/Two.tsx": "x", "src/b/Three.tsx": "x" });
    expect(paths(listSourceFiles(root, ".", { paths: ["src/a"] }))).toEqual(["src/a/One.tsx", "src/a/Two.tsx"]);
    expect(paths(listSourceFiles(root, ".", { paths: ["./src/b/Three.tsx"] }))).toEqual(["src/b/Three.tsx"]);
  });

  test("strips a byte-order mark from file text", () => {
    const root = makeProject({ "src/a.css": "﻿a{}" });
    expect(listSourceFiles(root, ".")[0]!.text).toBe("a{}");
  });
});

describe("listSourceFiles: what counts as source", () => {
  test("an icon with one long path line is still scanned; a bundle-like file is not", () => {
    const icon = 'export const Logo = () => (\n  <svg viewBox="0 0 24 24">\n    <path fill="#7c3aed" d="' + "M0 0L1 1".repeat(600) + '" />\n  </svg>\n);\n';
    const root = makeProject({ "src/Logo.tsx": icon, "src/vendor.js": "x".repeat(4000) + "\n" + "y".repeat(4000) });
    expect(paths(listSourceFiles(root, "."))).toEqual(["src/Logo.tsx"]);
  });
  test("dot-folders and the project's design/ folder are skipped", () => {
    const root = makeProject({ "src/App.tsx": "x", ".storybook/preview.tsx": "x", "design/previews/a.html": "x", "src/design/Card.tsx": "x" });
    expect(paths(listSourceFiles(root, "."))).toEqual(["src/App.tsx", "src/design/Card.tsx"]);
  });
});

describe("listSourceFiles for Dart", () => {
  const files = {
    "lib/a.dart": "x", "lib/a.g.dart": "x", "test/a_test.dart": "x", ".dart_tool/x.dart": "x", "lib/b.ts": "x",
  };
  test("lists Dart sources with the Flutter ignores, and skips generated ones", () => {
    const root = makeProject(files);
    const found = listSourceFiles(root, ".", { langs: { ".dart": "dart" }, extraIgnores: FLUTTER_IGNORES });
    expect(paths(found)).toEqual(["lib/a.dart"]);
    expect(found[0]!.lang).toBe("dart");
  });
  test("slash patterns apply inside a nested app too", () => {
    const root = makeProject({
      "mobile/customer/lib/a.dart": "x", "mobile/customer/lib/generated/x.dart": "x",
      "mobile/customer/lib/l10n/app_localizations.dart": "x", "mobile/customer/lib/l10n/app_localizations_en.dart": "x",
      "mobile/customer/test/a_test.dart": "x",
    });
    const found = listSourceFiles(root, "mobile/customer", { langs: { ".dart": "dart" }, extraIgnores: FLUTTER_IGNORES });
    expect(paths(found)).toEqual(["mobile/customer/lib/a.dart"]);
  });
  test("without langs, Dart files are not listed (today's behaviour)", () => {
    expect(paths(listSourceFiles(makeProject(files), "."))).toEqual(["lib/b.ts"]);
  });
});

describe("final review: Flutter's ignores are anchored to the app or package (Minor #4)", () => {
  test("a feature folder named build or test under lib/ is read; the app's own build/, test/ and integration_test/ aren't", () => {
    const root = makeProject({
      "lib/features/build/build_screen.dart": "x", "lib/features/test/test_screen.dart": "x", "lib/features/integration_test/x.dart": "x",
      "build/app/x.dart": "x", "test/a_test.dart": "x", "integration_test/a_test.dart": "x", ".dart_tool/x.dart": "x",
    });
    expect(paths(listDartFiles(root, "."))).toEqual(["lib/features/build/build_screen.dart", "lib/features/integration_test/x.dart", "lib/features/test/test_screen.dart"]);
    const nested = makeProject({
      "mobile/customer/lib/features/build/a.dart": "x", "mobile/customer/lib/features/test/b.dart": "x",
      "mobile/customer/build/x.dart": "x", "mobile/customer/test/a_test.dart": "x",
    });
    expect(paths(listDartFiles(nested, "mobile/customer"))).toEqual(["mobile/customer/lib/features/build/a.dart", "mobile/customer/lib/features/test/b.dart"]);
  });

  test("a package inside the app (example/, packages/*) has its own build/, test/ and generated code ignored too", () => {
    const pubspec = "name: x\n";
    const root = makeProject({
      "pubspec.yaml": pubspec, "lib/a.dart": "x",
      "example/pubspec.yaml": pubspec, "example/lib/main.dart": "x", "example/test/widget_test.dart": "x",
      "example/integration_test/app_test.dart": "x", "example/build/x.dart": "x", "example/.dart_tool/x.dart": "x",
      "packages/ui/pubspec.yaml": pubspec, "packages/ui/lib/button.dart": "x", "packages/ui/test/button_test.dart": "x",
      "packages/ui/lib/generated/intl.dart": "x", "packages/ui/lib/l10n/app_localizations_en.dart": "x",
      // A folder named test with no pubspec beside it is ordinary code.
      "tool/test/helper.dart": "x",
    });
    expect(paths(listDartFiles(root, "."))).toEqual(["example/lib/main.dart", "lib/a.dart", "packages/ui/lib/button.dart", "tool/test/helper.dart"]);
  });

  test("web apps keep ignoring every build/ folder, as before", () => {
    expect(paths(listSourceFiles(makeProject({ "src/build/a.ts": "x", "src/b.ts": "x" }), "."))).toEqual(["src/b.ts"]);
  });
});

describe("listKotlinFiles", () => {
  test("lists a module's Kotlin, not build output, tests, Gradle scripts or a module inside it's own folders", () => {
    const root = makeProject({
      "app/build.gradle.kts": "x", "app/src/main/java/com/example/MainActivity.kt": "x",
      "app/src/main/java/com/example/build/BuildScreen.kt": "x", "app/src/main/kotlin/com/example/test/TestScreen.kt": "x",
      "app/build/generated/Foo.kt": "x", "app/src/test/java/FooTest.kt": "x", "app/src/androidTest/java/BarTest.kt": "x",
      "app/.motif/x.kt": "x", "app/settings.gradle.kts": "x",
      "app/sub/build.gradle.kts": "x", "app/sub/src/main/kotlin/Sub.kt": "x", "app/sub/src/test/kotlin/SubTest.kt": "x", "app/sub/build/Gen.kt": "x",
    });
    expect(paths(listKotlinFiles(root, "app"))).toEqual([
      "app/src/main/java/com/example/MainActivity.kt", "app/src/main/java/com/example/build/BuildScreen.kt",
      "app/src/main/kotlin/com/example/test/TestScreen.kt", "app/sub/src/main/kotlin/Sub.kt",
    ]);
    expect(listKotlinFiles(root, "app")[0]!.lang).toBe("kotlin");
  });

  test("leaves out every test source set: a flavour's (src/testDemo, src/androidTestDemo), screenshotTest and sharedTest", () => {
    const root = makeProject({
      "app/build.gradle.kts": "x", "app/src/main/java/com/example/Main.kt": "x", "app/src/demo/java/com/example/Demo.kt": "x",
      "app/src/testDemo/java/DemoTest.kt": "x", "app/src/testDemoDebug/java/DemoDebugTest.kt": "x",
      "app/src/androidTestDemo/java/DemoUiTest.kt": "x", "app/src/screenshotTest/kotlin/Shots.kt": "x",
      "app/src/screenshotTestDebug/kotlin/DebugShots.kt": "x", "app/src/sharedTest/java/Shared.kt": "x", "app/src/testFixtures/java/Fake.kt": "x",
    });
    expect(paths(listKotlinFiles(root, "app"))).toEqual(["app/src/demo/java/com/example/Demo.kt", "app/src/main/java/com/example/Main.kt"]);
  });
});

describe("listRnFiles", () => {
  test("reads an Expo app's scripts, not native folders, build output, expo's own files or tests", () => {
    const root = makeProject({
      "package.json": "{}",
      "app/index.tsx": "x", "app/_layout.tsx": "x", "components/Button.js": "x", "src/theme.ts": "x", "styles.css": "x",
      "ios/Pods/x.js": "x", "android/app/y.js": "x", ".expo/types/router.d.ts": "x", "dist/bundle.js": "x", "web-build/a.js": "x",
      ".motif/run/b.tsx": "x", "expo-env.d.ts": "x", "app/index.test.tsx": "x", "__tests__/a.tsx": "x", "components/__tests__/b.tsx": "x",
    });
    expect(paths(listRnFiles(root, "."))).toEqual(["app/_layout.tsx", "app/index.tsx", "components/Button.js", "src/theme.ts"]);
  });

  test("an app in a monorepo is listed from its folder", () => {
    const root = makeProject({ "mobile/a/app/index.tsx": "x", "mobile/a/ios/z.js": "x", "mobile/b/app/index.tsx": "x" });
    expect(paths(listRnFiles(root, "mobile/a"))).toEqual(["mobile/a/app/index.tsx"]);
  });
});

describe("listVueFiles", () => {
  test("reads .vue files with scripts and styles, not build output, generated types or tests", () => {
    const root = makeProject({
      "package.json": "{}",
      "src/App.vue": "x", "src/main.ts": "x", "src/assets/base.css": "x", "pages/index.vue": "x", "index.html": "x",
      ".nuxt/a.vue": "x", ".output/b.mjs": "x", ".data/c.ts": "x", "dist/d.js": "x", ".vite/e.js": "x", ".motif/f.vue": "x",
      "auto-imports.d.ts": "x", "components.d.ts": "x", "typed-router.d.ts": "x", "src/a.test.ts": "x",
    });
    const files = listVueFiles(root, ".");
    expect(paths(files)).toEqual(["index.html", "pages/index.vue", "src/App.vue", "src/assets/base.css", "src/main.ts"]);
    expect(files.find((f) => f.path === "src/App.vue")!.lang).toBe("markup");
  });

  test("the project's design/ folder is Motif's only at the project root", () => {
    const root = makeProject({
      "design/tokens.json": "{}", "design/Notes.vue": "x", "pages/index.vue": "x", "components/Card.vue": "x", "assets/main.css": "x",
      "apps/web/design/Hero.vue": "x", "apps/web/app.vue": "x",
    });
    expect(paths(listVueFiles(root, "."))).toEqual(["apps/web/app.vue", "apps/web/design/Hero.vue", "assets/main.css", "components/Card.vue", "pages/index.vue"]);
  });
});

describe("listSvelteFiles", () => {
  test("reads .svelte files with scripts and styles, not build output, generated types, config or tests", () => {
    const root = makeProject({
      "package.json": "{}",
      "src/App.svelte": "x", "src/routes/+page.svelte": "x", "src/app.css": "x", "src/lib/a.ts": "x", "src/app.html": "x", "index.html": "x",
      ".svelte-kit/a.svelte": "x", "build/b.js": "x", ".vercel/c.js": "x", ".netlify/d.js": "x", ".output/e.mjs": "x", "dist/f.js": "x", ".motif/g.svelte": "x",
      "src/app.d.ts": "x", "svelte.config.js": "x", "vite.config.ts": "x", "src/a.test.ts": "x", "src/b.spec.ts": "x",
    });
    const files = listSvelteFiles(root, ".");
    expect(paths(files)).toEqual(["index.html", "src/App.svelte", "src/app.css", "src/app.html", "src/lib/a.ts", "src/routes/+page.svelte"]);
    expect(files.find((f) => f.path === "src/App.svelte")!.lang).toBe("markup");
  });

  test("an app inside a monorepo keeps its own build folders out", () => {
    const root = makeProject({ "package.json": "{}", "apps/web/src/routes/+page.svelte": "x", "apps/web/.svelte-kit/a.svelte": "x", "apps/web/build/x.js": "x" });
    expect(paths(listSvelteFiles(root, "apps/web"))).toEqual(["apps/web/src/routes/+page.svelte"]);
  });
});

describe("listAngularFiles", () => {
  test("reads TypeScript, templates and styles, not build output, caches, specs, types or config (app.config.ts too)", () => {
    expect(ANGULAR_IGNORES).toEqual(["/.angular/", "/dist/", "/out-tsc/", "/coverage/", "/.motif/", "*.d.ts", "*.spec.ts"]);
    const root = makeProject({
      "package.json": "{}", "angular.json": "{}", "tsconfig.json": "{}",
      "src/main.ts": "x", "src/index.html": "x", "src/styles.scss": "x", "src/theme.sass": "x", "src/legacy.less": "x", "src/app/app.ts": "x", "src/app/app.html": "x", "src/app/app.css": "x",
      "src/app/app.spec.ts": "x", "src/typings.d.ts": "x", ".angular/cache/a.js": "x", "dist/ng/main.js": "x", "out-tsc/app/main.js": "x", "coverage/index.html": "x", ".motif/x.ts": "x",
      "public/favicon.ico": "x", "src/app/app.config.ts": "x",
    });
    const files = listAngularFiles(root, ".");
    expect(paths(files)).toEqual(["src/app/app.css", "src/app/app.html", "src/app/app.ts", "src/index.html", "src/legacy.less", "src/main.ts", "src/styles.scss", "src/theme.sass"]);
    expect(files.find((f) => f.path === "src/app/app.html")!.lang).toBe("markup");
    expect(files.find((f) => f.path === "src/styles.scss")!.lang).toBe("css");
  });

  test("an app inside a monorepo keeps its own build folders out", () => {
    const root = makeProject({ "package.json": "{}", "apps/web/src/app/app.ts": "x", "apps/web/.angular/a.ts": "x", "apps/web/out-tsc/b.js": "x", "apps/web/coverage/c.html": "x" });
    expect(paths(listAngularFiles(root, "apps/web"))).toEqual(["apps/web/src/app/app.ts"]);
  });
});

describe("listSwiftFiles", () => {
  test("lists Swift, not build output, tests, dependencies or generated files; a local package's own build folders too", () => {
    const root = makeProject({
      "App/Views/Home.swift": "x", "App/Views/build/Keep.swift": "x", "App/Strings.generated.swift": "x",
      "AppTests/HomeTests.swift": "x", "AppUITests/UI.swift": "x", "Tests/AppTests/T.swift": "x",
      "build/Gen.swift": "x", "DerivedData/D.swift": "x", ".build/checkouts/B.swift": "x", ".motif/shot/S.swift": "x",
      "Pods/Alamofire/A.swift": "x", "Carthage/Checkouts/C.swift": "x",
      "Package.swift": "x", "Packages/Kit/Package.swift": "x", "Packages/Kit/Sources/Kit/Kit.swift": "x", "Packages/Kit/Tests/KitTests/K.swift": "x", "Packages/Kit/.build/B.swift": "x",
    });
    expect(paths(listSwiftFiles(root, "."))).toEqual(["App/Views/Home.swift", "App/Views/build/Keep.swift", "Packages/Kit/Sources/Kit/Kit.swift"]);
    expect(listSwiftFiles(root, ".")[0]!.lang).toBe("swift");
    expect(SWIFTUI_IGNORES).toContain("*.generated.swift");
  });
});
