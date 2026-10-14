"use client";
import { useId } from "react";
import { Switch as RadixSwitch } from "radix-ui";

export function Switch({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2 has-[:disabled]:cursor-not-allowed">
      <span className="flex flex-col">
        <span className="font-body text-body text-text-primary">{label}</span>
        {description && <span className="font-caption text-caption text-text-secondary">{description}</span>}
      </span>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-border p-1 transition data-[state=checked]:bg-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
      >
        <RadixSwitch.Thumb className="size-4 rounded-full bg-surface transition data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4" />
      </RadixSwitch.Root>
    </label>
  );
}
