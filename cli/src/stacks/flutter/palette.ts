// Whether a Dart file is the app's own palette: its typed colours define a theme (a ThemeExtension's instances, a
// ColorScheme, a class of static const Colors) rather than style widgets. motif check still flags them, with a hint.
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import type { Hit } from "../../check/types";
import { callArgs } from "./rules";

const IDENT = "[A-Za-z_$][\\w$]*";

/** The index just past the brace that closes the one at `open` (on masked text). */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

/** Where a file defines colours for a theme: ThemeExtension classes and their instances, ColorSchemes, colour-constant classes. */
function paletteRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  const call = (open: number, from: number) => {
    const c = callArgs(code, open);
    if (c) ranges.push([from, c.close + 1]);
  };
  for (const m of code.matchAll(new RegExp(`(?<![\\w$])class\\s+(${IDENT})[^{;]*\\{`, "g"))) {
    const open = m.index! + m[0].length - 1;
    const end = closingBrace(code, open);
    const body = code.slice(open, end);
    const extension = /\bextends\s+ThemeExtension\s*</.test(m[0]);
    const constants = [...body.matchAll(/(?<![\w$.])static\s+const\s+Color\s+[A-Za-z_$][\w$]*\s*=/g)].length;
    if (!extension && constants < 2) continue;
    ranges.push([m.index!, end]);
    // A ThemeExtension's instances, wherever in the file they are built.
    if (extension) {
      const name = m[1]!.replace(/\$/g, "\\$");
      for (const i of code.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "g"))) call(i.index! + i[0].length - 1, i.index!);
    }
  }
  for (const m of code.matchAll(/(?<![\w$.])ColorScheme(?:\.\w+)?\s*\(/g)) call(m.index! + m[0].length - 1, m.index!);
  return ranges;
}

/** True when most of a file's typed colours (at least one) are in its palette definitions. */
export function dartPaletteFile(file: SourceFile, hits: Hit[]): boolean {
  const colors = hits.filter((h) => h.file === file.path && h.kind === "color");
  if (colors.length === 0) return false;
  const code = maskStrings(maskComments(file.text, "dart"), "dart");
  const ranges = paletteRanges(code);
  if (ranges.length === 0) return false;
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const inside = colors.filter((h) => {
    const index = starts[h.line - 1]! + h.column - 1;
    return ranges.some(([a, b]) => index >= a && index < b);
  });
  return inside.length * 2 >= colors.length;
}
