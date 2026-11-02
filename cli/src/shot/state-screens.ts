import type { StateScript } from "./capture";

/** The comment a state script names its screens in: `// motif-screens: /#/applications/*, /#/matches/*`. */
export const SCREENS_LINE = "motif-screens:";

// The script's leading region: comments, blank lines and, in Dart, Kotlin and Swift, the lines that bring code in.
const LEADING = /^\s*(?:$|\/\/|\/\*|(?:@testable\s+)?import\b|(?:package|part|library)\b)/;

/**
 * The screens a state script's `// motif-screens:` line names, read only from the script's leading region; null when
 * there is no line there.
 */
export function readScreensLine(script: string): string[] | null | { error: string } {
  let inBlock = false;
  for (const line of script.split(/\r?\n/)) {
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    const found = /^\s*\/\/\s*motif-screens:(.*)$/.exec(line);
    if (found) {
      const screens = found[1]!.split(",").map((s) => s.trim()).filter(Boolean);
      if (screens.length === 0) {
        return { error: `the "// ${SCREENS_LINE}" line names no screen; list them after it, like // ${SCREENS_LINE} /settings, /#/applications/*.` };
      }
      return screens;
    }
    if (!LEADING.test(line)) return null;
    if (/^\s*\/\*/.test(line) && !line.includes("*/")) inBlock = true;
  }
  return null;
}

// A route as it's matched: no query string, no trailing slash (but "/" stays "/").
function bare(route: string): string {
  const path = route.split("?")[0]!;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Whether a screen in a state's line names this screen: `*` stands for exactly one path segment. */
export function screenMatches(pattern: string, screen: string): boolean {
  const p = bare(pattern).split("/");
  const s = bare(screen).split("/");
  return p.length === s.length && p.every((part, i) => part === "*" ? s[i] !== "" : part === s[i]);
}

/** Whether a state runs on this screen: everywhere when its script has no line. */
export function runsOn(state: Pick<StateScript, "screens">, screen: string): boolean {
  return !state.screens || state.screens.some((p) => screenMatches(p, screen));
}
