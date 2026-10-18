import { describe, expect, test } from "bun:test";
import { darkRanges, isDarkSelector } from "../src/check/dark";
import type { SourceFile } from "../src/check/files";
import { inRanges } from "../src/check/mask";
import { scanColors } from "../src/check/rules/colors";
import { expandHtml } from "../src/check/html";

const CSS = [
  ":root { --bg: #f2f2f7; }",
  "@media (prefers-color-scheme: dark) {",
  "  :root:not([data-theme=light]) { --bg: #000000; }",
  "}",
  ':root[data-theme="dark"] { --bg: #111111; }',
  "html.dark .card { color: #222222; }",
  ".dark-mode { color: #333333; }",
  "@media (prefers-color-scheme: light) { :root { --bg: #fafafa; } }",
  "@media (min-width: 600px) { [data-mode=dark] a { color: #444444 } }",
  "[data-theme=light] { --bg: #555555; }",
].join("\n");

const file = (text: string): SourceFile => ({ path: "a.css", abs: "/a.css", text, lang: "css" });

describe("dark-mode blocks", () => {
  test("found however they're written, and look-alikes left out", () => {
    const ranges = darkRanges(CSS);
    const isDark = (needle: string) => inRanges(CSS.indexOf(needle), ranges);
    for (const dark of ["#000000", "#111111", "#222222", "#444444"]) expect(isDark(dark)).toBe(true);
    for (const light of ["#f2f2f7", "#333333", "#fafafa", "#555555"]) expect(isDark(light)).toBe(false);
  });

  test("colour hits in CSS say whether they're dark, and which variable they set", () => {
    const hits = scanColors(file(CSS));
    const byText = Object.fromEntries(hits.map((h) => [h.text, { prop: h.prop, scheme: h.scheme }]));
    expect(byText["#f2f2f7"]).toEqual({ prop: "--bg", scheme: undefined });
    expect(byText["#000000"]).toEqual({ prop: "--bg", scheme: "dark" });
    expect(byText["#222222"]).toEqual({ prop: undefined, scheme: "dark" });
    expect(byText["#333333"]).toEqual({ prop: undefined, scheme: undefined });
  });

  test("nothing changes for scripts, and an unclosed block runs to the end", () => {
    const script: SourceFile = { path: "a.ts", abs: "/a.ts", text: 'const c = "#123456";', lang: "script" };
    expect(scanColors(script).map((h) => [h.prop, h.scheme])).toEqual([[undefined, undefined]]);
    expect(darkRanges(".dark { color: #000")).toEqual([[6, 19]]);
  });
});

describe("darkRanges: from the backlog", () => {
  const darkValues = (css: string) => {
    const ranges = darkRanges(css);
    return [...css.matchAll(/#[0-9a-f]{3,6}/gi)].filter((m) => inRanges(m.index!, ranges)).map((m) => m[0]);
  };

  test("a selector that excludes dark, or lists light and dark together, isn't dark; @media not … dark isn't either", () => {
    expect(darkValues(":root:not(.dark) { --bg: #fff } :root:not([data-theme=dark]) { --a: #eee } .card, .dark .card { color: #111 } @media not (prefers-color-scheme: dark) { .a { color: #222 } }")).toEqual([]);
  });

  test("Bootstrap's and GitHub's dark attributes, and light-dark()'s second colour, are dark", () => {
    expect(darkValues('[data-bs-theme="dark"] { --bg: #000 } [data-color-mode=dark] { --fg: #fafafa } .a { color: light-dark(#111, #eee) }')).toEqual(["#000", "#fafafa", "#eee"]);
  });

  test("a <style> for dark mode only is dark", () => {
    const [cssView] = expandHtml([{ path: "index.html", abs: "", lang: "markup", text: '<style media="(prefers-color-scheme: dark)">.a { color: #abcabc }</style><style>.b { color: #defdef }</style>' }]);
    expect(scanColors(cssView!).map((h) => [h.value, h.scheme ?? "light"])).toEqual([["#abcabc", "dark"], ["#defdef", "light"]]);
  });
});

describe("dark selector lists (review of batch C2)", () => {
  test("a list of dark names is dark; one plain item makes the rule apply in both", () => {
    for (const sel of [".dark, .dark-mode", '[data-theme="dark"], .theme-dark', ":root.dark, :root.night"]) expect(isDarkSelector(sel)).toBe(true);
    for (const sel of [".card, .dark .card", ".dark-mode", ".night"]) expect(isDarkSelector(sel)).toBe(false);
  });
});
