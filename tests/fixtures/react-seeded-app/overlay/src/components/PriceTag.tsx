export function PriceTag({ pence, unit }: { pence: number; unit: string }) {
  return (
    <span className="font-label text-label tabular-nums" style={{ color: "#2F7D4F" }}>
      £{(pence / 100).toFixed(2)} <span className="font-caption text-caption">/ {unit}</span>
    </span>
  );
}
