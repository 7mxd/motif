import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { scanValues } from "../src/check/rules/values";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const scale = buildScale(buildTheme(docFrom(validTokens())), "src");
const file = (path: string, text: string): SourceFile => ({ path, abs: path, text, lang: path.endsWith(".css") ? "css" : "script" });
const found = (path: string, text: string, s: typeof scale | null = scale) =>
  scanValues(file(path, text), s).filter((h) => h.violation).map((h) => [h.rule, h.kind, h.value]);

describe("code fonts and the optional mono role (backlog)", () => {
  const t = validTokens();
  t.font.mono = { $value: { fontFamily: ["ui-monospace", "monospace"], fontSize: { value: 14, unit: "px" }, fontWeight: 400, lineHeight: 1.5 } };
  const withMono = buildScale(buildTheme(docFrom(t)), "src");
  const fixes = (path: string, text: string, s: typeof scale) => scanValues(file(path, text), s).filter((h) => h.violation).map((h) => h.fix);

  test("a code font points to the mono role when the theme has one", () => {
    expect(fixes("a.css", ".a { font-family: 'Fira Code', monospace; }", withMono)).toEqual([expect.stringContaining("var(--motif-font-mono-family)")]);
    expect(fixes("a.tsx", '<code style={{ fontFamily: "monospace" }} />', withMono)).toEqual([expect.stringContaining("var(--motif-font-mono-family)")]);
  });
  test("and says how to add one when it doesn't", () => {
    expect(fixes("a.css", ".a { font-family: ui-monospace, monospace; }", scale)).toEqual([expect.stringContaining("font.mono")]);
  });
  test("a font that's already a variable isn't flagged, in a style object too (review of batch D)", () => {
    expect(fixes("a.tsx", '<code style={{ fontFamily: "var(--motif-font-mono-family)" }} />', withMono)).toEqual([]);
  });
  test("adding the role is proposed as a design guide change, not edited in place (review of batch D)", () => {
    expect(fixes("a.css", ".a { font-family: ui-monospace, monospace; }", scale)[0]).toMatch(/^For code text, propose adding the optional font\.mono role/);
  });
  test("other fonts still point to the text roles", () => {
    expect(fixes("a.css", ".a { font-family: 'Comic Sans MS'; }", withMono)).toEqual([expect.stringContaining("var(--motif-font-body-family)")]);
    expect(fixes("a.css", ".a { font-family: Monoton, cursive; }", withMono)).toEqual([expect.stringContaining("var(--motif-font-body-family)")]);
  });
});

describe("CSS declarations", () => {
  test("spacing off the scale; 0, auto and scale values are fine", () => {
    expect(found("a.css", ".a { padding: 13px 16px; margin: 0 auto; gap: 1rem; }")).toEqual([["off-scale", "space", "13px"]]);
  });
  test("geometry isn't spacing: hairlines, a decoration's placement, an overlap, and lengths worked out with others (v1.0 field trial)", () => {
    // 2 px and less: a hairline gap, a 1 px nudge, the visually-hidden pattern's -1px margin.
    expect(found("a.css", ".bar { gap: 2px; } .tag { padding: 1px 8px; } .sr { margin: -1px; }")).toEqual([]);
    // A ::before or ::after placed on a timeline, or laid over a control as its hit area.
    expect(found("a.css", ".step::before { left: 5px; top: 15px; } .pill::after { inset: -6px -10px; }")).toEqual([]);
    // A button overlapping its thumbnail's corner.
    expect(found("a.css", ".thumb .remove { position: absolute; top: -10px; right: -10px; }")).toEqual([]);
    // Room for a floating button above the tab bar; the content column's width.
    expect(found("a.css", ".main { padding-bottom: calc(96px + var(--tabbar-space)); padding-left: max(env(safe-area-inset-left), calc((100% - 640px) / 2)); }")).toEqual([]);
    // Real spacing is still checked: an element's own offset, padding with a fixed sum, and a negative margin.
    expect(found("a.css", ".fab { position: fixed; bottom: 13px; } .a { padding: calc(13px * 2); } .b { margin: -13px; }")).toEqual([
      ["off-scale", "space", "13px"],
      ["off-scale", "space", "13px"],
      ["off-scale", "space", "13px"],
    ]);
  });
  test("radius and font size", () => {
    expect(found("a.css", ".a { border-radius: 6px; font-size: 15px; } .b { border-radius: 8px; font-size: 16px; }")).toEqual([
      ["off-scale", "radius", "6px"],
      ["off-scale", "font-size", "15px"],
    ]);
  });
  test("font families", () => {
    expect(found("a.css", ".a { font-family: 'Comic Sans MS', cursive; } .b { font-family: var(--motif-font-body-family); }")).toEqual([
      ["raw-font", "font-family", "'Comic Sans MS', cursive"],
    ]);
  });
  test("transitions with literal timing and easing; Motif variables are fine", () => {
    expect(found("a.css", ".a { transition: opacity 300ms ease-in-out; } .b { transition: opacity var(--motif-duration-fast) var(--motif-easing-standard); } .c { transition: none 0s; }")).toEqual([
      ["raw-motion", "duration", "300ms"],
      ["raw-motion", "easing", "ease-in-out"],
    ]);
  });
  test("custom properties are not checked here", () => {
    expect(found("a.css", ":root { --gap: 13px; }")).toEqual([]);
  });
  test("primitives used directly", () => {
    expect(found("a.css", ".a { color: var(--motif-primitive-color-gray-50); }")).toEqual([["primitive-use", undefined, undefined]]);
  });
});

describe("scripts", () => {
  test("style objects", () => {
    expect(found("a.tsx", '<div style={{ padding: 13, marginTop: 16, fontSize: "15px", borderRadius: 8, fontFamily: "Comic Sans" }} />')).toEqual([
      ["off-scale", "space", "13px"],
      ["off-scale", "font-size", "15px"],
      ["raw-font", "font-family", "Comic Sans"],
    ]);
  });
  test("Motion timing in files that import Motion", () => {
    const text = 'import { motion } from "motion/react";\n<motion.div transition={{ duration: 0.3, ease: "easeOut", type: "spring", stiffness: 300 }} />';
    expect(found("a.tsx", text)).toEqual([
      ["raw-motion", "duration", "300ms"],
      ["raw-motion", "easing", '"easeOut"'],
      ["raw-motion", "spring", "stiffness 300"],
    ]);
  });
  test("the same keys without a Motion import are not motion", () => {
    expect(found("a.ts", "const job = { duration: 0.3, ease: 'linear' };")).toEqual([]);
  });
  test("primitive tokens read in code", () => {
    expect(found("a.ts", "const c = tokens.primitive.color.gray;")).toEqual([["primitive-use", undefined, undefined]]);
  });
});

describe("without a scale (extract)", () => {
  test("values are reported but aren't violations", () => {
    const hits = scanValues(file("a.css", ".a { padding: 13px; }"), null);
    expect(hits.map((h) => [h.kind, h.value, h.violation])).toEqual([["space", "13px", false]]);
  });
});

describe("false positives in ordinary code (values)", () => {
  test("@font-face declares a family; it can't use a variable", () => {
    expect(found("a.css", '@font-face { font-family: "Brand Sans"; src: url(brand.woff2); }')).toEqual([]);
  });
  test("numbers in non-style objects are not spacing", () => {
    expect(found("a.tsx", "window.scrollTo({ top: 120 });\n<Chart margin={{ top: 5, right: 30 }} />")).toEqual([]);
  });
  test("style objects are still checked", () => {
    expect(found("a.tsx", "<div style={{ padding: 13 }} />")).toEqual([["off-scale", "space", "13px"]]);
  });
  test("values in comments are ignored", () => {
    expect(found("a.css", "/* padding: 13px */ .a { padding: 16px; }")).toEqual([]);
  });
});

describe("Motion timing only inside motion settings", () => {
  test("a toast's duration in a file that imports Motion isn't a Motion timing", () => {
    const text = 'import { motion } from "motion/react";\ntoast("Saved", { duration: 4000 });\n<motion.div transition={{ duration: 0.3 }} />';
    expect(found("a.tsx", text)).toEqual([["raw-motion", "duration", "300ms"]]);
  });
  test("values over 10 are read as milliseconds", () => {
    const text = 'import { animate } from "motion";\nanimate(el, { opacity: 1 }, { duration: 250 });';
    expect(found("a.ts", text)).toEqual([["raw-motion", "duration", "250ms"]]);
  });
});

describe("fonts declared in @font-face and --font-* variables", () => {
  test("are seen (for extract) but are not violations", () => {
    const css = '@font-face { font-family: "Brand Sans"; src: url(b.woff2); }\n:root { --font-sans: "Brand Sans", system-ui; }';
    const hits = scanValues(file("a.css", css), null).filter((h) => h.kind === "font-family");
    expect(hits.map((h) => [h.value, h.violation])).toEqual([['"Brand Sans"', false], ['"Brand Sans", system-ui', false]]);
    expect(found("a.css", css)).toEqual([]);
  });
});
