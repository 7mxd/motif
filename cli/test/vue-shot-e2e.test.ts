import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { findBrowser } from "../src/detect/browser";
import { FIXTURES, heavyStackTests } from "./helpers";
import { pixel } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// motif shot on vue-min (Vite, Vue Router, Tailwind 4, Motion for Vue) and nuxt-min (Nuxt 4, each page rendered on the
// server) in Chrome (plan 2I, Task 8). Needs Node with npm (both dev servers run on Node) and Chrome, Edge or Chromium;
// bun's skipIf takes no reason, so each name says it. Each fixture is installed once into a temp copy with npm ci, and its
// theme is made there by today's motif tokens from the fixture's guide (two variants, Onest with Noto Naskh Arabic as its
// Arabic companion, both bundled by the app). Every run starts the app's own dev script, as a developer's would.
// In CI it runs in the vue job only (the gate in helpers.ts).
//
// vue-min picks its words by the browser's language and leaves dir alone, so Motif turns it right to left; nuxt-min reads
// Accept-Language as it renders on the server and sets dir="rtl" itself. vue-min's /audit holds planted problems and
// /calm the same loop as /audit, stopped through motion-v's useReducedMotion.
const npm = Bun.which("npm");
const node = Bun.which("node");
const browser = findBrowser() !== null;
const gate = heavyStackTests("vue", Boolean(npm && node && browser));
const ready = gate.run;
const reason = !node || !npm ? "Node and npm aren't installed" : !browser ? "no Chrome, Edge or Chromium was found" : gate.reason;
if (!ready) console.log(`[vue-shot-e2e] skipped: ${reason}.`);

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

/** A temp copy of the fixture (a space in its path, as in many Windows user folders), installed, with the theme made and the state scripts. */
async function install(fixture: string): Promise<string> {
  const app = tempDir(`motif ${fixture} shot `);
  cpSync(join(FIXTURES, fixture), app, { recursive: true, filter: (src) => !["node_modules", ".nuxt", ".output", "dist"].includes(basename(src)) });
  // The packages are fetched once; npm's cache makes later runs offline.
  if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], app).code !== 0) {
    const again = run([npm!, "ci", "--no-audit", "--no-fund"], app);
    if (again.code !== 0) console.log(again.out);
    expect(again.code).toBe(0);
  }
  const made = await runTokens(app, { positionals: [] });
  expect(made.exitCode).toBe(0);
  mkdirSync(join(app, "design", "states"), { recursive: true });
  writeFileSync(join(app, "design", "states", "check.js"), CHECK);
  writeFileSync(join(app, "design", "states", "filled.js"), FILLED);
  return app;
}

// Checks each screenshot's look from inside the page; what it throws is the page's error, which the tests look for: the
// variant's background in light or dark, the title in Onest (Noto Naskh Arabic when it reads right to left, Arabic letters
// and all) with that face loaded, and, in a Nuxt app, a page the server rendered.
const CHECK = `
await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))));
const html = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)").matches;
const variant = html.dataset.variant;
if (variant !== "default" && variant !== "partner") throw new Error("data-variant is " + variant);
const backgrounds = { default: ["rgb(249, 250, 251)", "rgb(3, 7, 18)"], partner: ["rgb(255, 237, 213)", "rgb(12, 10, 9)"] };
const title = document.querySelector("h1");
if (!title) throw new Error("no title on the page: " + document.body.innerText.slice(0, 80));
let box = title;
while (box && getComputedStyle(box).backgroundColor === "rgba(0, 0, 0, 0)") box = box.parentElement;
const background = box ? getComputedStyle(box).backgroundColor : "none";
if (background !== backgrounds[variant][dark ? 1 : 0]) throw new Error(variant + (dark ? " dark" : " light") + " has the background " + background);
const rtl = getComputedStyle(html).direction === "rtl";
if (rtl !== /[\\u0600-\\u06FF]/.test(title.textContent)) throw new Error("the title is " + title.textContent + (rtl ? " right to left" : " left to right"));
const family = getComputedStyle(title).fontFamily.replace(/"/g, "");
if (!family.startsWith("Onest, Noto Naskh Arabic")) throw new Error("the title is in " + family);
const face = rtl ? "Noto Naskh Arabic" : "Onest";
if (![...document.fonts].some((f) => f.family.replace(/"/g, "") === face && f.status === "loaded")) throw new Error(face + " isn't loaded");
const payload = document.getElementById("__NUXT_DATA__");
if (payload && payload.dataset.ssr !== "true") throw new Error("Nuxt didn't render the page on the server");
`;

// Types a name into the settings page's field, as a person would, and checks the page answered it.
const FILLED = `
const field = document.querySelector("input");
if (field) {
  field.value = "Layla";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 100));
  if (!/(Hello,|أهلًا،) Layla/.test(document.body.innerText)) throw new Error("the field didn't take the text");
}
`;

type Shot = Awaited<ReturnType<typeof runShot>>;
const routesOf = (r: Shot) => r.data.routes as { route: string; status: number; pageErrors?: string[]; error?: string; loading?: string }[];
const notesOf = (r: Shot) => (r.data.notes as string[] | undefined) ?? [];
const plain = (r: Shot) => (r.data.shots as string[]).filter((s) => !s.includes("@"));

/** Every route drew without an error, the state scripts' included; the run's output is shown when it exits otherwise than expected. */
function clean(r: Shot, exitCode = 0) {
  if (r.exitCode !== exitCode) console.log(r.text);
  expect(routesOf(r).map((x) => ({ route: x.route, status: x.status, errors: x.pageErrors ?? [], error: x.error, loading: x.loading }))).toEqual(
    routesOf(r).map((x) => ({ route: x.route, status: 200, errors: [], error: undefined, loading: undefined })),
  );
}

/** A run of motif shot, and how long after it started its first screenshot was written (the dev server's start included). */
async function timedShot(app: string, flags: Record<string, string | boolean>): Promise<{ r: Shot; firstShotS: number }> {
  const started = Date.now();
  const r = await runShot(app, { positionals: [], flags });
  const first = Math.min(...(r.data.shots as string[]).map((s) => statSync(join(app, s)).mtimeMs));
  return { r, firstShotS: Math.round((first - started) / 100) / 10 };
}

describe("motif shot on vue-min, through Vite", () => {
  let app = "";
  const png = (name: string) => readFileSync(join(app, "design", "shots", name));
  const differ = (a: string, b: string) => expect(png(a).equals(png(b))).toBe(false);

  beforeAll(async () => {
    if (ready) app = await install("vue-min");
  }, 900_000);

  test.skipIf(!ready)("its four pages at 390 and 1440 in light and dark, in the guide's colours and the app's own fonts (skipped without Node, npm or a browser)", async () => {
    const { r, firstShotS } = await timedShot(app, { sizes: "390,1440", state: "design/states/check.js" });
    console.log(`[vue-shot-e2e] Vite: the first screenshot came ${firstShotS} s after motif shot started.`);
    clean(r);
    expect(r.exitCode).toBe(0);
    // The routes come from src/router/index.ts, the lazy ones included.
    expect(routesOf(r).map((x) => x.route).sort()).toEqual(["/", "/audit", "/calm", "/settings"]);
    expect(plain(r).filter((s) => /\/(index|settings)\./.test(s))).toEqual([
      "design/shots/index.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index.desktop.png", "design/shots/index.desktop.dark.png",
      "design/shots/settings.mobile.png", "design/shots/settings.mobile.dark.png", "design/shots/settings.desktop.png", "design/shots/settings.desktop.dark.png",
    ]);
    expect((r.data.shots as string[]).filter((s) => s.includes("@check"))).toHaveLength(16);
    expect(pngSize(new Uint8Array(png("index.mobile.png"))).width).toBe(780);
    expect(pngSize(new Uint8Array(png("index.desktop.png"))).width).toBe(1440);
    differ("index.mobile.png", "index.mobile.dark.png");
    differ("settings.desktop.png", "settings.desktop.dark.png");
    // The guide's background, light and dark, at the top left.
    expect(pixel(png("index.mobile.png"), 4, 4).slice(0, 3)).toEqual([249, 250, 251]);
    expect(pixel(png("index.mobile.dark.png"), 4, 4).slice(0, 3)).toEqual([3, 7, 18]);
  }, 600_000);

  test.skipIf(!ready)("--variant all draws +partner files that differ from the default's (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/", variant: "all", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r)).toEqual(["design/shots/index.mobile.png", "design/shots/index+partner.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+partner.mobile.dark.png"]);
    differ("index.mobile.png", "index+partner.mobile.png");
    differ("index.mobile.dark.png", "index+partner.mobile.dark.png");
    expect(pixel(png("index+partner.mobile.png"), 4, 4).slice(0, 3)).toEqual([255, 237, 213]);
    expect(notesOf(r).join("\n")).not.toContain("looks the same as the default");
  }, 600_000);

  test.skipIf(!ready)("--rtl draws .rtl files in Arabic, in the companion font; Motif turns the page right to left and says so (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/,/settings", rtl: true, state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r).filter((s) => s.includes(".rtl"))).toEqual([
      "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.rtl.dark.png", "design/shots/settings.mobile.rtl.png", "design/shots/settings.mobile.rtl.dark.png",
    ]);
    differ("index.mobile.png", "index.mobile.rtl.png");
    differ("settings.mobile.dark.png", "settings.mobile.rtl.dark.png");
    expect(notesOf(r)).toContain(`/ doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.`);
  }, 600_000);

  test.skipIf(!ready)("a state that types into the settings field draws settings@filled with the answer on the page (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/settings", state: "design/states/filled.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(r.data.shots).toEqual(["design/shots/settings.mobile.png", "design/shots/settings@filled.mobile.png", "design/shots/settings.mobile.dark.png", "design/shots/settings@filled.mobile.dark.png"]);
    differ("settings.mobile.png", "settings@filled.mobile.png");
  }, 600_000);

  test.skipIf(!ready)("--audit finds the faint caption, the unnamed 32 px icon button and the loop that ignores reduced motion, and passes the one that checks it (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", routes: "/audit,/calm", variant: "default", audit: true } });
    // Findings make the run exit 1.
    clean(r, 1);
    expect(r.exitCode).toBe(1);
    const findings = (JSON.parse(readFileSync(join(app, "design", "shots", "audit.json"), "utf8")).findings as { location: { screen: string }; locations?: { screen: string }[]; category: string; summary: string; fix: string }[]);
    // Each finding on every page it was seen.
    const on = (screen: string) => findings.filter((f) => [f.location, ...(f.locations ?? [])].some((l) => l.screen === screen));
    expect(on("/calm")).toEqual([]);
    expect(on("/audit").map((f) => [f.category, f.summary]).sort()).toEqual([
      ["accessibility", "The button has no name a screen reader can say."],
      ["contrast", `Text "Last restocked three days ago" is hard to read in light and dark mode (1.55:1, needs 4.5:1).`],
      ["reduced-motion", "An element keeps moving when the viewer asks for reduced motion."],
      ["target-size", "A button is 32×32 px on a phone; 44×44 px is easier to tap."],
    ]);
    // Motion for Vue's own way to stop it.
    expect(on("/audit").find((f) => f.category === "reduced-motion")!.fix).toContain("useReducedMotion()");
  }, 600_000);
});

describe("motif shot on nuxt-min, rendered on the server by nuxt dev", () => {
  let app = "";
  const png = (name: string) => readFileSync(join(app, "design", "shots", name));
  const differ = (a: string, b: string) => expect(png(a).equals(png(b))).toBe(false);

  beforeAll(async () => {
    if (ready) app = await install("nuxt-min");
  }, 900_000);

  test.skipIf(!ready)("/ and /settings at 390 and 1440, light and dark, in each variant, without Nuxt DevTools' panel (skipped without Node, npm or a browser)", async () => {
    // The first run is cold: nuxt dev builds the app the first time a page is asked for.
    const { r, firstShotS } = await timedShot(app, { sizes: "390,1440", variant: "all", state: "design/states/check.js" });
    console.log(`[vue-shot-e2e] Nuxt: the first screenshot came ${firstShotS} s after motif shot started.`);
    clean(r);
    expect(r.exitCode).toBe(0);
    // The routes come from app/pages.
    expect(routesOf(r).map((x) => x.route)).toEqual(["/", "/settings"]);
    expect(plain(r).filter((s) => s.includes("/index"))).toEqual([
      "design/shots/index.mobile.png", "design/shots/index+partner.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+partner.mobile.dark.png",
      "design/shots/index.desktop.png", "design/shots/index+partner.desktop.png", "design/shots/index.desktop.dark.png", "design/shots/index+partner.desktop.dark.png",
    ]);
    expect(plain(r)).toHaveLength(16);
    expect(pngSize(new Uint8Array(png("settings.desktop.png"))).width).toBe(1440);
    differ("index.mobile.png", "index.mobile.dark.png");
    differ("index.mobile.png", "index+partner.mobile.png");
    differ("settings.desktop.dark.png", "settings+partner.desktop.dark.png");
    // Nuxt DevTools floats its panel at the bottom centre of every page in development: the app's background shows there.
    const { width, height } = pngSize(new Uint8Array(png("index.mobile.png")));
    expect(pixel(png("index.mobile.png"), width / 2, height - 50).slice(0, 3)).toEqual([249, 250, 251]);
    expect(pixel(png("index.desktop.dark.png"), 720, 876).slice(0, 3)).toEqual([3, 7, 18]);
  }, 600_000);

  test.skipIf(!ready)("--rtl in Arabic with the companion font, right to left by the app itself, and a state that fills the settings field (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", rtl: true, state: "design/states/check.js,design/states/filled.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r)).toEqual([
      "design/shots/index.mobile.png", "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.dark.png", "design/shots/index.mobile.rtl.dark.png",
      "design/shots/settings.mobile.png", "design/shots/settings.mobile.rtl.png", "design/shots/settings.mobile.dark.png", "design/shots/settings.mobile.rtl.dark.png",
    ]);
    differ("index.mobile.png", "index.mobile.rtl.png");
    for (const name of ["settings@filled.mobile.png", "settings@filled.mobile.rtl.png", "settings@filled.mobile.dark.png", "settings@filled.mobile.rtl.dark.png"]) {
      expect(existsSync(join(app, "design", "shots", name))).toBe(true);
    }
    differ("settings.mobile.png", "settings@filled.mobile.png");
    differ("settings.mobile.rtl.png", "settings@filled.mobile.rtl.png");
    // Nuxt set dir="rtl" from Accept-Language as it rendered: Motif had nothing to turn.
    expect(notesOf(r).join("\n")).not.toContain("doesn't switch to right to left");
  }, 600_000);

  test.skipIf(!ready)("--audit finds nothing: Nuxt DevTools' small controls aren't the app's (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "default", audit: true } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.text).toContain("✓ Audit: no contrast, tap-target or reduced-motion problems found, and no controls without a name");
  }, 600_000);
});
