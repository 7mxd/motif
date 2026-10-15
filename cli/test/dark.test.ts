import { describe, expect, test } from "bun:test";
import { darkRanges } from "../src/check/dark";
import type { SourceFile } from "../src/check/files";
import { inRanges } from "../src/check/mask";
import { scanColors } from "../src/check/rules/colors";

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
