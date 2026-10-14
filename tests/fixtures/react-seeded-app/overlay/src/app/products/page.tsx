import Link from "next/link";
import { Button } from "@/components/Button";
import { PriceTag } from "@/components/PriceTag";
import { TopBar } from "@/components/TopBar";
import { products } from "@/mock-data";

export default function ProductsPage() {
  return (
    <main>
      <TopBar title="Products" />
      <ul className="p-7">
        {products.map((p) => (
          <li key={p.id} className="group flex items-center justify-between gap-3 border-b border-border py-3">
            <Link href={`/products/${p.id}`} className="inline-flex min-h-12 grow items-center font-body text-body">
              {p.name}
            </Link>
            <span className="text-gray-500">{p.stock === "out" ? "Out of stock" : p.stock === "low" ? "Low stock" : "In stock"}</span>
            <PriceTag pence={p.pricePence} unit={p.unit} />
            <Button variant="secondary" aria-label={`Add ${p.name}`} disabled={p.stock === "out"} className="opacity-0 group-hover:opacity-100">
              Add
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
