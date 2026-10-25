import { afterAll, describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { SVELTE } from "../src/stacks/svelte";
import { MOTION_FIX, STYLE_COLOR_FIX, svelteFix, svelteReducedMotionHits } from "../src/stacks/svelte/rules";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
const sfc = (text: string, path = "src/A.svelte"): SourceFile => ({ path, abs: `/x/${path}`, text, lang: "markup" });
/** What the Svelte stack's own rules find in a .svelte file's views. */
const svelte = (text: string) => SVELTE.views!(sfc(text)).flatMap((v) => SVELTE.scan!(v, scale));
/** The stack's rules and the web's rules together, as motif check runs them (a hit found twice counted once). */
const everything = (text: string): Hit[] => {
  const found = SVELTE.views!(sfc(text)).flatMap((v) => [...SVELTE.scan!(v, scale), ...scanFile(v, scale)]);
  return found.filter((h, i) => found.findIndex((g) => g.rule === h.rule && g.line === h.line && g.column === h.column && g.text === h.text) === i);
};
const violations = (text: string) => everything(text).filter((h) => h.violation);
const where = (hits: Hit[]) => hits.map((h) => `${h.rule} ${h.line}:${h.column} ${h.text}`);
/** Line:column (1-based) of the first occurrence of needle. */
const pos = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle}`);
  return `${text.slice(0, i).split("\n").length}:${i - text.lastIndexOf("\n", i - 1)}`;
};
const lc = (h: Hit) => `${h.line}:${h.column}`;

describe("what only looks like a value in a .svelte file has no findings (Review Focus 2)", () => {
  const SAFE = [
    "<script>",
    "  let count = $state(0);",
    '  const note = "rgba is a function";',
    "  let markup = '<b>hi</b>';",
    "</script>",
    "",
    '<!-- <p style="color: #fff">color: #fff</p> -->',
    "<p>Call 555-0134, ticket #123</p>",
    "<p>{count > 13}</p>",
    "{#if count > 13}",
    '  <img src="a.png" width={300} height={200} onclick={() => a > b} />',
    "{:else}",
    "  <input bind:value={name} {disabled} />",
    "  {@html markup}",
    "{/if}",
    '<div style="color: var(--motif-color-text-primary); padding: var(--motif-space-4)" style:color="var(--motif-color-text-primary)" class="flex gap-4 p-4 bg-action-primary" class:active={count > 3}>x</div>',
    "<style>",
    "  .row { gap: 16px; color: var(--motif-color-text-primary); }",
    "</style>",
  ].join("\n");

  test("nothing is reported", () => {
    expect(where(violations(SAFE))).toEqual([]);
  });
});

describe("what is a value in a .svelte file is found at its line and column", () => {
  const FILE = [
    '<div class="p-[13px] card" class:p-[13px]={on} style:color="#333" style:padding={"13px"} style="padding: 13px; color: {c}" transition:fly={{ y: 8, duration: 300 }}>',
    "  <p style:color={dark ? '#ff0000' : 'var(--motif-color-text-primary)'}>x</p>",
    "</div>",
    "<style>",
    "  .row { gap: 13px }",
    "</style>",
  ].join("\n");

  test("class names, the class: directive, style: and the style block", () => {
    const found = where(violations(FILE));
    const p = (rule: string, needle: string, text: string, from?: number) => `${rule} ${pos(FILE, needle, from)} ${text}`;
    expect(found).toContain(p("tailwind-arbitrary", "p-[13px] card", "p-[13px]"));
    expect(found).toContain(p("raw-color", "#333", "#333"));
    expect(found).toContain(p("off-scale", "13px", "13px", FILE.indexOf("padding: 13px")));
    expect(found).toContain(p("off-scale", "13px", "13px", FILE.indexOf(".row")));
    expect(found).toContain(p("raw-color", "#ff0000", "#ff0000"));
    expect(found).toContain(p("raw-motion", "duration: 300", "duration: 300"));
  });

  test("class:p-[13px]={on} is reported at the class's name, as class=\"p-[13px]\" is", () => {
    const text = '<div class:p-[13px]={on} class:hover:bg-[#ff0000]={a} class:flex class="p-[13px]" />';
    const hits = violations(text).filter((h) => h.rule === "tailwind-arbitrary");
    expect(hits.map((h) => [h.text, h.column])).toEqual([
      ["p-[13px]", text.indexOf("p-[13px]") + 1],
      ["hover:bg-[#ff0000]", text.indexOf("hover:bg-") + 1],
      ["p-[13px]", text.lastIndexOf("p-[13px]") + 1],
    ]);
  });

  test("style:padding={…} is judged against the scale; a bare number has no unit and is left alone", () => {
    const text = '<p style:padding={"13px"} style:margin-top={`4px`} style:gap={13} style:--space={"13px"} style:border-radius={"7px"} />';
    const hits = svelte(text).filter((h) => h.violation);
    expect(hits.map((h) => [h.rule, h.kind, h.text, h.column])).toEqual([
      ["off-scale", "space", "13px", text.indexOf("13px") + 1],
      ["off-scale", "radius", "7px", text.indexOf("7px") + 1],
    ]);
  });

  test("style:font-family={…} with a typed family is a raw font; a variable is not", () => {
    const text = '<p style:font-family={"Comic Sans MS"} /><p style:font-family={"var(--motif-font-body-family)"} />';
    expect(svelte(text).map((h) => [h.rule, h.text, h.column])).toEqual([["raw-font", "Comic Sans MS", text.indexOf("Comic") + 1]]);
  });

  test("a colour in style:color={…} has Svelte's fix, and is one hit although two rules read it", () => {
    const hits = violations('<p style:color={"#336699"} />');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.fix).toBe(STYLE_COLOR_FIX);
  });
});

describe("raw motion", () => {
  const FILE = [
    "<script>",
    '  import { fly } from "svelte/transition";',
    '  import { cubicOut, quintInOut as q } from "svelte/easing";',
    '  import * as easings from "svelte/easing";',
    '  import { Spring, Tween } from "svelte/motion";',
    "  const s = new Spring(0, { stiffness: 0.15, damping: 0.8 });",
    "  const t = new Tween(0, { duration: 400, easing: cubicOut });",
    "  const u = new Tween(0, { duration: 250, easing: easings.sineIn });",
    "  const v = new Tween(0, { delay: duration.fast, easing: q });",
    "  // new Spring(0, { stiffness: 0.5 })",
    "</script>",
    "<div transition:fly={{ y: 8, duration: 300, easing: cubicOut }} in:fade={{ delay: 50 }} out:fade animate:flip={{ duration: 200 }}>x</div>",
  ].join("\n");

  test("duration and delay in transition:, in:, out: and animate: parameters, and in Tween, are milliseconds", () => {
    const hits = svelte(FILE).filter((h) => h.kind === "duration");
    expect(hits.map((h) => [lc(h), h.text, h.value])).toEqual([
      [pos(FILE, "duration: 400"), "duration: 400", "400ms"],
      [pos(FILE, "duration: 250"), "duration: 250", "250ms"],
      [pos(FILE, "duration: 300"), "duration: 300", "300ms"],
      [pos(FILE, "delay: 50"), "delay: 50", "50ms"],
      [pos(FILE, "duration: 200"), "duration: 200", "200ms"],
    ]);
    expect(hits.every((h) => h.rule === "raw-motion" && h.violation && h.fix === MOTION_FIX)).toBe(true);
  });

  test("easings imported from svelte/easing (named, aliased or through a namespace) where easing.<role> belongs", () => {
    const hits = svelte(FILE).filter((h) => h.kind === "easing");
    expect(hits.map((h) => [lc(h), h.text, h.value])).toEqual([
      [pos(FILE, "easing: cubicOut"), "easing: cubicOut", "cubicOut"],
      [pos(FILE, "easing: easings.sineIn"), "easing: easings.sineIn", "sineIn"],
      [pos(FILE, "easing: q"), "easing: q", "quintInOut"],
      [pos(FILE, "easing: cubicOut", FILE.indexOf("<div")), "easing: cubicOut", "cubicOut"],
    ].sort((a, b) => Number.parseInt(a[0]!) - Number.parseInt(b[0]!)));
  });

  test("new Spring(…) literals; a motion.ts value, a comment and a name that isn't from svelte/motion are not", () => {
    const hits = svelte(FILE).filter((h) => h.kind === "spring");
    expect(hits.map((h) => [lc(h), h.text])).toEqual([[pos(FILE, "stiffness: 0.15"), "stiffness: 0.15"], [pos(FILE, "damping: 0.8"), "damping: 0.8"]]);
    const none = [
      '<script>import { Spring } from "svelte/motion"; import { spring, duration, easing } from "$lib/design/motion";',
      "const a = new Spring(0, spring.snappy); const b = new Tween(0, { duration: 400 }); const c = new Spring(0, { stiffness: spring.x.stiffness });",
      "toast.show({ duration: 4000, easing: cubicOut, stiffness: 3 }); setTimeout(f, 300);",
      "</script>",
      "<div transition:fly={{ duration: duration.base, easing: easing.standard }} />",
    ].join("\n");
    expect(svelte(none)).toEqual([]);
  });

  test("the older spring() and tweened() stores are read like Spring and Tween", () => {
    const text = '<script>import { spring as sp, tweened } from "svelte/motion"; const a = sp(0, { stiffness: 0.1 }); const b = tweened(0, { duration: 400 });</script>';
    expect(svelte(text).map((h) => h.text)).toEqual(["stiffness: 0.1", "duration: 400"]);
  });

  test("Motion's animate() is the web's rule (typed values are always flagged), with a fix in Svelte's words", () => {
    const text = ["<script>", 'import { animate } from "motion";', 'animate(el, { opacity: 1 }, { duration: 0.3, ease: "easeIn" });', "</script>"].join("\n");
    const hits = violations(text).filter((h) => h.rule === "raw-motion");
    expect(hits.map((h) => [h.kind, h.text, h.value])).toEqual([["duration", "duration: 0.3", "300ms"], ["easing", 'ease: "easeIn"', '"easeIn"']]);
    expect(svelteFix(hits[0]!, { appDir: makeProject({ "package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.70.0" } }) }), appPath: ".", motionImport: "src/lib/design/motion" })).toBe(MOTION_FIX);
  });
});

describe("the motion fix names where motion.ts is", () => {
  const hit = (file: string, fix = MOTION_FIX, fixKind: Hit["fixKind"] = fix === MOTION_FIX ? "transition" : undefined): Hit => ({ rule: "raw-motion", kind: "duration", file, line: 1, column: 1, text: "", violation: true, message: "", fix, ...(fixKind ? { fixKind } : {}) });
  const web = (appDir: string) => ({ appDir, appPath: ".", motionImport: "src/lib/design/motion" });

  test("$lib/design/motion in a SvelteKit app, a path relative to the file in a Vite app, CSS variables before Svelte 5", () => {
    const kit = makeProject({ "package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.70.0", svelte: "^5.0.0" } }) });
    const vite = makeProject({ "package.json": JSON.stringify({ devDependencies: { "@sveltejs/vite-plugin-svelte": "^6.0.0", svelte: "^5.0.0" } }) });
    expect(svelteFix(hit("src/routes/+page.svelte"), web(kit))).toBe(MOTION_FIX);
    expect(svelteFix(hit("src/App.svelte"), web(vite))).toBe("Import { duration, easing, spring } from ./lib/design/motion and pass them: transition:fly={{ duration: duration.base, easing: easing.standard }}.");
    expect(svelteFix(hit("src/lib/deep/Card.svelte"), web(vite))).toContain("from ../design/motion and");
    expect(svelteFix(hit("src/App.svelte"), { appDir: vite, appPath: ".", motionImport: undefined })).toBe(
      "Use var(--motif-duration-<role>) and var(--motif-easing-<role>) from motif.css: this app is before Svelte 5, so Motif writes no motion.ts.",
    );
    // Before Svelte 5, Tailwind's text keeps its CSS variable and drops the motion.ts it can't import.
    expect(svelteFix(hit("src/App.svelte", 'Use duration-(--motif-duration-base) (or fast/slow), or import { duration } from "src/design/motion".'), { appDir: vite, appPath: "." })).toBe(
      "Use duration-(--motif-duration-base) (or fast/slow).",
    );
    // Tailwind's and the web's own texts name the path too.
    expect(svelteFix(hit("src/App.svelte", 'Use duration-(--motif-duration-base) (or fast/slow), or import { duration } from "src/lib/design/motion".'), web(vite))).toContain('from "./lib/design/motion"');
    expect(svelteFix(hit("src/routes/a/+page.svelte", "Use the generated src/lib/design/motion.ts: import { duration, easing, spring } from it (path relative to this file), e.g. transition={spring.smooth}.", "motion"), web(kit))).toBe(MOTION_FIX);
  });

  test("SvelteKit 3, which removed $lib: #lib/design/motion where package.json maps #lib/*, else a path relative to the file", () => {
    const kit3 = { "@sveltejs/kit": "^3.1.0", svelte: "^5.57.0" };
    const mapped = makeProject({ "package.json": JSON.stringify({ devDependencies: kit3, imports: { "#lib/*": "./src/lib/*" } }) });
    const unmapped = makeProject({ "package.json": JSON.stringify({ devDependencies: kit3 }) });
    expect(svelteFix(hit("src/routes/+page.svelte"), web(mapped))).toBe(MOTION_FIX.replace("$lib/design/motion", "#lib/design/motion"));
    expect(svelteFix(hit("src/routes/+page.svelte"), web(unmapped))).toBe(MOTION_FIX.replace("$lib/design/motion", "../lib/design/motion"));
  });

  test("kit.files.lib names another folder: $lib reaches motion.ts there", () => {
    const kit = makeProject({
      "package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.70.0", svelte: "^5.0.0" } }),
      "svelte.config.js": "export default { kit: { files: { lib: 'src/shared' } } };\n",
    });
    expect(svelteFix(hit("src/routes/+page.svelte"), { appDir: kit, appPath: ".", motionImport: "src/shared/design/motion" })).toBe(MOTION_FIX);
  });

  test("an app in a folder of the project: the file's path is the project's, the motion path the app's", () => {
    const vite = makeProject({ "web/package.json": JSON.stringify({ devDependencies: { svelte: "^5.0.0" } }) });
    expect(svelteFix(hit("web/src/lib/Counter.svelte"), { appDir: `${vite}/web`, appPath: "web", motionImport: "src/lib/design/motion" })).toContain("from ./design/motion and");
  });
});

describe("reduced motion", () => {
  const views = (files: Record<string, string>) =>
    Object.entries(files).flatMap(([p, t]) => SVELTE.views!({ ...sfc(t, p), lang: p.endsWith(".svelte") ? "markup" : p.endsWith(".css") ? "css" : "script" }));
  const run = (files: Record<string, string>, generated: Record<string, string> = {}) => svelteReducedMotionHits(views(files), views(generated));
  const found = (hits: Hit[]) => hits.map((h) => `${h.file}:${h.line}:${h.column} ${h.text}`);

  test("a transition: directive with nothing that respects the setting is reported once, at the first directive", () => {
    const a = "<script>let on = $state(true);</script>\n{#if on}\n  <p transition:fade>a</p>\n{/if}\n<p in:fly={{ y: 8 }}>b</p>";
    expect(found(run({ "src/A.svelte": a }))).toEqual(["src/A.svelte:3:3 motion"]);
  });

  test("prefersReducedMotion from svelte/motion (or a matchMedia query) anywhere in the app respects it", () => {
    const a = "<p transition:fade>a</p>";
    for (const script of ['import { prefersReducedMotion } from "svelte/motion";', 'const r = matchMedia("(prefers-reduced-motion: reduce)").matches;']) {
      expect(run({ "src/A.svelte": a, "src/lib/pref.ts": script })).toEqual([]);
    }
  });

  test("Spring, Tween and Motion's animate() are animations too", () => {
    expect(found(run({ "src/A.svelte": '<script>import { Spring } from "svelte/motion";\nconst s = new Spring(0);</script>' }))).toEqual(["src/A.svelte:1:9 motion"]);
    expect(found(run({ "src/A.svelte": '<script>\nimport { animate } from "motion";\n</script>' }))).toEqual(["src/A.svelte:2:20 motion"]);
    expect(run({ "src/A.svelte": '<script>import { prefersReducedMotion, Tween } from "svelte/motion";</script>' })).toEqual([]);
    expect(run({ "src/A.svelte": '<script>import { prefersReducedMotion } from "svelte/motion";</script>\n<p>hi</p>' })).toEqual([]);
  });

  test("the split: a CSS query doesn't cover a transition: directive, and prefersReducedMotion doesn't cover CSS animations", () => {
    const query = "@media (prefers-reduced-motion: reduce) { * { animation: none } }";
    expect(run({ "src/A.svelte": `<p transition:fade>a</p>\n<style>${query}</style>` })).toHaveLength(1);
    const css = "<p>a</p>\n<style>\n  .a { transition: opacity 0.2s }\n</style>";
    expect(found(run({ "src/A.svelte": css }))).toEqual(["src/A.svelte:3:8 animation"]);
    expect(run({ "src/A.svelte": css, "src/lib/pref.ts": 'import { prefersReducedMotion } from "svelte/motion";' })).toHaveLength(1);
    expect(run({ "src/A.svelte": css }, { "src/lib/styles/motif.css": query })).toEqual([]);
    expect(run({ "src/A.svelte": '<p class="transition-colors">a</p>' })).toHaveLength(1);
  });

  test("a tag with a > inside a {…} value is still read as a tag, and prose with in: or out: is not an animation", () => {
    expect(run({ "src/A.svelte": "<p>a</p>\n<div class:big={a > b}\n  in:fade>x</div>" })).toHaveLength(1);
    expect(run({ "src/A.svelte": "<p>Check in:out: transition: here</p>" })).toEqual([]);
  });

  test("the fix: prefersReducedMotion with motion.ts (Svelte 5), a matchMedia query without it (before Svelte 5)", () => {
    const [hit] = run({ "src/A.svelte": "<p transition:fade>a</p>" });
    const appDir = makeProject({ "package.json": JSON.stringify({ devDependencies: { svelte: "^4.2.0" } }) });
    expect(svelteFix(hit!, { appDir, appPath: ".", motionImport: "src/lib/design/motion" })).toBe(hit!.fix);
    expect(hit!.fix).toContain("prefersReducedMotion");
    expect(svelteFix(hit!, { appDir, appPath: "." })).toBe(
      "Check window.matchMedia('(prefers-reduced-motion: reduce)').matches in the script, and skip or shorten them when it is true (a duration of 0).",
    );
    const [css] = run({ "src/A.svelte": "<p>a</p>\n<style>.a { transition: opacity 0.2s }</style>" });
    expect(svelteFix(css!, { appDir, appPath: "." })).toBe(css!.fix);
  });

  test("animations inside a comment are not animations", () => {
    expect(run({ "src/A.svelte": '<!-- <p transition:fade>a</p> -->\n<script>// import { animate } from "motion";\n</script>' })).toEqual([]);
  });
});
