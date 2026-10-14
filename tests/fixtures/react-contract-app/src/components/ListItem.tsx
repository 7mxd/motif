import Link from "next/link";
import type { ReactNode } from "react";

export function ListItem({ title, description, meta, leading, trailing, href }: { title: string; description?: string; meta?: ReactNode; leading?: ReactNode; trailing?: ReactNode; href?: string }) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 grow flex-col">
        <span className="truncate font-body text-body text-text-primary">{title}</span>
        {description && <span className="line-clamp-2 font-caption text-caption text-text-secondary">{description}</span>}
      </span>
      {meta && <span className="shrink-0 font-label text-label tabular-nums">{meta}</span>}
      {trailing}
    </>
  );
  const row = "flex min-h-12 items-center gap-3 px-4 py-3";
  return (
    <li className="border-b border-border last:border-b-0">
      {href ? (
        <Link href={href} className={`${row} hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}
