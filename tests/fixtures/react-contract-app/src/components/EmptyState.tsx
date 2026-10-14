import type { ReactNode } from "react";
import { BasketIcon } from "./icons";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="text-text-secondary">
        <BasketIcon />
      </span>
      <h2 className="font-heading text-heading">{title}</h2>
      <p className="max-w-sm font-body text-body text-text-secondary">{description}</p>
      {action}
    </div>
  );
}
