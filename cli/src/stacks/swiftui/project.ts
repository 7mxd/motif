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
  /** The target's folder, relative to the app's folder (Rafiq, Sources/Rafiq), or "." when the target's files sit at the root. */
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

/** True when a Swift file in the folder (or one inside it, a few levels down) satisfies the test; the search is capped. */
function someSwiftFile(dir: string, test: (text: string) => boolean): boolean {
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
      const text = read(join(d, name));
      if (text !== null && test(text)) return true;
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

/** True when a Swift file in the folder (or one inside it, a few levels down) imports SwiftUI. */
export function hasSwiftUIImport(dir: string): boolean {
  return someSwiftFile(dir, (text) => text.includes("import SwiftUI"));
}

/** True when a Swift file in the folder is a SwiftUI app's entry point: @main struct X: App. */
function hasAppEntry(dir: string): boolean {
  return someSwiftFile(dir, (text) => /@main\s+(?:(?:@\w+(?:\([^)]*\))?|public|internal|open|package|final|nonisolated)\s+)*(?:struct|class)\s+\w+\s*:\s*[^{]*\bApp\b/.test(text));
}

interface PbxObject {
  /** The whole object, braces included. */
  text: string;
  /** The object without the objects nested in it (buildSettings = { … }). */
  own: string;
}

/** Every `ID /* name *\/ = { … }` in a project file, by id; nested ones (buildSettings) too. */
function pbxObjects(pbx: string): Map<string, PbxObject> {
  const out = new Map<string, PbxObject>();
  for (const m of pbx.matchAll(/\b(\w+)(?:\s*\/\*[^*]*\*\/)?\s*=\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    let quoted = false;
    let own = "";
    let end = -1;
    for (let i = open; i < pbx.length; i++) {
      const c = pbx[i]!;
      if (quoted) {
        if (c === "\\") {
          if (depth === 1) own += c + (pbx[i + 1] ?? "");
          i++;
          continue;
        }
        if (c === '"') quoted = false;
        if (depth === 1) own += c;
        continue;
      }
      if (c === '"') quoted = true;
      if (c === "{") depth++;
      if (depth === 1) own += c;
      if (c === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1 || !/\bisa = /.test(own)) continue;
    out.set(m[1]!, { text: pbx.slice(open, end + 1), own });
  }
  return out;
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/s, "$1");
const field = (block: string, name: string) => block.match(new RegExp(`\\b${name} = ("[^"]*"|[^;\\s]+)(?:\\s*\\/\\*[^;]*?\\*\\/)?\\s*;`))?.[1];
/** The ids in a parenthesised list (`ID1 /* Debug *\/, ID2 /* Release *\/,`), not the words of its comments. */
const idsIn = (list: string | undefined) => (list ?? "").replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim()).filter(Boolean);

/** The text of a target's own build settings: every configuration of its configuration list. */
function targetSettings(objs: Map<string, PbxObject>, target: PbxObject): string {
  const list = objs.get(field(target.own, "buildConfigurationList") ?? "");
  const configs = idsIn(list?.own.match(/buildConfigurations = \(([^)]*)\)/)?.[1]);
  return configs.map((id) => objs.get(id)?.text ?? "").join("\n");
}

/** The platforms build settings (SDKROOT, SUPPORTED_PLATFORMS) name; iOS when they name none. */
function settingsPlatforms(settings: string): ("ios" | "macos")[] {
  const values = [...settings.matchAll(/\b(?:SDKROOT|SUPPORTED_PLATFORMS) = ("[^"]*"|[^;\s]+);/g)].map((m) => unquote(m[1]!));
  const words = values.flatMap((v) => v.split(/\s+/));
  const out: ("ios" | "macos")[] = [];
  if (words.includes("iphoneos") || words.includes("iphonesimulator")) out.push("ios");
  if (words.includes("macosx")) out.push("macos");
  return out.length > 0 ? out : ["ios"];
}

/** True for a target built for the watch, the TV or Vision Pro only: never the app a design guide is for. */
function otherDevice(settings: string): boolean {
  const sdks = [...settings.matchAll(/\bSDKROOT = ("[^"]*"|[^;\s]+);/g)].map((m) => unquote(m[1]!));
  return sdks.length > 0 && sdks.every((v) => /^(watchos|appletvos|xros)/.test(v));
}

/** The folders beside the project that may hold the app: Shared/ first, then one named like the project, then by name. */
function siblingFolders(dir: string, name: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).sort();
  } catch {}
  const folders = entries.filter((n) => !n.startsWith(".") && !SKIP_DIRS.has(n) && !NOT_SOURCES.test(n) && !/Tests?$/.test(n) && isDir(join(dir, n)));
  const rank = (n: string) => (n === "Shared" ? 0 : n.toLowerCase() === name.toLowerCase() ? 1 : 2);
  return folders.sort((a, b) => rank(a) - rank(b));
}

function xcodeApp(dir: string, projectFolder: string): SwiftUIApp | null {
  const pbx = read(join(dir, projectFolder, "project.pbxproj"));
  if (pbx === null) return null;
  const objs = pbxObjects(pbx);
  const targets = [...objs.values()].filter(
    (o) => /\bisa = PBXNativeTarget;/.test(o.own) && unquote(field(o.own, "productType") ?? "") === "com.apple.product-type.application",
  );
  const named = (t: PbxObject) => unquote(field(t.own, "name") ?? "");
  const projectName = projectFolder.replace(/\.xcodeproj$/, "");
  const apps = targets.filter((t) => !/Tests?$/.test(named(t)));
  const settings = new Map(apps.map((t) => [t, targetSettings(objs, t)]));
  // The target named like the project, then those for a phone, tablet or Mac (not the watch, TV or Vision Pro), then the rest.
  const rank = (t: PbxObject) => (named(t).toLowerCase() === projectName.toLowerCase() ? 0 : otherDevice(settings.get(t)!) ? 2 : 1);
  const ordered = [...apps].sort((x, y) => rank(x) - rank(y));
  if (ordered.length === 0) return null;
  const folderOf = (t: PbxObject): string | undefined => {
    // The target's folder: its name's, or the folder a file-system synchronized group (Xcode 16) gives it.
    const candidates = [named(t) || projectName];
    for (const id of idsIn(t.own.match(/fileSystemSynchronizedGroups = \(([^)]*)\)/)?.[1])) {
      const path = unquote(field(objs.get(id)?.own ?? "", "path") ?? "");
      if (path && !candidates.includes(path)) candidates.push(path);
    }
    return candidates.find((c) => isDir(join(dir, c)) && hasSwiftUIImport(join(dir, c)));
  };
  let target = ordered.find((t) => folderOf(t) !== undefined);
  let folder = target ? folderOf(target) : undefined;
  if (!target || folder === undefined) {
    // A renamed target, or the Multiplatform template's "X (iOS)" with its code in Shared/: the folder beside the project with the app's entry point.
    target = ordered[0]!;
    folder = siblingFolders(dir, projectName).find((f) => hasAppEntry(join(dir, f)));
  }
  if (folder === undefined) return null;
  return { kind: "xcodeproj", name: named(target) || projectName, project: projectFolder, platforms: settingsPlatforms(settings.get(target)!), sourceRoot: folder };
}

/** A manifest's text without its comments. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

/** The arguments of each call of a manifest function (`.target(`), up to its closing parenthesis. */
function calls(text: string, fn: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`\\.${fn}\\s*\\(`, "g"))) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

const stringArg = (call: string, label: string) => call.match(new RegExp(`\\b${label}:\\s*"([^"]*)"`))?.[1];

function packageApp(dir: string): SwiftUIApp | null {
  const raw = read(join(dir, "Package.swift"));
  if (raw === null) return null;
  const text = stripComments(raw);
  // Each target's folder (its path:), the executable ones, and the targets an executable or app product (a Playgrounds .iOSApplication) is built from.
  const paths = new Map<string, string | undefined>();
  const executables = new Set<string>();
  for (const fn of ["target", "executableTarget"]) {
    for (const c of calls(text, fn)) {
      const n = stringArg(c, "name");
      if (!n) continue;
      // A dependency written .target(name: "App") names a target without declaring it: it never replaces a declared path.
      const path = stringArg(c, "path");
      if (path !== undefined || !paths.has(n)) paths.set(n, path);
      if (fn === "executableTarget") executables.add(n);
    }
  }
  for (const fn of ["executable", "iOSApplication"]) {
    for (const c of calls(text, fn)) {
      for (const t of (c.match(/\btargets:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)) executables.add(t[1]!);
    }
  }
  // The first executable target whose own folder (its path:, else Sources/<name>) imports SwiftUI.
  for (const name of [...executables].sort()) {
    const path = (paths.get(name) ?? `Sources/${name}`).replace(/^\.\//, "").replace(/\/+$/, "") || ".";
    if (path.startsWith("..") || !isDir(join(dir, path)) || !hasSwiftUIImport(join(dir, path))) continue;
    const platforms: ("ios" | "macos")[] = [];
    const block = text.match(/\bplatforms:\s*\[([^\]]*)\]/)?.[1] ?? "";
    if (/\.iOS\b/.test(block)) platforms.push("ios");
    if (/\.macOS\b/.test(block)) platforms.push("macos");
    if (platforms.length === 0) platforms.push(/\.iOSApplication\s*\(/.test(text) ? "ios" : "macos");
    return { kind: "package", name, project: "Package.swift", platforms, sourceRoot: path };
  }
  return null;
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
