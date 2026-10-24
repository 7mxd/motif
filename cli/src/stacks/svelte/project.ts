import { declared, packageVersion, readConfig } from "../../project/package";

/** True when the app lists @sveltejs/kit in its dependencies or devDependencies. */
export function isSvelteKit(appDir: string): boolean {
  return declared(appDir, "@sveltejs/kit") !== null;
}

/** Svelte's major version, or null when no version can be read. */
export function svelteMajor(appDir: string): number | null {
  return packageVersion(appDir, "svelte")?.major ?? null;
}

/** SvelteKit's major version, or null when the app isn't SvelteKit or no version can be read. */
export function kitMajor(appDir: string): number | null {
  return packageVersion(appDir, "@sveltejs/kit")?.major ?? null;
}

/** True for Svelte 4 or earlier, or SvelteKit 1: versions before Svelte 5's runes, which Motif doesn't support. */
export function beforeSvelte5(appDir: string): boolean {
  const svelte = svelteMajor(appDir);
  const kit = isSvelteKit(appDir) ? kitMajor(appDir) : null;
  return (svelte !== null && svelte < 5) || (kit !== null && kit < 2);
}

/** Where SvelteKit's routes live relative to the app: kit.files.routes from svelte.config.* when it is a string literal, else src/routes. */
export function routesDir(appDir: string): string {
  const literal = /\bfiles\s*:\s*\{[^}]*?\broutes\s*:\s*(["'`])([^"'`$\n]*)\1/.exec(readConfig(appDir, "svelte.config") ?? "")?.[2];
  if (literal !== undefined) {
    const dir = literal.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (dir !== "") return dir;
  }
  return "src/routes";
}

/** Where a Svelte app's source lives relative to the app: src, for SvelteKit and for Vite's template alike. */
export function svelteSrcDir(_appDir: string): string {
  return "src";
}
