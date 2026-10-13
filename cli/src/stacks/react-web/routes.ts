import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RouteDiscovery {
  routes: string[];
  /** Routes that need values in their address (/posts/[id]); shown to the developer, not captured. */
  skipped: string[];
}

const APP_PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const PAGES_FILE = /\.(tsx|ts|jsx|js|mdx)$/;
const NOT_A_PAGE = /\.(test|spec|stories|d)\.\w+$/;
const SOURCE = /\.(tsx|ts|jsx|js)$/;

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
const routeOf = (segments: string[]) => "/" + segments.join("/");

function dependencies(appDir: string): Record<string, unknown> {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8").replace(/^﻿/, ""));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

function add(out: RouteDiscovery, segments: string[]): void {
  (segments.some(needsValue) ? out.skipped : out.routes).push(routeOf(segments));
}

function appRouter(dir: string, segments: string[], out: RouteDiscovery): void {
  for (const entry of entries(dir)) {
    const path = join(dir, entry);
    if (isDir(path)) {
      // Private folders, parallel routes and intercepting routes aren't pages of their own.
      if (entry.startsWith("_") || entry.startsWith("@") || entry.startsWith("(.") || entry.startsWith(".") || entry === "node_modules") continue;
      const group = entry.startsWith("(") && entry.endsWith(")");
      appRouter(path, group ? segments : [...segments, entry], out);
    } else if (APP_PAGE.test(entry)) {
      add(out, segments);
    }
  }
}

function pagesRouter(dir: string, segments: string[], out: RouteDiscovery): void {
  for (const entry of entries(dir)) {
    const path = join(dir, entry);
    if (isDir(path)) {
      if (entry.startsWith(".") || entry.startsWith("_") || (segments.length === 0 && entry === "api")) continue;
      pagesRouter(path, [...segments, entry], out);
    } else if (PAGES_FILE.test(entry) && !NOT_A_PAGE.test(entry)) {
      const name = entry.replace(PAGES_FILE, "");
      if (name.startsWith("_") || (segments.length === 0 && (name === "404" || name === "500"))) continue;
      add(out, name === "index" ? segments : [...segments, name]);
    }
  }
}

function reactRouter(appDir: string, out: RouteDiscovery): void {
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
    const text = readFileSync(file, "utf8");
    if (!text.includes("react-router") && !text.includes("<Route")) continue;
    for (const m of text.matchAll(/\bpath\s*[=:]\s*["'`](\/[^"'`]*)["'`]/g)) {
      const route = m[1]!.replace(/\/+$/, "") || "/";
      if (route.includes("*")) continue;
      add(out, route.split("/").filter(Boolean));
    }
  }
}

export function discoverRoutes(appDir: string): RouteDiscovery {
  const out: RouteDiscovery = { routes: [], skipped: [] };
  const deps = dependencies(appDir);
  if (deps.next) {
    for (const base of ["app", "src/app"]) if (isDir(join(appDir, base))) appRouter(join(appDir, base), [], out);
    for (const base of ["pages", "src/pages"]) if (isDir(join(appDir, base))) pagesRouter(join(appDir, base), [], out);
  } else if (deps["react-router"] || deps["react-router-dom"]) {
    reactRouter(appDir, out);
  }
  const rest = [...new Set(out.routes)].filter((r) => r !== "/").sort();
  return { routes: ["/", ...rest], skipped: [...new Set(out.skipped)].sort() };
}
