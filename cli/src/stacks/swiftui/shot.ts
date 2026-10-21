// motif shot for a SwiftUI app (decision 0010): the screens drawn in an iOS simulator Motif creates, by a unit-test
// target Motif adds to a copy of the app's Xcode project, at every size, light and dark, in every design variant, right
// to left, after an optional setup (design/states/Setup.swift) and with --state scripts. The copy, the work folder and
// the simulator are deleted whatever happens; the build (DerivedData) is kept in Motif's own folder for the next run.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { maskComments, maskStrings } from "../../check/mask";
import { onExit } from "../../cleanup";
import type { DoctorDeps } from "../../commands/doctor";
import { loadTokenDocument } from "../../contract/load";
import { readVariants } from "../../contract/variants";
import type { AppInfo } from "../../detect/stacks";
import { motifHome } from "../../home";
import { routeSlug, shotName, type RouteResult, type Scheme, type StateScript } from "../../shot/capture";
import { andList } from "../../text";
import { statesFile, type StatesFile } from "../flutter/inputs";
import type { NativeShotOptions } from "../native";
import { swiftUIDoctor } from "./doctor";
import { THEME_FILE } from "./generate";
import {
  execCommand, removeSimulator, runSwiftUIHarness, type Exec, type SwiftUIHarnessResult, type SwiftUIHarnessRun, type SwiftUIScript, type SwiftUIShot,
} from "./harness";
import { appEntryFile, field, idsIn, pbxObjects, swiftUIApp, unquote, type SwiftUIApp } from "./project";
import { discoverSwiftUIScreens, swiftUIRunName, swiftUIScreenProblem, type SwiftUIPreview } from "./screens";

/** Said before the first run on a computer starts, and in its notes. */
export const SWIFTUI_FIRST_RUN = "The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build.";

/** How Motif sets a design variant on a SwiftUI app, for the note when a variant looks exactly like the default. */
export const SWIFTUI_VARIANT_HOW = ".motifTheme(variant:), or design/states/Setup.swift for an app that switches its own palette";

/**
 * The time limit of a run (decision 0010, §9): 600 s for a real app's first build in the copy (its packages fetched
 * there), and 5 s a screenshot for screens that wait to their cap.
 */
export const swiftUITimeLimit = (shots: number) => 600_000 + 5_000 * shots;

/** How long a screen may take to settle before it's drawn as it is, and a setup or a state may run, in seconds. */
const SETTLE_S = 5;
const STATE_S = 15;

/** A phone's status bar and home indicator, in points, as Flutter's and Compose's screenshots have them. */
const PHONE_INSETS: [number, number] = [47, 34];

export const SETUP_FILE = "design/states/Setup.swift";
const SETUP_SIGNATURE = "func motifSetup(variant: String, locale: Locale, dark: Bool)";
const STATE_SIGNATURE = "@MainActor func motifState(_ app: MotifHarness) async throws";

/** How many screens a run takes when the developer doesn't choose: /, then the previews (as Compose's). */
export const MAX_SCREENS = 12;
const LEFT_OUT_NAMED = 5;

// ---- Before the run ----

/**
 * Why motif shot can't draw this SwiftUI app here: not a Mac, or Xcode (or its simulator) missing, in doctor's words; a
 * Swift package app, or an app for macOS only, which the simulator doesn't draw yet.
 */
export function swiftUIShotRefusal(root: string, app: AppInfo, doctor: DoctorDeps): { error: string; text: string } | null {
  const [item] = swiftUIDoctor(doctor, { root, apps: [app] });
  if (item && doctor.platform !== "darwin") return { error: "needs-mac", text: `${item.detail} Run motif shot on a Mac that has Xcode.` };
  if (item?.status === "needed") return { error: "needs-xcode", text: `${item.detail} Then run motif shot again.` };
  const swift = swiftUIApp(resolve(root, app.path));
  if (swift?.kind === "package") return { error: "needs-xcode-project", text: packageText(swift.name) };
  if (swift && !swift.platforms.includes("ios")) {
    return {
      error: "macos-not-yet",
      text:
        `${swift.name} is built for macOS only, and Motif draws SwiftUI screens in the iOS simulator; macOS apps can't be drawn yet. ` +
        "If the app can run on iPhone or iPad too, add iPhone to its target's Supported Destinations in Xcode, then run motif shot again.",
    };
  }
  return null;
}

/**
 * Why a Swift package app isn't drawn (decision 0010, §3 and Task 8): its tests run in a bare process with no app and no
 * window scene, so screens would be drawn from their layers, without blurs and materials, and its fonts registered by hand.
 */
export const packageText = (name: string) =>
  `Motif draws a SwiftUI app's screens through its Xcode project, and ${name} is a Swift package (Package.swift), which motif shot can't draw yet. ` +
  "Make an Xcode project for it (in Xcode: File › New › Project › App, then add the package and use its views), and run motif shot in that project's folder.";

interface SwiftUIInputs {
  states: SwiftUIScript[];
  setup: { script: SwiftUIScript; file: StatesFile } | null;
}

/** True when the Swift text (comments and strings left out) declares the function. */
const declares = (text: string, fn: string) => new RegExp(`\\bfunc\\s+${fn}\\s*\\(`).test(maskStrings(maskComments(text, "swift"), "swift"));

/**
 * What motif shot is given for a SwiftUI app, checked before anything is written: the --screen previews, the --state
 * files and design/states/Setup.swift (the app's own, else the project's). The first problem, if any.
 */
export function readSwiftUIInputs(root: string, appDir: string, given: { screens: string[]; states: StateScript[] }): SwiftUIInputs | { error: string } {
  const screens = swiftUIScreenProblem(appDir, given.screens);
  if (screens) return { error: screens };
  const states: SwiftUIScript[] = [];
  for (const state of given.states) {
    const file = basename(state.file ?? state.name);
    if (!/\.swift$/i.test(file)) return { error: `--state: ${file} isn't a Swift file; a SwiftUI app's states are Swift files, like design/states/${state.name}.swift.` };
    if (!declares(state.script, "motifState")) {
      return { error: `--state: ${file} must define ${STATE_SIGNATURE}, which Motif runs on each screen once it has settled. Add it, then run motif shot again.` };
    }
    states.push({ name: state.name, file: state.file ?? resolve(root, file), text: state.script });
  }
  const found = statesFile(root, appDir, "Setup.swift");
  let setup: SwiftUIInputs["setup"] = null;
  if (found) {
    const text = readFileSync(found.file, "utf8");
    if (!declares(text, "motifSetup")) return { error: `${found.shown} must define ${SETUP_SIGNATURE}. Fix it, then run motif shot again.` };
    setup = { script: { file: found.file, text }, file: found };
  }
  return { states, setup };
}

/** What's wrong with what shoot is given (--screen previews, --state files, the setup), before anything is written. */
export function swiftUIInputsProblem(root: string, app: AppInfo, given: { screens: string[]; states?: StateScript[] }): string | null {
  const read = readSwiftUIInputs(resolve(root), resolve(root, app.path), { screens: given.screens, states: given.states ?? [] });
  return "error" in read ? read.error : null;
}

/** SWIFTUI.routes: the root view, then the previews as screens, at most MAX_SCREENS, with a note on those left out. */
export function swiftUIRoutes(appDir: string): { routes: string[]; skipped: string[]; screens: string[]; notes?: string[] } {
  const found = discoverSwiftUIScreens(appDir);
  const names = found.previews.map((p) => swiftUIRunName(found.previews, p));
  const kept = names.slice(0, MAX_SCREENS - 1);
  const left = names.slice(MAX_SCREENS - 1);
  const notes = [...(found.notes ?? [])];
  if (left.length > 0) {
    const list = left.length > LEFT_OUT_NAMED + 1 ? `${left.slice(0, LEFT_OUT_NAMED).join(", ")} and ${left.length - LEFT_OUT_NAMED} more` : andList(left);
    notes.push(`Captured ${MAX_SCREENS} of ${names.length + 1} screens: / first, then the previews. Left out: ${list}. Choose others with --screen.`);
  }
  return { routes: ["/"], skipped: [], screens: kept, ...(notes.length > 0 ? { notes } : {}) };
}

// ---- The app ----

/** The @main App struct's name, from the app's entry file. */
export function appStructName(text: string): string | null {
  const code = maskStrings(maskComments(text, "swift"), "swift");
  return /@main\s+(?:(?:@\w+(?:\([^)]*\))?|public|internal|open|package|final|nonisolated)\s+)*(?:struct|class)\s+(\w+)/.exec(code)?.[1] ?? null;
}

/** The guide's default variant id; "" without variants. */
function defaultVariant(root: string): string {
  const path = join(root, "design", "tokens.json");
  if (!existsSync(path)) return "";
  const { doc } = loadTokenDocument(path, readFileSync(path, "utf8"));
  return (doc && readVariants(doc).defaultId) || "";
}

/** The generated theme (MotifTheme.swift in the app's theme folder), and whether it has variants; null without it. */
function readTheme(root: string, themeDir: string): { variants: boolean } | null {
  const file = join(root, themeDir, THEME_FILE);
  if (!existsSync(file)) return null;
  return { variants: readFileSync(file, "utf8").includes("debugVariantOverride") };
}

/** What an entitlement gives, in plain words; the macOS sandbox's own are left out (an iOS app has none of them). */
const ENTITLEMENTS: [RegExp, string][] = [
  [/^com\.apple\.developer\.icloud-|^com\.apple\.developer\.ubiquity-/, "iCloud"],
  [/^com\.apple\.security\.application-groups$/, "App Groups"],
  [/^keychain-access-groups$/, "Keychain sharing"],
  [/^aps-environment$/, "push notifications"],
  [/^com\.apple\.developer\.associated-domains$/, "Associated Domains"],
  [/^com\.apple\.developer\.healthkit/, "HealthKit"],
  [/^com\.apple\.developer\.applesignin$/, "Sign in with Apple"],
  [/^com\.apple\.developer\.in-app-payments$/, "Apple Pay"],
  [/^com\.apple\.developer\.homekit$/, "HomeKit"],
  [/^com\.apple\.developer\.siri$/, "Siri"],
];

/**
 * The capabilities the app target's entitlements ask for. Motif builds the copy without signing (CODE_SIGNING_ALLOWED=NO),
 * so the app runs in the simulator without them.
 */
export function signedCapabilities(appDir: string, app: SwiftUIApp): string[] {
  let pbx: string;
  try {
    pbx = readFileSync(join(appDir, app.project, "project.pbxproj"), "utf8");
  } catch {
    return [];
  }
  const objs = pbxObjects(pbx);
  const target = [...objs.values()].find((o) => /\bisa = PBXNativeTarget;/.test(o.own) && unquote(field(o.own, "name") ?? "") === app.name);
  const list = objs.get(unquote(field(target?.own ?? "", "buildConfigurationList") ?? ""));
  const configs = idsIn(list?.own.match(/buildConfigurations = \(([^)]*)\)/)?.[1]).map((id) => objs.get(id)?.text ?? "");
  const files = new Set(configs.flatMap((c) => [...c.matchAll(/\bCODE_SIGN_ENTITLEMENTS = ("[^"]*"|[^;\s]+);/g)].map((m) => unquote(m[1]!))));
  const found = new Set<string>();
  for (const file of files) {
    let plist: string;
    try {
      plist = readFileSync(resolve(appDir, file.replace(/^\$\((?:SRCROOT|PROJECT_DIR)\)\//, "")), "utf8");
    } catch {
      continue;
    }
    for (const key of [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]!.trim())) {
      if (/^com\.apple\.security\.(app-sandbox|files\.|network\.|device\.|personal-information\.|print$|automation\.)/.test(key)) continue;
      const named = ENTITLEMENTS.find(([re]) => re.test(key))?.[1];
      if (named) found.add(named);
      else if (/^com\.apple\.developer\./.test(key)) found.add(key);
    }
  }
  return [...found];
}

/** Folders the copy and the language search leave out: build output, dependencies, version control, Motif's own. */
const SKIP = new Set([".git", ".build", "DerivedData", ".motif", "build", "node_modules", "xcuserdata", ".swiftpm"]);

/**
 * True when the app has strings for a language: a <lang>.lproj folder (or <lang>-<region>.lproj), or a string catalogue
 * (.xcstrings) with a translation in it.
 */
export function offersLanguage(appDir: string, lang: string): boolean {
  const same = (code: string) => code.toLowerCase() === lang || code.toLowerCase().startsWith(`${lang}-`) || code.toLowerCase().startsWith(`${lang}_`);
  let seen = 0;
  const visit = (dir: string, depth: number): boolean => {
    if (depth > 6 || seen > 5000) return false;
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return false;
    }
    for (const name of entries) {
      seen++;
      if (SKIP.has(name) || name.endsWith(".xcodeproj")) continue;
      const path = join(dir, name);
      if (name.endsWith(".lproj") && same(name.slice(0, -".lproj".length))) return true;
      if (name.endsWith(".xcstrings")) {
        try {
          const catalogue = JSON.parse(readFileSync(path, "utf8")) as { strings?: Record<string, { localizations?: Record<string, unknown> }> };
          if (Object.values(catalogue.strings ?? {}).some((s) => Object.keys(s?.localizations ?? {}).some(same))) return true;
        } catch {
          // A catalogue Motif can't read offers nothing it can see.
        }
        continue;
      }
      try {
        if (statSync(path).isDirectory() && visit(path, depth + 1)) return true;
      } catch {
        // Gone, or not readable.
      }
    }
    return false;
  };
  return visit(appDir, 0);
}

// ---- The run's screenshots ----

interface Target {
  /** What the run named: "/", another route, or a preview as given (its name, or File.swift:line). */
  key: string;
  /** What a SwiftUIShot's screen holds: "/" or <File>.swift:<line>. */
  screen?: string;
  slug: string;
  /** The preview's file, relative to the app's folder. */
  file?: string;
  /** Why the screen can't be drawn at all (a route other than /). */
  error?: string;
}

const NOT_A_ROUTE = (route: string) =>
  `${route} can't be opened: SwiftUI screens aren't reached by an address, so Motif draws / (the app's root view) and its #Preview blocks. Give the screen's preview with --screen.`;

/** The run's screens: the routes, then the previews, each with its slug. */
export function swiftUITargets(opts: Pick<NativeShotOptions, "routes" | "screens">, previews: SwiftUIPreview[]): Target[] {
  const used = new Set<string>();
  const unique = (slug: string) => {
    let s = slug;
    for (let n = 2; used.has(s); n++) s = `${slug}-${n}`;
    used.add(s);
    return s;
  };
  const targets: Target[] = opts.routes.map((route) => ({
    key: route,
    slug: unique(routeSlug(route)),
    ...(route === "/" ? { screen: "/" } : { error: NOT_A_ROUTE(route) }),
  }));
  for (const name of opts.screens) {
    const hit = (p: SwiftUIPreview) => p.name === name || p.screen === name || name.endsWith(`/${p.screen}`);
    const p = previews.find(hit);
    if (!p) throw new Error(`--screen ${name} isn't a #Preview Motif found in this app.`);
    targets.push({ key: name, screen: p.screen, slug: unique(p.slug), file: p.file });
  }
  return targets;
}

/** A planned screenshot, with the screen it belongs to. */
export type PlannedShot = SwiftUIShot & { target: string };

/**
 * Every screenshot of a run, in the web's order: per screen, size, scheme, then variant, direction and state. Phones
 * are drawn at 3×, as a phone's screen is, and get its safe area; the tablet and wider at 2× (decision 0010, §1).
 */
export function planSwiftUIShots(opts: NativeShotOptions, targets: Target[], theme: { variants: boolean } | null, defaultId: string): PlannedShot[] {
  const shots: PlannedShot[] = [];
  for (const t of targets.filter((t) => t.screen)) {
    for (const v of opts.viewports) {
      for (const scheme of ["light", "dark"] as Scheme[]) {
        for (const variant of [undefined, ...opts.variants]) {
          for (const lang of [undefined, ...(opts.rtl ? [opts.rtl] : [])]) {
            for (const state of [undefined, ...opts.states.map((s) => s.name)]) {
              const size = v.file ?? v.name;
              const phone = v.mobile && v.width < 600;
              // The default's shots set the default too, so an app that passes its own variant is drawn in the guide's
              // default; a variant is always passed, so one the app's theme lacks fails with what to do.
              const id = variant ?? defaultId;
              const set = variant ?? (theme?.variants && defaultId ? defaultId : undefined);
              shots.push({
                target: t.key,
                screen: t.screen!,
                file: shotName(state ? `${t.slug}@${state}` : t.slug, size, scheme, variant, Boolean(lang)),
                width: v.width,
                height: v.height,
                scale: phone ? 3 : Math.max(v.scale, 2),
                dark: scheme === "dark",
                locale: lang ?? "en_US",
                rtl: Boolean(lang),
                ...(phone ? { insets: PHONE_INSETS } : {}),
                ...(set ? { variant: set } : {}),
                variantId: id,
                ...(state ? { state } : {}),
              });
            }
          }
        }
      }
    }
  }
  return shots;
}

/** A crash that looks like a dependency the screen was meant to be given (an environment object, a SwiftData container). */
const MISSING_DEPENDENCY = /No ObservableObject of type|No Observable object of type|may be missing as an ancestor|modelContext|ModelContainer|environmentObject/i;

/** A screen's error, with what to do when it stopped the app for want of something the App gives its screens. */
export function screenError(error: string, screen: string): string {
  if (!/ stopped the app: /.test(error) || !MISSING_DEPENDENCY.test(error)) return error;
  return screen === "/"
    ? `${error} Motif draws the root view from the App's WindowGroup on its own, with the environment the App puts on its scene; what the App sets up elsewhere (in its init, or in onAppear) doesn't reach it. Give it inside the WindowGroup (WindowGroup { ContentView().environmentObject(…) }), or set it up in ${SETUP_FILE}.`
    : `${error} Give the preview what the screen needs in its #Preview block (.environmentObject(…), .environment(…), .modelContainer(…)).`;
}

/** What a run that couldn't fetch the app's Swift packages says, in place of xcodebuild's log. */
const PACKAGES_FAILED = /Could not resolve package dependencies|Failed to resolve dependencies|Failed to clone repository|failed downloading .*package/i;

/** The run's result as RouteResults: drawn screens (200) with their errors, and those that couldn't be (0). */
export function mapSwiftUIResult(
  targets: Target[],
  shots: PlannedShot[],
  outDir: string,
  run: Pick<SwiftUIHarnessResult, "result" | "problem" | "timedOut" | "notes">,
  timeoutMs: number,
): { routes: RouteResult[]; notes: string[] } {
  const results = new Map((run.result?.shots ?? []).map((s) => [s.file, s]));
  const why = run.timedOut ? `The run reached its time limit (${Math.round(timeoutMs / 1000)} s) before drawing it.` : (run.problem ?? "xcodebuild stopped before drawing it.");
  const errorsSeen = new Set<string>();
  const routes = targets.map((t): RouteResult => {
    const base = { route: t.key, url: t.key };
    if (t.error) return { ...base, status: 0, error: t.error, shots: [] };
    const mine = shots.filter((s) => s.target === t.key);
    const drawn: string[] = [];
    const errors: string[] = [];
    const soft: string[] = [];
    let missing = false;
    for (const s of mine) {
      const r = results.get(s.file);
      if (!r) {
        missing = true;
        continue;
      }
      if (r.error) {
        errorsSeen.add(r.error);
        const e = screenError(r.error, t.screen!);
        if (!errors.includes(e)) errors.push(e);
        continue;
      }
      if (r.stateError && !soft.includes(r.stateError)) soft.push(r.stateError);
      if (existsSync(join(outDir, s.file))) drawn.push(join(outDir, s.file));
    }
    if (missing && drawn.length === 0 && errors.length === 0) errors.push(why);
    if (drawn.length > 0) {
      const pageErrors = [...errors, ...soft];
      return { ...base, status: 200, shots: drawn, ...(pageErrors.length > 0 ? { pageErrors } : {}) };
    }
    const [first, ...rest] = errors.length > 0 ? errors : [why];
    const pageErrors = [...rest, ...soft];
    return { ...base, status: 0, error: first!, shots: [], ...(pageErrors.length > 0 ? { pageErrors } : {}) };
  });
  // A screen that stopped the app is in its own error already.
  const notes = (run.result?.notes ?? []).filter((n) => !errorsSeen.has(n));
  if (run.problem && run.result) notes.push(run.problem);
  return { routes, notes: [...notes, ...run.notes] };
}

// ---- Motif's folder for the app ----

/** Where Motif keeps an app's copy, work folder and build: under its own home, named by the app's folder. */
export function swiftUICacheDir(home: string, appDir: string, name: string): string {
  const hash = createHash("sha256").update(resolve(appDir)).digest("hex").slice(0, 12);
  return join(home, "swiftui", `${name.replace(/[^A-Za-z0-9_-]+/g, "") || "app"}-${hash}`);
}

/**
 * The folder to copy: the app's, or the one above it that holds what its project names outside it (a local Swift
 * package beside the app, ../Shared), never above the project's root.
 */
export function copyBase(root: string, appDir: string, pbx: string): string {
  const ups = Math.max(0, ...[...pbx.matchAll(/\b(?:path|relativePath) = "?((?:\.\.\/)+)/g)].map((m) => m[1]!.length / 3));
  let base = resolve(appDir);
  const top = resolve(root);
  for (let i = 0; i < ups && base !== top && relative(top, base) !== "" && !relative(top, base).startsWith(".."); i++) base = dirname(base);
  return base;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

export interface SwiftUIShotDeps {
  /** The app's theme folder, relative to the project root (SWIFTUI.themeDir). */
  themeDir?: string;
  /** Motif's home, for the app's build. */
  home?: string;
  /** Stands in for runSwiftUIHarness in tests. */
  run?: (run: SwiftUIHarnessRun) => Promise<SwiftUIHarnessResult>;
  /** How commands run and simulators are removed (tests), passed to the harness too. */
  exec?: Exec;
  remove?: (udid: string) => { code: number; stderr: string };
  onExit?: (fn: () => void) => () => void;
}

/** Deletes simulators a killed motif shot left (motif-<pid>-…, its process gone); how many. */
async function removeLeftovers(exec: Exec, remove: (udid: string) => { code: number; stderr: string }): Promise<number> {
  const listed = await exec(["xcrun", "simctl", "list", "-j", "devices"], { timeoutMs: 30_000 });
  if (listed.code !== 0) return 0;
  let devices: { name: string; udid: string }[] = [];
  try {
    devices = Object.values((JSON.parse(listed.stdout) as { devices?: Record<string, { name: string; udid: string }[]> }).devices ?? {}).flat();
  } catch {
    return 0;
  }
  let removed = 0;
  for (const d of devices) {
    const pid = Number(/^motif-(\d+)-/.exec(d.name)?.[1]);
    if (!pid || pid === process.pid || alive(pid)) continue;
    if (remove(d.udid).code === 0) removed++;
  }
  return removed;
}

/** SWIFTUI.shoot: copies the app, adds the harness, draws in a simulator, reads what it drew, and deletes all but the build. */
export async function shootSwiftUI(opts: NativeShotOptions, deps: SwiftUIShotDeps = {}): Promise<{ routes: RouteResult[]; issues: []; notes: string[] }> {
  const started = Date.now();
  const root = resolve(opts.root);
  const appDir = resolve(root, opts.app.path);
  const swift = swiftUIApp(appDir);
  if (!swift) throw new Error(`Motif couldn't read the SwiftUI app in ${opts.app.path}.`);
  if (swift.kind !== "xcodeproj") throw new Error(packageText(swift.name));
  const inputs = readSwiftUIInputs(root, appDir, opts);
  if ("error" in inputs) throw new Error(inputs.error);
  const entry = appEntryFile(appDir, swift);
  const appStruct = entry ? appStructName(readFileSync(entry, "utf8")) : null;
  if (!appStruct) throw new Error(`Motif couldn't find the app's @main App struct in ${swift.sourceRoot}, which it draws the root view from.`);

  const notes: string[] = [];
  if (inputs.setup?.file.own) notes.push(`This app used its own ${inputs.setup.file.shown}${existsSync(join(root, SETUP_FILE)) ? `, not the project's ${SETUP_FILE}` : ""}.`);
  const themeDir = deps.themeDir ?? opts.app.themeDir;
  const theme = themeDir ? readTheme(root, themeDir) : null;
  if (!theme && existsSync(join(root, "design", "tokens.json"))) {
    notes.push("This app doesn't have Motif's theme code yet (run motif tokens), so the screenshots show its own colours, and its design variants can't be drawn.");
  }
  const defaultId = defaultVariant(root);
  const { previews } = discoverSwiftUIScreens(appDir);
  const targets = swiftUITargets(opts, previews);
  const shots = planSwiftUIShots(opts, targets, theme, defaultId);
  if (opts.rtl && !offersLanguage(appDir, opts.rtl)) {
    notes.push(`This app doesn't offer ${opts.rtl} (its string catalogues and .lproj folders have no ${opts.rtl} strings), so its RTL screenshots show its default strings, laid out right to left.`);
  }
  const capabilities = signedCapabilities(appDir, swift);
  if (capabilities.length > 0) {
    notes.push(
      `Motif builds the app for the simulator without signing it, so it runs without what its entitlements give (${andList(capabilities)}): screens that use ${capabilities.length === 1 ? "it" : "them"} may fail or show nothing. Fake what they need in ${SETUP_FILE}.`,
    );
  }

  const exec = deps.exec ?? execCommand;
  const remove = deps.remove ?? ((udid: string) => removeSimulator(udid));
  const left = await removeLeftovers(exec, remove);
  if (left > 0) notes.push(`Deleted ${left === 1 ? "a simulator" : `${left} simulators`} that an earlier motif shot left behind when it was stopped.`);

  // The copy, the work folder and the build go in Motif's own folder, outside the developer's project: inside it, an
  // Xcode 16 synchronized folder at the project's root would build them into the app (decision 0010, §2).
  const cache = swiftUICacheDir(deps.home ?? motifHome(), appDir, swift.name);
  const copyRoot = join(cache, "copy");
  const workDir = join(cache, "work");
  const derivedData = join(cache, "DerivedData");
  const lock = join(cache, "run.lock");
  mkdirSync(cache, { recursive: true });
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8").trim());
    if (pid && pid !== process.pid && alive(pid)) {
      throw new Error(`Another motif shot (process ${pid}) is drawing this app's screens. Wait for it to finish, then run motif shot again.`);
    }
  }
  writeFileSync(lock, String(process.pid));
  if (!existsSync(derivedData)) {
    opts.progress?.(SWIFTUI_FIRST_RUN);
    notes.unshift(SWIFTUI_FIRST_RUN);
  }
  const cleanup = () => {
    for (const dir of [copyRoot, workDir]) rmSync(dir, { recursive: true, force: true });
    rmSync(lock, { force: true });
  };
  const cancel = (deps.onExit ?? onExit)(cleanup);
  try {
    // A fresh copy each run, at the same path, so the kept build is reused and the project file and scheme are the
    // developer's own again (the harness refuses a project that already has its target).
    rmSync(copyRoot, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
    const pbx = readFileSync(join(appDir, swift.project, "project.pbxproj"), "utf8");
    const base = copyBase(root, appDir, pbx);
    const outDir = resolve(opts.outDir);
    cpSync(base, copyRoot, {
      recursive: true,
      preserveTimestamps: true,
      filter: (src) => !SKIP.has(basename(src)) && resolve(src) !== outDir,
    });
    const copyDir = join(copyRoot, relative(base, appDir).split(sep).join("/"));
    const run = deps.run ?? runSwiftUIHarness;
    const result = await run({
      copyDir,
      workDir,
      app: swiftUIApp(copyDir) ?? swift,
      appStruct,
      theme: theme !== null,
      variants: theme?.variants ?? false,
      options: {
        outDir,
        shots: shots.map(({ target: _, ...s }) => s),
        settle: SETTLE_S,
        stateLimit: STATE_S,
        ...(inputs.setup ? { setupFile: inputs.setup.file.shown } : {}),
      },
      derivedData,
      timeoutMs: Math.max(1, opts.timeoutMs - (Date.now() - started)),
      scripts: { ...(inputs.setup ? { setup: inputs.setup.script } : {}), states: inputs.states },
      ...(deps.exec ? { exec: deps.exec } : {}),
      ...(deps.remove ? { remove: deps.remove } : {}),
      ...(deps.onExit ? { onExit: deps.onExit } : {}),
    });
    if (!result.result) {
      const said = !result.timedOut ? result.output.split(/\r?\n/).find((l) => PACKAGES_FAILED.test(l))?.trim() : undefined;
      if (said) {
        throw new Error(
          `xcodebuild couldn't fetch the app's Swift packages (it said: ${said}). Connect to the internet for the first run; later runs reuse them from Motif's build of the app.`,
        );
      }
      throw new Error(result.problem ?? "xcodebuild stopped before drawing any screen.");
    }
    const mapped = mapSwiftUIResult(targets, shots, outDir, result, opts.timeoutMs);
    const routes = opts.audit ? mapped.routes.map((r) => (r.status === 200 ? { ...r, auditError: "Motif doesn't audit SwiftUI screens yet" } : r)) : mapped.routes;
    return { routes, issues: [], notes: [...notes, ...mapped.notes] };
  } finally {
    cancel();
    cleanup();
  }
}
