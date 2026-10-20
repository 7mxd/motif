// motif shot for a Jetpack Compose app (decision 0008): the screens drawn by Robolectric in a unit test that Motif adds
// to the app's own Gradle build for one run, at every size, light and dark, in every design variant, and right to left,
// after an optional setup (design/states/Setup.kt).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { DoctorDeps } from "../../commands/doctor";
import { listKotlinFiles } from "../../check/files";
import { maskComments } from "../../check/mask";
import { loadTokenDocument } from "../../contract/load";
import { readVariants } from "../../contract/variants";
import type { AppInfo } from "../../detect/stacks";
import { motifHome } from "../../home";
import type { AuditIssue, RawIssue } from "../../shot/audit";
import { routeSlug, shotName, type RouteResult, type Scheme, type StateScript } from "../../shot/capture";
import type { FetchLike } from "../flutter/harness";
import { statesFile, type StatesFile } from "../flutter/inputs";
import { auditChecks, MOTION_WIDTH, screenNotes } from "../flutter/shot";
import { kotlinIdentifier, RESERVED } from "../naming";
import type { NativeShotOptions } from "../native";
import { findAndroidSdk, gradleJava, NO_ANDROID_SDK } from "./doctor";
import { THEME_FILE } from "./generate";
import {
  composeFont, HARNESS_SRC, harnessReport, ROBOLECTRIC_DOWNLOAD_FAILED, runHarness, variantDrawn, type ComposeFont, type ComposeShot, type HarnessConfig, type HarnessResult, type HarnessRun, type HarnessSource,
} from "./harness";
import { composeThemeDir, gradleRoot, unreadModulesNote } from "./project";
import { composeScreenProblem, discoverComposeScreens, previewSlug, type Preview } from "./screens";

export { MOTION_WIDTH };

/** How Motif sets a design variant on a Compose app, for the note when a variant looks exactly like the default. */
export const COMPOSE_VARIANT_HOW = "MotifTheme(variant = …), or design/states/Setup.kt for an app that switches its own palette";

/** Said before the first run on a computer starts, and in its notes. */
export const COMPOSE_FIRST_RUN = "The first Compose screenshots download Robolectric's Android libraries (a few hundred MB); later runs reuse them.";

/** What a run that couldn't reach the network says, in place of Gradle's stack trace. */
export const COMPOSE_OFFLINE = "Gradle couldn't download what the screenshots need. Connect to the internet for the first run; later runs work offline.";

/**
 * The time limit of a run (decision 0008): 600 s allows for a computer's first run (Gradle, the Android plugin and
 * Robolectric's Android, about 1.5 GB), and 5 s a screenshot for screens that wait to their cap.
 */
export const composeTimeLimit = (shots: number) => 600_000 + 5_000 * shots;

/** How long a screen may take to settle before it's drawn as it is, and a state to run. */
const SETTLE_MS = 5_000;
const STATE_MS = 15_000;

/** A phone's status bar and home indicator, in dp, as Flutter's screenshots have them. */
const PHONE_INSETS = { top: 47, bottom: 34 };

/** What a Gradle failure that couldn't reach the network prints. */
const OFFLINE = /Could not resolve|UnknownHostException/;

/**
 * What Gradle prints when it runs on a JDK newer than it supports: its Groovy can't read the JDK's classes. Captured with
 * Gradle 7.6.4 on JDK 21: "> BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_' Unsupported class
 * file major version 65".
 */
const JDK_TOO_NEW = /Unsupported class file major version (\d+)/;

/** Which JDK to use instead, in plain words (class file version 65 is JDK 21). */
function jdkTooNewText(classVersion: number, javaHome: string): string {
  return (
    `This project's Gradle can't run on JDK ${classVersion - 44}, the one Motif found (${javaHome}): Gradle said "Unsupported class file major version ${classVersion}". ` +
    "Set JAVA_HOME to a JDK this Gradle supports (JDK 17 works with every Gradle the Android plugin 8.6 and later needs), or update the project's Gradle wrapper, then run motif shot again."
  );
}

/** A test task with no compiled tests: Gradle skips it, says NO-SOURCE, and the build succeeds having drawn nothing. */
const NO_SOURCE = /> Task (\S+UnitTest) NO-SOURCE/;

function noSourceText(task: string): string {
  return (
    `Gradle found no test sources for Motif's harness (${task} NO-SOURCE), so nothing was drawn: the module's unit tests didn't take in .motif/shot/src, ` +
    "most likely because its build sets the test source folders itself or turns unit tests off for that variant. Tell Motif's maintainers how the module's tests are set up (its android { sourceSets } and testOptions)."
  );
}

export const SETUP_FILE = "design/states/Setup.kt";
const SETUP_SIGNATURE = "fun motifSetup(variant: String, locale: Locale, dark: Boolean)";
const STATE_SIGNATURE = "fun motifState(rule: ComposeContentTestRule)";

/** What to do about each problem in a Compose app, in its own terms (the web's fixes name CSS and ARIA). */
export const COMPOSE_FIXES: Partial<Record<RawIssue["rule"], string>> = {
  "target-mobile":
    "Give it at least 44×44 dp where people tap it: Modifier.minimumInteractiveComponentSize(), padding, a larger size, or room around it (Compose widens a small target's touch area to 48 dp only where nothing else is).",
  motion: "Stop this animation, or keep it still, when the system's Remove animations setting is on: MotifMotion.reduced() is true then, and MotifMotion.duration(…) is zero.",
  name: "Give it a name a screen reader can say: a contentDescription (Icon and Image take one), a visible label, or Modifier.semantics { contentDescription = … }.",
};

export interface ComposeShotDeps {
  /** The app's theme folder, relative to the project root (COMPOSE.themeDir). */
  themeDir?: string;
  /** The JDK and the Android SDK; found as motif doctor finds them when not given. */
  jdk?: { java: string; javaHome: string };
  sdk?: string;
  doctor?: DoctorDeps;
  /** Motif's home, for its font cache. */
  home?: string;
  fetch?: FetchLike;
  /** Where Robolectric keeps its Android libraries once downloaded (its first run downloads them). */
  robolectricCache?: string;
  /** Opens routes by a deep link only, as when no NavController is found (tests of that way). */
  deepLinks?: boolean;
  /** Failures planted in the audit's checks, and a Compose without the slot-table tag (tests of those ways). */
  faults?: HarnessConfig["faults"];
  slotTables?: false;
  /** Stands in for runHarness in tests. */
  run?: (run: HarnessRun) => Promise<HarnessResult>;
}

const toolchainText = (problems: string[]) =>
  `Motif draws a Compose app's screens with Gradle on this computer, which needs a JDK and the Android SDK. ${problems.join(" ")} Then run motif shot again.`;

/** Why motif shot can't draw this Compose app's screens on this computer: what's missing, in doctor's words, and what to do. */
export function composeShotRefusal(root: string, app: AppInfo, doctor: DoctorDeps): { error: string; text: string } | null {
  const problems: string[] = [];
  const jdk = gradleJava(doctor);
  if ("problem" in jdk) problems.push(jdk.problem);
  if (!findAndroidSdk(root, app, doctor)) problems.push(NO_ANDROID_SDK);
  if (problems.length > 0) return { error: "needs-android", text: toolchainText(problems) };
  const project = gradleRoot(resolve(root, app.path), root);
  if (!existsSync(join(project, "gradle", "wrapper", "gradle-wrapper.jar"))) {
    return {
      error: "needs-gradle-wrapper",
      text: "Motif runs the project's own Gradle wrapper (gradle/wrapper/gradle-wrapper.jar), and this project has none. Run gradle wrapper in its folder (Android Studio's projects have one), then run motif shot again.",
    };
  }
  return null;
}

/** A state's package below dev.motif.states: its name as a Kotlin name (sign-in → sign_in, 2fa → _2fa). */
export function statePackage(name: string): string {
  const id = name.replace(/-/g, "_").replace(/^(\d)/, "_$1");
  return RESERVED.kotlin.has(id) ? `${id}_` : id;
}

const packageOf = (text: string) => /^\s*package\s+([\w.]+)\s*;?\s*$/m.exec(maskComments(text, "kotlin"))?.[1] ?? null;

interface ComposeInputs {
  states: { name: string; pkg: string; content: string }[];
  setup: { file: StatesFile; content: string } | null;
}

/**
 * What motif shot is given for a Compose app, checked before anything is written: the --screen previews, the --state
 * files and design/states/Setup.kt (the app's own, else the project's). The first problem, if any.
 */
export function readComposeInputs(root: string, appDir: string, given: { screens: string[]; states: StateScript[] }): ComposeInputs | { error: string } {
  const screens = composeScreenProblem(appDir, given.screens);
  if (screens) return { error: screens };
  const states: ComposeInputs["states"] = [];
  for (const state of given.states) {
    const file = basename(state.file ?? state.name);
    if (!/\.kt$/i.test(file)) return { error: `--state: ${file} isn't a Kotlin file; a Jetpack Compose app's states are Kotlin files, like design/states/${state.name}.kt.` };
    const pkg = statePackage(state.name);
    if (packageOf(state.script) !== `dev.motif.states.${pkg}` || !/\bfun\s+motifState\s*\(/.test(maskComments(state.script, "kotlin"))) {
      return {
        error: `--state: ${file} must be in the package dev.motif.states.${pkg} and define ${STATE_SIGNATURE}, which Motif runs on each screen once it has settled. Add them, then run motif shot again.`,
      };
    }
    states.push({ name: state.name, pkg, content: state.script });
  }
  const found = statesFile(root, appDir, "Setup.kt");
  let setup: ComposeInputs["setup"] = null;
  if (found) {
    const content = readFileSync(found.file, "utf8");
    if (packageOf(content) !== "dev.motif.states" || !/\bfun\s+motifSetup\s*\(/.test(maskComments(content, "kotlin"))) {
      return { error: `${found.shown} must be in the package dev.motif.states and define ${SETUP_SIGNATURE}. Fix it, then run motif shot again.` };
    }
    setup = { file: found, content };
  }
  return { states, setup };
}

/** The Kotlin the harness calls for the run's setup and states (it finds this object by reflection). */
export function hooksSource(inputs: ComposeInputs): string {
  return [
    "// Written by Motif for one screenshot run, and deleted after it: the app's setup and states, which the harness calls.",
    "package dev.motif.shot",
    "",
    "import androidx.compose.ui.test.junit4.ComposeContentTestRule",
    "import java.util.Locale",
    "",
    "object MotifHooks {",
    "    fun setup(variant: String, locale: Locale, dark: Boolean) {",
    ...(inputs.setup ? ["        dev.motif.states.motifSetup(variant, locale, dark)"] : []),
    "    }",
    "",
    "    fun state(name: String, rule: ComposeContentTestRule) {",
    "        when (name) {",
    ...inputs.states.map((s) => `            ${JSON.stringify(s.name)} -> dev.motif.states.${s.pkg}.motifState(rule)`),
    '            else -> error("No state named $name.")',
    "        }",
    "    }",
    "}",
    "",
  ].join("\n");
}

/** Which of the app's build variants was drawn, when it has several (from the line the init script prints). */
export function variantNote(drawn: { name: string; of: string[] }): string {
  return `This app has ${drawn.of.length} build variants (${drawn.of.join(", ")}); Motif drew ${drawn.name}, the one Android Studio selects by default: the build type and flavours the build marks isDefault, else the test build type (debug unless testBuildType says otherwise) and each dimension's first flavour by name.`;
}

/** The guide's default variant id; "" without variants. */
function defaultVariant(root: string): string {
  const path = join(root, "design", "tokens.json");
  if (!existsSync(path)) return "";
  const { doc } = loadTokenDocument(path, readFileSync(path, "utf8"));
  return (doc && readVariants(doc).defaultId) || "";
}

interface ThemeInfo {
  pkg: string;
  variants: boolean;
  fonts: boolean;
  /** The Google Fonts families the theme downloads, which the screenshots load from Motif's cache. */
  google: string[];
}

/** The generated theme (MotifTheme.kt in the app's theme folder): its package and what the screenshots can set on it. */
function readTheme(root: string, themeDir: string): ThemeInfo | null {
  const file = join(root, themeDir, THEME_FILE);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const pkg = packageOf(text);
  if (pkg === null) return null;
  const google = [...new Set([...text.matchAll(/GoogleFont\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)].map((m) => JSON.parse(`"${m[1]}"`) as string))];
  return { pkg, variants: text.includes("debugVariantOverride"), fonts: text.includes("debugFontOverride"), google };
}

/** Android's density bucket for a scale: 2 is xhdpi. */
function density(scale: number): string {
  return scale >= 4 ? "xxxhdpi" : scale >= 3 ? "xxhdpi" : scale >= 2 ? "xhdpi" : scale >= 1.5 ? "hdpi" : "mdpi";
}

interface Target {
  /** A route (/settings) or a preview as given (HomePreview, or its full name). */
  key: string;
  route?: string;
  preview?: string;
  slug: string;
}

/** Every screenshot of a run, in the web's order: per screen, size, scheme, then variant, direction and state. */
export function planComposeShots(opts: NativeShotOptions, targets: Target[], theme: ThemeInfo | null, defaultId: string): ComposeShot[] {
  const shots: ComposeShot[] = [];
  for (const t of targets) {
    for (const v of opts.viewports) {
      for (const scheme of ["light", "dark"] as Scheme[]) {
        for (const variant of [undefined, ...opts.variants]) {
          for (const lang of [undefined, ...(opts.rtl ? [opts.rtl] : [])]) {
            for (const state of [undefined, ...opts.states.map((s) => s.name)]) {
              const size = v.file ?? v.name;
              const id = variant ?? defaultId;
              const checks = opts.audit ? auditChecks(v, scheme) : undefined;
              shots.push({
                file: shotName(state ? `${t.slug}@${state}` : t.slug, size, scheme, variant, Boolean(lang)),
                target: t.key,
                ...(t.route ? { route: t.route } : { preview: t.preview! }),
                width: v.width,
                height: v.height,
                density: density(v.scale),
                ...(v.mobile && v.width < 600 ? { insets: PHONE_INSETS } : {}),
                dark: scheme === "dark",
                locale: lang ?? "en_US",
                ...(lang ? { rtl: true } : {}),
                // The default's screenshots name the default too: an app that passes its own variant is drawn in the guide's default.
                ...(theme?.variants && id ? { variant: kotlinIdentifier(id) } : {}),
                ...(id ? { variantId: id } : {}),
                size,
                ...(state ? { state } : {}),
                ...(checks ? { checks } : {}),
                // The reduced-motion check looks at the screen with Remove animations on, as someone who turned it on sees it.
                ...(checks?.includes("motion") ? { reduceMotion: true } : {}),
              });
            }
          }
        }
      }
    }
  }
  return shots;
}

/** What each screen collected in result.json, as the harness wrote it. */
interface RawScreen {
  route: string;
  shots?: string[];
  errors?: string[];
  unreachable?: string;
  landedOn?: string;
  auditError?: string;
  /** How many failing texts the contrast check left out, as ATF found something may be drawn over them. */
  covered?: number;
}

/** What the harness found (MotifAudit.kt and its reduced-motion check), as a RawIssue with where it was seen. */
type RawComposeIssue = RawIssue & {
  route: string;
  file?: string;
  size: string;
  scheme: Scheme;
  variant?: string;
  state?: string;
  rtl?: boolean;
  /** Which of the screen's nodes with the same selector it is (1-based), and how many there are. */
  nth?: number;
  of?: number;
};

/** The run's result as RouteResults: drawn screens (200) with their errors, and those that couldn't be (0). */
export function mapComposeResult(
  targets: Target[],
  outDir: string,
  result: Record<string, unknown>,
  timedOut: { seconds: number } | null,
): { routes: RouteResult[]; issues: AuditIssue[]; notes: string[] } {
  const screens = (Array.isArray(result.screens) ? result.screens : []) as RawScreen[];
  const routes = targets.map((t): RouteResult => {
    const s = screens.find((x) => x.route === t.key);
    const shots = (s?.shots ?? []).map((f) => (isAbsolute(f) ? f : join(outDir, f)));
    const errors = s?.errors ?? [];
    const base = { route: t.key, url: t.key, shots, ...(s?.landedOn ? { landedOn: s.landedOn } : {}), ...(s?.auditError ? { auditError: s.auditError } : {}) };
    if (shots.length > 0) return { ...base, status: 200, ...(errors.length > 0 ? { pageErrors: errors } : {}) };
    const error =
      s?.unreachable ?? errors[0] ?? (timedOut ? `The run reached its time limit (${timedOut.seconds} s) before drawing it.` : "Gradle stopped before drawing it.");
    const rest = s?.unreachable ? errors : errors.slice(1);
    return { ...base, status: 0, error, ...(rest.length > 0 ? { pageErrors: rest } : {}) };
  });
  const slugOf = new Map(targets.map((t) => [t.key, t.slug]));
  const raw = (Array.isArray(result.issues) ? result.issues : []) as RawComposeIssue[];
  const issues = raw.map(({ rtl, file, nth, of, ...i }): AuditIssue => {
    const fix = COMPOSE_FIXES[i.rule];
    return {
      ...i,
      // Two unnamed buttons on one screen (a top bar's back and action) are two places, not one.
      ...(nth && of && of > 1 ? { selector: `${i.selector}[${nth}]` } : {}),
      viewport: i.size === "desktop" ? "desktop" : "mobile",
      shot: join(outDir, file ?? shotName(`${slugOf.get(i.route) ?? routeSlug(i.route)}${i.state ? `@${i.state}` : ""}`, i.size, i.scheme, i.variant, Boolean(rtl))),
      ...(rtl ? { rtl: true as const } : {}),
      ...(fix ? { fix } : {}),
    };
  });
  return { routes, issues, notes: [...(Array.isArray(result.notes) ? (result.notes as string[]) : []), ...screenNotes(screens)] };
}

/** The last lines Gradle printed, without blank ones. */
export function gradleTail(output: string, lines = 20): string {
  return output
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
    .slice(-lines)
    .join("\n");
}

/** Old ISO codes Android still names some folders by: values-iw is Hebrew. */
const OLD_CODES: Record<string, string> = { he: "iw", yi: "ji", id: "in" };

/** True when the module has strings for a language: res/values-<lang>, values-<lang>-r…, or values-b+<lang>. */
function offersLanguage(moduleDir: string, lang: string): boolean {
  let dirs: string[];
  try {
    dirs = readdirSync(join(moduleDir, "src", "main", "res"));
  } catch {
    return false;
  }
  const codes = [lang, ...(OLD_CODES[lang] ? [OLD_CODES[lang]!] : [])];
  return dirs.some((d) => codes.some((c) => new RegExp(`^values-(?:${c}(?:-|$)|b\\+${c}(?:\\+|$))`, "i").test(d)));
}

/** "java.lang.IllegalStateException: Firebase isn't configured" without the packages. */
const shortException = (text: string) => text.replace(/\b(?:[a-z_$][\w$]*\.)+([A-Z][\w$]*)/g, "$1");

/** Why the app's Application couldn't start (a_shots' failure in Gradle's test report), or null when it isn't there. */
function applicationFailure(moduleDir: string): string | null {
  const report = harnessReport(moduleDir);
  let xml: string;
  try {
    if (!report) return null;
    xml = readFileSync(report, "utf8");
  } catch {
    return null;
  }
  // The first screen's a_shots ("a_shots[0]"): each screen's fails the same way.
  const message = /<testcase\s+name="a_shots[^"]*"[^>]*>\s*<failure\s+message="([^"]*)"/.exec(xml)?.[1];
  if (!message) return null;
  const text = message
    .replace(/&#10;|&#13;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return shortException(text).slice(0, 300);
}

function plainApplicationNote(moduleDir: string, startedOnce: boolean): string {
  const why = applicationFailure(moduleDir);
  if (startedOnce) {
    return (
      `The app's Application class started for the first screen, then failed when Robolectric started it again for the next one${why ? ` (${why})` : ""}, ` +
      "so Motif drew the later screens with a plain Application in its place. Robolectric starts the Application once for each screen, in the same JVM, where what it started before is still started. " +
      "Motif stops Koin between screens; anything else the Application starts once for the whole app (WorkManager.initialize, say) needs a check that it hasn't started already."
    );
  }
  return (
    `The app's Application class couldn't start in a test${why ? ` (${why})` : ""}, so Motif drew the screens with a plain Application in its place: ` +
    "previews are drawn as they are, and screens that need what it sets up may not start. " +
    'To draw those, let it start under Robolectric (Build.FINGERPRINT is "robolectric" there), or set up what it needs in design/states/Setup.kt.'
  );
}

/** The run's screens: the routes, then the previews (by their JVM names), each with its file name's slug. */
function targetsOf(opts: NativeShotOptions, moduleDir: string): Target[] {
  const used = new Set<string>();
  const unique = (slug: string) => {
    let s = slug;
    for (let n = 2; used.has(s); n++) s = `${slug}-${n}`;
    used.add(s);
    return s;
  };
  const targets: Target[] = opts.routes.map((route) => ({ key: route, route, slug: unique(routeSlug(route)) }));
  if (opts.screens.length === 0) return targets;
  const { previews } = discoverComposeScreens(moduleDir);
  for (const name of opts.screens) {
    const p: Preview | undefined = previews.find((x) => x.fqn === name) ?? previews.find((x) => x.name === name);
    if (!p) throw new Error(`--screen ${name} isn't a @Preview function Motif found in this app.`);
    targets.push({ key: name, preview: p.fqn, slug: unique(previewSlug(p.name)) });
  }
  return targets;
}

/** COMPOSE.shoot: writes the harness, runs Gradle, reads what it drew, and always removes the harness. */
export async function shootCompose(opts: NativeShotOptions, deps: ComposeShotDeps = {}): Promise<{ routes: RouteResult[]; issues: AuditIssue[]; notes: string[] }> {
  const root = resolve(opts.root);
  const moduleDir = resolve(root, opts.app.path);
  const inputs = readComposeInputs(root, moduleDir, opts);
  if ("error" in inputs) throw new Error(inputs.error);

  let jdk = deps.jdk;
  let sdk = deps.sdk;
  if (!jdk || !sdk) {
    const doctor = deps.doctor ?? opts.doctor ?? (await import("../../commands/doctor")).defaultDoctorDeps();
    if (!jdk) {
      const found = gradleJava(doctor);
      if ("problem" in found) throw new Error(toolchainText([found.problem]));
      jdk = found;
    }
    sdk ??= findAndroidSdk(root, opts.app, doctor) ?? undefined;
  }

  const notes: string[] = [];
  const cache = deps.robolectricCache ?? join(homedir(), ".m2", "repository", "org", "robolectric", "android-all-instrumented");
  if (!existsSync(cache)) {
    opts.progress?.(COMPOSE_FIRST_RUN);
    notes.push(COMPOSE_FIRST_RUN);
  }
  if (inputs.setup?.file.own) notes.push(`This app used its own ${inputs.setup.file.shown}${existsSync(join(root, "design/states/Setup.kt")) ? ", not the project's design/states/Setup.kt" : ""}.`);

  const themeDir = deps.themeDir ?? composeThemeDir(root, opts.app);
  const theme = readTheme(root, themeDir);
  if (!theme && existsSync(join(root, "design", "tokens.json"))) {
    notes.push(
      "This app doesn't have Motif's theme code yet (run motif tokens), so the screenshots show its own theme, and fonts it downloads from Google Fonts are drawn in Roboto: they can't download in a test.",
    );
  }
  const fonts: ComposeFont[] = [];
  if (theme?.fonts) {
    const home = deps.home ?? motifHome();
    for (const family of theme.google) {
      const got = await composeFont(family, home, deps.fetch ? { fetch: deps.fetch } : {});
      if (got.font) fonts.push(got.font);
      notes.push(...got.notes);
    }
  }

  const unread = unreadModulesNote(root, opts.app.path, "their previews can't be taken with --screen, and routes declared there are found only when you give them with --routes.");
  if (unread) notes.push(unread);

  const targets = targetsOf(opts, moduleDir);
  const defaultId = defaultVariant(root);
  const shots = planComposeShots(opts, targets, theme, defaultId);
  if (opts.rtl && !offersLanguage(moduleDir, opts.rtl)) {
    notes.push(`This app doesn't offer ${opts.rtl} (it has no res/values-${opts.rtl} folder), so its RTL screenshots show its default strings, laid out right to left.`);
  }

  const sources: HarnessSource[] = [
    { path: `${HARNESS_SRC}/dev/motif/shot/MotifHooks.kt`, content: hooksSource(inputs) },
    ...(inputs.setup ? [{ path: `${HARNESS_SRC}/dev/motif/states/Setup.kt`, content: inputs.setup.content }] : []),
    ...inputs.states.map((s) => ({ path: `${HARNESS_SRC}/dev/motif/states/${s.pkg}/MotifState.kt`, content: s.content })),
  ];
  const run = deps.run ?? runHarness;
  const result = await run({
    projectDir: gradleRoot(moduleDir, root),
    moduleDir,
    java: jdk.java,
    javaHome: jdk.javaHome,
    ...(sdk ? { sdk } : {}),
    config: {
      outDir: opts.outDir,
      shots,
      ...(fonts.length > 0 ? { fonts } : {}),
      ...(theme?.variants ? { variantClass: `${theme.pkg}.MotifTheme`, variantEnum: `${theme.pkg}.MotifVariant` } : {}),
      ...(theme?.fonts ? { fontsClass: `${theme.pkg}.MotifFonts` } : {}),
      ...(deps.deepLinks ? { deepLinks: true } : {}),
      ...(deps.faults ? { faults: deps.faults } : {}),
      ...(deps.slotTables === false ? { slotTables: false } : {}),
      ...(process.env.MOTIF_DEBUG ? { debug: true } : {}),
      // The default's issues name no variant, as on the other stacks.
      ...(defaultId ? { defaultVariant: defaultId } : {}),
      // Findings name the app's own composable around what they're about: one from these files.
      ...(opts.audit ? { appFiles: [...new Set(listKotlinFiles(moduleDir, ".").map((f) => basename(f.path)))].sort() } : {}),
      settleMs: SETTLE_MS,
      stateMs: STATE_MS,
    },
    sources,
    timeoutMs: opts.timeoutMs,
  });

  const seconds = Math.round(opts.timeoutMs / 1000);
  if (!result.result) {
    if (!result.timedOut && (ROBOLECTRIC_DOWNLOAD_FAILED.test(result.output) || OFFLINE.test(result.output))) {
      // The line that said so, since a dependency that doesn't exist online fails the same way.
      const said = result.output.split(/\r?\n/).find((l) => ROBOLECTRIC_DOWNLOAD_FAILED.test(l) || OFFLINE.test(l))?.trim();
      throw new Error(said ? `${COMPOSE_OFFLINE} (Gradle said: ${said})` : COMPOSE_OFFLINE);
    }
    const tooNew = !result.timedOut ? JDK_TOO_NEW.exec(result.output) : null;
    if (tooNew) throw new Error(jdkTooNewText(Number(tooNew[1]), jdk.javaHome));
    const noSource = !result.timedOut ? NO_SOURCE.exec(result.output)?.[1] : undefined;
    const why =
      result.problem ??
      (result.timedOut ? `Gradle didn't finish within ${seconds} s.` : noSource ? noSourceText(noSource) : "Gradle stopped before drawing any screen.");
    const tail = gradleTail(result.output);
    throw new Error(tail ? `${why} The last lines it printed:\n${tail}` : why);
  }
  const mapped = mapComposeResult(targets, opts.outDir, result.result, result.timedOut ? { seconds } : null);
  if (result.result.plainApplication === true) notes.push(plainApplicationNote(moduleDir, result.result.applicationStarted === true));
  // From result.json, which the harness fills from the init script's choice; the line the script prints is the fallback.
  const v = result.result.variant as { name?: unknown; of?: unknown } | undefined;
  const drawn =
    typeof v?.name === "string" && Array.isArray(v.of) && v.of.every((n) => typeof n === "string")
      ? { name: v.name, of: v.of as string[] }
      : variantDrawn(result.output);
  if (drawn) notes.push(variantNote(drawn));
  return { ...mapped, notes: [...notes, ...mapped.notes] };
}

/** Whether readComposeInputs finds a problem with what shoot is given, for runShot's checks before anything is written. */
export function composeInputsProblem(root: string, app: AppInfo, given: { screens: string[]; states: StateScript[] }): string | null {
  const read = readComposeInputs(resolve(root), resolve(root, app.path), given);
  return "error" in read ? read.error : null;
}

/** The phone size the reduced-motion check runs at, for the note when --sizes leaves it out. */
export const COMPOSE_MOTION = { width: MOTION_WIDTH, text: `the ${MOTION_WIDTH} dp phone size` };
