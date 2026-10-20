import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  bundledFonts,
  googleFontFiles,
  GRACE_MS,
  flutterTail,
  HARNESS_TEST,
  isFontFile,
  RESULT_FILE,
  runHarness,
  sdkFonts,
  type FetchLike,
} from "../src/stacks/flutter/harness";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const TTF = new Uint8Array([0, 1, 0, 0, 0, 9, 0, 128]);
const CSS = `@font-face {
  font-family: 'Onest';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/onest/v1/regular.ttf) format('truetype');
}
@font-face {
  font-family: 'Onest';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/onest/v1/bold-italic.ttf) format('truetype');
}`;

/** A fetch that answers from a table of URL → response, and records what was asked. */
function fakeFetch(answer: (url: string) => Response | Promise<Response>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const f = async (url: string) => {
    urls.push(url);
    return answer(url);
  };
  return Object.assign(f, { urls });
}

describe("isFontFile", () => {
  test("accepts TrueType, OpenType, Apple TrueType and collections, and nothing else", () => {
    expect(isFontFile(TTF)).toBe(true);
    for (const tag of ["OTTO", "true", "ttcf"]) expect(isFontFile(new TextEncoder().encode(`${tag}rest`))).toBe(true);
    expect(isFontFile(new TextEncoder().encode("<!DOCTYPE html>"))).toBe(false);
    expect(isFontFile(new TextEncoder().encode("wOF2...."))).toBe(false);
    expect(isFontFile(new Uint8Array([0, 1]))).toBe(false);
  });
});

describe("googleFontFiles", () => {
  test("downloads every face once, under google_fonts' names and the plain family", async () => {
    const home = tempDir("motif-fonts-");
    const fetch = fakeFetch((url) => (url.includes("googleapis") ? new Response(CSS) : new Response(TTF)));
    const first = await googleFontFiles("Onest", home, { fetch });
    expect(first.notes).toEqual([]);
    expect(first.fonts.map((f) => f.family)).toEqual(["Onest_regular", "Onest_700italic", "Onest"]);
    expect(first.fonts[2]!.files).toHaveLength(2);
    const dir = join(home, "fonts", "google", "Onest");
    expect(readdirSync(dir).sort()).toEqual(["700italic.ttf", "files.json", "regular.ttf"]);
    expect(fetch.urls).toHaveLength(3);

    // Cached: no network the second time.
    const offline = fakeFetch(() => Promise.reject(new Error("offline")));
    const again = await googleFontFiles("Onest", home, { fetch: offline });
    expect(again).toEqual(first);
    expect(offline.urls).toEqual([]);
  });

  test("a family with spaces is registered as google_fonts names it, without the spaces, and under its plain name both ways", async () => {
    const home = tempDir("motif-fonts-");
    const fetch = fakeFetch((url) => (url.includes("googleapis") ? new Response(CSS) : new Response(TTF)));
    const r = await googleFontFiles("Readex Pro", home, { fetch });
    expect(r.fonts.map((f) => f.family)).toEqual(["ReadexPro_regular", "ReadexPro_700italic", "Readex Pro", "ReadexPro"]);
    expect(r.fonts[3]!.files).toEqual(r.fonts[2]!.files);
    expect(existsSync(join(home, "fonts", "google", "Readex Pro", "files.json"))).toBe(true);
  });

  test("refuses a download that isn't a font, and caches nothing", async () => {
    const home = tempDir("motif-fonts-");
    const fetch = fakeFetch((url) => (url.includes("googleapis") ? new Response(CSS) : new Response("<html>blocked</html>")));
    const r = await googleFontFiles("Onest", home, { fetch });
    expect(r.fonts).toEqual([]);
    expect(r.notes[0]).toContain("isn't a font file");
    expect(existsSync(join(home, "fonts", "google", "Onest", "files.json"))).toBe(false);
  });

  test("says when Google Fonts has no such family, and writes no empty list", async () => {
    const home = tempDir("motif-fonts-");
    const empty = await googleFontFiles("Nofont", home, { fetch: fakeFetch(() => new Response("")) });
    expect(empty).toEqual({ fonts: [], notes: ["Google Fonts has no family named Nofont. Its text is drawn in a fallback font."] });
    const unknown = await googleFontFiles("Nofont", home, { fetch: fakeFetch(() => new Response("bad", { status: 400 })) });
    expect(unknown.notes[0]).toStartWith("Google Fonts has no family named Nofont.");
    expect(existsSync(join(home, "fonts", "google", "Nofont", "files.json"))).toBe(false);
  });

  test("never puts a name that isn't a family name in a path or a request", async () => {
    const home = tempDir("motif-fonts-");
    for (const name of ["../escape", "a/b", "C:\\x", "", " Lead", "x".repeat(101)]) {
      const fetch = fakeFetch(() => new Response(CSS));
      const r = await googleFontFiles(name, home, { fetch });
      expect(r.fonts).toEqual([]);
      expect(r.notes[0]).toContain("isn't a Google Fonts family name");
      expect(fetch.urls).toEqual([]);
    }
    expect(existsSync(join(home, "fonts"))).toBe(false);
  });

  test("never trusts a cached list that names a file outside the family's folder", async () => {
    const home = tempDir("motif-fonts-");
    const dir = join(home, "fonts", "google", "Onest");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(home, "fonts", "secret.ttf"), TTF);
    for (const file of ["../secret.ttf", "..\\secret.ttf", "/etc/passwd", "sub/regular.ttf", "files.json"]) {
      writeFileSync(join(dir, "files.json"), JSON.stringify([{ weight: 400, italic: false, file }]));
      const fetch = fakeFetch((url) => (url.includes("googleapis") ? new Response(CSS) : new Response(TTF)));
      const r = await googleFontFiles("Onest", home, { fetch });
      // The list is ignored and the family downloaded again, into plain names.
      expect(fetch.urls.length).toBeGreaterThan(0);
      expect(r.fonts.flatMap((f) => f.files).every((f) => f.startsWith(dir))).toBe(true);
    }
  });

  test("turns a network failure or a slow answer into a note", async () => {
    const home = tempDir("motif-fonts-");
    const down = await googleFontFiles("Onest", home, { fetch: fakeFetch(() => Promise.reject(new Error("getaddrinfo ENOTFOUND"))) });
    expect(down.notes).toEqual(["Couldn't download the font Onest from Google Fonts (getaddrinfo ENOTFOUND). Its text is drawn in a fallback font."]);
    // A server that never answers: only the request's time limit ends it.
    const hang = await googleFontFiles("Onest", home, {
      timeoutMs: 50,
      fetch: (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    });
    expect(hang.notes[0]).toContain("it took too long");
  });
});

describe("sdkFonts", () => {
  function fakeSdk(withFonts: boolean): string {
    const sdk = tempDir("motif-flutter-sdk-");
    mkdirSync(join(sdk, "bin"), { recursive: true });
    writeFileSync(join(sdk, "bin", "flutter"), "");
    if (withFonts) {
      const fonts = join(sdk, "bin", "cache", "artifacts", "material_fonts");
      mkdirSync(fonts, { recursive: true });
      for (const f of ["roboto-regular.ttf", "roboto-bold.ttf", "materialicons-regular.otf", "roboto_license.txt"]) writeFileSync(join(fonts, f), "");
    }
    return sdk;
  }

  test("finds Roboto and the Material icons through a linked flutter command", () => {
    const sdk = fakeSdk(true);
    // A link to the SDK's bin folder, as a flutter on the PATH often is (a junction needs no rights on Windows).
    const elsewhere = tempDir("motif-path-");
    symlinkSync(join(sdk, "bin"), join(elsewhere, "bin"), "junction");
    const r = sdkFonts(join(elsewhere, "bin", "flutter"));
    expect(r.notes).toEqual([]);
    expect(r.fonts.map((f) => [f.family, f.files.length])).toEqual([["Roboto", 2], ["MaterialIcons", 1]]);
    expect(r.fonts[0]!.files[0]!.startsWith(join(elsewhere, "bin"))).toBe(false);
  });

  test("notes a missing material_fonts folder", () => {
    const r = sdkFonts(join(fakeSdk(false), "bin", "flutter"));
    expect(r.fonts).toEqual([]);
    expect(r.notes[0]).toContain("material_fonts");
    expect(r.notes[0]).toContain("flutter precache");
  });
});

describe("bundledFonts", () => {
  test("leaves out a listed file that doesn't exist, with a note", () => {
    const app = tempDir("motif-app-");
    mkdirSync(join(app, "fonts"));
    writeFileSync(join(app, "fonts", "Brand.ttf"), TTF);
    const pubspec = `name: app
flutter:
  fonts:
    - family: Brand
      fonts:
        - asset: fonts/Brand.ttf
        - asset: fonts/Brand-Bold.ttf
          weight: 700
    - family: Gone
      fonts:
        - asset: fonts/Gone.ttf
`;
    const r = bundledFonts(app, pubspec);
    expect(r.fonts).toEqual([{ family: "Brand", files: [join(app, "fonts", "Brand.ttf")] }]);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0]).toContain("fonts/Brand-Bold.ttf (Brand)");
    expect(r.notes[1]).toContain("fonts/Gone.ttf (Gone)");
  });
});

describe("runHarness", () => {
  function fakeApp(): { app: string; outDir: string } {
    const app = tempDir("motif-app-");
    writeFileSync(join(app, "pubspec.yaml"), "name: fake_app\n");
    return { app, outDir: join(app, "shots") };
  }
  const shot = { file: "home.mobile.png", route: "/", width: 390, height: 844, dpr: 2, dark: false, locale: "en" };

  test("stops a run at the time limit, with what it started, and still removes its files", async () => {
    const { app, outDir } = fakeApp();
    const pidFile = join(app, "child.pid");
    // A stand-in for flutter test: starts a child that shares its output pipes, then both sleep.
    const script = join(app, "slow.ts");
    writeFileSync(
      script,
      `const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(60000)"], { stdout: "inherit", stderr: "inherit" });
await Bun.write(${JSON.stringify(pidFile)}, String(child.pid));
console.log("started");
await Bun.sleep(60000);
`,
    );
    const timeoutMs = 2000;
    const started = performance.now();
    const r = await runHarness({ appDir: app, outDir, shots: [shot], googleFonts: [], timeoutMs, flutter: join(app, "no-sdk", "bin", "flutter"), command: [process.execPath, script] });
    const took = performance.now() - started;
    expect(r.timedOut).toBe(true);
    expect(took).toBeLessThan(timeoutMs + 2 * GRACE_MS + 2000);
    expect(r.output).toContain("started");
    expect(r.shots).toEqual([]);
    expect(r.notes[0]).toContain("material_fonts");
    expect(existsSync(join(app, HARNESS_TEST))).toBe(false);
    expect(existsSync(join(app, ".motif/shot/config.json"))).toBe(false);
    // The child is gone too.
    const childPid = Number(readFileSync(pidFile, "utf8"));
    let alive = true;
    for (let i = 0; i < 30 && alive; i++) {
      try {
        process.kill(childPid, 0);
        await Bun.sleep(100);
      } catch {
        alive = false;
      }
    }
    expect(alive).toBe(false);
  }, 30_000);

  test("clears the last run's result and screenshots before it starts", async () => {
    const { app, outDir } = fakeApp();
    mkdirSync(outDir, { recursive: true });
    mkdirSync(join(app, ".motif", "shot"), { recursive: true });
    writeFileSync(join(app, RESULT_FILE), JSON.stringify({ shots: [{ file: "home.mobile.png" }] }));
    writeFileSync(join(outDir, "home.mobile.png"), "old");
    const failing = join(app, "fail.ts");
    writeFileSync(failing, `console.error("Compilation failed"); process.exit(1);`);
    const r = await runHarness({ appDir: app, outDir, shots: [shot], googleFonts: [], timeoutMs: 20_000, flutter: join(app, "no-sdk", "bin", "flutter"), command: [process.execPath, failing] });
    expect(r.code).toBe(1);
    expect(r.timedOut).toBe(false);
    expect(r.output).toContain("Compilation failed");
    expect(r.shots).toEqual([]);
    expect(existsSync(join(app, RESULT_FILE))).toBe(false);
    expect(existsSync(join(outDir, "home.mobile.png"))).toBe(false);
    expect(existsSync(join(app, HARNESS_TEST))).toBe(false);
  }, 30_000);
});

describe("flutterTail", () => {
  test("keeps Flutter's last lines without google_fonts' noise", () => {
    const output = [
      "00:01 +0: loading",
      "Error: google_fonts was unable to load font Onest-Regular because the following exception occurred:",
      "Exception: GoogleFonts.config.allowRuntimeFetching is false but font Onest-Regular was not found in the application assets.",
      "There is likely something wrong with your test. Please see https://github.com/flutter/packages/blob/main/packages/google_fonts/example/test for examples of how to test with google_fonts.",
      "If troubleshooting doesn't solve the problem, please file an issue at https://github.com/flutter/flutter/issues/new/choose.",
      "",
      "lib/main.dart:3:1: Error: Expected ';' after this.",
    ].join("\n");
    expect(flutterTail(output)).toBe("00:01 +0: loading\nlib/main.dart:3:1: Error: Expected ';' after this.");
    expect(flutterTail(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n")).split("\n")).toHaveLength(20);
  });
});
