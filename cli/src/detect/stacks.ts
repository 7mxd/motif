import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";
import type { Finding } from "../findings";
import { badPackagePart, composeAppFolders, composeModule, composeModules, multiplatformModule } from "../stacks/compose/project";
import { isFlutterPackage } from "../stacks/flutter/project";
import { swiftUIApp } from "../stacks/swiftui/project";
import { savedAsUtf16, stripBom, UTF16_MESSAGE } from "../text";

export const STACK_IDS = ["react-web", "vue", "svelte", "angular", "react-native", "flutter", "swiftui", "compose", "compose-multiplatform", "plain-web"] as const;
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
  "compose-multiplatform": "Compose Multiplatform",
  "plain-web": "Plain web (HTML and CSS)",
};

/**
 * Stacks Motif treats as supported (doctor's "Full support", check, extract, tokens and shot). A stack joins when its
 * adapter is built; a release lists it only once its parity row (docs/parity.md) is done in every area, which the
 * release workflow checks (test/release-gate.test.ts, with MOTIF_RELEASE=1).
 */
export const ADAPTERS_AVAILABLE: readonly StackId[] = ["react-web", "plain-web", "vue", "svelte", "angular", "flutter", "compose", "react-native", "swiftui"];
/**
 * The supported web stacks: motif extract reads their CSS and markup (Vue's .vue, Svelte's .svelte and Angular's component files through
 * their registered stacks);
 * Flutter, Compose, React Native and SwiftUI go through their own stacks.
 */
export const WEB_STACKS: readonly StackId[] = ["react-web", "plain-web", "vue", "svelte", "angular"];
export const NODE_STACKS: readonly StackId[] = ["react-web", "vue", "svelte", "angular", "react-native"];

/** Where a plain web app's pages live: the first of these folders (inside the app) with an index.html. */
export const SITE_FOLDERS = [".", "public", "src", "site", "www"] as const;

/** Folders that hold apps, documentation, Motif's own files, templates, tests or reports: never a plain web app themselves. */
const NOT_SITES = new Set(["apps", "packages", "docs", "design", "templates", "test", "tests", "coverage", "out", "storybook-static"]);

/** Pages built by another UI library or a static-site generator: their sources aren't plain HTML and CSS. */
const NOT_PLAIN_DEPS = ["preact", "solid-js", "lit", "@builder.io/qwik", "@stencil/core", "ember-source", "astro", "@11ty/eleventy"];
const SSG_FILES = ["mkdocs.yml", "_config.yml", "hugo.toml", "hugo.yaml", "hugo.json", ".eleventy.js", "eleventy.config.js", "eleventy.config.mjs", "eleventy.config.cjs"];
/**
 * A static-site generator's config that other tools also use (config.toml, config.yaml): Hugo's older layout and Zola
 * are told apart by the folders they have.
 */
function isGeneratorSite(dir: string, entries: string[]): boolean {
  const has = (d: string) => isDir(join(dir, d));
  if (has(join("config", "_default"))) return true;
  if (!["config.toml", "config.yaml", "config.yml", "config.json"].some((f) => entries.includes(f))) return false;
  return ["layouts", "themes", "archetypes", "templates"].some(has);
}

export function siteFolder(dir: string): string | null {
  return SITE_FOLDERS.find((f) => existsSync(join(dir, f, "index.html")) || existsSync(join(dir, f, "index.htm"))) ?? null;
}

/** React counts as a web app only alongside web build tooling; a server that renders React (e.g. emails) is not one. */
const REACT_WEB_TOOLING = [
  "next", "vite", "@vitejs/plugin-react", "@vitejs/plugin-react-swc", "react-scripts", "@remix-run/react",
  "@react-router/dev", "gatsby", "astro", "parcel", "webpack", "@rsbuild/core", "@rspack/core", "@tanstack/react-start",
];

const SKIP_DIRS = new Set(["node_modules", "Pods", ".build", "DerivedData", "build", "dist"]);

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
    const pkg = JSON.parse(stripBom(text));
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

  if (composeModule(dir) || composeModules(dir).length > 0) return "compose";

  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  // An Xcode project with an app target, or a Swift package with an executable, whose sources import SwiftUI.
  if ((entries.includes("Package.swift") || entries.some((e) => e.endsWith(".xcodeproj"))) && swiftUIApp(dir)) return "swiftui";

  // Pages without a framework. React without known tooling isn't plain web: it's an app Motif can't place yet.
  if (deps?.has("react") || NOT_PLAIN_DEPS.some((d) => deps?.has(d))) return null;
  if (SSG_FILES.some((f) => entries.includes(f)) || isGeneratorSite(dir, entries)) return null;
  return siteFolder(dir) !== null ? "plain-web" : null;
}

function hasXcodeWorkspace(dir: string): boolean {
  try {
    return readdirSync(dir).some((n) => n.endsWith(".xcworkspace"));
  } catch {
    return false;
  }
}

const SERVER_FRAMEWORKS = ["express", "fastify", "koa", "hono", "@nestjs/core", "@hapi/hapi"];

/** A workspace root (npm, yarn or pnpm workspaces): its apps live in folders, though it may hoist their dependencies. */
function isWorkspaceRoot(dir: string): boolean {
  if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
  try {
    const workspaces = JSON.parse(stripBom(readText(join(dir, "package.json")) ?? "{}")).workspaces;
    // An empty list ("workspaces": []) names no workspace.
    return Array.isArray(workspaces) ? workspaces.length > 0 : Boolean(workspaces?.packages?.length);
  } catch {
    return false;
  }
}

/** Files and folders of an app's own: a workspace root with these is an app, whatever its workspaces hold. */
const APP_FILES = /^(next|vite|nuxt|svelte|astro|remix|webpack|metro)\.config\.\w+$|^(index\.html|app\.json|app\.config\.\w+|angular\.json|app|pages|src|public)$/;
const hasOwnAppFiles = (dir: string) => {
  try {
    return readdirSync(dir).some((n) => APP_FILES.test(n));
  } catch {
    return false;
  }
};

/**
 * React UI code Motif can't place: React without known web tooling (detectStack returned null),
 * not a server that merely renders React, and not a workspace root. Such apps are listed with an
 * unknown stack so doctor asks for design/motif.json instead of offering to start a new app.
 */
function isUnrecognisedReactApp(dir: string): boolean {
  const deps = packageDeps(dir);
  if (!deps || !deps.has("react") || SERVER_FRAMEWORKS.some((d) => deps.has(d))) return false;
  return !isWorkspaceRoot(dir);
}

const rel = (path: string) => path.replace(/\\/g, "/");

function readSettings(root: string): { apps: AppInfo[] | null; findings: Finding[] } {
  const file = "design/motif.json";
  const text = readText(join(root, "design", "motif.json"));
  if (text === null) return { apps: null, findings: [] };
  const bad = (message: string): Finding => ({ code: "bad-settings", severity: "error", file, message });
  if (savedAsUtf16(text)) return { apps: null, findings: [{ ...bad(`design/motif.json: ${UTF16_MESSAGE}`), code: "not-utf8" }] };
  let parsed: any;
  try {
    parsed = JSON.parse(stripBom(text));
  } catch {
    return { apps: null, findings: [bad("design/motif.json isn't valid JSON, so Motif detected your apps instead.")] };
  }
  if (!Array.isArray(parsed?.apps)) {
    return { apps: null, findings: [bad('design/motif.json needs an "apps" list, so Motif detected your apps instead.')] };
  }
  const findings: Finding[] = [];
  const apps: AppInfo[] = [];
  for (const a of parsed.apps as any[]) {
    const path = rel(String(a?.path ?? "."));
    if (isAbsolute(path) || /^[A-Za-z]:\//.test(path)) {
      findings.push(bad(`design/motif.json lists "${path}" as a full path: write it relative to this folder, like "${path.split("/").filter(Boolean).pop() ?? "web"}".`));
      continue;
    }
    // An app that isn't there (moved, or a typo) is left out: every command would fail on it.
    if (!isDir(join(root, path))) {
      findings.push(bad(`design/motif.json lists "${path}", but there's no such folder here.`));
      continue;
    }
    const stack = (STACK_IDS as readonly string[]).includes(a?.stack) ? (a.stack as StackId) : null;
    if (!stack) findings.push(bad(`Unknown stack "${String(a?.stack)}" for "${String(a?.path)}". Use one of: ${STACK_IDS.join(", ")}.`));
    let srcDir = typeof a?.srcDir === "string" ? rel(a.srcDir) : undefined;
    if (srcDir !== undefined && !isDir(join(root, path, srcDir))) {
      findings.push(bad(`design/motif.json says the pages of "${path}" are in "${srcDir}", but there's no such folder.`));
      srcDir = undefined;
    }
    let themeDir: string | undefined;
    if (a?.themeDir !== undefined) {
      const t = typeof a.themeDir === "string" ? rel(a.themeDir).replace(/\/+$/, "") : "";
      if (t === "" || t === "." || isAbsolute(t) || /^[A-Za-z]:/.test(t) || t.split("/").includes("..")) {
        findings.push(bad(`design/motif.json: the themeDir for "${path}" must be a folder inside this project, like "lib/design".`));
      } else if (stack === "compose" && badPackagePart(t) !== null) {
        // Its folders below the source folder are the theme's Kotlin package: a part Kotlin won't take doesn't compile.
        findings.push(bad(
          `design/motif.json: the themeDir for "${path}" (${t}) can't be a Kotlin package, because "${badPackagePart(t)}" isn't a Kotlin name. ` +
            "Rename that folder (letters, digits and underscores, not starting with a digit, and not a Kotlin keyword) or choose another themeDir, then run motif tokens again.",
        ));
      } else {
        themeDir = t;
      }
    }
    apps.push({ path, stack, source: "motif.json" as const, ...(srcDir !== undefined ? { srcDir } : {}), ...(themeDir !== undefined ? { themeDir } : {}) });
  }
  // With none left, Motif finds the apps itself.
  return { apps: apps.length > 0 ? apps : null, findings };
}

export interface AppInfo {
  path: string;
  stack: StackId | null;
  source: "motif.json" | "detected";
  srcDir?: string;
  /** Where the theme code goes, relative to the project root (from design/motif.json). */
  themeDir?: string;
}

/**
 * An app as detected. A Compose module with the Kotlin Multiplatform plugin is Compose Multiplatform, which Motif doesn't
 * support yet: its code is in src/commonMain, where theme code for Jetpack Compose wouldn't be compiled.
 */
const detected = (root: string, path: string, stack: StackId | null): AppInfo => ({
  path,
  stack: stack === "compose" && multiplatformModule(join(root, path)) ? "compose-multiplatform" : stack,
  source: "detected",
  ...(stack === "plain-web" ? { srcDir: siteFolder(join(root, path)) ?? "." } : {}),
});

/** A path as the system sees it: links followed, and in one case where case doesn't count. */
function systemPath(path: string): string {
  let p = resolve(path);
  try {
    p = realpathSync.native(p);
  } catch {}
  return process.platform === "win32" || process.platform === "darwin" ? p.toLowerCase() : p;
}

/** A home folder or a drive's root: looking through every folder there is slow, and on macOS asks for permissions. */
function tooWide(root: string, home: string | null): "home" | "root" | null {
  const r = resolve(root);
  if (r === parse(r).root) return "root";
  return home !== null && systemPath(r) === systemPath(home) ? "home" : null;
}

function homeFolder(): string | null {
  try {
    return homedir();
  } catch {
    return null; // no HOME or USERPROFILE: there's no home folder to stay out of
  }
}

/** The stacks whose apps are looked for one folder further (mobile/customer): a monorepo's mobile/ folder holds several. */
const NESTED_STACKS: ReadonlySet<StackId> = new Set<StackId>(["flutter", "compose", "swiftui", "react-native"]);

export function detectApps(root: string, opts: { home?: string } = {}): { apps: AppInfo[]; findings: Finding[] } {
  const settings = readSettings(root);
  if (settings.apps) return { apps: settings.apps, findings: settings.findings };
  const wide = tooWide(root, opts.home ?? homeFolder());
  if (wide) {
    return {
      apps: [],
      findings: [...settings.findings, {
        code: "home-folder",
        severity: "warning",
        file: ".",
        message: `This is your ${wide === "home" ? "home folder" : "drive's root folder"}, so Motif doesn't look through every folder in it. Run Motif inside your app's folder, or list your apps in design/motif.json.`,
      }],
    };
  }

  const rootStack = detectStack(root);
  // Pages at the root may sit beside an app in a subfolder (a server's public/ and a React client/): look further first.
  // A workspace root without app files of its own, whose hoisted dependencies only look like one app, is looked
  // through too.
  const workspace = isWorkspaceRoot(root) && !hasOwnAppFiles(root);
  // A Gradle project root lists its Compose modules (app), not itself; one with no app module is looked through.
  // An Xcode workspace beside its app project lists the apps in the folders around it as well.
  const swiftWorkspace = rootStack === "swiftui" && hasXcodeWorkspace(root);
  const composeRoot = rootStack === "compose" && !workspace ? composeAppFolders(root) : null;
  if (composeRoot && composeRoot.length > 0 && composeRoot[0] !== ".") {
    return { apps: composeRoot.map((m) => detected(root, m, "compose")).sort((a, b) => a.path.localeCompare(b.path)), findings: settings.findings };
  }
  if (((rootStack && rootStack !== "plain-web") || isUnrecognisedReactApp(root)) && !workspace && !swiftWorkspace && composeRoot?.length !== 0) {
    return { apps: [detected(root, ".", rootStack)], findings: settings.findings };
  }

  const apps: AppInfo[] = [];
  // A Gradle project lists its app modules (mobile/android/app), never its libraries. True when the folder is handled.
  const addCompose = (relPath: string, abs: string): boolean => {
    const folders = composeAppFolders(abs);
    if (folders === null) return false;
    for (const m of folders) apps.push(detected(root, rel(m === "." ? relPath : `${relPath}/${m}`), "compose"));
    return true;
  };
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
      if (stack === "plain-web" && NOT_SITES.has(name)) continue;
      if (stack === "flutter" && isFlutterPackage(abs)) continue;
      if (stack === "compose" && addCompose(relPath, abs)) continue;
      if (stack || isUnrecognisedReactApp(abs)) {
        apps.push(detected(root, rel(relPath), stack));
      } else if (!base && name !== "apps" && name !== "packages") {
        nested(relPath);
      }
    }
  };
  // One folder further (mobile/customer, mobile/admin), for native and mobile stacks only (a web app under examples/
  // or e2e/ is a fixture, not an app), and never for shared Flutter packages.
  const nested = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(join(root, dir)).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const relPath = `${dir}/${name}`;
      const abs = join(root, relPath);
      if (!isDir(abs)) continue;
      const stack = detectStack(abs);
      if (!stack || !NESTED_STACKS.has(stack) || (stack === "flutter" && isFlutterPackage(abs))) continue;
      if (stack === "compose" && addCompose(relPath, abs)) continue;
      apps.push(detected(root, rel(relPath), stack));
    }
  };
  scan("");
  if (existsSync(join(root, "apps"))) scan("apps");
  if (existsSync(join(root, "packages"))) scan("packages");
  if (swiftWorkspace) apps.push(detected(root, ".", "swiftui"));
  apps.sort((a, b) => a.path.localeCompare(b.path));
  // Its folders explain the root only with an app of a known stack among them (not a library or a report folder).
  if (workspace && rootStack && rootStack !== "plain-web" && !apps.some((a) => a.stack && a.stack !== "plain-web")) {
    return { apps: [detected(root, ".", rootStack)], findings: settings.findings };
  }
  if (rootStack === "plain-web") {
    const others = apps.filter((a) => a.stack !== "plain-web");
    return { apps: others.length > 0 ? others : [detected(root, ".", rootStack)], findings: settings.findings };
  }
  return { apps, findings: settings.findings };
}

/** A plain web app's site folder, relative to the app: from design/motif.json, or found again. */
export function siteDir(root: string, app: AppInfo): string {
  return app.srcDir ?? siteFolder(join(root, app.path)) ?? ".";
}
