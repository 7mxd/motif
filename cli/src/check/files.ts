import { readdirSync, readFileSync, statSync } from "node:fs";
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

/** Flutter's build output, tests, and generated Dart: never the team's own code. */
export const FLUTTER_IGNORES = [
  ".dart_tool/", "build/", "test/", "integration_test/", "*.g.dart", "*.freezed.dart", "*.mocks.dart", "*.gr.dart",
  "lib/generated/", "lib/l10n/app_localizations*.dart",
];

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

export function listSourceFiles(root: string, appPath: string, opts: { paths?: string[]; ignore?: string[]; langs?: Record<string, Lang>; extraIgnores?: string[] } = {}): SourceFile[] {
  const langs = opts.langs ?? WEB_LANGS;
  const rootIgnore = ignore().add(DEFAULT_IGNORES).add(readGitignore(root)).add(opts.ignore ?? []).add(opts.extraIgnores ?? []);
  const app = toPosix(appPath) || ".";
  const appDir = join(root, app);
  const appIgnore = app === "." ? null : ignore().add(readGitignore(appDir)).add(opts.extraIgnores ?? []);
  const wanted = (opts.paths ?? []).map(toPosix).filter(Boolean);
  const dirWanted = (rel: string) => wanted.length === 0 || wanted.some((w) => w === rel || w.startsWith(rel + "/") || rel.startsWith(w + "/"));
  const fileWanted = (rel: string) => wanted.length === 0 || wanted.some((w) => rel === w || rel.startsWith(w + "/"));
  const appRelative = (rel: string) => (app === "." ? rel : rel.slice(app.length + 1));

  const out: SourceFile[] = [];
  const visit = (absDir: string, rel: string) => {
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
        if (dirWanted(relPath)) visit(abs, relPath);
        continue;
      }
      const lang = langs[extname(name).toLowerCase()];
      if (!lang || st.size > MAX_FILE_BYTES) continue;
      if (rootIgnore.ignores(relPath) || appIgnore?.ignores(appRelative(relPath))) continue;
      if (!fileWanted(relPath)) continue;
      const text = stripBom(readFileSync(abs, "utf8"));
      if (looksBundled(text)) continue;
      out.push({ path: relPath, abs, text, lang });
    }
  };
  visit(appDir, app === "." ? "" : app);
  return out;
}
