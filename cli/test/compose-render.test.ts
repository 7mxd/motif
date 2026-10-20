import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { CONFIG_FILE, HARNESS_SRC, INIT_SCRIPT, runHarness, type ComposeShot } from "../src/stacks/compose/harness";
import { androidToolchain, FIXTURES, hasAndroid } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const mobile = { route: "/", width: 390, height: 844, locale: "en" };

describe("the Compose screenshot harness (decision 0008)", () => {
  // Needs a JDK and the Android SDK (bun's skipIf takes no reason, so the name says it). The first run on a machine
  // downloads Gradle, the Android plugin, Compose and Robolectric's Android jars.
  test.skipIf(!hasAndroid())("draws compose-min's home in light and dark with Robolectric (skipped without a JDK and the Android SDK)", async () => {
    const { java, sdk } = androidToolchain()!;
    // A space and an "&" in the path: gradlew.bat breaks on the "&", so Motif starts the wrapper's jar itself.
    const root = join(tempDir("motif-compose-render-"), "my app & co");
    cpSync(join(FIXTURES, "compose-min"), root, {
      recursive: true,
      filter: (src) => ![".gradle", "build", ".kotlin", "local.properties", ".motif"].includes(basename(src)),
    });
    const app = join(root, "app");
    const outDir = join(root, "shots");
    const shots: ComposeShot[] = [
      { ...mobile, file: "home.mobile.png", dark: false },
      { ...mobile, file: "home.mobile.dark.png", dark: true },
    ];
    // No local.properties: the SDK goes to Gradle as ANDROID_HOME.
    const run = await runHarness({ projectDir: root, moduleDir: app, java, sdk, config: { outDir, shots }, timeoutMs: 1_100_000 });
    if (run.code !== 0) console.log(run.output.split(/\r?\n/).slice(-40).join("\n"));
    expect(run.code).toBe(0);
    expect(run.result?.shots).toEqual([{ file: "home.mobile.png" }, { file: "home.mobile.dark.png" }]);

    const light = readFileSync(join(outDir, "home.mobile.png"));
    const dark = readFileSync(join(outDir, "home.mobile.dark.png"));
    expect(pngSize(light)).toEqual({ width: 780, height: 1688 });
    expect(pngSize(dark)).toEqual({ width: 780, height: 1688 });
    expect(Buffer.compare(light, dark)).not.toBe(0);

    // The run leaves only the ignored .motif folder behind, without the test, the init script or the options.
    expect(existsSync(join(app, HARNESS_SRC))).toBe(false);
    expect(existsSync(join(app, INIT_SCRIPT))).toBe(false);
    expect(existsSync(join(app, CONFIG_FILE))).toBe(false);
    expect(readFileSync(join(app, ".motif/.gitignore"), "utf8")).toBe("*\n");
  }, 1_200_000);
});
