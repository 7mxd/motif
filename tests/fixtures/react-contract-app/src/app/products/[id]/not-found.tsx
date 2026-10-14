import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";

export default function ProductNotFound() {
  return (
    <main>
      <TopBar title="Product" backHref="/products" />
      <EmptyState
        title="We couldn't find that product"
        description="It may have sold out or been removed."
        action={
          <Link
            href="/products"
            className="inline-flex min-h-12 items-center rounded-md px-4 font-label text-label text-action-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Back to products
          </Link>
        }
      />
    </main>
  );
}
