import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { findBrowser } from "../src/detect/browser";
import { nodeFloor } from "../src/project/node-floor";
import { VIEWPORTS } from "../src/shot/capture";
import { FIXTURES, heavyStackTests } from "./helpers";
import { pixel } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// motif shot on Angular apps in Chrome (plan 2K, Task 8): angular-min (Angular 21.2, ng new --style=tailwind) and
// ng22-min (Angular 22.2, the same app, which needs a newer Node). Needs Node with npm (ng serve runs on Node) and Chrome,
// Edge or Chromium; bun's skipIf takes no reason, so each name says it. Each fixture is installed once into a temp copy
// with npm ci, and its theme is made there by today's motif tokens from the fixture's guide (two variants, Onest with
// Noto Naskh Arabic as its Arabic companion, both bundled by the app from src/styles.css). Every run starts the app's own
// start script (ng serve), as a developer's would.
//
// Both apps pick their words by the browser's language and leave dir alone, so Motif turns them right to left and says so.
// angular-min's /audit holds planted problems, and a square Motion keeps turning; /calm has the same square, started only
// when matchMedia says the viewer didn't ask for reduced motion, and a CSS loop through animate.enter, which the theme's
// reduced-motion rule stops by itself. ng22-min has / , /calm and /settings.
//
// In CI they run in the angular job only (MOTIF_STACK_JOB); elsewhere wherever the toolchain is, as angular-compile does.
const npm = Bun.which("npm");
const node = Bun.which("node");
const browser = findBrowser() !== null;
const version = node ? Bun.spawnSync([node, "--version"], { stdout: "pipe" }).stdout.toString().trim().replace(/^v/, "") || null : null;
/** The Node versions each Angular runs on (@angular/core's engines). */
const ANGULAR_21_NODE = "^20.19.0 || ^22.12.0 || >=24.0.0";
const ANGULAR_22_NODE = "^22.22.3 || ^24.15.0 || >=26.0.0";
const gate = heavyStackTests("angular", Boolean(npm && node && browser));
const toolchain = gate.run;
const fits = (range: string) => version !== null && nodeFloor(range, version);
const why = (range: string, angular: string) =>
  !node || !npm ? "Node and npm aren't installed" : !browser ? "no Chrome, Edge or Chromium was found" : !gate.run ? gate.reason : `Angular ${angular} needs Node ${range}, and this is Node ${version ?? "of an unknown version"}`;
const ready = toolchain && fits(ANGULAR_21_NODE);
const ng22Ready = toolchain && fits(ANGULAR_22_NODE);
if (!ready) console.log(`[angular-shot-e2e] skipped: ${why(ANGULAR_21_NODE, "21")}.`);
if (!ng22Ready) console.log(`[angular-shot-e2e] ng22-min skipped: ${why(ANGULAR_22_NODE, "22")}.`);

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

const MOBILE = VIEWPORTS.find((v) => v.name === "mobile" && v.width === 390)!;
const DESKTOP = VIEWPORTS.find((v) => v.name === "desktop")!;
const LIGHT = [249, 250, 251];
const DARK = [3, 7, 18];
const PARTNER = [255, 237, 213];
const PARTNER_DARK = [12, 10, 9];

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NG_CLI_ANALYTICS: "false" } });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

/** A temp copy of the fixture (a space in its path, as in many Windows user folders), installed, with the theme made and the state scripts. */
async function install(fixture: string): Promise<string> {
  const app = tempDir(`motif ${fixture} shot `);
  cpSync(join(FIXTURES, fixture), app, { recursive: true, filter: (src) => !["node_modules", ".angular", "dist"].includes(basename(src)) });
  // The packages are fetched once; npm's cache makes later runs offline.
  if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], app).code !== 0) {
    const again = run([npm!, "ci", "--no-audit", "--no-fund"], app);
    if (again.code !== 0) console.log(again.out);
    expect(again.code).toBe(0);
  }
  const made = await runTokens(app, { positionals: [] });
  expect(made.exitCode).toBe(0);
  // src/styles.css already imports the theme, so tokens has no step to suggest.
  expect(made.text).not.toContain("Next:");
  mkdirSync(join(app, "design", "states"), { recursive: true });
  writeFileSync(join(app, "design", "states", "check.js"), CHECK);
  writeFileSync(join(app, "design", "states", "filled.js"), FILLED);
  return app;
}

// Checks each screenshot's look from inside the page; what it throws is the page's error, which the tests look for: the
// variant's background in light or dark, the title in Onest (Noto Naskh Arabic when it reads right to left, Arabic letters
// and all) with that face loaded.
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
`;

// Types a name into the page's field, as a person would, and checks the page answered it (Angular redraws after the event).
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
const forcedRtl = (route: string) => `${route} doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.`;
const CALM_AUDIT = "✓ Audit: no contrast, tap-target or reduced-motion problems found, and no controls without a name";

/** Every route drew without an error, the state scripts' included; the run's output is shown when it exits otherwise than expected. */
function clean(r: Shot, exitCode = 0) {
  if (r.exitCode !== exitCode) console.log(r.text);
  expect(routesOf(r).map((x) => ({ route: x.route, status: x.status, errors: x.pageErrors ?? [], error: x.error, loading: x.loading }))).toEqual(
    routesOf(r).map((x) => ({ route: x.route, status: 200, errors: [], error: undefined, loading: undefined })),
  );
}

/** The screenshots of one installed app: bytes, comparisons and pixels (in the viewport's CSS pixels, scaled to the PNG's). */
function shots(appOf: () => string) {
  const png = (name: string) => readFileSync(join(appOf(), "design", "shots", name));
  const viewportOf = (name: string) => (name.includes(".desktop") ? DESKTOP : MOBILE);
  return {
    png,
    differ: (a: string, b: string) => expect(png(a).equals(png(b))).toBe(false),
    viewportOf,
    /** The colour at x, y CSS pixels from the top left. */
    at: (name: string, x: number, y: number) => {
      const { scale } = viewportOf(name);
      return pixel(png(name), Math.round(x * scale), Math.round(y * scale)).slice(0, 3);
    },
    /** The PNG is the viewport's width in device pixels. */
    width: (name: string) => {
      const v = viewportOf(name);
      expect(pngSize(new Uint8Array(png(name))).width).toBe(v.width * v.scale);
    },
  };
}

/** Nothing ng serve adds (Vite's error overlay) is on the page: the app's background shows in the top left and along the bottom, where the fixtures draw nothing. */
function onlyTheApp(s: ReturnType<typeof shots>, name: string, background: number[]) {
  const { width, height } = s.viewportOf(name);
  for (const [x, y] of [[4, 4], [8, height - 8], [width / 2, height - 8], [width - 8, height - 8]]) {
    expect([name, x, y, s.at(name, x!, y!)]).toEqual([name, x, y, background]);
  }
}

describe("motif shot on angular-min, Angular 21 through ng serve", () => {
  let app = "";
  const s = shots(() => app);

  beforeAll(async () => {
    if (ready) app = await install("angular-min");
  }, 900_000);

  test.skipIf(!ready)("its four pages at 390 and 1440 in light and dark, in the guide's colours and the app's own fonts (skipped without Node in Angular 21's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    // The routes come from app.routes.ts, the lazy-loaded pages included.
    expect(routesOf(r).map((x) => x.route)).toEqual(["/", "/audit", "/calm", "/settings"]);
    expect(plain(r).filter((p) => /\/(index|settings)\./.test(p))).toEqual([
      "design/shots/index.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index.desktop.png", "design/shots/index.desktop.dark.png",
      "design/shots/settings.mobile.png", "design/shots/settings.mobile.dark.png", "design/shots/settings.desktop.png", "design/shots/settings.desktop.dark.png",
    ]);
    expect((r.data.shots as string[]).filter((p) => p.includes("@check"))).toHaveLength(16);
    s.width("index.mobile.png");
    s.width("index.desktop.png");
    s.differ("index.mobile.png", "index.mobile.dark.png");
    s.differ("settings.desktop.png", "settings.desktop.dark.png");
    onlyTheApp(s, "index.mobile.png", LIGHT);
    onlyTheApp(s, "index.mobile.dark.png", DARK);
    onlyTheApp(s, "settings.desktop.dark.png", DARK);
  }, 600_000);

  test.skipIf(!ready)("--variant all draws +partner files that differ from the default's (skipped without Node in Angular 21's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/", variant: "all", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r)).toEqual(["design/shots/index.mobile.png", "design/shots/index+partner.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+partner.mobile.dark.png"]);
    s.differ("index.mobile.png", "index+partner.mobile.png");
    s.differ("index.mobile.dark.png", "index+partner.mobile.dark.png");
    onlyTheApp(s, "index+partner.mobile.png", PARTNER);
    onlyTheApp(s, "index+partner.mobile.dark.png", PARTNER_DARK);
    expect(notesOf(r).join("\n")).not.toContain("looks the same as the default");
  }, 600_000);

  test.skipIf(!ready)("--rtl in Arabic with the companion font, turned right to left by Motif, and a state that fills the settings field (skipped without Node in Angular 21's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/,/settings", rtl: true, state: "design/states/check.js,design/states/filled.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r)).toEqual([
      "design/shots/index.mobile.png", "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.dark.png", "design/shots/index.mobile.rtl.dark.png",
      "design/shots/settings.mobile.png", "design/shots/settings.mobile.rtl.png", "design/shots/settings.mobile.dark.png", "design/shots/settings.mobile.rtl.dark.png",
    ]);
    s.differ("index.mobile.png", "index.mobile.rtl.png");
    for (const name of ["settings@filled.mobile.png", "settings@filled.mobile.rtl.png", "settings@filled.mobile.dark.png", "settings@filled.mobile.rtl.dark.png"]) {
      expect(existsSync(join(app, "design", "shots", name))).toBe(true);
    }
    s.differ("settings.mobile.png", "settings@filled.mobile.png");
    s.differ("settings.mobile.rtl.dark.png", "settings@filled.mobile.rtl.dark.png");
    // The app chose Arabic words from the browser's language and left dir alone: Motif turned each page and said so.
    expect(notesOf(r)).toEqual(expect.arrayContaining([forcedRtl("/"), forcedRtl("/settings")]));
  }, 600_000);

  test.skipIf(!ready)("--audit finds the faint caption, the unnamed 32 px icon button and Motion's loop that ignores reduced motion; /calm, which checks it, passes (skipped without Node in Angular 21's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", routes: "/audit,/calm", variant: "default", audit: true } });
    // Findings make the run exit 1.
    clean(r, 1);
    expect(r.exitCode).toBe(1);
    const findings = JSON.parse(readFileSync(join(app, "design", "shots", "audit.json"), "utf8")).findings as { location: { screen: string }; locations?: { screen: string }[]; category: string; summary: string; fix: string }[];
    // Each finding on every page it was seen.
    const on = (screen: string) => findings.filter((f) => [f.location, ...(f.locations ?? [])].some((l) => l.screen === screen));
    // /calm's CSS loop through animate.enter is stopped by the theme's reduced-motion rule, its Motion loop by matchMedia.
    expect(on("/calm")).toEqual([]);
    expect(on("/audit").map((f) => [f.category, f.summary]).sort()).toEqual([
      ["accessibility", "The button has no name a screen reader can say."],
      ["contrast", `Text "Last restocked three days ago" is hard to read in light and dark mode (1.55:1, needs 4.5:1).`],
      ["reduced-motion", "An element keeps moving when the viewer asks for reduced motion."],
      ["target-size", "A button is 32×32 px on a phone; 44×44 px is easier to tap."],
    ]);
    // Angular's own way to stop it.
    expect(on("/audit").find((f) => f.category === "reduced-motion")!.fix).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  }, 600_000);
});

describe("motif shot on ng22-min, Angular 22 through ng serve", () => {
  let app = "";
  const s = shots(() => app);

  beforeAll(async () => {
    if (ng22Ready) app = await install("ng22-min");
  }, 900_000);

  test.skipIf(!ng22Ready)("its three pages at 390 and 1440, light and dark, in each variant (skipped without Node in Angular 22's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "all", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(routesOf(r).map((x) => x.route)).toEqual(["/", "/calm", "/settings"]);
    expect(plain(r)).toHaveLength(24);
    expect((r.data.shots as string[]).filter((p) => p.includes("@check"))).toHaveLength(24);
    s.width("settings.desktop.png");
    s.differ("index.mobile.png", "index.mobile.dark.png");
    s.differ("index.mobile.png", "index+partner.mobile.png");
    s.differ("settings.desktop.dark.png", "settings+partner.desktop.dark.png");
    onlyTheApp(s, "index.mobile.png", LIGHT);
    onlyTheApp(s, "index+partner.desktop.dark.png", PARTNER_DARK);
  }, 600_000);

  test.skipIf(!ng22Ready)("--rtl in Arabic, turned right to left by Motif, and a state that fills the settings field (skipped without Node in Angular 22's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/,/settings", rtl: true, state: "design/states/check.js,design/states/filled.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r).filter((p) => p.includes(".rtl"))).toEqual([
      "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.rtl.dark.png", "design/shots/settings.mobile.rtl.png", "design/shots/settings.mobile.rtl.dark.png",
    ]);
    s.differ("index.mobile.png", "index.mobile.rtl.png");
    s.differ("settings.mobile.rtl.png", "settings@filled.mobile.rtl.png");
    expect(notesOf(r)).toEqual(expect.arrayContaining([forcedRtl("/"), forcedRtl("/settings")]));
  }, 600_000);

  test.skipIf(!ng22Ready)("--audit finds nothing: /calm's loops stop under reduced motion, and the button is 44 px tall (skipped without Node in Angular 22's range, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "default", audit: true } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.text).toContain(CALM_AUDIT);
  }, 600_000);
});
