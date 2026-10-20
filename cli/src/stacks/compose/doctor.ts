import { join } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { diskFiles, type DoctorFiles } from "../../project/disk";

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

/** The java programs to try, best first: the PATH's, JAVA_HOME's, Android Studio's. */
function javaCandidates(deps: DoctorDeps): string[] {
  const exe = deps.platform === "win32" ? "java.exe" : "java";
  const onPath = deps.which("java");
  const out: string[] = onPath ? [onPath] : [];
  const home = deps.vars?.JAVA_HOME;
  if (home) out.push(at(deps, home, "bin", exe));
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

/** The first java that runs, with what it said; without a way to run programs, the first one found. */
function runnableJava(deps: DoctorDeps): { path: string; output: string } | null {
  for (const path of javaCandidates(deps)) {
    if (!deps.run) return { path, output: "" };
    const r = deps.run([path, "-version"]);
    if (r.code === 0) return { path, output: `${r.stderr ?? ""}\n${r.stdout}` };
  }
  return null;
}

/** The java program Motif would use: on the PATH, else JAVA_HOME's, else Android Studio's; null when there is none. */
export function findJava(deps: DoctorDeps): string | null {
  return runnableJava(deps)?.path ?? null;
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
  const found = runnableJava(deps);
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
    return { id: "android-sdk", status: "needed", label, detail: "No Android SDK found. Screenshots need it: install Android Studio, or set ANDROID_HOME to an SDK folder." };
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
