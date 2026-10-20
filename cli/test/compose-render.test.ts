import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { inflateSync } from "node:zlib";
import { pngSize } from "../src/browser/png";
import { defaultDoctorDeps } from "../src/commands/doctor";
import { gradleJava } from "../src/stacks/compose/doctor";
import { CONFIG_FILE, HARNESS_SRC, INIT_SCRIPT, runHarness, type ComposeShot } from "../src/stacks/compose/harness";
import { androidToolchain, FIXTURES, hasAndroid, heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const mobile = { route: "/", width: 390, height: 844, locale: "en" };

/** How many different colours an 8-bit RGB or RGBA PNG has, counting up to max. */
function colours(png: Buffer, max = 2): number {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bpp = png[25] === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * bpp;
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  const seen = new Set<string>();
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? line[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[x] = (v + [0, a, b, (a + b) >> 1, paeth][filter]!) & 0xff;
    }
    for (let x = 0; x < stride; x += bpp) {
      seen.add(line.subarray(x, x + bpp).join(","));
      if (seen.size >= max) return seen.size;
    }
    prev.set(line);
  }
  return seen.size;
}

const heavy = heavyStackTests("compose", hasAndroid());
if (!heavy.run) console.log(`[compose-render] Gradle and Robolectric tests skipped: ${heavy.reason}`);

describe("the Compose screenshot harness (decision 0008)", () => {
  // Needs a JDK and the Android SDK (bun's skipIf takes no reason, so the name says it). The first run on a machine
  // downloads Gradle, the Android plugin, Compose and Robolectric's Android jars.
  test.skipIf(!heavy.run)("draws compose-min's home in light and dark with Robolectric (skipped without a JDK and the Android SDK)", async () => {
    const { sdk } = androidToolchain()!;
    const jdk = gradleJava(defaultDoctorDeps());
    if ("problem" in jdk) throw new Error(jdk.problem);
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
    const run = await runHarness({ projectDir: root, moduleDir: app, ...jdk, sdk, config: { outDir, shots }, timeoutMs: 1_100_000 });
    if (run.code !== 0) console.log(run.output.split(/\r?\n/).slice(-40).join("\n"));
    expect(run.code).toBe(0);
    expect(run.result?.shots).toEqual([{ file: "home.mobile.png" }, { file: "home.mobile.dark.png" }]);

    const light = readFileSync(join(outDir, "home.mobile.png"));
    const dark = readFileSync(join(outDir, "home.mobile.dark.png"));
    expect(pngSize(light)).toEqual({ width: 780, height: 1688 });
    expect(pngSize(dark)).toEqual({ width: 780, height: 1688 });
    expect(Buffer.compare(light, dark)).not.toBe(0);
    // Something is drawn: a blank window would pass the checks above.
    expect(colours(light)).toBeGreaterThan(1);

    // The run leaves only the ignored .motif folder behind, without the test, the init script or the options.
    expect(existsSync(join(app, HARNESS_SRC))).toBe(false);
    expect(existsSync(join(app, INIT_SCRIPT))).toBe(false);
    expect(existsSync(join(app, CONFIG_FILE))).toBe(false);
    expect(readFileSync(join(app, ".motif/.gitignore"), "utf8")).toBe("*\n");
  }, 1_200_000);
});
