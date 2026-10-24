import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { CSS_HEADER, JSON_COMMENT } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { motifCss, motionTs, tailwindCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = JSON.stringify(validTokens());
const ctx = { positionals: [] };
const pkg = (deps: Record<string, string | undefined>) => JSON.stringify({ name: "shop", dependencies: deps });
const VITE = { vue: "^3.5.0", "vue-router": "^4.5.0", "motion-v": "^2.0.0", "@tailwindcss/vite": "^4.1.0", tailwindcss: "^4.1.0" };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => r.data.notes as string[];

/** Every file under dir, hashed. */
function hashAll(dir: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(dir, rel))) {
    const p = rel ? `${rel}/${e}` : e;
    if (statSync(join(dir, p)).isDirectory()) Object.assign(out, hashAll(dir, p));
    else out[p] = createHash("sha256").update(readFileSync(join(dir, p))).digest("hex");
  }
  return out;
}

/** What `npm create vue@latest` (TypeScript, Router) writes, with Tailwind. */
const viteApp = (extra: Record<string, string> = {}) =>
  makeProject({
    "package.json": pkg(VITE),
    "index.html": '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
    "src/main.ts": "import { createApp } from 'vue'\nimport App from './App.vue'\nimport './assets/main.css'\ncreateApp(App).mount('#app')\n",
    "src/App.vue": "<template><RouterView /></template>\n",
    "src/assets/base.css": ":root { --color: #fff }\n@media (prefers-color-scheme: dark) { :root { --color: #000 } }\n",
    "design/tokens.json": TOKENS,
    ...extra,
  });

describe("motif tokens for a Vite Vue app", () => {
  test("writes React web's files under src, changes no file of the app, and says how to wire them", async () => {
    const root = viteApp();
    const before = hashAll(root);
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({
      "src/styles/motif.css": "created",
      "src/styles/motif.tailwind.css": "created",
      "src/design/motion.ts": "created",
      "design/motif.json": "created",
    });
    const set = buildThemeSet(docFrom(validTokens()));
    expect(readFileSync(join(root, "src/styles/motif.css"), "utf8")).toBe(motifCss(set.base, set.variants));
    expect(readFileSync(join(root, "src/styles/motif.tailwind.css"), "utf8")).toBe(tailwindCss(set.base));
    expect(readFileSync(join(root, "src/design/motion.ts"), "utf8")).toBe(motionTs(set.base));
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "vue", srcDir: "src" }]);
    expect(notes(r).join("\n")).toContain('Next: in your main CSS file, add an @import for src/styles/motif.tailwind.css right after @import "tailwindcss"');
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    const after = hashAll(root);
    for (const [file, hash] of Object.entries(before)) expect(after[file]).toBe(hash);
  });

  test("without Tailwind: the main.ts note, and no Tailwind file", async () => {
    const root = viteApp({ "package.json": pkg({ vue: "^3.5.0", "motion-v": "^2.0.0" }) });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).not.toContain("src/styles/motif.tailwind.css");
    expect(notes(r)).toContain("Next: import src/styles/motif.css once in src/main.ts (import './styles/motif.css'), or @import it from your main CSS file.");
  });

  test("no note once a .vue file imports the theme; a second run is up to date", async () => {
    const root = viteApp({ "src/App.vue": '<template><RouterView /></template>\n<style>@import "./styles/motif.tailwind.css";</style>\n' });
    const first = await runTokens(root, ctx);
    expect(notes(first).some((n) => n.startsWith("Next:"))).toBe(false);
    const second = await runTokens(root, ctx);
    expect(second.text).toContain("Theme code is up to date.");
    expect(Object.values(statuses(second)).every((s) => s === "unchanged")).toBe(true);
  });

  test("a motif.css that isn't Motif's is protected, and its Tailwind file and the note are skipped", async () => {
    const root = viteApp({ "src/styles/motif.css": ".mine { color: red }\n" });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(statuses(r)["src/styles/motif.css"]).toBe("protected");
    expect(statuses(r)["src/styles/motif.tailwind.css"]).toBe("skipped");
    expect(notes(r).some((n) => n.startsWith("Next:"))).toBe(false);
    expect(readFileSync(join(root, "src/styles/motif.css"), "utf8")).toBe(".mine { color: red }\n");
  });

  test("a motion.ts that isn't Motif's is protected, and the theme's note is still given", async () => {
    const root = viteApp({ "src/design/motion.ts": "export const mine = 1;\n" });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["src/design/motion.ts"]).toBe("protected");
    expect(statuses(r)["src/styles/motif.tailwind.css"]).toBe("created");
    expect(notes(r).join("\n")).toContain('Next: in your main CSS file, add an @import for src/styles/motif.tailwind.css right after @import "tailwindcss"');
  });

  test("Tailwind 3 gets the CSS only, with the note", async () => {
    const root = viteApp({ "package.json": pkg({ ...VITE, "@tailwindcss/vite": undefined, tailwindcss: "^3.4.0" }) });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).not.toContain("src/styles/motif.tailwind.css");
    expect(notes(r).join("\n")).toContain("Tailwind v3 found");
  });
});

describe("motif tokens for a Nuxt app", () => {
  test("Nuxt 4: writes beside the starter and names nuxt.config.ts", async () => {
    const root = makeProject({
      "package.json": pkg({ nuxt: "^4.1.0", vue: "^3.5.0", "motion-v": "^2.0.0" }),
      "nuxt.config.ts": "export default defineNuxtConfig({ compatibilityDate: '2025-07-15' })\n",
      "app/app.vue": "<template><NuxtWelcome /></template>\n",
      "design/tokens.json": TOKENS,
    });
    const before = hashAll(root);
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({ "app/assets/css/motif.css": "created", "app/design/motion.ts": "created", "design/motif.json": "created" });
    expect(notes(r)).toContain("Next: add '~/assets/css/motif.css' to the css list in nuxt.config.ts (css: ['~/assets/css/motif.css']), before your own styles.");
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps[0].srcDir).toBe("app");
    const after = hashAll(root);
    for (const [file, hash] of Object.entries(before)) expect(after[file]).toBe(hash);
  });

  test("Nuxt 3 at the root: motion goes to motion/, never design/", async () => {
    const root = makeProject({
      "package.json": pkg({ nuxt: "^3.15.0", "motion-v": "^2.0.0" }),
      "app.vue": "<template><NuxtWelcome /></template>\n",
      "design/tokens.json": TOKENS,
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(Object.keys(statuses(r))).toEqual(["assets/css/motif.css", "motion/motif-motion.ts", "design/motif.json"]);
    expect(existsSync(join(root, "design/motion.ts"))).toBe(false);
  });

  test("no note once nuxt.config.ts lists the file", async () => {
    const root = makeProject({
      "package.json": pkg({ nuxt: "^4.1.0", "motion-v": "^2.0.0" }),
      "nuxt.config.ts": "export default defineNuxtConfig({ css: ['~/assets/css/motif.css'] })\n",
      "app/app.vue": "",
      "design/tokens.json": TOKENS,
    });
    expect(notes(await runTokens(root, ctx)).some((n) => n.startsWith("Next:"))).toBe(false);
  });
});

describe("motif tokens for a Vue 2 app and a themeDir", () => {
  test("Vue 2: the CSS and the reason motion.ts was left out", async () => {
    const root = makeProject({ "package.json": pkg({ vue: "^2.7.16" }), "src/main.js": "", "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/styles/motif.css", "design/motif.json"]);
    expect(notes(r).join("\n")).toContain("Vue 3, so Motif didn't write it");
  });

  test("themeDir from motif.json wins", async () => {
    const root = viteApp({ "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "vue", themeDir: "src/theme" }], ignore: [] }) });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/theme/motif.css", "src/theme/motif.tailwind.css", "src/theme/motion.ts", "design/motif.json"]);
  });
});

describe("a Vue app that used Motif 0.5.0's design/generated theme", () => {
  /** What 0.5.0 left: its fallback theme, imported from src/main.ts as the skill said. */
  const OLD = {
    "design/generated/motif.css": `${CSS_HEADER}\n:root { --motif-color-action-primary: #000; }\n`,
    "design/generated/tokens.flat.json": JSON.stringify({ $comment: JSON_COMMENT }),
    "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "vue" }], ignore: [] }),
  };
  const OLD_IMPORT = "import { createApp } from 'vue'\nimport App from './App.vue'\nimport '../design/generated/motif.css'\ncreateApp(App).mount('#app')\n";

  test("says the old files are no longer updated, names the new one, and still says how to wire it", async () => {
    const root = viteApp({ "package.json": pkg({ vue: "^3.5.0", "motion-v": "^2.0.0" }), "src/main.ts": OLD_IMPORT, ...OLD });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(notes(r)).toContain(
      "design/generated/motif.css and design/generated/tokens.flat.json are from an earlier version of Motif and are no longer updated: import src/styles/motif.css instead, then delete design/generated/.",
    );
    expect(notes(r)).toContain("Next: import src/styles/motif.css once in src/main.ts (import './styles/motif.css'), or @import it from your main CSS file.");
    expect(readFileSync(join(root, "design/generated/motif.css"), "utf8")).toBe(OLD["design/generated/motif.css"]);
  });

  test("a Nuxt app: the note names its own theme file", async () => {
    const root = makeProject({
      "package.json": pkg({ nuxt: "^4.1.0", vue: "^3.5.0", "motion-v": "^2.0.0" }),
      "nuxt.config.ts": "export default defineNuxtConfig({ css: ['~~/design/generated/motif.css'] })\n",
      "app/app.vue": "<template><NuxtWelcome /></template>\n",
      "design/tokens.json": TOKENS,
      ...OLD,
    });
    const r = await runTokens(root, ctx);
    expect(notes(r).join("\n")).toContain("are no longer updated: import app/assets/css/motif.css instead, then delete design/generated/.");
    expect(notes(r)).toContain("Next: add '~/assets/css/motif.css' to the css list in nuxt.config.ts (css: ['~/assets/css/motif.css']), before your own styles.");
  });

  test("a file of the developer's own in design/generated is kept out of the delete", async () => {
    const root = viteApp({ "src/main.ts": OLD_IMPORT, ...OLD, "design/generated/notes.md": "mine\n" });
    const r = await runTokens(root, ctx);
    expect(notes(r).join("\n")).toContain("then delete design/generated/motif.css and design/generated/tokens.flat.json.");
  });

  test("a design/generated/motif.css that isn't Motif's is left unmentioned", async () => {
    const root = viteApp({ "design/generated/motif.css": ".mine { color: red }\n" });
    const r = await runTokens(root, ctx);
    expect(notes(r).join("\n")).not.toContain("earlier version of Motif");
  });

  test("React web and plain web say nothing about design/generated", async () => {
    const react = makeProject({
      "package.json": JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } }),
      "src/main.tsx": "",
      "design/tokens.json": TOKENS,
      "design/generated/motif.css": OLD["design/generated/motif.css"],
    });
    expect(notes(await runTokens(react, ctx)).join("\n")).not.toContain("earlier version of Motif");
    const plain = makeProject({ "index.html": "<!doctype html>", "design/tokens.json": TOKENS, "design/generated/motif.css": OLD["design/generated/motif.css"] });
    expect(notes(await runTokens(plain, ctx)).join("\n")).not.toContain("earlier version of Motif");
  });
});
