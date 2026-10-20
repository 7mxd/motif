import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { defaultDoctorDeps } from "../src/commands/doctor";
import { gradleJava } from "../src/stacks/compose/doctor";
import { HARNESS_SRC, INIT_SCRIPT, runHarness } from "../src/stacks/compose/harness";
import { androidToolchain, FIXTURES, hasAndroid, heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const heavy = heavyStackTests("compose", hasAndroid());
if (!heavy.run) console.log(`[compose-agp9] Gradle and Robolectric tests skipped: ${heavy.reason}`);

describe("the Compose harness on the Android Gradle Plugin 9 (Task 15)", () => {
  // AGP 9's built-in Kotlin compiles only the source sets' kotlin folders: with the harness's test added under java alone,
  // Gradle built the app, said NO-SOURCE for the test, and nothing was drawn (found by hand on JetNews).
  test.skipIf(!heavy.run)("draws compose-agp9's screen, with no Kotlin Android plugin (skipped without a JDK and the Android SDK)", async () => {
    const { sdk } = androidToolchain()!;
    const jdk = gradleJava(defaultDoctorDeps());
    if ("problem" in jdk) throw new Error(jdk.problem);
    const root = join(tempDir("motif-compose-agp9-"), "app9");
    cpSync(join(FIXTURES, "compose-agp9"), root, {
      recursive: true,
      filter: (src) => ![".gradle", "build", ".kotlin", "local.properties", ".motif"].includes(basename(src)),
    });
    expect(readFileSync(join(root, "app", "build.gradle.kts"), "utf8")).not.toContain("libs.plugins.kotlin.android");
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
    expect(run.output).not.toMatch(/testDebugUnitTest NO-SOURCE/);
    expect(run.code).toBe(0);
    expect(run.result?.shots).toEqual([{ file: "index.mobile.png" }]);
    expect(pngSize(readFileSync(join(outDir, "index.mobile.png")))).toEqual({ width: 780, height: 1688 });
    expect(existsSync(join(app, HARNESS_SRC))).toBe(false);
    expect(existsSync(join(app, INIT_SCRIPT))).toBe(false);
  }, 1_200_000);
});
