import { describe, expect, test } from "bun:test";
import {
  cssColor, cssCubicBezier, cssDimension, cssDuration, cssFontFamily, cssShadow, dimensionPx, fontWeightNumber, num,
} from "../src/generate/css-values";

describe("cssColor", () => {
  test("opaque sRGB uses its hex", () => {
    expect(cssColor({ colorSpace: "srgb", components: [1, 1, 1], hex: "#ffffff" })).toBe("#FFFFFF");
  });
  test("translucent sRGB uses rgb() with alpha", () => {
    expect(cssColor({ colorSpace: "srgb", components: [0, 0, 0], alpha: 0.08, hex: "#000000" })).toBe("rgb(0 0 0 / 0.08)");
  });
  test("hsl and hwb use percentages", () => {
    expect(cssColor({ colorSpace: "hsl", components: [210, 40, 50], hex: "#4D80B3" })).toBe("hsl(210 40% 50%)");
    expect(cssColor({ colorSpace: "hwb", components: [0, 10, 20], hex: "#CC1A1A" })).toBe("hwb(0 10% 20%)");
  });
  test("oklch uses the function form and keeps 'none'", () => {
    expect(cssColor({ colorSpace: "oklch", components: [0.7, 0.1, "none"], hex: "#A3A3A3" })).toBe("oklch(0.7 0.1 none)");
  });
  test("wide-gamut spaces use color()", () => {
    expect(cssColor({ colorSpace: "display-p3", components: [1, 0.5, 0], alpha: 0.5, hex: "#FF8000" })).toBe("color(display-p3 1 0.5 0 / 0.5)");
  });
});

describe("other values", () => {
  test("dimensions", () => {
    expect(cssDimension({ value: 16, unit: "px" })).toBe("16px");
    expect(cssDimension({ value: 1.25, unit: "rem" })).toBe("1.25rem");
    expect(dimensionPx({ value: 1.25, unit: "rem" })).toBe(20);
  });
  test("durations are always milliseconds", () => {
    expect(cssDuration({ value: 0.25, unit: "s" })).toBe("250ms");
    expect(cssDuration({ value: 120, unit: "ms" })).toBe("120ms");
  });
  test("cubic-bezier", () => {
    expect(cssCubicBezier([0.2, 0, 0, 1])).toBe("cubic-bezier(0.2, 0, 0, 1)");
  });
  test("shadows: one layer, inset, and several layers", () => {
    const px = (value: number) => ({ value, unit: "px" });
    const layer = { color: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.1, hex: "#000000" }, offsetX: px(0), offsetY: px(4), blur: px(12), spread: px(0) };
    expect(cssShadow(layer)).toBe("0px 4px 12px 0px rgb(0 0 0 / 0.1)");
    expect(cssShadow({ ...layer, inset: true })).toBe("inset 0px 4px 12px 0px rgb(0 0 0 / 0.1)");
    expect(cssShadow([layer, layer])).toBe("0px 4px 12px 0px rgb(0 0 0 / 0.1), 0px 4px 12px 0px rgb(0 0 0 / 0.1)");
  });
  test("font families quote names with spaces", () => {
    expect(cssFontFamily(["Inter", "Helvetica Neue", "system-ui", "sans-serif"])).toBe('Inter, "Helvetica Neue", system-ui, sans-serif');
    expect(cssFontFamily("Inter")).toBe("Inter");
  });
  test("system font keywords stay unquoted (quoted, -apple-system is just a font nobody has)", () => {
    expect(cssFontFamily(["-apple-system", "BlinkMacSystemFont", "SF Pro Rounded", "Segoe UI", "Roboto", "sans-serif"])).toBe(
      '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif',
    );
    // Names that aren't identifiers are still quoted: a leading digit, a hyphen before a digit, two hyphens.
    expect(cssFontFamily(["1Password", "-9Font", "--x"])).toBe('"1Password", "-9Font", "--x"');
  });
  test("font weights", () => {
    expect(fontWeightNumber(600)).toBe(600);
    expect(fontWeightNumber("semi-bold")).toBe(600);
    expect(fontWeightNumber("regular")).toBe(400);
  });
  test("num trims to 4 decimals", () => {
    expect(num(0.12345678)).toBe("0.1235");
    expect(num(2)).toBe("2");
  });
});
