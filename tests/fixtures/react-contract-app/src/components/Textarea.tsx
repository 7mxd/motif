import { useId, type ComponentProps } from "react";

export function Textarea({ label, hint, error, id, className = "", rows = 4, ...props }: { label: string; hint?: string; error?: string } & ComponentProps<"textarea">) {
  const fallback = useId();
  const fieldId = id ?? fallback;
  const noteId = `${fieldId}-note`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="font-label text-label">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? noteId : undefined}
        className={`rounded-md border bg-surface px-3 py-2 font-body text-body text-text-primary ${error ? "border-danger" : "border-border"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 read-only:bg-surface-raised ${className}`}
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
