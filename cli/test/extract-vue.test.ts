import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { validateTokens } from "../src/contract/tokens";
import { collectVue } from "../src/stacks/vue/extract";
import type { SourceFile } from "../src/check/files";
import { docFrom, FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const ctx = { positionals: [], flags: {} };
const VUE_PKG = JSON.stringify({ name: "shop", scripts: { dev: "vite" }, dependencies: { vue: "^3.5.0", vuetify: "^3.8.0" }, devDependencies: { vite: "^7.0.0" } });
const NUXT_PKG = JSON.stringify({ name: "site", dependencies: { nuxt: "^4.0.0", vue: "^3.5.0" } });
const draftOf = (root: string): any => JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
const reportOf = (root: string): any => JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
const script = (text: string, path = "src/plugins/vuetify.ts"): SourceFile => ({ path, abs: path, text, lang: "script" });
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;
/** A role's light and dark colours in the draft, as hex. */
const pairOf = (tokens: any, role: string) => [hexOf(tokens, tokens.color[role].$value), hexOf(tokens, tokens.color[role].$extensions["dev.motif"].modes.dark)];

const VUETIFY = `import { createVuetify } from 'vuetify'

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#1867C0',
          secondary: '#48A9A6',
          background: '#FFFFFF',
          surface: '#F5F5F5',
          'on-surface': '#1F1F1F',
          error: '#B00020',
          accent: '#82B1FF',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#2196F3',
          background: '#121212',
          surface: '#1E1E1E',
          'on-surface': '#EEEEEE',
          error: '#CF6679',
          accent: '#FF4081',
        },
      },
      harvest: {
        dark: false,
        colors: { primary: '#B45309', background: '#FFFBEB', surface: '#FEF3C7' },
      },
      harvestDark: {
        dark: true,
        colors: { primary: '#F59E0B', background: '#1C1917', surface: '#292524' },
      },
    },
  },
})
`;

describe("motif extract on the create-vue starter", () => {
  test("base.css gives the colour variables with their light and dark values", async () => {
    const root = tempDir("motif-vue-");
    cpSync(join(FIXTURES, "vue-starter"), root, { recursive: true });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("from 2 files");
    const report = reportOf(root);
    const byName = Object.fromEntries(report.variables.map((v: any) => [v.name, v]));
    expect(byName["--color-background"]).toMatchObject({ light: "#ffffff", dark: "#181818" });
    expect(byName["--color-background-soft"]).toMatchObject({ light: "#f8f8f8", dark: "#222222" });
    expect(byName["--color-text"].light).toBe("#2c3e50");
    expect(byName["--color-text"].dark).toBeDefined();
    const tokens = draftOf(root);
    expect(pairOf(tokens, "background")).toEqual(["#FFFFFF", "#181818"]);
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });
});

describe("motif extract on a Nuxt app", () => {
  test("app/assets/css/main.css and a scoped style block are read", async () => {
    const root = makeProject({
      "package.json": NUXT_PKG,
      "nuxt.config.ts": "export default defineNuxtConfig({ css: ['~/assets/css/main.css'] })\n",
      "app/assets/css/main.css":
        ":root { --bg: #fafaf9; --ink: #1c1917; --brand: #0f766e; }\n@media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; --ink: #fafaf9; --brand: #2dd4bf; } }\nbody { background: var(--bg); color: var(--ink); }\n",
      "app/app.vue": "<template><main><h1>Hi</h1></main></template>\n",
      "app/components/Card.vue": [
        "<template><div class=\"card\" :style=\"{ padding: '12px' }\">x</div></template>",
        "<style scoped>",
        ".card { padding: 16px; border-radius: 12px; background: var(--brand); color: #ffffff; transition: opacity 200ms ease; }",
        ".card .title { font-size: 18px; font-family: 'Inter', sans-serif; }",
        "</style>",
        "",
      ].join("\n"),
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const report = reportOf(root);
    const byName = Object.fromEntries(report.variables.map((v: any) => [v.name, v]));
    expect(byName["--bg"]).toMatchObject({ light: "#fafaf9", dark: "#0c0a09" });
    expect(byName["--brand"]).toMatchObject({ light: "#0f766e", dark: "#2dd4bf" });
    expect(report.spacing.map((s: any) => s.px)).toContain(16);
    expect(report.radius.map((s: any) => s.value)).toContain("12px");
    expect(report.durations.map((s: any) => s.value)).toContain("200ms");
    expect(report.fontFamilies.map((s: any) => s.value)).toContain("Inter");
  });

  test("template text, an HTML comment and a script string that only look like values are not read", async () => {
    const root = makeProject({
      "package.json": NUXT_PKG,
      "app/app.vue": "<template><p>Call 555-0134, ticket #123</p><!-- color: #fff --></template>\n<script setup>const s = 'rgba is a function'; const n = 13</script>\n",
    });
    await runExtract(root, ctx);
    const report = reportOf(root);
    expect(report.colors).toEqual([]);
    expect(report.spacing).toEqual([]);
  });

  test("a Nuxt 3 app at the project root: its own folders are read, Motif's design/ is not", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "n3", dependencies: { nuxt: "^3.15.0", vue: "^3.5.0" } }),
      "assets/css/main.css": ":root { --bg: #fafaf9; }\n",
      "design/tokens.json": "{}\n",
      "design/preview.css": ".x { color: #ff00aa; padding: 77px; }\n",
      "app.vue": "<template><main /></template>\n",
    });
    await runExtract(root, ctx);
    const report = reportOf(root);
    expect(report.variables.map((v: any) => v.name)).toContain("--bg");
    expect(JSON.stringify(report)).not.toContain("77px");
  });
});

describe("Vuetify themes", () => {
  const occ = collectVue([script(VUETIFY)]);
  const byName = Object.fromEntries(occ.variables!.map((v) => [v.name, v]));

  test("light and dark give each colour both values, under Motif's names for the common ones", () => {
    expect(byName["--action-primary"]).toMatchObject({ light: "#1867C0", dark: "#2196F3" });
    expect(byName["--background"]).toMatchObject({ light: "#FFFFFF", dark: "#121212" });
    expect(byName["--surface"]).toMatchObject({ light: "#F5F5F5", dark: "#1E1E1E" });
    expect(byName["--text-primary"]).toMatchObject({ light: "#1F1F1F", dark: "#EEEEEE" });
    expect(byName["--status-error"]).toMatchObject({ light: "#B00020", dark: "#CF6679" });
    expect(byName["--accent"]).toMatchObject({ light: "#82B1FF", dark: "#FF4081" });
    expect(byName["--action-secondary"]).toMatchObject({ light: "#48A9A6" });
  });

  test("harvest and harvestDark are one variant, with the dark half from harvestDark", () => {
    expect(byName["--action-primary"]!.variants).toEqual({ harvest: { light: "#B45309", dark: "#F59E0B" } });
    expect(byName["--background"]!.variants).toEqual({ harvest: { light: "#FFFBEB", dark: "#1C1917" } });
    expect(occ.variantLabels).toEqual({ harvest: "Harvest" });
    expect(occ.source).toBe("script");
  });

  test("a defaultTheme that names another pair makes it the default; light and dark become the default-variant variant", () => {
    const o = collectVue([script(VUETIFY.replace("defaultTheme: 'light'", "defaultTheme: 'harvest'"))]);
    const bg = o.variables!.find((v) => v.name === "--background")!;
    expect(bg).toMatchObject({ light: "#FFFBEB", dark: "#1C1917" });
    expect(bg.variants).toEqual({ "default-variant": { light: "#FFFFFF", dark: "#121212" } });
  });

  test("a file that doesn't mention Vuetify adds nothing", () => {
    expect(collectVue([script("export default { themes: { light: { colors: { primary: '#123456' } } } }")]).variables ?? []).toEqual([]);
  });

  test("the command drafts them: variants in the draft, valid tokens, from a Nuxt app's plugins/vuetify.ts", async () => {
    const root = makeProject({
      "package.json": NUXT_PKG,
      "app/plugins/vuetify.ts": VUETIFY,
      "app/app.vue": "<template><v-app /></template>\n",
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const tokens = draftOf(root);
    expect(tokens.$extensions["dev.motif"].variants).toEqual([{ id: "default", label: "Default", default: true }, { id: "harvest", label: "Harvest" }]);
    expect(pairOf(tokens, "action-primary")).toEqual(["#1867C0", "#2196F3"]);
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });

  test("a Nuxt app's vuetify.config.ts is read too", async () => {
    const root = makeProject({
      "package.json": NUXT_PKG,
      "vuetify.config.ts": `import { defineVuetifyConfiguration } from 'vuetify-nuxt-module/custom-configuration'\nexport default defineVuetifyConfiguration({ theme: { themes: { light: { dark: false, colors: { primary: '#00AA55' } }, dark: { dark: true, colors: { primary: '#00FF88' } } } } })\n`,
      "app.vue": "<template><v-app /></template>\n",
    });
    await runExtract(root, ctx);
    const v = reportOf(root).variables.find((x: any) => x.name === "--action-primary");
    expect(v).toMatchObject({ light: "#00AA55", dark: "#00FF88" });
  });
});

describe("motif extract on a monorepo of a Vue app and a React app", () => {
  test("both are drafted together", async () => {
    const root = makeProject({
      "apps/shop/package.json": VUE_PKG,
      "apps/shop/src/App.vue": "<template><main /></template>\n<style>\n:root { --brand: #7c3aed; }\n.a { padding: 24px; }\n</style>\n",
      "apps/admin/package.json": JSON.stringify({ name: "admin", dependencies: { react: "19", vite: "7" } }),
      "apps/admin/src/App.tsx": "export const App = () => <div style={{ padding: 24, color: '#0ea5e9' }}>x</div>;\n",
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("from 2 files");
    expect(r.text).not.toContain("Skipped");
    const report = reportOf(root);
    expect(report.variables.map((v: any) => v.name)).toContain("--brand");
    expect(JSON.stringify(report.colors).toLowerCase()).toContain("#7c3aed");
    expect(JSON.stringify(report.colors).toLowerCase()).toContain("#0ea5e9");
    expect(report.spacing.find((s: any) => s.px === 24).count).toBe(2);
  });
});
