import { afterAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gunzipSync, unzipSync } from "fflate";
import { SKILL_TGZ, SKILL_ZIP, skillArchiveEntries, skillTarGz, skillZip } from "../scripts/skill-archive";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, base) : [relative(base, path).replace(/\\/g, "/")];
  });
}

/** Each tar entry's name and mode, read from its headers. */
function tarModes(tgz: Uint8Array): Map<string, number> {
  const tar = gunzipSync(tgz);
  const out = new Map<string, number>();
  const text = (from: number, len: number) => new TextDecoder().decode(tar.subarray(from, from + len)).replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= tar.length; ) {
    const name = text(at, 100);
    if (!name) break;
    const size = parseInt(text(at + 124, 12), 8);
    out.set(name, parseInt(text(at + 100, 8), 8));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

describe("the skill archives", () => {
  const entries = skillArchiveEntries();
  const names = entries.map(([n]) => n);

  test("are named as the release and the install scripts expect", () => {
    expect([SKILL_ZIP, SKILL_TGZ]).toEqual(["motif-skill.zip", "motif-skill.tar.gz"]);
  });

  test("hold the whole skill as motif/, and OpenCode's /motif command", () => {
    expect(names.filter((n) => n.startsWith("motif/")).map((n) => n.slice(6)).sort()).toEqual(walk(join(REPO, "skill")).sort());
    expect(names).toContain("opencode/commands/motif.md");
    expect(names).toEqual([...names].sort());
  });

  test("the tarball unpacks with tar; only the bootstrap is executable", () => {
    const dir = tempDir("motif-tgz-");
    writeFileSync(join(dir, SKILL_TGZ), skillTarGz(entries));
    const r = Bun.spawnSync(["tar", "-xzf", SKILL_TGZ], { cwd: dir });
    expect({ code: r.exitCode, err: r.stderr.toString() }).toMatchObject({ code: 0 });
    expect(readFileSync(join(dir, "motif/SKILL.md"), "utf8")).toBe(readFileSync(join(REPO, "skill/SKILL.md"), "utf8"));
    const modes = tarModes(skillTarGz(entries));
    expect(modes.get("motif/bin/motif")).toBe(0o755);
    expect([...modes].filter(([n, m]) => n !== "motif/bin/motif" && m !== 0o644)).toEqual([]);
  });

  test("the zip holds the same files", () => {
    expect(Object.keys(unzipSync(skillZip(entries))).sort()).toEqual([...names].sort());
  });

  test("the same files give the same bytes, in any time zone, with no date in the gzip header", () => {
    const before = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(skillZip(entries)).toEqual(skillZip(entries));
      const tgz = skillTarGz(entries);
      expect(tgz).toEqual(skillTarGz(entries));
      expect([...tgz.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  test("refuse a name too long for tar, and a bootstrap with Windows line endings", () => {
    expect(() => skillTarGz([[`motif/${"x".repeat(120)}.md`, new Uint8Array(1), 0o644]])).toThrow("longer than a tar name can be");
    const crlf = entries.map(([n, d, m]): [string, Uint8Array, number] => [n, n === "motif/bin/motif" ? new TextEncoder().encode("#!/bin/sh\r\n") : d, m]);
    expect(() => skillTarGz(crlf)).toThrow("has Windows line endings");
    expect(() => skillZip(crlf)).toThrow("has Windows line endings");
  });
});
