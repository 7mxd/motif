import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { loadTokenDocument } from "../contract/load";
import { readVariants } from "../contract/variants";
import { brokenVariants, ONE_PALETTE_NOTE, variantRefusal, type VariantRefusal } from "./variant-flag";
import { defaultDoctorDeps, type DoctorDeps } from "./doctor";
import { BROWSER_OFF, browserOff, findBrowser, type BrowserInfo } from "../detect/browser";
import { detectApps, siteDir, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { noSuchApp, selectApps } from "../project/apps";
import { reviewJson, toFindings, type ReviewFinding } from "../shot/audit";
import {
  captureScreens, describeSizes, MAX_HEIGHT, NATIVE_DESKTOP, NATIVE_VIEWPORTS, parseSizes, SIGN_IN, signInFirst, type RouteResult, type StateScript, type Viewport,
} from "../shot/capture";
import {
  darkLooksLikeLight, identicalVariantNotes, isRtlShot, missingStateFrames, mockupFrames, pairWithMockup, pairWithSet, renderComparisons, type ComparePair, type Comparison,
} from "../shot/compare";
import { devCommand, startDevServer, type DevServer } from "../shot/devserver";
import { startStaticServer, type StaticServer } from "../shot/static-server";
import { nativeStack, type NativeStack } from "../stacks/native";
import { WEB_INSTALL } from "../stacks/react-native/doctor";
import { RN_FIXES, RN_MOTION_SIZE, RN_START_TIMEOUT_MS, RN_WEB_NOTE } from "../stacks/react-native";
import { fixedScheme, hasWebSupport, isExpoApp } from "../stacks/react-native/project";
import { buildWebBundle, webErrorHints } from "../stacks/react-native/web";
import { discoverPlainRoutes } from "../stacks/plain-web/routes";
import { discoverRoutes, type RouteDiscovery } from "../stacks/react-web/routes";
import { andList } from "../text";

export interface ShotDeps {
  findBrowser: () => BrowserInfo | null;
  devCommand: typeof devCommand;
  startDevServer: typeof startDevServer;
  serveStatic: (root: string) => StaticServer;
  capture: typeof captureScreens;
  compare: typeof renderComparisons;
  today: () => string;
  /** True when MOTIF_BROWSER=none turns the browser off. */
  browserOff?: () => boolean;
  /** Finds a command (flutter) on the PATH. */
  which?: (cmd: string) => string | null;
  /** How a native stack finds its toolchain (Compose's JDK and Android SDK); motif doctor's own when not given. */
  doctor?: () => DoctorDeps;
  /** Stands in for a native stack's shoot in tests. */
  shoot?: NativeStack["shoot"];
  /** Has Expo build its web bundle before the first screenshot (buildWebBundle); not called when not given. */
  webBundle?: typeof buildWebBundle;
}

const MAX_ROUTES = 12;
/** How many of the pages left out the note names before it counts the rest. */
const LEFT_OUT_NAMED = 5;
export { signInFirst };
const RN_NOTE_MARKER = ".motif-web-target-noted";
const INSTALL_HINT = '"motif browser install" downloads a private headless copy (about 120 MB to download, about 300 MB on disk) that only Motif uses.';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const defaultDeps: ShotDeps = {
  findBrowser: () => findBrowser(),
  devCommand,
  startDevServer,
  serveStatic: startStaticServer,
  capture: captureScreens,
  compare: renderComparisons,
  today,
  browserOff: () => browserOff(),
  webBundle: buildWebBundle,
};

const usage = (text: string, data: Record<string, unknown>): CommandResult => ({ command: "shot", exitCode: 2, text, data });
const projectPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/") || ".";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rendered = (r: RouteResult) => !r.error && !r.pageErrors?.length && !r.loading && r.status >= 200 && r.status < 400;
const SET_NAME = /^(?!compare$)[a-z0-9][a-z0-9-]*$/i;
/** Marks a folder as a set of screenshots saved by --save, which a later --save may replace. */
const SET_MARKER = ".motif-set";
const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

type Against = { kind: "set"; name: string; dir: string } | { kind: "mockup"; file: string; frames: string[] };

/** What --against names: a saved set of screenshots, or a mockup (its .html, or one of its PNGs from motif preview). */
function resolveAgainst(cwd: string, outDir: string, value: string, pages: number): Against | { error: string } {
  if (SET_NAME.test(value) && isDir(join(outDir, value))) return { kind: "set", name: value, dir: join(outDir, value) };
  const file = resolve(cwd, value);
  if (/\.(png|html)$/i.test(file) && existsSync(file)) {
    if (pages !== 1) return { error: "Compare one page with a mockup at a time: add --routes with that page, like --routes /settings." };
    // motif preview writes a mockup's PNGs next to it (older versions wrote them to design/previews/).
    const frames = mockupFrames(file, [join(cwd, "design", "previews")]);
    if (frames.length === 0) return { error: `There are no PNGs of this mockup yet. Make them first: motif preview ${value} --png-only` };
    return { kind: "mockup", file, frames };
  }
  return {
    error: `Nothing to compare with: "${value}" isn't a saved set of screenshots (keep one with --save ${SET_NAME.test(value) ? value : "before"}) or a mockup (.html or .png).`,
  };
}

/**
 * Git Bash on Windows rewrites arguments that start with "/" into Windows paths under its install folder
 * ("/settings" → "C:/Program Files/Git/settings") and says where that folder is in EXEPATH. Undo it for page addresses.
 */
function undoGitBash(route: string, env: Record<string, string | undefined>): string {
  if (!/^[A-Za-z]:[\\/]/.test(route)) return route;
  const root = env.EXEPATH?.replace(/\\/g, "/").replace(/\/+$/, "").replace(/\/(usr\/)?bin$/i, "");
  const path = route.replace(/\\/g, "/");
  return root && path.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? path.slice(root.length) : route;
}

/** "/, settings ,/about" → ["/", "/settings", "/about"] */
export function parseRoutes(value: string, env: Record<string, string | undefined> = process.env): string[] {
  const routes = value
    .split(",")
    .map((r) => undoGitBash(r.trim(), env))
    .filter(Boolean)
    .map((r) => (r.startsWith("/") ? r : `/${r}`));
  return [...new Set(routes)];
}

/** Where a page ended up: its own route, or the path it redirected to (a sign-in page, say). */
function landedOn(r: RouteResult): string {
  if (r.landedOn) return r.landedOn;
  if (!r.finalUrl) return r.route;
  const from = new URL(r.url).pathname.replace(/\/+$/, "");
  const to = new URL(r.finalUrl).pathname.replace(/\/+$/, "");
  return from === to ? r.route : to || "/";
}

function routeLine(r: RouteResult, width: number): string {
  const what = rendered(r)
    ? `${r.shots.length} screenshots${r.landedOn ? ` (went to ${r.landedOn})` : r.finalUrl ? ` (went to ${new URL(r.finalUrl).pathname})` : ""}${r.cropped ? ` (cropped at ${MAX_HEIGHT} px)` : ""}`
    : r.loading && !r.error && !r.pageErrors?.length
      ? `✗ ${r.loading}`
      : r.missing && r.pageErrors?.length
        ? `✗ ${r.missing} of its ${r.missing + r.shots.length} screenshots weren't drawn: ${r.pageErrors[0]}`
        : `✗ ${r.error ??(r.pageErrors?.length ? `the page threw an error: ${r.pageErrors[0]}` : `HTTP ${r.status}`)}${r.shots.length > 0 ? " (the screenshots show what it looked like)" : ""}`;
  return `  ${r.route.padEnd(width)}  ${what}`;
}

/** Where a page changed: something added or removed (what's below only moved), or from where it differs. */
function whereChanged(c: Comparison): string {
  if (c.from === undefined) return "";
  if (c.taller && c.moved) {
    const size = Math.abs(c.taller);
    return c.taller > 0
      ? `: ${size} px added at ${c.from} px down; what's below moved down unchanged`
      : `: ${size} px removed at ${c.from} px down; what's below moved up unchanged`;
  }
  return `: from ${c.from} px down${c.taller ? `, ${Math.abs(c.taller)} px ${c.taller > 0 ? "taller" : "shorter"}` : ""}`;
}

function countText(findings: ReviewFinding[]): string {
  return (["critical", "major", "minor"] as const)
    .map((severity) => [severity, findings.filter((f) => f.severity === severity).length] as const)
    .filter(([, n]) => n > 0)
    .map(([severity, n]) => `${n} ${severity}`)
    .join(", ");
}

/** --state values: repeated, or a comma list; each a script file whose name names the state. */
export function readStates(cwd: string, value: unknown): StateScript[] | { error: string } {
  const given = (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).flatMap((v) => String(v).split(","));
  const states: StateScript[] = [];
  for (const file of given.map((f) => f.trim()).filter(Boolean)) {
    const abs = resolve(cwd, file);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      return { error: `--state: "${file}" doesn't exist. Give the path to a script, like design/states/editor.js.` };
    }
    const name = basename(abs).replace(/\.[^.]+$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return { error: `--state: "${basename(abs)}" names the screenshots, so use letters, digits and dashes (like editor.js).` };
    }
    if (states.some((s) => s.name === name)) return { error: `--state: two scripts are named "${name}"; rename one.` };
    states.push({ name, script: readFileSync(abs, "utf8"), file: abs });
  }
  return states;
}

/** How Motif sets a design variant on a web page, for the note when a variant looks exactly like the default. */
export const WEB_VARIANT_HOW = "data-variant on <html>";

/**
 * --rtl's language: "ar" when it's given alone, else its value lowercased, which must be a BCP 47 primary language
 * subtag (two or three letters). Nothing without --rtl.
 */
export function readRtl(value: unknown): string | undefined | { error: string } {
  if (value === undefined || value === false) return undefined;
  if (value === true) return "ar";
  if (typeof value === "string" && /^[a-z]{2,3}$/i.test(value.trim())) return value.trim().toLowerCase();
  return { error: "--rtl takes a language code of two or three letters, like --rtl ar or --rtl he (Arabic when none is given)." };
}

/**
 * The design guide's variants (the default first), read from design/tokens.json; none when it declares none. Broken when
 * its variants block has errors motif validate reports.
 */
function guideVariants(cwd: string): { ids: string[]; broken: boolean } {
  const path = join(cwd, "design", "tokens.json");
  if (!existsSync(path)) return { ids: [], broken: false };
  const { doc } = loadTokenDocument(path, readFileSync(path, "utf8"));
  if (!doc) return { ids: [], broken: false };
  const { variants, defaultId, findings } = readVariants(doc);
  return { ids: defaultId ? variants.map((v) => v.id) : [], broken: findings.some((f) => f.severity === "error") };
}

/**
 * What --variant asks for: the variants to capture besides the default, or the refusal; and the default's id when the
 * guide has variants that validate, which the default's screenshots set too.
 */
function chooseVariants(cwd: string, flag: string | undefined, audit: boolean): { variants: string[]; defaultId?: string; note?: string } | { error: CommandResult } {
  const { ids, broken } = guideVariants(cwd);
  const refuse = (r: VariantRefusal): { error: CommandResult } => ({ error: { command: "shot", ...r } });
  // An audit with no --variant checks what people see in every variant.
  if (broken && (flag !== undefined || audit)) return refuse(brokenVariants(flag));
  const defaultId = !broken && ids.length > 0 ? { defaultId: ids[0]! } : {};
  if (flag === undefined) return { variants: audit ? ids.slice(1) : [], ...defaultId };
  const refusal = variantRefusal("This design guide", flag, ids);
  if (refusal) return refuse(refusal);
  if (flag === "all" && ids.length === 0) return { variants: [], note: ONE_PALETTE_NOTE };
  return { variants: flag === "all" ? ids.slice(1) : flag === ids[0] ? [] : [flag], ...defaultId };
}

export async function runShot(cwd: string, ctx: RunContext, deps: ShotDeps = defaultDeps): Promise<CommandResult> {
  const flags = ctx.flags ?? {};
  const givenUrl = typeof flags.url === "string" ? flags.url : undefined;
  const audit = flags.audit === true;
  if (givenUrl !== undefined && !/^https?:\/\/\S+$/.test(givenUrl)) {
    return usage("--url needs the address of a running app, like http://localhost:3000.", { error: "usage" });
  }
  const states = readStates(cwd, flags.state);
  if ("error" in states) return usage(states.error, { error: "usage" });
  const screens = [
    ...new Set(
      (Array.isArray(flags.screen) ? flags.screen : typeof flags.screen === "string" ? [flags.screen] : [])
        .flatMap((v) => String(v).split(","))
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  const rtlFlag = readRtl(flags.rtl);
  if (typeof rtlFlag === "object") return usage(rtlFlag.error, { error: "usage" });
  const rtl = rtlFlag;
  const chosen = chooseVariants(cwd, typeof flags.variant === "string" ? flags.variant : undefined, audit);
  if ("error" in chosen) return chosen.error;
  const variants = chosen.variants;
  const defaultVariant = chosen.defaultId;

  const { apps: detected, findings: settingProblems } = detectApps(cwd);
  const selected = selectApps(detected, ctx.app);
  if (selected === null) {
    return usage(noSuchApp(ctx.app, detected), { error: "no-such-app" });
  }
  const app: AppInfo | undefined = selected.length === 1 ? selected[0] : undefined;
  // A native app is drawn from its code by its own stack (Flutter: flutter test), without a browser or a dev server.
  const native = app ? nativeStack(app.stack) : null;
  // Expo's apps are drawn in the browser, through the web target: the web path, with native sizes and notes.
  const rn = app?.stack === "react-native";
  const shoot = native?.shoot ? (deps.shoot ?? native.shoot.bind(native)) : undefined;
  // Sizes the stack draws this app at instead of the native ones (a macOS SwiftUI app's windows), or why not.
  let own: { viewports: Viewport[] } | { error: string } | null = null;
  if (shoot && native && app) {
    const label = app.stack ? STACK_LABELS[app.stack] : "These";
    if (givenUrl !== undefined) return usage(`${label} apps are screenshotted from their code, not a URL; drop --url.`, { error: "usage" });
    // A state is a script in the stack's own language (a Dart file for Flutter), not a browser script.
    const kind = native.stateFiles;
    for (const s of kind ? states : []) {
      if (s.file?.endsWith(kind!.extension)) continue;
      const base = basename(s.file ?? s.name);
      const like = `a ${label} app's states are ${kind!.language} files, like design/states/${s.name}${kind!.extension}.`;
      return usage(
        /\.(m?js|ts)$/i.test(base) ? `--state: ${base} is a browser script; ${like}` : `--state: ${base} isn't a ${kind!.language} file; ${like}`,
        { error: "usage" },
      );
    }
    // The stack's own sizes first: a multiplatform SwiftUI app drawn at window sizes needs no iOS simulator.
    own = native.shotSizes?.(cwd, app, typeof flags.sizes === "string" ? flags.sizes : undefined) ?? null;
    // A --sizes the app can't be drawn at is a usage error, said first, as for every app.
    if (own && "error" in own) return usage(own.error, { error: "usage" });
    const chosen = own ? own.viewports : undefined;
    const refusal = native.shotRefusal?.(cwd, app, deps.which ?? ((cmd) => Bun.which(cmd)), (deps.doctor ?? defaultDoctorDeps)(), chosen);
    if (refusal) return usage(refusal.text, { error: refusal.error });
    // A widget or a state script that can't be used is a usage error, found before anything is written.
    const problem = native.shotInputsProblem?.(cwd, app, { screens, states });
    if (problem) return usage(problem, { error: "usage" });
  } else if (screens.length > 0) {
    if (rn) return usage("React Native screens are routes; pass --routes.", { error: "usage" });
    return usage("--screen opens a Flutter widget by its class name, a Jetpack Compose @Preview function by its name, or a SwiftUI #Preview by its title; this app is neither. Use --routes for its pages.", { error: "usage" });
  }
  let viewports: Viewport[] | undefined;
  // Sizes the stack draws this app at instead of the native ones (a macOS SwiftUI app's windows), from --sizes when
  // given. They are what's drawn; --sizes' notes about what it left out are for phone and tablet sizes only.
  let stackSizes: Viewport[] | undefined;
  if (own && !("error" in own)) {
    stackSizes = own.viewports;
    if (typeof flags.sizes === "string" && own.viewports.some((v) => v.mobile)) viewports = own.viewports;
  } else if (typeof flags.sizes === "string") {
    const sizes = parseSizes(flags.sizes, shoot || rn ? [...NATIVE_VIEWPORTS, NATIVE_DESKTOP] : undefined);
    if ("error" in sizes) return usage(sizes.error, { error: "usage" });
    viewports = sizes;
  }
  const findBrowserOrRefuse = (): BrowserInfo | CommandResult => {
    const found = deps.findBrowser();
    if (found) return found;
    if (deps.browserOff?.()) {
      return usage(`${BROWSER_OFF}, so Motif can't take screenshots. Unset MOTIF_BROWSER to use Chrome or Edge.`, { error: "browser-off", status: "browser_off" });
    }
    return usage(`No Chrome or Edge found, so Motif can't take screenshots. ${INSTALL_HINT}`, { error: "needs-browser", status: "needs_browser" });
  };
  // Which app comes before which browser: a native app among them needs none.
  if (!givenUrl && !app && selected.length > 1) {
    return usage(`There are several apps here (${selected.map((a) => a.path).join(", ")}). Choose one with --app <path>.`, { error: "several-apps" });
  }
  let browser: BrowserInfo | undefined;
  if (!shoot) {
    const found = findBrowserOrRefuse();
    if ("command" in found) return found;
    browser = found;
  }
  if (!givenUrl && !shoot) {
    if (selected.length === 0) {
      return usage("No app found in this folder. Run this inside your app's folder, or pass a running app's address with --url.", { error: "no-app" });
    }
    if (!app) return usage(`There are several apps here (${selected.map((a) => a.path).join(", ")}). Choose one with --app <path>.`, { error: "several-apps" });
    if (rn && isExpoApp(join(cwd, app.path))) {
      const missing = hasWebSupport(join(cwd, app.path));
      if (missing.length > 0) {
        return usage(
          `Expo's web target needs ${andList(missing)}, which this app doesn't have yet. Install them with: ${WEB_INSTALL}`,
          { error: "needs-web-target" },
        );
      }
    } else if (rn) {
      // Bare React Native: Motif starts only Expo's web target.
      return usage(
        "Motif starts Expo apps for screenshots, and this React Native app doesn't use Expo. If it runs on react-native-web, start it and pass its address with --url.",
        { error: "unsupported-stack" },
      );
    } else if (app.stack !== "react-web" && app.stack !== "plain-web") {
      const what = app.stack ? `${STACK_LABELS[app.stack]} apps` : "this app";
      return usage(`Motif can't start ${what} for screenshots yet. Start it yourself and pass its address with --url.`, { error: "unsupported-stack" });
    }
  }
  const appDir = app ? join(cwd, app.path) : cwd;
  const siteFolderPath = app?.stack === "plain-web" ? join(appDir, siteDir(cwd, app)) : undefined;

  const discovery: RouteDiscovery & { screens?: string[] } =
    typeof flags.routes === "string"
      ? { routes: parseRoutes(flags.routes), skipped: [] }
      : shoot
        ? screens.length > 0
          ? { routes: [], skipped: [] }
          : (native?.routes?.(appDir) ?? { routes: ["/"], skipped: [] })
        : rn
        ? (native?.routes?.(appDir) ?? { routes: ["/"], skipped: [] })
        : app?.stack === "react-web"
        ? discoverRoutes(appDir)
        : siteFolderPath
          ? discoverPlainRoutes(siteFolderPath)
          : { routes: ["/"], skipped: [] };
  // A native stack's own screens a run takes by default (Compose's previews), when none are named.
  const runScreens = screens.length > 0 ? screens : (discovery.screens ?? []);
  if (discovery.routes.length === 0 && runScreens.length === 0) return usage("--routes needs at least one page, like --routes /,/settings.", { error: "usage" });
  const filePath = discovery.routes.find((r) => /^\/[A-Za-z]:[\\/]/.test(r));
  if (filePath) {
    return usage(
      `--routes got a file path (${filePath.slice(1)}), not a page address. Git Bash on Windows rewrites arguments that start with "/": put MSYS_NO_PATHCONV=1 in front of the command.`,
      { error: "usage" },
    );
  }
  // A native app's own pages, past the cap: sign-in and the home page first, so the run shows the screens people meet first.
  const reordered = Boolean(shoot || rn) && typeof flags.routes !== "string" && discovery.routes.length > MAX_ROUTES;
  const all = reordered ? signInFirst(discovery.routes) : discovery.routes;
  const routes = all.slice(0, MAX_ROUTES);
  const notes: string[] = settingProblems.map((f) => f.message);
  if (chosen.note) notes.push(chosen.note);
  if (all.length > routes.length) {
    const left = all.slice(MAX_ROUTES);
    const named = left.length > LEFT_OUT_NAMED + 1 ? `${left.slice(0, LEFT_OUT_NAMED).join(", ")} and ${left.length - LEFT_OUT_NAMED} more` : andList(left);
    // Only what the app has comes first: its sign-in pages, its / page.
    const first = [...(all.some((r) => SIGN_IN.test(r)) ? ["sign-in pages"] : []), ...(all.includes("/") ? ["/"] : [])];
    notes.push(
      reordered && first.length > 0
        ? `Captured ${MAX_ROUTES} of ${all.length} pages: ${andList(first)} first, then the rest in the order your code lists them. Left out: ${named}. Choose others with --routes.`
        : `Captured the first ${MAX_ROUTES} of ${all.length} pages. Left out: ${named}. Choose others with --routes.`,
    );
  }
  notes.push(...(discovery.notes ?? []));
  if (discovery.skipped.length > 0) {
    notes.push(`Skipped pages that need values in their address: ${discovery.skipped.join(", ")}. Add real ones with --routes.`);
  }
  const outDir = resolve(cwd, typeof flags.out === "string" ? flags.out : join("design", "shots"));
  const save = typeof flags.save === "string" ? flags.save : undefined;
  if (save !== undefined && !SET_NAME.test(save)) {
    return usage("--save needs a short name made of letters, digits and dashes, like --save before.", { error: "usage" });
  }
  // A set is replaced on every --save, so only ever replace a folder that Motif itself saved.
  if (save !== undefined && existsSync(join(outDir, save)) && !existsSync(join(outDir, save, SET_MARKER))) {
    return usage(
      `${projectPath(cwd, join(outDir, save))} isn't a set of screenshots Motif saved, so --save ${save} won't replace it. Choose another name.`,
      { error: "usage" },
    );
  }
  const against = typeof flags.against === "string" ? resolveAgainst(cwd, outDir, flags.against, routes.length + runScreens.length) : undefined;
  if (against && "error" in against) return usage(against.error, { error: "usage" });
  // A native app needs the browser only to put screenshots side by side.
  if (against && shoot) {
    const found = findBrowserOrRefuse();
    if ("command" in found) return found;
    browser = found;
  }

  let server: DevServer | undefined;
  let site: StaticServer | undefined;
  let baseUrl = givenUrl;
  if (shoot) {
    // Drawn from the app's code: nothing to serve.
  } else if (!baseUrl && siteFolderPath) {
    site = deps.serveStatic(siteFolderPath);
    baseUrl = site.url;
  } else if (!baseUrl) {
    const how = deps.devCommand(appDir);
    if ("error" in how) return usage(how.error, { error: "cant-start" });
    // Expo's start limit covers its server and its first web bundle.
    const started = Date.now();
    try {
      server = await deps.startDevServer({
        cwd: appDir, command: how.command, ...(how.env ? { env: how.env } : {}), ...(rn ? { timeoutMs: RN_START_TIMEOUT_MS } : {}),
      });
    } catch (e) {
      return usage(`Couldn't start the app with "${how.display}". ${message(e)}`, { error: "dev-server-failed" });
    }
    baseUrl = server.url;
    if (rn && deps.webBundle) {
      const built = await deps.webBundle(appDir, baseUrl, started + RN_START_TIMEOUT_MS, how.display, routes);
      if (built.error) {
        await server.stop();
        return {
          command: "shot", exitCode: 1, text: `Expo couldn't build the app for the web, so there's nothing to screenshot: ${built.error}`, data: { error: "web-bundle-failed", message: built.error },
        };
      }
    }
  }
  // An Expo app that keeps light (or dark) whatever the phone's setting is drawn that way in every screenshot.
  const appScheme = rn && app ? fixedScheme(appDir) : null;

  let captured: Awaited<ReturnType<typeof captureScreens>>;
  // Whether the audit checked tap targets: always but on a Mac app's windows (a native stack says so).
  let targetsRan = true;
  try {
    mkdirSync(outDir, { recursive: true });
    const ignore = join(outDir, ".gitignore");
    if (typeof flags.out !== "string" && !existsSync(ignore)) {
      writeFileSync(ignore, "# Screenshots of the running app (motif shot). Not committed.\n*\n");
    }
    if (shoot && app) {
      const sizes = stackSizes ?? viewports ?? NATIVE_VIEWPORTS;
      // Each state is one more screenshot of every shot, after the screen has settled.
      const count = (routes.length + runScreens.length) * sizes.length * 2 * (variants.length + 1) * (rtl ? 2 : 1) * (1 + states.length);
      const timeoutMs = native?.shotTimeLimit?.(count) ?? 240_000 + 3_000 * count;
      const drawn = await shoot({
        root: cwd, app, routes, screens: runScreens, outDir, viewports: sizes, variants, ...(rtl ? { rtl } : {}), states, audit, timeoutMs,
        ...(ctx.progress ? { progress: ctx.progress } : {}), doctor: (deps.doctor ?? defaultDoctorDeps)(),
      });
      notes.push(...drawn.notes);
      targetsRan = !drawn.noTapTargets;
      captured = { routes: drawn.routes, issues: drawn.issues };
    } else {
      captured = await deps.capture({
        browserPath: browser!.path, baseUrl: baseUrl!, routes, outDir, audit, states: states.map(({ name, script }) => ({ name, script })),
        ...(rn ? { motionWidth: RN_MOTION_SIZE.width, reactNative: true } : {}),
        ...(viewports ?? (rn ? NATIVE_VIEWPORTS : undefined) ? { viewports: viewports ?? NATIVE_VIEWPORTS } : {}), ...(variants.length > 0 ? { variants } : {}), ...(rtl ? { rtl } : {}),
        ...(defaultVariant ? { defaultVariant } : {}), ...(appScheme ? { appScheme: appScheme.scheme } : {}),
      });
    }
  } catch (e) {
    return usage(`Couldn't take screenshots: ${message(e)}`, { error: "capture-failed" });
  } finally {
    await server?.stop();
    site?.stop();
  }

  const failed = captured.routes.filter((r) => !rendered(r));
  const shots = captured.routes.flatMap((r) => r.shots.map((s) => projectPath(cwd, s)));
  const width = Math.max(...captured.routes.map((r) => r.route.length));
  const lines = [
    shots.length > 0
      ? `✓ ${shots.length} screenshots of ${captured.routes.length} ${captured.routes.length === 1 ? (shoot ? "screen" : "page") : shoot ? "screens" : "pages"} (${describeSizes(stackSizes ?? viewports ?? (shoot || rn ? NATIVE_VIEWPORTS : undefined))}, light and dark${rtl ? `, right to left in ${rtl}` : ""}${variants.length > 0 ? `, ${variants.length + 1} design variants` : ""}) in ${projectPath(cwd, outDir)}/`
      : "✗ No screenshots were taken.",
    ...captured.routes.map((r) => routeLine(r, width)),
  ];
  for (const r of captured.routes.filter((r) => r.rtlForced)) {
    notes.push(`${r.route} doesn't switch to right to left by itself for ${rtl}; Motif set dir="rtl" to show it.`);
  }
  if (rn) {
    notes.push(...webErrorHints(captured.routes.flatMap((r) => r.pageErrors ?? []), appDir));
    if (appScheme) {
      const { scheme, set } = appScheme;
      const why = set ? `app.json sets userInterfaceStyle to "${scheme}"` : `app.json doesn't set userInterfaceStyle, and Expo's default is "light"`;
      notes.push(
        scheme === "light"
          ? `${why}, so on a phone the app stays light in dark mode: its .dark screenshots are drawn light too. Set it to "automatic" to follow the phone's setting.`
          : `${why}, so on a phone the app stays dark in light mode: its light screenshots are drawn dark too. Set it to "automatic" to follow the phone's setting.`,
      );
    } else if (darkLooksLikeLight(captured.routes.filter(rendered).flatMap((r) => r.shots))) {
      // Only screens that drew without an error: a crashed screen looks the same in both.
      notes.push("Dark mode looks exactly like light on every screen: the app doesn't follow the phone's setting on the web. MotifProvider reads it with useColorScheme(); use its colours.");
    }
    // Said the first time a folder of screenshots is made.
    const marker = join(outDir, RN_NOTE_MARKER);
    // Kept only in the default folder; with --out the note repeats.
    if (!existsSync(marker)) {
      notes.unshift(RN_WEB_NOTE);
      if (typeof flags.out !== "string") try {
        writeFileSync(marker, "");
      } catch {
        // Not saving that it was said only means it is said again.
      }
    }
  }
  notes.push(...identicalVariantNotes(captured.routes.flatMap((r) => r.shots), native?.variantHow ?? WEB_VARIANT_HOW));

  // Whether the reduced-motion check ran at all: it needs the stack's motion size (a desktop one on the web) among the sizes drawn.
  const sizesDrawn = viewports ?? (rn ? NATIVE_VIEWPORTS : undefined);
  const motionRan = shoot || !sizesDrawn ? true : rn ? sizesDrawn.some((v) => v.width === RN_MOTION_SIZE.width) : sizesDrawn.some((v) => !v.mobile);
  let findings: ReviewFinding[] = [];
  let auditFile: string | undefined;
  if (audit) {
    // A page that redirected (to a sign-in page, say) was audited as the page it landed on.
    const landed = new Map(captured.routes.map((r) => [r.route, landedOn(r)]));
    // An Expo screen that threw as it loaded is covered by Expo's error overlay: auditing it would judge the overlay.
    const overlaid = rn ? captured.routes.filter((r) => r.pageErrors?.some((e) => !e.startsWith('State "'))).map((r) => r.route) : [];
    findings = toFindings(captured.issues.filter((i) => !overlaid.includes(i.route)).map((i) => ({ ...i, ...(rn && !i.fix && RN_FIXES[i.rule] ? { fix: RN_FIXES[i.rule] } : {}), route: landed.get(i.route) ?? i.route, shot: projectPath(cwd, i.shot) })));
    const redirected = captured.routes.filter((r) => landedOn(r) !== r.route);
    if (redirected.length > 0) {
      notes.push(`Pages that redirected were audited as the page they landed on: ${redirected.map((r) => `${r.route} → ${landedOn(r)}`).join(", ")}.`);
    }
    const file = join(outDir, "audit.json");
    // Every screen the run took: its routes, and the widgets or previews it drew by name.
    writeFileSync(file, JSON.stringify(reviewJson(findings, [...routes, ...runScreens], deps.today()), null, 2) + "\n");
    auditFile = projectPath(cwd, file);
    const incomplete = captured.routes.filter((r) => r.auditError);
    if (incomplete.length > 0) {
      lines.push(`✗ Audit incomplete: it couldn't finish on ${incomplete.map((r) => `${r.route} (${r.auditError})`).join(", ")}.`);
    }
    if (overlaid.length > 0) {
      const one = overlaid.length === 1;
      lines.push(`✗ Audit incomplete: ${andList(overlaid)} threw an error as ${one ? "it" : "they"} loaded, so ${one ? "it isn't" : "they aren't"} audited (${one ? "its" : "their"} screenshots may show Expo's error overlay).`);
    }
    if (findings.length > 0) lines.push(`✗ Audit: ${countText(findings)} (details in ${auditFile}):`);
    else if (incomplete.length === 0 && overlaid.length === 0) lines.push(`✓ Audit: no contrast${targetsRan ? ", tap-target" : ""}${motionRan ? " or reduced-motion" : ""} problems found, and no controls without a name (${auditFile}).`);
    for (const f of findings.slice(0, 15)) {
      const l = f.location;
      const where = `${l.screen}${l.state ? ` in "${l.state}"` : ""} (${l.viewport}${l.scheme ? `, ${l.scheme}` : ""}${l.variant ? `, ${l.variant} variant` : ""}${l.rtl ? ", right to left" : ""})`;
      lines.push(`  ${f.severity.padEnd(8)} ${where} ${f.summary}`);
    }
    if (findings.length > 15) lines.push(`  …and ${findings.length - 15} more in ${auditFile}.`);
  }

  const thisRun = captured.routes.flatMap((r) => r.shots);
  // What --sizes left out that a check or a mockup's frames need.
  if (viewports) {
    const phones = viewports.some((v) => v.mobile);
    const desktop = viewports.some((v) => !v.mobile);
    const motion = native?.motionSize;
    if (audit && (motion ? !viewports.some((v) => v.width === motion.width) : !desktop)) {
      notes.push(`The reduced-motion check runs at ${motion?.text ?? "the desktop size"}, which --sizes left out.`);
    }
    if (audit && !phones) notes.push("The 44 px tap-target check runs on phones and tablets, which --sizes left out.");
    if (against?.kind === "mockup" && !viewports.some((v) => v.width === 390)) notes.push("The mockup's phone frames pair with the 390 px screenshots, which --sizes left out.");
    if (against?.kind === "mockup" && !desktop) notes.push("The mockup's wider frames pair with the desktop screenshots, which --sizes left out.");
  }
  let comparisons: Comparison[] = [];
  let compareError: string | undefined;
  let added: string[] = [];
  if (against) {
    const compareDir = join(outDir, "compare", against.kind === "set" ? against.name : "mockup");
    let pairs: ComparePair[];
    if (against.kind === "set") {
      const paired = pairWithSet(thisRun, against.dir, compareDir);
      pairs = paired.pairs;
      added = paired.added;
    } else {
      pairs = pairWithMockup(against.frames, thisRun, compareDir);
      if (thisRun.some(isRtlShot)) notes.push("RTL screenshots aren't compared with the mockup, which is left to right.");
      for (const state of missingStateFrames(against.frames, thisRun)) {
        notes.push(`The mockup also shows "${state}", which this run didn't capture: add --state with its script (design/states/${state}.js).`);
      }
    }
    try {
      comparisons = await deps.compare({
        browserPath: browser!.path,
        pairs,
        labels: against.kind === "set" ? [against.name === "before" ? "Before" : `Before ("${against.name}")`, "Now"] : ["Mockup", "The app now"],
        measure: against.kind === "set",
      });
    } catch (e) {
      compareError = message(e);
      notes.push(`Couldn't make the side-by-side images: ${compareError}`);
    }
    // Variants that had nothing of their own to compare with, said once each.
    const fellBack = [...new Set(comparisons.filter((c) => c.fallback && c.variant).map((c) => c.variant!))];
    for (const v of fellBack) {
      notes.push(
        against.kind === "set"
          ? `The "${against.name}" set has no screenshots in the ${v} variant, so those were compared with its default ones.`
          : `Screenshots in the ${v} variant were compared with the mockup's default PNGs, because the mockup has none in that variant (motif preview ${projectPath(cwd, against.file)} --png-only --variant ${v} makes them).`,
      );
    }
    const where = projectPath(cwd, compareDir);
    if (against.kind === "set") {
      const changed = comparisons.filter((c) => (c.changed ?? 0) >= 0.1);
      const newPart = added.length > 0 ? `, ${added.length} new` : "";
      lines.push(`Compared with "${against.name}": ${changed.length} changed, ${comparisons.length - changed.length} with no visible change${newPart} (side by side in ${where}/)`);
      for (const c of changed) lines.push(`  ${basename(c.after)}  ${c.changed}% different${whereChanged(c)}`);
    } else if (comparisons.length > 0) {
      lines.push(`Side by side with the mockup ${projectPath(cwd, against.file)}: ${comparisons.length} ${comparisons.length === 1 ? "image" : "images"} in ${where}/`);
    } else {
      notes.push("None of the mockup's frames matched these screenshots (phone frames pair with mobile, wider frames with desktop).");
    }
  }
  let saved: string | undefined;
  // A comparison with this very set that didn't work keeps it whole, so it can be made again. Otherwise the set takes
  // this run's screenshots of the pages that rendered, file by file: a page that didn't render keeps its earlier ones,
  // and sizes or states this run didn't take stay as they were (--sizes).
  const keptWhole = save !== undefined && compareError !== undefined && against?.kind === "set" && against.name === save;
  if (save && keptWhole) {
    notes.push(`Kept the earlier "${save}" set as it was: the comparison with it didn't work. Run --save ${save} again once it does.`);
  } else if (save) {
    const setDir = join(outDir, save);
    const existed = existsSync(setDir);
    mkdirSync(setDir, { recursive: true });
    for (const shot of captured.routes.filter(rendered).flatMap((r) => r.shots)) copyFileSync(shot, join(setDir, basename(shot)));
    writeFileSync(join(setDir, SET_MARKER), "Screenshots kept by motif shot --save. Motif updates them on the next --save with this name.\n");
    saved = projectPath(cwd, setDir);
    lines.push(`✓ Kept these screenshots as "${save}" (${saved}/). After changes, compare with --against ${save}.`);
    if (failed.length > 0) {
      const pages = failed.map((r) => r.route).join(", ");
      notes.push(existed ? `Pages that didn't render kept their earlier screenshots in "${save}": ${pages}.` : `Pages that didn't render weren't kept in "${save}": ${pages}.`);
    }
  }
  lines.push(...notes.map((n) => `• ${n}`));

  return {
    command: "shot",
    exitCode: failed.length > 0 || findings.length > 0 || keptWhole || (audit && captured.routes.some((r) => r.auditError)) ? 1 : 0,
    text: lines.join("\n"),
    data: {
      url: baseUrl,
      routes: captured.routes.map((r) => ({
        route: r.route,
        status: r.status,
        ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
        ...(r.landedOn ? { landedOn: r.landedOn } : {}),
        ...(r.error ? { error: r.error } : {}),
        ...(r.cropped ? { cropped: true } : {}),
        ...(r.loading ? { loading: r.loading } : {}),
        ...(r.pageErrors?.length ? { pageErrors: r.pageErrors } : {}),
        ...(r.auditError ? { auditError: r.auditError } : {}),
        shots: r.shots.map((s) => projectPath(cwd, s)),
      })),
      shots,
      skipped: discovery.skipped,
      states: states.map((s) => s.name),
      ...(rtl ? { rtl } : {}),
      ...(audit ? { findings, audit: auditFile } : {}),
      ...(against
        ? {
            comparisons: comparisons.map((c) => ({
              before: projectPath(cwd, c.before),
              after: projectPath(cwd, c.after),
              image: projectPath(cwd, c.out),
              ...(c.variant ? { variant: c.variant } : {}),
              ...(c.fallback ? { fallback: true } : {}),
              ...(c.changed !== undefined ? { changed: c.changed } : {}),
              ...(c.from !== undefined ? { from: c.from } : {}),
              ...(c.taller !== undefined ? { taller: c.taller, moved: c.moved } : {}),
            })),
            added: added.map((a) => projectPath(cwd, a)),
            ...(compareError !== undefined ? { compareError } : {}),
          }
        : {}),
      ...(saved ? { saved } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    },
  };
}
