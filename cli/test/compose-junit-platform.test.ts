import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { defaultDoctorDeps } from "../src/commands/doctor";
import { gradleJava } from "../src/stacks/compose/doctor";
import { HARNESS_SRC, INIT_SCRIPT, runHarness } from "../src/stacks/compose/harness";
import { androidToolchain, FIXTURES, hasAndroid, heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const heavy = heavyStackTests("compose", hasAndroid());
if (!heavy.run) console.log(`[compose-junit-platform] Gradle and Robolectric tests skipped: ${heavy.reason}`);

/** compose-min whose unit tests run on the JUnit Platform with JUnit 5 (Jupiter) and no vintage engine, as many apps' do. */
function jupiterCopy(): string {
  const root = join(tempDir("motif-compose-junit5-"), "junit5");
  cpSync(join(FIXTURES, "compose-min"), root, {
    recursive: true,
    filter: (src) => ![".gradle", "build", ".kotlin", "local.properties", ".motif"].includes(basename(src)),
  });
  const file = join(root, "app", "build.gradle.kts");
  const gradle = readFileSync(file, "utf8")
    .replace("    buildFeatures {", "    testOptions {\n        unitTests.all { it.useJUnitPlatform() }\n    }\n    buildFeatures {")
    .replace(
      "    debugImplementation(libs.androidx.compose.ui.tooling)",
      '    debugImplementation(libs.androidx.compose.ui.tooling)\n    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")\n    testRuntimeOnly("org.junit.platform:junit-platform-launcher")',
    );
  expect(gradle).toContain("useJUnitPlatform()");
  expect(gradle).toContain("junit-jupiter:5.11.4");
  writeFileSync(file, gradle);
  return root;
}

describe("the Compose harness in an app whose unit tests run on the JUnit Platform (final review)", () => {
  // The harness is a JUnit 4 test (Robolectric's runner). On the JUnit Platform without the vintage engine Gradle finds
  // no test in it: "No tests found for given includes: [dev.motif.shot.MotifShotTest]".
  test.skipIf(!heavy.run)("draws the screen: init.gradle adds the vintage engine, at the app's JUnit version (skipped without a JDK and the Android SDK)", async () => {
    const { sdk } = androidToolchain()!;
    const jdk = gradleJava(defaultDoctorDeps());
    if ("problem" in jdk) throw new Error(jdk.problem);
    const root = jupiterCopy();
    const app = join(root, "app");
    const outDir = join(root, "shots");
    const run = await runHarness({
      projectDir: root,
      moduleDir: app,
      ...jdk,
      sdk,
      config: { outDir, shots: [{ route: "/", width: 390, height: 844, locale: "en", file: "index.mobile.png", dark: false }] },
      timeoutMs: 1_100_000,
    });
    if (run.code !== 0) console.log(run.output.split(/\r?\n/).slice(-40).join("\n"));
    expect(run.output).not.toContain("No tests found for given includes");
    expect(run.code).toBe(0);
    expect(run.result?.shots).toEqual([{ file: "index.mobile.png" }]);
    expect(pngSize(readFileSync(join(outDir, "index.mobile.png")))).toEqual({ width: 780, height: 1688 });
    expect(existsSync(join(app, HARNESS_SRC))).toBe(false);
    expect(existsSync(join(app, INIT_SCRIPT))).toBe(false);
  }, 1_200_000);
});
