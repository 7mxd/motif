// motif shot for a Flutter app (decision 0007): the screens drawn by flutter test through Motif's harness, at every
// size, light and dark, in every design variant, and right to left, after an optional setup script, with the app's
// HTTP requests answered from fixtures.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadTokenDocument } from "../../contract/load";
import { readVariants } from "../../contract/variants";
import type { AppInfo } from "../../detect/stacks";
import type { AuditIssue, RawIssue } from "../../shot/audit";
import { routeSlug, shotName, type RouteResult, type Scheme } from "../../shot/capture";
import { prefixPath } from "../../project/apps";
import { andList, stripBom } from "../../text";
import type { NativeShotOptions } from "../native";
import { dartIdentifier } from "../naming";
import { googleFamilies, resolvedPackages, type ResolvedPackage } from "./google";
import { flutterTail, runHarness, type FetchLike, type FlutterShot, type HarnessResult, type HarnessRun } from "./harness";
import { hooksSource, mainFile } from "./hooks";
import { findScreen, HTTP_FILE, readHttpFixtures, readSetup, screenSlug } from "./inputs";
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
  texts?: string[];
}

interface Target {
  /** A route ("/home") or a widget's class name. */
  key: string;
  route?: string;
  screen?: string;
  slug: string;
}

/** Every screenshot of a run, in the web's order: per screen, size, scheme, then variant and direction. */
export function planShots(opts: NativeShotOptions, targets: Target[]): FlutterShot[] {
  const shots: FlutterShot[] = [];
  for (const t of targets) {
    for (const v of opts.viewports) {
      for (const scheme of ["light", "dark"] as Scheme[]) {
        for (const variant of [undefined, ...opts.variants]) {
          for (const lang of [undefined, ...(opts.rtl ? [opts.rtl] : [])]) {
            const phone = v.mobile && v.width < 600;
            shots.push({
              file: shotName(t.slug, v.file ?? v.name, scheme, variant, Boolean(lang)),
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
            });
          }
        }
      }
    }
  }
  return shots;
}

/** google_fonts' Family_700 is the family Onest's weight 700: notes name the family. */
const familyName = (f: string) => f.replace(/_(regular|italic|[1-9]00(italic)?)$/, "");

/** Notes from what the screens collected: requests nothing answered, images drawn blank, fonts drawn as boxes. */
export function screenNotes(screens: RawScreen[]): string[] {
  const notes: string[] = [];
  for (const s of screens) {
    if (s.unanswered?.length) notes.push(`Requests nothing answered on ${s.route}: ${s.unanswered.join(", ")}. Add them to ${HTTP_FILE}.`);
    if (s.blankImages?.length) notes.push(`Images nothing answered on ${s.route} were drawn blank: ${s.blankImages.join(", ")}. Add them to ${HTTP_FILE} to show them.`);
  }
  const fonts = new Map<string, string[]>();
  for (const s of screens) {
    for (const f of new Set((s.missingFonts ?? []).map(familyName))) fonts.set(f, [...(fonts.get(f) ?? []), s.route]);
  }
  for (const [family, routes] of fonts) {
    notes.push(`Text in ${family} on ${andList(routes)} is drawn as boxes: Motif couldn't load that font (bundle it in pubspec.yaml, or see the font notes).`);
  }
  return notes;
}

/** The run's result as RouteResults: rendered screens (200) with their errors, and those that couldn't be (0). */
export function mapResult(
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
    const base = { route: t.key, url: t.key, shots, ...(s?.landedOn ? { landedOn: s.landedOn } : {}) };
    if (shots.length > 0) return { ...base, status: 200, ...(errors.length > 0 ? { pageErrors: errors } : {}) };
    const error =
      s?.unreachable ??
      errors[0] ??
      (timedOut ? `The run reached its time limit (${timedOut.seconds} s) before drawing it.` : "Flutter stopped before drawing it.");
    const rest = s?.unreachable ? errors : errors.slice(1);
    return { ...base, status: 0, error, ...(rest.length > 0 ? { pageErrors: rest } : {}) };
  });
  const raw = (Array.isArray(result.issues) ? result.issues : []) as (RawIssue & { route: string; size: string; scheme: Scheme; variant?: string; state?: string; rtl?: boolean })[];
  const slugOf = new Map(targets.map((t) => [t.key, t.slug]));
  const issues = raw.map(({ rtl, ...i }): AuditIssue => ({
    ...i,
    viewport: i.size === "desktop" ? "desktop" : "mobile",
    shot: join(outDir, shotName(`${slugOf.get(i.route) ?? routeSlug(i.route)}${i.state ? `@${i.state}` : ""}`, i.size, i.scheme, i.variant, Boolean(rtl))),
    ...(rtl ? { rtl: true as const } : {}),
  }));
  const notes = [...(Array.isArray(result.notes) ? (result.notes as string[]) : []), ...screenNotes(screens)];
  return { routes, issues, notes };
}

/** FLUTTER.shoot: writes the harness, runs flutter test, reads what it drew, and always removes the harness. */
export async function shootFlutter(opts: NativeShotOptions, deps: FlutterShotDeps): Promise<{ routes: RouteResult[]; issues: AuditIssue[]; notes: string[] }> {
  const root = resolve(opts.root);
  const appDir = resolve(root, opts.app.path);
  const pkg = packageName(appDir);
  if (!pkg) throw new Error(`There's no package name in ${join(appDir, "pubspec.yaml")}, so Motif can't import the app.`);
  const packages = resolvedPackages(appDir);

  const used = new Set<string>();
  const targets: Target[] = opts.routes.map((route) => {
    let slug = routeSlug(route);
    for (let n = 2; used.has(slug); n++) slug = `${routeSlug(route)}-${n}`;
    used.add(slug);
    return { key: route, route, slug };
  });
  const screens: { name: string; import: string }[] = [];
  for (const name of opts.screens) {
    const found = findScreen(appDir, pkg, name);
    if ("error" in found) throw new Error(found.error);
    screens.push({ name, import: found.import });
    let slug = screenSlug(name);
    for (let n = 2; used.has(slug); n++) slug = `${screenSlug(name)}-${n}`;
    used.add(slug);
    targets.push({ key: name, screen: name, slug });
  }

  const setup = readSetup(root, appDir);
  if (setup && typeof setup === "object") throw new Error(setup.error);
  const http = readHttpFixtures(root);
  if ("error" in http) throw new Error(http.error);

  // The generated theme switches variants through MotifTheme.debugVariantOverride, when it has variants.
  const themeFile = join(root, deps.themeDir, "motif_theme.dart");
  const theme = existsSync(themeFile) && readFileSync(themeFile, "utf8").includes("debugVariantOverride") ? importFor(root, themeFile) : null;
  const hooks = hooksSource({
    main: `package:${pkg}/${mainFile(appDir)}`,
    goRouter: uses(appDir, packages, "go_router"),
    googleFonts: uses(appDir, packages, "google_fonts"),
    sharedPreferences: uses(appDir, packages, "shared_preferences"),
    ...(theme ? { theme } : {}),
    ...(setup ? { setup } : {}),
    screens,
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
  const mapped = mapResult(targets, opts.outDir, result.result, result.timedOut ? { seconds: Math.round(opts.timeoutMs / 1000) } : null);
  const notes = [...result.notes, ...mapped.notes];
  if (opts.states.length > 0) notes.push("--state doesn't run on Flutter apps yet: the screenshots show each screen as it opens.");
  return { ...mapped, notes };
}
