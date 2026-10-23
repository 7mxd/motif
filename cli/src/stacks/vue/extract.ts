// motif extract for Vue: the app's CSS and style blocks are read by the web's collector; this adds what only Vue apps have,
// Vuetify's themes (createVuetify({ theme: { themes: { light: { colors }, dark: { colors } } } })), as colours with a light
// and a dark value, and the other themes as design variants.
import type { SourceFile } from "../../check/files";
import { colorContext } from "../../check/rules/colors";
import { parseColor, type Sample } from "../../extract/cluster";
import type { Occurrences, Variable } from "../../extract/draft";
import { locator } from "../../text";
import { kebab, title } from "../flutter/extract";
import { isObj, maskCode, parseObject, type Obj } from "../react-native/extract";

const MAX_EXAMPLES = 5;

/** Vuetify's colour names that Motif names differently; every other one is its own name in kebab case. */
const VUETIFY_NAMES: Record<string, string> = {
  primary: "action-primary",
  secondary: "action-secondary",
  "on-surface": "text-primary",
  error: "status-error",
  warning: "status-warning",
  success: "status-success",
  info: "status-info",
};

interface Theme { name: string; dark: boolean; colors: Record<string, string>; at: number; file: SourceFile }

/** A quoted colour ('#1867C0') as written; undefined for anything else (a variable, an expression). */
function colorLiteral(text: string): string | undefined {
  const m = text.match(/^(["'])(.*)\1$/s);
  return m && parseColor(m[2]!) ? m[2]!.trim() : undefined;
}

/** The themes a file's `themes: { … }` object gives, and its `defaultTheme`. */
function themesIn(file: SourceFile): { themes: Theme[]; defaultTheme?: string } {
  const original = file.text;
  if (!/vuetify/i.test(original)) return { themes: [] };
  const masked = maskCode(original);
  const themes: Theme[] = [];
  for (const m of masked.matchAll(/\bthemes\s*:\s*\{/g)) {
    const obj = parseObject(masked, original, m.index! + m[0].length - 1);
    for (const e of obj.entries) {
      if (!isObj(e.value)) continue;
      const colorsEntry = e.value.entries.find((x) => x.key === "colors" && isObj(x.value));
      if (!colorsEntry) continue;
      const colors: Record<string, string> = {};
      for (const c of (colorsEntry.value as Obj).entries) {
        const value = isObj(c.value) ? undefined : colorLiteral(c.value.text);
        if (value) colors[c.key] = value;
      }
      if (Object.keys(colors).length === 0) continue;
      const flag = e.value.entries.find((x) => x.key === "dark" && !isObj(x.value));
      const dark = flag && !isObj(flag.value) ? flag.value.text === "true" : /dark$/i.test(e.key);
      themes.push({ name: e.key, dark, colors, at: e.keyStart, file });
    }
  }
  const dm = /\bdefaultTheme\s*:\s*["']/.exec(masked);
  const defaultTheme = dm ? original.slice(dm.index + dm[0].length).match(/^([\w-]+)["']/)?.[1] : undefined;
  return { themes, ...(defaultTheme ? { defaultTheme } : {}) };
}

/** Which palette a theme belongs to: light and dark are the default's two halves, harvestDark is harvest's dark half. */
function baseOf(t: Theme): string {
  if (!t.dark) return t.name === "light" ? "" : t.name;
  if (t.name === "dark") return "";
  return t.name.replace(/[-_ ]?dark$/i, "");
}

const empty = (): Occurrences => ({ colors: [], space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [] });

/** What an app's Vuetify themes say about its colours: the default light and dark as the colours' two values, the others as design variants. */
export function collectVue(files: SourceFile[]): Occurrences {
  const found = files.filter((f) => f.lang === "script").map((f) => ({ file: f, ...themesIn(f) }));
  const themes = found.flatMap((f) => f.themes);
  if (themes.length === 0) return empty();
  const notes: string[] = [];
  const named = found.find((f) => f.defaultTheme)?.defaultTheme;
  const bases = [...new Set(themes.map(baseOf))];
  const namedBase = named ? baseOf(themes.find((t) => t.name === named) ?? { name: named, dark: false } as Theme) : undefined;
  const defaultBase = namedBase !== undefined && bases.includes(namedBase) ? namedBase : bases.includes("") ? "" : bases[0]!;
  const half = (base: string, dark: boolean) => themes.find((t) => baseOf(t) === base && t.dark === dark);
  const light = half(defaultBase, false);
  const darkHalf = half(defaultBase, true);
  if (!light) notes.push(`Your Vuetify themes give no light colours for ${defaultBase || "the default theme"}, so the draft has its dark colours only.`);
  if (!darkHalf) notes.push(`Your Vuetify themes give no dark theme to pair with ${light?.name ?? defaultBase}, so the draft keeps its light colours in dark mode.`);

  const variantIds = new Map<string, string>();
  const variants = bases.filter((b) => b !== defaultBase).map((b) => {
    const id = kebab(b || "default-variant");
    variantIds.set(b, id);
    const l = half(b, false);
    const d = half(b, true);
    if (!l) notes.push(`${d!.name} has no light theme to pair with, so the ${title(id.replace(/-/g, " "))} variant sets dark-mode colours only.`);
    else if (!d) notes.push(`${l.name} has no dark theme to pair with, so the ${title(id.replace(/-/g, " "))} variant keeps its light colours in dark mode.`);
    return { id, light: l, dark: d };
  });
  const variantLabels: Record<string, string> = {};
  for (const v of variants) variantLabels[v.id] = v.id.split("-").map(title).join(" ");

  const varName = (field: string) => `--${VUETIFY_NAMES[kebab(field)] ?? kebab(field)}`;
  const fields = [...new Set(themes.flatMap((t) => Object.keys(t.colors)))];
  const variables = new Map<string, Variable>();
  const samples = new Map<string, Sample>();
  const place = (t: Theme) => `${t.file.path}:${locator(t.file.text)(t.at).line}`;
  for (const field of fields) {
    const name = varName(field);
    if (variables.has(name)) continue;
    const l = light?.colors[field];
    const d = darkHalf?.colors[field];
    const byVariant: Record<string, { light?: string; dark?: string }> = {};
    for (const v of variants) {
      const vl = v.light?.colors[field];
      const vd = v.dark?.colors[field];
      if (vl || vd) byVariant[v.id] = { ...(vl ? { light: vl } : {}), ...(vd ? { dark: vd } : {}) };
    }
    if (!l && !d && Object.keys(byVariant).length === 0) continue;
    variables.set(name, { name, ...(l ? { light: l } : {}), ...(d ? { dark: d } : {}), ...(Object.keys(byVariant).length ? { variants: byVariant } : {}) });
    // The default theme's light colours are the app's colours, as :root's are on the web; dark and variant ones aren't uses.
    if (l && light) {
      const s = samples.get(l) ?? { value: l, count: 0, contexts: {}, examples: [] };
      s.count++;
      const context = colorContext(name);
      s.contexts[context] = (s.contexts[context] ?? 0) + 1;
      if (s.examples.length < MAX_EXAMPLES) s.examples.push(place(light));
      samples.set(l, s);
    }
  }
  const count = variables.size;
  notes.push(`Vuetify themes: ${count} ${count === 1 ? "colour" : "colours"} from ${themes.map((t) => t.name).join(", ")}.`);
  return {
    ...empty(),
    colors: [...samples.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    variables: [...variables.values()],
    aliases: {},
    roleNames: [...variables.keys()],
    variableUses: {},
    followVariables: true,
    source: "script",
    ...(Object.keys(variantLabels).length ? { variantLabels } : {}),
    notes,
  };
}
