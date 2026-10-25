import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { packageVersion, readJson } from "../../project/package";
import { stripBom } from "../../text";

/** Angular's major version: the installed @angular/core's, else the range in package.json; null when neither says. */
export function angularMajor(appDir: string): number | null {
  return packageVersion(appDir, "@angular/core")?.major ?? null;
}

/** The application project Motif reads, from angular.json (or an Nx project.json), its paths relative to the app folder. */
export interface AngularProject {
  name: string;
  root: string;
  sourceRoot: string;
  /** The entry point: the build's browser option (@angular/build:application), or main for the older builders. */
  main?: string;
  /** The global stylesheets the build includes (src/styles.css). */
  styles: string[];
  /** The build target's builder (@angular/build:application) and the serve target's (@angular/build:dev-server). */
  build?: string;
  serve?: string;
  /** What components' inline styles are written in: css, unless the build says scss, sass or less. */
  inlineStyleLanguage: string;
}

interface Target {
  builder?: unknown;
  executor?: unknown;
  options?: { browser?: unknown; main?: unknown; styles?: unknown; inlineStyleLanguage?: unknown };
}

interface ProjectConfig {
  name?: unknown;
  projectType?: unknown;
  root?: unknown;
  sourceRoot?: unknown;
  architect?: Record<string, Target | undefined>;
  targets?: Record<string, Target | undefined>;
}

const tidy = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** The Nx workspace an app folder is in: the nearest folder at or above it with nx.json, or null. */
function nxWorkspace(appDir: string): string | null {
  let dir = appDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "nx.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readProject(name: string, p: ProjectConfig, path: (p: string) => string): AngularProject {
  const targets = p.architect ?? p.targets ?? {};
  const tool = (t: Target | undefined) => str(t?.builder) ?? str(t?.executor);
  const options = targets.build?.options ?? {};
  const root = str(p.root);
  const appRoot = root === undefined ? "." : path(root);
  const sourceRoot = str(p.sourceRoot);
  const main = str(options.browser) ?? str(options.main);
  const styles = (Array.isArray(options.styles) ? options.styles : [])
    .map((s: unknown) => str(s) ?? str((s as { input?: unknown } | null)?.input))
    .filter((s): s is string => s !== undefined)
    .map(path);
  const build = tool(targets.build);
  const serve = tool(targets.serve);
  return {
    name,
    root: appRoot,
    sourceRoot: sourceRoot !== undefined ? path(sourceRoot) : appRoot === "." ? "src" : `${appRoot}/src`,
    ...(main !== undefined ? { main: path(main) } : {}),
    styles,
    ...(build !== undefined ? { build } : {}),
    ...(serve !== undefined ? { serve } : {}),
    inlineStyleLanguage: str(options.inlineStyleLanguage) ?? "css",
  };
}

/**
 * The app's first application project in angular.json (a library is never the app), or in an Nx project.json, whose
 * paths are relative to the Nx workspace; null when there is neither, or no application in it.
 */
export function angularProject(appDir: string): AngularProject | null {
  const workspace = readJson<{ projects?: Record<string, ProjectConfig | null> }>(join(appDir, "angular.json"));
  if (workspace) {
    for (const [name, p] of Object.entries(workspace.projects ?? {})) {
      if (p && typeof p === "object" && p.projectType === "application") return readProject(name, p, tidy);
    }
    return null;
  }
  const nx = readJson<ProjectConfig>(join(appDir, "project.json"));
  if (nx?.projectType !== "application") return null;
  const base = nxWorkspace(appDir) ?? appDir;
  return readProject(str(nx.name) ?? basename(appDir), nx, (p) => tidy(relative(appDir, join(base, p))));
}

/** Where an Angular app's source lives relative to the app: its project's sourceRoot, else src. */
export function angularSrcDir(appDir: string): string {
  return angularProject(appDir)?.sourceRoot ?? "src";
}

/** The folder `ng new` puts the app's components in: <sourceRoot>/app. */
export function appFolder(appDir: string): string {
  const src = angularSrcDir(appDir);
  return src === "." ? "app" : `${src}/app`;
}

/** True when the app starts with bootstrapApplication (standalone components) in its main.ts, not an NgModule. */
export function isStandalone(appDir: string): boolean {
  const main = angularProject(appDir)?.main ?? `${angularSrcDir(appDir)}/main.ts`;
  try {
    return /\bbootstrapApplication\s*\(/.test(stripBom(readFileSync(join(appDir, main), "utf8")));
  } catch {
    return false;
  }
}
