import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Lang } from "../check/files";
import { maskComments } from "../check/mask";
import { isMotifGenerated } from "./header";

/** The files whose text can load a stylesheet or import a module. */
export const CODE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs|html?)$/;

/** How a file's comments are written: CSS's, markup's (HTML, .vue and .svelte files, with their style and script blocks), or code's (Sass and Less too). */
export function commentLang(file: string): Lang {
  return /\.css$/i.test(file) ? "css" : /\.(?:html?|vue|svelte|astro|mdx)$/i.test(file) ? "markup" : "script";
}

/**
 * True when any file under dir (other than Motif's own) mentions name outside its comments. Bounded to 2000 files. A
 * mention right after one of `except` (a folder, like design/generated/) doesn't count.
 */
export function isReferenced(dir: string, name: string, files: RegExp = CODE_FILE, except: string[] = []): boolean {
  let seen = 0;
  const visit = (d: string): boolean => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e === "node_modules" || e.startsWith(".") || seen++ > 2000) continue;
      const p = join(d, e);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (visit(p)) return true;
      } else if (files.test(e)) {
        const text = readFileSync(p, "utf8");
        if (mentions(text, name, except, commentLang(e)) && !isMotifGenerated(e, text)) return true;
      }
    }
    return false;
  };
  return visit(dir);
}

/** True when text mentions name other than right after one of except; with lang, outside the text's comments. */
export function mentions(text: string, name: string, except: string[] = [], lang?: Lang): boolean {
  let rest = lang ? maskComments(text, lang) : text;
  for (const prefix of except) rest = rest.split(prefix + name).join("");
  return rest.includes(name);
}
