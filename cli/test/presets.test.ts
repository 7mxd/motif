import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkContrast } from "../src/contract/contrast";
import { checkRoles } from "../src/contract/roles";
import { validateTokens } from "../src/contract/tokens";
import { buildTheme } from "../src/generate/theme";
import { presetAbout, presetSample, presetTokens } from "../src/presets/build";
import { PRESETS } from "../src/presets/spec";
import { generateReactWeb } from "../src/stacks/react-web/generate";
import { docFrom } from "./helpers";

const SKILL = join(import.meta.dir, "../../skill");
const read = (rel: string) => readFileSync(join(SKILL, rel), "utf8").replace(/\r\n/g, "\n");
const template = read("preview-kit/template.html");

test("exactly the 8 presets from the spec, in order", () => {
  expect(PRESETS.map((p) => p.id)).toEqual(["minimal", "soft", "playful", "editorial", "bold", "dark-tech", "warm", "trust"]);
});

for (const spec of PRESETS) {
  describe(`preset ${spec.id}`, () => {
    const tokens = presetTokens(spec);
    const doc = docFrom(tokens);

    test("is a valid design guide whose text is readable in light and dark", () => {
      expect(validateTokens(doc)).toEqual([]);
      expect(checkRoles(doc)).toEqual([]);
      expect(checkContrast(doc).findings).toEqual([]);
    });

    test("files on disk match the spec (run `bun run presets` after changing it)", () => {
      expect(read(`presets/${spec.id}/tokens.json`)).toBe(JSON.stringify(tokens, null, 2) + "\n");
      expect(read(`presets/${spec.id}/about.md`)).toBe(presetAbout(spec));
      expect(read(`presets/${spec.id}/sample.html`)).toBe(presetSample(spec, template));
    });

    test("React web output stays the same", () => {
      const files = generateReactWeb(buildTheme(doc), { srcDir: "src", tailwind: "v4" });
      expect(files.map((f) => `// ${f.path}\n${f.content}`).join("\n")).toMatchSnapshot();
    });
  });
}
