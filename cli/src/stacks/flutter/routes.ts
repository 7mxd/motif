// The pages of a Flutter app, for motif shot: go_router's GoRoute and TypedGoRoute paths (nested ones joined to their
// parent's) and a MaterialApp's routes: map keys, read from the app's Dart code, with paths named by a string constant
// (Routes.home, HomeScreen.routeName) read from the constant.
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

/** String constants: `Class.name` for a static one in a class, `name` for a top-level one. */
type Constants = Map<string, string>;

const CHAIN = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/;

/** The plain string constants a file declares (no interpolation), keyed as Constants says. */
function fileConstants(text: string, into: Constants): void {
  const code = maskComments(text, "dart");
  const s = maskStrings(code, "dart");
  // Each class body's range, from the masked text so braces in strings don't count.
  const classes: { name: string; start: number; end: number }[] = [];
  for (const m of s.matchAll(/\b(?:class|mixin|extension|enum)\s+([A-Za-z_$][\w$]*)[^{;]*\{/g)) {
    let depth = 0;
    let j = m.index + m[0].length - 1;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) break;
    }
    classes.push({ name: m[1]!, start: m.index + m[0].length, end: j });
  }
  for (const m of code.matchAll(/\b(static\s+)?const\s+(?:String\s+)?([A-Za-z_$][\w$]*)\s*=\s*r?(['"])([^'"\n]*)\3\s*;/g)) {
    if (m[4]!.includes("$")) continue;
    const owner = classes.filter((c) => c.start <= m.index && m.index < c.end).pop();
    if (m[1] && owner) into.set(`${owner.name}.${m[2]}`, m[4]!);
    else if (!m[1] && !owner) into.set(m[2]!, m[4]!);
  }
}

/** A name's string, by its last two parts (an import prefix in front is ignored), or by itself when it's one word. */
function resolve(chain: string, constants: Constants): string | null {
  const parts = chain.split(/\s*\.\s*/);
  return constants.get(parts.slice(-2).join(".")) ?? (parts.length === 1 ? constants.get(parts[0]!) : undefined) ?? null;
}

/** The routes one Dart file declares, in the order they start, and how many it declares that Motif can't read. */
function fileRoutes(text: string, constants: Constants = new Map()): { routes: string[]; unread: number } {
  const code = maskComments(text, "dart");
  const s = maskStrings(code, "dart");
  const nodes: GoNode[] = [];
  const keys: { start: number; path: string }[] = [];
  let unreadKeys = 0;
  const stack: Frame[] = [];
  let pendingMap = false;
  let i = 0;
  const skipSpace = (j: number) => {
    while (j < s.length && /\s/.test(s[j]!)) j++;
    return j;
  };
  const skipSpaceBack = (j: number) => {
    while (j >= 0 && /\s/.test(s[j]!)) j--;
    return j;
  };
  /** From the < at j, the position just after its matching >. */
  const skipGeneric = (j: number) => {
    let depth = 0;
    for (; j < s.length; j++) {
      if (s[j] === "<") depth++;
      else if (s[j] === ">" && --depth === 0) return j + 1;
    }
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
      // GoRoute(…), and go_router_builder's TypedGoRoute<HomeRoute>(…).
      const open = word === "GoRoute" ? after : word === "TypedGoRoute" && s[after] === "<" ? skipSpace(skipGeneric(after)) : -1;
      if (open >= 0 && s[open] === "(") {
        const parent = [...stack].reverse().find((f) => f.go)?.go ?? null;
        const go = { start: i, path: null, parent };
        nodes.push(go);
        stack.push({ close: ")", go });
        i = open + 1;
        continue;
      }
      if (word === "path" && s[after] === ":" && top?.go) {
        const at = skipSpace(after + 1);
        const str = stringAt(at);
        if (str) top.go.path = str.value.includes("$") ? null : str.value;
        else {
          const chain = CHAIN.exec(s.slice(at, at + 200));
          if (chain) top.go.path = resolve(chain[0], constants);
        }
      }
      // A routes: map keyed by a constant (HomeScreen.routeName: …), at the map's own level, after { or a comma.
      if (top?.map && /[{,]/.test(s[skipSpaceBack(i - 1)] ?? "")) {
        const chain = CHAIN.exec(s.slice(i, i + 200))![0];
        if (s[skipSpace(i + chain.length)] === ":") {
          const path = resolve(chain, constants);
          if (path === null) unreadKeys++;
          else keys.push({ start: i, path });
          i += chain.length;
          continue;
        }
      }
      if (word === "routes" && s[after] === ":") {
        // routes: {…} or routes: <String, WidgetBuilder>{…} is a MaterialApp's map; routes: […] is a list of GoRoutes.
        let j = skipSpace(after + 1);
        if (s[j] === "<") j = skipSpace(skipGeneric(j));
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
  // A route whose path is built at run time or named by a constant Motif didn't find (in another package, say).
  const unread = nodes.filter((n) => n.path === null).length + unreadKeys;
  return { routes, unread };
}

/** When only / was found although the code declares routes Motif can't read. */
export const UNREAD_ROUTES_NOTE =
  "Only / was found; some routes are built at run time or named by constants Motif can't find — name the screens with --routes.";

/** The app's routes: GoRoute paths (nested ones joined), MaterialApp routes: keys, and / always; ones needing a value are skipped. */
export function discoverFlutterRoutes(appDir: string): RouteDiscovery {
  const found = new Set<string>(["/"]);
  let unread = 0;
  const texts: string[] = [];
  for (const file of libDartFiles(appDir)) {
    try {
      texts.push(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
  }
  const constants: Constants = new Map();
  for (const text of texts) if (/\bconst\b/.test(text)) fileConstants(text, constants);
  for (const text of texts) {
    if (!/GoRoute\s*[(<]|routes\s*:/.test(text)) continue;
    const read = fileRoutes(text, constants);
    unread += read.unread;
    for (const route of read.routes) found.add(route.length > 1 ? route.replace(/\/+$/, "") : route);
  }
  const all = [...found];
  const needsValue = (r: string) => /(^|\/)[:*]/.test(r);
  return { routes: all.filter((r) => !needsValue(r)), skipped: all.filter(needsValue), ...(all.length === 1 && unread > 0 ? { notes: [UNREAD_ROUTES_NOTE] } : {}) };
}
