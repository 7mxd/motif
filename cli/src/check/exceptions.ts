const MOTIF_OK = /motif-ok\b(?:\s*:\s*(.*?))?\s*(?:\*\/|\}|-->|$)/;

export type ExceptionResult = { reason: string } | { missingReason: true } | null;

const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\{\s*\/\*|<!--|\*)/;

/** A `motif-ok: <reason>` comment on the given 1-based line, or on a comment-only line just above it. */
export function exceptionFor(lines: string[], line: number): ExceptionResult {
  const above = lines[line - 2];
  for (const text of [lines[line - 1], above !== undefined && COMMENT_ONLY.test(above) ? above : undefined]) {
    if (text === undefined) continue;
    const m = text.match(MOTIF_OK);
    if (!m) continue;
    const reason = (m[1] ?? "").trim();
    return reason ? { reason } : { missingReason: true };
  }
  return null;
}
