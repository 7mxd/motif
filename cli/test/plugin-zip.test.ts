import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { buildPlugin } from "../scripts/build-plugin";
import { ZIP_NAME, zipPlugin } from "../scripts/zip-plugin";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();

/** Each entry's name and Unix mode, read from the zip's central directory. */
function modes(zip: Uint8Array): Map<string, number> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, number>();
  for (let n = 0; n < count; n++) {
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    out.set(new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)), view.getUint32(at + 38, true) >>> 16);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

describe("the plugin zip a release carries", () => {
  const dir = join(tempDir("motif-pluginzip-"), "claude-code");
  buildPlugin(dir);
  const zip = zipPlugin(dir, VERSION);
  const files = unzipSync(zip);

  test("is named as the release and the marketplace expect", () => {
    expect(ZIP_NAME).toBe("motif-claude-code.zip");
  });

  test("holds the plugin with its manifest and skills at the top, with forward slashes", () => {
    for (const f of [
      ".claude-plugin/plugin.json", "skills/motif/SKILL.md", "skills/motif/VERSION", "skills/motif/bin/motif", "skills/motif/bin/motif.cmd",
      "skills/design/SKILL.md", "skills/feature/SKILL.md", "skills/init/SKILL.md", "skills/review/SKILL.md",
    ]) expect(Object.keys(files)).toContain(f);
    expect(JSON.parse(new TextDecoder().decode(files[".claude-plugin/plugin.json"]!)).version).toBe(VERSION);
    expect(Object.keys(files).filter((f) => f.includes("\\"))).toEqual([]);
  });

  test("the bootstrap is executable with Unix line endings; other files aren't executable", () => {
    const m = modes(zip);
    expect(m.get("skills/motif/bin/motif")! & 0o111).not.toBe(0);
    expect(m.get("skills/motif/SKILL.md")! & 0o777).toBe(0o644);
    expect(new TextDecoder().decode(files["skills/motif/bin/motif"]!)).not.toContain("\r");
  });

  test("the same build gives the same zip", () => {
    expect(zipPlugin(dir, VERSION)).toEqual(zip);
  });

  test("a build of another version is refused", () => {
    expect(() => zipPlugin(dir, "9.9.9")).toThrow(`The plugin's version is ${VERSION}, not 9.9.9`);
  });
});
