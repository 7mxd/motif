// Writes skill/presets/<id>/{tokens.json, about.md, sample.html} from src/presets/spec.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { presetAbout, presetSample, presetTokens, templateTokens } from "../src/presets/build";
import { PRESETS } from "../src/presets/spec";

const SKILL = join(import.meta.dir, "../../skill");
const template = readFileSync(join(SKILL, "preview-kit", "template.html"), "utf8");
for (const spec of PRESETS) {
  const dir = join(SKILL, "presets", spec.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "tokens.json"), JSON.stringify(presetTokens(spec), null, 2) + "\n");
  writeFileSync(join(dir, "about.md"), presetAbout(spec));
  writeFileSync(join(dir, "sample.html"), presetSample(spec, template));
  console.log(`wrote skill/presets/${spec.id}`);
}
mkdirSync(join(SKILL, "contract"), { recursive: true });
writeFileSync(join(SKILL, "contract", "tokens.template.json"), JSON.stringify(templateTokens(), null, 2) + "\n");
console.log("wrote skill/contract/tokens.template.json");
