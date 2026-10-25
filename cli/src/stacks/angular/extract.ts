// motif extract for Angular: the app's global styles, component stylesheets and inline styles are read by the web's
// collector; this adds what only Angular apps have, Angular Material's system variables (--mat-sys-*), set in CSS or
// through mat.theme-overrides((…)) in Sass, as Motif's roles, its corners as radii, and a note for each palette given
// only by name (mat.$azure-palette), whose colours aren't in the code.
import { darkRanges } from "../../check/dark";
import type { SourceFile } from "../../check/files";
import { parseColor, type Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { locator } from "../../text";
import { maskStyles } from "./dark";

const MAX_EXAMPLES = 5;

/**
 * Material's system colours that are Motif's roles, by their name after --mat-sys-. The rest (tertiary, the
 * surface-container steps) have no role of their own in the guide and stay what they are.
 */
const ROLES: Record<string, string> = {
  primary: "action-primary",
  "on-primary": "on-action-primary",
  background: "background",
  surface: "surface",
  "on-surface": "text-primary",
  "on-surface-variant": "text-secondary",
  "outline-variant": "border",
  error: "danger",
  "on-error": "on-danger",
};

/** A size as written (12px, 0.75rem): Material's corners. */
const SIZE = /^\d+(?:\.\d+)?(?:px|rem)$/;

/** light-dark(light, dark)'s two sides; null for any other value. */
function lightDark(value: string): [string, string] | null {
  const m = value.match(/^light-dark\(([\s\S]*)\)$/i);
  if (!m) return null;
  let depth = 0;
  for (let i = 0; i < m[1]!.length; i++) {
    const c = m[1]![i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) return [m[1]!.slice(0, i).trim(), m[1]!.slice(i + 1).trim()];
  }
  return null;
}

/** Just past the ")" that closes the "(" at `open`, or the end of the text. */
function parenEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i + 1;
  }
  return text.length;
}

/** A Sass map's entries, `(key: value, …)` from its "(": each key with its value and where the value starts. */
function sassMap(text: string, open: number): { key: string; value: string; at: number }[] {
  const end = parenEnd(text, open) - 1;
  const entries: { key: string; value: string; at: number }[] = [];
  let start = open + 1;
  let depth = 0;
  for (let i = open + 1; i <= end; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")" && i < end) depth--;
    else if ((c === "," && depth === 0) || i === end) {
      const part = text.slice(start, i);
      const m = part.match(/^\s*([\w-]+)\s*:\s*([\s\S]*?)\s*$/);
      if (m) entries.push({ key: m[1]!, value: m[2]!, at: start + part.indexOf(m[2]!) });
      start = i + 1;
    }
  }
  return entries;
}

const inRanges = (i: number, ranges: [number, number][]) => ranges.some(([a, b]) => a <= i && i < b);

const empty = (): Occurrences => ({ colors: [], space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [] });

/** What an app's Angular Material theme says: its system colours as roles (light and dark), its corners, and its named palettes. */
export function collectAngular(files: SourceFile[]): Occurrences {
  /** --mat-sys-<name> → its light and dark values, in the order found (the first value of each mode wins, as the cascade's base). */
  const system = new Map<string, Variable>();
  /** System colours set from another variable (--mat-sys-primary: var(--brand)): the web's reading follows them. */
  const linked = new Set<string>();
  /** Values Motif can't read (color-mix(), calc(), a Sass variable), by their name after --mat-sys-. */
  const unread = new Set<string>();
  const radius = new Map<string, Sample>();
  /** Palettes given by name, and colours written where mat.theme() takes a palette. */
  const palettes: { key: string; written: string; literal: boolean }[] = [];
  const set = (name: string, value: string, dark: boolean, place: string) => {
    if (/^var\(\s*--[\w-]+\s*\)$/.test(value)) {
      linked.add(name);
      return;
    }
    if (/^corner-/.test(name)) {
      if (dark) return;
      if (!SIZE.test(value)) {
        unread.add(name);
        return;
      }
      const s = radius.get(value) ?? { value, count: 0, contexts: {}, examples: [] };
      s.count++;
      if (s.examples.length < MAX_EXAMPLES) s.examples.push(place);
      radius.set(value, s);
      return;
    }
    const sides = lightDark(value);
    const light = sides ? sides[0] : dark ? undefined : value;
    const darkValue = sides ? sides[1] : dark ? value : undefined;
    const readable = (x: string | undefined) => x === undefined || parseColor(x) !== undefined;
    if (!readable(light) || !readable(darkValue)) unread.add(name);
    const v = system.get(name) ?? { name: `--mat-sys-${name}` };
    if (light && parseColor(light) && !v.light) v.light = light;
    if (darkValue && parseColor(darkValue) && !v.dark) v.dark = darkValue;
    if (v.light || v.dark) system.set(name, v);
  };

  for (const file of files) {
    if (file.lang !== "css") continue;
    const css = maskStyles(file);
    if (!/--mat-sys-|@angular\/material|theme-overrides|-palette/.test(css)) continue;
    // Angular's views mark its dark-theme classes (.dark-theme) in file.dark, beside the web's own dark blocks.
    const dark = [...darkRanges(css), ...(file.dark ?? [])];
    const at = locator(file.text);
    const place = (i: number) => `${file.path}:${at(i).line}`;
    // Plain CSS: --mat-sys-primary: #6750a4 (in :root, html, a dark block, or as light-dark()).
    for (const m of css.matchAll(/--mat-sys-([\w-]+)\s*:\s*([^;{}]+)/g)) {
      set(m[1]!, m[2]!.trim().replace(/\s*!important$/i, ""), inRanges(m.index!, dark), place(m.index!));
    }
    // Sass: @include mat.theme-overrides((primary: #6750a4, …)), under whatever name @use gave the module.
    const ns = css.match(/@use\s+["']@angular\/material["']\s+as\s+([\w-]+)/)?.[1] ?? "mat";
    const q = ns.replace(/[-]/g, "\\-");
    for (const m of css.matchAll(new RegExp(`\\b${q}\\.theme-overrides\\s*\\(\\s*\\(`, "g"))) {
      const open = m.index! + m[0].length - 1;
      for (const e of sassMap(css, open)) set(e.key, e.value, inRanges(m.index!, dark), place(e.at));
    }
    // A palette given by name (color: mat.$azure-palette, or primary: / tertiary: in color's map) has no colour in the code.
    for (const m of css.matchAll(new RegExp(`\\b([\\w-]+)\\s*:\\s*${q}\\.\\$([\\w-]+-palette)\\b`, "g"))) {
      palettes.push({ key: m[1]!, written: `${ns}.$${m[2]}`, literal: false });
    }
    // Material 3's mat.theme() takes palettes for color, primary and tertiary, not colours: a colour written there isn't read
    // as the theme's (Sass rejects it), and the note says where a colour does go (theme-overrides).
    for (const m of css.matchAll(new RegExp(`\\b${q}\\.theme\\s*\\(`, "g"))) {
      const open = m.index! + m[0].length - 1;
      const args = css.slice(open, parenEnd(css, open));
      for (const c of args.matchAll(/\b(color|primary|tertiary)\s*:\s*(#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^()]*\))/g)) {
        palettes.push({ key: c[1]!, written: c[2]!, literal: true });
      }
    }
  }

  const notes: string[] = [];
  const primaryFound = Boolean(system.get("primary")?.light) || linked.has("primary");
  for (const p of palettes) {
    const primary = p.key === "color" || p.key === "primary";
    const what = p.literal
      ? `Angular Material's mat.theme() takes a palette for ${p.key}, not a colour, so Motif doesn't read ${p.written} there.`
      : `Angular Material's ${p.written}${primary ? "" : ` (${p.key})`} is a named palette; Motif can't read its colours from the code.`;
    let next: string;
    if (!primary) next = ` If your app shows its ${p.key} colours, set the matching role in design/tokens.json by hand; otherwise there's nothing to do.`;
    else if (primaryFound) next = " action-primary came from your overrides (--mat-sys-primary) instead.";
    else if (p.literal) next = " Set action-primary in the guide by hand, or set the colour with mat.theme-overrides((primary: …)).";
    else next = " Set action-primary in the guide by hand.";
    const note = what + next;
    if (!notes.includes(note)) notes.push(note);
  }
  if (unread.size > 0) {
    const names = [...unread].sort().map((n) => `--mat-sys-${n}`);
    const one = names.length === 1;
    notes.push(`Angular Material: Motif can't read the value of ${names.join(", ")} (a color-mix(), calc() or Sass expression), so the draft leaves ${one ? "it" : "them"} out. Set ${one ? "its role" : "their roles"} in the guide by hand.`);
  }

  const variables = [...system.values()];
  if (variables.length === 0 && radius.size === 0 && linked.size === 0 && notes.length === 0) return empty();
  // Each role is another name for its system colour (--action-primary → --mat-sys-primary), so the draft takes the role from
  // it, light and dark, as from a variable named for the role. One set from another variable is followed through it.
  const aliases: Record<string, string> = {};
  const named = new Set([...system.keys(), ...linked]);
  for (const name of named) if (ROLES[name]) aliases[`--${ROLES[name]}`] = `--mat-sys-${name}`;
  // Material 3's background is its surface (Angular Material's guides set body { background: var(--mat-sys-surface) }).
  if (named.has("surface") && !named.has("background")) aliases["--background"] = "--mat-sys-surface";
  if (variables.length > 0) {
    notes.push(`Angular Material: ${variables.length} system ${variables.length === 1 ? "colour" : "colours"} (${variables.map((v) => v.name).join(", ")}).`);
  }
  return {
    ...empty(),
    radius: [...radius.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    variables,
    aliases,
    roleNames: Object.keys(aliases),
    variableUses: {},
    followVariables: true,
    notes,
  };
}
