import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exceptionFor } from "../src/check/exceptions";
import type { SourceFile } from "../src/check/files";
import { scanColors } from "../src/check/rules/colors";
import { scanValues } from "../src/check/rules/values";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const KIT = join(import.meta.dir, "../../skill/preview-kit");
const read = (name: string) => readFileSync(join(KIT, name), "utf8");
const scale = buildScale(buildTheme(docFrom(validTokens())), "src");

describe("preview kit", () => {
  test("skeletons stop pulsing under reduced motion, as the README says (backlog)", () => {
    const css = read("kit.css");
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]!).join("\n");
    expect(blocks).toMatch(/\.mk-skeleton[^{]*\{[^}]*animation: none/);
  });

  test("kit.css follows the design guide; only device chrome is exempt, with reasons", () => {
    const text = read("kit.css");
    const file: SourceFile = { path: "kit.css", abs: "", text, lang: "css" };
    const lines = text.split(/\r?\n/);
    const violations = [...scanColors(file), ...scanValues(file, scale)].filter((h) => h.violation);
    const unexplained = violations.filter((h) => !(exceptionFor(lines, h.line) as { reason?: string } | null)?.reason);
    expect(unexplained.map((h) => `${h.line}: ${h.text}`)).toEqual([]);
    expect(violations.length).toBeGreaterThan(0); // the bezel really is exempted, not missed
  });

  test("kit.css defines the frames and components the README promises", () => {
    const css = read("kit.css");
    const readme = read("README.md");
    for (const cls of readme.match(/`\.mk-[a-z-]+`/g)!.map((c) => c.slice(2, -1))) {
      expect(css).toContain(`.${cls}`);
    }
  });

  test("headings use lining figures, so a number in a heading font with old-style figures (Vollkorn) stays even (final review)", () => {
    const css = read("kit.css");
    for (const cls of ["mk-display", "mk-title", "mk-heading"]) {
      const rule = css.slice(css.indexOf(`.${cls} {`));
      expect([cls, rule.slice(0, rule.indexOf("}")).includes("font-variant-numeric: lining-nums;")]).toEqual([cls, true]);
    }
  });

  test("kit.js is valid JavaScript", () => {
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(read("kit.js"))).not.toThrow();
  });

  test("the template uses the kit and no raw colours", () => {
    const html = read("template.html");
    expect(html).toContain('class="mk-frame mk-phone mk-ios"');
    expect(scanColors({ path: "template.html", abs: "", text: html, lang: "markup" })).toEqual([]);
  });

  test("Motion is vendored with its MIT licence", () => {
    expect(read("vendor/motion.js").startsWith("!function(")).toBe(true);
    expect(read("vendor/LICENSE-motion.txt")).toContain("MIT");
  });
});
