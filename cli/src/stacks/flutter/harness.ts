// The spike's runner for the Flutter screenshot harness (decision 0007): writes the harness into <app>/.motif/shot/,
// gathers real fonts, runs flutter test, and always removes the generated files. Task 9 builds `motif shot` on it.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { motifHome } from "../../home";
import { stripBom } from "../../text";
import harnessSource from "./harness/motif_shot_test.dart" with { type: "text" };
import { packageName } from "./project";

export const HARNESS_TEST = ".motif/shot/motif_shot_test.dart";

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

export interface HarnessRun {
  appDir: string;
  outDir: string;
  shots: FlutterShot[];
  /** google_fonts families the app uses ("Onest"); their TTFs are fetched once into motifHome()/fonts/google/. */
  googleFonts: string[];
  timeoutMs: number;
  flutter?: string;
  home?: string;
}

export interface HarnessResult {
  code: number | null;
  timedOut: boolean;
  output: string;
  shots: { file: string; error?: string }[];
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

/** Roboto and the Material icons, from the Flutter SDK's own copy (bin/cache/artifacts/material_fonts). */
export function sdkFonts(flutter: string): FontEntry[] {
  const dir = join(dirname(dirname(resolve(flutter))), "bin/cache/artifacts/material_fonts");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir);
  return [
    { family: "Roboto", files: files.filter((f) => /^roboto-[a-z]+\.ttf$/.test(f)).map((f) => join(dir, f)) },
    { family: "MaterialIcons", files: files.filter((f) => f === "materialicons-regular.otf").map((f) => join(dir, f)) },
  ].filter((f) => f.files.length > 0);
}

/** google_fonts' name for a variant: 400 → regular, 400 italic → italic, 700 → 700, 700 italic → 700italic. */
export const googleVariant = (weight: number, italic: boolean) =>
  weight === 400 ? (italic ? "italic" : "regular") : `${weight}${italic ? "italic" : ""}`;

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/**
 * A Google Fonts family's static TTFs, one per weight and style it has, fetched once from the CSS2 API (which serves
 * TTF to a client that doesn't claim WOFF2 support) into <home>/fonts/google/<Family>/. Each file is registered under
 * google_fonts' own name for it (Onest_700) and all of them under the plain family, which google_fonts lists as the
 * fallback.
 */
export async function googleFontFiles(family: string, home: string): Promise<FontEntry[]> {
  const dir = join(home, "fonts", "google", family);
  const listPath = join(dir, "files.json");
  let files: { weight: number; italic: boolean; file: string }[];
  if (existsSync(listPath)) {
    files = JSON.parse(readFileSync(listPath, "utf8"));
  } else {
    const axes = [0, 1].flatMap((i) => WEIGHTS.map((w) => `${i},${w}`)).join(";");
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${axes}`;
    const css = await fetch(url, { headers: { "User-Agent": "Mozilla/4.0" } });
    if (!css.ok) throw new Error(`Google Fonts has no family "${family}" (${css.status}).`);
    const faces = [...(await css.text()).matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);
    mkdirSync(dir, { recursive: true });
    files = [];
    for (const face of faces) {
      const weight = Number(face.match(/font-weight:\s*(\d+)/)?.[1] ?? 400);
      const italic = /font-style:\s*italic/.test(face);
      const src = face.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!src) continue;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Couldn't download ${src} (${res.status}).`);
      const file = `${googleVariant(weight, italic)}.ttf`;
      writeFileSync(join(dir, file), new Uint8Array(await res.arrayBuffer()));
      files.push({ weight, italic, file });
    }
    writeFileSync(listPath, JSON.stringify(files));
  }
  const paths = files.map((f) => join(dir, f.file));
  return [
    ...files.map((f) => ({ family: `${family}_${googleVariant(f.weight, f.italic)}`, files: [join(dir, f.file)] })),
    { family, files: paths },
  ];
}

/** Runs the harness for the shots and returns what Flutter said; the generated test and config are always removed. */
export async function runHarness(run: HarnessRun): Promise<HarnessResult> {
  const flutter = run.flutter ?? Bun.which("flutter");
  if (!flutter) throw new Error("Flutter isn't installed.");
  const pkg = packageName(run.appDir);
  if (!pkg) throw new Error(`No package name in ${join(run.appDir, "pubspec.yaml")}.`);
  const home = run.home ?? motifHome();
  const pubspec = stripBom(readFileSync(join(run.appDir, "pubspec.yaml"), "utf8"));
  const fonts: FontEntry[] = [
    ...sdkFonts(flutter),
    ...pubspecFontAssets(pubspec).map((f) => ({ family: f.family, files: f.files.map((a) => resolve(run.appDir, a)) })),
  ];
  for (const family of run.googleFonts) fonts.push(...(await googleFontFiles(family, home)));

  const motifDir = join(run.appDir, ".motif");
  const shotDir = join(motifDir, "shot");
  mkdirSync(shotDir, { recursive: true });
  mkdirSync(run.outDir, { recursive: true });
  writeFileSync(join(motifDir, ".gitignore"), "*\n");
  const testFile = join(run.appDir, HARNESS_TEST);
  const configFile = join(shotDir, "config.json");
  try {
    writeFileSync(testFile, harnessFor(pkg));
    writeFileSync(configFile, JSON.stringify({ outDir: resolve(run.outDir), fonts, shots: run.shots }));
    const proc = Bun.spawn([flutter, "test", HARNESS_TEST, `--dart-define=MOTIF_SHOT_CONFIG=${configFile}`], {
      cwd: run.appDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, run.timeoutMs);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    clearTimeout(timer);
    const resultPath = join(run.outDir, "result.json");
    const shots = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")).shots : [];
    return { code, timedOut, output: `${out}\n${err}`, shots };
  } finally {
    rmSync(testFile, { force: true });
    rmSync(configFile, { force: true });
  }
}
