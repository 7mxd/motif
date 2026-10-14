import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { BasketIcon } from "@/components/icons";
import { TopBar } from "@/components/TopBar";
import { formatPrice, products } from "@/mock-data";

export function generateStaticParams() {
  return products.map((product) => ({ id: product.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products.find((p) => p.id === id);
  if (!product) notFound();
  const out = product.stock === "out";
  return (
    <main>
      <TopBar title={product.name} backHref="/products" />
      <div className="flex max-w-2xl flex-col gap-6 px-4 py-6 md:px-8">
        <div className="flex aspect-square max-w-sm items-center justify-center rounded-lg bg-surface-raised text-text-secondary">
          <BasketIcon className="size-16" />
        </div>
        <div className="flex items-center gap-3">
          <p className="font-heading text-heading tabular-nums">
            {formatPrice(product.pricePence)} <span className="font-caption text-caption text-text-secondary">/ {product.unit}</span>
          </p>
          {product.stock === "low" && <Badge tone="warning">Low stock</Badge>}
          {out && <Badge tone="danger">Out of stock</Badge>}
        </div>
        <p className="max-w-prose font-body text-body">{product.description}</p>
        <Button className="self-start" disabled={out}>
          {out ? "Out of stock" : "Add to basket"}
        </Button>
      </div>
    </main>
  );
}
