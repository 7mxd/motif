import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { addPngText, readPngText } from "../src/browser/png";
import { runShot, type ShotDeps } from "../src/commands/shot";
import { routeSlug, shotName, type RouteResult } from "../src/shot/capture";
import { devCommand } from "../src/shot/devserver";
import { CASES, type EvalCase } from "../../tests/evals/cases";
import { pairBrief, pairsFile, readPairs, shootPairs, shotSizes, stripPng, type Pair } from "../../tests/evals/pairs";
import type { Motif, MotifResult, Run } from "../../tests/evals/tools";
import type { Workspace } from "../../tests/evals/workspace";
import { decodePng, encodePng } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const byId = (id: string): EvalCase => CASES.find((c) => c.id === id)!;

/** A PNG's chunks: type and data. */
function chunks(png: Uint8Array): { type: string; data: Buffer }[] {
  const b = Buffer.from(png);
  const out: { type: string; data: Buffer }[] = [];
  for (let at = 8; at + 12 <= b.length; ) {
    const n = b.readUInt32BE(at);
    out.push({ type: b.toString("latin1", at + 4, at + 8), data: b.subarray(at + 8, at + 8 + n) });
    at += n + 12;
  }
  return out;
}

/** A chunk of this type and data, with its CRC, put in after the header. */
function withChunk(png: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  const chunk = Buffer.alloc(typed.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  typed.copy(chunk, 4);
  chunk.writeUInt32BE(Bun.hash.crc32(typed), typed.length + 4);
  return Buffer.concat([Buffer.from(png.subarray(0, 33)), chunk, Buffer.from(png.subarray(33))]);
}

/** A picture of one colour, as motif shot would save it: with its tEXt note. */
const picture = (rgb: [number, number, number], w = 4, h = 3) => {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4);
  return addPngText(encodePng(w, h, px), "motif:screen", JSON.stringify({ width: 390, top: 0, height: 767 }));
};
const LIGHT: [number, number, number] = [250, 250, 250];
const DARK: [number, number, number] = [10, 10, 10];

describe("stripPng", () => {
  test("keeps only IHDR, PLTE, tRNS, IDAT and IEND: no text, EXIF or time; the image is the same", () => {
    let png = picture([200, 100, 50]);
    png = withChunk(png, "tIME", new Uint8Array([7, 234, 10, 26, 12, 0, 0]));
    png = withChunk(png, "eXIf", new TextEncoder().encode("MM\0*made by motif"));
    png = withChunk(png, "iTXt", new TextEncoder().encode("Software\0\0\0\0\0Motif"));
    png = withChunk(png, "zTXt", new TextEncoder().encode("Comment\0\0xx"));
    png = withChunk(png, "tRNS", new Uint8Array([0, 0, 0, 0, 0, 0]));
    expect(chunks(png).map((c) => c.type)).toEqual(["IHDR", "tRNS", "zTXt", "iTXt", "eXIf", "tIME", "tEXt", "IDAT", "IEND"]);
    const out = stripPng(png);
    expect(chunks(out).map((c) => c.type)).toEqual(["IHDR", "tRNS", "IDAT", "IEND"]);
    expect(readPngText(out, "motif:screen")).toBeUndefined();
    expect(Buffer.from(out).toString("latin1").toLowerCase()).not.toContain("motif");
    // The image data is byte for byte the same, and it still decodes to the same pixels.
    const idat = (p: Uint8Array) => Buffer.concat(chunks(p).filter((c) => c.type === "IDAT").map((c) => c.data));
    expect(idat(out).equals(idat(png))).toBe(true);
    expect(decodePng(out)).toEqual(decodePng(png));
  });

  test("keeps PLTE, and refuses what isn't a whole PNG", () => {
    const png = withChunk(picture([1, 2, 3]), "PLTE", new Uint8Array([0, 0, 0]));
    expect(chunks(stripPng(png)).map((c) => c.type)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
    expect(() => stripPng(new TextEncoder().encode("not a png at all, really"))).toThrow();
    expect(() => stripPng(png.subarray(0, png.length - 20))).toThrow();
  });
});

describe("shotSizes", () => {
  test("a phone and a desktop for web apps; a phone for Flutter, Compose, Expo and SwiftUI", () => {
    for (const s of [undefined, "react-web", "plain-web", "vue", "svelte", "angular"] as const) expect(shotSizes(s)).toEqual([390, 1440]);
    for (const s of ["flutter", "compose", "react-native", "swiftui"] as const) expect(shotSizes(s)).toEqual([390]);
  });
});

/**
 * A fake motif shot: writes each route's light and dark PNGs at each size into --out, as motif shot names them, and
 * answers as its --json does. `fail` makes the whole run fail with that error; `broken` routes throw a page error.
 */
function fakeShot(opts: { fail?: string; broken?: string[]; missing?: string[]; garbage?: string[] } = {}) {
  const calls: { args: string[]; cwd: string; timeoutMs?: number }[] = [];
  const motif: Motif = async (args, cwd, timeoutMs) => {
    calls.push({ args, cwd, timeoutMs });
    if (opts.fail) return { code: 2, json: { command: "shot", ok: false, exitCode: 2, error: opts.fail }, output: "" };
    const flag = (f: string) => args[args.indexOf(f) + 1]!;
    const outDir = resolve(cwd, flag("--out"));
    mkdirSync(outDir, { recursive: true });
    const sizes = flag("--sizes").split(",").map(Number);
    const routes = flag("--routes").split(",").filter((r) => !opts.missing?.includes(r));
    const json = {
      command: "shot", ok: true, exitCode: 0,
      routes: routes.map((route) => {
        const shots: string[] = [];
        for (const size of sizes) {
          for (const scheme of ["light", "dark"] as const) {
            const file = join(outDir, shotName(routeSlug(route), size === 1440 ? "desktop" : "mobile", scheme));
            writeFileSync(file, opts.garbage?.includes(route) && scheme === "light" && size === 390 ? "not a picture" : picture(scheme === "light" ? LIGHT : DARK, size === 1440 ? 8 : 4));
            shots.push(file);
          }
        }
        return { route, status: 200, ...(opts.broken?.includes(route) ? { pageErrors: ["TypeError: x is undefined"] } : {}), shots };
      }),
    };
    return { code: 0, json, output: JSON.stringify(json) } satisfies MotifResult;
  };
  return { motif, calls };
}

/** Two app folders, one for each side, and a run folder. */
function sides(brief = "stride") {
  const root = tempDir("evals-pairs-");
  const withMotif = join(root, "work", `d-${brief}`, "app");
  const without = join(root, "work", `a-${brief}`, "app");
  for (const d of [withMotif, without]) {
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "package.json"), "{}");
  }
  const out = join(root, "results", "20261026-120000");
  mkdirSync(out, { recursive: true });
  return { withMotif, without, out };
}

/** A shot whose answer depends on the app: `withMotif`'s and `without`'s fakes. */
const bySide = (withMotif: string, a: Motif, b: Motif): Motif => (args, cwd, t) => (cwd === withMotif ? a(args, cwd, t) : b(args, cwd, t));

/** Nothing is installed outside an Expo brief. */
const noRun: Run = async (cmd) => {
  throw new Error(`nothing should run: ${cmd.join(" ")}`);
};

const TELLS = /motif|base|d-|a-|stride/i;

describe("shootPairs", () => {
  test("one pair per screen and size, both apps shot with the same command, light only, as plain PNGs with random names", async () => {
    const s = sides();
    const f = fakeShot();
    const pairs = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, { run: noRun, motif: f.motif });
    expect(pairs.map((p) => [p.brief, p.screen, p.size, p.outcome])).toEqual([
      ["stride", "/", 390, "both"], ["stride", "/", 1440, "both"],
      ["stride", "/sign-in", 390, "both"], ["stride", "/sign-in", 1440, "both"],
      ["stride", "/home", 390, "both"], ["stride", "/home", 1440, "both"],
    ]);
    // The same command for both apps, but where its screenshots go; never right to left, a variant or the audit.
    expect(f.calls.map((c) => c.cwd)).toEqual([s.withMotif, s.without]);
    const [m, b] = f.calls.map((c) => c.args);
    const withoutOut = (a: string[]) => a.filter((_, i) => a[i - 1] !== "--out");
    expect(withoutOut(m!)).toEqual(["shot", "--routes", "/,/sign-in,/home", "--sizes", "390,1440", "--out"]);
    expect(withoutOut(b!)).toEqual(withoutOut(m!));
    for (const a of [m!, b!]) for (const no of ["--rtl", "--variant", "--audit", "--state", "--save", "--against"]) expect(a).not.toContain(no);
    // Where each shot went is outside both apps, and gone afterwards.
    for (const c of f.calls) {
      const where = c.args[c.args.indexOf("--out") + 1]!;
      expect(where.startsWith(s.withMotif) || where.startsWith(s.without)).toBe(false);
      expect(existsSync(where)).toBe(false);
    }
    // Each image is the light screenshot, stripped of its note, under a/img with a random name.
    const images = pairs.flatMap((p) => [p.motif!, p.baseline!]);
    expect(new Set(images).size).toBe(12);
    for (const img of images) {
      expect(img).toMatch(/^a\/img\/[0-9a-f]{12}\.png$/);
      expect(img).not.toMatch(TELLS);
      const png = readFileSync(join(s.out, img));
      expect(chunks(png).map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
      expect([...decodePng(png).rgba.subarray(0, 3)]).toEqual(LIGHT);
    }
    expect(readdirSync(join(s.out, "a", "img")).sort()).toEqual(images.map((i) => basename(i)).sort());
    expect(readdirSync(join(s.out, "a")).sort()).toEqual(["img"]);
    for (const p of pairs) {
      expect(p.id).toMatch(/^[0-9a-f]{12}$/);
      expect(p.why).toBeUndefined();
    }
    expect(new Set(pairs.map((p) => p.id)).size).toBe(6);
    // What each shot answered is kept with its own case, not under a/.
    expect(existsSync(join(s.out, "d-stride", "pair-shots.json"))).toBe(true);
    expect(existsSync(join(s.out, "a-stride", "pair-shots.json"))).toBe(true);
  });

  test("a native app's pairs are at a phone's width only", async () => {
    const s = sides("sahm");
    const f = fakeShot();
    const pairs = await shootPairs("sahm", s.withMotif, s.without, byId("d-sahm"), s.out, { run: noRun, motif: f.motif });
    expect(pairs.map((p) => [p.screen, p.size, p.outcome])).toEqual([["/", 390, "both"], ["/sign-in", 390, "both"], ["/home", 390, "both"]]);
    expect(f.calls[0]!.args).toContain("390");
  });

  test("a side whose shot fails loses every pair, with why; the other side's screens stand", async () => {
    const s = sides();
    const ok = fakeShot();
    const failed = fakeShot({ fail: "cant-start" });
    const pairs = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, { run: noRun, motif: bySide(s.withMotif, ok.motif, failed.motif) });
    expect(pairs).toHaveLength(6);
    for (const p of pairs) {
      expect(p.outcome).toBe("motif-only");
      expect(p.motif).toMatch(/^a\/img\/[0-9a-f]{12}\.png$/);
      expect(p.baseline).toBeUndefined();
      expect(p.why).toContain("cant-start");
    }
    const other = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, { run: noRun, motif: bySide(s.withMotif, failed.motif, ok.motif) });
    expect(other.map((p) => p.outcome)).toEqual(Array(6).fill("baseline-only"));
    expect(other.every((p) => p.baseline && !p.motif && p.why?.includes("cant-start"))).toBe(true);
  });

  test("neither, when both fail; a screen that throws or isn't captured loses only its own pairs", async () => {
    const s = sides();
    const both = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, { run: noRun, motif: fakeShot({ fail: "no-app" }).motif });
    expect(both.map((p) => p.outcome)).toEqual(Array(6).fill("neither"));
    expect(both.every((p) => !p.motif && !p.baseline && p.why)).toBe(true);
    const part = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, {
      run: noRun, motif: bySide(s.withMotif, fakeShot({ missing: ["/home"] }).motif, fakeShot({ broken: ["/sign-in"] }).motif),
    });
    expect(part.map((p) => [p.screen, p.size, p.outcome])).toEqual([
      ["/", 390, "both"], ["/", 1440, "both"],
      ["/sign-in", 390, "motif-only"], ["/sign-in", 1440, "motif-only"],
      ["/home", 390, "baseline-only"], ["/home", 1440, "baseline-only"],
    ]);
    expect(part.find((p) => p.screen === "/sign-in")!.why).toContain("TypeError: x is undefined");
    expect(part.find((p) => p.screen === "/home")!.why).toContain("/home");
  });

  test("no app on a side (the session left none) loses its pairs without running a shot there", async () => {
    const s = sides();
    const f = fakeShot();
    const pairs = await shootPairs("stride", s.withMotif, null, byId("d-stride"), s.out, { run: noRun, motif: f.motif });
    expect(pairs.map((p) => p.outcome)).toEqual(Array(6).fill("motif-only"));
    expect(f.calls.map((c) => c.cwd)).toEqual([s.withMotif]);
    expect(pairs[0]!.why).toBeTruthy();
  });

  test("a SwiftUI app's previews are shot by the case's screen names, found in each app", async () => {
    const s = sides("masar");
    const screen = (type: string, title: string) => `import SwiftUI\n\nstruct ${type}: View {\n    var body: some View { Text("${title}") }\n}\n\n#Preview("${title}") {\n    ${type}()\n}\n`;
    for (const app of [s.withMotif, s.without]) {
      // The Xcode project both sessions start from.
      cpSync(join(import.meta.dir, "..", "..", "tests", "fixtures", "swiftui-starter-masar"), app, { recursive: true });
      writeFileSync(join(app, "Masar", "SignInScreen.swift"), screen("SignInScreen", "Sign in"));
      writeFileSync(join(app, "Masar", "HomeView.swift"), screen("HomeView", "Home"));
    }
    const calls: string[][] = [];
    const motif: Motif = async (args, cwd) => {
      calls.push(args);
      const outDir = args[args.indexOf("--out") + 1]!;
      mkdirSync(outDir, { recursive: true });
      const routes = [["/", "index"], ["SignInScreen.swift:7", "sign-in"], ["HomeView.swift:7", "home"]].map(([route, slug]) => {
        const shots = (["light", "dark"] as const).map((scheme) => {
          const file = join(outDir, shotName(slug!, "mobile", scheme));
          writeFileSync(file, picture(scheme === "light" ? LIGHT : DARK));
          return file;
        });
        return { route, status: 200, shots };
      });
      return { code: 0, json: { routes }, output: "" };
    };
    const pairs = await shootPairs("masar", s.withMotif, s.without, byId("d-masar"), s.out, { run: noRun, motif });
    expect(calls[0]!.slice(0, 7)).toEqual(["shot", "--routes", "/", "--screen", "SignInScreen.swift:7,HomeView.swift:7", "--sizes", "390"]);
    expect(pairs.map((p) => [p.screen, p.size, p.outcome])).toEqual([["/", 390, "both"], ["Sign in", 390, "both"], ["Home", 390, "both"]]);
  });

  test("a baseline app with no dev script gives motif-only pairs, not a thrown error (Review Focus 1)", async () => {
    const s = sides();
    // Both apps are React (Vite) apps with their packages installed; only the one made with Motif has a dev script.
    const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "x", scripts, dependencies: { react: "19.0.0" }, devDependencies: { vite: "7.0.0" } });
    writeFileSync(join(s.withMotif, "package.json"), pkg({ dev: "vite", build: "vite build" }));
    writeFileSync(join(s.without, "package.json"), pkg({ build: "vite build", preview: "vite preview" }));
    for (const d of [s.withMotif, s.without]) {
      mkdirSync(join(d, "node_modules"), { recursive: true });
      writeFileSync(join(d, "bun.lock"), "");
    }
    // The real motif shot, with a pretend browser and dev server: what it does with each app is its own.
    const deps: ShotDeps = {
      devCommand,
      serveStatic: () => {
        throw new Error("not a plain site");
      },
      compare: async () => [],
      today: () => "2026-10-26",
      findBrowser: () => ({ name: "Chrome", path: "chrome" }) as any,
      browserOff: () => false,
      startDevServer: async () => ({ url: "http://localhost:5999/", pid: 1, stop: async () => {} }) as any,
      capture: async (o) => {
        mkdirSync(o.outDir, { recursive: true });
        const routes: RouteResult[] = o.routes.map((route) => ({
          route, url: route, status: 200,
          shots: (o.viewports ?? []).flatMap((v) => (["light", "dark"] as const).map((scheme) => {
            const file = join(o.outDir, shotName(routeSlug(route), v.file ?? v.name, scheme));
            writeFileSync(file, picture(scheme === "light" ? LIGHT : DARK));
            return file;
          })),
        }));
        return { routes, issues: [] };
      },
    };
    const motif: Motif = async (args, cwd) => {
      const flags: Record<string, string> = {};
      for (let i = 1; i < args.length; i += 2) flags[args[i]!.slice(2)] = args[i + 1]!;
      const r = await runShot(cwd, { positionals: [], flags }, deps);
      const json = { command: r.command, ok: r.exitCode === 0, exitCode: r.exitCode, ...r.data };
      return { code: r.exitCode, json, output: r.text };
    };
    const pairs = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, { run: noRun, motif });
    expect(pairs.map((p) => p.outcome)).toEqual(Array(6).fill("motif-only"));
    expect(pairs.every((p) => p.motif && !p.baseline)).toBe(true);
    expect(pairs[0]!.why).toContain("cant-start");
    expect(readFileSync(join(s.out, "a-stride", "pair-shots.json"), "utf8")).toContain("cant-start");
  });
});

describe("shootPairs: equal setup, and nothing in the files' order or times", () => {
  /** Two Expo apps without Expo's web packages (or with some), and a run that records the installs. */
  function expo(declare: { withMotif?: Record<string, string>; without?: Record<string, string> } = {}) {
    const s = sides("rihla");
    const dep = (extra: Record<string, string> = {}) => JSON.stringify({ name: "rihla", dependencies: { expo: "~54.0.0", "expo-router": "~6.0.0", react: "19.1.0", "react-native": "0.81.0", ...extra } });
    writeFileSync(join(s.withMotif, "package.json"), dep(declare.withMotif));
    writeFileSync(join(s.without, "package.json"), dep(declare.without));
    const order: string[] = [];
    const installs: { cmd: string[]; cwd: string }[] = [];
    const run: Run = async (cmd, cwd) => {
      installs.push({ cmd, cwd });
      order.push(`install ${cwd === s.withMotif ? "d" : "a"}`);
      return { code: 0, stdout: "added 3 packages", stderr: "", timedOut: false };
    };
    const f = fakeShot();
    const motif: Motif = async (args, cwd, t) => (order.push(`shot ${cwd === s.withMotif ? "d" : "a"}`), f.motif(args, cwd, t));
    return { s, run, motif, installs, order, calls: f.calls };
  }
  const WEB = ["react-dom", "react-native-web", "@expo/metro-runtime"];

  test("an Expo brief: both apps get Expo's web packages the same way before they're shot, and the pairs say so", async () => {
    const e = expo();
    const pairs = await shootPairs("rihla", e.s.withMotif, e.s.without, byId("d-rihla"), e.s.out, { run: e.run, motif: e.motif });
    expect(e.installs).toEqual([
      { cmd: ["npx", "expo", "install", ...WEB], cwd: e.s.withMotif },
      { cmd: ["npx", "expo", "install", ...WEB], cwd: e.s.without },
    ]);
    expect(e.order).toEqual(["install d", "shot d", "install a", "shot a"]);
    expect(pairs.map((p) => [p.screen, p.size, p.outcome])).toEqual([["/", 390, "both"], ["/sign-in", 390, "both"], ["/trips", 390, "both"]]);
    for (const p of pairs) expect(p.webSetup).toEqual({ motif: WEB, baseline: WEB });
    expect(readFileSync(join(e.s.out, "a-rihla", "pair-install.log"), "utf8")).toContain("added 3 packages");
  });

  test("what an app already declares isn't installed again; an app with them all gets no install", async () => {
    const e = expo({ withMotif: { "react-dom": "19.1.0", "react-native-web": "^0.21.0", "@expo/metro-runtime": "~6.0.0" }, without: { "react-dom": "19.1.0" } });
    const pairs = await shootPairs("rihla", e.s.withMotif, e.s.without, byId("d-rihla"), e.s.out, { run: e.run, motif: e.motif });
    expect(e.installs).toEqual([{ cmd: ["npx", "expo", "install", "react-native-web", "@expo/metro-runtime"], cwd: e.s.without }]);
    expect(pairs[0]!.webSetup).toEqual({ motif: [], baseline: ["react-native-web", "@expo/metro-runtime"] });
  });

  test("an install that fails on one side makes that side lose its pairs, with why; it isn't shot", async () => {
    const f = expo();
    // The app built without Motif fails its install.
    const run: Run = async (cmd, cwd, t) => (cwd === f.s.without ? { code: 1, stdout: "", stderr: "npm error ERESOLVE could not resolve", timedOut: false } : f.run(cmd, cwd, t));
    const pairs = await shootPairs("rihla", f.s.withMotif, f.s.without, byId("d-rihla"), f.s.out, { run, motif: f.motif });
    expect(pairs.map((p) => p.outcome)).toEqual(["motif-only", "motif-only", "motif-only"]);
    for (const p of pairs) {
      expect(p.why).toContain("Expo's web packages (react-dom, react-native-web, @expo/metro-runtime) couldn't be installed");
      expect(p.why).toContain("ERESOLVE");
    }
    expect(f.calls.map((c) => c.cwd)).toEqual([f.s.withMotif]);
    expect(pairs[0]!.webSetup).toEqual({ motif: WEB, baseline: [] });
  });

  test("a screenshot that isn't a whole PNG loses only its side of that pair, with why; nothing it would have written is left", async () => {
    const s = sides();
    const pairs = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, {
      run: noRun, motif: bySide(s.withMotif, fakeShot().motif, fakeShot({ garbage: ["/sign-in"] }).motif),
    });
    expect(pairs.map((p) => [p.screen, p.size, p.outcome])).toEqual([
      ["/", 390, "both"], ["/", 1440, "both"], ["/sign-in", 390, "motif-only"], ["/sign-in", 1440, "both"], ["/home", 390, "both"], ["/home", 1440, "both"],
    ]);
    expect(pairs[2]!.why).toContain("/sign-in's screenshot 390 px wide can't be used: Not a PNG image.");
    const listed = pairs.flatMap((p) => [p.motif, p.baseline]).filter((x): x is string => Boolean(x)).map((x) => basename(x));
    expect(readdirSync(join(s.out, "a", "img")).sort()).toEqual(listed.sort());
  });

  test("every image has the same time, so the order they were written in doesn't show", async () => {
    const s = sides();
    const pairs = await shootPairs("stride", s.withMotif, s.without, byId("d-stride"), s.out, { run: noRun, motif: fakeShot().motif });
    const times = new Set(pairs.flatMap((p) => [p.motif!, p.baseline!]).map((img) => statSync(join(s.out, img)).mtimeMs));
    expect(times.size).toBe(1);
  });
});

describe("pairBrief", () => {
  test("if the pairs can't be saved, the images this try wrote are removed and the step throws", async () => {
    const s = sides();
    writeFileSync(join(s.withMotif, "DESIGN.md"), "# Stride\n");
    // a/pairs.json can't be read: a folder stands in its place.
    mkdirSync(join(s.out, pairsFile), { recursive: true });
    const ws = (app: string): Workspace => ({ dir: join(app, ".."), app, gitDir: "" });
    await expect(pairBrief("stride", ws(s.withMotif), ws(s.without), s.out, { run: noRun, motif: fakeShot().motif })).rejects.toThrow();
    expect(readdirSync(join(s.out, "a", "img"))).toEqual([]);
  });
});

describe("pairBrief", () => {
  const ws = (app: string): Workspace => ({ dir: join(app, ".."), app, gitDir: join(app, "..", "baseline.git") });

  test("finds each side's app, shoots both and writes a/pairs.json; again for the same brief replaces its pairs and images, and keeps the others'", async () => {
    const s = sides();
    // Test D's app has its design guide; Test A's is found by its project file.
    writeFileSync(join(s.withMotif, "DESIGN.md"), "# Stride\n");
    const f = fakeShot();
    const said = await pairBrief("stride", ws(s.withMotif), ws(s.without), s.out, { run: noRun, motif: f.motif });
    expect(pairsFile).toBe("a/pairs.json");
    expect(f.calls.map((c) => c.cwd)).toEqual([s.withMotif, s.without]);
    const first = readPairs(s.out);
    expect(first).toHaveLength(6);
    expect(JSON.parse(readFileSync(join(s.out, pairsFile), "utf8"))).toEqual(first);
    expect(said).toBe("stride: 6 pairs for Test A, all with both apps' screens.");

    // Another brief's pairs are added beside them.
    const other: Pair = { id: "0123456789ab", brief: "bloom", screen: "/", size: 390, motif: "a/img/aaaaaaaaaaaa.png", outcome: "motif-only", why: "x" };
    writeFileSync(join(s.out, pairsFile), JSON.stringify([...first, other]));
    writeFileSync(join(s.out, "a", "img", "aaaaaaaaaaaa.png"), "");
    const again = await pairBrief("stride", ws(s.withMotif), ws(s.without), s.out, { run: noRun, motif: bySide(s.withMotif, fakeShot().motif, fakeShot({ fail: "cant-start" }).motif) });
    expect(again).toBe("stride: 6 pairs for Test A: 0 with both apps' screens, 6 with only the one made with Motif, 0 with only the other, 0 with neither (left out).");
    const now = readPairs(s.out);
    expect(now.filter((p) => p.brief === "bloom")).toEqual([other]);
    expect(now.filter((p) => p.brief === "stride").map((p) => p.outcome)).toEqual(Array(6).fill("motif-only"));
    // The first shoot's images are gone; the new ones and the other brief's are there.
    const files = readdirSync(join(s.out, "a", "img")).sort();
    expect(files).toEqual([...now.flatMap((p) => [p.motif, p.baseline]).filter((x): x is string => Boolean(x)).map((x) => basename(x))].sort());
  });

  test("a side with no app found loses its pairs", async () => {
    const s = sides();
    // No DESIGN.md: Test D's app isn't found.
    const f = fakeShot();
    await pairBrief("stride", ws(s.withMotif), ws(s.without), s.out, { run: noRun, motif: f.motif });
    expect(f.calls.map((c) => c.cwd)).toEqual([s.without]);
    expect(readPairs(s.out).map((p) => p.outcome)).toEqual(Array(6).fill("baseline-only"));
  });
});
