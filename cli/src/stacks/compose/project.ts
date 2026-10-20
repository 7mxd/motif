import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AppInfo } from "../../detect/stacks";
import { prefixPath } from "../../project/apps";
import { andList, stripBom } from "../../text";
import { RESERVED } from "../naming";

function read(path: string): string | null {
  try {
    return stripBom(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** A Gradle build file's text without its comments, or null when the folder has none. */
function buildFile(dir: string): string | null {
  const text = read(join(dir, "build.gradle.kts")) ?? read(join(dir, "build.gradle"));
  // A root file's `alias(...) apply false` lines only make plugins available to its modules; they aren't the root's own.
  return text === null ? null : stripComments(text).replace(/^.*\bapply\s+false\b.*$/gm, "");
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

const APPLICATION = /com\.android\.application|android[._-]?application/i;
const LIBRARY = /com\.android\.library|android[._-]?library/i;
const COMPOSE = /\bcompose\s*(=\s*)?true\b|org\.jetbrains\.kotlin\.plugin\.compose|alias\s*\([^)]*compose[^)]*\)/i;

function module(dir: string, plugin: RegExp): { namespace: string | null; sourceRoot: string } | null {
  const text = buildFile(dir);
  if (text === null || !plugin.test(text) || !COMPOSE.test(text)) return null;
  const namespace =
    text.match(/\bnamespace\s*=?\s*["']([^"']+)["']/)?.[1] ??
    read(join(dir, "src", "main", "AndroidManifest.xml"))?.match(/\bpackage\s*=\s*"([^"]+)"/)?.[1] ??
    null;
  const sourceRoot = existsSync(join(dir, "src", "main", "java")) ? "src/main/java" : "src/main/kotlin";
  return { namespace, sourceRoot };
}

/** A folder that builds a Compose Android app: the Android application plugin, and Compose switched on. */
export function composeModule(dir: string): { namespace: string | null; sourceRoot: string } | null {
  return module(dir, APPLICATION);
}

/** The Kotlin Multiplatform plugin: kotlin("multiplatform"), org.jetbrains.kotlin.multiplatform, or a catalogue alias for it. */
const MULTIPLATFORM = /org\.jetbrains\.kotlin\.multiplatform|\bkotlin\s*\(\s*["']multiplatform["']\s*\)|kotlin[._-]?multiplatform/i;

/** A module built with Kotlin Multiplatform (Compose Multiplatform's composeApp, say). */
export function multiplatformModule(dir: string): boolean {
  const text = buildFile(dir);
  return text !== null && MULTIPLATFORM.test(text);
}

/** A Compose Android library (a shared UI module): never an app of its own. */
export function composeLibrary(dir: string): { namespace: string | null; sourceRoot: string } | null {
  return module(dir, LIBRARY);
}

/** A module's build file name (build.gradle.kts or build.gradle) and its text without comments, or null when it has none. */
export function moduleBuild(dir: string): { name: string; text: string } | null {
  for (const name of ["build.gradle.kts", "build.gradle"]) {
    const text = read(join(dir, name));
    if (text !== null) return { name, text: stripComments(text) };
  }
  return null;
}

/**
 * Where an app's theme code goes, relative to the project root (themeDir from motif.json wins):
 * <module>/<sourceRoot>/<namespace path>/ui/motif, so the theme sits in the app's own package.
 */
export function composeThemeDir(root: string, app: AppInfo): string {
  if (app.themeDir) return app.themeDir;
  const mod = composeModule(join(root, app.path));
  const sourceRoot = mod?.sourceRoot ?? "src/main/java";
  const pkg = mod?.namespace ? `${packageFolder(mod.namespace)}/` : "";
  return prefixPath(app.path, `${sourceRoot}/${pkg}ui/motif`);
}

/** The Gradle project root a module belongs to: the module's folder or the nearest one above it with a settings file. */
export function gradleRoot(dir: string, top: string): string {
  let at = resolve(dir);
  const stop = resolve(top);
  for (let i = 0; i < 8; i++) {
    if (settingsFile(at) !== null) return at;
    const up = dirname(at);
    if (at === stop || up === at) break;
    at = up;
  }
  return resolve(dir);
}

/** The Kotlin package of a folder inside a source folder (app/src/main/java/com/example/ui → com.example.ui), or null outside one. */
export function folderPackage(dir: string): string | null {
  const m = `/${dir.replace(/\\/g, "/").replace(/\/+$/, "")}`.match(/\/src\/[^/]+\/(?:java|kotlin)(?:\/(.*))?$/);
  return m ? (m[1] ?? "").split("/").filter(Boolean).join(".") : null;
}

/** The first part of a folder's package that Kotlin won't take as a name (my-theme, in), or null when every part is fine. */
export function badPackagePart(dir: string): string | null {
  const pkg = folderPackage(dir);
  if (!pkg) return null;
  return pkg.split(".").find((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) || RESERVED.kotlin.has(part)) ?? null;
}

/** com.example.rafiq becomes com/example/rafiq. */
export function packageFolder(namespace: string): string {
  return namespace.split(".").join("/");
}

function settingsFile(dir: string): string | null {
  const text = read(join(dir, "settings.gradle.kts")) ?? read(join(dir, "settings.gradle"));
  return text === null ? null : stripComments(text);
}

/** The folders a Gradle settings file includes (include(":app", ":feature:home") is app and feature/home). */
function includedFolders(dir: string): string[] {
  const text = settingsFile(dir);
  if (text === null) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/\binclude\s*\(?\s*((?:["'][^"'\n]+["']\s*,?\s*)+)/g)) {
    for (const s of m[1]!.matchAll(/["']([^"']+)["']/g)) {
      const folder = s[1]!.replace(/^:+/, "").split(":").filter(Boolean).join("/");
      if (folder && !out.includes(folder)) out.push(folder);
    }
  }
  return out;
}

/** The Gradle paths a settings file includes (include(":app", ":feature:home") is :app and :feature:home). */
function includedPaths(dir: string): string[] {
  const text = settingsFile(dir);
  if (text === null) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/\binclude\s*\(?\s*((?:["'][^"'\n]+["']\s*,?\s*)+)/g)) {
    for (const s of m[1]!.matchAll(/["']([^"']+)["']/g)) {
      const path = `:${s[1]!.replace(/^:+/, "")}`;
      if (path !== ":" && !out.includes(path)) out.push(path);
    }
  }
  return out;
}

/** project(":app").projectDir = file("android/app"), or = new File(settingsDir, 'android/app') in Groovy. */
const PROJECT_DIR =
  /\bproject\s*\(\s*["'](:[^"']*)["']\s*\)\s*\.\s*projectDir\s*=\s*(?:file\s*\(|(?:new\s+)?(?:java\.io\.)?File\s*\(\s*(?:settingsDir|rootDir|rootProject\.projectDir)\s*,)\s*["']([^"']+)["']\s*\)/g;

/** The folders a settings file maps Gradle paths to (project(":app").projectDir = …), relative to its folder, by path. */
export function settingsProjectDirs(dir: string): Map<string, string> {
  return new Map([...(settingsFile(dir)?.matchAll(PROJECT_DIR) ?? [])].map((m) => [m[1]!, m[2]!]));
}

/** A module's folder by its Gradle path: the one the settings file maps it to, else its path's own (:core:ui is core/ui). */
function projectFolder(projectDir: string, path: string): string {
  return resolve(projectDir, settingsProjectDirs(projectDir).get(path) ?? path.split(":").filter(Boolean).join("/"));
}

/** A Gradle path or a type-safe accessor's part, compared as Gradle's accessors name it: core-ui and coreUi are alike. */
const accessorKey = (part: string) => part.replace(/[-_]/g, "").toLowerCase();

/**
 * The project modules a build file depends on, by Gradle path: project(":core:ui"), project(path = ":core:ui"), and
 * type-safe accessors (projects.core.ui), matched to the paths the settings file includes.
 */
function projectDependencies(text: string, included: string[]): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\bproject\s*\(\s*(?:path\s*[=:]\s*)?["'](:[^"']+)["']/g)) out.add(m[1]!);
  for (const m of text.matchAll(/\bprojects((?:\s*\.\s*[A-Za-z_]\w*)+)/g)) {
    const parts = m[1]!.split(".").map((p) => p.trim()).filter(Boolean);
    const key = parts.map(accessorKey).join(":");
    const path = included.find((p) => p.split(":").filter(Boolean).map(accessorKey).join(":") === key);
    if (path) out.add(path);
  }
  return [...out];
}

/**
 * The Compose library modules (com.android.library with Compose) an app module depends on, by Gradle path, sorted, with
 * those of the modules it depends on in turn. Motif reads an app module's own code only, so these are what it leaves out.
 */
export function composeLibraryDependencies(projectDir: string, moduleDir: string): string[] {
  const included = includedPaths(projectDir);
  const seen = new Set<string>();
  const libraries = new Set<string>();
  const visit = (dir: string, depth: number) => {
    const build = buildFile(dir);
    if (build === null || depth > 8) return;
    for (const path of projectDependencies(build, included)) {
      if (seen.has(path)) continue;
      seen.add(path);
      const folder = projectFolder(projectDir, path);
      if (resolve(folder) === resolve(moduleDir)) continue;
      if (composeLibrary(folder)) libraries.add(path);
      visit(folder, depth + 1);
    }
  };
  visit(moduleDir, 0);
  return [...libraries].sort();
}

/** The note for an app whose Compose library modules weren't read: what Motif left out, then what that means for the command. */
export function unreadModulesNote(root: string, appPath: string, consequence: string): string | null {
  const moduleDir = resolve(root, appPath);
  const libraries = composeLibraryDependencies(gradleRoot(moduleDir, root), moduleDir);
  if (libraries.length === 0) return null;
  const label = appPath === "." ? "This app" : appPath;
  return `${label} depends on Compose modules Motif doesn't read yet (${andList(libraries)}): ${consequence}`;
}

/** The modules a Gradle project root includes that are Compose apps (folders relative to the root). */
export function composeModules(dir: string): string[] {
  return includedFolders(dir).filter((f) => composeModule(join(dir, f)) !== null);
}

/**
 * Where the Compose apps of a folder are, relative to it: its included modules ("app"), the folder itself ("."), or none.
 * Null when the folder isn't a Gradle project root and says nothing more than it did before (a single-module app).
 */
export function composeAppFolders(dir: string): string[] | null {
  if (settingsFile(dir) === null) return composeLibrary(dir) && !composeModule(dir) ? [] : null;
  const modules = composeModules(dir);
  if (modules.length > 0) return modules;
  return composeModule(dir) ? ["."] : [];
}
