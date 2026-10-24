import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../text";

export const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
export const entries = (dir: string) => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};

/** Splits text at its top-level commas, leaving strings and nested brackets whole. */
export function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The text between the bracket at `open` and its match. */
export function inside(text: string, open: number): string {
  const closer = text[open] === "[" ? "]" : "}";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === text[open]) depth++;
    else if (c === closer && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

const NOT_A_PAGE = /\.(test|spec|stories)\./i;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "design", "coverage", "out"]);
const MAX_FILES = 500;

/** A segment that takes a value: [id], :id, prefix-:id, prefix-[id]. */
export const needsValue = (segment: string) => segment.includes("[") || segment.includes(":");

/**
 * The source files (matching `sourceRe`, tests and stories left out) a router config can be in, with their text:
 * src/ when the app has one, else the whole app, without build output, design/ or dot folders. At most 500 files.
 */
export function listRouteSources(appDir: string, sourceRe: RegExp): { path: string; text: string }[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of entries(dir)) {
      if (files.length >= MAX_FILES || SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (isDir(path)) visit(path);
      else if (sourceRe.test(entry) && !NOT_A_PAGE.test(entry)) files.push(path);
    }
  };
  const src = join(appDir, "src");
  visit(isDir(src) ? src : appDir);
  const out: { path: string; text: string }[] = [];
  for (const path of files) {
    try {
      out.push({ path, text: stripBom(readFileSync(path, "utf8")) });
    } catch {
      continue;
    }
  }
  return out;
}
