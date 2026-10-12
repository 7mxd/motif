const MOTIF_OK = /motif-ok\b(?:\s*:\s*(.*?))?\s*(?:\*\/|\}|-->|$)/;

export type ExceptionResult = { reason: string } | { missingReason: true } | null;

/** A `motif-ok: <reason>` comment on the given 1-based line or the line above it. */
export function exceptionFor(lines: string[], line: number): ExceptionResult {
  for (const text of [lines[line - 1], lines[line - 2]]) {
    if (text === undefined) continue;
    const m = text.match(MOTIF_OK);
    if (!m) continue;
    const reason = (m[1] ?? "").trim();
    return reason ? { reason } : { missingReason: true };
  }
  return null;
}
