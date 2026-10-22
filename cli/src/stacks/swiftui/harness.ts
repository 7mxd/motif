// The runner for the SwiftUI screenshot harness (decision 0010): adds a hosted unit-test target (MotifShots) to a copy
// of the app's Xcode project, creates an iOS simulator, runs xcodebuild test on it, and deletes the simulator whatever
// happens; a macOS app is built and drawn on the Mac itself, with no simulator. motif shot (Tasks 7–9) builds on it;
// it never touches the developer's own project folder.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { maskComments, maskStrings } from "../../check/mask";
import { onExit } from "../../cleanup";
import { andList } from "../../text";
import type { RawIssue } from "../../shot/audit";
import { killTree } from "../../shot/devserver";
import appSource from "./harness/MotifShotApp.swift" with { type: "text" };
import auditSource from "./harness/MotifAudit.swift" with { type: "text" };
import previewsSource from "./harness/MotifPreviews.swift" with { type: "text" };
import statesSource from "./harness/MotifStates.swift" with { type: "text" };
import testSource from "./harness/MotifShotTests.swift" with { type: "text" };
import schemeSource from "./harness/MotifShots.xcscheme" with { type: "text" };
import { field, idsIn, pbxObjects, type PbxObject, type SwiftUIApp, unquote } from "./project";

/** The test target Motif adds to the copy, and its scheme. */
export const TEST_TARGET = "MotifShots";
/**
 * The run's work folder (outside the copy, so a synchronized folder at the project's root can't take them into the app
 * target) holds: the harness's sources, the options, the result, and xcodebuild's DerivedData when no other is given.
 */
export const SOURCES_FOLDER = "MotifShots";
export const OPTIONS_FILE = "options.json";
export const RESULT_FILE = "result.json";
export const DERIVED_DATA = "DerivedData";
/** Line ends as Swift and Xcode write them, whatever the checkout did to the embedded files. */
const lf = (text: string) => text.replace(/\r\n/g, "\n");
/** The test bundle's own sources, the same in every run. */
export const TEST_SOURCE: string = lf(testSource);
export const PREVIEWS_SOURCE: string = lf(previewsSource);
export const STATES_SOURCE: string = lf(statesSource);
export const AUDIT_SOURCE: string = lf(auditSource);
/** How long Motif waits for a stopped command's output and exit before giving up on them. */
export const GRACE_MS = 3000;

export interface SwiftUIShot {
  /**
   * "/" for the app's root view, or a preview: "<file>.swift:<line>" (HomeScreen.swift:26, the line of #Preview), or its
   * id with the module in front, as the harness reports it ("SwiftUIMin/HomeScreen.swift:26").
   */
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
  /**
   * The variant as the guide names it (partner); the default's id for the default's shots. Leave it out when the guide
   * has no variants: the app's MotifTheme.swift then has none, and any id (even "default") fails the shot.
   */
  variant?: string;
  /** The variant as design/states/Setup.swift is told it: the guide's id, also when `variant` is left out; "" without variants. */
  variantId?: string;
  /** The --state (its name) the harness runs on the settled screen before drawing it. */
  state?: string;
  /** A UIContentSizeCategory raw value (UICTContentSizeCategoryXXXL). */
  contentSize?: string;
  /** The safe area's top and bottom, in points: a phone's status bar and home indicator. */
  insets?: [number, number];
  /** The audit's checks on the drawn screen (--audit): contrast, names, targets (phones and tablets), motion. */
  checks?: AuditCheck[];
  /** Drawn with reduce motion on (SwiftUI's accessibilityReduceMotion), for the reduced-motion check. */
  reduceMotion?: boolean;
}

/** One of the audit's checks, as the harness names it. */
export type AuditCheck = "contrast" | "names" | "targets" | "motion";

/** A problem the harness's audit found on a shot (audit.json's RawIssue), with which of its like it is. */
export type SwiftUIRawIssue = RawIssue & {
  nth?: number;
  of?: number;
  /** A motion finding's: "environment" when only SwiftUI's accessibilityReduceMotion could be turned on for the shot. */
  reducedBy?: "environment";
  /** Drawn by the system, not the app (MapKit's map, UIKit's split view): left out of audit.json, which says so once. */
  systemPart?: string;
};

export interface SwiftUIHarnessOptions {
  outDir: string;
  shots: SwiftUIShot[];
  /** Seconds a screen may take to settle. */
  settle?: number;
  /** Seconds design/states/Setup.swift's motifSetup and each state may run (15). */
  stateLimit?: number;
  /** The setup file as messages name it (design/states/Setup.swift, or an app's own). */
  setupFile?: string;
  /** macOS: draw with AppKit alone, never the window server (MOTIF_SWIFTUI_APPKIT=1, to test that way). */
  appKitOnly?: boolean;
}

/** A Swift file of the developer's that the harness compiles in: design/states/Setup.swift or a --state. */
export interface SwiftUIScript {
  /** The state's name (signed-in); none for the setup. */
  name?: string;
  /** Where it is (absolute), for the compiler's messages. */
  file: string;
  text: string;
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

/** The index of the parenthesis or brace that closes the one at `open`, skipping quoted strings and comments; -1 if none. */
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

/** Where an object's list field (`targets = ( … )`) opens and closes in the project file, or null. */
function listAt(pbx: string, obj: PbxObject, name: string): { open: number; close: number } | null {
  const m = new RegExp(`[\\s{;]${name} = \\(`).exec(obj.text);
  if (!m) return null;
  const open = obj.start + m.index + m[0].length - 1;
  const close = closing(pbx, open);
  return close < 0 ? null : { open, close };
}

/** The ids in an object's list field. */
function listIds(pbx: string, obj: PbxObject, name: string): string[] {
  const at = listAt(pbx, obj, name);
  return at ? idsIn(pbx.slice(at.open + 1, at.close)) : [];
}

/** The project file with an id added to the end of an object's list field (made when it has none). */
function addToList(pbx: string, id: string, name: string, item: string): string {
  const obj = pbxObjects(pbx).get(id);
  if (!obj) throw new Error(`The project file has no object ${id}.`);
  const at = listAt(pbx, obj, name);
  if (!at) return `${pbx.slice(0, obj.start + 1)}\n\t\t\t${name} = (\n\t\t\t\t${item},\n\t\t\t);${pbx.slice(obj.start + 1)}`;
  const before = pbx.slice(at.open + 1, at.close).trimEnd();
  const sep = before === "" || before.endsWith(",") ? "" : ",";
  return `${pbx.slice(0, at.open + 1)}${before}${sep}\n\t\t\t\t${item},\n\t\t\t${pbx.slice(at.close)}`;
}

/** A string as the project file writes it: bare when it's only safe characters, quoted otherwise. */
export function pbxString(s: string): string {
  return /^[A-Za-z0-9_$./]+$/.test(s) && !s.includes("//") ? s : `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** The project's root object and the target with this name, or why not. */
function projectAndTarget(pbx: string, target: string) {
  const objs = pbxObjects(pbx);
  const root = pbx.match(/\brootObject = (\w+)/)?.[1];
  const project = root ? objs.get(root) : undefined;
  if (!root || !project) throw new Error("The project file has no root object.");
  const targets = listIds(pbx, project, "targets").map((id) => ({ id, obj: objs.get(id) }));
  const named = (name: string) => targets.find((t) => t.obj && unquote(field(t.obj.own, "name") ?? "") === name);
  return { objs, root, project, named };
}

/** The names of a configuration list's configurations, and its default's. */
function configurationsOf(pbx: string, objs: Map<string, PbxObject>, listId: string): { names: string[]; defaultName: string | null } {
  const list = objs.get(listId);
  if (!list) return { names: [], defaultName: null };
  const names = listIds(pbx, list, "buildConfigurations")
    .map((id) => objs.get(id))
    .map((o) => (o ? unquote(field(o.own, "name") ?? "") : ""))
    .filter(Boolean);
  const def = field(list.own, "defaultConfigurationName");
  return { names, defaultName: def ? unquote(def) : null };
}

/**
 * The configuration the harness builds and tests in: the one the app's own shared scheme tests in (a scheme that builds
 * the target), else Debug, else the app target's default configuration. `schemes` are the project's shared schemes'
 * XML. Testability is turned on for the run (ENABLE_TESTABILITY=YES), so @testable import works in any of them.
 */
export function testConfiguration(pbx: string, target: string, schemes: string[] = []): string {
  const { objs, project, named } = projectAndTarget(pbx, target);
  const app = named(target);
  if (!app?.obj) throw new Error(`The project has no target named ${target}.`);
  const projectConfigs = configurationsOf(pbx, objs, unquote(field(project.own, "buildConfigurationList") ?? ""));
  const appConfigs = configurationsOf(pbx, objs, unquote(field(app.obj.own, "buildConfigurationList") ?? ""));
  const names = projectConfigs.names.length > 0 ? projectConfigs.names : appConfigs.names;
  for (const xml of schemes) {
    if (!new RegExp(`BlueprintIdentifier\\s*=\\s*"${app.id}"`).test(xml)) continue;
    const tested = xml.match(/<TestAction\b[^>]*\bbuildConfiguration\s*=\s*"([^"]+)"/)?.[1];
    if (tested && names.includes(tested)) return tested;
  }
  if (names.includes("Debug")) return "Debug";
  if (appConfigs.defaultName && names.includes(appConfigs.defaultName)) return appConfigs.defaultName;
  if (names[0]) return names[0];
  throw new Error(`The project's ${target} target has no build configurations.`);
}

export interface PatchedProject {
  pbx: string;
  /** The app target's id and the harness target's, for the scheme. */
  appTarget: string;
  testTarget: string;
}

/**
 * The project file with a hosted unit-test target added: MotifShots, whose sources are the harness's files in
 * `sourcesDir` (an absolute folder outside the project), testing the app target named `target`. It works for any object
 * version: the files are plain file references in a group of their own. `settings` are build settings copied from the
 * app target (its deployment targets and platforms).
 */
export function addTestTarget(
  pbx: string,
  target: string,
  files: string[],
  build: SwiftUIAppBuild,
  settings: Record<string, string> = {},
  sourcesDir = SOURCES_FOLDER,
): PatchedProject {
  const { objs, root, project, named } = projectAndTarget(pbx, target);
  const app = named(target)?.id;
  if (!app) throw new Error(`The project has no target named ${target}.`);
  // The harness goes into a fresh copy each run; a project that has it already would get a second target of that name.
  // A copy kept between runs (for a warm DerivedData) must have its project.pbxproj and MotifShots.xcscheme restored
  // from the developer's project before each run, or this refuses.
  if (named(TEST_TARGET)) throw new Error(`The project already has a ${TEST_TARGET} target: Motif adds its harness to a fresh copy of the project.`);
  const mainGroup = unquote(field(project.own, "mainGroup") ?? "");
  const configNames = configurationsOf(pbx, objs, unquote(field(project.own, "buildConfigurationList") ?? "")).names;
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
  const absolute = isAbsolute(sourcesDir);

  const objects = [
    ...files.map((_, i) => `\t\t${buildFiles[i]} = {isa = PBXBuildFile; fileRef = ${refs[i]}; };`),
    ...files.map((f, i) => `\t\t${refs[i]} = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${pbxString(f)}; sourceTree = "<group>"; };`),
    `\t\t${product} = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = ${TEST_TARGET}.xctest; sourceTree = BUILT_PRODUCTS_DIR; };`,
    `\t\t${group} = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n${refs.map((r) => `\t\t\t\t${r},`).join("\n")}\n\t\t\t);\n\t\t\tname = ${TEST_TARGET};\n\t\t\tpath = ${pbxString(sourcesDir)};\n\t\t\tsourceTree = ${absolute ? '"<absolute>"' : "SOURCE_ROOT"};\n\t\t};`,
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
  if (mainGroup && pbxObjects(out).has(mainGroup)) out = addToList(out, mainGroup, "children", group);
  return { pbx: out, appTarget: app, testTarget };
}

/** The scheme Motif runs: it builds the app and the harness, and tests the harness, in the given configuration. */
export function schemeFor(projectFile: string, patched: PatchedProject, target: string, build: SwiftUIAppBuild, configuration = "Debug"): string {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return lf(schemeSource)
    .replaceAll("__PROJECT__", attr(projectFile))
    .replaceAll("__APP_ID__", patched.appTarget)
    .replaceAll("__APP_TARGET__", attr(target))
    .replaceAll("__APP_PRODUCT__", attr(build.product))
    .replaceAll("__TEST_ID__", patched.testTarget)
    .replaceAll("__TEST_TARGET__", TEST_TARGET)
    .replaceAll("__CONFIGURATION__", attr(configuration));
}

const VARIANT_SET = `guard let id else {
            MotifTheme.debugVariantOverride = nil
            return
        }
        guard let variant = MotifVariant(rawValue: id) else {
            throw MotifShotError("The app's MotifTheme.swift has no variant \\(id). Run motif tokens again, then motif shot.")
        }
        MotifTheme.debugVariantOverride = variant`;
const NO_VARIANTS = `if let id {
            throw MotifShotError("The app's MotifTheme.swift has no variants, so \\(id) can't be drawn. Run motif tokens again, then motif shot.")
        }`;

/** The run's own Swift file: the app's module and App struct, and the theme's variant and modifier when it has them. */
export function appSourceFor(build: SwiftUIAppBuild): string {
  return lf(appSource)
    .replaceAll("__MODULE__", build.module)
    .replaceAll("__APP__", build.appStruct)
    .replace("// __VARIANT__", build.variants ? VARIANT_SET : NO_VARIANTS)
    .replace("// __THEMED__\n        view", build.theme ? "AnyView(view.motifTheme())" : "view");
}

/** The Swift function a state's motifState becomes in the run, so each state has its own: motifState_signed_in. */
export const stateFunction = (name: string) => `motifState_${name.replace(/[^A-Za-z0-9_]/g, "_")}`;

/** A Swift string literal. */
const swiftString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * A setup or state file as the harness compiles it: the app's module imported (@testable, so its internal types can be
 * set up), the file's own lines kept for the compiler's messages (#sourceLocation), and a state's motifState renamed.
 */
export function scriptSource(script: SwiftUIScript, module: string): string {
  let text = lf(script.text).replace(/^\uFEFF/, "");
  if (script.name !== undefined) {
    const code = maskStrings(maskComments(text, "swift"), "swift");
    const at = [...code.matchAll(/\bfunc\s+motifState\b/g)].map((m) => ({ index: m.index!, length: m[0].length }));
    for (const m of at.reverse()) text = `${text.slice(0, m.index)}func ${stateFunction(script.name)}${text.slice(m.index + m.length)}`;
  }
  return `import Foundation\n@testable import ${module}\n#sourceLocation(file: ${swiftString(script.file)}, line: 1)\n${text}\n#sourceLocation()\n`;
}

/** The run's MotifHooks.swift: how the harness calls the setup and the states it was given. */
export function hooksSource(scripts: { setup?: SwiftUIScript; states?: SwiftUIScript[] } = {}): string {
  const states = scripts.states ?? [];
  return [
    "// Written by Motif for one screenshot run: the app's design/states/Setup.swift and --state scripts, as the harness calls them.",
    "import Foundation",
    "",
    "@MainActor",
    "enum MotifHooks {",
    `    static let hasSetup = ${scripts.setup ? "true" : "false"}`,
    "",
    "    static func setup(variant: String, locale: Locale, dark: Bool) async throws {",
    ...(scripts.setup ? ["        try await motifSetup(variant: variant, locale: locale, dark: dark)"] : []),
    "    }",
    "",
    "    static func state(_ name: String, _ app: MotifHarness) async throws {",
    "        switch name {",
    ...states.map((s) => `        case ${swiftString(s.name!)}: try await ${stateFunction(s.name!)}(app)`),
    '        default: throw MotifShotError("Motif didn\'t compile the state \\(name) into the run.")',
    "        }",
    "    }",
    "}",
    "",
  ].join("\n");
}

// ---- Commands ----

export interface ExecResult {
  /** Null when it was stopped (the time ran out, or it couldn't start). */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** How Motif runs a command: `signal` stops it early (with everything it started), as the time running out does. */
export type Exec = (
  cmd: string[],
  opts: { timeoutMs: number; env?: Record<string, string | undefined>; cwd?: string; signal?: AbortSignal },
) => Promise<ExecResult>;

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

/**
 * Runs a command in its own process group, stopped (with everything it started) when the time is up or Motif exits.
 * Its output is read as it arrives; a process left holding the pipes after it ends can't keep Motif waiting.
 */
export const execCommand: Exec = async (cmd, opts) => {
  if (opts.timeoutMs <= 0) return { code: null, stdout: "", stderr: "", timedOut: true };
  if (opts.signal?.aborted) return { code: null, stdout: "", stderr: "", timedOut: false };
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(cmd, { cwd: opts.cwd, env: opts.env ?? process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe", detached: true });
  } catch (e) {
    return { code: null, stdout: "", stderr: e instanceof Error ? e.message : String(e), timedOut: false };
  }
  const cancelHook = onExit(() => killTree(proc.pid, true));
  const out = collect(proc.stdout as ReadableStream<Uint8Array>);
  const err = collect(proc.stderr as ReadableStream<Uint8Array>);
  let timer: Timer | undefined;
  const stop = () => killTree(proc.pid, true);
  opts.signal?.addEventListener("abort", stop);
  try {
    const timedOut = await new Promise<boolean>((done) => {
      timer = setTimeout(() => done(true), opts.timeoutMs);
      void proc.exited.then(() => done(false));
    });
    if (timedOut) killTree(proc.pid, true);
    const stopped = opts.signal?.aborted ?? false;
    const code = await within(proc.exited, GRACE_MS);
    await within(Promise.all([out.done, err.done]), GRACE_MS);
    out.cancel();
    err.cancel();
    return { code: timedOut || stopped ? null : code, stdout: out.text(), stderr: err.text(), timedOut };
  } finally {
    opts.signal?.removeEventListener("abort", stop);
    clearTimeout(timer);
    cancelHook();
  }
};

/** The last lines of a command's output, for a message. */
const tail = (text: string, lines = 20) => text.trimEnd().split(/\r?\n/).slice(-lines).join("\n");

// ---- The simulator ----

export interface Simulator {
  /** A runtime identifier (com.apple.CoreSimulator.SimRuntime.iOS-18-5) and its version. */
  runtime: string;
  version: string;
  /** A device type identifier (com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro): a phone drawn at 3×. */
  deviceType: string;
  /** The runtime is the selected Xcode's own iOS simulator SDK version (false when none was asked for or none matched). */
  matchesSdk: boolean;
}

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
 * The iOS runtime to draw on, and a phone it supports. The runtime is the one whose version is the selected Xcode's
 * iOS simulator SDK (`sdkVersion`, from `xcrun --sdk iphonesimulator --show-sdk-version`), so the SwiftUI drawn is the
 * one the app builds against; else the newest available. The phone is the newest "iPhone N Pro" (drawn at 3×), else the
 * newest iPhone. Null when there's no iOS runtime. `list` is the output of `xcrun simctl list -j runtimes devicetypes`.
 */
export function pickSimulator(list: string, sdkVersion?: string): Simulator | null {
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
  const sdk = sdkVersion?.trim();
  // The SDK's version first ("18.5" matches a runtime "18.5" or "18.5.1"), then the rest, newest first.
  const same = (r: Runtime) => !!sdk && (r.version === sdk || r.version!.startsWith(`${sdk}.`));
  const ordered = [...runtimes.filter(same), ...runtimes.filter((r) => !same(r))];
  for (const runtime of ordered) {
    const supported = runtime.supportedDeviceTypes ?? types;
    const phones = supported.filter((t) => /^iPhone\b/.test(t.name)).sort((a, b) => number(b.name) - number(a.name));
    const pick = phones.find((t) => /^iPhone \d+ Pro$/.test(t.name)) ?? phones[0];
    if (pick) return { runtime: runtime.identifier!, version: runtime.version!, deviceType: pick.identifier, matchesSdk: same(runtime) };
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
  /** A copy of the app's folder that Motif owns: its project is changed there. */
  copyDir: string;
  /**
   * A folder Motif owns outside the copy, for the harness's sources, the options, the result and (unless `derivedData`
   * is given) xcodebuild's DerivedData. Outside, because a synchronized folder at the project's root would build them
   * into the app.
   */
  workDir: string;
  app: SwiftUIApp;
  /** Where the app is drawn: in an iOS simulator Motif creates (the default), or on the Mac itself (a macOS app). */
  platform?: SwiftUIPlatform;
  /** The @main App struct's name. */
  appStruct: string;
  /** Whether the copy has Motif's generated theme, and whether the theme has variants. */
  theme: boolean;
  variants: boolean;
  options: SwiftUIHarnessOptions;
  /** The simulator to create (and delete); pickSimulator's answer when not given. */
  simulator?: Simulator;
  /** xcodebuild's DerivedData; `<workDir>/DerivedData` when not given. A folder kept between runs makes later builds quicker. */
  derivedData?: string;
  /** For the whole run: every command is stopped when it's used up. */
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  /** How Motif runs commands (for tests): execCommand by default. */
  exec?: Exec;
  /** How Motif shuts a simulator down and deletes it, synchronously, as the exit hook needs (for tests). */
  remove?: (udid: string) => { code: number; stderr: string };
  /** design/states/Setup.swift and the --state files, compiled into the harness. */
  scripts?: { setup?: SwiftUIScript; states?: SwiftUIScript[] };
  /** How Motif runs work when it exits, Ctrl+C included (for tests): cleanup's onExit by default. */
  onExit?: (fn: () => void) => () => void;
  /** How a macOS run finds and stops its test host and removes its defaults (for tests). */
  host?: MacHostIO;
}

/**
 * What a macOS test host's bundle identifier gets (decision 0010, §17): a defaults domain of its own, which Motif
 * deletes, so the developer's own app's settings are never read or written.
 */
export const MAC_HOST_SUFFIX = ".motif-shots";

/** How stopMacHost runs commands (synchronously, as the exit hook needs), stops processes, and finds the user's home. */
export interface MacHostIO {
  spawn?: (cmd: string[]) => { exitCode: number | null; stdout: string };
  kill?: (pid: number) => void;
  home?: string;
  /** A folder's path with its symbolic links resolved (the host runs from it: /private/var/…, not /var/…). */
  realpath?: (path: string) => string;
}

const hostSpawn = (cmd: string[]) => {
  try {
    const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "ignore", timeout: 10_000 });
    return { exitCode: r.exitCode, stdout: r.stdout ? Buffer.from(r.stdout).toString() : "" };
  } catch {
    return { exitCode: null, stdout: "" };
  }
};
const hostKill = (pid: number) => {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Gone already.
  }
};

/**
 * Stops a macOS run's test host and removes what it leaves outside the run's work folder, synchronously (it also runs
 * from the exit hook). The host is launched apart from xcodebuild, so stopping xcodebuild doesn't stop it: every
 * process whose executable is an app inside `derivedData` (Motif's own build of the app) is killed. The host's
 * defaults domain (`hostId`, which must end in MAC_HOST_SUFFIX) is deleted, with its plist and saved window state (in
 * the Library, and in the temporary folder, where macOS 27 keeps it).
 * How many processes it stopped.
 */
export function stopMacHost(derivedData: string, hostId: string | undefined, io: MacHostIO = {}): { killed: number } {
  const spawn = io.spawn ?? hostSpawn;
  const kill = io.kill ?? hostKill;
  // The host's command line names the build's real path: a temporary folder's /var/folders/… runs as
  // /private/var/folders/…. Both are Motif's own.
  const real = (() => {
    try {
      return (io.realpath ?? ((p: string) => realpathSync.native(p)))(derivedData);
    } catch {
      return resolve(derivedData);
    }
  })();
  const prefixes = [...new Set([resolve(derivedData), real])].map((p) => `${p}${sep}`);
  let killed = 0;
  const listed = spawn(["ps", "-axww", "-o", "pid=,command="]);
  for (const line of listed.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const command = m[2]!;
    if (pid === process.pid || !prefixes.some((p) => command.startsWith(p)) || !/\.app[\\/]Contents[\\/]MacOS[\\/]/.test(command)) continue;
    kill(pid);
    killed++;
  }
  if (hostId?.endsWith(MAC_HOST_SUFFIX) && hostId.length > MAC_HOST_SUFFIX.length) {
    spawn(["defaults", "delete", hostId]);
    const library = join(io.home ?? homedir(), "Library");
    rmSync(join(library, "Preferences", `${hostId}.plist`), { force: true });
    rmSync(join(library, "Saved Application State", `${hostId}.savedState`), { recursive: true, force: true });
    // macOS 27 keeps it in the user's own temporary folder (DARWIN_USER_TEMP_DIR), which is $TMPDIR unless something
    // set another (an eval runner does); both are looked in, for the host's own state only.
    const userTemp = spawn(["getconf", "DARWIN_USER_TEMP_DIR"]).stdout.trim();
    for (const folder of new Set([userTemp, tmpdir()].filter((f) => f !== "").map((f) => resolve(f)))) {
      rmSync(join(folder, `${hostId}.savedState`), { recursive: true, force: true });
    }
  }
  return { killed };
}

/**
 * What a macOS run that was killed may have left, found from its build and stopped, for any later run of the app (an
 * iOS run of a multiplatform app too): every host running from `derivedData`, and the defaults domain of each app built
 * there whose bundle id is a host's (read from the built app's Info.plist). How many processes it stopped.
 */
export function sweepMacLeftovers(derivedData: string, io: MacHostIO = {}): { killed: number } {
  const products = join(derivedData, "Build", "Products");
  if (!existsSync(products)) return { killed: 0 };
  const spawn = io.spawn ?? hostSpawn;
  const list = (dir: string) => {
    try {
      return readdirSync(dir).sort();
    } catch {
      return [];
    }
  };
  const ids = new Set<string>();
  for (const config of list(products)) {
    for (const app of list(join(products, config)).filter((n) => n.endsWith(".app"))) {
      const plist = join(products, config, app, "Contents", "Info.plist");
      const id = spawn(["plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-", plist]).stdout.trim();
      if (id.endsWith(MAC_HOST_SUFFIX)) ids.add(id);
    }
  }
  let killed = stopMacHost(derivedData, [...ids][0], io).killed;
  for (const id of [...ids].slice(1)) killed += stopMacHost(derivedData, id, io).killed;
  return { killed };
}

/** How long each `simctl shutdown` and `simctl delete` may take (3.5 s on the Mac mini, 10 s on CI's runner). */
export const SIMCTL_TIMEOUT_MS = 30_000;

type SyncSpawn = (cmd: string[], opts: { timeout?: number; stdout: "pipe" | "ignore"; stderr: "pipe" | "ignore" }) => { exitCode: number | null; stderr: Buffer | Uint8Array | undefined };

/**
 * Shuts the simulator down and deletes it, synchronously: it also runs from the exit hook, where nothing asynchronous
 * finishes. Each call is stopped after SIMCTL_TIMEOUT_MS; a delete stopped so counts as failed.
 */
export function removeSimulator(udid: string, spawn: SyncSpawn = (cmd, opts) => Bun.spawnSync(cmd, opts)): { code: number; stderr: string } {
  try {
    spawn(["xcrun", "simctl", "shutdown", udid], { timeout: SIMCTL_TIMEOUT_MS, stdout: "ignore", stderr: "ignore" });
    const r = spawn(["xcrun", "simctl", "delete", udid], { timeout: SIMCTL_TIMEOUT_MS, stdout: "pipe", stderr: "pipe" });
    const stderr = r.stderr ? Buffer.from(r.stderr).toString().trim() : "";
    return { code: r.exitCode ?? 1, stderr: r.exitCode === null && !stderr ? `xcrun simctl delete took longer than ${SIMCTL_TIMEOUT_MS / 1000} s` : stderr };
  } catch (e) {
    return { code: 1, stderr: e instanceof Error ? e.message : String(e) };
  }
}

export interface SwiftUIShotResult {
  file: string;
  error?: string;
  ms?: number;
  /** The type of the view drawn (ContentView, ModifiedContent<…>), for Motif's tests. */
  view?: string;
  /** What went wrong in the shot's state; the screen was drawn as the state left it. */
  stateError?: string;
  /** What the audit found on the drawn screen (with checks). */
  issues?: SwiftUIRawIssue[];
  /** The texts whose contrast the audit couldn't judge: no one colour is behind them (a picture, a gradient). */
  unjudged?: string[];
  /** Why the audit couldn't finish on the shot. */
  auditError?: string;
}

export interface SwiftUIRunResult {
  shots: SwiftUIShotResult[];
  previews: { id: string; name?: string }[];
  notes: string[];
}

export interface SwiftUIHarnessResult {
  /** xcodebuild's last exit code (null when it was stopped or never ran). */
  code: number | null;
  timedOut: boolean;
  output: string;
  /** What the harness wrote, every launch's shots together; null when it wrote nothing. */
  result: SwiftUIRunResult | null;
  /** Why the run failed or fell short, in plain words, with what to do next. */
  problem?: string;
  /** Things the developer should know that didn't stop the run (a simulator left behind, a runtime other than the SDK's). */
  notes: string[];
  /** How long each step took, in ms: sdk, list, settings, create, boot, test (every launch), delete. */
  timings: Record<string, number>;
  simulator: Simulator | null;
  /** The simulator the run created (and deleted). */
  udid: string | null;
}

/** The app target's build settings, from `xcodebuild -showBuildSettings -json`'s standard output. */
export function appBuildSettings(stdout: string, target?: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("["))) as { target?: string; buildSettings?: Record<string, string> }[];
    return (target === undefined ? parsed[0] : parsed.find((t) => t.target === target))?.buildSettings ?? null;
  } catch {
    return null;
  }
}

/** The settings the harness's target copies from the app's, so it's built for the same platforms and versions. */
const COPIED = ["IPHONEOS_DEPLOYMENT_TARGET", "MACOSX_DEPLOYMENT_TARGET", "SDKROOT", "SUPPORTED_PLATFORMS", "TARGETED_DEVICE_FAMILY"];

/** The project's shared schemes, as XML. */
function sharedSchemes(projectDir: string): string[] {
  const dir = join(projectDir, "xcshareddata", "xcschemes");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".xcscheme") && f !== `${TEST_TARGET}.xcscheme`)
      .map((f) => readFileSync(join(dir, f), "utf8"));
  } catch {
    return [];
  }
}

/**
 * The project file with build settings set on one target, in each of its configurations: replaced where the target
 * sets them, added where it doesn't (so they win over an xcconfig's). For the copy only: a macOS host's bundle id.
 */
export function withTargetSettings(pbx: string, target: string, values: Record<string, string>): string {
  const { objs, named } = projectAndTarget(pbx, target);
  const app = named(target);
  if (!app?.obj) throw new Error(`The project has no target named ${target}.`);
  const list = objs.get(unquote(field(app.obj.own, "buildConfigurationList") ?? ""));
  const configs = (list ? listIds(pbx, list, "buildConfigurations") : []).map((id) => objs.get(id)).filter((o): o is PbxObject => !!o);
  let out = pbx;
  // From the last in the file to the first, so the earlier ones' offsets still hold.
  for (const config of configs.sort((a, b) => b.start - a.start)) {
    let text = config.text;
    const opened = /\bbuildSettings = \{/.exec(text);
    if (!opened) continue;
    for (const [key, value] of Object.entries(values)) {
      const setting = new RegExp(`(\\n\\s*)${key} = ("(?:[^"\\\\]|\\\\.)*"|[^;\\s]+);`);
      text = setting.test(text)
        ? text.replace(setting, (_, indent: string) => `${indent}${key} = ${pbxString(value)};`)
        : `${text.slice(0, opened.index + opened[0].length)}\n\t\t\t\t${key} = ${pbxString(value)};${text.slice(opened.index + opened[0].length)}`;
    }
    out = `${out.slice(0, config.start)}${text}${out.slice(config.end + 1)}`;
  }
  return out;
}

/**
 * The project file with a macOS host's bundle ids (decision 0010, §17): the app target's is `hostId`, and every other
 * target's that is written under the app's (`<realId>.Widget`, an extension the app embeds) moves under the host's
 * (`<hostId>.Widget`), as Xcode's check of embedded binaries needs. Ids written otherwise (an xcconfig's, a variable)
 * are left; the build says when one of them is embedded.
 */
export function withHostIds(pbx: string, target: string, realId: string, hostId: string): string {
  let out = withTargetSettings(pbx, target, { PRODUCT_BUNDLE_IDENTIFIER: hostId });
  const objs = pbxObjects(out);
  const configs: PbxObject[] = [];
  for (const o of objs.values()) {
    if (!/\bisa = PBXNativeTarget;/.test(o.own) || unquote(field(o.own, "name") ?? "") === target) continue;
    const list = objs.get(unquote(field(o.own, "buildConfigurationList") ?? ""));
    for (const id of list ? listIds(out, list, "buildConfigurations") : []) {
      const config = objs.get(id);
      if (config) configs.push(config);
    }
  }
  const setting = /(\bPRODUCT_BUNDLE_IDENTIFIER = )("(?:[^"\\]|\\.)*"|[^;\s]+);/;
  for (const config of configs.sort((a, b) => b.start - a.start)) {
    const m = setting.exec(config.text);
    const id = m ? unquote(m[2]!) : "";
    if (!m || !id.startsWith(`${realId}.`) || id.startsWith(`${hostId}.`) || id.includes("$")) continue;
    const text = config.text.replace(setting, `$1${pbxString(`${hostId}${id.slice(realId.length)}`)};`);
    out = `${out.slice(0, config.start)}${text}${out.slice(config.end + 1)}`;
  }
  return out;
}

/** Writes the harness's sources and options into the work folder, and the scheme and the patched project into the copy. */
export function writeHarness(
  run: Pick<SwiftUIHarnessRun, "copyDir" | "workDir" | "app" | "options" | "scripts">,
  build: SwiftUIAppBuild,
  settings: Record<string, string>,
  configuration: string,
  pbx: string,
  hostIds?: { real: string; host: string },
): void {
  const project = join(run.copyDir, run.app.project);
  const folder = join(run.workDir, SOURCES_FOLDER);
  mkdirSync(folder, { recursive: true });
  const sources: Record<string, string> = {
    "MotifShotTests.swift": TEST_SOURCE,
    "MotifPreviews.swift": PREVIEWS_SOURCE,
    "MotifShotApp.swift": appSourceFor(build),
    "MotifStates.swift": STATES_SOURCE,
    "MotifAudit.swift": AUDIT_SOURCE,
    "MotifHooks.swift": hooksSource(run.scripts),
  };
  if (run.scripts?.setup) sources["MotifSetup.swift"] = scriptSource(run.scripts.setup, build.module);
  for (const state of run.scripts?.states ?? []) sources[`MotifState_${stateFunction(state.name!).slice("motifState_".length)}.swift`] = scriptSource(state, build.module);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(sources)) writeFileSync(join(folder, name), text);
  writeFileSync(join(run.workDir, OPTIONS_FILE), JSON.stringify(run.options, null, 2));
  const copied = Object.fromEntries(COPIED.filter((k) => settings[k]).map((k) => [k, settings[k]!]));
  const base = hostIds ? withHostIds(pbx, run.app.name, hostIds.real, hostIds.host) : pbx;
  const patched = addTestTarget(base, run.app.name, Object.keys(sources), build, copied, folder.replace(/\\/g, "/"));
  writeFileSync(join(project, "project.pbxproj"), patched.pbx);
  const schemes = join(project, "xcshareddata", "xcschemes");
  mkdirSync(schemes, { recursive: true });
  writeFileSync(join(schemes, `${TEST_TARGET}.xcscheme`), schemeFor(run.app.project, patched, run.app.name, build, configuration));
}

interface WrittenResult extends SwiftUIRunResult {
  /** The shot the harness was drawing when it last wrote, and whether it got to the end. */
  current?: { screen: string; file: string } | null;
  done?: boolean;
}

/** result.json as the harness last wrote it; null when there's none, "unreadable" when it's cut short. */
function readResult(path: string): WrittenResult | null | "unreadable" {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && Array.isArray(parsed.shots) ? (parsed as WrittenResult) : "unreadable";
  } catch {
    return "unreadable";
  }
}

/** True when xcodebuild stopped because the build failed, before any test ran. */
const buildFailed = (output: string) => /Testing cancelled because the build failed|\*\* BUILD FAILED \*\*|The following build commands failed/.test(output);

/** A build step that needed git: Motif's copy of the project has no .git folder. */
const NEEDS_GIT = /not a git repository|fatal: [^\n]*\bgit\b|git: command not found/i;

/**
 * Why the build failed, in plain words: a setup or state file that doesn't compile is named (its errors give its path
 * and line), else the app's build with the compiler's errors, and a hint when a build script needed git.
 */
function buildProblem(output: string, scripts: SwiftUIHarnessRun["scripts"], platform: SwiftUIPlatform = "ios"): string {
  const files = [...(scripts?.setup ? [scripts.setup] : []), ...(scripts?.states ?? [])].map((s) => s.file);
  const errors = compilerErrors(output);
  const theirs = files.filter((f) => errors.split("\n").some((l) => l.startsWith(`${f}:`)));
  if (theirs.length > 0) {
    const lines = errors.split("\n").filter((l) => theirs.some((f) => l.startsWith(`${f}:`)));
    return `${andList(theirs)} ${theirs.length === 1 ? "doesn't" : "don't"} compile:\n${lines.join("\n")}\nFix ${theirs.length === 1 ? "it" : "them"}, then run motif shot again.`;
  }
  if (NEEDS_GIT.test(output)) {
    return (
      `The app didn't build with Motif's harness:\n${errors}\n` +
      'Motif builds a copy of the project without its .git folder, and a build script here needs git ("not a git repository"). ' +
      "Make the script carry on without git (check git rev-parse --is-inside-work-tree first), then run motif shot again."
    );
  }
  return `The app didn't build with Motif's harness:\n${errors}\nCheck that the app builds for ${DESTINATION[platform]} in Xcode, then run motif shot again.`;
}

/** Where a run draws the app: in an iOS simulator Motif creates, or on the Mac itself (a macOS app). */
export type SwiftUIPlatform = "ios" | "macos";
/** The destination as Xcode's toolbar names it, for what to check there. */
const DESTINATION: Record<SwiftUIPlatform, string> = { ios: "the iOS simulator", macos: "My Mac" };
/** Where the app launches, for what to check when it doesn't. */
const LAUNCHES: Record<SwiftUIPlatform, string> = { ios: "in the simulator", macos: "on this Mac" };

/** The compiler's errors in xcodebuild's output, each once (the first ten), or its last lines when it gave none. */
function compilerErrors(output: string): string {
  const errors = [...new Set(output.split(/\r?\n/).filter((l) => /: error: /.test(l)).map((l) => l.trim()))];
  return errors.length > 0 ? errors.slice(0, 10).join("\n") : tail(output);
}

/**
 * Why the app stopped, from xcodebuild's output: Swift's `Fatal error: …`, else an Objective-C exception's
 * `Terminating app due to uncaught exception '…', reason: '…'`; null when it gave neither.
 */
export function crashReason(output: string): string | null {
  const fatal = /(?:^|\n)(?:[^\n]*?: )?(Fatal error: [^\n]*)/.exec(output);
  if (fatal) return fatal[1]!.trim();
  const exception = /(Terminating app due to uncaught exception [^\n]*)/.exec(output);
  return exception ? exception[1]!.trim() : null;
}

/** True when `dir` is `parent` or inside it. */
function isInside(parent: string, dir: string): boolean {
  const rel = relative(resolve(parent), resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Adds the harness to the copy, creates a simulator, runs xcodebuild test with the harness on it, and deletes the
 * simulator whatever happens (on Ctrl+C too). A screen that stops the app fails with its reason; the run goes on with
 * the other screens in a new launch. Every command is bounded by what remains of `timeoutMs`. The copy and the work
 * folder are the caller's to delete.
 */
export async function runSwiftUIHarness(run: SwiftUIHarnessRun): Promise<SwiftUIHarnessResult> {
  const exec = run.exec ?? execCommand;
  const deadline = Date.now() + run.timeoutMs;
  const left = () => deadline - Date.now();
  const timings: Record<string, number> = {};
  const notes: string[] = [];
  let output = "";
  let lastCode: number | null = null;
  let simulator: Simulator | null = run.simulator ?? null;
  let udid: string | null = null;
  const done = (fields: Partial<SwiftUIHarnessResult>): SwiftUIHarnessResult => ({
    code: lastCode,
    timedOut: false,
    output,
    result: null,
    notes,
    timings,
    simulator,
    udid,
    ...fields,
  });
  const step = async (name: string, cmd: string[], env?: Record<string, string | undefined>, signal?: AbortSignal) => {
    const t = performance.now();
    const r = await exec(cmd, { timeoutMs: left(), env: env ?? run.env, cwd: run.copyDir, ...(signal ? { signal } : {}) });
    timings[name] = (timings[name] ?? 0) + Math.round(performance.now() - t);
    return r;
  };
  const tooLong = (what: string) =>
    done({ timedOut: true, problem: `The screenshots took longer than ${Math.round(run.timeoutMs / 1000)} s and were stopped while ${what}. Run motif shot again with fewer screens, or a longer time limit.` });

  if (run.app.kind !== "xcodeproj") throw new Error("The harness draws apps with an Xcode project; a Swift package app isn't drawn yet.");
  const project = join(run.copyDir, run.app.project);
  const pbxPath = join(project, "project.pbxproj");
  const derivedData = run.derivedData ?? join(run.workDir, DERIVED_DATA);
  // Inside the copy, a synchronized folder (Xcode 16's) would build the harness's sources, or DerivedData's generated
  // Swift, into the app: it takes every file under it, hidden folders too.
  for (const [what, dir] of [["work folder", run.workDir], ["DerivedData", derivedData]] as const) {
    if (isInside(run.copyDir, dir)) {
      return done({ problem: `Motif's ${what} (${dir}) is inside the copy of the app, where a synchronized folder could build it into the app. Put it outside the copy.` });
    }
  }
  const resultPath = join(run.workDir, RESULT_FILE);
  mkdirSync(run.workDir, { recursive: true });
  rmSync(resultPath, { force: true });
  for (const s of run.options.shots) rmSync(join(run.options.outDir, s.file), { force: true });

  // The app's settings are read through the harness's own scheme: xcodebuild takes -derivedDataPath only with a scheme,
  // and without it would leave a folder in ~/Library/Developer/Xcode/DerivedData for every copy. So the harness is
  // written first with the target's name for its module and product, then again, from the untouched project file,
  // with what xcodebuild says.
  const original = readFileSync(pbxPath, "utf8");
  const configuration = testConfiguration(original, run.app.name, sharedSchemes(project));
  const guess: SwiftUIAppBuild = { module: run.app.name, product: `${run.app.name}.app`, executable: run.app.name, appStruct: run.appStruct, variants: run.variants, theme: run.theme };
  writeHarness(run, guess, {}, configuration, original);
  const platform: SwiftUIPlatform = run.platform ?? "ios";
  const shown = await step("settings", [
    "xcodebuild", "-showBuildSettings", "-json", "-project", project, "-scheme", TEST_TARGET, "-configuration", configuration,
    "-destination", platform === "macos" ? "generic/platform=macOS" : "generic/platform=iOS Simulator", "-derivedDataPath", derivedData,
  ]);
  if (shown.timedOut) return tooLong("reading the app's build settings");
  const settings = shown.code === 0 ? appBuildSettings(shown.stdout, run.app.name) : null;
  if (!settings) {
    return done({
      problem: `xcodebuild couldn't read the ${run.app.name} target's build settings:\n${tail(`${shown.stdout}\n${shown.stderr}`)}\nCheck that the ${run.app.name} scheme builds for ${DESTINATION[platform]} in Xcode, then run motif shot again.`,
    });
  }
  const build: SwiftUIAppBuild = {
    ...guess,
    module: settings.PRODUCT_MODULE_NAME ?? guess.module,
    product: settings.FULL_PRODUCT_NAME ?? guess.product,
    executable: settings.EXECUTABLE_NAME ?? guess.executable,
  };
  // A macOS app runs on the Mac itself: as an app of its own (its bundle id suffixed, so its defaults domain is
  // Motif's, deleted after), with its home in the work folder (decision 0010, §17).
  const realId = settings.PRODUCT_BUNDLE_IDENTIFIER;
  const hostId = platform === "macos" && realId && !realId.includes("$") ? `${realId}${MAC_HOST_SUFFIX}` : undefined;
  writeHarness(run, build, settings, configuration, original, hostId && realId ? { real: realId, host: hostId } : undefined);
  const hostHome = join(run.workDir, "home");
  const testEnv: Record<string, string> = platform === "macos" ? { TEST_RUNNER_CFFIXED_USER_HOME: hostHome, TEST_RUNNER_HOME: hostHome } : {};

  /** xcodebuild's command for an action (build-for-testing, test-without-building) on the run's destination. */
  const xcodebuildOn = (destination: string) => (action: string) => [
    "xcodebuild", action, "-project", project, "-scheme", TEST_TARGET, "-configuration", configuration,
    "-destination", destination, "-derivedDataPath", derivedData, "-collect-test-diagnostics", "never",
    "CODE_SIGNING_ALLOWED=NO", "COMPILER_INDEX_STORE_ENABLE=NO", "ENABLE_TESTABILITY=YES",
  ];

  /**
   * Every launch of the built harness, until each shot is drawn or has failed: a screen that stops the app fails with
   * its reason, and the screens left are drawn in a new launch.
   */
  const launches = async (xcodebuild: (action: string) => string[]): Promise<SwiftUIHarnessResult> => {
    const merged: SwiftUIRunResult = { shots: [], previews: [], notes: [] };
    let remaining = [...run.options.shots];
    for (let launch = 0; remaining.length > 0; launch++) {
      writeFileSync(join(run.workDir, OPTIONS_FILE), JSON.stringify({ ...run.options, shots: remaining }, null, 2));
      rmSync(resultPath, { force: true });
      const tested = await step("test", xcodebuild("test-without-building"), {
        ...(run.env ?? process.env),
        ...testEnv,
        TEST_RUNNER_MOTIF_SHOT_OPTIONS: join(run.workDir, OPTIONS_FILE),
      });
      // xcodebuild hands the variables that start with TEST_RUNNER_ to the test's process, without the prefix.
      output = `${output}${tested.stdout}\n${tested.stderr}`.slice(-200_000);
      lastCode = tested.code;
      const written = readResult(resultPath);
      if (written === "unreadable") return done({ result: merged.shots.length ? merged : null, problem: "The harness's result file is cut short; the run may have been stopped while writing it. Run motif shot again." });
      if (written) {
        if (merged.previews.length === 0) merged.previews = written.previews ?? [];
        for (const n of written.notes ?? []) if (!merged.notes.includes(n)) merged.notes.push(n);
        merged.shots.push(...written.shots);
      }
      if (tested.timedOut) {
        // A screen that never finishes (an endless loop in body, a wait on the main thread) used up the time: the shots
        // before it are kept, and the screen is named.
        const hung = written?.current;
        return done({
          timedOut: true,
          result: merged.shots.length ? merged : null,
          problem: hung
            ? `The screenshots took longer than ${Math.round(run.timeoutMs / 1000)} s and were stopped while drawing ${hung.screen} (${hung.file}); the shots before it were kept. Check that screen for work that never ends, or run motif shot again with a longer time limit.`
            : `The screenshots took longer than ${Math.round(run.timeoutMs / 1000)} s and were stopped while drawing the screens. Run motif shot again with fewer screens, or a longer time limit.`,
        });
      }
      if (!written && buildFailed(output)) {
        return done({ problem: buildProblem(output, run.scripts, platform) });
      }
      if (!written) {
        const skipped = /MOTIF_SHOT_OPTIONS isn't set/.test(output);
        return done({
          result: merged.shots.length ? merged : null,
          problem: skipped
            ? "The harness's test ran without its options and drew nothing. Run motif shot again; if it happens again, tell Motif's maintainers which Xcode you use."
            : `xcodebuild ran the harness, but it wrote no result:\n${tail(output)}\n${crashReason(output) ? "The app stopped before the first screenshot. " : ""}Check that the app launches ${LAUNCHES[platform]}, then run motif shot again.`,
        });
      }
      if (written.done) break;
      // The app stopped (a fatalError in a screen, a missing environment object): the shot it was drawing names the
      // screen. Its other shots fail with the same reason, and the other screens are drawn in a new launch.
      const current = written.current;
      const reason = crashReason(tested.stdout + tested.stderr) ?? "the app stopped without a reason Motif could read";
      if (!current) {
        return done({ result: merged.shots.length ? merged : null, problem: `The app stopped before drawing its first screen: ${reason}. Check that it launches ${LAUNCHES[platform]}, then run motif shot again.` });
      }
      const drawn = new Set(written.shots.map((s) => s.file));
      const rest = remaining.filter((s) => !drawn.has(s.file));
      const error = `${current.screen === "/" ? "The app's root view" : `The preview ${current.screen}`} stopped the app: ${reason}`;
      for (const s of rest.filter((s) => s.screen === current.screen)) merged.shots.push({ file: s.file, error });
      if (!merged.notes.includes(error)) merged.notes.push(error);
      remaining = rest.filter((s) => s.screen !== current.screen);
    }
    return done({ result: merged });
  };

  // A macOS app is built for the Mac and drawn there, in the app's own process (decision 0010, §17): no simulator.
  // The host is launched apart from xcodebuild, so stopping xcodebuild (the time limit, Ctrl+C) doesn't stop it: it is
  // stopped, and its defaults removed, before the run (one a killed run left), after it, and when Motif exits.
  if (platform === "macos") {
    const stopHost = () => stopMacHost(derivedData, hostId, run.host);
    if (stopHost().killed > 0) notes.push("Stopped a copy of the app that an earlier motif shot left running when it was stopped.");
    mkdirSync(hostHome, { recursive: true });
    const cancelHostHook = (run.onExit ?? onExit)(() => void stopHost());
    try {
      const xcodebuild = xcodebuildOn("platform=macOS");
      const built = await step("build", xcodebuild("build-for-testing"));
      output = `${built.stdout}\n${built.stderr}`.slice(-200_000);
      lastCode = built.code;
      if (built.timedOut) return tooLong("building the app");
      // An extension the app embeds whose id Motif couldn't move under the host's: Xcode's check of embedded binaries.
      const embedded = /ValidateEmbeddedBinary \S*\/([^/\s]+\.(?:appex|app|xpc))\b/.exec(output);
      if (built.code !== 0 && embedded && hostId && realId) {
        return done({
          problem:
            `Motif gives ${run.app.name} a bundle id of its own for its screenshots (${hostId}), and it embeds ${embedded[1]}, whose bundle id Motif couldn't change to match: ` +
            `its id isn't written in its target as one that starts with ${realId}. (it may come from an xcconfig or a variable). ` +
            "Write it that way in the extension target's build settings (Product Bundle Identifier), then run motif shot again.",
        });
      }
      if (built.code !== 0) return done({ problem: buildProblem(output, run.scripts, platform) });
      // Never launched as the developer's own app: its screens would read and write that app's settings.
      const plist = join(settings.BUILT_PRODUCTS_DIR ?? join(derivedData, "Build", "Products", configuration), build.product, "Contents", "Info.plist");
      const read = await step("id", ["plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-", plist]);
      const builtId = read.code === 0 ? read.stdout.trim() : "";
      if (!builtId.endsWith(MAC_HOST_SUFFIX)) {
        return done({
          problem:
            `Motif couldn't give ${run.app.name} a bundle id of its own for its screenshots: the app it built is ${builtId || "unreadable"}, not ${hostId ?? `<its id>${MAC_HOST_SUFFIX}`}, ` +
            `so its screens would read and write your own ${run.app.name}'s settings, and Motif stopped before launching it. ` +
            `Set the ${run.app.name} target's Product Bundle Identifier in its build settings, and its Info.plist's CFBundleIdentifier to $(PRODUCT_BUNDLE_IDENTIFIER), then run motif shot again.`,
        });
      }
      return await launches(xcodebuild);
    } finally {
      cancelHostHook();
      stopHost();
    }
  }

  if (!simulator) {
    const sdk = await step("sdk", ["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"]);
    const list = await step("list", ["xcrun", "simctl", "list", "-j", "runtimes", "devicetypes"]);
    if (sdk.timedOut || list.timedOut) return tooLong("listing the simulators");
    if (list.code !== 0) {
      return done({
        problem: `Motif couldn't list the iOS simulators (xcrun simctl list failed):\n${tail(list.stderr || list.stdout, 5)}\nCheck that Xcode is selected (xcode-select -p) and opens once, then run motif shot again.`,
      });
    }
    simulator = pickSimulator(list.stdout, sdk.code === 0 ? sdk.stdout : undefined);
    if (!simulator) return done({ problem: "Xcode has no iOS simulator runtime. Install one in Xcode › Settings › Components, then run motif shot again." });
    if (sdk.code === 0 && !simulator.matchesSdk) {
      notes.push(`No iOS ${sdk.stdout.trim()} simulator is installed, the version of Xcode's iOS SDK, so the screenshots were drawn on iOS ${simulator.version}. Install iOS ${sdk.stdout.trim()} in Xcode › Settings › Components to draw them as your Xcode builds them.`);
    }
  }
  const name = `motif-${process.pid}-${Date.now().toString(36)}`;
  const created = await step("create", ["xcrun", "simctl", "create", name, simulator.deviceType, simulator.runtime]);
  if (created.timedOut) return tooLong("creating the simulator");
  const made = created.stdout.trim().split(/\s+/).pop() ?? "";
  if (created.code !== 0 || !/^[0-9A-F-]{36}$/i.test(made)) {
    return done({ problem: `The simulator couldn't be created:\n${tail(`${created.stdout}\n${created.stderr}`, 5)}\nCheck the iOS runtime in Xcode › Settings › Components, then run motif shot again.` });
  }
  const sim = made;
  udid = sim;
  const removeNow = () => (run.remove ?? removeSimulator)(sim);
  const cancelExitHook = (run.onExit ?? onExit)(() => void removeNow());
  try {
    // The app and the harness are built while the simulator boots (decision 0010, §9): the build needs the simulator
    // to exist, not to run. Booted without Simulator.app, so no window opens.
    const xcodebuild = xcodebuildOn(`id=${sim}`);
    const boot = async (): Promise<SwiftUIHarnessResult | null> => {
      const booted = await step("boot", ["xcrun", "simctl", "boot", sim]);
      if (booted.timedOut) return tooLong("booting the simulator");
      if (booted.code !== 0) {
        return done({ problem: `The simulator (${simulator!.deviceType.split(".").pop()}, iOS ${simulator!.version}) couldn't start:\n${tail(booted.stderr || booted.stdout, 5)}\nFree some disk space, or reinstall the runtime in Xcode › Settings › Components, then run motif shot again.` });
      }
      const ready = await step("boot", ["xcrun", "simctl", "bootstatus", sim, "-b"]);
      if (ready.timedOut) return tooLong("waiting for the simulator to boot");
      if (ready.code !== 0) {
        return done({ problem: `The simulator didn't finish booting:\n${tail(ready.stderr || ready.stdout, 5)}\nRun motif shot again; if it happens again, restart the Mac's simulator service (killall -9 com.apple.CoreSimulator.CoreSimulatorService).` });
      }
      // A freshly booted simulator does its first-launch work when the first app starts: an app of its own is started
      // (and stopped) here, while the app builds, so the harness's launch doesn't wait for it (0010, §16). What it
      // answers doesn't matter, and once the build is done it is stopped: it never makes the run longer.
      if (!stopWarm.signal.aborted) await step("warm", ["xcrun", "simctl", "launch", sim, "com.apple.Preferences"], undefined, stopWarm.signal);
      if (!stopWarm.signal.aborted) await step("warm", ["xcrun", "simctl", "terminate", sim, "com.apple.Preferences"], undefined, stopWarm.signal);
      return null;
    };
    // A simulator that can't boot stops the build: there's nothing to draw on. A build that is done stops the warm-up.
    const stopBuild = new AbortController();
    const stopWarm = new AbortController();
    const [unbooted, built] = await Promise.all([
      boot().then((r) => {
        if (r) stopBuild.abort();
        return r;
      }),
      step("build", xcodebuild("build-for-testing"), undefined, stopBuild.signal).then((r) => {
        stopWarm.abort();
        return r;
      }),
    ]);
    output = `${built.stdout}\n${built.stderr}`.slice(-200_000);
    lastCode = built.code;
    if (unbooted && stopBuild.signal.aborted && built.code === null) return unbooted;
    if (built.timedOut) return unbooted ?? tooLong("building the app");
    if (built.code !== 0) {
      const failed = done({ problem: buildProblem(output, run.scripts) });
      // Both failed: both are said.
      return unbooted ? { ...failed, problem: `${failed.problem}\n\n${unbooted.problem}` } : failed;
    }
    if (unbooted) return unbooted;
    return await launches(xcodebuild);
  } finally {
    cancelExitHook();
    const t = performance.now();
    const deleted = removeNow();
    timings.delete = Math.round(performance.now() - t);
    if (deleted.code !== 0) {
      notes.push(`The simulator ${name} (${sim}) couldn't be deleted: ${deleted.stderr || `exit code ${deleted.code}`}. Delete it with: xcrun simctl delete ${sim}`);
    }
  }
}
