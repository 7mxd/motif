import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { validateTokens } from "../src/contract/tokens";
import { FIXTURES, docFrom } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const ctx = { positionals: [], flags: {} };
const KIT_PKG = JSON.stringify({ name: "site", scripts: { dev: "vite dev" }, devDependencies: { "@sveltejs/kit": "^2.70.0", svelte: "^5.57.0", vite: "^8.0.0" } });
const VITE_PKG = JSON.stringify({ name: "app", scripts: { dev: "vite" }, devDependencies: { "@sveltejs/vite-plugin-svelte": "^6.0.0", svelte: "^5.57.0", vite: "^7.0.0" } });
const APP_HTML = '<!doctype html>\n<html lang="en"><head>%sveltekit.head%</head><body data-sveltekit-preload-data="hover">%sveltekit.body%</body></html>\n';
const draftOf = (root: string): any => JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
const reportOf = (root: string): any => JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
const byName = (report: any) => Object.fromEntries(report.variables.map((v: any) => [v.name, v]));
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;
const pairOf = (tokens: any, role: string) => [hexOf(tokens, tokens.color[role].$value), hexOf(tokens, tokens.color[role].$extensions["dev.motif"].modes.dark)];

/** shadcn-svelte's app.css: oklch variables, a .dark block, and Tailwind 4's @theme inline. */
const SHADCN = `@import 'tailwindcss';

@custom-variant dark (&:is(.dark *));

:root {
	--radius: 0.625rem;
	--background: oklch(1 0 0);
	--foreground: oklch(0.145 0 0);
	--card: oklch(1 0 0);
	--primary: oklch(0.205 0 0);
	--primary-foreground: oklch(0.985 0 0);
	--border: oklch(0.922 0 0);
}

.dark {
	--background: oklch(0.145 0 0);
	--foreground: oklch(0.985 0 0);
	--card: oklch(0.205 0 0);
	--primary: oklch(0.922 0 0);
	--primary-foreground: oklch(0.205 0 0);
	--border: oklch(1 0 0 / 10%);
}

@theme inline {
	--radius-lg: var(--radius);
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-card: var(--card);
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-border: var(--border);
}

@layer base {
	body {
		@apply bg-background text-foreground;
	}
}
`;

describe("motif extract on a SvelteKit app", () => {
  test("the demo template's layout.css and scoped styles are read, and app.html's placeholders are not values", async () => {
    const root = tempDir("motif-kit-");
    cpSync(join(FIXTURES, "svelte-kit-demo"), root, { recursive: true });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const report = reportOf(root);
    const vars = byName(report);
    expect(vars["--color-theme-1"].light).toBe("#ff3e00");
    expect(vars["--color-theme-2"].light).toBe("#4075a6");
    expect(report.fontFamilies.map((f: any) => f.value)).toContain("Fira Mono");
    expect(JSON.stringify(report)).not.toContain("sveltekit");
    expect(validateTokens(docFrom(draftOf(root)))).toEqual([]);
  });

  test("a shadcn-svelte app.css gives the variables their light and dark values", async () => {
    const root = makeProject({
      "package.json": KIT_PKG,
      "src/app.html": APP_HTML,
      "src/app.css": SHADCN,
      "src/routes/+layout.svelte": "<script>\n  import '../app.css';\n  let { children } = $props();\n</script>\n\n{@render children()}\n",
      "src/routes/+page.svelte": '<main class="bg-background text-foreground"><button class="bg-primary text-primary-foreground rounded-lg border-border">Go</button></main>\n',
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const vars = byName(reportOf(root));
    expect(vars["--background"]).toMatchObject({ light: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" });
    expect(vars["--background"].dark).toBeDefined();
    expect(vars["--background"].dark).not.toBe(vars["--background"].light);
    expect(vars["--primary"].dark).toBeDefined();
    const tokens = draftOf(root);
    const [light, dark] = pairOf(tokens, "background");
    expect(light).toBe("#FFFFFF");
    expect(dark).not.toBe(light);
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });

  test("a scoped <style> block's colours, spacing, radius, fonts and timings are read", async () => {
    const root = makeProject({
      "package.json": KIT_PKG,
      "src/routes/+page.svelte": [
        '<h1 class="title">Hi</h1>',
        "<style>",
        "  .title { padding: 16px; border-radius: 12px; background: #0f766e; color: #ffffff; font-size: 18px; font-family: 'Newsreader', serif; transition: opacity 200ms ease; }",
        "  :global(body) { margin: 24px; }",
        "</style>",
        "",
      ].join("\n"),
    });
    await runExtract(root, ctx);
    const report = reportOf(root);
    expect(report.colors.map((c: any) => c.hex.toLowerCase())).toContain("#0f766e");
    expect(report.spacing.map((s: any) => s.px)).toEqual(expect.arrayContaining([16, 24]));
    expect(report.radius.map((s: any) => s.value)).toContain("12px");
    expect(report.durations.map((s: any) => s.value)).toContain("200ms");
    expect(report.fontFamilies.map((s: any) => s.value)).toContain("Newsreader");
  });

  test("markup, script strings and comments that only look like values are not read", async () => {
    const root = makeProject({
      "package.json": KIT_PKG,
      "src/routes/+page.svelte": [
        "<script>",
        "  const note = 'rgba is a function';",
        "  let count = $state(0);",
        "</script>",
        "<!-- color: #fff -->",
        "<p>Call 555-0134, ticket #123</p>",
        '{#if count > 13}<img src="a.png" width={300} onclick={() => count > 13} />{/if}',
        "<input bind:value={count} />",
        "",
      ].join("\n"),
    });
    await runExtract(root, ctx);
    const report = reportOf(root);
    expect(report.colors).toEqual([]);
    expect(report.spacing).toEqual([]);
  });

  test("a page colour set on <html> in src/app.html is read like a page's", async () => {
    const root = makeProject({
      "package.json": KIT_PKG,
      "src/app.html": '<!doctype html>\n<html lang="en" class="bg-paper text-ink"><head>%sveltekit.head%</head><body>%sveltekit.body%</body></html>\n',
      "src/app.css": '@import "tailwindcss";\n@theme { --color-paper: #f4f4f5; --color-ink: #111111; --color-card: #ffffff; }\n',
      "src/routes/+page.svelte": `<main>${'<div class="bg-card text-ink">x</div>'.repeat(8)}</main>\n`,
    });
    await runExtract(root, ctx);
    const tokens = draftOf(root);
    expect(hexOf(tokens, tokens.color.background.$value)).toBe("#F4F4F5");
  });
});

describe("motif extract on a Vite Svelte app", () => {
  test("src/app.css is read with its prefers-color-scheme dark block", async () => {
    const root = makeProject({
      "package.json": VITE_PKG,
      "index.html": '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n',
      "src/main.ts": "import { mount } from 'svelte'\nimport './app.css'\nimport App from './App.svelte'\nexport default mount(App, { target: document.getElementById('app')! })\n",
      "src/app.css": ":root { --bg: #fafaf9; --ink: #1c1917; }\n@media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; --ink: #fafaf9; } }\nbody { background: var(--bg); color: var(--ink); }\n",
      "src/App.svelte": "<main><h1>Hi</h1></main>\n",
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(byName(reportOf(root))["--bg"]).toMatchObject({ light: "#fafaf9", dark: "#0c0a09" });
  });
});

describe("motif extract on a monorepo with Svelte and Vue", () => {
  test("both apps are drafted together, and neither is skipped", async () => {
    const root = makeProject({
      "apps/kit/package.json": KIT_PKG,
      "apps/kit/src/app.css": ":root { --brand: #0f766e; }\n",
      "apps/kit/src/routes/+page.svelte": '<p class="a">x</p>\n<style>.a { padding: 20px; }</style>\n',
      "apps/vue/package.json": JSON.stringify({ name: "v", dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^7.0.0" } }),
      "apps/vue/src/base.css": ":root { --accent: #b45309; }\n",
      "apps/vue/src/App.vue": '<template><p class="b">x</p></template>\n<style scoped>.b { padding: 28px; }</style>\n',
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(r.text).not.toContain("Skipped");
    const report = reportOf(root);
    expect(Object.keys(byName(report))).toEqual(expect.arrayContaining(["--brand", "--accent"]));
    expect(report.spacing.map((s: any) => s.px)).toEqual(expect.arrayContaining([20, 28]));
  });
});
