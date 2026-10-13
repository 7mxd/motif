import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { findBrowser, type BrowserInfo } from "../detect/browser";
import { detectApps, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { selectApps } from "../project/apps";
import { reviewJson, toFindings, type ReviewFinding } from "../shot/audit";
import { captureScreens, MAX_HEIGHT, type RouteResult } from "../shot/capture";
import { mockupFrames, pairWithMockup, pairWithSet, renderComparisons, type ComparePair, type Comparison } from "../shot/compare";
import { devCommand, startDevServer, type DevServer } from "../shot/devserver";
import { discoverRoutes, type RouteDiscovery } from "../stacks/react-web/routes";

export interface ShotDeps {
  findBrowser: () => BrowserInfo | null;
  devCommand: typeof devCommand;
  startDevServer: typeof startDevServer;
  capture: typeof captureScreens;
  compare: typeof renderComparisons;
  today: () => string;
}

const MAX_ROUTES = 12;
const INSTALL_HINT = '"motif browser install" downloads a private headless copy (about 100 MB) that only Motif uses.';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const defaultDeps: ShotDeps = {
  findBrowser: () => findBrowser(),
  devCommand,
  startDevServer,
  capture: captureScreens,
  compare: renderComparisons,
  today,
};

const usage = (text: string, data: Record<string, unknown>): CommandResult => ({ command: "shot", exitCode: 2, text, data });
const projectPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/") || ".";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rendered = (r: RouteResult) => !r.error && r.status >= 200 && r.status < 400;
const SET_NAME = /^(?!compare$)[a-z0-9][a-z0-9-]*$/i;
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
    const frames = mockupFrames(file);
    if (frames.length === 0) return { error: `There are no PNGs of this mockup yet. Make them first: motif preview ${value} --png-only` };
    return { kind: "mockup", file, frames };
  }
  return {
    error: `Nothing to compare with: "${value}" isn't a saved set of screenshots (keep one with --save ${SET_NAME.test(value) ? value : "before"}) or a mockup (.html or .png).`,
  };
}

/** "/, settings ,/about" → ["/", "/settings", "/about"] */
export function parseRoutes(value: string): string[] {
  const routes = value.split(",").map((r) => r.trim()).filter(Boolean).map((r) => (r.startsWith("/") ? r : `/${r}`));
  return [...new Set(routes)];
}

function routeLine(r: RouteResult, width: number): string {
  const what = rendered(r)
    ? `${r.shots.length} screenshots${r.finalUrl ? ` (went to ${new URL(r.finalUrl).pathname})` : ""}${r.cropped ? ` (cropped at ${MAX_HEIGHT} px)` : ""}`
    : `✗ ${r.error ?? `HTTP ${r.status}`}${r.shots.length > 0 ? " (the screenshots show the error page)" : ""}`;
  return `  ${r.route.padEnd(width)}  ${what}`;
}

function countText(findings: ReviewFinding[]): string {
  return (["critical", "major", "minor"] as const)
    .map((severity) => [severity, findings.filter((f) => f.severity === severity).length] as const)
    .filter(([, n]) => n > 0)
    .map(([severity, n]) => `${n} ${severity}`)
    .join(", ");
}

export async function runShot(cwd: string, ctx: RunContext, deps: ShotDeps = defaultDeps): Promise<CommandResult> {
  const flags = ctx.flags ?? {};
  const givenUrl = typeof flags.url === "string" ? flags.url : undefined;
  const audit = flags.audit === true;
  if (givenUrl !== undefined && !/^https?:\/\/\S+$/.test(givenUrl)) {
    return usage("--url needs the address of a running app, like http://localhost:3000.", { error: "usage" });
  }
  const browser = deps.findBrowser();
  if (!browser) {
    return usage(`No Chrome or Edge found, so Motif can't take screenshots. ${INSTALL_HINT}`, { error: "needs-browser", status: "needs_browser" });
  }

  const detected = detectApps(cwd).apps;
  const selected = selectApps(detected, ctx.app);
  if (selected === null) {
    return usage(`There's no app at "${ctx.app}". Apps here: ${detected.map((a) => a.path).join(", ") || "none"}.`, { error: "no-such-app" });
  }
  const app: AppInfo | undefined = selected.length === 1 ? selected[0] : undefined;
  if (!givenUrl) {
    if (selected.length === 0) {
      return usage("No app found in this folder. Run this inside your app's folder, or pass a running app's address with --url.", { error: "no-app" });
    }
    if (!app) return usage(`There are several apps here (${selected.map((a) => a.path).join(", ")}). Choose one with --app <path>.`, { error: "several-apps" });
    if (app.stack !== "react-web") {
      const what = app.stack ? `${STACK_LABELS[app.stack]} apps` : "this app";
      return usage(`Motif can't start ${what} for screenshots yet. Start it yourself and pass its address with --url.`, { error: "unsupported-stack" });
    }
  }
  const appDir = app ? join(cwd, app.path) : cwd;

  const discovery: RouteDiscovery =
    typeof flags.routes === "string"
      ? { routes: parseRoutes(flags.routes), skipped: [] }
      : app?.stack === "react-web"
        ? discoverRoutes(appDir)
        : { routes: ["/"], skipped: [] };
  if (discovery.routes.length === 0) return usage("--routes needs at least one page, like --routes /,/settings.", { error: "usage" });
  const routes = discovery.routes.slice(0, MAX_ROUTES);
  const notes: string[] = [];
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
  const against = typeof flags.against === "string" ? resolveAgainst(cwd, outDir, flags.against, routes.length) : undefined;
  if (against && "error" in against) return usage(against.error, { error: "usage" });

  let server: DevServer | undefined;
  let baseUrl = givenUrl;
  if (!baseUrl) {
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
    captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit });
  } catch (e) {
    return usage(`Couldn't take screenshots: ${message(e)}`, { error: "capture-failed" });
  } finally {
    await server?.stop();
  }

  const failed = captured.routes.filter((r) => !rendered(r));
  const shots = captured.routes.flatMap((r) => r.shots.map((s) => projectPath(cwd, s)));
  const width = Math.max(...captured.routes.map((r) => r.route.length));
  const lines = [
    shots.length > 0
      ? `✓ ${shots.length} screenshots of ${captured.routes.length} ${captured.routes.length === 1 ? "page" : "pages"} (phone and desktop, light and dark) in ${projectPath(cwd, outDir)}/`
      : "✗ No screenshots were taken.",
    ...captured.routes.map((r) => routeLine(r, width)),
  ];

  let findings: ReviewFinding[] = [];
  let auditFile: string | undefined;
  if (audit) {
    findings = toFindings(captured.issues.map((i) => ({ ...i, shot: projectPath(cwd, i.shot) })));
    const file = join(outDir, "audit.json");
    writeFileSync(file, JSON.stringify(reviewJson(findings, routes, deps.today()), null, 2) + "\n");
    auditFile = projectPath(cwd, file);
    lines.push(
      findings.length === 0
        ? `✓ Audit: no contrast, tap-target or reduced-motion problems found (${auditFile}).`
        : `✗ Audit: ${countText(findings)} (details in ${auditFile}):`,
    );
    for (const f of findings.slice(0, 15)) {
      const where = `${f.location.screen} (${f.location.viewport}${f.location.scheme ? `, ${f.location.scheme}` : ""})`;
      lines.push(`  ${f.severity.padEnd(8)} ${where} ${f.summary}`);
    }
    if (findings.length > 15) lines.push(`  …and ${findings.length - 15} more in ${auditFile}.`);
    for (const r of captured.routes) if (r.auditError) notes.push(`Couldn't finish the audit of ${r.route}: ${r.auditError}`);
  }

  const thisRun = captured.routes.flatMap((r) => r.shots);
  let comparisons: Comparison[] = [];
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
    }
    try {
      comparisons = await deps.compare({
        browserPath: browser.path,
        pairs,
        labels: against.kind === "set" ? [`Before ("${against.name}")`, "Now"] : ["Mockup", "The app now"],
        measure: against.kind === "set",
      });
    } catch (e) {
      notes.push(`Couldn't make the side-by-side images: ${message(e)}`);
    }
    const where = projectPath(cwd, compareDir);
    if (against.kind === "set") {
      const changed = comparisons.filter((c) => (c.changed ?? 0) >= 0.1);
      const newPart = added.length > 0 ? `, ${added.length} new` : "";
      lines.push(`Compared with "${against.name}": ${changed.length} changed, ${comparisons.length - changed.length} with no visible change${newPart} (side by side in ${where}/)`);
      for (const c of changed) lines.push(`  ${basename(c.after)}  ${c.changed}% different`);
    } else if (comparisons.length > 0) {
      lines.push(`Side by side with the mockup ${projectPath(cwd, against.file)}: ${comparisons.length} ${comparisons.length === 1 ? "image" : "images"} in ${where}/`);
    } else {
      notes.push("None of the mockup's frames matched these screenshots (phone frames pair with mobile, wider frames with desktop).");
    }
  }
  let saved: string | undefined;
  if (save) {
    const setDir = join(outDir, save);
    rmSync(setDir, { recursive: true, force: true });
    mkdirSync(setDir, { recursive: true });
    for (const shot of thisRun) copyFileSync(shot, join(setDir, basename(shot)));
    saved = projectPath(cwd, setDir);
    lines.push(`✓ Kept these screenshots as "${save}" (${saved}/). After changes, compare with --against ${save}.`);
  }
  lines.push(...notes.map((n) => `• ${n}`));

  return {
    command: "shot",
    exitCode: failed.length > 0 || findings.length > 0 ? 1 : 0,
    text: lines.join("\n"),
    data: {
      url: baseUrl,
      routes: captured.routes.map((r) => ({
        route: r.route,
        status: r.status,
        ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
        ...(r.error ? { error: r.error } : {}),
        shots: r.shots.map((s) => projectPath(cwd, s)),
      })),
      shots,
      skipped: discovery.skipped,
      ...(audit ? { findings, audit: auditFile } : {}),
      ...(against
        ? {
            comparisons: comparisons.map((c) => ({
              before: projectPath(cwd, c.before),
              after: projectPath(cwd, c.after),
              image: projectPath(cwd, c.out),
              ...(c.changed !== undefined ? { changed: c.changed } : {}),
            })),
            added: added.map((a) => projectPath(cwd, a)),
          }
        : {}),
      ...(saved ? { saved } : {}),
    },
  };
}
