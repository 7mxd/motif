"use client";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { spring } from "@/design/motion";

const MotionLink = motion.create(Link);

export function ListItem({
  title,
  description,
  meta,
  leading,
  trailing,
  href,
  selected = false,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  /** The row that's chosen (the order or product shown beside the list). */
  selected?: boolean;
}) {
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
  const row = `flex min-h-12 items-center gap-3 px-4 py-3 ${selected ? "bg-surface-raised" : ""}`;
  return (
    <li className="border-b border-border last:border-b-0">
      {href ? (
        <MotionLink
          href={href}
          aria-current={selected ? "true" : undefined}
          whileTap={{ scale: 0.97 }}
          transition={spring.snappy}
          className={`${row} hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`}
        >
          {body}
        </MotionLink>
      ) : (
        <div className={row} aria-current={selected ? "true" : undefined}>
          {body}
        </div>
      )}
    </li>
  );
}
