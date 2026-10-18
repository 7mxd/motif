"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./TabBar";

export function Sidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden shrink-0 flex-col gap-1 border-e border-border bg-surface p-4 md:flex md:w-64">
      <p className="px-3 pb-4 font-heading text-heading">Larder</p>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-md px-3 font-label text-label ${current ? "bg-surface-raised text-action-primary" : "text-text-primary hover:bg-surface-raised"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
