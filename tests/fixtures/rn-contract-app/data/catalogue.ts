// The shop's shelves, in memory: the app has no back end yet.
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import { locale } from "@/i18n/strings";

export type Stock = "in" | "low" | "out";

export type Product = {
  id: string;
  name: { en: string; ar: string };
  pack: { en: string; ar: string };
  about: { en: string; ar: string };
  /** In fils: 1000 fils are 1 KWD. */
  price: number;
  stock: Stock;
  icon: ComponentProps<typeof Ionicons>["name"];
};

export const SHOP = {
  /** The shop turns on its night-market colours on market nights. */
  marketNight: false,
};

export const PRODUCTS: Product[] = [
  {
    id: "oat-milk",
    name: { en: "Oat milk", ar: "حليب الشوفان" },
    pack: { en: "1 L carton", ar: "علبة ١ لتر" },
    about: { en: "Barista oat milk that froths well and keeps for a week once open.", ar: "حليب شوفان يصلح للرغوة ويبقى أسبوعًا بعد فتحه." },
    price: 1250,
    stock: "in",
    icon: "water-outline",
  },
  {
    id: "flatbread",
    name: { en: "Flatbread", ar: "خبز عربي" },
    pack: { en: "Bag of 6, baked this morning", ar: "كيس من ٦، مخبوز صباح اليوم" },
    about: { en: "Soft flatbread from the bakery on the corner, delivered at seven every morning.", ar: "خبز طري من المخبز المجاور، يصل في السابعة كل صباح." },
    price: 350,
    stock: "low",
    icon: "pizza-outline",
  },
  {
    id: "dates",
    name: { en: "Khalas dates", ar: "تمر خلاص" },
    pack: { en: "500 g box", ar: "علبة ٥٠٠ غرام" },
    about: { en: "Soft, caramel-sweet Khalas dates from Al-Ahsa.", ar: "تمر خلاص طري بطعم الكراميل من الأحساء." },
    price: 2750,
    stock: "in",
    icon: "nutrition-outline",
  },
  {
    id: "eggs",
    name: { en: "Free-range eggs", ar: "بيض بلدي" },
    pack: { en: "Tray of 12", ar: "طبق من ١٢" },
    about: { en: "Large brown eggs from a farm in Wafra.", ar: "بيض بني كبير من مزرعة في الوفرة." },
    price: 1500,
    stock: "out",
    icon: "egg-outline",
  },
  {
    id: "tea",
    name: { en: "Cardamom tea", ar: "شاي بالهيل" },
    pack: { en: "Box of 50 bags", ar: "علبة من ٥٠ كيسًا" },
    about: { en: "Black tea with green cardamom, for the afternoon pot.", ar: "شاي أسود بالهيل الأخضر لإبريق العصر." },
    price: 1100,
    stock: "in",
    icon: "cafe-outline",
  },
];

export const findProduct = (id: string | undefined) => PRODUCTS.find((p) => p.id === id);

/** A product's text in the app's language. */
export const local = (text: { en: string; ar: string }) => text[locale];

const money = new Intl.NumberFormat(locale === "ar" ? "ar-KW" : "en-KW", { style: "currency", currency: "KWD" });

export const formatPrice = (fils: number) => money.format(fils / 1000);
