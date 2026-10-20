import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { stripBom } from "../../text";

function pubspec(dir: string): string | null {
  try {
    return stripBom(readFileSync(join(dir, "pubspec.yaml"), "utf8"));
  } catch {
    return null;
  }
}

const PLATFORMS = ["android", "ios", "macos", "web", "windows", "linux"];

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const usesFlutter = (text: string) => /sdk:\s*flutter/.test(text) || /^flutter:/m.test(text);

/**
 * A Flutter project that runs: it has a main file (lib/main.dart, or a flavor's lib/main_dev.dart) or platform folders.
 * Anything else is shared code that apps depend on.
 */
export function isFlutterApp(dir: string): boolean {
  const text = pubspec(dir);
  if (text === null || !usesFlutter(text)) return false;
  if (PLATFORMS.some((p) => isDir(join(dir, p)))) return true;
  try {
    return readdirSync(join(dir, "lib")).some((n) => /^main.*\.dart$/.test(n));
  } catch {
    return false;
  }
}

export function isFlutterPackage(dir: string): boolean {
  const text = pubspec(dir);
  return text !== null && usesFlutter(text) && !isFlutterApp(dir);
}

export function packageName(dir: string): string | null {
  return pubspec(dir)?.match(/^name:\s*["']?([A-Za-z0-9_]+)["']?\s*$/m)?.[1] ?? null;
}

/** True when the package lists pkg under dependencies or dev_dependencies. */
export function dependsOn(dir: string, pkg: string): boolean {
  const text = pubspec(dir);
  if (text === null) return false;
  let section = "";
  let indent: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const top = line.match(/^([A-Za-z_]+):/);
    if (top) {
      section = top[1]!;
      indent = null;
      continue;
    }
    if (section !== "dependencies" && section !== "dev_dependencies") continue;
    const key = line.match(/^(\s+)([A-Za-z0-9_]+)\s*:/);
    if (!key) continue;
    indent ??= key[1]!.length;
    if (key[1]!.length === indent && key[2] === pkg) return true;
  }
  return false;
}

/** The packages a pubspec.yaml's dependencies take from a folder (core: path: ../packages/core), as written. */
export function pathDependencies(dir: string): { name: string; path: string }[] {
  const text = pubspec(dir);
  if (text === null) return [];
  const out: { name: string; path: string }[] = [];
  let inDeps = false;
  let indent: number | null = null;
  let current: string | null = null;
  /** How far the current package's own keys (path:, git:, version:) are indented; a git: dependency's path: is deeper. */
  let childIndent: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (/^\S/.test(line)) {
      inDeps = /^dependencies:\s*(#.*)?$/.test(line);
      indent = null;
      current = null;
      continue;
    }
    if (!inDeps) continue;
    const lead = line.length - line.trimStart().length;
    const key = line.match(/^\s+([A-Za-z0-9_]+)\s*:\s*(.*?)\s*(#.*)?$/);
    if (!key) continue;
    indent ??= lead;
    if (lead === indent) {
      current = key[1]!;
      childIndent = null;
      continue;
    }
    if (!current || lead < indent) continue;
    childIndent ??= lead;
    if (lead === childIndent && key[1] === "path" && key[2]) out.push({ name: current, path: key[2].replace(/^["']|["']$/g, "") });
  }
  return out;
}

/** The font families a pubspec.yaml bundles (flutter: fonts: - family: Name). */
export function fontFamilies(text: string): string[] {
  return fontAssets(text).map((f) => f.family);
}

/** A font family a pubspec.yaml bundles, with its files (asset paths relative to the pubspec's folder). */
export interface BundledFont {
  family: string;
  files: { asset: string; weight: number; style: "normal" | "italic" }[];
}

/** The font families a pubspec.yaml bundles, each with its asset files, weights and styles. */
export function fontAssets(text: string): BundledFont[] {
  const families: BundledFont[] = [];
  const value = (line: string, key: string) => line.match(new RegExp(`^\\s*-?\\s*${key}:\\s*["']?([^"'#]+?)["']?\\s*(#.*)?$`))?.[1]?.trim();
  let inFlutter = false;
  let inFonts = false;
  let fontsIndent = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inFlutter = /^flutter:\s*(#.*)?$/.test(line);
      inFonts = false;
      continue;
    }
    if (!inFlutter) continue;
    const key = line.match(/^(\s+)fonts:\s*(#.*)?$/);
    if (key && (!inFonts || key[1]!.length <= fontsIndent)) {
      inFonts = true;
      fontsIndent = key[1]!.length;
      continue;
    }
    if (inFonts && indent <= fontsIndent && !line.trimStart().startsWith("-")) inFonts = false;
    if (!inFonts) continue;
    const family = value(line, "family");
    if (family) {
      families.push({ family, files: [] });
      continue;
    }
    const files = families[families.length - 1]?.files;
    if (!files) continue;
    const asset = value(line, "asset");
    const last = files[files.length - 1];
    if (asset) files.push({ asset, weight: 400, style: "normal" });
    else if (last && value(line, "weight") && /^\d+$/.test(value(line, "weight")!)) last.weight = Number(value(line, "weight"));
    else if (last && value(line, "style") === "italic") last.style = "italic";
  }
  return families;
}

/** The import line for a file under a package's lib/ folder, using the nearest pubspec.yaml above it. */
export function importFor(root: string, file: string): string | null {
  const abs = resolve(root, file);
  const top = resolve(root);
  for (let dir = dirname(abs); dir.startsWith(top); dir = dirname(dir)) {
    if (pubspec(dir) !== null) {
      const name = packageName(dir);
      const inPackage = abs.slice(dir.length + 1).split(sep).join("/");
      return name && inPackage.startsWith("lib/") ? `package:${name}/${inPackage.slice(4)}` : null;
    }
    if (dir === top) break;
  }
  return null;
}
