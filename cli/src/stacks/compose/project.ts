import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../../text";

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
  return text === null ? null : stripComments(text);
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

/** A Compose Android library (a shared UI module): never an app of its own. */
export function composeLibrary(dir: string): { namespace: string | null; sourceRoot: string } | null {
  return module(dir, LIBRARY);
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
