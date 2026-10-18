import { describe, expect, test } from "bun:test";
import { buildTheme, type Theme } from "../src/generate/theme";
import { firstFamily, googleFontsUrl, stackFamilies, themeFonts } from "../src/generate/theme-fonts";
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
    const fonts = themeFonts(presetTheme("editorial")!).filter((f) => f.source !== "system");
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Noto Serif Display", "bundled"], ["Markazi Text", "bundled"], ["Source Serif 4", "bundled"]]);
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

describe("the system's own monospace fonts (review of batch D)", () => {
  test("are never fetched, whichever comes first", () => {
    for (const family of ["SFMono-Regular", "Liberation Mono", "Lucida Console", "DejaVu Sans Mono", "Andale Mono", "Menlo", "Consolas"]) {
      expect(themeFonts(withFonts([family, "monospace"])).map((f) => f.source)).toEqual(["system"]);
    }
  });
});

describe("every web font in a font list (preset refresh)", () => {
  test("stackFamilies: each family in order, unquoted, without generic families", () => {
    expect(stackFamilies('Onest, "Readex Pro", system-ui, sans-serif')).toEqual(["Onest", "Readex Pro"]);
    expect(stackFamilies("system-ui, sans-serif")).toEqual([]);
  });

  test("a companion second in the list is loaded too, with the same weights", () => {
    const fonts = themeFonts(withFonts(["Plus Jakarta Sans", "Noto Kufi Arabic", "system-ui", "sans-serif"]));
    expect(fonts.map((f) => f.family)).toEqual(["Plus Jakarta Sans", "Noto Kufi Arabic"]);
    expect(fonts[1]!.weights).toEqual(fonts[0]!.weights);
  });

  test("system fonts later in the list are never fetched (review focus)", () => {
    const fonts = themeFonts(withFonts(["Acme Sans", "Helvetica", "Arial", "sans-serif"]));
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Acme Sans", "google"], ["Helvetica", "system"], ["Arial", "system"]]);
  });
});

describe("Arabic companions Motif ships (preset refresh)", () => {
  test("bundled when second in a list; the same family first in a list comes from Google, for its Latin letters (review focus)", () => {
    expect(themeFonts(withFonts(["Onest", "Readex Pro", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Onest", "bundled"], ["Readex Pro", "bundled"]]);
    expect(themeFonts(withFonts(["Rubik", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Rubik", "google"]]);
    expect(themeFonts(withFonts(["Onest", "Rubik", "sans-serif"], ["Rubik", "sans-serif"])).find((f) => f.family === "Rubik")!.source).toBe("google");
  });
});
