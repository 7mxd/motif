import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ListItem } from "@/components/ListItem";
import { TopBar } from "@/components/TopBar";
import { formatPrice, orders, user } from "@/mock-data";

export default function Home() {
  const firstName = user.name.split(" ")[0];
  return (
    <main>
      <TopBar title="Home" />
      <div className="flex max-w-2xl flex-col gap-8 px-4 py-6 md:px-8">
        <p className="font-body text-body text-text-secondary">Good evening, {firstName}</p>
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-heading">Next delivery</h2>
              <p className="font-body text-body">{user.nextDelivery}</p>
              <p className="font-caption text-caption text-text-secondary">Basket total {formatPrice(orders[0]!.totalPence)}</p>
            </div>
            <Badge tone="success">Confirmed</Badge>
          </div>
        </Card>
        <Button className="self-start">Reorder last basket</Button>
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-heading">Recent orders</h2>
          <ul className="rounded-md border border-border bg-surface">
            {orders.map((order) => (
              <ListItem key={order.id} title={order.date} description={`${order.items} items`} meta={formatPrice(order.totalPence)} />
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
