import { MOTIF_EXT, type TokenDocument } from "./types";

const ALIAS = /^\{([^{}]+)\}$/;

export const isAlias = (v: unknown): v is string => typeof v === "string" && ALIAS.test(v);

export type Resolved =
  | { ok: true; value: unknown; type: string | null }
  | { ok: false; error: string };

export type Mode = "light" | "dark";

/**
 * Resolve aliases anywhere inside a value. In dark mode, every alias step uses the target's
 * dark value when it has one, so a dark alias to another role gets that role's dark colour.
 */
export function resolveValue(doc: TokenDocument, value: unknown, chain: string[] = [], mode: Mode = "light"): Resolved {
  if (isAlias(value)) {
    const target = value.slice(1, -1);
    if (chain.includes(target)) {
      return { ok: false, error: `${[...chain, target].map((p) => `"${p}"`).join(" → ")} point to each other in a loop.` };
    }
    const tok = doc.tokens.get(target);
    if (!tok) return { ok: false, error: `It points to "{${target}}", which doesn't exist.` };
    const raw = mode === "dark" ? (darkValueOf(doc, target) ?? tok.value) : tok.value;
    const inner = resolveValue(doc, raw, [...chain, target], mode);
    if (!inner.ok) return inner;
    return { ok: true, value: inner.value, type: tok.type ?? inner.type };
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const r = resolveValue(doc, item, chain, mode);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return { ok: true, value: out, type: null };
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolveValue(doc, v, chain, mode);
      if (!r.ok) return r;
      out[k] = r.value;
    }
    return { ok: true, value: out, type: null };
  }
  return { ok: true, value, type: null };
}

export function resolveToken(doc: TokenDocument, path: string): Resolved {
  const tok = doc.tokens.get(path);
  if (!tok) return { ok: false, error: `"${path}" doesn't exist.` };
  const r = resolveValue(doc, tok.value, [path]);
  if (!r.ok) return r;
  return { ok: true, value: r.value, type: tok.type ?? r.type };
}

export function darkValueOf(doc: TokenDocument, path: string): unknown | undefined {
  const ext = doc.tokens.get(path)?.extensions?.[MOTIF_EXT] as { modes?: { dark?: unknown } } | undefined;
  return ext?.modes?.dark;
}

export function resolveMode(doc: TokenDocument, path: string, mode: Mode): Resolved {
  const light = resolveToken(doc, path);
  if (mode === "light") return light;
  const tok = doc.tokens.get(path);
  if (!tok) return light;
  const r = resolveValue(doc, darkValueOf(doc, path) ?? tok.value, [path], "dark");
  if (!r.ok) return r;
  return { ok: true, value: r.value, type: light.ok ? light.type : r.type };
}
