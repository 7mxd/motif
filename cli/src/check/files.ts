import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import ignore from "ignore";
import { stripBom } from "../text";

export type Lang = "css" | "script" | "markup" | "dart";

export interface SourceFile {
  /** Relative to the project root, forward slashes. */
  path: string;
  abs: string;
  text: string;
  lang: Lang;
  /** Parts of the text that apply only in dark mode beyond what the CSS says (a <style media="…dark">). */
  dark?: [number, number][];
}

export const WEB_LANGS: Record<string, Lang> = {
  ".css": "css", ".scss": "css", ".sass": "css", ".less": "css",
  ".ts": "script", ".tsx": "script", ".js": "script", ".jsx": "script", ".mjs": "script", ".cjs": "script",
  ".html": "markup", ".htm": "markup", ".mdx": "markup",
};

export const DEFAULT_IGNORES = [
  "node_modules/", ".git/", "dist/", "build/", "out/", ".next/", "coverage/", "__tests__/",
  "*.test.*", "*.spec.*", "*.stories.*", "*.config.*", "*.min.*", "*.d.ts",
  // Dot-folders (.storybook, .vscode, …) and the project's own design/ folder (previews, reports).
  ".*/", "/design/",
];

/**
 * Flutter's build output, tests, and generated Dart: never the team's own code. The folders are the app's or the
 * package's own (/build/), so a feature folder named build or test under lib/ is still read.
 */
export const FLUTTER_IGNORES = [
  "/.dart_tool/", "/build/", "/test/", "/integration_test/", "*.g.dart", "*.freezed.dart", "*.mocks.dart", "*.gr.dart",
  "lib/generated/", "lib/l10n/app_localizations*.dart",
];

/** The defaults for Dart: as for the web, but a build/ folder is ignored only at the app's top (FLUTTER_IGNORES). */
/** An Expo app's native folders, build and export output, and tests: never the team's own code. */
export const RN_IGNORES = ["/ios/", "/android/", "/.expo/", "/dist/", "/web-build/", "/.motif/", "expo-env.d.ts", "*.test.*", "__tests__/"];

const DART_DEFAULT_IGNORES = DEFAULT_IGNORES.filter((p) => p !== "build/");

export const MAX_FILE_BYTES = 512 * 1024;
const MAX_LINE_LENGTH = 3000;

/** Minified or bundled code: long lines and hardly any normal ones. An icon with one long SVG path is still source. */
function looksBundled(text: string): boolean {
  const lines = text.split("\n");
  if (!lines.some((l) => l.length > MAX_LINE_LENGTH)) return false;
  return lines.filter((l) => l.trim() !== "" && l.length <= 200).length < 2;
}

function readGitignore(dir: string): string[] {
  try {
    return stripBom(readFileSync(join(dir, ".gitignore"), "utf8")).split(/\r?\n/);
  } catch {
    return [];
  }
}

const toPosix = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

/** True when rel (root-relative) is one of the wanted files or inside one of the wanted folders. */
export function matchesPaths(rel: string, wanted: string[]): boolean {
  const w = wanted.map(toPosix).filter(Boolean);
  return w.length === 0 || w.some((p) => rel === p || rel.startsWith(p + "/"));
}

/**
 * A Flutter app's or package's Dart files, without its build output, tests and generated code, nor those of a package
 * inside it (an example/ app, packages/*).
 */
export function listDartFiles(root: string, appPath: string, opts: { paths?: string[]; ignore?: string[] } = {}): SourceFile[] {
  return listSourceFiles(root, appPath, {
    ...opts,
    langs: { ".dart": "dart" },
    extraIgnores: FLUTTER_IGNORES,
    defaults: DART_DEFAULT_IGNORES,
    packageMarker: "pubspec.yaml",
  });
}

/** A React Native (Expo) app's scripts, without its native folders, build output and tests. */
export function listRnFiles(root: string, appPath: string, opts: { paths?: string[]; ignore?: string[] } = {}): SourceFile[] {
  const scripts = Object.fromEntries([".ts", ".tsx", ".js", ".jsx"].map((e) => [e, "script" as const]));
  return listSourceFiles(root, appPath, { ...opts, langs: scripts, extraIgnores: RN_IGNORES });
}

export function listSourceFiles(
  root: string,
  appPath: string,
  opts: {
    paths?: string[];
    ignore?: string[];
    langs?: Record<string, Lang>;
    extraIgnores?: string[];
    defaults?: string[];
    /** A file that makes its folder a package of its own, whose paths extraIgnores also match from (pubspec.yaml). */
    packageMarker?: string;
  } = {},
): SourceFile[] {
  const langs = opts.langs ?? WEB_LANGS;
  const rootIgnore = ignore().add(opts.defaults ?? DEFAULT_IGNORES).add(readGitignore(root)).add(opts.ignore ?? []).add(opts.extraIgnores ?? []);
  const app = toPosix(appPath) || ".";
  const appDir = join(root, app);
  const appIgnore = app === "." ? null : ignore().add(readGitignore(appDir)).add(opts.extraIgnores ?? []);
  const wanted = (opts.paths ?? []).map(toPosix).filter(Boolean);
  const dirWanted = (rel: string) => wanted.length === 0 || wanted.some((w) => w === rel || w.startsWith(rel + "/") || rel.startsWith(w + "/"));
  const fileWanted = (rel: string) => wanted.length === 0 || wanted.some((w) => rel === w || rel.startsWith(w + "/"));
  const appRelative = (rel: string) => (app === "." ? rel : rel.slice(app.length + 1));
  const pkgIgnore = opts.packageMarker ? ignore().add(opts.extraIgnores ?? []) : null;
  // The innermost package below the app's own folder that rel is in, and the path inside it.
  const inPackage = (pkg: string | null, rel: string) => (pkg === null ? null : rel.slice(pkg.length + 1));

  const out: SourceFile[] = [];
  const visit = (absDir: string, rel: string, pkg: string | null) => {
    let entries: string[];
    try {
      entries = readdirSync(absDir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(absDir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (rootIgnore.ignores(relPath + "/") || appIgnore?.ignores(appRelative(relPath) + "/")) continue;
        const inner = inPackage(pkg, relPath);
        if (inner !== null && pkgIgnore?.ignores(inner + "/")) continue;
        const isPackage = pkgIgnore !== null && existsSync(join(abs, opts.packageMarker!));
        if (dirWanted(relPath)) visit(abs, relPath, isPackage ? relPath : pkg);
        continue;
      }
      const lang = langs[extname(name).toLowerCase()];
      if (!lang || st.size > MAX_FILE_BYTES) continue;
      if (rootIgnore.ignores(relPath) || appIgnore?.ignores(appRelative(relPath))) continue;
      const inner = inPackage(pkg, relPath);
      if (inner !== null && pkgIgnore?.ignores(inner)) continue;
      if (!fileWanted(relPath)) continue;
      const text = stripBom(readFileSync(abs, "utf8"));
      if (looksBundled(text)) continue;
      out.push({ path: relPath, abs, text, lang });
    }
  };
  visit(appDir, app === "." ? "" : app, null);
  return out;
}
