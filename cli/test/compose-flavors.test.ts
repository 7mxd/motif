import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { defaultDoctorDeps } from "../src/commands/doctor";
import { gradleJava } from "../src/stacks/compose/doctor";
import { HARNESS_SRC, harnessReport, INIT_SCRIPT, runHarness, TEST_CLASS, TEST_RESULTS } from "../src/stacks/compose/harness";
import { androidToolchain, FIXTURES, hasAndroid, heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const heavy = heavyStackTests("compose", hasAndroid());
if (!heavy.run) console.log(`[compose-flavors] Gradle and Robolectric tests skipped: ${heavy.reason}`);

/** compose-min with two product flavours, demo and prod: it has testDemoDebugUnitTest and testProdDebugUnitTest, no testDebugUnitTest. */
function flavouredCopy(): string {
  const root = join(tempDir("motif-compose-flavors-"), "flavors");
  cpSync(join(FIXTURES, "compose-min"), root, {
    recursive: true,
    filter: (src) => ![".gradle", "build", ".kotlin", "local.properties", ".motif"].includes(basename(src)),
  });
  const file = join(root, "app", "build.gradle.kts");
  const gradle = readFileSync(file, "utf8").replace(
    "    buildTypes {",
    '    flavorDimensions += "tier"\n    productFlavors {\n        create("demo") { dimension = "tier" }\n        create("prod") { dimension = "tier" }\n    }\n\n    buildTypes {',
  );
  expect(gradle).toContain('create("demo")');
  writeFileSync(file, gradle);
  return root;
}

describe("the Compose harness on an app with product flavours (final review)", () => {
  // Motif ran :app:testDebugUnitTest, which a flavoured app doesn't have: Gradle stopped with "Cannot locate tasks that
  // match ':app:testDebugUnitTest' as task 'testDebugUnitTest' is ambiguous in project ':app'. Candidates are:
  // 'testDemoDebugUnitTest', 'testProdDebugUnitTest'." and nothing was drawn (checked on this copy, 2026-10-21).
  test.skipIf(!heavy.run)("draws the first debug variant's screen, demoDebug, through motifShots (skipped without a JDK and the Android SDK)", async () => {
    const { sdk } = androidToolchain()!;
    const jdk = gradleJava(defaultDoctorDeps());
    if ("problem" in jdk) throw new Error(jdk.problem);
    const root = flavouredCopy();
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
    expect(run.code).toBe(0);
    expect(run.output).toContain("> Task :app:testDemoDebugUnitTest");
    expect(run.output).not.toContain("testProdDebugUnitTest");
    expect(run.result?.shots).toEqual([{ file: "index.mobile.png" }]);
    expect(pngSize(readFileSync(join(outDir, "index.mobile.png")))).toEqual({ width: 780, height: 1688 });
    // The JUnit report is where Motif reads an Application's failure from, whichever variant ran.
    expect(harnessReport(app)).toBe(join(app, TEST_RESULTS, "testDemoDebugUnitTest", `TEST-${TEST_CLASS}.xml`));
    expect(existsSync(join(app, HARNESS_SRC))).toBe(false);
    expect(existsSync(join(app, INIT_SCRIPT))).toBe(false);
  }, 1_200_000);
});
