"use client";
import { motion } from "motion/react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { duration, spring } from "@/design/motion";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay asChild>
          <motion.div className="fixed inset-0 bg-background/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.base }} />
        </RadixDialog.Overlay>
        <RadixDialog.Content asChild>
          <motion.div
            className="fixed inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-lg bg-surface-raised p-6 shadow-lg"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
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
            {children}
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
