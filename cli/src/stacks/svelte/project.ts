import { declared, packageVersion, readConfig, subpathImport } from "../../project/package";

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

/**
 * How the app's code names a file under its lib folder (a path in the app, "src/lib/design/motion"): "#lib/…" where
 * package.json's imports map #lib/* to that folder (sv's SvelteKit 3 starter), "$lib/…" in SvelteKit 2 (whose $lib is
 * kit.files.lib, src/lib unless the config says), or null when neither reaches it (SvelteKit 3 removed $lib; a Vite app
 * has neither): the caller writes a relative path.
 */
export function libSpecifier(appDir: string, inApp: string): string | null {
  const mapped = subpathImport(appDir, "#lib/*")?.replace(/^\.\//, "");
  if (mapped?.endsWith("/*") && inApp.startsWith(mapped.slice(0, -1))) return `#lib/${inApp.slice(mapped.length - 1)}`;
  if (!isSvelteKit(appDir)) return null;
  const kit = kitMajor(appDir);
  if (kit !== null && kit >= 3) return null;
  const lib = kitLibDir(appDir) ?? "src/lib";
  return inApp.startsWith(`${lib}/`) ? `$lib/${inApp.slice(lib.length + 1)}` : null;
}

/**
 * A folder SvelteKit's config names as files.<key> with a string literal, relative to the app: svelte.config.* first
 * (kit.files, SvelteKit 2), then vite.config.* (sveltekit({ files }), SvelteKit 3); null when neither names one.
 */
function filesOption(appDir: string, key: "routes" | "lib"): string | null {
  const pattern = new RegExp(`\\bfiles\\s*:\\s*\\{[^}]*?\\b${key}\\s*:\\s*(["'\`])([^"'\`$\\n]*)\\1`);
  for (const base of ["svelte.config", "vite.config"]) {
    const literal = pattern.exec(readConfig(appDir, base) ?? "")?.[2];
    if (literal === undefined) continue;
    const dir = literal.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (dir !== "") return dir;
  }
  return null;
}

/** Where SvelteKit's routes live relative to the app: files.routes from its config when it is a string literal, else src/routes. */
export function routesDir(appDir: string): string {
  return filesOption(appDir, "routes") ?? "src/routes";
}

/** The lib folder a SvelteKit app's config names (files.lib, a string literal), relative to the app, or null: src/lib then. */
export function kitLibDir(appDir: string): string | null {
  return isSvelteKit(appDir) ? filesOption(appDir, "lib") : null;
}

/** Where a Svelte app's source lives relative to the app: src, for SvelteKit and for Vite's template alike. */
export function svelteSrcDir(_appDir: string): string {
  return "src";
}
