"use client";
import { Checkbox as RadixCheckbox } from "radix-ui";

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 font-body text-body text-text-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
      <RadixCheckbox.Root
        checked={checked}
        onCheckedChange={(state) => onCheckedChange?.(state === true)}
        disabled={disabled}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-border bg-surface data-[state=checked]:border-action-primary data-[state=checked]:bg-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <RadixCheckbox.Indicator className="text-on-action-primary">✓</RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label}
    </label>
  );
}
