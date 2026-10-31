// A JavaScript app gets its generated modules as JavaScript (motion.js), not TypeScript files nothing in it would compile.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { declared } from "../project/package";
import type { GeneratedFile } from "./header";

const SKIP = new Set(["node_modules", "dist", "build", "out", "coverage", "design"]);

/** Whether the app's own scripts are TypeScript (.ts, .tsx), JavaScript (.js, .jsx, .mjs) only, or neither (none found). */
function scriptLanguage(appDir: string): "ts" | "js" | null {
  let js = false;
  let seen = 0;
  const visit = (dir: string, depth: number): boolean => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (++seen > 5000) return false;
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      if (e.isDirectory()) {
        if (depth < 6 && visit(join(dir, e.name), depth + 1)) return true;
      } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) return true;
      else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.config\.[cm]?js$/.test(e.name)) js = true;
    }
    return false;
  };
  if (visit(appDir, 0)) return "ts";
  return js ? "js" : null;
}

/**
 * Whether an app is written in TypeScript: a tsconfig.json or typescript declared (by it or the project's root) says so;
 * a jsconfig.json, or scripts with no TypeScript among them, say it isn't. With nothing to go by, it is (Motif's default).
 */
export function usesTypeScript(appDir: string, root = appDir): boolean {
  if (existsSync(join(appDir, "tsconfig.json")) || declared(appDir, "typescript") !== null || declared(root, "typescript") !== null) return true;
  if (existsSync(join(appDir, "jsconfig.json"))) return false;
  return scriptLanguage(appDir) !== "js";
}

/**
 * A generated TypeScript module as JavaScript with the same exports: its type aliases become JSDoc typedefs (an editor
 * still shows them), and its satisfies checks and parameter and return types go. Only Motif's own modules are converted.
 */
export function toJavaScript(ts: string): string {
  return ts
    .split("\n")
    .map((line) => {
      const alias = line.match(/^export type (\w+) = (.+);$/);
      if (alias) return `/** @typedef {${alias[2]}} ${alias[1]} */`;
      if (/^\s*(\/\/|\/\*\*|\*)/.test(line)) return line;
      return line
        .replace(/^\} satisfies [^;]+;$/, "};")
        .replace(/\(([^()]*)\)(: \w+)?( =>| \{)/g, (_, params: string, _ret, after: string) => `(${params.replace(/(\w+): \w+/g, "$1")})${after}`);
    })
    .join("\n");
}

/** A generated motion module: as written (motion.ts), or as JavaScript (motion.js) in an app without TypeScript. */
export function motionFile(path: string, ts: string, javascript: boolean): GeneratedFile {
  return javascript ? { path: path.replace(/\.ts$/, ".js"), content: toJavaScript(ts) } : { path, content: ts };
}
