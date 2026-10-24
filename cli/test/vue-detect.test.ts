import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { webStack, webStacks } from "../src/stacks/web";
import { isNuxt, nuxtMajor, nuxtSrcDir, usesFileRoutes, vueMajor, vueSrcDir } from "../src/stacks/vue/project";
import { vueDoctor } from "../src/stacks/vue/doctor";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) => JSON.stringify({ name: "app", dependencies: deps, devDependencies: dev });
const paths = (files: { path: string }[]) => files.map((f) => f.path);
const vue = () => webStack("vue")!;

// npm create vue@latest, TypeScript and Router chosen.
const viteStarter = () => makeProject({
  "package.json": pkg({ vue: "^3.5.13", "vue-router": "^4.5.0" }, { vite: "^6.0.0", "@vitejs/plugin-vue": "^5.2.1", typescript: "~5.7.2" }),
  "node_modules/vue/package.json": JSON.stringify({ version: "3.5.13" }),
  "index.html": "<div id=app></div>",
  "vite.config.ts": "export default {}",
  "src/main.ts": "import './assets/main.css'\n",
  "src/App.vue": "<template><RouterView /></template>\n",
  "src/assets/main.css": "@import './base.css';\n",
  "src/assets/base.css": ":root { --vt-c-white: #ffffff; }\n",
  "src/router/index.ts": "export default {}\n",
  "src/views/HomeView.vue": "<template><main /></template>\n",
  "src/views/AboutView.vue": "<template><main /></template>\n",
  "src/components/HelloWorld.vue": "<template><h1 /></template>\n",
  "src/env.d.ts": "x",
  "public/favicon.ico": "x",
});

// npm create nuxt@latest (Nuxt 4): app/app.vue, no pages/.
const nuxt4Starter = () => makeProject({
  "package.json": pkg({ nuxt: "^4.6.0", vue: "^3.5.13", "vue-router": "^4.5.0" }),
  "node_modules/nuxt/package.json": JSON.stringify({ version: "4.6.2" }),
  "nuxt.config.ts": "export default defineNuxtConfig({ compatibilityDate: '2025-07-15' })\n",
  "app/app.vue": "<template><NuxtWelcome /></template>\n",
  ".nuxt/types/x.d.ts": "x",
  ".nuxt/components.d.ts": "x",
  ".output/server/index.mjs": "x",
});

describe("the web-stack registry", () => {
  test("Vue and Svelte are registered and the others are not", () => {
    expect(webStack("vue")?.id).toBe("vue");
    expect(webStacks().map((s) => s.id)).toEqual(["vue", "svelte"]);
    expect(webStack("react-web")).toBeNull();
    expect(webStack("plain-web")).toBeNull();
    expect(webStack(null)).toBeNull();
  });
});

describe("Vue and Nuxt projects", () => {
  test("the Vite starter: versions, source folder, file routes", () => {
    const dir = viteStarter();
    expect(isNuxt(dir)).toBe(false);
    expect(vueMajor(dir)).toBe(3);
    expect(nuxtMajor(dir)).toBeNull();
    expect(vueSrcDir(dir)).toBe("src");
    expect(vue().srcDir(dir)).toBe("src");
    expect(usesFileRoutes(dir)).toBe(false);
  });

  test("the Nuxt 4 starter: app/ is the source folder, routes come from files", () => {
    const dir = nuxt4Starter();
    expect(isNuxt(dir)).toBe(true);
    expect(nuxtMajor(dir)).toBe(4);
    expect(vueMajor(dir)).toBe(3);
    expect(nuxtSrcDir(dir)).toBe("app");
    expect(vueSrcDir(dir)).toBe("app");
    expect(usesFileRoutes(dir)).toBe(true);
  });

  test("Nuxt without vue listed implies Vue 3; the range is read when nothing is installed", () => {
    const dir = makeProject({ "package.json": pkg({ nuxt: "^3.14.0" }) });
    expect(nuxtMajor(dir)).toBe(3);
    expect(vueMajor(dir)).toBe(3);
    expect(nuxtSrcDir(dir)).toBe(".");
    expect(vueSrcDir(dir)).toBe(".");
  });

  test("Nuxt 4 without an app/ folder keeps the project root", () => {
    const dir = makeProject({ "package.json": pkg({ nuxt: "^4.0.0" }), "pages/index.vue": "x" });
    expect(nuxtSrcDir(dir)).toBe(".");
  });

  test("a srcDir string in nuxt.config is read, with or without a trailing slash", () => {
    const a = makeProject({ "package.json": pkg({ nuxt: "^3.14.0" }), "nuxt.config.ts": "export default defineNuxtConfig({\n  srcDir: 'src/',\n})\n", "src/pages/index.vue": "x" });
    expect(nuxtSrcDir(a)).toBe("src");
    const b = makeProject({ "package.json": pkg({ nuxt: "^3.14.0" }), "nuxt.config.js": 'export default { srcDir: "./client" }\n' });
    expect(nuxtSrcDir(b)).toBe("client");
    const c = makeProject({ "package.json": pkg({ nuxt: "^4.0.0" }), "nuxt.config.ts": "export default defineNuxtConfig({ srcDir: path.join('a', 'b') })\n", "app/app.vue": "x" });
    expect(nuxtSrcDir(c)).toBe("app");
  });

  test("a Vite config importing vue-router/vite or unplugin-vue-router/vite means file routes", () => {
    const a = makeProject({ "package.json": pkg({ vue: "^3.5.0" }), "vite.config.ts": "import VueRouter from 'unplugin-vue-router/vite'\n" });
    expect(usesFileRoutes(a)).toBe(true);
    const b = makeProject({ "package.json": pkg({ vue: "^3.5.0" }), "vite.config.mts": "import { VueRouterAutoImports } from 'vue-router/vite'\n" });
    expect(usesFileRoutes(b)).toBe(true);
  });

  test("Vue 2 and Nuxt 2 are told apart", () => {
    const v2 = makeProject({ "package.json": pkg({ vue: "^2.7.16" }) });
    expect(vueMajor(v2)).toBe(2);
    const n2 = makeProject({ "package.json": pkg({ nuxt: "^2.18.1" }) });
    expect(nuxtMajor(n2)).toBe(2);
    expect(vueMajor(n2)).toBe(2);
  });

  test("no version to read gives null", () => {
    const dir = makeProject({ "package.json": pkg({ vue: "workspace:*" }) });
    expect(vueMajor(dir)).toBeNull();
    expect(vueMajor(makeProject({ "package.json": "{}" }))).toBeNull();
  });

  test("both starters are detected as Vue apps", () => {
    expect(detectApps(viteStarter()).apps.map((a) => [a.path, a.stack])).toEqual([[".", "vue"]]);
    expect(detectApps(nuxt4Starter()).apps.map((a) => [a.path, a.stack])).toEqual([[".", "vue"]]);
  });
});

describe("the Vue stack's sources", () => {
  const app = (path: string) => ({ path, stack: "vue" as const, source: "detected" as const });

  test("the Vite starter: .vue, scripts and CSS, not the type files", () => {
    const root = viteStarter();
    expect(paths(vue().sourceFiles(root, app("."), {}))).toEqual([
      "index.html", "src/App.vue", "src/assets/base.css", "src/assets/main.css", "src/components/HelloWorld.vue",
      "src/main.ts", "src/router/index.ts", "src/views/AboutView.vue", "src/views/HomeView.vue",
    ]);
  });

  test("the Nuxt 4 starter: app/app.vue, not .nuxt or .output", () => {
    expect(paths(vue().sourceFiles(nuxt4Starter(), app("."), {}))).toEqual(["app/app.vue"]);
  });

  test("a .vue file is markup", () => {
    const files = vue().sourceFiles(viteStarter(), app("."), {});
    expect(files.find((f) => f.path === "src/App.vue")!.lang).toBe("markup");
  });

  test("a Nuxt 3 app with srcDir: 'src/' is read from there", () => {
    const root = makeProject({
      "package.json": pkg({ nuxt: "^3.14.0" }),
      "nuxt.config.ts": "export default defineNuxtConfig({ srcDir: 'src/' })\n",
      "src/app.vue": "x", "src/pages/index.vue": "x", "src/assets/css/main.css": "x", "src/composables/useA.ts": "x",
    });
    expect(vue().srcDir(root)).toBe("src");
    expect(paths(vue().sourceFiles(root, app("."), {}))).toEqual(["src/app.vue", "src/assets/css/main.css", "src/composables/useA.ts", "src/pages/index.vue"]);
  });

  test("a Nuxt 3 app at the project root: its pages, components and assets are read, Motif's design/ is not", () => {
    const root = makeProject({
      "package.json": pkg({ nuxt: "^3.14.0" }),
      "design/tokens.json": "{}", "design/preview.html": "x", "design/Notes.vue": "x",
      "app.vue": "x", "pages/index.vue": "x", "components/Card.vue": "x", "assets/css/main.css": "x", "composables/useA.ts": "x",
      "server/api/hello.ts": "x",
    });
    expect(paths(vue().sourceFiles(root, app("."), {}))).toEqual([
      "app.vue", "assets/css/main.css", "components/Card.vue", "composables/useA.ts", "pages/index.vue", "server/api/hello.ts",
    ]);
  });

  test("a design/ folder inside an app's source is read: only the project root's is Motif's", () => {
    const root = makeProject({
      "package.json": "{}", "design/tokens.json": "{}", "design/x.vue": "x",
      "apps/web/package.json": pkg({ nuxt: "^3.14.0" }), "apps/web/app.vue": "x", "apps/web/design/Hero.vue": "x",
    });
    expect(paths(vue().sourceFiles(root, app("apps/web"), {}))).toEqual(["apps/web/app.vue", "apps/web/design/Hero.vue"]);
  });

  test("the ignores: build output, types generated by Vue tooling, caches, Motif's runs", () => {
    const root = makeProject({
      "package.json": pkg({ vue: "^3.5.0" }),
      "src/App.vue": "x",
      ".nuxt/a.vue": "x", ".output/b.mjs": "x", ".data/c.ts": "x", "dist/d.js": "x", ".vite/e.js": "x", ".motif/f.vue": "x",
      "src/auto-imports.d.ts": "x", "src/components.d.ts": "x", "src/typed-router.d.ts": "x", "src/env.d.ts": "x",
      "src/a.test.ts": "x", "src/b.spec.ts": "x",
    });
    expect(paths(vue().sourceFiles(root, app("."), {}))).toEqual(["src/App.vue"]);
  });

  test("a monorepo: apps/web (Nuxt) beside apps/admin (Vite Vue), each read on its own", () => {
    const root = makeProject({
      "package.json": "{}",
      "apps/web/package.json": pkg({ nuxt: "^3.14.0" }), "apps/web/app.vue": "x", "apps/web/pages/index.vue": "x",
      "apps/admin/package.json": pkg({ vue: "^3.5.0" }, { vite: "^6.0.0" }), "apps/admin/src/App.vue": "x", "apps/admin/src/main.ts": "x",
    });
    const apps = detectApps(root).apps;
    expect(apps.map((a) => [a.path, a.stack])).toEqual([["apps/admin", "vue"], ["apps/web", "vue"]]);
    expect(paths(vue().sourceFiles(root, apps[1]!, {}))).toEqual(["apps/web/app.vue", "apps/web/pages/index.vue"]);
    expect(paths(vue().sourceFiles(root, apps[0]!, {}))).toEqual(["apps/admin/src/App.vue", "apps/admin/src/main.ts"]);
    expect(vue().srcDir(join(root, "apps/web"))).toBe(".");
    expect(vue().srcDir(join(root, "apps/admin"))).toBe("src");
  });

  test("a Vue 2 app is listed as for Vue 3", () => {
    const root = makeProject({ "package.json": pkg({ vue: "^2.7.16" }), "src/App.vue": "x", "src/main.js": "x" });
    expect(paths(vue().sourceFiles(root, app("."), {}))).toEqual(["src/App.vue", "src/main.js"]);
  });

  test("--paths narrows the list", () => {
    const root = viteStarter();
    expect(paths(vue().sourceFiles(root, app("."), { paths: ["src/views"] }))).toEqual(["src/views/AboutView.vue", "src/views/HomeView.vue"]);
  });
});

describe("vueDoctor", () => {
  const ctx = (root: string, paths: string[]) => ({ root, apps: paths.map((path) => ({ path, stack: "vue" as const, source: "detected" as const })) });
  const deps = { platform: "linux" as const, arch: "x64", home: "/h", findBrowser: () => null, which: () => null };

  test("Vue 3 with Vite", () => {
    const root = viteStarter();
    expect(vueDoctor(deps, ctx(root, ["."]))).toEqual([{ id: "vue:.", status: "ok", label: "Vue / Nuxt (this folder)", detail: "Vue 3.5 with Vite." }]);
  });

  test("Nuxt 4.6, from the installed package", () => {
    const root = nuxt4Starter();
    expect(vueDoctor(deps, ctx(root, ["."]))[0]).toMatchObject({ status: "ok", detail: "Nuxt 4.6." });
  });

  test("the range is read when nothing is installed", () => {
    const root = makeProject({ "package.json": pkg({ nuxt: "^3.14.2" }) });
    expect(vueDoctor(deps, ctx(root, ["."]))[0]).toMatchObject({ status: "ok", detail: "Nuxt 3.14." });
  });

  test("Vue 2 and Nuxt 2 are optional, with what still works", () => {
    const root = makeProject({ "a/package.json": pkg({ vue: "^2.7.16" }), "b/package.json": pkg({ nuxt: "^2.18.1" }) });
    const items = vueDoctor(deps, ctx(root, ["a", "b"]));
    expect(items.map((i) => [i.id, i.status])).toEqual([["vue:a", "optional"], ["vue:b", "optional"]]);
    expect(items[0]!.detail).toBe(
      "Vue 2 isn't supported (it reached its end of life in 2023): Motif supports Vue 3 and Nuxt 3 or later. Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.",
    );
  });

  test("one item per Vue app", () => {
    const root = makeProject({ "a/package.json": pkg({ vue: "^3.5.0" }, { vite: "^6" }), "b/package.json": pkg({ nuxt: "^3.14.0" }) });
    expect(vueDoctor(deps, ctx(root, ["a", "b"])).map((i) => i.id)).toEqual(["vue:a", "vue:b"]);
  });
});
