import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { defaultDoctorDeps } from "../src/commands/doctor";
import { gradleJava } from "../src/stacks/compose/doctor";
import { HARNESS_SRC, harnessReport, INIT_SCRIPT, runHarness, TEST_CLASS, TEST_RESULTS, variantDrawn } from "../src/stacks/compose/harness";
import { androidToolchain, FIXTURES, hasAndroid, heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const heavy = heavyStackTests("compose", hasAndroid());
if (!heavy.run) console.log(`[compose-flavors] Gradle and Robolectric tests skipped: ${heavy.reason}`);

/**
 * compose-min with two product flavours in one dimension, as `flavors` gives them (their names, in the order declared,
 * and what else each says): it has testDemoDebugUnitTest and testProdDebugUnitTest, no testDebugUnitTest.
 */
function flavouredCopy(flavors: [string, string][] = [["demo", ""], ["prod", ""]]): string {
  const root = join(tempDir("motif-compose-flavors-"), "flavors");
  cpSync(join(FIXTURES, "compose-min"), root, {
    recursive: true,
    filter: (src) => ![".gradle", "build", ".kotlin", "local.properties", ".motif"].includes(basename(src)),
  });
  const file = join(root, "app", "build.gradle.kts");
  const declared = flavors.map(([name, more]) => `        create("${name}") { dimension = "tier"${more ? `; ${more}` : ""} }`).join("\n");
  const gradle = readFileSync(file, "utf8").replace(
    "    buildTypes {",
    `    flavorDimensions += "tier"\n    productFlavors {\n${declared}\n    }\n\n    buildTypes {`,
  );
  for (const [name] of flavors) expect(gradle).toContain(`create("${name}")`);
  writeFileSync(file, gradle);
  return root;
}

/** Draws the copy's / through motifShots, as motif shot does. */
async function drawHome(root: string) {
  const { sdk } = androidToolchain()!;
  const jdk = gradleJava(defaultDoctorDeps());
  if ("problem" in jdk) throw new Error(jdk.problem);
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
  expect(run.result?.shots).toEqual([{ file: "index.mobile.png" }]);
  expect(pngSize(readFileSync(join(outDir, "index.mobile.png")))).toEqual({ width: 780, height: 1688 });
  return { app, run };
}

describe("the Compose harness on an app with product flavours (final review)", () => {
  // Motif ran :app:testDebugUnitTest, which a flavoured app doesn't have: Gradle stopped with "Cannot locate tasks that
  // match ':app:testDebugUnitTest' as task 'testDebugUnitTest' is ambiguous in project ':app'. Candidates are:
  // 'testDemoDebugUnitTest', 'testProdDebugUnitTest'." and nothing was drawn (checked on this copy, 2026-10-21).
  test.skipIf(!heavy.run)("draws the variant Android Studio selects by default, demoDebug, through motifShots (skipped without a JDK and the Android SDK)", async () => {
    const { app, run } = await drawHome(flavouredCopy());
    expect(run.output).toContain("> Task :app:testDemoDebugUnitTest");
    expect(run.output).not.toContain("testProdDebugUnitTest");
    const drawn = variantDrawn(run.output);
    expect(drawn?.name).toBe("demoDebug");
    expect([...(drawn?.of ?? [])].sort()).toEqual(["demoDebug", "demoRelease", "prodDebug", "prodRelease"]);
    // The JUnit report is where Motif reads an Application's failure from, whichever variant ran.
    expect(harnessReport(app)).toBe(join(app, TEST_RESULTS, "testDemoDebugUnitTest", `TEST-${TEST_CLASS}.xml`));
    expect(existsSync(join(app, HARNESS_SRC))).toBe(false);
    expect(existsSync(join(app, INIT_SCRIPT))).toBe(false);
  }, 1_200_000);

  // The 2F fix wave's re-review: a build that marks another flavour isDefault is drawn in that one, as Android Studio
  // selects it; with none marked, the first flavour by name, whatever order they are declared in (AGP's
  // computeDefaultVariant).
  test.skipIf(!heavy.run)("draws prodDebug when prod is marked isDefault (skipped without a JDK and the Android SDK)", async () => {
    const { run } = await drawHome(flavouredCopy([["demo", ""], ["prod", "isDefault = true"]]));
    expect(run.output).toContain("> Task :app:testProdDebugUnitTest");
    expect(run.output).not.toContain("testDemoDebugUnitTest");
    expect(variantDrawn(run.output)?.name).toBe("prodDebug");
  }, 1_200_000);

  test.skipIf(!heavy.run)("with none marked, the first flavour by name, not the first declared (skipped without a JDK and the Android SDK)", async () => {
    const { run } = await drawHome(flavouredCopy([["prod", ""], ["demo", ""]]));
    expect(run.output).toContain("> Task :app:testDemoDebugUnitTest");
    expect(run.output).not.toContain("testProdDebugUnitTest");
  }, 1_200_000);
});
