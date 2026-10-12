import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../findings";

export const STACK_IDS = ["react-web", "vue", "svelte", "angular", "react-native", "flutter", "swiftui", "compose"] as const;
export type StackId = (typeof STACK_IDS)[number];

export const STACK_LABELS: Record<StackId, string> = {
  "react-web": "React (web)",
  vue: "Vue / Nuxt",
  svelte: "Svelte / SvelteKit",
  angular: "Angular",
  "react-native": "React Native (Expo)",
  flutter: "Flutter",
  swiftui: "SwiftUI",
  compose: "Jetpack Compose",
};

export const ADAPTERS_AVAILABLE: readonly StackId[] = ["react-web"];
export const NODE_STACKS: readonly StackId[] = ["react-web", "vue", "svelte", "angular", "react-native"];

/** React counts as a web app only alongside web build tooling; a server that renders React (e.g. emails) is not one. */
const REACT_WEB_TOOLING = [
  "next", "vite", "@vitejs/plugin-react", "@vitejs/plugin-react-swc", "react-scripts", "@remix-run/react",
  "@react-router/dev", "gatsby", "astro", "parcel", "webpack", "@rsbuild/core", "@rspack/core", "@tanstack/react-start",
];

const SKIP_DIRS = new Set(["node_modules", "Pods", ".build", "DerivedData", "build", "dist"]);
const SWIFT_MAX_DEPTH = 4;
const SWIFT_MAX_FILES = 2000;

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function packageDeps(dir: string): Set<string> | null {
  const text = readText(join(dir, "package.json"));
  if (text === null) return null;
  try {
    const pkg = JSON.parse(text);
    return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  } catch {
    return null;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasSwiftUIImport(dir: string): boolean {
  let scanned = 0;
  const visit = (d: string, depth: number): boolean => {
    if (depth > SWIFT_MAX_DEPTH || scanned >= SWIFT_MAX_FILES) return false;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      if (name.endsWith(".swift")) {
        scanned++;
        if (readText(p)?.includes("import SwiftUI")) return true;
        if (scanned >= SWIFT_MAX_FILES) return false;
      } else if (isDir(p) && visit(p, depth + 1)) {
        return true;
      }
    }
    return false;
  };
  return visit(dir, 0);
}

export function detectStack(dir: string): StackId | null {
  const deps = packageDeps(dir);
  if (deps) {
    if (deps.has("@angular/core")) return "angular";
    if (deps.has("nuxt") || deps.has("vue")) return "vue";
    if (deps.has("@sveltejs/kit") || deps.has("svelte")) return "svelte";
    if (deps.has("expo") || deps.has("react-native")) return "react-native";
    if (deps.has("react") && REACT_WEB_TOOLING.some((d) => deps.has(d))) return "react-web";
  }

  const pubspec = readText(join(dir, "pubspec.yaml"));
  if (pubspec && (/sdk:\s*flutter/.test(pubspec) || /^flutter:/m.test(pubspec))) return "flutter";

  const gradleFiles = ["build.gradle.kts", "build.gradle", "app/build.gradle.kts", "app/build.gradle", "settings.gradle.kts", "settings.gradle"];
  for (const f of gradleFiles) {
    const g = readText(join(dir, f));
    if (g && (g.includes("androidx.compose") || /compose\s*(=\s*)?true/.test(g))) return "compose";
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const looksLikeSwift = entries.includes("Package.swift") || entries.some((e) => e.endsWith(".xcodeproj"));
  if (looksLikeSwift && hasSwiftUIImport(dir)) return "swiftui";

  return null;
}

const rel = (path: string) => path.replace(/\\/g, "/");

function readSettings(root: string): { apps: AppInfo[] | null; findings: Finding[] } {
  const file = "design/motif.json";
  const text = readText(join(root, "design", "motif.json"));
  if (text === null) return { apps: null, findings: [] };
  const bad = (message: string): Finding => ({ code: "bad-settings", severity: "error", file, message });
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { apps: null, findings: [bad("design/motif.json isn't valid JSON, so Motif detected your apps instead.")] };
  }
  if (!Array.isArray(parsed?.apps)) {
    return { apps: null, findings: [bad('design/motif.json needs an "apps" list, so Motif detected your apps instead.')] };
  }
  const findings: Finding[] = [];
  const apps: AppInfo[] = parsed.apps.map((a: any) => {
    const stack = (STACK_IDS as readonly string[]).includes(a?.stack) ? (a.stack as StackId) : null;
    if (!stack) findings.push(bad(`Unknown stack "${String(a?.stack)}" for "${String(a?.path)}". Use one of: ${STACK_IDS.join(", ")}.`));
    return { path: rel(String(a?.path ?? ".")), stack, source: "motif.json" as const };
  });
  return { apps, findings };
}

export interface AppInfo {
  path: string;
  stack: StackId | null;
  source: "motif.json" | "detected";
}

export function detectApps(root: string): { apps: AppInfo[]; findings: Finding[] } {
  const settings = readSettings(root);
  if (settings.apps) return { apps: settings.apps, findings: settings.findings };

  const rootStack = detectStack(root);
  if (rootStack) return { apps: [{ path: ".", stack: rootStack, source: "detected" }], findings: settings.findings };

  const apps: AppInfo[] = [];
  const scan = (base: string) => {
    let entries: string[];
    try {
      entries = readdirSync(join(root, base)).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const relPath = base ? `${base}/${name}` : name;
      const abs = join(root, relPath);
      if (!isDir(abs)) continue;
      const stack = detectStack(abs);
      if (stack) apps.push({ path: rel(relPath), stack, source: "detected" });
    }
  };
  scan("");
  if (existsSync(join(root, "apps"))) scan("apps");
  if (existsSync(join(root, "packages"))) scan("packages");
  apps.sort((a, b) => a.path.localeCompare(b.path));
  return { apps, findings: settings.findings };
}
