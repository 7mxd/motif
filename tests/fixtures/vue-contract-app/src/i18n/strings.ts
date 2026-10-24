// The app's words in English and Arabic. The browser's language chooses one; main.ts sets lang and dir from it.
import type { Words } from "../mock-data";

export type Locale = "en" | "ar";

export const locale: Locale = (navigator.languages?.[0] ?? navigator.language ?? "en").toLowerCase().startsWith("ar") ? "ar" : "en";

export const en = {
  appName: "Bustan",
  home: "Bustan, home",
  mainNav: "Main",
  navPlots: "Plots",
  navHarvest: "Harvest log",
  signIn: "Sign in",
  back: "Back to the plots",
  plotsTitle: "Plots to book",
  plotsIntro: "Six raised beds behind the old school, shared by the neighbourhood. Book a free one and it's yours for the season, tools and water included.",
  freeCount: (free: string, all: string) => `${free} of ${all} plots are free this season`,
  plotNumber: (n: string) => `Plot ${n}`,
  size: (m: string) => `${m} m²`,
  perSeason: (fee: string) => `${fee} a season`,
  lightFull: "Full sun",
  lightPart: "Part shade",
  lightShade: "Shade",
  statusFree: "Free",
  statusWaiting: "Waiting list",
  statusBooked: "Booked",
  aboutPlot: "About this plot",
  sizeLabel: "Size",
  lightLabel: "Light",
  waterLabel: "Water",
  soilLabel: "Soil",
  lastSeasonLabel: "Grown here last season",
  plotIntro: "Every plot comes with a key to the shed, a watering can and a share of the compost.",
  bookPlot: "Book this plot",
  joinWaitingList: "Join the waiting list",
  askTeam: "Ask the garden team",
  bookedByOther: "Someone is growing here this season. Ask the team about the next one.",
  bookedNote: (name: string, until: string) => `${name} is yours until ${until}.`,
  bookedHint: "Your key is in the shed's lockbox; we've emailed you its code.",
  waitingNote: "You're on the waiting list. We'll write when the plot is free.",
  plotMissing: "We can't find that plot",
  plotMissingHint: "It may have been joined to its neighbour. Every plot there is today is on the list.",
  seePlots: "See the plots",
  harvestTitle: "Harvest log",
  harvestIntro: "Weigh what you pick on the scale in the shed, then add it here. The garden shares everyone's totals at the open day.",
  addHarvest: "Add a harvest",
  crop: "Crop",
  chooseCrop: "Choose a crop",
  cropError: "Choose what you picked.",
  weight: "Weight in kilograms",
  weightHint: "To the nearest 0.1 kg, as the scale shows it.",
  weightError: "Enter a weight from 0.1 to 50 kg.",
  addToLog: "Add to the log",
  thisSeason: "This season",
  seasonTotal: (kg: string) => `${kg} in all`,
  logEmpty: "Nothing logged yet",
  logEmptyHint: "Your first harvest appears here, with the season's total.",
  pageMissing: "There's no page here",
  pageMissingHint: "The link may be old. The plots and the harvest log are a tap away.",
  signInTitle: "Sign in",
  signInIntro: "We'll email you a link that signs you in. There's no password to remember.",
  email: "Email",
  emailHint: "The address you gave the garden when you joined.",
  emailError: "Enter an email address, like name@example.com.",
  sendLink: "Send me a link",
  linkSent: (email: string) => `We've sent a link to ${email}. It works for 15 minutes.`,
  emailUse: "We only use your email for your plot and the garden's news.",
};

export const ar: typeof en = {
  appName: "بستان",
  home: "بستان، الصفحة الرئيسية",
  mainNav: "الرئيسية",
  navPlots: "القطع",
  navHarvest: "سجل الحصاد",
  signIn: "تسجيل الدخول",
  back: "العودة إلى القطع",
  plotsTitle: "قطع للحجز",
  plotsIntro: "ستة أحواض مرتفعة خلف المدرسة القديمة يتشاركها أهل الحي. احجز قطعة متاحة وتصبح لك طوال الموسم، مع الأدوات والماء.",
  freeCount: (free: string, all: string) => `${free} من ${all} قطع متاحة هذا الموسم`,
  plotNumber: (n: string) => `القطعة ${n}`,
  size: (m: string) => `${m} م²`,
  perSeason: (fee: string) => `${fee} للموسم`,
  lightFull: "شمس كاملة",
  lightPart: "ظل جزئي",
  lightShade: "ظل",
  statusFree: "متاحة",
  statusWaiting: "قائمة انتظار",
  statusBooked: "محجوزة",
  aboutPlot: "عن هذه القطعة",
  sizeLabel: "المساحة",
  lightLabel: "الضوء",
  waterLabel: "الماء",
  soilLabel: "التربة",
  lastSeasonLabel: "زُرع هنا الموسم الماضي",
  plotIntro: "مع كل قطعة مفتاح للمخزن ومرشّة ماء ونصيب من السماد.",
  bookPlot: "احجز هذه القطعة",
  joinWaitingList: "انضم إلى قائمة الانتظار",
  askTeam: "اسأل فريق البستان",
  bookedByOther: "هناك من يزرع هنا هذا الموسم. اسأل الفريق عن الموسم القادم.",
  bookedNote: (name: string, until: string) => `قطعة «${name}» لك حتى ${until}.`,
  bookedHint: "مفتاحك في صندوق المخزن، وأرسلنا رمزه إلى بريدك.",
  waitingNote: "أنت على قائمة الانتظار. سنكتب لك حين تتاح القطعة.",
  plotMissing: "لم نجد هذه القطعة",
  plotMissingHint: "ربما ضُمّت إلى جارتها. كل القطع الموجودة اليوم في القائمة.",
  seePlots: "اعرض القطع",
  harvestTitle: "سجل الحصاد",
  harvestIntro: "زِن ما تقطفه على ميزان المخزن ثم أضفه هنا. يشارك البستان مجموع الجميع في يوم البستان المفتوح.",
  addHarvest: "أضف حصادًا",
  crop: "المحصول",
  chooseCrop: "اختر محصولًا",
  cropError: "اختر ما قطفته.",
  weight: "الوزن بالكيلوغرام",
  weightHint: "لأقرب ٠٫١ كغ، كما يظهر على الميزان.",
  weightError: "أدخل وزنًا من ٠٫١ إلى ٥٠ كغ.",
  addToLog: "أضف إلى السجل",
  thisSeason: "هذا الموسم",
  seasonTotal: (kg: string) => `${kg} في المجموع`,
  logEmpty: "لم يُسجَّل شيء بعد",
  logEmptyHint: "يظهر هنا أول حصاد لك، مع مجموع الموسم.",
  pageMissing: "لا توجد صفحة هنا",
  pageMissingHint: "ربما الرابط قديم. القطع وسجل الحصاد على بعد نقرة.",
  signInTitle: "تسجيل الدخول",
  signInIntro: "سنرسل إلى بريدك رابطًا يُدخلك. لا كلمة مرور لتتذكرها.",
  email: "البريد الإلكتروني",
  emailHint: "العنوان الذي أعطيته للبستان حين انضممت.",
  emailError: "أدخل عنوان بريد، مثل name@example.com.",
  sendLink: "أرسل لي رابطًا",
  linkSent: (email: string) => `أرسلنا رابطًا إلى ${email}. يعمل لمدة ١٥ دقيقة.`,
  emailUse: "نستخدم بريدك لقطعتك وأخبار البستان فقط.",
};

export const strings = locale === "ar" ? ar : en;

/** Intl's locale for numbers and dates: Arabic-Indic digits in Arabic, as the words above write them. */
const intlLocale = locale === "ar" ? "ar-u-nu-arab" : "en-GB";

/** A text from the data, in the page's language. */
export const words = (w: Words): string => w[locale];

/** A number as the page's language writes it (Arabic-Indic digits in Arabic). */
export const number = (n: number, options?: Intl.NumberFormatOptions): string => new Intl.NumberFormat(intlLocale, options).format(n);

/** A weight in kilograms, to one decimal place. */
export const kilograms = (kg: number): string => number(kg, { style: "unit", unit: "kilogram", maximumFractionDigits: 1 });

/** A plot's fee for the season, in Kuwaiti dinars. */
export const dinars = (amount: number): string => number(amount, { style: "currency", currency: "KWD", maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** A day of the year, such as "30 November". */
export const day = (date: Date): string => new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long" }).format(date);
