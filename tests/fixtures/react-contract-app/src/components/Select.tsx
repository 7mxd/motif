"use client";
import { useId } from "react";
import { Select as RadixSelect } from "radix-ui";

export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Choose one",
  error,
}: {
  label: string;
  options: { value: string; label: string }[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="font-label text-label">
        {label}
      </span>
      <RadixSelect.Root value={value} onValueChange={onValueChange}>
        <RadixSelect.Trigger
          aria-labelledby={`${id}-label`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`inline-flex min-h-12 items-center justify-between gap-2 rounded-md border bg-surface px-3 text-start font-body text-body text-text-primary ${error ? "border-danger" : "border-border"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[disabled]:opacity-50`}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="text-text-secondary">▾</RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content position="popper" sideOffset={4} className="z-10 min-w-(--radix-select-trigger-width) rounded-md border border-border bg-surface-raised p-1 shadow-md">
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className="flex min-h-12 cursor-default items-center justify-between gap-3 rounded-sm px-3 font-body text-body text-text-primary outline-none data-[highlighted]:bg-surface"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="text-action-primary">✓</RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {error && (
        <p id={`${id}-error`} className="font-caption text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
