import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { CSS_HEADER, JSON_COMMENT, TS_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { motifCss, tailwindCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = JSON.stringify(validTokens());
const ctx = { positionals: [] };
const pkg = (dev: Record<string, string | undefined>) => JSON.stringify({ name: "app", private: true, type: "module", devDependencies: dev });
const KIT = { "@sveltejs/adapter-auto": "^7.0.0", "@sveltejs/kit": "^2.70.0", "@sveltejs/vite-plugin-svelte": "^7.0.0", svelte: "^5.57.0", "svelte-check": "^4.3.0", typescript: "~5.9.0", vite: "^8.0.0" };
const TAILWIND = { "@tailwindcss/vite": "^4.1.0", tailwindcss: "^4.1.0" };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => r.data.notes as string[];
const LAYOUT_NOTE = "Next: import '$lib/styles/motif.css' once in src/routes/+layout.svelte (in its <script>).";
const TAILWIND_NOTE = 'Next: in your main CSS file, add an @import for src/lib/styles/motif.tailwind.css right after @import "tailwindcss" (write the path relative to that CSS file). Importing it before Tailwind undoes the theme.';

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

/** What `npx sv create` writes (SvelteKit minimal, TypeScript), with the Tailwind add-on when asked. */
const kitApp = (extra: Record<string, string> = {}, tailwind = true) =>
  makeProject({
    "package.json": pkg(tailwind ? { ...KIT, ...TAILWIND } : KIT),
    "svelte.config.js": "import adapter from '@sveltejs/adapter-auto';\n\nexport default { kit: { adapter: adapter() } };\n",
    "vite.config.ts": "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({ plugins: [sveltekit()] });\n",
    "tsconfig.json": '{ "extends": "./.svelte-kit/tsconfig.json" }\n',
    "src/app.html": "<!doctype html>\n<html lang=\"en\">\n<head>%sveltekit.head%</head>\n<body><div style=\"display: contents\">%sveltekit.body%</div></body>\n</html>\n",
    "src/app.d.ts": "declare global { namespace App {} }\nexport {};\n",
    "src/lib/index.ts": "// place files you want to import through the `$lib` alias in this folder.\n",
    "src/routes/+layout.svelte": tailwind
      ? "<script lang=\"ts\">\n\timport '../app.css';\n\n\tlet { children } = $props();\n</script>\n\n{@render children()}\n"
      : "<script lang=\"ts\">\n\tlet { children } = $props();\n</script>\n\n{@render children()}\n",
    "src/routes/+page.svelte": "<h1>Welcome to SvelteKit</h1>\n",
    ...(tailwind ? { "src/app.css": "@import 'tailwindcss';\n" } : {}),
    "design/tokens.json": TOKENS,
    ...extra,
  });

/** What `npm create vite` writes with the Svelte template (TypeScript). */
const viteApp = (extra: Record<string, string> = {}) =>
  makeProject({
    "package.json": pkg({ "@sveltejs/vite-plugin-svelte": "^7.0.0", svelte: "^5.57.0", typescript: "~5.9.0", vite: "^8.0.0" }),
    "index.html": '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
    "svelte.config.js": "import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';\n\nexport default { preprocess: vitePreprocess() };\n",
    "vite.config.ts": "import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\n\nexport default defineConfig({ plugins: [svelte()] });\n",
    "src/main.ts": "import { mount } from 'svelte'\nimport './app.css'\nimport App from './App.svelte'\n\nconst app = mount(App, { target: document.getElementById('app')! })\n\nexport default app\n",
    "src/App.svelte": "<script lang=\"ts\">\n  import Counter from './lib/Counter.svelte'\n</script>\n\n<main><Counter /></main>\n",
    "src/app.css": ":root { font-family: system-ui; color: #213547; }\n",
    "src/lib/Counter.svelte": "<script lang=\"ts\">\n  let count: number = $state(0)\n</script>\n\n<button onclick={() => count++}>count is {count}</button>\n",
    "design/tokens.json": TOKENS,
    ...extra,
  });

describe("motif tokens for a SvelteKit app", () => {
  test("writes React web's CSS and Svelte's motion.ts under src/lib, changes no file of the app, and says how to wire them", async () => {
    const root = kitApp();
    const before = hashAll(root);
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({
      "src/lib/styles/motif.css": "created",
      "src/lib/styles/motif.tailwind.css": "created",
      "src/lib/design/motion.ts": "created",
      "design/motif.json": "created",
    });
    const set = buildThemeSet(docFrom(validTokens()));
    expect(readFileSync(join(root, "src/lib/styles/motif.css"), "utf8")).toBe(motifCss(set.base, set.variants));
    expect(readFileSync(join(root, "src/lib/styles/motif.tailwind.css"), "utf8")).toBe(tailwindCss(set.base));
    const motion = readFileSync(join(root, "src/lib/design/motion.ts"), "utf8");
    expect(motion.startsWith(TS_HEADER)).toBe(true);
    expect(motion).toContain("export const spring = {");
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "svelte", srcDir: "src" }]);
    expect(notes(r)).toContain(TAILWIND_NOTE);
    expect(notes(r)).not.toContain(LAYOUT_NOTE);
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    const after = hashAll(root);
    for (const [file, hash] of Object.entries(before)) expect([file, after[file]]).toEqual([file, hash]);
  });

  test("without Tailwind: the layout note, and no Tailwind file", async () => {
    const r = await runTokens(kitApp({}, false), ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/lib/styles/motif.css", "src/lib/design/motion.ts", "design/motif.json"]);
    expect(notes(r)).toContain(LAYOUT_NOTE);
  });

  test("no note once the app imports the theme; a second run is up to date", async () => {
    const root = kitApp({ "src/app.css": "@import 'tailwindcss';\n@import './lib/styles/motif.tailwind.css';\n" });
    const first = await runTokens(root, ctx);
    expect(notes(first).some((n) => n.startsWith("Next:"))).toBe(false);
    const second = await runTokens(root, ctx);
    expect(second.text).toContain("Theme code is up to date.");
    expect(Object.values(statuses(second)).every((s) => s === "unchanged")).toBe(true);
  });

  test("a motif.css that isn't Motif's is protected, and its Tailwind file and the note are skipped", async () => {
    const root = kitApp({ "src/lib/styles/motif.css": ".mine { color: red }\n" });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(statuses(r)["src/lib/styles/motif.css"]).toBe("protected");
    expect(statuses(r)["src/lib/styles/motif.tailwind.css"]).toBe("skipped");
    expect(notes(r).some((n) => n.startsWith("Next:"))).toBe(false);
    expect(readFileSync(join(root, "src/lib/styles/motif.css"), "utf8")).toBe(".mine { color: red }\n");
  });

  test("a motion.ts that isn't Motif's is protected, and the theme's note is still given", async () => {
    const root = kitApp({ "src/lib/design/motion.ts": "export const mine = 1;\n" });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["src/lib/design/motion.ts"]).toBe("protected");
    expect(statuses(r)["src/lib/styles/motif.tailwind.css"]).toBe("created");
    expect(notes(r)).toContain(TAILWIND_NOTE);
    expect(readFileSync(join(root, "src/lib/design/motion.ts"), "utf8")).toBe("export const mine = 1;\n");
  });

  test("Tailwind 3 gets the CSS only, with the note", async () => {
    const root = kitApp({ "package.json": pkg({ ...KIT, tailwindcss: "^3.4.0" }) });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).not.toContain("src/lib/styles/motif.tailwind.css");
    expect(notes(r).join("\n")).toContain("Tailwind v3 found");
    expect(notes(r)).toContain(LAYOUT_NOTE);
  });

  test("themeDir from motif.json wins", async () => {
    const root = kitApp({ "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "svelte", themeDir: "src/lib/theme" }], ignore: [] }) }, false);
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/lib/theme/motif.css", "src/lib/theme/motion.ts", "design/motif.json"]);
    expect(notes(r)).toContain("Next: import '$lib/theme/motif.css' once in src/routes/+layout.svelte (in its <script>).");
  });
});

describe("motif tokens for a Svelte app with Vite", () => {
  test("writes beside the starter, changes none of its files, and names main.ts", async () => {
    const root = viteApp();
    const before = hashAll(root);
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(Object.keys(statuses(r))).toEqual(["src/lib/styles/motif.css", "src/lib/design/motion.ts", "design/motif.json"]);
    expect(notes(r)).toContain("Next: import './lib/styles/motif.css' once in src/main.ts (or main.js).");
    const after = hashAll(root);
    for (const [file, hash] of Object.entries(before)) expect([file, after[file]]).toEqual([file, hash]);
  });

  test("no note once main.ts imports it", async () => {
    const root = viteApp({ "src/main.ts": "import './lib/styles/motif.css'\nimport './app.css'\n" });
    expect(notes(await runTokens(root, ctx)).some((n) => n.startsWith("Next:"))).toBe(false);
  });
});

describe("motif tokens for a Svelte 4 app", () => {
  test("the CSS, and the reason motion.ts was left out", async () => {
    const root = kitApp({ "package.json": pkg({ "@sveltejs/kit": "^2.5.0", svelte: "^4.2.19", vite: "^5.4.0" }) }, false);
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/lib/styles/motif.css", "design/motif.json"]);
    expect(notes(r)).toContain("motion.ts uses Svelte 5's Spring and Tween, so Motif didn't write it. Animate with the CSS variables in motif.css (--motif-duration-*, --motif-easing-*).");
    expect(notes(r)).toContain(LAYOUT_NOTE);
  });
});

describe("a Svelte app that used Motif 0.5.0's design/generated theme", () => {
  test("says the old files are no longer updated and names the new one; the old import doesn't count as wired", async () => {
    const root = kitApp(
      {
        "design/generated/motif.css": `${CSS_HEADER}\n:root { --motif-color-action-primary: #000; }\n`,
        "design/generated/tokens.flat.json": JSON.stringify({ $comment: JSON_COMMENT }),
        "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "svelte" }], ignore: [] }),
        "src/routes/+layout.svelte": "<script lang=\"ts\">\n\timport '../../design/generated/motif.css';\n\tlet { children } = $props();\n</script>\n\n{@render children()}\n",
      },
      false,
    );
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(notes(r)).toContain(
      "design/generated/motif.css and design/generated/tokens.flat.json are from an earlier version of Motif and are no longer updated: import src/lib/styles/motif.css instead, then delete design/generated/.",
    );
    expect(notes(r)).toContain(LAYOUT_NOTE);
  });
});
