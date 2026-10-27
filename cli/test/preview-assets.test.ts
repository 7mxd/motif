import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KIT_ASSETS, TEMPLATE_HTML } from "../src/preview/assets";
import { EMBEDDED_PRESETS, presetTheme, presetTitle } from "../src/preview/presets";
import { PRESETS } from "../src/presets/spec";

const SKILL = join(import.meta.dir, "../../skill");
const read = (rel: string) => readFileSync(join(SKILL, rel), "utf8").replace(/\r\n/g, "\n");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("embedded preview kit", () => {
  test("matches the files in skill/preview-kit", () => {
    expect(lf(KIT_ASSETS["kit.css"].body)).toBe(read("preview-kit/kit.css"));
    expect(lf(KIT_ASSETS["kit.js"].body)).toBe(read("preview-kit/kit.js"));
    expect(lf(KIT_ASSETS["vendor/motion.js"].body)).toBe(read("preview-kit/vendor/motion.js"));
    expect(lf(TEMPLATE_HTML)).toBe(read("preview-kit/template.html"));
    expect(KIT_ASSETS["kit.css"].type).toStartWith("text/css");
  });
});

describe("embedded presets", () => {
  test("all 8, in spec order, matching skill/presets", () => {
    expect(EMBEDDED_PRESETS.map((p) => p.id)).toEqual(PRESETS.map((p) => p.id));
    for (const p of EMBEDDED_PRESETS) {
      expect(lf(p.tokens)).toBe(read(`presets/${p.id}/tokens.json`));
      expect(lf(p.about)).toBe(read(`presets/${p.id}/about.md`));
    }
  });
  test("presetTheme builds a theme; unknown ids give null", () => {
    expect(presetTheme("warm")!.colors.length).toBe(23); // the 20 required colour roles and the 3 optional brand ones
    expect(presetTheme("nope")).toBeNull();
  });
  test("presetTitle reads the heading", () => {
    expect(presetTitle(EMBEDDED_PRESETS[5]!.about)).toBe("Dark Tech");
  });
});
