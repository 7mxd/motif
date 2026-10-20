import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { findBrowser } from "../src/detect/browser";
import { FIXTURES, heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// motif shot on expo-min through Expo's web target (plan 2G, Task 7; decision 0009). Needs Node with npm (Expo runs on
// Node) and Chrome, Edge or Chromium; bun's skipIf takes no reason, so each name says it. The tests share one copy of
// expo-min, whose node_modules are installed once (offline from npm's cache when it can). Each run starts Expo and
// waits for its first web bundle, so these take a minute or more. The audit tests add routes to the shared copy (copied
// in after the tests that count expo-min's own two routes), so any test added before them must not count routes.
//
// expo-min passes its own variant ("partner") to MotifProvider, has an Arabic string table chosen by the locale, calls
// I18nManager.forceRTL only on native, and loads Onest from @expo-google-fonts and Noto Naskh Arabic from its own files.
const npm = Bun.which("npm");
const node = Bun.which("node");
const browser = findBrowser() !== null;
const gate = heavyStackTests("react-native", Boolean(npm && node && browser));
const ready = gate.run;
const reason = !node || !npm ? "Node and npm aren't installed" : !browser ? "no Chrome, Edge or Chromium was found" : gate.reason;
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
    for (const f of ["audit", "motion", "loop", "calm", "form"]) cpSync(join(import.meta.dir, "fixtures", "expo-audit-routes", `${f}.tsx`), join(app, "app", `${f}.tsx`));
  };
  // Every place a finding was seen: a loop on two screens with the same selector is one finding: its location and the other places.
  const findingsOf = () =>
    (JSON.parse(readFileSync(join(app, "design", "shots", "audit.json"), "utf8")).findings as { location: { screen: string }; locations?: { screen: string }[]; category: string; summary: string; fix: string }[]).flatMap((f) =>
      [...new Set([f.location, ...(f.locations ?? [])].map((l) => l.screen))].map((screen) => ({ screen, category: f.category, summary: f.summary, fix: f.fix })),
    );
  const on = (screen: string, category: string) => findingsOf().filter((f) => f.screen === screen && f.category === category);

  test.skipIf(!ready)("--audit finds a low-contrast caption, unnamed 32 px Pressables (with an icon, with and without a role), and loops that ignore reduced motion, and passes the one that checks it (skipped without Node, npm or a browser)", async () => {
    plant();
    const r = await runShot(app, { positionals: [], flags: { sizes: "390", routes: "/audit,/motion,/loop,/calm", variant: "default", audit: true } });
    if (!r.text.includes("✗ Audit:")) console.log(r.text);
    // Findings make the run exit 1, as for web apps.
    expect(r.exitCode).toBe(1);
    clean(r.data);
    expect(on("/audit", "contrast").map((f) => f.summary)).toEqual([`Text "Last restocked three days ago" is hard to read in light and dark mode (1.67:1, needs 4.5:1).`]);
    // The Pressable, TouchableOpacity and TouchableHighlight with an Ionicons glyph and no label are <div tabindex="0"> with no
    // role on the web; the one with role="button" is a <button> whose only text is the icon font's glyph (axe takes it for a
    // name, Motif doesn't): four controls with no name in all.
    expect(on("/audit", "accessibility").map((f) => f.summary).sort()).toEqual([
      "The button has no name a screen reader can say.",
      "The button has no name a screen reader can say.",
      "The button has no name a screen reader can say.",
      "The icon has no name a screen reader can say.",
    ]);
    expect(on("/audit", "accessibility")[0]!.fix).toBe("Give it an accessibilityLabel (or visible text).");
    // Sizes: those four, the labelled one, and the 58×32 "Skip" (named by its text, so it is not in the list above).
    const sizes = on("/audit", "target-size").map((f) => f.summary);
    expect(sizes.filter((s) => s === "A button is 32×32 px on a phone; 44×44 px is easier to tap.")).toHaveLength(4);
    expect(sizes).toContain(`The "Add item" button is 32×32 px on a phone; 44×44 px is easier to tap.`);
    expect(sizes.some((s) => /^The "Skip" button is \d+×32 px on a phone/.test(s))).toBe(true);
    expect(sizes).toHaveLength(6);
    expect(on("/audit", "target-size")[0]!.fix).toContain("hitSlop");
    // Reanimated with ReduceMotion.Never and core Animated.loop, neither checking reduced motion; /calm checks it, and its
    // ActivityIndicator (the platform's spinner, which the app can't stop) isn't counted.
    expect(on("/motion", "reduced-motion")).toHaveLength(1);
    expect(on("/loop", "reduced-motion")).toHaveLength(1);
    expect(on("/calm", "reduced-motion")).toEqual([]);
    expect(on("/motion", "reduced-motion")[0]!.fix).toContain("useReducedMotion()");
  }, 600_000);

  test.skipIf(!ready)("a state that fills two TextInputs (found by aria-label and by placeholder alone) draws form@filled with the text on the screen (skipped without Node, npm or a browser)", async () => {
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
const fill = async (input, text) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 200));
};
const name = document.querySelector('input[aria-label="Item name"]');
if (name) {
  await fill(name, "Oat milk");
  // This field has a placeholder and no aria-label.
  const quantity = document.querySelector('input[placeholder="Quantity"]');
  if (!quantity || quantity.hasAttribute("aria-label")) throw new Error("no field with only a placeholder");
  await fill(quantity, "2");
  if (!document.body.innerText.includes("Adding 2 Oat milk")) throw new Error("the fields didn't take the text");
}
`;
