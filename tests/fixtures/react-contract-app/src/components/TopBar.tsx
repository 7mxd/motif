import Link from "next/link";
import type { ReactNode } from "react";
import { BackIcon } from "./icons";

export function TopBar({ title, backHref, actions }: { title: string; backHref?: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-12 items-center gap-2 border-b border-border bg-surface px-4 py-2">
      {backHref && (
        <Link
          href={backHref}
          aria-label="Back"
          className="-ms-3 inline-flex size-12 items-center justify-center rounded-md text-text-primary hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <BackIcon />
        </Link>
      )}
      <h1 className="grow truncate font-title text-title">{title}</h1>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
