// The font files a SwiftUI app ships: what each one is (its family and names, read from the file), and which the app
// registers in its Info.plist. SwiftUI has no way to load a font from Google, so a family the app draws with
// Font.custom is one it ships, and a family it ships is its own.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readFontTables } from "../../extract/font-file";
import { weightStyleOf } from "../../extract/own-fonts";

/** A font file in the app, read from its own tables where it can be. */
export interface FontFile {
  /** Root-relative, with forward slashes. */
  path: string;
  /** The family Font.custom finds it by: the file's typographic family (name 16), else its family (name 1), else its name's. */
  family: string;
  /** Every name Font.custom matches it by, as keys: the family, the full name, the PostScript name and the file's base name. */
  keys: Set<string>;
  weight: number;
  style: "normal" | "italic";
  /** A variable font's weight axis. */
  wght?: { min: number; max: number };
  /** Its character map has the Arabic letters. */
  arabic: boolean;
  /** The app's Info.plist registers it (UIAppFonts, or ATSApplicationFontsPath on the Mac). */
  registered: boolean;
}

/** A font name as Font.custom compares it here: without case, spaces, "-" or "_" (Readex Pro, ReadexPro, readex_pro). */
export const fontKey = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, "");

/** Folders that hold no font the app ships: build output, dependencies, Motif's own and version control's. */
const SKIP = new Set(["build", "DerivedData", ".build", ".git", ".motif", "node_modules", "Pods", "Carthage", "xcuserdata", ".swiftpm"]);
const FONT = /\.(?:ttf|otf)$/i;

/** A family from a font file's name when its tables can't be read: Inter-Bold → Inter, ReadexPro-VariableFont_wght → ReadexPro. */
function familyFromName(name: string): string {
  return name
    .replace(/\[[^\]]*\]$/, "")
    .replace(/[-_]?(?:VariableFont|Variable|VF)(?:_\w+)?$/i, "")
    .replace(/[-_ ](?:Thin|Hairline|ExtraLight|UltraLight|Light|Regular|Normal|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy)?(?:Italic|Oblique)?$/i, "")
    .trim() || name;
}

/** What an Info.plist registers: UIAppFonts' file names, and whether ATSApplicationFontsPath registers them all. */
function registrations(text: string): { names: Set<string>; all: boolean } {
  const list = /<key>\s*UIAppFonts\s*<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text)?.[1] ?? "";
  const names = new Set([...list.matchAll(/<string>\s*([^<]+?)\s*<\/string>/g)].map((m) => basename(m[1]!).toLowerCase()));
  return { names, all: /<key>\s*ATSApplicationFontsPath\s*<\/key>/.test(text) };
}

/** The .ttf and .otf files under the project root, outside build output and dependencies, each read and placed. */
export function appFontFiles(root: string): FontFile[] {
  const fonts: string[] = [];
  const plists: string[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > 12) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (SKIP.has(name) || name.endsWith(".xcodeproj") || name.endsWith(".xcworkspace")) continue;
      const path = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      let directory = false;
      try {
        directory = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (directory) walk(path, relPath, depth + 1);
      else if (FONT.test(name)) fonts.push(relPath);
      else if (name === "Info.plist" || /-Info\.plist$/.test(name)) plists.push(relPath);
    }
  };
  if (!existsSync(root)) return [];
  walk(root, "", 0);
  const registered = { names: new Set<string>(), all: false };
  for (const p of plists) {
    let text = "";
    try {
      text = readFileSync(join(root, p), "utf8");
    } catch {
      continue;
    }
    const r = registrations(text);
    for (const n of r.names) registered.names.add(n);
    registered.all ||= r.all;
  }
  return fonts.map((path): FontFile => {
    const base = basename(path).replace(FONT, "");
    const tables = readFontTables(join(root, path));
    const named = weightStyleOf(base);
    const family = tables?.family ?? familyFromName(base);
    return {
      path,
      family,
      keys: new Set([family, base, familyFromName(base), ...(tables?.names ?? [])].map(fontKey)),
      weight: tables?.weight ?? named.weight,
      style: tables?.italic === undefined ? named.style : tables.italic ? "italic" : "normal",
      ...(tables?.wght && Number.isFinite(tables.wght.min) && Number.isFinite(tables.wght.max) ? { wght: tables.wght } : {}),
      arabic: tables?.arabic ?? false,
      registered: registered.all || registered.names.has(basename(path).toLowerCase()),
    };
  });
}

/**
 * Families iOS and macOS have themselves, which an app draws with Font.custom without shipping them (Avenir Next,
 * Georgia, HelveticaNeue-Bold): not the app's own files, and not missing ones.
 */
const SYSTEM_FAMILIES = new Set(
  [
    "Academy Engraved LET", "Al Nile", "American Typewriter", "Apple Color Emoji", "Apple SD Gothic Neo", "Apple Symbols", "Arial",
    "Arial Hebrew", "Arial Rounded MT Bold", "Avenir", "Avenir Next", "Avenir Next Condensed", "Baskerville", "Bodoni 72",
    "Bodoni 72 Oldstyle", "Bodoni 72 Smallcaps", "Bradley Hand", "Chalkboard SE", "Chalkduster", "Charter", "Cochin", "Copperplate",
    "Courier", "Courier New", "Damascus", "Devanagari Sangam MN", "Didot", "DIN Alternate", "DIN Condensed", "Euphemia UCAS",
    "Farah", "Futura", "Galvji", "Geeza Pro", "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue", "Hiragino Maru Gothic ProN",
    "Hiragino Mincho ProN", "Hiragino Sans", "Hoefler Text", "Kailasa", "Kefa", "Kohinoor Bangla", "Kohinoor Devanagari",
    "Kohinoor Gujarati", "Kohinoor Telugu", "Marker Felt", "Menlo", "Mishafi", "Monaco", "New York", "Noteworthy",
    "Noto Nastaliq Urdu", "Optima", "Palatino", "Papyrus", "Party LET", "PingFang HK", "PingFang SC", "PingFang TC", "Rockwell",
    "Savoye LET", "SF Pro", "SF Pro Display", "SF Pro Text", "SF Pro Rounded", "SF Mono", "SF Compact", "Snell Roundhand",
    "STIX Two Math", "STIX Two Text", "Symbol", "Thonburi", "Times", "Times New Roman", "Trebuchet MS", "Verdana",
    "Zapf Dingbats", "Zapfino", "Lucida Grande", "Baghdad", "Geneva", "SF Arabic", "SF Arabic Rounded", "SF Compact Display",
    "SF Compact Text", "SF Compact Rounded", "SF Hebrew", "SF Armenian", "SF Georgian", "New York Small", "New York Medium",
    "New York Large", "New York Extra Large", "Hiragino Kaku Gothic ProN", "Hiragino Kaku Gothic Pro", "Bangla Sangam MN",
    "Gujarati Sangam MN", "Gurmukhi MN", "Kannada Sangam MN", "Khmer Sangam MN", "Lao Sangam MN", "Malayalam Sangam MN",
    "Myanmar Sangam MN", "Oriya Sangam MN", "Sinhala Sangam MN", "Tamil Sangam MN", "Telugu Sangam MN", "Grantha Sangam MN",
    "Noto Sans Kannada", "Noto Sans Myanmar", "Noto Sans Oriya", "Mukta Mahee", "Apple Braille", "Bodoni Ornaments",
    "BodoniSvtyTwoITCTT", "BodoniSvtyTwoOSITCTT", "BodoniSvtyTwoSCITCTT", "Gurmukhi Sangam MN",
  ].map(fontKey),
);

/** True for a family (or a PostScript name of one: AvenirNext-Bold) the system has itself. */
export function isSystemFamily(name: string): boolean {
  if (name.startsWith(".")) return true;
  // A PostScript name's family part, without Monotype's and Adobe's suffixes: ArialMT, TimesNewRomanPS-BoldMT, CourierNewPSMT.
  const part = name.split("-")[0]!.replace(/(?:PSMT|MT|PS)$/, "");
  return [name, name.split("-")[0]!, part].some((n) => SYSTEM_FAMILIES.has(fontKey(n)));
}
