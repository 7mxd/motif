import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { scanTailwind } from "../src/check/rules/tailwind";

const file = (path: string, text: string): SourceFile => ({ path, abs: path, text, lang: path.endsWith(".css") ? "css" : "script" });
const scan = (path: string, text: string) => scanTailwind(file(path, text), null).map((h) => [h.rule, h.kind, h.value, h.context ?? null]);

describe("tailwind-arbitrary", () => {
  test("colours, spacing, radius, shadow and text size", () => {
    expect(scan("a.tsx", '<div className="bg-[#1a2b3c] hover:text-[rgb(1,2,3)] p-[13px] md:-mt-[0.5rem] rounded-[6px] shadow-[0_1px_2px_#000] text-[15px]" />')).toEqual([
      ["tailwind-arbitrary", "color", "#1a2b3c", "background"],
      ["tailwind-arbitrary", "color", "rgb(1,2,3)", "text"],
      ["tailwind-arbitrary", "space", "13px", null],
      ["tailwind-arbitrary", "space", "8px", null],
      ["tailwind-arbitrary", "radius", "6px", null],
      ["tailwind-arbitrary", "shadow", "0_1px_2px_#000", null],
      ["tailwind-arbitrary", "font-size", "15px", null],
    ]);
  });
  test("Motif variables inside brackets are fine", () => {
    expect(scan("a.tsx", '<div className="bg-[var(--motif-color-surface)] p-[--motif-space-4]" />')).toEqual([]);
  });
  test("motion and font arbitrary values belong to raw-motion and raw-font", () => {
    expect(scan("a.tsx", "<div className=\"duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] font-['Comic_Sans']\" />")).toEqual([
      ["raw-motion", "duration", "250ms", null],
      ["raw-motion", "easing", "cubic-bezier(0.4,0,0.2,1)", null],
      ["raw-font", "font-family", "'Comic_Sans'", null],
    ]);
  });
});

describe("tailwind-palette", () => {
  test("default palette colours, with context", () => {
    expect(scan("a.tsx", '<a className="bg-blue-500 text-white border-gray-200/50 hover:ring-indigo-600" />')).toEqual([
      ["tailwind-palette", "color", "blue-500", "background"],
      ["tailwind-palette", "color", "white", "text"],
      ["tailwind-palette", "color", "gray-200", "border"],
      ["tailwind-palette", "color", "indigo-600", "border"],
    ]);
  });
  test("theme colour classes are fine", () => {
    expect(scan("a.tsx", '<a className="bg-action-primary text-text-secondary border-border" />')).toEqual([]);
  });
});

describe("class names built at runtime", () => {
  test("template fragments and clsx objects don't produce made-up findings", () => {
    const text = 'const a = `bg-${tone}-500 p-${size}`;\nconst b = clsx({ "p-4": on, "bg-[#fff]": off });';
    expect(scan("a.tsx", text)).toEqual([["tailwind-arbitrary", "color", "#fff", "background"]]);
  });
});

describe("CSS @apply", () => {
  test("only @apply bodies are scanned, with correct positions", () => {
    const hits = scanTailwind(file("a.css", ".btn {\n  color: red;\n  @apply bg-blue-500 p-[3px];\n}"), null);
    expect(hits.map((h) => [h.rule, h.value, h.line, h.column])).toEqual([
      ["tailwind-palette", "blue-500", 3, 10],
      ["tailwind-arbitrary", "3px", 3, 22],
    ]);
  });
});
