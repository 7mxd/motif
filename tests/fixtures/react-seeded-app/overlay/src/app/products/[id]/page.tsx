import { Button } from "@/components/Button";
import { PriceTag } from "@/components/PriceTag";
import { TopBar } from "@/components/TopBar";
import { products } from "@/mock-data";

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products.find((p) => p.id === id)!;
  return (
    <main>
      <TopBar title={product.name} />
      <div className="px-4 py-6">
        <PriceTag pence={product.pricePence} unit={product.unit} />
        <p className="mt-4">{product.description}</p>
        <div className="mt-6 flex gap-3">
          <Button>Submit</Button>
          <Button variant="ghost">Click here</Button>
        </div>
      </div>
    </main>
  );
}
