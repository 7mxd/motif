import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { BROWSER_OFF, browserOff, findBrowser, type BrowserInfo } from "../detect/browser";
import { detectApps, siteDir, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { noSuchApp, selectApps } from "../project/apps";
import { reviewJson, toFindings, type ReviewFinding } from "../shot/audit";
import { captureScreens, describeSizes, MAX_HEIGHT, parseSizes, type RouteResult, type StateScript, type Viewport } from "../shot/capture";
import { missingStateFrames, mockupFrames, pairWithMockup, pairWithSet, renderComparisons, type ComparePair, type Comparison } from "../shot/compare";
import { devCommand, startDevServer, type DevServer } from "../shot/devserver";
import { startStaticServer, type StaticServer } from "../shot/static-server";
import { discoverPlainRoutes } from "../stacks/plain-web/routes";
import { discoverRoutes, type RouteDiscovery } from "../stacks/react-web/routes";

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
}

const MAX_ROUTES = 12;
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
  if (!r.finalUrl) return r.route;
  const from = new URL(r.url).pathname.replace(/\/+$/, "");
  const to = new URL(r.finalUrl).pathname.replace(/\/+$/, "");
  return from === to ? r.route : to || "/";
}

function routeLine(r: RouteResult, width: number): string {
  const what = rendered(r)
    ? `${r.shots.length} screenshots${r.finalUrl ? ` (went to ${new URL(r.finalUrl).pathname})` : ""}${r.cropped ? ` (cropped at ${MAX_HEIGHT} px)` : ""}`
    : r.loading && !r.error && !r.pageErrors?.length
      ? `✗ ${r.loading}`
      : `✗ ${r.error ?? (r.pageErrors?.length ? `the page threw an error: ${r.pageErrors[0]}` : `HTTP ${r.status}`)}${r.shots.length > 0 ? " (the screenshots show what it looked like)" : ""}`;
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
    states.push({ name, script: readFileSync(abs, "utf8") });
  }
  return states;
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
  let viewports: Viewport[] | undefined;
  if (typeof flags.sizes === "string") {
    const sizes = parseSizes(flags.sizes);
    if ("error" in sizes) return usage(sizes.error, { error: "usage" });
    viewports = sizes;
  }
  const browser = deps.findBrowser();
  if (!browser) {
    if (deps.browserOff?.()) {
      return usage(`${BROWSER_OFF}, so Motif can't take screenshots. Unset MOTIF_BROWSER to use Chrome or Edge.`, { error: "browser-off", status: "browser_off" });
    }
    return usage(`No Chrome or Edge found, so Motif can't take screenshots. ${INSTALL_HINT}`, { error: "needs-browser", status: "needs_browser" });
  }

  const { apps: detected, findings: settingProblems } = detectApps(cwd);
  const selected = selectApps(detected, ctx.app);
  if (selected === null) {
    return usage(noSuchApp(ctx.app, detected), { error: "no-such-app" });
  }
  const app: AppInfo | undefined = selected.length === 1 ? selected[0] : undefined;
  if (!givenUrl) {
    if (selected.length === 0) {
      return usage("No app found in this folder. Run this inside your app's folder, or pass a running app's address with --url.", { error: "no-app" });
    }
    if (!app) return usage(`There are several apps here (${selected.map((a) => a.path).join(", ")}). Choose one with --app <path>.`, { error: "several-apps" });
    if (app.stack !== "react-web" && app.stack !== "plain-web") {
      const what = app.stack ? `${STACK_LABELS[app.stack]} apps` : "this app";
      return usage(`Motif can't start ${what} for screenshots yet. Start it yourself and pass its address with --url.`, { error: "unsupported-stack" });
    }
  }
  const appDir = app ? join(cwd, app.path) : cwd;
  const siteFolderPath = app?.stack === "plain-web" ? join(appDir, siteDir(cwd, app)) : undefined;

  const discovery: RouteDiscovery =
    typeof flags.routes === "string"
      ? { routes: parseRoutes(flags.routes), skipped: [] }
      : app?.stack === "react-web"
        ? discoverRoutes(appDir)
        : siteFolderPath
          ? discoverPlainRoutes(siteFolderPath)
          : { routes: ["/"], skipped: [] };
  if (discovery.routes.length === 0) return usage("--routes needs at least one page, like --routes /,/settings.", { error: "usage" });
  const filePath = discovery.routes.find((r) => /^\/[A-Za-z]:[\\/]/.test(r));
  if (filePath) {
    return usage(
      `--routes got a file path (${filePath.slice(1)}), not a page address. Git Bash on Windows rewrites arguments that start with "/": put MSYS_NO_PATHCONV=1 in front of the command.`,
      { error: "usage" },
    );
  }
  const routes = discovery.routes.slice(0, MAX_ROUTES);
  const notes: string[] = settingProblems.map((f) => f.message);
  if (discovery.routes.length > routes.length) {
    notes.push(`Captured the first ${MAX_ROUTES} of ${discovery.routes.length} pages. Choose others with --routes.`);
  }
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
  const against = typeof flags.against === "string" ? resolveAgainst(cwd, outDir, flags.against, routes.length) : undefined;
  if (against && "error" in against) return usage(against.error, { error: "usage" });

  let server: DevServer | undefined;
  let site: StaticServer | undefined;
  let baseUrl = givenUrl;
  if (!baseUrl && siteFolderPath) {
    site = deps.serveStatic(siteFolderPath);
    baseUrl = site.url;
  } else if (!baseUrl) {
    const how = deps.devCommand(appDir);
    if ("error" in how) return usage(how.error, { error: "cant-start" });
    try {
      server = await deps.startDevServer({ cwd: appDir, command: how.command });
    } catch (e) {
      return usage(`Couldn't start the app with "${how.display}". ${message(e)}`, { error: "dev-server-failed" });
    }
    baseUrl = server.url;
  }

  let captured: Awaited<ReturnType<typeof captureScreens>>;
  try {
    mkdirSync(outDir, { recursive: true });
    const ignore = join(outDir, ".gitignore");
    if (typeof flags.out !== "string" && !existsSync(ignore)) {
      writeFileSync(ignore, "# Screenshots of the running app (motif shot). Not committed.\n*\n");
    }
    captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit, states, ...(viewports ? { viewports } : {}) });
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
      ? `✓ ${shots.length} screenshots of ${captured.routes.length} ${captured.routes.length === 1 ? "page" : "pages"} (${describeSizes(viewports)}, light and dark) in ${projectPath(cwd, outDir)}/`
      : "✗ No screenshots were taken.",
    ...captured.routes.map((r) => routeLine(r, width)),
  ];

  let findings: ReviewFinding[] = [];
  let auditFile: string | undefined;
  if (audit) {
    // A page that redirected (to a sign-in page, say) was audited as the page it landed on.
    const landed = new Map(captured.routes.map((r) => [r.route, landedOn(r)]));
    findings = toFindings(captured.issues.map((i) => ({ ...i, route: landed.get(i.route) ?? i.route, shot: projectPath(cwd, i.shot) })));
    const redirected = captured.routes.filter((r) => landedOn(r) !== r.route);
    if (redirected.length > 0) {
      notes.push(`Pages that redirected were audited as the page they landed on: ${redirected.map((r) => `${r.route} → ${landedOn(r)}`).join(", ")}.`);
    }
    const file = join(outDir, "audit.json");
    writeFileSync(file, JSON.stringify(reviewJson(findings, routes, deps.today()), null, 2) + "\n");
    auditFile = projectPath(cwd, file);
    const incomplete = captured.routes.filter((r) => r.auditError);
    if (incomplete.length > 0) {
      lines.push(`✗ Audit incomplete: it couldn't finish on ${incomplete.map((r) => `${r.route} (${r.auditError})`).join(", ")}.`);
    }
    if (findings.length > 0) lines.push(`✗ Audit: ${countText(findings)} (details in ${auditFile}):`);
    else if (incomplete.length === 0) lines.push(`✓ Audit: no contrast, tap-target or reduced-motion problems found (${auditFile}).`);
    for (const f of findings.slice(0, 15)) {
      const where = `${f.location.screen}${f.location.state ? ` in "${f.location.state}"` : ""} (${f.location.viewport}${f.location.scheme ? `, ${f.location.scheme}` : ""})`;
      lines.push(`  ${f.severity.padEnd(8)} ${where} ${f.summary}`);
    }
    if (findings.length > 15) lines.push(`  …and ${findings.length - 15} more in ${auditFile}.`);
  }

  const thisRun = captured.routes.flatMap((r) => r.shots);
  // What --sizes left out that a check or a mockup's frames need.
  if (viewports) {
    const phones = viewports.some((v) => v.mobile);
    const desktop = viewports.some((v) => !v.mobile);
    if (audit && !desktop) notes.push("The reduced-motion check runs at the desktop size, which --sizes left out.");
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
      for (const state of missingStateFrames(against.frames, thisRun)) {
        notes.push(`The mockup also shows "${state}", which this run didn't capture: add --state with its script (design/states/${state}.js).`);
      }
    }
    try {
      comparisons = await deps.compare({
        browserPath: browser.path,
        pairs,
        labels: against.kind === "set" ? [against.name === "before" ? "Before" : `Before ("${against.name}")`, "Now"] : ["Mockup", "The app now"],
        measure: against.kind === "set",
      });
    } catch (e) {
      compareError = message(e);
      notes.push(`Couldn't make the side-by-side images: ${compareError}`);
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
      ...(audit ? { findings, audit: auditFile } : {}),
      ...(against
        ? {
            comparisons: comparisons.map((c) => ({
              before: projectPath(cwd, c.before),
              after: projectPath(cwd, c.after),
              image: projectPath(cwd, c.out),
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
