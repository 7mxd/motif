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

describe("font-mono and the optional mono role (backlog)", () => {
  test("a text size's fix doesn't offer the mono role for prose (review of batch D)", () => {
    const t = validTokens();
    t.font.mono = { $value: { fontFamily: ["ui-monospace", "monospace"], fontSize: { value: 14, unit: "px" }, fontWeight: 400, lineHeight: 1.5 } };
    const [hit] = scanTailwindScale(file('<p className="text-sm" />'), buildScale(buildTheme(docFrom(t)), "src")).filter((h) => h.violation);
    expect(hit!.fix).not.toContain("text-mono");
  });
  test("font-mono is the mono role when the theme has one; without it, the fix says how to add one", () => {
    const t = validTokens();
    t.font.mono = { $value: { fontFamily: ["ui-monospace", "monospace"], fontSize: { value: 14, unit: "px" }, fontWeight: 400, lineHeight: 1.5 } };
    expect(violations("font-mono", buildScale(buildTheme(docFrom(t)), "src"))).toEqual([]);
    const hits = scanTailwindScale(file('<div className="font-mono" />'), scale).filter((h) => h.violation);
    expect(hits.map((h) => h.fix)).toEqual([expect.stringContaining("font.mono")]);
  });
});

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

  test("the spinner is seen across the strings of one cn() call, on one line or several (deferred review)", () => {
    const found = (text: string) => scanTailwindScale(file(text), scale).filter((h) => h.violation).map((h) => h.text);
    expect(found('<Loader className={cn("size-4", "animate-spin ease-linear duration-700")} />')).toEqual([]);
    expect(found('<Loader className={cn("animate-spin", "ease-linear duration-700")} />')).toEqual([]);
    expect(found('<Loader className={cn(\n  "animate-spin",\n  "ease-linear duration-700",\n)} />')).toEqual([]);
    // Another element's classes on the line are another list.
    expect(found('<i className="animate-spin" /><b className="ease-linear" />')).toEqual(["ease-linear"]);
  });

  test("a transition's timings next to a spinner are still checked (deferred review)", () => {
    expect(violations("animate-pulse transition-colors duration-200 ease-linear")).toEqual([
      ["raw-motion", "duration", "200ms"],
      ["raw-motion", "easing", "linear"],
    ]);
  });
});
