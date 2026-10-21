// The runner for the SwiftUI screenshot harness (decision 0010): adds a hosted unit-test target (MotifShots) to a copy
// of the app's Xcode project, creates an iOS simulator, runs xcodebuild test on it, and deletes the simulator whatever
// happens. motif shot (Tasks 7–8) builds on it; it never touches the developer's own project folder.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onExit } from "../../cleanup";
import { killTree } from "../../shot/devserver";
import appSource from "./harness/MotifShotApp.swift" with { type: "text" };
import previewsSource from "./harness/MotifPreviews.swift" with { type: "text" };
import testSource from "./harness/MotifShotTests.swift" with { type: "text" };
import schemeSource from "./harness/MotifShots.xcscheme" with { type: "text" };
import type { SwiftUIApp } from "./project";

/** The test target Motif adds to the copy, and its scheme. */
export const TEST_TARGET = "MotifShots";
/** The folder in the copy (beside the .xcodeproj) that holds the harness's sources and the run's options. */
export const HARNESS_FOLDER = ".motif-shots";
export const OPTIONS_FILE = `${HARNESS_FOLDER}/options.json`;
/** Where the harness writes what it did, next to the options. */
export const RESULT_FILE = `${HARNESS_FOLDER}/result.json`;
/** Line ends as Swift and Xcode write them, whatever the checkout did to the embedded files. */
const lf = (text: string) => text.replace(/\r\n/g, "\n");
/** The test bundle's own sources, the same in every run. */
export const TEST_SOURCE: string = lf(testSource);
export const PREVIEWS_SOURCE: string = lf(previewsSource);
/** How long Motif waits for a stopped run's output and exit before giving up on them. */
export const GRACE_MS = 3000;

export interface SwiftUIShot {
  /** "/" for the app's root view, or a preview's id: "<fileID>:<line>" (SwiftUIMin/ContentView.swift:28). */
  screen: string;
  /** The PNG's file name in outDir. */
  file: string;
  /** Points, drawn at scale (3 for phones, 2 for the tablet): 390×844 at 3 gives 1170×2532. */
  width: number;
  height: number;
  scale: number;
  dark: boolean;
  locale: string;
  rtl: boolean;
  /** The variant as the guide names it (partner); the default's id for the default's shots. */
  variant?: string;
  /** A UIContentSizeCategory raw value (UICTContentSizeCategoryXXXL). */
  contentSize?: string;
  /** The safe area's top and bottom, in points: a phone's status bar and home indicator. */
  insets?: [number, number];
}

export interface SwiftUIHarnessOptions {
  outDir: string;
  shots: SwiftUIShot[];
  /** Font files to register for the run (Google families from Motif's cache), absolute. */
  fonts?: string[];
  /** Seconds a screen may take to settle. */
  settle?: number;
}

/** What the harness needs to know about the app, beyond SwiftUIApp: from the project and xcodebuild. */
export interface SwiftUIAppBuild {
  /** The Swift module the app target builds (PRODUCT_MODULE_NAME). */
  module: string;
  /** The .app's name (FULL_PRODUCT_NAME) and its executable's (EXECUTABLE_NAME). */
  product: string;
  executable: string;
  /** The @main App struct. */
  appStruct: string;
  /** The generated theme has variants (MotifTheme.debugVariantOverride), and the modifier .motifTheme(). */
  variants: boolean;
  theme: boolean;
}

// ---- The project file ----

interface Block {
  start: number;
  end: number;
  text: string;
}

/** The `ID = { … }` object with this id in a project file: where its braces start and end. */
function objectBlock(pbx: string, id: string): Block | null {
  const m = new RegExp(`(^|[\\s;{(,])${id}(\\s*/\\*(?:[^*]|\\*(?!/))*\\*/)?\\s*=\\s*\\{`, "m").exec(pbx);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  const end = closing(pbx, start);
  return end < 0 ? null : { start, end, text: pbx.slice(start, end + 1) };
}

/** The index of the brace or parenthesis that closes the one at `open`, skipping quoted strings and comments; -1 if none. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      if (e < 0) return -1;
      i = e + 1;
      continue;
    }
    if (c === "{" || c === "(") depth++;
    else if ((c === "}" || c === ")") && --depth === 0) return i;
  }
  return -1;
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/s, "$1").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
/** A field's value at the object's own level (`name = Foo;`). */
function field(block: string, name: string): string | undefined {
  const own = ownLevel(block);
  return own.match(new RegExp(`[\\s{;]${name} = ("(?:[^"\\\\]|\\\\.)*"|[^;\\s]+)`))?.[1];
}
/** The object's text without the objects and lists nested in it. */
function ownLevel(block: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < block.length; i++) {
    const c = block[i]!;
    if (c === '"') {
      const s = i;
      for (i++; i < block.length && block[i] !== '"'; i++) if (block[i] === "\\") i++;
      if (depth <= 1) out += block.slice(s, i + 1);
      continue;
    }
    if (c === "{" || c === "(") depth++;
    if (depth <= 1) out += c;
    if (c === "}" || c === ")") depth--;
  }
  return out;
}
/** The ids in an object's list field (`targets = ( ID /* App *\/, … );`). */
function listIds(block: string, name: string): string[] {
  const m = new RegExp(`[\\s{;]${name} = \\(`).exec(block);
  if (!m) return [];
  const open = m.index + m[0].length - 1;
  const body = block.slice(open + 1, closing(block, open));
  return body.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => unquote(s)).filter(Boolean);
}
/** The project file with an id added to the end of an object's list field. */
function addToList(pbx: string, id: string, name: string, item: string): string {
  const block = objectBlock(pbx, id);
  if (!block) throw new Error(`The project file has no object ${id}.`);
  const m = new RegExp(`[\\s{;]${name} = \\(`).exec(block.text);
  if (!m) {
    // No such list yet: add one.
    const at = block.start + 1;
    return `${pbx.slice(0, at)}\n\t\t\t\t${name} = (\n\t\t\t\t${item},\n\t\t\t\t);${pbx.slice(at)}`;
  }
  const open = block.start + m.index + m[0].length - 1;
  const close = closing(pbx, open);
  const before = pbx.slice(open + 1, close).trimEnd();
  const sep = before === "" || before.endsWith(",") ? "" : ",";
  return `${pbx.slice(0, open + 1)}${before}${sep}\n\t\t\t\t${item},\n\t\t\t${pbx.slice(close)}`;
}

/** A string as the project file writes it: bare when it's only safe characters, quoted otherwise. */
export function pbxString(s: string): string {
  return /^[A-Za-z0-9_$./]+$/.test(s) && !s.includes("//") ? s : `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export interface PatchedProject {
  pbx: string;
  /** The app target's id and the harness target's, for the scheme. */
  appTarget: string;
  testTarget: string;
}

/**
 * The project file with a hosted unit-test target added: MotifShots, whose sources are the harness's files in
 * HARNESS_FOLDER beside the project, testing the app target named `target`. It works for any object version: the files
 * are plain file references in a group of their own, which Xcode 16's synchronized folders sit beside.
 * `settings` are build settings copied from the app target (its deployment targets and platforms).
 */
export function addTestTarget(pbx: string, target: string, files: string[], build: SwiftUIAppBuild, settings: Record<string, string> = {}): PatchedProject {
  const root = pbx.match(/\brootObject = (\w+)/)?.[1];
  const project = root ? objectBlock(pbx, root) : null;
  if (!root || !project) throw new Error("The project file has no root object.");
  const app = listIds(project.text, "targets").find((id) => {
    const t = objectBlock(pbx, id);
    return t !== null && unquote(field(t.text, "name") ?? "") === target;
  });
  if (!app) throw new Error(`The project has no target named ${target}.`);
  const named = (name: string) =>
    listIds(project.text, "targets").some((id) => {
      const t = objectBlock(pbx, id);
      return t !== null && unquote(field(t.text, "name") ?? "") === name;
    });
  // The harness goes into a fresh copy each run; a project that has it already would get a second target of that name.
  if (named(TEST_TARGET)) throw new Error(`The project already has a ${TEST_TARGET} target: Motif adds its harness to a fresh copy of the project.`);
  const mainGroup = unquote(field(project.text, "mainGroup") ?? "");
  const projectConfigs = objectBlock(pbx, unquote(field(project.text, "buildConfigurationList") ?? ""));
  const configNames = (projectConfigs ? listIds(projectConfigs.text, "buildConfigurations") : [])
    .map((id) => objectBlock(pbx, id))
    .map((b) => (b ? unquote(field(b.text, "name") ?? "") : ""))
    .filter(Boolean);
  const names = configNames.length > 0 ? configNames : ["Debug", "Release"];

  // Ids no project uses: "MOTIF" in hex, then a counter.
  let n = 0;
  const id = () => {
    for (;;) {
      const candidate = `4D4F54494600${(++n).toString(16).toUpperCase().padStart(12, "0")}`;
      if (!pbx.includes(candidate)) return candidate;
    }
  };
  const group = id();
  const product = id();
  const sources = id();
  const frameworks = id();
  const resources = id();
  const proxy = id();
  const dependency = id();
  const list = id();
  const testTarget = id();
  const refs = files.map(() => id());
  const buildFiles = files.map(() => id());
  const configs = names.map(() => id());

  const host = `$(BUILT_PRODUCTS_DIR)/${build.product}/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/${build.executable}`;
  const testSettings: Record<string, string> = {
    ...settings,
    BUNDLE_LOADER: "$(TEST_HOST)",
    TEST_HOST: host,
    GENERATE_INFOPLIST_FILE: "YES",
    PRODUCT_BUNDLE_IDENTIFIER: "dev.motif.shots",
    PRODUCT_NAME: "$(TARGET_NAME)",
    // The harness's own language mode, whatever the app's: Swift 5, nonisolated by default, minimal checking.
    SWIFT_VERSION: "5.0",
    SWIFT_DEFAULT_ACTOR_ISOLATION: "nonisolated",
    SWIFT_STRICT_CONCURRENCY: "minimal",
    SWIFT_EMIT_LOC_STRINGS: "NO",
    CODE_SIGNING_ALLOWED: "NO",
    ENABLE_USER_SCRIPT_SANDBOXING: "NO",
  };
  const settingsText = Object.entries(testSettings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `\t\t\t\t${k} = ${pbxString(v)};`)
    .join("\n");

  const objects = [
    ...files.map((f, i) => `\t\t${buildFiles[i]} = {isa = PBXBuildFile; fileRef = ${refs[i]}; };`),
    ...files.map((f, i) => `\t\t${refs[i]} = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${pbxString(f)}; sourceTree = "<group>"; };`),
    `\t\t${product} = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = ${TEST_TARGET}.xctest; sourceTree = BUILT_PRODUCTS_DIR; };`,
    `\t\t${group} = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n${refs.map((r) => `\t\t\t\t${r},`).join("\n")}\n\t\t\t);\n\t\t\tpath = ${pbxString(HARNESS_FOLDER)};\n\t\t\tsourceTree = SOURCE_ROOT;\n\t\t};`,
    `\t\t${sources} = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${buildFiles.map((b) => `\t\t\t\t${b},`).join("\n")}\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};`,
    `\t\t${frameworks} = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};`,
    `\t\t${resources} = {\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};`,
    `\t\t${proxy} = {\n\t\t\tisa = PBXContainerItemProxy;\n\t\t\tcontainerPortal = ${root};\n\t\t\tproxyType = 1;\n\t\t\tremoteGlobalIDString = ${app};\n\t\t\tremoteInfo = ${pbxString(target)};\n\t\t};`,
    `\t\t${dependency} = {\n\t\t\tisa = PBXTargetDependency;\n\t\t\ttarget = ${app};\n\t\t\ttargetProxy = ${proxy};\n\t\t};`,
    ...names.map((name, i) => `\t\t${configs[i]} = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n${settingsText}\n\t\t\t};\n\t\t\tname = ${pbxString(name)};\n\t\t};`),
    `\t\t${list} = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n${configs.map((c) => `\t\t\t\t${c},`).join("\n")}\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = ${pbxString(names.includes("Debug") ? "Debug" : names[0]!)};\n\t\t};`,
    `\t\t${testTarget} = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${list};\n\t\t\tbuildPhases = (\n\t\t\t\t${sources},\n\t\t\t\t${frameworks},\n\t\t\t\t${resources},\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t\t${dependency},\n\t\t\t);\n\t\t\tname = ${TEST_TARGET};\n\t\t\tproductName = ${TEST_TARGET};\n\t\t\tproductReference = ${product};\n\t\t\tproductType = "com.apple.product-type.bundle.unit-test";\n\t\t};`,
  ];

  const objectsAt = /\bobjects = \{/.exec(pbx);
  if (!objectsAt) throw new Error("The project file has no objects.");
  const objectsEnd = closing(pbx, objectsAt.index + objectsAt[0].length - 1);
  let out = `${pbx.slice(0, objectsEnd).trimEnd()}\n\n/* Motif's screenshot harness */\n${objects.join("\n")}\n\t${pbx.slice(objectsEnd)}`;
  out = addToList(out, root, "targets", testTarget);
  if (mainGroup && objectBlock(out, mainGroup)) out = addToList(out, mainGroup, "children", group);
  return { pbx: out, appTarget: app, testTarget };
}

/** The scheme Motif runs: it builds the app and the harness, and tests the harness, in Debug. */
export function schemeFor(projectFile: string, patched: PatchedProject, target: string, build: SwiftUIAppBuild): string {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return lf(schemeSource)
    .replaceAll("__PROJECT__", attr(projectFile))
    .replaceAll("__APP_ID__", patched.appTarget)
    .replaceAll("__APP_TARGET__", attr(target))
    .replaceAll("__APP_PRODUCT__", attr(build.product))
    .replaceAll("__TEST_ID__", patched.testTarget)
    .replaceAll("__TEST_TARGET__", TEST_TARGET);
}

/** The run's own Swift file: the app's module and App struct, and the theme's variant and modifier when it has them. */
export function appSourceFor(build: SwiftUIAppBuild): string {
  return lf(appSource)
    .replaceAll("__MODULE__", build.module)
    .replaceAll("__APP__", build.appStruct)
    .replace("// __VARIANT__", build.variants ? "MotifTheme.debugVariantOverride = id.flatMap(MotifVariant.init(rawValue:))" : "_ = id")
    .replace("// __THEMED__\n        view", build.theme ? "AnyView(view.motifTheme())" : "view");
}

// ---- The simulator ----

export interface Simulator {
  /** A runtime identifier (com.apple.CoreSimulator.SimRuntime.iOS-18-5) and its version. */
  runtime: string;
  version: string;
  /** A device type identifier (com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro): a phone drawn at 3×. */
  deviceType: string;
}

export type Spawn = (cmd: string[]) => { code: number; out: string };
const spawnText: Spawn = (cmd) => {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}${r.stderr.toString()}` };
};

/** A version as numbers, for comparing: "18.5" → [18, 5]. */
const versionParts = (v: string) => v.split(".").map((p) => Number.parseInt(p, 10) || 0);
const compareVersions = (a: string, b: string) => {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

interface DeviceType {
  identifier: string;
  name: string;
}

/**
 * The newest available iOS runtime, and a phone it supports: the newest "iPhone N Pro" (drawn at 3×), else the newest
 * iPhone. Null when there's no iOS runtime. `list` is the output of `xcrun simctl list -j runtimes devicetypes`.
 */
export function pickSimulator(list: string): Simulator | null {
  let data: { runtimes?: unknown[]; devicetypes?: unknown[] };
  try {
    data = JSON.parse(list);
  } catch {
    return null;
  }
  type Runtime = { identifier?: string; version?: string; platform?: string; name?: string; isAvailable?: boolean; supportedDeviceTypes?: DeviceType[] };
  const runtimes = ((data.runtimes ?? []) as Runtime[])
    .filter((r) => r && r.isAvailable !== false && typeof r.identifier === "string" && typeof r.version === "string")
    .filter((r) => r.platform === "iOS" || /^iOS\b/.test(r.name ?? "") || /SimRuntime\.iOS-/.test(r.identifier!))
    .sort((a, b) => compareVersions(b.version!, a.version!));
  const types = ((data.devicetypes ?? []) as DeviceType[]).filter((t) => t && typeof t.name === "string" && typeof t.identifier === "string");
  const number = (name: string) => Number.parseInt(name.match(/^iPhone (\d+)/)?.[1] ?? "0", 10);
  for (const runtime of runtimes) {
    const supported = runtime.supportedDeviceTypes ?? types;
    const phones = supported.filter((t) => /^iPhone\b/.test(t.name)).sort((a, b) => number(b.name) - number(a.name));
    const pick = phones.find((t) => /^iPhone \d+ Pro$/.test(t.name)) ?? phones[0];
    if (pick) return { runtime: runtime.identifier!, version: runtime.version!, deviceType: pick.identifier };
  }
  return null;
}

/** The simulators whose names Motif gives its own (motif-…), from `xcrun simctl list -j devices`: left by a run that was killed. */
export function motifSimulators(list: string): string[] {
  try {
    const devices = (JSON.parse(list) as { devices?: Record<string, { name: string; udid: string }[]> }).devices ?? {};
    return Object.values(devices)
      .flat()
      .filter((d) => /^motif-/.test(d.name))
      .map((d) => d.udid);
  } catch {
    return [];
  }
}

// ---- The run ----

export interface SwiftUIHarnessRun {
  /** A copy of the app's folder that Motif owns: its project and the harness's files are changed there. */
  copyDir: string;
  app: SwiftUIApp;
  /** The @main App struct's name. */
  appStruct: string;
  /** Whether the copy has Motif's generated theme, and whether the theme has variants. */
  theme: boolean;
  variants: boolean;
  options: SwiftUIHarnessOptions;
  /** The simulator to create (and delete); pickSimulator's answer when not given. */
  simulator?: Simulator;
  /** xcodebuild's DerivedData; inside the copy when not given. A folder kept between runs makes later builds quicker. */
  derivedData?: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  /** How Motif runs the short commands (settings, simctl): Bun.spawnSync by default. */
  spawn?: Spawn;
}

export interface SwiftUIHarnessResult {
  code: number | null;
  timedOut: boolean;
  output: string;
  /** result.json as the harness wrote it; null when it wrote none, or one that can't be read. */
  result: Record<string, unknown> | null;
  problem?: string;
  /** How long each step took, in ms: settings, create, boot, test (xcodebuild's build and the shots), delete. */
  timings: Record<string, number>;
  simulator: Simulator;
  /** The simulator the run created (and deleted). */
  udid: string;
}

/** The app target's build settings, from `xcodebuild -showBuildSettings -json` (whatever xcodebuild printed before the JSON is skipped). */
export function appBuildSettings(output: string, target?: string): Record<string, string> | null {
  try {
    // The JSON is the first "[" to the first line that is only "]"; warnings on stderr may follow it.
    const start = output.indexOf("[");
    const end = output.indexOf("\n]", start);
    const parsed = JSON.parse(output.slice(start, end < 0 ? undefined : end + 2)) as { target?: string; buildSettings?: Record<string, string> }[];
    return (target === undefined ? parsed[0] : parsed.find((t) => t.target === target))?.buildSettings ?? null;
  } catch {
    return null;
  }
}

/** The settings the harness's target copies from the app's, so it's built for the same platforms and versions. */
const COPIED = ["IPHONEOS_DEPLOYMENT_TARGET", "MACOSX_DEPLOYMENT_TARGET", "SDKROOT", "SUPPORTED_PLATFORMS", "TARGETED_DEVICE_FAMILY"];

/** Reads a stream into text as it arrives (the last 200,000 characters); cancel() stops reading. */
function collect(stream: ReadableStream<Uint8Array>): { text: () => string; done: Promise<void>; cancel: () => void } {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const done = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text = (text + decoder.decode(value, { stream: true })).slice(-200_000);
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

/** Writes the harness's sources, its options, the scheme and the patched project file into the copy. */
export function writeHarness(run: Pick<SwiftUIHarnessRun, "copyDir" | "app" | "options">, build: SwiftUIAppBuild, settings: Record<string, string>): void {
  const project = join(run.copyDir, run.app.project);
  const folder = join(run.copyDir, HARNESS_FOLDER);
  mkdirSync(folder, { recursive: true });
  const sources: Record<string, string> = { "MotifShotTests.swift": TEST_SOURCE, "MotifPreviews.swift": PREVIEWS_SOURCE, "MotifShotApp.swift": appSourceFor(build) };
  for (const [name, text] of Object.entries(sources)) writeFileSync(join(folder, name), text);
  writeFileSync(join(run.copyDir, OPTIONS_FILE), JSON.stringify(run.options, null, 2));
  const pbxPath = join(project, "project.pbxproj");
  const copied = Object.fromEntries(COPIED.filter((k) => settings[k]).map((k) => [k, settings[k]!]));
  const patched = addTestTarget(readFileSync(pbxPath, "utf8"), run.app.name, Object.keys(sources), build, copied);
  writeFileSync(pbxPath, patched.pbx);
  const schemes = join(project, "xcshareddata", "xcschemes");
  mkdirSync(schemes, { recursive: true });
  writeFileSync(join(schemes, `${TEST_TARGET}.xcscheme`), schemeFor(run.app.project, patched, run.app.name, build));
}

/**
 * Adds the harness to the copy, creates a simulator, runs xcodebuild test with the harness on it, and deletes the
 * simulator whatever happens (on Ctrl+C too). The copy itself is the caller's to delete.
 */
export async function runSwiftUIHarness(run: SwiftUIHarnessRun): Promise<SwiftUIHarnessResult> {
  const spawn = run.spawn ?? spawnText;
  const timings: Record<string, number> = {};
  const timed = <T>(name: string, fn: () => T): T => {
    const t = performance.now();
    try {
      return fn();
    } finally {
      timings[name] = Math.round(performance.now() - t);
    }
  };
  if (run.app.kind !== "xcodeproj") throw new Error("The harness draws apps with an Xcode project; a Swift package app isn't drawn yet.");
  const project = join(run.copyDir, run.app.project);
  const derivedData = run.derivedData ?? join(run.copyDir, ".motif-derived-data");
  const resultPath = join(run.copyDir, RESULT_FILE);
  rmSync(resultPath, { force: true });
  for (const s of run.options.shots) rmSync(join(run.options.outDir, s.file), { force: true });

  // The app's settings are read through the harness's own scheme: xcodebuild takes -derivedDataPath only with a scheme,
  // and without it would leave a folder in ~/Library/Developer/Xcode/DerivedData for every copy. So the harness is
  // written first with the target's name for its module and product, then again, from the untouched project file,
  // with what xcodebuild says.
  const pbxPath = join(project, "project.pbxproj");
  const original = readFileSync(pbxPath, "utf8");
  const guess: SwiftUIAppBuild = { module: run.app.name, product: `${run.app.name}.app`, executable: run.app.name, appStruct: run.appStruct, variants: run.variants, theme: run.theme };
  writeHarness(run, guess, {});
  const shown = timed("settings", () =>
    spawn(["xcodebuild", "-showBuildSettings", "-json", "-project", project, "-scheme", TEST_TARGET, "-configuration", "Debug", "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", derivedData]),
  );
  const settings = shown.code === 0 ? appBuildSettings(shown.out, run.app.name) : null;
  if (!settings) throw new Error(`xcodebuild couldn't read the ${run.app.name} target's settings:\n${shown.out.split("\n").slice(-20).join("\n")}`);
  const build: SwiftUIAppBuild = {
    ...guess,
    module: settings.PRODUCT_MODULE_NAME ?? guess.module,
    product: settings.FULL_PRODUCT_NAME ?? guess.product,
    executable: settings.EXECUTABLE_NAME ?? guess.executable,
  };
  writeFileSync(pbxPath, original);
  writeHarness(run, build, settings);

  const simulator = run.simulator ?? pickSimulator(spawn(["xcrun", "simctl", "list", "-j", "runtimes", "devicetypes"]).out);
  if (!simulator) throw new Error("Xcode has no iOS simulator runtime. Install one in Xcode › Settings › Components, then run motif shot again.");
  const created = timed("create", () => spawn(["xcrun", "simctl", "create", `motif-${process.pid}-${Date.now().toString(36)}`, simulator.deviceType, simulator.runtime]));
  const udid = created.out.trim().split(/\s+/).pop() ?? "";
  if (created.code !== 0 || !/^[0-9A-F-]{36}$/i.test(udid)) throw new Error(`The simulator couldn't be created:\n${created.out}`);
  const remove = () => {
    spawn(["xcrun", "simctl", "shutdown", udid]);
    spawn(["xcrun", "simctl", "delete", udid]);
  };
  let cancelExitHook = onExit(remove);
  let timer: Timer | undefined;
  try {
    // Booted without Simulator.app, so no window opens.
    timed("boot", () => {
      spawn(["xcrun", "simctl", "boot", udid]);
      spawn(["xcrun", "simctl", "bootstatus", udid, "-b"]);
    });
    const started = performance.now();
    const proc = Bun.spawn(
      [
        "xcodebuild", "test", "-project", project, "-scheme", TEST_TARGET, "-destination", `id=${udid}`,
        "-derivedDataPath", derivedData, "CODE_SIGNING_ALLOWED=NO", "COMPILER_INDEX_STORE_ENABLE=NO",
      ],
      {
        cwd: run.copyDir,
        // xcodebuild hands the variables that start with TEST_RUNNER_ to the test's process, without the prefix.
        env: { ...(run.env ?? process.env), TEST_RUNNER_MOTIF_SHOT_OPTIONS: join(run.copyDir, OPTIONS_FILE) },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      },
    );
    cancelExitHook();
    cancelExitHook = onExit(() => {
      killTree(proc.pid, true);
      remove();
    });
    const out = collect(proc.stdout);
    const err = collect(proc.stderr);
    const timedOut = await new Promise<boolean>((done) => {
      timer = setTimeout(() => done(true), run.timeoutMs);
      void proc.exited.then(() => done(false));
    });
    if (timedOut) killTree(proc.pid, true);
    const code = await within(proc.exited, GRACE_MS);
    await within(Promise.all([out.done, err.done]), GRACE_MS);
    out.cancel();
    err.cancel();
    timings.test = Math.round(performance.now() - started);
    let result: Record<string, unknown> | null = null;
    let problem: string | undefined;
    if (existsSync(resultPath)) {
      try {
        const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed;
        else problem = "The harness's result file isn't what Motif expects.";
      } catch {
        problem = "The harness's result file is cut short; the run may have been stopped while writing it.";
      }
    }
    return { code, timedOut, output: `${out.text()}\n${err.text()}`, result, ...(problem ? { problem } : {}), timings, simulator, udid };
  } finally {
    clearTimeout(timer);
    cancelExitHook();
    timed("delete", remove);
  }
}
