import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { packageVersion, readJson, type PackageVersion } from "../../project/package";
import { stripBom } from "../../text";

/**
 * @angular/core's version: the installed package's, else the range in package.json; an app with no package.json of its
 * own (an Nx app, a project of an angular.json above it) has the workspace's. Null when none says.
 */
export function angularVersion(appDir: string): PackageVersion | null {
  const own = packageVersion(appDir, "@angular/core");
  if (own !== null || existsSync(join(appDir, "package.json"))) return own;
  const workspace = workspaceAbove(appDir, "nx.json") ?? workspaceAbove(dirname(appDir), "angular.json");
  return workspace === null ? null : packageVersion(workspace, "@angular/core");
}

/** Angular's major version (angularVersion's); null when nothing says. */
export function angularMajor(appDir: string): number | null {
  return angularVersion(appDir)?.major ?? null;
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

/** The workspace a folder is in: the nearest folder at or above it with the file (nx.json, angular.json), or null. */
function workspaceAbove(appDir: string, marker: string): string | null {
  let dir = appDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, marker))) return dir;
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

type Workspace = { projects?: Record<string, ProjectConfig | null> };

/** The application projects of an angular.json (never a library), in its order. */
function applications(workspace: Workspace | null): [string, ProjectConfig][] {
  return Object.entries(workspace?.projects ?? {}).filter((e): e is [string, ProjectConfig] => {
    const p = e[1];
    return p !== null && typeof p === "object" && p.projectType === "application";
  });
}

/**
 * The app's first application project in angular.json (a library is never the app), or in an Nx project.json, whose
 * paths are relative to the Nx workspace; for a folder with neither, the application project of an angular.json above
 * it whose root is that folder (design/motif.json naming projects/admin). Null when there is none.
 */
export function angularProject(appDir: string): AngularProject | null {
  const workspace = readJson<Workspace>(join(appDir, "angular.json"));
  if (workspace) {
    const [first] = applications(workspace);
    return first ? readProject(first[0], first[1], tidy) : null;
  }
  const nx = readJson<ProjectConfig>(join(appDir, "project.json"));
  if (nx === null) {
    const above = workspaceAbove(dirname(appDir), "angular.json");
    if (above === null) return null;
    const folder = tidy(relative(above, appDir));
    const own = applications(readJson<Workspace>(join(above, "angular.json"))).find(([, p]) => tidy(str(p.root) ?? ".") === folder);
    return own ? readProject(own[0], own[1], (p) => tidy(relative(appDir, join(above, p)))) : null;
  }
  if (nx.projectType !== "application") return null;
  const base = workspaceAbove(appDir, "nx.json") ?? appDir;
  return readProject(str(nx.name) ?? basename(appDir), nx, (p) => tidy(relative(appDir, join(base, p))));
}

/** Where an Angular app's source lives relative to the app: its project's sourceRoot, else src. */
export function angularSrcDir(appDir: string): string {
  return angularProject(appDir)?.sourceRoot ?? "src";
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

/**
 * When angular.json has more than one application project: which one Motif reads, and how to name another (by its
 * folder in design/motif.json, which angularProject reads from the angular.json above it). Null otherwise.
 */
export function projectChoiceNote(appDir: string): string | null {
  const apps = applications(readJson<Workspace>(join(appDir, "angular.json")));
  if (apps.length < 2) return null;
  const [[first], ...others] = apps;
  const other = others.find(([, p]) => tidy(str(p.root) ?? ".") !== ".") ?? others[0]!;
  const folder = tidy(str(other[1].root) ?? ".");
  return `angular.json has ${apps.length} application projects, and Motif reads the first, ${first}. To read ${others.map(([n]) => n).join(", ")} instead or as well, name it in design/motif.json's "apps" by its folder: { "path": "${folder}", "stack": "angular" }.`;
}

/** The Nx application projects under a workspace (a project.json with projectType application), by folder, a few levels deep. */
function nxApplications(root: string): string[] {
  const found: string[] = [];
  const walk = (rel: string, depth: number) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    const project = rel === "" ? null : readJson<ProjectConfig>(join(root, rel, "project.json"));
    // An application built by Angular's builders (@angular/build, @nx/angular), not another stack's.
    if (project?.projectType === "application" && /angular/.test(JSON.stringify(project.targets ?? project.architect ?? {}))) found.push(rel);
    if (depth >= 3) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && !["node_modules", "dist", "tmp", "coverage"].includes(e.name)) walk(rel === "" ? e.name : `${rel}/${e.name}`, depth + 1);
    }
  };
  walk("", 0);
  return found.sort();
}

/**
 * At an Nx workspace's root with no Angular project of its own (an integrated workspace, whose apps have a project.json
 * and no package.json): Motif reads one app at a time, named in design/motif.json. Null for any other folder.
 */
export function nxWorkspaceNote(appDir: string): string | null {
  if (!existsSync(join(appDir, "nx.json")) || angularProject(appDir) !== null) return null;
  const apps = nxApplications(appDir);
  const shown = apps.length > 1 ? ` (its apps: ${apps.join(", ")})` : "";
  return `This is an Nx workspace, and Motif reads one app at a time: name each Angular app in design/motif.json's "apps", as { "path": "${apps[0] ?? "apps/web"}", "stack": "angular" }${shown}.`;
}
