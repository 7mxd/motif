import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../../text";
import { declared } from "../react-native/project";

function installedVersion(dir: string, name: string): string | null {
  try {
    const v = JSON.parse(stripBom(readFileSync(join(dir, "node_modules", name, "package.json"), "utf8")))?.version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
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

/** True when the app lists nuxt in its dependencies or devDependencies. */
export function isNuxt(appDir: string): boolean {
  return declared(appDir, "nuxt") !== null;
}

/** Nuxt's major version, or null when the app isn't Nuxt or no version can be read. */
export function nuxtMajor(appDir: string): number | null {
  return packageVersion(appDir, "nuxt")?.major ?? null;
}

/** Vue's major version. Nuxt implies Vue 3 (Nuxt 2: Vue 2) when the app doesn't list vue itself. */
export function vueMajor(appDir: string): number | null {
  const vue = packageVersion(appDir, "vue");
  if (vue) return vue.major;
  const nuxt = nuxtMajor(appDir);
  return nuxt === null ? null : nuxt >= 3 ? 3 : 2;
}

const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** The text of the first <base>.<ext> config file the app has, or null. */
function readConfig(appDir: string, base: string): string | null {
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

/**
 * Where a Nuxt app's source lives relative to the app: srcDir from nuxt.config.* when it is a string literal; else app
 * when Nuxt is 4 or later and app/ exists; else the app folder itself (Nuxt 3).
 */
export function nuxtSrcDir(appDir: string): string {
  const literal = /\bsrcDir\s*:\s*(["'`])([^"'`$\n]*)\1\s*[,}\n]/.exec(readConfig(appDir, "nuxt.config") ?? "")?.[2];
  if (literal !== undefined) {
    const dir = literal.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    return dir === "" ? "." : dir;
  }
  return (nuxtMajor(appDir) ?? 0) >= 4 && isDir(join(appDir, "app")) ? "app" : ".";
}

/** Where a Vue app's source lives relative to the app: Nuxt's source folder, else src. */
export function vueSrcDir(appDir: string): string {
  return isNuxt(appDir) ? nuxtSrcDir(appDir) : "src";
}

/** True when the app's routes come from its files: Nuxt, or a Vite config importing vue-router/vite or unplugin-vue-router/vite. */
export function usesFileRoutes(appDir: string): boolean {
  if (isNuxt(appDir)) return true;
  return /\b(?:unplugin-)?vue-router\/vite\b/.test(readConfig(appDir, "vite.config") ?? "");
}
