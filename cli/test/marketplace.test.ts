import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginManifest } from "../scripts/build-plugin";
import { marketplaceFile, marketplaceProblems } from "../scripts/marketplace";

const REPO = join(import.meta.dir, "../..");
const FILE = join(REPO, ".claude-plugin", "marketplace.json");
const ZIP_SUM = "b".repeat(64);
const SUMS = [`${"a".repeat(64)}  motif-linux-x64`, `${ZIP_SUM}  motif-claude-code.zip`, ""].join("\n");

describe("the marketplace file", () => {
  test("points at a release's plugin zip, pinned by the checksum in its SHA256SUMS", () => {
    expect(marketplaceFile("v0.1.0", SUMS)).toEqual({
      name: "motif",
      description: "Motif: design guide tools for AI coding agents.",
      owner: { name: "7mxd", url: "https://github.com/7mxd" },
      plugins: [{
        name: "motif",
        description: (pluginManifest("0.1.0") as { description: string }).description,
        source: { source: "archive", url: "https://github.com/7mxd/motif/releases/download/v0.1.0/motif-claude-code.zip", sha256: ZIP_SUM },
      }],
    });
    expect(marketplaceProblems(marketplaceFile("v0.1.0", SUMS))).toEqual([]);
  });

  test("reads SHA256SUMS written in binary mode, in capitals, or with Windows line endings", () => {
    const sums = `${"A".repeat(64)} *motif-claude-code.zip\r\n`;
    expect(marketplaceFile("v0.1.0", sums).plugins[0]!.source.sha256).toBe("a".repeat(64));
  });

  test("a tag that isn't a release, or sums without the plugin, is a plain error", () => {
    expect(() => marketplaceFile("0.1.0", SUMS)).toThrow('"0.1.0" isn\'t a release tag such as v0.1.0.');
    expect(() => marketplaceFile("v0.1.0", `${"a".repeat(64)}  motif-linux-x64\n`)).toThrow("v0.1.0's SHA256SUMS has no motif-claude-code.zip");
  });

  test("names what's wrong with a marketplace file", () => {
    const good = marketplaceFile("v0.1.0", SUMS);
    const entry = good.plugins[0]!;
    const bad = {
      ...good,
      name: "tools",
      plugins: [{ ...entry, name: "motif-plugin", version: "0.1.0", source: { source: "archive", url: "http://example.com/x.zip", sha256: "abc" } }],
    };
    expect(marketplaceProblems(bad)).toEqual([
      'The marketplace must be named "motif".',
      'The plugin entry must be named "motif", as the plugin itself is.',
      "The plugin entry must not set a version: the zip's own plugin.json gives it.",
      "The plugin's URL must be a release's motif-claude-code.zip, not http://example.com/x.zip.",
      "The plugin's sha256 must be 64 lowercase hex characters.",
    ]);
    expect(marketplaceProblems({ ...good, plugins: [{ ...entry, source: { source: "github", repo: "7mxd/motif" } }] })).toContain(
      "The plugin must come from an archive source: the release's zip.",
    );
  });

  test.skipIf(!existsSync(FILE))("the repository's marketplace file is well formed", () => {
    expect(marketplaceProblems(JSON.parse(readFileSync(FILE, "utf8")))).toEqual([]);
  });
});
