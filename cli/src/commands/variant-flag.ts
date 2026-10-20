/** Why --variant can't be honoured, or null when it can. */
export interface VariantRefusal {
  exitCode: 1 | 2;
  text: string;
  data: Record<string, unknown>;
}

/** The refusal when the design guide's variants block has errors: nothing should act on it until it's fixed. */
export function brokenVariants(flag: string | undefined): VariantRefusal {
  return {
    exitCode: 1,
    text: "Your design guide's variants have problems: fix them first (motif validate shows details).",
    data: { error: "invalid-variants", ...(flag !== undefined ? { variant: flag } : {}) },
  };
}

/**
 * Whether --variant <flag> names a variant `who` has (`ids`, the default first; "all" names every one), shared by preview
 * and shot so both say it the same way.
 */
export function variantRefusal(who: string, flag: string, ids: string[]): VariantRefusal | null {
  if (ids.length === 0) return { exitCode: 2, text: `${who} has no variants. Leave out --variant to use its one look.`, data: { error: "no-such-variant", variant: flag, variants: [] } };
  if (flag !== "all" && !ids.includes(flag)) {
    const list = ids.map((id, n) => (n === 0 ? `${id} (the default)` : id)).join(", ");
    return { exitCode: 2, text: `${who} has no variant called "${flag}". Variants: ${list}.`, data: { error: "no-such-variant", variant: flag, variants: ids } };
  }
  return null;
}
