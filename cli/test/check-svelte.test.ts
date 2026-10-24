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
const KIT = { "@sveltejs/adapter-auto": "^7.0.0", "@sveltejs/kit": "^2.70.0", "@sveltejs/vite-plugin-svelte": "^7.0.0", svelte: "^5.57.0", typescript: "~5.9.0", vite: "^8.0.0" };
const VITE = { "@sveltejs/vite-plugin-svelte": "^6.0.0", svelte: "^5.57.0", typescript: "~5.9.0", vite: "^7.0.0" };
const TW4 = { tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" };
const pkg = (dev: Record<string, string>) => JSON.stringify({ name: "shop", private: true, type: "module", scripts: { dev: "vite dev" }, devDependencies: dev });

const PAGE = [
  "<script>",
  '  import { fly } from "svelte/transition";',
  '  import { cubicOut } from "svelte/easing";',
  '  import { Spring } from "svelte/motion";',
  '  const note = "rgba is a function";',
  "  let count = $state(0);",
  "  const s = new Spring(0, { stiffness: 0.15, damping: 0.8 });",
  "</script>",
  "",
  `<main class="p-[13px]" class:m-[9px]={count > 13} style:color="#333" style="padding: 13px; color: {count}">`,
  "  <!-- motif-ok: partner brand -->",
  '  <p style="color:#ff00aa">Call 555-0134, ticket #123</p>',
  '  <img src="a.png" width={300} onclick={() => count > 13} />',
  "  {#if count > 13}",
  "    <p transition:fly={{ y: 8, duration: 300, easing: cubicOut }}>hi</p>",
  "  {/if}",
  "</main>",
  "",
  "<style>",
  "  .row { gap: 13px; color: var(--motif-color-text-primary); }",
  "</style>",
  "",
].join("\n");

/** What `npx sv create` writes (SvelteKit minimal), with its theme code written by motif tokens. */
async function kitApp(files: Record<string, string>, deps: Record<string, string> = {}): Promise<string> {
  const root = makeProject({
    "package.json": pkg({ ...KIT, ...deps }),
    "svelte.config.js": "import adapter from '@sveltejs/adapter-auto';\nexport default { kit: { adapter: adapter() } };\n",
    "src/app.html": '<!doctype html>\n<html lang="en"><head>%sveltekit.head%</head><body>%sveltekit.body%</body></html>\n',
    "src/lib/index.ts": "// place files you want to import through the `$lib` alias in this folder.\n",
    "src/routes/+layout.svelte": "<script lang=\"ts\">\n  let { children } = $props();\n</script>\n\n{@render children()}\n",
    "src/routes/+page.svelte": "<h1>Welcome</h1>\n",
    "design/tokens.json": TOKENS,
    ...files,
  });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}

/** What `npm create vite` (Svelte, TypeScript) writes, with its theme code written by motif tokens. */
async function viteApp(files: Record<string, string>, deps: Record<string, string> = {}): Promise<string> {
  const root = makeProject({
    "package.json": pkg({ ...VITE, ...deps }),
    "index.html": '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
    "src/main.ts": 'import { mount } from "svelte";\nimport App from "./App.svelte";\nexport default mount(App, { target: document.getElementById("app")! });\n',
    "src/App.svelte": "<h1>Vite + Svelte</h1>\n",
    "design/tokens.json": TOKENS,
    ...files,
  });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}

const check = (root: string, positionals: string[] = []) => runCheck(root, { positionals });
const violations = (r: any) => (r.data as any).violations as any[];
const where = (r: any) => violations(r).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);
const at = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle}`);
  return `${text.slice(0, i).split("\n").length}:${i - text.lastIndexOf("\n", i - 1)}`;
};

describe("motif check on a SvelteKit app", () => {
  test("finds what is a value at its line and column in the .svelte file, and nothing that only looks like one", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": PAGE }, TW4);
    const r = await check(root);
    expect(r.exitCode).toBe(1);
    const found = where(r);
    const f = "src/routes/+page.svelte";
    const p = (rule: string, needle: string, from?: number) => `${rule} ${f}:${at(PAGE, needle, from)}`;
    expect(found).toContain(p("tailwind-arbitrary", "p-[13px]"));
    expect(found).toContain(p("tailwind-arbitrary", "m-[9px]")); // class:m-[9px]={…}, at the class's name
    expect(found).toContain(p("raw-color", "#333"));
    expect(found).toContain(p("off-scale", "13px", PAGE.indexOf('style="padding'))); // style="padding: 13px"
    expect(found).toContain(p("off-scale", "13px", PAGE.indexOf(".row")));
    expect(found).toContain(p("raw-motion", "duration: 300"));
    expect(found).toContain(p("raw-motion", "easing: cubicOut"));
    expect(found).toContain(p("raw-motion", "stiffness: 0.15"));
    expect(found).toContain(p("raw-motion", "damping: 0.8"));
    // The motif-ok comment allows the colour on the next line; nothing on the lines that only look like values.
    expect(found.filter((x) => x.endsWith(`:${at(PAGE, "#ff00aa")}`))).toEqual([]);
    for (const needle of ["rgba is a function", "555-0134", "width={300}", "{#if count > 13}"]) {
      const line = at(PAGE, needle).split(":")[0];
      expect(found.filter((x) => x.split(":")[1] === line && !x.startsWith("raw-motion"))).toEqual([]);
    }
    expect((r.data as any).exceptions).toHaveLength(1);
    expect((r.data as any).exceptions[0]).toMatchObject({ rule: "raw-color", file: f, reason: "partner brand" });
  });

  test("the fixes are in Svelte's words, with $lib/design/motion in SvelteKit", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": PAGE }, TW4);
    const hits = violations(await check(root));
    const fix = (rule: string, text: string) => hits.find((h) => h.rule === rule && h.text === text)?.fix;
    expect(fix("raw-motion", "duration: 300")).toBe("Import { duration, easing, spring } from $lib/design/motion and pass them: transition:fly={{ duration: duration.base, easing: easing.standard }}.");
  });

  test("a colour in style:color={…} has the fix for it; one in a script string has the general one", async () => {
    const file = '<script>const brand = "#336699";</script>\n<p style:color={"#445566"}>x</p>\n';
    const root = await kitApp({ "src/routes/+page.svelte": file });
    const hits = violations(await check(root));
    expect(hits.map((h) => [h.text, h.line])).toEqual([["#336699", 1], ["#445566", 2]]);
    expect(hits[1].fix).toBe("Use 'var(--motif-color-<role>)' in style: or style=\"…\", or a class (bg-<role>) with Tailwind.");
    expect(hits[0].fix).toContain("bg-action-primary");
  });

  test("motif-ok works in <!-- -->, // and /* */ comments of a .svelte file", async () => {
    const file = [
      "<script>",
      "  // motif-ok: brand blue",
      "  const blue = '#0000ff';",
      "  const pink = '#ff00ff'; /* motif-ok: brand pink */",
      "</script>",
      '<!-- motif-ok: brand red --><p style="color:#ff0000">a</p>',
      '<p style:color={"#00ff00"}>b</p> <!-- motif-ok: brand green -->',
      "<style>",
      "  /* motif-ok: brand grey */",
      "  .a { color: #888888 }",
      "</style>",
      "",
    ].join("\n");
    const root = await kitApp({ "src/routes/+page.svelte": file });
    const r = await check(root);
    expect(where(r)).toEqual([]);
    expect(((r.data as any).exceptions as any[]).map((e) => e.reason).sort()).toEqual(["brand blue", "brand green", "brand grey", "brand pink", "brand red"]);
  });

  test("the generated files are never scanned; a changed one is a warning", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": "<p>hi</p>\n" });
    expect((await check(root)).exitCode).toBe(0);
    const css = join(root, "src/lib/styles/motif.css");
    writeFileSync(css, readFileSync(css, "utf8").replace("--motif-space-4", "--motif-space-4-x") + "\n.x { color: #123456; padding: 13px }\n");
    const ts = join(root, "src/lib/design/motion.ts");
    writeFileSync(ts, readFileSync(ts, "utf8") + "\nexport const slow = { duration: 999 };\n");
    const r = await check(root);
    expect(r.exitCode).toBe(0);
    expect(violations(r)).toEqual([]);
    expect(((r.data as any).warnings as any[]).map((w) => `${w.rule} ${w.file}`).sort()).toEqual(["generated-edited src/lib/design/motion.ts", "generated-edited src/lib/styles/motif.css"]);
  });

  test("a hit reached by two rules is reported once", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": '<div style:color={"#336699"} style="color: {c ? \'#336699\' : \'red\'}" />\n' });
    expect(where(await check(root)).length).toBe(2);
  });

  test("scanning one path reads only that file", async () => {
    const root = await kitApp({ "src/routes/a/+page.svelte": '<p style="color:#111111" />\n', "src/routes/b/+page.svelte": '<p style="color:#222222" />\n' });
    expect(where(await check(root, ["src/routes/b/+page.svelte"]))).toEqual([`raw-color src/routes/b/+page.svelte:1:${'<p style="color:'.length + 1}`]);
  });

  test("the SvelteKit starters' own files give no findings", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": "<h1>Welcome to SvelteKit</h1>\n<p>Visit <a href=\"https://svelte.dev/docs/kit\">svelte.dev/docs/kit</a> to read the documentation</p>\n", "src/app.css": "body { margin: 0; }\n" }, TW4);
    const r = await check(root);
    expect(r.exitCode).toBe(0);
    expect(violations(r)).toEqual([]);
  });

  test("generated and build output are skipped: .svelte-kit and build", async () => {
    const root = await kitApp({ ".svelte-kit/generated/root.svelte": '<p style="color:#123456" />', "build/index.html": '<p style="color:#123456">x</p>' });
    expect(violations(await check(root))).toEqual([]);
  });
});

describe("reduced motion on a Svelte app", () => {
  const FADE = "<script>\n  import { fade } from 'svelte/transition';\n</script>\n\n{#if on}<p transition:fade>hi</p>{/if}\n";

  test("an app with a transition: and nothing that respects the setting gets one finding, with the fix in Svelte's words", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": FADE });
    const r = await check(root);
    expect(r.exitCode).toBe(1);
    expect(violations(r).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`)).toEqual([`reduced-motion src/routes/+page.svelte:${at(FADE, "<p transition:fade>").replace(/:(\d+)$/, (_, c) => `:${c}`)}`]);
    expect(violations(r)[0].fix).toContain("prefersReducedMotion from svelte/motion");
  });

  test("prefersReducedMotion from svelte/motion anywhere in the app respects it", async () => {
    const root = await kitApp({ "src/routes/+page.svelte": FADE, "src/lib/pref.ts": 'import { prefersReducedMotion } from "svelte/motion";\nexport const calm = () => prefersReducedMotion.current;\n' });
    expect(violations(await check(root))).toEqual([]);
  });

  test("CSS animations are covered by the query in motif.css, which tokens wrote: the same app with it deleted is reported", async () => {
    const page = "<p>hi</p>\n<style>\n  .a { transition: opacity var(--motif-duration-base) var(--motif-easing-standard) }\n</style>\n";
    const root = await kitApp({ "src/routes/+page.svelte": page });
    expect(violations(await check(root))).toEqual([]);
    const css = join(root, "src/lib/styles/motif.css");
    writeFileSync(css, readFileSync(css, "utf8").replace(/prefers-reduced-motion/g, "prefers-nothing"));
    expect(violations(await check(root)).map((h) => h.rule)).toEqual(["reduced-motion"]);
  });
});

describe("motif check on a Vite Svelte app", () => {
  test("reads App.svelte, src/lib components and app.css; the motion fix names a path relative to the file", async () => {
    const counter = ["<script>", "  import { Tween } from \"svelte/motion\";", "  const t = new Tween(0, { duration: 400 });", "</script>", "<button style:color=\"#444444\">x</button>", ""].join("\n");
    const root = await viteApp({ "src/lib/Counter.svelte": counter, "src/App.svelte": "<main class=\"p-[13px]\"><Counter /></main>\n", "src/app.css": ":root { color: #123456; }\n" }, TW4);
    const r = await check(root);
    expect(where(r)).toEqual([
      "raw-color src/app.css:1:16",
      "tailwind-arbitrary src/App.svelte:1:14",
      "reduced-motion src/lib/Counter.svelte:2:3",
      "raw-motion src/lib/Counter.svelte:3:28",
      "raw-color src/lib/Counter.svelte:5:22",
    ]);
    expect(violations(r).find((h) => h.rule === "raw-motion").fix).toBe("Import { duration, easing, spring } from ./design/motion and pass them: transition:fly={{ duration: duration.base, easing: easing.standard }}.");
  });
});

describe("motif check on a Svelte app without a design guide", () => {
  test("points at motif extract, which reads Svelte", async () => {
    const root = makeProject({ "package.json": pkg(KIT), "src/routes/+page.svelte": "<p>hi</p>\n" });
    const r = await check(root);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Draft one from your code with motif extract");
  });
});
