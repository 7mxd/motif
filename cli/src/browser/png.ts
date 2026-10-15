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
