// What a developer gives motif shot for a Flutter app, read and checked before the run: design/states/setup.dart,
// design/states/http.json, --state scripts and --screen widgets.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { maskComments, maskStrings } from "../../check/mask";
import type { StateScript } from "../../shot/capture";
import { libDartFiles } from "./routes";

export const SETUP_FILE = "design/states/setup.dart";
export const HTTP_FILE = "design/states/http.json";
const SETUP_SIGNATURE =
  "Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async";

/** An import of a file outside the app's packages, from the harness in <app>/.motif/shot/. */
export function importFrom(appDir: string, file: string): string {
  const rel = relative(join(appDir, ".motif", "shot"), file);
  return isAbsolute(rel) ? pathToFileURL(file).href : rel.split(sep).join("/");
}

/** A file under design/states/ as a run uses it: where it is, and how Motif names it (root-relative). */
export interface StatesFile {
  file: string;
  shown: string;
  /** True when it's the app's own (<app>/design/states/…), in a project whose root has the shared one. */
  own: boolean;
}

/**
 * design/states/<name> for an app: the app's own (<app>/design/states/<name>) when it has one, so each app of a
 * monorepo can set itself up; else the project's. Null when neither exists.
 */
export function statesFile(root: string, appDir: string, name: string): StatesFile | null {
  const top = resolve(root);
  const app = resolve(appDir);
  if (app !== top) {
    const own = join(app, "design", "states", name);
    if (existsSync(own)) return { file: own, shown: relative(top, own).split(sep).join("/"), own: true };
  }
  const shared = join(top, "design", "states", name);
  return existsSync(shared) ? { file: shared, shown: `design/states/${name}`, own: false } : null;
}

/**
 * The setup script's import for the harness (the app's own design/states/setup.dart, else the project's) and which
 * file it is; null when there's none; an error when it lacks motifSetup.
 */
export function readSetup(root: string, appDir: string): { import: string; file: StatesFile } | null | { error: string } {
  const found = statesFile(root, appDir, "setup.dart");
  if (!found) return null;
  const text = maskComments(readFileSync(found.file, "utf8"), "dart");
  if (!/\bmotifSetup\s*\(/.test(text)) return { error: `${found.shown} must define ${SETUP_SIGNATURE}.` };
  return { import: importFrom(appDir, found.file), file: found };
}

export const STATE_SIGNATURE = "Future<void> motifState(WidgetTester tester) async";

/** A --state's name and its import for the harness, or why it can't run: a Flutter state is a Dart file with motifState. */
export function readState(appDir: string, state: StateScript): { name: string; import: string } | { error: string } {
  const file = state.file ?? state.name;
  if (!/\.dart$/i.test(file)) return { error: `--state: ${basename(file)} isn't a Dart file; a Flutter app's states are Dart files, like design/states/${state.name}.dart.` };
  if (!/\bmotifState\s*\(/.test(maskComments(state.script, "dart"))) {
    return { error: `--state: ${basename(file)} must define ${STATE_SIGNATURE}, which Motif runs on each screen once it has opened. Add it, then run motif shot again.` };
  }
  return { name: state.name, import: importFrom(appDir, file) };
}

export interface HttpRoute {
  method: string;
  /** "/items" for a request to any host, or a whole address in url. */
  path: string | null;
  url: string | null;
  /** The answer's body (absolute path); none for an empty one. */
  file: string | null;
  status: number;
}

const KEY = /^(GET|POST|PUT|PATCH|DELETE|HEAD) (\/\S*|https?:\/\/\S+)$/;

/**
 * design/states/http.json (the app's own, else the project's): "GET /path" or "GET https://host/path" → a file under
 * the design/ folder next to it ("fixtures/items.json"), or { "file": …, "status": 201 }. Nothing when there's no file.
 */
export function readHttpFixtures(root: string, appDir: string = root): HttpRoute[] | { error: string } {
  const found = statesFile(root, appDir, "http.json");
  if (!found) return [];
  const shown = found.shown;
  const path = found.file;
  let table: unknown;
  try {
    table = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    return { error: `${shown} isn't valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!table || typeof table !== "object" || Array.isArray(table)) {
    return { error: `${shown} maps requests to answers, like { "GET /items": "fixtures/items.json" }.` };
  }
  // The design/ folder the table is in: the app's own, or the project's.
  const base = dirname(dirname(dirname(path)));
  const design = resolve(base, "design");
  const routes: HttpRoute[] = [];
  for (const [key, value] of Object.entries(table)) {
    const m = KEY.exec(key.trim());
    if (!m) return { error: `${shown}: "${key}" should be a method and a path or address, like "GET /items" or "GET https://api.example.com/items".` };
    const answer = typeof value === "string" ? { file: value } : value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (!answer) return { error: `${shown}: "${key}" should name a file under design/, or be { "file": …, "status": … }.` };
    const status = answer.status === undefined ? 200 : answer.status;
    if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
      return { error: `${shown}: "${key}" has a status that isn't an HTTP status code (100 to 599).` };
    }
    let file: string | null = null;
    if (answer.file !== undefined) {
      if (typeof answer.file !== "string" || answer.file.trim() === "") return { error: `${shown}: "${key}" has a file that isn't a path.` };
      const given = answer.file.replace(/\\/g, "/");
      const abs = given.startsWith("design/") ? resolve(base, given) : resolve(design, given);
      const inside = relative(design, abs);
      if (inside.startsWith("..") || isAbsolute(inside)) return { error: `${shown}: "${key}" answers with ${answer.file}, which isn't under design/.` };
      if (!existsSync(abs) || !statSync(abs).isFile()) return { error: `${shown}: "${key}" answers with ${answer.file}, which doesn't exist (paths are under design/).` };
      file = abs;
    }
    const target = m[2]!;
    routes.push({ method: m[1]!, path: target.startsWith("/") ? target : null, url: target.startsWith("/") ? null : target, file, status });
  }
  return routes;
}

/** SignInScreen → sign-in-screen: a --screen's name in screenshot file names. */
export function screenSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** The text between the bracket at open and its match (masked text, so brackets in strings don't count). */
function enclosed(text: string, open: number): { inner: string; end: number } | null {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const stack: string[] = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (pairs[c]) stack.push(pairs[c]!);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return { inner: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Why a class can't be made with no arguments (Name()), or null when it can. */
function needsArguments(name: string, body: string): string | null {
  // Constructors are at the class body's own level: an unnamed one (Name(…), const Name(…), factory Name(…)) or named ones.
  let depth = 0;
  const unnamed: string[] = [];
  let named = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth !== 0 || !body.startsWith(name, i) || /[\w$.]/.test(body[i - 1] ?? " ")) continue;
    const after = body.slice(i + name.length);
    if (/^\.\w+\s*\(/.test(after)) named = true;
    const paren = /^\s*\(/.exec(after);
    if (!paren) continue;
    const params = enclosed(body, i + name.length + paren[0].length - 1);
    if (params) unnamed.push(params.inner);
  }
  if (unnamed.length === 0) return named ? "it has only named constructors" : null;
  const params = unnamed[0]!;
  let positional = "";
  let optional = "";
  for (let i = 0; i < params.length; i++) {
    if (params[i] === "{" || params[i] === "[") {
      const group = enclosed(params, i);
      if (!group) break;
      optional += group.inner;
      i = group.end;
    } else positional += params[i];
  }
  if (positional.replace(/,/g, "").trim() !== "") return "its constructor takes arguments";
  if (/\brequired\b/.test(optional)) return "its constructor has required arguments";
  return null;
}

/** Base classes that make a class a widget: Flutter's own, and those of the state management packages apps use most. */
const WIDGET_BASES = new Set([
  "Widget", "StatelessWidget", "StatefulWidget", "ConsumerWidget", "ConsumerStatefulWidget", "HookWidget", "StatefulHookWidget",
  "HookConsumerWidget", "StatefulHookConsumerWidget", "GetView", "GetWidget", "StatelessObserverWidget", "StatefulObserverWidget",
  "ViewModelWidget", "StackedView",
]);

interface ClassDecl {
  file: string;
  /** The class's declaration, as matched in the masked code. */
  head: string;
  /** What it extends, if anything. */
  base?: string;
  /** Its body, without the braces; null when it can't be read. */
  body: string | null;
}

/** Where the app's lib/ declares a class, read from masked code (so names in strings and comments don't count). */
function findClass(appDir: string, name: string): ClassDecl | null {
  const pattern = new RegExp(`(^|[^\\w$])(abstract\\s+|sealed\\s+|base\\s+|final\\s+|interface\\s+)*class\\s+${name.replace(/\$/g, "\\$")}(?![\\w$])`);
  for (const file of libDartFiles(appDir)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(name)) continue;
    const code = maskStrings(maskComments(text, "dart"), "dart");
    const decl = pattern.exec(code);
    if (!decl) continue;
    const open = code.indexOf("{", decl.index + decl[0].length);
    const header = code.slice(decl.index + decl[0].length, open >= 0 ? open : undefined);
    const base = /\bextends\s+([A-Za-z_$][\w$]*)/.exec(header)?.[1];
    const body = open >= 0 ? enclosed(code, open) : null;
    return { file, head: decl[0], ...(base ? { base } : {}), body: body?.inner ?? null };
  }
  return null;
}

/** True when a class extends a widget: one of Flutter's (or a state package's), or another widget class of the app. */
function extendsWidget(appDir: string, decl: ClassDecl, seen = new Set<string>()): boolean {
  const base = decl.base;
  if (!base || seen.has(base)) return false;
  seen.add(base);
  const own = findClass(appDir, base);
  if (own) return extendsWidget(appDir, own, seen);
  // A base from a package Motif doesn't know: its name says whether it's a widget.
  return WIDGET_BASES.has(base) || /(Widget|View|Screen|Page)$/.test(base);
}

/**
 * The --screen widget's import (the app's file that defines the class, as package:<pkg>/…), or why Motif can't open it:
 * it must be a public widget class in the app's lib/ that needs no arguments.
 */
export function findScreen(appDir: string, pkg: string, name: string): { import: string } | { error: string } {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return { error: `--screen takes a widget's class name, like --screen SettingsScreen; "${name}" isn't one.` };
  if (name.startsWith("_")) {
    return { error: `--screen ${name}: it's private to its file (its name starts with _), so Motif can't open it. Make it public, or capture it through its route with --routes.` };
  }
  const decl = findClass(appDir, name);
  if (!decl) return { error: `--screen ${name}: there's no class ${name} in the app's lib/ folder.` };
  if (/\b(abstract|sealed|interface)\b/.test(decl.head)) return { error: `--screen ${name}: it's an abstract class, so Motif can't make one. Give a widget class it can make with ${name}().` };
  if (!extendsWidget(appDir, decl)) {
    return { error: `--screen ${name}: it isn't a widget${decl.base ? ` (it extends ${decl.base})` : ""}. Give a screen's widget class, one that extends StatelessWidget or StatefulWidget, or capture the screen through its route with --routes.` };
  }
  const why = decl.body !== null ? needsArguments(name, decl.body) : null;
  if (why) {
    return {
      error: `--screen ${name}: Motif opens a screen with no arguments (${name}()), and ${why}. Give it a constructor that needs none, or capture it through its route with --routes.`,
    };
  }
  const rel = relative(join(appDir, "lib"), decl.file).split(sep).join("/");
  return { import: `package:${pkg}/${rel}` };
}
