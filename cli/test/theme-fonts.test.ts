import { describe, expect, test } from "bun:test";
import { buildTheme, type Theme } from "../src/generate/theme";
import { firstFamily, fontStylesheets, googleFontsUrl, stackFamilies, themeFonts } from "../src/generate/theme-fonts";
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
    expect(fonts.map((f) => [f.family, f.source])).toEqual([["Acme Sans", "google"]]);
  });

  test("the list stops at the first system or generic font: fallbacks after it are never loaded or installed (final review)", () => {
    expect(stackFamilies('Fredoka, "Baloo Bhaijaan 2", Nunito, system-ui, sans-serif')).toEqual(["Fredoka", "Baloo Bhaijaan 2", "Nunito"]);
    expect(stackFamilies('"Acme Sans", Helvetica, Roboto, sans-serif')).toEqual(["Acme Sans"]);
    const apple = themeFonts(withFonts(["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"]));
    expect(apple.map((f) => f.family)).toEqual(["Inter"]);
    const tailwind = ["ui-sans-serif", "system-ui", "sans-serif", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"];
    expect(themeFonts(withFonts(tailwind))).toEqual([]);
  });
});

describe("Arabic companions Motif ships (preset refresh)", () => {
  test("bundled when second in a list; the same family first in a list comes from Google, for its Latin letters (review focus)", () => {
    expect(themeFonts(withFonts(["Onest", "Readex Pro", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Onest", "bundled"], ["Readex Pro", "bundled"]]);
    expect(themeFonts(withFonts(["Rubik", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Rubik", "google"]]);
    expect(themeFonts(withFonts(["Onest", "Rubik", "sans-serif"], ["Rubik", "sans-serif"])).find((f) => f.family === "Rubik")!.source).toBe("google");
  });
});

describe("guides made before the preset refresh", () => {
  test("a retired font still loads in mockups, from Google Fonts (review focus)", () => {
    expect(themeFonts(withFonts(["Inter", "system-ui", "sans-serif"])).map((f) => [f.family, f.source])).toEqual([["Inter", "google"]]);
  });
});

describe("companions (final review)", () => {
  test("a family is a companion only when it never comes first in a font list", () => {
    expect(themeFonts(withFonts(["Onest", "Readex Pro", "sans-serif"])).map((f) => [f.family, f.companion])).toEqual([["Onest", false], ["Readex Pro", true]]);
    const mixed = themeFonts(withFonts(["Onest", "Rubik", "sans-serif"], ["Rubik", "sans-serif"]));
    expect(mixed.find((f) => f.family === "Rubik")!.companion).toBe(false);
  });
});

describe("a list that starts with the system font (v0.5.0 sweep)", () => {
  test("stackFamilies: null for the system font first, then the named families after it", () => {
    expect(stackFamilies("system-ui, Readex Pro")).toEqual([null, "Readex Pro"]);
    expect(stackFamilies('system-ui, "Readex Pro", sans-serif')).toEqual([null, "Readex Pro"]);
    expect(stackFamilies("serif, Amiri, Georgia, serif")).toEqual([null, "Amiri"]);
  });

  test("a generic family with no named family after it is still nothing to load", () => {
    expect(stackFamilies("system-ui, sans-serif")).toEqual([]);
    expect(stackFamilies("system-ui, Segoe UI, Roboto, sans-serif")).toEqual([]);
    expect(stackFamilies("-apple-system, BlinkMacSystemFont, Readex Pro")).toEqual([]);
  });

  test("the family after the system font is a companion, bundled when Motif ships its Arabic letters", () => {
    const fonts = themeFonts(withFonts(["system-ui", "Readex Pro", "sans-serif"]));
    expect(fonts.map((f) => [f.family, f.source, f.companion])).toEqual([["Readex Pro", "bundled", true]]);
    expect(fonts[0]!.weights).toEqual([400, 500, 600, 700]);
    // Nothing more to fetch for a web page.
    expect(fontStylesheets(withFonts(["system-ui", "Readex Pro", "sans-serif"]))).toEqual([]);
  });
});

describe("project fonts", () => {
  test("a family the project bundles is source project and never gets a Google stylesheet", () => {
    const tokens = validTokens();
    tokens.primitive.font.sans.$value = ["Thmanyah Sans", "sans-serif"];
    tokens.$extensions = { "dev.motif": { fonts: [{ family: "Thmanyah Sans", files: [{ path: "assets/fonts/T.woff2", weight: 400, style: "normal" }] }] } };
    const theme = buildTheme(docFrom(tokens));
    expect(themeFonts(theme).find((f) => f.family === "Thmanyah Sans")!.source).toBe("project");
    expect(fontStylesheets(theme).join(" ")).not.toContain("Thmanyah");
    // without the declaration the same family would be fetched
    delete tokens.$extensions;
    expect(fontStylesheets(buildTheme(docFrom(tokens))).join(" ")).toContain("Thmanyah");
  });
});
