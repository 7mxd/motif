"use client";
import { useId, type ComponentProps } from "react";

export function Input({ label, hint, error, id, className = "", ...props }: { label: string; hint?: string; error?: string } & ComponentProps<"input">) {
  const fallback = useId();
  const inputId = id ?? fallback;
  const noteId = `${inputId}-note`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-label text-label">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? noteId : undefined}
        className={`min-h-12 rounded-md border bg-surface px-3 font-body text-body text-text-primary ${error ? "border-danger" : "border-border"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 read-only:bg-surface-raised ${className}`}
        {...props}
      />
      {(error || hint) && (
        <p id={noteId} className={`font-caption text-caption ${error ? "text-danger" : "text-text-secondary"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
