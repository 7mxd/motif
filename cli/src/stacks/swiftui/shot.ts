// motif shot for a SwiftUI app (decision 0010): the screens drawn in an iOS simulator Motif creates, by a unit-test
// target Motif adds to a copy of the app's Xcode project, at every size, light and dark, in every design variant, right
// to left, after an optional setup (design/states/Setup.swift) and with --state scripts. The copy, the work folder and
// the simulator are deleted whatever happens; the build (DerivedData) is kept in Motif's own folder for the next run.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { maskComments, maskStrings } from "../../check/mask";
import { onExit } from "../../cleanup";
import type { DoctorDeps } from "../../commands/doctor";
import { loadTokenDocument } from "../../contract/load";
import { readVariants } from "../../contract/variants";
import type { AppInfo } from "../../detect/stacks";
import { motifHome } from "../../home";
import { MAC_WINDOWS, NATIVE_VIEWPORTS, parseSizes, routeSlug, shotName, type RouteResult, type Scheme, type StateScript, type Viewport } from "../../shot/capture";
import { andList } from "../../text";
import type { AuditIssue, RawIssue } from "../../shot/audit";
import { statesFile, type StatesFile } from "../flutter/inputs";
import { auditChecks, MOTION_WIDTH } from "../flutter/shot";
import type { NativeShotOptions } from "../native";
import { swiftUIDoctor } from "./doctor";
import { THEME_FILE } from "./generate";
import {
  execCommand, removeSimulator, runSwiftUIHarness, stateFunction, sweepMacLeftovers, type AuditCheck, type Exec, type SwiftUIRawIssue, type MacHostIO, type SwiftUIHarnessResult, type SwiftUIHarnessRun, type SwiftUIScript, type SwiftUIShot,
} from "./harness";
import { appEntryFile, field, idsIn, packageText, pbxObjects, swiftUIApp, unquote, type SwiftUIApp } from "./project";
import { discoverSwiftUIScreens, swiftUIRunName, swiftUIScreenProblem, type SwiftUIPreview } from "./screens";

/** Said before the first run on a computer starts, and in its notes. */
export const SWIFTUI_FIRST_RUN = "The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build.";
/** The same, for a macOS app, which is built and drawn on the Mac itself. */
export const SWIFTUI_FIRST_RUN_MAC = "The first SwiftUI screenshots of a macOS app build it, which takes a few minutes; later runs reuse the build.";

/** A macOS app's windows (capture.ts holds them, so sentences about sizes can name them). */
export { MAC_WINDOWS };

/**
 * Where a run draws the app: on the Mac for a macOS-only app, and for a multiplatform one when every size asked for
 * is a window; else in the iOS simulator.
 */
export function swiftUIPlatform(app: Pick<SwiftUIApp, "platforms">, viewports: Viewport[]): "ios" | "macos" {
  if (!app.platforms.includes("ios")) return "macos";
  const windows = viewports.length > 0 && viewports.every((v) => MAC_WINDOWS.includes(v));
  return app.platforms.includes("macos") && windows ? "macos" : "ios";
}

/**
 * SWIFTUI.shotSizes: a macOS app's windows (both, without --sizes); for a multiplatform app, --sizes chooses: phone
 * and tablet sizes are drawn in the iOS simulator (the default), window sizes on the Mac, and both at once is refused.
 * Null for an iOS app, whose sizes are the native ones.
 */
export function swiftUIShotSizes(root: string, app: AppInfo, given: string | undefined): { viewports: Viewport[] } | { error: string } | null {
  const swift = swiftUIApp(resolve(root, app.path));
  if (!swift?.platforms.includes("macos")) return null;
  if (!swift.platforms.includes("ios")) {
    if (given === undefined) return { viewports: MAC_WINDOWS };
    for (const part of given.split(",").map((p) => p.trim()).filter(Boolean)) {
      const one = parseSizes(part, MAC_WINDOWS);
      if ("error" in one || one.length === 0) {
        return {
          error: `--sizes: "${part}" isn't one of a macOS app's sizes. ${swift.name} is built for macOS only, so its screens are drawn in windows: 1440 (1440×900) and 900 (900×700), like --sizes 1440,900.`,
        };
      }
    }
    const sizes = parseSizes(given, MAC_WINDOWS);
    return "error" in sizes ? sizes : { viewports: sizes };
  }
  if (given === undefined) return null;
  const sizes = parseSizes(given, [...NATIVE_VIEWPORTS, ...MAC_WINDOWS]);
  if ("error" in sizes) return sizes;
  if (sizes.some((v) => MAC_WINDOWS.includes(v)) && sizes.some((v) => !MAC_WINDOWS.includes(v))) {
    return {
      error:
        `--sizes: ${swift.name} runs on iPhone and on the Mac, and Motif draws one of them a run: phone and tablet sizes (${NATIVE_VIEWPORTS.map((v) => v.width).join(", ")}) in the iOS simulator, ` +
        `windows (${MAC_WINDOWS.map((v) => v.width).join(", ")}) on the Mac. Run motif shot once for each, like --sizes 390 and --sizes 1440.`,
    };
  }
  return { viewports: sizes };
}

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
 * Why motif shot can't draw this SwiftUI app here: not a Mac, or Xcode (or, for an iOS app, its simulator) missing, in
 * doctor's words; a Swift package app; a project Motif can't copy whole. A macOS app is drawn on the Mac itself.
 */
export function swiftUIShotRefusal(root: string, app: AppInfo, doctor: DoctorDeps, sizes?: Viewport[]): { error: string; text: string } | null {
  // A multiplatform app drawn at window sizes runs on the Mac: it needs no iOS simulator.
  const chosen = sizes ? swiftUIApp(resolve(root, app.path)) : null;
  const onMac = chosen ? swiftUIPlatform(chosen, sizes!) === "macos" : false;
  const [item] = swiftUIDoctor(doctor, { root, apps: [app], ...(onMac ? { platform: "macos" as const } : {}) });
  if (item && doctor.platform !== "darwin") return { error: "needs-mac", text: `${item.detail} Run motif shot on a Mac that has Xcode.` };
  if (item?.status === "needed") return { error: "needs-xcode", text: `${item.detail} Then run motif shot again.` };
  const swift = swiftUIApp(resolve(root, app.path));
  if (swift?.kind === "package") return { error: "needs-xcode-project", text: packageText(swift.name) };
  return swift?.kind === "xcodeproj" ? swiftUICopyProblem(root, resolve(root, app.path), swift) : null;
}

export { packageText };

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
    const twin = states.find((s) => stateFunction(s.name!) === stateFunction(state.name));
    if (twin) {
      return { error: `--state: ${basename(twin.file)} and ${file} would be compiled under one name (${stateFunction(state.name)}). Rename one of them.` };
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

/**
 * A planned screenshot, with the screen it belongs to; with --audit, the size and variant its findings name (the
 * variant only when it isn't the default), which stay with Motif.
 */
export type PlannedShot = SwiftUIShot & { target: string; seen?: { size: string; variant?: string } };

/** What to do about each problem in a SwiftUI app, in its own terms (the web's fixes name CSS and ARIA). */
export const SWIFTUI_FIXES = {
  "color-contrast":
    "Use a text colour role with more contrast on this background, or adjust the role in design/tokens.json (motif validate checks the pairs). A system colour (the default tint, .secondary) is replaced with .foregroundStyle(…) on the text, or .tint(…) on a button or link.",
  icon: "Give the icon a colour with at least 3:1 contrast on this background: .foregroundStyle(…) on the image, or .tint(…) on its button; or adjust the role in design/tokens.json (motif validate checks the pairs).",
  "target-mobile":
    "Give it at least 44×44 pt where people tap it: a system style (.buttonStyle(.bordered) or .borderedProminent) has Apple's size; a plain or borderless button, or a view with .onTapGesture, needs .frame(minWidth: 44, minHeight: 44) and .contentShape(Rectangle()) on its label, or padding inside it.",
  "target-link":
    "Give the link at least 44×44 pt where people tap it: .frame(minHeight: 44) and .contentShape(Rectangle()) on it, or padding; a link inside a sentence of Text needs none.",
  motion:
    "Stop this animation, or keep it still, when reduce motion is on: read @Environment(\\.accessibilityReduceMotion) and leave the movement (a .repeatForever(), a moving offset or scale) out then; MotifMotion.animation(…, reduceMotion:) gives no animation then.",
  name: `Give it a name VoiceOver can say: .accessibilityLabel("…") (an SF Symbol's own name, like "gearshape", doesn't say what it does), or a visible title (Label("Settings", systemImage: "gearshape")).`,
} as const;

/** Said with a motion finding when only SwiftUI's environment value could be turned on, not the setting the app reads. */
export const ENVIRONMENT_ONLY = {
  ios: "Motif could turn on only SwiftUI's accessibilityReduceMotion here, not UIAccessibility.isReduceMotionEnabled: an animation that reads that was drawn as with reduce motion off, so check it by eye.",
  macos: "Motif could turn on only SwiftUI's accessibilityReduceMotion here, not NSWorkspace's accessibilityDisplayShouldReduceMotion: an animation that reads that was drawn as with reduce motion off, so check it by eye.",
};

/** The fix for a finding of the harness's, by its rule and kind (a link's target, an icon's colour). */
export function swiftUIFix(i: SwiftUIRawIssue, desktop: boolean): string | undefined {
  switch (i.rule) {
    case "color-contrast":
      return i.kind === "icon" ? SWIFTUI_FIXES.icon : SWIFTUI_FIXES["color-contrast"];
    case "target-mobile":
      return i.kind === "link" ? SWIFTUI_FIXES["target-link"] : SWIFTUI_FIXES["target-mobile"];
    case "motion":
      return i.reducedBy === "environment" ? `${SWIFTUI_FIXES.motion} ${ENVIRONMENT_ONLY[desktop ? "macos" : "ios"]}` : SWIFTUI_FIXES.motion;
    case "name":
      return SWIFTUI_FIXES.name;
    default:
      return undefined;
  }
}

/**
 * The audit's checks on one screenshot. In the simulator, as on the other native stacks: contrast and names everywhere;
 * tap targets on phones and tablets, in light; reduced motion in light at the 390 phone size. On the Mac: contrast and
 * names in every window, reduced motion in light in the 1440 window, and no tap-target check (a Mac is clicked with a
 * pointer, and 44 points is a touch screen's size).
 */
export function swiftUIAuditChecks(v: Viewport, scheme: Scheme, platform: "ios" | "macos"): AuditCheck[] {
  if (platform === "ios") return auditChecks(v, scheme);
  return ["contrast", "names", ...(scheme === "light" && v.width === MAC_MOTION_WIDTH ? (["motion"] as const) : [])];
}

/** The phone size the reduced-motion check runs at in the simulator, for the note when --sizes leaves it out. */
export const SWIFTUI_MOTION = { width: MOTION_WIDTH, text: `the ${MOTION_WIDTH} pt phone size` };

/** The window the reduced-motion check runs in on the Mac: the desktop's. */
export const MAC_MOTION_WIDTH = MAC_WINDOWS[0]!.width;

/**
 * Every screenshot of a run, in the web's order: per screen, size, scheme, then variant, direction and state. Phones
 * are drawn at 3×, as a phone's screen is, and get its safe area; the tablet and wider at 2× (decision 0010, §1). On
 * the Mac, a window is drawn at its own scale (2×), with no safe area (§17).
 */
export function planSwiftUIShots(
  opts: NativeShotOptions,
  targets: Target[],
  theme: { variants: boolean } | null,
  defaultId: string,
  platform: "ios" | "macos" = "ios",
): PlannedShot[] {
  const shots: PlannedShot[] = [];
  for (const t of targets.filter((t) => t.screen)) {
    for (const v of opts.viewports) {
      for (const scheme of ["light", "dark"] as Scheme[]) {
        for (const variant of [undefined, ...opts.variants]) {
          for (const lang of [undefined, ...(opts.rtl ? [opts.rtl] : [])]) {
            for (const state of [undefined, ...opts.states.map((s) => s.name)]) {
              const size = v.file ?? v.name;
              const phone = platform === "ios" && v.mobile && v.width < 600;
              // The default's shots set the default too, so an app that passes its own variant is drawn in the guide's
              // default; a variant is always passed, so one the app's theme lacks fails with what to do.
              const id = variant ?? defaultId;
              const set = variant ?? (theme?.variants && defaultId ? defaultId : undefined);
              const checks = opts.audit ? swiftUIAuditChecks(v, scheme, platform) : undefined;
              shots.push({
                target: t.key,
                screen: t.screen!,
                file: shotName(state ? `${t.slug}@${state}` : t.slug, size, scheme, variant, Boolean(lang)),
                width: v.width,
                height: v.height,
                scale: platform === "macos" ? v.scale : phone ? 3 : Math.max(v.scale, 2),
                dark: scheme === "dark",
                locale: lang ?? "en_US",
                rtl: Boolean(lang),
                ...(phone ? { insets: PHONE_INSETS } : {}),
                ...(set ? { variant: set } : {}),
                variantId: id,
                ...(state ? { state } : {}),
                ...(checks ? { checks } : {}),
                // The reduced-motion check looks at the screen with reduce motion on, as someone who turned it on sees it.
                ...(checks?.includes("motion") ? { reduceMotion: true } : {}),
                ...(checks ? { seen: { size, ...(variant ? { variant } : {}) } } : {}),
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
    ? `${error} Motif draws the root view from a new App's WindowGroup, with what the App puts on its scene; the App's init runs for it, but what its delegate sets up at launch, and SwiftData's .modelContainer(for:) on the scene, don't reach it. Give it inside the WindowGroup (WindowGroup { ContentView().environmentObject(…) }), or set it up in ${SETUP_FILE}.`
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
): { routes: RouteResult[]; issues: AuditIssue[]; notes: string[] } {
  const results = new Map((run.result?.shots ?? []).map((s) => [s.file, s]));
  const issues: AuditIssue[] = [];
  const unjudged: string[] = [];
  const why = run.timedOut ? `The run reached its time limit (${Math.round(timeoutMs / 1000)} s) before drawing it.` : (run.problem ?? "xcodebuild stopped before drawing it.");
  const errorsSeen = new Set<string>();
  const more: string[] = [];
  // What the system draws itself, which the app can't change (decision 0010, §18): left out, and named in a note.
  const systemParts = new Set<string>();
  const routes = targets.map((t): RouteResult => {
    const base = { route: t.key, url: t.key };
    if (t.error) return { ...base, status: 0, error: t.error, shots: [] };
    const mine = shots.filter((s) => s.target === t.key);
    const drawn: string[] = [];
    const errors: string[] = [];
    const soft: string[] = [];
    let missing = false;
    let auditError: string | undefined;
    const notJudged = new Set<string>();
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
      if (!existsSync(join(outDir, s.file))) continue;
      drawn.push(join(outDir, s.file));
      // The audit's findings on this screenshot, named by where they were seen, as on the other stacks.
      auditError ??= r.auditError;
      for (const text of r.unjudged ?? []) notJudged.add(text);
      for (const { nth, of, reducedBy, systemPart, ...i } of r.issues ?? []) {
        if (systemPart) {
          systemParts.add(systemPart);
          continue;
        }
        const size = s.seen?.size ?? "";
        const fix = swiftUIFix({ ...i, ...(reducedBy ? { reducedBy } : {}) }, size.startsWith("desktop"));
        issues.push({
          ...i,
          // Two unnamed buttons on one screen are two places, not one.
          ...(nth && of && of > 1 ? { selector: `${i.selector}[${nth}]` } : {}),
          route: t.key,
          viewport: size.startsWith("desktop") ? "desktop" : "mobile",
          size,
          scheme: s.dark ? "dark" : "light",
          shot: join(outDir, s.file),
          ...(s.state ? { state: s.state } : {}),
          ...(s.seen?.variant ? { variant: s.seen.variant } : {}),
          ...(s.rtl ? { rtl: true as const } : {}),
          ...(fix ? { fix } : {}),
        });
      }
    }
    // A screen the contrast check couldn't fully judge says so, so nobody takes it as clean.
    if (notJudged.size > 0) {
      const n = notJudged.size;
      unjudged.push(`Contrast on ${t.key} wasn't judged for ${n === 1 ? "1 text" : `${n} texts`} with no one colour behind ${n === 1 ? "it" : "them"} (a picture or a gradient): check ${n === 1 ? "it" : "them"} by eye.`);
    }
    if (missing && errors.length === 0) errors.push(why);
    // The screen's line shows its first error, as on the other stacks; the others (a state that ran out of time, say)
    // are in the notes rather than lost.
    const also = (rest: string[]) => {
      if (rest.length > 0) more.push(`${t.key} also had: ${rest.join(" ")}`);
    };
    if (drawn.length > 0) {
      const pageErrors = [...errors, ...soft];
      also(pageErrors.slice(1));
      // Shots that weren't drawn (a setup that failed): the line says how many, not that the screenshots show it.
      const undrawn = mine.length - drawn.length;
      return {
        ...base, status: 200, shots: drawn, ...(undrawn > 0 && errors.length > 0 ? { missing: undrawn } : {}), ...(pageErrors.length > 0 ? { pageErrors } : {}),
        ...(auditError ? { auditError } : {}),
      };
    }
    const [first, ...rest] = errors.length > 0 ? errors : [why];
    const pageErrors = [...rest, ...soft];
    also(pageErrors);
    return { ...base, status: 0, error: first!, shots: [], ...(pageErrors.length > 0 ? { pageErrors } : {}) };
  });
  // A screen that stopped the app is in its own error already.
  const notes = [...(run.result?.notes ?? []).filter((n) => !errorsSeen.has(n)), ...more, ...unjudged];
  if (systemParts.size > 0) {
    notes.push(`The audit left out what the system draws itself (${[...systemParts].join(", ")}), which the app can't change.`);
  }
  if (run.problem && run.result) notes.push(run.problem);
  return { routes, issues, notes: [...notes, ...run.notes] };
}

// ---- Motif's folder for the app ----

/** Where Motif keeps an app's copy, work folder and build: under its own home, named by the app's folder. */
export function swiftUICacheDir(home: string, appDir: string, name: string): string {
  const hash = createHash("sha256").update(resolve(appDir)).digest("hex").slice(0, 12);
  return join(home, "swiftui", `${name.replace(/[^A-Za-z0-9_-]+/g, "") || "app"}-${hash}`);
}

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

/** A path a setting or an xcconfig names from the project's folder ($(SRCROOT)/…, $(PROJECT_DIR)/…, or a plain relative one). */
const SRCROOT_PATH = /\$[({](?:SRCROOT|PROJECT_DIR)[)}]\/([^"\s;,)]+)/g;

/**
 * Every file and folder the project names, as absolute paths: its file references and synchronized folders (each
 * `<group>` path added to its groups', `SOURCE_ROOT` ones from the project's folder), local Swift packages, paths in
 * build settings ($(SRCROOT)/…, $(PROJECT_DIR)/…, and any plain one that climbs out, ../x.h) and the xcconfig files they
 * use (by reference, or Xcode 16's anchor in a synchronized folder), with their #includes and paths. A plain group counts
 * only through what's in it (an empty group's stale path names nothing); absolute paths work the same from the copy, and
 * products and SDK files (other source trees) aren't the project's; paths to nothing that exists are left out.
 */
export function projectReferences(
  pbx: string,
  projectDir: string,
  read: (path: string) => string | null = readText,
  exists: (path: string) => boolean = existsSync,
): string[] {
  const objs = pbxObjects(pbx);
  const parent = new Map<string, string>();
  for (const [id, o] of objs) for (const child of idsIn(o.own.match(/\bchildren = \(([^)]*)\)/)?.[1])) parent.set(child, id);
  const found = new Set<string>();
  const memo = new Map<string, string | null>();
  const where = (id: string, depth = 0): string | null => {
    if (memo.has(id)) return memo.get(id)!;
    const o = objs.get(id);
    if (!o || depth > 64) return null;
    const path = field(o.own, "path");
    const tree = unquote(field(o.own, "sourceTree") ?? '"<group>"');
    let base: string | null;
    if (tree === "<group>") {
      const up = parent.get(id);
      base = up ? where(up, depth + 1) : projectDir;
    } else if (tree === "SOURCE_ROOT") base = projectDir;
    else base = null;
    const at = base === null ? null : path ? resolve(base, unquote(path)) : base;
    memo.set(id, at);
    return at;
  };
  // A path a setting's value climbs out of the project's folder by, from the project's folder as Xcode reads it.
  const upward = (text: string) => {
    for (const m of text.matchAll(SRCROOT_PATH)) found.add(resolve(projectDir, m[1]!));
    for (const m of text.matchAll(/=\s*"?(\.\.\/[^"\s;]*)/g)) found.add(resolve(projectDir, m[1]!));
  };
  const xcconfigs: string[] = [];
  for (const [id, o] of objs) {
    const isa = field(o.own, "isa");
    if (isa && /^(PBXFileReference|XCVersionGroup|PBXFileSystemSynchronizedRootGroup)$/.test(isa)) {
      const at = where(id);
      if (at) found.add(at);
    } else if (isa === "XCLocalSwiftPackageReference") {
      const rel = field(o.own, "relativePath");
      if (rel) found.add(resolve(projectDir, unquote(rel)));
    } else if (isa === "XCBuildConfiguration") {
      upward(o.text);
      for (const key of ["INFOPLIST_FILE", "CODE_SIGN_ENTITLEMENTS"]) {
        const value = field(o.text, key);
        if (value && !unquote(value).includes("$")) found.add(resolve(projectDir, unquote(value)));
      }
      const config = field(o.own, "baseConfigurationReference");
      const at = config ? where(config) : null;
      if (at) xcconfigs.push(at);
      // Xcode 16: an xcconfig inside a synchronized folder, named by the folder and a path in it.
      const anchor = field(o.own, "baseConfigurationReferenceAnchor");
      const rel = field(o.own, "baseConfigurationReferenceRelativePath");
      const folder = anchor ? where(unquote(anchor)) : null;
      if (folder && rel) xcconfigs.push(resolve(folder, unquote(rel)));
    }
  }
  // An xcconfig's #include is relative to the xcconfig; its settings' paths are the project's.
  const seen = new Set<string>();
  while (xcconfigs.length > 0) {
    const file = xcconfigs.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    found.add(file);
    const text = read(file);
    if (text === null) continue;
    for (const m of text.matchAll(/^\s*#include\??\s+"([^"]+)"/gm)) {
      if (!m[1]!.startsWith("<")) xcconfigs.push(resolve(dirname(file), m[1]!));
    }
    upward(text.replace(/^\s*#include.*$/gm, ""));
  }
  return [...found].filter((p) => exists(p)).sort();

}

/** True when `path` is `dir` or inside it. */
const within = (dir: string, path: string) => {
  const rel = relative(resolve(dir), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * The folder to copy: the app's, or the one above it that holds everything its project names (a local Swift package
 * beside the app, ../Shared). What lies outside the folder motif runs in can't be copied: the first such path.
 */
export function copyBase(root: string, appDir: string, references: string[]): { base: string } | { outside: string } {
  const top = resolve(root);
  const outside = references.find((r) => !within(top, r));
  if (outside) return { outside };
  let base = resolve(appDir);
  for (const r of references) while (!within(base, r) && base !== top) base = dirname(base);
  return { base };
}

/**
 * Why Motif can't copy the app whole, or null: a project that names files outside the folder motif runs in, or one
 * whose libraries come from CocoaPods (they build only through the workspace, and Motif builds the project alone).
 */
export function swiftUICopyProblem(root: string, appDir: string, swift: SwiftUIApp): { error: string; text: string } | null {
  if (existsSync(join(appDir, "Podfile"))) {
    return {
      error: "needs-workspace",
      text:
        `${swift.name} gets libraries from CocoaPods (its Podfile), which build only through its workspace, and Motif builds the Xcode project alone, so its screens can't be drawn yet. ` +
        "If the libraries are also Swift packages, move to those (in Xcode: File › Add Package Dependencies…), then run motif shot again.",
    };
  }
  const pbx = readText(join(appDir, swift.project, "project.pbxproj"));
  if (pbx === null) return null;
  const copy = copyBase(root, appDir, projectReferences(pbx, dirname(join(appDir, swift.project))));
  if (!("outside" in copy)) return null;
  let common = dirname(copy.outside);
  while (!within(common, root)) common = dirname(common);
  return {
    error: "outside-project",
    text:
      `${swift.name}'s project uses ${copy.outside}, outside the folder motif runs in (${resolve(root)}), and Motif's copy of the app can't take it. ` +
      `Run motif shot from a folder that holds both (${common}), with --app pointing at the app.`,
  };
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
  /** How a macOS run stops its test host and removes its defaults (tests). */
  host?: MacHostIO;
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
/** How long a kept build may go without a run, and how many apps' builds Motif keeps (decision 0010, §16). */
export const KEEP_DAYS = 14;
export const KEEP_BUILDS = 3;
/** The file whose time says when an app's folder was last used. */
const LAST_USED = "last-used";

/** When an app's folder was last used: its last-used file's time, else the folder's own. */
function lastUsed(dir: string): number {
  for (const path of [join(dir, LAST_USED), dir]) {
    try {
      return statSync(path).mtimeMs;
    } catch {
      // Not there: the next.
    }
  }
  return 0;
}

/** True when the folder's run.lock names a process that is still running. */
function running(dir: string): boolean {
  const pid = Number(readText(join(dir, "run.lock"))?.trim());
  return Boolean(pid) && alive(pid);
}

/** What pruning removed, and what it couldn't (with why). */
export interface Pruned {
  old: string[];
  extra: string[];
  failed: { name: string; path: string; error: string }[];
}

/**
 * Removes the kept builds (`<home>/swiftui/<app>-<hash>/`) of other apps: those unused for KEEP_DAYS days, then the least
 * recently used beyond KEEP_BUILDS (this app's counts as one). A folder a running motif shot holds is never removed:
 * each folder's run.lock is taken (as a run takes it) right before the folder goes, and one a run holds is left. A
 * removal that fails is reported, never the run's failure. `io` stands in for removal and the moment before the lock is
 * taken, for tests.
 */
export function pruneSwiftUIBuilds(
  dir: string,
  current: string,
  now: number,
  days = KEEP_DAYS,
  max = KEEP_BUILDS,
  io: { remove?: (folder: string) => void; beforeClaim?: (folder: string) => void } = {},
): Pruned {
  const out: Pruned = { old: [], extra: [], failed: [] };
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
  } catch {
    return out;
  }
  const others = names.filter((n) => resolve(dir, n) !== resolve(current)).map((n) => ({ n, used: lastUsed(join(dir, n)), live: running(join(dir, n)) }));
  const remove = (n: string): boolean => {
    const folder = join(dir, n);
    io.beforeClaim?.(folder);
    // A folder another run's pruning removed meanwhile is gone already; one Motif can't write to is a note, not a failed run.
    try {
      if ("busy" in claimLock(join(folder, "run.lock"))) return false;
    } catch (e) {
      if (existsSync(folder)) out.failed.push({ name: n, path: folder, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
    try {
      (io.remove ?? ((f: string) => rmSync(f, { recursive: true, force: true })))(folder);
      return true;
    } catch (e) {
      out.failed.push({ name: n, path: folder, error: e instanceof Error ? e.message : String(e) });
      rmSync(join(folder, "run.lock"), { force: true });
      return false;
    }
  };
  const old = others.filter((o) => !o.live && now - o.used > days * 86_400_000);
  for (const o of old) if (remove(o.n)) out.old.push(o.n);
  const left = others.filter((o) => !old.includes(o));
  const room = Math.max(0, max - 1 - left.filter((o) => o.live).length);
  const extra = left.filter((o) => !o.live).sort((a, b) => b.used - a.used).slice(room);
  for (const o of extra) if (remove(o.n)) out.extra.push(o.n);
  return out;
}

/** The apps whose builds were removed, or couldn't be, in plain words. */
export function prunedNotes(pruned: Pruned): string[] {
  const app = (names: string[]) => (names.length === 1 ? "build of an app" : `builds of ${names.length} apps`);
  const short = (n: string) => n.replace(/-[0-9a-f]+$/, "");
  const named = (names: string[]) => andList(names.map(short));
  return [
    ...(pruned.old.length > 0 ? [`Removed Motif's kept ${app(pruned.old)} not drawn in the last ${KEEP_DAYS} days (${named(pruned.old)}).`] : []),
    ...(pruned.extra.length > 0 ? [`Removed Motif's kept ${app(pruned.extra)} drawn less recently than the ${KEEP_BUILDS} it keeps (${named(pruned.extra)}).`] : []),
    ...pruned.failed.map((f) => `Motif couldn't remove its kept build of ${short(f.name)} (${f.path}): ${f.error}. Delete the folder to free its space.`),
  ];
}

/** The bytes in a folder, its subfolders' included. */
function folderSize(dir: string): number {
  let total = 0;
  const visit = (d: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile()) {
        try {
          total += statSync(p).size;
        } catch {
          // Gone.
        }
      }
    }
  };
  visit(dir);
  return total;
}

const sizeText = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);

/**
 * Takes a run.lock: created exclusively (`wx`), so two runs starting together can't both take it. A lock whose process
 * is gone is taken over by moving it aside, which only one run can do; what was moved is read again, and if it names a
 * running process (a run took it over in between) it is put back, and that run keeps it. A lock just created and not
 * written yet (empty, under 5 s old) is busy. `hooks` stands in for the moment before the takeover, for tests.
 */
export function claimLock(lock: string, hooks: { beforeTakeover?: () => void } = {}): { taken: true } | { busy: number } {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx" });
      return { taken: true };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const text = readText(lock)?.trim() ?? "";
    const pid = Number(text);
    if (pid && pid !== process.pid && alive(pid)) return { busy: pid };
    if (!text && Date.now() - lastUsed(lock) < 5_000) return { busy: 0 };
    hooks.beforeTakeover?.();
    const aside = `${lock}.${process.pid}-${attempt}.stale`;
    try {
      renameSync(lock, aside);
    } catch {
      continue;
    }
    const moved = Number(readText(aside)?.trim());
    rmSync(aside, { force: true });
    if (moved && moved !== pid && moved !== process.pid && alive(moved)) {
      try {
        writeFileSync(lock, String(moved), { flag: "wx" });
      } catch {
        // Taken again meanwhile: whoever has it keeps it.
      }
      return { busy: moved };
    }
  }
  return { busy: 0 };
}

/** Takes the app's run.lock for this run, or refuses it, naming the process and the file for when it's wrong. */
export function takeLock(lock: string, hooks: { beforeTakeover?: () => void } = {}): void {
  const claim = claimLock(lock, hooks);
  if (!("busy" in claim)) return;
  if (claim.busy) {
    throw new Error(`Another motif shot (process ${claim.busy}) is drawing this app's screens. Wait for it to finish, then run motif shot again. If none is running, delete ${lock}.`);
  }
  throw new Error(`Motif couldn't take ${lock}. If no motif shot is running, delete it, then run motif shot again.`);
}

/** Build output folders, left out of the copy at the top of the app's folder (or the copied folder), not deeper. */
const TOP_OUTPUT = new Set(["build", ".build", "DerivedData"]);
/** Left out wherever they are: version control, Motif's own, Xcode's per-user state, JavaScript dependencies. */
const ANYWHERE = new Set([".git", ".motif", "xcuserdata", "node_modules"]);

/** What the copy takes: not build output at the top, version control or the screenshots' folder. */
export function copyFilter(base: string, appDir: string, outDir: string): (src: string) => boolean {
  const tops = new Set([resolve(base), resolve(appDir)]);
  return (src) => {
    const name = basename(src);
    if (ANYWHERE.has(name)) return false;
    if (TOP_OUTPUT.has(name) && tops.has(dirname(resolve(src)))) return false;
    return resolve(src) !== resolve(outDir);
  };
}

export async function shootSwiftUI(opts: NativeShotOptions, deps: SwiftUIShotDeps = {}): Promise<{ routes: RouteResult[]; issues: AuditIssue[]; notes: string[] }> {
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
  const platform = swiftUIPlatform(swift, opts.viewports);
  const shots = planSwiftUIShots(opts, targets, theme, defaultId, platform);
  // On the Mac, the reduced-motion check runs in the desktop's window, which a run with --sizes 900 leaves out.
  if (opts.audit && platform === "macos" && !opts.viewports.some((v) => v.width === MAC_MOTION_WIDTH)) {
    notes.push(`The reduced-motion check runs in the ${MAC_MOTION_WIDTH}×${MAC_WINDOWS[0]!.height} window, which --sizes left out.`);
  }
  if (opts.rtl && !offersLanguage(appDir, opts.rtl)) {
    notes.push(`This app doesn't offer ${opts.rtl} (its string catalogues and .lproj folders have no ${opts.rtl} strings), so its RTL screenshots show its default strings, laid out right to left.`);
  }
  const workspace = readdirSync(appDir).find((n) => n.endsWith(".xcworkspace"));
  if (workspace) {
    notes.push(
      `This app has a workspace (${workspace}), and Motif builds ${swift.project} alone: projects only the workspace brings in aren't built, and if the app needs them its build fails.`,
    );
  }
  const capabilities = signedCapabilities(appDir, swift);
  if (capabilities.length > 0) {
    notes.push(
      `Motif builds the app for ${platform === "macos" ? "this Mac" : "the simulator"} without signing it, so it runs without what its entitlements give (${andList(capabilities)}): screens that use ${capabilities.length === 1 ? "it" : "them"} may fail or show nothing. Fake what they need in ${SETUP_FILE}.`,
    );
  }

  const exec = deps.exec ?? execCommand;
  const remove = deps.remove ?? ((udid: string) => removeSimulator(udid));
  // A macOS app is drawn on the Mac itself: no simulator, so none to clean up.
  const left = platform === "ios" ? await removeLeftovers(exec, remove) : 0;
  if (left > 0) notes.push(`Deleted ${left === 1 ? "a simulator" : `${left} simulators`} that an earlier motif shot left behind when it was stopped.`);

  // The copy, the work folder and the build go in Motif's own folder, outside the developer's project: inside it, an
  // Xcode 16 synchronized folder at the project's root would build them into the app (decision 0010, §2).
  const cache = swiftUICacheDir(deps.home ?? motifHome(), appDir, swift.name);
  const copyRoot = join(cache, "copy");
  const workDir = join(cache, "work");
  // One build a platform: a multiplatform app's iOS and macOS builds are kept apart, and each has its first run.
  const derivedData = join(cache, platform === "macos" ? "DerivedData-macos" : "DerivedData");
  const lock = join(cache, "run.lock");
  mkdirSync(cache, { recursive: true });
  takeLock(lock);
  writeFileSync(join(cache, LAST_USED), new Date().toISOString());
  notes.push(...prunedNotes(pruneSwiftUIBuilds(dirname(cache), cache, Date.now())));
  // A macOS run of this app that was killed may have left its host running and its defaults behind: an iOS run of a
  // multiplatform app stops them too (a macOS run does so itself, in the harness).
  const macBuild = join(cache, "DerivedData-macos");
  if (platform === "ios" && existsSync(macBuild) && sweepMacLeftovers(macBuild, deps.host).killed > 0) {
    notes.push("Stopped a copy of the app that an earlier motif shot left running when it was stopped.");
  }
  const firstRun = !existsSync(derivedData);
  if (firstRun) {
    const first = platform === "macos" ? SWIFTUI_FIRST_RUN_MAC : SWIFTUI_FIRST_RUN;
    opts.progress?.(first);
    notes.unshift(first);
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
    const refused = swiftUICopyProblem(root, appDir, swift);
    if (refused) throw new Error(refused.text);
    const pbx = readFileSync(join(appDir, swift.project, "project.pbxproj"), "utf8");
    const copy = copyBase(root, appDir, projectReferences(pbx, dirname(join(appDir, swift.project))));
    const base = "base" in copy ? copy.base : appDir;
    const outDir = resolve(opts.outDir);
    cpSync(base, copyRoot, { recursive: true, preserveTimestamps: true, filter: copyFilter(base, appDir, outDir) });
    const copyDir = join(copyRoot, relative(base, appDir).split(sep).join("/"));
    const copied = Date.now();
    const run = deps.run ?? runSwiftUIHarness;
    const result = await run({
      copyDir,
      workDir,
      app: swiftUIApp(copyDir) ?? swift,
      platform,
      appStruct,
      theme: theme !== null,
      variants: theme?.variants ?? false,
      options: {
        outDir,
        shots: shots.map(({ target: _, seen: __, ...s }) => s),
        settle: SETTLE_S,
        stateLimit: STATE_S,
        ...(inputs.setup ? { setupFile: inputs.setup.file.shown } : {}),
        ...(platform === "macos" && process.env.MOTIF_SWIFTUI_APPKIT === "1" ? { appKitOnly: true } : {}),
      },
      derivedData,
      timeoutMs: Math.max(1, opts.timeoutMs - (Date.now() - started)),
      scripts: { ...(inputs.setup ? { setup: inputs.setup.script } : {}), states: inputs.states },
      ...(deps.exec ? { exec: deps.exec } : {}),
      ...(deps.remove ? { remove: deps.remove } : {}),
      ...(deps.onExit ? { onExit: deps.onExit } : {}),
      ...(deps.host ? { host: deps.host } : {}),
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
    if (process.env.MOTIF_DEBUG) notes.push(`How long each step took, in ms: ${JSON.stringify({ copy: copied - started, ...result.timings })}`);
    if (firstRun && existsSync(derivedData)) {
      notes.push(
        `Motif keeps this app's build in ${derivedData} (${sizeText(folderSize(derivedData))}), so later runs are quicker. ` +
          `It removes a build that goes ${KEEP_DAYS} days without a run, and keeps those of the ${KEEP_BUILDS} apps drawn most recently.`,
      );
    }
    return { routes: mapped.routes, issues: mapped.issues, notes: [...notes, ...mapped.notes] };
  } finally {
    cancel();
    cleanup();
  }
}
