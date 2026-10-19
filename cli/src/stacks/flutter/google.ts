// Which google_fonts families a Flutter app draws text in, found before a screenshot run so Motif can load them from
// files (decision 0007): from the design guide's fonts and from the app's code, through the table of the google_fonts
// package the app resolves.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { maskComments } from "../../check/mask";
import { loadTokenDocument } from "../../contract/load";
import { buildThemeSet } from "../../generate/theme";
import { themeFonts } from "../../generate/theme-fonts";

export interface ResolvedPackage {
  name: string;
  /** The package's folder. */
  root: string;
  /** From a pub cache folder name (connectivity_plus-6.1.5); unknown for path and git packages. */
  version?: string;
}

export const PACKAGE_CONFIG = ".dart_tool/package_config.json";

/** The packages the app resolved (flutter pub get writes .dart_tool/package_config.json), or null before pub get. */
export function resolvedPackages(appDir: string): Map<string, ResolvedPackage> | null {
  const file = join(appDir, PACKAGE_CONFIG);
  let config: { packages?: { name?: unknown; rootUri?: unknown }[] };
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const out = new Map<string, ResolvedPackage>();
  for (const p of config.packages ?? []) {
    if (typeof p.name !== "string" || typeof p.rootUri !== "string") continue;
    let root: string;
    try {
      root = fileURLToPath(new URL(p.rootUri, pathToFileURL(file)));
    } catch {
      continue;
    }
    const version = /-(\d+\.\d+\.\d+[^/\\]*)$/.exec(root.replace(/[\\/]+$/, ""))?.[1];
    out.set(p.name, { name: p.name, root, ...(version ? { version } : {}) });
  }
  return out;
}

const tables = new Map<string, Map<string, string>>();

/**
 * google_fonts' method names and the families they draw ("onest" → "Onest", "ibmPlexSans" → "IBM Plex Sans"), read from
 * its asMap() table ('IBM Plex Sans': PartI.ibmPlexSans,); the TextTheme methods are named after the same families.
 */
export function googleFontsTable(packageRoot: string): Map<string, string> {
  const cached = tables.get(packageRoot);
  if (cached) return cached;
  const table = new Map<string, string>();
  const walk = (dir: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".dart")) {
        const text = readFileSync(path, "utf8");
        if (!text.includes("asMap")) continue;
        for (const m of text.matchAll(/^\s*'([^']+)':\s*Part[A-Z]\.(\w+),/gm)) {
          if (!m[2]!.endsWith("TextTheme")) table.set(m[2]!, m[1]!);
        }
      }
    }
  };
  walk(join(packageRoot, "lib"));
  tables.set(packageRoot, table);
  return table;
}

const NOT_FAMILIES = new Set(["getFont", "getTextTheme", "asMap", "config"]);

/** Families the code asks google_fonts for: GoogleFonts.onest(…), GoogleFonts.onestTextTheme(…), GoogleFonts.getFont('Onest'…). */
export function familiesInCode(texts: string[], table: Map<string, string>): string[] {
  const found = new Set<string>();
  for (const raw of texts) {
    if (!raw.includes("GoogleFonts")) continue;
    const text = maskComments(raw, "dart");
    for (const m of text.matchAll(/GoogleFonts\.(getFont|getTextTheme)\s*\(\s*(['"])([^'"]+)\2/g)) found.add(m[3]!);
    for (const m of text.matchAll(/GoogleFonts\.(\w+)\s*\(/g)) {
      const method = m[1]!.replace(/TextTheme$/, "");
      if (NOT_FAMILIES.has(m[1]!)) continue;
      const family = table.get(method);
      if (family) found.add(family);
    }
  }
  return [...found];
}

/** The guide's fonts that come from Google Fonts (design/tokens.json), whatever google_fonts calls them. */
export function guideFamilies(root: string): string[] {
  const path = join(root, "design", "tokens.json");
  if (!existsSync(path)) return [];
  try {
    const { doc } = loadTokenDocument(path, readFileSync(path, "utf8"));
    if (!doc) return [];
    return themeFonts(buildThemeSet(doc).base)
      .filter((f) => f.source === "google" || f.source === "bundled")
      .map((f) => f.family);
  } catch {
    return [];
  }
}

/**
 * The google_fonts families to load for an app: the guide's (when google_fonts has them) and those its code (and its
 * shared packages' code) asks for. None when the app doesn't resolve google_fonts.
 */
export function googleFamilies(root: string, packages: Map<string, ResolvedPackage> | null, code: string[]): string[] {
  const pkg = packages?.get("google_fonts");
  if (!pkg) return [];
  const table = googleFontsTable(pkg.root);
  const known = new Set(table.values());
  const families = new Set([...guideFamilies(root).filter((f) => known.has(f)), ...familiesInCode(code, table)]);
  return [...families].sort();
}
