// Expo's web target as Motif meets it (decision 0009): the bundle Metro builds before the first screenshot, and what
// native-only code throws there.
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { RN_START_TIMEOUT_MS } from "./index";
import { declared } from "./project";

/** How to keep native-only code out of the web target. */
const STUB = "move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out (Expo's web target, and so Motif's screenshots, use the .web.tsx file).";

const ANSI = /\u001b\[[0-9;]*m/g;
const posix = (p: string) => p.replace(/\\/g, "/");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The package a module specifier is in: react-native-maps/lib/x → react-native-maps, @scope/pkg/x → @scope/pkg. */
function packageOf(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** True when Node would find the package from the app's folder (a workspace hoists it to a parent folder). */
function installed(appDir: string, pkg: string): boolean {
  for (let dir = resolve(appDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules", pkg, "package.json"))) return true;
    if (dirname(dir) === dir) return false;
  }
}

/** Paths inside the app, made relative to it with forward slashes. */
function appPaths(text: string, appDir: string): string {
  const root = escapeRe(resolve(appDir)).replace(/\\\\|\//g, "[\\\\/]");
  return text.replace(new RegExp(`${root}[\\\\/]([^\\s:'"]+)`, "gi"), (_, rest: string) => posix(rest));
}

/** What Metro's answer for a bundle it couldn't build says, in the app's own paths, with what to do for a module it can't find. */
function bundleError(body: string, appDir: string): string {
  let json: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(body);
    json = v && typeof v === "object" ? v : null;
  } catch {
    // Not Metro's JSON: its first line is used.
  }
  const target = typeof json?.targetModuleName === "string" ? json.targetModuleName : null;
  const origin = typeof json?.originModulePath === "string" ? json.originModulePath : null;
  // Metro's UnableToResolveError (Expo SDK 52 sends it without its type).
  if (target && origin) {
    const from = isAbsolute(origin) ? posix(relative(appDir, origin)) : posix(origin);
    if (target.startsWith(".") || isAbsolute(target)) return `${from} imports ${target}, which Metro can't find.`;
    const pkg = packageOf(target);
    if (!installed(appDir, pkg)) {
      // An import inside a package: the packages don't match each other.
      return /(^|\/)node_modules\//.test(from)
        ? `${from} imports ${target}, which isn't installed. Install it (npx expo install ${pkg}), or run npx expo install --fix to match your packages to your Expo SDK.`
        : `${from} imports ${target}, which isn't installed. Install it (npx expo install ${pkg}) or remove the import.`;
    }
    return `${from} imports ${target}, which Metro can't find for the web. ${pkg} has no web version: ${STUB}`;
  }
  const text = typeof json?.message === "string" ? json.message : body;
  const first = text.replace(ANSI, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "Metro answered with an error and no message.";
  return appPaths(first, appDir).slice(0, 400);
}

const timedOut = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/**
 * Asks Expo's dev server for the app's page and the scripts it loads, so Metro builds the web bundle before the first
 * screenshot (a first bundle can take minutes; it then counts against the start limit, not a page's load). A bundle
 * Metro couldn't build is an error saying why; so is one that isn't ready by the deadline. Anything else (a page that
 * doesn't answer, a server that renders on its own) is left to the screenshots.
 */
export async function buildWebBundle(appDir: string, baseUrl: string, deadline: number): Promise<{ error?: string }> {
  const late = { error: `Expo's web bundle wasn't ready within the start limit (${Math.round(RN_START_TIMEOUT_MS / 1000)} s). Run npx expo start --web to see where Metro stops, or start the app yourself and pass its address with --url.` };
  const signal = () => AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  let html: string;
  try {
    const res = await fetch(baseUrl, { signal: signal() });
    if (!res.ok) return {};
    html = await res.text();
  } catch (e) {
    return timedOut(e) ? late : {};
  }
  const origin = new URL(baseUrl).origin;
  const scripts = [...html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => new URL(m[1]!.replace(/&amp;/g, "&"), baseUrl))
    .filter((u) => u.origin === origin);
  for (const url of scripts) {
    try {
      const res = await fetch(url, { signal: signal() });
      if (res.ok) {
        await res.arrayBuffer();
        continue;
      }
      return { error: bundleError(await res.text(), appDir) };
    } catch (e) {
      if (timedOut(e)) return late;
      return {};
    }
  }
  return {};
}

/** ExpoSecureStore → expo-secure-store, ExpoSQLite → expo-sqlite: the package an Expo native module is usually in. */
function expoPackage(module: string): string {
  return module
    .split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .join("-")
    .toLowerCase();
}

/**
 * What to do about the errors native-only code throws on Expo's web target, from the shapes the spike saw (decision
 * 0009). React Native APIs react-native-web doesn't have show as `(0 , _reactNativeWebDistIndex.<name>) is not a
 * function`, naming no package; an Expo module's missing function as `ExpoSecureStore.default.<fn> is not a function`;
 * one Expo can't find as `Cannot find native module 'ExpoX'`.
 */
export function webErrorHints(errors: string[], appDir: string): string[] {
  const hints = new Set<string>();
  for (const e of errors) {
    const rn = /_reactNativeWebDistIndex\.(\w+)\)? is not a function/.exec(e) ?? /_reactNativeWebDistIndex\.(\w+)\b/.exec(e);
    if (rn) {
      const name = rn[1]!;
      hints.add(
        /NativeComponent$/.test(name)
          ? `A native-only component (made with React Native's ${name}, which react-native-web doesn't have) is imported, so the app can't start on the web, on any screen: Expo puts every route in one web bundle. Expo's error overlay in the screenshots names its file. Move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out.`
          : `Native-only code (it uses React Native's ${name}, which react-native-web doesn't have) is imported, so the app can't start on the web, on any screen: Expo puts every route in one web bundle. Expo's error overlay in the screenshots names its file. Move the code that uses it into a file of its own and add a .web.tsx twin of that file that leaves it out.`,
      );
      continue;
    }
    const expo = /\b(Expo[A-Z]\w*)\.default\.(\w+) is not a function/.exec(e) ?? /Cannot find native module '(\w+)'/.exec(e);
    if (expo) {
      const [, module, fn] = expo;
      const pkg = expoPackage(module!);
      const what = declared(appDir, pkg) !== null ? pkg : `The native module ${module}`;
      hints.add(`${what} has no web version${fn ? ` of ${fn}` : ""}: ${STUB}`);
    }
  }
  return [...hints];
}
