// The spike's runner for the Flutter screenshot harness (decision 0007): writes the harness into <app>/.motif/shot/,
// gathers real fonts, runs flutter test, and always removes the generated files. Task 9 builds `motif shot` on it.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { onExit } from "../../cleanup";
import { motifHome } from "../../home";
import { killTree } from "../../shot/devserver";
import { stripBom } from "../../text";
import harnessSource from "./harness/motif_shot_test.dart" with { type: "text" };
import { packageName } from "./project";

export const HARNESS_TEST = ".motif/shot/motif_shot_test.dart";

/** How long Motif waits for a stopped run's output and exit before giving up on them. */
export const GRACE_MS = 3000;

export interface FlutterShot {
  /** The PNG's file name in outDir. */
  file: string;
  route: string;
  width: number;
  height: number;
  dpr: number;
  safeTop?: number;
  safeBottom?: number;
  dark: boolean;
  locale: string;
}

export interface FontEntry {
  family: string;
  files: string[];
}

/** Fonts found, and notes about the ones that couldn't be (a screenshot goes on without them). */
export interface FontsFound {
  fonts: FontEntry[];
  notes: string[];
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HarnessRun {
  appDir: string;
  outDir: string;
  shots: FlutterShot[];
  /** google_fonts families the app uses ("Onest"); their TTFs are fetched once into motifHome()/fonts/google/. */
  googleFonts: string[];
  timeoutMs: number;
  flutter?: string;
  home?: string;
  /** Replaces [flutter, "test"]; tests use it to stand in for Flutter. */
  command?: string[];
  fetch?: FetchLike;
}

export interface HarnessResult {
  code: number | null;
  timedOut: boolean;
  output: string;
  shots: { file: string; error?: string }[];
  notes: string[];
}

/** The harness source with the app's package in place of motif_app. */
export function harnessFor(pkg: string): string {
  return harnessSource.replace("import 'package:motif_app/main.dart'", `import 'package:${pkg}/main.dart'`);
}

/** The fonts a pubspec.yaml bundles: each family with its asset paths, as written. */
export function pubspecFontAssets(text: string): FontEntry[] {
  const out: FontEntry[] = [];
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
    if (key && !inFonts) {
      inFonts = true;
      fontsIndent = key[1]!.length;
      continue;
    }
    if (inFonts && indent <= fontsIndent && !line.trimStart().startsWith("-")) inFonts = false;
    if (!inFonts) continue;
    const family = line.match(/^\s*-?\s*family:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/)?.[1];
    if (family) out.push({ family: family.trim(), files: [] });
    const asset = line.match(/^\s*-?\s*asset:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/)?.[1];
    if (asset && out.length > 0) out[out.length - 1]!.files.push(asset.trim());
  }
  return out;
}

/** The app's pubspec fonts as absolute paths; a listed file that's missing is left out with a note. */
export function bundledFonts(appDir: string, pubspec: string): FontsFound {
  const notes: string[] = [];
  const fonts: FontEntry[] = [];
  for (const font of pubspecFontAssets(pubspec)) {
    const files: string[] = [];
    for (const asset of font.files) {
      const path = resolve(appDir, asset);
      if (existsSync(path)) files.push(path);
      else notes.push(`pubspec.yaml lists the font file ${asset} (${font.family}), which doesn't exist, so it isn't in the screenshots.`);
    }
    if (files.length > 0) fonts.push({ family: font.family, files });
  }
  return { fonts, notes };
}

/**
 * Roboto and the Material icons, from the Flutter SDK's own copy (bin/cache/artifacts/material_fonts). The SDK is
 * found from the flutter command, following links (a flutter on the PATH is often a link into the SDK).
 */
export function sdkFonts(flutter: string): FontsFound {
  let sdk: string;
  try {
    sdk = dirname(dirname(realpathSync(flutter)));
  } catch {
    sdk = dirname(dirname(resolve(flutter)));
  }
  const dir = join(sdk, "bin", "cache", "artifacts", "material_fonts");
  const missing = {
    fonts: [],
    notes: [`The Flutter SDK has no ${dir} folder, so plain Material text and icons are drawn as boxes. Run flutter precache to fetch it.`],
  };
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return missing;
  }
  const fonts = [
    { family: "Roboto", files: files.filter((f) => /^roboto-[a-z]+\.ttf$/.test(f)).map((f) => join(dir, f)) },
    { family: "MaterialIcons", files: files.filter((f) => f === "materialicons-regular.otf").map((f) => join(dir, f)) },
  ].filter((f) => f.files.length > 0);
  return fonts.length > 0 ? { fonts, notes: [] } : missing;
}

/** google_fonts' name for a variant: 400 → regular, 400 italic → italic, 700 → 700, 700 italic → 700italic. */
export const googleVariant = (weight: number, italic: boolean) =>
  weight === 400 ? (italic ? "italic" : "regular") : `${weight}${italic ? "italic" : ""}`;

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** A Google Fonts family name: letters, digits, spaces and hyphens, so it's safe as a folder name. */
const FAMILY_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,99}$/;

/** True for TrueType, OpenType (CFF), Apple TrueType and font collection files. */
export function isFontFile(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  return (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === "OTTO" || tag === "true" || tag === "ttcf";
}

/** Writes a file whole or not at all: to a temporary name first, then renamed. */
function writeWhole(path: string, data: string | Uint8Array): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

interface CachedFace {
  weight: number;
  italic: boolean;
  file: string;
}

function readCache(dir: string): CachedFace[] | null {
  try {
    const faces = JSON.parse(readFileSync(join(dir, "files.json"), "utf8")) as CachedFace[];
    return Array.isArray(faces) && faces.length > 0 && faces.every((f) => existsSync(join(dir, f.file))) ? faces : null;
  } catch {
    return null;
  }
}

/**
 * A Google Fonts family's static TTFs, one per weight and style it has, fetched once from the CSS2 API (which serves
 * TTF to a client that doesn't claim WOFF2 support) into <home>/fonts/google/<Family>/. Each file is registered under
 * google_fonts' own name for it (Onest_700) and all of them under the plain family, which google_fonts lists as the
 * fallback. A family that can't be had gives a note instead, and the screenshots go on without it.
 */
export async function googleFontFiles(
  family: string,
  home: string,
  opts: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<FontsFound> {
  const skipped = (why: string): FontsFound => ({ fonts: [], notes: [`${why} Its text is drawn in a fallback font.`] });
  if (!FAMILY_NAME.test(family)) return skipped(`"${family}" isn't a Google Fonts family name (letters, digits, spaces and hyphens).`);
  const get = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const dir = join(home, "fonts", "google", family);
  let faces = readCache(dir);
  if (!faces) {
    try {
      const axes = [0, 1].flatMap((i) => WEIGHTS.map((w) => `${i},${w}`)).join(";");
      const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${axes}`;
      const css = await get(url, { headers: { "User-Agent": "Mozilla/4.0" }, signal: AbortSignal.timeout(timeoutMs) });
      // The API answers 400 for a family it doesn't have.
      if (css.status === 400) return skipped(`Google Fonts has no family named ${family}.`);
      if (!css.ok) throw new Error(`Google Fonts answered ${css.status}`);
      const found = [...(await css.text()).matchAll(/@font-face\s*{([^}]*)}/g)].flatMap((m) => {
        const src = m[1]!.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
        if (!src) return [];
        const weight = Number(m[1]!.match(/font-weight:\s*(\d+)/)?.[1] ?? 400);
        return [{ src, weight, italic: /font-style:\s*italic/.test(m[1]!) }];
      });
      if (found.length === 0) return skipped(`Google Fonts has no family named ${family}.`);
      mkdirSync(dir, { recursive: true });
      faces = [];
      for (const face of found) {
        const res = await get(face.src, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`${face.src} answered ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!isFontFile(bytes)) throw new Error(`${face.src} isn't a font file`);
        const file = `${googleVariant(face.weight, face.italic)}.ttf`;
        writeWhole(join(dir, file), bytes);
        faces.push({ weight: face.weight, italic: face.italic, file });
      }
      writeWhole(join(dir, "files.json"), JSON.stringify(faces));
    } catch (e) {
      const why = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "it took too long" : e instanceof Error ? e.message : String(e);
      return skipped(`Couldn't download the font ${family} from Google Fonts (${why}).`);
    }
  }
  return {
    fonts: [
      ...faces.map((f) => ({ family: `${family}_${googleVariant(f.weight, f.italic)}`, files: [join(dir, f.file)] })),
      { family, files: faces.map((f) => join(dir, f.file)) },
    ],
    notes: [],
  };
}

/** The promise's value, or null if it takes longer than ms. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: Timer | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a stream into text as it arrives (the last 50,000 characters); cancel() stops reading. */
function collect(stream: ReadableStream<Uint8Array>): { text: () => string; done: Promise<void>; cancel: () => void } {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const done = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text = (text + decoder.decode(value, { stream: true })).slice(-50_000);
      }
    } catch {
      // Cancelled.
    }
  })();
  return { text: () => text, done, cancel: () => void reader.cancel().catch(() => {}) };
}

/** Runs the harness for the shots and returns what Flutter said; the generated test and config are always removed. */
export async function runHarness(run: HarnessRun): Promise<HarnessResult> {
  const flutter = run.flutter ?? Bun.which("flutter");
  if (!flutter) throw new Error("Flutter isn't installed.");
  const pkg = packageName(run.appDir);
  if (!pkg) throw new Error(`No package name in ${join(run.appDir, "pubspec.yaml")}.`);
  const home = run.home ?? motifHome();
  const pubspec = stripBom(readFileSync(join(run.appDir, "pubspec.yaml"), "utf8"));
  const found = [sdkFonts(flutter), bundledFonts(run.appDir, pubspec)];
  for (const family of run.googleFonts) found.push(await googleFontFiles(family, home, { fetch: run.fetch }));
  const fonts = found.flatMap((f) => f.fonts);
  const notes = found.flatMap((f) => f.notes);

  const motifDir = join(run.appDir, ".motif");
  const shotDir = join(motifDir, "shot");
  mkdirSync(shotDir, { recursive: true });
  mkdirSync(run.outDir, { recursive: true });
  writeFileSync(join(motifDir, ".gitignore"), "*\n");
  const testFile = join(run.appDir, HARNESS_TEST);
  const configFile = join(shotDir, "config.json");
  // A run that fails before writing anything mustn't return the last run's screenshots.
  const resultPath = join(run.outDir, "result.json");
  for (const old of [resultPath, ...run.shots.map((s) => join(run.outDir, s.file))]) rmSync(old, { force: true });

  let cancelExitHook = () => {};
  let timer: Timer | undefined;
  try {
    writeFileSync(testFile, harnessFor(pkg));
    writeFileSync(configFile, JSON.stringify({ outDir: resolve(run.outDir), fonts, shots: run.shots }));
    const command = run.command ?? [flutter, "test"];
    const proc = Bun.spawn([...command, HARNESS_TEST, `--dart-define=MOTIF_SHOT_CONFIG=${configFile}`], {
      cwd: run.appDir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      // Its own process group off Windows, so a run that's stopped takes flutter_tester with it.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    cancelExitHook = onExit(() => killTree(proc.pid, true));
    const out = collect(proc.stdout);
    const err = collect(proc.stderr);
    const timedOut = await new Promise<boolean>((done) => {
      timer = setTimeout(() => done(true), run.timeoutMs);
      void proc.exited.then(() => done(false));
    });
    // flutter (flutter.bat on Windows) starts flutter_tester; stopping only the first would leave the second running,
    // holding the output pipes open.
    if (timedOut) killTree(proc.pid, true);
    const code = await within(proc.exited, GRACE_MS);
    await within(Promise.all([out.done, err.done]), GRACE_MS);
    out.cancel();
    err.cancel();
    const shots = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")).shots : [];
    return { code, timedOut, output: `${out.text()}\n${err.text()}`, shots, notes };
  } finally {
    clearTimeout(timer);
    cancelExitHook();
    rmSync(testFile, { force: true });
    rmSync(configFile, { force: true });
  }
}
