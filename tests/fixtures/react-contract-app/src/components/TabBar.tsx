"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { BasketIcon, HomeIcon } from "./icons";

export const NAV_ITEMS: { href: string; label: string; icon: ComponentType }[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/products", label: "Products", icon: BasketIcon },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-12 grow flex-col items-center justify-center gap-1 py-2 font-caption text-caption ${current ? "text-action-primary" : "text-text-secondary"} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
