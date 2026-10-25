import { join, posix } from "node:path";
import { componentFiles } from "../../check/component-views";
import { stringRegions, withEmbedded } from "../../check/embedded";
import { listAngularFiles, type SourceFile } from "../../check/files";
import { expandHtml } from "../../check/html";
import { maskComments } from "../../check/mask";
import { readJson } from "../../project/package";
import type { WebStack } from "../web";
import { angularDoctor, angularUnsupported } from "./doctor";
import { withDarkClasses } from "./dark";
import { collectAngular } from "./extract";
import { angularWiring, generateAngular } from "./generate";
import { angularSrcDir, nxWorkspaceNote } from "./project";
import { discoverAngularRoutes } from "./routes";
import { angularFix, angularReducedMotionHits, scanAngular } from "./rules";
import { ANGULAR_BINDINGS, ANGULAR_GRAMMAR } from "./views";

const COMPONENT = /@Component\s*\(/;
const HTML_FILE = /\.html?$/i;
const TS_FILE = /\.ts$/i;
const STYLESHEET = /\.(?:css|scss|sass|less)$/i;
const STYLE_EXTENSIONS = [".css", ".scss", ".sass", ".less"];
/** A template: key of the decorator, whatever its value (an inline template, even an empty one). */
const TEMPLATE_KEY = /[{,]\s*["']?template["']?\s*:/;
const READ = { bindings: ANGULAR_BINDINGS, grammar: ANGULAR_GRAMMAR };

const isComponent = (file: SourceFile) => TS_FILE.test(file.path) && COMPONENT.test(maskComments(file.text, "script"));

/**
 * A component's own files among an app's, by path: its template (what templateUrl names, relative to its .ts; without
 * templateUrl or an inline template, the .html beside it of its own name) and its stylesheets (what styleUrl and
 * styleUrls name; without them, the stylesheet beside it of its own name).
 */
const owned = new WeakMap<SourceFile[], { templates: Set<string>; styles: Set<string> }>();
function componentFilesOf(files: SourceFile[]): { templates: Set<string>; styles: Set<string> } {
  const known = owned.get(files);
  if (known) return known;
  const found = { templates: new Set<string>(), styles: new Set<string>() };
  for (const f of files) {
    if (!isComponent(f)) continue;
    const dir = posix.dirname(f.path);
    const named = (key: string) => stringRegions(f.text, [key]).map((r) => posix.normalize(posix.join(dir, f.text.slice(r.start, r.end))));
    const templateUrl = named("templateUrl");
    for (const t of templateUrl) found.templates.add(t);
    if (templateUrl.length === 0 && !TEMPLATE_KEY.test(maskComments(f.text, "script"))) found.templates.add(f.path.replace(TS_FILE, ".html"));
    const styleUrls = [...named("styleUrl"), ...named("styleUrls")];
    for (const s of styleUrls) found.styles.add(s);
    if (styleUrls.length === 0) for (const ext of STYLE_EXTENSIONS) found.styles.add(f.path.replace(TS_FILE, ext));
  }
  owned.set(files, found);
  return found;
}

/**
 * A component's template (.html) as its CSS, script and markup, read through Angular's grammar; a component's .ts with
 * the strings its @Component holds (template:, styles:) read in place; a component's stylesheet as it is; each marked a
 * component's. Any other HTML (src/index.html) as the web reads it; other files (other stylesheets and code) as they are.
 * Every CSS view has its dark-theme class blocks (.dark-theme) marked dark.
 */
function angularViews(file: SourceFile, files?: SourceFile[]): SourceFile[] {
  return viewsOf(file, files).map(withDarkClasses);
}

function viewsOf(file: SourceFile, files?: SourceFile[]): SourceFile[] {
  const own = files ? componentFilesOf(files) : null;
  if (HTML_FILE.test(file.path) && own?.templates.has(file.path)) return componentFiles(file, READ).map((v) => ({ ...v, component: true as const }));
  if (STYLESHEET.test(file.path) && own?.styles.has(file.path)) return [{ ...file, component: true }];
  if (isComponent(file)) {
    const { css, script, markup, dark, spans } = withEmbedded(file.text, READ);
    return [
      { ...file, text: css, lang: "css", component: true, ...(dark.length > 0 ? { dark } : {}) },
      { ...file, text: script, lang: "script", spans },
      { ...file, text: markup, lang: "markup", component: true },
    ];
  }
  return expandHtml([file]);
}

/** A script that runs ng serve (or its alias ng s), directly or through npx: it takes --port. */
const NG_SERVE = /(?:^|[\s;&|(])ng\s+(?:serve|s)(?=\s|$)/;
const NO_NG_SERVE =
  'This app has no "start" script that runs ng serve, and no "dev" script. Add "start": "ng serve" to the scripts in its package.json, or start it yourself and pass its address with --url.';

/**
 * The app's "start" script when it runs ng serve (ng new writes "start": "ng serve"), else its "dev" script; either
 * given the port Motif chose when it runs ng serve (a --port of the script's own comes first, and the last one wins),
 * and --open=false, so a script's own -o never opens a browser tab on every motif shot.
 */
const SERVE_ARGS = (port: number) => ["--port", String(port), "--open=false"];
function angularDevScript(appDir: string, port: number): { script: string; args: string[] } | { error: string } {
  const scripts = readJson<{ scripts?: Record<string, unknown> }>(join(appDir, "package.json"))?.scripts ?? {};
  const runs = (name: string) => (typeof scripts[name] === "string" ? (scripts[name] as string) : null);
  const start = runs("start");
  if (start !== null && NG_SERVE.test(start)) return { script: "start", args: SERVE_ARGS(port) };
  const dev = runs("dev");
  if (dev !== null) return { script: "dev", args: NG_SERVE.test(dev) ? SERVE_ARGS(port) : [] };
  return { error: NO_NG_SERVE };
}

/**
 * ng serve builds the whole app before it prints its address (2.8 s for the angular-min fixture; a large app's first
 * build, or webpack's in Angular 14-16, can take minutes): the limit Nuxt has, not the web's 120 s.
 */
const NG_SERVE_TIMEOUT_MS = 180_000;
/** With no terminal, ng serve's "share pseudonymous usage data" question would wait for an answer that never comes. */
const NG_DEV_ENV = { NG_CLI_ANALYTICS: "false" };

/** The audit's fixes in Angular's terms: Motion (motion's animate) in code, CSS animations in a component's styles. */
const ANGULAR_AUDIT_FIXES = {
  motion: "Check matchMedia('(prefers-reduced-motion: reduce)') before animating with Motion, and keep CSS animations inside @media (prefers-reduced-motion: no-preference).",
};

/** Angular 15 or later, with the Angular CLI (or Nx). The parts that come later are filled in by their tasks. */
export const ANGULAR: WebStack = {
  id: "angular",
  extensions: [".ts", ".html", ".css", ".scss"],
  sourceFiles: (root, app, opts) => listAngularFiles(root, app.path, opts),
  views: angularViews,
  srcDir: angularSrcDir,
  generate: generateAngular,
  wiring: (root, app, files) => angularWiring(root, app, files, angularSrcDir),
  scan: scanAngular,
  appWide: angularReducedMotionHits,
  fix: angularFix,
  doctor: angularDoctor,
  unsupported: angularUnsupported,
  notOneApp: nxWorkspaceNote,
  collect: collectAngular,
  routes: discoverAngularRoutes,
  devScript: angularDevScript,
  devEnv: () => NG_DEV_ENV,
  startTimeoutMs: () => NG_SERVE_TIMEOUT_MS,
  variantHow: "motif.css, which follows data-variant on <html>",
  auditFixes: ANGULAR_AUDIT_FIXES,
};
