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

describe("the release workflow", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  /** One job's text: from its "  name:" line to the next job's. */
  const section = (name: string) => {
    const start = wf.indexOf(`\n  ${name}:\n`);
    expect(start).toBeGreaterThan(-1);
    const next = wf.slice(start + 1).search(/\n  [a-z][\w-]*:\n/);
    return next === -1 ? wf.slice(start) : wf.slice(start, start + 1 + next);
  };

  test("builds and zips the plugin, with the tag and the plugin's version checked", () => {
    const plugin = section("plugin");
    for (const s of ["bun run plugin", "bun run plugin:zip", "dist/motif-claude-code.zip", 'test "v$(tr -d \' \\r\\n\' < skill/VERSION)" = "$GITHUB_REF_NAME"']) {
      expect(plugin).toContain(s);
    }
  });

  test("publishes a pre-release below 1.0, with written notes and the notices, only after checking the notes exist", () => {
    const publish = section("publish");
    expect(publish).toContain("needs: [build, plugin]");
    expect(publish).toContain('case "$GITHUB_REF_NAME" in v0.*) pre="--prerelease" ;; esac');
    expect(publish).toContain('--notes-file "docs/releases/$GITHUB_REF_NAME.md"');
    expect(publish).not.toContain("--generate-notes");
    expect(publish).toContain("cp THIRD-PARTY-NOTICES.txt dist/");
    expect(publish.indexOf('test -f "docs/releases/$GITHUB_REF_NAME.md"')).toBeGreaterThan(-1);
    expect(publish.indexOf('test -f "docs/releases/$GITHUB_REF_NAME.md"')).toBeLessThan(publish.indexOf("gh release create"));
  });

  test("gives each job only the access it needs: write only to publish, the token only to the download step (final review)", () => {
    expect(wf.slice(0, wf.indexOf("\njobs:"))).toContain("permissions:\n  contents: read");
    expect(section("publish")).toContain("permissions:\n      contents: write");
    const check = section("check");
    const download = check.slice(check.indexOf("- name: Download the plugin"), check.indexOf("- name: The zip matches"));
    expect(download).toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    expect(check.split("GH_TOKEN").length - 1).toBe(1);
    expect(section("plugin")).toContain("persist-credentials: false");
  });

  test("checks the published release on Windows, macOS and Linux through the plugin's own bootstrap", () => {
    const check = section("check");
    expect(check).toContain("needs: publish");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(check).toContain(os);
    for (const s of [
      "gh release download", "--pattern motif-claude-code.zip", "--pattern SHA256SUMS", "sha256sum -c", "shasum -a 256 -c",
      "chmod a-x plugin/skills/motif/bin/motif", "sh plugin/skills/motif/bin/motif --version", "sh plugin/skills/motif/bin/motif doctor --json",
      "motif.cmd --version", "motif.cmd doctor --json", "MOTIF_HOME", "unset MOTIF_BIN",
    ]) expect(check).toContain(s);
  });
});
