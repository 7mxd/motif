import "./promo.css";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PriceTag } from "@/components/PriceTag";
import { PromoBanner } from "@/components/PromoBanner";
import { RecipeCard } from "@/components/RecipeCard";
import { TopBar } from "@/components/TopBar";
import { VariantSwitch } from "@/components/VariantSwitch";
import { products } from "@/mock-data";

const FEATURES = [
  { icon: "🥕", title: "Fresh produce", text: "Picked this morning." },
  { icon: "🥖", title: "Daily bread", text: "Baked before dawn." },
  { icon: "🧀", title: "Local cheese", text: "From nearby farms." },
  { icon: "🚚", title: "Free delivery", text: "On orders over £40." },
  { icon: "♻️", title: "Less packaging", text: "Bring your bags back." },
  { icon: "⭐", title: "Loyalty points", text: "On every order." },
];

export default function Home() {
  const deal = products[0]!;
  return (
    <main>
      <TopBar title="Home" />
      <div className="px-4 py-6 text-center">
        <h1 className="font-display text-display">Welcome to Larder</h1>
        <p className="mt-2 font-caption text-caption text-text-secondary">Everything you need, delivered to your door, every day of the week, from the shop around the corner.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button>Reorder last basket</Button>
          <Button>Shop this week's deals</Button>
          <Button>Invite a friend</Button>
        </div>
        <div className="mt-8">
          <PromoBanner />
        </div>
        <div className="promo-strip mt-8 px-4 py-3">
          Today only: {deal.name} <PriceTag pence={deal.pricePence} unit={deal.unit} />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <div className="text-title">{f.icon}</div>
              <h3 className="mt-2 font-heading text-heading">{f.title}</h3>
              <p className="font-caption text-caption text-text-secondary">{f.text}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <RecipeCard title="Leek and potato soup" minutes={35} />
          <RecipeCard title="Lemon roast chicken" minutes={80} />
        </div>
        <div className="mt-8 text-start">
          <Card>
            <VariantSwitch />
          </Card>
        </div>
      </div>
    </main>
  );
}
