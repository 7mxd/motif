// A font file's own tables (names, weight, italic bit, weight axis, Arabic coverage), read the same way for every stack.
// The reader never throws: a file it can't read, or one too large, is null, and the caller knows it by its name.
import { readFileSync, statSync } from "node:fs";

/** What a TrueType or OpenType file's tables say: its names (1, 4, 6, 16), OS/2 weight and italic bit, fvar weight axis and Arabic coverage. */
export interface FontTables {
  family?: string;
  names: string[];
  weight?: number;
  italic?: boolean;
  wght?: { min: number; max: number };
  arabic: boolean;
}

/** Larger than any font an app ships (a CJK family's file is about 20 MB): such a file is read by its name alone. */
const MAX_FONT_BYTES = 30 * 1024 * 1024;

/**
 * A font file's tables, or null when it can't be read (missing, too large, not a TrueType or OpenType file, or
 * malformed): the file is then known by its name. Never throws.
 */
export function readFontTables(path: string): FontTables | null {
  try {
    if (statSync(path).size > MAX_FONT_BYTES) return null;
    return parseFontTables(readFileSync(path));
  } catch {
    return null;
  }
}

/** The tables of a font file's bytes; null when it isn't a TrueType or OpenType file. Reads are bounds-checked. */
function parseFontTables(b: Buffer): FontTables | null {
  const u16 = (at: number) => (at >= 0 && at + 2 <= b.length ? b.readUInt16BE(at) : -1);
  const u32 = (at: number) => (at >= 0 && at + 4 <= b.length ? b.readUInt32BE(at) : -1);
  const fixed = (at: number) => (at >= 0 && at + 4 <= b.length ? b.readInt32BE(at) / 65536 : NaN);
  const tag = u32(0);
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
  const table = new Map<string, number>();
  for (let i = 0, n = u16(4); i < n && i < 128; i++) {
    const rec = 12 + i * 16;
    table.set(b.toString("latin1", rec, rec + 4), u32(rec + 8));
  }
  const out: FontTables = { names: [], arabic: false };

  // name: Windows Unicode (3, 1 or 10) in English first, else Mac Roman.
  const name = table.get("name");
  if (name !== undefined) {
    const count = u16(name + 2);
    const strings = name + u16(name + 4);
    const found = new Map<number, { score: number; text: string }>();
    for (let i = 0; i < count && i < 1000; i++) {
      const rec = name + 6 + i * 12;
      const [platform, encoding, language, id, length, offset] = [u16(rec), u16(rec + 2), u16(rec + 4), u16(rec + 6), u16(rec + 8), u16(rec + 10)];
      if (![1, 4, 6, 16].includes(id) || strings < 0 || offset < 0 || length < 0 || strings + offset + length > b.length) continue;
      const raw = b.subarray(strings + offset, strings + offset + length);
      // UTF-16 names have an even length; an odd one is malformed, and skipped.
      if ((platform === 3 || platform === 0) && length % 2 === 1) continue;
      let text: string | undefined;
      let score = 0;
      if (platform === 3 && (encoding === 1 || encoding === 10)) {
        text = Buffer.from(raw).swap16().toString("utf16le");
        score = language === 0x409 ? 3 : 2;
      } else if (platform === 0) {
        text = Buffer.from(raw).swap16().toString("utf16le");
        score = 2;
      } else if (platform === 1 && encoding === 0) {
        text = raw.toString("latin1");
        score = language === 0 ? 1 : 0;
      }
      if (text && text.trim() && (found.get(id)?.score ?? -1) < score) found.set(id, { score, text: text.trim() });
    }
    out.family = found.get(16)?.text ?? found.get(1)?.text;
    out.names = [1, 4, 6, 16].flatMap((id) => (found.has(id) ? [found.get(id)!.text] : []));
  }

  const os2 = table.get("OS/2");
  if (os2 !== undefined) {
    const weight = u16(os2 + 4);
    if (weight >= 1 && weight <= 1000) out.weight = weight;
    const selection = u16(os2 + 62);
    if (selection >= 0) out.italic = (selection & 1) === 1;
  }

  const fvar = table.get("fvar");
  if (fvar !== undefined) {
    const [axesAt, axes, size] = [u16(fvar + 4), u16(fvar + 8), u16(fvar + 10)];
    for (let i = 0; i < axes && i < 64; i++) {
      const rec = fvar + axesAt + i * size;
      if (b.toString("latin1", rec, rec + 4) === "wght") out.wght = { min: fixed(rec + 4), max: fixed(rec + 12) };
    }
  }

  // cmap formats 4 and 12: at least 28 code points of U+0600–06FF (the Arabic alphabet).
  const cmap = table.get("cmap");
  if (cmap !== undefined) {
    const overlap = (start: number, end: number) => Math.max(0, Math.min(end, 0x06ff) - Math.max(start, 0x0600) + 1);
    for (let i = 0, n = u16(cmap + 2); i < n && i < 64 && !out.arabic; i++) {
      const sub = cmap + u32(cmap + 4 + i * 8 + 4);
      let covered = 0;
      if (u16(sub) === 4) {
        const segs = u16(sub + 6) / 2;
        for (let k = 0; k < segs; k++) covered += overlap(u16(sub + 16 + segs * 2 + k * 2), u16(sub + 14 + k * 2));
      } else if (u16(sub) === 12) {
        for (let k = 0, groups = u32(sub + 12); k < groups && k < 100_000; k++) covered += overlap(u32(sub + 16 + k * 12), u32(sub + 20 + k * 12));
      }
      out.arabic = covered >= 28;
    }
  }
  return out;
}
