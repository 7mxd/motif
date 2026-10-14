import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { ListItem } from "@/components/ListItem";
import { TopBar } from "@/components/TopBar";
import { formatPrice, products, type Product } from "@/mock-data";

function stockBadge(product: Product) {
  if (product.stock === "low") return <Badge tone="warning">Low stock</Badge>;
  if (product.stock === "out") return <Badge tone="danger">Out of stock</Badge>;
  return undefined;
}

export default function ProductsPage() {
  return (
    <main>
      <TopBar title="Products" />
      <div className="max-w-2xl px-4 py-6 md:px-8">
        {products.length === 0 ? (
          <EmptyState title="No products yet" description="The shop's shelves are being stocked. Check back soon." />
        ) : (
          <ul className="rounded-md border border-border bg-surface">
            {products.map((product) => (
              <ListItem
                key={product.id}
                href={`/products/${product.id}`}
                title={product.name}
                description={product.unit}
                meta={formatPrice(product.pricePence)}
                trailing={stockBadge(product)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
