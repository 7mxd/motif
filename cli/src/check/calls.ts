// Reading calls in masked Dart or Kotlin: a call's arguments, the named argument around a place, the callee. Shared by the
// native stacks' check rules; Dart names arguments with ":" and Kotlin with "=".
export type NamedWith = ":" | "=";

const NAME_AT_START: Record<NamedWith, RegExp> = {
  ":": /^([A-Za-z_$][\w$]*)\s*:(?!:)\s*/,
  "=": /^([A-Za-z_][\w]*)\s*=(?!=)\s*/,
};
const NAME_AT_START_LEAD: Record<NamedWith, RegExp> = {
  ":": /^\s*([A-Za-z_$][\w$]*)\s*:(?!:)/,
  "=": /^\s*([A-Za-z_][\w]*)\s*=(?!=)/,
};
const OPENERS = "([{";
const CLOSERS = ")]}";

export interface Arg {
  /** The named argument's name (padding: …), if it has one. */
  name?: string;
  /** Where the argument starts (its name, if it has one). */
  start: number;
  end: number;
  /** The value, trimmed, and where it starts. */
  value: string;
  valueStart: number;
}

/** The arguments of the call whose "(" is at `open` (on masked text), and the index of its ")". Null when it doesn't close. */
export function callArgs(text: string, open: number, named: NamedWith = ":"): { args: Arg[]; close: number } | null {
  const args: Arg[] = [];
  let depth = 0;
  let from = open + 1;
  const push = (to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body === "") return;
    const start = from + lead;
    const found = body.match(NAME_AT_START[named]);
    const value = found ? body.slice(found[0].length) : body;
    args.push({ ...(found ? { name: found[1] } : {}), start, end: start + body.length, value, valueStart: start + (found ? found[0].length : 0) });
  };
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i]!;
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) {
      if (depth === 0) {
        push(i);
        return { args, close: i };
      }
      depth--;
    } else if (c === "," && depth === 0) {
      push(i);
      from = i + 1;
    }
  }
  return null;
}

/** Walking back from `index`: where its argument starts, and the bracket that holds it (-1 at a statement's start). */
export function enclosing(text: string, index: number): { argStart: number; open: number } {
  let depth = 0;
  let argStart = -1;
  for (let i = index - 1; i >= 0; i--) {
    const c = text[i]!;
    if (CLOSERS.includes(c)) depth++;
    else if (OPENERS.includes(c)) {
      if (depth === 0) return { argStart: argStart === -1 ? i + 1 : argStart, open: i };
      depth--;
    } else if (depth === 0 && c === "," && argStart === -1) argStart = i + 1;
    else if (depth === 0 && c === ";") return { argStart: argStart === -1 ? i + 1 : argStart, open: -1 };
  }
  return { argStart: argStart === -1 ? 0 : argStart, open: -1 };
}

/** The constructor or function whose "(" is at `open`: BoxDecoration, Border.all (a library prefix dropped). */
export function callee(text: string, open: number): string {
  if (open < 0 || text[open] !== "(") return "";
  const m = text.slice(Math.max(0, open - 200), open).match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?:<[^<>()]*>)?\s*$/);
  if (!m) return "";
  const parts = m[1]!.split(".");
  const last = parts[parts.length - 1]!;
  return /^[A-Z]/.test(last) || parts.length === 1 ? last : parts.slice(-2).join(".");
}

/** The nearest named argument around `index` (climbing out of wrapper calls), and the call it's given to. */
export function namedArgument(text: string, index: number, named: NamedWith = ":"): { name: string; call: string } | null {
  let at = index;
  for (let level = 0; level < 8; level++) {
    const { argStart, open } = enclosing(text, at);
    const m = text.slice(argStart, at).match(NAME_AT_START_LEAD[named]);
    if (m) return { name: m[1]!, call: callee(text, open) };
    if (open === -1 || text[open] === "{") return null;
    at = open;
  }
  return null;
}


/** The index just past the brace that closes the one at `open` (on masked text). */
export function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}
