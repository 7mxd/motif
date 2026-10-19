import type { Finding } from "../findings";
import { camelCase, dartIdentifier } from "../stacks/naming";
import { resolveValue } from "./resolve";
import { MOTIF_EXT, type FlatToken, type TokenDocument } from "./types";
import { validateValue } from "./values";

export interface VariantInfo {
  id: string;
  label: string;
}

interface Declared {
  id: unknown;
  label: unknown;
  default: unknown;
}

interface Entry {
  value?: unknown;
  dark?: unknown;
}

const ID = /^[a-z][a-z0-9-]*$/;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** The variants the guide declares, as written; null when there is no block. */
function declared(doc: TokenDocument): Declared[] | null {
  const ext = doc.rootExtensions?.[MOTIF_EXT];
  const list = isObj(ext) ? ext.variants : undefined;
  if (!Array.isArray(list)) return null;
  return list.filter(isObj) as unknown as Declared[];
}

/** The variant entries a role offers, keyed by variant id; empty when it offers none. */
function roleVariants(tok: FlatToken): Record<string, Entry> {
  const ext = tok.extensions?.[MOTIF_EXT];
  const v = isObj(ext) ? ext.variants : undefined;
  return isObj(v) ? (v as Record<string, Entry>) : {};
}

/** The default variant's id: the one variant marked as the default, when its id is well formed. */
function defaultOf(list: Declared[]): string | null {
  const defaults = list.filter((d) => d.default === true);
  const id = defaults.length === 1 ? defaults[0]!.id : null;
  return typeof id === "string" && ID.test(id) ? id : null;
}

/**
 * The design variants a guide declares; the default comes first. Only well-formed ids are listed (each once), so an id
 * that motif validate rejects never reaches a selector or a file name.
 */
export function readVariants(doc: TokenDocument): { variants: VariantInfo[]; defaultId: string | null; findings: Finding[] } {
  const list = declared(doc);
  if (!list) return { variants: [], defaultId: null, findings: [] };
  const variants: VariantInfo[] = [];
  for (const d of list) {
    if (typeof d.id !== "string" || !ID.test(d.id) || variants.some((v) => v.id === d.id)) continue;
    variants.push({ id: d.id, label: typeof d.label === "string" ? d.label : d.id });
  }
  const defaultId = defaultOf(list);
  if (defaultId) variants.sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
  return { variants, defaultId, findings: checkVariants(doc) };
}

/** The document as one variant sees it. The default variant (or no variants) is the document itself. */
export function variantView(doc: TokenDocument, id: string): TokenDocument {
  const { defaultId } = readVariants(doc);
  if (!defaultId || id === defaultId) return doc;
  const tokens = new Map(doc.tokens);
  for (const [path, tok] of doc.tokens) {
    const entry = roleVariants(tok)[id];
    if (!isObj(entry) || entry.value === undefined) continue;
    const ext = (tok.extensions?.[MOTIF_EXT] ?? {}) as Record<string, unknown>;
    const modes = isObj(ext.modes) ? ext.modes : {};
    const nextModes = entry.dark !== undefined ? { ...modes, dark: entry.dark } : modes;
    tokens.set(path, {
      ...tok,
      value: entry.value,
      extensions: { ...tok.extensions, [MOTIF_EXT]: { ...ext, modes: nextModes } },
    });
  }
  return { ...doc, tokens };
}

/** Format problems with the variants block and the roles' variant entries. */
export function checkVariants(doc: TokenDocument): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, message: string, extra: Partial<Finding> = {}, severity: Finding["severity"] = "error") =>
    findings.push({ code, severity, message, file: doc.file, ...extra });
  const ext = doc.rootExtensions?.[MOTIF_EXT];
  const raw = isObj(ext) ? ext.variants : undefined;
  if (Array.isArray(raw) ? raw.some((d) => !isObj(d)) : raw !== undefined) {
    add("bad-variants", 'The "variants" block must be a list of variants, each with an id and a label.');
  }
  const list = declared(doc);
  if (!list) return findings;

  const ids = new Set<string>();
  const repeated = new Set<string>();
  list.forEach((d, i) => {
    if (d.id === undefined) {
      add("bad-variant-id", `Variant ${i + 1} has no id. Give each variant an id of lowercase words joined by dashes, like "women".`);
      return;
    }
    if (typeof d.id !== "string") {
      add("bad-variant-id", `Variant ${i + 1}'s id must be text: lowercase words joined by dashes, like "women" or "dark-blue".`);
      return;
    }
    if (!ID.test(d.id)) add("bad-variant-id", `The variant id "${d.id}" must be lowercase words joined by dashes, like "women" or "dark-blue".`);
    if (ids.has(d.id) && !repeated.has(d.id)) {
      repeated.add(d.id);
      add("duplicate-variant-id", `Two variants have the id "${d.id}". Each variant needs its own.`);
    }
    ids.add(d.id);
  });
  // Two ids that become the same name in app code (a-1 and a1; default and default-variant for Dart).
  const names = [camelCase, dartIdentifier];
  const taken = names.map(() => new Map<string, string>());
  const clashed = new Set<string>();
  for (const id of ids) {
    if (!ID.test(id)) continue;
    names.forEach((toName, i) => {
      const name = toName(id);
      const other = taken[i]!.get(name);
      if (other === undefined) return taken[i]!.set(name, id);
      const key = `${other}|${id}`;
      if (clashed.has(key)) return;
      clashed.add(key);
      add("variant-id-clash", `The variant ids "${other}" and "${id}" both become "${name}" in app code. Rename one so they differ.`);
    });
  }
  const defaults = list.filter((d) => d.default === true);
  if (defaults.length === 0) add("no-default-variant", 'No variant is marked as the default. Mark exactly one with "default": true.');
  if (defaults.length > 1) add("several-default-variants", "More than one variant is marked as the default. Only one can be.");
  const defaultIds = new Set(defaults.map((d) => d.id).filter((id): id is string => typeof id === "string"));

  const mentioned = new Set<string>();
  for (const [path, tok] of doc.tokens) {
    for (const [vid, entry] of Object.entries(roleVariants(tok))) {
      mentioned.add(vid);
      const where = { path, line: tok.line };
      if (!ids.has(vid)) {
        add("unknown-variant", `"${path}" has a value for the variant "${vid}", which the guide doesn't declare.`, where);
        continue;
      }
      if (defaultIds.has(vid)) {
        add("default-variant-values", `"${path}" gives the default variant "${vid}" its own values; the default's values are its $value and modes.dark.`, where);
        continue;
      }
      if (!isObj(entry) || entry.value === undefined) {
        add("bad-value", `"${path}" (${vid}) needs a "value".`, where);
        continue;
      }
      const own = resolveValue(doc, tok.value, [path]);
      const type = tok.type ?? (own.ok ? own.type : null);
      const parts: [string, unknown, "light" | "dark"][] = [["value", entry.value, "light"]];
      if (type === "color") {
        if (entry.dark === undefined) add("variant-missing-dark", `"${path}" (${vid}) has a value but no dark value. Colors need both.`, where);
        else parts.push(["dark", entry.dark, "dark"]);
      } else if (type !== null && entry.dark !== undefined) {
        add("variant-dark-ignored", `"${path}" (${vid}) has a dark value, but only colours have one. It's ignored.`, where, "warning");
      }
      for (const [name, raw, mode] of parts) {
        const r = resolveValue(doc, raw, [path], mode);
        if (!r.ok) { add("bad-value", `"${path}" (${vid}) ${name}: ${r.error}`, where); continue; }
        const problem = type ? validateValue(type, r.value) : null;
        if (problem) add("bad-value", `"${path}" (${vid}) ${name} isn't valid: ${problem}.`, where);
      }
    }
  }
  for (const d of list) {
    const id = d.id;
    if (typeof id === "string" && ID.test(id) && d.default !== true && !mentioned.has(id)) {
      mentioned.add(id);
      add("empty-variant", `The variant "${id}" isn't used by any role yet.`, {}, "warning");
    }
  }
  return findings;
}
