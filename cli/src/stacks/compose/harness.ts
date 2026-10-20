// The runner for the Compose screenshot harness (decision 0008): writes the Kotlin test and the Gradle init script into
// <module>/.motif/shot/, runs the project's own Gradle wrapper on them, and always removes what it wrote. Task 9 builds
// motif shot on it.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { onExit } from "../../cleanup";
import { killTree } from "../../shot/devserver";
import { type FetchLike, googleFontFiles } from "../flutter/harness";
import testSource from "./harness/MotifShotTest.kt" with { type: "text" };
import initSource from "./harness/init.gradle" with { type: "text" };

/** The harness's test, under the test source folder init.gradle adds (relative to the module). */
export const HARNESS_TEST = ".motif/shot/src/dev/motif/shot/MotifShotTest.kt";
export const HARNESS_SRC = ".motif/shot/src";
export const INIT_SCRIPT = ".motif/shot/init.gradle";
/** The run's options; init.gradle hands its path to the test as the system property motif.shot.config. */
export const CONFIG_FILE = ".motif/shot/config.json";
/** Where the harness writes what it did; cleared before every run. */
export const RESULT_FILE = ".motif/shot/result.json";
export const TEST_CLASS = "dev.motif.shot.MotifShotTest";
/** How long Motif waits for a stopped run's output and exit before giving up on them. */
export const GRACE_MS = 3000;

/** The Kotlin test, the same in every run. */
export const HARNESS_SOURCE: string = testSource;
/** The Gradle init script, the same in every run. */
export const INIT_SOURCE: string = initSource;

export interface ComposeShot {
  /** The PNG's file name in outDir. */
  file: string;
  /** The screen it belongs to in the result: its route, or its preview's name. */
  target?: string;
  /** A route to open (/ is the launcher activity); a preview sets preview instead. */
  route?: string;
  /** A @Preview function as the JVM sees it: <package>.<File>Kt.<function>. */
  preview?: string;
  /** Logical size in dp; drawn at density (xhdpi, 2×), so 390×844 gives a 780×1688 PNG. */
  width: number;
  height: number;
  density?: string;
  dark: boolean;
  /** en, ar, or en_US. */
  locale: string;
  rtl?: boolean;
  /** The variant as the generated MotifVariant names it (Partner); the default's shots name the default. */
  variant?: string;
  /** Remove animations (Settings.Global.ANIMATOR_DURATION_SCALE = 0). */
  reduceMotion?: boolean;
}

export interface ComposeFontFace {
  path: string;
  weight: number;
  italic: boolean;
}

/** A family MotifFonts.debugFontOverride answers with, by the guide's family name. */
export interface ComposeFont {
  family: string;
  files: ComposeFontFace[];
}

export interface HarnessConfig {
  outDir: string;
  shots: ComposeShot[];
  fonts?: ComposeFont[];
  /** The generated theme's classes (<package>.MotifTheme, .MotifVariant, .MotifFonts), when the app has them. */
  variantClass?: string;
  variantEnum?: string;
  fontsClass?: string;
}

/**
 * A Google Fonts family's faces from Motif's font cache (motifHome()/fonts/google/, fetched once, as Flutter's harness
 * does), with the weight and style each file holds, for MotifFonts.debugFontOverride.
 */
export async function composeFont(
  family: string,
  home: string,
  opts: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<{ font: ComposeFont | null; notes: string[] }> {
  const found = await googleFontFiles(family, home, opts);
  const prefix = `${family.replace(/ /g, "")}_`;
  const files = found.fonts.flatMap((f) => {
    const variant = f.family.startsWith(prefix) ? /^(\d+)?(regular|italic)?$/.exec(f.family.slice(prefix.length)) : null;
    if (!variant || !f.files[0]) return [];
    return [{ path: f.files[0], weight: Number(variant[1] ?? 400), italic: variant[2] === "italic" }];
  });
  return { font: files.length > 0 ? { family, files } : null, notes: found.notes };
}

/** Writes .motif/.gitignore, the test, the init script and the run's options into the module's folder. */
export function writeHarness(moduleDir: string, config: HarnessConfig): void {
  const motifDir = join(moduleDir, ".motif");
  mkdirSync(dirname(join(moduleDir, HARNESS_TEST)), { recursive: true });
  writeFileSync(join(motifDir, ".gitignore"), "*\n");
  writeFileSync(join(moduleDir, HARNESS_TEST), HARNESS_SOURCE);
  writeFileSync(join(moduleDir, INIT_SCRIPT), INIT_SOURCE);
  const options = { ...config, outDir: resolve(config.outDir), resultPath: resolve(moduleDir, RESULT_FILE) };
  writeFileSync(join(moduleDir, CONFIG_FILE), JSON.stringify(options));
}

/** Removes the test sources, the init script and the options; .motif/.gitignore and result.json stay. */
export function removeHarness(moduleDir: string): void {
  rmSync(join(moduleDir, HARNESS_SRC), { recursive: true, force: true });
  for (const file of [INIT_SCRIPT, CONFIG_FILE]) rmSync(join(moduleDir, file), { force: true });
}

/**
 * The Gradle run, from the project's root: its wrapper's jar started with java directly, not gradlew.bat, which breaks
 * on a path with "&" in it (it sets DIRNAME=%~dp0 unquoted). Every path in it is relative to the root.
 */
export function gradleCommand(java: string, projectDir: string, moduleDir: string): string[] {
  const rel = relative(projectDir, moduleDir).split("\\").join("/");
  const module = rel === "" ? "" : `:${rel.split("/").join(":")}`;
  return [
    java,
    "-Xmx64m",
    "-Xms64m",
    "-Dorg.gradle.appname=gradlew",
    "-classpath",
    "gradle/wrapper/gradle-wrapper.jar",
    "org.gradle.wrapper.GradleWrapperMain",
    `${module}:testDebugUnitTest`,
    "--tests",
    TEST_CLASS,
    "-I",
    `${rel === "" ? "" : `${rel}/`}${INIT_SCRIPT}`,
    "--console=plain",
  ];
}

export interface HarnessRun {
  /** The Gradle project's root (where gradle/wrapper/ is). */
  projectDir: string;
  /** The app module's folder (the one with com.android.application). */
  moduleDir: string;
  java: string;
  /** The Android SDK, for a project with no local.properties (given to Gradle as ANDROID_HOME). */
  sdk?: string;
  config: HarnessConfig;
  timeoutMs: number;
}

export interface HarnessResult {
  code: number | null;
  timedOut: boolean;
  output: string;
  /** result.json as the harness wrote it; null when it wrote none, or one that can't be read. */
  result: Record<string, unknown> | null;
}

/** Runs the harness and returns what Gradle said; the files it wrote are always removed. */
export async function runHarness(run: HarnessRun): Promise<HarnessResult> {
  if (!existsSync(join(run.projectDir, "gradle", "wrapper", "gradle-wrapper.jar"))) {
    throw new Error(`No Gradle wrapper in ${run.projectDir} (gradle/wrapper/gradle-wrapper.jar).`);
  }
  const resultPath = join(run.moduleDir, RESULT_FILE);
  // A run that fails before writing anything mustn't return the last run's screenshots.
  for (const old of [resultPath, ...run.config.shots.map((s) => join(run.config.outDir, s.file))]) rmSync(old, { force: true });
  let cancelExitHook = onExit(() => removeHarness(run.moduleDir));
  let timer: Timer | undefined;
  try {
    writeHarness(run.moduleDir, run.config);
    const env: Record<string, string | undefined> = { ...process.env };
    // Gradle and the Android plugin look for the JDK and the SDK there when the project doesn't say.
    env.JAVA_HOME ||= dirname(dirname(run.java));
    if (run.sdk) env.ANDROID_HOME ||= run.sdk;
    const proc = Bun.spawn(gradleCommand(run.java, run.projectDir, run.moduleDir), {
      cwd: run.projectDir,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    cancelExitHook();
    cancelExitHook = onExit(() => {
      killTree(proc.pid, true);
      removeHarness(run.moduleDir);
    });
    const out = new Response(proc.stdout).text();
    const err = new Response(proc.stderr).text();
    const timedOut = await new Promise<boolean>((done) => {
      timer = setTimeout(() => done(true), run.timeoutMs);
      void proc.exited.then(() => done(false));
    });
    // A stopped client makes the Gradle daemon cancel the build (and its test JVM); the daemon itself stays for the
    // next run unless this client started it.
    if (timedOut) killTree(proc.pid, true);
    const grace = <T>(p: Promise<T>) => Promise.race([p, Bun.sleep(GRACE_MS).then(() => null)]);
    const code = await grace(proc.exited);
    let result: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed;
    } catch {
      // None written, or cut short: Task 9 tells these apart.
    }
    return { code, timedOut, output: `${await out}\n${await err}`, result };
  } finally {
    clearTimeout(timer);
    cancelExitHook();
    removeHarness(run.moduleDir);
  }
}
