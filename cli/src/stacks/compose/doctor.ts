import { realpathSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { diskFiles, type DoctorFiles } from "../../project/disk";

/** What doctor and motif shot say when there's no Android SDK. */
export const NO_ANDROID_SDK = "No Android SDK found. Screenshots need it: install Android Studio, or set ANDROID_HOME to an SDK folder.";

/** The oldest JDK Android's build runs on. */
const JDK_MIN = 17;

const files = (deps: DoctorDeps): DoctorFiles => deps.files ?? diskFiles;
const at = (deps: DoctorDeps, ...parts: string[]) => parts.join(deps.platform === "win32" ? "\\" : "/");

/** Android Studio's own JDK, where each system puts it. */
function bundledJdk(deps: DoctorDeps): string {
  if (deps.platform === "win32") return "C:\\Program Files\\Android\\Android Studio\\jbr";
  if (deps.platform === "darwin") return "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
  return "/opt/android-studio/jbr";
}

/**
 * The java programs to try, best first, as gradlew picks: JAVA_HOME's, then the PATH's, then Android Studio's (which
 * gradlew doesn't know, but which most Android developers have).
 */
function javaCandidates(deps: DoctorDeps): string[] {
  const exe = deps.platform === "win32" ? "java.exe" : "java";
  const onPath = deps.which("java");
  const out: string[] = [];
  const home = deps.vars?.JAVA_HOME;
  if (home) out.push(at(deps, home, "bin", exe));
  if (onPath) out.push(onPath);
  out.push(at(deps, bundledJdk(deps), "bin", exe));
  return out.filter((p, i) => out.indexOf(p) === i && (p === onPath || files(deps).exists(p)));
}

/** "17.0.12" and its major number, from what `java -version` printed (to stderr). */
function javaVersion(text: string): { version: string; major: number } | null {
  const quoted = /version "([^"]+)"/.exec(text)?.[1];
  const version = quoted ? /^\d+(?:\.\d+)*/.exec(quoted)?.[0] : undefined;
  if (!version) return null;
  const nums = version.split(".").map(Number);
  // Java 8 and older call themselves 1.8.
  return { version, major: nums[0] === 1 ? (nums[1] ?? 1) : nums[0]! };
}

interface FoundJava {
  path: string;
  /** What java -version printed; empty without a way to run programs. */
  output: string;
  major: number | null;
}

/**
 * The java Motif uses for Gradle: the first candidate that runs and is JDK 17 or newer (chosen); failing that, the
 * first that runs at all (first), for doctor to say what's wrong with it. Without a way to run programs, the first one
 * found.
 */
function chooseJava(deps: DoctorDeps): { chosen: FoundJava | null; first: FoundJava | null } {
  let first: FoundJava | null = null;
  for (const path of javaCandidates(deps)) {
    if (!deps.run) return { chosen: null, first: { path, output: "", major: null } };
    const r = deps.run([path, "-version"]);
    if (r.code !== 0) continue;
    const output = `${r.stderr ?? ""}\n${r.stdout}`;
    const found = { path, output, major: javaVersion(output)?.major ?? null };
    first ??= found;
    if (found.major !== null && found.major >= JDK_MIN) return { chosen: found, first };
  }
  return { chosen: null, first };
}

/**
 * The java program Motif would use: JAVA_HOME's, the PATH's or Android Studio's, the first that is JDK 17 or newer,
 * else the first that runs; null when there is none.
 */
export function findJava(deps: DoctorDeps): string | null {
  const { chosen, first } = chooseJava(deps);
  return chosen?.path ?? first?.path ?? null;
}

/**
 * The JDK a Gradle run uses (its java and its home, for JAVA_HOME), or why there is none that can build Android: doctor's
 * own words. The home is what the JVM reports as java.home, so a launcher such as /usr/bin/java or Oracle's javapath
 * gives the real JDK folder.
 */
export function gradleJava(deps: DoctorDeps): { java: string; javaHome: string } | { problem: string } {
  const { chosen } = chooseJava(deps);
  if (!chosen) return { problem: jdkItem(deps).detail };
  const r = deps.run?.([chosen.path, "-XshowSettings:properties", "-version"]);
  const said = r && r.code === 0 ? `${r.stderr ?? ""}\n${r.stdout}` : "";
  const reported = /^\s*java\.home = (.+?)\s*$/m.exec(said)?.[1];
  return { java: chosen.path, javaHome: reported ?? realHome(chosen.path, deps.platform) };
}

/** <jdk>/bin/java's <jdk>, with links followed (paths in the given system's form). */
function realHome(java: string, platform: NodeJS.Platform): string {
  let path = java;
  try {
    path = realpathSync(java);
  } catch {
    // Not on this disk (a test's fake): the path as given.
  }
  const { dirname } = platform === "win32" ? win32 : posix;
  return dirname(dirname(path));
}

/** An escaped Java properties value (C\:\\Users\\Dev\\Sdk) as the path it means. */
function unescapeProperty(v: string): string {
  return v.trim().replace(/\\(.)/g, "$1");
}

/** The sdk.dir of the first local.properties from the app's folder up to the project root. */
function sdkFromLocalProperties(root: string, app: AppInfo, deps: DoctorDeps): string | null {
  const top = join(root);
  let dir = join(root, app.path);
  for (let i = 0; i < 12; i++) {
    const text = files(deps).read(join(dir, "local.properties"));
    const value = text ? /^\s*sdk\.dir\s*[=:]\s*(.+)$/m.exec(text)?.[1] : undefined;
    if (value) return unescapeProperty(value);
    const up = join(dir, "..");
    if (dir === top || up === dir) break;
    dir = up;
  }
  return null;
}

function defaultSdk(deps: DoctorDeps): string {
  if (deps.platform === "win32") return at(deps, deps.vars?.LOCALAPPDATA || at(deps, deps.home, "AppData", "Local"), "Android", "Sdk");
  if (deps.platform === "darwin") return at(deps, deps.home, "Library", "Android", "sdk");
  return at(deps, deps.home, "Android", "Sdk");
}

/** The Android SDK folder: ANDROID_HOME, ANDROID_SDK_ROOT, the app's local.properties, or the default one; null when none exists. */
export function findAndroidSdk(root: string, app: AppInfo, deps: DoctorDeps): string | null {
  const candidates = [deps.vars?.ANDROID_HOME, deps.vars?.ANDROID_SDK_ROOT, sdkFromLocalProperties(root, app, deps), defaultSdk(deps)];
  return candidates.find((c): c is string => !!c && files(deps).exists(c)) ?? null;
}

/** The API levels of the platforms an SDK has (platforms/android-36 is 36), lowest first. */
function platformsOf(sdk: string, deps: DoctorDeps): number[] {
  const levels = files(deps)
    .list(at(deps, sdk, "platforms"))
    .map((n) => /^android-(\d+)(?:\.\d+)?$/.exec(n)?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  return [...new Set(levels)].sort((a, b) => a - b);
}

function jdkItem(deps: DoctorDeps): DoctorItem {
  const label = "JDK";
  const { chosen, first } = chooseJava(deps);
  const found = chosen ?? first;
  if (!found) {
    return {
      id: "jdk",
      status: "needed",
      label,
      detail: `No JDK found. Theme code, checks and drafts work without it; screenshots need JDK ${JDK_MIN} or newer: install Android Studio (it brings one) or a JDK from https://adoptium.net.`,
    };
  }
  const v = javaVersion(found.output);
  if (!v) return { id: "jdk", status: "optional", label, detail: "Found a JDK, but couldn't read its version. Run java -version to check it works." };
  if (v.major < JDK_MIN) return { id: "jdk", status: "needed", label, detail: `JDK ${v.version} is older than ${JDK_MIN}, which Android's build needs.` };
  return { id: "jdk", status: "ok", label, detail: `JDK ${v.version}.` };
}

function sdkItem(root: string, apps: AppInfo[], deps: DoctorDeps): DoctorItem {
  const label = "Android SDK";
  let sdk: string | null = null;
  for (const app of apps) {
    sdk = findAndroidSdk(root, app, deps);
    if (sdk) break;
  }
  if (!sdk) {
    return { id: "android-sdk", status: "needed", label, detail: NO_ANDROID_SDK };
  }
  const levels = platformsOf(sdk, deps);
  if (levels.length === 0) {
    return { id: "android-sdk", status: "ok", label, detail: `Android SDK at ${sdk} (no platforms yet; Gradle downloads the one the app compiles against).` };
  }
  return { id: "android-sdk", status: "ok", label, detail: `Android SDK at ${sdk} (platforms ${levels.join(", ")}).` };
}

/** The JDK and the Android SDK, for a project with Compose apps. */
export function composeDoctor(deps: DoctorDeps, ctx: { root: string; apps: AppInfo[] }): DoctorItem[] {
  return [jdkItem(deps), sdkItem(ctx.root, ctx.apps, deps)];
}
