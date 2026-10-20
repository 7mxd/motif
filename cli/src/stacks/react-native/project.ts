import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../../text";

function readJson(path: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(stripBom(readFileSync(path, "utf8")));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The version range of a package in an app's package.json (dependencies, then devDependencies), or null. */
export function declared(dir: string, name: string): string | null {
  const pkg = readJson(join(dir, "package.json"));
  for (const key of ["dependencies", "devDependencies"]) {
    const group = pkg?.[key];
    const v = group && typeof group === "object" ? (group as Record<string, unknown>)[name] : undefined;
    if (typeof v === "string") return v;
  }
  return null;
}

/** True when the app lists expo in its dependencies. */
export function isExpoApp(dir: string): boolean {
  const pkg = readJson(join(dir, "package.json"));
  const deps = pkg?.dependencies;
  return !!deps && typeof deps === "object" && "expo" in deps;
}

export function usesExpoRouter(dir: string): boolean {
  return declared(dir, "expo-router") !== null;
}

const major = (v: string): number | null => {
  const m = /(\d+)(?:\.|$)/.exec(v.replace(/^[^\d]*/, ""));
  return m ? Number(m[1]) : null;
};

/** The Expo SDK's major version: the installed expo package's, else the range in package.json; null when neither says. */
export function expoSdk(dir: string): number | null {
  const installed = readJson(join(dir, "node_modules", "expo", "package.json"))?.version;
  if (typeof installed === "string") {
    const n = major(installed);
    if (n !== null) return n;
  }
  const range = declared(dir, "expo");
  return range === null ? null : major(range);
}

/** Where the app's code lives relative to the app: "src" when it has a src folder, else "." (the app folder). */
export function srcRoot(dir: string): string {
  try {
    return statSync(join(dir, "src")).isDirectory() ? "src" : ".";
  } catch {
    return ".";
  }
}

const WEB_PACKAGES = ["react-dom", "react-native-web", "@expo/metro-runtime"];

/** The packages Expo's web target needs that the app doesn't list. */
export function hasWebSupport(dir: string): string[] {
  return WEB_PACKAGES.filter((p) => declared(dir, p) === null && !existsSync(join(dir, "node_modules", p, "package.json")));
}
