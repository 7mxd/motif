import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { copyFixture } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO_ROOT = join(import.meta.dir, "../..");
const browser = findBrowser();
let bin = "";

describe.skipIf(!browser)("compiled motif preview (needs Chrome, Edge or Chromium)", () => {
  beforeAll(() => {
    bin = join(tempDir("motif-build-"), process.platform === "win32" ? "motif.exe" : "motif");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", bin]);
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  }, 180_000);

  const run = (args: string[]) => Bun.spawnSync([bin, ...args, "--json"], { env: { ...process.env, MOTIF_HOME: tempDir("motif-home-") } });

  test("renders the starter mockup with the project's design guide", () => {
    const root = copyFixture();
    mkdirSync(join(root, "design", "previews"), { recursive: true });
    writeFileSync(join(root, "design", "previews", "today.html"), readFileSync(join(REPO_ROOT, "skill/preview-kit/template.html"), "utf8"));
    const r = run(["preview", "design/previews/today.html", "--png-only", "--cwd", root]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout.toString()).pngs).toEqual(["design/previews/today.png", "design/previews/today.dark.png"]);
    // The phone frame is 410×864 including its bezel, at 2×.
    expect(pngSize(new Uint8Array(readFileSync(join(root, "design", "previews", "today.png"))))).toEqual({ width: 820, height: 1728 });
  }, 120_000);

  test("--gallery --png-only renders all 8 starting styles in light and dark", () => {
    const root = tempDir("motif-gallery-");
    const r = run(["preview", "--gallery", "--png-only", "--out", "shots", "--cwd", root]);
    expect(r.exitCode).toBe(0);
    const pngs = readdirSync(join(root, "shots")).sort();
    expect(pngs).toHaveLength(16);
    expect(pngs).toContain("preset-dark-tech.dark.png");
  }, 180_000);
});
