import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { toJavaScript, usesTypeScript } from "../src/generate/javascript";
import { buildThemeSet } from "../src/generate/theme";
import { generateReactWeb, motionTs } from "../src/stacks/react-web/generate";
import { generateSvelte, svelteMotionTs } from "../src/stacks/svelte/generate";
import { generateVue } from "../src/stacks/vue/generate";
import type { AppInfo } from "../src/detect/stacks";
import { docFrom, partnerTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const set = () => buildThemeSet(docFrom(partnerTokens()));
const pkg = (dev: Record<string, string>) => JSON.stringify({ name: "app", devDependencies: dev });
const SVELTE = { svelte: "^5.57.0", vite: "^8.0.0", "@sveltejs/vite-plugin-svelte": "^7.0.0" };

describe("whether an app is written in TypeScript (v1.0 field trial)", () => {
  test("a tsconfig.json or typescript declared says it is; a jsconfig.json or only .js scripts say it isn't", () => {
    expect(usesTypeScript(makeProject({ "package.json": pkg(SVELTE), "tsconfig.json": "{}", "jsconfig.json": "{}" }))).toBe(true);
    expect(usesTypeScript(makeProject({ "package.json": pkg({ ...SVELTE, typescript: "^5.9.0" }), "jsconfig.json": "{}" }))).toBe(true);
    expect(usesTypeScript(makeProject({ "package.json": pkg(SVELTE), "jsconfig.json": "{}", "src/main.js": "" }))).toBe(false);
    expect(usesTypeScript(makeProject({ "package.json": pkg(SVELTE), "src/main.js": "", "src/lib/api.js": "", "vite.config.js": "" }))).toBe(false);
    expect(usesTypeScript(makeProject({ "package.json": pkg(SVELTE), "src/main.js": "", "src/lib/api.ts": "" }))).toBe(true);
  });

  test("with nothing to go by, it is; Motif's own motion.ts and type declarations don't make it so", () => {
    expect(usesTypeScript(makeProject({ "package.json": pkg(SVELTE) }))).toBe(true);
    expect(usesTypeScript(makeProject({ "package.json": pkg(SVELTE), "src/main.js": "", "src/lib/design/motion.ts": "", "src/env.d.ts": "" }))).toBe(false);
  });

  test("typescript declared at a workspace's root counts for its apps", () => {
    const root = makeProject({ "package.json": pkg({ typescript: "^5.9.0" }), "apps/web/package.json": pkg(SVELTE), "apps/web/src/main.js": "" });
    expect(usesTypeScript(join(root, "apps/web"), root)).toBe(true);
  });
});

describe("motion.js for an app without TypeScript (v1.0 field trial)", () => {
  /** A generated module, loaded as JavaScript. */
  const load = (content: string): Promise<any> => {
    const file = join(tempDir("motif-motion-js-"), "motion.mjs");
    writeFileSync(file, content);
    return import(file);
  };

  test("has the same exports as motion.ts, with its types as JSDoc", async () => {
    const theme = set().base;
    for (const ts of [motionTs(theme), svelteMotionTs(theme)]) {
      const js = toJavaScript(ts);
      expect(js).not.toMatch(/satisfies|^export type|: number\b(?![^*]*\*\/)/m);
      expect(js).toContain("@typedef");
      const a = await load(js);
      expect(Object.keys(a).sort()).toEqual([...ts.matchAll(/^export const (\w+)/gm)].map((m) => m[1]).sort());
    }
    const svelte = await load(toJavaScript(svelteMotionTs(theme)));
    expect(svelte.easing.standard(0)).toBe(0);
    expect(svelte.easing.standard(1)).toBe(1);
    expect(svelte.duration.base).toBe(theme.durations.find((d) => d.name === "base")!.ms);
  });

  test("React web, Svelte and Vue write it beside the CSS where motion.ts would go", () => {
    const theme = set();
    expect(generateReactWeb(theme.base, { srcDir: "src", tailwind: "none", javascript: true }).map((f) => f.path)).toEqual(["src/styles/motif.css", "src/design/motion.js"]);
    const svelte = makeProject({ "package.json": pkg(SVELTE), "jsconfig.json": "{}", "src/main.js": "" });
    const app: AppInfo = { path: ".", stack: "svelte", source: "detected" };
    expect(generateSvelte(theme, { root: svelte, app, srcDir: "src", tailwind: "none" }).files.map((f) => f.path)).toEqual(["src/lib/styles/motif.css", "src/lib/design/motion.js"]);
    const vue = makeProject({ "package.json": JSON.stringify({ dependencies: { vue: "^3.5.0", "motion-v": "^1.0.0" }, devDependencies: { vite: "^7.0.0" } }), "src/main.js": "" });
    const r = generateVue(theme, { root: vue, app: { ...app, stack: "vue" }, srcDir: "src", tailwind: "none" });
    expect(r.files.map((f) => f.path)).toEqual(["src/styles/motif.css", "src/design/motion.js"]);
  });

  test("motif tokens says to delete the motion.ts an earlier run wrote", async () => {
    const root = makeProject({
      "package.json": pkg(SVELTE),
      "jsconfig.json": "{}",
      "src/main.js": "import './lib/styles/motif.css';\n",
      "src/App.svelte": "<h1>Hi</h1>",
      "DESIGN.md": "# Design\n",
      "design/tokens.json": JSON.stringify(validTokens()),
    });
    await runTokens(root, { positionals: [] });
    writeFileSync(join(root, "src/lib/design/motion.ts"), readFileSync(join(root, "src/lib/design/motion.js"), "utf8"));
    const r = await runTokens(root, { positionals: [] });
    expect(readFileSync(join(root, "src/lib/design/motion.js"), "utf8")).not.toContain("satisfies");
    expect((r.data.notes as string[]).join("\n")).toContain("delete src/lib/design/motion.ts");
  });
});
