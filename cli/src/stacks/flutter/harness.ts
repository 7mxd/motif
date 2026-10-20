// The runner for the Flutter screenshot harness (decision 0007): writes the harness and its per-app hooks into
// <app>/.motif/shot/, gathers real fonts, runs flutter test, and always removes the generated files.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { onExit } from "../../cleanup";
import { motifHome } from "../../home";
import { killTree } from "../../shot/devserver";
import { stripBom } from "../../text";
import auditSource from "./harness/motif_audit.dart" with { type: "text" };
import httpSource from "./harness/motif_http.dart" with { type: "text" };
import harnessSource from "./harness/motif_shot_test.dart" with { type: "text" };
import { defaultHooks, HOOKS_FILE, hooksSource } from "./hooks";
import { fontAssets, packageName } from "./project";
import { familyScripts } from "./scripts";

export const HARNESS_TEST = ".motif/shot/motif_shot_test.dart";
/** The harness's in-memory HTTP, next to it; the same in every run too. */
export const HARNESS_HTTP = ".motif/shot/motif_http.dart";
/** The harness's audit (--audit), next to it; the same in every run too. */
export const HARNESS_AUDIT = ".motif/shot/motif_audit.dart";
/** Where the harness writes what it did; cleared before every run. */
export const RESULT_FILE = ".motif/shot/result.json";
/**
 * The run's options, relative to the app (flutter test runs there): an app path with "&" or "^" in it would be broken
 * up by flutter.bat on Windows.
 */
export const CONFIG_FILE = ".motif/shot/config.json";

/** How long Motif waits for a stopped run's output and exit before giving up on them. */
export const GRACE_MS = 3000;

export interface FlutterShot {
  /** The PNG's file name in outDir. */
  file: string;
  /** The screen it belongs to in the result: its route, or its widget's class name. Its route when not set. */
  target?: string;
  /** A route to open; a --screen widget sets screen instead. */
  route?: string;
  screen?: string;
  width: number;
  height: number;
  dpr: number;
  safeTop?: number;
  safeBottom?: number;
  dark: boolean;
  /** en_US, or a language alone (ar). */
  locale: string;
  rtl?: boolean;
  /** The variant as the generated theme's MotifVariant names it (Dart), and as the guide does. */
  variant?: string;
  variantId?: string;
  /** The size as screenshot names give it (mobile-360, mobile, tablet…), for the audit's issues. */
  size?: string;
  /** A --state script to run on the screen before it's drawn: its name. */
  state?: string;
  /** The audit's checks on this screenshot (--audit): contrast, names, targets, motion. */
  checks?: AuditCheck[];
}

export type AuditCheck = "contrast" | "names" | "targets" | "motion";

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
  /** motif_hooks.dart: the app's imports; the app's main and the packages it depends on when not given. */
  hooks?: string;
  /** More options for the harness, written into config.json next to the shots and fonts. */
  config?: Record<string, unknown>;
}

export interface HarnessResult {
  code: number | null;
  timedOut: boolean;
  output: string;
  shots: { file: string; error?: string }[];
  /** result.json as the harness wrote it; null when it wrote none, or one that can't be read. */
  result: Record<string, unknown> | null;
  /** Why result.json couldn't be read, when it exists but is cut short. */
  problem?: string;
  notes: string[];
}

/** The harness source: the same in every run, so flutter test reuses its compiled test. */
export const HARNESS_SOURCE: string = harnessSource;

/** What google_fonts prints for every family it may not fetch, although Motif loaded it: noise in Flutter's output. */
const GOOGLE_FONTS_NOISE =
  /google_fonts was unable to load font|GoogleFonts\.config\.allowRuntimeFetching is false|There is likely something wrong with your test|examples of how to test with google_fonts|If troubleshooting doesn't solve the problem, please file an issue/;

/** The last lines of Flutter's output, without google_fonts' noise or blank lines. */
export function flutterTail(output: string, lines = 20): string {
  return output
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !GOOGLE_FONTS_NOISE.test(l))
    .slice(-lines)
    .join("\n");
}

/** The environment for flutter test: its listener talks to 127.0.0.1, which must never go through a proxy. */
export function withNoProxy(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const given = (env.NO_PROXY ?? env.no_proxy ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const list = [...new Set([...given, "127.0.0.1", "localhost"])].join(",");
  return { ...env, NO_PROXY: list, no_proxy: list };
}

/** The app's pubspec fonts as absolute paths; a listed file that's missing is left out with a note. */
export function bundledFonts(appDir: string, pubspec: string): FontsFound {
  const notes: string[] = [];
  const fonts: FontEntry[] = [];
  for (const font of fontAssets(pubspec)) {
    const files: string[] = [];
    for (const { asset } of font.files) {
      const path = resolve(appDir, asset);
      if (existsSync(path)) files.push(path);
      else notes.push(`pubspec.yaml lists the font file ${asset} (${font.family}), which doesn't exist, so it isn't in the screenshots.`);
    }
    if (files.length > 0) fonts.push({ family: font.family, files });
  }
  return { fonts, notes };
}

/** The Flutter SDK's folder, from the flutter command (bin/flutter), with links followed. */
export function flutterSdk(flutter: string): string {
  try {
    return dirname(dirname(realpathSync(flutter)));
  } catch {
    return dirname(dirname(resolve(flutter)));
  }
}

/**
 * Roboto and the Material icons, from the Flutter SDK's own copy (bin/cache/artifacts/material_fonts). The SDK is
 * found from the flutter command, following links (a flutter on the PATH is often a link into the SDK).
 */
export function sdkFonts(flutter: string): FontsFound {
  const dir = join(flutterSdk(flutter), "bin", "cache", "artifacts", "material_fonts");
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

/** A face file's name in the cache: a plain file name, never a path out of the family's folder. */
const FACE_FILE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}\.ttf$/;

function readCache(dir: string): CachedFace[] | null {
  try {
    const faces = JSON.parse(readFileSync(join(dir, "files.json"), "utf8")) as CachedFace[];
    const sound = (f: CachedFace) =>
      typeof f?.file === "string" && FACE_FILE.test(f.file) && basename(f.file) === f.file && Number.isInteger(f.weight) && typeof f.italic === "boolean";
    return Array.isArray(faces) && faces.length > 0 && faces.every((f) => sound(f) && existsSync(join(dir, f.file))) ? faces : null;
  } catch {
    return null;
  }
}

/**
 * A Google Fonts family's static TTFs, one per weight and style it has, fetched once from the CSS2 API (which serves
 * TTF to a client that doesn't claim WOFF2 support) into <home>/fonts/google/<Family>/. Each file is registered under
 * google_fonts' own name for it (Onest_700; ReadexPro_700 for Readex Pro, without the spaces) and all of them under the
 * plain family, with and without its spaces, which google_fonts lists as the fallback. A family that can't be had gives
 * a note instead, and the screenshots go on without it.
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
  // google_fonts names a family without its spaces (Readex Pro is ReadexPro_regular, with ReadexPro as its fallback).
  const name = family.replace(/ /g, "");
  const all = faces.map((f) => join(dir, f.file));
  return {
    fonts: [
      ...faces.map((f) => ({ family: `${name}_${googleVariant(f.weight, f.italic)}`, files: [join(dir, f.file)] })),
      { family, files: all },
      ...(name !== family ? [{ family: name, files: all }] : []),
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

/** flutter test's arguments after the command, run from the app's folder: every path in them is relative to it. */
export function harnessArgs(): string[] {
  return [HARNESS_TEST, "--reporter", "expanded", `--dart-define=MOTIF_SHOT_CONFIG=${CONFIG_FILE}`];
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
  // Each family with the scripts its files have letters for, so the harness can tell text no loaded font draws.
  const cache = new Map<string, string[]>();
  const fonts = found.flatMap((f) => f.fonts).map((f) => ({ ...f, scripts: familyScripts(f.files, cache) }));
  const notes = found.flatMap((f) => f.notes);

  const motifDir = join(run.appDir, ".motif");
  const shotDir = join(motifDir, "shot");
  mkdirSync(shotDir, { recursive: true });
  mkdirSync(run.outDir, { recursive: true });
  writeFileSync(join(motifDir, ".gitignore"), "*\n");
  const testFile = join(run.appDir, HARNESS_TEST);
  const hooksFile = join(run.appDir, HOOKS_FILE);
  const httpFile = join(run.appDir, HARNESS_HTTP);
  const auditFile = join(run.appDir, HARNESS_AUDIT);
  const configFile = join(run.appDir, CONFIG_FILE);
  // A run that fails before writing anything mustn't return the last run's screenshots.
  const resultPath = join(run.appDir, RESULT_FILE);
  for (const old of [resultPath, ...run.shots.map((s) => join(run.outDir, s.file))]) rmSync(old, { force: true });

  const removeHarness = () => {
    for (const file of [testFile, hooksFile, httpFile, auditFile, configFile]) rmSync(file, { force: true });
  };
  // Ctrl+C or a closed console ends Motif without the finally below: the files go with the process tree.
  let cancelExitHook = onExit(removeHarness);
  let timer: Timer | undefined;
  try {
    writeFileSync(testFile, HARNESS_SOURCE);
    writeFileSync(httpFile, httpSource);
    writeFileSync(auditFile, auditSource);
    writeFileSync(hooksFile, run.hooks ?? hooksSource(defaultHooks(run.appDir, pkg)));
    writeFileSync(configFile, JSON.stringify({ ...run.config, outDir: resolve(run.outDir), resultPath, fonts, shots: run.shots }));
    const command = run.command ?? [flutter, "test"];
    const proc = Bun.spawn([...command, ...harnessArgs()], {
      cwd: run.appDir,
      env: withNoProxy(process.env),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      // Its own process group off Windows, so a run that's stopped takes flutter_tester with it.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    cancelExitHook();
    cancelExitHook = onExit(() => {
      killTree(proc.pid, true);
      removeHarness();
    });
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
    let result: Record<string, unknown> | null = null;
    let problem: string | undefined;
    if (existsSync(resultPath)) {
      try {
        const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed;
        else problem = "The harness's result file isn't what Motif expects.";
      } catch {
        // A run stopped while writing it leaves it cut short.
        problem = "The harness's result file is cut short; the run may have been stopped while writing it.";
      }
    }
    const shots = Array.isArray(result?.shots) ? (result.shots as HarnessResult["shots"]) : [];
    return { code, timedOut, output: `${out.text()}\n${err.text()}`, shots, result, ...(problem ? { problem } : {}), notes };
  } finally {
    clearTimeout(timer);
    cancelExitHook();
    removeHarness();
  }
}
