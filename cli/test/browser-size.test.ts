import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "../..");
// Everywhere the browser download is offered or suggested. Chrome for Testing's headless shell 155 is 102–125 MB to
// download and 278 MB once unpacked on Windows, so: about 120 MB to download, about 300 MB on disk.
const OFFERS = [
  "cli/src/commands/shot.ts", "cli/src/commands/preview.ts", "cli/src/commands/doctor.ts", "cli/src/commands/browser.ts",
  "skill/SKILL.md", "skill/modes/design.md", "tests/evals/README.md", "tests/evals/preflight.ts",
];

test("the browser download is offered with its real size: to download and on disk", () => {
  for (const file of OFFERS) {
    const text = readFileSync(join(REPO, file), "utf8");
    expect(text.includes("about 100 MB") ? `${file} still says about 100 MB` : file).toBe(file);
    expect(text.includes("about 120 MB") && text.includes("about 300 MB") ? file : `${file} doesn't give both sizes`).toBe(file);
  }
});
