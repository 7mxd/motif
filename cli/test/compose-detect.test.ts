import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defaultDoctorDeps, runDoctor, type DoctorItem } from "../src/commands/doctor";
import { runTokens } from "../src/commands/tokens";
import { detectApps, detectStack, STACK_LABELS } from "../src/detect/stacks";
import { composeLibrary, composeModule, packageFolder } from "../src/stacks/compose/project";
import { validTokens } from "./helpers";
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

  test("a Compose Multiplatform module is Compose Multiplatform, which isn't supported yet: no theme in a folder KMP won't compile (final review)", async () => {
    // The Kotlin Multiplatform wizard's composeApp: the Android application plugin and Compose, with its code in
    // src/commonMain, where a theme under src/main/java wouldn't be compiled.
    const kmp = `plugins {\n    alias(libs.plugins.kotlinMultiplatform)\n    alias(libs.plugins.androidApplication)\n    alias(libs.plugins.composeMultiplatform)\n    alias(libs.plugins.composeCompiler)\n}\nkotlin { androidTarget() }\nandroid { namespace = "com.example.kmp" }\n`;
    const root = makeProject({
      "settings.gradle.kts": 'rootProject.name = "Kmp"\ninclude(":composeApp")\n',
      "build.gradle.kts": "plugins {\n    alias(libs.plugins.androidApplication) apply false\n    alias(libs.plugins.kotlinMultiplatform) apply false\n}\n",
      "composeApp/build.gradle.kts": kmp,
      "composeApp/src/commonMain/kotlin/App.kt": "@Composable fun App() {}\n",
      "design/tokens.json": JSON.stringify(validTokens()),
    });
    expect(detectApps(root).apps.map((a) => [a.path, a.stack])).toEqual([["composeApp", "compose-multiplatform"]]);
    expect(STACK_LABELS["compose-multiplatform"]).toBe("Compose Multiplatform");
    const doctor = (await runDoctor(root, defaultDoctorDeps())).data.items as DoctorItem[];
    expect(doctor.find((i) => i.id === "app:composeApp")).toMatchObject({
      status: "optional",
      detail: "Compose Multiplatform detected. Full support is coming soon; Motif will still help using general guidance.",
    });
    // No Kotlin theme is written where KMP wouldn't compile it.
    const tokens = await runTokens(root, { positionals: [], flags: {} });
    expect(existsSync(join(root, "composeApp/src/main"))).toBe(false);
    expect(tokens.text).toContain("Compose Multiplatform support is coming soon.");
    // A plain Kotlin Android plugin isn't multiplatform, and kotlin("multiplatform") is.
    const groovy = makeProject({ "settings.gradle": "include ':shared'\n", "shared/build.gradle": "plugins {\n  id 'org.jetbrains.kotlin.multiplatform'\n  id 'com.android.application'\n  id 'org.jetbrains.compose'\n}\nandroid { buildFeatures { compose true } }\n" });
    expect(detectApps(groovy).apps.map((a) => [a.path, a.stack])).toEqual([["shared", "compose-multiplatform"]]);
    const dsl = makeProject({ "build.gradle.kts": 'plugins {\n    kotlin("multiplatform")\n    id("com.android.application")\n}\nandroid { buildFeatures { compose = true } }\n' });
    expect(detectApps(dsl).apps.map((a) => [a.path, a.stack])).toEqual([[".", "compose-multiplatform"]]);
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

describe("an Android Studio template root", () => {
  test("its `apply false` plugins don't make the root a Compose app", () => {
    const root = makeProject({
      "settings.gradle.kts": 'rootProject.name = "Rafiq"\ninclude(":app")\n',
      "build.gradle.kts":
        "// Top-level build file where you can add configuration options common to all sub-projects/modules.\n" +
        "plugins {\n    alias(libs.plugins.android.application) apply false\n    alias(libs.plugins.kotlin.android) apply false\n    alias(libs.plugins.kotlin.compose) apply false\n}\n",
      // The app takes its plugins from a convention plugin the detector can't read.
      "app/build.gradle.kts": 'plugins {\n    id("rafiq.android.app")\n}\nandroid { namespace = "com.example.rafiq" }\n',
    });
    expect(composeModule(root)).toBeNull();
    expect(detectApps(root).apps).toEqual([]);
  });

  test("a real plugin line beside `apply false` ones still counts", () => {
    const root = makeProject({
      "build.gradle.kts": "plugins {\n    alias(libs.plugins.android.application)\n    alias(libs.plugins.kotlin.compose)\n    alias(libs.plugins.hilt) apply false\n}\n",
    });
    expect(composeModule(root)).not.toBeNull();
  });
});
