import { describe, expect, test } from "bun:test";
import { addPngText, pngSize, readPngText } from "../src/browser/png";
import { decodePng } from "./png-pixels";

// A 1×1 PNG.
const ONE_PIXEL = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

describe("text kept inside a PNG", () => {
  test("is read back by its key, and the image is otherwise the same", () => {
    const value = '{"width":430,"top":600,"height":855}';
    const tagged = addPngText(ONE_PIXEL, "motif:screen", value);
    expect(readPngText(tagged, "motif:screen")).toBe(value);
    expect(readPngText(tagged, "other")).toBeUndefined();
    expect(pngSize(tagged)).toEqual(pngSize(ONE_PIXEL));
    // The original bytes are all still there, plus one chunk.
    expect(tagged.length).toBe(ONE_PIXEL.length + 12 + "motif:screen".length + 1 + value.length);
  });

  test("the chunk's checksum is right (checked with a CRC-32 written out here, not the one the code uses)", () => {
    const crc32 = (bytes: Uint8Array) => {
      let c = ~0;
      for (const b of bytes) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
      }
      return ~c >>> 0;
    };
    const tagged = addPngText(ONE_PIXEL, "k", "v");
    // Signature (8) + IHDR (25), then the new chunk: length 3, "tEXt", "k\0v", CRC.
    const chunk = tagged.subarray(33, 33 + 4 + 4 + 3 + 4);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    expect(view.getUint32(0)).toBe(3);
    expect(view.getUint32(11)).toBe(crc32(chunk.subarray(4, 11)));
  });

  test("a PNG without it has none, and anything that isn't a PNG is refused", () => {
    expect(readPngText(ONE_PIXEL, "motif:screen")).toBeUndefined();
    expect(() => addPngText(new Uint8Array([1, 2, 3]), "k", "v")).toThrow("Not a PNG");
  });
});

describe("the tests' PNG decoder", () => {
  const withHeader = (at: number, value: number) => {
    const copy = new Uint8Array(ONE_PIXEL);
    copy[at] = value;
    return copy;
  };
  test("decodes an 8-bit RGBA PNG and refuses what it would decode wrongly", () => {
    const ok = decodePng(ONE_PIXEL);
    expect([ok.width, ok.height, ok.rgba.length]).toEqual([1, 1, 4]);
    expect(() => decodePng(withHeader(24, 16))).toThrow(/8-bit RGB or RGBA/);
    expect(() => decodePng(withHeader(25, 3))).toThrow(/colour type 3/);
    expect(() => decodePng(withHeader(25, 0))).toThrow(/colour type 0/);
    expect(() => decodePng(withHeader(28, 1))).toThrow(/interlaced/);
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/Not a PNG/);
  });
});
