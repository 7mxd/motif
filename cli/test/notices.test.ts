import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_NAMES, noticesText } from "../scripts/notices";

const REPO = join(import.meta.dir, "../..");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("THIRD-PARTY-NOTICES.txt", () => {
  test("is up to date with the licence files (run bun run notices after changing them)", () => {
    expect(lf(readFileSync(join(REPO, "THIRD-PARTY-NOTICES.txt"), "utf8"))).toBe(noticesText());
  });

  test("covers axe-core, Motion, Bun and every bundled font, each with its licence", () => {
    const text = noticesText();
    for (const s of ["axe-core 4.14.0", "Mozilla Public License", "Motion", "The MIT License", "Bun", "https://bun.com/docs/project/license", "SIL OPEN FONT LICENSE"]) {
      expect(text).toContain(s);
    }
    const files = readdirSync(join(REPO, "skill/preview-kit/fonts")).filter((f) => /^LICENSE-.+\.txt$/.test(f));
    expect(files).toHaveLength(11);
    for (const f of files) {
      expect(FONT_NAMES[f] ? f : `${f} has no display name in FONT_NAMES`).toBe(f);
      expect(text).toContain(`${FONT_NAMES[f]}, in the Claude Code plugin`);
    }
  });

  test("covers every library compiled into the tool: cli/package.json's dependencies, each with its licence (final review)", () => {
    const text = noticesText();
    const deps = Object.keys(JSON.parse(readFileSync(join(REPO, "cli/package.json"), "utf8")).dependencies);
    expect(deps.length).toBeGreaterThan(0);
    for (const d of deps) {
      const dir = join(REPO, "cli/node_modules", d);
      const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
      expect(text).toContain(`${d} ${version}, in the motif tool.`);
      const licence = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f))!;
      expect(text).toContain(lf(readFileSync(join(dir, licence), "utf8")).trim().split("\n")[0]!);
    }
  });

  test("says Motion and the fonts are in the tool too, and that Bun links LGPL-2 code (final review)", () => {
    const text = noticesText();
    expect(text).toContain("Motion, in the Claude Code plugin and the motif tool");
    expect(text).toContain("Nunito, in the Claude Code plugin and the motif tool");
    for (const s of ["Bun itself is MIT-licensed", "JavaScriptCore (and WebKit)", "LGPL-2", "https://github.com/oven-sh/webkit"]) expect(text).toContain(s);
    expect(text).not.toMatch(/Bun, in the motif tool[^\n]*MIT License\./);
  });
});
