export function Avatar({ name, src }: { name: string; src?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from anywhere; next/image needs known hosts
    return <img src={src} alt={name} className="size-10 rounded-full object-cover" />;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span aria-label={name} role="img" className="inline-flex size-10 items-center justify-center rounded-full bg-surface-raised font-label text-label text-text-secondary">
      {initials}
    </span>
  );
}
