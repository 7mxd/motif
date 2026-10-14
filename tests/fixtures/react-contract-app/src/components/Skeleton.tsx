const SHAPES = {
  line: "h-4 rounded-sm",
  block: "rounded-md",
  circle: "rounded-full",
} as const;

export function Skeleton({ shape = "line", className = "" }: { shape?: keyof typeof SHAPES; className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-surface-raised ${SHAPES[shape]} ${className}`} />;
}
