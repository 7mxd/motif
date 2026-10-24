import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stripBom } from "../text";

/** What an app's package.json and node_modules say: declared ranges, installed versions, the package manager. */

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

/** Where package.json's "imports" sends a subpath import ("#lib/*" → "./src/lib/*"), when it names one path; else null. */
export function subpathImport(dir: string, specifier: string): string | null {
  const imports = readJson(join(dir, "package.json"))?.imports;
  const target = imports && typeof imports === "object" ? (imports as Record<string, unknown>)[specifier] : undefined;
  return typeof target === "string" ? target : null;
}

/** The version of a package installed in the app's node_modules, or null. */
export function installedVersion(dir: string, name: string): string | null {
  const v = readJson(join(dir, "node_modules", name, "package.json"))?.version;
  return typeof v === "string" ? v : null;
}

export interface PackageVersion {
  major: number;
  minor: number | null;
}

/** 4.6 from "4.6.2" or "^4.6.0", 3 from "^3"; null when the text names no version ("latest", "workspace:*"). */
function majorMinor(v: string): PackageVersion | null {
  const m = /^[^\d]*(\d+)(?:\.(\d+))?/.exec(v);
  return m ? { major: Number(m[1]), minor: m[2] === undefined ? null : Number(m[2]) } : null;
}

/** A package's version as the app has it: the installed package's, else the range in package.json; null when neither says. */
export function packageVersion(dir: string, name: string): PackageVersion | null {
  const installed = installedVersion(dir, name);
  const fromInstalled = installed === null ? null : majorMinor(installed);
  if (fromInstalled) return fromInstalled;
  const range = declared(dir, name);
  return range === null ? null : majorMinor(range);
}

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export const LOCKFILES: [string, PackageManager][] = [
  ["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"],
];

/** The app folder, or in a monorepo the workspace root above it, where the lockfile and node_modules live. */
export function installRoot(appDir: string): string {
  let dir = appDir;
  for (let i = 0; i < 5; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    if (existsSync(join(dir, "pnpm-workspace.yaml")) || readJson(join(dir, "package.json"))?.workspaces) return dir;
  }
  return appDir;
}

const lockfileIn = (dir: string) => LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1];

/** The app's package manager, by its lockfile (or, in a monorepo, the workspace root's): npm when there is none. */
export function packageManager(appDir: string): PackageManager {
  return lockfileIn(appDir) ?? lockfileIn(installRoot(appDir)) ?? "npm";
}

/** The command that adds packages to the app, in its package manager's words. */
export const addPackages = (pm: PackageManager, packages: string) => `${pm} ${pm === "npm" ? "install" : "add"} ${packages}`;

/** The text of the first <base>.<ext> config file the app has (nuxt.config.ts, svelte.config.js), or null. */
export function readConfig(appDir: string, base: string): string | null {
  for (const ext of ["ts", "js", "mjs", "mts", "cjs", "cts"]) {
    const path = join(appDir, `${base}.${ext}`);
    if (existsSync(path)) {
      try {
        return stripBom(readFileSync(path, "utf8"));
      } catch {}
    }
  }
  return null;
}
