// What the project's design guide (DESIGN.md) asks of the code, for check rules that follow the guide's own words.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * True when the guide's accessibility section keeps a line asking for start/end (or SwiftUI's leading/trailing) instead of left/right (the template's
 * "Layouts use start/end (not left/right), so right-to-left languages work."). False without that line or without a guide.
 */
export function startEndRequired(designMd: string | null): boolean {
  if (designMd === null) return false;
  const lines = designMd.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s.*accessibility/i.test(l));
  if (start < 0) return false;
  const level = /^#+/.exec(lines[start]!)![0].length;
  for (let i = start + 1; i < lines.length; i++) {
    const heading = /^(#+)\s/.exec(lines[i]!);
    if (heading && heading[1]!.length <= level) break;
    const l = lines[i]!.toLowerCase();
    // start/end, or SwiftUI's own words for them, leading/trailing.
    const startEnd = (/\bstart\b/.test(l) && /\bend\b/.test(l)) || (/\bleading\b/.test(l) && /\btrailing\b/.test(l));
    if (startEnd && /\bleft\b/.test(l) && /\bright\b/.test(l)) return true;
  }
  return false;
}

/** The project's DESIGN.md, or null when there is none. */
export function readDesignMd(root: string): string | null {
  const file = join(root, "DESIGN.md");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}
