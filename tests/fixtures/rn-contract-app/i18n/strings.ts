import { I18nManager, Platform } from "react-native";

export const en = {
  shopName: "Dukkan",
  shopIntro: "Your corner shop. Order now, collect in 20 minutes.",
  onTheShelves: "On the shelves",
  signIn: "Sign in",
  basket: "Basket",
  basketWith: (count: number) => (count === 1 ? "Basket, 1 item" : `Basket, ${count} items`),
  back: "Back",
  addToBasket: "Add to basket",
  addNamed: (name: string) => `Add ${name} to basket`,
  inStock: "In stock",
  lowStock: "Only a few left",
  soldOut: "Sold out",
  fewer: (name: string) => `One fewer ${name}`,
  more: (name: string) => `One more ${name}`,
  inBasket: (count: number) => `${count} in your basket`,
  productMissing: "We can't find that product.",
  backToShop: "Back to the shop",
  basketEmpty: "Your basket is empty.",
  basketEmptyHint: "Add what you need from the shelves and it will wait here.",
  browseShop: "Browse the shop",
  total: "Total",
  placeOrder: "Place order",
  signInToOrder: "Sign in to place your order",
  orderPlaced: "Thank you. Your order will be ready to collect in 20 minutes.",
  loadFailed: "We couldn't load the shelves.",
  tryAgain: "Try again",
  loadingShelves: "Loading the shelves",
  signInTitle: "Sign in",
  signInIntro: "Sign in with your phone number to place orders and see them again.",
  phone: "Phone number",
  phoneHelper: "The shop calls this number if something you ordered has run out.",
  phoneError: "Enter a phone number of 8 digits.",
  continueLabel: "Continue",
  phoneUse: "We use your number only for your orders.",
};

export const ar: typeof en = {
  shopName: "دكان",
  shopIntro: "دكان الحي. اطلب الآن واستلم بعد ٢٠ دقيقة.",
  onTheShelves: "على الرفوف",
  signIn: "تسجيل الدخول",
  basket: "السلة",
  // Arabic counts: one, two (the dual), 3 to 10, and 11 and up.
  basketWith: (count: number) =>
    count === 1 ? "السلة، غرض واحد" : count === 2 ? "السلة، غرضان" : count <= 10 ? `السلة، ${count} أغراض` : `السلة، ${count} غرضًا`,
  back: "رجوع",
  addToBasket: "أضف إلى السلة",
  addNamed: (name: string) => `أضف ${name} إلى السلة`,
  inStock: "متوفر",
  lowStock: "بقي القليل",
  soldOut: "نفد",
  fewer: (name: string) => `واحد أقل من ${name}`,
  more: (name: string) => `واحد أكثر من ${name}`,
  inBasket: (count: number) => `${count} في سلتك`,
  productMissing: "لم نجد هذا المنتج.",
  backToShop: "العودة إلى الدكان",
  basketEmpty: "سلتك فارغة.",
  basketEmptyHint: "أضف ما تحتاجه من الرفوف وسينتظرك هنا.",
  browseShop: "تصفح الدكان",
  total: "المجموع",
  placeOrder: "أرسل الطلب",
  signInToOrder: "سجّل الدخول لإرسال طلبك",
  orderPlaced: "شكرًا لك. سيكون طلبك جاهزًا للاستلام بعد ٢٠ دقيقة.",
  loadFailed: "لم نتمكن من تحميل الرفوف.",
  tryAgain: "حاول مرة أخرى",
  loadingShelves: "جارٍ تحميل الرفوف",
  signInTitle: "تسجيل الدخول",
  signInIntro: "سجّل الدخول برقم هاتفك لترسل الطلبات وتراها لاحقًا.",
  phone: "رقم الهاتف",
  phoneHelper: "يتصل بك الدكان على هذا الرقم إذا نفد شيء طلبته.",
  phoneError: "أدخل رقم هاتف من ٨ أرقام.",
  continueLabel: "متابعة",
  phoneUse: "نستخدم رقمك لطلباتك فقط.",
};

function language(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]!.toLowerCase();
  } catch {
    return "en";
  }
}

export const locale = language() === "ar" ? "ar" : "en";
export const strings = locale === "ar" ? ar : en;
/** Arabic reads right to left; icons that point (back, forward) flip with it. */
export const rtl = locale === "ar";

// Right to left on the phone; the web target doesn't follow I18nManager.
if (Platform.OS !== "web" && I18nManager.isRTL !== rtl) {
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}
