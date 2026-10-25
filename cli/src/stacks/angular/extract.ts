// motif extract for Angular: the app's global styles, component stylesheets and inline styles are read by the web's
// collector; this adds what only Angular apps have, Angular Material's system variables (--mat-sys-*), set in CSS or
// through mat.theme-overrides((…)) in Sass, as Motif's roles, its corners as radii, and a note for each palette given
// only by name (mat.$azure-palette), whose colours aren't in the code.
import { darkRanges, isDarkSelector } from "../../check/dark";
import type { SourceFile } from "../../check/files";
import { maskComments } from "../../check/mask";
import { parseColor, type Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { locator } from "../../text";

const MAX_EXAMPLES = 5;
const SASS_FILE = /\.(?:scss|sass|less)$/i;

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

/**
 * The parts of a stylesheet that are for dark mode: the web's (@media (prefers-color-scheme: dark), .dark,
 * [data-theme=dark]), and the classes Angular Material's guides use for a dark theme (.dark-theme, .dark-mode, body.dark).
 */
function darkParts(css: string, file: SourceFile): [number, number][] {
  const ranges = [...darkRanges(css), ...(file.dark ?? [])];
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== "{") continue;
    let s = i - 1;
    while (s >= 0 && css[s] !== "{" && css[s] !== "}" && css[s] !== ";") s--;
    const selector = css.slice(s + 1, i).trim();
    if (selector.startsWith("@") || isDarkSelector(selector)) continue;
    const items = selector.split(",").map((x) => x.trim()).filter(Boolean);
    if (items.length > 0 && items.every((x) => /[.\[][\w-]*dark(?![a-z])/i.test(x))) ranges.push([i, braceEnd(css, i)]);
  }
  return ranges;
}

/** Just past the "}" that closes the "{" at `open`, or the end of the text. */
function braceEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  return css.length;
}

const inRanges = (i: number, ranges: [number, number][]) => ranges.some(([a, b]) => a <= i && i < b);

const empty = (): Occurrences => ({ colors: [], space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [] });

/** What an app's Angular Material theme says: its system colours as roles (light and dark), its corners, and its named palettes. */
export function collectAngular(files: SourceFile[]): Occurrences {
  /** --mat-sys-<name> → its light and dark values, in the order found (the first value of each mode wins, as the cascade's base). */
  const system = new Map<string, Variable>();
  const radius = new Map<string, Sample>();
  const notes: string[] = [];
  const set = (name: string, value: string, dark: boolean, place: string) => {
    const sides = lightDark(value);
    if (/^corner-/.test(name)) {
      if (dark || !SIZE.test(value)) return;
      const s = radius.get(value) ?? { value, count: 0, contexts: {}, examples: [] };
      s.count++;
      if (s.examples.length < MAX_EXAMPLES) s.examples.push(place);
      radius.set(value, s);
      return;
    }
    const v = system.get(name) ?? { name: `--mat-sys-${name}` };
    const light = sides ? sides[0] : dark ? undefined : value;
    const darkValue = sides ? sides[1] : dark ? value : undefined;
    if (light && parseColor(light) && !v.light) v.light = light;
    if (darkValue && parseColor(darkValue) && !v.dark) v.dark = darkValue;
    if (v.light || v.dark) system.set(name, v);
  };

  for (const file of files) {
    if (file.lang !== "css") continue;
    const css = maskComments(file.text, SASS_FILE.test(file.path) ? "script" : "css");
    if (!/--mat-sys-|@angular\/material|theme-overrides|-palette/.test(css)) continue;
    const dark = darkParts(css, file);
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
      const palette = `${ns}.$${m[2]}`;
      const primary = m[1] === "color" || m[1] === "primary";
      const note = primary
        ? `Angular Material's ${palette} is a named palette; Motif can't read its colours from the code. Set action-primary in the guide by hand.`
        : `Angular Material's ${palette} (${m[1]}) is a named palette; Motif can't read its colours from the code.`;
      if (!notes.includes(note)) notes.push(note);
    }
  }

  const variables = [...system.values()];
  if (variables.length === 0 && radius.size === 0 && notes.length === 0) return empty();
  // Each role is another name for its system colour (--action-primary → --mat-sys-primary), so the draft takes the role from
  // it as from a variable named for the role. A dark value only a dark class gives (which the web's reading of CSS doesn't
  // treat as dark mode) goes on the role's name, which the draft looks at first.
  const aliases: Record<string, string> = {};
  const roleVariables: Variable[] = [];
  const roles: [string, Variable][] = [...system].flatMap(([name, v]) => (ROLES[name] ? [[ROLES[name]!, v] as [string, Variable]] : []));
  // Material 3's background is its surface (Angular Material's guides set body { background: var(--mat-sys-surface) }).
  const surface = system.get("surface");
  if (surface && !system.has("background")) roles.push(["background", surface]);
  for (const [role, v] of roles) {
    aliases[`--${role}`] = v.name;
    if (v.dark) roleVariables.push({ name: `--${role}`, dark: v.dark });
  }
  if (variables.length > 0) {
    notes.push(`Angular Material: ${variables.length} system ${variables.length === 1 ? "colour" : "colours"} (${variables.map((v) => v.name).join(", ")}).`);
  }
  return {
    ...empty(),
    radius: [...radius.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    variables: [...variables, ...roleVariables],
    aliases,
    roleNames: Object.keys(aliases),
    variableUses: {},
    followVariables: true,
    notes,
  };
}
