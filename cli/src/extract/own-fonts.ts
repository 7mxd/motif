// Helpers for telling a family the app ships (its own font files) from one it loads from Google Fonts.
import { existsSync } from "node:fs";
import { posix } from "node:path";
import type { SourceFile } from "../check/files";
import { maskComments } from "../check/mask";
import type { Occurrences } from "./draft";
import { readFontTables } from "./font-file";

type ProjectFontEntry = NonNullable<Occurrences["projectFonts"]>[number];
type UnfoundFontEntry = NonNullable<Occurrences["unfoundFonts"]>[number];

/** The project's root folder (forward slashes, ending in one), from a source file's absolute and root-relative paths. */
export function rootOf(source: SourceFile): string | null {
  const abs = source.abs.replace(/\\/g, "/");
  return abs.endsWith(`/${source.path}`) ? abs.slice(0, abs.length - source.path.length) : null;
}

const WEIGHT_WORDS: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400,
  medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
};

/**
 * The weight and style a font's name says (Inter-Bold, Inter_700Bold, readex_pro_semibold_italic, ReadexPro-BoldItalic):
 * 400 and normal unless it names others.
 */
export function weightStyleOf(name: string): { weight: number; style: "normal" | "italic" } {
  const parts = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/(extra|ultra|semi|demi)[\s_.-]+(bold|light)/g, "$1$2")
    .split(/[\s_.-]+/)
    .filter(Boolean);
  const italic = parts.some((p) => p === "italic" || p.endsWith("italic"));
  let weight = 400;
  for (const p of parts) {
    const n = p.match(/^([1-9]00)(?:[a-z]*)$/)?.[1];
    const word = p.replace(/italic$/, "");
    if (n) weight = Number(n);
    else if (WEIGHT_WORDS[word] !== undefined) weight = WEIGHT_WORDS[word]!;
  }
  return { weight, style: italic ? "italic" : "normal" };
}

/** The families a Google Fonts stylesheet address asks for: css2?family=Readex+Pro:wght@400;700&family=Inter → Readex Pro, Inter. */
export function googleFontsFamilies(url: string): string[] {
  if (!/^(?:https?:)?\/\/fonts\.googleapis\.com\//i.test(url)) return [];
  const query = url.split("?")[1] ?? "";
  return query
    .split("&")
    .filter((p) => p.startsWith("family="))
    .flatMap((p) => decodeURIComponent(p.slice("family=".length).replace(/\+/g, " ")).split("|"))
    .map((f) => f.split(":")[0]!.trim())
    .filter(Boolean);
}

/** The font formats a project may bundle. */
const FONT_FILE = /\.(woff2|woff|ttf|otf)$/i;
const FONT_FACE = /@font-face\s*\{([^}]*)\}/gi;
const GOOGLE_URL = /(?:https?:)?\/\/fonts\.googleapis\.com\/css2?\?[^"'\s)<>`]+/gi;
const NEXT_GOOGLE = /import\s*\{([^}]*)\}\s*from\s*["']next\/font\/google["']/g;

/** A @font-face's weight (one number; 400 for a range that holds it, else the range's first) and style. */
function faceWeightStyle(body: string): { weight: number; style: "normal" | "italic"; range?: [number, number] } {
  const raw = body.match(/(?:^|[;{\s])font-weight\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() ?? "";
  const nums = [...raw.matchAll(/\d+/g)].map((n) => Number(n[0])).filter((n) => n >= 1 && n <= 1000);
  let weight = raw === "bold" ? 700 : 400;
  if (nums.length === 1) weight = nums[0]!;
  else if (nums.length >= 2) weight = nums[0]! <= 400 && 400 <= nums[1]! ? 400 : nums[0]!;
  weight = Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
  const style = /(?:^|[;{\s])font-style\s*:\s*(?:italic|oblique)/i.test(body) ? "italic" : "normal";
  return { weight, style, ...(nums.length >= 2 ? { range: [nums[0]!, nums[1]!] as [number, number] } : {}) };
}

/**
 * A file a stylesheet's url() names, root-relative, or undefined when it isn't in the project: relative to the
 * stylesheet, or, from the site's root (/fonts/x.woff2), in public/ or the folder of a stylesheet above it.
 */
function fileOfUrl(source: SourceFile, url: string): string | undefined {
  const root = rootOf(source);
  if (root === null) return undefined;
  const dir = posix.dirname(source.path);
  const inside = (p: string) => !(p === "." || p.startsWith("../") || p === ".." || posix.isAbsolute(p));
  if (!url.startsWith("/")) {
    const path = posix.normalize(posix.join(dir, url));
    return inside(path) && existsSync(root + path) ? path : undefined;
  }
  for (let d = dir; ; d = posix.dirname(d)) {
    const base = d === "." ? "" : `${d}/`;
    for (const path of [`${base}public${url}`, `${base}${url.slice(1)}`].map((p) => posix.normalize(p))) {
      if (inside(path) && existsSync(root + path)) return path;
    }
    if (d === "." || d === "" || d === "/") return undefined;
  }
}

/**
 * What a web app's files say about where its fonts come from: an @font-face whose url() is a file in the project is
 * the app's own (a family whose files aren't there is noted), and a Google Fonts link, @import or next/font/google
 * import is Google's.
 */
export function webFonts(files: SourceFile[]): Pick<Occurrences, "projectFonts" | "googleFonts" | "unfoundFonts" | "fontWeightRanges"> {
  const own = new Map<string, ProjectFontEntry | UnfoundFontEntry>();
  const google = new Set<string>();
  const ranges: NonNullable<Occurrences["fontWeightRanges"]> = [];
  for (const file of files) {
    const text = file.lang === "css" || file.lang === "script" ? maskComments(file.text, file.lang) : file.text;
    for (const m of text.matchAll(GOOGLE_URL)) for (const f of googleFontsFamilies(m[0].replace(/&amp;/g, "&"))) google.add(f);
    if (file.lang === "script") {
      for (const m of text.matchAll(NEXT_GOOGLE)) {
        for (const name of m[1]!.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!.trim()).filter((s) => /^[A-Z]/.test(s))) google.add(name.replace(/_/g, " "));
      }
    }
    if (file.lang !== "css") continue;
    for (const m of text.matchAll(FONT_FACE)) {
      const body = m[1]!;
      const family = body.match(/(?:^|[;{\s])font-family\s*:\s*([^;]+)/i)?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
      if (!family) continue;
      const src = body.match(/(?:^|[;{\s])src\s*:\s*([^;]+)/i)?.[1] ?? "";
      const urls = [...src.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)]
        .map((u) => u[2]!.trim().split(/[?#]/)[0]!)
        .filter((u) => !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(u) && FONT_FILE.test(u));
      if (urls.length === 0) continue;
      const key = family.toLowerCase();
      const paths = urls.map((u) => fileOfUrl(file, u)).filter((p): p is string => p !== undefined);
      if (paths.length === 0) {
        if (!own.has(key)) own.set(key, { family, from: `url("${urls[0]}")` });
        continue;
      }
      const found = own.get(key);
      const entry = found && "files" in found ? found : { family, files: [] };
      const { weight, style, range } = faceWeightStyle(body);
      if (range && style === "normal") ranges.push({ family, min: range[0], max: range[1] });
      for (const path of paths) if (!entry.files.some((f) => f.path === path)) entry.files.push({ path, weight, style });
      own.set(key, entry);
    }
  }
  const projectFonts = [...own.values()].filter((f): f is ProjectFontEntry => "files" in f);
  const unfoundFonts = [...own.values()].filter((f): f is UnfoundFontEntry => "from" in f);
  return {
    ...(projectFonts.length ? { projectFonts } : {}),
    ...(google.size ? { googleFonts: [...google] } : {}),
    ...(unfoundFonts.length ? { unfoundFonts } : {}),
    ...(ranges.length ? { fontWeightRanges: ranges } : {}),
  };
}

/** True when a TrueType or OpenType file's character map has the Arabic letters (the shared reader's cmap check). Never throws. */
export function coversArabic(path: string): boolean {
  return readFontTables(path)?.arabic === true;
}
