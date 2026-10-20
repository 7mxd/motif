// The runner for the Compose screenshot harness (decision 0008): writes the Kotlin test and the Gradle init script into
// <module>/.motif/shot/, runs the project's own Gradle wrapper on them, and always removes what it wrote. motif shot
// (shot.ts) builds on it.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { onExit } from "../../cleanup";
import { killTree } from "../../shot/devserver";
import { type FetchLike, googleFontFiles } from "../flutter/harness";
import auditSource from "./harness/MotifAudit.kt" with { type: "text" };
import testSource from "./harness/MotifShotTest.kt" with { type: "text" };
import initSource from "./harness/init.gradle" with { type: "text" };

/** The harness's test, under the test source folder init.gradle adds (relative to the module). */
export const HARNESS_TEST = ".motif/shot/src/dev/motif/shot/MotifShotTest.kt";
/** The audit's checks (--audit), next to the test. */
export const HARNESS_AUDIT = ".motif/shot/src/dev/motif/shot/MotifAudit.kt";
export const HARNESS_SRC = ".motif/shot/src";
export const INIT_SCRIPT = ".motif/shot/init.gradle";
/** The run's options; init.gradle hands its path to the test as the system property motif.shot.config. */
export const CONFIG_FILE = ".motif/shot/config.json";
/** The run's screens, one a line, next to the options: the harness runs one test for each. */
export const TARGETS_FILE = ".motif/shot/targets.txt";
/** Where the harness writes what it did; deleted once read (kept with MOTIF_DEBUG), and before every run. */
export const RESULT_FILE = ".motif/shot/result.json";
export const TEST_CLASS = "dev.motif.shot.MotifShotTest";
/** How long Motif waits for a stopped run's output and exit before giving up on them. */
export const GRACE_MS = 3000;

/** The Kotlin test, the same in every run. */
export const HARNESS_SOURCE: string = testSource;
/** The audit the test calls, the same in every run. */
export const AUDIT_SOURCE: string = auditSource;
/** The Gradle init script, the same in every run. */
export const INIT_SOURCE: string = initSource;

export interface ComposeShot {
  /** The PNG's file name in outDir. */
  file: string;
  /** The size as screenshot names give it (mobile-360, mobile, tablet…), for the audit's issues. */
  size?: string;
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
  /** Right to left, whatever the locale: the ldrtl qualifier. */
  rtl?: boolean;
  /** The variant as the generated MotifVariant names it (Partner); the default's shots name the default. */
  variant?: string;
  /** The variant as the guide names it (partner), which design/states/Setup.kt is told; the default's id for its shots. */
  variantId?: string;
  /** Remove animations (Settings.Global.ANIMATOR_DURATION_SCALE = 0). */
  reduceMotion?: boolean;
  /** A phone's status bar and navigation bar, in dp, given to the window as its insets. */
  insets?: { top: number; bottom: number };
  /** A --state to run on the screen once it has settled: its name. */
  state?: string;
  /** The audit's checks on this screenshot (--audit). */
  checks?: string[];
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
  /** Open routes with a deep link only, as when no NavController can be found (for tests of that way). */
  deepLinks?: boolean;
  /** Collect each screen's texts into result.json, and keep it (MOTIF_DEBUG). */
  debug?: boolean;
  /** How long a screen may take to settle, and a state to run, in ms. */
  settleMs?: number;
  stateMs?: number;
  /** The guide's default variant id: issues seen in it name no variant. */
  defaultVariant?: string;
  /** The names of the app module's Kotlin files (--audit): findings name the app's own composable around what they're about. */
  appFiles?: string[];
  /** Failures planted in the audit's checks, for Motif's own tests: "unreadable" (an internal that isn't there) or "error". */
  faults?: Partial<Record<"contrast" | "names" | "targets" | "motion", "unreadable" | "error">>;
  /** false: draw as if this Compose had no slot-table tag (for Motif's own tests). */
  slotTables?: boolean;
}

/** A source file the run compiles with the harness (the setup, a state, the hooks that call them), relative to the module. */
export interface HarnessSource {
  path: string;
  content: string;
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

/** Writes .motif/.gitignore, the test (with the run's other sources), the init script and the run's options into the module's folder. */
export function writeHarness(moduleDir: string, config: HarnessConfig, sources: HarnessSource[] = []): void {
  const motifDir = join(moduleDir, ".motif");
  mkdirSync(dirname(join(moduleDir, HARNESS_TEST)), { recursive: true });
  writeFileSync(join(motifDir, ".gitignore"), "*\n");
  writeFileSync(join(moduleDir, HARNESS_TEST), HARNESS_SOURCE);
  writeFileSync(join(moduleDir, HARNESS_AUDIT), AUDIT_SOURCE);
  for (const source of sources) {
    // Only under the harness's own source folder, which every run deletes.
    const path = resolve(moduleDir, source.path);
    if (!path.startsWith(resolve(moduleDir, HARNESS_SRC) + sep)) throw new Error(`${source.path} isn't under ${HARNESS_SRC}.`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source.content);
  }
  writeFileSync(join(moduleDir, INIT_SCRIPT), INIT_SOURCE);
  const options = { ...config, outDir: resolve(config.outDir), resultPath: resolve(moduleDir, RESULT_FILE) };
  writeFileSync(join(moduleDir, CONFIG_FILE), JSON.stringify(options));
  const targets = [...new Set(config.shots.map((s) => s.target || s.route || s.preview || s.file))];
  writeFileSync(join(moduleDir, TARGETS_FILE), targets.map((t) => `${t.replace(/[\r\n]+/g, " ")}\n`).join(""));
}

/** Removes the test sources, the init script and the options (and its list of screens); .motif/.gitignore stays. */
export function removeHarness(moduleDir: string): void {
  rmSync(join(moduleDir, HARNESS_SRC), { recursive: true, force: true });
  for (const file of [INIT_SCRIPT, CONFIG_FILE, TARGETS_FILE, `${RESULT_FILE}.part`]) rmSync(join(moduleDir, file), { force: true });
}

/**
 * JVM options as gradlew passes them from JAVA_OPTS and GRADLE_OPTS: split at spaces, with "…" or '…' keeping a value
 * that has spaces in one piece (-Dname="a b" is one option; the quotes themselves are dropped).
 */
export function splitJvmOptions(text: string | undefined): string[] {
  const args: string[] = [];
  let current: string | null = null;
  let quote: string | null = null;
  for (const c of text ?? "") {
    if (quote) {
      if (c === quote) quote = null;
      else current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      current ??= "";
    } else if (/\s/.test(c)) {
      if (current !== null) args.push(current);
      current = null;
    } else {
      current = (current ?? "") + c;
    }
  }
  if (current !== null) args.push(current);
  return args;
}

/** A settings file's text without its comments, or null when the folder has none. */
function settingsText(dir: string): string | null {
  for (const name of ["settings.gradle.kts", "settings.gradle"]) {
    try {
      return readFileSync(join(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
    } catch {
      // Not this one.
    }
  }
  return null;
}

/** project(":app").projectDir = file("android/app"), or = new File(settingsDir, 'android/app') in Groovy. */
const PROJECT_DIR =
  /\bproject\s*\(\s*["'](:[^"']*)["']\s*\)\s*\.\s*projectDir\s*=\s*(?:file\s*\(|(?:new\s+)?(?:java\.io\.)?File\s*\(\s*(?:settingsDir|rootDir|rootProject\.projectDir)\s*,)\s*["']([^"']+)["']\s*\)/g;

/** A module's Gradle path (:app, :feature:home): the one its settings file maps to its folder, else its folder's own. */
export function gradleProjectPath(projectDir: string, moduleDir: string): string {
  for (const m of settingsText(projectDir)?.matchAll(PROJECT_DIR) ?? []) {
    if (resolve(projectDir, m[2]!) === resolve(moduleDir)) return m[1]!;
  }
  const rel = relative(projectDir, moduleDir).split("\\").join("/");
  return rel === "" ? "" : `:${rel.split("/").join(":")}`;
}

/**
 * The Gradle run, from the project's root: its wrapper's jar started with java directly, not gradlew.bat, which breaks
 * on a path with "&" in it (it sets DIRNAME=%~dp0 unquoted). The client JVM gets what gradlew gives it: -Xmx64m -Xms64m,
 * then JAVA_OPTS and GRADLE_OPTS from the environment. Every path in it is relative to the root; the module is named by
 * its Gradle path, which the settings file may map to another folder.
 */
export function gradleCommand(java: string, projectDir: string, moduleDir: string, env: Record<string, string | undefined> = process.env): string[] {
  const rel = relative(projectDir, moduleDir).split("\\").join("/");
  return [
    java,
    "-Xmx64m",
    "-Xms64m",
    ...splitJvmOptions(env.JAVA_OPTS),
    ...splitJvmOptions(env.GRADLE_OPTS),
    "-Dorg.gradle.appname=gradlew",
    "-classpath",
    "gradle/wrapper/gradle-wrapper.jar",
    "org.gradle.wrapper.GradleWrapperMain",
    `${gradleProjectPath(projectDir, moduleDir)}:testDebugUnitTest`,
    "--tests",
    TEST_CLASS,
    "-I",
    `${rel === "" ? "" : `${rel}/`}${INIT_SCRIPT}`,
    "--console=plain",
  ];
}

/**
 * What Gradle's plain console shows when Robolectric can't download its Android jar (decision 0008, captured with the
 * download pointed at a closed port): the test class fails in Robolectric's own fetch, before the harness runs.
 *   MotifShotTest > classMethod FAILED
 *       java.lang.AssertionError at MavenArtifactFetcher.java:130
 *           Caused by: java.util.concurrent.ExecutionException at AbstractFuture.java:168
 *               Caused by: java.net.ConnectException at null:-2
 * The test report has the message: "Failed to fetch maven artifact org.robolectric:android-all-instrumented:…".
 * motif shot turns it into the offline message.
 */
export const ROBOLECTRIC_DOWNLOAD_FAILED = /AssertionError at MavenArtifactFetcher\.java|Failed to fetch maven artifact/;

export interface HarnessRun {
  /** The Gradle project's root (where gradle/wrapper/ is). */
  projectDir: string;
  /** The app module's folder (the one with com.android.application). */
  moduleDir: string;
  /** The JDK from gradleJava (doctor): its java, and its home for JAVA_HOME. */
  java: string;
  javaHome: string;
  /** The Android SDK, for a project with no local.properties (given to Gradle as ANDROID_HOME). */
  sdk?: string;
  config: HarnessConfig;
  /** More sources compiled with the test: the setup, the states and the hooks that call them. */
  sources?: HarnessSource[];
  timeoutMs: number;
  /** The environment Gradle starts from; process.env when not given. */
  env?: Record<string, string | undefined>;
}

export interface HarnessResult {
  code: number | null;
  timedOut: boolean;
  output: string;
  /** result.json as the harness wrote it; null when it wrote none, or one that can't be read. */
  result: Record<string, unknown> | null;
  /** Why result.json couldn't be read, when it exists but is cut short. */
  problem?: string;
}

/** Reads a stream into text as it arrives (the last 50,000 characters); cancel() stops reading. */
function collect(stream: ReadableStream<Uint8Array>): { text: () => string; done: Promise<void>; cancel: () => void } {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const done = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text = (text + decoder.decode(value, { stream: true })).slice(-50_000);
      }
    } catch {
      // Cancelled.
    }
  })();
  return { text: () => text, done, cancel: () => void reader.cancel().catch(() => {}) };
}

/** The promise's value, or null if it takes longer than ms. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: Timer | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
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
    writeHarness(run.moduleDir, run.config, run.sources);
    const base = run.env ?? process.env;
    // The JDK the client runs on is the one the daemon and the Android plugin use too; the SDK goes in when the project
    // doesn't say (no local.properties).
    const env: Record<string, string | undefined> = { ...base, JAVA_HOME: run.javaHome };
    if (run.sdk) env.ANDROID_HOME ||= run.sdk;
    const proc = Bun.spawn(gradleCommand(run.java, run.projectDir, run.moduleDir, base), {
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
    const out = collect(proc.stdout);
    const err = collect(proc.stderr);
    const timedOut = await new Promise<boolean>((done) => {
      timer = setTimeout(() => done(true), run.timeoutMs);
      void proc.exited.then(() => done(false));
    });
    // A stopped client makes the Gradle daemon cancel the build (and its test JVM); the daemon itself stays for the
    // next run unless this client started it.
    if (timedOut) killTree(proc.pid, true);
    const code = await within(proc.exited, GRACE_MS);
    // A process left holding the pipes (one the kill missed) mustn't keep the run waiting: what arrived is kept.
    await within(Promise.all([out.done, err.done]), GRACE_MS);
    out.cancel();
    err.cancel();
    let result: Record<string, unknown> | null = null;
    let problem: string | undefined;
    if (existsSync(resultPath)) {
      try {
        const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed;
        else problem = "The harness's result file isn't what Motif expects.";
      } catch {
        // A run stopped while writing it leaves it cut short.
        problem = "The harness's result file is cut short; the run may have been stopped while writing it.";
      }
      if (!run.config.debug) rmSync(resultPath, { force: true });
    }
    return { code, timedOut, output: `${out.text()}\n${err.text()}`, result, ...(problem ? { problem } : {}) };
  } finally {
    clearTimeout(timer);
    cancelExitHook();
    removeHarness(run.moduleDir);
  }
}
