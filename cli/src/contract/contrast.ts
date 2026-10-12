import type { Finding } from "../findings";
import { contrastRatio } from "./color";
import { resolveMode, type Mode } from "./resolve";
import { MOTIF_EXT, type TokenDocument } from "./types";
import { validateValue, type DtcgColor } from "./values";

export type PairKind = "text" | "large-text" | "ui";

export const MIN_RATIO: Record<PairKind, number> = { text: 4.5, "large-text": 3, ui: 3 };

export interface ContrastPair {
  fg: string;
  bg: string;
  kind: PairKind;
}

const short = (path: string) => path.replace(/^color\./, "");

export function readPairs(doc: TokenDocument): { pairs: ContrastPair[]; findings: Finding[] } {
  const raw = (doc.rootExtensions?.[MOTIF_EXT] as { pairs?: unknown } | undefined)?.pairs;
  if (!Array.isArray(raw)) {
    return {
      pairs: [],
      findings: [{
        code: "no-pairs", severity: "error", file: doc.file,
        message: 'Your theme values don\'t list which text colors sit on which backgrounds ("pairs"), so readability can\'t be checked.',
      }],
    };
  }
  const pairs: ContrastPair[] = [];
  const findings: Finding[] = [];
  raw.forEach((p: any, i: number) => {
    const fgOk = typeof p?.fg === "string" && doc.tokens.has(p.fg);
    const bgOk = typeof p?.bg === "string" && doc.tokens.has(p.bg);
    const kindOk = p?.kind in MIN_RATIO;
    if (fgOk && bgOk && kindOk) {
      pairs.push({ fg: p.fg, bg: p.bg, kind: p.kind });
      return;
    }
    const problem = !fgOk ? `"${String(p?.fg)}" doesn't exist` : !bgOk ? `"${String(p?.bg)}" doesn't exist` : `kind must be "text", "large-text" or "ui"`;
    findings.push({ code: "bad-pair", severity: "error", file: doc.file, message: `Contrast pair #${i + 1}: ${problem}.` });
  });
  return { pairs, findings };
}

function colorIn(doc: TokenDocument, path: string, mode: Mode): DtcgColor | null {
  const r = resolveMode(doc, path, mode);
  if (!r.ok || r.type !== "color" || validateValue("color", r.value) !== null) return null;
  return r.value as DtcgColor;
}

export function checkContrast(doc: TokenDocument): { findings: Finding[]; checked: number } {
  const { pairs, findings } = readPairs(doc);
  const modes: Mode[] = ["light", "dark"];
  for (const pair of pairs) {
    for (const mode of modes) {
      const fg = colorIn(doc, pair.fg, mode);
      const bg = colorIn(doc, pair.bg, mode);
      if (!fg || !bg) continue; // broken values are reported by validateTokens
      const ratio = contrastRatio(fg, bg);
      const min = MIN_RATIO[pair.kind];
      if (ratio < min) {
        const shown = (Math.floor(ratio * 100) / 100).toFixed(2);
        findings.push({
          code: "low-contrast", severity: "error", file: doc.file,
          line: doc.tokens.get(pair.fg)?.line, path: pair.fg,
          message: `In ${mode} mode, "${short(pair.fg)}" on "${short(pair.bg)}" is hard to read: ${shown}:1, needs at least ${min}:1.`,
        });
      }
    }
  }
  return { findings, checked: pairs.length * modes.length };
}
