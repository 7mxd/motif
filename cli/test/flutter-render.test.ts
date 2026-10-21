import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { HARNESS_TEST, runHarness, type FlutterShot } from "../src/stacks/flutter/harness";
import { FIXTURES, hasFlutter } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

const mobile = { route: "/", width: 390, height: 844, dpr: 2, safeTop: 47, safeBottom: 34, locale: "en" };

describe("the Flutter screenshot harness (decision 0007)", () => {
  // Needs the Flutter SDK on the PATH (bun's skipIf takes no reason, so the name says it).
  test.skipIf(!hasFlutter())("renders flutter-min's home in light and dark with flutter test (skipped without Flutter)", async () => {
    const flutter = Bun.which("flutter")!;
    const app = tempDir("motif-flutter-");
    cpSync(join(FIXTURES, "flutter-min"), app, {
      recursive: true,
      filter: (src) => ![".dart_tool", "build"].includes(basename(src)),
    });
    if (run([flutter, "pub", "get", "--offline"], app).code !== 0) {
      // By its exit code: newer pub says "Changed 5 dependencies!" where older pub said "Got dependencies!".
      const online = run([flutter, "pub", "get"], app);
      if (online.code !== 0) console.log(online.out);
      expect(online.code).toBe(0);
    }
    const outDir = tempDir("motif-flutter-shots-");
    const shots: FlutterShot[] = [
      { ...mobile, file: "home.mobile.png", dark: false },
      { ...mobile, file: "home.mobile.dark.png", dark: true },
    ];
    // Fonts are fetched once into this checkout's test cache (gitignored), so later runs are offline.
    const home = join(import.meta.dir, ".tmp", "flutter-home");
    const result = await runHarness({ appDir: app, outDir, shots, googleFonts: ["Onest"], timeoutMs: 540_000, home, flutter });
    if (result.code !== 0) console.log(result.output);
    expect(result.code).toBe(0);
    expect(result.shots).toEqual([{ file: "home.mobile.png" }, { file: "home.mobile.dark.png" }]);

    const light = readFileSync(join(outDir, "home.mobile.png"));
    const dark = readFileSync(join(outDir, "home.mobile.dark.png"));
    expect(pngSize(light)).toEqual({ width: 780, height: 1688 });
    expect(pngSize(dark)).toEqual({ width: 780, height: 1688 });
    expect(Buffer.compare(light, dark)).not.toBe(0);

    // The run leaves only the ignored .motif folder behind, without its test file or options.
    expect(existsSync(join(app, HARNESS_TEST))).toBe(false);
    expect(existsSync(join(app, ".motif/shot/config.json"))).toBe(false);
    expect(readFileSync(join(app, ".motif/.gitignore"), "utf8")).toBe("*\n");
  }, 600_000);
});
