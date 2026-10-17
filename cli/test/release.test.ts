import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const NOTES = join(REPO, "docs/releases", `v${VERSION}.md`);

describe("the release notes", () => {
  test("exist for this version, so tagging it can publish", () => {
    expect(existsSync(NOTES)).toBe(true);
  });

  test("say how to install, what's needed, what's in it and what isn't", () => {
    const notes = readFileSync(NOTES, "utf8");
    for (const s of [
      "/plugin marketplace add 7mxd/motif", "/plugin install motif@motif", "Claude Code 2.1.224", "git", "SHA256SUMS",
      "preview", "React web", "plain web", "## Known limits", "aren't code-signed", "motif-claude-code.zip", "THIRD-PARTY-NOTICES.txt",
    ]) expect(notes).toContain(s);
  });
});
