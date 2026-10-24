import { readFileSync } from "node:fs";
import { join } from "node:path";
import { maskComments } from "../../check/mask";
import { stripBom } from "../../text";
import type { RouteDiscovery } from "../react-web/routes";
import { entries, inside, isDir, splitTop } from "../route-source";
import { isSvelteKit, routesDir } from "./project";

/** +page.svelte, or a layout reset: +page@.svelte, +page@(group).svelte, +page@[id].svelte. */
const PAGE = /^\+page(@[^.]*)?\.svelte$/;
const SOURCE = /\.(svelte|ts|js|mts|mjs)$/;
const NOT_A_PAGE = /\.(test|spec|stories)\./i;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "design", "coverage", "out", ".svelte-kit"]);
const MAX_FILES = 500;

const isOptional = (segment: string) => /^\[\[[^\]]+\]\]$/.test(segment);
/** A segment that takes a value: [slug], [...rest], [id=integer], prefix-[id], :id. */
const needsValue = (segment: string) => segment.includes("[") || segment.includes(":");

/** A route with an optional [[lang]] segment exists without it too: the short form is a page, the full one needs a value. */
function add(out: RouteDiscovery, segments: string[]): void {
  const required = segments.filter((s) => !isOptional(s));
  if (required.length !== segments.length) out.skipped.push("/" + segments.join("/"));
  (required.some(needsValue) ? out.skipped : out.routes).push("/" + required.join("/"));
}

/** SvelteKit's routes folder: a folder with a +page.svelte is a page, (group) folders add no segment. */
function fileRoutes(dir: string, segments: string[], out: RouteDiscovery): void {
  const list = entries(dir);
  if (list.some((entry) => PAGE.test(entry) && !isDir(join(dir, entry)))) add(out, segments);
  for (const entry of list) {
    const path = join(dir, entry);
    if (entry.startsWith(".") || entry === "node_modules" || !isDir(path)) continue;
    const group = entry.startsWith("(") && entry.endsWith(")");
    fileRoutes(path, group ? segments : [...segments, entry], out);
  }
}

function addPath(out: RouteDiscovery, raw: string): void {
  const path = ("/" + raw.trim()).replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  if (segments.some(needsValue)) out.skipped.push(path);
  else if (!path.includes("*")) out.routes.push(path);
}

/** svelte-spa-router's `{ '/': Home, '/about': About }` objects and svelte-routing's <Route path="…">. */
function routerRoutes(appDir: string, out: RouteDiscovery): void {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of entries(dir)) {
      if (files.length >= MAX_FILES || SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
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
      text = stripBom(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!/svelte-spa-router|svelte-routing/.test(text)) continue;
    text = maskComments(maskComments(text, "markup"), "script");
    if (text.includes("svelte-spa-router")) {
      for (const m of text.matchAll(/\b(?:const|let|var)\s+\w*[rR]outes\w*\s*(?::[^=]+)?=\s*\{/g)) {
        for (const entry of splitTop(inside(text, m.index! + m[0].length - 1))) {
          const key = /^(["'`])([^"'`$]*)\1\s*:/.exec(entry)?.[2];
          if (key !== undefined && key.startsWith("/")) addPath(out, key);
        }
      }
    }
    if (text.includes("svelte-routing")) {
      for (const m of text.matchAll(/<Route\b[^>]*?\bpath\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(["'`])([^"'`$]*)\3\s*\})/g)) {
        const path = m[1] ?? m[2] ?? m[4];
        if (path !== undefined) addPath(out, path);
      }
    }
  }
}

/** The pages of a Svelte app: SvelteKit's routes folder, else the routes its router (svelte-spa-router, svelte-routing) names. */
export function discoverSvelteRoutes(appDir: string): RouteDiscovery {
  const out: RouteDiscovery = { routes: [], skipped: [] };
  if (isSvelteKit(appDir)) {
    const dir = join(appDir, routesDir(appDir));
    if (isDir(dir)) fileRoutes(dir, [], out);
  } else {
    routerRoutes(appDir, out);
  }
  const rest = [...new Set(out.routes)].filter((r) => r !== "/").sort();
  return { routes: ["/", ...rest], skipped: [...new Set(out.skipped)].sort() };
}
