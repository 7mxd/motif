import type { ComponentProps, ReactNode } from "react";

export function IconButton({ label, children, className = "", ...props }: { label: string; children: ReactNode } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex size-12 items-center justify-center rounded-md text-text-primary hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
