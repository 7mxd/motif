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
});
