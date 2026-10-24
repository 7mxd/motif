import { statSync } from "node:fs";
import { join } from "node:path";
import { declared, packageVersion, readConfig } from "../../project/package";

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
