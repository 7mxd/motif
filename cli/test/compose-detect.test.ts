import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps, detectStack } from "../src/detect/stacks";
import { composeLibrary, composeModule, packageFolder } from "../src/stacks/compose/project";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const app = (namespace = "com.example.rafiq") =>
  `plugins {\n    alias(libs.plugins.android.application)\n    alias(libs.plugins.kotlin.android)\n    alias(libs.plugins.kotlin.compose)\n}\nandroid {\n    namespace = "${namespace}"\n}\n`;
const library = `plugins {\n    id("com.android.library")\n    alias(libs.plugins.kotlin.compose)\n}\nandroid { namespace = "com.example.coreui" }\n`;

describe("Compose apps inside a Gradle project", () => {
  test("the template shape lists the module, not the root", () => {
    const root = makeProject({
      "settings.gradle.kts": 'rootProject.name = "Rafiq"\ninclude(":app")\n',
      "build.gradle.kts": "plugins { alias(libs.plugins.android.application) apply false }\n",
      "app/build.gradle.kts": app(),
      "app/src/main/java/com/example/rafiq/MainActivity.kt": "package com.example.rafiq\n",
    });
    expect(detectStack(root)).toBe("compose");
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([["app", "compose"]]);
  });

  test("Groovy build files and several includes, library modules never listed", () => {
    const root = makeProject({
      "settings.gradle": "include ':app'\ninclude ':core-ui', ':androidApp'\n",
      "app/build.gradle": "plugins {\n  id 'com.android.application'\n  id 'org.jetbrains.kotlin.plugin.compose'\n}\nandroid { namespace 'com.a.b' }\n",
      "androidApp/build.gradle": "plugins { id 'com.android.application' }\nandroid {\n  buildFeatures {\n    compose true\n  }\n}\n",
      "core-ui/build.gradle.kts": library,
    });
    expect(detectApps(root).apps.map((a) => a.path)).toEqual(["androidApp", "app"]);
  });

  test("nested include paths are folders", () => {
    const root = makeProject({
      "settings.gradle.kts": 'include(\n  ":feature:home",\n  ":app"\n)\n// include(":old")\n',
      "feature/home/build.gradle.kts": library,
      "app/build.gradle.kts": app(),
    });
    expect(detectApps(root).apps.map((a) => a.path)).toEqual(["app"]);
  });

  test("a single-module app without settings.gradle stays the root", () => {
    const root = makeProject({ "build.gradle.kts": 'plugins { id("com.android.application") }\nandroid { buildFeatures { compose = true } }\n' });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([[".", "compose"]]);
  });

  test("a project whose only module is a library lists no app", () => {
    const root = makeProject({ "settings.gradle.kts": 'include(":core-ui")\n', "core-ui/build.gradle.kts": library });
    expect(detectApps(root).apps).toEqual([]);
  });
});

describe("Compose apps inside a monorepo", () => {
  test("the Gradle root is found one folder deeper, and its app module listed", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ workspaces: ["dashboard"] }),
      "dashboard/package.json": JSON.stringify({ dependencies: { react: "18", vite: "5" } }),
      "mobile/android/settings.gradle.kts": 'include(":app", ":core-ui")\n',
      "mobile/android/app/build.gradle.kts": app(),
      "mobile/android/core-ui/build.gradle.kts": library,
    });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([["dashboard", "react-web"], ["mobile/android/app", "compose"]]);
  });

  test("a top-level android/ folder lists its module", () => {
    const root = makeProject({
      "web/package.json": JSON.stringify({ dependencies: { react: "18", vite: "5" } }),
      "android/settings.gradle.kts": 'include(":app")\n',
      "android/app/build.gradle.kts": app(),
    });
    expect(detectApps(root).apps.map((a) => a.path)).toEqual(["android/app", "web"]);
  });
});

describe("composeModule", () => {
  test("reads the namespace and the source root", () => {
    const root = makeProject({
      "app/build.gradle.kts": app(),
      "app/src/main/java/x.kt": "",
      "kt/build.gradle.kts": app("com.kt.app"),
      "kt/src/main/kotlin/x.kt": "",
      "man/build.gradle.kts": 'plugins { id("com.android.application") }\nandroid { buildFeatures { compose = true } }\n',
      "man/src/main/AndroidManifest.xml": '<manifest package="com.man.app"/>',
      "lib/build.gradle.kts": library,
    });
    expect(composeModule(join(root, "app"))).toEqual({ namespace: "com.example.rafiq", sourceRoot: "src/main/java" });
    expect(composeModule(join(root, "kt"))).toEqual({ namespace: "com.kt.app", sourceRoot: "src/main/kotlin" });
    expect(composeModule(join(root, "man"))?.namespace).toBe("com.man.app");
    expect(composeModule(join(root, "lib"))).toBeNull();
    expect(composeLibrary(join(root, "lib"))?.namespace).toBe("com.example.coreui");
    expect(composeLibrary(join(root, "app"))).toBeNull();
    expect(packageFolder("com.example.rafiq")).toBe("com/example/rafiq");
  });
});
