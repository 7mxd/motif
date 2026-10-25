// Ataa's data, in memory: a fictional food bank's week of volunteer shifts. Nothing is fetched.

/** A text the app shows in both its languages. */
export interface Words {
  en: string;
  ar: string;
}

export type ShiftKind = 'sorting' | 'packing' | 'delivery' | 'distribution' | 'kitchen';

export interface Shift {
  id: string;
  kind: ShiftKind;
  name: Words;
  /** When it starts and ends, on one day. */
  starts: Date;
  ends: Date;
  place: Words;
  /** Volunteers it needs, and how many have signed up already. */
  places: number;
  taken: number;
  bring: Words;
  lead: Words;
}

/** True during the autumn harvest drive, which has its own look (DESIGN.md, Variants). */
export const harvestDrive = false;

/** How many shifts one volunteer can hold in a week. */
export const weeklyLimit = 3;

export const COORDINATOR = 'mailto:shifts@ataa.example';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

export const shifts: Shift[] = [
  {
    id: 'sort-saturday',
    kind: 'sorting',
    name: { en: 'Sorting the week’s donations', ar: 'فرز تبرعات الأسبوع' },
    starts: at(7, 9),
    ends: at(7, 12),
    place: { en: 'The warehouse, Block 4', ar: 'المستودع، قطعة ٤' },
    places: 8,
    taken: 3,
    bring: { en: 'Closed shoes; gloves are on the shelf by the door.', ar: 'حذاء مغلق؛ القفازات على الرف عند الباب.' },
    lead: { en: 'Huda', ar: 'هدى' },
  },
  {
    id: 'pack-sunday',
    kind: 'packing',
    name: { en: 'Packing family boxes', ar: 'تعبئة صناديق العائلات' },
    starts: at(8, 17),
    ends: at(8, 20),
    place: { en: 'The warehouse, Block 4', ar: 'المستودع، قطعة ٤' },
    places: 12,
    taken: 10,
    bring: { en: 'Nothing; aprons and tape are ready on the tables.', ar: 'لا شيء؛ المرايل والشريط جاهزة على الطاولات.' },
    lead: { en: 'Yousef', ar: 'يوسف' },
  },
  {
    id: 'deliver-monday',
    kind: 'delivery',
    name: { en: 'Delivering to homes', ar: 'التوصيل إلى البيوت' },
    starts: at(9, 10),
    ends: at(9, 13),
    place: { en: 'From the warehouse loading bay', ar: 'من رصيف التحميل في المستودع' },
    places: 4,
    taken: 4,
    bring: { en: 'A driving licence, and a phone with maps.', ar: 'رخصة قيادة، وهاتف فيه خرائط.' },
    lead: { en: 'Salem', ar: 'سالم' },
  },
  {
    id: 'kitchen-tuesday',
    kind: 'kitchen',
    name: { en: 'Cooking the community supper', ar: 'طبخ عشاء الحي' },
    starts: at(10, 15),
    ends: at(10, 19),
    place: { en: 'The community hall kitchen', ar: 'مطبخ قاعة الحي' },
    places: 6,
    taken: 2,
    bring: { en: 'Tie back long hair; the kitchen has hairnets.', ar: 'اربط الشعر الطويل؛ في المطبخ أغطية للشعر.' },
    lead: { en: 'Mariam', ar: 'مريم' },
  },
  {
    id: 'hand-out-thursday',
    kind: 'distribution',
    name: { en: 'Distribution day at the hall', ar: 'يوم التوزيع في القاعة' },
    starts: at(12, 16),
    ends: at(12, 19, 30),
    place: { en: 'The community hall, main room', ar: 'قاعة الحي، القاعة الكبرى' },
    places: 10,
    taken: 5,
    bring: { en: 'A warm welcome; the lists are printed for you.', ar: 'ترحيبًا دافئًا؛ القوائم مطبوعة لك.' },
    lead: { en: 'Huda', ar: 'هدى' },
  },
  {
    id: 'sort-friday',
    kind: 'sorting',
    name: { en: 'Checking dates on tins', ar: 'فحص تواريخ المعلّبات' },
    starts: at(13, 9),
    ends: at(13, 11),
    place: { en: 'The warehouse, Block 4', ar: 'المستودع، قطعة ٤' },
    places: 5,
    taken: 1,
    bring: { en: 'Reading glasses, if you use them.', ar: 'نظارة القراءة، إن كنت تستخدمها.' },
    lead: { en: 'Yousef', ar: 'يوسف' },
  },
];

export const findShift = (id: string): Shift | undefined => shifts.find((s) => s.id === id);

/** Room, a few places left (two or fewer), or full. */
export type ShiftStatus = 'open' | 'few' | 'full';

export function statusOf(shift: Shift, extra = 0): ShiftStatus {
  const left = shift.places - shift.taken - extra;
  return left <= 0 ? 'full' : left <= 2 ? 'few' : 'open';
}
