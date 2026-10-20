// Which writing systems a font file has letters for, read from its cmap table, so the harness can tell text in a
// script no loaded font draws (Arabic in a Latin-only font with no Arabic fallback: boxes under flutter test, where
// there's no system font to fall back to).
import { readFileSync } from "node:fs";

/** The scripts the harness tells apart (its _scripts ranges use the same ids), each with letters a font for it has. */
export const SCRIPTS: { id: string; name: string; probe: number[] }[] = [
  { id: "arabic", name: "Arabic", probe: [0x0627, 0x0628, 0x0644] },
  { id: "hebrew", name: "Hebrew", probe: [0x05d0, 0x05e9] },
  { id: "greek", name: "Greek", probe: [0x03b1, 0x03c9] },
  { id: "cyrillic", name: "Cyrillic", probe: [0x0430, 0x044f] },
  { id: "devanagari", name: "Devanagari", probe: [0x0915, 0x0939] },
  { id: "thai", name: "Thai", probe: [0x0e01, 0x0e2e] },
  { id: "han", name: "Chinese", probe: [0x4e00, 0x4e2d] },
  { id: "kana", name: "Japanese", probe: [0x3042, 0x30a2] },
  { id: "hangul", name: "Korean", probe: [0xac00] },
];

/** A script's name in plain words (Arabic), from its id. */
export const scriptName = (id: string) => SCRIPTS.find((s) => s.id === id)?.name ?? id;

/** Whether a font maps a code point to a glyph, from its cmap (formats 4 and 12, Unicode subtables); null when unreadable. */
export function cmapLookup(bytes: Uint8Array): ((cp: number) => boolean) | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o);
  const u32 = (o: number) => view.getUint32(o);
  try {
    // A collection (ttcf): its first font.
    const font = u32(0) === 0x74746366 ? u32(12) : 0;
    const tables = u16(font + 4);
    let cmap = -1;
    for (let i = 0; i < tables; i++) {
      const rec = font + 12 + i * 16;
      if (u32(rec) === 0x636d6170) cmap = u32(rec + 8);
    }
    if (cmap < 0) return null;
    const lookups: ((cp: number) => boolean)[] = [];
    const subtables = u16(cmap + 2);
    for (let i = 0; i < subtables; i++) {
      const rec = cmap + 4 + i * 8;
      const platform = u16(rec);
      const encoding = u16(rec + 2);
      if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
      const at = cmap + u32(rec + 4);
      const format = u16(at);
      if (format === 4) {
        const segs = u16(at + 6) / 2;
        const ends = at + 14;
        const starts = ends + segs * 2 + 2;
        const deltas = starts + segs * 2;
        const offsets = deltas + segs * 2;
        lookups.push((cp) => {
          if (cp > 0xffff) return false;
          for (let s = 0; s < segs; s++) {
            if (cp > u16(ends + s * 2)) continue;
            const start = u16(starts + s * 2);
            if (cp < start) return false;
            const offset = u16(offsets + s * 2);
            if (offset === 0) return ((cp + u16(deltas + s * 2)) & 0xffff) !== 0;
            const glyphAt = offsets + s * 2 + offset + (cp - start) * 2;
            const glyph = glyphAt + 2 <= bytes.byteLength ? u16(glyphAt) : 0;
            return glyph !== 0 && ((glyph + u16(deltas + s * 2)) & 0xffff) !== 0;
          }
          return false;
        });
      } else if (format === 12) {
        const groups = u32(at + 12);
        lookups.push((cp) => {
          for (let g = 0; g < groups; g++) {
            const rec = at + 16 + g * 12;
            if (cp >= u32(rec) && cp <= u32(rec + 4)) return u32(rec + 8) !== 0 || cp !== u32(rec);
          }
          return false;
        });
      }
    }
    return lookups.length > 0 ? (cp) => lookups.some((l) => l(cp)) : null;
  } catch {
    return null;
  }
}

/** The scripts (SCRIPTS ids) a font file has every probe letter of; none when it can't be read. */
export function fontFileScripts(bytes: Uint8Array): string[] {
  const has = cmapLookup(bytes);
  return has ? SCRIPTS.filter((s) => s.probe.every(has)).map((s) => s.id) : [];
}

/** The scripts the font files of a family cover between them, each file read once per cache. */
export function familyScripts(files: string[], cache: Map<string, string[]> = new Map()): string[] {
  const out = new Set<string>();
  for (const file of files) {
    let scripts = cache.get(file);
    if (!scripts) {
      try {
        scripts = fontFileScripts(readFileSync(file));
      } catch {
        scripts = [];
      }
      cache.set(file, scripts);
    }
    for (const s of scripts) out.add(s);
  }
  return SCRIPTS.map((s) => s.id).filter((id) => out.has(id));
}
