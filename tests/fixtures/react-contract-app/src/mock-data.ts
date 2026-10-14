// Mock data for the Larder fixture. Everything here is made up.

export type Stock = "in" | "low" | "out";

export interface Product {
  id: string;
  name: string;
  unit: string;
  pricePence: number;
  stock: Stock;
  description: string;
}

export const products: Product[] = [
  { id: "oats", name: "Rolled oats", unit: "1 kg", pricePence: 240, stock: "in", description: "Jumbo rolled oats from a mill two valleys over. Good for porridge and flapjacks." },
  { id: "eggs", name: "Free-range eggs", unit: "6", pricePence: 285, stock: "low", description: "Large eggs from hens that spend their days outdoors." },
  { id: "sourdough", name: "Sourdough loaf", unit: "800 g", pricePence: 420, stock: "in", description: "Baked this morning with a three-day starter." },
  { id: "leeks", name: "Leeks", unit: "500 g", pricePence: 135, stock: "in", description: "Sweet, mild leeks, washed and trimmed." },
  { id: "cheddar", name: "Mature cheddar", unit: "250 g", pricePence: 375, stock: "in", description: "Aged for fourteen months; crumbly and sharp." },
  { id: "apples", name: "Cox apples", unit: "1 kg", pricePence: 260, stock: "out", description: "Crisp and aromatic. Back next week." },
  { id: "milk", name: "Whole milk", unit: "2 l", pricePence: 165, stock: "in", description: "From a dairy twelve miles away." },
  { id: "coffee", name: "House coffee beans", unit: "250 g", pricePence: 650, stock: "in", description: "A chocolatey medium roast, roasted on Mondays." },
];

export const orders = [
  { id: "o-1042", date: "Thursday 9 October", items: 14, totalPence: 4630 },
  { id: "o-1031", date: "Thursday 2 October", items: 11, totalPence: 3875 },
  { id: "o-1019", date: "Friday 26 September", items: 16, totalPence: 5210 },
];

export const user = { name: "Sam Okafor", email: "sam@example.com", nextDelivery: "Thursday 16 October, 6–8 pm" };

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
