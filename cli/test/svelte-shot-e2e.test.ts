import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { findBrowser } from "../src/detect/browser";
import { VIEWPORTS } from "../src/shot/capture";
import { FIXTURES } from "./helpers";
import { pixel } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

// motif shot on Svelte apps in Chrome (plan 2J, Task 8): svelte-min (SvelteKit 2.70, Tailwind 4, each page rendered on
// the server), svelte-vite-min (Svelte 5 with Vite, no SvelteKit, plain CSS) and kit3-min (SvelteKit 3, plain CSS, which
// needs Node 22.17 or later). Needs Node with npm (each dev server runs on Node) and Chrome, Edge or Chromium; bun's
// skipIf takes no reason, so each name says it. Each fixture is installed once into a temp copy with npm ci, and its theme
// is made there by today's motif tokens from the fixture's guide (two variants, Onest with Noto Naskh Arabic as its Arabic
// companion, both bundled by the app). Every run starts the app's own dev script, as a developer's would.
//
// The two SvelteKit apps read Accept-Language as they render on the server and set lang and dir on <html> themselves
// (hooks.server.ts); the Vite app picks its words by the browser's language and leaves dir alone, so Motif turns it right
// to left. svelte-min's /audit holds planted problems and /calm the same Spring loop, stopped through svelte/motion's
// prefersReducedMotion; the other two apps' loops check it too.
const npm = Bun.which("npm");
const node = Bun.which("node");
const browser = findBrowser() !== null;
const ready = Boolean(npm && node && browser);
const reason = !node || !npm ? "Node and npm aren't installed" : "no Chrome, Edge or Chromium was found";
if (!ready) console.log(`[svelte-shot-e2e] skipped: ${reason}.`);

/** Node's version as [major, minor], or null without Node. */
function nodeVersion(): [number, number] | null {
  if (!node) return null;
  const m = /v(\d+)\.(\d+)/.exec(Bun.spawnSync([node, "--version"], { stdout: "pipe" }).stdout.toString());
  return m ? [Number(m[1]), Number(m[2])] : null;
}
const version = nodeVersion();
// SvelteKit 3 needs Node 22.17 or later (its engines field; sv's starter sets engine-strict, so npm ci refuses older).
const kit3Node = version !== null && (version[0] > 22 || (version[0] === 22 && version[1] >= 17));
const kit3Ready = ready && kit3Node;
if (ready && !kit3Node) console.log(`[svelte-shot-e2e] kit3-min skipped: SvelteKit 3 needs Node 22.17 or later, and this is Node ${version?.join(".") ?? "of an unknown version"}.`);

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

const MOBILE = VIEWPORTS.find((v) => v.name === "mobile" && v.width === 390)!;
const DESKTOP = VIEWPORTS.find((v) => v.name === "desktop")!;
const LIGHT = [249, 250, 251];
const DARK = [3, 7, 18];
const PARTNER = [255, 237, 213];
const PARTNER_DARK = [12, 10, 9];

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

/** A temp copy of the fixture (a space in its path, as in many Windows user folders), installed, with the theme made and the state scripts. */
async function install(fixture: string): Promise<string> {
  const app = tempDir(`motif ${fixture} shot `);
  cpSync(join(FIXTURES, fixture), app, { recursive: true, filter: (src) => !["node_modules", ".svelte-kit", "build", "dist"].includes(basename(src)) });
  // The packages are fetched once; npm's cache makes later runs offline.
  if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], app).code !== 0) {
    const again = run([npm!, "ci", "--no-audit", "--no-fund"], app);
    if (again.code !== 0) console.log(again.out);
    expect(again.code).toBe(0);
  }
  const made = await runTokens(app, { positionals: [] });
  expect(made.exitCode).toBe(0);
  // Each app already imports the theme, so tokens has no step to suggest.
  expect(made.text).not.toContain("Next:");
  mkdirSync(join(app, "design", "states"), { recursive: true });
  writeFileSync(join(app, "design", "states", "check.js"), CHECK);
  writeFileSync(join(app, "design", "states", "filled.js"), FILLED);
  return app;
}

// Checks each screenshot's look from inside the page; what it throws is the page's error, which the tests look for: the
// variant's background in light or dark, the title in Onest (Noto Naskh Arabic when it reads right to left, Arabic letters
// and all) with that face loaded, and <html>'s lang and dir filled in (a SvelteKit app's server does it from app.html).
const CHECK = `
await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))));
const html = document.documentElement;
if (/%/.test(html.lang + html.dir)) throw new Error("<html> wasn't filled in: lang=" + html.lang + " dir=" + html.dir);
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

// Types a name into the page's field, as a person would, and checks the page answered it.
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
const FORCED_RTL = `/ doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.`;
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

/**
 * Nothing a dev server adds (Vite's error overlay, the Svelte inspector's toggle, which sits in a bottom corner) is on the
 * page: the app's background shows in the top left and along the bottom, where the fixtures draw nothing.
 */
function onlyTheApp(s: ReturnType<typeof shots>, name: string, background: number[]) {
  const { width, height } = s.viewportOf(name);
  for (const [x, y] of [[4, 4], [8, height - 8], [width / 2, height - 8], [width - 8, height - 8]]) {
    expect([name, x, y, s.at(name, x!, y!)]).toEqual([name, x, y, background]);
  }
}

describe("motif shot on svelte-min, rendered on the server by SvelteKit 2", () => {
  let app = "";
  const s = shots(() => app);

  beforeAll(async () => {
    if (ready) app = await install("svelte-min");
  }, 900_000);

  test.skipIf(!ready)("its four pages at 390 and 1440 in light and dark, in the guide's colours and the app's own fonts (skipped without Node, npm or a browser)", async () => {
    // The first run is cold: Vite optimizes SvelteKit's dependencies the first time a page is asked for.
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    // The routes come from src/routes.
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

  test.skipIf(!ready)("--variant all draws +partner files that differ from the default's (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/", variant: "all", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r)).toEqual(["design/shots/index.mobile.png", "design/shots/index+partner.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+partner.mobile.dark.png"]);
    s.differ("index.mobile.png", "index+partner.mobile.png");
    s.differ("index.mobile.dark.png", "index+partner.mobile.dark.png");
    expect(s.at("index+partner.mobile.png", 4, 4)).toEqual(PARTNER);
    expect(s.at("index+partner.mobile.dark.png", 4, 4)).toEqual(PARTNER_DARK);
    expect(notesOf(r).join("\n")).not.toContain("looks the same as the default");
  }, 600_000);

  test.skipIf(!ready)("--rtl in Arabic with the companion font, right to left by the app's server, and a state that fills the settings field (skipped without Node, npm or a browser)", async () => {
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
    // hooks.server.ts set dir="rtl" from Accept-Language as it rendered: Motif had nothing to turn.
    expect(notesOf(r).join("\n")).not.toContain("doesn't switch to right to left");
  }, 600_000);

  test.skipIf(!ready)("--audit finds the faint caption, the unnamed 32 px icon button and the Spring that ignores reduced motion, and passes the one that checks it (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", routes: "/audit,/calm", variant: "default", audit: true } });
    // Findings make the run exit 1.
    clean(r, 1);
    expect(r.exitCode).toBe(1);
    const findings = JSON.parse(readFileSync(join(app, "design", "shots", "audit.json"), "utf8")).findings as { location: { screen: string }; locations?: { screen: string }[]; category: string; summary: string; fix: string }[];
    // Each finding on every page it was seen.
    const on = (screen: string) => findings.filter((f) => [f.location, ...(f.locations ?? [])].some((l) => l.screen === screen));
    expect(on("/calm")).toEqual([]);
    expect(on("/audit").map((f) => [f.category, f.summary]).sort()).toEqual([
      ["accessibility", "The button has no name a screen reader can say."],
      ["contrast", `Text "Last restocked three days ago" is hard to read in light and dark mode (1.55:1, needs 4.5:1).`],
      ["reduced-motion", "An element keeps moving when the viewer asks for reduced motion."],
      ["target-size", "A button is 32×32 px on a phone; 44×44 px is easier to tap."],
    ]);
    // Svelte's own way to stop it.
    expect(on("/audit").find((f) => f.category === "reduced-motion")!.fix).toContain("prefersReducedMotion.current from svelte/motion");
  }, 600_000);
});

describe("motif shot on svelte-vite-min, through Vite without SvelteKit", () => {
  let app = "";
  const s = shots(() => app);

  beforeAll(async () => {
    if (ready) app = await install("svelte-vite-min");
  }, 900_000);

  test.skipIf(!ready)("/ at 390 and 1440, light and dark, in each variant, in the guide's colours and the app's own fonts (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "all", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    // A Vite app without a router has one page.
    expect(routesOf(r).map((x) => x.route)).toEqual(["/"]);
    expect(plain(r)).toEqual([
      "design/shots/index.mobile.png", "design/shots/index+partner.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+partner.mobile.dark.png",
      "design/shots/index.desktop.png", "design/shots/index+partner.desktop.png", "design/shots/index.desktop.dark.png", "design/shots/index+partner.desktop.dark.png",
    ]);
    expect((r.data.shots as string[]).filter((p) => p.includes("@check"))).toHaveLength(8);
    s.width("index.mobile.png");
    s.width("index.desktop.png");
    s.differ("index.mobile.png", "index.mobile.dark.png");
    s.differ("index.desktop.png", "index+partner.desktop.png");
    s.differ("index.mobile.dark.png", "index+partner.mobile.dark.png");
    onlyTheApp(s, "index.mobile.png", LIGHT);
    onlyTheApp(s, "index.desktop.dark.png", DARK);
    onlyTheApp(s, "index+partner.mobile.png", PARTNER);
    onlyTheApp(s, "index+partner.desktop.dark.png", PARTNER_DARK);
  }, 600_000);

  test.skipIf(!ready)("--rtl draws .rtl files in Arabic, in the companion font; Motif turns the page right to left and says so; a state fills the field (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", rtl: true, state: "design/states/check.js,design/states/filled.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r)).toEqual(["design/shots/index.mobile.png", "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.dark.png", "design/shots/index.mobile.rtl.dark.png"]);
    s.differ("index.mobile.png", "index.mobile.rtl.png");
    s.differ("index.mobile.dark.png", "index.mobile.rtl.dark.png");
    s.differ("index.mobile.png", "index@filled.mobile.png");
    s.differ("index.mobile.rtl.png", "index@filled.mobile.rtl.png");
    expect(notesOf(r)).toContain(FORCED_RTL);
  }, 600_000);

  test.skipIf(!ready)("--audit finds nothing: the Spring checks prefersReducedMotion and the field has its label (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "default", audit: true } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.text).toContain(CALM_AUDIT);
  }, 600_000);
});

describe("motif shot on kit3-min, rendered on the server by SvelteKit 3", () => {
  let app = "";
  const s = shots(() => app);

  beforeAll(async () => {
    if (kit3Ready) app = await install("kit3-min");
  }, 900_000);

  test.skipIf(!kit3Ready)("/ and /settings at 390 and 1440, light and dark, in each variant (skipped without Node 22.17+, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "all", state: "design/states/check.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(routesOf(r).map((x) => x.route)).toEqual(["/", "/settings"]);
    expect(plain(r)).toHaveLength(16);
    expect((r.data.shots as string[]).filter((p) => p.includes("@check"))).toHaveLength(16);
    s.width("settings.desktop.png");
    s.differ("index.mobile.png", "index.mobile.dark.png");
    s.differ("index.mobile.png", "index+partner.mobile.png");
    s.differ("settings.desktop.dark.png", "settings+partner.desktop.dark.png");
    onlyTheApp(s, "index.mobile.png", LIGHT);
    onlyTheApp(s, "index+partner.desktop.dark.png", PARTNER_DARK);
  }, 600_000);

  test.skipIf(!kit3Ready)("--rtl in Arabic, right to left by the app's server, and a state that fills the settings field (skipped without Node 22.17+, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", rtl: true, state: "design/states/check.js,design/states/filled.js" } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(plain(r).filter((p) => p.includes(".rtl"))).toEqual([
      "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.rtl.dark.png", "design/shots/settings.mobile.rtl.png", "design/shots/settings.mobile.rtl.dark.png",
    ]);
    s.differ("index.mobile.png", "index.mobile.rtl.png");
    s.differ("settings.mobile.rtl.png", "settings@filled.mobile.rtl.png");
    expect(notesOf(r).join("\n")).not.toContain("doesn't switch to right to left");
  }, 600_000);

  test.skipIf(!kit3Ready)("--audit finds nothing: the Spring on / checks prefersReducedMotion (skipped without Node 22.17+, npm or a browser)", async () => {
    const r = await runShot(app, { positionals: [], flags: { sizes: "390,1440", variant: "default", audit: true } });
    clean(r);
    expect(r.exitCode).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.text).toContain(CALM_AUDIT);
  }, 600_000);
});
