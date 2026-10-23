// One font-file reader for every stack (v0.5.0 sweep, Task 5 fix round 2): it never throws, whatever the bytes.
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFontTables } from "../src/extract/font-file";
import { coversArabic } from "../src/extract/own-fonts";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const READEX = readFileSync(join(import.meta.dir, "../../tests/fixtures/swiftui-contract-app/Qahwa/Fonts/ReadexPro.ttf"));

describe("readFontTables and coversArabic", () => {
  const dir = tempDir("motif-font-file-");
  let n = 0;
  const file = (bytes: Buffer) => {
    const path = join(dir, `f${n++}.ttf`);
    writeFileSync(path, bytes);
    return path;
  };

  test("a real font: its family and its Arabic letters", () => {
    expect(readFontTables(file(READEX))).toMatchObject({ family: "Readex Pro", arabic: true });
    expect(coversArabic(file(READEX))).toBe(true);
  });

  test("the review's 28-byte file (a cmap record at offset 0), under each tag, isn't Arabic and doesn't throw", () => {
    for (const tag of [0x4f54544f, 0x74727565, 0x00010000]) {
      const b = Buffer.alloc(28);
      b.writeUInt32BE(tag, 0);
      b.writeUInt16BE(1, 4);
      b.write("cmap", 12, "latin1");
      b.writeUInt32BE(0, 20);
      expect(coversArabic(file(b))).toBe(false);
    }
  });

  test("empty, cut short, damaged and random files never throw", () => {
    let seed = 11;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const cases = [Buffer.alloc(0), ...[4, 6, 12, 13, 28, 50, 200, 1000].map((k) => READEX.subarray(0, k))];
    for (let s = 0; s < 150; s++) {
      const b = Buffer.from(READEX.subarray(0, 4000 + s * 40));
      for (let k = 0; k < 40; k++) b[Math.floor(random() * Math.min(b.length, 3000))] = Math.floor(random() * 256);
      cases.push(b);
      const noise = Buffer.from(Array.from({ length: 32 + ((s * 37) % 3000) }, () => Math.floor(random() * 256)));
      noise.writeUInt32BE([0x00010000, 0x4f54544f, 0x74727565][s % 3]!, 0);
      cases.push(noise);
    }
    for (const b of cases) {
      const path = file(b);
      expect(() => coversArabic(path)).not.toThrow();
      expect(() => readFontTables(path)).not.toThrow();
    }
  });

  test("a missing file is no font", () => {
    expect(readFontTables(join(dir, "missing.ttf"))).toBeNull();
    expect(coversArabic(join(dir, "missing.ttf"))).toBe(false);
  });
});
