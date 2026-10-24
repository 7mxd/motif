import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { maskComments } from "../../check/mask";
import { stripBom } from "../../text";
import type { RouteDiscovery } from "../react-web/routes";
import { isNuxt, nuxtSrcDir, usesFileRoutes } from "./project";

const PAGE = /\.vue$/i;
const NOT_A_PAGE = /\.(test|spec|stories)\./i;
const SOURCE = /\.(ts|js|mts|mjs)$/;
const MAX_FILES = 500;

const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
const entries = (dir: string) => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};
const needsValue = (segment: string) => segment.startsWith("[") || segment.startsWith(":");

function add(out: RouteDiscovery, segments: string[]): void {
  (segments.some(needsValue) ? out.skipped : out.routes).push("/" + segments.join("/"));
}

/** Nuxt's, vue-router 5's and unplugin-vue-router's pages folder: index.vue is its folder, (group) folders add nothing, - and _ files are not pages. */
function fileRoutes(dir: string, segments: string[], out: RouteDiscovery): void {
  for (const entry of entries(dir)) {
    if (entry.startsWith("-") || entry.startsWith("_") || entry.startsWith(".") || entry === "node_modules") continue;
    const path = join(dir, entry);
    if (isDir(path)) {
      const group = entry.startsWith("(") && entry.endsWith(")");
      fileRoutes(path, group ? segments : [...segments, entry], out);
    } else if (PAGE.test(entry) && !NOT_A_PAGE.test(entry)) {
      // Nuxt draws a .client.vue page only in the browser and a .server.vue page only on the server: the route is the same.
      const name = entry.replace(PAGE, "").replace(/\.(client|server)$/, "");
      add(out, name === "index" ? segments : [...segments, name]);
    }
  }
}

/** Splits text at its top-level commas, leaving strings and nested brackets whole. */
function splitTop(text: string): string[] {
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
function inside(text: string, open: number): string {
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

function routeRecords(arrayBody: string, parent: string, out: RouteDiscovery): void {
  for (const element of splitTop(arrayBody)) {
    if (!element.startsWith("{")) continue;
    const props = new Map<string, string>();
    for (const entry of splitTop(inside(element, 0))) {
      const m = /^(\w+)\s*:\s*([\s\S]*)$/.exec(entry);
      if (m) props.set(m[1]!, m[2]!.trim());
    }
    const literal = /^(["'`])([^"'`$]*)\1$/.exec(props.get("path") ?? "")?.[2];
    if (props.has("path") && literal === undefined) continue;
    const own = literal ?? "";
    const full = own.startsWith("/") ? own : `${parent}/${own}`;
    const path = full.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    const children = props.get("children");
    if (children?.startsWith("[")) routeRecords(inside(children, 0), path === "/" ? "" : path, out);
    if (children?.startsWith("[") && !children.startsWith("[]")) continue;
    if (props.has("redirect") && !props.has("component") && !props.has("components")) continue;
    if (path.includes("(.*)") || path.includes("*")) continue;
    add(out, path.split("/").filter(Boolean));
  }
}

const ARRAY_STARTS = [
  /\broutes\s*:\s*\[/g,
  /\b(?:const|let|var)\s+\w+\s*:\s*(?:Array<\s*)?RouteRecordRaw\b[^=]*=\s*\[/g,
  /\b(?:const|let|var)\s+\w*[rR]outes\w*\s*(?::[^=]+)?=\s*\[/g,
];

function routerConfigs(appDir: string, out: RouteDiscovery): void {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of entries(dir)) {
      if (files.length >= MAX_FILES || entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (isDir(path)) visit(path);
      else if (SOURCE.test(entry) && !NOT_A_PAGE.test(entry)) files.push(path);
    }
  };
  const src = join(appDir, "src");
  visit(isDir(src) ? src : appDir);
  for (const file of files) {
    let text: string;
    try {
      text = maskComments(stripBom(readFileSync(file, "utf8")), "script");
    } catch {
      continue;
    }
    if (!/vue-router|createRouter|RouteRecordRaw/.test(text)) continue;
    const seen = new Set<number>();
    for (const re of ARRAY_STARTS) {
      for (const m of text.matchAll(re)) {
        const open = m.index! + m[0].length - 1;
        if (seen.has(open)) continue;
        seen.add(open);
        routeRecords(inside(text, open), "", out);
      }
    }
  }
}

/** The pages of a Vue or Nuxt app: its pages folder when its routes come from files, else the route arrays in its source. */
export function discoverVueRoutes(appDir: string): RouteDiscovery {
  const out: RouteDiscovery = { routes: [], skipped: [] };
  const nuxt = isNuxt(appDir);
  const pages = nuxt ? join(appDir, nuxtSrcDir(appDir), "pages") : join(appDir, "src", "pages");
  if (nuxt) {
    if (isDir(pages)) fileRoutes(pages, [], out);
  } else if (usesFileRoutes(appDir) && isDir(pages)) {
    fileRoutes(pages, [], out);
  } else {
    routerConfigs(appDir, out);
  }
  const rest = [...new Set(out.routes)].filter((r) => r !== "/").sort();
  return { routes: ["/", ...rest], skipped: [...new Set(out.skipped)].sort() };
}
