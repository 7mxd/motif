"use client";
import { Button } from "./Button";

const TONES = {
  info: "bg-info text-on-info",
  success: "bg-success text-on-success",
  danger: "bg-danger text-on-danger",
} as const;

export function Toast({ message, tone = "info", actionLabel, onAction }: { message: string; tone?: keyof typeof TONES; actionLabel?: string; onAction?: () => void }) {
  return (
    <div role="status" aria-live="polite" className={`flex min-h-12 items-center justify-between gap-4 rounded-md px-4 py-2 shadow-md ${TONES[tone]}`}>
      <p className="font-body text-body">{message}</p>
      {actionLabel && (
        <Button variant="ghost" onClick={onAction} className="text-current hover:bg-transparent">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
