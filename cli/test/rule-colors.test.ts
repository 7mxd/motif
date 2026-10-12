import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { colorContext, scanColors } from "../src/check/rules/colors";

const file = (path: string, text: string): SourceFile => ({
  path, abs: path, text, lang: path.endsWith(".css") ? "css" : "script",
});
const values = (path: string, text: string) => scanColors(file(path, text)).map((h) => [h.value, h.context]);

describe("raw-color in CSS", () => {
  test("hex colour with its line and column", () => {
    const [hit] = scanColors(file("a.css", ".btn {\n  color: #3B82F6;\n}"));
    expect(hit).toMatchObject({ rule: "raw-color", value: "#3B82F6", context: "text", line: 2, column: 10, violation: true, kind: "color" });
  });
  test("id selectors are not colours", () => {
    expect(values("a.css", "#abc { padding: 0 }\n#fade:hover { opacity: 1 }")).toEqual([]);
  });
  test("colour functions and named colours, with context", () => {
    expect(values("a.css", "a { background: rgb(0 0 0 / 0.5); border: 1px solid red; }")).toEqual([
      ["rgb(0 0 0 / 0.5)", "background"],
      ["red", "border"],
    ]);
  });
  test("keywords and Motif variables are fine", () => {
    expect(values("a.css", "a { color: transparent; fill: currentColor; color: var(--motif-color-text-primary); }")).toEqual([]);
  });
  test("custom properties holding raw colours are flagged; Motif's own are not", () => {
    expect(values("a.css", ":root { --brand: #ff0000; --motif-color-x: #000; }")).toEqual([["#ff0000", "other"]]);
  });
  test("Windows line endings keep positions right", () => {
    const [hit] = scanColors(file("a.css", "a {\r\n  color: #fff;\r\n}"));
    expect([hit!.line, hit!.column]).toEqual([2, 10]);
  });
});

describe("raw-color in scripts", () => {
  test("style objects: hex and named colours", () => {
    expect(values("a.tsx", '<p style={{ color: "#fff", backgroundColor: "white" }} />')).toEqual([
      ["#fff", "text"],
      ["white", "background"],
    ]);
  });
  test("colour functions in strings", () => {
    expect(values("a.tsx", 'const shadow = "0 1px 2px rgba(0, 0, 0, 0.1)";')).toEqual([["rgba(0, 0, 0, 0.1)", "other"]]);
  });
  test("Tailwind arbitrary values are left to tailwind-arbitrary", () => {
    expect(values("a.tsx", '<p className="bg-[#fff] text-[rgb(1,2,3)]" />')).toEqual([]);
  });
  test("private class members are not colours", () => {
    expect(values("a.ts", "class A {\n  #add() {}\n  #abc = 1;\n  run() { this.#add(); }\n}")).toEqual([]);
  });
  test("a plain string constant is still a raw colour", () => {
    expect(values("a.ts", 'export const brand = "#3b82f6";')).toEqual([["#3b82f6", "other"]]);
  });
});

describe("colorContext", () => {
  test.each([
    ["color", "text"], ["fill", "text"], ["background-color", "background"], ["backgroundColor", "background"],
    ["border-top-color", "border"], ["outline", "border"], ["box-shadow", "other"],
  ])("%s → %s", (prop, ctx) => {
    expect(colorContext(prop)).toBe(ctx as any);
  });
});
