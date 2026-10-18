"use client";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { duration, easing, spring } from "@/design/motion";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 bg-background/80"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: duration.fast, ease: easing.exit } }}
                transition={{ duration: duration.base }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount {...(description ? {} : { "aria-describedby": undefined })}>
              <motion.div
                className="fixed inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-lg bg-surface-raised p-6 shadow-lg"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%", transition: { duration: duration.fast, ease: easing.exit } }}
                transition={spring.smooth}
              >
                <div className="flex items-center justify-between gap-4">
                  <RadixDialog.Title className="font-heading text-heading">{title}</RadixDialog.Title>
                  <RadixDialog.Close asChild>
                    <IconButton label="Close">
                      <CloseIcon />
                    </IconButton>
                  </RadixDialog.Close>
                </div>
                {description && <RadixDialog.Description className="font-body text-body text-text-secondary">{description}</RadixDialog.Description>}
                {children}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
