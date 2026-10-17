// Assembles THIRD-PARTY-NOTICES.txt: the licences of the other works Motif ships. Run: bun run notices
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "../..");
const RULE = "=".repeat(78);
const FONT_DIR = "skill/preview-kit/fonts";

/** Each bundled font's licence file and the font's name. */
export const FONT_NAMES: Record<string, string> = {
  "LICENSE-archivo.txt": "Archivo",
  "LICENSE-dm-sans.txt": "DM Sans",
  "LICENSE-fraunces.txt": "Fraunces",
  "LICENSE-fredoka.txt": "Fredoka",
  "LICENSE-ibm-plex-sans.txt": "IBM Plex Sans",
  "LICENSE-inter.txt": "Inter",
  "LICENSE-nunito.txt": "Nunito",
  "LICENSE-playfair-display.txt": "Playfair Display",
  "LICENSE-source-sans-3.txt": "Source Sans 3",
  "LICENSE-source-serif-4.txt": "Source Serif 4",
  "LICENSE-space-grotesk.txt": "Space Grotesk",
};

const read = (repo: string, path: string) => readFileSync(join(repo, path), "utf8").replace(/\r\n/g, "\n").trimEnd();

export function noticesText(repo: string = REPO): string {
  const fonts = readdirSync(join(repo, FONT_DIR)).filter((f) => /^LICENSE-.+\.txt$/.test(f)).sort();
  const sections: [string, string][] = [
    [
      "axe-core 4.14.0, in the motif tool (the accessibility audit of screenshots). Mozilla Public License 2.0.\nSource: https://github.com/dequelabs/axe-core (Motif's copy: cli/vendor/axe-core/)",
      `${read(repo, "cli/vendor/axe-core/LICENSE")}\n\n${read(repo, "cli/vendor/axe-core/LICENSE-3RD-PARTY.txt")}`,
    ],
    [
      "Motion, in the Claude Code plugin (skills/motif/preview-kit/vendor/motion.js). MIT License.\nSource: https://github.com/motiondivision/motion",
      read(repo, "skill/preview-kit/vendor/LICENSE-motion.txt"),
    ],
    ...fonts.map((f): [string, string] => [
      `${FONT_NAMES[f] ?? f}, in the Claude Code plugin (skills/motif/preview-kit/fonts/). SIL Open Font License 1.1.`,
      read(repo, `${FONT_DIR}/${f}`),
    ]),
    [
      "Bun, in the motif tool: each binary is a Bun single-file executable, which includes the Bun runtime. MIT License.",
      "Bun's licence: https://github.com/oven-sh/bun/blob/main/LICENSE.md\nThe third-party components the runtime includes, and their licences: https://bun.com/docs/project/license",
    ],
  ];
  return [
    "Third-party notices for Motif",
    "",
    "Motif's own code is under the MIT License (see LICENSE). It ships these other works, under their own licences.",
    "",
    ...sections.flatMap(([title, text]) => [RULE, title, RULE, "", text, ""]),
  ].join("\n");
}

if (import.meta.main) {
  const out = join(REPO, "THIRD-PARTY-NOTICES.txt");
  writeFileSync(out, noticesText());
  console.log(`Wrote ${out}`);
}
