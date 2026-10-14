import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-surface-raised text-text-secondary",
  success: "bg-success text-on-success",
  warning: "bg-warning text-on-warning",
  danger: "bg-danger text-on-danger",
  info: "bg-info text-on-info",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-sm px-2 font-caption text-caption ${TONES[tone]}`}>{children}</span>;
}
