import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { scanValues } from "../src/check/rules/values";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const scale = buildScale(buildTheme(docFrom(validTokens())), "src");
const file = (path: string, text: string): SourceFile => ({ path, abs: path, text, lang: path.endsWith(".css") ? "css" : "script" });
const found = (path: string, text: string, s: typeof scale | null = scale) =>
  scanValues(file(path, text), s).filter((h) => h.violation).map((h) => [h.rule, h.kind, h.value]);

describe("CSS declarations", () => {
  test("spacing off the scale; 0, auto and scale values are fine", () => {
    expect(found("a.css", ".a { padding: 13px 16px; margin: 0 auto; gap: 1rem; }")).toEqual([["off-scale", "space", "13px"]]);
  });
  test("radius and font size", () => {
    expect(found("a.css", ".a { border-radius: 6px; font-size: 15px; } .b { border-radius: 8px; font-size: 16px; }")).toEqual([
      ["off-scale", "radius", "6px"],
      ["off-scale", "font-size", "15px"],
    ]);
  });
  test("font families", () => {
    expect(found("a.css", ".a { font-family: 'Comic Sans MS', cursive; } .b { font-family: var(--motif-font-body-family); }")).toEqual([
      ["raw-font", "font-family", "'Comic Sans MS', cursive"],
    ]);
  });
  test("transitions with literal timing and easing; Motif variables are fine", () => {
    expect(found("a.css", ".a { transition: opacity 300ms ease-in-out; } .b { transition: opacity var(--motif-duration-fast) var(--motif-easing-standard); } .c { transition: none 0s; }")).toEqual([
      ["raw-motion", "duration", "300ms"],
      ["raw-motion", "easing", "ease-in-out"],
    ]);
  });
  test("custom properties are not checked here", () => {
    expect(found("a.css", ":root { --gap: 13px; }")).toEqual([]);
  });
  test("primitives used directly", () => {
    expect(found("a.css", ".a { color: var(--motif-primitive-color-gray-50); }")).toEqual([["primitive-use", undefined, undefined]]);
  });
});

describe("scripts", () => {
  test("style objects", () => {
    expect(found("a.tsx", '<div style={{ padding: 13, marginTop: 16, fontSize: "15px", borderRadius: 8, fontFamily: "Comic Sans" }} />')).toEqual([
      ["off-scale", "space", "13px"],
      ["off-scale", "font-size", "15px"],
      ["raw-font", "font-family", "Comic Sans"],
    ]);
  });
  test("Motion timing in files that import Motion", () => {
    const text = 'import { motion } from "motion/react";\n<motion.div transition={{ duration: 0.3, ease: "easeOut", type: "spring", stiffness: 300 }} />';
    expect(found("a.tsx", text)).toEqual([
      ["raw-motion", "duration", "300ms"],
      ["raw-motion", "easing", '"easeOut"'],
      ["raw-motion", "spring", "stiffness 300"],
    ]);
  });
  test("the same keys without a Motion import are not motion", () => {
    expect(found("a.ts", "const job = { duration: 0.3, ease: 'linear' };")).toEqual([]);
  });
  test("primitive tokens read in code", () => {
    expect(found("a.ts", "const c = tokens.primitive.color.gray;")).toEqual([["primitive-use", undefined, undefined]]);
  });
});

describe("without a scale (extract)", () => {
  test("values are reported but aren't violations", () => {
    const hits = scanValues(file("a.css", ".a { padding: 13px; }"), null);
    expect(hits.map((h) => [h.kind, h.value, h.violation])).toEqual([["space", "13px", false]]);
  });
});
