import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { scanTailwindScale } from "../src/check/rules/tailwind-scale";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const scale = buildScale(buildTheme(docFrom(validTokens())), "src");
const file = (text: string): SourceFile => ({ path: "a.tsx", abs: "a.tsx", text, lang: "script" });
const violations = (text: string, s = scale) =>
  scanTailwindScale(file(`<div className="${text}" />`), s).filter((h) => h.violation).map((h) => [h.rule, h.kind, h.value]);

describe("scanTailwindScale", () => {
  test("spacing classes on the scale are fine", () => {
    expect(violations("p-4 m-0 gap-2 -mt-3 px-16")).toEqual([]);
  });
  test("spacing classes off the scale", () => {
    expect(violations("p-7 m-px gap-2.5")).toEqual([
      ["off-scale", "space", "28px"],
      ["off-scale", "space", "1px"],
      ["off-scale", "space", "10px"],
    ]);
  });
  test("radius, text size and shadow keys that aren't roles", () => {
    expect(violations("rounded-md rounded-xl rounded-t-lg text-sm text-body shadow-md shadow-xl")).toEqual([
      ["off-scale", "radius", "xl"],
      ["off-scale", "font-size", "sm"],
      ["off-scale", "shadow", "xl"],
    ]);
  });
  test("motion and font classes", () => {
    expect(violations("duration-200 delay-75 ease-in-out ease-standard font-sans font-body")).toEqual([
      ["raw-motion", "duration", "200ms"],
      ["raw-motion", "duration", "75ms"],
      ["raw-motion", "easing", "in-out"],
      ["raw-font", "font-family", "sans"],
    ]);
  });
  test("custom roles count as on the scale", () => {
    const t = validTokens();
    t.space["18"] = { $value: { value: 72, unit: "px" } };
    expect(violations("p-18", buildScale(buildTheme(docFrom(t)), "src"))).toEqual([]);
  });
  test("without a scale, values are still reported for extract but aren't violations", () => {
    const hits = scanTailwindScale(file('<div className="p-7 duration-200" />'), null);
    expect(hits.map((h) => [h.value, h.violation])).toEqual([["28px", false], ["200ms", true]]);
  });
});

describe("comments (scale)", () => {
  test("class names in comments are not findings", () => {
    expect(violations("x").length).toBe(0);
    expect(scanTailwindScale(file("// was p-7 and duration-200\nexport const A = 1;"), scale)).toEqual([]);
  });
});

describe("scanTailwindScale: from the backlog", () => {
  test("linear easing and a duration on something that spins or pulses are allowed; on a transition they aren't", () => {
    expect(violations("animate-spin ease-linear duration-700")).toEqual([]);
    expect(violations("transition ease-linear")).toEqual([["raw-motion", "easing", "linear"]]);
  });
});
