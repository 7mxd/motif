import { describe, expect, test } from "bun:test";
import { buildTheme, buildThemeSet, type Theme } from "../src/generate/theme";
import { firstFamily, fontStylesheets, googleFontsUrl, skippedCompanions, stackFamilies, themeFonts } from "../src/generate/theme-fonts";
import { generateCompose } from "../src/stacks/compose/generate";
import { generateFlutter } from "../src/stacks/flutter/generate";
import { generateReactNative } from "../src/stacks/react-native/generate";
import { generateSwiftUI } from "../src/stacks/swiftui/generate";
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

/** Generic-first stacks whose later families are fallbacks Motif can't call Arabic: they stay nothing to load. */
const GUARD_STACKS = [
  "system-ui, Avenir, Helvetica, Arial, sans-serif",
  "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, sans-serif",
  "system-ui, Roboto, sans-serif",
  "ui-monospace, 'JetBrains Mono', monospace",
];

describe("a list that starts with the system font (v0.5.0 sweep)", () => {
  test("stackFamilies: null for the system font first, then the named families after it", () => {
    expect(stackFamilies("system-ui, Readex Pro")).toEqual([null, "Readex Pro"]);
    expect(stackFamilies('system-ui, "Readex Pro", sans-serif')).toEqual([null, "Readex Pro"]);
    expect(stackFamilies("serif, Markazi Text, Georgia, serif")).toEqual([null, "Markazi Text"]);
  });

  test("after a generic family, only a family Motif knows covers Arabic is a companion (fix round 1)", () => {
    // Vite's default stack, a rounded Japanese one, Roboto and a code font: fallbacks, never companions.
    for (const css of GUARD_STACKS) expect(stackFamilies(css)).toEqual([]);
    // Amiri covers Arabic, but Motif's kit doesn't ship it, so Motif can't tell.
    expect(stackFamilies("serif, Amiri, Georgia, serif")).toEqual([]);
    for (const css of GUARD_STACKS) {
      const theme = withFonts(css.split(",").map((f) => f.trim().replace(/^'(.*)'$/, "$1")));
      expect(themeFonts(theme)).toEqual([]);
      expect(fontStylesheets(theme)).toEqual([]);
    }
  });

  test("a stack whose fallbacks aren't companions generates what its generic family alone does, on every native stack (fix round 1)", () => {
    const outputs = (fontFamily: string[]) => {
      const t = validTokens();
      t.font.body.$value.fontFamily = fontFamily;
      const set = buildThemeSet(docFrom(t));
      return [
        generateSwiftUI(set)[0]!.content,
        generateCompose(set, { packageName: "com.example.ui.motif", rPackage: "com.example", googleFonts: true, resFonts: new Map() })[0]!.content,
        generateFlutter(set, { googleFonts: true })[0]!.content,
        generateReactNative(set, { googlePackages: new Map(), projectFonts: [] })[0]!.content,
      ];
    };
    for (const css of GUARD_STACKS) {
      const families = css.split(",").map((f) => f.trim().replace(/^'(.*)'$/, "$1"));
      expect(outputs(families)).toEqual(outputs([families[0]!]));
    }
  });

  test("skippedCompanions: a project font after a generic family, and a known Arabic font after more than one (fix round 1)", () => {
    const tokens = validTokens();
    tokens.$extensions["dev.motif"].fonts = [{ family: "Thmanyah Sans", files: [{ path: "design/fonts/T.ttf", weight: 400, style: "normal" }] }];
    tokens.font.body.$value.fontFamily = ["system-ui", "Thmanyah Sans"];
    tokens.font.caption.$value.fontFamily = ["system-ui", "Thmanyah Sans", "sans-serif"];
    tokens.font.heading.$value.fontFamily = ["-apple-system", "BlinkMacSystemFont", "Readex Pro", "sans-serif"];
    tokens.font.title.$value.fontFamily = ["system-ui", "Readex Pro"];
    tokens.font.label.$value.fontFamily = ["system-ui", "Avenir", "Helvetica", "sans-serif"];
    expect(skippedCompanions(buildTheme(docFrom(tokens)))).toEqual([
      { family: "Readex Pro", after: "-apple-system", roles: ["heading"], kind: "after-generics" },
      { family: "Thmanyah Sans", after: "system-ui", roles: ["body", "caption"], kind: "project" },
    ]);
    expect(skippedCompanions(buildTheme(docFrom(validTokens())))).toEqual([]);
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
