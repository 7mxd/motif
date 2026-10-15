import { afterAll, describe, expect, test } from "bun:test";
import { runCheck } from "../src/commands/check";
import type { ExceptionHit } from "../src/check/run";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { motifCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";
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
    const r = await check(site({ "package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "src/App.vue": "" }));
    expect(r.code).toBe(2);
    expect(r.text).toContain("React web apps and plain web sites");
  });
});
