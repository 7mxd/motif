import { describe, expect, test } from "bun:test";
import { buildTheme, type Theme } from "../src/generate/theme";
import { firstFamily, googleFontsUrl, themeFonts } from "../src/generate/theme-fonts";
import { presetTheme } from "../src/preview/presets";
import { docFrom, validTokens } from "./helpers";

/** The fixture theme with its font families replaced (sans for body/label/caption, display for the rest). */
function withFonts(sans: string[], display: string[] = sans): Theme {
  const tokens = validTokens();
  tokens.primitive.font.sans.$value = sans;
  tokens.primitive.font.display = { $type: "fontFamily", $value: display };
  for (const role of ["display", "title", "heading"]) tokens.font[role].$value.fontFamily = "{primitive.font.display}";
  return buildTheme(docFrom(tokens));
}

describe("firstFamily", () => {
  test("the family a type role asks for first, unquoted, unless that's a generic family", () => {
    expect(firstFamily("Inter, system-ui, sans-serif")).toBe("Inter");
    expect(firstFamily('"Plus Jakarta Sans", sans-serif')).toBe("Plus Jakarta Sans");
    expect(firstFamily("system-ui, sans-serif")).toBeNull();
    expect(firstFamily("-apple-system, BlinkMacSystemFont, sans-serif")).toBeNull();
  });
});

describe("themeFonts", () => {
  test("a starting style's fonts are all bundled, with the weights its roles use", () => {
    const fonts = themeFonts(presetTheme("editorial")!);
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Playfair Display", "bundled"], ["Source Serif 4", "bundled"]]);
    for (const f of fonts) expect(f.weights).toEqual([...f.weights].sort((a, b) => a - b));
  });

  test("other fonts come from Google Fonts; system fonts are never fetched", () => {
    const fonts = themeFonts(withFonts(["Plus Jakarta Sans", "sans-serif"], ["Georgia", "serif"]));
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Georgia", "system"], ["Plus Jakarta Sans", "google"]]);
  });

  test("a theme that only names generic families asks for nothing", () => {
    expect(themeFonts(withFonts(["system-ui", "sans-serif"]))).toEqual([]);
  });
});

describe("googleFontsUrl", () => {
  test("one family with the exact weights its roles use", () => {
    expect(googleFontsUrl("Plus Jakarta Sans", [400, 600, 700])).toBe("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap");
  });
});
