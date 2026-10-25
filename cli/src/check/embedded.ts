// Strings in a TypeScript file that hold a template or styles (an Angular component's inline template: and styles:),
// read as the template and the CSS they are, at their place in the file: the file's three views, as a component
// file's are.
import { componentViews, type ComponentViews, type Grammar, type Binding } from "./component-views";
import { blank, readExpression } from "./html";
import { keepRanges, maskComments } from "./mask";

/** A string's text, or one text part of a template literal, that a key of a @Component({…}) holds. */
export interface StringRegion {
  key: string;
  start: number;
  end: number;
  kind: "template" | "style";
}

const DECORATOR = /@Component\s*\(\s*\{/y;
const KEY = /([A-Za-z_$][\w$]*)\s*:\s*/y;
const QUOTES = new Set(['"', "'", "`"]);
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);

/**
 * The string literal at `at` ('…', "…" or `…`): where it ends (after its quote; at its line's end when a '…' or "…"
 * doesn't close) and its text, as ranges: a template literal's without its ${…} parts, which are code.
 */
function literal(text: string, at: number): { end: number; parts: [number, number][] } {
  const quote = text[at];
  const parts: [number, number][] = [];
  let part = at + 1;
  let i = at + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\\") i += 2;
    else if (c === quote) {
      parts.push([part, i]);
      return { end: i + 1, parts: parts.filter(([a, b]) => b > a) };
    } else if (quote !== "`" && (c === "\n" || c === "\r")) break;
    else if (quote === "`" && c === "$" && text[i + 1] === "{") {
      parts.push([part, i]);
      const e = readExpression(text, i + 1);
      i = part = e.end === -1 ? text.length : e.end;
    } else i++;
  }
  i = Math.min(i, text.length);
  parts.push([part, i]);
  return { end: i, parts: parts.filter(([a, b]) => b > a) };
}

/** Where the bracket opening at `at` closes (after it), strings skipped; the text's end when it doesn't. */
function bracketEnd(text: string, at: number): number {
  let depth = 0;
  for (let i = at; i < text.length; ) {
    const c = text[i]!;
    if (QUOTES.has(c)) {
      i = literal(text, i).end;
      continue;
    }
    if (OPENERS.has(c)) depth++;
    else if (CLOSERS.has(c) && --depth === 0) return i + 1;
    i++;
  }
  return text.length;
}

/** The text ranges of the value at `at`: a string, or an array's strings (Angular's styles: [`…`, '…']); none for anything else. */
function valueStrings(text: string, at: number): [number, number][] {
  if (QUOTES.has(text[at]!)) return literal(text, at).parts;
  if (text[at] !== "[") return [];
  const end = bracketEnd(text, at) - 1;
  const found: [number, number][] = [];
  for (let i = at + 1; i < end; ) {
    const c = text[i]!;
    if (QUOTES.has(c)) {
      const s = literal(text, i);
      found.push(...s.parts);
      i = s.end;
    } else i = OPENERS.has(c) ? bracketEnd(text, i) : i + 1;
  }
  return found;
}

/**
 * The strings `keys` hold in each @Component({…}) of a TypeScript file: the object's own keys only (not a nested
 * object's), each string's text without its quotes, a template literal's text parts without their ${…} parts (which
 * stay code), and each string of an array. A key named style or styles holds CSS; any other a template.
 */
export function stringRegions(tsText: string, keys: string[]): StringRegion[] {
  const text = maskComments(tsText, "script");
  const found: StringRegion[] = [];
  for (let i = 0; i < text.length; ) {
    const c = text[i]!;
    if (QUOTES.has(c)) {
      i = literal(text, i).end;
      continue;
    }
    DECORATOR.lastIndex = i;
    const m = c === "@" ? DECORATOR.exec(text) : null;
    if (!m) {
      i++;
      continue;
    }
    // The decorator's object: its keys where a key may start (after "{" or ","), not deeper.
    const brace = i + m[0].length - 1;
    const end = bracketEnd(text, brace) - 1;
    let keyNext = true;
    for (let j = brace + 1; j < end; ) {
      const ch = text[j]!;
      if (QUOTES.has(ch)) {
        j = literal(text, j).end;
        keyNext = false;
      } else if (OPENERS.has(ch)) {
        j = bracketEnd(text, j);
        keyNext = false;
      } else if (ch === ",") {
        keyNext = true;
        j++;
      } else if (keyNext && /[A-Za-z_$]/.test(ch)) {
        KEY.lastIndex = j;
        const k = KEY.exec(text);
        keyNext = false;
        if (!k) {
          j++;
          continue;
        }
        j += k[0].length;
        if (!keys.includes(k[1]!)) continue;
        const kind = /^styles?$/.test(k[1]!) ? "style" : "template";
        for (const [start, stop] of valueStrings(text, j)) found.push({ key: k[1]!, start, end: stop, kind });
      } else j++;
    }
    i = end + 1;
  }
  return found;
}

/**
 * A component's TypeScript file as its three views: the strings its @Component({…}) holds as `template` (read through
 * `opts`, the template's grammar and bindings, as a template file is, at their place) and as `styles` (CSS), blank in
 * the script view, which keeps the rest of the file.
 */
export function withEmbedded(tsText: string, opts: { bindings: Binding[]; grammar?: Grammar }): ComponentViews {
  const regions = stringRegions(tsText, ["template", "styles"]);
  const ranges = (kind: StringRegion["kind"]) => regions.filter((r) => r.kind === kind).map((r): [number, number] => [r.start, r.end]);
  const templates = ranges("template");
  const views = componentViews(keepRanges(tsText, templates), opts);
  const script = tsText.split("");
  const css = tsText.replace(/[^\r\n]/g, " ").split("");
  const markup = [...css];
  for (const [a, b] of templates) {
    for (let i = a; i < b; i++) {
      script[i] = views.script[i]!;
      css[i] = views.css[i]!;
      markup[i] = views.markup[i]!;
    }
  }
  for (const [a, b] of ranges("style")) {
    for (let i = a; i < b; i++) css[i] = tsText[i]!;
    blank(script, a, b);
  }
  return { css: css.join(""), script: script.join(""), markup: markup.join(""), dark: views.dark, spans: views.spans };
}
