import { afterAll, describe, expect, test } from "bun:test";
import { runCheck } from "../src/commands/check";
import type { ExceptionHit } from "../src/check/run";
import type { Hit } from "../src/check/types";
import { buildTheme, buildThemeSet } from "../src/generate/theme";
import { motifCss } from "../src/stacks/react-web/generate";
import { docFrom, twoVariantTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const theme = buildTheme(docFrom(validTokens()));
const site = (files: Record<string, string>) => makeProject({ "design/tokens.json": JSON.stringify(validTokens()), ...files });
type Result = { violations: Hit[]; exceptions: ExceptionHit[]; warnings: Hit[]; summary: { files: number } };
const check = async (root: string) => {
  const r = await runCheck(root, { positionals: [] });
  return { code: r.exitCode, text: r.text, ...(r.data as Result) };
};

describe("motif check on a plain web site", () => {
  test("reads CSS in <style> and style=\"\" with exact lines; class names aren't Tailwind; fixes speak plain CSS", async () => {
    const r = await check(site({
      "public/index.html": [
        "<!doctype html>",
        "<html><head><style>",
        "  .card { color: #c0ffee; }",
        "</style></head>",
        '<body><p class="p-7 text-gray-500" style="margin: 7px">Hi</p></body></html>',
      ].join("\n"),
    }));
    expect(r.violations.map((v) => [v.rule, v.text, v.file, v.line])).toEqual([
      ["raw-color", "#c0ffee", "public/index.html", 3],
      ["off-scale", "7px", "public/index.html", 5],
    ]);
    expect(r.violations[0]!.fix).toContain("var(--motif-color-");
    expect(r.violations[0]!.fix).not.toContain("class");
    expect(r.summary.files).toBe(1);
  });

  test("the page's own variables, defined from roles, are theme values; one set to a literal isn't", async () => {
    const r = await check(site({
      "public/index.html": [
        "<style>",
        ":root { --bg: var(--motif-color-background); --muted: #6c6c70; }",
        "body { background: var(--bg); color: var(--muted); }",
        "</style>",
      ].join("\n"),
    }));
    expect(r.violations.map((v) => [v.rule, v.text, v.line])).toEqual([["raw-color", "#6c6c70", 2]]);
  });

  test("motif-ok in an HTML comment allows a value, with its reason", async () => {
    const r = await check(site({
      "public/index.html": "<!-- motif-ok: card colours are the user's own data -->\n<div style=\"background: #C9D5B8\"></div>\n",
    }));
    expect(r.violations).toEqual([]);
    expect(r.exceptions.map((e) => [e.text, e.reason])).toEqual([["#C9D5B8", "card colours are the user's own data"]]);
  });

  test("reduced motion: reported until the generated motif.css is there; editing that file by hand is reported", async () => {
    const PAGE = "<style>button { transition: opacity var(--motif-duration-fast) var(--motif-easing-standard); }</style>\n";
    const bare = await check(site({ "public/index.html": PAGE }));
    expect(bare.violations.map((v) => v.rule)).toEqual(["reduced-motion"]);

    const linked = await check(site({ "public/index.html": PAGE, "public/motif.css": motifCss(theme) }));
    expect(linked.violations).toEqual([]);
    expect(linked.warnings).toEqual([]);

    const edited = await check(site({ "public/index.html": PAGE, "public/motif.css": `${motifCss(theme)}\n.x { color: red; }\n` }));
    expect(edited.violations).toEqual([]);
    expect(edited.warnings.map((w) => [w.rule, w.file])).toEqual([["generated-edited", "public/motif.css"]]);
  });

  test("a site at the root: its motif.css is at the root", async () => {
    const r = await check(site({ "index.html": "<p></p>", "motif.css": `${motifCss(theme)}/* edited */\n` }));
    expect(r.warnings.map((w) => w.file)).toEqual(["motif.css"]);
  });

  test("names both stacks it reads when it can't read an app", async () => {
    const r = await check(site({ "package.json": JSON.stringify({ dependencies: { svelte: "^5" } }), "src/App.svelte": "" }));
    expect(r.code).toBe(2);
    expect(r.text).toContain("React web apps and plain web sites");
  });
});

describe("variables with digits in their names (final review)", () => {
  test("a literal colour in --surface-2 or --gray-100 is found, and named", async () => {
    const r = await check(site({ "public/index.html": "<style>\n:root { --surface-2: #e5e5ea; --gray-100: #f5f5f5; }\n</style>\n" }));
    expect(r.violations.map((v) => [v.rule, v.text, v.prop])).toEqual([["raw-color", "#e5e5ea", "--surface-2"], ["raw-color", "#f5f5f5", "--gray-100"]]);
  });

  test("spacing variables with digits don't become spacing hits", async () => {
    const r = await check(site({ "public/index.html": "<style>\n:root { --space-2: 7px; }\n</style>\n" }));
    expect(r.violations).toEqual([]);
  });
});

describe("what motif check reads on a plain web site (xBloom re-check)", () => {
  test("only the site folder: server code beside it isn't the site", async () => {
    const r = await check(site({
      "public/index.html": "<!doctype html><p>Hi</p>",
      "lib/xbloom.js": 'export const DEFAULT_CARD = "#C9D5B8";',
      "server.js": 'const ERROR = "#ff0000";',
    }));
    expect(r.violations).toEqual([]);
    expect(r.summary.files).toBe(1);
  });

  test("a motif.css generated from a guide with variants isn't reported as edited", async () => {
    const tokens = twoVariantTokens();
    const set = buildThemeSet(docFrom(tokens));
    const PAGE = "<style>button { transition: opacity var(--motif-duration-fast) var(--motif-easing-standard); }</style>\n";
    const root = makeProject({ "design/tokens.json": JSON.stringify(tokens), "public/index.html": PAGE, "public/motif.css": motifCss(set.base, set.variants) });
    const r = await check(root);
    expect(r.violations).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
