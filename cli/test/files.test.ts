import { afterAll, describe, expect, test } from "bun:test";
import { FLUTTER_IGNORES, listDartFiles, listKotlinFiles, listSourceFiles } from "../src/check/files";
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
});
