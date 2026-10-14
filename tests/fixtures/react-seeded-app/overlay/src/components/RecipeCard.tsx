import { Card } from "./Card";

export function RecipeCard({ title, minutes }: { title: string; minutes: number }) {
  return (
    <Card>
      <h3 className="font-heading text-heading" style={{ fontFamily: "Georgia, serif" }}>
        {title}
      </h3>
      <p className="font-caption text-caption text-text-secondary">{minutes} min</p>
    </Card>
  );
}
