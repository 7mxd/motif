// The screens of a Compose app, for motif shot: @Preview functions (also through a multipreview annotation the app
// declares) and Navigation Compose destinations (string routes and type-safe ones), read from the app's Kotlin code.
import { basename } from "node:path";
import { listKotlinFiles } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import { SIGN_IN, signInFirst } from "../../shot/capture";
import { andList } from "../../text";
import { UNREAD_ROUTES_NOTE } from "../flutter/routes";
import type { RouteDiscovery } from "../react-web/routes";

export interface Preview {
  /** As the JVM sees it: <package>.<FileName>Kt.<function>, or <package>.<JvmName>.<function>. */
  fqn: string;
  /** The function's name. */
  name: string;
  /** Relative to the module. */
  file: string;
}

export interface ComposeScreens extends RouteDiscovery {
  previews: Preview[];
  /** Previews that take a @PreviewParameter, which Motif can't supply. */
  skippedPreviews: Preview[];
}

/** androidx's own multipreview annotations. */
const BUILT_IN = ["PreviewLightDark", "PreviewScreenSizes", "PreviewFontScale", "PreviewDynamicColors"];

const CHAIN = /^[A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*/;

/** The inside of the bracket at open (as a range) and the position after its match. */
function balanced(s: string, open: number): { inner: [number, number]; end: number } {
  const o = s[open]!;
  const c = o === "(" ? ")" : o === "{" ? "}" : ">";
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === o) depth++;
    else if (s[j] === c && --depth === 0) return { inner: [open + 1, j], end: j + 1 };
  }
  return { inner: [open + 1, s.length], end: s.length };
}

/** An argument list's top-level arguments (split at commas outside brackets). */
function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(args.slice(from, i));
      from = i + 1;
    }
  }
  if (args.slice(from).trim()) out.push(args.slice(from));
  return out;
}

/**
 * The annotations in front of the declaration at index: on its own line, and on the lines above that start with @ or
 * continue one. A line that held only a comment (blank in the masked text s, not in the file as written) is passed over.
 */
function headAnnotations(s: string, index: number, raw?: string): string[] {
  const lineStart = s.lastIndexOf("\n", index - 1) + 1;
  const lines = s.slice(0, lineStart).split("\n");
  lines.pop();
  const rawLines = raw?.slice(0, lineStart).split("\n");
  const kept = [s.slice(lineStart, index)];
  let depth = 0;
  for (let k = lines.length - 1; k >= 0; k--) {
    const line = lines[k]!;
    const t = line.trim();
    if (depth === 0 && t === "" && rawLines?.[k]?.trim()) continue;
    const delta = (line.match(/\)/g)?.length ?? 0) - (line.match(/\(/g)?.length ?? 0);
    if (depth > 0) {
      kept.push(line);
      depth += delta;
    } else if ((t.startsWith("@") && !/\b(?:fun|class|object|val|var|interface|typealias)\b/.test(t)) || /^(?:private|internal|public)$/.test(t)) {
      kept.push(line);
      depth = Math.max(0, delta);
    } else if (delta > 0) {
      // The tail of a multi-line annotation's arguments.
      kept.push(line);
      depth = delta;
    } else break;
  }
  const names: string[] = [];
  for (const m of kept.join("\n").matchAll(/@(?:\w+:)?([A-Za-z_][\w.]*)/g)) names.push(m[1]!.split(".").pop()!);
  return names;
}

/** Brace depth at each position of masked text. */
function depths(s: string): Uint16Array {
  const out = new Uint16Array(s.length + 1);
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    out[i] = d;
    if (s[i] === "{") d++;
    else if (s[i] === "}" && d > 0) d--;
  }
  return out;
}

interface Source {
  file: string;
  /** The file as written. */
  text: string;
  code: string;
  masked: string;
}

/** String constants: `Owner.NAME` for one in an object or class, `NAME` for a top-level one. */
type Constants = Map<string, string>;

function fileConstants(src: Source, into: Constants): void {
  const { code, masked: s } = src;
  const owners: { name: string; start: number; end: number }[] = [];
  for (const m of s.matchAll(/\b(?:object|class|interface)\s+([A-Za-z_]\w*)[^{;=]*\{/g)) {
    const open = m.index + m[0].length - 1;
    owners.push({ name: m[1]!, start: open, end: balanced(s, open).end });
  }
  for (const m of code.matchAll(/\bconst\s+val\s+([A-Za-z_]\w*)\s*(?::\s*String)?\s*=\s*"([^"\n$\\]*)"/g)) {
    const owner = owners.filter((o) => o.start < m.index && m.index < o.end).pop();
    into.set(owner ? `${owner.name}.${m[1]}` : m[1]!, m[2]!);
  }
}

function resolve(chain: string, constants: Constants): string | null {
  const parts = chain.split(/\s*\.\s*/);
  return constants.get(parts.slice(-2).join(".")) ?? (parts.length === 1 ? constants.get(parts[0]!) : undefined) ?? null;
}

/** Whether a type-safe route's class opens without values: an object, or a class whose parameters all have defaults. */
function typeSafeUsable(name: string, sources: Source[]): boolean {
  for (const { masked: s } of sources) {
    if (new RegExp(`\\bobject\\s+${name}\\b`).test(s)) return true;
    const c = new RegExp(`\\bclass\\s+${name}\\b\\s*(\\()?`).exec(s);
    if (!c) continue;
    if (!c[1]) return true;
    const { inner } = balanced(s, c.index + c[0].length - 1);
    return splitArgs(s.slice(inner[0], inner[1])).every((p) => p.includes("="));
  }
  return false;
}

/** HomeScreenPreview → home-screen. */
export function previewSlug(name: string): string {
  const base = name.length > "Preview".length ? name.replace(/Preview$/, "") : name;
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** The argument that is `named = …`, else the positional one at position. */
function argument(args: string[], named: string, position: number): string | null {
  const byName = args.find((a) => new RegExp(`^\\s*${named}\\s*=(?!=)`).test(a));
  if (byName) return byName.replace(/^\s*\w+\s*=\s*/, "").trim();
  const positional = args.filter((a) => !/^\s*[A-Za-z_]\w*\s*=(?!=)/.test(a));
  return positional[position]?.trim() ?? null;
}

type Value = { kind: "string"; value: string } | { kind: "type"; name: string } | { kind: "unread" };

function valueOf(arg: string | null, constants: Constants): Value {
  if (arg === null) return { kind: "unread" };
  const str = /^"([^"]*)"$/.exec(arg);
  if (str) return str[1]!.includes("$") ? { kind: "unread" } : { kind: "string", value: str[1]! };
  const chain = CHAIN.exec(arg);
  if (!chain) return { kind: "unread" };
  const rest = arg.slice(chain[0].length).trim();
  const resolved = rest === "" ? resolve(chain[0], constants) : null;
  if (resolved !== null) return { kind: "string", value: resolved };
  const last = chain[0].split(/\s*\.\s*/).pop()!;
  // Profile or Profile(id = "x"): a type-safe route's class (a constant is never in UpperCamelCase).
  if (/^[A-Z]/.test(last) && !/^[A-Z0-9_]+$/.test(last) && (rest === "" || rest.startsWith("("))) return { kind: "type", name: last };
  return { kind: "unread" };
}

function listSources(moduleDir: string): Source[] {
  return listKotlinFiles(moduleDir, ".")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => {
      const code = maskComments(f.text, "kotlin");
      return { file: f.path, text: f.text, code, masked: maskStrings(code, "kotlin") };
    });
}

/** The app's @Preview functions without parameters, and those that take a @PreviewParameter. */
function findPreviews(sources: Source[]): { previews: Preview[]; skipped: Preview[] } {
  const multi = new Set<string>(BUILT_IN);
  const heads = sources.flatMap((src) =>
    [...src.masked.matchAll(/\bannotation\s+class\s+([A-Za-z_]\w*)/g)].map((m) => ({ name: m[1]!, head: headAnnotations(src.masked, m.index, src.text) })),
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (const h of heads) {
      if (!multi.has(h.name) && h.head.some((a) => a === "Preview" || multi.has(a))) {
        multi.add(h.name);
        changed = true;
      }
    }
  }
  const previews: Preview[] = [];
  const skipped: Preview[] = [];
  for (const { file, text, code, masked: s } of sources) {
    const depth = depths(s);
    const pkg = /^\s*package\s+([\w.]+)/m.exec(s)?.[1];
    const jvm = /@file\s*:\s*JvmName\s*\(\s*"([^"]+)"\s*\)/.exec(code)?.[1];
    const stem = basename(file).replace(/\.kt$/, "");
    const cls = jvm ?? `${stem.charAt(0).toUpperCase()}${stem.slice(1)}Kt`;
    for (const m of s.matchAll(/\bfun\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)\s*\(/g)) {
      if (depth[m.index]! !== 0) continue;
      const names = headAnnotations(s, m.index, text);
      if (!names.includes("Composable") || !names.some((a) => a === "Preview" || multi.has(a))) continue;
      const open = m.index + m[0].length - 1;
      const params = s.slice(open + 1, balanced(s, open).inner[1]).trim();
      const preview: Preview = { fqn: `${pkg ? `${pkg}.` : ""}${cls}.${m[1]}`, name: m[1]!, file };
      if (params === "") previews.push(preview);
      else if (/@PreviewParameter\b/.test(params) && splitArgs(params).length === 1) skipped.push(preview);
    }
  }
  return { previews, skipped };
}

/** A route as Motif writes it: with a leading /, without a trailing one. */
function routeOf(value: string): string {
  const route = value.startsWith("/") ? value : `/${value}`;
  return route.length > 1 ? route.replace(/\/+$/, "") : route;
}

/** The Compose app's previews and Navigation Compose routes. Routes are written with a leading / (the launcher is /). */
export function discoverComposeScreens(moduleDir: string): ComposeScreens {
  const sources = listSources(moduleDir);
  const constants: Constants = new Map();
  for (const src of sources) if (/\bconst\b/.test(src.masked)) fileConstants(src, constants);
  const found = new Set<string>(["/"]);
  const skippedRoutes = new Set<string>();
  let unread = 0;
  const add = (v: Value) => {
    if (v.kind === "unread") {
      unread++;
    } else if (v.kind === "type") {
      (typeSafeUsable(v.name, sources) ? found : skippedRoutes).add(`@${v.name}`);
    } else {
      const route = routeOf(v.value);
      (route.includes("{") ? skippedRoutes : found).add(route);
    }
  };
  // Each NavHost's start destination: with one NavHost it is what the launcher shows, so it is / and not a route of its own.
  const starts: Value[] = [];
  for (const { code, masked: s } of sources) {
    if (!/\b(?:composable|dialog|navigation|NavHost)\b/.test(s)) continue;
    for (const m of s.matchAll(/\b(composable|navigation|NavHost)\s*(<[^>(]*>)?\s*\(/g)) {
      if (m[1] === "composable" && m[2]) continue;
      const open = m.index + m[0].length - 1;
      const args = splitArgs(code.slice(open + 1, balanced(s, open).inner[1]));
      if (m[1] === "composable") add(valueOf(argument(args, "route", 0), constants));
      else if (m[1] === "navigation") {
        // The graph's own address, then its start destination.
        const route = argument(args, "route", 1);
        if (route !== null && route !== "null") add(valueOf(route, constants));
        add(valueOf(argument(args, "startDestination", 0), constants));
      } else {
        const start = valueOf(argument(args, "startDestination", 1), constants);
        starts.push(start);
        add(start);
      }
    }
    // composable<Profile> { … }
    for (const m of s.matchAll(/\bcomposable\s*<\s*([A-Za-z_][\w.]*)\s*>/g)) add({ kind: "type", name: m[1]!.split(".").pop()! });
  }
  if (starts.length === 1 && starts[0]!.kind !== "unread") {
    const start = starts[0]!;
    found.delete(start.kind === "type" ? `@${start.name}` : routeOf(start.value));
  }
  const { previews, skipped } = findPreviews(sources);
  const routes = [...found];
  const notes = [
    ...(routes.length === 1 && unread > 0 ? [UNREAD_ROUTES_NOTE] : []),
    ...(skipped.length > 0
      ? [`${andList(skipped.map((p) => p.name))} ${skipped.length === 1 ? "takes" : "take"} a @PreviewParameter, which Motif can't supply, so ${skipped.length === 1 ? "it was" : "they were"} left out.`]
      : []),
  ];
  return { routes, skipped: [...skippedRoutes], previews, skippedPreviews: skipped, ...(notes.length > 0 ? { notes } : {}) };
}

/**
 * Why a --screen value can't be used, or null when each names a preview the app has (HomeScreenPreview, or its full
 * name, com.x.HomeScreenKt.HomeScreenPreview).
 */
export function composeScreenProblem(moduleDir: string, screens: string[]): string | null {
  if (screens.length === 0) return null;
  const { previews, skippedPreviews } = discoverComposeScreens(moduleDir);
  const list = previews.length > 0 ? ` Previews found: ${andList(previews.map((p) => p.name))}.` : " No @Preview functions without parameters were found.";
  for (const screen of screens) {
    const hit = (p: Preview) => p.fqn === screen || p.name === screen;
    const matches = previews.filter(hit);
    if (matches.length === 1) continue;
    if (matches.length > 1) {
      return `--screen ${screen} is the name of ${matches.length} previews (${andList(matches.map((p) => p.fqn))}). Use the full name of one.`;
    }
    if (skippedPreviews.some(hit)) {
      return `--screen ${screen} takes a @PreviewParameter, which Motif can't supply.${list} Name one of those, or use --routes for the app's pages.`;
    }
    return `--screen ${screen} isn't a @Preview function Motif found in this app.${list} Name one of those, or use --routes for the app's pages.`;
  }
  return null;
}

/** How many screens a run takes when the developer doesn't choose (as on the web). */
export const MAX_SCREENS = 12;

/** A preview as a run names it: its function's name, or its full name when two previews share one. */
function runName(previews: Preview[], p: Preview): string {
  return previews.filter((q) => q.name === p.name).length > 1 ? p.fqn : p.name;
}

/** What a run takes without --routes or --screen: sign-in first, then /, the other routes, then every preview, at most max. */
export function composeRunList(
  found: Pick<ComposeScreens, "routes" | "previews">,
  max = MAX_SCREENS,
): { routes: string[]; previews: Preview[]; leftOut: string[] } {
  const all = [
    ...signInFirst(found.routes).map((name) => ({ name, preview: null as Preview | null })),
    ...found.previews.map((p) => ({ name: runName(found.previews, p), preview: p as Preview | null })),
  ];
  const kept = all.slice(0, max);
  return {
    routes: kept.filter((k) => !k.preview).map((k) => k.name),
    previews: kept.flatMap((k) => (k.preview ? [k.preview] : [])),
    leftOut: all.slice(max).map((k) => k.name),
  };
}

/** How many of the screens left out the note names before it counts the rest. */
const LEFT_OUT_NAMED = 5;

/**
 * COMPOSE.routes: the screens a run takes without --routes or --screen (the routes, and the previews as screens), with
 * a note when the cap leaves some out.
 */
export function composeRoutes(moduleDir: string): ComposeScreens & { screens: string[] } {
  const found = discoverComposeScreens(moduleDir);
  const run = composeRunList(found);
  const notes = [...(found.notes ?? [])];
  if (run.leftOut.length > 0) {
    const left = run.leftOut;
    const list = left.length > LEFT_OUT_NAMED + 1 ? `${left.slice(0, LEFT_OUT_NAMED).join(", ")} and ${left.length - LEFT_OUT_NAMED} more` : andList(left);
    const first = [...(found.routes.some((r) => SIGN_IN.test(r)) ? ["sign-in pages"] : []), "/"];
    notes.push(
      `Captured ${MAX_SCREENS} of ${found.routes.length + found.previews.length} screens: ${andList(first)} first, then the other routes, then the previews. ` +
        `Left out: ${list}. Choose others with --routes or --screen.`,
    );
  }
  return { ...found, routes: run.routes, screens: run.previews.map((p) => runName(found.previews, p)), ...(notes.length > 0 ? { notes } : {}) };
}
