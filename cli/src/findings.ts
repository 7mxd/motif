export type Severity = "error" | "warning";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
  path?: string;
  variant?: string;
}

export function formatFindings(findings: Finding[]): string {
  return findings
    .map((f) => `  ${f.severity === "error" ? "✗" : "⚠"} ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`)
    .join("\n");
}
