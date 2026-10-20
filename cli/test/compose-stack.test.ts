import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { COMPOSE } from "../src/stacks/compose";
import { nativeStack } from "../src/stacks/native";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const gradle = (namespace: string) =>
  `plugins {\n  alias(libs.plugins.android.application)\n  alias(libs.plugins.kotlin.compose)\n}\nandroid { namespace = "${namespace}" }\n`;

describe("the Compose stack", () => {
  test("is registered, with only what Task 2 gives it", () => {
    expect(nativeStack("compose")).toBe(COMPOSE);
    expect(COMPOSE.extensions).toEqual([".kt"]);
    for (const absent of ["scan", "generate", "collect", "shoot", "routes", "wiring"] as const) expect(COMPOSE[absent]).toBeUndefined();
  });

  test("theme code goes in the app's own package, under ui/motif", () => {
    const root = makeProject({
      "settings.gradle.kts": 'include(":app")\n',
      "app/build.gradle.kts": gradle("com.example.rafiq"),
      "app/src/main/java/com/example/rafiq/Main.kt": "package com.example.rafiq\n",
    });
    const [app] = detectApps(root).apps;
    expect(COMPOSE.themeDir(root, app!)).toBe("app/src/main/java/com/example/rafiq/ui/motif");
    expect(COMPOSE.sourceFiles!(root, app!, {}).map((f) => f.path)).toEqual(["app/src/main/java/com/example/rafiq/Main.kt"]);
  });

  test("a single-module app at the root, Kotlin source folder", () => {
    const root = makeProject({ "build.gradle.kts": gradle("com.kt.app"), "src/main/kotlin/Main.kt": "" });
    const [app] = detectApps(root).apps;
    expect(COMPOSE.themeDir(root, app!)).toBe("src/main/kotlin/com/kt/app/ui/motif");
  });

  test("an unknown namespace falls back to ui/motif, and themeDir from motif.json wins", () => {
    const root = makeProject({
      "settings.gradle.kts": 'include(":app")\n',
      "app/build.gradle.kts": "plugins {\n  alias(libs.plugins.android.application)\n  alias(libs.plugins.kotlin.compose)\n}\n",
    });
    const [app] = detectApps(root).apps;
    expect(COMPOSE.themeDir(root, app!)).toBe("app/src/main/kotlin/ui/motif");
    expect(COMPOSE.themeDir(root, { ...app!, themeDir: "app/src/main/java/design" })).toBe("app/src/main/java/design");
    expect(join(root)).toBeTruthy();
  });
});
