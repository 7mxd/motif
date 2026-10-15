// A plain web site's pages: every .html file in its site folder. index.html is its folder's address ("/", "/blog/").
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RouteDiscovery } from "../react-web/routes";

/** Never pages: packages, build output, and (at the top of the site) Motif's own design/ folder. */
const SKIP = new Set(["node_modules", "dist", "build", "out", "coverage"]);

export function discoverPlainRoutes(siteDir: string): RouteDiscovery {
  const routes: string[] = [];
  const visit = (dir: string, prefix: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP.has(name) || (prefix === "" && name === "design")) continue;
      const path = join(dir, name);
      let isDir: boolean;
      try {
        isDir = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (isDir) visit(path, `${prefix}${name}/`);
      else if (/\.html?$/i.test(name)) routes.push(name.toLowerCase() === "index.html" ? `/${prefix}` : `/${prefix}${name}`);
    }
  };
  visit(siteDir, "");
  const rest = [...new Set(routes)].filter((r) => r !== "/").sort();
  return { routes: routes.includes("/") ? ["/", ...rest] : rest, skipped: [] };
}
