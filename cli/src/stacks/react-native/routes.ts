// The pages of an Expo app, for motif shot: Expo Router's files under app/ (or src/app/), or, when the app doesn't use
// Expo Router, the paths of a React Navigation linking config ({ config: { screens: { Home: "home" } } }).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { maskComments } from "../../check/mask";
import type { RouteDiscovery } from "../react-web/routes";
import { usesExpoRouter } from "./project";

const SOURCE = /\.(tsx|ts|jsx|js)$/;
const NOT_A_PAGE = /\.(test|spec|stories|d)\.\w+$/;
const PLATFORM = /\.(web|ios|android|native)$/;

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

const needsValue = (segment: string) => segment.startsWith("[") || segment.startsWith(":") || segment.includes("*");
function add(out: RouteDiscovery, segments: string[]): void {
  (segments.some(needsValue) ? out.skipped : out.routes).push("/" + segments.join("/"));
}

/** Expo Router: index is its folder's route, (groups) add no segment, and layouts, +special files and API routes are not pages. */
function fileRoutes(dir: string, segments: string[], out: RouteDiscovery): void {
  for (const entry of entries(dir)) {
    const path = join(dir, entry);
    if (isDir(path)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      fileRoutes(path, entry.startsWith("(") && entry.endsWith(")") ? segments : [...segments, entry], out);
      continue;
    }
    if (!SOURCE.test(entry) || NOT_A_PAGE.test(entry)) continue;
    // x.web.tsx, x.ios.tsx and x.native.tsx are variants of the route x.
    const name = entry.replace(SOURCE, "").replace(PLATFORM, "");
    if (name === "_layout" || name.startsWith("+") || name.endsWith("+api")) continue;
    add(out, name === "index" ? segments : [...segments, name]);
  }
}

/** Index of the "}" closing the "{" at `open` in masked text, or -1. */
function closeOf(m: string, open: number): number {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === "{") depth++;
    else if (m[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

const join2 = (parent: string, path: string) => (parent + "/" + path).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
const STRING = /^(["'`])([^"'`$]*)\1/;
const KEY = /^[\s,]*(?:[A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*:\s*/;

/** The screens object whose "{" is at `open`: each screen's path joined to its parent's. */
function screens(text: string, masked: string, open: number, parent: string, found: string[]): void {
  const end = closeOf(masked, open);
  if (end === -1) return;
  let i = open + 1;
  while (i < end) {
    const key = KEY.exec(masked.slice(i, end));
    if (!key) {
      i++;
      continue;
    }
    i += key[0].length;
    const str = STRING.exec(text.slice(i, end));
    if (str) {
      found.push(join2(parent, str[2]!));
      i += str[0].length;
    } else if (masked[i] === "{") {
      const close = closeOf(masked, i);
      if (close === -1) return;
      const body = masked.slice(i, close + 1);
      const sub = /\bscreens\s*:\s*\{/.exec(body);
      // Only a path written at this screen's own level, not one belonging to a nested screens object.
      const own = /\bpath\s*:\s*(["'`])([^"'`$]*)\1/.exec(text.slice(i, close + 1));
      const path = own && (!sub || own.index < sub.index) ? own[2]! : undefined;
      const here = path === undefined ? parent : join2(parent, path);
      if (path !== undefined) found.push(here);
      if (sub) screens(text, masked, i + sub.index + sub[0].length - 1, here, found);
      i = close + 1;
    }
  }
}

function linkingRoutes(appDir: string, out: RouteDiscovery): void {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of entries(dir)) {
      if (files.length >= 500 || entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (isDir(path)) visit(path);
      else if (SOURCE.test(entry)) files.push(path);
    }
  };
  visit(isDir(join(appDir, "src")) ? join(appDir, "src") : appDir);
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("screens")) continue;
    const masked = maskComments(text, "script");
    for (const m of masked.matchAll(/\bconfig\s*:\s*\{\s*screens\s*:\s*\{/g)) {
      const found: string[] = [];
      screens(text, masked, m.index! + m[0].length - 1, "", found);
      for (const route of found) add(out, route.split("/").filter(Boolean));
    }
  }
}

/** The routes of an Expo app: its Expo Router files, else its React Navigation linking paths. "/" is always there. */
export function discoverExpoRoutes(appDir: string): RouteDiscovery {
  const out: RouteDiscovery = { routes: [], skipped: [] };
  const base = ["app", "src/app"].map((b) => join(appDir, b)).find(isDir);
  if (base && (usesExpoRouter(appDir) || entries(base).some((e) => e.startsWith("_layout")))) fileRoutes(base, [], out);
  else linkingRoutes(appDir, out);
  const rest = [...new Set(out.routes)].filter((r) => r !== "/").sort();
  return { routes: ["/", ...rest], skipped: [...new Set(out.skipped)].sort() };
}
