import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runExtract } from "../src/commands/extract";
import type { AppInfo } from "../src/detect/stacks";
import { composeLibraryDependencies } from "../src/stacks/compose/project";
import { shootCompose } from "../src/stacks/compose/shot";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const LIBRARY = (deps = "") =>
  `plugins {\n    alias(libs.plugins.android.library)\n    alias(libs.plugins.kotlin.compose)\n}\nandroid { namespace = "com.example.lib" }\ndependencies {\n${deps}}\n`;
const APP = `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}
android {
    namespace = "com.example.rafiq"
    buildFeatures { compose = true }
}
dependencies {
    implementation(project(":core:ui"))
    implementation(projects.feature.home)
    // implementation(project(":feature:unused"))
}
`;

/**
 * An app module and the modules of a "Now in Android"-shaped project: two Compose libraries it depends on (one through
 * a type-safe accessor), a data module without Compose, and a Compose library nothing uses.
 */
const project = () =>
  makeProject({
    "settings.gradle.kts": 'rootProject.name = "Rafiq"\ninclude(":app", ":core:ui", ":core:data")\ninclude(":feature:home")\ninclude(":feature:unused")\n',
    "app/build.gradle.kts": APP,
    "app/src/main/java/com/example/rafiq/MainActivity.kt": "package com.example.rafiq\n\n@Preview @Composable fun MainPreview() {}\n",
    "core/ui/build.gradle.kts": LIBRARY(),
    "core/ui/src/main/java/com/example/core/ui/Colors.kt": "package com.example.core.ui\n\nval Brand = Color(0xFF3B82F6)\n",
    "core/data/build.gradle.kts": "plugins {\n    alias(libs.plugins.android.library)\n}\n",
    "feature/home/build.gradle.kts": LIBRARY('    implementation(project(":core:data"))\n    implementation(project(path = ":core:ui"))\n'),
    "feature/unused/build.gradle.kts": LIBRARY(),
    "design/tokens.json": TOKENS,
  });

const NOTE = "app depends on Compose modules Motif doesn't read yet (:core:ui and :feature:home)";

describe("a Compose app's library modules (final review)", () => {
  test("are the Compose libraries its build file depends on, through project(…) and type-safe accessors, and theirs", () => {
    const root = project();
    expect(composeLibraryDependencies(root, join(root, "app"))).toEqual([":core:ui", ":feature:home"]);
    // A library's own dependencies count too: :feature:home's :core:ui, and a module without Compose isn't one.
    expect(composeLibraryDependencies(root, join(root, "feature/home"))).toEqual([":core:ui"]);
    const single = makeProject({ "build.gradle.kts": APP.replace(/ {4}implementation\(proj.*\n/g, "") });
    expect(composeLibraryDependencies(single, single)).toEqual([]);
  });

  test("motif check names those it didn't read", async () => {
    const r = await runCheck(project(), { positionals: [] });
    expect(r.text).toContain(`• ${NOTE}: motif check reads an app module's own code, so theirs wasn't checked.`);
    expect(r.data.notes).toEqual([`${NOTE}: motif check reads an app module's own code, so theirs wasn't checked.`]);
  });

  test("motif extract names them in its notes", async () => {
    const r = await runExtract(project(), { positionals: [] });
    expect(r.data.notes).toContain(`${NOTE}: motif extract reads an app module's own code, so colours and type defined there aren't in the draft.`);
  });

  test("motif shot names them in its notes: their previews and routes aren't found", async () => {
    const root = project();
    const got = await shootCompose(
      {
        root,
        app: { path: "app", stack: "compose", source: "detected" } as AppInfo,
        routes: ["/"],
        screens: [],
        outDir: join(root, "design/shots"),
        viewports: [{ name: "mobile", width: 390, height: 844, scale: 2, mobile: true }],
        variants: [],
        states: [],
        audit: false,
        timeoutMs: 1000,
      },
      { jdk: { java: "/jdk/bin/java", javaHome: "/jdk" }, sdk: "/sdk", robolectricCache: root, run: async () => ({ code: 0, timedOut: false, output: "", result: { screens: [] } }) },
    );
    expect(got.notes).toContain(`${NOTE}: their previews can't be taken with --screen, and routes declared there are found only when you give them with --routes.`);
  });
});
