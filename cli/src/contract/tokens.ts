import type { Finding } from "../findings";
import { darkValueOf, resolveMode, resolveToken } from "./resolve";
import { KNOWN_TYPES, type TokenDocument } from "./types";
import { validateValue } from "./values";

export function validateTokens(doc: TokenDocument): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, path: string, line: number, message: string) =>
    findings.push({ code, severity: "error", file: doc.file, line, path, message });

  for (const tok of doc.tokens.values()) {
    const resolved = resolveToken(doc, tok.path);
    if (!resolved.ok) {
      add("broken-alias", tok.path, tok.line, `"${tok.path}": ${resolved.error}`);
      continue;
    }
    const type = resolved.type;
    if (type === null) {
      add("missing-type", tok.path, tok.line, `"${tok.path}" has no "$type", and no group above it sets one.`);
      continue;
    }
    if (!(KNOWN_TYPES as readonly string[]).includes(type)) {
      add("unknown-type", tok.path, tok.line, `"${tok.path}" has an unknown type "${type}".`);
      continue;
    }
    const problem = validateValue(type, resolved.value);
    if (problem) add("bad-value", tok.path, tok.line, `"${tok.path}" has a problem: ${problem}.`);

    const dark = darkValueOf(doc, tok.path);
    if (dark !== undefined) {
      const d = resolveMode(doc, tok.path, "dark");
      if (!d.ok) add("broken-alias", tok.path, tok.line, `"${tok.path}" (dark): ${d.error}`);
      else {
        const dp = validateValue(type, d.value);
        if (dp) add("bad-value", tok.path, tok.line, `"${tok.path}" (dark) has a problem: ${dp}.`);
      }
    }
  }
  return findings;
}
