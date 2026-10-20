// Whether a Swift file is the app's own palette: its typed colours define a theme (an extension Color of static lets, an enum
// of colour constants, top-level colour constants) rather than style views. motif check still flags them, with a hint.
import { closingBrace } from "../../check/calls";
import type { SourceFile } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import type { Hit } from "../../check/types";

const COLOR_TYPE = "(?:Color|UIColor|NSColor|CGColor)";
const EXTENSION = new RegExp(`(?<![\\w$])extension\\s+(?:SwiftUI\\.)?(?:${COLOR_TYPE}|ShapeStyle|ShapeStyle\\s+where\\s+Self\\s*==\\s*Color)\\b[^{;]*\\{`, "g");
const TYPE_BODY = /(?<![\w$])(?:enum|struct|class|final\s+class)\s+[A-Za-z_]\w*[^{;=()]*\{/g;
const STATIC_COLOR = new RegExp(`(?<![\\w$.])static\\s+(?:let|var)\\s+[A-Za-z_]\\w*\\s*(?::\\s*${COLOR_TYPE}\\s*)?(?:=\\s*(?:${COLOR_TYPE}\\b|\\.init\\b)|\\{)`, "g");
const TOP_LEVEL_COLOR = new RegExp(`^(?:(?:private|fileprivate|internal|public)\\s+)?(?:let|var)\\s+[A-Za-z_]\\w*\\s*(?::\\s*${COLOR_TYPE}\\s*)?=\\s*${COLOR_TYPE}\\b`, "gm");

/** Where a file defines colours for a theme. */
function paletteRanges(code: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of code.matchAll(EXTENSION)) ranges.push([m.index!, closingBrace(code, m.index! + m[0].length - 1)]);
  for (const m of code.matchAll(TYPE_BODY)) {
    const end = closingBrace(code, m.index! + m[0].length - 1);
    if ([...code.slice(m.index!, end).matchAll(STATIC_COLOR)].length >= 2) ranges.push([m.index!, end]);
  }
  for (const m of code.matchAll(TOP_LEVEL_COLOR)) {
    // A top-level declaration runs to the next line that starts at the margin.
    const next = code.slice(m.index! + m[0].length).search(/\n(?=[^\s)}\]])/);
    ranges.push([m.index!, next === -1 ? code.length : m.index! + m[0].length + next]);
  }
  return ranges;
}

/** The app's entry point: a file with @main or a WindowGroup is never a palette. */
const ENTRY = /@main\b|(?<![\w$.])WindowGroup\s*[({]/;

/** True when most of a file's typed colours (at least one) are in its palette definitions, and it isn't the app's entry. */
export function swiftUIPaletteFile(file: SourceFile, hits: Hit[]): boolean {
  const colors = hits.filter((h) => h.file === file.path && h.kind === "color");
  if (colors.length === 0) return false;
  const code = maskStrings(maskComments(file.text, "swift"), "swift");
  if (ENTRY.test(code)) return false;
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  const places = colors.map((h) => starts[h.line - 1]! + h.column - 1);
  const ranges = paletteRanges(code);
  const inside = places.filter((index) => ranges.some(([a, b]) => index >= a && index < b));
  return inside.length > 0 && inside.length * 2 >= colors.length;
}
