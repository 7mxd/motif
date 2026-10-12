import { describe, expect, test } from "bun:test";
import { contrastRatio } from "../src/contract/color";

const srgb = (r: number, g: number, b: number, alpha?: number) => ({ colorSpace: "srgb", components: [r, g, b], ...(alpha === undefined ? {} : { alpha }) });
const white = srgb(1, 1, 1);
const black = srgb(0, 0, 0);

describe("contrastRatio", () => {
  test("black on white is 21:1", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
  });
  test("#777777 on white is about 4.48:1", () => {
    const gray = srgb(0x77 / 255, 0x77 / 255, 0x77 / 255);
    expect(contrastRatio(gray, white)).toBeCloseTo(4.48, 2);
  });
  test("is symmetric", () => {
    const a = srgb(0.2, 0.3, 0.8);
    expect(contrastRatio(a, white)).toBeCloseTo(contrastRatio(white, a), 10);
  });
  test("understands hsl with 0–100 saturation and lightness", () => {
    expect(contrastRatio({ colorSpace: "hsl", components: [0, 0, 0] }, white)).toBeCloseTo(21, 5);
  });
  test("understands oklch, including a 'none' hue", () => {
    expect(contrastRatio({ colorSpace: "oklch", components: [1, 0, "none"] }, black)).toBeCloseTo(21, 1);
  });
  test("composites a translucent foreground over the background", () => {
    expect(contrastRatio(srgb(0, 0, 0, 0.5), white)).toBeCloseTo(3.98, 1);
  });
});
