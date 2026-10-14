"use client";
import { Button } from "./Button";
import { AlertIcon } from "./icons";

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="text-danger">
        <AlertIcon />
      </span>
      <h2 className="font-heading text-heading">{title}</h2>
      <p className="max-w-sm font-body text-body text-text-secondary">{description}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
