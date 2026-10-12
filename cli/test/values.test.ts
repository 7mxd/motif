import { describe, expect, test } from "bun:test";
import { durationToMs, validateValue } from "../src/contract/values";

const px = (value: number) => ({ value, unit: "px" });
const black = { colorSpace: "srgb", components: [0, 0, 0] };

describe("validateValue", () => {
  test.each([
    ["color", { colorSpace: "srgb", components: [1, 0.5, 0], alpha: 1, hex: "#FF8000" }],
    ["color", { colorSpace: "oklch", components: [0.7, 0.1, "none"] }],
    ["dimension", px(16)],
    ["dimension", { value: 1.5, unit: "rem" }],
    ["duration", { value: 200, unit: "ms" }],
    ["duration", { value: 0.4, unit: "s" }],
    ["cubicBezier", [0.2, 0, 0, 1]],
    ["cubicBezier", [0.3, -0.5, 0.7, 1.5]],
    ["number", -0.5],
    ["fontFamily", "Inter"],
    ["fontFamily", ["Inter", "sans-serif"]],
    ["fontWeight", 600],
    ["fontWeight", "semi-bold"],
    ["shadow", { color: black, offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) }],
    ["shadow", [{ color: black, offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0), inset: true }]],
    ["typography", { fontFamily: "Inter", fontSize: px(16), fontWeight: 400, lineHeight: 1.5 }],
    ["typography", { fontFamily: "Inter", fontSize: px(16), fontWeight: 400, lineHeight: 1.5, letterSpacing: px(0) }],
    ["gradient", "anything — not checked in v1"],
  ])("accepts valid %s", (type, value) => {
    expect(validateValue(type as string, value)).toBeNull();
  });

  test.each([
    ["color", "#FF0000", "a color must be an object with colorSpace and components"],
    ["color", { colorSpace: "cmyk", components: [0, 0, 0] }, 'unknown color space "cmyk"'],
    ["color", { colorSpace: "srgb", components: [0, 0] }, "components must be 3 numbers"],
    ["color", { colorSpace: "srgb", components: [0, 0, 0], alpha: 2 }, "alpha must be between 0 and 1"],
    ["color", { colorSpace: "srgb", components: [0, 0, 0], hex: "red" }, 'hex must look like "#1A2B3C"'],
    ["dimension", 16, 'a size must look like { "value": 16, "unit": "px" }'],
    ["dimension", { value: 16, unit: "pt" }, 'size unit must be "px" or "rem"'],
    ["duration", { value: -1, unit: "ms" }, "a duration can't be negative"],
    ["duration", { value: 1, unit: "min" }, 'duration unit must be "ms" or "s"'],
    ["cubicBezier", [1.2, 0, 0, 1], "an easing curve needs 4 numbers and its 1st and 3rd numbers must be between 0 and 1"],
    ["number", "3", "must be a number"],
    ["fontFamily", [], "a font family must be a name or a list of names"],
    ["fontWeight", 1200, "a font weight must be 1–1000 or a name like \"bold\""],
    ["typography", { fontFamily: "Inter", fontSize: px(16), fontWeight: 400 }, "lineHeight: must be a number"],
    ["shadow", { color: black, offsetX: px(0), offsetY: px(1), blur: 2, spread: px(0) }, 'blur: a size must look like { "value": 16, "unit": "px" }'],
  ])("rejects bad %s", (type, value, message) => {
    expect(validateValue(type as string, value)).toBe(message as string);
  });
});

describe("durationToMs", () => {
  test("converts seconds and milliseconds", () => {
    expect(durationToMs({ value: 0.25, unit: "s" })).toBe(250);
    expect(durationToMs({ value: 120, unit: "ms" })).toBe(120);
  });
});
