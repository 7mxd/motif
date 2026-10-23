import { afterAll, describe, expect, test } from "bun:test";
import { buildThemeSet } from "../src/generate/theme";
import { CSS_HEADER, TS_HEADER } from "../src/generate/header";
import { motifCss, motionTs, tailwindCss } from "../src/stacks/react-web/generate";
import { generateVue, vueWiring } from "../src/stacks/vue/generate";
import type { AppInfo } from "../src/detect/stacks";
import { docFrom, partnerTokens, withCompanion } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "shop", dependencies: deps });
const VITE = { vue: "^3.5.0", "vue-router": "^4.5.0", "motion-v": "^2.0.0", "@tailwindcss/vite": "^4.1.0", tailwindcss: "^4.1.0" };
const gen = (root: string, over: Record<string, any> = {}, tailwind: "v4" | "v3" | "none" = "v4", tokens: any = partnerTokens()) => {
  const app: AppInfo = { path: ".", stack: "vue", source: "detected", ...over };
  const srcDir = app.srcDir ?? "src";
  return generateVue(buildThemeSet(docFrom(tokens)), { root, app, srcDir, tailwind });
};
const paths = (r: { files: { path: string }[] }) => r.files.map((f) => f.path);

describe("generateVue", () => {
  test("a Vite app gets React web's files and contents, under src", () => {
    const root = makeProject({ "package.json": pkg(VITE) });
    const tokens = withCompanion(partnerTokens());
    const set = buildThemeSet(docFrom(tokens));
    const r = gen(root, {}, "v4", tokens);
    expect(paths(r)).toEqual(["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts"]);
    expect(r.files[0]!.content).toBe(motifCss(set.base, set.variants));
    expect(r.files[0]!.content).toContain("partner");
    expect(r.files[0]!.content.startsWith(CSS_HEADER)).toBe(true);
    expect(r.files[1]!.content).toBe(tailwindCss(set.base));
    expect(r.files[2]!.content).toBe(motionTs(set.base));
    expect(r.files[2]!.content.startsWith(TS_HEADER)).toBe(true);
    expect(r.notes).toEqual([]);
  });

  test("without Tailwind 4 there is no Tailwind file; Tailwind 3 gets React web's note", () => {
    const root = makeProject({ "package.json": pkg({ ...VITE, tailwindcss: "^3.4.0" }) });
    expect(paths(gen(root, {}, "none"))).toEqual(["src/styles/motif.css", "src/design/motion.ts"]);
    const r = gen(root, {}, "v3");
    expect(paths(r)).not.toContain("src/styles/motif.tailwind.css");
    expect(r.notes).toEqual(["Your app: Tailwind v3 found, so Motif wrote CSS variables only. Use them as bg-[var(--motif-color-action-primary)], or upgrade to Tailwind v4 for Motif's Tailwind theme."]);
  });

  test("a Nuxt 4 app: CSS in app/assets/css, motion in app/design", () => {
    const root = makeProject({ "package.json": pkg({ nuxt: "^4.0.0", "motion-v": "^2.0.0" }), "app/app.vue": "<template><div/></template>" });
    expect(paths(gen(root, { srcDir: "app" }))).toEqual(["app/assets/css/motif.css", "app/assets/css/motif.tailwind.css", "app/design/motion.ts"]);
  });

  test("a Nuxt 3 app with srcDir keeps its source folder", () => {
    const root = makeProject({ "package.json": pkg({ nuxt: "^3.15.0", "motion-v": "^2.0.0" }), "nuxt.config.ts": "export default defineNuxtConfig({ srcDir: 'client/' })\n", "client/app.vue": "" });
    expect(paths(gen(root, { srcDir: "client" }, "none"))).toEqual(["client/assets/css/motif.css", "client/design/motion.ts"]);
  });

  test("a Nuxt 3 app at the project root never writes into design/", () => {
    const root = makeProject({ "package.json": pkg({ nuxt: "^3.15.0", "motion-v": "^2.0.0" }), "app.vue": "" });
    const r = gen(root, { srcDir: "." });
    expect(paths(r)).toEqual(["assets/css/motif.css", "assets/css/motif.tailwind.css", "motion/motif-motion.ts"]);
    expect(paths(r).some((p) => p.startsWith("design/"))).toBe(false);
  });

  test("a Nuxt 3 app in a subfolder keeps design/motion.ts: that design/ is not the project's", () => {
    const root = makeProject({ "web/package.json": pkg({ nuxt: "^3.15.0", "motion-v": "^2.0.0" }), "web/app.vue": "" });
    expect(paths(gen(root, { path: "web", srcDir: "." }))).toEqual(["web/assets/css/motif.css", "web/assets/css/motif.tailwind.css", "web/design/motion.ts"]);
  });

  test("themeDir wins for every file", () => {
    const root = makeProject({ "package.json": pkg(VITE) });
    expect(paths(gen(root, { themeDir: "src/theme" }))).toEqual(["src/theme/motif.css", "src/theme/motif.tailwind.css", "src/theme/motion.ts"]);
    const nuxt = makeProject({ "package.json": pkg({ nuxt: "^4.0.0", "motion-v": "^2.0.0" }), "app/app.vue": "" });
    expect(paths(gen(nuxt, { srcDir: "app", themeDir: "app/theme" }))).toEqual(["app/theme/motif.css", "app/theme/motif.tailwind.css", "app/theme/motion.ts"]);
  });

  test("a Vue 2 app gets the CSS files only, and the reason", () => {
    const root = makeProject({ "package.json": pkg({ vue: "^2.7.16", "@vue/cli-service": "^5.0.0" }) });
    const r = gen(root, {}, "none");
    expect(paths(r)).toEqual(["src/styles/motif.css"]);
    expect(r.notes).toEqual(["motion.ts is for Motion for Vue, which needs Vue 3, so Motif didn't write it. Animate with the CSS variables in motif.css (--motif-duration-*, --motif-easing-*)."]);
  });

  test("without motion-v the note says to install it", () => {
    const root = makeProject({ "package.json": pkg({ vue: "^3.5.0" }) });
    expect(gen(root, {}, "none").notes).toEqual(["src/design/motion.ts is for Motion for Vue: npm install motion-v. Vue's <Transition> can use the CSS variables in motif.css instead."]);
    const nuxt = makeProject({ "package.json": pkg({ nuxt: "^3.15.0" }), "app.vue": "" });
    expect(gen(nuxt, { srcDir: "." }, "none").notes[0]).toContain("motion/motif-motion.ts is for Motion for Vue: npm install motion-v.");
  });

  test("an app inside a folder prefixes every path", () => {
    const root = makeProject({ "web/package.json": pkg(VITE) });
    expect(paths(gen(root, { path: "web" }))[0]).toBe("web/src/styles/motif.css");
  });
});

describe("the one-step wiring note", () => {
  const wire = (root: string, files: string[], app: any = {}) =>
    vueWiring(root, { path: ".", stack: "vue", source: "detected", ...app }, files.map((path) => ({ path, content: "" })), () => "src");

  test("Vite names main.ts, or the Tailwind import", () => {
    const root = makeProject({ "package.json": pkg(VITE), "src/main.ts": "import { createApp } from 'vue'\n" });
    expect(wire(root, ["src/styles/motif.css"])).toBe("Next: import src/styles/motif.css once in src/main.ts (import './styles/motif.css'), or @import it from your main CSS file.");
    expect(wire(root, ["src/styles/motif.css", "src/styles/motif.tailwind.css"])).toBe(
      'Next: in your main CSS file, add an @import for src/styles/motif.tailwind.css right after @import "tailwindcss" (write the path relative to that CSS file). Importing it before Tailwind undoes the theme.',
    );
  });

  test("Nuxt names the css list", () => {
    const root = makeProject({ "package.json": pkg({ nuxt: "^4.0.0" }), "app/app.vue": "" });
    const app = { srcDir: "app" };
    expect(wire(root, ["app/assets/css/motif.css"], app)).toBe("Next: add '~/assets/css/motif.css' to the css list in nuxt.config.ts (css: ['~/assets/css/motif.css']), before your own styles.");
    expect(wire(root, ["app/assets/css/motif.css", "app/assets/css/motif.tailwind.css"], app)).toBe(
      "Next: @import ~/assets/css/motif.tailwind.css right after @import \"tailwindcss\" in your main CSS file, and list that file in nuxt.config.ts's css.",
    );
  });

  test("an import in a .vue file or nuxt.config.ts counts", () => {
    const vite = makeProject({ "package.json": pkg(VITE), "src/App.vue": '<style>@import "./styles/motif.css";</style>' });
    expect(wire(vite, ["src/styles/motif.css"])).toBeNull();
    const nuxt = makeProject({ "package.json": pkg({ nuxt: "^4.0.0" }), "app/app.vue": "", "nuxt.config.ts": "export default defineNuxtConfig({ css: ['~/assets/css/motif.css'] })\n" });
    expect(wire(nuxt, ["app/assets/css/motif.css"], { srcDir: "app" })).toBeNull();
  });
});
