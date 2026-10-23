import { inflateSync } from "node:zlib";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || !SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error("Not a PNG image.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const bigEndian = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** A PNG's chunks in order: each one's type, its data, and where it ends. */
function* chunks(bytes: Uint8Array): Generator<{ type: string; data: Uint8Array; end: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    yield { type, data: bytes.subarray(at + 8, at + 8 + length), end };
    if (type === "IEND") return;
    at = end;
  }
}

/** The PNG with a text note added (a standard tEXt chunk, after the header); key and value are plain ASCII. */
export function addPngText(bytes: Uint8Array, key: string, value: string): Uint8Array {
  pngSize(bytes);
  const header = chunks(bytes).next().value!;
  const typed = new TextEncoder().encode(`tEXt${key}\0${value}`);
  const chunk = new Uint8Array(typed.length + 8);
  chunk.set(bigEndian(typed.length - 4), 0);
  chunk.set(typed, 4);
  chunk.set(bigEndian(Bun.hash.crc32(typed)), typed.length + 4);
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, header.end), 0);
  out.set(chunk, header.end);
  out.set(bytes.subarray(header.end), header.end + chunk.length);
  return out;
}

/** A text note kept in the PNG under this key, if there is one. */
export function readPngText(bytes: Uint8Array, key: string): string | undefined {
  pngSize(bytes);
  for (const chunk of chunks(bytes)) {
    if (chunk.type !== "tEXt") continue;
    const text = new TextDecoder("latin1").decode(chunk.data);
    const split = text.indexOf("\0");
    if (split >= 0 && text.slice(0, split) === key) return text.slice(split + 1);
  }
  return undefined;
}

/** An 8-bit RGB or RGBA PNG, decoded: its size and its pixels as RGBA, row by row. */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const buf = Buffer.from(png);
  if (buf.length < 29 || buf.toString("latin1", 1, 4) !== "PNG") throw new Error("Not a PNG.");
  const depth = buf[24];
  const colourType = buf[25];
  const interlace = buf[28];
  if (depth !== 8 || (colourType !== 2 && colourType !== 6) || interlace !== 0) {
    throw new Error(`Only 8-bit RGB or RGBA PNGs without interlacing can be decoded here (this one is ${depth}-bit, colour type ${colourType}, ${interlace ? "interlaced" : "not interlaced"}).`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bpp = colourType === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    if (buf.toString("latin1", at + 4, at + 8) === "IDAT") chunks.push(buf.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const line = new Uint8Array(stride);
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? line[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[x] = (v + [0, a, b, (a + b) >> 1, paeth][filter]!) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 4; k++) rgba[(y * width + x) * 4 + k] = k < bpp ? line[x * bpp + k]! : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}
