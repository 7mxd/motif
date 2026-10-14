"use client";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";

export function Dialog({
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
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-background/80" />
        <RadixDialog.Content className="fixed start-1/2 top-1/2 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg bg-surface-raised p-6 shadow-lg rtl:translate-x-1/2">
          <RadixDialog.Title className="font-heading text-heading">{title}</RadixDialog.Title>
          {description && <RadixDialog.Description className="font-body text-body text-text-secondary">{description}</RadixDialog.Description>}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
