// The pages of a Flutter app, for motif shot: go_router's GoRoute paths (nested ones joined to their parent's) and a
// MaterialApp's routes: map keys, read from the app's Dart code.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { maskComments, maskStrings } from "../../check/mask";
import type { RouteDiscovery } from "../react-web/routes";

/** The app's own Dart files under lib/, generated ones (*.g.dart, *.freezed.dart) left out, in a stable order. */
export function libDartFiles(appDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      let dirLike = false;
      try {
        dirLike = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (dirLike) walk(path);
      else if (name.endsWith(".dart") && !/\.(g|freezed)\.dart$/.test(name)) out.push(path);
    }
  };
  walk(join(appDir, "lib"));
  return out;
}

interface GoNode {
  start: number;
  path: string | null;
  parent: GoNode | null;
}

interface Frame {
  close: string;
  go?: GoNode;
  /** A routes: {…} map, whose string keys are routes. */
  map?: boolean;
}

/** The routes one Dart file declares, in the order they start, and how many it declares that Motif can't read. */
function fileRoutes(text: string): { routes: string[]; unread: number } {
  const code = maskComments(text, "dart");
  const s = maskStrings(code, "dart");
  const nodes: GoNode[] = [];
  const keys: { start: number; path: string }[] = [];
  const stack: Frame[] = [];
  let pendingMap = false;
  let i = 0;
  const skipSpace = (j: number) => {
    while (j < s.length && /\s/.test(s[j]!)) j++;
    return j;
  };
  /** The string literal starting at j (after an optional r): its value and where it ends. */
  const stringAt = (j: number): { value: string; end: number } | null => {
    if (s[j] === "r" && (s[j + 1] === "'" || s[j + 1] === '"')) j++;
    const q = s[j];
    if (q !== "'" && q !== '"') return null;
    const triple = s.startsWith(q.repeat(3), j);
    const open = triple ? 3 : 1;
    const end = s.indexOf(triple ? q.repeat(3) : q, j + open);
    if (end === -1) return null;
    return { value: code.slice(j + open, end), end: end + open };
  };
  while (i < s.length) {
    const c = s[i]!;
    const top = stack[stack.length - 1];
    if (/[A-Za-z_$]/.test(c)) {
      const word = /^[A-Za-z_$][\w$]*/.exec(s.slice(i, i + 100))![0];
      const after = skipSpace(i + word.length);
      if (word === "GoRoute" && s[after] === "(") {
        const parent = [...stack].reverse().find((f) => f.go)?.go ?? null;
        const go = { start: i, path: null, parent };
        nodes.push(go);
        stack.push({ close: ")", go });
        i = after + 1;
        continue;
      }
      if (word === "path" && s[after] === ":" && top?.go) {
        const str = stringAt(skipSpace(after + 1));
        if (str) top.go.path = str.value;
      }
      if (word === "routes" && s[after] === ":") {
        // routes: {…} or routes: <String, WidgetBuilder>{…} is a MaterialApp's map; routes: […] is a list of GoRoutes.
        let j = skipSpace(after + 1);
        if (s[j] === "<") {
          let depth = 0;
          for (; j < s.length; j++) {
            if (s[j] === "<") depth++;
            else if (s[j] === ">" && --depth === 0) break;
          }
          j = skipSpace(j + 1);
        }
        pendingMap = s[j] === "{";
      }
      i += word.length;
      continue;
    }
    if (c === "'" || c === '"') {
      const str = stringAt(i);
      if (!str) break;
      if (top?.map && s[skipSpace(str.end)] === ":") keys.push({ start: i, path: str.value });
      i = str.end;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      stack.push({ close: c === "(" ? ")" : c === "[" ? "]" : "}", ...(c === "{" && pendingMap ? { map: true } : {}) });
      if (c === "{") pendingMap = false;
    } else if (c === ")" || c === "]" || c === "}") {
      // Pop to the matching bracket, so a stray one in broken code doesn't undo everything.
      const at = stack.map((f) => f.close).lastIndexOf(c);
      if (at >= 0) stack.length = at;
    }
    i++;
  }
  const full = (n: GoNode): string | null => {
    if (n.path === null) return null;
    if (n.path.startsWith("/") || !n.parent) return n.path.startsWith("/") ? n.path : `/${n.path}`;
    const base = full(n.parent);
    if (base === null) return null;
    return `${base.replace(/\/+$/, "")}/${n.path}`;
  };
  const routes = [...nodes.map((n) => ({ start: n.start, path: full(n) })), ...keys]
    .filter((r): r is { start: number; path: string } => r.path !== null && r.path.startsWith("/"))
    .sort((a, b) => a.start - b.start)
    .map((r) => r.path);
  // A GoRoute whose path isn't written out (path: Routes.home), and go_router_builder's @TypedGoRoute.
  const unread = nodes.filter((n) => n.path === null).length + (s.match(/\bTypedGoRoute\s*</g)?.length ?? 0);
  return { routes, unread };
}

/** When only / was found although the code declares routes Motif can't read. */
export const UNREAD_ROUTES_NOTE = "Only / was found; routes written as constants or with TypedGoRoute aren't read — name the screens with --routes.";

/** The app's routes: GoRoute paths (nested ones joined), MaterialApp routes: keys, and / always; ones needing a value are skipped. */
export function discoverFlutterRoutes(appDir: string): RouteDiscovery {
  const found = new Set<string>(["/"]);
  let unread = 0;
  for (const file of libDartFiles(appDir)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!/GoRoute\s*[(<]|routes\s*:/.test(text)) continue;
    const read = fileRoutes(text);
    unread += read.unread;
    for (const route of read.routes) found.add(route.length > 1 ? route.replace(/\/+$/, "") : route);
  }
  const all = [...found];
  const needsValue = (r: string) => /(^|\/)[:*]/.test(r);
  return { routes: all.filter((r) => !needsValue(r)), skipped: all.filter(needsValue), ...(all.length === 1 && unread > 0 ? { notes: [UNREAD_ROUTES_NOTE] } : {}) };
}
