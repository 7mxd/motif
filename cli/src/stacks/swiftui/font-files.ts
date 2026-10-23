// The font files a SwiftUI app ships: what each one is (its family and names, read from the file), and which the app
// registers in its Info.plist. SwiftUI has no way to load a font from Google, so a family the app draws with
// Font.custom is one it ships, and a family it ships is its own.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
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

interface Tables {
  family?: string;
  names: string[];
  weight?: number;
  italic?: boolean;
  wght?: { min: number; max: number };
  arabic: boolean;
}

/** A TrueType or OpenType file's names (1, 4, 6, 16), OS/2 weight and italic bit, fvar weight axis and Arabic coverage. */
/** Larger than any font an app ships (a CJK family's file is about 20 MB): such a file is read by its name alone. */
const MAX_FONT_BYTES = 30 * 1024 * 1024;

/**
 * A font file's tables, or null when it can't be read (missing, too large, not a TrueType or OpenType file, or
 * malformed): the file is then known by its name. Never throws.
 */
function readTables(path: string): Tables | null {
  try {
    if (statSync(path).size > MAX_FONT_BYTES) return null;
    return parseTables(readFileSync(path));
  } catch {
    return null;
  }
}

function parseTables(b: Buffer): Tables | null {
  const u16 = (at: number) => (at >= 0 && at + 2 <= b.length ? b.readUInt16BE(at) : -1);
  const u32 = (at: number) => (at >= 0 && at + 4 <= b.length ? b.readUInt32BE(at) : -1);
  const fixed = (at: number) => (at >= 0 && at + 4 <= b.length ? b.readInt32BE(at) / 65536 : NaN);
  const tag = u32(0);
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
  const table = new Map<string, number>();
  for (let i = 0, n = u16(4); i < n && i < 128; i++) {
    const rec = 12 + i * 16;
    table.set(b.toString("latin1", rec, rec + 4), u32(rec + 8));
  }
  const out: Tables = { names: [], arabic: false };

  // name: Windows Unicode (3, 1 or 10) in English first, else Mac Roman.
  const name = table.get("name");
  if (name !== undefined) {
    const count = u16(name + 2);
    const strings = name + u16(name + 4);
    const found = new Map<number, { score: number; text: string }>();
    for (let i = 0; i < count && i < 1000; i++) {
      const rec = name + 6 + i * 12;
      const [platform, encoding, language, id, length, offset] = [u16(rec), u16(rec + 2), u16(rec + 4), u16(rec + 6), u16(rec + 8), u16(rec + 10)];
      if (![1, 4, 6, 16].includes(id) || strings < 0 || offset < 0 || length < 0 || strings + offset + length > b.length) continue;
      const raw = b.subarray(strings + offset, strings + offset + length);
      // UTF-16 names have an even length; an odd one is malformed, and skipped.
      if ((platform === 3 || platform === 0) && length % 2 === 1) continue;
      let text: string | undefined;
      let score = 0;
      if (platform === 3 && (encoding === 1 || encoding === 10)) {
        text = Buffer.from(raw).swap16().toString("utf16le");
        score = language === 0x409 ? 3 : 2;
      } else if (platform === 0) {
        text = Buffer.from(raw).swap16().toString("utf16le");
        score = 2;
      } else if (platform === 1 && encoding === 0) {
        text = raw.toString("latin1");
        score = language === 0 ? 1 : 0;
      }
      if (text && text.trim() && (found.get(id)?.score ?? -1) < score) found.set(id, { score, text: text.trim() });
    }
    out.family = found.get(16)?.text ?? found.get(1)?.text;
    out.names = [1, 4, 6, 16].flatMap((id) => (found.has(id) ? [found.get(id)!.text] : []));
  }

  const os2 = table.get("OS/2");
  if (os2 !== undefined) {
    const weight = u16(os2 + 4);
    if (weight >= 1 && weight <= 1000) out.weight = weight;
    const selection = u16(os2 + 62);
    if (selection >= 0) out.italic = (selection & 1) === 1;
  }

  const fvar = table.get("fvar");
  if (fvar !== undefined) {
    const [axesAt, axes, size] = [u16(fvar + 4), u16(fvar + 8), u16(fvar + 10)];
    for (let i = 0; i < axes && i < 64; i++) {
      const rec = fvar + axesAt + i * size;
      if (b.toString("latin1", rec, rec + 4) === "wght") out.wght = { min: fixed(rec + 4), max: fixed(rec + 12) };
    }
  }

  // cmap formats 4 and 12: at least 28 code points of U+0600–06FF (the Arabic alphabet).
  const cmap = table.get("cmap");
  if (cmap !== undefined) {
    const overlap = (start: number, end: number) => Math.max(0, Math.min(end, 0x06ff) - Math.max(start, 0x0600) + 1);
    for (let i = 0, n = u16(cmap + 2); i < n && i < 64 && !out.arabic; i++) {
      const sub = cmap + u32(cmap + 4 + i * 8 + 4);
      let covered = 0;
      if (u16(sub) === 4) {
        const segs = u16(sub + 6) / 2;
        for (let k = 0; k < segs; k++) covered += overlap(u16(sub + 16 + segs * 2 + k * 2), u16(sub + 14 + k * 2));
      } else if (u16(sub) === 12) {
        for (let k = 0, groups = u32(sub + 12); k < groups && k < 100_000; k++) covered += overlap(u32(sub + 16 + k * 12), u32(sub + 20 + k * 12));
      }
      out.arabic = covered >= 28;
    }
  }
  return out;
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
    const tables = readTables(join(root, path));
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
