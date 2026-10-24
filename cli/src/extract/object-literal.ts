import { maskComments } from "../check/mask";

/** Comments and string contents blanked (quotes and positions kept), so structure is read from code alone. */
export function maskCode(original: string): string {
  const text = maskComments(original, "script");
  const out = text.split("");
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") {
        if (text[i + 1] !== "\n") out[i + 1] = " ";
        out[i] = " ";
        i++;
      } else if (c === quote) quote = null;
      else if (c === "\n" && quote !== "`") quote = null;
      else if (c !== "\n" && c !== "\r") out[i] = " ";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
  }
  return out.join("");
}

export interface Entry { key: string; keyStart: number; value: Obj | Leaf }
export interface Obj { entries: Entry[]; start: number; end: number }
export interface Leaf { text: string; start: number }
export const isObj = (v: Obj | Leaf): v is Obj => "entries" in v;

const IDENT = "[A-Za-z_$][\\w$]*";
const KEY = new RegExp(`${IDENT}|\\d+`, "y");

/** The index of the first top-level "," or closing bracket at or after `from` (masked text). */
function valueEnd(m: string, from: number): number {
  let depth = 0;
  for (let i = from; i < m.length; i++) {
    const c = m[i]!;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return i;
      depth--;
    } else if (c === "," && depth === 0) return i;
  }
  return m.length;
}

/** The object literal whose "{" is at `open`: its keys and their values, nested objects read too. Spreads and computed keys are skipped. */
export function parseObject(m: string, o: string, open: number): Obj {
  const entries: Entry[] = [];
  let i = open + 1;
  const skipSpace = () => {
    while (i < m.length && /\s/.test(m[i]!)) i++;
  };
  while (i < m.length) {
    skipSpace();
    if (m[i] === "}") return { entries, start: open, end: i + 1 };
    if (m[i] === ",") {
      i++;
      continue;
    }
    let key: string | undefined;
    const keyStart = i;
    if (m[i] === '"' || m[i] === "'") {
      const close = m.indexOf(m[i]!, i + 1);
      if (close === -1) break;
      key = o.slice(i + 1, close);
      i = close + 1;
    } else {
      KEY.lastIndex = i;
      const k = KEY.exec(m);
      if (k) {
        key = k[0];
        i += k[0].length;
      }
    }
    if (key === undefined) {
      // Always move on, even when a stray ")" or "]" is what valueEnd stopped at.
      i = Math.max(valueEnd(m, i), i + 1);
      continue;
    }
    skipSpace();
    if (m[i] !== ":") {
      // A shorthand property ({ Onest_400Regular, SpaceMono }): the key is the value.
      entries.push({ key, keyStart, value: { text: key, start: keyStart } });
      continue;
    }
    i++;
    skipSpace();
    if (m[i] === "{") {
      const child = parseObject(m, o, i);
      entries.push({ key, keyStart, value: child });
      i = child.end;
    } else {
      const end = valueEnd(m, i);
      entries.push({ key, keyStart, value: { text: o.slice(i, end).trim(), start: i } });
      i = end;
    }
  }
  return { entries, start: open, end: m.length };
}
