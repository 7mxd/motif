import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { findBrowser } from "../src/detect/browser";
import { FIXTURES } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// motif shot on expo-min through Expo's web target (plan 2G, Task 7; decision 0009). Needs Node with npm (Expo runs on
// Node) and Chrome, Edge or Chromium; bun's skipIf takes no reason, so each name says it. The tests share one copy of
// expo-min, whose node_modules are installed once (offline from npm's cache when it can). Each run starts Expo and
// waits for its first web bundle, so these take a minute or more.
//
// expo-min passes its own variant ("partner") to MotifProvider, has an Arabic string table chosen by the locale, calls
// I18nManager.forceRTL only on native, and loads Onest from @expo-google-fonts and Noto Naskh Arabic from its own files.
const npm = Bun.which("npm");
const node = Bun.which("node");
const browser = findBrowser() !== null;
const ready = Boolean(npm && node && browser);
const reason = !node || !npm ? "Node and npm aren't installed" : !browser ? "no Chrome, Edge or Chromium was found" : "";
let app = "";

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

beforeAll(async () => {
  if (!ready) {
    console.log(`rn-shot-e2e: skipped, ${reason}.`);
    return;
  }
  // A space in the path, as in many Windows user folders.
  app = tempDir("motif expo shot ");
  cpSync(join(FIXTURES, "expo-min"), app, { recursive: true, filter: (src) => ![".expo", "node_modules", "dist", "web-build"].includes(basename(src)) });
  if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], app).code !== 0) {
    const again = run([npm!, "ci", "--no-audit", "--no-fund"], app);
    if (again.code !== 0) console.log(again.out);
    expect(again.code).toBe(0);
  }
  // The theme is made by today's generator from the fixture's guide, not taken from the committed copy.
  rmSync(join(app, "design", "motif-theme.tsx"));
  const made = await runTokens(app, { positionals: [] });
  expect(made.exitCode).toBe(0);
  expect(existsSync(join(app, "design", "motif-theme.tsx"))).toBe(true);
  // A state script that checks each screenshot's look from inside the page: which colours, which fonts (loaded), and
  // Arabic right to left. What it throws is the screen's error, which the tests look for.
  mkdirSync(join(app, "design", "states"), { recursive: true });
  writeFileSync(join(app, "design", "states", "check.js"), CHECK);
}, 900_000);

afterAll(cleanupTempDirs, 120_000);

const CHECK = `
// React draws what data-variant changed in its next frames.
await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))));
const html = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)").matches;
const variant = html.dataset.variant;
if (variant !== "default" && variant !== "partner") throw new Error("data-variant is " + variant);
const backgrounds = { default: ["rgb(249, 250, 251)", "rgb(3, 7, 18)"], partner: ["rgb(255, 237, 213)", "rgb(12, 10, 9)"] };
const title = [...document.querySelectorAll("div")].find((d) => d.childElementCount === 0 && /^(Pantry|Settings|المخزن|الإعدادات)$/.test(d.textContent.trim()));
if (!title) throw new Error("no title on the screen: " + document.body.innerText.slice(0, 80));
let box = title;
while (box && getComputedStyle(box).backgroundColor === "rgba(0, 0, 0, 0)") box = box.parentElement;
const background = box ? getComputedStyle(box).backgroundColor : "none";
if (background !== backgrounds[variant][dark ? 1 : 0]) throw new Error(variant + (dark ? " dark" : " light") + " has the background " + background);
const rtl = getComputedStyle(html).direction === "rtl";
const family = getComputedStyle(title).fontFamily.replace(/"/g, "");
const face = rtl ? "Noto Naskh Arabic_400" : "Onest_700Bold";
if (family !== face) throw new Error("the title is in " + family + ", not " + face);
if (!document.fonts.check("28px \\"" + face + "\\"")) throw new Error(face + " isn't loaded");
if (rtl !== /[\\u0600-\\u06FF]/.test(title.textContent)) throw new Error("the title is " + title.textContent + (rtl ? " right to left" : " left to right"));
`;

const shot = (flags: Record<string, string | boolean>) => runShot(app, { positionals: [], flags: { state: "design/states/check.js", ...flags } });
const png = (name: string) => readFileSync(join(app, "design", "shots", name));
const routesOf = (data: Record<string, unknown>) => data.routes as { route: string; status: number; pageErrors?: string[]; error?: string; loading?: string }[];
const notesOf = (data: Record<string, unknown>) => (data.notes as string[] | undefined) ?? [];

/** Every route drew without an error, the check script's included. */
function clean(data: Record<string, unknown>) {
  expect(routesOf(data).map((r) => ({ route: r.route, status: r.status, errors: r.pageErrors ?? [], error: r.error, loading: r.loading }))).toEqual(
    routesOf(data).map((r) => ({ route: r.route, status: 200, errors: [], error: undefined, loading: undefined })),
  );
}

describe("motif shot on expo-min, through Expo's web target", () => {
  test.skipIf(!ready)("/ and /settings at 390 in light and dark, in the guide's colours and the app's fonts (skipped without Node, npm or a browser)", async () => {
    const r = await shot({ sizes: "390" });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    clean(r.data);
    expect(r.data.shots).toEqual([
      "design/shots/index.mobile.png", "design/shots/index@check.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index@check.mobile.dark.png",
      "design/shots/settings.mobile.png", "design/shots/settings@check.mobile.png", "design/shots/settings.mobile.dark.png", "design/shots/settings@check.mobile.dark.png",
    ]);
    for (const name of ["index.mobile.png", "index.mobile.dark.png", "settings.mobile.png", "settings.mobile.dark.png"]) {
      expect(pngSize(new Uint8Array(png(name)))).toEqual({ width: 780, height: 1688 });
    }
    // useColorScheme() follows the emulated prefers-color-scheme on react-native-web.
    expect(png("index.mobile.png").equals(png("index.mobile.dark.png"))).toBe(false);
    expect(r.text).toContain("React Native screenshots are of Expo's web target in Chrome");
    expect(notesOf(r.data).join("\n")).not.toContain("Dark mode looks exactly like light");
  }, 600_000);

  test.skipIf(!ready)("--variant all draws +partner files that differ, and the default's are in the default although the app passes partner (skipped without Node, npm or a browser)", async () => {
    const r = await shot({ sizes: "390", routes: "/", variant: "all" });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    // The check script throws when a default screenshot has the partner's background.
    clean(r.data);
    expect((r.data.shots as string[]).filter((s) => !s.includes("@"))).toEqual([
      "design/shots/index.mobile.png", "design/shots/index+partner.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+partner.mobile.dark.png",
    ]);
    expect(png("index.mobile.png").equals(png("index+partner.mobile.png"))).toBe(false);
    expect(png("index.mobile.dark.png").equals(png("index+partner.mobile.dark.png"))).toBe(false);
    expect(notesOf(r.data).join("\n")).not.toContain("looks exactly like the default");
  }, 600_000);

  test.skipIf(!ready)("--rtl draws .rtl files in Arabic, right to left, in the Arabic companion font, though the app turns right to left only on a phone (skipped without Node, npm or a browser)", async () => {
    const r = await shot({ sizes: "390", rtl: true });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    clean(r.data);
    expect((r.data.shots as string[]).filter((s) => s.includes(".rtl") && !s.includes("@"))).toEqual([
      "design/shots/index.mobile.rtl.png", "design/shots/index.mobile.rtl.dark.png", "design/shots/settings.mobile.rtl.png", "design/shots/settings.mobile.rtl.dark.png",
    ]);
    expect(png("index.mobile.png").equals(png("index.mobile.rtl.png"))).toBe(false);
    // react-native-web has no I18nManager.isRTL: Motif sets dir="rtl" on <html>, and says so.
    expect(notesOf(r.data)).toContain(`/ doesn't switch to right to left by itself for ar; Motif set dir="rtl" to show it.`);
  }, 600_000);

  // The routes below are planted with problems (cli/test/fixtures/expo-audit-routes) and added to the copy here, after
  // the tests above have counted expo-min's own two routes.
  const plant = () => {
    for (const f of ["audit", "motion", "calm", "form"]) cpSync(join(import.meta.dir, "fixtures", "expo-audit-routes", `${f}.tsx`), join(app, "app", `${f}.tsx`));
  };
  const findingsOf = () =>
    (JSON.parse(readFileSync(join(app, "design", "shots", "audit.json"), "utf8")).findings as { location: { screen: string }; category: string; summary: string }[]).map((f) => ({
      screen: f.location.screen,
      category: f.category,
      summary: f.summary,
    }));

  test.skipIf(!ready)("--audit finds a low-contrast caption, an unnamed 32 px button and a Reanimated loop that ignores reduced motion, and passes the loop that respects it (skipped without Node, npm or a browser)", async () => {
    plant();
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/audit,/motion,/calm", variant: "default", audit: true } });
    if (r.exitCode !== 0 && !r.text.includes("✗ Audit:")) console.log(r.text);
    clean(r.data);
    expect(findingsOf()).toEqual([
      { screen: "/audit", category: "contrast", summary: `Text "Last restocked three days ago" is hard to read in light and dark mode (1.67:1, needs 4.5:1).` },
      { screen: "/audit", category: "accessibility", summary: "The button has no name a screen reader can say." },
      { screen: "/motion", category: "reduced-motion", summary: "An element keeps moving when the viewer asks for reduced motion." },
      { screen: "/audit", category: "target-size", summary: "A button is 32×32 px on a phone; 44×44 px is easier to tap." },
      { screen: "/audit", category: "target-size", summary: `The "Add item" button is 32×32 px on a phone; 44×44 px is easier to tap.` },
    ]);
    // /calm has the same loop and checks useReducedMotion (and Reanimated's own default stops it): nothing on /calm.
    expect(findingsOf().some((f) => f.screen === "/calm")).toBe(false);
    // The Pressable with no role is a plain div in react-native-web: neither the name rules nor the target query see it
    // (decision 0009, limits), so only the two buttons count and one of them is the unnamed one.
    expect(findingsOf().filter((f) => f.category === "target-size")).toHaveLength(2);
  }, 600_000);

  test.skipIf(!ready)("a state that fills a TextInput (found by aria-label) draws form@filled with the text on the screen (skipped without Node, npm or a browser)", async () => {
    plant();
    writeFileSync(join(app, "design", "states", "filled.js"), FILL);
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/form", state: "design/states/filled.js" } });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    // The state script throws unless the field took the text and the screen drew "Adding Oat milk".
    clean(r.data);
    expect(r.data.shots).toEqual(["design/shots/form.mobile.png", "design/shots/form@filled.mobile.png", "design/shots/form.mobile.dark.png", "design/shots/form@filled.mobile.dark.png"]);
    expect(png("form.mobile.png").equals(png("form@filled.mobile.png"))).toBe(false);
  }, 600_000);
});

const FILL = `
const input = document.querySelector('input[aria-label="Item name"], input[placeholder="Item name"]');
if (input) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(input, "Oat milk");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 200));
  if (!document.body.innerText.includes("Adding Oat milk")) throw new Error("the field didn't take the text");
}
`;
