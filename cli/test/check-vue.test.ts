import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const pkg = (deps: Record<string, string> = {}) =>
  JSON.stringify({ name: "shop", scripts: { dev: "vite" }, dependencies: { vue: "^3.5.0", "vue-router": "^4.5.0", "motion-v": "^2.0.0", ...deps } });
const TW4 = { tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" };

const HOME = [
  "<template>",
  `  <main class="p-[13px]" style="color:#333" :style="{ padding: '13px' }">`,
  "    <!-- motif-ok: partner brand -->",
  `    <p style="color:#ff00aa">Call 555-0134, ticket #123</p>`,
  `    <img src="a.png" :width="300" />`,
  `    <Transition :duration="300"><p v-if="count > 13">hi</p></Transition>`,
  "  </main>",
  "</template>",
  "",
  '<script setup lang="ts">',
  'const note = "rgba is a function";',
  "const count = ref(0);",
  "</script>",
  "",
  "<style scoped>",
  ".row { gap: 13px; color: var(--motif-color-text-primary); }",
  "</style>",
  "",
].join("\n");

/** A create-vue-shaped app at the project's root, with its theme code written by motif tokens. */
async function vueApp(files: Record<string, string>, deps: Record<string, string> = {}): Promise<string> {
  const root = makeProject({
    "package.json": pkg(deps),
    "index.html": '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
    "src/main.ts": 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");\n',
    "src/App.vue": "<template><RouterView /></template>\n",
    "design/tokens.json": TOKENS,
    ...files,
  });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}
const check = (root: string, positionals: string[] = []) => runCheck(root, { positionals });
const where = (r: any) => ((r.data as any).violations as any[]).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);
const at = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle}`);
  return `${text.slice(0, i).split("\n").length}:${i - text.lastIndexOf("\n", i - 1)}`;
};

describe("motif check on a Vue app", () => {
  test("finds what is a value at its line and column in the .vue file, and nothing that only looks like one", async () => {
    const root = await vueApp({ "src/views/Home.vue": HOME }, TW4);
    const r = await check(root);
    expect(r.exitCode).toBe(1);
    const found = where(r);
    const p = (rule: string, needle: string, from?: number) => `${rule} src/views/Home.vue:${at(HOME, needle, from)}`;
    expect(found).toContain(p("tailwind-arbitrary", "p-[13px]"));
    expect(found).toContain(p("raw-color", "#333"));
    expect(found).toContain(p("off-scale", "padding: '13px'")); // the :style object
    expect(found).toContain(p("off-scale", "13px", HOME.indexOf(".row")));
    expect(found).toContain(p("raw-motion", "300", HOME.indexOf(":duration")));
    // The motif-ok comment allows the colour on the next line; nothing on the lines that only look like values.
    expect(found.filter((f) => f.startsWith("raw-color") && f.endsWith(`:${at(HOME, "#ff00aa")}`))).toEqual([]);
    for (const needle of ["555-0134", "count > 13", ":width", "rgba is a function", "var(--motif-color"]) {
      const line = Number(at(HOME, needle).split(":")[0]);
      expect(found.filter((f) => f.split(":")[1] === String(line) && !/#ff00aa|motif-ok/.test(f)).filter((f) => !f.startsWith("raw-motion") || line !== 6)).toEqual(line === 16 ? [expect.stringContaining("off-scale")] : []);
    }
    expect((r.data as any).exceptions).toHaveLength(1);
    expect((r.data as any).exceptions[0]).toMatchObject({ rule: "raw-color", file: "src/views/Home.vue", reason: "partner brand" });
  });

  test("a hit reached by two rules is reported once", async () => {
    const root = await vueApp({ "src/views/A.vue": `<template><div :style="{ color: '#336699' }" /></template>\n` });
    const r = await check(root);
    expect(where(r)).toEqual([`raw-color src/views/A.vue:1:${"<template><div :style=\"{ color: '".length + 1}`]);
    expect((r.data as any).violations[0].fix).toContain("in the style binding");
  });

  test("the fixes are in Vue's words", async () => {
    const root = await vueApp({ "src/views/Home.vue": HOME }, TW4);
    const r = await check(root);
    const fix = (rule: string) => ((r.data as any).violations as any[]).find((h) => h.rule === rule && h.kind === "duration")?.fix;
    expect(fix("raw-motion")).toBe("Use the duration in milliseconds from motion.ts (duration.base * 1000), or leave :duration out and time the transition in CSS with var(--motif-duration-base).");
  });

  test("motif-ok works in <!-- -->, // and /* */ comments of a .vue file", async () => {
    const file = [
      "<template>",
      `  <!-- motif-ok: brand red --><p style="color:#ff0000">a</p>`,
      `  <p :style="{ color: '#00ff00' }">b</p> <!-- motif-ok: brand green -->`,
      "</template>",
      "<script setup lang=\"ts\">",
      "// motif-ok: brand blue",
      "const blue = '#0000ff';",
      "const pink = '#ff00ff'; /* motif-ok: brand pink */",
      "</script>",
      "<style>",
      "/* motif-ok: brand grey */",
      ".a { color: #888888 }",
      "</style>",
      "",
    ].join("\n");
    const root = await vueApp({ "src/views/Ok.vue": file });
    const r = await check(root);
    expect(where(r)).toEqual([]);
    expect(((r.data as any).exceptions as any[]).map((e) => e.reason).sort()).toEqual(["brand blue", "brand green", "brand grey", "brand pink", "brand red"]);
  });

  test("the generated files are never scanned; a changed one is a warning", async () => {
    const root = await vueApp({ "src/views/Home.vue": "<template><p /></template>\n" });
    expect((await check(root)).exitCode).toBe(0);
    const css = join(root, "src/styles/motif.css");
    writeFileSync(css, readFileSync(css, "utf8").replace("--motif-space-4", "--motif-space-4-x") + "\n.x { color: #123456; padding: 13px }\n");
    const r = await check(root);
    expect(r.exitCode).toBe(0);
    expect((r.data as any).violations).toEqual([]);
    expect(((r.data as any).warnings as any[]).map((w) => `${w.rule} ${w.file}`)).toEqual(["generated-edited src/styles/motif.css"]);
  });

  test("a Tailwind 4 app flags class=\"p-[13px]\"; a Tailwind 3 app gets Tailwind 3's fixes", async () => {
    const root = await vueApp({ "src/views/T.vue": `<template><div class="p-[13px] bg-[#336699]" /></template>\n` }, TW4);
    expect(where(await check(root))).toContain("tailwind-arbitrary src/views/T.vue:1:" + (`<template><div class="`.length + 1));
    const v3 = await vueApp({ "src/views/T.vue": `<template><div class="bg-action-primary" /></template>\n` }, { tailwindcss: "^3.4.0" });
    const r3 = await check(v3);
    expect(((r3.data as any).violations as any[]).map((h) => h.rule)).toEqual(["tailwind-palette"]);
  });

  test("scanning one path reads only that file", async () => {
    const root = await vueApp({ "src/views/A.vue": `<template><p style="color:#111111" /></template>\n`, "src/views/B.vue": `<template><p style="color:#222222" /></template>\n` });
    const r = await check(root, ["src/views/B.vue"]);
    expect(where(r)).toEqual(["raw-color src/views/B.vue:1:" + (`<template><p style="color:`.length + 1)]);
  });
});

describe("motif check: reduced motion on a Vue app", () => {
  const MOTION = `<template><motion.div :animate="{ x: 1 }" /></template>\n<script setup lang="ts">\nimport { motion } from "motion-v";\n</script>\n`;

  test("an app that animates with Motion and never respects reduced motion is told once", async () => {
    const root = await vueApp({ "src/views/M.vue": MOTION });
    const found = ((await check(root)).data as any).violations as any[];
    expect(found.filter((h) => h.rule === "reduced-motion")).toHaveLength(1);
    expect(found.find((h) => h.rule === "reduced-motion")).toMatchObject({ file: "src/views/M.vue", text: "motion" });
  });

  test("useReducedMotion or reduced-motion=\"user\" anywhere in the app settles Motion", async () => {
    for (const extra of <Record<string, string>[]>[
      { "src/composables/motion.ts": 'import { useReducedMotion } from "motion-v";\nexport const quiet = () => useReducedMotion();\n' },
      { "src/App.vue": '<template><MotionConfig reduced-motion="user"><RouterView /></MotionConfig></template>\n' },
    ]) {
      const root = await vueApp({ "src/views/M.vue": MOTION, ...extra });
      expect((((await check(root)).data as any).violations as any[]).filter((h) => h.rule === "reduced-motion")).toEqual([]);
    }
  });

  test("a prefers-reduced-motion query does not make Motion follow the setting", async () => {
    const root = await vueApp({ "src/views/M.vue": MOTION, "src/assets/app.css": "@media (prefers-reduced-motion: reduce) { * { animation: none } }\n" });
    expect((((await check(root)).data as any).violations as any[]).filter((h) => h.rule === "reduced-motion")).toHaveLength(1);
  });

  test("a <Transition> counts as animation; linking the generated motif.css settles it", async () => {
    const T = `<template><Transition name="fade"><p v-if="on" /></Transition></template>\n`;
    const root = await vueApp({ "src/views/T.vue": T });
    // motif.css holds the reduced-motion rule, and is part of the app already.
    expect((((await check(root)).data as any).violations as any[]).filter((h) => h.rule === "reduced-motion")).toEqual([]);
    const css = join(root, "src/styles/motif.css");
    const without = readFileSync(css, "utf8").replace(/@media \(prefers-reduced-motion[\s\S]*$/, "");
    writeFileSync(css, without);
    // A hand-edited generated file doesn't count as the app's own, but it still holds what it holds.
    expect((((await check(root)).data as any).violations as any[]).filter((h) => h.rule === "reduced-motion")).toHaveLength(1);
  });
});

describe("motif check on a Nuxt app", () => {
  test("a Nuxt 3 app at the project root: Motif's design/ folder is not read, a design/ folder inside the app is", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "n", scripts: { dev: "nuxt dev" }, dependencies: { nuxt: "^3.15.0", vue: "^3.5.0" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({})\n",
      "app.vue": "<template><NuxtPage /></template>\n",
      "pages/index.vue": `<template><p style="color:#336699">hi</p></template>\n`,
      "components/design/Card.vue": `<template><p style="color:#445566">card</p></template>\n`,
      "design/Notes.vue": `<template><p style="color:#778899">notes</p></template>\n`,
      "design/tokens.json": TOKENS,
    });
    expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
    const r = await check(root);
    expect(where(r).sort()).toEqual([
      "raw-color components/design/Card.vue:1:" + (`<template><p style="color:`.length + 1),
      "raw-color pages/index.vue:1:" + (`<template><p style="color:`.length + 1),
    ]);
  });

  test("a Nuxt 4 app reads app/ and its pages", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "n", dependencies: { nuxt: "^4.0.0", vue: "^3.5.0" } }),
      "app/app.vue": "<template><NuxtWelcome /></template>\n",
      "app/pages/index.vue": `<template><p :style="{ marginTop: 13 }">hi</p></template>\n`,
      "design/tokens.json": TOKENS,
    });
    expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
    expect(where(await check(root))).toEqual(["off-scale app/pages/index.vue:1:" + (`<template><p :style="{ `.length + 1)]);
  });
});

describe("motif check on a Vue app without a design guide", () => {
  test("points at motif extract, which reads Vue", async () => {
    const root = makeProject({ "package.json": pkg(), "src/App.vue": "<template><p /></template>\n" });
    const r = await check(root);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Draft one from your code with motif extract");
  });
});
