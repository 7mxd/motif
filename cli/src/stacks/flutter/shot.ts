// motif shot for a Flutter app (decision 0007): the screens drawn by flutter test through Motif's harness, at every
// size, light and dark, in every design variant, and right to left, after an optional setup script, with the app's
// HTTP requests answered from fixtures.
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { loadTokenDocument } from "../../contract/load";
import { readVariants } from "../../contract/variants";
import type { AppInfo } from "../../detect/stacks";
import type { AuditIssue, RawIssue } from "../../shot/audit";
import { routeSlug, shotName, type RouteResult, type Scheme, type StateScript, type Viewport } from "../../shot/capture";
import { prefixPath } from "../../project/apps";
import { andList, stripBom } from "../../text";
import type { NativeShotOptions } from "../native";
import { dartIdentifier } from "../naming";
import { googleFamilies, resolvedPackages, type ResolvedPackage } from "./google";
import { flutterSdk, flutterTail, runHarness, type AuditCheck, type FetchLike, type FlutterShot, type HarnessResult, type HarnessRun } from "./harness";
import { hooksSource, mainFile } from "./hooks";
import { iconName, sdkIconNames } from "./icons";
import { findScreen, HTTP_FILE, readHttpFixtures, readSetup, readState, screenSlug, statesFile, type HttpRoute, type StatesFile } from "./inputs";
import { dependsOn, importFor, packageName } from "./project";
import { libDartFiles } from "./routes";
import { FLUTTER_INSTALL } from "./doctor";

/** How Motif sets a design variant on a Flutter app, for the note when a variant looks exactly like the default. */
export const FLUTTER_VARIANT_HOW = "MotifTheme, or design/states/setup.dart for an app that switches its own palette";

/** The time limit of a run (decision 0007): long enough for a large app's first compile, and for slow screens. */
export const flutterTimeLimit = (shots: number) => 240_000 + 3_000 * shots;

/** Plugins whose platform channels the harness answers, by package, with the channel names it knows them by. */
const STUBS: [string, string[]][] = [
  ["flutter_secure_storage", ["flutter_secure_storage"]],
  ["path_provider", ["path_provider"]],
  ["package_info_plus", ["package_info"]],
  ["connectivity_plus", ["connectivity", "connectivity_status"]],
  ["url_launcher", ["url_launcher"]],
];

export interface FlutterShotDeps {
  /** The app's theme folder, relative to the project root (FLUTTER.themeDir). */
  themeDir: string;
  /** The Dart code of the packages the app takes from folders in the project. */
  sharedCode?: () => string[];
  flutter?: string;
  home?: string;
  fetch?: FetchLike;
  /** Stands in for runHarness in tests. */
  run?: (run: HarnessRun) => Promise<HarnessResult>;
  /** Replaces [flutter, "test"] in tests. */
  command?: string[];
}

/** Why motif shot can't draw this Flutter app's screens yet: what's missing, and what to do. */
export function flutterShotRefusal(appDir: string, appPath: string, flutter: string | null): { error: string; text: string } | null {
  const pubspec = prefixPath(appPath, "pubspec.yaml");
  if (!flutter) {
    return { error: "needs-flutter", text: `Flutter isn't installed, so Motif can't draw this app's screens: ${FLUTTER_INSTALL}. Then run motif shot again.` };
  }
  if (!dependsOn(appDir, "flutter_test")) {
    return {
      error: "needs-flutter-test",
      text: `Motif draws the screens with flutter test, which needs flutter_test in the dev_dependencies of ${pubspec}. Add these lines to it, run flutter pub get, then run motif shot again:\ndev_dependencies:\n  flutter_test:\n    sdk: flutter`,
    };
  }
  if (dependsOn(appDir, "google_fonts") && !resolvedPackages(appDir)) {
    return {
      error: "needs-pub-get",
      text: `Run flutter pub get in ${appPath === "." ? "the app's folder" : appPath} first: Motif reads which fonts google_fonts has from the packages it resolved. Then run motif shot again.`,
    };
  }
  return null;
}

/** The guide's default variant id, which a setup script is told for the default screenshots; "" without variants. */
function defaultVariant(root: string): string {
  const path = join(root, "design", "tokens.json");
  if (!existsSync(path)) return "";
  const { doc } = loadTokenDocument(path, readFileSync(path, "utf8"));
  return (doc && readVariants(doc).defaultId) || "";
}

const uses = (appDir: string, packages: Map<string, ResolvedPackage> | null, pkg: string) => dependsOn(appDir, pkg) || Boolean(packages?.has(pkg));

/** What each screen collected in result.json, as the harness wrote it. */
interface RawScreen {
  route: string;
  shots?: string[];
  errors?: string[];
  unreachable?: string;
  landedOn?: string;
  unanswered?: string[];
  blankImages?: string[];
  missingFonts?: string[];
  /** Fallback families (fontFamilyFallback) asked for by text beyond Latin that Motif didn't load. */
  missingFallbacks?: string[];
  texts?: string[];
  /** How many failing texts the contrast check left out: something is drawn over them, or they're over an image the screenshot doesn't show. */
  covered?: number;
  overImages?: number;
  /** Why the audit couldn't finish on this screen. */
  auditError?: string;
}

/** What the harness found, as a RawIssue with where it was seen: its screen, its screenshot's file and look. */
type RawFlutterIssue = RawIssue & { route: string; file?: string; size: string; scheme: Scheme; variant?: string; state?: string; rtl?: boolean; iconFont?: string };

/** What to do about each problem in a Flutter app, in its own terms (the web's fixes name CSS and ARIA). */
export const FLUTTER_FIXES: Partial<Record<RawIssue["rule"], string>> = {
  "target-mobile": "Give it at least 44×44 px: padding, a SizedBox or a minimumSize in its style (Material's tap target size, 48, is the default).",
  motion: "Stop this animation, or keep it still, when MediaQuery.disableAnimationsOf(context) is true (the system's reduce motion setting); MotifMotion.duration(context, …) is zero then.",
  name: "Give it a name a screen reader can say: a tooltip (IconButton takes one), a visible label, or Semantics(label: …).",
};

interface Target {
  /** A route ("/home") or a widget's class name. */
  key: string;
  route?: string;
  screen?: string;
  slug: string;
}

/** The phone size the reduced-motion check runs at. */
export const MOTION_WIDTH = 390;

/**
 * The audit's checks on one screenshot, as on the web: contrast and names everywhere; tap targets on phones and tablets,
 * in light (they're the same in dark); reduced motion in light at the 390 phone size, once for each variant, direction and state.
 */
export function auditChecks(v: Viewport, scheme: Scheme): AuditCheck[] {
  const light = scheme === "light";
  return ["contrast", "names", ...(light && v.mobile ? (["targets"] as const) : []), ...(light && v.mobile && v.width === MOTION_WIDTH ? (["motion"] as const) : [])];
}

/** Every screenshot of a run, in the web's order: per screen, size, scheme, then variant, direction and state. */
export function planShots(opts: NativeShotOptions, targets: Target[]): FlutterShot[] {
  const shots: FlutterShot[] = [];
  for (const t of targets) {
    for (const v of opts.viewports) {
      for (const scheme of ["light", "dark"] as Scheme[]) {
        for (const variant of [undefined, ...opts.variants]) {
          for (const lang of [undefined, ...(opts.rtl ? [opts.rtl] : [])]) {
            for (const state of [undefined, ...opts.states.map((s) => s.name)]) {
              const phone = v.mobile && v.width < 600;
              const size = v.file ?? v.name;
              shots.push({
                file: shotName(state ? `${t.slug}@${state}` : t.slug, size, scheme, variant, Boolean(lang)),
                target: t.key,
                ...(t.route ? { route: t.route } : { screen: t.screen }),
                width: v.width,
                height: v.height,
                dpr: v.scale,
                // An iPhone's status bar and home indicator, in logical pixels.
                ...(phone ? { safeTop: 47, safeBottom: 34 } : {}),
                dark: scheme === "dark",
                locale: lang ?? "en_US",
                ...(lang ? { rtl: true } : {}),
                ...(variant ? { variant: dartIdentifier(variant), variantId: variant } : {}),
                size,
                ...(state ? { state } : {}),
                ...(opts.audit ? { checks: auditChecks(v, scheme) } : {}),
              });
            }
          }
        }
      }
    }
  }
  return shots;
}

/** google_fonts' Family_700 is the family Onest's weight 700: notes name the family. */
const familyName = (f: string) => f.replace(/_(regular|italic|[1-9]00(italic)?)$/, "");

/**
 * Notes from what the screens collected: requests nothing answered, images drawn blank, fonts and fallback fonts drawn
 * as boxes. httpFile is the http.json the run read (the app's own in a monorepo).
 */
export function screenNotes(screens: RawScreen[], httpFile = HTTP_FILE): string[] {
  const notes: string[] = [];
  const texts = (n: number) => (n === 1 ? "1 text" : `${n} texts`);
  for (const s of screens) {
    // A screen the contrast check couldn't fully judge says so, so nobody takes it as clean.
    const skipped = [
      ...(s.covered ? [`${texts(s.covered)} something is drawn over (a floating bar, a dialog's barrier)`] : []),
      ...(s.overImages ? [`${texts(s.overImages)} over an image the screenshot doesn't show`] : []),
    ];
    if (skipped.length) notes.push(`Contrast on ${s.route} wasn't judged for ${andList(skipped)}: check them by eye.`);
    if (s.unanswered?.length) notes.push(`Requests nothing answered on ${s.route}: ${s.unanswered.join(", ")}. Add them to ${httpFile}.`);
    if (s.blankImages?.length) notes.push(`Images nothing answered on ${s.route} were drawn blank: ${s.blankImages.join(", ")}. Add them to ${httpFile} to show them.`);
  }
  const fonts = new Map<string, string[]>();
  for (const s of screens) {
    for (const f of new Set((s.missingFonts ?? []).map(familyName))) fonts.set(f, [...(fonts.get(f) ?? []), s.route]);
  }
  for (const [family, routes] of fonts) {
    notes.push(`Text in ${family} on ${andList(routes)} is drawn as boxes: Motif couldn't load that font (bundle it in pubspec.yaml, or see the font notes).`);
  }
  // A fallback the text needs (Arabic in a Latin font falls back to the Arabic companion): its letters are boxes too.
  const fallbacks = new Map<string, string[]>();
  for (const s of screens) {
    for (const f of new Set((s.missingFallbacks ?? []).map(familyName))) fallbacks.set(f, [...(fallbacks.get(f) ?? []), s.route]);
  }
  for (const [family, routes] of fallbacks) {
    notes.push(
      `Text on ${andList(routes)} needs the fallback font ${family} for letters its main font lacks (Arabic, say), but Motif couldn't load it, so those letters are drawn as boxes (bundle it in pubspec.yaml, or see the font notes).`,
    );
  }
  return notes;
}

/** The run's result as RouteResults: rendered screens (200) with their errors, and those that couldn't be (0). */
export function mapResult(
  targets: Target[],
  outDir: string,
  result: Record<string, unknown>,
  timedOut: { seconds: number } | null,
  /** Flutter's icons by font and code point (sdkIconNames), read only when an issue is about an icon. */
  iconNames?: () => Map<string, string>,
  httpFile = HTTP_FILE,
): { routes: RouteResult[]; issues: AuditIssue[]; notes: string[] } {
  const screens = (Array.isArray(result.screens) ? result.screens : []) as RawScreen[];
  const routes = targets.map((t): RouteResult => {
    const s = screens.find((x) => x.route === t.key);
    const shots = (s?.shots ?? []).map((f) => (isAbsolute(f) ? f : join(outDir, f)));
    const errors = s?.errors ?? [];
    const base = { route: t.key, url: t.key, shots, ...(s?.landedOn ? { landedOn: s.landedOn } : {}), ...(s?.auditError ? { auditError: s.auditError } : {}) };
    if (shots.length > 0) return { ...base, status: 200, ...(errors.length > 0 ? { pageErrors: errors } : {}) };
    const error =
      s?.unreachable ??
      errors[0] ??
      (timedOut ? `The run reached its time limit (${timedOut.seconds} s) before drawing it.` : "Flutter stopped before drawing it.");
    const rest = s?.unreachable ? errors : errors.slice(1);
    return { ...base, status: 0, error, ...(rest.length > 0 ? { pageErrors: rest } : {}) };
  });
  const raw = (Array.isArray(result.issues) ? result.issues : []) as RawFlutterIssue[];
  const slugOf = new Map(targets.map((t) => [t.key, t.slug]));
  let names: Map<string, string> | undefined;
  const issues = raw.map(({ rtl, file, iconFont, ...i }): AuditIssue => {
    const fix = FLUTTER_FIXES[i.rule];
    // An icon of Flutter's own is named (Icons.star); any other keeps its code point (U+F01D4).
    const name = i.kind === "icon" && i.icon && iconNames ? iconName((names ??= iconNames()), i.icon, iconFont) : undefined;
    return {
      ...i,
      ...(name ? { icon: name, selector: i.selector.replace(`(${i.icon})`, `(${name})`) } : {}),
      viewport: i.size === "desktop" ? "desktop" : "mobile",
      shot: join(outDir, file ?? shotName(`${slugOf.get(i.route) ?? routeSlug(i.route)}${i.state ? `@${i.state}` : ""}`, i.size, i.scheme, i.variant, Boolean(rtl))),
      ...(rtl ? { rtl: true as const } : {}),
      ...(fix ? { fix } : {}),
    };
  });
  const notes = [...(Array.isArray(result.notes) ? (result.notes as string[]) : []), ...screenNotes(screens, httpFile)];
  return { routes, issues, notes };
}

/** Which design/states files a monorepo's app used: its own, which take the place of the project's. */
function ownFilesNote(root: string, files: (StatesFile | null | undefined)[]): string[] {
  const own = files.filter((f): f is StatesFile => Boolean(f?.own));
  if (own.length === 0) return [];
  const shared = own.map((f) => `design/states/${basename(f.file)}`).filter((f) => existsSync(join(root, f)));
  return [`This app used its own ${andList(own.map((f) => f.shown))}${shared.length > 0 ? `, not the project's ${andList(shared)}` : ""}.`];
}

interface ShotInputs {
  pkg: string;
  screens: { name: string; import: string }[];
  states: { name: string; import: string }[];
  setup: { import: string; file: StatesFile } | null;
  http: HttpRoute[];
  /** The http.json the run reads, if any. */
  httpFile: StatesFile | null;
}

/**
 * What motif shot is given for a Flutter app, read and checked before anything is written: the app's package name, the
 * --screen widgets, the --state scripts, design/states/setup.dart and design/states/http.json. The first problem, if any.
 */
export function readShotInputs(root: string, appDir: string, given: { screens: string[]; states: StateScript[] }): ShotInputs | { error: string } {
  const pkg = packageName(appDir);
  if (!pkg) return { error: `There's no package name in ${join(appDir, "pubspec.yaml")}, so Motif can't import the app. Add a name: line to it.` };
  const screens: ShotInputs["screens"] = [];
  for (const name of given.screens) {
    const found = findScreen(appDir, pkg, name);
    if ("error" in found) return found;
    screens.push({ name, import: found.import });
  }
  const states: ShotInputs["states"] = [];
  for (const state of given.states) {
    const found = readState(appDir, state);
    if ("error" in found) return found;
    states.push(found);
  }
  const setup = readSetup(root, appDir);
  if (setup && "error" in setup) return setup;
  const http = readHttpFixtures(root, appDir);
  if ("error" in http) return http;
  return { pkg, screens, states, setup, http, httpFile: statesFile(root, appDir, "http.json") };
}

/** FLUTTER.shoot: writes the harness, runs flutter test, reads what it drew, and always removes the harness. */
export async function shootFlutter(opts: NativeShotOptions, deps: FlutterShotDeps): Promise<{ routes: RouteResult[]; issues: AuditIssue[]; notes: string[] }> {
  const root = resolve(opts.root);
  const appDir = resolve(root, opts.app.path);
  const inputs = readShotInputs(root, appDir, opts);
  if ("error" in inputs) throw new Error(inputs.error);
  const { pkg, screens, states, setup, http, httpFile } = inputs;
  const packages = resolvedPackages(appDir);

  const used = new Set<string>();
  const targets: Target[] = opts.routes.map((route) => {
    let slug = routeSlug(route);
    for (let n = 2; used.has(slug); n++) slug = `${routeSlug(route)}-${n}`;
    used.add(slug);
    return { key: route, route, slug };
  });
  for (const { name } of screens) {
    let slug = screenSlug(name);
    for (let n = 2; used.has(slug); n++) slug = `${screenSlug(name)}-${n}`;
    used.add(slug);
    targets.push({ key: name, screen: name, slug });
  }

  // The generated theme switches variants through MotifTheme.debugVariantOverride, when it has variants.
  const themeFile = join(root, deps.themeDir, "motif_theme.dart");
  const theme = existsSync(themeFile) && readFileSync(themeFile, "utf8").includes("debugVariantOverride") ? importFor(root, themeFile) : null;
  const hooks = hooksSource({
    main: `package:${pkg}/${mainFile(appDir)}`,
    goRouter: uses(appDir, packages, "go_router"),
    googleFonts: uses(appDir, packages, "google_fonts"),
    sharedPreferences: uses(appDir, packages, "shared_preferences"),
    ...(theme ? { theme } : {}),
    ...(setup ? { setup: setup.import } : {}),
    screens,
    states,
  });

  const code = [...libDartFiles(appDir).map((f) => readFileSync(f, "utf8")), ...(deps.sharedCode?.() ?? [])];
  const pubspec = stripBom(readFileSync(join(appDir, "pubspec.yaml"), "utf8"));
  const [version = "1.0.0", build = "1"] = (/^version:\s*["']?([^\s"'#]+)/m.exec(pubspec)?.[1] ?? "").split("+");
  const connectivity = packages?.get("connectivity_plus")?.version;
  const shots = planShots(opts, targets);
  const run = deps.run ?? runHarness;
  const result = await run({
    appDir,
    outDir: opts.outDir,
    shots,
    googleFonts: googleFamilies(root, packages, code),
    timeoutMs: opts.timeoutMs,
    hooks,
    config: {
      debug: Boolean(process.env.MOTIF_DEBUG),
      defaultVariant: defaultVariant(root),
      plugins: STUBS.filter(([p]) => uses(appDir, packages, p)).flatMap(([, keys]) => keys),
      packageInfo: { appName: pkg, packageName: pkg, version, buildNumber: build, buildSignature: "", installerStore: null },
      connectivityList: !connectivity || Number(connectivity.split(".")[0]) >= 6,
      http,
      ...(setup ? { setupFile: setup.file.shown } : {}),
    },
    ...(deps.flutter ? { flutter: deps.flutter } : {}),
    ...(deps.home ? { home: deps.home } : {}),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.command ? { command: deps.command } : {}),
  });

  if (!result.result) {
    const why = result.problem ?? (result.timedOut ? `flutter test didn't finish within ${Math.round(opts.timeoutMs / 1000)} s.` : "flutter test stopped before drawing any screen.");
    const tail = flutterTail(result.output);
    throw new Error(tail ? `${why} The last lines it printed:\n${tail}` : why);
  }
  const flutter = deps.flutter ?? Bun.which("flutter");
  const mapped = mapResult(
    targets,
    opts.outDir,
    result.result,
    result.timedOut ? { seconds: Math.round(opts.timeoutMs / 1000) } : null,
    flutter ? () => sdkIconNames(flutterSdk(flutter)) : undefined,
    httpFile?.shown,
  );
  return { ...mapped, notes: [...ownFilesNote(root, [setup?.file, httpFile]), ...result.notes, ...mapped.notes] };
}
