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
