// Test A's screenshots and pairs (Part 4 §5): each brief's starter screens, shot afresh from the app built with Motif
// and the one built without it by the same motif shot command (light, left to right, in English, at a phone's width and
// for web apps a desktop's), each re-written as a plain PNG with no metadata and a random name. A pair is one screen at
// one size; a side whose app or screen didn't render loses it, with why. Nothing an image is called or holds says which
// app it came from: only a/pairs.json does, for the reveal.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { WEB_STACKS, type StackId } from "../../cli/src/detect/stacks";
import { hasWebSupport } from "../../cli/src/stacks/react-native/project";
import { CASES, isReactNative, type EvalCase } from "./cases";
import { shotTargets, shotTimeout, type Collectors } from "./collect";
import { packageManager, tail } from "./tools";
import { findApp, findBuiltApp, type Workspace } from "./workspace";

export interface Pair {
  id: string;
  brief: string;
  /** The screen as the case names it: a route, or a SwiftUI #Preview's title. */
  screen: string;
  /** The width it was drawn at, in CSS px. */
  size: number;
  /** The screenshot of the app built with Motif, relative to the run folder (a/img/<id>.png); none when it lost. */
  motif?: string;
  /** The screenshot of the app built without it; none when it lost. */
  baseline?: string;
  outcome: "both" | "motif-only" | "baseline-only" | "neither";
  /** Why a side lost the pair. */
  why?: string;
  /**
   * An Expo brief: the web packages (react-dom, react-native-web, @expo/metro-runtime) installed in each app before it
   * was shot, the same way on both sides, so that motif shot can draw it through Expo's web target; empty when the app
   * had them all. Setup, not design: an app built without them would otherwise lose every pair to the harness.
   */
  webSetup?: { motif: string[]; baseline: string[] };
}

/** Every brief's pairs, relative to the run folder. */
export const pairsFile = "a/pairs.json";
const IMAGES = "a/img";

/** The widths a brief's screens are drawn at: a phone and a desktop for a web app, a phone for a native or Expo one. */
export function shotSizes(stack?: StackId): number[] {
  return !stack || WEB_STACKS.includes(stack) ? [390, 1440] : [390];
}

/** The name motif shot gives each width in its file names (index.mobile.png, index.desktop.png). */
const SIZE_NAME: Record<number, string> = { 390: "mobile", 1440: "desktop" };

const KEPT = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * The PNG with only the chunks that draw it (IHDR, PLTE, tRNS, IDAT, IEND), each byte for byte: no text (motif shot's
 * tEXt note), EXIF, time or colour notes to tell where it came from.
 */
export function stripPng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8 || !SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error("Not a PNG image.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  for (let at = 8; ; ) {
    if (at + 12 > bytes.length) throw new Error("The PNG ends before its IEND chunk.");
    const end = at + 12 + view.getUint32(at);
    if (end > bytes.length) throw new Error("The PNG ends part-way through a chunk.");
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (KEPT.has(type)) parts.push(bytes.subarray(at, end));
    if (type === "IEND") break;
    at = end;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A random 12-hex name that isn't taken and can't spell anything that names a side or the brief. */
function randomId(brief: string, taken: (id: string) => boolean): string {
  for (;;) {
    const id = randomBytes(6).toString("hex");
    if (!taken(id) && !/motif|base|d-|a-/i.test(id) && !id.includes(brief.toLowerCase())) return id;
  }
}

type Side = { png: string } | { why: string };

/** What motif shot's --json error codes mean, for a side that couldn't be shot at all. */
const SHOT_ERRORS: Record<string, string> = {
  "cant-start": "its dev server couldn't be started",
  "dev-server-failed": "its dev server didn't start",
  "unsupported-stack": "motif shot can't start an app like it",
  "needs-web-target": "the Expo web target isn't installed",
  "web-bundle-failed": "Expo couldn't build it for the web",
  "no-app": "no app was found in its folder",
  "several-apps": "its folder holds several apps",
  "capture-failed": "the screenshots couldn't be taken",
};

/** How each package manager runs a package's program: Expo's own install, which picks versions for the app's SDK. */
const EXEC: Record<string, string[]> = { npm: ["npx"], pnpm: ["pnpm", "exec"], yarn: ["yarn"], bun: ["bunx"] };

/**
 * An Expo app's web packages that it neither declares nor has installed, installed with its own package manager
 * (npx expo install react-dom react-native-web @expo/metro-runtime, less what it has): motif shot draws an Expo app
 * through its web target and refuses one without them. Done the same way to both sides; the install's output is kept in
 * `log`.
 */
async function expoWebSetup(app: string, k: Pick<Collectors, "run">, log: string): Promise<{ installed: string[] } | { why: string }> {
  const missing = hasWebSupport(app);
  if (missing.length === 0) return { installed: [] };
  const r = await k.run([...EXEC[packageManager(app)]!, "expo", "install", ...missing], app, 900_000);
  writeFileSync(log, `${r.stdout}\n${r.stderr}`);
  if (r.code === 0 && !r.timedOut) return { installed: missing };
  return { why: `Expo's web packages (${missing.join(", ")}) couldn't be installed${r.timedOut ? " in time" : ""}: ${tail(r, 3) || `exit code ${r.code}`}` };
}

/**
 * One side's screens: on an Expo brief, its web packages installed first (expoWebSetup); then motif shot on its app with
 * the brief's targets and sizes, into a folder of its own; then, for each screen and size, its light screenshot, or why
 * there's none. What it answered is kept in the case's results folder (`logs`).
 */
async function shootSide(
  app: string | null, c: EvalCase, sizes: number[], k: Pick<Collectors, "motif" | "run">, dir: string, logs: string,
): Promise<{ at: (screen: string, size: number) => Side; installed?: string[] }> {
  mkdirSync(logs, { recursive: true });
  const log = join(logs, "pair-shots.json");
  if (!app || !existsSync(app)) {
    writeFileSync(log, JSON.stringify({ error: "no app" }, null, 2));
    return { at: () => ({ why: "The session left no app to shoot." }) };
  }
  let installed: string[] | undefined;
  if (isReactNative(c)) {
    const setup = await expoWebSetup(app, k, join(logs, "pair-install.log"));
    if ("why" in setup) {
      writeFileSync(log, JSON.stringify({ error: "web-setup", message: setup.why }, null, 2));
      return { at: () => ({ why: `${setup.why}.` }) };
    }
    installed = setup.installed;
  }
  const { args, named } = shotTargets(c, app);
  const r = await k.motif(["shot", ...args, "--sizes", sizes.join(","), "--out", dir], app, shotTimeout(c));
  writeFileSync(log, JSON.stringify(r.json ?? { output: r.output }, null, 2));
  const routes: any[] | null = Array.isArray(r.json?.routes) ? r.json.routes : null;
  if (!routes) {
    const code = r.json?.error ? String(r.json.error) : "";
    const what = code ? `${SHOT_ERRORS[code] ?? "it couldn't be shot"} (${code}${r.json?.message ? `: ${r.json.message}` : ""})` : r.output.trim() || `motif shot ended with exit code ${r.code}`;
    return { at: () => ({ why: `The app couldn't be shot: ${what}.` }), ...(installed ? { installed } : {}) };
  }
  const at = (screen: string, size: number): Side => {
    const x = routes.find((y) => (named.get(String(y.route)) ?? String(y.route)) === screen);
    if (!x) return { why: `${screen} wasn't captured.` };
    if (x.error) return { why: `${screen}: ${x.error}` };
    if (Array.isArray(x.pageErrors) && x.pageErrors.length > 0) return { why: `${screen} threw an error: ${x.pageErrors[0]}` };
    if (x.loading) return { why: `${screen}: ${x.loading}` };
    if (Number(x.status) !== 200) return { why: `${screen} answered HTTP ${x.status}.` };
    const light = new RegExp(`^[^.@+]+\\.${SIZE_NAME[size] ?? size}\\.png$`);
    const shot = (Array.isArray(x.shots) ? x.shots : []).map(String).find((s: string) => light.test(basename(s)));
    const file = shot ? resolve(app, shot) : undefined;
    return file && existsSync(file) ? { png: file } : { why: `${screen} has no light screenshot ${size} px wide.` };
  };
  return { at, ...(installed ? { installed } : {}) };
}

type Saved = { img: string } | { why: string };

/**
 * A brief's pairs: both apps shot by the same motif shot command (the app built with Motif first), one pair per starter
 * screen and size, each side's light screenshot stripped of its metadata and saved under a/img with a random name. A side
 * whose app is missing, couldn't be set up or started, whose screen didn't render or whose screenshot can't be read loses
 * that pair, with why; nothing is thrown for an app that can't be shot. A pair's two images are written in a random
 * order, and every image is given the same time at the end, so neither tells the sides apart; if anything throws
 * part-way, the images this call wrote are removed. What each shot answered is kept in its case's results (d-<brief>/,
 * a-<brief>/).
 */
export async function shootPairs(brief: string, motifApp: string | null, baselineApp: string | null, c: EvalCase, out: string, k: Pick<Collectors, "motif" | "run">): Promise<Pair[]> {
  const sizes = shotSizes(c.stack);
  const images = join(out, IMAGES);
  mkdirSync(images, { recursive: true });
  // Outside both apps (nothing is written into them) and outside the run folder; gone once the images are copied.
  const tmp = mkdtempSync(join(tmpdir(), "shots-"));
  const written: string[] = [];
  try {
    const withMotif = await shootSide(motifApp, c, sizes, k, join(tmp, "1"), join(out, `d-${brief}`));
    const without = await shootSide(baselineApp, c, sizes, k, join(tmp, "2"), join(out, `a-${brief}`));
    const webSetup = isReactNative(c) ? { webSetup: { motif: withMotif.installed ?? [], baseline: without.installed ?? [] } } : {};
    const ids = new Set<string>();
    const save = (side: Side, screen: string, size: number): Saved => {
      if (!("png" in side)) return side;
      let bytes: Uint8Array;
      try {
        bytes = stripPng(readFileSync(side.png));
      } catch (e) {
        return { why: `${screen}'s screenshot ${size} px wide can't be used: ${(e as Error).message}` };
      }
      const id = randomId(brief, (x) => existsSync(join(images, `${x}.png`)));
      const file = join(images, `${id}.png`);
      written.push(file);
      writeFileSync(file, bytes);
      return { img: `${IMAGES}/${id}.png` };
    };
    const pairs: Pair[] = [];
    for (const screen of c.routes) {
      for (const size of sizes) {
        const sides = [withMotif.at(screen, size), without.at(screen, size)];
        // Written in a random order: which file came first says nothing.
        const order = randomBytes(1)[0]! & 1 ? [1, 0] : [0, 1];
        const saved: Saved[] = [];
        for (const i of order) saved[i] = save(sides[i]!, screen, size);
        const [m, b] = saved as [Saved, Saved];
        const motif = "img" in m ? m.img : undefined;
        const baseline = "img" in b ? b.img : undefined;
        const outcome = motif && baseline ? "both" : motif ? "motif-only" : baseline ? "baseline-only" : "neither";
        const why = "why" in m && "why" in b ? `With Motif: ${m.why} Without: ${b.why}` : "why" in m ? m.why : "why" in b ? b.why : undefined;
        const id = randomId(brief, (x) => ids.has(x));
        ids.add(id);
        pairs.push({ id, brief, screen, size, ...(motif ? { motif } : {}), ...(baseline ? { baseline } : {}), outcome, ...(why ? { why } : {}), ...webSetup });
      }
    }
    // One time for every image, so the order they were written in doesn't show in their times either.
    const now = new Date();
    for (const file of written) utimesSync(file, now, now);
    return pairs;
  } catch (e) {
    for (const file of written) rmSync(file, { force: true });
    throw e;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Every brief's pairs so far in the run folder. */
export function readPairs(out: string): Pair[] {
  const file = join(out, pairsFile);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Pair[]) : [];
}

/** A brief's pairs into a/pairs.json, in place of any it had (whose images go); other briefs' stay as they were. */
export function savePairs(out: string, brief: string, pairs: Pair[]): void {
  const before = readPairs(out);
  const file = join(out, pairsFile);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify([...before.filter((p) => p.brief !== brief), ...pairs], null, 2));
  renameSync(`${file}.tmp`, file);
  for (const p of before.filter((x) => x.brief === brief)) {
    for (const img of [p.motif, p.baseline]) if (img) rmSync(join(out, img), { force: true });
  }
}

/** One line on a brief's pairs, in the runner's voice. */
export function describePairs(brief: string, pairs: Pair[]): string {
  const n = (o: Pair["outcome"]) => pairs.filter((p) => p.outcome === o).length;
  if (pairs.length > 0 && n("both") === pairs.length) return `${brief}: ${pairs.length} pairs for Test A, all with both apps' screens.`;
  return `${brief}: ${pairs.length} pairs for Test A: ${n("both")} with both apps' screens, ${n("motif-only")} with only the one made with Motif, ${n("baseline-only")} with only the other, ${n("neither")} with neither (left out).`;
}

/**
 * Test A's step once a brief's d-* and a-* are both graded, with both folders still there: each side's app found as its
 * grading found it (Test D's by its design guide, Test A's by its project file), both shot into pairs, and the pairs saved
 * in a/pairs.json. Returns the line to log.
 */
export async function pairBrief(brief: string, withMotif: Workspace, without: Workspace, out: string, k: Pick<Collectors, "motif" | "run">): Promise<string> {
  const c = CASES.find((x) => x.test === "D" && x.brief === brief);
  if (!c) throw new Error(`There's no Test D case for the brief "${brief}".`);
  const app = (dir: string, find: (d: string) => string | null) => (existsSync(dir) ? find(dir) : null);
  const pairs = await shootPairs(brief, app(withMotif.app, findApp), app(without.app, findBuiltApp), c, out, k);
  try {
    savePairs(out, brief, pairs);
  } catch (e) {
    // Images that no a/pairs.json lists would be left behind: the next try takes them again.
    for (const p of pairs) for (const img of [p.motif, p.baseline]) if (img) rmSync(join(out, img), { force: true });
    throw e;
  }
  return describePairs(brief, pairs);
}
