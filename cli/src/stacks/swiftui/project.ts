import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../../text";

export interface SwiftUIApp {
  /** An Xcode project, or a Swift package that builds an executable. */
  kind: "xcodeproj" | "package";
  /** The app target's name. */
  name: string;
  /** The project or manifest file, relative to the app's folder (Rafiq.xcodeproj, Package.swift). */
  project: string;
  platforms: ("ios" | "macos")[];
  /** The target's folder, relative to the app's folder (Rafiq, Sources/Rafiq). */
  sourceRoot: string;
}

const SKIP_DIRS = new Set(["node_modules", "Pods", ".build", "DerivedData", "build", "dist"]);
const SWIFT_MAX_DEPTH = 4;
const SWIFT_MAX_FILES = 2000;
/** Files and folders looked at, at most: a project with very many folders is looked through only so far. */
const SWIFT_MAX_ENTRIES = 5000;
/** Folders that never hold Swift sources: asset catalogues, translations, bundles, project files, dependencies. */
const NOT_SOURCES = /\.(xcassets|lproj|bundle|framework|xcframework|xcodeproj|xcworkspace)$|^(Carthage|SourcePackages)$/;

function read(path: string): string | null {
  try {
    return stripBom(readFileSync(path, "utf8"));
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

/** True when a Swift file in the folder (or one inside it, a few levels down) imports SwiftUI. */
export function hasSwiftUIImport(dir: string): boolean {
  let scanned = 0;
  let seen = 0;
  const visit = (d: string, depth: number): boolean => {
    if (depth > SWIFT_MAX_DEPTH || scanned >= SWIFT_MAX_FILES || seen >= SWIFT_MAX_ENTRIES) return false;
    let entries: string[];
    try {
      // In name order: Linux and macOS list a folder in no set order, and how far the scan goes must not depend on it.
      entries = readdirSync(d).sort();
    } catch {
      return false;
    }
    const names = entries.filter((n) => !n.startsWith(".") && !SKIP_DIRS.has(n) && !NOT_SOURCES.test(n));
    // A folder's own Swift files first, then its folders: the app's views are found before a deep folder is.
    for (const name of names.filter((n) => n.endsWith(".swift"))) {
      if (++seen > SWIFT_MAX_ENTRIES) return false;
      scanned++;
      if (read(join(d, name))?.includes("import SwiftUI")) return true;
      if (scanned >= SWIFT_MAX_FILES) return false;
    }
    for (const name of names.filter((n) => !n.endsWith(".swift"))) {
      if (++seen > SWIFT_MAX_ENTRIES) return false;
      const p = join(d, name);
      if (isDir(p) && visit(p, depth + 1)) return true;
    }
    return false;
  };
  return visit(dir, 0);
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/s, "$1");

/** The objects of a project file that have a given isa, as their text between the braces. */
function objects(pbx: string, isa: string): string[] {
  return [...pbx.matchAll(new RegExp(`\\{[^{}]*\\bisa = ${isa};[^{}]*\\}`, "g"))].map((m) => m[0]);
}

const field = (block: string, name: string) => block.match(new RegExp(`\\b${name} = ("[^"]*"|[^;\\s]+);`))?.[1];

/** The platforms a project's build settings (SDKROOT, SUPPORTED_PLATFORMS) name; iOS when they name none. */
function pbxPlatforms(pbx: string): ("ios" | "macos")[] {
  const values = [...pbx.matchAll(/\b(?:SDKROOT|SUPPORTED_PLATFORMS) = ("[^"]*"|[^;\s]+);/g)].map((m) => unquote(m[1]!));
  const words = values.flatMap((v) => v.split(/\s+/));
  const out: ("ios" | "macos")[] = [];
  if (words.includes("iphoneos") || words.includes("iphonesimulator")) out.push("ios");
  if (words.includes("macosx")) out.push("macos");
  return out.length > 0 ? out : ["ios"];
}

function xcodeApp(dir: string, projectFolder: string): SwiftUIApp | null {
  const pbx = read(join(dir, projectFolder, "project.pbxproj"));
  if (pbx === null) return null;
  const targets = objects(pbx, "PBXNativeTarget").filter((t) => unquote(field(t, "productType") ?? "") === "com.apple.product-type.application");
  const target = targets.find((t) => !/Tests?$/.test(unquote(field(t, "name") ?? ""))) ?? targets[0];
  if (!target) return null;
  const name = unquote(field(target, "name") ?? "") || projectFolder.replace(/\.xcodeproj$/, "");

  // The target's folder: its name's, or the folder a file-system synchronized group (Xcode 16) gives it.
  const candidates = [name];
  const groups = target.match(/fileSystemSynchronizedGroups = \(([^)]*)\)/)?.[1] ?? "";
  for (const id of groups.matchAll(/\b(\w+)\b/g)) {
    const group = pbx.match(new RegExp(String.raw`\b${id[1]} (?:/\*[^*]*\*/ )?= (\{[^{}]*\})`))?.[1];
    const path = group ? unquote(field(group, "path") ?? "") : "";
    if (path && !candidates.includes(path)) candidates.push(path);
  }
  const folder = candidates.find((c) => isDir(join(dir, c)) && hasSwiftUIImport(join(dir, c)));
  if (folder === undefined) return null;
  return { kind: "xcodeproj", name, project: projectFolder, platforms: pbxPlatforms(pbx), sourceRoot: folder };
}

/** A manifest's text without its comments. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function packageApp(dir: string): SwiftUIApp | null {
  const raw = read(join(dir, "Package.swift"));
  if (raw === null) return null;
  const text = stripComments(raw);
  const exe = text.match(/\.executableTarget\s*\(\s*name:\s*"([^"]+)"/)?.[1];
  const product = text.match(/\.(?:executable|iOSApplication)\s*\(\s*name:\s*"([^"]+)"/)?.[1];
  if (exe === undefined && product === undefined && !/\.executableTarget\s*\(|\.iOSApplication\s*\(/.test(text)) return null;
  const name = exe ?? product ?? "App";
  const candidates = [`Sources/${name}`, "Sources"];
  const folder = candidates.find((c) => isDir(join(dir, c)) && hasSwiftUIImport(join(dir, c)));
  if (folder === undefined) return null;
  const platforms: ("ios" | "macos")[] = [];
  const block = text.match(/\bplatforms:\s*\[([^\]]*)\]/)?.[1] ?? "";
  if (/\.iOS\b/.test(block)) platforms.push("ios");
  if (/\.macOS\b/.test(block)) platforms.push("macos");
  if (platforms.length === 0) platforms.push(/\.iOSApplication\s*\(/.test(text) ? "ios" : "macos");
  return { kind: "package", name, project: "Package.swift", platforms, sourceRoot: folder };
}

/**
 * The SwiftUI app a folder builds: an Xcode project with an application target whose sources import SwiftUI, or a
 * Swift package with an executable target importing SwiftUI. Null for a library, a framework, UIKit or an empty folder.
 */
export function swiftUIApp(dir: string): SwiftUIApp | null {
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return null;
  }
  for (const e of entries.filter((n) => n.endsWith(".xcodeproj"))) {
    const app = xcodeApp(dir, e);
    if (app) return app;
  }
  return entries.includes("Package.swift") ? packageApp(dir) : null;
}
