import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { declared } from "../../project/package";
import { stripBom } from "../../text";

function readJson(path: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(stripBom(readFileSync(path, "utf8")));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Where the app's @/ alias points, relative to the app ("src" for "./src/*"), or null when tsconfig.json doesn't set one. */
export function aliasBase(appDir: string): string | null {
  try {
    // tsconfig.json is JSON with comments and trailing commas.
    const tsconfig = parseJsonc(stripBom(readFileSync(join(appDir, "tsconfig.json"), "utf8")), [], { allowTrailingComma: true });
    const target = tsconfig?.compilerOptions?.paths?.["@/*"]?.[0];
    if (typeof target !== "string" || !target.endsWith("/*")) return null;
    return target.slice(0, -2).replace(/^\.\//, "").replace(/^\.$/, "");
  } catch {
    return null;
  }
}

/** True when the app lists expo in its dependencies or devDependencies, as stack detection reads them. */
export function isExpoApp(dir: string): boolean {
  return declared(dir, "expo") !== null;
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

const SCHEME_STYLES = new Set(["light", "dark", "automatic"]);

/**
 * The light or dark an Expo app keeps on a phone whatever the phone's setting (app.json's userInterfaceStyle, Expo's
 * default "light" when it sets none), when iOS and Android agree; null when the app follows the phone, or when Motif
 * can't tell (no app.json, or an app.config.* that can change it). set says whether app.json names it.
 */
export function fixedScheme(dir: string): { scheme: "light" | "dark"; set: boolean } | null {
  if (["js", "ts", "cjs", "mjs", "json"].some((ext) => existsSync(join(dir, `app.config.${ext}`)))) return null;
  const expo = readJson(join(dir, "app.json"))?.expo;
  if (!expo || typeof expo !== "object") return null;
  const style = (o: unknown): string | undefined => {
    const v = o && typeof o === "object" ? (o as Record<string, unknown>).userInterfaceStyle : undefined;
    return typeof v === "string" && SCHEME_STYLES.has(v) ? v : undefined;
  };
  const top = style(expo);
  const e = expo as Record<string, unknown>;
  const ios = style(e.ios) ?? top;
  const android = style(e.android) ?? top;
  const scheme = ios ?? android ?? "light";
  if ((ios ?? "light") !== (android ?? "light") || scheme === "automatic") return null;
  return { scheme: scheme as "light" | "dark", set: ios !== undefined || android !== undefined };
}
