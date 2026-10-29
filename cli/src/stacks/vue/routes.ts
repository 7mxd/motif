import { join } from "node:path";
import { maskComments } from "../../check/mask";
import type { RouteDiscovery } from "../react-web/routes";
import { entries, inside, isDir, joinRoutePath, listRouteSources, needsValue, splitTop } from "../route-source";
import { isNuxt, nuxtSrcDir, usesFileRoutes } from "./project";

const PAGE = /\.vue$/i;
const NOT_A_PAGE = /\.(test|spec|stories)\./i;
const SOURCE = /\.(ts|js|mts|mjs)$/;


/** A value a path may leave out at its end: vue-router's :id? and :path*, Nuxt's [[slug]]. */
const OPTIONAL = /^(?::\w+(?:\([^)]*\))?[?*]|\[\[[^\]]+\]\])$/;

/**
 * A page, or a skipped one when it needs a value. A path whose values at its end are optional (/history/:id?) is also the
 * page without them (/history), which needs none.
 */
function add(out: RouteDiscovery, segments: string[]): void {
  (segments.some(needsValue) ? out.skipped : out.routes).push("/" + segments.join("/"));
  let bare = segments.length;
  while (bare > 0 && OPTIONAL.test(segments[bare - 1]!)) bare--;
  if (bare < segments.length && !segments.slice(0, bare).some(needsValue)) out.routes.push("/" + segments.slice(0, bare).join("/"));
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
    const path = joinRoutePath(parent, own);
    const children = props.get("children");
    if (children?.startsWith("[")) {
      const kids = inside(children, 0);
      routeRecords(kids, path === "/" ? "" : path, out);
      // Children that are all spreads ([...userRoutes]) say nothing: the parent is still a page of its own.
      if (splitTop(kids).some((k) => k.startsWith("{"))) continue;
    }
    if (props.has("redirect") && !props.has("component") && !props.has("components")) continue;
    if (path.includes("(.*)") || (path.includes("*") && !path.includes(":"))) continue;
    add(out, path.split("/").filter(Boolean));
  }
}

const READS_ROUTES = /vue-router|createRouter|RouteRecordRaw/;
/** A route record's path, for a routes array that imports nothing from vue-router. */
const PATH_RECORD = /\bpath\s*:\s*["'`]\//;

const ARRAY_STARTS = [
  /\broutes\s*:\s*\[/g,
  /\b(?:const|let|var)\s+\w+\s*:\s*(?:Array<\s*)?RouteRecordRaw\b[^=]*=\s*\[/g,
  /\b(?:const|let|var)\s+\w*[rR]outes\w*\s*(?::[^=]+)?=\s*\[/g,
];

function routerConfigs(appDir: string, out: RouteDiscovery): void {
  for (const file of listRouteSources(appDir, SOURCE)) {
    const text = maskComments(file.text, "script");
    if (!READS_ROUTES.test(text) && !(PATH_RECORD.test(text) && /\bcomponent\s*:/.test(text))) continue;
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
