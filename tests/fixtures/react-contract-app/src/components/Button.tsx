"use client";
import { motion, type HTMLMotionProps } from "motion/react";
import { spring } from "@/design/motion";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action-primary text-on-action-primary",
  secondary: "bg-action-secondary text-on-action-secondary",
  ghost: "bg-transparent text-text-primary hover:bg-surface-raised",
};

export function Button({ variant = "primary", loading = false, disabled, className = "", children, ...props }: HTMLMotionProps<"button"> & { variant?: Variant; loading?: boolean }) {
  const inactive = disabled || loading;
  return (
    <motion.button
      whileTap={inactive ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 font-label text-label ${VARIANTS[variant]} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
