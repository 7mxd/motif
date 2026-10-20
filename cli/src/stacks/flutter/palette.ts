// Whether a Dart file is the app's own palette: its typed colours define a theme (a ThemeExtension's instances, a
// ColorScheme, a class of static const Colors) rather than style widgets. motif check still flags them, with a hint.
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import type { Hit } from "../../check/types";
import { callArgs } from "./rules";
import { closingBrace } from "../../check/calls";

const IDENT = "[A-Za-z_$][\\w$]*";

/**
 * Where a file defines colours for a theme: ThemeExtension classes and their instances, ColorSchemes with two or more
 * typed colours (a seed alone isn't a palette), colour-constant classes. `colors` are the typed colours' places.
 */
function paletteRanges(code: string, colors: number[]): [number, number][] {
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
  for (const m of code.matchAll(/(?<![\w$.])ColorScheme(?:\.\w+)?\s*\(/g)) {
    const c = callArgs(code, m.index! + m[0].length - 1);
    if (c && colors.filter((i) => i >= m.index! && i <= c.close).length >= 2) ranges.push([m.index!, c.close + 1]);
  }
  return ranges;
}

/** The app's entry point: a file with main() or runApp is never a palette, whatever theme it builds (flutter create's main.dart). */
const ENTRY = /(?<![\w$.])(?:main\s*\([^)]*\)\s*(?:async\s*)?(?:\{|=>)|runApp\s*\()/;

/** True when most of a file's typed colours (at least one) are in its palette definitions, and it isn't the app's entry. */
export function dartPaletteFile(file: SourceFile, hits: Hit[]): boolean {
  const colors = hits.filter((h) => h.file === file.path && h.kind === "color");
  if (colors.length === 0) return false;
  const code = maskStrings(maskComments(file.text, "dart"), "dart");
  if (ENTRY.test(code)) return false;
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const places = colors.map((h) => starts[h.line - 1]! + h.column - 1);
  const ranges = paletteRanges(code, places);
  const inside = places.filter((index) => ranges.some(([a, b]) => index >= a && index < b));
  return inside.length > 0 && inside.length * 2 >= colors.length;
}
