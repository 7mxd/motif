"use client";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { spring } from "@/design/motion";

const MotionLink = motion.create(Link);

export function Card({ children, href, className = "" }: { children: ReactNode; href?: string; className?: string }) {
  const base = `block rounded-md border border-border bg-surface p-4 ${className}`;
  if (!href) return <div className={base}>{children}</div>;
  return (
    <MotionLink
      href={href}
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
      className={`${base} hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      {children}
    </MotionLink>
  );
}
