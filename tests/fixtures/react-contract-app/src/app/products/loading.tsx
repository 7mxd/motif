import { Skeleton } from "@/components/Skeleton";
import { TopBar } from "@/components/TopBar";

export default function LoadingProducts() {
  return (
    <main>
      <TopBar title="Products" />
      <div className="max-w-2xl px-4 py-6 md:px-8">
        <ul className="rounded-md border border-border bg-surface">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex min-h-12 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex grow flex-col gap-2">
                <Skeleton className="w-1/2" />
                <Skeleton className="w-1/4" />
              </div>
              <Skeleton className="w-12" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
