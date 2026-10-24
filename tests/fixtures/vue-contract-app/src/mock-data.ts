// Bustan's data, in memory: a fictional garden's plots and the crops members log. Nothing is fetched.

/** A text the app shows in both its languages. */
export interface Words {
  en: string;
  ar: string;
}

export type Light = "full" | "part" | "shade";
export type PlotStatus = "free" | "waiting" | "booked";

export interface Plot {
  id: string;
  number: number;
  name: Words;
  /** Square metres. */
  size: number;
  light: Light;
  water: Words;
  soil: Words;
  lastSeason: Words;
  /** The season's fee, in Kuwaiti dinars. */
  fee: number;
  status: PlotStatus;
}

export interface Crop {
  id: string;
  name: Words;
}

/** "growing" most of the year; "harvest" in the autumn weeks, which have their own look (DESIGN.md, Variants). */
export const gardenSeason: "growing" | "harvest" = "growing";

/** The day every booking ends. */
export const seasonEnds = new Date(2026, 10, 30);

export const plots: Plot[] = [
  {
    id: "by-the-gate",
    number: 1,
    name: { en: "By the gate", ar: "عند البوابة" },
    size: 6,
    light: "full",
    water: { en: "A tap at the gate, 5 m away", ar: "صنبور عند البوابة، على بعد ٥ م" },
    soil: { en: "Loam, mulched last autumn", ar: "طمي، غُطّي بالنشارة في الخريف الماضي" },
    lastSeason: { en: "Tomatoes and basil", ar: "طماطم وريحان" },
    fee: 15,
    status: "free",
  },
  {
    id: "under-the-fig",
    number: 2,
    name: { en: "Under the fig tree", ar: "تحت شجرة التين" },
    size: 4,
    light: "shade",
    water: { en: "The rain barrel beside it", ar: "برميل المطر بجانبها" },
    soil: { en: "Rich and damp, good for greens", ar: "غنية ورطبة، تناسب الورقيات" },
    lastSeason: { en: "Mint, parsley and lettuce", ar: "نعناع وبقدونس وخس" },
    fee: 10,
    status: "booked",
  },
  {
    id: "south-wall",
    number: 3,
    name: { en: "Along the south wall", ar: "على امتداد الجدار الجنوبي" },
    size: 8,
    light: "full",
    water: { en: "Drip line, on a timer", ar: "خط تنقيط بمؤقّت" },
    soil: { en: "Sandy loam, warm early in the day", ar: "طمي رملي، يدفأ في الصباح الباكر" },
    lastSeason: { en: "Okra, aubergines and peppers", ar: "بامية وباذنجان وفلفل" },
    fee: 20,
    status: "waiting",
  },
  {
    id: "by-the-well",
    number: 4,
    name: { en: "By the old well", ar: "عند البئر القديمة" },
    size: 6,
    light: "part",
    water: { en: "The well's hand pump, beside it", ar: "مضخة البئر اليدوية بجانبها" },
    soil: { en: "Clay loam, slow to dry", ar: "طمي طيني، بطيء الجفاف" },
    lastSeason: { en: "Beans and cucumbers", ar: "فاصولياء وخيار" },
    fee: 15,
    status: "free",
  },
  {
    id: "behind-the-shed",
    number: 5,
    name: { en: "Behind the tool shed", ar: "خلف مخزن الأدوات" },
    size: 5,
    light: "part",
    water: { en: "A tap on the shed wall", ar: "صنبور على جدار المخزن" },
    soil: { en: "New compost, dug in this spring", ar: "سماد جديد، قُلّب في هذا الربيع" },
    lastSeason: { en: "Rested for a year", ar: "تُركت لترتاح عامًا" },
    fee: 12,
    status: "free",
  },
  {
    id: "herb-corner",
    number: 6,
    name: { en: "The herb corner", ar: "ركن الأعشاب" },
    size: 3,
    light: "full",
    water: { en: "A tap at the gate, 12 m away", ar: "صنبور عند البوابة، على بعد ١٢ م" },
    soil: { en: "Gravelly and quick to drain", ar: "حصوية وسريعة التصريف" },
    lastSeason: { en: "Thyme, sage and za'atar", ar: "زعتر ومريمية وزعتر بري" },
    fee: 8,
    status: "booked",
  },
];

export const crops: Crop[] = [
  { id: "tomatoes", name: { en: "Tomatoes", ar: "طماطم" } },
  { id: "cucumbers", name: { en: "Cucumbers", ar: "خيار" } },
  { id: "okra", name: { en: "Okra", ar: "بامية" } },
  { id: "aubergines", name: { en: "Aubergines", ar: "باذنجان" } },
  { id: "peppers", name: { en: "Peppers", ar: "فلفل" } },
  { id: "beans", name: { en: "Beans", ar: "فاصولياء" } },
  { id: "lettuce", name: { en: "Lettuce", ar: "خس" } },
  { id: "mint", name: { en: "Mint", ar: "نعناع" } },
  { id: "basil", name: { en: "Basil", ar: "ريحان" } },
];

export const findPlot = (id: string): Plot | undefined => plots.find((p) => p.id === id);
export const findCrop = (id: string): Crop | undefined => crops.find((c) => c.id === id);
