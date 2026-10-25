import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { maskComments } from "../../check/mask";
import { isObj, maskCode, parseObject } from "../../extract/object-literal";
import { stripBom } from "../../text";
import type { RouteDiscovery } from "../react-web/routes";
import { inside, joinRoutePath, listRouteSources, needsValue, splitTop } from "../route-source";
import { angularProject, angularSrcDir } from "./project";

/** How many files deep loadChildren is followed. */
const MAX_DEPTH = 5;
/** How many imports a name is followed through (re-exports), and how many files are searched for the router. */
const MAX_HOPS = 10;
const MAX_SEARCHED = 60;

const ROOT_CALL = /\b(?:provideRouter|RouterModule\s*\.\s*forRoot)\s*\(/g;
const CHILD_CALL = /\bRouterModule\s*\.\s*forChild\s*\(/g;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const LITERAL = /^(["'`])([^"'`$]*)\1$/;

/** A routes array: the text between its brackets, and the file it is in (comments blanked). */
interface Routes {
  file: string;
  body: string;
}

interface Context {
  appDir: string;
  out: RouteDiscovery;
  notes: Set<string>;
  texts: Map<string, string | null>;
}

const escape = (name: string) => name.replace(/\$/g, "\\$");
const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** A file's text with its comments blanked, or null when it can't be read. */
function textOf(ctx: Context, file: string): string | null {
  if (!ctx.texts.has(file)) {
    let text: string | null = null;
    try {
      text = maskComments(stripBom(readFileSync(file, "utf8")), "script");
    } catch {
      text = null;
    }
    ctx.texts.set(file, text);
  }
  return ctx.texts.get(file)!;
}

const shown = (ctx: Context, file: string) => relative(ctx.appDir, file).replace(/\\/g, "/");

/** The file a relative import names (./admin/admin.routes → admin.routes.ts; ./shop → shop/index.ts); null for packages and path aliases. */
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(from), spec);
  for (const candidate of [`${base}.ts`, base, join(base, "index.ts"), `${base}.js`, `${base}.mjs`, join(base, "index.js")]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/** What a file imports: each local name, the module it comes from, and its exported name ("default" for a default import). */
function importsOf(text: string): Map<string, { spec: string; name: string }> {
  const found = new Map<string, { spec: string; name: string }>();
  for (const m of text.matchAll(/\bimport\s+(?:type\s+)?([\w$\s{},]+?)\s+from\s*(["'])([^"']+)\2/g)) {
    const clause = m[1]!.trim();
    const spec = m[3]!;
    const def = /^([\w$]+)\s*(?:,|$)/.exec(clause);
    if (def && def[1] !== "type") found.set(def[1]!, { spec, name: "default" });
    const braces = /\{([^}]*)\}/.exec(clause);
    for (const part of braces ? braces[1]!.split(",") : []) {
      const named = /^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part.trim());
      if (named) found.set(named[2] ?? named[1]!, { spec, name: named[1]! });
    }
  }
  return found;
}

/** The files a file imports by relative path, in order. */
function relativeImports(file: string, text: string): string[] {
  const files: string[] = [];
  for (const m of text.matchAll(/\bimport\s+(?:[\w$\s{},*]+?\s+from\s*)?(["'])(\.[^"']*)\1/g)) {
    const target = resolveImport(file, m[2]!);
    if (target && !files.includes(target)) files.push(target);
  }
  return files;
}

/** The routes array a name stands for in a file: declared there (const routes: Routes = [...]), or imported from a file of the app. */
function arrayNamed(ctx: Context, file: string, name: string, hops = 0): Routes | null {
  const text = textOf(ctx, file);
  if (text === null || hops > MAX_HOPS) return null;
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${escape(name)}\\s*(?::[^=]+)?=\\s*\\[`).exec(text);
  if (decl) return { file, body: inside(text, decl.index + decl[0].length - 1) };
  const imported = importsOf(text).get(name);
  const target = imported ? resolveImport(file, imported.spec) : null;
  return target ? arrayExported(ctx, target, imported!.name, hops + 1) : null;
}

/** The routes array a file exports under a name ("default" for its default export), through re-exports too. */
function arrayExported(ctx: Context, file: string, name: string, hops = 0): Routes | null {
  const text = textOf(ctx, file);
  if (text === null || hops > MAX_HOPS) return null;
  if (name === "default") {
    const literal = /\bexport\s+default\s+\[/.exec(text);
    if (literal) return { file, body: inside(text, literal.index + literal[0].length - 1) };
    const named = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*(?:;|$)/m.exec(text);
    if (named) return arrayNamed(ctx, file, named[1]!, hops);
  } else {
    const own = arrayNamed(ctx, file, name, hops);
    if (own) return own;
  }
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}\s*(?:from\s*(["'])([^"']+)\2)?/g)) {
    for (const part of m[1]!.split(",")) {
      const named = /^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part.trim());
      if (!named || (named[2] ?? named[1]) !== name) continue;
      if (m[3] === undefined) return arrayNamed(ctx, file, named[1]!, hops);
      const target = resolveImport(file, m[3]);
      return target ? arrayExported(ctx, target, named[1]!, hops + 1) : null;
    }
  }
  if (name !== "default") {
    for (const m of text.matchAll(/\bexport\s*\*\s*from\s*(["'])([^"']+)\1/g)) {
      const target = resolveImport(file, m[2]!);
      const found = target ? arrayExported(ctx, target, name, hops + 1) : null;
      if (found) return found;
    }
  }
  return null;
}

/**
 * The routes arrays given to a router call (provideRouter, RouterModule.forRoot or .forChild): in the first file that
 * makes one, searching from `start` through the files it imports by relative path, nearest first.
 */
function routerArrays(ctx: Context, start: string, call: RegExp): Routes[] {
  const queue = [start];
  const seen = new Set(queue);
  for (let i = 0; i < queue.length && i < MAX_SEARCHED; i++) {
    const file = queue[i]!;
    const text = textOf(ctx, file);
    if (text === null) continue;
    const calls = [...text.matchAll(call)];
    if (calls.length > 0) return calls.flatMap((m) => arrayGiven(ctx, file, text, m.index! + m[0].length - 1));
    for (const next of relativeImports(file, text)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [];
}

/** The routes array given as the first argument of the call whose "(" is at `open`. */
function arrayGiven(ctx: Context, file: string, text: string, open: number): Routes[] {
  const first = splitTop(inside(text, open))[0] ?? "";
  if (first.startsWith("[")) return [{ file, body: inside(first, 0) }];
  const found = IDENT.test(first) ? arrayNamed(ctx, file, first) : null;
  if (found) return [found];
  if (first) ctx.notes.add(`The routes given to the router as ${first} in ${shown(ctx, file)} weren't found in the app's own files, so their pages weren't read. Name those pages with --routes.`);
  return [];
}

function add(ctx: Context, path: string): void {
  const segments = path.split("/").filter(Boolean);
  (segments.some((s) => needsValue(s) || s.includes("*")) ? ctx.out.skipped : ctx.out.routes).push(path);
}

/** The array a lazy route's loadChildren imports: a routes array (named or default export), or the routes of an NgModule's RouterModule.forChild. */
function lazyChildren(ctx: Context, file: string, value: string, path: string, depth: number): Routes[] {
  const where = `The routes under ${path} (loadChildren in ${shown(ctx, file)})`;
  if (depth >= MAX_DEPTH) {
    ctx.notes.add(`${where} are more than ${MAX_DEPTH} lazy-loaded files deep and weren't read. Name those pages with --routes.`);
    return [];
  }
  const spec = /\bimport\s*\(\s*(["'`])([^"'`$]+)\1\s*\)/.exec(value)?.[2];
  const target = spec ? resolveImport(file, spec) : null;
  if (!target) {
    ctx.notes.add(`${where} weren't read: Motif follows import('./file') of a file in the app. Name those pages with --routes.`);
    return [];
  }
  const name =
    /\.then\s*\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\1\s*\.\s*([\w$]+)/.exec(value)?.[2] ??
    /\.then\s*\(\s*\(\s*\{\s*([\w$]+)\s*\}\s*\)\s*=>\s*\1\b/.exec(value)?.[1] ??
    "default";
  const found = arrayExported(ctx, target, name);
  if (found) return [found];
  const child = routerArrays(ctx, target, CHILD_CALL);
  if (child.length === 0) {
    ctx.notes.add(`${where} weren't read: ${shown(ctx, target)} has no routes array named ${name} and no RouterModule.forChild. Name those pages with --routes.`);
  }
  return child;
}

/** Each route of an array: a page when it has component or loadComponent; children and loadChildren under its path. */
function walk(ctx: Context, routes: Routes, parent: string, depth: number): void {
  for (const element of splitTop(routes.body)) {
    if (element.startsWith("...")) {
      const name = element.slice(3).trim();
      const spread = IDENT.test(name) ? arrayNamed(ctx, routes.file, name) : null;
      if (spread) walk(ctx, spread, parent, depth);
      else ctx.notes.add(`The routes spread from ${name} in ${shown(ctx, routes.file)} weren't read: Motif follows arrays declared in the app's own files. Name those pages with --routes.`);
      continue;
    }
    if (!element.startsWith("{")) continue;
    const props = new Map<string, string>();
    for (const entry of parseObject(maskCode(element), element, 0).entries) {
      props.set(entry.key, isObj(entry.value) ? "{" : entry.value.text);
    }
    const own = LITERAL.exec(props.get("path") ?? "")?.[2];
    if (props.has("path") && own === undefined) continue;
    const path = joinRoutePath(parent, own ?? "");
    const base = path === "/" ? "" : path;
    const children = props.get("children");
    if (children?.startsWith("[")) {
      const kids = inside(children, 0);
      walk(ctx, { file: routes.file, body: kids }, base, depth);
      // A route with children matches only through them: its own path is a page when a child's path is ''.
      if (splitTop(kids).length > 0) continue;
    }
    if (props.has("loadChildren")) {
      for (const lazy of lazyChildren(ctx, routes.file, props.get("loadChildren")!, path, depth)) walk(ctx, lazy, base, depth + 1);
      continue;
    }
    if (props.has("redirectTo") || !(props.has("component") || props.has("loadComponent"))) continue;
    add(ctx, path);
  }
}

/**
 * The pages of an Angular app, from the routes given to provideRouter (standalone) or RouterModule.forRoot (NgModule):
 * found from main.ts through the files it imports, and else in any file of the app. loadChildren is followed into the
 * file it imports (no further than 5 deep); children are joined to their parent's path; redirects and routes with no
 * component aren't pages; :id and ** are skipped. / always, first.
 */
export function discoverAngularRoutes(appDir: string): RouteDiscovery {
  const ctx: Context = { appDir, out: { routes: [], skipped: [] }, notes: new Set(), texts: new Map() };
  const src = angularSrcDir(appDir);
  const main = join(appDir, angularProject(appDir)?.main ?? `${src}/main.ts`);
  let arrays = routerArrays(ctx, main, ROOT_CALL);
  if (arrays.length === 0) {
    for (const file of listRouteSources(join(appDir, src), /\.ts$/)) {
      if (!new RegExp(ROOT_CALL.source).test(file.text)) continue;
      arrays = routerArrays(ctx, file.path, ROOT_CALL);
      if (arrays.length > 0) break;
    }
  }
  for (const routes of arrays) walk(ctx, routes, "", 0);
  const rest = [...new Set(ctx.out.routes)].filter((r) => r !== "/").sort();
  return {
    routes: ["/", ...rest],
    skipped: [...new Set(ctx.out.skipped)].sort(),
    ...(ctx.notes.size > 0 ? { notes: [...ctx.notes] } : {}),
  };
}
