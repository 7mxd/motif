// Whether a Kotlin file is the app's own palette: its typed colours define a theme (the template's Color.kt of top-level
// vals, a lightColorScheme(…), an object of colour constants) rather than style composables. motif check still flags them,
// with a hint.
import { callArgs, closingBrace } from "../../check/calls";
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import type { Hit } from "../../check/types";

const TOP_LEVEL_COLOR = /^(?:(?:private|internal|public)\s+)?(?:const\s+)?val\s+[A-Za-z_]\w*\s*(?::\s*Color\s*)?=\s*Color\b/gm;
const COLOR_CONSTANT = /(?<![\w$.])(?:const\s+)?val\s+[A-Za-z_]\w*\s*(?::\s*Color\s*)?=\s*Color\b/g;
const SCHEME = /(?<![\w$.])(?:lightColorScheme|darkColorScheme|ColorScheme|lightColors|darkColors)\s*\(/g;
const OBJECT = /(?<![\w$])object\b[^{;=()]*\{/g;

/** Where a file defines colours for a theme: top-level colour vals, colour schemes with two or more typed colours, objects of colour constants. */
function paletteRanges(code: string, colors: number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of code.matchAll(TOP_LEVEL_COLOR)) {
    // A top-level declaration runs to the next line that starts at the margin.
    const next = code.slice(m.index! + m[0].length).search(/\n(?=[^\s)}\]])/);
    ranges.push([m.index!, next === -1 ? code.length : m.index! + m[0].length + next]);
  }
  for (const m of code.matchAll(SCHEME)) {
    const call = callArgs(code, m.index! + m[0].length - 1, "=");
    if (call && colors.filter((i) => i >= m.index! && i <= call.close).length >= 2) ranges.push([m.index!, call.close + 1]);
  }
  for (const m of code.matchAll(OBJECT)) {
    const end = closingBrace(code, m.index! + m[0].length - 1);
    if ([...code.slice(m.index!, end).matchAll(COLOR_CONSTANT)].length >= 2) ranges.push([m.index!, end]);
  }
  return ranges;
}

/** The app's entry point: a file that calls setContent or subclasses ComponentActivity is never a palette. */
const ENTRY = /(?<![\w$.])setContent\s*[({]|(?<![\w$.])ComponentActivity\s*\(/;

/** True when most of a file's typed colours (at least one) are in its palette definitions, and it isn't the app's entry. */
export function composePaletteFile(file: SourceFile, hits: Hit[]): boolean {
  const colors = hits.filter((h) => h.file === file.path && h.kind === "color");
  if (colors.length === 0) return false;
  const code = maskStrings(maskComments(file.text, "kotlin"), "kotlin");
  if (ENTRY.test(code)) return false;
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const places = colors.map((h) => starts[h.line - 1]! + h.column - 1);
  const ranges = paletteRanges(code, places);
  const inside = places.filter((index) => ranges.some(([a, b]) => index >= a && index < b));
  return inside.length > 0 && inside.length * 2 >= colors.length;
}
