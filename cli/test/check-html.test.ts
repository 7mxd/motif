import { afterAll, describe, expect, test } from "bun:test";
import { listSourceFiles, type SourceFile } from "../src/check/files";
import { expandHtml, htmlViews } from "../src/check/html";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
const page = (text: string): SourceFile => ({ path: "public/index.html", abs: "/x/public/index.html", text, lang: "markup" });
const hitsOf = (text: string) => expandHtml([page(text)]).flatMap((f) => scanFile(f, scale, { tailwind: false }));
/** Line and column (1-based) of the first occurrence of needle. */
const at = (text: string, needle: string) => {
  const i = text.indexOf(needle);
  return { line: text.slice(0, i).split("\n").length, column: i - text.lastIndexOf("\n", i - 1) };
};

const PAGE = [
  "<!doctype html>",
  '<meta name="theme-color" content="#000000">',
  '<STYLE media="screen">',
  "  :root { --bg: #f2f2f7; }",
  "  .card { padding: 13px; color: var(--text); }",
  "  /* .old { color: #123456; } */",
  "</STYLE>",
  '<p style="color: #d70015; margin: 7px">Hi</p>',
  '<!-- <p style="color: #abcdef">old</p> -->',
  `<div data-style="x" data-label="Room #101" title="a > b" style='background: rgb(1 2 3)'></div>`,
  "<script>",
  '  const accent = "#2959ae";',
  "  const markup = 'style=\"color: #aaaaaa\"';",
  "</script>",
  '<p class="p-7 text-gray-500">Plain class names</p>',
].join("\n");

describe("the CSS inside an HTML page", () => {
  test("is read as CSS where it is: <style> blocks and style=\"\" attributes, at exact positions", () => {
    const hits = hitsOf(PAGE);
    const colours = hits.filter((h) => h.rule === "raw-color").map((h) => h.text);
    expect(colours.sort()).toEqual(["#2959ae", "#aaaaaa", "#d70015", "#f2f2f7", "rgb(1 2 3)"].sort());
    for (const needle of ["#f2f2f7", "#d70015", "rgb(1 2 3)", "#2959ae"]) {
      expect(hits.find((h) => h.text === needle)).toMatchObject(at(PAGE, needle));
    }
    const offScale = hits.filter((h) => h.rule === "off-scale").map((h) => [h.text, h.line]);
    expect(offScale).toEqual([["13px", 5], ["7px", 8]]);
  });

  test("leaves out comments, the theme-color tag, prose and look-alike attributes, and counts nothing twice", () => {
    const texts = hitsOf(PAGE).map((h) => h.text);
    for (const absent of ["#000000", "#123456", "#abcdef", "#101"]) expect(texts).not.toContain(absent);
    expect(new Set(hitsOf(PAGE).map((h) => `${h.rule}|${h.line}|${h.column}`)).size).toBe(hitsOf(PAGE).length);
  });

  test("class names in a plain page aren't Tailwind", () => {
    expect(hitsOf(PAGE).filter((h) => h.rule.startsWith("tailwind"))).toEqual([]);
  });

  test("both views keep the file's length and line breaks; an attribute's quotes become semicolons", () => {
    const html = '<p style="a:b">\n<i>';
    const { css, rest } = htmlViews(html);
    expect(css).toBe('         ;a:b; \n   ');
    expect(rest).toBe('<p style="   ">\n<i>');
    const big = htmlViews(PAGE);
    expect(big.css.length).toBe(PAGE.length);
    expect(big.rest.split("\n").length).toBe(PAGE.split("\n").length);
  });

  test("an unclosed <style> is read to the end, without failing", () => {
    expect(hitsOf("<style>\na { color: red").map((h) => h.text)).toEqual(["red"]);
  });

  test("other files pass through, and .htm counts as HTML", () => {
    const css: SourceFile = { path: "a.css", abs: "/a.css", text: "a{color:red}", lang: "css" };
    expect(expandHtml([css])).toEqual([css]);
    const root = makeProject({ "old.htm": "<p style=\"color: #c0ffee\"></p>" });
    const files = expandHtml(listSourceFiles(root, "."));
    expect(files.map((f) => [f.path, f.lang])).toEqual([["old.htm", "css"], ["old.htm", "markup"]]);
  });
});

describe("htmlViews: from the backlog", () => {
  test("script text never starts a comment or a style block; a <style-guide> element isn't <style>; old <!-- --> inside <style> still counts as CSS", () => {
    const html = '<script>const s = "<!-- not a comment"; const t = \'<style>\';</script><style>.a { color: #ff0000 }</style><style-guide tone="x"></style-guide><style><!-- .b { color: #00ff00 } --></style>';
    const css = htmlViews(html).css;
    expect(css).toContain(".a { color: #ff0000 }");
    expect(css).toContain(".b { color: #00ff00 }");
    expect(css).not.toContain("tone");
  });

  test("entities in style attributes are read as their characters; a mask-icon's colour is exempt like theme-color", () => {
    const hits = expandHtml([page('<div style="font-family: &quot;Comic Sans&quot;"></div><link rel="mask-icon" href="x.svg" color="#5bbad5">')]).flatMap((f) => scanFile(f, scale, { tailwind: false }));
    expect(hits.filter((h) => h.violation).map((h) => [h.rule, h.value])).toEqual([["raw-font", '"Comic Sans"']]);
  });
});

describe("htmlViews: from the deferred review", () => {
  test('a ">" inside a <style> tag\'s media attribute doesn\'t end the tag', () => {
    const html = '<style media="(width >= 600px) and (prefers-color-scheme: dark)">.a { color: #111111 }</style>';
    const { css, dark } = htmlViews(html);
    expect(css).not.toContain("600px");
    expect(dark).toEqual([[html.indexOf(".a"), html.indexOf("</style>")]]);
  });

  test("a <style> for anything but dark isn't dark: not all and (prefers-color-scheme: dark)", () => {
    expect(htmlViews('<style media="not all and (prefers-color-scheme: dark)">.a { color: #111111 }</style>').dark).toEqual([]);
  });

  test("a custom element like <script-loader> isn't a script", () => {
    const css = htmlViews('<script-loader src="x.js"></script-loader><div style="color: #ff0000"></div>').css;
    expect(css).toContain("color: #ff0000");
  });

  test("CDATA markers in an SVG's <style> aren't CSS, and what a CDATA section holds starts nothing", () => {
    const css = htmlViews('<svg><style><![CDATA[ .a { fill: #ffffff } ]]></style><text><![CDATA[ a <!-- b ]]></text></svg><div style="color: #00ff00"></div>').css;
    expect(css).toContain(".a { fill: #ffffff }");
    expect(css).not.toMatch(/CDATA|\]\]>/);
    expect(css).toContain("color: #00ff00");
  });

  test("hex entities and the upper-case &QUOT; in style attributes are read as their characters", () => {
    const fonts = (html: string) => expandHtml([page(html)]).flatMap((f) => scanFile(f, scale, { tailwind: false })).filter((h) => h.rule === "raw-font").map((h) => h.value);
    expect(fonts('<div style="font-family: &#x27;Comic Sans&#x27;"></div>')).toEqual(["'Comic Sans'"]);
    expect(fonts('<div style="font-family: &QUOT;Comic Sans&QUOT;"></div>')).toEqual(['"Comic Sans"']);
  });
});
