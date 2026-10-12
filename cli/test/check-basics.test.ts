import { describe, expect, test } from "bun:test";
import { exceptionFor } from "../src/check/exceptions";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { locator } from "../src/text";
import { docFrom, validTokens } from "./helpers";

describe("locator", () => {
  test("gives 1-based lines and columns, with Windows line endings too", () => {
    const text = "a\nbc\r\nd";
    const at = locator(text);
    expect(at(0)).toEqual({ line: 1, column: 1 });
    expect(at(3)).toEqual({ line: 2, column: 2 });
    expect(at(text.indexOf("d"))).toEqual({ line: 3, column: 1 });
  });
});

describe("exceptionFor", () => {
  const lines = (...l: string[]) => l;
  test("a reason on the same line", () => {
    expect(exceptionFor(lines('color: #123; // motif-ok: partner brand colour'), 1)).toEqual({ reason: "partner brand colour" });
  });
  test("a block comment on the line above", () => {
    expect(exceptionFor(lines("/* motif-ok: matches the printed menu */", "color: #123;"), 2)).toEqual({ reason: "matches the printed menu" });
  });
  test("a JSX comment", () => {
    expect(exceptionFor(lines('{/* motif-ok: chart palette */}', '<div style={{ color: "#123" }} />'), 2)).toEqual({ reason: "chart palette" });
  });
  test("missing reason", () => {
    expect(exceptionFor(lines("color: #123; // motif-ok"), 1)).toEqual({ missingReason: true });
    expect(exceptionFor(lines("color: #123; /* motif-ok: */"), 1)).toEqual({ missingReason: true });
  });
  test("no comment", () => {
    expect(exceptionFor(lines("a", "color: #123;"), 2)).toBeNull();
  });
});

describe("buildScale", () => {
  test("collects the values and names the rules compare against", () => {
    const s = buildScale(buildTheme(docFrom(validTokens())), "src");
    expect(s.spacePx.has(16)).toBe(true);
    expect(s.spacePx.has(0)).toBe(true);
    expect(s.spaceKeys.has("4")).toBe(true);
    expect(s.spaceKeys.has("7")).toBe(false);
    expect(s.radiusKeys.has("md")).toBe(true);
    expect(s.fontSizePx.has(16)).toBe(true);
    expect(s.textKeys.has("body")).toBe(true);
    expect(s.shadowKeys.has("lg")).toBe(true);
    expect(s.easeKeys.has("standard")).toBe(true);
    expect(s.motionImport).toBe("src/design/motion");
  });
});

describe("exceptionFor: the line above must be a comment", () => {
  test("a motif-ok on a code line doesn't excuse the next line", () => {
    expect(exceptionFor(["color: #111; // motif-ok: logo", "color: #222;"], 2)).toBeNull();
  });
});
