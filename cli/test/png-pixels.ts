import { inflateSync } from "node:zlib";

/** An 8-bit RGB or RGBA PNG, decoded: its size and its pixels as RGBA, row by row. */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const buf = Buffer.from(png);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bpp = buf[25] === 6 ? 4 : 3;
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

/** The pixel at x, y as [r, g, b, a]. */
export function pixel(png: Uint8Array, x: number, y: number): number[] {
  const { width, rgba } = decodePng(png);
  return [...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
}
